frappe.pages['car_resolution_center'].on_page_load = function(wrapper) {
    var page = frappe.ui.make_app_page({
        parent: wrapper,
        title: 'CAR Resolution Center',
        single_column: true
    });

    // Initialize the Resolution Center
    new CARResolutionCenter(page);
}

class CARResolutionCenter {
    constructor(page) {
        this.page = page;
        this.wrapper = $(this.page.wrapper).find('.page-content');
        this.car_name = null;
        this.records = [];
        this.current_record_index = -1;
        this.current_record = null;
        this.filter_status = 'all';
        this.action_counter = 0;
        
        this.init();
    }

    init() {
        // Add page buttons
        this.setup_page_buttons();
        
        // Load HTML template
        this.load_template();
        
        // Setup event listeners
        this.setup_event_listeners();
        
        // Check if CAR name is passed in route
        this.check_route_params();
    }

    setup_page_buttons() {
        // Select CAR Button
        this.page.add_menu_item('Select CAR Document', () => {
            this.select_car_document();
        }, true);

        // Refresh Button
        this.page.add_menu_item('Refresh', () => {
            if (this.car_name) {
                this.load_car_document(this.car_name);
            } else {
                frappe.show_alert({message: 'Please select a CAR document first', indicator: 'orange'});
            }
        });

        // Submit CAR Button
        this.page.add_action_icon('fa fa-check-circle', () => {
            this.submit_car_document();
        }, 'Submit CAR');

        // Export Button
        this.page.add_action_icon('fa fa-download', () => {
            this.export_car_report();
        }, 'Export Report');
    }

