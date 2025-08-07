import frappe
from frappe import _
from frappe.utils import getdate, flt, add_to_date, get_datetime
import json

@frappe.whitelist()
def debug_aggregation_data(filters=None):
    """
    Debug function to compare our data with batch-wise report data
    """
    if isinstance(filters, str):
        filters = json.loads(filters)
    
    from_date = filters.get("from_date", "1900-01-01")
    to_date = filters.get("to_date", frappe.utils.nowdate())
    
    # Get the same data that batch-wise report would show
    debug_query = """
        SELECT 
            sle.item_code,
            SUBSTRING(sle.item_code, 2, 4) as common_code,
            LEFT(sle.item_code, 1) as prefix,
            sle.batch_no,
            sle.posting_date,
            sle.actual_qty,
            i.item_group,
            i.stock_uom
        FROM `tabStock Ledger Entry` sle
        INNER JOIN `tabItem` i ON sle.item_code = i.name
        WHERE 
            sle.docstatus < 2
            AND sle.is_cancelled = 0
            AND sle.posting_datetime <= %s
            AND sle.item_code LIKE '%%1101%%'
        ORDER BY sle.item_code, sle.posting_date
    """
    
    posting_datetime = get_datetime(add_to_date(to_date, days=1))
    debug_data = frappe.db.sql(debug_query, (posting_datetime,), as_dict=1)
    
    # Group by common code and calculate totals
    totals = {}
    for d in debug_data:
        code = d.common_code
        if code not in totals:
            totals[code] = {"total_qty": 0, "count": 0, "items": []}
        
        totals[code]["total_qty"] += d.actual_qty or 0
        totals[code]["count"] += 1
        totals[code]["items"].append(d.item_code)
    
    return {
        "debug_data": debug_data[:50],  # First 50 records
        "totals": totals,
        "query_used": debug_query
    }

@frappe.whitelist()
def validate_aggregation_accuracy(filters=None):
    """
    Validation function to compare aggregated stock data with ERPNext batch-wise logic
    """
    if isinstance(filters, str):
        filters = json.loads(filters)
    
    # Get SLE data for comparison using same logic as batch report
    sle_query = """
        SELECT 
            sle.item_code,
            sle.posting_date,
            SUM(sle.actual_qty) as actual_qty,
            SUBSTRING(sle.item_code, 2, 4) as common_code,
            LEFT(sle.item_code, 1) as prefix
        FROM `tabStock Ledger Entry` sle
        INNER JOIN `tabItem` i ON sle.item_code = i.name
        WHERE 
            sle.docstatus < 2
            AND sle.is_cancelled = 0
            AND (sle.item_code LIKE 'P%' OR sle.item_code LIKE 'F%' OR sle.item_code LIKE 'T%')
            AND i.item_group IN ('Mat', 'Products', 'Finished Product', 'Finished Products')
        GROUP BY sle.voucher_no, sle.item_code, sle.posting_date
        ORDER BY sle.item_code, sle.posting_date
    """
    
    sle_data = frappe.db.sql(sle_query, as_dict=1)
    return {"sle_count": len(sle_data), "message": "Validation using Stock Ledger Entries only"}

