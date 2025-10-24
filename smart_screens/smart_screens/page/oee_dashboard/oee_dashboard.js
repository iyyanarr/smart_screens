// Global variables
let currentData = [];
let sortedData = [];
let currentSort = { column: null, direction: 'asc' };

// Initialize the page
frappe.pages['oee-dashboard'].on_page_load = function(wrapper) {
    var page = frappe.ui.make_app_page({
        parent: wrapper,
        title: 'OEE Dashboard',
        single_column: true
    });
    
    page.main.html(frappe.render_template('oee_dashboard'));
    
    // Initialize date filters with default values (last 7 days)
    initializeDateFilters();
    
    // Initialize table sorting
    initializeTableSorting();
    
    // Load available processes
    loadProcessOptions();
    
    // Load shift options
    loadShiftOptions();
    
    // Load initial data
    loadData();
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
    const fromDate = document.getElementById('from_date').value;
    const toDate = document.getElementById('to_date').value;
    const processType = document.getElementById('process_filter').value;
    
    frappe.call({
        method: 'smart_screens.smart_screens.page.oee_dashboard.oee_dashboard.get_shift_options',
        args: {
            from_date: fromDate,
            to_date: toDate,
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
    
    const fromDate = document.getElementById('from_date').value;
    const toDate = document.getElementById('to_date').value;
    const processType = document.getElementById('process_filter').value;
    const shiftFilter = document.getElementById('shift_filter').value;
    const machineFilter = document.getElementById('machine_filter').value;
    const lotFilter = document.getElementById('lot_filter').value;
    const itemFilter = document.getElementById('item_filter').value;
    
    // Load main OEE data
    frappe.call({
        method: 'smart_screens.smart_screens.page.oee_dashboard.oee_dashboard.get_oee_data',
        args: {
            from_date: fromDate,
            to_date: toDate,
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
            from_date: fromDate,
            to_date: toDate,
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
    document.getElementById('avg-availability').textContent = summary.avg_availability + '%';
    document.getElementById('avg-performance').textContent = summary.avg_performance + '%';
    document.getElementById('avg-quality').textContent = summary.avg_quality + '%';
    document.getElementById('avg-oee').textContent = summary.avg_oee + '%';
}

function updateTable(data) {
    const tableBody = document.getElementById('oee-table-body');
    tableBody.innerHTML = '';

    if (!data || data.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="13" class="text-center">No OEE data found for the selected criteria</td></tr>';
        return;
    }
    
    data.forEach((row, index) => {
        const tr = document.createElement('tr');
        
        // Calculate Variance (Actual - Target)
        const variance = (row.actual_quantity || 0) - (row.target_quantity || 0);
        const varianceClass = variance > 0 ? 'text-success' : (variance < 0 ? 'text-danger' : 'text-muted');
        
        // Determine OEE color class based on percentage
        let oeeClass = 'oee-poor';
        if (row.oee_pct >= 85) {
            oeeClass = 'oee-excellent';
        } else if (row.oee_pct >= 70) {
            oeeClass = 'oee-good';
        } else if (row.oee_pct >= 50) {
            oeeClass = 'oee-fair';
        }
        
        tr.innerHTML = `
            <td>${row.production_date_formatted || ''}</td>
            <td>${row.shift_type || ''}</td>
            <td><small>${row.operator_name || '-'}</small></td>
            <td><small>${row.machine_reference || ''}</small></td>
            <td><small><strong>${row.item_code || ''}</strong></small></td>
            <td><small><span class="badge badge-info">${row.lot_number || ''}</span></small></td>
            <td class="text-right"><small><strong>${row.actual_quantity || 0}</strong></small></td>
            <td class="text-right"><small>${row.target_quantity || 0}</small></td>
            <td class="text-right"><small>${row.no_of_cavities || 0}</small></td>
            <td class="text-right"><small>${row.cycle_time_seconds ? row.cycle_time_seconds.toFixed(1) : '0.0'}</small></td>
            <td class="text-right ${varianceClass}"><small><strong>${variance >= 0 ? '+' : ''}${variance}</strong></small></td>
            <td class="text-right"><small>${row.rejection_percentage || 0}%</small></td>
            <td class="text-right ${oeeClass} oee-clickable" onclick="showOEEDetails(event, ${index})"><strong>${row.oee_pct || 0}%</strong></td>
        `;
        
        // Store row data in the DOM for later retrieval
        tr.dataset.rowData = JSON.stringify(row);
        tr.dataset.rowIndex = index;
        
        // Add hover effect
        tr.addEventListener('mouseenter', function() {
            this.style.backgroundColor = '#f8f9fa';
        });
        
        tr.addEventListener('mouseleave', function() {
            this.style.backgroundColor = '';
        });
        
        tableBody.appendChild(tr);
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
                
                // Handle different data types
                if (type === 'number') {
                    aVal = parseFloat(aVal) || 0;
                    bVal = parseFloat(bVal) || 0;
                } else if (type === 'date') {
                    aVal = new Date(aVal);
                    bVal = new Date(bVal);
                } else {
                    aVal = (aVal || '').toString().toLowerCase();
                    bVal = (bVal || '').toString().toLowerCase();
                }
                
                if (currentSort.direction === 'asc') {
                    return aVal > bVal ? 1 : -1;
                } else {
                    return aVal < bVal ? 1 : -1;
                }
            });
            
            // Update table
            updateTable(sortedData);
            
            // Update sort icons
            updateSortIcons();
        });
    });
}

function updateSortIcons() {
    document.querySelectorAll('.sortable').forEach(header => {
        const icon = header.querySelector('.sort-icon');
        const column = header.getAttribute('data-column');
        
        header.classList.remove('sorted');
        
        if (column === currentSort.column) {
            header.classList.add('sorted');
            if (currentSort.direction === 'asc') {
                icon.className = 'fa fa-sort-up sort-icon';
            } else {
                icon.className = 'fa fa-sort-down sort-icon';
            }
        } else {
            icon.className = 'fa fa-sort sort-icon';
        }
    });
}

function applyFilters() {
    loadData();
}

function refreshData() {
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
        'Date', 'Shift', 'Process', 'Machine', 'Lot No', 'Item', 
        'Target Qty', 'Actual Qty', 'Availability %', 'Performance %', 
        'Quality %', 'OEE %'
    ];
    
    let csvContent = headers.join(',') + '\n';
    
    dataToExport.forEach(row => {
        const csvRow = [
            row.production_date_formatted || '',
            row.shift_type || '',
            row.process_type || '',
            row.machine_reference || '',
            row.lot_number || '',
            row.item_code || '',
            row.target_quantity || 0,
            row.actual_quantity || 0,
            row.availability_pct || 0,
            row.performance_pct || 0,
            row.quality_pct || 0,
            row.oee_pct || 0
        ];
        
        csvContent += csvRow.map(field => `"${field}"`).join(',') + '\n';
    });
    
    // Download CSV
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `oee_dashboard_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}
