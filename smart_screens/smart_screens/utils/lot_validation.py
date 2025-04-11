import frappe
from frappe.utils import flt

@frappe.whitelist()
def Lot_validation(mixed_barcode, stage, warehouse):
    """
    Validate the lot by querying stock entry and batch details using Frappe ORM.

    Args:
        mixed_barcode (str): The mixed barcode to validate.
        stage (str): The item group (stage) to filter.
        warehouse (str): The warehouse to check the batch quantity.

    Returns:
        dict: A dictionary containing the item code, warehouse, batch number, and batch quantity available in the warehouse.
    """
    # Step 1: Query Stock Entry for the given mixed_barcode, stage, and type 'Manufacture'
    stock_entry = frappe.get_all(
        "Stock Entry",
        filters={
            "stock_entry_type": "Manufacture",
            "item_group": stage,
            "mix_barcode": mixed_barcode,
            "is_finished_item": 1
        },
        fields=["name"],
        limit_page_length=1
    )

    if not stock_entry:
        frappe.throw(f"No Stock Entry found for Mixed Barcode: {mixed_barcode} and Stage: {stage}")

    stock_entry_name = stock_entry[0].get("name")

    # Step 2: Get Finished Goods Batch Number and Item Code from Stock Entry Detail
    fg_batch = frappe.get_all(
        "Stock Entry Detail",
        filters={
            "parent": stock_entry_name,
            "is_finished_item": 1
        },
        fields=["batch_no", "item_code"],
        limit_page_length=1
    )

    if not fg_batch:
        frappe.throw(f"No Finished Goods Batch found for Stock Entry: {stock_entry_name}")

    fg_batch_no = fg_batch[0].get("batch_no")
    item_code = fg_batch[0].get("item_code")

    # Step 3: Get Batch Quantity in the specified warehouse
    batch_quantity = frappe.get_all(
        "Item Batch Stock Balance",
        filters={
            "batch_no": fg_batch_no,
            "warehouse": warehouse
        },
        fields=["qty"],
        limit_page_length=1
    )

    if not batch_quantity:
        frappe.throw(f"No Batch Quantity found for Batch: {fg_batch_no} in Warehouse: {warehouse}")

    quantity = flt(batch_quantity[0].get("qty"))

    # Return the results
    return {
        "item_code": item_code,
        "warehouse": warehouse,
        "batch_no": fg_batch_no,
        "batch_quantity": quantity
    }