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
		"""Check if FIFO is violated during checkout"""
		if not self.batch or not self.item_code:
			return
		
		# Get the earliest checked-in batch for this item in the warehouse
		earliest_batch = frappe.db.sql("""
SELECT 
bs.batch,
bs.check_in_time,
b.creation as batch_creation
FROM `tabBin Storage Status` bs
INNER JOIN `tabBatch` b ON bs.batch = b.name
WHERE 
bs.item_code = %s 
AND bs.warehouse = %s 
AND bs.status = 1
AND bs.name != %s
ORDER BY bs.check_in_time ASC
LIMIT 1
""", (self.item_code, self.warehouse, self.name), as_dict=1)
		
		if earliest_batch and self.check_in_time:
			earliest_time = get_datetime(earliest_batch[0].check_in_time)
			current_time = get_datetime(self.check_in_time)
			
			if current_time < earliest_time:
				# Current batch was checked in before the earliest batch still in warehouse
				self.remarks = (self.remarks or "") + "\nFIFO missed: Older batch(es) still in warehouse"
				frappe.msgprint(
f"FIFO Violation: Batch {earliest_batch[0].batch} was checked in earlier "
f"and is still in the warehouse",
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
