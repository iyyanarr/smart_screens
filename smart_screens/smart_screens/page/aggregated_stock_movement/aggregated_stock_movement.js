frappe.pages['aggregated-stock-movement'].on_page_load = function(wrapper) {
	var page = frappe.ui.make_app_page({
		parent: wrapper,
		title: 'Aggregated Stock Movement',
		single_column: true
	});
	
	// Initialize page
	new AggregatedStockMovement(page);
}

class AggregatedStockMovement {
	constructor(page) {
		this.page = page;
		this.make_form();
		this.add_filters();
		
		// Set default date filters
		const today = frappe.datetime.get_today();
		const last_month = frappe.datetime.add_months(today, -1);
		
		this.filters.from_date.set_value(last_month);
		this.filters.to_date.set_value(today);
		
		this.make_report();
	}
	
	make_form() {
		this.form = new frappe.ui.FieldGroup({
			fields: [
				{
					fieldtype: 'Section Break',
					label: 'Date Range'
				},
				{
					label: 'From Date',
					fieldtype: 'Date',
					fieldname: 'from_date',
					reqd: 1,
					default: frappe.datetime.add_months(frappe.datetime.get_today(), -1)
				},
				{
					fieldtype: 'Column Break'
				},
				{
					label: 'To Date',
					fieldtype: 'Date',
					fieldname: 'to_date',
					reqd: 1,
					default: frappe.datetime.get_today()
				},
				{
					fieldtype: 'Section Break'
				}
			],
			body: this.page.body
		});
		
		this.form.make();
		this.filters = this.form.fields_dict;
	}
	
	add_filters() {
		this.page.add_inner_button(__('Refresh'), () => this.make_report());
		
		// Add event listeners to date filters
		this.filters.from_date.$input.on('change', () => this.make_report());
		this.filters.to_date.$input.on('change', () => this.make_report());
	}
	
	make_report() {
		const filters = {
			from_date: this.filters.from_date.get_value(),
			to_date: this.filters.to_date.get_value()
		};
		
		// Clear any previous report
		this.page.main.find('.report-container').remove();
		
		// Add container for the report
		this.$report_container = $('<div class="report-container">').appendTo(this.page.main);
		this.$report_container.html(`<div class="text-muted">Loading report...</div>`);
		
		frappe.call({
			method: 'smart_screens.smart_screens.page.aggregated_stock_movement.aggregated_stock_movement.get_aggregated_stock_data',
			args: {
				filters: filters
			},
			callback: (r) => {
				if (r.message && r.message.data) {
					this.render_report(r.message);
				}
			}
		});
	}
	
	render_report(result) {
		const data = result.data;
		const grand_total = result.grand_total;
		
		if (!data || data.length === 0) {
			this.$report_container.html(`<div class="text-muted">No data found</div>`);
			return;
		}
		
		let html = `
			<div class="stock-movement-report">
				<table class="table table-bordered">
					<thead>
						<tr>
							<th rowspan="2">Common Code</th>
							<th colspan="4">Finished Product</th>
							<th colspan="4">Mat</th>
							<th colspan="4">Products</th>
							<th colspan="4">Grand Total</th>
						</tr>
						<tr>
							<th>Opening Stock</th>
							<th>Incoming</th>
							<th>Outgoing</th>
							<th>End Stock</th>
							
							<th>Opening Stock</th>
							<th>Incoming</th>
							<th>Outgoing</th>
							<th>End Stock</th>
							
							<th>Opening Stock</th>
							<th>Incoming</th>
							<th>Outgoing</th>
							<th>End Stock</th>
							
							<th>Opening Stock</th>
							<th>Incoming</th>
							<th>Outgoing</th>
							<th>End Stock</th>
						</tr>
					</thead>
					<tbody>`;
		
		// Add rows for each item group
		data.forEach(item => {
			html += `
				<tr>
					<td>${item.common_code}</td>
					
					<td>${this.format_number(item["Finished Product"].opening_qty)}</td>
					<td>${this.format_number(item["Finished Product"].incoming_qty)}</td>
					<td>${this.format_number(item["Finished Product"].outgoing_qty)}</td>
					<td>${this.format_number(item["Finished Product"].closing_qty)}</td>
					
					<td>${this.format_number(item["Mat"].opening_qty)}</td>
					<td>${this.format_number(item["Mat"].incoming_qty)}</td>
					<td>${this.format_number(item["Mat"].outgoing_qty)}</td>
					<td>${this.format_number(item["Mat"].closing_qty)}</td>
					
					<td>${this.format_number(item["Products"].opening_qty)}</td>
					<td>${this.format_number(item["Products"].incoming_qty)}</td>
					<td>${this.format_number(item["Products"].outgoing_qty)}</td>
					<td>${this.format_number(item["Products"].closing_qty)}</td>
					
					<td>${this.format_number(item["total"].opening_qty)}</td>
					<td>${this.format_number(item["total"].incoming_qty)}</td>
					<td>${this.format_number(item["total"].outgoing_qty)}</td>
					<td>${this.format_number(item["total"].closing_qty)}</td>
				</tr>`;
		});
		
		// Add grand total row
		html += `
			<tr class="grand-total">
				<td><strong>Grand Total</strong></td>
				
				<td colspan="16"><strong>${this.format_number(grand_total.opening_qty)}</strong></td>
				<td><strong>${this.format_number(grand_total.incoming_qty)}</strong></td>
				<td><strong>${this.format_number(grand_total.outgoing_qty)}</strong></td>
				<td><strong>${this.format_number(grand_total.closing_qty)}</strong></td>
			</tr>`;
		
		html += `
					</tbody>
				</table>
			</div>
		`;
		
		this.$report_container.html(html);
		this.apply_styles();
	}
	
	format_number(value) {
		return frappe.format(value || 0, {fieldtype: 'Float', precision: 2});
	}
	
	apply_styles() {
		// Add custom styles for the report
		$("<style>")
			.prop("type", "text/css")
			.html(`
				.stock-movement-report {
					overflow-x: auto;
				}
				.stock-movement-report table {
					min-width: 100%;
				}
				.stock-movement-report th {
					background-color: #f0f4f7;
					font-weight: bold;
					text-align: center;
					vertical-align: middle !important;
				}
				.stock-movement-report td {
					text-align: right;
					padding: 5px 10px;
				}
				.stock-movement-report td:first-child {
					text-align: left;
				}
				.grand-total td {
					background-color: #eef9fe;
					font-weight: bold;
				}
			`)
			.appendTo("head");
	}
}