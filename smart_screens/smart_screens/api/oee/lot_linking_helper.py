"""
OEE Lot Linking Helper
Provides utility functions for automatically detecting and aggregating linked lots in OEE calculations
NEW: Auto-detects lots with same date + shift + press + item + operator
"""

import frappe
from frappe import _
from frappe.utils import flt


def get_linked_lot_info(lot_number, production_date, shift_type, machine_reference):
    """
    AUTO-DETECT if a lot is part of a linked group based on production context
    
    Logic: Lots are linked if they share:
    - Same production date
    - Same shift type
    - Same machine/press
    - Same item code
    - Same operator
    
    Args:
        lot_number: Lot number to check
        production_date: Production date
        shift_type: Shift type
        machine_reference: Machine/press reference
    
    Returns:
        dict: {
            'is_linked': True/False,
            'linked_lots': ['LOT-1', 'LOT-2', 'LOT-3'],
            'linked_lot_count': 3
        }
    """
    try:
        # Find the production entry for this lot
        prod_entry = frappe.db.sql("""
            SELECT 
                mpe.name,
                COALESCE(mpe.scan_lot_number, mpe.batch_no) as lot_number,
                mpe.moulding_date,
                mpe.item_to_produce as item_code,
                mpe.employee_name as operator_name,
                jc.shift_type,
                jc.workstation as machine_name
            FROM `tabMoulding Production Entry` mpe
            INNER JOIN `tabJob Card` jc ON mpe.job_card = jc.name
            WHERE COALESCE(mpe.scan_lot_number, mpe.batch_no) = %s
            AND mpe.moulding_date = %s
            AND jc.shift_type = %s
            AND mpe.docstatus = 1
            LIMIT 1
        """, (lot_number, production_date, shift_type), as_dict=True)
        
        if not prod_entry or len(prod_entry) == 0:
            return {
                'is_linked': False,
                'linked_lots': [],
                'linked_lot_count': 0
            }
        
        entry = prod_entry[0]
        
        # Find ALL lots with the same context IN THE SAME SHIFT
        # Link lots that share: date + shift + machine + item + operator
        # FIX: Count production ENTRIES, not just distinct lot numbers
        # This handles cases where the SAME lot number has multiple production entries
        all_lots = frappe.db.sql("""
            SELECT 
                COALESCE(mpe.scan_lot_number, mpe.batch_no) as lot_number,
                mpe.name as production_entry,
                mpe.creation
            FROM `tabMoulding Production Entry` mpe
            INNER JOIN `tabJob Card` jc ON mpe.job_card = jc.name
            WHERE mpe.moulding_date = %s
            AND jc.shift_type = %s
            AND jc.workstation = %s
            AND mpe.item_to_produce = %s
            AND mpe.employee_name = %s
            AND mpe.docstatus = 1
            ORDER BY mpe.creation ASC
        """, (
            entry['moulding_date'],
            entry['shift_type'],
            entry['machine_name'],
            entry['item_code'],
            entry['operator_name']
        ), as_dict=True)
        
        # FIX: Check if we have multiple ENTRIES (not just multiple lot numbers)
        # Case 1: Multiple different lot numbers (e.g., LOT-1, LOT-2, LOT-3) → LINKED
        # Case 2: Same lot number appearing multiple times (e.g., LOT-1, LOT-1) → LINKED
        if not all_lots or len(all_lots) <= 1:
            # Only 1 production entry found = not linked
            return {
                'is_linked': False,
                'linked_lots': [],
                'linked_lot_count': 0
            }
        
        # Multiple production entries found = LINKED!
        # Get unique lot numbers (may be the same lot or different lots)
        linked_lot_numbers = list(set([lot['lot_number'] for lot in all_lots]))
        
        return {
            'is_linked': True,
            'linked_lots': linked_lot_numbers,
            'linked_lot_count': len(linked_lot_numbers),
            'total_entries': len(all_lots)  # Total production entries (including duplicates)
        }
        
    except Exception as e:
        frappe.log_error(
            title="Get Linked Lot Info Error",
            message=f"Error auto-detecting lot linking for {lot_number}: {str(e)}\n{frappe.get_traceback()}"
        )
        return {
            'is_linked': False,
            'linked_lots': [],
            'linked_lot_count': 0
        }


