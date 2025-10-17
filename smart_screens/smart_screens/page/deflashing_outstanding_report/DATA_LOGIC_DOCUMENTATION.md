# Deflashing Outstanding Report - Data Logic Documentation

## Overview
The Deflashing Outstanding Report is a comprehensive analytics dashboard that tracks materials sent to vendors for deflashing operations and monitors outstanding quantities that haven't been received back. The system provides four distinct views: **Compact Matrix**, **Data Table**, **List View**, and **Analytics Charts**.

## Core Data Model

### Primary Tables
1. **`tabDeflashing Despatch Entry`** - Records materials sent to vendors
2. **`tabDeflashing Despatch Entry Item`** - Line items for each dispatch
3. **`tabDeflashing Receipt Entry`** - Records materials received back from vendors

### Key Relationships
- **Dispatch ↔ Receipt**: Linked via `batch_no` and `item` fields
- **Outstanding Calculation**: `Dispatched - Received = Outstanding`

---

## 1. COMPACT MATRIX VIEW

### Data Logic
The matrix view creates a cross-tabulation of **Vendors (rows) vs Items (columns)** showing outstanding quantities.

### Core Algorithm
```sql
-- Main data aggregation query
SELECT 
    dde.warehouse as vendor,
    ddei.item,
    (ddei.qty - COALESCE(received.received_kg, 0)) as outstanding_kg,
    (ddei.qty_in_nos - COALESCE(received.received_nos, 0)) as outstanding_nos
FROM `tabDeflashing Despatch Entry` dde
INNER JOIN `tabDeflashing Despatch Entry Item` ddei ON dde.name = ddei.parent
LEFT JOIN (
    SELECT batch_no, item, SUM(product_weight) as received_kg, SUM(qty_in_nos) as received_nos
    FROM `tabDeflashing Receipt Entry`
    WHERE docstatus = 1
    GROUP BY batch_no, item
) received ON ddei.batch_no = received.batch_no AND ddei.item = received.item
WHERE dde.docstatus = 1 AND outstanding_kg > 0
```

### Matrix Processing Steps
1. **Data Collection**: Query dispatches with left join to receipts
2. **Outstanding Calculation**: For each vendor-item combination:
   - `Outstanding Kg = Dispatched Kg - Received Kg`
   - `Outstanding Nos = Dispatched Nos - Received Nos`
3. **Matrix Construction**:
   ```javascript
   matrix_data[vendor][item] = { kg: outstanding_kg, nos: outstanding_nos }
   ```
4. **Aggregation**:
   - **Row Totals**: Sum all items for each vendor
   - **Column Totals**: Sum all vendors for each item
   - **Grand Total**: Sum of all outstanding quantities

### Visual Features
- **Color Coding**: Each vendor gets unique background color using HSL algorithm
- **Item Borders**: Each item column gets unique border color
- **Cell Data**: Shows Kg (top) and Nos (bottom) in each cell
- **Interactive**: Click cells for drill-down details

---

## 2. DATA TABLE VIEW

### Data Logic
Provides raw transactional data with sorting and filtering capabilities.

### Data Structure
```javascript
data = [
    [vendor, item, outstanding_kg, outstanding_nos, last_dispatch, days_pending],
    // ... more rows
]
```

### Key Calculations
- **Days Pending**: `DATEDIFF(CURDATE(), dispatch_date)`
- **Last Dispatch**: Most recent dispatch date for vendor-item combination
- **Outstanding Values**: Same as matrix view but displayed in tabular format

### Features
- **Frappe DataTable**: Native Frappe component with sorting
- **Serial Numbers**: Automatic row numbering
- **Responsive**: Fluid layout adaptation
- **Export Ready**: Data formatted for Excel export

---

## 3. LIST VIEW

### Data Logic
Traditional table format with enhanced styling and status indicators.

### Processing Algorithm
```javascript
// Color coding based on days pending
let pending_class = days_pending > 30 ? 'text-danger' : 
                   (days_pending > 15 ? 'text-warning' : 'text-success');
```

