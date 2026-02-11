"""
Batch & Compound Aggregated Report - Using modular architecture
Aggregates Batch, Master Batch, and Compound items across BatCom warehouses
"""
import frappe
from frappe import _
from frappe.utils import flt
import json
import time

# Import common modules using Frappe's module path
from smart_screens.smart_screens.page.common.report_config import BatComReportConfig
from smart_screens.smart_screens.page.common.aggregated_report_core import (
	fetch_batch_balance_data,
	filter_by_item_groups_pandas,
	exclude_batches,
	aggregate_by_common_code,
	extract_batcom_common_code,
	get_child_warehouses
)
from smart_screens.smart_screens.page.common.excel_export import (
	export_aggregated_data_to_excel,
	export_batch_details_to_excel
)
from smart_screens.smart_screens.page.common.valuation_engine import get_bulk_valuation_rates

# Initialize configuration
config = BatComReportConfig()

@frappe.whitelist()
def get_batcom_batch_balance_data(filters=None):
	"""
Get batch balance data aggregated across BatCom warehouses

Aggregates data from:
- U3-Store - SPP INDIA
- Sheeting Warehouse - SPP INDIA
- Cutbit Warehouse - SPP INDIA

Item Groups: Batch, Master Batch, Compound
"""
	start_time = time.time()
	performance_log = {}
	
	if isinstance(filters, str):
		filters = json.loads(filters)
	
	if not filters:
		filters = {}
	
	try:
		# Get BatCom warehouses from config
		batcom_warehouses = config.get_warehouses()
		
		if not batcom_warehouses:
			return {
				"success": False,
				"error": "No BatCom warehouses found in the system. Please check warehouse configuration.",
				"data": [],
				"performance": performance_log
			}
		
		# STEP 1: Fetch data
		frappe.publish_realtime(
'batcom_aggregated_progress',
{'step': 1, 'total': 4, 'message': f'Fetching batch data from {len(batcom_warehouses)} warehouses...', 'percent': 10},
user=frappe.session.user
)
		
		t1 = time.time()
		all_data = fetch_batch_balance_data(
report_name="BatCom Aggregated Report",
company=filters.get("company") or frappe.defaults.get_user_default("Company"),
warehouses=batcom_warehouses,
item_group=filters.get("item_group"),
start_date=filters.get("from_date"),
end_date=filters.get("to_date")
)
		t2 = time.time()
		performance_log['report_fetch'] = round(t2 - t1, 2)
		
		frappe.publish_realtime(
'batcom_aggregated_progress',
{'step': 1, 'total': 4, 'message': f'Fetched {len(all_data)} batch records', 'percent': 30},
user=frappe.session.user
)
		
		if not all_data:
			return {
				"success": False,
				"error": "No data returned from Batch Balance Report",
				"data": [],
				"performance": performance_log
			}
		
		# STEP 2: Exclude batches
		frappe.publish_realtime(
'batcom_aggregated_progress',
{'step': 2, 'total': 4, 'message': 'Processing batch exclusions...', 'percent': 50},
user=frappe.session.user
)
		
		t3 = time.time()
		all_data, excluded_count = exclude_batches(all_data, "BatCom Aggregated Report")
		t4 = time.time()
		performance_log['batch_exclusion'] = round(t4 - t3, 2)
		
		# STEP 3: Filter by item groups (Batch, Master Batch, Compound)
		frappe.publish_realtime(
'batcom_aggregated_progress',
{'step': 3, 'total': 4, 'message': 'Filtering by item groups (Batch, Master Batch, Compound)...', 'percent': 70},
user=frappe.session.user
)
		
		t5 = time.time()
		item_groups = config.get_item_groups()
		filtered_data = filter_by_item_groups_pandas(all_data, item_groups)
		
		# STEP 3.5: Calculate Valuation for raw data using Central Engine
		if filtered_data:
			# Bulk fetch valuation rates
			items_metadata = [
				{'item_code': row.get('item'), 'item_group': row.get('item_group')} 
				for row in filtered_data
			]
			valuation_rates = get_bulk_valuation_rates(items_metadata)
			
			for row in filtered_data:
				rate = valuation_rates.get(row.get('item'), 0)
				row['balance_value'] = flt(row.get('balance_qty', 0)) * rate
				# Also store rate for visibility in details
				row['valuation_rate'] = rate

		t6 = time.time()
		performance_log['item_group_filtering'] = round(t6 - t5, 2)
		
		# STEP 4: Aggregate data using BatCom-specific common code extraction
		frappe.publish_realtime(
'batcom_aggregated_progress',
{'step': 4, 'total': 4, 'message': 'Aggregating data by common code...', 'percent': 90},
user=frappe.session.user
)
		
		t7 = time.time()
		aggregated_data = aggregate_by_common_code(filtered_data, report_type="BatCom")
		t8 = time.time()
		performance_log['aggregation'] = round(t8 - t7, 2)
		
		total_time = round(t8 - start_time, 2)
		performance_log['total_time'] = total_time
		
		frappe.publish_realtime(
'batcom_aggregated_progress',
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
			"warehouses_used": batcom_warehouses,
			"warehouse_count": len(batcom_warehouses),
			"performance": performance_log
		}
		
	except Exception as e:
		frappe.log_error(
f"Error in BatCom Aggregated Report: {str(e)}\n{frappe.get_traceback()}",
"BatCom Aggregated Report Error"
)
		return {
			"success": False,
			"error": str(e),
			"data": []
		}


