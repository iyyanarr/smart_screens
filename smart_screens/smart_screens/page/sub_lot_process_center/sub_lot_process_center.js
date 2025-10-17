/**
 * Sub-Lot Process Center - Unified Entry Point
 * Allows users to choose between comprehensive workflow or individual pages
 * WITHOUT modifying any existing code
 */

frappe.pages['sub-lot-process-center'].on_page_load = function(wrapper) {
    var page = frappe.ui.make_app_page({
        parent: wrapper,
        title: 'Sub-Lot Process Center',
        single_column: true
    });
    
    new SubLotProcessCenter(page);
};

class SubLotProcessCenter {
    constructor(page) {
        this.page = page;
        this.wrapper = $(page.wrapper);
        
        FinishingCommon.addFactoryStyles();
        this.make();
    }
    
    make() {
        this.wrapper.find('.page-content').empty();
        
        this.add_header_section();
        this.add_workflow_selection();
        this.add_process_status_section();
        this.add_recent_processes_section();
    }
    
    add_header_section() {
        $(`
            <div class="process-center-header text-center mb-5">
                <div class="hero-section p-4" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; border-radius: 15px;">
                    <h1 class="mb-3" style="font-size: 2.5rem; font-weight: 300;">
                        <i class="fa fa-industry mr-3"></i>Sub-Lot Process Center
                    </h1>
                    <p class="lead mb-0" style="font-size: 1.2rem; opacity: 0.9;">
                        Choose your preferred workflow approach - Complete automation or step-by-step control
                    </p>
                </div>
            </div>
        `).appendTo(this.wrapper.find('.page-content'));
    }
    
    add_workflow_selection() {
        this.workflow_section = $(`
            <div class="workflow-selection mb-5">
                <h3 class="text-center mb-4" style="color: #333; font-weight: 600;">Choose Your Workflow</h3>
                
                <div class="row">
                    <!-- Comprehensive Workflow -->
                    <div class="col-md-6 mb-4">
                        <div class="workflow-card h-100" style="border: 2px solid #e3f2fd; border-radius: 15px; transition: all 0.3s ease;">
                            <div class="card-body p-4">
                                <div class="text-center mb-3">
                                    <div class="workflow-icon mb-3" style="font-size: 3rem; color: #2196f3;">
                                        <i class="fa fa-magic"></i>
                                    </div>
                                    <h4 style="color: #1976d2; font-weight: 600;">Complete Automation</h4>
                                    <p class="text-muted">One-click comprehensive workflow</p>
                                </div>
                                
                                <div class="workflow-features mb-4">
                                    <div class="feature-item mb-2">
                                        <i class="fa fa-check text-success mr-2"></i>
                                        <span>13-14 documents created automatically</span>
                                    </div>
                                    <div class="feature-item mb-2">
                                        <i class="fa fa-check text-success mr-2"></i>
                                        <span>Full BOM operations workflow</span>
                                    </div>
                                    <div class="feature-item mb-2">
                                        <i class="fa fa-check text-success mr-2"></i>
                                        <span>Automatic stock entries & work orders</span>
                                    </div>
                                    <div class="feature-item mb-2">
                                        <i class="fa fa-check text-success mr-2"></i>
                                        <span>Real-time progress tracking</span>
                                    </div>
                                    <div class="feature-item mb-2">
                                        <i class="fa fa-check text-success mr-2"></i>
                                        <span>Complete audit trail</span>
                                    </div>
                                </div>
                                
                                <div class="text-center">
                                    <button class="btn btn-primary btn-lg px-4" id="start_comprehensive_btn" style="border-radius: 25px;">
                                        <i class="fa fa-rocket mr-2"></i>Start Complete Workflow
                                    </button>
                                </div>
                                
                                <div class="workflow-stats mt-3 text-center">
                                    <small class="text-muted">
                                        <i class="fa fa-clock-o mr-1"></i>Average time: 2-3 minutes
                                    </small>
                                </div>
                            </div>
                        </div>
                    </div>
                    
                    <!-- Individual Steps Workflow -->
                    <div class="col-md-6 mb-4">
                        <div class="workflow-card h-100" style="border: 2px solid #e8f5e8; border-radius: 15px; transition: all 0.3s ease;">
                            <div class="card-body p-4">
                                <div class="text-center mb-3">
                                    <div class="workflow-icon mb-3" style="font-size: 3rem; color: #4caf50;">
                                        <i class="fa fa-list-ol"></i>
                                    </div>
                                    <h4 style="color: #388e3c; font-weight: 600;">Step-by-Step Control</h4>
                                    <p class="text-muted">Individual page workflow</p>
                                </div>
                                
                                <div class="workflow-features mb-4">
                                    <div class="feature-item mb-2">
                                        <i class="fa fa-check text-success mr-2"></i>
                                        <span>Modular approach</span>
                                    </div>
                                    <div class="feature-item mb-2">
                                        <i class="fa fa-check text-success mr-2"></i>
                                        <span>Error recovery friendly</span>
                                    </div>
                                    <div class="feature-item mb-2">
                                        <i class="fa fa-check text-success mr-2"></i>
                                        <span>Training friendly</span>
                                    </div>
                                    <div class="feature-item mb-2">
                                        <i class="fa fa-check text-success mr-2"></i>
                                        <span>Flexible timing</span>
                                    </div>
                                    <div class="feature-item mb-2">
                                        <i class="fa fa-check text-success mr-2"></i>
                                        <span>Granular control</span>
                                    </div>
                                </div>
                                
                                <div class="individual-steps">
                                    <button class="btn btn-outline-success btn-block mb-2" id="goto_sublot_creation_btn">
                                        <i class="fa fa-cube mr-2"></i>1. Sub-Lot Creation
                                    </button>
                                    <button class="btn btn-outline-success btn-block mb-2" id="goto_resource_tagging_btn">
                                        <i class="fa fa-users mr-2"></i>2. Resource Tagging
                                    </button>
                                    <button class="btn btn-outline-success btn-block" id="goto_quality_inspection_btn">
                                        <i class="fa fa-search mr-2"></i>3. Quality Inspection
                                    </button>
                                </div>
                                
                                <div class="workflow-stats mt-3 text-center">
                                    <small class="text-muted">
                                        <i class="fa fa-clock-o mr-1"></i>Average time: 5-10 minutes
                                    </small>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `).appendTo(this.wrapper.find('.page-content'));
        
        this.attach_workflow_handlers();
    }
    
