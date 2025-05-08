frappe.pages['sublot-import-tool'].on_page_load = function(wrapper) {
    const page = frappe.ui.make_app_page({
        parent: wrapper,
        title: 'SubLot Bulk Import Tool',
        single_column: true
    });
    
    // Initialize the sublot import tool
    new SubLotBulkImportTool(page);
};

class SubLotBulkImportTool {
    constructor(page) {
        this.page = page;
        this.wrapper = $(page.wrapper);
        
        // Initialize variables to store data
        this.parsed_data = null;
        
        // Add actions in the page header
        this.page.set_primary_action('Reset Form', () => this.reset_form(), 'fa fa-refresh');
        
        // Make the layout and bind events
        this.make();
        this.bind_events();
        
        // Load warehouse and stage (item group) data
        this.load_warehouses();
        this.load_item_groups();
    }
    
    // Load warehouses from ERPNext with specific filter for U1-Store and U2-Store
    load_warehouses() {
        const warehouseSelect = this.wrapper.find('#warehouse_select');
        
        // Show loading placeholder
        warehouseSelect.html('<option value="">Loading warehouses...</option>');
        
        frappe.call({
            method: "frappe.client.get_list",
            args: {
                doctype: "Warehouse",
                fields: ["name", "warehouse_name"],
                filters: {
                    "is_group": 0,  // Only include non-group warehouses
                    "disabled": 0,   // Only include enabled warehouses
                    "name": ["in", ["U1-Store - SPP INDIA", "U2-Store - SPP INDIA"]]  // Only include U1-Store and U2-Store
                },
                order_by: "warehouse_name asc"
            },
            callback: (response) => {
                if (response.message) {
                    // Clear the loading placeholder
                    warehouseSelect.empty();
                    
                    // Add a default empty option
                    warehouseSelect.append('<option value="">Select Warehouse</option>');
                    
                    // Add the warehouse options
                    response.message.forEach(warehouse => {
                        warehouseSelect.append(`<option value="${warehouse.name}">${warehouse.warehouse_name || warehouse.name}</option>`);
                    });
                    
                    // Set default value if available from user preferences
                    const defaultWarehouse = frappe.defaults.get_user_default("warehouse");
                    if (defaultWarehouse) {
                        warehouseSelect.val(defaultWarehouse);
                    } else if (warehouseSelect.find('option[value="U2-Store - SPP INDIA"]').length > 0) {
                        // Set "U2-Store - SPP INDIA" as default if available
                        warehouseSelect.val("U2-Store - SPP INDIA");
                    }
                } else {
                    warehouseSelect.html('<option value="">No warehouses found</option>');
                }
            },
            error: (err) => {
                console.error("Error loading warehouses:", err);
                warehouseSelect.html('<option value="">Error loading warehouses</option>');
            }
        });
    }
    
    // Load item groups from ERPNext, filtered for finished products
    load_item_groups() {
        const stageSelect = this.wrapper.find('#stage_select');
        
        // Show loading placeholder
        stageSelect.html('<option value="">Loading stages...</option>');
        
        frappe.call({
            method: "frappe.client.get_list",
            args: {
                doctype: "Item Group",
                fields: ["name"],
                filters: {
                    "is_group": 0,  // Only include non-group item groups
                    "parent_item_group": "Products"  // Only include groups under Products (finished products)
                },
                order_by: "name asc"
            },
            callback: (response) => {
                // If no results with parent filter, try without the filter
                if (!response.message || response.message.length === 0) {
                    frappe.call({
                        method: "frappe.client.get_list",
                        args: {
                            doctype: "Item Group",
                            fields: ["name"],
                            filters: {
                                "is_group": 0,  // Only include non-group item groups
                                "name": ["like", "%Product%"]  // Look for groups that might be finished products
                            },
                            order_by: "name asc"
                        },
                        callback: (secondResponse) => {
                            this.processItemGroupResponse(secondResponse, stageSelect);
                        }
                    });
                } else {
                    this.processItemGroupResponse(response, stageSelect);
                }
            },
            error: (err) => {
                console.error("Error loading item groups:", err);
                stageSelect.html('<option value="">Error loading stages</option>');
            }
        });
    }
    
    // Helper function to process item group response
    processItemGroupResponse(response, stageSelect) {
        if (response.message) {
            // Clear the loading placeholder
            stageSelect.empty();
            
            // Add a default empty option
            stageSelect.append('<option value="">Select Stage</option>');
            
            // Always add "Products" as an option
            if (response.message.findIndex(item => item.name === "Products") === -1) {
                stageSelect.append('<option value="Products">Products</option>');
            }
            
            // Add the item group options
            response.message.forEach(itemGroup => {
                stageSelect.append(`<option value="${itemGroup.name}">${itemGroup.name}</option>`);
            });
            
            // Set default value if available from user preferences
            const defaultStage = frappe.defaults.get_user_default("stage");
            if (defaultStage) {
                stageSelect.val(defaultStage);
            } else {
                // Set "Products" as default if available
                if (stageSelect.find('option[value="Products"]').length > 0) {
                    stageSelect.val("Products");
                }
            }
        } else {
            stageSelect.html('<option value="">No stages found</option>');
            
            // At minimum, add Products as an option
            stageSelect.append('<option value="Products">Products</option>');
            stageSelect.val("Products");
        }
    }
    
