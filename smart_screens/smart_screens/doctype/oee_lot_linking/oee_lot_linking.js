// Copyright (c) 2025, Tridots Tech and contributors
// For license information, please see license.txt

frappe.ui.form.on('OEE Lot Linking', {
	refresh: function(frm) {
		// Add "Find Linkable Lots" button
		if (frm.doc.__islocal || frm.doc.docstatus === 0) {
			frm.add_custom_button(__('🔍 Find Linkable Lots'), function() {
				find_linkable_lots(frm);
			}).addClass('btn-primary');
		}

		// Add custom buttons based on status
		if (frm.doc.docstatus === 1 && frm.doc.status === 'Active') {
			frm.add_custom_button(__('Set Inactive'), function() {
				frappe.confirm(
					__('Are you sure you want to deactivate this lot linking?'),
					function() {
						frappe.call({
							method: 'frappe.client.set_value',
							args: {
								doctype: 'OEE Lot Linking',
								name: frm.doc.name,
								fieldname: 'status',
								value: 'Inactive'
							},
							callback: function(r) {
								if (!r.exc) {
									frappe.show_alert({
										message: __('Lot linking deactivated'),
										indicator: 'orange'
									});
									frm.reload_doc();
								}
							}
						});
					}
				);
			});
		}
		
		// Show warning if trying to link lots from different contexts
		if (frm.doc.__islocal && frm.doc.linked_lots && frm.doc.linked_lots.length > 0) {
			validate_lot_context(frm);
		}
	},
	
	main_lot_number: function(frm) {
		// Auto-add main lot to linked lots table if not present
		if (frm.doc.main_lot_number && frm.doc.linked_lots) {
			let lot_exists = frm.doc.linked_lots.some(row => row.lot_number === frm.doc.main_lot_number);
			
			if (!lot_exists) {
				let row = frm.add_child('linked_lots');
				row.lot_number = frm.doc.main_lot_number;
				frm.refresh_field('linked_lots');
			}
		}
	},
	
	production_date: function(frm) {
		// Clear linked lots when production date changes
		if (frm.doc.linked_lots && frm.doc.linked_lots.length > 0) {
			frappe.confirm(
				__('Changing production date will clear linked lots. Continue?'),
				function() {
					frm.clear_table('linked_lots');
					frm.refresh_field('linked_lots');
				},
				function() {
					// Revert production_date change
					frm.reload_doc();
				}
			);
		}
	}
});

frappe.ui.form.on('OEE Linked Lot Item', {
	lot_number: function(frm, cdt, cdn) {
		// Validate lot number when added
		let row = locals[cdt][cdn];
		
		if (row.lot_number && frm.doc.production_date && frm.doc.shift_type && frm.doc.machine_reference) {
			validate_single_lot(frm, row.lot_number);
		}
	}
});

function validate_lot_context(frm) {
	// Validate that all lots belong to same production context
	let lot_numbers = frm.doc.linked_lots.map(row => row.lot_number).filter(Boolean);
	
	if (lot_numbers.length === 0) return;
	
	frappe.call({
		method: 'frappe.client.get_list',
		args: {
			doctype: 'Moulding Production Entry',
			filters: [
				['scan_lot_number', 'in', lot_numbers]
			],
			fields: ['scan_lot_number', 'moulding_date', 'item_to_produce', 'employee_name'],
			limit: 100
		},
		callback: function(r) {
			if (r.message && r.message.length > 0) {
				// Check if all lots have consistent data
				let first_entry = r.message[0];
				let inconsistent = r.message.filter(entry => 
					entry.item_to_produce !== first_entry.item_to_produce
				);
				
				if (inconsistent.length > 0) {
					frappe.msgprint({
						title: __('Warning'),
						indicator: 'orange',
						message: __('Some linked lots have different item codes. Please verify.')
					});
				}
			}
		}
	});
}

function validate_single_lot(frm, lot_number) {
	// Validate a single lot number against production context
	frappe.call({
		method: 'frappe.client.get_list',
		args: {
			doctype: 'Moulding Production Entry',
			filters: [
				['scan_lot_number', '=', lot_number],
				['docstatus', '=', 1]
			],
			fields: ['name', 'moulding_date', 'item_to_produce', 'employee_name'],
			limit: 1
		},
		callback: function(r) {
			if (!r.message || r.message.length === 0) {
				frappe.msgprint({
					title: __('Warning'),
					indicator: 'orange',
					message: __('No submitted production entry found for lot {0}', [lot_number])
				});
			} else {
				let entry = r.message[0];
				
				// Auto-fill fields if empty
				if (!frm.doc.production_date && entry.moulding_date) {
					frm.set_value('production_date', entry.moulding_date);
				}
				
				if (!frm.doc.item_code && entry.item_to_produce) {
					frm.set_value('item_code', entry.item_to_produce);
				}
				
				if (!frm.doc.operator_name && entry.employee_name) {
					frm.set_value('operator_name', entry.employee_name);
				}
			}
		}
	});
}

function find_linkable_lots(frm) {
	// Validate required fields
	if (!frm.doc.production_date) {
		frappe.msgprint(__('Please select Production Date first'));
		return;
	}
	
	if (!frm.doc.shift_type) {
		frappe.msgprint(__('Please select Shift Type first'));
		return;
	}
	
	if (!frm.doc.machine_reference) {
		frappe.msgprint(__('Please select Press/Machine first'));
		return;
	}
	
	// Show loading indicator
	frappe.show_alert({
		message: __('Searching for linkable lots...'),
		indicator: 'blue'
	});
	
	// Call server-side method to find candidate lots
	frappe.call({
		method: 'smart_screens.smart_screens.doctype.oee_lot_linking.oee_lot_linking.find_linkable_lots',
		args: {
			production_date: frm.doc.production_date,
			shift_type: frm.doc.shift_type,
			machine_reference: frm.doc.machine_reference,
			item_code: frm.doc.item_code || null,
			operator_name: frm.doc.operator_name || null
		},
		callback: function(r) {
			if (r.message && r.message.success) {
				show_linkable_lots_dialog(frm, r.message.lots);
			} else {
				frappe.msgprint({
					title: __('No Linkable Lots Found'),
					indicator: 'orange',
					message: r.message.message || __('No production lots found matching the criteria')
				});
			}
		}
	});
}

