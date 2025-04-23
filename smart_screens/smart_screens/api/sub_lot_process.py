import frappe
import json
from frappe import _

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
        
        # Update progress - Adding location information
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
            return {"status": "error", "message": f"Tracker {tracker_id} not found"}
        
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
def get_location_details():
    """
    Get location details for the current user based on their role assignments.
    This method retrieves all locations that the current user is authorized to access.
    
    Returns:
        dict: Dictionary containing allowed locations for the current user
    """
    try:
        user = frappe.session.user
        
        # Get user's role assignments
        user_roles = frappe.get_roles(user)
        
        # Get all locations based on user's roles
        # Query the Location Assignment doctype if it exists
        if frappe.db.table_exists("Location Assignment"):
            allowed_locations = frappe.get_all(
                "Location Assignment",
                filters={
                    "role": ["in", user_roles],
                    "enabled": 1
                },
                fields=["location", "source_warehouse", "target_warehouse", "stage", "role", "transaction_type"]
            )
        else:
            # Fallback if location assignment doctype doesn't exist
            # You can customize this with your specific table structure
            allowed_locations = []
            
            # Add some default locations for testing if no locations found
            if not allowed_locations:
                default_location = {
                    "location": "Production Floor",
                    "source_warehouse": frappe.db.get_single_value("Manufacturing Settings", "default_source_warehouse") or "Stores - SPP",
                    "target_warehouse": frappe.db.get_single_value("Manufacturing Settings", "default_target_warehouse") or "Finished Goods - SPP",
                    "stage": "Production",
                    "role": "Manufacturing User",
                    "transaction_type": "Manufacture"
                }
                allowed_locations.append(default_location)
        
        # Log the found locations
        frappe.logger().info(f"Found {len(allowed_locations)} locations for user {user}")
        
        return {
            "status": "success",
            "allowed_locations": allowed_locations
        }
    
    except Exception as e:
        frappe.logger().error(f"Error getting location details: {str(e)}")
        frappe.log_error(message=f"Error getting location details: {str(e)}", title="Sub Lot Process API Error")
        return {
            "status": "error",
            "message": f"Failed to get location details: {str(e)}"
        }