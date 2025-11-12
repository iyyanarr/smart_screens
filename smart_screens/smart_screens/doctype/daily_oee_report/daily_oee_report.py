import frappe
from frappe.model.document import Document
from frappe.utils import flt, getdate

class DailyOEEReport(Document):
    """
    Daily OEE Report DocType
    Collects all production records from OEE Dashboard for a given day
    Provides summary statistics for daily OEE performance
    """
    
    # Removed custom autoname() - let Frappe handle naming series automatically
    
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
def check_existing_report(production_date, shift_filter='', machine_filter=''):
    """
    Check if a Daily OEE Report already exists for given date and filters
    Called when user loads OEE Dashboard or changes production date
    
    Args:
        production_date: Production date to check
        shift_filter: Optional shift filter
        machine_filter: Optional machine filter
    
    Returns:
        {
            'exists': True/False,
            'report_name': 'DAILY-OEE-2025-10-28-00001',
            'status': 'Draft'/'Submitted',
            'docstatus': 0/1,
            'total_records': 15,
            'resolved_count': 8,
            'pending_count': 7,
            'can_resume': True/False
        }
    """
    if not production_date:
        frappe.throw("Production Date is required")
    
    # Search for existing report
    filters = {
        "production_date": production_date,
        "docstatus": ["<", 2]  # Not cancelled
    }
    
    # Add optional filters if provided
    if shift_filter and shift_filter != 'all':
        filters["shift_filter"] = shift_filter
    if machine_filter and machine_filter != 'all':
        filters["machine_filter"] = machine_filter
    
    existing_reports = frappe.get_all(
        "Daily OEE Report",
        filters=filters,
        fields=["name", "docstatus", "total_records", "production_date"],
        order_by="creation desc",
        limit=1
    )
    
    if not existing_reports:
        return {
            'exists': False,
            'report_name': None,
            'status': None,
            'docstatus': None,
            'total_records': 0,
            'resolved_count': 0,
            'pending_count': 0,
            'can_resume': False
        }
    
    report = existing_reports[0]
    report_name = report['name']
    
    # Determine status from docstatus
    status = 'Draft' if report['docstatus'] == 0 else 'Submitted'
    
    # Get resolution statistics - safely handle if child table doesn't exist yet
    resolved_count = 0
    pending_count = 0
    
    try:
        # Check if child table exists before querying
        if frappe.db.table_exists("Unresolved Production Record"):
            resolved_count = frappe.db.count("Unresolved Production Record", {
                "parent": report_name,
                "resolution_status": "Resolved"
            })
            
            pending_count = frappe.db.count("Unresolved Production Record", {
                "parent": report_name,
                "resolution_status": ["!=", "Resolved"]
            })
    except Exception as e:
        frappe.log_error(f"Error counting child records: {str(e)}", "check_existing_report")
        # Continue with zeros if table doesn't exist
        pass
    
    return {
        'exists': True,
        'report_name': report_name,
        'status': status,
        'docstatus': report['docstatus'],
        'total_records': report['total_records'] or 0,
        'resolved_count': resolved_count,
        'pending_count': pending_count,
        'can_resume': report['docstatus'] == 0  # Can only resume draft reports
    }


