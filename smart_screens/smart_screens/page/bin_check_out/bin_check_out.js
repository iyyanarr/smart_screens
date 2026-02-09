// Copyright (c) 2025, Alphaworkz and contributors
// For license information, please see license.txt

frappe.pages['bin_check_out'].on_page_load = function (wrapper) {
	var page = frappe.ui.make_app_page({
		parent: wrapper,
		title: 'Bin Check-Out',
		single_column: true
	});

	page.check_out_instance = new BinCheckOutPage(page);
};

// Add on_page_show to handle navigation back to this page
frappe.pages['bin_check_out'].on_page_show = function (wrapper) {
	// Only reset the form if the instance already exists
	// Don't reload HTML or rebind events
	if (wrapper.page && wrapper.page.check_out_instance) {
		wrapper.page.check_out_instance.reset_form();
	}
};

// Add cleanup on page hide to prevent event conflicts
frappe.pages['bin_check_out'].on_page_hide = function (wrapper) {
	// Unbind all events to prevent conflicts when navigating away
	if (wrapper.page && wrapper.page.check_out_instance) {
		wrapper.page.check_out_instance.unbind_events();
	}
};

class BinCheckOutPage {
	constructor(page) {
		this.page = page;
		this.warehouse = null;
		this.batch = null;
		this.rack_id = null;
		this.item_code = null;
		this.validation_state = {
			batch_valid: false,
			rack_valid: false
		};
		this.last_spoken_rack = null; // Guard to prevent duplicate audio on blur/tab-switch

		this.init();
	}

	init() {
		this.setup_page();
		this.add_custom_styles();
		this.load_html();
		this.bind_events();
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
			<div class="checkout-container">
				<!-- Cyan/Blue Gradient Header - Same as Dashboard but different color -->
				<div class="checkout-header">
					<h1>
						<i class="fa fa-sign-out"></i>
						BIN CHECK-OUT
					</h1>
					<button class="back-btn" id="back-to-dashboard">
						<i class="fa fa-arrow-left"></i>
						BACK TO DASHBOARD
					</button>
				</div>

				<!-- Main Content Area -->
				<div class="checkout-content">
					<!-- Scan Form Card -->
					<div class="scan-form-card">
						<div class="form-group">
							<label>
								<i class="fa fa-barcode"></i> Scan Batch Barcode
							</label>
							<div class="input-wrapper">
								<input 
									type="text" 
									id="batch-barcode" 
									placeholder="Scan or enter batch barcode..." 
									autocomplete="off"
								/>
								<div class="validation-icon" id="batch-validation-icon"></div>
							</div>
						</div>
						
						<div class="form-group">
							<label>
								<i class="fa fa-map-marker"></i> Scan Rack Location Barcode
							</label>
							<div class="input-wrapper">
								<input 
									type="text" 
									id="rack-barcode" 
									placeholder="Scan or enter rack barcode..." 
									autocomplete="off"
								/>
								<div class="validation-icon" id="rack-validation-icon"></div>
							</div>
						</div>
						
						<div class="button-group">
							<button class="reset-btn" id="reset-btn">
								<i class="fa fa-refresh"></i> RESET
							</button>
							<button class="submit-btn" id="submit-check-out" disabled>
								<i class="fa fa-sign-out"></i> CHECK OUT
							</button>
						</div>
						
						<!-- FIFO Warning Section -->
						<div class="fifo-warning-section" id="fifo-warning-section" style="display: none;">
							<h4>
								<i class="fa fa-exclamation-triangle"></i>
								FIFO Violation Warning
							</h4>
							<p id="fifo-warning-message"></p>
						</div>
						
						<!-- Success Section -->
						<div class="success-section" id="success-section" style="display: none;">
							<h4>
								<i class="fa fa-check-circle"></i>
								Check-Out Successful
							</h4>
							<div class="success-details">
								<div class="detail-row">
									<strong>Item Code:</strong>
									<span id="success-item"></span>
								</div>
								<div class="detail-row">
									<strong>Batch:</strong>
									<span id="success-batch"></span>
								</div>
								<div class="detail-row">
									<strong>Rack:</strong>
									<span id="success-rack"></span>
								</div>
								<div class="detail-row">
									<strong>Time:</strong>
									<span id="success-time"></span>
								</div>
							</div>
						</div>
						
						<!-- Error Message Section -->
						<div class="error-section" id="error-section" style="display: none;">
							<h4>
								<i class="fa fa-exclamation-triangle"></i>
								Error
							</h4>
							<p id="error-message"></p>
						</div>
					</div>
				</div>
			</div>
		`;

		this.page.main.html(html);
	}

	add_custom_styles() {
		// Remove any existing styles for this page
		$('#bin-check-out-custom-styles').remove();

		const style = `
			<style id="bin-check-out-custom-styles">
				 /* Reset all Frappe containers for this page */
				body[data-route="bin_check_out"] .layout-main-section-wrapper {
					padding: 0 !important;
					margin: 0 !important;
				}
				
				body[data-route="bin_check_out"] .layout-main-section {
					padding: 0 !important;
					margin: 0 !important;
				}
				
				/* Main container - Same as Check-In */
				.checkout-container {
					width: 100%;
					min-height: calc(100vh - 50px);
					background: #2d3748; /* Dark navy background */
					display: flex;
					flex-direction: column;
				}
				
				/* Cyan/Blue Gradient Header - Different from Check-In (which is green) */
				.checkout-header {
					background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%);
					padding: 20px 30px;
					display: flex;
					align-items: center;
					justify-content: space-between;
					box-shadow: 0 4px 12px rgba(0,0,0,0.15);
				}
				
