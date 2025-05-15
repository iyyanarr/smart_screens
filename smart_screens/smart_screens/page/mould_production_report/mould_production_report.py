# Copyright (c) 2023, Tridotstech and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from collections import defaultdict
import datetime
from dateutil.relativedelta import relativedelta
import json

def debug_log(title, message=None, log_type="Mould Report"):
    """Helper function to properly log messages with large data"""
    if message is None:
        # If no message is provided, log the title as the message with a generic title
        frappe.log_error(message=title, title=log_type)
    else:
        # Keep title short, put details in message
        frappe.log_error(message=message, title=f"{log_type}: {title}")

@frappe.whitelist()
def get_mould_production_data(filters=None):
    try:
        if isinstance(filters, str):
            filters = json.loads(filters)
        
        # Validate required filters
        if not filters.get('from_date') or not filters.get('to_date'):
            return {
                'error': 'From Date and To Date are required'
            }
        
        # Add brief debug logging (avoiding truncation errors)
        debug_log("Processing request", f"Filters: {filters}")
        
        # Get moulds data
        moulds = get_moulds_data(filters)
        debug_log("Moulds fetched", f"Count: {len(moulds)}")
        
        # Get production entries for the moulds
        mould_production_data = get_mould_production_entries(filters)
        debug_log("Production data fetched", f"For {len(mould_production_data)} moulds")
        
        # Get month columns for the report
        month_columns = get_month_columns()
        
        # Process monthly data for each mould
        for mould in moulds:
            # Initialize monthly data
            mould['monthly_data'] = {}
            
            # Get all entries for this mould - check both name and mould_ref
            mould_entries = mould_production_data.get(mould.name, [])
            
            # Also check if entries might be linked using mould_ref instead of name
            if mould.mould_ref and mould.mould_ref in mould_production_data:
                mould_entries.extend(mould_production_data.get(mould.mould_ref, []))
            
            # Calculate the total entries and lifts
            total_lifts = 0
            entry_count = 0
            
            for entry in mould_entries:
                entry_count += 1
                # Convert number_of_lifts to int to avoid str/int comparison
                entry_lifts = convert_to_int(entry.number_of_lifts)
                total_lifts += entry_lifts
            
            mould['entry_count'] = entry_count
            mould['total_lifts'] = total_lifts
            
            # Calculate average lifts per entry
            if entry_count > 0:
                mould['avg_lifts_per_entry'] = round(total_lifts / entry_count, 2)
            else:
                mould['avg_lifts_per_entry'] = 0
            
            # Process monthly data
            for entry in mould_entries:
                # Convert and check number_of_lifts
                entry_lifts = convert_to_int(entry.number_of_lifts)
                if entry_lifts <= 0:
                    continue
                
                # Get the month key for this entry (YYYY-MM)
                try:
                    month_key = entry.moulding_date.strftime('%Y-%m')
                    
                    # Debug the month key generation
                    debug_log("Month key generation", f"Month key: {month_key} from date: {entry.moulding_date}")
                    
                    # Add to the monthly data
                    if month_key not in mould['monthly_data']:
                        mould['monthly_data'][month_key] = {
                            'total_lifts': 0,
                            'entry_count': 0
                        }
                    
                    mould['monthly_data'][month_key]['total_lifts'] += entry_lifts
                    mould['monthly_data'][month_key]['entry_count'] += 1
                except Exception as e:
                    debug_log("Error generating month key", f"Error: {str(e)}, date: {entry.moulding_date}")
                    continue
            
            # Get historical data (all lifts before current year)
            mould['historical_data'] = get_historical_data(mould.name)
            
            # Log the monthly data for debugging
            mould_desc = f"Mould {mould.name} ({mould.mould_ref})"
            debug_log("Monthly data", f"{mould_desc} monthly data: {mould['monthly_data']}")
            
            # Calculate cavity utilization - ensure noof_cavities is a number
            noof_cavities = convert_to_int(mould.noof_cavities)
            if noof_cavities > 0 and entry_count > 0:
                mould['cavity_utilization'] = round((total_lifts / entry_count / noof_cavities) * 100, 2)
            else:
                mould['cavity_utilization'] = 0
            
            # Calculate lifts per hour (assuming avg production time is 8 hours)
            if entry_count > 0:
                mould['lifts_per_hour'] = round(total_lifts / (entry_count * 8), 2)
            else:
                mould['lifts_per_hour'] = 0
            
            # Add extra field for status display in the UI
            mould['is_active'] = (mould.mould_status == 'ACTIVE')
        
        # Filter out moulds with no production if requested
        if filters.get('no_entries_without_production'):
            moulds = [m for m in moulds if m.get('entry_count', 0) > 0]
        
        # Calculate overall metrics
        total_moulds = len(moulds)
        total_entries = sum([m.get('entry_count', 0) for m in moulds])
        total_lifts = sum([m.get('total_lifts', 0) for m in moulds])
        
        # Calculate monthly aggregates
        monthly_data = {}
        for mould in moulds:
            for month_key, month_data in mould.get('monthly_data', {}).items():
                if month_key not in monthly_data:
                    monthly_data[month_key] = {
                        'total_lifts': 0,
                        'entry_count': 0
                    }
                
                monthly_data[month_key]['total_lifts'] += month_data['total_lifts']
                monthly_data[month_key]['entry_count'] += month_data['entry_count']
        
        # Identify top performers
        top_performers = sorted(moulds, key=lambda m: m.get('total_lifts', 0), reverse=True)[:5]
        
        # Create the result dictionary
        result = {
            'moulds': moulds,
            'month_columns': month_columns,
            'total_moulds': total_moulds,
            'total_entries': total_entries,
            'total_lifts': total_lifts,
            'top_performers': top_performers,
            'monthly_data': monthly_data
        }
        
        return result
    
    except Exception as e:
        debug_log("Error", f"Error in mould production report: {str(e)}")
        return {
            'error': str(e)
        }

