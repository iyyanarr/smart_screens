frappe.pages['spp-aggregated-report'].on_page_load = function(wrapper) {
	var page = frappe.ui.make_app_page({
		parent: wrapper,
		title: 'SPP Aggregated Report',
		single_column: true
	});
	
	new SPPAggregatedReport(page);
}

class SPPAggregatedReport {
	constructor(page) {
		this.page = page;
		this.make_filters();
		this.add_buttons();
		this.show_empty_state();
	}
	
	make_filters() {
		this.filters = new frappe.ui.FieldGroup({
			fields: [
				{
					fieldtype: 'Section Break',
					label: 'Filters'
				},
				{
					label: 'Company',
					fieldtype: 'Link',
					fieldname: 'company',
					options: 'Company',
					default: frappe.defaults.get_user_default('Company'),
					reqd: 1
				},
				{
					fieldtype: 'Column Break'
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
					label: 'Warehouse',
					fieldtype: 'Link',
					fieldname: 'warehouse',
					options: 'Warehouse',
					reqd: 1
				},
				{
					fieldtype: 'Column Break'
				},
				{
					label: 'Item Group',
					fieldtype: 'Link',
					fieldname: 'item_group',
					options: 'Item Group'
				},
				{
					fieldtype: 'Section Break'
				}
			],
			body: this.page.body
		});
		
		this.filters.make();
	}
	
	add_buttons() {
		this.page.set_primary_action(__('Generate Report'), () => this.load_report(), 'octicon octicon-sync');
		
		// Add button to manage excluded batches
		this.page.add_inner_button(__('Manage Excluded Batches'), () => {
			frappe.set_route('List', 'Excluded Stock Batch');
		}, __('Tools'));
	}
	
	load_report() {
		const filter_values = {
			company: this.filters.get_value('company'),
			from_date: this.filters.get_value('from_date'),
			to_date: this.filters.get_value('to_date'),
			warehouse: this.filters.get_value('warehouse'),
			item_group: this.filters.get_value('item_group')
		};
		
		if (!filter_values.warehouse) {
			frappe.msgprint({
				title: __('Required Field Missing'),
				indicator: 'red',
				message: __('Please select a Warehouse')
			});
			return;
		}
		
		this.show_loading();
		
		frappe.call({
			method: 'smart_screens.smart_screens.page.spp_aggregated_report.spp_aggregated_report.get_spp_batch_balance_data',
			args: { filters: filter_values },
			callback: (r) => {
				if (r.message && r.message.success) {
					this.render_report(r.message);
				} else {
					const error = r.message?.error || 'Failed to load report data';
					frappe.msgprint({
						title: __('Error'),
						indicator: 'red',
						message: error
					});
					this.show_empty_state(error);
				}
			},
			error: (err) => {
				frappe.msgprint({
					title: __('Error'),
					indicator: 'red',
					message: __('An error occurred while loading the report')
				});
				console.error('Report error:', err);
				this.show_empty_state('An error occurred');
			}
		});
	}
	
