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
        // Flag to populate mould_ref options only once
        this.optionsPopulated = false;
        this.make();
    }

    make() {
        this.make_filters();
        this.make_body();
        
        // Initialize sorting state
        this.sort_by = 'total_lifts';
        this.sort_order = 'desc';
        
        this.load_data();
        
        // Add action buttons to the page
        this.page.set_primary_action('Print', () => this.print_report(), 'printer');
        
        // Add mould history record button
        this.page.add_inner_button('Mould History Record', () => {
            this.show_mould_history_selector();
        }, 'fa fa-history');
        
        // Add refresh button as secondary action
        this.page.add_inner_button('Refresh', () => {
            frappe.show_alert({
                message: __('Refreshing data...'),
                indicator: 'blue'
            }, 2);
            this.load_data();
        }, 'fa fa-refresh');
        
        // Add export to Excel button
        this.page.add_inner_button('Export to Excel', () => {
            this.export_to_excel();
        }, 'fa fa-file-excel-o');
        
        // Add clear filters button
        this.page.add_inner_button('Clear Filters', () => {
            this.page.fields_dict.year.set_value(new Date().getFullYear());
            this.page.fields_dict.mould_ref.set_value('');
            this.page.fields_dict.search_input.set_value('');
            frappe.show_alert({
                message: __('Filters cleared'),
                indicator: 'blue'
            }, 2);
            this.load_data();
        }, 'fa fa-times');
    }

    make_filters() {
        // Add year filter
        const currentYear = new Date().getFullYear();
        const years = [];
        // Generate last 10 years
        for (let i = 0; i < 10; i++) {
            years.push(currentYear - i);
        }
        
        this.page.add_field({
            label: 'Year',
            fieldtype: 'Select',
            fieldname: 'year',
            options: years.map(y => ({label: y.toString(), value: y})),
            default: currentYear,
            change: () => {
                this.load_data();
            }
        });

        // Mould reference filter: use Link to get distinct mould references
        this.page.add_field({
            label: 'Mould Reference',
            fieldtype: 'Link',
            fieldname: 'mould_ref',
            options: 'Item',
            get_query: () => {
                return {
                    query: "smart_screens.smart_screens.page.mould_performance_report.mould_performance_report.get_mould_items"
                };
            },
            change: () => {
                const val = this.page.fields_dict.mould_ref.get_value();
                if (val) {
                    this.load_data();
                } else {
                    // If cleared, reload all data
                    this.load_data();
                }
            }
        });
        
        // Add search input for quick filtering
        this.page.add_field({
            label: 'Search',
            fieldtype: 'Data',
            fieldname: 'search_input',
            placeholder: 'Search by mould ref...',
            change: () => this.apply_filters()
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
        
        // Show loading message with spinner
        this.$report_area.html(`
                /* Fix for Mould Reference autocomplete dropdown */
                .awesomplete {
                    z-index: 10001 !important;
                }
                
                .awesomplete > ul {
                    z-index: 10001 !important;
                    position: absolute !important;
                    background: white !important;
                    border: 1px solid #d1d8dd !important;
                    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15) !important;
                    max-height: 300px !important;
                    overflow-y: auto !important;
                    margin-top: 2px !important;
                }
                
                .awesomplete > ul > li {
                    padding: 8px 12px !important;
                    cursor: pointer !important;
                    border-bottom: 1px solid #f0f0f0 !important;
                    list-style: none !important;
                }
                
                .awesomplete > ul > li:hover,
                .awesomplete > ul > li[aria-selected="true"] {
                    background-color: #f0f4f7 !important;
                    color: #2490ef !important;
                }
                
                /* Fix for Link field input container */
                .frappe-control[data-fieldtype="Link"] {
                    position: relative !important;
                }
                
                .frappe-control[data-fieldtype="Link"] input {
                    position: relative !important;
                    z-index: 1 !important;
                }
                
                .frappe-control[data-fieldtype="Link"] .link-field {
                    position: relative !important;
                }
                
            
                /* Ensure page header and filters have higher z-index than table */
                .page-head, .page-form {
                    position: relative !important;
                    z-index: 10 !important;
                }
                
<div class="text-center" style="padding: 50px;">
                <i class="fa fa-spinner fa-spin fa-3x text-muted"></i>
                <p class="text-muted" style="margin-top: 20px;">Loading report data...</p>
            </div>
        `);
        
        frappe.call({
            method: 'smart_screens.smart_screens.page.mould_performance_report.mould_performance_report.get_mould_performance_data',
            args: { filters: filters },
            callback: (r) => {
                console.log('Mould performance data response:', r);
                // Handle server exception
                if (r.exc) {
                    console.error('Server exception:', r.exc);
                    this.$report_area.html(`
                        <div class="alert alert-danger">
                            <strong>Server Error:</strong> ${frappe.utils.escape_html(r.exc)}
                        </div>
                    `);
                    frappe.msgprint({
                        title: __('Error'),
                        indicator: 'red',
                        message: r.exc
                    });
                    return;
                }
                // Handle successful response
                if (r.message && r.message.status === 'success') {
                    // Store aggregated data
                    this.data = r.message;
                    this.original_data = r.message.report_data || [];
                    this.filtered_data = [...this.original_data];
                    
                    // Remove old mould ref options population - using Link field now
                    
                    this.sort_data();
                    this.render_data();
                    
                    // Show success message if filters are applied
                    if (filters.mould_ref) {
                        frappe.show_alert({
                            message: __('Showing data for Mould: {0}, Year: {1}', [filters.mould_ref, filters.year]),
                            indicator: 'green'
                        }, 3);
                    } else {
                        frappe.show_alert({
                            message: __('Showing data for Year: {0}', [filters.year]),
                            indicator: 'blue'
                        }, 2);
                    }
                } else if (r.message && r.message.status === 'error') {
                    console.error('Error loading mould performance data:', r.message.message);
                    const errMsg = r.message.message;
                    this.$report_area.html(`
                        <div class="alert alert-warning">
                            <strong>Data Error:</strong> ${frappe.utils.escape_html(errMsg)}
                        </div>
                    `);
                    frappe.msgprint({
                        title: __('Data Error'),
                        indicator: 'orange',
                        message: __(errMsg)
                    });
                } else {
                    // Unexpected response structure
                    const resp = JSON.stringify(r);
                    console.error('Unexpected response:', resp);
                    this.$report_area.html(`
                        <div class="alert alert-warning">
                            <strong>Unexpected Response:</strong> Please check console for details.
                        </div>
                    `);
                    frappe.msgprint(__('Unexpected response received. Please contact administrator.')); 
                }
            },
            error: (err) => {
                console.error('Server error in mould performance call:', err);
                this.$report_area.html(`
                    <div class="alert alert-danger">
                        <strong>Connection Error:</strong> Unable to fetch data from server. 
                        Please check your connection and try again.
                    </div>
                `);
                frappe.msgprint({
                    title: __('Connection Error'),
                    indicator: 'red',
                    message: __('Server error occurred. See console for details.')
                });
            }
        });
    }

    get_filters() {
        const filters = { 
            mould_ref: this.page.fields_dict.mould_ref.get_value() || null,
            year: this.page.fields_dict.year.get_value() || new Date().getFullYear()
        };
        return filters;
    }
    
    apply_filters() {
        const search_value = (this.page.fields_dict.search_input.get_value() || '').toLowerCase().trim();
        
        if (search_value) {
            this.filtered_data = this.original_data.filter(row => {
                const mouldRef = (row.mould_ref || '').toLowerCase();
                const partNo = (row.specification?.part_no || '').toLowerCase();
                return mouldRef.includes(search_value) || partNo.includes(search_value);
            });
            
            if (this.filtered_data.length === 0) {
                frappe.show_alert({
                    message: __('No results found for "{0}"', [search_value]),
                    indicator: 'orange'
                }, 3);
            } else {
                frappe.show_alert({
                    message: __('Found {0} results', [this.filtered_data.length]),
                    indicator: 'green'
                }, 2);
            }
        } else {
            this.filtered_data = [...this.original_data];
        }
        
        this.sort_data();
        this.render_data();
    }
    
    sort_data() {
        const field = this.sort_by;
        const order = this.sort_order;
        this.filtered_data.sort((a, b) => {
            let valA = a[field];
            let valB = b[field];
            // Default to empty string or zero
            if (field === 'mould_ref') {
                valA = (valA || '').toString();
                valB = (valB || '').toString();
                return order === 'asc'
                    ? valA.localeCompare(valB)
                    : valB.localeCompare(valA);
            }
            // Numeric fields
            valA = parseFloat(valA) || 0;
            valB = parseFloat(valB) || 0;
            return order === 'asc' ? valA - valB : valB - valA;
        });
    }
    
    get_sort_icon(field) {
        if (this.sort_by === field) {
            return this.sort_order === 'asc' ? 'fa-sort-up' : 'fa-sort-down';
        }
        return 'fa-sort';
    }

    format_service_records(service_records) {
        if (!service_records || service_records.length === 0) {
            return '<span style="color: #999; font-style: italic;">No records</span>';
        }
        
        const latest = service_records[0];
        const dateFormatted = frappe.datetime.str_to_user(latest.service_date);
        
        let html = `
            <div style="line-height: 1.4;">
                <div style="color: #2c5aa0; font-weight: 600;">${frappe.utils.escape_html(latest.service_type)}</div>
                <div style="color: #6c757d; font-size: 0.9em;">${dateFormatted}</div>
        `;
        
        if (service_records.length > 1) {
            html += `<div style="color: #007bff; margin-top: 3px; font-size: 0.85em;">+${service_records.length - 1} more record${service_records.length > 2 ? 's' : ''}</div>`;
        }
        
        html += '</div>';
        return html;
    }

    render_data() {
        this.$report_area.empty();

        if (!this.filtered_data || this.filtered_data.length === 0) {
            this.$report_area.html(`
                <div class="alert alert-info" style="text-align: center; padding: 40px;">
                    <i class="fa fa-info-circle fa-3x" style="color: #5e64ff;"></i>
                    <h4 style="margin-top: 20px;">No Data Found</h4>
                    <p>No moulding production entries match your current filters.</p>
                    <p class="text-muted">Try adjusting your filters or year selection.</p>
                </div>
            `);
            return;
        }

        // Get selected year for dynamic header
        const selectedYear = this.data.selected_year || new Date().getFullYear();
        const currentYear = new Date().getFullYear();
        const historicalField = `lifts_before_${selectedYear}`;
        
        // Build table with columns: Mould Ref, Lifts Before Year, monthly, Total Lifts
        // Generate month headers dynamically
        const monthLabels = moment.monthsShort();
        const currentMonthIndex = new Date().getMonth();
        
        const headerHTML = `
            <thead>
                <tr>
                    <th class="sortable" data-sort="mould_ref" style="min-width: 120px;">
                        Mould Ref <i class="sort-icon fa ${this.get_sort_icon('mould_ref')}"></i>
                    </th>
                    <th class="sortable text-right" data-sort="${historicalField}" style="min-width: 120px;">
                        Pre-${selectedYear} Lifts <i class="sort-icon fa ${this.get_sort_icon(historicalField)}"></i>
                    </th>
                    ${monthLabels.map((m, idx) => {
                        const isCurrent = idx === currentMonthIndex && selectedYear === currentYear;
                        const style = isCurrent ? 'background-color: #e8f4fc !important; font-weight: bold;' : '';
                        return `<th class="sortable text-right" data-sort="month_${idx+1}" style="min-width: 70px; ${style}">
                            ${m} <i class="sort-icon fa ${this.get_sort_icon('month_' + (idx+1))}"></i>
                        </th>`;
                    }).join('')}
                    <th class="sortable text-right" data-sort="total_lifts" style="min-width: 100px;">
                        Total Lifts <i class="sort-icon fa ${this.get_sort_icon('total_lifts')}"></i>
                    </th>
                    <th style="min-width: 150px;">
                        Service Records
                    </th>
                </tr>
            </thead>
        `;

        const rowsHTML = this.filtered_data.map((row, rowIndex) => {
            const altClass = rowIndex % 2 === 1 ? 'alt-row' : '';
            const mouldRefHtml = row.mould_ref ? frappe.utils.escape_html(row.mould_ref) : '<span class="text-muted">N/A</span>';
            const liftsBeforeYear = row[historicalField] || 0;
            
            return `
            <tr class="${altClass}" data-mould-ref="${frappe.utils.escape_html(row.mould_ref || '')}">
                <td class="mould-cell" style="cursor: pointer; font-weight: 500;">
                    ${mouldRefHtml}
                </td>
                <td class="text-right historical-cell" data-value="${liftsBeforeYear}">
                    ${frappe.format(liftsBeforeYear, { fieldtype: 'Int' })}
                </td>
                ${monthLabels.map((_, idx) => {
                    const monthValue = row['month_' + (idx+1)] || 0;
                    const isCurrent = idx === currentMonthIndex && selectedYear === currentYear;
                    const cellClass = isCurrent ? 'current-month-cell' : 'month-cell';
                    const hasValue = monthValue > 0;
                    const valueClass = hasValue ? 'has-value' : '';
                    return `<td class="text-right ${cellClass} ${valueClass}" data-month="${idx+1}" data-value="${monthValue}" style="cursor: ${hasValue ? 'pointer' : 'default'};">
                        ${frappe.format(monthValue, { fieldtype: 'Int' })}
                    </td>`;
                }).join('')}
                <td class="text-right total-cell" data-value="${row.total_lifts || 0}" style="font-weight: bold;">
                    ${frappe.format(row.total_lifts || 0, { fieldtype: 'Int' })}
                </td>
                <td class="service-records-cell" style="font-size: 0.85em; padding: 8px;">
                    ${this.format_service_records(row.service_records)}
                </td>
            </tr>
        `;
        }).join('');

        // Compute footer sums for Pre-Year, each month, and total lifts
        const totalPreYear = this.filtered_data.reduce((sum, row) => sum + (parseInt(row[historicalField]) || 0), 0);
        const monthlyTotals = monthLabels.map((_, idx) =>
            this.filtered_data.reduce((sum, row) => sum + (parseInt(row['month_' + (idx+1)]) || 0), 0)
        );
        const totalLiftsSum = this.filtered_data.reduce((sum, row) => sum + (parseInt(row.total_lifts) || 0), 0);
        
        const footerHTML = `
            <tfoot style="font-weight: bold; background-color: #f8f9fa;">
                <tr>
                    <th style="text-align: left;">Total:</th>
                    <th class="text-right">${frappe.format(totalPreYear, { fieldtype: 'Int' })}</th>
                    ${monthlyTotals.map(mt => `<th class="text-right">${frappe.format(mt, { fieldtype: 'Int' })}</th>`).join('')}
                    <th class="text-right" style="color: #1e8449;">${frappe.format(totalLiftsSum, { fieldtype: 'Int' })}</th>
                    <th></th>
                </tr>
            </tfoot>
        `;

        const tableHTML = `
            <div class="table-responsive">
                <table class="table table-bordered table-hover mould-performance-table">
                    ${headerHTML}
                    ${footerHTML}
                    <tbody>${rowsHTML}</tbody>
                </table>
            </div>
            <div style="margin-top: 15px; padding: 10px; background: #f8f9fa; border-radius: 4px;">
                <small class="text-muted">
                    <strong>Tips:</strong> 
                    Click on a Mould Reference to view detailed specifications. 
                    Click on month cells (with values) to see individual production entries. 
                    Click column headers to sort.
                </small>
            </div>
        `;

        this.$report_area.html(tableHTML);

        // Bind sorting events on the new table
        this.$report_area.find('.sortable').on('click', (e) => {
            const field = $(e.currentTarget).data('sort');
            if (this.sort_by === field) {
                this.sort_order = this.sort_order === 'asc' ? 'desc' : 'asc';
            } else {
                this.sort_by = field;
                this.sort_order = 'asc';
            }
            this.sort_data();
            this.render_data();
        });
        
        // Bind click events for drill-down
        this.add_click_events();
        
        // Override header styles via jQuery to ensure colors render
        const $headers = this.$report_area.find('thead th');
        $headers.css({
            'background-color': '#3c4858',
            'color': '#ffffff',
            'position': 'sticky',
            'top': '0',
            'z-index': '1'
        });
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
        
        // Add click event to month cells (only for cells with values)
        this.$report_area.find('.month-cell.has-value, .current-month-cell.has-value').on('click', (e) => {
            const $cell = $(e.currentTarget);
            const mouldRef = $cell.closest('tr').attr('data-mould-ref');
            const month = parseInt($cell.attr('data-month'));
            
            if (mouldRef && month) {
                this.show_month_details(mouldRef, month);
            }
        });
        
        // Add hover effect to clickable cells
        this.$report_area.find('.mould-cell').hover(
            function() { $(this).css('background-color', '#e3f2fd'); },
            function() { $(this).css('background-color', ''); }
        );
        
        this.$report_area.find('.month-cell.has-value, .current-month-cell.has-value').hover(
            function() { $(this).css('background-color', '#fff3cd'); },
            function() { $(this).css('background-color', ''); }
        );
    }
    
    show_mould_details(mouldRef) {
        // Find mould data
        const mouldData = this.data.report_data.find(m => m.mould_ref === mouldRef);
        
        if (!mouldData) {
            frappe.msgprint(__('Mould data not found for {0}', [mouldRef]));
            return;
        }
        
        const mouldSpec = mouldData.specification || {};
        const serviceRecords = mouldData.service_records || [];
        const selectedYear = this.data.selected_year || new Date().getFullYear();
        
        // Safely format specification values
        const formatSpecValue = (val, defaultVal = 'N/A') => {
            if (val === null || val === undefined || val === '') return defaultVal;
            return frappe.utils.escape_html(String(val));
        };
        
        // Group service records by month
        const serviceRecordsByMonth = {};
        serviceRecords.forEach(record => {
            if (record.service_date) {
                const recordDate = moment(record.service_date);
                const monthKey = `${recordDate.year()}-${String(recordDate.month() + 1).padStart(2, '0')}`;
                if (!serviceRecordsByMonth[monthKey]) {
                    serviceRecordsByMonth[monthKey] = [];
                }
                serviceRecordsByMonth[monthKey].push(record);
            }
        });
        
        // Build combined history table
        let combinedTableHTML = `
            <div class="combined-history-section">
                <h4>Lifts History & Service Records for ${selectedYear}</h4>
                <table class="table table-bordered table-condensed combined-table">
                    <thead>
                        <tr style="background-color: #f8f9fa;">
                            <th width="25%">Month / Period</th>
                            <th width="15%" class="text-right">Lifts</th>
                            <th width="15%" class="text-center">Service Records</th>
                            <th width="45%">Performance</th>
                        </tr>
                    </thead>
                    <tbody>`;
        
        // Pre-year lifts row
        if (mouldData.historical_lifts) {
            const preYearLifts = mouldData.historical_lifts || 0;
            const barWidth = mouldData.total_lifts > 0 ? (preYearLifts / mouldData.total_lifts) * 100 : 0;
            combinedTableHTML += `
                <tr style="background-color: #fff3e0;">
                    <td><strong>Pre-${selectedYear} Lifts</strong></td>
                    <td class="text-right"><strong>${frappe.format(preYearLifts, { fieldtype: 'Int' })}</strong></td>
                    <td class="text-center">-</td>
                    <td>
                        <div style="background: #e0e0e0; height: 20px; border-radius: 4px; overflow: hidden;">
                            <div style="background: #ff9800; height: 100%; width: ${barWidth}%;"></div>
                        </div>
                    </td>
                </tr>`;
        }
        
        // Monthly rows
        const currentMonthIndex = new Date().getMonth();
        const maxMonthValue = Math.max(...(mouldData.monthly_lifts || [0]));
        
        moment.monthsShort().forEach((monthName, idx) => {
            const monthValue = (mouldData.monthly_lifts && mouldData.monthly_lifts[idx]) || 0;
            const isCurrentMonth = idx === currentMonthIndex && selectedYear === new Date().getFullYear();
            const rowStyle = isCurrentMonth ? 'background-color: #e3f2fd; font-weight: 500;' : (idx % 2 === 1 ? 'background-color: #fafafa;' : 'background-color: #ffffff;');
            const barWidth = maxMonthValue > 0 ? (monthValue / maxMonthValue) * 100 : 0;
            
            // Get service records for this month
            const monthKey = `${selectedYear}-${String(idx + 1).padStart(2, '0')}`;
            const monthServiceRecords = serviceRecordsByMonth[monthKey] || [];
            const serviceCountDisplay = monthServiceRecords.length > 0 
                ? `<span class="badge badge-warning" style="font-size: 0.9em;">${monthServiceRecords.length}</span>` 
                : '-';
            
            let currentBadge = '';
            if (isCurrentMonth) {
                currentBadge = ' <span class="badge badge-info" style="font-size: 0.7em;">Current</span>';
            }
            
            combinedTableHTML += `
                <tr style="${rowStyle}">
                    <td>${monthName} ${selectedYear}${currentBadge}</td>
                    <td class="text-right">${frappe.format(monthValue, { fieldtype: 'Int' })}</td>
                    <td class="text-center">${serviceCountDisplay}</td>
                    <td>
                        <div style="background: #e0e0e0; height: 20px; border-radius: 4px; overflow: hidden;">
                            <div style="background: #5e64ff; height: 100%; width: ${barWidth}%;"></div>
                        </div>
                    </td>
                </tr>`;
        });
        
        // Year total row
        const yearTotal = (mouldData.monthly_lifts || []).reduce((a, b) => a + b, 0);
        const yearBarWidth = mouldData.total_lifts > 0 ? (yearTotal / mouldData.total_lifts) * 100 : 0;
        const totalServiceRecordsInYear = Object.keys(serviceRecordsByMonth)
            .filter(key => key.startsWith(`${selectedYear}-`))
            .reduce((sum, key) => sum + serviceRecordsByMonth[key].length, 0);
        const yearServiceDisplay = totalServiceRecordsInYear > 0 
            ? `<span class="badge badge-success">${totalServiceRecordsInYear}</span>` 
            : '-';
        
        combinedTableHTML += `
                <tr style="background-color: #e8f5e9; font-weight: bold;">
                    <td><strong>${selectedYear} Total</strong></td>
                    <td class="text-right"><strong>${frappe.format(yearTotal, { fieldtype: 'Int' })}</strong></td>
                    <td class="text-center">${yearServiceDisplay}</td>
                    <td>
                        <div style="background: #e0e0e0; height: 20px; border-radius: 4px; overflow: hidden;">
                            <div style="background: #4caf50; height: 100%; width: ${yearBarWidth}%;"></div>
                        </div>
                    </td>
                </tr>`;
        
        // Grand total row
        const allTimeServiceRecords = serviceRecords.length;
        const grandServiceDisplay = allTimeServiceRecords > 0 
            ? `<span class="badge badge-primary">${allTimeServiceRecords}</span>` 
            : '-';
        
        combinedTableHTML += `
                <tr style="background-color: #f3e5f5; font-weight: bold; font-size: 1.05em;">
                    <td><strong>Grand Total (All Time)</strong></td>
                    <td class="text-right"><strong>${frappe.format(mouldData.total_lifts || 0, { fieldtype: 'Int' })}</strong></td>
                    <td class="text-center">${grandServiceDisplay}</td>
                    <td>
                        <div style="background: #e0e0e0; height: 24px; border-radius: 4px; overflow: hidden;">
                            <div style="background: #9c27b0; height: 100%; width: 100%;"></div>
                        </div>
                    </td>
                </tr>
            </tbody>
        </table>
    </div>
        `;
        
        // Build detailed service records table if any exist
        let serviceDetailsHTML = '';
        if (serviceRecords && serviceRecords.length > 0) {
            serviceDetailsHTML = `
                <div class="service-details-section" style="margin-top: 20px;">
                    <h4>Service Records Details (${serviceRecords.length} total)</h4>
                    <table class="table table-bordered table-condensed service-table">
                        <thead>
                            <tr style="background-color: #f8f9fa;">
                                <th width="12%">Date</th>
                                <th width="12%">Month</th>
                                <th width="18%">Service Type</th>
                                <th width="58%">Service Details / Remarks</th>
                            </tr>
                        </thead>
                        <tbody>`;
            
            serviceRecords.forEach((record, idx) => {
                const rowClass = idx % 2 === 1 ? 'style="background-color: #fafafa;"' : '';
                const serviceDate = record.service_date ? frappe.datetime.str_to_user(record.service_date) : 'N/A';
                const monthYear = record.service_date ? moment(record.service_date).format('MMM YYYY') : 'N/A';
                const serviceType = formatSpecValue(record.service_type);
                const serviceDetails = formatSpecValue(record.service_details);
                
                serviceDetailsHTML += `
                    <tr ${rowClass}>
                        <td>${serviceDate}</td>
                        <td>${monthYear}</td>
                        <td><span class="badge badge-warning">${serviceType}</span></td>
                        <td style="white-space: pre-wrap; font-size: 0.9em;">${serviceDetails}</td>
                    </tr>`;
            });
            
            serviceDetailsHTML += `
                        </tbody>
                    </table>
                </div>`;
        }

        
        // Create dialog content
        const dialogContent = `
            <div class="mould-detail-dialog">
                <div class="mould-spec-section">
                    <h4>Mould Specification</h4>
                    <table class="table table-bordered table-condensed spec-table">
                        <tr>
                            <th width="20%">Mould Reference</th>
                            <td width="30%">${formatSpecValue(mouldRef)}</td>
                            <th width="20%">SPP Ref</th>
                            <td width="30%">${formatSpecValue(mouldSpec.spp_ref)}</td>
                        </tr>
                        <tr>
                            <th>Part Number</th>
                            <td>${formatSpecValue(mouldSpec.part_no)}</td>
                            <th>Compound Code</th>
                            <td>${formatSpecValue(mouldSpec.compound_code)}</td>
                        </tr>
                        <tr>
                            <th>Mould Status</th>
                            <td><span class="badge badge-primary">${formatSpecValue(mouldSpec.mould_status)}</span></td>
                            <th>No. of Cavities</th>
                            <td>${formatSpecValue(mouldSpec.noof_cavities, '0')}</td>
                        </tr>
                        <tr>
                            <th>Cavities per Blank</th>
                            <td>${formatSpecValue(mouldSpec.no_of_cavity_per_blank, '0')}</td>
                            <th>No. of Pieces</th>
                            <td>${formatSpecValue(mouldSpec.no_of_piece, '0')}</td>
                        </tr>
                        <tr>
                            <th>Piece Weight (Min/Avg/Max)</th>
                            <td>${formatSpecValue(mouldSpec.wtpiece_min_gms, '0')} / ${formatSpecValue(mouldSpec.wtpiece_avg_gms, '0')} / ${formatSpecValue(mouldSpec.wtpiece_max_gms, '0')} gms</td>
                            <th>Lift Weight (Avg)</th>
                            <td>${formatSpecValue(mouldSpec.wtlift_avg_gms, '0')} gms</td>
                        </tr>
                        <tr>
                            <th>Shell Weight</th>
                            <td>${formatSpecValue(mouldSpec.shell_weight, '0')} gms</td>
                            <th>Blank Type</th>
                            <td>${formatSpecValue(mouldSpec.blank_type)}</td>
                        </tr>
                        <tr>
                            <th>Blank Dimensions (L x W x T)</th>
                            <td colspan="3">${formatSpecValue(mouldSpec.blank_length, '0')} x ${formatSpecValue(mouldSpec.blank_width, '0')} x ${formatSpecValue(mouldSpec.blank_thickness, '0')}</td>
                        </tr>
                    </table>
                </div>
                
                ${combinedTableHTML}
                
                ${serviceDetailsHTML}
            </div>
        `;
        
        // Create and show dialog
        const dialog = new frappe.ui.Dialog({
            title: `Mould Details: ${frappe.utils.escape_html(mouldRef)}`,
            size: 'extra-large',
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
    }
    
    show_month_details(mouldRef, month) {
        // Find mould data
        const mouldData = this.data.report_data.find(m => m.mould_ref === mouldRef);
        
        if (!mouldData || !mouldData.detailed_entries) {
            frappe.msgprint(__('No detailed entries found for {0}', [mouldRef]));
            return;
        }
        
        const selectedYear = this.data.selected_year || new Date().getFullYear();
        const monthKey = `${selectedYear}-${month}`;
        const monthEntries = mouldData.detailed_entries[monthKey] || [];
        const monthName = moment().month(month-1).format('MMMM');
        
        if (monthEntries.length === 0) {
            frappe.msgprint(__('No entries found for {0} in {1} {2}', [mouldRef, monthName, selectedYear]));
            return;
        }

        // Create a completely new dialog to avoid template errors
        const d = new frappe.ui.Dialog({
            title: `${frappe.utils.escape_html(mouldRef)} - ${monthName} ${selectedYear}`,
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
            const date = entry.moulding_date ? frappe.datetime.str_to_user(entry.moulding_date) : 'N/A';
            const prodEntry = frappe.utils.escape_html(entry.production_entry || 'N/A');
            const compound = frappe.utils.escape_html(entry.compound || 'N/A');
            const operator = frappe.utils.escape_html(entry.employee_name || 'N/A');
            const batchNo = frappe.utils.escape_html(entry.batch_no || 'N/A');
            const cavities = entry.no_of_running_cavities || 0;
            const curingTime = entry.curing_time || 0;
            const lifts = entry.number_of_lifts || 0;
            const weight = entry.weight_without_shell || 0;
            
            tableHTML += `<tr class="${rowClass}">
                <td>${date}</td>
                <td><a href="/app/moulding-production-entry/${prodEntry}" target="_blank">${prodEntry}</a></td>
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
        const totalLifts = monthEntries.reduce((sum, entry) => sum + (parseInt(entry.number_of_lifts) || 0), 0);
        const totalWeight = monthEntries.reduce((sum, entry) => sum + (parseFloat(entry.weight_without_shell) || 0), 0);
        const avgCavities = monthEntries.length > 0 
            ? monthEntries.reduce((sum, entry) => sum + (parseInt(entry.no_of_running_cavities) || 0), 0) / monthEntries.length 
            : 0;
        const avgCuringTime = monthEntries.length > 0
            ? monthEntries.reduce((sum, entry) => sum + (parseInt(entry.curing_time) || 0), 0) / monthEntries.length
            : 0;
        
        tableHTML += `</tbody>
            <tfoot class="total-row">
                <tr>
                    <th colspan="5" style="text-align: right;">Totals / Averages:</th>
                    <th class="text-right">${frappe.format(avgCavities, { fieldtype: 'Float', precision: 1 })}</th>
                    <th class="text-right">${frappe.format(avgCuringTime, { fieldtype: 'Float', precision: 1 })}</th>
                    <th class="text-right">${frappe.format(totalLifts, { fieldtype: 'Int' })}</th>
                    <th class="text-right">${frappe.format(totalWeight, { fieldtype: 'Float', precision: 2 })}</th>
                </tr>
            </tfoot>
        </table>
        <div style="margin-top: 10px; padding: 10px; background: #f0f8ff; border-radius: 4px;">
            <p style="margin: 0;"><strong>Summary:</strong> ${monthEntries.length} production entries with total ${totalLifts} lifts</p>
        </div>
    </div>`;
        
        // Set the content after dialog is shown
        d.fields_dict.month_details_html.$wrapper.html(tableHTML);
    }
    
    populate_mould_reference_options(data) {
        // populate the mould_ref Select field with unique values from backend data
        const field = this.page.fields_dict.mould_ref;
        const $input = field.$input;
        // clear existing options
        $input.empty();
        // add a blank/All option
        $input.append($('<option>', { value: '', text: '-- All --' }));
        // get unique and sorted mould_refs
        const moulds = [...new Set(data.map(r => r.mould_ref).filter(v => v))].sort();
        moulds.forEach(mr => {
            $input.append($('<option>', { value: mr, text: mr }));
        });
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
                .mould-performance-table .historical-cell {
                    background-color: #f9e6e6 !important;
                    color: #922b21 !important;
                }
                
                .mould-performance-table .current-month-cell {
                    background-color: #d4edda !important;
                }
                
                .mould-performance-table .current-month-cell.has-value {
                    background-color: #c3e6cb !important;
                    font-weight: bold !important;
                }
                
                .mould-performance-table .monthly-data {
                    background-color: #e8f4fc !important;
                    color: #2874a6 !important;
                }
                
                .mould-performance-table .total-data {
                    background-color: #e8f8f2 !important;
                    color: #1e8449 !important;
                }
                
                .mould-performance-table .total-cell {
                    background-color: #e8f8f2 !important;
                    color: #1e8449 !important;
                    font-weight: bold !important;
                }
                
                .mould-performance-table .has-value {
                    opacity: 1 !important;
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
    
    export_to_excel() {
        if (!this.filtered_data || this.filtered_data.length === 0) {
            frappe.msgprint(__('No data to export'));
            return;
        }
        
        const selectedYear = this.data.selected_year || new Date().getFullYear();
        
        // Prepare data for export
        const monthLabels = moment.monthsShort();
        const headers = ['Mould Reference', `Pre-${selectedYear} Lifts`, ...monthLabels, 'Total Lifts'];
        
        const data = this.filtered_data.map(row => {
            const rowData = [
                row.mould_ref || '',
                row[`lifts_before_${selectedYear}`] || 0
            ];
            
            // Add monthly data
            for (let i = 1; i <= 12; i++) {
                rowData.push(row[`month_${i}`] || 0);
            }
            
            rowData.push(row.total_lifts || 0);
            return rowData;
        });
        
        // Add totals row
        const totalPreYear = this.filtered_data.reduce((sum, row) => sum + (parseInt(row[`lifts_before_${selectedYear}`]) || 0), 0);
        const monthlyTotals = monthLabels.map((_, idx) =>
            this.filtered_data.reduce((sum, row) => sum + (parseInt(row['month_' + (idx+1)]) || 0), 0)
        );
        const totalLiftsSum = this.filtered_data.reduce((sum, row) => sum + (parseInt(row.total_lifts) || 0), 0);
        
        data.push(['TOTAL', totalPreYear, ...monthlyTotals, totalLiftsSum]);
        
        // Prepare filters info
        const filters = this.get_filters();
        let filename = `Mould_Performance_Report_${selectedYear}`;
        if (filters.mould_ref) {
            filename += `_${filters.mould_ref}`;
        }
        
        // Use frappe's built-in export
        frappe.tools.downloadify(data, headers, filename);
        
        frappe.show_alert({
            message: __('Report exported successfully'),
            indicator: 'green'
        }, 3);
    }
    
    show_mould_history_selector() {
        // Create dialog to select mould
        const d = new frappe.ui.Dialog({
            title: __('Select Mould for History Record'),
            fields: [
                {
                    fieldname: 'mould_ref',
                    fieldtype: 'Link',
                    label: 'Mould Reference',
                    options: 'Mould Specification',
                    reqd: 1
                }
            ],
            primary_action_label: __('Generate History Record'),
            primary_action: (values) => {
                if (values.mould_ref) {
                    d.hide();
                    this.generate_mould_history_record(values.mould_ref);
                }
            }
        });
        
        d.show();
    }
    
    generate_mould_history_record(mould_ref) {
        frappe.show_alert({
            message: __('Generating Mould History Record...'),
            indicator: 'blue'
        }, 3);
        
        frappe.call({
            method: 'smart_screens.smart_screens.page.mould_performance_report.mould_performance_report.get_mould_history_record',
            args: { mould_ref: mould_ref },
            callback: (r) => {
                if (r.message && r.message.status === 'success') {
                    this.show_mould_history_report(r.message);
                } else {
                    frappe.msgprint({
                        title: __('Error'),
                        indicator: 'red',
                        message: r.message.message || __('Failed to generate mould history record')
                    });
                }
            },
            error: (err) => {
                console.error('Error generating mould history:', err);
                frappe.msgprint({
                    title: __('Error'),
                    indicator: 'red',
                    message: __('Failed to generate mould history record')
                });
            }
        });
    }
    
    show_mould_history_report(data) {
        const spec = data.specification || {};
        const mouldRef = data.mould_ref;
        
        // Format specification value safely
        const formatVal = (val, defaultVal = 'N/A') => {
            return val ? frappe.utils.escape_html(String(val)) : defaultVal;
        };
        
        // Build HTML for the report
        let html = `
        <div class="mould-history-report" style="font-family: Arial, sans-serif;">
            <div style="text-align: center; margin-bottom: 30px; border-bottom: 3px solid #333; padding-bottom: 20px;">
                <h2 style="margin: 0; color: #333;">MOULD HISTORY RECORD</h2>
                <h3 style="margin: 10px 0; color: #555;">${formatVal(mouldRef)}</h3>
                <p style="margin: 5px 0; color: #777;">Generated on: ${frappe.datetime.str_to_user(frappe.datetime.nowdate())}</p>
            </div>
            
            <div style="margin-bottom: 30px;">
                <h4 style="background: #f0f0f0; padding: 10px; margin: 0 0 10px 0; border-left: 4px solid #333;">Mould Specification</h4>
                <table class="table table-bordered" style="width: 100%; margin-bottom: 20px;">
                    <tr>
                        <td style="width: 25%; font-weight: bold; background: #fafafa;">Mould Reference</td>
                        <td style="width: 25%;">${formatVal(spec.name)}</td>
                        <td style="width: 25%; font-weight: bold; background: #fafafa;">Part Number</td>
                        <td style="width: 25%;">${formatVal(spec.part_no)}</td>
                    </tr>
                    <tr>
                        <td style="font-weight: bold; background: #fafafa;">Compound Code</td>
                        <td>${formatVal(spec.compound_code)}</td>
                        <td style="font-weight: bold; background: #fafafa;">Mould Status</td>
                        <td>${formatVal(spec.mould_status)}</td>
                    </tr>
                    <tr>
                        <td style="font-weight: bold; background: #fafafa;">No. of Cavities</td>
                        <td>${formatVal(spec.noof_cavities, '0')}</td>
                        <td style="font-weight: bold; background: #fafafa;">Cavities per Blank</td>
                        <td>${formatVal(spec.no_of_cavity_per_blank, '0')}</td>
                    </tr>
                    <tr>
                        <td style="font-weight: bold; background: #fafafa;">Piece Weight (Avg)</td>
                        <td>${formatVal(spec.wtpiece_avg_gms, '0')} gms</td>
                        <td style="font-weight: bold; background: #fafafa;">Lift Weight (Avg)</td>
                        <td>${formatVal(spec.wtlift_avg_gms, '0')} gms</td>
                    </tr>
                    <tr>
                        <td style="font-weight: bold; background: #fafafa;">Blank Type</td>
                        <td>${formatVal(spec.blank_type)}</td>
                        <td style="font-weight: bold; background: #fafafa;">Blank Dimensions</td>
                        <td>${formatVal(spec.blank_length, '0')} x ${formatVal(spec.blank_width, '0')} x ${formatVal(spec.blank_thickness, '0')}</td>
                    </tr>
                </table>
            </div>
            
            <div style="margin-bottom: 30px;">
                <h4 style="background: #f0f0f0; padding: 10px; margin: 0 0 10px 0; border-left: 4px solid #333;">Production Summary</h4>
                <table class="table table-bordered" style="width: 100%; margin-bottom: 20px;">
                    <tr>
                        <td style="width: 50%; font-weight: bold; background: #fafafa;">Total Production Entries</td>
                        <td style="width: 50%;">${frappe.format(data.total_entries, {fieldtype: 'Int'})}</td>
                    </tr>
                    <tr>
                        <td style="font-weight: bold; background: #fafafa;">Total Lifts (All Time)</td>
                        <td style="font-weight: bold; color: #1e8449;">${frappe.format(data.total_lifts, {fieldtype: 'Int'})}</td>
                    </tr>
                    <tr>
                        <td style="font-weight: bold; background: #fafafa;">Total Service Records</td>
                        <td>${frappe.format(data.total_service_records, {fieldtype: 'Int'})}</td>
                    </tr>
                </table>
            </div>
        `;
        
        // Add yearly summary
        if (data.yearly_summary && Object.keys(data.yearly_summary).length > 0) {
            html += `
            <div style="margin-bottom: 30px;">
                <h4 style="background: #f0f0f0; padding: 10px; margin: 0 0 10px 0; border-left: 4px solid #333;">Yearly Performance</h4>
                <table class="table table-bordered" style="width: 100%;">
                    <thead style="background: #333; color: white;">
                        <tr>
                            <th style="padding: 10px;">Year</th>
                            <th style="padding: 10px; text-align: right;">Total Lifts</th>
                            <th style="padding: 10px; text-align: right;">Production Entries</th>
                            <th style="padding: 10px; text-align: right;">Months Active</th>
                        </tr>
                    </thead>
                    <tbody>`;
            
            const years = Object.keys(data.yearly_summary).sort((a, b) => b - a);
            years.forEach((year, idx) => {
                const summary = data.yearly_summary[year];
                const rowClass = idx % 2 === 1 ? 'background: #f9f9f9;' : '';
                html += `
                        <tr style="${rowClass}">
                            <td style="padding: 8px;">${year}</td>
                            <td style="padding: 8px; text-align: right;">${frappe.format(summary.total_lifts, {fieldtype: 'Int'})}</td>
                            <td style="padding: 8px; text-align: right;">${frappe.format(summary.entry_count, {fieldtype: 'Int'})}</td>
                            <td style="padding: 8px; text-align: right;">${frappe.format(summary.months_active, {fieldtype: 'Int'})}</td>
                        </tr>`;
            });
            
            html += `
                    </tbody>
                </table>
            </div>`;
        }
        
        // Add service records
        if (data.service_records && data.service_records.length > 0) {
            html += `
            <div style="margin-bottom: 30px; page-break-before: always;">
                <h4 style="background: #f0f0f0; padding: 10px; margin: 0 0 10px 0; border-left: 4px solid #333;">Service Records</h4>
                <table class="table table-bordered" style="width: 100%;">
                    <thead style="background: #333; color: white;">
                        <tr>
                            <th style="padding: 10px; width: 15%;">Date</th>
                            <th style="padding: 10px; width: 20%;">Service Type</th>
                            <th style="padding: 10px; width: 65%;">Details</th>
                        </tr>
                    </thead>
                    <tbody>`;
            
            data.service_records.forEach((record, idx) => {
                const rowClass = idx % 2 === 1 ? 'background: #f9f9f9;' : '';
                const serviceDate = record.service_date ? frappe.datetime.str_to_user(record.service_date) : 'N/A';
                html += `
                        <tr style="${rowClass}">
                            <td style="padding: 8px;">${serviceDate}</td>
                            <td style="padding: 8px;">${formatVal(record.service_type)}</td>
                            <td style="padding: 8px;">${formatVal(record.service_details)}</td>
                        </tr>`;
            });
            
            html += `
                    </tbody>
                </table>
            </div>`;
        } else {
            html += `
            <div style="margin-bottom: 30px;">
                <h4 style="background: #f0f0f0; padding: 10px; margin: 0 0 10px 0; border-left: 4px solid #333;">Service Records</h4>
                <p style="padding: 20px; text-align: center; color: #999;">No service records found for this mould.</p>
            </div>`;
        }
        
        html += `</div>`;
        
        // Create dialog to show the report
        const dialog = new frappe.ui.Dialog({
            title: __('Mould History Record: {0}', [mouldRef]),
            size: 'extra-large',
            fields: [
                {
                    fieldname: 'history_html',
                    fieldtype: 'HTML',
                    options: html
                }
            ],
            primary_action_label: __('Print'),
            primary_action: () => {
                this.print_mould_history(mouldRef, dialog.$wrapper);
            },
            secondary_action_label: __('Export PDF'),
            secondary_action: () => {
                this.export_mould_history_pdf(mouldRef, html);
            }
        });
        
        dialog.show();
        dialog.$wrapper.find('.modal-dialog').css('max-width', '95%');
    }
    
    print_mould_history(mouldRef, $wrapper) {
        const printWindow = window.open('', '_blank');
        
        if (!printWindow) {
            frappe.msgprint(__('Pop-up blocked. Please allow pop-ups for printing.'));
            return;
        }
        
        const content = $wrapper.find('.mould-history-report').html();
        
        printWindow.document.write(`
            <html>
                <head>
                    <title>Mould History Record: ${mouldRef}</title>
                    <style>
                        body { font-family: Arial, sans-serif; padding: 20px; }
                        table { border-collapse: collapse; width: 100%; margin-bottom: 20px; }
                        th, td { border: 1px solid #ddd; padding: 8px; }
                        .text-right { text-align: right; }
                        h2, h3, h4 { color: #333; }
                        @media print {
                            body { padding: 0; }
                            .page-break { page-break-before: always; }
                        }
                    </style>
                </head>
                <body>
                    ${content}
                </body>
            </html>
        `);
        
        printWindow.document.close();
        printWindow.focus();
        
        setTimeout(() => {
            printWindow.print();
        }, 500);
    }
    
    export_mould_history_pdf(mouldRef, html) {
        frappe.msgprint(__('PDF export functionality will be implemented. For now, please use Print option.'));
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