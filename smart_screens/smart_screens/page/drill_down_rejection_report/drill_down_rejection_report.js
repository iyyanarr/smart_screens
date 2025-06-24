frappe.pages['drill-down-rejection-report'].on_page_load = function(wrapper) {
	var page = frappe.ui.make_app_page({
		parent: wrapper,
		title: '📊 Drill Down Rejection Report',
		single_column: true
	});

	// Create the main content area
	frappe.drill_down_rejection_report = new DrillDownRejectionReport(page);
}

class DrillDownRejectionReport {
	constructor(page) {
		this.page = page;
		this.parent = $(page.body);
		this.currentView = 'standard'; // 'standard' or 'pivot'
		
		this.page.set_secondary_action('Refresh', () => this.refresh(), 'fa fa-refresh');
		this.page.set_primary_action('Export', () => this.export_data(), 'fa fa-download');
		
		// Add toggle button for pivot view
		this.page.add_menu_item('📊 Pivot View (Defects as Columns)', () => this.toggle_pivot_view(), true);
		
		this.make_page();
	}

	make_page() {
		// Clear existing content
		this.parent.empty();
		
		// Create main container
		this.parent.html(`
			<div class="drill-down-container">
				<div class="page-header">
					<h2>🏭 Drill Down Rejection Report</h2>
					<p class="text-muted">Comprehensive analysis across SPP Inspection Entry, Inspection Entry, and related production data</p>
					<div class="view-toggle mt-2">
						<button class="btn btn-sm ${this.currentView === 'standard' ? 'btn-primary' : 'btn-outline-primary'}" onclick="frappe.drill_down_rejection_report.switch_view('standard')">
							📋 Standard View
						</button>
						<button class="btn btn-sm ${this.currentView === 'pivot' ? 'btn-primary' : 'btn-outline-primary'}" onclick="frappe.drill_down_rejection_report.switch_view('pivot')">
							📊 Pivot View (Defects as Columns)
						</button>
					</div>
				</div>
				
				<div class="filter-section card">
					<div class="card-header">
						<h5>📊 Filters</h5>
					</div>
					<div class="card-body">
						<div class="row">
							<div class="col-md-3">
								<label>From Date</label>
								<input type="date" class="form-control" id="from-date">
							</div>
							<div class="col-md-3">
								<label>To Date</label>
								<input type="date" class="form-control" id="to-date">
							</div>
							<div class="col-md-3">
								<label>Inspector</label>
								<select class="form-control" id="inspector-filter">
									<option value="">All Inspectors</option>
								</select>
							</div>
							<div class="col-md-3">
								<label>Item</label>
								<select class="form-control" id="item-filter">
									<option value="">All Items</option>
								</select>
							</div>
						</div>
						<div class="row mt-3">
							<div class="col-md-3">
								<label>Inspection Type</label>
								<select class="form-control" id="inspection-type-filter">
									<option value="">All Types</option>
									<option value="Final Visual Inspection" selected>Final Visual Inspection</option>
									<option value="Line Inspection">Line Inspection</option>
									<option value="Lot Inspection">Lot Inspection</option>
									<option value="Patrol Inspection">Patrol Inspection</option>
									<option value="Incoming Inspection">Incoming Inspection</option>
									<option value="Visual Inspection">Visual Inspection</option>
								</select>
							</div>
							<div class="col-md-3">
								<label>Lot Number</label>
								<input type="text" class="form-control" id="lot-filter" placeholder="Enter lot number...">
							</div>
							<div class="col-md-3">
								<label>Source Type</label>
								<select class="form-control" id="source-filter">
									<option value="">All Sources</option>
									<option value="SPP Inspection Entry">SPP Inspection Entry</option>
									<option value="Inspection Entry">Inspection Entry</option>
								</select>
							</div>
							<div class="col-md-3 d-flex align-items-end">
								<button class="btn btn-primary mr-2" onclick="frappe.drill_down_rejection_report.load_data()">
									<i class="fa fa-search"></i> Load Data
								</button>
								<button class="btn btn-secondary" onclick="frappe.drill_down_rejection_report.reset_filters()">
									<i class="fa fa-refresh"></i> Reset
								</button>
							</div>
						</div>
					</div>
				</div>

				<div class="results-section" id="results-section" style="display: none;">
					<div class="summary-cards row mb-4" id="summary-cards">
						<!-- Summary cards will be dynamically inserted here -->
					</div>
					
					<div class="data-table-section card">
						<div class="card-header d-flex justify-content-between align-items-center">
							<h5 id="table-title">📋 Detailed Results</h5>
							<span class="badge badge-info" id="record-count">0 records</span>
						</div>
						<div class="card-body">
							<div class="table-responsive" id="table-container">
								<!-- Table will be dynamically inserted here -->
							</div>
						</div>
					</div>
				</div>

				<div class="loading-section text-center" id="loading-section" style="display: none;">
					<div class="spinner-border text-primary" role="status">
						<span class="sr-only">Loading...</span>
					</div>
					<p class="mt-3">Loading rejection data...</p>
				</div>

				<div class="no-data-section text-center" id="no-data-section" style="display: none;">
					<i class="fa fa-search fa-3x text-muted mb-3"></i>
					<h4>No Data Found</h4>
					<p class="text-muted">Please adjust your filters and try again.</p>
				</div>
			</div>
		`);

		// Set default dates
		this.set_default_dates();
		
		// Load filter options
		this.load_filter_options();
	}

