import frappe
import json
from frappe import _
import uuid
import time
from datetime import datetime

@frappe.whitelist()
def create_sublot_process(form_data):
    """
    Create a record in the Sub Lot Process doctype with status tracking.
    Returns the success status and process record ID.
    
    Args:
        form_data (dict|str): Form data containing batch, operations, inspection and rejection details
        
    Returns:
        dict: Status of the operation with process record ID if successful
    """
    try:
        # Parse the form data if it's a string
        if isinstance(form_data, str):
            form_data = json.loads(form_data)
        
        batch_info = form_data.get("batchInfo", {})
        operations = form_data.get("operationDetails", [])
        inspection_info = form_data.get("inspectionInfo", {})
        rejection_details = form_data.get("rejectionDetails", [])
        location_info = form_data.get("locationInfo", [])
        
        # Create a process tracker document to track progress
        process_tracker = frappe.new_doc("Process Tracker")
        process_tracker.process_type = "Sub Lot Process"
        process_tracker.status = "Validating"
        process_tracker.current_stage = "Data Validation"
        process_tracker.progress_percent = 10
        process_tracker.stage_description = "Validating input data..."
        process_tracker.reference_doctype = "Sub Lot Process"
        process_tracker.created_by = frappe.session.user
        process_tracker.insert()
        
        # Get the tracker ID for frontend to poll
        tracker_id = process_tracker.name
        
        # Validate required data
        if not batch_info:
            process_tracker.status = "Failed"
            process_tracker.stage_description = "Batch information is required"
            process_tracker.save()
            return {"status": "error", "message": "Batch information is required", "tracker_id": tracker_id}
        
        if not operations:
            process_tracker.status = "Failed"
            process_tracker.stage_description = "At least one operation is required"
            process_tracker.save()
            return {"status": "error", "message": "At least one operation is required", "tracker_id": tracker_id}
        
        if not inspection_info:
            process_tracker.status = "Failed"
            process_tracker.stage_description = "Inspection information is required"
            process_tracker.save()
            return {"status": "error", "message": "Inspection information is required", "tracker_id": tracker_id}
        
        # Update progress - Document Creation
        process_tracker.status = "In Progress"
        process_tracker.current_stage = "Document Creation"
        process_tracker.progress_percent = 20
        process_tracker.stage_description = "Creating process document..."
        process_tracker.save()
        
        # Create a new Sub Lot Process document
        process_doc = frappe.new_doc("Sub Lot Process")
        
        # Set basic fields
        process_doc.spp_batch_number = batch_info.get("sppBatchId")
        process_doc.barcode = batch_info.get("sppBatchId")  # Set barcode field using spp batch number
        process_doc.batch_no = batch_info.get("batch_no")
        process_doc.sub_lot_number = batch_info.get("sppBatchId")
        process_doc.item_code = batch_info.get("item_code")
        process_doc.warehouse = batch_info.get("warehouse")
        
        # Set quantities - ensure numeric types for quantity fields
        if batch_info.get("quantity"):
            try:
                process_doc.available_quantity = float(batch_info.get("quantity"))
            except (ValueError, TypeError):
                process_doc.available_quantity = batch_info.get("quantity")
        
        if inspection_info.get("inspectionQuantity"):
            try:
                process_doc.inspection_quantity = float(inspection_info.get("inspectionQuantity"))
            except (ValueError, TypeError):
                process_doc.inspection_quantity = inspection_info.get("inspectionQuantity")
        
        # Set sublot quantity same as inspection quantity
        process_doc.sublot_qty = process_doc.inspection_quantity
        
        # Update progress - Adding operations
        process_tracker.current_stage = "Operations Setup"
        process_tracker.progress_percent = 30
        process_tracker.stage_description = "Adding operation details..."
        process_tracker.save()
        
        # Set inspector information
        process_doc.inspector_code = inspection_info.get("inspectorCode")
        process_doc.inspector_name = inspection_info.get("inspectorName")
        
        # Add operations
        for op in operations:
            operation = op.get("operation")
            employee_code = op.get("employeeCode")
            employee_name = op.get("employeeName")
            
            # Skip if operation or employee code is missing
            if not operation or not employee_code:
                continue
                
            process_doc.append("operations", {
                "operation": operation,
                "employee_code": employee_code,
                "employee_name": employee_name
            })
        
        # Update progress - Adding rejections
        process_tracker.current_stage = "Rejection Data"
        process_tracker.progress_percent = 50
        process_tracker.stage_description = "Adding rejection details..."
        process_tracker.save()
        
        # Add rejection details
        if rejection_details:
            for rejection in rejection_details:
                rejection_type = rejection.get("rejectionType")
                quantity = rejection.get("quantity")
                
                # Skip empty or invalid entries
                if not rejection_type:
                    continue
                
                # Ensure quantity is a number
                try:
                    if isinstance(quantity, str):
                        quantity = float(quantity)
                except (ValueError, TypeError):
                    quantity = 0
                
                # Append to child table only if we have valid data
                process_doc.append("rejection_items", {
                    "rejection_type": rejection_type,
                    "quantity": quantity
                })
        
        # Update progress - Adding location informationssss
        process_tracker.current_stage = "Location Setup"
        process_tracker.progress_percent = 70
        process_tracker.stage_description = "Adding location information..."
        process_tracker.save()
        
        # Add stock reference documents if location info is provided
        if location_info:
            for loc in location_info:
                # Skip if required fields are missing
                if not loc.get("source_warehouse") or not loc.get("transaction_type"):
                    continue
                    
                process_doc.append("st_reference_docs", {
                    "transaction_type": loc.get("transaction_type"),
                    "source_warehouse": loc.get("source_warehouse"),
                    "target_warehouse": loc.get("target_warehouse"),
                    "stage": loc.get("stage"),
                    "role": loc.get("role"),
                    "location": loc.get("location")
                })
        
        # Update progress - Saving document
        process_tracker.current_stage = "Document Saving"
        process_tracker.progress_percent = 80
        process_tracker.stage_description = "Saving document..."
        process_tracker.save()
        
        # Save the document
        process_doc.insert()
        
        # Update progress - Document submission
        process_tracker.current_stage = "Document Submission"
        process_tracker.progress_percent = 90
        process_tracker.stage_description = "Submitting document..."
        process_tracker.save()
        
        # submit the document if it's submittable
        if frappe.db.get_value("DocType", "Sub Lot Process", "is_submittable"):
            process_doc.submit()
        
        # Link the created document to the process tracker
        process_tracker.reference_name = process_doc.name
        
        # Final progress update
        process_tracker.current_stage = "Complete"
        process_tracker.progress_percent = 100
        process_tracker.status = "Completed"
        process_tracker.stage_description = "Process completed successfully!"
        process_tracker.save()
        
        # Log success message
        frappe.logger().info(f"Created Sub Lot Process: {process_doc.name}")
        
        # Return success response
        return {
            "status": "success",
            "message": "Sub Lot Process created successfully",
            "process_record": process_doc.name,
            "tracker_id": tracker_id
        }
    
    except Exception as e:
        # Update tracker with error information
        if 'process_tracker' in locals() and process_tracker:
            process_tracker.status = "Failed"
            process_tracker.stage_description = f"Error: {str(e)}"
            process_tracker.save()
            
        frappe.logger().error(f"Error creating Sub Lot Process: {str(e)}")
        frappe.log_error(message=f"Error creating Sub Lot Process: {str(e)}", title="Sub Lot Process API Error")
        return {
            "status": "error",
            "message": f"Failed to create Sub Lot Process: {str(e)}",
            "tracker_id": tracker_id if 'tracker_id' in locals() else None
        }