    load_template() {
        // Embed HTML template directly (Frappe doesn't support loading separate HTML files)
        const template_html = `
<div class="car-resolution-center">
    <!-- Header Section -->
    <div class="car-header">
        <div class="car-header-left">
            <h2 class="car-title">
                <i class="fa fa-clipboard-check"></i>
                <span id="car-document-name">CAR Resolution Center</span>
            </h2>
            <div class="car-breadcrumb">
                <span class="breadcrumb-item" id="car-breadcrumb"></span>
            </div>
        </div>
        <div class="car-header-right">
            <div class="car-progress-container">
                <div class="progress-label">
                    <span id="progress-text">0 of 0 Resolved</span>
                    <span class="progress-percentage" id="progress-percentage">0%</span>
                </div>
                <div class="progress-bar-wrapper">
                    <div class="progress-bar" id="resolution-progress-bar" style="width: 0%"></div>
                </div>
            </div>
        </div>
    </div>

    <!-- Main Content -->
    <div class="car-content-wrapper">
        <!-- Left Panel: Records List -->
        <div class="car-left-panel">
            <div class="panel-header">
                <h3>
                    <i class="fa fa-list-ul"></i>
                    Unresolved Records
                </h3>
                <div class="filter-controls">
                    <button class="btn btn-xs btn-default filter-btn active" id="filter-all">
                        All <span class="badge" id="badge-all">0</span>
                    </button>
                    <button class="btn btn-xs btn-warning filter-btn" id="filter-pending">
                        Pending <span class="badge badge-warning" id="badge-pending">0</span>
                    </button>
                    <button class="btn btn-xs btn-success filter-btn" id="filter-resolved">
                        Resolved <span class="badge badge-success" id="badge-resolved">0</span>
                    </button>
                </div>
            </div>
            
            <div class="records-list" id="records-list">
                <!-- Records will be dynamically loaded here -->
                <div class="empty-state" id="empty-state">
                    <i class="fa fa-inbox fa-3x"></i>
                    <p>No CAR selected</p>
                    <small>Please select a CAR document to view records</small>
                </div>
            </div>
        </div>

        <!-- Right Panel: Resolution Form -->
        <div class="car-right-panel">
            <div class="resolution-form-container" id="resolution-form-container">
                <!-- Empty State -->
                <div class="resolution-empty-state" id="resolution-empty-state">
                    <i class="fa fa-hand-pointer-o fa-4x"></i>
                    <h3>Select a Record to Resolve</h3>
                    <p>Choose an unresolved production record from the left panel to start root cause analysis</p>
                </div>

                <!-- Resolution Form -->
                <div class="resolution-form" id="resolution-form" style="display: none;">
                    <!-- Production Info Card -->
                    <div class="info-card">
                        <div class="card-header">
                            <h4><i class="fa fa-industry"></i> Production Information</h4>
                            <div class="status-badge" id="record-status-badge">
                                <span class="badge badge-warning">Pending</span>
                            </div>
                        </div>
                        <div class="card-body">
                            <div class="info-grid">
                                <div class="info-item">
                                    <label>Production Entry</label>
                                    <span id="info-production-entry">-</span>
                                </div>
                                <div class="info-item">
                                    <label>Date</label>
                                    <span id="info-production-date">-</span>
                                </div>
                                <div class="info-item">
                                    <label>Shift</label>
                                    <span id="info-shift">-</span>
                                </div>
                                <div class="info-item">
                                    <label>Operator</label>
                                    <span id="info-operator">-</span>
                                </div>
                                <div class="info-item">
                                    <label>Machine/Press</label>
                                    <span id="info-machine">-</span>
                                </div>
                                <div class="info-item">
                                    <label>Item Code</label>
                                    <span id="info-item-code">-</span>
                                </div>
                                <div class="info-item">
                                    <label>Lot Number</label>
                                    <span id="info-lot">-</span>
                                </div>
                            </div>

                            <!-- Performance Metrics -->
                            <div class="metrics-grid">
                                <div class="metric-card metric-danger">
                                    <label>OEE %</label>
                                    <div class="metric-value" id="metric-oee">0%</div>
                                </div>
                                <div class="metric-card metric-warning">
                                    <label>Production Efficiency %</label>
                                    <div class="metric-value" id="metric-efficiency">0%</</div>
                                </div>
                                <div class="metric-card metric-info">
                                    <label>Rejection %</label>
                                    <div class="metric-value" id="metric-rejection">0%</div>
                                </div>
                                <div class="metric-card">
                                    <label>Target Qty</label>
                                    <div class="metric-value" id="metric-target">0</div>
                                </div>
                                <div class="metric-card">
                                    <label>Actual Qty</label>
                                    <div class="metric-value" id="metric-actual">0</div>
                                </div>
                                <div class="metric-card metric-primary">
                                    <label>Variance</label>
                                    <div class="metric-value" id="metric-variance">0</div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Root Cause Analysis Form -->
                    <div class="info-card rca-card">
                        <div class="card-header">
                            <h4><i class="fa fa-search"></i> Root Cause Analysis</h4>
                        </div>
                        <div class="card-body">
                            <!-- Reason Code -->
                            <div class="form-group">
                                <label class="required">Reason Code</label>
                                <select class="form-control" id="reason-code" required>
                                    <option value="">Select Reason Code</option>
                                    <option value="COMPOUND SHORTAGE">COMPOUND SHORTAGE</option>
                                    <option value="MACHINE BREAKDOWN">MACHINE BREAKDOWN</option>
                                    <option value="MLD CHANGE">MLD CHANGE</option>
                                    <option value="MLD WASH / CLEAN">MLD WASH / CLEAN</option>
                                    <option value="OPERATOR ISSUE">OPERATOR ISSUE</option>
                                    <option value="PLANNING">PLANNING</option>
                                    <option value="QUALITY ISSUE">QUALITY ISSUE</option>
                                    <option value="TRIAL">TRIAL</option>
                                    <option value="COMPOUND ISSUE">COMPOUND ISSUE</option>
                                    <option value="SHELL SHORTAGE">SHELL SHORTAGE</option>
                                    <option value="SHELL QUALITY ISSUE">SHELL QUALITY ISSUE</option>
                                    <option value="OPERATOR DELAY">OPERATOR DELAY</option>
                                    <option value="LOADING PLATE NOT AVAILABLE">LOADING PLATE NOT AVAILABLE</option>
                                    <option value="MOULD ISSUE">MOULD ISSUE</option>
                                </select>
                            </div>

                            <!-- Problem Description -->
                            <div class="form-group">
                                <label class="required">Problem Description</label>
                                <textarea class="form-control" id="problem-description" rows="3" 
                                    placeholder="Describe the problem in detail..." required></textarea>
                            </div>

                            <!-- 5-Why Analysis -->
                            <div class="why-analysis-section">
                                <h5><i class="fa fa-question-circle"></i> 5-Why Analysis</h5>
                                <div class="why-questions" id="why-questions">
                                    <div class="why-item">
                                        <label>Why 1?</label>
                                        <input type="text" class="form-control why-input" data-why-no="1" 
                                            placeholder="Why did this problem occur?" required>
                                    </div>
                                    <div class="why-item">
                                        <label>Why 2?</label>
                                        <input type="text" class="form-control why-input" data-why-no="2" 
                                            placeholder="Why did that happen?" required>
                                    </div>
                                    <div class="why-item">
                                        <label>Why 3?</label>
                                        <input type="text" class="form-control why-input" data-why-no="3" 
                                            placeholder="Why did that occur?" required>
                                    </div>
                                    <div class="why-item">
                                        <label>Why 4?</label>
                                        <input type="text" class="form-control why-input" data-why-no="4" 
                                            placeholder="Why was that the case?" required>
                                    </div>
                                    <div class="why-item">
                                        <label>Why 5?</label>
                                        <input type="text" class="form-control why-input" data-why-no="5" 
                                            placeholder="Why did the root cause exist?" required>
                                    </div>
                                </div>
                            </div>

                            <!-- Root Cause -->
                            <div class="form-group">
                                <label class="required">Root Cause</label>
                                <textarea class="form-control" id="root-cause" rows="3" 
                                    placeholder="Based on the 5-Why analysis, what is the root cause?" required></textarea>
                            </div>

                            <!-- Corrective Actions - Simplified -->
                            <div class="corrective-actions-section">
                                <h5><i class="fa fa-wrench"></i> Corrective Action</h5>
                                
                                <div class="form-group">
                                    <label>Corrective Action Code</label>
                                    <input type="text" class="form-control" id="corrective-action-code" 
                                        placeholder="Enter action code (optional)">
                                </div>
                                
                                <div class="form-group">
                                    <label>Corrective Action Details</label>
                                    <textarea class="form-control" id="corrective-action-details" rows="4" 
                                        placeholder="Describe the corrective actions to be taken..."></textarea>
                                </div>
                                
                                <!-- Tracking Fields -->
                                <div class="row">
                                    <div class="col-sm-6">
                                        <div class="form-group">
                                            <label>Responsible Person</label>
                                            <input type="text" class="form-control" id="scan-operator" 
                                                placeholder="Select user...">
                                        </div>
                                    </div>
                                    <div class="col-sm-6">
                                        <div class="form-group">
                                            <label>Target Date</label>
                                            <input type="date" class="form-control" id="target-date">
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <!-- Additional Details -->
                            <div class="form-group">
                                <label>Additional Remarks</label>
                                <textarea class="form-control" id="remarks" rows="2" 
                                    placeholder="Any additional information..."></textarea>
                            </div>
                        </div>
                    </div>

                    <!-- Action Buttons -->
                    <div class="action-buttons">
                        <button class="btn btn-default" id="btn-previous">
                            <i class="fa fa-arrow-left"></i> Previous
                        </button>
                        <button class="btn btn-primary" id="btn-save">
                            <i class="fa fa-save"></i> Save Draft
                        </button>
                        <button class="btn btn-success" id="btn-resolve">
                            <i class="fa fa-check"></i> Mark as Resolved
                        </button>
                        <button class="btn btn-info" id="btn-save-next">
                            <i class="fa fa-arrow-right"></i> Save & Next
                        </button>
                    </div>
                </div>
            </div>
        </div>
    </div>
</div>
        `;
        
        this.wrapper.html(template_html);
        this.render_interface();
    }

