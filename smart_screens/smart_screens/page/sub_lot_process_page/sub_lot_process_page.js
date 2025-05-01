frappe.pages['sub_lot_process_page'].on_page_load = function(wrapper) {
    const page = frappe.ui.make_app_page({
        parent: wrapper,
        title: 'Sub Lot Process',
        single_column: true
    });
     show_location_selection_dialog(function(selected) {
        page.selected_location = selected;
        new SubLotProcessPage(page);
    });
};

// Refresh handler will not show the dialog again
frappe.pages['sub_lot_process_page'].refresh = function(wrapper) {
    // Just refresh the page content if needed
    if (frappe.container.page.selected_location) {
        frappe.container.page.sublot_process_page.update_location_ui();
    }
};

function show_location_selection_dialog(callback) {
    frappe.call({
        method: "smart_screens.smart_screens.utils.emp_validation.get_location_by_role",
        callback: function(response) {
            let locations = response.message || [];
            if (!locations.length) {
                frappe.msgprint("No locations available for your role. Please contact admin.");
                return;
            }
            
            // If only one location, use it directly without showing dialog
            if (locations.length === 1) {
                callback(locations[0]);
                return;
            }
            
            let options = locations.map(loc => {
                let label = loc.location;
                if (loc.stage) label += ` (${loc.stage})`;
                if (loc.source_warehouse) label += ` - ${loc.source_warehouse}`;
                return label;
            });
            
            let dialog = new frappe.ui.Dialog({
                title: 'Select Location',
                fields: [
                    {
                        label: 'Location',
                        fieldname: 'location',
                        fieldtype: 'Select',
                        options: options,
                        reqd: 1
                    }
                ],
                primary_action_label: 'Select',
                primary_action(values) {
                    let selected = locations[options.indexOf(values.location)];
                    dialog.hide();
                    if (callback) callback(selected);
                }
            });
            dialog.show();
        }
    });
}

class SubLotProcessPage {
    constructor(page) {
        this.page = page;
        this.wrapper = $(page.wrapper);
        
        // Get location data directly from the page
        this.location_data = [page.selected_location];
        this.default_stage = page.selected_location.stage || "";
        this.default_warehouse = page.selected_location.source_warehouse || "";
        
        // Store reference to this instance on the page
        page.sublot_process_page = this;
        
        // Add function to generate random badge colors
        this.badgeColors = ["primary", "secondary", "success", "danger", "warning", "info", "dark"];
        
        this.init_defect_types();
        this.make();
        this.bind_events();
        this.update_location_ui();
    }

    // Returns a random badge color class
    getRandomBadgeColor() {
        const randomIndex = Math.floor(Math.random() * this.badgeColors.length);
        return this.badgeColors[randomIndex];
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

        // Add CSS for styling
        this.add_page_styles();

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
                        locationDetailsContent.html(`
                            <div class="alert alert-warning mb-0">
                                <i class="fa fa-exclamation-triangle mr-2"></i>No location information available
                            </div>
                        `);
                    }

                    // Enable the employee section and prepare operation dropdown
                    this.wrapper.find('#scan_employee').prop('disabled', false);
                    this.wrapper.find('#add_employee_btn').prop('disabled', false);
                    
                    // Check if operation dropdown exists, if not, create it
                    if (this.wrapper.find('#operation_type').length === 0) {
                        // Add operation dropdown before the employee scan input
                        const operationDropdown = `
                            <div class="form-group">
                                <label for="operation_type">Select Operation:</label>
                                <select id="operation_type" class="form-control">
                                    <option value="">-- Select Operation --</option>
                                </select>
                            </div>
                        `;
                        this.wrapper.find('#scan_employee').closest('.form-group').before(operationDropdown);
                    }

