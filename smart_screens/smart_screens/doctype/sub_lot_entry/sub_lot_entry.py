# Copyright (c) 2025, alphaworkz and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document

# Import utility functions
from smart_screens.smart_screens.utils.generate_barcode import generate_barcode_image
from smart_screens.smart_screens.utils.generate_batch import create_batch
from smart_screens.smart_screens.utils.stock_entry import create_stock_entry
from smart_screens.smart_screens.utils.uom_convertion import get_uom_details


class SubLotEntry(Document):
    def validate(self):
        """
        Perform validations before saving the Sub Lot Entry document.
        """
        # Validate that the lot number is not empty
        if not self.lot_number:
            frappe.throw("Lot Number is required.")

        # Validate that the batch number is not empty
        if not self.batch_number:
            frappe.throw("Batch Number is required.")

        # Validate that the warehouse is not empty
        if not self.warehouse:
            frappe.throw("Warehouse is required.")

        # Validate that the quantity is greater than zero
        if self.quantity <= 0:
            frappe.throw("Quantity must be greater than zero.")

        # Check if the batch exists in the specified warehouse
        batch_exists = frappe.db.exists(
            "Item Batch Stock Balance",
            {"batch_no": self.batch_number, "warehouse": self.warehouse}
        )
        if not batch_exists:
            frappe.throw(
                f"Batch {self.batch_number} does not exist in Warehouse {self.warehouse}."
            )

        # After validation, pass the data to the create_sub_lot function
        self.create_sub_lot()

    def create_sub_lot(self):
        """
        Create a sub-lot entry after validation.
        """
        # Logic to create the sub-lot entry
        try:
            # Example: Insert a new document in a custom doctype or perform other operations
            sub_lot_doc = frappe.get_doc({
                "doctype": "Sub Lot",
                "lot_number": self.lot_number,
                "batch_number": self.batch_number,
                "warehouse": self.warehouse,
                "quantity": self.quantity
            })
            sub_lot_doc.insert()
            frappe.msgprint(f"Sub Lot created successfully for Lot Number: {self.lot_number}")
        except Exception as e:
            frappe.throw(f"Failed to create Sub Lot: {str(e)}")
