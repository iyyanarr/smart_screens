"""
OEE Lot Linking Helper
Provides utility functions for detecting and aggregating linked lots in OEE calculations
"""

import frappe
from frappe import _
from frappe.utils import flt


def get_linked_lot_info(lot_number, production_date, shift_type, machine_reference):
    """
    Check if a lot is part of a linked group and return linking metadata
    
    Args:
        lot_number: Lot number to check
        production_date: Production date
        shift_type: Shift type
        machine_reference: Machine/press reference
    
    Returns:
        dict: {
            'is_linked': True/False,
            'is_main_lot': True/False,
            'main_lot': 'LOT-XXX',
            'all_lots': ['LOT-1', 'LOT-2', 'LOT-3'],
            'skip_this_lot': True/False
        }
    """
    try:
        # Check if lot linking exists for this lot
        linking = frappe.db.sql("""
            SELECT 
                parent.name as linking_name,
                parent.main_lot_number,
                parent.production_date,
                parent.shift_type,
                parent.machine_reference,
                GROUP_CONCAT(child.lot_number ORDER BY child.idx SEPARATOR ',') as all_lots
            FROM `tabOEE Lot Linking` parent
            INNER JOIN `tabOEE Linked Lot Item` child ON child.parent = parent.name
            WHERE parent.production_date = %s
                AND parent.shift_type = %s
                AND parent.machine_reference LIKE %s
                AND parent.status = 'Active'
                AND parent.docstatus = 1
                AND child.lot_number = %s
            GROUP BY parent.name, parent.main_lot_number, parent.production_date, 
                     parent.shift_type, parent.machine_reference
            LIMIT 1
        """, (production_date, shift_type, f"%{machine_reference}%", lot_number), as_dict=True)
        
        if not linking or len(linking) == 0:
            return {
                'is_linked': False,
                'is_main_lot': False,
                'main_lot': None,
                'all_lots': [],
                'skip_this_lot': False,
                'linked_lot_count': 0
            }
        
        linked_data = linking[0]
        linked_lots = linked_data['all_lots'].split(',')
        main_lot = linked_data['main_lot_number']
        
        # Only the MAIN lot should be processed; others are skipped
        is_main_lot = (lot_number == main_lot)
        skip_this_lot = not is_main_lot
        
        return {
            'is_linked': True,
            'is_main_lot': is_main_lot,
            'main_lot': main_lot,
            'all_lots': linked_lots,
            'skip_this_lot': skip_this_lot,
            'linked_lot_count': len(linked_lots),
            'linking_document': linked_data['linking_name']
        }
        
    except Exception as e:
        frappe.log_error(
            title="Get Linked Lot Info Error",
            message=f"Error checking lot linking for {lot_number}: {str(e)}\n{frappe.get_traceback()}"
        )
        return {
            'is_linked': False,
            'is_main_lot': False,
            'main_lot': None,
            'all_lots': [],
            'skip_this_lot': False,
            'linked_lot_count': 0
        }


