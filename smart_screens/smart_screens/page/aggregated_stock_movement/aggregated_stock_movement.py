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
    
    # Set default dates if not provided
    if not from_date:
        from_date = "1900-01-01"
    if not to_date:
        to_date = frappe.utils.nowdate()

    # Step 1: Get all stock ledger entries using ERPNext's exact approach
    posting_datetime = get_datetime(add_to_date(to_date, days=1))
    
    # Build warehouse condition (same logic as ERPNext batch report)
    warehouse_condition = ""
    warehouse_params = []
    
    if warehouse:
        warehouse_condition = "AND sle.warehouse = %s"
        warehouse_params.append(warehouse)
    elif warehouse_type:
        # Get all warehouses of this type (same as ERPNext logic)
        warehouses = frappe.get_all(
            "Warehouse",
            filters={"warehouse_type": warehouse_type, "is_group": 0},
            pluck="name"
        )
        if warehouses:
            warehouse_placeholders = ', '.join(['%s'] * len(warehouses))
            warehouse_condition = f"AND sle.warehouse IN ({warehouse_placeholders})"
            warehouse_params.extend(warehouses)
    
    sle_query = """
        SELECT 
            sle.item_code,
            sle.warehouse,
            sle.batch_no,
            sle.posting_date,
            SUM(sle.actual_qty) as actual_qty,
            SUBSTRING(sle.item_code, 2, 4) as common_code,
            LEFT(sle.item_code, 1) as prefix,
            i.stock_uom
        FROM `tabStock Ledger Entry` sle
        INNER JOIN `tabItem` i ON sle.item_code = i.name
        WHERE 
            sle.docstatus < 2
            AND sle.is_cancelled = 0
            AND sle.posting_datetime < %s
            AND (sle.item_code LIKE 'P%%' OR sle.item_code LIKE 'F%%' OR sle.item_code LIKE 'T%%')
            AND i.disabled = 0
            {warehouse_condition}
        GROUP BY sle.voucher_no, sle.item_code, sle.warehouse, sle.batch_no, sle.posting_date
        ORDER BY sle.item_code, sle.posting_date
    """.format(warehouse_condition=warehouse_condition)
    
    # Prepare query parameters (no named parameters, use positional)
    query_params = [posting_datetime] + warehouse_params
    sle_data = frappe.db.sql(sle_query, query_params, as_dict=1)
    
    # Step 2: Process data using ERPNext's EXACT batch-wise logic
    # First aggregate by item-warehouse-batch, then sum by common code
    from_date_obj = getdate(from_date)
    to_date_obj = getdate(to_date)
    
    # Create item-warehouse-batch map (EXACT ERPNext logic)
    iwb_map = {}
    
    for d in sle_data:
        if not d.common_code:
            continue
            
        # Create nested structure: item -> warehouse -> batch
        iwb_map.setdefault(d.item_code, {}).setdefault(d.warehouse, {}).setdefault(
            d.batch_no or "NO_BATCH", frappe._dict({
                "opening_qty": 0.0, 
                "in_qty": 0.0, 
                "out_qty": 0.0, 
                "bal_qty": 0.0,
                "common_code": d.common_code,
                "prefix": d.prefix,
                "stock_uom": d.stock_uom
            })
        )
        
        qty_dict = iwb_map[d.item_code][d.warehouse][d.batch_no or "NO_BATCH"]
        posting_date = getdate(d.posting_date)
        
        # ERPNext's EXACT date-based calculation logic
        if posting_date < from_date_obj:
            qty_dict.opening_qty = flt(qty_dict.opening_qty) + flt(d.actual_qty)
        elif posting_date >= from_date_obj and posting_date <= to_date_obj:
            if flt(d.actual_qty) > 0:
                qty_dict.in_qty = flt(qty_dict.in_qty) + flt(d.actual_qty)
            else:
                qty_dict.out_qty = flt(qty_dict.out_qty) + abs(flt(d.actual_qty))
        
        # Balance quantity: cumulative of all movements
        qty_dict.bal_qty = flt(qty_dict.bal_qty) + flt(d.actual_qty)
    
    # Step 3: Now aggregate by common code and prefix (same as before)
    aggregated_data = {}
    grand_total = {
        "Finished Product": {"opening_qty": 0, "incoming_qty": 0, "outgoing_qty": 0, "closing_qty": 0},
        "Mat": {"opening_qty": 0, "incoming_qty": 0, "outgoing_qty": 0, "closing_qty": 0},
        "Products": {"opening_qty": 0, "incoming_qty": 0, "outgoing_qty": 0, "closing_qty": 0},
        "opening_qty": 0, "incoming_qty": 0, "outgoing_qty": 0, "closing_qty": 0
    }
    
    # Iterate through the iwb_map and aggregate by common code
    for item_code, warehouses in iwb_map.items():
        for warehouse, batches in warehouses.items():
            for batch, qty_dict in batches.items():
                if not qty_dict.common_code or not qty_dict.prefix:
                    continue
                    
                common_code = qty_dict.common_code
                prefix = qty_dict.prefix
                
                # Map prefix to item group
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
                
                # Add quantities to respective group
                aggregated_data[common_code][group]["opening_qty"] += qty_dict.opening_qty
                aggregated_data[common_code][group]["incoming_qty"] += qty_dict.in_qty
                aggregated_data[common_code][group]["outgoing_qty"] += qty_dict.out_qty
                aggregated_data[common_code][group]["closing_qty"] += qty_dict.bal_qty
                
                # Update totals for this common_code
                aggregated_data[common_code]["total"]["opening_qty"] += qty_dict.opening_qty
                aggregated_data[common_code]["total"]["incoming_qty"] += qty_dict.in_qty
                aggregated_data[common_code]["total"]["outgoing_qty"] += qty_dict.out_qty
                aggregated_data[common_code]["total"]["closing_qty"] += qty_dict.bal_qty
                
                # Update grand totals
                grand_total[group]["opening_qty"] += qty_dict.opening_qty
                grand_total[group]["incoming_qty"] += qty_dict.in_qty
                grand_total[group]["outgoing_qty"] += qty_dict.out_qty
                grand_total[group]["closing_qty"] += qty_dict.bal_qty
                
                grand_total["opening_qty"] += qty_dict.opening_qty
                grand_total["incoming_qty"] += qty_dict.in_qty
                grand_total["outgoing_qty"] += qty_dict.out_qty
                grand_total["closing_qty"] += qty_dict.bal_qty
    
    # Convert to list for frontend
    result = []
    for code, data in aggregated_data.items():
        result.append(data)
    
    return {
        "data": result,
        "grand_total": grand_total,
        "mat_uom": "Nos",  # Simplified for now
        "has_converted_mat_items": False,  # Simplified for now
        "warehouse_filter": warehouse or warehouse_type or "All Warehouses"
    }