import frappe
from frappe import _

@frappe.whitelist()
def get_moulding_job_cards(batch_code):
    """Get all moulding job cards for a specific batch code (Production Lot Number)"""
    if not batch_code:
        return []
    
    job_cards = frappe.db.sql("""
        SELECT 
            jc.name,
            jc.work_order,
            jc.production_item,
            jc.item_name,
            jc.bom_no,
            jc.operation,
            jc.workstation,
            jc.employee_name,
            jc.posting_date,
            jc.total_completed_qty,
            jc.total_time_in_mins,
            jc.status,
            jc.batch_code,
            wo.qty as work_order_qty,
            wo.produced_qty,
            jc.for_quantity
        FROM 
            `tabJob Card` jc
        LEFT JOIN 
            `tabWork Order` wo ON jc.work_order = wo.name
        WHERE 
            LOWER(jc.batch_code) = LOWER(%(batch_code)s)
            AND jc.operation = 'Moulding'
        ORDER BY 
            jc.creation ASC
    """, {"batch_code": batch_code}, as_dict=True)
    
    return job_cards

@frappe.whitelist()
def get_production_lot_info(batch_code):
    """Get job card details for a batch code"""
    if not batch_code:
        return {}
    
    # Get first job card with this batch code
    job_card = frappe.db.get_value("Job Card", 
        {"batch_code": batch_code, "operation": "Moulding"}, 
        ["name", "work_order", "production_item", "item_name", "bom_no", "for_quantity",
         "workstation", "company", "status", "posting_date"],
        as_dict=True)
    
    return job_card or {}

@frappe.whitelist()
def print_moulding_job_cards(job_card_names, print_format="Job Card For Moulding 100*100", copies=1):
    """Generate print URLs for multiple job cards"""
    if not job_card_names:
        return []
    
    if isinstance(job_card_names, str):
        import json
        job_card_names = json.loads(job_card_names)
    
    print_urls = []
    
    for job_card in job_card_names:
        # Use printview instead of download_pdf to avoid wkhtmltopdf issues
        print_url = frappe.utils.get_url(
            f"/printview?doctype=Job%20Card&name={job_card}&trigger_print=1&format={print_format}&no_letterhead=0"
        )
        
        print_urls.append({
            "job_card": job_card,
            "print_url": print_url,
            "copies": int(copies)
        })
    
    return print_urls

@frappe.whitelist()
def get_print_formats():
    """Get available print formats for Job Card"""
    print_formats = frappe.get_all("Print Format", 
        filters={"doc_type": "Job Card", "disabled": 0},
        fields=["name", "print_format_type"],
        order_by="name"
    )
    
    return print_formats
