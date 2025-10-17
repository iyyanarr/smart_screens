/**
 * Resource Tagging Center - Individual Page
 * Standalone page for assigning operations and employees to sub-lots
 */

frappe.pages['resource-tagging'].on_page_load = function(wrapper) {
    var page = frappe.ui.make_app_page({
        parent: wrapper,
        title: 'Resource Tagging Center',
        single_column: true
    });
    
    FinishingCommon.showLocationSelector(page, (locationData) => {
        new ResourceTaggingPage(page, locationData);
    });
};

class ResourceTaggingPage {
    constructor(page, locationData) {
        this.page = page;
        this.wrapper = $(page.wrapper);
        this.user_settings = locationData;
        
        this.sublot_details = null;
        this.employee_details = null;
        this.resource_tags = [];  // Saved tags from database
        this.pending_tags = [];   // ✅ NEW: Pending tags not yet saved
        this.bom_operations = [];
        this.bom_details = null;  // ✅ NEW: Store full BOM details
        
        // ✅ NEW: Add color options for operation badges
        this.badgeColors = ["primary", "secondary", "success", "danger", "warning", "info", "dark"];
        
        FinishingCommon.addFactoryStyles();
        this.make();
    }
    
    make() {
        this.wrapper.find('.page-content').empty();
        
        this.add_header_section();
        this.add_resource_tagging_section();
        this.add_information_section();
    }
    
    add_header_section() {
        $(`<div class="page-head-content mb-4">
            <p class="text-muted" style="font-size: 16px;">
                Assign operations and employees to sub-lots for traceability.
                Scan sub-lot, select operation, validate employee, and create resource tags.
            </p>
        </div>`).appendTo(this.wrapper.find('.page-content'));
    }
    
