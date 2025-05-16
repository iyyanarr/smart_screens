frappe.pages['mould-performance-report'].on_page_load = function(wrapper) {
    var page = frappe.ui.make_app_page({
        parent: wrapper,
        title: 'Mould Performance Report',
        single_column: true
    });

    // Initialize page
    new MouldPerformanceReport(page);
}

class MouldPerformanceReport {
    constructor(page) {
        this.page = page;
        this.make();
    }

    make() {
        this.make_filters();
        this.make_body();
        
        // Initialize sorting state
        this.sort_by = 'total_lifts';
        this.sort_order = 'desc';
        
        this.load_data();
        
        // Add print button to the page
        this.page.set_primary_action('Print', () => this.print_report(), 'printer');
    }

    make_filters() {
        // Add from date filter
        this.page.add_field({
            label: 'From Date',
            fieldtype: 'Date',
            fieldname: 'from_date',
            default: frappe.datetime.add_months(frappe.datetime.now_date(), -12),
            change: () => this.load_data()
        });

        // Add to date filter
        this.page.add_field({
            label: 'To Date',
            fieldtype: 'Date',
            fieldname: 'to_date',
            default: frappe.datetime.now_date(),
            change: () => this.load_data()
        });

        // Add mould reference filter with proper options
        this.page.add_field({
            label: 'Mould Reference',
            fieldtype: 'Link',
            fieldname: 'mould_ref',
            options: 'Mould Specification',
            change: () => this.load_data()
        });
        
        // Add search input for quick filtering
        this.page.add_field({
            label: 'Search',
            fieldtype: 'Data',
            fieldname: 'search_input',
            placeholder: 'Search by mould ref or part no...',
            onchange: () => this.apply_filters()
        });
    }

    make_body() {
        this.$body = $(this.page.body);
        this.$report_area = $('<div class="report-table"></div>').appendTo(this.$body);
        
        // Add loading state
        this.$report_area.html('<div class="text-muted">Loading report data...</div>');
    }

    load_data() {
        let filters = this.get_filters();
        
        // Show loading message
        this.$report_area.html('<div class="text-muted">Loading report data...</div>');
        
        frappe.call({
            method: 'smart_screens.smart_screens.page.mould_performance_report.mould_performance_report.get_mould_performance_data',
            args: {
                filters: filters
            },
            callback: (r) => {
                if (r.message && r.message.status === 'success') {
                    this.data = r.message;
                    this.original_data = r.message.report_data;
                    this.filtered_data = [...this.original_data];
                    this.sort_data();
                    this.render_data(r.message);
                } else {
                    this.$report_area.html('<div class="text-muted">Error loading data</div>');
                    frappe.msgprint(__('Error loading data'));
                }
            }
        });
    }

    get_filters() {
        return {
            date_range: [
                this.page.fields_dict.from_date.get_value(),
                this.page.fields_dict.to_date.get_value()
            ],
            mould_ref: this.page.fields_dict.mould_ref.get_value()
        };
    }
    
    apply_filters() {
        const search_value = this.page.fields_dict.search_input.get_value().toLowerCase();
        
        if (search_value) {
            this.filtered_data = this.original_data.filter(row => 
                (row.mould_ref && row.mould_ref.toLowerCase().includes(search_value)) || 
                (row.part_no && row.part_no.toLowerCase().includes(search_value))
            );
        } else {
            this.filtered_data = [...this.original_data];
        }
        
        this.sort_data();
        this.render_data(this.data);
    }
    
    sort_data() {
        const sort_field = this.sort_by;
        const sort_order = this.sort_order;
        
        this.filtered_data.sort((a, b) => {
            let val_a, val_b;
            
            // Extract values based on sort field
            if (sort_field === 'mould_ref' || sort_field === 'part_no') {
                val_a = (a[sort_field] || '').toString();
                val_b = (b[sort_field] || '').toString();
                
                // String comparison
                return sort_order === 'asc' 
                    ? val_a.localeCompare(val_b) 
                    : val_b.localeCompare(val_a);
            } else if (sort_field === 'historical_lifts') {
                val_a = a.historical_lifts || 0;
                val_b = b.historical_lifts || 0;
            } else if (sort_field === 'total_lifts') {
                val_a = a.total_lifts || 0;
                val_b = b.total_lifts || 0;
            } else if (sort_field.startsWith('month_')) {
                // For monthly columns (month_0, month_1, etc.)
                const month_idx = parseInt(sort_field.split('_')[1]);
                val_a = (a.monthly_lifts && a.monthly_lifts[month_idx]) || 0;
                val_b = (b.monthly_lifts && b.monthly_lifts[month_idx]) || 0;
            } else {
                val_a = 0;
                val_b = 0;
            }
            
            // Numeric comparison for non-string fields
            return sort_order === 'asc' ? val_a - val_b : val_b - val_a;
        });
    }
    
