"""
OEE Report Generator Backend API
Main API endpoints for the OEE Report Generator page
"""

import frappe
from frappe import _
from frappe.utils import flt, formatdate, today, getdate
from smart_screens.smart_screens.api.oee.oee_calculator import OEECalculator
from smart_screens.smart_screens.api.oee.adapters.moulding_adapter import MouldingAdapter

# Process adapter registry
PROCESS_ADAPTERS = {
    'Moulding': MouldingAdapter,
    # Future processes can be added here:
    # 'Blanking': BlankingAdapter,
    # 'Batching': BatchingAdapter,
}

# Map process type to underlying production entry DocType for resolution fields
PRODUCTION_ENTRY_DOCTYPE = {
    'Moulding': 'Moulding Production Entry',
}

@frappe.whitelist()
def get_oee_data(production_date=None, process_type='Moulding', shift_filter=None, 
                 machine_filter=None, lot_filter=None, item_filter=None):
    """
    Main API to get OEE data for any manufacturing process
    
    Args:
        production_date: Production date (YYYY-MM-DD) - defaults to today
        process_type: Process name (Moulding, Blanking, etc.)
        shift_filter: Shift filter (A, B, C, all)
        machine_filter: Machine/Equipment filter
        lot_filter: Lot number filter
        item_filter: Item code filter
    
    Returns:
        list: OEE data with all calculations
    """
    
    # Default to today if no date provided
    if not production_date:
        production_date = today()
    
    # Get the appropriate process adapter
    adapter_class = PROCESS_ADAPTERS.get(process_type)
    if not adapter_class:
        frappe.throw(_("Process type '{0}' is not supported").format(process_type))
    
    adapter = adapter_class()
    calculator = OEECalculator()
    
    # Build filters
    filters = {
        'shift': shift_filter,
        'machine': machine_filter,
        'lot': lot_filter,
        'item': item_filter
    }
    
    # Get production data for the single date
    production_data = adapter.get_production_data(production_date, production_date, filters)
    
    # Calculate OEE for each production entry
    oee_results = []
    
    for entry in production_data:
        try:
            # Extract basic info
            planned_time = adapter.get_planned_time(entry)
            downtime = adapter.get_downtime(entry)
            target_qty = adapter.get_target_quantity(entry)
            actual_qty = adapter.get_actual_quantity(entry)
            cycle_time = adapter.calculate_cycle_time(entry)
            quality_data = adapter.get_quality_data(entry)
            
            # Calculate available time
            available_time = planned_time - downtime
            
            # Calculate OEE components
            availability = calculator.calculate_availability(planned_time, downtime)
            performance = calculator.calculate_performance(cycle_time, actual_qty, available_time)
            
            # Calculate quality
            if quality_data['total_pieces'] > 0:
                quality = calculator.calculate_quality(
                    quality_data['good_pieces'],
                    quality_data['total_pieces']
                )
            else:
                # If no inspection data, use rejection percentage or assume 100%
                if quality_data['rejection_percentage'] > 0:
                    quality = calculator.calculate_quality_from_rejection(
                        quality_data['rejection_percentage']
                    )
                else:
                    quality = 1.0  # Assume 100% quality if no data
            
            # Calculate overall OEE
            oee = calculator.calculate_oee(availability, performance, quality)
            
            # Build result object
            result = {
                'name': entry.get('name'),  # Include actual production entry ID
                'production_date': adapter.get_production_date(entry),
                'production_date_formatted': formatdate(adapter.get_production_date(entry)),
                'shift_type': adapter.get_shift_type(entry),
                'process_type': process_type,
                'machine_reference': adapter.get_machine_reference(entry),
                'lot_number': adapter.get_lot_number(entry),
                'item_code': adapter.get_item_code(entry),
                'operator_name': entry.get('operator_name', ''),
                
                # Planning & Production Data
                'planned_time_minutes': planned_time,
                'downtime_minutes': downtime,
                'available_time_minutes': available_time,
                'target_quantity': target_qty,
                'actual_quantity': actual_qty,
                'cycle_time_seconds': round(cycle_time, 2),
                'no_of_cavities': entry.get('no_of_running_cavities', 0),
                'variance_qty': actual_qty - target_qty,
                
                # Quality Data
                'total_inspected': quality_data['total_pieces'],
                'good_pieces': quality_data['good_pieces'],
                'rejected_pieces': quality_data['rejected_pieces'],
                'rejection_percentage': quality_data['rejection_percentage'],
                
                # OEE Metrics (as percentages for display)
                'availability_pct': round(availability * 100, 2),
                'performance_pct': round(performance * 100, 2),
                'quality_pct': round(quality * 100, 2),
                'oee_pct': round(oee, 2),
                
                # Production Equipment Efficiency (Availability × Performance)
                'production_equipment_efficiency': round(availability * performance * 100, 2),
                
                # Status badges
                'has_target': target_qty > 0,
                'has_production': actual_qty > 0,
                'has_quality_data': quality_data['total_pieces'] > 0,
                
                # Raw values for calculations
                '_availability': availability,
                '_performance': performance,
                '_quality': quality,
            }
            
            # Include resolution fields if present (use correct DocType per process)
            production_entry_name = entry.get('name')
            if production_entry_name:
                try:
                    doctype = PRODUCTION_ENTRY_DOCTYPE.get(process_type)
                    if doctype:
                        production_entry_doc = frappe.get_doc(doctype, production_entry_name)
                        result.update({
                            'reason_code': production_entry_doc.get('reason_code'),
                            'problem_description': production_entry_doc.get('problem_description'),
                            'root_cause': production_entry_doc.get('root_cause'),
                            'corrective_action': production_entry_doc.get('corrective_action'),
                            'responsible_person': production_entry_doc.get('responsible_person'),
                            'target_completion_date': production_entry_doc.get('target_completion_date'),
                            'resolution_remarks': production_entry_doc.get('resolution_remarks'),
                            'resolution_status': production_entry_doc.get('resolution_status'),
                            'resolved_by': production_entry_doc.get('resolved_by'),
                            'resolved_on': production_entry_doc.get('resolved_on'),
                        })
                except Exception:
                    # Don't fail the entire row if resolution fields can't be fetched
                    pass
            
            # Check lot inspection status
            lot_number = adapter.get_lot_number(entry)
            inspection_status = check_lot_inspection_status(lot_number, process_type)
            result.update({
                'lot_inspection_status': inspection_status.get('status'),
                'lot_inspection_name': inspection_status.get('inspection_name'),
                'has_lot_inspection': inspection_status.get('has_inspection'),
                'lot_inspection_submitted': inspection_status.get('is_submitted')
            })

            oee_results.append(result)
            
        except Exception as e:
            frappe.log_error(f"Error calculating OEE for entry: {str(e)}", "OEE Calculation Error")
            continue
    
    return oee_results


