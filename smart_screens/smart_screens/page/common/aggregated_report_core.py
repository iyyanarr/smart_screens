"""
Core aggregation logic for aggregated reports
Shared business logic for SPP and BatCom aggregated reports
"""
import frappe
import json
import pandas as pd
import time

def expand_parent_warehouses(warehouse_list):
	"""
Expand parent/group warehouses to include all their child warehouses.

Args:
warehouse_list: List of warehouse names (may include parent warehouses)

Returns:
list: Expanded list including all child warehouses
"""
	expanded_warehouses = []
	
	for warehouse in warehouse_list:
		# Always add the warehouse itself
		expanded_warehouses.append(warehouse)
		
		# Check if this warehouse has children
		child_warehouses = frappe.get_all(
"Warehouse",
filters={"parent_warehouse": warehouse},
pluck="name"
)
		
		if child_warehouses:
			frappe.logger().info(
f"Warehouse '{warehouse}' is a parent with {len(child_warehouses)} children: {child_warehouses}"
)
			# Add all child warehouses
			expanded_warehouses.extend(child_warehouses)
			
			# Recursively check if any children have their own children
			for child in child_warehouses:
				grandchildren = frappe.get_all(
"Warehouse",
filters={"parent_warehouse": child},
pluck="name"
)
				if grandchildren:
					expanded_warehouses.extend(grandchildren)
	
	# Remove duplicates while preserving order
	seen = set()
	result = []
	for wh in expanded_warehouses:
		if wh not in seen:
			seen.add(wh)
			result.append(wh)
	
	frappe.logger().info(
f"Warehouse expansion: {len(warehouse_list)} → {len(result)} warehouses"
)
	
	return result


def fetch_batch_balance_data(report_name, company, warehouses, item_code=None, item_group=None, start_date=None, end_date=None):
	"""
Fetch data using SPP Batch Balance Report (Custom Report)

Args:
report_name: Name of the calling report (for logging)
company: Company name
warehouses: List of warehouse names
item_code: Optional item code filter
item_group: Optional item group filter
start_date: Optional start date filter
end_date: Optional end date filter

Returns:
list: List of batch balance records as dictionaries
"""
	try:
		# Expand child warehouses
		expanded_warehouses = []
		for warehouse in warehouses:
			expanded_warehouses.extend(expand_parent_warehouses([warehouse]))
		
		frappe.logger().info(f"{report_name}: Fetching SPP Batch Balance Report for {len(expanded_warehouses)} warehouses...")
		
		# Build filters
		filters = {
			"company": company,
			"warehouse": expanded_warehouses,
		}
		
		if item_code:
			filters["item_code"] = item_code
		if item_group:
			filters["item_group"] = item_group
		if start_date:
			filters["from_date"] = start_date
		if end_date:
			filters["to_date"] = end_date
		
		frappe.logger().info(f"Report Filters: {json.dumps(filters, default=str)}")
		
		# Check if the report exists
		if not frappe.db.exists("Report", "SPP Batch Balance Report"):
			error_msg = "Report 'SPP Batch Balance Report' does not exist in the system"
			frappe.log_error(error_msg, f"{report_name} - Report Not Found")
			frappe.logger().error(error_msg)
			return []
		
		# Get the SPP Batch Balance Report
		report = frappe.get_doc("Report", "SPP Batch Balance Report")
		
		# Execute report
		frappe.logger().info(f"Executing SPP Batch Balance Report...")
		start_time = frappe.utils.now()
		
		try:
			columns, data = report.get_data(
filters=filters,
as_dict=True,
ignore_prepared_report=True,
are_default_filters=False
)
			
			execution_time = frappe.utils.time_diff_in_seconds(frappe.utils.now(), start_time)
			frappe.logger().info(f"SPP Batch Balance Report executed in {execution_time:.2f} seconds, returned {len(data) if data else 0} rows")
			
			# Filter data by warehouses AFTER fetching
			if data and len(data) > 0:
				# Ensure data is in dict format
				if data and not isinstance(data[0], dict):
					column_names = [col.get('fieldname') for col in columns] if columns else []
					if column_names:
						dict_data = []
						for row in data:
							row_dict = {}
							for idx, col_name in enumerate(column_names):
								if idx < len(row):
									row_dict[col_name] = row[idx]
							dict_data.append(row_dict)
						data = dict_data
				
				# Filter by warehouse
				original_count = len(data)
				warehouse_set = set(expanded_warehouses)
				
				filtered_data = []
				for row in data:
					row_warehouse = row.get('warehouse') if isinstance(row, dict) else None
					if row_warehouse and row_warehouse in warehouse_set:
						filtered_data.append(row)
				
				frappe.logger().info(
f"Warehouse filtering: {original_count} rows → {len(filtered_data)} rows"
)
				
				data = filtered_data
			
			return data
			
		except AttributeError as ae:
			error_msg = f"Report 'SPP Batch Balance Report' does not have get_data() method: {str(ae)}"
			frappe.log_error(error_msg, f"{report_name} - Report Method Error")
			frappe.logger().error(error_msg)
			return []
		
	except Exception as e:
		frappe.log_error(
f"Error fetching SPP Batch Balance Report: {str(e)}\n{frappe.get_traceback()}",
f"{report_name} - Data Fetch Error"
)
		return []