	render_report(response) {
		const data = response.data || [];
		const grand_total = response.grand_total || {};
		
		if (!data || data.length === 0) {
			this.show_empty_state('No data found for the selected filters');
			return;
		}
		
			// Store filters for batch details
		this.current_filters = {
			company: this.filters.get_value('company'),
			from_date: this.filters.get_value('from_date'),
			to_date: this.filters.get_value('to_date'),
			warehouse: this.filters.get_value('warehouse'),
			item_group: this.filters.get_value('item_group')
		};
		
		// Create aggregated table HTML
		let html = `
			<div class="spp-aggregated-container">
				<div class="report-info">
					<span><strong>Total Items:</strong> ${response.aggregated_records || 0}</span>
					<span class="ml-3"><strong>Filtered Records:</strong> ${response.filtered_records || 0}</span>
					<span class="ml-3"><strong>Source Records:</strong> ${response.total_records || 0}</span>
				</div>
				<div class="table-responsive">
					<table class="table table-bordered aggregated-table">
						<thead>
							<tr>
								<th rowspan="2" class="item-header">Item Code</th>
								<th colspan="4" class="mat-header">Mat (Nos)</th>
								<th colspan="4" class="products-header">Products</th>
								<th colspan="4" class="finished-header">Finished Product</th>
								<th rowspan="2" class="total-header">Total</th>
								<th rowspan="2" class="action-header">Actions</th>
							</tr>
							<tr>
								<!-- Mat columns -->
								<th class="mat-subheader">Opening</th>
								<th class="mat-subheader">In</th>
								<th class="mat-subheader">Out</th>
								<th class="mat-subheader">Balance</th>
								<!-- Products columns -->
								<th class="products-subheader">Opening</th>
								<th class="products-subheader">In</th>
								<th class="products-subheader">Out</th>
								<th class="products-subheader">Balance</th>
								<!-- Finished Product columns -->
								<th class="finished-subheader">Opening</th>
								<th class="finished-subheader">In</th>
								<th class="finished-subheader">Out</th>
								<th class="finished-subheader">Balance</th>
							</tr>
						</thead>
						<tbody>`;
		
		// Add data rows
		data.forEach(row => {
			html += `
				<tr>
					<td class="item-code"><strong>${row.common_code}</strong></td>
					<!-- Mat -->
					<td class="qty-cell">${this.format_number(row.Mat.opening_qty)}</td>
					<td class="qty-cell in-qty">${this.format_number(row.Mat.in_qty)}</td>
					<td class="qty-cell out-qty">${this.format_number(row.Mat.out_qty)}</td>
					<td class="qty-cell balance-qty"><strong>${this.format_number(row.Mat.balance_qty)}</strong></td>
					<!-- Products -->
					<td class="qty-cell">${this.format_number(row.Products.opening_qty)}</td>
					<td class="qty-cell in-qty">${this.format_number(row.Products.in_qty)}</td>
					<td class="qty-cell out-qty">${this.format_number(row.Products.out_qty)}</td>
					<td class="qty-cell balance-qty"><strong>${this.format_number(row.Products.balance_qty)}</strong></td>
					<!-- Finished Product -->
					<td class="qty-cell">${this.format_number(row['Finished Product'].opening_qty)}</td>
					<td class="qty-cell in-qty">${this.format_number(row['Finished Product'].in_qty)}</td>
					<td class="qty-cell out-qty">${this.format_number(row['Finished Product'].out_qty)}</td>
					<td class="qty-cell balance-qty"><strong>${this.format_number(row['Finished Product'].balance_qty)}</strong></td>
					<!-- Total -->
					<td class="qty-cell total-cell"><strong>${this.format_number(row.Total.balance_qty)}</strong></td>
					<!-- Actions -->
					<td class="action-cell">
						<button class="btn btn-xs btn-primary btn-batches" data-common-code="${row.common_code}">
							<i class="fa fa-list"></i> Batches
						</button>
					</td>
				</tr>`;
		});
		
		// Add grand total row
		html += `
				<tr class="grand-total-row">
					<td class="item-code"><strong>Grand Total</strong></td>
					<!-- Mat -->
					<td class="qty-cell"><strong>${this.format_number(grand_total.Mat.opening_qty)}</strong></td>
					<td class="qty-cell"><strong>${this.format_number(grand_total.Mat.in_qty)}</strong></td>
					<td class="qty-cell"><strong>${this.format_number(grand_total.Mat.out_qty)}</strong></td>
					<td class="qty-cell"><strong>${this.format_number(grand_total.Mat.balance_qty)}</strong></td>
					<!-- Products -->
					<td class="qty-cell"><strong>${this.format_number(grand_total.Products.opening_qty)}</strong></td>
					<td class="qty-cell"><strong>${this.format_number(grand_total.Products.in_qty)}</strong></td>
					<td class="qty-cell"><strong>${this.format_number(grand_total.Products.out_qty)}</strong></td>
					<td class="qty-cell"><strong>${this.format_number(grand_total.Products.balance_qty)}</strong></td>
					<!-- Finished Product -->
					<td class="qty-cell"><strong>${this.format_number(grand_total['Finished Product'].opening_qty)}</strong></td>
					<td class="qty-cell"><strong>${this.format_number(grand_total['Finished Product'].in_qty)}</strong></td>
					<td class="qty-cell"><strong>${this.format_number(grand_total['Finished Product'].out_qty)}</strong></td>
					<td class="qty-cell"><strong>${this.format_number(grand_total['Finished Product'].balance_qty)}</strong></td>
					<!-- Total -->
					<td class="qty-cell total-cell"><strong>${this.format_number(grand_total.Total.balance_qty)}</strong></td>
					<td class="action-cell"></td>
				</tr>
			</tbody>
		</table>
		</div>
		<div class="mt-2">
			<div class="text-muted small">Note: Mat quantities are displayed in Numbers (Nos). Large numbers formatted in Indian system (L = Lakh, Cr = Crore).</div>
		</div>
	</div>
		`;
		
		this.page.main.find('.report-container').remove();
		this.$container = $('<div class="report-container">').appendTo(this.page.main);
		this.$container.html(html);
		
		this.apply_styles();
		this.bind_batch_buttons();
	}
	