                    // Fetch BOM details for the 4th column and populate operation dropdown
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
                item_code: item_code,
                get_default_only: 1  // Only get default and active BOM
            },
            callback: (response) => {
                if (response.message && response.message.success) {
                    const bomData = response.message.data;

                    if (bomData.boms && bomData.boms.length > 0) {
                        // Store BOM details for later use
                        this.bom_details = bomData.boms;

                        // Use the default BOM (should be the only one returned)
                        const defaultBom = bomData.boms[0];

                        // Create HTML for the BOM information
                        let bomHtml = '<div class="info-content">';
                        bomHtml += `
                            <div><strong>BOM No:</strong> ${defaultBom.bom_no}</div>
                            <div><strong>Parent Item:</strong> ${defaultBom.parent_item_code}</div>
                            <div><strong>Default:</strong> <span class="text-success">Yes</span></div>
                            <div><strong>Active:</strong> <span class="text-success">Yes</span></div>
                        `;

                        // If there are operations, list them with colored badges
                        if (defaultBom.operations && defaultBom.operations.length > 0) {
                            bomHtml += `<div><strong>Operations:</strong></div>`;
                            bomHtml += `<div class="operations-list">`;
                            defaultBom.operations.forEach(op => {
                                if (op.operation) {
                                    const badgeColor = this.getRandomBadgeColor();
                                    bomHtml += `<span class="badge badge-${badgeColor} mr-1 mb-1">${op.operation}</span>`;
                                }
                            });
                            bomHtml += `</div>`;
                        }

                        bomHtml += '</div>';

                        // Update the BOM content column
                        bomDetailsContent.html(bomHtml);

                        // Populate operation dropdown
                        const operationDropdown = this.wrapper.find('#operation_type');
                        if (operationDropdown.length > 0) {
                            operationDropdown.empty();
                            operationDropdown.append('<option value="">-- Select Operation --</option>');
                            if (defaultBom.operations && defaultBom.operations.length > 0) {
                                defaultBom.operations.forEach(op => {
                                    if (op.operation) {
                                        operationDropdown.append(`<option value="${op.operation}">${op.operation}</option>`);
                                    }
                                });
                            }
                        }
                    } else {
                        // No default BOMs found
                        bomDetailsContent.html(`
                            <div class="alert alert-warning mb-0">
                                <i class="fa fa-exclamation-triangle mr-2"></i>No default active BOM found for this item
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
        `;

        // If there are operations, list the operation names with colored badges
        if (bom.operations && bom.operations.length > 0) {
            newBomHtml += `<div><strong>Operations:</strong></div>`;
            newBomHtml += `<div class="operations-list">`;
            bom.operations.forEach(op => {
                if (op.operation) {
                    const badgeColor = this.getRandomBadgeColor();
                    newBomHtml += `<span class="badge badge-${badgeColor} mr-1 mb-1">${op.operation}</span>`;
                }
            });
            newBomHtml += `</div>`;
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
                                <div class="col-md-8">
                                    <div class="form-group">
                                        <label for="inspection_qty">Inspection Qty: *</label>
                                        <input type="number" id="inspection_qty" class="form-control" placeholder="Inspection Qty">
                                    </div>
                                </div>
                                <div class="col-md-4">
                                    <div class="form-group">
                                        <label class="d-block">&nbsp;</label>
                                        <button id="verify_inspector_btn" class="btn btn-primary">
                                            <i class="fa fa-check mr-1"></i> Verify Qty
                                        </button>
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

    add_page_styles() {
        $('<style>').text(`
            /* Vibrant color scheme with better text visibility */
            .sub-lot-process-page {
                background: #1E293B;
                color: #FFFFFF;
            }
            
            .sub-lot-process-page .section {
                margin-bottom: 20px;
                background-color: #0F172A;
                border: 1px solid #334155;
                border-radius: 4px;
                box-shadow: 0 2px 4px rgba(0,0,0,0.3);
            }
            
            .sub-lot-process-page .section-head {
                font-size: 16px;
                font-weight: bold;
                margin-bottom: 15px;
                padding: 8px 12px;
                border-bottom: 1px solid #475569;
                cursor: pointer;
                background-color: #38BDF8;
                color: #0F172A;
                border-radius: 4px 4px 0 0;
            }
            
            .sub-lot-process-page .section-body {
                padding: 15px;
                background-color: #0F172A;
            }
            
            .sub-lot-process-page .section-head.collapsed {
                color: #CBD5E1;
                background-color: #1E4D8C;
            }
            
            .sub-lot-process-page .alert {
                border-radius: 4px;
                margin-bottom: 15px;
                background-color: #0F172A;
                border: 1px solid #334155;
                color: #F8FAFC;
            }
            
            .sub-lot-process-page .alert-success {
                border-left: 4px solid #22C55E;
                background-color: rgba(34, 197, 94, 0.1);
            }
            
            .sub-lot-process-page .alert-danger {
                border-left: 4px solid #EF4444;
                background-color: rgba(239, 68, 68, 0.1);
            }
            
            .sub-lot-process-page .alert-info {
                border-left: 4px solid #38BDF8;
                background-color: rgba(56, 189, 248, 0.1);
            }
            
            .sub-lot-process-page .alert-warning {
                border-left: 4px solid #F59E0B;
                background-color: rgba(245, 158, 11, 0.1);
            }
            
            .sub-lot-process-page table th {
                background-color: #38BDF8;
                color: #0F172A;
                font-weight: 600;
            }
            
            .sub-lot-process-page table td {
                background-color: #1E293B;
                border-color: #334155;
                color: #F8FAFC;
            }
            
            /* Vibrant buttons */
            .sub-lot-process-page .btn-primary {
                background-color: #2563EB !important;
                border-color: #1D4ED8 !important;
                color: #FFFFFF !important;
            }
            
            .sub-lot-process-page .btn-primary:hover, 
            .sub-lot-process-page .btn-primary:focus, 
            .sub-lot-process-page .btn-primary:active {
                background-color: #1D4ED8 !important;
                border-color: #1E40AF !important;
            }
            
            .sub-lot-process-page .btn-danger {
                background-color: #EF4444 !important;
                border-color: #DC2626 !important;
                color: #FFFFFF !important;
            }
            
            .sub-lot-process-page .btn-danger:hover,
            .sub-lot-process-page .btn-danger:focus,
            .sub-lot-process-page .btn-danger:active {
                background-color: #DC2626 !important;
                border-color: #B91C1C !important;
            }
            
            .sub-lot-process-page .btn-success {
                background-color: #22C55E !important;
                border-color: #16A34A !important;
                color: #FFFFFF !important;
            }
            
            .sub-lot-process-page .btn-success:hover,
            .sub-lot-process-page .btn-success:focus,
            .sub-lot-process-page .btn-success:active {
                background-color: #16A34A !important;
                border-color: #15803D !important;
            }
            
            .sub-lot-process-page .grid-layout {
                display: grid;
                grid-template-columns: 1fr 1fr;
                gap: 20px;
            }
            
            /* Defect Dropdown Styles */
            .sub-lot-process-page .defect-type-field {
                position: relative;
            }
            
            .sub-lot-process-page .defect-dropdown {
                position: absolute;
                z-index: 1000;
                border: 1px solid #334155;
                border-radius: 4px;
                box-shadow: 0 4px 8px rgba(0,0,0,0.5);
                background-color: #1E293B;
            }
            
            .sub-lot-process-page .defect-option {
                padding: 6px 12px;
                cursor: pointer;
                color: #F8FAFC;
            }
            
            .sub-lot-process-page .defect-option:hover {
                background-color: #2563EB;
                color: #FFFFFF;
            }
            
            .sub-lot-process-page .defect-option.selected {
                background-color: #1D4ED8;
                color: #FFFFFF;
            }

            .sub-lot-process-page .location-info-container {
                display: flex;
                flex-wrap: wrap;
                gap: 10px;
                align-items: center;
            }
            
            .sub-lot-process-page .location-item {
                display: flex;
                flex-wrap: wrap;
                gap: 12px;
                align-items: center;
            }
            
            .sub-lot-process-page .location-item span {
                white-space: nowrap;
                color: #F8FAFC;
            }
            
            .sub-lot-process-page .combined-info-section .card {
                height: 100%;
                box-shadow: 0 2px 4px rgba(0,0,0,0.3);
                background-color: #0F172A;
                border: 1px solid #334155;
            }
            
            .sub-lot-process-page .combined-info-section .card-header {
                font-size: 14px;
                padding: 8px 15px;
                background-color: #38BDF8;
                color: #0F172A;
                border-bottom: 1px solid #334155;
                font-weight: 600;
            }
            
            .sub-lot-process-page .combined-info-section .card-body {
                background-color: #0F172A;
            }
            
            .sub-lot-process-page #batch_details .card {
                border: 1px solid #334155;
                box-shadow: none;
            }
            
            .sub-lot-process-page #batch_details_content {
                background-color: #182234;
                font-size: 13px;
                line-height: 1.5;
                padding: 10px;
                border-radius: 4px;
                border: 1px solid #334155;
                color: #F8FAFC;
            }
            
            .sub-lot-process-page #location_details_content {
                background-color: #1e3a5f;
                font-size: 13px;
                line-height: 1.5;
                padding: 10px;
                border-radius: 4px;
                border: 1px solid #334155;
                color: #F8FAFC;
            }
            
            .sub-lot-process-page #bom_details_content {
                background-color: #0F172A;
                font-size: 13px;
                line-height: 1.5;
                padding: 10px;
                border-radius: 4px;
                border: 1px solid #334155;
                color: #F8FAFC;
            }
            
            .sub-lot-process-page .panel-content {
                font-size: 13px;
                line-height: 1.5;
                background-color: #0F172A;
                padding: 10px;
                border-radius: 4px;
                border: 1px solid #334155;
                color: #F8FAFC;
            }
            
            .sub-lot-process-page .info-content div {
                margin-bottom: 6px;
                color: #F8FAFC;
            }
            
            .sub-lot-process-page .placeholder-text {
                color: #94A3B8;
                font-style: italic;
                font-size: 12px;
            }
            
            .sub-lot-process-page .badge {
                font-size: 11px;
                padding: 3px 6px;
                border-radius: 3px;
            }

            .sub-lot-process-page .badge-info {
                background-color: #0EA5E9;
                color: #FFFFFF;
            }
            
            /* Make input button more prominent */
            .sub-lot-process-page #scan_batch {
                font-size: 16px;
                font-weight: 500;
                background-color: #FFFFFF;
                border: 1px solid #475569;
                color: #0F172A;
            }
            
            /* Form input styling - White backgrounds */
            .sub-lot-process-page input.form-control,
            .sub-lot-process-page select.form-control {
                background-color: #FFFFFF;
                border: 1px solid #475569;
                color: #0F172A;
            }
            
            .sub-lot-process-page input.form-control:focus,
            .sub-lot-process-page select.form-control:focus {
                border-color: #2563EB;
                box-shadow: 0 0 0 0.2rem rgba(37, 99, 235, 0.25);
                background-color: #FFFFFF;
                color: #0F172A;
            }
            
            .sub-lot-process-page input.form-control::placeholder,
            .sub-lot-process-page select.form-control::placeholder {
                color: #64748B;
            }
            
            /* Responsive adjustments for the four-column layout */
            @media (max-width: 992px) {
                .sub-lot-process-page .combined-info-section .row > div {
                    margin-bottom: 15px;
                }
            }

            /* Operations Grid Layout */
            .sub-lot-process-page .operations-grid {
                display: grid;
                grid-template-columns: 300px 1fr;
                gap: 20px;
                align-items: start;
            }
            
            .sub-lot-process-page .operation-input {
                background: #0F172A;
                padding: 15px;
                border-radius: 4px;
                border: 1px solid #334155;
            }
            
            .sub-lot-process-page .operations-table {
                background: #0F172A;
                padding: 15px;
                border-radius: 4px;
                border: 1px solid #334155;
            }

            @media (max-width: 768px) {
                .sub-lot-process-page .operations-grid {
                    grid-template-columns: 1fr;
                }
            }
            
            /* Apply styles to page layout elements */
            .layout-main-section {
                background-color: #1E293B !important;
            }
            
            .page-head {
                background-color: #38BDF8 !important;
                color: #0F172A !important;
            }
            
            .page-head h3 {
                color: #0F172A !important;
            }
            
            .page-container {
                background-color: #1E293B !important;
            }

            /* Strong text in better contrast */
            .sub-lot-process-page strong {
                color: #FFFFFF;
                font-weight: 600;
            }

            .process-progress-container {
                background-color: #1E293B;
                border-radius: 8px;
                border: 1px solid #334155;
                padding: 20px;
                margin-top: 20px;
            }
            
            .process-stages {
                display: flex;
                justify-content: space-between;
                margin-bottom: 30px;
                position: relative;
                flex-wrap: nowrap;
                overflow-x: auto;
                padding-bottom: 5px;
            }
            
            .stage-item {
                display: flex;
                flex-direction: column;
                align-items: center;
                position: relative;
                flex: 1;
                min-width: 80px;
                opacity: 0.5;
                transition: all 0.3s ease;
            }
            
            .stage-item.active {
                opacity: 1;
            }
            
            .stage-item.current .stage-icon {
                background-color: #2563EB;
                border-color: #1D4ED8;
                color: white;
                box-shadow: 0 0 10px rgba(37, 99, 235, 0.5);
                animation: pulse 1.5s infinite;
            }
            
            .stage-item.completed .stage-icon {
                background-color: #22C55E;
                border-color: #16A34A;
                color: white;
            }
            
            .stage-icon {
                width: 40px;
                height: 40px;
                border-radius: 50%;
                background-color: #475569;
                border: 2px solid #64748B;
                display: flex;
                justify-content: center;
                align-items: center;
                margin-bottom: 8px;
                z-index: 2;
                transition: all 0.3s ease;
                color: #F8FAFC;
            }
            
            .stage-line {
                position: absolute;
                top: 20px;
                left: 50%;
                width: 100%;
                height: 2px;
                background-color: #475569;
                z-index: 1;
            }
            
            .stage-item:first-child .stage-line {
                width: 50%;
                left: 50%;
            }
            
            .stage-item:last-child .stage-line,
            .stage-item.final .stage-line {
                display: none;
            }
            
            .stage-item.active.completed .stage-line {
                background-color: #22C55E;
            }
            
            .stage-label {
                font-size: 12px;
                text-align: center;
                color: #CBD5E1;
                margin-top: 5px;
                white-space: nowrap;
            }
            
            .stage-item.active .stage-label {
                color: #F8FAFC;
                font-weight: bold;
            }
            
            .process-details {
                text-align: center;
                margin-bottom: 20px;
            }
            
            .process-title {
                font-size: 18px;
                font-weight: bold;
                margin-bottom: 10px;
                color: #F8FAFC;
            }
            
            .process-description {
                font-size: 14px;
                color: #CBD5E1;
                margin-bottom: 15px;
            }
            
            .process-progress {
                margin: 0 auto;
                max-width: 80%;
            }
            
            .progress-text {
                text-align: right;
                font-size: 12px;
                color: #CBD5E1;
                margin-top: 5px;
            }
            
            .process-actions {
                display: flex;
                justify-content: center;
                gap: 15px;
                margin-top: 20px;
            }
            
            @keyframes pulse {
                0% {
                    box-shadow: 0 0 0 0 rgba(37, 99, 235, 0.7);
                }
                70% {
                    box-shadow: 0 0 0 10px rgba(37, 99, 235, 0);
                }
                100% {
                    box-shadow: 0 0 0 0 rgba(37, 99, 235, 0);
                }
            }
            
            .text-success {
                color: #22C55E !important;
            }
            
            .text-danger {
                color: #EF4444 !important;
            }
            
            .text-warning {
                color: #F59E0B !important;
            }
        `).appendTo(this.wrapper);
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

    validate_employee() {
        const employeeCode = this.wrapper.find('#scan_employee').val();
        const messageElement = this.wrapper.find('#employee_validation_message');
        const operationSelect = this.wrapper.find('#operation_type');
        const selectedOperation = operationSelect.val();

        if (!employeeCode) {
            messageElement.html(`
                <div class="alert alert-warning">
                    <i class="fa fa-exclamation-triangle"></i> Please scan or enter an employee ID
                </div>
            `);
            return;
        }

        if (!selectedOperation) {
            messageElement.html(`
                <div class="alert alert-warning">
                    <i class="fa fa-exclamation-triangle"></i> Please select an operation from the dropdown
                </div>
            `);
            return;
        }

        // Check operation validation happens later during add_operation_to_table
        
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
                    const employeeDesignation = data.employee.designation;
                    const allowedOperations = data.allowed_operations || [];

                    if (allowedOperations && allowedOperations.length > 0) {
                        // Check if the selected operation is allowed for this employee
                        if (!allowedOperations.includes(selectedOperation)) {
                            messageElement.html(`
                                <div class="alert alert-danger">
                                    <i class="fa fa-exclamation-circle"></i> Employee "${employeeName}" is not authorized to perform operation "${selectedOperation}"
                                </div>
                            `);
                            return;
                        }

                        // All validation passed, add the operation to the table
                        this.add_operation_to_table(selectedOperation, employeeCode, employeeName);

                        // Show success message
                        messageElement.html(`
                            <div class="alert alert-success">
                                <i class="fa fa-check-circle"></i> Employee validated: ${employeeName} (${employeeDesignation})
                            </div>
                        `);

                        // Clear the employee field and reset operation dropdown for next entry
                        this.wrapper.find('#scan_employee').val('');
                        operationSelect.val('');
                        
                        // If this operation was Final Visual Inspection, enable rejection section
                        this.check_and_enable_inspection_section();
                    } else {
                        messageElement.html(`
                            <div class="alert alert-warning">
                                <i class="fa fa-exclamation-triangle"></i> Employee "${employeeName}" doesn't have any allowed operations
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

    // Helper method to check if operation is in BOM operations
    isBomOperation(operation) {
        // If no BOM details, assume all operations are allowed
        if (!this.bom_details || !this.bom_details.length) {
            return true;
        }
        
        const firstBom = this.bom_details[0];
        const bomOperations = firstBom.operations || [];
        
        // Check if the operation exists in the BOM operations
        return bomOperations.some(op => op.operation === operation);
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

        // Check if this operation was "Final Visual Inspection" and enable inspection/rejection
        if (operation === "Final Visual Inspection") {
            this.enableInspectionSection();
        }
    }

    // Method to enable inspection section when Final Visual Inspection is added
    enableInspectionSection() {
        console.log("Enabling inspection section for Final Visual Inspection");
        
        // Enable inspection quantity field
        this.wrapper.find('#inspection_qty').prop('disabled', false);
        
        // Do not set default value from batch quantity - let user enter the required inspection quantity
        
        // Make the inspection section more visible
        this.wrapper.find('.inspection-section').addClass('highlight-section');
        
        // Add a badge to the section head to show it's ready
        if (!this.wrapper.find('.inspection-section .section-head .badge').length) {
            this.wrapper.find('.inspection-section .section-head').append(' <span class="badge badge-success">Ready</span>');
        }
        
        // No auto-verification - wait for user input
    }

    // Helper method to check for Final Visual Inspection operation and enable rejection section
    check_and_enable_inspection_section() {
        // Check if Final Visual Inspection exists in the operations table
        const hasFinalVisualInspection = this.operationDetails && 
                                         this.operationDetails.some(op => op.operation === "Final Visual Inspection");
        
        if (hasFinalVisualInspection) {
            // Enable inspection fields if Final Visual Inspection is in the operations
            this.wrapper.find('#inspection_qty').prop('disabled', false);
            
            // Automatically validate the inspection quantity to enable rejection fields
            this.verify_inspector();
            
            // Make the inspection section more visible
            this.wrapper.find('.inspection-section').addClass('highlight-section');
            this.wrapper.find('.inspection-section .section-head').append(' <span class="badge badge-success">Ready</span>');
        }
    }

    verify_inspector() {
        const inspectionQty = this.wrapper.find('#inspection_qty').val();
        const messageElement = this.wrapper.find('#inspector_validation_message');

        // Validate inspection quantity against batch quantity
        if (!this.batchInfo) {
            messageElement.html(`
                <div class="alert alert-warning">
                    <i class="fa fa-exclamation-triangle"></i> Please validate a batch first before entering inspection details
                </div>
            `);
            return;
        }

        if (!inspectionQty || inspectionQty <= 0) {
            messageElement.html(`
                <div class="alert alert-warning">
                    <i class="fa fa-exclamation-triangle"></i> Please enter a valid inspection quantity (must be greater than 0)
                </div>
            `);
            return;
        }

        // Check if inspection quantity exceeds available batch quantity
        const batchQty = parseFloat(this.batchInfo.quantity);
        const enteredQty = parseFloat(inspectionQty);
        
        // Allow inspection quantity greater than batch quantity, but show a warning
        if (enteredQty > batchQty) {
            messageElement.html(`
                <div class="alert alert-warning">
                    <i class="fa fa-exclamation-triangle"></i> Warning: Inspection quantity (${enteredQty}) exceeds available batch quantity (${batchQty}). You may continue, but please verify the quantity.
                </div>
            `);
            
            // Still proceed with inspection and enable rejection section
        } else {
            // Show success message for normal case
            messageElement.html(`
                <div class="alert alert-success">
                    <i class="fa fa-check-circle"></i> Inspection quantity verified: ${inspectionQty}
                </div>
            `);
        }

        // Store inspection details without any inspector code
        this.inspectionInfo = {
            inspectionQuantity: inspectionQty
        };
        
        // Enable rejection section in both cases
        this.enableRejectionSection();
    }

    // Helper method to enable rejection section
    enableRejectionSection() {
        // Enable all the rejection input fields
        this.wrapper.find('#rejection_type').prop('disabled', false);
        this.wrapper.find('#rejection_qty').prop('disabled', false);
        this.wrapper.find('#add_rejection_btn').prop('disabled', false);
        
        // Make the rejection section more visible
        this.wrapper.find('.rejection-section').addClass('highlight-section');
        
        // Add a badge to the section head to indicate that it's enabled
        if (!this.wrapper.find('.rejection-section .section-head .badge').length) {
            this.wrapper.find('.rejection-section .section-head').append(' <span class="badge badge-success">Ready</span>');
        }
        
        // Add a special visual style to highlight that these fields are now active
        this.wrapper.find('.rejection-section input').addClass('border-highlight');
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

        // Check if all BOM operations have been added to the operations table
        if (this.bom_details && this.bom_details.length > 0 && this.bom_details[0].operations) {
            const bomOperations = this.bom_details[0].operations
                .filter(op => op.operation) // Filter out any undefined operations
                .map(op => op.operation);
            
            const addedOperations = this.operationDetails.map(op => op.operation);
            
            // Check if any BOM operations are missing
            const missingOperations = bomOperations.filter(op => !addedOperations.includes(op));
            
            if (missingOperations.length > 0) {
                messageElement.html(`
                    <div class="alert alert-warning">
                        <i class="fa fa-exclamation-triangle"></i> Please add all required operations from the BOM. Missing operations: 
                        <strong>${missingOperations.join(', ')}</strong>
                    </div>
                `);
                return;
            }
        }

        // Inspect inspection info (only if Final Visual Inspection is added)
        const hasFinalVisualInspection = this.operationDetails.some(op => op.operation === "Final Visual Inspection");
        if (hasFinalVisualInspection && (!this.inspectionInfo || !this.inspectionInfo.inspectionQuantity)) {
            messageElement.html(`
                <div class="alert alert-warning">
                    <i class="fa fa-exclamation-triangle"></i> Please enter inspection quantity
                </div>
            `);
            return;
        }

        // Initialize basic progress tracker with a progress bar
        messageElement.html(`
            <div class="processing-container p-3">
                <div class="text-center mb-2">
                    <div class="h5 mb-2">Processing Request...</div>
                    <div class="text-muted stage-description">Validating input data...</div>
                </div>
                <div class="progress" style="height: 8px;">
                    <div class="progress-bar progress-bar-striped progress-bar-animated" 
                        role="progressbar" style="width: 10%;" 
                        aria-valuenow="10" aria-valuemin="0" aria-valuemax="100"></div>
                </div>
                <div class="d-flex justify-content-between mt-1">
                    <div class="text-muted">Starting...</div>
                    <div class="text-muted progress-percent">10%</div>
                </div>
                <div class="process-stages mt-3">
                    <div class="stage-badges d-flex flex-wrap justify-content-between">
                        <span class="badge badge-primary active">Validation</span>
                        <span class="badge badge-secondary">Document</span>
                        <span class="badge badge-secondary">Operations</span>
                        <span class="badge badge-secondary">Rejection</span>
                        <span class="badge badge-secondary">Location</span>
                        <span class="badge badge-secondary">Saving</span>
                        <span class="badge badge-secondary">Complete</span>
                    </div>
                </div>
                <div class="actions mt-3" style="display: none;">
                    <div class="d-flex justify-content-center">
                        <button class="btn btn-primary btn-print-label mx-1">
                            <i class="fa fa-print mr-1"></i> Print Label
                        </button>
                        <button class="btn btn-info btn-view-details mx-1">
                            <i class="fa fa-eye mr-1"></i> View Details
                        </button>
                        <button class="btn btn-warning btn-new-process mx-1">
                            <i class="fa fa-refresh mr-1"></i> New Process
                        </button>
                    </div>
                </div>
            </div>
        `);

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
                    
                    // Start polling for status updates
                    this.startStatusPolling(trackerId);
                } else {
                    // Re-enable the submit button
                    this.wrapper.find('#submit_process_btn').prop('disabled', false);
                    
                    const errorMsg = response.message ? response.message.message : "Failed to save process";

                    messageElement.html(`
                        <div class="alert alert-danger">
                            <i class="fa fa-exclamation-circle"></i> ${errorMsg}
                        </div>
                    `);
                }
            },
            error: (err) => {
                // Re-enable the submit button
                this.wrapper.find('#submit_process_btn').prop('disabled', false);
                
                console.error("Error saving process:", err);

                messageElement.html(`
                    <div class="alert alert-danger">
                        <i class="fa fa-exclamation-circle"></i> Error saving process. Please try again.
                    </div>
                `);
            }
        });
    }

    startStatusPolling(trackerId) {
        // Start polling for status updates every 2 seconds
        const pollInterval = 2000; // 2 seconds
        let pollCount = 0;
        const maxPolls = 60; // Maximum number of polls (2 minutes)
        
        // Store a reference to the SubLotProcessPage instance for use in callbacks
        const self = this;
        
        const updateProgressUI = (data) => {
            const $container = this.wrapper.find('.processing-container');
            const $progressBar = $container.find('.progress-bar');
            const $stageDesc = $container.find('.stage-description');
            const $progressPercent = $container.find('.progress-percent');
            const $actions = $container.find('.actions');
            const $badges = $container.find('.stage-badges .badge');
            
            // Update progress bar
            const percent = data.progress_percent || 0;
            $progressBar.css('width', `${percent}%`);
            $progressBar.attr('aria-valuenow', percent);
            $progressPercent.text(`${percent}%`);
            
            // Update stage description
            $stageDesc.text(data.stage_description || 'Processing...');
            
            // Update badge states
            const stageToIndex = {
                'Data Validation': 0,
                'Document Creation': 1,
                'Operations Setup': 2,
                'Rejection Data': 3,
                'Location Setup': 4,
                'Document Saving': 5,
                'Document Submission': 5,
                'Sub Lot Creation': 5,
                'Work Order': 5,
                'Complete': 6
            };
            
            const currentStageIndex = stageToIndex[data.current_stage] || 0;
            
            // Update badges based on current stage
            $badges.removeClass('badge-success badge-primary badge-secondary badge-danger active')
                  .addClass('badge-secondary');
            
            // Mark all completed stages
            $badges.each((i, el) => {
                const $badge = $(el);
                if (i < currentStageIndex) {
                    $badge.removeClass('badge-secondary').addClass('badge-success');
                } else if (i === currentStageIndex) {
                    $badge.removeClass('badge-secondary').addClass('badge-primary active');
                }
            });
            
            // Handle completion or failure
            if (data.process_status === "Completed") {
                // Mark all badges as complete
                $badges.removeClass('badge-secondary badge-primary').addClass('badge-success');
                
                // Show success message
                $container.prepend(`
                    <div class="alert alert-success mb-3">
                        <i class="fa fa-check-circle mr-1"></i> Process completed successfully!
                    </div>
                `);
                
                // Show actions
                $actions.show();
                
                // Store the reference name for label printing
                self.completedProcessId = data.reference_name;
                
                // Bind print label button
                self.wrapper.find('.btn-print-label').on('click', () => {
                    self.printSubLotLabel(data.reference_name);
                });
                
                // Bind view details button
                self.wrapper.find('.btn-view-details').on('click', () => {
                    frappe.set_route("Form", data.reference_doctype, data.reference_name);
                });
                
                // Bind the reset form button
                self.wrapper.find('.btn-new-process').on('click', () => {
                    // Reset the form
                    self.reset_form();
                    // Clear the submit message area
                    self.wrapper.find('#submit_message').empty();
                    // Re-enable the submit button
                    self.wrapper.find('#submit_process_btn').prop('disabled', false);
                    // Focus on the batch scan input
                    self.wrapper.find('#scan_batch').focus();
                });
                
                // Re-enable the submit button
                self.wrapper.find('#submit_process_btn').prop('disabled', false);
                
                // Stop polling
                return false;
            }
            
            // Handle failure
            if (data.process_status === "Failed") {
                // Mark the current stage as failed
                $badges.eq(currentStageIndex).removeClass('badge-secondary badge-primary').addClass('badge-danger active');
                
                // Show error message
                $container.prepend(`
                    <div class="alert alert-danger mb-3">
                        <i class="fa fa-exclamation-circle mr-1"></i> Process failed: ${data.stage_description}
                    </div>
                `);
                
                // Re-enable the submit button
                self.wrapper.find('#submit_process_btn').prop('disabled', false);
                
                // Add a retry button
                $actions.html(`
                    <div class="d-flex justify-content-center">
                        <button class="btn btn-warning btn-retry-process">
                            <i class="fa fa-refresh mr-1"></i> Try Again
                        </button>
                    </div>
                `).show();
                
                // Bind the retry button
                self.wrapper.find('.btn-retry-process').on('click', () => {
                    // Just clear the message and re-enable the submit button
                    self.wrapper.find('#submit_message').empty();
                    self.wrapper.find('#submit_process_btn').prop('disabled', false);
                });
                
                // Stop polling
                return false;
            }
            
            // Continue polling
            return true;
        };
        
        const poll = () => {
            frappe.call({
                method: "smart_screens.smart_screens.api.sub_lot_process.get_process_status",
                args: { tracker_id: trackerId },
                callback: (response) => {
                    pollCount++;
                    
                    if (response.message && response.message.status === "success") {
                        const data = response.message.data;
                        
                        // Update UI with current progress
                        const shouldContinue = updateProgressUI(data);
                        
                        // Continue polling if process is still running and haven't reached max polls
                        if (shouldContinue && pollCount < maxPolls) {
                            setTimeout(poll, pollInterval);
                        } else if (pollCount >= maxPolls) {
                            // Max polls reached, show timeout message
                            this.wrapper.find('.processing-container').prepend(`
                                <div class="alert alert-warning mb-3">
                                    <i class="fa fa-clock-o mr-1"></i> Process is taking longer than expected. Please check the system for status.
                                </div>
                            `);
                            
                            // Re-enable the submit button
                            this.wrapper.find('#submit_process_btn').prop('disabled', false);
                        }
                    } else {
                        // Error getting status
                        console.error("Error polling status:", response.message);
                        
                        // Show error message
                        this.wrapper.find('.processing-container').prepend(`
                            <div class="alert alert-danger mb-3">
                                <i class="fa fa-exclamation-circle mr-1"></i> Failed to check process status. Please refresh the page.
                            </div>
                        `);
                        
                        // Re-enable the submit button
                        this.wrapper.find('#submit_process_btn').prop('disabled', false);
                    }
                },
                error: (err) => {
                    console.error("Error polling status:", err);
                    
                    // Show error message
                    this.wrapper.find('.processing-container').prepend(`
                        <div class="alert alert-danger mb-3">
                            <i class="fa fa-exclamation-circle mr-1"></i> Failed to check process status. Please refresh the page.
                        </div>
                    `);
                    
                    // Re-enable the submit button
                    this.wrapper.find('#submit_process_btn').prop('disabled', false);
                }
            });
        };
        
        // Start polling immediately
        poll();
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

        // Hide batch details
        this.wrapper.find('#batch_details').hide();
        this.wrapper.find('#batch_validation_result').empty();

        // Clear validation messages
        this.wrapper.find('#employee_validation_message').empty();
        this.wrapper.find('#inspector_validation_message').empty();
        this.wrapper.find('#submit_message').empty();

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
    }

    printSubLotLabel(processId) {
        // Create a new dialog for label printing
        const dialog = new frappe.ui.Dialog({
            title: 'Print Sub Lot Label',
            fields: [
                {
                    fieldname: 'html_preview',
                    fieldtype: 'HTML',
                    options: '<div class="text-center"><i class="fa fa-spinner fa-spin"></i> Loading label preview...</div>'
                }
            ],
            primary_action_label: 'Print',
            primary_action: (values) => {
                // Store the data for reference in the print window
                const labelData = dialog.get_values();
                const labelHtml = dialog.fields_dict.html_preview.$wrapper.html();
                
                // Create the print window with direct embedded barcode data
                const printWindow = window.open('', '_blank');
                if (!printWindow) {
                    frappe.msgprint(__('Please allow pop-ups to print the label'));
                    return;
                }
                
                // Get sublot number from the preview
                let sublotNumber = dialog.sublotNumber || 'N/A';
                
                printWindow.document.write(`
                    <!DOCTYPE html>
                    <html>
                    <head>
                        <title>Sub Lot Label</title>
                        <style>
                            ${this.getLabelStyles()}
                        </style>
                    </head>
                    <body>
                        <div class="label-container">
                            <div class="label-header">
                                <div class="company-logo">
                                    <img src="/assets/smart_screens/images/logo.png" alt="Company Logo">
                                </div>
                                <div class="label-title">SUB LOT</div>
                            </div>
                            
                            <!-- SUB LOT NUMBER with BARCODE (using directly embedded SVG) -->
                            <div class="label-section main-barcode-section">
                                <div class="section-title">SUB LOT NUMBER</div>
                                <div class="label-barcode">
                                    <div id="barcode-container" style="text-align: center; width: 100%;"></div>
                                    <div class="barcode-number">${sublotNumber}</div>
                                </div>
                            </div>
                            
                            <!-- Item and Batch Information -->
                            ${dialog.itemSection || ''}
                            
                            <!-- Operations Information -->
                            ${dialog.operationsSection || ''}
                            
                            <div class="label-footer">
                                <div class="footer-note">Smart Screens Processing System</div>
                            </div>
                        </div>

                        <!-- Include JsBarcode directly from CDN -->
                        <script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.5/dist/JsBarcode.all.min.js"></script>
                        <script>
                            // Create barcode directly in the print window
                            window.onload = function() {
                                try {
                                    console.log("Creating barcode for: ${sublotNumber}");
                                    
                                    // Create SVG element
                                    var svgElement = document.createElementNS("http://www.w3.org/2000/svg", "svg");
                                    svgElement.id = "barcode";
                                    document.getElementById("barcode-container").appendChild(svgElement);
                                    
                                    // Generate barcode
                                    JsBarcode("#barcode", "${sublotNumber}", {
                                        format: "CODE128",
                                        width: 2, 
                                        height: 70,
                                        displayValue: false
                                    });
                                    
                                    // Print after a short delay to ensure rendering
                                    setTimeout(function() {
                                        window.print();
                                        
                                        // Close window after printing
                                        setTimeout(function() {
                                            window.close();
                                        }, 500);
                                    }, 500);
                                } catch(e) {
                                    console.error("Error generating barcode:", e);
                                    document.body.innerHTML += '<div style="color: red; text-align: center; margin-top: 20px;">Error generating barcode. Please try again.</div>';
                                }
                            };
                        </script>
                    </body>
                    </html>
                `);
                printWindow.document.close();
                
                dialog.hide();
            }
        });
        
        // Show the dialog
        dialog.show();
        
        // Fetch process details for the label
        frappe.call({
            method: "smart_screens.smart_screens.api.sub_lot_process.get_sublot_process_details",
            args: { process_id: processId },
            callback: (response) => {
                if (response.message && response.message.status === "success") {
                    const data = response.message.data;
                    
                    // Store sublot number for reference
                    dialog.sublotNumber = data.sub_lot_number || 'N/A';
                    
                    // Pre-generate HTML sections to pass to print window
                    dialog.itemSection = `
                        <div class="item-info-section">
                            <table class="details-table">
                                <tr>
                                    <td class="label-key">Item Code:</td>
                                    <td class="label-value">${data.item_code || 'N/A'}</td>
                                    <td class="label-key">Batch:</td>
                                    <td class="label-value">${data.batch_no || 'N/A'}</td>
                                </tr>
                                <tr>
                                    <td class="label-key">Qty:</td>
                                    <td class="label-value">${data.sublot_qty || 'N/A'} ${data.stock_uom || ''}</td>
                                    <td class="label-key">Date:</td>
                                    <td class="label-value">${frappe.datetime.str_to_user(data.creation) || 'N/A'}</td>
                                </tr>
                            </table>
                        </div>
                    `;
                    
                    // Generate operations HTML section
                    let operationsHtml = '<div class="operations-section"><div class="section-title">OPERATIONS</div>';
                    
                    if (data.operations && data.operations.length > 0) {
                        operationsHtml += '<table class="operations-table">';
                        operationsHtml += '<tr><th>Operation</th><th>Employee</th></tr>';
                        
                        data.operations.forEach(op => {
                            operationsHtml += `
                                <tr>
                                    <td>${op.operation || 'N/A'}</td>
                                    <td>${op.employee_name || op.employee_code || 'N/A'}</td>
                                </tr>
                            `;
                        });
                        
                        operationsHtml += '</table>';
                    } else {
                        operationsHtml += '<div class="no-operations">No operations data available</div>';
                    }
                    
                    operationsHtml += '</div>';
                    dialog.operationsSection = operationsHtml;
                    
                    // Generate preview HTML
                    let previewHtml = `
                        <div class="label-container" style="border: 1px solid #ccc; padding: 10px; max-width: 400px; margin: 0 auto;">
                            <div class="label-header" style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px;">
                                <div class="company-logo">
                                    <img src="/assets/smart_screens/images/logo.png" alt="Company Logo" style="height: 30px;">
                                </div>
                                <div class="label-title" style="font-weight: bold; font-size: 16px; text-align: center; flex-grow: 1;">SUB LOT</div>
                            </div>
                            
                            <div class="label-section" style="border: 1px solid #eee; margin: 10px 0; padding: 10px; background-color: #f9f9f9;">
                                <div class="section-title" style="font-weight: bold; text-align: center; border-bottom: 1px solid #eee; padding-bottom: 5px; margin-bottom: 10px;">SUB LOT NUMBER</div>
                                <div class="label-barcode" style="text-align: center;">
                                    <div id="preview-barcode-container"></div>
                                    <div style="font-weight: bold; margin-top: 5px;">${data.sub_lot_number || 'N/A'}</div>
                                </div>
                            </div>
                            
                            ${dialog.itemSection.replace(/<td/g, '<td style="padding: 3px; font-size: 12px;"')}
                            ${dialog.operationsSection.replace(/<th/g, '<th style="background-color: #eee; padding: 5px; text-align: left; font-size: 12px;"').replace(/<td/g, '<td style="padding: 3px; font-size: 12px; border-bottom: 1px solid #eee;"')}
                            
                            <div style="margin-top: 10px; text-align: center; font-size: 11px; color: #777; border-top: 1px solid #eee; padding-top: 5px;">
                                Smart Screens Processing System
                            </div>
                        </div>
                        
                        <script>
                            // Load JsBarcode for the preview
                            if (typeof JsBarcode === 'undefined') {
                                var script = document.createElement('script');
                                script.src = 'https://cdn.jsdelivr.net/npm/jsbarcode@3.11.5/dist/JsBarcode.all.min.js';
                                script.onload = function() {
                                    // Create barcode in preview
                                    var svgElement = document.createElementNS("http://www.w3.org/2000/svg", "svg");
                                    svgElement.id = "preview-barcode";
                                    document.getElementById("preview-barcode-container").appendChild(svgElement);
                                    
                                    JsBarcode("#preview-barcode", "${data.sub_lot_number || 'N/A'}", {
                                        format: "CODE128",
                                        width: 1.5,
                                        height: 50,
                                        displayValue: false
                                    });
                                };
                                document.head.appendChild(script);
                            } else {
                                // Create barcode directly
                                var svgElement = document.createElementNS("http://www.w3.org/2000/svg", "svg");
                                svgElement.id = "preview-barcode";
                                document.getElementById("preview-barcode-container").appendChild(svgElement);
                                
                                JsBarcode("#preview-barcode", "${data.sub_lot_number || 'N/A'}", {
                                    format: "CODE128",
                                    width: 1.5,
                                    height: 50,
                                    displayValue: false
                                });
                            }
                        </script>
                    `;
                    
                    // Update dialog with label preview
                    dialog.fields_dict.html_preview.$wrapper.html(previewHtml);
                } else {
                    // Error getting process details
                    dialog.fields_dict.html_preview.$wrapper.html(`
                        <div class="alert alert-danger">
                            <i class="fa fa-exclamation-circle"></i> Failed to get process details for label printing.
                        </div>
                    `);
                }
            },
            error: (err) => {
                console.error("Error getting process details:", err);
                
                // Show error message
                dialog.fields_dict.html_preview.$wrapper.html(`
                    <div class="alert alert-danger">
                        <i class="fa fa-exclamation-circle"></i> Failed to get process details for label printing.
                    </div>
                `);
            }
        });
    }

    getLabelStyles() {
        // CSS styles for the label - resized for single page printing
        return `
            @page {
                size: 100mm 150mm; /* Standard label size */
                margin: 3mm; /* Minimal margins */
            }
            
            body {
                margin: 0;
                padding: 0;
                font-family: Arial, sans-serif;
                background-color: white;
            }
            
            .label-container {
                width: 94mm;
                height: 144mm;
                padding: 3mm;
                box-sizing: border-box;
                border: 0.5mm solid #ccc;
                background-color: white;
                display: flex;
                flex-direction: column;
                page-break-after: avoid;
                overflow: hidden;
            }
            
            .label-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 3mm;
            }
            
            .company-logo img {
                height: 10mm;
                max-width: 20mm;
            }
            
            .label-title {
                font-size: 10pt;
                font-weight: bold;
                color: #333;
                text-align: center;
                flex-grow: 1;
            }
            
            /* Main barcode section */
            .main-barcode-section {
                margin: 2mm 0;
                border: 0.5mm solid #000;
                border-radius: 1mm;
                padding: 2mm;
                background-color: #f9f9f9;
            }
            
            .label-section {
                margin: 2mm 0;
                border: 0.3mm solid #ddd;
                border-radius: 1mm;
                padding: 2mm;
                background-color: #f9f9f9;
            }
            
            .section-title {
                font-size: 9pt;
                font-weight: bold;
                color: #333;
                text-align: center;
                margin-bottom: 2mm;
                border-bottom: 0.3mm solid #ddd;
                padding-bottom: 1mm;
            }
            
            .label-barcode {
                text-align: center;
                margin: 2mm 0;
            }
            
            .barcode-container {
                margin: 0 auto;
                width: 80mm;
                height: 15mm;
            }
            
            .barcode-container svg {
                width: 100%;
                height: 100%;
            }
            
            .barcode-number {
                font-size: 10pt;
                margin-top: 1mm;
                font-weight: bold;
            }
            
            .item-info-section {
                margin: 2mm 0;
                padding: 2mm;
                border: 0.3mm solid #ddd;
                border-radius: 1mm;
                background-color: #f9f9f9;
            }
            
            .operations-section {
                margin: 2mm 0;
                padding: 2mm;
                border: 0.3mm solid #ddd;
                border-radius: 1mm;
                background-color: #f9f9f9;
                flex-grow: 1;
                overflow-y: auto;
            }
            
            .operations-table {
                width: 100%;
                border-collapse: collapse;
                font-size: 8pt;
            }
            
            .operations-table th {
                background-color: #eee;
                padding: 1mm;
                text-align: left;
                border-bottom: 0.5mm solid #ddd;
            }
            
            .operations-table td {
                padding: 1mm;
                border-bottom: 0.3mm solid #ddd;
            }
            
            .details-table {
                width: 100%;
                border-collapse: collapse;
                font-size: 8pt;
            }
            
            .details-table tr {
                height: 5mm;
            }
            
            .label-key {
                font-weight: bold;
                width: 25%;
                text-align: right;
                padding-right: 1mm;
                color: #555;
            }
            
            .label-value {
                width: 25%;
                padding-left: 1mm;
                font-weight: bold;
                color: #000;
            }
            
            .label-footer {
                margin-top: auto;
                text-align: center;
                font-size: 7pt;
                color: #777;
                border-top: 0.3mm solid #eee;
                padding-top: 2mm;
            }
            
            .footer-note {
                margin-bottom: 1mm;
            }
            
            .no-operations {
                text-align: center;
                font-style: italic;
                font-size: 7pt;
                color: #999;
                padding: 2mm;
            }
            
            /* For printing */
            @media print {
                html, body {
                    width: 100mm;
                    height: 150mm;
                    margin: 0;
                    padding: 0;
                }
                
                .label-container {
                    page-break-after: avoid;
                    page-break-inside: avoid;
                }
            }
        `;
    }

    generateLabelHtml(data) {
        // Generate direct data URL for the barcode (more reliable than API)
        const barcodeContent = `
            <svg id="barcode"></svg>
            <script>
                JsBarcode("#barcode", "${data.sub_lot_number || 'N/A'}", {
                    format: "CODE128",
                    width: 2,
                    height: 70,
                    displayValue: false
                });
            </script>
        `;

        // Generate HTML for the label with improved barcode visibility and focus on sublot info and operations
        return `
            <div class="label-container">
                <div class="label-header">
                    <div class="company-logo">
                        <img src="/assets/smart_screens/images/logo.png" alt="Company Logo">
                    </div>
                    <div class="label-title">SUB LOT</div>
                </div>
                
                <!-- SUB LOT NUMBER with BARCODE -->
                <div class="label-section main-barcode-section">
                    <div class="section-title">SUB LOT NUMBER</div>
                    <div class="label-barcode">
                        <div class="barcode-container">${barcodeContent}</div>
                        <div class="barcode-number">${data.sub_lot_number || 'N/A'}</div>
                    </div>
                </div>
                
                <!-- Item and Batch Information -->
                <div class="item-info-section">
                    <table class="details-table">
                        <tr>
                            <td class="label-key">Item Code:</td>
                            <td class="label-value">${data.item_code || 'N/A'}</td>
                            <td class="label-key">Batch:</td>
                            <td class="label-value">${data.batch_no || 'N/A'}</td>
                        </tr>
                        <tr>
                            <td class="label-key">Qty:</td>
                            <td class="label-value">${data.sublot_qty || 'N/A'} ${data.stock_uom || ''}</td>
                            <td class="label-key">Date:</td>
                            <td class="label-value">${frappe.datetime.str_to_user(data.creation) || 'N/A'}</td>
                        </tr>
                    </table>
                </div>
                
                <!-- Operations Information -->
                <div class="operations-section">
                    <div class="section-title">OPERATIONS</div>
                    <div class="operations-list">
                        ${this.generateOperationsList(data)}
                    </div>
                </div>
                
                <div class="label-footer">
                    <div class="footer-note">Smart Screens Processing System</div>
                </div>
            </div>
        `;
    }
    
    // Generate operations list
    generateOperationsList(data) {
        if (!data.operations || !data.operations.length) {
            return '<div class="no-operations">No operations data available</div>';
        }
        
        let html = '<table class="operations-table">';
        html += '<tr><th>Operation</th><th>Employee</th></tr>';
        
        data.operations.forEach(op => {
            html += `
                <tr>
                    <td>${op.operation || 'N/A'}</td>
                    <td>${op.employee_name || op.employee_code || 'N/A'}</td>
                </tr>
            `;
        });
        
        html += '</table>';
        return html;
    }

    // Alternate method in case JsBarcode is not available
    generateBarcodeDataUrl(data, width, height) {
        // Function to generate a simple barcode using HTML canvas
        try {
            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            
            // Clear background
            ctx.fillStyle = '#FFFFFF';
            ctx.fillRect(0, 0, width, height);
            
            // Draw simple black lines (primitive barcode representation)
            let x = 10;
            const chars = data.split('');
            ctx.fillStyle = '#000000';
            
            for (let i = 0; i < chars.length; i++) {
                const charCode = chars[i].charCodeAt(0);
                const barWidth = 2 + (charCode % 3);
                
                ctx.fillRect(x, 5, barWidth, height - 10);
                x += barWidth + 2;
            }
            
            return canvas.toDataURL('image/png');
        } catch (e) {
            console.error("Error generating barcode data URL:", e);
            return null;
        }
    }
}
