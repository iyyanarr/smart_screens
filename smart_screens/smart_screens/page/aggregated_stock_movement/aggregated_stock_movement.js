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
		this.$report_container.html(`<div class="text-muted">Loading report...</div>`);
		
		frappe.call({
			method: 'smart_screens.smart_screens.page.aggregated_stock_movement.aggregated_stock_movement.get_aggregated_stock_data',
			args: {
				filters: filters
			},
			callback: (r) => {
				if (r.message && r.message.data) {
					this.original_data = r.message.data;
					this.grand_total = r.message.grand_total;
					this.mat_uom = r.message.mat_uom || "kg";
					this.has_converted_mat_items = r.message.has_converted_mat_items || false;
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
				<div class="table-container">
					<table class="table table-bordered sticky-table">
						<thead>
							<tr>
								<th rowspan="2" class="common-code-header sortable sticky-column" data-sort="common_code">
									Common Code <i class="sort-icon fa ${this.get_sort_icon('common_code')}"></i>
								</th>
							<th colspan="4" class="finished-product-header">Finished Product</th>
							<th colspan="4" class="mat-header">Mat (${this.has_converted_mat_items ? this.mat_uom : 'kg'})</th>
							<th colspan="4" class="products-header">Products</th>
							<th rowspan="2" class="grand-total-header">Total</th>
						</tr>
						<tr>
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
						</tr>
					</thead>
					<tbody>`;
		
		// Add rows for each item
		data.forEach(item => {
			html += `
				<tr>
					<td class="item-code sticky-column"><a href="#" class="common-code-link" data-code="${item.common_code}" title="View item codes and stock ledger entries">${item.common_code}</a></td>
					
					<td class="finished-product-cell">${this.format_number(item["Finished Product"].opening_qty)}</td>
					<td class="finished-product-cell">${this.format_number(item["Finished Product"].incoming_qty)}</td>
					<td class="finished-product-cell">${this.format_number(item["Finished Product"].outgoing_qty)}</td>
					<td class="finished-product-cell">${this.format_number(item["Finished Product"].closing_qty)}</td>
					
					<td class="mat-cell">${this.format_number(item["Mat"].opening_qty)}</td>
					<td class="mat-cell">${this.format_number(item["Mat"].incoming_qty)}</td>
					<td class="mat-cell">${this.format_number(item["Mat"].outgoing_qty)}</td>
					<td class="mat-cell">${this.format_number(item["Mat"].closing_qty)}</td>
					
					<td class="products-cell">${this.format_number(item["Products"].opening_qty)}</td>
					<td class="products-cell">${this.format_number(item["Products"].incoming_qty)}</td>
					<td class="products-cell">${this.format_number(item["Products"].outgoing_qty)}</td>
					<td class="products-cell">${this.format_number(item["Products"].closing_qty)}</td>
					
					<td class="grand-total-cell">${this.format_number(item["total"].closing_qty)}</td>
				</tr>`;
			});
			
			// Add grand total row
			html += `
			<tr class="grand-total-row">
				<td class="total-label sticky-column"><strong>Grand Total</strong></td>
				
				<td class="finished-product-total"><strong>${this.format_number(grand_total["Finished Product"].opening_qty)}</strong></td>
				<td class="finished-product-total"><strong>${this.format_number(grand_total["Finished Product"].incoming_qty)}</strong></td>
				<td class="finished-product-total"><strong>${this.format_number(grand_total["Finished Product"].outgoing_qty)}</strong></td>
				<td class="finished-product-total"><strong>${this.format_number(grand_total["Finished Product"].closing_qty)}</strong></td>
				
				<td class="mat-total"><strong>${this.format_number(grand_total["Mat"].opening_qty)}</strong></td>
				<td class="mat-total"><strong>${this.format_number(grand_total["Mat"].incoming_qty)}</strong></td>
				<td class="mat-total"><strong>${this.format_number(grand_total["Mat"].outgoing_qty)}</strong></td>
				<td class="mat-total"><strong>${this.format_number(grand_total["Mat"].closing_qty)}</strong></td>
				
				<td class="products-total"><strong>${this.format_number(grand_total["Products"].opening_qty)}</strong></td>
				<td class="products-total"><strong>${this.format_number(grand_total["Products"].incoming_qty)}</strong></td>
				<td class="products-total"><strong>${this.format_number(grand_total["Products"].outgoing_qty)}</strong></td>
				<td class="products-total"><strong>${this.format_number(grand_total["Products"].closing_qty)}</strong></td>
				
				<td class="grand-total-total"><strong>${this.format_number(grand_total.closing_qty)}</strong></td>
			</tr>`;
		
		html += `
					</tbody>
				</table>
				</div>
				<div class="mt-2">
					${this.has_converted_mat_items ? '<div class="text-muted small">Note: Mat quantities are displayed in Numbers (Nos) instead of kg based on UOM conversion factors</div>' : ''}
					<div class="text-info small"><strong>Data Source:</strong> Stock Ledger Entries processed using ERPNext's batch-wise calculation logic</div>
					<div class="text-info small"><strong>Warehouse Filter:</strong> ${this.warehouse_filter || 'All Warehouses'}</div>
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
		// Drill-down on common code click
		this.$report_container.on('click', '.common-code-link', (e) => {
			e.preventDefault();
			const code = $(e.currentTarget).data('code');
			this.show_common_code_details(code);
		});
	}

	// Show dialog with real item codes and sample SLE rows for a given common code
	show_common_code_details(common_code) {
		if (!common_code) return;
		const dlg = new frappe.ui.Dialog({
			title: `Details for ${common_code}`,
			fields: [
				{ fieldtype: 'HTML', fieldname: 'items_html' },
				{ fieldtype: 'HTML', fieldname: 'sle_html' }
			],
			primary_action_label: __('Close'),
			primary_action: () => dlg.hide()
		});

		dlg.show();
		dlg.set_message(__('Loading details...'));

		const filters = {
			from_date: this.filters.from_date.get_value(),
			to_date: this.filters.to_date.get_value(),
			warehouse: this.filters.warehouse.get_value(),
			warehouse_type: this.filters.warehouse_type.get_value()
		};

		frappe.call({
			method: 'smart_screens.smart_screens.page.aggregated_stock_movement.aggregated_stock_movement.get_common_code_details',
			args: { common_code, filters },
			freeze: true,
			callback: (r) => {
				const data = r.message || {};
				const items = data.items || [];
				const sle = data.sle_samples || [];

				const itemsTable = `
					<h5 style="margin-top: 0;">Item Codes (${items.length})</h5>
					<div style="max-height: 220px; overflow:auto; border:1px solid #eee; border-radius:6px;">
					<table class="table table-bordered table-compact" style="margin:0;">
						<thead><tr>
							<th>Item Code</th><th>Item Name</th><th>Prefix</th><th>Item Group</th><th>UOM</th>
						</tr></thead>
						<tbody>
							${items.map(i => `
								<tr>
									<td><a href="/app/item/${encodeURIComponent(i.item_code)}" target="_blank">${frappe.utils.escape_html(i.item_code)}</a></td>
									<td style="text-align:left;">${frappe.utils.escape_html(i.item_name || '')}</td>
									<td>${frappe.utils.escape_html(i.prefix || '')}</td>
									<td>${frappe.utils.escape_html(i.item_group || '')}</td>
									<td>${frappe.utils.escape_html(i.stock_uom || '')}</td>
								</tr>
							`).join('')}
						</tbody>
					</table>
					</div>`;

				const sleTable = `
					<h5 style="margin-top: 12px;">Recent Stock Ledger Entries (${sle.length})</h5>
					<div style="max-height: 260px; overflow:auto; border:1px solid #eee; border-radius:6px;">
					<table class="table table-bordered table-compact" style="margin:0;">
						<thead><tr>
							<th>Date</th><th>Item</th><th>Warehouse</th><th>Batch</th><th>Qty</th><th>Voucher</th>
						</tr></thead>
						<tbody>
							${sle.map(s => `
								<tr>
									<td>${frappe.datetime.str_to_user(s.posting_date)} ${s.posting_time || ''}</td>
									<td><a href="/app/item/${encodeURIComponent(s.item_code)}" target="_blank">${frappe.utils.escape_html(s.item_code)}</a></td>
									<td style="text-align:left;">${frappe.utils.escape_html(s.warehouse || '')}</td>
									<td style="text-align:left;">${frappe.utils.escape_html(s.batch_no || '')}</td>
									<td style="text-align:right;">${frappe.format(s.actual_qty, {fieldtype:'Float'})}</td>
									<td><a href="/app/${encodeURIComponent((s.voucher_type||'').toLowerCase().replace(/\s+/g,'-'))}/${encodeURIComponent(s.voucher_no)}" target="_blank">${frappe.utils.escape_html(s.voucher_type || '')} ${frappe.utils.escape_html(s.voucher_no || '')}</a></td>
								</tr>
							`).join('')}
						</tbody>
					</table>
					</div>`;

				// Place into dialog
				dlg.get_field('items_html').$wrapper.html(itemsTable);
				dlg.get_field('sle_html').$wrapper.html(sleTable);
				dlg.set_message('');
			}
		});
	}

	// Helper used by table rendering - round and format as Int
	format_number(value) {
		return frappe.format(Math.round(value || 0), { fieldtype: 'Int' });
	}

	// Helper to round numbers without formatting for CSV
	round_number(value) {
		return Math.round(value || 0);
	}

	// Sanitize file name parts
	sanitize_filename(text) {
		if (!text) return '';
		return String(text).replace(/[^a-z0-9-_\.]+/gi, '_');
	}

	// Export current (filtered + sorted) data to CSV
	export_to_csv() {
		try {
			if (!this.filtered_data || !this.grand_total) {
				frappe.msgprint(__('No data to export. Please run the report.'));
				return;
			}

			const matUom = this.has_converted_mat_items ? (this.mat_uom || 'Nos') : 'kg';
			const header = [
				'Common Code',
				'Finished Product Opening',
				'Finished Product Incoming',
				'Finished Product Outgoing',
				'Finished Product End Stock',
				`Mat Opening (${matUom})`,
				`Mat Incoming (${matUom})`,
				`Mat Outgoing (${matUom})`,
				`Mat End Stock (${matUom})`,
				'Products Opening',
				'Products Incoming',
				'Products Outgoing',
				'Products End Stock',
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
					this.round_number(fp.opening_qty),
					this.round_number(fp.incoming_qty),
					this.round_number(fp.outgoing_qty),
					this.round_number(fp.closing_qty),
					this.round_number(mat.opening_qty),
					this.round_number(mat.incoming_qty),
					this.round_number(mat.outgoing_qty),
					this.round_number(mat.closing_qty),
					this.round_number(prod.opening_qty),
					this.round_number(prod.incoming_qty),
					this.round_number(prod.outgoing_qty),
					this.round_number(prod.closing_qty),
					this.round_number(total.closing_qty)
				]);
			});

			// Grand total row
			const gt = this.grand_total || {};
			rows.push([
				'Grand Total',
				this.round_number(gt['Finished Product']?.opening_qty),
				this.round_number(gt['Finished Product']?.incoming_qty),
				this.round_number(gt['Finished Product']?.outgoing_qty),
				this.round_number(gt['Finished Product']?.closing_qty),
				this.round_number(gt['Mat']?.opening_qty),
				this.round_number(gt['Mat']?.incoming_qty),
				this.round_number(gt['Mat']?.outgoing_qty),
				this.round_number(gt['Mat']?.closing_qty),
				this.round_number(gt['Products']?.opening_qty),
				this.round_number(gt['Products']?.incoming_qty),
				this.round_number(gt['Products']?.outgoing_qty),
				this.round_number(gt['Products']?.closing_qty),
				this.round_number(gt?.closing_qty)
			]);

			// Convert to CSV with proper escaping
			const csv = rows.map(r => r.map(v => {
				const val = (v === null || v === undefined) ? '' : String(v);
				const escaped = val.replace(/"/g, '""');
				return `"${escaped}"`;
			}).join(',')).join('\n');

			// Prepare filename with filters
			const from = this.filters?.from_date?.get_value?.() || '';
			const to = this.filters?.to_date?.get_value?.() || '';
			const wh = this.warehouse_filter ? this.sanitize_filename(this.warehouse_filter) : 'All_Warehouses';
			const fname = this.sanitize_filename(`aggregated_stock_movement_${from}_to_${to}_${wh}.csv`);

			// Trigger download (add BOM for Excel compatibility)
			const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
			if (window.navigator && window.navigator.msSaveOrOpenBlob) {
				// IE/Edge legacy
				window.navigator.msSaveOrOpenBlob(blob, fname);
			} else {
				const url = URL.createObjectURL(blob);
				const a = document.createElement('a');
				a.href = url;
				a.download = fname;
				a.style.display = 'none';
				document.body.appendChild(a);
				a.click();
				document.body.removeChild(a);
				URL.revokeObjectURL(url);
			}
		} catch (e) {
			console.error('CSV export failed', e);
			frappe.msgprint({
				title: __('Export Failed'),
				indicator: 'red',
				message: __('Could not export to CSV. See console for details.')
			});
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
				}
				.sticky-column {
					position: sticky;
					left: 0;
					z-index: 10;
					border-right: 2px solid #adb5bd !important;
					box-shadow: 2px 0 4px rgba(0, 0, 0, 0.1);
					background-color: inherit !important;
					min-width: 120px;
					max-width: 200px;
				}
				.sticky-table thead .sticky-column {
					z-index: 20;
					background-color: #343a40 !important;
				}
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
				
				/* Finished Product Header */
				.finished-product-header {
					background-color: #3498db;
					color: white;
					font-weight: bold;
				}
				.finished-product-subheader {
					background-color: #5dade2;
					color: white;
				}
				.finished-product-cell {
					background-color: #ebf5fb;
				}
				.finished-product-total {
					background-color: #d6eaf8;
					font-weight: bold;
				}
				
				/* Mat Header */
				.mat-header {
					background-color: #e74c3c;
					color: white;
					font-weight: bold;
				}
				.mat-subheader {
					background-color: #ec7063;
					color: white;
				}
				.mat-cell {
					background-color: #fdedec;
				}
				.mat-total {
					background-color: #f5b7b1;
					font-weight: bold;
				}
				
				/* Products Header */
				.products-header {
					background-color: #2ecc71;
					color: white;
					font-weight: bold;
				}
				.products-subheader {
					background-color: #58d68d;
					color: white;
				}
				.products-cell {
					background-color: #eafaf1;
				}
				.products-total {
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
				.stock-movement-report .item-code {
					text-align: left;
					background-color: #f8f9fa !important;
					font-weight: bold;
				}
				.stock-movement-report .sticky-column.item-code {
					background-color: #f8f9fa !important;
				}
				.grand-total-row {
					border-top: 2px solid #666;
				}
				.total-label {
					background-color: #343a40 !important;
					color: white;
					font-weight: bold;
					text-align: left !important;
				}
				.stock-movement-report .sticky-column.total-label {
					background-color: #343a40 !important;
				}
				
				/* Hover effects */
				.stock-movement-report tbody tr:hover td {
					box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.1);
				}
				.stock-movement-report tbody tr:hover .sticky-column {
					background-color: #e9ecef !important;
					box-shadow: 2px 0 4px rgba(0, 0, 0, 0.15), inset 0 0 0 1px rgba(0, 0, 0, 0.1);
				}
				.stock-movement-report .grand-total-row:hover .sticky-column.total-label {
					background-color: #495057 !important;
				}
				
				/* Responsive design */
				@media (max-width: 768px) {
					.table-container {
						font-size: 12px;
					}
					.stock-movement-report th,
					.stock-movement-report td {
						padding: 4px 6px;
					}
					.sticky-column {
						min-width: 80px;
						max-width: 120px;
						font-size: 11px;
					}
				}
			`)
			.appendTo("head");
	}
}