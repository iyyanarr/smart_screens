"""
Process Center API - Backend support for unified Sub-Lot Process workflows
Provides bridge functionality between comprehensive and individual page approaches
WITHOUT modifying existing code
"""

import frappe
from frappe import _
from datetime import datetime, timedelta
import json

@frappe.whitelist()
def get_process_dashboard_stats():
    """Get dashboard statistics for today's processes"""
    try:
        today = frappe.utils.today()
        
        # Get comprehensive processes (Sub Lot Process documents)
        comprehensive_processes = frappe.db.count("Sub Lot Process", {
            "creation": [">=", today + " 00:00:00"],
            "docstatus": 1
        })
        
        # Get individual sublot entries
        sublot_entries = frappe.db.count("Sub Lot Entry", {
            "creation": [">=", today + " 00:00:00"],
            "docstatus": 1
        })
        
        # Get resource tags
        resource_tags = frappe.db.count("SPP Lot Resource Tagging", {
            "creation": [">=", today + " 00:00:00"],
            "docstatus": 1
        })
        
        # Get inspection entries
        inspection_entries = frappe.db.count("SPP Inspection Entry", {
            "creation": [">=", today + " 00:00:00"],
            "docstatus": 1
        })
        
        return {
            "comprehensive_processes": comprehensive_processes,
            "sublot_entries": sublot_entries,
            "resource_tags": resource_tags,
            "inspection_entries": inspection_entries
        }
        
    except Exception as e:
        frappe.log_error(f"Error getting dashboard stats: {str(e)}")
        return {
            "comprehensive_processes": 0,
            "sublot_entries": 0,
            "resource_tags": 0,
            "inspection_entries": 0
        }

@frappe.whitelist()
def lookup_process(search_term):
    """Lookup processes by batch number, sub-lot number, or process ID"""
    if not search_term:
        return []
    
    results = []
    search_term = search_term.strip()
    
    try:
        # Search in Sub Lot Process documents
        sublot_processes = frappe.db.sql("""
            SELECT name, spp_batch_number, sub_lot_number, docstatus, creation, modified
            FROM `tabSub Lot Process`
            WHERE spp_batch_number LIKE %s 
               OR sub_lot_number LIKE %s 
               OR name LIKE %s
               OR barcode LIKE %s
            ORDER BY creation DESC
            LIMIT 10
        """, [f"%{search_term}%", f"%{search_term}%", f"%{search_term}%", f"%{search_term}%"], as_dict=True)
        
        for doc in sublot_processes:
            results.append({
                "id": doc.name,
                "type": "Sub Lot Process",
                "doctype": "Sub Lot Process",
                "route": "sub-lot-process",
                "batch_info": f"{doc.spp_batch_number} → {doc.sub_lot_number}",
                "status": "Submitted" if doc.docstatus == 1 else "Draft",
                "created": doc.creation
            })
        
        # Search in Sub Lot Entry documents
        sublot_entries = frappe.db.sql("""
            SELECT name, sublot_number, sslnscaned_sub_lot_number, sublot_batch, docstatus, creation
            FROM `tabSub Lot Entry`
            WHERE sublot_number LIKE %s 
               OR sslnscaned_sub_lot_number LIKE %s 
               OR sublot_batch LIKE %s
               OR name LIKE %s
            ORDER BY creation DESC
            LIMIT 10
        """, [f"%{search_term}%", f"%{search_term}%", f"%{search_term}%", f"%{search_term}%"], as_dict=True)
        
        for doc in sublot_entries:
            results.append({
                "id": doc.name,
                "type": "Sub Lot Entry",
                "doctype": "Sub Lot Entry",
                "route": "sub-lot-entry",
                "batch_info": f"{doc.sslnscaned_sub_lot_number} → {doc.sublot_number}",
                "status": "Submitted" if doc.docstatus == 1 else "Draft",
                "created": doc.creation
            })
        
        # Search in SPP Lot Resource Tagging
        resource_tags = frappe.db.sql("""
            SELECT name, lot_number, operation, operator_id, operator_name, docstatus, creation
            FROM `tabSPP Lot Resource Tagging`
            WHERE lot_number LIKE %s 
               OR operator_id LIKE %s
               OR name LIKE %s
            ORDER BY creation DESC
            LIMIT 10
        """, [f"%{search_term}%", f"%{search_term}%", f"%{search_term}%"], as_dict=True)
        
        for doc in resource_tags:
            results.append({
                "id": doc.name,
                "type": "SPP Lot Resource Tagging",
                "doctype": "SPP Lot Resource Tagging",
                "route": "spp-lot-resource-tagging",
                "batch_info": f"{doc.lot_number} - {doc.operation} ({doc.operator_name})",
                "status": "Submitted" if doc.docstatus == 1 else "Draft",
                "created": doc.creation
            })
        
        # Search in SPP Inspection Entry
        inspection_entries = frappe.db.sql("""
            SELECT name, lot_no, inspector_name, inspection_type, docstatus, creation
            FROM `tabSPP Inspection Entry`
            WHERE lot_no LIKE %s 
               OR inspector_code LIKE %s
               OR name LIKE %s
            ORDER BY creation DESC
            LIMIT 10
        """, [f"%{search_term}%", f"%{search_term}%", f"%{search_term}%"], as_dict=True)
        
        for doc in inspection_entries:
            results.append({
                "id": doc.name,
                "type": "SPP Inspection Entry",
                "doctype": "SPP Inspection Entry",
                "route": "spp-inspection-entry",
                "batch_info": f"{doc.lot_no} - {doc.inspection_type} ({doc.inspector_name})",
                "status": "Submitted" if doc.docstatus == 1 else "Draft",
                "created": doc.creation
            })
        
        # Sort by creation date descending
        results.sort(key=lambda x: x["created"], reverse=True)
        
        return results[:20]  # Return top 20 results
        
    except Exception as e:
        frappe.log_error(f"Error in lookup_process: {str(e)}")
        return []