    add_resource_tagging_section() {
        this.resource_section = $(`
            <div class="factory-section">
                <div class="factory-section-head">
                    <i class="fa fa-users mr-2"></i>Resource Tagging
                </div>
                <div class="section-body">
                    <!-- Sub-lot Scanner -->
                    <div class="row mb-4">
                        <div class="col-md-6">
                            <div class="factory-form-group">
                                <label class="factory-label">
                                    <i class="fa fa-barcode mr-2"></i>Scan Sub-Lot Number
                                </label>
                                <div class="input-group">
                                    <input type="text" class="form-control factory-input" 
                                           id="scan_sublot" placeholder="Scan or enter sub-lot number"
                                           autocomplete="off">
                                    <div class="input-group-append">
                                        <button class="btn btn-primary factory-btn-validate" id="validate_sublot_btn">
                                            <i class="fa fa-check mr-2"></i>Validate
                                        </button>
                                    </div>
                                </div>
                                <div id="sublot_validation_result" class="factory-validation-result"></div>
                            </div>
                        </div>
                        <div class="col-md-3">
                            <div id="sublot_info_display" class="card mt-4" style="display: none;">
                                <div class="card-body p-3">
                                    <div class="factory-compact-info">
                                        <div class="factory-compact-row">
                                            <span class="factory-compact-label">Item:</span>
                                            <span class="factory-compact-value" id="display_item_code">-</span>
                                        </div>
                                        <div class="factory-compact-row">
                                            <span class="factory-compact-label">Quantity:</span>
                                            <span class="factory-compact-value" id="display_qty">-</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <!-- ✅ NEW: BOM Information Display -->
                        <div class="col-md-3">
                            <div id="bom_info_display" class="card mt-4" style="display: none;">
                                <div class="card-header bg-light p-2">
                                    <strong><i class="fa fa-sitemap mr-2"></i>BOM Information</strong>
                                </div>
                                <div class="card-body p-2">
                                    <div id="bom_details_content" class="small">
                                        <div class="text-muted">No BOM data</div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                    
                    <hr>
                    
                    <!-- Resource Assignment Section -->
                    <div id="resource_assignment_section" style="display: none;">
                        <h5 class="mb-3">Assign Resources</h5>
                        
                        <div class="row">
                            <div class="col-md-5">
                                <div class="factory-form-group">
                                    <label class="factory-label">
                                        <i class="fa fa-cog mr-2"></i>Select Operation
                                    </label>
                                    <select class="form-control factory-input" id="operation_select">
                                        <option value="">Select operation...</option>
                                    </select>
                                </div>
                            </div>
                            
                            <div class="col-md-5">
                                <div class="factory-form-group">
                                    <label class="factory-label">
                                        <i class="fa fa-user mr-2"></i>Scan Employee ID
                                    </label>
                                    <div class="input-group">
                                        <input type="text" class="form-control factory-input" 
                                               id="scan_employee" placeholder="Scan employee ID"
                                               autocomplete="off">
                                        <div class="input-group-append">
                                            <button class="btn btn-primary factory-btn-validate" id="validate_employee_btn">
                                                <i class="fa fa-check mr-2"></i>Validate
                                            </button>
                                        </div>
                                    </div>
                                    <div id="employee_validation_result" class="factory-validation-result"></div>
                                </div>
                            </div>
                            
                            <div class="col-md-2 d-flex align-items-end mb-3">
                                <button class="btn btn-success factory-btn w-100" id="add_resource_tag_btn">
                                    <i class="fa fa-plus mr-2"></i>Add
                                </button>
                            </div>
                        </div>
                        
                        <!-- Resource Tags Table -->
                        <div class="row mt-4">
                            <div class="col-12">
                                <h5>Assigned Resources</h5>
                                <div class="table-responsive">
                                    <table class="table table-bordered factory-table" id="resource_tags_table">
                                        <thead class="thead-light">
                                            <tr>
                                                <th width="30%">Operation</th>
                                                <th width="20%">Employee ID</th>
                                                <th width="30%">Employee Name</th>
                                                <th width="20%">Actions</th>
                                            </tr>
                                        </thead>
                                        <tbody></tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                        
                        <!-- ✅ NEW: Save All Button -->
                        <div class="row mt-4">
                            <div class="col-12 text-right">
                                <button class="btn btn-primary" id="save_all_tags_btn">
                                    <i class="fa fa-save mr-2"></i>Save All
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
        this.resource_section.find('#scan_sublot').on('keypress', (e) => {
            if (e.which === 13) {
                e.preventDefault();
                this.validate_sublot();
            }
        });
        
        // Validate sublot on button click
        this.resource_section.find('#validate_sublot_btn').on('click', () => {
            this.validate_sublot();
        });
        
        // Validate employee on Enter
        this.resource_section.find('#scan_employee').on('keypress', (e) => {
            if (e.which === 13) {
                e.preventDefault();
                this.validate_employee();
            }
        });
        
        // Validate employee on button click
        this.resource_section.find('#validate_employee_btn').on('click', () => {
            this.validate_employee();
        });
        
        // Add resource tag
        this.resource_section.find('#add_resource_tag_btn').on('click', () => {
            this.add_resource_tag();
        });
        
        // ✅ Save all pending tags
        this.resource_section.find('#save_all_tags_btn').on('click', () => {
            this.save_all_pending_tags();
        });
    }
    
    validate_sublot() {
        const sublot_number = this.resource_section.find('#scan_sublot').val().trim();
        
        if (!sublot_number) {
            frappe.msgprint(__("Please scan or enter a sub-lot number"));
            return;
        }
        
        const result_div = this.resource_section.find('#sublot_validation_result');
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
                fields: ["name", "item_code", "sublot_number", "sublot_batch", "sublot_qty", "uom"],
                limit: 1
            },
            callback: (r) => {
                if (r.message && r.message.length > 0) {
                    this.sublot_details = r.message[0];
                    
                    result_div.html(`<div class="alert alert-success">
                        <i class="fa fa-check-circle mr-2"></i>Sub-Lot validated successfully!
                    </div>`);
                    
                    // Display sublot info
                    this.resource_section.find('#sublot_info_display').show();
                    this.resource_section.find('#display_item_code').text(this.sublot_details.item_code);
                    this.resource_section.find('#display_qty').text(`${this.sublot_details.sublot_qty} ${this.sublot_details.uom}`);
                    
                    // Show resource assignment section
                    this.resource_section.find('#resource_assignment_section').show();
                    
                    // Fetch BOM operations
                    this.fetch_operations(this.sublot_details.item_code);
                    
                    // Load existing tags
                    this.load_existing_tags(this.sublot_details.name);
                    
                } else {
                    result_div.html(`<div class="alert alert-danger">
                        <i class="fa fa-times-circle mr-2"></i>Invalid sub-lot number or sub-lot not submitted
                    </div>`);
                    this.resource_section.find('#sublot_info_display').hide();
                    this.resource_section.find('#resource_assignment_section').hide();
                }
            }
        });
    }
    
    fetch_operations(item_code) {
        // ✅ NEW: Show loading indicator
        const bomDisplay = this.resource_section.find('#bom_info_display');
        const bomContent = this.resource_section.find('#bom_details_content');
        
        bomDisplay.show();
        bomContent.html(`
            <div class="text-center">
                <i class="fa fa-spinner fa-spin"></i> Loading BOM...
            </div>
        `);
        
        // ✅ Use the same method as Sub Lot Process Page
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
                        // ✅ Store BOM details for later use
                        this.bom_details = bomData.boms;
                        const defaultBom = bomData.boms[0];
                        
                        // ✅ Extract operations from BOM
                        if (defaultBom.operations && defaultBom.operations.length > 0) {
                            this.bom_operations = defaultBom.operations
                                .map(op => op.operation)
                                .filter(Boolean);
                        } else {
                            this.bom_operations = [];
                        }
                        
                        // ✅ Create visual BOM display with badges
                        let bomHtml = '<div class="bom-info-content">';
                        bomHtml += `<div class="mb-1"><strong>BOM:</strong> <small>${defaultBom.bom_no}</small></div>`;
                        bomHtml += `<div class="mb-2"><strong>Item:</strong> <small>${defaultBom.parent_item_code}</small></div>`;
                        
                        // Show operations as colored badges
                        if (this.bom_operations.length > 0) {
                            bomHtml += `<div><strong>Operations:</strong></div>`;
                            bomHtml += `<div class="operations-badges mt-1">`;
                            this.bom_operations.forEach(op => {
                                const badgeColor = this.getRandomBadgeColor();
                                bomHtml += `<span class="badge badge-${badgeColor} mr-1 mb-1" style="font-size: 9px;">${op}</span>`;
                            });
                            bomHtml += `</div>`;
                        } else {
                            bomHtml += `<div class="text-warning small">No operations defined in BOM</div>`;
                        }
                        
                        bomHtml += '</div>';
                        bomContent.html(bomHtml);
                        
                        // Update operation dropdown
                        this.update_operation_dropdown();
                        
                    } else {
                        // ✅ No BOM found - show warning but allow manual operations
                        bomContent.html(`
                            <div class="alert alert-warning mb-0 p-2">
                                <small><i class="fa fa-exclamation-triangle mr-1"></i>No default BOM found</small>
                            </div>
                        `);
                        
                        // ✅ Use fallback operations instead of hardcoded
                        this.bom_operations = [
                            'Moulding',
                            'Post Curing',
                            'OD Trimming',
                            'ID Trimming',
                            'Visual Inspection',
                            'Final Visual Inspection'
                        ];
                        
                        this.update_operation_dropdown();
                    }
                } else {
                    // ✅ Error fetching BOM
                    bomContent.html(`
                        <div class="alert alert-danger mb-0 p-2">
                            <small><i class="fa fa-times-circle mr-1"></i>Error loading BOM</small>
                        </div>
                    `);
                    
                    // ✅ Use fallback operations
                    this.bom_operations = [
                        'Moulding',
                        'Post Curing',
                        'OD Trimming',
                        'ID Trimming',
                        'Visual Inspection',
                        'Final Visual Inspection'
                    ];
                    
                    this.update_operation_dropdown();
                }
            },
            error: (err) => {
                console.error("Error fetching BOM:", err);
                
                bomContent.html(`
                    <div class="alert alert-danger mb-0 p-2">
                        <small><i class="fa fa-times-circle mr-1"></i>Failed to load BOM</small>
                    </div>
                `);
                
                // ✅ Use fallback operations on error
                this.bom_operations = [
                    'Moulding',
                    'Post Curing',
                    'OD Trimming',
                    'ID Trimming',
                    'Visual Inspection',
                    'Final Visual Inspection'
                ];
                
                this.update_operation_dropdown();
            }
        });
    }
    
    update_operation_dropdown() {
        const select = this.resource_section.find('#operation_select');
        select.html('<option value="">Select operation...</option>');
        
        this.bom_operations.forEach(op => {
            select.append(`<option value="${op}">${op}</option>`);
        });
    }
    
    load_existing_tags(sublot_id) {
        frappe.call({
            method: "frappe.client.get_list",
            args: {
                doctype: "SPP Lot Resource Tagging",
                filters: { 
                    spp_batch_no: this.sublot_details.sublot_number // ✅ FIXED: Use spp_batch_no instead of scan_lot_no
                },
                fields: ["name", "operation_type", "operator_id", "operator_name", "posting_date"]
            },
            callback: (r) => {
                if (r.message) {
                    this.resource_tags = r.message;
                    this.update_resource_table();
                    this.check_bom_completion();
                }
            },
            error: (err) => {
                console.error("Error loading existing tags:", err);
                // Continue even if loading existing tags fails
                this.resource_tags = [];
                this.update_resource_table();
            }
        });
    }
    
    validate_employee() {
        const employee_id = this.resource_section.find('#scan_employee').val().trim();
        
        if (!employee_id) {
            frappe.msgprint(__("Please scan or enter an employee ID"));
            return;
        }
        
        const result_div = this.resource_section.find('#employee_validation_result');
        result_div.html('<div class="alert alert-info">Validating employee...</div>');
        
        FinishingCommon.validateEmployee(employee_id, (error, data) => {
            if (error) {
                result_div.html(`<div class="alert alert-danger">
                    <i class="fa fa-times-circle mr-2"></i>${error}
                </div>`);
                this.employee_details = null;
            } else {
                this.employee_details = data;
                result_div.html(`<div class="alert alert-success">
                    <i class="fa fa-check-circle mr-2"></i>${data.employee.employee_name} - ${data.designation || 'N/A'}
                </div>`);
            }
        });
    }
    
    add_resource_tag() {
        if (!this.sublot_details) {
            frappe.msgprint(__("Please validate a sub-lot first"));
            return;
        }
        
        if (!this.employee_details) {
            frappe.msgprint(__("Please validate an employee first"));
            return;
        }
        
        const operation = this.resource_section.find('#operation_select').val();
        if (!operation) {
            frappe.msgprint(__("Please select an operation"));
            return;
        }
        
        // ✅ Validate operation exists in BOM
        if (!this.isBomOperation(operation)) {
            frappe.msgprint({
                title: __('Invalid Operation'),
                message: __(`Operation "${operation}" is not in the BOM for this item. Please select a valid operation.`),
                indicator: 'red'
            });
            return;
        }
        
        // ✅ Check for duplicate operations
        const isDuplicate = this.resource_tags.some(tag => tag.operation_type === operation) ||
                            this.pending_tags.some(tag => tag.operation_type === operation);
        if (isDuplicate) {
            frappe.msgprint({
                title: __('Duplicate Operation'),
                message: __(`Operation "${operation}" is already assigned. Duplicate operations are not allowed.`),
                indicator: 'orange'
            });
            return;
        }
        
        // ✅ Validate employee is authorized for this operation
        if (this.employee_details.allowed_operations && 
            this.employee_details.allowed_operations.length > 0 &&
            !this.employee_details.allowed_operations.includes(operation)) {
            frappe.msgprint({
                title: __('Unauthorized Operation'),
                message: __(`Employee "${this.employee_details.employee.employee_name}" is not authorized to perform operation "${operation}"`),
                indicator: 'red'
            });
            return;
        }
        
        // ✅ NEW: Add to pending tags
        this.pending_tags.push({
            operation_type: operation,
            operator_id: this.employee_details.employee.name,
            operator_name: this.employee_details.employee.employee_name
        });
        
        this.update_resource_table();
        
        // Clear inputs
        this.resource_section.find('#operation_select').val('');
        this.resource_section.find('#scan_employee').val('');
        this.resource_section.find('#employee_validation_result').html('');
        this.employee_details = null;
        
        // Focus back to operation
        this.resource_section.find('#operation_select').focus();
    }
    
    // ✅ NEW: Save all pending tags using the complete workflow
    save_all_pending_tags() {
        if (this.pending_tags.length === 0) {
            frappe.msgprint(__("No pending tags to save"));
            return;
        }
        
        // Show progress dialog
        const progressDialog = new frappe.ui.Dialog({
            title: __('Processing Resource Tagging Workflow'),
            fields: [
                {
                    fieldname: 'progress_html',
                    fieldtype: 'HTML',
                    options: this.getProgressHTML(0, 'Initializing...')
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
            progressDialog.fields_dict.progress_html.$wrapper.html(
                this.getProgressHTML(percent, message, stage)
            );
        };
        
        // Call the new workflow API
        updateProgress(20, 'Creating Sub Lot Process...', 'process');
        
        frappe.call({
            method: "smart_screens.smart_screens.api.resource_tagging.create_resource_tagging_workflow",
            args: {
                sublot_number: this.sublot_details.sublot_number,
                operations_data: this.pending_tags
            },
            callback: (r) => {
                if (r.message && r.message.status === "success") {
                    updateProgress(100, 'Workflow completed successfully!', 'complete');
                    
                    const data = r.message.data;
                    
                    // Show success message with details
                    frappe.show_alert({
                        message: __("Resource tagging workflow completed! Created {0} resource tags, {1} job cards", 
                            [data.resource_tags.length, data.job_cards.length]),
                        indicator: 'green'
                    }, 5);
                    
                    // Show detailed results
                    this.showWorkflowResults(data);
                    
                    // Clear pending tags
                    this.pending_tags = [];
                    
                    // Reload existing tags
                    this.load_existing_tags(this.sublot_details.name);
                    
                    // Show close button
                    progressDialog.$wrapper.find('.btn-primary').show();
                    
                } else if (r.message && r.message.status === "warning") {
                    updateProgress(75, 'Completed with warnings', 'warning');
                    
                    frappe.msgprint({
                        title: __('Partial Success'),
                        message: r.message.message,
                        indicator: 'orange'
                    });
                    
                    // Reload tags anyway
                    this.load_existing_tags(this.sublot_details.name);
                    progressDialog.$wrapper.find('.btn-primary').show();
                    
                } else {
                    updateProgress(0, 'Failed: ' + (r.message ? r.message.message : 'Unknown error'), 'error');
                    
                    frappe.msgprint({
                        title: __('Error'),
                        message: __('Failed to create workflow: ') + (r.message ? r.message.message : 'Unknown error'),
                        indicator: 'red'
                    });
                    
                    progressDialog.$wrapper.find('.btn-primary').show();
                }
            },
            error: (err) => {
                updateProgress(0, 'Error: ' + (err.message || 'Unknown error'), 'error');
                
                frappe.msgprint({
                    title: __('Error'),
                    message: __('Failed to create workflow: ') + (err.message || 'Unknown error'),
                    indicator: 'red'
                });
                
                progressDialog.$wrapper.find('.btn-primary').show();
            }
        });
    }
    
    // ✅ NEW: Generate progress HTML for dialog
    getProgressHTML(percent, message, stage = 'process') {
        const stageIcons = {
            'process': 'fa-cog fa-spin',
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
        
        const icon = stageIcons[stage] || 'fa-cog fa-spin';
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
                ${stage === 'process' ? '<p class="text-muted mt-3">Please wait, this may take a few moments...</p>' : ''}
            </div>
        `;
    }
    
    // ✅ NEW: Show workflow results in a nice dialog
    showWorkflowResults(data) {
        const resultsDialog = new frappe.ui.Dialog({
            title: __('Workflow Results'),
            size: 'large',
            fields: [
                {
                    fieldname: 'results_html',
                    fieldtype: 'HTML',
                    options: `
                        <div class="workflow-results">
                            <div class="alert alert-success">
                                <i class="fa fa-check-circle mr-2"></i>
                                <strong>Workflow completed successfully!</strong>
                            </div>
                            
                            <h5 class="mt-4 mb-3">Created Documents:</h5>
                            
                            <div class="row">
                                <div class="col-md-6">
                                    <div class="card">
                                        <div class="card-body">
                                            <h6 class="card-title">
                                                <i class="fa fa-file-text-o mr-2"></i>Sub Lot Process
                                            </h6>
                                            <p class="card-text">
                                                <a href="/app/sub-lot-process/${data.sublot_process}" target="_blank">
                                                    ${data.sublot_process}
                                                </a>
                                            </p>
                                        </div>
                                    </div>
                                </div>
                                
                                ${data.work_order ? `
                                <div class="col-md-6">
                                    <div class="card">
                                        <div class="card-body">
                                            <h6 class="card-title">
                                                <i class="fa fa-industry mr-2"></i>Work Order
                                            </h6>
                                            <p class="card-text">
                                                <a href="/app/work-order/${data.work_order}" target="_blank">
                                                    ${data.work_order}
                                                </a>
                                            </p>
                                        </div>
                                    </div>
                                </div>
                                ` : ''}
                            </div>
                            
                            <div class="row mt-3">
                                <div class="col-md-6">
                                    <div class="card">
                                        <div class="card-body">
                                            <h6 class="card-title">
                                                <i class="fa fa-tags mr-2"></i>Resource Tags
                                            </h6>
                                            <p class="card-text">
                                                Created <strong>${data.resource_tags.length}</strong> resource tags
                                            </p>
                                            <ul class="list-unstyled mb-0">
                                                ${data.resource_tags.map(tag => `
                                                    <li>
                                                        <a href="/app/lot-resource-tagging/${tag}" target="_blank">
                                                            ${tag}
                                                        </a>
                                                    </li>
                                                `).join('')}
                                            </ul>
                                        </div>
                                    </div>
                                </div>
                                
                                ${data.job_cards && data.job_cards.length > 0 ? `
                                <div class="col-md-6">
                                    <div class="card">
                                        <div class="card-body">
                                            <h6 class="card-title">
                                                <i class="fa fa-briefcase mr-2"></i>Job Cards
                                            </h6>
                                            <p class="card-text">
                                                Created <strong>${data.job_cards.length}</strong> job cards
                                            </p>
                                            <ul class="list-unstyled mb-0">
                                                ${data.job_cards.map(jc => `
                                                    <li>
                                                        <a href="/app/job-card/${jc}" target="_blank">
                                                            ${jc}
                                                        </a>
                                                    </li>
                                                `).join('')}
                                            </ul>
                                        </div>
                                    </div>
                                </div>
                                ` : ''}
                            </div>
                            
                            ${data.inspection_entry ? `
                            <div class="row mt-3">
                                <div class="col-md-12">
                                    <div class="card">
                                        <div class="card-body">
                                            <h6 class="card-title">
                                                <i class="fa fa-check-square-o mr-2"></i>Inspection Entry
                                            </h6>
                                            <p class="card-text">
                                                <a href="/app/spp-inspection-entry/${data.inspection_entry}" target="_blank">
                                                    ${data.inspection_entry}
                                                </a>
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            ` : ''}
                        </div>
                        
                        <style>
                            .workflow-results .card {
                                margin-bottom: 10px;
                                border: 1px solid #e0e0e0;
                            }
                            .workflow-results .card-title {
                                color: #333;
                                font-weight: 600;
                                margin-bottom: 10px;
                            }
                            .workflow-results .card-text a {
                                color: #2490ef;
                                text-decoration: none;
                            }
                            .workflow-results .card-text a:hover {
                                text-decoration: underline;
                            }
                        </style>
                    `
                }
            ],
            primary_action_label: __('Close'),
            primary_action: function() {
                resultsDialog.hide();
            }
        });
        
        resultsDialog.show();
    }
    
    // ✅ Helper method to check if operation is in BOM
    isBomOperation(operation) {
        if (!this.bom_operations || this.bom_operations.length === 0) {
            return true; // If no BOM, allow all operations
        }
        return this.bom_operations.includes(operation);
    }
    
    // ✅ NEW: Check if all BOM operations have been assigned
    check_bom_completion() {
        if (!this.bom_operations || this.bom_operations.length === 0) return;
        
        const assignedOperations = this.resource_tags.map(tag => tag.operation_type);
        const pendingOperations = this.pending_tags.map(tag => tag.operation_type);
        const allAssignedOperations = [...assignedOperations, ...pendingOperations];
        const missingOperations = this.bom_operations.filter(op => !allAssignedOperations.includes(op));
        
        // Remove previous info if exists
        this.resource_section.find('.bom-completion-info').remove();
        
        if (missingOperations.length === 0) {
            frappe.show_alert({
                message: __("All BOM operations have been assigned! ✓"),
                indicator: 'green'
            }, 5);
            
            // Add success badge
            const $success = $(`
                <div class="alert alert-success mt-3 bom-completion-info">
                    <i class="fa fa-check-circle mr-2"></i>
                    <strong>All BOM operations completed!</strong>
                </div>
            `);
            this.resource_section.find('#resource_tags_table').closest('.table-responsive').after($success);
        } else {
            // ✅ FIXED: Just show info, don't block user
            const $info = $(`
                <div class="alert alert-info mt-3 bom-completion-info">
                    <i class="fa fa-info-circle mr-2"></i>
                    <strong>Pending Operations (${missingOperations.length}):</strong> ${missingOperations.join(', ')}
                </div>
            `);
            this.resource_section.find('#resource_tags_table').closest('.table-responsive').after($info);
        }
    }
    
    update_resource_table() {
        const tbody = this.resource_section.find('#resource_tags_table tbody');
        tbody.empty();
        
        if (this.resource_tags.length === 0 && this.pending_tags.length === 0) {
            tbody.append(`
                <tr>
                    <td colspan="4" class="text-center text-muted">
                        No resources assigned yet
                    </td>
                </tr>
            `);
            return;
        }
        
        this.resource_tags.forEach((tag, idx) => {
            tbody.append(`
                <tr>
                    <td>${tag.operation_type}</td>
                    <td>${tag.operator_id}</td>
                    <td>${tag.operator_name}</td>
                    <td>
                        <button class="btn btn-sm btn-danger" data-tag-name="${tag.name}">
                            <i class="fa fa-trash mr-1"></i>Delete
                        </button>
                    </td>
                </tr>
            `);
        });
        
        this.pending_tags.forEach((tag, idx) => {
            tbody.append(`
                <tr class="table-warning">
                    <td>${tag.operation_type}</td>
                    <td>${tag.operator_id}</td>
                    <td>${tag.operator_name}</td>
                    <td>
                        <button class="btn btn-sm btn-danger" data-pending-index="${idx}">
                            <i class="fa fa-trash mr-1"></i>Remove
                        </button>
                    </td>
                </tr>
            `);
        });
        
        // Attach delete handlers
        tbody.find('button[data-tag-name]').on('click', (e) => {
            const tag_name = $(e.currentTarget).data('tag-name');
            this.remove_resource_tag(tag_name);
        });
        
        // Attach remove handlers for pending tags
        tbody.find('button[data-pending-index]').on('click', (e) => {
            const index = $(e.currentTarget).data('pending-index');
            this.pending_tags.splice(index, 1);
            this.update_resource_table();
        });
    }
    
    remove_resource_tag(tag_name) {
        frappe.confirm(
            __('Are you sure you want to remove this resource tag?'),
            () => {
                frappe.call({
                    method: "frappe.client.delete",
                    args: {
                        doctype: "SPP Lot Resource Tagging",
                        name: tag_name
                    },
                    callback: (r) => {
                        frappe.show_alert({
                            message: __("Resource tag removed"),
                            indicator: 'red'
                        }, 3);
                        
                        this.resource_tags = this.resource_tags.filter(t => t.name !== tag_name);
                        this.update_resource_table();
                        
                        // ✅ Re-check BOM completion after deletion
                        this.check_bom_completion();
                    }
                });
            }
        );
    }
    
    // ✅ NEW: Generate random badge color
    getRandomBadgeColor() {
        const randomIndex = Math.floor(Math.random() * this.badgeColors.length);
        return this.badgeColors[randomIndex];
    }
}
