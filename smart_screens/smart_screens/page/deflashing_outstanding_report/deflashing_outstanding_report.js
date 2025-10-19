frappe.pages['deflashing-outstanding-report'].on_page_load = function(wrapper) {
	var page = frappe.ui.make_app_page({
		parent: wrapper,
		title: 'Deflashing Outstanding Report',
		single_column: true
	});

	frappe.deflashing_outstanding_report = new DeflashingOutstandingReport(page);
}

class DeflashingOutstandingReport {
	constructor(page) {
		this.page = page;
		this.parent = $(this.page.body);
		this.page.main.addClass('frappe-card');
		this.add_export_button();
		this.make_filters();
		this.make_result_area();
		this.sort_column = null;
		this.sort_direction = 'asc';
		this.view_mode = 'compact_matrix'; // compact_matrix, datatable, list, chart
		this.current_view_data = []; // Store current view data for sorting
	}

	add_export_button() {
		// Add Export to Excel button
		this.page.set_primary_action('Export to Excel', () => {
			this.export_to_excel();
		}, 'export');
	}

	make_filters() {
		let me = this;
		
		// Compact filter section with Frappe styling
		this.filter_section = $(`
			<div class="filter-section frappe-card" style="padding: 15px; margin-bottom: 15px; border: 1px solid #d1d8dd;">
				<div class="row">
					<div class="col-sm-2">
						<div class="form-group">
							<label class="control-label" style="font-size: 12px; color: #6c7b84;">As Of Date</label>
							<input type="date" class="form-control form-control-sm" id="as_of_date">
						</div>
					</div>
					<div class="col-sm-2">
						<div class="form-group">
							<label class="control-label" style="font-size: 12px; color: #6c7b84;">Vendor Search</label>
							<input type="text" class="form-control form-control-sm" id="vendor_search" placeholder="Search vendors...">
						</div>
					</div>
					<div class="col-sm-2">
						<div class="form-group">
							<label class="control-label" style="font-size: 12px; color: #6c7b84;">Item Search</label>
							<input type="text" class="form-control form-control-sm" id="item_search" placeholder="Search items...">
						</div>
					</div>
					<div class="col-sm-2">
						<div class="form-group">
							<label class="control-label" style="font-size: 12px; color: #6c7b84;">Min Outstanding Days</label>
							<input type="number" class="form-control form-control-sm" id="min_outstanding_days" placeholder="0" step="1" min="0">
						</div>
					</div>
				</div>
				<div class="row">
					<div class="col-sm-8">
						<button class="btn btn-primary btn-sm" id="get_report" style="margin-right: 10px;">
							<i class="fa fa-search"></i> Generate Report
						</button>
						<button class="btn btn-default btn-sm" id="clear_filters">
							<i class="fa fa-eraser"></i> Clear
						</button>
					</div>
					<div class="col-sm-4 text-right">
						<div class="btn-group btn-group-sm" role="group" style="display: flex; flex-wrap: wrap; gap: 2px;">
							<button type="button" class="btn btn-outline-dark view-toggle active" data-view="compact_matrix" title="Matrix View">
								<i class="fa fa-th"></i> Matrix
							</button>
							<button type="button" class="btn btn-outline-dark view-toggle" data-view="datatable" title="Data Table View">
								<i class="fa fa-table"></i> Table
							</button>
							<button type="button" class="btn btn-outline-dark view-toggle" data-view="list" title="List View">
								<i class="fa fa-list"></i> List
							</button>
							<button type="button" class="btn btn-outline-dark view-toggle" data-view="chart" title="Analytics Charts">
								<i class="fa fa-chart-bar"></i> Charts
							</button>
							<button type="button" class="btn btn-outline-dark view-toggle" data-view="lot_number_outstanding" title="Lot Numbers Outstanding">
								<i class="fa fa-cube"></i> Lots
							</button>
						</div>
					</div>
				</div>
			</div>
		`).appendTo(this.parent);

		 // Set max date to today after the element is created
		let today = frappe.datetime.get_today();
		$('#as_of_date').attr('max', today);

		// Bind events
		$('#get_report').click(() => this.fetch_data());
		$('#clear_filters').click(() => this.clear_filters());
		$('#vendor_search, #item_search').on('input', () => this.apply_search_filters());

		 // Add date validation on change
		$('#as_of_date').on('change', function() {
			let selected_date = $(this).val();
			let today = frappe.datetime.get_today();
			
			if (selected_date > today) {
				frappe.msgprint(__('Future dates are not allowed. Please select dates up to today only.'));
				$(this).val(today);
			}
		});

		// View toggle events
		$('.view-toggle').click(function() {
			$('.view-toggle').removeClass('active btn-dark').addClass('btn-outline-dark');
			$(this).removeClass('btn-outline-dark').addClass('btn-dark active');
			me.view_mode = $(this).data('view');
			me.render_report();
		});

		// Set default date to today
		this.set_default_date();
	}

	set_default_date() {
		let today = frappe.datetime.get_today();
		$('#as_of_date').val(today);
	}

	make_result_area() {
		this.result_area = $(`
			<div class="result-area">
				<div class="report-summary" style="margin-bottom: 15px;"></div>
				<div class="report-content"></div>
			</div>
		`).appendTo(this.parent);
	}

	fetch_data() {
		let as_of_date = $('#as_of_date').val();
		let min_outstanding_days = parseInt($('#min_outstanding_days').val()) || 0;
		
		if (!as_of_date) {
			frappe.msgprint(__('Please select As Of Date'));
			return;
		}

		this.parent.find('.report-content').html('<div class="text-center" style="padding: 50px;"><i class="fa fa-spinner fa-spin fa-2x"></i><br><br>Loading...</div>');
		
		frappe.call({
			method: 'smart_screens.smart_screens.page.deflashing_outstanding_report.deflashing_outstanding_report.get_deflashing_outstanding_data',
			args: {
				as_of_date: as_of_date,
				min_outstanding_days: min_outstanding_days
			},
			callback: (r) => {
				if (r.message) {
					this.raw_data = r.message;
					this.filtered_data = [...this.raw_data];
					this.render_report();
				}
			}
		});
	}

