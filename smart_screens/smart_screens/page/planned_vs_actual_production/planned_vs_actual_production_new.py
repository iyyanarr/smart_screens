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
            0 as production_lifts,
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
            0 as production_lifts,
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

    # STEP 4: Apply selection rules for each unique combination
    final_results = []
    
    for unique_key, lots_for_combination in unique_combinations.items():
        selected_lot = None
        
        if len(lots_for_combination) == 1:
            # Rule 1: If there is only one lot no for the given unique key, get that
            selected_lot = lots_for_combination[0]
        else:
            # Rule 2: If there are more than one, get the lot number for which there is a production lift entry made
            lots_with_production = [lot for lot in lots_for_combination if lot['has_production']]
            
            if lots_with_production:
                # If there are multiple lots with production, pick the one with the highest production lifts
                selected_lot = max(lots_with_production, key=lambda x: x['production_lifts'])
            else:
                # Rule 3: If there is no production entry but multiple work plans, choose the lot number which was last created
                selected_lot = max(lots_for_combination, key=lambda x: x['lot_creation_time'])
        
        if selected_lot:
            # Calculate planned and produced pieces for variance
            planned_pieces = flt(selected_lot['no_of_cavities'] or 0) * flt(selected_lot['production_lifts'] or 0) if flt(selected_lot['production_lifts'] or 0) > 0 else 0
            produced_pieces = flt(selected_lot.get('total_pieces_produced', 0))
            
            # Ensure variance calculation is explicit with proper type conversion
            variance_pieces = flt(produced_pieces) - flt(planned_pieces)
            
            # Log for debugging
            if abs(variance_pieces) > 0:
                frappe.logger().debug(f"Variance calculation: {produced_pieces} - {planned_pieces} = {variance_pieces}")
            
            # Format the selected lot data for display
            result = {
                'work_plan_no': selected_lot['work_plan_no'],
                'work_plan_submission_datetime': str(selected_lot['work_plan_submission_datetime']) if selected_lot.get('work_plan_submission_datetime') else "",
                'production_date': selected_lot['production_date'],
                'production_date_formatted': formatdate(selected_lot['production_date']),
                'shift_type': selected_lot['shift_type'],
                'item_code': selected_lot['item_code'],
                'mould_ref': selected_lot['mould_ref'],
                'lot_no': selected_lot['lot_no'],
                'production_lifts': selected_lot['production_lifts'],
                'no_of_cavities': flt(selected_lot['no_of_cavities'] or 0),
                'source_type': selected_lot['source_type'],
                'docstatus': selected_lot['docstatus'],
                'total_pieces_produced': produced_pieces,
                'has_production': selected_lot['has_production'],
                'planned_pieces': planned_pieces,
                'produced_pieces': produced_pieces,
                'variance_pieces': variance_pieces
            }
            
            final_results.append(result)

    # STEP 5: Apply additional production filter
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
        
        # Calculate production efficiency percentage
        production_efficiency_percentage = 0
        if total_planned_records > 0:
            production_efficiency_percentage = round((total_produced_records / total_planned_records) * 100, 2)
        
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
            'total_planned_pieces': 0,
            'total_unique_items': 0,
            'total_unique_moulds': 0,
            'production_efficiency_percentage': 0,
            'error': str(e)
        }
