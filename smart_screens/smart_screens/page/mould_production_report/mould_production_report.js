frappe.pages['mould-production-report'].on_page_load = function(wrapper) {
	var page = frappe.ui.make_app_page({
		parent: wrapper,
		title: 'Mould Production Report',
		single_column: true
	});
	
	// Initialize page
	new MouldProductionReport(page);
}

class MouldProductionReport {
	constructor(page) {
		this.page = page;
		this.make_form();
		this.add_filters();
		
		// Set default date filters
		const today = frappe.datetime.get_today();
		const last_month = frappe.datetime.add_months(today, -1);
		
		this.filters.from_date.set_value(last_month);
		this.filters.to_date.set_value(today);
		
		this.make_report();
		
		// Load ChartJS if not already loaded
		if (typeof Chart === 'undefined') {
			$.getScript('/assets/frappe/node_modules/chart.js/dist/chart.min.js', () => {
				console.log('ChartJS loaded');
			});
		}
	}
	
	make_form() {
		this.form = new frappe.ui.FieldGroup({
			fields: [
				{
					fieldtype: 'Section Break',
					label: 'Filters'
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
					label: 'Mould Reference',
					fieldtype: 'Data',
					fieldname: 'mould_ref',
					placeholder: 'Filter by mould reference...'
				},
				{
					fieldtype: 'Column Break'
				},
				{
					label: 'SPP Reference',
					fieldtype: 'Data',
					fieldname: 'spp_ref',
					placeholder: 'Filter by SPP reference...'
				},
				{
					fieldtype: 'Column Break'
				},
				{
					label: 'Mould Status',
					fieldtype: 'Select',
					fieldname: 'mould_status',
					options: '\nACTIVE\nINACTIVE',
					placeholder: 'Select mould status...'
				},
				{
					fieldtype: 'Section Break'
				},
				{
					label: 'Hide Entries Without Production',
					fieldtype: 'Check',
					fieldname: 'no_entries_without_production',
					default: 0
				},
				{
					fieldtype: 'Column Break'
				},
				{
					label: 'View Mode',
					fieldtype: 'Select',
					fieldname: 'view_mode',
					options: 'Monthly Spreadsheet\nDetailed Report',
					default: 'Monthly Spreadsheet',
					onchange: () => this.make_report()
				}
			],
			body: this.page.body
		});
		
		this.form.make();
		this.filters = this.form.fields_dict;
	}
	
	add_filters() {
		this.page.add_inner_button(__('Refresh'), () => this.make_report());
		this.page.add_inner_button(__('Export'), () => this.export_report());
		
		// Add event listeners to filters
		this.filters.from_date.$input.on('change', () => this.make_report());
		this.filters.to_date.$input.on('change', () => this.make_report());
		this.filters.mould_ref.$input.on('change', () => this.make_report());
		this.filters.spp_ref.$input.on('change', () => this.make_report());
		this.filters.mould_status.$input.on('change', () => this.make_report());
		this.filters.no_entries_without_production.$input.on('change', () => this.make_report());
	}
	
	make_report() {
		const filters = {
			from_date: this.filters.from_date.get_value(),
			to_date: this.filters.to_date.get_value(),
			mould_ref: this.filters.mould_ref.get_value(),
			spp_ref: this.filters.spp_ref.get_value(),
			mould_status: this.filters.mould_status.get_value(),
			no_entries_without_production: this.filters.no_entries_without_production.get_value()
		};
		
		// Clear any previous report
		this.page.main.find('.report-container').remove();
		
		// Add container for the report
		this.$report_container = $('<div class="report-container">').appendTo(this.page.main);
		this.$report_container.html(`<div class="text-muted">Loading report...</div>`);
		
		frappe.call({
			method: 'smart_screens.smart_screens.page.mould_production_report.mould_production_report.get_mould_production_data',
			args: {
				filters: filters
			},
			callback: (r) => {
				if (r.message) {
					if (r.message.error) {
						this.$report_container.html(`<div class="text-danger">Error: ${r.message.error}</div>`);
						return;
					}
					
					// Store the data for reference in charts
					this.last_report_data = r.message;
					
					const viewMode = this.filters.view_mode.get_value() || 'Monthly Spreadsheet';
					
					if (viewMode === 'Monthly Spreadsheet') {
						this.render_spreadsheet_view(r.message);
					} else {
						this.render_detailed_report(r.message);
					}
				}
			}
		});
	}
	
