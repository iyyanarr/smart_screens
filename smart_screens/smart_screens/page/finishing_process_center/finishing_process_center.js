frappe.pages['finishing-process-center'].on_page_load = function(wrapper) {
    var page = frappe.ui.make_app_page({
        parent: wrapper,
        title: 'Finishing Process Control Center',
        single_column: true
    });

    // Initialize the page with a location selector
    showLocationSelector(page);
};

// Function to show the location selector dialog and initialize the page
function showLocationSelector(page) {
    // First, fetch available locations for the current user
    frappe.call({
        method: "smart_screens.smart_screens.utils.emp_validation.get_location_by_role",
        args: {
            user: frappe.session.user
        },
        callback: function(r) {
            if (r.message && r.message.length > 0) {
                // Log locations for debugging
                console.log("Available locations for current user:", r.message);
                
                // Store available locations
                const availableLocations = r.message;
                
                // If there's only one location, use it without prompting
                if (availableLocations.length === 1) {
                    initializePageWithLocation(page, availableLocations[0]);
                    return;
                }
                
                // Create fields for the dialog
                let fields = [
                    {
                        label: 'Select Location',
                        fieldname: 'location',
                        fieldtype: 'Select',
                        options: availableLocations.map(loc => {
                            // Create descriptive option text
                            return {
                                value: JSON.stringify(loc),
                                label: `${loc.location} (${loc.role}) - ${loc.transaction_type || 'N/A'}`
                            };
                        }),
                        reqd: 1,
                        description: 'Select the location you want to work with'
                    }
                ];
                
                // Create and show the dialog
                let locationDialog = new frappe.ui.Dialog({
                    title: 'Select Working Location',
                    fields: fields,
                    primary_action_label: 'Confirm',
                    primary_action: function() {
                        let selectedLocationStr = locationDialog.get_values().location;
                        let selectedLocation = JSON.parse(selectedLocationStr);
                        
                        locationDialog.hide();
                        initializePageWithLocation(page, selectedLocation);
                    },
                    secondary_action_label: 'Use Default',
                    secondary_action: function() {
                        locationDialog.hide();
                        initializePageWithLocation(page, availableLocations[0]);
                    }
                });
                
                locationDialog.show();
                
                // Add a nice description to the dialog
                locationDialog.$wrapper.find('.modal-body').prepend(`
                    <div class="alert alert-info mb-3">
                        <i class="fa fa-info-circle mr-2"></i>
                        <span>You have access to multiple locations. Please select the location you want to work with.</span>
                    </div>
                `);
            } else {
                // No locations found, show a message and initialize with empty location
                frappe.msgprint(__('No location mappings found for your role. Some functionality may be limited.'));
                initializePageWithLocation(page, {});
            }
        }
    });
}

// Function to initialize the page with the selected location
function initializePageWithLocation(page, locationData) {
    // Create a modified version of the location data with the correct property names
    const mappedLocationData = { ...locationData };
    
    // Map source_warehouse to default_warehouse for consistency
    if (locationData.source_warehouse) {
        mappedLocationData.default_warehouse = locationData.source_warehouse;
    }
    
    // Initialize the page with the mapped location data
    frappe.finishing_process_center = new FinishingProcessCenter(page, mappedLocationData);
}

// Modified FinishingProcessCenter class to accept locationData
class FinishingProcessCenter {
    constructor(page, locationData) {
        this.page = page;
        this.wrapper = $(page.wrapper);
        this.user_settings = locationData || {};
        
        // Add factory-friendly styles
        this.add_factory_styles();
        
        this.make();
        this.load_data();
        
        // We'll add the information card at the bottom of the page after all workflow steps
    }

    // Add factory-friendly styles for better usability in factory environments
    add_factory_styles() {
        $(`<style>
            /* Larger input fields */
            .factory-input {
                height: 50px !important;
                font-size: 18px !important;
                padding: 10px 15px !important;
            }
            
            /* Larger buttons with better distinction */
            .factory-btn {
                padding: 12px 20px !important;
                font-size: 18px !important;
                margin: 10px 5px !important;
                min-width: 180px;
            }
            
            .factory-btn-validate {
                height: 50px !important;
                font-size: 16px !important;
                padding: 10px 15px !important;
                min-width: 100px;
            }
            
            /* Section styles for better readability */
            .factory-section {
                background-color: #fff;
                border-radius: 10px;
                box-shadow: 0 4px 8px rgba(0,0,0,0.1);
                padding: 20px;
                margin-bottom: 25px;
            }
            
            .factory-section-head {
                font-size: 24px;
                margin-bottom: 20px;
                padding-bottom: 15px;
                border-bottom: 2px solid #4a90e2;
                color: #333;
            }
            
            /* Improved spacing */
            .factory-form-group {
                margin-bottom: 25px;
            }
            
            .factory-label {
                font-size: 18px;
                margin-bottom: 10px;
                display: block;
                color: #555;
            }
            
            /* Improved validation display */
            .factory-validation-result {
                padding: 15px;
                margin-top: 15px;
                border-radius: 8px;
            }
            
            /* Improved location card */
            .factory-card {
                margin-bottom: 25px;
                box-shadow: 0 4px 10px rgba(0,0,0,0.15);
                border-radius: 10px;
                overflow: hidden;
            }
            
            .factory-card .card-header {
                font-size: 20px;
                padding: 15px 20px;
            }
            
            .factory-card .card-body {
                padding: 20px;
            }
            
            .factory-info-label {
                font-weight: bold;
                color: #555;
                font-size: 16px;
            }
            
            .factory-info-value {
                font-size: 18px;
                padding: 5px 0;
            }
            
            /* Improved workflow tabs */
            .factory-workflow-tabs .nav-item {
                margin: 0 5px;
            }
            
            .factory-workflow-tabs .nav-link {
                padding: 15px;
                font-size: 18px;
                border-radius: 8px 8px 0 0;
            }
            
            .factory-workflow-tabs .step-number {
                display: inline-block;
                width: 36px;
                height: 36px;
                line-height: 36px;
                text-align: center;
                border-radius: 50%;
                background-color: rgba(255,255,255,0.2);
                margin-right: 10px;
            }
            
            /* Table improvements */
            .factory-table th {
                font-size: 16px;
                padding: 12px;
                background-color: #f0f4f8;
            }
            
            .factory-table td {
                font-size: 16px;
                padding: 12px;
            }
            
            /* Better alerts */
            .factory-alert {
                font-size: 16px;
                padding: 15px;
                margin: 15px 0;
                border-radius: 8px;
            }
        </style>`).appendTo(document.head);
    }

