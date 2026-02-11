"""
SPP Aggregated Report - Streamlined version using modular architecture
Aggregates Mat, Products, and Finished Product items across SPP warehouses
"""
import frappe
from frappe import _
from frappe.utils import flt
import json
import time

# Import common modules using Frappe's module path
from smart_screens.smart_screens.page.common.report_config import SPPReportConfig
from smart_screens.smart_screens.page.common.aggregated_report_core import (
	fetch_batch_balance_data,
	filter_by_item_groups_pandas,
	exclude_batches,
	exclude_positive_stock_reconciliation,
	aggregate_by_common_code,
	get_child_warehouses
)
from smart_screens.smart_screens.page.common.mat_conversion_from_mbc import (
	get_mat_conversion_from_mbc,
	apply_mat_conversion_to_data
)
from smart_screens.smart_screens.page.common.excel_export import (
	export_aggregated_data_to_excel,
	export_batch_details_to_excel
)
from smart_screens.smart_screens.page.common.valuation_engine import get_bulk_valuation_rates

# Initialize configuration
config = SPPReportConfig()

@frappe.whitelist()
def get_spp_batch_balance_data(filters=None):
	"""
Get batch balance data aggregated across multiple SPP warehouses

Aggregates data from:
- U2-Store - SPP INDIA
- U1-Store - SPP INDIA
- Unit-1 Transit Store - SPP INDIA
- Deflashing Vendors - SPP INDIA (all child warehouses)
"""
	start_time = time.time()
	performance_log = {}
	
	if isinstance(filters, str):
		filters = json.loads(filters)
	
	if not filters:
		filters = {}
	
	try:
		# Get SPP warehouses from config
		spp_warehouses = config.get_warehouses()
		
		if not spp_warehouses:
			return {
				"success": False,
				"error": "No SPP warehouses found in the system. Please check warehouse configuration.",
				"data": [],
				"performance": performance_log
			}
		
		# STEP 1: Fetch data
		frappe.publish_realtime(
'spp_aggregated_progress',
{'step': 1, 'total': 4, 'message': f'Fetching batch data from {len(spp_warehouses)} warehouses...', 'percent': 10},
user=frappe.session.user
)
		
		t1 = time.time()
		all_data = fetch_batch_balance_data(
report_name="SPP Aggregated Report",
company=filters.get("company") or frappe.defaults.get_user_default("Company"),
warehouses=spp_warehouses,
item_group=filters.get("item_group"),
start_date=filters.get("from_date"),
end_date=filters.get("to_date")
)
		t2 = time.time()
		performance_log['spp_report_fetch'] = round(t2 - t1, 2)
		
		frappe.publish_realtime(
'spp_aggregated_progress',
{'step': 1, 'total': 4, 'message': f'Fetched {len(all_data)} batch records', 'percent': 30},
user=frappe.session.user
)
		
		if not all_data:
			return {
				"success": False,
				"error": "No data returned from SPP Batch Balance Report",
				"data": [],
				"performance": performance_log
			}
		
		# STEP 2: Exclude batches
		frappe.publish_realtime(
'spp_aggregated_progress',
{'step': 2, 'total': 4, 'message': 'Processing batch exclusions...', 'percent': 50},
user=frappe.session.user
)
		
		t3 = time.time()
		all_data, excluded_count = exclude_batches(all_data, "SPP Aggregated Report")
		t4 = time.time()
		performance_log['batch_exclusion'] = round(t4 - t3, 2)
		
		# STEP 2b: Exclude positive Stock Reconciliation (Option B fix)
		frappe.publish_realtime(
			'spp_aggregated_progress',
			{'step': 2, 'total': 4, 'message': 'Processing stock reconciliation corrections...', 'percent': 55},
			user=frappe.session.user
		)
		
		t4a = time.time()
		all_data, excluded_sr_count = exclude_positive_stock_reconciliation(
			all_data, 
			from_date=filters.get("from_date"),
			to_date=filters.get("to_date"),
			report_name="SPP Aggregated Report"
		)
		t4b = time.time()
		performance_log['stock_recon_exclusion'] = round(t4b - t4a, 2)
		
		# STEP 3: Filter by item groups
		frappe.publish_realtime(
'spp_aggregated_progress',
{'step': 3, 'total': 4, 'message': 'Filtering by item groups (Mat, Products, Finished)...', 'percent': 70},
user=frappe.session.user
)
		
		t5 = time.time()
		item_groups = config.get_item_groups()
		filtered_data = filter_by_item_groups_pandas(all_data, item_groups)
		
		t6 = time.time()
		performance_log['item_group_filtering'] = round(t6 - t5, 2)
		
		# **OPTIMIZED: Apply Mat conversion using Moulding Batch Conversion doctype**
		# This is 5-10x faster than the legacy multi-table join method!
		frappe.publish_realtime(
			'spp_aggregated_progress',
			{'step': 3, 'total': 4, 'message': 'Converting Mat batches (KG → Nos)...', 'percent': 75},
			user=frappe.session.user
		)
		
		t_conv_start = time.time()
		conversion_result = get_mat_conversion_from_mbc(
			batch_data=filtered_data,
			from_date=filters.get("from_date"),
			to_date=filters.get("to_date")
		)
		filtered_data, conversion_stats = apply_mat_conversion_to_data(
			filtered_data, 
			conversion_result,
			item_group_name='Mat'
		)
		t_conv_end = time.time()
		performance_log['mat_conversion'] = round(t_conv_end - t_conv_start, 3)
		performance_log['mat_conversion_method'] = conversion_result.get('method', 'unknown')
		performance_log['mat_conversion_stats'] = conversion_result.get('stats', {})
		
		frappe.logger().info(
			f"Mat conversion completed: {conversion_stats['conversion_applied']} batches "
			"converted using " + str(conversion_result.get('method')) + " method in " +
			str(performance_log['mat_conversion']) + "s"
		)

		# STEP 3.5: Calculate Valuation using Central Engine (AFTER conversion)
		if filtered_data:
			# Bulk fetch valuation rates
			items_metadata = [
				{'item_code': row.get('item'), 'item_group': row.get('item_group')} 
				for row in filtered_data
			]
			valuation_rates = get_bulk_valuation_rates(items_metadata)
			
			for row in filtered_data:
				rate = valuation_rates.get(row.get('item'), 0)
				row['balance_qty'] = flt(row.get('balance_qty', 0))
				row['balance_value'] = row['balance_qty'] * rate
				# Also store rate for visibility in details
				row['valuation_rate'] = rate

		# STEP 4: Aggregate data
		frappe.publish_realtime(
'spp_aggregated_progress',
{'step': 4, 'total': 4, 'message': 'Aggregating data by common code...', 'percent': 90},
user=frappe.session.user
)
		
		t7 = time.time()
		aggregated_data = aggregate_by_common_code(filtered_data)
		t8 = time.time()
		performance_log['aggregation'] = round(t8 - t7, 2)
		
		total_time = round(t8 - start_time, 2)
		performance_log['total_time'] = total_time
		
		frappe.publish_realtime(
'spp_aggregated_progress',
{'step': 4, 'total': 4, 'message': f'Completed! Generated {len(aggregated_data["data"])} aggregated items', 'percent': 100},
user=frappe.session.user
)
		
		return {
			"success": True,
			"data": aggregated_data["data"],
			"grand_total": aggregated_data["grand_total"],
			"raw_filtered_data": filtered_data,
			"total_records": len(all_data),
			"filtered_records": len(filtered_data),
			"aggregated_records": len(aggregated_data["data"]),
			"excluded_batches_count": excluded_count,
			"warehouses_used": spp_warehouses,
			"warehouse_count": len(spp_warehouses),
			"performance": performance_log
		}
		
	except Exception as e:
		frappe.log_error(
f"Error in SPP Aggregated Report: {str(e)}\n{frappe.get_traceback()}",
"SPP Aggregated Report Error"
)
		return {
			"success": False,
			"error": str(e),
			"data": []
		}


