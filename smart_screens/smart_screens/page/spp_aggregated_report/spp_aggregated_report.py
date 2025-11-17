import frappe
from frappe import _
import json
import pandas as pd
import time  # NEW: Add time module for profiling

def get_spp_warehouses():
	"""
	Get list of all SPP warehouses for aggregation
	
	Includes:
	- U2-Store - SPP INDIA
	- U1-Store - SPP INDIA
	- Unit-1 Transit Store - SPP INDIA
	- Deflashing Vendors - SPP INDIA (parent warehouse - will auto-include children when queried)
	
	Returns:
		list: List of warehouse names
	"""
	warehouses = [
		"U2-Store - SPP INDIA",
		"U1-Store - SPP INDIA",
		"Unit-1 Transit Store - SPP INDIA",
		"Deflashing Vendors - SPP INDIA"
	]
	
	# Verify warehouses exist
	existing_warehouses = []
	for wh in warehouses:
		if frappe.db.exists("Warehouse", wh):
			existing_warehouses.append(wh)
		else:
			frappe.log_error(
				f"Warehouse '{wh}' not found in system",
				"SPP Aggregated Report - Warehouse Missing"
			)
	
	frappe.logger().info(
		f"SPP Aggregated Report using {len(existing_warehouses)} warehouses: {existing_warehouses}"
	)
	
	return existing_warehouses


