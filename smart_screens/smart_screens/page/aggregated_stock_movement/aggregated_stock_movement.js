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
		this.show_loading();
		frappe.call({
			method: 'smart_screens.smart_screens.page.aggregated_stock_movement.aggregated_stock_movement.get_aggregated_stock_data',
			args: {
				filters: filters
			},
			callback: (r) => {
				this.hide_loading();
				if (r.message && r.message.data) {
					this.original_data = r.message.data;
					this.grand_total = r.message.grand_total;
					this.mat_uom = "Nos";  // Always Nos since we apply conversion to all Mat items
					this.has_converted_mat_items = true;  // Always true since we convert all Mat items
					this.warehouse_filter = r.message.warehouse_filter || "All Warehouses";
					this.filtered_data = [...this.original_data];
					this.sort_data();
					this.render_report();
				} else {
					this.$report_container.html('<div class="text-muted">No data found</div>');
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
									Item Name <i class="sort-icon fa ${this.get_sort_icon('common_code')}"></i>
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
					<div class="text-muted small">Note: Mat quantities are displayed in Numbers (Nos). Large numbers formatted in Indian system (K=Thousands, L=Lakhs, Cr=Crores). Batch-wise conversion applied where possible.</div>
					<div class="text-info small"><strong>Data Source:</strong> Stock Ledger Entries processed using ERPNext\'s batch-wise calculation logic</div>
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

		// Bind drill-down click on item name links
		this.$report_container.on('click', '.common-code-link', (e) => {
			e.preventDefault();
			const code = $(e.currentTarget).data('code');
			this.show_common_code_details(code);
		});
	}

	show_common_code_details(common_code) {
		const filters = {
			from_date: this.filters.from_date.get_value(),
			to_date: this.filters.to_date.get_value(),
			warehouse: this.filters.warehouse.get_value(),
			warehouse_type: this.filters.warehouse_type.get_value()
		};
		frappe.call({
			method: 'smart_screens.smart_screens.page.aggregated_stock_movement.aggregated_stock_movement.get_common_code_details',
			args: { common_code, filters },
			callback: (r) => {
				if (!r.message) { frappe.msgprint(__('No details found')); return; }
				const { items = [], sle_samples = [], counts = {} } = r.message;
				const d = new frappe.ui.Dialog({
					title: `Details for ${common_code}`,
					size: 'large'
				});
				let html = '<div style="max-height:60vh; overflow:auto;">';
				html += '<h5>Items</h5>';
				html += '<ul>' + items.map(it => `<li><strong>${frappe.utils.escape_html(it.item_code)}</strong> (${frappe.utils.escape_html(it.item_group)} | ${frappe.utils.escape_html(it.prefix)})</li>`).join('') + '</ul>';
				html += '<h5>Recent Stock Ledger Entries</h5>';
				html += '<table class="table table-bordered"><thead><tr><th>Date</th><th>Item</th><th>Warehouse</th><th>Batch</th><th>Qty</th><th>Voucher</th></tr></thead><tbody>' +
					sle_samples.map(s => `<tr><td>${frappe.datetime.str_to_user(s.posting_date)} ${s.posting_time || ''}</td><td>${frappe.utils.escape_html(s.item_code)}</td><td>${frappe.utils.escape_html(s.warehouse || '')}</td><td>${frappe.utils.escape_html(s.batch_no || '')}</td><td style="text-align:right;">${this.format_number(s.actual_qty)}</td><td>${frappe.utils.escape_html(s.voucher_type || '')} ${frappe.utils.escape_html(s.voucher_no || '')}</td></tr>`).join('') +
					'</tbody></table>';
				html += '</div>';
				d.$body.html(html);
				d.show();
			}
		});
	}

	export_to_csv() {
		try {
			if (!this.filtered_data || !this.grand_total) {
				frappe.msgprint(__('No data to export. Please run the report.'));
				return;
			}
			const header = [
				'Item Name',
				'Mat Opening (Nos)', 'Mat Incoming (Nos)', 'Mat Outgoing (Nos)', 'Mat End Stock (Nos)',
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

	// Utility: numeric formatting with smart decimals and lakh separators
	format_number(value) {
		const n = Number(value || 0);
		if (!isFinite(n)) return '0';
		const abs = Math.abs(n);
		
		// Format in Indian number system (lakhs/crores)
		if (abs >= 10000000) { // 1 crore
			return (n / 10000000).toFixed(2) + ' Cr';
		} else if (abs >= 100000) { // 1 lakh
			return (n / 100000).toFixed(2) + ' L';
		} else if (abs >= 1000) { // 1 thousand
			return (n / 1000).toFixed(1) + 'K';
		} else {
			const decimals = abs === 0 || Math.abs(n - Math.round(n)) < 0.005 ? 0 : 2;
			return n.toLocaleString('en-IN', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
		}
	}

	// Utility: round for CSV/raw values
	round_number(value, decimals = 2) {
		const n = Number(value || 0);
		if (!isFinite(n)) return 0;
		const factor = Math.pow(10, decimals);
		return Math.round(n * factor) / factor;
	}

	// Utility: safe filenames
	sanitize_filename(name) {
		return String(name || '').replace(/[^a-z0-9\-_\.]+/gi, '_');
	}

	// Enhance sticky column behavior (no-op placeholder with minor fix)
	enhance_sticky_column() {
		// Ensure sticky column has explicit width to avoid jitter
		const $firstCol = this.$report_container.find('table.sticky-table td.sticky-column, table.sticky-table th.sticky-column');
		if ($firstCol.length) {
			const w = $firstCol.first().outerWidth();
			$firstCol.css('min-width', w).css('max-width', w);
		}
	}
	
	apply_styles() {
		// Add modern, professional styles with improved readability
		$("<style>")
			.prop("type", "text/css")
			.html(`
				.stock-movement-report {
					position: relative;
					width: 100%;
					font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
				}
				.table-container {
					overflow-x: auto;
					overflow-y: visible;
					max-width: 100%;
					border: 1px solid #e1e5e9;
					border-radius: 8px;
					box-shadow: 0 2px 12px rgba(0, 0, 0, 0.08);
					position: relative;
					background: white;
				}
				.sticky-table {
					min-width: 100%;
					border-collapse: separate;
					border-spacing: 0;
					margin: 0;
					position: relative;
					table-layout: fixed;
					font-size: 13px;
				}
				.sticky-column {
					position: sticky;
					left: 0;
					z-index: 10;
					border-right: 2px solid #d1d9e0 !important;
					box-shadow: 2px 0 6px rgba(0, 0, 0, 0.08);
					background-color: inherit !important;
					min-width: 120px;
					max-width: 140px;
				}
				.sticky-table thead .sticky-column {
					z-index: 20;
					background-color: #2c3e50 !important;
				}
				
				/* Enhanced cell spacing and typography */
				.stock-movement-report th {
					font-weight: 600;
					text-align: center;
					vertical-align: middle !important;
					padding: 12px 8px;
					border: 1px solid #e1e5e9;
					position: relative;
					white-space: nowrap;
					font-size: 12px;
					letter-spacing: 0.3px;
				}
				.stock-movement-report td {
					text-align: right;
					padding: 10px 8px;
					border: 1px solid #f1f3f5;
					font-size: 12px;
					font-weight: 500;
					line-height: 1.4;
				}
				
				/* Improved column widths for number readability */
				.stock-movement-report th:not(.sticky-column),
				.stock-movement-report td:not(.sticky-column) {
					min-width: 95px;
					max-width: 110px;
				}
				
				.sortable { cursor: pointer; transition: background-color 0.2s ease; }
				.sortable:hover { background-color: rgba(0, 0, 0, 0.06); }
				.sort-icon { margin-left: 4px; opacity: 0.7; }
				
				/* Professional header styling with subtle colors */
				.common-code-header { 
					background-color: #2c3e50; 
					color: white; 
					font-weight: 600; 
				}
				
				/* Mat columns - subtle blue-gray theme */
				.mat-header { 
					background: linear-gradient(135deg, #4a6741 0%, #5d7c56 100%); 
					color: white; 
					font-weight: 600; 
				}
				.mat-subheader { 
					background: linear-gradient(135deg, #6b8566 0%, #7a9575 100%); 
					color: white; 
					font-weight: 500; 
				}
				.mat-cell { 
					background-color: #f8faf8; 
					border-left: 3px solid #e8f2e8;
				}
				.mat-total { 
					background-color: #e8f2e8; 
					font-weight: 600; 
					border-left: 3px solid #c8e6c8;
				}
				
				/* Products columns - subtle green theme */
				.products-header { 
					background: linear-gradient(135deg, #2980b9 0%, #3498db 100%); 
					color: white; 
					font-weight: 600; 
				}
				.products-subheader { 
					background: linear-gradient(135deg, #5dade2 0%, #7fb3d3 100%); 
					color: white; 
					font-weight: 500; 
				}
				.products-cell { 
					background-color: #f8fafb; 
					border-left: 3px solid #e8f4f8;
				}
				.products-total { 
					background-color: #e8f4f8; 
					font-weight: 600; 
					border-left: 3px solid #c8e8f0;
				}
				
				/* Finished Product columns - subtle orange theme */
				.finished-product-header { 
					background: linear-gradient(135deg, #8e44ad 0%, #a569bd 100%); 
					color: white; 
					font-weight: 600; 
				}
				.finished-product-subheader { 
					background: linear-gradient(135deg, #bb8fce 0%, #c39bd3 100%); 
					color: white; 
					font-weight: 500; 
				}
				.finished-product-cell { 
					background-color: #faf9fb; 
					border-left: 3px solid #f0ebf3;
				}
				.finished-product-total { 
					background-color: #f0ebf3; 
					font-weight: 600; 
					border-left: 3px solid #e0d6e6;
				}
				
				/* Grand Total column */
				.grand-total-header { 
					background: linear-gradient(135deg, #34495e 0%, #2c3e50 100%); 
					color: white; 
					font-weight: 600; 
				}
				.grand-total-cell { 
					background-color: #f8f9fa; 
					font-weight: 600; 
					border-left: 3px solid #e9ecef;
				}
				.grand-total-total { 
					background-color: #e9ecef; 
					font-weight: 700; 
					border-left: 3px solid #dee2e6;
					color: #2c3e50;
				}
				
				/* Alternating row colors for better readability */
				.stock-movement-report tbody tr:nth-child(even) td:not(.sticky-column) {
					background-color: rgba(248, 249, 250, 0.5);
				}
				
				/* Item code column styling */
				.stock-movement-report .item-code { 
					text-align: left; 
					background-color: #f8f9fa !important; 
					font-weight: 600; 
					font-family: 'Courier New', monospace;
					color: #2c3e50;
				}
				.stock-movement-report .sticky-column.item-code { 
					background-color: #f8f9fa !important; 
				}
				
				/* Grand total row */
				.grand-total-row { 
					border-top: 3px solid #2c3e50; 
					background-color: #f8f9fa;
				}
				.total-label { 
					background-color: #2c3e50 !important; 
					color: white; 
					font-weight: 700; 
					text-align: left !important; 
					font-size: 13px;
				}
				.stock-movement-report .sticky-column.total-label { 
					background-color: #2c3e50 !important; 
				}
				
				/* Enhanced hover effects */
				.stock-movement-report tbody tr:hover td { 
					background-color: rgba(52, 73, 94, 0.05) !important;
					transition: background-color 0.2s ease;
				}
				.stock-movement-report tbody tr:hover .sticky-column { 
					background-color: rgba(52, 73, 94, 0.08) !important; 
					box-shadow: 2px 0 8px rgba(0, 0, 0, 0.12);
				}
				.stock-movement-report .grand-total-row:hover .sticky-column.total-label { 
					background-color: #34495e !important; 
				}
				
				/* Link styling */
				.common-code-link {
					color: #2c3e50;
					text-decoration: none;
					font-weight: 600;
					transition: color 0.2s ease;
				}
				.common-code-link:hover {
					color: #3498db;
					text-decoration: underline;
				}
				
				/* Responsive design */
				@media (max-width: 768px) {
					.table-container { font-size: 11px; }
					.stock-movement-report th, .stock-movement-report td { 
						padding: 8px 6px; 
						font-size: 11px;
					}
					.sticky-column { 
						min-width: 100px; 
						max-width: 120px; 
					}
					.stock-movement-report th:not(.sticky-column), 
					.stock-movement-report td:not(.sticky-column) { 
						min-width: 85px; 
						max-width: 95px; 
					}
				}

				/* Skeleton loader with improved animation */
				@keyframes shimmer { 
					0% { background-position: -450px 0; } 
					100% { background-position: 450px 0; } 
				}
				.skeleton { 
					position: relative; 
					overflow: hidden; 
				}
				.skeleton::after { 
					content: ''; 
					position: absolute; 
					top: 0; left: 0; right: 0; bottom: 0; 
					background-image: linear-gradient(90deg, 
						rgba(255,255,255,0) 0%, 
						rgba(255,255,255,0.6) 50%, 
						rgba(255,255,255,0) 100%); 
					background-size: 450px 100%; 
					animation: shimmer 1.5s ease-in-out infinite; 
				}
				.skeleton-cell { 
					background-color: #f1f3f5; 
					color: transparent; 
				}
				.skeleton-header { 
					background-color: #dee2e6; 
					color: transparent; 
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

	// Loading skeleton UI
	show_loading() {
		const skeletonRows = 6;
		let bodyRows = '';
		for (let i = 0; i < skeletonRows; i++) {
			bodyRows += `
				<tr>
					<td class="sticky-column skeleton skeleton-cell">&nbsp;</td>
					<td class="skeleton skeleton-cell">&nbsp;</td>
					<td class="skeleton skeleton-cell">&nbsp;</td>
					<td class="skeleton skeleton-cell">&nbsp;</td>
					<td class="skeleton skeleton-cell">&nbsp;</td>
					<td class="skeleton skeleton-cell">&nbsp;</td>
					<td class="skeleton skeleton-cell">&nbsp;</td>
					<td class="skeleton skeleton-cell">&nbsp;</td>
					<td class="skeleton skeleton-cell">&nbsp;</td>
					<td class="skeleton skeleton-cell">&nbsp;</td>
					<td class="skeleton skeleton-cell">&nbsp;</td>
					<td class="skeleton skeleton-cell">&nbsp;</td>
					<td class="skeleton skeleton-cell">&nbsp;</td>
					<td class="skeleton skeleton-cell">&nbsp;</td>
				</tr>`;
		}
		const html = `
			<div class="stock-movement-report">
				<div class="table-container">
					<table class="table table-bordered sticky-table">
						<thead>
							<tr>
								<th class="sticky-column common-code-header skeleton skeleton-header">&nbsp;</th>
								<th colspan="4" class="mat-header skeleton skeleton-header">&nbsp;</th>
								<th colspan="4" class="products-header skeleton skeleton-header">&nbsp;</th>
								<th colspan="4" class="finished-product-header skeleton skeleton-header">&nbsp;</th>
								<th class="grand-total-header skeleton skeleton-header">&nbsp;</th>
							</tr>
							<tr>
								<th class="sticky-column skeleton skeleton-header">&nbsp;</th>
								${'<th class="skeleton skeleton-header">&nbsp;</th>'.repeat(13)}
							</tr>
						</thead>
						<tbody>
							${bodyRows}
						</tbody>
					</table>
				</div>
				<div class="mt-2 text-muted small">Loading data…</div>
			</div>`;
		this.$report_container.html(html);
	}

	hide_loading() {
		// No-op; next render will replace content. Kept for symmetry and future enhancements.
	}
}

//# sourceMappingURL=aggregated_stock_movement.js.map