@frappe.whitelist()
def get_recent_processes():
    """Get recent processes from all types"""
    try:
        results = []
        
        # Last 7 days
        from_date = frappe.utils.add_days(frappe.utils.today(), -7)
        
        # Get Sub Lot Processes
        sublot_processes = frappe.db.sql("""
            SELECT name, spp_batch_number, sub_lot_number, docstatus, creation
            FROM `tabSub Lot Process`
            WHERE creation >= %s
            ORDER BY creation DESC
            LIMIT 5
        """, [from_date], as_dict=True)
        
        for doc in sublot_processes:
            results.append({
                "id": doc.name,
                "type": "Sub Lot Process",
                "doctype": "Sub Lot Process",
                "route": "sub-lot-process",
                "batch_info": f"{doc.spp_batch_number} → {doc.sub_lot_number}",
                "status": "Submitted" if doc.docstatus == 1 else "Draft",
                "created": doc.creation
            })
        
        # Get Sub Lot Entries
        sublot_entries = frappe.db.sql("""
            SELECT name, sublot_number, sslnscaned_sub_lot_number, docstatus, creation
            FROM `tabSub Lot Entry`
            WHERE creation >= %s
            ORDER BY creation DESC
            LIMIT 5
        """, [from_date], as_dict=True)
        
        for doc in sublot_entries:
            results.append({
                "id": doc.name,
                "type": "Sub Lot Entry",
                "doctype": "Sub Lot Entry",
                "route": "sub-lot-entry",
                "batch_info": f"{doc.sslnscaned_sub_lot_number} → {doc.sublot_number}",
                "status": "Submitted" if doc.docstatus == 1 else "Draft",
                "created": doc.creation
            })
        
        # Sort by creation date descending
        results.sort(key=lambda x: x["created"], reverse=True)
        
        return results[:10]  # Return top 10 results
        
    except Exception as e:
        frappe.log_error(f"Error in get_recent_processes: {str(e)}")
        return []