function show_linkable_lots_dialog(frm, lots) {
	if (!lots || lots.length === 0) {
		frappe.msgprint(__('No linkable lots found'));
		return;
	}
	
	// Create dialog to show candidate lots
	let dialog = new frappe.ui.Dialog({
		title: __('Found {0} Linkable Lots', [lots.length]),
		size: 'large',
		fields: [
			{
				fieldname: 'info',
				fieldtype: 'HTML',
				options: get_lots_info_html(lots)
			},
			{
				fieldname: 'lots_table',
				fieldtype: 'HTML',
				options: get_lots_table_html(lots)
			}
		],
		primary_action_label: __('Link Selected Lots'),
		primary_action: function(values) {
			// Get selected lots
			let selected_lots = [];
			$('.lot-checkbox:checked').each(function() {
				selected_lots.push($(this).data('lot'));
			});
			
			if (selected_lots.length === 0) {
				frappe.msgprint(__('Please select at least one lot to link'));
				return;
			}
			
			// Add selected lots to the child table
			frm.clear_table('linked_lots');
			
			selected_lots.forEach(lot_number => {
				let row = frm.add_child('linked_lots');
				row.lot_number = lot_number;
			});
			
			frm.refresh_field('linked_lots');
			
			// Set main lot as the first selected lot
			if (!frm.doc.main_lot_number && selected_lots.length > 0) {
				frm.set_value('main_lot_number', selected_lots[0]);
			}
			
			// Auto-fill item code if not set
			let first_lot_data = lots.find(l => l.lot_number === selected_lots[0]);
			if (first_lot_data && !frm.doc.item_code) {
				frm.set_value('item_code', first_lot_data.item_code);
			}
			
			if (first_lot_data && !frm.doc.operator_name) {
				frm.set_value('operator_name', first_lot_data.operator_name);
			}
			
			frappe.show_alert({
				message: __('Added {0} lots for linking', [selected_lots.length]),
				indicator: 'green'
			});
			
			dialog.hide();
		}
	});
	
	dialog.show();
}

function get_lots_info_html(lots) {
	let total_lifts = lots.reduce((sum, lot) => sum + lot.number_of_lifts, 0);
	let total_weight = lots.reduce((sum, lot) => sum + lot.weight_kg, 0);
	let total_pieces = lots.reduce((sum, lot) => sum + lot.total_pieces, 0);
	
	return `
		<div class="alert alert-info" style="margin-bottom: 15px;">
			<strong>📊 Summary:</strong><br>
			<table style="width: 100%; margin-top: 10px;">
				<tr>
					<td><strong>Total Lots:</strong></td>
					<td>${lots.length}</td>
					<td><strong>Total Lifts:</strong></td>
					<td>${total_lifts}</td>
				</tr>
				<tr>
					<td><strong>Total Weight:</strong></td>
					<td>${total_weight.toFixed(2)} kg</td>
					<td><strong>Total Pieces:</strong></td>
					<td>${total_pieces.toLocaleString()}</td>
				</tr>
			</table>
		</div>
		<p style="margin-bottom: 10px;">
			<strong>Instructions:</strong> Select the lots you want to link together. 
			The first selected lot will become the Main Lot Number.
		</p>
	`;
}

function get_lots_table_html(lots) {
	let html = `
		<div style="max-height: 400px; overflow-y: auto;">
			<table class="table table-bordered table-hover" style="margin-bottom: 0;">
				<thead style="position: sticky; top: 0; background: white; z-index: 10;">
					<tr>
						<th style="width: 40px;">
							<input type="checkbox" id="select-all-lots" style="cursor: pointer;">
						</th>
						<th>Lot Number</th>
						<th>Entry Time</th>
						<th style="text-align: right;">Lifts</th>
						<th style="text-align: right;">Weight (kg)</th>
						<th style="text-align: right;">Pieces</th>
						<th>Operator</th>
					</tr>
				</thead>
				<tbody>
	`;
	
	lots.forEach((lot, index) => {
		html += `
			<tr>
				<td style="text-align: center;">
					<input type="checkbox" class="lot-checkbox" data-lot="${lot.lot_number}" 
						   ${index === 0 ? 'checked' : ''} style="cursor: pointer;">
				</td>
				<td><strong>${lot.lot_number}</strong></td>
				<td><small>${lot.entry_time}</small></td>
				<td style="text-align: right;">${lot.number_of_lifts}</td>
				<td style="text-align: right;">${lot.weight_kg.toFixed(2)}</td>
				<td style="text-align: right;">${lot.total_pieces.toLocaleString()}</td>
				<td><small>${lot.operator_name || '-'}</small></td>
			</tr>
		`;
	});
	
	html += `
				</tbody>
			</table>
		</div>
		<script>
			// Select/Deselect all lots
			$('#select-all-lots').on('change', function() {
				$('.lot-checkbox').prop('checked', $(this).prop('checked'));
			});
			
			// Update select-all checkbox state
			$('.lot-checkbox').on('change', function() {
				let all_checked = $('.lot-checkbox').length === $('.lot-checkbox:checked').length;
				$('#select-all-lots').prop('checked', all_checked);
			});
		</script>
	`;
	
	return html;
}