@frappe.whitelist()
def get_spp_batch_balance_data(filters=None):
	"""
	Get data from SPP Batch Balance Report API endpoint
	This is the main data source for the SPP Aggregated Report
	
	NEW: Now aggregates across multiple SPP warehouses:
	- U2-Store - SPP INDIA
	- U1-Store - SPP INDIA
	- Unit-1 Transit Store - SPP INDIA
	- Deflashing Vendors - SPP INDIA (all child warehouses)
	"""
	# START PROFILING
	start_time = time.time()
	performance_log = {}
	
	if isinstance(filters, str):
		filters = json.loads(filters)
	
	if not filters:
		filters = {}
	
	try:
		# Get all SPP warehouses (hardcoded list + Deflashing Vendors children)
		spp_warehouses = get_spp_warehouses()
		
		if not spp_warehouses:
			return {
				"success": False,
				"error": "No SPP warehouses found in the system. Please check warehouse configuration.",
				"data": [],
				"performance": performance_log
			}
		
		# STEP 1: Fetching data from SPP Batch Balance Report
		frappe.publish_realtime(
			'spp_aggregated_progress',
			{'step': 1, 'total': 4, 'message': f'Fetching batch data from {len(spp_warehouses)} warehouses...', 'percent': 10},
			user=frappe.session.user
		)
		
		# Aggregate data from all warehouses
		all_data = []
		t1 = time.time()
		
		for warehouse in spp_warehouses:
			# Prepare filters for SPP Batch Balance Report
			report_filters = {
				"company": filters.get("company") or frappe.defaults.get_user_default("Company"),
				"from_date": filters.get("from_date"),
				"to_date": filters.get("to_date"),
				"warehouse": warehouse,
				"item_group": filters.get("item_group") or ""
			}
			
			# Call the SPP Batch Balance Report
			report = frappe.get_doc("Report", "SPP Batch Balance Report")
			
			try:
				columns, data = report.get_data(
					limit=0,  # No limit, get all data
					user=frappe.session.user,
					filters=report_filters,
					as_dict=True,
					ignore_prepared_report=True,
					are_default_filters=False,
				)
				
				if data:
					all_data.extend(data)
					
			except Exception as wh_error:
				frappe.log_error(
					f"Error fetching data for warehouse {warehouse}: {str(wh_error)}",
					"SPP Aggregated Report - Warehouse Fetch Error"
				)
				# Continue with other warehouses
				continue
		
		t2 = time.time()
		performance_log['spp_report_fetch'] = round(t2 - t1, 2)
		
		frappe.publish_realtime(
			'spp_aggregated_progress',
			{'step': 1, 'total': 4, 'message': f'Fetched {len(all_data)} batch records from {len(spp_warehouses)} warehouses', 'percent': 30},
			user=frappe.session.user
		)
		
		frappe.log_error(
			f"⏱️ PERFORMANCE PROFILING:\n"
			f"Step 1 - SPP Report Fetch: {performance_log['spp_report_fetch']}s\n"
			f"Warehouses queried: {len(spp_warehouses)}\n"
			f"Raw data records: {len(all_data)}",
			"SPP Aggregated - Performance Profile"
		)
		
		if not all_data:
			return {
				"success": False,
				"error": "No data returned from SPP Batch Balance Report for any warehouse",
				"data": [],
				"performance": performance_log
			}
		
		# STEP 2: Excluding batches
		frappe.publish_realtime(
			'spp_aggregated_progress',
			{'step': 2, 'total': 4, 'message': 'Processing batch exclusions...', 'percent': 50},
			user=frappe.session.user
		)
		
		# EXCLUDE BATCHES - Get excluded batch list from Excluded Stock Batch doctype
		t3 = time.time()
		all_data, excluded_count = exclude_batches(all_data)
		t4 = time.time()
		performance_log['batch_exclusion'] = round(t4 - t3, 2)
		
		frappe.publish_realtime(
			'spp_aggregated_progress',
			{'step': 2, 'total': 4, 'message': f'Excluded {excluded_count} batches', 'percent': 60},
			user=frappe.session.user
		)
		
		frappe.log_error(
			f"Step 2 - Batch Exclusion: {performance_log['batch_exclusion']}s\n"
			f"Records after exclusion: {len(all_data)} (excluded: {excluded_count})",
			"SPP Aggregated - Performance Profile"
		)
		
		# STEP 3: Filtering by item groups
		frappe.publish_realtime(
			'spp_aggregated_progress',
			{'step': 3, 'total': 4, 'message': 'Filtering by item groups (Mat, Products, Finished)...', 'percent': 70},
			user=frappe.session.user
		)
		
		# FILTER DATA using pandas
		t5 = time.time()
		filtered_data = filter_by_item_groups_pandas(all_data)
		t6 = time.time()
		performance_log['item_group_filtering'] = round(t6 - t5, 2)
		
		frappe.publish_realtime(
			'spp_aggregated_progress',
			{'step': 3, 'total': 4, 'message': f'Filtered to {len(filtered_data)} records', 'percent': 80},
			user=frappe.session.user
		)
		
		frappe.log_error(
			f"Step 3 - Item Group Filtering: {performance_log['item_group_filtering']}s\n"
			f"Records after filtering: {len(filtered_data)}",
			"SPP Aggregated - Performance Profile"
		)
		
		# STEP 4: Aggregating data
		frappe.publish_realtime(
			'spp_aggregated_progress',
			{'step': 4, 'total': 4, 'message': 'Aggregating data by common code...', 'percent': 90},
			user=frappe.session.user
		)
		
		# AGGREGATE DATA by common code and stage
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
		
		frappe.log_error(
			f"Step 4 - Aggregation: {performance_log['aggregation']}s\n"
			f"Aggregated records: {len(aggregated_data['data'])}\n\n"
			f"📊 TOTAL TIME: {total_time}s\n"
			f"   - SPP Report Fetch: {performance_log['spp_report_fetch']}s ({round(performance_log['spp_report_fetch']/total_time*100, 1)}%)\n"
			f"   - Batch Exclusion: {performance_log['batch_exclusion']}s ({round(performance_log['batch_exclusion']/total_time*100, 1)}%)\n"
			f"   - Item Filtering: {performance_log['item_group_filtering']}s ({round(performance_log['item_group_filtering']/total_time*100, 1)}%)\n"
			f"   - Aggregation: {performance_log['aggregation']}s ({round(performance_log['aggregation']/total_time*100, 1)}%)",
			"SPP Aggregated - Performance Profile"
		)
		
		return {
			"success": True,
			"data": aggregated_data["data"],
			"grand_total": aggregated_data["grand_total"],
			"columns": columns,
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
			f"Error calling SPP Batch Balance Report: {str(e)}\n{frappe.get_traceback()}",
			"SPP Aggregated Report Error"
		)
		return {
			"success": False,
			"error": str(e),
			"data": []
		}

