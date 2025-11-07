import frappe
from frappe import _
from frappe.utils import getdate, flt, add_to_date, get_datetime
import json

@frappe.whitelist()
def debug_aggregation_data(filters=None):
    """
    Debug function to compare our data with batch-wise report data
    """
    if isinstance(filters, str):
        filters = json.loads(filters)
    
    from_date = filters.get("from_date", "1900-01-01")
    to_date = filters.get("to_date", frappe.utils.nowdate())
    
    # Get the same data that batch-wise report would show
    debug_query = """
        SELECT 
            sle.item_code,
            SUBSTRING(sle.item_code, 2, 4) as common_code,
            LEFT(sle.item_code, 1) as prefix,
            sle.batch_no,
            sle.posting_date,
            sle.actual_qty,
            i.item_group,
            i.stock_uom
        FROM `tabStock Ledger Entry` sle
        INNER JOIN `tabItem` i ON sle.item_code = i.name
        WHERE 
            sle.docstatus < 2
            AND sle.is_cancelled = 0
            AND sle.posting_datetime <= %s
            AND sle.item_code LIKE '%%1101%%'
        ORDER BY sle.item_code, sle.posting_date
    """
    
    posting_datetime = get_datetime(add_to_date(to_date, days=1))
    debug_data = frappe.db.sql(debug_query, (posting_datetime,), as_dict=1)
    
    # Group by common code and calculate totals
    totals = {}
    for d in debug_data:
        code = d.common_code
        if code not in totals:
            totals[code] = {"total_qty": 0, "count": 0, "items": []}
        
        totals[code]["total_qty"] += d.actual_qty or 0
        totals[code]["count"] += 1
        totals[code]["items"].append(d.item_code)
    
    return {
        "debug_data": debug_data[:50],  # First 50 records
        "totals": totals,
        "query_used": debug_query
    }

@frappe.whitelist()
def validate_aggregation_accuracy(filters=None):
    """
    Validation function to compare aggregated stock data with ERPNext batch-wise logic
    """
    if isinstance(filters, str):
        filters = json.loads(filters)
    
    # Get SLE data for comparison using same logic as batch report
    sle_query = """
        SELECT 
            sle.item_code,
            sle.posting_date,
            SUM(sle.actual_qty) as actual_qty,
            SUBSTRING(sle.item_code, 2, 4) as common_code,
            LEFT(sle.item_code, 1) as prefix
        FROM `tabStock Ledger Entry` sle
        INNER JOIN `tabItem` i ON sle.item_code = i.name
        WHERE 
            sle.docstatus < 2
            AND sle.is_cancelled = 0
            AND (sle.item_code LIKE 'P%' OR sle.item_code LIKE 'F%' OR sle.item_code LIKE 'T%')
            AND i.item_group IN ('Mat', 'Products', 'Finished Product', 'Finished Products')
        GROUP BY sle.voucher_no, sle.item_code, sle.posting_date
        ORDER BY sle.item_code, sle.posting_date
    """
    
    sle_data = frappe.db.sql(sle_query, as_dict=1)
    return {"sle_count": len(sle_data), "message": "Validation using Stock Ledger Entries only"}

