# Copyright (c) 2023, Smart Screens and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document
from frappe.utils import flt

class StockReconciliationLog(Document):
	def before_save(self):
		# Calculate the difference automatically
		self.difference = flt(self.expected_qty) - flt(self.actual_qty)
		
		# Set the created_by field automatically
		if not self.created_by:
			self.created_by = frappe.session.user