@frappe.whitelist()
def get_report_data(report_name):
    """
    Load existing Daily OEE Report data for resume mode
    Returns production records with their current resolution status
    
    Args:
        report_name: Name of Daily OEE Report document
    
    Returns:
        {
            'success': True,
            'data': {
                'filters': {...},
                'production_records': [{...with resolution_status, car_reference...}],
                'summary': {...},
                'generated_at': '...'
            }
        }
    """
    if not report_name:
        return {'success': False, 'error': 'Report Name is required'}
    
    # Check if report exists
    if not frappe.db.exists("Daily OEE Report", report_name):
        return {'success': False, 'error': f'Daily OEE Report {report_name} not found'}
    
    try:
        # Get report document
        report_doc = frappe.get_doc("Daily OEE Report", report_name)
        
        # Build production records with current status from saved report
        production_records = []
        for row in report_doc.production_records:
            # Format production date for display
            prod_date_formatted = frappe.utils.formatdate(row.production_date, 'dd-MM-yyyy') if row.production_date else ''
            
            # Check lot inspection status to determine if quality metrics should be shown
            lot_inspection_status = get_lot_inspection_status(row.production_entry)
            
            # Only show quality metrics if lot inspection is submitted
            if lot_inspection_status == 'Submitted':
                total_inspected = int(getattr(row, 'total_inspected', 0))
                good_pieces = int(getattr(row, 'good_pieces', 0))
                rejected_pieces = int(getattr(row, 'rejected_pieces', 0))
            else:
                # Inspection pending or not found - show 0 for all quality metrics
                total_inspected = 0
                good_pieces = 0
                rejected_pieces = 0
            
            production_records.append({
                'name': row.production_entry,
                'production_date': str(row.production_date) if row.production_date else '',
                'production_date_formatted': prod_date_formatted,
                'shift_type': row.shift_type or '',
                'operator_name': row.operator_name or '',
                'machine_reference': row.machine_reference or '',  # Mould reference
                'machine_name': getattr(row, 'machine_name', 'N/A'),  # FIX: Add machine name
                'item_code': row.item_code or '',
                'lot_number': row.lot_number or '',
                # NEW: Add linked lot fields from saved report
                'is_linked_lot': getattr(row, 'is_linked_lot', False),
                'linked_lots': getattr(row, 'linked_lots', ''),
                'linked_lot_count': getattr(row, 'linked_lot_count', 0),
                'target_quantity': flt(row.target_quantity, 2),
                'actual_quantity': flt(row.actual_quantity, 2),
                'number_of_products': flt(getattr(row, 'number_of_products', 0), 2),  # FIX: Add NoP field
                'variance_qty': flt(row.variance_qty, 2),
                'oee_pct': flt(row.oee_pct, 2),
                'production_equipment_efficiency': flt(row.production_efficiency_pct, 2),
                'rejection_percentage': flt(row.rejection_percentage, 2),
                'availability_pct': flt(row.availability_pct, 2),
                'performance_pct': flt(row.performance_pct, 2),
                'quality_pct': flt(row.quality_pct, 2),
                # OEE Breakdown fields for Details Modal
                'planned_time_minutes': flt(getattr(row, 'planned_time_minutes', 450), 2),
                'downtime_minutes': flt(getattr(row, 'downtime_minutes', 0), 2),
                'available_time_minutes': flt(getattr(row, 'available_time_minutes', 450), 2),
                'cycle_time_seconds': flt(getattr(row, 'cycle_time_seconds', 0), 2),
                'no_of_cavities': int(getattr(row, 'no_of_cavities', 0)),
                'total_inspected': total_inspected,  # Conditionally set based on inspection status
                'good_pieces': good_pieces,  # Conditionally set based on inspection status
                'rejected_pieces': rejected_pieces,  # Conditionally set based on inspection status
                'resolution_status': getattr(row, 'resolution_status', 'Pending'),
                'resolved_record': getattr(row, 'resolved_record', ''),
                # Add lot inspection status (check if exists in production entry)
                'lot_inspection_status': lot_inspection_status
            })
        
        # Build summary
        summary = {
            'avg_availability': flt(report_doc.avg_availability, 2),
            'avg_performance': flt(report_doc.avg_performance, 2),
            'avg_quality': flt(report_doc.avg_quality, 2),
            'avg_oee': flt(report_doc.avg_oee, 2)
        }
        
        # Build filters
        filters = {
            'production_date': str(report_doc.production_date) if report_doc.production_date else '',
            'shift_filter': report_doc.shift_filter or '',
            'machine_filter': report_doc.machine_filter or ''
        }
        
        return {
            'success': True,
            'data': {
                'filters': filters,
                'production_records': production_records,
                'summary': summary,
                'generated_at': report_doc.creation.isoformat() if report_doc.creation else frappe.utils.now()
            }
        }
    except Exception as e:
        frappe.log_error(f"Error loading report data: {frappe.get_traceback()}", "Get Report Data Error")
        return {
            'success': False,
            'error': str(e)
        }


def get_lot_inspection_status(production_entry):
    """
    Helper function to get lot inspection status for a production entry
    Queries the Inspection Entry DocType with inspection_type = "Lot Inspection"
    """
    try:
        if not production_entry:
            return 'Not Found'
        
        # Get production entry document - try Moulding Production Entry
        try:
            prod_doc = frappe.get_doc('Moulding Production Entry', production_entry)
        except Exception:
            frappe.log_error(f"Production entry {production_entry} not found", "Get Lot Inspection Status")
            return 'Not Found'
        
        lot_number = prod_doc.get('scan_lot_number')
        
        if not lot_number:
            return 'Not Found'
        
        # Check for lot inspection in the Inspection Entry DocType
        # where inspection_type = "Lot Inspection"
        inspection = frappe.db.get_value(
            'Inspection Entry',
            {
                'lot_no': lot_number,
                'inspection_type': 'Lot Inspection'
            },
            ['name', 'docstatus'],
            as_dict=True
        )
        
        if inspection:
            if inspection.docstatus == 1:
                return 'Submitted'
            else:
                return 'Draft'
        
        return 'Not Found'
    except Exception as e:
        frappe.log_error(f"Error getting lot inspection status: {str(e)}\n{frappe.get_traceback()}", "Get Lot Inspection Status")
        return 'Not Found'


