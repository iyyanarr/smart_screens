import frappe
from frappe.utils import flt, cint, formatdate, today, getdate
from datetime import timedelta

@frappe.whitelist()
def get_planned_vs_actual_data(from_date=None, to_date=None, item_filter=None, lot_filter=None, shift_filter=None, planning_filter=None):
    """
    Get planned vs actual production comparison data
    Uses similar aggregation strategy as Shift Quantity Planned Report
    
    Args:
        from_date: Start date for filtering
        to_date: End date for filtering  
        item_filter: Item code filter
        planning_filter: Filter by planning status
            - 'all' or None: Show all records with planning data
            - 'planned': Show only records with planned quantities > 0
            - Note: 'unplanned' option removed - unplanned production is no longer included
    
    Note: Includes both draft (docstatus = 0) and submitted (docstatus = 1) Work Planning and Add On Work Planning documents.
    Only shows records that have planning data - no unplanned production is included.
          Draft documents are excluded from planning data. "No Planning" records are actual productions
          without corresponding submitted planning documents.
    """
    if not from_date:
        from_date = frappe.utils.today()
    if not to_date:
        to_date = frappe.utils.today()
    
    # Build filter conditions
    item_condition = ""
    lot_condition_actual = ""
    lot_condition_stock = ""
    shift_condition = ""
    
    if item_filter:
        item_condition = f"AND wpi.item LIKE '%{item_filter}%'"
        item_condition_actual = f"AND mpe.item_to_produce LIKE '%{item_filter}%'"
        item_condition_stock = f"AND sed.item_code LIKE '%{item_filter}%'"
    else:
        item_condition_actual = ""
        item_condition_stock = ""
    
    if lot_filter:
        lot_condition_actual = f"AND (mpe.spp_batch_number LIKE '%{lot_filter}%' OR mpe.batch_no LIKE '%{lot_filter}%')"
        lot_condition_stock = f"AND (sed.spp_batch_number LIKE '%{lot_filter}%' OR sed.batch_no LIKE '%{lot_filter}%')"
    
    if shift_filter:
        shift_condition = f"AND wp.shift_type = '{shift_filter}'"
        shift_condition_addon = f"AND awp.shift_type = '{shift_filter}'"
    else:
        shift_condition_addon = ""

    # Get planned data (using successful approach from Shift Quantity Planned Report)
    planned_query = f"""
        SELECT 
            wpi.item as item_code,
            wp.date as production_date,
            wp.shift_type,
            ms.noof_cavities,
            wpit.target_qty,
            CASE 
                WHEN ms.noof_cavities IS NOT NULL AND wpit.target_qty IS NOT NULL 
                THEN CAST(ms.noof_cavities AS FLOAT) * CAST(wpit.target_qty AS FLOAT)
                ELSE 0
            END as planned_qty_pieces,
            'Work Planning' as source_type
        FROM `tabWork Planning` wp
        INNER JOIN `tabWork Plan Item` wpi ON wp.name = wpi.parent
        LEFT JOIN `tabMould Specification` ms ON wpi.mould = ms.mould_ref AND ms.docstatus = 1
        LEFT JOIN `tabShift Type` st ON wp.shift_type = st.name
        LEFT JOIN `tabWork Plan Item Target` wpit ON wpi.item = wpit.item AND TIME(st.total_time) = wpit.shift_type
        WHERE wp.docstatus IN (0, 1) 
        AND wp.date BETWEEN '{from_date}' AND '{to_date}'
        {item_condition}
        {shift_condition}
        
        UNION ALL
        
        SELECT 
            awpi.item as item_code,
            awp.date as production_date,
            awp.shift_type,
            ms.noof_cavities,
            wpit.target_qty,
            CASE 
                WHEN ms.noof_cavities IS NOT NULL AND wpit.target_qty IS NOT NULL 
                THEN CAST(ms.noof_cavities AS FLOAT) * CAST(wpit.target_qty AS FLOAT)
                ELSE 0
            END as planned_qty_pieces,
            'Add On Work Planning' as source_type
        FROM `tabAdd On Work Planning` awp
        INNER JOIN `tabAdd On Work Plan Item` awpi ON awp.name = awpi.parent
        LEFT JOIN `tabMould Specification` ms ON awpi.mould = ms.mould_ref AND ms.docstatus = 1
        LEFT JOIN `tabShift Type` st2 ON awp.shift_type = st2.name
        LEFT JOIN `tabWork Plan Item Target` wpit ON awpi.item = wpit.item AND TIME(st2.total_time) = wpit.shift_type
        WHERE awp.docstatus IN (0, 1) 
        AND awp.date BETWEEN '{from_date}' AND '{to_date}'
        {item_condition.replace('wpi.item', 'awpi.item')}
        {shift_condition_addon}
        
        ORDER BY production_date DESC, item_code
    """

    planned_data = frappe.db.sql(planned_query, as_dict=True)

    # Get actual production data from Moulding Production Entry with LOT NUMBER
    actual_query = f"""
        SELECT 
            mpe.moulding_date as production_date,
            mpe.item_to_produce as item_code,
            COALESCE(mpe.spp_batch_number, mpe.batch_no, 'No Lot') as lot_number,
            SUM(mpe.number_of_lifts * mpe.no_of_running_cavities) as actual_qty_pieces,
            SUM(mpe.weight) as actual_weight_kg,
            COUNT(DISTINCT mpe.name) as production_entries,
            GROUP_CONCAT(DISTINCT mpe.name ORDER BY mpe.name) as entry_references
        FROM `tabMoulding Production Entry` mpe
        WHERE mpe.moulding_date BETWEEN '{from_date}' AND '{to_date}'
        AND mpe.docstatus = 1
        {item_condition_actual}
        {lot_condition_actual}
        GROUP BY mpe.moulding_date, mpe.item_to_produce, COALESCE(mpe.spp_batch_number, mpe.batch_no, 'No Lot')
        ORDER BY mpe.moulding_date DESC, mpe.item_to_produce, lot_number
    """
    
    actual_data = frappe.db.sql(actual_query, as_dict=True)

    # Get stock entry data with LOT NUMBER
    # Get stock entry data with LOT NUMBER and convert to pieces
    stock_query = f"""
        SELECT 
            DATE(se.posting_date) as production_date,
            sed.item_code,
            COALESCE(sed.spp_batch_number, sed.batch_no, 'No Lot') as lot_number,
            COUNT(DISTINCT se.name) as stock_entries,
            GROUP_CONCAT(DISTINCT se.name ORDER BY se.name) as entry_references
        FROM `tabStock Entry` se
        JOIN `tabStock Entry Detail` sed ON se.name = sed.parent
        LEFT JOIN `tabItem` item ON sed.item_code = item.name
        WHERE se.posting_date BETWEEN '{from_date}' AND '{to_date}'
        AND se.purpose = 'Manufacture'
        AND se.docstatus = 1
        AND sed.t_warehouse IS NOT NULL
        {item_condition_stock}
        {lot_condition_stock}
        GROUP BY DATE(se.posting_date), sed.item_code, COALESCE(sed.spp_batch_number, sed.batch_no, 'No Lot')
        ORDER BY se.posting_date DESC, sed.item_code, lot_number
    """
    
    stock_data = frappe.db.sql(stock_query, as_dict=True)

    # Aggregate planned data by item + date (ignore shift for matching actual data)
    planned_aggregated = {}
    for row in planned_data:
        key = f"{row.production_date}|{row.item_code}"
        if key not in planned_aggregated:
            planned_aggregated[key] = {
                'production_date': row.production_date,
                'item_code': row.item_code,
                'shift_type': 'All',  # Aggregate all shifts
                'planned_qty_pieces': 0,
                'planning_sources': set()
            }
        
        planned_aggregated[key]['planned_qty_pieces'] += flt(row.planned_qty_pieces or 0)
        planned_aggregated[key]['planning_sources'].add(row.source_type)

    # Create a comprehensive data structure starting with planned data only
    # Only entries with planning data will be included in the final report
    combined_data = {}
    
    # Start with planned data - this ensures only planned items appear in the report
    for key, planned_row in planned_aggregated.items():
        production_date, item_code = key.split('|')
        planned_key = f"{production_date}|{item_code}|Planned"
        
        combined_data[planned_key] = {
            'production_date': production_date,
            'item_code': item_code,
            'lot_number': 'Planned',
            'shift_type': 'All',
            'planned_qty_pieces': planned_row['planned_qty_pieces'],
            'actual_qty_pieces': 0,
            'production_entries': 0,
            'stock_entries': 0,
            'variance_pieces': 0,
            'variance_percentage': 0,
            'efficiency': 0,
            'planning_sources': list(planned_row['planning_sources']),
            'entry_references_actual': '',
            'entry_references_stock': ''
        }

    # Add actual production data - only to items that have planning data
    for row in actual_data:
        # Check if this actual production corresponds to any planned item/date
        date_item_key = f"{row.production_date}|{row.item_code}"
        planned_key = f"{row.production_date}|{row.item_code}|Planned"
        
        if planned_key in combined_data:
            # Check if we should create a lot-specific entry or update the planned entry
            lot_key = f"{row.production_date}|{row.item_code}|{row.lot_number}"
            
            if row.lot_number and row.lot_number != 'Planned':
                # Create a lot-specific entry with planning data
                if lot_key not in combined_data:
                    combined_data[lot_key] = {
                        'production_date': row.production_date,
                        'item_code': row.item_code,
                        'lot_number': row.lot_number,
                        'shift_type': 'All',
                        'planned_qty_pieces': combined_data[planned_key]['planned_qty_pieces'],
                        'actual_qty_pieces': 0,
                        'production_entries': 0,
                        'stock_entries': 0,
                        'variance_pieces': 0,
                        'variance_percentage': 0,
                        'efficiency': 0,
                        'planning_sources': combined_data[planned_key]['planning_sources'].copy(),
                        'entry_references_actual': '',
                        'entry_references_stock': ''
                    }
                
                # Add actual data to lot-specific entry
                combined_data[lot_key]['actual_qty_pieces'] += flt(row.actual_qty_pieces)
                combined_data[lot_key]['production_entries'] += cint(row.production_entries)
                combined_data[lot_key]['entry_references_actual'] = row.entry_references or ''
                
                # Remove the generic planned entry since we now have lot-specific data
                if planned_key in combined_data:
                    del combined_data[planned_key]
            else:
                # Add to the planned entry directly
                combined_data[planned_key]['actual_qty_pieces'] += flt(row.actual_qty_pieces)
                combined_data[planned_key]['production_entries'] += cint(row.production_entries)
                combined_data[planned_key]['entry_references_actual'] = row.entry_references or ''

    # Add stock entry data - only to items that have planning data
    for row in stock_data:
        # Check if this stock entry corresponds to any planned item/date
        planned_key = f"{row.production_date}|{row.item_code}|Planned"
        lot_key = f"{row.production_date}|{row.item_code}|{row.lot_number}"
        
        # First check if we have a lot-specific entry
        if lot_key in combined_data:
            combined_data[lot_key]['stock_entries'] += cint(row.stock_entries)
            combined_data[lot_key]['entry_references_stock'] = row.entry_references or ''
        # Otherwise check if we have a planned entry
        elif planned_key in combined_data:
            combined_data[planned_key]['stock_entries'] += cint(row.stock_entries)
            combined_data[planned_key]['entry_references_stock'] = row.entry_references or ''

    # Calculate variances and efficiency
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


