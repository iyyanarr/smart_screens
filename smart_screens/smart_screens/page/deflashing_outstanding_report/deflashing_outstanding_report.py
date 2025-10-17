import frappe
from frappe import _
import json
from datetime import datetime, timedelta

@frappe.whitelist()
def get_deflashing_outstanding_data(from_date, to_date, vendor_search='', item_search='', min_outstanding=0, outstanding_type='all'):
	"""
	Get deflashing outstanding data for the matrix report
	Returns vendors vs items with outstanding quantities
	"""
	try:
		# Convert min_outstanding to float
		min_outstanding = float(min_outstanding) if min_outstanding else 0
		
		# Build the main query to get deflashing outstanding data
		conditions = []
		values = []
		
		# Date range filter
		conditions.append("dde.posting_date BETWEEN %s AND %s")
		values.extend([from_date, to_date])
		
		# Vendor search filter
		if vendor_search:
			conditions.append("(dde.warehouse LIKE %s OR dde.warehouse LIKE %s)")
			values.extend([f"%{vendor_search}%", f"%{vendor_search}%"])
		
		# Item search filter
		if item_search:
			conditions.append("ddei.item LIKE %s")
			values.append(f"%{item_search}%")
		
		where_clause = "WHERE " + " AND ".join(conditions) if conditions else ""
		
		# Main query to get dispatched vs received data
		query = f"""
		SELECT 
			dde.warehouse as vendor,
			ddei.item,
			ddei.lot_number,
			dde.posting_date as dispatch_date,
			ddei.qty as dispatched_kg,
			ddei.qty_in_nos as dispatched_nos,
			COALESCE(received.received_kg, 0) as received_kg,
			COALESCE(received.received_nos, 0) as received_nos,
			(ddei.qty - COALESCE(received.received_kg, 0)) as outstanding_kg,
			(ddei.qty_in_nos - COALESCE(received.received_nos, 0)) as outstanding_nos,
			DATEDIFF(CURDATE(), dde.posting_date) as days_pending,
			dde.name as dispatch_entry,
			received.receipt_entry
		FROM 
			`tabDeflashing Despatch Entry` dde
		INNER JOIN 
			`tabDeflashing Despatch Entry Item` ddei ON dde.name = ddei.parent
		LEFT JOIN (
			SELECT 
				dre.batch_no,
				dre.item,
				SUM(dre.product_weight) as received_kg,
				SUM(dre.qty_in_nos) as received_nos,
				dre.name as receipt_entry
			FROM 
				`tabDeflashing Receipt Entry` dre
			WHERE 
				dre.docstatus = 1
			GROUP BY 
				dre.batch_no, dre.item
		) received ON ddei.batch_no = received.batch_no AND ddei.item = received.item
		{where_clause}
		AND dde.docstatus = 1
		AND ddei.item IS NOT NULL 
		AND ddei.item != ''
		HAVING 
			outstanding_kg > {min_outstanding} OR outstanding_nos > {min_outstanding}
		ORDER BY 
			dde.warehouse, ddei.item, dde.posting_date DESC
		"""
		
		# Execute the query
		data = frappe.db.sql(query, values, as_dict=True)
		
		# Filter by outstanding type
		if outstanding_type == 'weight':
			data = [row for row in data if row.outstanding_kg > min_outstanding]
		elif outstanding_type == 'quantity':
			data = [row for row in data if row.outstanding_nos > min_outstanding]
		
		# Get unique vendors and items for matrix display
		vendors = sorted(list(set([row.vendor for row in data if row.vendor])))
		items = sorted(list(set([row.item for row in data if row.item])))
		
		# Calculate summary statistics
		total_outstanding_kg = sum([row.outstanding_kg for row in data])
		total_outstanding_nos = sum([row.outstanding_nos for row in data])
		
		summary = {
			'total_vendors': len(vendors),
			'total_items': len(items),
			'total_outstanding_kg': total_outstanding_kg,
			'total_outstanding_nos': total_outstanding_nos,
			'total_records': len(data)
		}
		
		return {
			'status': 'success',
			'data': data,
			'vendors': vendors,
			'items': items,
			'summary': summary
		}
		
	except Exception as e:
		frappe.log_error(f"Error in get_deflashing_outstanding_data: {str(e)}")
		return {
			'status': 'error',
			'message': str(e)
		}