    make() {
        // Add the main sections to the page
        this.add_header_section();
        this.add_workflow_tabs();
        this.add_sublot_entry_section();
        this.add_resource_tagging_section();
        this.add_inspection_section();
        
        // Add the information section at the bottom of the page
        this.add_information_section();
        
        // Initially show only the sublot entry section
        this.show_workflow_step('sublot-entry');
    }

    add_header_section() {
        // Create the header section with description
        $(`<div class="page-head-content">
            <p class="text-muted">
                Integrated control center for managing product finishing processes including Post Curing, 
                OD Trimming, ID Trimming, and Final Visual Inspection.
            </p>
        </div>`).appendTo(this.page.page_form);
    }
    
    add_workflow_tabs() {
        // Create factory-friendly workflow tabs for navigation
        this.workflow_tabs = $(`<div class="workflow-tabs factory-workflow-tabs">
            <ul class="nav nav-pills nav-justified" role="tablist">
                <li class="nav-item">
                    <a class="nav-link active" id="sublot-entry-tab" data-toggle="pill" href="#" role="tab" aria-selected="true">
                        <span class="step-number">1</span>
                        <span class="step-title">Create Sub-Lot</span>
                    </a>
                </li>
                <li class="nav-item">
                    <a class="nav-link disabled" id="resource-tagging-tab" data-toggle="pill" href="#" role="tab" aria-selected="false">
                        <span class="step-number">2</span>
                        <span class="step-title">Assign Resources</span>
                    </a>
                </li>
                <li class="nav-item">
                    <a class="nav-link disabled" id="inspection-tab" data-toggle="pill" href="#" role="tab" aria-selected="false">
                        <span class="step-number">3</span>
                        <span class="step-title">Quality Check</span>
                    </a>
                </li>
            </ul>
        </div>`).appendTo(this.wrapper);
        
        // Add click handlers for the tabs
        this.workflow_tabs.find('#sublot-entry-tab').on('click', () => {
            if (!$(this).hasClass('disabled')) {
                this.show_workflow_step('sublot-entry');
            }
        });
        
        this.workflow_tabs.find('#resource-tagging-tab').on('click', () => {
            if (!$(this).hasClass('disabled')) {
                this.show_workflow_step('resource-tagging');
            }
        });
        
        this.workflow_tabs.find('#inspection-tab').on('click', () => {
            if (!$(this).hasClass('disabled')) {
                this.show_workflow_step('inspection');
            }
        });
    }

    add_sublot_entry_section() {
        // Create the sublot entry section with factory-friendly UI
        this.sublot_section = $(`<div id="sublot-entry" class="workflow-step factory-section">
            <div class="factory-section-head">Step 1: Create Sub-Lot Entry</div>
            <div class="section-body">
                <div class="row">
                    <div class="col-md-6">
                        <div class="factory-form-group">
                            <label for="scan_lot" class="factory-label">
                                <i class="fa fa-barcode mr-2"></i>Scan or Enter Lot Number
                            </label>
                            <div class="input-group">
                                <input type="text" class="form-control factory-input" id="scan_lot" placeholder="Scan or enter lot number">
                                <div class="input-group-append">
                                    <button class="btn btn-primary factory-btn-validate validate-lot">
                                        <i class="fa fa-check mr-2"></i>Validate
                                    </button>
                                </div>
                            </div>
                            <small class="form-text text-muted mt-2">Scan or enter the main lot number to create sub-lots</small>
                            <div id="lot_validation_result" class="factory-validation-result"></div>
                        </div>
                    </div>
                    <div class="col-md-6">
                        <div class="factory-form-group">
                            <label for="sublot_qty" class="factory-label">
                                <i class="fa fa-balance-scale mr-2"></i>Quantity for Sub-Lot
                            </label>
                            <input type="number" class="form-control factory-input" id="sublot_qty" placeholder="Enter quantity for this sub-lot" disabled>
                            <small class="form-text text-muted mt-2">Enter the quantity to be allocated to this sub-lot</small>
                        </div>
                    </div>
                </div>
                
                <div class="row mt-4">
                    <div class="col-12 text-center">
                        <button class="btn btn-primary factory-btn create-sublot" disabled>
                            <i class="fa fa-plus-circle mr-2"></i> Create Sub-Lot
                        </button>
                        <button class="btn btn-success factory-btn proceed-to-tagging d-none">
                            <i class="fa fa-arrow-right mr-2"></i> Proceed to Resource Tagging
                        </button>
                    </div>
                </div>
            </div>
        </div>`).appendTo(this.wrapper);
        
        // Add event handlers for the sublot section
        this.sublot_section.find('#scan_lot').on('keypress', (e) => {
            if (e.which === 13) {
                this.validate_lot();
            }
        });
        
        this.sublot_section.find('.validate-lot').on('click', () => {
            this.validate_lot();
        });
        
        this.sublot_section.find('.create-sublot').on('click', () => {
            this.create_sublot();
        });
        
        this.sublot_section.find('.proceed-to-tagging').on('click', () => {
            this.show_workflow_step('resource-tagging');
        });
    }
    