def get_month_columns():
    """Get only the current year months as column headers"""
    today = datetime.date.today()
    current_year = today.year
    debug_log("Month columns", f"Current year detected as: {current_year}")
    
    months = []
    
    # Start from the beginning of the current year (January)
    start_month = 1
    current_month = today.month
    
    for month_num in range(start_month, current_month + 1):
        month_date = datetime.date(current_year, month_num, 1)
        month_name = month_date.strftime("%b")
        year = month_date.strftime("%Y")
        month_key = month_date.strftime("%Y-%m")
        
        debug_log("Month column", f"Adding month column: {month_name} {year}, key: {month_key}")
        
        months.append({
            "key": month_key,
            "label": month_name,
            "year": year,
            "start_date": month_date.replace(day=1).strftime("%Y-%m-%d"),
            "end_date": (month_date.replace(day=1) + relativedelta(months=1, days=-1)).strftime("%Y-%m-%d")
        })
    
    return months

def get_historical_data(mould_ref):
    """Get total production data for a mould before the current year"""
    current_year = datetime.date.today().year
    start_of_current_year = f"{current_year}-01-01"
    
    # Also get the mould_ref value from Mould Specification if name is provided
    alt_mould_ref = None
    if mould_ref:
        mould_spec = frappe.db.get_value("Mould Specification", mould_ref, "mould_ref")
        if mould_spec:
            alt_mould_ref = mould_spec
    
    conditions = []
    params = []
    
    if alt_mould_ref:
        conditions.append("(mould_reference = %s OR mould_reference = %s)")
        params.extend([mould_ref, alt_mould_ref])
    else:
        conditions.append("mould_reference = %s")
        params.append(mould_ref)
    
    # Add date condition for before current year
    conditions.append("moulding_date < %s")
    params.append(start_of_current_year)
    
    # Build query
    query = f"""
        SELECT 
            SUM(CASE WHEN number_of_lifts IS NULL THEN 0 ELSE number_of_lifts END) as total_lifts,
            COUNT(*) as entry_count
        FROM 
            `tabMoulding Production Entry`
        WHERE 
            docstatus = 1
            AND {" AND ".join(conditions)}
    """
    
    # Execute query with parameters
    entries = frappe.db.sql(query, tuple(params), as_dict=1)
    
    if entries and entries[0]:
        return {
            "total_lifts": convert_to_int(entries[0].total_lifts),
            "entry_count": convert_to_int(entries[0].entry_count)
        }
    else:
        return {
            "total_lifts": 0,
            "entry_count": 0
        }

def convert_to_int(value):
    """Convert a value to integer safely"""
    try:
        if value is None:
            return 0
        return int(float(value))
    except (ValueError, TypeError):
        return 0