    add_process_status_section() {
        this.status_section = $(`
            <div class="process-status-section mb-5">
                <h4 class="mb-3" style="color: #333; font-weight: 600;">
                    <i class="fa fa-dashboard mr-2"></i>Process Status Dashboard
                </h4>
                
                <div class="row" id="status_cards_container">
                    <!-- Status cards will be populated here -->
                </div>
                
                <div class="row mt-4">
                    <div class="col-12">
                        <div class="card">
                            <div class="card-header bg-light">
                                <h5 class="mb-0">
                                    <i class="fa fa-search mr-2"></i>Process Lookup & Bridge
                                </h5>
                            </div>
                            <div class="card-body">
                                <div class="row">
                                    <div class="col-md-8">
                                        <div class="input-group">
                                            <input type="text" class="form-control" id="process_lookup_input" 
                                                   placeholder="Enter batch number, sub-lot number, or process ID to check status...">
                                            <div class="input-group-append">
                                                <button class="btn btn-info" id="lookup_process_btn">
                                                    <i class="fa fa-search mr-2"></i>Lookup
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                    <div class="col-md-4">
                                        <button class="btn btn-warning btn-block" id="bridge_processes_btn">
                                            <i class="fa fa-link mr-2"></i>Bridge Individual Steps
                                        </button>
                                    </div>
                                </div>
                                <div id="lookup_results" class="mt-3"></div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `).appendTo(this.wrapper.find('.page-content'));
        
        this.load_status_dashboard();
        this.attach_status_handlers();
    }
    
