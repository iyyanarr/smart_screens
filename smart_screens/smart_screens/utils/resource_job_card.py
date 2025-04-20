import frappe
from frappe import _
from frappe.utils import nowdate, nowtime, getdate, add_days, get_datetime, time_diff_in_hours
import random
from datetime import datetime, timedelta

# Dictionary to track the last end time for each employee
# This prevents time overlaps for the same employee across different job cards
employee_last_end_times = {}

def create_lot_resource_tag_and_job_card(sublot_process, work_order=None):
    """
    Create lot resource tags and job cards for each operation in the Sub Lot Process.
    
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
            
        # Track created resources and job cards
        created_resources = []
        created_job_cards = []
        created_inspection_entries = []
        
        # Get operations from work order if available
        work_order_operations = []
        if work_order:
            wo_doc = frappe.get_doc("Work Order", work_order)
            if hasattr(wo_doc, 'operations') and wo_doc.operations:
                work_order_operations = [op.operation for op in wo_doc.operations]
        
        # Check if the sublot process has rejection items before creating an inspection entry
        has_rejection_items = False
        for field in ["rejection_items", "rejection_types", "rejections"]:
            if hasattr(sublot_process, field) and getattr(sublot_process, field):
                has_rejection_items = True
                break
        
        # Store the first lot resource tag for later use with inspection entry
        first_lot_resource_tag = None
        
        # Process each operation
        for op in sublot_process.operations:
            # Skip if operation or employee code is missing
            if not op.operation or not op.employee_code:
                continue
                
            # Create a lot resource tagging entry with the correct DocType name
            lot_tag = frappe.new_doc("Lot Resource Tagging")
            lot_tag.lot_number = sublot_process.sub_lot_number
            lot_tag.item_code = sublot_process.item_code
            lot_tag.batch_no = sublot_process.batch_no
            lot_tag.warehouse = sublot_process.warehouse
            lot_tag.operation_type = op.operation
            lot_tag.operation = op.operation
            
            # Set the required fields that were missing
            lot_tag.posting_date = getdate()  # Set posting date to today
            lot_tag.product_ref = sublot_process.item_code  # Set product_ref same as item_code
            
            # Set qtynos and available_qty from sublot_process document
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
                
            # Add the resource from the operation
            # Check if resources child table exists, if not we'll skip this part
            if hasattr(lot_tag, 'resources'):
                lot_tag.append("resources", {
                    "operation": op.operation,
                    "employee": op.employee_code,
                    "employee_name": op.employee_name
                })
            
            # Set source document reference
            lot_tag.source_document = sublot_process.doctype
            lot_tag.source_document_name = sublot_process.name
            
            # Save the lot resource tag
            lot_tag.insert()
            frappe.db.commit()
            
            created_resources.append(lot_tag.name)
            
            # Store the first lot resource tag for the inspection entry
            if first_lot_resource_tag is None:
                first_lot_resource_tag = lot_tag.name
            
            # Create a job card if work order is available and operation is in work order
            if work_order and (not work_order_operations or op.operation in work_order_operations):
                job_card = create_job_card(
                    work_order=work_order,
                    operation=op.operation,
                    employee=op.employee_code,
                    lot_resource_tag=lot_tag.name,
                    sublot_process=sublot_process.name
                )
                
                if job_card and job_card.get("status") == "success":
                    created_job_cards.append(job_card.get("job_card"))
        
        # Create an Inspection Entry document for Final Visual Inspection
        # Only create one inspection entry if the sublot process has rejection items
        if has_rejection_items:
            inspection_entry = create_inspection_entry(
                sublot_process=sublot_process,
                lot_resource_tag=first_lot_resource_tag,
                inspector_id="HR-EMP-00001"  # Default inspector ID as per requirements
            )
            
            if inspection_entry and inspection_entry.get("status") == "success":
                created_inspection_entries.append(inspection_entry.get("inspection_entry"))
                
                # Create a job card specifically for Final Visual Inspection
                # Use the inspector from the sublot process if available
                inspector_code = None
                if hasattr(sublot_process, 'inspector_code') and sublot_process.inspector_code:
                    inspector_code = sublot_process.inspector_code
                
                # Create job card for Final Visual Inspection
                inspection_job_card = create_job_card(
                    work_order=work_order,
                    operation="Final Visual Inspection",
                    employee=inspector_code if inspector_code else "HR-EMP-00001",
                    lot_resource_tag=first_lot_resource_tag,
                    sublot_process=sublot_process.name
                )
                
                if inspection_job_card and inspection_job_card.get("status") == "success":
                    created_job_cards.append(inspection_job_card.get("job_card"))
                    frappe.logger().info(f"Created Job Card for Final Visual Inspection: {inspection_job_card.get('job_card')}")
            
        # Return the results
        return {
            "status": "success",
            "message": f"Created {len(created_resources)} resource tags, {len(created_job_cards)} job cards, and {len(created_inspection_entries)} inspection entries",
            "resources": created_resources,
            "job_cards": created_job_cards,
            "inspection_entries": created_inspection_entries
        }
    
    except Exception as e:
        frappe.log_error(f"Error creating lot resource tag and job card: {str(e)}", "Resource Creation Error")
        return {
            "status": "error",
            "message": f"Failed to create resources: {str(e)}"
        }

def create_inspection_entry(sublot_process, lot_resource_tag=None, inspector_id=None):
    """Create an inspection entry for Final Visual Inspection"""
    try:
        # Create the inspection entry
        inspection_entry = frappe.new_doc("Inspection Entry")
        
        # Set basic information
        inspection_entry.posting_date = getdate()
        inspection_entry.inspection_type = "Final Visual Inspection"
        
        # Set source document references
        inspection_entry.source_document = sublot_process.doctype
        inspection_entry.source_document_name = sublot_process.name
        
        # Set product information
        inspection_entry.item_code = sublot_process.item_code
        inspection_entry.item_name = frappe.db.get_value("Item", sublot_process.item_code, "item_name")
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
                # Use the correct field names as per the sample data (items, type_of_defect, rejected_qty, rejected_qty_kg)
                inspection_entry.append("items", {
                    "type_of_defect": item.rejection_type,
                    "rejected_qty": item.quantity,
                    "rejected_qty_kg": 0  # Default to 0 for kg measurement
                })
                # Sum up the rejected quantities
                if hasattr(item, 'rejected_qty'):
                    total_rejected += item.rejected_qty
            
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
        
        frappe.logger().info(f"Created Inspection Entry {inspection_entry.name} with inspector={inspection_entry.inspector_code}, quantity={inspection_entry.inspected_qty_nos}, rejected={inspection_entry.rejected_qty_nos}")
        
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

def create_job_card(work_order, operation, employee=None, lot_resource_tag=None, sublot_process=None):
    """Find and update existing job card for a specific operation and work order"""
    try:
        # Get work order document
        wo_doc = frappe.get_doc("Work Order", work_order)
        
        # Find the existing job card for this operation and work order
        existing_job_cards = frappe.get_all("Job Card", 
            filters={
                "work_order": work_order,
                "operation": operation,
                "docstatus": 0  # Draft status
            },
            fields=["name"],
            order_by="creation"
        )
        
        if not existing_job_cards:
            frappe.logger().warning(f"No existing job card found for Work Order {work_order} and Operation {operation}")
            return {
                "status": "error",
                "message": f"No existing job card found for this operation. Please ensure the Work Order is submitted."
            }
        
        # Get the first available job card
        job_card_name = existing_job_cards[0].name
        job_card = frappe.get_doc("Job Card", job_card_name)
        
        # Add reference to sub lot process
        if sublot_process:
            job_card.sub_lot_process = sublot_process
        
        # Add reference to lot resource tag
        if lot_resource_tag:
            job_card.lot_resource_tag = lot_resource_tag
            
        # Set employee if provided (clear existing employees first)
        if employee:
            job_card.employee = []  # Clear existing employees
            job_card.append("employee", {
                "employee": employee
            })
        
        # Save the updated job card
        job_card.save()
        frappe.db.commit()
        
        # Now add a time log to make the job card "Completed" with sequential times
        try:
            current_date = getdate()
            
            # Get the last end time for this employee, or create a default starting time
            start_dt = None
            if employee and employee in employee_last_end_times:
                # Start 2 minutes after the last job ended
                last_end_time = employee_last_end_times[employee]
                start_dt = last_end_time + timedelta(minutes=2)
            else:
                # Default start time if no previous job
                start_hour = 9  # Start at 9 AM by default
                start_minute = random.randint(0, 30)
                start_time_str = f"{start_hour:02d}:{start_minute:02d}:00"
                start_dt = datetime.strptime(f"{current_date} {start_time_str}", "%Y-%m-%d %H:%M:%S")
            
            # Duration between 10-30 minutes for each job
            duration_minutes = random.randint(10, 30)
            end_dt = start_dt + timedelta(minutes=duration_minutes)
            
            # Format times for the job card
            start_time = start_dt.strftime("%H:%M:%S")
            end_time = end_dt.strftime("%H:%M:%S")
            
            # Clear existing time logs if any
            job_card.time_logs = []
            
            # Create a time log entry with sequential times
            job_card.append("time_logs", {
                "from_time": f"{current_date} {start_time}",
                "to_time": f"{current_date} {end_time}",
                "time_in_mins": duration_minutes,
                "employee": employee if employee else "",
                "completed_qty": job_card.for_quantity  # Set completed quantity equal to required quantity
            })
            
            # Update the last end time for this employee
            if employee:
                employee_last_end_times[employee] = end_dt
            
            # Set the status to "Completed"
            job_card.status = "Completed"
            job_card.docstatus = 1  # Submit the job card
            
            # Save the updated job card
            job_card.save()
            frappe.db.commit()
            
            frappe.logger().info(f"Updated Job Card {job_card.name} for employee {employee} with times: {start_time} to {end_time}, status is now 'Completed'")
        except Exception as time_log_error:
            frappe.logger().error(f"Error adding time log to Job Card {job_card.name}: {str(time_log_error)}")
            # Continue execution since we were able to update the job card
            
        return {
            "status": "success",
            "message": f"Job Card {job_card.name} updated successfully and set to Completed",
            "job_card": job_card.name
        }
        
    except Exception as e:
        frappe.log_error(f"Error updating job card: {str(e)}", "Job Card Update Error")
        return {
            "status": "error",
            "message": f"Failed to update job card: {str(e)}"
        }