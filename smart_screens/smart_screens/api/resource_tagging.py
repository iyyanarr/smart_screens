import frappe
from frappe import _

@frappe.whitelist()
def get_resource_tagging_fields(item_code, operation, sublot_number, employee_id):
    """
    Fetch all additional fields required for Lot Resource Tagging
    
    Args:
        item_code (str): Item code
        operation (str): Operation name
        sublot_number (str): Sub-lot number
        employee_id (str): Employee ID
        
    Returns:
        dict: Additional fields for Lot Resource Tagging
    """
    try:
        result = {
            "workstation": "",
            "bom_no": "",
            "spp_batch_no": "",
            "work_order_ref": "",
            "stock_entry_ref": "",
            "qty_after_rejection_nos": 0,
            "job_card": ""
        }
        
        # 1. Get BOM details for the item
        bom_details = get_bom_details(item_code, operation)
        if bom_details:
            result["bom_no"] = bom_details.get("bom_no", "")
            result["workstation"] = bom_details.get("workstation", "")
        
        # 2. Get Sub Lot Entry details to fetch work_order, stock_entry, etc.
        sublot_entry = get_sublot_entry_details(sublot_number)
        if sublot_entry:
            result["spp_batch_no"] = sublot_entry.get("batch", "") or sublot_entry.get("sublot_batch", "")
            result["stock_entry_ref"] = sublot_entry.get("stockentry_ref", "")
            result["qty_after_rejection_nos"] = sublot_entry.get("final_sublot_qty", 0) or sublot_entry.get("sublot_qty", 0)
            
            # Try to get work order from Sub Lot Process if it exists
            work_order = get_work_order_from_sublot(sublot_entry.get("name"))
            if work_order:
                result["work_order_ref"] = work_order
        
        return {
            "status": "success",
            "data": result
        }
        
    except Exception as e:
        frappe.log_error(f"Error in get_resource_tagging_fields: {str(e)}", "Resource Tagging API Error")
        return {
            "status": "error",
            "message": str(e)
        }

def get_bom_details(item_code, operation):
    """Get BOM number and workstation for the item and operation"""
    try:
        # Get active default BOM for the item
        bom = frappe.get_all(
            "BOM",
            filters={
                "item": item_code,
                "is_active": 1,
                "is_default": 1
            },
            fields=["name"],
            limit=1
        )
        
        if not bom:
            return None
        
        bom_no = bom[0].name
        
        # Get workstation for this operation from BOM operations
        bom_operation = frappe.get_all(
            "BOM Operation",
            filters={
                "parent": bom_no,
                "operation": operation
            },
            fields=["workstation"],
            limit=1
        )
        
        workstation = ""
        if bom_operation and bom_operation[0].get("workstation"):
            workstation = bom_operation[0].get("workstation")
        
        return {
            "bom_no": bom_no,
            "workstation": workstation
        }
        
    except Exception as e:
        frappe.log_error(f"Error getting BOM details: {str(e)}", "Resource Tagging Error")
        return None

def get_sublot_entry_details(sublot_number):
    """Get Sub Lot Entry details by sublot number"""
    try:
        # Search by sublot_number field
        sublot_entry = frappe.get_all(
            "Sub Lot Entry",
            filters={
                "sublot_number": sublot_number,
                "docstatus": 1
            },
            fields=[
                "name",
                "batch",
                "sublot_batch",
                "sublot_qty",
                "final_sublot_qty",
                "stockentry_ref",
                "source_document",
                "source_document_name"
            ],
            limit=1
        )
        
        if not sublot_entry:
            return None
        
        return sublot_entry[0]
        
    except Exception as e:
        frappe.log_error(f"Error getting sublot entry details: {str(e)}", "Resource Tagging Error")
        return None

def get_work_order_from_sublot(sublot_entry_name):
    """Get work order reference from Sub Lot Process or Sub Lot Entry"""
    try:
        # First check if there's a Sub Lot Process linked to this Sub Lot Entry
        sublot_entry = frappe.get_doc("Sub Lot Entry", sublot_entry_name)
        
        # Check if source document is Sub Lot Process
        if sublot_entry.source_document == "Sub Lot Process" and sublot_entry.source_document_name:
            # Get work order from Sub Lot Process
            sublot_process = frappe.get_value(
                "Sub Lot Process",
                sublot_entry.source_document_name,
                "work_order"
            )
            
            if sublot_process:
                return sublot_process
        
        # Alternative: Search for work orders that reference this sublot
        work_orders = frappe.get_all(
            "Work Order",
            filters={
                "production_item": sublot_entry.item_code,
                "docstatus": 1
            },
            fields=["name"],
            order_by="creation desc",
            limit=1
        )
        
        if work_orders:
            return work_orders[0].name
        
        return ""
        
    except Exception as e:
        frappe.log_error(f"Error getting work order: {str(e)}", "Resource Tagging Error")
        return ""