    add_resource_tagging_section() {
        // Create the resource tagging section with factory-friendly UI
        this.resource_section = $(`<div id="resource-tagging" class="workflow-step factory-section d-none">
            <div class="factory-section-head">Step 2: Lot Resource Tagging</div>
            <div class="section-body">
                <div class="row">
                    <div class="col-md-12">
                        <div class="sublot-info alert alert-info p-3">
                            <h5 class="mb-3">Selected Sub-Lot Details</h5>
                            <div class="row">
                                <div class="col-md-3">
                                    <strong>Sub-Lot No:</strong> <span id="sublot_no_display" class="ml-2" style="font-size: 18px;"></span>
                                </div>
                                <div class="col-md-3">
                                    <strong>Item Code:</strong> <span id="resource_item_code_display" class="ml-2" style="font-size: 18px;"></span>
                                </div>
                                <div class="col-md-3">
                                    <strong>Quantity:</strong> <span id="sublot_qty_display" class="ml-2" style="font-size: 18px;"></span>
                                </div>
                                <div class="col-md-3">
                                    <strong>UOM:</strong> <span id="sublot_uom_display" class="ml-2" style="font-size: 18px;"></span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                
                <div class="row mt-4">
                    <div class="col-md-5">
                        <div class="factory-form-group">
                            <label for="operation_select" class="factory-label">
                                <i class="fa fa-cogs mr-2"></i>Select Operation
                            </label>
                            <select class="form-control factory-input" id="operation_select">
                                <option value="">Select an operation...</option>
                            </select>
                            <small class="form-text text-muted mt-2">Select the operation performed on this sub-lot</small>
                        </div>
                    </div>
                    
                    <div class="col-md-5">
                        <div class="factory-form-group">
                            <label for="scan_employee" class="factory-label">
                                <i class="fa fa-user-tag mr-2"></i>Scan Employee ID
                            </label>
                            <div class="input-group">
                                <input type="text" class="form-control factory-input" id="scan_employee" placeholder="Scan or enter employee ID">
                                <div class="input-group-append">
                                    <button class="btn btn-primary factory-btn-validate validate-employee">
                                        <i class="fa fa-check mr-2"></i>Validate
                                    </button>
                                </div>
                            </div>
                            <small class="form-text text-muted mt-2">Scan or enter the employee ID who performed this operation</small>
                            <div id="employee_validation_result" class="factory-validation-result"></div>
                        </div>
                    </div>
                    
                    <div class="col-md-2 d-flex align-items-end mb-3">
                        <button class="btn btn-primary factory-btn add-tagging">
                            <i class="fa fa-plus mr-2"></i> Add
                        </button>
                    </div>
                </div>
                
                <div class="row mt-4">
                    <div class="col-12">
                        <h5 class="mb-3">Assigned Operations & Resources</h5>
                        <div class="table-responsive">
                            <table class="table table-bordered factory-table" id="resource_table">
                                <thead>
                                    <tr>
                                        <th>Operation</th>
                                        <th>Employee ID</th>
                                        <th>Employee Name</th>
                                        <th>Date & Time</th>
                                        <th>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <!-- Will be populated dynamically -->
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
                
                <div class="row mt-4">
                    <div class="col-12 text-center">
                        <button class="btn btn-secondary factory-btn back-to-sublot">
                            <i class="fa fa-arrow-left mr-2"></i> Back
                        </button>
                        <button class="btn btn-success factory-btn proceed-to-inspection">
                            <i class="fa fa-arrow-right mr-2"></i> Next: Quality Inspection
                        </button>
                    </div>
                </div>
            </div>
        </div>`).appendTo(this.wrapper);
        
        // Add event handlers for the resource tagging section
        this.resource_section.find('#scan_employee').on('keypress', (e) => {
            if (e.which === 13) {
                this.validate_employee();
            }
        });
        
        this.resource_section.find('.validate-employee').on('click', () => {
            this.validate_employee();
        });
        
        this.resource_section.find('.add-tagging').on('click', () => {
            this.add_resource_tag();
        });
        
        this.resource_section.find('.back-to-sublot').on('click', () => {
            this.show_workflow_step('sublot-entry');
        });
        
        this.resource_section.find('.proceed-to-inspection').on('click', () => {
            this.show_workflow_step('inspection');
        });
    }
    
    add_inspection_section() {
        // Create the inspection section with factory-friendly UI
        this.inspection_section = $(`<div id="inspection" class="workflow-step factory-section d-none">
            <div class="factory-section-head">Step 3: Quality Inspection</div>
            <div class="section-body">
                <div class="row">
                    <div class="col-md-12">
                        <div class="sublot-info alert alert-info p-3">
                            <h5 class="mb-3">Selected Sub-Lot Details</h5>
                            <div class="row">
                                <div class="col-md-3">
                                    <strong>Sub-Lot No:</strong> <span id="insp_sublot_no_display" class="ml-2" style="font-size: 18px;"></span>
                                </div>
                                <div class="col-md-3">
                                    <strong>Item Code:</strong> <span id="insp_item_code_display" class="ml-2" style="font-size: 18px;"></span>
                                </div>
                                <div class="col-md-3">
                                    <strong>Quantity:</strong> <span id="insp_sublot_qty_display" class="ml-2" style="font-size: 18px;"></span>
                                </div>
                                <div class="col-md-3">
                                    <strong>UOM:</strong> <span id="insp_sublot_uom_display" class="ml-2" style="font-size: 18px;"></span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                
                <div class="row mt-4">
                    <div class="col-md-6">
                        <div class="factory-form-group">
                            <label for="insp_scan_employee" class="factory-label">
                                <i class="fa fa-user-check mr-2"></i>Scan Inspector ID
                            </label>
                            <div class="input-group">
                                <input type="text" class="form-control factory-input" id="insp_scan_employee" placeholder="Scan or enter inspector ID">
                                <div class="input-group-append">
                                    <button class="btn btn-primary factory-btn-validate validate-inspector">
                                        <i class="fa fa-check mr-2"></i>Validate
                                    </button>
                                </div>
                            </div>
                            <small class="form-text text-muted mt-2">Scan or enter the inspector ID for quality inspection</small>
                            <div id="inspector_validation_result" class="factory-validation-result"></div>
                        </div>
                    </div>
                    
                    <div class="col-md-6">
                        <div class="factory-form-group">
                            <label for="inspection_type" class="factory-label">
                                <i class="fa fa-clipboard-check mr-2"></i>Inspection Type
                            </label>
                            <select class="form-control factory-input" id="inspection_type">
                                <option value="Final Visual Inspection">Final Visual Inspection</option>
                            </select>
                            <small class="form-text text-muted mt-2">Select the type of inspection to perform</small>
                        </div>
                    </div>
                </div>
                
                <div class="row mt-4">
                    <div class="col-12 text-center">
                        <button class="btn btn-secondary factory-btn back-to-tagging">
                            <i class="fa fa-arrow-left mr-2"></i> Back
                        </button>
                        <button class="btn btn-success factory-btn create-inspection-entry">
                            <i class="fa fa-clipboard-check mr-2"></i> Create Inspection
                        </button>
                    </div>
                </div>
            </div>
        </div>`).appendTo(this.wrapper);
        
        // Add event handlers for the inspection section
        this.inspection_section.find('#insp_scan_employee').on('keypress', (e) => {
            if (e.which === 13) {
                this.validate_inspector();
            }
        });
        
        this.inspection_section.find('.validate-inspector').on('click', () => {
            this.validate_inspector();
        });
        
        this.inspection_section.find('.back-to-tagging').on('click', () => {
            this.show_workflow_step('resource-tagging');
        });
        
        this.inspection_section.find('.create-inspection-entry').on('click', () => {
            this.create_inspection_entry();
        });
    }

