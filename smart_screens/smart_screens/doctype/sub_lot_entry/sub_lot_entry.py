# Copyright (c) 2025, alphaworkz and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import flt

# Import utility functions
from smart_screens.smart_screens.utils.generate_barcode import generate_barcode_image
from smart_screens.smart_screens.utils.generate_batch import create_batch
from smart_screens.smart_screens.utils.stock_entry import create_stock_entry
from smart_screens.smart_screens.utils.uom_convertion import get_uom_details


class SubLotEntry(Document):
    """
    SubLotEntry DocType for managing sub-lot creation from a parent batch.
    
    This document allows creating sub-lots with unique identifiers from a parent batch,
    including generating barcodes and creating necessary stock entries.
    """
    
    def validate(self):
        """
        Perform validations before saving the Sub Lot Entry document:
        - Check for required fields
        - Validate numeric values
        - Ensure proper relationships between fields
        """
        self.validate_required_fields()
        self.validate_numeric_values()
        self.validate_warehouses()
        
    def validate_required_fields(self):
        """Validate that all required fields are provided."""
        required_fields = {
            "batch": _("Source Batch Number"),
            "sublot_number": _("Sub Lot Number"),
            "sublot_qty": _("Sub Lot Quantity"),
            "source_warehouse": _("Source Warehouse"),
            "target_warehouse": _("Target Warehouse"),
            "item_code": _("Item Code")
        }
        
        for field, label in required_fields.items():
            if not self.get(field):
                frappe.throw(_("{0} is required").format(label))
    
    def validate_numeric_values(self):
        """Validate that all numeric values are positive."""
        numeric_fields = {
            "sublot_qty": _("Sub Lot Quantity"),
            "batch_qty": _("Batch Quantity")
        }
        
        for field, label in numeric_fields.items():
            value = flt(self.get(field))
            if value <= 0:
                frappe.throw(_("{0} must be greater than zero").format(label))
            
            # Update the field with the formatted float value
            self.set(field, value)
        
        # Ensure sub-lot quantity doesn't exceed batch quantity
        if flt(self.sublot_qty) > flt(self.batch_qty):
            frappe.throw(_("Sub Lot Quantity cannot exceed Batch Quantity"))
    
    def validate_warehouses(self):
        """Validate warehouse-related conditions."""
        if self.source_warehouse == self.target_warehouse:
            frappe.msgprint(
                _("Source and Target Warehouse are the same. Consider using different warehouses."),
                indicator="orange", 
                alert=True
            )
    
    def on_submit(self):
        """
        Actions to perform when the document is submitted:
        - Update stock entry status
        - Log the operation
        """
        if self.stockentry_ref:
            # Update any associated references
            frappe.db.set_value("Stock Entry", self.stockentry_ref, "sub_lot_entry", self.name)
            frappe.db.commit()
    


