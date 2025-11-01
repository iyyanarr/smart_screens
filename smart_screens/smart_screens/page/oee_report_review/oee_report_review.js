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
    frappe.set_route('Form', 'Daily OEE Report', reportName);
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
                        <tr><th>Avg OEE:</th><td><strong>${report.avg_oee}%</strong></td></tr>
                        <tr><th>Avg Availability:</th><td>${report.avg_availability}%</td></tr>
                        <tr><th>Avg Performance:</th><td>${report.avg_performance}%</td></tr>
                        <tr><th>Avg Quality:</th><td>${report.avg_quality}%</td></tr>
                    </table>
                </div>
            </div>
            
            <h6>Production Records (${records.length})</h6>
            <div class="table-responsive">
                <table class="table table-sm table-bordered table-hover">
                    <thead class="thead-light">
                        <tr>
                            <th>Date</th>
                            <th>Shift</th>
                            <th>Machine</th>
                            <th>Lot</th>
                            <th>Item</th>
                            <th class="text-right">OEE %</th>
                            <th>Status</th>
                            <th>Reason Code</th>
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
        
        html += `
            <tr>
                <td>${frappe.datetime.str_to_user(rec.production_date)}</td>
                <td>${rec.shift_type || '-'}</td>
                <td>${rec.machine_reference || '-'}</td>
                <td>${rec.lot_number || '-'}</td>
                <td>${rec.item_code || '-'}</td>
                <td class="text-right ${oeeClass}"><strong>${rec.oee_pct || 0}%</strong></td>
                <td>${statusBadge}</td>
                <td><small>${rec.reason_code || '-'}</small></td>
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
