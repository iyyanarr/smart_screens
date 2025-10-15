/**
 * Sub-Lot Creation Center - Individual Page
 * Standalone page for creating sub-lots from main production lots
 */

frappe.pages['sublot-creation'].on_page_load = function(wrapper) {
    var page = frappe.ui.make_app_page({
        parent: wrapper,
        title: 'Sub-Lot Creation Center',
        single_column: true
    });
    
    // Show location selector first
    FinishingCommon.showLocationSelector(page, (locationData) => {
        new SubLotCreationPage(page, locationData);
    });
};

class SubLotCreationPage {
    constructor(page, locationData) {
        this.page = page;
        this.wrapper = $(page.wrapper);
        this.user_settings = locationData;
        
        this.lot_details = null;
        this.bom_details = null;
        this.sublot_details = null;
        
        FinishingCommon.addFactoryStyles();
        this.make();
    }
    
    make() {
        this.wrapper.find('.page-content').empty();
        
        this.add_header_section();
        this.add_sublot_entry_section();
        this.add_information_section();
    }
    
    add_header_section() {
        $(`<div class="page-head-content mb-4">
            <p class="text-muted" style="font-size: 16px;">
                Create sub-lots from main production lots for further processing.
                Scan the lot number, enter quantity, and create sub-lots with automatic batch generation.
            </p>
        </div>`).appendTo(this.wrapper.find('.page-content'));
    }
    
    add_sublot_entry_section() {
        this.sublot_section = $(`
            <div class="factory-section">
                <div class="factory-section-head">
                    <i class="fa fa-cube mr-2"></i>Sub-Lot Creation
                </div>
                <div class="section-body">
                    <div class="row">
                        <div class="col-md-6">
                            <div class="factory-form-group">
                                <label class="factory-label">
                                    <i class="fa fa-barcode mr-2"></i>Scan Lot Number
                                </label>
                                <div class="input-group">
                                    <input type="text" class="form-control factory-input" 
                                           id="scan_lot" placeholder="Scan or enter lot number"
                                           autocomplete="off">
                                    <div class="input-group-append">
                                        <button class="btn btn-primary factory-btn-validate" id="validate_lot_btn">
                                            <i class="fa fa-check mr-2"></i>Validate
                                        </button>
                                    </div>
                                </div>
                                <div id="lot_validation_result" class="factory-validation-result"></div>
                            </div>
                        </div>
                        
                        <div class="col-md-6">
                            <div class="factory-form-group">
                                <label class="factory-label">
                                    <i class="fa fa-balance-scale mr-2"></i>Quantity
                                </label>
                                <input type="number" class="form-control factory-input" 
                                       id="sublot_qty" placeholder="Enter quantity" 
                                       step="0.01" disabled>
                                <small class="text-muted">Available: <span id="available_qty">-</span></small>
                            </div>
                        </div>
                    </div>
                    
                    <div class="row mt-4">
                        <div class="col-12 text-center">
                            <button class="btn btn-primary factory-btn" id="create_sublot_btn" disabled>
                                <i class="fa fa-plus-circle mr-2"></i>Create Sub-Lot
                            </button>
                            <button class="btn btn-secondary factory-btn" id="reset_form_btn">
                                <i class="fa fa-refresh mr-2"></i>Reset
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `).appendTo(this.wrapper.find('.page-content'));
        
        this.attach_event_handlers();
    }
    
    add_information_section() {
        FinishingCommon.createInfoSection(
            this.wrapper.find('.page-content'),
            this.user_settings,
            "Current Settings"
        );
    }
    
    attach_event_handlers() {
        // Validate lot on Enter key
        this.sublot_section.find('#scan_lot').on('keypress', (e) => {
            if (e.which === 13) {
                e.preventDefault();
                this.validate_lot();
            }
        });
        
        // Validate lot on button click
        this.sublot_section.find('#validate_lot_btn').on('click', () => {
            this.validate_lot();
        });
        
        // Create sub-lot
        this.sublot_section.find('#create_sublot_btn').on('click', () => {
            this.create_sublot();
        });
        
        // Reset form
        this.sublot_section.find('#reset_form_btn').on('click', () => {
            this.reset_form();
        });
    }
    
    validate_lot() {
        const lot_number = this.sublot_section.find('#scan_lot').val().trim();
        
        if (!lot_number) {
            frappe.msgprint(__("Please scan or enter a lot number"));
            return;
        }
        
        const result_div = this.sublot_section.find('#lot_validation_result');
        result_div.html('<div class="alert alert-info">Validating lot...</div>');
        
        FinishingCommon.validateLot(lot_number, this.user_settings, (error, data) => {
            if (error) {
                result_div.html(`<div class="alert alert-danger">
                    <i class="fa fa-times-circle mr-2"></i>${error}
                </div>`);
                this.lot_details = null;
                this.sublot_section.find('#sublot_qty').prop('disabled', true);
                this.sublot_section.find('#create_sublot_btn').prop('disabled', true);
            } else {
                // Store lot details with normalized field names
                this.lot_details = {
                    item_code: data.item_code,
                    batch_no: data.batch_no,
                    qty: data.batch_quantity || 0,  // Use batch_quantity from backend
                    uom: data.uom || 'Nos',  // Default to 'Nos' if UOM not provided
                    warehouse: data.warehouse,
                    stock_entry: data.stock_entry
                };
                
                result_div.html(`<div class="alert alert-success">
                    <i class="fa fa-check-circle mr-2"></i>Lot validated successfully!
                    <div class="mt-2">
                        <strong>Item:</strong> ${this.lot_details.item_code}<br>
                        <strong>Batch:</strong> ${this.lot_details.batch_no}<br>
                        <strong>Available:</strong> ${this.lot_details.qty} ${this.lot_details.uom}
                    </div>
                </div>`);
                
                this.sublot_section.find('#available_qty').text(`${this.lot_details.qty} ${this.lot_details.uom}`);
                this.sublot_section.find('#sublot_qty')
                    .prop('disabled', false)
                    .attr('max', this.lot_details.qty)
                    .focus();
                this.sublot_section.find('#create_sublot_btn').prop('disabled', false);
                
                // Fetch BOM details
                this.fetch_bom_details(this.lot_details.item_code);
            }
        });
    }
    
