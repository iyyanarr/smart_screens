import frappe
from frappe.utils import nowdate, get_datetime, add_days, flt


@frappe.whitelist()
def create_work_order(production_item, qty, bom_no, source_warehouse=None, target_warehouse=None, 
                      item_name=None, company=None, planned_start_date=None, expected_delivery_date=None,
                      project=None, sales_order=None, sales_order_item=None, batch_no=None):
    """
    Create a Work Order in ERPNext using the new_doc approach.

    Args:
        production_item (str): The item code to be manufactured.
        qty (float): The quantity to manufacture.
        bom_no (str): The BOM number to use for manufacturing.
        source_warehouse (str, optional): The source warehouse for raw materials.
        target_warehouse (str, optional): The target warehouse for the finished goods.
        item_name (str, optional): The item name. If not provided, it will be fetched from the item.
        company (str, optional): The company. Defaults to user's default company.
        planned_start_date (str, optional): The planned start date. Defaults to today.
        expected_delivery_date (str, optional): The expected delivery date. Defaults to 7 days from today.
        project (str, optional): The project linked to this Work Order.
        sales_order (str, optional): The sales order reference.
        sales_order_item (str, optional): The sales order item reference.
        batch_no (str, optional): The batch number for the finished goods.

    Returns:
        str: The name of the created Work Order.
    """
    if not production_item or not qty or not bom_no:
        frappe.throw("Production Item, Quantity, and BOM Number are required.")

    try:
        # Get item details if needed
        if not item_name:
            item_name = frappe.db.get_value("Item", production_item, "item_name")
        
        # Create a new Work Order document
        work_order = frappe.new_doc("Work Order")
        work_order.production_item = production_item
        work_order.item_name = item_name
        work_order.qty = flt(qty)
        work_order.bom_no = bom_no
        
        # Set company
        work_order.company = company or frappe.defaults.get_user_default("Company") or "SPP"
        
        # Set warehouses
        if source_warehouse:
            work_order.source_warehouse = source_warehouse
        if target_warehouse:
            work_order.fg_warehouse = target_warehouse
            
        # Set dates
        work_order.planned_start_date = planned_start_date or nowdate()
        if expected_delivery_date:
            work_order.expected_delivery_date = expected_delivery_date
        else:
            work_order.expected_delivery_date = add_days(nowdate(), 7)
            
        # Set optional fields
        if project:
            work_order.project = project
        if sales_order:
            work_order.sales_order = sales_order
        if sales_order_item:
            work_order.sales_order_item = sales_order_item
        if batch_no:
            work_order.batch_no = batch_no
            
        # Set additional info
        work_order.naming_series = "MFG-WO-.YYYY.-"
        
        # Calculate required materials based on BOM
        work_order.get_items_and_operations_from_bom()
        
        # Insert the Work Order into the database
        work_order.insert()
        
        # If you want to auto-submit, uncomment the following line
        # work_order.submit()

        return work_order.name
    except Exception as e:
        frappe.throw(f"Failed to create Work Order: {str(e)}")


@frappe.whitelist()
def create_job_card(work_order, operation=None, workstation=None, for_quantity=None, 
                    employee=None, time_in_mins=None, batch_no=None, sub_lot_number=None, 
                    posting_date=None, source_warehouse=None):
    """
    Create a Job Card for a Work Order operation in ERPNext.

    Args:
        work_order (str): The name of the Work Order.
        operation (str, optional): The operation name. If not provided, first operation from Work Order will be used.
        workstation (str, optional): The workstation for the job card. If not provided, fetched from operation.
        for_quantity (float, optional): The quantity to process. If not provided, uses Work Order quantity.
        employee (str or list, optional): Employee(s) assigned to the job card.
        time_in_mins (float, optional): Time required in minutes. If not provided, fetched from operation.
        batch_no (str, optional): The batch number being processed.
        sub_lot_number (str, optional): The sub lot number (numeric part of the batch number).
        posting_date (str, optional): The posting date for the job card. Defaults to today's date.
        source_warehouse (str, optional): The source warehouse for raw materials.

    Returns:
        str: The name of the created Job Card.
    """
    if not work_order:
        frappe.throw("Work Order is required to create a Job Card.")

    try:
        # Get Work Order details
        wo_doc = frappe.get_doc("Work Order", work_order)
        
        if not for_quantity:
            for_quantity = wo_doc.qty
        
        # Create a new Job Card document
        job_card = frappe.new_doc("Job Card")
        job_card.work_order = work_order
        job_card.company = wo_doc.company
        job_card.posting_date = posting_date or nowdate()
        job_card.for_quantity = flt(for_quantity)
        
        # Set warehouses
        if source_warehouse:
            job_card.source_warehouse = source_warehouse
        else:
            job_card.source_warehouse = wo_doc.source_warehouse
        
        # Handle batch information
        if batch_no:
            job_card.batch_no = batch_no
        
        # Add custom field for sub_lot_number if it exists in your system
        if sub_lot_number and frappe.get_meta("Job Card").has_field("spp_batch_number"):
            job_card.spp_batch_number = sub_lot_number
        
        # Handle operation selection
        if operation:
            # Get operation details if specific operation provided
            job_card.operation = operation
            
            if wo_doc.operations:
                for op in wo_doc.operations:
                    if op.operation == operation:
                        if not workstation and op.workstation:
                            job_card.workstation = op.workstation
                        if not time_in_mins and op.time_in_mins:
                            job_card.time_in_mins = op.time_in_mins
                        break
        elif wo_doc.operations:
            # Take the first operation if none specified
            job_card.operation = wo_doc.operations[0].operation
            if not workstation and wo_doc.operations[0].workstation:
                job_card.workstation = wo_doc.operations[0].workstation
            if not time_in_mins and wo_doc.operations[0].time_in_mins:
                job_card.time_in_mins = wo_doc.operations[0].time_in_mins
        
        # Override with supplied values if provided
        if workstation:
            job_card.workstation = workstation
        if time_in_mins:
            job_card.time_in_mins = flt(time_in_mins)
            
        # Add employees if provided
        if employee:
            if isinstance(employee, list):
                for emp in employee:
                    job_card.append("employee", {"employee": emp})
            else:
                job_card.append("employee", {"employee": employee})
                
        # Get raw materials based on operation and Work Order BOM
        if hasattr(job_card, 'get_required_items'):
            job_card.get_required_items()
        
        # Insert the Job Card into the database
        job_card.insert()
        
        # Optionally start the job card (uncomment if needed)
        # job_card.time_logs = []
        # job_card.append("time_logs", {
        #     "from_time": get_datetime(),
        #     "employee": employee[0] if isinstance(employee, list) else employee,
        #     "completed_qty": 0
        # })
        # job_card.save()
        
        return job_card.name
    except Exception as e:
        frappe.throw(f"Failed to create Job Card: {str(e)}")