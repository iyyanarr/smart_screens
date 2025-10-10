# Copyright (c) 2025, Alphaworkz and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.utils import now_datetime, get_datetime


@frappe.whitelist()
def check_in_batch(batch, rack_id, warehouse="U1-Store - SPP INDIA"):
	"""
API method to check in a batch to a rack location

Args:
batch: Batch number to check in
rack_id: Rack Location Master name
warehouse: Warehouse name (default: U1-Store - SPP INDIA)

Returns:
dict: Success status, message, item_code, timestamp, and doc_name
"""
	try:
		# Validate inputs
		if not batch or not rack_id:
			frappe.throw(_("Batch and Rack ID are required"))
		
		# Validate batch exists
		if not frappe.db.exists("Batch", batch):
			frappe.throw(_("Batch {0} does not exist").format(batch))
		
		# Get item code from batch
		item_code = frappe.db.get_value("Batch", batch, "item")
		if not item_code:
			frappe.throw(_("Invalid batch: {0}").format(batch))
		
		# Validate rack exists and is submitted
		rack_doc = frappe.get_doc("Rack Location Master", rack_id)
		if (rack_doc.docstatus != 1):
			frappe.throw(_("Rack {0} is not submitted. Please submit it first.").format(rack_id))
		
		# Validate rack belongs to the warehouse
		if rack_doc.warehouse_name != warehouse:
			frappe.throw(
_("Rack {0} belongs to warehouse {1}, not {2}").format(
rack_id, rack_doc.warehouse_name, warehouse
)
)
		
		# Create new bin storage status entry
		doc = frappe.get_doc({
"doctype": "Bin Storage Status",
"warehouse": warehouse,
"batch": batch,
"item_code": item_code,
"rack_id": rack_id,
"status": 1,
"check_in_time": now_datetime()
		})
		doc.insert()
		frappe.db.commit()
		
		return {
			"success": True,
			"message": "Check-In Done",
			"item_code": item_code,
			"timestamp": doc.check_in_time,
			"doc_name": doc.name,
			"rack_barcode": rack_doc.barcode
		}
	
	except Exception as e:
		frappe.db.rollback()
		frappe.log_error(frappe.get_traceback(), "Bin Check-In Error")
		return {
			"success": False,
			"message": str(e)
		}


@frappe.whitelist()
def check_out_batch(batch, rack_id, warehouse="U1-Store - SPP INDIA"):
	"""
API method to check out a batch from a rack location
Uses Two-Level FIFO:
1. Level 1: Batch creation date (ERPNext FIFO)
2. Level 2: Check-in time (for bins of same batch)

Args:
batch: Batch number to check out
rack_id: Rack Location Master name
warehouse: Warehouse name (default: U1-Store - SPP INDIA)

Returns:
dict: Success status, message, item_code, timestamp, remarks, and doc_name
"""
	try:
		# Validate inputs
		if not batch or not rack_id:
			frappe.throw(_("Batch and Rack ID are required"))
		
		# Find the checked-in record (Two-Level FIFO)
		# Level 1: Order by batch creation date (oldest batch first)
		# Level 2: Order by check-in time (earliest check-in first for same batch)
		records = frappe.db.sql("""
			SELECT bs.name
			FROM `tabBin Storage Status` bs
			INNER JOIN `tabBatch` b ON bs.batch = b.name
			WHERE 
				bs.batch = %s
				AND bs.rack_id = %s
				AND bs.warehouse = %s
				AND bs.status = 1
			ORDER BY b.creation ASC, bs.check_in_time ASC
			LIMIT 1
		""", (batch, rack_id, warehouse), as_dict=1)
		
		if not records:
			frappe.throw(
_("No checked-in record found for Batch {0} in Rack {1}").format(batch, rack_id)
)
		
		# Update the record to check out
		doc = frappe.get_doc("Bin Storage Status", records[0].name)
		doc.status = 0
		doc.check_out_time = now_datetime()
		doc.save()
		frappe.db.commit()
		
		return {
			"success": True,
			"message": "Check-Out Complete",
			"item_code": doc.item_code,
			"timestamp": doc.check_out_time,
			"remarks": doc.remarks or "",
			"doc_name": doc.name,
			"fifo_warning": "FIFO missed" in (doc.remarks or "")
		}
	
	except Exception as e:
		frappe.db.rollback()
		frappe.log_error(frappe.get_traceback(), "Bin Check-Out Error")
		return {
			"success": False,
			"message": str(e)
		}


