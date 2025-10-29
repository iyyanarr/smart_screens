// Global variables
let currentData = [];
let sortedData = [];
let currentSort = { column: null, direction: 'asc' };
let reportGenerated = false; // Track if report has been generated
let reportData = null; // Store report data for submission/saving
let savedReportName = null; // Store the Daily OEE Report name after saving
let existingReportInfo = null; // Store existing report information for resume mode

// Initialize the page
frappe.pages['oee-dashboard'].on_page_load = function(wrapper) {
    var page = frappe.ui.make_app_page({
        parent: wrapper,
        title: 'OEE Report Generator',
        single_column: true
    });
    
    page.main.html(frappe.render_template('oee_dashboard'));
    
    // Initialize date filters with default values (latest available)
    initializeDateFilters().then(() => {
        // Initialize table sorting
        initializeTableSorting();
        // Load available processes
        loadProcessOptions();
        // Load shift options only (don't auto-load data)
        loadShiftOptions();
        // Check for existing report when date is set
        checkExistingReport();
    });
};

function initializeDateFilters() {
    return new Promise((resolve) => {
        try {
            const processType = (document.getElementById('process_filter')?.value) || 'Moulding';
            frappe.call({
                method: 'smart_screens.smart_screens.page.oee_dashboard.oee_dashboard.get_latest_production_date',
                args: { process_type: processType },
                callback: function(r) {
                    const d = (r && r.message) || new Date().toISOString().split('T')[0];
                    const el = document.getElementById('production_date');
                    if (el) el.value = d;
                    resolve();
                },
                error: function() {
                    const el = document.getElementById('production_date');
                    if (el) el.value = new Date().toISOString().split('T')[0];
                    resolve();
                }
            });
        } catch (e) {
            const el = document.getElementById('production_date');
            if (el) el.value = new Date().toISOString().split('T')[0];
            resolve();
        }
    });
}

// Adjust loading spinner helpers to use correct element ID
function showLoading() {
    const el = document.getElementById('loading-spinner') || document.getElementById('loading');
    if (el) el.style.display = 'block';
}

function hideLoading() {
    const el = document.getElementById('loading-spinner') || document.getElementById('loading');
    if (el) el.style.display = 'none';
}

function loadProcessOptions() {
    frappe.call({
        method: 'smart_screens.smart_screens.page.oee_dashboard.oee_dashboard.get_available_processes',
        callback: function(r) {
            if (r.message) {
                const processSelect = document.getElementById('process_filter');
                processSelect.innerHTML = '';
                
                r.message.forEach(option => {
                    const optionElement = document.createElement('option');
                    optionElement.value = option.value;
                    optionElement.textContent = option.label;
                    processSelect.appendChild(optionElement);
                });
            }
        }
    });
}

function loadShiftOptions() {
    const productionDate = document.getElementById('production_date').value;
    const processType = document.getElementById('process_filter').value;
    
    frappe.call({
        method: 'smart_screens.smart_screens.page.oee_dashboard.oee_dashboard.get_shift_options',
        args: {
            production_date: productionDate,
            process_type: processType
        },
        callback: function(r) {
            if (r.message) {
                const shiftSelect = document.getElementById('shift_filter');
                shiftSelect.innerHTML = '';
                
                r.message.forEach(option => {
                    const optionElement = document.createElement('option');
                    optionElement.value = option.value;
                    optionElement.textContent = option.label;
                    shiftSelect.appendChild(optionElement);
                });
            }
        }
    });
}

function loadData() {
    showLoading();
    
    const productionDate = document.getElementById('production_date').value;
    const processType = document.getElementById('process_filter').value;
    const shiftFilter = document.getElementById('shift_filter').value;
    const machineFilter = document.getElementById('machine_filter').value;
    // Lot and Item filters have been removed from UI
    const lotFilter = null;
    const itemFilter = null;
    
    // Load main OEE data
    frappe.call({
        method: 'smart_screens.smart_screens.page.oee_dashboard.oee_dashboard.get_oee_data',
        args: {
            production_date: productionDate,
            process_type: processType,
            shift_filter: shiftFilter,
            machine_filter: machineFilter,
            lot_filter: lotFilter,
            item_filter: itemFilter
        },
        callback: function(r) {
            if (r.message) {
                currentData = r.message;
                sortedData = [...currentData];
                updateTable(sortedData);
            }
        },
        error: function(err) {
            console.error('Error loading OEE data:', err);
            frappe.msgprint('Error loading OEE data. Please try again.');
            hideLoading();
        }
    });
    
    // Load summary statistics
    frappe.call({
        method: 'smart_screens.smart_screens.page.oee_dashboard.oee_dashboard.get_oee_summary',
        args: {
            production_date: productionDate,
            process_type: processType,
            shift_filter: shiftFilter,
            machine_filter: machineFilter,
            lot_filter: lotFilter,
            item_filter: itemFilter
        },
        callback: function(r) {
            if (r.message) {
                updateSummaryCards(r.message);
                hideLoading();
            }
        },
        error: function(err) {
            console.error('Error loading summary:', err);
            hideLoading();
        }
    });
}

