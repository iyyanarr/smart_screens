/**
 * Sub Lot Process Page - Main Class
 * Handles the core functionality of the Sub Lot Process Page
 */
import { ProcessModal } from './js/process_modal.js';
import { LabelPrinter } from './js/label_printer.js';

export class SubLotProcessPage {
    constructor(page) {
        this.page = page;
        this.wrapper = $(page.wrapper);
        
        // Get location data directly from the page
        this.location_data = [page.selected_location];
        this.default_stage = page.selected_location.stage || "";
        this.default_warehouse = page.selected_location.source_warehouse || "";
        
        // Store reference to this instance on the page
        page.sublot_process_page = this;
        
        // Initialize modules
        this.processModal = new ProcessModal();
        this.labelPrinter = new LabelPrinter();
        
        // Initialize data structures
        this.batchInfo = null;
        this.operationDetails = null;
        this.inspectionInfo = null;
        this.rejectionDetails = null;
        this.bom_details = null;
        this.processDetails = null;
        this.completedProcessId = null;
        
        // Setup defect types
        this.init_defect_types();
        
        // Build the page
        this.make();
        
        // Bind events
        this.bind_events();
        
        // Update location UI
        this.update_location_ui();
    }

    update_location_ui() {
        // Skip if no location data is available
        if (!this.location_data || this.location_data.length === 0) return;

        // Update the combined batch and location info section
        const combinedInfoSection = this.wrapper.find('#combined_info_section');
        if (combinedInfoSection.length) {
            let locationHtml = `
                <div class="card mb-0">
                    <div class="card-header bg-light">
                        <strong>Your Location Information</strong>
                    </div>
                    <div class="card-body py-2">
                        <div class="location-info-container">
            `;

            this.location_data.forEach(loc => {
                locationHtml += `
                    <div class="location-item">
                        <span><strong>Location:</strong> ${loc.location || 'N/A'}</span>
                        ${loc.stage ? `<span><strong>Stage:</strong> ${loc.stage}</span>` : ''}
                        ${loc.source_warehouse ? `<span><strong>Source WH:</strong> ${loc.source_warehouse}</span>` : ''}
                        ${loc.target_warehouse ? `<span><strong>Target WH:</strong> ${loc.target_warehouse}</span>` : ''}
                    </div>
                `;
            });

            locationHtml += `
                        </div>
                    </div>
                </div>
            `;

            combinedInfoSection.find('.location-card-container').html(locationHtml);
        }
    }

    make() {
        // Add main sections to the page
        this.add_page_sections();

        // Initialize with a blank slate
        this.reset_form();
    }

    init_defect_types() {
        // Default defect types (from inspection entry)
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

        // Additional defect types
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

        // Combine all defect types for the dropdown
        this.all_defect_types = [...this.default_defect_types, ...this.additional_defect_types];
    }

