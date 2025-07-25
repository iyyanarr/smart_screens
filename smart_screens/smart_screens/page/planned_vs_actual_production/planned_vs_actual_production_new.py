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
    # STEP 1: First, get all production data for the given date range
    production_lifts_query = f"""
        SELECT 
            mpe.moulding_date as production_date,
            COALESCE(jc.shift_type, 'Unknown') as shift_type,
            mpe.mould_reference as mould_ref,
            COALESCE(mpe.scan_lot_number, mpe.batch_no) as lot_no,
            SUM(mpe.number_of_lifts) as total_production_lifts,
            SUM(mpe.number_of_lifts * mpe.no_of_running_cavities) as total_pieces_produced
        FROM `tabMoulding Production Entry` mpe
        LEFT JOIN `tabJob Card` jc ON mpe.job_card = jc.name
        WHERE mpe.moulding_date BETWEEN '{from_date}' AND '{to_date}'
        AND mpe.docstatus = 1
        AND COALESCE(mpe.scan_lot_number, mpe.batch_no) IS NOT NULL
        AND COALESCE(mpe.scan_lot_number, mpe.batch_no) != ''
        GROUP BY mpe.moulding_date, COALESCE(jc.shift_type, 'Unknown'), mpe.mould_reference, COALESCE(mpe.scan_lot_number, mpe.batch_no)
    """
    
    production_data = frappe.db.sql(production_lifts_query, as_dict=True)
    print(f"DEBUG: Loaded {len(production_data)} production records")
    
    # Get unique lot numbers from production
    production_lot_numbers = list(set([prod['lot_no'] for prod in production_data]))
    print(f"DEBUG: Found {len(production_lot_numbers)} unique production lot numbers")
    if production_lot_numbers:
        print(f"DEBUG: First 10 production lots: {production_lot_numbers[:10]}")
    
    # STEP 2: Now get work plans that match these specific lot numbers (regardless of date)
    table_a_data = []
    if production_lot_numbers:
        lot_numbers_condition = "'" + "','".join(production_lot_numbers) + "'"
        
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
                wp.docstatus
            FROM `tabWork Planning` wp
            INNER JOIN `tabWork Plan Item` wpi ON wp.name = wpi.parent
            LEFT JOIN `tabMould Specification` ms ON wpi.mould = ms.mould_ref AND ms.docstatus = 1
            LEFT JOIN `tabWork Plan Item Target` wpit ON wpi.item = wpit.item
            WHERE wpi.lot_number IN ({lot_numbers_condition})
            AND wpi.mould IS NOT NULL
            AND wpi.lot_number IS NOT NULL
            AND wpi.lot_number != ''
            {item_condition}
            {lot_condition}
            {shift_condition}
        """
        
        work_plan_data = frappe.db.sql(work_plan_query, as_dict=True)
        print(f"DEBUG: Found {len(work_plan_data)} work plans for production lot numbers")
        
        # Also check Add On Work Planning
        addon_work_plan_query = f"""
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
                awp.docstatus
            FROM `tabAdd On Work Planning` awp
            INNER JOIN `tabAdd On Work Plan Item` awpi ON awp.name = awpi.parent
            LEFT JOIN `tabMould Specification` ms ON awpi.mould = ms.mould_ref AND ms.docstatus = 1
            WHERE awpi.lot_number IN ({lot_numbers_condition})
            AND awpi.mould IS NOT NULL
            AND awpi.lot_number IS NOT NULL
            AND awpi.lot_number != ''
            {item_condition.replace('wpi.item', 'awpi.item')}
            {lot_condition.replace('wpi.lot_number', 'awpi.lot_number')}
            {shift_condition.replace('wp.shift_type', 'awp.shift_type')}
        """
        
        addon_work_plan_data = frappe.db.sql(addon_work_plan_query, as_dict=True)
        print(f"DEBUG: Found {len(addon_work_plan_data)} add-on work plans for production lot numbers")
        
        # Combine both work plan sources
        table_a_data = work_plan_data + addon_work_plan_data
        print(f"DEBUG: Total work plans found: {len(table_a_data)}")
    else:
        print("DEBUG: No production data found, skipping work plan query")
    if len(production_data) == 0:
        # Test a simpler query to see if data exists
        test_query = f"SELECT COUNT(*) as count FROM `tabMoulding Production Entry` WHERE moulding_date BETWEEN '{from_date}' AND '{to_date}' AND docstatus = 1"
        test_result = frappe.db.sql(test_query, as_dict=True)
        frappe.logger().info(f"DEBUG: Total production entries in date range: {test_result[0]['count'] if test_result else 0}")
        
        # Check if lot numbers exist
        lot_query = f"SELECT COUNT(*) as count FROM `tabMoulding Production Entry` WHERE moulding_date BETWEEN '{from_date}' AND '{to_date}' AND docstatus = 1 AND (scan_lot_number IS NOT NULL OR batch_no IS NOT NULL)"
        lot_result = frappe.db.sql(lot_query, as_dict=True)
        frappe.logger().info(f"DEBUG: Production entries with lot numbers: {lot_result[0]['count'] if lot_result else 0}")
    
    mld_5001_prod = [row for row in production_data if row.get('mould_ref') == 'MLD-5001-C' and row.get('lot_no') == '25E31V01']
    frappe.logger().info(f"DEBUG: Found {len(mld_5001_prod)} MLD-5001-C/25E31V01 production records")
    for record in mld_5001_prod[:3]:
        frappe.logger().info(f"DEBUG: Production record: Date: {record.get('production_date')}, Shift: {record.get('shift_type')}, Lifts: {record.get('total_production_lifts')}")

    # Create a simple lookup dictionary for production data by lot number
    production_by_lot = {}
    for prod in production_data:
        lot_no = prod['lot_no']
        if lot_no not in production_by_lot:
            production_by_lot[lot_no] = []
        production_by_lot[lot_no].append(prod)

    # STEP 3: Create simple lot-based matching (ignoring date/shift/mould)
    # Create a lookup for work plans by lot number only
    work_plan_by_lot = {}
    
    for row in table_a_data:
        lot_no = row['lot_no']
        if lot_no not in work_plan_by_lot:
            work_plan_by_lot[lot_no] = []
        work_plan_by_lot[lot_no].append(row)
    
    # SIMPLE DEBUG - show what lot numbers we have
    frappe.logger().info(f"DEBUG: Production lot numbers: {list(production_by_lot.keys())[:10]}")
    frappe.logger().info(f"DEBUG: Work plan lot numbers: {list(work_plan_by_lot.keys())[:10]}")
    
    # Find common lot numbers
    common_lots = set(production_by_lot.keys()) & set(work_plan_by_lot.keys())
    frappe.logger().info(f"DEBUG: Common lot numbers: {list(common_lots)[:10]}")
    
    # Debug logging
    frappe.logger().info(f"DEBUG: Created work plan lookup for {len(work_plan_by_lot)} unique lot numbers")
    frappe.logger().info(f"DEBUG: Created production lookup for {len(production_by_lot)} unique lot numbers")
    if '25E31V01' in work_plan_by_lot:
        frappe.logger().info(f"DEBUG: Found {len(work_plan_by_lot['25E31V01'])} work plans for lot 25E31V01")
    if '25E31V01' in production_by_lot:
        frappe.logger().info(f"DEBUG: Found {len(production_by_lot['25E31V01'])} production records for lot 25E31V01")
    
    # Create production-driven results (start with production data, then find matching work plans)
    final_results = []
    matched_lots = set()
    
    # Process each production entry and try to find matching work plans by lot number only
    for prod_data in production_data:
        lot_no = prod_data['lot_no']
        
        # Debug logging for all production records (not just specific ones)
        frappe.logger().info(f"DEBUG: Processing production - Lot: {lot_no}, Mould: {prod_data['mould_ref']}, Lifts: {prod_data['total_production_lifts']}, Pieces: {prod_data['total_pieces_produced']}")
        frappe.logger().info(f"DEBUG: Lot exists in work plans: {lot_no in work_plan_by_lot}")
        
        matched_work_plan = None
        if lot_no in work_plan_by_lot:
            # Pick the first work plan for this lot (lot-only matching)
            candidates = work_plan_by_lot[lot_no]
            matched_work_plan = candidates[0]  # Simple match - just take first one
            
            # Debug logging
            frappe.logger().info(f"DEBUG: MATCHED! Lot {lot_no} with work plan: {matched_work_plan.get('work_plan_no', 'unknown')}")
            frappe.logger().info(f"DEBUG: Production lifts: {prod_data['total_production_lifts']}, pieces: {prod_data['total_pieces_produced']}")
        
        if matched_work_plan:
            # Create a matched entry using work plan info but production date
            planned_pieces = flt(matched_work_plan.get('no_of_cavities', 0)) * flt(matched_work_plan.get('target_lifts', 0)) if matched_work_plan.get('target_lifts', 0) > 0 else flt(matched_work_plan.get('no_of_cavities', 0)) * flt(prod_data['total_production_lifts'])
            
            result = {
                'work_plan_no': matched_work_plan['work_plan_no'],
                'work_plan_submission_datetime': str(matched_work_plan['work_plan_submission_datetime']) if matched_work_plan.get('work_plan_submission_datetime') else "",
                'production_date': prod_data['production_date'],  # Use actual production date
                'production_date_formatted': formatdate(prod_data['production_date']),
                'shift_type': prod_data['shift_type'],
                'item_code': matched_work_plan.get('item_code', 'Unknown'),
                'mould_ref': prod_data['mould_ref'],
                'lot_no': prod_data['lot_no'],
                'production_lifts': flt(prod_data['total_production_lifts']),
                'target_lifts': flt(matched_work_plan.get('target_lifts', 0)),
                'no_of_cavities': flt(matched_work_plan.get('no_of_cavities', 0)),
                'source_type': matched_work_plan.get('source_type', 'Work Planning'),
                'docstatus': matched_work_plan.get('docstatus', 1),
                'total_pieces_produced': flt(prod_data['total_pieces_produced']),
                'has_production': True,
                # Calculate planned pieces
                'planned_pieces': planned_pieces,
                'produced_pieces': flt(prod_data['total_pieces_produced']),
                'variance_pieces': flt(prod_data['total_pieces_produced']) - planned_pieces,
                # Add matching information
                'match_type': 'lot_number_match',
                'original_plan_date': matched_work_plan['production_date'],
                'plan_to_production_days': (getdate(prod_data['production_date']) - getdate(matched_work_plan['production_date'])).days
            }
            # Track which lots have been matched with production
            matched_lots.add(lot_no)
            
            # Debug logging for the final result
            frappe.logger().info(f"DEBUG: Created result for lot {lot_no}:")
            frappe.logger().info(f"DEBUG: - Work Plan: {result['work_plan_no']}")
            frappe.logger().info(f"DEBUG: - Production Lifts: {result['production_lifts']}")
            frappe.logger().info(f"DEBUG: - Produced Pieces: {result['produced_pieces']}")
            frappe.logger().info(f"DEBUG: - Planned Pieces: {result['planned_pieces']}")
            frappe.logger().info(f"DEBUG: - Variance: {result['variance_pieces']}")
        else:
            # No matching work plan found
            result = {
                'work_plan_no': 'No Work Plan',
                'work_plan_submission_datetime': "",
                'production_date': prod_data['production_date'],
                'production_date_formatted': formatdate(prod_data['production_date']),
                'shift_type': prod_data['shift_type'],
                'item_code': 'Unknown',
                'mould_ref': prod_data['mould_ref'],
                'lot_no': prod_data['lot_no'],
                'production_lifts': flt(prod_data['total_production_lifts']),
                'target_lifts': 0,
                'no_of_cavities': 0,
                'source_type': 'Production Only',
                'docstatus': 1,
                'total_pieces_produced': flt(prod_data['total_pieces_produced']),
                'has_production': True,
                'planned_pieces': 0,
                'produced_pieces': flt(prod_data['total_pieces_produced']),
                'variance_pieces': flt(prod_data['total_pieces_produced']),
                'match_type': 'no_work_plan',
                'original_plan_date': None,
                'plan_to_production_days': None
            }
            
            # Debug logging for no work plan cases
            frappe.logger().info(f"DEBUG: NO WORK PLAN for lot {prod_data['lot_no']}:")
            frappe.logger().info(f"DEBUG: - Mould: {prod_data['mould_ref']}")
            frappe.logger().info(f"DEBUG: - Production Lifts: {prod_data['total_production_lifts']}")
            frappe.logger().info(f"DEBUG: - Produced Pieces: {prod_data['total_pieces_produced']}")
        
        final_results.append(result)
    
    # Now process work plans that don't have production (planned but not produced)
    # Only include work plans for lots that haven't been matched with production
    for lot_no, work_plans in work_plan_by_lot.items():
        if lot_no not in matched_lots:
            # This lot has work plans but no production
            # Take the first work plan for this lot
            row = work_plans[0]
            
            no_of_cavities = flt(row.get('no_of_cavities', 0))
            target_lifts = flt(row.get('target_lifts', 0))
            planned_pieces = no_of_cavities * target_lifts if target_lifts > 0 else 0
            
            result = {
                'work_plan_no': row['work_plan_no'],
                'work_plan_submission_datetime': str(row['work_plan_submission_datetime']) if row.get('work_plan_submission_datetime') else "",
                'production_date': row['production_date'],  # This is the planned date
                'production_date_formatted': formatdate(row['production_date']),
                'shift_type': row['shift_type'],
                'item_code': row.get('item_code', 'Unknown'),
                'mould_ref': row['mould_ref'],
                'lot_no': row['lot_no'],
                'production_lifts': 0,
                'target_lifts': target_lifts,
                'no_of_cavities': no_of_cavities,
                'source_type': row.get('source_type', 'Work Planning'),
                'docstatus': row.get('docstatus', 1),
                'total_pieces_produced': 0,
                'has_production': False,
                'planned_pieces': planned_pieces,
                'produced_pieces': 0,
                'variance_pieces': -planned_pieces,
                'match_type': 'planned_not_produced',
                'original_plan_date': row['production_date'],
                'plan_to_production_days': None
            }
            final_results.append(result)

    # Debug logging for final results
    frappe.logger().info(f"DEBUG: Final results count: {len(final_results)}")
    
    # Count different types of results
    production_results = [r for r in final_results if r['has_production']]
    work_plan_only_results = [r for r in final_results if not r['has_production']]
    
    frappe.logger().info(f"DEBUG: Results with production: {len(production_results)}")
    frappe.logger().info(f"DEBUG: Work plan only results: {len(work_plan_only_results)}")
    
    # Show some examples of production results
    for result in production_results[:3]:
        frappe.logger().info(f"DEBUG: Production result - Lot: {result['lot_no']}, Lifts: {result['production_lifts']}, Pieces: {result['produced_pieces']}")

    # STEP 4: Apply additional production filter
    if production_filter == 'produced':
        # Show only records with actual production > 0
        final_results = [row for row in final_results if row['has_production']]
    elif production_filter == 'not_produced':
        # Show only records planned but not produced
        final_results = [row for row in final_results if not row['has_production']]

    # Sort results by production date and shift type
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
        
        UNION
        
        SELECT DISTINCT COALESCE(jc.shift_type, 'Unknown') as shift_name
        FROM `tabMoulding Production Entry` mpe
        LEFT JOIN `tabJob Card` jc ON mpe.job_card = jc.name
        WHERE mpe.moulding_date BETWEEN '{from_date}' AND '{to_date}'
        AND mpe.docstatus = 1
        
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
            'production_efficiency_percentage': production_efficiency_percentage
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
