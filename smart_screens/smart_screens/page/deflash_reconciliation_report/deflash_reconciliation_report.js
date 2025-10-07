frappe.pages['deflash-reconciliation-report'].on_page_load = function(wrapper) {
	var page = frappe.ui.make_app_page({
parent: wrapper,
title: 'Deflash Reconciliation Report',
single_column: true
});

	frappe.deflash_reconciliation_report = new DeflashReconciliationReport(page);
}

class DeflashReconciliationReport {
	constructor(page) {
		this.page = page;
		this.parent = $(this.page.body);
		this.page.main.addClass('frappe-card');
		this.make_filters();
		this.make_result_area();
	}

	make_filters() {
		let me = this;
		
		// Add filter section
		this.filter_section = $(`
			<div class="filter-section" style="padding: 15px; margin-bottom: 15px; background: #f9f9f9; border-radius: 5px;">
				<div class="row">
					<div class="col-sm-3">
						<div class="form-group">
							<label>From Date</label>
							<input type="date" class="form-control" id="from_date">
						</div>
					</div>
					<div class="col-sm-3">
						<div class="form-group">
							<label>To Date</label>
							<input type="date" class="form-control" id="to_date">
						</div>
					</div>
					<div class="col-sm-3">
						<div class="form-group">
							<label>Item</label>
							<input type="text" class="form-control" id="item" placeholder="Item Code">
						</div>
					</div>
					<div class="col-sm-3">
						<div class="form-group">
							<label>Deflash Vendor</label>
							<input type="text" class="form-control" id="deflash_vendor" placeholder="Vendor Code">
						</div>
					</div>
				</div>
				<div class="row">
					<div class="col-sm-12">
						<button class="btn btn-primary btn-sm" id="get_report">Get Report</button>
						<button class="btn btn-default btn-sm" id="clear_filters">Clear Filters</button>
						<button class="btn btn-success btn-sm" id="export_excel" style="float: right;">Export to Excel</button>
					</div>
				</div>
			</div>
		`).appendTo(this.parent);

		// Set default dates (last 30 days)
		let today = frappe.datetime.get_today();
		let last_month = frappe.datetime.add_days(today, -30);
		$('#from_date').val(last_month);
		$('#to_date').val(today);

		// Bind events
		$('#get_report').click(() => this.fetch_data());
		$('#clear_filters').click(() => this.clear_filters());
		$('#export_excel').click(() => this.export_to_excel());
	}

	make_result_area() {
		this.result_area = $(`
			<div class="result-area">
				<div class="report-summary" style="margin-bottom: 15px;"></div>
				<div class="report-table"></div>
			</div>
		`).appendTo(this.parent);
	}

	fetch_data() {
		let me = this;
		let filters = {
			from_date: $('#from_date').val(),
			to_date: $('#to_date').val(),
			item: $('#item').val(),
			deflash_vendor: $('#deflash_vendor').val()
		};

		// Show loading animation
		me.show_loading();

		frappe.call({
			method: 'smart_screens.smart_screens.page.deflash_reconciliation_report.deflash_reconciliation_report.get_deflash_reconciliation_data',
			args: filters,
			callback: function(r) {
				// Hide loading animation
				me.hide_loading();
				
				if (r.message && r.message.status === 'success') {
					me.data = r.message.data;
					me.render_report();
				} else {
					frappe.msgprint(__('Error fetching data: ' + (r.message.message || 'Unknown error')));
				}
			},
			error: function() {
				// Hide loading animation on error
				me.hide_loading();
				frappe.msgprint(__('An error occurred while fetching the report data.'));
			}
		});
	}

	show_loading() {
		this.result_area.find('.report-summary').html('');
		this.result_area.find('.report-table').html(`
			<div class="text-center" style="padding: 60px;">
				<div class="spinner-border text-primary" role="status" style="width: 3rem; height: 3rem;">
					<span class="sr-only">Loading...</span>
				</div>
				<p class="text-muted" style="margin-top: 20px; font-size: 14px;">Loading report data...</p>
			</div>
		`);
	}

	hide_loading() {
		// Loading will be replaced by actual content in render_report()
		// or cleared in case of error
	}

