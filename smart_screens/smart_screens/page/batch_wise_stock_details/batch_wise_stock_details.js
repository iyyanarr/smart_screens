frappe.pages['batch-wise-stock-details'].on_page_load = function(wrapper) {
	var page = frappe.ui.make_app_page({
		parent: wrapper,
		title: 'Batch-Wise Stock Details',
		single_column: true
	});
	
	// Initialize page
	new BatchWiseStockDetails(page);
}

class BatchWiseStockDetails {
	constructor(page) {
		this.page = page;
		
		// **UPDATED: Get common_code from URL route parameter**
		const route = frappe.get_route();
		this.common_code = route[1]; // route is ['batch-wise-stock-details', 'common_code']
		
		// **UPDATED: Get filters from localStorage**
		const stored_filters = localStorage.getItem('batch_details_filters');
		this.filters = stored_filters ? JSON.parse(stored_filters) : {
			from_date: frappe.datetime.add_months(frappe.datetime.get_today(), -1),
			to_date: frappe.datetime.get_today(),
			warehouse: null,
			warehouse_type: null,
			exclude_problematic_batches: true
		};
		
		if (!this.common_code) {
			frappe.msgprint(__('No item code specified'));
			frappe.set_route('aggregated-stock-movement');
			return;
		}
		
		// **NEW: Initialize active tab**
		this.active_tab = 'Mat';
		
		this.setup_page();
		this.load_batch_details();
	}
	
	setup_page() {
		// Add back button
		this.page.set_secondary_action(__('Back to Aggregation'), () => {
			frappe.set_route('aggregated-stock-movement');
		});
		
		// Add refresh button
		this.page.add_inner_button(__('Refresh'), () => this.load_batch_details());
		
		// Add export button
		this.page.add_inner_button(__('Export CSV'), () => this.export_to_csv());
		
		// Create container
		this.$container = $('<div class="batch-details-container">').appendTo(this.page.main);
	}
	
	load_batch_details() {
		this.show_loading();
		
		frappe.call({
			method: 'smart_screens.smart_screens.page.aggregated_stock_movement.aggregated_stock_movement.get_batch_details_by_common_code',
			args: {
				common_code: this.common_code,
				filters: this.filters || {}
			},
			callback: (r) => {
				if (r.message) {
					this.batch_data = r.message;
					this.render_batch_details();
				} else {
					this.$container.html('<div class="text-muted text-center mt-5">No batch data found</div>');
				}
			}
		});
	}
	
	render_batch_details() {
		const data = this.batch_data;
		const batches = data.batches || [];
		const excluded_count = data.excluded_count || 0;
		const active_count = data.active_count || 0;
		
		// Group batches by stage
		this.grouped_batches = {
			'Mat': [],
			'Products': [],
			'Finished Product': []
		};
		
		batches.forEach(batch => {
			const stage = batch.item_group || 'Other';
			if (this.grouped_batches[stage]) {
				this.grouped_batches[stage].push(batch);
			}
		});
		
		let html = `
			<div class="batch-wise-report">
				<!-- Header Section -->
				<div class="report-header">
					<div class="header-content">
						<h2 class="item-code-title">Item Code: <span class="highlight">${this.common_code}</span></h2>
						<div class="stats-bar">
							<div class="stat-card active">
								<i class="fa fa-check-circle"></i>
								<div class="stat-value">${active_count}</div>
								<div class="stat-label">Active Batches</div>
							</div>
							${excluded_count > 0 ? `
								<div class="stat-card excluded">
									<i class="fa fa-ban"></i>
									<div class="stat-value">${excluded_count}</div>
									<div class="stat-label">Excluded Batches</div>
								</div>
							` : ''}
							<div class="stat-card total">
								<i class="fa fa-cube"></i>
								<div class="stat-value">${batches.length}</div>
								<div class="stat-label">Total Batches</div>
							</div>
						</div>
					</div>
				</div>
				
				<!-- Filter Info -->
				<div class="filter-info">
					<span><i class="fa fa-calendar"></i> ${this.filters?.from_date || 'All'} to ${this.filters?.to_date || 'All'}</span>
					<span><i class="fa fa-warehouse"></i> ${this.filters?.warehouse || this.filters?.warehouse_type || 'All Warehouses'}</span>
				</div>
				
				<!-- **NEW: Tabs for Stages** -->
				<div class="stage-tabs">
					<div class="tabs-nav">
						<button class="tab-btn ${this.active_tab === 'Mat' ? 'active' : ''}" data-stage="Mat">
							<i class="fa fa-layer-group"></i> Mat (${this.grouped_batches['Mat'].length})
						</button>
						<button class="tab-btn ${this.active_tab === 'Products' ? 'active' : ''}" data-stage="Products">
							<i class="fa fa-box"></i> Products (${this.grouped_batches['Products'].length})
						</button>
						<button class="tab-btn ${this.active_tab === 'Finished Product' ? 'active' : ''}" data-stage="Finished Product">
							<i class="fa fa-check-square"></i> Finished (${this.grouped_batches['Finished Product'].length})
						</button>
					</div>
					
					<div class="tabs-content">
						${this.render_stage_content('Mat')}
						${this.render_stage_content('Products')}
						${this.render_stage_content('Finished Product')}
					</div>
				</div>
			</div>
		`;
		
		this.$container.html(html);
		this.apply_styles();
		this.bind_tab_events();
	}
	