    get_sort_icon(field) {
        if (this.sort_by === field) {
            return this.sort_order === 'asc' ? 'fa-sort-up' : 'fa-sort-down';
        }
        return 'fa-sort';
    }

    render_data(data) {
        this.$report_area.empty();

        if (!this.filtered_data || this.filtered_data.length === 0) {
            this.$report_area.html('<div class="text-muted">No data found</div>');
            return;
        }

        // Create table header
        const monthNames = moment.monthsShort();
        const headerHTML = `
            <thead>
                <tr>
                    <th class="mould-col sortable" data-sort="mould_ref">
                        Mould Ref <i class="sort-icon fa ${this.get_sort_icon('mould_ref')}"></i>
                    </th>
                    <th class="part-col sortable" data-sort="part_no">
                        Part No <i class="sort-icon fa ${this.get_sort_icon('part_no')}"></i>
                    </th>
                    <th class="historical-col sortable" data-sort="historical_lifts">
                        Historical Lifts<br><small>(Pre-${data.current_year})</small>
                        <i class="sort-icon fa ${this.get_sort_icon('historical_lifts')}"></i>
                    </th>
                    ${monthNames.map((month, idx) => `
                        <th class="month-col month-${idx+1} sortable" data-sort="month_${idx}">
                            ${month} <i class="sort-icon fa ${this.get_sort_icon('month_' + idx)}"></i>
                        </th>
                    `).join('')}
                    <th class="total-col sortable" data-sort="total_lifts">
                        Total Lifts <i class="sort-icon fa ${this.get_sort_icon('total_lifts')}"></i>
                    </th>
                </tr>
            </thead>
        `;

        // Create table rows
        const rowsHTML = this.filtered_data.map(row => `
            <tr class="mould-row" data-mould-ref="${row.mould_ref}">
                <td class="mould-cell">${row.mould_ref || ''}</td>
                <td>${row.part_no || ''}</td>
                <td class="text-right historical-cell" data-value="${row.historical_lifts}">
                    ${frappe.format(row.historical_lifts, { fieldtype: 'Int' })}
                </td>
                ${row.monthly_lifts.map((lifts, idx) => 
                    `<td class="text-right month-cell month-${idx+1}" data-month="${idx+1}" data-value="${lifts}">
                        ${frappe.format(lifts, { fieldtype: 'Int' })}
                    </td>`
                ).join('')}
                <td class="text-right total-cell" data-value="${row.total_lifts}">
                    <strong>${frappe.format(row.total_lifts, { fieldtype: 'Int' })}</strong>
                </td>
            </tr>
        `).join('');

        // Create table
        const tableHTML = `
            <div class="table-responsive">
                <table class="table table-bordered table-hover mould-performance-table">
                    ${headerHTML}
                    <tbody>
                        ${rowsHTML}
                    </tbody>
                </table>
            </div>
        `;

        this.$report_area.html(tableHTML);

        // Apply styles first
        this.apply_styles();

        // Add conditional formatting for better visualization
        this.add_conditional_formatting();
        
        // Add click events to open the dialog
        this.add_click_events();
        
        // Add sorting events
        this.bind_sorting_events();
    }
    
    bind_sorting_events() {
        this.$report_area.find('.sortable').on('click', (e) => {
            const sort_field = $(e.currentTarget).data('sort');
            
            // Toggle sort order if same field clicked again
            if (this.sort_by === sort_field) {
                this.sort_order = this.sort_order === 'asc' ? 'desc' : 'asc';
            } else {
                this.sort_by = sort_field;
                this.sort_order = 'asc';
            }
            
            this.sort_data();
            this.render_data(this.data);
        });
    }
    