    add_recent_processes_section() {
        this.recent_section = $(`
            <div class="recent-processes-section">
                <h4 class="mb-3" style="color: #333; font-weight: 600;">
                    <i class="fa fa-history mr-2"></i>Recent Processes
                </h4>
                
                <div class="card">
                    <div class="card-body">
                        <div class="table-responsive">
                            <table class="table table-hover" id="recent_processes_table">
                                <thead class="thead-light">
                                    <tr>
                                        <th>Process ID</th>
                                        <th>Type</th>
                                        <th>Batch/Sub-Lot</th>
                                        <th>Status</th>
                                        <th>Created</th>
                                        <th>Actions</th>
                                    </tr>
                                </thead>
                                <tbody></tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
        `).appendTo(this.wrapper.find('.page-content'));
        
        this.load_recent_processes();
    }
    
    attach_workflow_handlers() {
        // Comprehensive workflow
        this.workflow_section.find('#start_comprehensive_btn').on('click', () => {
            frappe.set_route('sub-lot-process-page');
        });
        
        // Individual steps
        this.workflow_section.find('#goto_sublot_creation_btn').on('click', () => {
            frappe.set_route('sublot-creation');
        });
        
        this.workflow_section.find('#goto_resource_tagging_btn').on('click', () => {
            frappe.set_route('resource-tagging');
        });
        
        this.workflow_section.find('#goto_quality_inspection_btn').on('click', () => {
            frappe.set_route('quality-inspection-entry');
        });
        
        // Add hover effects
        this.workflow_section.find('.workflow-card').hover(
            function() {
                $(this).css('transform', 'translateY(-5px)').css('box-shadow', '0 10px 25px rgba(0,0,0,0.15)');
            },
            function() {
                $(this).css('transform', 'translateY(0)').css('box-shadow', 'none');
            }
        );
    }
    
    attach_status_handlers() {
        this.status_section.find('#lookup_process_btn').on('click', () => {
            this.lookup_process();
        });
        
        this.status_section.find('#process_lookup_input').on('keypress', (e) => {
            if (e.which === 13) {
                e.preventDefault();
                this.lookup_process();
            }
        });
        
        this.status_section.find('#bridge_processes_btn').on('click', () => {
            this.show_bridge_dialog();
        });
    }
    
    load_status_dashboard() {
        const container = this.status_section.find('#status_cards_container');
        
        // Get today's stats
        frappe.call({
            method: 'smart_screens.smart_screens.api.process_center.get_process_dashboard_stats',
            callback: (r) => {
                if (r.message) {
                    this.render_status_cards(r.message, container);
                } else {
                    this.render_default_status_cards(container);
                }
            },
            error: () => {
                this.render_default_status_cards(container);
            }
        });
    }
    
    render_status_cards(stats, container) {
        container.html(`
            <div class="col-md-3 mb-3">
                <div class="card text-white bg-primary">
                    <div class="card-body">
                        <div class="d-flex justify-content-between">
                            <div>
                                <h4 class="mb-1">${stats.comprehensive_processes || 0}</h4>
                                <p class="mb-0">Complete Workflows</p>
                            </div>
                            <div class="align-self-center">
                                <i class="fa fa-magic fa-2x"></i>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            
            <div class="col-md-3 mb-3">
                <div class="card text-white bg-success">
                    <div class="card-body">
                        <div class="d-flex justify-content-between">
                            <div>
                                <h4 class="mb-1">${stats.sublot_entries || 0}</h4>
                                <p class="mb-0">Sub-Lots Created</p>
                            </div>
                            <div class="align-self-center">
                                <i class="fa fa-cube fa-2x"></i>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            
            <div class="col-md-3 mb-3">
                <div class="card text-white bg-info">
                    <div class="card-body">
                        <div class="d-flex justify-content-between">
                            <div>
                                <h4 class="mb-1">${stats.resource_tags || 0}</h4>
                                <p class="mb-0">Resource Tags</p>
                            </div>
                            <div class="align-self-center">
                                <i class="fa fa-users fa-2x"></i>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            
            <div class="col-md-3 mb-3">
                <div class="card text-white bg-warning">
                    <div class="card-body">
                        <div class="d-flex justify-content-between">
                            <div>
                                <h4 class="mb-1">${stats.inspection_entries || 0}</h4>
                                <p class="mb-0">Inspections</p>
                            </div>
                            <div class="align-self-center">
                                <i class="fa fa-search fa-2x"></i>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `);
    }
    
