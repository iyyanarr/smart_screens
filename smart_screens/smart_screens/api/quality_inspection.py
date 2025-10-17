"""
Quality Inspection API - Complete Manufacturing Workflow
Handles Final Visual Inspection completion with proper job card and stock entry creation

Step-by-step flow:
1. Capture inspection data from frontend
2. Find related Sub Lot Process
3. Create SPP Inspection Entry
4. Find Work Order and Final Visual Inspection Job Card
5. Complete Job Card with time logs
6. Create manufacturing stock entries (good + rejected items)
7. Complete Work Order
"""

import frappe
from frappe import _
from frappe.utils import flt, nowdate, nowtime, get_datetime, add_to_date
from datetime import datetime, timedelta
import json


# =====================================================================
# MAIN API ENDPOINT - Called from Frontend
# =====================================================================

@frappe.whitelist()
def create_quality_inspection_workflow(inspection_entry_id):
    """
    Legacy method name for compatibility with existing frontend code
    This is an alias for complete_quality_inspection but takes inspection_entry_id instead
    """
    try:
        frappe.logger().info(f"🔄 Legacy API called with inspection_entry_id: {inspection_entry_id}")
        
        # Get the inspection entry document
        inspection_doc = frappe.get_doc("SPP Inspection Entry", inspection_entry_id)
        
        # ✅ FIXED: Use correct field names from SPP Inspection Entry DocType
        # Extract data from the inspection document
        data = {
            "lot_no": inspection_doc.get("lot_no") or inspection_doc.get("batch_no") or inspection_doc.get("scan_production_lot"),
            "inspector_id": inspection_doc.get("inspector_code"),
            "inspected_qty": inspection_doc.get("inspected_qty_nos") or inspection_doc.get("total_inspected_qty_nos") or 0,
            "rejected_qty": inspection_doc.get("total_rejected_qty") or 0,  # ✅ FIXED: Use total_rejected_qty instead of rejected_qty_nos
            "rejection_items": []
        }
        
        # Extract rejection items if available
        if hasattr(inspection_doc, 'items') and inspection_doc.items:
            for item in inspection_doc.items:
                if item.get("rejected_qty"):  # Check child table fields
                    data["rejection_items"].append({
                        "rejection_type": item.get("type_of_defect"),
                        "quantity": item.get("rejected_qty")
                    })
        
        frappe.logger().info(f"🔄 Converted to standard format: {data}")
        
        # Validate required data
        if not data.get("lot_no"):
            return {
                "status": "error",
                "message": "No lot number found in inspection entry"
            }
        
        if not data.get("inspector_id"):
            return {
                "status": "error",
                "message": "No inspector ID found in inspection entry"
            }
        
        # Call the main API with the converted data
        return complete_quality_inspection(data)
        
    except Exception as e:
        frappe.logger().error(f"❌ Error in legacy API: {str(e)}")
        import traceback
        frappe.logger().error(traceback.format_exc())
        return {
            "status": "error",
            "message": f"Failed to process inspection workflow: {str(e)}"
        }

