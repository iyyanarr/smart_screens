# Copyright (c) 2025, alphaworkz and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document


class ProductionBatchWeight(Document):
	def before_save(self):
		"""Auto-populate blank weight from Mould Specification based on production traceability"""
		if not self.blank_wt and self.batch_no:
			self.populate_blank_weight()
	
	def populate_blank_weight(self):
		"""
		Logic to populate blank weight:
		1. Find Moulding Production Entry that has this batch_no in scan_lot_number
		2. Get the Stock Entry from that Moulding Production Entry
		3. From Stock Entry Detail, find the T item (Mat item) row 
		4. Use the batch_no from that T item row
		5. Get mould_reference from Moulding Production Entry
		6. Get avg_blank_wtproduct_gms from Mould Specification filtered by mould_ref
		"""
		try:
			# Step 1: Find Moulding Production Entry by scan_lot_number if scan_lot_no is provided
			# OR find by batch_no if that's what we have
			production_entry = None
			
			if self.scan_lot_no:
				# Try to find by scan_lot_number first
				production_entry = frappe.db.sql("""
					SELECT name, batch_no, scan_lot_number, mould_reference, item_to_produce, stock_entry_reference
					FROM `tabMoulding Production Entry`
					WHERE scan_lot_number = %s AND docstatus = 1
					ORDER BY creation DESC
					LIMIT 1
				""", (self.scan_lot_no,), as_dict=True)
			
			if not production_entry and self.batch_no:
				# Fallback: try to find by batch_no in the production entry
				production_entry = frappe.db.sql("""
					SELECT name, batch_no, scan_lot_number, mould_reference, item_to_produce, stock_entry_reference
					FROM `tabMoulding Production Entry`
					WHERE batch_no = %s AND docstatus = 1
					ORDER BY creation DESC
					LIMIT 1
				""", (self.batch_no,), as_dict=True)
			
			if not production_entry:
				frappe.msgprint(f"No submitted Moulding Production Entry found for scan_lot_no {self.scan_lot_no} or batch_no {self.batch_no}")
				return
				
			prod_entry = production_entry[0]
			
			# Step 2: Get the Stock Entry from Moulding Production Entry
			if not prod_entry.stock_entry_reference:
				frappe.msgprint(f"No Stock Entry reference found in Moulding Production Entry {prod_entry.name}")
				return
			
			# Step 3: Find the T item (Mat item) from Stock Entry Detail
			t_item_detail = frappe.db.sql("""
				SELECT item_code, batch_no, qty
				FROM `tabStock Entry Detail`
				WHERE parent = %s AND item_code LIKE 'T%%'
				ORDER BY idx
				LIMIT 1
			""", (prod_entry.stock_entry_reference,), as_dict=True)
			
			if not t_item_detail:
				frappe.msgprint(f"No T item (Mat item) found in Stock Entry {prod_entry.stock_entry_reference}")
				return
			
			t_item = t_item_detail[0]
			
			# Update reference fields
			self.production_entry = prod_entry.name
			self.mould_reference = prod_entry.mould_reference
			self.item_code = t_item.item_code  # Use the actual T item code
			
			# Use the batch from the T item, not from production entry
			if t_item.batch_no:
				self.batch_no = t_item.batch_no
			
			# Set scan_lot_no if not already set
			if not self.scan_lot_no and prod_entry.scan_lot_number:
				self.scan_lot_no = prod_entry.scan_lot_number
			
			# Step 4: Get blank weight from Mould Specification using mould_ref and spp_ref (item code)
			if prod_entry.mould_reference:
				# First try to match both mould_ref and spp_ref (item code)
				mould_spec = frappe.db.sql("""
					SELECT avg_blank_wtproduct_gms, spp_ref
					FROM `tabMould Specification`
					WHERE mould_ref = %s AND spp_ref = %s
					AND avg_blank_wtproduct_gms IS NOT NULL 
					AND avg_blank_wtproduct_gms != ''
					AND avg_blank_wtproduct_gms != '0'
					ORDER BY creation DESC
					LIMIT 1
				""", (prod_entry.mould_reference, t_item.item_code), as_dict=True)
				
				# Fallback: try with mould_ref only if no exact match found
				if not mould_spec:
					mould_spec = frappe.db.sql("""
						SELECT avg_blank_wtproduct_gms, spp_ref
						FROM `tabMould Specification`
						WHERE mould_ref = %s
						AND avg_blank_wtproduct_gms IS NOT NULL 
						AND avg_blank_wtproduct_gms != ''
						AND avg_blank_wtproduct_gms != '0'
						ORDER BY creation DESC
						LIMIT 1
					""", (prod_entry.mould_reference,), as_dict=True)
				
				if mould_spec and mould_spec[0].avg_blank_wtproduct_gms:
					blank_wt = float(mould_spec[0].avg_blank_wtproduct_gms)
					if blank_wt > 0:
						self.blank_wt = blank_wt
						self.spp_ref = mould_spec[0].spp_ref  # Store the SPP reference
						frappe.msgprint(f"Auto-populated blank weight: {self.blank_wt} gms for T item {t_item.item_code} batch {t_item.batch_no} (SPP Ref: {self.spp_ref})")
					else:
						frappe.msgprint(f"Invalid blank weight value in Mould Specification for mould {prod_entry.mould_reference}")
				else:
					frappe.msgprint(f"No Mould Specification found for mould {prod_entry.mould_reference} and item {t_item.item_code}")
			
		except Exception as e:
			frappe.log_error(f"Error auto-populating blank weight: {str(e)}", "Production Batch Weight")
			frappe.msgprint(f"Error auto-populating blank weight: {str(e)}")


