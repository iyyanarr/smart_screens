import frappe
from frappe import _
from frappe.utils import getdate, add_days, nowdate
import json
from datetime import datetime, timedelta

def get_context(context):
    """
    Context for the Production Analytics page
    """
    context.no_cache = 1
    context.show_sidebar = True
    
    # Set default filters
    context.from_date = add_days(nowdate(), -30)  # Last 30 days
    context.to_date = nowdate()
    
    # Get filter options
    context.inspectors = get_inspector_list()
    context.items = get_item_list()
    context.inspection_types = get_inspection_types()
    context.warehouses = get_warehouse_list()
    
    return context

@frappe.whitelist()
def get_production_analytics_data(filters=None):
    """
    Main API endpoint for fetching cross-doctype production data
    """
    if isinstance(filters, str):
        filters = json.loads(filters)
    
    if not filters:
        filters = {}
    
    # Set default date range if not provided
    if not filters.get('from_date'):
        filters['from_date'] = add_days(nowdate(), -30)
    if not filters.get('to_date'):
        filters['to_date'] = nowdate()
    
    try:
        # Get unified data from multiple doctypes
        data = get_unified_production_data(filters)
        
        # Calculate summary statistics
        summary = calculate_summary_stats(data)
        
        # Prepare chart data
        charts = prepare_chart_data(data, filters)
        
        return {
            'status': 'success',
            'data': data,
            'summary': summary,
            'charts': charts,
            'filters_applied': filters
        }
    
    except Exception as e:
        frappe.log_error(f"Production Analytics Error: {str(e)}")
        return {
            'status': 'error',
            'message': str(e),
            'data': [],
            'summary': {},
            'charts': {}
        }

def get_unified_production_data(filters):
    """
    Fetch data from multiple doctypes and unify them
    """
    conditions = build_filter_conditions(filters)
    
    query = f"""
    SELECT 
        'SPP Inspection Entry' as source_type,
        spp.name as document_name,
        spp.lot_no,
        spp.batch_no,
        spp.product_ref_no as item_code,
        spp.posting_date,
        spp.inspector_code,
        spp.inspection_type,
        spp.warehouse,
        spp.total_inspected_qty as inspected_qty,
        spp.total_rejected_qty as rejected_qty,
        spp.total_rejected_qty_in_percentage as rejection_percentage,
        spp.stock_entry_reference,
        spp.vs_pdir_stock_entry_ref as fg_stock_entry,
        spp.machine_no,
        spp.operator_name,
        spp.sample_or_trial,
        spp.moulding_production_completed,
        'Final Visual Inspection' as operation_type,
        spp.modified as last_modified
    FROM `tabSPP Inspection Entry` spp
    WHERE spp.docstatus != 2 {conditions['spp']}
    
    UNION ALL
    
    SELECT 
        'Inspection Entry' as source_type,
        ie.name as document_name,
        ie.lot_no,
        ie.batch_no,
        ie.product_ref_no as item_code,
        ie.posting_date,
        ie.inspector_code,
        ie.inspection_type,
        ie.source_warehouse as warehouse,
        ie.total_inspected_qty_nos as inspected_qty,
        ie.rejected_qty as rejected_qty,
        CASE 
            WHEN ie.total_inspected_qty_nos > 0 
            THEN (ie.rejected_qty * 100.0 / ie.total_inspected_qty_nos)
            ELSE 0 
        END as rejection_percentage,
        ie.vs_pdir_stock_entry_ref as stock_entry_reference,
        ie.vs_pdir_stock_entry_ref as fg_stock_entry,
        ie.machine_no,
        ie.operator_name,
        ie.sample_or_trial,
        0 as moulding_production_completed,
        ie.inspection_type as operation_type,
        ie.modified as last_modified
    FROM `tabInspection Entry` ie
    WHERE ie.docstatus != 2 {conditions['inspection']}
    
    ORDER BY posting_date DESC, lot_no, source_type
    """
    
    return frappe.db.sql(query, filters, as_dict=True)

