// Initialize the page object if it doesn't exist
if (!frappe.pages) {
    frappe.pages = {};
}
if (!frappe.pages['mixing_log']) {
    frappe.pages['mixing_log'] = {};
}

frappe.pages['mixing_log'].on_page_load = function(wrapper) {
    var page = frappe.ui.make_app_page({
        parent: wrapper,
        title: 'Mixing Log',
        single_column: true
    });

    // Create the main content area
    page.main = $('<div class="mixing-log-main"></div>').appendTo(page.body);
    
    // Initialize the mixing log interface
    new MixingLogInterface(page);
};

class MixingLogInterface {
    constructor(page) {
        this.page = page;
        this.setup_interface();
        this.setup_scanner();
    }

    setup_interface() {
        // Create the HTML structure with full width
        this.page.main.html(`
            <div class="mixing-log-container">
                <div class="row">
                    <div class="col-md-6">
                        <div class="card">
                            <div class="card-header">
                                <h4>Mixing Log Scanner</h4>
                            </div>
                            <div class="card-body">
                                <div class="form-group">
                                    <label for="batch-scanner">Batch Scan</label>
                                    <div class="input-group">
                                        <input type="text" class="form-control" id="batch-scanner" 
                                               placeholder="Scan or enter batch barcode" autofocus>
                                        <div class="input-group-btn">
                                            <button class="btn btn-primary" id="manual-entry-btn">
                                                Manual Entry
                                            </button>
                                        </div>
                                    </div>
                                </div>
                                
                                <div class="scan-result" id="scan-result" style="display: none;">
                                    <div class="alert alert-success">
                                        <h5>Scan Result:</h5>
                                        <table class="table table-borderless">
                                            <tr>
                                                <td><strong>Lot Number:</strong></td>
                                                <td id="result-lot-number"></td>
                                            </tr>
                                            <tr>
                                                <td><strong>Batch Number:</strong></td>
                                                <td id="result-batch-number"></td>
                                            </tr>
                                            <tr>
                                                <td><strong>Item Code:</strong></td>
                                                <td id="result-item-code"></td>
                                            </tr>
                                            <tr>
                                                <td><strong>Item Name:</strong></td>
                                                <td id="result-item-name"></td>
                                            </tr>
                                            <tr>
                                                <td><strong>Item Group:</strong></td>
                                                <td id="result-item-group"></td>
                                            </tr>
                                            <tr>
                                                <td><strong>Date & Time:</strong></td>
                                                <td id="result-datetime"></td>
                                            </tr>
                                        </table>
                                    </div>
                                </div>

                                <div class="error-result" id="error-result" style="display: none;">
                                    <div class="alert alert-danger">
                                        <span id="error-message"></span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                    
                    <!-- Recent Logs in right column -->
                    <div class="col-md-6">
                        <div class="card">
                            <div class="card-header">
                                <h5>Recent Mixing Logs</h5>
                            </div>
                            <div class="card-body">
                                <div id="recent-logs"></div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `);

        this.load_recent_logs();
    }

    setup_scanner() {
        const scanner_input = this.page.main.find('#batch-scanner');
        const manual_btn = this.page.main.find('#manual-entry-btn');

        // Handle Enter key press for scanning
        scanner_input.on('keypress', (e) => {
            if (e.which === 13) { // Enter key
                const scanned_value = scanner_input.val().trim();
                if (scanned_value) {
                    this.process_scan(scanned_value);
                    scanner_input.val(''); // Clear input after processing
                }
            }
        });

        // Handle manual entry button
        manual_btn.on('click', () => {
            const manual_value = scanner_input.val().trim();
            if (manual_value) {
                this.process_scan(manual_value);
                scanner_input.val(''); // Clear input after processing
            } else {
                frappe.msgprint('Please enter a barcode value');
            }
        });

        // Auto-focus on the input field
        scanner_input.focus();
        
        // Refocus when clicking anywhere on the page
        $(document).on('click', () => {
            setTimeout(() => scanner_input.focus(), 100);
        });
    }

    process_scan(scanned_value) {
        // Show loading state
        this.show_loading();

        // Call API to get batch details and create mixing log
        frappe.call({
            method: 'smart_screens.smart_screens.api.mixing_log.process_batch_scan',
            args: {
                scan_lot_number: scanned_value
            },
            callback: (response) => {
                if (response.message && response.message.success) {
                    this.show_success(response.message.data);
                    this.load_recent_logs(); // Refresh recent logs
                } else if (response.message && response.message.duplicate) {
                    // Handle duplicate scan
                    this.show_error(
                        response.message.error, 
                        true, 
                        response.message.existing_data
                    );
                } else {
                    this.show_error(response.message ? response.message.error : 'Unknown error occurred');
                }
            },
            error: (error) => {
                this.show_error(error.message || 'Failed to process scan');
            }
        });
    }

