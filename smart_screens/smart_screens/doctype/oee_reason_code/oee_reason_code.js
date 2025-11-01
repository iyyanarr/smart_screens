// Copyright (c) 2025, Alphaworkz and contributors
// For license information, please see license.txt

frappe.ui.form.on('OEE Reason Code', {
    refresh: function(frm) {
        // Set color indicator based on priority
        if (frm.doc.priority) {
            set_priority_indicator(frm);
        }
        
        // Show usage statistics if available
        if (frm.doc.usage_count && frm.doc.usage_count > 0) {
            frm.add_custom_button(__('View Usage Analytics'), function() {
                show_usage_analytics(frm);
            });
        }
        
        // Add quick action to toggle active status
        if (!frm.is_new()) {
            if (frm.doc.is_active) {
                frm.add_custom_button(__('Deactivate'), function() {
                    toggle_active_status(frm, 0);
                }, __('Actions'));
            } else {
                frm.add_custom_button(__('Activate'), function() {
                    toggle_active_status(frm, 1);
                }, __('Actions'));
            }
        }
        
        // Show warning if code is inactive
        if (!frm.doc.is_active) {
            frm.dashboard.set_headline_alert(
                __('This reason code is inactive and will not appear in dropdown lists'),
                'orange'
            );
        }
    },
    
    priority: function(frm) {
        set_priority_indicator(frm);
    },
    
    reason_code: function(frm) {
        // Auto-convert to uppercase
        if (frm.doc.reason_code) {
            frm.set_value('reason_code', frm.doc.reason_code.toUpperCase());
        }
    },
    
    category: function(frm) {
        // Set default color based on category
        if (!frm.doc.color_code && frm.doc.category) {
            set_default_color_by_category(frm);
        }
    }
});

function set_priority_indicator(frm) {
    let priority = frm.doc.priority;
    let color = 'blue';
    let icon = '';
    
    switch(priority) {
        case 'Critical':
            color = 'red';
            icon = '🔴';
            break;
        case 'High':
            color = 'orange';
            icon = '🟠';
            break;
        case 'Medium':
            color = 'yellow';
            icon = '🟡';
            break;
        case 'Low':
            color = 'green';
            icon = '🟢';
            break;
    }
    
    frm.set_indicator_color(priority, color);
    
    // Show priority badge in form
    if (frm.doc.priority) {
        frm.page.set_indicator(icon + ' ' + priority, color);
    }
}

function set_default_color_by_category(frm) {
    let category = frm.doc.category;
    let default_colors = {
        'Machine': '#dc3545',      // Red
        'Material': '#ffc107',     // Yellow
        'Process': '#17a2b8',      // Cyan
        'Quality': '#e83e8c',      // Pink
        'Planning': '#6f42c1',     // Purple
        'Operator': '#fd7e14'      // Orange
    };
    
    if (default_colors[category]) {
        frm.set_value('color_code', default_colors[category]);
    }
}

function toggle_active_status(frm, status) {
    frappe.confirm(
        status ? 
            __('Are you sure you want to activate this reason code?') :
            __('Are you sure you want to deactivate this reason code? It will no longer appear in dropdown lists.'),
        function() {
            frm.set_value('is_active', status);
            frm.save();
        }
    );
}

function show_usage_analytics(frm) {
    let html = `
        <div class="usage-analytics">
            <h4>Usage Statistics</h4>
            <table class="table table-bordered">
                <tr>
                    <th>Metric</th>
                    <th>Value</th>
                </tr>
                <tr>
                    <td>Total Usage Count</td>
                    <td><strong>${frm.doc.usage_count || 0}</strong></td>
                </tr>
                <tr>
                    <td>Category</td>
                    <td>${frm.doc.category || 'N/A'}</td>
                </tr>
                <tr>
                    <td>Priority</td>
                    <td>${frm.doc.priority || 'N/A'}</td>
                </tr>
                <tr>
                    <td>Status</td>
                    <td>${frm.doc.is_active ? '<span class="text-success">Active</span>' : '<span class="text-danger">Inactive</span>'}</td>
                </tr>
            </table>
            <p class="text-muted">
                <small>Note: Usage count is automatically incremented when this reason code is used in CAR creation.</small>
            </p>
        </div>
    `;
    
    frappe.msgprint({
        title: __('Usage Analytics'),
        message: html,
        wide: true
    });
}

// List view customization
frappe.listview_settings['OEE Reason Code'] = {
    add_fields: ['is_active', 'category', 'priority', 'usage_count'],
    
    get_indicator: function(doc) {
        if (!doc.is_active) {
            return [__('Inactive'), 'gray', 'is_active,=,0'];
        }
        
        switch(doc.priority) {
            case 'Critical':
                return [__('Critical'), 'red', 'priority,=,Critical'];
            case 'High':
                return [__('High'), 'orange', 'priority,=,High'];
            case 'Medium':
                return [__('Medium'), 'yellow', 'priority,=,Medium'];
            case 'Low':
                return [__('Low'), 'green', 'priority,=,Low'];
            default:
                return [__('Active'), 'blue', 'is_active,=,1'];
        }
    },
    
    formatters: {
        reason_code: function(value, df, doc) {
            let color = doc.color_code || '#666';
            return `<span style="padding: 3px 8px; border-radius: 3px; background-color: ${color}20; border-left: 3px solid ${color}; font-weight: 600;">${value}</span>`;
        },
        
        usage_count: function(value) {
            if (value && value > 0) {
                return `<span class="badge badge-success">${value}</span>`;
            }
            return `<span class="badge badge-secondary">0</span>`;
        }
    },
    
    onload: function(listview) {
        // Add custom filter buttons
        listview.page.add_inner_button(__('Active Codes Only'), function() {
            listview.filter_area.add([[listview.doctype, 'is_active', '=', 1]]);
        });
        
        listview.page.add_inner_button(__('By Category'), function() {
            let d = new frappe.ui.Dialog({
                title: __('Filter by Category'),
                fields: [
                    {
                        fieldname: 'category',
                        fieldtype: 'Select',
                        label: __('Category'),
                        options: ['', 'Machine', 'Material', 'Process', 'Quality', 'Planning', 'Operator']
                    }
                ],
                primary_action_label: __('Apply Filter'),
                primary_action: function(values) {
                    if (values.category) {
                        listview.filter_area.add([[listview.doctype, 'category', '=', values.category]]);
                    }
                    d.hide();
                }
            });
            d.show();
        });
        
        listview.page.add_inner_button(__('Most Used'), function() {
            listview.sort_selector.set_value('usage_count', 'desc');
        });
    }
};