    add_information_section() {
        // Get the location data from the user settings
        const locationData = this.user_settings || {};
        
        // Create the information section at the bottom of the page
        let infoSection = $(`
            <div class="location-info-card card mt-4">
                <div class="card-header bg-light">
                    <h5 class="mb-0">
                        <i class="fa fa-info-circle mr-2"></i>Process Information
                    </h5>
                </div>
                <div class="card-body p-3">
                    <div class="factory-info-row">
                        <!-- Location Info Section -->
                        <div class="factory-info-section">
                            <div class="factory-info-title">
                                <i class="fa fa-map-marker-alt mr-1"></i> Location Details
                            </div>
                            <div class="factory-info-content">
                                <div class="factory-info-item">
                                    <span class="factory-info-label">Location:</span>
                                    <span class="factory-info-value">${locationData.location || 'Not specified'}</span>
                                </div>
                                <div class="factory-info-item">
                                    <span class="factory-info-label">Role:</span>
                                    <span class="factory-info-value">${locationData.role || 'Not specified'}</span>
                                </div>
                                <div class="factory-info-item">
                                    <span class="factory-info-label">Stage:</span>
                                    <span class="factory-info-value">${locationData.stage || 'Not specified'}</span>
                                </div>
                                <div class="factory-info-item">
                                    <span class="factory-info-label">Source Warehouse:</span>
                                    <span class="factory-info-value">${locationData.source_warehouse || 'Not specified'}</span>
                                </div>
                                <div class="factory-info-item">
                                    <span class="factory-info-label">Target Warehouse:</span>
                                    <span class="factory-info-value">${locationData.target_warehouse || 'Not specified'}</span>
                                </div>
                                <div class="factory-info-item">
                                    <span class="factory-info-label">Transaction Type:</span>
                                    <span class="factory-info-value">${locationData.transaction_type || 'Not specified'}</span>
                                </div>
                            </div>
                        </div>
                        
                        <!-- Lot Info Section -->
                        <div class="factory-info-section">
                            <div class="factory-info-title">
                                <i class="fa fa-barcode mr-1"></i> Lot Information
                            </div>
                            <div class="factory-info-content">
                                <div id="top_lot_placeholder" class="text-muted">
                                    Lot information will be displayed here when a lot is validated.
                                </div>
                            </div>
                        </div>
                        
                        <!-- BOM Info Section -->
                        <div class="factory-info-section">
                            <div class="factory-info-title">
                                <i class="fa fa-sitemap mr-1"></i> BOM Information
                            </div>
                            <div class="factory-info-content">
                                <div id="top_bom_placeholder" class="text-muted">
                                    BOM information will be displayed here when a lot is validated.
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `);
        
        // Add custom styles for the info section if not already added
        if (!$('style.factory-info-styles').length) {
            $(`<style class="factory-info-styles">
                .factory-info-row {
                    display: flex;
                    flex-direction: row;
                    flex-wrap: nowrap;
                    width: 100%;
                    overflow-x: auto;
                }
                
                .factory-info-section {
                    flex: 1;
                    min-width: 320px;
                    padding: 0 15px;
                    border-right: 1px solid #e1e1e1;
                }
                
                .factory-info-section:last-child {
                    border-right: none;
                }
                
                .factory-info-title {
                    font-size: 18px;
                    font-weight: bold;
                    margin-bottom: 10px;
                    color: #4a90e2;
                    padding-bottom: 5px;
                    border-bottom: 1px solid #e1e1e1;
                }
                
                .factory-info-content {
                    margin-bottom: 10px;
                }
                
                .factory-info-item {
                    margin-bottom: 5px;
                    display: flex;
                    flex-direction: row;
                    align-items: center;
                }
                
                .factory-info-label {
                    font-weight: bold;
                    margin-right: 5px;
                    color: #555;
                    white-space: nowrap;
                }
                
                .factory-info-value {
                    color: #000;
                }
                
                /* Make sure the table fits in the section */
                .factory-info-section table {
                    width: 100%;
                    font-size: 14px;
                }
                
                .factory-info-section th, 
                .factory-info-section td {
                    padding: 5px;
                }
            </style>`).appendTo(document.head);
        }
        
        // Append the info section to the wrapper (at the bottom of the page)
        this.wrapper.append(infoSection);
    }

    load_data() {
        // Initialize the resource tags array
        this.resource_tags = [];
        
        // Set default operations
        this.allowed_operations = ['Post Curing', 'OD Trimming', 'ID Trimming'];
        this.allowed_inspection_types = [
            "Line Inspection", 
            "Lot Inspection", 
            "Incoming Inspection", 
            "Final Visual Inspection", 
            "Patrol Inspection"
        ];
        
        // Update operation select dropdown options
        this.update_operation_options();
    }
    
    update_operation_options() {
        // Clear existing options
        const operation_select = this.resource_section.find('#operation_select');
        operation_select.empty();
        
        // Add default empty option
        operation_select.append(`<option value="">Select an operation...</option>`);
        
        // Add allowed operations
        this.allowed_operations.forEach(operation => {
            operation_select.append(`<option value="${operation}">${operation}</option>`);
        });
    }
    
    show_workflow_step(step) {
        // Hide all workflow steps
        this.wrapper.find('.workflow-step').addClass('d-none');
        
        // Show the requested step
        this.wrapper.find(`#${step}`).removeClass('d-none');
        
        // Update the active tab
        this.workflow_tabs.find('.nav-link').removeClass('active');
        this.workflow_tabs.find(`#${step}-tab`).addClass('active');
    }
    