@frappe.whitelist()
def get_summary_statistics(from_date=None, to_date=None, item_filter=None, lot_filter=None, shift_filter=None, planning_filter=None):
    """
    Get summary statistics for the planned vs actual report
    """
    data = get_planned_vs_actual_data(from_date, to_date, item_filter, lot_filter, shift_filter, planning_filter)
    
    if not data:
        return {
            'total_planned_pieces': 0,
            'total_produced_pieces': 0,
            'total_stock_pieces': 0,
            'overall_efficiency': 0,
            'total_items': 0,
            'total_dates': 0,
            'avg_efficiency': 0
        }
    
    total_planned = sum(row['planned_qty_pieces'] for row in data)
    total_produced = sum(row['actual_qty_pieces'] for row in data)
    
    # Calculate overall efficiency
    if total_planned > 0:
        overall_efficiency = (total_produced / total_planned) * 100
    else:
        overall_efficiency = 0
    
    # Calculate average efficiency (only for items with planned quantities)
    items_with_planned = [row for row in data if row['planned_qty_pieces'] > 0]
    if items_with_planned:
        avg_efficiency = sum(row['efficiency'] for row in items_with_planned) / len(items_with_planned)
    else:
        avg_efficiency = 0
    
    unique_items = len(set(row['item_code'] for row in data))
    unique_dates = len(set(str(row['production_date']) for row in data))
    
    return {
        'total_planned_pieces': total_planned,
        'total_produced_pieces': total_produced,
        'overall_efficiency': overall_efficiency,
        'total_items': unique_items,
        'total_dates': unique_dates,
        'avg_efficiency': avg_efficiency
    }

