import frappe
from frappe.utils import nowdate

def create_batch(item_code, batch_number=None, expiry_date=None):
    """
    Create a new batch in ERPNext.

    Args:
        item_code (str): The item code for which the batch is being created.
        batch_number (str, optional): The batch number. If not provided, it will be auto-generated.
        expiry_date (str, optional): The expiry date for the batch in YYYY-MM-DD format.

    Returns:
        str: The name of the created batch.
    """
    if not item_code:
        frappe.throw("Item Code is required to create a batch.")

    # Check if the batch already exists
    if batch_number and frappe.db.exists("Batch", batch_number):
        frappe.throw(f"Batch {batch_number} already exists.")

    # Create a new Batch document
    batch = frappe.get_doc({
        "doctype": "Batch",
        "item": item_code,
        "batch_id": batch_number or frappe.generate_hash(length=8),  # Auto-generate if not provided
        "expiry_date": expiry_date,
        "creation_date": nowdate()
    })

    # Insert the batch into the database
    batch.insert()
    frappe.msgprint(f"Batch {batch.name} created successfully for Item {item_code}.")
    return batch.name

def convert_raw_to_fg_batch(raw_batch_number, item_code=None):
    """
    Converts a raw material batch number to a finished good batch number.
    For example, converts P25D03Z07-3 to F25D03Z07-3.
    
    Args:
        raw_batch_number (str): The raw material batch number to convert
        item_code (str, optional): The item code of the finished good
        
    Returns:
        str: The converted finished good batch number
    """
    if not raw_batch_number:
        return None
        
    # Convert batch number: If starts with 'P', replace with 'F', otherwise add 'F' prefix
    if raw_batch_number.startswith('P'):
        fg_batch_number = 'F' + raw_batch_number[1:]
    else:
        fg_batch_number = 'F' + raw_batch_number
    
    # Create the batch if it doesn't exist and item_code is provided
    if item_code and not frappe.db.exists("Batch", fg_batch_number):
        try:
            create_batch(item_code, fg_batch_number)
        except Exception as e:
            frappe.logger().error(f"Error creating finished good batch: {str(e)}")
    elif frappe.db.exists("Batch", fg_batch_number):
        # If batch exists but for a different item, create a unique batch
        batch_item = frappe.db.get_value("Batch", fg_batch_number, "item")
        if batch_item and item_code and batch_item != item_code:
            fg_batch_number = f"{fg_batch_number}-{item_code}"
            # Create the new unique batch
            if not frappe.db.exists("Batch", fg_batch_number):
                try:
                    create_batch(item_code, fg_batch_number)
                except Exception as e:
                    frappe.logger().error(f"Error creating unique batch: {str(e)}")
    
    return fg_batch_number