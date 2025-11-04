/**
 * OEE Report Review Page - Frontend Controller
 * Provides interactive review interface for Daily OEE Reports
 */

// Global state
let currentFilters = {};
let currentPage = 0;
let pageLength = 20;
let totalCount = 0;
let currentReportName = null;

// Initialize the page
frappe.pages['oee-report-review'].on_page_load = function(wrapper) {
    var page = frappe.ui.make_app_page({
        parent: wrapper,
        title: 'OEE Report Review',
        single_column: true
    });
    
    page.main.html(frappe.render_template('oee_report_review'));
    
    // Wait for DOM to be ready
    setTimeout(() => {
        // Initialize date filters (default: last 30 days)
        initializeDateFilters();
        
        // Bind event listeners
        bindEventListeners();
        
        // Load initial data
        loadDashboardData();
    }, 100);
};

function initializeDateFilters() {
    const today = new Date();
    const thirtyDaysAgo = new Date(today.getTime() - (30 * 24 * 60 * 60 * 1000));
    
    document.getElementById('to-date').value = formatDateForInput(today);
    document.getElementById('from-date').value = formatDateForInput(thirtyDaysAgo);
}

function formatDateForInput(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function bindEventListeners() {
    // Apply filters button
    document.getElementById('apply-filters-btn')?.addEventListener('click', function() {
        currentPage = 0;
        loadDashboardData();
    });
    
    // Refresh button
    document.getElementById('refresh-btn')?.addEventListener('click', function() {
        loadDashboardData();
    });
    
    // Export button
    document.getElementById('export-btn')?.addEventListener('click', function() {
        exportReports();
    });
    
    // Pagination
    document.getElementById('prev-page')?.addEventListener('click', function() {
        if (currentPage > 0) {
            currentPage--;
            loadReportsList();
        }
    });
    
    document.getElementById('next-page')?.addEventListener('click', function() {
        if ((currentPage + 1) * pageLength < totalCount) {
            currentPage++;
            loadReportsList();
        }
    });
    
    // Tab switching - Completely prevent URL hash change
    $('a[data-toggle="tab"]').on('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        
        const targetTab = $(this).attr('href');
        
        // Manually activate the tab
        $('a[data-toggle="tab"]').removeClass('active');
        $(this).addClass('active');
        
        $('.tab-pane').removeClass('show active');
        $(targetTab).addClass('show active');
        
        // Load analytics data when switching to analytics tab
        if (targetTab === '#analytics-tab') {
            loadAnalyticsData();
        }
        
        return false;
    });
}

function getFilters() {
    return {
        from_date: document.getElementById('from-date').value,
        to_date: document.getElementById('to-date').value,
        shift_filter: document.getElementById('shift-filter').value,
        machine_filter: document.getElementById('machine-filter').value,
        oee_range: document.getElementById('oee-range').value
    };
}

function loadDashboardData() {
    currentFilters = getFilters();
    showLoading();
    
    // Load summary and reports list in parallel
    Promise.all([
        loadSummaryData(),
        loadReportsList()
    ]).then(() => {
        hideLoading();
    }).catch(err => {
        console.error('Error loading dashboard data:', err);
        hideLoading();
        frappe.msgprint('Error loading data. Please try again.');
    });
}

function loadSummaryData() {
    return new Promise((resolve, reject) => {
        frappe.call({
            method: 'smart_screens.smart_screens.page.oee_report_review.oee_report_review.get_reports_summary',
            args: { filters: currentFilters },
            callback: function(r) {
                if (r.message) {
                    updateSummaryCards(r.message);
                    resolve();
                } else {
                    reject('No data returned');
                }
            },
            error: reject
        });
    });
}