@frappe.whitelist()
def complete_quality_inspection(data):
    """
    Main API endpoint called from frontend after quality inspection is done
    
    Frontend sends:
    {
        "lot_no": "P25D03Z07-3",
        "inspector_id": "EMP-0001",
        "inspected_qty": 100,
        "rejected_qty": 5,
        "rejection_items": [
            {"rejection_type": "Scratch", "quantity": 3},
            {"rejection_type": "Dent", "quantity": 2}
        ]
    }
    
    Returns:
    {
        "status": "success",
        "message": "Quality inspection completed successfully",
        "data": {
            "inspection_entry": "INSP-0001",
            "job_card": "JOB-0001",
            "stock_entries": ["STE-0001", "STE-0002"],
            "work_order": "MFG-WO-0001"
        }
    }
    """
    try:
        # Parse data if it's a JSON string
        if isinstance(data, str):
            data = json.loads(data)
        
        frappe.logger().info("="*80)
        frappe.logger().info("🔍 STEP 1: CAPTURING DATA FROM FRONTEND")
        frappe.logger().info("="*80)
        frappe.logger().info(f"📥 Received data: {json.dumps(data, indent=2)}")
        
        # Validate required fields
        required_fields = ["lot_no", "inspector_id", "inspected_qty"]
        for field in required_fields:
            if not data.get(field):
                return error_response(f"Missing required field: {field}")
        
        lot_no = data.get("lot_no")
        inspector_id = data.get("inspector_id")
        inspected_qty = flt(data.get("inspected_qty", 0))
        rejected_qty = flt(data.get("rejected_qty", 0))
        rejection_items = data.get("rejection_items", [])
        
        frappe.logger().info(f"✅ Data validated - Lot: {lot_no}, Inspector: {inspector_id}")
        frappe.logger().info(f"📊 Quantities - Inspected: {inspected_qty}, Rejected: {rejected_qty}")
        
        # =====================================================================
        # STEP 2: Find Related Sub Lot Process
        # =====================================================================
        frappe.logger().info("\n" + "="*80)
        frappe.logger().info("🔍 STEP 2: FINDING SUB LOT PROCESS")
        frappe.logger().info("="*80)
        
        sublot_process = find_sublot_process(lot_no)
        if not sublot_process:
            return error_response(f"No Sub Lot Process found for lot number: {lot_no}")
        
        frappe.logger().info(f"✅ Found Sub Lot Process: {sublot_process.get('name')}")
        frappe.logger().info(f"🏭 Work Order: {sublot_process.get('work_order')}")
        
        # =====================================================================
        # STEP 3: Create SPP Inspection Entry
        # =====================================================================
        frappe.logger().info("\n" + "="*80)
        frappe.logger().info("🔍 STEP 3: CREATING SPP INSPECTION ENTRY")
        frappe.logger().info("="*80)
        
        inspection_result = create_spp_inspection_entry(
            sublot_process=sublot_process,
            inspector_id=inspector_id,
            inspected_qty=inspected_qty,
            rejected_qty=rejected_qty,
            rejection_items=rejection_items
        )
        
        if inspection_result.get("status") != "success":
            return inspection_result
        
        inspection_entry_name = inspection_result.get("inspection_entry")
        frappe.logger().info(f"✅ Created Inspection Entry: {inspection_entry_name}")
        
        # =====================================================================
        # STEP 4: Find Work Order and Final Visual Inspection Job Card
        # =====================================================================
        frappe.logger().info("\n" + "="*80)
        frappe.logger().info("🔍 STEP 4: FINDING WORK ORDER AND JOB CARD")
        frappe.logger().info("="*80)
        
        work_order = sublot_process.get("work_order")
        if not work_order:
            return error_response("No Work Order linked to Sub Lot Process")
        
        job_card = find_final_inspection_job_card(work_order)
        if not job_card:
            return error_response(f"No Final Visual Inspection Job Card found for Work Order: {work_order}")
        
        frappe.logger().info(f"✅ Found Job Card: {job_card.get('name')} - Operation: {job_card.get('operation')}")
        
        # =====================================================================
        # STEP 5: Complete Job Card with Time Logs
        # =====================================================================
        frappe.logger().info("\n" + "="*80)
        frappe.logger().info("🔍 STEP 5: COMPLETING JOB CARD WITH TIME LOGS")
        frappe.logger().info("="*80)
        
        job_card_result = complete_final_inspection_job_card(
            job_card_name=job_card.get("name"),
            inspector_id=inspector_id,
            completed_qty=inspected_qty
        )
        
        if job_card_result.get("status") != "success":
            return job_card_result
        
        frappe.logger().info(f"✅ Job Card completed: {job_card.get('name')}")
        
        # =====================================================================
        # STEP 6: Create Manufacturing Stock Entries
        # =====================================================================
        frappe.logger().info("\n" + "="*80)
        frappe.logger().info("🔍 STEP 6: CREATING MANUFACTURING STOCK ENTRIES")
        frappe.logger().info("="*80)
        
        good_qty = inspected_qty - rejected_qty
        frappe.logger().info(f"📊 Good Quantity: {good_qty}, Rejected Quantity: {rejected_qty}")
        
        stock_entries_result = create_manufacturing_stock_entries(
            work_order=work_order,
            good_qty=good_qty,
            rejected_qty=rejected_qty,
            batch_no=sublot_process.get("barcode")
        )
        
        if stock_entries_result.get("status") != "success":
            return stock_entries_result
        
        stock_entries = stock_entries_result.get("stock_entries", [])
        frappe.logger().info(f"✅ Created {len(stock_entries)} stock entries: {stock_entries}")
        
        # =====================================================================
        # STEP 7: Complete Work Order
        # =====================================================================
        frappe.logger().info("\n" + "="*80)
        frappe.logger().info("🔍 STEP 7: COMPLETING WORK ORDER")
        frappe.logger().info("="*80)
        
        work_order_result = complete_work_order(work_order, inspected_qty)
        if work_order_result.get("status") != "success":
            frappe.logger().warning(f"⚠️ Work Order completion warning: {work_order_result.get('message')}")
        else:
            frappe.logger().info(f"✅ Work Order completed: {work_order}")
        
        # =====================================================================
        # SUCCESS - Return all created documents
        # =====================================================================
        frappe.logger().info("\n" + "="*80)
        frappe.logger().info("🎉 QUALITY INSPECTION WORKFLOW COMPLETED SUCCESSFULLY")
        frappe.logger().info("="*80)
        
        frappe.db.commit()
        
        return {
            "status": "success",
            "message": "Quality inspection completed successfully",
            "data": {
                "sublot_process": sublot_process.get("name"),
                "inspection_entry": inspection_entry_name,
                "job_card": job_card.get("name"),
                "stock_entries": stock_entries,
                "work_order": work_order,
                "good_qty": good_qty,
                "rejected_qty": rejected_qty
            }
        }
        
    except Exception as e:
        frappe.log_error(f"Quality Inspection Error: {str(e)}", "Quality Inspection Workflow")
        frappe.logger().error(f"❌ CRITICAL ERROR: {str(e)}")
        import traceback
        frappe.logger().error(traceback.format_exc())
        return error_response(f"System error: {str(e)}")


