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
        
        this.init_defect_types();
        this.make();
        this.bind_events();
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

        // Check if we have BOM operations to validate against
        if (!this.bom_details || !this.bom_details[0] || !this.bom_details[0].operations) {
            messageElement.html(`
                <div class="alert alert-warning">
                    <i class="fa fa-exclamation-triangle"></i> No BOM operations found to validate against
                </div>
            `);
            return;
        }

        // Get current BOM operations
        const bomOperations = this.bom_details[0].operations.map(op => op.operation);
        
        // Get currently added operations
        const currentOperations = this.operationDetails ? this.operationDetails.map(op => op.operation) : [];

        // Check if we've already added all required operations
        if (currentOperations.length >= bomOperations.length) {
            messageElement.html(`
                <div class="alert alert-warning">
                    <i class="fa fa-exclamation-triangle"></i> All required operations have been added
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

                    // Filter available operations to only show remaining required operations
                    const remainingOperations = bomOperations.filter(op => !currentOperations.includes(op));

                    if (remainingOperations.length > 0) {
                        // Show operation selection with only remaining operations
                        const operationOptions = remainingOperations.map(op => 
                            `<option value="${op}">${op}</option>`
                        ).join('');

                        messageElement.html(`
                            <div class="alert alert-success">
                                <i class="fa fa-check-circle"></i> Employee validated: ${employeeName}<br>
                                <div class="mt-2">
                                    <div class="form-group">
                                        <label>Select Operation (${remainingOperations.length} remaining):</label>
                                        <select id="operation_select" class="form-control mb-2">
                                            ${operationOptions}
                                        </select>
                                        <button id="confirm_operation_btn" class="btn btn-primary btn-sm">Add Operation</button>
                                    </div>
                                </div>
                            </div>
                        `);

                        this.wrapper.find('#confirm_operation_btn').on('click', () => {
                            const selectedOperation = this.wrapper.find('#operation_select').val();
                            
                            // Add to operations table
                            this.add_operation_to_table(selectedOperation, employeeCode, employeeName);

                            // Clear message and input
                            messageElement.html('');
                            this.wrapper.find('#scan_employee').val('');

                            // Update progress
                            const progress = ((currentOperations.length + 1) / bomOperations.length) * 100;
                            this.wrapper.find('.operations-progress-bar').css('width', `${progress}%`);
                        });
                    } else {
                        messageElement.html(`
                            <div class="alert alert-warning">
                                <i class="fa fa-exclamation-triangle"></i> All required operations have been added
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
            
            // Update stages - FIXED IMPLEMENTATION
            const currentStageKey = this.getStageKeyFromName(data.current_stage);
            if (currentStageKey) {
                // Get current stage index
                const currentIndex = this.getStageIndex(currentStageKey);
                
                // Find all stage items and update them
                $progressContainer.find('.stage-item').each(function() {
                    const $stage = $(this);
                    const stageKey = $stage.data('stage');
                    const stageIndex = this.getStageIndex(stageKey);
                    
                    // Remove current class from all stages first
                    $stage.removeClass('current');
                    
                    // Mark stages as active/completed based on their index
                    if (stageIndex < currentIndex) {
                        // Previous stages are completed
                        $stage.addClass('active completed');
                    } else if (stageIndex === currentIndex) {
                        // Current stage is active and current
                        $stage.addClass('active current');
                    } else {
                        // Future stages are inactive
                        $stage.removeClass('active completed');
                    }
                }.bind(this));  // Important: bind 'this' to access methods inside the each() function
            }
            
            // Show actions when process is completed
            if (data.process_status === "Completed") {
                $processActions.show();
                
                // Bind print label button
                this.wrapper.find('.btn-print-label').off('click').on('click', () => {
                    this.printSubLotLabel(data.reference_name);
                });
                
                // Bind view details button
                this.wrapper.find('.btn-view-details').off('click').on('click', () => {
                    frappe.set_route("Form", data.reference_doctype, data.reference_name);
                });
                
                // Re-enable the submit button
                this.wrapper.find('#submit_process_btn').prop('disabled', false);
                
                // Stop polling
                return false;
            }
            
            // Stop polling if process failed
            if (data.process_status === "Failed") {
                $processTitle.html(`<i class="fa fa-exclamation-circle"></i> Process Failed: ${data.stage_description}`);
                
                // Re-enable the submit button
                this.wrapper.find('#submit_process_btn').prop('disabled', false);
                
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
                            this.wrapper.find('#submit_process_btn').prop('disabled', false);
                        }
                    } else {
                        // Error getting status
                        console.error("Error polling status:", response.message);
                        
                        // Show error message
                        $processTitle.text("Status Check Failed");
                        $processDescription.text("Failed to check process status. Please refresh the page.");
                        
                        // Re-enable the submit button
                        this.wrapper.find('#submit_process_btn').prop('disabled', false);
                    }
                },
                error: (err) => {
                    console.error("Error polling status:", err);
                    
                    // Show error message
                    $processTitle.text("Status Check Failed");
                    $processDescription.text("Failed to check process status. Please refresh the page.");
                    
                    // Re-enable the submit button
                    this.wrapper.find('#submit_process_btn').prop('disabled', false);
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
                
                <div class="label-barcode">
                    <img src="/api/method/frappe.utils.barcode.get_barcode?data=${encodeURIComponent(data.sub_lot_number)}&type=code128&height=50&width=1" alt="Barcode">
                    <div class="barcode-number">${data.sub_lot_number}</div>
                </div>
                
                <div class="label-details">
                    <table class="details-table">
                        <tr>
                            <td class="label-key">Item Code:</td>
                            <td class="label-value">${data.item_code || ''}</td>
                            <td class="label-key">Batch No:</td>
                            <td class="label-value">${data.batch_no || ''}</td>
                        </tr>
                        <tr>
                            <td class="label-key">Quantity:</td>
                            <td class="label-value">${data.sublot_qty || ''}</td>
                            <td class="label-key">Created On:</td>
                            <td class="label-value">${frappe.datetime.str_to_user(data.creation) || ''}</td>
                        </tr>
                        <tr>
                            <td class="label-key">Warehouse:</td>
                            <td class="label-value">${data.warehouse || ''}</td>
                            <td class="label-key">Operator:</td>
                            <td class="label-value">${frappe.session.user_fullname || ''}</td>
                        </tr>
                    </table>
                </div>
                
                <div class="qr-code">
                    <img src="/api/method/frappe.utils.barcode.get_qr?data=${encodeURIComponent(JSON.stringify({
                        sub_lot_number: data.sub_lot_number,
                        item_code: data.item_code,
                        batch_no: data.batch_no,
                        quantity: data.sublot_qty,
                        warehouse: data.warehouse,
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
                margin-bottom: 5cm;
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
            
            .label-barcode {
                text-align: center;
                margin: 5cm 0;
            }
            
            .label-barcode img {
                height: 20cm;
                width: 80%;
            }
            
            .barcode-number {
                font-size: 8cm;
                margin-top: 2cm;
                font-weight: bold;
            }
            
            .label-details {
                margin: 5cm 0;
                flex-grow: 1;
            }
            
            .details-table {
                width: 100%;
                border-collapse: collapse;
            }
            
            .details-table tr {
                height: 12cm;
            }
            
            .label-key {
                font-weight: bold;
                font-size: 6cm;
                width: 30%;
                text-align: right;
                padding-right: 2cm;
                color: #555;
            }
            
            .label-value {
                font-size: 7cm;
                width: 70%;
                padding-left: 2cm;
            }
            
            .qr-code {
                text-align: center;
                margin: 5cm 0;
            }
            
            .qr-code img {
                height: 30cm;
                width: 30cm;
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
