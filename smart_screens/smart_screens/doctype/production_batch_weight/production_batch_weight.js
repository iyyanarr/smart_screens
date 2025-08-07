// Copyright (c) 2025, alphaworkz and contributors
// For license information, please see license.txt

frappe.ui.form.on('Production Batch Weight', {
	refresh: function(frm) {
		// Add custom button to populate blank weight
		if (!frm.doc.__islocal) {
			frm.add_custom_button(__('Refresh Blank Weight'), function() {
				frm.call('populate_blank_weight').then(() => {
					frm.refresh();
				});
			});
		}
		
		// Add button to populate all batch weights (only for System Manager)
		if (frappe.user.has_role('System Manager')) {
			frm.add_custom_button(__('Populate All Batch Weights'), function() {
				frappe.confirm('This will create Production Batch Weight records for all Moulding Production Entries. Continue?', 
					function() {
						frappe.call({
							method: 'smart_screens.smart_screens.doctype.production_batch_weight.production_batch_weight.populate_all_batch_weights',
							callback: function(r) {
								if (r.message) {
									frappe.msgprint(r.message);
									frm.refresh();
								}
							}
						});
					}
				);
			}, __('Tools'));
		}
	},
	
	batch_no: function(frm) {
		// Auto-populate blank weight when batch is selected
		if (frm.doc.batch_no && !frm.doc.blank_wt) {
			frm.call('populate_blank_weight').then(() => {
				frm.refresh_fields();
			});
		}
	}
});
