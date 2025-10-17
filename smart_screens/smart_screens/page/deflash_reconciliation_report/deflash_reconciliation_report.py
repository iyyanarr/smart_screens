# Copyright (c) 2025, Tridotstech and contributors
# For license information, please see license.txt

import frappe
from frappe.utils import flt, getdate

@frappe.whitelist()
def get_deflash_reconciliation_data(date_type='sent', from_date=None, to_date=None, item=None, deflash_vendor=None):
    """
    Fetch Deflash Reconciliation Report data with flexible date filtering
    date_type: 'sent' or 'received' to determine which date field to filter on
    """
    try:
        conditions = []
        params = {}
        
        # Date filters based on selected type
        if date_type == 'sent':
            # Filter by Date Sent (Deflashing Despatch Entry posting_date)
            if from_date:
                conditions.append("DDE.posting_date >= %(from_date)s")
                params['from_date'] = from_date
            
            if to_date:
                conditions.append("DDE.posting_date <= %(to_date)s")
                params['to_date'] = to_date
        elif date_type == 'received':
            # Filter by Date Received (Deflashing Receipt Entry posting_date)
            if from_date:
                conditions.append("DRE.posting_date >= %(from_date)s")
                params['from_date'] = from_date
            
            if to_date:
                conditions.append("DRE.posting_date <= %(to_date)s")
                params['to_date'] = to_date
        
        if item:
            conditions.append("DDEI.item = %(item)s")
            params['item'] = item
        
        if deflash_vendor:
            conditions.append("DDE.scan_deflashing_vendor = %(deflash_vendor)s")
            params['deflash_vendor'] = deflash_vendor
        
        where_clause = " AND ".join(conditions) if conditions else "1=1"
        
        query = f"""
            SELECT 
                DDEI.item as item,
                DDEI.lot_number as lot_no,
                DRE.name as receipt_id,
                DDE.posting_date as date_sent,
                DRE.posting_date as date_received,
                DDE.scan_deflashing_vendor as deflash_person,
                DRE.owner as receiving_person,
                DDEI.qty as qty_sent_kg,
                DDEI.qty_in_nos as qty_sent_nos,
                DRE.product_weight as qty_received_kg,
                DRE.qty_in_nos as qty_received_nos,
                DRE.difference_nos as difference_nos,
                DRE.scrap_expected_per_piece_gms as scrap_expected_per_piece,
                DRE.total_scrap_expected_kg as scrap_expected_kg,
                DRE.actual_scrap_kg as scrap_actual_kg,
                DRE.scrap_difference_kg as scrap_difference_kg,
                DRE.qty_despatched_nos,
                DRE.qty_received_nos
            FROM 
                `tabDeflashing Despatch Entry Item` DDEI
            INNER JOIN 
                `tabDeflashing Despatch Entry` DDE ON DDEI.parent = DDE.name
            LEFT JOIN 
                `tabDeflashing Receipt Entry` DRE ON DRE.scan_lot_number = DDEI.lot_number
                AND DRE.item = DDEI.item
                AND DRE.docstatus = 1
            WHERE 
                DDE.docstatus = 1
                AND {where_clause}
            ORDER BY 
                DDE.posting_date DESC, DDEI.lot_number
        """
        
        data = frappe.db.sql(query, params, as_dict=1)
        
        # Calculate percentages
        for row in data:
            # Difference %
            if row.get('qty_sent_nos') and row.get('qty_sent_nos') > 0:
                row['difference_percent'] = round(
                    (flt(row.get('difference_nos', 0)) / flt(row.get('qty_sent_nos'))) * 100, 2
                )
            else:
                row['difference_percent'] = 0
            
            # Scrap Difference %
            if row.get('scrap_expected_kg') and row.get('scrap_expected_kg') > 0:
                row['scrap_difference_percent'] = round(
                    (flt(row.get('scrap_difference_kg', 0)) / flt(row.get('scrap_expected_kg'))) * 100, 2
                )
            else:
                row['scrap_difference_percent'] = 0
        
        return {
            'status': 'success',
            'data': data
        }
    
    except Exception as e:
        frappe.log_error(
            message=frappe.get_traceback(),
            title="Deflash Reconciliation Report Error"
        )
        return {
            'status': 'error',
            'message': str(e)
        }
