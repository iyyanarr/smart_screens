# OEE Dashboard Data Flow Documentation

## Overview
This document explains how the OEE Dashboard collects, connects, and processes data from Work Planning and Moulding Production Entries to calculate Overall Equipment Effectiveness (OEE) metrics.

---

## 📊 High-Level Data Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│                        OEE DASHBOARD REQUEST                        │
│  User selects: Date Range, Shift, Machine, Lot, Item               │
└────────────────────────────┬────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    get_oee_data() - Main Entry Point                │
│  Location: oee_dashboard.py                                         │
│  Purpose: Orchestrates entire OEE calculation flow                  │
└────────────────────────────┬────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│              MouldingAdapter.get_production_data()                  │
│  Location: moulding_adapter.py                                      │
│  Purpose: Fetches and merges Work Planning + Production data        │
└────────────────────────────┬────────────────────────────────────────┘
                             │
        ┌────────────────────┴────────────────────┐
        │                                         │
        ▼                                         ▼
┌──────────────────┐                    ┌──────────────────┐
│  Work Planning   │                    │  Moulding Prod   │
│     Records      │                    │     Entries      │
│  (PLANNED data)  │                    │  (ACTUAL data)   │
└────────┬─────────┘                    └────────┬─────────┘
         │                                       │
         └────────────────┬──────────────────────┘
                          │
                          ▼
        ┌─────────────────────────────────────────┐
        │  MERGE by Lot Number (scan_lot_number)  │
        │  - Planned Date from Work Planning       │
        │  - Actual Date from Production Entry     │
        └───────────────────┬─────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     Linked Lot Detection                            │
│  get_linked_lot_info() - Auto-detect linked lots                   │
│  Groups lots by: Date + Shift + Machine + Item + Operator          │
└────────────────────────────┬────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     OEE Calculation                                 │
│  - Availability = (Planned Time - Downtime) / Planned Time          │
│  - Performance = Actual Qty / Target Qty                            │
│  - Quality = (Inspected - Rejected) / Inspected                     │
│  - OEE = Availability × Performance × Quality                       │
└────────────────────────────┬────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    Return OEE Results to UI                         │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 🔍 Detailed Step-by-Step Flow

### **STEP 1: Work Planning Data Collection**

**File:** `moulding_adapter.py` → `get_production_data()` method

**Purpose:** Get all planned production for the selected date range

**SQL Query:**
```python
SELECT
    wp.date as planned_date,              # PLANNED date from work planning
    wpi.lot_number,                        # Target lot number
    wpi.item,                              # Item to produce
    wpi.total_target_qty as target_qty,    # Target quantity (lifts)
    wpi.shift_type,                        # Shift (8 Hours - 1, 8 hours - 3, etc.)
    wpi.no_of_cavities,                    # Number of cavities in mold
    wpi.press_machine,                     # Machine/Press reference
    wp.work_plan_no                        # Work Plan document reference
FROM `tabWork Planning` wp
INNER JOIN `tabWork Planning Item` wpi ON wpi.parent = wp.name
WHERE wp.date BETWEEN '{from_date}' AND '{to_date}'
  AND wpi.process_name = 'Moulding'
  AND wp.docstatus = 1
```

**Output Example:**
```python
{
    'planned_date': '2025-11-10',
    'lot_number': '25K10Z08',
    'item': 'T4012 TI',
    'target_qty': 80,
    'shift_type': '8 hours - 3',
    'no_of_cavities': 60,
    'press_machine': 'P18 : DESMA - INJUCTION MOULDING 250 TON',
    'work_plan_no': 'WP-2025-11-10-001'
}
```

---

### **STEP 2: Extract Lot Numbers from Work Planning**

**Purpose:** Create a list of all lot numbers that need production data

**Code:**
```python
# Get unique lot numbers from ALL work plans
work_plan_lot_numbers = list(set([wp['lot_number'] for wp in all_work_plans]))

# Example: ['25K10Z08', '25K10Z12', '25K10Z14', '25K10Y08', ...]
```

---

### **STEP 3: Moulding Production Entry Data Collection**

**Purpose:** Get ACTUAL production data for the lot numbers from Work Planning

**SQL Query:**
```python
SELECT 
    COALESCE(mpe.scan_lot_number, mpe.batch_no) as lot_number,
    mpe.mould_reference as mould_ref,
    mpe.item_to_produce as item_code,
    DATE(mpe.moulding_date) as actual_moulding_date,    # ⚠️ ACTUAL production date (may differ from planned!)
    SUM(mpe.number_of_lifts) as total_production_lifts,  # Total lifts produced
    SUM(mpe.number_of_lifts * mpe.no_of_running_cavities) as total_pieces_produced,
    AVG(COALESCE(mpe.downtime_minutes, 0)) as avg_downtime_minutes,
    mpe.employee_name as operator_name,
    jc.workstation as machine_name,
    SUM(mpe.weight) as total_production_weight
FROM `tabMoulding Production Entry` mpe
LEFT JOIN `tabJob Card` jc ON mpe.job_card = jc.name
WHERE COALESCE(mpe.scan_lot_number, mpe.batch_no) IN ('25K10Z08', '25K10Z12', ...)
  AND mpe.docstatus = 1
GROUP BY lot_number, mould_ref, item_code, actual_moulding_date, operator_name, machine_name
```

