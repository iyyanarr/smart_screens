import frappe
from frappe import _
import json

@frappe.whitelist()
def get_resource_tagging_fields(item_code, operation, sublot_number, employee_id):
    """
    Fetch all additional fields required for SPP Lot Resource Tagging
    
    Args:
        item_code (str): Item code
        operation (str): Operation name
        sublot_number (str): Sub-lot number
        employee_id (str): Employee ID
        
    Returns:
        dict: Additional fields for SPP Lot Resource Tagging
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
                "item_code",  # ✅ FIXED: Added item_code field
                "batch",
                "sublot_batch",
                "sublot_qty",
                "final_sublot_qty",
                "stockentry_ref",
                "source_warehouse",  # ✅ FIXED: Use actual fields from DocType
                "target_warehouse"   # ✅ FIXED: Use actual fields from DocType
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
        # Get the sublot entry document
        sublot_entry = frappe.get_doc("Sub Lot Entry", sublot_entry_name)
        
        # ✅ FIXED: Since Sub Lot Entry doesn't have source_document fields,
        # search for Sub Lot Process that references this sublot number
        sublot_processes = frappe.get_all(
            "Sub Lot Process",
            filters={
                "sub_lot_number": sublot_entry.sublot_number,
                "docstatus": 1
            },
            fields=["name", "work_order"],
            limit=1
        )
        
        if sublot_processes and sublot_processes[0].get("work_order"):
            return sublot_processes[0].get("work_order")
        
        # Alternative: Search for work orders that reference this item
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

@frappe.whitelist()
def create_resource_tagging_workflow(sublot_number, operations_data):
    """
    Create complete resource tagging workflow with all related documents
    This mirrors the Sub Lot Process on_submit() workflow
    
    Args:
        sublot_number (str): Sub-lot number (directly from frontend scan)
        operations_data (str|list): List of operations with employee details
        
    Returns:
        dict: Status and created document references
    """
    try:
        # Parse operations data if it's a string
        if isinstance(operations_data, str):
            operations_data = json.loads(operations_data)
        
        # Validate input
        if not sublot_number:
            return {
                "status": "error",
                "message": "Sub-lot number is required"
            }
        
        if not operations_data or len(operations_data) == 0:
            return {
                "status": "error",
                "message": "At least one operation is required"
            }
        
        # ✅ FIXED: Get Sub Lot Entry details for additional info, but use scanned sublot_number directly
        sublot_entry = get_sublot_entry_details(sublot_number)
        
        # ✅ ENHANCED: Create sublot_entry_data using scanned sublot_number even if no Sub Lot Entry found
        if sublot_entry:
            # Use data from Sub Lot Entry if available
            sublot_entry_data = sublot_entry
        else:
            # ✅ FIXED: Create minimal data structure using the scanned sublot_number
            frappe.logger().info(f"No Sub Lot Entry found, using scanned sublot_number: {sublot_number}")
            sublot_entry_data = {
                "sublot_number": sublot_number,  # Use the scanned value directly
                "item_code": "",  # Will be populated from operations if needed
                "batch": "",
                "sublot_batch": "",
                "sublot_qty": 0,
                "final_sublot_qty": 0,
                "source_warehouse": "",
                "target_warehouse": ""
            }
        
        # ✅ FIXED: Always ensure sublot_number is the scanned value
        sublot_entry_data["sublot_number"] = sublot_number
        
        # 2. Get or create Sub Lot Process document
        sublot_process = get_or_create_sublot_process_with_scanned_number(sublot_entry_data, operations_data, sublot_number)
        if not sublot_process:
            return {
                "status": "error",
                "message": "Failed to create Sub Lot Process document"
            }
        
        # 3. Get or create Work Order
        work_order_name = get_or_create_work_order(sublot_process)
        
        # 4. Call the same resource_job_card utility that Sub Lot Process uses
        from smart_screens.smart_screens.utils.resource_job_card import create_lot_resource_tag_and_job_card
        
        # Create a mock sublot_process object with required attributes
        class MockSubLotProcess:
            def __init__(self, doc_data):
                self.doctype = "Sub Lot Process"  # ✅ FIXED: Add missing doctype attribute
                self.name = doc_data.get("name")
                self.sub_lot_number = doc_data.get("sub_lot_number")
                self.item_code = doc_data.get("item_code")
                self.barcode = doc_data.get("barcode")
                self.warehouse = doc_data.get("warehouse")
                self.available_quantity = doc_data.get("available_quantity")
                self.operations = doc_data.get("operations", [])
                self.rejection_items = doc_data.get("rejection_items", [])
        
        mock_process = MockSubLotProcess(sublot_process)
        
        # 5. Create Lot Resource Tags and Job Cards
        resource_result = create_lot_resource_tag_and_job_card(
            sublot_process=mock_process,
            work_order=work_order_name
        )
        
        if resource_result.get("status") == "success":
            return {
                "status": "success",
                "message": "Resource tagging workflow completed successfully",
                "data": {
                    "sublot_process": sublot_process.get("name"),
                    "work_order": work_order_name,
                    "resource_tags": resource_result.get("resources", []),
                    "job_cards": resource_result.get("job_cards", []),
                    "inspection_entry": resource_result.get("inspection_entry")
                }
            }
        else:
            return {
                "status": "warning",
                "message": resource_result.get("message", "Partial success - some documents may not have been created"),
                "data": {
                    "sublot_process": sublot_process.get("name"),
                    "work_order": work_order_name
                }
            }
            
    except Exception as e:
        frappe.log_error(f"Error in create_resource_tagging_workflow: {str(e)}", "Resource Tagging Workflow Error")
        return {
            "status": "error",
            "message": f"Failed to create resource tagging workflow: {str(e)}"
        }

# ✅ NEW: Enhanced function that directly uses scanned sublot number
def get_or_create_sublot_process_with_scanned_number(sublot_entry_data, operations_data, scanned_sublot_number):
    """
    Get existing Sub Lot Process or create a new one using the scanned sublot number
    """
    try:
        # ✅ ENHANCED: Search for existing Sub Lot Process using scanned sublot number
        existing_processes = frappe.get_all(
            "Sub Lot Process",
            filters={
                "sub_lot_number": scanned_sublot_number,  # Use scanned value directly
                "docstatus": ["<", 2]  # Include draft and submitted, exclude cancelled
            },
            fields=["name", "docstatus"],
            limit=1
        )
        
        if existing_processes:
            try:
                existing_process = frappe.get_doc("Sub Lot Process", existing_processes[0].name)
                
                # Update operations if needed
                existing_ops = [op.operation for op in existing_process.operations]
                for op_data in operations_data:
                    if op_data.get("operation_type") not in existing_ops:
                        existing_process.append("operations", {
                            "operation": op_data.get("operation_type"),
                            "employee_code": op_data.get("operator_id"),
                            "employee_name": op_data.get("operator_name")
                        })
                
                # Save if we added new operations
                if len(existing_process.operations) > len(existing_ops):
                    existing_process.save()
                
                return existing_process.as_dict()
                
            except frappe.DoesNotExistError:
                pass
        
        # ✅ FIXED: Create new Sub Lot Process document using scanned sublot number
        process_doc = frappe.new_doc("Sub Lot Process")
        
        # ✅ FIXED: Use scanned sublot_number directly
        process_doc.sub_lot_number = scanned_sublot_number  # ✅ USE SCANNED VALUE DIRECTLY
        process_doc.spp_batch_number = sublot_entry_data.get("sublot_batch") or sublot_entry_data.get("batch") or scanned_sublot_number  # ✅ Fallback to scanned value
        process_doc.batch_no = sublot_entry_data.get("batch") or ""
        process_doc.sublot_batch_number = sublot_entry_data.get("sublot_batch") or sublot_entry_data.get("batch") or ""
        process_doc.item_code = sublot_entry_data.get("item_code") or ""
        process_doc.warehouse = sublot_entry_data.get("source_warehouse") or sublot_entry_data.get("target_warehouse") or ""
        process_doc.barcode = sublot_entry_data.get("sublot_batch") or sublot_entry_data.get("batch") or scanned_sublot_number
        process_doc.available_quantity = sublot_entry_data.get("sublot_qty") or 0
        process_doc.sublot_qty = sublot_entry_data.get("final_sublot_qty") or sublot_entry_data.get("sublot_qty") or 0
        process_doc.inspection_quantity = sublot_entry_data.get("final_sublot_qty") or sublot_entry_data.get("sublot_qty") or 0
        
        # ✅ ENHANCED: Add debug logging to verify field values
        frappe.logger().info(f"Creating Sub Lot Process with SCANNED sublot number:")
        frappe.logger().info(f"  - SCANNED sublot_number: {scanned_sublot_number}")
        frappe.logger().info(f"  - sub_lot_number (field): {process_doc.sub_lot_number}")
        frappe.logger().info(f"  - spp_batch_number: {process_doc.spp_batch_number}")
        frappe.logger().info(f"  - batch_no: {process_doc.batch_no}")
        frappe.logger().info(f"  - sublot_batch_number: {process_doc.sublot_batch_number}")
        frappe.logger().info(f"  - item_code: {process_doc.item_code}")
        frappe.logger().info(f"  - sublot_qty: {process_doc.sublot_qty}")
        
        # Add operations
        for op_data in operations_data:
            process_doc.append("operations", {
                "operation": op_data.get("operation_type"),
                "employee_code": op_data.get("operator_id"),
                "employee_name": op_data.get("operator_name")
            })
        
        # Insert the document (don't submit yet - let the workflow handle it)
        process_doc.insert()
        
        frappe.logger().info(f"✅ SUCCESS: Created Sub Lot Process: {process_doc.name} with sublot_number: {process_doc.sub_lot_number}")
        
        return process_doc.as_dict()
        
    except Exception as e:
        frappe.log_error(f"Error creating Sub Lot Process with scanned number {scanned_sublot_number}: {str(e)}", "Resource Tagging Error")
        frappe.logger().error(f"Exception details: {str(e)}")
        return None

def get_or_create_sublot_process(sublot_entry, operations_data):
    """
    Get existing Sub Lot Process or create a new one
    """
    try:
        # ✅ FIXED: Search for existing Sub Lot Process by sublot number
        # since Sub Lot Entry doesn't have source_document fields
        existing_processes = frappe.get_all(
            "Sub Lot Process",
            filters={
                "sub_lot_number": sublot_entry.get("sublot_number"),
                "docstatus": ["<", 2]  # Include draft and submitted, exclude cancelled
            },
            fields=["name", "docstatus"],
            limit=1
        )
        
        if existing_processes:
            try:
                existing_process = frappe.get_doc("Sub Lot Process", existing_processes[0].name)
                
                # Update operations if needed
                existing_ops = [op.operation for op in existing_process.operations]
                for op_data in operations_data:
                    if op_data.get("operation_type") not in existing_ops:
                        existing_process.append("operations", {
                            "operation": op_data.get("operation_type"),
                            "employee_code": op_data.get("operator_id"),
                            "employee_name": op_data.get("operator_name")
                        })
                
                # Save if we added new operations
                if len(existing_process.operations) > len(existing_ops):
                    existing_process.save()
                
                return existing_process.as_dict()
                
            except frappe.DoesNotExistError:
                pass
        
        # ✅ FIXED: Create new Sub Lot Process document with correct field mappings
        process_doc = frappe.new_doc("Sub Lot Process")
        
        # ✅ FIXED: Correct field assignments based on DocType structure
        process_doc.sub_lot_number = sublot_entry.get("sublot_number")  # Sub Lot Number field
        process_doc.spp_batch_number = sublot_entry.get("sublot_batch") or sublot_entry.get("batch")  # SPP Batch Number field
        process_doc.batch_no = sublot_entry.get("batch")  # Batch No field
        process_doc.sublot_batch_number = sublot_entry.get("sublot_batch") or sublot_entry.get("batch")  # Sublot Batch Number (Link to Batch)
        process_doc.item_code = sublot_entry.get("item_code")
        process_doc.warehouse = sublot_entry.get("source_warehouse") or sublot_entry.get("target_warehouse")
        process_doc.barcode = sublot_entry.get("sublot_batch") or sublot_entry.get("batch")
        process_doc.available_quantity = sublot_entry.get("sublot_qty")
        process_doc.sublot_qty = sublot_entry.get("final_sublot_qty") or sublot_entry.get("sublot_qty")
        process_doc.inspection_quantity = sublot_entry.get("final_sublot_qty") or sublot_entry.get("sublot_qty")
        
        # ✅ ENHANCED: Add debug logging to verify field values
        frappe.logger().info(f"Creating Sub Lot Process with fields:")
        frappe.logger().info(f"  - sub_lot_number: {process_doc.sub_lot_number}")
        frappe.logger().info(f"  - spp_batch_number: {process_doc.spp_batch_number}")
        frappe.logger().info(f"  - batch_no: {process_doc.batch_no}")
        frappe.logger().info(f"  - sublot_batch_number: {process_doc.sublot_batch_number}")
        frappe.logger().info(f"  - item_code: {process_doc.item_code}")
        frappe.logger().info(f"  - sublot_qty: {process_doc.sublot_qty}")
        
        # Add operations
        for op_data in operations_data:
            process_doc.append("operations", {
                "operation": op_data.get("operation_type"),
                "employee_code": op_data.get("operator_id"),
                "employee_name": op_data.get("operator_name")
            })
        
        # Insert the document (don't submit yet - let the workflow handle it)
        process_doc.insert()
        
        frappe.logger().info(f"Created Sub Lot Process: {process_doc.name}")
        
        return process_doc.as_dict()
        
    except Exception as e:
        frappe.log_error(f"Error creating Sub Lot Process: {str(e)}", "Resource Tagging Error")
        frappe.logger().error(f"Exception details: {str(e)}")
        return None

def get_or_create_work_order(sublot_process):
    """
    Get existing Work Order or create a new one
    """
    try:
        # Check if work order already exists in sublot process
        if sublot_process.get("work_order"):
            return sublot_process.get("work_order")
        
        # Try to create work order using the utility
        from smart_screens.smart_screens.utils.generate_work_order import create_work_order_after_sublot
        
        work_order_result = create_work_order_after_sublot(sublot_process=sublot_process.get("name"))
        
        if work_order_result.get("status") == "success":
            work_order_name = work_order_result.get("work_order")
            
            # Update the sublot process with work order reference
            frappe.db.set_value("Sub Lot Process", sublot_process.get("name"), "work_order", work_order_name)
            frappe.db.commit()
            
            return work_order_name
        else:
            frappe.logger().warning(f"Could not create work order: {work_order_result.get('message')}")
            return None
            
    except Exception as e:
        frappe.log_error(f"Error creating work order: {str(e)}", "Resource Tagging Error")
        return None
