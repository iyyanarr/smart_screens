import frappe
from frappe import _
from frappe.utils import now

@frappe.whitelist()
def create_mixing_log(scan_lot_number):
    """Create a new mixing log entry based on scanned lot number"""
    try:
        # Create new Mixing Log document
        mixing_log = frappe.new_doc("Mixing Log")
        mixing_log.scan_lot_number = scan_lot_number
        
        # The before_insert method in the DocType will auto-populate other fields
        mixing_log.insert(ignore_permissions=True)
        
        return {
            "success": True,
            "data": {
                "name": mixing_log.name,
                "scan_lot_number": mixing_log.scan_lot_number,
                "batch_number": mixing_log.batch_number,
                "item_code": mixing_log.item_code,
                "item_name": mixing_log.item_name,
                "log_datetime": mixing_log.log_datetime
            }
        }
        
    except Exception as e:
        frappe.log_error(f"Error creating mixing log: {str(e)}")
        return {
            "success": False,
            "error": str(e)
        }

@frappe.whitelist()
def get_recent_logs(limit=10):
    """Get recent mixing log entries"""
    try:
        logs = frappe.get_all(
            "Mixing Log",
            fields=[
                "name",
                "scan_lot_number",
                "batch_number",
                "item_code",
                "item_name",
                "log_datetime"
            ],
            order_by="log_datetime desc",
            limit=limit
        )
        
        return logs
        
    except Exception as e:
        frappe.log_error(f"Error fetching recent logs: {str(e)}")
        return []