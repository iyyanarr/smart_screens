// Copyright (c) 2025, Alphaworkz and contributors
// For license information, please see license.txt

frappe.pages['product_finder'].on_page_load = function(wrapper) {
	var page = frappe.ui.make_app_page({
		parent: wrapper,
		title: 'Product Finder',
		single_column: true
	});

	// Initialize the page
	new ProductFinderPage(page);
};

class ProductFinderPage {
	constructor(page) {
		this.page = page;
		this.warehouse = null; // Will be auto-extracted from search context
		this.current_item = null;
		this.current_batch = null;
		
		this.init();
	}

	init() {
		this.add_custom_styles(); // Add styles FIRST
		this.setup_page();
		this.load_html();
		this.bind_events();
		
		// Auto-focus on item code input
		setTimeout(() => {
			$('#item-code-input').focus();
		}, 500);
	}

	setup_page() {
		 // Setup page actions
		this.page.set_secondary_action('Clear', () => {
			this.clear_all();
		}, 'fa fa-eraser');
		
		// Override Frappe's default page styling
		this.page.wrapper.find('.page-head').css('background', 'transparent');
		this.page.wrapper.css('background', 'transparent');
		this.page.main.parent().css({
			'background': 'transparent',
			'padding': '0'
		});
	}

	load_html() {
		const html = `
			<div class="product-finder-page">
				<div class="product-finder-header">
					<h1><i class="fa fa-search"></i> PRODUCT FINDER</h1>
					<p>Find batch locations by Item Code or Batch Number</p>
				</div>

				<div class="product-finder-container">
					<div class="search-section">
						<h3><i class="fa fa-search"></i> Search Product</h3>

						<div class="form-group">
							<label for="item-code-input"><i class="fa fa-cube"></i> Item Code</label>
							<input 
								type="text" 
								id="item-code-input" 
								class="form-control search-input" 
								placeholder="Enter item code..."
								autocomplete="off"
							/>
						</div>

						<div class="or-divider">
							<span>OR</span>
						</div>

						<div class="form-group">
							<label for="batch-number-input"><i class="fa fa-tags"></i> Batch Number</label>
							<input 
								type="text" 
								id="batch-number-input" 
								class="form-control search-input" 
								placeholder="Enter batch number..."
								autocomplete="off"
							/>
						</div>

						<div class="action-buttons">
							<button class="btn btn-secondary btn-clear">
								<i class="fa fa-eraser"></i> Clear
							</button>
							<button class="btn btn-primary btn-search-item" disabled>
								<i class="fa fa-search"></i> Search by Item Code
							</button>
							<button class="btn btn-primary btn-search-batch" disabled>
								<i class="fa fa-search"></i> Search by Batch
							</button>
						</div>
					</div>

					<!-- FIFO Result Section -->
					<div class="fifo-result-section" style="display: none;">
						<div class="results-section">
							<h3><i class="fa fa-check-circle"></i> FIFO Batch Found</h3>
							<div class="product-card fifo-card">
								<h4>FIFO Batch Details</h4>
								<div class="product-detail">
									<span class="label">Item Code:</span>
									<span class="value fifo-item-code"></span>
								</div>
								<div class="product-detail">
									<span class="label">FIFO Batch:</span>
									<span class="value fifo-batch-number"></span>
								</div>
								<div class="product-detail">
									<span class="label">Rack Location:</span>
									<span class="value fifo-rack-location"></span>
								</div>
								<div class="product-detail">
									<span class="label">Rack Barcode:</span>
									<span class="value fifo-rack-barcode"></span>
								</div>
								<div class="product-detail">
									<span class="label">Check-In Time:</span>
									<span class="value fifo-check-in-time"></span>
								</div>
								<div class="product-detail" style="display: none;">
									<span class="label">Expiry Date:</span>
									<span class="value fifo-expiry-date"></span>
								</div>
								<div style="margin-top: 20px; text-align: center;">
									<span class="location-badge total-batches-badge"></span>
								</div>
								<div style="margin-top: 20px; text-align: center;">
									<button class="btn btn-secondary btn-show-all">
										<i class="fa fa-list"></i> Show All Batches
									</button>
								</div>
							</div>
						</div>
					</div>

					<!-- Batch Result Section -->
					<div class="batch-result-section" style="display: none;">
						<div class="results-section">
							<h3><i class="fa fa-map-marker"></i> Batch Location Details</h3>
							<div class="product-card batch-card">
								<h4>Batch Information</h4>
								<div class="product-detail">
									<span class="label">Batch Number:</span>
									<span class="value batch-number"></span>
								</div>
								<div class="product-detail">
									<span class="label">Item Code:</span>
									<span class="value batch-item-code"></span>
								</div>
								<div class="product-detail">
									<span class="label">Total Locations:</span>
									<span class="value batch-location-count"></span>
								</div>
								<div class="product-detail" style="display: none;">
									<span class="label">Batch Qty:</span>
									<span class="value batch-qty"></span>
								</div>
								<div class="product-detail" style="display: none;">
									<span class="label">Expiry Date:</span>
									<span class="value batch-expiry-date"></span>
								</div>
							</div>
						</div>
					</div>

					<!-- All Batches Table Section -->
					<div class="all-batches-section" style="display: none;">
						<div class="results-section">
							<h3><i class="fa fa-list"></i> All Batches</h3>
							<div class="all-batches-table"></div>
						</div>
					</div>

					<!-- Batch Locations Table Section -->
					<div class="batch-locations-section" style="display: none;">
						<div class="results-section">
							<h3><i class="fa fa-map-marker"></i> Batch Locations</h3>
							<div class="batch-locations-table"></div>
						</div>
					</div>

					<!-- Error Section -->
					<div class="error-section" style="display: none;">
						<div class="error-message-box">
							<h4><i class="fa fa-exclamation-triangle"></i> No Results Found</h4>
							<p class="error-message"></p>
						</div>
					</div>
				</div>
			</div>
		`;
		
		// Clear and style the page container
		this.page.main.empty();
		this.page.main.css({
			'padding': '0 !important',
			'margin': '0 !important',
			'background': 'transparent'
		});
		this.page.wrapper.find('.page-content').css({
			'padding': '0 !important',
			'background': 'transparent'
		});
		this.page.main.html(html);
	}