				.checkout-header h1 {
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
					background: #2d3748; /* Dark navy - contrasts with cyan */
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
					background: #1a202c; /* Darker navy on hover */
					border-color: rgba(255,255,255,0.5);
					transform: translateY(-2px);
					box-shadow: 0 4px 8px rgba(0,0,0,0.2);
				}
				
				/* Main Content Area */
				.checkout-content {
					flex: 1;
					display: flex;
					flex-direction: column;
					padding: 40px;
					gap: 30px;
				}
				
				/* Scan Form Card */
				.scan-form-card {
					background: rgba(255,255,255,0.05);
					border-radius: 12px;
					padding: 40px;
					border: 1px solid rgba(255,255,255,0.1);
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
				
				.input-wrapper {
					position: relative;
					display: flex;
					align-items: center;
					gap: 10px;
				}
				
				.form-group input {
					flex: 1;
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
					border-color: #4facfe; /* Cyan - matches header */
					background: rgba(79,172,254,0.1);
					box-shadow: 0 0 0 3px rgba(79,172,254,0.2);
				}
				
				.form-group input.valid {
					border-color: #4facfe;
				}
				
				.form-group input.invalid {
					border-color: #ff3b30;
				}
				
				.validation-icon {
					width: 40px;
					height: 40px;
					border-radius: 50%;
					display: flex;
					align-items: center;
					justify-content: center;
					font-size: 20px;
					opacity: 0;
					transition: all 0.3s;
				}
				
				.validation-icon.show {
					opacity: 1;
				}
				
				.validation-icon.valid {
					background: rgba(79,172,254,0.2);
					color: #4facfe;
				}
				
				.validation-icon.invalid {
					background: rgba(255,59,48,0.2);
					color: #ff3b30;
				}
				
				.validation-icon.validating {
					background: rgba(255,255,255,0.1);
					color: rgba(255,255,255,0.5);
				}
				
				.button-group {
					display: flex;
					gap: 15px;
					justify-content: flex-end;
					margin-top: 30px;
				}
				
				.reset-btn {
					height: 50px;
					padding: 0 30px;
					background: rgba(255,255,255,0.1);
					border: 2px solid rgba(255,255,255,0.2);
					border-radius: 8px;
					color: white;
					font-size: 14px;
					font-weight: 700;
					cursor: pointer;
					transition: all 0.2s;
					text-transform: uppercase;
					letter-spacing: 1px;
				}
				
				.reset-btn:hover {
					background: rgba(255,255,255,0.2);
					border-color: rgba(255,255,255,0.3);
					transform: translateY(-2px);
				}
				
				.submit-btn {
					height: 50px;
					padding: 0 40px;
					background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%); /* Cyan - same as header */
					border: none;
					border-radius: 8px;
					color: white;
					font-size: 14px;
					font-weight: 700;
					cursor: pointer;
					transition: all 0.2s;
					text-transform: uppercase;
					letter-spacing: 1px;
				}
				
