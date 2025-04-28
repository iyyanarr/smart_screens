# Copyright (c) 2025, alphaworkz and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document

class SPPLotResourceTagging(Document):
    pass
#     def validate(self):
#         pass
        
#     def on_submit(self):
#         try:
#             # Add your submission logic here
#             # For example, update status, create job cards, etc.
#             frappe.msgprint(f"SPP Lot Resource Tagging {self.name} submitted successfully")
#         except Exception as e:
#             frappe.log_error(
#                 message=f"Error submitting SPP Lot Resource Tagging {self.name}: {str(e)}\n{frappe.get_traceback()}",
#                 title="SPP Lot Resource Tagging Submission Error"
#             )
#             raise

# @frappe.whitelist()
# def get_location_by_role(user=None):
#     """
#     Get location mappings from Smart Screen Settings that match the current user's roles
#     for Lot Resource Tagging
    
#     Args:
#         user (str, optional): User to check roles for. Defaults to current user.
    
#     Returns:
#         list: List of matching location mappings
#     """
#     # Get user's roles - either specified user or current user
#     user = user or frappe.session.user
#     user_roles = frappe.get_roles(user)
    
#     # Get Smart Screen Settings
#     try:
#         settings = frappe.get_doc("Smart Screen Settings")
        
#         # Check if lot_resource_location_mapping exists and has entries
#         if not hasattr(settings, "lot_resource_location_mapping") or not settings.lot_resource_location_mapping:
#             return []
        
#         # Find matching role-location mappings
#         matching_locations = []
#         for mapping in settings.lot_resource_location_mapping:
#             # Explicitly check if the role in this mapping is in the user's roles
#             if mapping.role in user_roles:
#                 matching_locations.append({
#                     "role": mapping.role,
#                     "location": mapping.location,
#                     "source_warehouse": mapping.source_warehouse if hasattr(mapping, "source_warehouse") else None,
#                     "target_warehouse": mapping.target_warehouse if hasattr(mapping, "target_warehouse") else None,
#                     "stage": mapping.stage if hasattr(mapping, "stage") else None
#                 })
        
#         # Debug logging to help identify role matching issues
#         frappe.logger().debug(f"User: {user}, Roles: {user_roles}, Matching locations: {matching_locations}")
        
#         return matching_locations
    
#     except Exception as e:
#         frappe.log_error(f"Error fetching location by role for Lot Resource Tagging: {str(e)}")
#         return []
