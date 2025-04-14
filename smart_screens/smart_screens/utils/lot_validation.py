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
    
    # Fixed query - removed reference to non-existent se.mix_barcode column
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
            AND sed.mix_barcode = %s
            AND sed.is_finished_item = 1
        LIMIT 1
    """, (stage, mixed_barcode), as_dict=1)

    if not result:
        # Try one more approach if the first fails
        try:
            # First check if mix_barcode exists in any Stock Entry Detail
            entry_details = frappe.db.sql("""
                SELECT 
                    sed.batch_no, 
                    sed.item_code,
                    sed.parent as stock_entry_name
                FROM 
                    `tabStock Entry Detail` sed
                INNER JOIN
                    `tabItem` item ON sed.item_code = item.name
                INNER JOIN
                    `tabStock Entry` se ON sed.parent = se.name
                WHERE 
                    sed.mix_barcode = %s
                    AND item.item_group = %s
                    AND se.stock_entry_type = 'Manufacture'
                    AND sed.is_finished_item = 1
                LIMIT 1
            """, (mixed_barcode, stage), as_dict=1)
            
            if entry_details:
                result = entry_details
            else:
                # If still not found, try the alternative approach
                stock_entry_details = frappe.db.sql("""
                    SELECT name 
                    FROM `tabStock Entry` 
                    WHERE stock_entry_type = 'Manufacture' 
                    AND docstatus = 1
                """, as_dict=1)
                
                if stock_entry_details:
                    # Check each stock entry for matching detail records
                    for se in stock_entry_details:
                        entry_details = frappe.get_all(
                            "Stock Entry Detail",
                            filters={
                                "parent": se.name,
                                "is_finished_item": 1,
                                "mix_barcode": mixed_barcode
                            },
                            fields=["batch_no", "item_code"]
                        )
                        
                        if entry_details:
                            item = frappe.get_doc("Item", entry_details[0].item_code)
                            if item.item_group == stage:
                                result = [{
                                    "batch_no": entry_details[0].batch_no,
                                    "item_code": entry_details[0].item_code,
                                    "stock_entry_name": se.name
                                }]
                                break
        except Exception as e:
            frappe.logger().error(f"Error in alternative lookup: {e}")
    
    if not result:
        frappe.throw(f"No Stock Entry found for Mixed Barcode: {mixed_barcode} and Stage: {stage}")

    fg_batch_no = result[0].get("batch_no")
    item_code = result[0].get("item_code")
    stock_entry_name = result[0].get("stock_entry_name")

    # Get Batch Quantity with optimized query
    batch_qty_result = frappe.db.sql("""
        SELECT 
            SUM(actual_qty) as qty
        FROM 
            `tabStock Ledger Entry`
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