function updateSummaryCards(summary) {
    document.getElementById('total-reports').textContent = summary.total_reports || 0;
    document.getElementById('submitted-reports').textContent = summary.submitted_reports || 0;
    document.getElementById('draft-reports').textContent = summary.draft_reports || 0;
    document.getElementById('avg-oee').textContent = (summary.overall_avg_oee || 0) + '%';
    document.getElementById('unique-dates').textContent = summary.unique_dates || 0;
    document.getElementById('total-records').textContent = summary.total_production_records || 0;
    
    // Resolution status
    const resolutionSummary = summary.resolution_summary || {};
    document.getElementById('resolved-count').textContent = resolutionSummary.Resolved || 0;
    document.getElementById('pending-count').textContent = resolutionSummary.Pending || 0;
    document.getElementById('in-progress-count').textContent = resolutionSummary['In Progress'] || 0;
}

function loadReportsList() {
    return new Promise((resolve, reject) => {
        frappe.call({
            method: 'smart_screens.smart_screens.page.oee_report_review.oee_report_review.get_reports_list',
            args: {
                filters: currentFilters,
                start: currentPage * pageLength,
                page_length: pageLength
            },
            callback: function(r) {
                if (r.message) {
                    totalCount = r.message.total_count || 0;
                    renderReportsTable(r.message.data || []);
                    updatePagination();
                    resolve();
                } else {
                    reject('No data returned');
                }
            },
            error: reject
        });
    });
}

function renderReportsTable(reports) {
    const tbody = document.getElementById('reports-table-body');
    tbody.innerHTML = '';
    
    if (reports.length === 0) {
        tbody.innerHTML = '<tr><td colspan="12" class="text-center py-4">No reports found for the selected criteria</td></tr>';
        return;
    }
    
    reports.forEach(report => {
        const tr = document.createElement('tr');
        
        // Color-code OEE
        let oeeClass = 'text-success';
        if (report.avg_oee < 70) oeeClass = 'text-danger';
        else if (report.avg_oee < 85) oeeClass = 'text-warning';
        
        // Status badge
        const statusBadge = report.docstatus === 1 
            ? '<span class="badge badge-success">Submitted</span>'
            : '<span class="badge badge-warning">Draft</span>';
        
        // Resolution summary
        const resolutionHTML = `
            <small>
                <span class="text-success">${report.resolved_count || 0}</span> / 
                <span class="text-danger">${report.pending_count || 0}</span>
                ${report.in_progress_count > 0 ? `<br><span class="text-warning">${report.in_progress_count} In Progress</span>` : ''}
            </small>
        `;
        
        tr.innerHTML = `
            <td><a href="#" onclick="openReportForm('${report.name}')">${report.name}</a></td>
            <td>${report.production_date_formatted}</td>
            <td>${report.shift_filter || 'All'}</td>
            <td>${report.machine_filter || 'All'}</td>
            <td class="text-center">${report.total_production_records || 0}</td>
            <td class="text-center ${oeeClass}"><strong>${report.avg_oee}%</strong></td>
            <td class="text-center">${report.avg_availability}%</td>
            <td class="text-center">${report.avg_performance}%</td>
            <td class="text-center">${report.avg_quality}%</td>
            <td class="text-center">${statusBadge}</td>
            <td class="text-center">${resolutionHTML}</td>
            <td class="text-center">
                <button class="btn btn-xs btn-primary" onclick="viewReportDetails('${report.name}')">
                    <i class="fa fa-eye"></i> View
                </button>
            </td>
        `;
        
        tbody.appendChild(tr);
    });
}

function updatePagination() {
    const start = currentPage * pageLength + 1;
    const end = Math.min((currentPage + 1) * pageLength, totalCount);
    document.getElementById('pagination-info').textContent = `Showing ${start}-${end} of ${totalCount} reports`;
    
    // Enable/disable pagination buttons
    document.getElementById('prev-page').disabled = currentPage === 0;
    document.getElementById('next-page').disabled = (currentPage + 1) * pageLength >= totalCount;
}

