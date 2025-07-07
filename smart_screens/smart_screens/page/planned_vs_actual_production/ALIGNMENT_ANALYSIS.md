# Code Alignment Analysis

## Current Code vs Documentation Comparison

### 1. Planning Data Queries

**Current Code Issues:**
```python
# Missing lot_number and job_card from Work Plan Item
SELECT 
    wpi.item as item_code,
    wp.date as production_date,
    wp.shift_type,
    # Missing: wpi.lot_number, wpi.job_card
```

**Aligned Approach:**
```python
# Includes lot_number and job_card from Work Plan Item
SELECT 
    wpi.item as item_code,
    wp.date as production_date,
    wp.shift_type,
    wpi.lot_number,  # ADDED
    wpi.job_card,    # ADDED
```

### 2. Data Matching Strategy

**Current Code Issues:**
```python
# Uses only date + item + lot_number (from actual production only)
key = f"{row.production_date}|{row.item_code}|{row.lot_number}"
```

**Aligned Approach:**
```python
# Primary: Use job_card relationship when available
if row.job_card:
    key = f"{row.job_card}|{row.lot_number}"
# Fallback: Use date + item for incomplete data
else:
    key = f"{row.production_date}|{row.item_code}|fallback"
```

### 3. Data Completeness

**Current Situation:**
- 19,004 Work Plan Items (49.3%) have proper lot_number + job_card
- 19,563 Work Plan Items (50.7%) are missing these relationships

**Solution:**
- Use proper relationships when available (better accuracy)
- Fall back to date+item matching for incomplete data
- Add tracking of which matching method was used

### 4. Traceability

**Current Code Issues:**
- No connection to Job Cards
- No way to trace from planning to production
- Relies on approximate matching

**Aligned Approach:**
- Direct traceability: Work Plan Item → Job Card → Moulding Production Entry
- Exact matching when relationships exist
- Better data integrity and audit trail

## Recommendation

We should implement the aligned approach because:

1. **Better Data Integrity**: Uses proper foreign key relationships when available
2. **Improved Traceability**: Can trace exactly from planning to production
3. **Backward Compatibility**: Falls back to current method for incomplete data
4. **Future-Proof**: As more data gets proper relationships, accuracy will improve
5. **Data Quality Visibility**: Shows which records have proper relationships vs fallback matching

## Implementation Impact

- **Immediate**: Better accuracy for ~50% of records that have proper relationships
- **Progressive**: As more Work Plan Items get job_card assignments, accuracy improves
- **Debugging**: Easier to identify data quality issues and incomplete relationships
