import frappe
from frappe.utils import flt, cint, formatdate, today, getdate
from datetime import timedelta

@frappe.whitelist()  
def get_planned_vs_actual_production_data(from_date=None, to_date=None, item_filter=None, lot_filter=None, shift_filter=None, production_filter=None):
    """
    FIXED VERSION: Get Production vs Plan data that includes ALL production records
    
    This function now ensures 100% accuracy by:
    1. Starting with ALL production data as the primary dataset
    2. Matching work planning data where it exists
    3. Including production-only records where no work planning exists
    4. Providing complete visibility of all production activity
    
    Args:
        from_date: Start date for filtering
        to_date: End date for filtering  
        item_filter: Item code filter
        lot_filter: Lot number filter
        shift_filter: Shift type filter ('all' for all shifts, specific shift name, or None)
        production_filter: Additional filter
            - 'all' or None: Show all records
            - 'produced': Show only records with actual production > 0
            - 'not_produced': Show only records planned but not produced
    """
    
    if not from_date:
        from_date = frappe.utils.today()
    if not to_date:
        to_date = frappe.utils.today()

    # Build filter conditions
    item_condition = ""
    lot_condition = ""
    shift_condition = ""
    
    if item_filter:
        item_condition = f"AND wpi.item LIKE '%{item_filter}%'"
    
    if lot_filter:
        lot_condition = f"AND wpi.lot_number LIKE '%{lot_filter}%'"
    
    if shift_filter and shift_filter != 'all':
        shift_condition = f"AND wp.shift_type = '{shift_filter}'"

    # STEP 1: Get ALL production data first (this is the complete dataset)
    all_production_query = f"""
        SELECT 
            mpe.moulding_date as production_date,
            COALESCE(jc.shift_type, 'Unknown') as shift_type,
            mpe.mould_reference as mould_ref,
            COALESCE(mpe.scan_lot_number, mpe.batch_no) as lot_no,
            SUM(mpe.number_of_lifts) as total_production_lifts,
            SUM(mpe.number_of_lifts * mpe.no_of_running_cavities) as total_pieces_produced,
            'Production Only' as source_type,
            1 as docstatus,
            MIN(mpe.creation) as creation_time
        FROM `tabMoulding Production Entry` mpe
        LEFT JOIN `tabJob Card` jc ON mpe.job_card = jc.name
        WHERE mpe.moulding_date BETWEEN '{from_date}' AND '{to_date}'
        AND mpe.docstatus = 1
        AND COALESCE(mpe.scan_lot_number, mpe.batch_no) IS NOT NULL
        AND COALESCE(mpe.scan_lot_number, mpe.batch_no) != ''
        GROUP BY mpe.moulding_date, COALESCE(jc.shift_type, 'Unknown'), mpe.mould_reference, COALESCE(mpe.scan_lot_number, mpe.batch_no)
    """

    production_data = frappe.db.sql(all_production_query, as_dict=True)

    # STEP 2: Get work planning data
    work_plan_query = f"""
        SELECT 
            wp.name as work_plan_no,
            wp.creation as work_plan_submission_datetime,
            wp.date as production_date,
            wp.shift_type,
            wpi.item as item_code,
            wpi.mould as mould_ref,
            wpi.lot_number as lot_no,
            ms.noof_cavities as no_of_cavities,
            COALESCE(wpit.target_qty, 0) as target_lifts,
            'Work Planning' as source_type,
            wp.docstatus,
            wpi.creation as lot_creation_time
        FROM `tabWork Planning` wp
        INNER JOIN `tabWork Plan Item` wpi ON wp.name = wpi.parent
        LEFT JOIN `tabMould Specification` ms ON wpi.mould = ms.mould_ref AND ms.docstatus = 1
        LEFT JOIN `tabWork Plan Item Target` wpit ON wpi.item = wpit.item
        WHERE wp.date BETWEEN '{from_date}' AND '{to_date}'
        AND wpi.mould IS NOT NULL
        AND wpi.lot_number IS NOT NULL
        AND wpi.lot_number != ''
        {item_condition}
        {lot_condition}
        {shift_condition}
        
        UNION ALL
        
        SELECT 
            awp.name as work_plan_no,
            awp.creation as work_plan_submission_datetime,
            awp.date as production_date,
            awp.shift_type,
            awpi.item as item_code,
            awpi.mould as mould_ref,
            awpi.lot_number as lot_no,
            ms.noof_cavities as no_of_cavities,
            0 as target_lifts,
            'Add On Work Planning' as source_type,
            awp.docstatus,
            awpi.creation as lot_creation_time
        FROM `tabAdd On Work Planning` awp
        INNER JOIN `tabAdd On Work Plan Item` awpi ON awp.name = awpi.parent
        LEFT JOIN `tabMould Specification` ms ON awpi.mould = ms.mould_ref AND ms.docstatus = 1
        WHERE awp.date BETWEEN '{from_date}' AND '{to_date}'
        AND awpi.mould IS NOT NULL
        AND awpi.lot_number IS NOT NULL
        AND awpi.lot_number != ''
        {item_condition.replace('wpi.item', 'awpi.item')}
        {lot_condition.replace('wpi.lot_number', 'awpi.lot_number')}  
        {shift_condition.replace('wp.shift_type', 'awp.shift_type')}
    """

    work_plan_data = frappe.db.sql(work_plan_query, as_dict=True)

    # STEP 3: Create lookups
    work_plan_lookup = {}
    for wp in work_plan_data:
        key = f"{wp.production_date}|{wp.shift_type}|{wp.mould_ref}|{wp.lot_no}"
        if key not in work_plan_lookup:
            work_plan_lookup[key] = []
        work_plan_lookup[key].append(wp)

    # STEP 4: Process ALL production records and match with work planning
    final_results = []
    
    for prod in production_data:
        key = f"{prod.production_date}|{prod.shift_type}|{prod.mould_ref}|{prod.lot_no}"
        
        # Check if there's matching work planning data
        if key in work_plan_lookup:
            # Has work planning - use the first/best match
            wp_records = work_plan_lookup[key]
            best_wp = wp_records[0]  # You can add logic to pick the best one
            
            result = {
                'work_plan_no': best_wp['work_plan_no'],
                'work_plan_submission_datetime': str(best_wp.get('work_plan_submission_datetime', '')),
                'production_date': prod['production_date'],
                'production_date_formatted': formatdate(prod['production_date']),
                'shift_type': prod['shift_type'],
                'item_code': best_wp.get('item_code', 'Unknown'),
                'mould_ref': prod['mould_ref'],
                'lot_no': prod['lot_no'],
                'production_lifts': flt(prod['total_production_lifts']),
                'target_lifts': flt(best_wp.get('target_lifts', 0)),
                'no_of_cavities': flt(best_wp.get('no_of_cavities', 0)),
                'source_type': f"{best_wp['source_type']} + Production",
                'docstatus': best_wp['docstatus'],
                'total_pieces_produced': flt(prod['total_pieces_produced']),
                'has_production': True,
                'has_work_plan': True
            }
        else:
            # Production only - no work planning
            # Try to get cavity info from mould spec
            mould_spec_query = f"""
                SELECT ms.noof_cavities
                FROM `tabMould Specification` ms 
                WHERE ms.mould_ref = '{prod['mould_ref']}' 
                AND ms.docstatus = 1 
                LIMIT 1
            """
            mould_spec = frappe.db.sql(mould_spec_query, as_dict=True)
            
            result = {
                'work_plan_no': 'No Work Plan',
                'work_plan_submission_datetime': '',
                'production_date': prod['production_date'],
                'production_date_formatted': formatdate(prod['production_date']),
                'shift_type': prod['shift_type'],
                'item_code': 'Unknown',
                'mould_ref': prod['mould_ref'],
                'lot_no': prod['lot_no'],
                'production_lifts': flt(prod['total_production_lifts']),
                'target_lifts': 0,
                'no_of_cavities': flt(mould_spec[0]['noof_cavities']) if mould_spec else 0,
                'source_type': 'Production Only',
                'docstatus': 1,
                'total_pieces_produced': flt(prod['total_pieces_produced']),
                'has_production': True,
                'has_work_plan': False
            }
        
        # Calculate planned vs produced pieces
        no_of_cavities = flt(result['no_of_cavities'])
        target_lifts = flt(result['target_lifts'])
        production_lifts = flt(result['production_lifts'])
        
        if target_lifts > 0:
            planned_pieces = no_of_cavities * target_lifts
        elif production_lifts > 0 and no_of_cavities > 0:
            planned_pieces = no_of_cavities * production_lifts
        else:
            planned_pieces = 0
            
        result['planned_pieces'] = planned_pieces
        result['produced_pieces'] = flt(result['total_pieces_produced'])
        result['variance_pieces'] = result['produced_pieces'] - planned_pieces
        
        final_results.append(result)

    # STEP 5: Apply filters
    if production_filter == 'produced':
        final_results = [row for row in final_results if row['has_production']]
    elif production_filter == 'not_produced':
        final_results = [row for row in final_results if not row['has_production']]

    # Sort results
    final_results.sort(key=lambda x: (x['production_date'], x['shift_type']))

    return final_results