# =====================================================================
# STEP 2: FIND SUB LOT PROCESS
# =====================================================================

def find_sublot_process(lot_no):
    """
    Find Sub Lot Process by lot number
    Searches multiple fields: sub_lot_number, spp_batch_number, barcode
    Includes both Draft (0) and Submitted (1) documents
    """
    try:
        frappe.logger().info(f"🔍 Searching for Sub Lot Process with lot_no: {lot_no}")
        
        # Method 1: Search by sub_lot_number
        processes = frappe.db.get_list(
            "Sub Lot Process",
            filters={
                "sub_lot_number": lot_no,
                "docstatus": ["in", [0, 1]]
            },
            fields=["name", "work_order", "item_code", "sublot_qty", "barcode", "spp_batch_number", "warehouse"],
            order_by="creation desc",
            limit=1
        )
        
        if processes:
            frappe.logger().info(f"✅ Found by sub_lot_number: {processes[0].name}")
            return processes[0]
        
        # Method 2: Search by spp_batch_number
        processes = frappe.db.get_list(
            "Sub Lot Process",
            filters={
                "spp_batch_number": lot_no,
                "docstatus": ["in", [0, 1]]
            },
            fields=["name", "work_order", "item_code", "sublot_qty", "barcode", "spp_batch_number", "warehouse"],
            order_by="creation desc",
            limit=1
        )
        
        if processes:
            frappe.logger().info(f"✅ Found by spp_batch_number: {processes[0].name}")
            return processes[0]
        
        # Method 3: Search by barcode
        processes = frappe.db.get_list(
            "Sub Lot Process",
            filters={
                "barcode": lot_no,
                "docstatus": ["in", [0, 1]]
            },
            fields=["name", "work_order", "item_code", "sublot_qty", "barcode", "spp_batch_number", "warehouse"],
            order_by="creation desc",
            limit=1
        )
        
        if processes:
            frappe.logger().info(f"✅ Found by barcode: {processes[0].name}")
            return processes[0]
        
        frappe.logger().error(f"❌ No Sub Lot Process found for: {lot_no}")
        return None
        
    except Exception as e:
        frappe.logger().error(f"❌ Error finding Sub Lot Process: {str(e)}")
        return None


# =====================================================================
# STEP 3: CREATE SPP INSPECTION ENTRY
# =====================================================================

