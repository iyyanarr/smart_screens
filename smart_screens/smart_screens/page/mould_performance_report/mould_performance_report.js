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

        // Add mould reference filter
        this.page.add_field({
            label: 'Mould Reference',
            fieldtype: 'Link',
            fieldname: 'mould_ref',
            options: 'Mould Specification',
            change: () => this.load_data()
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

    render_data(data) {
        this.$report_area.empty();

        if (!data.report_data || !data.report_data.length) {
            this.$report_area.html('<div class="text-muted">No data found</div>');
            return;
        }

        // Create table header
        const monthNames = moment.monthsShort();
        const headerHTML = `
            <thead>
                <tr>
                    <th class="mould-col">Mould Ref</th>
                    <th class="part-col">Part No</th>
                    <th class="historical-col">Historical Lifts<br><small>(Pre-${data.current_year})</small></th>
                    ${monthNames.map((month, idx) => `<th class="month-col month-${idx+1}">${month}</th>`).join('')}
                    <th class="total-col">Total Lifts</th>
                </tr>
            </thead>
        `;

        // Create table rows
        const rowsHTML = data.report_data.map(row => `
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

        // Add conditional formatting for better visualization
        this.add_conditional_formatting();
        
        // Add click events to open the dialog
        this.add_click_events();
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
        
        // Create dialog content
        const dialogContent = `
            <div class="mould-detail-dialog">
                <div class="mould-spec-section">
                    <h4>Mould Specification</h4>
                    <table class="table table-bordered table-condensed spec-table">
                        <tr>
                            <th width="20%">Mould Reference</th>
                            <td width="30%">${mouldRef}</td>
                            <th width="20%">Part Number</th>
                            <td width="30%">${mouldSpec.part_no || ''}</td>
                        </tr>
                        <tr>
                            <th>Compound Code</th>
                            <td>${mouldSpec.compound_code || ''}</td>
                            <th>Mould Status</th>
                            <td>${mouldSpec.mould_status || ''}</td>
                        </tr>
                        <tr>
                            <th>No. of Cavities</th>
                            <td>${mouldSpec.noof_cavities || ''}</td>
                            <th>Cavities per Blank</th>
                            <td>${mouldSpec.no_of_cavity_per_blank || ''}</td>
                        </tr>
                        <tr>
                            <th>Piece Weight (Min/Avg/Max)</th>
                            <td>${mouldSpec.wtpiece_min_gms || '0'} / ${mouldSpec.wtpiece_avg_gms || '0'} / ${mouldSpec.wtpiece_max_gms || '0'} gms</td>
                            <th>Lift Weight (Avg)</th>
                            <td>${mouldSpec.wtlift_avg_gms || '0'} gms</td>
                        </tr>
                        <tr>
                            <th>Blank Type</th>
                            <td>${mouldSpec.blank_type || ''}</td>
                            <th>Blank Dimensions</th>
                            <td>${mouldSpec.blank_length || '0'} x ${mouldSpec.blank_width || '0'} x ${mouldSpec.blank_thickness || '0'}</td>
                        </tr>
                    </table>
                </div>
                
                <div class="mould-performance-section">
                    <h4>Lift Performance Summary</h4>
                    <table class="table table-bordered table-condensed summary-table">
                        <tr>
                            <th class="historical-header" width="50%">Historical Lifts (Pre-${this.data.current_year})</th>
                            <td class="historical-data text-right" width="50%">${frappe.format(mouldData.historical_lifts, { fieldtype: 'Int' })}</td>
                        </tr>
                        <tr>
                            <th>Current Year Lifts (${this.data.current_year})</th>
                            <td class="text-right">${frappe.format(mouldData.monthly_lifts.reduce((a, b) => a + b, 0), { fieldtype: 'Int' })}</td>
                        </tr>
                        <tr>
                            <th class="total-header">Total Lifts</th>
                            <td class="total-data text-right">${frappe.format(mouldData.total_lifts, { fieldtype: 'Int' })}</td>
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
        
        // Create entries table
        let entriesHTML = `
            <div class="month-details-table">
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
                    <tbody>
        `;
        
        monthEntries.forEach((entry, idx) => {
            entriesHTML += `
                <tr class="${idx % 2 === 1 ? 'alt-row' : ''}">
                    <td>${frappe.datetime.str_to_user(entry.moulding_date)}</td>
                    <td>${entry.production_entry}</td>
                    <td>${entry.compound || ''}</td>
                    <td>${entry.employee_name || ''}</td>
                    <td>${entry.batch_no || ''}</td>
                    <td class="text-right">${entry.no_of_running_cavities || '0'}</td>
                    <td class="text-right">${entry.curing_time || '0'}</td>
                    <td class="text-right">${entry.number_of_lifts || '0'}</td>
                    <td class="text-right">${frappe.format(entry.weight_without_shell || 0, { fieldtype: 'Float', precision: 2 })}</td>
                </tr>
            `;
        });
        
        entriesHTML += `
                </tbody>
                <tfoot>
                    <tr class="total-row">
                        <th colspan="7" class="text-right">Total:</th>
                        <th class="text-right">${monthEntries.reduce((sum, entry) => sum + (entry.number_of_lifts || 0), 0)}</th>
                        <th class="text-right">${frappe.format(monthEntries.reduce((sum, entry) => sum + (entry.weight_without_shell || 0), 0), { fieldtype: 'Float', precision: 2 })}</th>
                    </tr>
                </tfoot>
            </table>
            </div>
        `;
        
        // Create and show dialog
        const dialog = new frappe.ui.Dialog({
            title: `${mouldRef} - ${monthName} ${this.data.current_year} Details`,
            size: 'large',
            fields: [
                {
                    fieldname: 'month_details_html',
                    fieldtype: 'HTML',
                    options: entriesHTML
                }
            ],
            primary_action_label: 'Print',
            primary_action: () => {
                this.print_month_details(mouldRef, month, dialog.$wrapper);
            }
        });
        
        dialog.show();
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