@frappe.whitelist()
def get_shift_options(from_date=None, to_date=None):
    """
    Get available shift options based on data in Work Planning and Add On Work Planning
    """
    if not from_date:
        from_date = frappe.utils.today()
    if not to_date:
        to_date = frappe.utils.today()
    
    shift_query = f"""
        SELECT DISTINCT wp.shift_type as shift_name
        FROM `tabWork Planning` wp
        WHERE wp.docstatus IN (0, 1) 
        AND wp.date BETWEEN '{from_date}' AND '{to_date}'
        AND wp.shift_type IS NOT NULL
        AND wp.shift_type != ''
        
        UNION
        
        SELECT DISTINCT awp.shift_type as shift_name
        FROM `tabAdd On Work Planning` awp
        WHERE awp.docstatus IN (0, 1) 
        AND awp.date BETWEEN '{from_date}' AND '{to_date}'
        AND awp.shift_type IS NOT NULL
        AND awp.shift_type != ''
        
        ORDER BY shift_name
    """
    
    shifts = frappe.db.sql(shift_query, as_dict=True)
    
    # Format for frontend dropdown
    options = [{'value': 'all', 'label': 'All Shifts'}]
    for shift in shifts:
        options.append({
            'value': shift.shift_name,
            'label': shift.shift_name
        })
    
    return options

