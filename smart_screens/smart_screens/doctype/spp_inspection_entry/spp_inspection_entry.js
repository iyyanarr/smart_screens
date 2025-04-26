// Copyright (c) 2025, alphaworkz and contributors
// For license information, please see license.txt

frappe.ui.form.on("SPP Inspection Entry", {
	// Call fetch_location_details when the form loads or refreshes
	onload: function(frm) {
		fetch_location_details(frm);
		bind_rejections(frm);
	},
	
	refresh: function(frm) {
		fetch_location_details(frm);
	},
	
	scan_inspector: function(frm) {
		// Get the value entered in scan_inspector field
		const inspectorValue = frm.doc.scan_inspector;
		
		 // Check if the value is empty
		if (!inspectorValue) return;

		// Log the data for debugging
		console.log("Scan Inspector Value:", inspectorValue);
		
		// Call the utility function for employee validation
		frappe.call({
			method: "smart_screens.smart_screens.utils.emp_validation.validate_employee_designation",
			args: {
				employee_code: inspectorValue
			},
			callback: function(response) {
				if (response.message && response.message.success) {
					// Employee validation successful
					console.log("Employee validation result:", response.message);
					
					// You can use the returned data if needed
					const employee = response.message.employee;
					const designation = response.message.designation;
					const allowedOperations = response.message.allowed_operations;
					
					// Display success message
					frappe.msgprint(__(`Employee ${employee.employee_name} validated successfully. 
					Designation: ${designation}
					Allowed Operations: ${allowedOperations.join(", ")}`));
					
					// Store employee details in the form
					frm.set_value("inspector_code", employee.name);
					frm.set_value("inspector_name", employee.employee_name);
					
				} else {
					// Employee validation failed
					const errorMessage = response.message ? response.message.message : "Invalid employee ID";
					frappe.msgprint(__(errorMessage));
					frm.set_value("scan_inspector", "");
				}
			},
			error: function(err) {
				console.error("Employee validation error:", err);
				frappe.msgprint(__("Error validating employee: " + err.message));
				frm.set_value("scan_inspector", "");
			}
		});
	},
	
	scan_production_lot: function(frm) {
		// Get the value entered in scan_production_lot field
		const lotValue = frm.doc.scan_production_lot;
		
		// Check if the value is empty
		if (!lotValue) return;
		
		// Log the data for debugging
		console.log("Scan Production Lot Value:", lotValue);
		
		// Get the current stage and warehouse values
		const stage = frm.doc.stage || "";
		const warehouse = frm.doc.warehouse || "";
		
		if (!warehouse) {
			frappe.msgprint(__("Please select a warehouse first"));
			frm.set_value("scan_production_lot", "");
			return;
		}
		
		// Call the utility function for lot validation
		frappe.call({
			method: "smart_screens.smart_screens.utils.lot_validation.sub_lot_validation",
			args: {
				sublot: lotValue,
				stage: stage,
				warehouse: warehouse
			},
			callback: function(response) {
				console.log("Lot validation response:", response);
				
				// Check if response has a message and if it's a successful response
				if (response.message && !response.message.error) {
					// Lot validation successful
					console.log("Lot validation result:", response.message);
					
					// Populate form fields with the returned data
					frm.set_value("product_ref_no", response.message.item_code);
					frm.set_value("warehouse", response.message.warehouse);
					frm.set_value("batch_no", response.message.batch_no);
					frm.set_value("total_inspected_qty", response.message.batch_quantity);
					frm.set_value("uom", response.message.uom);
					frm.set_value("lot_no", response.message.spp_batch_number);
					frm.set_value("spp_batch_number", response.message.spp_batch_number);
					
					// Store the stock entry reference if needed for later

					
					// Display success message with more details
					frappe.msgprint(__(`Lot validated successfully. 
					Item: ${response.message.item_code}
					Batch: ${response.message.batch_no}
					SPP Batch: ${response.message.spp_batch_number || 'N/A'}
					Available Qty: ${response.message.batch_quantity} ${response.message.uom}
					Warehouse: ${response.message.warehouse}`));
					
				} else {
					// Lot validation failed
					let errorMsg = "Invalid lot number";
					
					// If there's a specific error message from the server, use it
					if (response.message && response.message.error) {
						errorMsg = response.message.error;
					} else if (response.exc && response._server_messages) {
						// Try to parse server messages for better error information
						try {
							const serverMsgs = JSON.parse(response._server_messages);
							if (serverMsgs && serverMsgs.length > 0) {
								const parsedMsg = JSON.parse(serverMsgs[0]);
								errorMsg = parsedMsg.message || errorMsg;
							}
						} catch (e) {
							console.error("Error parsing server messages:", e);
							// If we can't parse, just use the raw exc message if available
							errorMsg = response.exc || errorMsg;
						}
					}
					
					// Check for specific error strings
					if (errorMsg.includes("No Repack Stock Entry found")) {
						errorMsg = `No Repack Stock Entry found for Lot Number: ${lotValue}`;
					}
					
					// Display the error message
					frappe.msgprint({
						title: __("Lot Validation Failed"),
						indicator: "red",
						message: __(errorMsg)
					});
					
					console.error("Lot validation error:", errorMsg);
					frm.set_value("scan_production_lot", "");
				}
			},
			error: function(err) {
				// Handle errors
				console.error("Lot validation error:", err);
				
				// Format a user-friendly error message
				let errorMsg = "Error validating lot";
				if (err && err.statusText) {
					errorMsg += ": " + err.statusText;
				} else if (err && err.message) {
					errorMsg += ": " + err.message;
				}
				
				// Display the error message
				frappe.msgprint({
					title: __("Validation Error"),
					indicator: "red",
					message: __(errorMsg)
				});
				
				frm.set_value("scan_production_lot", "");
			}
		});
	},
	
	bind_rejections: function(frm) {
		frm.addtional_rejections = [
			{"type_of_defect":"TOOL MARK"},
			{"type_of_defect":"BONDING FALUIRE"},
			{"type_of_defect":"THREAD"},
			{"type_of_defect":"OVER TRIM"},
			{"type_of_defect":"MOULD DAMAGE"},
			{"type_of_defect":"WOOD PARTICLE"},
			{"type_of_defect":"WASHER VISIBLE"},
			{"type_of_defect":"DISPERS PROBLEM"},
			{"type_of_defect":"THK UNDERSIZ"},
			{"type_of_defect":"THK OVERSIZE"},
			{"type_of_defect":"ID UNDERSIZ"},
			{"type_of_defect":"ID OVERSIZE"},
			{"type_of_defect":"OD UNDERSIZ"},
			{"type_of_defect":"OD OVERSIZE"},
			{"type_of_defect":"IMPRESSION MARK"},
			{"type_of_defect":"WELD LINE"},
			{"type_of_defect":"BEND"},
			{"type_of_defect":"PIN HOLE"},
			{"type_of_defect":"BACKRIND"},
			{"type_of_defect":"BONDING BUBBLE"},
			{"type_of_defect":"PARTING LINE CUTMARK"},
			{"type_of_defect":"MOULD RUST "},
			{"type_of_defect":"STAIN ISSUE "},
			{"type_of_defect":"STRETCH TEST "}
		];
	},
	
	'onload_post_render': function(frm) {
		if (frm.addtional_rejections) {
			let html = `<datalist id="suggestion_list">`;
			frm.addtional_rejections.map(res => {
				html += ` <option value="${res.type_of_defect}">${res.type_of_defect}</option>`;
			});
			html += `</datalist>`;
			frm.fields_dict.items.grid.wrapper.on('mouseenter click', 'input[data-fieldname="type_of_defect"]', function(e) {
				$(`input[data-fieldname="type_of_defect"]`).attr("list", "suggestion_list");
				$(`input[data-fieldname="type_of_defect"]`).html(html);
			});
		}
	},
	
	generate_defect_entry: function(frm, resp_type) {
		if (resp_type == "Inspector No") {
			if (!frm.doc.inspector_code || frm.doc.inspector_code == undefined) {
				frappe.validated = false;
				frappe.msgprint("Could not find <b>Inspector ID</b>.");
				return;
			}
		}
		else if (resp_type == "Lot No") {
			if (!frm.doc.product_ref_no || frm.doc.product_ref_no == undefined) {
				frappe.validated = false;
				frappe.msgprint("Product reference is missing.");
				return;
			}
			if (!frm.doc.lot_no || frm.doc.lot_no == undefined) {
				frappe.validated = false;
				frappe.msgprint("Could not find the lot number.");
				return;
			}
		}
		
		if (frm.doc.inspector_code && frm.doc.lot_no) {
			frm.doc.items = [];
			refresh_field('items');
			
			frm.defect__arry = [
				{"type_of_defect": "FLOW-(FL)"}, 
				{"type_of_defect": "BUBBLE-(BU) / BLISTER-(BL)"}, 
				{"type_of_defect": "CUTMARK-(CU)"},
				{"type_of_defect": "DEFLASH-(DF)"}, 
				{"type_of_defect": "RIB"}, 
				{"type_of_defect": "FOREIGN PARTICLE-(FP)"},
				{"type_of_defect": "UNDER FILL-( UF )"},
				{"type_of_defect": "DIPRESSION-(DP)"}, 
				{"type_of_defect": "UNDER CURE-(UC)"}, 
				{"type_of_defect": "SURFACE DEFECT-(SD)"},
				{"type_of_defect": "OVER CURE-(OC) /FAST CURE"},
				{"type_of_defect": "BURST / TEAR"}, 
				{"type_of_defect": "BLACK MARK"}
			];
			
			for (let i = 0; i < frm.defect__arry.length; i++) {
				frm.add_child("items", frm.defect__arry[i]);
			}
			refresh_field('items');
		}
	}
});

