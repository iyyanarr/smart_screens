# Step-by-Step Guide: Applying OEE Lot Linking UI Patches

**Date:** November 12, 2025  
**Files to Edit:** 2 files (oee_dashboard.py and oee_dashboard.js)

---

## ✅ **QUICK START: Apply Patches in 10 Minutes**

### **Step 1: Open First File (Python)**

```bash
cd /Users/alphaworkz/frappe-bench/apps/smart_screens/smart_screens/smart_screens/page/oee_dashboard
nano oee_dashboard.py
```

**Find line ~12 (at the top, after imports):**
Look for existing imports, then add this NEW line:

```python
from smart_screens.smart_screens.api.oee.lot_linking_helper import get_linked_lot_info, aggregate_production_data, aggregate_quality_data
```

**Save:** `Ctrl + O`, then `Enter`, then `Ctrl + X`

---

### **Step 2: Still in oee_dashboard.py**

**Find line ~68 (inside get_oee_data function):**
Look for this line:
```python
for entry in production_entries:
```

**Add these 3 lines RIGHT AFTER it:**

```python
    # Check if this lot is part of a linked lot group
    linked_info = get_linked_lot_info(entry.lot_number, entry.production_date, entry.shift_type, entry.press_machine)
    is_linked = bool(linked_info)
```

**Save:** `Ctrl + O`, then `Enter`, then `Ctrl + X`

---

### **Step 3: Still in oee_dashboard.py**

**Find line ~150 (where the result dictionary is built):**
Look for lines like:
```python
results.append({
    'name': entry.name,
    'lot_number': entry.lot_number,
```

**Add these 3 NEW fields at the END (before the closing `}`):**

```python
            'is_linked_lot': is_linked,
            'linked_lots': ', '.join(linked_info.get('linked_lots', [])) if is_linked else '',
            'linked_lot_count': len(linked_info.get('linked_lots', [])) if is_linked else 0
```

**Save:** `Ctrl + O`, then `Enter`, then `Ctrl + X`

---

### **Step 4: Open Second File (JavaScript)**

```bash
nano oee_dashboard.js
```

**Press `Ctrl + W` (search), type:** `badge badge-info.*lot_number`  
**Press Enter** - This will jump to line 753

**You'll see:**
```javascript
<td><small><span class="badge badge-info">${row.lot_number || ''}</span></small></td>
```

**Replace that ENTIRE line with:**

```javascript
<td><small>
    <span class="badge badge-info">${row.lot_number || ''}</span>
    ${row.is_linked_lot ? `<br><span class="badge badge-warning" style="font-size: 9px; margin-top: 2px;" title="Linked with ${row.linked_lots}">🔗 Linked (${row.linked_lot_count})</span>` : ''}
</small></td>
```

**Save:** `Ctrl + O`, then `Enter`, then `Ctrl + X`

---

### **Step 5: Still in oee_dashboard.js**

**Press `Ctrl + W` (search), type:** `modal-lot.*textContent`  
**Press Enter** - This will jump to the showOEEDetails function

**You'll see:**
```javascript
document.getElementById('modal-lot').textContent = rowData.lot_number || '';
```

**Add these lines RIGHT AFTER it:**

```javascript
    
    // NEW: Show linked lot info if available
    const modalLotElement = document.getElementById('modal-lot').parentElement;
    if (rowData.is_linked_lot && rowData.linked_lot_count > 0) {
        // Add linked lot badge after lot number
        const linkedBadge = document.createElement('span');
        linkedBadge.className = 'badge badge-warning';
        linkedBadge.style.cssText = 'font-size: 10px; margin-left: 8px;';
        linkedBadge.title = `Linked lots: ${rowData.linked_lots}`;
        linkedBadge.textContent = `🔗 ${rowData.linked_lot_count} Lots`;
        modalLotElement.appendChild(linkedBadge);
        
        // Show linked lot breakdown
        showLinkedLotBreakdown(rowData);
    } else {
        // Hide linked lot breakdown section if present
        hideLinkedLotBreakdown();
    }
```

**Save:** `Ctrl + O`, then `Enter`, then `Ctrl + X`

---

### **Step 6: Still in oee_dashboard.js**

**Scroll to the VERY END of the file** (press `Ctrl + End`)

**Before the LAST closing brace, add these 3 NEW functions:**