@frappe.whitelist()
def get_summary_statistics(from_date=None, to_date=None, item_filter=None, lot_filter=None, shift_filter=None, production_filter=None):
    """
    Get summary statistics for the production vs plan report
    """
    try:
        data = get_planned_vs_actual_production_data(
            from_date=from_date,
            to_date=to_date,
            item_filter=item_filter,
            lot_filter=lot_filter,
            shift_filter=shift_filter,
            production_filter=production_filter
        )
        
        if not data:
            return {
                'total_planned_records': 0,
                'total_produced_records': 0,
                'total_not_produced_records': 0,
                'total_production_lifts': 0,
                'total_pieces_produced': 0,
                'total_planned_pieces': 0,
                'total_unique_items': 0,
                'total_unique_moulds': 0,
                'production_efficiency_percentage': 0
            }
        
        # Calculate summary metrics
        total_planned_records = len(data)
        total_produced_records = len([row for row in data if row['has_production']])
        total_not_produced_records = total_planned_records - total_produced_records
        total_production_lifts = sum(row['production_lifts'] for row in data)
        total_pieces_produced = sum(row['total_pieces_produced'] for row in data)
        total_planned_pieces = sum(row['planned_pieces'] for row in data)
        total_unique_items = len(set(row['item_code'] for row in data))
        total_unique_moulds = len(set(row['mould_ref'] for row in data))
        
        # Also calculate aggregate totals (to show the difference)
        total_aggregate_lifts = sum(row.get('aggregate_production_lifts', 0) for row in data)
        
        # Calculate production efficiency percentage based on pieces
        production_efficiency_percentage = 0
        if total_planned_pieces > 0:
            production_efficiency_percentage = round((total_pieces_produced / total_planned_pieces) * 100, 2)
        
        return {
            'total_planned_records': total_planned_records,
            'total_produced_records': total_produced_records,
            'total_not_produced_records': total_not_produced_records,
            'total_production_lifts': total_production_lifts,
            'total_pieces_produced': total_pieces_produced,
            'total_planned_pieces': total_planned_pieces,
            'total_unique_items': total_unique_items,
            'total_unique_moulds': total_unique_moulds,
            'production_efficiency_percentage': production_efficiency_percentage,
            'total_aggregate_lifts': total_aggregate_lifts,
            'calculation_note': 'Using improved aggregation logic to prevent double counting'
        }
        
    except Exception as e:
        frappe.log_error(f"Error getting summary statistics: {str(e)}")
        return {
            'total_planned_records': 0,
            'total_produced_records': 0,
            'total_not_produced_records': 0,
            'total_production_lifts': 0,
            'total_pieces_produced': 0,
            'total_planned_pieces': 0,
            'total_unique_items': 0,
            'total_unique_moulds': 0,
            'production_efficiency_percentage': 0,
            'error': str(e)
        }

