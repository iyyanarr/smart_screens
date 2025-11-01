#!/usr/bin/env python3
"""
Migration script to populate OEE Reason Code DocType with existing hardcoded reason codes.
Run this script after installing the DocType to migrate existing codes.

Usage:
    bench --site sppmaster.local execute smart_screens.smart_screens.doctype.oee_reason_code.populate_reason_codes.populate_initial_codes
"""

import frappe
from frappe import _

def populate_initial_codes():
    """
    Populate OEE Reason Code DocType with initial reason codes.
    This function is idempotent - safe to run multiple times.
    """
    
    # Define initial reason codes with metadata
    initial_codes = [
        {
            "reason_code": "COMPOUND SHORTAGE",
            "description": "Shortage of raw compound material required for production",
            "category": "Material",
            "priority": "High",
            "sort_order": 1,
            "color_code": "#ffc107"
        },
        {
            "reason_code": "MACHINE BREAKDOWN",
            "description": "Machine failure or breakdown causing production stoppage",
            "category": "Machine",
            "priority": "Critical",
            "sort_order": 2,
            "color_code": "#dc3545"
        },
        {
            "reason_code": "MLD CHANGE",
            "description": "Mould changeover or replacement activity",
            "category": "Process",
            "priority": "Medium",
            "sort_order": 3,
            "color_code": "#17a2b8"
        },
        {
            "reason_code": "MLD WASH / CLEAN",
            "description": "Mould cleaning or washing activity",
            "category": "Process",
            "priority": "Medium",
            "sort_order": 4,
            "color_code": "#17a2b8"
        },
        {
            "reason_code": "OPERATOR ISSUE",
            "description": "Issues related to operator performance or availability",
            "category": "Operator",
            "priority": "Medium",
            "sort_order": 5,
            "color_code": "#fd7e14"
        },
        {
            "reason_code": "PLANNING",
            "description": "Production planning or scheduling issues",
            "category": "Planning",
            "priority": "High",
            "sort_order": 6,
            "color_code": "#6f42c1"
        },
        {
            "reason_code": "QUALITY ISSUE",
            "description": "Quality problems causing rejections or rework",
            "category": "Quality",
            "priority": "Critical",
            "sort_order": 7,
            "color_code": "#e83e8c"
        },
        {
            "reason_code": "TRIAL",
            "description": "Trial runs or testing activities",
            "category": "Process",
            "priority": "Low",
            "sort_order": 8,
            "color_code": "#17a2b8"
        },
        {
            "reason_code": "COMPOUND ISSUE",
            "description": "Problems with compound quality or characteristics",
            "category": "Material",
            "priority": "High",
            "sort_order": 9,
            "color_code": "#ffc107"
        },
        {
            "reason_code": "SHELL SHORTAGE",
            "description": "Shortage of shells required for production",
            "category": "Material",
            "priority": "High",
            "sort_order": 10,
            "color_code": "#ffc107"
        },
        {
            "reason_code": "SHELL QUALITY ISSUE",
            "description": "Quality problems with shells causing rejections",
            "category": "Quality",
            "priority": "High",
            "sort_order": 11,
            "color_code": "#e83e8c"
        },
        {
            "reason_code": "OPERATOR DELAY",
            "description": "Delays caused by operator unavailability or late arrival",
            "category": "Operator",
            "priority": "Medium",
            "sort_order": 12,
            "color_code": "#fd7e14"
        },
        {
            "reason_code": "LOADING PLATE NOT AVAILABLE",
            "description": "Loading plates not available when required",
            "category": "Material",
            "priority": "High",
            "sort_order": 13,
            "color_code": "#ffc107"
        },
        {
            "reason_code": "MOULD ISSUE",
            "description": "Problems with mould condition or performance",
            "category": "Machine",
            "priority": "Critical",
            "sort_order": 14,
            "color_code": "#dc3545"
        }
    ]
    
    created_count = 0
    updated_count = 0
    skipped_count = 0
    
    print("=" * 70)
    print("Starting OEE Reason Code Migration")
    print("=" * 70)
    
    for code_data in initial_codes:
        reason_code = code_data['reason_code']
        
        try:
            # Check if reason code already exists
            existing = frappe.db.exists('OEE Reason Code', {'reason_code': reason_code})
            
            if existing:
                # Update existing record
                doc = frappe.get_doc('OEE Reason Code', existing)
                
                # Only update if description is empty (don't overwrite user changes)
                if not doc.description:
                    doc.description = code_data['description']
                    doc.category = code_data['category']
                    doc.priority = code_data['priority']
                    doc.sort_order = code_data['sort_order']
                    doc.color_code = code_data['color_code']
                    doc.is_active = 1
                    doc.save(ignore_permissions=True)
                    updated_count += 1
                    print(f"✓ Updated: {reason_code}")
                else:
                    skipped_count += 1
                    print(f"⊘ Skipped (already exists): {reason_code}")
            else:
                # Create new record
                doc = frappe.new_doc('OEE Reason Code')
                doc.update(code_data)
                doc.is_active = 1
                doc.usage_count = 0
                doc.insert(ignore_permissions=True)
                created_count += 1
                print(f"✓ Created: {reason_code}")
                
        except Exception as e:
            frappe.log_error(
                f"Error processing reason code '{reason_code}': {str(e)}", 
                "OEE Reason Code Migration"
            )
            print(f"✗ Error: {reason_code} - {str(e)}")
    
    # Commit the changes
    frappe.db.commit()
    
    # Print summary
    print("=" * 70)
    print("Migration Summary:")
    print(f"  - Created: {created_count}")
    print(f"  - Updated: {updated_count}")
    print(f"  - Skipped: {skipped_count}")
    print(f"  - Total:   {created_count + updated_count + skipped_count}")
    print("=" * 70)
    print("✅ Migration completed successfully!")
    
    return {
        'success': True,
        'created': created_count,
        'updated': updated_count,
        'skipped': skipped_count
    }


if __name__ == '__main__':
    populate_initial_codes()
