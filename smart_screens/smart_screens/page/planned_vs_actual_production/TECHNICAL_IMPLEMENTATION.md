# Technical Implementation: Planned vs Actual Production Page

## Architecture Overview

### Data Flow Architecture
```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│  Work Planning  │    │ Moulding Prod.  │    │  Stock Entry    │
│                 │    │     Entry       │    │                 │
│ • date          │    │ • moulding_date │    │ • posting_date  │
│ • shift_type    │    │ • item_to_prod. │    │ • item_code     │
│ • items[]       │    │ • spp_batch_no  │    │ • qty (kg)      │
│   └─lot_number  │    │ • actual_pieces │    │ • purpose=Mfg   │
│   └─targets[]   │    │ • weight        │    │                 │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         └───────────────────────┼───────────────────────┘
                                 ▼
                    ┌─────────────────────────┐
                    │   Aggregation Engine    │
                    │                         │
                    │ Group by:               │
                    │ • Item Code             │
                    │ • Production Date       │
                    │ • Shift (if available)  │
                    └─────────────────────────┘
                                 ▼
                    ┌─────────────────────────┐
                    │  Calculated Metrics     │
                    │                         │
                    │ • Efficiency %          │
                    │ • Variance (pieces)     │
                    │ • Status Classification │
                    └─────────────────────────┘
```

## Database Schema Analysis

### Primary Tables
1. **`tabWork Planning`** - Master planning document
2. **`tabWork Plan Item`** - Items planned for production
3. **`tabWork Plan Item Target`** - Target quantities per shift
4. **`tabMoulding Production Entry`** - Actual production records
5. **`tabStock Entry`** - Final manufacturing output
6. **`tabStock Entry Detail`** - Stock entry line items

### Key Relationships
```sql
-- Work Planning Hierarchy
tabWork Planning (1) → tabWork Plan Item (N) → tabWork Plan Item Target (N)

-- Production Chain
tabMoulding Production Entry.stock_entry_reference → tabStock Entry.name

-- No Direct Link (Problem!)
tabWork Plan Item.lot_number ≠ tabMoulding Production Entry.spp_batch_number
```

## Core Algorithms

### 1. Data Aggregation Algorithm

```python
def aggregate_production_data(from_date, to_date, item_filter):
    # Step 1: Get planned data with aggregation
    planned_data = get_planned_aggregation(from_date, to_date, item_filter)
    
    # Step 2: Get actual production data
    actual_data = get_actual_aggregation(from_date, to_date, item_filter)
    
    # Step 3: Get stock entry data
    stock_data = get_stock_aggregation(from_date, to_date, item_filter)
    
    # Step 4: Merge data using composite key (date|item|shift)
    combined_data = merge_datasets(planned_data, actual_data, stock_data)
    
    # Step 5: Calculate derived metrics
    for record in combined_data:
        record['variance_pieces'] = record['actual'] - record['planned']
        record['efficiency'] = (record['actual'] / record['planned']) * 100 if record['planned'] > 0 else 0
        record['status'] = classify_efficiency(record['efficiency'])
    
    return combined_data
```

### 2. Planned Data Query Strategy

```sql
SELECT 
    wp.date as production_date,
    wpi.item as item_code,
    wp.shift_type,
    COALESCE(SUM(COALESCE(wpit.target_qty, 0)), 0) as planned_qty_pieces,
    COUNT(DISTINCT wpi.name) as planned_lots
FROM `tabWork Planning` wp
JOIN `tabWork Plan Item` wpi ON wp.name = wpi.parent
LEFT JOIN `tabWork Plan Item Target` wpit ON wpi.name = wpit.parent
WHERE wp.date BETWEEN %s AND %s
GROUP BY wp.date, wpi.item, wp.shift_type
```

**Key Points:**
- Uses `COALESCE` to handle NULL target quantities
- Groups by date, item, and shift for proper aggregation
- Counts distinct work plan items for traceability

### 3. Actual Production Query Strategy

```sql
SELECT 
    mpe.moulding_date as production_date,
    mpe.item_to_produce as item_code,
    SUM(mpe.number_of_lifts * mpe.no_of_running_cavities) as actual_qty_pieces,
    SUM(mpe.weight) as actual_weight_kg,
    COUNT(DISTINCT mpe.name) as production_entries
FROM `tabMoulding Production Entry` mpe
WHERE mpe.moulding_date BETWEEN %s AND %s
AND mpe.docstatus = 1
GROUP BY mpe.moulding_date, mpe.item_to_produce
```

**Key Points:**
- Calculates actual pieces as `lifts × cavities`
- Sums weight for total production weight
- Only includes submitted documents (`docstatus = 1`)
- No shift data available, maps to "All" shift

### 4. Stock Entry Query Strategy

```sql
SELECT 
    DATE(se.posting_date) as production_date,
    sed.item_code,
    SUM(sed.qty) as stock_qty_kg,
    COUNT(DISTINCT se.name) as stock_entries
FROM `tabStock Entry` se
JOIN `tabStock Entry Detail` sed ON se.name = sed.parent
WHERE se.posting_date BETWEEN %s AND %s
AND se.purpose = 'Manufacture'
AND se.docstatus = 1
AND sed.t_warehouse IS NOT NULL
GROUP BY DATE(se.posting_date), sed.item_code
```

**Key Points:**
- Filters for manufacturing purpose only
- Includes only target warehouse items (finished goods)
- Groups by date for daily aggregation

## Data Merging Strategy

### Composite Key Generation
```python
def generate_composite_key(date, item_code, shift_type):
    return f"{date}|{item_code}|{shift_type or 'All'}"
```

