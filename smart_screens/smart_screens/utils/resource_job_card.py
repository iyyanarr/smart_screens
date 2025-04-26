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
            lot_tag = frappe.new_doc("SPP Lot Resource Tagging")
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
            lot_tag.submit()
            frappe.db.commit()
            frappe.logger().info(f"Created Lot Resource Tagging {lot_tag.name} for operation {op.operation}")
            
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
        inspection_entry = frappe.new_doc("SPP Inspection Entry")
        
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

        inspection_entry.submit()
        
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
        # Look for both draft (docstatus=0) and submitted (docstatus=1) job cards
        existing_job_cards = frappe.get_all("Job Card", 
            filters={
                "work_order": work_order,
                "operation": operation,
                "docstatus": ["in", [0, 1]]  # Both draft and submitted
            },
            fields=["name", "docstatus"],
            order_by="creation"
        )
        
        if not existing_job_cards:
            frappe.logger().warning(f"No existing job card found for Work Order {work_order} and Operation {operation}")
            # Since ERPNext should have auto-created the job cards, if none exist, there's a problem
            # Let's try to explicitly create it
            try:
                from erpnext.manufacturing.doctype.work_order.work_order import create_job_card as erpnext_create_job_card
                for wo_operation in wo_doc.operations:
                    if wo_operation.operation == operation:
                        erpnext_create_job_card(wo_doc, wo_operation)
                        frappe.db.commit()
                        # Refresh the list after creation
                        existing_job_cards = frappe.get_all("Job Card", 
                            filters={
                                "work_order": work_order,
                                "operation": operation,
                                "docstatus": ["in", [0, 1]]
                            },
                            fields=["name", "docstatus"],
                            order_by="creation"
                        )
                        break
            except Exception as e:
                frappe.logger().error(f"Error creating job card via ERPNext: {str(e)}")
                
            # If we still don't have job cards, return an error
            if not existing_job_cards:
                return {
                    "status": "error",
                    "message": f"No existing job card found for this operation and none could be created."
                }
        
        # Get the first available job card
        job_card_info = existing_job_cards[0]
        job_card_name = job_card_info.name
        job_card = frappe.get_doc("Job Card", job_card_name)
        
        # If the job card is already submitted, we can't modify it directly
        if job_card.docstatus == 1:
            frappe.logger().info(f"Job Card {job_card_name} is already submitted - creating time logs only")
            # We'll skip modifying the job card and just update the Work Order operation directly
            # This is needed because ERPNext might have auto-submitted the job card
            update_work_order_operation(work_order, operation, job_card.for_quantity)
            return {
                "status": "success",
                "message": f"Job Card {job_card_name} was already submitted, updated Work Order directly",
                "job_card": job_card_name
            }
        
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
            
            # Save and submit the job card
            job_card.save()
            job_card.submit()
            frappe.db.commit()
            
            # After job card is submitted, update the work order operation and status
            update_work_order_operation(work_order, operation, job_card.for_quantity)
            
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