// Function to fetch location details based on user role
function fetch_location_details(frm) {
    // Show loading state in the html_location_details field
    frm.set_df_property('html_location_details', 'options', `
        <div class="alert alert-info">
            <i class="fa fa-spinner fa-spin"></i> Loading location details...
        </div>
    `);
    
    // Call the server method to get location mapping data
    frappe.call({
        method: "smart_screens.smart_screens.utils.emp_validation.get_location_by_role",
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
                                
                                // Update the html_location_details HTML field
                                frm.set_df_property('html_location_details', 'options', location_html);
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
                                
                                frm.set_df_property('html_location_details', 'options', location_html);
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
                            
                            frm.set_df_property('html_location_details', 'options', location_html);
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
                    
                    frm.set_df_property('html_location_details', 'options', location_html);
                }
            } else {
                // No location mappings found for user roles
                console.log("No location mappings found for user roles");
                
                frm.set_df_property('html_location_details', 'options', `
                    <div class="alert alert-warning">
                        <i class="fa fa-exclamation-triangle"></i> No location settings found for your user role. Please contact your administrator.
                    </div>
                `);
            }
        },
        error: function(err) {
            console.error("Location fetch error:", err);
            
            frm.set_df_property('html_location_details', 'options', `
                <div class="alert alert-danger">
                    <i class="fa fa-exclamation-circle"></i> Failed to load location details. Please refresh and try again.
                </div>
            `);
        }
    });
}

