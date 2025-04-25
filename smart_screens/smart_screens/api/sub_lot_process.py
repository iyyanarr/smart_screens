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
        processing_mode = form_data.get("processing_mode", "sublot")  # Get processing mode
        
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
        process_doc.processing_mode = processing_mode  # Store the processing mode
        
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
        
        # NEW: Handle specific processing modes based on inspection quantity
        try:
            # Process based on the processing mode
            if processing_mode == "direct":
                # If Inspected Qty = Lot Qty, skip Sublot and directly do Lot tagging and Manufacture SE
                process_tracker.current_stage = "Work Order"
                process_tracker.progress_percent = 95
                process_tracker.stage_description = "Creating direct manufacturing entry..."
                process_tracker.save()
                
                # Create Manufacturing Stock Entry directly without repack
                create_direct_manufacturing_entry(process_doc.name)
                
            elif processing_mode == "excess":
                # If Inspected Qty > Lot Qty, do Sublot (Repack) but also log for approval
                process_tracker.current_stage = "Sub Lot Creation"
                process_tracker.progress_percent = 95
                process_tracker.stage_description = "Creating sublot with excess quantity..."
                process_tracker.save()
                
                # Create Sublot (Repack) entry
                create_repack_stock_entry(process_doc.name)
                
                # Create Manufacturing Stock Entry
                create_manufacturing_stock_entry(process_doc.name)
                
                # Log excess quantity for approval
                log_excess_quantity(process_doc.name, process_doc.inspection_quantity, process_doc.available_quantity)
                
            else:
                # Standard flow - Inspected Qty < Lot Qty - Do Sublot (Repack) entry
                process_tracker.current_stage = "Sub Lot Creation"
                process_tracker.progress_percent = 95
                process_tracker.stage_description = "Creating standard sublot..."
                process_tracker.save()
                
                # Create Sublot (Repack) entry
                create_repack_stock_entry(process_doc.name)
                
                # Create Manufacturing Stock Entry
                create_manufacturing_stock_entry(process_doc.name)
            
            # NEW: Submit related SPP Lot Resource Tagging and SPP Inspection Entry documents
            process_tracker.stage_description = "Submitting related documents..."
            process_tracker.save()
            
            # Find and submit SPP Lot Resource Tagging
            submit_related_lot_resource_tagging(process_doc.name, process_doc.spp_batch_number)
            
            # Find and submit SPP Inspection Entry
            submit_related_inspection_entry(process_doc.name, process_doc.spp_batch_number, process_doc.item_code)
                
        except Exception as e:
            # If any processing fails, update the tracker with error information
            process_tracker.status = "Failed"
            process_tracker.stage_description = f"Processing Error: {str(e)}"
            process_tracker.save()
            
            frappe.logger().error(f"Error in post-processing for Sub Lot Process: {str(e)}")
            frappe.log_error(message=f"Error in post-processing for Sub Lot Process: {str(e)}", title="Sub Lot Process Post-Processing Error")
            
            return {
                "status": "error",
                "message": f"Failed in post-processing: {str(e)}",
                "process_record": process_doc.name,
                "tracker_id": tracker_id
            }
        
        # Final progress update
        process_tracker.current_stage = "Complete"
        process_tracker.progress_percent = 100
        process_tracker.status = "Completed"
        process_tracker.stage_description = f"Process completed successfully with mode: {processing_mode}"
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