    make() {
        // Create the main container
        this.page.main.html(`
            <div class="sublot-import-container">
                <!-- Bulk Import Section -->
                <div id="bulk_import_section" class="import-section">
                    <!-- Instructions Card -->
                    <div class="card mb-3">
                        <div class="card-header bg-primary text-white">
                            <h6 class="mb-0"><i class="fa fa-info-circle mr-2"></i>Bulk Sublot Import</h6>
                        </div>
                        <div class="card-body">
                            <p>Import multiple sublot records at once from pasted data.</p>
                            <p>The system will automatically handle operations and create sublots for all records.</p>
                        </div>
                    </div>
                    
                    <!-- Settings Section -->
                    <div class="section settings-section mb-3">
                        <div class="section-head">Import Settings</div>
                        <div class="section-body">
                            <div class="row">
                                <div class="col-md-6">
                                    <div class="form-group">
                                        <label for="warehouse_select" class="font-weight-bold">Warehouse:</label>
                                        <select id="warehouse_select" class="form-control form-control-lg highlight-select"></select>
                                    </div>
                                </div>
                                <div class="col-md-6">
                                    <div class="form-group">
                                        <label for="stage_select" class="font-weight-bold">Stage (Item Group):</label>
                                        <select id="stage_select" class="form-control form-control-lg highlight-select"></select>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                
                    <!-- Data Input Section -->
                    <div class="section data-section">
                        <div class="section-head">Import Data</div>
                        <div class="section-body">
                            <div class="form-group">
                                <label>Data Format Guidelines:</label>
                                <div class="alert alert-info">
                                    <p class="mb-1"><strong>Expected columns:</strong></p>
                                    <p class="mb-1">Date, Batch Number, Code, Inspector, (empty column), Total Qty, Accepted Qty, Rejected Qty, followed by rejection categories</p>
                                    <p class="mb-0">Paste data directly from Excel or Google Sheets.</p>
                                </div>
                            </div>
                            
                            <div class="form-group">
                                <label for="bulk_data_input">Enter Data:</label>
                                <div class="custom-control custom-radio custom-control-inline mb-2">
                                    <input type="radio" id="data_input_method_paste" name="data_input_method" class="custom-control-input" value="paste" checked>
                                    <label class="custom-control-label" for="data_input_method_paste">Paste Data</label>
                                </div>
                                <div class="custom-control custom-radio custom-control-inline mb-2">
                                    <input type="radio" id="data_input_method_upload" name="data_input_method" class="custom-control-input" value="upload">
                                    <label class="custom-control-label" for="data_input_method_upload">Upload File</label>
                                </div>
                                <div class="custom-control custom-radio custom-control-inline mb-2">
                                    <input type="radio" id="data_input_method_gsheet" name="data_input_method" class="custom-control-input" value="gsheet">
                                    <label class="custom-control-label" for="data_input_method_gsheet">Google Sheet</label>
                                </div>
                                
                                <div id="paste_input_container">
                                    <textarea id="bulk_data_input" class="form-control" rows="10" placeholder="Paste your data here..."></textarea>
                                </div>
                                
                                <div id="file_upload_container" style="display:none;">
                                    <div class="input-group">
                                        <div class="custom-file">
                                            <input type="file" class="custom-file-input" id="bulk_file_input" accept=".csv,.xls,.xlsx">
                                            <label class="custom-file-label" for="bulk_file_input">Choose CSV or Excel file</label>
                                        </div>
                                    </div>
                                    <div class="selected-file-info mt-2" style="display:none;">
                                        <div class="alert alert-info">
                                            <i class="fa fa-file-text-o mr-2"></i> <span id="selected_filename"></span>
                                            <button type="button" id="remove_file_btn" class="btn btn-sm btn-link text-danger float-right">
                                                <i class="fa fa-times"></i> Remove
                                            </button>
                                        </div>
                                    </div>
                                </div>
                                
                                <div id="gsheet_input_container" style="display:none;">
                                    <div class="form-group">
                                        <div class="input-group">
                                            <input type="text" id="gsheet_url" class="form-control" placeholder="Enter Google Sheet URL (must be published to web)">
                                            <div class="input-group-append">
                                                <button id="fetch_gsheet_btn" class="btn btn-primary">
                                                    <i class="fa fa-download mr-1"></i> Fetch Data
                                                </button>
                                            </div>
                                        </div>
                                        <small class="form-text text-muted">
                                            The Google Sheet must be published to the web. Go to File > Share > Publish to web.
                                        </small>
                                    </div>
                                    <div id="gsheet_info" class="alert alert-info mt-2" style="display:none;">
                                        <div>
                                            <i class="fa fa-table mr-2"></i>Connected to: <strong id="gsheet_title">Google Sheet</strong>
                                            <button type="button" id="disconnect_gsheet_btn" class="btn btn-sm btn-link text-danger float-right">
                                                <i class="fa fa-times"></i> Disconnect
                                            </button>
                                        </div>
                                        <div class="mt-2">
                                            <select id="gsheet_sheet_select" class="form-control">
                                                <option value="">Select a sheet...</option>
                                            </select>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            
                            <div class="form-group mt-3">
                                <button id="parse_data_btn" class="btn btn-primary">
                                    <i class="fa fa-table mr-1"></i> Parse Data
                                </button>
                            </div>
                        </div>
                    </div>
                    
                    <!-- Data Preview Section -->
                    <div class="section preview-section mt-3" style="display:none;">
                        <div class="section-head">Data Preview</div>
                        <div class="section-body">
                            <div class="alert alert-warning mb-3">
                                <p class="mb-0"><strong>Please verify</strong> that the data has been parsed correctly before proceeding with the import.</p>
                            </div>
                            
                            <div class="table-responsive">
                                <table class="table table-bordered table-sm" id="data_preview_table">
                                    <thead>
                                        <tr>
                                            <th>Date</th>
                                            <th>Batch #</th>
                                            <th>Code</th>
                                            <th>Inspector</th>
                                            <th>Total Qty</th>
                                            <th>Accept Qty</th>
                                            <th>Reject Qty</th>
                                            <th>Rejection Details</th>
                                            <th>Status</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        <!-- Data rows will be added here -->
                                    </tbody>
                                </table>
                            </div>
                            
                            <div class="form-group text-right">
                                <button id="reset_preview_btn" class="btn btn-secondary mr-2">
                                    <i class="fa fa-undo mr-1"></i> Reset
                                </button>
                                <button id="import_all_btn" class="btn btn-success">
                                    <i class="fa fa-upload mr-1"></i> Import All Records
                                </button>
                            </div>
                        </div>
                    </div>
                    
                    <!-- Import Progress Section -->
                    <div class="section progress-section mt-3" style="display:none;">
                        <div class="section-head">Import Progress</div>
                        <div class="section-body">
                            <div class="progress-status mb-3">
                                <div class="text-center mb-2">
                                    <div id="import_progress_text" class="h5 mb-2">Processing...</div>
                                    <div id="import_detail_text" class="text-muted">Importing records...</div>
                                </div>
                                
                                <div class="progress" style="height: 20px;">
                                    <div id="import_progress_bar" class="progress-bar progress-bar-striped progress-bar-animated" 
                                        role="progressbar" style="width: 0%;" 
                                        aria-valuenow="0" aria-valuemin="0" aria-valuemax="100"></div>
                                </div>
                                
                                <div class="d-flex justify-content-between mt-1">
                                    <div class="text-muted" id="records_processed">0/0 Records</div>
                                    <div class="text-muted" id="progress_percentage">0%</div>
                                </div>
                            </div>
                            
                            <div id="import_results" class="mt-4" style="display:none;">
                                <div class="card">
                                    <div class="card-header bg-light">
                                        <strong>Import Summary</strong>
                                    </div>
                                    <div class="card-body">
                                        <div class="row">
                                            <div class="col-md-4">
                                                <div class="card bg-success text-white mb-3 mb-md-0">
                                                    <div class="card-body text-center">
                                                        <h3 id="success_count">0</h3>
                                                        <p class="mb-0">Successfully Imported</p>
                                                    </div>
                                                </div>
                                            </div>
                                            <div class="col-md-4">
                                                <div class="card bg-danger text-white mb-3 mb-md-0">
                                                    <div class="card-body text-center">
                                                        <h3 id="failed_count">0</h3>
                                                        <p class="mb-0">Failed Imports</p>
                                                    </div>
                                                </div>
                                            </div>
                                            <div class="col-md-4">
                                                <div class="card bg-info text-white">
                                                    <div class="card-body text-center">
                                                        <h3 id="total_count">0</h3>
                                                        <p class="mb-0">Total Records</p>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                        
                                        <div class="text-center mt-4">
                                            <button id="view_import_details_btn" class="btn btn-primary">
                                                <i class="fa fa-list mr-1"></i> View Detailed Results
                                            </button>
                                            <button id="new_import_btn" class="btn btn-secondary ml-2">
                                                <i class="fa fa-plus mr-1"></i> New Import
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `);
        
        // Add CSS styles for the page
        this.add_styles();
    }
    
