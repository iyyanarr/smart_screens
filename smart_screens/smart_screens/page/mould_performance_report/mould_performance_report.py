import frappe
from frappe import _
import json
from datetime import datetime, timedelta, date  # normalize dates for comparisons
import calendar

@frappe.whitelist()
def get_mould_performance_data(filters=None):
    try:
        # Convert filters string to dict if provided
        if filters and isinstance(filters, str):
            filters = json.loads(filters)

        # Prepare date range if provided
        current_year = datetime.now().year
        
        # Initialize date range dt objects
        start_dt = None
        end_dt = None
        # Parse date_range filter and build months list
        months = []
        if filters and filters.get('date_range') and isinstance(filters['date_range'], list) and len(filters['date_range']) == 2:
            start_str, end_str = filters['date_range']
            try:
                start_dt = datetime.strptime(start_str, "%Y-%m-%d")
                end_dt = datetime.strptime(end_str, "%Y-%m-%d")
            except Exception:
                start_dt = None
                end_dt = None
        # Build dynamic months based on valid date range
        if start_dt and end_dt:
            cur = datetime(start_dt.year, start_dt.month, 1)
            end_month = datetime(end_dt.year, end_dt.month, 1)
            while cur <= end_month:
                months.append({ 'year': cur.year, 'month': cur.month, 'label': calendar.month_abbr[cur.month] })
                # advance one month
                if cur.month == 12:
                    cur = datetime(cur.year + 1, 1, 1)
                else:
                    cur = datetime(cur.year, cur.month + 1, 1)
        else:
            # fallback to calendar year months
            months = [{ 'year': current_year, 'month': m, 'label': calendar.month_abbr[m] } for m in range(1, 13)]
        
        # Prepare date objects for comparison (use dates to avoid datetime vs date issues)
        start_date = start_dt.date() if start_dt else None
        end_date = end_dt.date() if end_dt else None

        # Process date range filter
        filter_conditions = "me.docstatus = 1"
        filter_values = {}
        
        if filters:
            # Mould reference filter
            if filters.get('mould_ref'):
                filter_conditions += " AND me.mould_reference = %(mould_ref)s"
                filter_values['mould_ref'] = filters.get('mould_ref')
            
            # Date range filter
            # Use separate vars to avoid colliding with date objects
            if filters.get('date_range') and isinstance(filters.get('date_range'), list) and len(filters.get('date_range')) == 2:
                range_start_str, range_end_str = filters.get('date_range')
                if range_start_str:
                    filter_conditions += " AND me.moulding_date >= %(range_start)s"
                    filter_values['range_start'] = range_start_str
                if range_end_str:
                    filter_conditions += " AND me.moulding_date <= %(range_end)s"
                    filter_values['range_end'] = range_end_str

        # Build pivot query to aggregate total lifts, pre-2025 and monthly sums for current year
        cutoff_date = date(current_year, 1, 1)
        select_fields = [
            "me.mould_reference AS mould_ref",
            "SUM(me.number_of_lifts) AS total_lifts",
            f"SUM(CASE WHEN me.moulding_date < '{cutoff_date}' THEN me.number_of_lifts ELSE 0 END) AS lifts_before_2025"
        ]
        for m in months:
            select_fields.append(
                f"SUM(CASE WHEN YEAR(me.moulding_date) = {m['year']} AND MONTH(me.moulding_date) = {m['month']} THEN me.number_of_lifts ELSE 0 END) AS month_{m['month']}"
            )
        query = f"""
            SELECT {', '.join(select_fields)}
            FROM `tabMoulding Production Entry` me
            WHERE me.docstatus = 1
            GROUP BY me.mould_reference
            ORDER BY me.mould_reference
        """
        result = frappe.db.sql(query, as_dict=1)

        # Return aggregated report data
        return {
            "status": "success",
            "message": "Aggregated lifts by mould_ref",
            "report_data": result
        }

    except Exception as e:
        frappe.log_error(
            title=_("Mould Performance Report Error"),
            message=frappe.get_traceback()
        )
        return {
            "status": "error",
            "message": f"Error fetching data: {str(e)}"
        }