    fetch_bom_details(item_code) {
        FinishingCommon.fetchBOM(item_code, (error, bom) => {
            if (!error) {
                this.bom_details = bom;
                console.log("BOM fetched:", bom);
            }
        });
    }
    
    create_sublot() {
        if (!this.lot_details) {
            frappe.msgprint(__("Please validate a lot first"));
            return;
        }
        
        const sublot_qty = parseFloat(this.sublot_section.find('#sublot_qty').val());
        
        if (!sublot_qty || sublot_qty <= 0) {
            frappe.msgprint(__("Please enter a valid quantity"));
            return;
        }
        
        if (sublot_qty > this.lot_details.qty) {
            frappe.msgprint(__("Quantity cannot exceed available quantity"));
            return;
        }
        
        frappe.call({
            method: "smart_screens.smart_screens.utils.generate_sublot.generate_sublot",
            args: {
                batch_number: this.lot_details.batch_no,
                qty: sublot_qty,
                source_warehouse: this.user_settings.default_warehouse,
                target_warehouse: this.user_settings.target_warehouse,
                uom: this.lot_details.uom
            },
            freeze: true,
            freeze_message: __("Creating sub-lot..."),
            callback: (r) => {
                if (r.message && r.message.status === "success") {
                    this.create_sublot_entry(r.message, sublot_qty);
                } else {
                    frappe.msgprint(__("Failed to generate sub-lot"));
                }
            }
        });
    }
    
    create_sublot_entry(sublot_data, qty) {
        frappe.call({
            method: "frappe.client.insert",
            args: {
                doc: {
                    doctype: "Sub Lot Entry",
                    sslnscaned_sub_lot_number: sublot_data.parent_batch,
                    sublot_qty: sublot_data.processed_qty,
                    final_sublot_qty: sublot_data.processed_qty,
                    uom: this.lot_details.uom,
                    item_code: this.lot_details.item_code,
                    batch: this.lot_details.batch_no,
                    sublot_number: sublot_data.sub_lot_number,
                    sublot_batch: sublot_data.new_batch_number,
                    stockentry_ref: sublot_data.stock_entry_name,
                    barcode: sublot_data.barcode_image,
                    source_warehouse: this.user_settings.default_warehouse,
                    target_warehouse: this.user_settings.target_warehouse
                }
            },
            callback: (r) => {
                if (r.message) {
                    // Document created successfully, now submit it
                    this.submit_sublot_entry(r.message, sublot_data);
                }
            }
        });
    }
    
    submit_sublot_entry(doc, sublot_data) {
        frappe.call({
            method: "frappe.client.submit",
            args: {
                doc: doc
            },
            callback: (r) => {
                if (r.message) {
                    this.sublot_details = r.message;
                    
                    frappe.show_alert({
                        message: __("Sub-Lot created and submitted successfully: " + r.message.name),
                        indicator: 'green'
                    }, 10);
                    
                    // Show success dialog with option to view
                    frappe.msgprint({
                        title: __('Sub-Lot Created'),
                        message: `
                            <div class="text-center">
                                <i class="fa fa-check-circle text-success" style="font-size: 48px;"></i>
                                <h4 class="mt-3">Sub-Lot Created & Submitted Successfully!</h4>
                                <p><strong>Sub-Lot Number:</strong> ${r.message.name}</p>
                                <p><strong>Batch:</strong> ${sublot_data.new_batch_number}</p>
                                <p><strong>Quantity:</strong> ${sublot_data.processed_qty} ${this.lot_details.uom}</p>
                                <p class="text-success mt-2"><i class="fa fa-check"></i> Document Status: <strong>Submitted</strong></p>
                            </div>
                        `,
                        primary_action: {
                            label: __('View Sub-Lot'),
                            action: () => {
                                frappe.set_route("Form", "Sub Lot Entry", r.message.name);
                            }
                        }
                    });
                    
                    this.reset_form();
                } else {
                    frappe.msgprint({
                        title: __('Submission Failed'),
                        message: __('Sub-Lot was created but could not be submitted. Please submit it manually.'),
                        indicator: 'orange'
                    });
                }
            },
            error: (r) => {
                frappe.msgprint({
                    title: __('Submission Error'),
                    message: __('Sub-Lot was created but submission failed: ') + (r.message || 'Unknown error'),
                    indicator: 'red'
                });
            }
        });
    }
    
    reset_form() {
        this.lot_details = null;
        this.bom_details = null;
        this.sublot_details = null;
        
        this.sublot_section.find('#scan_lot').val('');
        this.sublot_section.find('#sublot_qty').val('').prop('disabled', true);
        this.sublot_section.find('#lot_validation_result').html('');
        this.sublot_section.find('#available_qty').text('-');
        this.sublot_section.find('#create_sublot_btn').prop('disabled', true);
        this.sublot_section.find('#scan_lot').focus();
    }
}