	add_custom_styles() {
		// Remove any existing styles for this page
		$('#product-finder-custom-styles').remove();
		
		const style = `
			<style id="product-finder-custom-styles">
				/* Force override Frappe defaults */
				body[data-route="product_finder"] .page-wrapper,
				body[data-route="product_finder"] .page-content,
				body[data-route="product_finder"] .page-container {
					background: transparent !important;
					padding: 0 !important;
					margin: 0 !important;
				}
				
				body[data-route="product_finder"] .page-head {
					background: transparent !important;
				}
				
				/* Dark Purple/Pink Theme for Product Finder */
				.product-finder-page { 
					padding: 0; 
					margin: 0 -15px;
					min-height: 100vh;
					background: linear-gradient(135deg, #2d1b69 0%, #3d2a7a 50%, #4a3589 100%);
					position: relative;
				}
				
				.product-finder-page::before {
					content: '';
					position: absolute;
					top: 0;
					left: 0;
					right: 0;
					bottom: 0;
					background: 
						repeating-linear-gradient(90deg, rgba(250,112,154,0.03) 0px, transparent 1px, transparent 50px, rgba(250,112,154,0.03) 51px),
						repeating-linear-gradient(0deg, rgba(250,112,154,0.03) 0px, transparent 1px, transparent 50px, rgba(250,112,154,0.03) 51px);
					pointer-events: none;
					z-index: 0;
				}
				
				.product-finder-page > * {
					position: relative;
					z-index: 1;
				}
				
				/* Header */
				.product-finder-header { 
					text-align: center; 
					padding: 50px 30px; 
					background: linear-gradient(135deg, #fa709a 0%, #fee140 100%);
					color: #2c3e50; 
					box-shadow: 0 10px 40px rgba(250, 112, 154, 0.4);
					border-bottom: 4px solid rgba(255,255,255,0.2);
					position: relative;
					overflow: hidden;
				}
				
				.product-finder-header::before {
					content: '';
					position: absolute;
					top: -50%;
					left: -50%;
					width: 200%;
					height: 200%;
					background: radial-gradient(circle, rgba(255,255,255,0.2) 0%, transparent 70%);
					animation: searchPulse 4s ease-in-out infinite;
				}
				
				@keyframes searchPulse {
					0%, 100% { opacity: 0.5; transform: scale(1); }
					50% { opacity: 0.8; transform: scale(1.1); }
				}
				
				.product-finder-header h1 { 
					font-size: 48px; 
					margin: 0 0 15px 0; 
					font-weight: 900;
					position: relative;
					text-shadow: 0 4px 20px rgba(0,0,0,0.2);
					letter-spacing: 4px;
				}
				
				.product-finder-header p { 
					margin: 0; 
					font-size: 20px; 
					opacity: 0.9;
					position: relative;
					font-weight: 500;
					letter-spacing: 1px;
				}
				
				.product-finder-container { 
					max-width: 1400px; 
					margin: 0 auto; 
					padding: 40px 30px; 
				}
				
				.search-section { 
					background: rgba(0, 0, 0, 0.3);
					backdrop-filter: blur(10px);
					padding: 50px; 
					border-radius: 24px; 
					margin-bottom: 40px; 
					border: 2px solid rgba(250, 112, 154, 0.3);
					box-shadow: 0 10px 40px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255,255,255,0.1);
				}
				
				.search-section h3 { 
					margin: 0 0 35px 0; 
					color: #fa709a; 
					font-size: 28px; 
					font-weight: 700;
					text-shadow: 0 0 30px rgba(250, 112, 154, 0.5);
					text-transform: uppercase;
					letter-spacing: 2px;
				}
				
				.or-divider {
					text-align: center;
					margin: 30px 0;
					position: relative;
				}
				
				.or-divider::before {
					content: '';
					position: absolute;
					top: 50%;
					left: 0;
					right: 0;
					height: 2px;
					background: rgba(255, 255, 255, 0.1);
				}
				
				.or-divider span {
					background: rgba(0, 0, 0, 0.3);
					color: rgba(255, 255, 255, 0.7);
					padding: 10px 30px;
					border-radius: 20px;
					font-weight: 700;
					font-size: 18px;
					position: relative;
					letter-spacing: 3px;
				}
				
				.product-finder-page .form-group { 
					margin-bottom: 30px;
				}
				
				.product-finder-page .form-group label { 
					display: block; 
					margin-bottom: 15px; 
					font-weight: 600; 
					color: rgba(255, 255, 255, 0.95);
					font-size: 16px;
					text-transform: uppercase;
					letter-spacing: 2px;
				}
				
				.product-finder-page .form-group label i {
					margin-right: 10px;
					color: #fa709a;
				}
				
				.product-finder-page .form-group input { 
					width: 100%; 
					height: 65px; 
					padding: 0 25px; 
					border: 3px solid rgba(250, 112, 154, 0.3);
					background: rgba(0, 0, 0, 0.3);
					color: #ffffff;
					border-radius: 15px; 
					font-size: 20px;
					font-weight: 600;
					transition: all 0.3s;
					letter-spacing: 1px;
				}
				
				.product-finder-page .form-group input::placeholder {
					color: rgba(255, 255, 255, 0.3);
				}
				
				.product-finder-page .form-group input:focus { 
					border-color: #fa709a; 
					background: rgba(250, 112, 154, 0.1);
					box-shadow: 0 0 0 5px rgba(250, 112, 154, 0.2), 0 0 30px rgba(250, 112, 154, 0.3);
					outline: none;
				}
				
				.action-buttons { 
					display: flex; 
					gap: 20px; 
					justify-content: flex-end; 
					margin-top: 40px;
					flex-wrap: wrap;
				}
				
				.product-finder-page .btn-primary { 
					padding: 18px 40px; 
					background: linear-gradient(135deg, #fa709a 0%, #fee140 100%) !important;
					color: #2c3e50 !important; 
					border: none !important; 
					border-radius: 15px; 
					font-size: 18px; 
					font-weight: 700;
					cursor: pointer; 
					transition: all 0.3s;
					box-shadow: 0 6px 25px rgba(250, 112, 154, 0.4);
					text-transform: uppercase;
					letter-spacing: 2px;
				}
				
				.product-finder-page .btn-primary:hover:not(:disabled) { 
					transform: translateY(-4px); 
					box-shadow: 0 10px 35px rgba(250, 112, 154, 0.6);
					background: linear-gradient(135deg, #fa709a 0%, #fee140 100%) !important;
				}
				
				.product-finder-page .btn-primary:disabled {
					opacity: 0.5;
					cursor: not-allowed;
				}
				
				.product-finder-page .btn-secondary { 
					padding: 18px 40px; 
					background: rgba(255, 255, 255, 0.1) !important;
					color: white !important; 
					border: 3px solid rgba(255, 255, 255, 0.3) !important;
					border-radius: 15px; 
					font-size: 18px; 
					font-weight: 700;
					cursor: pointer; 
					transition: all 0.3s;
					text-transform: uppercase;
					letter-spacing: 2px;
				}
				
				.product-finder-page .btn-secondary:hover { 
					background: rgba(255, 255, 255, 0.2) !important;
					border-color: rgba(255, 255, 255, 0.6) !important;
					transform: translateY(-4px);
				}
				
				.results-section { 
					background: rgba(0, 0, 0, 0.3);
					backdrop-filter: blur(10px);
					padding: 40px; 
					border-radius: 24px; 
					border: 2px solid rgba(250, 112, 154, 0.3);
					box-shadow: 0 10px 40px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255,255,255,0.1);
					margin-bottom: 30px;
				}
				
				.results-section h3 { 
					margin: 0 0 30px 0; 
					color: #fa709a; 
					font-size: 28px; 
					font-weight: 700;
					text-shadow: 0 0 30px rgba(250, 112, 154, 0.5);
					text-transform: uppercase;
					letter-spacing: 2px;
				}
				
				.product-card {
					background: rgba(250, 112, 154, 0.1);
					border: 2px solid rgba(250, 112, 154, 0.3);
					border-radius: 20px;
					padding: 35px;
					transition: all 0.3s;
				}
				
				.product-card:hover {
					transform: translateY(-5px);
					background: rgba(250, 112, 154, 0.15);
					border-color: rgba(250, 112, 154, 0.6);
					box-shadow: 0 15px 40px rgba(250, 112, 154, 0.3);
				}
				
				.product-card h4 {
					color: #fee140;
					font-size: 24px;
					margin: 0 0 25px 0;
					font-weight: 700;
					letter-spacing: 1px;
					text-align: center;
				}
				
				.product-detail {
					display: flex;
					justify-content: space-between;
					padding: 15px 0;
					border-bottom: 1px solid rgba(255, 255, 255, 0.1);
				}
				
				.product-detail:last-child {
					border-bottom: none;
				}
				
				.product-detail .label {
					color: rgba(255, 255, 255, 0.7);
					font-weight: 600;
					text-transform: uppercase;
					font-size: 14px;
					letter-spacing: 1px;
				}
				
				.product-detail .value {
					color: #ffffff;
					font-weight: 700;
					font-size: 18px;
				}
				
				.location-badge {
					display: inline-block;
					background: linear-gradient(135deg, #fa709a 0%, #fee140 100%);
					color: #2c3e50;
					padding: 10px 20px;
					border-radius: 20px;
					font-size: 16px;
					font-weight: 700;
					margin-top: 15px;
					letter-spacing: 1px;
					box-shadow: 0 4px 15px rgba(250, 112, 154, 0.4);
				}
				
				.results-section table {
					width: 100%;
					border-collapse: separate;
					border-spacing: 0 10px;
					margin-top: 20px;
				}
				
				.results-section table thead th {
					background: linear-gradient(135deg, #fa709a 0%, #fee140 100%);
					color: #2c3e50;
					padding: 18px;
					text-align: left;
					font-weight: 700;
					font-size: 14px;
					text-transform: uppercase;
					letter-spacing: 2px;
					border: none;
				}
				
				.results-section table thead th:first-child {
					border-radius: 12px 0 0 12px;
				}
				
				.results-section table thead th:last-child {
					border-radius: 0 12px 12px 0;
				}
				
				.results-section table tbody tr {
					background: rgba(250, 112, 154, 0.08);
					transition: all 0.3s;
				}
				
				.results-section table tbody tr:hover {
					background: rgba(250, 112, 154, 0.15);
					transform: scale(1.02);
				}
				
				.results-section table tbody tr.table-success {
					background: rgba(67, 233, 123, 0.2);
					border: 2px solid rgba(67, 233, 123, 0.5);
				}
				
				.results-section table tbody td {
					padding: 18px;
					color: rgba(255, 255, 255, 0.95);
					border: none;
					font-weight: 500;
					font-size: 15px;
				}
				
				.results-section table tbody td:first-child {
					border-radius: 12px 0 0 12px;
				}
				
				.results-section table tbody td:last-child {
					border-radius: 0 12px 12px 0;
				}
				
				.error-message-box { 
					background: linear-gradient(135deg, #e74c3c 0%, #c0392b 100%);
					color: white; 
					padding: 35px; 
					border-radius: 20px; 
					box-shadow: 0 6px 30px rgba(231, 76, 60, 0.4);
					border: 3px solid rgba(255, 255, 255, 0.3);
					animation: shake 0.5s ease-out;
				}
				
				@keyframes shake {
					0%, 100% { transform: translateX(0); }
					25% { transform: translateX(-10px); }
					75% { transform: translateX(10px); }
				}
				
				.error-message-box h4 {
					font-size: 24px;
					margin: 0 0 15px 0;
					font-weight: 700;
					letter-spacing: 1px;
				}
				
				.error-message-box p {
					margin: 0;
					font-size: 16px;
				}
			</style>
		`;
		$('head').append(style);
	}

