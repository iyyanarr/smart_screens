import frappe
from frappe import _
from frappe.utils import flt, nowdate, now_datetime, time_diff_in_hours


def complete_work_order_on_inspection_submit(doc, method):
	"""
	Hook function that runs when SPP Inspection Entry is submitted.
	
	Purpose: Use the EXACT SAME business logic as Sub Lot Process on_submit
	to complete the Work Order with stock entries (including rejections).
	
	This is called via hooks.py doc_events, so no need to modify spp_inspection_entry.py
	
	Args:
		doc: SPP Inspection Entry document
		method: The event method name (on_submit)
	"""
	try:
			# Find the Work Order from Sub Lot Process
		work_order = None
		if hasattr(doc, 'work_order') and doc.work_order:
			work_order = doc.work_order
			frappe.logger().info(f"Found Work Order {work_order} directly from SPP Inspection Entry document")
		
			# Try to find Work Order through Sub Lot Process (by lot_no)
		if not work_order and doc.lot_no:
			from frappe.utils import today, add_days
			
			# Find Sub Lot Processes created recently with this sublot number
			sub_lot_processes = frappe.get_all(
				"Sub Lot Process",
				filters={
					"sub_lot_number": doc.lot_no,
					"work_order": ["!=", ""],
					"creation": [">=", add_days(today(), -1)]  # Created within last 24 hours
				},
				fields=["name", "work_order", "creation"],
				order_by="creation desc",
				limit=5
			)
			
			if sub_lot_processes:
				# Find the one with an incomplete Work Order
				for process in sub_lot_processes:
					wo_status = frappe.db.get_value("Work Order", process.get("work_order"), "status")
					if wo_status and wo_status != "Completed":
						work_order = process.get("work_order")
						frappe.logger().info(f"Found incomplete Work Order {work_order} from Sub Lot Process for lot {doc.lot_no}")
						break
		
		# If no Work Order found, log and exit
		if not work_order:
			frappe.logger().warning(f"No Work Order found for SPP Inspection Entry {doc.name} (lot: {doc.lot_no})")
			return
		
		# Check if Work Order is already completed
		work_order_status = frappe.db.get_value("Work Order", work_order, "status")
		if work_order_status == "Completed":
			frappe.logger().info(f"Work Order {work_order} is already completed")
			return
		
		frappe.logger().info(f"Processing Work Order {work_order} for SPP Inspection Entry {doc.name}")
		
		# ⭐ USE THE EXACT SAME BUSINESS LOGIC AS SUB LOT PROCESS (Line 88-110)
		# Calculate rejected quantity from inspection entry
		rejected_qty = flt(doc.total_rejected_qty) or 0.0
		frappe.logger().info(f"Calculated total rejected quantity {rejected_qty} from SPP Inspection Entry")
		
		# Get batch number from inspection entry
		batch_no = doc.batch_no
		frappe.logger().info(f"Using batch number {batch_no} from SPP Inspection Entry batch_no field")
		
		frappe.logger().info(f"Completing Work Order {work_order} with rejected qty: {rejected_qty}, batch: {batch_no}")
		
		# Call the EXACT SAME function with EXACT SAME parameters (same as sub_lot_process.py Line 104-108)
		from smart_screens.smart_screens.utils.resource_job_card import complete_work_order_with_stock_entries
		
		complete_work_order_with_stock_entries(
			work_order_id=work_order,
			rejected_qty=rejected_qty,
			batch_no=batch_no
		)
		
		frappe.msgprint(f"✅ Work Order {work_order} has been completed with {rejected_qty} rejected items")
		frappe.logger().info(f"Successfully completed Work Order {work_order} from SPP Inspection Entry {doc.name}")
		
	except Exception as e:
		# Log the error but don't block the inspection entry submission
		import traceback
		frappe.log_error(
			message=f"Error completing Work Order from SPP Inspection Entry {doc.name}: {str(e)}\n{traceback.format_exc()}",
			title="SPP Inspection Entry - Work Order Completion Error"
		)
		frappe.msgprint(
			f"Warning: SPP Inspection Entry submitted successfully, but Work Order completion failed: {str(e)}",
			indicator="orange"
		)


