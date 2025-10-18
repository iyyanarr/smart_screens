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
        
        // ✅ FIXED: For Final Visual Inspection, go directly to workflow completion
        // This prevents duplicate SPP Inspection Entry creation
        if (inspection_type === "Final Visual Inspection") {
            this.complete_manufacturing_workflow_with_data({
                lot_no: this.sublot_details.sublot_number,
                inspector_id: this.inspector_details.employee.name,
                inspected_qty: inspection_qty,
                rejected_qty: total_rejection,
                rejection_items: this.rejection_details.map(r => ({
                    rejection_type: r.defect_type,
                    quantity: r.quantity
                })),
                inspection_type: inspection_type
            }, final_qty, total_rejection);
            return;
        }
        
        // ✅ For other inspection types, create SPP Inspection Entry directly
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
    
    // ✅ ENHANCED: Updated submit method to include workflow completion
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
                    
                    // ✅ NEW: Check if this is Final Visual Inspection and complete workflow
                    if (r.message.inspection_type === "Final Visual Inspection") {
                        this.complete_manufacturing_workflow(r.message, final_qty, total_rejection);
                    } else {
                        this.show_inspection_success_dialog(r.message, inspection_qty, total_rejection, final_qty);
                    }
                    
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
    
    // ✅ NEW: Complete manufacturing workflow for Final Visual Inspection
    complete_manufacturing_workflow(inspection_doc, final_qty, total_rejection) {
        // ✅ ENHANCED: Add comprehensive browser console debugging
        console.group("🔄 MANUFACTURING WORKFLOW DEBUG");
        console.log("📋 Starting manufacturing workflow completion");
        console.log("🎯 Inspection Document:", inspection_doc);
        console.log("📊 Final Qty:", final_qty);
        console.log("❌ Total Rejection:", total_rejection);
        console.log("🔍 Sub-lot Details:", this.sublot_details);
        console.log("👤 Inspector Details:", this.inspector_details);
        
        // Show progress dialog
        const progressDialog = new frappe.ui.Dialog({
            title: __('Completing Manufacturing Workflow'),
            fields: [
                {
                    fieldname: 'progress_html',
                    fieldtype: 'HTML',
                    options: this.getWorkflowProgressHTML(0, 'Starting workflow completion...', 'process')
                }
            ],
            primary_action_label: __('Close'),
            primary_action: function() {
                progressDialog.hide();
            }
        });
        
        progressDialog.show();
        progressDialog.$wrapper.find('.btn-primary').hide(); // Hide close button initially
        
        // Update progress function
        const updateProgress = (percent, message, stage) => {
            console.log(`📈 Progress Update: ${percent}% - ${message} (${stage})`);
            progressDialog.fields_dict.progress_html.$wrapper.html(
                this.getWorkflowProgressHTML(percent, message, stage)
            );
        };
        
        // Check workflow status first
        updateProgress(20, 'Checking workflow status...', 'process');
        console.log("🔍 STEP 1: Calling check_inspection_workflow_status API");
        console.log("📝 API Parameters:", {
            method: "smart_screens.smart_screens.api.quality_inspection.check_inspection_workflow_status",
            args: {
                lot_no: this.sublot_details.sublot_number
            }
        });
        
        frappe.call({
            method: "smart_screens.smart_screens.api.quality_inspection.check_inspection_workflow_status",
            args: {
                lot_no: this.sublot_details.sublot_number
            },
            callback: (status_response) => {
                console.log("✅ STEP 1 RESPONSE: Workflow status check completed");
                console.log("📨 Full Response:", status_response);
                
                if (status_response.message && status_response.message.status === "success") {
                    const workflow_data = status_response.message.data;
                    
                    console.log("✅ Workflow status check SUCCESS");
                    console.log("📊 Workflow Data:", workflow_data);
                    console.log("🏭 Work Order:", workflow_data.work_order);
                    console.log("📋 Sub Lot Process:", workflow_data.sublot_process);
                    console.log("🎯 Job Cards - Total:", workflow_data.total_job_cards, "Completed:", workflow_data.completed_job_cards);
                    console.log("📦 Stock Entries - Material Transfer:", workflow_data.material_transfer_entries, "Manufacture:", workflow_data.manufacture_entries);
                    console.log("✅ Workflow Completed:", workflow_data.workflow_completed);
                    
                    updateProgress(40, 'Workflow status checked successfully', 'process');
                    
                    if (workflow_data.workflow_completed) {
                        console.log("ℹ️ Workflow already completed, showing completion dialog");
                        updateProgress(100, 'Manufacturing workflow already completed!', 'complete');
                        this.show_workflow_already_completed_dialog(inspection_doc, workflow_data);
                        progressDialog.$wrapper.find('.btn-primary').show();
                        console.groupEnd();
                        return;
                    }
                    
                    // Complete the workflow
                    updateProgress(60, 'Completing job cards and creating stock entries...', 'process');
                    console.log("🔄 STEP 2: Calling create_quality_inspection_workflow API");
                    console.log("📝 API Parameters:", {
                        method: "smart_screens.smart_screens.api.quality_inspection.create_quality_inspection_workflow",
                        args: {
                            inspection_entry_id: inspection_doc.name
                        }
                    });
                    
                    frappe.call({
                        method: "smart_screens.smart_screens.api.quality_inspection.create_quality_inspection_workflow",
                        args: {
                            inspection_entry_id: inspection_doc.name
                        },
                        callback: (workflow_response) => {
                            console.log("✅ STEP 2 RESPONSE: Workflow completion API call completed");
                            console.log("📨 Full Response:", workflow_response);
                            
                            if (workflow_response.message && workflow_response.message.status === "success") {
                                console.log("✅ Workflow completion SUCCESS");
                                updateProgress(100, 'Manufacturing workflow completed successfully!', 'complete');
                                
                                const workflow_results = workflow_response.message.data;
                                console.log("🎉 Workflow Results:", workflow_results);
                                console.log("🔧 Job Cards Completed:", workflow_results.job_cards_completed);
                                console.log("📦 Stock Entries Created:", workflow_results.stock_entries_created);
                                console.log("🏭 Work Order Completed:", workflow_results.work_order_completed);
                                
                                // Show success message
                                frappe.show_alert({
                                    message: __("Manufacturing workflow completed! Job cards: {0}, Stock entries: {1}", 
                                        [workflow_results.job_cards_completed.length, workflow_results.stock_entries_created.length]),
                                    indicator: 'green'
                                }, 5);
                                
                                // Show detailed results dialog
                                this.show_workflow_completion_dialog(inspection_doc, workflow_results, final_qty, total_rejection);
                                
                                progressDialog.$wrapper.find('.btn-primary').show();
                                console.log("🎉 Workflow completion process finished successfully");
                                console.groupEnd();
                                
                            } else {
                                console.warn("⚠️ Workflow completion returned non-success status");
                                console.log("⚠️ Response message:", workflow_response.message);
                                updateProgress(75, 'Workflow completed with warnings', 'warning');
                                
                                frappe.msgprint({
                                    title: __('Partial Success'),
                                    message: workflow_response.message ? workflow_response.message.message : 'Some workflow steps may not have completed',
                                    indicator: 'orange'
                                });
                                
                                // Still show the inspection success
                                this.show_inspection_success_dialog(inspection_doc, inspection_doc.inspected_qty_nos, total_rejection, final_qty);
                                progressDialog.$wrapper.find('.btn-primary').show();
                                console.groupEnd();
                            }
                        },
                        error: (workflow_error) => {
                            console.error("❌ STEP 2 ERROR: Workflow completion API call failed");
                            console.error("❌ Error Object:", workflow_error);
                            console.error("❌ Error Message:", workflow_error.message);
                            console.error("❌ Error Stack:", workflow_error.stack);
                            
                            updateProgress(0, 'Workflow completion failed: ' + (workflow_error.message || 'Unknown error'), 'error');
                            
                            frappe.msgprint({
                                title: __('Workflow Error'),
                                message: __('Inspection completed but manufacturing workflow failed: ') + (workflow_error.message || 'Unknown error'),
                                indicator: 'red'
                            });
                            
                            // Still show the inspection success
                            this.show_inspection_success_dialog(inspection_doc, inspection_doc.inspected_qty_nos, total_rejection, final_qty);
                            progressDialog.$wrapper.find('.btn-primary').show();
                            console.groupEnd();
                        }
                    });
                } else {
                    console.error("❌ STEP 1 ERROR: Workflow status check failed");
                    console.error("❌ Response status:", status_response.message ? status_response.message.status : 'No status');
                    console.error("❌ Response message:", status_response.message ? status_response.message.message : 'No message');
                    console.error("❌ Full response:", status_response);
                    
                    updateProgress(0, 'Failed to check workflow status', 'error');
                    
                    // Continue with basic inspection success
                    this.show_inspection_success_dialog(inspection_doc, inspection_doc.inspected_qty_nos, total_rejection, final_qty);
                    progressDialog.$wrapper.find('.btn-primary').show();
                    console.groupEnd();
                }
            },
            error: (status_error) => {
                console.error("❌ STEP 1 CRITICAL ERROR: Status check API call failed");
                console.error("❌ Error Object:", status_error);
                console.error("❌ Error Message:", status_error.message);
                console.error("❌ Error Response Text:", status_error.responseText);
                console.error("❌ Error Status:", status_error.status);
                console.error("❌ Error Stack:", status_error.stack);
                
                // Try to parse the error response for more details
                if (status_error.responseText) {
                    try {
                        const errorData = JSON.parse(status_error.responseText);
                        console.error("❌ Parsed Error Data:", errorData);
                        if (errorData.exception) {
                            console.error("❌ Exception Details:", errorData.exception);
                        }
                        if (errorData.exc) {
                            console.error("❌ Exception String:", errorData.exc);
                        }
                    } catch (parseError) {
                        console.error("❌ Could not parse error response:", parseError);
                    }
                }
                
                updateProgress(0, 'Status check failed: ' + (status_error.message || 'Unknown error'), 'error');
                
                // Continue with basic inspection success
                this.show_inspection_success_dialog(inspection_doc, inspection_doc.inspected_qty_nos, total_rejection, final_qty);
                progressDialog.$wrapper.find('.btn-primary').show();
                console.groupEnd();
            }
        });
    }
    
    // ✅ NEW: Complete manufacturing workflow with data (bypasses SPP Inspection Entry creation)
    complete_manufacturing_workflow_with_data(inspection_data, final_qty, total_rejection) {
        console.group("🔄 DIRECT WORKFLOW COMPLETION");
        console.log("📋 Starting direct workflow completion");
        console.log("🎯 Inspection Data:", inspection_data);
        console.log("📊 Final Qty:", final_qty);
        console.log("❌ Total Rejection:", total_rejection);
        
        // Show progress dialog
        const progressDialog = new frappe.ui.Dialog({
            title: __('Completing Manufacturing Workflow'),
            fields: [
                {
                    fieldname: 'progress_html',
                    fieldtype: 'HTML',
                    options: this.getWorkflowProgressHTML(0, 'Starting direct workflow completion...', 'process')
                }
            ],
            primary_action_label: __('Close'),
            primary_action: function() {
                progressDialog.hide();
            }
        });
        
        progressDialog.show();
        progressDialog.$wrapper.find('.btn-primary').hide();
        
        const updateProgress = (percent, message, stage) => {
            console.log(`📈 Progress Update: ${percent}% - ${message} (${stage})`);
            progressDialog.fields_dict.progress_html.$wrapper.html(
                this.getWorkflowProgressHTML(percent, message, stage)
            );
        };
        
        updateProgress(30, 'Calling direct workflow completion API...', 'process');
        
        // Call the API with inspection data
        frappe.call({
            method: "smart_screens.smart_screens.api.quality_inspection.complete_final_visual_inspection_workflow",
            args: {
                lot_no: inspection_data.lot_no,
                inspector_id: inspection_data.inspector_id,
                inspected_qty: inspection_data.inspected_qty,
                rejected_qty: inspection_data.rejected_qty,
                rejection_items: inspection_data.rejection_items,
                warehouse: this.user_settings.default_warehouse
            },
            callback: (response) => {
                console.log("✅ Direct workflow completion response:", response);
                
                if (response.message && response.message.status === "success") {
                    updateProgress(100, 'Manufacturing workflow completed successfully!', 'complete');
                    
                    const workflow_results = response.message.data;
                    console.log("🎉 Workflow Results:", workflow_results);
                    
                    frappe.show_alert({
                        message: __("Manufacturing workflow completed directly! Inspection Entry: {0}", 
                            [workflow_results.inspection_entry]),
                        indicator: 'green'
                    }, 5);
                    
                    this.show_direct_workflow_completion_dialog(workflow_results, final_qty, total_rejection);
                    progressDialog.$wrapper.find('.btn-primary').show();
                    
                } else {
                    console.warn("⚠️ Direct workflow completion returned non-success status");
                    updateProgress(0, 'Direct workflow completion failed', 'error');
                    
                    frappe.msgprint({
                        title: __('Workflow Error'),
                        message: response.message ? response.message.message : 'Direct workflow completion failed',
                        indicator: 'red'
                    });
                    
                    progressDialog.$wrapper.find('.btn-primary').show();
                }
                console.groupEnd();
            },
            error: (error) => {
                console.error("❌ Direct workflow completion error:", error);
                updateProgress(0, 'Direct workflow completion failed: ' + (error.message || 'Unknown error'), 'error');
                
                frappe.msgprint({
                    title: __('Workflow Error'),
                    message: __('Direct workflow completion failed: ') + (error.message || 'Unknown error'),
                    indicator: 'red'
                });
                
                progressDialog.$wrapper.find('.btn-primary').show();
                console.groupEnd();
            }
        });
    }
    
    // ✅ NEW: Show direct workflow completion dialog
    show_direct_workflow_completion_dialog(workflow_results, final_qty, total_rejection) {
        frappe.msgprint({
            title: __('Manufacturing Workflow Completed'),
            message: `
                <div class="text-center">
                    <i class="fa fa-check-circle text-success" style="font-size: 48px;"></i>
                    <h4 class="mt-3">Manufacturing Workflow Completed Successfully!</h4>
                    
                    <div class="row mt-4">
                        <div class="col-md-6">
                            <div class="card">
                                <div class="card-body">
                                    <h6 class="card-title">
                                        <i class="fa fa-search mr-2"></i>Quality Inspection
                                    </h6>
                                    <p><strong>Inspection ID:</strong> ${workflow_results.inspection_entry}</p>
                                    <p><strong>Type:</strong> Final Visual Inspection</p>
                                    <p><strong>Inspector:</strong> ${this.inspector_details.employee.employee_name}</p>
                                    <p><strong>Sub-Lot:</strong> ${this.sublot_details.sublot_number}</p>
                                    <p><strong>Final Qty:</strong> ${final_qty}</p>
                                    ${total_rejection > 0 ? `<p class="text-warning"><strong>Rejected:</strong> ${total_rejection}</p>` : ''}
                                </div>
                            </div>
                        </div>
                        
                        <div class="col-md-6">
                            <div class="card">
                                <div class="card-body">
                                    <h6 class="card-title">
                                        <i class="fa fa-industry mr-2"></i>Manufacturing Completed
                                    </h6>
                                    <p><strong>Job Cards Completed:</strong> ${workflow_results.job_cards_completed ? workflow_results.job_cards_completed.length : 0}</p>
                                    <p><strong>Stock Entries Created:</strong> ${workflow_results.stock_entries_created ? workflow_results.stock_entries_created.length : 0}</p>
                                    <p><strong>Work Order:</strong> ${workflow_results.work_order_completed ? 'Completed' : 'In Progress'}</p>
                                </div>
                            </div>
                        </div>
                    </div>
                    
                    <p class="text-success mt-3">
                        <i class="fa fa-check"></i> <strong>Complete manufacturing cycle finished without duplicates!</strong>
                    </p>
                </div>
            `,
            primary_action: {
                label: __('View Inspection Entry'),
                action: () => {
                    frappe.set_route("Form", "SPP Inspection Entry", workflow_results.inspection_entry);
                }
            }
        });
        
        this.reset_form();
    }
    
    // ✅ NEW: Generate workflow progress HTML
    getWorkflowProgressHTML(percent, message, stage = 'process') {
        const stageIcons = {
            'process': 'fa-cogs fa-spin',
            'complete': 'fa-check-circle',
            'warning': 'fa-exclamation-triangle',
            'error': 'fa-times-circle'
        };
        
        const stageColors = {
            'process': 'primary',
            'complete': 'success',
            'warning': 'warning',
            'error': 'danger'
        };
        
        const icon = stageIcons[stage] || 'fa-cogs fa-spin';
        const color = stageColors[stage] || 'primary';
        
        return `
            <div class="text-center" style="padding: 20px;">
                <div style="font-size: 48px; color: var(--bs-${color}); margin-bottom: 20px;">
                    <i class="fa ${icon}"></i>
                </div>
                <h4 style="margin-bottom: 20px;">${message}</h4>
                <div class="progress" style="height: 25px;">
                    <div class="progress-bar progress-bar-striped ${stage === 'process' ? 'progress-bar-animated' : ''} bg-${color}" 
                         role="progressbar" 
                         style="width: ${percent}%;" 
                         aria-valuenow="${percent}" 
                         aria-valuemin="0" 
                         aria-valuemax="100">
                        ${percent}%
                    </div>
                </div>
                ${stage === 'process' ? '<p class="text-muted mt-3">Please wait, completing manufacturing workflow...</p>' : ''}
            </div>
        `;
    }
    
    // ✅ NEW: Show workflow completion dialog
    show_workflow_completion_dialog(inspection_doc, workflow_results, final_qty, total_rejection) {
        frappe.msgprint({
            title: __('Complete Manufacturing Workflow Finished'),
            message: `
                <div class="text-center">
                    <i class="fa fa-check-circle text-success" style="font-size: 48px;"></i>
                    <h4 class="mt-3">Manufacturing Workflow Completed Successfully!</h4>
                    
                    <div class="row mt-4">
                        <div class="col-md-6">
                            <div class="card">
                                <div class="card-body">
                                    <h6 class="card-title">
                                        <i class="fa fa-search mr-2"></i>Quality Inspection
                                    </h6>
                                    <p><strong>Inspection ID:</strong> ${inspection_doc.name}</p>
                                    <p><strong>Type:</strong> ${inspection_doc.inspection_type}</p>
                                    <p><strong>Inspector:</strong> ${this.inspector_details.employee.employee_name}</p>
                                    <p><strong>Final Qty:</strong> ${final_qty}</p>
                                    ${total_rejection > 0 ? `<p class="text-warning"><strong>Rejected:</strong> ${total_rejection}</p>` : ''}
                                </div>
                            </div>
                        </div>
                        
                        <div class="col-md-6">
                            <div class="card">
                                <div class="card-body">
                                    <h6 class="card-title">
                                        <i class="fa fa-industry mr-2"></i>Manufacturing Completed
                                    </h6>
                                    <p><strong>Job Cards Completed:</strong> ${workflow_results.job_cards_completed.length}</p>
                                    <p><strong>Stock Entries Created:</strong> ${workflow_results.stock_entries_created.length}</p>
                                    <p><strong>Work Order:</strong> ${workflow_results.work_order_completed ? 'Completed' : 'In Progress'}</p>
                                </div>
                            </div>
                        </div>
                    </div>
                    
                    <p class="text-success mt-3">
                        <i class="fa fa-check"></i> <strong>Complete manufacturing cycle finished successfully!</strong>
                    </p>
                </div>
            `,
            primary_action: {
                label: __('View Inspection Entry'),
                action: () => {
                    frappe.set_route("Form", "SPP Inspection Entry", inspection_doc.name);
                }
            },
            secondary_action: {
                label: __('View Work Order'),
                action: () => {
                    if (workflow_results.job_cards_completed && workflow_results.job_cards_completed.length > 0) {
                        // Get work order from job card
                        frappe.call({
                            method: "frappe.client.get_value",
                            args: {
                                doctype: "Job Card",
                                fieldname: "work_order",
                                filters: {"name": workflow_results.job_cards_completed[0]}
                            },
                            callback: (r) => {
                                if (r.message && r.message.work_order) {
                                    frappe.set_route("Form", "Work Order", r.message.work_order);
                                }
                            }
                        });
                    }
                }
            }
        });
        
        this.reset_form();
    }
    
    // ✅ NEW: Show workflow already completed dialog
    show_workflow_already_completed_dialog(inspection_doc, workflow_data) {
        frappe.msgprint({
            title: __('Workflow Already Completed'),
            message: `
                <div class="text-center">
                    <i class="fa fa-info-circle text-info" style="font-size: 48px;"></i>
                    <h4 class="mt-3">Manufacturing Workflow Already Completed</h4>
                    <p><strong>Inspection Entry:</strong> ${inspection_doc.name}</p>
                    <p><strong>Work Order:</strong> ${workflow_data.work_order} (${workflow_data.work_order_status})</p>
                    <p><strong>Job Cards:</strong> ${workflow_data.completed_job_cards}/${workflow_data.total_job_cards} completed</p>
                    <p><strong>Stock Entries:</strong> ${workflow_data.manufacture_entries} manufacture entries created</p>
                    <p class="text-info mt-2">
                        <i class="fa fa-check"></i> All manufacturing steps have been completed for this sub-lot.
                    </p>
                </div>
            `,
            primary_action: {
                label: __('View Inspection Entry'),
                action: () => {
                    frappe.set_route("Form", "SPP Inspection Entry", inspection_doc.name);
                }
            }
        });
        
        this.reset_form();
    }
    
    // ✅ ENHANCED: Regular inspection success dialog (for non-Final Visual Inspection)
    show_inspection_success_dialog(inspection_doc, inspection_qty, total_rejection, final_qty) {
        frappe.msgprint({
            title: __('Inspection Entry Created'),
            message: `
                <div class="text-center">
                    <i class="fa fa-check-circle text-success" style="font-size: 48px;"></i>
                    <h4 class="mt-3">Inspection Entry Created & Submitted Successfully!</h4>
                    <p><strong>Inspection ID:</strong> ${inspection_doc.name}</p>
                    <p><strong>Sub-Lot:</strong> ${this.sublot_details.sublot_number}</p>
                    <p><strong>Inspector:</strong> ${this.inspector_details.employee.employee_name}</p>
                    <p><strong>Type:</strong> ${inspection_doc.inspection_type}</p>
                    <p><strong>Inspection Qty:</strong> ${inspection_qty}</p>
                    ${total_rejection > 0 ? `<p><strong>Rejection Qty:</strong> ${total_rejection}</p>` : ''}
                    <p class="text-success"><strong>Final Qty:</strong> ${final_qty}</p>
                    <p class="text-success mt-2"><i class="fa fa-check"></i> Document Status: <strong>Submitted</strong></p>
                    ${this.rejection_details.length > 0 ? 
                        `<p class="mt-2"><strong>Defects:</strong> ${this.rejection_details.map(r => r.defect_type).join(', ')}</p>` : 
                        ''
                    }
                    ${inspection_doc.inspection_type !== "Final Visual Inspection" ? 
                        `<div class="alert alert-info mt-3">
                            <i class="fa fa-info-circle mr-2"></i>
                            <strong>Note:</strong> Complete manufacturing workflow will be triggered when "Final Visual Inspection" is performed.
                        </div>` : ''
                    }
                </div>
            `,
            primary_action: {
                label: __('View Inspection Entry'),
                action: () => {
                    frappe.set_route("Form", "SPP Inspection Entry", inspection_doc.name);
                }
            }
        });
        
        this.reset_form();
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