function updateSummaryCards(summary) {
    // Update inline header metrics
    document.getElementById('avg-availability-inline').textContent = summary.avg_availability + '%';
    document.getElementById('avg-performance-inline').textContent = summary.avg_performance + '%';
    document.getElementById('avg-quality-inline').textContent = summary.avg_quality + '%';
    document.getElementById('avg-oee-inline').textContent = summary.avg_oee + '%';
}

// Helper: simple status meta based on OEE and resolution_status
function getStatusMeta(row) {
    const status = row.resolution_status || '';
    if (status === 'Resolved') return { color: '#28a745', emoji: '🟢', text: 'Resolved' };
    if (status === 'In Progress') return { color: '#ffc107', emoji: '🟡', text: 'In Progress' };
    if ((row.oee_pct || 0) < 90) return { color: '#dc3545', emoji: '🔴', text: 'Needs Resolution' };
    return { color: '#adb5bd', emoji: '⚪', text: 'OK' };
}

// Resolution Panel Controller
class ResolutionPanel {
    constructor() {
        this.panel = document.getElementById('resolution-panel');
        this.overlay = document.getElementById('resolution-overlay');
        this.closeBtn = document.getElementById('resolution-close-btn');
        this.summaryEl = document.getElementById('res-prod-summary');
        this.form = document.getElementById('resolution-form');
        this.btnSaveDraft = document.getElementById('res-save-draft');
        this.btnSaveNext = document.getElementById('res-save-next');
        this.btnCancel = document.getElementById('res-cancel');
        this.reasonSelect = document.getElementById('res-reason-code');
        this.addActionRowBtn = document.getElementById('add-action-row');
        this.actionsTbody = document.getElementById('corrective-actions-tbody');
        this.inputs = {
            reason_code: document.getElementById('res-reason-code'),
            problem_description: document.getElementById('res-problem'),
            corrective_action_code: document.getElementById('res-corrective-action-code'),
            corrective_action_details: document.getElementById('res-corrective-action-details'),
            resolution_remarks: document.getElementById('res-remarks')
        };
        this.currentIndex = null;
        this.reasonCodesLoaded = false;
        this.actionRowCounter = 0;
        this._bind();
    }

