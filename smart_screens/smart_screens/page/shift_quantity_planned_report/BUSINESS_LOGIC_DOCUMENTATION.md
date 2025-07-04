# Shift Quantity Planned Report - Business Logic Documentation

## Overview
The Shift Quantity Planned Report provides visibility into expected production quantities based on work planning data, target lifts, and mould specifications. It aggregates data from both regular and add-on work plans to give a comprehensive view of planned production for a given date and/or shift.

## Business Requirements

### Purpose
1. **Production Planning Visibility**: View expected production quantities based on target lifts and mould cavities
2. **Shift-wise Analysis**: Filter and analyze production plans by specific dates and shift types
3. **Resource Allocation**: Understand which items are planned on which presses (workstations)
4. **Capacity Planning**: Aggregate data from both regular and add-on work plans

### Key Business Question Answered
> "What is the expected production quantity for each item on each press for a given date/shift?"

## Data Sources

### Primary Doctypes
1. **Work Planning** (`tabWork Planning`)
   - Contains regular production plans
   - Fields: date, shift_type, supervisor details
   - Child table: Work Plan Item

2. **Add On Work Planning** (`tabAdd On Work Planning`)
   - Contains additional/supplementary production plans
   - Similar structure to Work Planning
   - Child table: Add On Work Plan Item

3. **Work Plan Item Target** (`tabWork Plan Item Target`)
   - Stores target lift quantities per item and shift type
   - Fields: item, shift_type (duration format), target_qty

4. **Mould Specification** (`tabMould Specification`)
   - Contains mould technical specifications
   - Key field: noof_cavities (number of cavities per mould)

5. **Shift Type** (`tabShift Type`)
   - Defines shift configurations
   - Key field: total_time (shift duration)

## Core Business Logic

### Expected Production Quantity Calculation
```
Expected Production Qty = Target No. Of Lifts × No. Of Cavities
```

Where:
- **Target No. Of Lifts**: Retrieved from `Work Plan Item Target.target_qty`
- **No. Of Cavities**: Retrieved from `Mould Specification.noof_cavities`

### Data Relationships and Mapping

#### Shift Type Mapping Challenge
**Problem**: Inconsistent shift type storage formats
- `Work Planning.shift_type` → Stores shift type name (e.g., "8 Hours - 1")
- `Work Plan Item Target.shift_type` → Stores duration (e.g., "8:00:00")

**Solution**: Join through Shift Type table
```sql
LEFT JOIN `tabShift Type` st ON wp.shift_type = st.name
LEFT JOIN `tabWork Plan Item Target` wpit ON 
    wpi.item = wpit.item AND 
    TIME(st.total_time) = TIME(wpit.shift_type)
```

#### Mould Specification Mapping
```sql
LEFT JOIN `tabMould Specification` ms ON 
    wpi.mould = ms.mould_ref AND 
    ms.docstatus = 1
```

## Data Aggregation Logic

### Grouping Strategy
Records are grouped by unique combination of:
- Item Code
- Press (Workstation)

### Aggregation Rules
1. **Expected Production Qty**: Sum of all calculations from both regular and add-on plans
2. **Plan Types**: Combine plan types ("Regular", "Add-on", or "Regular Add-on")
3. **Other Fields**: Take first occurrence for display purposes

### Plan Type Classification
- **"Regular"**: From Work Planning doctype only
- **"Add-on"**: From Add On Work Planning doctype only
- **"Regular Add-on"**: When both plan types exist for the same item/press combination

## SQL Query Structure

### Regular Work Planning Query
```sql
SELECT 
    wpi.item,
    wpi.work_station as press,
    wpi.mould,
    wp.date,
    wp.shift_type,
    ms.noof_cavities,
    wpit.target_qty,
    CASE 
        WHEN ms.noof_cavities IS NOT NULL AND wpit.target_qty IS NOT NULL 
        THEN CAST(ms.noof_cavities AS FLOAT) * CAST(wpit.target_qty AS FLOAT)
        ELSE 0
    END as expected_production_qty,
    'Regular' as plan_type
FROM `tabWork Planning` wp
INNER JOIN `tabWork Plan Item` wpi ON wp.name = wpi.parent
LEFT JOIN `tabMould Specification` ms ON wpi.mould = ms.mould_ref AND ms.docstatus = 1
LEFT JOIN `tabShift Type` st ON wp.shift_type = st.name
LEFT JOIN `tabWork Plan Item Target` wpit ON wpi.item = wpit.item AND TIME(st.total_time) = wpit.shift_type
WHERE wp.docstatus = 1 AND {filters}
```

