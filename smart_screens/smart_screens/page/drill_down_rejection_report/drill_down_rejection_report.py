# Copyright (c) 2025, alphaworkz and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.utils import getdate, add_days, nowdate, flt
import json
import re
from datetime import datetime, timedelta

def normalize_defect_type(defect_type):
	"""
	Normalize defect types to their short codes for use as column headers
	Based on the defect type mapping provided
	"""
	if not defect_type:
		return "OTH"
	
	defect_upper = defect_type.upper().strip()
	
	# Defect (DT)
	if "DEFECT" in defect_upper and not any(x in defect_upper for x in ["SURFACE", "STAIN"]):
		return "DT"
	
	# Bend (BD)
	if any(keyword in defect_upper for keyword in ["BEND", "BD"]):
		return "BD"
	
	# Backrind (BK)
	if any(keyword in defect_upper for keyword in ["BACKRIND", "BK"]):
		return "BK"
	
	# Blister (BL)
	if any(keyword in defect_upper for keyword in ["BLISTER", "BL"]) and "BUBBLE" not in defect_upper:
		return "BL"
	
	# Black Mark (BM)
	if any(keyword in defect_upper for keyword in ["BLACK MARK", "BM"]):
		return "BM"
	
	# Bune (BN)
	if any(keyword in defect_upper for keyword in ["BUNE", "BN"]):
		return "BN"
	
	# Bonding (BO) - includes all bonding variations
	if any(keyword in defect_upper for keyword in ["BONDING", "BOND", "BONGING", "BNDE", "BO"]):
		return "BO"
	
	# Bubble (BU)
	if any(keyword in defect_upper for keyword in ["BUBBLE", "BU"]):
		return "BU"
	
	# Cut Mark (CM)
	if any(keyword in defect_upper for keyword in ["CUT MARK", "CUTMARK", "CM", "CU"]):
		return "CM"
	
	# Colour Variation (CV)
	if any(keyword in defect_upper for keyword in ["COLOUR VARIATION", "COLOUR VERIATION", "CV"]):
		return "CV"
	
	# Deflash (DF)
	if any(keyword in defect_upper for keyword in ["DEFLASH", "DF"]):
		return "DF"
	
	# Depression (DP)
	if any(keyword in defect_upper for keyword in ["DIPRESSION", "DISPERS PROBLEM", "DP"]):
		return "DP"
	
	# Flow (F)
	if any(keyword in defect_upper for keyword in ["FLOW", "FL", " F "]) or defect_upper.endswith(" F"):
		return "F"
	
	# Foreign Particle (FP)
	if any(keyword in defect_upper for keyword in ["FOREIGN PARTICLE", "FP", "THREAD"]):
		return "FP"
	
	# ID Undersize (ID US)
	if any(keyword in defect_upper for keyword in ["ID UNDERSIZ", "ID US"]):
		return "ID US"
	
	# Impression Mark (IM)
	if any(keyword in defect_upper for keyword in ["IMPRESSION MARK", "IM"]):
		return "IM"
	
	# Mould Damage (MD)
	if any(keyword in defect_upper for keyword in ["MOULD DAMAGE", "MD"]):
		return "MD"
	
	# Over Cure (OC)
	if any(keyword in defect_upper for keyword in ["OVER CURE", "OC", "FAST CURE"]):
		return "OC"
	
	# Oil Stain (OS)
	if any(keyword in defect_upper for keyword in ["OIL STAIN", "OILSTAIN", "OS"]):
		return "OS"
	
	# Over Trim (OT)
	if any(keyword in defect_upper for keyword in ["OVER TRIM", "OT"]):
		return "OT"
	
	# Punching Cavity (PC)
	if any(keyword in defect_upper for keyword in ["PUNCHING CAVITY", "PC"]):
		return "PC"
	
	# Pin Hole (PH)
	if any(keyword in defect_upper for keyword in ["PIN HOLE", "PH"]):
		return "PH"
	
	# Rib (RIB)
	if any(keyword in defect_upper for keyword in ["RIB"]):
		return "RIB"
	
	# Surface Defect/Stain (SD)
	if any(keyword in defect_upper for keyword in ["STAIN", "STRAIN", "SURFACE DEFECT", "SD"]):
		return "SD"
	
	# Shell Damage (SH)
	if any(keyword in defect_upper for keyword in ["CELL", "SHELL", "DEMAGE", "DAMAGE", "SHAI", "SHAL", "SHEEL", "SH"]):
		return "SH"
	
	# Spare Shine (SS)
	if any(keyword in defect_upper for keyword in ["SPAIR SHINE", "SPARE SHINE", "SS"]):
		return "SS"
	
	# Stretch Damage (STSD)
	if any(keyword in defect_upper for keyword in ["STRETCH", "STSD"]):
		return "STSD"
	
	# Burst/Tear (T)
	if any(keyword in defect_upper for keyword in ["BURST", "TEAR", " T "]) or defect_upper == "T":
		return "T"
	
	# Tool Mark (TM)
	if any(keyword in defect_upper for keyword in ["TOOL MARK", "TM", "TL"]):
		return "TM"
	
	# Under Cure (UC)
	if any(keyword in defect_upper for keyword in ["UNDER CURE", "UC"]):
		return "UC"
	
	# Under Fill (UF)
	if any(keyword in defect_upper for keyword in ["UNDER FILL", "UF"]):
		return "UF"
	
	# Washer Visible (WV)
	if any(keyword in defect_upper for keyword in ["WASHER VISIBLE", "WV"]):
		return "WV"
	
	# Default to OTH (Other) for unmapped defects
	return "OTH"

def get_context(context):
	"""Page context for Drill Down Rejection Report"""
	context.no_cache = 1

