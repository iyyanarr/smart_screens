# OEE Lot Linking Integration - Manual Patch

## File: oee_dashboard.py
**Path:** `/apps/smart_screens/smart_screens/smart_screens/page/oee_dashboard/oee_dashboard.py`

### Change 1: Add Import Statement (Line ~12)

**After this line:**
```python
from smart_screens.smart_screens.api.oee.adapters.moulding_adapter import MouldingAdapter
```

**Add:**
```python
# NEW: Import lot linking helper
from smart_screens.smart_screens.api.oee.lot_linking_helper import (
    get_linked_lot_info,
    aggregate_production_data,
    aggregate_quality_data
)
```

---

### Change 2: Modify get_oee_data Function (Line ~62)

**Find this section (around line 68):**
```python
    # Calculate OEE for each production entry
    oee_results = []
    
    for entry in production_data:
        try:
            # Extract basic info
            planned_time = adapter.get_planned_time(entry)
            downtime = adapter.get_downtime(entry)
            target_qty = adapter.get_target_quantity(entry)
            actual_qty = adapter.get_actual_quantity(entry)
            cycle_time = adapter.calculate_cycle_time(entry)
            
            # Get quality data from adapter (already checks for Lot Inspection with docstatus=1)
            quality_data = adapter.get_quality_data(entry)
```

**Replace with:**
```python
    # Calculate OEE for each production entry
    oee_results = []
    processed_lots = set()  # NEW: Track processed lots to avoid duplicates
    
    for entry in production_data:
        try:
            # ===== NEW: LOT LINKING DETECTION =====
            lot_number = adapter.get_lot_number(entry)
            prod_date = adapter.get_production_date(entry)
            shift = adapter.get_shift_type(entry)
            machine_ref = adapter.get_machine_reference(entry)
            
            # Check if this lot is part of a linked group
            linked_lot_info = get_linked_lot_info(
                lot_number, 
                prod_date, 
                shift, 
                machine_ref
            )
            
            # Skip non-main lots in linked groups (aggregated into main lot)
            if linked_lot_info.get('is_linked') and linked_lot_info.get('skip_this_lot'):
                frappe.logger().info(f"Skipping non-main lot {lot_number}, aggregated into {linked_lot_info.get('main_lot')}")
                continue
            
            # Check if we've already processed this lot
            if lot_number in processed_lots:
                continue
            
            processed_lots.add(lot_number)
            
            # ===== EXTRACT METRICS (with lot linking support) =====
            planned_time = adapter.get_planned_time(entry)
            
            if linked_lot_info.get('is_linked') and linked_lot_info.get('is_main_lot'):
                # This is a MAIN lot in a linked group - use aggregated data
                all_linked_lots = linked_lot_info['all_lots']
                
                frappe.logger().info(f"Processing linked lot group: {lot_number} with {len(all_linked_lots)} lots: {all_linked_lots}")
                
                # Get aggregated production data
                agg_prod = aggregate_production_data(all_linked_lots)
                
                # Get aggregated quality data
                agg_quality = aggregate_quality_data(all_linked_lots)
                
                # Override metrics with aggregated values
                actual_qty = agg_prod['total_lifts']
                downtime = agg_prod['avg_downtime']
                
                # Quality data from aggregated inspections
                quality_data = {
                    'total_pieces': agg_quality['total_inspected'],
                    'good_pieces': agg_quality['good_pieces'],
                    'rejected_pieces': agg_quality['total_rejected'],
                    'rejection_percentage': agg_quality['rejection_percentage'],
                    'has_inspection': agg_quality['has_inspection']
                }
            else:
                # Individual lot (not linked) - use normal data extraction
                actual_qty = adapter.get_actual_quantity(entry)
                downtime = adapter.get_downtime(entry)
                quality_data = adapter.get_quality_data(entry)
            
            # Common calculations (same for both linked and individual lots)
            target_qty = adapter.get_target_quantity(entry)
            cycle_time = adapter.calculate_cycle_time(entry)
```

---

### Change 3: Add Lot Linking Metadata to Result (Line ~150)

**Find this section (around line 150-160):**
```python
            # Build result dictionary
            result = {
                'name': entry.get('name'),
                'production_date': str(adapter.get_production_date(entry)),
                # ... other fields ...
                '_availability': availability,
                '_performance': performance,
                '_quality': quality,
            }
```

**Add these fields before the closing }:**
```python
                '_availability': availability,
                '_performance': performance,
                '_quality': quality,
                
                # ===== NEW: LOT LINKING METADATA =====
                'is_linked_lot': linked_lot_info.get('is_linked', False),
                'is_main_lot': linked_lot_info.get('is_main_lot', False),
                'linked_lot_count': linked_lot_info.get('linked_lot_count', 0),
                'linked_lots': ', '.join(linked_lot_info.get('all_lots', [])) if linked_lot_info.get('is_linked') else '',
            }
```

---

## How to Apply This Patch

1. **Open the file:**
   ```bash
   nano /Users/alphaworkz/frappe-bench/apps/smart_screens/smart_screens/smart_screens/page/oee_dashboard/oee_dashboard.py
   ```

2. **Make the 3 changes above** (search for the sections and modify)

3. **Save and restart bench:**
   ```bash
   bench restart
   ```

4. **Test the integration** by creating an OEE Lot Linking document and generating an OEE report

---

## Verification Steps

After applying the patch:

1. Create an OEE Lot Linking document for October 22, 2025 data
2. Link lots: 25J22Z06, 25J22Z09, 25J22Z10
3. Navigate to OEE Dashboard
4. Select date: October 22, 2025
5. Generate report
6. **Expected:** Only ONE row appears for lot 25J22Z06 with:
   - Badge showing "🔗 Linked (3)"
   - Combined lifts: 80
   - Aggregate rejection %
   - Consolidated OEE calculation