@frappe.whitelist()
def get_shift_options(from_date=None, to_date=None):
    """
    Get available shift options based on actual data in Work Planning and Add On Work Planning
    """
    if not from_date:
        from_date = frappe.utils.today()
    if not to_date:
        to_date = frappe.utils.today()
    
    # Get shifts from Work Planning
    shift_query = f"""
        SELECT DISTINCT wp.shift_type as shift_name
        FROM `tabWork Planning` wp
        WHERE wp.docstatus IN (0, 1) 
        AND wp.date BETWEEN '{from_date}' AND '{to_date}'
        AND wp.shift_type IS NOT NULL
        AND wp.shift_type != ''
        
        UNION
        
        SELECT DISTINCT awp.shift_type as shift_name
        FROM `tabAdd On Work Planning` awp
        WHERE awp.docstatus IN (0, 1) 
        AND awp.date BETWEEN '{from_date}' AND '{to_date}'
        AND awp.shift_type IS NOT NULL
        AND awp.shift_type != ''
        
        ORDER BY shift_name
    """
    
    shift_data = frappe.db.sql(shift_query, as_dict=True)
    
    # Create a list of shift options
    shift_options = [{"value": "", "label": "All Shifts"}]
    
    for row in shift_data:
        if row.shift_name:
            shift_options.append({
                "value": row.shift_name,
                "label": row.shift_name
            })
    
    return shift_options