@frappe.whitelist()
def get_rejection_data(filters=None):
	"""
	Phase 1: Get products, lot numbers, sublots and rejection data
	from SPP Inspection Entry and Inspection Entry
	"""
	if isinstance(filters, str):
		filters = json.loads(filters)
	
	if not filters:
		filters = {}
	
	# Set default date range if not provided
	if not filters.get('from_date'):
		filters['from_date'] = add_days(nowdate(), -30)
	if not filters.get('to_date'):
		filters['to_date'] = nowdate()
	
	try:
		# Get unified rejection data from both doctypes
		data = get_unified_rejection_data(filters)
		
		# Process sublot data
		processed_data = process_sublot_data(data)
		
		# Calculate rejection percentages by sublot
		sublot_summary = calculate_sublot_rejection_summary(processed_data)
		
		return {
			'status': 'success',
			'data': processed_data,
			'sublot_summary': sublot_summary,
			'total_records': len(processed_data),
			'filters_applied': filters
		}
	
	except Exception as e:
		frappe.log_error(f"Phase 1 Rejection Report Error: {str(e)}")
		return {
			'status': 'error',
			'message': str(e),
			'data': [],
			'sublot_summary': {}
		}

def get_unified_rejection_data(filters):
	"""
	Fetch rejection data from both SPP Inspection Entry and Inspection Entry
	with proper joins to child tables for rejection details
	Focus on 'Final Visual Inspection' type
	"""
	conditions = build_filter_conditions(filters)
	
	# Query for SPP Inspection Entry data with child table join
	spp_query = """
	SELECT 
		'SPP Inspection Entry' as source_type,
		spp.name as document_name,
		spp.lot_no,
		spp.batch_no,
		spp.product_ref_no as item_code,
		spp.posting_date,
		spp.inspector_code,
		spp.inspection_type,
		spp.warehouse,
		spp.total_inspected_qty_nos as inspected_qty,
		COALESCE(SUM(fv.rejected_qty), 0) as rejected_qty,
		CASE 
			WHEN spp.total_inspected_qty_nos > 0 
			THEN (COALESCE(SUM(fv.rejected_qty), 0) * 100.0 / spp.total_inspected_qty_nos)
			ELSE 0 
		END as rejection_percentage,
		spp.operator_name,
		spp.machine_no,
		spp.sample_or_trial,
		spp.modified as last_modified,
		CASE 
			WHEN spp.lot_no LIKE '%%-%%' 
			THEN SUBSTRING_INDEX(spp.lot_no, '-', -1)
			ELSE '1'
		END as sublot_number,
		CASE 
			WHEN spp.lot_no LIKE '%%-%%' 
			THEN SUBSTRING_INDEX(spp.lot_no, '-', 1)
			ELSE spp.lot_no
		END as main_lot,
		GROUP_CONCAT(
			CASE 
				WHEN fv.rejected_qty > 0 
				THEN CONCAT(fv.type_of_defect, ':', fv.rejected_qty)
				ELSE NULL
			END 
			SEPARATOR '; '
		) as defect_details
	FROM `tabSPP Inspection Entry` spp
	LEFT JOIN `tabFV Inspection Entry Item` fv ON fv.parent = spp.name
	WHERE spp.docstatus != 2 
		AND spp.inspection_type = 'Final Visual Inspection'
		{}
	GROUP BY spp.name
	""".format(conditions['spp'])
	
	# Query for Inspection Entry data with child table join
	inspection_query = """
	SELECT 
		'Inspection Entry' as source_type,
		ie.name as document_name,
		ie.lot_no,
		ie.batch_no,
		ie.product_ref_no as item_code,
		COALESCE(ie.posting_date, ie.creation) as posting_date,
		ie.inspector_code,
		ie.inspection_type,
		ie.source_warehouse as warehouse,
		ie.total_inspected_qty_nos as inspected_qty,
		COALESCE(SUM(iei.rejected_qty), 0) as rejected_qty,
		CASE 
			WHEN ie.total_inspected_qty_nos > 0 
			THEN (COALESCE(SUM(iei.rejected_qty), 0) * 100.0 / ie.total_inspected_qty_nos)
			ELSE 0 
		END as rejection_percentage,
		ie.operator_name,
		ie.machine_no,
		ie.sample_or_trial,
		ie.modified as last_modified,
		CASE 
			WHEN ie.lot_no LIKE '%%-%%' 
			THEN SUBSTRING_INDEX(ie.lot_no, '-', -1)
			WHEN ie.lot_no LIKE '%%/%%' 
			THEN SUBSTRING_INDEX(ie.lot_no, '/', -1)
			ELSE '1'
		END as sublot_number,
		CASE 
			WHEN ie.lot_no LIKE '%%-%%' 
			THEN SUBSTRING_INDEX(ie.lot_no, '-', 1)
			WHEN ie.lot_no LIKE '%%/%%' 
			THEN SUBSTRING_INDEX(ie.lot_no, '/', 1)
			ELSE ie.lot_no
		END as main_lot,
		GROUP_CONCAT(
			CASE 
				WHEN iei.rejected_qty > 0 
				THEN CONCAT(iei.type_of_defect, ':', iei.rejected_qty)
				ELSE NULL
			END 
			SEPARATOR '; '
		) as defect_details
	FROM `tabInspection Entry` ie
	LEFT JOIN `tabInspection Entry Item` iei ON iei.parent = ie.name
	WHERE ie.docstatus != 2 
		AND ie.inspection_type = 'Final Visual Inspection'
		{}
	GROUP BY ie.name
	""".format(conditions['inspection'])
	
	# Union both queries
	union_query = """
	{}
	UNION ALL
	{}
	ORDER BY main_lot, sublot_number, posting_date DESC
	""".format(spp_query, inspection_query)
	
	return frappe.db.sql(union_query, filters, as_dict=True)

