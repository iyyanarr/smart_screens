"""
OEE Report Generator Backend API
Main API endpoints for the OEE Report Generator page
"""

import frappe
from frappe import _
from frappe.utils import flt, formatdate, today, getdate
from smart_screens.smart_screens.api.oee.oee_calculator import OEECalculator
from smart_screens.smart_screens.api.oee.adapters.moulding_adapter import MouldingAdapter
from smart_screens.smart_screens.api.oee.lot_linking_helper import get_linked_lot_info, aggregate_production_data, aggregate_quality_data

# Process adapter registry
PROCESS_ADAPTERS = {
    'Moulding': MouldingAdapter,
    # Future processes can be added here:
    # 'Blanking': BlankingAdapter,
    # 'Batching': BatchingAdapter,
}

# Map process type to underlying production entry DocType for resolution fields
PRODUCTION_ENTRY_DOCTYPE = {
    'Moulding': 'Moulding Production Entry',
}

@frappe.whitelist()
def get_oee_data(production_date=None, process_type='Moulding', shift_filter=None, 
                 machine_filter=None, lot_filter=None, item_filter=None):
    """
    Main API to get OEE data for any manufacturing process
    
    Args:
        production_date: Production date (YYYY-MM-DD) - defaults to today
        process_type: Process name (Moulding, Blanking, etc.)
        shift_filter: Shift filter (A, B, C, all)
        machine_filter: Machine/Equipment filter
        lot_filter: Lot number filter
        item_filter: Item code filter
    
    Returns:
        list: OEE data with all calculations
    """
    
    # Default to today if no date provided
    if not production_date:
        production_date = today()
    
    # Get the appropriate process adapter
    adapter_class = PROCESS_ADAPTERS.get(process_type)
    if not adapter_class:
        frappe.throw(_("Process type '{0}' is not supported").format(process_type))
    
    adapter = adapter_class()
    calculator = OEECalculator()
    
    # Build filters
    filters = {
        'shift': shift_filter,
        'machine': machine_filter,
        'lot': lot_filter,
        'item': item_filter
    }
    
    # Get production data for the single date
    production_data = adapter.get_production_data(production_date, production_date, filters)
    
    # Calculate OEE for each production entry
    oee_results = []
    processed_linked_groups = set()  # Track already processed linked lot groups
    
    for entry in production_data:
        try:
            # Check if this lot is part of a linked lot group (auto-detect)
            linked_info = get_linked_lot_info(
                entry.get('lot_number'), 
                entry.get('production_date'), 
                entry.get('shift_type'), 
                entry.get('machine_name')
            )
            is_linked = linked_info.get('is_linked', False)
            linked_lots = linked_info.get('linked_lots', [])
            
            # FIX: Skip this entry if it's part of a linked group we've already processed
            if is_linked and len(linked_lots) > 1:
                # Create a unique key for this linked group (sorted lot numbers)
                group_key = '|'.join(sorted(linked_lots))
                
                if group_key in processed_linked_groups:
                    # Already processed this linked group, skip this entry
                    continue
                
                # Mark this group as processed
                processed_linked_groups.add(group_key)
            
            # If linked, use AGGREGATED data for calculations
            if is_linked and len(linked_lots) > 1:
                # Get aggregated production data
                prod_agg = aggregate_production_data(linked_lots)
                
                # Get aggregated quality data
                quality_agg = aggregate_quality_data(linked_lots)
                
                # Use aggregated values for OEE calculation
                # FIX: Use total_lifts (number of lifts), NOT weight!
                actual_qty = prod_agg.get('total_lifts', 0)  # Number of lifts (39 + 41 = 80)
                target_qty = prod_agg.get('total_target_qty', 0)  # Target lifts from Work Plan
                number_of_products = prod_agg.get('total_number_of_products', 0)  # Sum of NoP (lifts × cavities)
                downtime = prod_agg.get('avg_downtime', 0)
                
                # Quality data from aggregated inspection entries
                quality_data = {
                    'has_inspection': quality_agg.get('has_inspection', False),
                    'total_pieces': quality_agg.get('total_pieces', 0),
                    'good_pieces': quality_agg.get('good_pieces', 0),
                    'rejected_pieces': quality_agg.get('rejected_pieces', 0),
                    'rejection_percentage': quality_agg.get('rejection_percentage', 0.0)
                }
            else:
                # Single lot - use adapter methods normally
                actual_qty = adapter.get_actual_quantity(entry)
                target_qty = adapter.get_target_quantity(entry)
                number_of_products = entry.get('number_of_products', 0)
                downtime = adapter.get_downtime(entry)
                quality_data = adapter.get_quality_data(entry)
            
            # Extract basic info (same for both linked and single lots)
            planned_time = adapter.get_planned_time(entry)
            cycle_time = adapter.calculate_cycle_time(entry)
            
            # Calculate available time
            available_time = planned_time - downtime
            
            # Calculate OEE components
            availability = calculator.calculate_availability(planned_time, downtime)
            performance = calculator.calculate_performance(cycle_time, actual_qty, available_time)
            
            # Calculate quality using ONLY Method 2: Quality = (100 - Rejection %)
            # Only use quality data if Lot Inspection is submitted (docstatus=1)
            if quality_data['has_inspection'] and quality_data['rejection_percentage'] >= 0:
                # Use rejection percentage from Lot Inspection Entry
                quality = calculator.calculate_quality_from_rejection(
                    quality_data['rejection_percentage']
                )
            else:
                # No submitted Lot Inspection found - Quality = 0%
                quality = 0.0
            
            # Calculate overall OEE
            oee = calculator.calculate_oee(availability, performance, quality)
            
            # Build result dictionary
            result = {
                'name': entry.get('name'),
                'production_date': str(adapter.get_production_date(entry)),
                'production_date_formatted': frappe.utils.formatdate(adapter.get_production_date(entry), 'dd-MM-yyyy'),
                'shift_type': adapter.get_shift_type(entry),
                'operator_name': entry.get('operator_name', ''),
                'machine_reference': adapter.get_machine_reference(entry),
                'machine_name': entry.get('machine_name', 'N/A'),
                'item_code': adapter.get_item_code(entry),
                'lot_number': adapter.get_lot_number(entry),
                'work_plan_no': entry.get('work_plan_no', ''),
                
                # Production metrics
                'target_quantity': flt(target_qty, 2),
                'actual_quantity': flt(actual_qty, 2),
                'variance_qty': flt(actual_qty - target_qty, 2),
                
                # FIX: Use aggregated number_of_products for linked lots
                'number_of_products': number_of_products,
                
                # OEE Percentages
                'oee_pct': flt(oee, 2),
                'availability_pct': flt(availability * 100, 2),
                'performance_pct': flt(performance * 100, 2),
                'quality_pct': flt(quality * 100, 2),
                
                # OEE Breakdown
                'planned_time_minutes': flt(planned_time, 2),
                'downtime_minutes': flt(downtime, 2),
                'available_time_minutes': flt(available_time, 2),
                'cycle_time_seconds': flt(cycle_time, 2),
                'no_of_cavities': int(entry.get('no_of_running_cavities', 0)),
                
                # Quality Data - directly from adapter (already correct)
                'total_inspected': quality_data['total_pieces'],
                'good_pieces': quality_data['good_pieces'],
                'rejected_pieces': quality_data['rejected_pieces'],
                'rejection_percentage': flt(quality_data['rejection_percentage'], 2),
                
                # Status badges
                'has_target': target_qty > 0,
                'has_production': actual_qty > 0,
                'has_quality_data': quality_data['has_inspection'],
                
                # Raw values for calculations
                '_availability': availability,
                '_performance': performance,
                '_quality': quality,
            }
            
            # Include resolution fields if present (use correct DocType per process)
            production_entry_name = entry.get('name')
            if production_entry_name:
                try:
                    doctype = PRODUCTION_ENTRY_DOCTYPE.get(process_type)
                    if doctype:
                        production_entry_doc = frappe.get_doc(doctype, production_entry_name)
                        result.update({
                            'reason_code': production_entry_doc.get('reason_code'),
                            'problem_description': production_entry_doc.get('problem_description'),
                            'root_cause': production_entry_doc.get('root_cause'),
                            'corrective_action': production_entry_doc.get('corrective_action'),
                            'responsible_person': production_entry_doc.get('responsible_person'),
                            'target_completion_date': production_entry_doc.get('target_completion_date'),
                            'resolution_remarks': production_entry_doc.get('resolution_remarks'),
                            'resolution_status': production_entry_doc.get('resolution_status'),
                            'resolved_by': production_entry_doc.get('resolved_by'),
                            'resolved_on': production_entry_doc.get('resolved_on'),
                        })
                except Exception:
                    # Don't fail the entire row if resolution fields can't be fetched
                    pass
            
            # Add lot inspection status to result
            # quality_data['has_inspection'] already indicates if Lot Inspection is submitted
            if quality_data['has_inspection']:
                result['lot_inspection_status'] = 'Submitted'
                result['lot_inspection_name'] = quality_data.get('inspection_entry')
                result['has_lot_inspection'] = True
                result['lot_inspection_submitted'] = True
            else:
                result['lot_inspection_status'] = 'Not Found'
                result['lot_inspection_name'] = None
                result['has_lot_inspection'] = False
                result['lot_inspection_submitted'] = False
            
            # Add linked lot fields
            result['is_linked_lot'] = is_linked
            result['linked_lots'] = ', '.join(linked_info.get('linked_lots', [])) if is_linked else ''
            result['linked_lot_count'] = len(linked_info.get('linked_lots', [])) if is_linked else 0

            oee_results.append(result)
            
        except Exception as e:
            frappe.log_error(f"Error calculating OEE for entry: {str(e)}", "OEE Calculation Error")
            continue
    
    # MOVED: Create/Update OEE Lot Linking records AFTER OEE calculation is complete
    # This way it doesn't block the main OEE report generation
    # DISABLED: Automatic OEE Lot Linking creation
    # Uncomment the lines below to re-enable automatic creation
    # try:
    #     create_oee_lot_linking_records(production_data, production_date, shift_filter)
    # except Exception as e:
    #     # Log error but don't fail the entire process
    #     frappe.log_error(
    #         f"Error creating OEE Lot Linking records (non-blocking): {frappe.get_traceback()}",
    #         "OEE Lot Linking Creation Error"
    #     )
    
    return oee_results