### Merging Algorithm
```python
def merge_datasets(planned, actual, stock):
    combined = {}
    
    # Add planned data
    for row in planned:
        key = generate_composite_key(row.date, row.item, row.shift)
        combined[key] = initialize_record(row)
        combined[key]['planned_qty_pieces'] = row.planned_qty
    
    # Add actual data (maps to "All" shift since no shift data)
    for row in actual:
        key_all = generate_composite_key(row.date, row.item, 'All')
        if key_all not in combined:
            combined[key_all] = initialize_record(row, shift='All')
        combined[key_all]['actual_qty_pieces'] = row.actual_qty
        combined[key_all]['actual_weight_kg'] = row.weight
    
    # Add stock data
    for row in stock:
        key_all = generate_composite_key(row.date, row.item, 'All')
        if key_all in combined:
            combined[key_all]['stock_qty_kg'] = row.stock_qty
    
    return list(combined.values())
```

## Performance Optimization

### 1. Query Optimization
- **Date Range Indexing**: Indexes on date fields for faster filtering
- **Composite Indexes**: `(date, item_code)` for join optimization
- **Limit Large Queries**: Max 30-day date ranges to prevent timeouts

### 2. Data Processing Optimization
```python
# Use dictionary lookups for O(1) merging instead of nested loops
lookup_dict = {generate_key(row): row for row in planned_data}

# Process actual data with single pass
for actual_row in actual_data:
    key = generate_key(actual_row)
    if key in lookup_dict:
        lookup_dict[key].update(actual_row)
```

### 3. Frontend Optimization
- **Lazy Loading**: Load charts only after data is available
- **Debounced Filtering**: Prevent rapid-fire API calls
- **Local Caching**: Cache data for export without re-fetching

## Error Handling

### 1. Data Validation
```python
def validate_date_range(from_date, to_date):
    if not from_date or not to_date:
        frappe.throw("From Date and To Date are required")
    
    if getdate(from_date) > getdate(to_date):
        frappe.throw("From Date cannot be greater than To Date")
    
    if (getdate(to_date) - getdate(from_date)).days > 30:
        frappe.throw("Date range cannot exceed 30 days")
```

### 2. SQL Error Handling
```python
try:
    data = frappe.db.sql(query, values, as_dict=True)
except Exception as e:
    frappe.log_error(f"Query failed: {str(e)}")
    frappe.throw("Database error occurred. Please try again.")
```

### 3. Frontend Error Handling
```javascript
frappe.call({
    method: '...',
    callback: function(r) {
        if (r.message) {
            // Success handling
        }
    },
    error: function(err) {
        console.error('Error:', err);
        frappe.msgprint('Error loading data. Please try again.');
        hideLoading();
    }
});
```

## Security Considerations

### 1. Parameter Sanitization
```python
@frappe.whitelist()
def get_planned_vs_actual_data(from_date=None, to_date=None, item_filter=None):
    # Validate dates
    from_date = getdate(from_date) if from_date else None
    to_date = getdate(to_date) if to_date else None
    
    # Sanitize item filter
    if item_filter:
        item_filter = frappe.db.escape(item_filter.strip())
```

### 2. Role-based Access
```json
{
    "roles": [
        {"role": "System Manager"},
        {"role": "Manufacturing Manager"},
        {"role": "Production User"}
    ]
}
```

### 3. SQL Injection Prevention
- Use parameterized queries with `frappe.db.sql(query, values)`
- Escape user inputs with `frappe.db.escape()`
- Validate input types and ranges

## Testing Strategy

### 1. Unit Tests
```python
def test_efficiency_calculation():
    data = {'planned_qty_pieces': 100, 'actual_qty_pieces': 85}
    result = calculate_efficiency(data)
    assert result['efficiency'] == 85.0
    assert result['status'] == 'On Target'
```

### 2. Integration Tests
```python
def test_data_aggregation():
    from_date = '2025-06-01'
    to_date = '2025-06-07'
    result = get_planned_vs_actual_data(from_date, to_date)
    assert isinstance(result, list)
    assert all('efficiency' in row for row in result)
```

### 3. Performance Tests
```python
def test_query_performance():
    start_time = time.time()
    get_planned_vs_actual_data('2025-01-01', '2025-01-31')
    execution_time = time.time() - start_time
    assert execution_time < 5.0  # Should complete within 5 seconds
```

## Deployment Checklist

### 1. Database Requirements
- [ ] Verify indexes on date columns
- [ ] Check data consistency in source tables
- [ ] Test with production data volume

### 2. Performance Validation
- [ ] Test with 30-day date range
- [ ] Validate memory usage with large datasets
- [ ] Check query execution plans

### 3. User Acceptance
- [ ] Verify calculation accuracy
- [ ] Test export functionality
- [ ] Validate responsive design

### 4. Security Review
- [ ] Confirm role-based access
- [ ] Test parameter validation
- [ ] Review SQL injection protection

## Monitoring and Maintenance

### 1. Performance Monitoring
```python
# Add logging for slow queries
if execution_time > 2.0:
    frappe.log_error(f"Slow query detected: {execution_time}s")
```

### 2. Data Quality Checks
```python
# Regular data validation
def validate_data_quality():
    # Check for orphaned records
    # Verify calculation accuracy
    # Monitor data completeness
```

### 3. Usage Analytics
- Track page load times
- Monitor API call frequency
- Analyze user interaction patterns

This technical implementation provides a robust foundation for the Planned vs Actual Production comparison while addressing the challenges of data relationship gaps in the current system.