    add_conditional_formatting() {
        // Format historical cells
        this.$report_area.find('.historical-cell').each(function() {
            const value = parseInt($(this).attr('data-value') || 0);
            if (value > 0) {
                $(this).addClass('historical-data');
                
                // Add intensity based on value
                if (value > 1000) $(this).addClass('high-value');
                else if (value > 500) $(this).addClass('medium-value');
                else $(this).addClass('low-value');
            }
        });
        
        // Format monthly cells
        this.$report_area.find('.month-cell').each(function() {
            const value = parseInt($(this).attr('data-value') || 0);
            if (value > 0) {
                $(this).addClass('monthly-data');
                
                // Add intensity based on value
                if (value > 100) $(this).addClass('high-value');
                else if (value > 50) $(this).addClass('medium-value');
                else $(this).addClass('low-value');
            }
        });
        
        // Format total cells
        this.$report_area.find('.total-cell').each(function() {
            const value = parseInt($(this).attr('data-value') || 0);
            if (value > 0) {
                $(this).addClass('total-data');
                
                // Add intensity based on value
                if (value > 1000) $(this).addClass('high-value');
                else if (value > 500) $(this).addClass('medium-value');
                else $(this).addClass('low-value');
            }
        });
        
        // Add alternating row colors
        this.$report_area.find('tr.mould-row:odd').addClass('alt-row');
    }
    
    add_click_events() {
        // Add click event to mould cells
        this.$report_area.find('.mould-cell').on('click', (e) => {
            const $row = $(e.currentTarget).closest('tr');
            const mouldRef = $row.attr('data-mould-ref');
            
            if (mouldRef) {
                this.show_mould_details(mouldRef);
            }
        });
        
        // Add click event to month cells
        this.$report_area.find('.month-cell').on('click', (e) => {
            const $cell = $(e.currentTarget);
            const mouldRef = $cell.closest('tr').attr('data-mould-ref');
            const month = $cell.attr('data-month');
            
            if (mouldRef && month) {
                this.show_month_details(mouldRef, parseInt(month));
            }
        });
    }
    
    show_mould_details(mouldRef) {
        // Find mould data
        const mouldData = this.data.report_data.find(m => m.mould_ref === mouldRef);
        
        if (!mouldData) return;
        
        const mouldSpec = mouldData.specification || {};
        
        // Create dialog content - Fixed HTML escaping issues
        const dialogContent = `
            <div class="mould-detail-dialog">
                <div class="mould-spec-section">
                    <h4>Mould Specification</h4>
                    <table class="table table-bordered table-condensed spec-table">
                        <tr>
                            <th width="20%">Mould Reference</th>
                            <td width="30%">${frappe.utils.escape_html(mouldRef)}</td>
                            <th width="20%">Part Number</th>
                            <td width="30%">${frappe.utils.escape_html(mouldSpec.part_no || '')}</td>
                        </tr>
                        <tr>
                            <th>Compound Code</th>
                            <td>${frappe.utils.escape_html(mouldSpec.compound_code || '')}</td>
                            <th>Mould Status</th>
                            <td>${frappe.utils.escape_html(mouldSpec.mould_status || '')}</td>
                        </tr>
                        <tr>
                            <th>No. of Cavities</th>
                            <td>${frappe.utils.escape_html(mouldSpec.noof_cavities || '')}</td>
                            <th>Cavities per Blank</th>
                            <td>${frappe.utils.escape_html(mouldSpec.no_of_cavity_per_blank || '')}</td>
                        </tr>
                        <tr>
                            <th>Piece Weight (Min/Avg/Max)</th>
                            <td>${frappe.utils.escape_html(mouldSpec.wtpiece_min_gms || '0')} / ${frappe.utils.escape_html(mouldSpec.wtpiece_avg_gms || '0')} / ${frappe.utils.escape_html(mouldSpec.wtpiece_max_gms || '0')} gms</td>
                            <th>Lift Weight (Avg)</th>
                            <td>${frappe.utils.escape_html(mouldSpec.wtlift_avg_gms || '0')} gms</td>
                        </tr>
                        <tr>
                            <th>Blank Type</th>
                            <td>${frappe.utils.escape_html(mouldSpec.blank_type || '')}</td>
                            <th>Blank Dimensions</th>
                            <td>${frappe.utils.escape_html(mouldSpec.blank_length || '0')} x ${frappe.utils.escape_html(mouldSpec.blank_width || '0')} x ${frappe.utils.escape_html(mouldSpec.blank_thickness || '0')}</td>
                        </tr>
                    </table>
                </div>
                
                <div class="mould-performance-section">
                    <h4>Lift Performance Summary</h4>
                    <table class="table table-bordered table-condensed summary-table">
                        <tr>
                            <th class="historical-header" width="50%">Historical Lifts (Pre-${this.data.current_year})</th>
                            <td class="historical-data text-right" width="50%">${frappe.format(mouldData.historical_lifts || 0, { fieldtype: 'Int' })}</td>
                        </tr>
                        <tr>
                            <th>Current Year Lifts (${this.data.current_year})</th>
                            <td class="text-right">${frappe.format(mouldData.monthly_lifts.reduce((a, b) => a + b, 0) || 0, { fieldtype: 'Int' })}</td>
                        </tr>
                        <tr>
                            <th class="total-header">Total Lifts</th>
                            <td class="total-data text-right">${frappe.format(mouldData.total_lifts || 0, { fieldtype: 'Int' })}</td>
                        </tr>
                    </table>
                </div>
                
                <div class="monthly-performance-chart">
                    <h4>Monthly Performance (${this.data.current_year})</h4>
                    <div id="monthly-chart"></div>
                </div>
            </div>
        `;
        
        // Create and show dialog
        const dialog = new frappe.ui.Dialog({
            title: `Mould Details: ${mouldRef}`,
            size: 'large',
            fields: [
                {
                    fieldname: 'details_html',
                    fieldtype: 'HTML',
                    options: dialogContent
                }
            ],
            primary_action_label: 'Print',
            primary_action: () => {
                this.print_mould_details(mouldRef, dialog.$wrapper);
            }
        });
        
        dialog.show();
        
        // Render chart after dialog is shown
        setTimeout(() => {
            const monthNames = moment.monthsShort();
            new frappe.Chart(dialog.$wrapper.find('#monthly-chart')[0], {
                data: {
                    labels: monthNames,
                    datasets: [{
                        name: 'Lifts',
                        values: mouldData.monthly_lifts
                    }]
                },
                type: 'bar',
                height: 250,
                colors: ['#5e64ff'],
                axisOptions: {
                    xIsSeries: true
                }
            });
        }, 300);
    }
    
