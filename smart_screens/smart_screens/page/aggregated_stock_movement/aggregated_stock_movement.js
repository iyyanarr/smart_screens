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
		
		// Initialize sorting state: default to Total (closing) DESC
		this.sort_by = 'total';
		this.sort_order = 'desc';
		
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
					fieldtype: 'Column Break'
				},
				{
					label: 'Warehouse',
					fieldtype: 'Link',
					fieldname: 'warehouse',
					options: 'Warehouse'
				},
				{
					fieldtype: 'Column Break'
				},
				{
					label: 'Warehouse Type',
					fieldtype: 'Link',
					fieldname: 'warehouse_type',
					options: 'Warehouse Type'
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
		this.page.add_inner_button(__('Validate Data'), () => this.validate_data());
		// Add Export CSV button
		this.page.add_inner_button(__('Export CSV'), () => this.export_to_csv());
		
		// Add event listeners to filters
		this.filters.from_date.$input.on('change', () => this.make_report());
		this.filters.to_date.$input.on('change', () => this.make_report());
		this.filters.warehouse.$input.on('change', () => this.make_report());
		this.filters.warehouse_type.$input.on('change', () => this.make_report());
		
		// Add debounced filter for item code
		this.filters.item_code_filter.$input.on('input', 
			frappe.utils.debounce(() => this.apply_filters(), 300)
		);
	}
	
	validate_data() {
		frappe.call({
			method: 'smart_screens.smart_screens.page.aggregated_stock_movement.aggregated_stock_movement.validate_aggregation_accuracy',
			args: {
				filters: {
					from_date: this.filters.from_date.get_value(),
					to_date: this.filters.to_date.get_value()
				}
			},
			callback: (r) => {
				if (r.message) {
					console.log('Validation Data:', r.message);
					frappe.msgprint({
						title: __('Data Validation'),
						message: __('Validation completed. Check browser console for detailed comparison.'),
						indicator: 'blue'
					});
				}
			}
		});
	}
	
	make_report() {
		const filters = {
			from_date: this.filters.from_date.get_value(),
			to_date: this.filters.to_date.get_value(),
			warehouse: this.filters.warehouse.get_value(),
			warehouse_type: this.filters.warehouse_type.get_value()
		};
		
		// Clear any previous report
		this.page.main.find('.report-container').remove();
		
		// Add container for the report
		this.$report_container = $('<div class="report-container">').appendTo(this.page.main);
		this.$report_container.html(`<div class="text-muted">Loading report...</div>`);				frappe.call({
			method: 'smart_screens.smart_screens.page.aggregated_stock_movement.aggregated_stock_movement.get_aggregated_stock_data',
			args: {
				filters: filters
			},
			callback: (r) => {
				if (r.message && r.message.data) {
					this.original_data = r.message.data;
					this.grand_total = r.message.grand_total;
					this.mat_uom = "Nos";  // Always Nos since we apply conversion to all Mat items
					this.has_converted_mat_items = true;  // Always true since we convert all Mat items
					this.warehouse_filter = r.message.warehouse_filter || "All Warehouses";
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
			
			if (this.sort_by === 'common_code') {
				val_a = a.common_code;
				val_b = b.common_code;
			} else if (this.sort_by === 'total') {
				val_a = (a["total"] && a["total"].closing_qty) || 0;
				val_b = (b["total"] && b["total"].closing_qty) || 0;
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
			
			if (typeof val_a === 'string') {
				const comparison = val_a.localeCompare(val_b);
				return this.sort_order === 'asc' ? comparison : -comparison;
			} else {
				const comparison = (val_a - val_b);
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
				<div class="table-container">
					<table class="table table-bordered sticky-table">
						<thead>
							<tr>
								<th rowspan="2" class="common-code-header sortable sticky-column" data-sort="common_code">
									Common Code <i class="sort-icon fa ${this.get_sort_icon('common_code')}"></i>
								</th>
								<th colspan="4" class="mat-header">Mat (Nos)</th>
								<th colspan="4" class="products-header">Products</th>
								<th colspan="4" class="finished-product-header">Finished Product</th>
								<th rowspan="2" class="grand-total-header sortable" data-sort="total">Total <i class="sort-icon fa ${this.get_sort_icon('total')}"></i></th>
							</tr>
							<tr>
								<th class="mat-subheader sortable" data-sort="Mat_opening">
									Opening <i class="sort-icon fa ${this.get_sort_icon('Mat_opening')}"></i>
								</th>
								<th class="mat-subheader sortable" data-sort="Mat_incoming">
									Incoming <i class="sort-icon fa ${this.get_sort_icon('Mat_incoming')}"></i>
								</th>
								<th class="mat-subheader sortable" data-sort="Mat_outgoing">
									Outgoing <i class="sort-icon fa ${this.get_sort_icon('Mat_outgoing')}"></i>
								</th>
								<th class="mat-subheader sortable" data-sort="Mat_closing">
									End Stock <i class="sort-icon fa ${this.get_sort_icon('Mat_closing')}"></i>
								</th>
								
								<th class="products-subheader sortable" data-sort="Products_opening">
									Opening <i class="sort-icon fa ${this.get_sort_icon('Products_opening')}"></i>
								</th>
								<th class="products-subheader sortable" data-sort="Products_incoming">
									Incoming <i class="sort-icon fa ${this.get_sort_icon('Products_incoming')}"></i>
								</th>
								<th class="products-subheader sortable" data-sort="Products_outgoing">
									Outgoing <i class="sort-icon fa ${this.get_sort_icon('Products_outgoing')}"></i>
								</th>
								<th class="products-subheader sortable" data-sort="Products_closing">
									End Stock <i class="sort-icon fa ${this.get_sort_icon('Products_closing')}"></i>
								</th>
								
								<th class="finished-product-subheader sortable" data-sort="Finished Product_opening">
									Opening <i class="sort-icon fa ${this.get_sort_icon('Finished Product_opening')}"></i>
								</th>
								<th class="finished-product-subheader sortable" data-sort="Finished Product_incoming">
									Incoming <i class="sort-icon fa ${this.get_sort_icon('Finished Product_incoming')}"></i>
								</th>
								<th class="finished-product-subheader sortable" data-sort="Finished Product_outgoing">
									Outgoing <i class="sort-icon fa ${this.get_sort_icon('Finished Product_outgoing')}"></i>
								</th>
								<th class="finished-product-subheader sortable" data-sort="Finished Product_closing">
									End Stock <i class="sort-icon fa ${this.get_sort_icon('Finished Product_closing')}"></i>
								</th>
							</tr>
						</thead>
						<tbody>`;
		
		// Add rows for each item
		data.forEach(item => {
			html += `
				<tr>
					<td class="item-code sticky-column"><a href="#" class="common-code-link" data-code="${item.common_code}" title="View item codes and stock ledger entries">${item.common_code}</a></td>
					
					<td class="mat-cell">${this.format_number(item["Mat"].opening_qty)}</td>
					<td class="mat-cell">${this.format_number(item["Mat"].incoming_qty)}</td>
					<td class="mat-cell">${this.format_number(item["Mat"].outgoing_qty)}</td>
					<td class="mat-cell">${this.format_number(item["Mat"].closing_qty)}</td>
					
					<td class="products-cell">${this.format_number(item["Products"].opening_qty)}</td>
					<td class="products-cell">${this.format_number(item["Products"].incoming_qty)}</td>
					<td class="products-cell">${this.format_number(item["Products"].outgoing_qty)}</td>
					<td class="products-cell">${this.format_number(item["Products"].closing_qty)}</td>
					
					<td class="finished-product-cell">${this.format_number(item["Finished Product"].opening_qty)}</td>
					<td class="finished-product-cell">${this.format_number(item["Finished Product"].incoming_qty)}</td>
					<td class="finished-product-cell">${this.format_number(item["Finished Product"].outgoing_qty)}</td>
					<td class="finished-product-cell">${this.format_number(item["Finished Product"].closing_qty)}</td>
					
					<td class="grand-total-cell">${this.format_number(item["total"].closing_qty)}</td>
				</tr>`;
		});
		
		// Add grand total row
		html += `
			<tr class="grand-total-row">
				<td class="total-label sticky-column"><strong>Grand Total</strong></td>
				
				<td class="mat-total"><strong>${this.format_number(grand_total["Mat"].opening_qty)}</strong></td>
				<td class="mat-total"><strong>${this.format_number(grand_total["Mat"].incoming_qty)}</strong></td>
				<td class="mat-total"><strong>${this.format_number(grand_total["Mat"].outgoing_qty)}</strong></td>
				<td class="mat-total"><strong>${this.format_number(grand_total["Mat"].closing_qty)}</strong></td>
				
				<td class="products-total"><strong>${this.format_number(grand_total["Products"].opening_qty)}</strong></td>
				<td class="products-total"><strong>${this.format_number(grand_total["Products"].incoming_qty)}</strong></td>
				<td class="products-total"><strong>${this.format_number(grand_total["Products"].outgoing_qty)}</strong></td>
				<td class="products-total"><strong>${this.format_number(grand_total["Products"].closing_qty)}</strong></td>
				
				<td class="finished-product-total"><strong>${this.format_number(grand_total["Finished Product"].opening_qty)}</strong></td>
				<td class="finished-product-total"><strong>${this.format_number(grand_total["Finished Product"].incoming_qty)}</strong></td>
				<td class="finished-product-total"><strong>${this.format_number(grand_total["Finished Product"].outgoing_qty)}</strong></td>
				<td class="finished-product-total"><strong>${this.format_number(grand_total["Finished Product"].closing_qty)}</strong></td>
				
				<td class="grand-total-total"><strong>${this.format_number(grand_total.closing_qty)}</strong></td>
			</tr>`;
		
		html += `
					</tbody>
				</table>
				</div>
				<div class="mt-2">
					<div class="text-info small"><strong>Data Source:</strong> Stock Ledger Entries processed using ERPNext\'s batch-wise calculation logic</div>
					<div class="text-info small"><strong>Warehouse Filter:</strong> ${this.warehouse_filter || 'All Warehouses'}</div>
					<div class="text-info small"><strong>Mat Conversion:</strong> All Mat items converted from Kg to Nos using specific batch data or default 50 pcs/kg factor</div>
					<div class="text-muted small"><strong>Last Updated:</strong> ${frappe.datetime.get_datetime_as_string()}</div>
				</div>
			</div>
		`;
		
		this.$report_container.html(html);
		this.apply_styles();
		this.enhance_sticky_column();
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
		
		// Bind common code drill-down events
		this.$report_container.find('.common-code-link').on('click', (e) => {
			e.preventDefault();
			const common_code = $(e.currentTarget).data('code');
			this.show_common_code_details(common_code);
		});
	}
	
	enhance_sticky_column() {
		// Ensure sticky column behavior works properly by forcing browser to recognize sticky positioning
		const $stickyColumns = this.$report_container.find('.sticky-column');
		
		// Force repaint for sticky positioning to work correctly
		$stickyColumns.each(function() {
			const $col = $(this);
			// Trigger a reflow to ensure sticky positioning is applied
			$col[0].offsetHeight;
			
			// Ensure background is opaque
			if (!$col.hasClass('common-code-header') && !$col.hasClass('total-label')) {
				$col.css('background-color', '#f8f9fa');
			}
		});
		
		// Ensure table container has proper scrolling behavior
		const $tableContainer = this.$report_container.find('.table-container');
		$tableContainer.css({
			'overflow-x': 'auto',
			'overflow-y': 'visible',
			'position': 'relative'
		});
	}
	
	format_number(value) {
		// Round to nearest whole number and format with Indian grouping (e.g., 1,23,456)
		const num = Math.round(value || 0);
		return num.toLocaleString('en-IN');
	}

	// Helper to round numbers without formatting for CSV
	round_number(value) { return Math.round(value || 0); }

	// Sanitize file name parts
	sanitize_filename(text) { if (!text) return ''; return String(text).replace(/[^a-z0-9-_\.]+/gi, '_'); }

	// Export current (filtered + sorted) data to CSV
	export_to_csv() {
		try {
			if (!this.filtered_data || !this.grand_total) {
				frappe.msgprint(__('No data to export. Please run the report.'));
				return;
			}
			const matUom = 'Nos';  // Always Nos since we convert all Mat items
			const header = [
				'Common Code',
				`Mat Opening (${matUom})`, `Mat Incoming (${matUom})`, `Mat Outgoing (${matUom})`, `Mat End Stock (${matUom})`,
				'Products Opening', 'Products Incoming', 'Products Outgoing', 'Products End Stock',
				'Finished Product Opening', 'Finished Product Incoming', 'Finished Product Outgoing', 'Finished Product End Stock',
				'Total'
			];
			const rows = [header];
			this.filtered_data.forEach(item => {
				const fp = item['Finished Product'] || {};
				const mat = item['Mat'] || {};
				const prod = item['Products'] || {};
				const total = item['total'] || {};
				rows.push([
					item.common_code || '',
					this.round_number(mat.opening_qty), this.round_number(mat.incoming_qty), this.round_number(mat.outgoing_qty), this.round_number(mat.closing_qty),
					this.round_number(prod.opening_qty), this.round_number(prod.incoming_qty), this.round_number(prod.outgoing_qty), this.round_number(prod.closing_qty),
					this.round_number(fp.opening_qty), this.round_number(fp.incoming_qty), this.round_number(fp.outgoing_qty), this.round_number(fp.closing_qty),
					this.round_number(total.closing_qty)
				]);
			});
			const gt = this.grand_total || {};
			rows.push([
				'Grand Total',
				this.round_number(gt['Mat']?.opening_qty), this.round_number(gt['Mat']?.incoming_qty), this.round_number(gt['Mat']?.outgoing_qty), this.round_number(gt['Mat']?.closing_qty),
				this.round_number(gt['Products']?.opening_qty), this.round_number(gt['Products']?.incoming_qty), this.round_number(gt['Products']?.outgoing_qty), this.round_number(gt['Products']?.closing_qty),
				this.round_number(gt['Finished Product']?.opening_qty), this.round_number(gt['Finished Product']?.incoming_qty), this.round_number(gt['Finished Product']?.outgoing_qty), this.round_number(gt['Finished Product']?.closing_qty),
				this.round_number(gt?.closing_qty)
			]);
			const csv = rows.map(r => r.map(v => {
				const val = (v === null || v === undefined) ? '' : String(v);
				const escaped = val.replace(/\"/g, '""');
				return `"${escaped}"`;
			}).join(',')).join('\n');
			const from = this.filters?.from_date?.get_value?.() || '';
			const to = this.filters?.to_date?.get_value?.() || '';
			const wh = this.warehouse_filter ? this.sanitize_filename(this.warehouse_filter) : 'All_Warehouses';
			const fname = this.sanitize_filename(`aggregated_stock_movement_${from}_to_${to}_${wh}.csv`);
			const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
			if (window.navigator && window.navigator.msSaveOrOpenBlob) {
				window.navigator.msSaveOrOpenBlob(blob, fname);
			} else {
				const url = URL.createObjectURL(blob);
				const a = document.createElement('a');
				a.href = url; a.download = fname; a.style.display = 'none';
				document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
			}
		} catch (e) {
			console.error('CSV export failed', e);
			frappe.msgprint({ title: __('Export Failed'), indicator: 'red', message: __('Could not export to CSV. See console for details.') });
		}
	}
	
	apply_styles() {
		// Add custom styles for the report with colorful headers and sticky first column
		$("<style>")
			.prop("type", "text/css")
			.html(`
				.stock-movement-report {
					position: relative;
					width: 100%;
				}
				.table-container {
					overflow-x: auto;
					overflow-y: visible;
					max-width: 100%;
					border: 1px solid #dee2e6;
					border-radius: 0.375rem;
					box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
					position: relative;
				}
				.sticky-table {
					min-width: 100%;
					border-collapse: separate;
					border-spacing: 0;
					margin: 0;
					position: relative;
					table-layout: fixed;
				}
				.sticky-column {
					position: sticky;
					left: 0;
					z-index: 10;
					border-right: 2px solid #adb5bd !important;
					box-shadow: 2px 0 4px rgba(0, 0, 0, 0.1);
					background-color: inherit !important;
					min-width: 120px;
					max-width: 160px;
				}
				.sticky-table thead .sticky-column {
					z-index: 20;
					background-color: #343a40 !important;
				}
				.stock-movement-report th {
					font-weight: bold;
					text-align: center;
					vertical-align: middle !important;
					padding: 6px 6px; /* tighter to fit page */
					border: 1px solid #dee2e6;
					position: relative;
					white-space: nowrap;
				}
				.stock-movement-report td {
					text-align: right;
					padding: 4px 6px; /* tighter to fit page */
					border: 1px solid #dee2e6;
				}
				/* Fit columns within page */
				.stock-movement-report th:not(.sticky-column),
				.stock-movement-report td:not(.sticky-column) {
					min-width: 80px;
					max-width: 100px;
				}
				.sortable { cursor: pointer; }
				.sortable:hover { background-color: rgba(0, 0, 0, 0.05); }
				.sort-icon { margin-left: 5px; }
				
				/* Header Styling */
				.common-code-header { background-color: #343a40; color: white; font-weight: bold; }
				/* Mat Header */
				.mat-header { background-color: #e74c3c; color: white; font-weight: bold; }
				.mat-subheader { background-color: #ec7063; color: white; }
				.mat-cell { background-color: #fdedec; }
				.mat-total { background-color: #f5b7b1; font-weight: bold; }
				/* Products Header */
				.products-header { background-color: #2ecc71; color: white; font-weight: bold; }
				.products-subheader { background-color: #58d68d; color: white; }
				.products-cell { background-color: #eafaf1; }
				.products-total { background-color: #abebc6; font-weight: bold; }
				/* Finished Product Header */
				.finished-product-header { background-color: #3498db; color: white; font-weight: bold; }
				.finished-product-subheader { background-color: #5dade2; color: white; }
				.finished-product-cell { background-color: #ebf5fb; }
				.finished-product-total { background-color: #d6eaf8; font-weight: bold; }
				/* Grand Total Header */
				.grand-total-header { background-color: #9b59b6; color: white; font-weight: bold; }
				.grand-total-cell { background-color: #f4ecf7; font-weight: bold; }
				.grand-total-total { background-color: #d2b4de; font-weight: bold; }
				/* Common Styles */
				.stock-movement-report .item-code { text-align: left; background-color: #f8f9fa !important; font-weight: bold; }
				.stock-movement-report .sticky-column.item-code { background-color: #f8f9fa !important; }
				.grand-total-row { border-top: 2px solid #666; }
				.total-label { background-color: #343a40 !important; color: white; font-weight: bold; text-align: left !important; }
				.stock-movement-report .sticky-column.total-label { background-color: #343a40 !important; }
				/* Hover effects */
				.stock-movement-report tbody tr:hover td { box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.1); }
				.stock-movement-report tbody tr:hover .sticky-column { background-color: #e9ecef !important; box-shadow: 2px 0 4px rgba(0, 0, 0, 0.15), inset 0 0 0 1px rgba(0, 0, 0, 0.1); }
				.stock-movement-report .grand-total-row:hover .sticky-column.total-label { background-color: #495057 !important; }
				/* Responsive */
				@media (max-width: 768px) {
					.table-container { font-size: 12px; }
					.stock-movement-report th, .stock-movement-report td { padding: 4px 6px; }
					.sticky-column { min-width: 90px; max-width: 120px; font-size: 11px; }
					.stock-movement-report th:not(.sticky-column), .stock-movement-report td:not(.sticky-column) { min-width: 70px; max-width: 90px; }
				}
			`)
			.appendTo("head");
	}
	
	show_common_code_details(common_code) {
		if (!common_code) return;
		
		const filters = {
			from_date: this.filters.from_date.get_value(),
			to_date: this.filters.to_date.get_value(),
			warehouse: this.filters.warehouse.get_value(),
			warehouse_type: this.filters.warehouse_type.get_value()
		};
		
		// Call backend to get details
		frappe.call({
			method: 'smart_screens.smart_screens.page.aggregated_stock_movement.aggregated_stock_movement.get_common_code_details',
			args: {
				common_code: common_code,
				filters: filters
			},
			callback: (r) => {
				if (r.message) {
					this.render_common_code_dialog(common_code, r.message);
				}
			}
		});
	}
	
	render_common_code_dialog(common_code, data) {
		const items = data.items || [];
		const sle_samples = data.sle_samples || [];
		const counts = data.counts || {items: 0, sle: 0};
		
		// Build items table
		let items_html = '<table class="table table-bordered table-sm"><thead><tr><th>Item Code</th><th>Item Name</th><th>Prefix</th><th>Item Group</th><th>UOM</th></tr></thead><tbody>';
		
		if (items.length > 0) {
			items.forEach(item => {
				items_html += `<tr>
					<td><strong>${item.item_code}</strong></td>
					<td>${item.item_name || ''}</td>
					<td><span class="badge badge-${item.prefix === 'P' ? 'success' : item.prefix === 'F' ? 'info' : 'warning'}">${item.prefix}</span></td>
					<td>${item.item_group || ''}</td>
					<td>${item.stock_uom || ''}</td>
				</tr>`;
			});
		} else {
			items_html += '<tr><td colspan="5" class="text-muted text-center">No items found</td></tr>';
		}
		items_html += '</tbody></table>';
		
		// Build SLE samples table
		let sle_html = '<table class="table table-bordered table-sm"><thead><tr><th>Date</th><th>Item Code</th><th>Warehouse</th><th>Batch</th><th>Qty</th><th>Voucher</th></tr></thead><tbody>';
		
		if (sle_samples.length > 0) {
			sle_samples.forEach(sle => {
				const qty_class = sle.actual_qty > 0 ? 'text-success' : 'text-danger';
				sle_html += `<tr>
					<td>${sle.posting_date}</td>
					<td><code>${sle.item_code}</code></td>
					<td>${sle.warehouse}</td>
					<td>${sle.batch_no || '-'}</td>
					<td class="${qty_class}">${sle.actual_qty}</td>
					<td><small>${sle.voucher_type}: ${sle.voucher_no}</small></td>
				</tr>`;
			});
		} else {
			sle_html += '<tr><td colspan="6" class="text-muted text-center">No stock ledger entries found</td></tr>';
		}
		sle_html += '</tbody></table>';
		
		// Create dialog content
		const content = `
			<div class="common-code-details">
				<div class="row">
					<div class="col-md-6">
						<h5>Item Codes (${counts.items})</h5>
						<div style="max-height: 300px; overflow-y: auto;">
							${items_html}
						</div>
					</div>
					<div class="col-md-6">
						<h5>Recent Stock Ledger Entries (${Math.min(counts.sle, 100)})</h5>
						<div style="max-height: 300px; overflow-y: auto;">
							${sle_html}
						</div>
					</div>
				</div>
			</div>
		`;
		
		// Show dialog
		const dialog = new frappe.ui.Dialog({
			title: `Common Code: ${common_code}`,
			size: 'extra-large',
			fields: [
				{
					fieldtype: 'HTML',
					fieldname: 'details_html',
					options: content
				}
			]
		});
		
		dialog.show();
	}
}