def build_filter_conditions(filters):
	"""
	Build WHERE conditions for different doctypes
	"""
	conditions = {
		'spp': '',
		'inspection': ''
	}
	
	# Date range filter
	if filters.get('from_date'):
		conditions['spp'] += " AND spp.posting_date >= %(from_date)s"
		conditions['inspection'] += " AND ie.posting_date >= %(from_date)s"
	
	if filters.get('to_date'):
		conditions['spp'] += " AND spp.posting_date <= %(to_date)s"
		conditions['inspection'] += " AND ie.posting_date <= %(to_date)s"
	
	# Inspector filter
	if filters.get('inspector'):
		conditions['spp'] += " AND spp.inspector_code = %(inspector)s"
		conditions['inspection'] += " AND ie.inspector_code = %(inspector)s"
	
	# Item filter
	if filters.get('item_code'):
		conditions['spp'] += " AND spp.product_ref_no = %(item_code)s"
		conditions['inspection'] += " AND ie.product_ref_no = %(item_code)s"
	
	# Inspection type filter
	if filters.get('inspection_type'):
		conditions['spp'] += " AND spp.inspection_type = %(inspection_type)s"
		conditions['inspection'] += " AND ie.inspection_type = %(inspection_type)s"
	
	# Lot number filter
	if filters.get('lot_no'):
		conditions['spp'] += " AND spp.lot_no LIKE %(lot_no)s"
		conditions['inspection'] += " AND ie.lot_no LIKE %(lot_no)s"
		filters['lot_no'] = "%" + str(filters['lot_no']) + "%"
	
	# Source type filter
	if filters.get('source_type'):
		if filters['source_type'] == 'SPP Inspection Entry':
			conditions['inspection'] += " AND 1=0"  # Exclude inspection entries
		elif filters['source_type'] == 'Inspection Entry':
			conditions['spp'] += " AND 1=0"  # Exclude SPP entries
	
	return conditions

def process_sublot_data(data):
	"""
	Process and enrich sublot data with additional calculations
	"""
	processed_data = []
	
	for row in data:
		# Ensure numeric values
		inspected_qty = flt(row.get('inspected_qty', 0))
		rejected_qty = flt(row.get('rejected_qty', 0))
		
		# Calculate rejection percentage if not already calculated
		if inspected_qty > 0:
			calculated_rejection_rate = (rejected_qty / inspected_qty) * 100
		else:
			calculated_rejection_rate = 0
		
		# Use calculated or provided rejection percentage
		rejection_percentage = flt(row.get('rejection_percentage', calculated_rejection_rate))
		
		# Create processed row
		processed_row = {
			'source_type': row.get('source_type'),
			'document_name': row.get('document_name'),
			'lot_no': row.get('lot_no'),
			'main_lot': row.get('main_lot'),
			'sublot_number': row.get('sublot_number', '1'),
			'batch_no': row.get('batch_no'),
			'item_code': row.get('item_code'),
			'posting_date': row.get('posting_date'),
			'inspector_code': row.get('inspector_code'),
			'inspection_type': row.get('inspection_type'),
			'warehouse': row.get('warehouse'),
			'inspected_qty': inspected_qty,
			'rejected_qty': rejected_qty,
			'rejection_percentage': round(rejection_percentage, 2),
			'operator_name': row.get('operator_name'),
			'machine_no': row.get('machine_no'),
			'sample_or_trial': row.get('sample_or_trial', 0),
			'last_modified': row.get('last_modified'),
			# Defect details from child tables
			'defect_details': row.get('defect_details'),
			# Quality indicators
			'quality_status': get_quality_status(rejection_percentage),
			'sublot_key': f"{row.get('main_lot')}-{row.get('sublot_number', '1')}"
		}
		
		processed_data.append(processed_row)
	
	return processed_data

def get_quality_status(rejection_percentage):
	"""
	Determine quality status based on rejection percentage
	"""
	if rejection_percentage == 0:
		return 'Perfect'
	elif rejection_percentage <= 2:
		return 'Excellent'
	elif rejection_percentage <= 5:
		return 'Good'
	elif rejection_percentage <= 10:
		return 'Warning'
	else:
		return 'Critical'

def calculate_sublot_rejection_summary(data):
	"""
	Calculate rejection summary grouped by sublot
	"""
	sublot_summary = {}
	
	for row in data:
		sublot_key = row['sublot_key']
		main_lot = row['main_lot']
		item_code = row['item_code']
		
		if sublot_key not in sublot_summary:
			sublot_summary[sublot_key] = {
				'main_lot': main_lot,
				'sublot_number': row['sublot_number'],
				'item_code': item_code,
				'total_inspected': 0,
				'total_rejected': 0,
				'inspection_count': 0,
				'spp_inspections': 0,
				'regular_inspections': 0,
				'rejection_types': {},
				'quality_status_counts': {},
				'last_inspection_date': None,
				'first_inspection_date': None
			}
		
		summary = sublot_summary[sublot_key]
		
		# Aggregate quantities
		summary['total_inspected'] += row['inspected_qty']
		summary['total_rejected'] += row['rejected_qty']
		summary['inspection_count'] += 1
		
		# Count by source type
		if row['source_type'] == 'SPP Inspection Entry':
			summary['spp_inspections'] += 1
		else:
			summary['regular_inspections'] += 1
		
		# Count rejection types
		inspection_type = row['inspection_type'] or 'Unknown'
		if inspection_type not in summary['rejection_types']:
			summary['rejection_types'][inspection_type] = {
				'count': 0,
				'total_rejected': 0,
				'total_inspected': 0
			}
		
		summary['rejection_types'][inspection_type]['count'] += 1
		summary['rejection_types'][inspection_type]['total_rejected'] += row['rejected_qty']
		summary['rejection_types'][inspection_type]['total_inspected'] += row['inspected_qty']
		
		# Count quality statuses
		quality_status = row['quality_status']
		summary['quality_status_counts'][quality_status] = summary['quality_status_counts'].get(quality_status, 0) + 1
		
		# Track inspection dates
		if row['posting_date']:
			if not summary['last_inspection_date'] or row['posting_date'] > summary['last_inspection_date']:
				summary['last_inspection_date'] = row['posting_date']
			if not summary['first_inspection_date'] or row['posting_date'] < summary['first_inspection_date']:
				summary['first_inspection_date'] = row['posting_date']
	
	# Calculate final percentages
	for sublot_key, summary in sublot_summary.items():
		if summary['total_inspected'] > 0:
			summary['overall_rejection_percentage'] = round((summary['total_rejected'] / summary['total_inspected']) * 100, 2)
		else:
			summary['overall_rejection_percentage'] = 0
		
		# Calculate rejection percentage by type
		for rejection_type, type_data in summary['rejection_types'].items():
			if type_data['total_inspected'] > 0:
				type_data['rejection_percentage'] = round((type_data['total_rejected'] / type_data['total_inspected']) * 100, 2)
			else:
				type_data['rejection_percentage'] = 0
	
	return sublot_summary