def convert_to_float(value):
    """Convert a value to float safely"""
    try:
        if value is None:
            return 0.0
        return float(value)
    except (ValueError, TypeError):
        return 0.0

def get_moulds_data(filters):
    """Fetch moulds data based on filters"""
    conditions = []
    params = []
    
    # Add filter conditions if provided
    if filters.get('mould_ref'):
        conditions.append("mould_ref LIKE %s")
        params.append(f"%{filters.get('mould_ref')}%")
    
    if filters.get('spp_ref'):
        conditions.append("spp_ref LIKE %s")
        params.append(f"%{filters.get('spp_ref')}%")
    
    if filters.get('mould_status'):
        conditions.append("mould_status = %s")
        params.append(filters.get('mould_status'))
    
    # Build the WHERE clause
    where_clause = " AND ".join(conditions) if conditions else "1=1"
    
    # Execute the query to fetch moulds
    query = f"""
        SELECT 
            name, 
            mould_ref, 
            spp_ref, 
            noof_cavities, 
            mould_status,
            creation
        FROM 
            `tabMould Specification`
        WHERE 
            {where_clause}
        ORDER BY 
            mould_ref ASC
    """
    
    moulds = frappe.db.sql(query, tuple(params), as_dict=1)
    
    return moulds

def get_mould_production_entries(filters):
    """Fetch production entries for moulds based on filters"""
    entries_by_mould = defaultdict(list)
    conditions = []
    params = []
    
    # Add date range filters
    if filters.get('from_date') and filters.get('to_date'):
        conditions.append("moulding_date BETWEEN %s AND %s")
        params.extend([filters.get('from_date'), filters.get('to_date')])
    
    # Add specific mould filter if provided
    if filters.get('mould_ref'):
        conditions.append("mould_reference LIKE %s")
        params.append(f"%{filters.get('mould_ref')}%")
    
    # Add specific SPP reference filter if provided
    if filters.get('spp_ref'):
        # First get the mould_references matching the SPP reference
        mould_specs = frappe.get_all(
            "Mould Specification", 
            filters={"spp_ref": ["like", f"%{filters.get('spp_ref')}%"]},
            fields=["name", "mould_ref"]
        )
        
        if mould_specs:
            mould_condition = " OR ".join(["mould_reference = %s"] * len(mould_specs))
            conditions.append(f"({mould_condition})")
            params.extend([m.name for m in mould_specs] + [m.mould_ref for m in mould_specs if m.mould_ref])
    
    # Add machine filter if provided (fixed column name)
    if filters.get('machine'):
        conditions.append("moulding_machine = %s")
        params.append(filters.get('machine'))
    
    # Build the WHERE clause
    where_clause = " AND ".join(conditions) if conditions else "1=1"
    
    # Add debug logging for date range
    if filters.get('from_date') and filters.get('to_date'):
        debug_log("Date range", f"From {filters.get('from_date')} to {filters.get('to_date')}")
    
    # Execute the query to fetch mould production entries
    query = f"""
        SELECT 
            name,
            mould_reference,
            moulding_date,
            number_of_lifts,
            creation
        FROM 
            `tabMoulding Production Entry`
        WHERE 
            docstatus = 1
            AND {where_clause}
        ORDER BY 
            moulding_date DESC
    """
    
    entries = frappe.db.sql(query, tuple(params), as_dict=1)
    debug_log("Production entries", f"Retrieved {len(entries)} production entries")
    
    # Log a sample entry if available to debug date format
    if entries and len(entries) > 0:
        debug_log("Sample entry", f"Date: {entries[0].moulding_date}, type: {type(entries[0].moulding_date)}")
    
    # Group entries by mould reference
    for entry in entries:
        if entry.mould_reference:
            # Make sure moulding_date is properly formatted for month key extraction
            if isinstance(entry.moulding_date, str):
                try:
                    # Parse the date string if it's a string
                    parsed_date = datetime.datetime.strptime(entry.moulding_date, '%Y-%m-%d')
                    entry.moulding_date = parsed_date.date()
                except (ValueError, TypeError):
                    debug_log("Date parsing error", f"Failed to parse date: {entry.moulding_date}")
                    continue
            
            entries_by_mould[entry.mould_reference].append(entry)
    
    debug_log("Grouped entries", f"Entries grouped for {len(entries_by_mould)} moulds")
    return entries_by_mould