	bind_events() {
		const self = this;
		
		// Item code input events
		$('#item-code-input').on('input', function() {
			const value = $(this).val().trim();
			if (value) {
				$('.btn-search-item').prop('disabled', false);
				$('#batch-number-input').val(''); // Clear batch input
				$('.btn-search-batch').prop('disabled', true);
			} else {
				$('.btn-search-item').prop('disabled', true);
			}
		});
		
		$('#item-code-input').on('keypress', function(e) {
			if (e.which === 13) { // Enter key
				e.preventDefault();
				if ($(this).val().trim()) {
					self.search_by_item();
				}
			}
		});
		
		// Batch number input events
		$('#batch-number-input').on('input', function() {
			const value = $(this).val().trim();
			if (value) {
				$('.btn-search-batch').prop('disabled', false);
				$('#item-code-input').val(''); // Clear item input
				$('.btn-search-item').prop('disabled', true);
			} else {
				$('.btn-search-batch').prop('disabled', true);
			}
		});
		
		$('#batch-number-input').on('keypress', function(e) {
			if (e.which === 13) { // Enter key
				e.preventDefault();
				if ($(this).val().trim()) {
					self.search_by_batch();
				}
			}
		});
		
		// Search buttons
		$('.btn-search-item').on('click', function() {
			self.search_by_item();
		});
		
		$('.btn-search-batch').on('click', function() {
			self.search_by_batch();
		});
		
		// Show all button
		$(document).on('click', '.btn-show-all', function() {
			self.show_all_batches();
		});
		
		// Clear button
		$('.btn-clear').on('click', function() {
			self.clear_all();
		});
	}