@frappe.whitelist()
def validate_barcode(barcode, warehouse="U1-Store - SPP INDIA"):
	"""
	Validate if a scanned barcode is a valid rack or batch
	
	Args:
		barcode: Scanned barcode value
		warehouse: Warehouse name (default: U1-Store - SPP INDIA)
	
	Returns:
		dict: Type (rack/batch), name, and additional info
	"""
	try:
		# Check if it's a rack barcode
		rack = frappe.db.get_value(
			"Rack Location Master",
			{"barcode": barcode, "warehouse_name": warehouse, "docstatus": 1},
			["name", "rack_id", "warehouse_name"],
			as_dict=True
		)
		
		if rack:
			return {
				"success": True,
				"type": "rack",
				"name": rack.name,
				"rack_id": rack.rack_id,
				"warehouse": rack.warehouse_name,
				"barcode": barcode
			}
		
		# Check if it's a batch number
		batch = frappe.db.get_value(
			"Batch",
			barcode,
			["name", "item", "batch_qty"],
			as_dict=True
		)
		
		if batch:
			# Check if batch has stock in warehouse
			stock_qty = frappe.db.sql("""
				SELECT SUM(actual_qty) as qty
				FROM `tabStock Ledger Entry`
				WHERE batch_no = %s AND warehouse = %s
			""", (barcode, warehouse), as_dict=1)
			
			qty = stock_qty[0].qty if stock_qty and stock_qty[0].qty else 0
			
			return {
				"success": True,
				"type": "batch",
				"name": batch.name,
				"item_code": batch.item,
				"batch_qty": batch.batch_qty,
				"warehouse_qty": qty
			}
		
		return {
			"success": False,
			"message": _("Invalid barcode: {0}").format(barcode)
		}
	
	except Exception as e:
		frappe.log_error(frappe.get_traceback(), "Barcode Validation Error")
		return {
			"success": False,
			"message": str(e)
		}


@frappe.whitelist()
def validate_check_in_inputs(batch=None, rack_id=None, warehouse=None):
	"""
	Validate batch and rack inputs for check-in in a single API call
	
	Args:
		batch: Batch number (optional)
		rack_id: Rack barcode or name (optional)
		warehouse: Warehouse name (optional - will be auto-detected from rack)
	
	Returns:
		dict: Validation results for both batch and rack
	"""
	result = {
		"batch_valid": False,
		"rack_valid": False,
		"batch_message": "",
		"rack_message": "",
		"item_code": None,
		"rack_name": None,
		"warehouse": None,
		"can_submit": False
	}
	
	try:
		# Validate batch if provided
		if batch:
			batch_doc = frappe.db.get_value(
				"Batch",
				batch,
				["name", "item", "batch_qty"],
				as_dict=True
			)
			
			if batch_doc:
				result["batch_valid"] = True
				result["batch_message"] = "Valid Batch"
				result["item_code"] = batch_doc.item
			else:
				result["batch_message"] = "Batch does not exist"
		
		# Validate rack if provided
		if rack_id:
			# Try searching by barcode first (most common case when scanning)
			rack_doc = frappe.db.get_value(
				"Rack Location Master",
				{"barcode": rack_id, "docstatus": 1},
				["name", "rack_id", "barcode", "warehouse_name"],
				as_dict=True
			)
			
			# If not found by barcode, try by name
			if not rack_doc:
				rack_doc = frappe.db.get_value(
					"Rack Location Master",
					{"name": rack_id, "docstatus": 1},
					["name", "rack_id", "barcode", "warehouse_name"],
					as_dict=True
				)
			
			if rack_doc:
				result["rack_valid"] = True
				result["rack_message"] = "Valid Rack"
				result["rack_name"] = rack_doc.name  # Store the actual name for API calls
				result["warehouse"] = rack_doc.warehouse_name  # Return warehouse for frontend
			else:
				# Check if rack exists but not submitted
				rack_any = frappe.db.get_value(
					"Rack Location Master",
					{"barcode": rack_id},
					["name", "docstatus", "warehouse_name"],
					as_dict=True
				)
				
				if not rack_any:
					rack_any = frappe.db.get_value(
						"Rack Location Master",
						rack_id,
						["name", "docstatus", "warehouse_name"],
						as_dict=True
					)
				
				if rack_any:
					if rack_any.docstatus != 1:
						result["rack_message"] = "Rack not submitted"
					else:
						result["rack_message"] = "Rack does not exist"
				else:
					result["rack_message"] = "Rack does not exist"
		
		# Can submit only if both are valid
		result["can_submit"] = result["batch_valid"] and result["rack_valid"]
		
		return result
	
	except Exception as e:
		frappe.log_error(frappe.get_traceback(), "Check-In Validation Error")
		return result


