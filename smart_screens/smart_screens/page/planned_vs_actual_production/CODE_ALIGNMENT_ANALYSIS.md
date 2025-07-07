# Code Alignment Analysis: Planned vs Actual Production Report

## Current Code vs Documentation Misalignments

### Issue 1: Missing lot_number from Planning Data
**Current Code**: Planning queries don't include `lot_number` from Work Plan Item
**Should Be**: Include `wpi.lot_number` and `awpi.lot_number` in planning queries

### Issue 2: Missing Job Card Relationship  
**Current Code**: No use of Job Card connections
**Should Be**: Use Job Card as the linking table between planning and production

### Issue 3: Incorrect Data Aggregation
**Current Code**: Aggregates by `production_date | item_code | lot_number` where lot_number only comes from actual production
**Should Be**: Should use Job Card connections for proper matching

## Recommended Code Changes

### 1. Update Planning Query to Include lot_number and job_card

```python
planned_query = f"""
    SELECT 
        wpi.item as item_code,
        wp.date as production_date,
        wp.shift_type,
        wpi.lot_number,  # ADD THIS
        wpi.job_card,    # ADD THIS
        ms.noof_cavities,
        wpit.target_qty,
        CASE 
            WHEN ms.noof_cavities IS NOT NULL AND wpit.target_qty IS NOT NULL 
            THEN CAST(ms.noof_cavities AS FLOAT) * CAST(wpit.target_qty AS FLOAT)
            ELSE 0
        END as planned_qty_pieces,
        'Work Planning' as source_type
    FROM `tabWork Planning` wp
    INNER JOIN `tabWork Plan Item` wpi ON wp.name = wpi.parent
    LEFT JOIN `tabMould Specification` ms ON wpi.mould = ms.mould_ref AND ms.docstatus = 1
    LEFT JOIN `tabShift Type` st ON wp.shift_type = st.name
    LEFT JOIN `tabWork Plan Item Target` wpit ON wpi.item = wpit.item AND TIME(st.total_time) = wpit.shift_type
    WHERE wp.docstatus IN (0, 1) 
    AND wp.date BETWEEN '{from_date}' AND '{to_date}'
    {item_condition}
    {shift_condition}
    
    UNION ALL
    
    SELECT 
        awpi.item as item_code,
        awp.date as production_date,
        awp.shift_type,
        awpi.lot_number,  # ADD THIS
        awpi.job_card,    # ADD THIS
        ms.noof_cavities,
        wpit.target_qty,
        CASE 
            WHEN ms.noof_cavities IS NOT NULL AND wpit.target_qty IS NOT NULL 
            THEN CAST(ms.noof_cavities AS FLOAT) * CAST(wpit.target_qty AS FLOAT)
            ELSE 0
        END as planned_qty_pieces,
        'Add On Work Planning' as source_type
    FROM `tabAdd On Work Planning` awp
    INNER JOIN `tabAdd On Work Plan Item` awpi ON awp.name = awpi.parent
    LEFT JOIN `tabMould Specification` ms ON awpi.mould = ms.mould_ref AND ms.docstatus = 1
    LEFT JOIN `tabShift Type` st2 ON awp.shift_type = st2.name
    LEFT JOIN `tabWork Plan Item Target` wpit ON awpi.item = wpit.item AND TIME(st2.total_time) = wpit.shift_type
    WHERE awp.docstatus IN (0, 1) 
    AND awp.date BETWEEN '{from_date}' AND '{to_date}'
    {item_condition.replace('wpi.item', 'awpi.item')}
    {shift_condition_addon}
    
    ORDER BY production_date DESC, item_code
"""
```

### 2. Update Actual Production Query to Use Job Card Connection

```python
actual_query = f"""
    SELECT 
        mpe.moulding_date as production_date,
        mpe.item_to_produce as item_code,
        mpe.job_card,  # ADD THIS for connection
        COALESCE(mpe.scan_lot_number, mpe.batch_no, 'No Lot') as lot_number,
        SUM(mpe.number_of_lifts * mpe.no_of_running_cavities) as actual_qty_pieces,
        SUM(mpe.weight) as actual_weight_kg,
        COUNT(DISTINCT mpe.name) as production_entries,
        GROUP_CONCAT(DISTINCT mpe.name ORDER BY mpe.name) as entry_references
    FROM `tabMoulding Production Entry` mpe
    WHERE mpe.moulding_date BETWEEN '{from_date}' AND '{to_date}'
    AND mpe.docstatus = 1
    {item_condition_actual}
    {lot_condition_actual}
    GROUP BY mpe.moulding_date, mpe.item_to_produce, mpe.job_card, COALESCE(mpe.scan_lot_number, mpe.batch_no, 'No Lot')
    ORDER BY mpe.moulding_date DESC, mpe.item_to_produce, lot_number
"""
```

### 3. Update Data Aggregation to Use Job Card Connections

Instead of:
```python
key = f"{row.production_date}|{row.item_code}|{row.lot_number}"
```

Use:
```python
key = f"{row.job_card}" if row.job_card else f"{row.production_date}|{row.item_code}|{row.lot_number}"
```

### 4. Alternative Approach: JOIN-based Query

For better performance and accuracy, consider using JOINs:

```python
combined_query = f"""
    SELECT 
        COALESCE(wp.date, mpe.moulding_date) as production_date,
        COALESCE(wpi.item, mpe.item_to_produce) as item_code,
        COALESCE(wpi.lot_number, mpe.scan_lot_number, mpe.batch_no, 'No Lot') as lot_number,
        wpi.job_card,
        wp.shift_type,
        CASE 
            WHEN ms.noof_cavities IS NOT NULL AND wpit.target_qty IS NOT NULL 
            THEN CAST(ms.noof_cavities AS FLOAT) * CAST(wpit.target_qty AS FLOAT)
            ELSE 0
        END as planned_qty_pieces,
        COALESCE(SUM(mpe.number_of_lifts * mpe.no_of_running_cavities), 0) as actual_qty_pieces,
        COUNT(DISTINCT mpe.name) as production_entries,
        CASE 
            WHEN wpi.name IS NOT NULL THEN 'Work Planning'
            ELSE 'No Planning'
        END as planning_source
    FROM `tabWork Plan Item` wpi
    LEFT JOIN `tabWork Planning` wp ON wpi.parent = wp.name
    LEFT JOIN `tabMoulding Production Entry` mpe ON wpi.job_card = mpe.job_card
    LEFT JOIN `tabMould Specification` ms ON wpi.mould = ms.mould_ref AND ms.docstatus = 1
    LEFT JOIN `tabShift Type` st ON wp.shift_type = st.name
    LEFT JOIN `tabWork Plan Item Target` wpit ON wpi.item = wpit.item AND TIME(st.total_time) = wpit.shift_type
    WHERE wp.docstatus IN (0, 1) 
    AND wp.date BETWEEN '{from_date}' AND '{to_date}'
    GROUP BY wpi.job_card, wpi.item, wp.date, wpi.lot_number
    
    UNION ALL
    
    [Similar query for Add On Work Planning]
"""
```

## Summary

The current code has significant misalignments with the documented relationships:

1. **Missing Fields**: lot_number and job_card from planning data
2. **Missing Connections**: No use of Job Card relationships  
3. **Incorrect Matching**: Using date+item matching instead of Job Card connections
4. **Data Integrity**: Current approach may miss or incorrectly match planned vs actual data

**Recommendation**: Update the code to use the Job Card connections as documented, which will provide more accurate and reliable planned vs actual comparisons.