	bind_batch_buttons() {
		const me = this;
		this.$container.find('.btn-batches').on('click', function() {
			const common_code = $(this).data('common-code');
			me.show_batch_details(common_code);
		});
	}
	
	show_batch_details(common_code) {
		const me = this;
		
		// Show loading indicator in frappe interface
		frappe.show_alert({
			message: __('Preparing batch data...'),
			indicator: 'blue'
		}, 3);
		
		// Also show a progress indicator
		frappe.show_progress(__('Loading Batches'), 30, 100, __('Fetching data from server...'));
		
		frappe.call({
			method: 'smart_screens.smart_screens.page.spp_aggregated_report.spp_aggregated_report.get_batch_details_by_common_code',
			args: {
				common_code: common_code,
				filters: this.current_filters
			},
			callback: (r) => {
				frappe.hide_progress();
				if (r.message && r.message.success) {
					me.render_batch_modal(r.message);
				} else {
					frappe.msgprint({
						title: __('Error'),
						indicator: 'red',
						message: r.message?.error || 'Failed to load batch details'
					});
				}
			},
			error: (err) => {
				frappe.hide_progress();
				frappe.msgprint({
					title: __('Error'),
					indicator: 'red',
					message: __('Failed to fetch batch details')
				});
			}
		});
	}
	
	render_batch_modal(data) {
		const common_code = data.common_code;
		const batches = data.batches;
		const mat_count = data.mat_count || 0;
		const products_count = data.products_count || 0;
		const finished_count = data.finished_count || 0;
		
		// Create dialog
		const d = new frappe.ui.Dialog({
			title: `Batch Details for Item ${common_code}`,
			size: 'extra-large',
			fields: [
				{
					fieldtype: 'HTML',
					fieldname: 'batch_details_html'
				}
			]
		});
		
		// Build tabbed interface HTML - Use BUTTON elements instead of anchor tags
		let html = `
			<div class="batch-details-container">
				<div class="batch-info">
					<span><strong>Common Code:</strong> ${common_code}</span>
					<span class="ml-3"><strong>Total Batches:</strong> ${data.total_batches}</span>
				</div>
				
				<div class="batch-tabs-wrapper">
					<button class="batch-tab-btn active" data-tab="mat-tab">Mat (${mat_count})</button>
					<button class="batch-tab-btn" data-tab="products-tab">Products (${products_count})</button>
					<button class="batch-tab-btn" data-tab="finished-tab">Finished Product (${finished_count})</button>
				</div>
				
				<div class="tab-content">
					<div id="mat-tab" class="batch-tab-pane active">
						${this.build_batch_table(batches.Mat, 'Mat')}
					</div>
					<div id="products-tab" class="batch-tab-pane">
						${this.build_batch_table(batches.Products, 'Products')}
					</div>
					<div id="finished-tab" class="batch-tab-pane">
						${this.build_batch_table(batches['Finished Product'], 'Finished Product')}
					</div>
				</div>
			</div>
		`;
		
		d.fields_dict.batch_details_html.$wrapper.html(html);
		
		// Bind tab click events to BUTTON elements
		d.fields_dict.batch_details_html.$wrapper.find('.batch-tab-btn').on('click', function(e) {
			e.preventDefault();
			e.stopPropagation();
			
			const targetTab = $(this).data('tab');
			
			// Remove active class from all tabs and tab content
			d.fields_dict.batch_details_html.$wrapper.find('.batch-tab-btn').removeClass('active');
			d.fields_dict.batch_details_html.$wrapper.find('.batch-tab-pane').removeClass('active');
			
			// Add active class to clicked tab and corresponding content
			$(this).addClass('active');
			d.fields_dict.batch_details_html.$wrapper.find(`#${targetTab}`).addClass('active');
		});
		
		d.show();
		this.bind_batch_table_features(d);
	}
	
