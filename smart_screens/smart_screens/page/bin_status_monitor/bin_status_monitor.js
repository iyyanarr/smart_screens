// Copyright (c) 2025, Alphaworkz and contributors
// For license information, please see license.txt

frappe.pages['bin_status_monitor'].on_page_load = function(wrapper) {
	var page = frappe.ui.make_app_page({
		parent: wrapper,
		title: 'Bin Status Monitor',
		single_column: true
	});

	// Clean up any existing instance
	if (wrapper.bin_status_monitor_instance) {
		wrapper.bin_status_monitor_instance.cleanup();
	}

	// Initialize the page and store instance
	wrapper.bin_status_monitor_instance = new BinStatusMonitorPage(page);
};

frappe.pages['bin_status_monitor'].on_page_show = function(wrapper) {
	// Restart auto-refresh when page is shown
	if (wrapper.bin_status_monitor_instance) {
		wrapper.bin_status_monitor_instance.start_auto_refresh();
	}
};

// Cleanup when navigating away
frappe.pages['bin_status_monitor'].on_page_hide = function(wrapper) {
	if (wrapper.bin_status_monitor_instance) {
		wrapper.bin_status_monitor_instance.cleanup();
	}
};

class BinStatusMonitorPage {
	constructor(page) {
		this.page = page;
		this.warehouse = null;
		this.all_bins = [];
		this.filtered_bins = [];
		this.auto_refresh_interval = null;
		this.view_mode = 'grid'; // 'grid', 'table', or 'rack_map'
		this.status_filter = 'active'; // 'active', 'checkout', 'all'
		this.rack_data = null; // Store rack-grouped data
		
		this.init();
	}

	init() {
		this.setup_page();
		this.add_custom_styles();
		this.load_html();
		this.bind_events();
		this.load_bin_data();
		this.start_auto_refresh();
	}

	setup_page() {
		// Hide the default page header
		this.page.wrapper.find('.page-head').hide();
		
		// Remove all padding from parent containers
		this.page.main.parent().css({
			'padding': '0',
			'margin': '0'
		});
		
		this.page.main.css({
			'padding': '0',
			'margin': '0'
		});
	}

	load_html() {
		const html = `
			<div class="monitor-container">
				<!-- Purple/Blue Gradient Header - Same as Dashboard -->
				<div class="monitor-header">
					<h1>
						<i class="fa fa-th"></i>
						BIN STATUS MONITOR
					</h1>
					<button class="back-btn" id="back-to-dashboard">
						<i class="fa fa-arrow-left"></i>
						BACK TO DASHBOARD
					</button>
				</div>

				<!-- Main Content Area -->
				<div class="monitor-content">
						<!-- Status Filter Tabs -->
						<div class="status-tabs">
							<button class="status-tab active" data-status="active">
								<i class="fa fa-inbox"></i> Active Bins
							</button>
							<button class="status-tab" data-status="checkout">
								<i class="fa fa-sign-out"></i> Checkout History
							</button>
							<button class="status-tab" data-status="all">
								<i class="fa fa-history"></i> All Records
							</button>
						</div>

					<!-- Summary Cards Row -->
					<div class="summary-cards-row">
						<div class="summary-card card-green">
							<div class="card-icon">
								<i class="fa fa-inbox"></i>
							</div>
							<div class="card-content">
								<h3 id="total-bins">0</h3>
								<p>Active Bins</p>
							</div>
						</div>

						<div class="summary-card card-blue">
							<div class="card-icon">
								<i class="fa fa-tags"></i>
							</div>
							<div class="card-content">
								<h3 id="total-batches">0</h3>
								<p>Unique Batches</p>
							</div>
						</div>

						<div class="summary-card card-purple">
							<div class="card-icon">
								<i class="fa fa-cube"></i>
							</div>
							<div class="card-content">
								<h3 id="total-items">0</h3>
								<p>Unique Items</p>
							</div>
						</div>

						<div class="summary-card card-orange">
							<div class="card-icon">
								<i class="fa fa-th-large"></i>
							</div>
							<div class="card-content">
								<h3 id="total-racks">0</h3>
								<p>Racks In Use</p>
							</div>
						</div>
					</div>

					<!-- Filter Section -->
					<div class="filter-section">
						<div class="search-box">
							<i class="fa fa-search"></i>
							<input 
								type="text" 
								id="search-input" 
								placeholder="Search by Batch, Item Code, Warehouse, or Rack..."
								autocomplete="off"
							/>
						</div>
						
						<div class="view-toggle">
							<button class="view-btn active" data-view="grid" title="Bin Cards">
								<i class="fa fa-th"></i> Cards
							</button>
							<button class="view-btn" data-view="rack_map" title="Visual Rack Map">
								<i class="fa fa-th-large"></i> Rack Map
							</button>
							<button class="view-btn" data-view="table" title="Table View">
								<i class="fa fa-list"></i> Table
							</button>
						</div>
						
						<button class="refresh-btn" id="refresh-btn">
							<i class="fa fa-refresh"></i> Refresh
						</button>
						
						<button class="export-btn" id="export-btn">
							<i class="fa fa-download"></i> Export
						</button>
					</div>

					<!-- Loading Section -->
					<div class="loading-section" id="loading-section" style="display: none;">
						<i class="fa fa-spinner fa-spin fa-3x"></i>
						<p>Loading bin data...</p>
					</div>

					<!-- Grid View Section -->
					<div class="bins-grid-view" id="bins-grid-view">
						<div class="section-header">
							<h4><i class="fa fa-th"></i> Active Bins</h4>
							<div class="last-updated">
								Last updated: <span id="last-updated-time">-</span>
							</div>
						</div>
						<div class="bins-grid" id="bins-grid">
							<!-- Bin cards will be rendered here -->
						</div>
					</div>

					 <!-- Rack Map View Section (NEW) -->
					<div class="bins-rack-map-view" id="bins-rack-map-view" style="display: none;">
						<div class="section-header">
							<h4><i class="fa fa-th-large"></i> Visual Rack Map</h4>
							<div class="last-updated">
								Last updated: <span id="last-updated-time-rack">-</span>
							</div>
						</div>
						<div class="rack-map-container" id="rack-map-container">
							<!-- Rack grids will be rendered here -->
						</div>
					</div>

					<!-- Table View Section -->
					<div class="bins-table-view" id="bins-table-view" style="display: none;">
						<div class="section-header">
							<h4><i class="fa fa-list"></i> Active Bins - Table View</h4>
							<div class="last-updated">
								Last updated: <span id="last-updated-time-table">-</span>
							</div>
						</div>
						<div class="bins-table-container" id="bins-table">
							<!-- Table will be rendered here -->
						</div>
					</div>

					<!-- Empty State -->
					<div class="empty-state" id="empty-state" style="display: none;">
						<i class="fa fa-inbox"></i>
						<h3>No Active Bins</h3>
						<p>No bins are currently checked in. Use the Check-In page to add bins.</p>
					</div>
				</div>
			</div>
		`;
		
		this.page.main.html(html);
	}

