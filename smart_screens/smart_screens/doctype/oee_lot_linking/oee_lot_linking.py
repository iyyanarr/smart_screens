# Copyright (c) 2025, Tridots Tech and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document
from frappe import _

class OEELotLinking(Document):
	def validate(self):
		"""Validate lot linking before save"""
		self.validate_main_lot_in_linked_lots()
		self.validate_duplicate_lots()
		self.validate_same_production_context()
		self.validate_no_circular_references()
	
	def validate_main_lot_in_linked_lots(self):
		"""Ensure main lot number is included in linked lots"""
		linked_lot_numbers = [row.lot_number for row in self.linked_lots]
		
		if self.main_lot_number not in linked_lot_numbers:
			frappe.throw(
_("Main Lot Number <b>{0}</b> must be included in the Linked Lots table").format(
self.main_lot_number
)
)
	
	def validate_duplicate_lots(self):
		"""Ensure no duplicate lot numbers in the linked lots table"""
		lot_numbers = [row.lot_number for row in self.linked_lots]
		
		if len(lot_numbers) != len(set(lot_numbers)):
			duplicates = [lot for lot in lot_numbers if lot_numbers.count(lot) > 1]
			frappe.throw(
_("Duplicate lot numbers found in linked lots: <b>{0}</b>").format(
", ".join(set(duplicates))
)
)
	
	def validate_same_production_context(self):
		"""Validate that all linked lots have same date, shift, press, operator"""
		if not self.linked_lots or len(self.linked_lots) == 0:
			return
		
		# Get lot numbers from child table
		lot_numbers = [row.lot_number for row in self.linked_lots]
		
		if not lot_numbers:
			return
		
		# Query Moulding Production Entry to validate context
		production_entries = frappe.db.sql("""
SELECT 
COALESCE(mpe.scan_lot_number, mpe.batch_no) as lot_number,
DATE(mpe.moulding_date) as production_date,
jc.shift_type,
jc.workstation as machine,
mpe.employee_name as operator,
mpe.item_to_produce as item_code
FROM `tabMoulding Production Entry` mpe
LEFT JOIN `tabJob Card` jc ON mpe.job_card = jc.name
WHERE COALESCE(mpe.scan_lot_number, mpe.batch_no) IN %(lot_numbers)s
AND mpe.docstatus = 1
""", {"lot_numbers": lot_numbers}, as_dict=True)
		
		if not production_entries:
			frappe.throw(
_("No production entries found for the linked lot numbers. Please verify the lot numbers.")
)
		
		# Group by production context
		contexts = {}
		for entry in production_entries:
			key = (
str(entry.production_date),
entry.shift_type or '',
entry.machine or '',
entry.item_code or ''
)
			
			if key not in contexts:
				contexts[key] = []
			contexts[key].append(entry.lot_number)
		
		# Check if all lots belong to same context
		if len(contexts) > 1:
			context_details = []
			for (date, shift, machine, item), lots in contexts.items():
				context_details.append(
f"Date: {date}, Shift: {shift}, Press: {machine}, Item: {item} → Lots: {', '.join(lots)}"
)
			
			frappe.throw(
_("All linked lots must have the same production date, shift, press, and item code. Found multiple contexts:<br><br>{0}").format(
"<br>".join(context_details)
)
)
	
	def validate_no_circular_references(self):
		"""Prevent circular lot linking references"""
		# Get all lot numbers from this linking
		current_lots = [row.lot_number for row in self.linked_lots]
		
		if not current_lots:
			return
		
		# Build the WHERE clause to exclude current document
		# For new documents (self.name is None), we still need to check for conflicts
		exclude_condition = ""
		query_params = {"current_lots": current_lots}
		
		if self.name:
			# Existing document being updated - exclude self from check
			exclude_condition = "AND parent.name != %(current_name)s"
			query_params["current_name"] = self.name
		
		# Check if any of these lots are already main lots in other active linkings
		# FIX: Added production_date and shift_type to GROUP BY and SELECT to avoid NULL values
		existing_linkings = frappe.db.sql(f"""
			SELECT 
				parent.name,
				parent.main_lot_number,
				parent.status,
				parent.docstatus,
				parent.production_date,
				parent.shift_type,
				GROUP_CONCAT(DISTINCT child.lot_number ORDER BY child.lot_number SEPARATOR ', ') as linked_lots,
				COUNT(DISTINCT child.lot_number) as lot_count
			FROM `tabOEE Lot Linking` parent
			LEFT JOIN `tabOEE Linked Lot Item` child ON child.parent = parent.name
			WHERE parent.status = 'Active'
			AND parent.docstatus < 2
			{exclude_condition}
			AND (
				parent.main_lot_number IN %(current_lots)s
				OR child.lot_number IN %(current_lots)s
			)
			GROUP BY parent.name, parent.main_lot_number, parent.status, parent.docstatus, parent.production_date, parent.shift_type
		""", query_params, as_dict=True)
		
		if existing_linkings:
			# FIX: Better error message with NULL handling and debugging info
			conflicts = []
			for link in existing_linkings:
				doc_name = link.name or 'Unknown'
				main_lot = link.main_lot_number or 'None'
				linked = link.linked_lots or 'None'
				status = link.status or 'Unknown'
				docstatus = link.docstatus if link.docstatus is not None else -1
				lot_count = link.lot_count or 0
				prod_date = frappe.utils.formatdate(link.production_date, 'dd-MM-yyyy') if link.production_date else 'Unknown'
				shift = link.shift_type or 'Unknown'
				
				conflicts.append(
					f"<b>{doc_name}</b>: Main Lot: {main_lot}, Date: {prod_date}, Shift: {shift}, Status: {status}, Linked Lots ({lot_count}): {linked}"
				)
			
			# Log detailed info for debugging
			frappe.logger().error(
				f"OEE Lot Linking validation failed - Circular reference detected:\n"
				f"Current document: {self.name or 'NEW'}\n"
				f"Current lots being linked: {current_lots}\n"
				f"Conflicting documents found: {len(existing_linkings)}"
			)
			
			frappe.throw(
				_("One or more lot numbers are already linked in other active OEE Lot Linking documents:<br><br>{0}<br><br>Please deactivate or cancel the conflicting linkings first.<br><br><small style='color: #666;'>Attempting to link: {1}</small>").format(
					"<br>".join(conflicts),
					", ".join(current_lots)
				),
				title=_("Duplicate Lot Linking Detected")
			)
	
	def on_submit(self):
		"""Actions to perform on submit"""
		# Log submission for audit trail
		frappe.logger().info(f"OEE Lot Linking {self.name} submitted with {len(self.linked_lots)} linked lots")
	
	def on_cancel(self):
		"""Actions to perform on cancel"""
		# Automatically set status to Inactive when cancelled
		frappe.db.set_value(self.doctype, self.name, 'status', 'Inactive', update_modified=False)
		frappe.logger().info(f"OEE Lot Linking {self.name} cancelled and set to Inactive")

