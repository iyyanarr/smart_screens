// Copyright (c) 2025, Alphaworkz and contributors
// For license information, please see license.txt

frappe.pages['bin_tracker_dashboard'].on_page_load = function(wrapper) {
	var page = frappe.ui.make_app_page({
		parent: wrapper,
		title: 'Bin Tracker Dashboard',
		single_column: true
	});

	page.dashboard_instance = new BinTrackerDashboard(page);
};

// Add on_page_show to handle navigation back to this page
frappe.pages['bin_tracker_dashboard'].on_page_show = function(wrapper) {
	// Refresh the page content when navigating back
	if (wrapper.page && wrapper.page.dashboard_instance) {
		wrapper.page.dashboard_instance.refresh();
	}
};

class BinTrackerDashboard {
	constructor(page) {
		this.page = page;
		this.init();
	}

	init() {
		this.setup_page();
		this.add_styles();
		this.load_html();
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

	add_styles() {
		// Remove any existing styles
		$('#bin-dashboard-styles').remove();
		
		const styles = `
			<style id="bin-dashboard-styles">
				/* Reset all Frappe containers for this page */
				body[data-route="bin_tracker_dashboard"] .layout-main-section-wrapper {
					padding: 0 !important;
					margin: 0 !important;
				}
				
				body[data-route="bin_tracker_dashboard"] .layout-main-section {
					padding: 0 !important;
					margin: 0 !important;
				}
				
				/* Main dashboard container */
				.dashboard-container {
					width: 100%;
					min-height: calc(100vh - 50px);
					background: linear-gradient(180deg, #667eea 0%, #764ba2 100%);
					display: flex;
					flex-direction: column;
				}
				
				/* Purple/Blue Gradient Header Bar */
				.dashboard-header {
					background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
					padding: 20px 30px;
					display: grid;
					grid-template-columns: auto 1fr;
					gap: 30px;
					align-items: center;
					box-shadow: 0 4px 12px rgba(0,0,0,0.2);
				}
				
				.dashboard-header h1 {
					color: white;
					font-size: 20px;
					font-weight: 700;
					margin: 0;
					display: flex;
					align-items: center;
					gap: 12px;
				}
				
				 /* Header Right Side: Search + Refresh */
				.header-right {
					display: flex;
					gap: 12px;
					align-items: center;
					justify-content: flex-end;
				}
				
				/* Search Bar - Wider */
				.header-search {
					display: flex;
					gap: 8px;
					flex: 1;
					max-width: 600px;
				}
				
				.header-search input {
					flex: 1;
					height: 42px;
					padding: 0 16px;
					border: 2px solid rgba(255,255,255,0.2);
					border-radius: 8px;
					background: rgba(255,255,255,0.15);
					color: white;
					font-size: 14px;
				}
				
				.header-search input::placeholder {
					color: rgba(255,255,255,0.7);
				}
				
				.header-search input:focus {
					outline: none;
					border-color: rgba(255,255,255,0.4);
					background: rgba(255,255,255,0.2);
					box-shadow: 0 0 0 3px rgba(255,255,255,0.1);
				}
				
				.header-search button {
					width: 42px;
					height: 42px;
					background: rgba(255,255,255,0.2);
					border: none;
					border-radius: 8px;
					color: white;
					cursor: pointer;
					transition: all 0.2s;
				}
				
				.header-search button:hover {
					background: rgba(255,255,255,0.3);
					transform: scale(1.05);
				}
				
				/* Refresh Button */
				.refresh-btn {
					height: 42px;
					padding: 0 20px;
					background: rgba(255,255,255,0.2);
					border: none;
					border-radius: 8px;
					color: white;
					font-size: 13px;
					font-weight: 700;
					cursor: pointer;
					display: flex;
					align-items: center;
					gap: 8px;
					transition: all 0.2s;
					white-space: nowrap;
				}
				
				.refresh-btn:hover {
					background: rgba(255,255,255,0.3);
					transform: translateY(-2px);
				}
				
				/* Main Content Area - Four Navigation Cards */
				.main-content {
					flex: 1;
					display: grid;
					grid-template-columns: 1fr 1fr;
					grid-template-rows: 1fr 1fr;
					gap: 0;
					background: #2d3748;
				}
				
				.main-card {
					display: flex;
					flex-direction: column;
					align-items: center;
					justify-content: center;
					cursor: pointer;
					transition: all 0.3s ease;
					padding: 40px 20px;
					background: rgba(45, 55, 72, 0.8);
					border: 1px solid rgba(255,255,255,0.1);
				}
				
				.main-card h2 {
					font-size: 36px;
					font-weight: 900;
					margin: 0;
					letter-spacing: 1px;
					color: white;
					text-align: center;
				}
				
				/* Color differentiation for each card */
				.check-in-card h2 {
					color: #43e97b; /* Bright green */
					text-shadow: 0 2px 10px rgba(67, 233, 123, 0.5);
				}
				
				.check-out-card h2 {
					color: #4facfe; /* Bright cyan/blue */
					text-shadow: 0 2px 10px rgba(79, 172, 254, 0.5);
				}
				
				.product-finder-card h2 {
					color: #f093fb; /* Bright pink */
					text-shadow: 0 2px 10px rgba(240, 147, 251, 0.5);
				}
				
				.status-monitor-card h2 {
					color: #feca57; /* Bright yellow */
					text-shadow: 0 2px 10px rgba(254, 202, 87, 0.5);
				}
				
				.main-card p {
					font-size: 14px;
					margin: 12px 0 0 0;
					color: rgba(255, 255, 255, 0.7);
					text-align: center;
					max-width: 280px;
					line-height: 1.4;
				}
				
				.main-card .icon-large {
					font-size: 48px;
					margin-bottom: 15px;
					opacity: 0.8;
				}
				
				/* Hover effects for each card */
				.check-in-card:hover {
					background: linear-gradient(135deg, rgba(67, 233, 123, 0.3) 0%, rgba(56, 249, 215, 0.3) 100%) !important;
				}
				
				.check-out-card:hover {
					background: linear-gradient(135deg, rgba(79, 172, 254, 0.3) 0%, rgba(0, 242, 254, 0.3) 100%) !important;
				}
				
				.product-finder-card:hover {
					background: linear-gradient(135deg, rgba(240, 147, 251, 0.3) 0%, rgba(245, 87, 108, 0.3) 100%) !important;
				}
				
				.status-monitor-card:hover {
					background: linear-gradient(135deg, rgba(254, 202, 87, 0.3) 0%, rgba(255, 159, 67, 0.3) 100%) !important;
				}
				
				.main-card:hover {
					transform: scale(1.02);
				}
				
				/* Bottom Stats Bar - Colorful Gradient Boxes */
				.stats-bar {
					display: grid;
					grid-template-columns: repeat(4, 1fr);
					gap: 0;
					background: #2d3748;
				}
				
				.stat-box {
					padding: 25px;
					text-align: center;
					border-right: 1px solid rgba(255,255,255,0.1);
					transition: all 0.2s;
				}
				
				/* Individual stat box colors - Purple, Pink, Cyan, Green */
				.stat-box:nth-child(1) {
					background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
				}
				
				.stat-box:nth-child(2) {
					background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
				}
				
				.stat-box:nth-child(3) {
					background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%);
				}
				
				.stat-box:nth-child(4) {
					background: linear-gradient(135deg, #43e97b 0%, #38f9d7 100%);
				}
				
				.stat-box:last-child {
					border-right: none;
				}
				
				.stat-box:hover {
					filter: brightness(1.15);
					transform: translateY(-3px);
				}
				
				.stat-value {
					font-size: 42px;
					font-weight: 900;
					color: white;
					margin-bottom: 8px;
					line-height: 1;
				}
				
				.stat-label {
					font-size: 12px;
					font-weight: 700;
					color: rgba(255,255,255,0.95);
					letter-spacing: 1.2px;
					text-transform: uppercase;
				}
			</style>
		`;
		
		$('head').append(styles);
	}

	load_html() {
		this.page.main.html(`
			<div class="dashboard-container">
				<!-- Purple/Blue Gradient Header -->
				<div class="dashboard-header">
					<h1>
						<i class="fa fa-palette"></i>
						BIN TRACKER DASHBOARD
					</h1>
					
					<!-- Header Right Side: Search + Refresh -->
					<div class="header-right">
						<!-- Search Bar -->
						<div class="header-search">
							<input type="text" id="quick-search" placeholder="Search Item Code or Batch Number..." />
							<button><i class="fa fa-search"></i></button>
						</div>
						
						<!-- Refresh Button -->
						<button class="refresh-btn" id="refresh-dashboard">
							<i class="fa fa-refresh"></i>
							REFRESH
						</button>
					</div>
				</div>
				
				<!-- Main Content: Four Navigation Cards -->
				<div class="main-content">
					 <!-- CHECK IN with Green hover -->
					<div class="main-card check-in-card" data-page="bin_check_in">
						<h2>CHECK IN</h2>
						<p>Scan batch and rack to check-in inventory</p>
					</div>
					
					<!-- CHECK OUT with Blue hover -->
					<div class="main-card check-out-card" data-page="bin_check_out">
						<h2>CHECK OUT</h2>
						<p>Check-out inventory with FIFO validation</p>
					</div>
					
					<!-- PRODUCT FINDER with Pink hover -->
					<div class="main-card product-finder-card" data-page="product_finder">
						<h2>PRODUCT FINDER</h2>
						<p>Search for products and view details</p>
					</div>
					
					<!-- STATUS MONITOR with Yellow hover -->
					<div class="main-card status-monitor-card" data-page="bin_status_monitor">
						<h2>STATUS MONITOR</h2>
						<p>Monitor the status of bins and racks</p>
					</div>
				</div>
				
				<!-- Bottom Stats Bar -->
				<div class="stats-bar">
					<div class="stat-box">
						<div class="stat-value" id="stat-items">0</div>
						<div class="stat-label">ITEM</div>
					</div>
					<div class="stat-box">
						<div class="stat-value" id="stat-batches">0</div>
						<div class="stat-label">BATCH</div>
					</div>
					<div class="stat-box">
						<div class="stat-value" id="stat-bins">0</div>
						<div class="stat-label">BIN</div>
					</div>
					<div class="stat-box">
						<div class="stat-value" id="stat-racks">0</div>
						<div class="stat-label">RACK OCCUPIED</div>
					</div>
				</div>
			</div>
		`);
		
		// Bind events after HTML is loaded
		this.bind_events();
	}

	bind_events() {
		const self = this;
		
		// Refresh button click
		$('#refresh-dashboard').on('click', function() {
			const $icon = $(this).find('i');
			$icon.addClass('fa-spin');
			self.load_stats();
			setTimeout(() => {
				$icon.removeClass('fa-spin');
			}, 1000);
		});
		
		// Main card navigation - CHECK IN, CHECK OUT, PRODUCT FINDER, STATUS MONITOR
		$('.main-card').on('click', function() {
			const page = $(this).data('page');
			if (page) {
				frappe.set_route(page);
			}
		});
		
		// Search button click
		$('.header-search button').on('click', function() {
			self.perform_search();
		});
		
		// Search on Enter key
		$('#quick-search').on('keypress', function(e) {
			if (e.which === 13) {
				e.preventDefault();
				self.perform_search();
			}
		});
		
		// Load stats on init
		this.load_stats();
	}

	// Add refresh method to reload stats when page is shown
	refresh() {
		this.load_stats();
	}

	load_stats() {
		frappe.call({
			method: 'smart_screens.smart_screens.api.bin_tracker.get_bin_status_summary',
			args: {
				warehouse: 'U1 SFG - SPP'
			},
			callback: function(r) {
				if (r.message && r.message.success) {
					const data = r.message.data || [];
					const total_items = r.message.total_items || 0;
					
					let total_batches = 0;
					let total_bins = 0;
					let total_racks = 0;
					
					data.forEach(item => {
						total_batches += item.batch_count || 0;
						total_bins += item.bin_count || 0;
						total_racks += item.rack_count || 0;
					});
					
					$('#stat-items').text(total_items);
					$('#stat-batches').text(total_batches);
					$('#stat-bins').text(total_bins);
					$('#stat-racks').text(total_racks);
				}
			}
		});
	}

	perform_search() {
		const search_value = $('#quick-search').val().trim();
		if (!search_value) {
			frappe.msgprint({
				title: __('Search Required'),
				message: __('Please enter an Item Code or Batch Number to search'),
				indicator: 'orange'
			});
			return;
		}
		
		// Navigate to Product Finder with search value
		frappe.set_route('product_finder');
		
		// Pass search value via localStorage to Product Finder page
		localStorage.setItem('bin_tracker_search', search_value);
	}
}