	add_custom_styles() {
		// Remove any existing styles for this page
		$('#bin-status-monitor-custom-styles').remove();
		
		const style = `
			<style id="bin-status-monitor-custom-styles">
				/* Reset all Frappe containers for this page */
				body[data-route="bin_status_monitor"] .layout-main-section-wrapper {
					padding: 0 !important;
					margin: 0 !important;
				}
				
				body[data-route="bin_status_monitor"] .layout-main-section {
					padding: 0 !important;
					margin: 0 !important;
				}
				
				/* Main container - Same as Check-In */
				.monitor-container {
					width: 100%;
					min-height: calc(100vh - 50px);
					background: #2d3748; /* Dark navy background */
					display: flex;
					flex-direction: column;
				}
				
				/* Purple/Blue Gradient Header - Same as Dashboard */
				.monitor-header {
					background: #5b21b6; /* Solid dark purple - flat color */
					padding: 20px 30px;
					display: flex;
					align-items: center;
					justify-content: space-between;
					box-shadow: 0 4px 12px rgba(0,0,0,0.2);
				}
				
				.monitor-header h1 {
					color: white;
					font-size: 24px;
					font-weight: 700;
					margin: 0;
					display: flex;
					align-items: center;
					gap: 12px;
				}
				
				.back-btn {
					height: 42px;
					padding: 0 20px;
					background: #2d3748; /* Dark navy */
					border: 2px solid rgba(255,255,255,0.3);
					border-radius: 8px;
					color: white;
					font-size: 13px;
					font-weight: 700;
					cursor: pointer;
					display: flex;
					align-items: center;
					gap: 8px;
					transition: all 0.2s;
				}
				
				.back-btn:hover {
					background: #1a202c;
					border-color: rgba(255,255,255,0.5);
					transform: translateY(-2px);
					box-shadow: 0 4px 8px rgba(0,0,0,0.2);
				}
				
				/* Main Content Area */
				.monitor-content {
					flex: 1;
					padding: 30px;
					overflow-y: auto;
				}
				
				 /* Status Filter Tabs */
				.status-tabs {
					display: flex;
					gap: 10px;
					margin-bottom: 25px;
					background: rgba(255, 255, 255, 0.05);
					padding: 8px;
					border-radius: 12px;
					border: 1px solid rgba(255, 255, 255, 0.1);
				}
				
				.status-tab {
					flex: 1;
					padding: 12px 20px;
					background: transparent;
					border: 2px solid rgba(255, 255, 255, 0.1);
					border-radius: 8px;
					color: rgba(255, 255, 255, 0.6);
					font-size: 14px;
					font-weight: 600;
					cursor: pointer;
					transition: all 0.3s;
					display: flex;
					align-items: center;
					justify-content: center;
					gap: 8px;
				}
				
				.status-tab:hover:not(.active) {
					background: rgba(255, 255, 255, 0.05);
					border-color: rgba(255, 255, 255, 0.2);
					color: rgba(255, 255, 255, 0.8);
				}
				
				.status-tab.active {
					background: #10b981;
					border-color: #10b981;
					color: white;
					box-shadow: 0 4px 12px rgba(16, 185, 129, 0.4);
				}
				
				.status-tab i {
					font-size: 16px;
				}
				
				/* Summary Cards Row */
				.summary-cards-row {
					display: grid;
					grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
					gap: 20px;
					margin-bottom: 30px;
				}
				
				.summary-card {
					background: rgba(255, 255, 255, 0.08);
					backdrop-filter: blur(10px);
					padding: 20px;
					border-radius: 12px;
					color: white;
					display: flex;
					align-items: center;
					gap: 15px;
					border: 1px solid rgba(255, 255, 255, 0.1);
					transition: all 0.3s;
				}
				
				.summary-card:hover {
					transform: translateY(-5px);
					box-shadow: 0 8px 25px rgba(0,0,0,0.3);
					background: rgba(255, 255, 255, 0.12);
				}
				
				.card-icon {
					width: 50px;
					height: 50px;
					border-radius: 10px;
					display: flex;
					align-items: center;
					justify-content: center;
					font-size: 24px;
					color: white;
					flex-shrink: 0;
				}
				
				.card-green .card-icon {
					background: #10b981; /* Flat emerald green */
				}
				
				.card-blue .card-icon {
					background: #3b82f6; /* Flat blue */
				}
				
				.card-purple .card-icon {
					background: #8b5cf6; /* Flat purple */
				}
				
				.card-orange .card-icon {
					background: #f59e0b; /* Flat amber */
				}
				
				.card-content h3 {
					margin: 0 0 5px 0;
					font-size: 28px;
					font-weight: 800;
				}
				
				.card-content p {
					margin: 0;
					font-size: 12px;
					opacity: 0.8;
					text-transform: uppercase;
					letter-spacing: 0.5px;
				}
				
				/* Filter Section */
				.filter-section {
					display: flex;
					gap: 12px;
					align-items: center;
					margin-bottom: 25px;
					flex-wrap: wrap;
					background: rgba(255, 255, 255, 0.05);
					padding: 15px;
					border-radius: 12px;
					border: 1px solid rgba(255, 255, 255, 0.1);
				}
				
				.search-box {
					flex: 1;
					min-width: 300px;
					position: relative;
				}
				
				.search-box i {
					position: absolute;
					left: 15px;
					top: 50%;
					transform: translateY(-50%);
					color: rgba(255, 255, 255, 0.5);
					font-size: 16px;
				}
				
				.search-box input {
					width: 100%;
					height: 42px;
					padding: 0 15px 0 45px;
					background: rgba(255, 255, 255, 0.1);
					border: 2px solid rgba(255, 255, 255, 0.2);
					border-radius: 8px;
					color: white;
					font-size: 14px;
					transition: all 0.2s;
				}
				
				.search-box input::placeholder {
					color: rgba(255, 255, 255, 0.5);
				}
				
				.search-box input:focus {
					outline: none;
					background: rgba(255, 255, 255, 0.15);
					border-color: #43e97b;
					box-shadow: 0 0 0 3px rgba(67, 233, 123, 0.2);
				}
				
				.view-toggle {
					display: flex;
					gap: 5px;
					background: rgba(255, 255, 255, 0.08);
					padding: 4px;
					border-radius: 8px;
				}
				
				.view-btn {
					padding: 8px 16px;
					background: transparent;
					border: none;
					color: rgba(255, 255, 255, 0.6);
					font-size: 13px;
					font-weight: 600;
					border-radius: 6px;
					cursor: pointer;
					transition: all 0.2s;
				}
				
				.view-btn.active {
					background: #10b981; /* Flat green instead of gradient */
					color: white;
					box-shadow: 0 2px 8px rgba(16, 185, 129, 0.3);
				}
				
				.view-btn:hover:not(.active) {
					color: white;
					background: rgba(255, 255, 255, 0.1);
				}
				
				.refresh-btn, .export-btn {
					height: 42px;
					padding: 0 18px;
					background: rgba(255, 255, 255, 0.1);
					border: 2px solid rgba(255, 255, 255, 0.2);
					border-radius: 8px;
					color: white;
					font-size: 13px;
					font-weight: 600;
					cursor: pointer;
					transition: all 0.2s;
					display: flex;
					align-items: center;
					gap: 8px;
				}
				
				.refresh-btn:hover, .export-btn:hover {
					background: rgba(255, 255, 255, 0.2);
					border-color: rgba(255, 255, 255, 0.3);
					transform: translateY(-2px);
				}
				
				.export-btn {
					background: #8b5cf6; /* Flat purple instead of gradient */
					border: none;
				}
				
				.export-btn:hover {
					background: #7c3aed; /* Darker purple on hover */
				}
				
				/* Grid and Table Views */
				.bins-grid-view, .bins-table-view, .bins-rack-map-view {
					background: rgba(255, 255, 255, 0.05);
					border-radius: 12px;
					padding: 20px;
				}
				
				.last-updated {
					font-size: 12px;
					color: rgba(255, 255, 255, 0.6);
				}
				
				.bins-grid {
					display: grid;
					grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
					gap: 20px;
				}
				
				/* Bin Card Styles */
				.bin-card {
					background: rgba(67, 233, 123, 0.1);
					border: 2px solid rgba(67, 233, 123, 0.3);
					border-radius: 12px;
					padding: 20px;
					cursor: pointer;
					transition: all 0.3s;
					position: relative;
					overflow: hidden;
				}
				
				.bin-card:hover {
					transform: translateY(-5px);
					box-shadow: 0 10px 30px rgba(67, 233, 123, 0.3);
					border-color: #10b981; /* Flat green */
					background: rgba(16, 185, 129, 0.15);
				}
				
				.bin-card.fifo-warning {
					background: rgba(239, 68, 68, 0.1);
					border-color: rgba(239, 68, 68, 0.5);
				}
				
				.bin-card.fifo-warning:hover {
					border-color: #ef4444; /* Flat red */
					box-shadow: 0 10px 30px rgba(239, 68, 68, 0.3);
					background: rgba(239, 68, 68, 0.15);
				}
				
				/* Checked-out bin styling */
				.bin-card.checked-out {
					background: rgba(107, 114, 128, 0.1);
					border-color: rgba(107, 114, 128, 0.4);
				}
				
				.bin-card.checked-out:hover {
					border-color: #6b7280;
					box-shadow: 0 10px 30px rgba(107, 114, 128, 0.3);
					background: rgba(107, 114, 128, 0.15);
				}
				
				.bin-card.checked-out .bin-icon {
					background: #6b7280; /* Gray for checked out */
				}
				
				.status-badge.badge-out {
					background: #6b7280; /* Gray for checked out */
				}
				
				.bins-table-container tbody tr.checkout-row {
					background: rgba(107, 114, 128, 0.1);
					border-left: 3px solid #6b7280;
				}
				
				.bin-header {
					display: flex;
					justify-content: space-between;
					align-items: center;
					margin-bottom: 15px;
				}
				
				.bin-icon {
					width: 45px;
					height: 45px;
					border-radius: 10px;
					background: #10b981; /* Flat green instead of gradient */
					display: flex;
					align-items: center;
					justify-content: center;
					font-size: 20px;
					color: white;
				}
				
				.bin-card.fifo-warning .bin-icon {
					background: #ef4444; /* Flat red instead of gradient */
				}
				
				.status-badge {
					padding: 5px 12px;
					border-radius: 20px;
					font-size: 10px;
					font-weight: 700;
					text-transform: uppercase;
					letter-spacing: 0.5px;
					background: #10b981; /* Flat green instead of gradient */
					color: white;
				}
				
				.bin-body {
					margin-bottom: 15px;
				}
				
				.bin-detail {
					margin-bottom: 10px;
				}
				
				.bin-detail label {
					display: block;
					font-size: 10px;
					color: rgba(255, 255, 255, 0.6);
					text-transform: uppercase;
					letter-spacing: 0.8px;
					margin-bottom: 3px;
					font-weight: 600;
				}
				
				.bin-detail .value {
					display: block;
					font-size: 14px;
					color: white;
					font-weight: 600;
				}
				
				.bin-detail .batch-value {
					color: #10b981; /* Flat green */
					font-size: 16px;
					font-weight: 700;
				}
				
				.bin-detail .rack-value {
					color: #3b82f6; /* Flat blue */
				}
				
				.bin-detail .time-value {
					color: #06b6d4; /* Flat cyan */
				}
				
				.fifo-badge {
					background: #ef4444; /* Flat red instead of gradient */
					color: white;
					padding: 6px 10px;
					border-radius: 6px;
					font-size: 11px;
					font-weight: 700;
					text-align: center;
					margin-top: 8px;
				}
				
				.bin-footer {
					padding-top: 12px;
					border-top: 1px solid rgba(255, 255, 255, 0.1);
				}
				
				.bin-footer small {
					font-size: 11px;
					color: rgba(255, 255, 255, 0.5);
				}
				
				/* Table View */
				.bins-table-container table {
					width: 100%;
					border-collapse: separate;
					border-spacing: 0 8px;
				}
				
				.bins-table-container th {
					background: #5b21b6; /* Flat dark purple instead of gradient */
					color: white;
					padding: 12px 15px;
					text-align: left;
					font-weight: 700;
					font-size: 12px;
					text-transform: uppercase;
					letter-spacing: 0.8px;
				}
				
				.bins-table-container th:first-child {
					border-radius: 8px 0 0 8px;
				}
				
				.bins-table-container th:last-child {
					border-radius: 0 8px 8px 0;
				}
				
				.bins-table-container tbody tr {
					background: rgba(255, 255, 255, 0.05);
					transition: all 0.2s;
				}
				
				.bins-table-container tbody tr:hover {
					background: rgba(16, 185, 129, 0.1);
					transform: scale(1.01);
				}
				
				.bins-table-container tbody tr.fifo-row {
					background: rgba(239, 68, 68, 0.1);
					border-left: 3px solid #ef4444; /* Flat red */
				}
				
				.bins-table-container tbody td {
					padding: 12px 15px;
					color: white;
					font-size: 13px;
				}
				
				.bins-table-container tbody td:first-child {
					border-radius: 8px 0 0 8px;
				}
				
				.bins-table-container tbody td:last-child {
					border-radius: 0 8px 8px 0;
				}
				
				.fifo-tag {
					background: #ef4444; /* Flat red */
					color: white;
					padding: 3px 8px;
					border-radius: 10px;
					font-size: 9px;
					font-weight: 700;
					margin-left: 6px;
				}
				
				/* Loading State */
				.loading-section {
					text-align: center;
					padding: 60px 20px;
					color: rgba(255, 255, 255, 0.7);
				}
				
				.loading-section i {
					color: #10b981; /* Flat green */
					margin-bottom: 15px;
				}
				
				/* Empty State */
				.empty-state {
					text-align: center;
					padding: 80px 20px;
					color: rgba(255, 255, 255, 0.6);
				}
				
				.empty-state i {
					font-size: 64px;
					margin-bottom: 20px;
					color: rgba(255, 255, 255, 0.3);
				}
				
				.empty-state h3 {
					margin: 0 0 10px 0;
					color: white;
					font-size: 24px;
				}
				
				.empty-state p {
					margin: 0;
					font-size: 15px;
				}
				
				.no-results {
					text-align: center;
					padding: 40px;
					color: rgba(255, 255, 255, 0.6);
					font-size: 14px;
					}
				
				/* ==================== RACK MAP VIEW STYLES ==================== */
				.rack-map-container {
					display: flex;
					flex-direction: column;
					gap: 30px;
				}
				
				.warehouse-section {
					background: rgba(255, 255, 255, 0.03);
					border-radius: 12px;
					padding: 20px;
					border: 1px solid rgba(255, 255, 255, 0.1);
				}
				
				.warehouse-header {
					display: flex;
					justify-content: space-between;
					align-items: center;
					margin-bottom: 20px;
					padding-bottom: 15px;
					border-bottom: 2px solid rgba(255, 255, 255, 0.1);
				}
				
				.warehouse-header h5 {
					margin: 0;
					color: white;
					font-size: 18px;
					font-weight: 700;
					display: flex;
					align-items: center;
					gap: 10px;
				}
				
				.warehouse-header h5 i {
					color: #3b82f6;
					font-size: 20px;
				}
				
				.warehouse-stats {
					color: rgba(255, 255, 255, 0.6);
					font-size: 13px;
					font-weight: 600;
				}
				
				.racks-grid {
					display: grid;
					grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
					gap: 20px;
				}
				
				.rack-card {
					background: rgba(255, 255, 255, 0.08);
					border: 2px solid rgba(255, 255, 255, 0.15);
					border-radius: 12px;
					padding: 15px;
					transition: all 0.3s;
					cursor: pointer;
				}
				
				.rack-card:hover {
					transform: translateY(-5px);
					box-shadow: 0 10px 30px rgba(16, 185, 129, 0.3);
					border-color: #10b981;
					background: rgba(16, 185, 129, 0.1);
				}
				
				.rack-card.has-fifo {
					border-color: rgba(239, 68, 68, 0.5);
					background: rgba(239, 68, 68, 0.08);
				}
				
				.rack-card.has-fifo:hover {
					border-color: #ef4444;
					box-shadow: 0 10px 30px rgba(239, 68, 68, 0.3);
				}
				
				.rack-card-header {
					display: flex;
					justify-content: space-between;
					align-items: center;
					margin-bottom: 15px;
				}
				
				.rack-info h6 {
					margin: 0 0 5px 0;
					color: white;
					font-size: 15px;
					font-weight: 700;
					display: flex;
					align-items: center;
					gap: 8px;
				}
				
				.rack-info h6 i {
					color: #3b82f6;
					font-size: 14px;
				}
				
				.rack-bin-count {
					color: rgba(255, 255, 255, 0.6);
					font-size: 12px;
					font-weight: 600;
				}
				
				.rack-fifo-badge {
					background: #ef4444;
					color: white;
					padding: 4px 10px;
					border-radius: 12px;
					font-size: 10px;
					font-weight: 700;
					display: flex;
					align-items: center;
					gap: 5px;
				}
				
				.rack-bins-grid {
					display: grid;
					grid-template-columns: repeat(auto-fill, minmax(80px, 1fr));
					gap: 8px;
					margin-bottom: 15px;
					min-height: 90px;
				}
				
				.rack-bin-slot {
					background: rgba(16, 185, 129, 0.2);
					border: 2px solid rgba(16, 185, 129, 0.5);
					border-radius: 8px;
					padding: 8px;
					display: flex;
					flex-direction: column;
					align-items: center;
					justify-content: center;
					gap: 4px;
					position: relative;
					transition: all 0.2s;
					min-height: 70px;
				}
				
				.rack-bin-slot:hover {
					transform: scale(1.05);
					box-shadow: 0 4px 12px rgba(16, 185, 129, 0.4);
					z-index: 10;
				}
				
				.rack-bin-slot.fifo-bin {
					background: rgba(239, 68, 68, 0.2);
					border-color: rgba(239, 68, 68, 0.6);
					animation: fifo-pulse 2s infinite;
				}
				
				.rack-bin-slot.fifo-bin:hover {
					box-shadow: 0 4px 12px rgba(239, 68, 68, 0.5);
				}
				
				.rack-bin-slot.checked-out-bin {
					background: rgba(107, 114, 128, 0.2);
					border-color: rgba(107, 114, 128, 0.5);
					opacity: 0.7;
				}
				
				.rack-bin-slot.checked-out-bin:hover {
					box-shadow: 0 4px 12px rgba(107, 114, 128, 0.4);
				}
				
				@keyframes fifo-pulse {
					0%, 100% { 
						border-color: rgba(239, 68, 68, 0.6);
						box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.4);
					}
					50% { 
						border-color: #ef4444;
						box-shadow: 0 0 0 4px rgba(239, 68, 68, 0.2);
					}
				}
				
				/* Color variations for different items */
				.bin-color-1 {
					background: rgba(16, 185, 129, 0.2);
					border-color: rgba(16, 185, 129, 0.5);
				}
				
				.bin-color-2 {
					background: rgba(59, 130, 246, 0.2);
					border-color: rgba(59, 130, 246, 0.5);
				}
				
				.bin-color-3 {
					background: rgba(139, 92, 246, 0.2);
					border-color: rgba(139, 92, 246, 0.5);
				}
				
				.bin-color-4 {
					background: rgba(245, 158, 11, 0.2);
					border-color: rgba(245, 158, 11, 0.5);
				}
				
				.bin-color-5 {
					background: rgba(6, 182, 212, 0.2);
					border-color: rgba(6, 182, 212, 0.5);
				}
				
				.bin-color-6 {
					background: rgba(236, 72, 153, 0.2);
					border-color: rgba(236, 72, 153, 0.5);
				}
				
				.bin-batch {
					color: white;
					font-size: 11px;
					font-weight: 700;
					text-align: center;
					word-break: break-word;
					max-width: 100%;
				}
				
				.bin-item {
					color: rgba(255, 255, 255, 0.75);
					font-size: 9px;
					font-weight: 600;
					text-align: center;
					word-break: break-word;
					max-width: 100%;
					margin-top: 2px;
					display: block;
				}
				
				.fifo-icon {
					color: #ef4444;
					font-size: 12px;
					position: absolute;
					top: 4px;
					right: 4px;
					animation: fifo-icon-pulse 1.5s infinite;
				}
				
				.checkout-icon {
					color: #6b7280;
					font-size: 10px;
					position: absolute;
					top: 4px;
					left: 4px;
				}
				
				@keyframes fifo-icon-pulse {
					0%, 100% { opacity: 1; }
					50% { opacity: 0.4; }
				}
				
				.rack-card-footer {
					display: flex;
					justify-content: flex-end;
					padding-top: 10px;
					border-top: 1px solid rgba(255, 255, 255, 0.1);
				}
				
				.rack-details-btn {
					background: rgba(59, 130, 246, 0.2);
					border: 2px solid rgba(59, 130, 246, 0.4);
					color: white;
					padding: 6px 14px;
					border-radius: 6px;
					font-size: 12px;
					font-weight: 600;
					cursor: pointer;
					transition: all 0.2s;
					display: flex;
					align-items: center;
					gap: 6px;
				}
				
				.rack-details-btn:hover {
					background: rgba(59, 130, 246, 0.3);
					border-color: #3b82f6;
					transform: translateY(-2px);
				}
				
				.loading-rack-map {
					text-align: center;
					padding: 60px 20px;
					color: rgba(255, 255, 255, 0.7);
					font-size: 16px;
				}
				
				.loading-rack-map i {
					color: #10b981;
					margin-right: 10px;
					font-size: 24px;
				}
			</style>
		`;
		$('head').append(style);
	}
	
