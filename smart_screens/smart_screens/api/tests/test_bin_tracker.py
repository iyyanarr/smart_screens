# Copyright (c) 2025, Alphaworkz and Contributors
# See license.txt

import frappe
from frappe.tests.utils import FrappeTestCase
from smart_screens.smart_screens.api.bin_tracker import (
	get_product_batch_from_stripped,
	check_in_batch,
	check_out_batch,
	validate_barcode,
	validate_check_in_inputs,
	validate_check_out_inputs,
	find_product_by_item,
	find_product_by_batch,
	get_bin_status_summary,
	get_rack_contents
)


class TestBinTracker(FrappeTestCase):
	"""Test cases for Bin Tracker API functions"""
	
	@classmethod
	def setUpClass(cls):
		"""Set up test data before running tests"""
		super().setUpClass()
		cls.setup_test_data()
	
	@classmethod
	def setup_test_data(cls):
		"""Create test data for bin tracker tests"""
		# Create test item in Products item group
		if not frappe.db.exists("Item", "TEST-PRODUCT-001"):
			test_item = frappe.get_doc({
				"doctype": "Item",
				"item_code": "TEST-PRODUCT-001",
				"item_name": "Test Product 001",
				"item_group": "Products",
				"stock_uom": "Nos",
				"is_stock_item": 1,
				"gst_hsn_code": "40169320"  # Valid HSN code for rubber products
			})
			test_item.insert(ignore_permissions=True)
		
		# Create test warehouse - use existing warehouse instead of creating new one
		# Check if test warehouse exists, if not use an existing warehouse
		test_warehouse_name = None
		if frappe.db.exists("Warehouse", "Test Warehouse - SPP INDIA"):
			test_warehouse_name = "Test Warehouse - SPP INDIA"
		else:
			# Get any existing warehouse for testing
			existing_warehouse = frappe.db.get_value("Warehouse", {"company": "SPP", "is_group": 0}, "name")
			if existing_warehouse:
				test_warehouse_name = existing_warehouse
			else:
				# Create warehouse with proper naming
				test_warehouse = frappe.get_doc({
					"doctype": "Warehouse",
					"warehouse_name": "Test Warehouse",
					"company": "SPP",
					"is_group": 0
				})
				test_warehouse.insert(ignore_permissions=True)
				test_warehouse_name = test_warehouse.name
		
		# Store warehouse name for use in tests
		cls.test_warehouse_name = test_warehouse_name
		
		# Create test rack
		if not frappe.db.exists("Rack Location Master", "TEST-RACK-001"):
			test_rack = frappe.get_doc({
				"doctype": "Rack Location Master",
				"rack_id": "TEST-RACK-001",
				"barcode": "RACK001",
				"warehouse_name": test_warehouse_name,
				"docstatus": 1
			})
			test_rack.insert(ignore_permissions=True)
			test_rack.submit()
		
		# Create test batch
		if not frappe.db.exists("Batch", "P25T01X01"):
			test_batch = frappe.get_doc({
				"doctype": "Batch",
				"batch_id": "P25T01X01",
				"item": "TEST-PRODUCT-001",
				"batch_qty": 100
			})
			test_batch.insert(ignore_permissions=True)
		
		# Create test stock entry with mix_barcode
		if not frappe.db.exists("Stock Entry", "TEST-MFG-001"):
			stock_entry = frappe.get_doc({
				"doctype": "Stock Entry",
				"name": "TEST-MFG-001",
				"stock_entry_type": "Manufacture",
				"company": "SPP",
				"docstatus": 1
			})
			stock_entry.insert(ignore_permissions=True)
			
			# Add stock entry detail with mix_barcode
			stock_entry_detail = frappe.get_doc({
				"doctype": "Stock Entry Detail",
				"parent": "TEST-MFG-001",
				"parenttype": "Stock Entry",
				"parentfield": "items",
				"item_code": "TEST-PRODUCT-001",
				"item_group": "Products",
				"batch_no": "P25T01X01",
				"mix_barcode": "25T01X01",
				"spp_batch_number": "25T01X01",
				"is_finished_item": 1,
				"qty": 100
			})
			stock_entry_detail.insert(ignore_permissions=True)
		
		frappe.db.commit()
	
	def test_get_product_batch_from_stripped_valid_stripped(self):
		"""Test converting stripped batch number to full batch"""
		result = get_product_batch_from_stripped("25T01X01")
		
		self.assertTrue(result["success"])
		self.assertEqual(result["batch_no"], "P25T01X01")
		self.assertEqual(result["item_code"], "TEST-PRODUCT-001")
		self.assertIn(result["item_group"], ["Products", "Finished Product"])
	
	def test_get_product_batch_from_stripped_full_batch(self):
		"""Test with full batch number already having P prefix"""
		result = get_product_batch_from_stripped("P25T01X01")
		
		self.assertTrue(result["success"])
		self.assertEqual(result["batch_no"], "P25T01X01")
		self.assertEqual(result["item_code"], "TEST-PRODUCT-001")
	
	def test_get_product_batch_from_stripped_invalid(self):
		"""Test with invalid batch number"""
		result = get_product_batch_from_stripped("INVALID99X99")
		
		self.assertFalse(result["success"])
		self.assertIn("not found", result["message"])
	
	def test_get_product_batch_from_stripped_non_product(self):
		"""Test that non-product batches are rejected"""
		# Create a batch for a non-product item
		if not frappe.db.exists("Item", "TEST-MATERIAL-001"):
			test_material = frappe.get_doc({
				"doctype": "Item",
				"item_code": "TEST-MATERIAL-001",
				"item_name": "Test Material",
				"item_group": "Raw Material",
				"stock_uom": "Kg",
				"gst_hsn_code": "40011000"  # Valid HSN code for raw materials
			})
			test_material.insert(ignore_permissions=True)
		
		if not frappe.db.exists("Batch", "T25M01X01"):
			material_batch = frappe.get_doc({
				"doctype": "Batch",
				"batch_id": "T25M01X01",
				"item": "TEST-MATERIAL-001"
			})
			material_batch.insert(ignore_permissions=True)
		
		result = get_product_batch_from_stripped("T25M01X01")
		
		self.assertFalse(result["success"])
		self.assertIn("not a Product", result["message"])
	
	def test_check_in_batch_success(self):
		"""Test successful batch check-in"""
		result = check_in_batch("25T01X01", "TEST-RACK-001")
		
		self.assertTrue(result["success"])
		self.assertEqual(result["message"], "Check-In Done")
		self.assertEqual(result["item_code"], "TEST-PRODUCT-001")
		self.assertEqual(result["full_batch"], "P25T01X01")
		self.assertEqual(result["stripped_batch"], "25T01X01")
		self.assertEqual(result["warehouse"], self.test_warehouse_name)
		self.assertIsNotNone(result["doc_name"])
		
		# Cleanup: Delete created bin storage status
		if result.get("doc_name"):
			frappe.delete_doc("Bin Storage Status", result["doc_name"], force=1)
			frappe.db.commit()
	
	def test_check_in_batch_invalid_batch(self):
		"""Test check-in with invalid batch"""
		result = check_in_batch("INVALID99", "TEST-RACK-001")
		
		self.assertFalse(result["success"])
		self.assertIn("not found", result["message"])
	
	def test_check_in_batch_invalid_rack(self):
		"""Test check-in with invalid rack"""
		result = check_in_batch("25T01X01", "INVALID-RACK")
		
		self.assertFalse(result["success"])
	
	def test_check_out_batch_success(self):
		"""Test successful batch check-out"""
		# First check in the batch
		check_in_result = check_in_batch("25T01X01", "TEST-RACK-001")
		self.assertTrue(check_in_result["success"])
		
		# Now check out
		checkout_result = check_out_batch("25T01X01", "TEST-RACK-001")
		
		self.assertTrue(checkout_result["success"])
		self.assertEqual(checkout_result["message"], "Check-Out Complete")
		self.assertEqual(checkout_result["full_batch"], "P25T01X01")
		self.assertEqual(checkout_result["warehouse"], self.test_warehouse_name)
		
		# Cleanup
		if check_in_result.get("doc_name"):
			frappe.delete_doc("Bin Storage Status", check_in_result["doc_name"], force=1)
			frappe.db.commit()
	
	def test_check_out_batch_not_checked_in(self):
		"""Test check-out when batch is not checked in"""
		result = check_out_batch("25T01X01", "TEST-RACK-001")
		
		self.assertFalse(result["success"])
		self.assertIn("No checked-in record", result["message"])
	
	def test_validate_barcode_rack(self):
		"""Test barcode validation for rack barcode"""
		result = validate_barcode("RACK001")
		
		self.assertTrue(result["success"])
		self.assertEqual(result["type"], "rack")
		self.assertEqual(result["warehouse"], self.test_warehouse_name)
		self.assertEqual(result["barcode"], "RACK001")
	
	def test_validate_barcode_batch(self):
		"""Test barcode validation for batch barcode (stripped)"""
		result = validate_barcode("25T01X01")
		
		self.assertTrue(result["success"])
		self.assertEqual(result["type"], "batch")
		self.assertEqual(result["item_code"], "TEST-PRODUCT-001")
	
	def test_validate_barcode_invalid(self):
		"""Test barcode validation for invalid barcode"""
		result = validate_barcode("INVALID-BARCODE-999")
		
		self.assertFalse(result["success"])
		self.assertIn("Invalid barcode", result["message"])
	
	def test_validate_check_in_inputs_both_valid(self):
		"""Test validation when both batch and rack are valid"""
		result = validate_check_in_inputs("25T01X01", "TEST-RACK-001")
		
		self.assertTrue(result["batch_valid"])
		self.assertTrue(result["rack_valid"])
		self.assertTrue(result["can_submit"])
		self.assertEqual(result["full_batch"], "P25T01X01")
		self.assertEqual(result["warehouse"], self.test_warehouse_name)
	
	def test_validate_check_in_inputs_invalid_batch(self):
		"""Test validation with invalid batch"""
		result = validate_check_in_inputs("INVALID99", "TEST-RACK-001")
		
		self.assertFalse(result["batch_valid"])
		self.assertTrue(result["rack_valid"])
		self.assertFalse(result["can_submit"])
	
	def test_validate_check_in_inputs_invalid_rack(self):
		"""Test validation with invalid rack"""
		result = validate_check_in_inputs("25T01X01", "INVALID-RACK")
		
		self.assertTrue(result["batch_valid"])
		self.assertFalse(result["rack_valid"])
		self.assertFalse(result["can_submit"])
	
	def test_validate_check_out_inputs_batch_checked_in(self):
		"""Test check-out validation when batch is checked in"""
		# First check in the batch
		check_in_result = check_in_batch("25T01X01", "TEST-RACK-001")
		self.assertTrue(check_in_result["success"])
		
		# Validate check-out inputs
		result = validate_check_out_inputs("25T01X01", "TEST-RACK-001")
		
		self.assertTrue(result["batch_valid"])
		self.assertTrue(result["rack_valid"])
		self.assertTrue(result["can_submit"])
		self.assertEqual(result["full_batch"], "P25T01X01")
		
		# Cleanup
		if check_in_result.get("doc_name"):
			frappe.delete_doc("Bin Storage Status", check_in_result["doc_name"], force=1)
			frappe.db.commit()
	
	def test_validate_check_out_inputs_batch_not_checked_in(self):
		"""Test check-out validation when batch is not checked in"""
		result = validate_check_out_inputs("25T01X01", "TEST-RACK-001")
		
		self.assertFalse(result["batch_valid"])
		self.assertIn("not checked in", result["batch_message"])
	
	def test_validate_check_out_inputs_wrong_rack(self):
		"""Test check-out validation with batch in different rack"""
		# Create another rack
		if not frappe.db.exists("Rack Location Master", "TEST-RACK-002"):
			test_rack2 = frappe.get_doc({
				"doctype": "Rack Location Master",
				"rack_id": "TEST-RACK-002",
				"barcode": "RACK002",
				"warehouse_name": self.test_warehouse_name,
				"docstatus": 1
			})
			test_rack2.insert(ignore_permissions=True)
			test_rack2.submit()
		
		# Check in to RACK-001
		check_in_result = check_in_batch("25T01X01", "TEST-RACK-001")
		self.assertTrue(check_in_result["success"])
		
		# Try to check out from RACK-002
		result = validate_check_out_inputs("25T01X01", "TEST-RACK-002")
		
		self.assertFalse(result["batch_valid"])
		self.assertIn("another rack", result["batch_message"])
		
		# Cleanup
		if check_in_result.get("doc_name"):
			frappe.delete_doc("Bin Storage Status", check_in_result["doc_name"], force=1)
			frappe.db.commit()
	
	def test_find_product_by_item_with_warehouse(self):
		"""Test finding product by item code in specific warehouse"""
		# Check in a batch first
		check_in_result = check_in_batch("25T01X01", "TEST-RACK-001")
		self.assertTrue(check_in_result["success"])
		
		# Find product
		result = find_product_by_item("TEST-PRODUCT-001", self.test_warehouse_name)
		
		self.assertTrue(result["success"])
		self.assertEqual(result["item_code"], "TEST-PRODUCT-001")
		self.assertIsNotNone(result["fifo_batch"])
		self.assertEqual(result["fifo_batch"]["batch"], "P25T01X01")
		
		# Cleanup
		if check_in_result.get("doc_name"):
			frappe.delete_doc("Bin Storage Status", check_in_result["doc_name"], force=1)
			frappe.db.commit()
	
	def test_find_product_by_item_all_warehouses(self):
		"""Test finding product across all warehouses"""
		# Check in a batch first
		check_in_result = check_in_batch("25T01X01", "TEST-RACK-001")
		self.assertTrue(check_in_result["success"])
		
		# Find product without specifying warehouse
		result = find_product_by_item("TEST-PRODUCT-001")
		
		self.assertTrue(result["success"])
		self.assertEqual(result["item_code"], "TEST-PRODUCT-001")
		self.assertIsNotNone(result["fifo_batch"])
		
		# Cleanup
		if check_in_result.get("doc_name"):
			frappe.delete_doc("Bin Storage Status", check_in_result["doc_name"], force=1)
			frappe.db.commit()
	
	def test_find_product_by_batch_stripped(self):
		"""Test finding product location by stripped batch number"""
		# Check in a batch first
		check_in_result = check_in_batch("25T01X01", "TEST-RACK-001")
		self.assertTrue(check_in_result["success"])
		
		# Find by stripped batch
		result = find_product_by_batch("25T01X01")
		
		self.assertTrue(result["success"])
		self.assertEqual(result["batch"], "P25T01X01")
		self.assertEqual(result["stripped_batch"], "25T01X01")
		self.assertEqual(result["item_code"], "TEST-PRODUCT-001")
		self.assertGreater(result["location_count"], 0)
		
		# Cleanup
		if check_in_result.get("doc_name"):
			frappe.delete_doc("Bin Storage Status", check_in_result["doc_name"], force=1)
			frappe.db.commit()
	
	def test_get_bin_status_summary_with_warehouse(self):
		"""Test getting bin status summary for specific warehouse"""
		# Check in a batch first
		check_in_result = check_in_batch("25T01X01", "TEST-RACK-001")
		self.assertTrue(check_in_result["success"])
		
		# Get summary
		result = get_bin_status_summary(self.test_warehouse_name)
		
		self.assertTrue(result["success"])
		self.assertEqual(result["warehouse"], self.test_warehouse_name)
		self.assertGreaterEqual(result["total_items"], 1)
		
		# Cleanup
		if check_in_result.get("doc_name"):
			frappe.delete_doc("Bin Storage Status", check_in_result["doc_name"], force=1)
			frappe.db.commit()
	
	def test_get_bin_status_summary_all_warehouses(self):
		"""Test getting bin status summary across all warehouses"""
		# Check in a batch first
		check_in_result = check_in_batch("25T01X01", "TEST-RACK-001")
		self.assertTrue(check_in_result["success"])
		
		# Get summary without warehouse
		result = get_bin_status_summary()
		
		self.assertTrue(result["success"])
		self.assertIsNone(result["warehouse"])
		self.assertGreaterEqual(result["total_items"], 0)
		
		# Cleanup
		if check_in_result.get("doc_name"):
			frappe.delete_doc("Bin Storage Status", check_in_result["doc_name"], force=1)
			frappe.db.commit()
	
	def test_get_rack_contents(self):
		"""Test getting contents of a specific rack"""
		# Check in a batch first
		check_in_result = check_in_batch("25T01X01", "TEST-RACK-001")
		self.assertTrue(check_in_result["success"])
		
		# Get rack contents
		result = get_rack_contents("TEST-RACK-001")
		
		self.assertTrue(result["success"])
		self.assertEqual(result["rack_id"], "TEST-RACK-001")
		self.assertEqual(result["warehouse"], self.test_warehouse_name)
		self.assertGreaterEqual(result["batch_count"], 1)
		
		# Check that our batch is in the results
		batch_found = any(b["batch"] == "P25T01X01" for b in result["batches"])
		self.assertTrue(batch_found)
		
		# Cleanup
		if check_in_result.get("doc_name"):
			frappe.delete_doc("Bin Storage Status", check_in_result["doc_name"], force=1)
			frappe.db.commit()
	
	def test_get_rack_contents_invalid_rack(self):
		"""Test getting contents of invalid rack"""
		result = get_rack_contents("INVALID-RACK-999")
		
		self.assertFalse(result["success"])
		self.assertIn("does not exist", result["message"])
	
	def test_fifo_ordering(self):
		"""Test that FIFO ordering works correctly (batch creation, then check-in time)"""
		# This would require creating multiple batches and checking in at different times
		# For now, we'll just verify the basic functionality
		check_in_result = check_in_batch("25T01X01", "TEST-RACK-001")
		self.assertTrue(check_in_result["success"])
		
		# Find product and verify FIFO batch is returned
		result = find_product_by_item("TEST-PRODUCT-001", self.test_warehouse_name)
		
		self.assertTrue(result["success"])
		self.assertIsNotNone(result["fifo_batch"])
		
		# Cleanup
		if check_in_result.get("doc_name"):
			frappe.delete_doc("Bin Storage Status", check_in_result["doc_name"], force=1)
			frappe.db.commit()
	
	@classmethod
	def tearDownClass(cls):
		"""Clean up test data after all tests"""
		# Clean up test documents
		frappe.db.sql("DELETE FROM `tabBin Storage Status` WHERE item_code = 'TEST-PRODUCT-001'")
		frappe.db.commit()
		
		super().tearDownClass()