def create_oee_lot_linking_records(production_data, production_date, shift_filter):
    """
    Create or update OEE Lot Linking records for all linked lot groups.
    This is called when generating OEE report to allow users to exclude trial lots.
    
    Args:
        production_data: List of production entries from adapter
        production_date: Production date
        shift_filter: Shift filter (for grouping)
    """
    try:
        # Track processed linked groups to avoid duplicates
        processed_groups = set()
        created_count = 0
        skipped_count = 0
        
        for entry in production_data:
            lot_number = entry.get('lot_number')
            if not lot_number:
                continue
            
            shift_type = entry.get('shift_type')
            
            # FIX: Get machine from correct field (machine_name or press_machine)
            machine = entry.get('machine_name') or entry.get('machine_name') or entry.get('workstation')
            
            # FIX: Get item_code from correct field
            item_code = entry.get('item_code') or entry.get('item_to_produce')
            
            # FIX: Get operator name
            operator = entry.get('operator_name') or entry.get('scan_operator')
            
            # Validate required fields before proceeding
            if not machine or not item_code:
                frappe.logger().warning(
                    f"Skipping OEE Lot Linking for lot {lot_number} - missing machine or item_code"
                )
                continue
            
            # Use the SAME linked lot detection logic as the main OEE calculation
            linked_info = get_linked_lot_info(
                lot_number,
                entry.get('production_date'),
                shift_type,
                machine
            )
            
            is_linked = linked_info.get('is_linked', False)
            linked_lots = linked_info.get('linked_lots', [])
            
            # Only process linked lot groups (multiple lots)
            if not is_linked or len(linked_lots) <= 1:
                continue
            
            # Create a unique key for this linked group (sorted lot numbers)
            group_key = '|'.join(sorted(linked_lots))
            
            # Skip if we've already processed this group in this run
            if group_key in processed_groups:
                continue
            
            processed_groups.add(group_key)
            
            # Use the first lot as the main lot number
            main_lot_number = linked_lots[0]
            
            # FIX: Check if ANY of these lots are already linked in an ACTIVE OEE Lot Linking document
            # This respects the validate_no_circular_references() validation
            existing_active_links = frappe.db.sql("""
                SELECT DISTINCT parent.name, parent.main_lot_number
                FROM `tabOEE Lot Linking` parent
                INNER JOIN `tabOEE Linked Lot Item` child ON child.parent = parent.name
                WHERE parent.status = 'Active'
                AND parent.docstatus < 2
                AND (parent.main_lot_number IN %(lots)s OR child.lot_number IN %(lots)s)
            """, {
                'lots': linked_lots
            }, as_dict=True)
            
            if existing_active_links and len(existing_active_links) > 0:
                # OEE Lot Linking already exists for these lots - SKIP creation
                existing_name = existing_active_links[0]['name']
                skipped_count += 1
                frappe.logger().info(
                    f"Skipped OEE Lot Linking creation - already exists: {existing_name} for lots {linked_lots}"
                )
                continue
            
            # No existing active linking found - CREATE NEW
            linking_doc = frappe.new_doc('OEE Lot Linking')
            linking_doc.main_lot_number = main_lot_number
            linking_doc.production_date = production_date
            linking_doc.shift_type = shift_type
            linking_doc.machine_reference = machine  # FIX: Now correctly populated
            linking_doc.operator_name = operator
            linking_doc.item_code = item_code  # FIX: Now correctly populated
            linking_doc.status = 'Active'
            
            # IMPORTANT: Add child rows for ALL lots in the linked group (including main lot)
            # This satisfies the validate_main_lot_in_linked_lots() validation
            for linked_lot in linked_lots:
                # Find the production entry for this lot in current production_data
                prod_entries = [e for e in production_data if e.get('lot_number') == linked_lot]
                
                if prod_entries:
                    # Use data from production_data (preferred)
                    for prod_entry in prod_entries:
                        prod_entry_name = prod_entry.get('name')
                        # FIX: Use correct field names from Moulding Production Entry
                        weight = flt(prod_entry.get('weight', 0), 3)  # Direct field name
                        lifts = int(prod_entry.get('number_of_lifts', 0))  # Direct field name
                        no_of_cavities = int(prod_entry.get('no_of_running_cavities', 0))
                        pieces = lifts * no_of_cavities  # Calculate pieces
                        
                        linking_doc.append('linked_lots', {
                            'production_entry': prod_entry_name,
                            'lot_number': linked_lot,
                            'weight': weight,
                            'lifts': lifts,
                            'pieces': pieces,
                            'oee_include': 1  # Default to True (include in OEE)
                        })
                else:
                    # Fallback: Query database for missing production entry
                    prod_entry_data = frappe.db.sql("""
                        SELECT 
                            mpe.name as production_entry,
                            mpe.weight,
                            mpe.number_of_lifts,
                            mpe.no_of_running_cavities,
                            (mpe.number_of_lifts * mpe.no_of_running_cavities) as pieces
                        FROM `tabMoulding Production Entry` mpe
                        LEFT JOIN `tabJob Card` jc ON mpe.job_card = jc.name
                        WHERE COALESCE(mpe.scan_lot_number, mpe.batch_no) = %(lot)s
                        AND DATE(mpe.moulding_date) = %(date)s
                        AND jc.shift_type = %(shift)s
                        AND jc.workstation = %(machine)s
                        AND mpe.docstatus = 1
                        LIMIT 1
                    """, {
                        'lot': linked_lot,
                        'date': production_date,
                        'shift': shift_type,
                        'machine': machine
                    }, as_dict=True)
                    
                    if prod_entry_data and len(prod_entry_data) > 0:
                        prod_entry = prod_entry_data[0]
                        linking_doc.append('linked_lots', {
                            'production_entry': prod_entry['production_entry'],
                            'lot_number': linked_lot,
                            'weight': flt(prod_entry.get('weight', 0), 3),
                            'lifts': int(prod_entry.get('number_of_lifts', 0)),
                            'pieces': int(prod_entry.get('pieces', 0)),
                            'oee_include': 1  # Default to True
                        })
            
            # Validate that we have child rows before saving
            if not linking_doc.linked_lots or len(linking_doc.linked_lots) == 0:
                frappe.log_error(
                    f"Cannot create OEE Lot Linking - no linked lots data found for main lot {main_lot_number}",
                    "OEE Lot Linking Creation Warning"
                )
                continue
            
            # Validate that main lot is included in child table (required by validation)
            child_lot_numbers = [row.lot_number for row in linking_doc.linked_lots]
            if main_lot_number not in child_lot_numbers:
                frappe.log_error(
                    f"Cannot create OEE Lot Linking - main lot {main_lot_number} not in child table: {child_lot_numbers}",
                    "OEE Lot Linking Creation Warning"
                )
                continue
            
            # Save the document
            try:
                linking_doc.insert(ignore_permissions=True)
                created_count += 1
                frappe.logger().info(
                    f"Created OEE Lot Linking: {linking_doc.name} for linked lots {linked_lots}"
                )
                frappe.db.commit()
            except frappe.exceptions.ValidationError as ve:
                # FIX: Handle duplicate linking validation errors gracefully
                error_message = str(ve)
                
                # Check if it's a duplicate linking error (circular reference)
                if "already linked" in error_message.lower() or "circular" in error_message.lower():
                    # This is expected when OEE Lot Linking already exists - just skip
                    skipped_count += 1
                    frappe.logger().info(
                        f"OEE Lot Linking already exists for lots {linked_lots} - skipped creation"
                    )
                else:
                    # Other validation errors - log with full details
                    frappe.log_error(
                        title="OEE Linking Validation Error",
                        message=f"Validation error creating OEE Lot Linking for lots {linked_lots}:\n\n{str(ve)}\n\n{frappe.get_traceback()}"
                    )
                continue
            except Exception as e:
                # Unexpected errors - log with full traceback
                frappe.log_error(
                    title="OEE Linking Creation Error",
                    message=f"Unexpected error creating OEE Lot Linking for lots {linked_lots}:\n\n{str(e)}\n\n{frappe.get_traceback()}"
                )
                continue
        
        # Log summary
        if created_count > 0 or skipped_count > 0:
            frappe.logger().info(
                f"OEE Lot Linking creation summary: Created={created_count}, Skipped={skipped_count}"
            )
        
    except Exception as e:
        frappe.log_error(
            f"Error creating OEE Lot Linking records: {frappe.get_traceback()}",
            "OEE Lot Linking Creation Error"
        )
        pass


