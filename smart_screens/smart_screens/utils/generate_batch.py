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