import frappe

@frappe.whitelist()
def get_inspection_types():
    """Returns the list of inspection types allowed for the current user based on roles"""
    
    inspection_types = []
    
    if "Line Inspector" in frappe.get_roles(frappe.session.user):
        inspection_types.append('Line Inspection')
    
    if "Lot Inspector" in frappe.get_roles(frappe.session.user):
        inspection_types.append('Lot Inspection')
    
    if "Incoming Inspector" in frappe.get_roles(frappe.session.user):
        inspection_types.append("Incoming Inspection")
    
    if any(role in frappe.get_roles(frappe.session.user) for role in ["Packer", "U1 Supervisor"]):
        inspection_types.append("Final Visual Inspection")
    
    if "Quality Executive" in frappe.get_roles(frappe.session.user):
        inspection_types.append("Patrol Inspection")
    
    # If user is admin or no specific roles matched, return all inspection types
    if not inspection_types or "Administrator" in frappe.get_roles(frappe.session.user):
        inspection_types = [
            "Line Inspection", 
            "Lot Inspection", 
            "Incoming Inspection", 
            "Final Visual Inspection", 
            "Patrol Inspection"
        ]
    
    return inspection_types

@frappe.whitelist()
def get_processing_stages():
    """Returns the list of processing stages for finishing operations"""
    
    return [
        {"id": "post_curing", "name": "Post Curing", "description": "Process of further curing polymers after initial molding"},
        {"id": "od_trimming", "name": "OD Trimming", "description": "Outer Diameter trimming operations"},
        {"id": "id_trimming", "name": "ID Trimming", "description": "Inner Diameter trimming operations"},
        {"id": "final_visual", "name": "Final Visual Inspection", "description": "Final quality check before packaging"}
    ]