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
        Fetch Moulding Production Entry data using Work Planning as primary source
        
        NEW LOGIC:
        1. Filter Work Planning and Add-on Work Planning by their DATE field (from_date to to_date)
        2. Get lot numbers from these work plans
        3. Pull Moulding Production Entry records matching those lot numbers (regardless of moulding_date)
        4. Match production data with work plan data by lot number
        
        This ensures the report is based on PLANNED date, not posting date
        """
        
        # Build filter conditions for Work Planning
        item_condition = ""
        lot_condition = ""
        shift_condition = ""
        
        if filters:
            if filters.get('item'):
                item_condition = f"AND wpi.item LIKE '%{filters.get('item')}%'"
            
            if filters.get('lot'):
                lot_condition = f"AND wpi.lot_number LIKE '%{filters.get('lot')}%'"
            
            if filters.get('shift') and filters.get('shift') != 'all':
                shift_condition = f"AND wp.shift_type = '{filters.get('shift')}'"
        
        # STEP 1: Get Work Planning data filtered by DATE (from_date to to_date)
        # FIX: Use subqueries instead of LEFT JOINs to prevent Cartesian product duplicates
        work_plan_query = f"""
            SELECT
                wp.name as work_plan_no,
                wp.date as planned_date,
                wpi.lot_number,
                wpi.item as item_code,
                wpi.mould as mould_ref,
                (SELECT noof_cavities
                 FROM `tabMould Specification`
                 WHERE mould_ref = wpi.mould
                   AND spp_ref = wpi.item
                   AND docstatus = 1
                 ORDER BY creation DESC
                 LIMIT 1) as no_of_cavities,
                (SELECT wpit.target_qty
                 FROM `tabWork Plan Item Target` wpit
                 WHERE wpit.item = wpi.item
                   AND wpit.shift_type = (
                       SELECT
                           CASE
                               WHEN st.end_time > st.start_time THEN TIMEDIFF(st.end_time, st.start_time)
                               ELSE TIMEDIFF(ADDTIME(st.end_time, '24:00:00'), st.start_time)
                           END
                       FROM `tabShift Type` st
                       WHERE st.name = wp.shift_type
                       LIMIT 1
                   )
                 LIMIT 1) as target_lifts,
                COALESCE(wp.shift_type, 'Unknown') as shift_type,
                'Work Planning' as source
            FROM `tabWork Planning` wp
            INNER JOIN `tabWork Plan Item` wpi ON wp.name = wpi.parent
            WHERE wp.date BETWEEN '{from_date}' AND '{to_date}'
            AND wp.docstatus = 1
            AND wpi.lot_number IS NOT NULL
            AND wpi.lot_number != ''
            AND wpi.mould IS NOT NULL
            {item_condition}
            {lot_condition}
            {shift_condition}
        """
        
        work_plan_data = frappe.db.sql(work_plan_query, as_dict=True)
        
        # STEP 2: Get Add-on Work Planning data filtered by DATE (from_date to to_date)
        # FIX: Match target_qty using shift duration calculated from Shift Type
        addon_work_plan_query = f"""
            SELECT
                awp.name as work_plan_no,
                awp.date as planned_date,
                awpi.lot_number,
                awpi.item as item_code,
                awpi.mould as mould_ref,
                (SELECT noof_cavities
                 FROM `tabMould Specification`
                 WHERE mould_ref = awpi.mould
                   AND spp_ref = awpi.item
                   AND docstatus = 1
                 ORDER BY creation DESC
                 LIMIT 1) as no_of_cavities,
                (SELECT wpit.target_qty
                 FROM `tabWork Plan Item Target` wpit
                 WHERE wpit.item = awpi.item
                   AND wpit.shift_type = (
                       SELECT
                           CASE
                               WHEN st.end_time > st.start_time THEN TIMEDIFF(st.end_time, st.start_time)
                               ELSE TIMEDIFF(ADDTIME(st.end_time, '24:00:00'), st.start_time)
                           END
                       FROM `tabShift Type` st
                       WHERE st.name = awp.shift_type
                       LIMIT 1
                   )
                 LIMIT 1) as target_lifts,
                COALESCE(awp.shift_type, 'Unknown') as shift_type,
                'Add-on Work Planning' as source
            FROM `tabAdd On Work Planning` awp
            INNER JOIN `tabAdd On Work Plan Item` awpi ON awp.name = awpi.parent
            WHERE awp.date BETWEEN '{from_date}' AND '{to_date}'
            AND awp.docstatus = 1
            AND awpi.lot_number IS NOT NULL
            AND awpi.lot_number != ''
            AND awpi.mould IS NOT NULL
            {item_condition.replace('wpi.item', 'awpi.item')}
            {lot_condition.replace('wpi.lot_number', 'awpi.lot_number')}
            {shift_condition.replace('wp.shift_type', 'awp.shift_type')}
        """
        
        addon_work_plan_data = frappe.db.sql(addon_work_plan_query, as_dict=True)
        
        # Combine both Work Planning and Add-on Work Planning data
        all_work_plans = work_plan_data + addon_work_plan_data
        
        if not all_work_plans:
            return []
        
        # STEP 3: Get unique lot numbers from work plans
        work_plan_lot_numbers = list(set([wp['lot_number'] for wp in all_work_plans]))
        lot_numbers_condition = "'" + "','".join(work_plan_lot_numbers) + "'"
        
        # Build machine filter condition for production data
        machine_condition = ""
        if filters and filters.get('machine') and filters.get('machine').strip():
            machine_condition = f"AND jc.workstation LIKE '%{filters.get('machine')}%'"
        
        # STEP 4: Get Moulding Production Entry data for these lot numbers
        # FIX: Include actual moulding_date from production entry for linked lot detection
        # NOTE: We DON'T filter by moulding_date anymore - we filter by lot number from work plans
        production_query = f"""
            SELECT 
                COALESCE(mpe.scan_lot_number, mpe.batch_no) as lot_number,
                mpe.mould_reference as mould_ref,
                mpe.item_to_produce as item_code,
                DATE(mpe.moulding_date) as actual_moulding_date,
                SUM(mpe.number_of_lifts) as total_production_lifts,
                SUM(mpe.number_of_lifts * mpe.no_of_running_cavities) as total_pieces_produced,
                AVG(COALESCE(mpe.downtime_minutes, 0)) as avg_downtime_minutes,
                mpe.employee_name as operator_name,
                jc.workstation as machine_name,
                SUM(mpe.weight) as total_production_weight,
                GROUP_CONCAT(mpe.name ORDER BY mpe.creation SEPARATOR '|||') as production_entry_names
            FROM `tabMoulding Production Entry` mpe
            LEFT JOIN `tabJob Card` jc ON mpe.job_card = jc.name
            WHERE COALESCE(mpe.scan_lot_number, mpe.batch_no) IN ({lot_numbers_condition})
            AND mpe.docstatus = 1
            {machine_condition}
            GROUP BY COALESCE(mpe.scan_lot_number, mpe.batch_no), 
                     mpe.mould_reference, 
                     mpe.item_to_produce, 
                     mpe.employee_name, 
                     jc.workstation,
                     DATE(mpe.moulding_date)
        """
        
        production_data = frappe.db.sql(production_query, as_dict=True)
        
        # Create lookup dictionaries
        # Key: lot_number -> list of work plans
        work_plan_by_lot = {}
        for wp in all_work_plans:
            lot_no = wp['lot_number']
            if lot_no not in work_plan_by_lot:
                work_plan_by_lot[lot_no] = []
            work_plan_by_lot[lot_no].append(wp)
        
        # Key: lot_number -> production data
        production_by_lot = {}
        for prod in production_data:
            lot_no = prod['lot_number']
            if lot_no not in production_by_lot:
                production_by_lot[lot_no] = []
            production_by_lot[lot_no].append(prod)
        
        # STEP 5: Merge work plan data with production data
        # Primary source is Work Planning - if there's no production, we still show the work plan
        final_results = []
        
        for wp in all_work_plans:
            lot_no = wp['lot_number']
            
            # Get production data for this lot (if any)
            prod_records = production_by_lot.get(lot_no, [])
            
            if prod_records:
                # Production exists - merge with work plan
                for prod in prod_records:
                    # Get first production entry name from the comma-separated list
                    production_entry_names = prod.get('production_entry_names', '')
                    first_production_entry = production_entry_names.split('|||')[0] if production_entry_names else None
                    
                    # Skip if no valid production entry found
                    if not first_production_entry:
                        continue
                    
                    # Get machine name from Job Card workstation
                    machine_name = prod.get('machine_name') or 'N/A'
                    
                    # Use mould_ref and item_code from Work Planning (primary source)
                    mould_ref = wp.get('mould_ref', '')
                    item_code = wp.get('item_code', '')
                    
                    # Calculate NoP (Number of Products) = Production Weight / Blank Weight
                    total_production_weight_kg = flt(prod.get('total_production_weight', 0))
                    blank_weight_grams = self.get_blank_weight(mould_ref, item_code)
                    number_of_products = 0
                    
                    if blank_weight_grams > 0 and total_production_weight_kg > 0:
                        total_production_weight_grams = total_production_weight_kg * 1000
                        number_of_products = int(total_production_weight_grams / blank_weight_grams)
                    
                    result = {
                        'name': first_production_entry,
                        'production_date': wp['planned_date'],  # Use PLANNED date from Work Planning (for display)
                        'actual_moulding_date': prod.get('actual_moulding_date'),  # FIX: Add actual production date for linked lot detection
                        'shift_type': wp['shift_type'],
                        'mould_reference': mould_ref,
                        'machine_name': machine_name,
                        'lot_number': lot_no,
                        'item_to_produce': item_code,
                        'number_of_lifts': flt(prod['total_production_lifts']),
                        'number_of_products': number_of_products,
                        'production_weight_kg': total_production_weight_kg,
                        'blank_weight_grams': blank_weight_grams,
                        'no_of_running_cavities': flt(wp.get('no_of_cavities', 0)),
                        'downtime_minutes': flt(prod.get('avg_downtime_minutes', 0)),
                        'operator_name': prod.get('operator_name', ''),
                        'weight': total_production_weight_kg,  # FIX: Use actual weight instead of 0
                        'target_lifts': flt(wp.get('target_lifts', 0)),
                        'total_pieces_produced': flt(prod['total_pieces_produced']),
                        'work_plan_no': wp.get('work_plan_no', ''),
                        'production_entry_names': production_entry_names,
                        'has_production': True  # Flag to indicate real production exists
                    }
                    
                    final_results.append(result)
            else:
                # No production found for this work plan - still include it with zero production
                # NOTE: For no-production cases, we don't create a record in the final results
                # This prevents errors when trying to link to non-existent production entries
                # Uncomment below if you want to show planned but not produced items
                
                # result = {
                #     'name': None,  # No production entry exists
                #     'production_date': wp['planned_date'],
                #     'shift_type': wp['shift_type'],
                #     'mould_reference': wp.get('mould_ref', ''),
                #     'machine_name': 'N/A',
                #     'lot_number': lot_no,
                #     'item_to_produce': wp.get('item_code', ''),
                #     'number_of_lifts': 0,
                #     'number_of_products': 0,
                #     'production_weight_kg': 0,
                #     'blank_weight_grams': 0,
                #     'no_of_running_cavities': flt(wp.get('no_of_cavities', 0)),
                #     'downtime_minutes': 0,
                #     'operator_name': '',
                #     'weight': 0,
                #     'target_lifts': flt(wp.get('target_lifts', 0)),
                #     'total_pieces_produced': 0,
                #     'work_plan_no': wp.get('work_plan_no', ''),
                #     'production_entry_names': '',
                #     'has_production': False  # Flag to indicate no production
                # }
                # 
                # final_results.append(result)
                pass
        
        return final_results
    
    def get_linked_lot_data(self, lot_number, production_date, shift_type, machine_reference):
        """
        Check if lot is part of a linked group and return aggregated data
        
        Args:
            lot_number: Lot number to check
            production_date: Production date
            shift_type: Shift type
            machine_reference: Machine/press reference
        
        Returns:
            dict: {
                'is_linked': True/False,
                'main_lot': 'LOT-XXX',
                'all_lots': ['LOT-1', 'LOT-2', 'LOT-3'],
                'aggregated_production': {...},
                'aggregated_quality': {...}
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
                return {'is_linked': False}
            
            linked_data = linking[0]
            linked_lots = linked_data['all_lots'].split(',')
            main_lot = linked_data['main_lot_number']
            
            # Only return aggregated data if this is the MAIN lot
            # Other linked lots will be skipped in OEE calculation
            if lot_number != main_lot:
                return {
                    'is_linked': True,
                    'is_main_lot': False,
                    'main_lot': main_lot,
                    'skip_this_lot': True  # Flag to skip non-main lots
                }
            
            # This is the main lot - aggregate production data
            production_agg = self._aggregate_production_data(linked_lots)
            
            # Aggregate quality data
            quality_agg = self._aggregate_quality_data(linked_lots)
            
            return {
                'is_linked': True,
                'is_main_lot': True,
                'main_lot': main_lot,
                'all_lots': linked_lots,
                'linked_lot_count': len(linked_lots),
                'aggregated_production': production_agg,
                'aggregated_quality': quality_agg,
                'skip_this_lot': False
            }
            
        except Exception as e:
            frappe.log_error(
                title="Get Linked Lot Data Error",
                message=f"Error checking lot linking for {lot_number}: {str(e)}\n{frappe.get_traceback()}"
            )
            return {'is_linked': False}
    
    def _aggregate_production_data(self, linked_lots):
        """
        Aggregate production data across multiple linked lots
        
        Args:
            linked_lots: List of lot numbers to aggregate
        
        Returns:
            dict: Aggregated production metrics
        """
        try:
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
                    'total_pieces': flt(result[0].get('total_pieces', 0)),
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
    
    def _aggregate_quality_data(self, linked_lots):
        """
        Aggregate quality/rejection data across multiple linked lots
        
        Formula: 
            Total Rejected = Sum of all rejected_qty across all lot inspections
            Total Inspected = Sum of all inspected_qty across all lot inspections
            Rejection % = (Total Rejected / Total Inspected) × 100
        
        FIX: Use 'inspected_qty_nos' instead of 'total_inspected_qty_nos'
             because total_inspected_qty_nos is always 0 (not populated by the form)
        
        Args:
            linked_lots: List of lot numbers to aggregate
        
        Returns:
            dict: Aggregated quality metrics
        """
        try:
            lot_numbers_str = "'" + "','".join(linked_lots) + "'"
            
            # FIX: Query the CORRECT field - 'inspected_qty_nos' not 'total_inspected_qty_nos'
            query = f"""
                SELECT 
                    SUM(COALESCE(ie.inspected_qty_nos, 0)) as total_inspected,
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
                    'inspected_lot_count': int(result[0].get('inspected_lot_count', 0)),
                    'inspected_lots': result[0].get('inspected_lots', ''),
                    'has_inspection': total_inspected > 0 or total_rejected > 0
                }
            
            return {
                'total_inspected': 0,
                'total_rejected': 0,
                'good_pieces': 0,
                'rejection_percentage': 0.0,
                'inspected_lot_count': 0,
                'inspected_lots': '',
                'has_inspection': False
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
                'inspected_lot_count': 0,
                'inspected_lots': '',
                'has_inspection': False
            }
    
    def get_blank_weight(self, mould_ref, item_code):
        """
        Get blank weight (in grams) from Mould Specification
        
        Args:
            mould_ref: Mould reference code
            item_code: Item code (SPP reference)
        
        Returns:
            float: Blank weight in grams, 0 if not found
        """
        if not mould_ref:
            return 0.0
        
        try:
            # First try to match both mould_ref and spp_ref (item code)
            result = frappe.db.sql("""
                SELECT avg_blank_wtproduct_gms
                FROM `tabMould Specification`
                WHERE mould_ref = %s AND spp_ref = %s
                AND avg_blank_wtproduct_gms IS NOT NULL 
                AND avg_blank_wtproduct_gms != ''
                AND avg_blank_wtproduct_gms != '0'
                AND docstatus = 1
                ORDER BY creation DESC
                LIMIT 1
            """, (mould_ref, item_code), as_dict=True)
            
            # Fallback: try with mould_ref only if no exact match found
            if not result:
                result = frappe.db.sql("""
                    SELECT avg_blank_wtproduct_gms
                    FROM `tabMould Specification`
                    WHERE mould_ref = %s
                    AND avg_blank_wtproduct_gms IS NOT NULL 
                    AND avg_blank_wtproduct_gms != ''
                    AND avg_blank_wtproduct_gms != '0'
                    AND docstatus = 1
                    ORDER BY creation DESC
                    LIMIT 1
                """, (mould_ref,), as_dict=True)
            
            if result and len(result) > 0:
                blank_wt = flt(result[0].get('avg_blank_wtproduct_gms', 0))
                return blank_wt if blank_wt > 0 else 0.0
            
            return 0.0
            
        except Exception as e:
            frappe.log_error(f"Error getting blank weight for mould {mould_ref}: {str(e)}", "Moulding Adapter")
            return 0.0
    
    def get_planned_time(self, production_entry):
        """
        Get planned production time in minutes from Shift Type
        
        Formula:
        - Fetch shift duration from Shift Type master (start_time to end_time)
        - Subtract lunch break duration (default 30 minutes)
        - Return planned production time in minutes
        
        FIX: Case-insensitive shift type lookup to handle "8 hours - 3" vs "8 Hours - 3"
        Falls back to 450 minutes if shift not found (8 hours - 30 min lunch)
        """
        shift_type = production_entry.get('shift_type')
        
        if not shift_type or shift_type == 'Unknown':
            return self.default_planned_time  # Fallback to 450 minutes
        
        try:
            # FIX: Case-insensitive lookup for Shift Type
            # This handles inconsistent naming like "8 hours - 3" vs "8 Hours - 1"
            shift_doc = frappe.db.sql("""
                SELECT start_time, end_time
                FROM `tabShift Type`
                WHERE LOWER(name) = LOWER(%s)
                LIMIT 1
            """, (shift_type,), as_dict=True)
            
            if not shift_doc or len(shift_doc) == 0:
                return self.default_planned_time
            
            start_time = shift_doc[0].get('start_time')
            end_time = shift_doc[0].get('end_time')
            
            if not start_time or not end_time:
                return self.default_planned_time
            
            # Calculate shift duration in minutes
            from datetime import datetime, timedelta
            
            # Parse time strings (handle both time and datetime objects)
            if isinstance(start_time, str):
                start = datetime.strptime(str(start_time).split('.')[0], '%H:%M:%S')
            else:
                start = datetime.combine(datetime.today(), start_time)
            
            if isinstance(end_time, str):
                end = datetime.strptime(str(end_time).split('.')[0], '%H:%M:%S')
            else:
                end = datetime.combine(datetime.today(), end_time)
            
            # Handle overnight shifts (end_time < start_time)
            if end < start:
                end += timedelta(days=1)
            
            # Calculate duration in minutes
            duration = (end - start).total_seconds() / 60.0
            
            # Subtract lunch break (30 minutes standard)
            lunch_break_minutes = 30
            planned_time = duration - lunch_break_minutes
            
            return planned_time if planned_time > 0 else self.default_planned_time
            
        except Exception as e:
            frappe.log_error(
                f"Error calculating planned time for shift {shift_type}: {str(e)}\n{frappe.get_traceback()}",
                "Moulding Adapter - Planned Time Calculation"
            )
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
        4. If no inspection found, return 0 for all quality metrics (inspection pending)
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
            # Return 0 for all metrics until inspection data is entered
            if total_inspected == 0 and total_rejected == 0:
                return {
                    'good_pieces': 0,
                    'total_pieces': 0,
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
        
        # No Lot Inspection found - return 0 for all quality metrics (inspection pending)
        return {
            'good_pieces': 0,
            'total_pieces': 0,
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