	render_spreadsheet_view(data) {
		let me = this;
		let month_columns = data.month_columns;
		let current_year = new Date().getFullYear();
		
		// Add debug logging
		console.log("Month columns received:", month_columns);
		console.log("Data received:", data);
		
		// Filter columns to only show current year
		let current_year_months = month_columns.filter(m => m.year == current_year);
		console.log("Current year months:", current_year_months);
		
		let $spreadsheet_view = me.$report_container;
		$spreadsheet_view.empty();
		
		$spreadsheet_view.append(`<h4>Mould Production Data</h4>`);
		
		// Create spreadsheet table
		let $table = $(`<table class="spreadsheet-table"></table>`);
		
		// Create header row
		let $header_row = $(`<tr></tr>`);
		$header_row.append(`<th style="position: sticky; left: 0; z-index: 11;">Mould Ref</th>`);
		$header_row.append(`<th>SPP Ref</th>`);
		$header_row.append(`<th>Historical</th>`); // Add Historical column
		
		// Add month columns for current year only
		current_year_months.forEach(month => {
			$header_row.append(`<th>${month.label} ${month.year}</th>`);
		});
		
		$header_row.append(`<th class="year-total">Total ${current_year}</th>`);
		$header_row.append(`<th class="grand-total">Grand Total</th>`);
		
		$table.append($header_row);
		
		// Create data rows
		let grand_total_lifts = 0;
		let monthly_totals = {};
		let historical_total = 0;
		let current_year_total = 0;
		
		// Initialize monthly totals
		current_year_months.forEach(month => {
			monthly_totals[month.key] = 0;
		});
		
		// Check if data is structured correctly and use the appropriate property
		const moulds = data.moulds || data.data || [];
		console.log("Moulds data to process:", moulds);
		
		moulds.forEach(mould => {
			let $row = $(`<tr class="mould-row ${mould.is_active ? 'active-mould' : 'inactive-mould'}" data-mould="${mould.name}"></tr>`);
			
			// Fixed columns
			$row.append(`<td style="position: sticky; left: 0; background-color: ${mould.is_active ? 'inherit' : '#feebc8'}; z-index: 1;">${mould.mould_ref || mould.name}</td>`);
			$row.append(`<td>${mould.spp_ref || ''}</td>`);
			
			// Historical data column
			let historical_lifts = mould.historical_data ? mould.historical_data.total_lifts : 0;
			historical_total += historical_lifts;
			$row.append(`<td class="historical-cell">${historical_lifts > 0 ? historical_lifts.toLocaleString() : '-'}</td>`);
			
			// Add debug
			console.log(`Mould ${mould.mould_ref || mould.name} monthly data:`, mould.monthly_data);
			
			// Current year total
			let year_total = 0;
			
			// Month columns
			current_year_months.forEach(month => {
				let month_key = month.key;
				console.log(`Checking month key ${month_key} for mould ${mould.mould_ref || mould.name}`);
				
				let month_data = mould.monthly_data ? mould.monthly_data[month_key] : null;
				let lifts = month_data ? month_data.total_lifts : 0;
				
				console.log(`Month ${month_key}: ${lifts} lifts`);
				
				if (lifts > 0) {
					$row.append(`<td class="has-data">${lifts.toLocaleString()}</td>`);
					monthly_totals[month_key] += lifts;
					year_total += lifts;
				} else {
					$row.append(`<td class="no-data">-</td>`);
				}
			});
			
			// Current year total
			current_year_total += year_total;
			$row.append(`<td class="year-total">${year_total > 0 ? year_total.toLocaleString() : '-'}</td>`);
			
			// Grand total (historical + current year)
			let grand_total = historical_lifts + year_total;
			grand_total_lifts += grand_total;
			$row.append(`<td class="grand-total">${grand_total > 0 ? grand_total.toLocaleString() : '-'}</td>`);
			
			$table.append($row);
			
			// Add details row (hidden by default)
			let $details_row = $(`<tr class="details-row hidden" data-mould="${mould.name}"></tr>`);
			let colspan = current_year_months.length + 5; // +5 for mould ref, spp ref, historical, year total, and grand total
			
			$details_row.append(`
				<td colspan="${colspan}">
					<div class="production-entries">
						<h5>Production Details for ${mould.mould_ref || mould.name}</h5>
						<div class="row">
							<div class="col-md-3">
								<div class="metric-card bg-light-blue">
									<div class="metric-icon"><i class="fa fa-cogs"></i></div>
									<div class="metric-content">
										<div class="metric-value">${mould.entry_count || 0}</div>
										<div class="metric-label">Total Entries</div>
									</div>
								</div>
							</div>
							<div class="col-md-3">
								<div class="metric-card bg-light-green">
									<div class="metric-icon"><i class="fa fa-cubes"></i></div>
									<div class="metric-content">
										<div class="metric-value">${mould.total_lifts ? mould.total_lifts.toLocaleString() : 0}</div>
										<div class="metric-label">Total Lifts</div>
									</div>
								</div>
							</div>
							<div class="col-md-3">
								<div class="metric-card bg-light-purple">
									<div class="metric-icon"><i class="fa fa-calculator"></i></div>
									<div class="metric-content">
										<div class="metric-value">${mould.avg_lifts_per_entry || 0}</div>
										<div class="metric-label">Avg Lifts/Entry</div>
									</div>
								</div>
							</div>
							<div class="col-md-3">
								<div class="metric-card bg-light-orange">
									<div class="metric-icon"><i class="fa fa-percent"></i></div>
									<div class="metric-content">
										<div class="metric-value">${mould.cavity_utilization || 0}%</div>
										<div class="metric-label">Cavity Utilization</div>
									</div>
								</div>
							</div>
						</div>
						<div class="row" style="margin-top: 15px;">
							<div class="col-md-6">
								<div class="chart-section">
									<h5>Monthly Distribution</h5>
									<div class="chart-container">
										<canvas id="monthly-chart-${mould.name}"></canvas>
									</div>
								</div>
							</div>
							<div class="col-md-6">
								<div class="cavity-utilization">
									<h5>Additional Information</h5>
									<div class="table-responsive">
										<table class="table table-sm">
											<tbody>
												<tr>
													<td>Mould Type</td>
													<td>${mould.mould_type || '-'}</td>
												</tr>
												<tr>
													<td>No. of Cavities</td>
													<td>${mould.noof_cavities || '-'}</td>
												</tr>
												<tr>
													<td>Estimated Cycle Time</td>
													<td>${mould.cycle_time || '-'} seconds</td>
												</tr>
												<tr>
													<td>Status</td>
													<td>${mould.is_active ? 'Active' : 'Inactive'}</td>
												</tr>
												<tr>
													<td>Historical Lifts</td>
													<td>${historical_lifts.toLocaleString() || '0'}</td>
												</tr>
												<tr>
													<td>${current_year} Lifts</td>
													<td>${year_total.toLocaleString() || '0'}</td>
												</tr>
											</tbody>
										</table>
									</div>
								</div>
							</div>
						</div>
					</div>
				</td>
			`);
			
			$table.append($details_row);
		});
		
		// Add totals row
		let $totals_row = $(`<tr class="totals-row"></tr>`);
		$totals_row.append(`<td style="position: sticky; left: 0; background-color: #4a5568; z-index: 1;">Totals</td>`);
		$totals_row.append(`<td></td>`);
		
		// Historical total
		$totals_row.append(`<td>${historical_total.toLocaleString()}</td>`);
		
		// Monthly totals
		current_year_months.forEach(month => {
			let total = monthly_totals[month.key];
			$totals_row.append(`<td>${total > 0 ? total.toLocaleString() : '-'}</td>`);
		});
		
		// Current year total
		$totals_row.append(`<td class="year-total-sum">${current_year_total.toLocaleString()}</td>`);
		
		// Grand total
		$totals_row.append(`<td class="grand-total">${grand_total_lifts.toLocaleString()}</td>`);
		
		$table.append($totals_row);
		$spreadsheet_view.append($table);
		
		// Attach event listeners
		$('.mould-row').on('click', function() {
			let mould_id = $(this).data('mould');
			let $details_row = $(`.details-row[data-mould="${mould_id}"]`);
			
			// Hide all other detail rows
			$('.details-row').not($details_row).addClass('hidden');
			
			// Toggle this detail row
			$details_row.toggleClass('hidden');
			
			// Render charts if visible
			if (!$details_row.hasClass('hidden')) {
				me.render_mould_details_charts(mould_id);
			}
		});
	}
	
