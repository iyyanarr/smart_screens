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
def export_reports(filters=None, export_format='excel'):
    """
    Export OEE Reports to Excel/PDF
    """
    # Implementation for export functionality
    pass
