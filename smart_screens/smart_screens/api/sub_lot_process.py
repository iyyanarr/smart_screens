import frappe
import json
from frappe import _

@frappe.whitelist()
def create_sublot_process(form_data):
    """
    Create a record in the Sub Lot Process doctype to track the entire process.
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
        
        # Publish initial progress
        frappe.publish_realtime('progress', {
            'percent': 10,
            'title': 'Creating Sub Lot Process',
            'description': 'Validating input data...'
        })
        
        # Validate required data
        if not batch_info:
            return {"status": "error", "message": "Batch information is required"}
        
        if not operations:
            return {"status": "error", "message": "At least one operation is required"}
        
        if not inspection_info:
            return {"status": "error", "message": "Inspection information is required"}
        
        # Update progress
        frappe.publish_realtime('progress', {
            'percent': 20,
            'title': 'Creating Sub Lot Process',
            'description': 'Creating process document...'
        })
        
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
        
        # Update progress
        frappe.publish_realtime('progress', {
            'percent': 30,
            'title': 'Creating Sub Lot Process',
            'description': 'Adding operation details...'
        })
        
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
        
        # Update progress
        frappe.publish_realtime('progress', {
            'percent': 50,
            'title': 'Creating Sub Lot Process',
            'description': 'Adding rejection details...'
        })
        
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
        
        # Update progress
        frappe.publish_realtime('progress', {
            'percent': 70,
            'title': 'Creating Sub Lot Process',
            'description': 'Adding location information...'
        })
        
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
        
        # Update progress
        frappe.publish_realtime('progress', {
            'percent': 80,
            'title': 'Creating Sub Lot Process',
            'description': 'Saving document...'
        })
        
        # Save the document
        process_doc.insert()
        
        # Update progress
        frappe.publish_realtime('progress', {
            'percent': 90,
            'title': 'Creating Sub Lot Process',
            'description': 'Submitting document...'
        })
        
        # submit the document if it's submittable
        if frappe.db.get_value("DocType", "Sub Lot Process", "is_submittable"):
            process_doc.submit()
        
        # Final progress update
        frappe.publish_realtime('progress', {
            'percent': 100,
            'title': 'Creating Sub Lot Process',
            'description': 'Process completed successfully!'
        })
        
        # Log success message
        frappe.logger().info(f"Created Sub Lot Process: {process_doc.name}")
        
        # Return success response
        return {
            "status": "success",
            "message": "Sub Lot Process created successfully",
            "process_record": process_doc.name
        }
    
    except Exception as e:
        frappe.logger().error(f"Error creating Sub Lot Process: {str(e)}")
        frappe.log_error(message=f"Error creating Sub Lot Process: {str(e)}", title="Sub Lot Process API Error")
        return {
            "status": "error",
            "message": f"Failed to create Sub Lot Process: {str(e)}"
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