	build_batch_table(batches, item_group) {
		if (!batches || batches.length === 0) {
			return `<div class="text-muted text-center p-4">No batches found for ${item_group}</div>`;
		}
		
		// Store batches for this item group for filtering/sorting
		const tableId = `batch-table-${item_group.toLowerCase().replace(/\s+/g, '-')}`;
		
		let html = `
			<div class="batch-table-controls mb-3">
				<div class="row">
					<div class="col-md-6">
						<input type="text" class="form-control batch-search-input" 
							placeholder="Search by Item, Batch, or Warehouse..." 
							data-table="${tableId}">
					</div>
					<div class="col-md-6 text-right">
						<span class="badge badge-info">Total: <span class="batch-count">${batches.length}</span> batches</span>
					</div>
				</div>
			</div>
			<div class="table-responsive mt-3">
				<table class="table table-bordered table-sm batch-table" id="${tableId}">
					<thead>
						<tr>
							<th class="sortable" data-column="item">Item Code <i class="fa fa-sort"></i></th>
							<th class="sortable" data-column="item_name">Item Name <i class="fa fa-sort"></i></th>
							<th class="sortable" data-column="batch">Batch <i class="fa fa-sort"></i></th>
							<th class="sortable" data-column="warehouse">Warehouse <i class="fa fa-sort"></i></th>
							<th class="sortable" data-column="opening_qty">Opening Qty <i class="fa fa-sort"></i></th>
							<th class="sortable" data-column="in_qty">In Qty <i class="fa fa-sort"></i></th>
							<th class="sortable" data-column="out_qty">Out Qty <i class="fa fa-sort"></i></th>
							<th class="sortable" data-column="balance_qty">Balance Qty <i class="fa fa-sort"></i></th>
							<th>UOM</th>
						</tr>
					</thead>
					<tbody>`;
		
		batches.forEach(batch => {
			html += `
				<tr data-item="${batch.item || ''}" 
				    data-batch="${batch.batch || ''}" 
				    data-warehouse="${batch.warehouse || ''}"
				    data-opening="${batch.opening_qty || 0}"
				    data-in="${batch.in_qty || 0}"
				    data-out="${batch.out_qty || 0}"
				    data-balance="${batch.balance_qty || 0}">
					<td>${batch.item || '-'}</td>
					<td>${batch.item_name || '-'}</td>
					<td>${batch.batch || '-'}</td>
					<td>${batch.warehouse || '-'}</td>
					<td class="text-right">${this.format_number(batch.opening_qty)}</td>
					<td class="text-right text-success">${this.format_number(batch.in_qty)}</td>
					<td class="text-right text-danger">${this.format_number(batch.out_qty)}</td>
					<td class="text-right"><strong>${this.format_number(batch.balance_qty)}</strong></td>
					<td>${batch.uom || '-'}</td>
				</tr>`;
		});
		
		html += `
					</tbody>
				</table>
			</div>`;
		
		return html;
	}
	
	bind_batch_table_features(dialog) {
		const me = this;
		
		// Bind search functionality
		dialog.fields_dict.batch_details_html.$wrapper.find('.batch-search-input').on('input', function() {
			const searchText = $(this).val().toLowerCase();
			const tableId = $(this).data('table');
			const $table = $(`#${tableId}`);
			
			let visibleCount = 0;
			$table.find('tbody tr').each(function() {
				const item = $(this).data('item').toString().toLowerCase();
				const batch = $(this).data('batch').toString().toLowerCase();
				const warehouse = $(this).data('warehouse').toString().toLowerCase();
				
				if (item.includes(searchText) || batch.includes(searchText) || warehouse.includes(searchText)) {
					$(this).show();
					visibleCount++;
				} else {
					$(this).hide();
				}
			});
			
			// Update count badge
			$(this).closest('.batch-tab-pane').find('.batch-count').text(visibleCount);
		});
		
		// Bind sorting functionality
		dialog.fields_dict.batch_details_html.$wrapper.find('.sortable').on('click', function() {
			const column = $(this).data('column');
			const $table = $(this).closest('table');
			const $tbody = $table.find('tbody');
			const $rows = $tbody.find('tr').toArray();
			
			// Determine sort order
			const isAscending = $(this).hasClass('sort-asc');
			const newOrder = isAscending ? 'desc' : 'asc';
			
			// Update sort icons
			$table.find('.sortable').removeClass('sort-asc sort-desc');
			$table.find('.sortable i').removeClass('fa-sort-up fa-sort-down').addClass('fa-sort');
			
			$(this).addClass(`sort-${newOrder}`);
			$(this).find('i').removeClass('fa-sort').addClass(newOrder === 'asc' ? 'fa-sort-up' : 'fa-sort-down');
			
			// Sort rows
			$rows.sort((a, b) => {
				let aVal, bVal;
				
				if (['opening_qty', 'in_qty', 'out_qty', 'balance_qty'].includes(column)) {
					// Numeric sort
					aVal = parseFloat($(a).data(column.replace('_qty', ''))) || 0;
					bVal = parseFloat($(b).data(column.replace('_qty', ''))) || 0;
				} else {
					// String sort
					aVal = $(a).data(column).toString().toLowerCase();
					bVal = $(b).data(column).toString().toLowerCase();
				}
				
				if (newOrder === 'asc') {
					return aVal > bVal ? 1 : aVal < bVal ? -1 : 0;
				} else {
					return aVal < bVal ? 1 : aVal > bVal ? -1 : 0;
				}
			});
			
			// Re-append sorted rows
			$tbody.empty().append($rows);
		});
	}
	