@frappe.whitelist()
def get_aggregated_stock_data(filters=None):
    """
    Get aggregated stock movement data grouped by item prefix and common code
    - P items = Products
    - F items = Finished Product  
    - T items = Mat
    Same item code (e.g., 1101) in different stages (P1101, F1101, T1101)
    """
    if isinstance(filters, str):
        filters = json.loads(filters)
    
    # Default filters
    if not filters:
        filters = {}
    
    from_date = filters.get("from_date")
    to_date = filters.get("to_date")
    warehouse = filters.get("warehouse")
    warehouse_type = filters.get("warehouse_type")
    exclude_problematic_batches = filters.get("exclude_problematic_batches", True)
    
    # Set default dates if not provided
    if not from_date:
        from_date = "1900-01-01"
    if not to_date:
        to_date = frappe.utils.nowdate()

    # **NEW: Get excluded batches**
    excluded_batches = []
    excluded_batches_count = 0
    if exclude_problematic_batches:
        excluded_batches = frappe.get_all(
            "Excluded Stock Batch",
            filters={"status": "Active"},
            pluck="batch_no"
        )
        excluded_batches_count = len(excluded_batches)

    # Step 1: Get all stock ledger entries using simple, direct approach
    posting_datetime = get_datetime(add_to_date(to_date, days=1))
    
    # Build warehouse condition
    warehouse_condition = ""
    warehouse_params = []
    
    if warehouse:
        # **UPDATED: Support warehouse groups - get all child warehouses**
        warehouses = get_child_warehouses(warehouse)
        if warehouses:
            warehouse_placeholders = ', '.join(['%s'] * len(warehouses))
            warehouse_condition = f"AND sle.warehouse IN ({warehouse_placeholders})"
            warehouse_params.extend(warehouses)
    elif warehouse_type:
        # Get all warehouses of this type
        warehouses = frappe.get_all(
            "Warehouse",
            filters={"warehouse_type": warehouse_type, "is_group": 0},
            pluck="name"
        )
        if warehouses:
            warehouse_placeholders = ', '.join(['%s'] * len(warehouses))
            warehouse_condition = f"AND sle.warehouse IN ({warehouse_placeholders})"
            warehouse_params.extend(warehouses)
    
    # **NEW: Add batch exclusion condition**
    batch_exclusion_condition = ""
    if excluded_batches:
        excluded_batch_placeholders = ', '.join(['%s'] * len(excluded_batches))
        batch_exclusion_condition = f"AND (sle.batch_no IS NULL OR sle.batch_no NOT IN ({excluded_batch_placeholders}))"
        warehouse_params.extend(excluded_batches)
    
    # Simplified query - Filter by item groups ONLY for performance
    sle_query = """
        SELECT 
            sle.item_code,
            sle.warehouse,
            sle.batch_no,
            sle.posting_date,
            sle.actual_qty,
            SUBSTRING(sle.item_code, 2, 4) as common_code,
            LEFT(sle.item_code, 1) as prefix,
            i.stock_uom,
            i.item_group,
            sle.voucher_type,
            sle.voucher_no
        FROM `tabStock Ledger Entry` sle
        INNER JOIN `tabItem` i ON sle.item_code = i.name
        WHERE 
            sle.docstatus < 2
            AND sle.is_cancelled = 0
            AND sle.posting_datetime < %s
            AND i.item_group IN ('Mat', 'Products', 'Finished Product')
            AND i.disabled = 0
            {warehouse_condition}
            {batch_exclusion_condition}
        ORDER BY sle.item_code, sle.posting_date, sle.posting_time
    """.format(warehouse_condition=warehouse_condition, batch_exclusion_condition=batch_exclusion_condition)
    
    # Prepare query parameters
    query_params = [posting_datetime] + warehouse_params
    sle_data = frappe.db.sql(sle_query, query_params, as_dict=1)
    
    # Step 2: Get Mat conversion factors
    conversion_factors = get_mat_kg_to_nos_conversion_factors()
    
    # Step 3: Process data using simplified aggregation logic
    from_date_obj = getdate(from_date)
    to_date_obj = getdate(to_date)
    
    # Create item-warehouse-batch map for proper calculation
    iwb_map = {}
    
    for d in sle_data:
        if not d.common_code:
            continue
            
        # Create unique key for item-warehouse-batch combination
        key = f"{d.item_code}#{d.warehouse}#{d.batch_no or 'NO_BATCH'}"
        
        if key not in iwb_map:
            iwb_map[key] = frappe._dict({
                "item_code": d.item_code,
                "warehouse": d.warehouse,
                "batch_no": d.batch_no,
                "opening_qty": 0.0, 
                "in_qty": 0.0, 
                "out_qty": 0.0, 
                "bal_qty": 0.0,
                "common_code": d.common_code,
                "prefix": d.prefix,
                "stock_uom": d.stock_uom,
                "item_group": d.item_group
            })
        
        qty_dict = iwb_map[key]
        posting_date = getdate(d.posting_date)
        actual_qty = flt(d.actual_qty)
        
        # Date-based calculation
        if posting_date < from_date_obj:
            qty_dict.opening_qty += actual_qty
        elif posting_date >= from_date_obj and posting_date <= to_date_obj:
            if actual_qty > 0:
                qty_dict.in_qty += actual_qty
            else:
                qty_dict.out_qty += abs(actual_qty)
        
        # Balance quantity is cumulative
        qty_dict.bal_qty += actual_qty
    
    # Step 4: Aggregate by common code and prefix
    aggregated_data = {}
    grand_total = {
        "Finished Product": {"opening_qty": 0, "incoming_qty": 0, "outgoing_qty": 0, "closing_qty": 0},
        "Mat": {"opening_qty": 0, "incoming_qty": 0, "outgoing_qty": 0, "closing_qty": 0},
        "Products": {"opening_qty": 0, "incoming_qty": 0, "outgoing_qty": 0, "closing_qty": 0},
        "opening_qty": 0, "incoming_qty": 0, "outgoing_qty": 0, "closing_qty": 0
    }
    
    # Conversion tracking
    conversion_applied = 0
    conversion_skipped = 0
    conversion_details = []
    
    # **NEW: Pre-process ALL Mat items for conversion (including opening balances)**
    for key, qty_dict in iwb_map.items():
        if qty_dict.item_group == "Mat" and qty_dict.batch_no and qty_dict.batch_no != "NO_BATCH":
            batch_no = qty_dict.batch_no
            if batch_no in conversion_factors:
                conversion_factor = conversion_factors[batch_no]['conversion_factor']
                if conversion_factor > 0:
                    # Apply conversion to ALL quantities
                    qty_dict.opening_qty = qty_dict.opening_qty * conversion_factor
                    qty_dict.in_qty = qty_dict.in_qty * conversion_factor
                    qty_dict.out_qty = qty_dict.out_qty * conversion_factor
                    qty_dict.bal_qty = qty_dict.bal_qty * conversion_factor
                    qty_dict.converted = True
                    conversion_applied += 1
                    
                    conversion_details.append({
                        "batch": batch_no,
                        "factor": conversion_factor,
                        "source": conversion_factors[batch_no].get('source', 'Unknown'),
                        "blank_wt": conversion_factors[batch_no].get('blank_wt_gms', 0)
                    })
                else:
                    conversion_skipped += 1
            else:
                conversion_skipped += 1
    
    for key, qty_dict in iwb_map.items():
        if not qty_dict.common_code or not qty_dict.prefix:
            continue
            
        common_code = qty_dict.common_code
        prefix = qty_dict.prefix
        item_group = qty_dict.item_group
        
        # Map item group to report categories
        # Use actual item_group field first, fallback to prefix mapping
        if item_group == "Products":
            group = "Products"
        elif item_group == "Finished Product" or item_group == "Finished Products":
            group = "Finished Product"
        elif item_group == "Mat":
            group = "Mat"
        else:
            # Fallback to prefix mapping for items without proper item_group
            prefix_map = {"P": "Products", "F": "Finished Product", "T": "Mat"}
            group = prefix_map.get(prefix, "Other")
        
        if group == "Other":
            continue
        
        # Create aggregated data structure if it doesn't exist
        if common_code not in aggregated_data:
            aggregated_data[common_code] = {
                "common_code": common_code,
                "Products": {"opening_qty": 0, "incoming_qty": 0, "outgoing_qty": 0, "closing_qty": 0},
                "Finished Product": {"opening_qty": 0, "incoming_qty": 0, "outgoing_qty": 0, "closing_qty": 0},
                "Mat": {"opening_qty": 0, "incoming_qty": 0, "outgoing_qty": 0, "closing_qty": 0},
                "total": {"opening_qty": 0, "incoming_qty": 0, "outgoing_qty": 0, "closing_qty": 0}
            }
        
        # **UPDATED: Use already-converted quantities**
        opening_qty = qty_dict.opening_qty
        incoming_qty = qty_dict.in_qty
        outgoing_qty = qty_dict.out_qty
        closing_qty = qty_dict.bal_qty
        
        # Add quantities to respective group
        aggregated_data[common_code][group]["opening_qty"] += opening_qty
        aggregated_data[common_code][group]["incoming_qty"] += incoming_qty
        aggregated_data[common_code][group]["outgoing_qty"] += outgoing_qty
        aggregated_data[common_code][group]["closing_qty"] += closing_qty
        
        # Update totals for this common_code
        aggregated_data[common_code]["total"]["opening_qty"] += opening_qty
        aggregated_data[common_code]["total"]["incoming_qty"] += incoming_qty
        aggregated_data[common_code]["total"]["outgoing_qty"] += outgoing_qty
        aggregated_data[common_code]["total"]["closing_qty"] += closing_qty
        
        # Update grand totals
        grand_total[group]["opening_qty"] += opening_qty
        grand_total[group]["incoming_qty"] += incoming_qty
        grand_total[group]["outgoing_qty"] += outgoing_qty
        grand_total[group]["closing_qty"] += closing_qty
        
        grand_total["opening_qty"] += opening_qty
        grand_total["incoming_qty"] += incoming_qty
        grand_total["outgoing_qty"] += outgoing_qty
        grand_total["closing_qty"] += closing_qty
    
    # Convert to list for frontend
    result = []
    for code, data in aggregated_data.items():
        result.append(data)
    
    # Calculate conversion statistics
    has_converted_mat_items = conversion_applied > 0
    
    # Analyze conversion sources
    conversion_sources = {}
    for detail in conversion_details:
        source = detail.get('source', 'Unknown')
        if source not in conversion_sources:
            conversion_sources[source] = 0
        conversion_sources[source] += 1
    
    # **NEW: Get debug info about Mat batches without conversion**
    mat_batches_debug = []
    for key, qty_dict in iwb_map.items():
        if qty_dict.item_group == "Mat" and qty_dict.batch_no and qty_dict.batch_no != "NO_BATCH":
            batch_no = qty_dict.batch_no
            if batch_no not in conversion_factors:
                mat_batches_debug.append({
                    "batch_no": batch_no,
                    "item_code": qty_dict.item_code,
                    "qty_kg": qty_dict.bal_qty,
                    "reason": "No conversion factor found in Production Batch Weight"
                })
    
    return {
        "data": result,
        "grand_total": grand_total,
        "mat_uom": "Kg (NOT CONVERTED)" if conversion_skipped > 0 and conversion_applied == 0 else ("Mixed (Nos for converted batches, Kg for unconverted)" if conversion_applied > 0 and conversion_skipped > 0 else ("Nos" if conversion_applied > 0 else "Kg")),
        "has_converted_mat_items": has_converted_mat_items,
        "conversion_factors_count": len(conversion_factors),
        "conversion_applied": conversion_applied,
        "conversion_skipped": conversion_skipped,
        "conversion_sources": conversion_sources,
        "mat_batches_without_conversion": mat_batches_debug[:10],  # First 10 batches
        "warehouse_filter": warehouse or warehouse_type or "All Warehouses",
        "conversion_status": f"⚠️ WARNING: {conversion_skipped} Mat batches remain in Kg (no conversion data). {conversion_applied} batches converted to Nos." if conversion_applied > 0 or conversion_skipped > 0 else "No Mat items found",
        "sle_records_processed": len(sle_data),
        "iwb_combinations": len(iwb_map),
        "excluded_batches_count": excluded_batches_count,
        "note": "F and P items are naturally in Nos. Only T (Mat) items need Kg-to-Nos conversion using Production Batch Weight data."
    }

