import frappe
from frappe.utils import flt, cint, formatdate, today, getdate
from datetime import timedelta

@frappe.whitelist()
def get_planned_vs_actual_production_data(from_date=None, to_date=None, item_filter=None, lot_filter=None, shift_filter=None, production_filter=None):
    """
    Get Production vs Plan data according to new requirements:
    
    Table A: Get columns for date range with filters:
    1. Work Plan No.
    2. Work Plan Submission Date / Time  
    3. Production Date
    4. Shift Type
    5. Item Code
    6. Mould Ref
    7. Lot No.
    8. Production Lifts (submitted values only)
    9. No. of cavities (from mould spec list)
    
    Table B: Get unique list of Production Date, Shift Type, Mould Ref
    
    Selection Rules:
    - If only one lot no for unique key, get that
    - If multiple lots, get the one with production lift entry
    - If no production entry but multiple work plans, choose last created lot
    
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

    # STEP 1: Get Table A - All work planning data with required columns
    table_a_query = f"""
        SELECT 
            wp.name as work_plan_no,
            wp.creation as work_plan_submission_datetime,
            wp.date as production_date,
            wp.shift_type,
            wpi.item as item_code,
            wpi.mould as mould_ref,
            wpi.lot_number as lot_no,
            0 as production_lifts,  -- Will be filled from production entries
            ms.noof_cavities as no_of_cavities,
            'Work Planning' as source_type,
            wp.docstatus,
            wpi.creation as lot_creation_time
        FROM `tabWork Planning` wp
        INNER JOIN `tabWork Plan Item` wpi ON wp.name = wpi.parent
        LEFT JOIN `tabMould Specification` ms ON wpi.mould = ms.mould_ref AND ms.docstatus = 1
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
            0 as production_lifts,  -- Will be filled from production entries
            ms.noof_cavities as no_of_cavities,
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
        
        ORDER BY production_date, shift_type, mould_ref, lot_creation_time DESC
    """

    table_a_data = frappe.db.sql(table_a_query, as_dict=True)

    # STEP 2: Get production lifts data (submitted values only)
    production_lifts_query = f"""
        SELECT 
            mpe.moulding_date as production_date,
            mpe.shift_type,
            mpe.mould_ref,
            COALESCE(mpe.scan_lot_number, mpe.batch_no) as lot_no,
            SUM(mpe.number_of_lifts) as total_production_lifts,
            SUM(mpe.number_of_lifts * mpe.no_of_running_cavities) as total_pieces_produced
        FROM `tabMoulding Production Entry` mpe
        WHERE mpe.moulding_date BETWEEN '{from_date}' AND '{to_date}'
        AND mpe.docstatus = 1  -- Only submitted values
        AND COALESCE(mpe.scan_lot_number, mpe.batch_no) IS NOT NULL
        AND COALESCE(mpe.scan_lot_number, mpe.batch_no) != ''
        GROUP BY mpe.moulding_date, mpe.shift_type, mpe.mould_ref, COALESCE(mpe.scan_lot_number, mpe.batch_no)
    """

    production_data = frappe.db.sql(production_lifts_query, as_dict=True)

    # Create a lookup dictionary for production data
    production_lookup = {}
    for prod in production_data:
        key = f"{prod.production_date}|{prod.shift_type}|{prod.mould_ref}|{prod.lot_no}"
        production_lookup[key] = prod

    # STEP 3: Apply selection rules to get Table B (unique combinations) with selected lot data
    # Group Table A by Production Date, Shift Type, Mould Ref
    unique_combinations = {}
    
    for row in table_a_data:
        unique_key = f"{row.production_date}|{row.shift_type}|{row.mould_ref}"
        
        if unique_key not in unique_combinations:
            unique_combinations[unique_key] = []
        
        # Add production lifts data if available
        prod_key = f"{row.production_date}|{row.shift_type}|{row.mould_ref}|{row.lot_no}"
        if prod_key in production_lookup:
            row['production_lifts'] = production_lookup[prod_key]['total_production_lifts']
            row['total_pieces_produced'] = production_lookup[prod_key]['total_pieces_produced']
            row['has_production'] = True
        else:
            row['production_lifts'] = 0
            row['total_pieces_produced'] = 0
            row['has_production'] = False
            
        unique_combinations[unique_key].append(row)
            
            UNION ALL
            
            SELECT 
                awpi.item as item_code,
                awp.date as production_date,
                awp.shift_type,
                awpi.mould,
                awpi.lot_number,
                awpi.job_card,
                ms.noof_cavities,
                wpit.target_qty,
                CASE 
                    WHEN ms.noof_cavities IS NOT NULL AND wpit.target_qty IS NOT NULL 
                    THEN CAST(ms.noof_cavities AS FLOAT) * CAST(wpit.target_qty AS FLOAT)
                    ELSE 0
                END as planned_qty_pieces,
                'Add On Work Planning' as source_type,
                'job_card_relationship' as matching_method,
                awp.modified,
                ROW_NUMBER() OVER (
                    PARTITION BY awp.date, awp.shift_type, awpi.mould 
                    ORDER BY awp.modified DESC
                ) as rn
            FROM `tabAdd On Work Planning` awp
            INNER JOIN `tabAdd On Work Plan Item` awpi ON awp.name = awpi.parent
            LEFT JOIN `tabMould Specification` ms ON awpi.mould = ms.mould_ref AND ms.docstatus = 1
            LEFT JOIN `tabShift Type` st2 ON awp.shift_type = st2.name
            LEFT JOIN `tabWork Plan Item Target` wpit ON awpi.item = wpit.item AND TIME(st2.total_time) = wpit.shift_type
            WHERE awp.date BETWEEN '{from_date}' AND '{to_date}'
            AND (
                (awp.date < '{today_date}' {past_docstatus_condition_addon}) OR
                (awp.date >= '{today_date}' {future_docstatus_condition_addon})
            )
            AND awpi.lot_number IS NOT NULL
            AND awpi.job_card IS NOT NULL
            AND awpi.job_card != ''
            AND awpi.mould IS NOT NULL
            {item_condition.replace('wpi.item', 'awpi.item')}
            {lot_condition_planned.replace('wpi.lot_number', 'awpi.lot_number')}
            {shift_condition_addon}
        )
        SELECT 
            item_code, production_date, shift_type, mould, lot_number, job_card,
            noof_cavities, target_qty, planned_qty_pieces, source_type, matching_method
        FROM RankedPlans 
        WHERE rn = 1
    """

    # STEP 2: Get planned data WITHOUT proper relationships (fallback for incomplete data)
    planned_query_fallback = f"""
        WITH RankedFallbackPlans AS (
            SELECT 
                wpi.item as item_code,
                wp.date as production_date,
                wp.shift_type,
                wpi.mould,
                wpi.lot_number,
                NULL as job_card,
                ms.noof_cavities,
                wpit.target_qty,
                CASE 
                    WHEN ms.noof_cavities IS NOT NULL AND wpit.target_qty IS NOT NULL 
                    THEN CAST(ms.noof_cavities AS FLOAT) * CAST(wpit.target_qty AS FLOAT)
                    ELSE 0
                END as planned_qty_pieces,
                'Work Planning' as source_type,
                'date_item_matching' as matching_method,
                wp.modified,
                ROW_NUMBER() OVER (
                    PARTITION BY wp.date, wp.shift_type, wpi.mould 
                    ORDER BY wp.modified DESC
                ) as rn
            FROM `tabWork Planning` wp
            INNER JOIN `tabWork Plan Item` wpi ON wp.name = wpi.parent
            LEFT JOIN `tabMould Specification` ms ON wpi.mould = ms.mould_ref AND ms.docstatus = 1
            LEFT JOIN `tabShift Type` st ON wp.shift_type = st.name
            LEFT JOIN `tabWork Plan Item Target` wpit ON wpi.item = wpit.item AND TIME(st.total_time) = wpit.shift_type
            WHERE wp.date BETWEEN '{from_date}' AND '{to_date}'
            AND (
                (wp.date < '{today_date}' {past_docstatus_condition}) OR
                (wp.date >= '{today_date}' {future_docstatus_condition})
            )
            AND (wpi.lot_number IS NULL OR wpi.job_card IS NULL OR wpi.job_card = '')
            AND wpi.mould IS NOT NULL
            {item_condition}
            {lot_condition_planned}
            {shift_condition}
            
            UNION ALL
            
            SELECT 
                awpi.item as item_code,
                awp.date as production_date,
                awp.shift_type,
                awpi.mould,
                awpi.lot_number,
                NULL as job_card,
                ms.noof_cavities,
                wpit.target_qty,
                CASE 
                    WHEN ms.noof_cavities IS NOT NULL AND wpit.target_qty IS NOT NULL 
                    THEN CAST(ms.noof_cavities AS FLOAT) * CAST(wpit.target_qty AS FLOAT)
                    ELSE 0
                END as planned_qty_pieces,
                'Add On Work Planning' as source_type,
                'date_item_matching' as matching_method,
                awp.modified,
                ROW_NUMBER() OVER (
                    PARTITION BY awp.date, awp.shift_type, awpi.mould 
                    ORDER BY awp.modified DESC
                ) as rn
            FROM `tabAdd On Work Planning` awp
            INNER JOIN `tabAdd On Work Plan Item` awpi ON awp.name = awpi.parent
            LEFT JOIN `tabMould Specification` ms ON awpi.mould = ms.mould_ref AND ms.docstatus = 1
            LEFT JOIN `tabShift Type` st2 ON awp.shift_type = st2.name
            LEFT JOIN `tabWork Plan Item Target` wpit ON awpi.item = wpit.item AND TIME(st2.total_time) = wpit.shift_type
            WHERE awp.date BETWEEN '{from_date}' AND '{to_date}'
            AND (
                (awp.date < '{today_date}' {past_docstatus_condition_addon}) OR
                (awp.date >= '{today_date}' {future_docstatus_condition_addon})
            )
            AND (awpi.lot_number IS NULL OR awpi.job_card IS NULL OR awpi.job_card = '')
            AND awpi.mould IS NOT NULL
            {item_condition.replace('wpi.item', 'awpi.item')}
            {lot_condition_planned.replace('wpi.lot_number', 'awpi.lot_number')}
            {shift_condition_addon}
        )
        SELECT 
            item_code, production_date, shift_type, mould, lot_number, job_card,
            noof_cavities, target_qty, planned_qty_pieces, source_type, matching_method
        FROM RankedFallbackPlans 
        WHERE rn = 1

    # Get all planned data
    planned_data_with_relationships = frappe.db.sql(planned_query_with_relationships, as_dict=True)
    planned_data_fallback = frappe.db.sql(planned_query_fallback, as_dict=True)
    
    # Combine planned data
    all_planned_data = planned_data_with_relationships + planned_data_fallback

    # STEP 3: Get actual production data with job_card relationships
    actual_query = f"""
        SELECT 
            mpe.moulding_date as production_date,
            mpe.item_to_produce as item_code,
            COALESCE(mpe.scan_lot_number, mpe.batch_no, 'No Lot') as lot_number,
            mpe.job_card,
            SUM(mpe.number_of_lifts * mpe.no_of_running_cavities) as actual_qty_pieces,
            COUNT(DISTINCT mpe.name) as production_entries,
            GROUP_CONCAT(DISTINCT mpe.name ORDER BY mpe.name) as entry_references
        FROM `tabMoulding Production Entry` mpe
        WHERE mpe.moulding_date BETWEEN '{from_date}' AND '{to_date}'
        AND mpe.docstatus = 1
        {item_condition_actual}
        {lot_condition_actual}
        GROUP BY mpe.moulding_date, mpe.item_to_produce, COALESCE(mpe.scan_lot_number, mpe.batch_no, 'No Lot'), mpe.job_card
    """

    actual_data = frappe.db.sql(actual_query, as_dict=True)

    # Get stock entry data (kept for reference but simplified)
    stock_query = f"""
        SELECT 
            DATE(se.posting_date) as production_date,
            sed.item_code,
            COALESCE(sed.spp_batch_number, sed.batch_no, 'No Lot') as lot_number,
            COUNT(DISTINCT se.name) as stock_entries,
            GROUP_CONCAT(DISTINCT se.name ORDER BY se.name) as entry_references
        FROM `tabStock Entry` se
        JOIN `tabStock Entry Detail` sed ON se.name = sed.parent
        LEFT JOIN `tabItem` item ON sed.item_code = item.name
        WHERE se.posting_date BETWEEN '{from_date}' AND '{to_date}'
        AND se.purpose = 'Manufacture'
        AND se.docstatus = 1
        AND sed.t_warehouse IS NOT NULL
        GROUP BY DATE(se.posting_date), sed.item_code, COALESCE(sed.spp_batch_number, sed.batch_no, 'No Lot')
    """
    
    stock_data = frappe.db.sql(stock_query, as_dict=True)

    # ALIGNED MATCHING LOGIC
    combined_data = {}
    
    # Process planned data and create primary keys
    for row in all_planned_data:
        if row.matching_method == 'job_card_relationship' and row.job_card:
            # Use job_card + lot_number as primary key for proper relationships
            key = f"{row.job_card}|{row.lot_number}"
        else:
            # Use date + item as fallback key
            key = f"{row.production_date}|{row.item_code}|fallback"
        
        if key not in combined_data:
            combined_data[key] = {
                'production_date': row.production_date,
                'item_code': row.item_code,
                'lot_number': row.lot_number or 'No Lot',
                'job_card': row.job_card,
                'shift_type': row.shift_type,
                'planned_qty_pieces': 0,
                'actual_qty_pieces': 0,
                'production_entries': 0,
                'stock_entries': 0,
                'variance_pieces': 0,
                'variance_percentage': 0,
                'efficiency': 0,
                'planning_sources': [],
                'matching_method': row.matching_method,
                'entry_references_actual': '',
                'entry_references_stock': ''
            }
        
        combined_data[key]['planned_qty_pieces'] += flt(row.planned_qty_pieces)
        if row.source_type not in combined_data[key]['planning_sources']:
            combined_data[key]['planning_sources'].append(row.source_type)

    # Match actual production data
    for row in actual_data:
        matched = False
        
        # Try to match via job_card first (if available)
        if row.job_card:
            job_card_key = f"{row.job_card}|{row.lot_number}"
            if job_card_key in combined_data:
                combined_data[job_card_key]['actual_qty_pieces'] += flt(row.actual_qty_pieces)
                combined_data[job_card_key]['production_entries'] += cint(row.production_entries)
                combined_data[job_card_key]['entry_references_actual'] = row.entry_references or ''
                matched = True
        
        # If no job_card match, try date + item fallback
        if not matched:
            fallback_key = f"{row.production_date}|{row.item_code}|fallback"
            if fallback_key in combined_data:
                combined_data[fallback_key]['actual_qty_pieces'] += flt(row.actual_qty_pieces)
                combined_data[fallback_key]['production_entries'] += cint(row.production_entries)
                combined_data[fallback_key]['entry_references_actual'] = row.entry_references or ''
                # Update lot_number if it was 'No Lot'
                if combined_data[fallback_key]['lot_number'] == 'No Lot':
                    combined_data[fallback_key]['lot_number'] = row.lot_number

    # Add stock entry data (simplified)
    for row in stock_data:
        # Try both job_card and fallback matching
        found_match = False
        for key in combined_data.keys():
            data = combined_data[key]
            if (data['production_date'] == row.production_date and 
                data['item_code'] == row.item_code and 
                data['lot_number'] == row.lot_number):
                data['stock_entries'] += cint(row.stock_entries)
                data['entry_references_stock'] = row.entry_references or ''
                found_match = True
                break

    # Calculate final metrics
    final_data = []
    for key, data in combined_data.items():
        # Calculate variance in pieces
        data['variance_pieces'] = data['actual_qty_pieces'] - data['planned_qty_pieces']
        
        # Calculate variance percentage
        if data['planned_qty_pieces'] > 0:
            data['variance_percentage'] = (data['variance_pieces'] / data['planned_qty_pieces']) * 100
        else:
            data['variance_percentage'] = 0

        # Calculate efficiency (actual/planned * 100)
        if data['planned_qty_pieces'] > 0:
            data['efficiency'] = (data['actual_qty_pieces'] / data['planned_qty_pieces']) * 100
        else:
            data['efficiency'] = 0
        
        # Ensure production_date is a proper date object for consistent sorting
        if isinstance(data['production_date'], str):
            data['production_date'] = frappe.utils.getdate(data['production_date'])
        
        # Format the production date for display
        data['production_date_formatted'] = formatdate(data['production_date'])
        
        # Format planning sources for display
        data['planning_sources_text'] = ', '.join(data['planning_sources']) if data['planning_sources'] else 'No Planning'
        
        # Format lot number for display based on date and production status
        current_date = frappe.utils.getdate(today_date)
        if data['production_date'] < current_date:
            # Past shifts
            if data['actual_qty_pieces'] > 0:
                # Has production, use actual lot number
                data['lot_number_display'] = data['lot_number'] or 'No Lot'
            else:
                # No production for past shift
                data['lot_number_display'] = '(Not Produced)'
        else:
            # Future shifts - show planned lot number or 'planned'
            if data['lot_number'] and data['lot_number'] != 'No Lot':
                data['lot_number_display'] = data['lot_number']
            else:
                data['lot_number_display'] = 'planned'
        
        # Determine status based on efficiency
        if data['efficiency'] == 100:
            data['status'] = 'Target'
        elif data['efficiency'] < 100:
            data['status'] = 'Under'
        else:
            data['status'] = 'Over'
        
        final_data.append(data)

    # Apply production filter if specified
    if production_filter == 'produced':
        final_data = [row for row in final_data if row['actual_qty_pieces'] > 0]
    elif production_filter == 'not_produced':
        final_data = [row for row in final_data if row['actual_qty_pieces'] == 0]
    # If production_filter is 'all' or None, no filtering is applied

    # Sort by date desc, then by item (dates are now normalized to date objects)
    final_data.sort(key=lambda x: (x['production_date'], x['item_code']), reverse=True)
    
    return final_data


@frappe.whitelist()
def get_summary(data):
    """
    Calculate summary statistics for the planned vs actual data
    """
    if not data:
        return {
            'total_planned_pieces': 0,
            'total_produced_pieces': 0,
            'overall_efficiency': 0,
            'total_items': 0,
            'total_dates': 0,
            'avg_efficiency': 0,
            'job_card_relationships': 0,
            'fallback_relationships': 0
        }
    
    # Calculate totals
    total_planned = sum(row['planned_qty_pieces'] for row in data)
    total_produced = sum(row['actual_qty_pieces'] for row in data)
    
    # Calculate overall efficiency
    if total_planned > 0:
        overall_efficiency = (total_produced / total_planned) * 100
    else:
        overall_efficiency = 0
    
    # Calculate average efficiency (only for items with planned quantities)
    items_with_planned = [row for row in data if row['planned_qty_pieces'] > 0]
    if items_with_planned:
        avg_efficiency = sum(row['efficiency'] for row in items_with_planned) / len(items_with_planned)
    else:
        avg_efficiency = 0
    
    # Count unique items and dates
    unique_items = len(set(row['item_code'] for row in data))
    unique_dates = len(set(str(row['production_date']) for row in data))
    
    # Count relationship types
    job_card_relationships = len([row for row in data if row.get('matching_method') == 'job_card_relationship'])
    fallback_relationships = len([row for row in data if row.get('matching_method') == 'date_item_matching'])
    
    return {
        'total_planned_pieces': total_planned,
        'total_produced_pieces': total_produced,
        'overall_efficiency': overall_efficiency,
        'total_items': unique_items,
        'total_dates': unique_dates,
        'avg_efficiency': avg_efficiency,
        'job_card_relationships': job_card_relationships,
        'fallback_relationships': fallback_relationships
    }


@frappe.whitelist()
def get_shift_options(from_date=None, to_date=None):
    """
    Get available shift options based on actual data in Work Planning and Add On Work Planning
    """
    if not from_date:
        from_date = frappe.utils.today()
    if not to_date:
        to_date = frappe.utils.today()
    
    # Get shifts from Work Planning (including both draft and submitted)
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
    
    shift_data = frappe.db.sql(shift_query, as_dict=True)
    
    # Create a list of shift options
    shift_options = []
    if shift_data:
        for shift in shift_data:
            shift_options.append({
                'value': shift.shift_name,
                'label': shift.shift_name
            })
    
    return shift_options

@frappe.whitelist()
def get_summary_statistics(from_date=None, to_date=None, item_filter=None, lot_filter=None, shift_filter=None, planning_filter=None):
    """
    Get summary statistics for the planned vs actual data.
    This method fetches the data and calculates summary statistics.
    """
    try:
        # Get the planned vs actual data
        data = get_planned_vs_actual_data(
            from_date=from_date,
            to_date=to_date,
            item_filter=item_filter,
            lot_filter=lot_filter,
            shift_filter=shift_filter,
            planning_filter=planning_filter
        )
        
        # Calculate and return summary statistics
        return get_summary(data)
        
    except Exception as e:
        frappe.log_error(f"Error getting summary statistics: {str(e)}")
        return {
            'total_planned_pieces': 0,
            'total_produced_pieces': 0,
            'overall_efficiency': 0,
            'total_items': 0,
            'total_dates': 0,
            'avg_efficiency': 0,
            'job_card_relationships': 0,
            'fallback_relationships': 0,
            'error': str(e)
        }