    add_page_sections() {
        let html = `
            <div class="sub-lot-process-page">
                <!-- Combined Single-Row Information Section -->
                <div id="combined_info_section" class="section combined-info-section mb-3">
                    <div class="card">
                        <div class="card-header bg-light">
                            <strong>Production Information</strong>
                        </div>
                        <div class="card-body p-3">
                            <div class="row">
                                <!-- Column 1: Scan SPP Batch -->
                                <div class="col-md-3">
                                    <div class="info-panel">
                                        <h6 class="panel-title">Scan Batch</h6>
                                        <div class="input-group input-group-lg mb-2">
                                            <input type="text" id="scan_batch" class="form-control" placeholder="Scan SPP Batch" autofocus>
                                            <div class="input-group-append">
                                                <button id="validate_batch_btn" class="btn btn-primary">
                                                    <i class="fa fa-barcode"></i>
                                                </button>
                                            </div>
                                        </div>
                                        <div id="batch_validation_result" class="mt-2"></div>
                                    </div>
                                </div>
                                
                                <!-- Column 2: Batch Information -->
                                <div class="col-md-3">
                                    <div class="info-panel">
                                        <h6 class="panel-title">Batch Details</h6>
                                        <div id="batch_details_content" class="panel-content">
                                            <div class="placeholder-text">Batch information will appear here after scanning</div>
                                        </div>
                                    </div>
                                </div>
                                
                                <!-- Column 3: Location Information -->
                                <div class="col-md-3">
                                    <div class="info-panel">
                                        <h6 class="panel-title">Location Details</h6>
                                        <div id="location_details_content" class="panel-content">
                                            <!-- This will be populated based on user role -->
                                        </div>
                                    </div>
                                </div>
                                
                                <!-- Column 4: BOM Information -->
                                <div class="col-md-3">
                                    <div class="info-panel">
                                        <h6 class="panel-title">BOM Information</h6>
                                        <div id="bom_details_content" class="panel-content">
                                            <div class="placeholder-text">BOM details will appear here after scanning</div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                
                <!-- Employee Operations Section -->
                <div class="section operation-section mt-3">
                    <div class="section-head">Employee Operations</div>
                    <div class="section-body">
                        <div class="row">
                            <div class="col-md-12">
                                <div class="operations-grid">
                                    <div class="operation-input">
                                        <div class="form-group">
                                            <label for="scan_employee">Scan Employee:</label>
                                            <div class="input-group">
                                                <input type="text" id="scan_employee" class="form-control" placeholder="Employee ID" disabled>
                                                <div class="input-group-append">
                                                    <button id="add_employee_btn" class="btn btn-primary" disabled>
                                                        <i class="fa fa-plus mr-1"></i> Add
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                        <div id="employee_validation_message" class="mt-2"></div>
                                    </div>
                                    
                                    <div class="operations-table">
                                        <h6 class="mb-2">Operation Details</h6>
                                        <div class="table-responsive">
                                            <table class="table table-bordered" id="operations_table">
                                                <thead>
                                                    <tr>
                                                        <th>Operation</th>
                                                        <th>Employee Code</th>
                                                        <th>Employee Name</th>
                                                        <th>Action</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    <tr>
                                                        <td colspan="4" class="text-center text-muted">No operations added yet</td>
                                                    </tr>
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                
                <!-- Grid layout for inspection and rejection -->
                <div class="grid-layout mt-3">
                    <!-- Inspection Details Section -->
                    <div class="section inspection-section">
                        <div class="section-head">Visual Inspection Information</div>
                        <div class="section-body">
                            <div class="row">
                                <div class="col-md-6">
                                    <div class="form-group">
                                        <label for="inspection_qty">Inspection Qty: *</label>
                                        <input type="number" id="inspection_qty" class="form-control" placeholder="Inspection Qty">
                                    </div>
                                </div>
                                <div class="col-md-6">
                                    <div class="form-group">
                                        <label for="emp_barcode">Inspector:</label>
                                        <div class="input-group">
                                            <input type="text" id="emp_barcode" class="form-control" placeholder="HR-EMP-00001">
                                            <div class="input-group-append">
                                                <button id="verify_inspector_btn" class="btn btn-primary">
                                                    <i class="fa fa-check mr-1"></i> Verify
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <div id="inspector_validation_message" class="mt-2"></div>
                        </div>
                    </div>
                
                    <!-- Rejection Details Section -->
                    <div class="section rejection-section">
                        <div class="section-head">Rejection Details</div>
                        <div class="section-body">
                            <div class="row">
                                <div class="col-md-5">
                                    <div class="form-group">
                                        <label for="rejection_type">Defect Type:</label>
                                        <div class="defect-type-field position-relative">
                                            <input type="text" id="rejection_type" class="form-control" placeholder="Search defect type..." disabled autocomplete="off">
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
                                    <div class="form-group">
                                        <label for="rejection_qty">Quantity:</label>
                                        <input type="number" id="rejection_qty" class="form-control" placeholder="Qty" disabled>
                                    </div>
                                </div>
                                <div class="col-md-4">
                                    <div class="form-group">
                                        <label class="d-block">&nbsp;</label>
                                        <button id="add_rejection_btn" class="btn btn-primary" disabled>
                                            <i class="fa fa-plus mr-1"></i> Add
                                        </button>
                                    </div>
                                </div>
                            </div>
                            
                            <div class="table-responsive mt-2">
                                <table class="table table-bordered" id="rejections_table">
                                    <thead>
                                        <tr>
                                            <th>Rejection Type</th>
                                            <th>Qty</th>
                                            <th>Action</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        <tr>
                                            <td colspan="3" class="text-center text-muted">No rejections added</td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                </div>
                
                <!-- Submit Section -->
                <div class="section submit-section mt-3 mb-3">
                    <div class="text-center">
                        <button id="submit_process_btn" class="btn btn-lg btn-success">
                            <i class="fa fa-check-circle mr-2"></i> Submit Process
                        </button>
                        <div id="submit_message" class="mt-2"></div>
                    </div>
                </div>
            </div>
        `;

        this.wrapper.find('.layout-main-section').append(html);
    }

    bind_events() {
        // Collapsible sections
        this.wrapper.find('.section-head').on('click', (e) => {
            const $head = $(e.currentTarget);
            const $body = $head.next('.section-body');

            if ($body.is(':visible')) {
                $body.slideUp(200);
                $head.addClass('collapsed');
            } else {
                $body.slideDown(200);
                $head.removeClass('collapsed');
            }
        });

        // Batch validation
        this.wrapper.find('#validate_batch_btn').on('click', () => this.validate_batch());

        // Employee operations
        this.wrapper.find('#add_employee_btn').on('click', () => this.validate_employee());

        // Inspector verification
        this.wrapper.find('#verify_inspector_btn').on('click', () => this.verify_inspector());

        // Rejection handling
        this.wrapper.find('#add_rejection_btn').on('click', () => this.add_rejection());

        // Submit process
        this.wrapper.find('#submit_process_btn').on('click', () => this.submit_process());

        // Defect type dropdown handling
        this.setup_defect_type_dropdown();
    }