@frappe.whitelist()
def get_oee_summary(production_date=None, process_type='Moulding', shift_filter=None,
                    machine_filter=None, lot_filter=None, item_filter=None):
    """
    Get summary statistics for OEE Report Generator
    
    Returns:
        dict: Summary metrics (averages, totals, etc.)
    """
    
    # Get OEE data
    oee_data = get_oee_data(
        production_date=production_date,
        process_type=process_type,
        shift_filter=shift_filter,
        machine_filter=machine_filter,
        lot_filter=lot_filter,
        item_filter=item_filter
    )
    
    if not oee_data or len(oee_data) == 0:
        return {
            'total_records': 0,
            'avg_availability': 0.0,
            'avg_performance': 0.0,
            'avg_quality': 0.0,
            'avg_oee': 0.0,
            'total_planned_qty': 0,
            'total_produced_qty': 0,
            'total_good_pieces': 0,
            'total_rejected_pieces': 0,
            'overall_rejection_pct': 0.0
        }
    
    # Calculate averages
    total_records = len(oee_data)
    avg_availability = sum(row['_availability'] for row in oee_data) / total_records
    avg_performance = sum(row['_performance'] for row in oee_data) / total_records
    avg_quality = sum(row['_quality'] for row in oee_data) / total_records
    avg_oee = sum(row['oee_pct'] for row in oee_data) / total_records
    
    # Calculate totals
    total_planned_qty = sum(row['target_quantity'] for row in oee_data)
    total_produced_qty = sum(row['actual_quantity'] for row in oee_data)
    total_good_pieces = sum(row['good_pieces'] for row in oee_data)
    total_rejected_pieces = sum(row['rejected_pieces'] for row in oee_data)
    
    # Overall rejection percentage
    total_inspected = sum(row['total_inspected'] for row in oee_data)
    overall_rejection_pct = (total_rejected_pieces / total_inspected * 100) if total_inspected > 0 else 0.0
    
    # Production efficiency percentage (Produced / Planned * 100)
    production_efficiency_pct = (total_produced_qty / total_planned_qty * 100) if total_planned_qty > 0 else 0.0
    
    return {
        'total_records': total_records,
        'avg_availability': round(avg_availability * 100, 2),
        'avg_performance': round(avg_performance * 100, 2),
        'avg_quality': round(avg_quality * 100, 2),
        'avg_oee': round(avg_oee, 2),
        'total_planned_qty': total_planned_qty,
        'total_produced_qty': total_produced_qty,
        'total_good_pieces': total_good_pieces,
        'total_rejected_pieces': total_rejected_pieces,
        'overall_rejection_pct': round(overall_rejection_pct, 2),
        # Additional metrics for Corrective Action Report
        'total_planned_pieces': int(total_planned_qty),
        'total_produced_pieces': int(total_produced_qty),
        'production_efficiency_pct': round(production_efficiency_pct, 2)
    }


