
import frappe
from frappe.utils import getdate

def analyze_nov_2025_data():
    start_date = "2025-11-01"
    end_date = "2025-11-30"
    
    # 1. Fetch Sub Lot Process records for Nov 2025
    processes = frappe.get_all(
        "Sub Lot Process",
        filters={
            "creation": ["between", [start_date, end_date]],
            "docstatus": 1  # Only submitted ones
        },
        fields=["name", "batch_no", "creation", "spp_batch_number"]
    )
    
    print(f"Total Submitted Sub Lot Processes in Nov 2025: {len(processes)}")
    
    if not processes:
        return

    # 2. Extract Batch IDs
    batch_map = {p['batch_no']: p for p in processes if p['batch_no']}
    batches = list(batch_map.keys())
    
    if not batches:
        print("No batches found in the processes.")
        return

    # 3. Find Stock Reconciliations for these batches
    # We look for Stock Reconciliation Items containing these batches
    # We join with the parent to ensure it's submitted and check dates if needed (but batch match is strong signal)
    reconciliations = frappe.db.sql("""
        SELECT 
            sri.batch_no, sr.name as reconciliation_name, sr.creation
        FROM 
            `tabStock Reconciliation Item` sri
        JOIN 
            `tabStock Reconciliation` sr ON sri.parent = sr.name
        WHERE 
            sri.batch_no IN %(batches)s
            AND sr.docstatus = 1
            AND sr.creation >= %(start_date)s
    """, {
        "batches": batches,
        "start_date": start_date
    }, as_dict=True)
    
    valid_reconciliations = {}
    for r in reconciliations:
        valid_reconciliations[r.batch_no] = r.reconciliation_name
        
    # 4. Correlate and Report
    with_recon = []
    without_recon = []
    
    for p in processes:
        batch = p.get('batch_no')
        if batch and batch in valid_reconciliations:
            with_recon.append({
                "process": p['name'],
                "batch": batch,
                "recon": valid_reconciliations[batch]
            })
        else:
            without_recon.append({
                "process": p['name'],
                "batch": batch
            })
            
    print(f"\nAnalysis Results:")
    print(f"Processes WITH Stock Reconciliation: {len(with_recon)}")
    print(f"Processes WITHOUT Stock Reconciliation: {len(without_recon)}")
    
    print("\nSample WITH Reconciliation (first 5):")
    for item in with_recon[:5]:
        print(f"  Process: {item['process']}, Batch: {item['batch']} -> Recon: {item['recon']}")
        
    print("\nSample WITHOUT Reconciliation (first 5):")
    for item in without_recon[:5]:
        print(f"  Process: {item['process']}, Batch: {item['batch']}")

# No direct call at the end, so it can be imported and executed by bench execute