def update_work_order_operation(work_order, operation, completed_qty):
    """
    Update Work Order operation and status - separated function for clarity and reuse
    """
    try:
        # Log job card submission
        frappe.logger().debug(f"Updating Work Order {work_order} operation {operation}")
        
        # Get the work order document again to ensure we have the latest data
        work_order_doc = frappe.get_doc("Work Order", work_order)
        
        # Find the matching operation in work order and update completed quantity
        operation_updated = False
        all_operations_completed = True
        
        # Log work order operations status before update
        frappe.logger().debug(f"Work Order operations before update: {[(o.operation, o.completed_qty, o.planned_qty) for o in work_order_doc.operations]}")
        
        for wo_operation in work_order_doc.operations:
            if wo_operation.operation == operation:
                # Update the completed qty
                wo_operation.completed_qty = completed_qty
                operation_updated = True
                frappe.logger().debug(f"Updated operation {operation} completed_qty to {completed_qty}")
            
            # Check if any operation is not complete
            if wo_operation.completed_qty < wo_operation.planned_qty:
                all_operations_completed = False
        
        frappe.logger().debug(f"Operation updated: {operation_updated}, All operations completed: {all_operations_completed}")
        
        # If we found and updated the operation
        if operation_updated:
            # Save the work order with updated quantities
            work_order_doc.save()
            frappe.db.commit()
            
            # If all operations are completed, finish the work order
            if all_operations_completed:
                # Get rejected quantity from inspection entries
                rejected_qty = get_rejected_qty_for_work_order(work_order)
                frappe.logger().debug(f"All operations completed for Work Order {work_order}, rejected qty: {rejected_qty}")
                
                try:
                    frappe.logger().debug(f"Completing Work Order {work_order} using standard ERPNext workflow")
                    # Create manufacturing stock entry and set status to Completed
                    from erpnext.manufacturing.doctype.work_order.work_order import make_stock_entry
                    
                    # First check if we need a material transfer
                    if work_order_doc.status == "Not Started" and not work_order_doc.skip_transfer:
                        transfer_se = frappe.get_doc(make_stock_entry(work_order, "Material Transfer for Manufacture"))
                        transfer_se.insert()
                        transfer_se.submit()
                        frappe.db.commit()
                        work_order_doc.reload()
                        frappe.logger().debug(f"Created material transfer, Work Order status is now {work_order_doc.status}")
                    
                    # Now create the manufacturing entry
                    mfg_se = frappe.get_doc(make_stock_entry(work_order, "Manufacture"))
                    # Set fg_completed_qty to the required qty for the work order
                    mfg_se.fg_completed_qty = work_order_doc.qty
                    mfg_se.insert()
                    mfg_se.submit()
                    frappe.db.commit()
                    
                    # Reload the work order to check if status updated
                    work_order_doc.reload()
                    frappe.logger().debug(f"Created manufacturing entry, Work Order status is now {work_order_doc.status}")
                    
                    # Force update if needed
                    if work_order_doc.status != "Completed":
                        work_order_doc.status = "Completed"
                        work_order_doc.produced_qty = work_order_doc.qty
                        work_order_doc.save()
                        frappe.db.commit()
                        frappe.logger().debug(f"Force updated Work Order status to Completed")
                        
                except Exception as e:
                    frappe.logger().error(f"Error completing Work Order with standard workflow: {str(e)}")
                    # Fall back to direct SQL update as last resort
                    frappe.db.sql("""
                        UPDATE `tabWork Order` 
                        SET status = 'Completed', produced_qty = qty 
                        WHERE name = %s
                    """, (work_order,))
                    frappe.db.commit()
                    frappe.logger().debug(f"Used direct SQL update for Work Order {work_order}")
    
    except Exception as e:
        frappe.logger().error(f"Error in update_work_order_operation: {str(e)}")

def get_rejected_qty_for_work_order(work_order_id):
    """Get the rejected quantity for a work order from related inspection entries"""
    rejected_qty = 0
    
    # First try to find rejection from SPP Inspection Entry
    inspection_entries = frappe.get_all(
        "SPP Inspection Entry",
        filters={"work_order": work_order_id, "docstatus": ["!=", 2]},
        fields=["rejected_qty_nos", "rejected_qty", "total_rejected_qty"]
    )
    
    for entry in inspection_entries:
        # Try different field names that might contain rejection qty
        for field in ["rejected_qty_nos", "rejected_qty", "total_rejected_qty"]:
            if entry.get(field):
                rejected_qty += float(entry.get(field) or 0)
                break
    
    # If no inspection entries found, check Job Cards for any rejection qty
    if not rejected_qty:
        job_cards = frappe.get_all(
            "Job Card",
            filters={"work_order": work_order_id, "docstatus": 1},
            fields=["rejected_quantity"]
        )
        
        for jc in job_cards:
            if jc.get("rejected_quantity"):
                rejected_qty += float(jc.get("rejected_quantity") or 0)
    
    frappe.logger().info(f"Found rejected quantity {rejected_qty} for Work Order {work_order_id}")
    return rejected_qty

