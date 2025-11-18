#!/usr/bin/env python3
"""
Diagnostic Script: Debug Linked Lot Detection Issues
Run this on production server to identify why linked lots are not being detected

Usage:
    bench --site <site_name> execute smart_screens.debug_linked_lots.diagnose_date --kwargs "{'production_date': '2025-11-13'}"
"""

import frappe
from frappe.utils import flt
from smart_screens.smart_screens.api.oee.lot_linking_helper import get_linked_lot_info


def diagnose_date(production_date='2025-11-13'):
    """
    Diagnose linked lot detection for a specific date
    
    Args:
        production_date: Date to diagnose (YYYY-MM-DD)
    """
    print(f"\n{'='*80}")
    print(f"LINKED LOT DETECTION DIAGNOSTIC - {production_date}")
    print(f"{'='*80}\n")
    
    # Step 1: Get all production entries for this date
    print("STEP 1: Fetching all Moulding Production Entries...")
    
    query = """
        SELECT 
            mpe.name,
            COALESCE(mpe.scan_lot_number, mpe.batch_no) as lot_number,
            DATE(mpe.moulding_date) as moulding_date,
            mpe.item_to_produce as item_code,
            mpe.employee_name as operator_name,
            mpe.number_of_lifts as lifts,
            jc.shift_type,
            jc.workstation as machine_name
        FROM `tabMoulding Production Entry` mpe
        LEFT JOIN `tabJob Card` jc ON mpe.job_card = jc.name
        WHERE DATE(mpe.moulding_date) = %s
        AND mpe.docstatus = 1
        ORDER BY jc.shift_type, jc.workstation, mpe.employee_name, mpe.creation
    """
    
    entries = frappe.db.sql(query, (production_date,), as_dict=True)
    
    print(f"Found {len(entries)} production entries for {production_date}\n")
    
    # Step 2: Group by shift + machine + item + operator
    print("STEP 2: Grouping by shift + machine + item + operator...")
    
    groups = {}
    for entry in entries:
        key = (
            entry['shift_type'],
            entry['machine_name'],
            entry['item_code'],
            entry['operator_name']
        )
        
        if key not in groups:
            groups[key] = []
        
        groups[key].append(entry)
    
    print(f"Found {len(groups)} unique groups\n")
    
    # Step 3: Analyze each group
    print("STEP 3: Analyzing each group for linked lot potential...\n")
    
    linked_groups = []
    single_lot_groups = []
    
    for key, group_entries in groups.items():
        shift, machine, item, operator = key
        lot_numbers = list(set([e['lot_number'] for e in group_entries]))
        
        if len(group_entries) > 1 or len(lot_numbers) > 1:
            # Potential linked lot group
            linked_groups.append({
                'shift': shift,
                'machine': machine,
                'item': item,
                'operator': operator,
                'entries': group_entries,
                'unique_lots': lot_numbers,
                'entry_count': len(group_entries),
                'lot_count': len(lot_numbers)
            })
        else:
            # Single lot
            single_lot_groups.append({
                'shift': shift,
                'machine': machine,
                'item': item,
                'operator': operator,
                'lot': lot_numbers[0],
                'entry': group_entries[0]
            })
    
    print(f"✅ LINKED GROUPS: {len(linked_groups)}")
    print(f"❌ SINGLE LOT GROUPS: {len(single_lot_groups)}\n")
    
    # Step 4: Display linked groups
    if linked_groups:
        print(f"\n{'='*80}")
        print("LINKED LOT GROUPS (Should show 🔗 badge in OEE Dashboard)")
        print(f"{'='*80}\n")
        
        for i, group in enumerate(linked_groups, 1):
            print(f"\n{'─'*80}")
            print(f"GROUP {i}: {len(group['unique_lots'])} lots, {group['entry_count']} entries")
            print(f"{'─'*80}")
            print(f"  Shift:    {group['shift']}")
            print(f"  Machine:  {group['machine']}")
            print(f"  Item:     {group['item']}")
            print(f"  Operator: {group['operator']}")
            print(f"  Lots:     {', '.join(group['unique_lots'])}")
            
            # Test linked lot detection for first lot in group
            test_lot = group['unique_lots'][0]
            test_entry = group['entries'][0]
            
            print(f"\n  Testing get_linked_lot_info() for lot: {test_lot}")
            print(f"  Parameters:")
            print(f"    - lot_number: {test_lot}")
            print(f"    - production_date: {test_entry['moulding_date']}")
            print(f"    - shift_type: {group['shift']}")
            print(f"    - machine_reference: {group['machine']}")
            
            result = get_linked_lot_info(
                test_lot,
                str(test_entry['moulding_date']),
                group['shift'],
                group['machine']
            )
            
            print(f"\n  RESULT:")
            print(f"    is_linked: {result.get('is_linked')}")
            print(f"    linked_lots: {result.get('linked_lots', [])}")
            print(f"    linked_lot_count: {result.get('linked_lot_count', 0)}")
            print(f"    total_entries: {result.get('total_entries', 0)}")
            
            if not result.get('is_linked'):
                print(f"\n  ⚠️  WARNING: get_linked_lot_info() returned is_linked=False!")
                print(f"      Expected: is_linked=True with {len(group['unique_lots'])} lots")
                print(f"\n  DEBUGGING INFO:")
                
                # Check if production entries exist with these criteria
                debug_query = """
                    SELECT 
                        COALESCE(mpe.scan_lot_number, mpe.batch_no) as lot_number,
                        mpe.name,
                        mpe.moulding_date,
                        jc.shift_type,
                        jc.workstation
                    FROM `tabMoulding Production Entry` mpe
                    INNER JOIN `tabJob Card` jc ON mpe.job_card = jc.name
                    WHERE mpe.moulding_date = %s
                    AND LOWER(jc.shift_type) = LOWER(%s)
                    AND jc.workstation = %s
                    AND mpe.item_to_produce = %s
                    AND mpe.employee_name = %s
                    AND mpe.docstatus = 1
                """
                
                debug_result = frappe.db.sql(debug_query, (
                    test_entry['moulding_date'],
                    group['shift'],
                    group['machine'],
                    group['item'],
                    group['operator']
                ), as_dict=True)
                
                print(f"      Query returned {len(debug_result)} entries:")
                for dr in debug_result:
                    print(f"        - {dr['lot_number']}: {dr['name']} (shift: {dr['shift_type']}, machine: {dr['workstation']})")
    
    # Step 5: Display summary
    print(f"\n\n{'='*80}")
    print("SUMMARY")
    print(f"{'='*80}")
    print(f"Total Production Entries: {len(entries)}")
    print(f"Linked Lot Groups: {len(linked_groups)}")
    print(f"Single Lot Entries: {len(single_lot_groups)}")
    
    # Calculate expected vs actual
    detected_count = sum(1 for g in linked_groups if get_linked_lot_info(
        g['unique_lots'][0],
        str(g['entries'][0]['moulding_date']),
        g['shift'],
        g['machine']
    ).get('is_linked'))
    
    print(f"\nLinked Lot Detection Rate: {detected_count}/{len(linked_groups)} ({detected_count/len(linked_groups)*100:.1f}%)")
    
    if detected_count < len(linked_groups):
        print(f"\n⚠️  WARNING: {len(linked_groups) - detected_count} linked lot groups are NOT being detected!")
        print(f"   Check the debugging info above to identify the issue.")
    else:
        print(f"\n✅ All linked lot groups are being detected correctly!")
    
    print(f"\n{'='*80}\n")