def create_repack_stock_entry(process_id):
    """
    Create a Repack Stock Entry for the Sub Lot Process.
    This is the standard flow for creating a sublot when Inspected Qty < Lot Qty
    
    Args:
        process_id (str): ID of the Sub Lot Process record
        
    Returns:
        str: ID of the created Stock Entry
    """
    try:
        if not process_id:
            frappe.throw("Process ID is required")
        
        # Get the Sub Lot Process document
        process_doc = frappe.get_doc("Sub Lot Process", process_id)
        
        # Create a new Stock Entry document for Repack
        stock_entry = frappe.new_doc("Stock Entry")
        stock_entry.stock_entry_type = "Repack"
        stock_entry.company = frappe.defaults.get_user_default("company")
        
        # Get source and target warehouses from the process
        source_warehouse = None
        target_warehouse = None
        
        if process_doc.st_reference_docs and len(process_doc.st_reference_docs) > 0:
            # Use proper attribute names for the child table fields
            # The issue was here - using incorrect attribute names
            for ref_doc in process_doc.st_reference_docs:
                if hasattr(ref_doc, 'source_warehouse'):
                    source_warehouse = ref_doc.source_warehouse
                    break
                # Try alternative attribute names based on the actual DocType structure
                elif hasattr(ref_doc, 'from_warehouse'):
                    source_warehouse = ref_doc.from_warehouse
                    break
            
            for ref_doc in process_doc.st_reference_docs:
                if hasattr(ref_doc, 'target_warehouse'):
                    target_warehouse = ref_doc.target_warehouse
                    break
                # Try alternative attribute names
                elif hasattr(ref_doc, 'to_warehouse'):
                    target_warehouse = ref_doc.to_warehouse
                    break
        
        if not source_warehouse:
            source_warehouse = process_doc.warehouse
        
        if not target_warehouse:
            target_warehouse = process_doc.warehouse
        
        stock_entry.from_warehouse = source_warehouse
        stock_entry.to_warehouse = target_warehouse
        
        # Add raw material item (from the batch)
        stock_entry.append("items", {
            "item_code": process_doc.item_code,
            "qty": process_doc.inspection_quantity,
            "batch_no": process_doc.batch_no,
            "s_warehouse": source_warehouse,
            "sub_lot_process": process_doc.name,
            "is_finished_item": 0,
            "spp_batch_number": process_doc.spp_batch_number
        })
        
        # Add finished good item (create a new batch with sublot number)
        stock_entry.append("items", {
            "item_code": process_doc.item_code,
            "qty": process_doc.inspection_quantity,
            "t_warehouse": target_warehouse,
            "sub_lot_process": process_doc.name,
            "is_finished_item": 1,
            "spp_batch_number": process_doc.sub_lot_number
        })
        
        # Add reference to Sub Lot Process in custom fields if available
        if frappe.db.exists("Custom Field", {"dt": "Stock Entry", "fieldname": "sub_lot_process"}):
            stock_entry.sub_lot_process = process_doc.name
        
        # Save and submit the stock entry
        stock_entry.insert()
        stock_entry.submit()
        
        # Update the Sub Lot Process with the repack entry
        process_doc.repack_stock_entry = stock_entry.name
        process_doc.save()
        
        frappe.logger().info(f"Created repack stock entry {stock_entry.name} for Sub Lot Process {process_id}")
        
        return stock_entry.name
    
    except Exception as e:
        frappe.logger().error(f"Error creating repack stock entry: {str(e)}")
        frappe.log_error(message=f"Error creating repack stock entry: {str(e)}", title="Sub Lot Process Error")
        raise