@frappe.whitelist()
def get_process_status(tracker_id):
    """
    Get the current status of a process using its tracker ID
    
    Args:
        tracker_id (str): ID of the process tracker document
        
    Returns:
        dict: Current status of the process
    """
    try:
        if not tracker_id:
            return {"status": "error", "message": "Tracker ID is required"}
        
        # Check if the tracker document exists
        if not frappe.db.exists("Process Tracker", tracker_id):
            # Try to handle the case where the process might have completed successfully
            # but the tracker reference is no longer accessible
            frappe.logger().warning(f"Process Tracker {tracker_id} not found, checking if Sub Lot Process exists")
            
            # Look for recently created Sub Lot Process documents
            recent_processes = frappe.get_all(
                "Sub Lot Process",
                filters={"creation": [">", frappe.utils.add_to_date(None, minutes=-30)]},
                order_by="creation desc",
                limit=1
            )
            
            if recent_processes:
                process_doc = frappe.get_doc("Sub Lot Process", recent_processes[0].name)
                return {
                    "status": "success",
                    "data": {
                        "process_status": "Completed",
                        "current_stage": "Complete",
                        "progress_percent": 100,
                        "stage_description": "Process completed successfully!",
                        "reference_doctype": "Sub Lot Process",
                        "reference_name": process_doc.name
                    }
                }
            
            return {"status": "error", "message": f"Process Tracker {tracker_id} not found"}
        
        # Get the tracker document
        tracker = frappe.get_doc("Process Tracker", tracker_id)
        
        # Return the status information
        return {
            "status": "success",
            "data": {
                "process_status": tracker.status,
                "current_stage": tracker.current_stage,
                "progress_percent": tracker.progress_percent,
                "stage_description": tracker.stage_description,
                "reference_doctype": tracker.reference_doctype,
                "reference_name": tracker.reference_name
            }
        }
        
    except Exception as e:
        frappe.logger().error(f"Error getting process status: {str(e)}")
        return {
            "status": "error",
            "message": f"Failed to get process status: {str(e)}"
        }

