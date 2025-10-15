/**
 * SPP Inspection Entry - Individual Page
 * Standalone page for quality inspection of sub-lots
 */

frappe.pages['quality-inspection-entry'].on_page_load = function(wrapper) {
    var page = frappe.ui.make_app_page({
        parent: wrapper,
        title: 'SPP Inspection Entry',
        single_column: true
    });
    
    FinishingCommon.showLocationSelector(page, (locationData) => {
        new QualityInspectionPage(page, locationData);
    });
};

class QualityInspectionPage {
    constructor(page, locationData) {
        this.page = page;
        this.wrapper = $(page.wrapper);
        this.user_settings = locationData;
        
        this.sublot_details = null;
        this.inspector_details = null;
        this.allowed_inspection_types = ['Final Visual Inspection', 'Dimensional Inspection', 'First Piece Inspection'];
        
        FinishingCommon.addFactoryStyles();
        this.make();
    }
    
    make() {
        this.wrapper.find('.page-content').empty();
        
        this.add_header_section();
        this.add_inspection_section();
        this.add_information_section();
    }
    
    add_header_section() {
        $(`<div class="page-head-content mb-4">
            <p class="text-muted" style="font-size: 16px;">
                Perform quality inspections on sub-lots before final processing.
                Scan sub-lot, validate inspector, select inspection type, and create inspection entry.
            </p>
        </div>`).appendTo(this.wrapper.find('.page-content'));
    }
    
