import frappe
from frappe import _
import json

@frappe.whitelist()
def get_aggregated_stock_data(filters=None):
    """
    Get aggregated stock movement data for items grouped by their item code suffix
    (Products, Finished Products, and Mat)
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

    # Query to get all stock entries within the date range - using proper escaping for % signs
    query = """
        SELECT 
            i.name as item_code,
            i.item_name,
            i.item_group,
            i.description,
            SUBSTRING(i.name, 2, 4) as common_code,
            SUM(CASE 
                WHEN sle.posting_date < %(from_date)s THEN sle.actual_qty
                ELSE 0 
            END) as opening_qty,
            SUM(CASE 
                WHEN sle.posting_date >= %(from_date)s AND sle.posting_date <= %(to_date)s AND sle.actual_qty > 0 
                THEN sle.actual_qty 
                ELSE 0 
            END) as incoming_qty,
            SUM(CASE 
                WHEN sle.posting_date >= %(from_date)s AND sle.posting_date <= %(to_date)s AND sle.actual_qty < 0 
                THEN ABS(sle.actual_qty) 
                ELSE 0 
            END) as outgoing_qty,
            SUM(CASE 
                WHEN sle.posting_date <= %(to_date)s THEN sle.actual_qty
                ELSE 0 
            END) as closing_qty
        FROM `tabItem` i
        LEFT JOIN `tabStock Ledger Entry` sle ON i.name = sle.item_code
        WHERE 
            (i.name LIKE 'P%%' OR i.name LIKE 'F%%' OR i.name LIKE 'T%%') AND
            (sle.posting_date IS NULL OR sle.posting_date <= %(to_date)s)
        GROUP BY i.name, i.item_name, i.item_group, i.description, common_code
    """
    
    params = {
        "from_date": from_date,
        "to_date": to_date
    }
    
    stock_data = frappe.db.sql(query, params, as_dict=1)
    
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
        "grand_total": grand_total
    }