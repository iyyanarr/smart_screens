import frappe
from frappe import _
import json
from datetime import datetime
import calendar

@frappe.whitelist()
def get_mould_performance_data(filters=None):
    try:
        # Convert filters string to dict if provided
        if filters and isinstance(filters, str):
            filters = json.loads(filters)

        current_year = datetime.now().year
        base_filters = {"docstatus": 1}
        
        # Add mould reference filter if provided
        if filters and filters.get('mould_ref'):
            base_filters['mould_reference'] = filters.get('mould_ref')

        # Get production entries
        production_entries = frappe.db.sql("""
            SELECT 
                me.mould_reference,
                ms.part_no,
                me.number_of_lifts,
                YEAR(me.moulding_date) as year,
                MONTH(me.moulding_date) as month
            FROM 
                `tabMoulding Production Entry` me
            LEFT JOIN 
                `tabMould Specification` ms 
            ON 
                me.mould_reference = ms.mould_ref
            WHERE 
                me.docstatus = 1
                {mould_filter}
            ORDER BY 
                me.moulding_date DESC
        """.format(
            mould_filter=f"AND me.mould_reference = '{filters.get('mould_ref')}'" if filters and filters.get('mould_ref') else ""
        ), as_dict=1)

        # Process data for report
        mould_data = {}
        
        for entry in production_entries:
            mould_ref = entry.get('mould_reference')
            if not mould_ref:
                continue

            # Initialize mould data if not exists
            if mould_ref not in mould_data:
                mould_data[mould_ref] = {
                    'mould_ref': mould_ref,
                    'part_no': entry.get('part_no', ''),
                    'historical_lifts': 0,
                    'monthly_lifts': [0] * 12,  # Initialize all months to 0
                    'total_lifts': 0
                }

            lifts = entry.get('number_of_lifts', 0)
            entry_year = entry.get('year')
            entry_month = entry.get('month')

            if entry_year < current_year:
                # Add to historical lifts
                mould_data[mould_ref]['historical_lifts'] += lifts
            elif entry_year == current_year and entry_month:
                # Add to monthly lifts (month is 1-based in SQL)
                mould_data[mould_ref]['monthly_lifts'][entry_month - 1] += lifts

        # Calculate totals and prepare final data
        report_data = []
        for mould in mould_data.values():
            mould['total_lifts'] = (
                mould['historical_lifts'] + 
                sum(mould['monthly_lifts'])
            )
            report_data.append(mould)

        # Sort by total lifts descending
        report_data.sort(key=lambda x: x['total_lifts'], reverse=True)

        return {
            "status": "success",
            "message": "Data fetched successfully",
            "report_data": report_data,
            "current_year": current_year
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