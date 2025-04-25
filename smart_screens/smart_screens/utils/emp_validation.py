import frappe
from frappe import _
from frappe.utils import cint, cstr


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





@frappe.whitelist()
def validate_employee_designation(employee_code):
    """
    Validate employee designation against Smart Screen Settings.
    
    Args:
        employee_code (str): ERPNext Employee code/ID
        
    Returns:
        dict: A dictionary containing validation results with keys:
            - success (bool): Whether validation was successful
            - message (str): Message to display to user
            - employee (dict): Employee details if found
            - designation (str): Employee designation if found
            - allowed_operations (list): List of operations allowed for this designation
    """
    if not employee_code:
        return {
            "success": False,
            "message": "Employee code is required",
            "employee": None,
            "designation": None,
            "allowed_operations": []
        }
    
    try:
        # Get employee details
        employee = frappe.get_doc("Employee", employee_code)
        
        if not employee:
            return {
                "success": False,
                "message": f"Employee with code {employee_code} not found",
                "employee": None,
                "designation": None,
                "allowed_operations": []
            }
        
        # Get employee designation
        designation = employee.designation
        
        if not designation:
            return {
                "success": False,
                "message": f"Employee {employee.first_name} does not have a designation assigned",
                "employee": {
                    "name": employee.name,
                    "employee_name": employee.first_name,
                    "designation": None
                },
                "designation": None,
                "allowed_operations": []
            }
        
        # Query the Lot Resource Role Mapper child table directly to find operations for this designation
        operations_list = frappe.get_all(
            "Lot Resource Role Mapper",
            filters={
                "designation": designation,
                "parent": "Smart Screen Settings"
            },
            fields=["operation"]
        )
        
        allowed_operations = [op.operation for op in operations_list if op.operation]
        
        # Return results
        if allowed_operations:
            return {
                "success": True,
                "message": f"Employee {employee.first_name} has designation {designation} with {len(allowed_operations)} allowed operations",
                "employee": {
                    "name": employee.name,
                    "employee_name": employee.first_name,
                    "designation": designation
                },
                "designation": designation,
                "allowed_operations": allowed_operations
            }
        else:
            return {
                "success": False,
                "message": f"Employee designation {designation} does not have any allowed operations",
                "employee": {
                    "name": employee.name,
                    "employee_name": employee.first_name,
                    "designation": designation
                },
                "designation": designation,
                "allowed_operations": []
            }
            
    except Exception as e:
        frappe.log_error(f"Error validating employee designation: {str(e)}", "Employee Validation Error")
        return {
            "success": False,
            "message": f"Error validating employee: {str(e)}",
            "employee": None,
            "designation": None,
            "allowed_operations": []
        }