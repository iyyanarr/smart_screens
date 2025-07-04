frappe.pages['shift-quantity-planned-report'].on_page_load = function(wrapper) {
    var page = frappe.ui.make_app_page({
        parent: wrapper,
        title: 'Shift Quantity Planned Report',
        single_column: true
    });

    // Initialize the report
    new ShiftQuantityPlannedReport(page);
};

class ShiftQuantityPlannedReport {
    constructor(page) {
        this.page = page;
        this.wrapper = $(this.page.body);
        this.filters = {};
        this.data = [];
        
        this.init();
    }

    init() {
        this.setup_page();
        this.setup_filters();
        this.setup_events();
        this.load_filter_options();
        this.load_data();
    }

    setup_page() {
        // Load the HTML template
        this.wrapper.html(frappe.render_template('shift_quantity_planned_report'));
    }

    setup_filters() {
        // Set default date to today
        const today = frappe.datetime.get_today();
        $('#date-filter').val(today);
        this.filters.date = today;
    }

    setup_events() {
        const self = this;

        // Apply filters button
        $('#apply-filters').on('click', function() {
            self.apply_filters();
        });

        // Refresh button
        $('#refresh-data').on('click', function() {
            self.load_data();
        });

        // Export to Excel button
        $('#export-excel').on('click', function() {
            self.export_to_excel();
        });

        // Filter change events
        $('#date-filter, #shift-filter').on('change', function() {
            // Auto-apply filters on change
            setTimeout(() => self.apply_filters(), 300);
        });
    }

    async load_filter_options() {
        try {
            const response = await frappe.call({
                method: 'smart_screens.smart_screens.page.shift_quantity_planned_report.shift_quantity_planned_report.get_filter_options'
            });

            if (response.message) {
                this.populate_shift_filter(response.message.shift_types);
            }
        } catch (error) {
            console.error('Error loading filter options:', error);
        }
    }

    populate_shift_filter(shift_types) {
        const shiftSelect = $('#shift-filter');
        shiftSelect.empty().append('<option value="">All Shifts</option>');
        
        shift_types.forEach(shift => {
            shiftSelect.append(`<option value="${shift.name}">${shift.name}</option>`);
        });
    }

    apply_filters() {
        this.filters = {
            date: $('#date-filter').val(),
            shift_type: $('#shift-filter').val()
        };
        
        this.load_data();
    }

    async load_data() {
        this.show_loading();
        this.hide_error();

        try {
            const response = await frappe.call({
                method: 'smart_screens.smart_screens.page.shift_quantity_planned_report.shift_quantity_planned_report.get_shift_quantity_planned_data',
                args: {
                    filters: this.filters
                }
            });

            if (response.message) {
                if (response.message.error) {
                    this.show_error(response.message.error);
                } else {
                    this.data = response.message.data || [];
                    this.render_data();
                    this.update_summary();
                }
            }
        } catch (error) {
            console.error('Error loading data:', error);
            this.show_error('Failed to load data. Please try again.');
        } finally {
            this.hide_loading();
        }
    }

    render_data() {
        const tbody = $('#data-tbody');
        tbody.empty();

        if (this.data.length === 0) {
            this.show_no_data();
            return;
        }

        this.hide_no_data();

        this.data.forEach(row => {
            const tr = $(`
                <tr>
                    <td>${row.item || ''}</td>
                    <td>${row.press || ''}</td>
                    <td>${row.mould || ''}</td>
                    <td>${row.date ? frappe.datetime.str_to_user(row.date) : ''}</td>
                    <td>${row.shift_type || ''}</td>
                    <td class="text-right">${this.format_number(row.noof_cavities)}</td>
                    <td class="text-right">${this.format_number(row.target_qty)}</td>
                    <td class="text-right font-weight-bold text-primary">${this.format_number(row.expected_production_qty)}</td>
                    <td><span class="badge badge-info">${row.plan_types_str || 'N/A'}</span></td>
                </tr>
            `);
            tbody.append(tr);
        });
    }

    update_summary() {
        if (this.data.length === 0) {
            $('#summary-cards').hide();
            return;
        }

        const totalItems = new Set(this.data.map(row => row.item)).size;
        const totalPresses = new Set(this.data.map(row => row.press)).size;
        const totalExpectedQty = this.data.reduce((sum, row) => sum + (row.expected_production_qty || 0), 0);
        const totalRecords = this.data.length;

        $('#total-items').text(totalItems);
        $('#total-presses').text(totalPresses);
        $('#total-expected-qty').text(this.format_number(totalExpectedQty));
        $('#total-records').text(totalRecords);

        $('#summary-cards').show();
    }

    export_to_excel() {
        if (this.data.length === 0) {
            frappe.msgprint('No data to export');
            return;
        }

        // Prepare data for export
        const exportData = this.data.map(row => ({
            'Item': row.item || '',
            'Press': row.press || '',
            'Mould': row.mould || '',
            'Date': row.date ? frappe.datetime.str_to_user(row.date) : '',
            'Shift Type': row.shift_type || '',
            'No. of Cavities': row.noof_cavities || 0,
            'Target Qty (Lifts)': row.target_qty || 0,
            'Expected Production Qty': row.expected_production_qty || 0,
            'Plan Types': row.plan_types_str || ''
        }));

        // Create filename with current timestamp
        const timestamp = frappe.datetime.now_datetime().replace(/[: ]/g, '_');
        const filename = `Shift_Quantity_Planned_Report_${timestamp}`;

        // Export to Excel
        frappe.tools.downloadify(exportData, null, filename);
        frappe.show_alert({
            message: 'Report exported successfully',
            indicator: 'green'
        });
    }

    format_number(value) {
        if (value === null || value === undefined || value === '') {
            return '0';
        }
        return parseFloat(value).toLocaleString('en-IN', {
            minimumFractionDigits: 0,
            maximumFractionDigits: 2
        });
    }

    show_loading() {
        $('#loading-indicator').show();
        $('#data-table').parent().hide();
        $('#summary-cards').hide();
    }

    hide_loading() {
        $('#loading-indicator').hide();
        $('#data-table').parent().show();
    }

    show_error(message) {
        $('#error-message').text(message).show();
    }

    hide_error() {
        $('#error-message').hide();
    }

    show_no_data() {
        $('#no-data-message').show();
        $('#summary-cards').hide();
    }

    hide_no_data() {
        $('#no-data-message').hide();
    }
}

// Make the class globally available for debugging
window.ShiftQuantityPlannedReport = ShiftQuantityPlannedReport;