    show_month_details(mouldRef, month) {
        // Find mould data
        const mouldData = this.data.report_data.find(m => m.mould_ref === mouldRef);
        
        if (!mouldData || !mouldData.detailed_entries) return;
        
        const monthKey = `${this.data.current_year}-${month}`;
        const monthEntries = mouldData.detailed_entries[monthKey] || [];
        const monthName = moment().month(month-1).format('MMMM');
        
        if (monthEntries.length === 0) {
            frappe.msgprint(`No entries found for ${mouldRef} in ${monthName} ${this.data.current_year}`);
            return;
        }

        // Create a completely new dialog to avoid template errors
        const d = new frappe.ui.Dialog({
            title: `${frappe.utils.escape_html(mouldRef)} - ${monthName} ${this.data.current_year}`,
            size: 'large',
            fields: [
                {
                    fieldname: 'month_details_html',
                    fieldtype: 'HTML'
                }
            ],
            primary_action_label: 'Print',
            primary_action: () => {
                this.print_month_details(mouldRef, month, d.$wrapper);
            }
        });
        
        // Show the dialog first
        d.show();
        
        // Build the HTML content outside of the template engine
        let tableHTML = `<div class="month-details-table">
        <table class="table table-bordered table-condensed">
            <thead>
                <tr class="table-head">
                    <th>Date</th>
                    <th>Production Entry</th>
                    <th>Compound</th>
                    <th>Operator</th>
                    <th>Batch No</th>
                    <th class="text-center">Running Cavities</th>
                    <th class="text-center">Curing Time</th>
                    <th class="text-center">Lifts</th>
                    <th class="text-center">Weight</th>
                </tr>
            </thead>
            <tbody>`;
    
    // Build table rows safely
    monthEntries.forEach((entry, idx) => {
        const rowClass = idx % 2 === 1 ? 'alt-row' : '';
        const date = frappe.datetime.str_to_user(entry.moulding_date || '');
        const prodEntry = frappe.utils.escape_html(entry.production_entry || '');
        const compound = frappe.utils.escape_html(entry.compound || '');
        const operator = frappe.utils.escape_html(entry.employee_name || '');
        const batchNo = frappe.utils.escape_html(entry.batch_no || '');
        const cavities = entry.no_of_running_cavities || 0;
        const curingTime = entry.curing_time || 0;
        const lifts = entry.number_of_lifts || 0;
        const weight = entry.weight_without_shell || 0;
        
        tableHTML += `<tr class="${rowClass}">
            <td>${date}</td>
            <td>${prodEntry}</td>
            <td>${compound}</td>
            <td>${operator}</td>
            <td>${batchNo}</td>
            <td class="text-right">${frappe.format(cavities, { fieldtype: 'Int' })}</td>
            <td class="text-right">${frappe.format(curingTime, { fieldtype: 'Int' })}</td>
            <td class="text-right">${frappe.format(lifts, { fieldtype: 'Int' })}</td>
            <td class="text-right">${frappe.format(weight, { fieldtype: 'Float', precision: 2 })}</td>
        </tr>`;
    });
    
    // Calculate totals safely
    const totalLifts = monthEntries.reduce((sum, entry) => sum + (parseInt(entry.number_of_lifts || 0) || 0), 0);
    const totalWeight = monthEntries.reduce((sum, entry) => sum + (parseFloat(entry.weight_without_shell || 0) || 0), 0);
    
    tableHTML += `</tbody>
            <tfoot>
                <tr class="total-row">
                    <th colspan="7" class="text-right">Total:</th>
                    <th class="text-right">${frappe.format(totalLifts, { fieldtype: 'Int' })}</th>
                    <th class="text-right">${frappe.format(totalWeight, { fieldtype: 'Float', precision: 2 })}</th>
                </tr>
            </tfoot>
        </table>
    </div>`;
    
    // Set the content after dialog is shown
    d.fields_dict.month_details_html.$wrapper.html(tableHTML);
    }
    