def create_spp_inspection_entry(sublot_process, inspector_id, inspected_qty, rejected_qty, rejection_items):
    """
    Create SPP Inspection Entry document
    Records inspection results including rejection details
    ✅ FIXED: Now calculates total_rejected_qty from child table items
    """
    try:
        frappe.logger().info("📝 Creating SPP Inspection Entry")
        
        # Get inspector details
        inspector_name = frappe.db.get_value("Employee", inspector_id, "employee_name")
        frappe.logger().info(f"👤 Inspector: {inspector_id} - {inspector_name}")
        
        # Create new inspection entry
        inspection_entry = frappe.new_doc("SPP Inspection Entry")
        
        # Basic information
        inspection_entry.posting_date = nowdate()
        inspection_entry.inspection_type = "Final Visual Inspection"
        
        # Source document references
        inspection_entry.source_document = "Sub Lot Process"
        inspection_entry.source_document_name = sublot_process.get("name")
        
        # Product information
        inspection_entry.product_ref_no = sublot_process.get("item_code")
        inspection_entry.batch_no = sublot_process.get("barcode")
        inspection_entry.lot_no = sublot_process.get("barcode")
        inspection_entry.scan_production_lot = sublot_process.get("barcode")
        
        # Warehouse
        inspection_entry.warehouse = sublot_process.get("warehouse")
        
        # Work Order reference
        if sublot_process.get("work_order"):
            inspection_entry.work_order = sublot_process.get("work_order")
        
        # Inspector information
        inspection_entry.inspector_code = inspector_id
        inspection_entry.inspector_name = inspector_name
        inspection_entry.scan_inspector = inspector_id
        
        # Quantity information
        inspection_entry.inspected_qty_nos = flt(inspected_qty)
        inspection_entry.total_inspected_qty_nos = flt(inspected_qty)
        inspection_entry.available_qty_nos = flt(inspected_qty)
        
        # ✅ CRITICAL FIX: Calculate total rejected qty from child table items
        total_rejected = 0.0
        if rejection_items:
            frappe.logger().info(f"📋 Adding {len(rejection_items)} rejection items")
            for item in rejection_items:
                rejection_qty = flt(item.get("quantity", 0))
                inspection_entry.append("items", {
                    "type_of_defect": item.get("rejection_type"),
                    "rejected_qty": rejection_qty,
                    "rejected_qty_kg": 0.0
                })
                total_rejected += rejection_qty
                frappe.logger().info(f"  - {item.get('rejection_type')}: {rejection_qty}")
        
        # ✅ Set rejection totals from calculated value (not frontend data)
        frappe.logger().info(f"📊 Total rejected qty calculated from child items: {total_rejected}")
        inspection_entry.rejected_qty_nos = total_rejected
        inspection_entry.total_rejected_qty = total_rejected
        inspection_entry.accepted_qty_nos = flt(inspected_qty) - total_rejected
        
        # Log the difference if frontend sent different value
        if flt(rejected_qty) != total_rejected:
            frappe.logger().warning(f"⚠️ Frontend rejected_qty ({rejected_qty}) differs from calculated total ({total_rejected})")
            frappe.logger().warning(f"✅ Using calculated value from child table: {total_rejected}")
        
        # Save and submit
        inspection_entry.insert()
        frappe.logger().info(f"💾 Inspection Entry saved: {inspection_entry.name}")
        
        inspection_entry.submit()
        frappe.logger().info(f"✅ Inspection Entry submitted: {inspection_entry.name}")
        frappe.logger().info(f"📊 Final values - Total Rejected: {inspection_entry.total_rejected_qty}, Accepted: {inspection_entry.accepted_qty_nos}")
        
        frappe.db.commit()
        
        return {
            "status": "success",
            "inspection_entry": inspection_entry.name
        }
        
    except Exception as e:
        frappe.logger().error(f"❌ Error creating inspection entry: {str(e)}")
        import traceback
        frappe.logger().error(traceback.format_exc())
        return {
            "status": "error",
            "message": f"Failed to create inspection entry: {str(e)}"
        }


# =====================================================================
# STEP 4: FIND FINAL VISUAL INSPECTION JOB CARD
# =====================================================================