@frappe.whitelist()
def get_sublot_process_details(process_id):
    """
    Get details of a Sub Lot Process record.
    
    Args:
        process_id (str): ID of the Sub Lot Process record
        
    Returns:
        dict: Process details
    """
    try:
        if not process_id:
            return {"status": "error", "message": "Process ID is required"}
        
        # Check if the document exists
        if not frappe.db.exists("Sub Lot Process", process_id):
            return {"status": "error", "message": f"Process record {process_id} not found"}
        
        # Get the document
        process_doc = frappe.get_doc("Sub Lot Process", process_id)
        
        # Convert to dictionary for the response
        process_data = process_doc.as_dict()
        
        # Return the data
        return {
            "status": "success",
            "data": process_data
        }
        
    except Exception as e:
        frappe.logger().error(f"Error getting Sub Lot Process details: {str(e)}")
        frappe.log_error(message=f"Error getting Sub Lot Process details: {str(e)}", title="Sub Lot Process API Error")
        return {
            "status": "error",
            "message": f"Failed to get Sub Lot Process details: {str(e)}"
        }

@frappe.whitelist()
def validate_batch_for_process(batch_id):
    """
    Validate if a batch can be processed.
    
    Args:
        batch_id (str): Batch ID to validate
        
    Returns:
        dict: Validation result
    """
    try:
        # First use the existing validation utility
        response = frappe.call_method(
            "smart_screens.smart_screens.utils.lot_validation.sub_lot_validation",
            sublot=batch_id,
            stage=frappe.defaults.get_user_default("stage") or "",
            warehouse=frappe.defaults.get_user_default("warehouse") or ""
        )
        
        # Check if the batch is already used in a Sub Lot Process
        existing_process = frappe.get_all(
            "Sub Lot Process",
            filters={"spp_batch_number": batch_id},
            fields=["name", "creation"]
        )
        
        if existing_process:
            # Return warning about existing process
            return {
                "status": "warning",
                "message": f"This batch is already used in process {existing_process[0].name} created on {existing_process[0].creation}",
                "data": response,
                "existing_process": existing_process[0].name
            }
        
        # Return the validation result
        return {
            "status": "success",
            "data": response
        }
        
    except Exception as e:
        frappe.logger().error(f"Error validating batch for process: {str(e)}")
        frappe.log_error(message=f"Error validating batch for process: {str(e)}", title="Sub Lot Process API Error")
        return {
            "status": "error",
            "message": f"Failed to validate batch: {str(e)}"
        }