	search_by_item() {
		const self = this;
		const item_code = $('#item-code-input').val().trim();
		
		if (!item_code) {
			frappe.msgprint('Please enter an item code');
			return;
		}
		
		// Hide all result sections
		this.hide_all_results();
		
		// Show loading
		frappe.show_alert({
			message: 'Searching...',
			indicator: 'blue'
		});
		
		frappe.call({
			method: 'smart_screens.smart_screens.api.bin_tracker.find_product_by_item',
			args: {
				item_code: item_code,
				warehouse: null, // Search across all warehouses
				show_all: false
			},
			callback: function(r) {
				if (r.message && r.message.success) {
					self.current_item = item_code;
					self.warehouse = r.message.fifo_batch.warehouse; // Get warehouse from result
					self.display_fifo_result(r.message);
				} else {
					self.show_error(r.message.message || 'No batches found for this item');
				}
			},
			error: function() {
				self.show_error('An error occurred while searching');
			}
		});
	}

	search_by_batch() {
		const self = this;
		const batch = $('#batch-number-input').val().trim();
		
		if (!batch) {
			frappe.msgprint('Please enter a batch number');
			return;
		}
		
		// Hide all result sections
		this.hide_all_results();
		
		// Show loading
		frappe.show_alert({
			message: 'Searching...',
			indicator: 'blue'
		});
		
		frappe.call({
			method: 'smart_screens.smart_screens.api.bin_tracker.find_product_by_batch',
			args: {
				batch: batch,
				warehouse: null // Search across all warehouses
			},
			callback: function(r) {
				if (r.message && r.message.success) {
					self.current_batch = batch;
					self.warehouse = r.message.locations[0]?.warehouse; // Get warehouse from first location
					self.display_batch_result(r.message);
				} else {
					self.show_error(r.message.message || 'Batch not found');
				}
			},
			error: function() {
				self.show_error('An error occurred while searching');
			}
		});
	}