@frappe.whitelist()
def get_oee_summary(production_date=None, process_type='Moulding', shift_filter=None,
                    machine_filter=None, lot_filter=None, item_filter=None):
    """
    Get summary statistics for OEE Report Generator
    
    Returns:
        dict: Summary metrics (averages, totals, etc.)
    """
    
    # Get OEE data
    oee_data = get_oee_data(
        production_date=production_date,
        process_type=process_type,
        shift_filter=shift_filter,
        machine_filter=machine_filter,
        lot_filter=lot_filter,
        item_filter=item_filter
    )
    
    if not oee_data or len(oee_data) == 0:
        return {
            'total_records': 0,
            'avg_availability': 0.0,
            'avg_performance': 0.0,
            'avg_quality': 0.0,
            'avg_oee': 0.0,
            'total_planned_qty': 0,
            'total_produced_qty': 0,
            'total_good_pieces': 0,
            'total_rejected_pieces': 0,
            'overall_rejection_pct': 0.0
        }
    
    # Calculate averages
    total_records = len(oee_data)
    avg_availability = sum(row['_availability'] for row in oee_data) / total_records
    avg_performance = sum(row['_performance'] for row in oee_data) / total_records
    avg_quality = sum(row['_quality'] for row in oee_data) / total_records
    avg_oee = sum(row['oee_pct'] for row in oee_data) / total_records
    
    # Calculate totals
    total_planned_qty = sum(row['target_quantity'] for row in oee_data)
    total_produced_qty = sum(row['actual_quantity'] for row in oee_data)
    total_good_pieces = sum(row['good_pieces'] for row in oee_data)
    total_rejected_pieces = sum(row['rejected_pieces'] for row in oee_data)
    
    # Overall rejection percentage
    total_inspected = sum(row['total_inspected'] for row in oee_data)
    overall_rejection_pct = (total_rejected_pieces / total_inspected * 100) if total_inspected > 0 else 0.0
    
    # Production efficiency percentage (Produced / Planned * 100)
    production_efficiency_pct = (total_produced_qty / total_planned_qty * 100) if total_planned_qty > 0 else 0.0
    
    return {
        'total_records': total_records,
        'avg_availability': round(avg_availability * 100, 2),
        'avg_performance': round(avg_performance * 100, 2),
        'avg_quality': round(avg_quality * 100, 2),
        'avg_oee': round(avg_oee, 2),
        'total_planned_qty': total_planned_qty,
        'total_produced_qty': total_produced_qty,
        'total_good_pieces': total_good_pieces,
        'total_rejected_pieces': total_rejected_pieces,
        'overall_rejection_pct': round(overall_rejection_pct, 2),
        # Additional metrics for Corrective Action Report
        'total_planned_pieces': int(total_planned_qty),
        'total_produced_pieces': int(total_produced_qty),
        'production_efficiency_pct': round(production_efficiency_pct, 2)
    }