@frappe.whitelist()
def bridge_individual_processes(sublot_entry, resource_tag=None, inspection_entry=None):
    """
    Bridge individual process documents by creating a comprehensive Sub Lot Process
    This connects documents created via individual pages into a unified workflow
    """
    try:
        if not sublot_entry:
            return {"status": "error", "message": "Sub Lot Entry is required"}
        
        # Get the Sub Lot Entry document
        sublot_doc = frappe.get_doc("Sub Lot Entry", sublot_entry)
        if not sublot_doc:
            return {"status": "error", "message": "Sub Lot Entry not found"}
        
        # Check if already bridged
        existing_process = frappe.db.exists("Sub Lot Process", {
            "sub_lot_number": sublot_doc.sublot_number,
            "barcode": sublot_doc.barcode
        })
        
        if existing_process:
            return {
                "status": "warning", 
                "message": f"Sub Lot Process already exists: {existing_process}",
                "sublot_process": existing_process
            }
        
        # Create Sub Lot Process document
        sublot_process_doc = frappe.new_doc("Sub Lot Process")
        
        # Map basic fields from Sub Lot Entry
        sublot_process_doc.spp_batch_number = sublot_doc.sslnscaned_sub_lot_number
        sublot_process_doc.sub_lot_number = sublot_doc.sublot_number
        sublot_process_doc.barcode = sublot_doc.barcode or sublot_doc.sublot_batch
        sublot_process_doc.item_code = sublot_doc.item_code
        sublot_process_doc.warehouse = sublot_doc.warehouse or sublot_doc.source_warehouse
        sublot_process_doc.batch_no = sublot_doc.batch
        sublot_process_doc.sublot_qty = sublot_doc.sublot_qty
        sublot_process_doc.inspection_quantity = sublot_doc.sublot_qty
        
        # Add operations from resource tagging if provided
        if resource_tag:
            resource_doc = frappe.get_doc("SPP Lot Resource Tagging", resource_tag)
            if resource_doc:
                sublot_process_doc.append("operations", {
                    "operation": resource_doc.operation,
                    "employee_code": resource_doc.operator_id,
                    "employee_name": resource_doc.operator_name
                })
                
                # Set inspector from resource tag if it's an inspection operation
                if "inspection" in resource_doc.operation.lower():
                    sublot_process_doc.inspector_code = resource_doc.operator_id
                    sublot_process_doc.inspector_name = resource_doc.operator_name
        
        # Add inspection details if provided
        if inspection_entry:
            inspection_doc = frappe.get_doc("SPP Inspection Entry", inspection_entry)
            if inspection_doc:
                sublot_process_doc.inspector_code = inspection_doc.inspector_code
                sublot_process_doc.inspector_name = inspection_doc.inspector_name
                sublot_process_doc.inspection_quantity = inspection_doc.inspected_qty_nos
                
                # Add rejection items
                if hasattr(inspection_doc, 'items') and inspection_doc.items:
                    for item in inspection_doc.items:
                        sublot_process_doc.append("rejection_items", {
                            "rejection_type": item.type_of_defect,
                            "quantity": item.rejected_qty
                        })
        
        # Set default inspector if not set
        if not sublot_process_doc.inspector_code:
            sublot_process_doc.inspector_code = frappe.session.user
            sublot_process_doc.inspector_name = frappe.db.get_value("User", frappe.session.user, "full_name")
        
        # Add location info (default from user settings)
        sublot_process_doc.append("st_reference_docs", {
            "transaction_type": "Material Transfer",
            "source_warehouse": sublot_doc.source_warehouse or sublot_doc.warehouse,
            "target_warehouse": sublot_doc.target_warehouse or sublot_doc.warehouse,
            "stage": "Bridged Process",
            "role": "System Bridge",
            "location": "Process Center"
        })
        
        # Save and submit the document
        sublot_process_doc.insert()
        sublot_process_doc.submit()
        
        # Try to find or create work order
        work_order = None
        try:
            # Check if work order already exists for this item/batch
            existing_wo = frappe.db.exists("Work Order", {
                "production_item": sublot_doc.item_code,
                "docstatus": ["!=", 2]  # Not cancelled
            })
            
            if existing_wo:
                work_order = existing_wo
            else:
                # Create work order if BOM exists
                bom = frappe.db.get_value("BOM", {
                    "item": sublot_doc.item_code,
                    "is_active": 1,
                    "is_default": 1
                })
                
                if bom:
                    from smart_screens.smart_screens.utils.generate_work_order import create_work_order_after_sublot
                    work_order_result = create_work_order_after_sublot(sublot_process_doc)
                    if work_order_result and work_order_result.get("status") == "success":
                        work_order = work_order_result.get("work_order")
                        
                        # Update the sub lot process with work order reference
                        frappe.db.set_value("Sub Lot Process", sublot_process_doc.name, "work_order", work_order)
        except Exception as wo_error:
            frappe.log_error(f"Work Order creation failed in bridge: {str(wo_error)}")
            # Continue without work order
        
        return {
            "status": "success",
            "message": "Processes bridged successfully",
            "sublot_process": sublot_process_doc.name,
            "work_order": work_order
        }
        
    except Exception as e:
        frappe.log_error(f"Error in bridge_individual_processes: {str(e)}")
        return {"status": "error", "message": str(e)}