@frappe.whitelist()
def validate_check_out_inputs(batch=None, rack_id=None, warehouse="U1-Store - SPP INDIA"):
	"""
	Validate batch and rack inputs for check-out in a single API call
	Checks against Bin Storage Status to ensure batch is checked in at the specified rack
	
	Args:
		batch: Batch number (optional)
		rack_id: Rack barcode or name (optional)
		warehouse: Warehouse name (default: U1-Store - SPP INDIA)
	
	Returns:
		dict: Validation results for both batch and rack
	"""
	result = {
		"batch_valid": False,
		"rack_valid": False,
		"batch_message": "",
		"rack_message": "",
		"item_code": None,
		"rack_name": None,
		"can_submit": False
	}
	
	try:
		# Validate batch if provided
		if batch:
			# Check if batch exists in Bin Storage Status with status = 1 (checked in)
			batch_record = frappe.db.sql("""
				SELECT 
					bs.name,
					bs.item_code,
					bs.rack_id,
					bs.check_in_time,
					rlm.barcode as rack_barcode
				FROM `tabBin Storage Status` bs
				LEFT JOIN `tabRack Location Master` rlm ON bs.rack_id = rlm.name
				WHERE 
					bs.batch = %s 
					AND bs.warehouse = %s 
					AND bs.status = 1
				ORDER BY bs.check_in_time ASC
				LIMIT 1
			""", (batch, warehouse), as_dict=1)
			
			if batch_record:
				result["batch_valid"] = True
				result["batch_message"] = "Batch is checked in"
				result["item_code"] = batch_record[0].item_code
				result["expected_rack"] = batch_record[0].rack_id
				result["expected_rack_barcode"] = batch_record[0].rack_barcode
			else:
				# Check if batch exists at all
				batch_exists = frappe.db.exists("Batch", batch)
				if batch_exists:
					# Batch exists but not checked in
					result["batch_message"] = "Batch not checked in to any rack"
				else:
					result["batch_message"] = "Batch does not exist"
		
		# Validate rack if provided
		if rack_id:
			# Try searching by barcode first (most common case when scanning)
			rack_doc = frappe.db.get_value(
				"Rack Location Master",
				{"barcode": rack_id, "docstatus": 1},
				["name", "rack_id", "barcode", "warehouse_name"],
				as_dict=True
			)
			
			# If not found by barcode, try by name
			if not rack_doc:
				rack_doc = frappe.db.get_value(
					"Rack Location Master",
					{"name": rack_id, "docstatus": 1},
					["name", "rack_id", "barcode", "warehouse_name"],
					as_dict=True
				)
			
			if rack_doc:
				# Check if warehouse matches
				if warehouse and rack_doc.warehouse_name != warehouse:
					result["rack_message"] = f"Rack belongs to {rack_doc.warehouse_name}, not {warehouse}"
					result["rack_valid"] = False
				else:
					result["rack_valid"] = True
					result["rack_message"] = "Valid Rack"
					result["rack_name"] = rack_doc.name  # Store the actual name for API calls
			else:
				# Check if rack exists but not submitted
				rack_any = frappe.db.get_value(
					"Rack Location Master",
					{"barcode": rack_id},
					["name", "docstatus", "warehouse_name"],
					as_dict=True
				)
				
				if not rack_any:
					rack_any = frappe.db.get_value(
						"Rack Location Master",
						rack_id,
						["name", "docstatus", "warehouse_name"],
						as_dict=True
					)
				
				if rack_any:
					if rack_any.docstatus != 1:
						result["rack_message"] = "Rack not submitted"
					elif warehouse and rack_any.warehouse_name != warehouse:
						result["rack_message"] = f"Rack belongs to {rack_any.warehouse_name}, not {warehouse}"
				else:
					result["rack_message"] = "Rack does not exist"
		
		# Cross-validation: If both batch and rack are provided, verify they match
		if batch and rack_id and result["batch_valid"] and result["rack_valid"]:
			# Check if this batch is actually in this specific rack
			batch_in_rack = frappe.db.exists(
				"Bin Storage Status",
				{
					"batch": batch,
					"rack_id": result["rack_name"],
					"warehouse": warehouse,
					"status": 1
				}
			)
			
			if not batch_in_rack:
				# Batch is checked in but not in this rack
				result["batch_valid"] = False
				result["batch_message"] = f"Batch is in {result.get('expected_rack_barcode', 'another rack')}, not this rack"
				result["rack_message"] = "Batch not stored in this rack"
		
		# Can submit only if both are valid
		result["can_submit"] = result["batch_valid"] and result["rack_valid"]
		
		return result
	
	except Exception as e:
		frappe.log_error(frappe.get_traceback(), "Check-Out Validation Error")
		return result


