frappe.pages['mould-performance-report'].on_page_load = function(wrapper) {
	var page = frappe.ui.make_app_page({
		parent: wrapper,
		title: 'Mould Performance Report',
		single_column: true
	});

	// Initialize page
	new MouldPerformanceReport(page);
}

class MouldPerformanceReport {
	constructor(page) {
		this.page = page;
		this.make();
	}

	make() {
		this.make_filters();
		this.make_body();
		this.load_data();
	}

	make_filters() {
		this.page.add_field({
			label: 'Mould Reference',
			fieldtype: 'Link',
			fieldname: 'mould_ref',
			options: 'Mould Specification',
			change: () => this.load_data()
		});
	}

	make_body() {
		this.$body = $(this.page.body);
		this.$report_area = $('<div class="report-table"></div>').appendTo(this.$body);
	}

	load_data() {
		let filters = this.get_filters();
		
		frappe.call({
			method: 'smart_screens.smart_screens.page.mould_performance_report.mould_performance_report.get_mould_performance_data',
			args: {
				filters: filters
			},
			callback: (r) => {
				if (r.message && r.message.status === 'success') {
					this.render_data(r.message);
				} else {
					frappe.msgprint(__('Error loading data'));
				}
			}
		});
	}

	get_filters() {
		return {
			mould_ref: this.page.fields_dict.mould_ref.get_value()
		};
	}

	render_data(data) {
		this.$report_area.empty();

		if (!data.report_data || !data.report_data.length) {
			this.$report_area.html('<div class="text-muted">No data found</div>');
			return;
		}

		// Create table header
		const monthNames = moment.monthsShort();
		const headerHTML = `
			<thead>
				<tr>
					<th>Mould Ref</th>
					<th>Part No</th>
					<th>Historical Lifts<br><small>(Pre-${data.current_year})</small></th>
					${monthNames.map(month => `<th>${month}</th>`).join('')}
					<th>Total Lifts</th>
				</tr>
			</thead>
		`;

		// Create table rows
		const rowsHTML = data.report_data.map(row => `
			<tr>
				<td>${row.mould_ref || ''}</td>
				<td>${row.part_no || ''}</td>
				<td class="text-right">${frappe.format(row.historical_lifts, { fieldtype: 'Int' })}</td>
				${row.monthly_lifts.map(lifts => 
					`<td class="text-right">${frappe.format(lifts, { fieldtype: 'Int' })}</td>`
				).join('')}
				<td class="text-right"><strong>${frappe.format(row.total_lifts, { fieldtype: 'Int' })}</strong></td>
			</tr>
		`).join('');

		// Create table
		const tableHTML = `
			<div class="table-responsive">
				<table class="table table-bordered table-hover">
					${headerHTML}
					<tbody>
						${rowsHTML}
					</tbody>
				</table>
			</div>
		`;

		this.$report_area.html(tableHTML);

		// Add conditional formatting for better visualization
		this.$report_area.find('td.text-right').each(function() {
			const value = parseInt($(this).text().replace(/,/g, ''));
			if (value > 0) {
				$(this).addClass('table-success');
			}
		});
	}
}