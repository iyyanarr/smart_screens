# Copyright (c) 2025, Shree Polymer and Contributors
# See license.txt

import frappe
from frappe.tests.utils import FrappeTestCase


class TestOEEReasonCode(FrappeTestCase):
	"""Test cases for OEE Reason Code DocType"""
	
	def setUp(self):
		"""Set up test data"""
		# Clean up existing test records
		frappe.db.delete('OEE Reason Code', {'reason_code': ['like', 'TEST%']})
		frappe.db.commit()
	
	def test_reason_code_creation(self):
		"""Test creating a new reason code"""
		doc = frappe.new_doc('OEE Reason Code')
		doc.reason_code = 'TEST REASON'
		doc.category = 'Machine'
		doc.priority = 'High'
		doc.is_active = 1
		doc.insert()
		
		self.assertEqual(doc.reason_code, 'TEST REASON')
		self.assertEqual(doc.category, 'Machine')
		self.assertTrue(doc.is_active)
		
		# Clean up
		doc.delete()
	
	def test_auto_uppercase(self):
		"""Test that reason codes are automatically converted to uppercase"""
		doc = frappe.new_doc('OEE Reason Code')
		doc.reason_code = 'test lowercase'
		doc.category = 'Machine'
		doc.insert()
		
		self.assertEqual(doc.reason_code, 'TEST LOWERCASE')
		
		# Clean up
		doc.delete()
	
	def test_usage_count_increment(self):
		"""Test incrementing usage count"""
		from smart_screens.smart_screens.doctype.oee_reason_code.oee_reason_code import increment_usage_count
		
		# Create test reason code
		doc = frappe.new_doc('OEE Reason Code')
		doc.reason_code = 'TEST COUNT'
		doc.category = 'Machine'
		doc.usage_count = 0
		doc.insert()
		
		# Increment usage count
		increment_usage_count('TEST COUNT')
		
		# Reload and check
		doc.reload()
		self.assertEqual(doc.usage_count, 1)
		
		# Clean up
		doc.delete()
