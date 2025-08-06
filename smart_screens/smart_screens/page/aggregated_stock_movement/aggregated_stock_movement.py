import frappe
from frappe import _
from frappe.utils import getdate, flt, add_to_date, get_datetime
import json

@frappe.whitelist()
def validate_aggregation_accuracy(filters=None):
    """
    Validation function to compare aggregated stock data with current bin data
    """
    if isinstance(filters, str):
        filters = json.loads(filters)
    
    # Get current bin totals for comparison
    bin_query = """
        SELECT 
            SUBSTRING(b.item_code, 2, 4) as common_code,
            LEFT(b.item_code, 1) as prefix,
            SUM(b.actual_qty) as total_qty
        FROM `tabBin` b
        INNER JOIN `tabItem` i ON b.item_code = i.name
        WHERE 
            (b.item_code LIKE 'P%' OR b.item_code LIKE 'F%' OR b.item_code LIKE 'T%')
            AND i.item_group IN ('Mat', 'Products', 'Finished Product', 'Finished Products')
        GROUP BY common_code, prefix
    """
    
    bin_data = frappe.db.sql(bin_query, as_dict=1)
    return {"bin_data": bin_data}

@frappe.whitelist()
def get_aggregated_stock_data(filters=None):
    """
    Get aggregated stock movement data for items grouped by their item code prefix
    and belonging to specific item groups (Products, Finished Product, and Mat)
    Using ERPNext's proven approach from batch-wise balance history
    """
    if isinstance(filters, str):
        filters = json.loads(filters)
    
    # Default filters
    if not filters:
        filters = {}
    
    from_date = filters.get("from_date")
    to_date = filters.get("to_date")
    
    # Set default dates if not provided
    if not from_date:
        from_date = "1900-01-01"
    if not to_date:
        to_date = frappe.utils.nowdate()

    # Get the list of item groups we want to include
    valid_item_groups = ['Mat', 'Products', 'Finished Product', 'Finished Products']
    
    # Get valid item group children
    item_group_children = []
    for group in valid_item_groups:
        children = frappe.db.sql("""
            SELECT name FROM `tabItem Group`
            WHERE parent_item_group = %s
        """, group, as_dict=1)
        item_group_children.extend([child.name for child in children])
    
    # Combine parent and child item groups
    all_valid_groups = valid_item_groups + item_group_children
    
    # Convert to SQL-safe format for IN clause
    group_list = ', '.join(["'" + group.replace("'", "''") + "'" for group in all_valid_groups])

    # Step 1: Get all stock ledger entries (ERPNext approach)
    # Learning: ERPNext loads all SLE data once and processes in memory
    # This is more accurate than trying to aggregate in SQL
    posting_datetime = get_datetime(add_to_date(to_date, days=1))
    
    sle_query = """
        SELECT 
            sle.item_code,
            sle.posting_date,
            SUM(sle.actual_qty) as actual_qty,
            i.item_name,
            i.item_group,
            i.stock_uom,
            i.description,
            SUBSTRING(i.name, 2, 4) as common_code
        FROM `tabStock Ledger Entry` sle
        INNER JOIN `tabItem` i ON sle.item_code = i.name
        WHERE 
            sle.docstatus < 2
            AND sle.is_cancelled = 0
            AND sle.posting_datetime < %s
            AND (i.name LIKE 'P%%' OR i.name LIKE 'F%%' OR i.name LIKE 'T%%')
            AND i.item_group IN ({})
            AND i.disabled = 0
        GROUP BY sle.voucher_no, sle.item_code, sle.posting_date, 
                 i.item_name, i.item_group, i.stock_uom, i.description
        ORDER BY sle.item_code, sle.posting_date
    """.format(group_list)
    
    sle_data = frappe.db.sql(sle_query, (posting_datetime,), as_dict=1)
    
    # Step 2: Process data in memory (ERPNext approach)    
    from_date_obj = getdate(from_date)
    to_date_obj = getdate(to_date)
    
    # Create item-wise aggregation map
    item_map = {}
    
    for d in sle_data:
        if not d.common_code:
            continue
            
        # Initialize item if not exists
        if d.item_code not in item_map:
            item_map[d.item_code] = frappe._dict({
                "item_code": d.item_code,
                "item_name": d.item_name,
                "item_group": d.item_group,
                "stock_uom": d.stock_uom,
                "description": d.description,
                "common_code": d.common_code,
                "opening_qty": 0.0,
                "incoming_qty": 0.0,
                "outgoing_qty": 0.0,
                "closing_qty": 0.0
            })
        
        qty_dict = item_map[d.item_code]
        posting_date = getdate(d.posting_date)
        
        # ERPNext's date-based calculation logic
        if posting_date < from_date_obj:
            # Opening quantity: all movements before from_date
            qty_dict.opening_qty = flt(qty_dict.opening_qty) + flt(d.actual_qty)
        elif posting_date >= from_date_obj and posting_date <= to_date_obj:
            # Movement quantities: movements within date range
            if flt(d.actual_qty) > 0:
                qty_dict.incoming_qty = flt(qty_dict.incoming_qty) + flt(d.actual_qty)
            else:
                qty_dict.outgoing_qty = flt(qty_dict.outgoing_qty) + abs(flt(d.actual_qty))
        
        # Balance quantity: cumulative of all movements
        qty_dict.closing_qty = flt(qty_dict.closing_qty) + flt(d.actual_qty)
    
    # Convert item_map values to list for further processing
    stock_data = list(item_map.values())
    
    # Get UOM conversion factors for Mat items (items that start with 'T')
    mat_item_codes = [item.item_code for item in stock_data 
                     if item.item_code and item.item_code.startswith('T')]
    
    conversion_factors = {}
    uom_details = {}
    if mat_item_codes:
        # Get UOM details for proper unit handling
        uom_query = """
            SELECT 
                i.name as item_code,
                i.stock_uom,
                ucf.value as conversion_factor,
                ucf.from_uom
            FROM `tabItem` i
            LEFT JOIN `tabUOM Conversion Factor` ucf ON ucf.parent = i.name AND ucf.from_uom = 'Nos'
            WHERE i.name IN ({0})
        """.format(','.join(['%s'] * len(mat_item_codes)))
        
        uom_data = frappe.db.sql(uom_query, mat_item_codes, as_dict=1)
        
        for uom in uom_data:
            uom_details[uom.item_code] = {
                'stock_uom': uom.stock_uom,
                'conversion_factor': uom.conversion_factor or 1,
                'from_uom': uom.from_uom
            }
            # Maintain backward compatibility
            conversion_factors[uom.item_code] = uom.conversion_factor or 1
    
    # Flag to indicate whether we've converted any Mat items
    has_converted_mat_items = False
    mat_uom = "Nos"
    
    # Aggregate data by common code and item group prefix
    aggregated_data = {}
    grand_total = {
        "Finished Product": {
            "opening_qty": 0,
            "incoming_qty": 0,
            "outgoing_qty": 0,
            "closing_qty": 0
        },
        "Mat": {
            "opening_qty": 0,
            "incoming_qty": 0,
            "outgoing_qty": 0,
            "closing_qty": 0
        },
        "Products": {
            "opening_qty": 0,
            "incoming_qty": 0,
            "outgoing_qty": 0,
            "closing_qty": 0
        },
        "opening_qty": 0,
        "incoming_qty": 0,
        "outgoing_qty": 0,
        "closing_qty": 0
    }
    
    for item in stock_data:
        # Get prefix (P, F, or T) and common code (e.g., 5001)
        if not item.item_code:
            continue
            
        prefix = item.item_code[0]
        common_code = item.common_code
        
        if not common_code:
            continue
            
        # Map prefix to item group
        prefix_map = {
            "P": "Products",
            "F": "Finished Product",
            "T": "Mat"
        }
        
        group = prefix_map.get(prefix, "Other")
        
        # Skip items that don't belong to one of our groups
        if group == "Other":
            continue
        
        # Convert Mat items based on stock UOM and conversion factors
        if group == "Mat" and item.item_code in uom_details:
            uom_info = uom_details[item.item_code]
            stock_uom = uom_info['stock_uom']
            
            # Only convert if stock UOM is kg and we have a conversion factor to Nos
            if stock_uom.lower() in ['kg', 'kilogram'] and uom_info['conversion_factor'] > 0:
                cf = uom_info['conversion_factor']
                item.opening_qty = item.opening_qty / cf if item.opening_qty else 0
                item.incoming_qty = item.incoming_qty / cf if item.incoming_qty else 0
                item.outgoing_qty = item.outgoing_qty / cf if item.outgoing_qty else 0
                item.closing_qty = item.closing_qty / cf if item.closing_qty else 0
                has_converted_mat_items = True
                mat_uom = "Nos"
            else:
                # If already in Nos or no conversion needed, keep as is
                mat_uom = stock_uom
        
        # Create aggregated data structure if it doesn't exist
        if common_code not in aggregated_data:
            aggregated_data[common_code] = {
                "common_code": common_code,
                "Products": {
                    "opening_qty": 0,
                    "incoming_qty": 0,
                    "outgoing_qty": 0,
                    "closing_qty": 0
                },
                "Finished Product": {
                    "opening_qty": 0,
                    "incoming_qty": 0,
                    "outgoing_qty": 0,
                    "closing_qty": 0
                },
                "Mat": {
                    "opening_qty": 0,
                    "incoming_qty": 0,
                    "outgoing_qty": 0,
                    "closing_qty": 0
                },
                "total": {
                    "opening_qty": 0,
                    "incoming_qty": 0,
                    "outgoing_qty": 0,
                    "closing_qty": 0
                }
            }
        
        # Add quantities to respective group
        if group in aggregated_data[common_code]:
            aggregated_data[common_code][group]["opening_qty"] += item.opening_qty or 0
            aggregated_data[common_code][group]["incoming_qty"] += item.incoming_qty or 0
            aggregated_data[common_code][group]["outgoing_qty"] += item.outgoing_qty or 0
            aggregated_data[common_code][group]["closing_qty"] += item.closing_qty or 0
            
            # Update totals for this common_code
            aggregated_data[common_code]["total"]["opening_qty"] += item.opening_qty or 0
            aggregated_data[common_code]["total"]["incoming_qty"] += item.incoming_qty or 0
            aggregated_data[common_code]["total"]["outgoing_qty"] += item.outgoing_qty or 0
            aggregated_data[common_code]["total"]["closing_qty"] += item.closing_qty or 0
            
            # Update grand totals for the category
            grand_total[group]["opening_qty"] += item.opening_qty or 0
            grand_total[group]["incoming_qty"] += item.incoming_qty or 0
            grand_total[group]["outgoing_qty"] += item.outgoing_qty or 0
            grand_total[group]["closing_qty"] += item.closing_qty or 0
            
            # Update overall grand totals
            grand_total["opening_qty"] += item.opening_qty or 0
            grand_total["incoming_qty"] += item.incoming_qty or 0
            grand_total["outgoing_qty"] += item.outgoing_qty or 0
            grand_total["closing_qty"] += item.closing_qty or 0
    
    # Convert to list for frontend
    result = []
    for code, data in aggregated_data.items():
        result.append(data)
    
    return {
        "data": result,
        "grand_total": grand_total,
        "mat_uom": mat_uom,
        "has_converted_mat_items": has_converted_mat_items
    }