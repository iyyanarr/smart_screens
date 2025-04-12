import frappe
from frappe.utils import nowdate

def create_stock_entry(item_code, qty, source_warehouse, target_warehouse, purpose="Material Transfer", 
                      posting_date=None, batch_no=None, new_batch_no=None, sub_lot_number=None,
                      barcode_data=None, uom=None, source_ref_document=None, source_ref_id=None):
    """
    Create a Stock Entry in ERPNext using the new_doc approach.

    Args:
        item_code (str): The item code for the stock entry.
        qty (float): The quantity to transfer.
        source_warehouse (str): The source warehouse.
        target_warehouse (str): The target warehouse.
        purpose (str, optional): The purpose of the stock entry. Defaults to "Material Transfer".
        posting_date (str, optional): The posting date for the stock entry. Defaults to today's date.
        batch_no (str, optional): The source batch number. Required for Repack operations.
        new_batch_no (str, optional): The new batch number for target item in Repack operations.
        sub_lot_number (str, optional): The sub lot number (numeric part of the batch number).
        barcode_data (dict, optional): Dictionary with barcode image and text.
        uom (str, optional): The UOM to use. If not provided, fetched from the item.
        source_ref_document (str, optional): The source document type reference.
        source_ref_id (str, optional): The source document ID reference.

    Returns:
        str: The name of the created Stock Entry.
    """
    if not item_code or not qty or not source_warehouse or not target_warehouse:
        frappe.throw("Item Code, Quantity, Source Warehouse, and Target Warehouse are required.")

    if purpose == "Repack" and not batch_no:
        frappe.throw("Batch Number is required for Repack operations.")
        
    if purpose == "Repack" and not new_batch_no:
        frappe.throw("New Batch Number is required for Repack operations.")

    try:
        # Get item details to determine UOM if not provided
        if not uom:
            item = frappe.get_doc("Item", item_code)
            uom = item.stock_uom
        
        # Create a new Stock Entry document
        stock_entry = frappe.new_doc("Stock Entry")
        stock_entry.purpose = purpose
        stock_entry.company = frappe.defaults.get_user_default("Company") or "SPP"
        stock_entry.naming_series = "MAT-STE-.YYYY.-"
        stock_entry.stock_entry_type = purpose
        stock_entry.posting_date = posting_date or nowdate()
        
        # For Repack operations
        if purpose == "Repack":
            stock_entry.from_warehouse = source_warehouse
            stock_entry.to_warehouse = target_warehouse
            
            # Add source item (consumption)
            stock_entry.append("items", {
                "item_code": item_code,
                "s_warehouse": source_warehouse,
                "stock_uom": uom,
                "to_uom": uom,
                "uom": uom,
                "is_finished_item": 0,
                "use_serial_batch_fields": 1,
                "transfer_qty": qty,
                "qty": qty,
                "batch_no": batch_no
            })
            
            # Add target item (production)
            target_item = {
                "item_code": item_code,
                "t_warehouse": target_warehouse,
                "stock_uom": uom,
                "to_uom": uom,
                "uom": uom,
                "is_finished_item": 1,
                "transfer_qty": qty,
                "qty": qty,
                "use_serial_batch_fields": 1,
                "batch_no": new_batch_no,
                "spp_batch_number": sub_lot_number or new_batch_no  # Use sub_lot_number if available
            }
            
            # Add barcode data if provided
            if barcode_data and isinstance(barcode_data, dict):
                target_item["mix_barcode"] = barcode_data.get("barcode_text", new_batch_no)
                target_item["barcode_text"] = barcode_data.get("barcode_text", new_batch_no)
                target_item["barcode_attach"] = barcode_data.get("barcode", "")
            
            # Add source reference if provided
            if source_ref_document and source_ref_id:
                target_item["source_ref_document"] = source_ref_document
                target_item["source_ref_id"] = source_ref_id
            
            stock_entry.append("items", target_item)
            
        else:
            # Standard material transfer
            stock_entry.append("items", {
                "item_code": item_code,
                "s_warehouse": source_warehouse,
                "t_warehouse": target_warehouse,
                "stock_uom": uom,
                "to_uom": uom,
                "uom": uom,
                "is_finished_item": 0,
                "use_serial_batch_fields": 1 if batch_no else 0,
                "transfer_qty": qty,
                "qty": qty,
                "batch_no": batch_no
            })

        # Insert the Stock Entry into the database
        stock_entry.insert()
        stock_entry.submit()

        return stock_entry.name
    except Exception as e:
        frappe.throw(f"Failed to create Stock Entry: {str(e)}")