    render_interface() {
        // The HTML is already loaded from car_resolution_center.html
        // Just bind elements
        this.bind_elements();
    }

    bind_elements() {
        // Progress elements
        this.$progress_text = $('#progress-text');
        this.$progress_percentage = $('#progress-percentage');
        this.$progress_bar = $('#resolution-progress-bar');
        
        // Breadcrumb
        this.$breadcrumb = $('#car-breadcrumb');
        this.$document_name = $('#car-document-name');
        
        // Filter buttons
        this.$filter_all = $('#filter-all');
        this.$filter_pending = $('#filter-pending');
        this.$filter_resolved = $('#filter-resolved');
        this.$badge_all = $('#badge-all');
        this.$badge_pending = $('#badge-pending');
        this.$badge_resolved = $('#badge-resolved');
        
        // Records list
        this.$records_list = $('#records-list');
        this.$empty_state = $('#empty-state');
        
        // Resolution form
        this.$resolution_form_container = $('#resolution-form-container');
        this.$resolution_empty_state = $('#resolution-empty-state');
        this.$resolution_form = $('#resolution-form');
        
        // Form fields
        this.$reason_code = $('#reason-code');
        this.$problem_description = $('#problem-description');
        this.$root_cause = $('#root-cause');
        this.$remarks = $('#remarks');
        this.$why_inputs = $('.why-input');
        
        // Corrective action fields (simplified - no child table)
        this.$corrective_action_code = $('#corrective-action-code');
        this.$corrective_action_details = $('#corrective-action-details');
        this.$scan_operator = $('#scan-operator');
        this.$target_date = $('#target-date');
        
        // Action buttons
        this.$btn_previous = $('#btn-previous');
        this.$btn_save = $('#btn-save');
        this.$btn_resolve = $('#btn-resolve');
        this.$btn_save_next = $('#btn-save-next');
    }

