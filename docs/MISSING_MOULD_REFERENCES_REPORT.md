# Missing Mould References Report - sppmaster.local

**Report Date:** October 6, 2025  
**Site:** sppmaster.local  
**DocType:** Moulding Production Entry

---

## Executive Summary

🚨 **Critical Data Quality Issue Identified**

- **Total Entries Missing Mould Reference:** 3,493
- **Status Breakdown:**
  - ✅ Submitted (docstatus=1): 3,477 entries
  - 📝 Draft (docstatus=0): 1 entry
  - ❌ Cancelled (docstatus=2): 15 entries
  
- **Date Range:** June 21, 2023 to September 15, 2023
- **Time Period:** ~3 months of production data

---

## Impact Analysis

### 1. **Reporting Impact**
- These 3,493 entries were previously showing as "N/A" in the Mould Performance Report
- Unable to track performance metrics for these moulds
- Distorts aggregate statistics and totals
- Makes trend analysis incomplete

### 2. **Business Impact**
- **Lost Traceability:** Cannot link production to specific moulds
- **Maintenance Issues:** Cannot track mould lifecycle and service history
- **Quality Control:** Difficult to identify mould-specific quality issues
- **Capacity Planning:** Incomplete data for mould utilization analysis
- **Cost Tracking:** Cannot allocate production costs to specific moulds

### 3. **Data Volume**
- Represents approximately **3,493 production entries**
- Estimated production volume affected (based on sample):
  - Average lifts per entry: ~100 lifts
  - Total lifts affected: ~350,000 lifts
  - This is a significant portion of production data

---

## Sample Data Analysis

### Top 10 Most Recent Entries Without Mould Reference:

| Entry ID | Date | Lot Number | Compound | Operator | Lifts | Weight | Status |
|----------|------|------------|----------|----------|-------|--------|--------|
| MLDPE-03527 | 2023-09-15 | 23I14Z05 | C_BE0086v9 | Senthil Manickam | 35 | 4.50 | Submitted |
| MLDPE-03526 | 2023-09-15 | 23I14Y05 | C_BE0086v9 | Mouli V | 30 | 3.54 | Submitted |
| MLDPE-03525 | 2023-09-15 | 23I14Z04 | C_7580v7 | Anbu G | 111 | 3.91 | Submitted |
| MLDPE-03524 | 2023-09-15 | 23I14V01 | C_70103v35 | Chhotu Ganjhu | 120 | 18.05 | Submitted |
| MLDPE-03523 | 2023-09-15 | 23I14Z03 | C_69221v10 | Anbu G | 155 | 10.05 | Submitted |
| MLDPE-03522 | 2023-09-15 | 23I14Z07 | C_70103v35 | VIMALRAJ DEVARAJ | 82 | 6.66 | Submitted |
| MLDPE-03521 | 2023-09-15 | 23I14Z06 | C_70103v35 | Gokul Ragumani | 92 | 9.29 | Submitted |
| MLDPE-03520 | 2023-09-15 | 23I14Z01 | C_D6122Lv1 | M Murali | 148 | 13.79 | Submitted |
| MLDPE-03519 | 2023-09-15 | 23I14Z02 | C_69221v10 | M Murali | 148 | 14.28 | Submitted |
| MLDPE-03518 | 2023-09-14 | 23I14Y09 | C_7022v33 | V Ajith | 145 | 11.04 | Submitted |

---

## Root Cause Analysis

### Possible Reasons:

1. **Process Issue:**
   - Mould reference field might not have been mandatory during June-September 2023
   - Data entry workflow didn't enforce mould reference selection
   - Operators bypassed or skipped the field

2. **Data Migration:**
   - Could be legacy data migrated from old system
   - Migration script may have missed mould reference mapping

3. **System Configuration:**
   - Field validation rules might not have been configured properly
   - Custom form script might have had bugs during this period

4. **Training Gap:**
   - Operators may not have understood the importance of mould reference
   - Lack of standard operating procedures

---

## Recommendations

### Immediate Actions (Priority: HIGH)

1. **Stop the Bleeding:**
   - ✅ DONE: Updated report to exclude entries without mould reference
   - ✅ DONE: Added validation filters: `mould_reference IS NOT NULL` and `mould_reference != ''`
   - ⚠️ TODO: Make mould_reference field mandatory in DocType

2. **Data Cleanup Strategy:**
   ```python
   # Approach to identify moulds from historical data
   
   # Method 1: Use scan_lot_number patterns
   # - Lot numbers may contain mould identifiers
   # - Example: 23I14Z05 might map to a specific mould
   
   # Method 2: Use compound code + operator combination
   # - Certain operators typically work with specific moulds
   # - Compound codes are often mould-specific
   
   # Method 3: Use Job Card reference
   # - If job_card is populated, it may link to work order
   # - Work order should have mould specification
   
   # Method 4: Time-based inference
   # - If same operator on same machine at same time
   # - Previous/next entries might have correct mould ref
   ```

3. **Create Data Quality Dashboard:**
   - Real-time monitoring of entries without mould references
   - Alert system for new entries missing critical fields
   - Daily/weekly reports to management

### Short-term Actions (Priority: MEDIUM)

4. **Enhance Form Validation:**
   ```javascript
   // Add to moulding_production_entry.js
   frappe.ui.form.on('Moulding Production Entry', {
       validate: function(frm) {
           if (!frm.doc.mould_reference) {
               frappe.throw(__('Mould Reference is mandatory'));
           }
       }
   });
   ```

