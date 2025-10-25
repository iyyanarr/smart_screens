# Corrective Action Report (CAR) System - Implementation Plan

**Project Start Date:** October 25, 2025  
**Status:** 🚧 In Progress  
**Last Updated:** October 25, 2025

---

## 📋 Project Overview

### Objective
Build a comprehensive Corrective Action Report system that:
- Collects low OEE production records from OEE Dashboard
- Provides a Resolution Center for root cause analysis
- Tracks resolution progress for each production record
- Maintains separate unresolved and resolved records

---

## 🏗️ Architecture Design

### System Flow
```
OEE Dashboard 
    ↓ (Generate CAR)
Corrective Action Unresolved (Parent DocType)
    ├── Unresolved Production Records (Child Table)
    ↓ (Resolution Center)
User fills root cause analysis
    ↓ (Mark as Resolved)
Corrective Action Resolved (Separate DocType)
    ├── CAR Why Analysis (Child Table - 5 rows)
    └── CAR Corrective Action (Child Table)
```

---

## 📦 DocTypes to Create

### 1. **Corrective Action Unresolved** (Parent DocType)
**Purpose:** Collects all low OEE production records from OEE Dashboard

**Fields:**
- `naming_series` - CAR-UNRESOLVED-.YYYY.-
- `report_date` - Auto (Today)
- `from_date` - From OEE Dashboard filter
- `to_date` - From OEE Dashboard filter
- `shift_filter` - From OEE Dashboard filter
- `machine_filter` - From OEE Dashboard filter
- `item_filter` - From OEE Dashboard filter
- `operator_filter` - From OEE Dashboard filter
- `unresolved_production_records` - Child Table (↓)
- `total_records` - Auto-calculated
- `resolved_records` - Auto-calculated
- `pending_records` - Auto-calculated
- `resolution_progress_pct` - Auto-calculated
- `status` - Unresolved / In Progress / Completed / Submitted

**Status:** ⏳ Pending

---

### 2. **Unresolved Production Record** (Child Table)
**Purpose:** Lists each low OEE production entry in the CAR

**Fields:**
- `production_entry` - Link to Moulding Production Entry
- `production_date` - Date
- `shift_type` - Data
- `operator_name` - Data
- `machine_reference` - Data
- `item_code` - Link to Item
- `lot_number` - Data
- `target_quantity` - Float
- `actual_quantity` - Float
- `variance_qty` - Float
- `oee_pct` - Float (%)
- `production_efficiency_pct` - Float (%)
- `rejection_percentage` - Float (%)
- `availability_pct` - Float (%)
- `performance_pct` - Float (%)
- `quality_pct` - Float (%)
- `resolution_status` - Pending / In Progress / Resolved
- `resolved_record` - Link to Corrective Action Resolved

**Status:** ⏳ Pending

---

### 3. **Corrective Action Resolved** (Parent DocType)
**Purpose:** Stores root cause analysis and resolution for ONE production entry

**Fields:**
- `naming_series` - CAR-RESOLVED-.YYYY.-
- `parent_car_unresolved` - Link to Corrective Action Unresolved
- `production_entry` - Link to Moulding Production Entry
- `production_date` - Date (read-only)
- `shift_type` - Data (read-only)
- `operator_name` - Data (read-only)
- `machine_reference` - Data (read-only)
- `item_code` - Link to Item (read-only)
- `lot_number` - Data (read-only)
- `target_quantity` - Float (read-only)
- `actual_quantity` - Float (read-only)
- `oee_pct` - Float (read-only)
- `production_efficiency_pct` - Float (read-only)
- `rejection_percentage` - Float (read-only)
- `reason_code` - Select (MACHINE BREAKDOWN, COMPOUND SHORTAGE, etc.)
- `problem_description` - Text Editor
- `why_analysis` - Child Table (↓)
- `root_cause` - Text Editor
- `corrective_actions` - Child Table (↓)
- `scan_operator` - Link to User
- `target_date` - Date
- `remarks` - Text Editor
- `status` - Resolved / Verified / Closed
- `resolved_date` - Date (auto)
- `resolved_by` - Link to User (auto)

**Status:** ⏳ Pending

---

### 4. **CAR Why Analysis** (Child Table)
**Purpose:** 5-Why analysis (5 mandatory rows)

**Fields:**
- `s_no` - Int (1, 2, 3, 4, 5)
- `why_question` - Small Text

**Status:** ⏳ Pending

---

### 5. **CAR Corrective Action** (Child Table)
**Purpose:** Action plan items

**Fields:**
- `s_no` - Int
- `corrective_action` - Text
- `scan_operator` - Link to User
- `target_date` - Date
- `status` - Pending / In Progress / Completed
- `completion_date` - Date
- `remarks` - Small Text

**Status:** ⏳ Pending

---

## 🗑️ Old DocTypes to Remove/Archive

### Files to Delete:
- ❌ Old `Corrective Action Report` structure (single record approach)
- ❌ Old `Corrective Action Item` (will be replaced by CAR Corrective Action)

**Status:** ⏳ Pending

---

## 🎨 Custom Page: Resolution Center

### Purpose
Provide a beautiful UI for users to go through each unresolved production record and fill root cause analysis.