    apply_styles() {
        // Remove any previous styles to avoid duplication
        $('#mould-performance-report-styles').remove();
        
        // Add custom styles for the report with colorful headers by appending to document head
        $("<style>")
            .attr("id", "mould-performance-report-styles")
            .prop("type", "text/css")
            .html(`
                .mould-performance-report {
                    overflow-x: auto;
                }
                .mould-performance-table {
                    width: 100% !important;
                    border-collapse: collapse !important;
                    box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1) !important;
                    margin-bottom: 0 !important;
                }
                
                /* Header styling */
                .mould-performance-table th {
                    background-color: #3c4858 !important;
                    color: white !important;
                    position: sticky !important;
                    top: 0 !important;
                    z-index: 1 !important;
                    white-space: nowrap !important;
                    padding: 12px 10px !important;
                    text-align: center !important;
                    vertical-align: middle !important;
                    font-weight: 600 !important;
                    border: 1px solid #dee2e6 !important;
                }
                
                /* Column header specific styles */
                .mould-performance-table th.historical-col {
                    background-color: #922b21 !important;
                    color: white !important;
                }
                
                .mould-performance-table th.month-col {
                    background-color: #2874a6 !important;
                    color: white !important;
                }
                
                .mould-performance-table th.total-col {
                    background-color: #1e8449 !important;
                    color: white !important;
                }
                
                /* Cell styling */
                .mould-performance-table td {
                    white-space: nowrap !important;
                    padding: 10px 8px !important;
                    border: 1px solid #dee2e6 !important;
                    text-align: right !important;
                }
                
                .mould-performance-table td.mould-cell {
                    text-align: left !important;
                    font-weight: 500 !important;
                    background-color: #f8f9fa !important;
                }
                
                /* Cell specific styling with improved colors */
                .mould-performance-table .historical-data {
                    background-color: #f9e6e6 !important;
                    color: #922b21 !important;
                }
                
                .mould-performance-table .monthly-data {
                    background-color: #e8f4fc !important;
                    color: #2874a6 !important;
                }
                
                .mould-performance-table .total-data {
                    background-color: #e8f8f2 !important;
                    color: #1e8449 !important;
                }
                
                /* Value intensity with improved contrast */
                .mould-performance-table .low-value {
                    opacity: 0.8 !important;
                }
                
                .mould-performance-table .medium-value {
                    opacity: 0.9 !important;
                }
                
                .mould-performance-table .high-value {
                    opacity: 1 !important;
                    font-weight: bold !important;
                }
                
                /* Row styling */
                .mould-performance-table tr:hover {
                    background-color: #f8f9fa !important;
                }
                
                .mould-performance-table .alt-row {
                    background-color: #f9f9f9 !important;
                }
                
                /* Clickable cells */
                .mould-cell, .month-cell {
                    cursor: pointer !important;
                }
                
                .mould-cell:hover {
                    text-decoration: underline !important;
                    color: var(--primary) !important;
                }
                
                .month-cell:hover {
                    font-weight: bold !important;
                    color: var(--primary) !important;
                }
                
                /* Dialog styling improvements */
                .modal-content {
                    border-radius: 6px !important;
                    box-shadow: 0 5px 20px rgba(0,0,0,0.2) !important;
                }
                
                .modal-header {
                    background-color: #f8f9fa !important;
                    border-bottom: 2px solid #e0e0e0 !important;
                    padding: 15px !important;
                }
                
                .modal-body {
                    padding: 20px !important;
                }
                
                /* Dialog content styling */
                .mould-detail-dialog h4 {
                    margin-top: 25px !important;
                    margin-bottom: 15px !important;
                    font-weight: bold !important;
                    color: #3c4858 !important;
                    border-bottom: 2px solid #eaecef !important;
                    padding-bottom: 10px !important;
                    font-size: 16px !important;
                }
                
                /* Specification table styling */
                .spec-table {
                    border: 1px solid #dfe2e5 !important;
                    width: 100% !important;
                    margin-bottom: 20px !important;
                }
                
                .spec-table th {
                    background-color: #f8f9fa !important;
                    color: #3c4858 !important;
                    font-weight: 600 !important;
                    text-align: left !important;
                }
                
                .spec-table td {
                    padding: 10px !important;
                    text-align: left !important;
                }
                
                /* Summary table styling */
                .summary-table {
                    border: 1px solid #dfe2e5 !important;
                    width: 100% !important;
                    margin-bottom: 20px !important;
                }
                
                .summary-table th.historical-header {
                    background-color: #f9ebea !important;
                    color: #922b21 !important;
                    text-align: left !important;
                }
                
                .summary-table th.total-header {
                    background-color: #eafaf1 !important;
                    color: #1e8449 !important;
                    text-align: left !important;
                }
                
                .summary-table td {
                    text-align: right !important;
                }
                
                /* Month details table styling */
                .month-details-table {
                    max-height: 500px !important;
                    overflow-y: auto !important;
                }
                
                .month-details-table table {
                    border: 1px solid #dfe2e5 !important;
                    width: 100% !important;
                }
                
                .month-details-table .table-head th {
                    background-color: #f8f9fa !important;
                    color: #3c4858 !important;
                    position: sticky !important;
                    top: 0 !important;
                    z-index: 1 !important;
                    font-weight: 600 !important;
                    text-align: center !important;
                }
                
                .month-details-table .alt-row {
                    background-color: #f9f9f9 !important;
                }
                
                .month-details-table .total-row th, 
                .month-details-table .total-row td {
                    background-color: #eafaf1 !important;
                    color: #1e8449 !important;
                    font-weight: 600 !important;
                }
                
                /* Fix for monthly chart in dialog */
                .monthly-performance-chart {
                    margin-top: 30px !important;
                    margin-bottom: 15px !important;
                }
                
                #monthly-chart {
                    min-height: 250px !important;
                }
            `)
            .appendTo("head");
    }
    
