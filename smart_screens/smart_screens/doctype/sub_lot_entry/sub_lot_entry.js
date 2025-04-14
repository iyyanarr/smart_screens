// Copyright (c) 2025, alphaworkz and contributors
// For license information, please see license.txt

frappe.ui.form.on("Sub Lot Entry", {
    refresh: function (frm) {
        // Fetch location details from Smart Screen Settings based on user role
        fetch_location_details_by_role(frm);
        
        // Initially hide the UOM field until needed
        frm.toggle_display('uom', false);
        
        // Add content to the html_get_lot_validation field - big button with responsive styling
        frm.set_df_property('html_get_lot_validation', 'options', `
            <div class="validation-button-container" style="padding: 10px 0; width: 100%;">
                <style>
                    .responsive-btn {
                        height: auto !important;
                        min-height: 50px;
                        font-size: 16px; 
                        font-weight: bold;
                        white-space: normal;
                        word-wrap: break-word;
                        padding: 8px 12px;
                        width: 100%;
                        max-width: 100%;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                    }
                    
                    @media (max-width: 767px) {
                        .responsive-btn {
                            font-size: 14px;
                            min-height: 40px;
                            padding: 6px 8px;
                        }
                    }
                    
                    .sublot-form-container {
                        background: #f8f8f8;
                        border-radius: 4px;
                        padding: 15px;
                        margin-bottom: 10px;
                    }
                    
                    .sublot-form-row {
                        display: flex;
                        flex-wrap: wrap;
                        margin-bottom: 10px;
                    }
                    
                    .sublot-form-group {
                        flex: 1;
                        padding: 0 5px;
                        min-width: 150px;
                    }
                    
                    .sublot-form-group label {
                        font-weight: 600;
                        margin-bottom: 5px;
                        display: block;
                    }
                    
                    .sublot-form-group select,
                    .sublot-form-group input {
                        width: 100%;
                        padding: 6px 8px;
                        border: 1px solid #ddd;
                        border-radius: 4px;
                    }
                    
                    .location-detail-card {
                        border: 1px solid #ddd;
                        border-radius: 4px;
                        padding: 10px;
                        margin-bottom: 10px;
                        background-color: #f9f9f9;
                    }
                    
                    .location-detail-title {
                        font-weight: bold;
                        margin-bottom: 5px;
                        font-size: 16px;
                        color: #1a73e8;
                    }
                    
                    .location-detail-info {
                        margin-bottom: 3px;
                    }
                </style>
                <button class="btn btn-primary btn-block get-validation-btn responsive-btn">
                    Get Stock Information
                </button>
            </div>
        `);
        
        // Initialize the html_create_sublot field to be empty
        frm.set_df_property('html_create_sublot', 'options', '');
        
        // Add click handler for the big button
        $(frm.fields_dict.html_get_lot_validation.wrapper).find('.get-validation-btn').on('click', function() {
            if (frm.doc.sslnscaned_sub_lot_number && frm.doc.stage && frm.doc.source_warehouse) {
                // Show processing status in the html_lot_status field
                frm.set_df_property('html_lot_status', 'options', `
                    <div class="alert alert-info">
                        <i class="fa fa-spinner fa-spin"></i> Fetching stock information...
                    </div>
                `);
                
                // Hide the create sub lot button while processing
                frm.set_df_property('html_create_sublot', 'options', '');
                
                // Hide the UOM field while processing
                frm.toggle_display('uom', false);
                
                frappe.call({
                    method: "smart_screens.smart_screens.utils.lot_validation.Lot_validation",
                    args: {
                        mixed_barcode: frm.doc.sslnscaned_sub_lot_number,
                        stage: frm.doc.stage,
                        warehouse: frm.doc.source_warehouse
                    },
                    callback: function (response) {
                        if (response.message) {
                            const data = response.message;
                            
                            // Set the values directly to the form fields
                            frm.set_value("item_code", data.item_code);
                            frm.set_value("item_group", frm.doc.stage); // Assuming stage corresponds to item_group
                            frm.set_value("batch", data.batch_no);
                            frm.set_value("batch_qty", data.batch_quantity);
                            
                            // Show success message in html_lot_status
                            frm.set_df_property('html_lot_status', 'options', `
                                <div class="alert alert-success">
                                    <i class="fa fa-check-circle"></i> Stock information fetched successfully!
                                    <div style="margin-top: 10px;">
                                        <div><strong>Item:</strong> ${data.item_code}</div>
                                        <div><strong>Batch:</strong> ${data.batch_no}</div>
                                        <div><strong>Quantity:</strong> ${data.batch_quantity}</div>
                                        <div><strong>Warehouse:</strong> ${data.warehouse}</div>
                                    </div>
                                </div>
                            `);
                            
                            // Fetch UOM details for the item using our utility function
                            frappe.call({
                                method: "smart_screens.smart_screens.utils.uom_convertion.get_uom_details",
                                args: {
                                    item_code: data.item_code
                                },
                                callback: function(uom_response) {
                                    let uom_options = [];
                                    
                                    if (uom_response.message) {
                                        // Add default UOM as the first option
                                        const default_uom = uom_response.message.default_uom;
                                        uom_options.push(default_uom);
                                        
                                        // Add any conversion UOMs
                                        if (uom_response.message.conversion_factors && uom_response.message.conversion_factors.length > 0) {
                                            uom_response.message.conversion_factors.forEach(function(uom_item) {
                                                if (uom_item.uom !== default_uom) {
                                                    uom_options.push(uom_item.uom);
                                                }
                                            });
                                        }
                                        
                                        // Set options for the UOM field
                                        frm.set_df_property('uom', 'options', uom_options);
                                        
                                        // Set the default UOM value
                                        frm.set_value("uom", default_uom);
                                    } else {
                                        // Fallback to default UOM from stock info if UOM details fetch fails
                                        const default_uom = data.uom || "Nos";
                                        frm.set_df_property('uom', 'options', [default_uom]);
                                        frm.set_value("uom", default_uom);
                                    }
                                    
                                    // Show the UOM field now that we have data
                                    frm.toggle_display('uom', true);
                                    
                                    // Show just the Create Sub Lot button in the html_create_sublot field
                                    frm.set_df_property('html_create_sublot', 'options', `
                                        <div class="sublot-form-container">
                                            <div class="sublot-form-row">
                                                <div style="flex: 3; padding-right: 5px;">
                                                    <button class="btn btn-primary btn-block create-sublot-btn responsive-btn" id="create-sublot-btn">
                                                        Create Sub Lot
                                                    </button>
                                                </div>
                                                <div style="flex: 2;">
                                                    <button class="btn btn-default btn-block clear-fields-btn responsive-btn">
                                                        <i class="fa fa-refresh"></i> Clear
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    `);
                                    
                                    // Add click handler for the Create Sub Lot button
                                    $(frm.fields_dict.html_create_sublot.wrapper).find('.create-sublot-btn').on('click', function() {
                                        // Check if user has entered a sublot_qty
                                        if (!frm.doc.sublot_qty) {
                                            frappe.msgprint("Please enter a quantity in the 'Sublot Qty' field before creating a sub lot.");
                                            return;
                                        }
                                        
                                        // Disable the button to prevent multiple submissions
                                        const createBtn = $(this);
                                        createBtn.prop('disabled', true);
                                        createBtn.html('<i class="fa fa-spinner fa-spin"></i> Processing...');
                                        
                                        // Trigger the create_sublot action
                                        frm.trigger('create_sublot');
                                    });
                                    
                                    // Add click handler for the Clear Fields button
                                    $(frm.fields_dict.html_create_sublot.wrapper).find('.clear-fields-btn').on('click', function() {
                                        // Clear form fields
                                        clear_form_fields(frm);
                                    });
                                },
                                error: function(err) {
                                    // Use just the default UOM for the field
                                    const default_uom = data.uom || "Nos";
                                    
                                    // Set options for the UOM field
                                    frm.set_df_property('uom', 'options', [default_uom]);
                                    frm.set_value("uom", default_uom);
                                    
                                    // Show the UOM field
                                    frm.toggle_display('uom', true);
                                    
                                    // Show just the Create Sub Lot button
                                    frm.set_df_property('html_create_sublot', 'options', `
                                        <div class="sublot-form-container">
                                            <div class="sublot-form-row">
                                                <div style="flex: 3; padding-right: 5px;">
                                                    <button class="btn btn-primary btn-block create-sublot-btn responsive-btn" id="create-sublot-btn">
                                                        Create Sub Lot
                                                    </button>
                                                </div>
                                                <div style="flex: 2;">
                                                    <button class="btn btn-default btn-block clear-fields-btn responsive-btn">
                                                        <i class="fa fa-refresh"></i> Clear
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    `);
                                    
                                    // Add click handler for the Create Sub Lot button
                                    $(frm.fields_dict.html_create_sublot.wrapper).find('.create-sublot-btn').on('click', function() {
                                        // Check if user has entered a sublot_qty
                                        if (!frm.doc.sublot_qty) {
                                            frappe.msgprint("Please enter a quantity in the 'Sublot Qty' field before creating a sub lot.");
                                            return;
                                        }
                                        
                                        // Disable the button to prevent multiple submissions
                                        const createBtn = $(this);
                                        createBtn.prop('disabled', true);
                                        createBtn.html('<i class="fa fa-spinner fa-spin"></i> Processing...');
                                        
                                        // Trigger the create_sublot action
                                        frm.trigger('create_sublot');
                                    });
                                    
                                    // Add click handler for the Clear Fields button
                                    $(frm.fields_dict.html_create_sublot.wrapper).find('.clear-fields-btn').on('click', function() {
                                        // Clear form fields
                                        clear_form_fields(frm);
                                    });
                                }
                            });
                        } else {
                            // Show error message in html_lot_status
                            frm.set_df_property('html_lot_status', 'options', `
                                <div class="alert alert-danger">
                                    <i class="fa fa-exclamation-triangle"></i> No stock information found.
                                </div>
                            `);
                            
                            // Hide the create sub lot button
                            frm.set_df_property('html_create_sublot', 'options', '');
                            
                            // Hide the UOM field
                            frm.toggle_display('uom', false);
                        }
                    },
                    error: function (error) {
                        // Show error message in html_lot_status
                        frm.set_df_property('html_lot_status', 'options', `
                            <div class="alert alert-danger">
                                <i class="fa fa-exclamation-circle"></i> Failed to fetch stock information. Please check the inputs.
                            </div>
                        `);
                        
                        // Hide the create sub lot button
                        frm.set_df_property('html_create_sublot', 'options', '');
                        
                        // Hide the UOM field
                        frm.toggle_display('uom', false);
                    }
                });
            } else {
                // Show warning message in html_lot_status
                frm.set_df_property('html_lot_status', 'options', `
                    <div class="alert alert-warning">
                        <i class="fa fa-exclamation-triangle"></i> Please ensure Mixed Barcode, Stage, and Warehouse are filled before fetching stock information.
                    </div>
                `);
                
                // Hide the create sub lot button
                frm.set_df_property('html_create_sublot', 'options', '');
            }
        });
    },
    
    // Handler for the create_sublot function
    create_sublot: function(frm) {
        if (frm.doc.batch && frm.doc.batch_qty && frm.doc.source_warehouse && frm.doc.target_warehouse && frm.doc.sublot_qty) {
            // Show processing indicator
            frappe.show_alert({ message: "Creating sub lot...", indicator: "blue" });
            
            // Update status in html_lot_status with progress bar
            frm.set_df_property('html_lot_status', 'options', `
                <div class="alert alert-info">
                    <i class="fa fa-spinner fa-spin"></i> Creating sub lot...
                    <div class="progress progress-bar-primary" style="height: 8px; margin-top: 10px;">
                        <div class="progress-bar" role="progressbar" aria-valuenow="0" 
                            aria-valuemin="0" aria-valuemax="100" style="width: 0%">
                        </div>
                    </div>
                    <div class="progress-message" style="font-size: 11px; margin-top: 5px; color: #6c7680;">
                        Processing...
                    </div>
                </div>
            `);
            
            // Set up a progress handler
            frappe.realtime.on('progress', function(data) {
                if (data.title === 'Generating Sub Lot') {
                    // Update progress bar
                    const progressBar = $(frm.fields_dict.html_lot_status.wrapper).find('.progress-bar');
                    const progressMessage = $(frm.fields_dict.html_lot_status.wrapper).find('.progress-message');
                    
                    progressBar.css('width', `${data.percent}%`);
                    progressBar.attr('aria-valuenow', data.percent);
                    progressMessage.text(data.description || 'Processing...');
                }
            });
            
            frappe.call({
                method: "smart_screens.smart_screens.utils.generate_sublot.generate_sublot",
                args: {
                    batch_number: frm.doc.batch,
                    qty: frm.doc.sublot_qty,
                    source_warehouse: frm.doc.source_warehouse,
                    target_warehouse: frm.doc.target_warehouse,
                    uom: frm.doc.uom
                },
                callback: function (response) {
                    // Unsubscribe from progress updates
                    frappe.realtime.off('progress');
                    
                    if (response.message && response.message.status === "success") {
                        const data = response.message;
                        
                        // Set form fields with the returned data
                        frm.set_value("sublot_batch", data.new_batch_number);
                        frm.set_value("sublot_number", data.sub_lot_number);
                        // Set barcode field to the sublot_batch value instead of barcode_image
                        frm.set_value("barcode", data.new_batch_number);
                        frm.set_value("stockentry_ref", data.stock_entry_name);
                        
                        // Set final_sublot_qty from the actual processed quantity
                        if (data.processed_qty) {
                            frm.set_value("final_sublot_qty", data.processed_qty);
                        }
                        
                        // Remove timing HTML - no longer showing performance details
                        
                        // Update status in html_lot_status
                        frm.set_df_property('html_lot_status', 'options', `
                            <div class="alert alert-success">
                                <i class="fa fa-check-circle"></i> Sub Lot created successfully!
                                <div style="margin-top: 10px;">
                                    <div><strong>Sub Lot Number:</strong> ${data.sub_lot_number}</div>
                                    <div><strong>Batch:</strong> ${data.new_batch_number}</div>
                                    <div><strong>Quantity:</strong> ${data.processed_qty}</div>
                                    <div><strong>Stock Entry:</strong> ${data.stock_entry_name}</div>
                                </div>
                            </div>
                        `);
                        
                        // Hide the create sub lot form after successful creation
                        frm.set_df_property('html_create_sublot', 'options', '');
                        frm.toggle_display('uom', false);
                        
                        // Save and submit the document without prompts
                        frm.save()
                            .then(() => frm.submit())
                            .then(() => {
                                frappe.show_alert({
                                    message: "Sub Lot Entry submitted successfully!",
                                    indicator: "green"
                                });
                                
                                // Refresh the page after a short delay
                                setTimeout(() => {
                                    location.reload();
                                }, 1500);
                            });
                    } else {
                        // If response doesn't indicate success
                        frm.set_df_property('html_lot_status', 'options', `
                            <div class="alert alert-warning">
                                <i class="fa fa-exclamation-triangle"></i> Sub Lot was created but with some issues. Please check the system.
                            </div>
                        `);
                        
                        // Re-enable the create button in case of issues
                        re_enable_create_button(frm);
                    }
                },
                error: function (error) {
                    // Unsubscribe from progress updates
                    frappe.realtime.off('progress');
                    
                    frm.set_df_property('html_lot_status', 'options', `
                        <div class="alert alert-danger">
                            <i class="fa fa-exclamation-circle"></i> Failed to create sub lot. Please check the inputs.
                        </div>
                    `);
                    
                    // Re-enable the create button on error
                    re_enable_create_button(frm);
                }
            });
        } else {
            frm.set_df_property('html_lot_status', 'options', `
                <div class="alert alert-warning">
                    <i class="fa fa-exclamation-triangle"></i> Please ensure Batch, Batch Quantity, Source Warehouse, Target Warehouse, and Sublot Qty are filled before creating a sub lot.
                </div>
            `);
            
            // Re-enable the create button if validation fails
            re_enable_create_button(frm);
        }
    }
});

