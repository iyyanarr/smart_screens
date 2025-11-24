frappe.pages['batch-conversion-entry'].on_page_load = function(wrapper) {
	var page = frappe.ui.make_app_page({
		parent: wrapper,
		title: 'Batch Conversion Entry',
		single_column: true
	});

	// Directly set the HTML content
	page.main.html(`
		<div class="batch-conversion-entry-page" style="padding: 20px;">
			<div class="page-header">
				<h3>Batch Conversion Data Entry</h3>
				<p class="text-muted">Manually enter moulding batch conversion data month by month</p>
			</div>

			<div class="alert alert-info">
				<strong><i class="fa fa-info-circle"></i> Purpose:</strong> 
				Capture mould specification and conversion factors for finished goods batches to enable kg→nos conversion in aggregated reports.
			</div>

			<div class="filter-section" style="margin-bottom: 20px; padding: 15px; background: #f9f9f9; border-radius: 5px;">
				<div class="row">
					<div class="col-md-3">
						<label>Select Month</label>
						<input type="month" id="select_month" class="form-control" />
					</div>
					<div class="col-md-3">
						<label>Company</label>
						<input type="text" id="company" class="form-control" readonly value="SPP INDIA" />
					</div>
					<div class="col-md-3">
						<label>&nbsp;</label>
						<button class="btn btn-primary btn-block" id="btn_load_batches">
							<i class="fa fa-search"></i> Load Batches
						</button>
					</div>
					<div class="col-md-3">
						<label>&nbsp;</label>
						<button class="btn btn-success btn-block" id="btn_process_month" disabled>
							<i class="fa fa-cogs"></i> Process Month (Background)
						</button>
					</div>
				</div>
			</div>

			<div class="stats-section" style="margin-bottom: 20px;">
				<div class="row">
					<div class="col-md-3">
						<div class="stat-box" style="padding: 15px; background: #e3f2fd; border-radius: 5px; text-align: center;">
							<h4 id="stat_total">0</h4>
							<small>Total Batches</small>
						</div>
					</div>
					<div class="col-md-3">
						<div class="stat-box" style="padding: 15px; background: #c8e6c9; border-radius: 5px; text-align: center;">
							<h4 id="stat_processed">0</h4>
							<small>Already Processed</small>
						</div>
					</div>
					<div class="col-md-3">
						<div class="stat-box" style="padding: 15px; background: #fff3e0; border-radius: 5px; text-align: center;">
							<h4 id="stat_pending">0</h4>
							<small>Pending</small>
						</div>
					</div>
					<div class="col-md-3">
						<div class="stat-box" style="padding: 15px; background: #ffebee; border-radius: 5px; text-align: center;">
							<h4 id="stat_errors">0</h4>
							<small>Errors</small>
						</div>
					</div>
				</div>
			</div>

			<div class="batch-list-section">
				<h4>Batch Details</h4>
				<div id="batch_table_container">
					<p class="text-muted">Select a month and click "Load Batches" to view production entries.</p>
				</div>
			</div>

			<div class="background-job-section" style="margin-top: 30px; padding: 15px; background: #f5f5f5; border-radius: 5px; display: none;" id="job_status_section">
				<h4>Background Job Status</h4>
				<div class="progress" style="height: 25px;">
					<div class="progress-bar progress-bar-striped active" id="job_progress" role="progressbar" style="width: 0%;">
						<span id="progress_text">0%</span>
					</div>
				</div>
				<p class="text-muted" style="margin-top: 10px;" id="job_message">Waiting to start...</p>
			</div>
		</div>
	`);

	setup_page(wrapper, page);
};