@frappe.whitelist()
def populate_all_batch_weights():
	"""
	Utility function to populate Production Batch Weight records for Moulding Production Entries
	from January 2025 onwards only
	"""
	try:
		# Get submitted Moulding Production Entries from January 2025 onwards
		production_entries = frappe.db.sql("""
			SELECT name, batch_no, scan_lot_number, mould_reference, item_to_produce, stock_entry_reference
			FROM `tabMoulding Production Entry`
			WHERE docstatus = 1 
			AND stock_entry_reference IS NOT NULL 
			AND stock_entry_reference != ''
			AND scan_lot_number IS NOT NULL
			AND scan_lot_number != ''
			AND creation >= '2025-01-01 00:00:00'
			ORDER BY creation DESC
		""", as_dict=True)
		
		created_count = 0
		skipped_count = 0
		error_count = 0
		
		frappe.publish_progress(0, f"Found {len(production_entries)} Moulding Production Entries from Jan 2025")
		
		for i, entry in enumerate(production_entries):
			try:
				# Show progress every 10 entries
				if i % 10 == 0:
					frappe.publish_progress(i/len(production_entries)*100, f"Processing {i+1}/{len(production_entries)}")
				
				# Check if record already exists for this scan_lot_no
				existing = frappe.db.exists("Production Batch Weight", {"scan_lot_no": entry.scan_lot_number})
				if existing:
					skipped_count += 1
					continue
				
				# Get the T item (Mat item) from Stock Entry Detail
				t_item_detail = frappe.db.sql("""
					SELECT item_code, batch_no, qty
					FROM `tabStock Entry Detail`
					WHERE parent = %s AND item_code LIKE 'T%%'
					ORDER BY idx
					LIMIT 1
				""", (entry.stock_entry_reference,), as_dict=True)
				
				if not t_item_detail:
					error_count += 1
					continue  # Skip if no T item found
				
				t_item = t_item_detail[0]
				
				# Get blank weight from Mould Specification using mould_ref and spp_ref (item code)
				blank_wt = 0
				spp_ref = None
				if entry.mould_reference and t_item.item_code:
					# First try to match both mould_ref and spp_ref (item code)
					mould_spec = frappe.db.sql("""
						SELECT avg_blank_wtproduct_gms, spp_ref
						FROM `tabMould Specification`
						WHERE mould_ref = %s AND spp_ref = %s
						AND avg_blank_wtproduct_gms IS NOT NULL 
						AND avg_blank_wtproduct_gms != ''
						AND avg_blank_wtproduct_gms != '0'
						ORDER BY creation DESC
						LIMIT 1
					""", (entry.mould_reference, t_item.item_code), as_dict=True)
					
					# Fallback: try with mould_ref only if no exact match found
					if not mould_spec:
						mould_spec = frappe.db.sql("""
							SELECT avg_blank_wtproduct_gms, spp_ref
							FROM `tabMould Specification`
							WHERE mould_ref = %s 
							AND avg_blank_wtproduct_gms IS NOT NULL 
							AND avg_blank_wtproduct_gms != ''
							AND avg_blank_wtproduct_gms != '0'
							ORDER BY creation DESC
							LIMIT 1
						""", (entry.mould_reference,), as_dict=True)
					
					if mould_spec and mould_spec[0].avg_blank_wtproduct_gms:
						try:
							blank_wt = float(mould_spec[0].avg_blank_wtproduct_gms)
							spp_ref = mould_spec[0].spp_ref
						except (ValueError, TypeError):
							blank_wt = 0
							spp_ref = None
				
				# Create new Production Batch Weight record using T item batch
				if t_item.batch_no and blank_wt > 0:
					doc = frappe.get_doc({
						"doctype": "Production Batch Weight",
						"scan_lot_no": entry.scan_lot_number,
						"batch_no": t_item.batch_no,  # Use T item batch, not production entry batch
						"blank_wt": blank_wt,
						"mould_reference": entry.mould_reference,
						"item_code": t_item.item_code,  # Use T item code
						"spp_ref": spp_ref,  # Add SPP reference
						"production_entry": entry.name
					})
					doc.insert(ignore_permissions=True)
					created_count += 1
				else:
					error_count += 1
					
			except Exception as e:
				error_count += 1
				frappe.log_error(f"Error processing {entry.name}: {str(e)}", "Production Batch Weight Sync")
				continue
		
		frappe.db.commit()
		frappe.publish_progress(100, "Sync completed!")
		
		result_msg = f"✅ Sync completed! Created: {created_count}, Skipped: {skipped_count}, Errors: {error_count}"
		return result_msg
		
	except Exception as e:
		frappe.log_error(f"Error in populate_all_batch_weights: {str(e)}", "Production Batch Weight")
		return f"Error: {str(e)}"