	render_detailed_report(data) {
		if (!data.data || data.data.length === 0) {
			this.$report_container.html(`<div class="text-muted">No data found. ${data.message || ''}</div>`);
			return;
		}
		
		// Create top metrics cards
		let top_metrics_html = this.render_top_metrics(data);
		
		// Create monthly trend chart
		let monthly_chart_html = this.render_monthly_chart_section(data.monthly_data);
		
		// Create top performers section
		let top_performers_html = this.render_top_performers(data.top_performers);
		
		// Create the main report table
		let main_table_html = this.render_main_table(data.data);
		
		// Combine all sections
		let html = `
			<div class="mould-production-report">
				${top_metrics_html}
				<div class="row mt-4">
					<div class="col-md-8">
						${monthly_chart_html}
					</div>
					<div class="col-md-4">
						${top_performers_html}
					</div>
				</div>
				${main_table_html}
			</div>
		`;
		
		this.$report_container.html(html);
		this.apply_styles();
		this.bind_events();
		
		// Generate charts
		this.create_monthly_chart(data.monthly_data);
		this.create_utilization_chart(data.data);
	}
	
	render_top_metrics(data) {
		let total_entries = data.total_entries || 0;
		let total_lifts = data.total_lifts || 0;
		let total_moulds = data.total_moulds || 0;
		
		// Calculate efficiency metrics
		let avg_lifts_per_entry = 0;
		if (total_entries > 0) {
			avg_lifts_per_entry = Math.round((total_lifts / total_entries) * 100) / 100;
		}
		
		return `
			<div class="report-overview">
				<div class="row">
					<div class="col-md-3">
						<div class="metric-card bg-light-blue">
							<div class="metric-icon"><i class="fa fa-cubes"></i></div>
							<div class="metric-content">
								<div class="metric-value">${total_moulds}</div>
								<div class="metric-label">Total Moulds</div>
							</div>
						</div>
					</div>
					<div class="col-md-3">
						<div class="metric-card bg-light-green">
							<div class="metric-icon"><i class="fa fa-calendar-check"></i></div>
							<div class="metric-content">
								<div class="metric-value">${total_entries}</div>
								<div class="metric-label">Total Production Entries</div>
							</div>
						</div>
					</div>
					<div class="col-md-3">
						<div class="metric-card bg-light-purple">
							<div class="metric-icon"><i class="fa fa-tachometer-alt"></i></div>
							<div class="metric-content">
								<div class="metric-value">${total_lifts}</div>
								<div class="metric-label">Total Lifts</div>
							</div>
						</div>
					</div>
					<div class="col-md-3">
						<div class="metric-card bg-light-orange">
							<div class="metric-icon"><i class="fa fa-bolt"></i></div>
							<div class="metric-content">
								<div class="metric-value">${avg_lifts_per_entry}</div>
								<div class="metric-label">Avg Lifts per Entry</div>
							</div>
						</div>
					</div>
				</div>
			</div>
		`;
	}
	