@frappe.whitelist()
def find_product_by_item(item_code, warehouse="U1-Store - SPP INDIA", show_all=False):
	"""
Find batches and their locations for a given item code
Uses Two-Level FIFO:
1. Level 1: Batch creation date (ERPNext FIFO)
2. Level 2: Check-in time (for bins of same batch)

Args:
item_code: Item code to search
warehouse: Warehouse name (default: U1-Store - SPP INDIA)
show_all: If True, show all batches; if False, show only FIFO batch

Returns:
dict: FIFO batch info and optionally all batches
"""
	try:
		# Get all checked-in batches for this item
		# Two-Level FIFO: Order by batch creation date, then check-in time
		batches = frappe.db.sql("""
SELECT 
bs.batch,
bs.rack_id,
bs.check_in_time,
rlm.barcode as rack_barcode,
rlm.rack_id as rack_location,
b.batch_qty,
b.expiry_date,
b.creation as batch_creation
FROM `tabBin Storage Status` bs
INNER JOIN `tabBatch` b ON bs.batch = b.name
LEFT JOIN `tabRack Location Master` rlm ON bs.rack_id = rlm.name
WHERE 
bs.item_code = %s 
AND bs.warehouse = %s 
AND bs.status = 1
ORDER BY b.creation ASC, bs.check_in_time ASC
""", (item_code, warehouse), as_dict=1)
		
		if not batches:
			return {
				"success": False,
				"message": _("No batches found for item {0} in warehouse {1}").format(item_code, warehouse)
			}
		
		# FIFO batch is the first one (oldest batch creation, earliest check-in)
		fifo_batch = batches[0]
		
		result = {
			"success": True,
			"item_code": item_code,
			"fifo_batch": {
				"batch": fifo_batch.batch,
				"rack_id": fifo_batch.rack_id,
				"rack_location": fifo_batch.rack_location,
				"rack_barcode": fifo_batch.rack_barcode,
				"check_in_time": fifo_batch.check_in_time,
				"batch_creation": fifo_batch.batch_creation,
				"batch_qty": fifo_batch.batch_qty,
				"expiry_date": fifo_batch.expiry_date
			},
			"total_batches": len(batches)
		}
		
		if show_all:
			result["all_batches"] = batches
		
		return result
	
	except Exception as e:
		frappe.log_error(frappe.get_traceback(), "Product Finder by Item Error")
		return {
			"success": False,
			"message": str(e)
		}


