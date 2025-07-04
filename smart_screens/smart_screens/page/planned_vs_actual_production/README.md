# Planned vs Actual Production Comparison Page

## Overview
This page provides a comprehensive comparison between planned production quantities (from Work Planning) and actual production outputs (from Moulding Production Entry and Stock Entry), helping management track production efficiency and identify variances.

## Key Features

### 📊 **Data Sources Integration**
- **Work Planning**: Planned quantities in pieces per shift
- **Moulding Production Entry**: Actual pieces produced during moulding
- **Stock Entry**: Final output quantities in kg from manufacturing

### 🎯 **Key Metrics Tracked**
1. **Planned Qty (Pieces)**: Target production from work planning
2. **Actual Qty (Pieces)**: Real pieces produced in moulding
3. **Actual Weight (Kg)**: Weight recorded in moulding production
4. **Stock Qty (Kg)**: Final manufactured stock quantities
5. **Variance**: Difference between planned and actual pieces
6. **Efficiency**: (Actual/Planned) × 100%

### 📈 **Summary Statistics**
- Total Planned vs Actual Pieces
- Total Stock Output (Kg)
- Overall Production Efficiency
- Average Efficiency Across Items
- Total Items and Production Days

## Data Linkage Strategy

### Challenge: No Direct Relationship
There is **no direct linkage** between:
- Work Planning lot numbers (e.g., `25F28X10`)
- Moulding Production SPP batch numbers (e.g., `25F25X9-1`)

### Solution: Aggregation by Item + Date
The system aggregates data by:
- **Item Code** (common identifier)
- **Production Date** (temporal matching)
- **Shift Type** (where available)

### Data Flow
```
Work Planning → Planned Quantities (Pieces)
     ↓
[Item + Date Matching]
     ↓
Moulding Production → Actual Pieces + Weight
     ↓
Stock Entry → Final Output (Kg)
```

## Business Logic

### Efficiency Calculation
```sql
Efficiency = (Actual Pieces / Planned Pieces) × 100
```

### Variance Analysis
```sql
Variance (Pieces) = Actual Pieces - Planned Pieces
Variance (%) = (Variance / Planned Pieces) × 100
```

### Status Classification
- **Over Target**: Efficiency > 100% (Green)
- **On Target**: Efficiency 85-100% (Yellow)
- **Under Target**: Efficiency < 85% (Red)

## Technical Implementation

### Backend Methods
1. **`get_planned_vs_actual_data()`**: Main data retrieval and aggregation
2. **`get_summary_statistics()`**: Calculate overall performance metrics
3. **`get_item_list()`**: Provide item filtering options

### Database Queries
The system uses complex SQL JOINs to:
- Aggregate planned quantities from Work Planning and Work Plan Item Target
- Summarize actual production from Moulding Production Entry
- Collect stock output from Stock Entry (Manufacture purpose)

### Key SQL Logic
```sql
-- Planned Data
SELECT wp.date, wpi.item, SUM(wpit.target_qty) as planned_qty
FROM `tabWork Planning` wp
JOIN `tabWork Plan Item` wpi ON wp.name = wpi.parent
LEFT JOIN `tabWork Plan Item Target` wpit ON wpi.name = wpit.parent

-- Actual Production Data  
SELECT mpe.moulding_date, mpe.item_to_produce,
       SUM(mpe.number_of_lifts * mpe.no_of_running_cavities) as actual_qty
FROM `tabMoulding Production Entry` mpe

-- Stock Output Data
SELECT se.posting_date, sed.item_code, SUM(sed.qty) as stock_qty
FROM `tabStock Entry` se
JOIN `tabStock Entry Detail` sed ON se.name = sed.parent
WHERE se.purpose = 'Manufacture'
```

## Features

### 🔍 **Filtering Options**
- **Date Range**: From/To date selection
- **Item Filter**: Search by item code
- **Real-time Updates**: Apply filters instantly

### 📊 **Visual Analytics**
1. **Daily Production Trend**: Line chart showing planned vs actual over time
2. **Efficiency Distribution**: Doughnut chart showing performance categories

### 💾 **Data Export**
- Export filtered data to CSV format
- Includes all key metrics and calculations

### 📱 **Responsive Design**
- Mobile-friendly interface
- Adaptive layout for different screen sizes

## Usage Instructions

### Navigation
Access via: **Smart Screens → Planned vs Actual Production**

### Filtering Data
1. Set **From Date** and **To Date** (defaults to last 7 days)
2. Enter **Item Filter** for specific items (optional)
3. Click **Apply** to update results

### Understanding Results
- **Green Status**: Production exceeding targets
- **Yellow Status**: Production meeting targets (85-100%)
- **Red Status**: Production below targets (<85%)

### Exporting Data
Click **Export** to download CSV with current filter results

## Limitations & Considerations

### Data Matching Limitations
1. **No Direct Batch Linking**: Cannot trace specific batches from planning to production
2. **Shift Aggregation**: Moulding Production doesn't have shift data, so actual is mapped to "All" shifts
3. **Time Lag**: Planning may be for future dates while production is historical

### Unit Conversion Challenge
- **Planning**: Pieces
- **Production**: Pieces + Weight
- **Stock**: Weight (Kg)

The system shows both pieces and weight to provide complete visibility.

### Performance Considerations
- Queries are optimized for date ranges up to 30 days
- Large date ranges may impact performance
- Indexes on date and item fields recommended

## Future Enhancements

### Potential Improvements
1. **Batch Traceability**: Establish direct linking between planning and production batches
2. **Shift-wise Actual Data**: Capture shift information in Moulding Production Entry
3. **Real-time Updates**: WebSocket integration for live production monitoring
4. **Advanced Analytics**: Trend analysis, forecasting, and anomaly detection
5. **Unit Conversion**: Automatic piece-to-kg conversion using item master data

### Integration Opportunities
1. **Job Card Integration**: Link production efficiency to job card performance
2. **Quality Metrics**: Integrate rejection rates and quality scores
3. **Resource Utilization**: Connect with machine and operator efficiency data

## Troubleshooting

### Common Issues
1. **No Data Showing**: Check date range and item filters
2. **Missing Actual Data**: Verify Moulding Production Entry submissions
3. **Zero Efficiency**: Indicates missing planned data for the item/date

### Data Validation
- Planned quantities should exist in Work Planning
- Actual quantities should exist in Moulding Production Entry
- Stock entries should be submitted with 'Manufacture' purpose

## Related Pages
- **Shift Quantity Planned Report**: Detailed planning analysis
- **Mould Performance Report**: Equipment efficiency tracking
- **Sub Lot Process Page**: Production workflow management
