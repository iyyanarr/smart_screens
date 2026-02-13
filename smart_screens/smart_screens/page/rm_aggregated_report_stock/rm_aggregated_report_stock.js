frappe.pages['rm-aggregated-report-stock'].on_page_load = function (wrapper) {
    var page = frappe.ui.make_app_page({
        parent: wrapper,
        title: 'Raw Material Aggregated Stock Report',
        single_column: true
    });

    new RMAggregatedStockReport(page);
}

class RMAggregatedStockReport {
    constructor(page) {
        this.page = page;
        this.make_filters();
        this.add_buttons();
        this.show_empty_state();
    }

    make_filters() {
        this.filters = new frappe.ui.FieldGroup({
            fields: [
                {
                    fieldtype: 'Section Break',
                    label: 'Filters'
                },
                {
                    label: 'Company',
                    fieldtype: 'Link',
                    fieldname: 'company',
                    options: 'Company',
                    default: frappe.defaults.get_user_default('Company'),
                    reqd: 1
                },
                {
                    fieldtype: 'Column Break'
                },
                {
                    label: 'From Date',
                    fieldtype: 'Date',
                    fieldname: 'from_date',
                    reqd: 1,
                    default: frappe.datetime.add_months(frappe.datetime.get_today(), -1)
                },
                {
                    fieldtype: 'Column Break'
                },
                {
                    label: 'To Date',
                    fieldtype: 'Date',
                    fieldname: 'to_date',
                    reqd: 1,
                    default: frappe.datetime.get_today()
                },
                {
                    fieldtype: 'Column Break'
                },
                {
                    label: 'Item Group',
                    fieldtype: 'Link',
                    fieldname: 'item_group',
                    options: 'Item Group'
                },
                {
                    fieldtype: 'Section Break'
                }
            ],
            body: this.page.body
        });

        this.filters.make();
    }

    add_buttons() {
        this.page.set_primary_action(__('Generate Report'), () => this.load_report(), 'octicon octicon-sync');

        // Add Export to Excel button
        this.page.add_inner_button(__('Export to Excel'), () => this.export_to_excel(), __('Export'));

        // Add button to manage excluded batches
        this.page.add_inner_button(__('Manage Excluded Batches'), () => {
            frappe.set_route('List', 'Excluded Stock Batch');
        }, __('Tools'));
    }

    load_report() {
        const filter_values = {
            company: this.filters.get_value('company'),
            from_date: this.filters.get_value('from_date'),
            to_date: this.filters.get_value('to_date'),
            item_group: this.filters.get_value('item_group')
        };

        this.current_filters = filter_values;
        this.show_loading_with_progress();

        frappe.realtime.on('rm_aggregated_progress', (data) => {
            this.update_progress(data);
        });

        frappe.call({
            method: 'smart_screens.smart_screens.page.rm_aggregated_report_stock.rm_aggregated_report_stock.get_rm_batch_balance_data',
            args: { filters: filter_values },
            callback: (r) => {
                frappe.realtime.off('rm_aggregated_progress');

                if (r.message && r.message.success) {
                    this.render_report(r.message);
                } else {
                    const error = r.message?.error || 'Failed to load report data';
                    frappe.msgprint({
                        title: __('Error'),
                        indicator: 'red',
                        message: error
                    });
                    this.show_empty_state(error);
                }
            },
            error: (err) => {
                frappe.realtime.off('rm_aggregated_progress');
                frappe.msgprint(__('An error occurred while loading the report'));
                this.show_empty_state('An error occurred');
            }
        });
    }