def calculate_defect_type_summary(data):
	"""
	Calculate summary of defect types and their rejection quantities
	"""
	defect_summary = {}
	
	for row in data:
		if row.get('defect_details'):
			defects = row['defect_details'].split(';')
			for defect in defects:
				defect = defect.strip()
				if ':' in defect:
					defect_type, qty_str = defect.split(':', 1)
					defect_type = defect_type.strip()
					try:
						qty = int(qty_str.strip())
						if defect_type not in defect_summary:
							defect_summary[defect_type] = {
								'total_rejected': 0,
								'occurrence_count': 0,
								'avg_rejection': 0
							}
						defect_summary[defect_type]['total_rejected'] += qty
						defect_summary[defect_type]['occurrence_count'] += 1
					except (ValueError, TypeError):
						continue
	
	# Calculate averages
	for defect_type, data in defect_summary.items():
		if data['occurrence_count'] > 0:
			data['avg_rejection'] = round(data['total_rejected'] / data['occurrence_count'], 2)
	
	return defect_summary

@frappe.whitelist()
def get_defect_analysis(filters=None):
	"""
	Get detailed defect type analysis for Final Visual Inspection
	"""
	if isinstance(filters, str):
		filters = json.loads(filters)
	
	if not filters:
		filters = {}
	
	# Set default date range if not provided
	if not filters.get('from_date'):
		filters['from_date'] = add_days(nowdate(), -30)
	if not filters.get('to_date'):
		filters['to_date'] = nowdate()
	
	try:
		# Get detailed defect data from both SPP and Inspection Entry
		spp_defects = frappe.db.sql("""
			SELECT 
				fv.type_of_defect,
				SUM(fv.rejected_qty) as total_rejected,
				COUNT(*) as occurrence_count,
				spp.product_ref_no as item_code,
				spp.lot_no
			FROM `tabSPP Inspection Entry` spp
			INNER JOIN `tabFV Inspection Entry Item` fv ON fv.parent = spp.name
			WHERE spp.docstatus != 2 
				AND spp.inspection_type = 'Final Visual Inspection'
				AND fv.rejected_qty > 0
				AND spp.posting_date >= %(from_date)s
				AND spp.posting_date <= %(to_date)s
			GROUP BY fv.type_of_defect, spp.product_ref_no
			ORDER BY total_rejected DESC
		""", filters, as_dict=True)
		
		inspection_defects = frappe.db.sql("""
			SELECT 
				iei.type_of_defect,
				SUM(iei.rejected_qty) as total_rejected,
				COUNT(*) as occurrence_count,
				ie.product_ref_no as item_code,
				ie.lot_no
			FROM `tabInspection Entry` ie
			INNER JOIN `tabInspection Entry Item` iei ON iei.parent = ie.name
			WHERE ie.docstatus != 2 
				AND ie.inspection_type = 'Final Visual Inspection'
				AND iei.rejected_qty > 0
				AND COALESCE(ie.posting_date, ie.creation) >= %(from_date)s
				AND COALESCE(ie.posting_date, ie.creation) <= %(to_date)s
			GROUP BY iei.type_of_defect, ie.product_ref_no
			ORDER BY total_rejected DESC
		""", filters, as_dict=True)
		
		return {
			'status': 'success',
			'spp_defects': spp_defects,
			'inspection_defects': inspection_defects,
			'total_defect_types': len(set([d['type_of_defect'] for d in spp_defects + inspection_defects]))
		}
		
	except Exception as e:
		frappe.log_error(f"Defect Analysis Error: {str(e)}")
		return {
			'status': 'error',
			'message': str(e),
			'spp_defects': [],
			'inspection_defects': []
		}

@frappe.whitelist()
def get_filter_options():
	"""
	Get filter options for dropdowns - Focus on Final Visual Inspection
	"""
	try:
		# Get inspectors from both doctypes (only Final Visual Inspection)
		inspectors = frappe.db.sql("""
			SELECT DISTINCT inspector_code as value, inspector_code as label
			FROM (
				SELECT inspector_code FROM `tabSPP Inspection Entry` 
				WHERE inspector_code IS NOT NULL AND inspection_type = 'Final Visual Inspection'
				UNION
				SELECT inspector_code FROM `tabInspection Entry` 
				WHERE inspector_code IS NOT NULL AND inspection_type = 'Final Visual Inspection'
			) as inspectors
			ORDER BY inspector_code
		""", as_dict=True)
		
		# Get items/products from both doctypes (only Final Visual Inspection)
		items = frappe.db.sql("""
			SELECT DISTINCT product_ref_no as value, product_ref_no as label
			FROM (
				SELECT product_ref_no FROM `tabSPP Inspection Entry` 
				WHERE product_ref_no IS NOT NULL AND inspection_type = 'Final Visual Inspection'
				UNION
				SELECT product_ref_no FROM `tabInspection Entry` 
				WHERE product_ref_no IS NOT NULL AND inspection_type = 'Final Visual Inspection'
			) as items
			ORDER BY product_ref_no
		""", as_dict=True)
		
		# Get inspection types (should be focused on Final Visual Inspection but keep others for flexibility)
		inspection_types = frappe.db.sql("""
			SELECT DISTINCT inspection_type as value, inspection_type as label
			FROM (
				SELECT inspection_type FROM `tabSPP Inspection Entry` WHERE inspection_type IS NOT NULL
				UNION
				SELECT inspection_type FROM `tabInspection Entry` WHERE inspection_type IS NOT NULL
			) as types
			ORDER BY inspection_type
		""", as_dict=True)
		
		return {
			'status': 'success',
			'inspectors': inspectors,
			'items': items,
			'inspection_types': inspection_types
		}
	
	except Exception as e:
		frappe.log_error(f"Filter Options Error: {str(e)}")
		return {
			'status': 'error',
			'message': str(e),
			'inspectors': [],
			'items': [],
			'inspection_types': []
		}

