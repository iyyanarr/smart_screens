import frappe
from frappe.model.document import Document
from frappe.utils import flt, getdate

class DailyOEEReport(Document):
    """
    Daily OEE Report DocType
    Collects all production records from OEE Dashboard for a given day
    Provides summary statistics for daily OEE performance
    """
    
    def autoname(self):
        """Set document name with production date"""
        if self.production_date:
            # Format: DAILY-OEE-2025-10-28-00001
            date_part = getdate(self.production_date).strftime("%Y-%m-%d")
            self.name = f"DAILY-OEE-{date_part}-.###"
        else:
            # Fallback if no production date
            self.name = "DAILY-OEE-.####"
    
    def validate(self):
        """Validation on save"""
        # Validate production date is required
        if not self.production_date:
            frappe.throw("Production Date is required")
        
        # Validate production date
        if self.production_date:
            if getdate(self.production_date) > getdate():
                frappe.throw("Production Date cannot be in the future")
        
        # Set report_date if not set
        if not self.report_date:
            self.report_date = frappe.utils.today()
        
        # Calculate summary fields
        self.calculate_summary()
    
    def calculate_summary(self):
        """Calculate summary metrics from production records"""
        if not self.production_records:
            self.total_records = 0
            self.avg_availability = 0
            self.avg_performance = 0
            self.avg_quality = 0
            self.avg_oee = 0
            return
        
        total = len(self.production_records)
        
        # Calculate averages
        total_availability = sum(flt(row.availability_pct) for row in self.production_records)
        total_performance = sum(flt(row.performance_pct) for row in self.production_records)
        total_quality = sum(flt(row.quality_pct) for row in self.production_records)
        total_oee = sum(flt(row.oee_pct) for row in self.production_records)
        
        self.total_records = total
        self.avg_availability = (total_availability / total) if total > 0 else 0
        self.avg_performance = (total_performance / total) if total > 0 else 0
        self.avg_quality = (total_quality / total) if total > 0 else 0
        self.avg_oee = (total_oee / total) if total > 0 else 0
    
    def before_submit(self):
        """Validation before submission"""
        if not self.production_records:
            frappe.throw("Cannot submit Daily OEE Report without production records")
        
        # Validate that all low OEE records are resolved
        self.validate_low_oee_records_resolved()
        
        self.status = "Submitted"
    
    def validate_low_oee_records_resolved(self):
        """
        Validate that all production records with OEE < 90% have been resolved
        Throws error if any low OEE records are pending resolution
        """
        low_oee_threshold = 90.0
        unresolved_records = []
        
        for row in self.production_records:
            oee_pct = flt(row.oee_pct, 0)
            resolution_status = (row.resolution_status or '').strip()
            
            # Check if OEE is below threshold and not resolved
            if oee_pct < low_oee_threshold and resolution_status != 'Resolved':
                unresolved_records.append({
                    'production_entry': row.production_entry,
                    'lot_number': row.lot_number or 'N/A',
                    'item_code': row.item_code or 'N/A',
                    'oee_pct': oee_pct,
                    'resolution_status': resolution_status or 'Pending'
                })
        
        if unresolved_records:
            # Build error message with details
            error_msg = f"<b>Cannot submit Daily OEE Report</b><br><br>"
            error_msg += f"Found {len(unresolved_records)} low OEE record(s) that need resolution (OEE < {low_oee_threshold}%):<br><br>"
            error_msg += "<table class='table table-bordered table-sm'>"
            error_msg += "<thead><tr><th>Lot Number</th><th>Item Code</th><th>OEE %</th><th>Status</th></tr></thead>"
            error_msg += "<tbody>"
            
            for rec in unresolved_records[:10]:  # Show first 10 only
                error_msg += f"<tr>"
                error_msg += f"<td>{rec['lot_number']}</td>"
                error_msg += f"<td>{rec['item_code']}</td>"
                error_msg += f"<td style='color: red;'><b>{rec['oee_pct']}%</b></td>"
                error_msg += f"<td>{rec['resolution_status']}</td>"
                error_msg += f"</tr>"
            
            error_msg += "</tbody></table>"
            
            if len(unresolved_records) > 10:
                error_msg += f"<br><i>...and {len(unresolved_records) - 10} more record(s)</i><br>"
            
            error_msg += "<br><b>Action Required:</b> Please generate Corrective Action Reports (CAR) for all low OEE records before submitting."
            
            frappe.throw(error_msg, title="Resolution Incomplete")
    
    def on_submit(self):
        """Actions when document is submitted"""
        frappe.msgprint(f"Daily OEE Report submitted successfully with {self.total_records} production record(s)")
    
    def on_cancel(self):
        """Actions when document is cancelled"""
        self.status = "Cancelled"


@frappe.whitelist()
def generate_daily_oee_report(filters):
    """
    Generate Daily OEE Report from OEE Dashboard
    Called when user clicks "Submit Report" button
    
    Args:
        filters: Dictionary containing:
            - production_date (single date)
            - shift_filter
            - machine_filter
            - production_records (list of all OEE records for the day)
    
    Returns:
        Name of created Daily OEE Report document
    """
    import json
    
    if isinstance(filters, str):
        filters = json.loads(filters)
    
    # Extract filters
    production_date = filters.get('production_date')
    shift_filter = filters.get('shift_filter', '')
    machine_filter = filters.get('machine_filter', '')
    production_records = filters.get('production_records', [])
    
    # Validate
    if not production_date:
        frappe.throw("Production Date is required")
    
    if not production_records:
        frappe.throw("No production records found to generate Daily OEE Report")
    
    # Check if report already exists for this date and filters
    existing_report = frappe.db.exists("Daily OEE Report", {
        "production_date": production_date,
        "shift_filter": shift_filter,
        "machine_filter": machine_filter,
        "docstatus": ["<", 2]  # Not cancelled
    })
    
    if existing_report:
        frappe.throw(f"Daily OEE Report already exists for this date and filter combination: {existing_report}")
    
    # Create Daily OEE Report document
    report_doc = frappe.new_doc("Daily OEE Report")
    report_doc.production_date = production_date
    report_doc.shift_filter = shift_filter
    report_doc.machine_filter = machine_filter
    
    # Add all production records to child table
    for record in production_records:
        production_entry_name = record.get('name')
        
        report_doc.append("production_records", {
            "production_entry": production_entry_name,
            "production_date": record.get('production_date'),
            "shift_type": record.get('shift_type', ''),
            "operator_name": record.get('operator_name', ''),
            "machine_reference": record.get('machine_reference', ''),
            "item_code": record.get('item_code', ''),
            "lot_number": record.get('lot_number', ''),
            "target_quantity": flt(record.get('target_quantity', 0)),
            "actual_quantity": flt(record.get('actual_quantity', 0)),
            "variance_qty": flt(record.get('variance_qty', 0)),
            "oee_pct": flt(record.get('oee_pct', 0)),
            "production_efficiency_pct": flt(record.get('production_efficiency_pct', 0)),
            "rejection_percentage": flt(record.get('rejection_percentage', 0)),
            "availability_pct": flt(record.get('availability_pct', 0)),
            "performance_pct": flt(record.get('performance_pct', 0)),
            "quality_pct": flt(record.get('quality_pct', 0)),
            "resolution_status": record.get('resolution_status', 'Pending')
        })
    
    # Save document
    report_doc.save(ignore_permissions=True)
    
    frappe.msgprint(f"Created Daily OEE Report {report_doc.name} with {len(production_records)} production record(s)")
    
    return report_doc.name
