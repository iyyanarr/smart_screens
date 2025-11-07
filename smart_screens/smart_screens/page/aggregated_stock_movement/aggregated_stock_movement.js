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
		
		// Show empty state with instructions
		this.show_empty_state();
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
					fieldtype: 'Column Break'
				},
				{
					label: 'Exclude Problematic Batches',
					fieldtype: 'Check',
					fieldname: 'exclude_problematic_batches',
					default: 1
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
		// Add Generate Report button as PRIMARY action
		this.page.set_primary_action(__('Generate Report'), () => this.make_report(), 'octicon octicon-sync');
		
		this.page.add_inner_button(__('Refresh'), () => this.make_report());
		this.page.add_inner_button(__('Validate Data'), () => this.validate_data());
		this.page.add_inner_button(__('Export CSV'), () => this.export_to_csv());
		
		 // Add Manage Excluded Batches button
		this.page.add_inner_button(__('Manage Excluded Batches'), () => {
			frappe.set_route('List', 'Excluded Stock Batch');
		});
		
		// Only keep the item code search filter (doesn't trigger report generation)
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
			warehouse_type: this.filters.warehouse_type.get_value(),
			exclude_problematic_batches: this.filters.exclude_problematic_batches.get_value()
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
		
		// Calculate value ranges for color coding
		this.value_ranges = this.calculate_value_ranges(data);
		
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
								<th rowspan="2" class="actions-header">Actions</th>
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
					
					<td class="mat-cell" style="background-color: ${this.get_color_intensity(item["Mat"].opening_qty, this.value_ranges.mat.opening.min, this.value_ranges.mat.opening.max, 'mat')}">${this.format_number(item["Mat"].opening_qty)}</td>
					<td class="mat-cell" style="background-color: ${this.get_color_intensity(item["Mat"].incoming_qty, this.value_ranges.mat.incoming.min, this.value_ranges.mat.incoming.max, 'mat')}">${this.format_number(item["Mat"].incoming_qty)}</td>
					<td class="mat-cell" style="background-color: ${this.get_color_intensity(item["Mat"].outgoing_qty, this.value_ranges.mat.outgoing.min, this.value_ranges.mat.outgoing.max, 'mat')}">${this.format_number(item["Mat"].outgoing_qty)}</td>
					<td class="mat-cell" style="background-color: ${this.get_color_intensity(item["Mat"].closing_qty, this.value_ranges.mat.closing.min, this.value_ranges.mat.closing.max, 'mat')}">${this.format_number(item["Mat"].closing_qty)}</td>
					
					<td class="products-cell" style="background-color: ${this.get_color_intensity(item["Products"].opening_qty, this.value_ranges.products.opening.min, this.value_ranges.products.opening.max, 'products')}">${this.format_number(item["Products"].opening_qty)}</td>
					<td class="products-cell" style="background-color: ${this.get_color_intensity(item["Products"].incoming_qty, this.value_ranges.products.incoming.min, this.value_ranges.products.incoming.max, 'products')}">${this.format_number(item["Products"].incoming_qty)}</td>
					<td class="products-cell" style="background-color: ${this.get_color_intensity(item["Products"].outgoing_qty, this.value_ranges.products.outgoing.min, this.value_ranges.products.outgoing.max, 'products')}">${this.format_number(item["Products"].outgoing_qty)}</td>
					<td class="products-cell" style="background-color: ${this.get_color_intensity(item["Products"].closing_qty, this.value_ranges.products.closing.min, this.value_ranges.products.closing.max, 'products')}">${this.format_number(item["Products"].closing_qty)}</td>
					
					<td class="finished-product-cell" style="background-color: ${this.get_color_intensity(item["Finished Product"].opening_qty, this.value_ranges.finished_product.opening.min, this.value_ranges.finished_product.opening.max, 'finished_product')}">${this.format_number(item["Finished Product"].opening_qty)}</td>
					<td class="finished-product-cell" style="background-color: ${this.get_color_intensity(item["Finished Product"].incoming_qty, this.value_ranges.finished_product.incoming.min, this.value_ranges.finished_product.incoming.max, 'finished_product')}">${this.format_number(item["Finished Product"].incoming_qty)}</td>
					<td class="finished-product-cell" style="background-color: ${this.get_color_intensity(item["Finished Product"].outgoing_qty, this.value_ranges.finished_product.outgoing.min, this.value_ranges.finished_product.outgoing.max, 'finished_product')}">${this.format_number(item["Finished Product"].outgoing_qty)}</td>
					<td class="finished-product-cell" style="background-color: ${this.get_color_intensity(item["Finished Product"].closing_qty, this.value_ranges.finished_product.closing.min, this.value_ranges.finished_product.closing.max, 'finished_product')}">${this.format_number(item["Finished Product"].closing_qty)}</td>
					
					<td class="grand-total-cell" style="background-color: ${this.get_color_intensity(item["total"].closing_qty, this.value_ranges.total.closing.min, this.value_ranges.total.closing.max, 'total')}">${this.format_number(item["total"].closing_qty)}</td>
					
					<td class="actions-cell">
						<button class="btn btn-xs btn-default view-batches-btn" data-code="${item.common_code}" title="View Batch Details">
							<i class="fa fa-list"></i> Batches
						</button>
					</td>
				</tr>`;
		});
		
		// Add grand total row
		html += `
			<tr class="grand-total-row">
				<td class="total-label sticky-column"><strong>Grand Total</strong></td>
				
				<td class="mat-total" style="background-color: ${this.get_color_intensity(grand_total["Mat"].opening_qty, this.value_ranges.mat.opening.min, this.value_ranges.mat.opening.max, 'mat')}"><strong>${this.format_number(grand_total["Mat"].opening_qty)}</strong></td>
				<td class="mat-total" style="background-color: ${this.get_color_intensity(grand_total["Mat"].incoming_qty, this.value_ranges.mat.incoming.min, this.value_ranges.mat.incoming.max, 'mat')}"><strong>${this.format_number(grand_total["Mat"].incoming_qty)}</strong></td>
				<td class="mat-total" style="background-color: ${this.get_color_intensity(grand_total["Mat"].outgoing_qty, this.value_ranges.mat.outgoing.min, this.value_ranges.mat.outgoing.max, 'mat')}"><strong>${this.format_number(grand_total["Mat"].outgoing_qty)}</strong></td>
				<td class="mat-total" style="background-color: ${this.get_color_intensity(grand_total["Mat"].closing_qty, this.value_ranges.mat.closing.min, this.value_ranges.mat.closing.max, 'mat')}"><strong>${this.format_number(grand_total["Mat"].closing_qty)}</strong></td>
				
				<td class="products-total" style="background-color: ${this.get_color_intensity(grand_total["Products"].opening_qty, this.value_ranges.products.opening.min, this.value_ranges.products.opening.max, 'products')}"><strong>${this.format_number(grand_total["Products"].opening_qty)}</strong></td>
				<td class="products-total" style="background-color: ${this.get_color_intensity(grand_total["Products"].incoming_qty, this.value_ranges.products.incoming.min, this.value_ranges.products.incoming.max, 'products')}"><strong>${this.format_number(grand_total["Products"].incoming_qty)}</strong></td>
				<td class="products-total" style="background-color: ${this.get_color_intensity(grand_total["Products"].outgoing_qty, this.value_ranges.products.outgoing.min, this.value_ranges.products.outgoing.max, 'products')}"><strong>${this.format_number(grand_total["Products"].outgoing_qty)}</strong></td>
				<td class="products-total" style="background-color: ${this.get_color_intensity(grand_total["Products"].closing_qty, this.value_ranges.products.closing.min, this.value_ranges.products.closing.max, 'products')}"><strong>${this.format_number(grand_total["Products"].closing_qty)}</strong></td>
				
				<td class="finished-product-total" style="background-color: ${this.get_color_intensity(grand_total["Finished Product"].opening_qty, this.value_ranges.finished_product.opening.min, this.value_ranges.finished_product.opening.max, 'finished_product')}"><strong>${this.format_number(grand_total["Finished Product"].opening_qty)}</strong></td>
				<td class="finished-product-total" style="background-color: ${this.get_color_intensity(grand_total["Finished Product"].incoming_qty, this.value_ranges.finished_product.incoming.min, this.value_ranges.finished_product.incoming.max, 'finished_product')}"><strong>${this.format_number(grand_total["Finished Product"].incoming_qty)}</strong></td>
				<td class="finished-product-total" style="background-color: ${this.get_color_intensity(grand_total["Finished Product"].outgoing_qty, this.value_ranges.finished_product.outgoing.min, this.value_ranges.finished_product.outgoing.max, 'finished_product')}"><strong>${this.format_number(grand_total["Finished Product"].outgoing_qty)}</strong></td>
				<td class="finished-product-total" style="background-color: ${this.get_color_intensity(grand_total["Finished Product"].closing_qty, this.value_ranges.finished_product.closing.min, this.value_ranges.finished_product.closing.max, 'finished_product')}"><strong>${this.format_number(grand_total["Finished Product"].closing_qty)}</strong></td>
				
				<td class="grand-total-total" style="background-color: ${this.get_color_intensity(grand_total.closing_qty, this.value_ranges.total.closing.min, this.value_ranges.total.closing.max, 'total')}"><strong>${this.format_number(grand_total.closing_qty)}</strong></td>
				
				<td></td>
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

		// **FIXED: Bind batch details button click - Navigate to batch details page**
		this.$report_container.on('click', '.view-batches-btn', (e) => {
			e.preventDefault();
			const code = $(e.currentTarget).data('code');
			
			// Store filters in localStorage for persistence
			const filters = {
				from_date: this.filters.from_date.get_value(),
				to_date: this.filters.to_date.get_value(),
				warehouse: this.filters.warehouse.get_value(),
				warehouse_type: this.filters.warehouse_type.get_value(),
				exclude_problematic_batches: this.filters.exclude_problematic_batches.get_value()
			};
			localStorage.setItem('batch_details_filters', JSON.stringify(filters));
			
			// Navigate to batch details page with common_code in URL
			frappe.set_route('batch-wise-stock-details', code);
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

	// Calculate min/max values for each column to determine color intensity ranges
	calculate_value_ranges(data) {
		const ranges = {
			mat: { opening: {min: 0, max: 0}, incoming: {min: 0, max: 0}, outgoing: {min: 0, max: 0}, closing: {min: 0, max: 0} },
			products: { opening: {min: 0, max: 0}, incoming: {min: 0, max: 0}, outgoing: {min: 0, max: 0}, closing: {min: 0, max: 0} },
			finished_product: { opening: {min: 0, max: 0}, incoming: {min: 0, max: 0}, outgoing: {min: 0, max: 0}, closing: {min: 0, max: 0} },
			total: { closing: {min: 0, max: 0} }
		};
		
		if (!data || data.length === 0) return ranges;
		
		// Extract all values for each column
		const mat_opening = data.map(item => item["Mat"].opening_qty || 0);
		const mat_incoming = data.map(item => item["Mat"].incoming_qty || 0);
		const mat_outgoing = data.map(item => item["Mat"].outgoing_qty || 0);
		const mat_closing = data.map(item => item["Mat"].closing_qty || 0);
		
		const products_opening = data.map(item => item["Products"].opening_qty || 0);
		const products_incoming = data.map(item => item["Products"].incoming_qty || 0);
		const products_outgoing = data.map(item => item["Products"].outgoing_qty || 0);
		const products_closing = data.map(item => item["Products"].closing_qty || 0);
		
		const fp_opening = data.map(item => item["Finished Product"].opening_qty || 0);
		const fp_incoming = data.map(item => item["Finished Product"].incoming_qty || 0);
		const fp_outgoing = data.map(item => item["Finished Product"].outgoing_qty || 0);
		const fp_closing = data.map(item => item["Finished Product"].closing_qty || 0);
		
		const total_closing = data.map(item => item["total"].closing_qty || 0);
		
		// Calculate min/max for each column
		ranges.mat.opening = { min: Math.min(...mat_opening), max: Math.max(...mat_opening) };
		ranges.mat.incoming = { min: Math.min(...mat_incoming), max: Math.max(...mat_incoming) };
		ranges.mat.outgoing = { min: Math.min(...mat_outgoing), max: Math.max(...mat_outgoing) };
		ranges.mat.closing = { min: Math.min(...mat_closing), max: Math.max(...mat_closing) };
		
		ranges.products.opening = { min: Math.min(...products_opening), max: Math.max(...products_opening) };
		ranges.products.incoming = { min: Math.min(...products_incoming), max: Math.max(...products_incoming) };
		ranges.products.outgoing = { min: Math.min(...products_outgoing), max: Math.max(...products_outgoing) };
		ranges.products.closing = { min: Math.min(...products_closing), max: Math.max(...products_closing) };
		
		ranges.finished_product.opening = { min: Math.min(...fp_opening), max: Math.max(...fp_opening) };
		ranges.finished_product.incoming = { min: Math.min(...fp_incoming), max: Math.max(...fp_incoming) };
		ranges.finished_product.outgoing = { min: Math.min(...fp_outgoing), max: Math.max(...fp_outgoing) };
		ranges.finished_product.closing = { min: Math.min(...fp_closing), max: Math.max(...fp_closing) };
		
		ranges.total.closing = { min: Math.min(...total_closing), max: Math.max(...total_closing) };
		
		return ranges;
	}

	// Generate background color intensity based on value and range
	get_color_intensity(value, min_val, max_val, base_color) {
		if (max_val === min_val) return 'rgba(248, 249, 250, 0.3)'; // Default light color if no range
		
		// Normalize value to 0-1 range
		const normalized = Math.max(0, Math.min(1, (value - min_val) / (max_val - min_val)));
		
		// Define color intensities based on column type
		const color_configs = {
			mat: { r: 96, g: 125, b: 139 },        // Blue-gray for Mat
			products: { r: 84, g: 110, b: 122 },   // Slightly different blue-gray for Products  
			finished_product: { r: 69, g: 90, b: 100 }, // Darker blue-gray for Finished Product
			total: { r: 44, g: 62, b: 80 }         // Darkest blue-gray for Total
		};
		
		const config = color_configs[base_color] || color_configs.mat;
		
		// Calculate opacity based on normalized value (0.1 to 0.8 range)
		const opacity = 0.1 + (normalized * 0.7);
		
		return `rgba(${config.r}, ${config.g}, ${config.b}, ${opacity})`;
	}

	// Utility: numeric formatting with smart decimals and lakh separators - ROUNDED TO WHOLE NUMBERS
	format_number(value) {
		const n = Number(value || 0);
		if (!isFinite(n)) return '0';
		const abs = Math.abs(n);
		
		// Format in Indian number system (lakhs/crores) - ALL ROUNDED TO WHOLE NUMBERS
		if (abs >= 10000000) { // 1 crore
			return Math.round(n / 10000000) + ' Cr';
		} else if (abs >= 100000) { // 1 lakh
			return Math.round(n / 100000) + ' L';
		} else if (abs >= 1000) { // 1 thousand
			return Math.round(n / 1000) + 'K';
		} else {
			// Always return whole numbers (no decimals)
			return Math.round(n).toLocaleString('en-IN');
		}
	}

	// Utility: round for CSV/raw values - NO DECIMALS
	round_number(value, decimals = 0) {
		const n = Number(value || 0);
		if (!isFinite(n)) return 0;
		return Math.round(n);
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
				.sortable:hover { background-color: rgba(44, 62, 80, 0.08); }
				.sort-icon { margin-left: 4px; opacity: 0.7; }
				
				/* Professional header styling with SOLID dark colors (NO GRADIENTS) */
				.common-code-header { 
					background-color: #1e293b !important; 
					color: white; 
					font-weight: 600; 
				}
				
				/* Mat columns - Solid Blue (#1e40af) */
				.mat-header { 
					background: #1e40af !important; 
					color: white; 
					font-weight: 600; 
				}
				.mat-subheader { 
					background: #1d4ed8 !important; 
					color: white; 
					font-weight: 500; 
				}
				.mat-cell { 
					border-left: 3px solid #dbeafe;
					/* Background color applied dynamically via inline styles */
				}
				.mat-total { 
					font-weight: 600; 
					border-left: 3px solid #bfdbfe;
					/* Background color applied dynamically via inline styles */
				}
				
				/* Products columns - Solid Red/Orange (#c2410c) */
				.products-header { 
					background: #c2410c !important; 
					color: white; 
					font-weight: 600; 
				}
				.products-subheader { 
					background: #ea580c !important; 
					color: white; 
					font-weight: 500; 
				}
				.products-cell { 
					border-left: 3px solid #fed7aa;
					/* Background color applied dynamically via inline styles */
				}
				.products-total { 
					font-weight: 600; 
					border-left: 3px solid #fdba74;
					/* Background color applied dynamically via inline styles */
				}
				
				/* Finished Product columns - Solid Green (#15803d) */
				.finished-product-header { 
					background: #15803d !important; 
					color: white; 
					font-weight: 600; 
				}
				.finished-product-subheader { 
					background: #16a34a !important; 
					color: white; 
					font-weight: 500; 
				}
				.finished-product-cell { 
					border-left: 3px solid #bbf7d0;
					/* Background color applied dynamically via inline styles */
				}
				.finished-product-total { 
					font-weight: 600; 
					border-left: 3px solid #86efac;
					/* Background color applied dynamically via inline styles */
				}
				
				/* Grand Total column - Solid Dark Gray */
				.grand-total-header { 
					background: #0f172a !important; 
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
					border-left: 3px solid #d1d7dd;
					color: #0f172a;
				}

				/* Actions Column - Solid Dark */
				.actions-header {
					background: #475569 !important;
					color: white !important;
					font-weight: 700 !important;
				}
				.actions-cell {
					text-align: center !important;
					padding: 8px !important;
				}
				.view-batches-btn {
					background: #1e293b !important;
					color: white !important;
					border: none !important;
					padding: 6px 14px !important;
					font-weight: 700 !important;
					font-size: 12px !important;
					text-transform: uppercase !important;
					cursor: pointer !important;
					border-radius: 4px !important;
					transition: background 0.2s !important;
				}
				.view-batches-btn:hover {
					background: #334155 !important;
				}
				
				/* Alternating row colors removed - using dynamic value-based colors instead */
				
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
				
				/* Enhanced hover effects with consistent color theme */
				.stock-movement-report tbody tr:hover td { 
					background-color: rgba(44, 62, 80, 0.04) !important;
					transition: background-color 0.2s ease;
				}
				.stock-movement-report tbody tr:hover .sticky-column { 
					background-color: rgba(44, 62, 80, 0.06) !important; 
					box-shadow: 2px 0 8px rgba(44, 62, 80, 0.12);
				}
				.stock-movement-report .grand-total-row:hover .sticky-column.total-label { 
					background-color: #34495e !important; 
				}
				
				/* Link styling with consistent theme */
				.common-code-link {
					color: #2c3e50;
					text-decoration: none;
					font-weight: 600;
					transition: color 0.2s ease;
				}
				.common-code-link:hover {
					color: #34495e;
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
	
	show_empty_state() {
		const html = `
			<div class="empty-state-container" style="
				text-align: center;
				padding: 80px 20px;
				background: #f8f9fa;
				border-radius: 12px;
				margin: 20px 0;
			">
				<i class="fa fa-chart-bar fa-4x" style="color: #cbd5e1; margin-bottom: 20px;"></i>
				<h3 style="color: #64748b; margin-bottom: 15px;">No Report Generated Yet</h3>
				<p style="color: #94a3b8; font-size: 16px; max-width: 500px; margin: 0 auto 30px;">
					Select your filters above and click <strong>"Generate Report"</strong> button to load the aggregated stock movement data.
				</p>
				<button class="btn btn-primary btn-lg generate-report-btn" style="
					padding: 12px 32px;
					font-size: 16px;
					font-weight: 600;
					text-transform: uppercase;
				">
					<i class="fa fa-sync"></i> Generate Report
				</button>
			</div>
		`;
		
		this.$report_container = $('<div class="report-container">').appendTo(this.page.main);
		this.$report_container.html(html);
		
		// Bind click event for the generate button
		this.$report_container.on('click', '.generate-report-btn', () => {
			this.make_report();
		});
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
								<th class="actions-header skeleton skeleton-header">&nbsp;</th>
							</tr>
							<tr>
								<th class="sticky-column skeleton skeleton-header">&nbsp;</th>
								${'<th class="skeleton skeleton-header">&nbsp;</th>'.repeat(14)}
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