// Copyright (c) 2025, alphaworkz and contributors
// For license information, please see license.txt

frappe.ui.form.on("Sub Lot Entry", {
    refresh: function (frm) {
        // Add the "Get Stock Info" button
        frm.add_custom_button("Get Stock Info", function () {
            if (frm.doc.sslnscaned_sub_lot_number && frm.doc.stage && frm.doc.source_warehouse) {
                frappe.show_alert({ message: "Fetching stock information...", indicator: "blue" }); // Show loading animation
                frappe.call({
                    method: "smart_screens.smart_screens.utils.lot_validation.Lot_validation",
                    args: {
                        mixed_barcode: frm.doc.sslnscaned_sub_lot_number,
                        stage: frm.doc.stage,
                        warehouse: frm.doc.source_warehouse
                    },
                    callback: function (response) {
                        if (response.message) {
                            // Display the result in a dialog
                            const data = response.message;
                            const dialog = new frappe.ui.Dialog({
                                title: "Stock Information",
                                fields: [
                                    {
                                        label: "Item Code",
                                        fieldname: "item_code",
                                        fieldtype: "Data",
                                        read_only: 1,
                                        default: data.item_code
                                    },
                                    {
                                        label: "Warehouse",
                                        fieldname: "warehouse",
                                        fieldtype: "Data",
                                        read_only: 1,
                                        default: data.warehouse
                                    },
                                    {
                                        label: "Batch No.",
                                        fieldname: "batch_no",
                                        fieldtype: "Data",
                                        read_only: 1,
                                        default: data.batch_no
                                    },
                                    {
                                        label: "Batch Quantity",
                                        fieldname: "batch_quantity",
                                        fieldtype: "Float",
                                        read_only: 1,
                                        default: data.batch_quantity
                                    }
                                ],
                                primary_action_label: "Set Values",
                                primary_action: function () {
                                    // Set the values to the form fields
                                    frm.set_value("item_code", dialog.get_value("item_code"));
                                    frm.set_value("item_group", frm.doc.stage); // Assuming stage corresponds to item_group
                                    frm.set_value("batch", dialog.get_value("batch_no"));
                                    frm.set_value("batch_qty", dialog.get_value("batch_quantity"));
                                    dialog.hide();
                                }
                            });
                            dialog.show();
                        }
                    },
                    error: function (error) {
                        frappe.msgprint("Failed to fetch stock information. Please check the inputs.");
                    }
                });
            } else {
                frappe.msgprint("Please ensure Mixed Barcode, Stage, and Warehouse are filled before fetching stock information.");
            }
        });
    },
    
    // Handler for the existing create_sublot button field
    create_sublot: function(frm) {
        if (frm.doc.batch && frm.doc.batch_qty && frm.doc.source_warehouse && frm.doc.target_warehouse) {
            frappe.show_alert({ message: "Creating sub lot...", indicator: "blue" }); // Show loading animation
            frappe.call({
                method: "smart_screens.smart_screens.utils.generate_sublot.generate_sublot",
                args: {
                    batch_number: frm.doc.batch,
                    qty: frm.doc.sublot_qty,
                    source_warehouse: frm.doc.source_warehouse,
                    target_warehouse: frm.doc.target_warehouse
                },
                callback: function (response) {
                    if (response.message && response.message.status === "success") {
                        const data = response.message;
                        
                        // Set form fields with the returned data
                        frm.set_value("sublot_batch", data.new_batch_number);
                        frm.set_value("sublot_number", data.sub_lot_number);
                        frm.set_value("barcode", data.barcode_image);
                        frm.set_value("stockentry_ref", data.stock_entry_name);
                        
                        frappe.show_alert({
                            message: "Sub Lot created successfully! Submitting form...",
                            indicator: "green"
                        });
                        
                        // Save and submit the document
                        frm.save().then(() => {
                            frm.savesubmit().then(() => {
                                frappe.msgprint({
                                    title: "Success",
                                    indicator: "green",
                                    message: `
                                        <p>Sub Lot Entry has been created and submitted successfully!</p>
                                        <ul>
                                            <li><strong>Sub Lot Number:</strong> ${data.sub_lot_number}</li>
                                            <li><strong>Batch:</strong> ${data.new_batch_number}</li>
                                            <li><strong>Stock Entry:</strong> ${data.stock_entry_name}</li>
                                        </ul>
                                    `
                                });
                            });
                        });
                    } else {
                        // If response doesn't indicate success
                        frappe.msgprint({
                            title: "Warning",
                            indicator: "yellow",
                            message: "Sub Lot was created but with some issues. Please check the system."
                        });
                    }
                },
                error: function (error) {
                    frappe.msgprint({
                        title: "Error",
                        indicator: "red",
                        message: "Failed to create sub lot. Please check the inputs."
                    });
                }
            });
        } else {
            frappe.msgprint("Please ensure Batch, Batch Quantity, Source Warehouse, and Target Warehouse are filled before creating a sub lot.");
        }
    }
});
