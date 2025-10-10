# Copyright (c) 2025, Alphaworkz and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document
from frappe.utils import now_datetime, get_datetime


class BinStorageStatus(Document):
	def validate(self):
		"""Validate the bin storage status"""
		# Validate batch exists and belongs to the warehouse
		self.validate_batch()
		
		# Auto-fetch item code from batch if not set
		if self.batch and not self.item_code:
			self.item_code = frappe.db.get_value("Batch", self.batch, "item")
		
		# Validate rack belongs to the same warehouse
		self.validate_rack_warehouse()
	
	def before_save(self):
		"""Set timestamps before saving"""
		# If status is 1 (checked in) and check_in_time is not set
		if self.status == 1 and not self.check_in_time:
			self.check_in_time = now_datetime()
		
		# If status is 0 (checked out) and check_out_time is not set
		if self.status == 0 and not self.check_out_time:
			self.check_out_time = now_datetime()
			# Check FIFO violation when checking out
			self.check_fifo_violation()
	
	def validate_batch(self):
		"""Validate that the batch exists and has stock in the warehouse"""
		if not frappe.db.exists("Batch", self.batch):
			frappe.throw(f"Batch {self.batch} does not exist")
		
		# Check if batch has stock in the warehouse
		batch_qty = frappe.db.sql("""
SELECT SUM(actual_qty) as qty
FROM `tabStock Ledger Entry`
WHERE batch_no = %s AND warehouse = %s
""", (self.batch, self.warehouse), as_dict=1)
		
		if batch_qty and batch_qty[0].qty and batch_qty[0].qty <= 0:
			frappe.msgprint(
f"Warning: Batch {self.batch} has no stock in warehouse {self.warehouse}",
indicator='orange',
alert=True
)
	
	def validate_rack_warehouse(self):
		"""Validate that the rack belongs to the same warehouse"""
		if self.rack_id:
			rack_warehouse = frappe.db.get_value("Rack Location Master", self.rack_id, "warehouse_name")
			if rack_warehouse != self.warehouse:
				frappe.throw(
f"Rack {self.rack_id} belongs to warehouse {rack_warehouse}, "
f"but you are trying to use it in {self.warehouse}"
)
	
	def check_fifo_violation(self):
		"""
		Check if FIFO is violated during checkout
		Uses Two-Level FIFO:
		1. Level 1: Batch creation date (ERPNext FIFO)
		2. Level 2: Check-in time (for bins of same batch)
		"""
		if not self.batch or not self.item_code:
			return
		
		# Get the batch being checked out
		current_batch_creation = frappe.db.get_value("Batch", self.batch, "creation")
		
		# Find any older batches (by creation date) still checked in for this item
		older_batches = frappe.db.sql("""
			SELECT 
				bs.batch,
				b.creation as batch_creation,
				rlm.barcode as rack_barcode
			FROM `tabBin Storage Status` bs
			INNER JOIN `tabBatch` b ON bs.batch = b.name
			LEFT JOIN `tabRack Location Master` rlm ON bs.rack_id = rlm.name
			WHERE 
				bs.item_code = %s 
				AND bs.warehouse = %s 
				AND bs.status = 1
				AND bs.name != %s
				AND b.creation < %s
			ORDER BY b.creation ASC
			LIMIT 1
		""", (self.item_code, self.warehouse, self.name, current_batch_creation), as_dict=1)
		
		if older_batches:
			oldest_batch = older_batches[0]
			self.remarks = (self.remarks or "") + f"\nFIFO Violation: Older batch {oldest_batch.batch} (created {oldest_batch.batch_creation}) still in warehouse"
			frappe.msgprint(
				f"FIFO Violation: Batch {oldest_batch.batch} was created earlier ({oldest_batch.batch_creation}) "
				f"and is still in the warehouse at {oldest_batch.rack_barcode}",
				indicator='red',
				alert=True
			)


@frappe.whitelist()
def check_in_batch(batch, rack_id, warehouse="U1 SFG - SPP"):
	"""API method to check in a batch to a rack location"""
	try:
		# Validate inputs
		if not batch or not rack_id:
			frappe.throw("Batch and Rack ID are required")
		
		# Get item code from batch
		item_code = frappe.db.get_value("Batch", batch, "item")
		if not item_code:
			frappe.throw(f"Invalid batch: {batch}")
		
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
			"doc_name": doc.name
		}
	
	except Exception as e:
		frappe.db.rollback()
		return {
			"success": False,
			"message": str(e)
		}


@frappe.whitelist()
def check_out_batch(batch, rack_id, warehouse="U1 SFG - SPP"):
	"""API method to check out a batch from a rack location"""
	try:
		# Validate inputs
		if not batch or not rack_id:
			frappe.throw("Batch and Rack ID are required")
		
		# Find the checked-in record
		records = frappe.get_all(
"Bin Storage Status",
filters={
"batch": batch,
"rack_id": rack_id,
"warehouse": warehouse,
"status": 1
},
order_by="check_in_time ASC",
limit=1
)
		
		if not records:
			frappe.throw(f"No checked-in record found for Batch {batch} in Rack {rack_id}")
		
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
			"doc_name": doc.name
		}
	
	except Exception as e:
		frappe.db.rollback()
		return {
			"success": False,
			"message": str(e)
		}
