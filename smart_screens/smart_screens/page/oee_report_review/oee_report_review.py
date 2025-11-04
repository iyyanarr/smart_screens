"""
OEE Report Review Page - Backend API
Provides comprehensive review and analysis of Daily OEE Reports
"""

import frappe
from frappe import _
from frappe.utils import flt, formatdate, today, add_days, getdate
import json

@frappe.whitelist()
def get_reports_summary(filters=None):
    """
    Get summary statistics for OEE Reports
    
    Args:
        filters: {
            from_date, to_date, shift_filter, machine_filter,
            oee_range, resolution_status
        }
    
    Returns:
        dict: Summary metrics
    """
    if isinstance(filters, str):
        filters = json.loads(filters)
    
    filters = filters or {}
    from_date = filters.get('from_date') or add_days(today(), -30)
    to_date = filters.get('to_date') or today()
    
    # Build SQL filters
    conditions = ["der.production_date BETWEEN %(from_date)s AND %(to_date)s"]
    params = {'from_date': from_date, 'to_date': to_date}
    
    if filters.get('shift_filter'):
        conditions.append("der.shift_filter = %(shift_filter)s")
        params['shift_filter'] = filters.get('shift_filter')
    
    if filters.get('machine_filter'):
        conditions.append("der.machine_filter LIKE %(machine_filter)s")
        params['machine_filter'] = f"%{filters.get('machine_filter')}%"
    
    where_clause = " AND ".join(conditions)
    
    # Get summary statistics
    summary = frappe.db.sql(f"""
        SELECT 
            COUNT(DISTINCT der.name) as total_reports,
            COUNT(DISTINCT der.production_date) as unique_dates,
            AVG(der.avg_oee) as overall_avg_oee,
            AVG(der.avg_availability) as overall_avg_availability,
            AVG(der.avg_performance) as overall_avg_performance,
            AVG(der.avg_quality) as overall_avg_quality,
            SUM(der.total_records) as total_production_records,
            SUM(CASE WHEN der.docstatus = 1 THEN 1 ELSE 0 END) as submitted_reports,
            SUM(CASE WHEN der.docstatus = 0 THEN 1 ELSE 0 END) as draft_reports
        FROM `tabDaily OEE Report` der
        WHERE {where_clause}
    """, params, as_dict=True)[0]
    
    # Get resolution statistics
    resolution_stats = frappe.db.sql(f"""
        SELECT 
            upr.resolution_status,
            COUNT(*) as count
        FROM `tabDaily OEE Report` der
        INNER JOIN `tabUnresolved Production Record` upr 
            ON upr.parent = der.name
        WHERE {where_clause}
        GROUP BY upr.resolution_status
    """, params, as_dict=True)
    
    # Convert to dict
    resolution_summary = {
        'Pending': 0,
        'In Progress': 0,
        'Resolved': 0
    }
    for stat in resolution_stats:
        resolution_summary[stat['resolution_status'] or 'Pending'] = stat['count']
    
    return {
        'total_reports': summary['total_reports'] or 0,
        'unique_dates': summary['unique_dates'] or 0,
        'overall_avg_oee': round(summary['overall_avg_oee'] or 0, 2),
        'overall_avg_availability': round(summary['overall_avg_availability'] or 0, 2),
        'overall_avg_performance': round(summary['overall_avg_performance'] or 0, 2),
        'overall_avg_quality': round(summary['overall_avg_quality'] or 0, 2),
        'total_production_records': summary['total_production_records'] or 0,
        'submitted_reports': summary['submitted_reports'] or 0,
        'draft_reports': summary['draft_reports'] or 0,
        'resolution_summary': resolution_summary
    }