def find_final_inspection_job_card(work_order):
    """
    Find the Final Visual Inspection job card for this work order
    ✅ FIXED: Search for both Draft (0) and Submitted (1) job cards
    """
    try:
        frappe.logger().info(f"🔍 Searching for Final Visual Inspection Job Card in WO: {work_order}")
        
        # ✅ FIXED: Search for both Draft (0) and Submitted (1) job cards
        job_cards = frappe.db.get_list(
            "Job Card",
            filters={
                "work_order": work_order,
                "docstatus": ["in", [0, 1]]  # ✅ Include both Draft and Submitted
            },
            fields=["name", "operation", "status", "total_completed_qty", "docstatus"],
            order_by="creation asc"
        )
        
        frappe.logger().info(f"📋 Found {len(job_cards)} job cards for work order")
        
        # Look for Final Visual Inspection operation
        for job_card in job_cards:
            operation = job_card.get("operation", "")
            operation_lower = operation.lower()
            docstatus_text = {0: "Draft", 1: "Submitted", 2: "Cancelled"}.get(job_card.docstatus, "Unknown")
            
            frappe.logger().info(f"  - {job_card.name}: '{job_card.operation}' ({job_card.status}, {docstatus_text})")
            
            # ✅ Match Final Visual Inspection operations that are not completed
            if job_card.status != "Completed" and (
                operation_lower in ["final visual inspection", "visual inspection"] or
                ("visual inspection" in operation_lower) or 
                ("final inspection" in operation_lower) or
                ("inspection" in operation_lower)
            ):
                frappe.logger().info(f"✅ Found Final Visual Inspection Job Card: {job_card.name}")
                return job_card
        
        # If no match found, log all available operations for debugging
        frappe.logger().error("❌ No Final Visual Inspection job card found")
        frappe.logger().error("Available operations:")
        for job_card in job_cards:
            frappe.logger().error(f"  - '{job_card.operation}' (Status: {job_card.status})")
        
        return None
        
    except Exception as e:
        frappe.logger().error(f"❌ Error finding job card: {str(e)}")
        return None


# =====================================================================
# STEP 5: COMPLETE JOB CARD WITH TIME LOGS
# =====================================================================

def complete_final_inspection_job_card(job_card_name, inspector_id, completed_qty):
    """
    Complete the Final Visual Inspection Job Card
    Adds time logs and sets status to Completed
    ✅ FIXED: Now submits the job card to make it official
    """
    try:
        frappe.logger().info(f"🔧 Completing Job Card: {job_card_name}")
        
        # Get the job card document
        job_card = frappe.get_doc("Job Card", job_card_name)
        frappe.logger().info(f"📋 Job Card - Operation: {job_card.operation}, Status: {job_card.status}, DocStatus: {job_card.docstatus}")
        
        if job_card.status == "Completed" and job_card.docstatus == 1:
            frappe.logger().info("ℹ️ Job Card already completed and submitted")
            return {
                "status": "success",
                "message": "Job Card already completed",
                "job_card": job_card_name
            }
        
        # Clear existing time logs
        job_card.time_logs = []
        
        # Create time log - 5 minutes for inspection
        from_time = get_datetime(nowdate() + " " + nowtime())
        to_time = add_to_date(from_time, minutes=5)
        
        frappe.logger().info(f"⏰ Adding time log: {from_time} to {to_time}")
        
        job_card.append("time_logs", {
            "from_time": from_time,
            "to_time": to_time,
            "time_in_mins": 5.0,
            "completed_qty": flt(completed_qty),
            "employee": inspector_id
        })
        
        # Update job card fields
        job_card.total_completed_qty = flt(completed_qty)
        job_card.status = "Completed"
        
        # Set actual dates
        if not job_card.actual_start_date:
            job_card.actual_start_date = nowdate()
        if not job_card.actual_end_date:
            job_card.actual_end_date = nowdate()
        
        # ✅ CRITICAL FIX: Submit the job card if it's in Draft
        if job_card.docstatus == 0:
            # Save first
            job_card.save()
            frappe.logger().info(f"💾 Job Card saved with time logs")
            
            # Then submit to make it official (docstatus: 0 -> 1)
            job_card.submit()
            frappe.logger().info(f"📤 Job Card submitted (docstatus changed to 1)")
        else:
            # Already submitted, just save the changes
            job_card.save()
            frappe.logger().info(f"💾 Job Card updated and saved")
        
        frappe.db.commit()
        frappe.logger().info(f"✅ Job Card completed successfully")
        
        return {
            "status": "success",
            "message": "Job Card completed successfully",
            "job_card": job_card_name
        }
        
    except Exception as e:
        frappe.logger().error(f"❌ Error completing job card: {str(e)}")
        import traceback
        frappe.logger().error(traceback.format_exc())
        return {
            "status": "error",
            "message": f"Failed to complete job card: {str(e)}"
        }