	// **NEW: Render content for a single stage tab**
	render_stage_content(stage) {
		const stage_batches = this.grouped_batches[stage];
		const is_active = this.active_tab === stage;
		
		if (stage_batches.length === 0) {
			return `
				<div class="tab-pane ${is_active ? 'active' : ''}" data-stage="${stage}">
					<div class="empty-state">
						<i class="fa fa-inbox fa-3x"></i>
						<p>No batches found for ${stage}</p>
					</div>
				</div>
			`;
		}
		
		const stage_colors = {
			'Mat': '#1e40af',
			'Products': '#c2410c',
			'Finished Product': '#15803d'
		};
		const stage_color = stage_colors[stage];
		
		// Calculate stage totals
		const stage_totals = {
			opening: stage_batches.reduce((sum, b) => sum + (b.opening_qty || 0), 0),
			in: stage_batches.reduce((sum, b) => sum + (b.in_qty || 0), 0),
			out: stage_batches.reduce((sum, b) => sum + (b.out_qty || 0), 0),
			balance: stage_batches.reduce((sum, b) => sum + (b.balance_qty || 0), 0)
		};
		
		let content = `
			<div class="tab-pane ${is_active ? 'active' : ''}" data-stage="${stage}">
				<!-- Stage Summary -->
				<div class="stage-summary" style="background: ${stage_color};">
					<div class="summary-item">
						<span class="label">Opening:</span>
						<span class="value">${this.format_number(stage_totals.opening)}</span>
					</div>
					<div class="summary-item">
						<span class="label">In:</span>
						<span class="value">${this.format_number(stage_totals.in)}</span>
					</div>
					<div class="summary-item">
						<span class="label">Out:</span>
						<span class="value">${this.format_number(stage_totals.out)}</span>
					</div>
					<div class="summary-item">
						<span class="label">Balance:</span>
						<span class="value">${this.format_number(stage_totals.balance)}</span>
					</div>
				</div>
				
				<!-- Batch Table -->
				<div class="table-wrapper">
					<table class="batch-table">
						<thead>
							<tr>
								<th>Batch No</th>
								<th>Item Code</th>
								<th>Warehouse</th>
								<th class="text-right">Opening</th>
								<th class="text-right">In</th>
								<th class="text-right">Out</th>
								<th class="text-right">Balance</th>
								<th class="text-center">Status</th>
							</tr>
						</thead>
						<tbody>
		`;
		
		stage_batches.forEach(batch => {
			const row_class = batch.is_excluded ? 'excluded-row' : '';
			const status_badge = batch.is_excluded 
				? '<span class="status-badge excluded"><i class="fa fa-ban"></i> EXCLUDED</span>'
				: '<span class="status-badge active"><i class="fa fa-check"></i> ACTIVE</span>';
			
			content += `
				<tr class="${row_class}">
					<td class="batch-col">${batch.batch_no}</td>
					<td class="item-col"><code>${batch.item_code}</code></td>
					<td class="warehouse-col">${batch.warehouse || '-'}</td>
					<td class="qty-col text-right">${this.format_number(batch.opening_qty)}</td>
					<td class="qty-col text-right in-qty">${this.format_number(batch.in_qty)}</td>
					<td class="qty-col text-right out-qty">${this.format_number(batch.out_qty)}</td>
					<td class="qty-col text-right balance-qty">${this.format_number(batch.balance_qty)}</td>
					<td class="status-col text-center">${status_badge}</td>
				</tr>
			`;
		});
		
		content += `
						</tbody>
					</table>
				</div>
			</div>
		`;
		
		return content;
	}
	