@frappe.whitelist()
def get_reports_list(filters=None, start=0, page_length=20):
    """
    Get paginated list of OEE Reports with filtering
    
    Returns:
        dict: {data: list, total_count: int}
    """
    if isinstance(filters, str):
        filters = json.loads(filters)
    
    filters = filters or {}
    from_date = filters.get('from_date') or add_days(today(), -30)
    to_date = filters.get('to_date') or today()
    
    # Build conditions
    conditions = ["der.production_date BETWEEN %(from_date)s AND %(to_date)s"]
    params = {
        'from_date': from_date, 
        'to_date': to_date,
        'start': int(start),
        'page_length': int(page_length)
    }
    
    if filters.get('shift_filter'):
        conditions.append("der.shift_filter = %(shift_filter)s")
        params['shift_filter'] = filters.get('shift_filter')
    
    if filters.get('machine_filter'):
        conditions.append("der.machine_filter LIKE %(machine_filter)s")
        params['machine_filter'] = f"%{filters.get('machine_filter')}%"
    
    if filters.get('oee_range'):
        oee_range = filters.get('oee_range')
        if oee_range == 'low':
            conditions.append("der.avg_oee < 70")
        elif oee_range == 'medium':
            conditions.append("der.avg_oee BETWEEN 70 AND 85")
        elif oee_range == 'high':
            conditions.append("der.avg_oee > 85")
    
    where_clause = " AND ".join(conditions)
    
    # Get total count
    total_count = frappe.db.sql(f"""
        SELECT COUNT(DISTINCT der.name)
        FROM `tabDaily OEE Report` der
        WHERE {where_clause}
    """, params)[0][0]
    
    # Get paginated data
    reports = frappe.db.sql(f"""
        SELECT 
            der.name,
            der.production_date,
            der.report_date,
            der.shift_filter,
            der.machine_filter,
            der.total_records,
            der.avg_availability,
            der.avg_performance,
            der.avg_quality,
            der.avg_oee,
            der.docstatus,
            COUNT(upr.name) as total_production_records,
            SUM(CASE WHEN upr.resolution_status = 'Pending' THEN 1 ELSE 0 END) as pending_count,
            SUM(CASE WHEN upr.resolution_status = 'In Progress' THEN 1 ELSE 0 END) as in_progress_count,
            SUM(CASE WHEN upr.resolution_status = 'Resolved' THEN 1 ELSE 0 END) as resolved_count,
            SUM(CASE WHEN upr.oee_pct < 70 THEN 1 ELSE 0 END) as critical_count,
            AVG(upr.oee_pct) as avg_record_oee
        FROM `tabDaily OEE Report` der
        LEFT JOIN `tabUnresolved Production Record` upr ON upr.parent = der.name
        WHERE {where_clause}
        GROUP BY der.name
        ORDER BY der.production_date DESC, der.creation DESC
        LIMIT %(start)s, %(page_length)s
    """, params, as_dict=True)
    
    # Format dates
    for report in reports:
        report['production_date_formatted'] = formatdate(report['production_date'])
        report['report_date_formatted'] = formatdate(report['report_date'])
        report['status_label'] = 'Submitted' if report['docstatus'] == 1 else 'Draft'
        report['avg_oee'] = round(report['avg_oee'] or 0, 2)
        report['avg_availability'] = round(report['avg_availability'] or 0, 2)
        report['avg_performance'] = round(report['avg_performance'] or 0, 2)
        report['avg_quality'] = round(report['avg_quality'] or 0, 2)
    
    return {
        'data': reports,
        'total_count': total_count
    }


@frappe.whitelist()
def get_report_details(report_name):
    """
    Get detailed information for a specific report including child records
    """
    # Get parent report
    report = frappe.get_doc('Daily OEE Report', report_name)
    
    # Get child records
    production_records = frappe.db.sql("""
        SELECT 
            upr.*,
            car.reason_code,
            car.problem_description,
            car.corrective_action_details
        FROM `tabUnresolved Production Record` upr
        LEFT JOIN `tabCorrective Action Resolved` car 
            ON car.name = upr.resolved_record
        WHERE upr.parent = %s
        ORDER BY upr.oee_pct ASC
    """, (report_name,), as_dict=True)
    
    return {
        'report': report.as_dict(),
        'production_records': production_records
    }


@frappe.whitelist()
def get_analytics_data(filters=None):
    """
    Get analytics data for charts and insights
    """
    if isinstance(filters, str):
        filters = json.loads(filters)
    
    filters = filters or {}
    from_date = filters.get('from_date') or add_days(today(), -30)
    to_date = filters.get('to_date') or today()
    
    # OEE Trend over time
    oee_trend = frappe.db.sql("""
        SELECT 
            production_date,
            AVG(avg_oee) as avg_oee,
            AVG(avg_availability) as avg_availability,
            AVG(avg_performance) as avg_performance,
            AVG(avg_quality) as avg_quality,
            COUNT(*) as report_count
        FROM `tabDaily OEE Report`
        WHERE production_date BETWEEN %(from_date)s AND %(to_date)s
        GROUP BY production_date
        ORDER BY production_date
    """, {'from_date': from_date, 'to_date': to_date}, as_dict=True)
    
    # Top problematic machines
    top_machines = frappe.db.sql("""
        SELECT 
            upr.machine_reference,
            COUNT(*) as issue_count,
            AVG(upr.oee_pct) as avg_oee,
            SUM(CASE WHEN upr.oee_pct < 70 THEN 1 ELSE 0 END) as critical_count
        FROM `tabDaily OEE Report` der
        INNER JOIN `tabUnresolved Production Record` upr ON upr.parent = der.name
        WHERE der.production_date BETWEEN %(from_date)s AND %(to_date)s
        AND upr.oee_pct < 90
        GROUP BY upr.machine_reference
        ORDER BY issue_count DESC
        LIMIT 10
    """, {'from_date': from_date, 'to_date': to_date}, as_dict=True)
    
    # Most common reason codes
    reason_codes = frappe.db.sql("""
        SELECT 
            car.reason_code,
            COUNT(*) as frequency,
            AVG(upr.oee_pct) as avg_oee_impact
        FROM `tabDaily OEE Report` der
        INNER JOIN `tabUnresolved Production Record` upr ON upr.parent = der.name
        INNER JOIN `tabCorrective Action Resolved` car ON car.name = upr.resolved_record
        WHERE der.production_date BETWEEN %(from_date)s AND %(to_date)s
        AND car.reason_code IS NOT NULL
        GROUP BY car.reason_code
        ORDER BY frequency DESC
        LIMIT 10
    """, {'from_date': from_date, 'to_date': to_date}, as_dict=True)
    
    # Shift-wise comparison
    shift_comparison = frappe.db.sql("""
        SELECT 
            shift_filter,
            COUNT(*) as report_count,
            AVG(avg_oee) as avg_oee,
            AVG(avg_availability) as avg_availability,
            AVG(avg_performance) as avg_performance,
            AVG(avg_quality) as avg_quality
        FROM `tabDaily OEE Report`
        WHERE production_date BETWEEN %(from_date)s AND %(to_date)s
        AND shift_filter != ''
        GROUP BY shift_filter
        ORDER BY shift_filter
    """, {'from_date': from_date, 'to_date': to_date}, as_dict=True)
    
    return {
        'oee_trend': oee_trend,
        'top_machines': top_machines,
        'reason_codes': reason_codes,
        'shift_comparison': shift_comparison
    }