def filter_by_item_groups_pandas(data, item_groups):
	"""
	Filter data using pandas to only include items from specified item groups

	Args:
		data: List of batch records
		item_groups: List of item group names to include

	Returns:
		list: Filtered list of batch records
	"""
	if not data:
		return []
	
	try:
		# Pre-clean data to avoid __array_struct__ errors
		cleaned_data = []
		for row in data:
			if not row or not isinstance(row, dict):
				continue
			
			clean_row = {}
			for key, value in row.items():
				# Convert problematic types to basic Python types
				if value is None:
					clean_row[key] = None
				elif hasattr(value, 'isoformat'):  # datetime objects
					clean_row[key] = str(value)
				elif isinstance(value, (list, tuple)):
					clean_row[key] = str(value)
				else:
					clean_row[key] = value
			
			cleaned_data.append(clean_row)
		
		if not cleaned_data:
			return []
		
		# Convert cleaned data to pandas DataFrame
		df = pd.DataFrame(cleaned_data)
		
		# Filter by item_group
		if 'item_group' in df.columns:
			filtered_df = df[df['item_group'].isin(item_groups)]
		else:
			frappe.log_error(
				f"Column 'item_group' not found in data. Available columns: {df.columns.tolist()}",
				"Aggregated Report - Missing Column"
			)
			return []
		
		# Convert back to list of dictionaries
		result = filtered_df.to_dict(orient='records')
		
		# Final cleanup: Convert any remaining pandas types to Python types
		for row in result:
			for key, value in row.items():
				if pd.isna(value):
					row[key] = None
				elif isinstance(value, pd.Timestamp):
					row[key] = str(value)
				elif isinstance(value, (pd.Int64Dtype, pd.Float64Dtype)):
					row[key] = float(value) if not pd.isna(value) else None
		
		return result
		
	except Exception as e:
		frappe.log_error(
			f"Pandas filtering failed: {str(e)}\n{frappe.get_traceback()}",
			"Aggregated Report - Pandas Error"
		)
		
		# Fallback: Use plain Python filtering
		filtered_data = []
		for row in data:
			if not row or not isinstance(row, dict):
				continue
			
			item_group = row.get("item_group", "")
			if item_group in item_groups:
				filtered_data.append(row)
		
		return filtered_data


