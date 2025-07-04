import frappe
from frappe import _
import json
from datetime import datetime

@frappe.whitelist()
def get_shift_quantity_planned_data(filters=None):
    """
    Get shift quantity planned report data
    Expected Production Qty = Target No. Of Lifts × No. Of Cavities
    """
    try:
        # Convert filters string to dict if provided
        if filters and isinstance(filters, str):
            filters = json.loads(filters)
        
        # Initialize filters
        date_filter = filters.get('date') if filters else None
        shift_filter = filters.get('shift_type') if filters else None
        
        # Build conditions
        conditions = []
        values = {}
        
        if date_filter:
            conditions.append("wp.date = %(date)s")
            values['date'] = date_filter
            
        if shift_filter:
            conditions.append("wp.shift_type = %(shift_type)s")
            values['shift_type'] = shift_filter
        
        where_clause = " AND ".join(conditions) if conditions else "1=1"
        
        # Query for regular work planning data
        regular_query = f"""
            SELECT 
                wpi.item,
                wpi.work_station as press,
                wpi.mould,
                wp.date,
                wp.shift_type,
                ms.noof_cavities,
                wpit.target_qty,
                CASE 
                    WHEN ms.noof_cavities IS NOT NULL AND wpit.target_qty IS NOT NULL 
                    THEN CAST(ms.noof_cavities AS FLOAT) * CAST(wpit.target_qty AS FLOAT)
                    ELSE 0
                END as expected_production_qty,
                'Regular' as plan_type
            FROM `tabWork Planning` wp
            INNER JOIN `tabWork Plan Item` wpi ON wp.name = wpi.parent
            LEFT JOIN `tabMould Specification` ms ON wpi.mould = ms.mould_ref AND ms.docstatus = 1
            LEFT JOIN `tabShift Type` st ON wp.shift_type = st.name
            LEFT JOIN `tabWork Plan Item Target` wpit ON wpi.item = wpit.item AND TIME(st.total_time) = wpit.shift_type
            WHERE wp.docstatus = 1 AND {where_clause}
        """
        
        # Query for add-on work planning data
        addon_query = f"""
            SELECT 
                awpi.item,
                awpi.work_station as press,
                awpi.mould,
                awp.date,
                awp.shift_type,
                ms.noof_cavities,
                wpit.target_qty,
                CASE 
                    WHEN ms.noof_cavities IS NOT NULL AND wpit.target_qty IS NOT NULL 
                    THEN CAST(ms.noof_cavities AS FLOAT) * CAST(wpit.target_qty AS FLOAT)
                    ELSE 0
                END as expected_production_qty,
                'Add-on' as plan_type
            FROM `tabAdd On Work Planning` awp
            INNER JOIN `tabAdd On Work Plan Item` awpi ON awp.name = awpi.parent
            LEFT JOIN `tabMould Specification` ms ON awpi.mould = ms.mould_ref AND ms.docstatus = 1
            LEFT JOIN `tabShift Type` st2 ON awp.shift_type = st2.name
            LEFT JOIN `tabWork Plan Item Target` wpit ON awpi.item = wpit.item AND TIME(st2.total_time) = wpit.shift_type
            WHERE awp.docstatus = 1 AND {where_clause.replace('wp.', 'awp.')}
        """
        
        # Execute queries
        regular_data = frappe.db.sql(regular_query, values, as_dict=True)
        addon_data = frappe.db.sql(addon_query, values, as_dict=True)
        
        # Combine data
        all_data = regular_data + addon_data
        
        # Group and aggregate by item and press
        aggregated_data = {}
        
        for row in all_data:
            key = f"{row.item}_{row.press}"
            
            if key not in aggregated_data:
                aggregated_data[key] = {
                    'item': row.item,
                    'press': row.press,
                    'mould': row.mould,
                    'date': row.date,
                    'shift_type': row.shift_type,
                    'noof_cavities': row.noof_cavities or 0,
                    'target_qty': row.target_qty or 0,
                    'expected_production_qty': 0,
                    'plan_types': []
                }
            
            # Aggregate expected production quantity
            aggregated_data[key]['expected_production_qty'] += row.expected_production_qty or 0
            
            # Track plan types
            if row.plan_type not in aggregated_data[key]['plan_types']:
                aggregated_data[key]['plan_types'].append(row.plan_type)
        
        # Convert to list and add plan types as string
        result = []
        for data in aggregated_data.values():
            data['plan_types_str'] = ', '.join(data['plan_types'])
            result.append(data)
        
        # Sort by item name
        result.sort(key=lambda x: x['item'])
        
        return {
            'data': result,
            'total_records': len(result)
        }
        
    except Exception as e:
        frappe.log_error(f"Error in get_shift_quantity_planned_data: {str(e)}")
        return {
            'data': [],
            'total_records': 0,
            'error': str(e)
        }

@frappe.whitelist()
def get_shift_types():
    """Get all available shift types"""
    try:
        shift_types = frappe.db.sql("""
            SELECT name, start_time, end_time 
            FROM `tabShift Type`
            ORDER BY name
        """, as_dict=True)
        
        return shift_types
    except Exception as e:
        frappe.log_error(f"Error in get_shift_types: {str(e)}")
        return []

@frappe.whitelist()
def get_filter_options():
    """Get filter options for the report"""
    try:
        # Get distinct dates from work planning
        dates_query = """
            SELECT DISTINCT date 
            FROM (
                SELECT date FROM `tabWork Planning` WHERE docstatus = 1
                UNION
                SELECT date FROM `tabAdd On Work Planning` WHERE docstatus = 1
            ) as combined_dates
            ORDER BY date DESC
            LIMIT 30
        """
        
        dates = frappe.db.sql(dates_query, as_dict=True)
        
        # Get shift types
        shift_types = get_shift_types()
        
        return {
            'dates': [d.date for d in dates],
            'shift_types': shift_types
        }
        
    except Exception as e:
        frappe.log_error(f"Error in get_filter_options: {str(e)}")
        return {
            'dates': [],
            'shift_types': []
        }