    setup_defect_type_dropdown() {
        const $rejectionTypeInput = this.wrapper.find('#rejection_type');
        const $defectDropdown = this.wrapper.find('.defect-dropdown');
        const $defectOptions = this.wrapper.find('.defect-options');
        const $defectSearch = this.wrapper.find('.defect-search');

        // Populate the defect options
        this.populate_defect_options();

        // Focus search input when dropdown opens
        $rejectionTypeInput.on('focus', () => {
            if (!$rejectionTypeInput.prop('disabled')) {
                $defectDropdown.show();
                $defectSearch.val('').focus();

                // Show all options when dropdown opens
                this.filter_defect_options('');
            }
        });

        // Handle clicking outside to close dropdown
        $(document).on('mousedown', (e) => {
            if (!$(e.target).closest('.defect-type-field').length) {
                $defectDropdown.hide();
            }
        });

        // Handle search input
        $defectSearch.on('input', (e) => {
            const searchTerm = $(e.target).val().trim().toLowerCase();
            this.filter_defect_options(searchTerm);
        });

        // Prevent form submission on enter in search
        $defectSearch.on('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();

                // If we have exactly one visible option, select it
                const $visibleOptions = $defectOptions.find('.defect-option:visible');
                if ($visibleOptions.length === 1) {
                    $visibleOptions.click();
                }
            }
        });
    }

    populate_defect_options() {
        const $defectOptions = this.wrapper.find('.defect-options');

        // Clear existing options
        $defectOptions.empty();

        // Add each defect type as an option
        this.all_defect_types.forEach(defectType => {
            const $option = $(`<div class="defect-option">${defectType}</div>`);

            // Handle option selection
            $option.on('click', () => {
                this.wrapper.find('#rejection_type').val(defectType);
                this.wrapper.find('.defect-dropdown').hide();
            });

            $defectOptions.append($option);
        });
    }

    filter_defect_options(searchTerm) {
        const $options = this.wrapper.find('.defect-option');

        $options.each(function() {
            const optionText = $(this).text().toLowerCase();
            if (optionText.includes(searchTerm)) {
                $(this).show();
            } else {
                $(this).hide();
            }
        });
    }

    validate_batch() {
        const batchNumber = this.wrapper.find('#scan_batch').val();
        const resultElement = this.wrapper.find('#batch_validation_result');
        const batchDetailsContent = this.wrapper.find('#batch_details_content');
        const locationDetailsContent = this.wrapper.find('#location_details_content');
        const bomDetailsContent = this.wrapper.find('#bom_details_content');

        if (!batchNumber) {
            resultElement.html(`
                <div class="alert alert-warning">
                    <i class="fa fa-exclamation-triangle"></i> Please scan or enter a batch number
                </div>
            `);
            return;
        }

        resultElement.html(`
            <div class="alert alert-info">
                <i class="fa fa-spinner fa-spin"></i> Validating batch number...
            </div>
        `);

        // Reset content areas
        batchDetailsContent.html(`<div class="placeholder-text">Loading batch information...</div>`);
        locationDetailsContent.html(`<div class="placeholder-text">Loading location information...</div>`);
        bomDetailsContent.html(`<div class="placeholder-text">Loading BOM information...</div>`);

        // Use default values from selected location if available
        const stage = this.default_stage || frappe.defaults.get_user_default("stage") || "";
        const warehouse = this.default_warehouse || frappe.defaults.get_user_default("warehouse") || "";

        // Call the validation method
        frappe.call({
            method: "smart_screens.smart_screens.utils.lot_validation.lot_validation",
            args: {
                mixed_barcode: batchNumber,
                stage: stage,
                warehouse: warehouse
            },
            callback: (response) => {
                if (response.message && !response.message.error) {
                    const data = response.message;

                    // Store batch info
                    this.batchInfo = {
                        sppBatchId: batchNumber,
                        item_code: data.item_code,
                        batch_no: data.batch_no,
                        warehouse: data.warehouse,
                        quantity: data.batch_quantity,
                        uom: data.uom || "Nos"
                    };

                    // Show success message
                    resultElement.html(`
                        <div class="alert alert-success">
                            <i class="fa fa-check-circle"></i> Batch validated successfully!
                        </div>
                    `);

                    // Display batch details in the dedicated column
                    batchDetailsContent.html(`
                        <div class="info-content">
                            <div><strong>Item:</strong> ${data.item_code}</div>
                            <div><strong>Batch:</strong> ${data.batch_no}</div>
                            <div><strong>Quantity:</strong> ${data.batch_quantity} ${data.uom || 'Nos'}</div>
                            <div><strong>Warehouse:</strong> ${data.warehouse}</div>
                            <div><strong>SPP Batch:</strong> ${batchNumber}</div>
                        </div>
                    `);

                    // Display location information in the dedicated column
                    if (this.location_data && this.location_data.length > 0) {
                        let locationHtml = '<div class="info-content">';

                        this.location_data.forEach(loc => {
                            locationHtml += `
                                <div>
                                    ${loc.location ? `<div><strong>Location:</strong> ${loc.location}</div>` : ''}
                                    ${loc.stage ? `<div><strong>Stage:</strong> ${loc.stage}</div>` : ''}
                                    ${loc.source_warehouse ? `<div><strong>Source WH:</strong> ${loc.source_warehouse}</div>` : ''}
                                    ${loc.target_warehouse ? `<div><strong>Target WH:</strong> ${loc.target_warehouse}</div>` : ''}
                                </div>
                            `;
                        });

                        locationHtml += '</div>';
                        locationDetailsContent.html(locationHtml);
                    } else {
                        locationDetailsContent.html(`<div class="text-muted">No location data available</div>`);
                    }

                    // Enable the employee section
                    this.wrapper.find('#scan_employee').prop('disabled', false);
                    this.wrapper.find('#add_employee_btn').prop('disabled', false);

                    // Fetch BOM details for the 4th column
                    this.fetch_bom_details(data.item_code);
                } else {
                    const errorMsg = response.message && response.message.error 
                        ? response.message.error 
                        : "Failed to validate batch number. Please check and try again.";
                        
                    resultElement.html(`
                        <div class="alert alert-danger">
                            <i class="fa fa-exclamation-circle"></i> ${errorMsg}
                        </div>
                    `);

                    // Reset content areas
                    batchDetailsContent.html(`<div class="placeholder-text">Batch information will appear here after scanning</div>`);
                    locationDetailsContent.html(`<div class="placeholder-text">Location information will appear here after scanning</div>`);
                    bomDetailsContent.html(`<div class="placeholder-text">BOM details will appear here after scanning</div>`);

                    // Reset batch info
                    this.batchInfo = null;

                    // Disable the employee section
                    this.wrapper.find('#scan_employee').prop('disabled', true);
                    this.wrapper.find('#add_employee_btn').prop('disabled', true);
                }
            }
        });
    }

    fetch_bom_details(item_code) {
        if (!item_code) return;

        // Get the BOM content placeholder in the dedicated column
        const bomDetailsContent = this.wrapper.find('#bom_details_content');

        // Show loading indicator
        bomDetailsContent.html(`
            <div class="text-center p-2">
                <i class="fa fa-spinner fa-spin"></i> Loading BOM information...
            </div>
        `);

        frappe.call({
            method: "smart_screens.smart_screens.utils.bom_validation.get_boms_by_component_item",
            args: {
                item_code: item_code
            },
            callback: (response) => {
                if (response.message && response.message.success) {
                    const bomData = response.message.data;

                    if (bomData.boms && bomData.boms.length > 0) {
                        // Store BOM details for later use
                        this.bom_details = bomData.boms;

                        // Create HTML for the BOM information in a compact format for the column
                        let bomHtml = '<div class="info-content">';

                        // Show first BOM by default
                        const firstBom = bomData.boms[0];

                        bomHtml += `
                            <div><strong>BOM No:</strong> ${firstBom.bom_no}</div>
                            <div><strong>Parent Item:</strong> ${firstBom.parent_item_code}</div>
                            <div><strong>Component Qty:</strong> ${firstBom.component_qty} ${firstBom.component_uom}</div>
                        `;

                        // If there are operations, show a badge with the count
                        if (firstBom.operations && firstBom.operations.length > 0) {
                            bomHtml += `
                                <div><strong>Operations:</strong> <span class="badge badge-info">${firstBom.operations.length}</span></div>
                            `;
                        }

                        // If there are multiple BOMs, add a selector
                        if (bomData.boms.length > 1) {
                            bomHtml += `
                                <div class="mt-2">
                                    <select id="bom_selector" class="form-control form-control-sm">
                            `;

                            bomData.boms.forEach((bom, index) => {
                                bomHtml += `<option value="${index}" ${index === 0 ? 'selected' : ''}>${bom.bom_no}</option>`;
                            });

                            bomHtml += `
                                    </select>
                                </div>
                            `;
                        }

                        bomHtml += '</div>';

                        // Update the BOM content column
                        bomDetailsContent.html(bomHtml);

                        // Add event handler for BOM selector if it exists
                        if (bomData.boms.length > 1) {
                            this.wrapper.find('#bom_selector').on('change', (e) => {
                                const selectedIndex = parseInt($(e.target).val());
                                this.display_selected_bom(selectedIndex);
                            });
                        }

                    } else {
                        // No BOMs found
                        bomDetailsContent.html(`
                            <div class="alert alert-warning mb-0">
                                <i class="fa fa-exclamation-triangle mr-2"></i>No BOMs found for this item
                            </div>
                        `);
                    }
                } else {
                    // Error in BOM response
                    bomDetailsContent.html(`
                        <div class="alert alert-danger mb-0">
                            <i class="fa fa-exclamation-circle mr-2"></i>Error fetching BOM information
                        </div>
                    `);
                }
            }
        });
    }

    display_selected_bom(index) {
        if (!this.bom_details || !this.bom_details[index]) return;

        const bom = this.bom_details[index];
        const bomDetailsContent = this.wrapper.find('#bom_details_content');

        // Create HTML just for the BOM details (preserving the selector)
        const bomSelector = bomDetailsContent.find('#bom_selector').clone();

        // Create the new compact BOM HTML
        let newBomHtml = '<div class="info-content">';

        newBomHtml += `
            <div><strong>BOM No:</strong> ${bom.bom_no}</div>
            <div><strong>Parent Item:</strong> ${bom.parent_item_code}</div>
            <div><strong>Component Qty:</strong> ${bom.component_qty} ${bom.component_uom}</div>
        `;

        // If there are operations, show a badge with the count
        if (bom.operations && bom.operations.length > 0) {
            newBomHtml += `
                <div><strong>Operations:</strong> <span class="badge badge-info">${bom.operations.length}</span></div>
            `;
        }

        newBomHtml += '</div>';

        // Update the BOM content column
        bomDetailsContent.html(newBomHtml);

        // Add the selector back
        if (bomSelector.length) {
            bomSelector.val(index);
            bomDetailsContent.append(bomSelector);

            // Re-bind the change event
            bomSelector.on('change', (e) => {
                const selectedIndex = parseInt($(e.target).val());
                this.display_selected_bom(selectedIndex);
            });
        }
    }

    validate_employee() {
        const employeeCode = this.wrapper.find('#scan_employee').val();
        const messageElement = this.wrapper.find('#employee_validation_message');

        if (!employeeCode) {
            messageElement.html(`
                <div class="alert alert-warning">
                    <i class="fa fa-exclamation-triangle"></i> Please scan or enter an employee ID
                </div>
            `);
            return;
        }

        messageElement.html(`
            <div class="alert alert-info">
                <i class="fa fa-spinner fa-spin"></i> Validating employee...
            </div>
        `);

        frappe.call({
            method: "smart_screens.smart_screens.utils.emp_validation.validate_employee_designation",
            args: {
                employee_code: employeeCode
            },
            callback: (response) => {
                if (response.message && response.message.success) {
                    const data = response.message;
                    const employeeName = data.employee.employee_name;

                    if (data.allowed_operations && data.allowed_operations.length > 0) {
                        // Show operation selection
                        const operationOptions = data.allowed_operations.map(op => 
                            `<option value="${op}">${op}</option>`
                        ).join('');

                        messageElement.html(`
                            <div class="alert alert-success">
                                <i class="fa fa-check-circle"></i> Employee validated: ${employeeName}<br>
                                <div class="mt-2">
                                    <div class="form-group">
                                        <label>Select Operation:</label>
                                        <select id="operation_select" class="form-control mb-2">
                                            ${operationOptions}
                                        </select>
                                        <button id="confirm_operation_btn" class="btn btn-primary btn-sm">Add Operation</button>
                                    </div>
                                </div>
                            </div>
                        `);

                        // Bind confirm operation button
                        this.wrapper.find('#confirm_operation_btn').on('click', () => {
                            const selectedOperation = this.wrapper.find('#operation_select').val();

                            // Add to operations table
                            this.add_operation_to_table(selectedOperation, employeeCode, employeeName);

                            // Clear message and input
                            messageElement.html('');
                            this.wrapper.find('#scan_employee').val('');
                        });
                    } else {
                        messageElement.html(`
                            <div class="alert alert-warning">
                                <i class="fa fa-exclamation-triangle"></i> No allowed operations found for this employee
                            </div>
                        `);
                    }
                } else {
                    const errorMsg = response.message ? response.message.message : "Failed to validate employee";

                    messageElement.html(`
                        <div class="alert alert-danger">
                            <i class="fa fa-exclamation-circle"></i> ${errorMsg}
                        </div>
                    `);
                }
            }
        });
    }

    add_operation_to_table(operation, employeeCode, employeeName) {
        const operationsTable = this.wrapper.find('#operations_table tbody');

        // Clear the empty message if it exists
        if (operationsTable.find('tr td.text-muted').length) {
            operationsTable.empty();
        }

        // Check if this operation already exists in the table
        if (this.operationDetails && this.operationDetails.length > 0) {
            const existingOperation = this.operationDetails.find(op => op.operation === operation);
            if (existingOperation) {
                frappe.msgprint(`Operation "${operation}" is already added. Duplicate operations are not allowed.`);
                return;
            }
        }

        // Store the operation in our operations array
        if (!this.operationDetails) {
            this.operationDetails = [];
        }

        this.operationDetails.push({
            operation: operation,
            employeeCode: employeeCode,
            employeeName: employeeName
        });

        // Add the new row
        operationsTable.append(`
            <tr data-op="${operation}" data-emp="${employeeCode}">
                <td>${operation}</td>
                <td>${employeeCode}</td>
                <td>${employeeName}</td>
                <td>
                    <button class="btn btn-sm btn-danger remove-op">
                        <i class="fa fa-trash"></i>
                    </button>
                </td>
            </tr>
        `);

        // Bind remove button
        operationsTable.find('.remove-op').last().on('click', (e) => {
            const $row = $(e.currentTarget).closest('tr');
            const operation = $row.data('op');
            const employeeCode = $row.data('emp');

            // Remove from our operations array
            this.operationDetails = this.operationDetails.filter(op => 
                !(op.operation === operation && op.employeeCode === employeeCode)
            );

            // Remove row from DOM
            $row.remove();

            // Add empty message if no operations left
            if (operationsTable.find('tr').length === 0) {
                operationsTable.html(`
                    <tr>
                        <td colspan="4" class="text-center text-muted">No operations added yet</td>
                    </tr>
                `);
            }
        });
    }

    verify_inspector() {
        const inspectorCode = this.wrapper.find('#emp_barcode').val();
        const inspectionQty = this.wrapper.find('#inspection_qty').val();
        const messageElement = this.wrapper.find('#inspector_validation_message');

        if (!inspectorCode || !inspectionQty || inspectionQty <= 0) {
            messageElement.html(`
                <div class="alert alert-warning">
                    <i class="fa fa-exclamation-triangle"></i> Please enter both inspector code and valid quantity
                </div>
            `);
            return;
        }

        messageElement.html(`
            <div class="alert alert-info">
                <i class="fa fa-spinner fa-spin"></i> Verifying inspector...
            </div>
        `);

        frappe.call({
            method: "smart_screens.smart_screens.utils.emp_validation.validate_employee_designation",
            args: {
                employee_code: inspectorCode
            },
            callback: (response) => {
                if (response.message && response.message.success) {
                    const data = response.message;
                    const inspectorName = data.employee.employee_name;

                    // Store inspector details
                    this.inspectionInfo = {
                        inspectorCode: inspectorCode,
                        inspectorName: inspectorName,
                        inspectionQuantity: inspectionQty
                    };

                    messageElement.html(`
                        <div class="alert alert-success">
                            <i class="fa fa-check-circle"></i> Inspector verified: ${inspectorName}
                        </div>
                    `);

                    // Enable rejection section
                    this.wrapper.find('#rejection_type').prop('disabled', false);
                    this.wrapper.find('#rejection_qty').prop('disabled', false);
                    this.wrapper.find('#add_rejection_btn').prop('disabled', false);
                } else {
                    const errorMsg = response.message ? response.message.message : "Failed to verify inspector";

                    messageElement.html(`
                        <div class="alert alert-danger">
                            <i class="fa fa-exclamation-circle"></i> ${errorMsg}
                        </div>
                    `);
                }
            }
        });
    }

    add_rejection() {
        const rejectionType = this.wrapper.find('#rejection_type').val();
        const rejectionQty = this.wrapper.find('#rejection_qty').val();

        if (!rejectionType || !rejectionQty || rejectionQty <= 0) {
            frappe.msgprint("Please enter both rejection type and valid quantity");
            return;
        }

        const rejectionsTable = this.wrapper.find('#rejections_table tbody');

        // Clear the empty message if it exists
        if (rejectionsTable.find('tr td.text-muted').length) {
            rejectionsTable.empty();
        }

        // Store the rejection in our rejections array
        if (!this.rejectionDetails) {
            this.rejectionDetails = [];
        }

        this.rejectionDetails.push({
            rejectionType: rejectionType,
            quantity: rejectionQty
        });

        // Add the new row
        rejectionsTable.append(`
            <tr data-type="${rejectionType}" data-qty="${rejectionQty}">
                <td>${rejectionType}</td>
                <td>${rejectionQty}</td>
                <td>
                    <button class="btn btn-sm btn-danger remove-rejection">
                        <i class="fa fa-trash"></i>
                    </button>
                </td>
            </tr>
        `);

        // Bind remove button
        rejectionsTable.find('.remove-rejection').last().on('click', (e) => {
            const $row = $(e.currentTarget).closest('tr');
            const rejectionType = $row.data('type');
            const quantity = $row.data('qty');

            // Remove from our rejections array
            this.rejectionDetails = this.rejectionDetails.filter(rej => 
                !(rej.rejectionType === rejectionType && rej.quantity == quantity)
            );

            // Remove row from DOM
            $row.remove();

            // Add empty message if no rejections left
            if (rejectionsTable.find('tr').length === 0) {
                rejectionsTable.html(`
                    <tr>
                        <td colspan="3" class="text-center text-muted">No rejections added</td>
                    </tr>
                `);
            }
        });

        // Clear inputs
        this.wrapper.find('#rejection_type').val('');
        this.wrapper.find('#rejection_qty').val('');
    }

    submit_process() {
        const messageElement = this.wrapper.find('#submit_message');

        // Basic validations
        if (!this.batchInfo) {
            messageElement.html(`
                <div class="alert alert-warning">
                    <i class="fa fa-exclamation-triangle"></i> Please validate a batch first
                </div>
            `);
            return;
        }

        if (!this.operationDetails || this.operationDetails.length === 0) {
            messageElement.html(`
                <div class="alert alert-warning">
                    <i class="fa fa-exclamation-triangle"></i> Please add at least one operation
                </div>
            `);
            return;
        }

        if (!this.inspectionInfo) {
            messageElement.html(`
                <div class="alert alert-warning">
                    <i class="fa fa-exclamation-triangle"></i> Please complete inspection information
                </div>
            `);
            return;
        }

        // Validate that the number of BOM operations matches the employee operation table
        if (this.bom_details && this.bom_details.length > 0) {
            const firstBom = this.bom_details[0];
            const bomOperations = firstBom.operations || [];
            
            // Check if "Final Visual Inspection" operation needs special handling
            const hasFinalVisualInspection = bomOperations.some(op => 
                op.operation && op.operation.includes("Final Visual Inspection")
            );
            
            // Check if inspector is present for Final Visual Inspection
            if (hasFinalVisualInspection) {
                if (!this.inspectionInfo.inspectorCode || !this.inspectionInfo.inspectorName) {
                    messageElement.html(`
                        <div class="alert alert-warning">
                            <i class="fa fa-exclamation-triangle"></i> Final Visual Inspection operation requires an inspector. Please verify an inspector.
                        </div>
                    `);
                    return;
                }
            }
            
            // Check number of operations matches (excluding Final Visual Inspection if present)
            const requiredOperationsCount = hasFinalVisualInspection ? 
                bomOperations.length - 1 : bomOperations.length;
                
            if (this.operationDetails.length !== requiredOperationsCount) {
                messageElement.html(`
                    <div class="alert alert-warning">
                        <i class="fa fa-exclamation-triangle"></i> Number of employee operations (${this.operationDetails.length}) 
                        does not match BOM operations (${requiredOperationsCount}).
                    </div>
                `);
                return;
            }
        }

        // Create a modal for visually interesting progress tracking
        this.processModal.createModal();

        // Ensure all values are converted to the proper format (strings for text, numbers for quantities)
        if (this.inspectionInfo && this.inspectionInfo.inspectionQuantity) {
            this.inspectionInfo.inspectionQuantity = parseFloat(this.inspectionInfo.inspectionQuantity);
        }

        // Convert rejection quantities to numbers
        if (this.rejectionDetails && this.rejectionDetails.length > 0) {
            this.rejectionDetails.forEach(rejection => {
                if (rejection.quantity) {
                    rejection.quantity = parseFloat(rejection.quantity);
                }
            });
        }

        // Serialize all the data for submission
        const formData = {
            batchInfo: this.batchInfo,
            operationDetails: this.operationDetails || [],
            inspectionInfo: this.inspectionInfo,
            rejectionDetails: this.rejectionDetails || [],
            locationInfo: this.location_data || [] // Add location data to form submission
        };

        // Disable the submit button to prevent double submissions
        this.wrapper.find('#submit_process_btn').prop('disabled', true);

        // Submit the process record
        frappe.call({
            method: "smart_screens.smart_screens.api.sub_lot_process.create_sublot_process",
            args: { 
                form_data: formData
            },
            callback: (response) => {
                if (response.message && response.message.status === "success") {
                    const trackerId = response.message.tracker_id;
                    const processRecord = response.message.process_record;
                    
                    // Store details for later use (e.g., printing label)
                    this.processDetails = {
                        record: processRecord,
                        tracker: trackerId
                    };
                    
                    // Start polling for status updates with the modal
                    this.processModal.startPolling(trackerId, {
                        onSuccess: (data) => {
                            // Store the completed process ID for later use
                            this.completedProcessId = data.reference_name;
                            
                            // Set up the print label action
                            $('.btn-print-label').off('click').on('click', () => {
                                this.labelPrinter.printLabel(data.reference_name);
                            });
                            
                            // Set up the view details action
                            $('.btn-view-details').off('click').on('click', () => {
                                frappe.set_route("Form", data.reference_doctype, data.reference_name);
                            });
                            
                            // Set up the new process action
                            $('.btn-new-process').off('click').on('click', () => {
                                this.reset_form();
                                this.wrapper.find('#scan_batch').focus();
                            });
                        },
                        onError: () => {
                            // Re-enable the submit button on error
                            this.wrapper.find('#submit_process_btn').prop('disabled', false);
                        }
                    });
                } else {
                    // Re-enable the submit button
                    this.wrapper.find('#submit_process_btn').prop('disabled', false);
                    
                    const errorMsg = response.message ? response.message.message : "Failed to save process";

                    // Show error in the modal or message element
                    if (this.processModal) {
                        this.processModal.showError(errorMsg);
                    } else {
                        messageElement.html(`
                            <div class="alert alert-danger">
                                <i class="fa fa-exclamation-circle"></i> ${errorMsg}
                            </div>
                        `);
                    }
                }
            },
            error: (err) => {
                // Re-enable the submit button
                this.wrapper.find('#submit_process_btn').prop('disabled', false);
                
                console.error("Error saving process:", err);

                // Show error in the modal or message element
                if (this.processModal) {
                    this.processModal.showError("Error saving process. Please try again.");
                } else {
                    messageElement.html(`
                        <div class="alert alert-danger">
                            <i class="fa fa-exclamation-circle"></i> Error saving process. Please try again.
                        </div>
                    `);
                }
            }
        });
    }

    reset_form() {
        // Clear all inputs
        this.wrapper.find('input').val('');

        // Reset tables
        this.wrapper.find('#operations_table tbody').html(`
            <tr>
                <td colspan="4" class="text-center text-muted">No operations added yet</td>
            </tr>
        `);

        this.wrapper.find('#rejections_table tbody').html(`
            <tr>
                <td colspan="3" class="text-center text-muted">No rejections added</td>
            </tr>
        `);

        // Clear validation messages
        this.wrapper.find('#batch_validation_result').empty();
        this.wrapper.find('#employee_validation_message').empty();
        this.wrapper.find('#inspector_validation_message').empty();
        this.wrapper.find('#submit_message').empty();

        // Reset content placeholders
        this.wrapper.find('#batch_details_content').html(`<div class="placeholder-text">Batch information will appear here after scanning</div>`);
        this.wrapper.find('#location_details_content').html(`<div class="placeholder-text">Location information will appear here after scanning</div>`);
        this.wrapper.find('#bom_details_content').html(`<div class="placeholder-text">BOM details will appear here after scanning</div>`);

        // Disable controls
        this.wrapper.find('#scan_employee').prop('disabled', true);
        this.wrapper.find('#add_employee_btn').prop('disabled', true);
        this.wrapper.find('#rejection_type').prop('disabled', true);
        this.wrapper.find('#rejection_qty').prop('disabled', true);
        this.wrapper.find('#add_rejection_btn').prop('disabled', true);

        // Reset stored data
        this.batchInfo = null;
        this.operationDetails = null;
        this.inspectionInfo = null;
        this.rejectionDetails = null;
        this.bom_details = null;
    }

    // Stage mapping helpers used by the process modal
    getStageKeyFromName(stageName) {
        // Map stage names from backend to CSS data-stage keys
        const stageMap = {
            "Data Validation": "data-validation",
            "Document Creation": "document-creation",
            "Operations Setup": "operations-setup",
            "Rejection Data": "rejection-data",
            "Location Setup": "location-setup",
            "Document Saving": "document-saving",
            "Document Submission": "document-submission",
            "Sub Lot Creation": "sublot-creation",
            "Work Order": "work-order",
            "Complete": "complete"
        };
        
        return stageMap[stageName] || "data-validation";
    }
    
    getStageIndex(stageKey) {
        // Map stage keys to indices for comparison
        const stageIndices = {
            "data-validation": 0,
            "document-creation": 1,
            "operations-setup": 2,
            "rejection-data": 3,
            "location-setup": 4,
            "document-saving": 5,
            "document-submission": 6,
            "sublot-creation": 7,
            "work-order": 8,
            "complete": 9
        };
        
        return stageIndices[stageKey] || 0;
    }
}