// Function to fetch location details based on user role
function fetch_location_details_by_role(frm) {
    // Show loading state
    frm.set_df_property('location_details', 'options', `
        <div class="alert alert-info">
            <i class="fa fa-spinner fa-spin"></i> Loading location details...
        </div>
    `);
    
    frappe.call({
        method: "smart_screens.smart_screens.doctype.sub_lot_entry.sub_lot_entry.get_location_by_role",
        args: {
            user: frappe.session.user
        },
        callback: function(response) {
            if (response.message && response.message.length > 0) {
                // User has role-based location mappings
                const locationMapping = response.message[0]; // Use first matching mapping
                
                // Set values from mapping to form fields
                frm.set_value("source_warehouse", locationMapping.source_warehouse);
                frm.set_value("target_warehouse", locationMapping.target_warehouse);
                if (locationMapping.stage) {
                    frm.set_value("stage", locationMapping.stage);
                }
                
                // Get the address details
                frappe.call({
                    method: "frappe.client.get",
                    args: {
                        doctype: "Address",
                        name: locationMapping.location
                    },
                    callback: function(addr_r) {
                        if (addr_r.message) {
                            const address = addr_r.message;
                            
                            // Build HTML using orange background (alert-warning class gives orange/amber color)
                            const location_html = `
                                <div class="alert alert-warning">
                                    <i class="fa fa-check-circle"></i> Location settings loaded successfully!
                                    <div style="margin-top: 10px;">
                                        <div><strong>Location:</strong> ${address.address_title}</div>
                                        <div><strong>Stage:</strong> ${locationMapping.stage || 'Not specified'}</div>
                                        <div><strong>Transaction Type:</strong> ${locationMapping.transaction_type || 'Not specified'}</div>
                                    </div>
                                </div>
                            `;
                            
                            // Update the HTML field
                            frm.set_df_property('location_details', 'options', location_html);
                        } else {
                            frm.set_df_property('location_details', 'options', `
                                <div class="alert alert-warning">
                                    <i class="fa fa-exclamation-triangle"></i> Location address details not found.
                                </div>
                            `);
                        }
                    },
                    error: function() {
                        frm.set_df_property('location_details', 'options', `
                            <div class="alert alert-danger">
                                <i class="fa fa-exclamation-circle"></i> Failed to load address details.
                            </div>
                        `);
                    }
                });
            } else {
                // No location mappings found for user roles
                frm.set_df_property('location_details', 'options', `
                    <div class="alert alert-warning">
                        <i class="fa fa-exclamation-triangle"></i> No location settings found for your user role. Please contact your administrator.
                    </div>
                `);
            }
        },
        error: function() {
            frm.set_df_property('location_details', 'options', `
                <div class="alert alert-danger">
                    <i class="fa fa-exclamation-circle"></i> Failed to load location details. Please refresh and try again.
                </div>
            `);
        }
    });
}