// Make these functions global so they can be called from onclick handlers
window.openReportForm = function(reportName) {
    // Get the production date from the report
    frappe.call({
        method: 'frappe.client.get_value',
        args: {
            doctype: 'Daily OEE Report',
            filters: { name: reportName },
            fieldname: 'production_date'
        },
        callback: function(r) {
            if (r.message && r.message.production_date) {
                // Navigate to OEE Dashboard with production date as query parameter
                const productionDate = r.message.production_date;
                
                // Method 1: Using window.location with query parameters (most reliable)
                const currentPath = window.location.pathname.split('/app')[0];
                window.location.href = `${currentPath}/app/oee-dashboard?date=${productionDate}`;
                
                // Alternative Method 2: Using frappe.set_route with hash
                // frappe.set_route('oee-dashboard');
                // setTimeout(() => {
                //     window.location.hash = `#oee-dashboard?date=${productionDate}`;
                // }, 100);
            } else {
                // Fallback: just navigate to OEE Dashboard without date
                frappe.set_route('oee-dashboard');
            }
        },
        error: function() {
            // Fallback on error
            frappe.set_route('oee-dashboard');
        }
    });
}

window.viewReportDetails = function(reportName) {
    currentReportName = reportName;
    showLoading();
    
    frappe.call({
        method: 'smart_screens.smart_screens.page.oee_report_review.oee_report_review.get_report_details',
        args: { report_name: reportName },
        callback: function(r) {
            hideLoading();
            
            if (r.message) {
                renderReportDetails(r.message);
                $('#report-details-modal').modal('show');
            }
        },
        error: function(err) {
            hideLoading();
            console.error('Error loading report details:', err);
            frappe.msgprint('Error loading report details');
        }
    });
}

function renderReportDetails(data) {
    const report = data.report;
    const records = data.production_records || [];
    
    let html = `
        <div class="report-details">
            <div class="row mb-3">
                <div class="col-md-6">
                    <h6>Report Information</h6>
                    <table class="table table-sm table-bordered">
                        <tr><th>Report ID:</th><td>${report.name}</td></tr>
                        <tr><th>Production Date:</th><td>${frappe.datetime.str_to_user(report.production_date)}</td></tr>
                        <tr><th>Report Date:</th><td>${frappe.datetime.str_to_user(report.report_date)}</td></tr>
                        <tr><th>Shift Filter:</th><td>${report.shift_filter || 'All'}</td></tr>
                        <tr><th>Machine Filter:</th><td>${report.machine_filter || 'All'}</td></tr>
                        <tr><th>Status:</th><td>${report.docstatus === 1 ? '<span class="badge badge-success">Submitted</span>' : '<span class="badge badge-warning">Draft</span>'}</td></tr>
                    </table>
                </div>
                <div class="col-md-6">
                    <h6>Summary Metrics</h6>
                    <table class="table table-sm table-bordered">
                        <tr><th>Total Records:</th><td>${report.total_records}</td></tr>
                        <tr><th>Avg OEE:</th><td><strong>${parseFloat(report.avg_oee).toFixed(2)}%</strong></td></tr>
                        <tr><th>Avg Availability:</th><td>${parseFloat(report.avg_availability).toFixed(2)}%</td></tr>
                        <tr><th>Avg Performance:</th><td>${parseFloat(report.avg_performance).toFixed(2)}%</td></tr>
                        <tr><th>Avg Quality:</th><td>${parseFloat(report.avg_quality).toFixed(2)}%</td></tr>
                    </table>
                </div>
            </div>
            
            <h6>Production Records (${records.length})</h6>
            <div class="table-responsive">
                <table class="table table-sm table-bordered table-hover">
                    <thead class="thead-light">
                        <tr>
                            <th>Item</th>
                            <th>Lot</th>
                            <th class="text-center">Availability %</th>
                            <th class="text-center">Performance %</th>
                            <th class="text-center">Rejection %</th>
                            <th class="text-center">OEE %</th>
                            <th>Reason Code</th>
                            <th class="text-center">Status</th>
                        </tr>
                    </thead>
                    <tbody>
    `;
    
    records.forEach(rec => {
        const oeeClass = rec.oee_pct < 70 ? 'text-danger' : (rec.oee_pct < 85 ? 'text-warning' : 'text-success');
        const statusBadge = rec.resolution_status === 'Resolved'
            ? '<span class="badge badge-success">Resolved</span>'
            : rec.resolution_status === 'In Progress'
            ? '<span class="badge badge-warning">In Progress</span>'
            : '<span class="badge badge-danger">Pending</span>';

        // Calculate rejection % (100 - quality)
        const rejectionPct = rec.quality_pct ? (100 - parseFloat(rec.quality_pct)).toFixed(2) : '0.00';

        // Make reason code clickable if there's a resolved record
        const reasonCodeHtml = rec.resolved_record && rec.reason_code
            ? `<a href="#" onclick="viewCARDetails('${rec.resolved_record}'); return false;" class="text-primary" style="cursor: pointer;">
                <small><i class="fa fa-file-text-o"></i> ${rec.reason_code}</small>
               </a>`
            : `<small>${rec.reason_code || '-'}</small>`;

        html += `
            <tr>
                <td>${rec.item_code || '-'}</td>
                <td>${rec.lot_number || '-'}</td>
                <td class="text-center">${parseFloat(rec.availability_pct || 0).toFixed(2)}%</td>
                <td class="text-center">${parseFloat(rec.performance_pct || 0).toFixed(2)}%</td>
                <td class="text-center">${rejectionPct}%</td>
                <td class="text-center ${oeeClass}"><strong>${parseFloat(rec.oee_pct || 0).toFixed(2)}%</strong></td>
                <td>${reasonCodeHtml}</td>
                <td class="text-center">${statusBadge}</td>
            </tr>
        `;
    });
    
    html += `
                    </tbody>
                </table>
            </div>
        </div>
    `;
    
    document.getElementById('report-details-content').innerHTML = html;
    
    // Set up open report button
    document.getElementById('open-report-btn').onclick = function() {
        $('#report-details-modal').modal('hide');
        openReportForm(currentReportName);
    };
}

