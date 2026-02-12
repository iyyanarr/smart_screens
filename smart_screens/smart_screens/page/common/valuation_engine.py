import frappe
from frappe.utils import flt
import requests
import json
import re

def get_valuation_rate(item_code, item_group=None):
    """
    Calculate the valuation rate for a single item based on its group/category.
    """
    if not item_group:
        item_group = frappe.db.get_value("Item", item_code, "item_group")
    
    # 1. RM (Raw Material)
    if is_raw_material(item_group):
        return get_last_purchase_rate(item_code)
    
    # 2. Batch
    if item_group == "Batch":
        # Try specified item code first
        rate = get_bom_rate(item_code)
        if rate == 0:
            base_code = get_base_code(item_code)
            rate = get_bom_rate(base_code)
            if rate == 0 and base_code != item_code:
                rate = get_bom_rate("B_" + base_code)
        return rate
    
    # 3. Master Batch
    if item_group == "Master Batch":
        # First try the Master Batch's own BOM (to catch all layers/FB items)
        rate = get_bom_rate(item_code)
        if rate == 0:
            base_code = get_base_code(item_code)
            # Fallback to Batch BOM
            rate = get_bom_rate("B_" + base_code)
            if rate == 0:
                rate = get_bom_rate(base_code)
        return rate + 40.0
    
    # 4. Compound
    if item_group == "Compound":
        # First try the Compound's own BOM (flattens all layers including FB)
        rate = get_bom_rate(item_code)
        if rate == 0:
            base_code = get_base_code(item_code)
            # Fallback to Batch BOM
            rate = get_bom_rate("B_" + base_code)
            if rate == 0:
                rate = get_bom_rate(base_code)
        return rate + 85.0
    
    # Selling Price based categories
    selling_price = None
    
    # 5. MAT
    if item_group == "Mat":
        selling_price = get_selling_price_rate(item_code)
        return selling_price * 0.50
    
    # 6. Product
    if item_group == "Products":
        selling_price = get_selling_price_rate(item_code)
        return selling_price * 0.75
    
    # 7. FG
    if item_group in ["Finished Product", "Finished Products"]:
        selling_price = get_selling_price_rate(item_code)
        return selling_price * 0.90
    
    # Default fallback to standard valuation rate
    return flt(frappe.db.get_value("Item", item_code, "valuation_rate"))

def is_raw_material(item_group):
    rm_groups = ["Raw Material", "Additive", "Bulk Material", "Carbon", "Chemical", "Chemicals", "Fine Chemical", "Plastisizer", "Rubber", "Addittive"]
    return item_group in rm_groups

def get_bulk_valuation_rates(items_data):
    """
    items_data: list of dicts with {'item_code': ..., 'item_group': ...}
    Returns a dict mapping item_code -> rate
    """
    rates = {}
    
    # Batch processing for optimization
    mat_prod_fg_items = []
    
    for item in items_data:
        item_code = item.get('item_code') or item.get('item')
        item_group = item.get('item_group')
        
        if not item_code: continue
        
        if item_group in ["Mat", "Products", "Finished Product", "Finished Products"]:
            mat_prod_fg_items.append(item_code)
        else:
            rate = get_valuation_rate(item_code, item_group)
            rates[item_code] = rate
            
    # Bulk fetch remote prices for MAT/Product/FG
    if mat_prod_fg_items:
        prices = fetch_all_remote_prices(mat_prod_fg_items)
        for item_code in mat_prod_fg_items:
            item_group = next((i.get('item_group') for i in items_data if (i.get('item_code') or i.get('item')) == item_code), None)
            price = prices.get(convert_to_finished_product_code(item_code), 0)
            
            # Local fallback if remote failed
            if price == 0:
                price = flt(frappe.db.get_value('Item Price', 
                                              {'item_code': item_code, 'price_list': 'Standard Selling'}, 
                                              'price_list_rate'))
            
            factor = 0
            if item_group == "Mat":
                factor = 0.50
            elif item_group == "Products":
                factor = 0.75
            else: # FG
                factor = 0.90
            rates[item_code] = price * factor
                
    return rates

def get_last_purchase_rate(item_code):
    """Fetch last purchase rate from PR/PI"""
    # Check Purchase Receipt
    pr_rate = frappe.db.sql("""
        SELECT pri.base_rate
        FROM `tabPurchase Receipt Item` pri
        JOIN `tabPurchase Receipt` pr ON pri.parent = pr.name
        WHERE pri.item_code = %s AND pr.docstatus = 1
        ORDER BY pr.posting_date DESC, pr.posting_time DESC
        LIMIT 1
    """, (item_code,))
    
    if pr_rate:
        return flt(pr_rate[0][0])
        
    # Check Purchase Invoice
    pi_rate = frappe.db.sql("""
        SELECT pii.base_rate
        FROM `tabPurchase Invoice Item` pii
        JOIN `tabPurchase Invoice` pi ON pii.parent = pi.name
        WHERE pii.item_code = %s AND pi.docstatus = 1
        ORDER BY pi.posting_date DESC, pi.posting_time DESC
        LIMIT 1
    """, (item_code,))
    
    if pi_rate:
        return flt(pi_rate[0][0])
        
    # Final fallback to valuation_rate
    return flt(frappe.db.get_value("Item", item_code, "valuation_rate"))

