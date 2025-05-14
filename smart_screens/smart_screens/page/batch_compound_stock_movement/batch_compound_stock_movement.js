frappe.pages['batch-compound-stock-movement'].on_page_load = function(wrapper) {
	var page = frappe.ui.make_app_page({
		parent: wrapper,
		title: 'Batch Compound Stock Movement',
		single_column: true
	});
	
	// Initialize page
	new BatchCompoundStockMovement(page);
}

class BatchCompoundStockMovement {
	constructor(page) {
		this.page = page;
		this.make_form();
		this.add_filters();
		
		// Set default date filters
		const today = frappe.datetime.get_today();
		const last_month = frappe.datetime.add_months(today, -1);
		
		this.filters.from_date.set_value(last_month);
		this.filters.to_date.set_value(today);
		
		// Initialize sorting state
		this.sort_by = 'common_code';
		this.sort_order = 'asc';
		
		this.make_report();
	}
	
	make_form() {
		this.form = new frappe.ui.FieldGroup({
			fields: [
				{
					fieldtype: 'Section Break',
					label: 'Filters'
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
					fieldtype: 'Column Break'
				},
				{
					label: 'Item Code',
					fieldtype: 'Data',
					fieldname: 'item_code_filter',
					placeholder: 'Filter by item code...'
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
		
		// Add event listeners to filters
		this.filters.from_date.$input.on('change', () => this.make_report());
		this.filters.to_date.$input.on('change', () => this.make_report());
		
		// Add debounced filter for item code
		this.filters.item_code_filter.$input.on('input', 
			frappe.utils.debounce(() => this.apply_filters(), 300)
		);
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
			method: 'smart_screens.smart_screens.page.batch_compound_stock_movement.batch_compound_stock_movement.get_stock_data',
			args: {
				filters: filters
			},
			callback: (r) => {
				if (r.message && r.message.data) {
					this.original_data = r.message.data;
					this.grand_total = r.message.grand_total;
					this.filtered_data = [...this.original_data];
					this.sort_data();
					this.render_report();
				}
			}
		});
	}
	
	apply_filters() {
		const item_code_filter = this.filters.item_code_filter.get_value();
		
		if (item_code_filter) {
			this.filtered_data = this.original_data.filter(item => 
				item.common_code.toLowerCase().includes(item_code_filter.toLowerCase())
			);
		} else {
			this.filtered_data = [...this.original_data];
		}
		
		this.sort_data();
		this.render_report();
	}
	
	sort_data() {
		// Sort the filtered data based on current sort settings
		this.filtered_data.sort((a, b) => {
			let val_a, val_b;
			
			// Extract values based on sort field
			if (this.sort_by === 'common_code') {
				val_a = a.common_code;
				val_b = b.common_code;
			} else {
				// Parse sort key into category and field
				const [category, field] = this.sort_by.split('_');
				
				if (category && field && a[category] && b[category]) {
					val_a = a[category][field + '_qty'] || 0;
					val_b = b[category][field + '_qty'] || 0;
				} else {
					val_a = 0;
					val_b = 0;
				}
			}
			
			// Compare based on data type
			if (typeof val_a === 'string') {
				// String comparison
				const comparison = val_a.localeCompare(val_b);
				return this.sort_order === 'asc' ? comparison : -comparison;
			} else {
				// Numeric comparison
				const comparison = val_a - val_b;
				return this.sort_order === 'asc' ? comparison : -comparison;
			}
		});
	}
	
	get_sort_icon(field) {
		if (this.sort_by === field) {
			return this.sort_order === 'asc' ? 'fa-sort-up' : 'fa-sort-down';
		}
		return 'fa-sort';
	}
	
	render_report() {
		const data = this.filtered_data;
		const grand_total = this.grand_total;
		
		if (!data || data.length === 0) {
			this.$report_container.html(`<div class="text-muted">No data found</div>`);
			return;
		}
		
		let html = `
			<div class="stock-movement-report">
				<table class="table table-bordered">
					<thead>
						<tr>
							<th rowspan="2" class="common-code-header sortable" data-sort="common_code">
								Common Code <i class="sort-icon fa ${this.get_sort_icon('common_code')}"></i>
							</th>
							<th colspan="4" class="batch-header">Batch</th>
							<th colspan="4" class="compound-header">Compound</th>
							<th colspan="4" class="masterbatch-header">Master Batch</th>
							<th rowspan="2" class="grand-total-header">Total</th>
						</tr>
						<tr>
							<th class="batch-subheader sortable" data-sort="Batch_opening">
								Opening <i class="sort-icon fa ${this.get_sort_icon('Batch_opening')}"></i>
							</th>
							<th class="batch-subheader sortable" data-sort="Batch_incoming">
								Incoming <i class="sort-icon fa ${this.get_sort_icon('Batch_incoming')}"></i>
							</th>
							<th class="batch-subheader sortable" data-sort="Batch_outgoing">
								Outgoing <i class="sort-icon fa ${this.get_sort_icon('Batch_outgoing')}"></i>
							</th>
							<th class="batch-subheader sortable" data-sort="Batch_closing">
								End Stock <i class="sort-icon fa ${this.get_sort_icon('Batch_closing')}"></i>
							</th>
							
							<th class="compound-subheader sortable" data-sort="Compound_opening">
								Opening <i class="sort-icon fa ${this.get_sort_icon('Compound_opening')}"></i>
							</th>
							<th class="compound-subheader sortable" data-sort="Compound_incoming">
								Incoming <i class="sort-icon fa ${this.get_sort_icon('Compound_incoming')}"></i>
							</th>
							<th class="compound-subheader sortable" data-sort="Compound_outgoing">
								Outgoing <i class="sort-icon fa ${this.get_sort_icon('Compound_outgoing')}"></i>
							</th>
							<th class="compound-subheader sortable" data-sort="Compound_closing">
								End Stock <i class="sort-icon fa ${this.get_sort_icon('Compound_closing')}"></i>
							</th>
							
							<th class="masterbatch-subheader sortable" data-sort="Master Batch_opening">
								Opening <i class="sort-icon fa ${this.get_sort_icon('Master Batch_opening')}"></i>
							</th>
							<th class="masterbatch-subheader sortable" data-sort="Master Batch_incoming">
								Incoming <i class="sort-icon fa ${this.get_sort_icon('Master Batch_incoming')}"></i>
							</th>
							<th class="masterbatch-subheader sortable" data-sort="Master Batch_outgoing">
								Outgoing <i class="sort-icon fa ${this.get_sort_icon('Master Batch_outgoing')}"></i>
							</th>
							<th class="masterbatch-subheader sortable" data-sort="Master Batch_closing">
								End Stock <i class="sort-icon fa ${this.get_sort_icon('Master Batch_closing')}"></i>
							</th>
						</tr>
					</thead>
					<tbody>`;
		
		// Add rows for each item
		data.forEach(item => {
			html += `
				<tr>
					<td class="item-code">${item.common_code}</td>
					
					<td class="batch-cell">${this.format_number(item["Batch"].opening_qty)}</td>
					<td class="batch-cell">${this.format_number(item["Batch"].incoming_qty)}</td>
					<td class="batch-cell">${this.format_number(item["Batch"].outgoing_qty)}</td>
					<td class="batch-cell">${this.format_number(item["Batch"].closing_qty)}</td>
					
					<td class="compound-cell">${this.format_number(item["Compound"].opening_qty)}</td>
					<td class="compound-cell">${this.format_number(item["Compound"].incoming_qty)}</td>
					<td class="compound-cell">${this.format_number(item["Compound"].outgoing_qty)}</td>
					<td class="compound-cell">${this.format_number(item["Compound"].closing_qty)}</td>
					
					<td class="masterbatch-cell">${this.format_number(item["Master Batch"].opening_qty)}</td>
					<td class="masterbatch-cell">${this.format_number(item["Master Batch"].incoming_qty)}</td>
					<td class="masterbatch-cell">${this.format_number(item["Master Batch"].outgoing_qty)}</td>
					<td class="masterbatch-cell">${this.format_number(item["Master Batch"].closing_qty)}</td>
					
					<td class="grand-total-cell">${this.format_number(item["total"].closing_qty)}</td>
				</tr>`;
		});
		
		// Add grand total row
		html += `
			<tr class="grand-total-row">
				<td class="total-label"><strong>Grand Total</strong></td>
				
				<td class="batch-total"><strong>${this.format_number(grand_total["Batch"].opening_qty)}</strong></td>
				<td class="batch-total"><strong>${this.format_number(grand_total["Batch"].incoming_qty)}</strong></td>
				<td class="batch-total"><strong>${this.format_number(grand_total["Batch"].outgoing_qty)}</strong></td>
				<td class="batch-total"><strong>${this.format_number(grand_total["Batch"].closing_qty)}</strong></td>
				
				<td class="compound-total"><strong>${this.format_number(grand_total["Compound"].opening_qty)}</strong></td>
				<td class="compound-total"><strong>${this.format_number(grand_total["Compound"].incoming_qty)}</strong></td>
				<td class="compound-total"><strong>${this.format_number(grand_total["Compound"].outgoing_qty)}</strong></td>
				<td class="compound-total"><strong>${this.format_number(grand_total["Compound"].closing_qty)}</strong></td>
				
				<td class="masterbatch-total"><strong>${this.format_number(grand_total["Master Batch"].opening_qty)}</strong></td>
				<td class="masterbatch-total"><strong>${this.format_number(grand_total["Master Batch"].incoming_qty)}</strong></td>
				<td class="masterbatch-total"><strong>${this.format_number(grand_total["Master Batch"].outgoing_qty)}</strong></td>
				<td class="masterbatch-total"><strong>${this.format_number(grand_total["Master Batch"].closing_qty)}</strong></td>
				
				<td class="grand-total-total"><strong>${this.format_number(grand_total.closing_qty)}</strong></td>
			</tr>`;
		
		html += `
					</tbody>
				</table>
			</div>
		`;
		
		this.$report_container.html(html);
		this.apply_styles();
		this.bind_events();
	}
	
	bind_events() {
		// Bind sorting events
		this.$report_container.find('.sortable').on('click', (e) => {
			const sort_field = $(e.currentTarget).data('sort');
			
			// Toggle sort order if same field clicked again
			if (this.sort_by === sort_field) {
				this.sort_order = this.sort_order === 'asc' ? 'desc' : 'asc';
			} else {
				this.sort_by = sort_field;
				this.sort_order = 'asc';
			}
			
			this.sort_data();
			this.render_report();
		});
	}
	
	format_number(value) {
		return frappe.format(value || 0, {fieldtype: 'Float', precision: 2});
	}
	
	apply_styles() {
		// Add custom styles for the report with colorful headers
		$("<style>")
			.prop("type", "text/css")
			.html(`
				.stock-movement-report {
					overflow-x: auto;
				}
				.stock-movement-report table {
					min-width: 100%;
					border-collapse: collapse;
					box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
				}
				.stock-movement-report th {
					font-weight: bold;
					text-align: center;
					vertical-align: middle !important;
					padding: 8px 10px;
					border: 1px solid #dee2e6;
					position: relative;
					white-space: nowrap;
				}
				.stock-movement-report td {
					text-align: right;
					padding: 6px 10px;
					border: 1px solid #dee2e6;
				}
				.sortable {
					cursor: pointer;
				}
				.sortable:hover {
					background-color: rgba(0, 0, 0, 0.05);
				}
				.sort-icon {
					margin-left: 5px;
				}
				
				/* Header Styling */
				.common-code-header {
					background-color: #343a40;
					color: white;
					font-weight: bold;
				}
				
				/* Batch Header */
				.batch-header {
					background-color: #3498db;
					color: white;
					font-weight: bold;
				}
				.batch-subheader {
					background-color: #5dade2;
					color: white;
				}
				.batch-cell {
					background-color: #ebf5fb;
				}
				.batch-total {
					background-color: #d6eaf8;
					font-weight: bold;
				}
				
				/* Compound Header */
				.compound-header {
					background-color: #e74c3c;
					color: white;
					font-weight: bold;
				}
				.compound-subheader {
					background-color: #ec7063;
					color: white;
				}
				.compound-cell {
					background-color: #fdedec;
				}
				.compound-total {
					background-color: #f5b7b1;
					font-weight: bold;
				}
				
				/* Master Batch Header */
				.masterbatch-header {
					background-color: #2ecc71;
					color: white;
					font-weight: bold;
				}
				.masterbatch-subheader {
					background-color: #58d68d;
					color: white;
				}
				.masterbatch-cell {
					background-color: #eafaf1;
				}
				.masterbatch-total {
					background-color: #abebc6;
					font-weight: bold;
				}
				
				/* Grand Total Header */
				.grand-total-header {
					background-color: #9b59b6;
					color: white;
					font-weight: bold;
				}
				.grand-total-cell {
					background-color: #f4ecf7;
					font-weight: bold;
				}
				.grand-total-total {
					background-color: #d2b4de;
					font-weight: bold;
				}
				
				/* Common Styles */
				.stock-movement-report td:first-child {
					text-align: left;
					background-color: #f8f9fa;
					font-weight: bold;
				}
				.grand-total-row {
					border-top: 2px solid #666;
				}
				.total-label {
					background-color: #343a40 !important;
					color: white;
					font-weight: bold;
				}
				
				/* Hover effects */
				.stock-movement-report tbody tr:hover td {
					box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.1);
				}
			`)
			.appendTo("head");
	}
}