```javascript
// NEW: Functions for linked lot breakdown display
function showLinkedLotBreakdown(rowData) {
    const modal = document.getElementById('oeeDetailModal');
    if (!modal) return;
    
    // Check if breakdown section already exists
    let breakdownSection = document.getElementById('linked-lot-breakdown-section');
    
    if (!breakdownSection) {
        // Create breakdown section
        breakdownSection = document.createElement('div');
        breakdownSection.id = 'linked-lot-breakdown-section';
        breakdownSection.className = 'alert alert-info';
        breakdownSection.style.marginTop = '15px';
        
        // Insert after the production summary section
        const modalBody = modal.querySelector('.modal-body');
        const summarySection = modalBody.querySelector('.production-summary');
        if (summarySection) {
            summarySection.parentElement.insertBefore(breakdownSection, summarySection.nextSibling);
        } else {
            modalBody.insertBefore(breakdownSection, modalBody.firstChild);
        }
    }
    
    // Fetch detailed breakdown from server
    frappe.call({
        method: 'smart_screens.smart_screens.api.oee.lot_linking_helper.get_lot_breakdown_details',
        args: {
            linked_lots: rowData.linked_lots.split(', ')
        },
        callback: function(r) {
            if (r.message && r.message.length > 0) {
                renderLinkedLotBreakdown(r.message, breakdownSection);
            }
        }
    });
}

function renderLinkedLotBreakdown(breakdown, container) {
    let html = `
        <h6 style="margin-bottom: 10px;">
            <i class="fa fa-link"></i> Linked Lot Breakdown
        </h6>
        <div style="overflow-x: auto;">
            <table class="table table-sm table-bordered" style="margin-bottom: 0;">
                <thead>
                    <tr style="background-color: #f8f9fa;">
                        <th style="font-size: 11px;">Lot Number</th>
                        <th style="font-size: 11px; text-align: right;">Lifts</th>
                        <th style="font-size: 11px; text-align: right;">Weight (kg)</th>
                        <th style="font-size: 11px; text-align: right;">Pieces</th>
                        <th style="font-size: 11px; text-align: right;">Inspected</th>
                        <th style="font-size: 11px; text-align: right;">Rejected</th>
                        <th style="font-size: 11px; text-align: right;">Rej %</th>
                    </tr>
                </thead>
                <tbody>
    `;
    
    let totalLifts = 0;
    let totalWeight = 0;
    let totalPieces = 0;
    let totalInspected = 0;
    let totalRejected = 0;
    
    breakdown.forEach(lot => {
        totalLifts += lot.lifts;
        totalWeight += lot.weight_kg;
        totalPieces += lot.pieces;
        totalInspected += lot.inspected;
        totalRejected += lot.rejected;
        
        html += `
            <tr>
                <td style="font-size: 11px;"><strong>${lot.lot_number}</strong></td>
                <td style="font-size: 11px; text-align: right;">${lot.lifts}</td>
                <td style="font-size: 11px; text-align: right;">${lot.weight_kg.toFixed(2)}</td>
                <td style="font-size: 11px; text-align: right;">${lot.pieces.toLocaleString()}</td>
                <td style="font-size: 11px; text-align: right;">${lot.inspected.toLocaleString()}</td>
                <td style="font-size: 11px; text-align: right;">${lot.rejected}</td>
                <td style="font-size: 11px; text-align: right;">${lot.rejection_pct.toFixed(2)}%</td>
            </tr>
        `;
    });
    
    // Add totals row
    const aggregateRejectionPct = totalInspected > 0 ? (totalRejected / totalInspected * 100) : 0;
    
    html += `
                    <tr style="background-color: #e9ecef; font-weight: bold;">
                        <td style="font-size: 11px;">TOTAL (Aggregated)</td>
                        <td style="font-size: 11px; text-align: right;">${totalLifts}</td>
                        <td style="font-size: 11px; text-align: right;">${totalWeight.toFixed(2)}</td>
                        <td style="font-size: 11px; text-align: right;">${totalPieces.toLocaleString()}</td>
                        <td style="font-size: 11px; text-align: right;">${totalInspected.toLocaleString()}</td>
                        <td style="font-size: 11px; text-align: right;">${totalRejected}</td>
                        <td style="font-size: 11px; text-align: right;">${aggregateRejectionPct.toFixed(2)}%</td>
                    </tr>
                </tbody>
            </table>
        </div>
        <p style="margin-top: 10px; margin-bottom: 0; font-size: 11px; color: #6c757d;">
            <i class="fa fa-info-circle"></i> OEE calculations use aggregated values from all linked lots.
        </p>
    `;
    
    container.innerHTML = html;
}

function hideLinkedLotBreakdown() {
    const breakdownSection = document.getElementById('linked-lot-breakdown-section');
    if (breakdownSection) {
        breakdownSection.style.display = 'none';
    }
}
```

**Save:** `Ctrl + O`, then `Enter`, then `Ctrl + X`

---

### **Step 7: Restart Services**

```bash
cd /Users/alphaworkz/frappe-bench
bench restart
```

Wait for services to restart (~30 seconds)

---

### **Step 8: Clear Browser Cache**

- **Mac:** Press `Cmd + Shift + R`
- **Windows:** Press `Ctrl + Shift + R`

---

## ✅ **DONE! Test It Now**

1. **Navigate to OEE Dashboard**
2. **Select Date:** 2025-10-22
3. **Generate Report**
4. **Look for:** `🔗 Linked (3)` badge next to lot 25J22Z06
5. **Click OEE %** to see detailed breakdown modal

---

## 🎯 **Expected Results**

### **In the table:**
```
Lot: 25J22Z06
     🔗 Linked (3)
```

### **In the modal (when clicking OEE %):**
```
Lot: 25J22Z06 🔗 3 Lots

╔═══════════════════════════════════════════╗
║  🔗 Linked Lot Breakdown                  ║
╠═══════════════════════════════════════════╣
║ 25J22Z06 | 21 lifts | 3.06% rejection    ║
║ 25J22Z09 | 43 lifts | 3.06% rejection    ║
║ 25J22Z10 | 16 lifts | 3.33% rejection    ║
║─────────────────────────────────────────  ║
║ TOTAL    | 80 lifts | 0.71% (aggregate) ║
╚═══════════════════════════════════════════╝
```

---

## 🆘 **Troubleshooting**

**Badge doesn't show?**
- Clear cache: `bench clear-cache` then hard refresh browser

**JavaScript error?**
- Check browser console (F12)
- Verify all quotes and brackets are closed properly

**"Method not found" error?**
- Verify backend patch was applied (Step 1)
- Run: `bench restart`

**Need help?**
- Check: `/apps/smart_screens/LOT_LINKING_INTEGRATION_PATCH.md`
- Check: `/apps/smart_screens/LOT_LINKING_UI_PATCH.md`