    setup_event_listeners() {
        // Filter buttons
        $(document).on('click', '#filter-all', () => this.apply_filter('all'));
        $(document).on('click', '#filter-pending', () => this.apply_filter('pending'));
        $(document).on('click', '#filter-resolved', () => this.apply_filter('resolved'));
        
        // Navigation buttons
        $(document).on('click', '#btn-previous', () => this.navigate_previous());
        $(document).on('click', '#btn-save', () => this.save_resolution(false));
        $(document).on('click', '#btn-resolve', () => this.save_resolution(true));
        $(document).on('click', '#btn-save-next', () => this.save_and_next());
        
        // Record item click
        $(document).on('click', '.record-item', (e) => {
            const index = $(e.currentTarget).data('index');
            this.select_record(index);
        });
    }

    check_route_params() {
        // Check if CAR name is in URL hash
        const params = frappe.utils.get_query_params();
        if (params.car) {
            this.load_car_document(params.car);
        } else {
            // Show CAR selector dialog on page load
            setTimeout(() => {
                this.select_car_document();
            }, 500);
        }
    }

    select_car_document() {
        // Create dialog to select CAR document
        const dialog = new frappe.ui.Dialog({
            title: 'Select CAR Document',
            fields: [
                {
                    fieldname: 'car_document',
                    fieldtype: 'Link',
                    label: 'Corrective Action Unresolved',
                    options: 'Corrective Action Unresolved',
                    reqd: 1,
                    get_query: function() {
                        return {
                            filters: {
                                'docstatus': ['<', 2], // Not cancelled
                                'status': ['!=', 'Submitted']
                            }
                        };
                    },
                    onchange: function() {
                        const car_name = this.get_value();
                        if (car_name) {
                            // Show quick preview
                            dialog.set_df_property('preview_html', 'hidden', false);
                            frappe.call({
                                method: 'frappe.client.get',
                                args: {
                                    doctype: 'Corrective Action Unresolved',
                                    name: car_name
                                },
                                callback: (r) => {
                                    if (r.message) {
                                        const doc = r.message;
                                        const html = `
                                            <div class="car-preview">
                                                <p><strong>Date Range:</strong> ${frappe.datetime.str_to_user(doc.from_date)} to ${frappe.datetime.str_to_user(doc.to_date)}</p>
                                                <p><strong>Total Records:</strong> ${doc.total_records || 0}</p>
                                                <p><strong>Pending:</strong> ${doc.pending_records || 0}</p>
                                                <p><strong>Resolved:</strong> ${doc.resolved_records || 0}</p>
                                                <p><strong>Progress:</strong> ${(doc.resolution_progress_pct || 0).toFixed(2)}%</p>
                                            </div>
                                        `;
                                        dialog.fields_dict.preview_html.$wrapper.html(html);
                                    }
                                }
                            });
                        }
                    }
                },
                {
                    fieldname: 'preview_html',
                    fieldtype: 'HTML',
                    hidden: true
                }
            ],
            primary_action_label: 'Load CAR',
            primary_action: (values) => {
                this.load_car_document(values.car_document);
                dialog.hide();
            }
        });
        
        dialog.show();
    }

