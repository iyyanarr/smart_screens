# Copyright (c) 2025, Alphaworkz and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.utils import now_datetime, get_datetime


def get_product_batch_from_stripped(stripped_batch):
	"""
	Convert stripped batch number (mix_barcode) to full P-prefix batch number
	Searches in Stock Entry Detail for finished products only
	
	Args:
		stripped_batch: Stripped batch number from mix_barcode (e.g., "25F14X13")
	
	Returns:
		dict: Full batch number and item info, or error message
	"""
	try:
		# If it already starts with P, search directly in Batch table
		if stripped_batch.startswith('P'):
			batch_info = frappe.db.sql("""
				SELECT 
					b.name as batch_no,
					b.item as item_code,
					i.item_name,
					i.item_group
				FROM `tabBatch` b
				INNER JOIN `tabItem` i ON b.item = i.name
				WHERE b.name = %s
				AND i.item_group IN ('Products', 'Finished Product')
			""", (stripped_batch,), as_dict=1)
			
			if batch_info:
				return {
					"success": True,
					"batch_no": batch_info[0].batch_no,
					"item_code": batch_info[0].item_code,
					"item_name": batch_info[0].item_name,
					"item_group": batch_info[0].item_group
				}
		
		# Search in Stock Entry Detail using mix_barcode for stripped batch
		# Only get finished products from Manufacture stock entries
		batch_info = frappe.db.sql("""
			SELECT 
				sed.batch_no,
				sed.item_code,
				i.item_name,
				sed.item_group
			FROM `tabStock Entry Detail` sed
			INNER JOIN `tabStock Entry` se ON sed.parent = se.name
			INNER JOIN `tabItem` i ON sed.item_code = i.name
			WHERE 
				sed.mix_barcode = %s
				AND sed.is_finished_item = 1
				AND sed.item_group IN ('Products', 'Finished Product')
				AND se.stock_entry_type = 'Manufacture'
				AND se.docstatus = 1
			ORDER BY se.creation DESC
			LIMIT 1
		""", (stripped_batch,), as_dict=1)
		
		if not batch_info:
			return {
				"success": False,
				"message": f"Batch with barcode {stripped_batch} not found or not a Product/Finished Product"
			}
		
		return {
			"success": True,
			"batch_no": batch_info[0].batch_no,
			"item_code": batch_info[0].item_code,
			"item_name": batch_info[0].item_name,
			"item_group": batch_info[0].item_group
		}
	
	except Exception as e:
		frappe.log_error(frappe.get_traceback(), "Get Product Batch Error")
		return {
			"success": False,
			"message": str(e)
		}


