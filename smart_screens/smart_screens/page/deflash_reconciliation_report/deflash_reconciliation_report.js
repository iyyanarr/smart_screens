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
		this.add_export_button();
		this.make_filters();
		this.make_result_area();
		this.sort_column = null;
		this.sort_direction = 'asc';
	}

	add_export_button() {
		// Add Export to Excel button to the page header (title row)
		this.page.set_primary_action('Export to Excel', () => {
			this.export_to_excel();
		}, 'export');
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
					<div class="col-sm-12" style="text-align: right;">
						<button class="btn btn-primary btn-sm" id="get_report" style="margin-right: 5px;">Get Report</button>
						<button class="btn btn-default btn-sm" id="clear_filters">Clear Filters</button>
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

		// Render summary - Clean white background with colorful cards
		let summary_html = `
			<div style="background: #ffffff; padding: 20px; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.08); margin-bottom: 20px; border: 1px solid #e2e8f0;">
				<div style="display: flex; justify-content: space-around; gap: 15px; flex-wrap: nowrap; overflow-x: auto;">
					<div style="text-align: center; min-width: 140px; display: flex; flex-direction: column; align-items: center; background: #ffffff; padding: 15px; border-radius: 8px; box-shadow: 0 2px 8px rgba(102, 126, 234, 0.15); border-left: 4px solid #667eea;">
						<small style="color: #667eea; margin-bottom: 8px; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; height: 28px; display: flex; align-items: center; justify-content: center;">Total Sent (Kg)</small>
						<h4 style="margin: 0; font-size: 20px; font-weight: 700; color: #2d3748;">${total_sent_kg.toFixed(3)}</h4>
					</div>
					<div style="text-align: center; min-width: 140px; display: flex; flex-direction: column; align-items: center; background: #ffffff; padding: 15px; border-radius: 8px; box-shadow: 0 2px 8px rgba(72, 187, 120, 0.15); border-left: 4px solid #48bb78;">
						<small style="color: #48bb78; margin-bottom: 8px; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; height: 28px; display: flex; align-items: center; justify-content: center;">Total Received (Kg)</small>
						<h4 style="margin: 0; font-size: 20px; font-weight: 700; color: #2d3748;">${total_received_kg.toFixed(3)}</h4>
					</div>
					<div style="text-align: center; min-width: 140px; display: flex; flex-direction: column; align-items: center; background: #ffffff; padding: 15px; border-radius: 8px; box-shadow: 0 2px 8px rgba(66, 153, 225, 0.15); border-left: 4px solid #4299e1;">
						<small style="color: #4299e1; margin-bottom: 8px; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; height: 28px; display: flex; align-items: center; justify-content: center;">Total Sent (Nos)</small>
						<h4 style="margin: 0; font-size: 20px; font-weight: 700; color: #2d3748;">${total_sent_nos}</h4>
					</div>
					<div style="text-align: center; min-width: 140px; display: flex; flex-direction: column; align-items: center; background: #ffffff; padding: 15px; border-radius: 8px; box-shadow: 0 2px 8px rgba(56, 178, 172, 0.15); border-left: 4px solid #38b2ac;">
						<small style="color: #38b2ac; margin-bottom: 8px; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; height: 28px; display: flex; align-items: center; justify-content: center;">Total Received (Nos)</small>
						<h4 style="margin: 0; font-size: 20px; font-weight: 700; color: #2d3748;">${total_received_nos}</h4>
					</div>
					<div style="text-align: center; min-width: 140px; display: flex; flex-direction: column; align-items: center; background: #ffffff; padding: 15px; border-radius: 8px; box-shadow: 0 2px 8px rgba(237, 137, 54, 0.15); border-left: 4px solid #ed8936;">
						<small style="color: #ed8936; margin-bottom: 8px; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; height: 28px; display: flex; align-items: center; justify-content: center;">Expected Scrap (Kg)</small>
						<h4 style="margin: 0; font-size: 20px; font-weight: 700; color: #2d3748;">${total_scrap_expected.toFixed(3)}</h4>
					</div>
					<div style="text-align: center; min-width: 140px; display: flex; flex-direction: column; align-items: center; background: #ffffff; padding: 15px; border-radius: 8px; box-shadow: 0 2px 8px rgba(245, 101, 101, 0.15); border-left: 4px solid #f56565;">
						<small style="color: #f56565; margin-bottom: 8px; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; height: 28px; display: flex; align-items: center; justify-content: center;">Actual Scrap (Kg)</small>
						<h4 style="margin: 0; font-size: 20px; font-weight: 700; color: #2d3748;">${total_scrap_actual.toFixed(3)}</h4>
					</div>
				</div>
			</div>
		`;
		this.result_area.find('.report-summary').html(summary_html);

		// Render table with clean white styling and sortable headers
		let table_html = `
			<div class="table-responsive" style="border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.08); border: 1px solid #e2e8f0;">
				<table class="table table-bordered table-hover" style="font-size: 12px; margin-bottom: 0; background: #ffffff;">
					<thead>
						<tr style="background: #ffffff; border-bottom: 2px solid #e2e8f0;">
							<th rowspan="2" class="sortable-header" data-column="item" style="color: #2d3748; font-weight: 600; border: 1px solid #e2e8f0; padding: 12px; vertical-align: middle; cursor: pointer; user-select: none;">
								Item <i class="fa fa-sort" style="color: #cbd5e0; margin-left: 5px;"></i>
							</th>
							<th rowspan="2" class="sortable-header" data-column="lot_no" style="color: #2d3748; font-weight: 600; border: 1px solid #e2e8f0; padding: 12px; vertical-align: middle; cursor: pointer; user-select: none;">
								Lot No <i class="fa fa-sort" style="color: #cbd5e0; margin-left: 5px;"></i>
							</th>
							<th rowspan="2" class="sortable-header" data-column="date_sent" style="color: #2d3748; font-weight: 600; border: 1px solid #e2e8f0; padding: 12px; vertical-align: middle; cursor: pointer; user-select: none;">
								Date Sent <i class="fa fa-sort" style="color: #cbd5e0; margin-left: 5px;"></i>
							</th>
							<th rowspan="2" class="sortable-header" data-column="date_received" style="color: #2d3748; font-weight: 600; border: 1px solid #e2e8f0; padding: 12px; vertical-align: middle; cursor: pointer; user-select: none;">
								Date Received <i class="fa fa-sort" style="color: #cbd5e0; margin-left: 5px;"></i>
							</th>
							<th rowspan="2" class="sortable-header" data-column="deflash_person" style="color: #2d3748; font-weight: 600; border: 1px solid #e2e8f0; padding: 12px; vertical-align: middle; cursor: pointer; user-select: none;">
								Deflash Person <i class="fa fa-sort" style="color: #cbd5e0; margin-left: 5px;"></i>
							</th>
							<th rowspan="2" class="sortable-header" data-column="receiving_person" style="color: #2d3748; font-weight: 600; border: 1px solid #e2e8f0; padding: 12px; vertical-align: middle; cursor: pointer; user-select: none;">
								Receiving Person <i class="fa fa-sort" style="color: #cbd5e0; margin-left: 5px;"></i>
							</th>
							<th colspan="2" style="color: #667eea; font-weight: 600; border: 1px solid #e2e8f0; padding: 12px; text-align: center; background: #ffffff;">Qty Sent</th>
							<th colspan="2" style="color: #48bb78; font-weight: 600; border: 1px solid #e2e8f0; padding: 12px; text-align: center; background: #ffffff;">Qty Received</th>
							<th colspan="2" style="color: #ed8936; font-weight: 600; border: 1px solid #e2e8f0; padding: 12px; text-align: center; background: #ffffff;">Difference</th>
							<th colspan="4" style="color: #f56565; font-weight: 600; border: 1px solid #e2e8f0; padding: 12px; text-align: center; background: #ffffff;">Scrap</th>
						</tr>
						<tr style="background: #fafbfc;">
							<th style="color: #667eea; font-weight: 600; border: 1px solid #e2e8f0; padding: 10px; font-size: 11px;">Kg</th>
							<th style="color: #667eea; font-weight: 600; border: 1px solid #e2e8f0; padding: 10px; font-size: 11px;">Nos</th>
							<th style="color: #48bb78; font-weight: 600; border: 1px solid #e2e8f0; padding: 10px; font-size: 11px;">Kg</th>
							<th style="color: #48bb78; font-weight: 600; border: 1px solid #e2e8f0; padding: 10px; font-size: 11px;">Nos</th>
							<th style="color: #ed8936; font-weight: 600; border: 1px solid #e2e8f0; padding: 10px; font-size: 11px;">Nos</th>
							<th style="color: #ed8936; font-weight: 600; border: 1px solid #e2e8f0; padding: 10px; font-size: 11px;">%</th>
							<th style="color: #f56565; font-weight: 600; border: 1px solid #e2e8f0; padding: 10px; font-size: 11px;">Expected</th>
							<th style="color: #f56565; font-weight: 600; border: 1px solid #e2e8f0; padding: 10px; font-size: 11px;">Actual</th>
							<th style="color: #f56565; font-weight: 600; border: 1px solid #e2e8f0; padding: 10px; font-size: 11px;">Diff Kg</th>
							<th style="color: #f56565; font-weight: 600; border: 1px solid #e2e8f0; padding: 10px; font-size: 11px;">Diff %</th>
						</tr>
					</thead>
					<tbody>
		`;

		this.data.forEach((row, index) => {
			let diff_class = row.difference_nos < 0 ? 'text-danger' : (row.difference_nos > 0 ? 'text-success' : '');
			let scrap_diff_class = row.scrap_difference_kg > 0 ? 'text-danger' : (row.scrap_difference_kg < 0 ? 'text-success' : '');
			let row_bg = index % 2 === 0 ? '#ffffff' : '#fafbfc';
			
			table_html += `
				<tr style="background: ${row_bg}; transition: all 0.2s;" onmouseover="this.style.background='#f0f4f8'" onmouseout="this.style.background='${row_bg}'">
					<td style="padding: 10px; border: 1px solid #e2e8f0; font-weight: 500; color: #2d3748;">${row.item || ''}</td>
					<td style="padding: 10px; border: 1px solid #e2e8f0;"><a href="/app/deflashing-receipt-entry/${row.lot_no}" target="_blank" style="color: #667eea; text-decoration: none; font-weight: 500;">${row.lot_no || ''}</a></td>
					<td style="padding: 10px; border: 1px solid #e2e8f0; color: #4a5568;">${row.date_sent ? frappe.datetime.str_to_user(row.date_sent) : ''}</td>
					<td style="padding: 10px; border: 1px solid #e2e8f0; color: #4a5568;">${row.date_received ? frappe.datetime.str_to_user(row.date_received) : '<span class="text-muted" style="font-style: italic;">Pending</span>'}</td>
					<td style="padding: 10px; border: 1px solid #e2e8f0; color: #4a5568;">${row.deflash_person || ''}</td>
					<td style="padding: 10px; border: 1px solid #e2e8f0; color: #4a5568;">${row.receiving_person || ''}</td>
					<td style="padding: 10px; border: 1px solid #e2e8f0; text-align: right; color: #667eea; font-weight: 500;">${flt(row.qty_sent_kg, 3)}</td>
					<td style="padding: 10px; border: 1px solid #e2e8f0; text-align: right; color: #667eea; font-weight: 500;">${flt(row.qty_sent_nos, 0)}</td>
					<td style="padding: 10px; border: 1px solid #e2e8f0; text-align: right; color: #48bb78; font-weight: 500;">${flt(row.qty_received_kg, 3)}</td>
					<td style="padding: 10px; border: 1px solid #e2e8f0; text-align: right; color: #48bb78; font-weight: 500;">${flt(row.qty_received_nos, 0)}</td>
					<td class="${diff_class}" style="padding: 10px; border: 1px solid #e2e8f0; text-align: right; font-weight: 600;">${flt(row.difference_nos, 0)}</td>
					<td class="${diff_class}" style="padding: 10px; border: 1px solid #e2e8f0; text-align: right; font-weight: 600;">${flt(row.difference_percent, 2)}%</td>
					<td style="padding: 10px; border: 1px solid #e2e8f0; text-align: right; color: #ed8936; font-weight: 500;">${flt(row.scrap_expected_kg, 3)}</td>
					<td style="padding: 10px; border: 1px solid #e2e8f0; text-align: right; color: #f56565; font-weight: 500;">${flt(row.scrap_actual_kg, 3)}</td>
					<td class="${scrap_diff_class}" style="padding: 10px; border: 1px solid #e2e8f0; text-align: right; font-weight: 600;">${flt(row.scrap_difference_kg, 3)}</td>
					<td class="${scrap_diff_class}" style="padding: 10px; border: 1px solid #e2e8f0; text-align: right; font-weight: 600;">${flt(row.scrap_difference_percent, 2)}%</td>
				</tr>
			`;
		});

		table_html += `
					</tbody>
				</table>
			</div>
		`;

		this.result_area.find('.report-table').html(table_html);
		
		// Bind sort event handlers
		$('.sortable-header').off('click').on('click', function() {
			me.sort_table($(this).data('column'));
		});
	}

	sort_table(column) {
		// Toggle sort direction if clicking the same column
		if (this.sort_column === column) {
			this.sort_direction = this.sort_direction === 'asc' ? 'desc' : 'asc';
		} else {
			this.sort_column = column;
			this.sort_direction = 'asc';
		}

		// Sort the data
		this.data.sort((a, b) => {
			let val_a = a[column];
			let val_b = b[column];

			// Handle null/undefined values
			if (!val_a && !val_b) return 0;
			if (!val_a) return 1;
			if (!val_b) return -1;

			// Date comparison
			if (column === 'date_sent' || column === 'date_received') {
				val_a = new Date(val_a);
				val_b = new Date(val_b);
			}

			// String comparison (case-insensitive)
			if (typeof val_a === 'string') {
				val_a = val_a.toLowerCase();
				val_b = val_b.toLowerCase();
			}

			let comparison = 0;
			if (val_a > val_b) {
				comparison = 1;
			} else if (val_a < val_b) {
				comparison = -1;
			}

			return this.sort_direction === 'asc' ? comparison : -comparison;
		});

		// Re-render the table
		this.render_report();

		// Update sort icons
		$('.sortable-header i').removeClass('fa-sort-up fa-sort-down').addClass('fa-sort').css('color', '#cbd5e0');
		$(`.sortable-header[data-column="${this.sort_column}"] i`)
			.removeClass('fa-sort')
			.addClass(this.sort_direction === 'asc' ? 'fa-sort-up' : 'fa-sort-down')
			.css('color', '#2d3748');
	}

	clear_filters() {
		$('#item').val('');
		$('#deflash_vendor').val('');
		let today = frappe.datetime.get_today();
		let last_month = frappe.datetime.add_days(today, -30);
		$('#from_date').val(last_month);
		$('#to_date').val(today);
		this.result_area.find('.report-table').html('');
		this.result_area.find('..report-summary').html('');
	}

	export_to_excel() {
		if (!this.data || this.data.length === 0) {
			frappe.msgprint(__('No data to export'));
			return;
		}

		frappe.tools.downloadify(this.data, null, this);
	}
}