    load_car_document(car_name) {
        frappe.dom.freeze('Loading CAR Document...');
        
        frappe.call({
            method: 'frappe.client.get',
            args: {
                doctype: 'Corrective Action Unresolved',
                name: car_name
            },
            callback: (r) => {
                frappe.dom.unfreeze();
                
                if (r.message) {
                    this.car_name = car_name;
                    this.process_car_document(r.message);
                    
                    // Update URL
                    frappe.set_route('car_resolution_center', {car: car_name});
                    
                    frappe.show_alert({
                        message: `Loaded CAR: ${car_name}`,
                        indicator: 'green'
                    });
                }
            },
            error: () => {
                frappe.dom.unfreeze();
                frappe.msgprint('Failed to load CAR document');
            }
        });
    }

    process_car_document(doc) {
        // Store CAR data
        this.car_doc = doc;
        this.records = doc.unresolved_production_records || [];
        
        // Update header
        this.$document_name.text(doc.name);
        this.$breadcrumb.text(`${frappe.datetime.str_to_user(doc.from_date)} to ${frappe.datetime.str_to_user(doc.to_date)}`);
        
        // Update progress
        this.update_progress();
        
        // Render records list
        this.render_records_list();
        
        // Auto-select first pending record
        const first_pending = this.records.findIndex(r => r.resolution_status === 'Pending');
        if (first_pending !== -1) {
            this.select_record(first_pending);
        } else if (this.records.length > 0) {
            this.select_record(0);
        }
    }

    update_progress() {
        const total = this.car_doc.total_records || 0;
        const resolved = this.car_doc.resolved_records || 0;
        const progress = this.car_doc.resolution_progress_pct || 0;
        
        this.$progress_text.text(`${resolved} of ${total} Resolved`);
        this.$progress_percentage.text(`${progress.toFixed(0)}%`);
        this.$progress_bar.css('width', `${progress}%`);
        
        // Update badge counts
        const pending = this.car_doc.pending_records || 0;
        this.$badge_all.text(total);
        this.$badge_pending.text(pending);
        this.$badge_resolved.text(resolved);
        
        // Animate progress bar
        this.$progress_bar.addClass('progress-animate');
        setTimeout(() => {
            this.$progress_bar.removeClass('progress-animate');
        }, 600);
    }

    render_records_list() {
        this.$empty_state.hide();
        this.$records_list.empty();
        
        if (!this.records || this.records.length === 0) {
            this.$empty_state.show();
            return;
        }
        
        // Filter records based on current filter
        let filtered_records = this.records;
        if (this.filter_status === 'pending') {
            filtered_records = this.records.filter(r => r.resolution_status === 'Pending');
        } else if (this.filter_status === 'resolved') {
            filtered_records = this.records.filter(r => r.resolution_status === 'Resolved');
        }
        
        filtered_records.forEach((record, idx) => {
            const original_idx = this.records.indexOf(record);
            const status_class = record.resolution_status === 'Resolved' ? 'resolved' : 'pending';
            const status_icon = record.resolution_status === 'Resolved' ? 'fa-check-circle' : 'fa-clock-o';
            const status_color = record.resolution_status === 'Resolved' ? 'success' : 'warning';
            
            const oee_class = record.oee_pct >= 90 ? 'metric-success' : (record.oee_pct >= 70 ? 'metric-warning' : 'metric-danger');
            
            // Build additional fields for resolved records
            let additionalFields = '';
            if (record.resolution_status === 'Resolved') {
                additionalFields = `
                    <div class="detail-row">
                        <i class="fa fa-user-circle"></i>
                        <span><strong>Responsible:</strong> ${record.scan_operator || 'Not Assigned'}</span>
                    </div>
                    <div class="detail-row">
                        <i class="fa fa-calendar-check-o"></i>
                        <span><strong>Target Date:</strong> ${record.target_date ? frappe.datetime.str_to_user(record.target_date) : 'Not Set'}</span>
                    </div>
                `;
            }
            
            const html = `
                <div class="record-item ${status_class}" data-index="${original_idx}">
                    <div class="record-header">
                        <div class="record-title">
                            <strong>#${idx + 1}</strong>
                            <span class="record-entry">${record.production_entry || 'N/A'}</span>
                        </div>
                        <span class="badge badge-${status_color}">
                            <i class="fa ${status_icon}"></i> ${record.resolution_status}
                        </span>
                    </div>
                    <div class="record-details">
                        <div class="detail-row">
                            <i class="fa fa-calendar"></i>
                            <span>${frappe.datetime.str_to_user(record.production_date)}</span>
                        </div>
                        <div class="detail-row">
                            <i class="fa fa-clock-o"></i>
                            <span>${record.shift_type || 'N/A'}</span>
                        </div>
                        <div class="detail-row">
                            <i class="fa fa-user"></i>
                            <span>${record.operator_name || 'N/A'}</span>
                        </div>
                        <div class="detail-row">
                            <i class="fa fa-cogs"></i>
                            <span>${record.machine_reference || 'N/A'}</span>
                        </div>
                        ${additionalFields}
                    </div>
                    <div class="record-metrics">
                        <div class="metric-badge ${oee_class}">
                            <label>OEE</label>
                            <span>${(record.oee_pct || 0).toFixed(1)}%</span>
                        </div>
                        <div class="metric-badge">
                            <label>Efficiency</label>
                            <span>${(record.production_efficiency_pct || 0).toFixed(1)}%</span>
                        </div>
                    </div>
                </div>
            `;
            
            this.$records_list.append(html);
        });
    }

