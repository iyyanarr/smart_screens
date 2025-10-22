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
							<button type="button" class="btn btn-outline-dark view-toggle" data-view="list" title="List View">
								<i class="fa fa-list"></i> List
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
						<table class="table table-bordered" style="margin: 0; font-size: 13px; white-space: nowrap; border-collapse: collapse; width: 100%;">
						<thead style="position: sticky; top: 0; z-index: 10; background: #2c3e50;">
							<tr>
								<th style="padding: 10px 12px; color: white; font-weight: 600; border: 1px solid #34495e; min-width: 150px; position: sticky; left: 0; background: #2c3e50; z-index: 11; font-size: 13px;">
									Vendor
								</th>
		`;

		// Add item headers - simple, clean design without excessive colors
		items.forEach((item) => {
			matrix_html += `
				<th style="padding: 8px 4px; color: white; font-weight: 600; border: 1px solid #34495e; text-align: center; min-width: 80px; font-size: 13px;">
					${item}
				</th>
			`;
		});

		matrix_html += `
				<th style="padding: 10px 12px; color: white; font-weight: 600; border: 1px solid #34495e; text-align: center; min-width: 100px; background: #1a252f; font-size: 13px;">
					Total
				</th>
			</tr>
		</thead>
		<tbody>
		`;

		// Add vendor rows - simple alternating colors (white and light gray only)
		vendors.forEach((vendor, vendorIndex) => {
			const rowBg = vendorIndex % 2 === 0 ? '#ffffff' : '#f8f9fa';
			
			matrix_html += `
				<tr style="background: ${rowBg};">
					<td style="padding: 10px 12px; font-weight: 600; color: #2c3e50; border: 1px solid #dee2e6; position: sticky; left: 0; background: ${rowBg}; z-index: 5; font-size: 13px;">
						${vendor}
					</td>
			`;

			// Add item cells showing only "nos" quantities
			items.forEach((item) => {
				let cell_data = this.matrix_data[vendor] && this.matrix_data[vendor][item] 
					? this.matrix_data[vendor][item] 
					: { kg: 0, nos: 0 };
				
				let nos_value = cell_data.nos;
				let has_outstanding = nos_value > 0;
				
				// Check days pending for this vendor-item combination
				let days_pending_array = this.days_pending_data[vendor] && this.days_pending_data[vendor][item] 
					? this.days_pending_data[vendor][item] 
					: [];
				let max_days = days_pending_array.length > 0 ? Math.max(...days_pending_array) : 0;
				
				// Highlight in RED only if > 7 days pending (more than 1 week)
				let cellBg = rowBg;
				let cellColor = '#2c3e50';
				if (has_outstanding && max_days > 7) {
					cellBg = '#ffebee'; // Light red background
					cellColor = '#c62828'; // Dark red text
				}
				
				if (has_outstanding) {
					matrix_html += `
						<td style="padding: 8px 4px; text-align: center; border: 1px solid #dee2e6; background: ${cellBg}; cursor: pointer; font-size: 14px; font-weight: 600;" 
							title="Item: ${item}\nVendor: ${vendor}\nOutstanding: ${nos_value} Nos\nDays Pending: ${max_days}"
							onclick="frappe.deflashing_outstanding_report.drill_down('${vendor}', '${item}')">
							<span style="color: ${cellColor};">${nos_value}</span>
						</td>
					`;
				} else {
					// Empty cell with simple dash
					matrix_html += `
						<td style="padding: 8px 4px; text-align: center; border: 1px solid #dee2e6; background: ${rowBg}; color: #bdbdbd; font-size: 13px;">
							-
						</td>
					`;
				}
			});

			// Add total cell showing only nos total
			let vendor_total = this.vendor_totals[vendor];
			matrix_html += `
				<td style="padding: 10px 12px; text-align: center; font-weight: 700; background: #e3f2fd; color: #1565c0; border: 1px solid #90caf9; font-size: 14px;">
					${vendor_total.nos}
				</td>
			</tr>
			`;
		});

		// Add totals row
		matrix_html += `
			<tr style="background: #eceff1; font-weight: 700;">
				<td style="padding: 10px 12px; color: #2c3e50; border: 1px solid #dee2e6; position: sticky; left: 0; background: #eceff1; z-index: 5; font-size: 13px;">
					Total
				</td>
		`;

		items.forEach((item) => {
			let item_total = this.item_totals[item];
			matrix_html += `
				<td style="padding: 8px 4px; text-align: center; color: #2c3e50; border: 1px solid #dee2e6; font-size: 14px; font-weight: 600;">
					${item_total.nos}
				</td>
			`;
		});

		let grand_total_nos = Object.values(this.vendor_totals).reduce((sum, v) => sum + v.nos, 0);

		matrix_html += `
				<td style="padding: 10px 12px; text-align: center; background: #c5cae9; color: #283593; border: 1px solid #9fa8da; font-size: 14px; font-weight: 700;">
					${grand_total_nos}
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

		// Group data by lot numbers and filter ONLY PENDING items (outstanding > 0)
		let lot_data = {};
		this.raw_data.forEach(row => {
			// Only process if there's actual outstanding quantity (PENDING ONLY)
			let has_outstanding = (parseFloat(row.outstanding_qty || 0) > 0) || (parseFloat(row.outstanding_nos || 0) > 0);
			
			if (row.lot_number && has_outstanding) {
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
				lot_data[row.lot_number].outstanding_kg += parseFloat(row.outstanding_qty || 0);
				lot_data[row.lot_number].outstanding_nos += parseFloat(row.outstanding_nos || 0);
			}
		});

		if (Object.keys(lot_data).length === 0) {
			this.result_area.find('.report-content').html(`
				<div class="text-center" style="padding: 40px;">
					<i class="fa fa-check-circle" style="font-size: 48px; color: #2ecc71; margin-bottom: 15px;"></i>
					<h5 style="color: #8d99a6;">All Lots Received</h5>
					<p class="text-muted">No pending lot numbers found. All items have been received back from deflashing vendors.</p>
				</div>
			`);
			return;
		}

		// Convert to array and sort by days pending (highest first)
		let lot_array = Object.values(lot_data);
		let sorted_lots = this.sort_data(lot_array, this.sort_column || 'days_pending', this.sort_direction || 'desc');

		let lot_html = `
			<div class="frappe-card">
				<div class="table-responsive">
					<table class="table table-bordered table-hover sortable-table" style="font-size: 13px; margin-bottom: 0;">
						<thead style="background: #f8f9fa;">
							<tr>
								<th style="padding: 12px; font-weight: 600; color: #495057; cursor: pointer; font-size: 13px;" data-column="lot_number" onclick="frappe.deflashing_outstanding_report.handle_sort('lot_number')">
									Lot Number ${this.get_sort_indicator('lot_number')}
								</th>
								<th style="padding: 12px; font-weight: 600; color: #495057; cursor: pointer; font-size: 13px;" data-column="vendor" onclick="frappe.deflashing_outstanding_report.handle_sort('vendor')">
									Vendor ${this.get_sort_indicator('vendor')}
								</th>
								<th style="padding: 12px; font-weight: 600; color: #495057; cursor: pointer; font-size: 13px;" data-column="item" onclick="frappe.deflashing_outstanding_report.handle_sort('item')">
									Item ${this.get_sort_indicator('item')}
								</th>
								<th style="padding: 12px; font-weight: 600; color: #495057; cursor: pointer; text-align: right; font-size: 13px;" data-column="outstanding_kg" onclick="frappe.deflashing_outstanding_report.handle_sort('outstanding_kg')">
									Outstanding (Kg) ${this.get_sort_indicator('outstanding_kg')}
								</th>
								<th style="padding: 12px; font-weight: 600; color: #495057; cursor: pointer; text-align: right; font-size: 13px;" data-column="outstanding_nos" onclick="frappe.deflashing_outstanding_report.handle_sort('outstanding_nos')">
									Outstanding (Nos) ${this.get_sort_indicator('outstanding_nos')}
								</th>
								<th style="padding: 12px; font-weight: 600; color: #495057; cursor: pointer; text-align: center; font-size: 13px;" data-column="last_dispatch" onclick="frappe.deflashing_outstanding_report.handle_sort('last_dispatch')">
									Last Dispatch ${this.get_sort_indicator('last_dispatch')}
								</th>
								<th style="padding: 12px; font-weight: 600; color: #495057; cursor: pointer; text-align: center; font-size: 13px;" data-column="days_pending" onclick="frappe.deflashing_outstanding_report.handle_sort('days_pending')">
									Days Pending ${this.get_sort_indicator('days_pending')}
								</th>
							</tr>
						</thead>
						<tbody>
		`;

		sorted_lots.forEach((lot_info, index) => {
			let row_bg = index % 2 === 0 ? '#ffffff' : '#f8f9fa';
			let days_pending = lot_info.days_pending;
			
			// Highlight ONLY items > 7 days in RED
			let row_highlight = '';
			let days_cell_style = 'padding: 10px 12px; text-align: center; font-size: 13px;';
			
			if (days_pending > 7) {
				row_highlight = 'background: #ffebee;'; // Light red background for entire row
				days_cell_style = 'padding: 10px 12px; text-align: center; font-weight: 700; color: #c62828; font-size: 14px;'; // Bold red text
			}
			
			lot_html += `
				<tr style="${row_highlight || 'background: ' + row_bg + ';'}">
					<td style="padding: 10px 12px; font-weight: 600; color: #2980b9; font-size: 13px;">${lot_info.lot_number}</td>
					<td style="padding: 10px 12px; font-weight: 600; color: #495057; font-size: 13px;">${lot_info.vendor}</td>
					<td style="padding: 10px 12px; color: #495057; font-size: 13px;">${lot_info.item}</td>
					<td style="padding: 10px 12px; text-align: right; font-weight: 600; color: #495057; font-size: 13px;">${lot_info.outstanding_kg.toFixed(3)}</td>
					<td style="padding: 10px 12px; text-align: right; font-weight: 600; color: #2980b9; font-size: 14px;">${lot_info.outstanding_nos}</td>
					<td style="padding: 10px 12px; text-align: center; color: #6c757d; font-size: 13px;">${lot_info.last_dispatch ? frappe.datetime.str_to_user(lot_info.last_dispatch) : '-'}</td>
					<td style="${days_cell_style}">
						${days_pending} days
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

		// Fetch detailed data for this vendor-item combination
		frappe.call({
			method: 'smart_screens.smart_screens.page.deflashing_outstanding_report.deflashing_outstanding_report.get_vendor_item_details',
			args: {
				vendor: vendor,
				item: item,
				as_of_date: as_of_date
			},
			callback: function(r) {
				if (r.message && r.message.status === 'success') {
					let details_html = '<div class="row">';
					r.message.data.forEach(detail => {
						details_html += `
							<div class="col-md-6 mb-3">
								<div class="card card-body">
									<h6 class="card-title">Lot: ${detail.lot_no}</h6>
									<p class="card-text" style="font-size: 12px;">
										Dispatched: ${frappe.datetime.str_to_user(detail.dispatch_date)}<br>
										Outstanding: ${detail.outstanding_kg} Kg, ${detail.outstanding_nos} Nos
									</p>
								</div>
							</div>
						`;
					});
					details_html += '</div>';
					
					dialog.$body.html(details_html);
					dialog.show();
				} else {
					frappe.msgprint(__('Failed to fetch vendor item details'));
				}
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