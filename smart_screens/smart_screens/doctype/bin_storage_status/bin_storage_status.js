// Copyright (c) 2025, Alphaworkz and contributors
// For license information, please see license.txt

frappe.ui.form.on('Bin Storage Status', {
	refresh: function(frm) {
		// Simple status indicator only
		if (frm.doc.status === 1) {
			frm.dashboard.set_headline_alert('Checked In', 'green');
		} else {
			frm.dashboard.set_headline_alert('Checked Out', 'blue');
		}
		
		// Show FIFO warning if present
		if (frm.doc.remarks && frm.doc.remarks.includes('FIFO missed')) {
			frm.dashboard.set_headline_alert('⚠️ FIFO Violation', 'orange');
		}
		
		// Disable form - this is a ledger record, not meant to be edited manually
		frm.disable_save();
		
		// Show message that this is a system-generated record
		if (!frm.is_new()) {
			frappe.msgprint({
				title: __('System Record'),
				message: __('This is a system-generated ledger record. Use Check-In/Check-Out pages to manage bin storage.'),
				indicator: 'blue'
			});
		}
	},
	
	warehouse: function(frm) {
		// Filter racks based on selected warehouse
		if (frm.doc.warehouse) {
			frm.set_query('rack_id', function() {
				return {
					filters: {
						'warehouse_name': frm.doc.warehouse,
						'docstatus': 1  // Only submitted racks
					}
				};
			});
		}
	},
	
	batch: function(frm) {
		// Auto-fetch item code when batch is selected
		if (frm.doc.batch) {
			frappe.call({
				method: 'frappe.client.get_value',
				args: {
					doctype: 'Batch',
					filters: { name: frm.doc.batch },
					fieldname: ['item', 'item_name']
				},
				callback: function(r) {
					if (r.message) {
						frm.set_value('item_code', r.message.item);
					}
				}
			});
		}
	}
});
