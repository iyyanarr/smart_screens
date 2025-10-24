"""
OEE Dashboard Backend API
Main API endpoints for the OEE Dashboard page
"""

import frappe
from frappe import _
from frappe.utils import flt, formatdate, today, getdate
from smart_screens.smart_screens.api.oee.oee_calculator import OEECalculator
from smart_screens.smart_screens.api.oee.adapters.moulding_adapter import MouldingAdapter

# Process adapter registry
PROCESS_ADAPTERS = {
    'Moulding': MouldingAdapter,
    # Future processes can be added here:
    # 'Blanking': BlankingAdapter,
    # 'Batching': BatchingAdapter,
}

@frappe.whitelist()
def get_oee_data(from_date=None, to_date=None, process_type='Moulding', shift_filter=None, 
                 machine_filter=None, lot_filter=None, item_filter=None):
    """
    Main API to get OEE data for any manufacturing process
    
    Args:
        from_date: Start date (YYYY-MM-DD)
        to_date: End date (YYYY-MM-DD)
        process_type: Process name (Moulding, Blanking, etc.)
        shift_filter: Shift filter (A, B, C, all)
        machine_filter: Machine/Equipment filter
        lot_filter: Lot number filter
        item_filter: Item code filter
    
    Returns:
        list: OEE data with all calculations
    """
    
    # Default dates
    if not from_date:
        from_date = today()
    if not to_date:
        to_date = today()
    
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
    
    # Get production data
    production_data = adapter.get_production_data(from_date, to_date, filters)
    
    # Calculate OEE for each production entry
    oee_results = []
    
    for entry in production_data:
        try:
            # Extract basic info
            planned_time = adapter.get_planned_time(entry)
            downtime = adapter.get_downtime(entry)
            target_qty = adapter.get_target_quantity(entry)
            actual_qty = adapter.get_actual_quantity(entry)
            cycle_time = adapter.calculate_cycle_time(entry)
            quality_data = adapter.get_quality_data(entry)
            
            # Calculate available time
            available_time = planned_time - downtime
            
            # Calculate OEE components
            availability = calculator.calculate_availability(planned_time, downtime)
            performance = calculator.calculate_performance(cycle_time, actual_qty, available_time)
            
            # Calculate quality
            if quality_data['total_pieces'] > 0:
                quality = calculator.calculate_quality(
                    quality_data['good_pieces'],
                    quality_data['total_pieces']
                )
            else:
                # If no inspection data, use rejection percentage or assume 100%
                if quality_data['rejection_percentage'] > 0:
                    quality = calculator.calculate_quality_from_rejection(
                        quality_data['rejection_percentage']
                    )
                else:
                    quality = 1.0  # Assume 100% quality if no data
            
            # Calculate overall OEE
            oee = calculator.calculate_oee(availability, performance, quality)
            
            # Build result object
            result = {
                'production_date': adapter.get_production_date(entry),
                'production_date_formatted': formatdate(adapter.get_production_date(entry)),
                'shift_type': adapter.get_shift_type(entry),
                'process_type': process_type,
                'machine_reference': adapter.get_machine_reference(entry),
                'lot_number': adapter.get_lot_number(entry),
                'item_code': adapter.get_item_code(entry),
                'operator_name': entry.get('operator_name', ''),
                
                # Planning & Production Data
                'planned_time_minutes': planned_time,
                'downtime_minutes': downtime,
                'available_time_minutes': available_time,
                'target_quantity': target_qty,
                'actual_quantity': actual_qty,
                'cycle_time_seconds': round(cycle_time, 2),
                'no_of_cavities': entry.get('no_of_running_cavities', 0),
                'variance_qty': actual_qty - target_qty,
                
                # Quality Data
                'total_inspected': quality_data['total_pieces'],
                'good_pieces': quality_data['good_pieces'],
                'rejected_pieces': quality_data['rejected_pieces'],
                'rejection_percentage': quality_data['rejection_percentage'],
                
                # OEE Metrics (as percentages for display)
                'availability_pct': round(availability * 100, 2),
                'performance_pct': round(performance * 100, 2),
                'quality_pct': round(quality * 100, 2),
                'oee_pct': round(oee, 2),
                
                # Production Equipment Efficiency (Availability × Performance)
                'production_equipment_efficiency': round(availability * performance * 100, 2),
                
                # Status badges
                'has_target': target_qty > 0,
                'has_production': actual_qty > 0,
                'has_quality_data': quality_data['total_pieces'] > 0,
                
                # Raw values for calculations
                '_availability': availability,
                '_performance': performance,
                '_quality': quality,
            }
            
            oee_results.append(result)
            
        except Exception as e:
            frappe.log_error(f"Error calculating OEE for entry: {str(e)}", "OEE Calculation Error")
            continue
    
    return oee_results


@frappe.whitelist()
def get_oee_summary(from_date=None, to_date=None, process_type='Moulding', shift_filter=None,
                    machine_filter=None, lot_filter=None, item_filter=None):
    """
    Get summary statistics for OEE Dashboard
    
    Returns:
        dict: Summary metrics (averages, totals, etc.)
    """
    
    # Get OEE data
    oee_data = get_oee_data(
        from_date=from_date,
        to_date=to_date,
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
        'overall_rejection_pct': round(overall_rejection_pct, 2)
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
def get_shift_options(from_date=None, to_date=None, process_type='Moulding'):
    """
    Get available shift options for the selected process
    
    Returns:
        list: List of shift options
    """
    if not from_date:
        from_date = today()
    if not to_date:
        to_date = today()
    
    # For now, return standard shifts
    # This could be made dynamic by querying actual shifts from production data
    return [
        {'value': 'all', 'label': 'All Shifts'},
        {'value': 'A', 'label': 'Shift A'},
        {'value': 'B', 'label': 'Shift B'},
        {'value': 'C', 'label': 'Shift C'}
    ]