@frappe.whitelist()
def update_report_resolution_status(report_name, production_entry, resolution_status, resolved_record=''):
    """
    Update resolution status for a production record in existing Daily OEE Report
    Called after user creates CAR from dashboard
    
    Args:
        report_name: Name of Daily OEE Report
        production_entry: Production entry identifier
        resolution_status: 'Resolved' or 'Pending'
        resolved_record: CAR document name (if created)
    """
    if not report_name or not production_entry:
        frappe.throw("Report Name and Production Entry are required")
    
    # Get report document
    report_doc = frappe.get_doc("Daily OEE Report", report_name)
    
    # Check if report is draft
    if report_doc.docstatus != 0:
        frappe.throw("Cannot update submitted or cancelled report")
    
    # Find the production record
    updated = False
    for row in report_doc.production_records:
        if row.production_entry == production_entry:
            row.resolution_status = resolution_status
            if resolved_record:
                row.resolved_record = resolved_record
            updated = True
            break
    
    if not updated:
        frappe.throw(f"Production entry {production_entry} not found in report {report_name}")
    
    # Save report
    report_doc.save(ignore_permissions=True)
    
    frappe.db.commit()
    
    return {
        'success': True,
        'message': f'Updated resolution status for {production_entry}'
    }


@frappe.whitelist()
def generate_daily_oee_report(filters):
    """
    Generate Daily OEE Report from OEE Dashboard
    Called when user clicks "Submit Report" button
    
    MODIFIED: Now checks for existing draft report and updates it instead of creating duplicate
    
    Args:
        filters: Dictionary containing:
            - production_date (single date)
            - shift_filter
            - machine_filter
            - production_records (list of all OEE records for the day)
            - existing_report_name (optional - if resuming)
    
    Returns:
        Name of created/updated Daily OEE Report document
    """
    import json
    
    if isinstance(filters, str):
        filters = json.loads(filters)
    
    # Extract filters
    production_date = filters.get('production_date')
    shift_filter = filters.get('shift_filter', '')
    machine_filter = filters.get('machine_filter', '')
    production_records = filters.get('production_records', [])
    existing_report_name = filters.get('existing_report_name')
    
    # Validate
    if not production_date:
        frappe.throw("Production Date is required")
    
    if not production_records:
        frappe.throw("No production records found to generate Daily OEE Report")
    
    # RESUME MODE: Update existing draft report
    if existing_report_name:
        if not frappe.db.exists("Daily OEE Report", existing_report_name):
            frappe.throw(f"Existing report {existing_report_name} not found")
        
        report_doc = frappe.get_doc("Daily OEE Report", existing_report_name)
        
        # Check if report is still draft
        if report_doc.docstatus != 0:
            frappe.throw("Cannot update a submitted or cancelled report")
        
        # Update production records (merge new data with existing resolution status)
        # Create lookup of existing records
        existing_records = {row.production_entry: row for row in report_doc.production_records}
        
        # Clear and rebuild child table
        report_doc.production_records = []
        
        for record in production_records:
            production_entry_name = record.get('name')
            
            # Check if this record already exists (preserve resolution status)
            existing_row = existing_records.get(production_entry_name)
            
            report_doc.append("production_records", {
                "production_entry": production_entry_name,
                "production_date": record.get('production_date'),
                "shift_type": record.get('shift_type', ''),
                "operator_name": record.get('operator_name', ''),
                "machine_reference": record.get('machine_reference', ''),
                "machine_name": record.get('machine_name', ''),  # FIX: Add machine name
                "item_code": record.get('item_code', ''),
                "lot_number": record.get('lot_number', ''),
                "target_quantity": flt(record.get('target_quantity', 0)),
                "actual_quantity": flt(record.get('actual_quantity', 0)),
                "number_of_products": int(record.get('number_of_products', 0)),  # FIX: Add NoP
                "variance_qty": flt(record.get('variance_qty', 0)),
                "oee_pct": flt(record.get('oee_pct', 0)),
                "production_efficiency_pct": flt(record.get('production_efficiency_pct', 0)),
                "rejection_percentage": flt(record.get('rejection_percentage', 0)),
                "availability_pct": flt(record.get('availability_pct', 0)),
                "performance_pct": flt(record.get('performance_pct', 0)),
                "quality_pct": flt(record.get('quality_pct', 0)),
                # Preserve existing resolution data if available
                "resolution_status": existing_row.resolution_status if existing_row else 'Pending',
                "resolved_record": existing_row.resolved_record if existing_row else ''
            })
        
        report_doc.save(ignore_permissions=True)
        
        frappe.msgprint(f"Updated existing Daily OEE Report {report_doc.name} with {len(production_records)} production record(s)")
        
        return report_doc.name
    
    # NEW REPORT MODE: Check if report already exists for this date and filters
    existing_report = frappe.db.exists("Daily OEE Report", {
        "production_date": production_date,
        "shift_filter": shift_filter,
        "machine_filter": machine_filter,
        "docstatus": ["<", 2]  # Not cancelled
    })
    
    if existing_report:
        frappe.throw(f"Daily OEE Report already exists for this date and filter combination: {existing_report}. Please use 'Resume Report' to update it.")
    
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
            "machine_name": record.get('machine_name', ''),  # FIX: Add machine name
            "item_code": record.get('item_code', ''),
            "lot_number": record.get('lot_number', ''),
            "target_quantity": flt(record.get('target_quantity', 0)),
            "actual_quantity": flt(record.get('actual_quantity', 0)),
            "number_of_products": int(record.get('number_of_products', 0)),  # FIX: Add NoP
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