### Risk Classification
- **0-15 days**: Green (Normal)
- **16-30 days**: Yellow (Caution) 
- **31+ days**: Red (Critical)

### Data Enhancement
- **Date Formatting**: Converts SQL dates to user-friendly format
- **Status Indicators**: Visual cues for pending duration
- **Alternating Rows**: Zebra striping for readability

---

## 4. ANALYTICS CHARTS VIEW

### Data Logic
Provides 5 distinct analytical perspectives using HTML/CSS visualizations.

### 4.1 Top 10 Vendors Chart
**Algorithm**:
```javascript
let vendor_data = Object.entries(vendor_totals)
    .sort((a, b) => b[1].kg - a[1].kg)
    .slice(0, 10);
```
**Visualization**: Horizontal progress bars with vendor colors

### 4.2 Top 10 Items Chart
**Algorithm**:
```javascript
let item_data = Object.entries(item_totals)
    .sort((a, b) => b[1].kg - a[1].kg)
    .slice(0, 10);
```
**Visualization**: Horizontal progress bars with item-specific colors

### 4.3 Days Pending Risk Analysis
**Risk Categorization**:
```javascript
ranges = {
    '0-15 days':   { color: '#2ecc71', risk: 'Low' },
    '16-30 days':  { color: '#f39c12', risk: 'Medium' },
    '31-60 days':  { color: '#e67e22', risk: 'High' },
    '61-90 days':  { color: '#e74c3c', risk: 'Critical' },
    '90+ days':    { color: '#8e44ad', risk: 'Urgent' }
};
```

**Processing**:
```javascript
this.raw_data.forEach(row => {
    let days = row.days_pending || 0;
    let outstanding = parseFloat(row.outstanding_kg || 0);
    
    if (days <= 15) ranges['0-15 days'].kg += outstanding;
    else if (days <= 30) ranges['16-30 days'].kg += outstanding;
    // ... continue for other ranges
});
```

### 4.4 Critical Alerts System
**Alert Types**:
1. **High Risk Items**: Items pending > 60 days
2. **Vendor Concentration Risk**: Single vendor > 30% of total outstanding
3. **Item Concentration Risk**: Single item > 25% of total outstanding
4. **System Status**: Overall vendor count assessment

**Algorithm**:
```javascript
// High risk alert
let high_pending = this.raw_data.filter(row => (row.days_pending || 0) > 60);
if (high_pending.length > 0) {
    alerts.push({
        type: 'danger',
        title: 'High Risk Items',
        message: `${high_pending.length} items > 60 days`
    });
}

// Vendor concentration risk
let concentration = (top_vendor_kg / total_outstanding * 100);
if (concentration > 30) {
    alerts.push({
        type: 'warning',
        title: 'Vendor Risk',
        message: `${vendor} has ${concentration}% concentration`
    });
}
```

### 4.5 Vendor Performance Table
**Metrics Calculated**:
- **Outstanding Weight**: Total Kg pending for vendor
- **Item Count**: Number of distinct items vendor handles
- **Performance Rating**: Based on concentration percentage
  - **Normal**: < 15% of total outstanding
  - **Monitor**: 15-30% of total outstanding  
  - **High Risk**: > 30% of total outstanding

---

## Data Processing Pipeline

### 1. Data Fetching
```javascript
frappe.call({
    method: 'smart_screens...get_deflashing_outstanding_data',
    args: {
        from_date: from_date,
        to_date: to_date,
        vendor_search: vendor_filter,
        item_search: item_filter,
        min_outstanding: minimum_threshold
    }
});
```

### 2. Data Processing
```javascript
process_data() {
    this.matrix_data = {};      // Vendor-Item matrix
    this.vendor_totals = {};    // Vendor aggregations
    this.item_totals = {};      // Item aggregations
    
    this.raw_data.forEach(row => {
        // Aggregate by vendor
        this.vendor_totals[vendor].kg += outstanding_kg;
        
        // Aggregate by item  
        this.item_totals[item].kg += outstanding_kg;
        
        // Build matrix
        this.matrix_data[vendor][item] = { kg: outstanding_kg, nos: outstanding_nos };
    });
}
```