@frappe.whitelist()
def create_simplified_sublot_process(batch_info, inspection_qty=None, rejection_data=None, bom_info=None, inspector_info=None):
    """
    Simplified API to create a sub-lot process with minimal data
    
    Args:
        batch_info (dict|str): Batch information
        inspection_qty (float, optional): Inspection quantity if final inspection is performed
        rejection_data (list|str, optional): Rejection data if any
        bom_info (dict|str, optional): BOM information if available
        inspector_info (dict|str, optional): Inspector information
        
    Returns:
        dict: Response with the created Sub Lot Process document ID
    """
    try:
        # Initialize response data
        response_data = {
            "status": "success",
            "message": "Sub Lot Process created successfully"
        }
        
        # Parse batch info if it's a string
        if isinstance(batch_info, str):
            try:
                batch_info = json.loads(batch_info)
            except:
                batch_info = {"raw_string": batch_info}
            
        # Parse rejection data if provided
        if rejection_data:
            if isinstance(rejection_data, str):
                try:
                    rejection_data = json.loads(rejection_data)
                except:
                    rejection_data = {"raw_string": rejection_data}
        else:
            rejection_data = []
        
        # Parse BOM info if provided
        if bom_info:
            if isinstance(bom_info, str):
                try:
                    bom_info = json.loads(bom_info)
                except:
                    bom_info = {"raw_string": bom_info}
        
        # Parse inspector info if provided
        if inspector_info:
            if isinstance(inspector_info, str):
                try:
                    inspector_info = json.loads(inspector_info)
                except:
                    inspector_info = {"raw_string": inspector_info}
        
        # Convert inspection quantity to float if provided
        parsed_inspection_qty = None
        if inspection_qty:
            try:
                parsed_inspection_qty = float(inspection_qty)
            except:
                parsed_inspection_qty = inspection_qty
        
        # Log received data for debugging
        frappe.logger().info(f"Creating Sub Lot Process: batch_info={batch_info}, inspection_qty={inspection_qty}")
        
        # 1. Validate required data
        if not batch_info:
            return {"status": "error", "message": "Batch information is required"}
            
        if not parsed_inspection_qty:
            return {"status": "error", "message": "Inspection quantity is required"}
            
        if not batch_info.get("item_code"):
            return {"status": "error", "message": "Item code is required in batch information"}
            
        # 2. Fetch item information and BOM operations if not provided
        item_code = batch_info.get("item_code")
        operations_from_input = []
        
        # If we have BOM info with operations, use it
        if bom_info and isinstance(bom_info, dict) and "operations" in bom_info:
            operations_from_bom = bom_info.get("operations", [])
        else:
            # Get BOM operations for this item
            bom_records = get_bom_details_for_batch(batch_info.get("batch_no"))
            operations_from_bom = []
            
            if bom_records and len(bom_records) > 0:
                for bom in bom_records:
                    operations_from_bom.extend(bom.get("operations", []))
        
        # 3. Create a new Sub Lot Process document
        process_doc = frappe.new_doc("Sub Lot Process")
        
        # Set basic fields from batch info
        process_doc.spp_batch_number = batch_info.get("sppBatchId") or batch_info.get("batch_id")
        process_doc.batch_no = batch_info.get("batch_no")
        process_doc.item_code = item_code
        process_doc.warehouse = batch_info.get("warehouse")
        
        # Set quantities
        process_doc.available_quantity = batch_info.get("quantity")
        process_doc.inspection_quantity = parsed_inspection_qty
        process_doc.sublot_qty = parsed_inspection_qty
        
        # Generate sub_lot_number by appending a counter if needed
        if batch_info.get("sub_lot_number"):
            process_doc.sub_lot_number = batch_info.get("sub_lot_number")
        else:
            base_batch_num = process_doc.spp_batch_number
            process_doc.sub_lot_number = f"{base_batch_num}-2"  # Default to -2 suffix
        
        # Set barcode based on item code and sub lot number
        process_doc.barcode = f"{item_code}{process_doc.sub_lot_number}"
        
        # Set inspector information if provided
        if inspector_info:
            process_doc.inspector_code = inspector_info.get("inspector_code")
            process_doc.inspector_name = inspector_info.get("inspector_name")
        
        # Set work order if available and valid
        if batch_info.get("work_order") and frappe.db.exists("Work Order", batch_info.get("work_order")):
            process_doc.work_order = batch_info.get("work_order")
        
        # 4. Add operations
        # Check if we have the Final Visual Inspection operation from user input
        final_inspection_op = None
        if rejection_data and len(rejection_data) > 0:
            # If we have rejection data, assume we have the final inspection operation
            final_inspection_op = {
                "operation": "Final Visual Inspection",
                "employee_code": inspector_info.get("inspector_code") if inspector_info else "",
                "employee_name": inspector_info.get("inspector_name") if inspector_info else ""
            }
            
        # First, add all operations from BOM
        added_operations = set()
        for op in operations_from_bom:
            op_name = op.get("operation")
            if op_name and op_name not in added_operations:
                process_doc.append("operations", {
                    "operation": op_name,
                    "processed_qty": parsed_inspection_qty,  # Use inspection quantity as processed quantity
                    "employee_code": "HR-EMP-00368",  # Default employee code for other operations
                    "employee_name": ""
                })
                added_operations.add(op_name)
        
        # Then add or update the Final Visual Inspection operation if we have it
        if final_inspection_op:
            # Check if we already added this operation from BOM
            if final_inspection_op["operation"] in added_operations:
                # Update the existing operation with employee info
                for op in process_doc.operations:
                    if op.operation == final_inspection_op["operation"]:
                        op.employee_code = final_inspection_op["employee_code"]
                        op.employee_name = final_inspection_op["employee_name"]
            else:
                # Add as a new operation
                process_doc.append("operations", {
                    "operation": final_inspection_op["operation"],
                    "processed_qty": parsed_inspection_qty,  # Use parsed_inspection_qty consistently
                    "employee_code": final_inspection_op["employee_code"],
                    "employee_name": final_inspection_op["employee_name"]
                })
        
        # 5. Add rejection details if provided
        if rejection_data and isinstance(rejection_data, list):
            total_rejection_qty = 0
            
            for rejection in rejection_data:
                if isinstance(rejection, dict):
                    rejection_type = rejection.get("rejectionType")
                    quantity = rejection.get("quantity")
                    
                    # Handle case where property names might be different
                    if not rejection_type and "rejection_type" in rejection:
                        rejection_type = rejection.get("rejection_type")
                        
                    if not quantity and "quantity" in rejection:
                        quantity = rejection.get("quantity")
                    
                    # Skip if either rejection_type or quantity is missing or zero
                    if not rejection_type or not quantity or float(quantity) <= 0:
                        continue
                        
                    try:
                        quantity = float(quantity)
                        total_rejection_qty += quantity
                        
                        # Add the rejection item to the child table
                        process_doc.append("rejection_items", {
                            "rejection_type": rejection_type,
                            "quantity": quantity
                        })
                        
                        # Log for debugging
                        frappe.logger().info(f"Added rejection: {rejection_type}, qty: {quantity}")
                    except Exception as e:
                        frappe.logger().error(f"Error adding rejection {rejection_type}: {str(e)}")
            
            # Log total rejection quantity for verification
            frappe.logger().info(f"Total rejection quantity added: {total_rejection_qty}")
        
        # 6. Save the document in draft mode
        try:
            process_doc.insert()
            process_doc.submit()
            
            # Verify rejections were added correctly
            saved_doc = frappe.get_doc("Sub Lot Process", process_doc.name)
            frappe.logger().info(f"Saved SubLot Process {process_doc.name} with {len(saved_doc.rejection_items)} rejection items")
        except Exception as e:
            frappe.logger().error(f"Error saving SubLot Process document: {str(e)}")
            raise
        
        # Return success response with the document ID
        return {
            "status": "success",
            "message": "Sub Lot Process created successfully",
            "process_record": process_doc.name
        }
    
    except Exception as e:
        frappe.log_error(f"Error in create_simplified_sublot_process: {str(e)}", "Sub Lot Process API Error")
        return {
            "status": "error",
            "message": f"Failed to create Sub Lot Process: {str(e)}"
        }