@frappe.whitelist()
def find_product_by_batch(batch, warehouse="U1-Store - SPP INDIA"):
	"""
Find location(s) for a given batch number

Args:
batch: Batch number to search
warehouse: Warehouse name (default: U1-Store - SPP INDIA)

Returns:
dict: Batch info and all locations where it's checked in
"""
	try:
		# Get batch info
		batch_info = frappe.db.get_value(
"Batch",
batch,
["name", "item", "batch_qty", "expiry_date"],
as_dict=True
)
		
		if not batch_info:
			return {
				"success": False,
				"message": _("Batch {0} does not exist").format(batch)
			}
		
		# Get all locations where this batch is checked in
		locations = frappe.db.sql("""
SELECT 
bs.rack_id,
bs.check_in_time,
rlm.barcode as rack_barcode,
rlm.rack_id as rack_location,
rlm.warehouse_name
FROM `tabBin Storage Status` bs
LEFT JOIN `tabRack Location Master` rlm ON bs.rack_id = rlm.name
WHERE 
bs.batch = %s 
AND bs.warehouse = %s 
AND bs.status = 1
ORDER BY bs.check_in_time ASC
""", (batch, warehouse), as_dict=1)
		
		return {
			"success": True,
			"batch": batch_info.name,
			"item_code": batch_info.item,
			"batch_qty": batch_info.batch_qty,
			"expiry_date": batch_info.expiry_date,
			"locations": locations,
			"location_count": len(locations)
		}
	
	except Exception as e:
		frappe.log_error(frappe.get_traceback(), "Product Finder by Batch Error")
		return {
			"success": False,
			"message": str(e)
		}


@frappe.whitelist()
def get_bin_status_summary(warehouse="U1-Store - SPP INDIA"):
	"""
Get summary of all items currently stored in bins

Args:
warehouse: Warehouse name (default: U1-Store - SPP INDIA)

Returns:
dict: List of items with bin counts
"""
	try:
		summary = frappe.db.sql("""
SELECT 
bs.item_code,
i.item_name,
COUNT(DISTINCT bs.name) as bin_count,
COUNT(DISTINCT bs.batch) as batch_count,
COUNT(DISTINCT bs.rack_id) as rack_count,
MIN(bs.check_in_time) as earliest_check_in,
MAX(bs.check_in_time) as latest_check_in
FROM `tabBin Storage Status` bs
LEFT JOIN `tabItem` i ON bs.item_code = i.name
WHERE 
bs.warehouse = %s 
AND bs.status = 1
GROUP BY bs.item_code, i.item_name
ORDER BY bs.item_code
""", (warehouse,), as_dict=1)
		
		return {
			"success": True,
			"warehouse": warehouse,
			"total_items": len(summary),
			"data": summary
		}
	
	except Exception as e:
		frappe.log_error(frappe.get_traceback(), "Bin Status Summary Error")
		return {
			"success": False,
			"message": str(e)
		}


@frappe.whitelist()
def get_rack_contents(rack_id, warehouse="U1-Store - SPP INDIA"):
	"""
Get all batches currently stored in a specific rack

Args:
rack_id: Rack Location Master name
warehouse: Warehouse name (default: U1-Store - SPP INDIA)

Returns:
dict: Rack info and list of batches
"""
	try:
		# Get rack info
		rack_info = frappe.db.get_value(
"Rack Location Master",
rack_id,
["name", "rack_id", "barcode", "warehouse_name"],
as_dict=True
)
		
		if not rack_info:
			return {
				"success": False,
				"message": _("Rack {0} does not exist").format(rack_id)
			}
		
		# Get all batches in this rack
		batches = frappe.db.sql("""
SELECT 
bs.batch,
bs.item_code,
i.item_name,
bs.check_in_time,
b.batch_qty,
b.expiry_date
FROM `tabBin Storage Status` bs
LEFT JOIN `tabItem` i ON bs.item_code = i.name
LEFT JOIN `tabBatch` b ON bs.batch = b.name
WHERE 
bs.rack_id = %s 
AND bs.warehouse = %s 
AND bs.status = 1
ORDER BY bs.check_in_time ASC
""", (rack_id, warehouse), as_dict=1)
		
		return {
			"success": True,
			"rack_id": rack_info.name,
			"rack_location": rack_info.rack_id,
			"rack_barcode": rack_info.barcode,
			"warehouse": rack_info.warehouse_name,
			"batch_count": len(batches),
			"batches": batches
		}
	
	except Exception as e:
		frappe.log_error(frappe.get_traceback(), "Rack Contents Error")
		return {
			"success": False,
			"message": str(e)
		}