@frappe.whitelist()
def get_batch_details_by_common_code(common_code, filters=None):
	"""
	Get detailed batch records for a specific common code
	Returns data grouped by item group (Mat, Products, Finished Product)
	
	NEW: Now shows batches from ALL SPP warehouses (warehouse column visible)
	"""
	if isinstance(filters, str):
		filters = json.loads(filters)
	
	if not filters:
		filters = {}
	
	try:
		# Get all SPP warehouses
		spp_warehouses = get_spp_warehouses()
		
		if not spp_warehouses:
			return {
				"success": False,
				"error": "No SPP warehouses found in the system",
				"batches": {"Mat": [], "Products": [], "Finished Product": []}
			}
		
		# Aggregate batch data from all warehouses
		all_batches_data = []
		
		for warehouse in spp_warehouses:
			# Prepare filters for SPP Batch Balance Report
			report_filters = {
				"company": filters.get("company") or frappe.defaults.get_user_default("Company"),
				"from_date": filters.get("from_date"),
				"to_date": filters.get("to_date"),
				"warehouse": warehouse,
				"item_group": filters.get("item_group") or ""
			}
			
			# Call the SPP Batch Balance Report
			report = frappe.get_doc("Report", "SPP Batch Balance Report")
			
			try:
				columns, data = report.get_data(
					limit=0,
					user=frappe.session.user,
					filters=report_filters,
					as_dict=True,
					ignore_prepared_report=True,
					are_default_filters=False,
				)
				
				if data:
					all_batches_data.extend(data)
					
			except Exception as wh_error:
				frappe.log_error(
					f"Error fetching batch details for warehouse {warehouse}: {str(wh_error)}",
					"SPP Aggregated Report - Batch Details Warehouse Error"
				)
				continue
		
		if not all_batches_data:
			return {
				"success": False,
				"error": "No data returned from SPP Batch Balance Report",
				"batches": {"Mat": [], "Products": [], "Finished Product": []}
			}
		
		# EXCLUDE BATCHES from batch details as well
		all_batches_data, excluded_count = exclude_batches(all_batches_data)
		
		# Filter by item groups
		filtered_data = filter_by_item_groups_pandas(all_batches_data)
		
		# Extract common_code and filter by the requested common_code
		batches_by_group = {
			"Mat": [],
			"Products": [],
			"Finished Product": []
		}
		
		for row in filtered_data:
			item_code = row.get("item", "")
			
			# Extract common_code from item code
			extracted_code = None
			if item_code.startswith('t.'):
				extracted_code = item_code[-4:] if len(item_code) >= 4 else None
			else:
				extracted_code = item_code[1:5] if len(item_code) >= 5 else None
			
			# Check if this row matches the requested common_code
			if extracted_code == str(common_code):
				item_group = row.get("item_group", "")
				
				# Normalize item_group
				if item_group == "Finished Products":
					item_group = "Finished Product"
				
				# Add to appropriate group
				if item_group in batches_by_group:
					batches_by_group[item_group].append(row)
		
		# Count totals
		total_batches = sum(len(batches) for batches in batches_by_group.values())
		
		return {
			"success": True,
			"common_code": common_code,
			"batches": batches_by_group,
			"total_batches": total_batches,
			"mat_count": len(batches_by_group["Mat"]),
			"products_count": len(batches_by_group["Products"]),
			"finished_count": len(batches_by_group["Finished Product"]),
			"warehouses_included": spp_warehouses
		}
		
	except Exception as e:
		frappe.log_error(
			f"Error getting batch details for common_code {common_code}: {str(e)}\n{frappe.get_traceback()}",
			"SPP Aggregated Report - Batch Details Error"
		)
		return {
			"success": False,
			"error": str(e),
			"batches": {"Mat": [], "Products": [], "Finished Product": []}
		}