    validate_lot() {
        const lot_number = this.sublot_section.find('#scan_lot').val();
        
        if (!lot_number) {
            frappe.msgprint(__("Please scan or enter a lot number"));
            return;
        }
        
        this.sublot_section.find('#lot_validation_result').html('<div class="alert alert-info">Validating lot number...</div>');
        
        frappe.call({
            method: "smart_screens.smart_screens.utils.lot_validation.lot_validation",
            args: {
                mixed_barcode: lot_number,
                stage: this.user_settings.stage || "",
                warehouse: this.user_settings.default_warehouse || ""
            },
            callback: (r) => {
                if (r.message && !r.message.error) {
                    // Lot validation successful
                    this.lot_details = r.message;
                    
                    // Update the top location card with lot information in a compact format
                    const topLotPlaceholder = this.wrapper.find('#top_lot_placeholder');
                    if (topLotPlaceholder.length > 0) {
                        topLotPlaceholder.html(`
                            <div class="factory-compact-info">
                                <div class="factory-compact-row">
                                    <span class="factory-compact-label">Item Code:</span>
                                    <span class="factory-compact-value">${r.message.item_code || 'N/A'}</span>
                                </div>
                                <div class="factory-compact-row">
                                    <span class="factory-compact-label">Batch No:</span>
                                    <span class="factory-compact-value">${r.message.batch_no || 'N/A'}</span>
                                </div>
                                <div class="factory-compact-row">
                                    <span class="factory-compact-label">Available Qty:</span>
                                    <span class="factory-compact-value">${r.message.batch_quantity || 0} ${r.message.uom || 'N/A'}</span>
                                </div>
                                <div class="factory-compact-row">
                                    <span class="factory-compact-label">Warehouse:</span>
                                    <span class="factory-compact-value">${r.message.warehouse || 'N/A'}</span>
                                </div>
                            </div>
                        `);
                        
                        // Add styles for compact display if not already added
                        if (!$('style.factory-compact-styles').length) {
                            $(`<style class="factory-compact-styles">
                                .factory-compact-info {
                                    display: flex;
                                    flex-direction: column;
                                    gap: 4px;
                                }
                                .factory-compact-row {
                                    display: flex;
                                    align-items: center;
                                    white-space: nowrap;
                                }
                                .factory-compact-label {
                                    font-weight: bold;
                                    min-width: 110px;
                                    color: #555;
                                }
                                .factory-compact-value {
                                    font-size: 16px;
                                }
                            </style>`).appendTo(document.head);
                        }
                    }
                    
                    // Show success message
                    const successHtml = `
                        <div class="alert alert-success">
                            <strong>Lot Validated!</strong> Ready to create a sub-lot.
                        </div>
                    `;
                    
                    this.sublot_section.find('#lot_validation_result').html(successHtml);
                    
                    // Fetch BOM details for the item
                    this.fetch_bom_details(r.message.item_code);
                    
                    // Show the create sublot options
                    this.sublot_section.find('#sublot_qty').prop('disabled', false);
                    this.sublot_section.find('.create-sublot').prop('disabled', false);
                    
                } else {
                    // Lot validation failed
                    const errorMsg = r.message && r.message.error 
                        ? r.message.error 
                        : "Invalid lot number or lot not found";
                    
                    this.sublot_section.find('#lot_validation_result').html(`
                        <div class="alert alert-danger">
                            <strong>Validation Failed!</strong> ${errorMsg}
                        </div>
                    `);
                    
                    // Reset the top location card
                    const topLotPlaceholder = this.wrapper.find('#top_lot_placeholder');
                    if (topLotPlaceholder.length > 0) {
                        topLotPlaceholder.html(`<div class="text-muted">Lot information will be displayed here when a lot is validated.</div>`);
                    }
                    
                    const topBomPlaceholder = this.wrapper.find('#top_bom_placeholder');
                    if (topBomPlaceholder.length > 0) {
                        topBomPlaceholder.html(`<div class="text-muted">BOM information will be displayed here when a lot is validated.</div>`);
                    }
                }
            }
        });
    }
    
    validate_employee() {
        const employee_id = this.resource_section.find('#scan_employee').val();
        
        if (!employee_id) {
            frappe.msgprint(__("Please scan or enter an employee ID"));
            return;
        }
        
        this.resource_section.find('#employee_validation_result').html('<div class="alert alert-info">Validating employee ID...</div>');
        
        frappe.call({
            method: "smart_screens.smart_screens.utils.emp_validation.validate_employee_designation",
            args: {
                employee_code: employee_id
            },
            callback: (r) => {
                if (r.message && r.message.success) {
                    // Employee validation successful
                    this.employee_details = r.message;
                    
                    const successHtml = `
                        <div class="alert alert-success">
                            <strong>Employee Validated!</strong>
                            <div>Name: ${r.message.employee.employee_name || 'N/A'}</div>
                            <div>Designation: ${r.message.designation || 'N/A'}</div>
                        </div>
                    `;
                    
                    this.resource_section.find('#employee_validation_result').html(successHtml);
                } else {
                    // Employee validation failed
                    const errorMsg = r.message && r.message.message 
                        ? r.message.message 
                        : "Invalid employee ID or insufficient permissions";
                    
                    this.resource_section.find('#employee_validation_result').html(`
                        <div class="alert alert-danger">
                            <strong>Validation Failed!</strong> ${errorMsg}
                        </div>
                    `);
                    
                    this.employee_details = null;
                }
            }
        });
    }
    
    validate_inspector() {
        const inspector_id = this.inspection_section.find('#insp_scan_employee').val();
        
        if (!inspector_id) {
            frappe.msgprint(__("Please scan or enter an inspector ID"));
            return;
        }
        
        this.inspection_section.find('#inspector_validation_result').html('<div class="alert alert-info">Validating inspector ID...</div>');
        
        frappe.call({
            method: "smart_screens.smart_screens.utils.emp_validation.validate_employee_designation",
            args: {
                employee_code: inspector_id
            },
            callback: (r) => {
                if (r.message && r.message.success) {
                    // Inspector validation successful
                    this.inspector_details = r.message;
                    
                    const successHtml = `
                        <div class="alert alert-success">
                            <strong>Inspector Validated!</strong>
                            <div>Name: ${r.message.employee.employee_name || 'N/A'}</div>
                            <div>Designation: ${r.message.designation || 'N/A'}</div>
                        </div>
                    `;
                    
                    this.inspection_section.find('#inspector_validation_result').html(successHtml);
                } else {
                    // Inspector validation failed
                    const errorMsg = r.message && r.message.message 
                        ? r.message.message 
                        : "Invalid inspector ID or insufficient permissions";
                    
                    this.inspection_section.find('#inspector_validation_result').html(`
                        <div class="alert alert-danger">
                            <strong>Validation Failed!</strong> ${errorMsg}
                        </div>
                    `);
                    
                    this.inspector_details = null;
                }
            }
        });
    }
    