# =====================================================================
# STEP 6: CREATE MANUFACTURING STOCK ENTRIES
# =====================================================================

def create_manufacturing_stock_entries(work_order, good_qty, rejected_qty, batch_no):
    """
    Create manufacturing stock entries using the proven utility function
    Creates both material transfer and manufacture entries
    Handles good and rejected quantities separately
    
    ✅ FIXED: Now reads rejection quantity from the latest SPP Inspection Entry
    """
    try:
        frappe.logger().info(f"📦 Creating stock entries for Work Order: {work_order}")
        frappe.logger().info(f"📊 Good Qty: {good_qty}, Rejected Qty (from frontend): {rejected_qty}, Batch: {batch_no}")
        
        # ✅ NEW: Fetch the latest SPP Inspection Entry for this work order/batch
        # to get the accurate rejection quantity from the document
        actual_rejected_qty = rejected_qty  # Default to frontend value
        
        try:
            # Try to find the SPP Inspection Entry we just created
            inspection_entries = frappe.db.get_list(
                "SPP Inspection Entry",
                filters={
                    "batch_no": batch_no,
                    "docstatus": 1  # Only submitted entries
                },
                fields=["name", "total_rejected_qty", "rejected_qty_nos"],
                order_by="creation desc",
                limit=1
            )
            
            if inspection_entries:
                inspection_entry = inspection_entries[0]
                # Use total_rejected_qty field (primary) or fall back to rejected_qty_nos
                actual_rejected_qty = flt(inspection_entry.get("total_rejected_qty") or inspection_entry.get("rejected_qty_nos") or 0)
                
                frappe.logger().info(f"✅ Found SPP Inspection Entry: {inspection_entry.get('name')}")
                frappe.logger().info(f"📊 Rejection Qty from Inspection Entry: {actual_rejected_qty}")
                
                # If rejection quantity is 0 in the inspection entry but frontend sent a value, use frontend
                if actual_rejected_qty == 0 and rejected_qty > 0:
                    frappe.logger().warning(f"⚠️ Inspection Entry has 0 rejected qty, using frontend value: {rejected_qty}")
                    actual_rejected_qty = rejected_qty
            else:
                frappe.logger().warning(f"⚠️ No SPP Inspection Entry found for batch {batch_no}, using frontend rejection qty: {rejected_qty}")
        
        except Exception as fetch_error:
            frappe.logger().error(f"❌ Error fetching rejection qty from Inspection Entry: {str(fetch_error)}")
            frappe.logger().warning(f"⚠️ Falling back to frontend rejection qty: {rejected_qty}")
            actual_rejected_qty = rejected_qty
        
        frappe.logger().info(f"📦 Final Rejection Qty to use in stock entry: {actual_rejected_qty}")
        
        # Use the proven utility function from resource_job_card
        from smart_screens.smart_screens.utils.resource_job_card import complete_work_order_with_stock_entries
        
        complete_work_order_with_stock_entries(
            work_order_id=work_order,
            rejected_qty=actual_rejected_qty,  # ✅ Use the actual value from inspection entry
            batch_no=batch_no
        )
        
        # Get the created stock entries
        stock_entries = frappe.db.get_list(
            "Stock Entry",
            filters={
                "work_order": work_order,
                "creation": [">=", add_to_date(None, hours=-1)]
            },
            fields=["name", "purpose", "docstatus"],
            order_by="creation desc"
        )
        
        entry_names = [entry.name for entry in stock_entries]
        frappe.logger().info(f"✅ Created stock entries: {entry_names}")
        
        frappe.db.commit()
        
        return {
            "status": "success",
            "stock_entries": entry_names
        }
        
    except Exception as e:
        frappe.logger().error(f"❌ Error creating stock entries: {str(e)}")
        import traceback
        frappe.logger().error(traceback.format_exc())
        return {
            "status": "error",
            "message": f"Failed to create stock entries: {str(e)}"
        }


# =====================================================================
# STEP 7: COMPLETE WORK ORDER
# =====================================================================

