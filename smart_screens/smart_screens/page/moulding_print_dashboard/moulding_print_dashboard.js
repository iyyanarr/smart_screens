frappe.pages['moulding-print-dashboard'].on_page_load = function(wrapper) {
	var page = frappe.ui.make_app_page({
		parent: wrapper,
		title: 'Moulding Print Dashboard',
		single_column: true
	});
	
	// Initialize page
	new MouldingPrintDashboard(page);
}

class MouldingPrintDashboard {
	constructor(page) {
		this.page = page;
		this.make_form();
		this.add_action_buttons();
		this.job_cards = [];
		this.selected_job_cards = [];
	}
	
	make_form() {
		this.form = new frappe.ui.FieldGroup({
			fields: [
				{
					fieldtype: 'Section Break',
					label: 'Production Lot Selection'
				},
				{
					label: 'Production Lot Number',
					fieldtype: 'Data',
					fieldname: 'batch_code',
					reqd: 1,
					placeholder: 'Enter Production Lot Number (e.g. 25F25X01)',
					change: () => this.load_job_cards()
				},
				{
					fieldtype: 'Column Break'
				},
				{
					label: 'Number of Copies',
					fieldtype: 'Int',
					fieldname: 'copies',
					default: 2,
					reqd: 1
				},
				{
					fieldtype: 'Section Break',
					label: 'Moulding Job Cards'
				},
				{
					fieldtype: 'HTML',
					fieldname: 'job_cards_html'
				}
			],
			body: this.page.body
		});
		
		this.form.make();
		this.filters = this.form.fields_dict;
		
		// Load job cards if production lot is already set
		this.load_job_cards();
	}
	
	add_action_buttons() {
		this.page.add_inner_button(__('Print Selected'), () => this.print_selected_job_cards(), 'fa fa-print');
		this.page.add_inner_button(__('Select All'), () => this.select_all_job_cards(), 'fa fa-check-square-o');
		this.page.add_inner_button(__('Clear Selection'), () => this.clear_selection(), 'fa fa-square-o');
		this.page.add_inner_button(__('Refresh'), () => this.load_job_cards(), 'fa fa-refresh');
	}
	
	async load_job_cards() {
		const batch_code = this.filters.batch_code.get_value();
		
		if (!batch_code) {
			this.render_job_cards([]);
			return;
		}
		
		// Show loading message
		this.filters.job_cards_html.$wrapper.html('<div class="text-muted">Loading job cards...</div>');
		
		try {
			const response = await frappe.call({
				method: 'smart_screens.smart_screens.page.moulding_print_dashboard.moulding_print_dashboard.get_moulding_job_cards',
				args: { batch_code: batch_code }
			});
			
			this.job_cards = response.message || [];
			this.selected_job_cards = [...this.job_cards.map(jc => jc.name)]; // Select all by default
			this.render_job_cards(this.job_cards);
			
		} catch (error) {
			frappe.msgprint(__('Error loading job cards: {0}', [error.message]));
			this.render_job_cards([]);
		}
	}
	