@frappe.whitelist()
def get_available_processes():
    """
    Get list of available manufacturing processes
    
    Returns:
        list: List of process names
    """
    return [{'value': key, 'label': key} for key in PROCESS_ADAPTERS.keys()]


@frappe.whitelist()
def get_shift_options(production_date=None, process_type='Moulding'):
    """
    Get available shift options for the selected process
    
    Returns:
        list: List of shift options
    """
    if not production_date:
        production_date = today()
    
    # For now, return standard shifts
    # This could be made dynamic by querying actual shifts from production data
    return [
        {'value': 'all', 'label': 'All Shifts'},
        {'value': 'A', 'label': 'Shift A'},
        {'value': 'B', 'label': 'Shift B'},
        {'value': 'C', 'label': 'Shift C'}
    ]


@frappe.whitelist()
def get_reason_codes():
    """
    Get OEE reason codes from OEE Reason Code DocType.
    Returns only active codes sorted by sort_order and then by reason_code.
    Falls back to hardcoded list if DocType doesn't exist or is empty.
    
    Returns:
        list: List of active reason codes
    """
    try:
        # Try to fetch from OEE Reason Code DocType
        reason_codes = frappe.get_all(
            'OEE Reason Code',
            filters={'is_active': 1},
            fields=['reason_code', 'category', 'priority', 'color_code'],
            order_by='sort_order asc, reason_code asc'
        )
        
        # If we have codes in the DocType, return them
        if reason_codes:
            # Return just the reason_code text for dropdown compatibility
            return [code['reason_code'] for code in reason_codes]
        
        # If DocType is empty, fall back to hardcoded list
        frappe.log_error("OEE Reason Code DocType is empty, using hardcoded fallback", 
                        "OEE Reason Codes")
        return get_hardcoded_reason_codes()
        
    except Exception as e:
        # If DocType doesn't exist yet (before migration), use hardcoded fallback
        frappe.log_error(f"Error fetching reason codes from DocType: {str(e)}", 
                        "OEE Reason Codes")
        return get_hardcoded_reason_codes()


@frappe.whitelist()
def get_corrective_action_codes():
    """
    Get OEE corrective action codes from OEE Corrective Action Code DocType.
    Returns only active codes sorted by sort_order and then by corrective_action_code.
    Falls back to hardcoded list if DocType doesn't exist or is empty.
    
    Returns:
        list: List of active corrective action codes
    """
    try:
        # Try to fetch from OEE Corrective Action Code DocType
        action_codes = frappe.get_all(
            'OEE Corrective Action Code',
            filters={'is_active': 1},
            fields=['corrective_action_code', 'category', 'priority', 'color_code'],
            order_by='sort_order asc, corrective_action_code asc'
        )
        
        # If we have codes in the DocType, return them
        if action_codes:
            # Return just the corrective_action_code text for dropdown compatibility
            return [code['corrective_action_code'] for code in action_codes]
        
        # If DocType is empty, fall back to hardcoded list
        frappe.log_error("OEE Corrective Action Code DocType is empty, using hardcoded fallback", 
                        "OEE Corrective Action Codes")
        return get_hardcoded_corrective_action_codes()
        
    except Exception as e:
        # If DocType doesn't exist yet (before migration), use hardcoded fallback
        frappe.log_error(f"Error fetching corrective action codes from DocType: {str(e)}", 
                        "OEE Corrective Action Codes")
        return get_hardcoded_corrective_action_codes()