def submit_related_lot_resource_tagging(process_id, spp_batch_number):
    """
    Find and submit SPP Lot Resource Tagging documents related to the Sub Lot Process.
    
    Args:
        process_id (str): ID of the Sub Lot Process record
        spp_batch_number (str): SPP Batch Number to find related documents
        
    Returns:
        list: List of submitted document IDs
    """
    try:
        if not spp_batch_number:
            frappe.logger().warning(f"SPP Batch Number is required to submit related Lot Resource Tagging for process {process_id}")
            return []
            
        # Find relevant SPP Lot Resource Tagging documents that are in Draft state
        lot_tagging_docs = frappe.get_all(
            "SPP Lot Resource Tagging",
            filters={
                "spp_batch_id": spp_batch_number,
                "docstatus": 0  # Draft state
            },
            fields=["name"]
        )
        
        if not lot_tagging_docs:
            frappe.logger().info(f"No draft SPP Lot Resource Tagging documents found for batch {spp_batch_number}")
            return []
            
        submitted_docs = []
        
        # Submit each document
        for doc in lot_tagging_docs:
            try:
                tagging_doc = frappe.get_doc("SPP Lot Resource Tagging", doc.name)
                
                # Link to Sub Lot Process if field exists
                if hasattr(tagging_doc, "sub_lot_process"):
                    tagging_doc.sub_lot_process = process_id
                
                tagging_doc.submit()
                frappe.db.commit()
                submitted_docs.append(doc.name)
                frappe.logger().info(f"Successfully submitted SPP Lot Resource Tagging {doc.name}")
            except Exception as e:
                frappe.logger().error(f"Error submitting SPP Lot Resource Tagging {doc.name}: {str(e)}")
                frappe.log_error(message=f"Error submitting SPP Lot Resource Tagging {doc.name}: {str(e)}", 
                                title="SPP Lot Resource Tagging Submission Error")
        
        return submitted_docs
        
    except Exception as e:
        frappe.logger().error(f"Error submitting related SPP Lot Resource Tagging documents: {str(e)}")
        frappe.log_error(message=f"Error submitting related SPP Lot Resource Tagging documents: {str(e)}", 
                        title="Sub Lot Process Related Documents Error")
        return []

def submit_related_inspection_entry(process_id, spp_batch_number, item_code):
    """
    Find and submit SPP Inspection Entry documents related to the Sub Lot Process.
    
    Args:
        process_id (str): ID of the Sub Lot Process record
        spp_batch_number (str): SPP Batch Number to find related documents
        item_code (str): Item code to further filter inspection entries
        
    Returns:
        list: List of submitted document IDs
    """
    try:
        if not spp_batch_number:
            frappe.logger().warning(f"SPP Batch Number is required to submit related Inspection Entry for process {process_id}")
            return []
            
        # Build filters to find relevant inspection entries
        filters = {
            "docstatus": 0  # Draft state
        }
        
        # Add batch number filter if available - check common field name variations
        if spp_batch_number:
            # Check which field exists in the doctype and use it
            field_options = ["spp_batch_id", "batch_no", "batch_number", "spp_batch_number"]
            for field in field_options:
                if frappe.db.exists("DocField", {"parent": "SPP Inspection Entry", "fieldname": field}):
                    filters[field] = spp_batch_number
                    break
        
        # Add item code filter if available
        if item_code:
            if frappe.db.exists("DocField", {"parent": "SPP Inspection Entry", "fieldname": "item_code"}):
                filters["item_code"] = item_code
            elif frappe.db.exists("DocField", {"parent": "SPP Inspection Entry", "fieldname": "item"}):
                filters["item"] = item_code
                
        # Find relevant SPP Inspection Entry documents
        inspection_docs = frappe.get_all(
            "SPP Inspection Entry",
            filters=filters,
            fields=["name"]
        )
        
        if not inspection_docs:
            frappe.logger().info(f"No draft SPP Inspection Entry documents found for batch {spp_batch_number}")
            return []
            
        submitted_docs = []
        
        # Submit each document
        for doc in inspection_docs:
            try:
                inspection_doc = frappe.get_doc("SPP Inspection Entry", doc.name)
                
                # Link to Sub Lot Process if field exists
                if hasattr(inspection_doc, "sub_lot_process"):
                    inspection_doc.sub_lot_process = process_id
                
                inspection_doc.submit()
                frappe.db.commit()
                submitted_docs.append(doc.name)
                frappe.logger().info(f"Successfully submitted SPP Inspection Entry {doc.name}")
            except Exception as e:
                frappe.logger().error(f"Error submitting SPP Inspection Entry {doc.name}: {str(e)}")
                frappe.log_error(message=f"Error submitting SPP Inspection Entry {doc.name}: {str(e)}", 
                                title="SPP Inspection Entry Submission Error")
        
        return submitted_docs
        
    except Exception as e:
        frappe.logger().error(f"Error submitting related SPP Inspection Entry documents: {str(e)}")
        frappe.log_error(message=f"Error submitting related SPP Inspection Entry documents: {str(e)}", 
                        title="Sub Lot Process Related Documents Error")
        return []