@frappe.whitelist()
def get_available_processes():
    """
    Get list of available manufacturing processes
    
    Returns:
        list: List of process names
    """
    return [{'value': key, 'label': key} for key in PROCESS_ADAPTERS.keys()]


@frappe.whitelist()
def get_shift_options(production_date=None, process_type='Moulding'):
    """
    Get available shift options for the selected process
    
    Returns:
        list: List of shift options
    """
    if not production_date:
        production_date = today()
    
    # For now, return standard shifts
    # This could be made dynamic by querying actual shifts from production data
    return [
        {'value': 'all', 'label': 'All Shifts'},
        {'value': 'A', 'label': 'Shift A'},
        {'value': 'B', 'label': 'Shift B'},
        {'value': 'C', 'label': 'Shift C'}
    ]


@frappe.whitelist()
def get_reason_codes():
    """Return predefined CAR reason codes for resolution panel dropdown."""
    return [
        "COMPOUND SHORTAGE",
        "MACHINE BREAKDOWN",
        "MLD CHANGE",
        "MLD WASH / CLEAN",
        "OPERATOR ISSUE",
        "PLANNING",
        "QUALITY ISSUE",
        "TRIAL",
        "COMPOUND ISSUE",
        "SHELL SHORTAGE",
        "SHELL QUALITY ISSUE",
        "OPERATOR DELAY",
        "LOADING PLATE NOT AVAILABLE",
        "MOULD ISSUE",
    ]


@frappe.whitelist()
def save_production_resolution(production_entry: str, resolution_data=None, is_draft: bool = True, process_type: str = 'Moulding'):
    """Save CAR resolution data to Production Entry (process-specific DocType).
    Args:
        production_entry: Name of production entry document
        resolution_data: Dict or JSON string containing resolution fields
        is_draft: If True, sets status to In Progress; else Resolved
        process_type: Process type to resolve underlying DocType
    Returns: dict with success and updated status
    """
    try:
        # Coerce resolution_data to dict
        if resolution_data is None:
            resolution_data = {}
        elif isinstance(resolution_data, str):
            import json
            try:
                resolution_data = json.loads(resolution_data) if resolution_data else {}
            except Exception:
                resolution_data = {}
        elif not isinstance(resolution_data, dict):
            # Unknown type -> convert to dict best-effort
            resolution_data = frappe._dict(resolution_data)

        if not production_entry:
            return {"success": False, "error": "Missing production_entry"}

        # Resolve underlying DocType
        doctype = PRODUCTION_ENTRY_DOCTYPE.get(process_type) or PRODUCTION_ENTRY_DOCTYPE.get('Moulding')
        doc = None
        if doctype:
            try:
                doc = frappe.get_doc(doctype, production_entry)
            except Exception:
                doc = None
        if not doc:
            # Fallback: try by guessing common doctypes
            for dt in ['Moulding Production Entry', 'Production Entry']:
                try:
                    doc = frappe.get_doc(dt, production_entry)
                    if doc: break
                except Exception:
                    continue
        if not doc:
            return {"success": False, "error": "Production document not found"}
        if not doc.has_permission("write"):
            return {"success": False, "error": "No write permission for this record"}

        # Map fields
        field_map = {
            "reason_code": "reason_code",
            "problem_description": "problem_description",
            "root_cause": "root_cause",
            "corrective_action": "corrective_action",
            "responsible_person": "responsible_person",
            "target_completion_date": "target_completion_date",
            "resolution_remarks": "resolution_remarks",
        }
        meta = frappe.get_meta(doc.doctype)
        for k, f in field_map.items():
            if (k in resolution_data) and meta.get_field(f):
                doc.set(f, resolution_data.get(k))

        # Status and audit
        status = "In Progress" if is_draft else "Resolved"
        if meta.get_field("resolution_status"):
            doc.set("resolution_status", status)
        if not is_draft:
            from frappe.utils import now_datetime
            if meta.get_field("resolved_by"):
                doc.set("resolved_by", frappe.session.user)
            if meta.get_field("resolved_on"):
                doc.set("resolved_on", now_datetime())

        doc.save()
        frappe.db.commit()
        return {"success": True, "resolution_status": status}
    except Exception as e:
        frappe.log_error(f"save_production_resolution error: {frappe.get_traceback()}", "OEE Resolution Save")
        return {"success": False, "error": str(e)}