function loadAnalyticsData() {
    showLoading();
    
    frappe.call({
        method: 'smart_screens.smart_screens.page.oee_report_review.oee_report_review.get_analytics_data',
        args: { filters: currentFilters },
        callback: function(r) {
            hideLoading();
            
            if (r.message) {
                renderAnalytics(r.message);
            }
        },
        error: function(err) {
            hideLoading();
            console.error('Error loading analytics:', err);
        }
    });
}

function renderAnalytics(data) {
    // Render OEE Trend Chart
    renderOEETrendChart(data.oee_trend || []);
    
    // Render Top Machines List
    renderTopMachinesList(data.top_machines || []);
    
    // Render Reason Codes Chart
    renderReasonCodesChart(data.reason_codes || []);
    
    // Render Shift Comparison
    renderShiftComparisonChart(data.shift_comparison || []);
}

function renderOEETrendChart(trendData) {
    if (trendData.length === 0) {
        document.getElementById('oee-trend-chart').innerHTML = '<p class="text-center text-muted py-5">No data available</p>';
        return;
    }
    
    const dates = trendData.map(d => frappe.datetime.str_to_user(d.production_date));
    const oeeValues = trendData.map(d => d.avg_oee);
    const availValues = trendData.map(d => d.avg_availability);
    const perfValues = trendData.map(d => d.avg_performance);
    const qualValues = trendData.map(d => d.avg_quality);
    
    const chartHTML = `
        <canvas id="oee-trend-canvas"></canvas>
    `;
    document.getElementById('oee-trend-chart').innerHTML = chartHTML;
    
    // Create simple line chart (using Chart.js if available, otherwise text summary)
    const ctx = document.getElementById('oee-trend-canvas');
    if (typeof Chart !== 'undefined') {
        new Chart(ctx, {
            type: 'line',
            data: {
                labels: dates,
                datasets: [
                    {
                        label: 'OEE %',
                        data: oeeValues,
                        borderColor: '#007bff',
                        backgroundColor: 'rgba(0, 123, 255, 0.1)',
                        fill: true
                    },
                    {
                        label: 'Availability %',
                        data: availValues,
                        borderColor: '#28a745',
                        borderDash: [5, 5]
                    },
                    {
                        label: 'Performance %',
                        data: perfValues,
                        borderColor: '#ffc107',
                        borderDash: [5, 5]
                    },
                    {
                        label: 'Quality %',
                        data: qualValues,
                        borderColor: '#dc3545',
                        borderDash: [5, 5]
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        beginAtZero: true,
                        max: 100
                    }
                }
            }
        });
    } else {
        // Fallback: simple text display
        let html = '<table class="table table-sm"><thead><tr><th>Date</th><th>OEE</th><th>Avail</th><th>Perf</th><th>Qual</th></tr></thead><tbody>';
        trendData.forEach(d => {
            html += `<tr>
                <td>${frappe.datetime.str_to_user(d.production_date)}</td>
                <td>${d.avg_oee}%</td>
                <td>${d.avg_availability}%</td>
                <td>${d.avg_performance}%</td>
                <td>${d.avg_quality}%</td>
            </tr>`;
        });
        html += '</tbody></table>';
        document.getElementById('oee-trend-chart').innerHTML = html;
    }
}