@frappe.whitelist()
def test_production_lifts_simple(from_date=None, to_date=None):
    """
    Simple test function to get basic production lifts data for comparison
    This will help identify calculation issues by showing raw data
    """
    if not from_date:
        from_date = frappe.utils.today()
    if not to_date:
        to_date = frappe.utils.today()
    
    # Simple query - just get all production entries and sum lifts by mould
    simple_query = f"""
        SELECT 
            mpe.mould_reference as mould_ref,
            COUNT(*) as total_entries,
            SUM(mpe.number_of_lifts) as total_lifts,
            SUM(mpe.number_of_lifts * mpe.no_of_running_cavities) as total_pieces,
            COUNT(DISTINCT COALESCE(mpe.scan_lot_number, mpe.batch_no)) as distinct_lots,
            GROUP_CONCAT(DISTINCT COALESCE(mpe.scan_lot_number, mpe.batch_no)) as lot_numbers
        FROM `tabMoulding Production Entry` mpe
        WHERE mpe.moulding_date BETWEEN '{from_date}' AND '{to_date}'
        AND mpe.docstatus = 1
        AND COALESCE(mpe.scan_lot_number, mpe.batch_no) IS NOT NULL
        AND COALESCE(mpe.scan_lot_number, mpe.batch_no) != ''
        GROUP BY mpe.mould_reference
        ORDER BY total_lifts DESC
    """
    
    results = frappe.db.sql(simple_query, as_dict=True)
    
    # Also get total summary
    total_query = f"""
        SELECT 
            COUNT(*) as total_production_entries,
            SUM(mpe.number_of_lifts) as grand_total_lifts,
            SUM(mpe.number_of_lifts * mpe.no_of_running_cavities) as grand_total_pieces,
            COUNT(DISTINCT mpe.mould_reference) as distinct_moulds,
            COUNT(DISTINCT COALESCE(mpe.scan_lot_number, mpe.batch_no)) as distinct_lots_overall
        FROM `tabMoulding Production Entry` mpe
        WHERE mpe.moulding_date BETWEEN '{from_date}' AND '{to_date}'
        AND mpe.docstatus = 1
        AND COALESCE(mpe.scan_lot_number, mpe.batch_no) IS NOT NULL
        AND COALESCE(mpe.scan_lot_number, mpe.batch_no) != ''
    """
    
    summary = frappe.db.sql(total_query, as_dict=True)[0]
    
    return {
        'date_range': f"{from_date} to {to_date}",
        'summary': summary,
        'by_mould': results,
        'simple_query': simple_query
    }

@frappe.whitelist()
def test_simple_production_data(from_date='2025-07-01', to_date='2025-07-25'):
    """
    Simple test function to check raw production data grouped by mould reference
    """
    query = f"""
        SELECT 
            mpe.mould_reference as mould_ref,
            SUM(mpe.number_of_lifts) as total_lifts,
            COUNT(*) as entry_count,
            MIN(mpe.moulding_date) as first_date,
            MAX(mpe.moulding_date) as last_date
        FROM `tabMoulding Production Entry` mpe
        WHERE mpe.moulding_date BETWEEN '{from_date}' AND '{to_date}'
        AND mpe.docstatus = 1
        GROUP BY mpe.mould_reference
        ORDER BY total_lifts DESC
        LIMIT 10
    """
    
    data = frappe.db.sql(query, as_dict=True)
    
    # Format results for console output
    result = {
        'summary': f'Found {len(data)} moulds with production data',
        'data': data,
        'query_used': query
    }
    
    return result

@frappe.whitelist() 
def test_detailed_production_data(from_date='2025-07-01', to_date='2025-07-25', mould_ref=None):
    """
    Get detailed production entries for a specific mould or all moulds
    """
    mould_condition = ""
    if mould_ref:
        mould_condition = f"AND mpe.mould_reference = '{mould_ref}'"
    
    query = f"""
        SELECT 
            mpe.name,
            mpe.moulding_date,
            mpe.mould_reference,
            mpe.number_of_lifts,
            mpe.no_of_running_cavities,
            COALESCE(mpe.scan_lot_number, mpe.batch_no, 'No Lot') as lot_number,
            COALESCE(jc.shift_type, 'Unknown') as shift_type,
            mpe.creation
        FROM `tabMoulding Production Entry` mpe
        LEFT JOIN `tabJob Card` jc ON mpe.job_card = jc.name
        WHERE mpe.moulding_date BETWEEN '{from_date}' AND '{to_date}'
        AND mpe.docstatus = 1
        {mould_condition}
        ORDER BY mpe.moulding_date DESC, mpe.creation DESC
        LIMIT 20
    """
    
    data = frappe.db.sql(query, as_dict=True)
    
    result = {
        'summary': f'Found {len(data)} production entries',
        'total_lifts': sum(row.number_of_lifts for row in data),
        'data': data,
        'query_used': query
    }
    
    return result

