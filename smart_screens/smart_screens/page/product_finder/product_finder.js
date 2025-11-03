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
		this.warehouse = null;
		this.current_item = null;
		this.current_batch = null;
		
		this.init();
	}

	init() {
		this.setup_page();
		this.add_styles();
		this.load_html();
		this.bind_events();
		
		// Auto-focus on item code input
		setTimeout(() => {
			$('#item-code-input').focus();
		}, 500);
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
		$('#product-finder-styles').remove();
		
		const styles = `
			<style id="product-finder-styles">
				/* Reset all Frappe containers for this page */
				body[data-route="product_finder"] .layout-main-section-wrapper {
					padding: 0 !important;
					margin: 0 !important;
				}
				
				body[data-route="product_finder"] .layout-main-section {
					padding: 0 !important;
					margin: 0 !important;
				}
				
				/* Main container */
				.product-finder-container {
					width: 100%;
					min-height: calc(100vh - 50px);
					background: #2d3748; /* Dark navy background */
					display: flex;
					flex-direction: column;
				}
				
				/* Green Header - Same as Bin Check-In */
				.product-finder-header {
					background: #43e97b; /* Solid green */
					padding: 20px 30px;
					display: flex;
					align-items: center;
					justify-content: space-between;
					box-shadow: 0 4px 12px rgba(0,0,0,0.15);
				}
				
				.product-finder-header h1 {
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
					background: #2d3748;
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
				.product-finder-content {
					flex: 1;
					display: flex;
					flex-direction: column;
					padding: 40px;
					gap: 30px;
				}
				
				/* Search Card */
				.search-card {
					background: rgba(255,255,255,0.05);
					border-radius: 12px;
					padding: 40px;
					border: 1px solid rgba(255,255,255,0.1);
				}
				
				.search-card h3 {
					color: white;
					font-size: 18px;
					font-weight: 700;
					margin: 0 0 30px 0;
					text-transform: uppercase;
					letter-spacing: 1px;
				}
				
				.form-group {
					margin-bottom: 25px;
					position: relative;
				}
				
				.form-group label {
					display: block;
					color: white;
					font-size: 14px;
					font-weight: 600;
					margin-bottom: 10px;
					text-transform: uppercase;
					letter-spacing: 0.5px;
				}
				
				.form-group input {
					width: 100%;
					height: 50px;
					padding: 0 16px;
					background: rgba(255,255,255,0.1);
					border: 2px solid rgba(255,255,255,0.2);
					border-radius: 8px;
					color: white;
					font-size: 18px;
					font-weight: 500;
					transition: all 0.2s;
				}
				
				.form-group input::placeholder {
					color: rgba(255,255,255,0.4);
				}
				
				.form-group input:focus {
					outline: none;
					border-color: #43e97b;
					background: rgba(67,233,123,0.1);
					box-shadow: 0 0 0 3px rgba(67,233,123,0.2);
				}
				
				/* Warehouse Select Dropdown */
				.form-group select {
					width: 100%;
					height: 50px;
					padding: 0 16px;
					background: rgba(255,255,255,0.1);
					border: 2px solid rgba(255,255,255,0.2);
					border-radius: 8px;
					color: white;
					font-size: 16px;
					font-weight: 600;
					transition: all 0.2s;
					cursor: pointer;
					appearance: none;
					background-image: url("data:image/svg+xml;charset=UTF-8,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='white' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3e%3cpolyline points='6 9 12 15 18 9'%3e%3c/polyline%3e%3c/svg%3e");
					background-repeat: no-repeat;
					background-position: right 16px center;
					background-size: 20px;
					padding-right: 45px;
				}
				
				.form-group select option {
					background: #2d3748;
					color: white;
					padding: 10px;
					font-weight: 600;
				}
				
				.form-group select:hover {
					border-color: rgba(67,233,123,0.5);
					background: rgba(255,255,255,0.15);
				}
				
				.form-group select:focus {
					outline: none;
					border-color: #43e97b;
					background: rgba(67,233,123,0.1);
					box-shadow: 0 0 0 3px rgba(67,233,123,0.2);
				}
				
				.or-divider {
					text-align: center;
					margin: 25px 0;
					position: relative;
				}
				
				.or-divider::before {
					content: '';
					position: absolute;
					top: 50%;
					left: 0;
					right: 0;
					height: 1px;
					background: rgba(255,255,255,0.2);
				}
				
				.or-divider span {
					background: #2d3748;
					color: rgba(255,255,255,0.6);
					padding: 8px 20px;
					border-radius: 20px;
					font-weight: 700;
					font-size: 14px;
					position: relative;
					letter-spacing: 2px;
				}
				
				.action-buttons {
					display: flex;
					gap: 15px;
					justify-content: flex-end;
					margin-top: 30px;
					flex-wrap: wrap;
				}
				
				.action-buttons .btn {
					height: 50px;
					padding: 0 25px;
					border-radius: 8px;
					font-size: 14px;
					font-weight: 700;
					cursor: pointer;
					transition: all 0.2s;
					text-transform: uppercase;
					letter-spacing: 1px;
					border: none;
				}
				
				.action-buttons .btn-primary {
					background: #43e97b;
					color: white;
				}
				
				.action-buttons .btn-primary:hover:not(:disabled) {
					background: #38f9d7;
					transform: translateY(-2px);
					box-shadow: 0 6px 20px rgba(67,233,123,0.3);
				}
				
				.action-buttons .btn-primary:disabled {
					background: rgba(255,255,255,0.1);
					color: rgba(255,255,255,0.3);
					cursor: not-allowed;
				}
				
				.action-buttons .btn-secondary {
					background: rgba(255,255,255,0.1);
					border: 2px solid rgba(255,255,255,0.3);
					color: white;
				}
				
				.action-buttons .btn-secondary:hover {
					background: rgba(255,255,255,0.15);
					border-color: rgba(255,255,255,0.5);
					transform: translateY(-2px);
				}
				
				/* Results Section */
				.results-card {
					background: rgba(255,255,255,0.05);
					border-radius: 12px;
					padding: 40px;
					border: 1px solid rgba(255,255,255,0.1);
				}
				
				.results-card h3 {
					color: white;
					font-size: 18px;
					font-weight: 700;
					margin: 0 0 30px 0;
					text-transform: uppercase;
					letter-spacing: 1px;
					display: flex;
					align-items: center;
					gap: 10px;
				}
				
				.product-card {
					background: rgba(67,233,123,0.1);
					border: 2px solid rgba(67,233,123,0.3);
					border-radius: 12px;
					padding: 30px;
					transition: all 0.3s;
				}
				
				.product-card h4 {
					color: #43e97b;
					font-size: 16px;
					margin: 0 0 20px 0;
					font-weight: 700;
					text-align: center;
					text-transform: uppercase;
					letter-spacing: 1px;
				}
				
				.product-detail {
					display: flex;
					justify-content: space-between;
					padding: 12px 0;
					border-bottom: 1px solid rgba(255,255,255,0.1);
				}
				
				.product-detail:last-child {
					border-bottom: none;
				}
				
				.product-detail .label {
					color: rgba(255,255,255,0.7);
					font-weight: 600;
					font-size: 14px;
				}
				
				.product-detail .value {
					color: white;
					font-weight: 700;
					font-size: 16px;
				}
				
				.location-badge {
					display: inline-block;
					background: #43e97b;
					color: white;
					padding: 8px 16px;
					border-radius: 20px;
					font-size: 14px;
					font-weight: 700;
					margin-top: 10px;
				}
				
				/* Table Styles */
				.results-card table {
					width: 100%;
					border-collapse: collapse;
					margin-top: 20px;
				}
				
				.results-card table thead th {
					background: rgba(67,233,123,0.2);
					color: white;
					padding: 15px;
					text-align: left;
					font-weight: 700;
					font-size: 13px;
					text-transform: uppercase;
					letter-spacing: 1px;
					border-bottom: 2px solid rgba(67,233,123,0.5);
				}
				
				.results-card table tbody tr {
					background: rgba(255,255,255,0.03);
					border-bottom: 1px solid rgba(255,255,255,0.1);
					transition: all 0.2s;
				}
				
				.results-card table tbody tr:hover {
					background: rgba(67,233,123,0.1);
				}
				
				.results-card table tbody tr.table-success {
					background: rgba(67,233,123,0.2);
					border-left: 4px solid #43e97b;
				}
				
				.results-card table tbody td {
					padding: 15px;
					color: rgba(255,255,255,0.9);
					font-size: 14px;
				}
				
				/* Error Section */
				.error-section {
					background: rgba(255,255,255,0.05);
					border-radius: 12px;
					padding: 40px;
					border: 1px solid rgba(255,255,255,0.1);
				}
				
				.error-message-box {
					background: rgba(255,59,48,0.15);
					border: 2px solid rgba(255,59,48,0.4);
					border-radius: 12px;
					padding: 30px;
					text-align: center;
				}
				
				.error-message-box h4 {
					color: #ff3b30;
					margin: 0 0 15px 0;
					font-size: 18px;
					font-weight: 700;
					display: flex;
					align-items: center;
					justify-content: center;
					gap: 10px;
				}
				
				.error-message-box p {
					color: rgba(255,255,255,0.9);
					margin: 0;
					font-size: 15px;
				}
			</style>
		`;
		
		$('head').append(styles);
	}

	load_html() {
		this.page.main.html(`
			<div class="product-finder-container">
				<!-- Green Header -->
				<div class="product-finder-header">
					<h1>
						<i class="fa fa-search"></i>
						PRODUCT FINDER
					</h1>
					<button class="back-btn" onclick="window.history.back()">
						<i class="fa fa-arrow-left"></i>
						BACK TO DASHBOARD
					</button>
				</div>
				
				<!-- Main Content -->
				<div class="product-finder-content">
					<!-- Search Card -->
					<div class="search-card">
						<h3><i class="fa fa-search"></i> Search Product</h3>
						
						<!-- Warehouse Selector -->
						<div class="form-group">
							<label><i class="fa fa-warehouse"></i> Select Warehouse</label>
							<select id="warehouse-select" class="form-control">
								<option value="U1-Inspection - SPP INDIA">U1-Inspection - SPP INDIA</option>
								<option value="U1-Store - SPP INDIA">U1-Store - SPP INDIA</option>
								<option value="U1 SFG - SPP">U1 SFG - SPP</option>
								<option value="Sheeting Warehouse - SPP">Sheeting Warehouse - SPP</option>
								<option value="Stores - SPP">Stores - SPP</option>
							</select>
						</div>
						
						<div class="form-group">
							<label><i class="fa fa-cube"></i> Item Code</label>
							<input 
								type="text" 
								id="item-code-input" 
								class="form-control" 
								placeholder="Scan or enter item code..."
								autocomplete="off"
							/>
						</div>
						
						<div class="or-divider">
							<span>OR</span>
						</div>
						
						<div class="form-group">
							<label><i class="fa fa-tags"></i> Batch Number</label>
							<input 
								type="text" 
								id="batch-number-input" 
								class="form-control" 
								placeholder="Scan or enter batch number..."
								autocomplete="off"
							/>
						</div>
						
						<div class="action-buttons">
							<button class="btn btn-secondary btn-clear">
								<i class="fa fa-eraser"></i> Clear
							</button>
							<button class="btn btn-primary btn-search-item" disabled>
								<i class="fa fa-search"></i> Search by Item
							</button>
							<button class="btn btn-primary btn-search-batch" disabled>
								<i class="fa fa-search"></i> Search by Batch
							</button>
						</div>
					</div>
					
					<!-- FIFO Result Section -->
					<div class="fifo-result-section" style="display: none;">
						<div class="results-card">
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
						<div class="results-card">
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
						<div class="results-card">
							<h3><i class="fa fa-list"></i> All Batches</h3>
							<div class="all-batches-table"></div>
						</div>
					</div>
					
					<!-- Batch Locations Table Section -->
					<div class="batch-locations-section" style="display: none;">
						<div class="results-card">
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
		`);
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
		const warehouse = $('#warehouse-select').val(); // Get selected warehouse
		
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
				warehouse: warehouse, // Use selected warehouse
				show_all: false
			},
			callback: function(r) {
				if (r.message && r.message.success) {
					self.current_item = item_code;
					self.warehouse = warehouse; // Store selected warehouse
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
		const warehouse = $('#warehouse-select').val(); // Get selected warehouse
		
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
				warehouse: warehouse // Use selected warehouse
			},
			callback: function(r) {
				if (r.message && r.message.success) {
					self.current_batch = batch;
					self.warehouse = warehouse; // Store selected warehouse
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