def exclude_batches(data, report_name="Aggregated Report"):
	"""
Exclude batches that are marked as excluded in the Excluded Stock Batch doctype

Args:
data: List of batch records
report_name: Name of the report (for logging)

Returns:
tuple: (filtered_data, excluded_count)
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
		
		frappe.logger().info(
f"{report_name}: Excluded {excluded_count} batch records"
)
		
		return filtered_data, excluded_count
		
	except Exception as e:
		frappe.log_error(
f"Error excluding batches: {str(e)}\n{frappe.get_traceback()}",
f"{report_name} - Batch Exclusion Error"
)
		# Return original data if exclusion fails
		return data, 0


def aggregate_by_common_code(data):
	"""
	Aggregate batch balance data by common code and stage (item groups)
	Returns aggregated data with one row per common_code
	
	Args:
		data: List of batch records (already cleaned and converted)
	
	Returns:
		dict: {"data": [...], "grand_total": {...}}
	"""
	if not data:
		return {"data": [], "grand_total": {}}
	
	try:
			# DIAGNOSTIC: Log sample Mat data BEFORE aggregation
		mat_samples_before = [row for row in data if row.get('item_group') == 'Mat'][:3]
		if mat_samples_before:
			frappe.logger().info(
				f"=== MAT DATA BEFORE AGGREGATION (first 3 records) ===\n" +
				"\n".join([
					f"Batch: {row.get('batch')}, Item: {row.get('item')}, "
					f"Opening: {row.get('opening_qty')}, Balance: {row.get('balance_qty')}, "
					f"Converted: {row.get('converted', 'N/A')}, Factor: {row.get('conversion_factor', 'N/A')}"
					for row in mat_samples_before
				])
			)
		
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
		
		# Create DataFrame from cleaned data
		df = pd.DataFrame(processed_data)
		
			# DIAGNOSTIC: Log Mat data in DataFrame before aggregation
		if 'item_group' in df.columns:
			mat_df = df[df['item_group'] == 'Mat'][['item', 'batch', 'opening_qty', 'balance_qty']].head(3)
			if not mat_df.empty:
				frappe.logger().info(
					f"=== MAT DATAFRAME BEFORE AGGREGATION ===\n{mat_df.to_string()}"
				)
		
		# Extract common_code from item code
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
				"Aggregated Report - Aggregation Warning"
			)
			return {"data": [], "grand_total": {}}
		
		# Normalize item_group (Finished Products → Finished Product)
		df['item_group'] = df['item_group'].replace('Finished Products', 'Finished Product')
		
		# Convert quantity columns to numeric
		qty_columns = ['opening_qty', 'in_qty', 'out_qty', 'balance_qty', 'balance_value']
		for col in qty_columns:
			if col in df.columns:
				df[col] = pd.to_numeric(df[col], errors='coerce').fillna(0)
		
		# Track warehouses for each common_code
		warehouse_tracking = {}
		for common_code in df['common_code'].unique():
			code_data = df[df['common_code'] == common_code]
			warehouses = code_data['warehouse'].dropna().unique().tolist()
			warehouse_tracking[common_code] = warehouses
		
		# Get unique item groups in the data
		unique_item_groups = df['item_group'].unique().tolist()
		
			# DIAGNOSTIC: Log Mat data by common_code before groupby
		if 'Mat' in unique_item_groups:
			mat_by_code = df[df['item_group'] == 'Mat'].groupby('common_code').agg({
				'opening_qty': ['sum', 'count'],
				'balance_qty': 'sum'
			}).head(3)
			frappe.logger().info(
				f"=== MAT BY COMMON_CODE (before groupby) ===\n{mat_by_code.to_string()}"
			)
		
		# Aggregate by common_code and item_group
		aggregated = df.groupby(['common_code', 'item_group']).agg({
			'opening_qty': 'sum',
			'in_qty': 'sum',
			'out_qty': 'sum',
			'balance_qty': 'sum',
			'balance_value': 'sum'
		}).reset_index()
		
			# DIAGNOSTIC: Log Mat data AFTER aggregation
		mat_aggregated = aggregated[aggregated['item_group'] == 'Mat'].head(5)
		if not mat_aggregated.empty:
			frappe.logger().info(
				f"=== MAT DATA AFTER AGGREGATION (first 5 codes) ===\n{mat_aggregated.to_string()}"
			)
		
		result = []
		
		# Initialize grand_total with all unique item groups found
		grand_total = {}
		for item_group in unique_item_groups:
			grand_total[item_group] = {"opening_qty": 0, "in_qty": 0, "out_qty": 0, "balance_qty": 0}
		grand_total["Total"] = {"opening_qty": 0, "in_qty": 0, "out_qty": 0, "balance_qty": 0}
		
		for common_code in aggregated['common_code'].unique():
			code_data = aggregated[aggregated['common_code'] == common_code]
			
			row = {
				"common_code": common_code,
				"warehouses": warehouse_tracking.get(common_code, []),
				"Total": {"opening_qty": 0, "in_qty": 0, "out_qty": 0, "balance_qty": 0}
			}
			
			# Initialize all item groups for this row
			for item_group in unique_item_groups:
				row[item_group] = {"opening_qty": 0, "in_qty": 0, "out_qty": 0, "balance_qty": 0}
			
			for _, group_row in code_data.iterrows():
				item_group = group_row['item_group']
				
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
			"Aggregated Report - Aggregation Error"
		)
		return {"data": [], "grand_total": {}}


@frappe.whitelist()
def get_child_warehouses(warehouse):
	"""
Get all child warehouses for a parent warehouse, including the warehouse itself.

Args:
warehouse: Warehouse name (can be parent or child warehouse)

Returns:
list: List of warehouse names including the parent and all children
"""
	if not warehouse:
		return []

	try:
		warehouses = expand_parent_warehouses([warehouse])

		frappe.logger().info(
			f"Warehouse '{warehouse}' expanded to {len(warehouses)} warehouses: {warehouses}"
		)

		return warehouses

	except Exception as e:
		frappe.log_error(
			f"Error getting child warehouses for '{warehouse}': {str(e)}\n{frappe.get_traceback()}",
			"Aggregated Report - Get Child Warehouses Error"
		)
		return [warehouse]