	render_report() {
		let me = this;
		
		if (!this.data || this.data.length === 0) {
			this.result_area.find('.report-table').html('<p class="text-muted text-center" style="padding: 40px;">No data found for the selected filters.</p>');
			this.result_area.find('.report-summary').html('');
			return;
		}

		// Calculate summary
		let total_sent_kg = 0, total_received_kg = 0;
		let total_sent_nos = 0, total_received_nos = 0;
		let total_scrap_expected = 0, total_scrap_actual = 0;

		this.data.forEach(row => {
			total_sent_kg += flt(row.qty_sent_kg);
			total_received_kg += flt(row.qty_received_kg);
			total_sent_nos += flt(row.qty_sent_nos);
			total_received_nos += flt(row.qty_received_nos);
			total_scrap_expected += flt(row.scrap_expected_kg);
			total_scrap_actual += flt(row.scrap_actual_kg);
		});

		// Render summary - all in one line
		let summary_html = `
			<div class="row" style="background: #fff; padding: 15px; border-radius: 5px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); display: flex; flex-wrap: nowrap;">
				<div class="col-sm-2" style="text-align: center; padding: 0 10px;">
					<small class="text-muted" style="display: block; margin-bottom: 5px;">Total Sent (Kg)</small>
					<h4 style="margin: 0; font-size: 18px;">${total_sent_kg.toFixed(3)}</h4>
				</div>
				<div class="col-sm-2" style="text-align: center; padding: 0 10px;">
					<small class="text-muted" style="display: block; margin-bottom: 5px;">Total Received (Kg)</small>
					<h4 style="margin: 0; font-size: 18px;">${total_received_kg.toFixed(3)}</h4>
				</div>
				<div class="col-sm-2" style="text-align: center; padding: 0 10px;">
					<small class="text-muted" style="display: block; margin-bottom: 5px;">Total Sent (Nos)</small>
					<h4 style="margin: 0; font-size: 18px;">${total_sent_nos}</h4>
				</div>
				<div class="col-sm-2" style="text-align: center; padding: 0 10px;">
					<small class="text-muted" style="display: block; margin-bottom: 5px;">Total Received (Nos)</small>
					<h4 style="margin: 0; font-size: 18px;">${total_received_nos}</h4>
				</div>
				<div class="col-sm-2" style="text-align: center; padding: 0 10px;">
					<small class="text-muted" style="display: block; margin-bottom: 5px;">Expected Scrap (Kg)</small>
					<h4 style="margin: 0; font-size: 18px;">${total_scrap_expected.toFixed(3)}</h4>
				</div>
				<div class="col-sm-2" style="text-align: center; padding: 0 10px;">
					<small class="text-muted" style="display: block; margin-bottom: 5px;">Actual Scrap (Kg)</small>
					<h4 style="margin: 0; font-size: 18px;">${total_scrap_actual.toFixed(3)}</h4>
				</div>
			</div>
		`;
		this.result_area.find('.report-summary').html(summary_html);

		// Render table
		let table_html = `
			<div class="table-responsive">
				<table class="table table-bordered table-hover" style="font-size: 12px;">
					<thead style="background: #f5f7fa;">
						<tr>
							<th rowspan="2">Item</th>
							<th rowspan="2">Lot No</th>
							<th rowspan="2">Date Sent</th>
							<th rowspan="2">Date Received</th>
							<th rowspan="2">Deflash Person</th>
							<th rowspan="2">Receiving Person</th>
							<th colspan="2" class="text-center">Qty Sent</th>
							<th colspan="2" class="text-center">Qty Received</th>
							<th colspan="2" class="text-center">Difference</th>
							<th colspan="4" class="text-center">Scrap</th>
						</tr>
						<tr>
							<th>Kg</th>
							<th>Nos</th>
							<th>Kg</th>
							<th>Nos</th>
							<th>Nos</th>
							<th>%</th>
							<th>Expected</th>
							<th>Actual</th>
							<th>Diff Kg</th>
							<th>Diff %</th>
						</tr>
					</thead>
					<tbody>
		`;

		this.data.forEach(row => {
			let diff_class = row.difference_nos < 0 ? 'text-danger' : (row.difference_nos > 0 ? 'text-success' : '');
			let scrap_diff_class = row.scrap_difference_kg > 0 ? 'text-danger' : (row.scrap_difference_kg < 0 ? 'text-success' : '');
			
			table_html += `
				<tr>
					<td>${row.item || ''}</td>
					<td><a href="/app/deflashing-receipt-entry/${row.lot_no}" target="_blank">${row.lot_no || ''}</a></td>
					<td>${frappe.datetime.str_to_user(row.date_sent) || ''}</td>
					<td>${row.date_received ? frappe.datetime.str_to_user(row.date_received) : '<span class="text-muted">Pending</span>'}</td>
					<td>${row.deflash_person || ''}</td>
					<td>${row.receiving_person || ''}</td>
					<td class="text-right">${flt(row.qty_sent_kg, 3)}</td>
					<td class="text-right">${flt(row.qty_sent_nos, 0)}</td>
					<td class="text-right">${flt(row.qty_received_kg, 3)}</td>
					<td class="text-right">${flt(row.qty_received_nos, 0)}</td>
					<td class="text-right ${diff_class}"><strong>${flt(row.difference_nos, 0)}</strong></td>
					<td class="text-right ${diff_class}"><strong>${flt(row.difference_percent, 2)}%</strong></td>
					<td class="text-right">${flt(row.scrap_expected_kg, 3)}</td>
					<td class="text-right">${flt(row.scrap_actual_kg, 3)}</td>
					<td class="text-right ${scrap_diff_class}"><strong>${flt(row.scrap_difference_kg, 3)}</strong></td>
					<td class="text-right ${scrap_diff_class}"><strong>${flt(row.scrap_difference_percent, 2)}%</strong></td>
				</tr>
			`;
		});

		table_html += `
					</tbody>
				</table>
			</div>
		`;

		this.result_area.find('.report-table').html(table_html);
	}

	clear_filters() {
		$('#item').val('');
		$('#deflash_vendor').val('');
		let today = frappe.datetime.get_today();
		let last_month = frappe.datetime.add_days(today, -30);
		$('#from_date').val(last_month);
		$('#to_date').val(today);
		this.result_area.find('.report-table').html('');
		this.result_area.find('.report-summary').html('');
	}

	export_to_excel() {
		if (!this.data || this.data.length === 0) {
			frappe.msgprint(__('No data to export'));
			return;
		}

		frappe.tools.downloadify(this.data, null, this);
	}
}