def get_mat_kg_to_nos_conversion_factors():
    """
    Get conversion factors for Mat items using Moulding Production Entry and Mould Specification.
    
    Logic:
    1. Query Moulding Production Entries that have Stock Entry references
    2. Get avg_blank_wtproduct_gms from linked Mould Specification
    3. Extract T item batch from Stock Entry Detail (TARGET item with t_warehouse)
    4. Calculate conversion: (Kg * 1000) / avg_blank_wt_gms = Number of pieces
    """
    conversion_data = {}
    
    try:
        # Get submitted Moulding Production Entries with mould specifications
        query = """
            SELECT 
                mpe.name as production_entry,
                mpe.scan_lot_number,
                mpe.mould_reference,
                mpe.stock_entry_reference,
                ms.avg_blank_wtproduct_gms,
                ms.spp_ref
            FROM `tabMoulding Production Entry` mpe
            LEFT JOIN `tabMould Specification` ms ON mpe.mould_reference = ms.mould_ref
            WHERE mpe.docstatus = 1
                AND mpe.stock_entry_reference IS NOT NULL 
                AND mpe.mould_reference IS NOT NULL 
                AND mpe.mould_reference != ''
                AND ms.avg_blank_wtproduct_gms IS NOT NULL
                AND ms.avg_blank_wtproduct_gms != ''
                AND ms.avg_blank_wtproduct_gms != '0'
            ORDER BY mpe.creation DESC
        """
        
        data = frappe.db.sql(query, as_dict=1)
        
        frappe.log_error(f"Found {len(data)} Moulding Production Entries with blank weight data", "Aggregated Stock Movement")
        
        for row in data:
            try:
                # **CORRECTED: Get T item batch from Stock Entry Detail TARGET items (t_warehouse)**
                # Moulding Production Entry produces T items as finished goods
                t_item_data = frappe.db.sql("""
                    SELECT sed.item_code, sed.batch_no, sed.qty, i.item_group
                    FROM `tabStock Entry Detail` sed
                    INNER JOIN `tabItem` i ON sed.item_code = i.name
                    WHERE sed.parent = %s 
                        AND sed.t_warehouse IS NOT NULL
                        AND sed.s_warehouse IS NULL
                        AND (sed.item_code LIKE 'T%%' OR i.item_group = 'Mat')
                    ORDER BY sed.idx
                    LIMIT 1
                """, (row.stock_entry_reference,), as_dict=True)
                
                if t_item_data:
                    t_item = t_item_data[0]
                    t_batch_no = t_item.batch_no
                    t_item_code = t_item.item_code
                    
                    # Validate blank weight
                    blank_wt_float = float(row.avg_blank_wtproduct_gms)
                    if blank_wt_float > 0 and t_batch_no:
                        # Formula: (Kg * 1000) / avg_blank_wt_gms = Number of pieces
                        conversion_factor = 1000.0 / blank_wt_float
                        
                        conversion_data[t_batch_no] = {
                            'conversion_factor': conversion_factor,
                            'scan_lot_number': row.scan_lot_number,
                            'mould_reference': row.mould_reference,
                            'item_code': t_item_code,
                            'blank_wt_gms': blank_wt_float,
                            'spp_ref': row.spp_ref,
                            'production_entry': row.production_entry,
                            'source': 'Moulding Production Entry + Mould Specification'
                        }
                        
            except (ValueError, TypeError, AttributeError) as e:
                # Skip invalid entries
                frappe.log_error(f"Error processing entry {row.get('production_entry', 'Unknown')}: {str(e)}", "Aggregated Stock Movement")
                continue
        
        frappe.log_error(f"Successfully created conversion factors for {len(conversion_data)} batches", "Aggregated Stock Movement")
    
    except Exception as e:
        frappe.log_error(f"Error in get_mat_kg_to_nos_conversion_factors: {str(e)}", "Aggregated Stock Movement")
        return {}
    
    return conversion_data