    apply_filter(status) {
        this.filter_status = status;
        
        // Update active button
        $('.filter-btn').removeClass('active');
        $(`#filter-${status}`).addClass('active');
        
        // Re-render list
        this.render_records_list();
    }

    select_record(index) {
        this.current_record_index = index;
        this.current_record = this.records[index];
        
        // Highlight selected record
        $('.record-item').removeClass('active');
        $(`.record-item[data-index="${index}"]`).addClass('active');
        
        // Show resolution form
        this.$resolution_empty_state.hide();
        this.$resolution_form.fadeIn(300);
        
        // Load record data into form
        this.load_record_data();
        
        // Update navigation buttons
        this.$btn_previous.prop('disabled', index === 0);
        
        // Scroll to top of form
        this.$resolution_form_container.scrollTop(0);
    }

    load_record_data() {
        const rec = this.current_record;
        
        // Update production info
        $('#info-production-entry').html(`<a href="/app/moulding-production-entry/${rec.production_entry}" target="_blank">${rec.production_entry}</a>`);
        $('#info-production-date').text(frappe.datetime.str_to_user(rec.production_date));
        $('#info-shift').text(rec.shift_type || '-');
        $('#info-operator').text(rec.operator_name || '-');
        $('#info-machine').text(rec.machine_reference || '-');
        $('#info-item-code').text(rec.item_code || '-');
        $('#info-lot').text(rec.lot_number || '-');
        
        // Update metrics
        $('#metric-oee').text(`${(rec.oee_pct || 0).toFixed(2)}%`);
        $('#metric-efficiency').text(`${(rec.production_efficiency_pct || 0).toFixed(2)}%`);
        $('#metric-rejection').text(`${(rec.rejection_percentage || 0).toFixed(2)}%`);
        $('#metric-target').text(rec.target_quantity || 0);
        $('#metric-actual').text(rec.actual_quantity || 0);
        $('#metric-variance').text(rec.variance_qty || 0);
        
        // Update status badge
        const status_html = rec.resolution_status === 'Resolved' 
            ? '<span class="badge badge-success"><i class="fa fa-check-circle"></i> Resolved</span>'
            : '<span class="badge badge-warning"><i class="fa fa-clock-o"></i> Pending</span>';
        $('#record-status-badge').html(status_html);
        
        // Load existing resolution data if resolved
        if (rec.resolution_status === 'Resolved' && rec.resolved_record) {
            this.load_existing_resolution(rec.resolved_record);
        } else {
            this.clear_form();
        }
    }

