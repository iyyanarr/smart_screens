# Copyright (c) 2025, Aggregated Report and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document

class MouldingBatchConversion(Document):
	def validate(self):
		"""Validate and auto-populate fields"""
		# Fetch item details if not present
		if self.item_code and not self.item_name:
			item = frappe.get_cached_doc("Item", self.item_code)
			self.item_name = item.item_name
			self.item_group = item.item_group
		
		# Calculate conversion factor if we have the required data
		if self.cavities_per_cycle and self.shots and self.net_qty_kg:
			total_pieces = self.cavities_per_cycle * self.shots
			if self.net_qty_kg > 0:
				self.conversion_factor = total_pieces / self.net_qty_kg
		
		# Calculate nos if we have conversion factor and net qty
		if self.conversion_factor and self.net_qty_kg:
			self.calculated_nos = self.conversion_factor * self.net_qty_kg
	
	def before_save(self):
		"""Set default company if not present"""
		if not self.company:
			self.company = frappe.defaults.get_user_default("Company")