	show_all_batches() {
		const self = this;
		
		if (!this.current_item) {
			frappe.msgprint('No item selected');
			return;
		}
		
		frappe.call({
			method: 'smart_screens.smart_screens.api.bin_tracker.find_product_by_item',
			args: {
				item_code: this.current_item,
				warehouse: this.warehouse,
				show_all: true
			},
			callback: function(r) {
				if (r.message && r.message.success && r.message.all_batches) {
					self.display_all_batches(r.message.all_batches);
				}
			}
		});
	}

	display_all_batches(batches) {
		let html = `
			<table class="table table-bordered table-hover">
				<thead>
					<tr>
						<th>Batch Number</th>
						<th>Rack Location</th>
						<th>Rack Barcode</th>
						<th>Check-In Time</th>
						<th>Expiry Date</th>
					</tr>
				</thead>
				<tbody>
		`;
		
		batches.forEach((batch, index) => {
			const rowClass = index === 0 ? 'table-success' : '';
			const fifoLabel = index === 0 ? ' <span class="badge badge-success">FIFO</span>' : '';
			
			html += `
				<tr class="${rowClass}">
					<td>${batch.batch}${fifoLabel}</td>
					<td>${batch.rack_location || batch.rack_id}</td>
					<td>${batch.rack_barcode || '-'}</td>
					<td>${frappe.datetime.str_to_user(batch.check_in_time)}</td>
					<td>${batch.expiry_date ? frappe.datetime.str_to_user(batch.expiry_date) : '-'}</td>
				</tr>
			`;
		});
		
		html += `
				</tbody>
			</table>
		`;
		
		$('.all-batches-table').html(html);
		$('.all-batches-section').show();
	}

