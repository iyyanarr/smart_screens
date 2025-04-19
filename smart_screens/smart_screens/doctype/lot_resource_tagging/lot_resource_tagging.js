// Copyright (c) 2025, alphaworkz and contributors
// For license information, please see license.txt

frappe.ui.form.on("Lot Resource Tagging", {
    refresh: function(frm) {
        // Fetch location details for the user role and display in lot_location_details field
        fetch_location_details(frm);
        
        // Disable operation_type field initially
        frm.set_df_property('operation_type', 'read_only', 1);
        
        // Add input fields to the user_input_section HTML field - now only for lot number
        frm.set_df_property('user_input_section', 'options', `
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
                </style>
                
                <!-- Lot Number Input -->
                <div class="sublot-form-container">
                    <div class="sublot-form-row">
                        <div class="sublot-form-group">
                            <label>Scan Lot Number</label>
                            <input type="text" id="scan_lot_number" class="form-control" placeholder="Scan or enter lot number">
                        </div>
                    </div>
                    <div class="sublot-form-row">
                        <div class="sublot-form-group">
                            <button id="validate_lot_btn" class="btn btn-primary btn-block responsive-btn">
                                Validate Lot Number
                            </button>
                        </div>
                    </div>
                    <div id="lot_validation_message" class="help-box small"></div>
                    <!-- Add a section to display lot details after validation -->
                    <div id="lot_details_section" style="display: none; margin-top: 15px;" class="alert alert-success">
                        <h5><i class="fa fa-check-circle"></i> Lot Validated Successfully</h5>
                        <div id="lot_details_content" style="margin-top: 8px;"></div>
                    </div>
                </div>
            </div>
        `);
        
        // Add operator input to the validate_op_html field
        frm.set_df_property('validate_op_html', 'options', `
            <div class="validation-button-container" style="padding: 10px 0; width: 100%;">
                <!-- Operator Input -->
                <div class="sublot-form-container">
                    <div class="sublot-form-row">
                        <div class="sublot-form-group">
                            <label>Scan Operator ID</label>
                            <input type="text" id="scan_operator" class="form-control" placeholder="Scan or enter operator ID" disabled>
                        </div>
                    </div>
                    <div class="sublot-form-row">
                        <div class="sublot-form-group">
                            <button id="validate_operator_btn" class="btn btn-primary btn-block responsive-btn" disabled>
                                Validate Operator
                            </button>
                        </div>
                    </div>
                    <div id="operator_validation_message" class="help-box small"></div>
                </div>
            </div>
        `);

        // Add submit button to the submit_tag_html field (initially disabled)
        frm.set_df_property('submit_tag_html', 'options', `
            <div style="padding: 10px 0; width: 100%;">
                <button id="submit_tag_btn" class="btn btn-success btn-block responsive-btn" disabled>
                    <i class="fa fa-check"></i> Submit Tag
                </button>
                <div id="submit_tag_message" class="help-box small" style="margin-top:8px;"></div>
            </div>
        `);
        
        // Add event listeners after the elements are rendered
        setTimeout(() => {
            // Helper to enable/disable submit button
            function update_submit_btn_state() {
                const lot_valid = frm.doc.spp_batch_no && frm.doc.product_ref && frm.doc.batch_no;
                const emp_valid = frm.doc.operator_id && frm.doc.operator_name && frm.doc.designation;
                const btn = $(frm.fields_dict.submit_tag_html.wrapper).find('#submit_tag_btn');
                if (lot_valid && emp_valid) {
                    btn.prop('disabled', false);
                } else {
                    btn.prop('disabled', true);
                }
            }

            // Validate Lot Number button click handler - now using sub_lot_validation utility
            $(frm.fields_dict.user_input_section.wrapper).find('#validate_lot_btn').on('click', function() {
                const lotNumber = $(frm.fields_dict.user_input_section.wrapper).find('#scan_lot_number').val();
                const messageElement = $(frm.fields_dict.user_input_section.wrapper).find('#lot_validation_message');
                const detailsSection = $(frm.fields_dict.user_input_section.wrapper).find('#lot_details_section');
                const detailsContent = $(frm.fields_dict.user_input_section.wrapper).find('#lot_details_content');
                
                if (!lotNumber) {
                    messageElement.html("Please scan or enter a lot number")
                        .addClass("text-danger")
                        .removeClass("text-success text-muted");
                    detailsSection.hide();
                    return;
                }
                
                // Show loading message
                messageElement.html('<i class="fa fa-spinner fa-spin"></i> Validating lot number...')
                    .addClass("text-muted")
                    .removeClass("text-danger text-success");
                detailsSection.hide();
                
                // Get the current stage and warehouse values from location settings
                let stage = frm.doc.stage || "";
                let warehouse = frm.doc.warehouse || "";
                
                // Call sub_lot_validation utility to validate the lot
                frappe.call({
                    method: "smart_screens.smart_screens.utils.lot_validation.sub_lot_validation",
                    args: {
                        sublot: lotNumber,
                        stage: stage,
                        warehouse: warehouse
                    },
                    callback: function(response) {
                        if (response.message) {
                            const data = response.message;
                            
                            // Set values to the form
                            // frm.set_value("scan_lot_no", lotNumber);
                            frm.set_value("product_ref", data.item_code);
                            frm.set_value("batch_no", data.batch_no);
                            frm.set_value("available_qty", data.batch_quantity);
                            
                            // Set posting_date to today
                            frm.set_value("posting_date", frappe.datetime.get_today());
                            
                            // If warehouse was empty, set it from the response
                            if (!frm.doc.warehouse && data.warehouse) {
                                frm.set_value("warehouse", data.warehouse);
                            }
                            
                            // Show success message
                            messageElement.html("Lot validated.").addClass("text-success").removeClass("text-danger text-muted");
                            
                            // Set the scanned lot number value to doc.spp_batch_no
                            frm.set_value("spp_batch_no", lotNumber);
                            
                            // Show concise lot details (Ops section removed from display)
                            detailsContent.html(`
                                <div>
                                    <strong>Item:</strong> ${data.item_code} &nbsp; | &nbsp;
                                    <strong>Batch:</strong> ${data.batch_no} &nbsp; | &nbsp;
                                    <strong>Qty:</strong> ${data.batch_quantity}
                                </div>
                                <div>
                                    <strong>Warehouse:</strong> ${data.warehouse}
                                </div>
                                <div>
                                    <strong>Stock Entry:</strong> ${data.stock_entry}
                                </div>
                                <div>
                                    <strong>BOM:</strong> <span id="bom_no_short"></span>
                                </div>
                                <div>
                                    <strong>Parent:</strong> <span id="parent_item_short"></span>
                                </div>
                                <div style="margin-top:6px;">
                                    <em>Select an operation from "Operation Type".</em>
                                </div>
                            `);
                            detailsSection.show();
                            
                            // Enable operation_type field after lot validation
                            frm.set_df_property('operation_type', 'read_only', 0);
                            
                            // Enable scan operator input after lot validation
                            $(frm.fields_dict.validate_op_html.wrapper).find('#scan_operator').prop('disabled', false);
                            $(frm.fields_dict.validate_op_html.wrapper).find('#validate_operator_btn').prop('disabled', false);
                            
                            // Now proceed to get operations from BOM if needed
                            if (data.item_code) {
                                // Call our custom BOM validation function instead of nested client.get calls
                                frappe.call({
                                    method: "smart_screens.smart_screens.utils.bom_validation.get_boms_by_component_item",
                                    args: {
                                        item_code: data.item_code
                                    },
                                    callback: function(bom_response) {
                                        if (bom_response.message) {
                                            const component_data = bom_response.message.data;
                                            console.log("BOM data:", component_data);
                                            
                                            if (component_data.boms && component_data.boms.length > 0) {
                                                // Get the first BOM for display
                                                const firstBom = component_data.boms[0];
                                                
                                                // Store BOM number
                                                frm.set_value("bom_no", firstBom.bom_no || '');
                                                
                                                // Display BOM info
                                                detailsContent.find('#bom_no_short').text(firstBom.bom_no || 'N/A');
                                                detailsContent.find('#parent_item_short').text(`${firstBom.parent_item_code} - ${firstBom.parent_item_name}`);

                                                // --- Restore setting operations field in DocType ---
                                                if (firstBom.operations && firstBom.operations.length > 0) {
                                                    // If operations is a child table
                                                    if (frm.fields_dict.operations && frm.fields_dict.operations.grid) {
                                                        frm.clear_table("operations");
                                                        firstBom.operations.forEach(op => {
                                                            let row = frm.add_child("operations");
                                                            row.operation = op.operation;
                                                            row.workstation = op.workstation || "";
                                                            // Add other fields from op as needed
                                                        });
                                                        frm.refresh_field("operations");
                                                    } else {
                                                        // If operations is a multiline/text field
                                                        frm.set_value("operations", firstBom.operations.map(op => op.operation).join('\n'));
                                                    }
                                                } else {
                                                    // Clear operations field if no operations
                                                    if (frm.fields_dict.operations && frm.fields_dict.operations.grid) {
                                                        frm.clear_table("operations");
                                                        frm.refresh_field("operations");
                                                    } else {
                                                        frm.set_value("operations", "");
                                                    }
                                                }
                                                // --- End restore ---

                                                if (firstBom.operations && firstBom.operations.length > 0) {
                                                    const operationOptions = firstBom.operations.map(op => op.operation);
                                                    frm.set_df_property('operation_type', 'options', operationOptions.join('\n'));
                                                    frm.set_value('operation_type', '');
                                                    frm.doc.operations_data = JSON.stringify(firstBom.operations);
                                                    if (firstBom.operations[0].workstation) {
                                                        frm.set_value('workstation', firstBom.operations[0].workstation);
                                                    }
                                                } else {
                                                    frm.set_df_property('operation_type', 'options', '');
                                                }
                                            } else {
                                                detailsContent.find('#bom_no_short').text('N/A');
                                                detailsContent.find('#parent_item_short').text('');
                                                // Clear operations field if no BOMs
                                                if (frm.fields_dict.operations && frm.fields_dict.operations.grid) {
                                                    frm.clear_table("operations");
                                                    frm.refresh_field("operations");
                                                } else {
                                                    frm.set_value("operations", "");
                                                }
                                            }
                                        } else {
                                            detailsContent.find('#bom_no_short').text('N/A');
                                            detailsContent.find('#parent_item_short').text('');
                                            // Clear operations field on error
                                            if (frm.fields_dict.operations && frm.fields_dict.operations.grid) {
                                                frm.clear_table("operations");
                                                frm.refresh_field("operations");
                                            } else {
                                                frm.set_value("operations", "");
                                            }
                                        }
                                    },
                                    error: function(err) {
                                        console.error("Error fetching BOM details:", err);
                                        detailsContent.find('#bom_no_short').text('N/A');
                                        detailsContent.find('#parent_item_short').text('');
                                        // Clear operations field on error
                                        if (frm.fields_dict.operations && frm.fields_dict.operations.grid) {
                                            frm.clear_table("operations");
                                            frm.refresh_field("operations");
                                        } else {
                                            frm.set_value("operations", "");
                                        }
                                    }
                                });
                            }
                            update_submit_btn_state();
                        } else {
                            // Show error message
                            messageElement.html("Failed to validate lot number. No stock information found.")
                                .addClass("text-danger")
                                .removeClass("text-success text-muted");
                            detailsSection.hide();
                            update_submit_btn_state();
                        }
                    },
                    error: function(err) {
                        console.error("Error validating lot:", err);
                        
                        // Show error message
                        messageElement.html("Error validating lot number. Please try again.")
                            .addClass("text-danger")
                            .removeClass("text-success text-muted");
                        detailsSection.hide();
                        update_submit_btn_state();
                    }
                });
            });
            
            // Validate Operator button click handler - updated to use validate_op_html
            $(frm.fields_dict.validate_op_html.wrapper).find('#validate_operator_btn').on('click', function() {
                const operatorId = $(frm.fields_dict.validate_op_html.wrapper).find('#scan_operator').val();
                const messageElement = $(frm.fields_dict.validate_op_html.wrapper).find('#operator_validation_message');
                
                if (!operatorId) {
                    messageElement
                        .html("Please scan or enter operator ID")
                        .addClass("text-danger")
                        .removeClass("text-success text-muted");
                    return;
                }
                
                // Show loading message
                messageElement
                    .html('<i class="fa fa-spinner fa-spin"></i> Validating operator...')
                    .addClass("text-muted")
                    .removeClass("text-danger text-success");
                
                // Call the employee validation function
                frappe.call({
                    method: "smart_screens.smart_screens.utils.emp_validation.validate_employee_designation",
                    args: {
                        employee_code: operatorId
                    },
                    callback: function(response) {
                        if (response.message && response.message.success) {
                            const data = response.message;
                            
                            // Set value to the form field
                            frm.set_value("operator_id", operatorId);
                            frm.set_value("operator_name", data.employee.employee_name);
                            frm.set_value("designation", data.designation);
                            
                            // Filter operation_type options based on allowed operations
                            if (data.allowed_operations && data.allowed_operations.length > 0) {
                                // Get current options
                                const currentOptions = frm.fields_dict.operation_type.df.options;
                                let operationOptions = [];
                                
                                if (currentOptions) {
                                    // Filter the existing options to only show those allowed for this designation
                                    operationOptions = currentOptions.split('\n').filter(op => 
                                        data.allowed_operations.includes(op.trim())
                                    );
                                    
                                    // Update the operation_type field's options with filtered operations
                                    frm.set_df_property('operation_type', 'options', operationOptions.join('\n'));
                                    
                                    // Clear any existing value
                                    frm.set_value('operation_type', '');
                                }
                                
                                // Show success message with allowed operations
                                messageElement
                                    .html(`Operator validated: ${data.employee.employee_name} (${data.designation})<br>
                                          <small>Allowed operations: ${data.allowed_operations.join(', ')}</small>`)
                                    .addClass("text-success")
                                    .removeClass("text-danger text-muted");
                            } else {
                                // No allowed operations
                                messageElement
                                    .html(`Operator validated: ${data.employee.employee_name} (${data.designation})<br>
                                          <small class="text-danger">No allowed operations for this designation</small>`)
                                    .addClass("text-warning")
                                    .removeClass("text-danger text-success text-muted");
                            }
                            update_submit_btn_state();
                        } else {
                            // Validation failed
                            const errorMsg = response.message ? response.message.message : "Failed to validate operator";
                            messageElement
                                .html(errorMsg)
                                .addClass("text-danger")
                                .removeClass("text-success text-muted");
                            
                            // Clear any set operator values
                            frm.set_value("operator_name", "");
                            frm.set_value("designation", "");
                            update_submit_btn_state();
                        }
                    },
                    error: function(err) {
                        console.error("Error validating operator:", err);
                        
                        // Show error message
                        messageElement
                            .html("Error validating operator. Please try again.")
                            .addClass("text-danger")
                            .removeClass("text-success text-muted");
                        update_submit_btn_state();
                    }
                });
            });

            // Add event handler for submit button
            $(frm.fields_dict.submit_tag_html.wrapper).find('#submit_tag_btn').on('click', function() {
                const msgElem = $(frm.fields_dict.submit_tag_html.wrapper).find('#submit_tag_message');
                msgElem.html('<i class="fa fa-spinner fa-spin"></i> Submitting...').removeClass().addClass('text-muted');
                frm.save('Submit').then(() => {
                    msgElem.html('Tag submitted successfully!').removeClass().addClass('text-success');
                }).catch((err) => {
                    msgElem.html('Failed to submit. Please check required fields.').removeClass().addClass('text-danger');
                });
            });

            // Also update submit button state on form load (in case of draft reload)
            update_submit_btn_state();

        }, 500);
    },
    
    // When operation_type is selected, update the workstation from stored operations data
    operation_type: function(frm) {
        if (frm.doc.operations_data && frm.doc.operation_type) {
            try {
                const operations = JSON.parse(frm.doc.operations_data);
                const selectedOperation = operations.find(op => op.operation === frm.doc.operation_type);
                
                if (selectedOperation && selectedOperation.workstation) {
                    frm.set_value('workstation', selectedOperation.workstation);
                }
            } catch (e) {
                console.error("Error parsing operations data:", e);
            }
        }
    }
});