def complete_work_order_with_stock_entries(work_order_id, rejected_qty=0, batch_no=None):
    """
    Complete a work order by:
    1. Creating a material transfer stock entry to move materials to WIP warehouse
    2. Creating a manufacturing stock entry for both good and rejected items
    3. Setting the work order status to Completed
    
    Args:
        work_order_id (str): Work Order ID
        rejected_qty (float): Quantity to be sent to rejection warehouse
        batch_no (str): Batch number to use for the finished goods
    """
    try:
        from frappe.utils import flt, cint, nowdate
        
        # Get work order details
        work_order = frappe.get_doc("Work Order", work_order_id)
        
        if work_order.status == "Completed":
            frappe.logger().info(f"Work Order {work_order_id} is already completed")
            return
        
        if work_order.docstatus != 1:
            frappe.throw(_("Work Order {0} must be submitted").format(work_order_id))
        
        # Calculate good qty to manufacture
        total_qty = flt(work_order.qty)
        good_qty = total_qty - flt(rejected_qty)
        
        if good_qty < 0:
            frappe.throw(_("Rejected quantity ({0}) cannot exceed total quantity ({1})").format(rejected_qty, total_qty))
        
        # If batch_no is directly provided, use it
        new_batch_number = batch_no
        if not new_batch_number:
            frappe.logger().info(f"No batch_no directly provided for Work Order {work_order_id}, trying to find one")
            # Try to find a batch number if none is provided directly
            try:
                # First priority: Get the batch number from the Sub Lot Entry's barcode field
                # Look for Sub Lot Entry linked to this Work Order
                sublot_entries = frappe.get_all(
                    "Sub Lot Entry",
                    filters=[
                        ["source_document", "in", ["Sub Lot Process", "Work Order"]],
                        ["source_document_name", "=", work_order.name],
                    ],
                    fields=["name", "barcode", "sublot_batch", "batch"],
                    limit=1
                )
                
                # If not found directly, try finding via Sub Lot Process
                if not sublot_entries:
                    # Approach 2: Try to look up the Work Order in Sub Lot Process table
                    sub_lot_processes = frappe.get_all(
                        "Sub Lot Process",
                        filters={"work_order": work_order.name},
                        fields=["name", "barcode", "sublot_batch_number", "sub_lot_number", "batch_no"],
                        limit=1
                    )
                    if sub_lot_processes:
                        # Try to get the barcode directly from Sub Lot Process
                        if sub_lot_processes[0].get("barcode"):
                            new_batch_number = sub_lot_processes[0].barcode
                        else:
                            # Find the Sub Lot Entry for this Sub Lot Process
                            sublot_entries = frappe.get_all(
                                "Sub Lot Entry",
                                filters={"source_document": "Sub Lot Process", "source_document_name": sub_lot_processes[0].name},
                                fields=["name", "barcode", "sublot_batch", "batch"],
                                limit=1
                            )
                
                # Extract the batch number from results
                if sublot_entries:
                    # Priority 1: Use barcode field as it's explicitly requested
                    if sublot_entries[0].get("barcode"):
                        new_batch_number = sublot_entries[0].barcode
                    # Try other fields if barcode isn't available
                    elif sublot_entries[0].get("sublot_batch"):
                        new_batch_number = sublot_entries[0].sublot_batch
                    elif sublot_entries[0].get("batch"):
                        new_batch_number = sublot_entries[0].batch
                
                if new_batch_number:
                    frappe.logger().info(f"Found batch number {new_batch_number} for Work Order {work_order.name}")
                else:
                    frappe.logger().info(f"Could not find batch number for Work Order {work_order.name}")
            except Exception as e:
                frappe.logger().error(f"Error finding batch number for Work Order {work_order.name}: {str(e)}")
                # Continue without batch number if there's an error
        
        # STEP 1: Create Material Transfer for Manufacture stock entry
        if work_order.status == "Not Started":
            transfer_entry = create_material_transfer_entry(work_order)
            if transfer_entry:
                frappe.logger().info(f"Created material transfer entry {transfer_entry.name}")
                # Reload work order to get updated status
                work_order.reload()
        
        # STEP 2: Create Manufacturing stock entry for both good and rejected items
        if total_qty > 0:
            stock_entry = create_single_stock_entry_for_manufacture(
                work_order,
                good_qty,
                rejected_qty,
                new_batch_number
            )
            
            if stock_entry:
                frappe.logger().info(f"Created stock entry {stock_entry.name} with good qty: {good_qty}, rejected qty: {rejected_qty}, batch: {new_batch_number}")
        
        # STEP 3: Force update work order status to Completed
        work_order.reload()  # Get the latest status after stock entries
        if work_order.status != "Completed":
            work_order.status = "Completed"
            work_order.produced_qty = total_qty
            work_order.save()
            frappe.db.commit()
            frappe.logger().info(f"Force updated Work Order {work_order_id} status to Completed")
        
        frappe.db.commit()
        frappe.logger().info(f"Work Order {work_order_id} completed with good qty: {good_qty}, rejected qty: {rejected_qty}")
        
    except Exception as e:
        frappe.logger().error(f"Error completing Work Order {work_order_id}: {str(e)}")
        frappe.throw(_("Could not complete Work Order: {0}").format(str(e)))