    load_existing_resolution(resolved_record_name) {
        frappe.call({
            method: 'frappe.client.get',
            args: {
                doctype: 'Corrective Action Resolved',
                name: resolved_record_name
            },
            callback: (r) => {
                if (r.message) {
                    const doc = r.message;
                    
                    // Fill form fields
                    this.$reason_code.val(doc.reason_code || '');
                    this.$problem_description.val(doc.problem_description || '');
                    this.$root_cause.val(doc.root_cause || '');
                    this.$remarks.val(doc.remarks || '');
                    this.$corrective_action_code.val(doc.corrective_action_code || '');
                    this.$corrective_action_details.val(doc.corrective_action_details || '');
                    this.$scan_operator.val(doc.scan_operator || '');
                    this.$target_date.val(doc.target_date || '');
                    
                    // Load Why Analysis data
                    if (doc.why_analysis && doc.why_analysis.length > 0) {
                        doc.why_analysis.forEach((item, idx) => {
                            const $why_input = $(`.why-input[data-why-no="${idx + 1}"]`);
                            if ($why_input.length) {
                                $why_input.val(item.why_question || '');
                            }
                        });
                    }
                    
                    // Disable form if resolved
                    this.toggle_form_readonly(true);
                }
            }
        });
    }

    clear_form() {
        this.$reason_code.val('');
        this.$problem_description.val('');
        this.$root_cause.val('');
        this.$remarks.val('');
        this.$corrective_action_code.val('');
        this.$corrective_action_details.val('');
        this.$scan_operator.val('');
        this.$target_date.val('');
        
        // Clear Why Analysis inputs
        this.$why_inputs.each(function() {
            $(this).val('');
        });
        
        // Enable form
        this.toggle_form_readonly(false);
    }

    toggle_form_readonly(readonly) {
        // Toggle form fields
        this.$reason_code.prop('readonly', readonly).prop('disabled', readonly);
        this.$problem_description.prop('readonly', readonly).prop('disabled', readonly);
        this.$root_cause.prop('readonly', readonly).prop('disabled', readonly);
        this.$remarks.prop('readonly', readonly).prop('disabled', readonly);
        this.$corrective_action_code.prop('readonly', readonly).prop('disabled', readonly);
        this.$corrective_action_details.prop('readonly', readonly).prop('disabled', readonly);
        this.$scan_operator.prop('readonly', readonly).prop('disabled', readonly);
        this.$target_date.prop('readonly', readonly).prop('disabled', readonly);
        
        // Toggle Why Analysis inputs
        this.$why_inputs.each(function() {
            $(this).prop('readonly', readonly).prop('disabled', readonly);
        });
        
        if (readonly) {
            this.$btn_save.hide();
            this.$btn_resolve.hide();
            this.$btn_save_next.hide();
        } else {
            this.$btn_save.show();
            this.$btn_resolve.show();
            this.$btn_save_next.show();
        }
    }

    validate_form() {
        // Check required fields
        if (!this.$reason_code.val()) {
            frappe.msgprint('Please select a Reason Code');
            this.$reason_code.focus();
            return false;
        }
        
        if (!this.$problem_description.val().trim()) {
            frappe.msgprint('Please enter Problem Description');
            this.$problem_description.focus();
            return false;
        }
        
        // Validate 5-Why analysis
        let why_valid = true;
        this.$why_inputs.each(function() {
            if (!$(this).val().trim()) {
                why_valid = false;
                return false;
            }
        });
        
        if (!why_valid) {
            frappe.msgprint('Please complete all 5 Why questions');
            return false;
        }
        
        if (!this.$root_cause.val().trim()) {
            frappe.msgprint('Please enter Root Cause');
            this.$root_cause.focus();
            return false;
        }
        
        return true;
    }

