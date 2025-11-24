// Copyright (c) 2025, Aggregated Report and contributors
// For license information, please see license.txt

frappe.ui.form.on('Moulding Batch Conversion', {
	refresh: function(frm) {
		// Add custom buttons or actions on form load
		if (frm.doc.status === 'Active') {
			frm.add_custom_button(__('Mark as Inactive'), function() {
				frm.set_value('status', 'Inactive');
				frm.save();
			});
		}
		
		// Show calculated conversion info
		if (frm.doc.conversion_factor && frm.doc.net_qty_kg) {
			frm.dashboard.add_indicator(
				__('Conversion: {0} nos/kg', [frm.doc.conversion_factor.toFixed(4)]),
				'blue'
			);
		}
		
		// Add link to production entry
		if (frm.doc.production_entry) {
			frm.add_custom_button(__('View Production Entry'), function() {
				frappe.set_route('Form', 'Moulding Production Entry', frm.doc.production_entry);
			}, __('Links'));
		}
	},
	
	cavities_per_cycle: function(frm) {
		calculate_conversion_factor(frm);
	},
	
	shots: function(frm) {
		calculate_conversion_factor(frm);
	},
	
	net_qty_kg: function(frm) {
		calculate_conversion_factor(frm);
	},
	
	gross_qty_kg: function(frm) {
		// Auto-calculate rejects if gross and net are available
		if (frm.doc.gross_qty_kg && frm.doc.net_qty_kg) {
			let rejects = frm.doc.gross_qty_kg - frm.doc.net_qty_kg;
			if (rejects > 0) {
				frm.set_value('rejects_qty_kg', rejects);
			}
		}
	}
});

function calculate_conversion_factor(frm) {
	// Calculate conversion factor: (cavities × shots) / net_qty_kg
	if (frm.doc.cavities_per_cycle && frm.doc.shots && frm.doc.net_qty_kg > 0) {
		let conversion = (frm.doc.cavities_per_cycle * frm.doc.shots) / frm.doc.net_qty_kg;
		frm.set_value('conversion_factor', conversion);
		
		// Show message
		frappe.show_alert({
			message: __('Conversion Factor Updated: {0} nos/kg', [conversion.toFixed(4)]),
			indicator: 'green'
		});
	}
}