    add_styles() {
        $('<style>').text(`
            .sublot-import-container {
                padding: 15px;
            }
            
            .section {
                background-color: #f5f7fa;
                border: 1px solid #e0e4e9;
                border-radius: 6px;
                margin-bottom: 20px;
                box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
            }
            
            .section-head {
                background-color: #2c80ff;
                color: white;
                padding: 10px 15px;
                font-weight: 600;
                border-radius: 6px 6px 0 0;
                cursor: pointer;
            }
            
            .section-body {
                padding: 15px;
            }
            
            /* Enhanced styling for settings section */
            .settings-section {
                border: 2px solid #4caf50;
                box-shadow: 0 2px 5px rgba(0, 0, 0, 0.1);
            }
            
            .settings-section .section-head {
                background-color: #4caf50;
                font-size: 16px;
                padding: 12px 15px;
            }
            
            .settings-section .section-body {
                background-color: #f8fff8;
                padding: 20px;
            }
            
            /* Enhanced styling for select fields */
            .highlight-select {
                border: 2px solid #4caf50;
                box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
                height: 45px;
                font-size: 16px;
                color: #333;
                background-color: #fff;
                padding-left: 10px;
                margin-bottom: 5px;
            }
            
            .highlight-select:focus {
                border-color: #2c80ff;
                box-shadow: 0 0 0 3px rgba(44, 128, 255, 0.25);
            }
            
            /* Enhanced label styling */
            label.font-weight-bold {
                font-size: 15px;
                color: #333;
                margin-bottom: 8px;
                display: block;
            }
            
            .alert {
                border-radius: 4px;
                margin-bottom: 15px;
            }
            
            .card {
                box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
            }
            
            .card-header {
                font-weight: 600;
            }
            
            .badge {
                padding: 5px 10px;
                margin-right: 5px;
            }
            
            .table th {
                background-color: #f5f7fa;
                font-weight: 600;
            }
            
            .btn-success {
                background-color: #28a745;
                border-color: #28a745;
            }
            
            #data_preview_table td.rejection-cell {
                max-width: 300px;
                overflow-x: auto;
            }
            
            #data_preview_table .rejection-pills {
                display: flex;
                flex-wrap: wrap;
                gap: 5px;
            }
            
            #data_preview_table .rejection-pills .badge {
                white-space: nowrap;
                margin-bottom: 3px;
            }
            
            #data_preview_table .status-cell {
                width: 120px;
            }
            
            #data_preview_table .status-cell .badge {
                display: block;
                text-align: center;
                padding: 6px 8px;
            }
            
            #data_preview_table {
                font-size: 0.8rem;
            }
            
            #bulk_data_input {
                font-family: Consolas, Monaco, 'Courier New', monospace;
                font-size: 0.875rem;
            }
        `).appendTo(this.wrapper);
    }
    