	bind_events() {
		const self = this;
		
		// Back to dashboard button
		$('#back-to-dashboard').on('click', () => {
			window.location.href = '/app/bin_tracker_dashboard';
		});
		
		 // Status tab buttons
		$('.status-tab').on('click', function() {
			const status = $(this).data('status');
			$('.status-tab').removeClass('active');
			$(this).addClass('active');
			self.status_filter = status;
			self.load_bin_data();
		});
		
		// Search input
		$('#search-input').on('input', function() {
			const query = $(this).val().toLowerCase().trim();
			self.filter_bins(query);
		});
		
		// View toggle buttons
		$('.view-btn').on('click', function() {
			const view = $(this).data('view');
			$('.view-btn').removeClass('active');
			$(this).addClass('active');
			self.switch_view(view);
		});
		
		// Refresh button
		$('#refresh-btn').on('click', function() {
			const $icon = $(this).find('i');
			$icon.addClass('fa-spin');
			self.load_bin_data();
			setTimeout(() => {
				$icon.removeClass('fa-spin');
			}, 1000);
		});
		
		// Export button
		$('#export-btn').on('click', function() {
			self.export_data();
		});
		
		// Click on bin card to see details
		$(document).on('click', '.bin-card', function() {
			const bin_name = $(this).data('bin-name');
			self.show_bin_details(bin_name);
		});
	}