    _bind() {
        if (this.closeBtn) this.closeBtn.addEventListener('click', () => this.close());
        if (this.overlay) this.overlay.addEventListener('click', () => this.close());
        if (this.btnCancel) this.btnCancel.addEventListener('click', (e) => { e.preventDefault(); this.close(); });
        if (this.btnSaveDraft) this.btnSaveDraft.addEventListener('click', (e) => { e.preventDefault(); this.save(true, false); });
        if (this.btnSaveNext) this.btnSaveNext.addEventListener('click', (e) => { e.preventDefault(); this.save(false, true); });
        // Remove child table row button listener since we no longer have the table
        // if (this.addActionRowBtn) this.addActionRowBtn.addEventListener('click', () => this.addActionRow());
        document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && this.isOpen()) this.close(); });
    }

    isOpen() { return this.panel && this.panel.classList.contains('open'); }

    // Remove child table methods as they're no longer needed
    /*
    addActionRow(data = {}) {
        // ... removed ...
    }

    removeActionRow(rowId) {
        // ... removed ...
    }

    clearActionRows() {
        // ... removed ...
    }

    getActionRows() {
        // ... removed ...
    }
    */

    async open(index) {
        this.currentIndex = index;
        const row = sortedData[index];
        if (!row) return;

        // Load reason codes once
        await this.ensureReasonCodes();

        // Fill summary
        const lot = row.lot_number || '-';
        const date = row.production_date_formatted || '-';
        const shift = row.shift_type || '-';
        const oee = (row.oee_pct != null ? row.oee_pct : '-') + '%';
        this.summaryEl.textContent = `Lot: ${lot} | Date: ${date} | Shift: ${shift} | OEE: ${oee}`;

        // Prefill form fields
        this.inputs.reason_code.value = row.reason_code || '';
        this.inputs.problem_description.value = row.problem_description || '';
        this.inputs.corrective_action_code.value = row.corrective_action_code || '';
        this.inputs.corrective_action_details.value = row.corrective_action_details || '';
        this.inputs.resolution_remarks.value = row.resolution_remarks || '';

        // Show panel
        if (this.overlay) this.overlay.style.display = 'block';
        if (this.panel) this.panel.classList.add('open');
        this.panel?.setAttribute('aria-hidden', 'false');
    }

    close() {
        if (this.panel) this.panel.classList.remove('open');
        if (this.overlay) this.overlay.style.display = 'none';
        this.panel?.setAttribute('aria-hidden', 'true');
        this.currentIndex = null;
    }

    async ensureReasonCodes() {
        if (this.reasonCodesLoaded) return;
        try {
            const r = await new Promise((resolve, reject) => {
                frappe.call({
                    method: 'smart_screens.smart_screens.page.oee_dashboard.oee_dashboard.get_reason_codes',
                    callback: resolve,
                    error: reject
                });
            });
            const codes = (r && r.message) || [];
            // Populate select
            if (this.reasonSelect) {
                // preserve first placeholder
                this.reasonSelect.querySelectorAll('option:not(:first-child)')?.forEach(o => o.remove());
                codes.forEach(code => {
                    const opt = document.createElement('option');
                    opt.value = code;
                    opt.textContent = code;
                    this.reasonSelect.appendChild(opt);
                });
            }
            this.reasonCodesLoaded = true;
        } catch (e) {
            console.error('Failed to load reason codes', e);
        }
    }

    getFormData() {
        return {
            reason_code: this.inputs.reason_code.value || '',
            problem_description: this.inputs.problem_description.value || '',
            corrective_action_code: this.inputs.corrective_action_code.value || '',
            corrective_action_details: this.inputs.corrective_action_details.value || '',
            resolution_remarks: this.inputs.resolution_remarks.value || ''
        };
    }

    async save(isDraft, goNext) {
        const index = this.currentIndex;
        const row = sortedData[index];
        if (!row) return;
        const data = this.getFormData();

        // Validate required fields
        if (!isDraft) {
            if (!data.reason_code) {
                frappe.msgprint('Please select a Reason Code.');
                return;
            }
            if (!data.corrective_action_code || !data.corrective_action_details) {
                frappe.msgprint('Please provide Corrective Action details.');
                return;
            }
        }

        // Debug logging
        console.log('💾 CAR Save - Debug Info:', {
            savedReportName: savedReportName,
            reportGenerated: reportGenerated,
            existingReportInfo: existingReportInfo,
            hasReportData: !!reportData
        });

        // Check if Daily OEE Report has been saved
        if (!savedReportName) {
            // Double-check if we're in resume mode
            if (existingReportInfo && existingReportInfo.report_name) {
                console.log('⚠️ savedReportName was null but existingReportInfo exists, recovering...');
                savedReportName = existingReportInfo.report_name;
            } else {
                frappe.msgprint({
                    title: 'Report Not Saved',
                    message: 'Please save the Daily OEE Report first before generating CAR.',
                    indicator: 'red',
                    primary_action: {
                        label: 'Save Report Now',
                        action: function() {
                            saveReport();
                        }
                    }
                });
                return;
            }
        }

        console.log('✅ Proceeding with CAR creation for report:', savedReportName);

        try {
            showLoading();
            
            // Create Corrective Action Resolved document
            const r = await new Promise((resolve, reject) => {
                frappe.call({
                    method: 'smart_screens.smart_screens.page.oee_dashboard.oee_dashboard.create_car_from_oee_dashboard',
                    args: {
                        production_entry: row.name,
                        parent_daily_oee_report: savedReportName,
                        resolution_data: data
                    },
                    callback: resolve,
                    error: reject
                });
            });
            
            hideLoading();
            
            if (r && r.message && r.message.success) {
                // Update local row status to Resolved
                const updated = { 
                    ...row, 
                    ...data, 
                    resolution_status: 'Resolved',
                    resolved_record: r.message.car_name
                };
                
                // Update both currentData and sortedData
                const updateByName = (arr) => {
                    const i = arr.findIndex(x => x.name === row.name);
                    if (i >= 0) arr[i] = updated;
                };
                updateByName(currentData);
                updateByName(sortedData);
                
                // Refresh table to show updated status
                updateTable(sortedData);
                
                // Also refresh the saved report data to keep it in sync
                if (reportData && reportData.data) {
                    const dataIndex = reportData.data.findIndex(x => x.name === row.name);
                    if (dataIndex >= 0) {
                        reportData.data[dataIndex] = updated;
                    }
                }

                frappe.show_alert({ 
                    message: `CAR ${r.message.car_name} created successfully`, 
                    indicator: 'green' 
                });

                if (goNext) {
                    const nextIndex = this.findNextUnresolved(index + 1);
                    if (nextIndex >= 0) {
                        this.open(nextIndex);
                    } else {
                        frappe.msgprint('All low OEE records have been resolved.');
                        this.close();
                    }
                } else {
                    this.close();
                }
            } else {
                const msg = (r && r.message && r.message.error) || 'Failed to create CAR';
                frappe.msgprint(msg);
            }
        } catch (e) {
            hideLoading();
            console.error('Create CAR error', e);
            frappe.msgprint('Error while creating CAR. Please try again.');
        }
    }

    findNextUnresolved(start) {
        for (let i = start; i < sortedData.length; i++) {
            const r = sortedData[i];
            const status = (r.resolution_status || '').toLowerCase();
            if ((r.oee_pct || 0) < 90 && status !== 'resolved') return i;
        }
        return -1;
    }
}

let resolutionPanel;

