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
    # Expand date range to include work plans up to 90 days before the from_date
    # This allows for flexible matching where production happens after work planning
    from datetime import datetime, timedelta
    expanded_from_date = (datetime.strptime(from_date, '%Y-%m-%d') - timedelta(days=90)).strftime('%Y-%m-%d')
    
    table_a_query = f"""
        SELECT 
            wp.name as work_plan_no,
            wp.creation as work_plan_submission_datetime,
            wp.date as production_date,
            wp.shift_type,
            wpi.item as item_code,
            wpi.mould as mould_ref,
            wpi.lot_number as lot_no,
            0 as production_lifts,
            ms.noof_cavities as no_of_cavities,
            COALESCE(wpit.target_qty, 0) as target_lifts,
            'Work Planning' as source_type,
            wp.docstatus,
            wpi.creation as lot_creation_time
        FROM `tabWork Planning` wp
        INNER JOIN `tabWork Plan Item` wpi ON wp.name = wpi.parent
        LEFT JOIN `tabMould Specification` ms ON wpi.mould = ms.mould_ref AND ms.docstatus = 1
        LEFT JOIN `tabWork Plan Item Target` wpit ON wpi.item = wpit.item
        WHERE wp.date BETWEEN '{expanded_from_date}' AND '{to_date}'
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
            0 as production_lifts,
            ms.noof_cavities as no_of_cavities,
            0 as target_lifts,
            'Add On Work Planning' as source_type,
            awp.docstatus,
            awpi.creation as lot_creation_time
        FROM `tabAdd On Work Planning` awp
        INNER JOIN `tabAdd On Work Plan Item` awpi ON awp.name = awpi.parent
        LEFT JOIN `tabMould Specification` ms ON awpi.mould = ms.mould_ref AND ms.docstatus = 1
        WHERE awp.date BETWEEN '{expanded_from_date}' AND '{to_date}'
        AND awpi.mould IS NOT NULL
        AND awpi.lot_number IS NOT NULL
        AND awpi.lot_number != ''
        {item_condition.replace('wpi.item', 'awpi.item')}
        {lot_condition.replace('wpi.lot_number', 'awpi.lot_number')}
        {shift_condition.replace('wp.shift_type', 'awp.shift_type')}
        
        ORDER BY production_date, shift_type, mould_ref, lot_creation_time DESC
    """

    table_a_data = frappe.db.sql(table_a_query, as_dict=True)

    # Debug logging
    frappe.logger().info(f"DEBUG: Loaded {len(table_a_data)} work plan records")
    mld_5001_records = [row for row in table_a_data if row.get('mould_ref') == 'MLD-5001-C' and row.get('lot_no') == '25E31V01']
    frappe.logger().info(f"DEBUG: Found {len(mld_5001_records)} MLD-5001-C/25E31V01 work plan records")
    for record in mld_5001_records[:3]:
        frappe.logger().info(f"DEBUG: Work plan record: {record.get('work_plan_no')} on {record.get('production_date')} with shift {record.get('shift_type')}")

    # STEP 2: Get production lifts data (submitted values only)
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

    # Debug logging for production data
    frappe.logger().info(f"DEBUG: Loaded {len(production_data)} production records")
    mld_5001_prod = [row for row in production_data if row.get('mould_ref') == 'MLD-5001-C' and row.get('lot_no') == '25E31V01']
    frappe.logger().info(f"DEBUG: Found {len(mld_5001_prod)} MLD-5001-C/25E31V01 production records")
    for record in mld_5001_prod[:3]:
        frappe.logger().info(f"DEBUG: Production record: Date: {record.get('production_date')}, Shift: {record.get('shift_type')}, Lifts: {record.get('total_production_lifts')}")

    # Create a simple lookup dictionary for production data
    production_lookup = {}
    for prod in production_data:
        key = f"{prod.production_date}|{prod.shift_type}|{prod.mould_ref}|{prod.lot_no}"
        production_lookup[key] = prod

    # STEP 3: Create a comprehensive dataset with flexible date matching
    # First, create a flexible lookup for work plans (without date constraint)
    work_plan_flexible_lookup = {}
    all_work_plans = {}  # Store all work plans by flexible key for debugging
    
    for row in table_a_data:
        # Create flexible key without date: shift|mould|lot
        flexible_key = f"{row.shift_type}|{row.mould_ref}|{row.lot_no}"
        if flexible_key not in work_plan_flexible_lookup:
            work_plan_flexible_lookup[flexible_key] = []
        work_plan_flexible_lookup[flexible_key].append(row)
        
        # Store all work plans for debugging
        if flexible_key not in all_work_plans:
            all_work_plans[flexible_key] = []
        all_work_plans[flexible_key].append({
            'work_plan_no': row['work_plan_no'],
            'date': row['production_date'],
            'shift': row['shift_type'],
            'mould': row['mould_ref'],
            'lot': row['lot_no']
        })
    
    # Create production-driven results (start with production data, then find matching work plans)
    final_results = []
    matched_production_keys = set()
    
    # Process each production entry and try to find matching work plans
    for prod_key, prod_data in production_lookup.items():
        # Create flexible key for this production
        flexible_key = f"{prod_data['shift_type']}|{prod_data['mould_ref']}|{prod_data['lot_no']}"
        
        # Debug logging for specific case
        if prod_data['mould_ref'] == 'MLD-5001-C' and prod_data['lot_no'] == '25E31V01':
            frappe.logger().info(f"DEBUG: Processing production - Date: {prod_data['production_date']}, Key: {flexible_key}")
            frappe.logger().info(f"DEBUG: Available work plan keys: {list(work_plan_flexible_lookup.keys())[:10]}")
            frappe.logger().info(f"DEBUG: Key exists: {flexible_key in work_plan_flexible_lookup}")
        
        matched_work_plan = None
        if flexible_key in work_plan_flexible_lookup:
            # Find the best matching work plan (prefer recent plans before production date)
            candidates = work_plan_flexible_lookup[flexible_key]
            
            # Debug logging
            if prod_data['mould_ref'] == 'MLD-5001-C' and prod_data['lot_no'] == '25E31V01':
                frappe.logger().info(f"DEBUG: Found {len(candidates)} candidates")
                for i, candidate in enumerate(candidates):
                    frappe.logger().info(f"DEBUG: Candidate {i}: {candidate.get('work_plan_no', 'unknown')} on {candidate.get('production_date', 'unknown')}")
            
            from datetime import datetime
            prod_date = getdate(prod_data['production_date'])
            
            valid_plans = []
            for candidate in candidates:
                plan_date = getdate(candidate['production_date'])  # This is actually the work plan date
                # Accept plans up to 90 days before production
                date_diff = (prod_date - plan_date).days
                
                # Debug logging
                if prod_data['mould_ref'] == 'MLD-5001-C' and prod_data['lot_no'] == '25E31V01':
                    frappe.logger().info(f"DEBUG: Plan date: {plan_date}, Prod date: {prod_date}, Diff: {date_diff}")
                
                if 0 <= date_diff <= 90:  # Plan date should be before or same as production, within 90 days
                    candidate['date_diff'] = date_diff
                    valid_plans.append(candidate)
            
            if valid_plans:
                # Pick the plan closest to production date
                matched_work_plan = min(valid_plans, key=lambda x: x['date_diff'])
                
                # Debug logging
                if prod_data['mould_ref'] == 'MLD-5001-C' and prod_data['lot_no'] == '25E31V01':
                    frappe.logger().info(f"DEBUG: Matched work plan: {matched_work_plan.get('work_plan_no', 'unknown')} with diff {matched_work_plan['date_diff']}")
            else:
                # Debug logging
                if prod_data['mould_ref'] == 'MLD-5001-C' and prod_data['lot_no'] == '25E31V01':
                    frappe.logger().info(f"DEBUG: No valid plans found")
        
        if matched_work_plan:
            # Create a matched entry using work plan info but production date
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
                'planned_pieces': flt(matched_work_plan.get('no_of_cavities', 0)) * flt(matched_work_plan.get('target_lifts', 0)) if matched_work_plan.get('target_lifts', 0) > 0 else flt(matched_work_plan.get('no_of_cavities', 0)) * flt(prod_data['total_production_lifts']),
                'produced_pieces': flt(prod_data['total_pieces_produced']),
                'variance_pieces': flt(prod_data['total_pieces_produced']) - (flt(matched_work_plan.get('no_of_cavities', 0)) * flt(matched_work_plan.get('target_lifts', 0)) if matched_work_plan.get('target_lifts', 0) > 0 else flt(matched_work_plan.get('no_of_cavities', 0)) * flt(prod_data['total_production_lifts'])),
                # Add matching information
                'match_type': f"flexible_date_diff_{matched_work_plan['date_diff']}",
                'original_plan_date': matched_work_plan['production_date'],
                'plan_to_production_days': matched_work_plan['date_diff']
            }
            matched_production_keys.add(prod_key)
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
        
        final_results.append(result)
    
    # Now process work plans that don't have production (planned but not produced)
    for row in table_a_data:
        # Check if this work plan was already matched to production
        found_match = False
        flexible_key = f"{row['shift_type']}|{row['mould_ref']}|{row['lot_no']}"
        
        # Check if any production with this flexible key was already processed
        for prod_key in matched_production_keys:
            prod_data = production_lookup[prod_key]
            if f"{prod_data['shift_type']}|{prod_data['mould_ref']}|{prod_data['lot_no']}" == flexible_key:
                found_match = True
                break
        
        if not found_match:
            # This is a work plan without corresponding production
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
