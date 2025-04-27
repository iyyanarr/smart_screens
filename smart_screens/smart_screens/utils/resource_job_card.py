import frappe
from frappe import _
from frappe.utils import nowdate, nowtime, getdate, add_days, get_datetime, time_diff_in_hours
import random
from datetime import datetime, timedelta

# Dictionary to track the last end time for each employee
# This prevents time overlaps for the same employee across different job cards
employee_last_end_times = {}

def create_lot_resource_tag_and_inspection_entry(sublot_process, work_order=None):
    """
    Create SPP lot resource tags and SPP final inspection entry for each operation in the Sub Lot Process.
    
    Args:
        sublot_process (str or object): Name of the Sub Lot Process document or the document object
        work_order (str): Name of the Work Order document
        
    Returns:
        dict: Status and details of the creation process
    """
    try:
        # Get the Sub Lot Process document if name is provided
        if isinstance(sublot_process, str):
            sublot_process = frappe.get_doc("Sub Lot Process", sublot_process)
            
        if not sublot_process or not sublot_process.name:
            return {
                "status": "error",
                "message": "Invalid Sub Lot Process provided"
            }
            
        # If no work order is provided, try to get it from the document
        if not work_order and hasattr(sublot_process, 'work_order') and sublot_process.work_order:
            work_order = sublot_process.work_order
            
        # Check if there are operations to process
        if not sublot_process.operations or len(sublot_process.operations) == 0:
            return {
                "status": "warning",
                "message": "No operations found in the Sub Lot Process"
            }
            
        # Track created resources and inspection entries
        created_resources = []
        created_inspection_entries = []
        
        # Store the first lot resource tag for later use with inspection entry
        first_lot_resource_tag = None
        
        # Process each operation
        for op in sublot_process.operations:
            # Skip if operation or employee code is missing
            if not op.operation or not op.employee_code:
                continue
                
            # Create a SPP lot resource tagging entry
            lot_tag = frappe.new_doc("SPP Lot Resource Tagging")
            lot_tag.lot_number = sublot_process.sub_lot_number
            lot_tag.item_code = sublot_process.item_code
            lot_tag.batch_no = sublot_process.batch_no
            lot_tag.warehouse = sublot_process.warehouse
            lot_tag.operation_type = op.operation
            lot_tag.operation = op.operation
            
            # Set the required fields
            lot_tag.posting_date = getdate()
            lot_tag.product_ref = sublot_process.item_code
            
            # Set quantity information
            if hasattr(sublot_process, 'available_quantity') and sublot_process.available_quantity:
                lot_tag.qtynos = sublot_process.available_quantity
                lot_tag.available_qty = sublot_process.available_quantity
            else:
                # Set default values to prevent errors
                lot_tag.qtynos = 1
                lot_tag.available_qty = 1
            
            # Set Work Order reference if available
            if work_order:
                lot_tag.work_order = work_order
                
            # Add the resource from the operation if resources child table exists
            if hasattr(lot_tag, 'resources'):
                lot_tag.append("resources", {
                    "operation": op.operation,
                    "employee": op.employee_code,
                    "employee_name": op.employee_name
                })
            
            # Set source document reference
            lot_tag.source_document = sublot_process.doctype
            lot_tag.source_document_name = sublot_process.name
            
            # Set operator information
            lot_tag.operator_id = op.employee_code
            
            # Get designation from Employee doctype
            employee_designation = ""
            if op.employee_code:
                try:
                    employee_designation = frappe.db.get_value("Employee", op.employee_code, "designation")
                    frappe.logger().info(f"Found designation '{employee_designation}' for employee {op.employee_code}")
                except Exception as e:
                    frappe.logger().error(f"Error getting designation for employee {op.employee_code}: {str(e)}")
            
            lot_tag.designation = employee_designation
            lot_tag.operator_name = op.employee_name
            
            # Save and submit the lot resource tag
            lot_tag.insert()
            lot_tag.submit()
            frappe.db.commit()
            
            created_resources.append(lot_tag.name)
            
            # Store the first lot resource tag for the inspection entry
            if first_lot_resource_tag is None:
                first_lot_resource_tag = lot_tag.name
        
        # Create an SPP Inspection Entry document for Final Visual Inspection if needed
        # Check if the sublot process has rejection items or an inspector
        has_rejection_items = False
        has_inspector = hasattr(sublot_process, 'inspector_code') and sublot_process.inspector_code
        
        for field in ["rejection_items", "rejection_types", "rejections"]:
            if hasattr(sublot_process, field) and getattr(sublot_process, field):
                has_rejection_items = True
                break
                
        if has_rejection_items or has_inspector:
            inspection_entry = create_inspection_entry(
                sublot_process=sublot_process,
                lot_resource_tag=first_lot_resource_tag,
                inspector_id=sublot_process.inspector_code if has_inspector else None
            )
            
            if inspection_entry and inspection_entry.get("status") == "success":
                created_inspection_entries.append(inspection_entry.get("inspection_entry"))
            
        # Return the results
        return {
            "status": "success",
            "message": f"Created {len(created_resources)} SPP resource tags and {len(created_inspection_entries)} SPP inspection entries",
            "resources": created_resources,
            "inspection_entries": created_inspection_entries
        }
    
    except Exception as e:
        frappe.log_error(f"Error creating SPP resource tags and inspection entries: {str(e)}", "Resource Creation Error")
        return {
            "status": "error",
            "message": f"Failed to create SPP resources: {str(e)}"
        }