    add_resource_tag() {
        if (!this.sublot_details) {
            frappe.msgprint(__("Sub-lot details are missing. Please create a sub-lot first."));
            return;
        }
        
        if (!this.employee_details) {
            frappe.msgprint(__("Please validate an employee ID first."));
            return;
        }
        
        const operation = this.resource_section.find('#operation_select').val();
        
        if (!operation) {
            frappe.msgprint(__("Please select an operation."));
            return;
        }
        
        // Add the resource tag to the list
        const tag = {
            operation: operation,
            employee_id: this.employee_details.employee.name,
            employee_name: this.employee_details.employee.employee_name,
            timestamp: frappe.datetime.now_datetime()
        };
        
        this.resource_tags.push(tag);
        
        // Update the table
        this.update_resource_table();
        
        // Clear the inputs
        this.resource_section.find('#operation_select').val('');
        this.resource_section.find('#scan_employee').val('');
        this.resource_section.find('#employee_validation_result').html('');
        
        // Enable the proceed button if at least one tag is added
        if (this.resource_tags.length > 0) {
            this.workflow_tabs.find('#inspection-tab').removeClass('disabled');
        }
        
        // Create the resource tag in the database
        frappe.call({
            method: "frappe.client.insert",
            args: {
                doc: {
                    doctype: "Lot Resource Tagging",
                    sublot: this.sublot_details.name,
                    item_code: this.sublot_details.item_code,
                    operation: operation,
                    employee: this.employee_details.employee.name,
                    employee_name: this.employee_details.employee.employee_name
                }
            },
            callback: (r) => {
                if (r.message) {
                    tag.docname = r.message.name;
                    this.update_resource_table();
                    
                    frappe.show_alert({
                        message: __("Resource tag added successfully"),
                        indicator: 'green'
                    }, 3);
                }
            }
        });
    }
    
    update_resource_table() {
        const tbody = this.resource_section.find('#resource_table tbody');
        tbody.empty();
        
        if (this.resource_tags.length === 0) {
            tbody.html('<tr><td colspan="5" class="text-center">No resources assigned yet</td></tr>');
            return;
        }
        
        this.resource_tags.forEach((tag, index) => {
            const row = $(`<tr>
                <td>${tag.operation}</td>
                <td>${tag.employee_id}</td>
                <td>${tag.employee_name}</td>
                <td>${frappe.datetime.str_to_user(tag.timestamp)}</td>
                <td>
                    <button class="btn btn-sm btn-danger remove-tag" data-index="${index}">
                        <i class="fa fa-trash"></i>
                    </button>
                </td>
            </tr>`);
            
            row.find('.remove-tag').on('click', () => {
                this.remove_resource_tag(index);
            });
            
            tbody.append(row);
        });
    }
    
    remove_resource_tag(index) {
        const tag = this.resource_tags[index];
        
        // Remove from the database if it exists
        if (tag.docname) {
            frappe.call({
                method: "frappe.client.delete",
                args: {
                    doctype: "Lot Resource Tagging",
                    name: tag.docname
                },
                callback: () => {
                    frappe.show_alert({
                        message: __("Resource tag removed"),
                        indicator: 'red'
                    }, 3);
                }
            });
        }
        
        // Remove from the array
        this.resource_tags.splice(index, 1);
        
        // Update the table
        this.update_resource_table();
        
        // Disable the proceed button if no tags are left
        if (this.resource_tags.length === 0) {
            this.workflow_tabs.find('#inspection-tab').addClass('disabled');
        }
    }
    
    create_inspection_entry() {
        if (!this.sublot_details) {
            frappe.msgprint(__("Sub-lot details are missing. Please create a sub-lot first."));
            return;
        }
        
        if (!this.inspector_details) {
            frappe.msgprint(__("Please validate an inspector ID first."));
            return;
        }
        
        // Check if user is allowed to create final visual inspection
        if (!this.allowed_inspection_types.includes("Final Visual Inspection")) {
            frappe.msgprint(__("You don't have permission to create final visual inspection entries. Contact your system administrator."));
            return;
        }
        
        // Navigate to the Inspection Entry form with pre-filled values
        frappe.route_options = {
            inspection_type: "Final Visual Inspection",
            scan_inspector: this.inspector_details.employee.name,
            scan_production_lot: this.sublot_details.name,
            product_ref_no: this.sublot_details.item_code,
            batch_no: this.sublot_details.batch_no,
            total_inspected_qty_nos: this.sublot_details.qty,
            uom: this.sublot_details.uom,
            warehouse: this.user_settings.default_warehouse || "",
            source_warehouse: this.user_settings.default_warehouse || "",
            target_warehouse: this.user_settings.target_warehouse || ""
        };
        
        frappe.set_route("Form", "Inspection Entry", "new-inspection-entry");
    }