	export_report() {
		// Get the current filter values
		const filters = {
			from_date: this.filters.from_date.get_value(),
			to_date: this.filters.to_date.get_value(),
			mould_ref: this.filters.mould_ref.get_value(),
			spp_ref: this.filters.spp_ref.get_value(),
			mould_status: this.filters.mould_status.get_value(),
			no_entries_without_production: this.filters.no_entries_without_production.get_value()
		};
		
		// Generate a formatted date string for the filename
		const date_str = frappe.datetime.get_today().replace(/-/g, '');
		
		frappe.call({
			method: 'smart_screens.smart_screens.page.mould_production_report.mould_production_report.get_mould_production_data',
			args: {
				filters: filters
			},
			callback: (r) => {
				if (r.message) {
					// Use either moulds or data property, depending on what's available
					const mouldsData = r.message.moulds || r.message.data || [];
					
					if (mouldsData.length === 0) {
						frappe.msgprint(__("No data to export"));
						return;
					}
					
					const viewMode = this.filters.view_mode.get_value() || 'Monthly Spreadsheet';
					
					// Prepare data for export
					let rows = [];
					
					if (viewMode === 'Monthly Spreadsheet') {
						// Add headers for spreadsheet view with months
						let headers = [
							'Mould Reference',
							'SPP Reference',
							'Status',
							'No. of Cavities'
						];
						
						// Add month columns
						const month_columns = r.message.month_columns || [];
						month_columns.forEach(month => {
							headers.push(`${month.label} ${month.year}`);
						});
						
						headers.push('Total Lifts');
						rows.push(headers);
						
						// Add data rows
						mouldsData.forEach(mould => {
							let row = [
								mould.mould_ref || mould.name || '',
								mould.spp_ref || '',
								mould.mould_status || '',
								mould.noof_cavities || 0
							];
							
							// Add monthly data
							let monthlyTotal = 0;
							month_columns.forEach(month => {
								const monthData = (mould.monthly_data && mould.monthly_data[month.key]) || { total_lifts: 0 };
								const lifts = monthData.total_lifts || 0;
								monthlyTotal += lifts;
								row.push(lifts);
							});
							
							// Add total
							row.push(monthlyTotal);
							rows.push(row);
						});
					} else {
						// Default detailed report export
						// Add headers
						rows.push([
							'Mould Reference',
							'SPP Reference',
							'Compound Code',
							'Status',
							'No. of Cavities',
							'Total Entries',
							'Total Lifts',
							'Avg Lifts/Entry',
							'Lifts/Hour',
							'Cavity Utilization (%)'
						]);
						
						// Add data rows
						mouldsData.forEach(item => {
							rows.push([
								item.mould_ref || '',
								item.spp_ref || '',
								item.compound_code || '',
								item.mould_status || '',
								item.noof_cavities || 0,
								item.entry_count || 0,
								item.total_lifts || 0,
								item.avg_lifts_per_entry || 0,
								item.lifts_per_hour || 0,
								item.cavity_utilization || 0
							]);
						});
					}
					
					// Download the CSV
					frappe.tools.downloadify(rows, null, `Mould_Production_Report_${date_str}`);
				}
			}
		});
	}
	
