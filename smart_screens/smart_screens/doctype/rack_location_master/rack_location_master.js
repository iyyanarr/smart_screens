// Copyright (c) 2025, Alphaworkz and contributors
// For license information, please see license.txt

frappe.ui.form.on('Rack Location Master', {
	refresh: function(frm) {
		// Add custom button to regenerate barcode
		if (frm.doc.warehouse_name && frm.doc.rack_id && !frm.is_new()) {
			frm.add_custom_button(__('Regenerate Barcode'), function() {
				frappe.call({
					method: 'smart_screens.smart_screens.doctype.rack_location_master.rack_location_master.regenerate_barcode',
					args: {
						docname: frm.doc.name
					},
					callback: function(r) {
						if (r.message && r.message.status === 'success') {
							frappe.msgprint(__('Barcode regenerated successfully'));
							frm.reload_doc();
						} else {
							frappe.msgprint({
								title: __('Error'),
								message: r.message ? r.message.message : __('Failed to regenerate barcode'),
								indicator: 'red'
							});
						}
					}
				});
			});
		}
		
		 // Show barcode prominently
		if (frm.doc.barcode) {
			frm.set_df_property('barcode', 'description', 
				`<strong>Barcode: ${frm.doc.barcode}</strong>`);
		}
	},
	
	rack_id: function(frm) {
		// Convert rack_id to uppercase for consistency
		if (frm.doc.rack_id) {
			frm.set_value('rack_id', frm.doc.rack_id.toUpperCase());
		}
	}
});