def get_bom_details_for_batch(batch_number):
    """
    Helper function to get BOM details for a batch
    
    Args:
        batch_number (str): The batch number
        
    Returns:
        list: BOM details with operations
    """
    try:
        # Get batch details including item code
        batch = frappe.get_doc("Batch", batch_number)
        item_code = batch.item
        
        if not item_code:
            return []
        
        # Get active BOM for the item
        bom = frappe.get_all(
            "BOM",
            filters={"item": item_code, "is_active": 1, "is_default": 1},
            fields=["name"]
        )
        
        if not bom:
            return []
        
        bom_doc = frappe.get_doc("BOM", bom[0].name)
        
        # Get operations from BOM
        operations = []
        if hasattr(bom_doc, 'operations') and bom_doc.operations:
            for op in bom_doc.operations:
                operations.append({
                    "operation": op.operation,
                    "workstation": op.workstation,
                    "time_in_mins": op.time_in_mins
                })
        
        # Return structured BOM details
        return [{
            "bom": bom_doc.name,
            "item_code": item_code,
            "item_name": bom_doc.item_name,
            "operations": operations
        }]
    
    except Exception as e:
        frappe.log_error(f"Error fetching BOM details for batch {batch_number}: {str(e)}", "Sub Lot Process Error")
        return []