    show_loading() {
        this.page.main.find('#scan-result').hide();
        this.page.main.find('#error-result').hide();
        frappe.show_progress('Processing scan...', 50, 100);
    }

    show_success(data) {
        frappe.hide_progress();
        
        // Populate result fields
        this.page.main.find('#result-lot-number').text(data.scan_lot_number);
        this.page.main.find('#result-batch-number').text(data.batch_number);
        this.page.main.find('#result-item-code').text(data.item_code);
        this.page.main.find('#result-item-name').text(data.item_name);
        this.page.main.find('#result-item-group').text(data.item_group);
        this.page.main.find('#result-datetime').text(frappe.datetime.str_to_user(data.log_datetime));

        // Show success result
        this.page.main.find('#error-result').hide();
        this.page.main.find('#scan-result').show();

        // Auto-hide after 3 seconds and refocus
        setTimeout(() => {
            this.page.main.find('#scan-result').fadeOut();
            this.page.main.find('#batch-scanner').focus();
        }, 3000);
    }

    show_error(error_message, is_duplicate = false, existing_data = null) {
        frappe.hide_progress();
        
        if (is_duplicate && existing_data) {
            // Show duplicate warning with existing data
            this.page.main.find('#error-result').removeClass('alert alert-danger').addClass('alert alert-warning');
            
            let duplicate_html = `
                <strong>Duplicate Scan Detected!</strong><br>
                <span>${error_message}</span><br><br>
                <strong>Previously scanned details:</strong><br>
                <table class="table table-borderless" style="margin-top: 10px;">
                    <tr><td><strong>Lot Number:</strong></td><td>${existing_data.scan_lot_number}</td></tr>
                    <tr><td><strong>Batch Number:</strong></td><td>${existing_data.batch_number}</td></tr>
                    <tr><td><strong>Item Code:</strong></td><td>${existing_data.item_code}</td></tr>
                    <tr><td><strong>Item Name:</strong></td><td>${existing_data.item_name}</td></tr>
                    <tr><td><strong>Item Group:</strong></td><td>${existing_data.item_group}</td></tr>
                    <tr><td><strong>Original Scan Time:</strong></td><td>${frappe.datetime.str_to_user(existing_data.log_datetime)}</td></tr>
                </table>
            `;
            this.page.main.find('#error-message').html(duplicate_html);
        } else {
            // Show regular error
            this.page.main.find('#error-result').removeClass('alert alert-warning').addClass('alert alert-danger');
            this.page.main.find('#error-message').text(error_message);
        }
        
        this.page.main.find('#scan-result').hide();
        this.page.main.find('#error-result').show();

        // Auto-hide error after 8 seconds for duplicates (longer to read), 5 seconds for regular errors
        const hideTimeout = is_duplicate ? 8000 : 5000;
        setTimeout(() => {
            this.page.main.find('#error-result').fadeOut();
            this.page.main.find('#batch-scanner').focus();
        }, hideTimeout);
    }

    load_recent_logs() {
        frappe.call({
            method: 'smart_screens.smart_screens.api.mixing_log.get_recent_logs',
            callback: (response) => {
                if (response.message) {
                    this.render_recent_logs(response.message);
                }
            }
        });
    }

    render_recent_logs(logs) {
        const logs_container = this.page.main.find('#recent-logs');
        
        if (logs.length === 0) {
            logs_container.html('<p class="text-muted">No recent logs found.</p>');
            return;
        }

        let html = `
            <div class="table-responsive">
                <table class="table table-striped table-condensed">
                    <thead>
                        <tr>
                            <th>Lot Number</th>
                            <th>Batch Number</th>
                            <th>Item Code</th>
                            <th>Item Group</th>
                            <th>Date & Time</th>
                        </tr>
                    </thead>
                    <tbody>
        `;

        logs.forEach(log => {
            html += `
                <tr>
                    <td>${log.scan_lot_number}</td>
                    <td>${log.batch_number || ''}</td>
                    <td>${log.item_code || ''}</td>
                    <td>${log.item_group || ''}</td>
                    <td>${frappe.datetime.str_to_user(log.log_datetime)}</td>
                </tr>
            `;
        });

        html += '</tbody></table></div>';
        logs_container.html(html);
    }
}