def complete_work_order(work_order, completed_qty):
    """
    Mark the work order as completed
    This happens automatically via stock entries, but we verify it here
    """
    try:
        frappe.logger().info(f"🏭 Verifying Work Order completion: {work_order}")
        
        work_order_doc = frappe.get_doc("Work Order", work_order)
        work_order_doc.reload()
        
        frappe.logger().info(f"📊 Work Order Status: {work_order_doc.status}")
        
        if work_order_doc.status == "Completed":
            frappe.logger().info("✅ Work Order already completed")
            return {
                "status": "success",
                "message": "Work Order already completed"
            }
        
        # Update status if not completed
        work_order_doc.db_set("status", "Completed")
        work_order_doc.db_set("produced_qty", completed_qty)
        
        frappe.db.commit()
        frappe.logger().info(f"✅ Work Order marked as completed")
        
        return {
            "status": "success",
            "message": "Work Order completed"
        }
        
    except Exception as e:
        frappe.logger().error(f"⚠️ Error completing work order: {str(e)}")
        return {
            "status": "warning",
            "message": f"Work Order may not be completed: {str(e)}"
        }


# =====================================================================
# HELPER FUNCTIONS
# =====================================================================

def error_response(message):
    """Create standardized error response"""
    frappe.logger().error(f"❌ ERROR: {message}")
    return {
        "status": "error",
        "message": message
    }


# =====================================================================
# DEBUG API - For investigating job card issues
# =====================================================================

@frappe.whitelist()
def debug_job_cards_for_work_order(work_order):
    """
    Debug function to investigate what job cards exist for a work order
    """
    try:
        frappe.logger().info(f"🔍 DEBUGGING JOB CARDS FOR WORK ORDER: {work_order}")
        
        # Get all job cards for this work order (including all docstatus)
        job_cards = frappe.db.get_list(
            "Job Card",
            filters={
                "work_order": work_order
            },
            fields=["name", "operation", "status", "docstatus", "total_completed_qty", "creation"],
            order_by="creation asc"
        )
        
        frappe.logger().info(f"📋 Found {len(job_cards)} job cards total")
        
        debug_info = {
            "work_order": work_order,
            "total_job_cards": len(job_cards),
            "all_job_cards": [],
            "submitted_job_cards": [],
            "matching_job_cards": []
        }
        
        for jc in job_cards:
            docstatus_text = {0: "Draft", 1: "Submitted", 2: "Cancelled"}.get(jc.docstatus, "Unknown")
            job_card_info = {
                "name": jc.name,
                "operation": jc.operation,
                "status": jc.status,
                "docstatus": jc.docstatus,
                "docstatus_text": docstatus_text,
                "completed_qty": jc.total_completed_qty,
                "creation": str(jc.creation)
            }
            debug_info["all_job_cards"].append(job_card_info)
            
            frappe.logger().info(f"  - {jc.name}: '{jc.operation}' ({jc.status}, {docstatus_text})")
            
            # Check if submitted
            if jc.docstatus == 1:
                debug_info["submitted_job_cards"].append(job_card_info)
                
                # Test our matching logic
                operation_lower = jc.operation.lower()
                matches = (
                    operation_lower in ["final visual inspection", "visual inspection"] or
                    ("visual inspection" in operation_lower) or 
                    ("final inspection" in operation_lower) or
                    ("inspection" in operation_lower and jc.status != "Completed")
                )
                
                job_card_info["operation_lower"] = operation_lower
                job_card_info["matches_search"] = matches
                
                if matches:
                    debug_info["matching_job_cards"].append(job_card_info)
                    frappe.logger().info(f"    ✅ MATCHES our search logic!")
                else:
                    frappe.logger().info(f"    ❌ Does NOT match our search logic")
        
        # Also check the work order itself
        try:
            work_order_doc = frappe.get_doc("Work Order", work_order)
            debug_info["work_order_status"] = work_order_doc.status
            debug_info["work_order_operations"] = []
            
            frappe.logger().info(f"🏭 Work Order Status: {work_order_doc.status}")
            frappe.logger().info(f"📊 Work Order Operations:")
            
            for op in work_order_doc.operations:
                op_info = {
                    "operation": op.operation,
                    "completed_qty": op.completed_qty if hasattr(op, 'completed_qty') else 0
                }
                debug_info["work_order_operations"].append(op_info)
                frappe.logger().info(f"  - {op.operation} (Completed Qty: {op_info['completed_qty']})")
                
        except Exception as wo_error:
            frappe.logger().error(f"❌ Error getting work order details: {str(wo_error)}")
            debug_info["work_order_error"] = str(wo_error)
        
        return {
            "status": "success",
            "data": debug_info
        }
        
    except Exception as e:
        frappe.logger().error(f"❌ Debug Error: {str(e)}")
        import traceback
        frappe.logger().error(traceback.format_exc())
        return {
            "status": "error",
            "message": str(e)
        }