	apply_styles() {
		// Add custom styles for the report
		$("<style>")
			.prop("type", "text/css")
			.html(`
				.mould-production-report {
					margin-top: 20px;
				}
				.report-overview {
					margin-bottom: 20px;
				}
				.mould-row {
					cursor: pointer;
					transition: background-color 0.2s;
				}
				.mould-row:hover {
					background-color: #f5f5f5 !important;
				}
				.details-row.hidden {
					display: none;
				}
				.production-entries {
					padding: 15px;
					background-color: #f5f7fa;
					border-radius: 4px;
				}
				.production-entries h5 {
					margin-top: 0;
					margin-bottom: 10px;
				}
				.metric-card {
					display: flex;
					padding: 20px;
					border-radius: 8px;
					box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
					margin-bottom: 15px;
					transition: transform 0.3s ease;
				}
				.metric-card:hover {
					transform: translateY(-5px);
				}
				.metric-icon {
					font-size: 24px;
					margin-right: 15px;
					display: flex;
					align-items: center;
					justify-content: center;
				}
				.metric-content {
					flex: 1;
				}
				.metric-value {
					font-size: 24px;
					font-weight: bold;
					line-height: 1.2;
				}
				.metric-label {
					font-size: 14px;
					color: #6c757d;
				}
				.chart-section {
					background-color: #fff;
					border-radius: 8px;
					padding: 15px;
					box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
				}
				.chart-container {
					position: relative;
					height: 250px;
				}
				.top-performers, .cavity-utilization {
					background-color: #fff;
					border-radius: 8px;
					padding: 15px;
					box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
				}
				.main-table {
					background-color: #fff;
					border-radius: 8px;
					padding: 15px;
					box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
				}
				/* Custom background colors */
				.bg-light-blue {
					background-color: #e3f2fd;
					color: #0d47a1;
				}
				.bg-light-green {
					background-color: #e8f5e9;
					color: #2e7d32;
				}
				.bg-light-purple {
					background-color: #f3e5f5;
					color: #7b1fa2;
				}
				.bg-light-orange {
					background-color: #fff3e0;
					color: #e65100;
				}
				.bg-light-red {
					background-color: #ffebee;
					color: #c62828;
				}
				/* Spreadsheet view styles - Improved colors */
				.spreadsheet-table {
					border-collapse: collapse;
					width: 100%;
					font-size: 13px;
					box-shadow: 0 2px 8px rgba(0,0,0,0.1);
					border-radius: 8px;
					overflow: hidden;
				}
				.spreadsheet-table th {
					background-color: #4a5568;
					color: white;
					position: sticky;
					top: 0;
					z-index: 10;
					font-weight: 500;
					padding: 12px 8px;
					text-transform: uppercase;
					font-size: 12px;
					letter-spacing: 0.5px;
				}
				.spreadsheet-table td {
					padding: 10px 8px;
					text-align: center;
					border: none;
					border-bottom: 1px solid #e2e8f0;
				}
				.spreadsheet-table tr:nth-child(even) {
					background-color: #f8fafc;
				}
				.spreadsheet-table tr:hover {
					background-color: #edf2f7;
				}
				.spreadsheet-table .has-data {
					background-color: #c6f6d5;
					color: #22543d;
					font-weight: 500;
				}
				.spreadsheet-table .no-data {
					color: #a0aec0;
				}
				.spreadsheet-table .totals-row {
					background-color: #4a5568;
					color: white;
					font-weight: 500;
				}
				.spreadsheet-table .totals-row td {
					border-bottom: none;
					padding: 12px 8px;
				}
				/* Historical column styling */
				.historical-cell {
					background-color: #f0f4f8;
					color: #334155;
					font-weight: 500;
					border-right: 2px solid #cbd5e1;
				}
				.spreadsheet-table .year-total {
					background-color: #48bb78;
					color: white;
					font-weight: 600;
				}
				.spreadsheet-table .year-total-sum {
					background-color: #48bb78;
					color: white;
					font-weight: 600;
				}
				.spreadsheet-table .grand-total {
					background-color: #5a67d8;
					color: white;
					font-weight: 600;
				}
				.active-mould {
					/* No special styling for active moulds */
				}
				.inactive-mould {
					background-color: #feebc8;
					color: #744210;
				}
				.inactive-mould td {
					color: #744210;
				}
				.spreadsheet-view {
					background-color: #fff;
					border-radius: 8px;
					padding: 20px;
					box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
					overflow-x: auto;
				}
				.spreadsheet-view h4 {
					margin-top: 0;
					margin-bottom: 20px;
					color: #2d3748;
					font-weight: 600;
					font-size: 18px;
					border-bottom: 2px solid #e2e8f0;
					padding-bottom: 10px;
				}
				/* Current year styling */
				.current-year {
					background-color: #d1e7dd;
					color: #0f5132;
				}
			`)
			.appendTo("head");
	}