    print_report() {
        const reportTitle = 'Mould Performance Report';
        const fromDate = frappe.datetime.str_to_user(this.page.fields_dict.from_date.get_value());
        const toDate = frappe.datetime.str_to_user(this.page.fields_dict.to_date.get_value());
        const dateRangeText = `${fromDate} to ${toDate}`;
        
        const printWindow = window.open('', '_blank');
        
        if (!printWindow) {
            frappe.msgprint(__('Pop-up blocked. Please allow pop-ups for printing.'));
            return;
        }
        
        // Get the table HTML
        const tableHtml = this.$report_area.html();
        
        printWindow.document.write(`
            <html>
                <head>
                    <title>${reportTitle}</title>
                    <style>
                        body { font-family: Arial, sans-serif; }
                        .report-header { text-align: center; margin-bottom: 20px; }
                        .report-title { font-size: 18px; font-weight: bold; }
                        .report-date { font-size: 14px; color: #666; }
                        .table { border-collapse: collapse; width: 100%; }
                        .table th, .table td { border: 1px solid #ddd; padding: 8px; }
                        .text-right { text-align: right; }
                        .historical-data { background-color: #f2d7d5; }
                        .monthly-data { background-color: #d4e6f1; }
                        .total-data { background-color: #d5f5e3; }
                        .alt-row { background-color: #f9f9f9; }
                        .low-value { opacity: 0.7; }
                        .medium-value { opacity: 0.85; }
                        .high-value { opacity: 1; }
                        @media print {
                            .report-header { margin-bottom: 15px; }
                            .table th, .table td { padding: 5px; }
                        }
                    </style>
                </head>
                <body>
                    <div class="report-header">
                        <div class="report-title">${reportTitle}</div>
                        <div class="report-date">Date Range: ${dateRangeText}</div>
                    </div>
                    ${tableHtml}
                </body>
            </html>
        `);
        
        printWindow.document.close();
        printWindow.focus();
        
        // Print after a short delay to ensure styles are loaded
        setTimeout(() => {
            printWindow.print();
        }, 500);
    }
    