	format_number(value) {
		const n = Number(value || 0);
		if (!isFinite(n)) return '0';
		const abs = Math.abs(n);
		
		if (abs >= 10000000) {
			return (n / 10000000).toFixed(2) + ' Cr';
		} else if (abs >= 100000) {
			return (n / 100000).toFixed(2) + ' L';
		} else if (abs >= 1000) {
			return (n / 1000).toFixed(2) + 'K';
		} else {
			return n.toFixed(2);
		}
	}
	
	show_loading() {
		this.page.main.find('.report-container').remove();
		this.$container = $('<div class="report-container">').appendTo(this.page.main);
		this.$container.html(`
			<div class="text-center" style="padding: 60px 20px;">
				<i class="fa fa-spinner fa-spin fa-3x text-muted"></i>
				<p class="text-muted mt-3" style="font-size: 16px;">Loading SPP Batch Balance data...</p>
			</div>
		`);
	}
	
	show_empty_state(message = null) {
		this.page.main.find('.report-container').remove();
		this.$container = $('<div class="report-container">').appendTo(this.page.main);
		this.$container.html(`
			<div class="empty-state" style="text-align: center; padding: 80px 20px;">
				<i class="fa fa-chart-bar fa-4x" style="color: #cbd5e1; margin-bottom: 20px;"></i>
				<h3 style="color: #64748b;">${message || 'No Report Generated Yet'}</h3>
				<p style="color: #94a3b8; font-size: 16px;">
					${message ? '' : 'Select your filters and click <strong>"Generate Report"</strong> to load data from SPP Batch Balance Report.'}
				</p>
			</div>
		`);
	}
	