	switch_view(view) {
		this.currentView = view;
		this.make_page();
		
		// If we have current data, redisplay it in the new view
		if (this.currentData) {
			this.display_results(this.currentData);
		}
	}

	toggle_pivot_view() {
		if (this.currentView === 'standard') {
			this.switch_view('pivot');
		} else {
			this.switch_view('standard');
		}
	}

	set_default_dates() {
		const today = new Date();
		const thirtyDaysAgo = new Date(today.getTime() - (30 * 24 * 60 * 60 * 1000));
		
		document.getElementById('to-date').value = today.toISOString().split('T')[0];
		document.getElementById('from-date').value = thirtyDaysAgo.toISOString().split('T')[0];
	}

	load_filter_options() {
		// Load filter options from API
		frappe.call({
			method: 'smart_screens.smart_screens.page.drill_down_rejection_report.drill_down_rejection_report.get_filter_options',
			callback: (response) => {
				if (response.message && response.message.status === 'success') {
					this.populate_filter_dropdowns(response.message);
				}
			}
		});
	}

	populate_filter_dropdowns(data) {
		// Populate inspector dropdown
		const inspectorSelect = document.getElementById('inspector-filter');
		inspectorSelect.innerHTML = '<option value="">All Inspectors</option>';
		data.inspectors.forEach(inspector => {
			inspectorSelect.innerHTML += `<option value="${inspector.value}">${inspector.label}</option>`;
		});

		// Populate item dropdown
		const itemSelect = document.getElementById('item-filter');
		itemSelect.innerHTML = '<option value="">All Items</option>';
		data.items.forEach(item => {
			itemSelect.innerHTML += `<option value="${item.value}">${item.label}</option>`;
		});

		// Populate inspection type dropdown (already has static options, but we can update from DB)
		const typeSelect = document.getElementById('inspection-type-filter');
		if (data.inspection_types.length > 0) {
			typeSelect.innerHTML = '<option value="">All Types</option>';
			data.inspection_types.forEach(type => {
				typeSelect.innerHTML += `<option value="${type.value}"${type.value === 'Final Visual Inspection' ? ' selected' : ''}>${type.label}</option>`;
			});
		}
	}

	get_filters() {
		return {
			from_date: document.getElementById('from-date').value,
			to_date: document.getElementById('to-date').value,
			inspector: document.getElementById('inspector-filter').value,
			item_code: document.getElementById('item-filter').value,
			inspection_type: document.getElementById('inspection-type-filter').value,
			lot_no: document.getElementById('lot-filter').value,
			source_type: document.getElementById('source-filter').value
		};
	}

	load_data() {
		const filters = this.get_filters();
		
		// Show loading state
		document.getElementById('loading-section').style.display = 'block';
		document.getElementById('results-section').style.display = 'none';
		document.getElementById('no-data-section').style.display = 'none';

		// Choose API method based on current view
		const method = this.currentView === 'pivot' 
			? 'smart_screens.smart_screens.page.drill_down_rejection_report.drill_down_rejection_report.get_defect_pivot_report_simple'
			: 'smart_screens.smart_screens.page.drill_down_rejection_report.drill_down_rejection_report.get_rejection_data';

		// Make API call
		frappe.call({
			method: method,
			args: {
				filters: filters
			},
			callback: (response) => {
				document.getElementById('loading-section').style.display = 'none';
				
				if (response.message && response.message.status === 'success') {
					if (response.message.data && response.message.data.length > 0) {
						this.display_results(response.message);
					} else {
						document.getElementById('no-data-section').style.display = 'block';
					}
				} else {
					frappe.msgprint({
						title: 'Error',
						message: response.message?.message || 'Failed to load data',
						indicator: 'red'
					});
				}
			},
			error: (error) => {
				document.getElementById('loading-section').style.display = 'none';
				frappe.msgprint({
					title: 'Network Error',
					message: 'Failed to fetch data from server',
					indicator: 'red'
				});
			}
		});
	}