@frappe.whitelist()
def get_batch_details_by_common_code(common_code, filters=None, warehouse=''):
	"""Get detailed batch records for a specific common code"""
	if isinstance(filters, str):
		filters = json.loads(filters)
	
	if not filters:
		filters = {}
	
	try:
		# Get BatCom warehouses or filter by specific warehouse
		if warehouse and warehouse != '':
			batcom_warehouses = [warehouse]
		else:
			batcom_warehouses = config.get_warehouses()
		
		if not batcom_warehouses:
			return {
				"success": False,
				"error": "No BatCom warehouses found in the system",
				"batches": {"Batch": [], "Master Batch": [], "Compound": []}
			}
		
		# Fetch data
		all_batches_data = fetch_batch_balance_data(
			report_name="BatCom Aggregated Report",
			company=filters.get("company") or frappe.defaults.get_user_default("Company"),
			warehouses=batcom_warehouses,
			item_group=filters.get("item_group"),
			start_date=filters.get("from_date"),
			end_date=filters.get("to_date")
		)
		
		if not all_batches_data:
			return {
				"success": False,
				"error": "No data returned from batch balance query",
				"batches": {"Batch": [], "Master Batch": [], "Compound": []}
			}
		
		# Exclude batches
		all_batches_data, excluded_count = exclude_batches(all_batches_data, "BatCom Aggregated Report")
		
		# Filter by item groups
		item_groups = config.get_item_groups()
		filtered_data = filter_by_item_groups_pandas(all_batches_data, item_groups)
		
		# Extract common_code using BatCom-specific logic and filter
		batches_by_group = {
			"Batch": [],
			"Master Batch": [],
			"Compound": []
		}
		
		for row in filtered_data:
			item_code = row.get("item", "")
			
			 # Use BatCom-specific common code extraction
			extracted_code = extract_batcom_common_code(item_code)
			
			if extracted_code == str(common_code):
				item_group = row.get("item_group", "")
				
				if item_group in batches_by_group:
					batches_by_group[item_group].append(row)
		
		total_batches = sum(len(batches) for batches in batches_by_group.values())
		
		return {
			"success": True,
			"common_code": common_code,
			"batches": batches_by_group,
			"total_batches": total_batches,
			"batch_count": len(batches_by_group["Batch"]),
			"master_batch_count": len(batches_by_group["Master Batch"]),
			"compound_count": len(batches_by_group["Compound"]),
			"warehouses_included": batcom_warehouses,
			"warehouse_filter": warehouse
		}
		
	except Exception as e:
		frappe.log_error(
			f"Error getting batch details: {str(e)}\n{frappe.get_traceback()}",
			"BatCom Aggregated Report - Batch Details Error"
		)
		return {
			"success": False,
			"error": str(e),
			"batches": {"Batch": [], "Master Batch": [], "Compound": []}
		}


@frappe.whitelist()
def export_to_excel(filters=None, warehouse=''):
	"""Export aggregated BatCom report data to Excel"""
	if isinstance(filters, str):
		filters = json.loads(filters)
	
	if not filters:
		filters = {}
	
	try:
		# Fetch and process data
		batcom_warehouses = config.get_warehouses()
		
		if not batcom_warehouses:
			return {
				"success": False,
				"error": "No BatCom warehouses found in the system"
			}
		
		all_data = fetch_batch_balance_data(
			report_name="BatCom Aggregated Report",
			company=filters.get("company") or frappe.defaults.get_user_default("Company"),
			warehouses=batcom_warehouses,
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
		all_data, excluded_count = exclude_batches(all_data, "BatCom Aggregated Report")
		
		# Filter by item groups
		item_groups = config.get_item_groups()
		filtered_data = filter_by_item_groups_pandas(all_data, item_groups)
		
		# Filter by warehouse if specified
		if warehouse and warehouse != '':
			filtered_data = [row for row in filtered_data if row.get('warehouse') == warehouse]
		
		# Aggregate using BatCom-specific common code extraction
		aggregated_result = aggregate_by_common_code(filtered_data, report_type="BatCom")
		
		# Export to Excel using common module
		return export_aggregated_data_to_excel(
			data=aggregated_result.get("data", []),
			grand_total=aggregated_result.get("grand_total", {}),
			report_title="BatCom Aggregated Report",
			filters=filters,
			warehouse_filter=warehouse,
			item_groups=["Batch", "Master Batch", "Compound"]
		)
		
	except Exception as e:
		frappe.log_error(
			f"Error exporting to Excel: {str(e)}\n{frappe.get_traceback()}",
			"BatCom Aggregated Report - Export Error"
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
item_groups=["Batch", "Master Batch", "Compound"]
)


@frappe.whitelist()
def get_child_warehouses_api(warehouse):
	"""
	Get all child warehouses for a parent warehouse.
	Wrapper for the common module function.
	"""
	return get_child_warehouses(warehouse)