@frappe.whitelist()
def get_latest_production_date(process_type: str = 'Moulding'):
    """Return the most recent production date with posted entries for the given process.
    Defaults to today if none found.
    """
    try:
        if process_type == 'Moulding':
            dt = frappe.db.sql("""
                SELECT MAX(moulding_date) AS d
                FROM `tabMoulding Production Entry`
                WHERE docstatus = 1
            """, as_dict=True)
            latest = dt[0]['d'] if dt and dt[0] and dt[0]['d'] else None
            return latest or today()
        # Add other processes here as needed
        return today()
    except Exception:
        return today()


def check_lot_inspection_status(lot_number, process_type='Moulding'):
    """
    Check if Lot Inspection entry exists for a given lot and its submission status
    
    Args:
        lot_number: Lot number to check
        process_type: Process type (Moulding, etc.)
    
    Returns:
        dict: {
            'has_inspection': bool,
            'is_submitted': bool,
            'inspection_name': str or None,
            'status': 'Submitted' | 'Pending' | 'Not Found'
        }
    """
    if not lot_number:
        return {
            'has_inspection': False,
            'is_submitted': False,
            'inspection_name': None,
            'status': 'Not Found'
        }
    
    try:
        # Check for Lot Inspection Entry (can be in multiple doctypes)
        # First try the standard Inspection Entry doctype
        # NOTE: The field name is 'lot_no' not 'lot_number'
        inspection_entries = frappe.db.sql("""
            SELECT name, docstatus, inspection_type
            FROM `tabInspection Entry`
            WHERE lot_no = %s 
            AND inspection_type = 'Lot Inspection'
            ORDER BY creation DESC
            LIMIT 1
        """, (lot_number,), as_dict=True)
        
        if not inspection_entries:
            # Try alternative Lot Inspection Entry doctype if exists
            try:
                inspection_entries = frappe.db.sql("""
                    SELECT name, docstatus
                    FROM `tabLot Inspection Entry`
                    WHERE lot_number = %s 
                    ORDER BY creation DESC
                    LIMIT 1
                """, (lot_number,), as_dict=True)
            except Exception:
                pass
        
        if inspection_entries and len(inspection_entries) > 0:
            entry = inspection_entries[0]
            is_submitted = entry.get('docstatus') == 1
            
            return {
                'has_inspection': True,
                'is_submitted': is_submitted,
                'inspection_name': entry.get('name'),
                'status': 'Submitted' if is_submitted else 'Pending'
            }
        else:
            return {
                'has_inspection': False,
                'is_submitted': False,
                'inspection_name': None,
                'status': 'Not Found'
            }
    except Exception as e:
        frappe.log_error(f"Error checking lot inspection: {str(e)}", "Lot Inspection Check")
        return {
            'has_inspection': False,
            'is_submitted': False,
            'inspection_name': None,
            'status': 'Not Found'
        }