	show_loading() {
		this.result_area.find('.report-summary').html('');
		this.result_area.find('.report-content').html(`
			<div class="text-center" style="padding: 40px;">
				<div class="spinner-border" role="status" style="width: 2rem; height: 2rem;">
					<span class="sr-only">Loading...</span>
				</div>
				<p class="text-muted" style="margin-top: 15px; font-size: 14px;">Loading deflashing data...</p>
			</div>
		`);
	}

	hide_loading() {
		// Loading will be replaced by actual content in render_report()
	}

	process_data() {
		// Process raw data into matrix format for vendors vs items
		this.matrix_data = {};
		this.vendor_totals = {};
		this.item_totals = {};
		this.days_pending_data = {}; // Add separate storage for days pending

		this.raw_data.forEach(row => {
			let vendor = row.vendor;
			let item = row.item;
			
			if (!this.matrix_data[vendor]) {
				this.matrix_data[vendor] = {};
				this.vendor_totals[vendor] = { kg: 0, nos: 0 };
				this.days_pending_data[vendor] = {}; // Initialize days pending for vendor
			}
			
			if (!this.matrix_data[vendor][item]) {
				this.matrix_data[vendor][item] = { kg: 0, nos: 0 };
			}
			
			if (!this.item_totals[item]) {
				this.item_totals[item] = { kg: 0, nos: 0 };
			}

			if (!this.days_pending_data[vendor][item]) {
				this.days_pending_data[vendor][item] = [];
			}

			// Add outstanding quantities
			this.matrix_data[vendor][item].kg += parseFloat(row.outstanding_qty || 0);
			this.matrix_data[vendor][item].nos += parseFloat(row.outstanding_nos || 0);
			
			this.vendor_totals[vendor].kg += parseFloat(row.outstanding_qty || 0);
			this.vendor_totals[vendor].nos += parseFloat(row.outstanding_nos || 0);
			
			this.item_totals[item].kg += parseFloat(row.outstanding_qty || 0);
			this.item_totals[item].nos += parseFloat(row.outstanding_nos || 0);

			// Store days pending data separately (don't sum these values)
			if (row.days_pending && parseFloat(row.outstanding_qty || 0) > 0) {
				this.days_pending_data[vendor][item].push(parseInt(row.days_pending));
			}
		});
	}

	render_report() {
		if (!this.raw_data || this.raw_data.length === 0) {
			this.result_area.find('.report-content').html(`
				<div class="text-center" style="padding: 40px;">
					<i class="fa fa-inbox" style="font-size: 48px; color: #d1d8dd; margin-bottom: 15px;"></i>
					<h5 style="color: #8d99a6;">No Outstanding Data Found</h5>
					<p class="text-muted">No deflashing outstanding records found for the selected filters.</p>
				</div>
			`);
			this.result_area.find('.report-summary').html('');
			return;
		}

		// Process data first before rendering anything
		this.process_data();
		
		// Then render summary and views
		this.render_summary();
		
		if (this.view_mode === 'compact_matrix') {
			this.render_compact_matrix_view();
		} else if (this.view_mode === 'datatable') {
			this.render_datatable_view();
		} else if (this.view_mode === 'chart') {
			this.render_chart_view();
		} else if (this.view_mode === 'lot_number_outstanding') {
			this.render_lot_number_outstanding();
		} else {
			this.render_list_view();
		}
	}

	render_summary() {
		// Safety check to ensure totals are initialized
		if (!this.vendor_totals || !this.item_totals) {
			this.result_area.find('.report-summary').html('');
			return;
		}

		let total_vendors = Object.keys(this.vendor_totals).length;
		let total_items = Object.keys(this.item_totals).length;
		let total_outstanding_kg = Object.values(this.vendor_totals).reduce((sum, v) => sum + v.kg, 0);
		let total_outstanding_nos = Object.values(this.vendor_totals).reduce((sum, v) => sum + v.nos, 0);

		// Make summary much more compact - inline badges instead of large cards
		let summary_html = `
			<div style="display: inline-flex; gap: 15px; padding: 8px 0; font-size: 12px; margin-bottom: 10px;">
				<span style="background: #2e3d49; color: white; padding: 4px 8px; border-radius: 3px; font-weight: 600;">
					${total_vendors} Vendors
				</span>
				<span style="background: #17a085; color: white; padding: 4px 8px; border-radius: 3px; font-weight: 600;">
					${total_items} Items
				</span>
				<span style="background: #d35400; color: white; padding: 4px 8px; border-radius: 3px; font-weight: 600;">
					${total_outstanding_kg.toFixed(2)} Kg Outstanding
				</span>
				<span style="background: #2980b9; color: white; padding: 4px 8px; border-radius: 3px; font-weight: 600;">
					${total_outstanding_nos} Nos Outstanding
				</span>
			</div>
		`;
		
		this.result_area.find('.report-summary').html(summary_html);
	}

	// Add color generation methods
	generateVendorColor(vendor, index) {
		// Generate unique colors for vendors using HSL
		const hue = (index * 137.5) % 360; // Golden angle for better distribution
		const saturation = 25 + (index % 3) * 10; // 25%, 35%, 45%
		const lightness = 90 + (index % 2) * 5; // 90%, 95%
		return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
	}

	generateItemBorderColor(item, index) {
		// Generate unique border colors for items
		const colors = [
			'#3498db', '#e74c3c', '#2ecc71', '#f39c12', '#9b59b6',
			'#1abc9c', '#34495e', '#e67e22', '#95a5a6', '#f1c40f',
			'#16a085', '#c0392b', '#27ae60', '#d35400', '#8e44ad',
			'#2c3e50', '#e8c547', '#bdc3c7', '#7f8c8d', '#a569bd'
		];
		return colors[index % colors.length];
	}

