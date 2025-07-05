import frappe
from frappe.utils import flt, cint, formatdate, today, getdate
from datetime import timedelta

@frappe.whitelist()
def get_planned_vs_actual_data(from_date=None, to_date=None, item_filter=None, lot_filter=None, planning_filter=None):
    """
    Get planned vs actual production comparison data
    Uses similar aggregation strategy as Shift Quantity Planned Report
    
    Args:
        from_date: Start date for filtering
        to_date: End date for filtering  
        item_filter: Item code filter
        planning_filter: Filter by planning status
            - 'all' or None: Show all records
            - 'planned': Show only records with planned quantities > 0
            - 'unplanned': Show only records with no planning (planned quantities = 0)
    """
    if not from_date:
        from_date = frappe.utils.today()
    if not to_date:
        to_date = frappe.utils.today()
    
    # Build item filter condition
    item_condition = ""
    lot_condition_actual = ""
    lot_condition_stock = ""
    
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
        WHERE wp.docstatus = 1 
        AND wp.date BETWEEN '{from_date}' AND '{to_date}'
        {item_condition}
        
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
        WHERE awp.docstatus = 1 
        AND awp.date BETWEEN '{from_date}' AND '{to_date}'
        {item_condition.replace('wpi.item', 'awpi.item')}
        
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
    stock_query = f"""
        SELECT 
            DATE(se.posting_date) as production_date,
            sed.item_code,
            COALESCE(sed.spp_batch_number, sed.batch_no, 'No Lot') as lot_number,
            SUM(sed.qty) as stock_qty_kg,
            COUNT(DISTINCT se.name) as stock_entries,
            GROUP_CONCAT(DISTINCT se.name ORDER BY se.name) as entry_references
        FROM `tabStock Entry` se
        JOIN `tabStock Entry Detail` sed ON se.name = sed.parent
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

    # Create a comprehensive data structure that handles lot numbers
    # Key strategy: Include lot number in the key for actual/stock data, but group planned data separately
    combined_data = {}
    
    # First, collect all unique combinations of date + item + lot from actual and stock data
    all_combinations = set()
    
    # Add combinations from actual data
    for row in actual_data:
        all_combinations.add((row.production_date, row.item_code, row.lot_number))
    
    # Add combinations from stock data
    for row in stock_data:
        all_combinations.add((row.production_date, row.item_code, row.lot_number))
    
    # Add combinations from planned data (with 'Planned' as lot number)
    for key, row in planned_aggregated.items():
        all_combinations.add((row['production_date'], row['item_code'], 'Planned'))
    
    # Initialize combined data structure for all combinations
    for production_date, item_code, lot_number in all_combinations:
        key = f"{production_date}|{item_code}|{lot_number}"
        combined_data[key] = {
            'production_date': production_date,
            'item_code': item_code,
            'lot_number': lot_number,
            'shift_type': 'All',
            'planned_qty_pieces': 0,
            'actual_qty_pieces': 0,
            'actual_weight_kg': 0,
            'stock_qty_kg': 0,
            'production_entries': 0,
            'stock_entries': 0,
            'variance_pieces': 0,
            'variance_percentage': 0,
            'efficiency': 0,
            'planning_sources': [],
            'entry_references_actual': '',
            'entry_references_stock': ''
        }

    # Add planned data to all lot numbers for the same item/date combination
    for planned_key, planned_row in planned_aggregated.items():
        production_date, item_code = planned_key.split('|')
        
        # Find all lot numbers for this item/date and distribute planned quantities
        matching_lots = [key for key in combined_data.keys() 
                        if key.startswith(f"{production_date}|{item_code}|")]
        
        if matching_lots:
            # If there are actual/stock lots, don't create a separate 'Planned' entry
            # Instead, add planned data to the first actual lot or create one entry
            planned_per_lot = planned_row['planned_qty_pieces'] / len(matching_lots) if len(matching_lots) > 1 else planned_row['planned_qty_pieces']
            
            for lot_key in matching_lots:
                if combined_data[lot_key]['lot_number'] != 'Planned':
                    combined_data[lot_key]['planned_qty_pieces'] = planned_row['planned_qty_pieces']  # Give full planned qty to first actual lot
                    combined_data[lot_key]['planning_sources'] = list(planned_row['planning_sources'])
                    break
        else:
            # No actual/stock data, create a planned-only entry
            key = f"{production_date}|{item_code}|Planned"
            if key in combined_data:
                combined_data[key]['planned_qty_pieces'] = planned_row['planned_qty_pieces']
                combined_data[key]['planning_sources'] = list(planned_row['planning_sources'])

    # Add actual production data
    for row in actual_data:
        key = f"{row.production_date}|{row.item_code}|{row.lot_number}"
        
        if key in combined_data:
            combined_data[key]['actual_qty_pieces'] += flt(row.actual_qty_pieces)
            combined_data[key]['actual_weight_kg'] += flt(row.actual_weight_kg)
            combined_data[key]['production_entries'] += cint(row.production_entries)
            combined_data[key]['entry_references_actual'] = row.entry_references or ''

    # Add stock entry data
    for row in stock_data:
        key = f"{row.production_date}|{row.item_code}|{row.lot_number}"
        
        if key in combined_data:
            combined_data[key]['stock_qty_kg'] += flt(row.stock_qty_kg)
            combined_data[key]['stock_entries'] += cint(row.stock_entries)
            combined_data[key]['entry_references_stock'] = row.entry_references or ''

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
        
        # Format the production date for display
        data['production_date_formatted'] = formatdate(data['production_date'])
        
        # Format planning sources for display
        data['planning_sources_text'] = ', '.join(data['planning_sources']) if data['planning_sources'] else 'No Planning'
        
        final_data.append(data)

    # Sort by date desc, then by item
    final_data.sort(key=lambda x: (x['production_date'], x['item_code']), reverse=True)
    
    return final_data


@frappe.whitelist()
def get_summary_statistics(from_date=None, to_date=None, item_filter=None, lot_filter=None, planning_filter=None):
    """
    Get summary statistics for the planned vs actual report
    """
    data = get_planned_vs_actual_data(from_date, to_date, item_filter, lot_filter, planning_filter)
    
    if not data:
        return {
            'total_planned_pieces': 0,
            'total_actual_pieces': 0,
            'total_actual_kg': 0,
            'total_stock_kg': 0,
            'overall_efficiency': 0,
            'total_items': 0,
            'total_dates': 0,
            'avg_efficiency': 0
        }
    
    total_planned = sum(row['planned_qty_pieces'] for row in data)
    total_actual = sum(row['actual_qty_pieces'] for row in data)
    total_actual_kg = sum(row['actual_weight_kg'] for row in data)
    total_stock_kg = sum(row['stock_qty_kg'] for row in data)
    
    # Calculate overall efficiency
    if total_planned > 0:
        overall_efficiency = (total_actual / total_planned) * 100
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
        'total_actual_pieces': total_actual, 
        'total_actual_kg': total_actual_kg,
        'total_stock_kg': total_stock_kg,
        'overall_efficiency': overall_efficiency,
        'total_items': unique_items,
        'total_dates': unique_dates,
        'avg_efficiency': avg_efficiency
    }