def aggregate_production_data(linked_lots):
    """
    Aggregate production data across multiple linked lots
    
    NEW: Respects oee_include checkbox from OEE Lot Linking records
    Only includes production entries where oee_include = 1
    
    Args:
        linked_lots: List of lot numbers to aggregate
    
    Returns:
        dict: Aggregated production metrics
    """
    try:
        if not linked_lots or len(linked_lots) == 0:
            return {
                'total_lifts': 0,
                'total_weight_kg': 0,
                'total_pieces': 0,
                'total_target_qty': 0,
                'total_number_of_products': 0,
                'avg_downtime': 0,
                'entry_count': 0
            }
        
        # NEW: Get OEE Lot Linking record to check oee_include checkbox
        # FIX: Search by ANY of the linked lots in the child table, not just main_lot_number
        placeholders = ','.join(['%s'] * len(linked_lots))
        
        linking_records = frappe.db.sql(f"""
            SELECT DISTINCT parent.name, parent.main_lot_number, parent.production_date, parent.shift_type
            FROM `tabOEE Lot Linking` parent
            INNER JOIN `tabOEE Linked Lot Item` child ON child.parent = parent.name
            WHERE parent.status = 'Active'
            AND parent.docstatus < 2
            AND child.lot_number IN ({placeholders})
            ORDER BY parent.creation DESC
            LIMIT 1
        """, tuple(linked_lots), as_dict=True)
        
        # Get included production entries from OEE Lot Linking
        included_entries = []
        if linking_records and len(linking_records) > 0:
            linking_name = linking_records[0]['name']
            
            # Get child table rows where oee_include = 1
            included_rows = frappe.db.sql("""
                SELECT production_entry, lot_number
                FROM `tabOEE Linked Lot Item`
                WHERE parent = %s
                AND oee_include = 1
            """, (linking_name,), as_dict=True)
            
            included_entries = [row['production_entry'] for row in included_rows]
            
            # Log for debugging
            frappe.logger().info(
                f"OEE Lot Linking found: {linking_name}, Included entries: {len(included_entries)} out of total linked lots"
            )
        
        # If no OEE Lot Linking record exists, include all entries (default behavior)
        if not included_entries:
            # Fallback: Use all production entries for the linked lots
            fallback_placeholders = ','.join(['%s'] * len(linked_lots))
            fallback_query = f"""
                SELECT name
                FROM `tabMoulding Production Entry`
                WHERE COALESCE(scan_lot_number, batch_no) IN ({fallback_placeholders})
                AND docstatus = 1
            """
            fallback_result = frappe.db.sql(fallback_query, tuple(linked_lots), as_dict=True)
            included_entries = [row['name'] for row in fallback_result]
            
            frappe.logger().info(
                f"No OEE Lot Linking found for lots {linked_lots}, using all {len(included_entries)} entries"
            )
        
        # Now aggregate data from ONLY included entries
        if not included_entries:
            return {
                'total_lifts': 0,
                'total_weight_kg': 0,
                'total_pieces': 0,
                'total_target_qty': 0,
                'total_number_of_products': 0,
                'avg_downtime': 0,
                'entry_count': 0
            }
        
        entry_placeholders = ','.join(['%s'] * len(included_entries))
        
        # FIX: Query actual database fields and calculate target from Work Plan Item Target
        query = f"""
            SELECT 
                SUM(mpe.number_of_lifts) as total_lifts,
                SUM(mpe.weight) as total_weight_kg,
                SUM(mpe.number_of_lifts * mpe.no_of_running_cavities) as total_pieces,
                AVG(CAST(COALESCE(mpe.downtime_minutes, '0') AS DECIMAL(10,2))) as avg_downtime,
                COUNT(DISTINCT mpe.name) as entry_count,
                mpe.item_to_produce as item_code,
                jc.shift_type as shift_type
            FROM `tabMoulding Production Entry` mpe
            LEFT JOIN `tabJob Card` jc ON mpe.job_card = jc.name
            WHERE mpe.name IN ({entry_placeholders})
            AND mpe.docstatus = 1
            GROUP BY mpe.item_to_produce, jc.shift_type
            LIMIT 1
        """
        
        result = frappe.db.sql(query, tuple(included_entries), as_dict=True)
        
        if result and len(result) > 0:
            total_lifts = int(result[0].get('total_lifts', 0))
            total_pieces = int(result[0].get('total_pieces', 0))
            item_code = result[0].get('item_code')
            shift_type = result[0].get('shift_type')
            
            # Fetch target_qty from Work Plan Item Target
            total_target_qty = 0
            if item_code and shift_type:
                # Calculate shift duration
                shift_duration_query = """
                    SELECT
                        CASE
                            WHEN st.end_time > st.start_time THEN TIMEDIFF(st.end_time, st.start_time)
                            ELSE TIMEDIFF(ADDTIME(st.end_time, '24:00:00'), st.start_time)
                        END as shift_duration
                    FROM `tabShift Type` st
                    WHERE st.name = %s
                    LIMIT 1
                """
                shift_result = frappe.db.sql(shift_duration_query, (shift_type,), as_dict=True)
                
                if shift_result and len(shift_result) > 0:
                    shift_duration = str(shift_result[0].get('shift_duration'))
                    
                    # FIX: Handle both '8:00:00' and '08:00:00' formats
                    # Try both with and without leading zero
                    shift_durations_to_try = [shift_duration]
                    
                    # If shift_duration has microseconds, strip them
                    if '.' in shift_duration:
                        shift_duration = shift_duration.split('.')[0]
                        shift_durations_to_try.append(shift_duration)
                    
                    # If it starts with '0', also try without leading zero
                    if shift_duration.startswith('0'):
                        shift_durations_to_try.append(shift_duration[1:])
                    # If it doesn't start with '0', also try with leading zero
                    elif ':' in shift_duration:
                        hours = shift_duration.split(':')[0]
                        if len(hours) == 1:
                            shift_durations_to_try.append('0' + shift_duration)
                    
                    # Try to fetch target with different shift duration formats
                    for shift_dur in shift_durations_to_try:
                        target_query = """
                            SELECT target_qty
                            FROM `tabWork Plan Item Target`
                            WHERE item = %s
                            AND shift_type = %s
                            LIMIT 1
                        """
                        target_result = frappe.db.sql(target_query, (item_code, shift_dur), as_dict=True)
                        
                        if target_result and len(target_result) > 0:
                            # FIX: Target is per shift, NOT per lot! Don't multiply by number of linked lots
                            # All linked lots share the same shift target
                            total_target_qty = flt(target_result[0].get('target_qty', 0))
                            break  # Found target, no need to try other formats
            
            return {
                'total_lifts': total_lifts,
                'total_weight_kg': flt(result[0].get('total_weight_kg', 0)),
                'total_pieces': total_pieces,
                'total_target_qty': total_target_qty,
                'total_number_of_products': total_pieces,  # NoP = lifts × cavities
                'avg_downtime': flt(result[0].get('avg_downtime', 0)),
                'entry_count': int(result[0].get('entry_count', 0))
            }
        
        return {
            'total_lifts': 0,
            'total_weight_kg': 0,
            'total_pieces': 0,
            'total_target_qty': 0,
            'total_number_of_products': 0,
            'avg_downtime': 0,
            'entry_count': 0
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
            'total_target_qty': 0,
            'total_number_of_products': 0,
            'avg_downtime': 0,
            'entry_count': 0
        }