	render_compact_matrix_view() {
		let me = this;
		let vendors = Object.keys(this.vendor_totals).sort();
		let items = Object.keys(this.item_totals).sort();
		
		// Apply search filters
		let vendor_search = $('#vendor_search').val().toLowerCase();
		let item_search = $('#item_search').val().toLowerCase();
		
		if (vendor_search) {
			vendors = vendors.filter(v => v.toLowerCase().includes(vendor_search));
		}
		
		if (item_search) {
			items = items.filter(i => i.toLowerCase().includes(item_search));
		}

		let matrix_html = `
			<div style="border: 1px solid #d1d8dd; border-radius: 4px;">
				<div style="overflow-x: auto; max-height: 70vh;">
					<table style="margin: 0; font-size: 10px; white-space: nowrap; border-collapse: collapse; width: 100%;">
						<thead style="position: sticky; top: 0; z-index: 10; background: #2c3e50;">
							<tr>
								<th style="padding: 6px 8px; color: white; font-weight: 600; border: 1px solid #34495e; min-width: 120px; position: sticky; left: 0; background: #2c3e50; z-index: 11; font-size: 9px;">
									Vendor
								</th>
		`;

		// Add item headers with unique border colors
		items.forEach((item, itemIndex) => {
			const itemBorderColor = this.generateItemBorderColor(item, itemIndex);
			matrix_html += `
				<th style="padding: 4px 2px; color: white; font-weight: 600; border: 1px solid #34495e; border-bottom: 3px solid ${itemBorderColor}; text-align: center; width: 60px; writing-mode: vertical-lr; text-orientation: mixed; font-size: 8px; line-height: 1;">
					${item}
				</th>
			`;
		});

		matrix_html += `
				<th style="padding: 6px 8px; color: white; font-weight: 600; border: 1px solid #34495e; text-align: center; width: 80px; background: #1a252f; font-size: 9px;">
					Total
				</th>
			</tr>
		</thead>
		<tbody>
		`;

		// Add vendor rows with unique background colors
		vendors.forEach((vendor, vendorIndex) => {
			const vendorBgColor = this.generateVendorColor(vendor, vendorIndex);
			const vendorTextColor = '#2c3e50'; // Dark text for readability
			
			matrix_html += `
				<tr style="background: ${vendorBgColor}; height: 32px;">
					<td style="padding: 4px 8px; font-weight: 600; color: ${vendorTextColor}; border-right: 1px solid #d1d8dd; position: sticky; left: 0; background: ${vendorBgColor}; z-index: 5; font-size: 9px; max-width: 120px; overflow: hidden; text-overflow: ellipsis;">
						${vendor}
					</td>
			`;

			// Add item cells showing only "nos" quantities
			items.forEach((item, itemIndex) => {
				const itemBorderColor = this.generateItemBorderColor(item, itemIndex);
				let cell_data = this.matrix_data[vendor] && this.matrix_data[vendor][item] 
					? this.matrix_data[vendor][item] 
					: { kg: 0, nos: 0 };
				
				let nos_value = cell_data.nos;
				let has_outstanding = nos_value > 0;
				
				if (has_outstanding) {
					matrix_html += `
						<td style="padding: 2px 1px; text-align: center; border-bottom: 3px solid ${itemBorderColor}; background: ${vendorBgColor}; cursor: pointer; font-size: 10px; line-height: 1.1;" 
							title="Item: ${item}\nVendor: ${vendor}\nOutstanding: ${nos_value} Nos"
							onclick="frappe.deflashing_outstanding_report.drill_down('${vendor}', '${item}')">
							<div style="font-weight: 700; color: #2c3e50;">${nos_value}</div>
						</td>
					`;
				} else {
					// Empty cell with vendor background and item border
					matrix_html += `
						<td style="padding: 2px 1px; text-align: center; border-bottom: 3px solid ${itemBorderColor}; background: ${vendorBgColor}; color: #6c757d; font-size: 8px; opacity: 0.6;">
							
						</td>
					`;
				}
			});

			// Add total cell showing only nos total
			let vendor_total = this.vendor_totals[vendor];
			matrix_html += `
				<td style="padding: 4px 6px; text-align: center; font-weight: 700; background: ${vendorBgColor}; color: #2c3e50; border-left: 1px solid #34495e; font-size: 10px; line-height: 1.1;">
					<div style="color: #2c3e50; font-weight: 800;">${vendor_total.nos}</div>
				</td>
			</tr>
			`;
		});

		// Add totals row showing only nos totals
		matrix_html += `
			<tr style="background: #e9ecef; font-weight: 700; height: 28px;">
				<td style="padding: 4px 8px; color: #2c3e50; border-right: 1px solid #d1d8dd; position: sticky; left: 0; background: #e9ecef; z-index: 5; font-size: 9px;">
					Total
				</td>
		`;

		items.forEach((item, itemIndex) => {
			const itemBorderColor = this.generateItemBorderColor(item, itemIndex);
			let item_total = this.item_totals[item];
			matrix_html += `
				<td style="padding: 2px 1px; text-align: center; color: #2c3e50; border-bottom: 3px solid ${itemBorderColor}; font-size: 9px; line-height: 1.1;">
					<div style="color: #2c3e50; font-weight: 800;">${item_total.nos}</div>
				</td>
			`;
		});

		let grand_total_nos = Object.values(this.vendor_totals).reduce((sum, v) => sum + v.nos, 0);

		matrix_html += `
				<td style="padding: 4px 6px; text-align: center; background: #dee2e6; color: #2c3e50; border-left: 1px solid #34495e; font-size: 10px; line-height: 1.1;">
					<div style="color: #2c3e50; font-weight: 800;">${grand_total_nos}</div>
				</td>
			</tr>
		</tbody>
	</table>
</div>
</div>
		`;

		this.result_area.find('.report-content').html(matrix_html);
	}

	render_datatable_view() {
		let me = this;
		
		// Prepare data for Frappe DataTable
		let data = [];
		this.raw_data.forEach(row => {
			data.push([
				row.vendor,
				row.item,
				parseFloat(row.outstanding_kg || 0).toFixed(3),
				parseInt(row.outstanding_nos || 0),
				row.last_dispatch ? frappe.datetime.str_to_user(row.last_dispatch) : '-',
				row.days_pending || 0
			]);
		});

		let datatable_html = `
			<div class="frappe-card">
				<div id="deflashing-datatable" style="padding: 15px;"></div>
			</div>
			`;

		this.result_area.find('.report-content').html(datatable_html);

		// Initialize Frappe DataTable
		this.datatable = new frappe.DataTable('#deflashing-datatable', {
			columns: [
				{name: 'Vendor', width: 200},
				{name: 'Item', width: 120},
				{name: 'Outstanding (Kg)', width: 120, align: 'right'},
				{name: 'Outstanding (Nos)', width: 120, align: 'right'},
				{name: 'Last Dispatch', width: 120, align: 'center'},
				{name: 'Days Pending', width: 100, align: 'center'}
			],
			data: data,
			layout: 'fluid',
			noDataMessage: 'No outstanding data found',
			cellHeight: 35,
			dynamicRowHeight: true,
			checkboxColumn: false,
			serialNoColumn: true
		});
	}