### 3. View Rendering
Each view processes the same core data differently:
- **Matrix**: Cross-tabulation with visual encoding
- **DataTable**: Flat table with native Frappe components
- **List**: Enhanced table with status indicators
- **Charts**: Multiple analytical perspectives

---

## Search and Filtering Logic

### Real-time Filtering
```javascript
apply_search_filters() {
    let vendor_search = $('#vendor_search').val().toLowerCase();
    let item_search = $('#item_search').val().toLowerCase();
    
    if (vendor_search) {
        vendors = vendors.filter(v => v.toLowerCase().includes(vendor_search));
    }
    
    if (item_search) {
        items = items.filter(i => i.toLowerCase().includes(item_search));
    }
    
    this.render_report(); // Re-render with filtered data
}
```

### Server-side Filtering
- **Date Range**: SQL WHERE clause on posting_date
- **Minimum Outstanding**: HAVING clause on calculated outstanding
- **Vendor/Item Search**: LIKE queries on respective fields

---

## Performance Optimizations

### 1. Query Optimization
- **Indexed Joins**: Uses primary keys and indexed columns
- **LEFT JOIN**: Efficiently handles missing receipts
- **Aggregation**: Server-side SUM operations reduce data transfer

### 2. Client-side Optimization
- **Single Data Load**: All views use same dataset
- **Lazy Rendering**: Views render only when selected
- **CSS Animations**: Hardware-accelerated transitions
- **Virtual Scrolling**: Efficient handling of large datasets

### 3. Caching Strategy
- **Session Storage**: Filter preferences preserved
- **Component Reuse**: Matrix colors consistently generated
- **Event Debouncing**: Search input delays prevent excessive queries

---

## Error Handling

### Server-side
```python
try:
    # Query execution
    data = frappe.db.sql(query, values, as_dict=True)
    return {'status': 'success', 'data': data}
except Exception as e:
    frappe.log_error(f"Error in deflashing report: {str(e)}")
    return {'status': 'error', 'message': str(e)}
```

### Client-side
```javascript
callback: function(r) {
    if (r.message && r.message.status === 'success') {
        // Process successful response
    } else {
        frappe.msgprint(__('Error: ' + (r.message.message || 'Unknown error')));
    }
}
```

---

## Export Functionality

### Excel Export Logic
```javascript
export_to_excel() {
    let export_data = this.raw_data.map(row => ({
        'Vendor': row.vendor,
        'Item': row.item,
        'Outstanding (Kg)': parseFloat(row.outstanding_kg || 0).toFixed(3),
        'Outstanding (Nos)': parseInt(row.outstanding_nos || 0),
        'Last Dispatch': frappe.datetime.str_to_user(row.last_dispatch)
    }));
    
    frappe.tools.downloadify(export_data, null, this);
}
```

---

## Summary Statistics

### Real-time Calculations
```javascript
render_summary() {
    let total_vendors = Object.keys(this.vendor_totals).length;
    let total_items = Object.keys(this.item_totals).length;
    let total_outstanding_kg = Object.values(this.vendor_totals)
        .reduce((sum, v) => sum + v.kg, 0);
    let total_outstanding_nos = Object.values(this.vendor_totals)
        .reduce((sum, v) => sum + v.nos, 0);
}
```

### Compact Badge Display
Statistics shown as inline badges for space efficiency:
- **Vendor Count**: Number of active vendors
- **Item Count**: Number of items with outstanding quantities  
- **Total Outstanding Kg**: Sum of all pending weights
- **Total Outstanding Nos**: Sum of all pending quantities

---

This documentation provides the complete data logic foundation for understanding how each view processes, transforms, and presents the deflashing outstanding data for effective business monitoring and decision-making.