def find_final_visual_inspection_job_card(work_order):
	"""
	Find the Job Card for "Final Visual Inspection" operation in the Work Order
	
	Args:
		work_order (str): Work Order name
		
	Returns:
		str: Job Card name or None
	"""
	try:
		# Search for Job Card with operation "Final Visual Inspection"
		job_cards = frappe.get_all(
			"Job Card",
			filters={
				"work_order": work_order,
				"operation": "Final Visual Inspection",
				"docstatus": ["!=", 2]  # Not cancelled
			},
			fields=["name", "status", "total_completed_qty"],
			order_by="creation desc",
			limit=1
		)
		
		if job_cards:
			frappe.logger().info(f"Found Job Card {job_cards[0].name} for Final Visual Inspection in Work Order {work_order}")
			return job_cards[0].name
		else:
			frappe.logger().warning(f"No Job Card found for Final Visual Inspection in Work Order {work_order}")
			return None
			
	except Exception as e:
		frappe.logger().error(f"Error finding Job Card for Final Visual Inspection: {str(e)}")
		return None


def update_job_card_with_inspection_data(job_card, inspected_qty, rejected_qty):
	"""
	Update the Job Card for Final Visual Inspection with inspection data
	
	Args:
		job_card (str): Job Card name
		inspected_qty (float): Total inspected quantity
		rejected_qty (float): Total rejected quantity
	"""
	try:
		# Get the Job Card document
		job_card_doc = frappe.get_doc("Job Card", job_card)
		
		# Calculate completed quantity (inspected - rejected = good quantity)
		completed_qty = flt(inspected_qty) - flt(rejected_qty)
		
		frappe.logger().info(f"Updating Job Card {job_card}: inspected={inspected_qty}, rejected={rejected_qty}, completed={completed_qty}")
		
		 # ⭐ IMPORTANT: Only update if the Job Card is in draft status
		if job_card_doc.docstatus != 0:
			frappe.logger().warning(f"Job Card {job_card} is already submitted (docstatus={job_card_doc.docstatus}), cannot update")
			frappe.msgprint(f"Job Card {job_card} is already submitted, cannot update", indicator="orange")
			return
		
		# Update the Job Card quantities
		job_card_doc.total_completed_qty = completed_qty
		job_card_doc.process_loss_qty = rejected_qty
		
		# Add time logs if they don't exist (required for Job Card completion)
		if not job_card_doc.time_logs or len(job_card_doc.time_logs) == 0:
			# Create a time log entry (ERPNext requires this)
			from frappe.utils import now_datetime, add_to_date
			
			start_time = add_to_date(now_datetime(), minutes=-5)  # Started 5 minutes ago
			end_time = now_datetime()
			
			job_card_doc.append("time_logs", {
				"from_time": start_time,
				"to_time": end_time,
				"completed_qty": completed_qty,
				"time_in_mins": 5.0
			})
			
			frappe.logger().info(f"Added time log to Job Card {job_card}: {start_time} to {end_time}")
		else:
			# Update existing time log with completed quantity
			for time_log in job_card_doc.time_logs:
				time_log.completed_qty = completed_qty
		
		# Save the Job Card
		job_card_doc.save(ignore_permissions=True)
		
		# Submit the Job Card
		job_card_doc.submit()
		frappe.logger().info(f"✅ Submitted Job Card {job_card}")
		
		frappe.db.commit()
		frappe.logger().info(f"✅ Successfully updated and submitted Job Card {job_card} with inspection data")
		
	except Exception as e:
		frappe.logger().error(f"Error updating Job Card {job_card}: {str(e)}")
		import traceback
		frappe.log_error(
			message=f"Error updating Job Card {job_card}: {str(e)}\n{traceback.format_exc()}",
			title="Job Card Update Error"
		)
		raise
