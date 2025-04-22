frappe.pages['bulk_invoice_entry'].on_page_load = function(wrapper) {
	var page = frappe.ui.make_app_page({
		parent: wrapper,
		title: 'bulk_invoice_entry',
		single_column: true
	});
}