	render_list_view() {
		if (!this.raw_data || this.raw_data.length === 0) {
			this.result_area.find('.report-content').html('<p class="text-center text-muted" style="padding: 40px;">No data found</p>');
			return;
		}

		// Sort data based on current sort settings
		let sorted_data = this.sort_data(this.raw_data, this.sort_column, this.sort_direction);

		let list_html = `
			<div class="frappe-card">
				<div class="table-responsive">
					<table class="table table-bordered table-hover sortable-table" style="font-size: 12px; margin-bottom: 0;">
						<thead style="background: #f8f9fa;">
							<tr>
								<th style="padding: 10px; font-weight: 600; color: #495057; cursor: pointer;" data-column="vendor" onclick="frappe.deflashing_outstanding_report.handle_sort('vendor')">
									Vendor ${this.get_sort_indicator('vendor')}
								</th>
								<th style="padding: 10px; font-weight: 600; color: #495057; cursor: pointer;" data-column="item" onclick="frappe.deflashing_outstanding_report.handle_sort('item')">
									Item ${this.get_sort_indicator('item')}
								</th>
								<th style="padding: 10px; font-weight: 600; color: #495057; cursor: pointer; text-align: right;" data-column="outstanding_kg" onclick="frappe.deflashing_outstanding_report.handle_sort('outstanding_kg')">
									Outstanding (Kg) ${this.get_sort_indicator('outstanding_kg')}
								</th>
								<th style="padding: 10px; font-weight: 600; color: #495057; cursor: pointer; text-align: right;" data-column="outstanding_nos" onclick="frappe.deflashing_outstanding_report.handle_sort('outstanding_nos')">
									Outstanding (Nos) ${this.get_sort_indicator('outstanding_nos')}
								</th>
								<th style="padding: 10px; font-weight: 600; color: #495057; cursor: pointer; text-align: center;" data-column="last_dispatch" onclick="frappe.deflashing_outstanding_report.handle_sort('last_dispatch')">
									Last Dispatch ${this.get_sort_indicator('last_dispatch')}
								</th>
								<th style="padding: 10px; font-weight: 600; color: #495057; cursor: pointer; text-align: center;" data-column="days_pending" onclick="frappe.deflashing_outstanding_report.handle_sort('days_pending')">
									Days Pending ${this.get_sort_indicator('days_pending')}
								</th>
							</tr>
						</thead>
						<tbody>
		`;

		sorted_data.forEach((row, index) => {
			let row_bg = index % 2 === 0 ? '#ffffff' : '#f8f9fa';
			let days_pending = row.days_pending || 0;
			let pending_class = days_pending > 30 ? 'text-danger' : (days_pending > 15 ? 'text-warning' : 'text-success');
			
			list_html += `
				<tr style="background: ${row_bg};">
					<td style="padding: 8px 10px; font-weight: 600; color: #495057;">${row.vendor}</td>
					<td style="padding: 8px 10px; color: #6c757d;">${row.item}</td>
					<td style="padding: 8px 10px; text-align: right; font-weight: 600; color: #c0392b;">${parseFloat(row.outstanding_kg || 0).toFixed(3)}</td>
					<td style="padding: 8px 10px; text-align: right; font-weight: 600; color: #2980b9;">${parseInt(row.outstanding_nos || 0)}</td>
					<td style="padding: 8px 10px; text-align: center; color: #6c757d;">${row.last_dispatch ? frappe.datetime.str_to_user(row.last_dispatch) : '-'}</td>
					<td style="padding: 8px 10px; text-align: center;" class="${pending_class}">
						<span style="font-weight: 600;">${days_pending}</span> days
					</td>
				</tr>
			`;
		});

		list_html += `
					</tbody>
				</table>
			</div>
		</div>
		`;

		this.result_area.find('.report-content').html(list_html);
	}

	render_chart_view() {
		let me = this;
		
			// Create simple HTML/CSS charts without Chart.js dependency
			let chart_html = `
				<div class="row">
					<div class="col-md-6">
						<div class="frappe-card" style="padding: 15px; margin-bottom: 15px; border: 1px solid #d1d8dd;">
							<h6 style="color: #2c3e50; margin-bottom: 10px; font-weight: 600; font-size: 12px;">
								<i class="fa fa-chart-bar" style="color: #3498db;"></i> Top 10 Vendors by Outstanding (Kg)
							</h6>
							<div id="vendor-chart-container" style="height: 200px; overflow-y: auto;"></div>
						</div>
					</div>
					<div class="col-md-6">
						<div class="frappe-card" style="padding: 15px; margin-bottom: 15px; border: 1px solid #d1d8dd;">
							<h6 style="color: #2c3e50; margin-bottom: 10px; font-weight: 600; font-size: 12px;">
								<i class="fa fa-chart-bar" style="color: #2ecc71;"></i> Top 10 Items by Outstanding (Kg)
							</h6>
							<div id="item-chart-container" style="height: 200px; overflow-y: auto;"></div>
						</div>
					</div>
				</div>
				<div class="row">
					<div class="col-md-8">
						<div class="frappe-card" style="padding: 15px; margin-bottom: 15px; border: 1px solid #d1d8dd;">
							<h6 style="color: #2c3e50; margin-bottom: 10px; font-weight: 600; font-size: 12px;">
								<i class="fa fa-clock" style="color: #f39c12;"></i> Outstanding by Days Pending (Risk Analysis)
							</h6>
							<div id="days-chart-container" style="height: 150px;"></div>
						</div>
					</div>
					<div class="col-md-4">
						<div class="frappe-card" style="padding: 15px; margin-bottom: 15px; border: 1px solid #d1d8dd;">
							<h6 style="color: #2c3e50; margin-bottom: 10px; font-weight: 600; font-size: 12px;">
								<i class="fa fa-exclamation-triangle" style="color: #e74c3c;"></i> Critical Alerts
							</h6>
							<div id="critical-alerts" style="max-height: 150px; overflow-y: auto;"></div>
						</div>
					</div>
				</div>
				<div class="row">
					<div class="col-md-12">
						<div class="frappe-card" style="padding: 15px; border: 1px solid #d1d8dd;">
							<h6 style="color: #2c3e50; margin-bottom: 10px; font-weight: 600; font-size: 12px;">
								<i class="fa fa-users" style="color: #9b59b6;"></i> Vendor Performance Summary
							</h6>
							<div id="vendor-performance-table" style="max-height: 200px; overflow-y: auto;"></div>
						</div>
					</div>
				</div>
			`;

			this.result_area.find('.report-content').html(chart_html);
			
			// Render all charts immediately
			this.render_vendor_bar_chart();
			this.render_item_bar_chart();
			this.render_days_pending_analysis();
			this.render_critical_alerts();
			this.render_vendor_performance_table();
		}

