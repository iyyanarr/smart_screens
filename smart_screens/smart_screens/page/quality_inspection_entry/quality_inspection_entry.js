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
        this.rejection_details = [];  // ✅ NEW: Store rejection details
        this.allowed_inspection_types = ['Final Visual Inspection', 'Dimensional Inspection', 'First Piece Inspection'];
        
        // ✅ NEW: Initialize defect types from Sub Lot Process Page
        this.init_defect_types();
        
        FinishingCommon.addFactoryStyles();
        this.make();
    }
    
    // ✅ NEW: Initialize defect types
    init_defect_types() {
        this.default_defect_types = [
            "FLOW-(FL)",
            "BUBBLE-(BU) / BLISTER-(BL)",
            "CUTMARK-(CU)",
            "DEFLASH-(DF)",
            "RIB",
            "FOREIGN PARTICLE-(FP)",
            "UNDER FILL-( UF )",
            "DIPRESSION-(DP)",
            "UNDER CURE-(UC)",
            "SURFACE DEFECT-(SD)",
            "OVER CURE-(OC) /FAST CURE",
            "BURST / TEAR",
            "BLACK MARK"
        ];

        this.additional_defect_types = [
            "TOOL MARK",
            "BONDING FALUIRE",
            "THREAD",
            "OVER TRIM",
            "MOULD DAMAGE",
            "WOOD PARTICLE",
            "WASHER VISIBLE",
            "DISPERS PROBLEM",
            "THK UNDERSIZ",
            "THK OVERSIZE",
            "ID UNDERSIZ",
            "ID OVERSIZE",
            "OD UNDERSIZ",
            "OD OVERSIZE",
            "IMPRESSION MARK",
            "WELD LINE",
            "BEND",
            "PIN HOLE",
            "BACKRIND",
            "BONDING BUBBLE",
            "PARTING LINE CUTMARK",
            "MOULD RUST",
            "STAIN ISSUE",
            "STRETCH TEST"
        ];

        this.all_defect_types = [...this.default_defect_types, ...this.additional_defect_types];
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
                            <div class="col-md-4">
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
                            
                            <div class="col-md-4">
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
                            
                            <div class="col-md-4">
                                <div class="factory-form-group">
                                    <label class="factory-label">
                                        <i class="fa fa-hashtag mr-2"></i>Inspection Quantity
                                    </label>
                                    <input type="number" class="form-control factory-input" 
                                           id="inspection_qty" placeholder="Enter inspection qty" 
                                           step="0.01" disabled>
                                    <small class="text-muted">Max: <span id="max_inspection_qty">-</span></small>
                                </div>
                            </div>
                        </div>
                        
                        <!-- ✅ NEW: Rejection Section -->
                        <div id="rejection_section" style="display: none;">
                            <hr>
                            <h5 class="mb-3">Rejection Details</h5>
                            
                            <div class="row">
                                <div class="col-md-5">
                                    <div class="factory-form-group">
                                        <label class="factory-label">
                                            <i class="fa fa-exclamation-triangle mr-2"></i>Defect Type
                                        </label>
                                        <div class="defect-type-field position-relative">
                                            <input type="text" id="rejection_type" class="form-control factory-input" 
                                                   placeholder="Search defect type..." disabled autocomplete="off">
                                            <div class="dropdown-menu defect-dropdown" style="display: none; width: 100%; max-height: 200px; overflow-y: auto;">
                                                <div class="dropdown-menu-search p-2">
                                                    <input type="text" class="form-control form-control-sm defect-search" placeholder="Filter defects...">
                                                </div>
                                                <div class="dropdown-divider"></div>
                                                <div class="defect-options"></div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                
                                <div class="col-md-3">
                                    <div class="factory-form-group">
                                        <label class="factory-label">
                                            <i class="fa fa-hashtag mr-2"></i>Rejection Qty
                                        </label>
                                        <input type="number" class="form-control factory-input" 
                                               id="rejection_qty" placeholder="Qty" step="0.01" disabled>
                                    </div>
                                </div>
                                
                                <div class="col-md-4 d-flex align-items-end mb-3">
                                    <button class="btn btn-warning factory-btn w-100" id="add_rejection_btn" disabled>
                                        <i class="fa fa-plus mr-2"></i>Add Rejection
                                    </button>
                                </div>
                            </div>
                            
                            <!-- Rejection Table -->
                            <div class="table-responsive mt-3">
                                <table class="table table-bordered factory-table" id="rejections_table">
                                    <thead class="thead-light">
                                        <tr>
                                            <th width="60%">Defect Type</th>
                                            <th width="20%">Quantity</th>
                                            <th width="20%">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody></tbody>
                                </table>
                            </div>
                            
                            <!-- ✅ NEW: Final Quantity Display -->
                            <div class="alert alert-info mt-3" id="final_qty_display" style="display: none;">
                                <div class="row">
                                    <div class="col-md-4">
                                        <strong>Inspection Qty:</strong> <span id="display_inspection_qty">0</span>
                                    </div>
                                    <div class="col-md-4">
                                        <strong>Total Rejection:</strong> <span id="display_rejection_qty">0</span>
                                    </div>
                                    <div class="col-md-4">
                                        <strong>Final Qty:</strong> <span id="display_final_qty" class="text-success">0</span>
                                    </div>
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
        this.setup_defect_type_dropdown();  // ✅ NEW: Setup defect dropdown
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
        
        // ✅ NEW: Enable rejection section when inspection qty is entered
        this.inspection_section.find('#inspection_qty').on('input', () => {
            this.validate_inspection_qty();
        });
        
        // ✅ NEW: Add rejection button
        this.inspection_section.find('#add_rejection_btn').on('click', () => {
            this.add_rejection();
        });
    }
    
    // ✅ NEW: Setup defect type dropdown
    setup_defect_type_dropdown() {
        const $rejectionTypeInput = this.inspection_section.find('#rejection_type');
        const $defectDropdown = this.inspection_section.find('.defect-dropdown');
        const $defectOptions = this.inspection_section.find('.defect-options');
        const $defectSearch = this.inspection_section.find('.defect-search');

        // Populate defect options
        this.populate_defect_options();

        // Show dropdown on focus
        $rejectionTypeInput.on('focus', () => {
            if (!$rejectionTypeInput.prop('disabled')) {
                $defectDropdown.show();
                $defectSearch.val('').focus();
                this.filter_defect_options('');
            }
        });

        // Hide dropdown when clicking outside
        $(document).on('mousedown', (e) => {
            if (!$(e.target).closest('.defect-type-field').length) {
                $defectDropdown.hide();
            }
        });

        // Search defects
        $defectSearch.on('input', (e) => {
            const searchTerm = $(e.target).val().trim().toLowerCase();
            this.filter_defect_options(searchTerm);
        });

        // Select on Enter
        $defectSearch.on('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                const $visibleOptions = $defectOptions.find('.defect-option:visible');
                if ($visibleOptions.length === 1) {
                    $visibleOptions.click();
                }
            }
        });
    }
    
    // ✅ NEW: Populate defect options
    populate_defect_options() {
        const $defectOptions = this.inspection_section.find('.defect-options');
        $defectOptions.empty();

        this.all_defect_types.forEach(defectType => {
            const $option = $(`<div class="defect-option" style="padding: 6px 12px; cursor: pointer;">${defectType}</div>`);
            
            $option.on('click', () => {
                this.inspection_section.find('#rejection_type').val(defectType);
                this.inspection_section.find('.defect-dropdown').hide();
            });

            $option.on('mouseenter', function() {
                $(this).css('background-color', '#007bff').css('color', '#fff');
            });

            $option.on('mouseleave', function() {
                $(this).css('background-color', '').css('color', '');
            });

            $defectOptions.append($option);
        });
    }
    
    // ✅ NEW: Filter defect options
    filter_defect_options(searchTerm) {
        const $options = this.inspection_section.find('.defect-option');
        
        $options.each(function() {
            const optionText = $(this).text().toLowerCase();
            if (optionText.includes(searchTerm)) {
                $(this).show();
            } else {
                $(this).hide();
            }
        });
    }
    
    // ✅ NEW: Validate inspection quantity
    validate_inspection_qty() {
        const inspection_qty = parseFloat(this.inspection_section.find('#inspection_qty').val());
        
        if (!inspection_qty || inspection_qty <= 0) {
            this.inspection_section.find('#rejection_section').hide();
            this.check_create_button();
            return;
        }
        
        const sublot_qty = parseFloat(this.sublot_details.sublot_qty);
        
        // Allow inspection qty greater than sublot qty with warning
        if (inspection_qty > sublot_qty) {
            frappe.show_alert({
                message: __(`Warning: Inspection quantity (${inspection_qty}) exceeds sub-lot quantity (${sublot_qty})`),
                indicator: 'orange'
            }, 5);
        }
        
        // Enable rejection section
        this.inspection_section.find('#rejection_section').show();
        this.inspection_section.find('#rejection_type').prop('disabled', false);
        this.inspection_section.find('#rejection_qty').prop('disabled', false);
        this.inspection_section.find('#add_rejection_btn').prop('disabled', false);
        this.inspection_section.find('#final_qty_display').show();
        
        this.update_final_qty_display();
        this.check_create_button();
    }
    
    // ✅ NEW: Add rejection
    add_rejection() {
        const rejection_type = this.inspection_section.find('#rejection_type').val().trim();
        const rejection_qty = parseFloat(this.inspection_section.find('#rejection_qty').val());
        
        if (!rejection_type) {
            frappe.msgprint(__("Please select a defect type"));
            return;
        }
        
        if (!rejection_qty || rejection_qty <= 0) {
            frappe.msgprint(__("Please enter a valid rejection quantity"));
            return;
        }
        
        // Check if total rejection exceeds inspection qty
        const total_rejection = this.rejection_details.reduce((sum, r) => sum + r.quantity, 0) + rejection_qty;
        const inspection_qty = parseFloat(this.inspection_section.find('#inspection_qty').val());
        
        if (total_rejection > inspection_qty) {
            frappe.msgprint({
                title: __('Invalid Quantity'),
                message: __(`Total rejection quantity (${total_rejection}) cannot exceed inspection quantity (${inspection_qty})`),
                indicator: 'red'
            });
            return;
        }
        
        // Add to rejection details
        this.rejection_details.push({
            defect_type: rejection_type,
            quantity: rejection_qty
        });
        
        this.update_rejection_table();
        this.update_final_qty_display();
        
        // Clear inputs
        this.inspection_section.find('#rejection_type').val('');
        this.inspection_section.find('#rejection_qty').val('');
        this.inspection_section.find('#rejection_type').focus();
    }
    
    // ✅ NEW: Update rejection table
    update_rejection_table() {
        const tbody = this.inspection_section.find('#rejections_table tbody');
        tbody.empty();
        
        if (this.rejection_details.length === 0) {
            tbody.append(`
                <tr>
                    <td colspan="3" class="text-center text-muted">No rejections added</td>
                </tr>
            `);
            return;
        }
        
        this.rejection_details.forEach((rejection, idx) => {
            tbody.append(`
                <tr>
                    <td>${rejection.defect_type}</td>
                    <td>${rejection.quantity}</td>
                    <td>
                        <button class="btn btn-sm btn-danger" data-idx="${idx}">
                            <i class="fa fa-trash mr-1"></i>Delete
                        </button>
                    </td>
                </tr>
            `);
        });
        
        // Attach delete handlers
        tbody.find('button[data-idx]').on('click', (e) => {
            const idx = parseInt($(e.currentTarget).data('idx'));
            this.remove_rejection(idx);
        });
    }
    
    // ✅ NEW: Remove rejection
    remove_rejection(idx) {
        this.rejection_details.splice(idx, 1);
        this.update_rejection_table();
        this.update_final_qty_display();
    }
    
    // ✅ NEW: Update final quantity display
    update_final_qty_display() {
        const inspection_qty = parseFloat(this.inspection_section.find('#inspection_qty').val()) || 0;
        const total_rejection = this.rejection_details.reduce((sum, r) => sum + r.quantity, 0);
        const final_qty = inspection_qty - total_rejection;
        
        this.inspection_section.find('#display_inspection_qty').text(inspection_qty.toFixed(2));
        this.inspection_section.find('#display_rejection_qty').text(total_rejection.toFixed(2));
        this.inspection_section.find('#display_final_qty').text(final_qty.toFixed(2));
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
                    
                    // ✅ NEW: Enable inspection qty input and set max
                    this.inspection_section.find('#inspection_qty').prop('disabled', false);
                    this.inspection_section.find('#max_inspection_qty').text(`${this.sublot_details.sublot_qty} ${this.sublot_details.uom}`);
                    
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
        const inspection_qty = parseFloat(this.inspection_section.find('#inspection_qty').val());
        const can_create = this.sublot_details && this.inspector_details && inspection_type && inspection_qty > 0;
        
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
        
        const inspection_qty = parseFloat(this.inspection_section.find('#inspection_qty').val());
        if (!inspection_qty || inspection_qty <= 0) {
            frappe.msgprint(__("Please enter a valid inspection quantity"));
            return;
        }
        
        const total_rejection = this.rejection_details.reduce((sum, r) => sum + r.quantity, 0);
        const final_qty = inspection_qty - total_rejection;
        
        // ✅ FIXED: Create SPP Inspection Entry document with correct field mappings
        frappe.call({
            method: "frappe.client.insert",
            args: {
                doc: {
                    doctype: "SPP Inspection Entry",
                    inspection_type: inspection_type,
                    scan_inspector: this.inspector_details.employee.name,
                    inspector_code: this.inspector_details.employee.name,
                    inspector_name: this.inspector_details.employee.employee_name,
                    scan_production_lot: this.sublot_details.sublot_number,
                    lot_no: this.sublot_details.sublot_number,
                    product_ref_no: this.sublot_details.item_code,
                    batch_no: this.sublot_details.sublot_batch || this.sublot_details.batch,
                    inspected_qty_nos: inspection_qty,
                    total_inspected_qty_nos: inspection_qty,
                    available_qty_nos: this.sublot_details.sublot_qty,
                    rejected_qty_nos: total_rejection,
                    accepted_qty_nos: final_qty,
                    warehouse: this.user_settings.default_warehouse,
                    posting_date: frappe.datetime.get_today(),
                    // ✅ Add rejection items as child table
                    items: this.rejection_details.map(r => ({
                        type_of_defect: r.defect_type,
                        rejected_qty: r.quantity,
                        rejected_qty_kg: 0
                    }))
                }
            },
            freeze: true,
            freeze_message: __("Creating inspection entry..."),
            callback: (r) => {
                if (r.message) {
                    this.submit_inspection_entry(r.message);
                } else {
                    frappe.msgprint(__("Failed to create inspection entry"));
                }
            },
            error: (err) => {
                frappe.msgprint({
                    title: __('Creation Failed'),
                    message: __('Failed to create inspection entry: ') + (err.message || 'Unknown error'),
                    indicator: 'red'
                });
            }
        });
    }
    
    // ✅ FIXED: Update submit method to use correct doctype
    submit_inspection_entry(doc) {
        frappe.call({
            method: "frappe.client.submit",
            args: {
                doc: doc
            },
            callback: (r) => {
                if (r.message) {
                    const inspection_qty = parseFloat(this.inspection_section.find('#inspection_qty').val());
                    const total_rejection = this.rejection_details.reduce((sum, r) => sum + r.quantity, 0);
                    const final_qty = inspection_qty - total_rejection;
                    
                    frappe.show_alert({
                        message: __("Inspection entry created and submitted successfully: " + r.message.name),
                        indicator: 'green'
                    }, 10);
                    
                    // Show success dialog with option to view
                    frappe.msgprint({
                        title: __('Inspection Entry Created'),
                        message: `
                            <div class="text-center">
                                <i class="fa fa-check-circle text-success" style="font-size: 48px;"></i>
                                <h4 class="mt-3">Inspection Entry Created & Submitted Successfully!</h4>
                                <p><strong>Inspection ID:</strong> ${r.message.name}</p>
                                <p><strong>Sub-Lot:</strong> ${this.sublot_details.sublot_number}</p>
                                <p><strong>Inspector:</strong> ${this.inspector_details.employee.employee_name}</p>
                                <p><strong>Type:</strong> ${r.message.inspection_type}</p>
                                <p><strong>Inspection Qty:</strong> ${inspection_qty}</p>
                                ${total_rejection > 0 ? `<p><strong>Rejection Qty:</strong> ${total_rejection}</p>` : ''}
                                <p class="text-success"><strong>Final Qty:</strong> ${final_qty}</p>
                                <p class="text-success mt-2"><i class="fa fa-check"></i> Document Status: <strong>Submitted</strong></p>
                                ${this.rejection_details.length > 0 ? 
                                    `<p class="mt-2"><strong>Defects:</strong> ${this.rejection_details.map(r => r.defect_type).join(', ')}</p>` : 
                                    ''
                                }
                            </div>
                        `,
                        primary_action: {
                            label: __('View Inspection Entry'),
                            action: () => {
                                frappe.set_route("Form", "SPP Inspection Entry", r.message.name);
                            }
                        }
                    });
                    
                    this.reset_form();
                } else {
                    frappe.msgprint({
                        title: __('Submission Failed'),
                        message: __('Inspection entry was created but could not be submitted. Please submit it manually.'),
                        indicator: 'orange'
                    });
                }
            },
            error: (r) => {
                frappe.msgprint({
                    title: __('Submission Error'),
                    message: __('Inspection entry was created but submission failed: ') + (r.message || 'Unknown error'),
                    indicator: 'red'
                });
            }
        });
    }
    
    reset_form() {
        this.sublot_details = null;
        this.inspector_details = null;
        this.rejection_details = [];  // ✅ NEW: Clear rejections
        
        this.inspection_section.find('#insp_scan_sublot').val('');
        this.inspection_section.find('#insp_scan_employee').val('');
        this.inspection_section.find('#inspection_type_select').val('');
        this.inspection_section.find('#inspection_qty').val('').prop('disabled', true);
        this.inspection_section.find('#rejection_type').val('').prop('disabled', true);
        this.inspection_section.find('#rejection_qty').val('').prop('disabled', true);
        this.inspection_section.find('#insp_sublot_validation_result').html('');
        this.inspection_section.find('#insp_employee_validation_result').html('');
        this.inspection_section.find('#insp_sublot_info_display').hide();
        this.inspection_section.find('#inspection_details_section').hide();
        this.inspection_section.find('#rejection_section').hide();
        this.inspection_section.find('#final_qty_display').hide();
        this.inspection_section.find('#create_inspection_btn').prop('disabled', true);
        this.inspection_section.find('#max_inspection_qty').text('-');
        
        // ✅ NEW: Clear rejection table
        this.update_rejection_table();
        
        this.inspection_section.find('#insp_scan_sublot').focus();
    }
}