// Extend updateTable to render Action column with status indicator and button
function updateTable(data) {
    const tableBody = document.getElementById('oee-table-body');
    tableBody.innerHTML = '';

    if (!data || data.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="12" class="text-center">No OEE data found for the selected criteria</td></tr>';
        return;
    }
    
    data.forEach((row, index) => {
        const tr = document.createElement('tr');
        let oeeClass = row.oee_pct >= 90 ? 'oee-excellent' : 'oee-poor';
        const statusMeta = getStatusMeta(row);
        
        // Check lot inspection status
        const lotInspectionStatus = row.lot_inspection_status || 'Not Found';
        const hasLotInspection = lotInspectionStatus !== 'Not Found';
        
        // Can only resolve if:
        // 1. OEE < 90% AND
        // 2. Not already resolved AND
        // 3. Lot inspection exists (Submitted or Pending)
        const canResolve = (row.oee_pct || 0) < 90 && 
                          (row.resolution_status || '').toLowerCase() !== 'resolved' &&
                          hasLotInspection;
        
        let inspectionDisplay = '';
        let actionButton = '';
        
        if (!hasLotInspection) {
            // No inspection found - show warning badge, no resolve button
            inspectionDisplay = '<div style="margin-bottom: 4px;"><span class="badge badge-danger" style="font-size: 10px;">✗ Lot Inspection Pending</span></div>';
            // No button shown when inspection is pending
            actionButton = '<small class="text-muted" style="font-size: 10px;">Not Eligible</small>';
        } else {
            // Inspection exists - show appropriate button
            if (canResolve) {
                // Generate CAR button - RED by default, BLUE on hover
                actionButton = `<button class="btn btn-xs car-button" data-action="resolve" data-index="${index}" style="font-size: 11px; padding: 3px 10px;">Generate CAR</button>`;
            } else {
                // Remarks button without status indicator - GREEN background
                actionButton = `<button class="btn btn-xs remarks-button" data-action="view" data-index="${index}" style="font-size: 11px; padding: 3px 10px;">Remarks</button>`;
            }
        }
        
        tr.innerHTML = `
            <td>${row.production_date_formatted || ''}</td>
            <td>${row.shift_type || ''}</td>
            <td><small>${row.operator_name || '-'}</small></td>
            <td><small><strong>${row.machine_reference || ''}</strong></small></td>
            <td><small><strong>${row.item_code || ''}</strong></small></td>
            <td><small><span class="badge badge-info">${row.lot_number || ''}</span></small></td>
            <td class="text-right"><small><strong>${row.actual_quantity || 0}</strong></small></td>
            <td class="text-right"><small>${row.availability_pct || 0}%</small></td>
            <td class="text-right"><small>${row.performance_pct || 0}%</small></td>
            <td class="text-right"><small>${row.quality_pct || 0}%</small></td>
            <td class="text-right ${oeeClass} oee-clickable" onclick="showOEEDetails(event, ${index})"><strong>${row.oee_pct || 0}%</strong></td>
            <td class="text-center" style="vertical-align: middle;">
                <div style="display: flex; flex-direction: column; align-items: center;">
                    ${inspectionDisplay}
                    ${actionButton}
                </div>
            </td>
        `;
        tr.dataset.rowData = JSON.stringify(row);
        tr.dataset.rowIndex = index;
        
        tr.addEventListener('mouseenter', function() { this.style.backgroundColor = '#f8f9fa'; });
        tr.addEventListener('mouseleave', function() { this.style.backgroundColor = ''; });
        
        tableBody.appendChild(tr);
    });

    // Delegate action buttons
    tableBody.querySelectorAll('button[data-action]')?.forEach(btn => {
        btn.addEventListener('click', (e) => {
            const idx = parseInt(e.currentTarget.getAttribute('data-index'));
            const action = e.currentTarget.getAttribute('data-action');
            if (!resolutionPanel) resolutionPanel = new ResolutionPanel();
            if (action === 'resolve') return resolutionPanel.open(idx);
            if (action === 'view') return resolutionPanel.open(idx);
        });
    });
}

function showOEEDetails(event, rowIndex) {
    event.preventDefault();
    
    // Get the row data
    const row = document.querySelectorAll('[data-row-index]')[rowIndex];
    const rowData = JSON.parse(row.dataset.rowData);
    
    // Populate modal with data
    document.getElementById('modal-date').textContent = rowData.production_date_formatted || '';
    document.getElementById('modal-shift').textContent = rowData.shift_type || '';
    document.getElementById('modal-lot').textContent = rowData.lot_number || '';
    document.getElementById('modal-item').textContent = rowData.item_code || '';
    document.getElementById('modal-operator').textContent = rowData.operator_name || '-';
    
    // OEE Score
    document.getElementById('modal-oee-score').textContent = rowData.oee_pct + '%';
    
    // Availability Details
    document.getElementById('modal-availability-pct').textContent = rowData.availability_pct + '%';
    document.getElementById('modal-planned-time').textContent = rowData.planned_time_minutes || 450;
    document.getElementById('modal-downtime').textContent = rowData.downtime_minutes ? rowData.downtime_minutes.toFixed(1) : '0.0';
    document.getElementById('modal-available-time').textContent = rowData.available_time_minutes || 450;
    
    // Performance Details
    document.getElementById('modal-performance-pct').textContent = rowData.performance_pct + '%';
    document.getElementById('modal-cycle-time').textContent = rowData.cycle_time_seconds ? rowData.cycle_time_seconds.toFixed(2) : '0.00';
    document.getElementById('modal-actual-qty').textContent = rowData.actual_quantity || 0;
    document.getElementById('modal-perf-available-time').textContent = rowData.available_time_minutes || 450;
    
    // Quality Details
    document.getElementById('modal-quality-pct').textContent = rowData.quality_pct + '%';
    document.getElementById('modal-good-pieces').textContent = rowData.good_pieces || 0;
    document.getElementById('modal-total-inspected').textContent = rowData.total_inspected || 0;
    document.getElementById('modal-rejected-pieces').textContent = rowData.rejected_pieces || 0;
    
    // Show the modal
    $('#oeeDetailModal').modal('show');
}