@frappe.whitelist()
def check_in_batch(batch, rack_id):
	"""
	API method to check in a batch to a rack location
	Now accepts stripped batch numbers (mix_barcode) and converts to full batch
	Warehouse is auto-detected from the rack

	Args:
		batch: Batch number (can be stripped like "25F14X13" or full like "P25F14X13")
		rack_id: Rack Location Master name or barcode

	Returns:
		dict: Success status, message, item_code, timestamp, and doc_name
	"""
	try:
		# Validate inputs
		if not batch or not rack_id:
			frappe.throw(_("Batch and Rack ID are required"))
		
		# Convert stripped batch to full P-prefix batch using mix_barcode
		batch_result = get_product_batch_from_stripped(batch)
		if not batch_result["success"]:
			frappe.throw(_(batch_result["message"]))
		
		full_batch = batch_result["batch_no"]
		item_code = batch_result["item_code"]
		
			# Get rack and auto-detect warehouse from it
		rack_doc = frappe.get_doc("Rack Location Master", rack_id)
		if rack_doc.docstatus != 1:
			frappe.throw(_("Rack {0} is not submitted. Please submit it first.").format(rack_id))
		
		# Auto-detect warehouse from rack
		warehouse = rack_doc.warehouse_name
		
		# Create new bin storage status entry
		doc = frappe.get_doc({
			"doctype": "Bin Storage Status",
			"warehouse": warehouse,
			"batch": full_batch,
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
				"warehouse": warehouse,
			"timestamp": doc.check_in_time,
			"doc_name": doc.name,
			"rack_barcode": rack_doc.barcode,
			"full_batch": full_batch,
			"stripped_batch": batch
		}
	
	except Exception as e:
		frappe.db.rollback()
		frappe.log_error(frappe.get_traceback(), "Bin Check-In Error")
		return {
			"success": False,
			"message": str(e)
		}


@frappe.whitelist()
def check_out_batch(batch, rack_id, force_fifo_override=False):
	"""
	API method to check out a batch from a rack location
	Now accepts stripped batch numbers (mix_barcode) and converts to full batch
	Warehouse is auto-detected from the rack
	
	FIFO Enforcement:
	- By default, blocks checkout if the scanned batch is not the oldest for this item
	- Set force_fifo_override=True to proceed anyway (violation will be logged)

	Args:
		batch: Batch number (can be stripped like "25F14X13" or full like "P25F14X13")
		rack_id: Rack Location Master name or barcode
		force_fifo_override: If True, allows checkout even if FIFO is violated

	Returns:
		dict: Success status, message, item_code, timestamp, remarks, and doc_name
		      If FIFO violation detected and force_fifo_override=False, returns fifo_violation=True
	"""
	try:
		# Validate inputs
		if not batch or not rack_id:
			frappe.throw(_("Batch and Rack ID are required"))
		
		# Convert stripped batch to full P-prefix batch using mix_barcode
		batch_result = get_product_batch_from_stripped(batch)
		if not batch_result["success"]:
			frappe.throw(_(batch_result["message"]))
		
		full_batch = batch_result["batch_no"]
		item_code = batch_result["item_code"]
		
		# Get rack and auto-detect warehouse from it
		# Try by barcode first, then by name
		rack_doc = None
		rack_by_barcode = frappe.db.get_value(
			"Rack Location Master",
			{"barcode": rack_id, "docstatus": 1},
			["name", "warehouse_name", "barcode"],
			as_dict=True
		)
		if rack_by_barcode:
			rack_doc = frappe.get_doc("Rack Location Master", rack_by_barcode.name)
		else:
			rack_doc = frappe.get_doc("Rack Location Master", rack_id)
		
		if rack_doc.docstatus != 1:
			frappe.throw(_("Rack {0} is not submitted. Please submit it first.").format(rack_id))
		
		# Auto-detect warehouse from rack
		warehouse = rack_doc.warehouse_name
		rack_name = rack_doc.name
		
		# FIFO Check: Find the oldest batch for this item in the warehouse
		oldest_batch = frappe.db.sql("""
			SELECT 
				bs.batch,
				bs.rack_id,
				bs.check_in_time,
				b.creation as batch_creation,
				rlm.barcode as rack_barcode
			FROM `tabBin Storage Status` bs
			INNER JOIN `tabBatch` b ON bs.batch = b.name
			LEFT JOIN `tabRack Location Master` rlm ON bs.rack_id = rlm.name
			WHERE 
				bs.item_code = %s 
				AND bs.warehouse = %s 
				AND bs.status = 1
			ORDER BY b.creation ASC, bs.check_in_time ASC
			LIMIT 1
		""", (item_code, warehouse), as_dict=1)
		
		fifo_violation = False
		fifo_batch_info = None
		
		if oldest_batch:
			oldest = oldest_batch[0]
			if oldest.batch != full_batch:
				fifo_violation = True
				fifo_batch_info = {
					"batch": oldest.batch,
					"rack_id": oldest.rack_id,
					"rack_barcode": oldest.rack_barcode,
					"check_in_time": oldest.check_in_time,
					"batch_creation": oldest.batch_creation
				}
				
				# If FIFO override is not forced, return error
				if not force_fifo_override:
					return {
						"success": False,
						"fifo_violation": True,
						"message": (
							f"FIFO Violation: Batch {oldest.batch} in rack {oldest.rack_barcode or oldest.rack_id} "
							f"was created earlier and should be checked out first."
						),
						"fifo_batch": oldest.batch,
						"fifo_rack": oldest.rack_id,
						"fifo_rack_barcode": oldest.rack_barcode,
						"scanned_batch": full_batch,
						"item_code": item_code,
						"warehouse": warehouse
					}
		
		# Find the checked-in record for the requested batch
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
		""", (full_batch, rack_name, warehouse), as_dict=1)
		
		if not records:
			frappe.throw(
				_("No checked-in record found for Batch {0} in Rack {1}").format(full_batch, rack_id)
			)
		
		# Update the record to check out
		doc = frappe.get_doc("Bin Storage Status", records[0].name)
		doc.status = 0
		doc.check_out_time = now_datetime()
		
		# If FIFO was violated but override was forced, log it in remarks
		if fifo_violation and force_fifo_override and fifo_batch_info:
			fifo_remark = (
				f"FIFO Override: Checked out {full_batch} instead of older batch "
				f"{fifo_batch_info['batch']} (in rack {fifo_batch_info['rack_barcode'] or fifo_batch_info['rack_id']})"
			)
			doc.remarks = ((doc.remarks or "") + "\n" + fifo_remark).strip()
		
		doc.save()
		frappe.db.commit()
		
		return {
			"success": True,
			"message": "Check-Out Complete",
			"item_code": doc.item_code,
			"warehouse": warehouse,
			"timestamp": doc.check_out_time,
			"remarks": doc.remarks or "",
			"doc_name": doc.name,
			"fifo_warning": fifo_violation,
			"fifo_override_used": fifo_violation and force_fifo_override,
			"full_batch": full_batch,
			"stripped_batch": batch
		}
	
	except Exception as e:
		frappe.db.rollback()
		frappe.log_error(frappe.get_traceback(), "Bin Check-Out Error")
		return {
			"success": False,
			"message": str(e)
		}


@frappe.whitelist()
def validate_barcode(barcode, warehouse=None):
	"""
	Validate if a scanned barcode is a valid rack or batch
	Warehouse is optional - will be auto-detected from rack if it's a rack barcode
	
	Args:
		barcode: Scanned barcode value
		warehouse: Warehouse name (optional - auto-detected from rack)
	
	Returns:
		dict: Type (rack/batch), name, and additional info
	"""
	try:
		# Check if it's a rack barcode (search all warehouses if warehouse not specified)
		if warehouse:
			rack = frappe.db.get_value(
				"Rack Location Master",
				{"barcode": barcode, "warehouse_name": warehouse, "docstatus": 1},
				["name", "rack_id", "warehouse_name"],
				as_dict=True
			)
		else:
			# Search across all warehouses
			rack = frappe.db.get_value(
				"Rack Location Master",
				{"barcode": barcode, "docstatus": 1},
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
		
		# Check if it's a batch number (stripped or full)
		batch_result = get_product_batch_from_stripped(barcode)
		if batch_result["success"]:
			full_batch = batch_result["batch_no"]
			
			# Get batch info
			batch = frappe.db.get_value(
				"Batch",
				full_batch,
				["name", "item", "batch_qty"],
				as_dict=True
			)
			
			if batch:
				# Check if batch has stock in warehouse (if warehouse specified)
				if warehouse:
					stock_qty = frappe.db.sql("""
						SELECT SUM(actual_qty) as qty
						FROM `tabStock Ledger Entry`
						WHERE batch_no = %s AND warehouse = %s
					""", (full_batch, warehouse), as_dict=1)
				else:
					# Get total stock across all warehouses
					stock_qty = frappe.db.sql("""
						SELECT SUM(actual_qty) as qty
						FROM `tabStock Ledger Entry`
						WHERE batch_no = %s
					""", (full_batch,), as_dict=1)
				
				qty = stock_qty[0].qty if stock_qty and stock_qty[0].qty else 0
				
				return {
					"success": True,
					"type": "batch",
					"name": batch.name,
					"item_code": batch.item,
					"batch_qty": batch.batch_qty,
					"warehouse_qty": qty,
					"warehouse": warehouse
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
	Now accepts stripped batch numbers (mix_barcode) and converts to full batch
	
	Args:
		batch: Batch number (can be stripped like "25F14X13" or full like "P25F14X13")
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
		"can_submit": False,
		"full_batch": None
	}
	
	try:
		# Validate batch if provided
		if batch:
			# Convert stripped batch to full P-prefix batch using mix_barcode
			batch_result = get_product_batch_from_stripped(batch)
			if batch_result["success"]:
				result["batch_valid"] = True
				result["batch_message"] = "Valid Product Batch"
				result["item_code"] = batch_result["item_code"]
				result["full_batch"] = batch_result["batch_no"]
			else:
				result["batch_message"] = batch_result["message"]
		
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
def validate_check_out_inputs(batch=None, rack_id=None):
	"""
	Validate batch and rack inputs for check-out in a single API call
	Now accepts stripped batch numbers (mix_barcode) and converts to full batch
	Warehouse is auto-detected from rack
	Checks against Bin Storage Status to ensure batch is checked in at the specified rack
	
	Args:
		batch: Batch number (can be stripped like "25F14X13" or full like "P25F14X13")
		rack_id: Rack barcode or name (optional)
	
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
		"can_submit": False,
		"full_batch": None,
		# FIFO validation fields
		"fifo_violation": False,
		"fifo_batch": None,
		"fifo_rack": None,
		"fifo_rack_barcode": None,
		"fifo_message": ""
	}
	
	try:
		# First, validate and get rack to auto-detect warehouse
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
				result["rack_name"] = rack_doc.name
				result["warehouse"] = rack_doc.warehouse_name  # Auto-detect warehouse from rack
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
		
		# Validate batch if provided
		if batch:
			# Convert stripped batch to full P-prefix batch using mix_barcode
			batch_result = get_product_batch_from_stripped(batch)
			if not batch_result["success"]:
				result["batch_message"] = batch_result["message"]
			else:
				full_batch = batch_result["batch_no"]
				result["full_batch"] = full_batch
				
				# If we have warehouse from rack, use it to check batch status
				if result["warehouse"]:
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
					""", (full_batch, result["warehouse"]), as_dict=1)
					
					if batch_record:
						result["batch_valid"] = True
						result["batch_message"] = "Batch is checked in"
						result["item_code"] = batch_record[0].item_code
						result["expected_rack"] = batch_record[0].rack_id
						result["expected_rack_barcode"] = batch_record[0].rack_barcode
					else:
						result["batch_message"] = "Batch not checked in to any rack"
				else:
					# No rack provided, just validate batch exists
					result["batch_valid"] = True
					result["batch_message"] = "Valid Product Batch"
					result["item_code"] = batch_result["item_code"]
		
		# Cross-validation: If both batch and rack are provided, verify they match
		if batch and rack_id and result["batch_valid"] and result["rack_valid"]:
			# Check if this batch is actually in this specific rack
			batch_in_rack = frappe.db.exists(
				"Bin Storage Status",
				{
					"batch": result["full_batch"],
					"rack_id": result["rack_name"],
					"warehouse": result["warehouse"],
					"status": 1
				}
			)
			
			if not batch_in_rack:
				# Batch is checked in but not in this rack
				result["batch_valid"] = False
				result["batch_message"] = f"Batch is in {result.get('expected_rack_barcode', 'another rack')}, not this rack"
				result["rack_message"] = "Batch not stored in this rack"
		
		# FIFO Validation: Check if this is the oldest batch for this item
		if result["batch_valid"] and result["rack_valid"] and result["item_code"]:
			# Get the batch creation date for the current batch
			current_batch_creation = frappe.db.get_value("Batch", result["full_batch"], "creation")
			
			# Find the oldest batch for this item that is still checked in
			oldest_batch = frappe.db.sql("""
				SELECT 
					bs.batch,
					bs.rack_id,
					bs.check_in_time,
					b.creation as batch_creation,
					rlm.barcode as rack_barcode
				FROM `tabBin Storage Status` bs
				INNER JOIN `tabBatch` b ON bs.batch = b.name
				LEFT JOIN `tabRack Location Master` rlm ON bs.rack_id = rlm.name
				WHERE 
					bs.item_code = %s 
					AND bs.warehouse = %s 
					AND bs.status = 1
				ORDER BY b.creation ASC, bs.check_in_time ASC
				LIMIT 1
			""", (result["item_code"], result["warehouse"]), as_dict=1)
			
			if oldest_batch:
				oldest = oldest_batch[0]
				# Check if the current batch is NOT the oldest (FIFO violation)
				if oldest.batch != result["full_batch"]:
					result["fifo_violation"] = True
					result["fifo_batch"] = oldest.batch
					result["fifo_rack"] = oldest.rack_id
					result["fifo_rack_barcode"] = oldest.rack_barcode
					result["fifo_message"] = (
						f"FIFO Warning: Batch {oldest.batch} in rack {oldest.rack_barcode or oldest.rack_id} "
						f"was created earlier and should be checked out first."
					)
		
		# Can submit only if both are valid (FIFO violation is a warning, not a blocker at validation stage)
		result["can_submit"] = result["batch_valid"] and result["rack_valid"]
		
		return result
	
	except Exception as e:
		frappe.log_error(frappe.get_traceback(), "Check-Out Validation Error")
		return result


@frappe.whitelist()
def find_product_by_item(item_code, warehouse=None, show_all=False):
	"""
	Find batches and their locations for a given item code
	Warehouse is optional - if not provided, searches across all warehouses
	Uses Two-Level FIFO:
	1. Level 1: Batch creation date (ERPNext FIFO)
	2. Level 2: Check-in time (for bins of same batch)

	Args:
		item_code: Item code to search
		warehouse: Warehouse name (optional - if not provided, searches all warehouses)
		show_all: If True, show all batches; if False, show only FIFO batch

	Returns:
		dict: FIFO batch info and optionally all batches
	"""
	try:
		# Build query based on whether warehouse is specified
		if warehouse:
			warehouse_condition = "AND bs.warehouse = %s"
			params = (item_code, warehouse)
		else:
			warehouse_condition = ""
			params = (item_code,)
		
		# Get all checked-in batches for this item
		# Two-Level FIFO: Order by batch creation date, then check-in time
		batches = frappe.db.sql(f"""
			SELECT 
				bs.batch,
				bs.rack_id,
				bs.warehouse,
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
				{warehouse_condition}
				AND bs.status = 1
			ORDER BY b.creation ASC, bs.check_in_time ASC
		""", params, as_dict=1)
		
		if not batches:
			if warehouse:
				message = _("No batches found for item {0} in warehouse {1}").format(item_code, warehouse)
			else:
				message = _("No batches found for item {0}").format(item_code)
			return {
				"success": False,
				"message": message
			}
		
		# FIFO batch is the first one (oldest batch creation, earliest check-in)
		fifo_batch = batches[0]
		
		result = {
			"success": True,
			"item_code": item_code,
				"warehouse": warehouse,
			"fifo_batch": {
				"batch": fifo_batch.batch,
				"rack_id": fifo_batch.rack_id,
				"rack_location": fifo_batch.rack_location,
				"rack_barcode": fifo_batch.rack_barcode,
					"warehouse": fifo_batch.warehouse,
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
def find_product_by_batch(batch, warehouse=None):
	"""
	Find location(s) for a given batch number
	Now accepts stripped batch numbers (mix_barcode) and converts to full batch
	Warehouse is optional - if not provided, searches across all warehouses

	Args:
		batch: Batch number (can be stripped like "25F14X13" or full like "P25F14X13")
		warehouse: Warehouse name (optional - if not provided, searches all warehouses)

	Returns:
		dict: Batch info and all locations where it's checked in
	"""
	try:
		# Convert stripped batch to full P-prefix batch using mix_barcode
		batch_result = get_product_batch_from_stripped(batch)
		if not batch_result["success"]:
			return {
				"success": False,
				"message": batch_result["message"]
			}
		
		full_batch = batch_result["batch_no"]
		
		# Get batch info
		batch_info = frappe.db.get_value(
			"Batch",
			full_batch,
			["name", "item", "batch_qty", "expiry_date"],
			as_dict=True
		)
		
		if not batch_info:
			return {
				"success": False,
				"message": _("Batch {0} does not exist").format(full_batch)
			}
		
			# Build query based on whether warehouse is specified
		if warehouse:
			warehouse_condition = "AND bs.warehouse = %s"
			params = (full_batch, warehouse)
		else:
			warehouse_condition = ""
			params = (full_batch,)
		
		# Get all locations where this batch is checked in
		locations = frappe.db.sql(f"""
			SELECT 
				bs.rack_id,
				bs.warehouse,
				bs.check_in_time,
				rlm.barcode as rack_barcode,
				rlm.rack_id as rack_location,
				rlm.warehouse_name
			FROM `tabBin Storage Status` bs
			LEFT JOIN `tabRack Location Master` rlm ON bs.rack_id = rlm.name
			WHERE 
				bs.batch = %s 
				{warehouse_condition}
				AND bs.status = 1
			ORDER BY bs.check_in_time ASC
		""", params, as_dict=1)
		
		return {
			"success": True,
			"batch": batch_info.name,
			"stripped_batch": batch,
			"item_code": batch_info.item,
			"batch_qty": batch_info.batch_qty,
			"expiry_date": batch_info.expiry_date,
			"warehouse": warehouse,
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
def get_bin_status_summary(warehouse=None):
	"""
	Get summary of all items currently stored in bins
	Warehouse is optional - if not provided, shows summary across all warehouses

	Args:
		warehouse: Warehouse name (optional - if not provided, shows all warehouses)

	Returns:
		dict: List of items with bin counts
	"""
	try:
		# Build query based on whether warehouse is specified
		if warehouse:
			warehouse_condition = "WHERE bs.warehouse = %s AND bs.status = 1"
			params = (warehouse,)
		else:
			warehouse_condition = "WHERE bs.status = 1"
			params = ()
		
		summary = frappe.db.sql(f"""
			SELECT 
				bs.item_code,
				bs.warehouse,
				i.item_name,
				COUNT(DISTINCT bs.name) as bin_count,
				COUNT(DISTINCT bs.batch) as batch_count,
				COUNT(DISTINCT bs.rack_id) as rack_count,
				MIN(bs.check_in_time) as earliest_check_in,
				MAX(bs.check_in_time) as latest_check_in
			FROM `tabBin Storage Status` bs
			LEFT JOIN `tabItem` i ON bs.item_code = i.name
			{warehouse_condition}
			GROUP BY bs.item_code, bs.warehouse, i.item_name
			ORDER BY bs.warehouse, bs.item_code
		""", params, as_dict=1)
		
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
def get_rack_contents(rack_id):
	"""
	Get all batches currently stored in a specific rack
	Warehouse is auto-detected from the rack

	Args:
		rack_id: Rack Location Master name or barcode

	Returns:
		dict: Rack info and list of batches
	"""
	try:
		# Get rack info and auto-detect warehouse
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
		
		# Auto-detect warehouse from rack
		warehouse = rack_info.warehouse_name
		
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


@frappe.whitelist()
def get_bins_grouped_by_rack(warehouse=None, status_filter='active'):
	"""
	Get all bins grouped by rack for visual rack map display
	
	Args:
		warehouse: Warehouse name (optional - if not provided, shows all warehouses)
		status_filter: Filter by status - 'active', 'checkout', or 'all'
	
	Returns:
		dict: Racks with their bins, grouped by warehouse
	"""
	try:
		# Build status filter
		if status_filter == 'active':
			status_condition = "AND bs.status = 1"
		elif status_filter == 'checkout':
			status_condition = "AND bs.status = 0"
		else:
			status_condition = ""
		
		# Build warehouse filter
		if warehouse:
			warehouse_condition = "AND bs.warehouse = %s"
			params = (warehouse,)
		else:
			warehouse_condition = ""
			params = ()
		
		# Get all bins grouped by rack
		bins_data = frappe.db.sql(f"""
			SELECT 
				bs.name as bin_id,
				bs.batch,
				bs.item_code,
				i.item_name,
				bs.rack_id,
				rlm.rack_id as rack_location,
				rlm.barcode as rack_barcode,
				bs.warehouse,
				bs.check_in_time,
				bs.check_out_time,
				bs.status,
				bs.remarks,
				b.creation as batch_creation
			FROM `tabBin Storage Status` bs
			LEFT JOIN `tabRack Location Master` rlm ON bs.rack_id = rlm.name
			LEFT JOIN `tabItem` i ON bs.item_code = i.name
			LEFT JOIN `tabBatch` b ON bs.batch = b.name
			WHERE 1=1 
				{warehouse_condition}
				{status_condition}
			ORDER BY bs.warehouse, bs.rack_id, b.creation ASC, bs.check_in_time ASC
		""", params, as_dict=1)
		
		# Group bins by warehouse and rack
		warehouses = {}
		for bin_data in bins_data:
			wh = bin_data.warehouse
			rack = bin_data.rack_id
			
			if wh not in warehouses:
				warehouses[wh] = {}
			
			if rack not in warehouses[wh]:
				warehouses[wh][rack] = {
					"rack_id": rack,
					"rack_location": bin_data.rack_location,
					"rack_barcode": bin_data.rack_barcode,
					"bins": []
				}
			
			warehouses[wh][rack]["bins"].append({
				"bin_id": bin_data.bin_id,
				"batch": bin_data.batch,
				"item_code": bin_data.item_code,
				"item_name": bin_data.item_name,
				"check_in_time": bin_data.check_in_time,
				"check_out_time": bin_data.check_out_time,
				"status": bin_data.status,
				"remarks": bin_data.remarks,
				"batch_creation": bin_data.batch_creation
			})
		
		# Convert to list format for easier frontend consumption
		result = []
		for wh_name, racks in warehouses.items():
			rack_list = []
			for rack_id, rack_data in racks.items():
				rack_list.append({
					"rack_id": rack_data["rack_id"],
					"rack_location": rack_data["rack_location"],
					"rack_barcode": rack_data["rack_barcode"],
					"bin_count": len(rack_data["bins"]),
					"bins": rack_data["bins"]
				})
			
			result.append({
				"warehouse": wh_name,
				"racks": rack_list,
				"rack_count": len(rack_list),
				"total_bins": sum(r["bin_count"] for r in rack_list)
			})
		
		return {
			"success": True,
			"warehouse_filter": warehouse,
			"status_filter": status_filter,
			"data": result
		}
	
	except Exception as e:
		frappe.log_error(frappe.get_traceback(), "Get Bins Grouped By Rack Error")
		return {
			"success": False,
			"message": str(e)
		}
