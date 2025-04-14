import frappe
from smart_screens.smart_screens.utils.generate_barcode import generate_barcode_image
from smart_screens.smart_screens.utils.generate_batch import create_batch
from smart_screens.smart_screens.utils.stock_entry import create_stock_entry
from frappe.utils import flt
import time


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
    
    1. Count the number of repack entries made against the given batch
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
        # Step 1: Get distinct Stock Entries with purpose "Repack" containing the batch
        # repack_entries = frappe.get_list(
        #     "Stock Entry Detail",
        #     filters={
        #         "batch_no": batch_number,
        #         "docstatus": 1,
        #         "parenttype": "Stock Entry"
        #     },
        #     fields=["parent"],
        #     distinct=True,
        #     as_list=False
        # )
        repack_entries = frappe.get_all('Stock Entry Detail',parent_doctype='Stock Entry',
            filters={
                'batch_no': batch_number,
                'docstatus': 1,
                'parenttype': 'Stock Entry'
            },
            fields=['parent'],
            distinct=True
        )
        
        # Get only the entries where parent Stock Entry has purpose "Repack"
        repack_entry_parents = set()
        for entry in repack_entries:
            parent_purpose = frappe.get_value("Stock Entry", entry.parent, "purpose")
            if parent_purpose == "Repack":
                repack_entry_parents.add(entry.parent)
        
        repack_entries_count = len(repack_entry_parents)
        
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
def generate_sublot(batch_number, qty, source_warehouse, target_warehouse, uom=None):
    """
    Generate a sub-lot by checking repack entries, creating a new batch, generating a barcode, 
    and creating a stock entry.

    Args:
        batch_number (str): The batch number to process.
        qty (float): The quantity for the sub-lot.
        source_warehouse (str): The source warehouse for the stock entry.
        target_warehouse (str): The target warehouse for the stock entry.
        uom (str, optional): Unit of Measure.

    Returns:
        dict: A dictionary containing the new batch number, barcode image, stock entry name, and timing info.
    """
    timing = {}
    start_total = time.time()
    
    # Step 1: Validate inputs
    frappe.publish_progress(
        percent=10,
        title="Generating Sub Lot",
        description="Validating inputs..."
    )
    
    start_time = time.time()
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
    
    timing['validation'] = round((time.time() - start_time) * 1000, 2)  # Time in milliseconds

    try:
        # Step 2: Get the next available batch number
        frappe.publish_progress(
            percent=20,
            title="Generating Sub Lot",
            description="Getting next available batch number..."
        )
        start_time = time.time()
        new_batch_number = get_next_available_batch_number(batch_number)
        timing['get_batch_number'] = round((time.time() - start_time) * 1000, 2)
        
        # Step 3: Create sub_lot_number by removing alphabets from the beginning
        frappe.publish_progress(
            percent=30,
            title="Generating Sub Lot",
            description="Creating sub lot number..."
        )
        start_time = time.time()
        sub_lot_number = strip_leading_alphabets(new_batch_number)
        timing['create_sublot_number'] = round((time.time() - start_time) * 1000, 2)
        
        # Step 4: Get item code from the batch
        frappe.publish_progress(
            percent=40,
            title="Generating Sub Lot",
            description="Getting item details..."
        )
        start_time = time.time()
        batch_doc = frappe.get_doc("Batch", batch_number)
        item_code = batch_doc.item
        timing['get_item_code'] = round((time.time() - start_time) * 1000, 2)
        
        # Step 5: Create a new batch with the proposed batch number
        frappe.publish_progress(
            percent=50,
            title="Generating Sub Lot",
            description="Creating new batch..."
        )
        start_time = time.time()
        new_batch = create_batch(
            item_code=item_code,
            batch_number=new_batch_number
        )
        timing['create_batch'] = round((time.time() - start_time) * 1000, 2)

        # Step 6: Generate a barcode for the new batch
        frappe.publish_progress(
            percent=60,
            title="Generating Sub Lot",
            description="Generating barcode..."
        )
        start_time = time.time()
        barcode_image = generate_barcode_image(new_batch_number)
        timing['generate_barcode'] = round((time.time() - start_time) * 1000, 2)
        
        # Prepare barcode data structure
        barcode_data = {
            "barcode": barcode_image,
            "barcode_text": new_batch_number
        }

        # Step 7: Create a stock entry for the new batch
        frappe.publish_progress(
            percent=80,
            title="Generating Sub Lot",
            description="Creating stock entry..."
        )
        start_time = time.time()
        stock_entry_name = create_stock_entry(
            item_code=item_code,
            qty=qty,
            source_warehouse=source_warehouse,
            target_warehouse=target_warehouse,
            purpose="Repack",
            batch_no=batch_number,
            new_batch_no=new_batch,
            sub_lot_number=sub_lot_number,
            barcode_data=barcode_data,
            source_ref_document="Sub Lot Entry",
            source_ref_id=frappe.form_dict.get("docname", ""),
            uom=uom
        )
        timing['create_stock_entry'] = round((time.time() - start_time) * 1000, 2)

        # Complete
        frappe.publish_progress(
            percent=100,
            title="Generating Sub Lot",
            description="Process complete!"
        )
        
        timing['total'] = round((time.time() - start_total) * 1000, 2)
        
        # Log timing information for analysis
        frappe.logger().info(f"Sub Lot Generation Timing: {timing}")

        # Return the results
        return {
            "status": "success",
            "new_batch_number": new_batch,
            "sub_lot_number": sub_lot_number,
            "barcode_image": barcode_image,
            "stock_entry_name": stock_entry_name,
            "timing": timing,
            "processed_qty": qty  # Return the qty for frontend to use in final_sublot_qty
        }
        
    except Exception as e:
        frappe.logger().error(f"Sub Lot Generation Error: {str(e)}")
        frappe.throw(f"Failed to generate sub-lot: {str(e)}")