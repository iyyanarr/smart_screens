import frappe
from frappe import _
from frappe.utils import now

@frappe.whitelist()
def process_batch_scan(scan_lot_number):
    """Process batch scan - get batch details and create mixing log entry"""
    try:
        # First, check if this lot number has already been scanned
        existing_log = frappe.db.exists("Mixing Log", {"scan_lot_number": scan_lot_number})
        
        if existing_log:
            # Get the existing log details to show to user
            existing_data = frappe.get_doc("Mixing Log", existing_log)
            return {
                "success": False,
                "error": f"Lot number '{scan_lot_number}' has already been scanned on {frappe.utils.format_datetime(existing_data.log_datetime)}",
                "duplicate": True,
                "existing_data": {
                    "name": existing_data.name,
                    "scan_lot_number": existing_data.scan_lot_number,
                    "batch_number": existing_data.batch_number,
                    "item_code": existing_data.item_code,
                    "item_name": existing_data.item_name,
                    "item_group": existing_data.item_group,
                    "log_datetime": existing_data.log_datetime
                }
            }
        
        # Get batch details from Stock Entry based on mix_barcode
        batch_details = get_batch_details_from_stock_entry(scan_lot_number)
        
        if not batch_details:
            return {
                "success": False,
                "error": f"No batch found for scanned lot number: {scan_lot_number}"
            }
        
        # Create new Mixing Log document
        mixing_log = frappe.new_doc("Mixing Log")
        mixing_log.scan_lot_number = scan_lot_number
        mixing_log.batch_number = batch_details.get('batch_no')
        mixing_log.item_code = batch_details.get('item_code')
        mixing_log.item_name = batch_details.get('item_name')
        mixing_log.item_group = batch_details.get('item_group')
        mixing_log.log_datetime = now()
        
        # Insert the document
        mixing_log.insert(ignore_permissions=True)
        
        return {
            "success": True,
            "data": {
                "name": mixing_log.name,
                "scan_lot_number": mixing_log.scan_lot_number,
                "batch_number": mixing_log.batch_number,
                "item_code": mixing_log.item_code,
                "item_name": mixing_log.item_name,
                "item_group": mixing_log.item_group,
                "log_datetime": mixing_log.log_datetime
            }
        }
        
    except Exception as e:
        frappe.log_error(f"Error processing batch scan: {str(e)}")
        return {
            "success": False,
            "error": str(e)
        }

def get_batch_details_from_stock_entry(scan_lot_number):
    """Get batch details from Stock Entry based on mix_barcode"""
    try:
        # Search for Stock Entry Detail with matching mix_barcode
        stock_entry_detail = frappe.db.sql("""
            SELECT sed.batch_no, sed.item_code, i.item_name, i.item_group, sed.spp_batch_number
            FROM `tabStock Entry Detail` sed
            LEFT JOIN `tabItem` i ON sed.item_code = i.name
            WHERE sed.mix_barcode = %s
            AND sed.is_finished_item = 1
            ORDER BY sed.creation DESC
            LIMIT 1
        """, (scan_lot_number,), as_dict=True)
        
        if stock_entry_detail:
            return stock_entry_detail[0]
        else:
            return None
            
    except Exception as e:
        frappe.log_error(f"Error in get_batch_details_from_stock_entry: {str(e)}")
        return None

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
                "item_group",
                "log_datetime"
            ],
            order_by="log_datetime desc",
            limit=limit
        )
        
        return logs
        
    except Exception as e:
        frappe.log_error(f"Error fetching recent logs: {str(e)}")
        return []

@frappe.whitelist()
def validate_barcode(barcode):
    """Validate if barcode exists in system"""
    try:
        # Check if barcode exists in Stock Entry Details
        exists = frappe.db.sql("""
            SELECT COUNT(*) as count
            FROM `tabStock Entry Detail`
            WHERE mix_barcode = %s
            AND is_finished_item = 1
        """, (barcode,), as_dict=True)
        
        return {
            "success": True,
            "exists": exists[0].get('count', 0) > 0
        }
        
    except Exception as e:
        frappe.log_error(f"Error validating barcode: {str(e)}")
        return {
            "success": False,
            "error": str(e)
        }