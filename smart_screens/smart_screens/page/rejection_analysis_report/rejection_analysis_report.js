frappe.pages['rejection-analysis-report'].on_page_load = function(wrapper) {
    var page = frappe.ui.make_app_page({
        parent: wrapper,
        title: 'Rejection Analysis Report',
        single_column: true
    });

    // Initialize the page
    new RejectionAnalysisReport(page);
};

class RejectionAnalysisReport {
    constructor(page) {
        this.page = page;
        this.wrapper = this.page.main;
        this.make_page();
        this.bind_events();
        this.set_default_date();
        this.load_shift_options();
    }

    make_page() {
        // Page content is loaded from HTML file
        $(this.wrapper).empty();
        $(this.wrapper).html(frappe.render_template('rejection_analysis_report'));
    }

    set_default_date() {
        // Set today's date as default
        const today = frappe.datetime.get_today();
        $('#filter-date').val(today);
    }

    bind_events() {
        const self = this;

        // Generate Report button
        $('#btn-generate').on('click', function() {
            self.generate_report();
        });

        // Submit Report button
        $('#btn-submit').on('click', function() {
            self.submit_report();
        });

        // Save Report button
        $('#btn-save').on('click', function() {
            self.save_report();
        });

        // Filter change events
        $('#filter-date, #filter-shift, #filter-operator, #filter-press, #filter-item, #filter-lot').on('change keyup', function() {
            // Auto-generate on filter change (debounced)
            clearTimeout(self.filterTimeout);
            self.filterTimeout = setTimeout(() => {
                self.generate_report();
            }, 500);
        });
    }

    load_shift_options() {
        const date = $('#filter-date').val();

        frappe.call({
            method: 'smart_screens.smart_screens.page.rejection_analysis_report.rejection_analysis_report.get_shift_options',
            args: {
                production_date: date
            },
            callback: (r) => {
                if (r.message) {
                    const $select = $('#filter-shift');
                    $select.empty();

                    r.message.forEach(option => {
                        $select.append($('<option>')
                            .val(option.value)
                            .text(option.label)
                        );
                    });
                }
            }
        });
    }

    generate_report() {
        const self = this;
        const filters = this.get_filters();

        // Show loading indicator
        $('#loading-indicator').show();
        $('#rejection-table-body').empty();

        // Fetch rejection data
        frappe.call({
            method: 'smart_screens.smart_screens.page.rejection_analysis_report.rejection_analysis_report.get_rejection_data',
            args: filters,
            callback: (r) => {
                $('#loading-indicator').hide();

                if (r.message) {
                    self.rejection_data = r.message;
                    self.render_table(r.message);
                    self.load_summary();
                }
            },
            error: () => {
                $('#loading-indicator').hide();
                frappe.msgprint(__('Error loading rejection data'));
            }
        });
    }

    get_filters() {
        return {
            production_date: $('#filter-date').val(),
            shift_filter: $('#filter-shift').val(),
            operator_filter: $('#filter-operator').val().trim(),
            press_filter: $('#filter-press').val().trim(),
            item_filter: $('#filter-item').val().trim(),
            lot_filter: $('#filter-lot').val().trim()
        };
    }

    render_table(data) {
        const $tbody = $('#rejection-table-body');
        $tbody.empty();

        if (!data || data.length === 0) {
            $tbody.append(`
                <tr>
                    <td colspan="12" style="text-align: center; padding: 30px; color: #7f8c8d;">
                        <i class="fa fa-inbox fa-3x" style="opacity: 0.3;"></i>
                        <p style="margin-top: 10px;">No rejection data found for the selected filters</p>
                    </td>
                </tr>
            `);
            return;
        }

        data.forEach(row => {
            const lotRejClass = row.lot_rej_pct > 4 ? 'high' : '';
            const finalRejClass = row.final_insp_rej_pct > 4 ? 'high' : '';

            const $row = $(`
                <tr data-lot="${row.lot_no}">
                    <td>${row.production_date_formatted}</td>
                    <td>${row.shift_type}</td>
                    <td>${row.operator_name || '-'}</td>
                    <td>${row.press_number || '-'}</td>
                    <td>${row.item_code}</td>
                    <td>${row.mould_ref}</td>
                    <td>${row.lot_no}</td>
                    <td>${row.patrol_rej_pct}%</td>
                    <td>${row.line_rej_pct}%</td>
                    <td class="rejection-value ${lotRejClass}" data-type="lot">
                        ${row.lot_rej_pct}%
                    </td>
                    <td class="rejection-value ${finalRejClass}" data-type="final">
                        ${row.final_insp_rej_pct}%
                    </td>
                    <td>
                        ${(row.needs_car_lot || row.needs_car_final) ?
                            '<button class="btn btn-sm btn-warning btn-generate-car">GENERATE CAR</button>' :
                            '-'}
                    </td>
                </tr>
            `);

            // Click event for LOT REJ% and Final Insp REJ%
            $row.find('.rejection-value').on('click', function() {
                const type = $(this).data('type');
                const lot_no = $(this).closest('tr').data('lot');
                this.show_rejection_details(lot_no, type);
            }.bind(this));

            // Click event for GENERATE CAR button
            $row.find('.btn-generate-car').on('click', function() {
                const lot_no = $(this).closest('tr').data('lot');
                this.generate_car(row);
            }.bind(this));

            $tbody.append($row);
        });
    }

    load_summary() {
        const filters = this.get_filters();

        frappe.call({
            method: 'smart_screens.smart_screens.page.rejection_analysis_report.rejection_analysis_report.get_rejection_summary',
            args: filters,
            callback: (r) => {
                if (r.message) {
                    $('#avg-lot-rej').text(r.message.avg_lot_rej_pct + '%');
                    $('#avg-final-insp-rej').text(r.message.avg_final_insp_rej_pct + '%');
                }
            }
        });
    }