function renderTopMachinesList(machines) {
    const container = document.getElementById('top-machines-list');
    
    if (machines.length === 0) {
        container.innerHTML = '<p class="text-center text-muted">No data available</p>';
        return;
    }
    
    let html = '<div class="list-group list-group-flush">';
    machines.forEach((machine, idx) => {
        const rankBadge = idx < 3 ? `<span class="badge badge-danger">#${idx + 1}</span>` : `<span class="badge badge-secondary">#${idx + 1}</span>`;
        html += `
            <div class="list-group-item d-flex justify-content-between align-items-center">
                <div>
                    ${rankBadge}
                    <strong class="ml-2">${machine.machine_reference || 'Unknown'}</strong>
                    <br>
                    <small class="text-muted">
                        ${machine.issue_count} issues | Avg OEE: ${machine.avg_oee.toFixed(1)}%
                        ${machine.critical_count > 0 ? `| <span class="text-danger">${machine.critical_count} critical</span>` : ''}
                    </small>
                </div>
                <div class="text-right">
                    <div class="progress" style="width: 100px; height: 20px;">
                        <div class="progress-bar ${machine.avg_oee < 70 ? 'bg-danger' : machine.avg_oee < 85 ? 'bg-warning' : 'bg-success'}" 
                             style="width: ${machine.avg_oee}%">
                            ${machine.avg_oee.toFixed(0)}%
                        </div>
                    </div>
                </div>
            </div>
        `;
    });
    html += '</div>';
    container.innerHTML = html;
}

function renderReasonCodesChart(reasonCodes) {
    const container = document.getElementById('reason-codes-chart');
    
    if (reasonCodes.length === 0) {
        container.innerHTML = '<p class="text-center text-muted py-5">No data available</p>';
        return;
    }
    
    // Simple bar chart representation
    let html = '<div class="reason-codes-bars">';
    const maxFreq = Math.max(...reasonCodes.map(r => r.frequency));
    
    reasonCodes.forEach(reason => {
        const percentage = (reason.frequency / maxFreq * 100);
        html += `
            <div class="reason-code-item mb-3">
                <div class="d-flex justify-content-between mb-1">
                    <small><strong>${reason.reason_code}</strong></small>
                    <small>${reason.frequency} occurrences</small>
                </div>
                <div class="progress" style="height: 25px;">
                    <div class="progress-bar bg-info" style="width: ${percentage}%">
                        ${reason.frequency}
                    </div>
                </div>
                <small class="text-muted">Avg OEE Impact: ${reason.avg_oee_impact.toFixed(1)}%</small>
            </div>
        `;
    });
    html += '</div>';
    container.innerHTML = html;
}