	// **NEW: Bind tab click events**
	bind_tab_events() {
		this.$container.on('click', '.tab-btn', (e) => {
			const stage = $(e.currentTarget).data('stage');
			this.switch_tab(stage);
		});
	}
	
	// **NEW: Switch between tabs**
	switch_tab(stage) {
		this.active_tab = stage;
		
		// Update tab buttons
		this.$container.find('.tab-btn').removeClass('active');
		this.$container.find(`.tab-btn[data-stage="${stage}"]`).addClass('active');
		
		// Update tab panes
		this.$container.find('.tab-pane').removeClass('active');
		this.$container.find(`.tab-pane[data-stage="${stage}"]`).addClass('active');
	}
	
	format_number(value) {
		const n = Number(value || 0);
		if (!isFinite(n)) return '0.00';
		return n.toLocaleString('en-IN', {
			minimumFractionDigits: 2,
			maximumFractionDigits: 2
		});
	}
	
	show_loading() {
		this.$container.html(`
			<div class="text-center mt-5">
				<i class="fa fa-spinner fa-spin fa-3x text-muted"></i>
				<p class="text-muted mt-3" style="font-size: 16px;">Loading batch details...</p>
			</div>
		`);
	}
	
	export_to_csv() {
		frappe.msgprint(__('CSV Export functionality coming soon...'));
	}
	
