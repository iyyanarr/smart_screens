import frappe
from frappe import _
from frappe.utils import nowdate, nowtime

def create_work_order_after_sublot(sublot_entry=None, sublot_process=None):
    """
    Create a Work Order after a successful Sub Lot Entry creation.
    
    Args:
        sublot_entry (str): Document name of the Sub Lot Entry
        sublot_process (str): Document name of the Sub Lot Process
        
    Returns:
        dict: Status and details of the work order creation process
    """
    try:
        if not sublot_entry and not sublot_process:
            return {
                "status": "error",
                "message": "Either sublot_entry or sublot_process must be provided"
            }
        
        # Get the source document
        if sublot_entry:
            source_doc = frappe.get_doc("Sub Lot Entry", sublot_entry)
            item_code = source_doc.item_code
            batch_no = source_doc.sublot_batch or source_doc.batch
            warehouse = source_doc.warehouse
            qty = source_doc.final_sublot_qty or source_doc.sublot_qty
        elif sublot_process:
            source_doc = frappe.get_doc("Sub Lot Process", sublot_process)
            item_code = source_doc.item_code
            batch_no = source_doc.sublot_batch_number or source_doc.batch_no
            warehouse = source_doc.warehouse
            qty = source_doc.sublot_qty or source_doc.inspection_quantity
        
        if not item_code:
            return {
                "status": "error", 
                "message": "Item code not found in the source document"
            }
        
        # Get BOM information using the BOM validation utility
        bom_data = frappe.call("smart_screens.smart_screens.utils.bom_validation.get_boms_by_component_item",
            item_code=item_code
        )
        
        if not bom_data or not bom_data.get("success") or not bom_data.get("data") or not bom_data.get("data").get("boms"):
            return {
                "status": "error",
                "message": f"No valid BOM found for item {item_code}"
            }
        
        # Filter BOMs to get active and default ones
        active_boms = [bom for bom in bom_data.get("data").get("boms") if bom.get("is_active") and bom.get("is_default")]
        
        # If no active and default BOMs found, try to get just active ones
        if not active_boms:
            active_boms = [bom for bom in bom_data.get("data").get("boms") if bom.get("is_active")]
        
        # If still no active BOMs found, use all available BOMs
        if not active_boms:
            active_boms = bom_data.get("data").get("boms")
        
        # Get the first filtered BOM
        if not active_boms:
            return {
                "status": "error",
                "message": f"No valid BOM found for item {item_code}"
            }
            
        first_bom = active_boms[0]
        bom_no = first_bom.get("bom_no")
        
        if not bom_no:
            return {
                "status": "error",
                "message": "No BOM number found in BOM data"
            }
        
        # Check if Work Order already exists for this sublot
        existing_work_order = None
        if sublot_entry:
            existing_work_order = frappe.db.exists("Work Order", {
                "sub_lot_entry": sublot_entry
            })
        elif sublot_process:
            existing_work_order = frappe.db.exists("Work Order", {
                "sub_lot_process": sublot_process
            })
        
        if existing_work_order:
            return {
                "status": "warning",
                "message": f"Work Order {existing_work_order} already exists for this sublot",
                "work_order": existing_work_order
            }
        
        # Create the Work Order
        work_order = frappe.new_doc("Work Order")
        work_order.production_item = first_bom.get("parent_item_code")
        work_order.bom_no = bom_no
        work_order.qty = qty
        work_order.skip_transfer = 1  # Skip transfer for sublot processing
        
        # Set source and target warehouses
        work_order.source_warehouse = warehouse
        default_fg_warehouse = frappe.db.get_single_value("Manufacturing Settings", "default_fg_warehouse")
        work_order.fg_warehouse = default_fg_warehouse or warehouse
        
        # Set raw material warehouse
        default_wip_warehouse = frappe.db.get_single_value("Manufacturing Settings", "default_wip_warehouse")
        work_order.wip_warehouse = default_wip_warehouse or warehouse
        
        # Set dates
        work_order.planned_start_date = nowdate()
        
        # Set custom fields for sublot reference
        if sublot_entry:
            work_order.sub_lot_entry = sublot_entry
        if sublot_process:
            work_order.sub_lot_process = sublot_process
        
        # Add raw materials based on BOM
        if first_bom.get("items"):
            for item in first_bom.get("items"):
                work_order.append("required_items", {
                    "item_code": item.get("item_code"),
                    "required_qty": item.get("qty") * qty,
                    "source_warehouse": warehouse
                })
        else:
            # If the BOM doesn't have items, add the component item (for material transfer or processing)
            work_order.append("required_items", {
                "item_code": item_code,
                "required_qty": qty,
                "source_warehouse": warehouse
            })
        
        # Set operations if available in the BOM
        if first_bom.get("operations"):
            for operation in first_bom.get("operations"):
                # Manually map workstations based on operation
                workstation = operation.get("workstation")
                if not workstation:
                    # Default to "Trimming Machine" for common operations
                    if operation.get("operation") in ["ID Trimming", "OD Trimming"]:
                        workstation = "Trimming Machine"
                    elif operation.get("operation") == "Post Curing":
                        workstation = "Oven"
                    elif operation.get("operation") == "Final Visual Inspection":
                        workstation = "Trimming Machine"
                    else:
                        # Fallback workstation for any other operation
                        workstation = "Trimming Machine"
                
                work_order.append("operations", {
                    "operation": operation.get("operation"),
                    "workstation": workstation,
                    "time_in_mins": operation.get("time_in_mins") or 0.01,  # Ensure we have a valid time
                    "status": "Pending"
                })
        
        # Important: Set transfer_material_against to "Job Card" to ensure proper workflow
        work_order.transfer_material_against = "Job Card"
        
        # Save the Work Order first to ensure all operations are created
        work_order.save()
        
        # Optionally add a flag to disable job card creation (if you want to ONLY use your custom job cards)
        # Uncomment this if you don't want ERPNext to create standard job cards
        #frappe.db.set_value("Manufacturing Settings", "Manufacturing Settings", "disable_job_card_creation", 1)
        
        # Save and submit the Work Order
        work_order.submit()
        
        # Explicitly ensure the work order status is updated correctly after submission
        frappe.db.commit()
        
        # Reload the work order to ensure it's properly updated
        work_order = frappe.get_doc("Work Order", work_order.name)
        
        # Double-check status and set it if needed
        if work_order.status == "Draft":
            work_order.db_set("status", "Not Started")
            frappe.db.commit()
        
        # Return success
        return {
            "status": "success",
            "message": f"Work Order {work_order.name} created successfully",
            "work_order": work_order.name
        }
    
    except Exception as e:
        frappe.log_error(f"Error creating Work Order: {str(e)}", "Work Order Creation Error")
        return {
            "status": "error",
            "message": f"Failed to create Work Order: {str(e)}"
        }