def aggregate_production_data(linked_lots):
    """
    Aggregate production data across multiple linked lots
    
    Args:
        linked_lots: List of lot numbers to aggregate
    
    Returns:
        dict: Aggregated production metrics {
            'total_lifts': float,
            'total_weight_kg': float,
            'total_pieces': int,
            'avg_downtime': float,
            'entry_count': int,
            'lot_list': str
        }
    """
    try:
        if not linked_lots or len(linked_lots) == 0:
            return {
                'total_lifts': 0,
                'total_weight_kg': 0,
                'total_pieces': 0,
                'avg_downtime': 0,
                'entry_count': 0,
                'lot_list': ''
            }
        
        lot_numbers_str = "'" + "','".join(linked_lots) + "'"
        
        query = f"""
            SELECT 
                SUM(mpe.number_of_lifts) as total_lifts,
                SUM(mpe.weight) as total_weight_kg,
                SUM(mpe.number_of_lifts * mpe.no_of_running_cavities) as total_pieces,
                AVG(COALESCE(mpe.downtime_minutes, 0)) as avg_downtime,
                COUNT(DISTINCT mpe.name) as entry_count,
                GROUP_CONCAT(DISTINCT COALESCE(mpe.scan_lot_number, mpe.batch_no) 
                             ORDER BY mpe.creation SEPARATOR ', ') as lot_list
            FROM `tabMoulding Production Entry` mpe
            WHERE COALESCE(mpe.scan_lot_number, mpe.batch_no) IN ({lot_numbers_str})
            AND mpe.docstatus = 1
        """
        
        result = frappe.db.sql(query, as_dict=True)
        
        if result and len(result) > 0:
            return {
                'total_lifts': flt(result[0].get('total_lifts', 0)),
                'total_weight_kg': flt(result[0].get('total_weight_kg', 0)),
                'total_pieces': int(result[0].get('total_pieces', 0)),
                'avg_downtime': flt(result[0].get('avg_downtime', 0)),
                'entry_count': int(result[0].get('entry_count', 0)),
                'lot_list': result[0].get('lot_list', '')
            }
        
        return {
            'total_lifts': 0,
            'total_weight_kg': 0,
            'total_pieces': 0,
            'avg_downtime': 0,
            'entry_count': 0,
            'lot_list': ''
        }
        
    except Exception as e:
        frappe.log_error(
            title="Aggregate Production Data Error",
            message=f"Error aggregating production for lots {linked_lots}: {str(e)}\n{frappe.get_traceback()}"
        )
        return {
            'total_lifts': 0,
            'total_weight_kg': 0,
            'total_pieces': 0,
            'avg_downtime': 0,
            'entry_count': 0,
            'lot_list': ''
        }


def aggregate_quality_data(linked_lots):
    """
    Aggregate quality/rejection data across multiple linked lots
    
    Formula: 
        Total Rejected = Sum of all rejected_qty across all lot inspections
        Total Inspected = Sum of all inspected_qty across all lot inspections
        Rejection % = (Total Rejected / Total Inspected) × 100
    
    Args:
        linked_lots: List of lot numbers to aggregate
    
    Returns:
        dict: Aggregated quality metrics {
            'total_inspected': int,
            'total_rejected': int,
            'good_pieces': int,
            'rejection_percentage': float,
            'has_inspection': bool,
            'inspected_lot_count': int,
            'inspected_lots': str
        }
    """
    try:
        if not linked_lots or len(linked_lots) == 0:
            return {
                'total_inspected': 0,
                'total_rejected': 0,
                'good_pieces': 0,
                'rejection_percentage': 0.0,
                'has_inspection': False,
                'inspected_lot_count': 0,
                'inspected_lots': ''
            }
        
        lot_numbers_str = "'" + "','".join(linked_lots) + "'"
        
        query = f"""
            SELECT 
                SUM(COALESCE(ie.total_inspected_qty_nos, 0)) as total_inspected,
                SUM(COALESCE(ie.total_rejected_qty, 0)) as total_rejected,
                COUNT(DISTINCT ie.lot_no) as inspected_lot_count,
                GROUP_CONCAT(DISTINCT ie.lot_no ORDER BY ie.lot_no SEPARATOR ', ') as inspected_lots
            FROM `tabInspection Entry` ie
            WHERE ie.lot_no IN ({lot_numbers_str})
            AND ie.inspection_type = 'Lot Inspection'
            AND ie.docstatus = 1
        """
        
        result = frappe.db.sql(query, as_dict=True)
        
        if result and len(result) > 0:
            total_inspected = flt(result[0].get('total_inspected', 0))
            total_rejected = flt(result[0].get('total_rejected', 0))
            
            # Calculate aggregate rejection percentage
            rejection_pct = 0.0
            if total_inspected > 0:
                rejection_pct = (total_rejected / total_inspected) * 100.0
            
            good_pieces = total_inspected - total_rejected
            
            return {
                'total_inspected': int(total_inspected),
                'total_rejected': int(total_rejected),
                'good_pieces': int(good_pieces),
                'rejection_percentage': rejection_pct,
                'has_inspection': total_inspected > 0 or total_rejected > 0,
                'inspected_lot_count': int(result[0].get('inspected_lot_count', 0)),
                'inspected_lots': result[0].get('inspected_lots', '')
            }
        
        return {
            'total_inspected': 0,
            'total_rejected': 0,
            'good_pieces': 0,
            'rejection_percentage': 0.0,
            'has_inspection': False,
            'inspected_lot_count': 0,
            'inspected_lots': ''
        }
        
    except Exception as e:
        frappe.log_error(
            title="Aggregate Quality Data Error",
            message=f"Error aggregating quality for lots {linked_lots}: {str(e)}\n{frappe.get_traceback()}"
        )
        return {
            'total_inspected': 0,
            'total_rejected': 0,
            'good_pieces': 0,
            'rejection_percentage': 0.0,
            'has_inspection': False,
            'inspected_lot_count': 0,
            'inspected_lots': ''
        }