**Output Example:**
```python
{
    'lot_number': '25K10Z08',
    'mould_ref': 'TI-4012-A',
    'item_code': 'T4012 TI',
    'actual_moulding_date': '2025-11-11',    # ⚠️ Note: Different from planned date!
    'total_production_lifts': 10,
    'total_pieces_produced': 644,
    'avg_downtime_minutes': 5.0,
    'operator_name': 'G M SANJAY',
    'machine_name': 'P18 : DESMA - INJUCTION MOULDING 250 TON',
    'total_production_weight': 1.9452
}
```

---

### **STEP 4: Merge Work Planning + Production Data**

**Purpose:** Combine PLANNED data (from Work Planning) with ACTUAL data (from Production Entry)

**Code Logic:**
```python
# Group production data by lot number for quick lookup
production_by_lot = {}
for prod in production_data:
    lot = prod['lot_number']
    if lot not in production_by_lot:
        production_by_lot[lot] = []
    production_by_lot[lot].append(prod)

# Merge Work Planning with Production data
for work_plan in all_work_plans:
    lot_number = work_plan['lot_number']
    
    # Find production entry for this lot
    prod_records = production_by_lot.get(lot_number, [])
    
    if prod_records:
        # CASE A: Production exists - merge with work plan
        for prod in prod_records:
            result = {
                # FROM WORK PLANNING (PLANNED DATA):
                'production_date': work_plan['planned_date'],          # ← Display date (Nov 10)
                'shift_type': work_plan['shift_type'],
                'target_lifts': work_plan['target_qty'],
                'no_of_cavities': work_plan['no_of_cavities'],
                
                # FROM PRODUCTION ENTRY (ACTUAL DATA):
                'actual_moulding_date': prod['actual_moulding_date'],  # ← Actual date (Nov 11)
                'number_of_lifts': prod['total_production_lifts'],     # ← Actual lifts (10)
                'operator_name': prod['operator_name'],
                'downtime_minutes': prod['avg_downtime_minutes'],
                'weight': prod['total_production_weight'],
                
                # SHARED DATA:
                'lot_number': lot_number,
                'item_code': prod['item_code'],
                'machine_name': prod['machine_name']
            }
    else:
        # CASE B: No production yet - work plan only
        result = {
            'production_date': work_plan['planned_date'],
            'lot_number': lot_number,
            'has_production': False  # Flag for UI to show "Pending"
        }
```

**Critical Point: Date Mismatch Issue (FIXED!)**

**Before Fix:**
- Work Planning date: **Nov 10, 2025**
- Actual production date: **Nov 11, 2025**
- OEE Dashboard used: **Nov 10** (from Work Planning) for linked lot detection
- **Result:** Linked lot detection FAILED! ❌

**After Fix:**
- OEE Dashboard now uses **BOTH dates**:
  - `production_date`: Nov 10 (for UI display)
  - `actual_moulding_date`: Nov 11 (for linked lot detection)
- **Result:** Linked lot detection WORKS! ✅

---

### **STEP 5: Linked Lot Detection**

**File:** `lot_linking_helper.py` → `get_linked_lot_info()` method

**Purpose:** Auto-detect if a lot is part of a linked group

**Linking Criteria (ALL must match):**
1. ✅ Same **actual_moulding_date** (NOT planned_date!)
2. ✅ Same **shift_type** (case-insensitive: "8 hours - 3" = "8 Hours - 3")
3. ✅ Same **machine_name**
4. ✅ Same **item_code**
5. ✅ Same **operator_name**

