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
        this.resource_tags = [];
        this.bom_operations = [];  // ✅ Store BOM operations for validation
        
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
                        <div class="col-md-8">
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
                        <div class="col-md-4">
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
        FinishingCommon.fetchBOM(item_code, (error, bom) => {
            if (!error && bom && bom.operations) {
                this.bom_operations = bom.operations.map(op => op.operation).filter(Boolean);
                this.update_operation_dropdown();
            } else {
                // Default operations if no BOM
                this.bom_operations = ['Post Curing', 'OD Trimming', 'ID Trimming', 'Visual Inspection'];
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
                doctype: "Lot Resource Tagging",
                filters: { scan_lot_no: this.sublot_details.sublot_number },
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
        
        // ✅ NEW: Validate operation exists in BOM
        if (!this.isBomOperation(operation)) {
            frappe.msgprint({
                title: __('Invalid Operation'),
                message: __(`Operation "${operation}" is not in the BOM for this item. Please select a valid operation.`),
                indicator: 'red'
            });
            return;
        }
        
        // ✅ NEW: Check for duplicate operations
        const isDuplicate = this.resource_tags.some(tag => tag.operation_type === operation);
        if (isDuplicate) {
            frappe.msgprint({
                title: __('Duplicate Operation'),
                message: __(`Operation "${operation}" is already assigned. Duplicate operations are not allowed.`),
                indicator: 'orange'
            });
            return;
        }
        
        // ✅ NEW: Validate employee is authorized for this operation
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
        
        frappe.call({
            method: "frappe.client.insert",
            args: {
                doc: {
                    doctype: "Lot Resource Tagging",
                    scan_lot_no: this.sublot_details.sublot_number,
                    scan_operator: this.employee_details.employee.name,  // ✅ FIXED: Added scan_operator field
                    product_ref: this.sublot_details.item_code,
                    batch_no: this.sublot_details.sublot_batch,
                    operation_type: operation,
                    operator_id: this.employee_details.employee.name,
                    operator_name: this.employee_details.employee.employee_name,
                    posting_date: frappe.datetime.get_today(),
                    qtynos: this.sublot_details.sublot_qty || 0,
                    available_qty: this.sublot_details.sublot_qty || 0
                }
            },
            callback: (r) => {
                if (r.message) {
                    // ✅ NEW: Auto-submit the document after creation
                    this.submit_resource_tag(r.message);
                }
            }
        });
    }
    
    // ✅ NEW: Submit resource tag document
    submit_resource_tag(doc) {
        frappe.call({
            method: "frappe.client.submit",
            args: {
                doc: doc
            },
            callback: (r) => {
                if (r.message) {
                    frappe.show_alert({
                        message: __("Resource tagged and submitted successfully"),
                        indicator: 'green'
                    }, 3);
                    
                    this.resource_tags.push(r.message);
                    this.update_resource_table();
                    
                    // Check if all BOM operations are complete
                    this.check_bom_completion();
                    
                    // Clear inputs
                    this.resource_section.find('#operation_select').val('');
                    this.resource_section.find('#scan_employee').val('');
                    this.resource_section.find('#employee_validation_result').html('');
                    this.employee_details = null;
                    
                    // Focus back to operation
                    this.resource_section.find('#operation_select').focus();
                } else {
                    frappe.msgprint({
                        title: __('Submission Failed'),
                        message: __('Resource tag was created but could not be submitted. Please submit it manually.'),
                        indicator: 'orange'
                    });
                }
            },
            error: (r) => {
                frappe.msgprint({
                    title: __('Submission Error'),
                    message: __('Resource tag was created but submission failed: ') + (r.message || 'Unknown error'),
                    indicator: 'red'
                });
            }
        });
    }
    
    // ✅ NEW: Helper method to check if operation is in BOM
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
        const missingOperations = this.bom_operations.filter(op => !assignedOperations.includes(op));
        
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
            // Show info about missing operations
            const $info = $(`
                <div class="alert alert-info mt-3 bom-completion-info">
                    <i class="fa fa-info-circle mr-2"></i>
                    <strong>Pending Operations:</strong> ${missingOperations.join(', ')}
                </div>
            `);
            this.resource_section.find('#resource_tags_table').closest('.table-responsive').after($info);
        }
    }
    
    update_resource_table() {
        const tbody = this.resource_section.find('#resource_tags_table tbody');
        tbody.empty();
        
        if (this.resource_tags.length === 0) {
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
        
        // Attach delete handlers
        tbody.find('button[data-tag-name]').on('click', (e) => {
            const tag_name = $(e.currentTarget).data('tag-name');
            this.remove_resource_tag(tag_name);
        });
    }
    
    remove_resource_tag(tag_name) {
        frappe.confirm(
            __('Are you sure you want to remove this resource tag?'),
            () => {
                frappe.call({
                    method: "frappe.client.delete",
                    args: {
                        doctype: "Lot Resource Tagging",
                        name: tag_name
                    },
                    callback: (r) => {
                        frappe.show_alert({
                            message: __("Resource tag removed"),
                            indicator: 'red'
                        }, 3);
                        
                        this.resource_tags = this.resource_tags.filter(t => t.name !== tag_name);
                        this.update_resource_table();
                        
                        // ✅ NEW: Re-check BOM completion after deletion
                        this.check_bom_completion();
                    }
                });
            }
        );
    }
}