	apply_styles() {
		$("<style>")
			.prop("type", "text/css")
			.html(`
				/* Batch-Wise Stock Details - Tabbed Design */
				.batch-wise-report {
					font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
					padding: 15px;
					background: #f8f9fa;
					min-height: 100vh;
				}
				
				/* Header Section */
				.report-header {
					background: #ffffff;
					border-radius: 8px;
					padding: 20px;
					margin-bottom: 20px;
					box-shadow: 0 2px 8px rgba(0,0,0,0.06);
					border-left: 4px solid #1e40af;
				}
				
				.item-code-title {
					font-size: 20px;
					font-weight: 700;
					color: #1e293b;
					margin-bottom: 15px;
				}
				
				.item-code-title .highlight {
					color: #1e40af;
					font-family: 'Courier New', monospace;
				}
				
				.stats-bar {
					display: flex;
					gap: 15px;
					flex-wrap: wrap;
				}
				
				.stat-card {
					flex: 1;
					min-width: 140px;
					background: #f8f9fa;
					border-radius: 6px;
					padding: 12px;
					text-align: center;
					border: 2px solid transparent;
				}
				
				.stat-card.active { border-color: #16a34a; background: #f0fdf4; }
				.stat-card.excluded { border-color: #dc2626; background: #fef2f2; }
				.stat-card.total { border-color: #2563eb; background: #eff6ff; }
				
				.stat-card i { font-size: 24px; margin-bottom: 6px; }
				.stat-card.active i { color: #16a34a; }
				.stat-card.excluded i { color: #dc2626; }
				.stat-card.total i { color: #2563eb; }
				
				.stat-value {
					font-size: 28px;
					font-weight: 700;
					color: #1e293b;
					margin: 6px 0;
				}
				
				.stat-label {
					font-size: 11px;
					font-weight: 600;
					color: #64748b;
					text-transform: uppercase;
				}
				
				/* Filter Info */
				.filter-info {
					background: #ffffff;
					padding: 10px 20px;
					border-radius: 6px;
					margin-bottom: 15px;
					display: flex;
					gap: 25px;
					font-size: 13px;
					color: #475569;
					box-shadow: 0 1px 4px rgba(0,0,0,0.04);
				}
				
				.filter-info i {
					margin-right: 6px;
					color: #64748b;
				}
				
				/* **NEW: Tabs Navigation** */
				.stage-tabs {
					background: #ffffff;
					border-radius: 8px;
					overflow: hidden;
					box-shadow: 0 2px 8px rgba(0,0,0,0.06);
				}
				
				.tabs-nav {
					display: flex;
					background: #f8f9fa;
					border-bottom: 2px solid #e2e8f0;
				}
				
				.tab-btn {
					flex: 1;
					padding: 15px 20px;
					background: transparent;
					border: none;
					border-bottom: 3px solid transparent;
					font-size: 14px;
					font-weight: 600;
					color: #64748b;
					cursor: pointer;
					transition: all 0.2s ease;
					text-transform: uppercase;
					letter-spacing: 0.5px;
				}
				
				.tab-btn:hover {
					background: #f1f5f9;
					color: #1e293b;
				}
				
				.tab-btn.active {
					background: #ffffff;
					color: #1e293b;
					border-bottom-color: #1e40af;
				}
				
				.tab-btn i {
					margin-right: 8px;
				}
				
				/* **NEW: Tab Content** */
				.tabs-content {
					position: relative;
				}
				
				.tab-pane {
					display: none;
					animation: fadeIn 0.3s ease;
				}
				
				.tab-pane.active {
					display: block;
				}
				
				@keyframes fadeIn {
					from { opacity: 0; }
					to { opacity: 1; }
				}
				
				/* Empty State */
				.empty-state {
					text-align: center;
					padding: 60px 20px;
					color: #94a3b8;
				}
				
				.empty-state i {
					margin-bottom: 15px;
					color: #cbd5e1;
				}
				
				.empty-state p {
					font-size: 16px;
					font-weight: 500;
				}
				
				/* Stage Summary Bar */
				.stage-summary {
					display: flex;
					justify-content: space-around;
					padding: 20px;
					color: white;
					gap: 20px;
					flex-wrap: wrap;
				}
				
				.summary-item {
					display: flex;
					flex-direction: column;
					align-items: center;
				}
				
				.summary-item .label {
					font-size: 11px;
					font-weight: 600;
					opacity: 0.9;
					text-transform: uppercase;
					letter-spacing: 0.5px;
					margin-bottom: 6px;
				}
				
				.summary-item .value {
					font-size: 22px;
					font-weight: 700;
				}
				
				/* Table Wrapper */
				.table-wrapper {
					padding: 20px;
					overflow-x: auto;
				}
				
				/* Batch Table */
				.batch-table {
					width: 100%;
					border-collapse: collapse;
					font-size: 13px;
				}
				
				.batch-table thead th {
					background: #f8f9fa;
					color: #1e293b;
					font-weight: 700;
					text-align: left;
					padding: 12px 10px;
					border-bottom: 2px solid #e2e8f0;
					text-transform: uppercase;
					font-size: 11px;
					letter-spacing: 0.5px;
					white-space: nowrap;
				}
				
				.batch-table tbody td {
					padding: 10px;
					border-bottom: 1px solid #f1f5f9;
					color: #475569;
				}
				
				.batch-table tbody tr:hover {
					background: #f8fafc;
				}
				
				.batch-table .excluded-row {
					background: #fef2f2 !important;
				}
				
				.batch-table .excluded-row:hover {
					background: #fee2e2 !important;
				}
				
				.batch-col { 
					font-family: 'Courier New', monospace;
					font-weight: 600;
					color: #1e293b;
					font-size: 13px;
				}
				
				.item-col code {
					background: #f1f5f9;
					padding: 3px 6px;
					border-radius: 3px;
					color: #334155;
					font-size: 12px;
				}
				
				.warehouse-col {
					color: #64748b;
					font-size: 12px;
				}
				
				.qty-col {
					font-weight: 600;
					font-family: 'Courier New', monospace;
					font-size: 13px;
				}
				
				.in-qty { color: #059669; }
				.out-qty { color: #dc2626; }
				.balance-qty { 
					color: #1e293b;
					font-weight: 700;
					font-size: 14px;
				}
				
				.status-badge {
					display: inline-block;
					padding: 4px 10px;
					border-radius: 12px;
					font-weight: 700;
					font-size: 10px;
					text-transform: uppercase;
					letter-spacing: 0.5px;
				}
				
				.status-badge.active {
					background: #16a34a;
					color: white;
				}
				
				.status-badge.excluded {
					background: #dc2626;
					color: white;
				}
				
				/* Utility Classes */
				.text-right { text-align: right !important; }
				.text-center { text-align: center !important; }
				
				/* Responsive Design */
				@media (max-width: 768px) {
					.batch-wise-report { padding: 10px; }
					.report-header { padding: 15px; }
					.item-code-title { font-size: 18px; }
					.stats-bar { flex-direction: column; }
					.stat-card { min-width: 100%; }
					.tabs-nav { flex-direction: column; }
					.tab-btn { border-bottom: none; border-left: 3px solid transparent; }
						tab-btn.active { border-left-color: #1e40af; }
					.stage-summary { flex-direction: column; }
					.table-wrapper { padding: 10px; }
					.batch-table { font-size: 11px; }
					.batch-table thead th,
					.batch-table tbody td { padding: 8px 6px; }
				}
			`)
			.appendTo("head");
	}
}