def aggregate_quality_data(linked_lots):
    """
    Aggregate quality/rejection data across multiple linked lots
    
    Formula: 
        Total Rejected = Sum of all rejected_qty across all lot inspections
        Total Inspected = Sum of all inspected_qty across all lot inspections
        Rejection % = (Total Rejected / Total Inspected) × 100
    
    FIX: Use 'inspected_qty_nos' field instead of 'total_inspected_qty_nos'
         because total_inspected_qty_nos is always 0 (not populated by the form)
    
    Args:
        linked_lots: List of lot numbers to aggregate
    
    Returns:
        dict: Aggregated quality metrics
    """
    try:
        if not linked_lots or len(linked_lots) == 0:
            return {
                'total_pieces': 0,
                'good_pieces': 0,
                'rejected_pieces': 0,
                'rejection_percentage': 0.0,
                'has_inspection': False
            }
        
        placeholders = ','.join(['%s'] * len(linked_lots))
        
        # FIX: Query the CORRECT field - 'inspected_qty_nos' not 'total_inspected_qty_nos'
        # The form saves data to 'inspected_qty_nos' but 'total_inspected_qty_nos' is always 0
        query = f"""
            SELECT 
                SUM(COALESCE(ie.inspected_qty_nos, 0)) as total_inspected,
                SUM(COALESCE(ie.total_rejected_qty, 0)) as total_rejected,
                AVG(COALESCE(ie.total_rejected_qty_in_percentage, 0)) as avg_rejection_pct
            FROM `tabInspection Entry` ie
            WHERE ie.lot_no IN ({placeholders})
            AND ie.inspection_type = 'Lot Inspection'
            AND ie.docstatus = 1
        """
        
        result = frappe.db.sql(query, tuple(linked_lots), as_dict=True)
        
        if result and len(result) > 0:
            total_inspected = flt(result[0].get('total_inspected', 0))
            total_rejected = flt(result[0].get('total_rejected', 0))
            avg_rejection_pct = flt(result[0].get('avg_rejection_pct', 0))
            
            # FIX: CASE 1 - total_inspected = 0 but total_rejected > 0
            # This means inspection entry has rejected quantities but didn't record inspected qty
            # Solution: Use actual production pieces as total inspected
            if total_inspected == 0 and total_rejected > 0:
                # Get total production pieces from linked lots
                prod_query = f"""
                    SELECT SUM(mpe.number_of_lifts * mpe.no_of_running_cavities) as total_pieces
                    FROM `tabMoulding Production Entry` mpe
                    WHERE COALESCE(mpe.scan_lot_number, mpe.batch_no) IN ({placeholders})
                    AND mpe.docstatus = 1
                """
                
                prod_result = frappe.db.sql(prod_query, tuple(linked_lots), as_dict=True)
                
                if prod_result and len(prod_result) > 0:
                    total_pieces = int(prod_result[0].get('total_pieces', 0))
                    good_pieces = total_pieces - int(total_rejected)
                    
                    # Calculate rejection percentage using production pieces
                    rejection_pct = 0.0
                    if total_pieces > 0:
                        rejection_pct = (total_rejected / total_pieces) * 100.0
                    
                    return {
                        'total_pieces': total_pieces,
                        'good_pieces': good_pieces,
                        'rejected_pieces': int(total_rejected),
                        'rejection_percentage': rejection_pct,
                        'has_inspection': True
                    }
            
            # FIX: CASE 2 - Both total_inspected and total_rejected are 0
            # Inspection entry exists but no data recorded
            if total_inspected == 0 and total_rejected == 0:
                return {
                    'total_pieces': 0,
                    'good_pieces': 0,
                    'rejected_pieces': 0,
                    'rejection_percentage': 0.0,
                    'has_inspection': True  # Inspection exists but no data
                }
            
            # FIX: CASE 3 - Both total_inspected and total_rejected have values
            # Normal inspection with complete data
            rejection_pct = 0.0
            if total_inspected > 0:
                rejection_pct = (total_rejected / total_inspected) * 100.0
            
            good_pieces = total_inspected - total_rejected
            
            return {
                'total_pieces': int(total_inspected),
                'good_pieces': int(good_pieces),
                'rejected_pieces': int(total_rejected),
                'rejection_percentage': rejection_pct,
                'has_inspection': total_inspected > 0 or total_rejected > 0
            }
        
        # No inspection found
        return {
            'total_pieces': 0,
            'good_pieces': 0,
            'rejected_pieces': 0,
            'rejection_percentage': 0.0,
            'has_inspection': False
        }
        
    except Exception as e:
        frappe.log_error(
            title="Aggregate Quality Data Error",
            message=f"Error aggregating quality for lots {linked_lots}: {str(e)}\n{frappe.get_traceback()}"
        )
        return {
            'total_pieces': 0,
            'good_pieces': 0,
            'rejected_pieces': 0,
            'rejection_percentage': 0.0,
            'has_inspection': False
        }


