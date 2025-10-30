"""
Moulding Process Adapter
Implements OEE data extraction for Moulding Production Entry
Uses the same logic as Planned vs Actual Production report
"""

import frappe
from frappe.utils import flt, formatdate
from smart_screens.smart_screens.api.oee.process_adapter import ProcessAdapter

class MouldingAdapter(ProcessAdapter):
    """Adapter for Moulding Production Entry process"""
    
    def __init__(self):
        super().__init__()
        self.default_planned_time = 450  # 8 hours - 30 min lunch = 450 minutes
    
    def get_production_data(self, from_date, to_date, filters=None):
        """
        Fetch Moulding Production Entry data using the same logic as Planned vs Actual Production
        This aggregates production by date/shift/mould/lot and matches with work plans
        NOW INCLUDES: Machine name from Job Card's workstation field
        """
        
        # Build filter conditions
        prod_item_condition = ""
        prod_lot_condition = ""
        prod_shift_condition = ""
        item_condition = ""
        lot_condition = ""
        shift_condition = ""
        machine_condition = ""
        
        if filters:
            if filters.get('item'):
                prod_item_condition = f"AND mpe.item_to_produce LIKE '%{filters.get('item')}%'"
                item_condition = f"AND wpi.item LIKE '%{filters.get('item')}%'"
            
            if filters.get('lot'):
                prod_lot_condition = f"AND COALESCE(mpe.scan_lot_number, mpe.batch_no) LIKE '%{filters.get('lot')}%'"
                lot_condition = f"AND wpi.lot_number LIKE '%{filters.get('lot')}%'"
            
            if filters.get('shift') and filters.get('shift') != 'all':
                # Shift filter will be applied after joining with work plan
                shift_condition = f"AND wp.shift_type = '{filters.get('shift')}'"
            
            if filters.get('machine') and filters.get('machine').strip():
                # Machine filter - filter by workstation from Job Card
                machine_condition = f"AND jc.workstation LIKE '%{filters.get('machine')}%'"
        
        # STEP 1: Get aggregated production data with Job Card workstation (MACHINE NAME)
        production_query = f"""
            SELECT 
                mpe.moulding_date as production_date,
                mpe.mould_reference as mould_ref,
                COALESCE(mpe.scan_lot_number, mpe.batch_no) as lot_number,
                mpe.item_to_produce as item_code,
                SUM(mpe.number_of_lifts) as total_production_lifts,
                SUM(mpe.number_of_lifts * mpe.no_of_running_cavities) as total_pieces_produced,
                AVG(COALESCE(mpe.downtime_minutes, 0)) as avg_downtime_minutes,
                mpe.employee_name as operator_name,
                jc.workstation as machine_name,
                GROUP_CONCAT(mpe.name ORDER BY mpe.creation SEPARATOR '|||') as production_entry_names
            FROM `tabMoulding Production Entry` mpe
            LEFT JOIN `tabJob Card` jc ON mpe.job_card = jc.name
            WHERE mpe.moulding_date BETWEEN '{from_date}' AND '{to_date}'
            AND mpe.docstatus = 1
            AND COALESCE(mpe.scan_lot_number, mpe.batch_no) IS NOT NULL
            AND COALESCE(mpe.scan_lot_number, mpe.batch_no) != ''
            {prod_item_condition}
            {prod_lot_condition}
            {machine_condition}
            GROUP BY mpe.moulding_date, 
                     mpe.mould_reference, COALESCE(mpe.scan_lot_number, mpe.batch_no), 
                     mpe.item_to_produce, mpe.employee_name, jc.workstation
        """
        
        production_data = frappe.db.sql(production_query, as_dict=True)
        
        if not production_data:
            return []
        
        # Get unique lot numbers from production
        production_lot_numbers = list(set([prod['lot_number'] for prod in production_data]))
        lot_numbers_condition = "'" + "','".join(production_lot_numbers) + "'"
        
        # STEP 2: Get matching work plans for these lot numbers (shift comes from here)
        work_plan_query = f"""
            SELECT 
                wp.name as work_plan_no,
                wpi.lot_number,
                wpi.item as item_code,
                wpi.mould as mould_ref,
                ms.noof_cavities as no_of_cavities,
                COALESCE(wpit.target_qty, 0) as target_lifts,
                COALESCE(wp.shift_type, 'Unknown') as shift_type
            FROM `tabWork Planning` wp
            INNER JOIN `tabWork Plan Item` wpi ON wp.name = wpi.parent
            LEFT JOIN `tabMould Specification` ms ON wpi.mould = ms.mould_ref AND ms.docstatus = 1
            LEFT JOIN `tabWork Plan Item Target` wpit ON wpi.item = wpit.item
            WHERE wpi.lot_number IN ({lot_numbers_condition})
            AND wpi.mould IS NOT NULL
            AND wpi.lot_number IS NOT NULL
            AND wpi.lot_number != ''
            {item_condition}
            {lot_condition}
            {shift_condition}
        """
        
        work_plan_data = frappe.db.sql(work_plan_query, as_dict=True)
        
        # Create lookup dictionary for work plans by lot number
        work_plan_by_lot = {}
        for wp in work_plan_data:
            lot_no = wp['lot_number']
            if lot_no not in work_plan_by_lot:
                work_plan_by_lot[lot_no] = []
            work_plan_by_lot[lot_no].append(wp)
        
        # STEP 3: Merge production data with work plan data (same logic as Planned vs Actual)
        final_results = []
        
        for prod in production_data:
            lot_no = prod['lot_number']
            
            # Get first production entry name from the comma-separated list
            production_entry_names = prod.get('production_entry_names', '')
            first_production_entry = production_entry_names.split('|||')[0] if production_entry_names else f"{prod['production_date']}_Unknown_{lot_no}"
            
            # Find matching work plan by lot number (shift comes from work plan)
            matched_work_plan = None
            if lot_no in work_plan_by_lot:
                matched_work_plan = work_plan_by_lot[lot_no][0]  # Take first match
            
            # Get shift from work plan, default to 'Unknown' if no work plan
            shift_type = matched_work_plan.get('shift_type', 'Unknown') if matched_work_plan else 'Unknown'
            
            # Get machine name from Job Card workstation (NEW!)
            machine_name = prod.get('machine_name') or 'N/A'
            
            if matched_work_plan:
                # Merge production with work plan data
                result = {
                    'name': first_production_entry,  # Use actual production entry ID
                    'production_date': prod['production_date'],
                    'shift_type': shift_type,  # From work plan, not job card
                    'mould_reference': prod['mould_ref'],
                    'machine_name': machine_name,  # NEW: Actual machine from Job Card
                    'lot_number': lot_no,
                    'item_to_produce': matched_work_plan['item_code'],
                    'number_of_lifts': flt(prod['total_production_lifts']),
                    'no_of_running_cavities': flt(matched_work_plan.get('no_of_cavities', 0)),
                    'downtime_minutes': flt(prod.get('avg_downtime_minutes', 0)),
                    'operator_name': prod.get('operator_name', ''),
                    'weight': 0,
                    # Additional fields for OEE
                    'target_lifts': flt(matched_work_plan.get('target_lifts', 0)),
                    'total_pieces_produced': flt(prod['total_pieces_produced']),
                    'work_plan_no': matched_work_plan.get('work_plan_no', ''),
                    'production_entry_names': production_entry_names  # All related entries
                }
            else:
                # No work plan found - use production data only
                result = {
                    'name': first_production_entry,  # Use actual production entry ID
                    'production_date': prod['production_date'],
                    'shift_type': 'Unknown',  # No work plan = no shift info
                    'mould_reference': prod['mould_ref'],
                    'machine_name': machine_name,  # NEW: Actual machine from Job Card
                    'lot_number': lot_no,
                    'item_to_produce': prod['item_code'],
                    'number_of_lifts': flt(prod['total_production_lifts']),
                    'no_of_running_cavities': 0,  # Unknown without work plan
                    'downtime_minutes': flt(prod.get('avg_downtime_minutes', 0)),
                    'operator_name': prod.get('operator_name', ''),
                    'weight': 0,
                    # Additional fields for OEE
                    'target_lifts': 0,
                    'total_pieces_produced': flt(prod['total_pieces_produced']),
                    'work_plan_no': 'No Work Plan',
                    'production_entry_names': production_entry_names  # All related entries
                }
            
            final_results.append(result)
        
        return final_results
    
    def get_planned_time(self, production_entry):
        """Get planned production time in minutes"""
        # Default: 450 minutes (8 hours - 30 min lunch)
        return self.default_planned_time
    
    def get_downtime(self, production_entry):
        """Get downtime from custom field"""
        return flt(production_entry.get('downtime_minutes', 0))
    
    def get_target_quantity(self, production_entry):
        """Get target lifts from matched work plan data"""
        return flt(production_entry.get('target_lifts', 0))
    
    def get_actual_quantity(self, production_entry):
        """Get actual production lifts (NOT pieces)"""
        return flt(production_entry.get('number_of_lifts', 0))
    
    def calculate_cycle_time(self, production_entry):
        """
        Cycle Time = (Planned Production Time × 60) / Target Quantity
        Formula: (450 × 60) / target_lifts = seconds per lift
        """
        target = self.get_target_quantity(production_entry)
        if target == 0:
            return 0.0
        
        planned_time = self.get_planned_time(production_entry)
        cycle_time_seconds = (planned_time * 60.0) / target
        
        return cycle_time_seconds
    
    def get_quality_data(self, production_entry):
        """
        Fetch quality/rejection data from Inspection Entry (Lot Inspection type)
        
        Logic:
        1. Find Inspection Entry where inspection_type = 'Lot Inspection' and lot_no matches
        2. Extract total_inspected_qty_nos and total_rejected_qty
        3. If total_inspected_qty_nos is 0 but we have rejection data:
           - Use actual_production_pieces as total_inspected
           - Calculate quality = (total_pieces - rejected) / total_pieces
        4. If no inspection found, assume 100% quality (pending inspection)
        """
        lot_no = production_entry.get('lot_number')
        
        if not lot_no:
            return {
                'good_pieces': 0,
                'total_pieces': 0,
                'rejected_pieces': 0,
                'rejection_percentage': 0.0,
                'has_inspection': False
            }
        
        # Get latest Lot Inspection for this lot
        # inspection_type MUST be 'Lot Inspection' as per requirement
        inspection = frappe.db.sql("""
            SELECT 
                name,
                lot_no,
                inspection_type,
                posting_date,
                COALESCE(total_inspected_qty_nos, 0) as total_inspected,
                COALESCE(total_rejected_qty, 0) as total_rejected,
                COALESCE(total_rejected_qty_in_percentage, 0) as rejection_percentage,
                stock_entry_reference
            FROM `tabInspection Entry`
            WHERE lot_no = %s
            AND inspection_type = 'Lot Inspection'
            AND docstatus = 1
            ORDER BY posting_date DESC, creation DESC
            LIMIT 1
        """, (lot_no,), as_dict=True)
        
        if inspection and len(inspection) > 0:
            inspection_record = inspection[0]
            total_inspected = flt(inspection_record.total_inspected)
            total_rejected = flt(inspection_record.total_rejected)
            rejection_pct = flt(inspection_record.rejection_percentage)
            
            # CASE 1: total_inspected_qty_nos = 0, but we have rejection data
            # This means inspection entry has rejected quantities but didn't record inspected qty
            # Solution: Use actual production pieces as total inspected
            if total_inspected == 0 and total_rejected > 0:
                actual_pieces = flt(production_entry.get('total_pieces_produced', 0))
                good_pieces = actual_pieces - total_rejected
                
                return {
                    'good_pieces': int(good_pieces),
                    'total_pieces': int(actual_pieces),
                    'rejected_pieces': int(total_rejected),
                    'rejection_percentage': rejection_pct,
                    'inspection_entry': inspection_record.name,
                    'stock_entry_reference': inspection_record.stock_entry_reference,
                    'has_inspection': True
                }
            
            # CASE 2: Both total_inspected and total_rejected are 0
            # Inspection entry exists but no data recorded
            # Use actual production as total inspected with 100% quality
            if total_inspected == 0 and total_rejected == 0:
                actual_pieces = flt(production_entry.get('total_pieces_produced', 0))
                return {
                    'good_pieces': int(actual_pieces),
                    'total_pieces': int(actual_pieces),
                    'rejected_pieces': 0,
                    'rejection_percentage': 0.0,
                    'inspection_entry': inspection_record.name,
                    'stock_entry_reference': inspection_record.stock_entry_reference,
                    'has_inspection': True
                }
            
            # CASE 3: Both total_inspected and total_rejected have values
            # Normal inspection with complete data
            good_pieces = total_inspected - total_rejected
            
            return {
                'good_pieces': int(good_pieces),
                'total_pieces': int(total_inspected),
                'rejected_pieces': int(total_rejected),
                'rejection_percentage': rejection_pct,
                'inspection_entry': inspection_record.name,
                'stock_entry_reference': inspection_record.stock_entry_reference,
                'has_inspection': True
            }
        
        # No Lot Inspection found - assume 100% quality (inspection pending)
        actual_pieces = flt(production_entry.get('total_pieces_produced', 0))
        return {
            'good_pieces': int(actual_pieces),
            'total_pieces': int(actual_pieces),
            'rejected_pieces': 0,
            'rejection_percentage': 0.0,
            'inspection_entry': None,
            'stock_entry_reference': None,
            'has_inspection': False
        }
    
    def get_lot_number(self, production_entry):
        """Extract lot number"""
        return production_entry.get('lot_number', '')
    
    def get_machine_reference(self, production_entry):
        """Extract machine/mould reference"""
        return production_entry.get('mould_reference', '')
    
    def get_item_code(self, production_entry):
        """Extract item code"""
        return production_entry.get('item_to_produce', '')
    
    def get_shift_type(self, production_entry):
        """Extract shift type"""
        return production_entry.get('shift_type', 'Unknown')
    
    def get_production_date(self, production_entry):
        """Extract production date"""
        return production_entry.get('production_date')