@frappe.whitelist()
def get_defect_pivot_report_simple(filters=None):
	"""
	Simple defect type pivot report with normalized defect categories
	"""
	if isinstance(filters, str):
		filters = json.loads(filters)
	
	if not filters:
		filters = {}
	
	# Set default date range if not provided
	if not filters.get('from_date'):
		filters['from_date'] = add_days(nowdate(), -30)
	if not filters.get('to_date'):
		filters['to_date'] = nowdate()
	
	try:
		# Get raw defect data using simple SQL
		raw_data = frappe.db.sql("""
			SELECT 
				spp.product_ref_no as item_code,
				spp.lot_no,
				spp.inspector_code,
				spp.posting_date,
				spp.total_inspected_qty_nos as inspected_qty,
				fv.type_of_defect,
				fv.rejected_qty,
				CASE 
					WHEN spp.lot_no LIKE %s 
					THEN SUBSTRING_INDEX(spp.lot_no, '-', -1)
					ELSE '1'
				END as sublot_number,
				CASE 
					WHEN spp.lot_no LIKE %s 
					THEN SUBSTRING_INDEX(spp.lot_no, '-', 1)
					ELSE spp.lot_no
				END as main_lot,
				'SPP Inspection Entry' as source_type
			FROM `tabSPP Inspection Entry` spp
			INNER JOIN `tabFV Inspection Entry Item` fv ON fv.parent = spp.name
			WHERE spp.docstatus != 2 
				AND spp.inspection_type = 'Final Visual Inspection'
				AND fv.rejected_qty > 0
				AND spp.posting_date >= %s
				AND spp.posting_date <= %s
			
			UNION ALL
			
			SELECT 
				ie.product_ref_no as item_code,
				ie.lot_no,
				ie.inspector_code,
				COALESCE(ie.posting_date, ie.creation) as posting_date,
				ie.total_inspected_qty_nos as inspected_qty,
				iei.type_of_defect,
				iei.rejected_qty,
				CASE 
					WHEN ie.lot_no LIKE %s 
					THEN SUBSTRING_INDEX(ie.lot_no, '-', -1)
					WHEN ie.lot_no LIKE %s 
					THEN SUBSTRING_INDEX(ie.lot_no, '/', -1)
					ELSE '1'
				END as sublot_number,
				CASE 
					WHEN ie.lot_no LIKE %s 
					THEN SUBSTRING_INDEX(ie.lot_no, '-', 1)
					WHEN ie.lot_no LIKE %s 
					THEN SUBSTRING_INDEX(ie.lot_no, '/', 1)
					ELSE ie.lot_no
				END as main_lot,
				'Inspection Entry' as source_type
			FROM `tabInspection Entry` ie
			INNER JOIN `tabInspection Entry Item` iei ON iei.parent = ie.name
			WHERE ie.docstatus != 2 
				AND ie.inspection_type = 'Final Visual Inspection'
				AND iei.rejected_qty > 0
				AND COALESCE(ie.posting_date, ie.creation) >= %s
				AND COALESCE(ie.posting_date, ie.creation) <= %s
			
			ORDER BY item_code, main_lot, sublot_number
		""", ('%-', '%-', filters.get('from_date'), filters.get('to_date'), 
			  '%-', '%/', '%-', '%/', filters.get('from_date'), filters.get('to_date')), as_dict=True)
		
		# Normalize defect types and get unique normalized types
		for row in raw_data:
			row['normalized_defect'] = normalize_defect_type(row['type_of_defect'])
		
		# Get unique normalized defect types
		normalized_defect_types = list(set([row['normalized_defect'] for row in raw_data if row['normalized_defect']]))
		normalized_defect_types.sort()
		
		# Process into pivot format using normalized defects
		pivot_data = process_normalized_pivot_data(raw_data, normalized_defect_types)
		
		return {
			'status': 'success',
			'data': pivot_data,
			'defect_types': normalized_defect_types,
			'total_records': len(pivot_data),
			'filters_applied': filters
		}
	
	except Exception as e:
		frappe.log_error(f"Simple Defect Pivot Report Error: {str(e)}")
		return {
			'status': 'error',
			'message': str(e),
			'data': [],
			'defect_types': [],
			'total_records': 0
		}

