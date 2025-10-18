import frappe
from frappe import _
import json
from datetime import datetime

@frappe.whitelist()
def get_deflashing_outstanding_data(as_of_date, min_outstanding_days=0):
	"""Get deflashing outstanding data with days-based filtering based on dispatch and receipt entries only"""
	
	min_outstanding_days = int(min_outstanding_days) if min_outstanding_days else 0
	
	# Convert as_of_date string to datetime for calculations
	as_of_datetime = datetime.strptime(as_of_date, '%Y-%m-%d')
	
	query = """
		SELECT 
			dde.name as dispatch_entry,
			ddei.lot_number,
			ddei.batch_no,
			dde.posting_date,
			dde.posting_date as last_dispatch,
			ddei.item,
			ddei.qty as dispatched_qty,
			ddei.qty_in_nos as dispatched_nos,
			COALESCE(receipt_summary.total_received_qty, 0) as received_qty,
			COALESCE(receipt_summary.total_received_nos, 0) as received_nos,
			(ddei.qty - COALESCE(receipt_summary.total_received_qty, 0)) as outstanding_qty,
			(ddei.qty_in_nos - COALESCE(receipt_summary.total_received_nos, 0)) as outstanding_nos,
			DATEDIFF(%s, dde.posting_date) as days_pending,
			dde.warehouse as vendor,
			CASE 
					WHEN receipt_summary.total_received_qty IS NULL THEN 'Pending Receipt'
					WHEN (ddei.qty - COALESCE(receipt_summary.total_received_qty, 0)) > 0 THEN 'Partial Receipt'
					ELSE 'Completed'
			END as status
		FROM 
			`tabDeflashing Despatch Entry` dde
		INNER JOIN 
			`tabDeflashing Despatch Entry Item` ddei ON dde.name = ddei.parent
		LEFT JOIN (
			SELECT 
				batch_no, 
				item,
				SUM(product_weight) as total_received_qty,
				SUM(qty_in_nos) as total_received_nos
			FROM `tabDeflashing Receipt Entry` 
			WHERE docstatus = 1 AND posting_date <= %s
			GROUP BY batch_no, item
		) receipt_summary ON ddei.batch_no = receipt_summary.batch_no 
			AND ddei.item = receipt_summary.item
		WHERE 
			dde.docstatus = 1
			AND dde.posting_date <= %s
			AND (receipt_summary.total_received_qty IS NULL OR (ddei.qty - COALESCE(receipt_summary.total_received_qty, 0)) > 0)
		HAVING 
			DATEDIFF(%s, dde.posting_date) >= %s
		ORDER BY 
			dde.posting_date DESC, ddei.lot_number
		LIMIT 5000
	"""
	
	data = frappe.db.sql(query, (as_of_date, as_of_date, as_of_date, as_of_date, min_outstanding_days), as_dict=1)
	
	return data

@frappe.whitelist()
def get_lot_number_outstanding_data(as_of_date, min_outstanding_days=0):
	"""Get lot number wise outstanding data for deflashing operations"""
	
	min_outstanding_days = int(min_outstanding_days) if min_outstanding_days else 0
	
	query = """
		SELECT 
			ddei.lot_number,
			ddei.item,
			i.item_name,
			dde.warehouse as vendor,
			dde.posting_date as dispatch_date,
			ddei.qty as dispatched_qty,
			ddei.qty_in_nos as dispatched_nos,
			COALESCE(receipt_summary.total_received_qty, 0) as received_qty,
			COALESCE(receipt_summary.total_received_nos, 0) as received_nos,
			(ddei.qty - COALESCE(receipt_summary.total_received_qty, 0)) as outstanding_qty,
			(ddei.qty_in_nos - COALESCE(receipt_summary.total_received_nos, 0)) as outstanding_nos,
			DATEDIFF(%s, dde.posting_date) as days_pending,
			ddei.batch_no,
			ddei.spp_batch_no,
			CASE 
				WHEN receipt_summary.total_received_qty IS NULL THEN 'Pending Receipt'
				WHEN (ddei.qty - COALESCE(receipt_summary.total_received_qty, 0)) > 0 THEN 'Partial Receipt'
				ELSE 'Completed'
			END as status,
			CASE 
				WHEN DATEDIFF(%s, dde.posting_date) > 30 THEN 'Critical'
				WHEN DATEDIFF(%s, dde.posting_date) > 15 THEN 'High'
				WHEN DATEDIFF(%s, dde.posting_date) > 7 THEN 'Medium'
				ELSE 'Normal'
			END as priority
		FROM 
			`tabDeflashing Despatch Entry` dde
		INNER JOIN 
			`tabDeflashing Despatch Entry Item` ddei ON dde.name = ddei.parent
		LEFT JOIN 
			`tabItem` i ON ddei.item = i.name
		LEFT JOIN (
			SELECT 
				drei.batch_no, 
				drei.item,
				SUM(drei.product_weight) as total_received_qty,
				COUNT(*) as total_received_nos
			FROM `tabDeflashing Receipt Entry` dre
			INNER JOIN `tabDeflashing Receipt Entry Item` drei ON dre.name = drei.parent
			WHERE dre.docstatus = 1 AND dre.posting_date <= %s
			GROUP BY drei.batch_no, drei.item
		) receipt_summary ON ddei.batch_no = receipt_summary.batch_no 
			AND ddei.item = receipt_summary.item
		WHERE 
			dde.docstatus = 1
			AND dde.posting_date <= %s
			AND (receipt_summary.total_received_qty IS NULL OR (ddei.qty - COALESCE(receipt_summary.total_received_qty, 0)) > 0)
		HAVING 
			DATEDIFF(%s, dde.posting_date) >= %s
			AND outstanding_qty > 0
		ORDER BY 
			days_pending DESC, outstanding_qty DESC
		LIMIT 1000
	"""
	
	data = frappe.db.sql(query, (as_of_date, as_of_date, as_of_date, as_of_date, as_of_date, as_of_date, as_of_date, min_outstanding_days), as_dict=1)
	
	return data

