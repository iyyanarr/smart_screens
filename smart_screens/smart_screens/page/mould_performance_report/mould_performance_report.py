import frappe
from frappe import _
import json
from datetime import datetime, timedelta
import calendar

@frappe.whitelist()
def get_mould_performance_data(filters=None):
    try:
        # Convert filters string to dict if provided
        if filters and isinstance(filters, str):
            filters = json.loads(filters)

        current_year = datetime.now().year
        
        # Process date range filter
        filter_conditions = "me.docstatus = 1"
        filter_values = {}
        
        if filters:
            # Mould reference filter
            if filters.get('mould_ref'):
                filter_conditions += " AND me.mould_reference = %(mould_ref)s"
                filter_values['mould_ref'] = filters.get('mould_ref')
            
            # Date range filter
            if filters.get('date_range') and isinstance(filters.get('date_range'), list) and len(filters.get('date_range')) == 2:
                start_date, end_date = filters.get('date_range')
                if start_date:
                    filter_conditions += " AND me.moulding_date >= %(start_date)s"
                    filter_values['start_date'] = start_date
                if end_date:
                    filter_conditions += " AND me.moulding_date <= %(end_date)s"
                    filter_values['end_date'] = end_date

        # Get production entries
        production_entries = frappe.db.sql("""
            SELECT 
                me.mould_reference,
                me.name as production_entry,
                ms.part_no,
                me.number_of_lifts,
                me.moulding_date,
                YEAR(me.moulding_date) as year,
                MONTH(me.moulding_date) as month,
                me.compound,
                me.employee_name,
                me.batch_no,
                me.no_of_running_cavities,
                me.curing_time,
                me.weight_without_shell
            FROM 
                `tabMoulding Production Entry` me
            LEFT JOIN 
                `tabMould Specification` ms 
            ON 
                me.mould_reference = ms.mould_ref
            WHERE 
                {conditions}
            ORDER BY 
                me.moulding_date DESC
        """.format(conditions=filter_conditions), filter_values, as_dict=1)

        # Get mould specifications for detailed view
        mould_refs = list(set([entry.get('mould_reference') for entry in production_entries if entry.get('mould_reference')]))
        
        mould_specs = {}
        if mould_refs:
            specs = frappe.get_all(
                "Mould Specification",
                filters={"mould_ref": ["in", mould_refs]},
                fields=[
                    "mould_ref", "compound_code", "part_no", 
                    "wtpiece_max_gms", "wtpiece_min_gms", "wtpiece_avg_gms",
                    "noof_cavities", "no_of_cavity_per_blank", "blank_type",
                    "blank_length", "blank_width", "blank_thickness",
                    "avg_blank_wtproduct_gms", "wtlift_avg_gms", "mould_status"
                ]
            )
            mould_specs = {spec.mould_ref: spec for spec in specs}

        # Process data for report
        mould_data = {}
        detailed_entries = {}
        
        for entry in production_entries:
            mould_ref = entry.get('mould_reference')
            if not mould_ref:
                continue

            # Initialize detailed entries dictionary if not exists
            if mould_ref not in detailed_entries:
                detailed_entries[mould_ref] = {}
            
            # Store monthly entries for detailed view
            entry_year = entry.get('year')
            entry_month = entry.get('month')
            month_key = f"{entry_year}-{entry_month}"
            
            if month_key not in detailed_entries[mould_ref]:
                detailed_entries[mould_ref][month_key] = []
            
            detailed_entries[mould_ref][month_key].append(entry)

            # Initialize mould data if not exists
            if mould_ref not in mould_data:
                mould_data[mould_ref] = {
                    'mould_ref': mould_ref,
                    'part_no': entry.get('part_no', ''),
                    'historical_lifts': 0,
                    'monthly_lifts': [0] * 12,  # Initialize all months to 0
                    'total_lifts': 0
                }

            lifts = entry.get('number_of_lifts', 0) or 0
            
            if entry_year < current_year:
                # Add to historical lifts
                mould_data[mould_ref]['historical_lifts'] += lifts
            elif entry_year == current_year and entry_month:
                # Add to monthly lifts (month is 1-based in SQL)
                mould_data[mould_ref]['monthly_lifts'][entry_month - 1] += lifts

        # Calculate totals and prepare final data
        report_data = []
        for mould_ref, mould in mould_data.items():
            mould['total_lifts'] = (
                mould['historical_lifts'] + 
                sum(mould['monthly_lifts'])
            )
            # Add mould specification data
            mould['specification'] = mould_specs.get(mould_ref, {})
            # Add detailed entries
            mould['detailed_entries'] = detailed_entries.get(mould_ref, {})
            
            report_data.append(mould)

        # Sort by total lifts descending
        report_data.sort(key=lambda x: x['total_lifts'], reverse=True)

        return {
            "status": "success",
            "message": "Data fetched successfully",
            "report_data": report_data,
            "current_year": current_year,
            "mould_specs": mould_specs
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