def process_normalized_pivot_data(raw_data, normalized_defect_types):
	"""Process raw defect data into pivot format using normalized defect types"""
	
	# Group by Product, Main Lot, Sublot, Inspector
	grouped_data = {}
	
	for row in raw_data:
		key = (
			row['item_code'],
			row['main_lot'], 
			row['sublot_number'],
			row['inspector_code']
		)
		
		if key not in grouped_data:
			grouped_data[key] = {
				'item_code': row['item_code'],
				'main_lot': row['main_lot'],
				'sublot_number': row['sublot_number'],
				'inspector_code': row['inspector_code'],
				'posting_date': row['posting_date'],
				'inspected_qty': row['inspected_qty'],
				'source_type': row['source_type'],
				'total_rejected': 0,
				'defects': {},
				'raw_defects': []  # Keep track of original defect types
			}
			
			# Initialize all normalized defect type counters to 0
			for defect_type in normalized_defect_types:
				grouped_data[key]['defects'][defect_type] = 0
		
		# Add rejection quantity to appropriate normalized defect
		normalized_defect = row['normalized_defect']
		if normalized_defect in normalized_defect_types:
			grouped_data[key]['defects'][normalized_defect] += int(row['rejected_qty'] or 0)
			grouped_data[key]['total_rejected'] += int(row['rejected_qty'] or 0)
			
			# Track original defect for reference
			original_defect = row['type_of_defect']
			if original_defect not in grouped_data[key]['raw_defects']:
				grouped_data[key]['raw_defects'].append(original_defect)
	
	# Convert to list format with flattened defect columns
	result = []
	for key, data in grouped_data.items():
		row = {
			'item_code': data['item_code'],
			'main_lot': data['main_lot'],
			'sublot_number': data['sublot_number'],
			'inspector_code': data['inspector_code'],
			'posting_date': data['posting_date'],
			'inspected_qty': data['inspected_qty'],
			'source_type': data['source_type'],
			'total_rejected': data['total_rejected'],
			'original_defects': ', '.join(data['raw_defects'])  # Show original defect types
		}
		
		# Add normalized defect type columns
		for defect_type in normalized_defect_types:
			# Create safe column name
			safe_name = defect_type.lower()
			row[safe_name] = data['defects'][defect_type]
		
		result.append(row)
	
	return result

def get_all_defect_types():
	"""Get all unique defect types from both SPP and Inspection Entry child tables"""
	
	# Get from SPP FV Inspection Entry Item
	spp_defects = frappe.db.sql("""
		SELECT DISTINCT type_of_defect
		FROM `tabFV Inspection Entry Item` 
		WHERE type_of_defect IS NOT NULL 
		AND type_of_defect != ''
		AND parent IN (
			SELECT name FROM `tabSPP Inspection Entry` 
			WHERE inspection_type = 'Final Visual Inspection'
		)
		ORDER BY type_of_defect
	""", as_list=True)
	
	# Get from Inspection Entry Item
	ie_defects = frappe.db.sql("""
		SELECT DISTINCT type_of_defect
		FROM `tabInspection Entry Item` 
		WHERE type_of_defect IS NOT NULL 
		AND type_of_defect != ''
		AND parent IN (
			SELECT name FROM `tabInspection Entry` 
			WHERE inspection_type = 'Final Visual Inspection'
		)
		ORDER BY type_of_defect
	""", as_list=True)
	
	# Combine and clean defect types
	all_defects = set()
	for defect in spp_defects + ie_defects:
		defect_name = defect[0].strip()
		if defect_name and len(defect_name) > 1:  # Filter out single characters and empty
			all_defects.add(defect_name)
	
	# Return top 20 most common defect types to keep the report manageable
	return sorted(list(all_defects))[:20]

def get_raw_defect_data(filters):
	"""Get raw defect data from both SPP and Inspection Entry"""
	
	conditions = build_filter_conditions(filters)
	
	# SPP Inspection Entry with defect details
	spp_query = """
	SELECT 
		spp.product_ref_no as item_code,
		spp.lot_no,
		spp.inspector_code,
		spp.posting_date,
		spp.total_inspected_qty_nos as inspected_qty,
		fv.type_of_defect,
		fv.rejected_qty,
		CASE 
			WHEN spp.lot_no LIKE '%%-%' 
			THEN SUBSTRING_INDEX(spp.lot_no, '-', -1)
			ELSE '1'
		END as sublot_number,
		CASE 
			WHEN spp.lot_no LIKE '%%-%' 
			THEN SUBSTRING_INDEX(spp.lot_no, '-', 1)
			ELSE spp.lot_no
		END as main_lot,
		'SPP Inspection Entry' as source_type
	FROM `tabSPP Inspection Entry` spp
	INNER JOIN `tabFV Inspection Entry Item` fv ON fv.parent = spp.name
	WHERE spp.docstatus != 2 
		AND spp.inspection_type = 'Final Visual Inspection'
		AND fv.rejected_qty > 0
		{spp_conditions}
	""".format(spp_conditions=conditions['spp'])
	
	# Inspection Entry with defect details
	ie_query = """
	SELECT 
		ie.product_ref_no as item_code,
		ie.lot_no,
		ie.inspector_code,
		COALESCE(ie.posting_date, ie.creation) as posting_date,
		ie.total_inspected_qty_nos as inspected_qty,
		iei.type_of_defect,
		iei.rejected_qty,
		CASE 
			WHEN ie.lot_no LIKE '%%-%' 
			THEN SUBSTRING_INDEX(ie.lot_no, '-', -1)
			WHEN ie.lot_no LIKE '%%/%%' 
			THEN SUBSTRING_INDEX(ie.lot_no, '/', -1)
			ELSE '1'
		END as sublot_number,
		CASE 
			WHEN ie.lot_no LIKE '%%-%' 
			THEN SUBSTRING_INDEX(ie.lot_no, '-', 1)
			WHEN ie.lot_no LIKE '%%/%%' 
			THEN SUBSTRING_INDEX(ie.lot_no, '/', 1)
			ELSE ie.lot_no
		END as main_lot,
		'Inspection Entry' as source_type
	FROM `tabInspection Entry` ie
	INNER JOIN `tabInspection Entry Item` iei ON iei.parent = ie.name
	WHERE ie.docstatus != 2 
		AND ie.inspection_type = 'Final Visual Inspection'
		AND iei.rejected_qty > 0
		{ie_conditions}
	""".format(ie_conditions=conditions['inspection'])
	
	# Union both queries
	union_query = spp_query + " UNION ALL " + ie_query + " ORDER BY main_lot, sublot_number, posting_date DESC"
	
	return frappe.db.sql(union_query, filters, as_dict=True)

