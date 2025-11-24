"""
Configuration classes for aggregated reports
Defines warehouses and item groups for different report types
"""
import frappe

class ReportConfig:
	"""Base configuration class for aggregated reports"""
	
	def __init__(self, report_name, warehouses, item_groups):
		self.report_name = report_name
		self.warehouses = warehouses
		self.item_groups = item_groups
	
	def get_warehouses(self):
		"""Get list of warehouses for this report, verify they exist"""
		existing_warehouses = []
		for wh in self.warehouses:
			if frappe.db.exists("Warehouse", wh):
				existing_warehouses.append(wh)
			else:
				frappe.log_error(
f"Warehouse '{wh}' not found in system",
f"{self.report_name} - Warehouse Missing"
)
		
		frappe.logger().info(
f"{self.report_name} using {len(existing_warehouses)} warehouses: {existing_warehouses}"
)
		
		return existing_warehouses
	
	def get_item_groups(self):
		"""Get list of item groups for this report"""
		return self.item_groups


class SPPReportConfig(ReportConfig):
	"""Configuration for SPP Aggregated Report"""
	
	def __init__(self):
		warehouses = [
			"U2-Store - SPP INDIA",
			"U1-Store - SPP INDIA",
			"Unit-1 Transit Store - SPP INDIA",
			"Deflashing Vendors - SPP INDIA"
		]
		item_groups = ["Mat", "Products", "Finished Product", "Finished Products"]
		super().__init__("SPP Aggregated Report", warehouses, item_groups)


class BatComReportConfig(ReportConfig):
	"""Configuration for BatCom Aggregated Report (Batch, Master Batch, Compound)"""
	
	def __init__(self):
		warehouses = [
			"U3-Store - SPP INDIA",
			"Sheeting Warehouse - SPP INDIA",
			"Cutbit Warehouse - SPP INDIA"
		]
		item_groups = ["Batch", "Master Batch", "Compound"]
		super().__init__("BatCom Aggregated Report", warehouses, item_groups)
