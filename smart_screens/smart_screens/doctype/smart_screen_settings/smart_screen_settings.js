// Copyright (c) 2025, alphaworkz and contributors
// For license information, please see license.txt

frappe.ui.form.on("Smart Screen Settings", {
    refresh: function(frm) {
        // Set query for the location field in each row of the child table
        frm.fields_dict.sublot_location_mapping.grid.get_field("location").get_query = function() {
            return {
                filters: {
                    "is_your_company_address": 1,
                    "docstatus": 0
                }
            };
        };
    },
    
    // Also set the same filter during form load to ensure it's applied
    onload(frm) {
        frm.set_query('location', 'sublot_location_mapping', function() {
            return {
                doctype: "Address",
                filters: {
                    "is_your_company_address": 1,
                    "docstatus": 0
                }
            };
        });
    }
});

// Add filter at the child table level as well
frappe.ui.form.on("Sublot Location Mapping", {
    location: function(frm, cdt, cdn) {
        // This runs when the location field is changed
        console.log("Location field changed");
    },
    
    sublot_location_mapping_add: function(frm, cdt, cdn) {
        // Apply filter when a new row is added
        frm.set_query('location', 'sublot_location_mapping', function() {
            return {
                filters: {
                    "is_your_company_address": 1,
                    "docstatus": 0
                }
            };
        });
    }
});