@frappe.whitelist()
def find_linkable_lots(production_date, shift_type, machine_reference, item_code=None, operator_name=None):
	"""
	Find production lots that can be linked together
	
	Args:
		production_date: Production date to search
		shift_type: Shift type
		machine_reference: Press/Machine reference
		item_code: Optional item code filter
		operator_name: Optional operator filter
	
	Returns:
		dict: {
			'success': True/False,
			'lots': List of candidate lots,
			'message': Error message if failed
		}
	"""
	try:
		# Build filters
		conditions = []
		values = []
		
		# Basic filters (required)
		conditions.append("DATE(mpe.moulding_date) = %s")
		values.append(production_date)
		
		conditions.append("jc.shift_type = %s")
		values.append(shift_type)
		
		# Machine filter - use LIKE to match partial workstation names
		# Convert machine_reference to actual workstation name pattern
		conditions.append("jc.workstation = %s")
		values.append(f"%{machine_reference}%")
		
		conditions.append("mpe.docstatus = 1")
		
		# Optional filters
		if item_code:
			conditions.append("mpe.item_to_produce = %s")
			values.append(item_code)
		
		if operator_name:
			conditions.append("mpe.employee_name = %s")
			values.append(operator_name)
		
		where_clause = " AND ".join(conditions)
		
		# Query to find all production entries matching criteria
		query = f"""
			SELECT 
				COALESCE(mpe.scan_lot_number, mpe.batch_no) as lot_number,
				mpe.name as production_entry,
				mpe.item_to_produce as item_code,
				mpe.employee_name as operator_name,
				mpe.number_of_lifts,
				mpe.weight as weight_kg,
				mpe.no_of_running_cavities as cavities,
				(mpe.number_of_lifts * mpe.no_of_running_cavities) as total_pieces,
				TIME(mpe.creation) as entry_time,
				jc.workstation as machine_name
			FROM `tabMoulding Production Entry` mpe
			LEFT JOIN `tabJob Card` jc ON mpe.job_card = jc.name
			WHERE {where_clause}
			ORDER BY mpe.creation ASC
		"""
		
		lots = frappe.db.sql(query, values, as_dict=True)
		
		if not lots or len(lots) == 0:
			return {
				'success': False,
				'message': _('No production lots found matching the criteria')
			}
		
		# Check if any of these lots are already linked
		linked_lot_numbers = [lot['lot_number'] for lot in lots]
		
		existing_links = frappe.db.sql("""
			SELECT DISTINCT child.lot_number
			FROM `tabOEE Lot Linking` parent
			INNER JOIN `tabOEE Linked Lot Item` child ON child.parent = parent.name
			WHERE parent.status = 'Active'
			AND child.lot_number IN ({})
		""".format(','.join(['%s'] * len(linked_lot_numbers))), linked_lot_numbers, as_dict=True)
		
		already_linked = {row['lot_number'] for row in existing_links}
		
		# Mark lots that are already linked
		for lot in lots:
			lot['is_already_linked'] = lot['lot_number'] in already_linked
		
		return {
			'success': True,
			'lots': lots,
			'total_lots': len(lots),
			'already_linked_count': len(already_linked)
		}
		
	except Exception as e:
		frappe.log_error(
			title="Find Linkable Lots Error",
			message=f"Error finding linkable lots: {str(e)}\n{frappe.get_traceback()}"
		)
		return {
			'success': False,
			'message': _('Error searching for linkable lots: {0}').format(str(e))
		}