				.submit-btn:hover:not(:disabled) {
					transform: translateY(-2px);
					box-shadow: 0 6px 20px rgba(79,172,254,0.4);
				}
				
				.submit-btn:disabled {
					background: rgba(255,255,255,0.1);
					color: rgba(255,255,255,0.3);
					cursor: not-allowed;
					transform: none;
					box-shadow: none;
				}
				
				/* FIFO Warning Section */
				.fifo-warning-section {
					margin-top: 20px;
					padding: 20px;
					background: rgba(255,107,107,0.1);
					border: 2px solid rgba(255,107,107,0.5);
					border-radius: 8px;
					display: none;
					animation: warningPulse 2s ease-in-out infinite;
				}
				
				@keyframes warningPulse {
					0%, 100% { 
						border-color: rgba(255,107,107,0.5);
						box-shadow: 0 0 20px rgba(255,107,107,0.2);
					}
					50% { 
						border-color: rgba(255,107,107,0.8);
						box-shadow: 0 0 30px rgba(255,107,107,0.4);
					}
				}
				
				.fifo-warning-section.show {
					display: block;
				}
				
				.fifo-warning-section h4 {
					color: #ff6b6b;
					margin: 0 0 10px 0;
					font-size: 16px;
					font-weight: 700;
					display: flex;
					align-items: center;
					gap: 8px;
				}
				
				.fifo-warning-section p {
					color: rgba(255,255,255,0.9);
					margin: 0;
					font-size: 14px;
					line-height: 1.5;
				}
				
				/* Success Section */
				.success-section {
					margin-top: 20px;
					padding: 20px;
					background: rgba(79,172,254,0.1);
					border: 2px solid rgba(79,172,254,0.3);
					border-radius: 8px;
					display: none;
					animation: slideDown 0.3s ease;
				}
				
				.success-section.show {
					display: block;
				}
				
				.success-section h4 {
					color: #4facfe;
					margin: 0 0 15px 0;
					font-size: 16px;
					font-weight: 700;
					display: flex;
					align-items: center;
					gap: 8px;
				}
				
				.success-details {
					display: grid;
					grid-template-columns: repeat(2, 1fr);
					gap: 12px;
				}
				
				.detail-row {
					background: rgba(0,0,0,0.2);
					padding: 12px;
					border-radius: 6px;
					border: 1px solid rgba(255,255,255,0.1);
				}
				
				.detail-row strong {
					display: block;
					font-size: 11px;
					color: rgba(255,255,255,0.6);
					margin-bottom: 5px;
					text-transform: uppercase;
					letter-spacing: 0.5px;
				}
				
				.detail-row span {
					display: block;
					font-size: 14px;
					color: #4facfe;
					font-weight: 600;
				}
				
				/* Error Section */
				.error-section {
					margin-top: 20px;
					padding: 20px;
					background: rgba(255,59,48,0.1);
					border: 2px solid rgba(255,59,48,0.3);
					border-radius: 8px;
					display: none;
					animation: slideDown 0.3s ease;
				}
				
				.error-section.show {
					display: block;
				}
				
				@keyframes slideDown {
					from {
						opacity: 0;
						transform: translateY(-10px);
					}
					to {
						opacity: 1;
						transform: translateY(0);
					}
				}
				
				.error-section h4 {
					color: #ff3b30;
					margin: 0 0 10px 0;
					font-size: 16px;
					font-weight: 700;
					display: flex;
					align-items: center;
					gap: 8px;
				}
				
