# Copyright (c) 2025, Aggregated Report and contributors
# For license information, please see license.txt

import frappe
from frappe import _
import json
from datetime import datetime
import uuid

@frappe.whitelist()
def get_month_batches(month):
	"""
	Get all Moulding Production Entries for a specific month with their conversion status
	
	Args:
		month: YYYY-MM format (e.g., '2025-11')
	
	Returns:
		{
			success: bool,
			data: list of batch records,
			stats: {total, processed, pending, errors}
		}
	"""
	try:
		# Parse month
		year, month_num = month.split('-')
		
		# Query to get production entries with stock entry details
		query = """
			SELECT 
				mpe.name as mpe_name,
				mpe.moulding_date,
				mpe.batch_no as raw_material_batch,
				mpe.weight,
				mpe.number_of_lifts,
				mpe.no_of_running_cavities,
				mpe.mould_reference,
				mpe.stock_entry_reference,
				se.posting_date,
				se.company,
				sed.item_code as finished_item,
				sed.qty as finished_qty_kg,
				sed.batch_no as finished_batch,
				sed.t_warehouse,
				CASE 
					WHEN mbc.name IS NOT NULL THEN 1 
					ELSE 0 
				END as is_processed
			FROM `tabMoulding Production Entry` mpe
			LEFT JOIN `tabStock Entry` se ON se.name = mpe.stock_entry_reference
			LEFT JOIN `tabStock Entry Detail` sed ON sed.parent = se.name AND sed.is_finished_item = 1
			LEFT JOIN `tabMoulding Batch Conversion` mbc ON mbc.production_entry = mpe.name
			WHERE mpe.docstatus = 1
			AND YEAR(se.posting_date) = %s
			AND MONTH(se.posting_date) = %s
			ORDER BY se.posting_date ASC, mpe.name ASC
		"""
		
		data = frappe.db.sql(query, (year, month_num), as_dict=True)
		
		# Calculate stats
		total = len(data)
		processed = sum(1 for row in data if row.get('is_processed'))
		pending = total - processed
		errors = 0  # Will be calculated based on missing data
		
		# Check for errors (missing critical data)
		for row in data:
			if not row.get('finished_batch') or not row.get('finished_item'):
				errors += 1
		
		stats = {
			'total': total,
			'processed': processed,
			'pending': pending,
			'errors': errors
		}
		
		return {
			'success': True,
			'data': data,
			'stats': stats
		}
		
	except Exception as e:
		frappe.log_error(f"Error in get_month_batches: {str(e)}", "Batch Conversion Entry Error")
		return {
			'success': False,
			'error': str(e)
		}


@frappe.whitelist()
def process_single_batch(mpe_name):
	"""
	Process a single Moulding Production Entry and create Batch Conversion record
	
	Args:
		mpe_name: Name of Moulding Production Entry
	
	Returns:
		{success: bool, error: str}
	"""
	try:
		# Check if already processed
		if frappe.db.exists("Moulding Batch Conversion", {"production_entry": mpe_name}):
			return {
				'success': False,
				'error': f'Batch conversion already exists for {mpe_name}'
			}
		
		# Get Moulding Production Entry
		mpe = frappe.get_doc("Moulding Production Entry", mpe_name)
		
		if not mpe.stock_entry_reference:
			return {
				'success': False,
				'error': f'No stock entry reference found for {mpe_name}'
			}
		
		# Get Stock Entry
		se = frappe.get_doc("Stock Entry", mpe.stock_entry_reference)
		
		# Get finished item details
		finished_item = None
		for item in se.items:
			if item.is_finished_item:
				finished_item = item
				break
		
		if not finished_item:
			return {
				'success': False,
				'error': f'No finished item found in Stock Entry {se.name}'
			}
		
		# Find Mould Specification by mould_ref field (not by name)
		mould_spec_name = None
		avg_blank_weight = None
		if mpe.mould_reference:
			mould_spec_data = frappe.db.get_value(
				"Mould Specification",
				{"mould_ref": mpe.mould_reference},
				["name", "avg_blank_wtproduct_gms"],
				as_dict=True
			)
			if mould_spec_data:
				mould_spec_name = mould_spec_data.get("name")
				avg_blank_weight = mould_spec_data.get("avg_blank_wtproduct_gms")
		
		# Create Moulding Batch Conversion record
		conversion_doc = frappe.get_doc({
			"doctype": "Moulding Batch Conversion",
			"production_entry": mpe.name,
			"batch_no": finished_item.batch_no,
			"item_code": finished_item.item_code,
			"warehouse": finished_item.t_warehouse,
			"posting_datetime": se.posting_date,
			"cavities_per_cycle": mpe.no_of_running_cavities,
			"cycle_time_sec": mpe.curing_time if hasattr(mpe, 'curing_time') else None,
			"shots": mpe.number_of_lifts,
			"gross_qty_kg": mpe.weight,
			"net_qty_kg": finished_item.qty,
			"rejects_qty_kg": 0,  # Calculate if available
			"company": se.company,
			"status": "Active"
		})
		
		 # Set mould_spec if found
		if mould_spec_name:
			conversion_doc.mould_spec = mould_spec_name
		
		conversion_doc.insert(ignore_permissions=True)
		frappe.db.commit()
		
		return {
			'success': True,
			'conversion_doc': conversion_doc.name
		}
		
	except Exception as e:
		frappe.log_error(
			f"Error processing {mpe_name}: {str(e)}\n{frappe.get_traceback()}",
			"Batch Conversion Processing Error"
		)
		return {
			'success': False,
			'error': str(e)
		}