@frappe.whitelist()
def get_blank_weight_for_batch(batch_no):
	"""
	Get blank weight for a specific batch
	Used by Aggregated Stock Movement report
	"""
	try:
		result = frappe.db.sql("""
			SELECT blank_wt
			FROM `tabProduction Batch Weight`
			WHERE batch_no = %s
			LIMIT 1
		""", (batch_no,), as_dict=True)
		
		if result:
			return result[0].blank_wt
		
		# If not found, try to create on-the-fly
		doc = frappe.get_doc({
			"doctype": "Production Batch Weight",
			"batch_no": batch_no
		})
		doc.populate_blank_weight()
		
		if doc.blank_wt and doc.scan_lot_no:
			doc.insert(ignore_permissions=True)
			frappe.db.commit()
			return doc.blank_wt
			
		return 0
		
	except Exception as e:
		frappe.log_error(f"Error getting blank weight for batch {batch_no}: {str(e)}", "Production Batch Weight")
		return 0


@frappe.whitelist()
def auto_create_production_batch_weight(doc, method):
	"""
	Auto-create Production Batch Weight record when a Moulding Production Entry is submitted
	This ensures ongoing synchronization for new production entries
	"""
	try:
		# Check if this is a valid Moulding Production Entry with required data
		if not doc.scan_lot_number or not doc.stock_entry_reference or not doc.mould_reference:
			frappe.log_error(f"Moulding Production Entry {doc.name} missing required fields for Production Batch Weight creation", "Auto Create Production Batch Weight")
			return
		
		# Check if Production Batch Weight record already exists for this scan_lot_number
		existing = frappe.db.exists("Production Batch Weight", {"scan_lot_no": doc.scan_lot_number})
		if existing:
			frappe.log_error(f"Production Batch Weight already exists for scan_lot_no {doc.scan_lot_number}: {existing}", "Auto Create Production Batch Weight")
			return
		
		# Get the T item (Mat item) from Stock Entry Detail
		t_item_detail = frappe.db.sql("""
			SELECT item_code, batch_no, qty
			FROM `tabStock Entry Detail`
			WHERE parent = %s AND item_code LIKE 'T%%'
			ORDER BY idx
			LIMIT 1
		""", (doc.stock_entry_reference,), as_dict=True)
		
		if not t_item_detail:
			frappe.log_error(f"No T item found in Stock Entry {doc.stock_entry_reference} for Moulding Production Entry {doc.name}", "Auto Create Production Batch Weight")
			return
		
		t_item = t_item_detail[0]
		
		# Get blank weight from Mould Specification
		blank_wt = 0
		spp_ref = None
		
		# First try to match both mould_ref and spp_ref (item code)
		mould_spec = frappe.db.sql("""
			SELECT avg_blank_wtproduct_gms, spp_ref
			FROM `tabMould Specification`
			WHERE mould_ref = %s AND spp_ref = %s
			AND avg_blank_wtproduct_gms IS NOT NULL 
			AND avg_blank_wtproduct_gms != ''
			AND avg_blank_wtproduct_gms != '0'
			ORDER BY creation DESC
			LIMIT 1
		""", (doc.mould_reference, t_item.item_code), as_dict=True)
		
		# Fallback: try with mould_ref only if no exact match found
		if not mould_spec:
			mould_spec = frappe.db.sql("""
				SELECT avg_blank_wtproduct_gms, spp_ref
				FROM `tabMould Specification`
				WHERE mould_ref = %s 
				AND avg_blank_wtproduct_gms IS NOT NULL 
				AND avg_blank_wtproduct_gms != ''
				AND avg_blank_wtproduct_gms != '0'
				ORDER BY creation DESC
				LIMIT 1
			""", (doc.mould_reference,), as_dict=True)
		
		if mould_spec and mould_spec[0].avg_blank_wtproduct_gms:
			try:
				blank_wt = float(mould_spec[0].avg_blank_wtproduct_gms)
				spp_ref = mould_spec[0].spp_ref
			except (ValueError, TypeError):
				blank_wt = 0
				spp_ref = None
		
		# Create Production Batch Weight record only if we have valid blank weight
		if blank_wt > 0 and t_item.batch_no:
			batch_weight_doc = frappe.get_doc({
				"doctype": "Production Batch Weight",
				"scan_lot_no": doc.scan_lot_number,
				"batch_no": t_item.batch_no,  # Use T item batch
				"blank_wt": blank_wt,
				"mould_reference": doc.mould_reference,
				"item_code": t_item.item_code,  # Use T item code
				"spp_ref": spp_ref,
				"production_entry": doc.name
			})
			
			batch_weight_doc.insert(ignore_permissions=True)
			frappe.db.commit()
			
			frappe.log_error(f"✅ Auto-created Production Batch Weight {batch_weight_doc.name} for Moulding Production Entry {doc.name}", "Auto Create Production Batch Weight")
		else:
			frappe.log_error(f"Could not create Production Batch Weight for {doc.name}: blank_wt={blank_wt}, t_item_batch={t_item.batch_no}", "Auto Create Production Batch Weight")
	
	except Exception as e:
		frappe.log_error(f"Error auto-creating Production Batch Weight for {doc.name}: {str(e)}", "Auto Create Production Batch Weight")