    bind_events() {
        // Parse data button
        this.wrapper.find('#parse_data_btn').on('click', () => this.parse_bulk_data());
        
        // Import all button
        this.wrapper.find('#import_all_btn').on('click', () => this.import_all_records());
        
        // Reset preview button
        this.wrapper.find('#reset_preview_btn').on('click', () => {
            this.wrapper.find('.preview-section').hide();
            this.wrapper.find('#data_preview_table tbody').empty();
            this.parsed_data = null;
        });
        
        // View details button
        this.wrapper.find('#view_import_details_btn').on('click', () => {
            // Scroll to data preview table to show detailed results
            this.wrapper.find('.preview-section').show();
            $('html, body').animate({
                scrollTop: this.wrapper.find('.preview-section').offset().top - 60
            }, 500);
        });
        
        // New import button
        this.wrapper.find('#new_import_btn').on('click', () => {
            this.reset_form();
        });
        
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
        
        // Toggle between paste input and file upload
        this.wrapper.find('input[name="data_input_method"]').on('change', (e) => {
            const method = $(e.target).val();
            if (method === 'paste') {
                this.wrapper.find('#paste_input_container').show();
                this.wrapper.find('#file_upload_container').hide();
                this.wrapper.find('#gsheet_input_container').hide();
            } else if (method === 'upload') {
                this.wrapper.find('#paste_input_container').hide();
                this.wrapper.find('#file_upload_container').show();
                this.wrapper.find('#gsheet_input_container').hide();
            } else if (method === 'gsheet') {
                this.wrapper.find('#paste_input_container').hide();
                this.wrapper.find('#file_upload_container').hide();
                this.wrapper.find('#gsheet_input_container').show();
            }
        });
        
        // File input change handler
        this.wrapper.find('#bulk_file_input').on('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                // Update the file label with the selected filename
                this.wrapper.find('.custom-file-label').text(file.name);
                this.wrapper.find('#selected_filename').text(file.name);
                this.wrapper.find('.selected-file-info').show();
                
                // Process the file based on its extension
                this.handleFileUpload(file);
            }
        });
        
        // Remove file button
        this.wrapper.find('#remove_file_btn').on('click', () => {
            // Clear the file input
            this.wrapper.find('#bulk_file_input').val('');
            this.wrapper.find('.custom-file-label').text('Choose CSV or Excel file');
            this.wrapper.find('.selected-file-info').hide();
        });
        
        // Google Sheet fetch button
        this.wrapper.find('#fetch_gsheet_btn').on('click', () => {
            const sheetUrl = this.wrapper.find('#gsheet_url').val();
            if (sheetUrl) {
                this.fetchGoogleSheet(sheetUrl);
            } else {
                frappe.msgprint('Please enter a Google Sheet URL');
            }
        });
        
        // Google Sheet disconnect button
        this.wrapper.find('#disconnect_gsheet_btn').on('click', () => {
            this.wrapper.find('#gsheet_url').val('');
            this.wrapper.find('#gsheet_info').hide();
            this.wrapper.find('#gsheet_sheet_select').empty().append('<option value="">Select a sheet...</option>');
            this.gsheetData = null;
        });
        
        // Google Sheet sheet selection dropdown
        this.wrapper.find('#gsheet_sheet_select').on('change', (e) => {
            const sheetName = $(e.target).val();
            if (sheetName && this.gsheetData && this.gsheetData.sheets) {
                const selectedSheet = this.gsheetData.sheets.find(s => s.name === sheetName);
                if (selectedSheet && selectedSheet.data) {
                    // Convert sheet data to CSV format
                    const csvData = this.convertSheetDataToCSV(selectedSheet.data);
                    
                    // Set the CSV data to the textarea for compatibility with existing parsing code
                    this.wrapper.find('#bulk_data_input').val(csvData);
                    
                    // Parse the data
                    this.parse_bulk_data();
                }
            }
        });
    }
    
    reset_form() {
        // Reset bulk import form
        this.wrapper.find('#bulk_data_input').val('');
        this.wrapper.find('.preview-section').hide();
        this.wrapper.find('#data_preview_table tbody').empty();
        this.wrapper.find('.progress-section').hide();
        this.wrapper.find('#import_progress_bar').css('width', '0%');
        this.wrapper.find('#progress_percentage').text('0%');
        this.wrapper.find('#import_results').hide();
        
        // Show the data input section
        this.wrapper.find('.data-section .section-body').show();
        this.wrapper.find('.data-section .section-head').removeClass('collapsed');
        
        // Clear parsed data
        this.parsed_data = null;
    }
    
    handleFileUpload(file) {
        // Check file extension to determine how to process
        const fileName = file.name;
        const fileExtension = fileName.split('.').pop().toLowerCase();
        
        if (fileExtension === 'csv') {
            this.parseCSVFile(file);
        } else if (fileExtension === 'xls' || fileExtension === 'xlsx') {
            this.parseExcelFile(file);
        } else {
            frappe.msgprint(`Unsupported file format: ${fileExtension}. Please upload a CSV or Excel file.`);
        }
    }
    
    parseCSVFile(file) {
        const reader = new FileReader();
        
        reader.onload = (event) => {
            try {
                const csvData = event.target.result;
                
                // Set the CSV data to the textarea (for compatibility with existing parsing code)
                this.wrapper.find('#bulk_data_input').val(csvData);
                
                // Parse the data using existing method
                this.parse_bulk_data();
                
            } catch (error) {
                console.error("Error parsing CSV file:", error);
                frappe.msgprint(`Error parsing CSV file: ${error.message}`);
            }
        };
        
        reader.onerror = (error) => {
            console.error("Error reading CSV file:", error);
            frappe.msgprint("Failed to read the CSV file. Please try again.");
        };
        
        // Read the file as text
        reader.readAsText(file);
    }
    
    parseExcelFile(file) {
        const reader = new FileReader();
        
        reader.onload = (event) => {
            try {
                // Check if the xlsx library is available
                if (typeof XLSX === 'undefined') {
                    // If SheetJS is not loaded, try to load it dynamically
                    this.loadSheetJSLibrary()
                        .then(() => {
                            this.processExcelData(event.target.result);
                        })
                        .catch(error => {
                            console.error("Error loading SheetJS library:", error);
                            frappe.msgprint("Could not load Excel processing library. Please convert your file to CSV format or use the paste option.");
                        });
                } else {
                    // If SheetJS is already loaded, process the Excel data
                    this.processExcelData(event.target.result);
                }
            } catch (error) {
                console.error("Error parsing Excel file:", error);
                frappe.msgprint(`Error parsing Excel file: ${error.message}. Please try using CSV format instead.`);
            }
        };
        
        reader.onerror = (error) => {
            console.error("Error reading Excel file:", error);
            frappe.msgprint("Failed to read the Excel file. Please try again or use CSV format.");
        };
        
        // Read the file as an array buffer (for Excel files)
        reader.readAsArrayBuffer(file);
    }
    
    loadSheetJSLibrary() {
        return new Promise((resolve, reject) => {
            // Check if frappe has XLSX as a library dependency
            if (frappe.require) {
                frappe.require(['xlsx.full.min.js'], () => {
                    resolve();
                }, (err) => {
                    reject(err);
                });
            } else {
                // If frappe.require is not available, try to load from CDN
                const script = document.createElement('script');
                script.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
                script.onload = () => resolve();
                script.onerror = () => reject(new Error('Failed to load SheetJS library.'));
                document.head.appendChild(script);
            }
        });
    }
    
    processExcelData(data) {
        try {
            // Parse the Excel data
            const workbook = XLSX.read(data, { type: 'array' });
            
            // Get the first sheet
            const firstSheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[firstSheetName];
            
            // Convert to CSV
            const csvOptions = { FS: ',', RS: '\n', blankrows: false };
            const csvData = XLSX.utils.sheet_to_csv(worksheet, csvOptions);
            
            // Set the CSV data to the textarea (for compatibility with existing parsing code)
            this.wrapper.find('#bulk_data_input').val(csvData);
            
            // Parse the data using existing method
            this.parse_bulk_data();
            
        } catch (error) {
            console.error("Error processing Excel file:", error);
            frappe.msgprint(`Error processing Excel file: ${error.message}`);
        }
    }
    
    fetchGoogleSheet(url) {
        // Extract the Google Sheet ID from the URL
        const sheetId = this.extractSheetId(url);
        
        if (!sheetId) {
            frappe.msgprint("Invalid Google Sheet URL. Please make sure the URL is correct.");
            return;
        }
        
        // Show loading indicator
        this.wrapper.find('#gsheet_url').attr('disabled', true);
        this.wrapper.find('#fetch_gsheet_btn').html('<i class="fa fa-spinner fa-spin mr-1"></i> Fetching...').attr('disabled', true);
        
        // Create a direct download link for manual download
        const manualDownloadUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv`;
        
        this.wrapper.find('#gsheet_manual_instructions').remove();
        this.wrapper.find('#gsheet_input_container').append(`
            <div id="gsheet_manual_instructions" class="mt-3 alert alert-info">
                <h6><i class="fa fa-info-circle mr-2"></i>Download CSV from Google Sheet</h6>
                <p>To import data from your Google Sheet:</p>
                
                <div class="mt-3">
                    <ol>
                        <li>
                            <a href="${manualDownloadUrl}" target="_blank" class="btn btn-sm btn-primary">
                                <i class="fa fa-download mr-1"></i> Download as CSV
                            </a>
                        </li>
                        <li>Open the downloaded CSV file in a text editor</li>
                        <li>Copy all content (Ctrl+A, Ctrl+C)</li>
                        <li>Switch to "Paste Data" method and paste there</li>
                    </ol>
                </div>
                
                <div class="mt-3">
                    <button id="cancel_gsheet_fetch_btn" class="btn btn-sm btn-danger">
                        <i class="fa fa-times mr-1"></i> Cancel
                    </button>
                </div>
            </div>
        `);
        
        // Attach event handler for the cancel button
        this.wrapper.find('#cancel_gsheet_fetch_btn').on('click', () => {
            this.wrapper.find('#gsheet_manual_instructions').remove();
            this.resetGoogleSheetUI();
        });
        
        // Reset the fetch UI
        this.resetGoogleSheetUI();
    }
    
    extractSheetId(url) {
        // Extract sheet ID from different Google Sheet URL formats
        let sheetId = null;
        
        // Format: https://docs.google.com/spreadsheets/d/[SPREADSHEET_ID]/edit
        const regex1 = /https:\/\/docs\.google\.com\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/;
        const match1 = url.match(regex1);
        
        if (match1 && match1[1]) {
            sheetId = match1[1];
        }
        
        // Format: https://docs.google.com/spreadsheets/d/e/[PUBLISHED_ID]/pub
        const regex2 = /https:\/\/docs\.google\.com\/spreadsheets\/d\/e\/([a-zA-Z0-9_-]+)\/pub/;
        const match2 = url.match(regex2);
        
        if (match2 && match2[1]) {
            sheetId = match2[1];
        }
        
        // Direct sheet ID input
        if (!sheetId && /^[a-zA-Z0-9_-]+$/.test(url)) {
            sheetId = url;
        }
        
        return sheetId;
    }
    
    parse_bulk_data() {
        const data = this.wrapper.find('#bulk_data_input').val();
        
        if (!data || data.trim() === '') {
            frappe.msgprint("Please paste or upload data first");
            return;
        }
        
        try {
            // Split the data into rows
            const rows = data.trim().split('\n');
            
            if (rows.length === 0) {
                frappe.msgprint("No data rows found");
                return;
            }
            
            // Parse each row
            const parsed_data = [];
            
            // Process each row as data (no header row expected for inspection reports)
            rows.forEach((row, rowIndex) => {
                // Skip empty rows
                if (!row.trim()) return;
                
                // Skip comment lines that start with //
                if (row.trim().startsWith('//')) return;
                
                // Split by comma (standard CSV format)
                const columns = row.split(',');
                
                // Skip if not enough columns for meaningful data (need at least date, batch, emp, qty)
                if (columns.length < 5) {
                    console.warn(`Row ${rowIndex + 1} doesn't have enough columns:`, row);
                    return;
                }
                
                // Validate if first column looks like a date (either DD-M-YYYY or DD-MM-YYYY format)
                const datePattern = /^\d{1,2}-\d{1,2}-\d{4}$/;
                if (!datePattern.test(columns[0].trim())) {
                    console.warn(`Row ${rowIndex + 1} doesn't start with a date format:`, columns[0]);
                    return;
                }
                
                // Create a new record with the basic fields
                const record = {
                    date: columns[0].trim(),              // Date
                    batch_number: columns[1].trim(),      // Lot No
                    code: columns[2].trim(),              // Emp ID
                    inspector: columns[3].trim(),         // EMP name
                    total_qty: parseFloat(columns[4]) || 0, // Insp Qty
                    accepted_qty: parseFloat(columns[5]) || 0, // Good Qty
                    rejected_qty: parseFloat(columns[6]) || 0, // Rej Qty
                    rejections: []
                };
                
                // Pre-defined rejection types in the order they appear in the CSV (column 8 onwards)
                const rejectionTypes = [
                    "F", "BU", "CM", "RIB", "DL", "BO", "UF", "FP", "UC", "OC", 
                    "OT", "MD", "BEND", "BL", "DP", "ID OS", "OD US", "OD OS", "PL CM", "DF", "SD"
                ];
                
                // Process rejection data starting from index 8 (column 9)
                for (let i = 8; i < columns.length; i++) {
                    const value = columns[i].trim();
                    // Only process if the cell has a valid number greater than 0
                    if (value && !isNaN(parseFloat(value)) && parseFloat(value) > 0) {
                        const typeIndex = i - 8;
                        if (typeIndex < rejectionTypes.length) {
                            record.rejections.push({
                                rejectionType: rejectionTypes[typeIndex],
                                quantity: parseFloat(value)
                            });
                        }
                    }
                }
                
                parsed_data.push(record);
            });
            
            if (parsed_data.length === 0) {
                frappe.msgprint("No valid data rows found. Please check the format and try again.");
                return;
            }
            
            console.log("Successfully parsed rows:", parsed_data.length);
            
            // Store the parsed data for later use
            this.parsed_data = parsed_data;
            
            // Show the data preview section
            this.show_data_preview();
            
        } catch (error) {
            console.error("Error parsing data:", error);
            frappe.msgprint(`Error parsing data: ${error.message}. Please check the format and try again.`);
        }
    }
    
    show_data_preview() {
        // Show the preview section
        this.wrapper.find('.preview-section').show();
        
        // Get the table body
        const tableBody = this.wrapper.find('#data_preview_table tbody');
        tableBody.empty();
        
        // Display the parsed data
        this.parsed_data.forEach((record, index) => {
            // Sort rejections by their type for consistent display
            if (record.rejections) {
                record.rejections.sort((a, b) => {
                    const knownRejTypes = ["F", "BU", "CM", "RIB", "DL", "BO", "UF", "FP", "UC", "OC", 
                                    "OT", "MD", "BEND", "BL", "DP", "ID OS", "OD US", "OD OS", "PL CM", "DF", "SD"];
                    return knownRejTypes.indexOf(a.rejectionType) - knownRejTypes.indexOf(b.rejectionType);
                });
            }
            
            // Format rejection details for display
            let rejectionHTML = '';
            if (record.rejections && record.rejections.length > 0) {
                rejectionHTML = '<div class="rejection-pills">';
                record.rejections.forEach(rejection => {
                    rejectionHTML += `<span class="badge badge-info">${rejection.rejectionType}: ${rejection.quantity}</span> `;
                });
                rejectionHTML += '</div>';
            } else {
                rejectionHTML = '<span class="text-muted">No rejections</span>';
            }
            
            // Calculate total rejection quantity
            const totalRejQty = record.rejections.reduce((sum, r) => sum + parseFloat(r.quantity || 0), 0);
            
            // Check if rejection quantities match the total
            const rejQtyMatch = Math.abs(totalRejQty - parseFloat(record.rejected_qty || 0)) < 0.001;
            let rejectionValidityClass = rejQtyMatch ? 'text-success' : 'text-warning';
            let rejectionValidityNote = '';
            
            if (!rejQtyMatch) {
                rejectionValidityNote = `<div class="${rejectionValidityClass}">
                    <small><i class="fa fa-exclamation-triangle"></i> Sum of rejections (${totalRejQty}) 
                    doesn't match total rejected qty (${record.rejected_qty})</small>
                </div>`;
            }
            
            // Add row to the table
            tableBody.append(`
                <tr data-index="${index}">
                    <td>${record.date || ''}</td>
                    <td>${record.batch_number || ''}</td>
                    <td>${record.code || ''}</td>
                    <td>${record.inspector || ''}</td>
                    <td>${record.total_qty || ''}</td>
                    <td>${record.accepted_qty || ''}</td>
                    <td>${record.rejected_qty || ''}</td>
                    <td class="rejection-cell">
                        ${rejectionHTML}
                        ${rejectionValidityNote}
                    </td>
                    <td class="status-cell">
                        <span class="badge badge-secondary">Ready for import</span>
                    </td>
                </tr>
            `);
        });
        
        // Hide the data input section to make room for the preview
        this.wrapper.find('.data-section .section-body').slideUp(200);
        this.wrapper.find('.data-section .section-head').addClass('collapsed');
    }
    
    import_all_records() {
        // If there's no parsed data, show an error
        if (!this.parsed_data || this.parsed_data.length === 0) {
            frappe.msgprint("No data to import. Please parse data first.");
            return;
        }
        
        // Get required settings
        const warehouse = this.wrapper.find('#warehouse_select').val();
        const stage = this.wrapper.find('#stage_select').val();
        
        if (!warehouse) {
            frappe.msgprint("Please select a warehouse before importing.");
            return;
        }
        
        if (!stage) {
            frappe.msgprint("Please select a stage (item group) before importing.");
            return;
        }
        
        // Hide the preview section
        this.wrapper.find('.preview-section').hide();
        
        // Show the progress section
        this.wrapper.find('.progress-section').show();
        
        // Reset progress indicators
        this.wrapper.find('#import_progress_bar').css('width', '0%');
        this.wrapper.find('#progress_percentage').text('0%');
        this.wrapper.find('#records_processed').text(`0/${this.parsed_data.length} Records`);
        this.wrapper.find('#import_results').hide();
        
        // Initialize counters for the import process
        let successCount = 0;
        let failedCount = 0;
        let currentIndex = 0;
        const totalRecords = this.parsed_data.length;
        
        // Update the table statuses
        const tableBody = this.wrapper.find('#data_preview_table tbody');
        tableBody.find('tr').each(function() {
            $(this).find('.status-cell').html(`
                <span class="badge badge-secondary">Pending</span>
            `);
        });
        
        // Function to process a single record with stage 2 validations
        const processRecord = (record, index) => {
            // Update progress UI
            const progressPercent = Math.round((currentIndex / totalRecords) * 100);
            this.wrapper.find('#import_progress_bar').css('width', `${progressPercent}%`);
            this.wrapper.find('#progress_percentage').text(`${progressPercent}%`);
            this.wrapper.find('#records_processed').text(`${currentIndex}/${totalRecords} Records`);
            this.wrapper.find('#import_progress_text').text(`Processing record ${currentIndex+1} of ${totalRecords}`);
            this.wrapper.find('#import_detail_text').text(`Stage 1: Validating batch ${record.batch_number}, Code: ${record.code}`);
            
            // Update the status of the current row
            tableBody.find(`tr[data-index="${index}"]`).find('.status-cell').html(`
                <span class="badge badge-primary">Validating batch...</span>
            `);
            
            // STAGE 2: First validate the batch/lot to get stock information
            frappe.call({
                method: "smart_screens.smart_screens.utils.lot_validation.lot_validation",
                args: {
                    mixed_barcode: record.batch_number,
                    stage: this.wrapper.find('#stage_select').val() || "Products",  // Use selected stage or default
                    warehouse: this.wrapper.find('#warehouse_select').val() || "U2-Store - SPP INDIA"  // Use selected warehouse or default
                },
                callback: (batchResponse) => {
                    console.log("Batch validation response:", batchResponse);
                    if (batchResponse.message && !batchResponse.message.error) {
                        // Batch validation successful - update the record with stock info
                        const batchData = batchResponse.message;
                        
                        // Update table to show validated batch
                        tableBody.find(`tr[data-index="${index}"]`).find('.status-cell').html(`
                            <span class="badge badge-info">
                                <i class="fa fa-check-circle mr-1"></i> Batch validated
                            </span>
                        `);
                        
                        // Update detail text
                        this.wrapper.find('#import_detail_text').text(`Stage 2: Fetching BOM info for ${batchData.item_code}`);
                        
                        // STAGE 2: Now fetch BOM information for the item
                        frappe.call({
                            method: "smart_screens.smart_screens.utils.bom_validation.get_boms_by_component_item",
                            args: {
                                item_code: batchData.item_code
                            },
                            callback: (bomResponse) => {
                                // Store batch and BOM information in the record
                                record.validated_batch_info = {
                                    sppBatchId: record.batch_number,
                                    item_code: batchData.item_code,
                                    batch_no: batchData.batch_no,
                                    warehouse: batchData.warehouse,
                                    quantity: batchData.batch_quantity,
                                    uom: batchData.uom || "Nos"
                                };
                                
                                // Process BOM info if available
                                if (bomResponse.message && bomResponse.message.success && 
                                    bomResponse.message.data.boms && bomResponse.message.data.boms.length > 0) {
                                    
                                    // Store the first BOM info (primary BOM)
                                    record.bom_info = bomResponse.message.data.boms[0];
                                    
                                    // Update table to show BOM info
                                    tableBody.find(`tr[data-index="${index}"]`).find('.status-cell').html(`
                                        <span class="badge badge-success">
                                            <i class="fa fa-check-circle mr-1"></i> Batch & BOM validated
                                        </span>
                                    `);
                                    
                                    // Store the validated information in the original data for future use
                                    this.parsed_data[index].validated = true;
                                    
                                    // Now proceed to Stage 3: creating the sublot with all collected information
                                    this.wrapper.find('#import_detail_text').text(`Stage 3: Creating sublot for ${record.batch_number}`);
                                    
                                    // Call API to import the record with validated information
                                    frappe.call({
                                        method: "smart_screens.smart_screens.api.sub_lot_process.create_simplified_sublot_process",
                                        args: {
                                            batch_info: record.validated_batch_info,
                                            inspection_qty: record.total_qty,
                                            rejection_data: record.rejections.map(rejection => ({
                                                rejectionType: this.getRejectionTypeFullName(rejection.rejectionType),
                                                quantity: rejection.quantity
                                            })) || [],
                                            bom_info: record.bom_info,
                                            inspector_info: {
                                                inspector_code: record.code || "QA-INSP-001",
                                                inspector_name: record.inspector || "Quality Inspector"
                                            }
                                        },
                                        callback: (createResponse) => {
                                            console.log("Create sublot response:", createResponse);
                                            currentIndex++;
                                            
                                            if (createResponse.message && createResponse.message.status === "success") {
                                                // Success
                                                successCount++;
                                                tableBody.find(`tr[data-index="${index}"]`).find('.status-cell').html(`
                                                    <span class="badge badge-success">
                                                        <i class="fa fa-check-circle mr-1"></i> Success
                                                    </span>
                                                    <div class="text-success small mt-1">Process: ${createResponse.message.process_record || ''}</div>
                                                `);
                                            } else {
                                                // Failure
                                                failedCount++;
                                                const errorMsg = createResponse.message && createResponse.message.message 
                                                    ? createResponse.message.message 
                                                    : "Import failed";
                                                    
                                                tableBody.find(`tr[data-index="${index}"]`).find('.status-cell').html(`
                                                    <span class="badge badge-danger">
                                                        <i class="fa fa-exclamation-circle mr-1"></i> Failed
                                                    </span>
                                                    <div class="text-danger small mt-1">${errorMsg}</div>
                                                `);
                                            }
                                            
                                            // Process next record or finish
                                            if (currentIndex < totalRecords) {
                                                processRecord(this.parsed_data[currentIndex], currentIndex);
                                            } else {
                                                // All done, show results
                                                this.complete_import(successCount, failedCount, totalRecords);
                                            }
                                        },
                                        error: (err) => {
                                            // Error handling
                                            currentIndex++;
                                            failedCount++;
                                            
                                            console.error("Error creating sublot:", err);
                                            
                                            tableBody.find(`tr[data-index="${index}"]`).find('.status-cell').html(`
                                                <span class="badge badge-danger">
                                                    <i class="fa fa-exclamation-circle mr-1"></i> Error
                                                </span>
                                                <div class="text-danger small mt-1">Failed to create sublot</div>
                                            `);
                                            
                                            // Process next record or finish
                                            if (currentIndex < totalRecords) {
                                                processRecord(this.parsed_data[currentIndex], currentIndex);
                                            } else {
                                                // All done, show results
                                                this.complete_import(successCount, failedCount, totalRecords);
                                            }
                                        }
                                    });
                                } else {
                                    // BOM not found but continue with batch info
                                    record.bom_info = null;
                                    
                                    // Update table to show warning
                                    tableBody.find(`tr[data-index="${index}"]`).find('.status-cell').html(`
                                        <span class="badge badge-warning">
                                            <i class="fa fa-exclamation-triangle mr-1"></i> No BOM found
                                        </span>
                                    `);
                                    
                                    // Store the validated information in the original data for future use
                                    this.parsed_data[index].validated = true;
                                    
                                    // Now proceed to Stage 3: creating the sublot with just batch info
                                    this.wrapper.find('#import_detail_text').text(`Stage 3: Creating sublot for ${record.batch_number} (without BOM)`);
                                    
                                    // Call API to import the record with validated information but no BOM
                                    frappe.call({
                                        method: "smart_screens.smart_screens.api.sub_lot_process.create_simplified_sublot_process",
                                        args: {
                                            batch_info: record.validated_batch_info,
                                            inspection_qty: record.total_qty,
                                            rejection_data: record.rejections.map(rejection => ({
                                                rejectionType: this.getRejectionTypeFullName(rejection.rejectionType),
                                                quantity: rejection.quantity
                                            })) || [],
                                            bom_info: null,
                                            inspector_info: {
                                                inspector_code: record.code || "QA-INSP-001",
                                                inspector_name: record.inspector || "Quality Inspector"
                                            }
                                        },
                                        callback: (createResponse) => {
                                            currentIndex++;
                                            
                                            if (createResponse.message && createResponse.message.status === "success") {
                                                // Success
                                                successCount++;
                                                tableBody.find(`tr[data-index="${index}"]`).find('.status-cell').html(`
                                                    <span class="badge badge-success">
                                                        <i class="fa fa-check-circle mr-1"></i> Success
                                                    </span>
                                                    <div class="text-success small mt-1">Process: ${createResponse.message.process_record || ''}</div>
                                                `);
                                            } else {
                                                // Failure
                                                failedCount++;
                                                const errorMsg = createResponse.message && createResponse.message.message 
                                                    ? createResponse.message.message 
                                                    : "Import failed";
                                                    
                                                tableBody.find(`tr[data-index="${index}"]`).find('.status-cell').html(`
                                                    <span class="badge badge-danger">
                                                        <i class="fa fa-exclamation-circle mr-1"></i> Failed
                                                    </span>
                                                    <div class="text-danger small mt-1">${errorMsg}</div>
                                                `);
                                            }
                                            
                                            // Process next record or finish
                                            if (currentIndex < totalRecords) {
                                                processRecord(this.parsed_data[currentIndex], currentIndex);
                                            } else {
                                                // All done, show results
                                                this.complete_import(successCount, failedCount, totalRecords);
                                            }
                                        },
                                        error: (err) => {
                                            // Error handling
                                            currentIndex++;
                                            failedCount++;
                                            
                                            console.error("Error creating sublot:", err);
                                            
                                            tableBody.find(`tr[data-index="${index}"]`).find('.status-cell').html(`
                                                <span class="badge badge-danger">
                                                    <i class="fa fa-exclamation-circle mr-1"></i> Error
                                                </span>
                                                <div class="text-danger small mt-1">Failed to create sublot</div>
                                            `);
                                            
                                            // Process next record or finish
                                            if (currentIndex < totalRecords) {
                                                processRecord(this.parsed_data[currentIndex], currentIndex);
                                            } else {
                                                // All done, show results
                                                this.complete_import(successCount, failedCount, totalRecords);
                                            }
                                        }
                                    });
                                }
                            },
                            error: (err) => {
                                // Error fetching BOM, but still proceed with batch info
                                console.error("Error fetching BOM details:", err);
                                
                                // Still store batch info
                                record.validated_batch_info = {
                                    sppBatchId: record.batch_number,
                                    item_code: batchData.item_code,
                                    batch_no: batchData.batch_no,
                                    warehouse: batchData.warehouse,
                                    quantity: batchData.batch_quantity,
                                    uom: batchData.uom || "Nos"
                                };
                                record.bom_info = null;
                                
                                // Show warning in status
                                tableBody.find(`tr[data-index="${index}"]`).find('.status-cell').html(`
                                    <span class="badge badge-warning">
                                        <i class="fa fa-exclamation-triangle mr-1"></i> BOM fetch error
                                    </span>
                                `);
                                
                                // Proceed to create sublot without BOM info
                                this.createSubLot(record, index, tableBody, currentIndex, totalRecords, successCount, failedCount);
                            }
                        });
                    } else {
                        // Batch validation failed
                        const errorMsg = batchResponse.message && batchResponse.message.error 
                            ? batchResponse.message.error 
                            : "Invalid batch number";
                            
                        currentIndex++;
                        failedCount++;
                        
                        tableBody.find(`tr[data-index="${index}"]`).find('.status-cell').html(`
                            <span class="badge badge-danger">
                                <i class="fa fa-exclamation-circle mr-1"></i> Invalid Batch
                            </span>
                            <div class="text-danger small mt-1">${errorMsg}</div>
                        `);
                        
                        // Process next record or finish
                        if (currentIndex < totalRecords) {
                            processRecord(this.parsed_data[currentIndex], currentIndex);
                        } else {
                            // All done, show results
                            this.complete_import(successCount, failedCount, totalRecords);
                        }
                    }
                },
                error: (err) => {
                    // Error validating batch
                    console.error("Error validating batch:", err);
                    
                    currentIndex++;
                    failedCount++;
                    
                    tableBody.find(`tr[data-index="${index}"]`).find('.status-cell').html(`
                        <span class="badge badge-danger">
                            <i class="fa fa-exclamation-circle mr-1"></i> Validation Error
                        </span>
                        <div class="text-danger small mt-1">Failed to validate batch</div>
                    `);
                    
                    // Process next record or finish
                    if (currentIndex < totalRecords) {
                        processRecord(this.parsed_data[currentIndex], currentIndex);
                    } else {
                        // All done, show results
                        this.complete_import(successCount, failedCount, totalRecords);
                    }
                }
            });
        };
        
        // Helper function to create sublot (to avoid duplicate code)
        this.createSubLot = function(record, index, tableBody, currentIndex, totalRecords, successCount, failedCount) {
            this.wrapper.find('#import_detail_text').text(`Stage 3: Creating sublot for ${record.batch_number}`);
            
            // Call API to import the record with validated information
            frappe.call({
                method: "smart_screens.smart_screens.api.sub_lot_process.create_simplified_sublot_process",
                args: {
                    batch_info: record.validated_batch_info,
                    inspection_qty: record.total_qty,
                    rejection_data: record.rejections.map(rejection => ({
                        rejectionType: this.getRejectionTypeFullName(rejection.rejectionType),
                        quantity: rejection.quantity
                    })) || [],
                    bom_info: record.bom_info,
                    inspector_info: {
                        inspector_code: record.code || "QA-INSP-001",
                        inspector_name: record.inspector || "Quality Inspector"
                    }
                },
                callback: (createResponse) => {
                    currentIndex++;
                    
                    if (createResponse.message && createResponse.message.status === "success") {
                        // Success
                        successCount++;
                        tableBody.find(`tr[data-index="${index}"]`).find('.status-cell').html(`
                            <span class="badge badge-success">
                                <i class="fa fa-check-circle mr-1"></i> Success
                            </span>
                        `);
                    } else {
                        // Failure
                        failedCount++;
                        const errorMsg = createResponse.message && createResponse.message.message 
                            ? createResponse.message.message 
                            : "Import failed";
                            
                        tableBody.find(`tr[data-index="${index}"]`).find('.status-cell').html(`
                            <span class="badge badge-danger">
                                <i class="fa fa-exclamation-circle mr-1"></i> Failed
                            </span>
                            <div class="text-danger small mt-1">${errorMsg}</div>
                        `);
                    }
                    
                    // Process next record or finish
                    if (currentIndex < totalRecords) {
                        processRecord(this.parsed_data[currentIndex], currentIndex);
                    } else {
                        // All done, show results
                        this.complete_import(successCount, failedCount, totalRecords);
                    }
                },
                error: (err) => {
                    // Error handling
                    currentIndex++;
                    failedCount++;
                    
                    console.error("Error creating sublot:", err);
                    
                    tableBody.find(`tr[data-index="${index}"]`).find('.status-cell').html(`
                        <span class="badge badge-danger">
                            <i class="fa fa-exclamation-circle mr-1"></i> Error
                        </span>
                        <div class="text-danger small mt-1">Failed to create sublot</div>
                    `);
                    
                    // Process next record or finish
                    if (currentIndex < totalRecords) {
                        processRecord(this.parsed_data[currentIndex], currentIndex);
                    } else {
                        // All done, show results
                        this.complete_import(successCount, failedCount, totalRecords);
                    }
                }
            });
        };
        
        // Start the import process with the first record
        if (totalRecords > 0) {
            processRecord(this.parsed_data[0], 0);
        } else {
            this.complete_import(0, 0, 0);
        }
    }
    
    complete_import(successCount, failedCount, totalCount) {
        // Update progress to 100%
        this.wrapper.find('#import_progress_bar').css('width', '100%');
        this.wrapper.find('#progress_percentage').text('100%');
        this.wrapper.find('#records_processed').text(`${totalCount}/${totalCount} Records`);
        
        // Show completion message
        this.wrapper.find('#import_progress_text').text('Import Complete');
        this.wrapper.find('#import_detail_text').text(`Successfully imported ${successCount} of ${totalCount} records`);
        
        // Update summary counts
        this.wrapper.find('#success_count').text(successCount);
        this.wrapper.find('#failed_count').text(failedCount);
        this.wrapper.find('#total_count').text(totalCount);
        
        // Show the results section
        this.wrapper.find('#import_results').show();
        
        // Show the preview section again for detailed results
        this.wrapper.find('.preview-section').show();
    }
    
    format_number(number) {
        // Format a number to remove unnecessary decimal places
        const num = parseFloat(number);
        return Number.isInteger(num) ? num.toString() : num.toFixed(2);
    }

    // Map short rejection codes to their full names
    getRejectionTypeFullName(shortCode) {
        const rejectionTypeMap = {
            "F": "FLOW-(FL)",
            "BU": "BUBBLE-(BU) / BLISTER-(BL)",
            "CM": "CUTMARK-(CU)",
            "RIB": "RIB",
            "DL": "TOOL MARK",
            "BO": "BONDING FALUIRE",
            "UF": "UNDER FILL-( UF )",
            "FP": "FOREIGN PARTICLE-(FP)",
            "UC": "UNDER CURE-(UC)",
            "OC": "OVER CURE-(OC) /FAST CURE",
            "OT": "OVER TRIM",
            "MD": "MOULD DAMAGE",
            "BEND": "THK UNDERSIZ",
            "BL": "BUBBLE-(BU) / BLISTER-(BL)",
            "DP": "DIPRESSION-(DP)",
            "ID OS": "ID OVERSIZE",
            "OD US": "OD UNDERSIZ",
            "OD OS": "OD OVERSIZE",
            "PL CM": "PL CM",
            "DF": "DEFLASH-(DF)",
            "SD": "SURFACE DEFECT-(SD)"
        };
        
        return rejectionTypeMap[shortCode] || shortCode;
    }
    
    getRejectionTypeByColumnIndex(index) {
        // Map column indices to rejection types based on the CSV column headers
        const rejectionTypes = {
            0: "F", // Flow
            1: "BU", // Bubble
            2: "CM", // Cutmark
            3: "RIB", // Rib
            4: "DL", // Tool Mark/DL
            5: "BO", // Bonding Failure
            6: "UF", // Under Fill
            7: "FP", // Foreign Particle
            8: "UC", // Under Cure
            9: "OC", // Over Cure
            10: "OT", // Over Trim
            11: "MD", // Mould Damage
            12: "BEND", // Bend
            13: "BL", // Blister
            14: "DP", // Depression
            15: "ID OS", // ID Oversize
            16: "OD US", // OD Undersize
            17: "OD OS", // OD Oversize
            18: "PL CM", // PL CM
            19: "DF", // Deflash
            20: "SD" // Surface Defect
        };
        
        return rejectionTypes[index] || `Other Rejection (${index + 1})`;
    }

    resetGoogleSheetUI() {
        // Enable the URL input and fetch button
        this.wrapper.find('#gsheet_url').attr('disabled', false);
        this.wrapper.find('#fetch_gsheet_btn').html('<i class="fa fa-download mr-1"></i> Fetch Data').attr('disabled', false);
    }
}