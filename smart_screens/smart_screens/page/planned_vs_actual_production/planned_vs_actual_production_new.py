import frappe
from frappe.utils import flt, cint, formatdate, today, getdate
from datetime import timedelta
import requests
import json


def get_remote_pricing_config():
    """Get remote pricing configuration from Settings or site_config"""
    try:
        settings = frappe.get_single("Rejection Analysis Settings")
        remote_url = settings.sales_site_url or ""
        api_key = settings.sales_site_api_key or ""
        api_secret = settings.get_password("sales_site_api_secret") or ""
    except Exception:
        remote_url = frappe.conf.get("sales_site_url") or ""
        api_key = frappe.conf.get("sales_site_api_key") or ""
        api_secret = frappe.conf.get("sales_site_api_secret") or ""
    
    return remote_url, api_key, api_secret


def convert_to_finished_product_code(material_item_code):
    """
    Convert item code for remote pricing lookup
    - T-codes: Convert T2438 → F2438 (Material to Finished)
    - P-codes: Keep as P6117 (Product codes used as-is)
    - F-codes: Keep as F2438 (Finished codes used as-is)
    """
    if not material_item_code:
        return None
    
    # Clean up item code
    cleaned = material_item_code.strip().replace('t.', '').replace('T.', '').split()[0].upper()
    
    # Only convert T-codes to F-codes
    if cleaned.startswith('T'):
        return 'F' + cleaned[1:]
    
    # P-codes and F-codes pass through unchanged
    return cleaned


