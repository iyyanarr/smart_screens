"""
Raw Material Aggregated Report
Aggregates Raw Material items across specific warehouses, excluding "Batch" group
"""
import frappe
from frappe import _
import json
import time

# Import common modules
from smart_screens.smart_screens.page.common.report_config import RMReportConfig
from smart_screens.smart_screens.page.common.aggregated_report_core import (
	fetch_batch_balance_data,
	filter_by_item_groups_pandas,
	exclude_batches,
	aggregate_by_common_code,
	get_child_warehouses
)
from smart_screens.smart_screens.page.common.excel_export import (
	export_aggregated_data_to_excel,
	export_batch_details_to_excel
)

# Initialize configuration
config = RMReportConfig()

@frappe.whitelist()
def get_rm_batch_balance_data(filters=None):
	"""Get batch balance data aggregated across RM warehouses"""
	start_time = time.time()
	performance_log = {}
	
	if isinstance(filters, str):
		filters = json.loads(filters)
	
	if not filters:
		filters = {}
	
	try:
		# Get RM warehouses from config
		rm_warehouses = config.get_warehouses()
		
		if not rm_warehouses:
			return {
				"success": False,
				"error": "No RM warehouses found in the system. Please check warehouse configuration.",
				"data": [],
				"performance": performance_log
			}
		
		# STEP 1: Fetch data
		frappe.publish_realtime(
			'rm_aggregated_progress',
			{'step': 1, 'total': 4, 'message': f'Fetching RM batch data from {len(rm_warehouses)} warehouses...', 'percent': 10},
			user=frappe.session.user
		)
		
		t1 = time.time()
		all_data = fetch_batch_balance_data(
			report_name="Raw Material Aggregated Report",
			company=filters.get("company") or frappe.defaults.get_user_default("Company"),
			warehouses=rm_warehouses,
			item_group=filters.get("item_group"),
			start_date=filters.get("from_date"),
			end_date=filters.get("to_date")
		)
		t2 = time.time()
		performance_log['report_fetch'] = round(t2 - t1, 2)
		
		frappe.publish_realtime(
			'rm_aggregated_progress',
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
			'rm_aggregated_progress',
			{'step': 2, 'total': 4, 'message': 'Processing batch exclusions...', 'percent': 50},
			user=frappe.session.user
		)
		
		t3 = time.time()
		all_data, excluded_count = exclude_batches(all_data, "Raw Material Aggregated Report")
		t4 = time.time()
		performance_log['batch_exclusion'] = round(t4 - t3, 2)
		
		# STEP 3: Filter by RM item groups (excluding Batch)
		frappe.publish_realtime(
			'rm_aggregated_progress',
			{'step': 3, 'total': 4, 'message': 'Filtering by RM item groups...', 'percent': 70},
			user=frappe.session.user
		)
		
		t5 = time.time()
		item_groups = config.get_item_groups()
		filtered_data = filter_by_item_groups_pandas(all_data, item_groups)
		t6 = time.time()
		performance_log['item_group_filtering'] = round(t6 - t5, 2)
		
		# STEP 4: Aggregate data by item_code (instead of common code extraction for RM)
		frappe.publish_realtime(
			'rm_aggregated_progress',
			{'step': 4, 'total': 4, 'message': 'Aggregating data by Item Code...', 'percent': 90},
			user=frappe.session.user
		)
		
		t7 = time.time()
		# For Raw Materials, we aggregate by original item code because common code extraction (stripping B_) 
		# might not be appropriate for chemicals and other RM.
		aggregated_data = aggregate_by_item_code_rm(filtered_data)
		t8 = time.time()
		performance_log['aggregation'] = round(t8 - t7, 2)
		
		total_time = round(t8 - start_time, 2)
		performance_log['total_time'] = total_time
		
		frappe.publish_realtime(
			'rm_aggregated_progress',
			{'step': 4, 'total': 4, 'message': f'Completed! Generated {len(aggregated_data["data"])} RM items', 'percent': 100},
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
			"warehouses_used": rm_warehouses,
			"warehouse_count": len(rm_warehouses),
			"performance": performance_log
		}
		
	except Exception as e:
		frappe.log_error(
			f"Error in Raw Material Aggregated Report: {str(e)}\n{frappe.get_traceback()}",
			"RM Aggregated Report Error"
		)
		return {
			"success": False,
			"error": str(e),
			"data": []
		}