### Features
- **Left Panel:** List of unresolved records with status indicators
- **Right Panel:** Resolution form (matches stakeholder's image design)
- **Navigation:** Previous/Next buttons
- **Progress:** Visual progress bar (X/Y resolved)
- **Auto-save:** On "Save & Next"
- **Create Resolved:** On "Mark as Resolved"

### Layout
```
┌──────────────────────┬──────────────────────────────┐
│  UNRESOLVED RECORDS  │  RESOLUTION FORM             │
├──────────────────────┼──────────────────────────────┤
│ [1/10] ⚠️ MPE-001   │  Production Entry: MPE-001   │
│   75% OEE           │  Date | Shift | Machine      │
│                      │                              │
│ [2/10] 🔄 MPE-002 ◄ │  Reason Code: [Dropdown]     │
│   82% OEE           │  Problem Description: [Text] │
│   (In Progress)     │  Why Analysis: [5 rows]      │
│                      │  Root Cause: [Text]          │
│ [3/10] ⚠️ MPE-003   │  Corrective Actions: [Table] │
│   65% OEE           │                              │
│                      │  [Mark as Resolved]          │
│ [Previous] [Next]   │  [Save & Next →]             │
└──────────────────────┴──────────────────────────────┘
```

**Status:** ⏳ Pending

---

## 🔄 OEE Dashboard Integration

### Changes Required
1. Update "Generate CAR" button to create `Corrective Action Unresolved`
2. Pass all low OEE records to the new DocType
3. Redirect to Resolution Center page after creation
4. Add CAR status column in OEE Dashboard table

**Status:** ⏳ Pending

---

## 📝 Implementation Checklist

### Phase 1: Clean Up Old Implementation
- [ ] Backup current Corrective Action Report files
- [ ] Delete old Corrective Action Report DocType
- [ ] Archive old implementation files

### Phase 2: Create New DocTypes
- [ ] Create `Corrective Action Unresolved` DocType
- [ ] Create `Unresolved Production Record` Child Table
- [ ] Create `Corrective Action Resolved` DocType
- [ ] Create `CAR Why Analysis` Child Table
- [ ] Create `CAR Corrective Action` Child Table

### Phase 3: Python Controllers
- [ ] Write `Corrective Action Unresolved` controller
  - [ ] Auto-calculate summary fields
  - [ ] Validation logic
- [ ] Write `Corrective Action Resolved` controller
  - [ ] Link back to parent CAR
  - [ ] Update unresolved record status
  - [ ] Validation logic

### Phase 4: Build Resolution Center
- [ ] Create custom page HTML
- [ ] Create custom page JavaScript
- [ ] Create custom page CSS
- [ ] Implement navigation logic
- [ ] Implement save & create logic

### Phase 5: OEE Dashboard Integration
- [ ] Update JavaScript generation function
- [ ] Create API method to generate CAR
- [ ] Add redirect to Resolution Center
- [ ] Update table to show CAR status

### Phase 6: Testing
- [ ] Test CAR creation from OEE Dashboard
- [ ] Test Resolution Center navigation
- [ ] Test resolution record creation
- [ ] Test status updates
- [ ] Test submission workflow

### Phase 7: Documentation
- [ ] User guide for generating CARs
- [ ] User guide for Resolution Center
- [ ] API documentation

---

## 📊 Progress Tracking

| Task | Status | Completed Date |
|------|--------|----------------|
| Project Plan Created | ✅ Done | 2025-10-25 |
| Old Implementation Cleanup | ⏳ Pending | - |
| Corrective Action Unresolved | ⏳ Pending | - |
| Unresolved Production Record | ⏳ Pending | - |
| Corrective Action Resolved | ⏳ Pending | - |
| CAR Why Analysis | ⏳ Pending | - |
| CAR Corrective Action | ⏳ Pending | - |
| Python Controllers | ⏳ Pending | - |
| Resolution Center Page | ⏳ Pending | - |
| OEE Dashboard Integration | ⏳ Pending | - |
| Testing | ⏳ Pending | - |
| Documentation | ⏳ Pending | - |

---

## 🐛 Issues & Notes

### Known Issues
- None yet

### Design Decisions
1. **Separate DocTypes for Unresolved/Resolved:** Decided to use separate DocTypes instead of single DocType to maintain clean separation between collection and resolution.
2. **Child Tables for Why Analysis & Actions:** Using child tables instead of JSON fields for better querying and reporting.
3. **Custom Page for Resolution:** Custom page provides better UX than standard form for sequential record processing.

---

## 📚 References

- OEE Dashboard: `apps/smart_screens/smart_screens/smart_screens/page/oee_dashboard/`
- Moulding Production Entry: `apps/alphaspp/alphaspp/doctype/moulding_production_entry/`
- Stakeholder Image Design: See project files

---

## 🎯 Next Steps

1. ✅ Create this implementation plan
2. ⏳ Remove old CAR implementation
3. ⏳ Create Corrective Action Unresolved DocType
4. ⏳ Create Unresolved Production Record Child Table
5. ⏳ Create Corrective Action Resolved DocType
6. ⏳ Create CAR Why Analysis Child Table
7. ⏳ Create CAR Corrective Action Child Table

---

**Last Updated:** October 25, 2025  
**Updated By:** System