def get_hardcoded_reason_codes():
    """
    Fallback hardcoded reason codes for backward compatibility.
    Used when OEE Reason Code DocType doesn't exist or is empty.
    
    Returns:
        list: List of hardcoded reason codes
    """
    return [
        "COMPOUND SHORTAGE",
        "MACHINE BREAKDOWN",
        "MLD CHANGE",
        "MLD WASH / CLEAN",
        "OPERATOR ISSUE",
        "PLANNING",
        "QUALITY ISSUE",
        "TRIAL",
        "COMPOUND ISSUE",
        "SHELL SHORTAGE",
        "SHELL QUALITY ISSUE",
        "OPERATOR DELAY",
        "LOADING PLATE NOT AVAILABLE",
        "MOULD ISSUE",
    ]


def get_hardcoded_corrective_action_codes():
    """
    Fallback hardcoded corrective action codes for backward compatibility.
    Used when OEE Corrective Action Code DocType doesn't exist or is empty.
    
    Returns:
        list: List of hardcoded corrective action codes
    """
    return [
        "COMPOUND ARRANGED",
        "MACHINE REPAIRED",
        "MOULD CHANGED",
        "MOULD CLEANED",
        "OPERATOR REPLACED",
        "PLANNING ADJUSTED",
        "QUALITY ISSUE RESOLVED",
        "TRIAL COMPLETED",
        "COMPOUND REPLACED",
        "SHELL ARRANGED",
        "SHELL QUALITY IMPROVED",
        "OPERATOR TRAINED",
        "LOADING PLATE ARRANGED",
        "MOULD REPAIRED",
    ]


@frappe.whitelist()
def save_production_resolution(production_entry: str, resolution_data=None, is_draft: bool = True, process_type: str = 'Moulding'):
    """Save CAR resolution data to Production Entry (process-specific DocType).
    Args:
        production_entry: Name of production entry document
        resolution_data: Dict or JSON string containing resolution fields
        is_draft: If True, sets status to In Progress; else Resolved
        process_type: Process type to resolve underlying DocType
    Returns: dict with success and updated status
    """
    try:
        # Coerce resolution_data to dict
        if resolution_data is None:
            resolution_data = {}
        elif isinstance(resolution_data, str):
            import json
            try:
                resolution_data = json.loads(resolution_data) if resolution_data else {}
            except Exception:
                resolution_data = {}
        elif not isinstance(resolution_data, dict):
            # Unknown type -> convert to dict best-effort
            resolution_data = frappe._dict(resolution_data)

        if not production_entry:
            return {"success": False, "error": "Missing production_entry"}

        # Resolve underlying DocType
        doctype = PRODUCTION_ENTRY_DOCTYPE.get(process_type) or PRODUCTION_ENTRY_DOCTYPE.get('Moulding')
        doc = None
        if doctype:
            try:
                doc = frappe.get_doc(doctype, production_entry)
            except Exception:
                doc = None
        if not doc:
            return {"success": False, "error": "Production document not found"}
        if not doc.has_permission("write"):
            return {"success": False, "error": "No write permission for this record"}

        # Map fields
        field_map = {
            "reason_code": "reason_code",
            "problem_description": "problem_description",
            "root_cause": "root_cause",
            "corrective_action": "corrective_action",
            "responsible_person": "responsible_person",
            "target_completion_date": "target_completion_date",
            "resolution_remarks": "resolution_remarks",
        }
        meta = frappe.get_meta(doc.doctype)
        for k, f in field_map.items():
            if (k in resolution_data) and meta.get_field(f):
                doc.set(f, resolution_data.get(k))

        # Status and audit
        status = "In Progress" if is_draft else "Resolved"
        if meta.get_field("resolution_status"):
            doc.set("resolution_status", status)
        if not is_draft:
            from frappe.utils import now_datetime
            if meta.get_field("resolved_by"):
                doc.set("resolved_by", frappe.session.user)
            if meta.get_field("resolved_on"):
                doc.set("resolved_on", now_datetime())

        doc.save()
        frappe.db.commit()
        return {"success": True, "resolution_status": status}
    except Exception as e:
        frappe.log_error(f"save_production_resolution error: {frappe.get_traceback()}", "OEE Resolution Save")
        return {"success": False, "error": str(e)}


@frappe.whitelist()
def get_latest_production_date(process_type: str = 'Moulding'):
    """Return the most recent production date with posted entries for the given process.
    Defaults to today if none found.
    """
    try:
        if process_type == 'Moulding':
            dt = frappe.db.sql("""
                SELECT MAX(moulding_date) AS d
                FROM `tabMoulding Production Entry`
                WHERE docstatus = 1
            """, as_dict=True)
            latest = dt[0]['d'] if dt and dt[0] and dt[0]['d'] else None
            return latest or today()
        # Add other processes here as needed
        return today()
    except Exception:
        return today()


