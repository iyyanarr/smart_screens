// Global variables
let currentData = [];
let dailyTrendChart = null;
let efficiencyChart = null;

// Initialize the page
frappe.pages['planned-vs-actual-production'].on_page_load = function(wrapper) {
    var page = frappe.ui.make_app_page({
        parent: wrapper,
        title: 'Planned vs Actual Production',
        single_column: true
    });
    
    page.main.html(frappe.render_template('planned_vs_actual_production'));
    
    // Initialize date filters with default values (last 7 days)
    initializeDateFilters();
    
    // Load initial data
    loadData();
    
    // Initialize charts
    initializeCharts();
};

function initializeDateFilters() {
    const today = new Date();
    const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
    
    document.getElementById('to_date').value = today.toISOString().split('T')[0];
    document.getElementById('from_date').value = weekAgo.toISOString().split('T')[0];
}

function showLoading() {
    document.getElementById('loading').style.display = 'flex';
}

function hideLoading() {
    document.getElementById('loading').style.display = 'none';
}

function loadData() {
    showLoading();
    
    const fromDate = document.getElementById('from_date').value;
    const toDate = document.getElementById('to_date').value;
    const itemFilter = document.getElementById('item_filter').value;
    
    // Load main data
    frappe.call({
        method: 'smart_screens.smart_screens.page.planned_vs_actual_production.planned_vs_actual_production.get_planned_vs_actual_data',
        args: {
            from_date: fromDate,
            to_date: toDate,
            item_filter: itemFilter
        },
        callback: function(r) {
            if (r.message) {
                currentData = r.message;
                updateTable(currentData);
                updateCharts(currentData);
            }
        },
        error: function(err) {
            console.error('Error loading data:', err);
            frappe.msgprint('Error loading data. Please try again.');
        }
    });
    
    // Load summary statistics
    frappe.call({
        method: 'smart_screens.smart_screens.page.planned_vs_actual_production.planned_vs_actual_production.get_summary_statistics',
        args: {
            from_date: fromDate,
            to_date: toDate,
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
    document.getElementById('total-planned').textContent = formatNumber(summary.total_planned_pieces);
    document.getElementById('total-actual').textContent = formatNumber(summary.total_actual_pieces);
    document.getElementById('total-kg').textContent = formatNumber(summary.total_stock_kg, 2) + ' kg';
    document.getElementById('overall-efficiency').textContent = formatNumber(summary.overall_efficiency, 1) + '%';
    document.getElementById('total-items').textContent = summary.total_items;
    document.getElementById('avg-efficiency').textContent = formatNumber(summary.avg_efficiency, 1) + '%';
    
    // Update efficiency color based on performance
    const efficiencyElement = document.getElementById('overall-efficiency');
    if (summary.overall_efficiency >= 95) {
        efficiencyElement.className = 'text-success';
    } else if (summary.overall_efficiency >= 85) {
        efficiencyElement.className = 'text-warning';
    } else {
        efficiencyElement.className = 'text-danger';
    }
}

function updateTable(data) {
    const tbody = document.getElementById('production-table-body');
    tbody.innerHTML = '';
    
    if (!data || data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="11" class="text-center text-muted">No data found for the selected filters</td></tr>';
        return;
    }
    
    data.forEach(row => {
        const tr = document.createElement('tr');
        
        // Determine status
        let status = 'Target';
        let statusClass = 'status-target';
        if (row.efficiency > 100) {
            status = 'Over';
            statusClass = 'status-over';
        } else if (row.efficiency < 85) {
            status = 'Under';
            statusClass = 'status-under';
        }
        
        tr.innerHTML = `
            <td>${row.production_date_formatted}</td>
            <td><strong>${row.item_code}</strong></td>
            <td><span class="badge badge-secondary">${row.shift_type}</span></td>
            <td><small class="text-muted">${row.planning_sources_text || 'No Planning'}</small></td>
            <td class="text-right">${formatNumber(row.planned_qty_pieces)}</td>
            <td class="text-right">${formatNumber(row.actual_qty_pieces)}</td>
            <td class="text-right">${formatNumber(row.actual_weight_kg, 2)}</td>
            <td class="text-right">${formatNumber(row.stock_qty_kg, 2)}</td>
            <td class="text-right ${row.variance_pieces >= 0 ? 'text-success' : 'text-danger'}">
                ${row.variance_pieces >= 0 ? '+' : ''}${formatNumber(row.variance_pieces)}
            </td>
            <td class="text-right ${row.efficiency >= 95 ? 'text-success' : row.efficiency >= 85 ? 'text-warning' : 'text-danger'}">
                ${formatNumber(row.efficiency, 1)}%
            </td>
            <td class="text-center">
                <span class="status-badge ${statusClass}">${status}</span>
            </td>
        `;
        
        tbody.appendChild(tr);
    });
}

function initializeCharts() {
    // Check if Chart.js is available
    if (typeof Chart === 'undefined') {
        console.warn('Chart.js is not loaded. Loading from CDN...');
        
        // Load Chart.js from CDN
        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/chart.js@3.9.1/dist/chart.min.js';
        script.onload = function() {
            console.log('Chart.js loaded successfully');
            createCharts();
        };
        script.onerror = function() {
            console.error('Failed to load Chart.js');
            hideChartsSection();
        };
        document.head.appendChild(script);
        return;
    }
    
    createCharts();
}

function createCharts() {
    try {
        // Initialize Chart.js charts
        const dailyCtx = document.getElementById('daily-trend-chart').getContext('2d');
        const efficiencyCtx = document.getElementById('efficiency-chart').getContext('2d');
        
        dailyTrendChart = new Chart(dailyCtx, {
            type: 'line',
            data: {
                labels: [],
                datasets: [{
                    label: 'Planned',
                    data: [],
                    borderColor: 'rgb(54, 162, 235)',
                    backgroundColor: 'rgba(54, 162, 235, 0.1)',
                    tension: 0.1
                }, {
                    label: 'Actual',
                    data: [],
                    borderColor: 'rgb(75, 192, 192)',
                    backgroundColor: 'rgba(75, 192, 192, 0.1)',
                    tension: 0.1
                }]
            },
            options: {                responsive: true,
                interaction: {
                    intersect: false,
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        title: {
                            display: true,
                            text: 'Quantity (Pieces)'
                        }
                    }
                }
            }
        });
        
        efficiencyChart = new Chart(efficiencyCtx, {
            type: 'doughnut',
            data: {
                labels: ['Over Target (>100%)', 'On Target (85-100%)', 'Under Target (<85%)'],
                datasets: [{
                    data: [0, 0, 0],
                    backgroundColor: ['#28a745', '#ffc107', '#dc3545']
                }]
            },
            options: {
                responsive: true,
                plugins: {
                    legend: {
                        position: 'bottom'
                    }
                }
            }
        });
        
    } catch (error) {
        console.error('Error initializing charts:', error);
        hideChartsSection();
    }
}

function hideChartsSection() {
    const chartsSection = document.querySelector('.charts-section');
    if (chartsSection) {
        chartsSection.style.display = 'none';
    }
}

function updateCharts(data) {
    if (!data || data.length === 0) return;
    
    // Check if charts are initialized
    if (!dailyTrendChart || !efficiencyChart) {
        console.warn('Charts not initialized, skipping chart update');
        return;
    }
    
    try {
        // Update daily trend chart
        const dailyData = {};
        data.forEach(row => {
            const date = row.production_date_formatted;
            if (!dailyData[date]) {
                dailyData[date] = { planned: 0, actual: 0 };
            }
            dailyData[date].planned += row.planned_qty_pieces;
            dailyData[date].actual += row.actual_qty_pieces;
        });
        
        const dates = Object.keys(dailyData).sort();
        const plannedValues = dates.map(date => dailyData[date].planned);
        const actualValues = dates.map(date => dailyData[date].actual);
        
        dailyTrendChart.data.labels = dates;
        dailyTrendChart.data.datasets[0].data = plannedValues;
        dailyTrendChart.data.datasets[1].data = actualValues;
        dailyTrendChart.update();
        
        // Update efficiency chart
        let overTarget = 0, onTarget = 0, underTarget = 0;
        data.forEach(row => {
            if (row.planned_qty_pieces > 0) { // Only count rows with planning data
                if (row.efficiency > 100) {
                    overTarget++;
                } else if (row.efficiency >= 85) {
                    onTarget++;
                } else {
                    underTarget++;
                }
            }
        });
        
        efficiencyChart.data.datasets[0].data = [overTarget, onTarget, underTarget];
        efficiencyChart.update();
        
    } catch (error) {
        console.error('Error updating charts:', error);
    }
}

function formatNumber(num, decimals = 0) {
    if (num === null || num === undefined) return '0';
    return parseFloat(num).toLocaleString('en-IN', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals
    });
}

function applyFilters() {
    const fromDate = document.getElementById('from_date').value;
    const toDate = document.getElementById('to_date').value;
    
    // Validate date range
    if (fromDate && toDate && new Date(fromDate) > new Date(toDate)) {
        frappe.msgprint({
            title: 'Invalid Date Range',
            message: 'From Date cannot be greater than To Date',
            indicator: 'red'
        });
        return;
    }
    
    loadData();
}

function refreshData() {
    loadData();
}

function exportData() {
    if (!currentData || currentData.length === 0) {
        frappe.msgprint('No data to export');
        return;
    }
    
    // Create CSV content
    const headers = [
        'Date', 'Item Code', 'Shift', 'Planned (Pieces)', 'Actual (Pieces)', 
        'Actual Weight (Kg)', 'Stock (Kg)', 'Variance (Pieces)', 'Efficiency %'
    ];
    
    let csvContent = headers.join(',') + '\n';
    
    currentData.forEach(row => {
        const csvRow = [
            row.production_date_formatted,
            row.item_code,
            row.shift_type,
            row.planned_qty_pieces,
            row.actual_qty_pieces,
            row.actual_weight_kg,
            row.stock_qty_kg,
            row.variance_pieces,
            row.efficiency.toFixed(1)
        ];
        csvContent += csvRow.join(',') + '\n';
    });
    
    // Download CSV
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `planned_vs_actual_production_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
}

// Event listeners for Enter key on filter inputs
document.addEventListener('DOMContentLoaded', function() {
    ['from_date', 'to_date', 'item_filter'].forEach(id => {
        const element = document.getElementById(id);
        if (element) {
            element.addEventListener('keypress', function(e) {
                if (e.key === 'Enter') {
                    applyFilters();
                }
            });
        }
    });
});