    create_sublot() {
        if (!this.lot_details) {
            frappe.msgprint(__("Please validate a lot number first"));
            return;
        }
        
        const sublot_qty = this.sublot_section.find('#sublot_qty').val();
        
        if (!sublot_qty || sublot_qty <= 0) {
            frappe.msgprint(__("Please enter a valid quantity for the sub-lot"));
            return;
        }
        
        if (parseFloat(sublot_qty) > parseFloat(this.lot_details.batch_quantity)) {
            frappe.msgprint(__("Sub-lot quantity cannot exceed available quantity"));
            return;
        }
        
        // Show progress indicator
        frappe.show_progress(__("Generating Sub-Lot"), 0, 100);
        
        // First call generate_sublot to create the batch, barcode, and stock entry
        frappe.call({
            method: "smart_screens.smart_screens.utils.generate_sublot.generate_sublot",
            args: {
                batch_number: this.lot_details.batch_no,
                qty: sublot_qty,
                source_warehouse: this.user_settings.default_warehouse || this.lot_details.warehouse,
                target_warehouse: this.user_settings.target_warehouse || this.lot_details.warehouse,
                uom: this.lot_details.uom
            },
            freeze: true,
            freeze_message: __("Generating sub-lot, please wait..."),
            callback: (response) => {
                if (response.message && response.message.status === "success") {
                    const sublotData = response.message;
                    
                    // Now create the Sub Lot Entry document with data from generate_sublot
                    // Using the actual field names from the Sub Lot Entry doctype
                    frappe.call({
                        method: "frappe.client.insert",
                        args: {
                            doc: {
                                doctype: "Sub Lot Entry",
                                sslnscaned_sub_lot_number: sublotData.parent_batch || this.lot_details.batch_no,
                                sublot_qty: sublotData.processed_qty,
                                final_sublot_qty: sublotData.processed_qty,
                                uom: this.lot_details.uom,
                                item_code: this.lot_details.item_code,
                                item_group: this.lot_details.item_group || "Products",
                                batch: this.lot_details.batch_no,
                                batch_qty: this.lot_details.batch_quantity,
                                stage: this.user_settings.stage || "Products",
                                source_warehouse: this.user_settings.default_warehouse || this.lot_details.warehouse,
                                target_warehouse: this.user_settings.target_warehouse || this.lot_details.warehouse,
                                sublot_number: sublotData.sub_lot_number,
                                sublot_batch: sublotData.new_batch_number,
                                stockentry_ref: sublotData.stock_entry_name,
                                barcode: sublotData.barcode_image
                            }
                        },
                        callback: (r) => {
                            frappe.hide_progress();
                            
                            if (r.message) {
                                // Sub-lot created successfully
                                this.sublot_details = r.message;
                                
                                frappe.show_alert({
                                    message: __("Sub-Lot created successfully"),
                                    indicator: 'green'
                                }, 5);
                                
                                // Enable the proceed button
                                this.sublot_section.find('.proceed-to-tagging').removeClass('d-none');
                                
                                // Update the resource tagging section with the sublot details
                                this.resource_section.find('#sublot_no_display').text(r.message.name);
                                this.resource_section.find('#resource_item_code_display').text(r.message.item_code);
                                this.resource_section.find('#sublot_qty_display').text(r.message.sublot_qty);
                                this.resource_section.find('#sublot_uom_display').text(r.message.uom);
                                
                                // Also update the inspection section
                                this.inspection_section.find('#insp_sublot_no_display').text(r.message.name);
                                this.inspection_section.find('#insp_item_code_display').text(r.message.item_code);
                                this.inspection_section.find('#insp_sublot_qty_display').text(r.message.sublot_qty);
                                this.inspection_section.find('#insp_sublot_uom_display').text(r.message.uom);
                                
                                // Enable the resource tagging tab
                                this.workflow_tabs.find('#resource-tagging-tab').removeClass('disabled');
                                
                                // Removed: No longer adding BOM information to resource tagging section
                                
                                // Display sublot generation information
                                this.show_sublot_generation_info(sublotData, r.message);
                            }
                        },
                        error: (err) => {
                            frappe.hide_progress();
                            frappe.msgprint(__("Error creating Sub-Lot Entry: ") + (err.message || "Unknown error"));
                        }
                    });
                } else {
                    frappe.hide_progress();
                    frappe.msgprint(__("Failed to generate sub-lot. Please try again."));
                }
            },
            error: (err) => {
                frappe.hide_progress();
                frappe.msgprint(__("Error generating sub-lot: ") + (err.message || "Unknown error"));
            }
        });
    }

    fetch_bom_details(item_code) {
        if (!item_code) return;
        
        const topBomPlaceholder = this.wrapper.find('#top_bom_placeholder');
        
        frappe.call({
            method: "smart_screens.smart_screens.utils.bom_validation.get_boms_by_component_item",
            args: {
                item_code: item_code
            },
            callback: (response) => {
                if (response.message && response.message.success) {
                    const bomData = response.message.data;
                    
                    if (bomData.boms && bomData.boms.length > 0) {
                        // Get the first BOM for display
                        const firstBom = bomData.boms[0];
                        
                        // Store BOM details for later use
                        this.bom_details = firstBom;
                        
                        // Update operations in the dropdown
                        if (firstBom.operations && firstBom.operations.length > 0) {
                            this.allowed_operations = firstBom.operations.map(op => op.operation);
                            this.update_operation_options();
                        }
                        
                        // Create a compact single-row format for BOM display
                        const bomContentHtml = `
                            <div class="factory-compact-info">
                                <div class="factory-compact-row">
                                    <span class="factory-compact-label">BOM No:</span>
                                    <span class="factory-compact-value">${firstBom.bom_no || 'N/A'}</span>
                                </div>
                                <div class="factory-compact-row">
                                    <span class="factory-compact-label">Parent Item:</span>
                                    <span class="factory-compact-value">${firstBom.parent_item_code} - ${firstBom.parent_item_name}</span>
                                </div>
                                <div class="factory-compact-row">
                                    <span class="factory-compact-label">Component Qty:</span>
                                    <span class="factory-compact-value">${firstBom.component_qty} ${firstBom.component_uom}</span>
                                </div>
                                <div class="factory-compact-row">
                                    <span class="factory-compact-label">Status:</span>
                                    <span class="factory-compact-value">
                                        ${firstBom.is_default ? '<span class="badge badge-success">Default</span> ' : ''}
                                        ${firstBom.is_active ? '<span class="badge badge-primary">Active</span>' : '<span class="badge badge-secondary">Inactive</span>'}
                                    </span>
                                </div>
                            </div>
                            
                            ${firstBom.operations && firstBom.operations.length > 0 ? `
                                <div class="mt-3">
                                    <strong>Operations:</strong>
                                    <div class="table-responsive mt-1">
                                        <table class="table table-sm table-bordered operation-compact-table">
                                            <tr>
                                                <th>Operation</th>
                                                <th>Workstation</th>
                                                <th>Time (mins)</th>
                                            </tr>
                                            ${firstBom.operations.map(op => `
                                                <tr>
                                                    <td>${op.operation || 'N/A'}</td>
                                                    <td>${op.workstation || 'N/A'}</td>
                                                    <td>${op.time_in_mins || 'N/A'}</td>
                                                </tr>
                                            `).join('')}
                                        </table>
                                    </div>
                                </div>
                            ` : ''}
                        `;
                        
                        // Add styles for compact operation table if not already added
                        if (!$('style.factory-operation-styles').length) {
                            $(`<style class="factory-operation-styles">
                                .operation-compact-table {
                                    font-size: 13px;
                                    margin-bottom: 0;
                                }
                                .operation-compact-table th,
                                .operation-compact-table td {
                                    padding: 4px 8px;
                                }
                            </style>`).appendTo(document.head);
                        }
                        
                        // Update the BOM section in the top location card
                        if (topBomPlaceholder.length > 0) {
                            topBomPlaceholder.html(bomContentHtml);
                        }
                        
                    } else {
                        // No BOMs found - message to display
                        const noBomHtml = `
                            <div class="alert alert-warning mb-0 py-2">
                                <i class="fa fa-exclamation-triangle mr-2"></i>No BOMs found for item ${bomData.item_code}
                            </div>
                        `;
                        
                        if (topBomPlaceholder.length > 0) {
                            topBomPlaceholder.html(noBomHtml);
                        }
                    }
                } else {
                    // Error in BOM response
                    const errorHtml = `
                        <div class="alert alert-danger mb-0 py-2">
                            <i class="fa fa-exclamation-circle mr-2"></i>Failed to retrieve BOM details
                        </div>
                    `;
                    
                    if (topBomPlaceholder.length > 0) {
                        topBomPlaceholder.html(errorHtml);
                    }
                }
            },
            error: (err) => {
                console.error("Error fetching BOM details:", err);
                
                const errorHtml = `
                    <div class="alert alert-danger mb-0 py-2">
                        <i class="fa fa-exclamation-circle mr-2"></i>Error retrieving BOM details: ${err.message || "Unknown error"}
                    </div>
                `;
                
                if (topBomPlaceholder.length > 0) {
                    topBomPlaceholder.html(errorHtml);
                }
            }
        });
    }