	display_results(result) {
		// Update record count
		document.getElementById('record-count').textContent = `${result.data.length} records`;
		
		// Show results section
		document.getElementById('results-section').style.display = 'block';
		
		// Display appropriate view
		if (this.currentView === 'pivot') {
			this.display_pivot_view(result);
		} else {
			this.display_standard_view(result);
		}
		
		// Store current data
		this.currentData = result;
	}

	display_standard_view(result) {
		// Update table title
		document.getElementById('table-title').textContent = '📋 Detailed Results';
		
		// Display standard summary cards
		this.display_standard_summary_cards(result);
		
		// Display standard data table
		this.display_standard_data_table(result.data);
	}

	display_pivot_view(result) {
		// Update table title
		document.getElementById('table-title').textContent = '📊 Pivot View - Defects as Columns';
		
		// Display pivot summary cards
		this.display_pivot_summary_cards(result);
		
		// Display pivot data table
		this.display_pivot_data_table(result.data, result.defect_types);
	}

	display_standard_summary_cards(result) {
		const data = result.data;
		const sublotSummary = result.sublot_summary || {};
		
		const totalInspected = data.reduce((sum, row) => sum + (parseFloat(row.inspected_qty) || 0), 0);
		const totalRejected = data.reduce((sum, row) => sum + (parseFloat(row.rejected_qty) || 0), 0);
		const overallRejectionRate = totalInspected > 0 ? (totalRejected / totalInspected * 100).toFixed(2) : 0;
		
		const uniqueSublots = Object.keys(sublotSummary).length || new Set(data.map(row => `${row.main_lot}-${row.sublot_number}`)).size;
		const uniqueProducts = new Set(data.map(row => row.item_code)).size;
		
		let perfectSublots = 0;
		let criticalSublots = 0;
		
		if (sublotSummary && Object.keys(sublotSummary).length > 0) {
			Object.values(sublotSummary).forEach(sublot => {
				if (sublot.overall_rejection_percentage === 0) perfectSublots++;
				if (sublot.overall_rejection_percentage > 10) criticalSublots++;
			});
		} else {
			// Calculate from data directly
			const sublotRates = {};
			data.forEach(row => {
				const key = `${row.main_lot}-${row.sublot_number}`;
				if (!sublotRates[key]) {
					sublotRates[key] = { rejected: 0, inspected: 0 };
				}
				sublotRates[key].rejected += parseFloat(row.rejected_qty) || 0;
				sublotRates[key].inspected += parseFloat(row.inspected_qty) || 0;
			});
			
			Object.values(sublotRates).forEach(sublot => {
				const rate = sublot.inspected > 0 ? (sublot.rejected / sublot.inspected * 100) : 0;
				if (rate === 0) perfectSublots++;
				if (rate > 10) criticalSublots++;
			});
		}

		document.getElementById('summary-cards').innerHTML = `
			<div class="col-md-3">
				<div class="card bg-primary text-white">
					<div class="card-body text-center">
						<h4>${uniqueSublots}</h4>
						<p>📦 Unique Sublots</p>
					</div>
				</div>
			</div>
			<div class="col-md-3">
				<div class="card bg-info text-white">
					<div class="card-body text-center">
						<h4>${uniqueProducts}</h4>
						<p>🔧 Products</p>
					</div>
				</div>
			</div>
			<div class="col-md-3">
				<div class="card bg-success text-white">
					<div class="card-body text-center">
						<h4>${perfectSublots}</h4>
						<p>✅ Perfect Sublots (0% rejection)</p>
					</div>
				</div>
			</div>
			<div class="col-md-3">
				<div class="card bg-danger text-white">
					<div class="card-body text-center">
						<h4>${criticalSublots}</h4>
						<p>⚠️ Critical Sublots (>10% rejection)</p>
					</div>
				</div>
			</div>
			<div class="col-md-6">
				<div class="card bg-warning text-white">
					<div class="card-body text-center">
						<h4>${totalInspected.toLocaleString()}</h4>
						<p>📊 Total Inspected Quantity</p>
					</div>
				</div>
			</div>
			<div class="col-md-6">
				<div class="card bg-dark text-white">
					<div class="card-body text-center">
						<h4>${overallRejectionRate}%</h4>
						<p>📈 Overall Rejection Rate</p>
					</div>
				</div>
			</div>
		`;
	}