function initializeTableSorting() {
    document.querySelectorAll('.sortable').forEach(header => {
        header.addEventListener('click', function() {
            const column = this.getAttribute('data-column');
            const type = this.getAttribute('data-type');
            
            // Update sort direction
            if (currentSort.column === column) {
                currentSort.direction = currentSort.direction === 'asc' ? 'desc' : 'asc';
            } else {
                currentSort.column = column;
                currentSort.direction = 'asc';
            }
            
            // Sort data
            sortedData = [...currentData].sort((a, b) => {
                let aVal = a[column];
                let bVal = b[column];
                
                if (type === 'number') {
                    aVal = parseFloat(aVal) || 0;
                    bVal = parseFloat(bVal) || 0;
                } else if (type === 'date') {
                    aVal = new Date(aVal);
                    bVal = new Date(bVal);
                } else {
                    aVal = String(aVal).toLowerCase();
                    bVal = String(bVal).toLowerCase();
                }
                
                if (currentSort.direction === 'asc') {
                    return aVal > bVal ? 1 : -1;
                } else {
                    return aVal < bVal ? -1 : 1;
                }
            });
            
            // Update table
            updateTable(sortedData);
            
            // Update sort indicators
            updateSortIndicators();
        });
    });
}

function updateSortIndicators() {
    // Clear all sort indicators
    document.querySelectorAll('.sortable').forEach(header => {
        header.classList.remove('sort-asc', 'sort-desc');
    });
    
    // Add indicator to current sorted column
    if (currentSort.column) {
        const header = document.querySelector(`.sortable[data-column="${currentSort.column}"]`);
        if (header) {
            header.classList.add(currentSort.direction === 'asc' ? 'sort-asc' : 'sort-desc');
        }
    }
}

function checkExistingReport() {
    /**
     * Check if a Daily OEE Report already exists for the selected date and filters
     * Called when user loads dashboard or changes production date/filters
     */
    const productionDate = document.getElementById('production_date').value;
    const shiftFilter = document.getElementById('shift_filter').value;
    const machineFilter = document.getElementById('machine_filter').value;
    
    if (!productionDate) return;
    
    frappe.call({
        method: 'smart_screens.smart_screens.doctype.daily_oee_report.daily_oee_report.check_existing_report',
        args: {
            production_date: productionDate,
            shift_filter: shiftFilter === 'all' ? '' : shiftFilter,
            machine_filter: machineFilter === 'all' ? '' : machineFilter
        },
        callback: function(r) {
            if (r.message && r.message.exists) {
                existingReportInfo = r.message;
                showExistingReportNotification(r.message);
            } else {
                existingReportInfo = null;
                hideExistingReportNotification();
            }
        },
        error: function(err) {
            console.error('Error checking existing report:', err);
        }
    });
}

function showExistingReportNotification(reportInfo) {
    /**
     * Display notification banner when existing report is found
     */
    let notificationDiv = document.getElementById('existing-report-notification');
    
    if (!notificationDiv) {
        // Create notification div if it doesn't exist
        const filterSection = document.querySelector('.filter-section');
        
        // Check if filterSection exists before trying to insert notification
        if (!filterSection) {
            console.warn('Filter section not found, cannot display existing report notification');
            return;
        }
        
        notificationDiv = document.createElement('div');
        notificationDiv.id = 'existing-report-notification';
        notificationDiv.className = 'alert alert-info';
        notificationDiv.style.marginTop = '15px';
        filterSection.parentElement.insertBefore(notificationDiv, filterSection.nextSibling);
    }
    
    const isDraft = reportInfo.docstatus === 0;
    const isSubmitted = reportInfo.docstatus === 1;
    
    if (isDraft) {
        // Draft report - show resume option
        notificationDiv.innerHTML = `
            <div style="display: flex; align-items: center; justify-content: space-between;">
                <div>
                    <strong>📋 Existing Draft Report Found:</strong> ${reportInfo.report_name}<br>
                    <small>
                        Total Records: ${reportInfo.total_records} | 
                        Resolved: <span style="color: green;">${reportInfo.resolved_count}</span> | 
                        Pending: <span style="color: red;">${reportInfo.pending_count}</span>
                    </small>
                </div>
                <div>
                    <button class="btn btn-primary btn-sm" onclick="resumeExistingReport()" style="margin-right: 5px;">
                        <i class="fa fa-play"></i> Resume Report
                    </button>
                    <button class="btn btn-default btn-sm" onclick="viewExistingReport()">
                        <i class="fa fa-eye"></i> View Report
                    </button>
                </div>
            </div>
        `;
        notificationDiv.className = 'alert alert-warning';
    } else if (isSubmitted) {
        // Submitted report - show view only
        notificationDiv.innerHTML = `
            <div style="display: flex; align-items: center; justify-content: space-between;">
                <div>
                    <strong>✅ Report Already Submitted:</strong> ${reportInfo.report_name}<br>
                    <small>Total Records: ${reportInfo.total_records} | Status: <span style="color: green;">Submitted</span></small>
                </div>
                <div>
                    <button class="btn btn-default btn-sm" onclick="viewExistingReport()">
                        <i class="fa fa-eye"></i> View Report
                    </button>
                </div>
            </div>
        `;
        notificationDiv.className = 'alert alert-success';
    }
    
    notificationDiv.style.display = 'block';
}

function hideExistingReportNotification() {
    const notificationDiv = document.getElementById('existing-report-notification');
    if (notificationDiv) {
        notificationDiv.style.display = 'none';
    }
}