		render_vendor_bar_chart() {
			// Get top 10 vendors by outstanding kg
			let vendor_data = Object.entries(this.vendor_totals)
				.sort((a, b) => b[1].kg - a[1].kg)
				.slice(0, 10);

			if (vendor_data.length === 0) {
				$('#vendor-chart-container').html('<p class="text-muted text-center" style="padding: 50px; font-size: 11px;">No vendor data available</p>');
				return;
			}

			let max_value = Math.max(...vendor_data.map(v => v[1].kg));
			let vendor_html = '';

			vendor_data.forEach((vendor, index) => {
				let percentage = (vendor[1].kg / max_value) * 100;
				let color = this.generateVendorColor(vendor[0], index);
				
				vendor_html += `
					<div style="margin-bottom: 8px;">
						<div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 2px;">
							<span style="font-size: 10px; font-weight: 600; color: #2c3e50;">${vendor[0].substring(0, 25)}</span>
							<span style="font-size: 10px; color: #6c757d;">${vendor[1].kg.toFixed(1)} Kg</span>
						</div>
						<div style="background: #ecf0f1; height: 12px; border-radius: 6px; overflow: hidden;">
							<div style="background: ${color}; height: 100%; width: ${percentage}%; border-radius: 6px; transition: width 0.3s ease;"></div>
						</div>
					</div>
				`;
			});

			$('#vendor-chart-container').html(vendor_html);
		}

		render_item_bar_chart() {
			// Get top 10 items by outstanding kg
			let item_data = Object.entries(this.item_totals)
				.sort((a, b) => b[1].kg - a[1].kg)
				.slice(0, 10);

			if (item_data.length === 0) {
				$('#item-chart-container').html('<p class="text-muted text-center" style="padding: 50px; font-size: 11px;">No item data available</p>');
				return;
			}

			let max_value = Math.max(...item_data.map(i => i[1].kg));
			let item_html = '';

			item_data.forEach((item, index) => {
				let percentage = (item[1].kg / max_value) * 100;
				let color = this.generateItemBorderColor(item[0], index);
				
				item_html += `
					<div style="margin-bottom: 8px;">
						<div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 2px;">
							<span style="font-size: 10px; font-weight: 600; color: #2c3e50;">${item[0]}</span>
							<span style="font-size: 10px; color: #6c757d;">${item[1].kg.toFixed(1)} Kg</span>
						</div>
						<div style="background: #ecf0f1; height: 12px; border-radius: 6px; overflow: hidden;">
							<div style="background: ${color}; height: 100%; width: ${percentage}%; border-radius: 6px; transition: width 0.3s ease;"></div>
						</div>
					</div>
				`;
			});

			$('#item-chart-container').html(item_html);
		}

		render_days_pending_analysis() {
			// Group data by days pending ranges
			let ranges = {
				'0-15 days': { kg: 0, count: 0, color: '#2ecc71', risk: 'Low' },
				'16-30 days': { kg: 0, count: 0, color: '#f39c12', risk: 'Medium' },
				'31-60 days': { kg: 0, count: 0, color: '#e67e22', risk: 'High' },
				'61-90 days': { kg: 0, count: 0, color: '#e74c3c', risk: 'Critical' },
				'90+ days': { kg: 0, count: 0, color: '#8e44ad', risk: 'Urgent' }
			};

			this.raw_data.forEach(row => {
				let days = row.days_pending || 0;
				let outstanding = parseFloat(row.outstanding_kg || 0);
				
				if (days <= 15) {
					ranges['0-15 days'].kg += outstanding;
					ranges['0-15 days'].count++;
				} else if (days <= 30) {
					ranges['16-30 days'].kg += outstanding;
					ranges['16-30 days'].count++;
				} else if (days <= 60) {
					ranges['31-60 days'].kg += outstanding;
					ranges['31-60 days'].count++;
				} else if (days <= 90) {
					ranges['61-90 days'].kg += outstanding;
					ranges['61-90 days'].count++;
				} else {
					ranges['90+ days'].kg += outstanding;
					ranges['90+ days'].count++;
				}
			});

			let max_kg = Math.max(...Object.values(ranges).map(r => r.kg));
			let days_html = '';

			Object.entries(ranges).forEach(([range, data]) => {
				let percentage = max_kg > 0 ? (data.kg / max_kg) * 100 : 0;
				
				days_html += `
					<div style="margin-bottom: 6px;">
						<div style="display: flex; justify-content: between; align-items: center; margin-bottom: 2px;">
							<span style="font-size: 10px; font-weight: 600; color: #2c3e50; width: 70px;">${range}</span>
							<span style="font-size: 9px; color: ${data.color}; font-weight: 600; width: 50px;">${data.risk}</span>
							<span style="font-size: 10px; color: #6c757d; text-align: right; flex: 1;">${data.kg.toFixed(1)} Kg (${data.count} items)</span>
						</div>
						<div style="background: #ecf0f1; height: 10px; border-radius: 5px; overflow: hidden;">
							<div style="background: ${data.color}; height: 100%; width: ${percentage}%; border-radius: 5px; transition: width 0.3s ease;"></div>
						</div>
					</div>
				`;
			});

			$('#days-chart-container').html(days_html);
		}