def create_material_transfer_entry(work_order):
    """
    Create and submit a Material Transfer for Manufacture stock entry
    
    Args:
        work_order (object): Work Order document
        
    Returns:
        object: Submitted Stock Entry document
    """
    try:
        from frappe.utils import flt, nowdate, nowtime
        
        if not work_order.source_warehouse or not work_order.wip_warehouse:
            frappe.logger().warning(f"Cannot create material transfer: source_warehouse or wip_warehouse not defined for Work Order {work_order.name}")
            return None
            
        stock_entry = frappe.new_doc("Stock Entry")
        stock_entry.purpose = "Material Transfer for Manufacture"
        stock_entry.work_order = work_order.name
        stock_entry.company = work_order.company
        stock_entry.from_bom = 1
        stock_entry.bom_no = work_order.bom_no
        stock_entry.use_multi_level_bom = work_order.use_multi_level_bom
        stock_entry.fg_completed_qty = work_order.qty
        stock_entry.posting_date = nowdate()
        stock_entry.posting_time = nowtime()
        
        # Get raw materials from BOM
        bom_items = get_bom_items(work_order.bom_no, work_order.company, work_order.qty, work_order.source_warehouse)
        
        # Add raw materials to stock entry
        for item in bom_items:
            stock_entry.append("items", {
                "item_code": item.item_code,
                "item_name": item.item_name,
                "description": item.description,
                "uom": item.stock_uom,
                "stock_uom": item.stock_uom,
                "qty": item.qty,
                "s_warehouse": work_order.source_warehouse,
                "t_warehouse": work_order.wip_warehouse,
                "basic_rate": item.rate,
                "conversion_factor": 1.0,
                "use_serial_batch_fields": 1  # Add this field for batch tracking
            })
        
        # Set stock entry type
        stock_entry.set_stock_entry_type()
        
        # Save and submit the stock entry
        stock_entry.insert()
        stock_entry.submit()
        
        frappe.db.commit()
        return stock_entry
        
    except Exception as e:
        frappe.logger().error(f"Error creating material transfer entry: {str(e)}")
        return None

