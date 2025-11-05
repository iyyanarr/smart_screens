"""
Rejection Analysis Report Backend API
Main API endpoints for the Rejection Analysis Report page
"""

import frappe
from frappe import _
from frappe.utils import flt, formatdate, today, getdate


@frappe.whitelist()
def get_rejection_data(production_date=None, shift_filter=None, operator_filter=None, press_filter=None, item_filter=None, lot_filter=None):
    """
    Get rejection data from multiple inspection types

    Args:
        production_date: Production date (YYYY-MM-DD) - defaults to today
        shift_filter: Shift type filter
        operator_filter: Operator name filter
        press_filter: Press/Machine filter
        item_filter: Item code filter
        lot_filter: Lot number filter

    Returns:
        list: Rejection data with all inspection types
    """

    # Default to today if no date provided
    if not production_date:
        production_date = today()

    # Build filter conditions
    filters = {
        'shift': shift_filter,
        'operator': operator_filter,
        'press': press_filter,
        'item': item_filter,
        'lot': lot_filter
    }

    # Build WHERE conditions
    shift_condition = f"AND jc.shift_type = '{shift_filter}'" if shift_filter and shift_filter != 'all' else ""
    operator_condition = f"AND mpe.employee_name LIKE '%{operator_filter}%'" if operator_filter else ""
    press_condition = f"AND jc.workstation LIKE '%{press_filter}%'" if press_filter else ""
    item_condition = f"AND mpe.item_to_produce LIKE '%{item_filter}%'" if item_filter else ""
    lot_condition = f"AND COALESCE(mpe.scan_lot_number, mpe.batch_no) LIKE '%{lot_filter}%'" if lot_filter else ""

    # Main query to get rejection data
    query = f"""
        SELECT
            mpe.name as production_entry,
            mpe.moulding_date as production_date,
            COALESCE(jc.shift_type, 'Unknown') as shift_type,
            mpe.employee_name as operator_name,
            jc.workstation as press_number,
            mpe.item_to_produce as item_code,
            mpe.mould_reference as mould_ref,
            COALESCE(mpe.scan_lot_number, mpe.batch_no) as lot_no,

            -- Patrol Inspection (from Inspection Entry)
            (SELECT total_rejected_qty_in_percentage
             FROM `tabInspection Entry`
             WHERE lot_no = COALESCE(mpe.scan_lot_number, mpe.batch_no)
               AND inspection_type = 'Patrol Inspection'
               AND docstatus = 1
             ORDER BY posting_date DESC
             LIMIT 1) as patrol_rej_pct,

            -- Line Inspection (from Inspection Entry)
            (SELECT total_rejected_qty_in_percentage
             FROM `tabInspection Entry`
             WHERE lot_no = COALESCE(mpe.scan_lot_number, mpe.batch_no)
               AND inspection_type = 'Line Inspection'
               AND docstatus = 1
             ORDER BY posting_date DESC
             LIMIT 1) as line_rej_pct,

            -- Lot Inspection (from Inspection Entry)
            (SELECT total_rejected_qty_in_percentage
             FROM `tabInspection Entry`
             WHERE lot_no = COALESCE(mpe.scan_lot_number, mpe.batch_no)
               AND inspection_type = 'Lot Inspection'
               AND docstatus = 1
             ORDER BY posting_date DESC
             LIMIT 1) as lot_rej_pct,

            -- Final Visual Inspection (from SPP Inspection Entry)
            -- Note: SPP Inspection uses sub-lots (e.g., 25I03Z13-1), so we use LIKE
            (SELECT AVG(total_rejected_qty_in_percentage)
             FROM `tabSPP Inspection Entry`
             WHERE lot_no LIKE CONCAT(COALESCE(mpe.scan_lot_number, mpe.batch_no), '%')
               AND inspection_type = 'Final Visual Inspection'
               AND docstatus = 1) as final_insp_rej_pct

        FROM `tabMoulding Production Entry` mpe
        LEFT JOIN `tabJob Card` jc ON mpe.job_card = jc.name
        WHERE mpe.moulding_date = '{production_date}'
          AND mpe.docstatus = 1
          AND COALESCE(mpe.scan_lot_number, mpe.batch_no) IS NOT NULL
          {shift_condition}
          {operator_condition}
          {press_condition}
          {item_condition}
          {lot_condition}
        ORDER BY mpe.moulding_date, jc.shift_type, mpe.employee_name
    """

    rejection_data = frappe.db.sql(query, as_dict=True)

    # Process and format the results
    results = []
    for row in rejection_data:
        # Calculate LOT REJ% (average of Patrol + Line + Lot)
        patrol = flt(row.get('patrol_rej_pct', 0))
        line = flt(row.get('line_rej_pct', 0))
        lot = flt(row.get('lot_rej_pct', 0))

        # Only average non-zero values
        lot_rej_values = [v for v in [patrol, line, lot] if v > 0]
        lot_rej_pct = sum(lot_rej_values) / len(lot_rej_values) if lot_rej_values else 0.0

        final_insp_rej_pct = flt(row.get('final_insp_rej_pct', 0))

        result = {
            'production_entry': row.get('production_entry'),
            'production_date': str(row.get('production_date')),
            'production_date_formatted': formatdate(row.get('production_date'), 'dd-MM-yyyy'),
            'shift_type': row.get('shift_type'),
            'operator_name': row.get('operator_name'),
            'press_number': row.get('press_number', 'N/A'),
            'item_code': row.get('item_code'),
            'mould_ref': row.get('mould_ref'),
            'lot_no': row.get('lot_no'),
            'patrol_rej_pct': flt(patrol, 2),
            'line_rej_pct': flt(line, 2),
            'lot_rej_pct': flt(lot_rej_pct, 2),
            'final_insp_rej_pct': flt(final_insp_rej_pct, 2),

            # Flags for CAR generation
            'needs_car_lot': lot_rej_pct > 4.0,
            'needs_car_final': final_insp_rej_pct > 4.0,
        }

        results.append(result)

    return results