    render_report(response) {
        const data = response.data || [];
        const grand_total = response.grand_total || {};

        if (!data || data.length === 0) {
            this.show_empty_state('No data found for the selected filters');
            return;
        }

        this.report_data = data;
        this.grand_total = grand_total;
        this.grand_total_original = JSON.parse(JSON.stringify(grand_total));
        this.raw_filtered_data = response.raw_filtered_data || [];
        this.filtered_data = [...data];
        this.current_sort = { column: 'item_code', order: 'asc' };
        this.current_warehouse = '';

        let html = `
			<div class="spp-aggregated-container">
				<div class="report-info">
					<div class="report-stats">
						<span><strong>Total Items:</strong> <span id="total-items">${response.aggregated_records || 0}</span></span>
						<span class="ml-3"><strong>Source Records:</strong> ${response.total_records || 0}</span>
						<span class="ml-3"><strong>Warehouses:</strong> ${response.warehouse_count || 0}</span>
					</div>
					<div class="report-filters-section">
						<div class="warehouse-filter-wrapper">
							<label for="warehouse-filter" class="filter-label">Warehouse:</label>
							<select class="form-control warehouse-filter" id="warehouse-filter">
								<option value="">All Warehouses</option>
								${this.render_warehouse_options(response.warehouses_used || [])}
							</select>
						</div>
						<div class="search-box">
							<i class="fa fa-search search-icon"></i>
							<input type="text" 
								class="form-control item-code-search" 
								placeholder="Search by Item Code/Name..." 
								id="item-code-filter">
							<button class="btn btn-xs btn-secondary clear-search" style="display: none;">
								<i class="fa fa-times"></i>
							</button>
						</div>
						<span class="search-results" id="search-results">Showing: ${data.length} items</span>
					</div>
				</div>
				<div class="table-responsive">
					<table class="table table-bordered aggregated-table" id="rm-data-table">
						<thead>
							<tr>
								<th class="sortable-header" data-column="item_code">Item Code <i class="fa fa-sort"></i></th>
								<th class="sortable-header" data-column="item_name">Item Name <i class="fa fa-sort"></i></th>
								<th class="sortable-header" data-column="opening_qty">Opening <i class="fa fa-sort"></i></th>
								<th class="sortable-header" data-column="in_qty">In <i class="fa fa-sort"></i></th>
								<th class="sortable-header" data-column="out_qty">Out <i class="fa fa-sort"></i></th>
								<th class="sortable-header" data-column="balance_qty">Balance <i class="fa fa-sort"></i></th>
								<th class="action-header">Actions</th>
							</tr>
						</thead>
						<tbody id="table-body">
						</tbody>
					</table>
				</div>
			</div>
		`;

        this.page.main.find('.report-container').remove();
        this.$container = $('<div class="report-container">').appendTo(this.page.main);
        this.$container.html(html);

        this.apply_styles();
        this.render_table_rows(this.filtered_data);
        this.bind_search_and_sort();
    }

    render_table_rows(data) {
        const $tbody = $('#table-body');
        $tbody.empty();

        data.forEach(row => {
            const rowHtml = `
				<tr data-item-code="${row.item_code}">
					<td><strong>${row.item_code}</strong></td>
					<td>${row.item_name || ''}</td>
					<td class="qty-cell">${this.format_number(row.opening_qty)}</td>
					<td class="qty-cell in-qty">${this.format_number(row.in_qty)}</td>
					<td class="qty-cell out-qty">${this.format_number(row.out_qty)}</td>
					<td class="qty-cell balance-qty"><strong>${this.format_number(row.balance_qty)}</strong></td>
					<td class="action-cell">
						<button class="btn btn-xs btn-primary btn-batches" data-item-code="${row.item_code}">
							<i class="fa fa-list"></i> Batches
						</button>
					</td>
				</tr>`;
            $tbody.append(rowHtml);
        });

        // Grand Total
        const grandTotalHtml = `
			<tr class="grand-total-row">
				<td colspan="2"><strong>Grand Total</strong></td>
				<td class="qty-cell"><strong>${this.format_number(this.grand_total.opening_qty)}</strong></td>
				<td class="qty-cell"><strong>${this.format_number(this.grand_total.in_qty)}</strong></td>
				<td class="qty-cell"><strong>${this.format_number(this.grand_total.out_qty)}</strong></td>
				<td class="qty-cell"><strong>${this.format_number(this.grand_total.balance_qty)}</strong></td>
				<td></td>
			</tr>`;
        $tbody.append(grandTotalHtml);

        this.bind_batch_buttons();
        $('#search-results').text(`Showing: ${data.length} items`);
        $('#total-items').text(data.length);
    }