def get_raw_defect_data_new(filters):
	"""Get raw defect data for pivoting - NEW simplified approach without string formatting"""
	
	# Use direct SQL parameters to avoid string formatting issues
	from_date = filters.get('from_date', add_days(nowdate(), -30))
	to_date = filters.get('to_date', nowdate())
	
	# SPP Inspection Entry data - use direct parameters
	spp_query = """
		SELECT 
			spp.product_ref_no as item_code,
			spp.lot_no,
			spp.inspector_code,
			spp.posting_date,
			spp.total_inspected_qty_nos as inspected_qty,
			fv.type_of_defect,
			fv.rejected_qty,
			CASE 
				WHEN spp.lot_no LIKE %s 
				THEN SUBSTRING_INDEX(spp.lot_no, '-', -1)
				ELSE '1'
			END as sublot_number,
			CASE 
				WHEN spp.lot_no LIKE %s 
				THEN SUBSTRING_INDEX(spp.lot_no, '-', 1)
				ELSE spp.lot_no
			END as main_lot,
			'SPP Inspection Entry' as source_type
		FROM `tabSPP Inspection Entry` spp
		INNER JOIN `tabFV Inspection Entry Item` fv ON fv.parent = spp.name
		WHERE spp.docstatus != 2 
			AND spp.inspection_type = 'Final Visual Inspection'
			AND fv.rejected_qty > 0
			AND spp.posting_date >= %s
			AND spp.posting_date <= %s
	"""
	
	spp_params = ['%-%', '%-%', from_date, to_date]
	spp_data = frappe.db.sql(spp_query, spp_params, as_dict=True)
	
	# Inspection Entry data - use direct parameters
	ie_query = """
		SELECT 
			ie.product_ref_no as item_code,
			ie.lot_no,
			ie.inspector_code,
			COALESCE(ie.posting_date, ie.creation) as posting_date,
			ie.total_inspected_qty_nos as inspected_qty,
			iei.type_of_defect,
			iei.rejected_qty,
			CASE 
				WHEN ie.lot_no LIKE %s 
				THEN SUBSTRING_INDEX(ie.lot_no, '-', -1)
				WHEN ie.lot_no LIKE %s 
				THEN SUBSTRING_INDEX(ie.lot_no, '/', -1)
				ELSE '1'
			END as sublot_number,
			CASE 
				WHEN ie.lot_no LIKE %s 
				THEN SUBSTRING_INDEX(ie.lot_no, '-', 1)
				WHEN ie.lot_no LIKE %s 
				THEN SUBSTRING_INDEX(ie.lot_no, '/', 1)
				ELSE ie.lot_no
			END as main_lot,
			'Inspection Entry' as source_type
		FROM `tabInspection Entry` ie
		INNER JOIN `tabInspection Entry Item` iei ON iei.parent = ie.name
		WHERE ie.docstatus != 2 
			AND ie.inspection_type = 'Final Visual Inspection'
			AND iei.rejected_qty > 0
			AND COALESCE(ie.posting_date, ie.creation) >= %s
			AND COALESCE(ie.posting_date, ie.creation) <= %s
	"""
	
	ie_params = ['%-%', '%/%', '%-%', '%/%', from_date, to_date]
	ie_data = frappe.db.sql(ie_query, ie_params, as_dict=True)
	
	# Combine both datasets
	return spp_data + ie_data

def process_defect_pivot_data_new(raw_data, defect_types):
	"""Process raw defect data into pivoted format - NEW approach"""
	
	# Group by Product, Main Lot, Sublot, Inspector
	grouped_data = {}
	
	for row in raw_data:
		key = (
			row['item_code'],
			row['main_lot'], 
			row['sublot_number'],
			row['inspector_code']
		)
		
		if key not in grouped_data:
			grouped_data[key] = {
				'item_code': row['item_code'],
				'main_lot': row['main_lot'],
				'sublot_number': row['sublot_number'],
				'inspector_code': row['inspector_code'],
				'posting_date': row['posting_date'],
				'inspected_qty': row['inspected_qty'],
				'source_type': row['source_type'],
				'total_rejected': 0
			}
			
			# Initialize all defect type columns to 0
			for defect_type in defect_types:
				safe_key = clean_defect_name(defect_type)
				grouped_data[key][safe_key] = 0
		
		# Add rejection quantity to appropriate defect column
		if row['type_of_defect']:
			safe_key = clean_defect_name(row['type_of_defect'])
			grouped_data[key][safe_key] += int(row['rejected_qty'] or 0)
			grouped_data[key]['total_rejected'] += int(row['rejected_qty'] or 0)
	
	# Convert to list
	return list(grouped_data.values())

def clean_defect_name(defect_type):
	"""Clean defect type name for use as column key"""
	if not defect_type:
		return "unknown"
	
	# Remove special characters and spaces, convert to lowercase
	import re
	cleaned = re.sub(r'[^a-zA-Z0-9]', '_', defect_type.lower())
	cleaned = re.sub(r'_+', '_', cleaned)  # Replace multiple underscores with single
	cleaned = cleaned.strip('_')  # Remove leading/trailing underscores
	
	return cleaned or "unknown"

@frappe.whitelist()
def get_defect_pivot_report(filters=None):
	"""
	Get product-grouped pivot report with drill-down capability
	"""
	return get_product_grouped_pivot_report(filters)