	render_mould_details_charts(mould_id) {
		// Find the mould data
		let mould = this.last_report_data.data.find(m => m.name === mould_id);
		if (!mould) return;
		
		// Get the canvas
		let canvas = document.getElementById(`monthly-chart-${mould_id}`);
		if (!canvas) return;
		
		// Get monthly data
		let months = [];
		let lifts = [];
		
		// Sort the keys to ensure chronological order
		let sortedKeys = Object.keys(mould.monthly_data || {}).sort();
		
		sortedKeys.forEach(month_key => {
			let month_data = mould.monthly_data[month_key];
			let monthLabel = month_key.split('-')[1]; // Get the month part (MM)
			
			// Convert numeric month to short name
			let monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
			let monthIndex = parseInt(monthLabel) - 1;
			let monthName = monthNames[monthIndex];
			
			months.push(monthName);
			lifts.push(month_data.total_lifts);
		});
		
		// Create chart
		if (this.mouldCharts && this.mouldCharts[mould_id]) {
			this.mouldCharts[mould_id].destroy();
		}
		
		if (!this.mouldCharts) {
			this.mouldCharts = {};
		}
		
		this.mouldCharts[mould_id] = new Chart(canvas, {
			type: 'bar',
			data: {
				labels: months,
				datasets: [{
					label: 'Lifts',
					data: lifts,
					backgroundColor: '#48bb78',
					borderColor: '#2f855a',
					borderWidth: 1
				}]
			},
			options: {
				responsive: true,
				maintainAspectRatio: false,
				scales: {
					y: {
						beginAtZero: true
					}
				}
			}
		});
	}
	
	render_monthly_chart_section(monthly_data) {
		if (!monthly_data) return '';
		
		return `
			<div class="chart-section">
				<h5>Monthly Production Trend</h5>
				<div class="chart-container">
					<canvas id="monthly-trend-chart"></canvas>
				</div>
			</div>
		`;
	}
	