def filter_by_item_groups_pandas(data):
	"""
	Filter data using pandas to only include items from: Mat, Products, Finished Product
	"""
	# Check if data is empty
	if not data:
		return []
	
	try:
		# Convert data to pandas DataFrame, handling dates and other objects
		df = pd.DataFrame(data)
		
		# Define target item groups
		target_groups = ["Mat", "Products", "Finished Product", "Finished Products"]
		
		# Filter by item_group
		if 'item_group' in df.columns:
			filtered_df = df[df['item_group'].isin(target_groups)]
		else:
			frappe.log_error(
				f"Column 'item_group' not found in data. Available columns: {df.columns.tolist()}",
				"SPP Aggregated Report - Missing Column"
			)
			return []
		
		# Convert back to list of dictionaries
		result = filtered_df.to_dict(orient='records')
		
		# Convert datetime objects to strings for JSON serialization
		for row in result:
			for key, value in row.items():
				if pd.isna(value):
					row[key] = None
				elif isinstance(value, (pd.Timestamp, pd.DatetimeTZDtype)):
					row[key] = str(value)
		
		return result
		
	except Exception as e:
		frappe.log_error(
			f"Pandas filtering failed: {str(e)}\nFalling back to Python filtering",
			"SPP Aggregated Report - Pandas Error"
		)
		
		# Fallback: Use plain Python filtering
		target_groups = ["Mat", "Products", "Finished Product", "Finished Products"]
		filtered_data = []
		
		for row in data:
			if not row or not isinstance(row, dict):
				continue
			
			item_group = row.get("item_group", "")
			if item_group in target_groups:
				filtered_data.append(row)
		
		return filtered_data


def aggregate_by_common_code(data):
	"""
	Aggregate batch balance data by common code and stage (Mat/Products/Finished Product)
	Returns aggregated data with one row per common_code
	"""
	if not data:
		return {"data": [], "grand_total": {}}
	
	try:
		# Pre-process data to convert datetime objects to strings
		processed_data = []
		for row in data:
			if not row or not isinstance(row, dict):
				continue
			
			# Create a copy of the row and convert datetime objects
			clean_row = {}
			for key, value in row.items():
				if value is None or pd.isna(value):
					clean_row[key] = None
				elif hasattr(value, 'isoformat'):  # datetime object
					clean_row[key] = str(value)
				else:
					clean_row[key] = value
			
			processed_data.append(clean_row)
		
		if not processed_data:
			return {"data": [], "grand_total": {}}
		
		# Now create DataFrame from cleaned data
		df = pd.DataFrame(processed_data)
		
		# Extract common_code from item code
		# Pattern 1: F5035, P5035, T5035 → Extract last 4 digits
		# Pattern 2: t.F5035, t.P5035, t.T5035 → Extract last 4 digits
		def extract_common_code(item_code):
			if not item_code:
				return None
			item_code = str(item_code)
			if item_code.startswith('t.'):
				# Pattern: t.F5035 → 5035
				return item_code[-4:] if len(item_code) >= 4 else None
			else:
				# Pattern: F5035 → 5035
				return item_code[1:5] if len(item_code) >= 5 else None
		
		df['common_code'] = df['item'].apply(extract_common_code)
		
		# Remove rows where common_code couldn't be extracted
		df = df[df['common_code'].notna()]
		
		if df.empty:
			frappe.log_error(
				"No valid common_codes extracted from items",
				"SPP Aggregated Report - Aggregation Warning"
			)
			return {"data": [], "grand_total": {}}
		
		# Normalize item_group (Finished Products → Finished Product)
		df['item_group'] = df['item_group'].replace('Finished Products', 'Finished Product')
		
		# Convert quantity columns to numeric
		qty_columns = ['opening_qty', 'in_qty', 'out_qty', 'balance_qty', 'balance_value']
		for col in qty_columns:
			if col in df.columns:
				df[col] = pd.to_numeric(df[col], errors='coerce').fillna(0)
		
		# Aggregate by common_code and item_group
		aggregated = df.groupby(['common_code', 'item_group']).agg({
			'opening_qty': 'sum',
			'in_qty': 'sum',
			'out_qty': 'sum',
			'balance_qty': 'sum',
			'balance_value': 'sum'
		}).reset_index()
		
		# Pivot to get Mat, Products, Finished Product as columns
		result = []
		grand_total = {
			"Mat": {"opening_qty": 0, "in_qty": 0, "out_qty": 0, "balance_qty": 0},
			"Products": {"opening_qty": 0, "in_qty": 0, "out_qty": 0, "balance_qty": 0},
			"Finished Product": {"opening_qty": 0, "in_qty": 0, "out_qty": 0, "balance_qty": 0},
			"Total": {"opening_qty": 0, "in_qty": 0, "out_qty": 0, "balance_qty": 0}
		}
		
		for common_code in aggregated['common_code'].unique():
			code_data = aggregated[aggregated['common_code'] == common_code]
			
			row = {
				"common_code": common_code,
				"Mat": {"opening_qty": 0, "in_qty": 0, "out_qty": 0, "balance_qty": 0},
				"Products": {"opening_qty": 0, "in_qty": 0, "out_qty": 0, "balance_qty": 0},
				"Finished Product": {"opening_qty": 0, "in_qty": 0, "out_qty": 0, "balance_qty": 0},
				"Total": {"opening_qty": 0, "in_qty": 0, "out_qty": 0, "balance_qty": 0}
			}
			
			for _, group_row in code_data.iterrows():
				item_group = group_row['item_group']
				if item_group in row:
					row[item_group] = {
						"opening_qty": float(group_row['opening_qty']),
						"in_qty": float(group_row['in_qty']),
						"out_qty": float(group_row['out_qty']),
						"balance_qty": float(group_row['balance_qty'])
					}
					
					# Add to totals
					row["Total"]["opening_qty"] += float(group_row['opening_qty'])
					row["Total"]["in_qty"] += float(group_row['in_qty'])
					row["Total"]["out_qty"] += float(group_row['out_qty'])
					row["Total"]["balance_qty"] += float(group_row['balance_qty'])
					
					# Add to grand totals
					grand_total[item_group]["opening_qty"] += float(group_row['opening_qty'])
					grand_total[item_group]["in_qty"] += float(group_row['in_qty'])
					grand_total[item_group]["out_qty"] += float(group_row['out_qty'])
					grand_total[item_group]["balance_qty"] += float(group_row['balance_qty'])
					
					grand_total["Total"]["opening_qty"] += float(group_row['opening_qty'])
					grand_total["Total"]["in_qty"] += float(group_row['in_qty'])
					grand_total["Total"]["out_qty"] += float(group_row['out_qty'])
					grand_total["Total"]["balance_qty"] += float(group_row['balance_qty'])
			
			result.append(row)
		
		# Sort by common_code
		result = sorted(result, key=lambda x: x['common_code'])
		
		return {
			"data": result,
			"grand_total": grand_total
		}
		
	except Exception as e:
		frappe.log_error(
			f"Aggregation failed: {str(e)}\n{frappe.get_traceback()}",
			"SPP Aggregated Report - Aggregation Error"
		)
		return {"data": [], "grand_total": {}}