	start_auto_refresh() {
		// Refresh data every 30 seconds
		this.auto_refresh_interval = setInterval(() => {
			this.load_bin_data(true); // Silent refresh
		}, 30000);
	}

	cleanup() {
		// Clear auto-refresh interval
		if (this.auto_refresh_interval) {
			clearInterval(this.auto_refresh_interval);
			this.auto_refresh_interval = null;
		}

		// Unbind all events
		$('#back-to-dashboard').off('click');
		$('.status-tab').off('click');
		$('#search-input').off('input');
		$('.view-btn').off('click');
		$('#refresh-btn').off('click');
		$('#export-btn').off('click');
		$(document).off('click', '.bin-card');
	}

	load_bin_data(silent = false) {
		const self = this;
		
		if (!silent) {
			$('#loading-section').show();
			$('#bins-grid-view, #bins-table-view, #empty-state').hide();
		}
		
		// Determine filter based on status_filter
		let status_filters = {};
		if (self.status_filter === 'active') {
			status_filters = { status: 1 };  // Only checked-in bins
		} else if (self.status_filter === 'checkout') {
			status_filters = { status: 0 };  // Only checked-out bins
		}
		// If 'all', no status filter - show everything
		
		frappe.call({
			method: 'frappe.client.get_list',
			args: {
				doctype: 'Bin Storage Status',
				filters: status_filters,
				fields: ['name', 'warehouse', 'batch', 'item_code', 'rack_id', 'check_in_time', 'check_out_time', 'status', 'remarks'],
				order_by: 'check_in_time desc',
				limit_page_length: 0
			},
			callback: function(r) {
				if (r.message) {
					self.all_bins = r.message;
					self.filtered_bins = self.all_bins;
					
					self.update_summary_cards();
					self.render_bins();
					self.update_last_updated();
					
					$('#loading-section').hide();
					
					if (self.all_bins.length === 0) {
						$('#empty-state').show();
					} else {
						if (self.view_mode === 'grid') {
							$('#bins-grid-view').show();
						} else {
							$('#bins-table-view').show();
						}
					}
				}
			}
		});
	}