@frappe.whitelist()
def get_lot_breakdown_details(linked_lots):
    """
    Get detailed breakdown of production and quality for each linked lot
    Used for displaying in OEE Details Modal
    
    Args:
        linked_lots: List of lot numbers (can be JSON string or Python list)
    
    Returns:
        list: List of dicts with detailed metrics per lot
    """
    try:
        # Handle JSON string input from frontend
        if isinstance(linked_lots, str):
            import json
            linked_lots = json.loads(linked_lots) if linked_lots else []
        
        if not linked_lots or len(linked_lots) == 0:
            return []
        
        placeholders = ','.join(['%s'] * len(linked_lots))
        
        # Get production details per lot
        prod_query = f"""
            SELECT 
                COALESCE(mpe.scan_lot_number, mpe.batch_no) as lot_number,
                SUM(mpe.number_of_lifts) as lifts,
                SUM(mpe.weight) as weight_kg,
                SUM(mpe.number_of_lifts * mpe.no_of_running_cavities) as pieces
            FROM `tabMoulding Production Entry` mpe
            WHERE COALESCE(mpe.scan_lot_number, mpe.batch_no) IN ({placeholders})
            AND mpe.docstatus = 1
            GROUP BY COALESCE(mpe.scan_lot_number, mpe.batch_no)
            ORDER BY MIN(mpe.creation)
        """
        
        production_details = frappe.db.sql(prod_query, tuple(linked_lots), as_dict=True)
        
        # Get quality details per lot
        # FIX: Use 'inspected_qty_nos' instead of 'total_inspected_qty_nos'
        quality_query = f"""
            SELECT 
                ie.lot_no as lot_number,
                SUM(COALESCE(ie.inspected_qty_nos, 0)) as inspected,
                SUM(COALESCE(ie.total_rejected_qty, 0)) as rejected
            FROM `tabInspection Entry` ie
            WHERE ie.lot_no IN ({placeholders})
            AND ie.inspection_type = 'Lot Inspection'
            AND ie.docstatus = 1
            GROUP BY ie.lot_no
        """
        
        quality_details = frappe.db.sql(quality_query, tuple(linked_lots), as_dict=True)
        
        # Merge production and quality data
        quality_dict = {q['lot_number']: q for q in quality_details}
        
        breakdown = []
        for prod in production_details:
            lot = prod['lot_number']
            quality = quality_dict.get(lot, {})
            
            inspected = int(quality.get('inspected', 0))
            rejected = int(quality.get('rejected', 0))
            rejection_pct = (rejected / inspected * 100.0) if inspected > 0 else 0.0
            
            breakdown.append({
                'lot_number': lot,
                'lifts': flt(prod.get('lifts', 0)),
                'weight_kg': flt(prod.get('weight_kg', 0)),
                'pieces': int(prod.get('pieces', 0)),
                'inspected': inspected,
                'rejected': rejected,
                'rejection_pct': rejection_pct
            })
        
        return breakdown
        
    except Exception as e:
        frappe.log_error(
            title="Get Lot Breakdown Details Error",
            message=f"Error getting breakdown for lots {linked_lots}: {str(e)}\n{frappe.get_traceback()}"
        )
        return []