	display_batch_locations(locations) {
		let html = `
			<table class="table table-bordered table-hover">
				<thead>
					<tr>
						<th>Rack Location</th>
						<th>Rack Barcode</th>
						<th>Check-In Time</th>
					</tr>
				</thead>
				<tbody>
		`;
		
		locations.forEach(location => {
			html += `
				<tr>
					<td>${location.rack_location || location.rack_id}</td>
					<td>${location.rack_barcode || '-'}</td>
					<td>${frappe.datetime.str_to_user(location.check_in_time)}</td>
				</tr>
			`;
		});
		
		html += `
				</tbody>
			</table>
		`;
		
		$('.batch-locations-table').html(html);
		$('.batch-locations-section').show();
	}

	display_fifo_result(data) {
		const fifo = data.fifo_batch;
		
		// Populate FIFO details
		$('.fifo-item-code').text(data.item_code);
		$('.fifo-batch-number').text(fifo.batch);
		$('.fifo-rack-location').text(fifo.rack_location || fifo.rack_id);
		$('.fifo-rack-barcode').text(fifo.rack_barcode || '-');
		$('.fifo-check-in-time').text(frappe.datetime.str_to_user(fifo.check_in_time));
		
		// Show expiry date if available
		if (fifo.expiry_date) {
			$('.fifo-expiry-date').text(frappe.datetime.str_to_user(fifo.expiry_date));
			$('.fifo-expiry-date').parent().show();
		}
		
		// Show total batches badge
		$('.total-batches-badge').text(`${data.total_batches} batch(es) available`);
		
		// Show the FIFO result section
		$('.fifo-result-section').show();
		
		// Play success sound
		frappe.utils.play_sound('submit');
	}

	display_batch_result(data) {
		// Populate batch details
		$('.batch-number').text(data.batch);
		$('.batch-item-code').text(data.item_code);
		$('.batch-location-count').text(data.location_count);
		
		// Show batch qty and expiry if available
		if (data.batch_qty) {
			$('.batch-qty').text(data.batch_qty);
			$('.batch-qty').parent().show();
		}
		
		if (data.expiry_date) {
			$('.batch-expiry-date').text(frappe.datetime.str_to_user(data.expiry_date));
			$('.batch-expiry-date').parent().show();
		}
		
		// Show the batch result section
		$('.batch-result-section').show();
		
		// Show locations table
		if (data.locations && data.locations.length > 0) {
			this.display_batch_locations(data.locations);
		} else {
			this.show_error('This batch is not checked in anywhere');
		}
		
		// Play success sound
		frappe.utils.play_sound('submit');
	}

	show_error(message) {
		this.hide_all_results();
		$('.error-message').text(message);
		$('.error-section').show();
		
		// Play error sound
		frappe.utils.play_sound('error');
	}

	hide_all_results() {
		$('.fifo-result-section').hide();
		$('.batch-result-section').hide();
		$('.all-batches-section').hide();
		$('.batch-locations-section').hide();
		$('.error-section').hide();
	}

	clear_all() {
		// Clear inputs
		$('#item-code-input').val('');
		$('#batch-number-input').val('');
		
		// Disable search buttons
		$('.btn-search-item, .btn-search-batch').prop('disabled', true);
		
		// Hide all results
		this.hide_all_results();
		
		// Clear current item/batch
		this.current_item = null;
		this.current_batch = null;
		
		// Focus on item code input
		$('#item-code-input').focus();
	}
}