def get_product_grouped_pivot_data(data):
	"""
	Process data into product-grouped pivot format with drill-down capability
	Structure: Product -> Lots -> Defect details
	"""
	product_groups = {}
	all_defect_types = set()
	
	# First pass: collect all unique defect types and group by product
	for row in data:
		product = row.get('item_code') or 'Unknown Product'
		lot_no = row.get('lot_no') or 'Unknown Lot'
		
		# Initialize product group if not exists
		if product not in product_groups:
			product_groups[product] = {
				'product': product,
				'total_inspected': 0,
				'total_rejected': 0,
				'total_rejection_percentage': 0,
				'lots': {},
				'defects': {}
			}
		
		# Initialize lot if not exists
		if lot_no not in product_groups[product]['lots']:
			product_groups[product]['lots'][lot_no] = {
				'lot_no': lot_no,
				'main_lot': row.get('main_lot', ''),
				'sublot_number': row.get('sublot_number', ''),
				'inspected_qty': 0,
				'rejected_qty': 0,
				'rejection_percentage': 0,
				'defects': {},
				'document_name': row.get('document_name'),
				'source_type': row.get('source_type'),
				'posting_date': row.get('posting_date'),
				'inspector_code': row.get('inspector_code')
			}
		
		# Update lot totals
		lot_data = product_groups[product]['lots'][lot_no]
		lot_data['inspected_qty'] += row.get('inspected_qty', 0)
		lot_data['rejected_qty'] += row.get('rejected_qty', 0)
		if lot_data['inspected_qty'] > 0:
			lot_data['rejection_percentage'] = (lot_data['rejected_qty'] * 100.0) / lot_data['inspected_qty']
		
		# Process defect details for the lot
		defect_details = row.get('defect_details', '')
		if defect_details:
			defect_pairs = defect_details.split('; ')
			for pair in defect_pairs:
				if ':' in pair:
					defect_type, qty_str = pair.split(':', 1)
					try:
						qty = float(qty_str)
						normalized_defect = normalize_defect_type(defect_type.strip())
						all_defect_types.add(normalized_defect)
						
						# Add to lot defects
						if normalized_defect not in lot_data['defects']:
							lot_data['defects'][normalized_defect] = 0
						lot_data['defects'][normalized_defect] += qty
						
						# Add to product defects
						if normalized_defect not in product_groups[product]['defects']:
							product_groups[product]['defects'][normalized_defect] = 0
						product_groups[product]['defects'][normalized_defect] += qty
						
					except ValueError:
						continue
		
		# Update product totals
		product_groups[product]['total_inspected'] += row.get('inspected_qty', 0)
		product_groups[product]['total_rejected'] += row.get('rejected_qty', 0)
	
	# Calculate product-level rejection percentages
	for product_data in product_groups.values():
		if product_data['total_inspected'] > 0:
			product_data['total_rejection_percentage'] = (product_data['total_rejected'] * 100.0) / product_data['total_inspected']
	
	# Sort defect types for consistent column order
	sorted_defect_types = sorted(list(all_defect_types))
	
	# Convert to final format
	result = []
	
	for product, product_data in product_groups.items():
		# Create product summary row
		product_row = {
			'id': f"product_{product}",
			'type': 'product',
			'product': product,
			'lot_no': '',
			'main_lot': '',
			'sublot_number': '',
			'inspected_qty': product_data['total_inspected'],
			'rejected_qty': product_data['total_rejected'],
			'rejection_percentage': round(product_data['total_rejection_percentage'], 2),
			'has_children': True,
			'expanded': False,
			'level': 0
		}
		
		# Add defect columns to product row
		for defect_type in sorted_defect_types:
			product_row[defect_type] = product_data['defects'].get(defect_type, 0)
		
		result.append(product_row)
		
		# Add lot rows (initially hidden)
		for lot_no, lot_data in product_data['lots'].items():
			lot_row = {
				'id': f"lot_{product}_{lot_no}",
				'type': 'lot',
				'product': product,
				'lot_no': lot_no,
				'main_lot': lot_data['main_lot'],
				'sublot_number': lot_data['sublot_number'],
				'inspected_qty': lot_data['inspected_qty'],
				'rejected_qty': lot_data['rejected_qty'],
				'rejection_percentage': round(lot_data['rejection_percentage'], 2),
				'has_children': False,
				'expanded': False,
				'level': 1,
				'parent_id': f"product_{product}",
				'document_name': lot_data['document_name'],
				'source_type': lot_data['source_type'],
				'posting_date': lot_data['posting_date'],
				'inspector_code': lot_data['inspector_code']
			}
			
			# Add defect columns to lot row
			for defect_type in sorted_defect_types:
				lot_row[defect_type] = lot_data['defects'].get(defect_type, 0)
			
			result.append(lot_row)
	
	return {
		'rows': result,
		'defect_columns': sorted_defect_types,
		'summary': {
			'total_products': len(product_groups),
			'total_lots': sum(len(pd['lots']) for pd in product_groups.values()),
			'total_inspected': sum(pd['total_inspected'] for pd in product_groups.values()),
			'total_rejected': sum(pd['total_rejected'] for pd in product_groups.values())
		}
	}

@frappe.whitelist()
def get_product_grouped_pivot_report(filters=None):
	"""
	Get product-grouped pivot report with drill-down capability
	"""
	if isinstance(filters, str):
		filters = json.loads(filters)
	
	if not filters:
		filters = {}
	
	# Set default date range if not provided
	if not filters.get('from_date'):
		filters['from_date'] = add_days(nowdate(), -30)
	if not filters.get('to_date'):
		filters['to_date'] = nowdate()
	
	try:
		# Get unified rejection data
		data = get_unified_rejection_data(filters)
		
		# Process into grouped pivot format
		pivot_data = get_product_grouped_pivot_data(data)
		
		return {
			'status': 'success',
			'data': pivot_data,
			'message': f'Found {pivot_data["summary"]["total_products"]} products with {pivot_data["summary"]["total_lots"]} lots'
		}
	
	except Exception as e:
		frappe.log_error(f"Error in get_product_grouped_pivot_report: {str(e)}")
		return {
			'status': 'error',
			'message': f'Error fetching pivot data: {str(e)}',
			'data': {'rows': [], 'defect_columns': [], 'summary': {}}
		}

@frappe.whitelist()
def get_defect_pivot_report_grouped(filters=None):
	"""
	Wrapper function for get_product_grouped_pivot_report
	Used by the frontend API call
	"""
	return get_product_grouped_pivot_report(filters)
