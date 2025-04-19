# Copyright (c) 2025, alphaworkz and contributors
# For license information, please see license.txt

from frappe.model.document import Document
import frappe
from frappe import _

class SubLotEntry(Document):
    """
    SubLotEntry DocType for managing sub-lot creation from a parent batch.
    
    This document allows creating sub-lots with unique identifiers from a parent batch,
    including generating barcodes and creating necessary stock entries.
    """
    
    def validate(self):
        """
        Validations handled in frontend, pass through here.
        """
        pass