		render_critical_alerts() {
			// Analyze data for critical insights
			let alerts = [];
			
			// Alert 1: High pending days
			let high_pending = this.raw_data.filter(row => (row.days_pending || 0) > 60);
			if (high_pending.length > 0) {
				let high_pending_kg = high_pending.reduce((sum, row) => sum + parseFloat(row.outstanding_kg || 0), 0);
				alerts.push({
					type: 'danger',
					icon: 'exclamation-triangle',
					title: 'High Risk Items',
					message: `${high_pending.length} items > 60 days`,
					value: high_pending_kg.toFixed(1) + ' Kg'
				});
			}

			// Alert 2: Top vendor concentration
			if (Object.keys(this.vendor_totals).length > 0) {
				let top_vendor = Object.entries(this.vendor_totals).sort((a, b) => b[1].kg - a[1].kg)[0];
				let total_outstanding = Object.values(this.vendor_totals).reduce((sum, v) => sum + v.kg, 0);
				let concentration = (top_vendor[1].kg / total_outstanding * 100);
				
				if (concentration > 30) {
					alerts.push({
						type: 'warning',
						icon: 'user-times',
						title: 'Vendor Risk',
						message: `${top_vendor[0].substring(0, 15)} has ${concentration.toFixed(0)}%`,
						value: top_vendor[1].kg.toFixed(1) + ' Kg'
					});
				}
			}

			// Alert 3: Top item concentration
			if (Object.keys(this.item_totals).length > 0) {
				let top_item = Object.entries(this.item_totals).sort((a, b) => b[1].kg - a[1].kg)[0];
				let total_outstanding = Object.values(this.vendor_totals).reduce((sum, v) => sum + v.kg, 0);
				let item_concentration = (top_item[1].kg / total_outstanding * 100);
				
				if (item_concentration > 25) {
					alerts.push({
						type: 'info',
						icon: 'cube',
						title: 'Item Focus',
						message: `${top_item[0]} is ${item_concentration.toFixed(0)}% of total`,
						value: top_item[1].kg.toFixed(1) + ' Kg'
					});
				}
			}

			// Alert 4: System status
			let total_vendors = Object.keys(this.vendor_totals).length;
			alerts.push({
				type: 'success',
				icon: 'check-circle',
				title: 'Active Vendors',
				message: `${total_vendors} vendors with outstanding`,
				value: total_vendors <= 10 ? 'Good' : 'Monitor'
			});

			// Render alerts
			let alerts_html = '';
			alerts.forEach(alert => {
				alerts_html += `
					<div class="alert alert-${alert.type}" style="padding: 6px 8px; margin-bottom: 6px; font-size: 10px; border-radius: 3px; border: none;">
						<div style="display: flex; align-items: center; justify-content: space-between;">
							<div style="display: flex; align-items: center;">
								<i class="fa fa-${alert.icon}" style="margin-right: 6px; font-size: 10px;"></i>
								<div>
									<div style="font-weight: 600; margin-bottom: 1px; font-size: 10px;">${alert.title}</div>
									<div style="font-size: 9px; opacity: 0.9;">${alert.message}</div>
								</div>
							</div>
							<div style="font-weight: 700; font-size: 9px; text-align: right;">
								${alert.value}
							</div>
						</div>
					</div>
				`;
			});

			$('#critical-alerts').html(alerts_html);
		}

		render_vendor_performance_table() {
			// Create vendor performance summary table
			let vendor_performance = Object.entries(this.vendor_totals)
				.sort((a, b) => b[1].kg - a[1].kg)
				.slice(0, 15);

			if (vendor_performance.length === 0) {
				$('#vendor-performance-table').html('<p class="text-muted text-center" style="padding: 30px; font-size: 11px;">No performance data available</p>');
				return;
			}

			let table_html = `
				<table style="width: 100%; font-size: 10px; border-collapse: collapse;">
					<thead>
						<tr style="background: #f8f9fa;">
							<th style="padding: 6px 8px; text-align: left; border-bottom: 1px solid #dee2e6; font-weight: 600; color: #495057;">Vendor</th>
							<th style="padding: 6px 8px; text-align: right; border-bottom: 1px solid #dee2e6; font-weight: 600; color: #495057;">Outstanding (Kg)</th>
							<th style="padding: 6px 8px; text-align: right; border-bottom: 1px solid #dee2e6; font-weight: 600; color: #495057;">Items Count</th>
							<th style="padding: 6px 8px; text-align: center; border-bottom: 1px solid #dee2e6; font-weight: 600; color: #495057;">Performance</th>
						</tr>
					</thead>
					<tbody>
			`;

			let total_outstanding = vendor_performance.reduce((sum, v) => sum + v[1].kg, 0);

			vendor_performance.forEach((vendor, index) => {
				let item_count = Object.keys(this.matrix_data[vendor[0]] || {}).length;
				let percentage = (vendor[1].kg / total_outstanding * 100);
				let performance_class = percentage > 30 ? 'danger' : (percentage > 15 ? 'warning' : 'success');
				let performance_text = percentage > 30 ? 'High Risk' : (percentage > 15 ? 'Monitor' : 'Normal');
				
				table_html += `
					<tr style="background: ${index % 2 === 0 ? '#ffffff' : '#f8f9fa'};">
						<td style="padding: 4px 8px; border-bottom: 1px solid #f1f3f4; font-weight: 600; color: #2c3e50; max-width: 150px; overflow: hidden; text-overflow: ellipsis;">${vendor[0]}</td>
						<td style="padding: 4px 8px; border-bottom: 1px solid #f1f3f4; text-align: right; color: #6c757d;">${vendor[1].kg.toFixed(1)}</td>
						<td style="padding: 4px 8px; border-bottom: 1px solid #f1f3f4; text-align: right; color: #6c757d;">${item_count}</td>
						<td style="padding: 4px 8px; border-bottom: 1px solid #f1f3f4; text-align: center;">
							<span class="badge badge-${performance_class}" style="font-size: 8px; padding: 2px 6px;">${performance_text}</span>
						</td>
					</tr>
				`;
			});

			table_html += `
					</tbody>
				</table>
			`;

			$('#vendor-performance-table').html(table_html);
			}