function renderShiftComparisonChart(shiftData) {
    const container = document.getElementById('shift-comparison-chart');
    
    if (shiftData.length === 0) {
        container.innerHTML = '<p class="text-center text-muted py-5">No data available</p>';
        return;
    }
    
    let html = '<div class="row">';
    shiftData.forEach(shift => {
        html += `
            <div class="col-md-4">
                <div class="card mb-2">
                    <div class="card-body text-center">
                        <h5>Shift ${shift.shift_filter}</h5>
                        <h3 class="mb-0">${shift.avg_oee.toFixed(1)}%</h3>
                        <small class="text-muted">Average OEE</small>
                        <hr>
                        <div class="row text-left">
                            <div class="col-6"><small>Avail:</small></div>
                            <div class="col-6 text-right"><small><strong>${shift.avg_availability.toFixed(1)}%</strong></small></div>
                            <div class="col-6"><small>Perf:</small></div>
                            <div class="col-6 text-right"><small><strong>${shift.avg_performance.toFixed(1)}%</strong></small></div>
                            <div class="col-6"><small>Qual:</small></div>
                            <div class="col-6 text-right"><small><strong>${shift.avg_quality.toFixed(1)}%</strong></small></div>
                        </div>
                        <small class="text-muted mt-2 d-block">${shift.report_count} reports</small>
                    </div>
                </div>
            </div>
        `;
    });
    html += '</div>';
    container.innerHTML = html;
}

function exportReports() {
    frappe.msgprint('Export functionality will be implemented soon');
    // TODO: Implement Excel/PDF export
}

function showLoading() {
    document.getElementById('loading-overlay').style.display = 'flex';
}

function hideLoading() {
    document.getElementById('loading-overlay').style.display = 'none';
}

// Global function to view CAR details in modal
window.viewCARDetails = function(carName) {
    if (!carName) {
        frappe.msgprint('No CAR record found');
        return;
    }

    showLoading();

    frappe.call({
        method: 'smart_screens.smart_screens.page.oee_report_review.oee_report_review.get_car_details',
        args: { car_name: carName },
        callback: function(r) {
            hideLoading();

            if (r.message) {
                renderCARModal(r.message);
                $('#car-details-modal').modal('show');
            } else {
                frappe.msgprint('CAR details not found');
            }
        },
        error: function(err) {
            hideLoading();
            console.error('Error loading CAR details:', err);
            frappe.msgprint('Error loading CAR details');
        }
    });
}