// Function to fetch location details from Smart Screen Settings based on user role
function fetch_location_details(frm) {
    // Show loading state in the lot_location_details field
    frm.set_df_property('lot_location_details', 'options', `
        <div class="alert alert-info">
            <i class="fa fa-spinner fa-spin"></i> Loading location details...
        </div>
    `);
    
    // Call the server method to get location mapping data
    frappe.call({
        method: "smart_screens.smart_screens.doctype.lot_resource_tagging.lot_resource_tagging.get_location_by_role",
        args: {
            user: frappe.session.user
        },
        callback: function(response) {
            // Debug: Log the response to see its structure
            console.log("Location response:", response);
            
            if (response.message && response.message.length > 0) {
                // User has role-based location mappings
                const locationMapping = response.message[0]; // Use first matching mapping
                console.log("Location mapping:", locationMapping);
                
                // Set the warehouse and stage values in the form
                frm.set_value("warehouse", locationMapping.source_warehouse || "");
                frm.set_value("stage", locationMapping.stage || "");
                
                // Get the address details for the location
                if (locationMapping.location) {
                    frappe.call({
                        method: "frappe.client.get",
                        args: {
                            doctype: "Address",
                            name: locationMapping.location
                        },
                        callback: function(addr_r) {
                            console.log("Address response:", addr_r);
                            
                            if (addr_r.message) {
                                const address = addr_r.message;
                                
                                // Build HTML for location details
                                const location_html = `
                                    <div class="alert alert-warning">
                                        <i class="fa fa-check-circle"></i> Location settings loaded successfully!
                                        <div style="margin-top: 10px;">
                                            <div><strong>Location:</strong> ${address.address_title || address.name}</div>
                                            <div><strong>Stage:</strong> ${locationMapping.stage || 'Not specified'}</div>
                                            <div><strong>Warehouse:</strong> ${locationMapping.source_warehouse || 'Not specified'}</div>
                                            <div><strong>Role:</strong> ${locationMapping.role || 'Not specified'}</div>
                                        </div>
                                    </div>
                                `;
                                
                                // Update the lot_location_details HTML field
                                frm.set_df_property('lot_location_details', 'options', location_html);
                            } else {
                                // Address not found, but still display location info
                                const location_html = `
                                    <div class="alert alert-warning">
                                        <i class="fa fa-info-circle"></i> Location settings loaded!
                                        <div style="margin-top: 10px;">
                                            <div><strong>Location ID:</strong> ${locationMapping.location || 'Not specified'}</div>
                                            <div><strong>Stage:</strong> ${locationMapping.stage || 'Not specified'}</div>
                                            <div><strong>Warehouse:</strong> ${locationMapping.source_warehouse || 'Not specified'}</div>
                                            <div><strong>Role:</strong> ${locationMapping.role || 'Not specified'}</div>
                                        </div>
                                    </div>
                                `;
                                
                                frm.set_df_property('lot_location_details', 'options', location_html);
                            }
                        },
                        error: function(err) {
                            console.error("Address fetch error:", err);
                            
                            // Display location info without address details
                            const location_html = `
                                <div class="alert alert-warning">
                                    <i class="fa fa-exclamation-triangle"></i> Location settings loaded (address details unavailable)
                                    <div style="margin-top: 10px;">
                                        <div><strong>Stage:</strong> ${locationMapping.stage || 'Not specified'}</div>
                                        <div><strong>Warehouse:</strong> ${locationMapping.source_warehouse || 'Not specified'}</div>
                                        <div><strong>Role:</strong> ${locationMapping.role || 'Not specified'}</div>
                                    </div>
                                </div>
                            `;
                            
                            frm.set_df_property('lot_location_details', 'options', location_html);
                        }
                    });
                } else {
                    // No location specified, just show the other details
                    const location_html = `
                        <div class="alert alert-warning">
                            <i class="fa fa-info-circle"></i> Role-based settings loaded!
                            <div style="margin-top: 10px;">
                                <div><strong>Stage:</strong> ${locationMapping.stage || 'Not specified'}</div>
                                <div><strong>Warehouse:</strong> ${locationMapping.source_warehouse || 'Not specified'}</div>
                                <div><strong>Role:</strong> ${locationMapping.role || 'Not specified'}</div>
                            </div>
                        </div>
                    `;
                    
                    frm.set_df_property('lot_location_details', 'options', location_html);
                }
            } else {
                // No location mappings found for user roles
                console.log("No location mappings found for user roles");
                
                frm.set_df_property('lot_location_details', 'options', `
                    <div class="alert alert-warning">
                        <i class="fa fa-exclamation-triangle"></i> No location settings found for your user role. Please contact your administrator.
                    </div>
                `);
            }
        },
        error: function(err) {
            console.error("Location fetch error:", err);
            
            frm.set_df_property('lot_location_details', 'options', `
                <div class="alert alert-danger">
                    <i class="fa fa-exclamation-circle"></i> Failed to load location details. Please refresh and try again.
                </div>
            `);
        }
    });
}
