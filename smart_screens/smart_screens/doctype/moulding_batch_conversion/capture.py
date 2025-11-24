# Copyright (c) 2025, Aggregated Report and contributors
# For license information, please see license.txt

import frappe
from frappe import _

def create_batch_conversion_record(doc, method):
	"""
	Automatically create Moulding Batch Conversion record when Moulding Production Entry is submitted
	
	Args:
		doc: Moulding Production Entry document
		method: Event method (on_submit)
	"""
	try:
		# Check if batch conversion record already exists for this production entry
		if frappe.db.exists("Moulding Batch Conversion", {"production_entry": doc.name}):
			frappe.logger().info(f"Moulding Batch Conversion already exists for {doc.name}")
			return
		
		# Validate required fields
		if not doc.batch_no:
			frappe.logger().warning(f"No batch_no found in Moulding Production Entry {doc.name}")
			return
		
		if not doc.fg_completed_qty:
			frappe.logger().warning(f"No fg_completed_qty found in Moulding Production Entry {doc.name}")
			return
		
		# Create Moulding Batch Conversion record
		conversion_doc = frappe.get_doc({
			"doctype": "Moulding Batch Conversion",
			"production_entry": doc.name,
			"batch_no": doc.batch_no,
			"item_code": doc.production_item,
			"mould_spec": doc.get("mould_specification"),
			"warehouse": doc.get("fg_warehouse"),
			"posting_datetime": doc.posting_date,
			"cavities_per_cycle": doc.get("cavities"),
			"cycle_time_sec": doc.get("cycle_time"),
			"shots": doc.get("shots") or doc.get("total_shots"),
			"gross_qty_kg": doc.get("total_weight_kg") or doc.get("gross_weight"),
			"net_qty_kg": doc.fg_completed_qty,
			"rejects_qty_kg": doc.get("reject_qty") or doc.get("scrap_qty") or 0,
			"company": doc.company,
			"status": "Active"
		})
		
		conversion_doc.insert(ignore_permissions=True)
		
		frappe.logger().info(
			f"Created Moulding Batch Conversion {conversion_doc.name} for Production Entry {doc.name}"
		)
		
	except Exception as e:
		frappe.log_error(
			f"Error creating Moulding Batch Conversion for {doc.name}: {str(e)}\n{frappe.get_traceback()}",
			"Moulding Batch Conversion Capture Error"
		)
		# Don't raise exception to avoid blocking production entry submission
		frappe.logger().error(f"Failed to create Moulding Batch Conversion for {doc.name}: {str(e)}")