    fetch_bom_for_resource_tagging(item_code) {
        if (!item_code) return;
        
        // Create BOM info section if it doesn't exist
        if (this.resource_section.find('#bom_info_section').length === 0) {
            this.resource_section.find('.sublot-info').after(`
                <div class="row mt-3" id="bom_info_section">
                    <div class="col-md-12">
                        <div class="card">
                            <div class="card-header bg-light">
                                <h6 class="mb-0"><i class="fa fa-sitemap mr-2"></i>BOM Information</h6>
                            </div>
                            <div class="card-body p-3">
                                <div id="rt_bom_loading" class="text-center">
                                    <i class="fa fa-spinner fa-spin"></i> Loading BOM details...
                                </div>
                                <div id="rt_bom_content" class="d-none"></div>
                            </div>
                        </div>
                    </div>
                </div>
            `);
        }
        
        const bomLoading = this.resource_section.find('#rt_bom_loading');
        const bomContent = this.resource_section.find('#rt_bom_content');
        
        frappe.call({
            method: "smart_screens.smart_screens.utils.bom_validation.get_boms_by_component_item",
            args: {
                item_code: item_code
            },
            callback: (response) => {
                if (response.message && response.message.success) {
                    const bomData = response.message.data;
                    
                    bomLoading.addClass('d-none');
                    bomContent.removeClass('d-none');
                    
                    if (bomData.boms && bomData.boms.length > 0) {
                        // Get the first BOM for display
                        const firstBom = bomData.boms[0];
                        
                        // Store BOM details for later use
                        this.bom_details = firstBom;
                        
                        // Format operations for display if they exist
                        let operationsHtml = '';
                        if (firstBom.operations && firstBom.operations.length > 0) {
                            operationsHtml = `
                                <div class="mt-3">
                                    <strong>Operations:</strong>
                                    <div class="table-responsive mt-2">
                                        <table class="table table-sm table-bordered">
                                            <thead>
                                                <tr>
                                                    <th>Operation</th>
                                                    <th>Workstation</th>
                                                    <th>Time (mins)</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                ${firstBom.operations.map(op => `
                                                    <tr>
                                                        <td>${op.operation || 'N/A'}</td>
                                                        <td>${op.workstation || 'N/A'}</td>
                                                        <td>${op.time_in_mins || 'N/A'}</td>
                                                    </tr>
                                                `).join('')}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            `;
                            
                            // Update operations in the dropdown
                            this.allowed_operations = firstBom.operations.map(op => op.operation);
                            this.update_operation_options();
                        }
                        
                        // Display BOM info
                        bomContent.html(`
                            <div class="mb-2">
                                <strong>BOM No:</strong> ${firstBom.bom_no || 'N/A'}
                            </div>
                            <div class="mb-2">
                                <strong>Parent Item:</strong> ${firstBom.parent_item_code} - ${firstBom.parent_item_name}
                            </div>
                            <div class="mb-2">
                                <strong>Component Qty:</strong> ${firstBom.component_qty} ${firstBom.component_uom}
                            </div>
                            <div class="mb-2">
                                <strong>Status:</strong> 
                                ${firstBom.is_default ? '<span class="badge badge-success">Default</span> ' : ''}
                                ${firstBom.is_active ? '<span class="badge badge-primary">Active</span>' : '<span class="badge badge-secondary">Inactive</span>'}
                            </div>
                            ${operationsHtml}
                        `);
                    } else {
                        // No BOMs found
                        bomContent.html(`
                            <div class="alert alert-warning mb-0">
                                <i class="fa fa-exclamation-triangle mr-2"></i>No BOMs found for item ${bomData.item_code}
                            </div>
                        `);
                    }
                } else {
                    // Error in BOM response
                    bomLoading.addClass('d-none');
                    bomContent.removeClass('d-none').html(`
                        <div class="alert alert-danger mb-0">
                            <i class="fa fa-exclamation-circle mr-2"></i>Failed to retrieve BOM details
                        </div>
                    `);
                }
            },
            error: (err) => {
                console.error("Error fetching BOM details:", err);
                bomLoading.addClass('d-none');
                bomContent.removeClass('d-none').html(`
                    <div class="alert alert-danger mb-0">
                        <i class="fa fa-exclamation-circle mr-2"></i>Error retrieving BOM details: ${err.message || "Unknown error"}
                    </div>
                `);
            }
        });
    }
}

// Add CSS for the page
frappe.pages['finishing-process-center'].on_page_show = function() {
    // Add custom CSS
    frappe.require([
        'finishing_process_center.bundle.css'
    ]);
};