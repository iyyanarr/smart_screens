# Copyright (c) 2025, alphaworkz and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document
from frappe import _

class SubLotProcess(Document):
    def on_submit(self):
        """
        When the Sub Lot Process is submitted:
        1. Create a sublot entry
        2. Create a work order
        3. Create lot resource tags and job cards for each operation
        
        Note: All modifications to the document should happen before this point,
        as we can't update a submitted document.
        """
        try:
            # Create sublot entry 
            sublot_entry_name = self.create_sublot_entry()
            
            work_order_name = None
            
            # Create work order using the utility function
            try:
                from smart_screens.smart_screens.utils.generate_work_order import create_work_order_after_sublot
                
                # Create work order for this sub lot process
                work_order_result = create_work_order_after_sublot(sublot_process=self.name)
                
                if work_order_result.get("status") == "success":
                    # Update the work_order field directly on self
                    # This is safe because the document isn't fully submitted yet
                    work_order_name = work_order_result.get("work_order")
                    self.work_order = work_order_name
                    self.db_update()
                    frappe.db.commit()
                    frappe.msgprint(_("Work Order {0} created successfully").format(work_order_name))
                elif work_order_result.get("status") == "warning":
                    # Work order already exists, just show a message
                    frappe.msgprint(_(work_order_result.get("message")))
                    # Try to get the work order name from the warning message
                    if "Work Order" in work_order_result.get("message", ""):
                        work_order_name = work_order_result.get("work_order")
                else:
                    # Log the error but don't throw - let the process continue even if work order creation fails
                    frappe.log_error(f"Failed to create Work Order: {work_order_result.get('message')}", "Sub Lot Process")
                    frappe.msgprint(_("Warning: Could not create Work Order. {0}").format(work_order_result.get("message")), indicator="yellow")
            except Exception as wo_error:
                # Log the error but don't throw - let the process continue even if work order creation fails
                frappe.log_error(f"Error in Work Order creation: {str(wo_error)}", "Sub Lot Process")
                frappe.msgprint(_("Warning: Could not create Work Order. {0}").format(str(wo_error)), indicator="yellow")
            
            # After work order creation, create lot resource tags and job cards
            try:
                from smart_screens.smart_screens.utils.resource_job_card import create_lot_resource_tag_and_job_card
                
                # Create resource tags and job cards
                resource_result = create_lot_resource_tag_and_job_card(
                    sublot_process=self,
                    work_order=work_order_name
                )
                
                if resource_result.get("status") == "success":
                    # Show success message
                    created_resources = len(resource_result.get("resources", []))
                    created_job_cards = len(resource_result.get("job_cards", []))
                    
                    if created_resources > 0 or created_job_cards > 0:
                        frappe.msgprint(
                            _("Successfully created {0} resource tags and {1} job cards").format(
                                created_resources, created_job_cards
                            )
                        )
                elif resource_result.get("status") == "warning":
                    # Just show the warning message
                    frappe.msgprint(_(resource_result.get("message")), indicator="yellow")
                else:
                    # Log the error but don't throw
                    frappe.log_error(f"Failed to create resources: {resource_result.get('message')}", "Sub Lot Process")
                    frappe.msgprint(_("Warning: Could not create resource tags and job cards. {0}").format(
                        resource_result.get("message")), indicator="yellow")
            except Exception as res_error:
                # Log the error but don't throw
                frappe.log_error(f"Error in Resource and Job Card creation: {str(res_error)}", "Sub Lot Process")
                frappe.msgprint(_("Warning: Could not create resource tags and job cards. {0}").format(str(res_error)), indicator="yellow")
            
            frappe.msgprint(_("Successfully created Sublot Entry"))
        except Exception as e:
            frappe.log_error(f"Failed to create Sublot Entry for Sub Lot Process {self.name}: {str(e)}")
            frappe.throw(_("Error creating Sublot Entry: {0}").format(str(e)))
    
    def create_sublot_entry(self):
        """Create a sublot entry from the sub lot process data"""
        if not self.sub_lot_number or not self.item_code:
            frappe.throw(_("Sub lot number and item code are required to create sublot entry"))
        
        try:
            # Use the generate_sublot utility to create the sublot
            # This will create stock entry and update batch information
            sublot_data = frappe.call("smart_screens.smart_screens.utils.generate_sublot.generate_sublot", 
                batch_number=self.batch_no,
                qty=self.sublot_qty or self.inspection_quantity,  # Use sublot_qty if provided, otherwise use inspection_quantity
                source_warehouse=self.warehouse,  # Source warehouse is the current warehouse
                target_warehouse=self.warehouse,  # Target warehouse same as source for now
                uom=frappe.db.get_value("Item", self.item_code, "stock_uom") or "Nos"  # Get the stock UOM for the item
            )
            
            if not sublot_data or not sublot_data.get("status") == "success":
                error_msg = sublot_data.get("message") if sublot_data else "Unknown error"
                frappe.throw(_("Failed to generate sublot: {0}").format(error_msg))
            
            # Update the SubLotProcess document with the sublot data
            # This allows us to store the generated sublot information in the original document
            self.db_set('sub_lot_number', sublot_data.get("sub_lot_number") or self.sub_lot_number)
            self.db_set('sublot_qty', sublot_data.get("processed_qty") or self.sublot_qty or self.inspection_quantity)
            self.db_set('barcode', sublot_data.get("new_batch_number") or self.barcode)
            
            # Create a new Sub Lot Entry document
            sublot = frappe.new_doc("Sub Lot Entry")
            sublot.sslnscaned_sub_lot_number = self.spp_batch_number
            sublot.sub_lot_number = sublot_data.get("sub_lot_number")
            sublot.item_code = self.item_code
            sublot.batch = self.batch_no
            sublot.sublot_batch = sublot_data.get("new_batch_number")
            sublot.warehouse = self.warehouse
            sublot.source_warehouse = self.warehouse
            sublot.target_warehouse = self.warehouse
            sublot.sublot_qty = self.sublot_qty or self.inspection_quantity
            sublot.final_sublot_qty = sublot_data.get("processed_qty")
            sublot.stockentry_ref = sublot_data.get("stock_entry_name")
            sublot.stage = self.get("stage")  # Get stage if available
            sublot.barcode = sublot_data.get("new_batch_number")  # Set barcode to the batch number
            sublot.batch_qty = self.available_quantity
            
            # Set source document reference
            sublot.source_document = self.doctype
            sublot.source_document_name = self.name
            
            # Insert and submit the document
            sublot.insert()
            if frappe.db.get_value("DocType", "Sub Lot Entry", "is_submittable"):
                sublot.submit()
            
            frappe.db.commit()
            
            return sublot.name
        
        except Exception as e:
            frappe.log_error(f"Failed to create Sub Lot Entry: {str(e)}", "Sub Lot Process")
            frappe.throw(_("Error creating Sub Lot Entry: {0}").format(str(e)))