@frappe.whitelist()
def get_lot_number_outstanding_summary(as_of_date, min_outstanding_days=0):
	"""Get comprehensive lot number wise outstanding summary for deflashing operations"""
	
	min_outstanding_days = int(min_outstanding_days) if min_outstanding_days else 0
	
	query = """
		SELECT 
			ddei.lot_number,
			ddei.item,
			i.item_name,
			dde.warehouse as vendor,
			dde.posting_date as dispatch_date,
			ddei.qty as dispatched_qty,
			ddei.qty_in_nos as dispatched_nos,
			COALESCE(receipt_summary.total_received_qty, 0) as received_qty,
			COALESCE(receipt_summary.total_received_nos, 0) as received_nos,
			(ddei.qty - COALESCE(receipt_summary.total_received_qty, 0)) as outstanding_qty,
			(ddei.qty_in_nos - COALESCE(receipt_summary.total_received_nos, 0)) as outstanding_nos,
			DATEDIFF(%s, dde.posting_date) as days_pending,
			ddei.batch_no,
			ddei.spp_batch_no,
			CASE 
				WHEN receipt_summary.total_received_qty IS NULL THEN 'Pending Receipt'
				WHEN (ddei.qty - COALESCE(receipt_summary.total_received_qty, 0)) > 0 THEN 'Partial Receipt'
				ELSE 'Completed'
			END as status,
			CASE 
				WHEN DATEDIFF(%s, dde.posting_date) > 30 THEN 'Critical'
				WHEN DATEDIFF(%s, dde.posting_date) > 15 THEN 'High'
				WHEN DATEDIFF(%s, dde.posting_date) > 7 THEN 'Medium'
				ELSE 'Normal'
			END as priority
		FROM 
			`tabDeflashing Despatch Entry` dde
		INNER JOIN 
			`tabDeflashing Despatch Entry Item` ddei ON dde.name = ddei.parent
		LEFT JOIN 
			`tabItem` i ON ddei.item = i.name
		LEFT JOIN (
			SELECT 
				drei.batch_no, 
				drei.item,
				SUM(drei.product_weight) as total_received_qty,
				COUNT(*) as total_received_nos
			FROM `tabDeflashing Receipt Entry` dre
			INNER JOIN `tabDeflashing Receipt Entry Item` drei ON dre.name = drei.parent
			WHERE dre.docstatus = 1 AND dre.posting_date <= %s
			GROUP BY drei.batch_no, drei.item
		) receipt_summary ON ddei.batch_no = receipt_summary.batch_no 
			AND ddei.item = receipt_summary.item
		WHERE 
			dde.docstatus = 1
			AND dde.posting_date <= %s
			AND (receipt_summary.total_received_qty IS NULL OR (ddei.qty - COALESCE(receipt_summary.total_received_qty, 0)) > 0)
		HAVING 
			DATEDIFF(%s, dde.posting_date) >= %s
			AND outstanding_qty > 0
		ORDER BY 
			days_pending DESC, outstanding_qty DESC
		LIMIT 1000
	"""
	
	data = frappe.db.sql(query, (as_of_date, as_of_date, as_of_date, as_of_date, as_of_date, as_of_date, as_of_date, min_outstanding_days), as_dict=1)
	
	return data