function setup_page(wrapper, page) {
	let current_month_data = [];
	
	// Set default month to current month
	const today = new Date();
	const currentMonth = today.toISOString().slice(0, 7);
	$(wrapper).find('#select_month').val(currentMonth);

	// Load Batches button
	$(wrapper).find('#btn_load_batches').on('click', function() {
		const selected_month = $(wrapper).find('#select_month').val();
		if (!selected_month) {
			frappe.msgprint('Please select a month');
			return;
		}
		load_month_batches(wrapper, selected_month);
	});

	// Process Month button
	$(wrapper).find('#btn_process_month').on('click', function() {
		const selected_month = $(wrapper).find('#select_month').val();
		if (!selected_month) {
			frappe.msgprint('Please select a month');
			return;
		}
		process_month_background(wrapper, selected_month);
	});

	function load_month_batches(wrapper, month) {
		$(wrapper).find('#batch_table_container').html(`
			<div class="text-center" style="padding: 40px;">
				<i class="fa fa-spinner fa-spin fa-2x text-muted"></i>
				<p class="text-muted" style="margin-top: 10px;">Loading batches for ${month}...</p>
			</div>
		`);

		frappe.call({
			method: 'smart_screens.smart_screens.page.batch_conversion_entry.batch_conversion_entry.get_month_batches',
			args: { month: month },
			callback: function(r) {
				if (r.message && r.message.success) {
					current_month_data = r.message.data;
					render_batch_table(wrapper, r.message.data, r.message.stats);
					$(wrapper).find('#btn_process_month').prop('disabled', false);
				} else {
					show_error(wrapper, r.message?.error || 'Failed to load batches');
				}
			}
		});
	}

	function render_batch_table(wrapper, data, stats) {
		// Update stats
		$(wrapper).find('#stat_total').text(stats.total);
		$(wrapper).find('#stat_processed').text(stats.processed);
		$(wrapper).find('#stat_pending').text(stats.pending);
		$(wrapper).find('#stat_errors').text(stats.errors);

		if (!data || data.length === 0) {
			$(wrapper).find('#batch_table_container').html(`
				<div class="alert alert-warning">No production entries found for this month.</div>
			`);
			return;
		}

		let html = `
			<div class="table-responsive">
				<table class="table table-bordered table-striped table-hover">
					<thead>
						<tr>
							<th>MPE</th>
							<th>Date</th>
							<th>Finished Item</th>
							<th>Finished Batch</th>
							<th>Weight (kg)</th>
							<th>Lifts</th>
							<th>Cavities</th>
							<th>Conversion Factor</th>
							<th>Status</th>
							<th>Action</th>
						</tr>
					</thead>
					<tbody>
		`;

		data.forEach(row => {
			const conversion_factor = row.no_of_running_cavities && row.number_of_lifts && row.weight > 0
				? ((row.no_of_running_cavities * row.number_of_lifts) / row.weight).toFixed(4)
				: 'N/A';
			
			const status_badge = row.is_processed 
				? '<span class="label label-success">Processed</span>'
				: '<span class="label label-warning">Pending</span>';

			html += `
				<tr>
					<td><a href="/app/moulding-production-entry/${row.mpe_name}" target="_blank">${row.mpe_name}</a></td>
					<td>${frappe.datetime.str_to_user(row.posting_date)}</td>
					<td>${row.finished_item || 'N/A'}</td>
					<td><strong>${row.finished_batch || 'N/A'}</strong></td>
					<td class="text-right">${row.weight.toFixed(3)}</td>
					<td class="text-right">${row.number_of_lifts}</td>
					<td class="text-right">${row.no_of_running_cavities}</td>
					<td class="text-right"><strong>${conversion_factor}</strong></td>
					<td>${status_badge}</td>
					<td>
						${!row.is_processed ? 
							`<button class="btn btn-xs btn-primary btn-process-single" data-mpe="${row.mpe_name}">
								<i class="fa fa-check"></i> Process
							</button>` : 
							`<button class="btn btn-xs btn-default" disabled>Done</button>`
						}
					</td>
				</tr>
			`;
		});

		html += `</tbody></table></div>`;

		$(wrapper).find('#batch_table_container').html(html);

		// Bind single process buttons
		$(wrapper).find('.btn-process-single').on('click', function() {
			const mpe_name = $(this).data('mpe');
			process_single_batch(wrapper, mpe_name);
		});
	}

	function process_single_batch(wrapper, mpe_name) {
		frappe.call({
			method: 'smart_screens.smart_screens.page.batch_conversion_entry.batch_conversion_entry.process_single_batch',
			args: { mpe_name: mpe_name },
			callback: function(r) {
				if (r.message && r.message.success) {
					frappe.show_alert({
						message: `Processed ${mpe_name} successfully`,
						indicator: 'green'
					});
					// Reload the table
					const selected_month = $(wrapper).find('#select_month').val();
					load_month_batches(wrapper, selected_month);
				} else {
					frappe.msgprint({
						title: 'Error',
						message: r.message?.error || 'Failed to process batch',
						indicator: 'red'
					});
				}
			}
		});
	}

	function process_month_background(wrapper, month) {
		frappe.confirm(
			`This will process all pending batches for ${month} in the background. Continue?`,
			function() {
				$(wrapper).find('#job_status_section').show();
				$(wrapper).find('#btn_process_month').prop('disabled', true);

				frappe.call({
					method: 'smart_screens.smart_screens.page.batch_conversion_entry.batch_conversion_entry.process_month_background',
					args: { month: month },
					callback: function(r) {
						if (r.message && r.message.success) {
							frappe.show_alert({
								message: 'Background job started successfully',
								indicator: 'green'
							});
							monitor_background_job(wrapper, r.message.job_id, month);
						} else {
							frappe.msgprint({
								title: 'Error',
								message: r.message?.error || 'Failed to start background job',
								indicator: 'red'
							});
							$(wrapper).find('#btn_process_month').prop('disabled', false);
						}
					}
				});
			}
		);
	}

	function monitor_background_job(wrapper, job_id, month) {
		const interval = setInterval(function() {
			frappe.call({
				method: 'smart_screens.smart_screens.page.batch_conversion_entry.batch_conversion_entry.get_job_status',
				args: { job_id: job_id },
				callback: function(r) {
					if (r.message) {
						const progress = r.message.progress || 0;
						$(wrapper).find('#job_progress').css('width', progress + '%');
						$(wrapper).find('#progress_text').text(progress + '%');
						$(wrapper).find('#job_message').text(r.message.message || 'Processing...');

						if (r.message.status === 'completed') {
							clearInterval(interval);
							$(wrapper).find('#job_progress').removeClass('active');
							frappe.show_alert({
								message: 'Background job completed successfully!',
								indicator: 'green'
							});
							// Reload batches
							setTimeout(function() {
								load_month_batches(wrapper, month);
								$(wrapper).find('#job_status_section').hide();
							}, 2000);
						} else if (r.message.status === 'failed') {
							clearInterval(interval);
							$(wrapper).find('#job_progress').removeClass('active').addClass('progress-bar-danger');
							frappe.msgprint({
								title: 'Job Failed',
								message: r.message.error || 'Background job failed',
								indicator: 'red'
							});
						}
					}
				}
			});
		}, 2000); // Check every 2 seconds
	}

	function show_error(wrapper, message) {
		$(wrapper).find('#batch_table_container').html(`
			<div class="alert alert-danger">${message}</div>
		`);
	}
}
