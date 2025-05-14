import frappe
from frappe import _
import json

@frappe.whitelist()
def get_stock_data(filters=None):
    """
    Get aggregated stock movement data for items in Batch, Compound, and Master Batch item groups
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
    valid_item_groups = ['Batch', 'Compound', 'Master Batch']
    
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

    # Query to get all stock entries within the date range with the selected item groups
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
            i.item_group IN ({})  AND
            (sle.posting_date IS NULL OR sle.posting_date <= %(to_date)s)
        GROUP BY i.name, i.item_name, i.item_group, i.description, common_code
    """.format(group_list)
    
    params = {
        "from_date": from_date,
        "to_date": to_date
    }
    
    stock_data = frappe.db.sql(query, params, as_dict=1)
    
    # Aggregate data by common code and item group
    aggregated_data = {}
    grand_total = {
        "Batch": {
            "opening_qty": 0,
            "incoming_qty": 0,
            "outgoing_qty": 0,
            "closing_qty": 0
        },
        "Compound": {
            "opening_qty": 0,
            "incoming_qty": 0,
            "outgoing_qty": 0,
            "closing_qty": 0
        },
        "Master Batch": {
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
        if not item.item_code or not item.common_code:
            continue
            
        item_group = item.item_group
        common_code = item.common_code
        
        # Determine which category this item belongs to
        category = None
        if item_group == "Batch" or item_group in [child for child in item_group_children if 'batch' in child.lower() and 'master' not in child.lower()]:
            category = "Batch"
        elif item_group == "Compound" or item_group in [child for child in item_group_children if 'compound' in child.lower()]:
            category = "Compound"
        elif item_group == "Master Batch" or item_group in [child for child in item_group_children if 'master' in child.lower() and 'batch' in child.lower()]:
            category = "Master Batch"
        
        # Skip items that don't fit our categories
        if not category:
            continue
        
        # Create aggregated data structure if it doesn't exist
        if common_code not in aggregated_data:
            aggregated_data[common_code] = {
                "common_code": common_code,
                "Batch": {
                    "opening_qty": 0,
                    "incoming_qty": 0,
                    "outgoing_qty": 0,
                    "closing_qty": 0
                },
                "Compound": {
                    "opening_qty": 0,
                    "incoming_qty": 0,
                    "outgoing_qty": 0,
                    "closing_qty": 0
                },
                "Master Batch": {
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
        aggregated_data[common_code][category]["opening_qty"] += item.opening_qty or 0
        aggregated_data[common_code][category]["incoming_qty"] += item.incoming_qty or 0
        aggregated_data[common_code][category]["outgoing_qty"] += item.outgoing_qty or 0
        aggregated_data[common_code][category]["closing_qty"] += item.closing_qty or 0
        
        # Update totals for this common_code
        aggregated_data[common_code]["total"]["opening_qty"] += item.opening_qty or 0
        aggregated_data[common_code]["total"]["incoming_qty"] += item.incoming_qty or 0
        aggregated_data[common_code]["total"]["outgoing_qty"] += item.outgoing_qty or 0
        aggregated_data[common_code]["total"]["closing_qty"] += item.closing_qty or 0
        
        # Update grand totals for the category
        grand_total[category]["opening_qty"] += item.opening_qty or 0
        grand_total[category]["incoming_qty"] += item.incoming_qty or 0
        grand_total[category]["outgoing_qty"] += item.outgoing_qty or 0
        grand_total[category]["closing_qty"] += item.closing_qty or 0
        
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