    render_warehouse_options(warehouses) {
        const nonBins = warehouses.filter(wh => !wh.includes('Fchem Bin'));
        const hasBins = warehouses.some(wh => wh.includes('Fchem Bin'));

        let options = nonBins.map(wh =>
            `<option value="${wh}">${wh.replace(' - SPP INDIA', '')}</option>`
        ).join('');

        if (hasBins) {
            options += `<option value="GROUP:FCHEM_BINS">All Fchem Bins</option>`;
        }

        return options;
    }

    bind_search_and_sort() {
        const me = this;

        $('#warehouse-filter').on('change', function () {
            const selectedWarehouse = $(this).val();
            if (!selectedWarehouse) {
                me.filtered_data = [...me.report_data];
                me.grand_total = JSON.parse(JSON.stringify(me.grand_total_original));
                me.render_table_rows(me.filtered_data);
                return;
            }

            frappe.call({
                method: 'smart_screens.smart_screens.page.rm_aggregated_report_stock.rm_aggregated_report_stock.get_child_warehouses_api',
                args: { warehouse: selectedWarehouse },
                callback: (r) => {
                    if (r.message) {
                        const warehouses = r.message;
                        const filtered_raw = me.raw_filtered_data.filter(row => warehouses.includes(row.warehouse));

                        // Re-aggregate locally
                        const aggregated = {};
                        const grand_total = { opening_qty: 0, in_qty: 0, out_qty: 0, balance_qty: 0 };

                        filtered_raw.forEach(row => {
                            const key = row.item;
                            if (!aggregated[key]) {
                                aggregated[key] = {
                                    item_code: key, item_name: row.item_name, stock_uom: row.stock_uom, item_group: row.item_group,
                                    opening_qty: 0, in_qty: 0, out_qty: 0, balance_qty: 0
                                };
                            }
                            const bal = parseFloat(row.balance_qty) || 0;
                            aggregated[key].opening_qty += parseFloat(row.opening_qty) || 0;
                            aggregated[key].in_qty += parseFloat(row.in_qty) || 0;
                            aggregated[key].out_qty += parseFloat(row.out_qty) || 0;
                            aggregated[key].balance_qty += bal;

                            grand_total.opening_qty += parseFloat(row.opening_qty) || 0;
                            grand_total.in_qty += parseFloat(row.in_qty) || 0;
                            grand_total.out_qty += parseFloat(row.out_qty) || 0;
                            grand_total.balance_qty += bal;
                        });

                        me.filtered_data = Object.values(aggregated);
                        me.grand_total = grand_total;
                        me.render_table_rows(me.filtered_data);
                    }
                }
            });
        });

        $('#item-code-filter').on('input', function () {
            const text = $(this).val().toLowerCase().trim();
            if (!text) {
                $('.clear-search').hide();
                me.render_table_rows(me.filtered_data);
            } else {
                $('.clear-search').show();
                const searched = me.filtered_data.filter(row =>
                    row.item_code.toLowerCase().includes(text) ||
                    (row.item_name && row.item_name.toLowerCase().includes(text))
                );
                me.render_table_rows(searched);
            }
        });

        $('.clear-search').on('click', () => $('#item-code-filter').val('').trigger('input'));

        $('.sortable-header').on('click', function () {
            const column = $(this).data('column');
            let order = 'asc';
            if (me.current_sort.column === column && me.current_sort.order === 'asc') order = 'desc';
            me.current_sort = { column, order };

            me.filtered_data.sort((a, b) => {
                let aVal = a[column], bVal = b[column];
                if (typeof aVal === 'string') return order === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
                return order === 'asc' ? aVal - bVal : bVal - aVal;
            });
            me.render_table_rows(me.filtered_data);
        });
    }

    bind_batch_buttons() {
        const me = this;
        this.$container.find('.btn-batches').on('click', function () {
            const item_code = $(this).data('item-code');
            me.show_batch_details(item_code);
        });
    }

    show_batch_details(item_code) {
        frappe.call({
            method: 'smart_screens.smart_screens.page.rm_aggregated_report_stock.rm_aggregated_report_stock.get_batch_details_by_item_code',
            args: { item_code: item_code, filters: this.current_filters },
            callback: (r) => {
                if (r.message && r.message.success) this.render_batch_modal(r.message);
            }
        });
    }