	update_summary_cards() {
		const unique_batches = new Set(this.all_bins.map(b => b.batch)).size;
		const unique_items = new Set(this.all_bins.map(b => b.item_code)).size;
		const unique_racks = new Set(this.all_bins.map(b => b.rack_id)).size;
		
		$('#total-bins').text(this.all_bins.length);
		$('#total-batches').text(unique_batches);
		$('#total-items').text(unique_items);
		$('#total-racks').text(unique_racks);
	}

	render_bins() {
		if (this.view_mode === 'grid') {
			this.render_grid_view();
		} else if (this.view_mode === 'rack_map') {
			this.render_rack_map_view();
		} else {
			this.render_table_view();
		}
	}

	render_grid_view() {
		const grid = $('#bins-grid');
		grid.empty();
		
		if (this.filtered_bins.length === 0) {
			grid.html('<p class="no-results">No bins match your search</p>');
			return;
		}
		
		this.filtered_bins.forEach(bin => {
			const is_checked_out = bin.status === 0;
			const duration = is_checked_out && bin.check_out_time 
				? this.get_checkout_duration(bin.check_in_time, bin.check_out_time)
				: this.get_duration(bin.check_in_time);
			const has_fifo_warning = bin.remarks && bin.remarks.includes('FIFO');
			
			const card = `
				<div class="bin-card ${has_fifo_warning ? 'fifo-warning' : ''} ${is_checked_out ? 'checked-out' : ''}" data-bin-name="${bin.name}">
					<div class="bin-header">
						<div class="bin-icon">
							<i class="fa ${is_checked_out ? 'fa-sign-out' : 'fa-inbox'}"></i>
						</div>
						<div class="bin-status">
							<span class="status-badge ${is_checked_out ? 'badge-out' : ''}">${is_checked_out ? 'CHECKED OUT' : 'CHECKED IN'}</span>
						</div>
					</div>
					
					<div class="bin-body">
						<div class="bin-detail">
							<label>Batch</label>
							<span class="value batch-value">${bin.batch}</span>
						</div>
						
						<div class="bin-detail">
							<label>Item Code</label>
							<span class="value">${bin.item_code}</span>
						</div>
						
						<div class="bin-detail">
							<label>Rack Location</label>
							<span class="value rack-value">
								<i class="fa fa-map-marker"></i> ${bin.rack_id}
							</span>
						</div>
						
						<div class="bin-detail">
							<label>Warehouse</label>
							<span class="value">${bin.warehouse}</span>
						</div>
						
						${is_checked_out ? `
							<div class="bin-detail">
								<label>Check-Out Time</label>
								<span class="value time-value">
									<i class="fa fa-sign-out"></i> ${frappe.datetime.str_to_user(bin.check_out_time)}
								</span>
							</div>
							<div class="bin-detail">
								<label>Storage Duration</label>
								<span class="value time-value">
									<i class="fa fa-clock-o"></i> ${duration}
								</span>
							</div>
						` : `
							<div class="bin-detail">
								<label>Stored Since</label>
								<span class="value time-value">
									<i class="fa fa-clock-o"></i> ${duration}
								</span>
							</div>
						`}
						
						${has_fifo_warning ? `
							<div class="fifo-badge">
								<i class="fa fa-exclamation-triangle"></i> FIFO Alert
							</div>
						` : ''}
					</div>
					
					<div class="bin-footer">
						<small>Check-in: ${frappe.datetime.str_to_user(bin.check_in_time)}</small>
					</div>
				</div>
			`;
			
			grid.append(card);
		});
	}