	render_top_performers(top_performers) {
		if (!top_performers || top_performers.length === 0) {
			return `
				<div class="top-performers">
					<h5>Top Performing Moulds</h5>
					<div class="text-muted">No production data available.</div>
				</div>
			`;
		}
		
		let performers_html = '';
		
		top_performers.forEach((performer, index) => {
			performers_html += `
				<div class="performer" style="display: flex; margin-bottom: 15px; align-items: center;">
					<div class="performer-rank" style="width: 30px; height: 30px; border-radius: 50%; background-color: #4299e1; color: white; display: flex; align-items: center; justify-content: center; margin-right: 10px; font-weight: bold;">${index + 1}</div>
					<div class="performer-info" style="flex-grow: 1;">
						<div style="font-weight: 500;">${performer.mould_ref}</div>
						<div class="text-muted" style="font-size: 12px;">${performer.spp_ref || ''}</div>
					</div>
					<div class="performer-value" style="font-weight: bold; font-size: 18px; color: #2b6cb0;">
						${performer.total_lifts.toLocaleString()}
					</div>
				</div>
			`;
		});
		
		return `
			<div class="top-performers">
				<h5>Top Performing Moulds</h5>
				${performers_html}
			</div>
		`;
	}
	
	render_main_table(data) {
		if (!data || data.length === 0) return '';
		
		let rows_html = '';
		
		data.forEach(mould => {
			rows_html += `
				<tr>
					<td>${mould.mould_ref || mould.name}</td>
					<td>${mould.spp_ref || ''}</td>
					<td>${mould.mould_status || ''}</td>
					<td>${mould.noof_cavities || 0}</td>
					<td>${mould.entry_count || 0}</td>
					<td>${mould.total_lifts ? mould.total_lifts.toLocaleString() : 0}</td>
					<td>${mould.avg_lifts_per_entry || 0}</td>
					<td>${mould.lifts_per_hour || 0}</td>
					<td>${mould.cavity_utilization || 0}%</td>
				</tr>
			`;
		});
		
		return `
			<div class="main-table mt-4">
				<h5>Detailed Mould Production Data</h5>
				<div class="table-responsive">
					<table class="table table-striped">
						<thead>
							<tr>
								<th>Mould Ref</th>
								<th>SPP Ref</th>
								<th>Status</th>
								<th>Cavities</th>
								<th>Entries</th>
								<th>Total Lifts</th>
								<th>Avg Lifts/Entry</th>
								<th>Lifts/Hour</th>
								<th>Cavity Util.</th>
							</tr>
						</thead>
						<tbody>
							${rows_html}
						</tbody>
					</table>
				</div>
			</div>
		`;
	}
	
	bind_events() {
		// Add event binding for the detailed report
		// Currently no events needed for detailed view
	}
	
	create_monthly_chart(monthly_data) {
		if (!monthly_data) return;
		
		const canvas = document.getElementById('monthly-trend-chart');
		if (!canvas) return;
		
		const months = [];
		const entries = [];
		const lifts = [];
		
		// Get monthly data in correct order
		const sortedKeys = Object.keys(monthly_data).sort();
		
		sortedKeys.forEach(month_key => {
			const data = monthly_data[month_key];
			const monthLabel = month_key.split('-')[1]; // Get month part (MM)
			
			// Convert numeric month to short name
			const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
			const monthIndex = parseInt(monthLabel) - 1;
			const monthName = monthNames[monthIndex];
			
			months.push(monthName);
			entries.push(data.entry_count);
			lifts.push(data.total_lifts);
		});
		
		// Destroy previous chart if exists
		if (this.monthlyChart) {
			this.monthlyChart.destroy();
		}
		
		this.monthlyChart = new Chart(canvas, {
			type: 'bar',
			data: {
				labels: months,
				datasets: [
					{
						label: 'Total Lifts',
						data: lifts,
						backgroundColor: '#48bb78',
						borderColor: '#2f855a',
						borderWidth: 1,
						yAxisID: 'y'
					},
					{
						label: 'Production Entries',
						data: entries,
						backgroundColor: '#4299e1',
						borderColor: '#2b6cb0',
						borderWidth: 1,
						type: 'line',
						yAxisID: 'y1'
					}
				]
			},
			options: {
				responsive: true,
				maintainAspectRatio: false,
				scales: {
					y: {
						beginAtZero: true,
						title: {
							display: true,
							text: 'Total Lifts'
						}
					},
					y1: {
						position: 'right',
						beginAtZero: true,
						grid: {
							drawOnChartArea: false
						},
						title: {
							display: true,
							text: 'Production Entries'
						}
					}
				}
			}
		});
	}
	
	create_utilization_chart(data) {
		if (!data || data.length === 0) return;
		
		// This chart is optional and can be implemented if needed for utilization visualization
	}
}