	render_lot_number_outstanding() {
		if (!this.raw_data || this.raw_data.length === 0) {
			this.result_area.find('.report-content').html(`
				<div class="text-center" style="padding: 40px;">
					<i class="fa fa-inbox" style="font-size: 48px; color: #d1d8dd; margin-bottom: 15px;"></i>
					<h5 style="color: #8d99a6;">No Outstanding Data Found</h5>
					<p class="text-muted">No lot number outstanding records found for the selected filters.</p>
				</div>
			`);
			return;
		}

		// Group data by lot numbers
		let lot_data = {};
		this.raw_data.forEach(row => {
			if (row.lot_number) {
				if (!lot_data[row.lot_number]) {
					lot_data[row.lot_number] = {
						lot_number: row.lot_number,
						vendor: row.vendor,
						item: row.item,
						outstanding_kg: 0,
						outstanding_nos: 0,
						last_dispatch: row.last_dispatch,
						days_pending: row.days_pending || 0
					};
				}
				lot_data[row.lot_number].outstanding_kg += parseFloat(row.outstanding_kg || 0);
				lot_data[row.lot_number].outstanding_nos += parseFloat(row.outstanding_nos || 0);
			}
		});

		if (Object.keys(lot_data).length === 0) {
			this.result_area.find('.report-content').html(`
				<div class="text-center" style="padding: 40px;">
					<i class="fa fa-exclamation-triangle" style="font-size: 48px; color: #f39c12; margin-bottom: 15px;"></i>
					<h5 style="color: #8d99a6;">No Lot Numbers Found</h5>
					<p class="text-muted">No lot number data available in the outstanding records.</p>
				</div>
			`);
			return;
		}

		// Convert to array and sort
		let lot_array = Object.values(lot_data);
		let sorted_lots = this.sort_data(lot_array, this.sort_column || 'days_pending', this.sort_direction);

		let lot_html = `
			<div class="frappe-card">
				<div class="table-responsive">
					<table class="table table-bordered table-hover sortable-table" style="font-size: 12px; margin-bottom: 0;">
						<thead style="background: #f8f9fa;">
							<tr>
								<th style="padding: 10px; font-weight: 600; color: #495057; cursor: pointer;" data-column="lot_number" onclick="frappe.deflashing_outstanding_report.handle_sort('lot_number')">
									Lot Number ${this.get_sort_indicator('lot_number')}
								</th>
								<th style="padding: 10px; font-weight: 600; color: #495057; cursor: pointer;" data-column="vendor" onclick="frappe.deflashing_outstanding_report.handle_sort('vendor')">
									Vendor ${this.get_sort_indicator('vendor')}
								</th>
								<th style="padding: 10px; font-weight: 600; color: #495057; cursor: pointer;" data-column="item" onclick="frappe.deflashing_outstanding_report.handle_sort('item')">
									Item ${this.get_sort_indicator('item')}
								</th>
								<th style="padding: 10px; font-weight: 600; color: #495057; cursor: pointer; text-align: right;" data-column="outstanding_kg" onclick="frappe.deflashing_outstanding_report.handle_sort('outstanding_kg')">
									Outstanding (Kg) ${this.get_sort_indicator('outstanding_kg')}
								</th>
								<th style="padding: 10px; font-weight: 600; color: #495057; cursor: pointer; text-align: right;" data-column="outstanding_nos" onclick="frappe.deflashing_outstanding_report.handle_sort('outstanding_nos')">
									Outstanding (Nos) ${this.get_sort_indicator('outstanding_nos')}
								</th>
								<th style="padding: 10px; font-weight: 600; color: #495057; cursor: pointer; text-align: center;" data-column="last_dispatch" onclick="frappe.deflashing_outstanding_report.handle_sort('last_dispatch')">
									Last Dispatch ${this.get_sort_indicator('last_dispatch')}
								</th>
								<th style="padding: 10px; font-weight: 600; color: #495057; cursor: pointer; text-align: center;" data-column="days_pending" onclick="frappe.deflashing_outstanding_report.handle_sort('days_pending')">
									Days Pending ${this.get_sort_indicator('days_pending')}
								</th>
							</tr>
						</thead>
						<tbody>
		`;

		sorted_lots.forEach((lot_info, index) => {
			let row_bg = index % 2 === 0 ? '#ffffff' : '#f8f9fa';
			let days_pending = lot_info.days_pending;
			let pending_class = days_pending > 30 ? 'text-danger' : (days_pending > 15 ? 'text-warning' : 'text-success');
			
			lot_html += `
				<tr style="background: ${row_bg};">
					<td style="padding: 8px 10px; font-weight: 600; color: #2980b9;">${lot_info.lot_number}</td>
					<td style="padding: 8px 10px; font-weight: 600; color: #495057;">${lot_info.vendor}</td>
					<td style="padding: 8px 10px; color: #6c757d;">${lot_info.item}</td>
					<td style="padding: 8px 10px; text-align: right; font-weight: 600; color: #c0392b;">${lot_info.outstanding_kg.toFixed(3)}</td>
					<td style="padding: 8px 10px; text-align: right; font-weight: 600; color: #2980b9;">${lot_info.outstanding_nos}</td>
					<td style="padding: 8px 10px; text-align: center; color: #6c757d;">${lot_info.last_dispatch ? frappe.datetime.str_to_user(lot_info.last_dispatch) : '-'}</td>
					<td style="padding: 8px 10px; text-align: center;" class="${pending_class}">
						<span style="font-weight: 600;">${days_pending}</span> days
					</td>
				</tr>
			`;
		});

		lot_html += `
					</tbody>
				</table>
			</div>
		</div>
		`;

		this.result_area.find('.report-content').html(lot_html);
	}

	apply_search_filters() {
		// Re-render the current view with search filters applied
		if (this.raw_data && this.raw_data.length > 0) {
			this.render_report();
		}
	}