def get_child_warehouses(warehouse):
    """
    Get all child warehouses for a given warehouse (including the warehouse itself).
    If warehouse is a group, returns all non-group child warehouses.
    If warehouse is not a group, returns just the warehouse itself.
    """
    if not warehouse:
        return []
    
    # Check if this warehouse is a group
    warehouse_doc = frappe.db.get_value("Warehouse", warehouse, ["is_group"], as_dict=True)
    
    if not warehouse_doc:
        return [warehouse]
    
    if warehouse_doc.get("is_group"):
        # Get all child warehouses recursively
        child_warehouses = frappe.db.sql("""
            SELECT name
            FROM `tabWarehouse`
            WHERE lft >= (SELECT lft FROM `tabWarehouse` WHERE name = %s)
                AND rgt <= (SELECT rgt FROM `tabWarehouse` WHERE name = %s)
                AND is_group = 0
                AND disabled = 0
        """, (warehouse, warehouse), as_dict=True)
        
        return [w.name for w in child_warehouses]
    else:
        # Not a group, return just this warehouse
        return [warehouse]

@frappe.whitelist()
def get_common_code_details(common_code, filters=None):
    """
    Return distinct item codes (with names, prefix, item_group) and a sample of Stock Ledger Entries
    that contribute to the given common_code, respecting the same filters (date range and warehouse).
    """
    if not common_code:
        return {"items": [], "sle_samples": [], "counts": {"items": 0, "sle": 0}}

    if isinstance(filters, str):
        filters = json.loads(filters)

    filters = filters or {}
    from_date = filters.get("from_date") or "1900-01-01"
    to_date = filters.get("to_date") or frappe.utils.nowdate()
    warehouse = filters.get("warehouse")
    warehouse_type = filters.get("warehouse_type")

    posting_datetime = get_datetime(add_to_date(to_date, days=1))

    # Build warehouse condition
    warehouse_condition = ""
    warehouse_params = []
    if warehouse:
        # **UPDATED: Support warehouse groups - get all child warehouses**
        warehouses = get_child_warehouses(warehouse)
        if warehouses:
            placeholders = ", ".join(["%s"] * len(warehouses))
            warehouse_condition = f"AND sle.warehouse IN ({placeholders})"
            warehouse_params.extend(warehouses)
    elif warehouse_type:
        warehouses = frappe.get_all(
            "Warehouse", filters={"warehouse_type": warehouse_type, "is_group": 0}, pluck="name"
        )
        if warehouses:
            placeholders = ", ".join(["%s"] * len(warehouses))
            warehouse_condition = f"AND sle.warehouse IN ({placeholders})"
            warehouse_params.extend(warehouses)

    # Distinct items participating for this common_code
    items_query = f"""
        SELECT DISTINCT
            i.name AS item_code,
            i.item_name,
            LEFT(i.name, 1) AS prefix,
            i.item_group,
            i.stock_uom
        FROM `tabStock Ledger Entry` sle
        INNER JOIN `tabItem` i ON i.name = sle.item_code
        WHERE sle.docstatus < 2
          AND sle.is_cancelled = 0
          AND sle.posting_datetime < %s
          AND SUBSTRING(sle.item_code, 2, 4) = %s
          AND (sle.item_code LIKE 'P%%' OR sle.item_code LIKE 'F%%' OR sle.item_code LIKE 'T%%' OR i.item_group IN ('Products','Finished Product','Mat'))
          {warehouse_condition}
        ORDER BY prefix, i.name
    """

    items_params = [posting_datetime, common_code] + warehouse_params
    items = frappe.db.sql(items_query, items_params, as_dict=1)

    # Sample SLE rows for context
    sle_query = f"""
        SELECT 
            sle.posting_date,
            sle.posting_time,
            sle.item_code,
            sle.warehouse,
            sle.batch_no,
            sle.actual_qty,
            sle.voucher_type,
            sle.voucher_no
        FROM `tabStock Ledger Entry` sle
        WHERE sle.docstatus < 2
          AND sle.is_cancelled = 0
          AND sle.posting_datetime < %s
          AND SUBSTRING(sle.item_code, 2, 4) = %s
          {warehouse_condition}
        ORDER BY sle.posting_date DESC, sle.posting_time DESC
        LIMIT 100
    """

    sle_params = [posting_datetime, common_code] + warehouse_params
    sle_samples = frappe.db.sql(sle_query, sle_params, as_dict=1)

    return {
        "items": items,
        "sle_samples": sle_samples,
        "counts": {"items": len(items), "sle": len(sle_samples)},
        "applied_filters": {
            "from_date": from_date,
            "to_date": to_date,
            "warehouse": warehouse,
            "warehouse_type": warehouse_type,
        },
    }

