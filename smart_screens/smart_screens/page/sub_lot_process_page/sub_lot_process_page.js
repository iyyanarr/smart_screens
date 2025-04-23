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
                        `;

                        // If there are operations, list the operation names with colored badges
                        if (firstBom.operations && firstBom.operations.length > 0) {
                            bomHtml += `<div><strong>Operations:</strong></div>`;
                            bomHtml += `<div class="operations-list">`;
                            firstBom.operations.forEach(op => {
                                if (op.operation) {
                                    const badgeColor = this.getRandomBadgeColor();
                                    bomHtml += `<span class="badge badge-${badgeColor} mr-1 mb-1">${op.operation}</span>`;
                                }
                            });
                            bomHtml += `</div>`;
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

        // Initialize custom progress tracker with a unique container ID
        const progressContainerId = `process-tracker-${Date.now()}`;
        messageElement.html(`
            <div class="process-progress-container">
                <div class="process-stages" id="${progressContainerId}">
                    <div class="stage-item active current" data-stage="data-validation">
                        <div class="stage-icon"><i class="fa fa-check-circle"></i></div>
                        <div class="stage-line"></div>
                        <div class="stage-label">Data Validation</div>
                    </div>
                    <div class="stage-item" data-stage="document-creation">
                        <div class="stage-icon"><i class="fa fa-file"></i></div>
                        <div class="stage-line"></div>
                        <div class="stage-label">Document Creation</div>
                    </div>
                    <div class="stage-item" data-stage="operations-setup">
                        <div class="stage-icon"><i class="fa fa-cogs"></i></div>
                        <div class="stage-line"></div>
                        <div class="stage-label">Operations Setup</div>
                    </div>
                    <div class="stage-item" data-stage="rejection-data">
                        <div class="stage-icon"><i class="fa fa-times-circle"></i></div>
                        <div class="stage-line"></div>
                        <div class="stage-label">Rejection Data</div>
                    </div>
                    <div class="stage-item" data-stage="location-setup">
                        <div class="stage-icon"><i class="fa fa-map-marker"></i></div>
                        <div class="stage-line"></div>
                        <div class="stage-label">Location Setup</div>
                    </div>
                    <div class="stage-item" data-stage="document-saving">
                        <div class="stage-icon"><i class="fa fa-save"></i></div>
                        <div class="stage-line"></div>
                        <div class="stage-label">Saving</div>
                    </div>
                    <div class="stage-item" data-stage="document-submission">
                        <div class="stage-icon"><i class="fa fa-paper-plane"></i></div>
                        <div class="stage-line"></div>
                        <div class="stage-label">Submission</div>
                    </div>
                    <div class="stage-item" data-stage="sublot-creation">
                        <div class="stage-icon"><i class="fa fa-cube"></i></div>
                        <div class="stage-line"></div>
                        <div class="stage-label">Sub Lot Creation</div>
                    </div>
                    <div class="stage-item" data-stage="work-order">
                        <div class="stage-icon"><i class="fa fa-industry"></i></div>
                        <div class="stage-line"></div>
                        <div class="stage-label">Work Order</div>
                    </div>
                    <div class="stage-item final" data-stage="complete">
                        <div class="stage-icon"><i class="fa fa-flag-checkered"></i></div>
                        <div class="stage-label">Complete</div>
                    </div>
                </div>
                <div class="process-details">
                    <div class="process-title">Processing Sub Lot</div>
                    <div class="process-description">Validating input data...</div>
                    <div class="process-progress">
                        <div class="progress" style="height: 6px;">
                            <div class="progress-bar" role="progressbar" style="width: 10%;" 
                                aria-valuenow="10" aria-valuemin="0" aria-valuemax="100"></div>
                        </div>
                        <div class="progress-text">10% Complete</div>
                    </div>
                </div>
                <div class="process-actions" style="display: none;">
                    <button class="btn btn-primary btn-print-label">
                        <i class="fa fa-print mr-1"></i> Print Label
                    </button>
                    <button class="btn btn-default btn-view-details">
                        <i class="fa fa-eye mr-1"></i> View Details
                    </button>
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
                    this.startStatusPolling(trackerId, progressContainerId);
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

    startStatusPolling(trackerId, progressContainerId) {
        // Start polling for status updates every 2 seconds
        const pollInterval = 2000; // 2 seconds
        let pollCount = 0;
        const maxPolls = 60; // Maximum number of polls (2 minutes)
        
        const $progressContainer = this.wrapper.find(`#${progressContainerId}`);
        const $processTitle = this.wrapper.find('.process-title');
        const $processDescription = this.wrapper.find('.process-description');
        const $progressBar = this.wrapper.find('.progress-bar');
        const $progressText = this.wrapper.find('.progress-text');
        const $processActions = this.wrapper.find('.process-actions');
        
        // Store a reference to the SubLotProcessPage instance for use in callbacks
        const self = this;
        
        const updateProgressUI = (data) => {
            // Update progress bar
            $progressBar.css('width', `${data.progress_percent}%`);
            $progressBar.attr('aria-valuenow', data.progress_percent);
            $progressText.text(`${data.progress_percent}% Complete`);
            
            // Update description
            $processDescription.text(data.stage_description);
            
            // Update title based on status
            if (data.process_status === "Completed") {
                $processTitle.text("Process Completed Successfully");
                $processTitle.addClass("text-success");
            } else if (data.process_status === "Failed") {
                $processTitle.text("Process Failed");
                $processTitle.addClass("text-danger");
            } else {
                $processTitle.text(`Processing: ${data.current_stage}`);
            }
            
            // Update stages
            const currentStageKey = self.getStageKeyFromName(data.current_stage);
            if (currentStageKey) {
                // Mark all previous stages as completed
                $progressContainer.find('.stage-item').each(function() {
                    const $stage = $(this);
                    const stageKey = $stage.data('stage');
                    
                    // Remove current class from all stages
                    $stage.removeClass('current');
                    
                    // Convert stage-key to array index for comparison
                    const stageIndex = self.getStageIndex(stageKey);
                    const currentIndex = self.getStageIndex(currentStageKey);
                    
                    if (stageIndex < currentIndex) {
                        $stage.addClass('active completed');
                    } else if (stageIndex === currentIndex) {
                        $stage.addClass('active current');
                    } else {
                        $stage.removeClass('active completed');
                    }
                });
            }
            
            // Show actions when process is completed
            if (data.process_status === "Completed") {
                $processActions.show();
                
                // Mark all stages as completed
                $progressContainer.find('.stage-item').addClass('active completed');
                
                // Mark the last stage as current
                $progressContainer.find('.stage-item[data-stage="complete"]').addClass('current');
                
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
                
                // Add a reset form button to allow starting a new process
                self.wrapper.find('.process-actions').append(`
                    <button class="btn btn-warning btn-new-process">
                        <i class="fa fa-refresh mr-1"></i> New Process
                    </button>
                `);
                
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
            
            // Stop polling if process failed
            if (data.process_status === "Failed") {
                $processTitle.html(`<i class="fa fa-exclamation-circle"></i> Process Failed: ${data.stage_description}`);
                
                // Re-enable the submit button
                self.wrapper.find('#submit_process_btn').prop('disabled', false);
                
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
                            $processTitle.text("Process Timeout");
                            $processDescription.text("The process is taking longer than expected. Please check the system for status.");
                            
                            // Re-enable the submit button
                            self.wrapper.find('#submit_process_btn').prop('disabled', false);
                        }
                    } else {
                        // Error getting status
                        console.error("Error polling status:", response.message);
                        
                        // Show error message
                        $processTitle.text("Status Check Failed");
                        $processDescription.text("Failed to check process status. Please refresh the page.");
                        
                        // Re-enable the submit button
                        self.wrapper.find('#submit_process_btn').prop('disabled', false);
                    }
                },
                error: (err) => {
                    console.error("Error polling status:", err);
                    
                    // Show error message
                    $processTitle.text("Status Check Failed");
                    $processDescription.text("Failed to check process status. Please refresh the page.");
                    
                    // Re-enable the submit button
                    self.wrapper.find('#submit_process_btn').prop('disabled', false);
                }
            });
        };
        
        // Start polling immediately
        poll();
    }

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

    printSubLotLabel(processId) {
        // Create a new dialog for label printing
        const dialog = new frappe.ui.Dialog({
            title: 'Print Sub Lot Label',
            fields: [
                {
                    fieldname: 'html_preview',
                    fieldtype: 'HTML',
                    options: '<div class="text-center">Loading label preview...</div>'
                }
            ],
            primary_action_label: 'Print',
            primary_action: () => {
                // Print the label
                const printWindow = window.open('', '_blank');
                printWindow.document.write(`
                    <!DOCTYPE html>
                    <html>
                    <head>
                        <title>Sub Lot Label</title>
                        <style>
                            @media print {
                                @page {
                                    size: 170cm 170cm;
                                    margin: 0;
                                }
                                body {
                                    margin: 0;
                                }
                                .label-container {
                                    width: 170cm;
                                    height: 170cm;
                                    padding: 5mm;
                                    box-sizing: border-box;
                                }
                            }
                            ${this.getLabelStyles()}
                        </style>
                    </head>
                    <body>
                        ${dialog.fields_dict.html_preview.$wrapper.html()}
                        <script>
                            setTimeout(function() {
                                window.print();
                                setTimeout(function() {
                                    window.close();
                                }, 500);
                            }, 500);
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
                    
                    // Generate label HTML with the process data
                    const labelHtml = this.generateLabelHtml(data);
                    
                    // Update dialog with label preview
                    dialog.fields_dict.html_preview.$wrapper.html(labelHtml);
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

    generateLabelHtml(data) {
        // Generate HTML for the label with the specified dimensions (170cm x 170cm)
        return `
            <div class="label-container">
                <div class="label-header">
                    <div class="company-logo">
                        <img src="/assets/smart_screens/images/logo.png" alt="Company Logo">
                    </div>
                    <div class="label-title">SUB LOT</div>
                </div>
                
                <!-- Raw Material Batch Information with Barcode -->
                <div class="label-section">
                    <div class="section-title">Raw Material</div>
                    <div class="label-barcode">
                        <img src="/api/method/frappe.utils.barcode.get_barcode?data=${encodeURIComponent(data.batch_no)}&type=code128&height=40&width=1" alt="Raw Material Barcode">
                        <div class="barcode-number">${data.batch_no || 'N/A'}</div>
                    </div>
                </div>
                
                <!-- Finished Goods Batch Information with Barcode -->
                <div class="label-section">
                    <div class="section-title">Finished Good</div>
                    <div class="label-barcode">
                        <img src="/api/method/frappe.utils.barcode.get_barcode?data=${encodeURIComponent(data.sub_lot_number)}&type=code128&height=40&width=1" alt="Finished Good Barcode">
                        <div class="barcode-number">${data.sub_lot_number || 'N/A'}</div>
                    </div>
                </div>
                
                <div class="label-details">
                    <table class="details-table">
                        <tr>
                            <td class="label-key">Item Code:</td>
                            <td class="label-value">${data.item_code || 'N/A'}</td>
                            <td class="label-key">Item Name:</td>
                            <td class="label-value">${data.item_name || 'N/A'}</td>
                        </tr>
                        <tr>
                            <td class="label-key">Quantity:</td>
                            <td class="label-value">${data.sublot_qty || 'N/A'} ${data.stock_uom || ''}</td>
                            <td class="label-key">Created On:</td>
                            <td class="label-value">${frappe.datetime.str_to_user(data.creation) || 'N/A'}</td>
                        </tr>
                        <tr>
                            <td class="label-key">Warehouse:</td>
                            <td class="label-value">${data.warehouse || 'N/A'}</td>
                            <td class="label-key">Stage:</td>
                            <td class="label-value">${data.stage || 'N/A'}</td>
                        </tr>
                        <tr>
                            <td class="label-key">Source WH:</td>
                            <td class="label-value">${data.source_warehouse || 'N/A'}</td>
                            <td class="label-key">Target WH:</td>
                            <td class="label-value">${data.target_warehouse || 'N/A'}</td>
                        </tr>
                    </table>
                </div>
                
                <!-- Manufacturing Information -->
                <div class="manufacturing-info">
                    <div class="section-title">Manufacturing Information</div>
                    <table class="details-table">
                        <tr>
                            <td class="label-key">Work Order:</td>
                            <td class="label-value">${data.work_order || 'N/A'}</td>
                            <td class="label-key">Operator:</td>
                            <td class="label-value">${frappe.session.user_fullname || 'N/A'}</td>
                        </tr>
                        <tr>
                            <td class="label-key">Inspector:</td>
                            <td class="label-value">${data.inspector_name || 'N/A'}</td>
                            <td class="label-key">Inspection Qty:</td>
                            <td class="label-value">${data.inspection_quantity || 'N/A'}</td>
                        </tr>
                    </table>
                </div>
                
                <div class="qr-code">
                    <img src="/api/method/frappe.utils.barcode.get_qr?data=${encodeURIComponent(JSON.stringify({
                        sub_lot_number: data.sub_lot_number,
                        batch_no: data.batch_no,
                        item_code: data.item_code,
                        quantity: data.sublot_qty,
                        warehouse: data.warehouse,
                        work_order: data.work_order,
                        creation: data.creation
                    }))}" alt="QR Code">
                </div>
                
                <div class="label-footer">
                    <div class="footer-note">Smart Screens Processing System</div>
                </div>
            </div>
        `;
    }

    getLabelStyles() {
        // CSS styles for the label
        return `
            .label-container {
                width: 170cm;
                height: 170cm;
                padding: 5cm;
                box-sizing: border-box;
                border: 1px solid #ccc;
                font-family: Arial, sans-serif;
                background-color: white;
                display: flex;
                flex-direction: column;
                position: relative;
            }
            
            .label-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 3cm;
            }
            
            .company-logo img {
                height: 15cm;
                max-width: 40cm;
            }
            
            .label-title {
                font-size: 14cm;
                font-weight: bold;
                color: #333;
                text-align: center;
                flex-grow: 1;
            }
            
            .label-section {
                margin: 2cm 0;
                border: 1px solid #ddd;
                border-radius: 1cm;
                padding: 2cm;
                background-color: #f9f9f9;
            }
            
            .section-title {
                font-size: 6cm;
                font-weight: bold;
                color: #333;
                text-align: center;
                margin-bottom: 2cm;
                border-bottom: 1px solid #ddd;
                padding-bottom: 1cm;
            }
            
            .label-barcode {
                text-align: center;
                margin: 2cm 0;
            }
            
            .label-barcode img {
                height: 15cm;
                width: 80%;
            }
            
            .barcode-number {
                font-size: 6cm;
                margin-top: 1cm;
                font-weight: bold;
            }
            
            .label-details {
                margin: 3cm 0;
                flex-grow: 1;
            }
            
            .manufacturing-info {
                margin: 3cm 0;
                border: 1px solid #ddd;
                border-radius: 1cm;
                padding: 2cm;
                background-color: #f9f9f9;
            }
            
            .details-table {
                width: 100%;
                border-collapse: collapse;
            }
            
            .details-table tr {
                height: 10cm;
            }
            
            .label-key {
                font-weight: bold;
                font-size: 5cm;
                width: 25%;
                text-align: right;
                padding-right: 2cm;
                color: #555;
            }
            
            .label-value {
                font-size: 5cm;
                width: 25%;
                padding-left: 1cm;
            }
            
            .qr-code {
                text-align: center;
                margin: 3cm 0;
            }
            
            .qr-code img {
                height: 25cm;
                width: 25cm;
            }
            
            .label-footer {
                margin-top: auto;
                text-align: center;
                font-size: 4cm;
                color: #777;
                border-top: 1px solid #eee;
                padding-top: 3cm;
            }
            
            .footer-note {
                margin-bottom: 2cm;
            }
            
            .print-date {
                font-style: italic;
            }
        `;
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
}
