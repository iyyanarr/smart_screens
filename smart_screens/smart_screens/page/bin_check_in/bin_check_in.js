// Copyright (c) 2025, Alphaworkz and contributors
// For license information, please see license.txt

frappe.pages['bin_check_in'].on_page_load = function (wrapper) {
	var page = frappe.ui.make_app_page({
		parent: wrapper,
		title: 'Bin Check-In',
		single_column: true
	});

	page.check_in_instance = new BinCheckInPage(page);
};

// Add on_page_show to handle navigation back to this page
frappe.pages['bin_check_in'].on_page_show = function (wrapper) {
	// Only reset the form if the instance already exists
	// Don't reload HTML or rebind events
	if (wrapper.page && wrapper.page.check_in_instance) {
		wrapper.page.check_in_instance.reset_form();
	}
};

// Add cleanup on page hide to prevent event conflicts
frappe.pages['bin_check_in'].on_page_hide = function (wrapper) {
	// Unbind all events to prevent conflicts when navigating away
	if (wrapper.page && wrapper.page.check_in_instance) {
		wrapper.page.check_in_instance.unbind_events();
	}
};

class BinCheckInPage {
	constructor(page) {
		this.page = page;
		this.warehouse = null; // Will be auto-extracted from rack barcode
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
		$('#bin-check-in-styles').remove();

		const styles = `
			<style id="bin-check-in-styles">
				/* Reset all Frappe containers for this page */
				body[data-route="bin_check_in"] .layout-main-section-wrapper {
					padding: 0 !important;
					margin: 0 !important;
				}
				
				body[data-route="bin_check_in"] .layout-main-section {
					padding: 0 !important;
					margin: 0 !important;
				}
				
				/* Main container */
				.check-in-container {
					width: 100%;
					min-height: calc(100vh - 50px);
					background: #2d3748; /* Dark navy background like dashboard */
					display: flex;
					flex-direction: column;
				}
				
				/* Green Header - Solid color */
				.check-in-header {
					background: #43e97b; /* Solid green - same as dashboard CHECK IN color */
					padding: 20px 30px;
					display: flex;
					align-items: center;
					justify-content: space-between;
					box-shadow: 0 4px 12px rgba(0,0,0,0.15);
				}
				
				.check-in-header h1 {
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
					background: #2d3748; /* Dark navy - contrasts with green */
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
				.check-in-content {
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
					border-color: #43e97b;
					background: rgba(67,233,123,0.1);
					box-shadow: 0 0 0 3px rgba(67,233,123,0.2);
				}
				
				.form-group input.valid {
					border-color: #43e97b;
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
					background: rgba(67,233,123,0.2);
					color: #43e97b;
				}
				
				.validation-icon.invalid {
					background: rgba(255,59,48,0.2);
					color: #ff3b30;
				}
				
				.validation-icon.validating {
					background: rgba(255,255,255,0.1);
					color: rgba(255,255,255,0.5);
				}
				
				.submit-btn {
					width: 100%;
					height: 55px;
					background: #43e97b; /* Same green as header */
					border: none;
					border-radius: 8px;
					color: white;
					font-size: 16px;
					font-weight: 700;
					cursor: pointer;
					transition: all 0.2s;
					text-transform: uppercase;
					letter-spacing: 1px;
				}
				
				.submit-btn:hover {
					background: #38f9d7; /* Lighter green on hover */
					transform: translateY(-2px);
					box-shadow: 0 6px 20px rgba(67,233,123,0.3);
				}
				
				.submit-btn:disabled {
					background: rgba(255,255,255,0.1);
					color: rgba(255,255,255,0.3);
					cursor: not-allowed;
					transform: none;
					box-shadow: none;
					}
				
				/* Error Message Section */
				.error-section {
					margin-top: 20px;
					padding: 20px;
					background: rgba(255,59,48,0.1);
					border: 2px solid rgba(255,59,48,0.3);
					border-radius: 8px;
					display: none;
				}
				
				.error-section.show {
					display: block;
					animation: slideDown 0.3s ease;
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

		$('head').append(styles);
	}

	load_html() {
		this.page.main.html(`
			<div class="check-in-container">
				<!-- Green Header -->
				<div class="check-in-header">
					<h1>
						<i class="fa fa-sign-in"></i>
						BIN CHECK-IN
					</h1>
					<button class="back-btn" id="back-to-dashboard">
						<i class="fa fa-arrow-left"></i>
						BACK TO DASHBOARD
					</button>
				</div>
				
				<!-- Main Content -->
				<div class="check-in-content">
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
						
						<button class="submit-btn" id="submit-check-in" disabled>
							<i class="fa fa-check-circle"></i> CHECK IN
						</button>
						
						<!-- Error Message Section -->
						<div class="error-section" id="error-section">
							<h4>
								<i class="fa fa-exclamation-triangle"></i>
								Error
							</h4>
							<p id="error-message"></p>
						</div>
					</div>
				</div>
			</div>
		`);

		// Bind events
		this.bind_events();
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

		// Validation state
		this.validation_state = {
			batch_valid: false,
			rack_valid: false
		};

		// Validate on blur or Enter key (single API call for both fields)
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
					self.perform_check_in();
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
			}

			// Update submit button state
			self.page.main.find('#submit-check-in').prop('disabled',
				!(self.validation_state.batch_valid && self.validation_state.rack_valid)
			);
		});

		// Submit button click
		this.page.main.find('#submit-check-in').on('click', () => {
			self.perform_check_in();
		});
	}

	unbind_events() {
		// Unbind all events from the page to prevent memory leaks and conflicts
		this.page.main.find('#back-to-dashboard').off('click');
		this.page.main.find('#batch-barcode').off('blur keypress input');
		this.page.main.find('#rack-barcode').off('blur keypress input');
		this.page.main.find('#submit-check-in').off('click');
	}

	speak(text) {
		if ('speechSynthesis' in window) {
			// Cancel any ongoing speech
			window.speechSynthesis.cancel();

			// Play chime sound before speaking using direct Audio object
			const chime = new Audio('/assets/frappe/sounds/chime.mp3');
			chime.play().catch(e => console.log('Chime play failed:', e));

			const utterance = new SpeechSynthesisUtterance(text);
			utterance.rate = 0.9; // Slightly slower for better clarity
			utterance.pitch = 1;

			// Small delay to let chime play a bit before speaking
			setTimeout(() => {
				window.speechSynthesis.speak(utterance);
			}, 500);
		}
	}

	validate_inputs() {
		const batch = this.page.main.find('#batch-barcode').val().trim();
		const rack = this.page.main.find('#rack-barcode').val().trim();

		// Don't validate if both fields are empty
		if (!batch && !rack) return;

		// Show validating state
		if (batch) {
			this.page.main.find('#batch-validation-icon').addClass('show validating').removeClass('valid invalid');
		}
		if (rack) {
			this.page.main.find('#rack-validation-icon').addClass('show validating').removeClass('valid invalid');
		}

		const self = this;

		// Single API call to validate both fields
		frappe.call({
			method: 'smart_screens.smart_screens.api.bin_tracker.validate_check_in_inputs',
			args: {
				batch: batch || null,
				rack_id: rack || null,
				warehouse: null  // Let the API figure out the warehouse from the rack
			},
			callback: (r) => {
				if (r.message) {
					const result = r.message;

					// Update batch validation
					if (batch) {
						const batch_icon = self.page.main.find('#batch-validation-icon');
						const batch_input = self.page.main.find('#batch-barcode');

						batch_icon.removeClass('validating');
						if (result.batch_valid) {
							batch_icon.addClass('valid').html('✓');
							batch_input.addClass('valid').removeClass('invalid');
							self.validation_state.batch_valid = true;
						} else {
							batch_icon.addClass('invalid').html('✗');
							batch_input.addClass('invalid').removeClass('valid');
							self.validation_state.batch_valid = false;

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
						const rack_icon = self.page.main.find('#rack-validation-icon');
						const rack_input = self.page.main.find('#rack-barcode');

						rack_icon.removeClass('validating');
						if (result.rack_valid) {
							rack_icon.addClass('valid').html('✓');
							rack_input.addClass('valid').removeClass('invalid');
							self.validation_state.rack_valid = true;
							// Store the rack name and warehouse for API calls
							self.rack_name = result.rack_name;
							self.warehouse = result.warehouse; // Get warehouse from API response

							// Play rack name as audio
							if (self.rack_name) {
								self.speak(`Rack ${self.rack_name}`);
							}
						} else {
							rack_icon.addClass('invalid').html('✗');
							rack_input.addClass('invalid').removeClass('valid');
							self.validation_state.rack_valid = false;

							// Show error message
							if (result.rack_message) {
								frappe.show_alert({
									message: `Rack: ${result.rack_message}`,
									indicator: 'red'
								}, 3);
							}
						}
					}

					// Enable submit button only if both are valid
					self.page.main.find('#submit-check-in').prop('disabled', !result.can_submit);
				}
			},
			error: () => {
				// On error, mark as invalid
				if (batch) {
					self.page.main.find('#batch-validation-icon').removeClass('validating').addClass('invalid').html('✗');
					self.page.main.find('#batch-barcode').addClass('invalid').removeClass('valid');
					self.validation_state.batch_valid = false;
				}
				if (rack) {
					self.page.main.find('#rack-validation-icon').removeClass('validating').addClass('invalid').html('✗');
					self.page.main.find('#rack-barcode').addClass('invalid').removeClass('valid');
					self.validation_state.rack_valid = false;
				}
				self.page.main.find('#submit-check-in').prop('disabled', true);
			}
		});
	}

	perform_check_in() {
		const batch = this.page.main.find('#batch-barcode').val().trim();
		const rack = this.page.main.find('#rack-barcode').val().trim();

		// Hide any previous error
		this.page.main.find('#error-section').removeClass('show');

		// Disable form during API call
		this.page.main.find('#submit-check-in').prop('disabled', true).html('<i class="fa fa-spinner fa-spin"></i> CHECKING IN...');
		this.page.main.find('#batch-barcode, #rack-barcode').prop('disabled', true);

		frappe.call({
			method: 'smart_screens.smart_screens.api.bin_tracker.check_in_batch',
			args: {
				batch: batch,
				rack_id: this.rack_name || rack,  // Use rack_name from validation if available
				warehouse: this.warehouse
			},
			callback: (r) => {
				if (r.message && r.message.success) {
					// Success - show details
					const data = r.message;

					frappe.show_alert({
						message: `✅ CHECK-IN SUCCESSFUL!<br>
							<strong>Item:</strong> ${data.item_code}<br>
							<strong>Batch:</strong> ${batch}<br>
							<strong>Rack:</strong> ${this.rack_name || rack}<br>
							<strong>Time:</strong> ${frappe.datetime.str_to_user(data.timestamp)}`,
						indicator: 'green'
					}, 5);

					// Play success sound
					frappe.utils.play_sound('submit');

					// Clear form and refocus
					this.reset_form();

				} else {
					// Error from API
					const error_msg = r.message ? r.message.message : 'Check-in failed';

					frappe.show_alert({
						message: `❌ ${error_msg}`,
						indicator: 'red'
					}, 5);

					frappe.utils.play_sound('error');

					// Show error in the error section
					this.page.main.find('#error-message').text(error_msg);
					this.page.main.find('#error-section').addClass('show');

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
				this.page.main.find('#error-message').html(`<strong>Error:</strong> ${error_details}`);
				this.page.main.find('#error-section').addClass('show');

				this.enable_form();
			}
		});
	}

	reset_form() {
		this.page.main.find('#batch-barcode').val('').prop('disabled', false).removeClass('valid invalid');
		this.page.main.find('#rack-barcode').val('').prop('disabled', false).removeClass('valid invalid');
		this.page.main.find('#submit-check-in').prop('disabled', true).html('<i class="fa fa-check-circle"></i> CHECK IN');

		// Reset validation icons
		this.page.main.find('#batch-validation-icon').removeClass('show valid invalid');
		this.page.main.find('#rack-validation-icon').removeClass('show valid invalid');

		// Reset validation state
		this.validation_state = {
			batch_valid: false,
			rack_valid: false
		};

		// Hide error message
		this.page.main.find('#error-section').removeClass('show');

		// Auto-focus back to batch field
		setTimeout(() => {
			this.page.main.find('#batch-barcode').focus();
		}, 100);
	}

	enable_form() {
		this.page.main.find('#batch-barcode, #rack-barcode').prop('disabled', false);
		this.page.main.find('#submit-check-in').prop('disabled', false).html('<i class="fa fa-check-circle"></i> CHECK IN');
		this.page.main.find('#batch-barcode').focus();
	}
}