@frappe.whitelist()
def save_oee_report(report_data):
    """
    Save OEE Report data as draft Daily OEE Report
    Creates a draft Daily OEE Report document that can be edited later
    
    Args:
        report_data: Dictionary containing:
            - filters: {production_date, process_type, shift_filter, machine_filter}
            - data: List of production records
            - summary: Summary statistics
            - generated_at: Timestamp
    
    Returns:
        dict: {success: bool, report_name: str or None, error: str or None}
    """
    try:
        import json
        
        # Parse report_data if it's a JSON string
        if isinstance(report_data, str):
            report_data = json.loads(report_data)
        
        # Extract data
        filters = report_data.get('filters', {})
        production_records = report_data.get('data', [])
        summary = report_data.get('summary', {})
        
        # Validate required fields
        production_date = filters.get('production_date')
        if not production_date:
            return {
                'success': False,
                'error': 'Production date is required'
            }
        
        if not production_records or len(production_records) == 0:
            return {
                'success': False,
                'error': 'No production records to save'
            }
        
        # Check if report already exists for this date/filter combination
        existing_reports = frappe.db.get_list(
            'Daily OEE Report',
            filters={
                'production_date': production_date,
                'shift_filter': filters.get('shift_filter', ''),
                'machine_filter': filters.get('machine_filter', ''),
                'docstatus': 0  # Only draft reports
            },
            limit=1
        )
        
        if existing_reports:
            # Update existing draft report instead of creating duplicate
            report_doc = frappe.get_doc('Daily OEE Report', existing_reports[0].name)
            
            # Clear existing child records
            report_doc.production_records = []
            
            # Add updated production records
            for record in production_records:
                oee_pct = flt(record.get('oee_pct', 0))
                
                # For draft reports, only set resolution_status if:
                # 1. Record already has a resolution_status from production entry
                # 2. OEE is low (<90%) and needs resolution - mark as Pending
                # Don't auto-mark good OEE records as Resolved in draft
                existing_resolution_status = (record.get('resolution_status') or '').strip()
                if existing_resolution_status:
                    resolution_status = existing_resolution_status
                elif oee_pct < 90:
                    resolution_status = 'Pending'
                else:
                    resolution_status = ''  # Leave empty for good OEE in draft
                
                report_doc.append('production_records', {
                    'production_entry': record.get('name'),
                    'production_date': record.get('production_date'),
                    'shift_type': record.get('shift_type'),
                    'operator_name': record.get('operator_name'),
                    'machine_reference': record.get('machine_reference'),
                    'machine_name': record.get('machine_name', ''),  # FIX: Add machine name from Job Card
                    'item_code': record.get('item_code'),
                    'lot_number': record.get('lot_number'),
                    # NEW: Save linked lot fields
                    'is_linked_lot': record.get('is_linked_lot', False),
                    'linked_lots': record.get('linked_lots', ''),
                    'linked_lot_count': record.get('linked_lot_count', 0),
                    'target_quantity': flt(record.get('target_quantity', 0)),
                    'actual_quantity': flt(record.get('actual_quantity', 0)),
                    'number_of_products': flt(record.get('number_of_products', 0)),  # FIX: Add NoP field
                    'variance_qty': flt(record.get('variance_qty', 0)),
                    'oee_pct': oee_pct,
                    'production_efficiency_pct': flt(record.get('production_equipment_efficiency', 0)),
                    'rejection_percentage': flt(record.get('rejection_percentage', 0)),
                    'availability_pct': flt(record.get('availability_pct', 0)),
                    'performance_pct': flt(record.get('performance_pct', 0)),
                    'quality_pct': flt(record.get('quality_pct', 0)),
                    # NEW: Add breakdown details for OEE Details Modal
                    'planned_time_minutes': flt(record.get('planned_time_minutes', 0)),
                    'downtime_minutes': flt(record.get('downtime_minutes', 0)),
                    'available_time_minutes': flt(record.get('available_time_minutes', 0)),
                    'cycle_time_seconds': flt(record.get('cycle_time_seconds', 0)),
                    'no_of_cavities': int(record.get('no_of_cavities', 0)),
                    'total_inspected': int(record.get('total_inspected', 0)),
                    'good_pieces': int(record.get('good_pieces', 0)),
                    'rejected_pieces': int(record.get('rejected_pieces', 0)),
                    'resolution_status': resolution_status,
                    'resolved_record': record.get('resolved_record', ''),  # FIXED: Use resolved_record instead of car_reference
                    'remarks': record.get('resolution_remarks', '')
                })
            
            report_doc.save()
            frappe.db.commit()
            
            return {
                'success': True,
                'report_name': report_doc.name,
                'message': f'Daily OEE Report {report_doc.name} updated successfully with {len(production_records)} records'
            }
        
        # Create new Daily OEE Report
        report_doc = frappe.new_doc('Daily OEE Report')
        
        # Set header fields
        report_doc.production_date = production_date
        report_doc.report_date = today()
        report_doc.shift_filter = filters.get('shift_filter', '')
        report_doc.machine_filter = filters.get('machine_filter', '')
        
        # Add production records to child table
        for record in production_records:
            oee_pct = flt(record.get('oee_pct', 0))
            
            # For draft reports, only set resolution_status if:
            # 1. Record already has a resolution_status from production entry
            # 2. OEE is low (<90%) and needs resolution - mark as Pending
            # Don't auto-mark good OEE records as Resolved in draft
            existing_resolution_status = (record.get('resolution_status') or '').strip()
            if existing_resolution_status:
                resolution_status = existing_resolution_status
            elif oee_pct < 90:
                resolution_status = 'Pending'
            else:
                resolution_status = ''  # Leave empty for good OEE in draft
            
            report_doc.append('production_records', {
                'production_entry': record.get('name'),
                'production_date': record.get('production_date'),
                'shift_type': record.get('shift_type'),
                'operator_name': record.get('operator_name'),
                'machine_reference': record.get('machine_reference'),
                'machine_name': record.get('machine_name', ''),  # FIX: Add machine name from Job Card
                'item_code': record.get('item_code'),
                'lot_number': record.get('lot_number'),
                # NEW: Save linked lot fields
                'is_linked_lot': record.get('is_linked_lot', False),
                'linked_lots': record.get('linked_lots', ''),
                'linked_lot_count': record.get('linked_lot_count', 0),
                'target_quantity': flt(record.get('target_quantity', 0)),
                'actual_quantity': flt(record.get('actual_quantity', 0)),
                'number_of_products': flt(record.get('number_of_products', 0)),  # FIX: Add NoP field
                'variance_qty': flt(record.get('variance_qty', 0)),
                'oee_pct': oee_pct,
                'production_efficiency_pct': flt(record.get('production_equipment_efficiency', 0)),
                'rejection_percentage': flt(record.get('rejection_percentage', 0)),
                'availability_pct': flt(record.get('availability_pct', 0)),
                'performance_pct': flt(record.get('performance_pct', 0)),
                'quality_pct': flt(record.get('quality_pct', 0)),
                # NEW: Add breakdown details for OEE Details Modal
                'planned_time_minutes': flt(record.get('planned_time_minutes', 0)),
                'downtime_minutes': flt(record.get('downtime_minutes', 0)),
                'available_time_minutes': flt(record.get('available_time_minutes', 0)),
                'cycle_time_seconds': flt(record.get('cycle_time_seconds', 0)),
                'no_of_cavities': int(record.get('no_of_cavities', 0)),
                'total_inspected': int(record.get('total_inspected', 0)),
                'good_pieces': int(record.get('good_pieces', 0)),
                'rejected_pieces': int(record.get('rejected_pieces', 0)),
                'resolution_status': resolution_status,
                'resolved_record': record.get('resolved_record', ''),  # FIXED: Use resolved_record instead of car_reference
                'remarks': record.get('resolution_remarks', '')
            })
        
        # Save as draft (don't submit)
        report_doc.insert()
        frappe.db.commit()
        
        return {
            'success': True,
            'report_name': report_doc.name,
            'message': f'Daily OEE Report {report_doc.name} saved as draft with {len(production_records)} records'
        }
        
    except Exception as e:
        frappe.log_error(
            f"Error saving OEE report: {frappe.get_traceback()}", 
            "Save OEE Report Error"
        )
        return {
            'success': False,
            'error': str(e)
        }


