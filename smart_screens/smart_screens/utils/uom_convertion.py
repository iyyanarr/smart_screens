import frappe

@frappe.whitelist()
def get_uom_details(item_code):
    """
    Fetch the UOM details of an item in ERPNext.

    Args:
        item_code (str): The item code for which UOM details are to be fetched.

    Returns:
        dict: A dictionary containing UOM details of the item.
    """
    if not item_code:
        frappe.throw("Item Code is required to fetch UOM details.")

    try:
        # Fetch the UOM details from the Item doctype
        item = frappe.get_doc("Item", item_code)

        # Extract UOM details
        uom_details = {
            "default_uom": item.stock_uom,
            "conversion_factors": []
        }

        # Fetch UOM conversion details from the UOM Conversion table
        if item.uoms:
            for uom in item.uoms:
                uom_details["conversion_factors"].append({
                    "uom": uom.uom,
                    "conversion_factor": uom.conversion_factor
                })

        return uom_details
    except frappe.DoesNotExistError:
        frappe.throw(f"Item {item_code} does not exist.")
    except Exception as e:
        frappe.throw(f"Failed to fetch UOM details: {str(e)}")