	drill_down(vendor, item) {
		// Open a dialog showing detailed breakdown for vendor-item combination
		let dialog = new frappe.ui.Dialog({
			title: `Outstanding Details: ${vendor} - ${item}`,
			fields: [],
			size: 'large'
		});

		 // Get the as_of_date from the filter
		let as_of_date = $('#as_of_date').val();
		
		if (!as_of_date) {
			frappe.msgprint(__('Please select As Of Date first'));
			return;
		}

		 // Show loading state in dialog
		dialog.$body.html('<div class="text-center" style="padding: 40px;"><i class="fa fa-spinner fa-spin fa-2x"></i><br><br>Loading details...</div>');
		dialog.show();

		// Fetch detailed data for this vendor-item combination
		frappe.call({
			method: 'smart_screens.smart_screens.page.deflashing_outstanding_report.deflashing_outstanding_report.get_vendor_item_details',
			args: {
				vendor: vendor,
				item: item,
				as_of_date: as_of_date
			},
			callback: function(r) {
				if (r.message) {
					if (r.message.status === 'success' && r.message.data && r.message.data.length > 0) {
						let details_html = `
							<div style="padding: 10px;">
								<table class="table table-bordered table-hover" style="font-size: 11px; margin-bottom: 0;">
									<thead style="background: #f8f9fa;">
										<tr>
											<th style="padding: 8px; font-weight: 600;">Lot Number</th>
											<th style="padding: 8px; font-weight: 600;">Batch No</th>
											<th style="padding: 8px; font-weight: 600; text-align: right;">Dispatched (Nos)</th>
											<th style="padding: 8px; font-weight: 600; text-align: right;">Received (Nos)</th>
											<th style="padding: 8px; font-weight: 600; text-align: right;">Outstanding (Nos)</th>
											<th style="padding: 8px; font-weight: 600; text-align: center;">Dispatch Date</th>
											<th style="padding: 8px; font-weight: 600; text-align: center;">Status</th>
										</tr>
									</thead>
									<tbody>
						`;

						r.message.data.forEach((detail, index) => {
							let row_bg = index % 2 === 0 ? '#ffffff' : '#f8f9fa';
							let status_color = detail.status === 'Received' ? '#27ae60' : '#e74c3c';
							let dispatch_date = detail.dispatch_date ? frappe.datetime.str_to_user(detail.dispatch_date) : '-';
							
							details_html += `
								<tr style="background: ${row_bg};">
									<td style="padding: 8px; font-weight: 600; color: #2980b9;">${detail.lot_number || detail.lot_no || '-'}</td>
									<td style="padding: 8px; color: #6c757d;">${detail.batch_no || '-'}</td>
									<td style="padding: 8px; text-align: right; font-weight: 600;">${parseInt(detail.dispatched_nos || 0)}</td>
									<td style="padding: 8px; text-align: right; color: #27ae60;">${parseInt(detail.received_nos || 0)}</td>
									<td style="padding: 8px; text-align: right; font-weight: 600; color: #c0392b;">${parseInt(detail.outstanding_nos || 0)}</td>
									<td style="padding: 8px; text-align: center; color: #6c757d;">${dispatch_date}</td>
									<td style="padding: 8px; text-align: center;">
										<span style="background: ${status_color}; color: white; padding: 3px 8px; border-radius: 3px; font-size: 10px; font-weight: 600;">
											${detail.status || 'Unknown'}
										</span>
									</td>
								</tr>
							`;
						});

						details_html += `
									</tbody>
								</table>
							</div>
						`;
						
						dialog.$body.html(details_html);
					} else if (r.message.data && r.message.data.length === 0) {
						dialog.$body.html(`
							<div class="text-center" style="padding: 40px;">
								<i class="fa fa-inbox" style="font-size: 36px; color: #d1d8dd; margin-bottom: 10px;"></i>
								<h6 style="color: #8d99a6;">No Details Found</h6>
								<p class="text-muted" style="font-size: 12px;">No dispatch records found for ${vendor} - ${item}</p>
							</div>
						`);
					} else {
						dialog.$body.html(`
							<div class="alert alert-warning" style="margin: 15px;">
								<strong>Error:</strong> ${r.message.message || 'Unable to fetch details'}
							</div>
						`);
					}
				} else {
					dialog.$body.html(`
						<div class="alert alert-danger" style="margin: 15px;">
							<strong>Error:</strong> Failed to fetch vendor item details. Please try again.
						</div>
					`);
				}
			},
			error: function(err) {
				dialog.$body.html(`
					<div class="alert alert-danger" style="margin: 15px;">
						<strong>Error:</strong> ${err.statusText || 'Failed to fetch data'}
					</div>
				`);
			}
		});
	}

	clear_filters() {
		$('#vendor_search').val('');
		$('#item_search').val('');
		$('#min_outstanding_days').val('');
		 $('#as_of_date').val(frappe.datetime.get_today());
		this.result_area.find('.report-content').html('');
		this.result_area.find('.report-summary').html('');
	}

	export_to_excel() {
		if (!this.raw_data || this.raw_data.length === 0) {
			frappe.msgprint(__('No data to export'));
			return;
		}

		// Prepare data for export
		let export_data = this.raw_data.map(row => ({
			'Vendor': row.vendor,
			'Item': row.item,
			'Outstanding (Kg)': parseFloat(row.outstanding_kg || 0).toFixed(3),
			'Outstanding (Nos)': parseInt(row.outstanding_nos || 0),
			'Last Dispatch': row.last_dispatch ? frappe.datetime.str_to_user(row.last_dispatch) : '',
			'Days Pending': row.days_pending || 0
		}));

		frappe.tools.downloadify(export_data, null, this);
	}

	handle_sort(column) {
		// Toggle sort direction if same column clicked, otherwise set new column
		if (this.sort_column === column) {
			this.sort_direction = this.sort_direction === 'asc' ? 'desc' : 'asc';
		} else {
			this.sort_column = column;
			this.sort_direction = 'asc';
		}
		
		// Re-render the current view
		this.render_report();
	}

	get_sort_indicator(column) {
		if (this.sort_column !== column) {
			return '<i class="fa fa-sort" style="color: #adb5bd; margin-left: 5px; opacity: 0.5;"></i>';
		}
		if (this.sort_direction === 'asc') {
			return '<i class="fa fa-sort-up" style="color: #2980b9; margin-left: 5px;"></i>';
		} else {
			return '<i class="fa fa-sort-down" style="color: #2980b9; margin-left: 5px;"></i>';
		}
	}

	sort_data(data, column, direction) {
		if (!column) {
			return data;
		}

		let sorted = [...data];
		
		sorted.sort((a, b) => {
			let valueA = a[column];
			let valueB = b[column];

			// Handle null/undefined
			if (valueA === null || valueA === undefined) valueA = '';
			if (valueB === null || valueB === undefined) valueB = '';

			// Convert to numbers if they are numeric
			if (!isNaN(valueA) && valueA !== '') valueA = parseFloat(valueA);
			if (!isNaN(valueB) && valueB !== '') valueB = parseFloat(valueB);

			// Compare
			if (valueA < valueB) {
				return direction === 'asc' ? -1 : 1;
			}
			if (valueA > valueB) {
				return direction === 'asc' ? 1 : -1;
			}
			return 0;
		});

		return sorted;
	}
}