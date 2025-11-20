import frappe
from frappe import _
import json
import pandas as pd
import time  # NEW: Add time module for profiling
from io import BytesIO

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

def expand_parent_warehouses(warehouse_list):
	"""
	Expand parent/group warehouses to include all their child warehouses.
	This fixes the issue where selecting "Deflashing Vendors - SPP INDIA" 
	(a parent warehouse) would not include any child vendor warehouses.
	
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

def fetch_batch_balance_data(company, warehouses, item_code=None, item_group=None, start_date=None, end_date=None):
	"""
	Fetch data using SPP Batch Balance Report (Custom Report)
	
	OPTIMIZATION: Fetch all data from report, then filter by warehouses in Python
	because the report doesn't properly handle warehouse list filters
	"""
	try:
		# Expand child warehouses
		expanded_warehouses = []
		for warehouse in warehouses:
			expanded_warehouses.extend(expand_parent_warehouses([warehouse]))
		
		frappe.logger().info(f"Fetching SPP Batch Balance Report for {len(expanded_warehouses)} warehouses (expanded from {len(warehouses)})...")
		
		# Pass warehouse filter as list - the report accepts it
		# It will return data as arrays instead of dicts, which we'll convert below
		filters = {
			"company": company,
			"warehouse": expanded_warehouses,  # Pass list - report requires this filter
		}
		
		if item_code:
			filters["item_code"] = item_code
		if item_group:
			filters["item_group"] = item_group
		if start_date:
			filters["from_date"] = start_date
		if end_date:
			filters["to_date"] = end_date
		
		# DEBUG: Log the filters being used
		frappe.logger().info(f"Report Filters: {json.dumps(filters, default=str)}")
		frappe.logger().info(f"Will filter results for warehouses: {expanded_warehouses}")
		
		# Check if the report exists
		if not frappe.db.exists("Report", "SPP Batch Balance Report"):
			error_msg = "Report 'SPP Batch Balance Report' does not exist in the system"
			frappe.log_error(error_msg, "SPP Aggregated Report - Report Not Found")
			frappe.logger().error(error_msg)
			return []
		
		# Get the SPP Batch Balance Report (Custom Report)
		report = frappe.get_doc("Report", "SPP Batch Balance Report")
		
		# DEBUG: Log report details
		frappe.logger().info(f"Report Type: {report.report_type}, Module: {report.module}")
		
		 # Execute report without warehouse filter
		frappe.logger().info(f"Executing SPP Batch Balance Report...")
		start_time = frappe.utils.now()
		
		# Try to execute the report
		try:
			columns, data = report.get_data(
				filters=filters,
				as_dict=True,  # FIXED: Changed to True so report returns dicts instead of arrays
				ignore_prepared_report=True,
				are_default_filters=False
			)
			
			execution_time = frappe.utils.time_diff_in_seconds(frappe.utils.now(), start_time)
			frappe.logger().info(f"SPP Batch Balance Report executed in {execution_time:.2f} seconds, returned {len(data) if data else 0} rows")
			
			# CRITICAL: Filter data by warehouses AFTER fetching
			if data and len(data) > 0:
				# Data should now always be dicts (because as_dict=True)
				# But keep conversion logic as fallback for safety
				if data and not isinstance(data[0], dict):
					# Data is list of lists/tuples - need to convert using column names
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
				
				# Now filter by warehouse
				original_count = len(data)
				warehouse_set = set(expanded_warehouses)
				
				filtered_data = []
				for row in data:
					row_warehouse = row.get('warehouse') if isinstance(row, dict) else None
					if row_warehouse and row_warehouse in warehouse_set:
						filtered_data.append(row)
				
				frappe.logger().info(
					f"Warehouse filtering: {original_count} rows → {len(filtered_data)} rows "
					f"(kept only data from {len(expanded_warehouses)} SPP warehouses)"
				)
				
				data = filtered_data
			
			# If no data returned after filtering, log detailed information
			if not data or len(data) == 0:
				frappe.log_error(
					f"SPP Batch Balance Report returned NO DATA after warehouse filtering\n"
					f"Filters: {json.dumps(filters, default=str)}\n"
					f"Target Warehouses: {expanded_warehouses}\n"
					f"Company: {company}\n"
					f"Report Type: {report.report_type}\n"
					f"Columns returned: {len(columns) if columns else 0}",
					"SPP Aggregated Report - No Data After Filtering"
				)
			
			return data
			
		except AttributeError as ae:
			# The report might not have get_data method
			error_msg = f"Report 'SPP Batch Balance Report' does not have get_data() method or is not properly configured. Error: {str(ae)}"
			frappe.log_error(
				f"{error_msg}\n"
				f"Report Type: {report.report_type}\n"
				f"Report DocType: {report.doctype}\n"
				f"Available methods: {dir(report)}\n"
				f"{frappe.get_traceback()}",
				"SPP Aggregated Report - Report Method Error"
			)
			frappe.logger().error(error_msg)
			return []
		
	except Exception as e:
		frappe.log_error(
			f"Error fetching SPP Batch Balance Report: {str(e)}\n"
			f"Filters used: {json.dumps(filters if 'filters' in locals() else {}, default=str)}\n"
			f"Warehouses: {expanded_warehouses if 'expanded_warehouses' in locals() else warehouses}\n"
			f"{frappe.get_traceback()}",
			"SPP Aggregated Report - SPP Batch Balance Error"
		)
		return []

@frappe.whitelist()
def get_spp_batch_balance_data(filters=None):
	"""
	Get batch balance data aggregated across multiple SPP warehouses
	Returns both raw filtered data (for warehouse-wise filtering) and aggregated data
	
	Aggregates data from:
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
		# Get all SPP warehouses
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
		
		# Fetch data using SPP Batch Balance Report
		t1 = time.time()
		all_data = fetch_batch_balance_data(
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
			{'step': 1, 'total': 4, 'message': f'Fetched {len(all_data)} batch records from {len(spp_warehouses)} warehouses', 'percent': 30},
			user=frappe.session.user
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
		
		t3 = time.time()
		all_data, excluded_count = exclude_batches(all_data)
		t4 = time.time()
		performance_log['batch_exclusion'] = round(t4 - t3, 2)
		
		# STEP 3: Filtering by item groups
		frappe.publish_realtime(
			'spp_aggregated_progress',
			{'step': 3, 'total': 4, 'message': 'Filtering by item groups (Mat, Products, Finished)...', 'percent': 70},
			user=frappe.session.user
		)
		
		t5 = time.time()
		filtered_data = filter_by_item_groups_pandas(all_data)
		t6 = time.time()
		performance_log['item_group_filtering'] = round(t6 - t5, 2)
		
		# STEP 4: Aggregating data (across ALL warehouses by default)
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
		
		# NEW: Return both raw filtered data AND aggregated data
		# Frontend will use raw data to re-aggregate by warehouse when filter changes
		return {
			"success": True,
			"data": aggregated_data["data"],
			"grand_total": aggregated_data["grand_total"],
			"raw_filtered_data": filtered_data,  # NEW: Send raw data for client-side re-aggregation
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
def get_batch_details_by_common_code(common_code, filters=None, warehouse=''):
	"""
	Get detailed batch records for a specific common code
	Returns data grouped by item group (Mat, Products, Finished Product)
	Uses Batch-Wise Balance History report as the data source
	Can optionally filter by a specific warehouse
	"""
	if isinstance(filters, str):
		filters = json.loads(filters)
	
	if not filters:
		filters = {}
	
	try:
		# Get all SPP warehouses or filter by specific warehouse
		if warehouse and warehouse != '':
			# User selected a specific warehouse - only query that one
			spp_warehouses = [warehouse]
		else:
			# No warehouse filter - get all SPP warehouses
			spp_warehouses = get_spp_warehouses()
		
		if not spp_warehouses:
			return {
				"success": False,
				"error": "No SPP warehouses found in the system",
				"batches": {"Mat": [], "Products": [], "Finished Product": []}
			}
		
		# Fetch data using Batch-Wise Balance History report
		all_batches_data = fetch_batch_balance_data(
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
			"warehouses_included": spp_warehouses,
			"warehouse_filter": warehouse  # NEW: Return the warehouse filter that was applied
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

@frappe.whitelist()
def export_to_excel(filters=None, warehouse=''):
	"""
	Export aggregated SPP report data to Excel with formatting
	
	Args:
		filters: Report filters (from_date, to_date, company, item_group)
		warehouse: Selected warehouse filter (optional, defaults to all warehouses)
	
	Returns:
		dict: {success: bool, file_url: str or error: str}
	"""
	import openpyxl
	from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
	from openpyxl.utils import get_column_letter

	if isinstance(filters, str):
		filters = json.loads(filters)
	
	if not filters:
		filters = {}
	
	try:
		# Fetch the data using the same logic as the main report
		spp_warehouses = get_spp_warehouses()
		
		if not spp_warehouses:
			return {
				"success": False,
				"error": "No SPP warehouses found in the system"
			}
		
		# Fetch raw data
		all_data = fetch_batch_balance_data(
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
		all_data, excluded_count = exclude_batches(all_data)
		
		# Filter by item groups
		filtered_data = filter_by_item_groups_pandas(all_data)
		
		# If warehouse filter is specified, filter the raw data by warehouse
		if warehouse and warehouse != '':
			filtered_data = [row for row in filtered_data if row.get('warehouse') == warehouse]
		
		# Aggregate the data
		aggregated_result = aggregate_by_common_code(filtered_data)
		data = aggregated_result.get("data", [])
		grand_total = aggregated_result.get("grand_total", {})
		
		if not data:
			return {
				"success": False,
				"error": "No data available after aggregation"
			}
		
		# Create Excel workbook
		wb = openpyxl.Workbook()
		ws = wb.active
		ws.title = "SPP Aggregated Report"
		
		# Styling
		header_fill = PatternFill(start_color="366092", end_color="366092", fill_type="solid")
		header_font = Font(bold=True, color="FFFFFF", size=11)
		subheader_fill = PatternFill(start_color="D9E1F2", end_color="D9E1F2", fill_type="solid")
		subheader_font = Font(bold=True, size=10)
		total_fill = PatternFill(start_color="FFF2CC", end_color="FFF2CC", fill_type="solid")
		total_font = Font(bold=True, size=10)
		border = Border(
			left=Side(style='thin'),
			right=Side(style='thin'),
			top=Side(style='thin'),
			bottom=Side(style='thin')
		)
		center_align = Alignment(horizontal='center', vertical='center')
		right_align = Alignment(horizontal='right', vertical='center')
		
		# Report Title and Filters
		current_row = 1
		ws.merge_cells(f'A{current_row}:Q{current_row}')
		title_cell = ws[f'A{current_row}']
		title_cell.value = "SPP Aggregated Report - Common Code Summary"
		title_cell.font = Font(bold=True, size=14, color="366092")
		title_cell.alignment = center_align
		current_row += 1
		
		# Filter information
		ws.merge_cells(f'A{current_row}:Q{current_row}')
		filter_info = ws[f'A{current_row}']
		filter_text = f"Period: {filters.get('from_date', '')} to {filters.get('to_date', '')}"
		if warehouse and warehouse != '':
			filter_text += f" | Warehouse: {warehouse}"
		else:
			filter_text += " | All SPP Warehouses"
		filter_info.value = filter_text
		filter_info.font = Font(italic=True, size=10)
		filter_info.alignment = center_align
		current_row += 2
		
		# Headers
		headers = [
			"Common Code",
			"Mat Opening", "Mat In", "Mat Out", "Mat Balance",
			"Products Opening", "Products In", "Products Out", "Products Balance",
			"Finished Opening", "Finished In", "Finished Out", "Finished Balance",
			"Total Opening", "Total In", "Total Out", "Total Balance"
		]
		
		for col_num, header in enumerate(headers, 1):
			cell = ws.cell(row=current_row, column=col_num)
			cell.value = header
			cell.fill = header_fill
			cell.font = header_font
			cell.alignment = center_align
			cell.border = border
		
		current_row += 1
		
		# Data rows
		for row_data in data:
			col_num = 1
			
			# Common Code
			cell = ws.cell(row=current_row, column=col_num)
			cell.value = row_data.get('common_code', '')
			cell.alignment = center_align
			cell.border = border
			col_num += 1
			
			# Mat columns
			mat = row_data.get('Mat', {})
			for key in ['opening_qty', 'in_qty', 'out_qty', 'balance_qty']:
				cell = ws.cell(row=current_row, column=col_num)
				cell.value = mat.get(key, 0)
				cell.alignment = right_align
				cell.border = border
				cell.number_format = '#,##0.00'
				col_num += 1
			
			# Products columns
			products = row_data.get('Products', {})
			for key in ['opening_qty', 'in_qty', 'out_qty', 'balance_qty']:
				cell = ws.cell(row=current_row, column=col_num)
				cell.value = products.get(key, 0)
				cell.alignment = right_align
				cell.border = border
				cell.number_format = '#,##0.00'
				col_num += 1
			
			# Finished Product columns
			finished = row_data.get('Finished Product', {})
			for key in ['opening_qty', 'in_qty', 'out_qty', 'balance_qty']:
				cell = ws.cell(row=current_row, column=col_num)
				cell.value = finished.get(key, 0)
				cell.alignment = right_align
				cell.border = border
				cell.number_format = '#,##0.00'
				col_num += 1
			
			# Total columns
			total = row_data.get('Total', {})
			for key in ['opening_qty', 'in_qty', 'out_qty', 'balance_qty']:
				cell = ws.cell(row=current_row, column=col_num)
				cell.value = total.get(key, 0)
				cell.alignment = right_align
				cell.border = border
				cell.number_format = '#,##0.00'
				cell.font = Font(bold=True)
				col_num += 1
			
			current_row += 1
		
		 # Add grand total values
		for stage in ['Mat', 'Products', 'Finished Product', 'Total']:
			stage_data = grand_total.get(stage, {})
			for key in ['opening_qty', 'in_qty', 'out_qty', 'balance_qty']:
				cell = ws.cell(row=current_row, column=col_num)
				cell.value = stage_data.get(key, 0)
				cell.fill = total_fill
				cell.font = total_font
				cell.alignment = right_align
				cell.border = border
				cell.number_format = '#,##0.00'
				col_num += 1
		
		# Adjust column widths
		ws.column_dimensions['A'].width = 15  # Common Code
		for col in range(2, 18):
			ws.column_dimensions[get_column_letter(col)].width = 12
		
		# Freeze panes (freeze header row)
		ws.freeze_panes = ws['A5']
		
		# Save to BytesIO
		file_data = BytesIO()
		wb.save(file_data)
		file_data.seek(0)
		
		# Generate filename
		from datetime import datetime
		timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
		warehouse_suffix = warehouse.replace(" ", "_").replace("-", "_") if warehouse else "All_Warehouses"
		filename = f"SPP_Aggregated_Report_{warehouse_suffix}_{timestamp}.xlsx"
		
		# Save file to Frappe File Manager
		file_doc = frappe.get_doc({
			"doctype": "File",
			"file_name": filename,
			"is_private": 0,
			"content": file_data.getvalue()
		})
		file_doc.save(ignore_permissions=True)
		
		return {
			"success": True,
			"file_url": file_doc.file_url,
			"file_name": filename,
			"message": f"Excel file generated successfully with {len(data)} records"
		}
		
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
def export_batch_details_to_excel(common_code, batches, filters=None, warehouse_filter=''):
	"""
	Export batch details for a specific common code to Excel
	
	Args:
		common_code: The common code to export
		batches: Batch data grouped by item group
		filters: Report filters
		warehouse_filter: Selected warehouse filter
	"""
	import openpyxl
	from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
	from openpyxl.utils import get_column_letter

	if isinstance(batches, str):
		batches = json.loads(batches)
	if isinstance(filters, str):
		filters = json.loads(filters)
	
	try:
		# Create Excel workbook
		wb = openpyxl.Workbook()
		ws = wb.active
		ws.title = f"Code {common_code}"
		
		# Styling
		header_fill = PatternFill(start_color="366092", end_color="366092", fill_type="solid")
		header_font = Font(bold=True, color="FFFFFF", size=11)
		border = Border(
			left=Side(style='thin'),
			right=Side(style='thin'),
			top=Side(style='thin'),
			bottom=Side(style='thin')
		)
		center_align = Alignment(horizontal='center', vertical='center')
		right_align = Alignment(horizontal='right', vertical='center')
		
		# Title
		current_row = 1
		ws.merge_cells(f'A{current_row}:J{current_row}')
		title_cell = ws[f'A{current_row}']
		title_cell.value = f"Batch Details for Common Code: {common_code}"
		title_cell.font = Font(bold=True, size=14, color="366092")
		title_cell.alignment = center_align
		current_row += 2
		
		# Headers
		headers = [
			"Item Code", "Item Group", "Batch No", "Warehouse",
			"Opening Qty", "In Qty", "Out Qty", "Balance Qty",
			"UOM", "Value"
		]
		
		for col_num, header in enumerate(headers, 1):
			cell = ws.cell(row=current_row, column=col_num)
			cell.value = header
			cell.fill = header_fill
			cell.font = header_font
			cell.alignment = center_align
			cell.border = border
		
		current_row += 1
		
		# Add data for each item group
		for item_group in ['Mat', 'Products', 'Finished Product']:
			batch_list = batches.get(item_group, [])
			
			if not batch_list:
				continue
			
			# Group header
			ws.merge_cells(f'A{current_row}:J{current_row}')
			group_cell = ws[f'A{current_row}']
			group_cell.value = f"{item_group} ({len(batch_list)} batches)"
			group_cell.font = Font(bold=True, size=11)
			group_cell.fill = PatternFill(start_color="E7E6E6", end_color="E7E6E6", fill_type="solid")
			current_row += 1
			
			# Batch rows
			for batch in batch_list:
				col_num = 1
				
				# Item Code
				cell = ws.cell(row=current_row, column=col_num)
				cell.value = batch.get('item', '')
				cell.border = border
				col_num += 1
				
				# Item Group
				cell = ws.cell(row=current_row, column=col_num)
				cell.value = batch.get('item_group', '')
				cell.border = border
				col_num += 1
				
				# Batch No
				cell = ws.cell(row=current_row, column=col_num)
				cell.value = batch.get('batch', '')
				cell.border = border
				col_num += 1
				
				# Warehouse
				cell = ws.cell(row=current_row, column=col_num)
				cell.value = batch.get('warehouse', '')
				cell.border = border
				col_num += 1
				
				# Quantities
				for key in ['opening_qty', 'in_qty', 'out_qty', 'balance_qty']:
					cell = ws.cell(row=current_row, column=col_num)
					cell.value = batch.get(key, 0)
					cell.alignment = right_align
					cell.border = border
					cell.number_format = '#,##0.00'
					col_num += 1
				
				# UOM
				cell = ws.cell(row=current_row, column=col_num)
				cell.value = batch.get('uom', 'Nos')
				cell.alignment = center_align
				cell.border = border
				col_num += 1
				
				# Value
				cell = ws.cell(row=current_row, column=col_num)
				cell.value = batch.get('balance_value', 0)
				cell.alignment = right_align
				cell.border = border
				cell.number_format = '#,##0.00'
				col_num += 1
				
				current_row += 1
			
			current_row += 1  # Add spacing between groups
		
		# Adjust column widths
		ws.column_dimensions['A'].width = 18  # Item Code
		ws.column_dimensions['B'].width = 18  # Item Group
		ws.column_dimensions['C'].width = 15  # Batch No
		ws.column_dimensions['D'].width = 25  # Warehouse
		for col in range(5, 11):
			ws.column_dimensions[get_column_letter(col)].width = 12
		
		# Freeze panes
		ws.freeze_panes = ws['A4']
		
		# Save to BytesIO
		file_data = BytesIO()
		wb.save(file_data)
		file_data.seek(0)
		
		# Generate filename
		from datetime import datetime
		timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
		filename = f"SPP_Batch_Details_{common_code}_{timestamp}.xlsx"
		
		# Save file
		file_doc = frappe.get_doc({
			"doctype": "File",
			"file_name": filename,
			"is_private": 0,
			"content": file_data.getvalue()
		})
		file_doc.save(ignore_permissions=True)
		
		return {
			"success": True,
			"file_url": file_doc.file_url,
			"file_name": filename
		}
		
	except Exception as e:
		frappe.log_error(
			f"Error exporting batch details: {str(e)}\n{frappe.get_traceback()}",
			"SPP Aggregated Report - Batch Export Error"
		)
		return {
			"success": False,
			"error": str(e)
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
		
		 # Track warehouses for each common_code (NEW)
		warehouse_tracking = {}
		for common_code in df['common_code'].unique():
			code_data = df[df['common_code'] == common_code]
			# Get unique warehouses for this common_code
			warehouses = code_data['warehouse'].dropna().unique().tolist()
			warehouse_tracking[common_code] = warehouses
		
		# Aggregate by common_code and item_group
		aggregated = df.groupby(['common_code', 'item_group']).agg({
			'opening_qty': 'sum',
			'in_qty': 'sum',
			'out_qty': 'sum',
			'balance_qty': 'sum',
			'balance_value': 'sum'
		}).reset_index()
		
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
				 "warehouses": warehouse_tracking.get(common_code, []),  # NEW: Add warehouse list
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

@frappe.whitelist()
def get_child_warehouses(warehouse):
	"""
	Get all child warehouses for a parent warehouse, including the warehouse itself.
	This is used for warehouse filtering - when a parent warehouse is selected,
	we need to include all child warehouses in the filter.
	
	Args:
		warehouse: Warehouse name (can be parent or child warehouse)
	
	Returns:
		list: List of warehouse names including the parent and all children
	"""
	if not warehouse:
		return []
	
	try:
		# Use the existing expand_parent_warehouses function
		warehouses = expand_parent_warehouses([warehouse])
		
		frappe.logger().info(
			f"Warehouse '{warehouse}' expanded to {len(warehouses)} warehouses: {warehouses}"
		)
		
		return warehouses
		
	except Exception as e:
		frappe.log_error(
			f"Error getting child warehouses for '{warehouse}': {str(e)}\n{frappe.get_traceback()}",
			"SPP Aggregated Report - Get Child Warehouses Error"
		)
		return [warehouse]  # Return at least the original warehouse