def exclude_batches(data):
	"""
	Exclude batches that are marked as excluded in the Excluded Stock Batch doctype
	Returns: (filtered_data, excluded_count)
	"""
	if not data:
		return data, 0
	
	try:
		# Get list of excluded batch numbers with status = 'Active'
		excluded_batches = frappe.get_all(
			"Excluded Stock Batch",
			filters={"status": "Active"},
			pluck="batch_no"
		)
		
		if not excluded_batches:
			return data, 0
		
		# Convert to set for faster lookup
		excluded_batch_set = set(excluded_batches)
		
		# Filter out excluded batches
		filtered_data = []
		excluded_count = 0
		
		for row in data:
			if not row or not isinstance(row, dict):
				continue
			
			batch_no = row.get("batch") or row.get("batch_no")
			
			# If batch is in excluded list, skip it
			if batch_no and batch_no in excluded_batch_set:
				excluded_count += 1
				continue
			
			filtered_data.append(row)
		
		frappe.log_error(
			f"Batch Exclusion Summary:\n"
			f"Total excluded batches in system: {len(excluded_batches)}\n"
			f"Records excluded from report: {excluded_count}\n"
			f"Excluded batch numbers: {list(excluded_batches)[:10]}...",
			"SPP Aggregated Report - Batch Exclusion"
		)
		
		return filtered_data, excluded_count
		
	except Exception as e:
		frappe.log_error(
			f"Error excluding batches: {str(e)}\n{frappe.get_traceback()}",
			"SPP Aggregated Report - Batch Exclusion Error"
		)
		# Return original data if exclusion fails
		return data, 0