def fetch_remote_item_prices(item_codes):
    """
    Fetch item prices from remote Sales site
    
    Args:
        item_codes: List of Finished Product item codes (F-prefix)
    
    Returns:
        dict: Mapping of item_code → price_list_rate
    """
    if not item_codes:
        return {}
    
    remote_url, api_key, api_secret = get_remote_pricing_config()
    
    if not (remote_url and api_key and api_secret):
        return {}
    
    try:
        filters = [
            ["item_code", "in", item_codes],
            ["price_list", "=", "Standard Selling"]
        ]
        fields = ["item_code", "price_list_rate"]
        
        response = requests.get(
            f"{remote_url}/api/resource/Item Price",
            params={
                "filters": json.dumps(filters),
                "fields": json.dumps(fields),
                "limit_page_length": 500
            },
            headers={
                "Authorization": f"token {api_key}:{api_secret}"
            },
            timeout=10
        )
        
        if response.status_code == 200:
            data = response.json()
            price_map = {}
            for item_price in data.get("data", []):
                item_code = item_price.get("item_code")
                rate = flt(item_price.get("price_list_rate", 0))
                if item_code and rate > 0:
                    price_map[item_code] = rate
            return price_map
        else:
            error_text = response.text[:500] if response.text else "No response"
            frappe.log_error(
                f"Remote pricing API returned {response.status_code}: {error_text}",
                "Planned vs Actual - Remote Pricing Error"
            )
            return {}
            
    except requests.exceptions.Timeout:
        frappe.log_error("Remote pricing API timeout", "Planned vs Actual - Timeout")
        return {}
    except Exception as e:
        error_msg = str(e)[:300]
        frappe.log_error(f"Remote pricing failed: {error_msg}", "Planned vs Actual - Pricing Error")
        return {}




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
    
    # Build production-specific filter conditions
    prod_item_condition = ""
    prod_lot_condition = ""
    prod_shift_condition = ""
    
    if item_filter:
        item_condition = f"AND wpi.item LIKE '%{item_filter}%'"
        prod_item_condition = f"AND mpe.item_to_produce LIKE '%{item_filter}%'"
    
    if lot_filter:
        lot_condition = f"AND wpi.lot_number LIKE '%{lot_filter}%'"
        prod_lot_condition = f"AND COALESCE(mpe.scan_lot_number, mpe.batch_no) LIKE '%{lot_filter}%'"
    
    if shift_filter and shift_filter != 'all':
        shift_condition = f"AND wp.shift_type = '{shift_filter}'"
        prod_shift_condition = f"AND COALESCE(jc.shift_type, 'Unknown') = '{shift_filter}'"

    # STEP 1: Get Table A - All work planning data with required columns
    # STEP 1: First, get all production data for the given date range
    production_lifts_query = f"""
        SELECT 
            mpe.moulding_date as production_date,
            COALESCE(jc.shift_type, 'Unknown') as shift_type,
            mpe.mould_reference as mould_ref,
            COALESCE(mpe.scan_lot_number, mpe.batch_no) as lot_no,
            mpe.item_to_produce as item_code,
            SUM(mpe.number_of_lifts) as total_production_lifts,
            SUM(mpe.number_of_lifts * mpe.no_of_running_cavities) as total_pieces_produced
        FROM `tabMoulding Production Entry` mpe
        LEFT JOIN `tabJob Card` jc ON mpe.job_card = jc.name
        WHERE mpe.moulding_date BETWEEN '{from_date}' AND '{to_date}'
        AND mpe.docstatus = 1
        AND COALESCE(mpe.scan_lot_number, mpe.batch_no) IS NOT NULL
        AND COALESCE(mpe.scan_lot_number, mpe.batch_no) != ''
        {prod_item_condition}
        {prod_lot_condition}
        {prod_shift_condition}
        GROUP BY mpe.moulding_date, COALESCE(jc.shift_type, 'Unknown'), mpe.mould_reference, COALESCE(mpe.scan_lot_number, mpe.batch_no), mpe.item_to_produce
    """
    
    production_data = frappe.db.sql(production_lifts_query, as_dict=True)
    
    # Get unique lot numbers from production
    production_lot_numbers = list(set([prod['lot_no'] for prod in production_data]))
    
    # Check for the specific missing case
    if '25F26X06' in production_lot_numbers:
        # Check if work plan exists for this lot
        check_query = f"""
            SELECT wp.name as work_plan_no, wpi.lot_number, wp.date 
            FROM `tabWork Planning` wp
            INNER JOIN `tabWork Plan Item` wpi ON wp.name = wpi.parent
            WHERE wpi.lot_number = '25F26X06'
        """
        check_result = frappe.db.sql(check_query, as_dict=True)
        
        # Also check for similar lot numbers
        similar_query = f"""
            SELECT wp.name as work_plan_no, wpi.lot_number, wp.date 
            FROM `tabWork Planning` wp
            INNER JOIN `tabWork Plan Item` wpi ON wp.name = wpi.parent
            WHERE wpi.lot_number LIKE '%25F26X06%' OR wpi.lot_number LIKE '%F26X%'
            LIMIT 5
        """
        similar_result = frappe.db.sql(similar_query, as_dict=True)
        
        # Check the specific work plan WRKP-02522
        specific_query = f"""
            SELECT wp.name as work_plan_no, wpi.lot_number, wp.date 
            FROM `tabWork Planning` wp
            INNER JOIN `tabWork Plan Item` wpi ON wp.name = wpi.parent
            WHERE wp.name = 'WRKP-02522'
        """
        specific_result = frappe.db.sql(specific_query, as_dict=True)
        
        if check_result:
            frappe.msgprint(f"Found exact match for 25F26X06: {check_result[0]['work_plan_no']}")
        elif similar_result:
            frappe.msgprint(f"Found similar lot numbers: {[r['lot_number'] for r in similar_result]}")
        elif specific_result:
            frappe.msgprint(f"WRKP-02522 has lot numbers: {[r['lot_number'] for r in specific_result]}")
        else:
            frappe.msgprint(f"No work plan found for 25F26X06 or similar")
    
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
                COALESCE((SELECT wpit.target_qty
                          FROM `tabWork Plan Item Target` wpit
                          WHERE wpit.item = wpi.item
                            AND wpit.shift_type = (
                                SELECT
                                    CASE
                                        WHEN st.end_time > st.start_time THEN TIMEDIFF(st.end_time, st.start_time)
                                        ELSE TIMEDIFF(ADDTIME(st.end_time, '24:00:00'), st.start_time)
                                    END
                                FROM `tabShift Type` st
                                WHERE st.name = wp.shift_type
                                LIMIT 1
                            )
                          LIMIT 1), 0) as target_lifts,
                'Work Planning' as source_type,
                wp.docstatus
            FROM `tabWork Planning` wp
            INNER JOIN `tabWork Plan Item` wpi ON wp.name = wpi.parent
            LEFT JOIN `tabMould Specification` ms ON wpi.mould = ms.mould_ref AND ms.docstatus = 1
            WHERE wpi.lot_number IN ({lot_numbers_condition})
            AND wp.docstatus != 2
            AND wpi.mould IS NOT NULL
            AND wpi.lot_number IS NOT NULL
            AND wpi.lot_number != ''
            {item_condition}
            {lot_condition}
            {shift_condition}
        """
        
        work_plan_data = frappe.db.sql(work_plan_query, as_dict=True)
        
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
                COALESCE((SELECT wpit.target_qty
                          FROM `tabWork Plan Item Target` wpit
                          WHERE wpit.item = awpi.item
                            AND wpit.shift_type = (
                                SELECT
                                    CASE
                                        WHEN st.end_time > st.start_time THEN TIMEDIFF(st.end_time, st.start_time)
                                        ELSE TIMEDIFF(ADDTIME(st.end_time, '24:00:00'), st.start_time)
                                    END
                                FROM `tabShift Type` st
                                WHERE st.name = awp.shift_type
                                LIMIT 1
                            )
                          LIMIT 1), 0) as target_lifts,
                'Add On Work Planning' as source_type,
                awp.docstatus
            FROM `tabAdd On Work Planning` awp
            INNER JOIN `tabAdd On Work Plan Item` awpi ON awp.name = awpi.parent
            LEFT JOIN `tabMould Specification` ms ON awpi.mould = ms.mould_ref AND ms.docstatus = 1
            WHERE awpi.lot_number IN ({lot_numbers_condition})
            AND awp.docstatus != 2
            AND awpi.mould IS NOT NULL
            AND awpi.lot_number IS NOT NULL
            AND awpi.lot_number != ''
            {item_condition.replace('wpi.item', 'awpi.item')}
            {lot_condition.replace('wpi.lot_number', 'awpi.lot_number')}
            {shift_condition.replace('wp.shift_type', 'awp.shift_type')}
        """
        
        addon_work_plan_data = frappe.db.sql(addon_work_plan_query, as_dict=True)
        
        # Combine both work plan sources
        table_a_data = work_plan_data + addon_work_plan_data
    else:
        table_a_data = []
    if len(production_data) == 0:
        # Test a simpler query to see if data exists
        test_query = f"SELECT COUNT(*) as count FROM `tabMoulding Production Entry` WHERE moulding_date BETWEEN '{from_date}' AND '{to_date}' AND docstatus = 1"
        test_result = frappe.db.sql(test_query, as_dict=True)
        
        # Check if lot numbers exist
        lot_query = f"SELECT COUNT(*) as count FROM `tabMoulding Production Entry` WHERE moulding_date BETWEEN '{from_date}' AND '{to_date}' AND docstatus = 1 AND (scan_lot_number IS NOT NULL OR batch_no IS NOT NULL)"
        lot_result = frappe.db.sql(lot_query, as_dict=True)
    
    mld_5001_prod = [row for row in production_data if row.get('mould_ref') == 'MLD-5001-C' and row.get('lot_no') == '25E31V01']
    for record in mld_5001_prod[:3]:
        pass

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
    # Find common lot numbers
    common_lots = set(production_by_lot.keys()) & set(work_plan_by_lot.keys())
    
    # Debug logging
    
    # Create production-driven results (start with production data, then find matching work plans)
    final_results = []
    matched_lots = set()
    
    # Process each production entry and try to find matching work plans by lot number only
    for prod_data in production_data:
        lot_no = prod_data['lot_no']
        
        matched_work_plan = None
        if lot_no in work_plan_by_lot:
            # Pick the first work plan for this lot (lot-only matching)
            candidates = work_plan_by_lot[lot_no]
            matched_work_plan = candidates[0]  # Simple match - just take first one
        
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
        else:
            # No matching work plan found
            result = {
                'work_plan_no': 'No Work Plan',
                'work_plan_submission_datetime': "",
                'production_date': prod_data['production_date'],
                'production_date_formatted': formatdate(prod_data['production_date']),
                'shift_type': prod_data['shift_type'],
                'item_code': prod_data.get('item_code', 'Unknown'),
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
    
    # Count different types of results
    production_results = [r for r in final_results if r['has_production']]
    work_plan_only_results = [r for r in final_results if not r['has_production']]
    
    # Show some examples of production results
    for result in production_results[:3]:
        pass

    # STEP 4: Apply additional production filter
    if production_filter == 'produced':
        # Show only records with actual production > 0
        final_results = [row for row in final_results if row['has_production']]
    elif production_filter == 'not_produced':
        # Show only records planned but not produced
        final_results = [row for row in final_results if not row['has_production']]

    # STEP 5: Fetch remote pricing and calculate production values
    # Collect unique item codes
    material_items = set()
    finished_items = set()  # Changed from list to set to avoid duplicates
    t_to_f_map = {}
    
    frappe.logger().info(f"DEBUG PRICING: Processing {len(final_results)} records")
    
    for row in final_results:
        material_code = row.get('item_code')
        if material_code:
            material_items.add(material_code)
            finished_code = convert_to_finished_product_code(material_code)
            if finished_code:
                finished_items.add(finished_code)  # Changed from append to add
                t_to_f_map[material_code] = finished_code
    
    frappe.logger().info(f"DEBUG PRICING: Found {len(material_items)} unique material codes")
    frappe.logger().info(f"DEBUG PRICING: Converted to {len(finished_items)} finished codes")
    frappe.logger().info(f"DEBUG PRICING: T-to-F map: {t_to_f_map}")
    
    # Fetch remote pricing for finished product codes (convert set to list for API)
    pricing_map = fetch_remote_item_prices(list(finished_items))
    
    frappe.logger().info(f"DEBUG PRICING: Got {len(pricing_map)} prices from remote API")
    frappe.logger().info(f"DEBUG PRICING: Pricing map: {pricing_map}")
    
    # Add pricing to each result
    for row in final_results:
        material_code = row.get('item_code')
        
        # Get rate from remote pricing via T-to-F conversion
        finished_code = t_to_f_map.get(material_code)
        rate = pricing_map.get(finished_code, 0) if finished_code else 0
        
        row['item_rate'] = flt(rate, 2)
        
        # Calculate production value = produced_pieces × rate
        produced_pieces = flt(row.get('produced_pieces', 0))
        row['production_value'] = flt(produced_pieces * rate, 2)

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
                'production_efficiency_percentage': 0,
                'total_production_value': 0
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
        
        # Calculate total production value
        total_production_value = sum(row.get('production_value', 0) for row in data)
        
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
            'total_production_value': total_production_value
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
            'total_production_value': 0,
            'error': str(e)
        }
