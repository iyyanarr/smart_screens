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
    Get Production vs Plan data (Plan-Centric Approach):
    
    1. Find all Work Plans (WP) and Add-on Work Plans (AWP) for the selected DATE RANGE.
    2. Extract all Lot Numbers from these plans.
    3. Fetch ALL Production Entries (MPE) for these specific Lot Numbers (regardless of production date).
       - This handles the "Planned Today, Produced Tomorrow" case.
    4. Also fetch any "Unplanned Production" (MPEs created in the date range that have NO matching plan in this range).
    
    Args:
        from_date: Start date for filtering
        to_date: End date for filtering  
        item_filter: Item code filter
        lot_filter: Lot number filter
        shift_filter: Shift type filter ('all' for all shifts, specific shift name, or None)
        production_filter: Additional filter
    """
    
    if not from_date:
        from_date = frappe.utils.today()
    if not to_date:
        to_date = frappe.utils.today()

    # --- Filters ---
    # Work Plan Filters
    wp_item_condition = f"AND wpi.item LIKE '%{item_filter}%'" if item_filter else ""
    wp_lot_condition = f"AND wpi.lot_number LIKE '%{lot_filter}%'" if lot_filter else ""
    wp_shift_condition = f"AND wp.shift_type = '{shift_filter}'" if (shift_filter and shift_filter != 'all') else ""
    
    # Add-on Work Plan Filters (Field names map differently)
    awp_item_condition = f"AND awpi.item LIKE '%{item_filter}%'" if item_filter else ""
    awp_lot_condition = f"AND awpi.lot_number LIKE '%{lot_filter}%'" if lot_filter else ""
    awp_shift_condition = f"AND awp.shift_type = '{shift_filter}'" if (shift_filter and shift_filter != 'all') else ""

    # Production Filters (For Unplanned / Secondary Query)
    prod_item_condition = f"AND mpe.item_to_produce LIKE '%{item_filter}%'" if item_filter else ""
    prod_lot_condition = f"AND COALESCE(mpe.scan_lot_number, mpe.batch_no) LIKE '%{lot_filter}%'" if lot_filter else ""
    prod_shift_condition = f"AND COALESCE(jc.shift_type, 'Unknown') = '{shift_filter}'" if (shift_filter and shift_filter != 'all') else ""

    # =========================================================================================
    # STEP 1: Fetch Plans (The "Planned" Dataset)
    # =========================================================================================
    
    # 1.1 Regular Work Planning
    wp_query = f"""
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
        WHERE wp.date BETWEEN '{from_date}' AND '{to_date}'
        AND wp.docstatus != 2
        AND wpi.mould IS NOT NULL
        AND wpi.lot_number IS NOT NULL
        AND wpi.lot_number != ''
        {wp_item_condition}
        {wp_lot_condition}
        {wp_shift_condition}
        GROUP BY wp.name, wpi.lot_number
    """
    
    # 1.2 Add On Work Planning
    awp_query = f"""
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
        WHERE awp.date BETWEEN '{from_date}' AND '{to_date}'
        AND awp.docstatus != 2
        AND awpi.mould IS NOT NULL
        AND awpi.lot_number IS NOT NULL
        AND awpi.lot_number != ''
        {awp_item_condition}
        {awp_lot_condition}
        {awp_shift_condition}
        GROUP BY awp.name, awpi.lot_number
    """

    planned_data = frappe.db.sql(f"{wp_query} UNION ALL {awp_query}", as_dict=True)
    
    # Extract unique Lot Numbers from Plans
    planned_lots = list(set([row['lot_no'] for row in planned_data if row['lot_no']]))
    
    # =========================================================================================
    # STEP 2: Fetch Production for Planned Lots (The "Actual" Dataset - Matched)
    # =========================================================================================
    
    production_map = {}
    
    if planned_lots:
        lots_condition = "'" + "','".join(planned_lots) + "'"
        
        # NOTE: We do NOT filter by date here. We want ALL production for these generated lots.
        matched_prod_query = f"""
            SELECT 
                COALESCE(mpe.scan_lot_number, mpe.batch_no) as lot_no,
                mpe.mould_reference as mould_ref,
                SUM(mpe.number_of_lifts) as total_production_lifts,
                SUM(mpe.number_of_lifts * mpe.no_of_running_cavities) as total_pieces_produced,
                MAX(mpe.moulding_date) as last_production_date
            FROM `tabMoulding Production Entry` mpe
            WHERE COALESCE(mpe.scan_lot_number, mpe.batch_no) IN ({lots_condition})
            AND mpe.docstatus = 1
            GROUP BY COALESCE(mpe.scan_lot_number, mpe.batch_no), mpe.mould_reference
        """
        
        matched_prod_data = frappe.db.sql(matched_prod_query, as_dict=True)
        
        for p in matched_prod_data:
            production_map[p['lot_no']] = p

    # =========================================================================================
    # STEP 3: Fetch Unplanned Production (The "Actual" Dataset - Unmatched/Orphan)
    # =========================================================================================
    
    # Find MPEs in the date range that were NOT in the planned_lots list
    # logic: If a lot was planned for today, we already got its production in Step 2.
    # We only want items produced TODAY that had NO plan for today.
    
    unplanned_exclusion_clause = ""
    if planned_lots:
         unplanned_exclusion_clause = f"AND COALESCE(mpe.scan_lot_number, mpe.batch_no) NOT IN ({lots_condition})"
    
    unplanned_prod_query = f"""
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
        {unplanned_exclusion_clause}
        {prod_item_condition}
        {prod_lot_condition}
        {prod_shift_condition}
        GROUP BY mpe.moulding_date, COALESCE(jc.shift_type, 'Unknown'), mpe.mould_reference, COALESCE(mpe.scan_lot_number, mpe.batch_no), mpe.item_to_produce
    """
    
    unplanned_data = frappe.db.sql(unplanned_prod_query, as_dict=True)

    # =========================================================================================
    # STEP 4: Merge and Build Final Results
    # =========================================================================================
    
    final_results = []
    
    # 4.1 Process Planned Items (Matched & Not Produced)
    # Group plans by Lot Number to handle potential duplicates (though distinct lots usually imply distinct plans)
    # Ideally one lot = one plan item.
    
    for plan in planned_data:
        lot_no = plan['lot_no']
        
        # Check if we have production for this matched lot
        prod_entry = production_map.get(lot_no)
        
        # Calculate Planned Pieces
        # If target lifts is 0, we can't calculate 'Planned'. 
        # But if we have production, we might assume Target = Production for variance purposes? 
        # No, strict calculation: Cavities * Target.
        no_of_cavities = flt(plan.get('no_of_cavities', 0))
        target_lifts = flt(plan.get('target_lifts', 0))
        
        if prod_entry:
            # --- MATCHED (Planned & Produced) ---
            actual_pieces = flt(prod_entry['total_pieces_produced'])
            actual_lifts = flt(prod_entry['total_production_lifts'])
            
            # If target lifts is missing, estimate planned as actual? 
            # Or assume 0? Usually better to default to clean math.
            planned_pieces = (no_of_cavities * target_lifts) if target_lifts > 0 else (no_of_cavities * actual_lifts)
            
            row = {
                'work_plan_no': plan['work_plan_no'],
                'work_plan_submission_datetime': str(plan['work_plan_submission_datetime']),
                'production_date': plan['production_date'],        # Plan Date
                'production_date_formatted': formatdate(plan['production_date']),
                'shift_type': plan['shift_type'],
                'item_code': plan['item_code'],
                'mould_ref': plan['mould_ref'],
                'lot_no': lot_no,
                
                'production_lifts': actual_lifts,
                'target_lifts': target_lifts,
                'no_of_cavities': no_of_cavities,
                
                'source_type': plan['source_type'],
                'docstatus': plan['docstatus'],
                
                'planned_pieces': planned_pieces,
                'produced_pieces': actual_pieces,   # This is total_pieces_produced
                'total_pieces_produced': actual_pieces, # Frontend expects this key
                'variance_pieces': actual_pieces - planned_pieces,
                
                'has_production': True,
                'match_type': 'Planned & Produced'
            }
        else:
            # --- NOT PRODUCED (Planned but No Production found) ---
            planned_pieces = (no_of_cavities * target_lifts)
            
            row = {
                'work_plan_no': plan['work_plan_no'],
                'work_plan_submission_datetime': str(plan['work_plan_submission_datetime']),
                'production_date': plan['production_date'],
                'production_date_formatted': formatdate(plan['production_date']),
                'shift_type': plan['shift_type'],
                'item_code': plan['item_code'],
                'mould_ref': plan['mould_ref'],
                'lot_no': lot_no,
                
                'production_lifts': 0,
                'target_lifts': target_lifts,
                'no_of_cavities': no_of_cavities,
                
                'source_type': plan['source_type'],
                'docstatus': plan['docstatus'],
                
                'planned_pieces': planned_pieces,
                'produced_pieces': 0,
                'total_pieces_produced': 0,
                'variance_pieces': 0 - planned_pieces,
                
                'has_production': False,
                'match_type': 'Planned Only'
            }
        
        final_results.append(row)
        
    # 4.2 Process Unplanned Items (Production Only)
    for prod in unplanned_data:
        actual_pieces = flt(prod['total_pieces_produced'])
        actual_lifts = flt(prod['total_production_lifts'])
        
        # Unplanned means Planned = 0
        planned_pieces = 0
        
        row = {
            'work_plan_no': 'Unplanned',
            'work_plan_submission_datetime': '',
            'production_date': prod['production_date'],
            'production_date_formatted': formatdate(prod['production_date']),
            'shift_type': prod['shift_type'],
            'item_code': prod['item_code'],
            'mould_ref': prod['mould_ref'],
            'lot_no': prod['lot_no'],
            
            'production_lifts': actual_lifts,
            'target_lifts': 0,
            'no_of_cavities': 0, # Could try looking up mould spec, but not linked to plan
            
            'source_type': 'Unplanned Production',
            'docstatus': 1,
            
            'planned_pieces': 0,
            'produced_pieces': actual_pieces,
            'total_pieces_produced': actual_pieces,
            'variance_pieces': actual_pieces,
            
            'has_production': True,
            'match_type': 'Unplanned'
        }
        
        final_results.append(row)

    # =========================================================================================
    # STEP 5: Filter Results & Sorting
    # =========================================================================================
    
    if production_filter == 'produced':
        final_results = [r for r in final_results if r['has_production']]
    elif production_filter == 'not_produced':
        final_results = [r for r in final_results if not r['has_production']]

    # Sort results by production date, shift, and match type
    final_results.sort(key=lambda x: (x['production_date'], x['shift_type'], x['match_type']))
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