def create_process_tracker(tracker_id, current_stage, stage_description, progress_percent):
    """Create a new process tracker entry"""
    try:
        # Check if the tracker document type exists, if not you may need to create a custom DocType
        if frappe.db.exists("Sub Lot Process Tracker", tracker_id):
            return update_process_tracker(tracker_id, current_stage, stage_description, progress_percent)
        
        # Create a new tracker document
        tracker = frappe.new_doc("Sub Lot Process Tracker")
        tracker.tracker_id = tracker_id
        tracker.process_status = "Processing"
        tracker.current_stage = current_stage
        tracker.stage_description = stage_description
        tracker.progress_percent = progress_percent
        tracker.start_time = datetime.now()
        tracker.insert(ignore_permissions=True)
        
        return tracker
    except Exception as e:
        frappe.log_error(f"Error creating process tracker: {str(e)}", "Sub Lot Process Error")
        return None

def update_process_tracker(tracker_id, current_stage, stage_description, progress_percent, status="Processing"):
    """Update an existing process tracker entry"""
    try:
        if not frappe.db.exists("Sub Lot Process Tracker", tracker_id):
            return create_process_tracker(tracker_id, current_stage, stage_description, progress_percent)
        
        # Update the tracker
        tracker = frappe.get_doc("Sub Lot Process Tracker", tracker_id)
        tracker.process_status = status
        tracker.current_stage = current_stage
        tracker.stage_description = stage_description
        tracker.progress_percent = progress_percent
        tracker.last_update = datetime.now()
        
        if status == "Completed" or status == "Failed":
            tracker.end_time = datetime.now()
        
        tracker.save(ignore_permissions=True)
        
        return tracker
    except Exception as e:
        frappe.log_error(f"Error updating process tracker: {str(e)}", "Sub Lot Process Error")
        return None