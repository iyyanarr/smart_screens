"""
ALIGNMENT ANALYSIS: Code vs Documentation

Based on the analysis of actual data and code, here are the key findings:

## Current Code Issues

1. **Missing Lot Number from Planning**: The planning queries don't include wpi.lot_number
2. **Missing Job Card Relationships**: Code doesn't use the job_card connections
3. **Inconsistent Data Matching**: Only using date + item, ignoring lot number relationships

## Data Reality

- 19,004 Work Plan Items have lot_number and job_card populated (49.3%)
- 19,563 Work Plan Items are missing these fields (50.7%)
- This suggests a transition period where newer records use proper relationships

## Recommended Solution

We need a hybrid approach that:
1. Uses proper relationships when available (job_card + lot_number)
2. Falls back to date + item matching for incomplete data
3. Provides better data integrity and traceability

## Implementation Plan

1. Update planning queries to include lot_number and job_card
2. Add logic to match via job_card when available
3. Use date + item + lot_number matching as fallback
4. Add data quality indicators to show which matching method was used
"""

import frappe
from frappe.utils import flt, cint, formatdate, today, getdate
from datetime import timedelta

@frappe.whitelist()
def get_planned_vs_actual_data_aligned(from_date=None, to_date=None, item_filter=None, lot_filter=None, shift_filter=None, planning_filter=None):
    """
    ALIGNED VERSION: Get planned vs actual production data using proper relationships
    
    This version aligns with the documented relationships:
    - Work Plan Item → Job Card → Moulding Production Entry
    - Uses lot_number fields for proper tracking
    - Falls back to date+item matching for incomplete data
    """
    
    if not from_date:
        from_date = frappe.utils.today()
    if not to_date:
        to_date = frappe.utils.today()

    # Build filter conditions
    item_condition = ""
    item_condition_actual = ""
    lot_condition_actual = ""
    shift_condition = ""
    shift_condition_addon = ""
    
    if item_filter:
        item_condition = f"AND wpi.item LIKE '%{item_filter}%'"
        item_condition_actual = f"AND mpe.item_to_produce LIKE '%{item_filter}%'"
    
    if lot_filter:
        lot_condition_actual = f"AND (mpe.scan_lot_number LIKE '%{lot_filter}%' OR mpe.batch_no LIKE '%{lot_filter}%')"
    
    if shift_filter:
        shift_condition = f"AND wp.shift_type = '{shift_filter}'"
        shift_condition_addon = f"AND awp.shift_type = '{shift_filter}'"

    # ALIGNED QUERY 1: Get planned data WITH lot numbers and job cards
    planned_query_with_relationships = f"""
        SELECT 
            wpi.item as item_code,
            wp.date as production_date,
            wp.shift_type,
            wpi.lot_number,
            wpi.job_card,
            ms.noof_cavities,
            wpit.target_qty,
            CASE 
                WHEN ms.noof_cavities IS NOT NULL AND wpit.target_qty IS NOT NULL 
                THEN CAST(ms.noof_cavities AS FLOAT) * CAST(wpit.target_qty AS FLOAT)
                ELSE 0
            END as planned_qty_pieces,
            'Work Planning' as source_type,
            'job_card_relationship' as matching_method
        FROM `tabWork Planning` wp
        INNER JOIN `tabWork Plan Item` wpi ON wp.name = wpi.parent
        LEFT JOIN `tabMould Specification` ms ON wpi.mould = ms.mould_ref AND ms.docstatus = 1
        LEFT JOIN `tabShift Type` st ON wp.shift_type = st.name
        LEFT JOIN `tabWork Plan Item Target` wpit ON wpi.item = wpit.item AND TIME(st.total_time) = wpit.shift_type
        WHERE wp.docstatus IN (0, 1) 
        AND wp.date BETWEEN '{from_date}' AND '{to_date}'
        AND wpi.lot_number IS NOT NULL
        AND wpi.job_card IS NOT NULL
        AND wpi.job_card != ''
        {item_condition}
        {shift_condition}
        
        UNION ALL
        
        SELECT 
            awpi.item as item_code,
            awp.date as production_date,
            awp.shift_type,
            awpi.lot_number,
            awpi.job_card,
            ms.noof_cavities,
            wpit.target_qty,
            CASE 
                WHEN ms.noof_cavities IS NOT NULL AND wpit.target_qty IS NOT NULL 
                THEN CAST(ms.noof_cavities AS FLOAT) * CAST(wpit.target_qty AS FLOAT)
                ELSE 0
            END as planned_qty_pieces,
            'Add On Work Planning' as source_type,
            'job_card_relationship' as matching_method
        FROM `tabAdd On Work Planning` awp
        INNER JOIN `tabAdd On Work Plan Item` awpi ON awp.name = awpi.parent
        LEFT JOIN `tabMould Specification` ms ON awpi.mould = ms.mould_ref AND ms.docstatus = 1
        LEFT JOIN `tabShift Type` st2 ON awp.shift_type = st2.name
        LEFT JOIN `tabWork Plan Item Target` wpit ON awpi.item = wpit.item AND TIME(st2.total_time) = wpit.shift_type
        WHERE awp.docstatus IN (0, 1) 
        AND awp.date BETWEEN '{from_date}' AND '{to_date}'
        AND awpi.lot_number IS NOT NULL
        AND awpi.job_card IS NOT NULL
        AND awpi.job_card != ''
        {item_condition.replace('wpi.item', 'awpi.item')}
        {shift_condition_addon}
    """

    # ALIGNED QUERY 2: Get planned data WITHOUT proper relationships (fallback)
    planned_query_fallback = f"""
        SELECT 
            wpi.item as item_code,
            wp.date as production_date,
            wp.shift_type,
            NULL as lot_number,
            NULL as job_card,
            ms.noof_cavities,
            wpit.target_qty,
            CASE 
                WHEN ms.noof_cavities IS NOT NULL AND wpit.target_qty IS NOT NULL 
                THEN CAST(ms.noof_cavities AS FLOAT) * CAST(wpit.target_qty AS FLOAT)
                ELSE 0
            END as planned_qty_pieces,
            'Work Planning' as source_type,
            'date_item_matching' as matching_method
        FROM `tabWork Planning` wp
        INNER JOIN `tabWork Plan Item` wpi ON wp.name = wpi.parent
        LEFT JOIN `tabMould Specification` ms ON wpi.mould = ms.mould_ref AND ms.docstatus = 1
        LEFT JOIN `tabShift Type` st ON wp.shift_type = st.name
        LEFT JOIN `tabWork Plan Item Target` wpit ON wpi.item = wpit.item AND TIME(st.total_time) = wpit.shift_type
        WHERE wp.docstatus IN (0, 1) 
        AND wp.date BETWEEN '{from_date}' AND '{to_date}'
        AND (wpi.lot_number IS NULL OR wpi.job_card IS NULL OR wpi.job_card = '')
        {item_condition}
        {shift_condition}
        
        UNION ALL
        
        SELECT 
            awpi.item as item_code,
            awp.date as production_date,
            awp.shift_type,
            NULL as lot_number,
            NULL as job_card,
            ms.noof_cavities,
            wpit.target_qty,
            CASE 
                WHEN ms.noof_cavities IS NOT NULL AND wpit.target_qty IS NOT NULL 
                THEN CAST(ms.noof_cavities AS FLOAT) * CAST(wpit.target_qty AS FLOAT)
                ELSE 0
            END as planned_qty_pieces,
            'Add On Work Planning' as source_type,
            'date_item_matching' as matching_method
        FROM `tabAdd On Work Planning` awp
        INNER JOIN `tabAdd On Work Plan Item` awpi ON awp.name = awpi.parent
        LEFT JOIN `tabMould Specification` ms ON awpi.mould = ms.mould_ref AND ms.docstatus = 1
        LEFT JOIN `tabShift Type` st2 ON awp.shift_type = st2.name
        LEFT JOIN `tabWork Plan Item Target` wpit ON awpi.item = wpit.item AND TIME(st2.total_time) = wpit.shift_type
        WHERE awp.docstatus IN (0, 1) 
        AND awp.date BETWEEN '{from_date}' AND '{to_date}'
        AND (awpi.lot_number IS NULL OR awpi.job_card IS NULL OR awpi.job_card = '')
        {item_condition.replace('wpi.item', 'awpi.item')}
        {shift_condition_addon}
    """

    # Get all planned data
    planned_data_with_relationships = frappe.db.sql(planned_query_with_relationships, as_dict=True)
    planned_data_fallback = frappe.db.sql(planned_query_fallback, as_dict=True)
    
    # Combine planned data
    all_planned_data = planned_data_with_relationships + planned_data_fallback

    # ALIGNED QUERY 3: Get actual production data with job_card relationships
    actual_query = f"""
        SELECT 
            mpe.moulding_date as production_date,
            mpe.item_to_produce as item_code,
            COALESCE(mpe.scan_lot_number, mpe.batch_no, 'No Lot') as lot_number,
            mpe.job_card,
            SUM(mpe.number_of_lifts * mpe.no_of_running_cavities) as actual_qty_pieces,
            COUNT(DISTINCT mpe.name) as production_entries,
            GROUP_CONCAT(DISTINCT mpe.name ORDER BY mpe.name) as entry_references
        FROM `tabMoulding Production Entry` mpe
        WHERE mpe.moulding_date BETWEEN '{from_date}' AND '{to_date}'
        AND mpe.docstatus = 1
        {item_condition_actual}
        {lot_condition_actual}
        GROUP BY mpe.moulding_date, mpe.item_to_produce, COALESCE(mpe.scan_lot_number, mpe.batch_no, 'No Lot'), mpe.job_card
    """

    actual_data = frappe.db.sql(actual_query, as_dict=True)

    # ALIGNED MATCHING LOGIC
    combined_data = {}
    
    # Process planned data and create primary keys
    for row in all_planned_data:
        if row.matching_method == 'job_card_relationship' and row.job_card:
            # Use job_card + lot_number as primary key for proper relationships
            key = f"{row.job_card}|{row.lot_number}"
        else:
            # Use date + item as fallback key
            key = f"{row.production_date}|{row.item_code}|fallback"
        
        if key not in combined_data:
            combined_data[key] = {
                'production_date': row.production_date,
                'item_code': row.item_code,
                'lot_number': row.lot_number or 'No Lot',
                'job_card': row.job_card,
                'shift_type': row.shift_type,
                'planned_qty_pieces': 0,
                'actual_qty_pieces': 0,
                'production_entries': 0,
                'stock_entries': 0,
                'variance_pieces': 0,
                'variance_percentage': 0,
                'efficiency': 0,
                'planning_sources': [],
                'matching_method': row.matching_method,
                'entry_references_actual': '',
                'entry_references_stock': ''
            }
        
        combined_data[key]['planned_qty_pieces'] += flt(row.planned_qty_pieces)
        if row.source_type not in combined_data[key]['planning_sources']:
            combined_data[key]['planning_sources'].append(row.source_type)

    # Match actual production data
    for row in actual_data:
        matched = False
        
        # Try to match via job_card first (if available)
        if row.job_card:
            job_card_key = f"{row.job_card}|{row.lot_number}"
            if job_card_key in combined_data:
                combined_data[job_card_key]['actual_qty_pieces'] += flt(row.actual_qty_pieces)
                combined_data[job_card_key]['production_entries'] += cint(row.production_entries)
                combined_data[job_card_key]['entry_references_actual'] = row.entry_references or ''
                matched = True
        
        # If no job_card match, try date + item fallback
        if not matched:
            fallback_key = f"{row.production_date}|{row.item_code}|fallback"
            if fallback_key in combined_data:
                combined_data[fallback_key]['actual_qty_pieces'] += flt(row.actual_qty_pieces)
                combined_data[fallback_key]['production_entries'] += cint(row.production_entries)
                combined_data[fallback_key]['entry_references_actual'] = row.entry_references or ''
                # Update lot_number if it was 'No Lot'
                if combined_data[fallback_key]['lot_number'] == 'No Lot':
                    combined_data[fallback_key]['lot_number'] = row.lot_number

    # Calculate final metrics
    final_data = []
    for key, data in combined_data.items():
        # Calculate variance in pieces
        data['variance_pieces'] = data['actual_qty_pieces'] - data['planned_qty_pieces']
        
        # Calculate variance percentage
        if data['planned_qty_pieces'] > 0:
            data['variance_percentage'] = (data['variance_pieces'] / data['planned_qty_pieces']) * 100
        else:
            data['variance_percentage'] = 0

        # Calculate efficiency (actual/planned * 100)
        if data['planned_qty_pieces'] > 0:
            data['efficiency'] = (data['actual_qty_pieces'] / data['planned_qty_pieces']) * 100
        else:
            data['efficiency'] = 0
        
        # Ensure production_date is a proper date object for consistent sorting
        if isinstance(data['production_date'], str):
            data['production_date'] = frappe.utils.getdate(data['production_date'])
        
        # Format the production date for display
        data['production_date_formatted'] = formatdate(data['production_date'])
        
        # Format planning sources for display
        data['planning_sources_text'] = ', '.join(data['planning_sources']) if data['planning_sources'] else 'No Planning'
        
        final_data.append(data)

    # Sort by date desc, then by item (dates are now normalized to date objects)
    final_data.sort(key=lambda x: (x['production_date'], x['item_code']), reverse=True)
    
    return final_data
