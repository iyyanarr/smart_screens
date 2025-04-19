import frappe
from frappe import _



@frappe.whitelist()
def get_item_bom(item_code):
    """
    Recursively fetch BOM details for a given item and its child items.

    Args:
        item_code (str): The item code to fetch BOM details for.

    Returns:
        dict: Dictionary containing complete BOM details with child operations.
    """
    # Fetch BOM details for the given item
    parent_bom_details = get_item_bom_details(item_code=item_code)
    print("Parent BOM Details:", parent_bom_details)  # Debug print
    
    # Return the complete BOM details with all child items and their operations
    # This includes both parent and child information in one response
    return parent_bom_details
    
@frappe.whitelist()
def get_boms_by_component_item(item_code):
    """
    Find all BOMs that contain a specific item code in their items child table.
    
    Args:
        item_code (str): The component item code to search for in BOMs.
        
    Returns:
        dict: Dictionary containing a list of BOMs that use the component
    """
    result = {
        "success": False,
        "message": "",
        "data": {
            "item_code": item_code,
            "boms": []
        }
    }
    
    if not item_code:
        result["message"] = "Item code is required"
        return result
    
    # Find all BOMs that contain this item
    bom_items = frappe.get_all(
        "BOM Item", 
        filters={"item_code": item_code, "docstatus": 1},
        fields=["parent", "qty", "uom"]
    )
    
    if not bom_items:
        result["success"] = True
        result["message"] = f"No BOMs found containing item {item_code}"
        return result
    
    # Get details of each BOM that contains this item
    for bom_item in bom_items:
        bom_no = bom_item.parent
        bom = frappe.get_doc("BOM", bom_no)
        
        # Add BOM details to the result
        bom_data = {
            "bom_no": bom_no,
            "parent_item_code": bom.item,
            "parent_item_name": bom.item_name,
            "is_default": bom.is_default,
            "is_active": bom.is_active,
            "component_qty": bom_item.qty,
            "component_uom": bom_item.uom,
            "operations": []
        }
        
        # Get operations if BOM has them
        if bom.with_operations:
            bom_data["operations"] = frappe.get_all(
                "BOM Operation",
                filters={"parent": bom_no},
                fields=["operation", "workstation", "time_in_mins", "operating_cost", "idx"],
                order_by="idx"
            )
        
        result["data"]["boms"].append(bom_data)
    
    result["success"] = True
    result["message"] = f"Found {len(bom_items)} BOMs containing item {item_code}"
    
    return result
    
@frappe.whitelist()
def get_item_bom_details(item_code=None, child_item_code=None):
    """
    A function to get BOM details of an item.
    Can be called with either item_code or child_item_code.
    
    Args:
        item_code (str, optional): The item code to get BOM details for
        child_item_code (str, optional): The child item code to get operations for
    
    Returns:
        dict: Dictionary containing BOM details or error message
    """
    result = {
        "success": False,
        "message": "",
        "data": None
    }
    
    # Check if at least one parameter is provided
    if not item_code and not child_item_code:
        result["message"] = "Either item_code or child_item_code must be provided"
        return result
    
    # If only child_item_code is provided
    if child_item_code and not item_code:
        # Directly find operations for this child item
        bom_items = frappe.get_all(
            "BOM Item", 
            filters={"item_code": child_item_code, "docstatus": 1},
            fields=["parent"]
        )
        
        if not bom_items:
            result["success"] = True  # Changed to True so frontend knows it's a valid response
            result["message"] = f"No BOMs found containing item {child_item_code}"
            result["data"] = {
                "item_code": child_item_code,
                "operations": []
            }
            return result
        
        # Get the first BOM that contains this child item
        bom_no = bom_items[0].parent
        bom = frappe.get_doc("BOM", bom_no)
        
        # Initialize result data with minimal info
        result["success"] = True
        result["message"] = f"Operations for child item {child_item_code} retrieved successfully"
        result["data"] = {
            "item_code": child_item_code,
            "operations": []
        }
        
        # Get operations if BOM has them
        if bom.with_operations:
            result["data"]["operations"] = frappe.get_all(
                "BOM Operation",
                filters={"parent": bom_no},
                fields=["operation", "workstation", "time_in_mins", "operating_cost", "idx"],
                order_by="idx"
            )
        
        return result
    
    # If item_code is provided, get full BOM details
    # Get default BOM for the item
    bom_no = frappe.get_value("BOM", {"item": item_code, "is_default": 1, "is_active": 1, "docstatus": 1}, "name")
    
    if not bom_no:
        # Return a successful response with empty BOM data structure
        result["success"] = True  # Changed to True for consistent handling in frontend
        result["message"] = f"No default BOM found for item {item_code}"
        result["data"] = {
            "bom_no": None,
            "item_code": item_code,
            "item_name": frappe.get_value("Item", item_code, "item_name") or item_code,
            "operations": [],
            "items": []
        }
        return result
    
    # Get BOM details
    bom = frappe.get_doc("BOM", bom_no)
    
    # Initialize result data
    result["success"] = True
    result["message"] = f"BOM details retrieved successfully"
    result["data"] = {
        "bom_no": bom_no,
        "item_code": bom.item,
        "item_name": bom.item_name,
        "operations": [],
        "items": []
    }
    
    # Get items from BOM
    for item in bom.items:
        item_data = {
            "item_code": item.item_code,
            "item_name": item.item_name,
            "qty": item.qty,
            "uom": item.uom,
          
            "amount": item.amount
        }
        
        # Get child item details by calling get_item_bom_details with the child item code
        child_item_details = get_item_bom_details(child_item_code=item.item_code)
        if child_item_details["success"]:
            item_data["operations"] = child_item_details["data"]["operations"]
        
        result["data"]["items"].append(item_data)
    
    return result