@frappe.whitelist()
def submit_oee_report(report_data):
    """
    Submit OEE Report data to Daily OEE Report DocType
    Creates and immediately submits a Daily OEE Report document
    
    Args:
        report_data: Dictionary containing:
            - filters: {production_date, process_type, shift_filter, machine_filter}
            - data: List of production records
            - summary: Summary statistics
            - generated_at: Timestamp
            - remarks: {general_remarks, suggestions_for_improvement, safety_and_machinery, mould_observation}
    
    Returns:
        dict: {success: bool, report_name: str or None, error: str or None}
    """
    try:
        import json
        
        # Parse report_data if it's a JSON string
        if isinstance(report_data, str):
            report_data = json.loads(report_data)
        
        # Extract data
        filters = report_data.get('filters', {})
        production_records = report_data.get('data', [])
        remarks = report_data.get('remarks', {})
        
        # Validate required fields
        production_date = filters.get('production_date')
        if not production_date:
            return {
                'success': False,
                'error': 'Production date is required'
            }
        
        if not production_records or len(production_records) == 0:
            return {
                'success': False,
                'error': 'No production records to submit'
            }
        
        # Check if report already exists for this date/filter combination
        existing_reports = frappe.db.get_list(
            'Daily OEE Report',
            filters={
                'production_date': production_date,
                'shift_filter': filters.get('shift_filter', ''),
                'machine_filter': filters.get('machine_filter', ''),
                'docstatus': ['<', 2]  # Not cancelled
            },
            limit=1
        )
        
        if existing_reports:
            return {
                'success': False,
                'error': f'A report already exists for this date/filter combination: {existing_reports[0].name}'
            }
        
        # Create new Daily OEE Report
        report_doc = frappe.new_doc('Daily OEE Report')
        
        # Set header fields
        report_doc.production_date = production_date
        report_doc.report_date = today()
        report_doc.shift_filter = filters.get('shift_filter', '')
        report_doc.machine_filter = filters.get('machine_filter', '')
        
        # Set remarks fields
        report_doc.general_remarks = remarks.get('general_remarks', '')
        report_doc.suggestions_for_improvement = remarks.get('suggestions_for_improvement', '')
        report_doc.safety_and_machinery = remarks.get('safety_and_machinery', '')
        report_doc.mould_observation = remarks.get('mould_observation', '')
        # REMOVED: tool_observation field as per stakeholder request
        
        # Add production records to child table
        for record in production_records:
            oee_pct = flt(record.get('oee_pct', 0))
            
            # For submitted reports, determine resolution status based on OEE
            # Low OEE (< 90%) needs resolution - set to Pending
            # Good OEE (>= 90%) doesn't need resolution - leave empty (will be auto-resolved on submit)
            resolution_status = 'Pending' if oee_pct < 90 else ''
            
            report_doc.append('production_records', {
                'production_entry': record.get('name'),  # Link to Moulding Production Entry
                'production_date': record.get('production_date'),
                'shift_type': record.get('shift_type'),
                'operator_name': record.get('operator_name'),
                'machine_reference': record.get('machine_reference'),
                'machine_name': record.get('machine_name', ''),  # FIX: Add machine name from Job Card
                'item_code': record.get('item_code'),
                'lot_number': record.get('lot_number'),
                'target_quantity': flt(record.get('target_quantity', 0)),
                'actual_quantity': flt(record.get('actual_quantity', 0)),
                'number_of_products': flt(record.get('number_of_products', 0)),  # FIX: Add NoP field
                'variance_qty': flt(record.get('variance_qty', 0)),
                'oee_pct': oee_pct,
                'production_efficiency_pct': flt(record.get('production_equipment_efficiency', 0)),
                'rejection_percentage': flt(record.get('rejection_percentage', 0)),
                'availability_pct': flt(record.get('availability_pct', 0)),
                'performance_pct': flt(record.get('performance_pct', 0)),
                'quality_pct': flt(record.get('quality_pct', 0)),
                # NEW: Add breakdown details for OEE Details Modal
                'planned_time_minutes': flt(record.get('planned_time_minutes', 0)),
                'downtime_minutes': flt(record.get('downtime_minutes', 0)),
                'available_time_minutes': flt(record.get('available_time_minutes', 0)),
                'cycle_time_seconds': flt(record.get('cycle_time_seconds', 0)),
                'no_of_cavities': int(record.get('no_of_cavities', 0)),
                'total_inspected': int(record.get('total_inspected', 0)),
                'good_pieces': int(record.get('good_pieces', 0)),
                'rejected_pieces': int(record.get('rejected_pieces', 0)),
                'resolution_status': resolution_status
            })
        
        # Save document (this will trigger validate() which calculates summary)
        report_doc.insert()
        
        # Submit the document (this will trigger before_submit validation)
        report_doc.submit()
        frappe.db.commit()
        
        return {
            'success': True,
            'report_name': report_doc.name,
            'message': f'Daily OEE Report {report_doc.name} submitted successfully with {len(production_records)} records'
        }
        
    except Exception as e:
        frappe.log_error(
            f"Error submitting OEE report: {frappe.get_traceback()}", 
            "Submit OEE Report Error"
        )
        return {
            'success': False,
            'error': str(e)
        }


