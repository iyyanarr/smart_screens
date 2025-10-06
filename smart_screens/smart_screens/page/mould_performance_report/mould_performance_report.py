import frappe
from frappe import _
import json
from datetime import datetime, timedelta, date
import calendar

@frappe.whitelist()
def get_mould_performance_data(filters=None):
    try:
        # Convert filters string to dict if provided
        if filters and isinstance(filters, str):
            filters = json.loads(filters)

        # Get year from filters or default to current year
        current_year = datetime.now().year
        selected_year = int(filters.get('year', current_year)) if filters else current_year
        # Get year from filters or default to current year
        current_year = datetime.now().year
        selected_year = int(filters.get('year', current_year)) if filters else current_year
        
        # Build months for the selected year (all 12 months)
        months = [{'year': selected_year, 'month': m, 'label': calendar.month_abbr[m]} for m in range(1, 13)]
        
        # Calculate cutoff date for "before selected year" column
        cutoff_date = date(selected_year, 1, 1)

        # Process filters properly
        filter_conditions = ["me.docstatus = 1"]
        filter_values = {}
        
        if filters:
            # Mould reference filter
            if filters.get('mould_ref'):
                filter_conditions.append("me.mould_reference = %(mould_ref)s")
                filter_values['mould_ref'] = filters.get('mould_ref')

        # Build WHERE clause
        where_clause = " AND ".join(filter_conditions)

        # Build pivot query to aggregate total lifts, pre-selected-year and monthly sums
        select_fields = [
            "me.mould_reference AS mould_ref",
            "SUM(me.number_of_lifts) AS total_lifts",
            f"SUM(CASE WHEN me.moulding_date < '{cutoff_date}' THEN me.number_of_lifts ELSE 0 END) AS lifts_before_{selected_year}"
        ]
        
        # Add month columns dynamically for selected year
        for m in months:
            select_fields.append(
                f"SUM(CASE WHEN YEAR(me.moulding_date) = {selected_year} AND MONTH(me.moulding_date) = {m['month']} THEN me.number_of_lifts ELSE 0 END) AS month_{m['month']}"
            )
        
        # Build and execute query with filters
        # Note: Filter out entries with no mould_reference
        query = f"""
            SELECT {', '.join(select_fields)}
            FROM `tabMoulding Production Entry` me
            WHERE {where_clause}
                AND me.mould_reference IS NOT NULL
                AND me.mould_reference != ''
            GROUP BY me.mould_reference
            ORDER BY me.mould_reference
        """
        
        result = frappe.db.sql(query, filter_values, as_dict=1)

        # Get mould specifications for detailed view
        mould_specs = {}
        if result:
            mould_refs = [r['mould_ref'] for r in result if r.get('mould_ref')]
            if mould_refs:
                specs_query = """
                    SELECT 
                        mould_ref AS mould_reference,
                        name as spec_name,
                        part_no,
                        compound_code,
                        mould_status,
                        noof_cavities,
                        no_of_cavity_per_blank,
                        no_of_piece,
                        wtpiece_min_gms,
                        wtpiece_avg_gms,
                        wtpiece_max_gms,
                        wtlift_avg_gms,
                        blank_type,
                        blank_length,
                        blank_width,
                        blank_thickness,
                        shell_weight,
                        spp_ref
                    FROM `tabMould Specification`
                    WHERE mould_ref IN %(mould_refs)s
                    AND docstatus = 1
                    ORDER BY modified DESC
                """
                mould_specs_data = frappe.db.sql(specs_query, {'mould_refs': mould_refs}, as_dict=1)
                # Use only the latest spec for each mould_ref
                for spec in mould_specs_data:
                    if spec['mould_reference'] not in mould_specs:
                        mould_specs[spec['mould_reference']] = spec

        # Get detailed entries for drill-down
        detailed_entries = {}
        service_records = {}
        if result:
            for row in result:
                mould_ref = row.get('mould_ref')
                if not mould_ref:
                    continue
                    
                # Get detailed entries for this mould
                detail_conditions = ["docstatus = 1", "mould_reference = %(mould_ref)s"]
                detail_values = {'mould_ref': mould_ref}
                
                if filters and filters.get('year'):
                    detail_conditions.append("YEAR(moulding_date) = %(year)s")
                    detail_values['year'] = filters['year']
                
                detail_where = " AND ".join(detail_conditions)
                
                entries_query = f"""
                    SELECT 
                        name AS production_entry,
                        moulding_date,
                        compound,
                        employee_name,
                        batch_no,
                        no_of_running_cavities,
                        curing_time,
                        number_of_lifts,
                        weight_without_shell,
                        YEAR(moulding_date) AS year,
                        MONTH(moulding_date) AS month
                    FROM `tabMoulding Production Entry`
                    WHERE {detail_where}
                    ORDER BY moulding_date DESC
                """
                
                entries = frappe.db.sql(entries_query, detail_values, as_dict=1)
                
                # Group by year-month
                for entry in entries:
                    month_key = f"{entry['year']}-{entry['month']}"
                    if mould_ref not in detailed_entries:
                        detailed_entries[mould_ref] = {}
                    if month_key not in detailed_entries[mould_ref]:
                        detailed_entries[mould_ref][month_key] = []
                    detailed_entries[mould_ref][month_key].append(entry)
                
                # Get service records for this mould
                # First, get all Mould Specification names (primary keys) for this mould_ref
                spec_names_query = """
                    SELECT name 
                    FROM `tabMould Specification`
                    WHERE mould_ref = %(mould_ref)s
                """
                spec_names = frappe.db.sql(spec_names_query, {'mould_ref': mould_ref}, as_dict=1)
                
                if spec_names:
                    # Extract the names into a list
                    spec_name_list = [spec['name'] for spec in spec_names]
                    
                    # Query service records using these specification names
                    service_query = """
                        SELECT 
                            name,
                            service_date,
                            service_type,
                            service_details,
                            mould_ref,
                            creation,
                            modified
                        FROM `tabMould Service Record`
                        WHERE mould_ref IN %(spec_names)s
                        ORDER BY service_date DESC, modified DESC
                    """
                    
                    services = frappe.db.sql(service_query, {'spec_names': spec_name_list}, as_dict=1)
                    if services:
                        service_records[mould_ref] = services

        # Attach specifications and detailed entries to result
        for row in result:
            mould_ref = row.get('mould_ref')
            if mould_ref:
                row['specification'] = mould_specs.get(mould_ref, {})
                row['detailed_entries'] = detailed_entries.get(mould_ref, {})
                row['service_records'] = service_records.get(mould_ref, [])
                
                # Calculate monthly lifts array for charts (for selected year)
                row['monthly_lifts'] = [row.get(f'month_{i}', 0) or 0 for i in range(1, 13)]
                row[f'historical_lifts'] = row.get(f'lifts_before_{selected_year}', 0) or 0

        # Return aggregated report data with metadata
        return {
            "status": "success",
            "message": "Aggregated lifts by mould_ref",
            "report_data": result,
            "current_year": current_year,
            "selected_year": selected_year,
            "months": months,
            "filters_applied": {
                "mould_ref": filters.get('mould_ref') if filters else None,
                "year": selected_year
            }
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

@frappe.whitelist()
def get_mould_history_record(mould_ref):
    """
    Get complete mould history including specifications, production entries, and service records
    Format similar to the provided Mould History Record sheet
    """
    try:
        if not mould_ref:
            return {
                "status": "error",
                "message": "Mould Reference is required"
            }
        
        # Get Mould Specification
        mould_spec = frappe.get_doc("Mould Specification", mould_ref)
        
        # Get all production entries for this mould
        production_entries = frappe.db.sql("""
            SELECT 
                name,
                moulding_date,
                number_of_lifts,
                compound,
                employee_name,
                batch_no,
                no_of_running_cavities,
                curing_time,
                weight_without_shell,
                stock_entry_reference,
                YEAR(moulding_date) as year,
                MONTH(moulding_date) as month
            FROM `tabMoulding Production Entry`
            WHERE mould_reference = %(mould_ref)s
                AND docstatus = 1
            ORDER BY moulding_date ASC
        """, {'mould_ref': mould_ref}, as_dict=1)
        
        # Get all service records for this mould
        service_records = frappe.db.sql("""
            SELECT 
                name,
                service_date,
                service_type,
                service_details
            FROM `tabMould Service Record`
            WHERE mould_ref = %(mould_ref)s
            ORDER BY service_date ASC
        """, {'mould_ref': mould_ref}, as_dict=1)
        
        # Calculate cumulative lifts
        cumulative_lifts = 0
        for entry in production_entries:
            cumulative_lifts += entry.get('number_of_lifts', 0) or 0
            entry['cumulative_lifts'] = cumulative_lifts
        
        # Group production entries by year
        entries_by_year = {}
        for entry in production_entries:
            year = entry.get('year')
            if year not in entries_by_year:
                entries_by_year[year] = []
            entries_by_year[year].append(entry)
        
        # Calculate yearly summary
        yearly_summary = {}
        for year, entries in entries_by_year.items():
            total_lifts = sum(e.get('number_of_lifts', 0) or 0 for e in entries)
            yearly_summary[year] = {
                'total_lifts': total_lifts,
                'entry_count': len(entries),
                'months_active': len(set(e.get('month') for e in entries))
            }
        
        return {
            "status": "success",
            "mould_ref": mould_ref,
            "specification": mould_spec.as_dict() if mould_spec else {},
            "production_entries": production_entries,
            "service_records": service_records,
            "entries_by_year": entries_by_year,
            "yearly_summary": yearly_summary,
            "total_lifts": cumulative_lifts,
            "total_entries": len(production_entries),
            "total_service_records": len(service_records)
        }
        
    except frappe.DoesNotExistError:
        return {
            "status": "error",
            "message": f"Mould Specification '{mould_ref}' not found"
        }
    except Exception as e:
        frappe.log_error(
            title=_("Mould History Record Error"),
            message=frappe.get_traceback()
        )
        return {
            "status": "error",
            "message": f"Error fetching mould history: {str(e)}"
        }

@frappe.whitelist()
@frappe.validate_and_sanitize_search_inputs
def get_mould_items(doctype, txt, searchfield, start, page_len, filters):
    """
    Get distinct mould references (Items) that have production entries
    Used for autocomplete in the mould reference filter
    """
    return frappe.db.sql("""
        SELECT DISTINCT me.mould_reference, me.mould_reference
        FROM `tabMoulding Production Entry` me
        WHERE me.docstatus = 1
            AND me.mould_reference IS NOT NULL
            AND me.mould_reference != ''
            AND me.mould_reference LIKE %(txt)s
        ORDER BY me.mould_reference
        LIMIT %(start)s, %(page_len)s
    """, {
        'txt': f"%{txt}%",
        'start': start,
        'page_len': page_len
    })