@frappe.whitelist()
def get_batch_details_by_common_code(common_code, filters=None, warehouse=''):
	"""
Get detailed batch records for a specific common code
"""
	if isinstance(filters, str):
		filters = json.loads(filters)
	
	if not filters:
		filters = {}
	
	try:
		# Get SPP warehouses or filter by specific warehouse
		if warehouse and warehouse != '':
			spp_warehouses = [warehouse]
		else:
			spp_warehouses = config.get_warehouses()
		
		if not spp_warehouses:
			return {
				"success": False,
				"error": "No SPP warehouses found in the system",
				"batches": {"Mat": [], "Products": [], "Finished Product": []}
			}
		
		# Fetch data
		all_batches_data = fetch_batch_balance_data(
			report_name="SPP Aggregated Report",
			company=filters.get("company") or frappe.defaults.get_user_default("Company"),
			warehouses=spp_warehouses,
			item_group=filters.get("item_group"),
			start_date=filters.get("from_date"),
			end_date=filters.get("to_date")
		)
		
		if not all_batches_data:
			return {
				"success": False,
				"error": "No data returned from batch balance query",
				"batches": {"Mat": [], "Products": [], "Finished Product": []}
			}
		
		# Exclude batches
		all_batches_data, excluded_count = exclude_batches(all_batches_data, "SPP Aggregated Report")
		
		# Exclude positive Stock Reconciliation
		all_batches_data, _ = exclude_positive_stock_reconciliation(
			all_batches_data,
			from_date=filters.get("from_date"),
			to_date=filters.get("to_date"),
			report_name="SPP Aggregated Report (Details)"
		)
				
		# Filter by item groups
		item_groups = config.get_item_groups()
		filtered_data = filter_by_item_groups_pandas(all_batches_data, item_groups)
		
		 # **CRITICAL FIX: Apply Mat conversion so batch details match aggregated view**
		conversion_result = get_mat_conversion_from_mbc(
			batch_data=filtered_data,
			from_date=filters.get("from_date"),
			to_date=filters.get("to_date")
		)
		filtered_data, conversion_stats = apply_mat_conversion_to_data(
			filtered_data, 
			conversion_result,
			item_group_name='Mat'
		)
		
		frappe.logger().info(
			f"Batch details Mat conversion: {conversion_stats['conversion_applied']} batches converted"
		)
		
		# Extract common_code and filter by requested common_code
		batches_by_group = {
			"Mat": [],
			"Products": [],
			"Finished Product": []
		}
		
		for row in filtered_data:
			item_code = row.get("item", "")
			
			# Extract common_code
			extracted_code = None
			if item_code.startswith('t.'):
				extracted_code = item_code[-4:] if len(item_code) >= 4 else None
			else:
				extracted_code = item_code[1:5] if len(item_code) >= 5 else None
			
			if extracted_code == str(common_code):
				item_group = row.get("item_group", "")
				
				# Normalize item_group
				if item_group == "Finished Products":
					item_group = "Finished Product"
				
				if item_group in batches_by_group:
					batches_by_group[item_group].append(row)
		
		total_batches = sum(len(batches) for batches in batches_by_group.values())
		
		return {
			"success": True,
			"common_code": common_code,
			"batches": batches_by_group,
			"total_batches": total_batches,
			"mat_count": len(batches_by_group["Mat"]),
			"products_count": len(batches_by_group["Products"]),
			"finished_count": len(batches_by_group["Finished Product"]),
			"warehouses_included": spp_warehouses,
			"warehouse_filter": warehouse,
			"mat_conversion_stats": conversion_stats
		}
		
	except Exception as e:
		frappe.log_error(
			f"Error getting batch details: {str(e)}\n{frappe.get_traceback()}",
			"SPP Aggregated Report - Batch Details Error"
		)
		return {
			"success": False,
			"error": str(e),
			"batches": {"Mat": [], "Products": [], "Finished Product": []}
		}