	apply_styles() {
		if ($('#spp-aggregated-report-styles').length) return;
		
		$("<style id='spp-aggregated-report-styles'>")
			.prop("type", "text/css")
			.html(`
				.spp-aggregated-container {
					background: white;
					padding: 20px;
					border-radius: 8px;
					box-shadow: 0 2px 8px rgba(0,0,0,0.1);
				}
				.report-info {
					margin-bottom: 15px;
					padding: 10px;
					background: #f8f9fa;
					border-radius: 4px;
					display: flex;
					gap: 10px;
					color: #1e293b;
					font-weight: 500;
				}
				.table-responsive {
					overflow-x: auto;
					margin-top: 15px;
				}
				.aggregated-table {
					width: 100%;
					font-size: 13px;
					border-collapse: collapse;
				}
				.aggregated-table th {
					padding: 12px 8px;
					text-align: center;
					font-weight: 600;
					border: 1px solid #dee2e6;
					white-space: nowrap;
				}
				.aggregated-table td {
					padding: 10px 8px;
					text-align: right;
					border: 1px solid #dee2e6;
					color: #1e293b !important;
					font-weight: 500;
				}
				.item-header, .action-header {
					background: #1e293b !important;
					color: white !important;
					text-align: center !important;
				}
				.mat-header {
					background: #1e40af !important;
					color: white !important;
				}
				.mat-subheader {
					background: #3b82f6 !important;
					color: white !important;
					font-size: 12px;
				}
				.products-header {
					background: #c2410c !important;
					color: white !important;
				}
				.products-subheader {
					background: #ea580c !important;
					color: white !important;
					font-size: 12px;
				}
				.finished-header {
					background: #15803d !important;
					color: white !important;
				}
				.finished-subheader {
					background: #16a34a !important;
					color: white !important;
					font-size: 12px;
				}
				.total-header {
					background: #0f172a !important;
					color: white !important;
				}
				.item-code {
					text-align: left !important;
					font-weight: 700 !important;
					background: #f8f9fa;
					font-family: 'Courier New', monospace;
					color: #0f172a !important;
					font-size: 14px !important;
				}
				.qty-cell {
					font-family: 'Courier New', monospace;
					font-size: 13px !important;
					color: #1e293b !important;
				}
				.in-qty { 
					color: #059669 !important;
					font-weight: 600 !important;
				}
				.out-qty { 
					color: #dc2626 !important;
					font-weight: 600 !important;
				}
				.balance-qty { 
					font-weight: 700 !important;
					color: #0f172a !important;
				}
				.total-cell {
					background: #f1f5f9;
					font-weight: 700 !important;
					font-size: 14px !important;
					color: #0f172a !important;
				}
				.action-cell {
					text-align: center !important;
					background: #f8f9fa;
				}
				.btn-batches {
					padding: 4px 12px;
					font-size: 12px;
					font-weight: 600;
				}
				.grand-total-row {
					background: #f8f9fa;
					border-top: 3px solid #1e293b;
				}
				.grand-total-row td {
					font-weight: 700 !important;
					background: #f8f9fa !important;
					color: #0f172a !important;
					font-size: 14px !important;
				}
				.aggregated-table tbody tr:hover {
					background: #f1f5f9;
				}
				.aggregated-table tbody tr:hover td {
					color: #0f172a !important;
				}
				
				/* Batch Modal Styles */
				.batch-details-container {
					padding: 15px;
				}
				.batch-info {
					padding: 12px;
					background: #f8f9fa;
					border-radius: 4px;
					margin-bottom: 15px;
					color: #1e293b;
					font-weight: 500;
				}
				.batch-tabs-wrapper {
					display: flex;
					gap: 10px;
					margin-bottom: 20px;
				}
				.batch-tab-btn {
					color: #64748b;
					font-weight: 600;
					padding: 10px 20px;
					border: none;
					background: transparent;
					cursor: pointer;
				}
				.batch-tab-btn.active {
					color: #1e40af;
					border-bottom: 3px solid #1e40af;
					background: transparent;
				}
				.batch-tab-pane {
					display: none;
				}
				.batch-tab-pane.active {
					display: block;
				}
				.batch-table {
					font-size: 12px;
				}
				.batch-table th {
					background: #f1f5f9;
					color: #1e293b;
					font-weight: 600;
					padding: 10px 8px;
					border: 1px solid #dee2e6;
				}
				.batch-table td {
					padding: 8px;
					border: 1px solid #e2e8f0;
					color: #475569;
				}
				.batch-table tbody tr:hover {
					background: #f8fafc;
					cursor: pointer;
				}
				.batch-table-controls {
					margin-bottom: 15px;
				}
				.batch-search-input {
					width: 100%;
					padding: 8px 12px;
					border: 1px solid #cbd5e0;
					border-radius: 4px;
					font-size: 14px;
					transition: border-color 0.2s;
				}
				.batch-search-input:focus {
					outline: none;
					border-color: #1e40af;
					box-shadow: 0 0 0 3px rgba(30, 64, 175, 0.1);
				}
				.batch-search-input::placeholder {
					color: #94a3b8;
				}
				.badge-info {
					background: #1e40af;
					color: white;
					padding: 6px 12px;
					border-radius: 4px;
					font-size: 13px;
					font-weight: 600;
				}
				.sortable {
					cursor: pointer;
					user-select: none;
					transition: background-color 0.2s;
				}
				.sortable:hover {
					background: #e2e8f0 !important;
				}
				.sortable i {
					margin-left: 5px;
					font-size: 11px;
					color: #94a3b8;
				}
				.sortable.sort-asc i,
				.sortable.sort-desc i {
					color: #1e40af;
				}
			`)
			.appendTo("head");
	}
}