@frappe.whitelist()
def get_rejection_summary(production_date=None, shift_filter=None, operator_filter=None, press_filter=None, item_filter=None, lot_filter=None):
    """
    Get summary statistics for rejection analysis

    Returns:
        dict: Summary metrics (averages for LOT REJ% and Final Insp REJ%)
    """

    # Get rejection data
    rejection_data = get_rejection_data(
        production_date=production_date,
        shift_filter=shift_filter,
        operator_filter=operator_filter,
        press_filter=press_filter,
        item_filter=item_filter,
        lot_filter=lot_filter
    )

    if not rejection_data or len(rejection_data) == 0:
        return {
            'total_records': 0,
            'avg_lot_rej_pct': 0.0,
            'avg_final_insp_rej_pct': 0.0,
            'records_needing_car': 0
        }

    # Calculate averages
    total_records = len(rejection_data)

    # Only include non-zero values in average
    lot_rej_values = [row['lot_rej_pct'] for row in rejection_data if row['lot_rej_pct'] > 0]
    avg_lot_rej_pct = sum(lot_rej_values) / len(lot_rej_values) if lot_rej_values else 0.0

    final_insp_values = [row['final_insp_rej_pct'] for row in rejection_data if row['final_insp_rej_pct'] > 0]
    avg_final_insp_rej_pct = sum(final_insp_values) / len(final_insp_values) if final_insp_values else 0.0

    # Count records needing CAR (rejection > 4%)
    records_needing_car = sum(1 for row in rejection_data if row['needs_car_lot'] or row['needs_car_final'])

    return {
        'total_records': total_records,
        'avg_lot_rej_pct': round(avg_lot_rej_pct, 2),
        'avg_final_insp_rej_pct': round(avg_final_insp_rej_pct, 2),
        'records_needing_car': records_needing_car
    }


