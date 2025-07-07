// Global variables
let currentData = [];
let sortedData = [];
let currentSort = { column: null, direction: 'asc' };

// Initialize the page
frappe.pages['planned-vs-actual-production'].on_page_load = function(wrapper) {
    var page = frappe.ui.make_app_page({
        parent: wrapper,
        title: 'Production vs Plan Report',
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
    const productionFilter = document.getElementById('production_filter').value;
    
    // Load main data using the new backend function
    frappe.call({
        method: 'smart_screens.smart_screens.page.planned_vs_actual_production.planned_vs_actual_production_new.get_planned_vs_actual_production_data',
        args: {
            from_date: fromDate,
            to_date: toDate,
            item_filter: itemFilter,
            lot_filter: lotFilter,
            shift_filter: shiftFilter,
            production_filter: productionFilter
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
        method: 'smart_screens.smart_screens.page.planned_vs_actual_production.planned_vs_actual_production_new.get_summary_statistics',
        args: {
            from_date: fromDate,
            to_date: toDate,
            item_filter: itemFilter,
            lot_filter: lotFilter,
            shift_filter: shiftFilter,
            production_filter: productionFilter
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
    document.getElementById('total-planned-records').textContent = summary.total_planned_records || 0;
    document.getElementById('total-produced-records').textContent = summary.total_produced_records || 0;
    document.getElementById('total-production-lifts').textContent = summary.total_production_lifts || 0;
    document.getElementById('production-efficiency').textContent = (summary.production_efficiency_percentage || 0) + '%';
}

function updateTable(data) {
    const tableBody = document.getElementById('production-table-body');
    tableBody.innerHTML = '';

    if (!data || data.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="14" class="text-center">No data found for the selected criteria</td></tr>';
        return;
    }

    // Debug first few rows of data
    if (data.length > 0) {
        console.log('First record data:', data[0]);
    }
    
    data.forEach(row => {
        const tr = document.createElement('tr');
        
        // Determine production status badge
        let productionBadge = '';
        if (row.has_production) {
            productionBadge = '<span class="badge badge-success">Produced</span>';
        } else {
            productionBadge = '<span class="badge badge-warning">Not Produced</span>';
        }
        
        // Format source type badge
        let sourceBadge = '';
        if (row.source_type === 'Work Planning') {
            sourceBadge = '<span class="badge badge-primary">WP</span>';
        } else {
            sourceBadge = '<span class="badge badge-info">AWP</span>';
        }
        
        // Calculate variance (from backend or recalculate if not present)
        const plannedPieces = row.planned_pieces || 0;
        const producedPieces = row.total_pieces_produced || 0;
        
        // Use backend variance if available, otherwise calculate it here
        let variance = row.variance_pieces;
        if (variance === undefined || variance === null) {
            variance = producedPieces - plannedPieces;
            console.log(`Recalculated variance for ${row.work_plan_no}: ${producedPieces} - ${plannedPieces} = ${variance}`);
        }
        
        // Format variance with color coding
        let varianceDisplay = '';
        if (variance > 0) {
            varianceDisplay = `<span class="text-success">+${variance}</span>`;
        } else if (variance < 0) {
            varianceDisplay = `<span class="text-danger">${variance}</span>`;
        } else {
            varianceDisplay = `<span class="text-muted">${variance}</span>`;
        }
        
        tr.innerHTML = `
            <td>${row.work_plan_no || ''}</td>
            <td>${row.work_plan_submission_datetime || ''}</td>
            <td>${row.production_date_formatted || ''}</td>
            <td>${row.shift_type || ''}</td>
            <td><strong>${row.item_code || ''}</strong></td>
            <td>${row.mould_ref || ''}</td>
            <td><span class="badge badge-info">${row.lot_no || ''}</span></td>
            <td class="text-right"><strong>${row.production_lifts || 0}</strong></td>
            <td class="text-right">${row.no_of_cavities || 0}</td>
            <td class="text-right"><strong>${plannedPieces}</strong></td>
            <td class="text-right"><strong>${producedPieces}</strong></td>
            <td class="text-right">${varianceDisplay}</td>
            <!-- For debugging - this will show the raw variance value -->
            <td style="display:none;">${producedPieces - plannedPieces}</td>
            <td class="text-center">${sourceBadge}</td>
            <td class="text-center">${productionBadge}</td>
        `;
        
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
        'Work Plan No', 'Work Plan Submission Date/Time', 'Production Date', 'Shift Type', 
        'Item Code', 'Mould Ref', 'Lot No', 'Production Lifts', 'No. of Cavities', 
        'Total Pieces Produced', 'Source Type', 'Has Production'
    ];
    
    let csvContent = headers.join(',') + '\n';
    
    dataToExport.forEach(row => {
        const csvRow = [
            row.work_plan_no || '',
            row.work_plan_submission_datetime || '',
            row.production_date_formatted || '',
            row.shift_type || '',
            row.item_code || '',
            row.mould_ref || '',
            row.lot_no || '',
            row.production_lifts || 0,
            row.no_of_cavities || 0,
            row.total_pieces_produced || 0,
            row.source_type || '',
            row.has_production ? 'Yes' : 'No'
        ];
        
        csvContent += csvRow.map(field => `"${field}"`).join(',') + '\n';
    });
    
    // Download CSV
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `production_vs_plan_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

function loadShiftOptions() {
    const fromDate = document.getElementById('from_date').value;
    const toDate = document.getElementById('to_date').value;
    
    console.log('Loading shift options for date range:', fromDate, 'to', toDate);
    
    frappe.call({
        method: 'smart_screens.smart_screens.page.planned_vs_actual_production.planned_vs_actual_production_new.get_shift_options',
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

function initializeTooltips() {
    // Initialize Bootstrap tooltips if available
    if (typeof $().tooltip === 'function') {
        $('[data-toggle="tooltip"]').tooltip();
    }
}