def build_filter_conditions(filters):
    """
    Build WHERE conditions for different doctypes
    """
    conditions = {
        'spp': '',
        'inspection': '',
        'moulding': '',
        'stock_entry': ''
    }
    
    # Date range filter
    if filters.get('from_date'):
        conditions['spp'] += " AND spp.posting_date >= %(from_date)s"
        conditions['inspection'] += " AND ie.posting_date >= %(from_date)s"
    
    if filters.get('to_date'):
        conditions['spp'] += " AND spp.posting_date <= %(to_date)s"
        conditions['inspection'] += " AND ie.posting_date <= %(to_date)s"
    
    # Inspector filter
    if filters.get('inspector'):
        conditions['spp'] += " AND spp.inspector_code = %(inspector)s"
        conditions['inspection'] += " AND ie.inspector_code = %(inspector)s"
    
    # Item filter
    if filters.get('item_code'):
        conditions['spp'] += " AND spp.product_ref_no = %(item_code)s"
        conditions['inspection'] += " AND ie.product_ref_no = %(item_code)s"
    
    # Inspection type filter
    if filters.get('inspection_type'):
        conditions['spp'] += " AND spp.inspection_type = %(inspection_type)s"
        conditions['inspection'] += " AND ie.inspection_type = %(inspection_type)s"
    
    # Lot number filter
    if filters.get('lot_no'):
        conditions['spp'] += " AND spp.lot_no LIKE %(lot_no)s"
        conditions['inspection'] += " AND ie.lot_no LIKE %(lot_no)s"
        filters['lot_no'] = f"%{filters['lot_no']}%"
    
    # Warehouse filter
    if filters.get('warehouse'):
        conditions['spp'] += " AND spp.warehouse = %(warehouse)s"
        conditions['inspection'] += " AND ie.source_warehouse = %(warehouse)s"
    
    return conditions

def calculate_summary_stats(data):
    """
    Calculate summary statistics from the data
    """
    if not data:
        return {}
    
    total_inspected = sum(float(row.get('inspected_qty') or 0) for row in data)
    total_rejected = sum(float(row.get('rejected_qty') or 0) for row in data)
    overall_rejection_rate = (total_rejected / total_inspected * 100) if total_inspected > 0 else 0
    
    # Group by source type
    spp_entries = [row for row in data if row.source_type == 'SPP Inspection Entry']
    inspection_entries = [row for row in data if row.source_type == 'Inspection Entry']
    
    # Group by inspector
    inspector_stats = {}
    for row in data:
        inspector = row.get('inspector_code')
        if inspector not in inspector_stats:
            inspector_stats[inspector] = {
                'inspected': 0,
                'rejected': 0,
                'count': 0
            }
        inspector_stats[inspector]['inspected'] += float(row.get('inspected_qty') or 0)
        inspector_stats[inspector]['rejected'] += float(row.get('rejected_qty') or 0)
        inspector_stats[inspector]['count'] += 1
    
    # Calculate rejection rates per inspector
    for inspector in inspector_stats:
        stats = inspector_stats[inspector]
        stats['rejection_rate'] = (stats['rejected'] / stats['inspected'] * 100) if stats['inspected'] > 0 else 0
    
    return {
        'total_records': len(data),
        'total_inspected_qty': total_inspected,
        'total_rejected_qty': total_rejected,
        'overall_rejection_rate': round(overall_rejection_rate, 2),
        'spp_entries_count': len(spp_entries),
        'inspection_entries_count': len(inspection_entries),
        'unique_lots': len(set(row.get('lot_no') for row in data if row.get('lot_no'))),
        'unique_items': len(set(row.get('item_code') for row in data if row.get('item_code'))),
        'date_range': {
            'from': min(row.get('posting_date') for row in data if row.get('posting_date')),
            'to': max(row.get('posting_date') for row in data if row.get('posting_date'))
        },
        'inspector_performance': inspector_stats
    }