@frappe.whitelist()
def get_rejection_details(lot_no, inspection_type='lot'):
    """
    Get detailed rejection data for drill-down modal

    Args:
        lot_no: Lot number
        inspection_type: 'lot' or 'final' to determine which inspections to show

    Returns:
        dict: Detailed rejection data
    """

    if inspection_type == 'lot':
        # Get Patrol, Line, and Lot inspection details
        query = """
            SELECT
                name,
                inspection_type,
                posting_date,
                lot_no,
                total_inspected_qty_nos,
                total_rejected_qty,
                total_rejected_qty_in_percentage
            FROM `tabInspection Entry`
            WHERE lot_no = %s
              AND inspection_type IN ('Patrol Inspection', 'Line Inspection', 'Lot Inspection')
              AND docstatus = 1
            ORDER BY inspection_type, posting_date DESC
        """

        details = frappe.db.sql(query, (lot_no,), as_dict=True)

        return {
            'lot_no': lot_no,
            'inspection_type': 'Lot Inspections',
            'details': details
        }

    else:  # final
        # Get Final Visual Inspection details from SPP Inspection Entry
        query = """
            SELECT
                name,
                inspection_type,
                posting_date,
                lot_no,
                total_inspected_qty_nos,
                total_rejected_qty,
                total_rejected_qty_in_percentage
            FROM `tabSPP Inspection Entry`
            WHERE lot_no LIKE %s
              AND inspection_type = 'Final Visual Inspection'
              AND docstatus = 1
            ORDER BY posting_date DESC
        """

        details = frappe.db.sql(query, (f'{lot_no}%',), as_dict=True)

        return {
            'lot_no': lot_no,
            'inspection_type': 'Final Visual Inspection',
            'details': details
        }


@frappe.whitelist()
def get_shift_options(production_date=None):
    """
    Get available shift options

    Returns:
        list: List of shift options
    """
    if not production_date:
        production_date = today()

    # Get shifts from Job Card linked to production entries
    shifts = frappe.db.sql("""
        SELECT DISTINCT jc.shift_type
        FROM `tabMoulding Production Entry` mpe
        LEFT JOIN `tabJob Card` jc ON mpe.job_card = jc.name
        WHERE mpe.moulding_date = %s
          AND mpe.docstatus = 1
          AND jc.shift_type IS NOT NULL
        ORDER BY jc.shift_type
    """, (production_date,), as_dict=True)

    # Format for frontend dropdown
    options = [{'value': 'all', 'label': 'All Shifts'}]
    for shift in shifts:
        if shift.shift_type:
            options.append({
                'value': shift.shift_type,
                'label': shift.shift_type
            })

    return options


@frappe.whitelist()
def create_car(car_data):
    """
    Create a Corrective Action Report (CAR) document

    Args:
        car_data: Dictionary containing CAR information

    Returns:
        dict: Success status and CAR document name
    """

    try:
        # Parse car_data if it's a string (from JSON)
        if isinstance(car_data, str):
            import json
            car_data = json.loads(car_data)

        # Create new CAR document
        car_doc = frappe.get_doc({
            'doctype': 'Rejection CAR',

            # Production reference data
            'production_entry': car_data.get('production_entry'),
            'production_date': car_data.get('production_date'),
            'shift_type': car_data.get('shift_type'),
            'item_code': car_data.get('item_code'),
            'lot_no': car_data.get('lot_no'),
            'mould_ref': car_data.get('mould_ref'),
            'operator_name': car_data.get('operator_name'),
            'press_number': car_data.get('press_number'),

            # Rejection data
            'patrol_rej_pct': car_data.get('patrol_rej_pct'),
            'line_rej_pct': car_data.get('line_rej_pct'),
            'lot_rej_pct': car_data.get('lot_rej_pct'),
            'final_insp_rej_pct': car_data.get('final_insp_rej_pct'),

            # CAR main fields
            'problem_description': car_data.get('problem_description'),
            'corrective_action': car_data.get('corrective_action'),
            'cause_non_detection': car_data.get('cause_non_detection'),
            'cause_occurrence': car_data.get('cause_occurrence'),
            'remarks': car_data.get('remarks'),

            # WHY-WHY Analysis
            'why_1': car_data.get('why_1'),
            'why_2': car_data.get('why_2'),
            'why_3': car_data.get('why_3'),
            'why_4': car_data.get('why_4'),
            'why_5': car_data.get('why_5'),
        })

        # Insert the document
        car_doc.insert()

        # Submit if requested
        if car_data.get('is_submit'):
            car_doc.submit()

        frappe.db.commit()

        return {
            'success': True,
            'car_name': car_doc.name,
            'status': 'Submitted' if car_data.get('is_submit') else 'Draft'
        }

    except Exception as e:
        frappe.log_error(frappe.get_traceback(), 'CAR Creation Error')
        return {
            'success': False,
            'error': str(e)
        }
