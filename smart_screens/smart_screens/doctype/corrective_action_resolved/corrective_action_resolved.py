import frappe
from frappe.model.document import Document
from frappe.utils import flt, today, nowdate

class CorrectiveActionResolved(Document):
    """
    Corrective Action Resolved DocType
    Stores root cause analysis and resolution for ONE production entry
    """
    
    def validate(self):
        """Validation on save"""
        # Validate Why Analysis - must have exactly 5 rows
        if self.why_analysis:
            if len(self.why_analysis) != 5:
                frappe.throw("Why Analysis must have exactly 5 rows")
        
        # Validate at least one corrective action
        if not self.corrective_actions or len(self.corrective_actions) == 0:
            frappe.throw("At least one Corrective Action is required")
    
    def before_save(self):
        """Called before saving"""
        # Set resolved_by if not set
        if not self.resolved_by:
            self.resolved_by = frappe.session.user
        
        # Set resolved_date if not set
        if not self.resolved_date:
            self.resolved_date = today()
    
    def after_insert(self):
        """Called after document is created"""
        # Update the parent CAR Unresolved record
        self.update_parent_car_status()
    
    def update_parent_car_status(self):
        """Update the parent CAR Unresolved production record status"""
        if not self.parent_car_unresolved or not self.production_entry:
            return
        
        try:
            # Get parent CAR document
            parent_car = frappe.get_doc("Corrective Action Unresolved", self.parent_car_unresolved)
            
            # Find the corresponding production record in child table
            for row in parent_car.unresolved_production_records:
                if row.production_entry == self.production_entry:
                    # Update status and link
                    row.resolution_status = "Resolved"
                    row.resolved_record = self.name
                    break
            
            # Save parent CAR (this will recalculate summary fields)
            parent_car.save(ignore_permissions=True)
            
            frappe.msgprint(f"Updated parent CAR {self.parent_car_unresolved} status")
            
        except Exception as e:
            frappe.log_error(f"Failed to update parent CAR: {str(e)}", "CAR Resolution Update Failed")