    add_inspection_section() {
        this.inspection_section = $(`
            <div class="factory-section">
                <div class="factory-section-head">
                    <i class="fa fa-search mr-2"></i>Quality Inspection Entry
                </div>
                <div class="section-body">
                    <!-- Sub-lot Scanner -->
                    <div class="row mb-4">
                        <div class="col-md-8">
                            <div class="factory-form-group">
                                <label class="factory-label">
                                    <i class="fa fa-barcode mr-2"></i>Scan Sub-Lot Number
                                </label>
                                <div class="input-group">
                                    <input type="text" class="form-control factory-input" 
                                           id="insp_scan_sublot" placeholder="Scan or enter sub-lot number"
                                           autocomplete="off">
                                    <div class="input-group-append">
                                        <button class="btn btn-primary factory-btn-validate" id="insp_validate_sublot_btn">
                                            <i class="fa fa-check mr-2"></i>Validate
                                        </button>
                                    </div>
                                </div>
                                <div id="insp_sublot_validation_result" class="factory-validation-result"></div>
                            </div>
                        </div>
                        <div class="col-md-4">
                            <div id="insp_sublot_info_display" class="card mt-4" style="display: none;">
                                <div class="card-body p-3">
                                    <div class="factory-compact-info">
                                        <div class="factory-compact-row">
                                            <span class="factory-compact-label">Item:</span>
                                            <span class="factory-compact-value" id="insp_display_item_code">-</span>
                                        </div>
                                        <div class="factory-compact-row">
                                            <span class="factory-compact-label">Batch:</span>
                                            <span class="factory-compact-value" id="insp_display_batch">-</span>
                                        </div>
                                        <div class="factory-compact-row">
                                            <span class="factory-compact-label">Quantity:</span>
                                            <span class="factory-compact-value" id="insp_display_qty">-</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                    
                    <hr>
                    
                    <!-- Inspection Details Section -->
                    <div id="inspection_details_section" style="display: none;">
                        <h5 class="mb-3">Inspection Details</h5>
                        
                        <div class="row">
                            <div class="col-md-6">
                                <div class="factory-form-group">
                                    <label class="factory-label">
                                        <i class="fa fa-user-md mr-2"></i>Scan Inspector ID
                                    </label>
                                    <div class="input-group">
                                        <input type="text" class="form-control factory-input" 
                                               id="insp_scan_employee" placeholder="Scan inspector ID"
                                               autocomplete="off">
                                        <div class="input-group-append">
                                            <button class="btn btn-primary factory-btn-validate" id="insp_validate_employee_btn">
                                                <i class="fa fa-check mr-2"></i>Validate
                                            </button>
                                        </div>
                                    </div>
                                    <div id="insp_employee_validation_result" class="factory-validation-result"></div>
                                </div>
                            </div>
                            
                            <div class="col-md-6">
                                <div class="factory-form-group">
                                    <label class="factory-label">
                                        <i class="fa fa-clipboard-check mr-2"></i>Inspection Type
                                    </label>
                                    <select class="form-control factory-input" id="inspection_type_select">
                                        <option value="">Select inspection type...</option>
                                        <option value="Final Visual Inspection">Final Visual Inspection</option>
                                        <option value="Dimensional Inspection">Dimensional Inspection</option>
                                        <option value="First Piece Inspection">First Piece Inspection</option>
                                    </select>
                                </div>
                            </div>
                        </div>
                        
                        <!-- Action Buttons -->
                        <div class="row mt-4">
                            <div class="col-12 text-center">
                                <button class="btn btn-success factory-btn" id="create_inspection_btn" disabled>
                                    <i class="fa fa-file-text mr-2"></i>Create Inspection Entry
                                </button>
                                <button class="btn btn-secondary factory-btn" id="reset_inspection_btn">
                                    <i class="fa fa-refresh mr-2"></i>Reset
                                </button>
                            </div>
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
        // Validate sublot on Enter
        this.inspection_section.find('#insp_scan_sublot').on('keypress', (e) => {
            if (e.which === 13) {
                e.preventDefault();
                this.validate_sublot();
            }
        });
        
        // Validate sublot on button click
        this.inspection_section.find('#insp_validate_sublot_btn').on('click', () => {
            this.validate_sublot();
        });
        
        // Validate inspector on Enter
        this.inspection_section.find('#insp_scan_employee').on('keypress', (e) => {
            if (e.which === 13) {
                e.preventDefault();
                this.validate_inspector();
            }
        });
        
        // Validate inspector on button click
        this.inspection_section.find('#insp_validate_employee_btn').on('click', () => {
            this.validate_inspector();
        });
        
        // Enable/disable create button based on inputs
        this.inspection_section.find('#inspection_type_select').on('change', () => {
            this.check_create_button();
        });
        
        // Create inspection
        this.inspection_section.find('#create_inspection_btn').on('click', () => {
            this.create_inspection_entry();
        });
        
        // Reset form
        this.inspection_section.find('#reset_inspection_btn').on('click', () => {
            this.reset_form();
        });
    }
    
    validate_sublot() {
        const sublot_number = this.inspection_section.find('#insp_scan_sublot').val().trim();
        
        if (!sublot_number) {
            frappe.msgprint(__("Please scan or enter a sub-lot number"));
            return;
        }
        
        const result_div = this.inspection_section.find('#insp_sublot_validation_result');
        result_div.html('<div class="alert alert-info">Validating sub-lot...</div>');
        
        // Search by sublot_number field instead of document name
        frappe.call({
            method: "frappe.client.get_list",
            args: {
                doctype: "Sub Lot Entry",
                filters: {
                    sublot_number: sublot_number,
                    docstatus: 1  // Only submitted documents
                },
                fields: ["name", "item_code", "sublot_number", "sublot_batch", "batch", "sublot_qty", "uom"],
                limit: 1
            },
            callback: (r) => {
                if (r.message && r.message.length > 0) {
                    this.sublot_details = r.message[0];
                    
                    result_div.html(`<div class="alert alert-success">
                        <i class="fa fa-check-circle mr-2"></i>Sub-Lot validated successfully!
                    </div>`);
                    
                    // Display sublot info
                    this.inspection_section.find('#insp_sublot_info_display').show();
                    this.inspection_section.find('#insp_display_item_code').text(this.sublot_details.item_code);
                    this.inspection_section.find('#insp_display_batch').text(this.sublot_details.sublot_batch || this.sublot_details.batch);
                    this.inspection_section.find('#insp_display_qty').text(`${this.sublot_details.sublot_qty} ${this.sublot_details.uom}`);
                    
                    // Show inspection details section
                    this.inspection_section.find('#inspection_details_section').show();
                    
                    // Focus on inspector field
                    this.inspection_section.find('#insp_scan_employee').focus();
                    
                } else {
                    result_div.html(`<div class="alert alert-danger">
                        <i class="fa fa-times-circle mr-2"></i>Invalid sub-lot number or sub-lot not submitted
                    </div>`);
                    this.inspection_section.find('#insp_sublot_info_display').hide();
                    this.inspection_section.find('#inspection_details_section').hide();
                }
            }
        });
    }
    
    validate_inspector() {
        const inspector_id = this.inspection_section.find('#insp_scan_employee').val().trim();
        
        if (!inspector_id) {
            frappe.msgprint(__("Please scan or enter an inspector ID"));
            return;
        }
        
        const result_div = this.inspection_section.find('#insp_employee_validation_result');
        result_div.html('<div class="alert alert-info">Validating inspector...</div>');
        
        FinishingCommon.validateEmployee(inspector_id, (error, data) => {
            if (error) {
                result_div.html(`<div class="alert alert-danger">
                    <i class="fa fa-times-circle mr-2"></i>${error}
                </div>`);
                this.inspector_details = null;
                this.check_create_button();
            } else {
                this.inspector_details = data;
                result_div.html(`<div class="alert alert-success">
                    <i class="fa fa-check-circle mr-2"></i>${data.employee.employee_name} - ${data.designation || 'Inspector'}
                </div>`);
                this.check_create_button();
            }
        });
    }
    
    check_create_button() {
        const inspection_type = this.inspection_section.find('#inspection_type_select').val();
        const can_create = this.sublot_details && this.inspector_details && inspection_type;
        
        this.inspection_section.find('#create_inspection_btn').prop('disabled', !can_create);
    }
    
    create_inspection_entry() {
        if (!this.sublot_details) {
            frappe.msgprint(__("Please validate a sub-lot first"));
            return;
        }
        
        if (!this.inspector_details) {
            frappe.msgprint(__("Please validate an inspector first"));
            return;
        }
        
        const inspection_type = this.inspection_section.find('#inspection_type_select').val();
        if (!inspection_type) {
            frappe.msgprint(__("Please select an inspection type"));
            return;
        }
        
        // Set route options to pre-fill the Inspection Entry form
        frappe.route_options = {
            inspection_type: inspection_type,
            scan_inspector: this.inspector_details.employee.name,
            scan_production_lot: this.sublot_details.name,
            product_ref_no: this.sublot_details.item_code,
            batch_no: this.sublot_details.sublot_batch || this.sublot_details.batch,
            total_inspected_qty_nos: this.sublot_details.sublot_qty,
            uom: this.sublot_details.uom,
            warehouse: this.user_settings.default_warehouse,
            source_warehouse: this.user_settings.source_warehouse,
            target_warehouse: this.user_settings.target_warehouse
        };
        
        // Show confirmation and navigate
        frappe.msgprint({
            title: __('Creating Inspection Entry'),
            message: `
                <div class="text-center">
                    <i class="fa fa-info-circle text-primary" style="font-size: 48px;"></i>
                    <h4 class="mt-3">Redirecting to Inspection Entry Form</h4>
                    <p><strong>Sub-Lot:</strong> ${this.sublot_details.name}</p>
                    <p><strong>Inspector:</strong> ${this.inspector_details.employee.employee_name}</p>
                    <p><strong>Type:</strong> ${inspection_type}</p>
                </div>
            `,
            primary_action: {
                label: __('Continue'),
                action: () => {
                    frappe.set_route("Form", "Inspection Entry", "new-inspection-entry");
                }
            }
        });
    }
    
    reset_form() {
        this.sublot_details = null;
        this.inspector_details = null;
        
        this.inspection_section.find('#insp_scan_sublot').val('');
        this.inspection_section.find('#insp_scan_employee').val('');
        this.inspection_section.find('#inspection_type_select').val('');
        this.inspection_section.find('#insp_sublot_validation_result').html('');
        this.inspection_section.find('#insp_employee_validation_result').html('');
        this.inspection_section.find('#insp_sublot_info_display').hide();
        this.inspection_section.find('#inspection_details_section').hide();
        this.inspection_section.find('#create_inspection_btn').prop('disabled', true);
        this.inspection_section.find('#insp_scan_sublot').focus();
    }
}