@frappe.whitelist()
def get_car_details(car_name):
    """
    Get full Corrective Action Report details for modal display

    Args:
        car_name: Name of the Corrective Action Resolved record

    Returns:
        dict: Full CAR details including all fields
    """
    if not car_name:
        return None

    try:
        car_doc = frappe.get_doc('Corrective Action Resolved', car_name)

        # If production data is missing on CAR, fetch from linked Production Entry
        prod_entry = None
        if car_doc.production_entry:
            try:
                prod_entry = frappe.get_doc('Moulding Production Entry', car_doc.production_entry)
            except:
                pass

        # Use CAR data if available, otherwise fallback to production entry
        machine_reference = car_doc.machine_reference or (prod_entry.mould_reference if prod_entry else None)
        item_code = car_doc.item_code or (prod_entry.item_to_produce if prod_entry else None)
        lot_number = car_doc.lot_number or ((prod_entry.scan_lot_number or prod_entry.batch_no) if prod_entry else None)
        shift_type = car_doc.shift_type or (prod_entry.shift_type if prod_entry else None)
        operator_name = car_doc.operator_name or (getattr(prod_entry, 'operator_name', None) if prod_entry else None)
        production_date = car_doc.production_date or (prod_entry.moulding_date if prod_entry else None)

        # Calculate quantities if from production entry
        if prod_entry and not car_doc.actual_quantity:
            actual_quantity = (prod_entry.number_of_lifts or 0) * (prod_entry.no_of_running_cavities or 0)
            target_quantity = car_doc.target_quantity or 0
            variance_qty = actual_quantity - target_quantity
        else:
            actual_quantity = car_doc.actual_quantity
            target_quantity = car_doc.target_quantity
            variance_qty = car_doc.variance_qty

        # Return comprehensive CAR data
        return {
            'name': car_doc.name,
            'naming_series': car_doc.naming_series,

            # Reference Information
            'parent_car_unresolved': car_doc.parent_car_unresolved,
            'parent_daily_oee_report': car_doc.parent_daily_oee_report,
            'production_entry': car_doc.production_entry,
            'production_date': production_date,
            'production_date_formatted': formatdate(production_date) if production_date else '',
            'resolved_date': car_doc.resolved_date,
            'resolved_date_formatted': formatdate(car_doc.resolved_date) if car_doc.resolved_date else '',
            'resolved_by': car_doc.resolved_by,

            # Production Data (from CAR or Production Entry)
            'shift_type': shift_type,
            'operator_name': operator_name,
            'machine_reference': machine_reference,
            'item_code': item_code,
            'lot_number': lot_number,
            'target_quantity': target_quantity,
            'actual_quantity': actual_quantity,
            'variance_qty': variance_qty,
            'oee_pct': car_doc.oee_pct,
            'production_efficiency_pct': car_doc.production_efficiency_pct,
            'rejection_percentage': car_doc.rejection_percentage,

            # Root Cause Analysis
            'reason_code': car_doc.reason_code,
            'problem_description': car_doc.problem_description,
            'corrective_action_code': car_doc.corrective_action_code,
            'corrective_action_details': car_doc.corrective_action_details,

            # Tracking
            'scan_operator': car_doc.scan_operator,
            'target_date': car_doc.target_date,
            'target_date_formatted': formatdate(car_doc.target_date) if car_doc.target_date else '',
            'status': car_doc.status,
            'completion_date': car_doc.completion_date,
            'completion_date_formatted': formatdate(car_doc.completion_date) if car_doc.completion_date else '',

            # Remarks
            'remarks': car_doc.remarks
        }
    except frappe.DoesNotExistError:
        frappe.throw(_('Corrective Action Report {0} not found').format(car_name))
    except Exception as e:
        frappe.log_error(message=str(e), title='Error fetching CAR details')
        frappe.throw(_('Error fetching CAR details: {0}').format(str(e)))


@frappe.whitelist()
def export_reports(filters=None, export_format='excel'):
    """
    Export OEE Reports to Excel/PDF
    """
    # Implementation for export functionality
    pass
