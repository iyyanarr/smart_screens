# Copyright (c) 2025, alphaworkz and contributors
# For license information, please see license.txt

import frappe
import json
from frappe.utils import now_datetime

def create_transaction_log(transaction_type, batch_number, item_code, warehouse, quantity, 
                          reference_document_type=None, reference_document=None, 
                          sublot_process=None, sublot_entry=None, status="Success", 
                          details=None):
    """
    Create a SubLot Transaction Log entry to track stock operations.
    
    Args:
        transaction_type (str): Type of transaction (Stock Reconciliation, Material Receipt, Repack)
        batch_number (str): Batch number being processed
        item_code (str): Item code being processed
        warehouse (str): Warehouse where the transaction occurs
        quantity (float): Quantity being processed
        reference_document_type (str, optional): Type of reference document
        reference_document (str, optional): ID of reference document
        sublot_process (str, optional): SubLot Process document ID
        sublot_entry (str, optional): SubLot Entry document ID
        status (str, optional): Status of the transaction (Success/Failed)
        details (str/dict, optional): Additional details (will be converted to JSON if dict)
    
    Returns:
        str: Name of the created log entry
    """
    try:
        # Convert details to string if it's a dictionary
        if isinstance(details, dict):
            details = json.dumps(details, indent=2)
            
        # Get the docname from form_dict if available (for sublot_entry)
        if not sublot_entry and frappe.form_dict.get("docname"):
            sublot_entry = frappe.form_dict.get("docname")
            
        # Create the transaction log
        log = frappe.get_doc({
            "doctype": "SubLot Transaction Log",
            "transaction_type": transaction_type,
            "batch_number": batch_number,
            "item_code": item_code,
            "warehouse": warehouse,
            "quantity": quantity,
            "reference_document_type": reference_document_type,
            "reference_document": reference_document,
            "sublot_process": sublot_process,
            "sublot_entry": sublot_entry,
            "status": status,
            "timestamp": now_datetime(),
            "user": frappe.session.user,
            "details": details
        })
        
        log.insert(ignore_permissions=True)
        frappe.db.commit()
        
        print(f"Created transaction log: {log.name} for {transaction_type} of {quantity} {item_code} in {warehouse}")
        return log.name
        
    except Exception as e:
        print(f"Failed to create transaction log: {str(e)}")
        frappe.log_error(
            message=f"Failed to create SubLot Transaction Log: {str(e)}",
            title="SubLot Transaction Log Error"
        )
        return None