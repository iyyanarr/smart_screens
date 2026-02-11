frappe.pages['batcom-aggregated-report'].on_page_load = function (wrapper) {
	var page = frappe.ui.make_app_page({
		parent: wrapper,
		title: 'Batch & Compound Aggregated Report',
		single_column: true
	});

	new BatComAggregatedReport(page);
}

class BatComAggregatedReport {
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

		// Store filter values for later use (e.g., when showing batch details)
		this.current_filters = filter_values;

		this.show_loading_with_progress();

		// Subscribe to real-time progress updates
		frappe.realtime.on('batcom_aggregated_progress', (data) => {
			this.update_progress(data);
		});

		frappe.call({
			method: 'smart_screens.smart_screens.page.batcom_aggregated_report.batcom_aggregated_report.get_batcom_batch_balance_data',
			args: { filters: filter_values },
			callback: (r) => {
				// Unsubscribe from progress updates
				frappe.realtime.off('batcom_aggregated_progress');

				if (r.message && r.message.success) {
					this.render_report(r.message);

					// Show performance summary if available
					if (r.message.performance) {
						this.show_performance_summary(r.message.performance);
					}
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
				// Unsubscribe from progress updates
				frappe.realtime.off('batcom_aggregated_progress');

				frappe.msgprint({
					title: __('Error'),
					indicator: 'red',
					message: __('An error occurred while loading the report')
				});
				console.error('Report error:', err);
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

		// Store original data for filtering and sorting
		this.report_data = data;
		this.grand_total = grand_total;
		this.grand_total_original = JSON.parse(JSON.stringify(grand_total)); // Store original for reset
		this.raw_filtered_data = response.raw_filtered_data || []; // Store raw data for re-aggregation
		this.filtered_data = [...data]; // Copy for filtering
		this.current_sort = { column: 'common_code', order: 'asc' }; // Default sort
		this.current_warehouse = ''; // Track current warehouse filter

		// Create aggregated table HTML
		let html = `
			<div class="spp-aggregated-container">
				<div class="report-info">
					<div class="report-stats">
						<span><strong>Total Items:</strong> <span id="total-items">${response.aggregated_records || 0}</span></span>
						<span class="ml-3"><strong>Filtered Records:</strong> ${response.filtered_records || 0}</span>
						<span class="ml-3"><strong>Source Records:</strong> ${response.total_records || 0}</span>
						<span class="ml-3"><strong>Warehouses:</strong> ${response.warehouse_count || 0}</span>
					</div>
					<div class="report-filters-section">
						<div class="warehouse-filter-wrapper">
							<label for="warehouse-filter" class="filter-label">Warehouse:</label>
							<select class="form-control warehouse-filter" id="warehouse-filter">
								<option value="">All Warehouses</option>
								${(response.warehouses_used || []).map(wh =>
			`<option value="${wh}">${wh.replace(' - SPP INDIA', '')}</option>`
		).join('')}
							</select>
						</div>
						<div class="search-box">
							<i class="fa fa-search search-icon"></i>
							<input type="text" 
								class="form-control common-code-search" 
								placeholder="Search by Common Code..." 
								id="common-code-filter">
							<button class="btn btn-xs btn-secondary clear-search" style="display: none;">
								<i class="fa fa-times"></i>
							</button>
						</div>
						<span class="search-results" id="search-results">Showing: ${data.length} items</span>
					</div>
				</div>
				<div class="table-responsive">
					<table class="table table-bordered aggregated-table" id="aggregated-data-table">
						<thead>
							<tr>
								<th rowspan="2" class="item-header sortable-header" data-column="common_code" data-type="string">
									Item Code <i class="fa fa-sort sort-icon"></i>
								</th>
								<th colspan="6" class="batch-header">Batch</th>
								<th colspan="6" class="master-batch-header">Master Batch</th>
								<th colspan="6" class="compound-header">Compound</th>
								<th rowspan="2" class="total-header sortable-header" data-column="Total.balance_qty" data-type="number">
									Total <i class="fa fa-sort sort-icon"></i>
								</th>
								<th rowspan="2" class="total-header sortable-header" data-column="Total.balance_value" data-type="number">
									Total Value <i class="fa fa-sort sort-icon"></i>
								</th>
								<th rowspan="2" class="action-header">Actions</th>
							</tr>
							<tr>
								<!-- Batch columns -->
								<th class="batch-subheader sortable-header" data-column="Batch.opening_qty" data-type="number">
									Opening <i class="fa fa-sort sort-icon"></i>
								</th>
								<th class="batch-subheader sortable-header" data-column="Batch.in_qty" data-type="number">
									In <i class="fa fa-sort sort-icon"></i>
								</th>
								<th class="batch-subheader sortable-header" data-column="Batch.out_qty" data-type="number">
									Out <i class="fa fa-sort sort-icon"></i>
								</th>
								<th class="batch-subheader sortable-header" data-column="Batch.balance_qty" data-type="number">
									Balance <i class="fa fa-sort sort-icon"></i>
								</th>
								<th class="batch-subheader">Rate</th>
								<th class="batch-subheader">Value</th>
								<!-- Master Batch columns -->
								<th class="master-batch-subheader sortable-header" data-column="Master Batch.opening_qty" data-type="number">
									Opening <i class="fa fa-sort sort-icon"></i>
								</th>
								<th class="master-batch-subheader sortable-header" data-column="Master Batch.in_qty" data-type="number">
									In <i class="fa fa-sort sort-icon"></i>
								</th>
								<th class="master-batch-subheader sortable-header" data-column="Master Batch.out_qty" data-type="number">
									Out <i class="fa fa-sort sort-icon"></i>
								</th>
								<th class="master-batch-subheader sortable-header" data-column="Master Batch.balance_qty" data-type="number">
									Balance <i class="fa fa-sort sort-icon"></i>
								</th>
								<th class="master-batch-subheader">Rate</th>
								<th class="master-batch-subheader">Value</th>
								<!-- Compound columns -->
								<th class="compound-subheader sortable-header" data-column="Compound.opening_qty" data-type="number">
									Opening <i class="fa fa-sort sort-icon"></i>
								</th>
								<th class="compound-subheader sortable-header" data-column="Compound.in_qty" data-type="number">
									In <i class="fa fa-sort sort-icon"></i>
								</th>
								<th class="compound-subheader sortable-header" data-column="Compound.out_qty" data-type="number">
									Out <i class="fa fa-sort sort-icon"></i>
								</th>
								<th class="compound-subheader sortable-header" data-column="Compound.balance_qty" data-type="number">
									Balance <i class="fa fa-sort sort-icon"></i>
								</th>
								<th class="compound-subheader">Rate</th>
								<th class="compound-subheader">Value</th>
							</tr>
						</thead>
						<tbody id="table-body">
						</tbody>
					</table>
				</div>
				<div class="mt-2">
					<div class="text-muted small">Note: Batch quantities are displayed in Numbers (Nos). Large numbers formatted in Indian system (L = Lakh, Cr = Crore).</div>
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

	// BatCom-specific common code extraction
	// Patterns: B_4910 → 4910, MB_60103v5 → 60103, C_50EP02v3 → 50EP02, CMB_7025 → 7025
	extract_batcom_common_code(item_code) {
		if (!item_code) return null;

		item_code = String(item_code).trim();

		// Remove prefix (order matters - check longer prefixes first)
		const prefixes = ['CMB_D', 'CMB_', 'MB_', 'B_', 'C_', 'BC_'];
		let code_part = item_code;

		for (const prefix of prefixes) {
			if (item_code.toUpperCase().startsWith(prefix.toUpperCase())) {
				code_part = item_code.substring(prefix.length);
				break;
			}
		}

		if (!code_part) return null;

		// Handle special cases with space (e.g., "6025 A" → "6025")
		if (code_part.includes(' ')) {
			code_part = code_part.split(' ')[0];
		}

		// Remove trailing 'L' for CMB_D items (e.g., "7025L" → "7025")
		if (code_part.endsWith('L') && code_part.length > 1 && /\d/.test(code_part[code_part.length - 2])) {
			code_part = code_part.slice(0, -1);
		}

		// Remove version suffix (v0, v1, v23, V24, etc.) - case insensitive
		const versionMatch = code_part.match(/[vV]\d+$/);
		if (versionMatch) {
			code_part = code_part.substring(0, versionMatch.index);
		}

		return code_part.trim() || null;
	}

	// NEW: Function to re-aggregate data by warehouse
	aggregate_by_warehouse(warehouse) {
		if (!warehouse || warehouse === '') {
			// Return original aggregated data (all warehouses)
			return {
				data: this.report_data,
				grand_total: this.grand_total_original || this.grand_total
			};
		}

		// Filter raw data by warehouse
		const warehouse_data = this.raw_filtered_data.filter(row => {
			return row.warehouse === warehouse;
		});

		if (warehouse_data.length === 0) {
			return {
				data: [],
				grand_total: {
					"Batch": { "opening_qty": 0, "in_qty": 0, "out_qty": 0, "balance_qty": 0, "balance_value": 0 },
					"Master Batch": { "opening_qty": 0, "in_qty": 0, "out_qty": 0, "balance_qty": 0, "balance_value": 0 },
					"Compound": { "opening_qty": 0, "in_qty": 0, "out_qty": 0, "balance_qty": 0, "balance_value": 0 },
					"Total": { "opening_qty": 0, "in_qty": 0, "out_qty": 0, "balance_qty": 0, "balance_value": 0 }
				}
			};
		}

		// Re-aggregate by common_code using BatCom extraction
		const aggregated = {};
		const grand_total = {
			"Batch": { "opening_qty": 0, "in_qty": 0, "out_qty": 0, "balance_qty": 0, "balance_value": 0 },
			"Master Batch": { "opening_qty": 0, "in_qty": 0, "out_qty": 0, "balance_qty": 0, "balance_value": 0 },
			"Compound": { "opening_qty": 0, "in_qty": 0, "out_qty": 0, "balance_qty": 0, "balance_value": 0 },
			"Total": { "opening_qty": 0, "in_qty": 0, "out_qty": 0, "balance_qty": 0, "balance_value": 0 }
		};

		warehouse_data.forEach(row => {
			const item = row.item || '';

			// Use BatCom-specific common code extraction
			const common_code = this.extract_batcom_common_code(item);

			if (!common_code) return;

			// Initialize aggregated row
			if (!aggregated[common_code]) {
				aggregated[common_code] = {
					common_code: common_code,
					warehouses: [warehouse],
					"Batch": { "opening_qty": 0, "in_qty": 0, "out_qty": 0, "balance_qty": 0, "valuation_rate": 0, "balance_value": 0 },
					"Master Batch": { "opening_qty": 0, "in_qty": 0, "out_qty": 0, "balance_qty": 0, "valuation_rate": 0, "balance_value": 0 },
					"Compound": { "opening_qty": 0, "in_qty": 0, "out_qty": 0, "balance_qty": 0, "valuation_rate": 0, "balance_value": 0 },
					"Total": { "opening_qty": 0, "in_qty": 0, "out_qty": 0, "balance_qty": 0, "balance_value": 0 }
				};
			}

			// Get item_group - use BatCom groups (Batch, Master Batch, Compound)
			let item_group = row.item_group || '';

			// Only process BatCom item groups
			if (!['Batch', 'Master Batch', 'Compound'].includes(item_group)) {
				return;
			}

			// Add quantities
			const opening = parseFloat(row.opening_qty) || 0;
			const in_qty = parseFloat(row.in_qty) || 0;
			const out_qty = parseFloat(row.out_qty) || 0;
			const balance = parseFloat(row.balance_qty) || 0;
			const value = parseFloat(row.balance_value) || 0;
			const rate = parseFloat(row.valuation_rate) || 0;

			aggregated[common_code][item_group].opening_qty += opening;
			aggregated[common_code][item_group].in_qty += in_qty;
			aggregated[common_code][item_group].out_qty += out_qty;
			aggregated[common_code][item_group].balance_qty += balance;
			aggregated[common_code][item_group].balance_value += value;
			// Since we're aggregating by common_code, we use the rate from one of the items
			if (rate > 0) aggregated[common_code][item_group].valuation_rate = rate;

			aggregated[common_code].Total.opening_qty += opening;
			aggregated[common_code].Total.in_qty += in_qty;
			aggregated[common_code].Total.out_qty += out_qty;
			aggregated[common_code].Total.balance_qty += balance;
			aggregated[common_code].Total.balance_value += value;

			// Update grand totals
			grand_total[item_group].opening_qty += opening;
			grand_total[item_group].in_qty += in_qty;
			grand_total[item_group].out_qty += out_qty;
			grand_total[item_group].balance_qty += balance;
			grand_total[item_group].balance_value += value;

			grand_total.Total.opening_qty += opening;
			grand_total.Total.in_qty += in_qty;
			grand_total.Total.out_qty += out_qty;
			grand_total.Total.balance_qty += balance;
			grand_total.Total.balance_value += value;
		});

		// Convert to array and sort
		const result = Object.values(aggregated).sort((a, b) =>
			a.common_code.localeCompare(b.common_code)
		);

		return {
			data: result,
			grand_total: grand_total
		};
	}

	render_table_rows(data) {
		const $tbody = $('#table-body');
		$tbody.empty();

		// Add data rows
		data.forEach(row => {
			const rowHtml = `
				<tr data-common-code="${row.common_code}">
					<td class="item-code"><strong>${row.common_code}</strong></td>
					<!-- Mat -->
					<td class="qty-cell">${this.format_number(row.Batch.opening_qty)}</td>
					<td class="qty-cell in-qty">${this.format_number(row.Batch.in_qty)}</td>
					<td class="qty-cell out-qty">${this.format_number(row.Batch.out_qty)}</td>
					<td class="qty-cell balance-qty"><strong>${this.format_number(row.Batch.balance_qty)}</strong></td>
					<td class="qty-cell text-muted">${this.format_currency(row.Batch.valuation_rate)}</td>
					<td class="qty-cell valuation-cell"><strong>${this.format_currency(row.Batch.balance_value)}</strong></td>
					<!-- Products -->
					<td class="qty-cell">${this.format_number(row["Master Batch"].opening_qty)}</td>
					<td class="qty-cell in-qty">${this.format_number(row["Master Batch"].in_qty)}</td>
					<td class="qty-cell out-qty">${this.format_number(row["Master Batch"].out_qty)}</td>
					<td class="qty-cell balance-qty"><strong>${this.format_number(row["Master Batch"].balance_qty)}</strong></td>
					<td class="qty-cell text-muted">${this.format_currency(row["Master Batch"].valuation_rate)}</td>
					<td class="qty-cell valuation-cell"><strong>${this.format_currency(row["Master Batch"].balance_value)}</strong></td>
					<!-- Finished Product -->
					<td class="qty-cell">${this.format_number(row.Compound.opening_qty)}</td>
					<td class="qty-cell in-qty">${this.format_number(row.Compound.in_qty)}</td>
					<td class="qty-cell out-qty">${this.format_number(row.Compound.out_qty)}</td>
					<td class="qty-cell balance-qty"><strong>${this.format_number(row.Compound.balance_qty)}</strong></td>
					<td class="qty-cell text-muted">${this.format_currency(row.Compound.valuation_rate)}</td>
					<td class="qty-cell valuation-cell"><strong>${this.format_currency(row.Compound.balance_value)}</strong></td>
					<!-- Total -->
					<td class="qty-cell total-cell"><strong>${this.format_number(row.Total.balance_qty)}</strong></td>
					<td class="qty-cell total-value-cell"><strong>${this.format_currency(row.Total.balance_value)}</strong></td>
					<!-- Actions -->
					<td class="action-cell">
						<button class="btn btn-xs btn-primary btn-batches" data-common-code="${row.common_code}">
							<i class="fa fa-list"></i> Batches
						</button>
					</td>
				</tr>`;
			$tbody.append(rowHtml);
		});

		// Add grand total row
		const grandTotalHtml = `
			<tr class="grand-total-row">
				<td class="item-code"><strong>Grand Total</strong></td>
				<!-- Mat -->
				<td class="qty-cell"><strong>${this.format_number(this.grand_total.Batch.opening_qty)}</strong></td>
				<td class="qty-cell"><strong>${this.format_number(this.grand_total.Batch.in_qty)}</strong></td>
				<td class="qty-cell"><strong>${this.format_number(this.grand_total.Batch.out_qty)}</strong></td>
				<td class="qty-cell"><strong>${this.format_number(this.grand_total.Batch.balance_qty)}</strong></td>
				<td class="qty-cell"></td>
				<td class="qty-cell valuation-cell"><strong>${this.format_currency(this.grand_total.Batch.balance_value)}</strong></td>
				<!-- Products -->
				<td class="qty-cell"><strong>${this.format_number(this.grand_total["Master Batch"].opening_qty)}</strong></td>
				<td class="qty-cell"><strong>${this.format_number(this.grand_total["Master Batch"].in_qty)}</strong></td>
				<td class="qty-cell"><strong>${this.format_number(this.grand_total["Master Batch"].out_qty)}</strong></td>
				<td class="qty-cell"><strong>${this.format_number(this.grand_total["Master Batch"].balance_qty)}</strong></td>
				<td class="qty-cell"></td>
				<td class="qty-cell valuation-cell"><strong>${this.format_currency(this.grand_total["Master Batch"].balance_value)}</strong></td>
				<!-- Finished Product -->
				<td class="qty-cell"><strong>${this.format_number(this.grand_total.Compound.opening_qty)}</strong></td>
				<td class="qty-cell"><strong>${this.format_number(this.grand_total.Compound.in_qty)}</strong></td>
				<td class="qty-cell"><strong>${this.format_number(this.grand_total.Compound.out_qty)}</strong></td>
				<td class="qty-cell"><strong>${this.format_number(this.grand_total.Compound.balance_qty)}</strong></td>
				<td class="qty-cell"></td>
				<td class="qty-cell valuation-cell"><strong>${this.format_currency(this.grand_total.Compound.balance_value)}</strong></td>
				<!-- Total -->
				<td class="qty-cell total-cell"><strong>${this.format_number(this.grand_total.Total.balance_qty)}</strong></td>
				<td class="qty-cell total-value-cell"><strong>${this.format_currency(this.grand_total.Total.balance_value)}</strong></td>
				<td class="action-cell"></td>
			</tr>`;
		$tbody.append(grandTotalHtml);

		// Bind batch buttons after rendering
		this.bind_batch_buttons();

		// Update search results count
		$('#search-results').text(`Showing: ${data.length} items`);
		$('#total-items').text(data.length);
	}

	bind_search_and_sort() {
		const me = this;

		// Warehouse filter functionality - RE-AGGREGATES data with child warehouse expansion
		$('#warehouse-filter').on('change', function () {
			const selectedWarehouse = $(this).val();

			if (!selectedWarehouse) {
				// No warehouse selected - show all data
				me.current_warehouse = '';
				me.filtered_data = [...me.report_data];
				me.grand_total = JSON.parse(JSON.stringify(me.grand_total_original));

				// Clear search box when warehouse changes
				$('#common-code-filter').val('');
				$('.clear-search').hide();

				// Re-apply current sort
				me.sort_data(me.current_sort.column, me.current_sort.order, false);
				me.render_table_rows(me.filtered_data);
				return;
			}

			// Show loading indicator
			frappe.show_alert({
				message: __('Filtering by warehouse...'),
				indicator: 'blue'
			}, 2);

			// Call server to expand parent warehouse to child warehouses
			frappe.call({
				method: 'smart_screens.smart_screens.page.batcom_aggregated_report.batcom_aggregated_report.get_child_warehouses_api',
				args: { warehouse: selectedWarehouse },
				callback: (r) => {
					if (r.message && r.message.length > 0) {
						const warehouses = r.message;

						console.log(`Warehouse '${selectedWarehouse}' expanded to:`, warehouses);

						// Store expanded warehouses
						me.current_warehouse_list = warehouses;
						me.current_warehouse = selectedWarehouse;

						// Filter raw data by expanded warehouse list and re-aggregate
						const warehouse_data = me.raw_filtered_data.filter(row => {
							return warehouses.includes(row.warehouse);
						});

						if (warehouse_data.length === 0) {
							me.filtered_data = [];
							me.grand_total = {
								"Batch": { "opening_qty": 0, "in_qty": 0, "out_qty": 0, "balance_qty": 0 },
								"Master Batch": { "opening_qty": 0, "in_qty": 0, "out_qty": 0, "balance_qty": 0 },
								"Compound": { "opening_qty": 0, "in_qty": 0, "out_qty": 0, "balance_qty": 0 },
								"Total": { "opening_qty": 0, "in_qty": 0, "out_qty": 0, "balance_qty": 0 }
							};
						} else {
							// Re-aggregate the filtered data using BatCom extraction
							const aggregated = {};
							const grand_total = {
								"Batch": { "opening_qty": 0, "in_qty": 0, "out_qty": 0, "balance_qty": 0 },
								"Master Batch": { "opening_qty": 0, "in_qty": 0, "out_qty": 0, "balance_qty": 0 },
								"Compound": { "opening_qty": 0, "in_qty": 0, "out_qty": 0, "balance_qty": 0 },
								"Total": { "opening_qty": 0, "in_qty": 0, "out_qty": 0, "balance_qty": 0 }
							};

							warehouse_data.forEach(row => {
								const item = row.item || '';

								// Use BatCom-specific common code extraction
								const common_code = me.extract_batcom_common_code(item);

								if (!common_code) return;

								// Initialize aggregated row
								if (!aggregated[common_code]) {
									aggregated[common_code] = {
										common_code: common_code,
										warehouses: warehouses,
										"Batch": { "opening_qty": 0, "in_qty": 0, "out_qty": 0, "balance_qty": 0 },
										"Master Batch": { "opening_qty": 0, "in_qty": 0, "out_qty": 0, "balance_qty": 0 },
										"Compound": { "opening_qty": 0, "in_qty": 0, "out_qty": 0, "balance_qty": 0 },
										"Total": { "opening_qty": 0, "in_qty": 0, "out_qty": 0, "balance_qty": 0 }
									};
								}

								// Get item_group - use BatCom groups (Batch, Master Batch, Compound)
								let item_group = row.item_group || '';

								// Only process BatCom item groups
								if (!['Batch', 'Master Batch', 'Compound'].includes(item_group)) {
									return;
								}

								// Add quantities
								const opening = parseFloat(row.opening_qty) || 0;
								const in_qty = parseFloat(row.in_qty) || 0;
								const out_qty = parseFloat(row.out_qty) || 0;
								const balance = parseFloat(row.balance_qty) || 0;

								aggregated[common_code][item_group].opening_qty += opening;
								aggregated[common_code][item_group].in_qty += in_qty;
								aggregated[common_code][item_group].out_qty += out_qty;
								aggregated[common_code][item_group].balance_qty += balance;

								aggregated[common_code].Total.opening_qty += opening;
								aggregated[common_code].Total.in_qty += in_qty;
								aggregated[common_code].Total.out_qty += out_qty;
								aggregated[common_code].Total.balance_qty += balance;

								// Update grand totals
								grand_total[item_group].opening_qty += opening;
								grand_total[item_group].in_qty += in_qty;
								grand_total[item_group].out_qty += out_qty;
								grand_total[item_group].balance_qty += balance;

								grand_total.Total.opening_qty += opening;
								grand_total.Total.in_qty += in_qty;
								grand_total.Total.out_qty += out_qty;
								grand_total.Total.balance_qty += balance;
							});

							// Convert to array and sort
							me.filtered_data = Object.values(aggregated).sort((a, b) =>
								a.common_code.localeCompare(b.common_code)
							);
							me.grand_total = grand_total;
						}

						// Clear search box when warehouse changes
						$('#common-code-filter').val('');
						$('.clear-search').hide();

						// Re-apply current sort
						me.sort_data(me.current_sort.column, me.current_sort.order, false);
						me.render_table_rows(me.filtered_data);

						frappe.show_alert({
							message: __('Filtered by {0} ({1} child warehouses)', [selectedWarehouse, warehouses.length]),
							indicator: 'green'
						}, 3);
					} else {
						frappe.msgprint(__('No warehouses found for {0}', [selectedWarehouse]));
					}
				},
				error: (err) => {
					frappe.msgprint({
						title: __('Error'),
						indicator: 'red',
						message: __('Failed to expand warehouse')
					});
					console.error('Warehouse expansion error:', err);
				}
			});
		});

		// Search functionality - FIXED: Now correctly filters from current warehouse-filtered data
		$('#common-code-filter').on('input', function () {
			const searchText = $(this).val().toLowerCase().trim();

			// Get the base data after warehouse filter has been applied
			const selectedWarehouse = $('#warehouse-filter').val();
			const aggregated_result = me.aggregate_by_warehouse(selectedWarehouse);
			let baseData = aggregated_result.data;

			if (searchText === '') {
				// No search - show all data from current warehouse filter
				me.filtered_data = baseData;
				me.grand_total = aggregated_result.grand_total;
				$('.clear-search').hide();
			} else {
				// Apply search on top of warehouse-filtered data
				me.filtered_data = baseData.filter(row =>
					row.common_code.toLowerCase().includes(searchText)
				);
				// Keep the same grand total (warehouse-filtered)
				me.grand_total = aggregated_result.grand_total;
				$('.clear-search').show();
			}

			// Re-apply current sort
			me.sort_data(me.current_sort.column, me.current_sort.order, false);
			me.render_table_rows(me.filtered_data);
		});

		// Clear search button
		$('.clear-search').on('click', function () {
			$('#common-code-filter').val('').trigger('input');
		});

		// Sortable column headers
		$('.sortable-header').on('click', function () {
			const column = $(this).data('column');
			const dataType = $(this).data('type');

			// Toggle sort order
			let order = 'asc';
			if (me.current_sort.column === column && me.current_sort.order === 'asc') {
				order = 'desc';
			}

			me.sort_data(column, order, true);
		});
	}

	sort_data(column, order, updateUI = true) {
		const me = this;
		me.current_sort = { column, order };

		// Helper function to get nested property value
		const getNestedValue = (obj, path) => {
			return path.split('.').reduce((current, prop) => current?.[prop], obj);
		};

		// Sort the filtered data
		me.filtered_data.sort((a, b) => {
			let aVal = getNestedValue(a, column);
			let bVal = getNestedValue(b, column);

			// Handle null/undefined values
			if (aVal === null || aVal === undefined) aVal = 0;
			if (bVal === null || bVal === undefined) bVal = 0;

			// String comparison for common_code
			if (column === 'common_code') {
				aVal = String(aVal).toLowerCase();
				bVal = String(bVal).toLowerCase();
				return order === 'asc'
					? aVal.localeCompare(bVal)
					: bVal.localeCompare(aVal);
			}

			// Numeric comparison for quantities
			aVal = parseFloat(aVal) || 0;
			bVal = parseFloat(bVal) || 0;

			return order === 'asc' ? aVal - bVal : bVal - aVal;
		});

		if (updateUI) {
			// Update sort icons
			$('.sortable-header .sort-icon').removeClass('fa-sort-up fa-sort-down').addClass('fa-sort');
			$('.sortable-header').removeClass('sorted-asc sorted-desc');

			const $header = $(`.sortable-header[data-column="${column}"]`);
			$header.addClass(order === 'asc' ? 'sorted-asc' : 'sorted-desc');
			$header.find('.sort-icon')
				.removeClass('fa-sort')
				.addClass(order === 'asc' ? 'fa-sort-up' : 'fa-sort-down');

			// Re-render table
			me.render_table_rows(me.filtered_data);
		}
	}

	bind_batch_buttons() {
		const me = this;
		this.$container.find('.btn-batches').on('click', function () {
			const common_code = $(this).data('common-code');
			me.show_batch_details(common_code);
		});
	}

	show_batch_details(common_code) {
		const me = this;

		// Show loading indicator in frappe interface
		frappe.show_alert({
			message: __('Preparing batch data...'),
			indicator: 'blue'
		}, 3);

		// Also show a progress indicator
		frappe.show_progress(__('Loading Batches'), 30, 100, __('Fetching data from server...'));

		frappe.call({
			method: 'smart_screens.smart_screens.page.batcom_aggregated_report.batcom_aggregated_report.get_batch_details_by_common_code',
			args: {
				common_code: common_code,
				filters: this.current_filters,
				warehouse: this.current_warehouse || '' // Pass the selected warehouse filter
			},
			callback: (r) => {
				frappe.hide_progress();
				if (r.message && r.message.success) {
					me.render_batch_modal(r.message);
				} else {
					frappe.msgprint({
						title: __('Error'),
						indicator: 'red',
						message: r.message?.error || 'Failed to load batch details'
					});
				}
			},
			error: (err) => {
				frappe.hide_progress();
				frappe.msgprint({
					title: __('Error'),
					indicator: 'red',
					message: __('Failed to fetch batch details')
				});
			}
		});
	}

	export_to_excel() {
		const filter_values = this.current_filters;

		if (!filter_values) {
			frappe.msgprint(__('Please generate the report first before exporting.'));
			return;
		}

		frappe.show_alert({
			message: __('Preparing Excel export...'),
			indicator: 'blue'
		}, 3);

		const warehouse = this.current_warehouse || '';

		frappe.call({
			method: 'smart_screens.smart_screens.page.batcom_aggregated_report.batcom_aggregated_report.export_to_excel',
			args: {
				filters: filter_values,
				warehouse: warehouse
			},
			callback: (r) => {
				if (r.message && r.message.success) {
					// Download the file
					window.open(r.message.file_url, '_blank');
					frappe.show_alert({
						message: __('Excel file generated successfully!'),
						indicator: 'green'
					}, 5);
				} else {
					frappe.msgprint({
						title: __('Export Failed'),
						indicator: 'red',
						message: r.message?.error || 'Failed to generate Excel file'
					});
				}
			},
			error: (err) => {
				frappe.msgprint({
					title: __('Error'),
					indicator: 'red',
					message: __('An error occurred while exporting to Excel')
				});
				console.error('Export error:', err);
			}
		});
	}

	render_batch_modal(data) {
		const common_code = data.common_code;
		const batches = data.batches;
		const batch_count = data.batch_count || 0;
		const master_batch_count = data.master_batch_count || 0;
		const compound_count = data.compound_count || 0;

		// Create dialog with Export to Excel button
		const d = new frappe.ui.Dialog({
			title: `Batch Details for Item ${common_code}`,
			size: 'extra-large',
			fields: [
				{
					fieldtype: 'HTML',
					fieldname: 'batch_details_html'
				}
			],
			primary_action_label: __('Export to Excel'),
			primary_action: () => {
				this.export_batch_details_to_excel(common_code, batches);
			}
		});

		// Build tabbed interface HTML - Use BUTTON elements instead of anchor tags
		let html = `
			<div class="batch-details-container">
				<div class="batch-info">
					<span><strong>Common Code:</strong> ${common_code}</span>
					<span class="ml-3"><strong>Total Batches:</strong> ${data.total_batches}</span>
				</div>
				
				<div class="batch-tabs-wrapper">
					<button class="batch-tab-btn active" data-tab="batch-tab">Batch (${batch_count})</button>
					<button class="batch-tab-btn" data-tab="master-batch-tab">Master Batch (${master_batch_count})</button>
					<button class="batch-tab-btn" data-tab="compound-tab">Compound (${compound_count})</button>
				</div>
				
				<div class="tab-content">
					<div id="batch-tab" class="batch-tab-pane active">
						${this.build_batch_table(batches.Batch, 'Batch')}
					</div>
					<div id="master-batch-tab" class="batch-tab-pane">
						${this.build_batch_table(batches['Master Batch'], 'Master Batch')}
					</div>
					<div id="compound-tab" class="batch-tab-pane">
						${this.build_batch_table(batches.Compound, 'Compound')}
					</div>
				</div>
			</div>
		`;

		d.fields_dict.batch_details_html.$wrapper.html(html);

		// Bind tab click events to BUTTON elements
		d.fields_dict.batch_details_html.$wrapper.find('.batch-tab-btn').on('click', function (e) {
			e.preventDefault();
			e.stopPropagation();

			const targetTab = $(this).data('tab');

			// Remove active class from all tabs and tab content
			d.fields_dict.batch_details_html.$wrapper.find('.batch-tab-btn').removeClass('active');
			d.fields_dict.batch_details_html.$wrapper.find('.batch-tab-pane').removeClass('active');

			// Add active class to clicked tab and corresponding content
			$(this).addClass('active');
			d.fields_dict.batch_details_html.$wrapper.find(`#${targetTab}`).addClass('active');
		});

		d.show();
		this.bind_batch_table_features(d);
	}

	build_batch_table(batches, item_group) {
		if (!batches || batches.length === 0) {
			return `<div class="text-muted text-center p-4">No batches found for ${item_group}</div>`;
		}

		// Calculate totals for this item group
		let totals = {
			opening_qty: 0,
			in_qty: 0,
			out_qty: 0,
			balance_qty: 0
		};

		batches.forEach(batch => {
			totals.opening_qty += parseFloat(batch.opening_qty || 0);
			totals.in_qty += parseFloat(batch.in_qty || 0);
			totals.out_qty += parseFloat(batch.out_qty || 0);
			totals.balance_qty += parseFloat(batch.balance_qty || 0);
		});

		// Store batches for this item group for filtering/sorting
		const tableId = `batch-table-${item_group.toLowerCase().replace(/\s+/g, '-')}`;

		let html = `
			<div class="batch-table-controls mb-3">
				<div class="row">
					<div class="col-md-6">
						<input type="text" class="form-control batch-search-input" 
							placeholder="Search by Item, Batch, or Warehouse..." 
							data-table="${tableId}">
					</div>
					<div class="col-md-6 text-right">
						<span class="badge badge-info">Total: <span class="batch-count">${batches.length}</span> batches</span>
					</div>
				</div>
			</div>
			<div class="table-responsive mt-3">
				<table class="table table-bordered table-sm batch-table" id="${tableId}">
					<thead>
						<tr>
							<th class="sortable" data-column="item">Item Code <i class="fa fa-sort"></i></th>
							<th class="sortable" data-column="item_name">Item Name <i class="fa fa-sort"></i></th>
							<th class="sortable" data-column="batch">Batch <i class="fa fa-sort"></i></th>
							<th class="sortable" data-column="warehouse">Warehouse <i class="fa fa-sort"></i></th>
							<th class="sortable" data-column="opening_qty">Opening Qty <i class="fa fa-sort"></i></th>
							<th class="sortable" data-column="in_qty">In Qty <i class="fa fa-sort"></i></th>
							<th class="sortable" data-column="out_qty">Out Qty <i class="fa fa-sort"></i></th>
							<th class="sortable" data-column="balance_qty">Balance Qty <i class="fa fa-sort"></i></th>
							<th>UOM</th>
						</tr>
					</thead>
					<tbody>`;

		batches.forEach(batch => {
			// Escape HTML in data attributes to handle special characters
			const escapeHtml = (str) => {
				if (!str) return '';
				return String(str).replace(/[&<>"']/g, (match) => {
					const escapeMap = {
						'&': '&amp;',
						'<': '&lt;',
						'>': '&gt;',
						'"': '&quot;',
						"'": '&#39;'
					};
					return escapeMap[match];
				});
			};

			html += `
				<tr data-item="${escapeHtml(batch.item)}" 
				    data-batch="${escapeHtml(batch.batch)}" 
				    data-warehouse="${escapeHtml(batch.warehouse)}"
				    data-item-name="${escapeHtml(batch.item_name)}"
				    data-opening="${batch.opening_qty || 0}"
				    data-in="${batch.in_qty || 0}"
				    data-out="${batch.out_qty || 0}"
				    data-balance="${batch.balance_qty || 0}">
					<td>${batch.item || '-'}</td>
					<td>${batch.item_name || '-'}</td>
					<td>${batch.batch || '-'}</td>
						<td class="warehouse-cell">${batch.warehouse || '-'}</td>
					<td class="text-right">${this.format_number(batch.opening_qty)}</td>
					<td class="text-right text-success">${this.format_number(batch.in_qty)}</td>
					<td class="text-right text-danger">${this.format_number(batch.out_qty)}</td>
					<td class="text-right"><strong>${this.format_number(batch.balance_qty)}</strong></td>
					<td>${batch.uom || '-'}</td>
				</tr>`;
		});

		// Add total row
		html += `
				<tr class="batch-total-row">
					<td colspan="4" class="text-right"><strong>Total for ${item_group}:</strong></td>
					<td class="text-right"><strong>${this.format_number(totals.opening_qty)}</strong></td>
					<td class="text-right text-success"><strong>${this.format_number(totals.in_qty)}</strong></td>
					<td class="text-right text-danger"><strong>${this.format_number(totals.out_qty)}</strong></td>
					<td class="text-right"><strong>${this.format_number(totals.balance_qty)}</strong></td>
					<td></td>
				</tr>`;

		html += `
					</tbody>
				</table>
			</div>`;

		return html;
	}

	bind_batch_table_features(dialog) {
		const me = this;

		// Bind search functionality
		dialog.fields_dict.batch_details_html.$wrapper.find('.batch-search-input').on('input', function () {
			const searchText = $(this).val().toLowerCase();
			const tableId = $(this).data('table');
			const $table = $(`#${tableId}`);

			let visibleCount = 0;
			$table.find('tbody tr').each(function () {
				// Skip the total row - it should always be visible
				if ($(this).hasClass('batch-total-row')) {
					return; // Continue to next iteration
				}

				const item = $(this).data('item').toString().toLowerCase();
				const batch = $(this).data('batch').toString().toLowerCase();
				const warehouse = $(this).data('warehouse').toString().toLowerCase();

				if (item.includes(searchText) || batch.includes(searchText) || warehouse.includes(searchText)) {
					$(this).show();
					visibleCount++;
				} else {
					$(this).hide();
				}
			});

			// Update count badge (excluding the total row from count)
			$(this).closest('.batch-tab-pane').find('.batch-count').text(visibleCount);
		});

		// Bind sorting functionality
		dialog.fields_dict.batch_details_html.$wrapper.find('.sortable').on('click', function () {
			const column = $(this).data('column');
			const $table = $(this).closest('table');
			const $tbody = $table.find('tbody');

			// Get all rows except the total row
			const $dataRows = $tbody.find('tr:not(.batch-total-row)').toArray();
			const $totalRow = $tbody.find('tr.batch-total-row');

			// Determine sort order
			const isAscending = $(this).hasClass('sort-asc');
			const newOrder = isAscending ? 'desc' : 'asc';

			// Update sort icons
			$table.find('.sortable').removeClass('sort-asc sort-desc');
			$table.find('.sortable i').removeClass('fa-sort-up fa-sort-down').addClass('fa-sort');

			$(this).addClass(`sort-${newOrder}`);
			$(this).find('i').removeClass('fa-sort').addClass(newOrder === 'asc' ? 'fa-sort-up' : 'fa-sort-down');

			// Sort data rows only
			$dataRows.sort((a, b) => {
				let aVal, bVal;

				if (['opening_qty', 'in_qty', 'out_qty', 'balance_qty'].includes(column)) {
					// Numeric sort
					aVal = parseFloat($(a).data(column.replace('_qty', ''))) || 0;
					bVal = parseFloat($(b).data(column.replace('_qty', ''))) || 0;
				} else {
					// String sort
					aVal = $(a).data(column).toString().toLowerCase();
					bVal = $(b).data(column).toString().toLowerCase();
				}

				if (newOrder === 'asc') {
					return aVal > bVal ? 1 : aVal < bVal ? -1 : 0;
				} else {
					return aVal < bVal ? 1 : aVal > bVal ? -1 : 0;
				}
			});

			// Re-append sorted data rows, then append total row at the end
			$tbody.empty().append($dataRows).append($totalRow);
		});
	}

	format_currency(val) {
		if (val === undefined || val === null || isNaN(val)) return '₹0';
		return '₹' + this.format_number(val);
	}

	format_number(value) {
		const n = Number(value || 0);
		if (!isFinite(n)) return '0';
		const abs = Math.abs(n);

		if (abs >= 10000000) {
			return (n / 10000000).toFixed(2) + ' Cr';
		} else if (abs >= 100000) {
			return (n / 100000).toFixed(2) + ' L';
		} else if (abs >= 1000) {
			return (n / 1000).toFixed(2) + 'K';
		} else {
			return n.toFixed(2);
		}
	}

	show_loading() {
		this.page.main.find('.report-container').remove();
		this.$container = $('<div class="report-container">').appendTo(this.page.main);
		this.$container.html(`
			<div class="text-center" style="padding: 60px 20px;">
				<i class="fa fa-spinner fa-spin fa-3x text-muted"></i>
				<p class="text-muted mt-3" style="font-size: 16px;">Loading SPP Batch Balance data...</p>
			</div>
		`);
	}

	show_empty_state(message = null) {
		this.page.main.find('.report-container').remove();
		this.$container = $('<div class="report-container">').appendTo(this.page.main);
		this.$container.html(`
			<div class="empty-state" style="text-align: center; padding: 80px 20px;">
				<i class="fa fa-chart-bar fa-4x" style="color: #cbd5e1; margin-bottom: 20px;"></i>
				<h3 style="color: #64748b;">${message || 'No Report Generated Yet'}</h3>
				<p style="color: #94a3b8; font-size: 16px;">
					${message ? '' : 'Select your filters and click <strong>"Generate Report"</strong> to load data from SPP Batch Balance Report.'}
				</p>
			</div>
		`);
	}

	show_loading_with_progress() {
		this.page.main.find('.report-container').remove();
		this.$container = $('<div class="report-container progress-container">').appendTo(this.page.main);
		this.$container.html(`
			<div class="progress-wrapper">
				<div class="progress-header">
					<i class="fa fa-cog fa-spin fa-3x text-primary mb-3"></i>
					<h3 class="text-muted">Generating SPP Aggregated Report</h3>
					<p class="text-muted">Please wait while we process your data...</p>
				</div>
				
				<div class="progress-bar-container">
					<div class="progress" style="height: 30px;">
						<div class="progress-bar progress-bar-striped progress-bar-animated" 
							role="progressbar" 
							style="width: 0%;" 
							id="spp-progress-bar">
							<span class="progress-text">0%</span>
						</div>
					</div>
				</div>
				
				<div class="progress-steps mt-4">
					<div class="step-item" data-step="1">
						<div class="step-icon">
							<i class="fa fa-database"></i>
						</div>
						<div class="step-content">
							<div class="step-title">Fetching Data</div>
							<div class="step-message">Preparing...</div>
						</div>
					</div>
					<div class="step-item" data-step="2">
						<div class="step-icon">
							<i class="fa fa-filter"></i>
						</div>
						<div class="step-content">
							<div class="step-title">Batch Exclusion</div>
							<div class="step-message">Waiting...</div>
						</div>
					</div>
					<div class="step-item" data-step="3">
						<div class="step-icon">
							<i class="fa fa-tags"></i>
						</div>
						<div class="step-content">
							<div class="step-title">Item Filtering</div>
							<div class="step-message">Waiting...</div>
						</div>
					</div>
					<div class="step-item" data-step="4">
						<div class="step-icon">
							<i class="fa fa-chart-bar"></i>
						</div>
						<div class="step-content">
							<div class="step-title">Data Aggregation</div>
							<div class="step-message">Waiting...</div>
						</div>
					</div>
				</div>
			</div>
		`);
	}

	update_progress(data) {
		const { step, total, message, percent } = data;

		// Update progress bar
		const $progressBar = $('#spp-progress-bar');
		$progressBar.css('width', percent + '%');
		$progressBar.find('.progress-text').text(percent + '%');

		// Update current step
		const $currentStep = $(`.step-item[data-step="${step}"]`);
		$currentStep.addClass('active');
		$currentStep.find('.step-message').text(message);

		// Mark previous steps as completed
		for (let i = 1; i < step; i++) {
			$(`.step-item[data-step="${i}"]`).addClass('completed').removeClass('active');
		}

		// Add animation to progress bar color based on progress
		if (percent >= 100) {
			$progressBar.removeClass('progress-bar-animated').addClass('bg-success');
		} else if (percent >= 50) {
			$progressBar.addClass('bg-info');
		}
	}

	show_performance_summary(performance) {
		const total = performance.total_time || 0;

		// Show subtle toast notification with performance summary
		frappe.show_alert({
			message: `Report generated in ${total}s (Fetch: ${performance.spp_report_fetch}s, Process: ${(total - performance.spp_report_fetch).toFixed(2)}s)`,
			indicator: 'green'
		}, 5);

		// Log detailed performance to console for developers
		console.log('📊 SPP Aggregated Report Performance:', performance);
	}

	apply_styles() {
		if ($('#spp-aggregated-report-styles').length) return;

		$("<style id='spp-aggregated-report-styles'>")
			.prop("type", "text/css")
			.html(`
				.spp-aggregated-container {
					background: white;
					padding: 20px;
					border-radius: 8px;
					box-shadow: 0 2px 8px rgba(0,0,0,0.1);
				}
				.report-info {
					margin-bottom: 15px;
					padding: 10px;
					background: #f8f9fa;
					border-radius: 4px;
					display: flex;
					gap: 10px;
					color: #1e293b;
					font-weight: 500;
				}
				.report-stats {
					flex: 1;
				}
					.report-filters-section {
					display: flex;
					align-items: center;
					gap: 10px;
				}
				.warehouse-filter-wrapper {
					display: flex;
					align-items: center;
					gap: 5px;
				}
				.filter-label {
					font-size: 14px;
					color: #1e293b;
					font-weight: 500;
				}
				.warehouse-filter {
					padding: 5px 10px;
					font-size: 14px;
					border: 1px solid #cbd5e1;
					border-radius: 4px;
					color: #1e293b;
				}
				.report-search {
					display: flex;
					align-items: center;
					gap: 10px;
				}
				.search-box {
					position: relative;
					display: flex;
					align-items: center;
				}
				.search-icon {
					position: absolute;
					left: 10px;
					color: #94a3b8;
				}
				.common-code-search {
					padding-left: 30px;
					padding-right: 30px;
					border-radius: 4px;
					border: 1px solid #cbd5e1;
					font-size: 14px;
					height: 30px;
				}
				.clear-search {
					position: absolute;
					right: 10px;
					background: transparent;
					border: none;
					color: #94a3b8;
					cursor: pointer;
				}
				.search-results {
					color: #64748b;
					font-size: 14px;
				}
				.table-responsive {
					overflow-x: auto;
					margin-top: 15px;
				}
				.aggregated-table {
					width: 100%;
					font-size: 13px;
					border-collapse: collapse;
				}
				.aggregated-table th {
					padding: 12px 8px;
					text-align: center;
					font-weight: 600;
					border: 1px solid #dee2e6;
					white-space: nowrap;
				}
				.aggregated-table td {
					padding: 10px 8px;
					text-align: right;
					border: 1px solid #dee2e6;
					color: #1e293b !important;
					font-weight: 500;
				}
				.item-header, .action-header {
					background: #1e293b !important;
					color: white !important;
					text-align: center !important;
				}
				.batch-header {
					background: #1e40af !important;
					color: white !important;
				}
				.batch-subheader {
					background: #3b82f6 !important;
					color: white !important;
					font-size: 12px;
				}
				.master-batch-header {
					background: #c2410c !important;
					color: white !important;
				}
				.master-batch-subheader {
					background: #ea580c !important;
					color: white !important;
					font-size: 12px;
				}
				.compound-header {
					background: #15803d !important;
					color: white !important;
				}
				.compound-subheader {
					background: #16a34a !important;
					color: white !important;
					font-size: 12px;
				}
				.total-header {
					background: #0f172a !important;
					color: white !important;
				}
				.item-code {
					text-align: left !important;
					font-weight: 700 !important;
					background: #f8f9fa;
					font-family: 'Courier New', monospace;
					color: #0f172a !important;
					font-size: 14px !important;
				}
				.qty-cell {
					font-family: 'Courier New', monospace;
					font-size: 13px !important;
					color: #1e293b !important;
				}
				.in-qty { 
					color: #059669 !important;
					font-weight: 600 !important;
				}
				.out-qty { 
					color: #dc2626 !important;
					font-weight: 600 !important;
				}
				.balance-qty { 
					font-weight: 700 !important;
					color: #0f172a !important;
				}
				.total-cell {
					background: #f1f5f9;
					font-weight: 700 !important;
					font-size: 14px !important;
					color: #0f172a !important;
				}
				.action-cell {
					text-align: center !important;
					background: #f8f9fa;
				}
				.btn-batches {
					padding: 4px 12px;
					font-size: 12px;
					font-weight: 600;
				}
				.grand-total-row {
					background: #f8f9fa;
					border-top: 3px solid #1e293b;
				}
				.grand-total-row td {
					font-weight: 700 !important;
					background: #f8f9fa !important;
					color: #0f172a !important;
					font-size: 14px !important;
				}
				.aggregated-table tbody tr:hover {
					background: #f1f5f9;
				}
				.aggregated-table tbody tr:hover td {
					color: #0f172a !important;
				}
				.sortable-header {
					cursor: pointer;
					user-select: none;
					transition: background-color 0.2s;
				}
				.sortable-header:hover {
					background: #e2e8f0 !important;
				}
				.sort-icon {
					margin-left: 5px;
					font-size: 11px;
					color: #94a3b8;
				}
				.sorted-asc .sort-icon,
				.sorted-desc .sort-icon {
					color: #1e40af;
				}
				
				/* Batch Modal Styles */
				.batch-details-container {
					padding: 15px;
				}
				.batch-info {
					padding: 12px;
					background: #f8f9fa;
					border-radius: 4px;
					margin-bottom: 15px;
					color: #1e293b;
					font-weight: 500;
				}
				.batch-tabs-wrapper {
					display: flex;
					gap: 10px;
					margin-bottom: 20px;
				}
				.batch-tab-btn {
					color: #64748b;
					font-weight: 600;
					padding: 10px 20px;
					border: none;
					background: transparent;
					cursor: pointer;
				}
				.batch-tab-btn.active {
					color: #1e40af;
					border-bottom: 3px solid #1e40af;
					background: transparent;
				}
				.batch-tab-pane {
					display: none;
				}
				.batch-tab-pane.active {
					display: block;
				}
				.batch-table {
					font-size: 12px;
				}
				.batch-table th {
					background: #f1f5f9;
					color: #1e293b;
					font-weight: 600;
					padding: 10px 8px;
					border: 1px solid #dee2e6;
				}
				.batch-table td {
					padding: 8px;
					border: 1px solid #e2e8f0;
					color: #475569;
				}
				.batch-table tbody tr:hover {
					background: #f8fafc;
					cursor: pointer;
				}
					.batch-total-row {
					background: #f1f5f9 !important;
					border-top: 2px solid #1e293b !important;
					font-weight: 700;
				}
				.batch-total-row td {
					background: #f1f5f9 !important;
					color: #0f172a !important;
					font-weight: 700 !important;
					padding: 12px 8px !important;
				}
				.batch-total-row:hover {
					background: #e2e8f0 !important;
				}
				.batch-table-controls {
					margin-bottom: 15px;
				}
				.batch-search-input {
					width: 100%;
					padding: 8px 12px;
					border: 1px solid #cbd5e0;
					border-radius: 4px;
					font-size: 14px;
					transition: border-color 0.2s;
				}
				.batch-search-input:focus {
					outline: none;
					border-color: #1e40af;
					box-shadow: 0 0 0 3px rgba(30, 64, 175, 0.1);
				}
				.batch-search-input::placeholder {
					color: #94a3b8;
				}
				.badge-info {
					background: #1e40af;
					color: white;
					padding: 6px 12px;
					border-radius: 4px;
					font-size: 13px;
					font-weight: 600;
				}
				.sortable {
					cursor: pointer;
					user-select: none;
					transition: background-color 0.2s;
				}
				.sortable:hover {
					background: #e2e8f0 !important;
				}
				.sortable i {
					margin-left: 5px;
					font-size: 11px;
					color: #94a3b8;
				}
				.sortable.sort-asc i,
				.sortable.sort-desc i {
					color: #1e40af;
					}
				
				/* Progress Loading Styles */
				.progress-container {
					padding: 40px 20px;
				}
				.progress-wrapper {
					max-width: 800px;
					margin: 0 auto;
					text-align: center;
				}
				.progress-header {
					margin-bottom: 30px;
				}
				.progress-header h3 {
					color: #1e293b;
					font-size: 24px;
					margin-bottom: 10px;
				}
				.progress-header p {
					color: #64748b;
					font-size: 16px;
				}
				.progress-bar-container {
					margin-bottom: 40px;
				}
				.progress {
					background-color: #e2e8f0;
					border-radius: 8px;
					overflow: hidden;
					box-shadow: inset 0 1px 3px rgba(0,0,0,0.1);
				}
				.progress-bar {
					background: linear-gradient(90deg, #3b82f6 0%, #1e40af 100%);
					transition: width 0.3s ease;
					display: flex;
					align-items: center;
					justify-content: center;
					font-weight: 600;
					font-size: 14px;
				}
				.progress-text {
					color: white;
					text-shadow: 0 1px 2px rgba(0,0,0,0.2);
				}
				.progress-steps {
					display: grid;
					grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
					gap: 20px;
					margin-top: 30px;
				}
				.step-item {
					background: #f8f9fa;
					border-radius: 8px;
					padding: 20px;
					border: 2px solid #e2e8f0;
					transition: all 0.3s ease;
					text-align: left;
				}
				.step-item.active {
					border-color: #3b82f6;
					background: #eff6ff;
					box-shadow: 0 4px 12px rgba(59, 130, 246, 0.2);
					transform: translateY(-2px);
				}
				.step-item.completed {
					border-color: #10b981;
					background: #f0fdf4;
				}
				.step-item.active .step-icon i {
					color: #3b82f6;
					animation: pulse 1.5s infinite;
				}
				.step-item.completed .step-icon i {
					color: #10b981;
				}
				.step-icon {
					font-size: 24px;
					margin-bottom: 10px;
					color: #94a3b8;
				}
				.step-icon i {
					transition: color 0.3s ease;
				}
				.step-title {
					font-weight: 600;
					font-size: 14px;
					color: #1e293b;
					margin-bottom: 5px;
				}
				.step-message {
					font-size: 12px;
					color: #64748b;
					font-style: italic;
				}
				.step-item.active .step-message {
					color: #3b82f6;
					font-weight: 500;
				}
				.step-item.completed .step-message {
					color: #10b981;
				}
				.step-item.completed .step-icon::after {
					content: "✓";
					position: absolute;
					margin-left: -10px;
					margin-top: -5px;
					background: #10b981;
					color: white;
					border-radius: 50%;
					width: 20px;
					height: 20px;
					display: inline-flex;
					align-items: center;
					justify-content: center;
					font-size: 12px;
					font-weight: bold;
				}
				@keyframes pulse {
					0%, 100% {
						transform: scale(1);
						opacity: 1;
					}
					50% {
						transform: scale(1.1);
						opacity: 0.8;
					}
				}
			`)
			.appendTo("head");
	}

	export_batch_details_to_excel(common_code, batches) {
		frappe.show_alert({
			message: __('Preparing Excel export for batch details...'),
			indicator: 'blue'
		}, 3);

		frappe.call({
			method: 'smart_screens.smart_screens.page.batcom_aggregated_report.batcom_aggregated_report.export_batch_details_to_excel_api',
			args: {
				common_code: common_code,
				batches: batches,
				filters: this.current_filters,
				warehouse_filter: this.current_warehouse || ''
			},
			callback: (r) => {
				if (r.message && r.message.success) {
					// Download the file
					window.open(r.message.file_url, '_blank');
					frappe.show_alert({
						message: __('Batch details exported successfully!'),
						indicator: 'green'
					}, 5);
				} else {
					frappe.msgprint({
						title: __('Export Failed'),
						indicator: 'red',
						message: r.message?.error || 'Failed to generate Excel file'
					});
				}
			},
			error: (err) => {
				frappe.msgprint({
					title: __('Error'),
					indicator: 'red',
					message: __('An error occurred while exporting batch details')
				});
				console.error('Batch export error:', err);
			}
		});
	}
}
