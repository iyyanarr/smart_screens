# OEE Dashboard - Change Tracking & Context Documentation

**Last Updated:** October 30, 2025  
**Location:** `/smart_screens/smart_screens/page/oee_dashboard/`  
**Purpose:** Track all modifications, maintain context, and document requirements for the OEE Dashboard

---

## 📋 Table of Contents
1. [Current System Overview](#current-system-overview)
2. [File Structure](#file-structure)
3. [Key Features & Functionality](#key-features--functionality)
4. [Data Flow Architecture](#data-flow-architecture)
5. [Recent Changes](#recent-changes)
6. [Pending Requirements](#pending-requirements)
7. [Technical Notes](#technical-notes)

---

## 🎯 Current System Overview

The OEE (Overall Equipment Effectiveness) Dashboard is a comprehensive report generation and management system designed to:
- Calculate and display OEE metrics from production data
- Generate daily OEE reports for review and submission
- Create Corrective Action Reports (CAR) for low OEE records
- Track lot inspection status and validate records
- Provide drill-down analysis with detailed breakdowns

### System Status: ✅ STABLE (Last commit restored)

---

## 📁 File Structure

```
oee_dashboard/
├── oee_dashboard.py          # Backend API endpoints
├── oee_dashboard.js           # Frontend logic & UI interactions
├── oee_dashboard.html         # Page template & structure
├── oee_dashboard.json         # Page configuration
└── OEE_DASHBOARD_CHANGES.md   # This file (tracking document)
```

### Related Files
- **Adapter:** `/api/oee/adapters/moulding_adapter.py` - Process-specific data extraction
- **Calculator:** `/api/oee/oee_calculator.py` - OEE calculation engine
- **DocType:** `/doctype/daily_oee_report/` - Report document type
- **CAR DocType:** `/doctype/corrective_action_resolved/` - CAR document type

---

## 🔑 Key Features & Functionality

### 1. **Report Generation**
- Filter by: Date, Process, Shift, Machine
- Real-time OEE calculation for production entries
- Summary metrics: Availability, Performance, Quality, OEE
- Sortable table with 12 columns

### 2. **Report Management**
- **Generate Report:** Load fresh production data
- **Save Report:** Save as draft for later CAR generation
- **Submit Report:** Finalize and submit with remarks
- **Resume Report:** Continue working on existing draft

### 3. **CAR (Corrective Action Report) Integration**
- Generate CAR button for low OEE records (<90%)
- Update CAR button for existing CAR documents
- Remarks button for acceptable OEE records (≥90%)
- Lot Inspection validation before CAR generation

### 4. **Resolution Panel**
- Slide-out panel for CAR creation/editing
- Fields:
  - Reason Code (dropdown with predefined codes)
  - Problem Description
  - Corrective Action Code
  - Corrective Action Details
  - Remarks
- Save Draft / Save & Next workflow

### 5. **OEE Details Modal**
- Click on OEE percentage to view breakdown
- Shows:
  - Production summary (Date, Shift, Lot, Item, Operator)
  - Availability calculation details
  - Performance calculation details
  - Quality calculation details
  - Formulas and metrics

### 6. **Lot Inspection Validation**
- Checks if Lot Inspection Entry exists for each lot
- Status badges:
  - ✓ Submitted (green)
  - ⚠ Draft (yellow)
  - ✗ Pending (red)
- Prevents CAR generation if inspection is pending

---

## 🔄 Data Flow Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     USER INTERACTION                         │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                  OEE Dashboard (Frontend)                    │
│  - Filter Selection (Date, Process, Shift, Machine)         │
│  - Generate Report Button                                    │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│               Backend API (oee_dashboard.py)                 │
│  Methods:                                                    │
│  • get_oee_data() - Fetch & calculate OEE                   │
│  • get_oee_summary() - Calculate summary stats              │
│  • check_lot_inspection_status() - Validate inspection      │
│  • save_oee_report() - Save as draft                        │
│  • submit_oee_report() - Submit report                      │
│  • create_car_from_oee_dashboard() - Create CAR             │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│              Process Adapter (MouldingAdapter)               │
│  • get_production_data() - Fetch production entries          │
│  • get_quality_data() - Fetch inspection data               │
│  • calculate_cycle_time() - Calculate cycle time            │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                  OEE Calculator                              │
│  • calculate_availability()                                  │
│  • calculate_performance()                                   │
│  • calculate_quality()                                       │
│  • calculate_oee()                                          │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                Database (Production Entries)                 │
│  • Moulding Production Entry                                │
│  • Inspection Entry (Lot Inspection)                        │
│  • Daily OEE Report                                         │
│  • Corrective Action Resolved (CAR)                         │
└─────────────────────────────────────────────────────────────┘
```

---

## 📝 Recent Changes

### **Change Log**

#### ✅ October 30, 2025 - Codebase Restored
- **Action:** Restored all files to last commit
- **Files Affected:** 
  - `moulding_adapter.py`
  - `daily_oee_report.py`
  - `unresolved_production_record.json`
  - `oee_dashboard.html`
  - `oee_dashboard.js`
  - `oee_dashboard.py`
- **Status:** Clean slate - ready for new modifications

#### ✅ Previous Major Features (From Last Commit)
1. **Lot Inspection Validation**
   - Added `check_lot_inspection_status()` function
   - Displays inspection status badges in Action column
   - Prevents CAR generation if inspection is missing

2. **CAR Integration**
   - Direct CAR creation from dashboard
   - Links CAR to Daily OEE Report
   - Updates resolution status in real-time

3. **Report Resume Feature**
   - Check for existing reports on date change
   - Resume draft reports with all data
   - Notification banner for existing reports

4. **Resolution Panel Enhancement**
   - Live CAR data fetching (single source of truth)
   - Simplified corrective action fields
   - Better form validation

---

## 🎯 Pending Requirements

### **NEW REQUIREMENTS TO BE IMPLEMENTED**

> **Note:** Ready to receive and implement new requirements.  
> Please list your requirements below, and they will be tracked and implemented in order.

#### Requirement #1: Replace Mold with Machine Name from Add-on Work Planning
- **Description:** In the OEE Report Generator table view, the "Machine" column currently shows mould data from `Moulding Production Entry.machine_no`. This needs to be replaced with the actual machine name from the linked `Job Card` document's `workstation` field.
- **Priority:** High
- **Status:** 🔄 In Progress
- **Implementation Notes:**
  
  **Data Structure Analysis:**
  - **Moulding Production Entry** has fields:
    - `machine_no` (currently shows mould, not machine)
    - `job_card` (Link to Job Card) ← **KEY LINKING FIELD**
  - **Job Card** DocType has:
    - `workstation` (Link to Workstation) ← **THIS IS THE ACTUAL MACHINE!**
    - Example: "P22 : TUNGYU - 200 Ton"
  
  **Confirmed Relationship:**
  ```
  Moulding Production Entry → Job Card → Workstation (Machine)
  ```
  
  **Example Data:**
  - Moulding Production Entry: MLDPE-21650
    - job_card: "PO-JOB230601"
    - mould_reference: "TC-2437-A" (mould, currently shown incorrectly)
  - Job Card: PO-JOB230601
    - workstation: "P22 : TUNGYU - 200 Ton" (actual machine - what we need!)
  
  **Implementation Strategy:**
  
  1. **Backend (moulding_adapter.py):**
     ```python
     # Add new method to fetch machine from Job Card
     def get_machine_from_job_card(self, production_entry):
         """
         Fetch workstation (machine) from linked Job Card
         
         Args:
             production_entry: Moulding Production Entry dict
         
         Returns:
             str: Workstation name or 'N/A' if not found
         """
         job_card = production_entry.get('job_card')
         if not job_card:
             return 'N/A'
         
         try:
             job_card_doc = frappe.get_value(
                 'Job Card',
                 job_card,
                 'workstation'
             )
             return job_card_doc or 'N/A'
         except Exception as e:
             frappe.log_error(f"Error fetching workstation: {str(e)}")
             return 'N/A'
     ```
  
  2. **Modify get_production_data() in moulding_adapter.py:**
     - Join Job Card table to fetch workstation
     - SQL Query:
     ```sql
     SELECT 
         mpe.*,
         jc.workstation as machine_name
     FROM `tabMoulding Production Entry` AS mpe
     LEFT JOIN `tabJob Card` AS jc ON mpe.job_card = jc.name
     WHERE mpe.moulding_date = %(date)s
     AND mpe.docstatus = 1
     ```
  
  3. **Update oee_dashboard.py:**
     - Modify result object to use `machine_name` from adapter
     - Change field mapping:
       ```python
       result = {
           # ...existing fields...
           'machine_reference': machine_name,  # From Job Card workstation
           'mould_reference': entry.get('mould_reference'),  # Keep mould separate
           # ...existing fields...
       }
       ```
  
  4. **Optional Enhancement:**
     - Add mould_reference as a separate field if needed
     - Show both Machine and Mould in different columns
  
  5. **Fallback Handling:**
     - If Job Card not linked → show "N/A"
     - If Job Card has no workstation → show "N/A"
     - Log warning for missing data
  
  **Testing Checklist:**
  - [ ] Verify machine name appears correctly in OEE table
  - [ ] Test with production entries that have Job Cards
  - [ ] Test with production entries without Job Cards (fallback)
  - [ ] Verify sorting by machine column works
  - [ ] Check Daily OEE Report generation includes correct machine
  - [ ] Verify CAR creation uses correct machine reference
  - [ ] Test with multiple machines/workstations

#### Requirement #2: [TO BE ADDED]
- **Description:** [Pending]
- **Priority:** [High/Medium/Low]
- **Status:** ⏳ Pending
- **Implementation Notes:** [TBD]

---

## 🔧 Technical Notes

### **Backend API Endpoints**

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `get_oee_data()` | GET | Fetch production data with OEE calculations |
| `get_oee_summary()` | GET | Calculate summary statistics |
| `get_available_processes()` | GET | Get list of available processes |
| `get_shift_options()` | GET | Get available shifts |
| `get_reason_codes()` | GET | Get CAR reason code list |
| `save_oee_report()` | POST | Save report as draft |
| `submit_oee_report()` | POST | Submit report (final) |
| `create_car_from_oee_dashboard()` | POST | Create CAR document |
| `check_lot_inspection_status()` | GET | Validate lot inspection |

### **Frontend Global Variables**

```javascript
let currentData = [];           // Raw OEE data from backend
let sortedData = [];            // Sorted/filtered data for display
let currentSort = {...};        // Current sort state
let reportGenerated = false;    // Report generation flag
let reportData = null;          // Stored report snapshot
let savedReportName = null;     // Name of saved Daily OEE Report
let existingReportInfo = null;  // Existing report metadata
```

### **Key Classes**

1. **ResolutionPanel** (Frontend)
   - Manages CAR creation slide-out panel
   - Handles form validation and submission
   - Implements Save Draft / Save & Next workflow

2. **MouldingAdapter** (Backend)
   - Process-specific data extraction
   - Implements adapter pattern for extensibility
   - Future processes: Blanking, Batching, etc.

3. **OEECalculator** (Backend)
   - Core OEE calculation logic
   - Industry-standard formulas
   - Reusable across processes

### **Database Schema Notes**

#### Daily OEE Report (Parent)
- `production_date` (Date)
- `shift_filter` (Data)
- `machine_filter` (Data)
- `production_records` (Table) - Child table

#### Daily OEE Report Record (Child)
- `production_entry` (Link to Moulding Production Entry)
- `oee_pct` (Float)
- `resolution_status` (Select: Pending, In Progress, Resolved)
- `resolved_record` (Link to Corrective Action Resolved)

#### Corrective Action Resolved (CAR)
- `production_entry` (Link)
- `parent_daily_oee_report` (Link)
- `reason_code` (Select)
- `problem_description` (Text)
- `corrective_action_code` (Data)
- `corrective_action_details` (Text)
- `remarks` (Text)
- `resolution_status` (Select)

### **Important Code Sections**

#### CAR Generation Logic (JavaScript)
Location: `oee_dashboard.js` → `ResolutionPanel.save()`
```javascript
// Validates savedReportName before CAR creation
// Fetches live CAR data if updating existing CAR
// Updates both currentData and reportData arrays
```

#### Lot Inspection Check (Python)
Location: `oee_dashboard.py` → `check_lot_inspection_status()`
```python
# Queries Inspection Entry for lot_no
# Returns status: Submitted, Draft, Not Found
# Handles errors gracefully (returns Not Found on error)
```

---

## 🐛 Known Issues & Limitations

### Current Limitations:
1. **Single Process Support:** Only Moulding process is active (Blanking/Batching pending)
2. **Manual Refresh:** User must click Refresh to see updated CAR statuses
3. **No Bulk CAR:** Cannot generate CARs for multiple records at once

### Workarounds:
1. Use process adapters pattern for future expansion
2. Refresh button reloads latest data from backend
3. Use "Save & Next" to process multiple records sequentially

---

## 📊 Performance Considerations

- **Data Loading:** ~2-3 seconds for 100+ production records
- **OEE Calculation:** Real-time, no caching
- **Report Saving:** Immediate with transaction commit
- **CAR Creation:** Synchronous, blocks UI during save

### Optimization Opportunities:
- [ ] Add loading skeleton for table
- [ ] Cache OEE calculations for static reports
- [ ] Async CAR creation with progress indicator

---

## 🎨 UI/UX Notes

### Color Scheme:
- **Header:** Dark blue-grey (#2c3e50)
- **OEE Excellent (≥90%):** Green (#28a745)
- **OEE Poor (<90%):** Red (#dc3545)
- **Generate CAR Button:** Red (danger) → Blue (primary) on hover
- **Update CAR Button:** Orange (warning)
- **Remarks Button:** Green (success)

### Responsive Breakpoints:
- Desktop: Full table view with all columns
- Tablet (≤768px): Stacked filters, scrollable table
- Mobile (≤576px): Resolution panel full-width

---

## 🔐 Security & Permissions

### Required Permissions:
- **Read:** Moulding Production Entry, Inspection Entry
- **Write:** Daily OEE Report, Corrective Action Resolved
- **Submit:** Daily OEE Report (for final submission)

### Access Control:
- Dashboard accessible to: Production Manager, Quality Manager
- CAR creation: Requires write permission on Corrective Action Resolved
- Report submission: Requires submit permission on Daily OEE Report

---

## 📚 Related Documentation

- [OEE Calculation Formulas](../api/oee/README.md)
- [Daily OEE Report DocType](../doctype/daily_oee_report/README.md)
- [CAR Integration Guide](../../../OEE_Dashboard_CAR_Integration_Instructions.md)
- [Field Mapping Documentation](../../../FIELD_MAPPING_DOCUMENTATION.md)

---

## 🚀 Quick Reference

### Generate Report Workflow:
1. Select filters (Date, Process, Shift, Machine)
2. Click "Generate Report"
3. Review OEE data in table
4. Click "Save Report" to enable CAR generation
5. Generate CARs for low OEE records (<90%)
6. Click "Submit Report" to finalize

### Resume Existing Report:
1. Select same date/filters as existing report
2. Notification banner appears
3. Click "Resume Report"
4. Continue CAR generation where left off

### Generate CAR:
1. Click "Generate CAR" button (red) for low OEE record
2. Resolution panel slides in from right
3. Fill in required fields (Reason Code, Corrective Action)
4. Click "Save & Next" to proceed to next record
5. Or "Save Draft" to save and close panel

---

## 📞 Support & Maintenance

**Developer:** Alpha Workz Team  
**Last Review:** October 30, 2025  
**Next Review:** [TBD based on new requirements]

---

**END OF DOCUMENTATION**

*This document will be updated as new requirements are implemented.*
