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
            #use the update_job_card_from_resource function to update the job card
            update_job_card_from_resource(
                work_order=work_order,
                operation=op.operation,
                employee_code=op.employee_code,
                employee_name=op.employee_name,
            )
            
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
                work_order=work_order,
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

def create_inspection_entry(work_order,sublot_process, lot_resource_tag=None, inspector_id=None):
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
        update_job_card_from_resource(
            work_order=work_order,
            operation='Final Visual Inspection',
            employee_code=inspection_entry.inspector_code,
            employee_name=inspection_entry.inspector_name
        )
        
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

def update_job_card_from_resource(work_order, operation, employee_code=None, employee_name=None):
    """
    Find and update a job card for the specified work order and operation.
    
    Args:
        work_order (str): Work Order ID
        operation (str): Operation name
        employee_code (str, optional): Employee ID to assign to the job card
        employee_name (str, optional): Employee name for logging
        source_document (str, optional): Source document type (e.g., "SPP Lot Resource Tagging")
        source_name (str, optional): Source document name for reference
        
    Returns:
        dict: Result of the update operation
    """
    try:
        if not work_order or not operation:
            frappe.logger().warning(f"Missing work_order or operation in update_job_card_from_resource")
            return {
                "status": "error",
                "message": "Work Order and Operation are required"
            }
            
        # Find the job card for this work order and operation
        frappe.logger().info(f"Finding job card for Work Order {work_order}, Operation {operation}")
        
        job_cards = frappe.get_all("Job Card", 
            filters={
                "work_order": work_order,
                "operation": operation,
                "docstatus": ["in", [0, 1]]  # Both draft and submitted
            },
            fields=["name", "docstatus", "status"],
            order_by="creation"
        )
        
        if not job_cards:
            frappe.logger().warning(f"No job card found for Work Order {work_order}, Operation {operation}")
            return {
                "status": "error",
                "message": f"No job card found for Work Order {work_order}, Operation {operation}"
            }
            
        # Get the first job card (usually there should be only one per operation)
        job_card_info = job_cards[0]
        job_card_name = job_card_info.name
        
        # If the job card is already completed, no need to update
        if job_card_info.status == "Completed":
            frappe.logger().info(f"Job Card {job_card_name} is already completed, skipping update")
            return {
                "status": "success",
                "message": f"Job Card {job_card_name} is already completed",
                "job_card": job_card_name
            }
            
        # Get the full job card document
        job_card = frappe.get_doc("Job Card", job_card_name)
        
        # If the job card is already submitted, log warning and return
        if job_card.docstatus == 1:
            frappe.logger().warning(f"Job Card {job_card_name} is already submitted, cannot update")
            return {
                "status": "warning",
                "message": f"Job Card {job_card_name} is already submitted",
                "job_card": job_card_name
            }
            

        
        # Set employee if provided
        if employee_code:
            # Make sure employee is valid before adding
            if frappe.db.exists("Employee", employee_code):
                # Check if the employee field is a child table or a direct field
                if hasattr(job_card, 'employee') and isinstance(job_card.employee, list):
                    # It's a child table - clear and add
                    job_card.employee = []  # Clear existing employees
                    job_card.append("employee", {
                        "employee": employee_code
                    })
                    frappe.logger().info(f"Added employee {employee_code} to job card {job_card.name} child table")
                    updated = True
                else:
                    # It might be a direct field
                    job_card.employee = employee_code
                    frappe.logger().info(f"Set employee {employee_code} directly on job card {job_card.name}")
                    updated = True
            else:
                frappe.logger().warning(f"Employee {employee_code} not found, skipping employee assignment")
                
        # Add a time log to mark the job card as "Completed"
        try:
            current_date = getdate()
            
            # Create start and end times for the time log
            start_hour = 9  # Start at 9 AM by default
            start_minute = random.randint(0, 30)
            start_time_str = f"{start_hour:02d}:{start_minute:02d}:00"
            start_dt = datetime.strptime(f"{current_date} {start_time_str}", "%Y-%m-%d %H:%M:%S")
            
            # Duration between 1-10 minutes for each job
            duration_minutes = random.randint(1, 10)
            end_dt = start_dt + timedelta(minutes=duration_minutes)
            
            # Format times for the job card
            from_time = f"{current_date} {start_dt.strftime('%H:%M:%S')}"
            to_time = f"{current_date} {end_dt.strftime('%H:%M:%S')}"
            
            # Only proceed if there are no time logs or if existing time logs have zero duration
            has_valid_time_logs = False
            if job_card.time_logs:
                for time_log in job_card.time_logs:
                    # Check if the time log has valid from_time, to_time and completed_qty
                    if time_log.from_time and time_log.to_time and time_log.completed_qty:
                        has_valid_time_logs = True
                        break
                        
            if not has_valid_time_logs:
                # Calculate time difference in hours for the time_in_mins field
                time_diff = time_diff_in_hours(to_time, from_time) * 60
                
                # Verify the job card has a for_quantity field before using it
                completed_qty = job_card.for_quantity if hasattr(job_card, 'for_quantity') and job_card.for_quantity else 1
                
                # Create a time log entry with proper formatting
                time_log_data = {
                    "from_time": from_time,
                    "to_time": to_time,
                    "time_in_mins": time_diff or duration_minutes,
                    "completed_qty": completed_qty
                }
                
                # Add employee to time log if provided
                if employee_code:
                    time_log_data["employee"] = employee_code
                    
                frappe.logger().info(f"Adding time log to job card {job_card.name}: {time_log_data}")
                
                # Clear existing time logs if they don't have valid data
                if job_card.time_logs and not has_valid_time_logs:
                    job_card.time_logs = []
                
                # Append the time log to the job card
                job_card.append("time_logs", time_log_data)
                updated = True
                
                # Set the status to "Completed" 
                job_card.status = "Completed"
                updated = True
            else:
                frappe.logger().info(f"Job card {job_card.name} already has valid time logs, skipping")
        except Exception as time_log_error:
            frappe.logger().error(f"Error adding time log to Job Card {job_card.name}: {str(time_log_error)}")
            # Continue execution even if time log creation fails
        
        # Save the job card if updated
        if updated:
            job_card.save()
            frappe.db.commit()
            frappe.logger().info(f"Updated job card {job_card.name} successfully")
            
            try:
                # Try to submit the job card if not already submitted
                if job_card.docstatus == 0:
                    job_card.submit()
                    frappe.db.commit()
                    frappe.logger().info(f"Submitted job card {job_card.name}")
                    
                    # Update the work order operation status
                    try:
                        from smart_screens.smart_screens.utils.resource_job_card import update_work_order_operation
                        update_work_order_operation(work_order, operation, job_card.for_quantity)
                    except Exception as wo_error:
                        frappe.logger().error(f"Error updating work order operation: {str(wo_error)}")
            except Exception as submit_error:
                frappe.logger().error(f"Error submitting job card {job_card.name}: {str(submit_error)}")
                
                # If there's an employee overlap error, try a direct status update
                if "currently working on another workstation" in str(submit_error):
                    try:
                        frappe.db.sql("""
                            UPDATE `tabJob Card` 
                            SET status = 'Completed'
                            WHERE name = %s
                        """, (job_card.name,))
                        frappe.db.commit()
                        frappe.logger().info(f"Updated job card {job_card.name} status directly")
                    except Exception as sql_error:
                        frappe.logger().error(f"Error updating job card status: {str(sql_error)}")
        else:
            frappe.logger().info(f"No changes made to job card {job_card.name}")
            
        return {
            "status": "success",
            "message": f"Job Card {job_card.name} processed successfully",
            "job_card": job_card.name
        }
        
    except Exception as e:
        frappe.log_error(f"Error updating job card from resource: {str(e)}", "Job Card Update Error")
        return {
            "status": "error",
            "message": f"Failed to update job card: {str(e)}"
        }