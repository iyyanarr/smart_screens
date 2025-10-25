import frappe
from frappe.model.document import Document
from frappe.utils import flt, getdate

class CorrectiveActionUnresolved(Document):
    """
    Corrective Action Unresolved DocType
    Collects all low OEE production records from OEE Dashboard
    Tracks resolution progress as records are resolved
    """
    
    def validate(self):
        """Validation on save"""
        # Validate date range
        if self.from_date and self.to_date:
            if getdate(self.to_date) < getdate(self.from_date):
                frappe.throw("To Date cannot be before From Date")
        
        # Calculate summary fields
        self.calculate_summary()
    
    def calculate_summary(self):
        """Calculate total, resolved, and pending records"""
        if not self.unresolved_production_records:
            self.total_records = 0
            self.resolved_records = 0
            self.pending_records = 0
            self.resolution_progress_pct = 0
            return
        
        total = len(self.unresolved_production_records)
        resolved = sum(1 for row in self.unresolved_production_records if row.resolution_status == "Resolved")
        pending = total - resolved
        
        self.total_records = total
        self.resolved_records = resolved
        self.pending_records = pending
        self.resolution_progress_pct = (resolved / total * 100) if total > 0 else 0
        
        # Update status based on resolution progress
        if resolved == 0:
            self.status = "Draft"
        elif resolved < total:
            self.status = "In Progress"
        else:
            self.status = "Completed"
    
    def before_submit(self):
        """Validation before submission"""
        # Check if all records are resolved
        if self.pending_records > 0:
            frappe.throw(f"Cannot submit CAR with {self.pending_records} pending record(s). Please resolve all records first.")
        
        self.status = "Submitted"
    
    def on_submit(self):
        """Actions when document is submitted"""
        frappe.msgprint(f"Corrective Action Report submitted successfully with {self.total_records} resolved record(s)")
    
    def on_cancel(self):
        """Actions when document is cancelled"""
        self.status = "Cancelled"


@frappe.whitelist()
def generate_car_from_oee_dashboard(filters):
    """
    Generate Corrective Action Unresolved from OEE Dashboard
    Called when user clicks "Generate CAR" button
    
    Args:
        filters: Dictionary containing:
            - from_date
            - to_date
            - shift_filter
            - machine_filter
            - item_filter
            - operator_filter
            - production_records (list of low OEE records)
    
    Returns:
        Name of created CAR document
    """
    import json
    
    if isinstance(filters, str):
        filters = json.loads(filters)
    
    # Extract filters
    from_date = filters.get('from_date')
    to_date = filters.get('to_date')
    shift_filter = filters.get('shift_filter', '')
    machine_filter = filters.get('machine_filter', '')
    item_filter = filters.get('item_filter', '')
    operator_filter = filters.get('operator_filter', '')
    production_records = filters.get('production_records', [])
    
    # Validate
    if not from_date or not to_date:
        frappe.throw("From Date and To Date are required")
    
    if not production_records:
        frappe.throw("No production records found to generate CAR")
    
    # Filter low OEE records (OEE < 90% OR Production Efficiency < 100%)
    low_oee_records = []
    for record in production_records:
        oee_pct = flt(record.get('oee_pct', 0))
        production_eff = flt(record.get('production_efficiency_pct', 0))
        
        if oee_pct < 90 or production_eff < 100:
            low_oee_records.append(record)
    
    if not low_oee_records:
        frappe.throw("No low-performing records found (OEE < 90% OR Production Efficiency < 100%)")
    
    # Create CAR document
    car_doc = frappe.new_doc("Corrective Action Unresolved")
    car_doc.from_date = from_date
    car_doc.to_date = to_date
    car_doc.shift_filter = shift_filter
    car_doc.machine_filter = machine_filter
    car_doc.item_filter = item_filter
    car_doc.operator_filter = operator_filter
    
    # Add production records to child table
    for record in low_oee_records:
        lot_number = record.get('lot_number', '')
        production_date = record.get('production_date')
        
        # The 'name' field now contains the actual production entry ID from the aggregated data
        production_entry_name = record.get('name')
        
        car_doc.append("unresolved_production_records", {
            "production_entry": production_entry_name,  # Properly linked now
            "production_date": production_date,
            "shift_type": record.get('shift_type', ''),
            "operator_name": record.get('operator_name', ''),
            "machine_reference": record.get('machine_reference', ''),
            "item_code": record.get('item_code', ''),
            "lot_number": lot_number,
            "target_quantity": flt(record.get('target_quantity', 0)),
            "actual_quantity": flt(record.get('actual_quantity', 0)),
            "variance_qty": flt(record.get('variance_qty', 0)),
            "oee_pct": flt(record.get('oee_pct', 0)),
            "production_efficiency_pct": flt(record.get('production_efficiency_pct', 0)),
            "rejection_percentage": flt(record.get('rejection_percentage', 0)),
            "availability_pct": flt(record.get('availability_pct', 0)),
            "performance_pct": flt(record.get('performance_pct', 0)),
            "quality_pct": flt(record.get('quality_pct', 0)),
            "resolution_status": "Pending"
        })
    
    # Save document
    car_doc.save(ignore_permissions=True)
    
    frappe.msgprint(f"Created CAR {car_doc.name} with {len(low_oee_records)} low-performing record(s)")
    
    return car_doc.name


def get_production_entry_by_lot(lot_number, production_date=None):
    """
    Find Moulding Production Entry by lot number
    
    Args:
        lot_number: Lot number to search for
        production_date: Optional production date to narrow search
    
    Returns:
        Name of the production entry document, or None if not found
    """
    if not lot_number:
        return None
    
    try:
        filters = {"lot_number": lot_number}
        
        # Add date filter if provided to narrow down results
        if production_date:
            filters["production_date"] = production_date
        
        # Try to find exact match
        production_entry = frappe.get_all(
            "Moulding Production Entry",
            filters=filters,
            fields=["name"],
            limit=1,
            order_by="creation desc"
        )
        
        if production_entry:
            return production_entry[0].name
        
        # If no exact date match, try without date filter
        if production_date:
            production_entry = frappe.get_all(
                "Moulding Production Entry",
                filters={"lot_number": lot_number},
                fields=["name"],
                limit=1,
                order_by="creation desc"
            )
            
            if production_entry:
                return production_entry[0].name
        
        frappe.log_error(
            f"Production Entry not found for lot number: {lot_number}",
            "CAR Generation - Missing Production Entry"
        )
        return None
        
    except Exception as e:
        frappe.log_error(
            f"Error finding production entry for lot {lot_number}: {str(e)}",
            "CAR Generation Error"
        )
        return None
