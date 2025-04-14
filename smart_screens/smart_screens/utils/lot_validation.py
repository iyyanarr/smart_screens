import frappe
from frappe.utils import flt
import time

@frappe.whitelist()
def Lot_validation(mixed_barcode, stage, warehouse):
    """
    Validate the lot by querying stock entry and batch details using Frappe ORM.
    Optimized version to improve performance.

    Args:
        mixed_barcode (str): The mixed barcode to validate.
        stage (str): The item group (stage) to filter.
        warehouse (str): The warehouse to check the batch quantity.

    Returns:
        dict: A dictionary containing the item code, warehouse, batch number, and batch quantity available in the warehouse.
    """
    start_time = time.time()
    
    # Fixed query - removed the non-existent se.item_group column
    # Item group might be in the Stock Entry Detail table or need to join with Item table
    result = frappe.db.sql("""
        SELECT 
            sed.batch_no, 
            sed.item_code,
            se.name as stock_entry_name
        FROM 
            `tabStock Entry` se
        INNER JOIN 
            `tabStock Entry Detail` sed ON se.name = sed.parent
        INNER JOIN
            `tabItem` item ON sed.item_code = item.name
        WHERE 
            se.stock_entry_type = 'Manufacture'
            AND item.item_group = %s
            AND se.mix_barcode = %s
            AND sed.is_finished_item = 1
        LIMIT 1
    """, (stage, mixed_barcode), as_dict=1)

    if not result:
        frappe.throw(f"No Stock Entry found for Mixed Barcode: {mixed_barcode} and Stage: {stage}")

    fg_batch_no = result[0].get("batch_no")
    item_code = result[0].get("item_code")
    stock_entry_name = result[0].get("stock_entry_name")

    # Get Batch Quantity with optimized query
    batch_qty_result = frappe.db.sql("""
        SELECT 
            SUM(qty) as qty
        FROM 
            `tabItem Batch Stock Balance`
        WHERE 
            batch_no = %s
            AND warehouse = %s
    """, (fg_batch_no, warehouse), as_dict=1)

    if not batch_qty_result or not batch_qty_result[0].get("qty"):
        frappe.throw(f"No Batch Quantity found for Batch: {fg_batch_no} in Warehouse: {warehouse}")

    quantity = flt(batch_qty_result[0].get("qty"))
    
    # Get UOM information for the item
    uom = frappe.db.get_value("Item", item_code, "stock_uom")
    
    # Log performance metrics
    execution_time = time.time() - start_time
    frappe.logger().info(f"Lot_validation execution time: {execution_time:.2f}s for barcode: {mixed_barcode}")

    # Return the results
    return {
        "item_code": item_code,
        "warehouse": warehouse,
        "batch_no": fg_batch_no,
        "batch_quantity": quantity,
        "uom": uom,
        "stock_entry": stock_entry_name
    }