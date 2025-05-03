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
    Get the next available batch number for the given batch - OPTIMIZED VERSION.
    
    Args:
        batch_number (str): The parent batch number.
        
    Returns:
        str: The next available batch number.
    """
    if not batch_number:
        frappe.throw("Batch Number is required to generate next batch number.")
    
    try:
        # Get count of repack entries in a single, optimized query
        repack_count = frappe.db.sql("""
            SELECT COUNT(DISTINCT sed.parent) 
            FROM `tabStock Entry Detail` sed
            JOIN `tabStock Entry` se ON sed.parent = se.name
            WHERE sed.batch_no = %s 
            AND sed.docstatus = 1
            AND se.purpose = 'Repack'
        """, batch_number)[0][0]
        
        # Create proposed new batch number by incrementing the count
        proposed_suffix = repack_count + 1
        
        # Check existing batch numbers in one query to determine next available suffix
        existing_batches = frappe.db.sql("""
            SELECT name FROM `tabBatch`
            WHERE name LIKE %s
            ORDER BY name
        """, f"{batch_number}-%")
        
        existing_suffixes = set()
        for batch in existing_batches:
            try:
                suffix = int(batch[0].split('-')[-1])
                existing_suffixes.add(suffix)
            except (ValueError, IndexError):
                continue
        
        # Find the next available suffix
        while proposed_suffix in existing_suffixes:
            proposed_suffix += 1
            
        return f"{batch_number}-{proposed_suffix}"
        
    except Exception as e:
        frappe.logger().error(f"Error in get_next_available_batch_number: {str(e)}")
        frappe.throw(f"Failed to generate next available batch number: {str(e)}")

@frappe.whitelist()
def check_stock_availability(item_code, batch_number, qty, source_warehouse):
    """
    Check if sufficient stock is available in the source warehouse for the specified batch.
    
    Args:
        item_code (str): The item code to check.
        batch_number (str): The batch number to check.
        qty (float): The quantity required.
        source_warehouse (str): The source warehouse to check.
        
    Returns:
        tuple: Contains:
            bool: True if stock is available, False otherwise.
            float: Actual available quantity
    """
    try:
        # Use ERPNext's built-in get_batch_qty function which is used by the Stock Ledger report
        from erpnext.stock.doctype.batch.batch import get_batch_qty
        available_qty = get_batch_qty(batch_number, source_warehouse, item_code)
        
        # Return whether there's enough stock and the available quantity
        return flt(available_qty) >= flt(qty), flt(available_qty)
        
    except Exception as e:
        frappe.logger().error(f"Error checking stock availability: {str(e)}")
        # Return False to be safe in case of errors
        return False, 0


@frappe.whitelist()
def generate_sublot(batch_number, qty, source_warehouse, target_warehouse, uom=None, process_status=None):
    """
    Generate a sub-lot by checking repack entries, creating a new batch, generating a barcode, 
    and creating a stock entry.

    Args:
        batch_number (str): The batch number to process.
        qty (float): The quantity for the sub-lot.
        source_warehouse (str): The source warehouse for the stock entry.
        target_warehouse (str): The target warehouse for the stock entry.
        uom (str, optional): Unit of Measure.
        process_status (dict, optional): Process status information for progress tracking.

    Returns:
        dict: A dictionary containing the new batch number, barcode image, stock entry name, timing info, and status updates.
    """
    timing = {}
    start_total = time.time()
    
    # Step 1: Validate inputs
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
        start_time = time.time()
        new_batch_number = get_next_available_batch_number(batch_number)
        timing['get_batch_number'] = round((time.time() - start_time) * 1000, 2)
        
        # Step 3: Create sub_lot_number by removing alphabets from the beginning
        start_time = time.time()
        sub_lot_number = strip_leading_alphabets(new_batch_number)
        timing['create_sublot_number'] = round((time.time() - start_time) * 1000, 2)
        
        # Step 4: Get item code from the batch
        start_time = time.time()
        batch_doc = frappe.get_doc("Batch", batch_number)
        item_code = batch_doc.item
        timing['get_item_code'] = round((time.time() - start_time) * 1000, 2)
        
        # Step 4.5: Check stock availability
        start_time = time.time()
        stock_available, available_qty = check_stock_availability(
            item_code=item_code,
            batch_number=batch_number,
            qty=qty,
            source_warehouse=source_warehouse
        )
        
        # If stock is not available, create a stock reconciliation to adjust the stock
        stock_reconciliation_doc = None
        if not stock_available:
            # Create stock reconciliation to adjust the stock to required level
            stock_reconciliation_doc = create_stock_reconciliation(
                item_code=item_code,
                batch_number=batch_number,
                warehouse=source_warehouse,
                qty_required=qty  # Set stock to exactly what we need
            )
            
            if not stock_reconciliation_doc:
                frappe.throw(f"Failed to create stock reconciliation for {item_code} in batch {batch_number}")
                
            frappe.msgprint(
                f"Stock reconciliation {stock_reconciliation_doc} created to adjust stock from {available_qty} to {qty}",
                indicator="blue",
                alert=True
            )
            
            # After reconciliation, we should have enough stock
            stock_available = True
        
        timing['check_stock'] = round((time.time() - start_time) * 1000, 2)
        
        # Step 5: Create a new batch with the proposed batch number
        start_time = time.time()
        try:
            new_batch = create_batch(
                item_code=item_code,
                batch_number=new_batch_number
            )
        except Exception as batch_error:
            # Log the specific batch creation error with detailed context
            import traceback
            batch_error_traceback = traceback.format_exc()
            frappe.logger().error(f"Batch creation error: {str(batch_error)}")
            frappe.logger().error(f"Batch creation traceback: {batch_error_traceback}")
            # Re-raise with more specific message
            raise Exception(f"Error creating batch: {str(batch_error)}")
            
        timing['create_batch'] = round((time.time() - start_time) * 1000, 2)

        # Step 6: Generate a barcode for the new batch
        start_time = time.time()
        barcode_image = generate_barcode_image(new_batch_number)
        timing['generate_barcode'] = round((time.time() - start_time) * 1000, 2)
        
        # Prepare barcode data structure
        barcode_data = {
            "barcode": barcode_image,
            "barcode_text": new_batch_number
        }
        
        # Step 7: Create a stock entry for the new batch
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

        timing['total'] = round((time.time() - start_total) * 1000, 2)
        
        # Log timing information for analysis
        frappe.logger().info(f"Sub Lot Generation Timing: {timing}")

        # Return the results
        response = {
            "status": "success",
            "new_batch_number": new_batch,
            "sub_lot_number": sub_lot_number,
            "barcode_image": barcode_image,
            "stock_entry_name": stock_entry_name,
            "timing": timing,
            "processed_qty": qty,  # Return the qty for frontend to use in final_sublot_qty
            "current_stage": "complete"  # Indicate the current stage in the process
        }
        
        # If stock reconciliation was performed, include it in the response
        if stock_reconciliation_doc:
            response["stock_reconciliation_doc"] = stock_reconciliation_doc
            response["original_available_qty"] = available_qty
            
        return response
        
    except Exception as e:
        # Enhanced error logging
        import traceback
        error_traceback = traceback.format_exc()
        error_context = {
            "batch_number": batch_number,
            "qty": qty,
            "source_warehouse": source_warehouse,
            "target_warehouse": target_warehouse
        }
        
        frappe.logger().error(f"Sub Lot Generation Error: {str(e)}")
        frappe.logger().error(f"Error context: {error_context}")
        frappe.logger().error(f"Traceback: {error_traceback}")
        
        # Create a detailed error log entry
        frappe.log_error(
            title=f"Sub Lot Generation Error - {batch_number}",
            message=f"Error: {str(e)}\n\nContext: {error_context}\n\nTraceback: {error_traceback}"
        )
        
        # Return a structured error response with the clear error message
        return {
            "status": "error",
            "message": str(e),  # Ensure we get the complete error message
            "error_context": error_context,
        }


def create_stock_reconciliation(item_code, batch_number, warehouse, qty_required):
    """
    Create a stock reconciliation to adjust the stock level to the required quantity.
    
    Args:
        item_code (str): Item code to reconcile
        batch_number (str): Batch number to reconcile
        warehouse (str): Warehouse to reconcile
        qty_required (float): Required quantity to set in the system
        
    Returns:
        str: Name of the created stock reconciliation document
    """
    try:
        from frappe.utils import nowdate, nowtime, flt
        
        # Get the item's valuation rate
        valuation_rate = frappe.db.get_value("Stock Ledger Entry", 
            {"item_code": item_code, "batch_no": batch_number, "warehouse": warehouse, "is_cancelled": 0},
            "valuation_rate", 
            order_by="posting_date DESC, posting_time DESC, creation DESC"
        ) or 0
        
        # If valuation rate is 0, try getting it from Item or other sources
        if not valuation_rate or valuation_rate == 0:
            valuation_rate = frappe.db.get_value("Item", item_code, "valuation_rate") or 0
            
            # If still 0, set a default value
            if not valuation_rate or valuation_rate == 0:
                valuation_rate = 1  # Default value to avoid 0 valuation
        
        # Get the current quantity for logging
        stock_available, available_qty = check_stock_availability(
            item_code=item_code,
            batch_number=batch_number,
            qty=qty_required,
            source_warehouse=warehouse
        )
        
        # Create a new Stock Reconciliation
        stock_recon = frappe.new_doc("Stock Reconciliation")
        stock_recon.purpose = "Stock Reconciliation"
        stock_recon.posting_date = nowdate()
        stock_recon.posting_time = nowtime()
        stock_recon.set_posting_time = 1
        stock_recon.company = frappe.defaults.get_user_default("Company")
        stock_recon.expense_account = frappe.db.get_value("Company", stock_recon.company, "stock_adjustment_account") or ""
        stock_recon.cost_center = frappe.db.get_value("Company", stock_recon.company, "cost_center") or ""
        
        # Add the item to the reconciliation
        stock_recon.append("items", {
            "item_code": item_code,
            "warehouse": warehouse,
            "batch_no": batch_number,
            "use_serial_batch_fields": 1,
            "qty": flt(qty_required),  # Set the quantity to the required amount
            "valuation_rate": flt(valuation_rate)
        })
        
        # Save and submit the stock reconciliation
        stock_recon.insert()
        stock_recon.submit()
        
        frappe.logger().info(f"Stock reconciliation {stock_recon.name} created for {item_code} in batch {batch_number}")
        
        # Log the reconciliation information in Stock Reconciliation Log
        create_stock_reconciliation_log(
            item_code=item_code,
            batch_no=batch_number,
            warehouse=warehouse,
            actual_qty=available_qty,
            expected_qty=qty_required,
            stock_reconciliation=stock_recon.name,
            reason="Sublot Generation",
            comments=f"Stock reconciliation performed during sublot generation. System found {available_qty} but {qty_required} was needed."
        )
        
        return stock_recon.name
    
    except Exception as e:
        frappe.logger().error(f"Error creating stock reconciliation: {str(e)}")
        import traceback
        frappe.logger().error(f"Traceback: {traceback.format_exc()}")
        frappe.msgprint(f"Error creating stock reconciliation: {str(e)}", indicator="red", alert=True)
        return None


def create_stock_reconciliation_log(item_code, batch_no, warehouse, actual_qty, expected_qty, 
                                   stock_reconciliation=None, reason=None, comments=None):
    """
    Create a log entry for stock reconciliation for supervisor review.
    
    Args:
        item_code (str): Item code that was reconciled
        batch_no (str): Batch number that was reconciled
        warehouse (str): Warehouse that was reconciled
        actual_qty (float): Actual quantity found in the system
        expected_qty (float): Expected quantity that should be in the system
        stock_reconciliation (str, optional): Reference to the Stock Reconciliation document
        creation_document (str, optional): Reference to the document that triggered this reconciliation
        creation_doctype (str, optional): DocType of the document that triggered this reconciliation
        reason (str, optional): Reason for the reconciliation
        comments (str, optional): Additional comments about the reconciliation
        
    Returns:
        str: Name of the created log entry
    """
    try:
        from frappe.utils import nowdate, nowtime, flt
        
        # Create a new Stock Reconciliation Log
        log_entry = frappe.new_doc("Stock Reconciliation Log")
        log_entry.item_code = item_code
        log_entry.batch_no = batch_no
        log_entry.warehouse = warehouse
        log_entry.transaction_date = nowdate()
        log_entry.posting_time = nowtime()
        log_entry.company = frappe.defaults.get_user_default("Company")
        log_entry.actual_qty = flt(actual_qty)
        log_entry.expected_qty = flt(expected_qty)
        # Difference will be calculated automatically in before_save
        
        if stock_reconciliation:
            log_entry.stock_reconciliation = stock_reconciliation
            
            
        if reason:
            log_entry.reason = reason
            
        if comments:
            log_entry.comments = comments
            
        log_entry.insert()
        
        frappe.logger().info(f"Stock Reconciliation Log {log_entry.name} created for {item_code} in batch {batch_no}")
        
        return log_entry.name
        
    except Exception as e:
        frappe.logger().error(f"Error creating stock reconciliation log: {str(e)}")
        import traceback
        frappe.logger().error(f"Traceback: {traceback.format_exc()}")
        # Don't throw an error, just log it since this is a logging function
        return None