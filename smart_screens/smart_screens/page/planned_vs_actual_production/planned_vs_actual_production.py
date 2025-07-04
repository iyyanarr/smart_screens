import frappe
from frappe import _
from frappe.utils import flt, cint, getdate, today, formatdate
from datetime import datetime, timedelta


@frappe.whitelist()
def get_planned_vs_actual_data(from_date=None, to_date=None, item_filter=None):
    """
    Get planned vs actual production data by comparing:
    1. Work Planning data (planned quantities in pieces)
    2. Moulding Production Entry data (actual pieces produced)
    3. Stock Entry data (actual kg produced from moulding stock entries)
    
    Since there's no direct linkage between Work Planning lot numbers and 
    Moulding Production SPP batch numbers, we aggregate by Item + Date.
    """
    if not from_date:
        from_date = (getdate(today()) - timedelta(days=7)).strftime('%Y-%m-%d')
    if not to_date:
        to_date = today()
    
    # Validate date range
    if getdate(from_date) > getdate(to_date):
        frappe.throw("From Date cannot be greater than To Date")
    
    # Build item filter condition
    item_condition = ""
    if item_filter:
        item_condition = f"AND wpi.item LIKE '%{item_filter}%'"
    
    # Get planned data from Work Planning and Add On Work Planning
    planned_query = f"""
        SELECT 
            wp.date as production_date,
            wpi.item as item_code,
            wpi.lot_number,
            wp.shift_type,
            COALESCE(SUM(COALESCE(wpit.target_qty, 0)), 0) as planned_qty_pieces,
            COUNT(DISTINCT wpi.name) as planned_lots,
            'Work Planning' as source_type
        FROM `tabWork Planning` wp
        JOIN `tabWork Plan Item` wpi ON wp.name = wpi.parent
        LEFT JOIN `tabShift Type` st ON wp.shift_type = st.name
        LEFT JOIN `tabWork Plan Item Target` wpit ON (
            (TIME_FORMAT(st.total_time, '%k:%i:%s') = wpit.shift_type 
             OR TIME_FORMAT(st.total_time, '%H:%i:%s') = wpit.shift_type)
            AND wpi.item = wpit.item
        )
        WHERE wp.date BETWEEN '{from_date}' AND '{to_date}'
        {item_condition}
        GROUP BY wp.date, wpi.item, wp.shift_type
        
        UNION ALL
        
        SELECT 
            awp.date as production_date,
            awpi.item as item_code,
            awpi.lot_number,
            awp.shift_type,
            0 as planned_qty_pieces,  -- Add-on planning doesn't have target quantities
            COUNT(DISTINCT awpi.name) as planned_lots,
            'Add On Work Planning' as source_type
        FROM `tabAdd On Work Planning` awp
        JOIN `tabAdd On Work Plan Item` awpi ON awp.name = awpi.parent
        WHERE awp.date BETWEEN '{from_date}' AND '{to_date}'
        {item_condition.replace('wpi.item', 'awpi.item')}
        GROUP BY awp.date, awpi.item, awp.shift_type
        
        ORDER BY production_date DESC, item_code
    """
    
    planned_data = frappe.db.sql(planned_query, as_dict=True)
    
    # Get actual production data from Moulding Production Entry
    actual_query = f"""
        SELECT 
            mpe.moulding_date as production_date,
            mpe.item_to_produce as item_code,
            mpe.spp_batch_number,
            SUM(mpe.number_of_lifts * mpe.no_of_running_cavities) as actual_qty_pieces,
            SUM(mpe.weight) as actual_weight_kg,
            COUNT(DISTINCT mpe.name) as production_entries,
            GROUP_CONCAT(DISTINCT mpe.stock_entry_reference) as stock_entries
        FROM `tabMoulding Production Entry` mpe
        WHERE mpe.moulding_date BETWEEN '{from_date}' AND '{to_date}'
        AND mpe.docstatus = 1
        {item_condition.replace('wpi.item', 'mpe.item_to_produce')}
        GROUP BY mpe.moulding_date, mpe.item_to_produce
        ORDER BY mpe.moulding_date DESC, mpe.item_to_produce
    """
    
    actual_data = frappe.db.sql(actual_query, as_dict=True)
    
    # Get stock entry data for weight verification
    stock_query = f"""
        SELECT 
            DATE(se.posting_date) as production_date,
            sed.item_code,
            SUM(sed.qty) as stock_qty_kg,
            COUNT(DISTINCT se.name) as stock_entries
        FROM `tabStock Entry` se
        JOIN `tabStock Entry Detail` sed ON se.name = sed.parent
        WHERE se.posting_date BETWEEN '{from_date}' AND '{to_date}'
        AND se.purpose = 'Manufacture'
        AND se.docstatus = 1
        AND sed.t_warehouse IS NOT NULL
        {item_condition.replace('wpi.item', 'sed.item_code')}
        GROUP BY DATE(se.posting_date), sed.item_code
        ORDER BY se.posting_date DESC, sed.item_code
    """
    
    stock_data = frappe.db.sql(stock_query, as_dict=True)
    
    # Combine data into a unified structure
    combined_data = {}
    
    # Add planned data
    for row in planned_data:
        key = f"{row.production_date}|{row.item_code}|{row.shift_type or 'All'}"
        if key not in combined_data:
            combined_data[key] = {
                'production_date': row.production_date,
                'item_code': row.item_code,
                'shift_type': row.shift_type or 'All',
                'planned_qty_pieces': 0,
                'planned_lots': 0,
                'actual_qty_pieces': 0,
                'actual_weight_kg': 0,
                'stock_qty_kg': 0,
                'production_entries': 0,
                'stock_entries': 0,
                'variance_pieces': 0,
                'variance_percentage': 0,
                'efficiency': 0,
                'planning_sources': []  # Track which planning types are used
            }
        
        combined_data[key]['planned_qty_pieces'] += flt(row.planned_qty_pieces)
        combined_data[key]['planned_lots'] += cint(row.planned_lots)
        
        # Track planning source
        source = row.get('source_type', 'Work Planning')
        if source not in combined_data[key]['planning_sources']:
            combined_data[key]['planning_sources'].append(source)
    
    # Add actual production data (no shift segregation available)
    for row in actual_data:
        # For actual data, we need to distribute across all shift types for this item/date
        item_date_pattern = f"{row.production_date}|{row.item_code}|"
        
        # Find all planned records for this item/date combination
        matching_keys = [key for key in combined_data.keys() if key.startswith(item_date_pattern)]
        
        if matching_keys:
            # Distribute actual data across all matching planned records
            for key in matching_keys:
                combined_data[key]['actual_qty_pieces'] += flt(row.actual_qty_pieces) / len(matching_keys)
                combined_data[key]['actual_weight_kg'] += flt(row.actual_weight_kg) / len(matching_keys)
                combined_data[key]['production_entries'] += cint(row.production_entries) / len(matching_keys)
        else:
            # Create a new record for actual-only data
            key_all = f"{row.production_date}|{row.item_code}|All"
            if key_all not in combined_data:
                combined_data[key_all] = {
                    'production_date': row.production_date,
                    'item_code': row.item_code,
                    'shift_type': 'All',
                    'planned_qty_pieces': 0,
                    'planned_lots': 0,
                    'actual_qty_pieces': 0,
                    'actual_weight_kg': 0,
                    'stock_qty_kg': 0,
                    'production_entries': 0,
                    'stock_entries': 0,
                    'variance_pieces': 0,
                    'variance_percentage': 0,
                    'efficiency': 0,
                    'planning_sources': []
                }
            
            combined_data[key_all]['actual_qty_pieces'] += flt(row.actual_qty_pieces)
            combined_data[key_all]['actual_weight_kg'] += flt(row.actual_weight_kg)
            combined_data[key_all]['production_entries'] += cint(row.production_entries)
    
    # Add stock entry data
    for row in stock_data:
        # For stock data, we need to distribute across all shift types for this item/date
        item_date_pattern = f"{row.production_date}|{row.item_code}|"
        
        # Find all records (planned or actual) for this item/date combination
        matching_keys = [key for key in combined_data.keys() if key.startswith(item_date_pattern)]
        
        if matching_keys:
            # Distribute stock data across all matching records
            for key in matching_keys:
                combined_data[key]['stock_qty_kg'] += flt(row.stock_qty_kg) / len(matching_keys)
                combined_data[key]['stock_entries'] += cint(row.stock_entries) / len(matching_keys)
        else:
            # Create a new record for stock-only data
            key_all = f"{row.production_date}|{row.item_code}|All"
            if key_all not in combined_data:
                combined_data[key_all] = {
                    'production_date': row.production_date,
                    'item_code': row.item_code,
                    'shift_type': 'All',
                    'planned_qty_pieces': 0,
                    'planned_lots': 0,
                    'actual_qty_pieces': 0,
                    'actual_weight_kg': 0,
                    'stock_qty_kg': 0,
                    'production_entries': 0,
                    'stock_entries': 0,
                    'variance_pieces': 0,
                    'variance_percentage': 0,
                    'efficiency': 0,
                    'planning_sources': []
                }
            
            combined_data[key_all]['stock_qty_kg'] += flt(row.stock_qty_kg)
            combined_data[key_all]['stock_entries'] += cint(row.stock_entries)
    
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
def get_summary_statistics(from_date=None, to_date=None, item_filter=None):
    """
    Get summary statistics for the planned vs actual report
    """
    data = get_planned_vs_actual_data(from_date, to_date, item_filter)
    
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
    
    overall_efficiency = (total_actual / total_planned * 100) if total_planned > 0 else 0
    
    unique_items = len(set(row['item_code'] for row in data))
    unique_dates = len(set(row['production_date'] for row in data))
    
    efficiencies = [row['efficiency'] for row in data if row['planned_qty_pieces'] > 0]
    avg_efficiency = sum(efficiencies) / len(efficiencies) if efficiencies else 0
    
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


@frappe.whitelist()
def get_item_list():
    """
    Get list of items that have either planning or production data
    """
    query = """
        SELECT DISTINCT item_code, item_name
        FROM (
            SELECT wpi.item as item_code, wpi.item as item_name
            FROM `tabWork Plan Item` wpi
            UNION
            SELECT mpe.item_to_produce as item_code, mpe.item_to_produce as item_name  
            FROM `tabMoulding Production Entry` mpe
            WHERE mpe.moulding_date >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
        ) items
        ORDER BY item_code
    """
    
    return frappe.db.sql(query, as_dict=True)
