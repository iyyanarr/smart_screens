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
        this.add_actions();
        this.load_data();
    }

    make_filters() {
        // Date Range Filter
        this.page.add_field({
            label: 'Date Range',
            fieldtype: 'DateRange',
            fieldname: 'date_range',
            default: [
                frappe.datetime.add_months(frappe.datetime.get_today(), -12),
                frappe.datetime.get_today()
            ],
            change: () => this.load_data()
        });

        // Mould Reference Filter
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
    }

    add_actions() {
        this.page.add_inner_button(__('Print Report'), () => this.print_report());
        this.page.add_inner_button(__('Export'), () => this.export_report());
    }

    load_data() {
        let filters = this.get_filters();
        
        frappe.call({
            method: 'smart_screens.smart_screens.page.mould_performance_report.mould_performance_report.get_mould_performance_data',
            args: {
                filters: filters
            },
            callback: (r) => {
                if (r.message && r.message.status === 'success') {
                    this.render_data(r.message);
                } else {
                    frappe.msgprint(__('Error loading data'));
                }
            }
        });
    }

    get_filters() {
        const date_range = this.page.fields_dict.date_range.get_value();
        return {
            mould_ref: this.page.fields_dict.mould_ref.get_value(),
            from_date: date_range && date_range[0],
            to_date: date_range && date_range[1]
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
                    <th rowspan="2">Mould Ref</th>
                    <th rowspan="2">Part No</th>
                    <th class="historical-column" rowspan="2">Historical Lifts<br><small>(Pre-${data.current_year})</small></th>
                    <th class="current-year-header" colspan="12">${data.current_year} Monthly Lifts</th>
                    <th rowspan="2">Total Lifts</th>
                </tr>
                <tr>
                    ${monthNames.map(month => `<th class="month-column">${month}</th>`).join('')}
                </tr>
            </thead>
        `;

        // Create table rows
        const rowsHTML = data.report_data.map(row => `
            <tr class="mould-row" data-mould='${JSON.stringify(row)}'>
                <td>${row.mould_ref || ''}</td>
                <td>${row.part_no || ''}</td>
                <td class="text-right historical-column">
                    ${frappe.format(row.historical_lifts, { fieldtype: 'Int' })}
                </td>
                ${row.monthly_lifts.map(lifts => 
                    `<td class="text-right month-column ${lifts > 0 ? 'has-lifts' : ''}">${
                        frappe.format(lifts, { fieldtype: 'Int' })
                    }</td>`
                ).join('')}
                <td class="text-right total-column">
                    <strong>${frappe.format(row.total_lifts, { fieldtype: 'Int' })}</strong>
                </td>
            </tr>
        `).join('');

        // Create table
        const tableHTML = `
            <div class="table-responsive">
                <table class="table table-bordered table-hover">
                    ${headerHTML}
                    <tbody>
                        ${rowsHTML}
                    </tbody>
                </table>
            </div>
        `;

        this.$report_area.html(tableHTML);
        this.bind_row_click();
    }

    bind_row_click() {
        this.$report_area.find('.mould-row').on('click', (e) => {
            const row = $(e.currentTarget);
            const data = JSON.parse(row.attr('data-mould'));
            this.show_detail_dialog(data);
        });
    }

    show_detail_dialog(data) {
        const monthNames = moment.months();
        const dialog = new frappe.ui.Dialog({
            title: __('Mould Performance Details'),
            fields: [
                {
                    fieldtype: 'Section Break',
                    label: __('Mould Information')
                },
                {
                    fieldtype: 'HTML',
                    fieldname: 'mould_info',
                    options: `
                        <div class="mould-details">
                            <div class="row">
                                <div class="col-sm-6">
                                    <p><strong>Mould Reference:</strong> ${data.mould_ref}</p>
                                    <p><strong>Part Number:</strong> ${data.part_no}</p>
                                </div>
                                <div class="col-sm-6">
                                    <p><strong>Total Lifts:</strong> ${frappe.format(data.total_lifts, { fieldtype: 'Int' })}</p>
                                    <p><strong>Historical Lifts:</strong> ${frappe.format(data.historical_lifts, { fieldtype: 'Int' })}</p>
                                </div>
                            </div>
                        </div>
                    `
                },
                {
                    fieldtype: 'Section Break',
                    label: __('Monthly Performance')
                },
                {
                    fieldtype: 'HTML',
                    fieldname: 'monthly_chart',
                    options: `<div id="monthly_chart"></div>`
                }
            ],
            primary_action_label: __('Print'),
            primary_action: () => {
                this.print_mould_details(data);
            }
        });

        dialog.show();

        // Render chart after dialog is shown
        setTimeout(() => {
            new frappe.Chart("#monthly_chart", {
                data: {
                    labels: monthNames,
                    datasets: [{
                        name: "Monthly Lifts",
                        values: data.monthly_lifts
                    }]
                },
                type: 'bar',
                height: 300,
                colors: ['#7cd6fd']
            });
        }, 250);
    }

    print_mould_details(data) {
        const monthNames = moment.months();
        const print_content = `
            <h2>Mould Performance Report</h2>
            <hr>
            <div class="mould-info">
                <h3>Mould Information</h3>
                <p><strong>Mould Reference:</strong> ${data.mould_ref}</p>
                <p><strong>Part Number:</strong> ${data.part_no}</p>
                <p><strong>Total Lifts:</strong> ${frappe.format(data.total_lifts, { fieldtype: 'Int' })}</p>
                <p><strong>Historical Lifts:</strong> ${frappe.format(data.historical_lifts, { fieldtype: 'Int' })}</p>
            </div>
            <div class="monthly-performance">
                <h3>Monthly Performance</h3>
                <table class="table table-bordered">
                    <thead>
                        <tr>
                            <th>Month</th>
                            <th>Number of Lifts</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${monthNames.map((month, idx) => `
                            <tr>
                                <td>${month}</td>
                                <td>${frappe.format(data.monthly_lifts[idx], { fieldtype: 'Int' })}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;

        const w = window.open();
        frappe.dom.set_style(frappe.dom.get_print_style());
        w.document.write(print_content);
        w.print();
    }

    print_report() {
        let w = window.open();
        frappe.dom.set_style(frappe.dom.get_print_style());
        w.document.write(this.$report_area.html());
        w.print();
    }

    export_report() {
        frappe.tools.downloadTable(this.$report_area.find('table')[0], 'Mould_Performance_Report');
    }
}