    render_default_status_cards(container) {
        container.html(`
            <div class="col-12">
                <div class="alert alert-info text-center">
                    <i class="fa fa-info-circle mr-2"></i>
                    Loading dashboard statistics...
                </div>
            </div>
        `);
    }
    
    lookup_process() {
        const search_term = this.status_section.find('#process_lookup_input').val().trim();
        const results_div = this.status_section.find('#lookup_results');
        
        if (!search_term) {
            frappe.msgprint('Please enter a search term');
            return;
        }
        
        results_div.html('<div class="alert alert-info">Searching...</div>');
        
        frappe.call({
            method: 'smart_screens.smart_screens.api.process_center.lookup_process',
            args: { search_term: search_term },
            callback: (r) => {
                if (r.message && r.message.length > 0) {
                    this.render_lookup_results(r.message, results_div);
                } else {
                    results_div.html('<div class="alert alert-warning">No processes found for this search term</div>');
                }
            },
            error: () => {
                results_div.html('<div class="alert alert-danger">Error occurred during search</div>');
            }
        });
    }
    
    render_lookup_results(results, container) {
        let html = '<div class="lookup-results mt-3">';
        
        results.forEach(result => {
            const status_color = this.get_status_color(result.status);
            const type_icon = this.get_type_icon(result.type);
            
            html += `
                <div class="card mb-2">
                    <div class="card-body p-3">
                        <div class="row align-items-center">
                            <div class="col-md-2">
                                <i class="fa ${type_icon} fa-2x text-primary"></i>
                            </div>
                            <div class="col-md-6">
                                <h6 class="mb-1">${result.id}</h6>
                                <p class="mb-0 text-muted">${result.type} | ${result.batch_info}</p>
                            </div>
                            <div class="col-md-2">
                                <span class="badge badge-${status_color}">${result.status}</span>
                            </div>
                            <div class="col-md-2 text-right">
                                <button class="btn btn-sm btn-outline-primary" onclick="frappe.set_route('Form', '${result.doctype}', '${result.id}')">
                                    <i class="fa fa-eye mr-1"></i>View
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        });
        
        html += '</div>';
        container.html(html);
    }
    
    show_bridge_dialog() {
        const dialog = new frappe.ui.Dialog({
            title: 'Bridge Individual Process Steps',
            size: 'large',
            fields: [
                {
                    fieldtype: 'HTML',
                    fieldname: 'bridge_info',
                    options: `
                        <div class="alert alert-info">
                            <h5><i class="fa fa-info-circle mr-2"></i>Process Bridge</h5>
                            <p>This tool helps you connect individual process steps into a comprehensive workflow.</p>
                            <p>Enter the document IDs from your individual steps below:</p>
                        </div>
                    `
                },
                {
                    fieldtype: 'Section Break',
                    label: 'Individual Process Documents'
                },
                {
                    fieldtype: 'Link',
                    fieldname: 'sublot_entry',
                    label: 'Sub Lot Entry',
                    options: 'Sub Lot Entry',
                    description: 'Select the Sub Lot Entry document'
                },
                {
                    fieldtype: 'Link',
                    fieldname: 'resource_tag',
                    label: 'Resource Tagging (Optional)',
                    options: 'SPP Lot Resource Tagging',
                    description: 'Select any Resource Tagging document'
                },
                {
                    fieldtype: 'Link',
                    fieldname: 'inspection_entry',
                    label: 'Inspection Entry (Optional)',
                    options: 'SPP Inspection Entry',
                    description: 'Select the Inspection Entry document'
                }
            ],
            primary_action_label: 'Bridge Processes',
            primary_action: (values) => {
                this.bridge_individual_processes(values, dialog);
            }
        });
        
        dialog.show();
    }
    
    bridge_individual_processes(values, dialog) {
        if (!values.sublot_entry) {
            frappe.msgprint('Sub Lot Entry is required to bridge processes');
            return;
        }
        
        frappe.call({
            method: 'smart_screens.smart_screens.api.process_center.bridge_individual_processes',
            args: values,
            freeze: true,
            freeze_message: 'Bridging processes...',
            callback: (r) => {
                if (r.message && r.message.status === 'success') {
                    dialog.hide();
                    
                    frappe.msgprint({
                        title: 'Processes Bridged Successfully',
                        message: `
                            <div class="text-center">
                                <i class="fa fa-check-circle text-success" style="font-size: 48px;"></i>
                                <h4 class="mt-3">Bridge Created Successfully!</h4>
                                <p>Sub Lot Process: <strong>${r.message.sublot_process}</strong></p>
                                ${r.message.work_order ? `<p>Work Order: <strong>${r.message.work_order}</strong></p>` : ''}
                                <p class="text-success mt-2">
                                    <i class="fa fa-check"></i> All documents are now connected
                                </p>
                            </div>
                        `,
                        primary_action: {
                            label: 'View Sub Lot Process',
                            action: () => {
                                frappe.set_route('Form', 'Sub Lot Process', r.message.sublot_process);
                            }
                        }
                    });
                    
                    // Refresh the recent processes
                    this.load_recent_processes();
                } else {
                    frappe.msgprint('Failed to bridge processes: ' + (r.message ? r.message.message : 'Unknown error'));
                }
            }
        });
    }
    
    load_recent_processes() {
        const tbody = this.recent_section.find('#recent_processes_table tbody');
        
        frappe.call({
            method: 'smart_screens.smart_screens.api.process_center.get_recent_processes',
            callback: (r) => {
                if (r.message && r.message.length > 0) {
                    this.render_recent_processes(r.message, tbody);
                } else {
                    tbody.html(`
                        <tr>
                            <td colspan="6" class="text-center text-muted">
                                No recent processes found
                            </td>
                        </tr>
                    `);
                }
            }
        });
    }
    
    render_recent_processes(processes, tbody) {
        tbody.empty();
        
        processes.forEach(process => {
            const status_color = this.get_status_color(process.status);
            const type_icon = this.get_type_icon(process.type);
            
            tbody.append(`
                <tr>
                    <td>
                        <i class="fa ${type_icon} mr-2"></i>
                        <a href="/app/${process.route}/${process.id}" target="_blank">${process.id}</a>
                    </td>
                    <td>${process.type}</td>
                    <td>${process.batch_info}</td>
                    <td><span class="badge badge-${status_color}">${process.status}</span></td>
                    <td>${frappe.datetime.str_to_user(process.created)}</td>
                    <td>
                        <button class="btn btn-sm btn-outline-primary" onclick="frappe.set_route('Form', '${process.doctype}', '${process.id}')">
                            <i class="fa fa-eye"></i>
                        </button>
                    </td>
                </tr>
            `);
        });
    }
    
    get_status_color(status) {
        const colors = {
            'Draft': 'secondary',
            'Submitted': 'success',
            'Completed': 'success',
            'Cancelled': 'danger',
            'Failed': 'danger',
            'In Progress': 'warning'
        };
        return colors[status] || 'info';
    }
    
    get_type_icon(type) {
        const icons = {
            'Sub Lot Process': 'fa-magic',
            'Sub Lot Entry': 'fa-cube',
            'SPP Lot Resource Tagging': 'fa-users',
            'SPP Inspection Entry': 'fa-search',
            'Work Order': 'fa-industry'
        };
        return icons[type] || 'fa-file';
    }
}

// Add custom styles
frappe.provide('frappe.ready');
frappe.ready(() => {
    if (!$('#process-center-styles').length) {
        $(`<style id="process-center-styles">
            .process-center-header .hero-section {
                box-shadow: 0 10px 30px rgba(0,0,0,0.15);
            }
            
            .workflow-card {
                cursor: pointer;
                transition: all 0.3s ease;
            }
            
            .workflow-card:hover {
                transform: translateY(-5px);
                box-shadow: 0 10px 25px rgba(0,0,0,0.15);
            }
            
            .feature-item {
                font-size: 0.9rem;
            }
            
            .workflow-stats {
                border-top: 1px solid rgba(0,0,0,0.1);
                padding-top: 10px;
            }
            
            .lookup-results .card {
                border-left: 4px solid #007bff;
            }
            
            @media (max-width: 768px) {
                .workflow-card {
                    margin-bottom: 20px;
                }
                
                .individual-steps button {
                    margin-bottom: 10px;
                }
            }
        </style>`).appendTo('head');
    }
});