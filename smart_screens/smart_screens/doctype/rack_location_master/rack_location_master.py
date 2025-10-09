# Copyright (c) 2025, Alphaworkz and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document
import barcode
from barcode.writer import ImageWriter
from io import BytesIO


class RackLocationMaster(Document):
	def before_save(self):
		"""Generate barcode text before saving"""
		if self.warehouse_name and self.rack_id:
			self.barcode = f"{self.warehouse_name}-{self.rack_id}"
	
	def on_update(self):
		"""Generate barcode image after document is saved"""
		if self.warehouse_name and self.rack_id and not self.barcode_image:
			try:
				barcode_image_url = self._generate_and_save_barcode()
				if barcode_image_url:
					# Update the barcode_image field without triggering another save
					frappe.db.set_value("Rack Location Master", self.name, "barcode_image", barcode_image_url, update_modified=False)
					self.barcode_image = barcode_image_url
			except Exception as e:
				frappe.log_error(f"Error generating barcode image: {str(e)}", "Rack Location Barcode Generation")
	
	def _generate_and_save_barcode(self):
		"""Generate barcode and save as file"""
		if not self.barcode:
			return None
		
		try:
			# Generate the barcode using Code128 format
			barcode_class = barcode.get_barcode_class('code128')
			barcode_instance = barcode_class(self.barcode, writer=ImageWriter())
			
			# Save the barcode image to a BytesIO object
			barcode_buffer = BytesIO()
			barcode_instance.write(barcode_buffer)
			barcode_buffer.seek(0)
			
			# Create a unique filename
			filename = f"barcode_{self.barcode.replace('/', '_').replace(' ', '_')}.png"
			
			 # Use save_file method for better file handling
			_file = frappe.get_doc({
				"doctype": "File",
				"file_name": filename,
				"content": barcode_buffer.read(),
				"is_private": 0,
				"attached_to_doctype": "Rack Location Master",
				"attached_to_name": self.name
			})
			_file.save(ignore_permissions=True)
			frappe.db.commit()
			
			return _file.file_url
			
		except Exception as e:
			frappe.log_error(f"Error generating barcode: {str(e)}", "Rack Location Barcode Generation")
			return None
	
	def validate(self):
		"""Validate the rack location"""
		# Check for duplicate Rack ID in same warehouse
		if not self.is_new():
			existing = frappe.db.exists(
				"Rack Location Master",
				{
					"warehouse_name": self.warehouse_name,
					"rack_id": self.rack_id,
					"name": ["!=", self.name],
					"docstatus": ["!=", 2]
				}
			)
			if existing:
				frappe.throw(f"Rack ID {self.rack_id} already exists in warehouse {self.warehouse_name}")
		else:
			existing = frappe.db.exists(
				"Rack Location Master",
				{
					"warehouse_name": self.warehouse_name,
					"rack_id": self.rack_id,
					"docstatus": ["!=", 2]
				}
			)
			if existing:
				frappe.throw(f"Rack ID {self.rack_id} already exists in warehouse {self.warehouse_name}")


@frappe.whitelist()
def regenerate_barcode(docname):
	"""
	Regenerate barcode for a specific Rack Location Master document.
	
	Args:
		docname (str): The name of the Rack Location Master document
		
	Returns:
		dict: Success status and new barcode image
	"""
	try:
		doc = frappe.get_doc("Rack Location Master", docname)
		
		if doc.warehouse_name and doc.rack_id:
			doc.barcode = f"{doc.warehouse_name}-{doc.rack_id}"
			doc.barcode_image = doc._generate_and_save_barcode()
			doc.save(ignore_permissions=True)
			
			return {
				"status": "success",
				"message": "Barcode regenerated successfully",
				"barcode": doc.barcode,
				"barcode_image": doc.barcode_image
			}
		else:
			frappe.throw("Warehouse Name and Rack ID are required to generate barcode")
			
	except Exception as e:
		frappe.log_error(f"Error regenerating barcode: {str(e)}", "Rack Location Barcode Regeneration")
		return {
			"status": "error",
			"message": str(e)
		}