@frappe.whitelist()
def get_vendor_item_details(vendor, item, as_of_date):
	"""
	Get detailed breakdown for a specific vendor-item combination
	Used for drill-down functionality
	"""
	try:
		query = """
		SELECT 
			dde.name as dispatch_entry,
			ddei.lot_number,
			ddei.batch_no,
			dde.posting_date as dispatch_date,
			ddei.qty as dispatched_kg,
			ddei.qty_in_nos as dispatched_nos,
			COALESCE(dre.product_weight, 0) as received_kg,
			COALESCE(dre.qty_in_nos, 0) as received_nos,
			(ddei.qty - COALESCE(dre.product_weight, 0)) as outstanding_kg,
			(ddei.qty_in_nos - COALESCE(dre.qty_in_nos, 0)) as outstanding_nos,
			dre.name as receipt_entry,
			dre.posting_date as receipt_date,
			DATEDIFF(COALESCE(dre.posting_date, CURDATE()), dde.posting_date) as processing_days,
			CASE 
				WHEN dre.name IS NULL THEN 'Pending'
				ELSE 'Received'
			END as status
		FROM 
			`tabDeflashing Despatch Entry` dde
		INNER JOIN 
			`tabDeflashing Despatch Entry Item` ddei ON dde.name = ddei.parent
		LEFT JOIN 
			`tabDeflashing Receipt Entry` dre ON ddei.batch_no = dre.batch_no 
				AND ddei.item = dre.item 
				AND dre.posting_date <= %s
				AND dre.docstatus = 1
		WHERE 
			dde.warehouse = %s
			AND ddei.item = %s
			AND dde.posting_date <= %s
			AND dde.docstatus = 1
		ORDER BY 
			dde.posting_date DESC, ddei.lot_number
		"""
		
		data = frappe.db.sql(query, [as_of_date, vendor, item, as_of_date], as_dict=True)
		
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
def get_deflashing_vendor_performance(as_of_date):
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
			SUM(ddei.qty) - SUM(COALESCE(dre.product_weight, 0)) as outstanding_kg,
			SUM(ddei.qty_in_nos) - SUM(COALESCE(dre.qty_in_nos, 0)) as outstanding_nos,
			AVG(CASE WHEN dre.posting_date IS NOT NULL 
				THEN DATEDIFF(dre.posting_date, dde.posting_date) 
				END) as avg_processing_days,
			COUNT(CASE WHEN dre.name IS NULL THEN 1 END) as pending_receipts,
			ROUND((SUM(COALESCE(dre.product_weight, 0)) / NULLIF(SUM(ddei.qty), 0) * 100), 2) as yield_percentage
		FROM 
			`tabDeflashing Despatch Entry` dde
		INNER JOIN 
			`tabDeflashing Despatch Entry Item` ddei ON dde.name = ddei.parent
		LEFT JOIN 
			`tabDeflashing Receipt Entry` dre ON ddei.batch_no = dre.batch_no 
				AND ddei.item = dre.item 
				AND dre.docstatus = 1
		WHERE 
			dde.posting_date <= %s
			AND dde.docstatus = 1
		GROUP BY 
			dde.warehouse
		ORDER BY 
			total_dispatched_kg DESC
		"""
		
		data = frappe.db.sql(query, [as_of_date], as_dict=True)
		
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
def get_deflashing_item_analysis(as_of_date):
	"""
	Get item-wise deflashing analysis
	"""
	try:
		query = """
		SELECT 
			ddei.item,
			i.item_name,
			COUNT(DISTINCT dde.warehouse) as vendors_used,
			COUNT(DISTINCT ddei.lot_number) as lots_processed,
			SUM(ddei.qty) as total_dispatched_kg,
			SUM(ddei.qty_in_nos) as total_dispatched_nos,
			SUM(COALESCE(dre.product_weight, 0)) as total_received_kg,
			SUM(COALESCE(dre.qty_in_nos, 0)) as total_received_nos,
			(SUM(ddei.qty) - SUM(COALESCE(dre.product_weight, 0))) as outstanding_kg,
			(SUM(ddei.qty_in_nos) - SUM(COALESCE(dre.qty_in_nos, 0))) as outstanding_nos,
			AVG(CASE WHEN dre.posting_date IS NOT NULL 
				THEN DATEDIFF(dre.posting_date, dde.posting_date) 
				END) as avg_processing_days,
			ROUND((SUM(COALESCE(dre.product_weight, 0)) / NULLIF(SUM(ddei.qty), 0) * 100), 2) as yield_percentage
		FROM 
			`tabDeflashing Despatch Entry` dde
		INNER JOIN 
			`tabDeflashing Despatch Entry Item` ddei ON dde.name = ddei.parent
		LEFT JOIN 
			`tabItem` i ON ddei.item = i.name
		LEFT JOIN 
			`tabDeflashing Receipt Entry` dre ON ddei.batch_no = dre.batch_no 
				AND ddei.item = dre.item 
				AND dre.docstatus = 1
		WHERE 
			dde.posting_date <= %s
			AND dde.docstatus = 1
		GROUP BY 
			ddei.item, i.item_name
		HAVING 
			outstanding_kg > 0 OR outstanding_nos > 0
		ORDER BY 
			outstanding_kg DESC
		"""
		
		data = frappe.db.sql(query, [as_of_date], as_dict=True)
		
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