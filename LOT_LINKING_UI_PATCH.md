# OEE Lot Linking UI Integration - Manual Patch

## File: oee_dashboard.js
**Path:** `/apps/smart_screens/smart_screens/smart_screens/page/oee_dashboard/oee_dashboard.js`

---

## Change 1: Update updateTable() Function to Show Linked Lot Badges

**Find this section (around line 450-500 in updateTable function):**

```javascript
function updateTable(data) {
    const tableBody = document.getElementById('oee-table-body');
    tableBody.innerHTML = '';

    if (!data || data.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="13" class="text-center">No OEE data found for the selected criteria</td></tr>';
        return;
    }
    
    data.forEach((row, index) => {
        const tr = document.createElement('tr');
        let oeeClass = row.oee_pct >= 90 ? 'oee-excellent' : 'oee-poor';
        const statusMeta = getStatusMeta(row);
        
        // ... existing code for lot inspection checks ...
        
        tr.innerHTML = `
            <td>${row.production_date_formatted || ''}</td>
            <td>${row.shift_type || ''}</td>
            <td><small>${row.operator_name || '-'}</small></td>
            <td><small><strong>${row.machine_reference || ''}</strong></small></td>
            <td><small><strong>${row.machine_name || 'N/A'}</strong></small></td>
            <td><small><strong>${row.item_code || ''}</strong></small></td>
            <td><small><span class="badge badge-info">${row.lot_number || ''}</span></small></td>
```

**Replace the lot_number column (line with badge badge-info) with:**

```javascript
            <td><small>
                <span class="badge badge-info">${row.lot_number || ''}</span>
                ${row.is_linked_lot ? `<br><span class="badge badge-warning" style="font-size: 9px; margin-top: 2px;" title="Linked with ${row.linked_lots}">🔗 Linked (${row.linked_lot_count})</span>` : ''}
            </small></td>
```

---

## Change 2: Update showOEEDetails() Modal to Show Linked Lot Breakdown

**Find the showOEEDetails function (around line 600-700):**

```javascript
function showOEEDetails(event, rowIndex) {
    event.preventDefault();
    
    // Get the row data
    const row = document.querySelectorAll('[data-row-index]')[rowIndex];
    const rowData = JSON.parse(row.dataset.rowData);
    
    console.log('🔍 DEBUG - showOEEDetails rowData:', rowData);
    
    // Populate production summary header
    document.getElementById('modal-date').textContent = rowData.production_date_formatted || '';
    document.getElementById('modal-shift').textContent = rowData.shift_type || '';
    document.getElementById('modal-machine').textContent = rowData.machine_name || 'N/A';
    document.getElementById('modal-mold').textContent = rowData.machine_reference || '-';
    document.getElementById('modal-lot').textContent = rowData.lot_number || '';
```

**After the line that sets modal-lot, add:**

```javascript
    document.getElementById('modal-lot').textContent = rowData.lot_number || '';
    
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

---

## Change 3: Add Helper Functions for Linked Lot Display

**Add these functions at the end of the JavaScript file (before the closing brace):**

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

---

## How to Apply This Patch

1. **Open the JavaScript file:**
   ```bash
   nano /Users/alphaworkz/frappe-bench/apps/smart_screens/smart_screens/smart_screens/page/oee_dashboard/oee_dashboard.js
   ```

2. **Make the 3 changes above:**
   - Change 1: Update lot number column to show linked badge
   - Change 2: Update OEE details modal to show linked lot info
   - Change 3: Add helper functions at the end of the file

3. **Clear browser cache:**
   - Hard refresh: `Cmd + Shift + R` (Mac) or `Ctrl + Shift + R` (Windows)
   - Or clear cache: `bench clear-cache`

4. **Test the changes:**
   - Create a lot linking document
   - Generate OEE report
   - Verify linked lot badge appears
   - Click OEE % to see detailed breakdown

---

## Expected UI Changes

### **1. OEE Table Row (Linked Lot)**
```
┌────────────┬───────┬──────────┬──────────────────┐
│ Date       │ Shift │ Lot      │ OEE              │
├────────────┼───────┼──────────┼──────────────────┤
│ 2025-10-22 │ 3     │ 25J22Z06 │ 94.3%            │
│            │       │ 🔗 Linked│                  │
│            │       │ (3)      │                  │
└────────────┴───────┴──────────┴──────────────────┘
```

### **2. OEE Details Modal (Linked Lot)**
```
═══════════════════════════════════════════════════════════
📊 OEE BREAKDOWN

Lot: 25J22Z06 🔗 3 Lots

╔═══════════════════════════════════════════════════════╗
║  🔗 Linked Lot Breakdown                              ║
╠═══════════════════════════════════════════════════════╣
║ Lot Number  │ Lifts │ Weight │ Pieces │ Inspected │ Rej% ║
║─────────────┼───────┼────────┼────────┼───────────┼──────║
║ 25J22Z06    │ 21    │ 8.64   │ 1,260  │ 1,260     │ 3.06%║
║ 25J22Z09    │ 43    │ 17.43  │ 2,580  │ 2,580     │ 3.06%║
║ 25J22Z10    │ 16    │ 6.77   │ 960    │ 960       │ 3.33%║
║─────────────┼───────┼────────┼────────┼───────────┼──────║
║ TOTAL       │ 80    │ 32.84  │ 4,800  │ 4,800     │ 0.71%║
╚═══════════════════════════════════════════════════════╝

ℹ️ OEE calculations use aggregated values from all linked lots.
```

---

## Verification Checklist

After applying the patch:

- [ ] Linked lot badge shows in table: `🔗 Linked (3)`
- [ ] Badge tooltip shows all linked lot numbers on hover
- [ ] OEE Details Modal shows "Linked Lot Breakdown" section
- [ ] Breakdown table displays all linked lots with individual metrics
- [ ] Totals row shows aggregated values
- [ ] Aggregate rejection % matches the OEE quality calculation
- [ ] Non-linked lots don't show the badge
- [ ] Console shows no JavaScript errors

---

## Troubleshooting

**Issue:** Badge doesn't appear
- **Solution:** Clear browser cache and hard refresh
- **Check:** Verify `is_linked_lot` field exists in row data (console.log)

**Issue:** Breakdown table is empty
- **Solution:** Verify `get_lot_breakdown_details` method exists in helper
- **Check:** Look at network tab for API response

**Issue:** JavaScript errors
- **Solution:** Check browser console for syntax errors
- **Fix:** Verify all quotes and brackets are properly closed