@frappe.whitelist()
def process_month_background(month):
	"""
	Start a background job to process all pending batches for a month
	
	Args:
		month: YYYY-MM format
	
	Returns:
		{success: bool, job_id: str}
	"""
	try:
		# Generate unique job ID
		job_id = str(uuid.uuid4())
		
		# Enqueue background job
		frappe.enqueue(
			method='aggregated_report.aggregated_report.page.batch_conversion_entry.batch_conversion_entry.process_month_job',
			queue='long',
			timeout=3600,
			job_id=job_id,
			month=month,
			job_id_key=job_id
		)
		
		# Store job status in cache
		frappe.cache().set_value(
			f'batch_conversion_job_{job_id}',
			{
				'status': 'started',
				'progress': 0,
				'message': 'Job started...',
				'month': month
			},
			expires_in_sec=3600
		)
		
		return {
			'success': True,
			'job_id': job_id
		}
		
	except Exception as e:
		frappe.log_error(f"Error starting background job: {str(e)}", "Batch Conversion Job Error")
		return {
			'success': False,
			'error': str(e)
		}


@frappe.whitelist()
def get_job_status(job_id):
	"""
	Get the status of a background job
	
	Args:
		job_id: UUID of the job
	
	Returns:
		{status: str, progress: int, message: str}
	"""
	try:
		status = frappe.cache().get_value(f'batch_conversion_job_{job_id}')
		
		if not status:
			return {
				'status': 'not_found',
				'progress': 0,
				'message': 'Job not found'
			}
		
		return status
		
	except Exception as e:
		return {
			'status': 'error',
			'progress': 0,
			'message': str(e)
		}


def process_month_job(month, job_id_key):
	"""
	Background job to process all batches for a month
	
	Args:
		month: YYYY-MM format
		job_id_key: Job ID for status tracking
	"""
	try:
		# Update status
		update_job_status(job_id_key, 'running', 0, f'Loading batches for {month}...')
		
		# Get all pending batches
		result = get_month_batches(month)
		
		if not result.get('success'):
			update_job_status(job_id_key, 'failed', 0, f'Failed to load batches: {result.get("error")}')
			return
		
		data = result.get('data', [])
		pending_batches = [row for row in data if not row.get('is_processed')]
		
		total = len(pending_batches)
		if total == 0:
			update_job_status(job_id_key, 'completed', 100, 'No pending batches to process')
			return
		
		processed = 0
		failed = 0
		
		# Process each batch
		for idx, batch in enumerate(pending_batches, 1):
			try:
				update_job_status(
					job_id_key, 
					'running', 
					int((idx / total) * 100), 
					f'Processing {idx}/{total}: {batch["mpe_name"]}...'
				)
				
				result = process_single_batch(batch['mpe_name'])
				
				if result.get('success'):
					processed += 1
				else:
					failed += 1
					frappe.log_error(
						f"Failed to process {batch['mpe_name']}: {result.get('error')}",
						"Batch Conversion Job Error"
					)
				
				# Commit every 10 records
				if idx % 10 == 0:
					frappe.db.commit()
				
			except Exception as e:
				failed += 1
				frappe.log_error(
					f"Error processing {batch['mpe_name']}: {str(e)}\n{frappe.get_traceback()}",
					"Batch Conversion Job Error"
				)
		
		# Final commit
		frappe.db.commit()
		
		# Update final status
		update_job_status(
			job_id_key, 
			'completed', 
			100, 
			f'Completed! Processed: {processed}, Failed: {failed}, Total: {total}'
		)
		
	except Exception as e:
		frappe.log_error(
			f"Error in process_month_job: {str(e)}\n{frappe.get_traceback()}",
			"Batch Conversion Job Error"
		)
		update_job_status(job_id_key, 'failed', 0, f'Job failed: {str(e)}')


def update_job_status(job_id, status, progress, message):
	"""Update job status in cache"""
	frappe.cache().set_value(
		f'batch_conversion_job_{job_id}',
		{
			'status': status,
			'progress': progress,
			'message': message,
			'updated_at': datetime.now().isoformat()
		},
		expires_in_sec=3600
	)