@frappe.whitelist()
def get_process_navigation_data(process_id, process_type):
    """Get navigation data for moving between related processes"""
    try:
        navigation_data = {
            "current": {"id": process_id, "type": process_type},
            "related": [],
            "next_steps": []
        }
        
        if process_type == "Sub Lot Entry":
            doc = frappe.get_doc("Sub Lot Entry", process_id)
            
            # Find related resource tagging
            resource_tags = frappe.db.get_list("SPP Lot Resource Tagging", 
                filters={"lot_number": doc.sublot_number},
                fields=["name", "operation", "operator_name"]
            )
            
            for tag in resource_tags:
                navigation_data["related"].append({
                    "type": "SPP Lot Resource Tagging",
                    "id": tag.name,
                    "title": f"Resource: {tag.operation} ({tag.operator_name})"
                })
            
            # Find related inspection
            inspections = frappe.db.get_list("SPP Inspection Entry",
                filters={"lot_no": doc.sublot_number},
                fields=["name", "inspection_type", "inspector_name"]
            )
            
            for insp in inspections:
                navigation_data["related"].append({
                    "type": "SPP Inspection Entry", 
                    "id": insp.name,
                    "title": f"Inspection: {insp.inspection_type} ({insp.inspector_name})"
                })
            
            # Suggest next steps
            if not resource_tags:
                navigation_data["next_steps"].append({
                    "action": "resource_tagging",
                    "title": "Add Resource Tagging",
                    "url": "/app/resource-tagging"
                })
            
            if not inspections:
                navigation_data["next_steps"].append({
                    "action": "quality_inspection",
                    "title": "Add Quality Inspection", 
                    "url": "/app/quality-inspection-entry"
                })
        
        return navigation_data
        
    except Exception as e:
        frappe.log_error(f"Error in get_process_navigation_data: {str(e)}")
        return {"current": {"id": process_id, "type": process_type}, "related": [], "next_steps": []}

@frappe.whitelist()
def get_workflow_recommendations(search_term):
    """Get workflow recommendations based on current context"""
    try:
        recommendations = []
        
        # Check what processes exist for this batch/sub-lot
        if search_term:
            # Check for existing sub-lot entry
            sublot_entries = frappe.db.get_list("Sub Lot Entry",
                filters=[
                    ["sublot_number", "like", f"%{search_term}%"],
                    ["docstatus", "=", 1]
                ],
                fields=["name", "sublot_number"],
                limit=1
            )
            
            if sublot_entries:
                sublot_entry = sublot_entries[0]
                
                # Check what's missing
                resource_tags = frappe.db.count("SPP Lot Resource Tagging", {
                    "lot_number": sublot_entry.sublot_number,
                    "docstatus": 1
                })
                
                inspections = frappe.db.count("SPP Inspection Entry", {
                    "lot_no": sublot_entry.sublot_number,
                    "docstatus": 1
                })
                
                if resource_tags == 0:
                    recommendations.append({
                        "type": "missing_step",
                        "title": "Resource Tagging Missing",
                        "description": f"Sub-lot {sublot_entry.sublot_number} needs resource tagging",
                        "action": "resource_tagging",
                        "priority": "high"
                    })
                
                if inspections == 0:
                    recommendations.append({
                        "type": "missing_step", 
                        "title": "Quality Inspection Missing",
                        "description": f"Sub-lot {sublot_entry.sublot_number} needs quality inspection",
                        "action": "quality_inspection",
                        "priority": "high"
                    })
                
                if resource_tags > 0 and inspections > 0:
                    # Check if bridged
                    bridged = frappe.db.exists("Sub Lot Process", {
                        "sub_lot_number": sublot_entry.sublot_number
                    })
                    
                    if not bridged:
                        recommendations.append({
                            "type": "bridge_opportunity",
                            "title": "Ready for Bridging",
                            "description": f"Sub-lot {sublot_entry.sublot_number} has all steps completed and can be bridged",
                            "action": "bridge_processes",
                            "priority": "medium"
                        })
        
        return recommendations
        
    except Exception as e:
        frappe.log_error(f"Error in get_workflow_recommendations: {str(e)}")
        return []