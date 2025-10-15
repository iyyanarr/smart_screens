/**
 * Finishing Process Common Utilities
 * Shared utilities for all finishing process pages
 */

class FinishingCommon {
    /**
     * Add factory-friendly styles to the page
     */
    static addFactoryStyles() {
        if ($('style.factory-styles').length) return; // Already added
        
        $(`<style class="factory-styles">
            /* Factory Input Styles */
            .factory-input {
                height: 50px !important;
                font-size: 18px !important;
                font-weight: 500;
                border: 2px solid #d1d8dd;
            }
            
            .factory-input:focus {
                border-color: #2490ef;
                box-shadow: 0 0 0 0.2rem rgba(36, 144, 239, 0.25);
            }
            
            /* Factory Button Styles */
            .factory-btn {
                padding: 12px 20px !important;
                font-size: 18px !important;
                font-weight: 600;
                min-width: 180px;
                height: 50px;
                border-radius: 6px;
            }
            
            .factory-btn-validate {
                height: 50px !important;
                font-size: 16px !important;
                font-weight: 600;
                padding: 0 20px !important;
            }
            
            /* Factory Section Styles */
            .factory-section {
                background-color: #fff;
                border-radius: 10px;
                box-shadow: 0 4px 8px rgba(0,0,0,0.1);
                padding: 0;
                margin-bottom: 30px;
            }
            
            .factory-section-head {
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                color: white;
                padding: 20px 25px;
                font-size: 24px;
                font-weight: bold;
                border-radius: 10px 10px 0 0;
            }
            
            .section-body {
                padding: 30px 25px;
            }
            
            /* Factory Form Group */
            .factory-form-group {
                margin-bottom: 25px;
            }
            
            .factory-label {
                font-size: 16px;
                font-weight: 600;
                color: #2c3e50;
                margin-bottom: 10px;
                display: block;
            }
            
            /* Validation Result Styles */
            .factory-validation-result {
                margin-top: 10px;
                font-size: 15px;
            }
            
            .factory-validation-result .alert {
                padding: 12px 15px;
                margin-bottom: 0;
                font-weight: 500;
            }
            
            /* Factory Table Styles */
            .factory-table {
                font-size: 16px;
            }
            
            .factory-table thead th {
                background-color: #f8f9fa;
                font-weight: 600;
                padding: 15px;
                border-bottom: 2px solid #dee2e6;
            }
            
            .factory-table tbody td {
                padding: 12px 15px;
                vertical-align: middle;
            }
            
            /* Info Section Styles */
            .factory-info-row {
                display: flex;
                flex-wrap: wrap;
                gap: 20px;
            }
            
            .factory-info-section {
                flex: 1;
                min-width: 280px;
                background-color: #f8f9fa;
                padding: 15px;
                border-radius: 8px;
                border-left: 4px solid #667eea;
            }
            
            .factory-info-title {
                font-size: 16px;
                font-weight: 700;
                color: #495057;
                margin-bottom: 12px;
                text-transform: uppercase;
                letter-spacing: 0.5px;
            }
            
            .factory-info-content {
                font-size: 15px;
            }
            
            .factory-info-item {
                display: flex;
                justify-content: space-between;
                padding: 8px 0;
                border-bottom: 1px solid #dee2e6;
            }
            
            .factory-info-item:last-child {
                border-bottom: none;
            }
            
            .factory-info-label {
                font-weight: 600;
                color: #6c757d;
            }
            
            .factory-info-value {
                font-weight: 500;
                color: #212529;
                text-align: right;
            }
            
            /* Compact Info Styles */
            .factory-compact-info {
                font-size: 14px;
            }
            
            .factory-compact-row {
                display: flex;
                justify-content: space-between;
                padding: 6px 0;
            }
            
            .factory-compact-label {
                font-weight: 600;
                color: #6c757d;
            }
            
            .factory-compact-value {
                font-weight: 500;
                color: #212529;
            }
            
            /* Page Head Content */
            .page-head-content {
                background-color: #e3f2fd;
                padding: 15px 20px;
                border-radius: 8px;
                border-left: 4px solid #2196f3;
            }
            
            /* Responsive adjustments */
            @media (max-width: 768px) {
                .factory-btn {
                    min-width: 120px;
                    font-size: 16px !important;
                }
                
                .factory-section-head {
                    font-size: 20px;
                }
                
                .factory-info-row {
                    flex-direction: column;
                }
            }
        </style>`).appendTo(document.head);
    }
    
