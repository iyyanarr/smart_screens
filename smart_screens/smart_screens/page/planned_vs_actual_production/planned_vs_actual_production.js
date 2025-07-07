// Global variables
let currentData = [];
let sortedData = [];
let currentSort = { column: null, direction: 'asc' };

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
    
    // Initialize table sorting
    initializeTableSorting();
    
    // Load shift options
    loadShiftOptions();
    
    // Load initial data
    loadData();
    
    // Initialize Bootstrap tooltips
    initializeTooltips();
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
    const lotFilter = document.getElementById('lot_filter').value;
    const shiftFilter = document.getElementById('shift_filter').value;
    const planningFilter = document.getElementById('planning_filter').value;
    
    // Load main data
    frappe.call({
        method: 'smart_screens.smart_screens.page.planned_vs_actual_production.planned_vs_actual_production.get_planned_vs_actual_data',
        args: {
            from_date: fromDate,
            to_date: toDate,
            item_filter: itemFilter,
            lot_filter: lotFilter,
            shift_filter: shiftFilter,
            planning_filter: planningFilter
        },
        callback: function(r) {
            if (r.message) {
                currentData = r.message;
                sortedData = [...currentData]; // Create a copy for sorting
                updateTable(sortedData);
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
            item_filter: itemFilter,
            lot_filter: lotFilter,
            shift_filter: shiftFilter,
            planning_filter: planningFilter
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
    document.getElementById('total-actual').textContent = formatNumber(summary.total_produced_pieces);
    document.getElementById('overall-efficiency').textContent = formatNumber(summary.overall_efficiency, 1) + '%';
    document.getElementById('total-items').textContent = summary.total_items;
    
    // Update efficiency color based on performance
    const efficiencyElement = document.getElementById('overall-efficiency');
    if (summary.overall_efficiency >= 95) {
        efficiencyElement.className = 'text-success';
    } else if (summary.overall_efficiency >= 85) {
        efficiencyElement.className = 'text-warning';
    } else {
        efficiencyElement.className = 'text-danger';
    }
    
    // Add new summary cards for data quality
    const totalRecords = (summary.job_card_relationships || 0) + (summary.fallback_relationships || 0);
    const qualityPercentage = totalRecords > 0 ? 
        ((summary.job_card_relationships || 0) / totalRecords * 100).toFixed(1) : 0;
    
    $('#summary-cards').append(`
        <div class="col-md-3">
            <div class="card">
                <div class="card-body text-center">
                    <h5 class="card-title">Data Quality</h5>
                    <h3 class="text-info">${qualityPercentage}%</h3>
                    <p class="card-text">
                        <small class="text-muted">
                            ${summary.job_card_relationships || 0} with Job Cards<br>
                            ${summary.fallback_relationships || 0} fallback matches
                        </small>
                    </p>
                </div>
            </div>
        </div>
    `);
}

function updateTable(data) {
    const tbody = document.getElementById('production-table-body');
    tbody.innerHTML = '';
    
    // Update table info
    const tableInfo = document.getElementById('table-info');
    if (tableInfo) {
        tableInfo.textContent = `Total records: ${data ? data.length : 0}`;
    }
    
    if (!data || data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="10" class="text-center text-muted">No data found for the selected filters</td></tr>';
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
        
        // Add visual indicator for matching method
        const matchingMethodIcon = row.matching_method === 'job_card_relationship' 
            ? '<i class="fa fa-link text-success" title="Exact Job Card Match"></i>' 
            : '<i class="fa fa-exclamation-triangle text-warning" title="Date+Item Fallback Match"></i>';
        
        tr.innerHTML = `
            <td>${row.production_date_formatted} ${matchingMethodIcon}</td>
            <td><strong>${row.item_code}</strong></td>
            <td><span class="badge badge-info">${row.lot_number_display || 'No Lot'}</span></td>
            <td><span class="badge badge-secondary">${row.shift_type}</span></td>
            <td><small class="text-muted">${row.planning_sources_text || 'No Planning'}</small></td>
            <td class="text-right">${formatNumber(row.planned_qty_pieces)}</td>
            <td class="text-right">${formatNumber(row.actual_qty_pieces)}</td>
            <td class="text-right ${row.variance_pieces >= 0 ? 'text-success' : 'text-danger'}">
                ${row.variance_pieces >= 0 ? '+' : ''}${formatNumber(row.variance_pieces)}
            </td>
            <td class="text-center">
                <span class="status-badge ${statusClass}">${status}</span>
            </td>
        `;
        
        tbody.appendChild(tr);
    });
}

function initializeTableSorting() {
    // Add click event listeners to sortable headers
    document.addEventListener('click', function(e) {
        if (e.target.closest('.sortable')) {
            const header = e.target.closest('.sortable');
            const column = header.getAttribute('data-column');
            const type = header.getAttribute('data-type');
            
            sortTable(column, type);
        }
    });
}

function sortTable(column, type) {
    // Determine sort direction
    let direction = 'asc';
    if (currentSort.column === column && currentSort.direction === 'asc') {
        direction = 'desc';
    }
    
    // Update current sort state
    currentSort = { column, direction };
    
    // Remove existing sort classes
    document.querySelectorAll('.sortable').forEach(header => {
        header.classList.remove('sort-asc', 'sort-desc');
    });
    
    // Add sort class to current header
    const currentHeader = document.querySelector(`[data-column="${column}"]`);
    currentHeader.classList.add(`sort-${direction}`);
    
    // Update sort info display
    updateSortInfo(column, direction);
    
    // Sort the data
    sortedData = [...currentData].sort((a, b) => {
        let valueA = a[column];
        let valueB = b[column];
        
        // Handle different data types
        if (type === 'number') {
            valueA = parseFloat(valueA) || 0;
            valueB = parseFloat(valueB) || 0;
        } else if (type === 'date') {
            valueA = new Date(a.production_date || a.production_date_formatted);
            valueB = new Date(b.production_date || b.production_date_formatted);
        } else if (type === 'text') {
            valueA = String(valueA || '').toLowerCase();
            valueB = String(valueB || '').toLowerCase();
        }
        
        // Handle status column specially
        if (column === 'status') {
            const statusOrder = { 'over': 3, 'target': 2, 'under': 1 };
            const statusA = a.efficiency > 100 ? 'over' : a.efficiency < 85 ? 'under' : 'target';
            const statusB = b.efficiency > 100 ? 'over' : b.efficiency < 85 ? 'under' : 'target';
            valueA = statusOrder[statusA];
            valueB = statusOrder[statusB];
        }
        
        // Compare values
        if (valueA < valueB) {
            return direction === 'asc' ? -1 : 1;
        }
        if (valueA > valueB) {
            return direction === 'asc' ? 1 : -1;
        }
        return 0;
    });
    
    // Update the table with sorted data
    updateTable(sortedData);
}

function updateSortInfo(column, direction) {
    const sortInfo = document.getElementById('sort-info');
    const sortColumn = document.getElementById('sort-column');
    const sortDirection = document.getElementById('sort-direction');
    
    if (sortInfo && sortColumn && sortDirection) {
        sortInfo.style.display = 'inline';
        
        // Convert column names to readable format
        const columnNames = {
            'production_date_formatted': 'Date',
            'item_code': 'Item Code',
            'shift_type': 'Shift',
            'planning_sources_text': 'Planning Source',
            'planned_qty_pieces': 'Planned (Pieces)',
            'actual_qty_pieces': 'Actual (Pieces)',
            'actual_weight_kg': 'Actual Weight (Kg)',
            'variance_pieces': 'Variance (Pieces)',
            'efficiency': 'Efficiency %',
            'status': 'Status'
        };
        
        sortColumn.textContent = columnNames[column] || column;
        sortDirection.textContent = direction === 'asc' ? '↑' : '↓';
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
    
    // Reset sorting when applying new filters
    resetSorting();
    
    // Reload shift options for new date range
    loadShiftOptions();
    
    loadData();
}

function resetSorting() {
    currentSort = { column: null, direction: 'asc' };
    
    // Remove sort classes from all headers
    document.querySelectorAll('.sortable').forEach(header => {
        header.classList.remove('sort-asc', 'sort-desc');
    });
    
    // Hide sort info
    const sortInfo = document.getElementById('sort-info');
    if (sortInfo) {
        sortInfo.style.display = 'none';
    }
}

function refreshData() {
    // Reset sorting when refreshing data
    resetSorting();
    
    // Reload shift options
    loadShiftOptions();
    
    loadData();
}

function exportData() {
    const dataToExport = sortedData.length > 0 ? sortedData : currentData;
    
    if (!dataToExport || dataToExport.length === 0) {
        frappe.msgprint('No data to export');
        return;
    }
    
    // Create CSV content
    const headers = [
        'Date', 'Item Code', 'Lot Number', 'Shift', 'Planning Source', 'Planned (Pieces)', 'Produced (Pieces)', 
        'Variance (Pieces)', 'Status'
    ];
    
    let csvContent = headers.join(',') + '\n';
    
    dataToExport.forEach(row => {
        // Determine status
        let status = 'Target';
        if (row.efficiency > 100) {
            status = 'Over';
        } else if (row.efficiency < 85) {
            status = 'Under';
        }
        
        const csvRow = [
            row.production_date_formatted,
            row.item_code,
            row.lot_number || 'No Lot',
            row.shift_type,
            row.planning_sources_text || 'No Planning',
            row.planned_qty_pieces,
            row.actual_qty_pieces,
            row.variance_pieces,
            status
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

function initializeTooltips() {
    // Initialize Bootstrap tooltips for all elements with data-toggle="tooltip"
    if (typeof $ !== 'undefined' && $.fn.tooltip) {
        $('[data-toggle="tooltip"]').tooltip({
            html: true,
            delay: { show: 500, hide: 100 }
        });
    } else {
        // Fallback: Use title attribute for basic tooltip behavior
        console.warn('Bootstrap tooltip not available, using basic title tooltips');
    }
}

// Update tooltip system with data quality explanations
const columnTooltips = {
    'production_date': 'Production date with data quality indicator: ✓ = Exact Job Card match, ⚠ = Date+Item fallback match',
    'data_quality': 'Shows percentage of records with exact Job Card relationships vs fallback matching. Higher percentage indicates better data integrity.'
};

function loadShiftOptions() {
    const fromDate = document.getElementById('from_date').value;
    const toDate = document.getElementById('to_date').value;
    
    console.log('Loading shift options for date range:', fromDate, 'to', toDate);
    
    frappe.call({
        method: 'smart_screens.smart_screens.page.planned_vs_actual_production.planned_vs_actual_production.get_shift_options',
        args: {
            from_date: fromDate,
            to_date: toDate
        },
        callback: function(r) {
            if (r.message) {
                console.log('Received shift options:', r.message);
                const shiftSelect = document.getElementById('shift_filter');
                shiftSelect.innerHTML = '';
                
                r.message.forEach(option => {
                    const optionElement = document.createElement('option');
                    optionElement.value = option.value;
                    optionElement.textContent = option.label;
                    shiftSelect.appendChild(optionElement);
                });
            } else {
                console.warn('No shift options received');
            }
        },
        error: function(err) {
            console.error('Error loading shift options:', err);
            // Fallback to default options
            const shiftSelect = document.getElementById('shift_filter');
            shiftSelect.innerHTML = '<option value="">All Shifts</option>';
        }
    });
}

// Event listeners for Enter key on filter inputs
document.addEventListener('DOMContentLoaded', function() {
    ['from_date', 'to_date', 'item_filter', 'lot_filter', 'shift_filter'].forEach(id => {
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