**SQL Query:**
```python
# Step 1: Find the production entry for the current lot
SELECT 
    mpe.name,
    COALESCE(mpe.scan_lot_number, mpe.batch_no) as lot_number,
    mpe.moulding_date,                         # Actual production date
    mpe.item_to_produce as item_code,
    mpe.employee_name as operator_name,
    jc.shift_type,
    jc.workstation as machine_name
FROM `tabMoulding Production Entry` mpe
INNER JOIN `tabJob Card` jc ON mpe.job_card = jc.name
WHERE COALESCE(mpe.scan_lot_number, mpe.batch_no) = '25K10Z08'
  AND mpe.moulding_date = '2025-11-11'         # ⚠️ Use ACTUAL date!
  AND LOWER(jc.shift_type) = LOWER('8 hours - 3')
  AND mpe.docstatus = 1

# Step 2: Find ALL other lots with same context
SELECT 
    COALESCE(mpe.scan_lot_number, mpe.batch_no) as lot_number,
    mpe.name as production_entry,
    mpe.creation
FROM `tabMoulding Production Entry` mpe
INNER JOIN `tabJob Card` jc ON mpe.job_card = jc.name
WHERE mpe.moulding_date = '2025-11-11'                      # Same actual date
  AND LOWER(jc.shift_type) = LOWER('8 hours - 3')          # Same shift (case-insensitive)
  AND jc.workstation = 'P18 : DESMA - INJUCTION MOULDING 250 TON'  # Same machine
  AND mpe.item_to_produce = 'T4012 TI'                      # Same item
  AND mpe.employee_name = 'G M SANJAY'                      # Same operator
  AND mpe.docstatus = 1
ORDER BY mpe.creation ASC
```

**Output Example:**
```python
{
    'is_linked': True,
    'linked_lots': ['25K10Z08', '25K10Z12', '25K10Z14'],  # 3 lots found
    'linked_lot_count': 3,
    'total_entries': 3
}
```

---

### **STEP 6: Aggregate Production Data for Linked Lots**

**File:** `lot_linking_helper.py` → `aggregate_production_data()` method

**Purpose:** Combine production metrics from all linked lots

**SQL Query:**
```python
SELECT 
    SUM(mpe.number_of_lifts) as total_lifts,                    # Sum: 10 + 45 + 27 = 82 lifts
    SUM(mpe.weight) as total_weight_kg,                         # Sum: 1.95 + 8.77 + 5.26 = 15.98 kg
    SUM(mpe.number_of_lifts * mpe.no_of_running_cavities) as total_pieces,  # Sum: 644 + 2765 + 1657 = 5066 pieces
    AVG(mpe.downtime_minutes) as avg_downtime,
    COUNT(DISTINCT mpe.name) as entry_count
FROM `tabMoulding Production Entry` mpe
WHERE mpe.name IN ('MLDPE-25595', 'MLDPE-25596', 'MLDPE-25597')  # Production entry IDs
  AND mpe.docstatus = 1
```

**Output:**
```python
{
    'total_lifts': 82,              # Combined from all 3 lots
    'total_weight_kg': 15.98,
    'total_pieces': 5066,
    'total_target_qty': 80,         # From Work Plan Item Target (per shift, not per lot!)
    'avg_downtime': 5.0,
    'entry_count': 3
}
```

---

### **STEP 7: Aggregate Quality Data for Linked Lots**

**File:** `lot_linking_helper.py` → `aggregate_quality_data()` method

**Purpose:** Combine quality/inspection data from all linked lots

**SQL Query:**
```python
SELECT 
    SUM(ie.inspected_qty_nos) as total_inspected,      # ⚠️ FIXED: Use inspected_qty_nos, not total_inspected_qty_nos!
    SUM(ie.total_rejected_qty) as total_rejected,
    AVG(ie.total_rejected_qty_in_percentage) as avg_rejection_pct
FROM `tabInspection Entry` ie
WHERE ie.lot_no IN ('25K10Z08', '25K10Z12', '25K10Z14')
  AND ie.inspection_type = 'Lot Inspection'
  AND ie.docstatus = 1
```

**Output:**
```python
{
    'total_pieces': 600,          # Total inspected (300 + 300 + 0)
    'good_pieces': 563,           # Total - Rejected
    'rejected_pieces': 37,        # Total rejected (17 + 20 + 0)
    'rejection_percentage': 6.17, # (37 / 600) × 100
    'has_inspection': True
}
```

---

### **STEP 8: Calculate OEE Metrics**

**File:** `oee_dashboard.py` → `get_oee_data()` method

**Purpose:** Calculate final OEE percentage

**Formulas:**

```python
# AVAILABILITY
planned_time = 450 minutes  # 8 hours - 30 min lunch
downtime = 5 minutes
available_time = planned_time - downtime  # 445 minutes
availability_pct = (available_time / planned_time) × 100  # 98.89%

# PERFORMANCE
actual_qty = 82 lifts  # Aggregated from linked lots
target_qty = 80 lifts  # From Work Plan Item Target (per shift)
performance_pct = (actual_qty / target_qty) × 100  # 102.5%

# QUALITY
total_inspected = 600 pieces
rejected_pieces = 37 pieces
good_pieces = 563 pieces
quality_pct = (good_pieces / total_inspected) × 100  # 93.83%

# OEE
oee_pct = (availability_pct × performance_pct × quality_pct) / 10000
oee_pct = (98.89 × 102.5 × 93.83) / 10000  # 95.17%
```