def aggregate_by_item_code_rm(data):
	"""Custom aggregation for RM report to include valuation based on Last Purchase Rate"""
	import pandas as pd
	
	if not data:
		return {"data": [], "grand_total": {}}
		
	df = pd.DataFrame(data)
	
	# Ensure required columns exist for grouping to avoid KeyError (e.g., 'stock_uom')
	required_cols = ['item', 'item_name', 'stock_uom', 'item_group']
	for col in required_cols:
		if col not in df.columns:
			df[col] = ""
	
	# Convert numeric columns
	qty_columns = ['opening_qty', 'in_qty', 'out_qty', 'balance_qty', 'balance_value']
	for col in qty_columns:
		if col in df.columns:
			df[col] = pd.to_numeric(df[col], errors='coerce').fillna(0)
		else:
			df[col] = 0.0
	
	# Group by item_code (called 'item' in report data)
	aggregated = df.groupby(['item', 'item_name', 'stock_uom', 'item_group']).agg({
		'opening_qty': 'sum',
		'in_qty': 'sum',
		'out_qty': 'sum',
		'balance_qty': 'sum'
	}).reset_index()
	
	# Fetch Last Purchase Rates for all unique items
	item_codes = aggregated['item'].unique().tolist()
	purchase_rates = get_last_purchase_rates(item_codes)
	
	result = []
	grand_total = {
		"opening_qty": 0, "in_qty": 0, "out_qty": 0, "balance_qty": 0, "balance_value": 0
	}
	
	for _, row in aggregated.iterrows():
		item_code = row['item']
		balance_qty = float(row['balance_qty'])
		
		# Use Last Purchase Rate for valuation
		last_rate = float(purchase_rates.get(item_code, 0))
		valuation = balance_qty * last_rate
		
		item_row = {
			"item_code": item_code,
			"item_name": row['item_name'],
			"stock_uom": row['stock_uom'],
			"item_group": row['item_group'],
			"opening_qty": float(row['opening_qty']),
			"in_qty": float(row['in_qty']),
			"out_qty": float(row['out_qty']),
			"balance_qty": balance_qty,
			"last_purchase_rate": last_rate,
			"balance_value": valuation
		}
		
		# Add to grand totals
		grand_total["opening_qty"] += item_row["opening_qty"]
		grand_total["in_qty"] += item_row["in_qty"]
		grand_total["out_qty"] += item_row["out_qty"]
		grand_total["balance_qty"] += item_row["balance_qty"]
		grand_total["balance_value"] += item_row["balance_value"]
		
		result.append(item_row)
		
	# Sort by item_code
	result = sorted(result, key=lambda x: x['item_code'])
	
	return {
		"data": result,
		"grand_total": grand_total
	}

def get_last_purchase_rates(item_codes):
	"""Fetch the most recent purchase rate for a list of items across PR and PI"""
	if not item_codes:
		return {}
	
	rates = {}
	
	# 1. Check Purchase Receipt Items (more authoritative for stock)
	pr_items = frappe.db.sql("""
		SELECT pri.item_code, pri.base_rate as rate
		FROM `tabPurchase Receipt Item` pri
		JOIN `tabPurchase Receipt` pr ON pri.parent = pr.name
		WHERE pri.item_code IN %s AND pr.docstatus = 1
		ORDER BY pr.posting_date DESC, pr.posting_time DESC
	""", (tuple(item_codes),), as_dict=True)
	
	for row in pr_items:
		if row.item_code not in rates:
			rates[row.item_code] = row.rate
			
	# 2. Check Purchase Invoice Items for remaining items
	remaining = [code for code in item_codes if code not in rates]
	if remaining:
		pi_items = frappe.db.sql("""
			SELECT pii.item_code, pii.base_rate as rate
			FROM `tabPurchase Invoice Item` pii
			JOIN `tabPurchase Invoice` pi ON pii.parent = pi.name
			WHERE pii.item_code IN %s AND pi.docstatus = 1
			ORDER BY pi.posting_date DESC, pi.posting_time DESC
		""", (tuple(remaining),), as_dict=True)
		
		for row in pi_items:
			if row.item_code not in rates:
				rates[row.item_code] = row.rate
				
	return rates

@frappe.whitelist()
def get_batch_details_by_item_code(item_code, filters=None, warehouse=''):
	"""Get detailed batch records for a specific item code in RM context"""
	if isinstance(filters, str):
		filters = json.loads(filters)
	
	if not filters:
		filters = {}
	
	try:
		if warehouse and warehouse != '':
			rm_warehouses = [warehouse]
		else:
			rm_warehouses = config.get_warehouses()
		
		all_batches_data = fetch_batch_balance_data(
			report_name="Raw Material Aggregated Report",
			company=filters.get("company") or frappe.defaults.get_user_default("Company"),
			warehouses=rm_warehouses,
			item_code=item_code,
			start_date=filters.get("from_date"),
			end_date=filters.get("to_date")
		)
		
		if not all_batches_data:
			return {"success": True, "batches": [], "total_batches": 0}
			
		# Exclude batches
		all_batches_data, excluded_count = exclude_batches(all_batches_data, "Raw Material Aggregated Report")
		
		return {
			"success": True,
			"item_code": item_code,
			"batches": all_batches_data,
			"total_batches": len(all_batches_data),
			"warehouses_included": rm_warehouses,
			"warehouse_filter": warehouse
		}
		
	except Exception as e:
		frappe.log_error(f"Error getting RM batch details: {str(e)}", "RM Report Batch Detail Error")
		return {"success": False, "error": str(e), "batches": []}

@frappe.whitelist()
def export_to_excel(filters=None, warehouse='', data=None, grand_total=None):
	"""Export aggregated RM report data to Excel (optimized)"""
	if isinstance(filters, str):
		filters = json.loads(filters)
	
	try:
		# If data is passed from frontend, use it directly (Optimization)
		if data:
			if isinstance(data, str):
				data = json.loads(data)
			if isinstance(grand_total, str):
				grand_total = json.loads(grand_total)
				
			from smart_screens.smart_screens.page.common.excel_export import export_rm_data_to_excel
			return export_rm_data_to_excel(
				data=data,
				grand_total=grand_total,
				report_title="Raw Material Aggregated Report",
				filters=filters,
				warehouse_filter=warehouse
			)

		# Fallback to slow way if data not provided
		rm_warehouses = config.get_warehouses()
		# ... (rest of old slow logic can stay as fallback or be removed, 
		# but since we are optimizing, let's stick to the fast path)
		return {"success": False, "error": "No data provided for export"}
		
	except Exception as e:
		return {"success": False, "error": str(e)}

@frappe.whitelist()
def get_child_warehouses_api(warehouse):
	if warehouse == "GROUP:FCHEM_BINS":
		return frappe.get_all("Warehouse", 
							 filters={"name": ["like", "Fchem Bin%"]},
							 pluck="name")
	return get_child_warehouses(warehouse)