// Helper function to make it available at the form level
function bind_rejections(frm) {
	frm.events.bind_rejections(frm);
}

// Add handler for inspection entry item
frappe.ui.form.on('SPP Inspection Entry Item', {
	items_add: function(frm, cdt, cdn) {
		let row = locals[cdt][cdn];
		var grid_row = cur_frm.fields_dict['items'].grid.grid_rows_by_docname[row.name],
		field = frappe.utils.filter_dict(grid_row.docfields, { fieldname: "type_of_defect" })[0];
		field.fieldtype = "Data";
		field.read_only = 0;
	},
	
	type_of_defect: function(frm, cdt, cdn) {
		let row = locals[cdt][cdn];
		if(!row.type_of_defect) {
			row.rejected_qty = 0;
			refresh_field('items');
			frappe.msgprint("The <b>Rejection Qty</b> can't be present without <b>Type of Defect</b>!");
		}
	},
	
	rejected_qty: function(frm, cdt, cdn) {
		let row = locals[cdt][cdn];
		if(row.type_of_defect) {
			// Handle rejected quantity calculation
			// Add your logic here if needed
		} else {
			row.rejected_qty = 0;
			refresh_field('items');
			frappe.msgprint('Please enter <b>Rejection Type</b> before entering <b>Rejection Qty</b>!');
		}
	}
});