    collect_form_data() {
        // Collect Why Analysis
        const why_analysis = [];
        this.$why_inputs.each(function(idx) {
            why_analysis.push({
                s_no: idx + 1,
                why_question: $(this).val().trim()
            });
        });
        
        return {
            parent_car_unresolved: this.car_name,
            production_entry: this.current_record.production_entry,
            production_date: this.current_record.production_date,
            shift_type: this.current_record.shift_type,
            operator_name: this.current_record.operator_name,
            machine_reference: this.current_record.machine_reference,
            item_code: this.current_record.item_code,
            lot_number: this.current_record.lot_number,
            target_quantity: this.current_record.target_quantity,
            actual_quantity: this.current_record.actual_quantity,
            variance_qty: this.current_record.variance_qty,
            oee_pct: this.current_record.oee_pct,
            production_efficiency_pct: this.current_record.production_efficiency_pct,
            rejection_percentage: this.current_record.rejection_percentage,
            reason_code: this.$reason_code.val(),
            problem_description: this.$problem_description.val().trim(),
            root_cause: this.$root_cause.val().trim(),
            remarks: this.$remarks.val().trim(),
            corrective_action_code: this.$corrective_action_code.val().trim(),
            corrective_action_details: this.$corrective_action_details.val().trim(),
            scan_operator: this.$scan_operator.val().trim(),
            target_date: this.$target_date.val(),
            why_analysis: why_analysis
        };
    }

    save_resolution(mark_resolved = false) {
        if (!this.validate_form()) {
            return;
        }
        
        const data = this.collect_form_data();
        data.status = 'Resolved';  // Always set to Resolved since Draft is not allowed
        
        frappe.dom.freeze('Saving resolution...');
        
        frappe.call({
            method: 'frappe.client.insert',
            args: {
                doc: {
                    doctype: 'Corrective Action Resolved',
                    ...data
                }
            },
            callback: (r) => {
                frappe.dom.unfreeze();
                
                if (r.message) {
                    frappe.show_alert({
                        message: 'Resolution saved successfully',
                        indicator: 'green'
                    });
                    
                    // Reload CAR document to update progress
                    this.load_car_document(this.car_name);
                }
            },
            error: () => {
                frappe.dom.unfreeze();
                frappe.msgprint('Failed to save resolution');
            }
        });
    }

    save_and_next() {
        if (!this.validate_form()) {
            return;
        }
        
        const data = this.collect_form_data();
        data.status = 'Resolved';
        
        frappe.dom.freeze('Saving resolution...');
        
        frappe.call({
            method: 'frappe.client.insert',
            args: {
                doc: {
                    doctype: 'Corrective Action Resolved',
                    ...data
                }
            },
            callback: (r) => {
                frappe.dom.unfreeze();
                
                if (r.message) {
                    frappe.show_alert({
                        message: 'Resolution saved successfully',
                        indicator: 'green'
                    });
                    
                    // Navigate to next pending record
                    this.navigate_next();
                }
            },
            error: () => {
                frappe.dom.unfreeze();
                frappe.msgprint('Failed to save resolution');
            }
        });
    }

    navigate_previous() {
        if (this.current_record_index > 0) {
            this.select_record(this.current_record_index - 1);
        }
    }

    navigate_next() {
        // Find next pending record
        let next_index = this.current_record_index + 1;
        
        while (next_index < this.records.length) {
            if (this.records[next_index].resolution_status === 'Pending') {
                this.select_record(next_index);
                
                // Reload CAR to update progress
                this.load_car_document(this.car_name);
                return;
            }
            next_index++;
        }
        
        // No more pending records - reload to show completion
        frappe.show_alert({
            message: 'All records resolved! 🎉',
            indicator: 'green'
        });
        
        this.load_car_document(this.car_name);
    }

    submit_car_document() {
        if (!this.car_name) {
            frappe.msgprint('No CAR document loaded');
            return;
        }
        
        frappe.confirm(
            'Are you sure you want to submit this CAR? All records must be resolved.',
            () => {
                frappe.dom.freeze('Submitting CAR...');
                
                frappe.call({
                    method: 'frappe.client.submit',
                    args: {
                        doc: {
                            doctype: 'Corrective Action Unresolved',
                            name: this.car_name
                        }
                    },
                    callback: (r) => {
                        frappe.dom.unfreeze();
                        
                        if (r.message) {
                            frappe.show_alert({
                                message: 'CAR submitted successfully! 🎉',
                                indicator: 'green'
                            });
                            
                            // Reload
                            this.load_car_document(this.car_name);
                        }
                    },
                    error: (r) => {
                        frappe.dom.unfreeze();
                        frappe.msgprint(r.message || 'Failed to submit CAR');
                    }
                });
            }
        );
    }

    export_car_report() {
        if (!this.car_name) {
            frappe.msgprint('No CAR document loaded');
            return;
        }
        
        frappe.msgprint('Export feature coming soon!');
    }
}