@frappe.whitelist()
def get_vendor_item_details(vendor, item, from_date, to_date):
	"""
	Get detailed breakdown for a specific vendor-item combination
	Used for drill-down functionality
	"""
	try:
		query = """
		SELECT 
			dde.name as dispatch_entry,
			ddei.lot_number,
			dde.posting_date as dispatch_date,
			ddei.qty as dispatched_kg,
			ddei.qty_in_nos as dispatched_nos,
			COALESCE(dre.product_weight, 0) as received_kg,
			COALESCE(dre.qty_in_nos, 0) as received_nos,
			(ddei.qty - COALESCE(dre.product_weight, 0)) as outstanding_kg,
			(ddei.qty_in_nos - COALESCE(dre.qty_in_nos, 0)) as outstanding_nos,
			dre.name as receipt_entry,
			dre.posting_date as receipt_date,
			DATEDIFF(COALESCE(dre.posting_date, CURDATE()), dde.posting_date) as processing_days
		FROM 
			`tabDeflashing Despatch Entry` dde
		INNER JOIN 
			`tabDeflashing Despatch Entry Item` ddei ON dde.name = ddei.parent
		LEFT JOIN 
			`tabDeflashing Receipt Entry` dre ON ddei.batch_no = dre.batch_no AND ddei.item = dre.item
		WHERE 
			dde.warehouse = %s
			AND ddei.item = %s
			AND dde.posting_date BETWEEN %s AND %s
			AND dde.docstatus = 1
		ORDER BY 
			dde.posting_date DESC
		"""
		
		data = frappe.db.sql(query, [vendor, item, from_date, to_date], as_dict=True)
		
		return {
			'status': 'success',
			'data': data
		}
		
	except Exception as e:
		frappe.log_error(f"Error in get_vendor_item_details: {str(e)}")
		return {
			'status': 'error',
			'message': str(e)
		}

@frappe.whitelist()
def get_deflashing_vendor_performance(from_date, to_date):
	"""
	Get vendor performance metrics for deflashing operations
	"""
	try:
		query = """
		SELECT 
			dde.warehouse as vendor,
			COUNT(DISTINCT ddei.item) as items_handled,
			COUNT(DISTINCT ddei.lot_number) as lots_processed,
			SUM(ddei.qty) as total_dispatched_kg,
			SUM(ddei.qty_in_nos) as total_dispatched_nos,
			SUM(COALESCE(dre.product_weight, 0)) as total_received_kg,
			SUM(COALESCE(dre.qty_in_nos, 0)) as total_received_nos,
			AVG(DATEDIFF(dre.posting_date, dde.posting_date)) as avg_processing_days,
			COUNT(CASE WHEN dre.name IS NULL THEN 1 END) as pending_receipts,
			(SUM(COALESCE(dre.product_weight, 0)) / SUM(ddei.qty) * 100) as yield_percentage
		FROM 
			`tabDeflashing Despatch Entry` dde
		INNER JOIN 
			`tabDeflashing Despatch Entry Item` ddei ON dde.name = ddei.parent
		LEFT JOIN 
			`tabDeflashing Receipt Entry` dre ON ddei.batch_no = dre.batch_no AND ddei.item = dre.item
		WHERE 
			dde.posting_date BETWEEN %s AND %s
			AND dde.docstatus = 1
		GROUP BY 
			dde.warehouse
		ORDER BY 
			total_dispatched_kg DESC
		"""
		
		data = frappe.db.sql(query, [from_date, to_date], as_dict=True)
		
		return {
			'status': 'success',
			'data': data
		}
		
	except Exception as e:
		frappe.log_error(f"Error in get_deflashing_vendor_performance: {str(e)}")
		return {
			'status': 'error',
			'message': str(e)
		}

@frappe.whitelist()
def get_deflashing_item_analysis(from_date, to_date):
	"""
	Get item-wise deflashing analysis
	"""
	try:
		query = """
		SELECT 
			ddei.item,
			COUNT(DISTINCT dde.warehouse) as vendors_used,
			COUNT(DISTINCT ddei.lot_number) as lots_processed,
			SUM(ddei.qty) as total_dispatched_kg,
			SUM(ddei.qty_in_nos) as total_dispatched_nos,
			SUM(COALESCE(dre.product_weight, 0)) as total_received_kg,
			SUM(COALESCE(dre.qty_in_nos, 0)) as total_received_nos,
			(SUM(ddei.qty) - SUM(COALESCE(dre.product_weight, 0))) as outstanding_kg,
			(SUM(ddei.qty_in_nos) - SUM(COALESCE(dre.qty_in_nos, 0))) as outstanding_nos,
			AVG(DATEDIFF(COALESCE(dre.posting_date, CURDATE()), dde.posting_date)) as avg_processing_days,
			(SUM(COALESCE(dre.product_weight, 0)) / SUM(ddei.qty) * 100) as yield_percentage
		FROM 
			`tabDeflashing Despatch Entry` dde
		INNER JOIN 
			`tabDeflashing Despatch Entry Item` ddei ON dde.name = ddei.parent
		LEFT JOIN 
			`tabDeflashing Receipt Entry` dre ON ddei.batch_no = dre.batch_no AND ddei.item = dre.item
		WHERE 
			dde.posting_date BETWEEN %s AND %s
			AND dde.docstatus = 1
			AND ddei.item IS NOT NULL 
			AND ddei.item != ''
		GROUP BY 
			ddei.item
		HAVING 
			outstanding_kg > 0 OR outstanding_nos > 0
		ORDER BY 
			outstanding_kg DESC
		"""
		
		data = frappe.db.sql(query, [from_date, to_date], as_dict=True)
		
		return {
			'status': 'success',
			'data': data
		}
		
	except Exception as e:
		frappe.log_error(f"Error in get_deflashing_item_analysis: {str(e)}")
		return {
			'status': 'error',
			'message': str(e)
		}