    show_rejection_details(lot_no, type) {
        frappe.call({
            method: 'smart_screens.smart_screens.page.rejection_analysis_report.rejection_analysis_report.get_rejection_details',
            args: {
                lot_no: lot_no,
                inspection_type: type
            },
            callback: (r) => {
                if (r.message) {
                    this.render_details_modal(r.message);
                }
            }
        });
    }

    render_details_modal(data) {
        const $body = $('#rejection-details-body');
        $body.empty();

        $body.append(`
            <h5>Lot: ${data.lot_no}</h5>
            <h6>Inspection Type: ${data.inspection_type}</h6>
            <table class="table table-bordered" style="margin-top: 15px;">
                <thead>
                    <tr>
                        <th>Inspection Entry</th>
                        <th>Date</th>
                        <th>Inspection Type</th>
                        <th>Inspected Qty</th>
                        <th>Rejected Qty</th>
                        <th>Rejection %</th>
                    </tr>
                </thead>
                <tbody>
                    ${data.details.map(detail => `
                        <tr>
                            <td>${detail.name}</td>
                            <td>${frappe.datetime.str_to_user(detail.posting_date)}</td>
                            <td>${detail.inspection_type}</td>
                            <td>${detail.total_inspected_qty_nos || 0}</td>
                            <td>${detail.total_rejected_qty || 0}</td>
                            <td>${detail.total_rejected_qty_in_percentage || 0}%</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `);

        $('#rejection-details-modal').modal('show');
    }

    generate_car(rowData) {
        const self = this;

        // Store current row data
        this.current_car_data = rowData;

        // Populate production details in CAR modal
        $('#car-prod-date').text(rowData.production_date_formatted);
        $('#car-shift').text(rowData.shift_type);
        $('#car-item').text(rowData.item_code);
        $('#car-lot').text(rowData.lot_no);

        // Clear form fields
        $('#car-problem-desc').val('');
        $('#car-corrective-action').val('');
        $('#car-non-detection').val('');
        $('#car-occurrence').val('');
        $('#car-remarks').val('');
        $('.why-input').val('');
        $('#why-why-section').hide();

        // Bind WHY-WHY Analysis button
        $('#btn-why-why-analysis').off('click').on('click', function() {
            $('#why-why-section').slideToggle();
        });

        // Bind Save as Draft button
        $('#btn-save-car-draft').off('click').on('click', function() {
            self.save_car(false);
        });

        // Bind Submit CAR button
        $('#btn-submit-car').off('click').on('click', function() {
            self.save_car(true);
        });

        // Show CAR modal
        $('#car-modal').modal('show');
    }

    save_car(is_submit) {
        const self = this;

        // Collect CAR data
        const car_data = {
            production_entry: this.current_car_data.production_entry,
            production_date: this.current_car_data.production_date,
            shift_type: this.current_car_data.shift_type,
            item_code: this.current_car_data.item_code,
            lot_no: this.current_car_data.lot_no,
            mould_ref: this.current_car_data.mould_ref,
            operator_name: this.current_car_data.operator_name,
            press_number: this.current_car_data.press_number,

            // Rejection data
            patrol_rej_pct: this.current_car_data.patrol_rej_pct,
            line_rej_pct: this.current_car_data.line_rej_pct,
            lot_rej_pct: this.current_car_data.lot_rej_pct,
            final_insp_rej_pct: this.current_car_data.final_insp_rej_pct,

            // CAR fields
            problem_description: $('#car-problem-desc').val(),
            corrective_action: $('#car-corrective-action').val(),
            cause_non_detection: $('#car-non-detection').val(),
            cause_occurrence: $('#car-occurrence').val(),
            remarks: $('#car-remarks').val(),

            // WHY-WHY Analysis
            why_1: $('#why-1').val(),
            why_2: $('#why-2').val(),
            why_3: $('#why-3').val(),
            why_4: $('#why-4').val(),
            why_5: $('#why-5').val(),

            is_submit: is_submit
        };

        // Validate required fields
        if (!car_data.problem_description) {
            frappe.msgprint(__('Problem Description is required'));
            return;
        }

        if (!car_data.corrective_action) {
            frappe.msgprint(__('Corrective Action is required'));
            return;
        }

        // Call backend to save CAR
        frappe.call({
            method: 'smart_screens.smart_screens.page.rejection_analysis_report.rejection_analysis_report.create_car',
            args: {
                car_data: car_data
            },
            callback: (r) => {
                if (r.message && r.message.success) {
                    frappe.msgprint({
                        title: __(is_submit ? 'CAR Submitted' : 'CAR Saved'),
                        message: __('CAR {0} has been {1} successfully', [r.message.car_name, is_submit ? 'submitted' : 'saved']),
                        indicator: 'green'
                    });

                    // Close modal
                    $('#car-modal').modal('hide');

                    // Refresh table
                    self.generate_report();
                } else {
                    frappe.msgprint({
                        title: __('Error'),
                        message: r.message.error || __('Failed to save CAR'),
                        indicator: 'red'
                    });
                }
            },
            error: () => {
                frappe.msgprint(__('Error saving CAR'));
            }
        });
    }

    submit_report() {
        frappe.msgprint({
            title: __('Submit Report'),
            message: __('Report submission will be implemented.'),
            indicator: 'green'
        });
        // TODO: Implement report submission
    }

    save_report() {
        frappe.msgprint({
            title: __('Save Report'),
            message: __('Report saving will be implemented.'),
            indicator: 'blue'
        });
        // TODO: Implement report saving
    }
}