    /**
     * Show location selector dialog
     * @param {Object} page - Frappe page object
     * @param {Function} callback - Callback function with selected location data
     */
    static showLocationSelector(page, callback) {
        frappe.call({
            method: "smart_screens.smart_screens.utils.emp_validation.get_location_by_role",
            args: { user: frappe.session.user },
            callback: function(r) {
                if (r.message && r.message.length > 0) {
                    const locations = r.message;
                    
                    if (locations.length === 1) {
                        // Only one location, use it directly
                        const mappedData = FinishingCommon.mapLocationData(locations[0]);
                        callback(mappedData);
                        return;
                    }
                    
                    // Multiple locations, show dialog
                    FinishingCommon.createLocationDialog(locations, callback);
                } else {
                    frappe.msgprint({
                        title: __('No Location Access'),
                        message: __('No location mappings found for your user. Please contact administrator.'),
                        indicator: 'red'
                    });
                    callback({});
                }
            },
            error: function() {
                frappe.msgprint({
                    title: __('Error'),
                    message: __('Failed to fetch location data. Please try again.'),
                    indicator: 'red'
                });
                callback({});
            }
        });
    }
    
    /**
     * Create location selection dialog
     */
    static createLocationDialog(locations, callback) {
        const locationOptions = locations.map(loc => {
            return {
                label: `${loc.location} (${loc.role}) - ${loc.transaction_type || 'N/A'}`,
                value: JSON.stringify(loc)
            };
        });
        
        let dialog = new frappe.ui.Dialog({
            title: __('Select Working Location'),
            fields: [
                {
                    label: __('Select Location'),
                    fieldname: 'location',
                    fieldtype: 'Select',
                    options: locationOptions.map(opt => opt.label),
                    reqd: 1,
                    description: __('Choose the location where you will be working')
                },
                {
                    fieldtype: 'Section Break'
                },
                {
                    fieldtype: 'HTML',
                    options: `
                        <div class="text-muted">
                            <p><i class="fa fa-info-circle"></i> Your location determines:</p>
                            <ul>
                                <li>Default warehouses for operations</li>
                                <li>Production stage and workflow</li>
                                <li>Available operations and permissions</li>
                            </ul>
                        </div>
                    `
                }
            ],
            primary_action_label: __('Confirm'),
            primary_action: function(values) {
                const selectedIndex = locationOptions.findIndex(opt => opt.label === values.location);
                const selectedLocation = locations[selectedIndex];
                dialog.hide();
                
                const mappedData = FinishingCommon.mapLocationData(selectedLocation);
                callback(mappedData);
            },
            secondary_action_label: __('Use Default'),
            secondary_action: function() {
                dialog.hide();
                const mappedData = FinishingCommon.mapLocationData(locations[0]);
                callback(mappedData);
            }
        });
        
        dialog.show();
    }
    
    /**
     * Map location data to standardized format
     */
    static mapLocationData(locationData) {
        const mapped = { ...locationData };
        if (locationData.source_warehouse) {
            mapped.default_warehouse = locationData.source_warehouse;
        }
        return mapped;
    }
    