	display_pivot_summary_cards(result) {
		const data = result.data;
		const defectTypes = result.defect_types || [];
		
		const totalRejected = data.reduce((sum, row) => sum + (row.total_rejected || 0), 0);
		const totalInspected = data.reduce((sum, row) => sum + (parseFloat(row.inspected_qty) || 0), 0);
		const overallRejectionRate = totalInspected > 0 ? (totalRejected / totalInspected * 100).toFixed(2) : 0;
		
		const uniqueProducts = new Set(data.map(row => row.item_code)).size;
		const uniqueLots = new Set(data.map(row => row.main_lot)).size;

		document.getElementById('summary-cards').innerHTML = `
			<div class="col-md-3">
				<div class="card bg-primary text-white">
					<div class="card-body text-center">
						<h4>${defectTypes.length}</h4>
						<p>🔍 Defect Types</p>
					</div>
				</div>
			</div>
			<div class="col-md-3">
				<div class="card bg-info text-white">
					<div class="card-body text-center">
						<h4>${uniqueProducts}</h4>
						<p>🔧 Products</p>
					</div>
				</div>
			</div>
			<div class="col-md-3">
				<div class="card bg-success text-white">
					<div class="card-body text-center">
						<h4>${uniqueLots}</h4>
						<p>📦 Main Lots</p>
					</div>
				</div>
			</div>
			<div class="col-md-3">
				<div class="card bg-warning text-white">
					<div class="card-body text-center">
						<h4>${totalRejected.toLocaleString()}</h4>
						<p>❌ Total Rejected</p>
					</div>
				</div>
			</div>
		`;
	}

	display_standard_data_table(data) {
		const tableContainer = document.getElementById('table-container');
		
		tableContainer.innerHTML = `
			<table class="table table-striped table-hover" id="results-table">
				<thead class="thead-dark">
					<tr>
						<th>Source</th>
						<th>Product</th>
						<th>Main Lot</th>
						<th>Sublot</th>
						<th>Inspector</th>
						<th>Type</th>
						<th>Inspected Qty</th>
						<th>Rejected Qty</th>
						<th>Rejection %</th>
						<th>Quality Status</th>
						<th>Defect Details</th>
					</tr>
				</thead>
				<tbody id="results-tbody">
					${this.generate_standard_table_rows(data)}
				</tbody>
			</table>
		`;
	}

	display_pivot_data_table(data, defectTypes) {
		const tableContainer = document.getElementById('table-container');
		
		// Create headers for defect types
		const defectHeaders = defectTypes.map(defect => {
			const cleanName = defect.replace(/[^a-zA-Z0-9]/g, ' ').trim();
			return `<th class="defect-col" title="${defect}">${cleanName}</th>`;
		}).join('');
		
		tableContainer.innerHTML = `
			<table class="table table-striped table-hover table-sm" id="pivot-table">
				<thead class="thead-dark">
					<tr>
						<th>Product</th>
						<th>Main Lot</th>
						<th>Sublot</th>
						<th>Inspector</th>
						<th>Source</th>
						<th>Inspected Qty</th>
						<th>Total Rejected</th>
						${defectHeaders}
					</tr>
				</thead>
				<tbody id="pivot-tbody">
					${this.generate_pivot_table_rows(data, defectTypes)}
				</tbody>
			</table>
		`;
	}