# =====================================================================
# STATUS CHECK API - For debugging and monitoring
# =====================================================================

@frappe.whitelist()
def check_inspection_workflow_status(lot_no):
    """
    Check if the manufacturing workflow is ready to be completed for this lot
    This is the method called by the frontend - it's an alias for check_workflow_status
    """
    return check_workflow_status(lot_no)

@frappe.whitelist()
def check_workflow_status(lot_no):
    """
    Check the current status of the manufacturing workflow for a lot
    Useful for debugging and showing status to users
    """
    try:
        frappe.logger().info(f"🔍 Checking workflow status for lot: {lot_no}")
        
        # Find Sub Lot Process
        sublot_process = find_sublot_process(lot_no)
        if not sublot_process:
            return {
                "status": "error",
                "message": f"No Sub Lot Process found for: {lot_no}"
            }
        
        work_order = sublot_process.get("work_order")
        if not work_order:
            return {
                "status": "error",
                "message": "No Work Order found in Sub Lot Process"
            }
        
        # Get Work Order status
        work_order_doc = frappe.get_doc("Work Order", work_order)
        
        # Get Job Cards
        job_cards = frappe.db.get_list(
            "Job Card",
            filters={"work_order": work_order, "docstatus": 1},
            fields=["name", "operation", "status", "total_completed_qty"]
        )
        
        # Get Stock Entries
        stock_entries = frappe.db.get_list(
            "Stock Entry",
            filters={"work_order": work_order, "docstatus": 1},
            fields=["name", "purpose"]
        )
        
        # ✅ FIXED: Get Inspection Entries by lot_no instead of work_order
        # SPP Inspection Entry doesn't have work_order field, so search by lot identifiers
        inspection_entries = []
        try:
            # Search by lot_no field
            inspection_entries.extend(frappe.db.get_list(
                "SPP Inspection Entry",
                filters={"lot_no": lot_no, "docstatus": 1},
                fields=["name", "inspected_qty_nos", "rejected_qty_nos"]
            ))
            
            # Also search by batch_no field as backup
            if not inspection_entries:
                batch_identifiers = [
                    sublot_process.get("barcode"),
                    sublot_process.get("spp_batch_number"),
                    lot_no
                ]
                
                for batch_id in batch_identifiers:
                    if batch_id:
                        entries = frappe.db.get_list(
                            "SPP Inspection Entry",
                            filters={"batch_no": batch_id, "docstatus": 1},
                            fields=["name", "inspected_qty_nos", "rejected_qty_nos"]
                        )
                        inspection_entries.extend(entries)
                        if entries:
                            break
            
            # Also search by source_document_name (Sub Lot Process reference)
            if not inspection_entries:
                inspection_entries.extend(frappe.db.get_list(
                    "SPP Inspection Entry",
                    filters={"source_document_name": sublot_process.get("name"), "docstatus": 1},
                    fields=["name", "inspected_qty_nos", "rejected_qty_nos"]
                ))
                
        except Exception as ie_error:
            frappe.logger().error(f"❌ Error getting inspection entries: {str(ie_error)}")
            inspection_entries = []
        
        return {
            "status": "success",
            "data": {
                "sublot_process": sublot_process.get("name"),
                "work_order": work_order,
                "work_order_status": work_order_doc.status,
                "job_cards": [
                    {
                        "name": jc.name,
                        "operation": jc.operation,
                        "status": jc.status,
                        "completed_qty": jc.total_completed_qty
                    } for jc in job_cards
                ],
                "stock_entries": [
                    {
                        "name": se.name,
                        "purpose": se.purpose
                    } for se in stock_entries
                ],
                "inspection_entries": [
                    {
                        "name": ie.name,
                        "inspected_qty": ie.inspected_qty_nos,
                        "rejected_qty": ie.rejected_qty_nos
                    } for ie in inspection_entries
                ]
            }
        }
        
    except Exception as e:
        frappe.logger().error(f"❌ Error checking workflow status: {str(e)}")
        import traceback
        frappe.logger().error(traceback.format_exc())
        return {
            "status": "error",
            "message": str(e)
        }