def create_single_stock_entry_for_manufacture(work_order, good_qty, rejected_qty, batch_no=None):
    """
    Create and submit a single manufacturing stock entry with both good and rejected items
    
    Args:
        work_order (object): Work Order document
        good_qty (float): Quantity of good items
        rejected_qty (float): Quantity of rejected items
        batch_no (str): Batch number to be used
        
    Returns:
        object: Submitted Stock Entry document
    """
    try:
        from frappe.utils import flt, nowdate, nowtime
        
        if flt(good_qty) <= 0 and flt(rejected_qty) <= 0:
            return None
            
        stock_entry = frappe.new_doc("Stock Entry")
        stock_entry.purpose = "Manufacture"
        stock_entry.work_order = work_order.name
        stock_entry.company = work_order.company
        stock_entry.from_bom = 1
        stock_entry.bom_no = work_order.bom_no
        stock_entry.use_multi_level_bom = work_order.use_multi_level_bom
        stock_entry.fg_completed_qty = flt(good_qty) + flt(rejected_qty)  # Total manufactured qty
        stock_entry.posting_date = nowdate()
        stock_entry.posting_time = nowtime()
        
        # Set source warehouse based on work order settings
        if work_order.source_warehouse:
            source_warehouse = work_order.source_warehouse
        else:
            # Default to work order's wip warehouse if skip_transfer is not enabled
            source_warehouse = work_order.wip_warehouse if not work_order.skip_transfer else None
        
        # Get raw materials from BOM for total quantity
        total_qty = flt(good_qty) + flt(rejected_qty)
        bom_items = get_bom_items(work_order.bom_no, work_order.company, total_qty, source_warehouse)
        
        # Add raw materials to stock entry
        for item in bom_items:
            stock_entry.append("items", {
                "item_code": item.item_code,
                "item_name": item.item_name,
                "description": item.description,
                "uom": item.stock_uom,
                "stock_uom": item.stock_uom,
                "qty": item.qty,
                "s_warehouse": source_warehouse,
                "basic_rate": item.rate,
                "conversion_factor": 1.0,
                "use_serial_batch_fields": 1  # Add this field for batch tracking
            })
        
        # Get item details for the finished good
        item_name = frappe.db.get_value("Item", work_order.production_item, "item_name")
        description = frappe.db.get_value("Item", work_order.production_item, "description")
        
        # CUSTOM BATCH HANDLING: Specifically handle the batch for this item
        valid_batch = None
        if batch_no:
            # First try to convert the raw material batch to a finished good batch
            try:
                from smart_screens.smart_screens.utils.generate_batch import convert_raw_to_fg_batch
                fg_batch = convert_raw_to_fg_batch(batch_no, work_order.production_item)
                if fg_batch:
                    frappe.logger().info(f"Converted raw batch {batch_no} to finished good batch {fg_batch}")
                    # Check if the converted batch exists and is valid for this item
                    if frappe.db.exists("Batch", fg_batch):
                        batch_item = frappe.db.get_value("Batch", fg_batch, "item")
                        if batch_item == work_order.production_item:
                            valid_batch = fg_batch
                            frappe.logger().info(f"Using converted batch {valid_batch} for item {work_order.production_item}")
                    else:
                        # Create the batch if it doesn't exist
                        from smart_screens.smart_screens.utils.generate_batch import create_batch
                        valid_batch = create_batch(work_order.production_item, fg_batch)
                        frappe.logger().info(f"Created new batch {valid_batch} for item {work_order.production_item}")
            except Exception as e:
                frappe.logger().error(f"Error converting/creating batch: {str(e)}")
                
            # If the conversion didn't work, fall back to existing handling
            if not valid_batch:
                # Check if the batch exists and to which item it belongs
                if frappe.db.exists("Batch", batch_no):
                    batch_item = frappe.db.get_value("Batch", batch_no, "item")
                    if batch_item == work_order.production_item:
                        valid_batch = batch_no
                        frappe.logger().info(f"Using existing batch {valid_batch} for item {work_order.production_item}")
                    else:
                        frappe.logger().warning(f"Batch {batch_no} exists but belongs to item {batch_item}, not {work_order.production_item}")
                        
                        # Try to find an existing batch with the same base pattern but for this item
                        # For example, if P25D03Z07-3 exists for a different item, look for P25D03Z07 for our item
                        if "-" in batch_no:
                            base_batch = batch_no.split("-")[0]
                            matching_batches = frappe.get_all(
                                "Batch",
                                filters={"item": work_order.production_item, "name": ["like", f"{base_batch}%"]},
                                fields=["name"],
                                limit=1
                            )
                            if matching_batches:
                                valid_batch = matching_batches[0].name
                                frappe.logger().info(f"Found matching batch {valid_batch} for item {work_order.production_item}")
                        
                        # If still no valid batch, try to create a new unique batch for this item
                        if not valid_batch:
                            # Create a unique batch name based on the original with a prefix/suffix for this item
                            new_batch_name = f"{batch_no}-{work_order.production_item}"
                            # Check if this new batch name already exists
                            if not frappe.db.exists("Batch", new_batch_name):
                                try:
                                    # Create a new batch specifically for this item
                                    new_batch = frappe.new_doc("Batch")
                                    new_batch.batch_id = new_batch_name
                                    new_batch.item = work_order.production_item
                                    new_batch.insert()
                                    frappe.db.commit()
                                    valid_batch = new_batch_name
                                    frappe.logger().info(f"Created new batch {valid_batch} for item {work_order.production_item}")
                                except Exception as e:
                                    frappe.logger().error(f"Error creating new batch: {str(e)}")
                else:
                    # Batch doesn't exist, create it
                    try:
                        new_batch = frappe.new_doc("Batch")
                        new_batch.batch_id = batch_no
                        new_batch.item = work_order.production_item
                        new_batch.insert()
                        frappe.db.commit()
                        valid_batch = batch_no
                        frappe.logger().info(f"Created new batch {valid_batch} for item {work_order.production_item}")
                    except Exception as e:
                        frappe.logger().error(f"Error creating new batch: {str(e)}")
        
        # If we still don't have a valid batch, try to find any existing batch for this item
        if not valid_batch:
            existing_batches = frappe.get_all(
                "Batch",
                filters={"item": work_order.production_item},
                fields=["name"],
                limit=1
            )
            if existing_batches:
                valid_batch = existing_batches[0].name
                frappe.logger().info(f"Using fallback existing batch {valid_batch} for item {work_order.production_item}")
            else:
                # As a last resort, create a completely new batch with a timestamp
                import time
                timestamp = int(time.time())
                new_batch_name = f"{work_order.production_item}-{timestamp}"
                try:
                    new_batch = frappe.new_doc("Batch")
                    new_batch.batch_id = new_batch_name
                    new_batch.item = work_order.production_item
                    new_batch.insert()
                    frappe.db.commit()
                    valid_batch = new_batch_name
                    frappe.logger().info(f"Created last-resort batch {valid_batch} for item {work_order.production_item}")
                except Exception as e:
                    frappe.logger().error(f"Error creating last-resort batch: {str(e)}")
        
        # Add good items going to the FG warehouse
        if flt(good_qty) > 0:
            stock_entry.append("items", {
                "item_code": work_order.production_item,
                "item_name": item_name,
                "description": description,
                "uom": work_order.stock_uom,
                "stock_uom": work_order.stock_uom,
                "qty": good_qty,
                "t_warehouse": work_order.fg_warehouse,
                "conversion_factor": 1.0,
                "is_finished_item": 1,
                "batch_no": valid_batch,  # Set the validated batch number
                "use_serial_batch_fields": 1  # Add this field for batch tracking
            })
        
        # Add rejected items going to the rejection warehouse
        if flt(rejected_qty) > 0:
            stock_entry.append("items", {
                "item_code": work_order.production_item,
                "item_name": item_name,
                "description": description,
                "uom": work_order.stock_uom,
                "stock_uom": work_order.stock_uom,
                "qty": rejected_qty,
                "t_warehouse": "U2 Rejection - SPP INDIA",  # Updated rejection warehouse name
                "conversion_factor": 1.0,
                "is_finished_item": 1,
                "batch_no": valid_batch,  # Set the validated batch number
                "use_serial_batch_fields": 1  # Add this field for batch tracking
            })
        
        # Set stock entry type
        stock_entry.set_stock_entry_type()
        
        # Save and submit the stock entry
        stock_entry.insert()
        stock_entry.submit()
        
        frappe.db.commit()
        return stock_entry
        
    except Exception as e:
        frappe.logger().error(f"Error creating stock entry: {str(e)}")
        raise