	render_job_cards(job_cards) {
		if (!job_cards || job_cards.length === 0) {
			this.filters.job_cards_html.$wrapper.html(
				'<div class="alert alert-info">No moulding job cards found for the selected work order.</div>'
			);
			return;
		}
		
		const html = `
			<div class="job-cards-container">
				<div class="job-cards-header">
					<h4>Found ${job_cards.length} Moulding Job Cards</h4>
				</div>
				<div class="table-responsive">
					<table class="table table-bordered job-cards-table">
						<thead>
							<tr>
								<th style="width: 30px;">
									<input type="checkbox" id="select-all-checkbox" 
										${this.selected_job_cards.length === job_cards.length ? 'checked' : ''}>
								</th>
								<th>Job Card</th>
								<th>Batch Code</th>
								<th>Production Item</th>
								<th>BOM No</th>
								<th>Work Order</th>
								<th>Workstation</th>
								<th>Quantity</th>
								<th>Status</th>
							</tr>
						</thead>
						<tbody>
							${job_cards.map(jc => `
								<tr>
									<td>
										<input type="checkbox" class="job-card-checkbox" 
											   data-job-card="${jc.name}" 
											   ${this.selected_job_cards.includes(jc.name) ? 'checked' : ''}>
									</td>
									<td><strong>${jc.name}</strong></td>
									<td><strong>${jc.batch_code || ''}</strong></td>
									<td>
										<div>${jc.production_item}</div>
										<div class="text-muted small">${jc.item_name || ''}</div>
									</td>
									<td>${jc.bom_no || ''}</td>
									<td>${jc.work_order || ''}</td>
									<td>${jc.workstation || ''}</td>
									<td>${jc.for_quantity || 0}</td>
									<td><span class="status-label status-${jc.status}">${jc.status}</span></td>
								</tr>
							`).join('')}
						</tbody>
					</table>
				</div>
				<div class="print-actions">
					<div class="copies-selector">
						<label for="copies-selector">Print copies:</label>
						<input type="number" id="copies-selector" class="form-control" value="${this.filters.copies.get_value()}" min="1" max="10">
					</div>
					<button class="btn btn-primary btn-print-all" onclick="cur_page.page.moulding_dashboard.print_selected_job_cards()">
						<i class="fa fa-print"></i> Print Selected Job Cards (${this.selected_job_cards.length})
					</button>
					<div class="print-help">
						Using format: "Job Card For Moulding 100*100"
					</div>
				</div>
			</div>
		`;
		
		this.filters.job_cards_html.$wrapper.html(html);
		
		// Store reference to this instance for button click
		cur_page.page.moulding_dashboard = this;
		
		// Add event handlers
		$('#select-all-checkbox').on('change', (e) => {
			if (e.target.checked) {
				this.select_all_job_cards();
			} else {
				this.clear_selection();
			}
		});
		
		$('.job-card-checkbox').on('change', (e) => {
			const job_card = $(e.target).data('job-card');
			if (e.target.checked) {
				if (!this.selected_job_cards.includes(job_card)) {
					this.selected_job_cards.push(job_card);
				}
			} else {
				this.selected_job_cards = this.selected_job_cards.filter(jc => jc !== job_card);
			}
			
			// Update select all checkbox state
			$('#select-all-checkbox').prop('checked', this.selected_job_cards.length === this.job_cards.length);
			
			// Update button text
			$('.btn-print-all').html(`<i class="fa fa-print"></i> Print Selected Job Cards (${this.selected_job_cards.length})`);
		});
		
		// Update copies value when changed
		$('#copies-selector').on('change', (e) => {
			this.filters.copies.set_value(parseInt(e.target.value) || 2);
		});
	}
	
	select_all_job_cards() {
		this.selected_job_cards = [...this.job_cards.map(jc => jc.name)];
		$('.job-card-checkbox').prop('checked', true);
		$('#select-all-checkbox').prop('checked', true);
		// Update button text
		$('.btn-print-all').html(`<i class="fa fa-print"></i> Print Selected Job Cards (${this.selected_job_cards.length})`);
	}
	
	clear_selection() {
		this.selected_job_cards = [];
		$('.job-card-checkbox').prop('checked', false);
		$('#select-all-checkbox').prop('checked', false);
		// Update button text
		$('.btn-print-all').html(`<i class="fa fa-print"></i> Print Selected Job Cards (0)`);
	}
	
	async print_selected_job_cards() {
		if (this.selected_job_cards.length === 0) {
			frappe.msgprint(__('Please select at least one job card to print.'));
			return;
		}
		
		const copies = this.filters.copies.get_value() || 2;
		
		// Show confirmation dialog
		frappe.confirm(
			`<div>
				<p>Are you sure you want to print the following?</p>
				<ul>
					<li><strong>${this.selected_job_cards.length}</strong> job cards</li>
					<li><strong>${copies}</strong> copies each</li>
					<li>Format: <strong>Job Card For Moulding 100*100</strong></li>
				</ul>
				<p class="text-warning"><small>Note: This will open ${this.selected_job_cards.length * copies} print windows.</small></p>
			</div>`,
			async () => {
				try {
					// Show loading
					frappe.show_alert({
						message: __('Preparing print jobs...'),
						indicator: 'blue'
					});
					
					const response = await frappe.call({
						method: 'smart_screens.smart_screens.page.moulding_print_dashboard.moulding_print_dashboard.print_moulding_job_cards',
						args: {
							job_card_names: this.selected_job_cards,
							copies: copies,
							print_format: 'Job Card For Moulding 100*100'
						}
					});
					
					if (response.message && response.message.length > 0) {
						frappe.show_alert({
							message: __('Print jobs prepared successfully!'),
							indicator: 'green'
						});
						
						// Open print URLs in new windows
						let delay = 0;
						for (let i = 0; i < copies; i++) {
							for (const print_data of response.message) {
								setTimeout(() => {
									window.open(print_data.print_url, '_blank');
								}, delay);
								delay += 300; // Add delay to prevent browser from blocking popups
							}
						}
					} else {
						frappe.msgprint(__('Error preparing print jobs.'));
					}
					
				} catch (error) {
					frappe.msgprint(__('Error printing job cards: {0}', [error.message]));
				}
			}
		);
	}
}