@frappe.whitelist()
def create_car_from_oee_dashboard(production_entry, parent_daily_oee_report=None, resolution_data=None, oee_metrics=None):
    """
    Create a Corrective Action Report (CAR) from OEE Dashboard
    Links the CAR to the production entry and optionally to the Daily OEE Report

    Args:
        production_entry: Name of the production entry (e.g., Moulding Production Entry)
        parent_daily_oee_report: Name of the parent Daily OEE Report (optional)
        resolution_data: Dictionary containing resolution fields:
            - reason_code
            - problem_description
            - root_cause
            - corrective_action
            - responsible_person
            - target_completion_date
            - resolution_remarks
        oee_metrics: Dictionary containing OEE metrics from the dashboard row:
            - oee_pct
            - availability_pct
            - performance_pct
            - quality_pct
            - target_quantity
            - actual_quantity

    Returns:
        dict: {success: bool, car_name: str or None, error: str or None}
    """
    try:
        import json

        # Parse resolution_data if it's a JSON string
        if isinstance(resolution_data, str):
            resolution_data = json.loads(resolution_data)

        if not resolution_data:
            resolution_data = {}

        # Parse oee_metrics if it's a JSON string
        if isinstance(oee_metrics, str):
            oee_metrics = json.loads(oee_metrics)

        if not oee_metrics:
            oee_metrics = {}

        if not production_entry:
            return {
                'success': False,
                'error': 'Production entry is required'
            }

        # Get the production entry document to extract details
        production_doc = None
        try:
            # Try Moulding Production Entry first
            production_doc = frappe.get_doc('Moulding Production Entry', production_entry)
        except Exception:
            return {
                'success': False,
                'error': f'Production entry {production_entry} not found'
            }

        # Create new Corrective Action Resolved document
        car_doc = frappe.new_doc('Corrective Action Resolved')

        # Set header fields from production entry
        car_doc.production_date = production_doc.get('moulding_date')
        car_doc.shift_type = production_doc.get('shift_type') or 'Unknown'
        car_doc.machine_reference = production_doc.get('machine_no') or production_doc.get('mould_reference')
        car_doc.item_code = production_doc.get('item_code') or production_doc.get('item_to_produce')
        car_doc.lot_number = production_doc.get('lot_no') or production_doc.get('scan_lot_number') or production_doc.get('batch_no')
        car_doc.operator_name = production_doc.get('operator_name')

        # Set OEE metrics from dashboard row
        car_doc.oee_pct = oee_metrics.get('oee_pct', 0)
        car_doc.production_efficiency_pct = oee_metrics.get('performance_pct', 0)
        car_doc.rejection_percentage = oee_metrics.get('quality_pct', 0)

        # Set quantities
        car_doc.target_quantity = oee_metrics.get('target_quantity', 0)
        car_doc.actual_quantity = oee_metrics.get('actual_quantity', 0)
        car_doc.variance_qty = (oee_metrics.get('actual_quantity', 0) - oee_metrics.get('target_quantity', 0))

        # Link to production entry
        car_doc.production_entry = production_entry
        car_doc.production_entry_type = 'Moulding Production Entry'

        # Link to Daily OEE Report if provided
        if parent_daily_oee_report:
            car_doc.parent_daily_oee_report = parent_daily_oee_report

        # Set resolution fields
        car_doc.reason_code = resolution_data.get('reason_code', '')
        car_doc.problem_description = resolution_data.get('problem_description', '')

        # FIX: Save corrective action fields with correct field names
        car_doc.corrective_action_code = resolution_data.get('corrective_action_code', '')
        car_doc.corrective_action_details = resolution_data.get('corrective_action_details', '')

        # FIX: Save remarks to correct field name (remarks, not resolution_remarks)
        car_doc.remarks = resolution_data.get('resolution_remarks', '')

        # Optional fields (map to correct CAR field names)
        if resolution_data.get('responsible_person'):
            car_doc.scan_operator = resolution_data.get('responsible_person')

        if resolution_data.get('target_completion_date'):
            car_doc.target_date = resolution_data.get('target_completion_date')

        # Set status based on whether it's a draft or complete
        is_draft = resolution_data.get('is_draft', False)
        car_doc.resolution_status = 'In Progress' if is_draft else 'Resolved'

        # Set resolved by/on if it's complete
        if not is_draft:
            from frappe.utils import now_datetime
            car_doc.resolved_by = frappe.session.user
            car_doc.resolved_on = now_datetime()
        
        # Save the CAR document
        car_doc.insert()
        
        # If there's a Daily OEE Report, update the resolution status there too
        if parent_daily_oee_report:
            try:
                report_doc = frappe.get_doc('Daily OEE Report', parent_daily_oee_report)
                
                # Find the production record row in the child table
                for row in report_doc.production_records:
                    if (row.production_entry == production_entry):
                        # Document is draft, safe to update normally
                        row.resolution_status = car_doc.resolution_status
                        row.resolved_record = car_doc.name  # FIXED: Use resolved_record instead of car_reference
                        row.remarks = resolution_data.get('resolution_remarks', '')
                        report_doc.save()
                        break
                
            except Exception as e:
                frappe.log_error(
                    f"Error updating Daily OEE Report: {str(e)}\n{frappe.get_traceback()}", 
                    "CAR Creation - Report Update Error"
                )
        
        frappe.db.commit()
        
        return {
            'success': True,
            'car_name': car_doc.name,
            'resolution_status': car_doc.resolution_status,
            'message': f'CAR {car_doc.name} created successfully'
        }
        
    except Exception as e:
        frappe.log_error(
            f"Error creating CAR from OEE Dashboard: {frappe.get_traceback()}", 
            "Create CAR Error"
        )
        return {
            'success': False,
            'error': str(e)
        }