@frappe.whitelist()
def get_aggregated_stock_data(filters=None):
    """
    Get aggregated stock movement data grouped by item prefix and common code
    - P items = Products
    - F items = Finished Product  
    - T items = Mat
    Same item code (e.g., 1101) in different stages (P1101, F1101, T1101)
    """
    if isinstance(filters, str):
        filters = json.loads(filters)
    
    # Default filters
    if not filters:
        filters = {}
    
    from_date = filters.get("from_date")
    to_date = filters.get("to_date")
    warehouse = filters.get("warehouse")
    warehouse_type = filters.get("warehouse_type")
    
    # Set default dates if not provided
    if not from_date:
        from_date = "1900-01-01"
    if not to_date:
        to_date = frappe.utils.nowdate()

    # Step 1: Get all stock ledger entries using simple, direct approach
    posting_datetime = get_datetime(add_to_date(to_date, days=1))
    
    # Build warehouse condition
    warehouse_condition = ""
    warehouse_params = []
    
    if warehouse:
        warehouse_condition = "AND sle.warehouse = %s"
        warehouse_params.append(warehouse)
    elif warehouse_type:
        # Get all warehouses of this type
        warehouses = frappe.get_all(
            "Warehouse",
            filters={"warehouse_type": warehouse_type, "is_group": 0},
            pluck="name"
        )
        if warehouses:
            warehouse_placeholders = ', '.join(['%s'] * len(warehouses))
            warehouse_condition = f"AND sle.warehouse IN ({warehouse_placeholders})"
            warehouse_params.extend(warehouses)
    
    # Simplified query - no GROUP BY to avoid double counting
    sle_query = """
        SELECT 
            sle.item_code,
            sle.warehouse,
            sle.batch_no,
            sle.posting_date,
            sle.actual_qty,
            SUBSTRING(sle.item_code, 2, 4) as common_code,
            LEFT(sle.item_code, 1) as prefix,
            i.stock_uom,
            i.item_group,
            sle.voucher_type,
            sle.voucher_no
        FROM `tabStock Ledger Entry` sle
        INNER JOIN `tabItem` i ON sle.item_code = i.name
        WHERE 
            sle.docstatus < 2
            AND sle.is_cancelled = 0
            AND sle.posting_datetime < %s
            AND (sle.item_code LIKE 'P%%' OR sle.item_code LIKE 'F%%' OR sle.item_code LIKE 'T%%' OR i.item_group IN ('Products', 'Finished Product', 'Mat'))
            AND sle.item_code NOT LIKE 't.%%'
            AND i.disabled = 0
            {warehouse_condition}
        ORDER BY sle.item_code, sle.posting_date, sle.posting_time
    """.format(warehouse_condition=warehouse_condition)
    
    # Prepare query parameters
    query_params = [posting_datetime] + warehouse_params
    sle_data = frappe.db.sql(sle_query, query_params, as_dict=1)
    
    # Step 2: Get Mat conversion factors
    conversion_factors = get_mat_kg_to_nos_conversion_factors()
    
    # Step 3: Process data using simplified aggregation logic
    from_date_obj = getdate(from_date)
    to_date_obj = getdate(to_date)
    
    # Create item-warehouse-batch map for proper calculation
    iwb_map = {}
    
    for d in sle_data:
        if not d.common_code:
            continue
            
        # Create unique key for item-warehouse-batch combination
        key = f"{d.item_code}#{d.warehouse}#{d.batch_no or 'NO_BATCH'}"
        
        if key not in iwb_map:
            iwb_map[key] = frappe._dict({
                "item_code": d.item_code,
                "warehouse": d.warehouse,
                "batch_no": d.batch_no,
                "opening_qty": 0.0, 
                "in_qty": 0.0, 
                "out_qty": 0.0, 
                "bal_qty": 0.0,
                "common_code": d.common_code,
                "prefix": d.prefix,
                "stock_uom": d.stock_uom,
                "item_group": d.item_group
            })
        
        qty_dict = iwb_map[key]
        posting_date = getdate(d.posting_date)
        actual_qty = flt(d.actual_qty)
        
        # Date-based calculation
        if posting_date < from_date_obj:
            qty_dict.opening_qty += actual_qty
        elif posting_date >= from_date_obj and posting_date <= to_date_obj:
            if actual_qty > 0:
                qty_dict.in_qty += actual_qty
            else:
                qty_dict.out_qty += abs(actual_qty)
        
        # Balance quantity is cumulative
        qty_dict.bal_qty += actual_qty
    
    # Step 4: Aggregate by common code and prefix
    aggregated_data = {}
    grand_total = {
        "Finished Product": {"opening_qty": 0, "incoming_qty": 0, "outgoing_qty": 0, "closing_qty": 0},
        "Mat": {"opening_qty": 0, "incoming_qty": 0, "outgoing_qty": 0, "closing_qty": 0},
        "Products": {"opening_qty": 0, "incoming_qty": 0, "outgoing_qty": 0, "closing_qty": 0},
        "opening_qty": 0, "incoming_qty": 0, "outgoing_qty": 0, "closing_qty": 0
    }
    
    # Conversion tracking
    conversion_applied = 0
    conversion_skipped = 0
    conversion_details = []
    
    for key, qty_dict in iwb_map.items():
        if not qty_dict.common_code or not qty_dict.prefix:
            continue
            
        common_code = qty_dict.common_code
        prefix = qty_dict.prefix
        item_group = qty_dict.item_group
        
        # Map item group to report categories
        # Use actual item_group field first, fallback to prefix mapping
        if item_group == "Products":
            group = "Products"
        elif item_group == "Finished Product" or item_group == "Finished Products":
            group = "Finished Product"
        elif item_group == "Mat":
            group = "Mat"
        else:
            # Fallback to prefix mapping for items without proper item_group
            prefix_map = {"P": "Products", "F": "Finished Product", "T": "Mat"}
            group = prefix_map.get(prefix, "Other")
        
        if group == "Other":
            continue
        
        # Create aggregated data structure if it doesn't exist
        if common_code not in aggregated_data:
            aggregated_data[common_code] = {
                "common_code": common_code,
                "Products": {"opening_qty": 0, "incoming_qty": 0, "outgoing_qty": 0, "closing_qty": 0},
                "Finished Product": {"opening_qty": 0, "incoming_qty": 0, "outgoing_qty": 0, "closing_qty": 0},
                "Mat": {"opening_qty": 0, "incoming_qty": 0, "outgoing_qty": 0, "closing_qty": 0},
                "total": {"opening_qty": 0, "incoming_qty": 0, "outgoing_qty": 0, "closing_qty": 0}
            }
        
        # Get base quantities
        opening_qty = qty_dict.opening_qty
        incoming_qty = qty_dict.in_qty
        outgoing_qty = qty_dict.out_qty
        closing_qty = qty_dict.bal_qty
        
        # For Mat items (T prefix), convert from Kg to Nos using batch-specific conversion
        # NOTE: F and P items are already in Nos by default, only T items need conversion
        conversion_info = None
        if group == "Mat" and qty_dict.batch_no and qty_dict.batch_no != "NO_BATCH":
            batch_no = qty_dict.batch_no
            if batch_no in conversion_factors:
                conversion_factor = conversion_factors[batch_no]['conversion_factor']
                source = conversion_factors[batch_no].get('source', 'Unknown')
                
                if conversion_factor > 0:
                    # Apply conversion from Kg to Nos
                    opening_qty = opening_qty * conversion_factor
                    incoming_qty = incoming_qty * conversion_factor
                    outgoing_qty = outgoing_qty * conversion_factor
                    closing_qty = closing_qty * conversion_factor
                    conversion_applied += 1
                    
                    conversion_info = {
                        "batch": batch_no,
                        "factor": conversion_factor,
                        "source": source,
                        "blank_wt": conversion_factors[batch_no].get('blank_wt_gms', 0)
                    }
                    conversion_details.append(conversion_info)
                else:
                    conversion_skipped += 1
            else:
                conversion_skipped += 1
                # Mat items without conversion factors remain in Kg
        
        # Add quantities to respective group
        aggregated_data[common_code][group]["opening_qty"] += opening_qty
        aggregated_data[common_code][group]["incoming_qty"] += incoming_qty
        aggregated_data[common_code][group]["outgoing_qty"] += outgoing_qty
        aggregated_data[common_code][group]["closing_qty"] += closing_qty
        
        # Update totals for this common_code
        aggregated_data[common_code]["total"]["opening_qty"] += opening_qty
        aggregated_data[common_code]["total"]["incoming_qty"] += incoming_qty
        aggregated_data[common_code]["total"]["outgoing_qty"] += outgoing_qty
        aggregated_data[common_code]["total"]["closing_qty"] += closing_qty
        
        # Update grand totals
        grand_total[group]["opening_qty"] += opening_qty
        grand_total[group]["incoming_qty"] += incoming_qty
        grand_total[group]["outgoing_qty"] += outgoing_qty
        grand_total[group]["closing_qty"] += closing_qty
        
        grand_total["opening_qty"] += opening_qty
        grand_total["incoming_qty"] += incoming_qty
        grand_total["outgoing_qty"] += outgoing_qty
        grand_total["closing_qty"] += closing_qty
    
    # Convert to list for frontend
    result = []
    for code, data in aggregated_data.items():
        result.append(data)
    
    # Calculate conversion statistics
    has_converted_mat_items = conversion_applied > 0
    
    # Analyze conversion sources
    conversion_sources = {}
    for detail in conversion_details:
        source = detail.get('source', 'Unknown')
        if source not in conversion_sources:
            conversion_sources[source] = 0
        conversion_sources[source] += 1
    
    return {
        "data": result,
        "grand_total": grand_total,
        "mat_uom": "Mixed (Nos for converted batches, Kg for unconverted)" if conversion_applied > 0 and conversion_skipped > 0 else ("Nos" if conversion_applied > 0 else "Kg"),
        "has_converted_mat_items": has_converted_mat_items,
        "conversion_factors_count": len(conversion_factors),
        "conversion_applied": conversion_applied,
        "conversion_skipped": conversion_skipped,
        "conversion_sources": conversion_sources,
        "warehouse_filter": warehouse or warehouse_type or "All Warehouses",
        "conversion_status": f"Mat: {conversion_applied} batches converted to Nos, {conversion_skipped} remain in Kg. Coverage is higher for 2025 production data. F/P items: Already in Nos" if conversion_applied > 0 or conversion_skipped > 0 else "No Mat items found",
        "sle_records_processed": len(sle_data),
        "iwb_combinations": len(iwb_map),
        "note": "F and P items are naturally in Nos. Only T (Mat) items need Kg-to-Nos conversion using Production Batch Weight data."
    }