	generate_standard_table_rows(data) {
		return data.map(row => {
			const rejectionRate = parseFloat(row.rejection_percentage) || 0;
			let rowClass = '';
			let qualityBadgeClass = '';
			
			if (rejectionRate > 10) {
				rowClass = 'table-danger';
				qualityBadgeClass = 'badge-danger';
			} else if (rejectionRate > 5) {
				rowClass = 'table-warning';
				qualityBadgeClass = 'badge-warning';
			} else if (rejectionRate > 0) {
				rowClass = 'table-info';
				qualityBadgeClass = 'badge-info';
			} else {
				rowClass = 'table-success';
				qualityBadgeClass = 'badge-success';
			}
			
			const sourceBadge = row.source_type === 'SPP Inspection Entry' ? 'badge-primary' : 'badge-success';
			
			// Format defect details
			let defectDetails = '-';
			if (row.defect_details && row.defect_details.trim()) {
				const defects = row.defect_details.split(';').map(d => d.trim()).filter(d => d);
				if (defects.length > 0) {
					defectDetails = defects.map(defect => {
						const [type, qty] = defect.split(':');
						return `<span class="badge badge-warning mr-1" title="${type}">${type}: ${qty}</span>`;
					}).join('<br/>');
				}
			}
			
			return `
				<tr class="${rowClass}">
					<td><span class="badge ${sourceBadge}">${row.source_type.replace(' Entry', '')}</span></td>
					<td><strong>${row.item_code || '-'}</strong></td>
					<td>${row.main_lot || '-'}</td>
					<td><span class="badge badge-dark">${row.sublot_number || '1'}</span></td>
					<td>${row.inspector_code || '-'}</td>
					<td><small>${row.inspection_type || '-'}</small></td>
					<td>${(row.inspected_qty || 0).toLocaleString()}</td>
					<td>${(row.rejected_qty || 0).toLocaleString()}</td>
					<td><strong>${rejectionRate.toFixed(2)}%</strong></td>
					<td><span class="badge ${qualityBadgeClass}">${row.quality_status || 'Unknown'}</span></td>
					<td><small>${defectDetails}</small></td>
				</tr>
			`;
		}).join('');
	}

	generate_pivot_table_rows(data, defectTypes) {
		return data.map(row => {
			const totalRejected = row.total_rejected || 0;
			const inspectedQty = row.inspected_qty || 0;
			const rejectionRate = inspectedQty > 0 ? (totalRejected / inspectedQty * 100).toFixed(2) : 0;
			
			let rowClass = '';
			if (rejectionRate > 10) {
				rowClass = 'table-danger';
			} else if (rejectionRate > 5) {
				rowClass = 'table-warning';
			} else if (rejectionRate > 0) {
				rowClass = 'table-info';
			} else {
				rowClass = 'table-success';
			}
			
			const sourceBadge = row.source_type === 'SPP Inspection Entry' ? 'badge-primary' : 'badge-success';
			
			// Generate defect columns
			const defectCols = defectTypes.map(defectType => {
				const cleanName = this.clean_defect_name_js(defectType);
				const value = row[cleanName] || 0;
				const cellClass = value > 0 ? 'font-weight-bold text-danger' : 'text-muted';
				return `<td class="${cellClass}">${value}</td>`;
			}).join('');
			
			return `
				<tr class="${rowClass}">
					<td><strong>${row.item_code || '-'}</strong></td>
					<td>${row.main_lot || '-'}</td>
					<td><span class="badge badge-dark">${row.sublot_number || '1'}</span></td>
					<td>${row.inspector_code || '-'}</td>
					<td><span class="badge ${sourceBadge} badge-sm">${row.source_type?.replace(' Entry', '') || '-'}</span></td>
					<td>${inspectedQty.toLocaleString()}</td>
					<td class="font-weight-bold">${totalRejected.toLocaleString()}</td>
					${defectCols}
				</tr>
			`;
		}).join('');
	}

	clean_defect_name_js(defectType) {
		if (!defectType) return "unknown";
		
		// This should match the Python clean_defect_name function
		let cleaned = defectType.toLowerCase();
		cleaned = cleaned.replace(/[^a-zA-Z0-9]/g, '_');
		cleaned = cleaned.replace(/_+/g, '_');
		cleaned = cleaned.replace(/^_+|_+$/g, '');
		
		return cleaned || "unknown";
	}

	refresh() {
		this.load_data();
	}

	reset_filters() {
		document.getElementById('from-date').value = '';
		document.getElementById('to-date').value = '';
		document.getElementById('inspector-filter').value = '';
		document.getElementById('item-filter').value = '';
		document.getElementById('inspection-type-filter').value = 'Final Visual Inspection';
		document.getElementById('lot-filter').value = '';
		document.getElementById('source-filter').value = '';
		
		this.set_default_dates();
		
		// Hide results
		document.getElementById('results-section').style.display = 'none';
		document.getElementById('no-data-section').style.display = 'none';
	}

	export_data() {
		if (!this.currentData || !this.currentData.data) {
			frappe.msgprint('No data to export');
			return;
		}
		
		frappe.msgprint('Export functionality will be implemented in Phase 2');
	}
}
