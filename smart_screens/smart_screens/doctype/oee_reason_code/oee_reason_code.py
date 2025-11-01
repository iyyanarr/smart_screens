# Copyright (c) 2025, Shree Polymer and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document


class OEEReasonCode(Document):
	"""
OEE Reason Code DocType
Manages reason codes for OEE Dashboard CAR generation
"""
	
	def validate(self):
		"""Validate the reason code before saving"""
		# Ensure reason code is uppercase and trimmed
		if self.reason_code:
			self.reason_code = self.reason_code.strip().upper()
		
		# Set default sort order if not provided
		if not self.sort_order:
			self.sort_order = self.get_next_sort_order()
	
	def get_next_sort_order(self):
		"""Get the next available sort order number"""
		result = frappe.db.sql("""
SELECT MAX(sort_order) as max_order
FROM `tabOEE Reason Code`
""", as_dict=True)
		
		max_order = result[0].get('max_order') if result else 0
		return (max_order or 0) + 1
	
	def on_update(self):
		"""Clear cache when reason code is updated"""
		frappe.cache().delete_value('oee_reason_codes')
	
	def on_trash(self):
		"""Clear cache when reason code is deleted"""
		frappe.cache().delete_value('oee_reason_codes')


@frappe.whitelist()
def get_active_reason_codes(category=None):
	"""
Get list of active reason codes

Args:
category (str, optional): Filter by category

Returns:
list: List of active reason codes
"""
	filters = {'is_active': 1}
	if category:
		filters['category'] = category
	
	reason_codes = frappe.get_all(
'OEE Reason Code',
filters=filters,
fields=['reason_code', 'category', 'priority', 'color_code', 'sort_order'],
order_by='sort_order asc, reason_code asc'
)
	
	return reason_codes


@frappe.whitelist()
def increment_usage_count(reason_code):
	"""
Increment the usage count for a reason code

Args:
reason_code (str): The reason code to increment
"""
	try:
		doc = frappe.get_doc('OEE Reason Code', reason_code)
		doc.usage_count = (doc.usage_count or 0) + 1
		doc.save(ignore_permissions=True)
		frappe.db.commit()
	except Exception as e:
		frappe.log_error(f"Error incrementing usage count for {reason_code}: {str(e)}", 
"OEE Reason Code Usage")