    print_mould_details(mouldRef, $wrapper) {
        const printWindow = window.open('', '_blank');
        
        if (!printWindow) {
            frappe.msgprint(__('Pop-up blocked. Please allow pop-ups for printing.'));
            return;
        }
        
        const content = $wrapper.find('.mould-detail-dialog').html();
        
        printWindow.document.write(`
            <html>
                <head>
                    <title>Mould Details: ${mouldRef}</title>
                    <style>
                        body { font-family: Arial, sans-serif; padding: 20px; }
                        h4 { margin-top: 20px; margin-bottom: 10px; font-weight: bold; color: #333; border-bottom: 1px solid #ddd; padding-bottom: 8px; }
                        table { border-collapse: collapse; width: 100%; margin-bottom: 20px; }
                        th, td { border: 1px solid #ddd; padding: 8px; }
                        .text-right { text-align: right; }
                        .historical-data { background-color: #f2d7d5; }
                        .historical-header { background-color: #f9ebea; }
                        .total-data { background-color: #d5f5e3; }
                        .total-header { background-color: #eafaf1; }
                        .spec-table th { background-color: #f1f1f1; }
                        @media print {
                            body { padding: 0; }
                        }
                    </style>
                </head>
                <body>
                    <h2>Mould Details: ${mouldRef}</h2>
                    ${content}
                </body>
            </html>
        `);
        
        printWindow.document.close();
        printWindow.focus();
        
        // Render chart in print window
        setTimeout(() => {
            const mouldData = this.data.report_data.find(m => m.mould_ref === mouldRef);
            const monthNames = moment.monthsShort();
            
            if (mouldData && printWindow.document.getElementById('monthly-chart')) {
                new frappe.Chart(printWindow.document.getElementById('monthly-chart'), {
                    data: {
                        labels: monthNames,
                        datasets: [{
                            name: 'Lifts',
                            values: mouldData.monthly_lifts
                        }]
                    },
                    type: 'bar',
                    height: 250,
                    colors: ['#5e64ff'],
                    axisOptions: {
                        xIsSeries: true
                    }
                });
                
                // Print after chart is rendered
                setTimeout(() => {
                    printWindow.print();
                }, 300);
            } else {
                printWindow.print();
            }
        }, 500);
    }
    
    print_month_details(mouldRef, month, $wrapper) {
        const monthName = moment().month(month-1).format('MMMM');
        const printWindow = window.open('', '_blank');
        
        if (!printWindow) {
            frappe.msgprint(__('Pop-up blocked. Please allow pop-ups for printing.'));
            return;
        }
        
        const content = $wrapper.find('.month-details-table').html();
        
        printWindow.document.write(`
            <html>
                <head>
                    <title>${mouldRef} - ${monthName} ${this.data.current_year} Details</title>
                    <style>
                        body { font-family: Arial, sans-serif; padding: 20px; }
                        table { border-collapse: collapse; width: 100%; }
                        th, td { border: 1px solid #ddd; padding: 8px; }
                        .text-right { text-align: right; }
                        .table-head { background-color: #f1f1f1; }
                        .alt-row { background-color: #f9f9f9; }
                        .total-row { background-color: #eafaf1; font-weight: bold; }
                        tfoot { font-weight: bold; }
                        @media print {
                            body { padding: 0; }
                        }
                    </style>
                </head>
                <body>
                    <h2>${mouldRef} - ${monthName} ${this.data.current_year} Details</h2>
                    ${content}
                </body>
            </html>
        `);
        
        printWindow.document.close();
        printWindow.focus();
        
        // Print after a short delay
        setTimeout(() => {
            printWindow.print();
        }, 300);
    }
}