@frappe.whitelist()
def export_to_excel(filters=None, warehouse=''):
	"""Export aggregated SPP report data to Excel"""
	if isinstance(filters, str):
		filters = json.loads(filters)
	
	if not filters:
		filters = {}
	
	try:
		# Fetch and process data
		spp_warehouses = config.get_warehouses()
		
		if not spp_warehouses:
			return {
				"success": False,
				"error": "No SPP warehouses found in the system"
			}
		
		all_data = fetch_batch_balance_data(
report_name="SPP Aggregated Report",
company=filters.get("company") or frappe.defaults.get_user_default("Company"),
warehouses=spp_warehouses,
item_group=filters.get("item_group"),
start_date=filters.get("from_date"),
end_date=filters.get("to_date")
)
		
		if not all_data:
			return {
				"success": False,
				"error": "No data available for export"
			}
		
		# Exclude batches
		all_data, excluded_count = exclude_batches(all_data, "SPP Aggregated Report")
		
		# Exclude positive Stock Reconciliation
		all_data, _ = exclude_positive_stock_reconciliation(
			all_data,
			from_date=filters.get("from_date"),
			to_date=filters.get("to_date"),
			report_name="SPP Aggregated Report (Export)"
		)
		
		# Filter by item groups
		item_groups = config.get_item_groups()
		filtered_data = filter_by_item_groups_pandas(all_data, item_groups)
		
		# Apply Mat conversion using optimized method
		conversion_result = get_mat_conversion_from_mbc(
			batch_data=filtered_data,
			from_date=filters.get("from_date"),
			to_date=filters.get("to_date")
		)
		filtered_data, _ = apply_mat_conversion_to_data(filtered_data, conversion_result, 'Mat')
		
		# Filter by warehouse if specified
		if warehouse and warehouse != '':
			filtered_data = [row for row in filtered_data if row.get('warehouse') == warehouse]
		
		# Aggregate
		aggregated_result = aggregate_by_common_code(filtered_data)
		
		# Export to Excel using common module
		return export_aggregated_data_to_excel(
data=aggregated_result.get("data", []),
grand_total=aggregated_result.get("grand_total", {}),
report_title="SPP Aggregated Report",
filters=filters,
warehouse_filter=warehouse,
item_groups=["Mat", "Products", "Finished Product"]
)
		
	except Exception as e:
		frappe.log_error(
f"Error exporting to Excel: {str(e)}\n{frappe.get_traceback()}",
"SPP Aggregated Report - Export Error"
)
		return {
			"success": False,
			"error": str(e)
		}


@frappe.whitelist()
def export_batch_details_to_excel_api(common_code, batches, filters=None, warehouse_filter=''):
	"""Export batch details for a specific common code to Excel"""
	if isinstance(batches, str):
		batches = json.loads(batches)
	if isinstance(filters, str):
		filters = json.loads(filters)
	
	return export_batch_details_to_excel(
common_code=common_code,
batches=batches,
filters=filters or {},
warehouse_filter=warehouse_filter,
item_groups=["Mat", "Products", "Finished Product"]
)
