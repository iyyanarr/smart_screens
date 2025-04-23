# Copyright (c) 2025, Smart Screens and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document

class ProcessTracker(Document):
    def before_save(self):
        # Set creation time if not already set
        if not self.creation_time:
            self.creation_time = frappe.utils.now_datetime()
            
        # Set created_by if not already set
        if not self.created_by:
            self.created_by = frappe.session.user