### Add-on Work Planning Query
Similar structure but queries `tabAdd On Work Planning` and `tabAdd On Work Plan Item`

## Filter Logic

### Date Filter
- When provided: Filters both regular and add-on work plans by exact date match
- When not provided: Returns all dates

### Shift Type Filter
- When provided: Filters by specific shift type name
- When "All Shifts": No shift filtering applied

### Document Status Filter
- Only includes submitted documents (`docstatus = 1`)
- Ensures data integrity and approved plans only

## Error Handling

### Missing Data Scenarios
1. **No Target Data**: If `Work Plan Item Target` has no matching record, `target_qty` = 0
2. **No Mould Specification**: If no mould spec found, `noof_cavities` = 0
3. **Missing Calculations**: Expected production qty = 0 when either target or cavities is missing

### Data Type Handling
- Explicit CAST to FLOAT for calculations
- NULL handling with fallback to 0
- Time format conversion for shift type matching

## Report Output Structure

### Summary Cards
1. **Total Items**: Count of unique items
2. **Total Presses**: Count of unique workstations
3. **Total Expected Qty**: Sum of all expected production quantities
4. **Total Records**: Count of aggregated records

### Data Table Columns
1. **Item**: Product/item code
2. **Press**: Workstation/press name
3. **Mould**: Mould reference
4. **Date**: Planning date
5. **Shift Type**: Shift type name
6. **No. of Cavities**: From mould specification
7. **Target Qty (Lifts)**: Target number of lifts
8. **Expected Production Qty**: Calculated value
9. **Plan Types**: Regular/Add-on classification

## Business Rules and Constraints

### Data Validation Rules
1. Only submitted work plans are considered
2. Mould specifications must be submitted (`docstatus = 1`)
3. Both target qty and cavities must be available for meaningful calculations

### Calculation Rules
1. Zero values are returned when data is incomplete
2. Aggregation sums across multiple plans for same item/press
3. Plan types are combined when multiple sources exist

## Performance Considerations

### Query Optimization
1. Uses INNER JOINs for required relationships
2. Uses LEFT JOINs for optional data (targets, mould specs)
3. Filters applied early in WHERE clause
4. Limited result sets with proper indexing

### Database Configuration
- Requires `SQL_BIG_SELECTS=1` for complex joins
- Indexes recommended on:
  - Work Planning: date, shift_type, docstatus
  - Work Plan Item: parent, item
  - Work Plan Item Target: item, shift_type
  - Mould Specification: mould_ref, docstatus

## Future Enhancement Opportunities

### Potential Improvements
1. **Real-time Updates**: WebSocket integration for live data
2. **Capacity Analysis**: Compare planned vs actual capacity
3. **Efficiency Metrics**: Add performance indicators
4. **Export Features**: Enhanced export options with formatting
5. **Historical Trends**: Time-series analysis capabilities

### Data Quality Enhancements
1. **Data Validation**: Ensure target data completeness
2. **Master Data Integrity**: Validate mould-item relationships
3. **Audit Trail**: Track changes to planning data

## Technical Dependencies

### Frappe Framework
- Version compatibility with Frappe/ERPNext
- Standard doctype permissions and access controls
- Database query optimization features

### Custom App Dependencies
- Shree Polymer Custom App for core doctypes
- Smart Screens App for report interface
- Proper app installation and configuration

---

## Contact and Support
For technical queries or business logic clarifications, refer to the development team or system administrator.

**Last Updated**: July 2025
**Version**: 1.0
**Author**: Development Team