    /**
     * Validate lot number
     * @param {String} lotNumber - Lot number to validate
     * @param {Object} userSettings - User location settings
     * @param {Function} callback - Callback function (error, data)
     */
    static validateLot(lotNumber, userSettings, callback) {
        frappe.call({
            method: "smart_screens.smart_screens.utils.lot_validation.lot_validation",
            args: {
                mixed_barcode: lotNumber,
                stage: userSettings.stage || "",
                warehouse: userSettings.default_warehouse || ""
            },
            callback: (r) => {
                if (r.message && !r.message.error) {
                    callback(null, r.message);
                } else {
                    const errorMsg = r.message?.error || __("Lot validation failed");
                    callback(errorMsg, null);
                }
            },
            error: (r) => {
                callback(__("Server error during lot validation"), null);
            }
        });
    }
    
    /**
     * Validate employee
     * @param {String} employeeId - Employee ID to validate
     * @param {Function} callback - Callback function (error, data)
     */
    static validateEmployee(employeeId, callback) {
        frappe.call({
            method: "smart_screens.smart_screens.utils.emp_validation.validate_employee_designation",
            args: { employee_code: employeeId },
            callback: (r) => {
                if (r.message && r.message.success) {
                    callback(null, r.message);
                } else {
                    const errorMsg = r.message?.message || __("Employee validation failed");
                    callback(errorMsg, null);
                }
            },
            error: (r) => {
                callback(__("Server error during employee validation"), null);
            }
        });
    }
    
    /**
     * Fetch BOM details for an item
     * @param {String} itemCode - Item code
     * @param {Function} callback - Callback function (error, data)
     */
    static fetchBOM(itemCode, callback) {
        frappe.call({
            method: "smart_screens.smart_screens.utils.bom_validation.get_boms_by_component_item",
            args: { item_code: itemCode },
            callback: (r) => {
                if (r.message && r.message.success && r.message.data) {
                    callback(null, r.message.data[0] || null);
                } else {
                    callback(__("No BOM found for this item"), null);
                }
            },
            error: (r) => {
                callback(__("Failed to fetch BOM"), null);
            }
        });
    }
    
    /**
     * Create information section
     * @param {jQuery} wrapper - Wrapper element to append to
     * @param {Object} locationData - Location settings
     * @param {String} title - Section title
     */
    static createInfoSection(wrapper, locationData, title = "Process Information") {
        const infoCard = $(`
            <div class="location-info-card card mt-4">
                <div class="card-header bg-light">
                    <h5 class="mb-0">
                        <i class="fa fa-info-circle mr-2"></i>${title}
                    </h5>
                </div>
                <div class="card-body p-3">
                    <div class="factory-info-row">
                        <!-- Location Details -->
                        <div class="factory-info-section">
                            <div class="factory-info-title">Location Details</div>
                            <div class="factory-info-content">
                                <div class="factory-info-item">
                                    <span class="factory-info-label">Location:</span>
                                    <span class="factory-info-value">${locationData.location || 'N/A'}</span>
                                </div>
                                <div class="factory-info-item">
                                    <span class="factory-info-label">Role:</span>
                                    <span class="factory-info-value">${locationData.role || 'N/A'}</span>
                                </div>
                                <div class="factory-info-item">
                                    <span class="factory-info-label">Stage:</span>
                                    <span class="factory-info-value">${locationData.stage || 'N/A'}</span>
                                </div>
                            </div>
                        </div>
                        
                        <!-- Warehouse Details -->
                        <div class="factory-info-section">
                            <div class="factory-info-title">Warehouse Details</div>
                            <div class="factory-info-content">
                                <div class="factory-info-item">
                                    <span class="factory-info-label">Source:</span>
                                    <span class="factory-info-value">${locationData.source_warehouse || 'N/A'}</span>
                                </div>
                                <div class="factory-info-item">
                                    <span class="factory-info-label">Target:</span>
                                    <span class="factory-info-value">${locationData.target_warehouse || 'N/A'}</span>
                                </div>
                                <div class="factory-info-item">
                                    <span class="factory-info-label">Type:</span>
                                    <span class="factory-info-value">${locationData.transaction_type || 'N/A'}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `).appendTo(wrapper);
        
        return infoCard;
    }
}

// Make it available globally
window.FinishingCommon = FinishingCommon;