def diagnose_lot(lot_number, production_date=None):
    """
    Diagnose linked lot detection for a specific lot
    
    Args:
        lot_number: Lot number to diagnose
        production_date: Optional production date (YYYY-MM-DD)
    """
    print(f"\n{'='*80}")
    print(f"LINKED LOT DETECTION DIAGNOSTIC - LOT {lot_number}")
    print(f"{'='*80}\n")
    
    # Find production entry for this lot
    query = """
        SELECT 
            mpe.name,
            COALESCE(mpe.scan_lot_number, mpe.batch_no) as lot_number,
            DATE(mpe.moulding_date) as moulding_date,
            mpe.item_to_produce as item_code,
            mpe.employee_name as operator_name,
            mpe.number_of_lifts as lifts,
            jc.shift_type,
            jc.workstation as machine_name
        FROM `tabMoulding Production Entry` mpe
        LEFT JOIN `tabJob Card` jc ON mpe.job_card = jc.name
        WHERE COALESCE(mpe.scan_lot_number, mpe.batch_no) = %s
        AND mpe.docstatus = 1
    """
    
    params = [lot_number]
    if production_date:
        query += " AND DATE(mpe.moulding_date) = %s"
        params.append(production_date)
    
    query += " ORDER BY mpe.creation DESC LIMIT 1"
    
    entries = frappe.db.sql(query, tuple(params), as_dict=True)
    
    if not entries:
        print(f"❌ No production entry found for lot {lot_number}")
        return
    
    entry = entries[0]
    
    print(f"Production Entry: {entry['name']}")
    print(f"Lot Number: {entry['lot_number']}")
    print(f"Moulding Date: {entry['moulding_date']}")
    print(f"Item: {entry['item_code']}")
    print(f"Operator: {entry['operator_name']}")
    print(f"Shift: {entry['shift_type']}")
    print(f"Machine: {entry['machine_name']}")
    print(f"Lifts: {entry['lifts']}")
    
    # Test linked lot detection
    print(f"\n{'─'*80}")
    print("Testing get_linked_lot_info()...")
    print(f"{'─'*80}\n")
    
    result = get_linked_lot_info(
        entry['lot_number'],
        str(entry['moulding_date']),
        entry['shift_type'],
        entry['machine_name']
    )
    
    print(f"Result:")
    print(f"  is_linked: {result.get('is_linked')}")
    print(f"  linked_lots: {result.get('linked_lots', [])}")
    print(f"  linked_lot_count: {result.get('linked_lot_count', 0)}")
    print(f"  total_entries: {result.get('total_entries', 0)}")
    
    # Find all matching entries
    print(f"\n{'─'*80}")
    print("Finding all production entries with same context...")
    print(f"{'─'*80}\n")
    
    match_query = """
        SELECT 
            mpe.name,
            COALESCE(mpe.scan_lot_number, mpe.batch_no) as lot_number,
            mpe.number_of_lifts as lifts,
            mpe.creation
        FROM `tabMoulding Production Entry` mpe
        INNER JOIN `tabJob Card` jc ON mpe.job_card = jc.name
        WHERE mpe.moulding_date = %s
        AND LOWER(jc.shift_type) = LOWER(%s)
        AND jc.workstation = %s
        AND mpe.item_to_produce = %s
        AND mpe.employee_name = %s
        AND mpe.docstatus = 1
        ORDER BY mpe.creation ASC
    """
    
    matches = frappe.db.sql(match_query, (
        entry['moulding_date'],
        entry['shift_type'],
        entry['machine_name'],
        entry['item_code'],
        entry['operator_name']
    ), as_dict=True)
    
    print(f"Found {len(matches)} matching production entries:")
    for i, match in enumerate(matches, 1):
        print(f"  {i}. {match['lot_number']}: {match['name']} ({match['lifts']} lifts)")
    
    if len(matches) > 1:
        print(f"\n✅ This lot SHOULD be linked with {len(matches)-1} other entries")
        if not result.get('is_linked'):
            print(f"⚠️  WARNING: But get_linked_lot_info() returned is_linked=False!")
    else:
        print(f"\n❌ This is a single lot (no other entries match the same context)")
    
    print(f"\n{'='*80}\n")


if __name__ == "__main__":
    # Example usage
    print("Run this script using:")
    print("  bench --site <site_name> execute smart_screens.debug_linked_lots.diagnose_date --kwargs \"{'production_date': '2025-11-13'}\"")
    print("  bench --site <site_name> execute smart_screens.debug_linked_lots.diagnose_lot --kwargs \"{'lot_number': '25K13U04'}\"")