    render_batch_modal(data) {
        const me = this;
        const dialog = new frappe.ui.Dialog({
            title: `Batch Details: ${data.item_code}`,
            size: 'extra-large',
            fields: [{ fieldtype: 'HTML', fieldname: 'batches_html' }]
        });

        let html = `
			<table class="table table-bordered table-condensed" style="font-size: 12px;">
				<thead>
					<tr>
						<th>Batch</th>
						<th>Warehouse</th>
						<th>Opening</th>
						<th>In</th>
						<th>Out</th>
						<th>Balance</th>
					</tr>
				</thead>
				<tbody>
					${data.batches.map(b => `
						<tr>
							<td>${b.batch || ''}</td>
							<td>${b.warehouse.replace(' - SPP INDIA', '')}</td>
							<td class="text-right">${me.format_number(b.opening_qty)}</td>
							<td class="text-right">${me.format_number(b.in_qty)}</td>
							<td class="text-right">${me.format_number(b.out_qty)}</td>
							<td class="text-right"><strong>${me.format_number(b.balance_qty)}</strong></td>
						</tr>
					`).join('')}
				</tbody>
			</table>
		`;
        dialog.fields_dict.batches_html.$wrapper.html(html);
        dialog.show();
    }

    format_number(v) {
        return frappe.format(v, { fieldtype: 'Float' });
    }

    format_currency(v) {
        return frappe.format(v, { fieldtype: 'Currency' });
    }

    export_to_excel() {
        const filters = {
            company: this.filters.get_value('company'),
            from_date: this.filters.get_value('from_date'),
            to_date: this.filters.get_value('to_date'),
            item_group: this.filters.get_value('item_group')
        };

        if (!this.filtered_data || this.filtered_data.length === 0) {
            frappe.msgprint(__('No data available to export. Please generate the report first.'));
            return;
        }

        frappe.show_alert({
            message: __('Preparing Excel export...'),
            indicator: 'blue'
        }, 3);

        frappe.call({
            method: 'smart_screens.smart_screens.page.rm_aggregated_report_stock.rm_aggregated_report_stock.export_to_excel',
            args: {
                filters: filters,
                warehouse: $('#warehouse-filter').val() || '',
                data: this.filtered_data,
                grand_total: this.grand_total
            },
            callback: (r) => {
                if (r.message && r.message.success) {
                    window.open(r.message.file_url, '_blank');
                    frappe.show_alert({
                        message: __('Excel file generated successfully!'),
                        indicator: 'green'
                    }, 5);
                } else {
                    frappe.msgprint(r.message?.error || 'Export failed');
                }
            }
        });
    }

    show_loading_with_progress() {
        this.page.main.find('.report-container').html(`
			<div class="text-center p-5">
				<div class="spinner-border text-primary" role="status"></div>
				<div class="mt-3" id="progress-msg">Loading report data...</div>
				<div class="progress mt-2" style="max-width: 400px; margin: 0 auto;">
					<div id="progress-bar" class="progress-bar progress-bar-striped progress-bar-animated" style="width: 0%"></div>
				</div>
			</div>
		`);
    }

    update_progress(data) {
        if (data.percent) $('#progress-bar').css('width', data.percent + '%');
        if (data.message) $('#progress-msg').text(data.message);
    }

    show_empty_state(msg = 'No data found') {
        this.page.main.find('.report-container').remove();
        $('<div class="report-container">').appendTo(this.page.main).html(`<div class="text-center p-5 text-muted">${msg}</div>`);
    }

    apply_styles() {
        const style = `
			<style>
				.report-info { display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 15px; flex-wrap: wrap; }
				.report-filters-section { display: flex; gap: 15px; align-items: flex-end; }
				.qty-cell { text-align: right; }
				.in-qty { color: #28a745; }
				.out-qty { color: #dc3545; }
				.valuation-cell { color: #007bff; background-color: #f8f9fa; }
				.grand-total-row { background-color: #f8f9fa; font-weight: bold; border-top: 2px solid #dee2e6; }
				.sortable-header { cursor: pointer; user-select: none; }
				.sortable-header:hover { background-color: #f1f1f1; }
			</style>
		`;
        if (!$('#rm-report-styles').length) $('head').append(`<div id="rm-report-styles">${style}</div>`);
    }
}