function resumeExistingReport() {
    if (!existingReportInfo || !existingReportInfo.report_name) {
        frappe.msgprint('No existing report information available');
        return;
    }
    
    showLoading();
    
    frappe.call({
        method: 'smart_screens.smart_screens.doctype.daily_oee_report.daily_oee_report.get_report_data',
        args: {
            report_name: existingReportInfo.report_name
        },
        callback: function(r) {
            hideLoading();
            
            if (r.message && r.message.success) {
                // Load the saved report data
                const savedData = r.message.data;
                
                // Set current data from saved report
                currentData = savedData.production_records || [];
                sortedData = [...currentData];
                
                // Update table with saved data
                updateTable(sortedData);
                
                // Update summary from saved report
                if (savedData.summary) {
                    updateSummaryCards(savedData.summary);
                }
                
                // Store report metadata - CRITICAL: Set savedReportName immediately
                reportGenerated = true;
                savedReportName = existingReportInfo.report_name;
                
                // Store report data for saving (use correct variable name)
                reportData = {
                    filters: savedData.filters || {
                        production_date: document.getElementById('production_date').value,
                        shift_filter: document.getElementById('shift_filter').value,
                        machine_filter: document.getElementById('machine_filter').value
                    },
                    data: currentData,
                    summary: savedData.summary,
                    generated_at: savedData.generated_at || new Date().toISOString()
                };
                
                // Show action buttons
                showReportActionButtons();
                
                // Hide the notification banner since we're now in resume mode
                hideExistingReportNotification();
                
                frappe.show_alert({
                    message: `Resumed report: ${existingReportInfo.report_name} with ${currentData.length} records`,
                    indicator: 'blue'
                });
                
                console.log('✅ Report resumed successfully:', {
                    savedReportName: savedReportName,
                    recordCount: currentData.length,
                    reportGenerated: reportGenerated
                });
            } else {
                frappe.msgprint('Error loading report data: ' + (r.message.error || 'Unknown error'));
            }
        },
        error: function(err) {
            hideLoading();
            console.error('Error resuming report:', err);
            frappe.msgprint('Error loading existing report. Please try again.');
        }
    });
}

function viewExistingReport() {
    /**
     * Open the existing Daily OEE Report document
     */
    if (existingReportInfo && existingReportInfo.report_name) {
        frappe.set_route('Form', 'Daily OEE Report', existingReportInfo.report_name);
    }
}

function calculateSummaryFromData(data) {
    /**
     * Calculate summary statistics from loaded production data
     */
    if (!data || data.length === 0) {
        return {
            avg_availability: 0,
            avg_performance: 0,
            avg_quality: 0,
            avg_oee: 0
        };
    }
    
    const total = data.length;
    const totalAvailability = data.reduce((sum, r) => sum + (r.availability_pct || 0), 0);
    const totalPerformance = data.reduce((sum, r) => sum + (r.performance_pct || 0), 0);
    const totalQuality = data.reduce((sum, r) => sum + (r.quality_pct || 0), 0);
    const totalOEE = data.reduce((sum, r) => sum + (r.oee_pct || 0), 0);
    
    return {
        avg_availability: (totalAvailability / total).toFixed(2),
        avg_performance: (totalPerformance / total).toFixed(2),
        avg_quality: (totalQuality / total).toFixed(2),
        avg_oee: (totalOEE / total).toFixed(2)
    };
}

// Event listeners for filter changes
document.addEventListener('DOMContentLoaded', function() {
    // Check for existing report when date or filters change
    const productionDateEl = document.getElementById('production_date');
    const processFilterEl = document.getElementById('process_filter');
    const shiftFilterEl = document.getElementById('shift_filter');
    const machineFilterEl = document.getElementById('machine_filter');
    
    if (productionDateEl) {
        productionDateEl.addEventListener('change', function() {
            loadShiftOptions();
            checkExistingReport(); // Check for existing report
        });
    }
    
    if (processFilterEl) {
        processFilterEl.addEventListener('change', function() {
            loadShiftOptions();
            checkExistingReport(); // Check for existing report
        });
    }
    
    if (shiftFilterEl) {
        shiftFilterEl.addEventListener('change', function() {
            checkExistingReport(); // Check for existing report
        });
    }
    
    if (machineFilterEl) {
        machineFilterEl.addEventListener('change', function() {
            checkExistingReport(); // Check for existing report
        });
    }

    // Ensure panel exists on DOM ready
    if (!resolutionPanel) resolutionPanel = new ResolutionPanel();
});

