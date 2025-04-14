# Copyright (c) 2025, alphaworkz and contributors
# For license information, please see license.txt

from frappe.model.document import Document
import frappe
from frappe import _

class SubLotEntry(Document):
    """
    SubLotEntry DocType for managing sub-lot creation from a parent batch.
    
    This document allows creating sub-lots with unique identifiers from a parent batch,
    including generating barcodes and creating necessary stock entries.
    """
    
    def validate(self):
        """
        Validations handled in frontend, pass through here.
        """
        pass

@frappe.whitelist()
def get_location_by_role(user=None):
    """
    Get location mappings from Smart Screen Settings that match the current user's roles
    
    Args:
        user (str, optional): User to check roles for. Defaults to current user.
    
    Returns:
        list: List of matching location mappings
    """
    # Get user's roles - either specified user or current user
    user = user or frappe.session.user
    user_roles = frappe.get_roles(user)
    
    # Get Smart Screen Settings
    try:
        settings = frappe.get_doc("Smart Screen Settings")
        
        # Check if sublot_location_mapping exists and has entries
        if not hasattr(settings, "sublot_location_mapping") or not settings.sublot_location_mapping:
            return []
        
        # Find matching role-location mappings
        matching_locations = []
        for mapping in settings.sublot_location_mapping:
            # Explicitly check if the role in this mapping is in the user's roles
            if mapping.role in user_roles:
                matching_locations.append({
                    "role": mapping.role,
                    "location": mapping.location,
                    "source_warehouse": mapping.source_warehouse if hasattr(mapping, "source_warehouse") else None,
                    "target_warehouse": mapping.target_warehouse if hasattr(mapping, "target_warehouse") else None,
                    "stage": mapping.stage if hasattr(mapping, "stage") else None,
                    "transaction_type": mapping.transaction_type if hasattr(mapping, "transaction_type") else None
                })
        
        # Debug logging to help identify role matching issues
        frappe.logger().debug(f"User: {user}, Roles: {user_roles}, Matching locations: {matching_locations}")
        
        return matching_locations
    
    except Exception as e:
        frappe.log_error(f"Error fetching location by role: {str(e)}")
        return []