def create_inspection_entry(sublot_process, lot_resource_tag=None, inspector_id=None):
    """Create an inspection entry for Final Visual Inspection"""
    try:
        # Create the inspection entry
        inspection_entry = frappe.new_doc("SPP Inspection Entry")
        
        # Set basic information
        inspection_entry.posting_date = getdate()
        inspection_entry.inspection_type = "Final Visual Inspection"
        
        # Set source document references
        inspection_entry.source_document = sublot_process.doctype
        inspection_entry.source_document_name = sublot_process.name
        
        # Set product information
        inspection_entry.product_ref_no = sublot_process.item_code
        inspection_entry.batch_no = sublot_process.batch_no
        inspection_entry.lot_no = sublot_process.sub_lot_number
        inspection_entry.scan_inspector = inspector_id  # Set inspector ID if provided
        inspection_entry.scan_production_lot = sublot_process.sub_lot_number
        
        # Set warehouse information
        inspection_entry.warehouse = sublot_process.warehouse
        
        # Set quantity information - Use inspection_quantity field from sublot_process if available
        if hasattr(sublot_process, 'inspection_quantity') and sublot_process.inspection_quantity:
            inspection_entry.inspected_qty_nos = sublot_process.inspection_quantity
            inspection_entry.total_inspected_qty_nos = sublot_process.inspection_quantity
            inspection_entry.available_qty_nos = sublot_process.inspection_quantity
        elif hasattr(sublot_process, 'available_quantity') and sublot_process.available_quantity:
            inspection_entry.inspected_qty_nos = sublot_process.available_quantity
            inspection_entry.total_inspected_qty_nos = sublot_process.available_quantity
            inspection_entry.available_qty_nos = sublot_process.available_quantity
        else:
            # Set default values
            inspection_entry.inspected_qty_nos = 1
            inspection_entry.total_inspected_qty_nos = 1
            inspection_entry.available_qty_nos = 1
        
        # Set rejection details
        inspection_entry.rejected_qty_nos = 0  # Default to 0 rejected quantity
        inspection_entry.rejection_reason = ""  # Empty rejection reason by default
        
        # If sublot_process has rejection details, use those
        if hasattr(sublot_process, 'rejected_quantity') and sublot_process.rejected_quantity:
            inspection_entry.rejected_qty_nos = sublot_process.rejected_quantity
            
        if hasattr(sublot_process, 'rejection_reason') and sublot_process.rejection_reason:
            inspection_entry.rejection_reason = sublot_process.rejection_reason
            
        # Calculate accepted quantity (inspected - rejected)
        if hasattr(inspection_entry, 'inspected_qty_nos') and hasattr(inspection_entry, 'rejected_qty_nos'):
            inspection_entry.accepted_qty_nos = inspection_entry.inspected_qty_nos - inspection_entry.rejected_qty_nos
        
        # Add rejection details from sublot process to the inspection entry
        total_rejected = 0
        if hasattr(sublot_process, 'rejection_items') and sublot_process.rejection_items:
            for item in sublot_process.rejection_items:
                # Add each rejection item from sublot process to inspection entry
                inspection_entry.append("items", {
                    "type_of_defect": item.rejection_type,
                    "rejected_qty": item.quantity,
                    "rejected_qty_kg": 0  # Default to 0 for kg measurement
                })
                # Sum up the rejected quantities
                if hasattr(item, 'rejected_qty'):
                    total_rejected += item.rejected_qty
                elif hasattr(item, 'quantity'):
                    total_rejected += item.quantity
            
            # Update the total rejected quantity
            inspection_entry.rejected_qty_nos = total_rejected
            inspection_entry.total_rejected_qty = total_rejected  # Set both fields for consistency
            inspection_entry.accepted_qty_nos = inspection_entry.inspected_qty_nos - total_rejected
        
        # Set inspector information - Use inspector_code from sublot_process
        if hasattr(sublot_process, 'inspector_code') and sublot_process.inspector_code:
            inspection_entry.inspector_code = sublot_process.inspector_code
            
            # If there's also an inspector_name field in sublot_process, use that directly
            if hasattr(sublot_process, 'inspector_name') and sublot_process.inspector_name:
                inspection_entry.inspector_name = sublot_process.inspector_name
            else:
                # Otherwise try to get it from the Employee document
                inspector_name = frappe.db.get_value("Employee", sublot_process.inspector_code, "employee_name")
                if inspector_name:
                    inspection_entry.inspector_name = inspector_name
        elif inspector_id:
            # Fall back to the passed inspector_id if available
            inspection_entry.inspector_code = inspector_id
            inspector_name = frappe.db.get_value("Employee", inspector_id, "employee_name")
            if inspector_name:
                inspection_entry.inspector_name = inspector_name
        
        # Set reference to lot resource tag
        if lot_resource_tag:
            inspection_entry.lot_resource_tag = lot_resource_tag
            
        # If work order is available in sublot process, set it here too
        if hasattr(sublot_process, 'work_order') and sublot_process.work_order:
            inspection_entry.work_order = sublot_process.work_order
        
        # Save the inspection entry
        inspection_entry.insert()
        frappe.db.commit()
        frappe.logger().info(f"Created Inspection Entry {inspection_entry.name}")

        # Submit the inspection entry
        inspection_entry.submit()
        frappe.db.commit()
        
        frappe.logger().info(f"Submitted Inspection Entry {inspection_entry.name} with inspector={inspection_entry.inspector_code}, quantity={inspection_entry.inspected_qty_nos}, rejected={inspection_entry.rejected_qty_nos}")
        
        return {
            "status": "success",
            "message": f"Inspection Entry {inspection_entry.name} created successfully",
            "inspection_entry": inspection_entry.name
        }
        
    except Exception as e:
        frappe.log_error(f"Error creating inspection entry: {str(e)}", "Inspection Entry Creation Error")
        return {
            "status": "error",
            "message": f"Failed to create inspection entry: {str(e)}"
        }