def get_bom_rate(item_code):
    """
    Calculate rate (per unit) by summing current rates of ingredients 
    fetching from Purchase Receipts instead of stale BOM.total_cost.
    """
    if not item_code: return 0.0
    
    # 1. Get the active/default BOM name
    bom_name = frappe.db.get_value("BOM", 
                                  {"item": item_code, "is_active": 1, "is_default": 1}, 
                                  "name")
    
    if not bom_name:
        bom_name = frappe.db.get_value("BOM", 
                                      {"item": item_code, "is_active": 1}, 
                                      "name", order_by="creation desc")
                                      
    if not bom_name:
        return 0.0
    
    # 2. Get the BOM quantity (batch size)
    bom_qty = flt(frappe.db.get_value("BOM", bom_name, "quantity")) or 1.0

    # 3. Traverse Exploded Items (the raw materials)
    exploded_items = frappe.get_all("BOM Explosion Item", 
                                     filters={"parent": bom_name}, 
                                     fields=["item_code", "stock_qty"])
    
    total_recalculated_cost = 0.0
    
    # Batch fetch item groups for ingredients to optimize
    ingredient_codes = [i.item_code for i in exploded_items]
    item_groups = {it.name: it.item_group for it in frappe.get_all("Item", 
                                                                  filters={"name": ["in", ingredient_codes]}, 
                                                                  fields=["name", "item_group"])}
    
    for ingredient in exploded_items:
        ing_code = ingredient.item_code
        ing_qty = flt(ingredient.stock_qty)
        
        # Get REAL current rate for the ingredient
        ing_rate = 0.0
        ing_group = item_groups.get(ing_code)
        
        if is_raw_material(ing_group):
            ing_rate = get_last_purchase_rate(ing_code)
        else:
            # For semi-finished ingredients, use standard valuation rate
            ing_rate = flt(frappe.db.get_value("Item", ing_code, "valuation_rate"))
            
        total_recalculated_cost += (ing_qty * ing_rate)
        
    return total_recalculated_cost / bom_qty if bom_qty > 0 else 0.0

def get_base_code(item_code):
    """Extract base code by removing prefixes (B_, MB_, C_, etc.)"""
    if not item_code: return None
    
    item_code = str(item_code).strip()
    
    # Prefix list (same as in aggregated_report_core)
    prefixes = ['CMB_D', 'CMB_', 'MB_', 'B_', 'C_', 'BC_']
    base_code = item_code
    
    for prefix in prefixes:
        if item_code.upper().startswith(prefix.upper()):
            base_code = item_code[len(prefix):]
            break
            
    # Handle version suffixes (v1, v2, etc.)
    version_match = re.search(r'[vV]\d+$', base_code)
    if version_match:
        base_code = base_code[:version_match.start()]
        
    # Handle spaces
    if ' ' in base_code:
        base_code = base_code.split(' ')[0]
        
    return base_code

def get_selling_price_rate(item_code):
    """Fetch Selling Price (Remote with Local fallback)"""
    f_code = convert_to_finished_product_code(item_code)
    remote_prices = fetch_all_remote_prices([item_code])
    rate = remote_prices.get(f_code, 0)
    
    if rate == 0:
        rate = frappe.db.get_value("Item Price", 
                                    {"item_code": item_code, "price_list": "Standard Selling"}, 
                                    "price_list_rate")
    
    return flt(rate)

# --- Remote Pricing Logic from rejection_analysis ---

def fetch_all_remote_prices(item_codes):
    """Fetch multiple prices from remote Sales site"""
    finished_codes = [convert_to_finished_product_code(c) for c in item_codes if c]
    return fetch_remote_item_prices(finished_codes)

def get_remote_pricing_config():
    """Get remote pricing configuration"""
    try:
        settings = frappe.get_single("Rejection Analysis Settings")
        remote_url = settings.sales_site_url or ""
        api_key = settings.sales_site_api_key or ""
        api_secret = settings.get_password("sales_site_api_secret") or ""
    except Exception:
        remote_url = frappe.conf.get("sales_site_url") or ""
        api_key = frappe.conf.get("sales_site_api_key") or ""
        api_secret = frappe.conf.get("sales_site_api_secret") or ""
    
    return remote_url, api_key, api_secret

def convert_to_finished_product_code(item_code):
    if not item_code: return None
    cleaned = item_code.strip().replace('t.', '').replace('T.', '').split()[0].upper()
    if cleaned.startswith('T') or cleaned.startswith('P'):
        return 'F' + cleaned[1:]
    return cleaned

def fetch_remote_item_prices(item_codes):
    if not item_codes: return {}
    remote_url, api_key, api_secret = get_remote_pricing_config()
    if not (remote_url and api_key and api_secret): return {}
    
    item_codes = list(set(item_codes))
    chunk_size = 50
    price_map = {}
    
    for i in range(0, len(item_codes), chunk_size):
        chunk = item_codes[i:i + chunk_size]
        try:
            filters = [["item_code", "in", chunk], ["price_list", "=", "Standard Selling"]]
            fields = ["item_code", "price_list_rate"]
            response = requests.get(
                f"{remote_url}/api/resource/Item Price",
                params={"filters": json.dumps(filters), "fields": json.dumps(fields), "limit_page_length": chunk_size},
                headers={"Authorization": f"token {api_key}:{api_secret}"},
                timeout=10
            )
            if response.status_code == 200:
                for item_price in response.json().get("data", []):
                    price_map[item_price.get("item_code")] = flt(item_price.get("price_list_rate", 0))
        except Exception:
            continue
    return price_map
