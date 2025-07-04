# T1601 Example Data Trace - Complete Proof

## Example Row Analysis
```
T1601 | P10 : TUNGYU - 150 Ton | MLD-1601-A | 04-06-2025 | 8 Hours - 1 | 168 | 50 | 16,800 | Regular
```

## Step-by-Step Data Proof

### Step 1: Work Planning Data ✅ **VERIFIED**
**Query Result:**
```sql
SELECT wp.name, wp.date, wp.shift_type, wpi.item, wpi.work_station, wpi.mould
FROM `tabWork Planning` wp
INNER JOIN `tabWork Plan Item` wpi ON wp.name = wpi.parent
WHERE wpi.item = 'T1601' AND wp.date = '2025-06-04' AND wp.shift_type = '8 Hours - 1';
```

**Result:**
| work_plan_name | date       | shift_type  | item  | work_station           | mould      |
|----------------|------------|-------------|-------|------------------------|------------|
| WRKP-02443-1   | 2025-06-04 | 8 Hours - 1 | T1601 | P10 : TUNGYU - 150 Ton | MLD-1601-A |

**Proof Points:**
- ✅ **Item**: T1601 (matches)
- ✅ **Date**: 2025-06-04 (matches 04-06-2025)
- ✅ **Shift Type**: 8 Hours - 1 (matches)
- ✅ **Press**: P10 : TUNGYU - 150 Ton (matches)
- ✅ **Mould**: MLD-1601-A (matches)
- ✅ **Plan Type**: Regular (from Work Planning table, not Add On Work Planning)

### Step 2: Mould Specification Data ✅ **VERIFIED**
**Query Result:**
```sql
SELECT ms.mould_ref, ms.noof_cavities, ms.spp_ref, ms.compound_code
FROM `tabMould Specification` ms
WHERE ms.mould_ref = 'MLD-1601-A' AND ms.docstatus = 1;
```

**Result:**
| mould_ref  | noof_cavities | spp_ref | compound_code |
|------------|---------------|---------|---------------|
| MLD-1601-A | 168           | T1601   | C_85H01       |

**Proof Points:**
- ✅ **Mould Reference**: MLD-1601-A (matches work plan)
- ✅ **Number of Cavities**: 168 (matches report output)
- ✅ **SPP Reference**: T1601 (confirms item-mould relationship)
- ✅ **Document Status**: 1 (submitted/approved)

### Step 3: Target Quantity Analysis ⚠️ **NEEDS INVESTIGATION**
**Issue Found:**
The `tabWork Plan Item Target` table does not contain records for item T1601, yet the report shows a target quantity of 50.

**Possible Explanations:**
1. **Manual Override**: Target might be entered directly in the work plan
2. **Default Value**: System might use a default target value
3. **Alternative Source**: Target might come from a different table or calculation
4. **Data Migration**: Recent data might not be fully migrated

### Step 4: Calculation Verification ✅ **MATHEMATICALLY CORRECT**
**Formula Applied:**
```
Expected Production Qty = Target No. Of Lifts × No. Of Cavities
Expected Production Qty = 50 × 168 = 16,800
```

**Verification:**
- ✅ **Target Qty (Lifts)**: 50 (shown in report)
- ✅ **No. of Cavities**: 168 (verified from mould specification)
- ✅ **Calculation**: 50 × 168 = 16,800 ✅ **CORRECT**

## Business Logic Flow Proof

### Data Flow Diagram
```
Work Planning (WRKP-02443-1) 
    ↓ (contains)
Work Plan Item (T1601, P10, MLD-1601-A)
    ↓ (references)
Mould Specification (MLD-1601-A → 168 cavities)
    ↓ (combined with)
Target Quantity (50 lifts) [Source: TBD]
    ↓ (calculation)
Expected Production Qty (50 × 168 = 16,800)
```

### Query Chain Verification
1. **Base Work Plan**: ✅ Found in `tabWork Planning` 
2. **Work Plan Item**: ✅ Found in `tabWork Plan Item`
3. **Mould Cavities**: ✅ Found in `tabMould Specification`
4. **Target Lifts**: ⚠️ **Source needs investigation**
5. **Final Calculation**: ✅ **Mathematically verified**

## Outstanding Questions

### Target Quantity Source
**Question**: Where does the target quantity of 50 come from for T1601?

**Investigation Needed:**
1. Check if target is stored in work plan item itself
2. Look for alternative target tables
3. Check for system default configurations
4. Verify if there's manual entry capability

**Queries to Run:**
```sql
-- Check work plan item table for target fields
DESCRIBE `tabWork Plan Item`;

-- Check for other target-related tables
SHOW TABLES LIKE '%target%';

-- Check work planning fields for target storage
DESCRIBE `tabWork Planning`;
```

## Conclusion

### Verified Components ✅
- **Work Plan Existence**: Confirmed via WRKP-02443-1
- **Item-Press-Mould Mapping**: All relationships verified
- **Cavity Count**: 168 cavities confirmed from mould specification
- **Mathematical Calculation**: 50 × 168 = 16,800 is correct
- **Plan Type Classification**: Regular (from Work Planning table)

### Investigation Required ⚠️
- **Target Quantity Source**: Need to identify where the 50 lifts target originates

### Business Logic Validation ✅
The core business logic `Expected Production Qty = Target Lifts × Cavities` is functioning correctly. The only outstanding item is determining the source of the target quantity value.

---
**Analysis Date**: July 4, 2025  
**Analyst**: Development Team  
**Status**: 90% Verified - Target source investigation pending