	render_table_view() {
		const table = $('#bins-table');
		
		if (this.filtered_bins.length === 0) {
			table.html('<p class="no-results">No bins match your search</p>');
			return;
		}
		
		let html = `
			<table>
				<thead>
					<tr>
						<th>#</th>
						<th>Batch</th>
						<th>Item Code</th>
						<th>Rack Location</th>
						<th>Warehouse</th>
						<th>Check-In Time</th>
						<th>Check-Out Time</th>
						<th>Duration</th>
						<th>Status</th>
					</tr>
				</thead>
				<tbody>
		`;
		
		this.filtered_bins.forEach((bin, index) => {
			const is_checked_out = bin.status === 0;
			const duration = is_checked_out && bin.check_out_time 
				? this.get_checkout_duration(bin.check_in_time, bin.check_out_time)
				: this.get_duration(bin.check_in_time);
			const has_fifo_warning = bin.remarks && bin.remarks.includes('FIFO');
			const row_class = has_fifo_warning ? 'fifo-row' : (is_checked_out ? 'checkout-row' : '');
			
			html += `
				<tr class="${row_class}">
					<td>${index + 1}</td>
					<td><strong>${bin.batch}</strong></td>
					<td>${bin.item_code}</td>
					<td><i class="fa fa-map-marker"></i> ${bin.rack_id}</td>
					<td>${bin.warehouse}</td>
					<td>${frappe.datetime.str_to_user(bin.check_in_time)}</td>
					<td>${is_checked_out ? frappe.datetime.str_to_user(bin.check_out_time) : '-'}</td>
					<td>${duration}</td>
					<td>
						<span class="status-badge ${is_checked_out ? 'badge-out' : ''}">${is_checked_out ? 'CHECKED OUT' : 'CHECKED IN'}</span>
						${has_fifo_warning ? '<span class="fifo-tag">FIFO Alert</span>' : ''}
					</td>
				</tr>
			`;
		});
		
		html += `
				</tbody>
			</table>
		`;
		
		table.html(html);
	}