@frappe.whitelist()
def get_batch_details_by_common_code(common_code, filters=None):
    """
    Get batch-wise details (Opening | In | Out | Balance) for a specific common code
    Shows all batches across Mat, Products, and Finished Product stages
    """
    if not common_code:
        return {"batches": [], "total_batches": 0}
    
    if isinstance(filters, str):
        filters = json.loads(filters)
    
    filters = filters or {}
    from_date = filters.get("from_date") or "1900-01-01"
    to_date = filters.get("to_date") or frappe.utils.nowdate()
    warehouse = filters.get("warehouse")
    warehouse_type = filters.get("warehouse_type")
    exclude_problematic_batches = filters.get("exclude_problematic_batches", True)
    
    posting_datetime = get_datetime(add_to_date(to_date, days=1))
    from_date_obj = getdate(from_date)
    to_date_obj = getdate(to_date)
    
    # Get excluded batches
    excluded_batches = []
    if exclude_problematic_batches:
        excluded_batches = frappe.get_all(
            "Excluded Stock Batch",
            filters={"status": "Active"},
            pluck="batch_no"
        )
    
    # **FIXED: Don't apply warehouse filter for batch listing - show ALL batches**
    # Build warehouse condition - ONLY used for opening/in/out calculations, not for batch discovery
    warehouse_condition_for_calc = ""
    warehouse_params = []
    
    if warehouse:
        # **UPDATED: Support warehouse groups - get all child warehouses**
        warehouses = get_child_warehouses(warehouse)
        if warehouses:
            warehouse_placeholders = ', '.join(['%s'] * len(warehouses))
            warehouse_condition_for_calc = f"AND sle.warehouse IN ({warehouse_placeholders})"
            warehouse_params.extend(warehouses)
    elif warehouse_type:
        warehouses = frappe.get_all(
            "Warehouse",
            filters={"warehouse_type": warehouse_type, "is_group": 0},
            pluck="name"
        )
        if warehouses:
            warehouse_placeholders = ', '.join(['%s'] * len(warehouses))
            warehouse_condition_for_calc = f"AND sle.warehouse IN ({warehouse_placeholders})"
            warehouse_params.extend(warehouses)
    
    # **FIXED: Query batch-level data WITHOUT date/warehouse filters to show ALL batches**
    # We'll calculate opening/in/out/balance based on ALL movements, not just filtered ones
    batch_query = f"""
        SELECT 
            sle.item_code,
            sle.batch_no,
            sle.warehouse,
            sle.posting_date,
            sle.actual_qty,
            LEFT(sle.item_code, 1) as prefix,
            i.item_group,
            i.stock_uom,
            i.item_name
        FROM `tabStock Ledger Entry` sle
        INNER JOIN `tabItem` i ON sle.item_code = i.name
        WHERE 
            sle.docstatus < 2
            AND sle.is_cancelled = 0
            AND SUBSTRING(sle.item_code, 2, 4) = %s
            AND i.item_group IN ('Mat', 'Products', 'Finished Product')
            AND i.disabled = 0
            AND sle.batch_no IS NOT NULL
            AND sle.batch_no != ''
        ORDER BY sle.batch_no, sle.posting_date
    """
    
    # Only pass common_code parameter (no date/warehouse filters)
    query_params = [common_code]
    batch_data = frappe.db.sql(batch_query, query_params, as_dict=1)
    
    # Get Mat conversion factors
    conversion_factors = get_mat_kg_to_nos_conversion_factors()
    
    # **FIXED: Aggregate by batch-item-warehouse combination**
    batch_map = {}
    for row in batch_data:
        batch_no = row.batch_no
        item_code = row.item_code
        warehouse = row.warehouse
        
        # Create unique key for batch-item-warehouse
        key = f"{batch_no}#{item_code}#{warehouse}"
        
        if key not in batch_map:
            batch_map[key] = {
                "batch_no": batch_no,
                "item_code": item_code,
                "item_name": row.item_name,
                "warehouse": warehouse,
                "item_group": row.item_group,
                "stock_uom": row.stock_uom,
                "prefix": row.prefix,
                "opening_qty": 0.0,
                "in_qty": 0.0,
                "out_qty": 0.0,
                "balance_qty": 0.0,
                "is_excluded": batch_no in excluded_batches
            }
        
        batch_info = batch_map[key]
        posting_date = getdate(row.posting_date)
        actual_qty = flt(row.actual_qty)
        
        # Calculate opening, in, out, balance based on date range
        if posting_date < from_date_obj:
            batch_info["opening_qty"] += actual_qty
        elif posting_date >= from_date_obj and posting_date <= to_date_obj:
            if actual_qty > 0:
                batch_info["in_qty"] += actual_qty
            else:
                batch_info["out_qty"] += abs(actual_qty)
        
        batch_info["balance_qty"] += actual_qty
    
    # Apply Mat conversion if needed
    for key, batch_info in batch_map.items():
        if batch_info["item_group"] == "Mat" and batch_info["batch_no"] in conversion_factors:
            conversion_factor = conversion_factors[batch_info["batch_no"]]['conversion_factor']
            if conversion_factor > 0:
                batch_info["opening_qty"] *= conversion_factor
                batch_info["in_qty"] *= conversion_factor
                batch_info["out_qty"] *= conversion_factor
                batch_info["balance_qty"] *= conversion_factor
                batch_info["converted"] = True
                batch_info["conversion_factor"] = conversion_factor
    
    # Convert to list and filter out zero-balance batches
    batches = [b for b in batch_map.values() if abs(b["balance_qty"]) > 0.001]
    
    # Sort: excluded batches last, then by item_group (Mat -> Products -> Finished)
    stage_order = {"Mat": 1, "Products": 2, "Finished Product": 3}
    batches.sort(key=lambda x: (
        x["is_excluded"],
        stage_order.get(x["item_group"], 99),
        x["batch_no"]
    ))
    
    return {
        "batches": batches,
        "total_batches": len(batches),
        "excluded_count": sum(1 for b in batches if b["is_excluded"]),
        "active_count": sum(1 for b in batches if not b["is_excluded"]),
        "warehouse_filter_applied": warehouse or warehouse_type or "All Warehouses",
        "date_range": f"{from_date} to {to_date}"
    }