---

## 🔧 Key Edge Cases Handled

### **1. Date Mismatch Between Work Plan and Production**

**Problem:** Work Planning date ≠ Actual production date

**Solution:**
- Store both dates: `production_date` (planned) and `actual_moulding_date` (actual)
- Use `actual_moulding_date` for linked lot detection
- Display `production_date` in UI

### **2. Case-Insensitive Shift Matching**

**Problem:** Shift names have inconsistent casing ("8 hours - 3" vs "8 Hours - 1")

**Solution:**
```python
WHERE LOWER(jc.shift_type) = LOWER(%s)  # Case-insensitive comparison
```

### **3. Same Lot Number with Multiple Production Entries**

**Problem:** One lot number appears multiple times in different production entries

**Solution:**
- Count total production ENTRIES, not just unique lot numbers
- Aggregate data from all entries with the same lot number

### **4. Inspection Field Mapping**

**Problem:** `total_inspected_qty_nos` is always 0 (not populated by form)

**Solution:**
```python
# WRONG: SUM(ie.total_inspected_qty_nos)  ← Always returns 0!
# RIGHT: SUM(ie.inspected_qty_nos)        ← Correct field!
```

### **5. Target Quantity Calculation**

**Problem:** Should target be per shift or per lot?

**Solution:**
- Target is **per shift**, NOT per lot
- All linked lots in the same shift share ONE target
- Don't multiply target by number of linked lots

---

## 📋 Summary: Data Connection Flow

```
Work Planning (PLANNED)          Production Entry (ACTUAL)
┌─────────────────────┐         ┌──────────────────────┐
│ Date: Nov 10        │         │ moulding_date: Nov 11│
│ Lot: 25K10Z08       │ ←─────→ │ Lot: 25K10Z08       │  Connected by Lot Number!
│ Target: 80 lifts    │         │ Actual: 10 lifts     │
│ Shift: 8 hours - 3  │         │ Shift: 8 hours - 3   │
│ Item: T4012 TI      │         │ Item: T4012 TI       │
│ Machine: P18        │         │ Machine: P18         │
└─────────────────────┘         └──────────────────────┘
         │                                  │
         └──────────────┬───────────────────┘
                        │
                        ▼
              ┌─────────────────────┐
              │  MERGED DATA        │
              │  ─────────────────  │
              │  Display Date: Nov 10 (from Work Planning)    │
              │  Actual Date: Nov 11  (for linking detection) │
              │  Target: 80 lifts     (from Work Planning)    │
              │  Actual: 10 lifts     (from Production)       │
              └─────────────────────┘
```

---

## 🎯 Final Output to OEE Dashboard UI

```json
{
    "name": "MLDPE-25595",
    "production_date": "2025-11-10",           // ← Display date (from Work Planning)
    "actual_moulding_date": "2025-11-11",      // ← Used for linked lot detection
    "shift_type": "8 hours - 3",
    "operator_name": "G M SANJAY",
    "machine_name": "P18 : DESMA - INJUCTION MOULDING 250 TON",
    "item_code": "T4012 TI",
    "lot_number": "25K10Z08",
    
    // Linked Lot Info
    "is_linked_lot": true,
    "linked_lots": "25K10Z08, 25K10Z12, 25K10Z14",
    "linked_lot_count": 3,
    
    // Production Metrics (AGGREGATED from all 3 lots)
    "actual_quantity": 82,          // Total lifts
    "number_of_products": 5066,     // Total pieces
    "target_quantity": 80,          // From Work Plan
    
    // OEE Metrics
    "availability_pct": 98.89,
    "performance_pct": 102.5,
    "quality_pct": 93.83,
    "oee_pct": 95.17
}
```

---

## 🔗 File References

| Component | File Location | Key Functions |
|-----------|--------------|---------------|
| OEE Dashboard Entry Point | `oee_dashboard.py` | `get_oee_data()` |
| Data Adapter | `moulding_adapter.py` | `get_production_data()`, `get_planned_time()` |
| Linked Lot Detection | `lot_linking_helper.py` | `get_linked_lot_info()` |
| Production Aggregation | `lot_linking_helper.py` | `aggregate_production_data()` |
| Quality Aggregation | `lot_linking_helper.py` | `aggregate_quality_data()` |
| OEE Calculation | `oee_calculator.py` | `calculate_oee()` |

---

## 📝 Version History

| Date | Version | Changes |
|------|---------|---------|
| 2025-01-13 | 1.0 | Initial documentation created |
| 2025-01-13 | 1.1 | Added date mismatch fix details |
| 2025-01-13 | 1.2 | Added quality field fix documentation |

---

**End of Document**