def get_bom_items(bom_no, company, qty, warehouse=None):
    """
    Get list of items and their quantities required to manufacture qty of product
    
    Args:
        bom_no (str): BOM Number
        company (str): Company
        qty (float): Quantity to manufacture
        warehouse (str): Source warehouse
        
    Returns:
        list: List of dictionaries containing item details
    """
    try:
        from erpnext.manufacturing.doctype.bom.bom import get_bom_items_as_dict
        
        bom_items = get_bom_items_as_dict(bom_no, company, qty=qty, fetch_exploded=0)
        return list(bom_items.values())
    except ImportError:
        # Fallback if ERPNext function is not available
        bom = frappe.get_doc("BOM", bom_no)
        items = []
        
        for item in bom.items:
            items.append({
                "item_code": item.item_code,
                "item_name": item.item_name,
                "description": item.description,
                "stock_uom": item.stock_uom,
                "qty": item.qty * flt(qty) / flt(bom.quantity),
                "rate": item.rate,
                "source_warehouse": warehouse or item.source_warehouse
            })
            
        return items

def get_valid_batch_for_item(batch_no, item_code):
    """
    Get a valid batch number for an item.
    If the batch has a suffix (like -1, -2), try the base batch first.
    
    Args:
        batch_no (str): The original batch number
        item_code (str): The item code
        
    Returns:
        str: A valid batch number for the item, or the original batch if not found
    """
    if not batch_no or not item_code:
        return None
    
    # Check if the batch exists and belongs to the item
    if frappe.db.exists("Batch", batch_no):
        batch_item = frappe.db.get_value("Batch", batch_no, "item")
        if batch_item and batch_item == item_code:
            return batch_no
    
    # If the batch has a suffix, try removing it
    if "-" in batch_no:
        base_batch = batch_no.split("-")[0]
        if frappe.db.exists("Batch", base_batch):
            batch_item = frappe.db.get_value("Batch", base_batch, "item")
            if batch_item and batch_item == item_code:
                return base_batch
    
    # Try to create a new batch if it doesn't exist
    try:
        if not frappe.db.exists("Batch", batch_no):
            new_batch = frappe.new_doc("Batch")
            new_batch.batch_id = batch_no
            new_batch.item = item_code
            new_batch.insert()
            frappe.db.commit()
            return batch_no
    except Exception as e:
        frappe.logger().error(f"Error creating new batch: {str(e)}")
    
    # Find any valid batch for this item as a last resort
    valid_batches = frappe.get_all(
        "Batch",
        filters={"item": item_code, "batch_qty": [">", 0]},
        fields=["name"],
        limit=1
    )
    
    if valid_batches:
        return valid_batches[0].name
    
    return batch_no  # Return the original batch number as a last resort