	switch_view(view) {
		this.view_mode = view;
		
		if (view === 'grid') {
			$('#bins-table-view, #bins-rack-map-view').hide();
			$('#bins-grid-view').show();
			this.render_grid_view();
		} else if (view === 'rack_map') {
			$('#bins-grid-view, #bins-table-view').hide();
			$('#bins-rack-map-view').show();
			this.render_rack_map_view();
		} else {
			$('#bins-grid-view, #bins-rack-map-view').hide();
			$('#bins-table-view').show();
			this.render_table_view();
		}
	}

	render_rack_map_view() {
		const self = this;
		const container = $('#rack-map-container');
		container.html('<div class="loading-rack-map"><i class="fa fa-spinner fa-spin"></i> Loading rack map...</div>');
		
		// Call the new API to get bins grouped by rack
		frappe.call({
			method: 'smart_screens.smart_screens.api.bin_tracker.get_bins_grouped_by_rack',
			args: {
				warehouse: null, // Show all warehouses
				status_filter: self.status_filter
			},
			callback: function(r) {
				if (r.message && r.message.success) {
					self.rack_data = r.message.data;
					self.render_rack_grid(r.message.data);
					$('#last-updated-time-rack').text(frappe.datetime.str_to_user(frappe.datetime.now_datetime()));
				} else {
					container.html('<p class="no-results">Failed to load rack map</p>');
				}
			}
		});
	}

	render_rack_grid(warehouse_data) {
		const container = $('#rack-map-container');
		container.empty();
		
		if (!warehouse_data || warehouse_data.length === 0) {
			container.html('<p class="no-results">No racks with bins found</p>');
			return;
		}
		
		// Render each warehouse section
		warehouse_data.forEach(wh => {
			const warehouse_section = `
				<div class="warehouse-section">
					<div class="warehouse-header">
						<h5><i class="fa fa-warehouse"></i> ${wh.warehouse}</h5>
						<span class="warehouse-stats">${wh.rack_count} Racks • ${wh.total_bins} Bins</span>
					</div>
					<div class="racks-grid" id="racks-${wh.warehouse.replace(/\s+/g, '-')}">
						<!-- Rack cards will be added here -->
					</div>
				</div>
			`;
			container.append(warehouse_section);
			
			const racks_container = $(`#racks-${wh.warehouse.replace(/\s+/g, '-')}`);
			
			// Render each rack
			wh.racks.forEach(rack => {
				const rack_card = this.create_rack_card(rack, wh.warehouse);
				racks_container.append(rack_card);
			});
		});
	}