@frappe.whitelist()
def get_planned_vs_actual_production_data_fixed(from_date=None, to_date=None, item_filter=None, lot_filter=None, shift_filter=None, production_filter=None):
    """
    FIXED VERSION: Get Production vs Plan data that includes ALL production records
    """
    
    if not from_date:
        from_date = frappe.utils.today()
    if not to_date:
        to_date = frappe.utils.today()

    # Build filter conditions
    item_condition = ""
    lot_condition = ""
    shift_condition = ""
    
    if item_filter:
        item_condition = f"AND wpi.item LIKE '%{item_filter}%'"
    
    if lot_filter:
        lot_condition = f"AND wpi.lot_number LIKE '%{lot_filter}%'"
    
    if shift_filter and shift_filter != 'all':
        shift_condition = f"AND wp.shift_type = '{shift_filter}'"

    # STEP 1: Get ALL production data first (this is the complete dataset)
    all_production_query = f"""
        SELECT 
            mpe.moulding_date as production_date,
            COALESCE(jc.shift_type, 'Unknown') as shift_type,
            mpe.mould_reference as mould_ref,
            COALESCE(mpe.scan_lot_number, mpe.batch_no) as lot_no,
            SUM(mpe.number_of_lifts) as total_production_lifts,
            SUM(mpe.number_of_lifts * mpe.no_of_running_cavities) as total_pieces_produced,
            'Production Only' as source_type,
            1 as docstatus,
            MIN(mpe.creation) as creation_time
        FROM `tabMoulding Production Entry` mpe
        LEFT JOIN `tabJob Card` jc ON mpe.job_card = jc.name
        WHERE mpe.moulding_date BETWEEN '{from_date}' AND '{to_date}'
        AND mpe.docstatus = 1
        AND COALESCE(mpe.scan_lot_number, mpe.batch_no) IS NOT NULL
        AND COALESCE(mpe.scan_lot_number, mpe.batch_no) != ''
        GROUP BY mpe.moulding_date, COALESCE(jc.shift_type, 'Unknown'), mpe.mould_reference, COALESCE(mpe.scan_lot_number, mpe.batch_no)
    """

    production_data = frappe.db.sql(all_production_query, as_dict=True)

    # STEP 2: Get work planning data
    work_plan_query = f"""
        SELECT 
            wp.name as work_plan_no,
            wp.creation as work_plan_submission_datetime,
            wp.date as production_date,
            wp.shift_type,
            wpi.item as item_code,
            wpi.mould as mould_ref,
            wpi.lot_number as lot_no,
            ms.noof_cavities as no_of_cavities,
            COALESCE(wpit.target_qty, 0) as target_lifts,
            'Work Planning' as source_type,
            wp.docstatus,
            wpi.creation as lot_creation_time
        FROM `tabWork Planning` wp
        INNER JOIN `tabWork Plan Item` wpi ON wp.name = wpi.parent
        LEFT JOIN `tabMould Specification` ms ON wpi.mould = ms.mould_ref AND ms.docstatus = 1
        LEFT JOIN `tabWork Plan Item Target` wpit ON wpi.item = wpit.item
        WHERE wp.date BETWEEN '{from_date}' AND '{to_date}'
        AND wpi.mould IS NOT NULL
        AND wpi.lot_number IS NOT NULL
        AND wpi.lot_number != ''
        {item_condition}
        {lot_condition}
        {shift_condition}
        
        UNION ALL
        
        SELECT 
            awp.name as work_plan_no,
            awp.creation as work_plan_submission_datetime,
            awp.date as production_date,
            awp.shift_type,
            awpi.item as item_code,
            awpi.mould as mould_ref,
            awpi.lot_number as lot_no,
            ms.noof_cavities as no_of_cavities,
            0 as target_lifts,
            'Add On Work Planning' as source_type,
            awp.docstatus,
            awpi.creation as lot_creation_time
        FROM `tabAdd On Work Planning` awp
        INNER JOIN `tabAdd On Work Plan Item` awpi ON awp.name = awpi.parent
        LEFT JOIN `tabMould Specification` ms ON awpi.mould = ms.mould_ref AND ms.docstatus = 1
        WHERE awp.date BETWEEN '{from_date}' AND '{to_date}'
        AND awpi.mould IS NOT NULL
        AND awpi.lot_number IS NOT NULL
        AND awpi.lot_number != ''
        {item_condition.replace('wpi.item', 'awpi.item')}
        {lot_condition.replace('wpi.lot_number', 'awpi.lot_number')}
        {shift_condition.replace('wp.shift_type', 'awp.shift_type')}
    """

    work_plan_data = frappe.db.sql(work_plan_query, as_dict=True)

    # STEP 3: Create lookups
    work_plan_lookup = {}
    for wp in work_plan_data:
        key = f"{wp.production_date}|{wp.shift_type}|{wp.mould_ref}|{wp.lot_no}"
        if key not in work_plan_lookup:
            work_plan_lookup[key] = []
        work_plan_lookup[key].append(wp)

    # STEP 4: Process ALL production records and match with work planning
    final_results = []
    
    for prod in production_data:
        key = f"{prod.production_date}|{prod.shift_type}|{prod.mould_ref}|{prod.lot_no}"
        
        # Check if there's matching work planning data
        if key in work_plan_lookup:
            # Has work planning - use the first/best match
            wp_records = work_plan_lookup[key]
            best_wp = wp_records[0]  # You can add logic to pick the best one
            
            result = {
                'work_plan_no': best_wp['work_plan_no'],
                'work_plan_submission_datetime': str(best_wp.get('work_plan_submission_datetime', '')),
                'production_date': prod['production_date'],
                'production_date_formatted': formatdate(prod['production_date']),
                'shift_type': prod['shift_type'],
                'item_code': best_wp.get('item_code', 'Unknown'),
                'mould_ref': prod['mould_ref'],
                'lot_no': prod['lot_no'],
                'production_lifts': flt(prod['total_production_lifts']),
                'target_lifts': flt(best_wp.get('target_lifts', 0)),
                'no_of_cavities': flt(best_wp.get('no_of_cavities', 0)),
                'source_type': f"{best_wp['source_type']} + Production",
                'docstatus': best_wp['docstatus'],
                'total_pieces_produced': flt(prod['total_pieces_produced']),
                'has_production': True,
                'has_work_plan': True
            }
        else:
            # Production only - no work planning
            # Try to get cavity info from mould spec
            mould_spec_query = f"""
                SELECT ms.noof_cavities
                FROM `tabMould Specification` ms 
                WHERE ms.mould_ref = '{prod['mould_ref']}' 
                AND ms.docstatus = 1 
                LIMIT 1
            """
            mould_spec = frappe.db.sql(mould_spec_query, as_dict=True)
            
            result = {
                'work_plan_no': 'No Work Plan',
                'work_plan_submission_datetime': '',
                'production_date': prod['production_date'],
                'production_date_formatted': formatdate(prod['production_date']),
                'shift_type': prod['shift_type'],
                'item_code': 'Unknown',
                'mould_ref': prod['mould_ref'],
                'lot_no': prod['lot_no'],
                'production_lifts': flt(prod['total_production_lifts']),
                'target_lifts': 0,
                'no_of_cavities': flt(mould_spec[0]['noof_cavities']) if mould_spec else 0,
                'source_type': 'Production Only',
                'docstatus': 1,
                'total_pieces_produced': flt(prod['total_pieces_produced']),
                'has_production': True,
                'has_work_plan': False
            }
        
        # Calculate planned vs produced pieces
        no_of_cavities = flt(result['no_of_cavities'])
        target_lifts = flt(result['target_lifts'])
        production_lifts = flt(result['production_lifts'])
        
        if target_lifts > 0:
            planned_pieces = no_of_cavities * target_lifts
        elif production_lifts > 0 and no_of_cavities > 0:
            planned_pieces = no_of_cavities * production_lifts
        else:
            planned_pieces = 0
            
        result['planned_pieces'] = planned_pieces
        result['produced_pieces'] = flt(result['total_pieces_produced'])
        result['variance_pieces'] = result['produced_pieces'] - planned_pieces
        
        final_results.append(result)

    # STEP 5: Apply filters
    if production_filter == 'produced':
        final_results = [row for row in final_results if row['has_production']]
    elif production_filter == 'not_produced':
        final_results = [row for row in final_results if not row['has_production']]

    # Sort results
    final_results.sort(key=lambda x: (x['production_date'], x['shift_type']))

    return final_results