// Function to clear form fields
function clear_form_fields(frm) {
    // Clear main input fields
    frm.set_value("sslnscaned_sub_lot_number", "");
    frm.set_value("sublot_qty", "");
    frm.set_value("sublot_number", "");
    frm.set_value("sublot_batch", "");
    frm.set_value("barcode", "");
    frm.set_value("stockentry_ref", "");
    frm.set_value("final_sublot_qty", "");
    
    // Clear item related fields
    frm.set_value("item_code", "");
    frm.set_value("item_group", "");
    frm.set_value("batch", "");
    frm.set_value("batch_qty", "");
    
    // Reset HTML fields
    frm.set_df_property('html_lot_status', 'options', '');
    frm.set_df_property('html_create_sublot', 'options', '');
    
    // Hide UOM field
    frm.toggle_display('uom', false);
    
    // Show message
    frappe.show_alert({
        message: "Form fields cleared",
        indicator: "blue"
    });
}

// Function to re-enable the create sublot button
function re_enable_create_button(frm) {
    // Recreate the buttons with enabled state
    frm.set_df_property('html_create_sublot', 'options', `
        <div class="sublot-form-container">
            <div class="sublot-form-row">
                <div style="flex: 3; padding-right: 5px;">
                    <button class="btn btn-primary btn-block create-sublot-btn responsive-btn" id="create-sublot-btn">
                        Create Sub Lot
                    </button>
                </div>
                <div style="flex: 2;">
                    <button class="btn btn-default btn-block clear-fields-btn responsive-btn">
                        <i class="fa fa-refresh"></i> Clear
                    </button>
                </div>
            </div>
        </div>
    `);
    
    // Re-attach click handlers
    $(frm.fields_dict.html_create_sublot.wrapper).find('.create-sublot-btn').on('click', function() {
        if (!frm.doc.sublot_qty) {
            frappe.msgprint("Please enter a quantity in the 'Sublot Qty' field before creating a sub lot.");
            return;
        }
        
        // Disable the button to prevent multiple submissions
        const createBtn = $(this);
        createBtn.prop('disabled', true);
        createBtn.html('<i class="fa fa-spinner fa-spin"></i> Processing...');
        
        frm.trigger('create_sublot');
    });
    
    // Add click handler for the Clear Fields button
    $(frm.fields_dict.html_create_sublot.wrapper).find('.clear-fields-btn').on('click', function() {
        clear_form_fields(frm);
    });
}
