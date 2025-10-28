import frappe
from frappe.model.document import Document
from frappe.utils import flt, today, nowdate

class CorrectiveActionResolved(Document):
    """
    Corrective Action Resolved DocType
    Stores root cause analysis and resolution for ONE production entry
    Can be created from EITHER:
    1. Corrective Action Unresolved (old flow)
    2. Daily OEE Report (new flow)
    """
    
    def validate(self):
        """Validation on save"""
        # Validate at least one parent is specified
        if not self.parent_car_unresolved and not self.parent_daily_oee_report:
            frappe.throw("Either 'Parent CAR Unresolved' or 'Parent Daily OEE Report' must be specified")
        
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
        # Update the parent document based on which parent is set
        if self.parent_car_unresolved:
            self.update_parent_car_unresolved_status()
        elif self.parent_daily_oee_report:
            self.update_parent_daily_oee_report_status()
    
    def update_parent_car_unresolved_status(self):
        """Update CAR Unresolved (OLD FLOW)"""
        if not self.parent_car_unresolved or not self.production_entry:
            return
        
        try:
            parent_car = frappe.get_doc("Corrective Action Unresolved", self.parent_car_unresolved)
            
            for row in parent_car.unresolved_production_records:
                if row.production_entry == self.production_entry:
                    row.resolution_status = "Resolved"
                    row.resolved_record = self.name
                    break
            
            parent_car.save(ignore_permissions=True)
            frappe.msgprint(f"Updated CAR {self.parent_car_unresolved} status")
            
        except Exception as e:
            frappe.log_error(f"Failed to update parent CAR: {str(e)}", "CAR Resolution Update Failed")
    
    def update_parent_daily_oee_report_status(self):
        """Update Daily OEE Report (NEW FLOW) ⭐"""
        if not self.parent_daily_oee_report or not self.production_entry:
            return
        
        try:
            # Get parent Daily OEE Report
            parent_report = frappe.get_doc("Daily OEE Report", self.parent_daily_oee_report)
            
            # Find the corresponding production record in child table
            updated = False
            for row in parent_report.production_records:
                if row.production_entry == self.production_entry:
                    # Update status and link
                    row.resolution_status = "Resolved"
                    row.resolved_record = self.name
                    updated = True
                    break
            
            if updated:
                # Save parent report (this will recalculate summary fields)
                parent_report.save(ignore_permissions=True)
                frappe.msgprint(f"Updated Daily OEE Report {self.parent_daily_oee_report} - Record marked as Resolved")
            else:
                frappe.log_error(
                    f"Production entry {self.production_entry} not found in Daily OEE Report {self.parent_daily_oee_report}",
                    "Daily OEE Report Update Warning"
                )
            
        except Exception as e:
            frappe.log_error(
                f"Failed to update Daily OEE Report: {str(e)}", 
                "Daily OEE Report Resolution Update Failed"
            )
