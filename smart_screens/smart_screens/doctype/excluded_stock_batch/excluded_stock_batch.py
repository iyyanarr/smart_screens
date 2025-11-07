# Copyright (c) 2025, Smart Screens and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document


class ExcludedStockBatch(Document):
	def before_save(self):
		# Auto-set excluded_by to current user
		if not self.excluded_by:
			self.excluded_by = frappe.session.user
	
	def validate(self):
		# Validate batch exists
		if not frappe.db.exists("Batch", self.batch_no):
			frappe.throw(f"Batch {self.batch_no} does not exist")
		
		# Check for duplicates
		if self.is_new():
			existing = frappe.db.exists("Excluded Stock Batch", {
				"batch_no": self.batch_no,
				"status": "Active",
				"name": ("!=", self.name)
			})
			if existing:
				frappe.throw(f"Batch {self.batch_no} is already in the exclusion list")
