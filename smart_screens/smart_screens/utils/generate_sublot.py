import frappe
from smart_screens.smart_screens.utils.generate_barcode import generate_barcode_image
from smart_screens.smart_screens.utils.generate_batch import create_batch
from smart_screens.smart_screens.utils.stock_entry import create_stock_entry
from frappe.utils import flt


def strip_leading_alphabets(text):
    """
    Remove any alphabets from the beginning of a string.
    E.g., "ABC123" becomes "123", "A1B2" becomes "1B2"
    
    Args:
        text (str): The text to process.
        
    Returns:
        str: The processed text with leading alphabets removed.
    """
    if not text:
        return text
    
    i = 0
    while i < len(text) and text[i].isalpha():
        i += 1
    
    return text[i:]


def get_next_available_batch_number(batch_number):
    """
    Get the next available batch number for the given batch.
    
    1. Count the number of repack entries made against the given batch using SQL
    2. Create proposed 'new batch no.' by incrementing 1 to the count
    3. Check if proposed batch number already exists, and increment until we find an available one
    
    Args:
        batch_number (str): The parent batch number.
        
    Returns:
        str: The next available batch number.
    """
    if not batch_number:
        frappe.throw("Batch Number is required to generate next batch number.")
    
    try:
        # Step 1: Use SQL to directly query repack entries referencing this batch
        query = """
            SELECT COUNT(DISTINCT se.name) as repack_count
            FROM `tabStock Entry` se
            INNER JOIN `tabStock Entry Detail` sed ON sed.parent = se.name
            WHERE se.purpose = 'Repack'
            AND sed.batch_no = %s
            AND se.docstatus = 1
        """
        
        result = frappe.db.sql(query, (batch_number,), as_dict=True)
        repack_entries_count = result[0].repack_count if result else 0
        
        # Step 2: Create proposed new batch number by incrementing 1 to the count
        proposed_suffix = repack_entries_count + 1
        
        # Step 3: Check if the proposed batch number already exists
        while True:
            proposed_batch_number = f"{batch_number}-{proposed_suffix}"
            
            # Check if the batch exists
            batch_exists = frappe.db.exists("Batch", proposed_batch_number)
            
            if not batch_exists:
                # If the batch does not exist, we found our next available batch number
                break
                
            # If the batch exists, increment the suffix and try again
            proposed_suffix += 1
        
        return proposed_batch_number
        
    except Exception as e:
        frappe.throw(f"Failed to generate next available batch number: {str(e)}")


@frappe.whitelist()
def generate_sublot(batch_number, qty, source_warehouse, target_warehouse):
    """
    Generate a sub-lot by checking repack entries, creating a new batch, generating a barcode, 
    and creating a stock entry.

    Args:
        batch_number (str): The batch number to process.
        qty (float): The quantity for the sub-lot.
        source_warehouse (str): The source warehouse for the stock entry.
        target_warehouse (str): The target warehouse for the stock entry.

    Returns:
        dict: A dictionary containing the new batch number, barcode image, and stock entry name.
    """
    # Step 1: Validate inputs
    if not batch_number:
        frappe.throw("Batch Number is required.")
    
    try:
        qty = flt(qty)
        if qty <= 0:
            frappe.throw("Quantity must be greater than zero.")
    except ValueError:
        frappe.throw("Invalid quantity value.")
    
    if not source_warehouse:
        frappe.throw("Source Warehouse is required.")
        
    if not target_warehouse:
        frappe.throw("Target Warehouse is required.")

    try:
        # Step 2: Get the next available batch number
        new_batch_number = get_next_available_batch_number(batch_number)
        
        # Step 3: Create sub_lot_number by removing alphabets from the beginning
        sub_lot_number = strip_leading_alphabets(new_batch_number)
        
        # Step 4: Get item code from the batch
        batch_doc = frappe.get_doc("Batch", batch_number)
        item_code = batch_doc.item
        
        # Step 5: Create a new batch with the proposed batch number
        new_batch = create_batch(
            item_code=item_code,
            batch_number=new_batch_number
        )

        # Step 6: Generate a barcode for the new batch
        barcode_image = generate_barcode_image(new_batch_number)
        
        # Prepare barcode data structure
        barcode_data = {
            "barcode": barcode_image,
            "barcode_text": new_batch_number
        }

        # Step 7: Create a stock entry for the new batch
        stock_entry_name = create_stock_entry(
            item_code=item_code,
            qty=qty,
            source_warehouse=source_warehouse,
            target_warehouse=target_warehouse,
            purpose="Repack",
            batch_no=batch_number,
            new_batch_no=new_batch,
            sub_lot_number=sub_lot_number,  # Pass the extracted sub_lot_number
            barcode_data=barcode_data,
            source_ref_document="Sub Lot Entry",
            source_ref_id=frappe.form_dict.get("docname", "")
        )

        # Return the results
        return {
            "status": "success",
            "new_batch_number": new_batch,
            "sub_lot_number": sub_lot_number,  # This is the sub lot number extracted from the batch number
            "barcode_image": barcode_image,
            "stock_entry_name": stock_entry_name
        }
        
    except Exception as e:
        frappe.throw(f"Failed to generate sub-lot: {str(e)}")