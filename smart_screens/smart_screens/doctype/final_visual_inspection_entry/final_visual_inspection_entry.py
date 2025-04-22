# Copyright (c) 2025, alphaworkz and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document
from frappe.utils import nowdate, flt


class FinalVisualInspectionEntry(Document):
	def validate(self):
		if not self.lot_no:
			frappe.throw("Lot Number is required")
		
		# Validate sublot number format and existence
		# self.validate_sublot_number()
		
		# Check if all previous operations are completed
		# self.validate_previous_operations()
		
	def validate_sublot_number(self):
		"""Validate that the lot number exists and is properly formatted"""
		batch_exists = frappe.db.exists("Batch", self.lot_no)
		if not batch_exists:
			frappe.throw(f"Invalid Lot Number: {self.lot_no}. Batch does not exist in the system.")
		
		# Additional validations for lot number format can be added here if needed
	
	def validate_previous_operations(self):
		"""Check if all required previous operations from BOM are completed"""
		# Get the item code associated with the lot
		item_code = frappe.db.get_value("Batch", self.lot_no, "item")
		if not item_code:
			frappe.throw(f"No item associated with Lot Number: {self.lot_no}")
		
		self.item_code = item_code
		
		 # Use the BOM validation utility
		bom_response = check_uom_bom(item_code)
		
		if bom_response.get("status") != "success":
			frappe.throw(bom_response.get("message", f"Failed to validate BOM for item {item_code}"))
		
		self.bom_no = bom_response.get("bom")
		
		# Get all operations required by the BOM
		opera_con = "  AND BP.operation NOT IN ('PDIR','Final Visual Inspection') "
		bom_operations = frappe.db.sql("""
			SELECT BP.operation, BP.idx
			FROM `tabBOM Operation` BP 
			INNER JOIN `tabBOM` B ON BP.parent = B.name 
			WHERE B.is_default=1 AND B.is_active=1 AND B.name=%s {condition}
			ORDER BY BP.idx
		""".format(condition=opera_con), self.bom_no, as_dict=1)
		
		if not bom_operations:
			frappe.throw(f"No operations defined in BOM {self.bom_no}")
		
		# Get all operations already performed for this lot number
		completed_operations = frappe.db.sql("""
			SELECT DISTINCT operation_type
			FROM `tabLot Resource Tagging`
			WHERE scan_lot_no = %s AND docstatus = 1
		""", self.lot_no, as_dict=1)
		
		completed_op_types = [op.operation_type for op in completed_operations]
		
		# Check if the current inspection operation is next in sequence
		current_op_idx = None
		for op in bom_operations:
			if op.operation == self.operation_type:
				current_op_idx = op.idx
				break
		
		if current_op_idx is None:
			frappe.throw(f"Operation '{self.operation_type}' not found in BOM {self.bom_no}")
		
		# Check if all previous operations are completed
		for op in bom_operations:
			if op.idx < current_op_idx and op.operation not in completed_op_types:
				frappe.throw(f"Previous operation '{op.operation}' must be completed before '{self.operation_type}'")
	
	def on_submit(self):
		"""Create job card for the operation and submit"""
		# Create job card
		job_card_name = self.create_job_card()
		
		# Update the document with job card reference
		self.db_set("job_card", job_card_name)
		frappe.db.commit()
		
		frappe.msgprint(f"Job Card {job_card_name} created successfully!")
	
	def create_job_card(self):
		"""Create a job card for this inspection operation"""
		from smart_screens.smart_screens.utils.manufacturing import create_job_card
		
		# Get work order if one exists
		work_order = frappe.db.get_value("Work Order", 
			{"batch_no": self.lot_no, "production_item": self.item_code, "docstatus": 1}, 
			"name")
		
		if not work_order:
			frappe.throw(f"No submitted Work Order found for lot {self.lot_no} and item {self.item_code}")
		
		# If employees are assigned, prepare employee list
		employees = None
		if hasattr(self, 'inspector_id') and self.inspector_id:
			employees = [self.inspector_id]
		
		# Create job card
		job_card_name = create_job_card(
			work_order=work_order,
			operation=self.operation_type,
			for_quantity=flt(self.inspection_qty),
			employee=employees,
			batch_no=self.lot_no,
			sub_lot_number=self.lot_no,  # Using lot_no as sub_lot_number
			posting_date=self.inspection_date or nowdate()
		)
		
		return job_card_name


# Utility function for BOM validation
def check_uom_bom(item):
	"""
	Validate that an item has an active and default BOM and the proper UOM conversion.
	
	Args:
		item (str): The item code to validate.
		
	Returns:
		dict: A dictionary with status and relevant info about the BOM.
	"""
	try:
		bom = frappe.db.sql("""
			SELECT B.name, B.item 
			FROM `tabBOM Item` BI 
			INNER JOIN `tabBOM` B ON BI.parent = B.name 
			INNER JOIN `tabItem` I ON I.name=B.item  
			WHERE BI.item_code=%s AND B.is_active=1 AND I.default_bom=B.name
		""", {"item_code": item}, as_dict=1)
		
		if bom:
			# Multi BOM Validation
			bom__ = frappe.db.sql("""
				SELECT B.name, B.item 
				FROM `tabBOM` B 
				WHERE B.item=%s AND B.is_Active=1
			""", {"bom_item": bom[0].item}, as_dict=1)
			
			if len(bom__) > 1:
				return {"status": "failed", "message": f"Multiple BOMs found for Item to Produce - <b>{bom[0].item}</b>"}
			
			return {"status": "success", "bom": bom[0].name, "item": bom[0].item}
		else:
			return {"status": "failed", "message": f"No BOM found associated with the item <b>{item}</b>"}
	except Exception as e:
		frappe.log_error(message=frappe.get_traceback(), 
						title="smart_screens.smart_screens.doctype.final_visual_inspection_entry.final_visual_inspection_entry.check_uom_bom")
		return {"status": "failed", "message": "Something went wrong during BOM validation"}


@frappe.whitelist()
def inspection_resource_validation(lot_no):
	"""Returns all Lot Resource Tagging docs where scan_lot_no matches the lot_no"""
	return frappe.get_all(
		"Lot Resource Tagging",
		filters={"scan_lot_no": lot_no, "docstatus": 1},
		fields=["name", "scan_lot_no", "product_ref", "batch_no", "operator_id", "operation_type", "posting_date"]
	)