def get_lot_breakdown_details(linked_lots):
    """
    Get detailed breakdown of production and quality for each linked lot
    Used for displaying in OEE Details Modal
    
    Args:
        linked_lots: List of lot numbers
    
    Returns:
        list: List of dicts with detailed metrics per lot
    """
    try:
        if not linked_lots or len(linked_lots) == 0:
            return []
        
        lot_numbers_str = "'" + "','".join(linked_lots) + "'"
        
        # Get production details per lot
        prod_query = f"""
            SELECT 
                COALESCE(mpe.scan_lot_number, mpe.batch_no) as lot_number,
                SUM(mpe.number_of_lifts) as lifts,
                SUM(mpe.weight) as weight_kg,
                SUM(mpe.number_of_lifts * mpe.no_of_running_cavities) as pieces
            FROM `tabMoulding Production Entry` mpe
            WHERE COALESCE(mpe.scan_lot_number, mpe.batch_no) IN ({lot_numbers_str})
            AND mpe.docstatus = 1
            GROUP BY COALESCE(mpe.scan_lot_number, mpe.batch_no)
            ORDER BY mpe.creation
        """
        
        production_details = frappe.db.sql(prod_query, as_dict=True)
        
        # Get quality details per lot
        quality_query = f"""
            SELECT 
                ie.lot_no as lot_number,
                COALESCE(ie.total_inspected_qty_nos, 0) as inspected,
                COALESCE(ie.total_rejected_qty, 0) as rejected,
                COALESCE(ie.total_rejected_qty_in_percentage, 0) as rejection_pct
            FROM `tabInspection Entry` ie
            WHERE ie.lot_no IN ({lot_numbers_str})
            AND ie.inspection_type = 'Lot Inspection'
            AND ie.docstatus = 1
            ORDER BY ie.lot_no
        """
        
        quality_details = frappe.db.sql(quality_query, as_dict=True)
        
        # Merge production and quality data
        quality_dict = {q['lot_number']: q for q in quality_details}
        
        breakdown = []
        for prod in production_details:
            lot = prod['lot_number']
            quality = quality_dict.get(lot, {})
            
            breakdown.append({
                'lot_number': lot,
                'lifts': flt(prod.get('lifts', 0)),
                'weight_kg': flt(prod.get('weight_kg', 0)),
                'pieces': int(prod.get('pieces', 0)),
                'inspected': int(quality.get('inspected', 0)),
                'rejected': int(quality.get('rejected', 0)),
                'rejection_pct': flt(quality.get('rejection_pct', 0))
            })
        
        return breakdown
        
    except Exception as e:
        frappe.log_error(
            title="Get Lot Breakdown Details Error",
            message=f"Error getting breakdown for lots {linked_lots}: {str(e)}\n{frappe.get_traceback()}"
        )
        return []