function renderCARModal(car) {
    // Create modal if it doesn't exist
    if ($('#car-details-modal').length === 0) {
        const modalHTML = `
            <div class="modal fade" id="car-details-modal" tabindex="-1" role="dialog" aria-labelledby="carModalLabel" aria-hidden="true">
                <div class="modal-dialog modal-xl" role="document" style="max-width: 95%;">
                    <div class="modal-content">
                        <div class="modal-header" style="background-color: #36414c; color: white; padding: 10px 15px;">
                            <h5 class="modal-title" id="carModalLabel" style="margin: 0; color: white;">
                                <i class="fa fa-file-text-o"></i> Corrective Action Report Details
                            </h5>
                            <button type="button" class="close" data-dismiss="modal" aria-label="Close" style="color: white; opacity: 1;">
                                <span aria-hidden="true">&times;</span>
                            </button>
                        </div>
                        <div class="modal-body" id="car-details-content" style="max-height: 75vh; overflow-y: auto; padding: 15px;">
                            <!-- Content will be populated here -->
                        </div>
                        <div class="modal-footer" style="padding: 8px 15px;">
                            <button type="button" class="btn btn-sm btn-secondary" data-dismiss="modal">Close</button>
                            <button type="button" class="btn btn-sm btn-primary" id="open-car-form-btn">
                                <i class="fa fa-external-link"></i> Open CAR Form
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        $('body').append(modalHTML);
    }

    // Populate modal content
    const statusBadge = car.status === 'Closed'
        ? '<span class="badge badge-success">Closed</span>'
        : car.status === 'Verified'
        ? '<span class="badge badge-info">Verified</span>'
        : '<span class="badge badge-warning">Resolved</span>';

    const oeeClass = car.oee_pct < 70 ? 'text-danger' : (car.oee_pct < 85 ? 'text-warning' : 'text-success');

    let html = `
        <style>
            .car-compact-card { margin-bottom: 10px; border: 1px solid #d1d8dd; }
            .car-compact-card .card-header {
                background-color: #f5f7fa;
                color: #36414c;
                padding: 6px 12px;
                font-weight: 600;
                border-bottom: 1px solid #d1d8dd;
            }
            .car-compact-card .card-body { padding: 10px 12px; }
            .car-compact-table { margin-bottom: 0; }
            .car-compact-table th {
                width: 35%;
                padding: 3px 8px;
                font-weight: 600;
                font-size: 13px;
                color: #555;
            }
            .car-compact-table td {
                padding: 3px 8px;
                font-size: 13px;
            }
            .car-metric-box {
                text-align: center;
                padding: 8px;
                border: 1px solid #d1d8dd;
                border-radius: 4px;
                background: #f5f7fa;
            }
            .car-metric-box h6 {
                font-size: 11px;
                margin-bottom: 4px;
                color: #6c757d;
                text-transform: uppercase;
            }
            .car-metric-box h4 {
                font-size: 20px;
                margin: 0;
                font-weight: bold;
            }
            .car-text-content {
                border: 1px solid #d1d8dd;
                border-radius: 4px;
                padding: 8px;
                background: #ffffff;
                font-size: 13px;
                max-height: 100px;
                overflow-y: auto;
            }
        </style>
        <div class="car-details-view">
            <!-- Header Section -->
            <div class="row" style="margin-bottom: 10px;">
                <div class="col-12">
                    <h5 style="color: #36414c; margin-bottom: 5px; font-weight: bold;">${car.name}</h5>
                    <p style="margin: 0; font-size: 13px; color: #6c757d;">
                        <strong>Resolved:</strong> ${car.resolved_date_formatted || '-'} |
                        <strong>By:</strong> ${car.resolved_by || '-'} |
                        ${statusBadge}
                    </p>
                </div>
            </div>

            <div class="row">
                <!-- Left Column -->
                <div class="col-md-6">
                    <!-- Reference Information -->
                    <div class="card car-compact-card">
                        <div class="card-header">
                            <i class="fa fa-link"></i> Reference Information
                        </div>
                        <div class="card-body">
                            <table class="table table-sm table-borderless car-compact-table">
                                <tr><th>Production Entry:</th><td>${car.production_entry || '-'}</td></tr>
                                <tr><th>Production Date:</th><td>${car.production_date_formatted || '-'}</td></tr>
                                <tr><th>Daily OEE Report:</th><td>${car.parent_daily_oee_report || '-'}</td></tr>
                                <tr><th>Shift / Operator:</th><td>${car.shift_type || '-'} / ${car.operator_name || '-'}</td></tr>
                            </table>
                        </div>
                    </div>

                    <!-- Production Data -->
                    <div class="card car-compact-card">
                        <div class="card-header">
                            <i class="fa fa-industry"></i> Production Data
                        </div>
                        <div class="card-body">
                            <table class="table table-sm table-borderless car-compact-table">
                                <tr><th>Machine/Press:</th><td><strong>${car.machine_reference || '-'}</strong></td></tr>
                                <tr><th>Item Code:</th><td>${car.item_code || '-'}</td></tr>
                                <tr><th>Lot Number:</th><td><strong>${car.lot_number || '-'}</strong></td></tr>
                                <tr><th>Target Quantity:</th><td>${car.target_quantity ? parseFloat(car.target_quantity).toLocaleString() : '0'}</td></tr>
                                <tr><th>Actual Quantity:</th><td>${car.actual_quantity ? parseFloat(car.actual_quantity).toLocaleString() : '0'}</td></tr>
                                <tr><th>Variance:</th><td class="${car.variance_qty < 0 ? 'text-danger' : 'text-success'}">
                                    <strong>${car.variance_qty ? parseFloat(car.variance_qty).toLocaleString() : '0'}</strong>
                                </td></tr>
                            </table>

                            <!-- Performance Metrics -->
                            <div class="row" style="margin-top: 8px;">
                                <div class="col-4">
                                    <div class="car-metric-box">
                                        <h6>OEE %</h6>
                                        <h4 class="${oeeClass}">${car.oee_pct ? parseFloat(car.oee_pct).toFixed(2) : '0.00'}%</h4>
                                    </div>
                                </div>
                                <div class="col-4">
                                    <div class="car-metric-box">
                                        <h6>Efficiency %</h6>
                                        <h4>${car.production_efficiency_pct ? parseFloat(car.production_efficiency_pct).toFixed(2) : '0.00'}%</h4>
                                    </div>
                                </div>
                                <div class="col-4">
                                    <div class="car-metric-box">
                                        <h6>Rejection %</h6>
                                        <h4 class="text-danger">${car.rejection_percentage ? parseFloat(car.rejection_percentage).toFixed(2) : '0.00'}%</h4>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Tracking Information -->
                    <div class="card car-compact-card">
                        <div class="card-header">
                            <i class="fa fa-tasks"></i> Tracking
                        </div>
                        <div class="card-body">
                            <table class="table table-sm table-borderless car-compact-table">
                                <tr><th>Responsible Person:</th><td>${car.scan_operator || '-'}</td></tr>
                                <tr><th>Target Date:</th><td>${car.target_date_formatted || '-'}</td></tr>
                                <tr><th>Status:</th><td>${statusBadge}</td></tr>
                                <tr><th>Completion Date:</th><td>${car.completion_date_formatted || '-'}</td></tr>
                            </table>
                        </div>
                    </div>
                </div>

                <!-- Right Column -->
                <div class="col-md-6">
                    <!-- Root Cause Analysis -->
                    <div class="card car-compact-card">
                        <div class="card-header">
                            <i class="fa fa-search"></i> Root Cause Analysis
                        </div>
                        <div class="card-body">
                            <div style="margin-bottom: 10px;">
                                <strong style="font-size: 12px; color: #666;">Reason Code:</strong><br>
                                <span class="badge badge-danger" style="font-size: 13px; margin-top: 3px;">${car.reason_code || '-'}</span>
                                <span style="margin-left: 10px; font-size: 13px;">
                                    <strong>Action Code:</strong> ${car.corrective_action_code || '-'}
                                </span>
                            </div>
                            <div style="margin-bottom: 10px;">
                                <strong style="font-size: 12px; color: #666;">Problem Description:</strong>
                                <div class="car-text-content">
                                    ${car.problem_description || '<em style="color: #999;">No description provided</em>'}
                                </div>
                            </div>
                            <div>
                                <strong style="font-size: 12px; color: #666;">Corrective Action Details:</strong>
                                <div class="car-text-content">
                                    ${car.corrective_action_details || '<em style="color: #999;">No details provided</em>'}
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Remarks -->
                    ${car.remarks ? `
                    <div class="card car-compact-card">
                        <div class="card-header">
                            <i class="fa fa-comment"></i> Remarks
                        </div>
                        <div class="card-body">
                            <div class="car-text-content">
                                ${car.remarks}
                            </div>
                        </div>
                    </div>
                    ` : ''}
                </div>
            </div>
        </div>
    `;

    document.getElementById('car-details-content').innerHTML = html;

    // Set up open CAR form button
    document.getElementById('open-car-form-btn').onclick = function() {
        $('#car-details-modal').modal('hide');
        frappe.set_route('Form', 'Corrective Action Resolved', car.name);
    };
}