// Utility functions used by HTML buttons
function generateReport() {
    // Validate filters
    const productionDate = document.getElementById('production_date').value;
    if (!productionDate) {
        frappe.msgprint('Please select a production date');
        return;
    }
    
    // First, check if a report already exists for this date/filter combination
    const processType = document.getElementById('process_filter').value;
    const shiftFilter = document.getElementById('shift_filter').value;
    const machineFilter = document.getElementById('machine_filter').value;
    
    showLoading();
    
    frappe.call({
        method: 'smart_screens.smart_screens.doctype.daily_oee_report.daily_oee_report.check_existing_report',
        args: {
            production_date: productionDate,
            shift_filter: shiftFilter === 'all' ? '' : shiftFilter,
            machine_filter: machineFilter === 'all' ? '' : machineFilter
        },
        callback: function(check_r) {
            if (check_r.message && check_r.message.exists) {
                // Report already exists
                hideLoading();
                existingReportInfo = check_r.message;
                
                const isDraft = check_r.message.docstatus === 0;
                const isSubmitted = check_r.message.docstatus === 1;
                
                if (isSubmitted) {
                    // Already submitted - just view it
                    frappe.msgprint({
                        title: 'Report Already Submitted',
                        message: `A report has already been submitted for this date/filter combination: <strong>${check_r.message.report_name}</strong>`,
                        primary_action: {
                            label: 'View Report',
                            action: function() {
                                frappe.set_route('Form', 'Daily OEE Report', check_r.message.report_name);
                            }
                        }
                    });
                    return;
                }
                
                if (isDraft) {
                    // Draft exists - ask to resume or replace
                    frappe.confirm(
                        `A draft report exists: <strong>${check_r.message.report_name}</strong><br><br>` +
                        `<small>Total Records: ${check_r.message.total_records} | ` +
                        `Resolved: <span style="color: green;">${check_r.message.resolved_count}</span> | ` +
                        `Pending: <span style="color: red;">${check_r.message.pending_count}</span></small><br><br>` +
                        `Do you want to <strong>Resume</strong> the existing report?<br>` +
                        `<small>(Click "No" to replace it with fresh data)</small>`,
                        function() {
                            // User clicked Yes - Resume existing report
                            resumeExistingReport();
                        },
                        function() {
                            // User clicked No - Replace with fresh data
                            frappe.confirm(
                                'Are you sure you want to replace the existing draft with fresh data?<br>' +
                                '<span style="color: red;">This will DELETE the existing report and any CAR resolutions.</span>',
                                function() {
                                    // Delete the old draft and generate fresh
                                    deleteAndRegenerateReport(check_r.message.report_name, productionDate, processType, shiftFilter, machineFilter);
                                }
                            );
                        }
                    );
                    return;
                }
            }
            
            // No existing report - proceed with generating fresh data
            generateFreshReport(productionDate, processType, shiftFilter, machineFilter);
        },
        error: function(err) {
            hideLoading();
            console.error('Error checking existing report:', err);
            frappe.msgprint('Error checking for existing reports. Please try again.');
        }
    });
}

function deleteAndRegenerateReport(oldReportName, productionDate, processType, shiftFilter, machineFilter) {
    showLoading();
    
    // Delete the old draft report
    frappe.call({
        method: 'frappe.client.delete',
        args: {
            doctype: 'Daily OEE Report',
            name: oldReportName
        },
        callback: function(r) {
            console.log('✅ Old report deleted:', oldReportName);
            
            // Clear state
            savedReportName = null;
            existingReportInfo = null;
            reportGenerated = false;
            reportData = null;
            hideExistingReportNotification();
            
            // Generate fresh report
            frappe.show_alert({
                message: 'Old report deleted. Generating fresh data...',
                indicator: 'orange'
            });
            
            generateFreshReport(productionDate, processType, shiftFilter, machineFilter);
        },
        error: function(err) {
            hideLoading();
            console.error('Error deleting old report:', err);
            frappe.msgprint('Error deleting old report. Please try again.');
        }
    });
}

function generateFreshReport(productionDate, processType, shiftFilter, machineFilter) {
    // This function generates a fresh report from production data
    const lotFilter = null;
    const itemFilter = null;
    
    // Load main OEE data
    frappe.call({
        method: 'smart_screens.smart_screens.page.oee_dashboard.oee_dashboard.get_oee_data',
        args: {
            production_date: productionDate,
            process_type: processType,
            shift_filter: shiftFilter,
            machine_filter: machineFilter,
            lot_filter: lotFilter,
            item_filter: itemFilter
        },
        callback: function(r) {
            if (r.message) {
                currentData = r.message;
                sortedData = [...currentData];
                updateTable(sortedData);
                
                // Load summary statistics
                frappe.call({
                    method: 'smart_screens.smart_screens.page.oee_dashboard.oee_dashboard.get_oee_summary',
                    args: {
                        production_date: productionDate,
                        process_type: processType,
                        shift_filter: shiftFilter,
                        machine_filter: machineFilter,
                        lot_filter: lotFilter,
                        item_filter: itemFilter
                    },
                    callback: function(summary_r) {
                        hideLoading();
                        
                        if (summary_r.message) {
                            updateSummaryCards(summary_r.message);
                            
                            // Store report data
                            reportData = {
                                filters: {
                                    production_date: productionDate,
                                    process_type: processType,
                                    shift_filter: shiftFilter,
                                    machine_filter: machineFilter,
                                    lot_filter: lotFilter,
                                    item_filter: itemFilter
                                },
                                data: currentData,
                                summary: summary_r.message,
                                generated_at: new Date().toISOString()
                            };
                            
                            // Mark report as generated and show action buttons
                            reportGenerated = true;
                            savedReportName = null; // Clear any previous saved report name
                            existingReportInfo = null; // Clear existing report info
                            showReportActionButtons();
                            
                            frappe.show_alert({
                                message: `Report generated successfully with ${currentData.length} records`,
                                indicator: 'green'
                            });
                        }
                    },
                    error: function(err) {
                        console.error('Error loading summary:', err);
                        hideLoading();
                        frappe.msgprint('Error generating report summary. Please try again.');
                    }
                });
            }
        },
        error: function(err) {
            console.error('Error loading OEE data:', err);
            hideLoading();
            frappe.msgprint('Error generating report. Please try again.');
        }
    });
}