def get_mat_kg_to_nos_conversion_factors():
    """
    Get conversion factors for Mat items using Production Batch Weight doctype.
    This doctype contains pre-calculated blank weights based on production traceability:
    Batch -> Stock Entry -> Moulding Production Entry -> Mould Specification
    
    For historical batches without Production Batch Weight data, use average conversion
    factors by item code calculated from available Production Batch Weight data.
    
    Formula: (Kg Weight * 1000) / avg_blank_wt_gms = Number of pieces
    """
    conversion_data = {}
    
    try:
        # First get exact batch matches from Production Batch Weight doctype
        query = """
            SELECT 
                batch_no,
                blank_wt,
                scan_lot_no,
                mould_reference,
                item_code,
                spp_ref,
                production_entry
            FROM `tabProduction Batch Weight`
            WHERE blank_wt IS NOT NULL 
                AND blank_wt > 0
                AND batch_no IS NOT NULL
                AND batch_no != ''
            ORDER BY creation DESC
        """
        
        data = frappe.db.sql(query, as_dict=1)
        
        frappe.log_error(f"Found {len(data)} Production Batch Weight records for conversion", "Aggregated Stock Movement")
        
        # Store exact batch matches
        for row in data:
            batch_no = row.batch_no
            blank_wt_gms = row.blank_wt
            
            if batch_no and blank_wt_gms > 0:
                # Formula: (Batch Wt. in Kgs * 1000) / avg_blank_wt_gms = Number of pieces
                conversion_factor = 1000.0 / blank_wt_gms
                
                conversion_data[batch_no] = {
                    'conversion_factor': conversion_factor,
                    'scan_lot_no': row.scan_lot_no,
                    'mould_reference': row.mould_reference,
                    'item_code': row.item_code,
                    'spp_ref': row.spp_ref,
                    'blank_wt_gms': blank_wt_gms,
                    'production_entry': row.production_entry,
                    'source': 'Production Batch Weight'
                }
        
        # Calculate average conversion factors by item code for fallback
        item_averages = {}
        item_code_query = """
            SELECT 
                item_code,
                AVG(blank_wt) as avg_blank_wt,
                COUNT(*) as sample_count,
                MIN(blank_wt) as min_blank_wt,
                MAX(blank_wt) as max_blank_wt
            FROM `tabProduction Batch Weight`
            WHERE blank_wt IS NOT NULL 
                AND blank_wt > 0
                AND item_code IS NOT NULL
                AND item_code != ''
            GROUP BY item_code
            HAVING COUNT(*) >= 3  -- Only use items with at least 3 samples
        """
        
        avg_data = frappe.db.sql(item_code_query, as_dict=1)
        
        for row in avg_data:
            item_code = row.item_code
            avg_blank_wt = row.avg_blank_wt
            
            if item_code and avg_blank_wt > 0:
                avg_conversion_factor = 1000.0 / avg_blank_wt
                item_averages[item_code] = {
                    'avg_conversion_factor': avg_conversion_factor,
                    'avg_blank_wt': avg_blank_wt,
                    'sample_count': row.sample_count,
                    'min_blank_wt': row.min_blank_wt,
                    'max_blank_wt': row.max_blank_wt,
                    'source': 'Item Average Fallback'
                }
        
        frappe.log_error(f"Calculated {len(item_averages)} item average conversion factors", "Aggregated Stock Movement")
        
        # Now get all T item batches from SLE that don't have exact batch matches
        # and try to apply item average conversion factors
        missing_batches_query = """
            SELECT DISTINCT 
                sle.batch_no,
                sle.item_code,
                SUM(sle.actual_qty) as total_qty
            FROM `tabStock Ledger Entry` sle
            WHERE sle.item_code LIKE 'T%%'
                AND sle.item_code NOT LIKE 't.%%'
                AND sle.batch_no IS NOT NULL
                AND sle.batch_no != ''
                AND sle.docstatus < 2
                AND sle.is_cancelled = 0
                AND ABS(sle.actual_qty) > 0.001
                AND sle.batch_no NOT IN (
                    SELECT DISTINCT batch_no 
                    FROM `tabProduction Batch Weight` 
                    WHERE batch_no IS NOT NULL AND batch_no != ''
                )
            GROUP BY sle.batch_no, sle.item_code
            HAVING ABS(SUM(sle.actual_qty)) > 0.001
        """
        
        missing_batches = frappe.db.sql(missing_batches_query, as_dict=1)
        
        # Apply item average conversion factors to missing batches
        fallback_applied = 0
        for batch_data in missing_batches:
            batch_no = batch_data.batch_no
            item_code = batch_data.item_code
            
            if item_code in item_averages and batch_no not in conversion_data:
                avg_data = item_averages[item_code]
                
                conversion_data[batch_no] = {
                    'conversion_factor': avg_data['avg_conversion_factor'],
                    'scan_lot_no': None,
                    'mould_reference': None,
                    'item_code': item_code,
                    'spp_ref': item_code[1:5] if len(item_code) >= 5 else "",
                    'blank_wt_gms': avg_data['avg_blank_wt'],
                    'production_entry': None,
                    'source': f"Item Average ({avg_data['sample_count']} samples)",
                    'sample_count': avg_data['sample_count'],
                    'min_blank_wt': avg_data['min_blank_wt'],
                    'max_blank_wt': avg_data['max_blank_wt']
                }
                fallback_applied += 1
        
        frappe.log_error(f"Applied fallback conversion to {fallback_applied} additional batches", "Aggregated Stock Movement")
        
        # If still no data found, fall back to direct query with correct T item batch logic
        # But use the CORRECT logic: get T item batch from Stock Entry Detail
        if not conversion_data:
            frappe.log_error("No Production Batch Weight data found, using fallback query", "Aggregated Stock Movement")
            
            # Get submitted Moulding Production Entries and extract T item batches
            fallback_query = """
                SELECT 
                    mpe.name as production_entry,
                    mpe.scan_lot_number,
                    mpe.mould_reference,
                    mpe.stock_entry_reference,
                    ms.avg_blank_wtproduct_gms,
                    ms.spp_ref
                FROM `tabMoulding Production Entry` mpe
                LEFT JOIN `tabMould Specification` ms ON mpe.mould_reference = ms.mould_ref
                WHERE mpe.docstatus = 1
                    AND mpe.stock_entry_reference IS NOT NULL 
                    AND mpe.mould_reference IS NOT NULL 
                    AND mpe.mould_reference != ''
                    AND ms.avg_blank_wtproduct_gms IS NOT NULL
                    AND ms.avg_blank_wtproduct_gms != ''
                    AND ms.avg_blank_wtproduct_gms != '0'
                    AND mpe.creation >= '2025-01-01 00:00:00'
                ORDER BY mpe.creation DESC
                LIMIT 1000
            """
            
            fallback_data = frappe.db.sql(fallback_query, as_dict=1)
            
            for row in fallback_data:
                try:
                    # Get T item batch from Stock Entry Detail (CORRECT logic)
                    t_item_data = frappe.db.sql("""
                        SELECT sed.item_code, sed.batch_no, sed.qty, i.item_group
                        FROM `tabStock Entry Detail` sed
                        INNER JOIN `tabItem` i ON sed.item_code = i.name
                        WHERE sed.parent = %s 
                            AND (sed.item_code LIKE 'T%%' OR i.item_group = 'Mat')
                        ORDER BY sed.idx
                        LIMIT 1
                    """, (row.stock_entry_reference,), as_dict=True)
                    
                    if t_item_data:
                        t_item = t_item_data[0]
                        t_batch_no = t_item.batch_no
                        t_item_code = t_item.item_code
                        
                        # Validate blank weight
                        blank_wt_float = float(row.avg_blank_wtproduct_gms)
                        if blank_wt_float > 0 and t_batch_no:
                            conversion_factor = 1000.0 / blank_wt_float
                            
                            conversion_data[t_batch_no] = {
                                'conversion_factor': conversion_factor,
                                'scan_lot_number': row.scan_lot_number,
                                'mould_reference': row.mould_reference,
                                'item_code': t_item_code,  # T item code or Mat item
                                'blank_wt_gms': blank_wt_float,
                                'spp_ref': row.spp_ref,
                                'production_entry': row.production_entry,
                                'source': 'Direct Query (Mat item batch)'
                            }
                            
                except (ValueError, TypeError, AttributeError) as e:
                    # Skip invalid entries
                    frappe.log_error(f"Error processing fallback entry {row.get('production_entry', 'Unknown')}: {str(e)}", "Aggregated Stock Movement")
                    continue
    
    except Exception as e:
        frappe.log_error(f"Error in get_mat_kg_to_nos_conversion_factors: {str(e)}")
        return {}
    
    return conversion_data