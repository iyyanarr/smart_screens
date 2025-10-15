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
                    
                    // ✅ FIX: Store lot_details before reset to use in print dialog
                    const lot_details_copy = {
                        item_code: this.lot_details.item_code,
                        batch_no: this.lot_details.batch_no,
                        qty: this.lot_details.qty,
                        uom: this.lot_details.uom,
                        warehouse: this.lot_details.warehouse
                    };
                    
                    const user_settings_copy = {
                        default_warehouse: this.user_settings.default_warehouse,
                        target_warehouse: this.user_settings.target_warehouse
                    };
                    
                    frappe.show_alert({
                        message: __("Sub-Lot created and submitted successfully: " + r.message.name),
                        indicator: 'green'
                    }, 10);
                    
                    // ✅ FIX: Reset form BEFORE showing the dialog
                    this.reset_form();
                    
                    // Show success dialog with Print Label and View options
                    frappe.msgprint({
                        title: __('Sub-Lot Created'),
                        message: `
                            <div class="text-center">
                                <i class="fa fa-check-circle text-success" style="font-size: 48px;"></i>
                                <h4 class="mt-3">Sub-Lot Created & Submitted Successfully!</h4>
                                <p><strong>Sub-Lot Number:</strong> ${r.message.name}</p>
                                <p><strong>Batch:</strong> ${sublot_data.new_batch_number}</p>
                                <p><strong>Quantity:</strong> ${sublot_data.processed_qty} ${lot_details_copy.uom}</p>
                                <p class="text-success mt-2"><i class="fa fa-check"></i> Document Status: <strong>Submitted</strong></p>
                            </div>
                        `,
                        primary_action: {
                            label: __('Print Label'),
                            action: () => {
                                this.print_sublot_label(r.message, sublot_data, lot_details_copy, user_settings_copy);
                            }
                        },
                        secondary_action: {
                            label: __('View Sub-Lot'),
                            action: () => {
                                frappe.set_route("Form", "Sub Lot Entry", r.message.name);
                            }
                        }
                    });
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
    
    print_sublot_label(doc, sublot_data, lot_details, user_settings) {
        const print_dialog = new frappe.ui.Dialog({
            title: __('Print Sub-Lot Label'),
            size: 'large',
            fields: [
                {
                    fieldtype: 'HTML',
                    fieldname: 'label_preview',
                    options: this.generate_label_preview_html(doc, sublot_data, lot_details, user_settings)
                },
                {
                    fieldtype: 'Section Break'
                },
                {
                    fieldtype: 'Int',
                    fieldname: 'copies',
                    label: __('Number of Copies'),
                    default: 1,
                    reqd: 1
                }
            ],
            primary_action_label: __('Print'),
            primary_action: (values) => {
                this.print_label_to_printer(doc, sublot_data, values.copies, lot_details, user_settings);
                print_dialog.hide();
            }
        });
        
        print_dialog.show();
    }
    
    generate_label_preview_html(doc, sublot_data, lot_details, user_settings) {
        // ✅ FIX: Use passed lot_details parameter instead of this.lot_details
        let barcode_img_src = '';
        if (sublot_data.barcode_image) {
            if (sublot_data.barcode_image.startsWith('data:')) {
                barcode_img_src = sublot_data.barcode_image;
            } else {
                barcode_img_src = `data:image/png;base64,${sublot_data.barcode_image}`;
            }
        }
        
        return `
            <div class="label-container" style="border: 2px solid #333; padding: 20px; max-width: 500px; margin: 0 auto; background: white; font-family: Arial, sans-serif;">
                <div style="text-align: center; border-bottom: 2px solid #333; padding-bottom: 10px; margin-bottom: 15px;">
                    <h3 style="margin: 0; font-size: 20px; font-weight: bold;">SHREE POLYMER</h3>
                    <p style="margin: 5px 0; font-size: 12px;">Sub-Lot Label</p>
                </div>
                
                <div style="text-align: center; margin: 15px 0; padding: 15px; background: #f9f9f9; border: 1px solid #ddd;">
                    <div style="font-weight: bold; margin-bottom: 10px; color: #333;">SUB-LOT NUMBER</div>
                    ${barcode_img_src ? 
                        `<img src="${barcode_img_src}" alt="Barcode" style="max-width: 100%; height: 80px; display: block; margin: 0 auto;" />` : 
                        `<div style="background: #e0e0e0; padding: 20px; font-size: 24px; font-weight: bold; letter-spacing: 2px;">${sublot_data.new_batch_number}</div>`
                    }
                    <p style="margin: 10px 0 0 0; font-size: 18px; font-weight: bold;">${sublot_data.sub_lot_number}</p>
                </div>
                
                <div style="margin-top: 15px; font-size: 14px; line-height: 1.8;">
                    <table style="width: 100%; border-collapse: collapse;">
                        <tr>
                            <td style="padding: 8px; border-bottom: 1px solid #ddd;"><strong>Item Code:</strong></td>
                            <td style="padding: 8px; border-bottom: 1px solid #ddd;">${lot_details.item_code}</td>
                        </tr>
                        <tr>
                            <td style="padding: 8px; border-bottom: 1px solid #ddd;"><strong>Batch No:</strong></td>
                            <td style="padding: 8px; border-bottom: 1px solid #ddd;">${sublot_data.new_batch_number}</td>
                        </tr>
                        <tr>
                            <td style="padding: 8px; border-bottom: 1px solid #ddd;"><strong>Quantity:</strong></td>
                            <td style="padding: 8px; border-bottom: 1px solid #ddd;">${sublot_data.processed_qty} ${lot_details.uom}</td>
                        </tr>
                        <tr>
                            <td style="padding: 8px; border-bottom: 1px solid #ddd;"><strong>Source WH:</strong></td>
                            <td style="padding: 8px; border-bottom: 1px solid #ddd; font-size: 11px;">${user_settings.default_warehouse || 'N/A'}</td>
                        </tr>
                        <tr>
                            <td style="padding: 8px; border-bottom: 1px solid #ddd;"><strong>Target WH:</strong></td>
                            <td style="padding: 8px; border-bottom: 1px solid #ddd; font-size: 11px;">${user_settings.target_warehouse || 'N/A'}</td>
                        </tr>
                        <tr>
                            <td style="padding: 8px; border-bottom: 1px solid #ddd;"><strong>Date:</strong></td>
                            <td style="padding: 8px; border-bottom: 1px solid #ddd;">${frappe.datetime.str_to_user(frappe.datetime.now_date())}</td>
                        </tr>
                        <tr>
                            <td style="padding: 8px;"><strong>Created By:</strong></td>
                            <td style="padding: 8px; font-size: 11px;">${frappe.session.user}</td>
                        </tr>
                    </table>
                </div>
                
                <div style="margin-top: 15px; padding-top: 10px; border-top: 2px solid #333; text-align: center; font-size: 10px; color: #666;">
                    <p style="margin: 0;">Stock Entry: ${sublot_data.stock_entry_name}</p>
                    <p style="margin: 5px 0 0 0;">Sub-Lot Entry: ${doc.name}</p>
                </div>
            </div>
        `;
    }
    
    print_label_to_printer(doc, sublot_data, copies, lot_details, user_settings) {
        const label_html = this.generate_label_preview_html(doc, sublot_data, lot_details, user_settings);
        
        const print_window = window.open('', '_blank');
        
        print_window.document.write(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>Print Sub-Lot Label - ${sublot_data.sub_lot_number}</title>
                <style>
                    @media print {
                        body { margin: 0; padding: 10mm; }
                        .label-container { page-break-after: always; }
                        .label-container:last-child { page-break-after: auto; }
                    }
                    body { font-family: Arial, sans-serif; }
                    @page { size: A4 portrait; margin: 1cm; }
                </style>
            </head>
            <body>
                ${Array(copies).fill(label_html).join('')}
                <script>
                    window.onload = function() {
                        window.print();
                        setTimeout(function() { window.close(); }, 100);
                    };
                </script>
            </body>
            </html>
        `);
        
        print_window.document.close();
        
        frappe.show_alert({
            message: __('Printing {0} label(s)...', [copies]),
            indicator: 'blue'
        }, 3);
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