def prepare_chart_data(data, filters):
    """
    Prepare data for various charts and visualizations
    """
    if not data:
        return {}
    
    # Timeline chart data (rejection rate over time)
    timeline_data = {}
    for row in data:
        date = str(row.get('posting_date') or '')
        if date not in timeline_data:
            timeline_data[date] = {
                'inspected': 0,
                'rejected': 0,
                'entries': 0
            }
        timeline_data[date]['inspected'] += float(row.get('inspected_qty') or 0)
        timeline_data[date]['rejected'] += float(row.get('rejected_qty') or 0)
        timeline_data[date]['entries'] += 1
    
    # Calculate rejection rates for timeline
    timeline_chart = []
    for date in sorted(timeline_data.keys()):
        stats = timeline_data[date]
        rejection_rate = (stats['rejected'] / stats['inspected'] * 100) if stats['inspected'] > 0 else 0
        timeline_chart.append({
            'date': date,
            'rejection_rate': round(rejection_rate, 2),
            'inspected_qty': stats['inspected'],
            'rejected_qty': stats['rejected'],
            'entries': stats['entries']
        })
    
    # Inspector performance chart
    inspector_chart = []
    inspector_stats = {}
    for row in data:
        inspector = row.get('inspector_code')
        if inspector not in inspector_stats:
            inspector_stats[inspector] = {
                'inspected': 0,
                'rejected': 0,
                'entries': 0
            }
        inspector_stats[inspector]['inspected'] += float(row.get('inspected_qty') or 0)
        inspector_stats[inspector]['rejected'] += float(row.get('rejected_qty') or 0)
        inspector_stats[inspector]['entries'] += 1
    
    for inspector, stats in inspector_stats.items():
        rejection_rate = (stats['rejected'] / stats['inspected'] * 100) if stats['inspected'] > 0 else 0
        inspector_chart.append({
            'inspector': inspector,
            'rejection_rate': round(rejection_rate, 2),
            'total_inspected': stats['inspected'],
            'total_rejected': stats['rejected'],
            'entries_count': stats['entries']
        })
    
    # Item-wise analysis
    item_chart = []
    item_stats = {}
    for row in data:
        item = row.get('item_code')
        if item not in item_stats:
            item_stats[item] = {
                'inspected': 0,
                'rejected': 0,
                'entries': 0
            }
        item_stats[item]['inspected'] += float(row.get('inspected_qty') or 0)
        item_stats[item]['rejected'] += float(row.get('rejected_qty') or 0)
        item_stats[item]['entries'] += 1
    
    for item, stats in item_stats.items():
        rejection_rate = (stats['rejected'] / stats['inspected'] * 100) if stats['inspected'] > 0 else 0
        item_chart.append({
            'item_code': item,
            'rejection_rate': round(rejection_rate, 2),
            'total_inspected': stats['inspected'],
            'total_rejected': stats['rejected'],
            'entries_count': stats['entries']
        })
    
    return {
        'timeline': timeline_chart,
        'inspector_performance': sorted(inspector_chart, key=lambda x: x['rejection_rate'], reverse=True),
        'item_analysis': sorted(item_chart, key=lambda x: x['rejection_rate'], reverse=True),
        'source_distribution': {
            'spp_entries': len([row for row in data if row.source_type == 'SPP Inspection Entry']),
            'inspection_entries': len([row for row in data if row.source_type == 'Inspection Entry'])
        }
    }

# Helper functions for filter options
def get_inspector_list():
    """Get list of active inspectors"""
    return frappe.db.sql("""
        SELECT DISTINCT inspector_code as value, inspector_name as label
        FROM `tabSPP Inspection Entry`
        WHERE inspector_code IS NOT NULL
        UNION
        SELECT DISTINCT inspector_code as value, inspector_name as label
        FROM `tabInspection Entry`
        WHERE inspector_code IS NOT NULL
        ORDER BY label
    """, as_dict=True)

def get_item_list():
    """Get list of items from inspection entries"""
    return frappe.db.sql("""
        SELECT DISTINCT product_ref_no as value, product_ref_no as label
        FROM `tabSPP Inspection Entry`
        WHERE product_ref_no IS NOT NULL
        UNION
        SELECT DISTINCT product_ref_no as value, product_ref_no as label
        FROM `tabInspection Entry`
        WHERE product_ref_no IS NOT NULL
        ORDER BY label
    """, as_dict=True)

def get_inspection_types():
    """Get list of inspection types"""
    return [
        {'value': 'Final Visual Inspection', 'label': 'Final Visual Inspection'},
        {'value': 'Line Inspection', 'label': 'Line Inspection'},
        {'value': 'Lot Inspection', 'label': 'Lot Inspection'},
        {'value': 'Patrol Inspection', 'label': 'Patrol Inspection'},
        {'value': 'Incoming Inspection', 'label': 'Incoming Inspection'}
    ]

def get_warehouse_list():
    """Get list of warehouses"""
    return frappe.db.sql("""
        SELECT name as value, name as label
        FROM `tabWarehouse`
        WHERE disabled = 0
        ORDER BY name
    """, as_dict=True)