5. **Add Visual Indicators:**
   - Color-code entries without mould reference in list views
   - Add custom indicators in forms
   - Dashboard cards showing data quality metrics

6. **Implement Data Recovery Script:**
   ```python
   # Script to attempt automatic recovery
   # Based on pattern matching and ML inference
   ```

### Long-term Actions (Priority: LOW)

7. **Process Improvements:**
   - Update SOPs to emphasize mould reference importance
   - Add barcode scanning for mould identification
   - Implement QR codes on moulds

8. **Training:**
   - Train all operators on proper data entry
   - Conduct refresher sessions quarterly
   - Create video tutorials

9. **System Enhancements:**
   - Auto-populate mould reference from Job Card
   - Implement smart suggestions based on compound/operator
   - Add mobile app with offline validation

---

## SQL Queries for Further Analysis

### 1. Find Entries by Compound Code:
```sql
SELECT 
    compound,
    COUNT(*) as entry_count,
    SUM(number_of_lifts) as total_lifts
FROM `tabMoulding Production Entry`
WHERE (mould_reference IS NULL OR mould_reference = '')
    AND docstatus = 1
GROUP BY compound
ORDER BY entry_count DESC
LIMIT 20;
```

### 2. Find Entries by Operator:
```sql
SELECT 
    employee_name,
    COUNT(*) as entry_count,
    MIN(moulding_date) as first_date,
    MAX(moulding_date) as last_date
FROM `tabMoulding Production Entry`
WHERE (mould_reference IS NULL OR mould_reference = '')
    AND docstatus = 1
GROUP BY employee_name
ORDER BY entry_count DESC;
```

### 3. Find Pattern in Lot Numbers:
```sql
SELECT 
    LEFT(scan_lot_number, 5) as lot_prefix,
    COUNT(*) as count
FROM `tabMoulding Production Entry`
WHERE (mould_reference IS NULL OR mould_reference = '')
    AND docstatus = 1
    AND scan_lot_number IS NOT NULL
GROUP BY lot_prefix
ORDER BY count DESC;
```

### 4. Potential Recovery via Job Card:
```sql
SELECT 
    mpe.name,
    mpe.scan_lot_number,
    mpe.job_card,
    jc.work_order,
    wo.production_item
FROM `tabMoulding Production Entry` mpe
LEFT JOIN `tabJob Card` jc ON mpe.job_card = jc.name
LEFT JOIN `tabWork Order` wo ON jc.work_order = wo.name
WHERE (mpe.mould_reference IS NULL OR mpe.mould_reference = '')
    AND mpe.docstatus = 1
    AND mpe.job_card IS NOT NULL
LIMIT 50;
```

---

## Data Recovery Workflow

### Phase 1: Automated Recovery (Est. 60-70% recovery)
1. Use Job Card linkage
2. Pattern matching on lot numbers
3. Time-series inference (before/after entries)
4. Compound-operator combination matching

### Phase 2: Semi-Automated Recovery (Est. 20-25% recovery)
1. Present suggestions to supervisors for verification
2. Batch update with approval workflow
3. Use ML model for prediction

### Phase 3: Manual Recovery (Est. 5-10% remaining)
1. Escalate to operators who created entries
2. Check physical production logs
3. Accept data as unmapped if no evidence found

---

## Monitoring and Prevention

### KPIs to Track:
1. **Data Completeness Rate:** 
   - Target: 100% of entries with mould reference
   - Current: ~XX% (need to calculate against total entries)

2. **Daily Compliance:**
   - Track % of entries with all mandatory fields filled
   - Alert if daily rate drops below 95%

3. **Operator Performance:**
   - Track data quality by operator
   - Identify training needs

### Dashboard Widgets:
```javascript
// Add to custom dashboard
{
    "widget_name": "Data Quality - Mould Reference",
    "widget_type": "Number Card",
    "source": "Custom",
    "stats": {
        "entries_without_mould": 0,
        "target": 0,
        "indicator": "green"
    }
}
```

---

## Export Options

To export the full list of affected entries:

```python
# Run in bench console
import frappe
import pandas as pd

entries = frappe.db.sql("""
    SELECT 
        name, moulding_date, scan_lot_number, 
        compound, employee_name, number_of_lifts, 
        weight, docstatus, creation
    FROM `tabMoulding Production Entry`
    WHERE (mould_reference IS NULL OR mould_reference = '')
    ORDER BY moulding_date DESC
""", as_dict=1)

df = pd.DataFrame(entries)
df.to_excel('/tmp/missing_mould_references.xlsx', index=False)
print(f"Exported {len(entries)} entries to /tmp/missing_mould_references.xlsx")
```

---

## Conclusion

This is a **significant data quality issue** that affects:
- 3,493 production entries
- 3 months of historical data (June-September 2023)
- Core reporting and analytics capabilities

**Next Steps:**
1. ✅ Report filtering implemented (hiding affected entries)
2. ⚠️ Make field mandatory to prevent future occurrences
3. 📋 Plan data recovery strategy
4. 🎓 Conduct operator training
5. 📊 Implement monitoring dashboard

**Priority:** HIGH - Immediate action required to prevent further data quality degradation.

---

**Report Generated By:** Frappe MCP Query Tool  
**Contact:** System Administrator  
**Document Version:** 1.0