function showReportActionButtons() {
    const actionButtonsDiv = document.getElementById('report-action-buttons');
    if (actionButtonsDiv) {
        actionButtonsDiv.style.display = 'block';
    }
}

function hideReportActionButtons() {
    const actionButtonsDiv = document.getElementById('report-action-buttons');
    if (actionButtonsDiv) {
        actionButtonsDiv.style.display = 'none';
    }
}

function submitReport() {
    if (!reportGenerated || !reportData) {
        frappe.msgprint('Please generate a report first');
        return;
    }
    
    // Show dialog to collect remarks fields before submission
    const dialog = new frappe.ui.Dialog({
        title: 'Submit Daily OEE Report',
        fields: [
            {
                label: 'Report Remarks',
                fieldtype: 'Section Break',
            },
            {
                label: 'General Remarks',
                fieldname: 'general_remarks',
                fieldtype: 'Small Text',
                description: 'Overall observations and notes about the production day'
            },
            {
                label: 'Suggestions for Improvement',
                fieldname: 'suggestions_for_improvement',
                fieldtype: 'Small Text',
                description: 'Ideas and recommendations to improve OEE and production efficiency'
            },
            {
                label: 'Safety and Machinery',
                fieldname: 'safety_and_machinery',
                fieldtype: 'Small Text',
                description: 'Safety incidents, concerns, and machinery maintenance observations'
            },
            {
                label: 'Mould Observation',
                fieldname: 'mould_observation',
                fieldtype: 'Small Text',
                description: 'Notes on mould conditions, performance, and maintenance needs'
            },
            {
                label: 'Tool Observation',
                fieldname: 'tool_observation',
                fieldtype: 'Small Text',
                description: 'Notes on tool conditions and any issues encountered'
            }
        ],
        primary_action_label: 'Submit Report',
        primary_action(values) {
            // Add remarks to report data
            reportData.remarks = {
                general_remarks: values.general_remarks || '',
                suggestions_for_improvement: values.suggestions_for_improvement || '',
                safety_and_machinery: values.safety_and_machinery || '',
                mould_observation: values.mould_observation || '',
                tool_observation: values.tool_observation || ''
            };
            
            dialog.hide();
            
            // Proceed with submission
            showLoading();
            
            frappe.call({
                method: 'smart_screens.smart_screens.page.oee_dashboard.oee_dashboard.submit_oee_report',
                args: {
                    report_data: reportData
                },
                callback: function(r) {
                    hideLoading();
                    
                    if (r.message && r.message.success) {
                        frappe.show_alert({
                            message: 'Report submitted successfully',
                            indicator: 'green'
                        });
                        
                        // Reset report state
                        reportGenerated = false;
                        reportData = null;
                        savedReportName = null;
                        hideReportActionButtons();
                        
                        // Optionally show the report document
                        if (r.message.report_name) {
                            frappe.msgprint({
                                title: 'Report Submitted',
                                message: `Report "${r.message.report_name}" has been submitted successfully.`,
                                primary_action: {
                                    label: 'View Report',
                                    action: function() {
                                        frappe.set_route('Form', 'Daily OEE Report', r.message.report_name);
                                    }
                                }
                            });
                        }
                    } else {
                        const error_msg = (r.message && r.message.error) || 'Failed to submit report';
                        frappe.msgprint(error_msg);
                    }
                },
                error: function(err) {
                    hideLoading();
                    console.error('Error submitting report:', err);
                    frappe.msgprint('Error submitting report. Please try again.');
                }
            });
        }
    });
    
    dialog.show();
}

function saveReport() {
    if (!reportGenerated || !reportData) {
        frappe.msgprint('Please generate a report first');
        return;
    }
    
    // Save as draft
    showLoading();
    
    frappe.call({
        method: 'smart_screens.smart_screens.page.oee_dashboard.oee_dashboard.save_oee_report',
        args: {
            report_data: reportData
        },
        callback: function(r) {
            hideLoading();
            
            if (r.message && r.message.success) {
                // Store the report name for later use
                savedReportName = r.message.report_name;
                
                frappe.show_alert({
                    message: 'Report saved successfully',
                    indicator: 'blue'
                });
                
                // Show the report document
                if (r.message.report_name) {
                    frappe.msgprint({
                        title: 'Report Saved',
                        message: `Report "${r.message.report_name}" has been saved as draft. You can now generate CARs for low OEE records.`,
                        primary_action: {
                            label: 'View Report',
                            action: function() {
                                frappe.set_route('Form', 'Daily OEE Report', r.message.report_name);
                            }
                        }
                    });
                }
            } else {
                const error_msg = (r.message && r.message.error) || 'Failed to save report';
                frappe.msgprint(error_msg);
            }
        },
        error: function(err) {
            hideLoading();
            console.error('Error saving report:', err);
            frappe.msgprint('Error saving report. Please try again.');
        }
    });
}

function applyFilters() {
    // Redirect to generateReport function
    generateReport();
}

function refreshData() {
    // Reset report state
    reportGenerated = false;
    reportData = null;
    hideReportActionButtons();
    
    // Reload data
    loadData();
}