	create_rack_card(rack, warehouse) {
		const bin_count = rack.bin_count;
		const has_fifo = rack.bins.some(b => b.remarks && b.remarks.includes('FIFO'));
		const oldest_bin = rack.bins[0]; // First bin is oldest
		
		// Group bins by item for better visualization
		const item_groups = {};
		rack.bins.forEach(bin => {
			if (!item_groups[bin.item_code]) {
				item_groups[bin.item_code] = [];
			}
			item_groups[bin.item_code].push(bin);
		});
		
		let bins_html = '';
		Object.keys(item_groups).forEach((item_code, index) => {
			const bins = item_groups[item_code];
			const color_class = `bin-color-${(index % 6) + 1}`;
			
			bins.forEach(bin => {
				const is_checked_out = bin.status === 0;
				const has_bin_fifo = bin.remarks && bin.remarks.includes('FIFO');
				bins_html += `
					<div class="rack-bin-slot ${color_class} ${has_bin_fifo ? 'fifo-bin' : ''} ${is_checked_out ? 'checked-out-bin' : ''}" 
						 data-bin-id="${bin.bin_id}"
						 title="Batch: ${bin.batch}&#10;Item: ${bin.item_name || bin.item_code}&#10;Status: ${is_checked_out ? 'Checked Out' : 'Checked In'}&#10;${has_bin_fifo ? 'FIFO Alert!' : ''}">
						<span class="bin-batch">${bin.batch}</span>
						<span class="bin-item">${bin.item_code}</span>
						${has_bin_fifo ? '<i class="fa fa-exclamation-triangle fifo-icon"></i>' : ''}
						${is_checked_out ? '<i class="fa fa-sign-out checkout-icon"></i>' : ''}
					</div>
				`;
			});
		});
		
		const card = `
			<div class="rack-card ${has_fifo ? 'has-fifo' : ''}" data-rack-id="${rack.rack_id}">
				<div class="rack-card-header">
					<div class="rack-info">
						<h6><i class="fa fa-map-marker"></i> ${rack.rack_location || rack.rack_id}</h6>
						<span class="rack-bin-count">${bin_count} bin${bin_count > 1 ? 's' : ''}</span>
					</div>
					${has_fifo ? '<span class="rack-fifo-badge"><i class="fa fa-exclamation-triangle"></i> FIFO</span>' : ''}
				</div>
				<div class="rack-bins-grid">
					${bins_html}
				</div>
				<div class="rack-card-footer">
					<button class="rack-details-btn" data-rack-id="${rack.rack_id}">
						<i class="fa fa-info-circle"></i> Details
					</button>
				</div>
			</div>
		`;
		
		return card;
	}

	filter_bins(query) {
		if (!query) {
			this.filtered_bins = this.all_bins;
		} else {
			this.filtered_bins = this.all_bins.filter(bin => {
				return (bin.batch && bin.batch.toLowerCase().includes(query)) ||
				       (bin.item_code && bin.item_code.toLowerCase().includes(query)) ||
				       (bin.warehouse && bin.warehouse.toLowerCase().includes(query)) ||
				       (bin.rack_id && bin.rack_id.toLowerCase().includes(query));
			});
		}
		
		this.render_bins();
	}

	get_duration(check_in_time) {
		const now = new Date();
		const check_in = new Date(check_in_time);
		const diff = now - check_in;
		
		const hours = Math.floor(diff / (1000 * 60 * 60));
		const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
		
		if (hours > 24) {
			const days = Math.floor(hours / 24);
			return `${days}d ${hours % 24}h`;
		} else if (hours > 0) {
			return `${hours}h ${minutes}m`;
		} else {
			return `${minutes}m`;
		}
	}

	get_checkout_duration(check_in_time, check_out_time) {
		const check_in = new Date(check_in_time);
		const check_out = new Date(check_out_time);
		const diff = check_out - check_in;
		
		const hours = Math.floor(diff / (1000 * 60 * 60));
		const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
		
		if (hours > 24) {
			const days = Math.floor(hours / 24);
			return `${days}d ${hours % 24}h`;
		} else if (hours > 0) {
			return `${hours}h ${minutes}m`;
		} else {
			return `${minutes}m`;
		}
	}

	update_last_updated() {
		const now = frappe.datetime.now_datetime();
		$('#last-updated-time, #last-updated-time-table').text(frappe.datetime.str_to_user(now));
	}

	show_bin_details(bin_name) {
		// Navigate to the Bin Storage Status document
		frappe.set_route('Form', 'Bin Storage Status', bin_name);
	}

	export_data() {
		if (!this.filtered_bins || this.filtered_bins.length === 0) {
			frappe.msgprint('No data to export');
			return;
		}
		
		// Prepare CSV data
		let csv = 'Batch,Item Code,Rack Location,Warehouse,Check-In Time,Duration\n';
		
		this.filtered_bins.forEach(bin => {
			const duration = this.get_duration(bin.check_in_time);
			csv += `"${bin.batch}","${bin.item_code}","${bin.rack_id}","${bin.warehouse}","${bin.check_in_time}","${duration}"\n`;
		});
		
		// Download CSV
		const blob = new Blob([csv], { type: 'text/csv' });
		const url = window.URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = `active_bins_${frappe.datetime.get_today()}.csv`;
		a.click();
		window.URL.revokeObjectURL(url);
		
		frappe.show_alert({
			message: 'Data exported successfully',
			indicator: 'green'
		}, 2);
	}
}