				.error-section p {
					color: rgba(255,255,255,0.9);
					margin: 0;
					font-size: 14px;
					line-height: 1.5;
					}
			</style>
		`;
		$('head').append(style);
	}

	bind_events() {
		const self = this;

		// Unbind any existing events first to prevent duplicates
		this.unbind_events();

		// Back to dashboard button
		this.page.main.find('#back-to-dashboard').on('click', () => {
			frappe.set_route('bin_tracker_dashboard');
		});

		// Auto-focus on batch barcode when page loads
		setTimeout(() => {
			this.page.main.find('#batch-barcode').focus();
		}, 100);

		// Validate on blur or Enter key
		this.page.main.find('#batch-barcode').on('blur keypress', function (e) {
			if (e.type === 'keypress' && e.which !== 13) return;
			if (e.type === 'keypress' && e.which === 13) {
				e.preventDefault();
				self.page.main.find('#rack-barcode').focus();
			}
			self.validate_inputs();
		});

		this.page.main.find('#rack-barcode').on('blur keypress', function (e) {
			if (e.type === 'keypress' && e.which !== 13) return;
			if (e.type === 'keypress' && e.which === 13) {
				e.preventDefault();
				if (self.validation_state.batch_valid && self.validation_state.rack_valid) {
					self.perform_check_out();
				}
			}
			self.validate_inputs();
		});

		// Clear validation when user starts typing
		this.page.main.find('#batch-barcode, #rack-barcode').on('input', function () {
			const field_type = $(this).attr('id') === 'batch-barcode' ? 'batch' : 'rack';
			const icon = field_type === 'batch' ? self.page.main.find('#batch-validation-icon') : self.page.main.find('#rack-validation-icon');

			icon.removeClass('show valid invalid');
			$(this).removeClass('valid invalid');

			// Reset validation state for this field
			if (field_type === 'batch') {
				self.validation_state.batch_valid = false;
			} else {
				self.validation_state.rack_valid = false;
				self.last_spoken_rack = null; // Allow speaking again if user modifies input
			}

			// Update submit button state
			self.page.main.find('#submit-check-out').prop('disabled',
				!(self.validation_state.batch_valid && self.validation_state.rack_valid)
			);
		});

		// Submit button click
		this.page.main.find('#submit-check-out').on('click', () => {
			self.perform_check_out();
		});

		// Reset button click
		this.page.main.find('#reset-btn').on('click', () => {
			self.reset_form();
		});
	}

	unbind_events() {
		// Unbind all events from the page to prevent memory leaks and conflicts
		this.page.main.find('#back-to-dashboard').off('click');
		this.page.main.find('#batch-barcode').off('blur keypress input');
		this.page.main.find('#rack-barcode').off('blur keypress input');
		this.page.main.find('#submit-check-out').off('click');
		this.page.main.find('#reset-btn').off('click');
	}

	speak(text) {
		if ('speechSynthesis' in window) {
			// Cancel any ongoing speech
			window.speechSynthesis.cancel();

			// Play chime sound before speaking using direct Audio object
			const chime = new Audio('/assets/frappe/sounds/chime.mp3');
			chime.play().catch(e => console.log('Chime play failed:', e));

			const utterance = new SpeechSynthesisUtterance(text);
			utterance.rate = 0.9;
			utterance.pitch = 1;

			// Small delay to let chime play a bit before speaking
			setTimeout(() => {
				window.speechSynthesis.speak(utterance);
			}, 500);
		}
	}

	extract_warehouse_from_rack(rack_barcode) {
		// Rack barcode format: {Warehouse}-{Rack ID}
		const lastHyphenIndex = rack_barcode.lastIndexOf('-');
		if (lastHyphenIndex > 0) {
			return rack_barcode.substring(0, lastHyphenIndex).trim();
		}
		return null;
	}

	validate_inputs() {
		const batch = $('#batch-barcode').val().trim();
		const rack = $('#rack-barcode').val().trim();

		// Don't validate if both fields are empty
		if (!batch && !rack) return;

		// Extract warehouse from rack barcode if rack is entered
		if (rack) {
			this.warehouse = this.extract_warehouse_from_rack(rack);
		}

		// Show validating state
		if (batch) {
			$('#batch-validation-icon').addClass('show validating').removeClass('valid invalid');
		}
		if (rack) {
			$('#rack-validation-icon').addClass('show validating').removeClass('valid invalid');
		}

		// Single API call to validate both fields
		frappe.call({
			method: 'smart_screens.smart_screens.api.bin_tracker.validate_check_out_inputs',
			args: {
				batch: batch || null,
				rack_id: rack || null,
				warehouse: this.warehouse
			},
			callback: (r) => {
				if (r.message) {
					const result = r.message;

					// Update batch validation
					if (batch) {
						const batch_icon = $('#batch-validation-icon');
						const batch_input = $('#batch-barcode');

						batch_icon.removeClass('validating');
						if (result.batch_valid) {
							batch_icon.addClass('valid').html('✓');
							batch_input.addClass('valid').removeClass('invalid');
							this.validation_state.batch_valid = true;
							this.batch = batch;
							this.item_code = result.item_code;
						} else {
							batch_icon.addClass('invalid').html('✗');
							batch_input.addClass('invalid').removeClass('valid');
							this.validation_state.batch_valid = false;

							// Show error message
							if (result.batch_message) {
								frappe.show_alert({
									message: `Batch: ${result.batch_message}`,
									indicator: 'red'
								}, 3);
							}
						}
					}

					// Update rack validation
					if (rack) {
						const rack_icon = $('#rack-validation-icon');
						const rack_input = $('#rack-barcode');

						rack_icon.removeClass('validating');
						if (result.rack_valid) {
							rack_icon.addClass('valid').html('✓');
							rack_input.addClass('valid').removeClass('invalid');
							this.validation_state.rack_valid = true;
							this.rack_id = result.rack_name;

							// Play rack name as audio - only if it's a new rack scan
							if (this.rack_id && this.rack_id !== this.last_spoken_rack) {
								this.speak(`Rack ${this.rack_id}`);
								this.last_spoken_rack = this.rack_id;
							}
						} else {
							rack_icon.addClass('invalid').html('✗');
							rack_input.addClass('invalid').removeClass('valid');
							this.validation_state.rack_valid = false;

							// Show error message
							if (result.rack_message) {
								frappe.show_alert({
									message: `Rack: ${result.rack_message}`,
									indicator: 'red'
								}, 3);
							}
						}
					}

					// Handle FIFO violation warning
					if (result.fifo_violation) {
						// Store FIFO info for use during checkout
						this.fifo_info = {
							fifo_batch: result.fifo_batch,
							fifo_rack: result.fifo_rack,
							fifo_rack_barcode: result.fifo_rack_barcode,
							fifo_message: result.fifo_message
						};

						// Show FIFO warning section
						$('#fifo-warning-message').html(
							`<strong>Batch ${result.fifo_batch}</strong> in rack ` +
							`<strong>${result.fifo_rack_barcode || result.fifo_rack}</strong> ` +
							`was created earlier and should be checked out first.`
						);
						$('#fifo-warning-section').addClass('show').show();
					} else {
						// Clear FIFO info
						this.fifo_info = null;
						$('#fifo-warning-section').removeClass('show').hide();
					}

					// Enable submit button only if both are valid
					$('#submit-check-out').prop('disabled', !result.can_submit);
				}
			},
			error: () => {
				// On error, mark as invalid
				if (batch) {
					$('#batch-validation-icon').removeClass('validating').addClass('invalid').html('✗');
					$('#batch-barcode').addClass('invalid').removeClass('valid');
					this.validation_state.batch_valid = false;
				}
				if (rack) {
					$('#rack-validation-icon').removeClass('validating').addClass('invalid').html('✗');
					$('#rack-barcode').addClass('invalid').removeClass('valid');
					this.validation_state.rack_valid = false;
				}
				$('#submit-check-out').prop('disabled', true);
			}
		});
	}

	perform_check_out(force_fifo_override = false) {
		const batch = $('#batch-barcode').val().trim();
		const rack = $('#rack-barcode').val().trim();

		// Use the warehouse that was set during validation, or extract it as a fallback
		const warehouse = this.warehouse || this.extract_warehouse_from_rack(rack);

		// Hide previous messages (but keep FIFO warning if doing override)
		$('#error-section, #success-section').removeClass('show').hide();
		if (!force_fifo_override) {
			$('#fifo-warning-section').removeClass('show').hide();
		}

		// Disable form during API call
		$('#submit-check-out').prop('disabled', true).html('<i class="fa fa-spinner fa-spin"></i> CHECKING OUT...');
		$('#batch-barcode, #rack-barcode').prop('disabled', true);

		frappe.call({
			method: 'smart_screens.smart_screens.api.bin_tracker.check_out_batch',
			args: {
				batch: this.batch || batch,
				rack_id: this.rack_id || rack,
				force_fifo_override: force_fifo_override ? 1 : 0
			},
			callback: (r) => {
				if (r.message && r.message.success) {
					// Success - show details
					const data = r.message;

					// Show FIFO override note if applicable
					if (data.fifo_override_used) {
						$('#fifo-warning-message').html(
							'<strong>FIFO Override Applied:</strong> ' + data.remarks
						);
						$('#fifo-warning-section').addClass('show').show();
					}

					// Show success message
					$('#success-item').text(data.item_code || this.item_code);
					$('#success-batch').text(batch);
					$('#success-rack').text(rack);
					$('#success-time').text(frappe.datetime.str_to_user(data.timestamp));
					$('#success-section').addClass('show').show();

					frappe.show_alert({
						message: `✅ CHECK-OUT SUCCESSFUL!`,
						indicator: 'green'
					}, 3);

					// Play success sound
					frappe.utils.play_sound('submit');

					// Auto-reset form after 3 seconds
					setTimeout(() => {
						this.reset_form();
					}, 3000);

				} else if (r.message && r.message.fifo_violation) {
					// FIFO Violation - show confirmation dialog
					const fifo_data = r.message;

					// Show FIFO warning
					$('#fifo-warning-message').html(
						`<strong>Batch ${fifo_data.fifo_batch}</strong> in rack ` +
						`<strong>${fifo_data.fifo_rack_barcode || fifo_data.fifo_rack}</strong> ` +
						`was created earlier and should be checked out first.`
					);
					$('#fifo-warning-section').addClass('show').show();

					// Show confirmation dialog
					frappe.confirm(
						`<div style="text-align: left;">
							<p><strong>FIFO Violation Detected!</strong></p>
							<p>You are trying to check out batch <strong>${fifo_data.scanned_batch}</strong>, 
							but batch <strong>${fifo_data.fifo_batch}</strong> in rack 
							<strong>${fifo_data.fifo_rack_barcode || fifo_data.fifo_rack}</strong> 
							was created earlier and should be checked out first.</p>
							<p>Do you want to proceed anyway?</p>
						</div>`,
						() => {
							// Yes - proceed with FIFO override
							this.perform_check_out(true);
						},
						() => {
							// No - cancel and re-enable form
							frappe.show_alert({
								message: 'Check-out cancelled. Please check out the older batch first.',
								indicator: 'orange'
							}, 5);
							this.enable_form();
						}
					);

				} else {
					// Other error from API
					const error_msg = r.message ? r.message.message : 'Check-out failed';

					frappe.show_alert({
						message: `❌ ${error_msg}`,
						indicator: 'red'
					}, 5);

					frappe.utils.play_sound('error');

					// Show error in the error section
					$('#error-message').text(error_msg);
					$('#error-section').addClass('show').show();

					// Re-enable form
					this.enable_form();
				}
			},
			error: (err) => {
				// Network or server error
				const error_details = err.message || 'Network error. Please try again.';

				frappe.show_alert({
					message: `❌ ${error_details}`,
					indicator: 'red'
				}, 5);

				frappe.utils.play_sound('error');

				// Show detailed error in the error section
				$('#error-message').html(`<strong>Error:</strong> ${error_details}`);
				$('#error-section').addClass('show').show();

				this.enable_form();
			}
		});
	}

	reset_form() {
		// Clear variables
		this.batch = null;
		this.rack_id = null;
		this.item_code = null;
		this.warehouse = null;
		this.fifo_info = null;
		this.last_spoken_rack = null;
		this.validation_state = {
			batch_valid: false,
			rack_valid: false
		};

		// Clear and enable inputs - remove all classes
		$('#batch-barcode').val('').prop('disabled', false).removeClass('valid invalid');
		$('#rack-barcode').val('').prop('disabled', false).removeClass('valid invalid');
		$('#submit-check-out').prop('disabled', true).html('<i class="fa fa-sign-out"></i> CHECK OUT');

		// Hide and reset validation icons
		$('#batch-validation-icon, #rack-validation-icon')
			.removeClass('show valid invalid validating')
			.html('');

		// Hide all message sections
		$('#error-section, #success-section, #fifo-warning-section').removeClass('show').hide();

		// Auto-focus back to batch field
		setTimeout(() => {
			$('#batch-barcode').focus();
		}, 100);
	}

	enable_form() {
		$('#batch-barcode, #rack-barcode').prop('disabled', false);
		$('#submit-check-out').prop('disabled', false).html('<i class="fa fa-sign-out"></i> CHECK OUT');
		$('#batch-barcode').focus();
	}
}
