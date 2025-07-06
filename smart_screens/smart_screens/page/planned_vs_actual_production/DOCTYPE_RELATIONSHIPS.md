# DocType Relationships: Work Planning, Add On Work Planning, Moulding Production Entry, and Stock Entry

This document explains the relationships between the key doctypes in the production workflow and how they connect in the data flow.

## Overview Diagram

```
┌─────────────────────┐                 ┌─────────────────────────┐
│   Work Planning     │                 │  Add On Work Planning   │
├─────────────────────┤                 ├─────────────────────────┤
│ name                │                 │ name                    │
│ date                │                 │ date                    │
│ shift_type          │                 │ shift_type              │
│ docstatus           │                 │ docstatus               │
└────────┬────────────┘                 └────────┬────────────────┘
         │                                       │
         │ 1:N                                   │ 1:N
         ▼                                       ▼
┌─────────────────────┐                 ┌─────────────────────────┐
│  Work Plan Item     │                 │ Add On Work Plan Item   │
├─────────────────────┤                 ├─────────────────────────┤
│ parent              │                 │ parent                  │
│ item                │                 │ item                    │
│ mould               │                 │ mould                   │
│ lot_number          │                 │ lot_number              │
│ job_card            │                 │ job_card                │
└──────────┬──────────┘                 └─────────┬───────────────┘
           │                                      │
           │ 1:1                                  │ 1:1
           │ via job_card                         │ via job_card
           ▼                                      ▼
                      ┌─────────────────────────────┐
                      │         Job Card            │
                      ├─────────────────────────────┤
                      │ moulding_lot_number         │
                      └────────────┬────────────────┘
                                   │
                                   │ 1:1
                                   │ referenced by job_card
                                   ▼
┌───────────────────────────────────────┐         ┌───────────────────────────┐
│     Moulding Production Entry         │         │      Stock Entry          │
├───────────────────────────────────────┤         ├───────────────────────────┤
│ name                                  │         │ name                      │
│ moulding_date                         │         │ posting_date              │
│ item_to_produce                       │         │ purpose = "Manufacture"   │
│ scan_lot_number                       │         │ docstatus                 │
│ batch_no                              │         │                           │
│ number_of_lifts                       │         │                           │
│ no_of_running_cavities                │         │                           │
│ docstatus                             │         │                           │
└─────────────────────┬─────────────────┘         └─────────────┬─────────────┘
                      │                                         │
                      │ No direct link - matched                │ 1:N
                      │ by date + item + lot number             │
                      │                                         ▼
                      │                             ┌───────────────────────────┐
                      │                             │    Stock Entry Detail     │
                      │                             ├───────────────────────────┤
                      │                             │ parent                    │
                      │                             │ item_code                 │
                      │                             │ qty                       │
                      │                             │ t_warehouse               │
                      │                             │ spp_batch_number          │
                      │                             │ batch_no                  │
                      └─────────────────────────────┴───────────────────────────┘
                                Matched by date + item + lot number
```

## Key Relationships

### 1. Work Planning & Work Plan Items
- **Relationship Type**: Parent-Child (One-to-Many)
- **Link Field**: `Work Plan Item.parent` links to `Work Planning.name`
- **Purpose**: Work Planning creates the main document while Work Plan Items store the planned items for production.
- **Important Fields**:
  - `lot_number`: Planned lot/batch number
  - `job_card`: Reference to the Job Card created for this planned item

### 2. Add On Work Planning & Add On Work Plan Items
- **Relationship Type**: Parent-Child (One-to-Many)
- **Link Field**: `Add On Work Plan Item.parent` links to `Add On Work Planning.name`
- **Purpose**: Similar to Work Planning, but used for additional/supplementary production planning.
- **Important Fields**:
  - `lot_number`: Planned lot/batch number
  - `job_card`: Reference to the Job Card created for this planned item

### 3. Work Plan Item / Add On Work Plan Item & Job Card
- **Relationship Type**: One-to-One
- **Link Field**: `Work Plan Item.job_card` and `Add On Work Plan Item.job_card` link to `Job Card.name`
- **Purpose**: Job Card is created from Work Plan Item and used for tracking production on the shop floor.
- **Note**: Our analysis shows that Work Plan Items have `job_card` fields that directly reference Job Cards.

### 4. Job Card & Moulding Production Entry
- **Relationship Type**: One-to-One
- **Link Field**: `Moulding Production Entry.job_card` links to `Job Card.name`
- **Purpose**: Moulding Production Entry records the actual production based on the Job Card.
- **Important Fields**:
  - `Moulding Production Entry.scan_lot_number`: Actual lot number during production
  - `Moulding Production Entry.item_to_produce`: Item being produced

### 4. Moulding Production Entry & Stock Entry
- **Relationship Type**: No direct database relationship - matched by business logic
- **Matching Fields**:
  - `Moulding Production Entry.moulding_date` ↔ `Stock Entry.posting_date`
  - `Moulding Production Entry.item_to_produce` ↔ `Stock Entry Detail.item_code`
  - `Moulding Production Entry.scan_lot_number` ↔ `Stock Entry Detail.spp_batch_number`
- **Purpose**: Stock Entry creates the inventory movements resulting from production.
- **Note**: Again, no direct foreign key relationship; they are linked by common date, item, and lot values.

### 5. Stock Entry & Stock Entry Detail
- **Relationship Type**: Parent-Child (One-to-Many)
- **Link Field**: `Stock Entry Detail.parent` links to `Stock Entry.name`
- **Purpose**: Stock Entry creates the main document while Stock Entry Detail stores the individual item movements.

## Data Flow in Planned vs Actual Production Report

1. **Planning Stage**:
   - Work Planning and Add On Work Planning documents create the planned production schedule
   - Include item, date, shift, and planned quantities
   - Both draft (docstatus=0) and submitted (docstatus=1) documents are considered

2. **Actual Production Stage**:
   - Moulding Production Entry records the actual shop floor production
   - Includes item, date, scan_lot_number, and actual quantities
   - Only submitted (docstatus=1) documents are considered

3. **Stock Movement Stage**:
   - Stock Entry with purpose="Manufacture" records the inventory movements
   - Stock Entry Detail contains the specific item movements
   - Only submitted (docstatus=1) documents are considered

4. **Reporting Stage**:
   - Data is aggregated by date + item + lot number
   - Only records with matching planned data are shown
   - Variances and other metrics are calculated for comparison

## Important Notes on the Relationships

1. **Complete Connection Chain**:
   - Work Planning → Work Plan Item → Job Card → Moulding Production Entry → Stock Entry
   - This provides complete traceability from planning to production to inventory

2. **Lot Number Handling**:
   - Planning documents (Work Plan Item) have `lot_number` field
   - Job Card has `moulding_lot_number`
   - Moulding Production Entry uses `scan_lot_number`
   - Stock Entry Detail uses `spp_batch_number`
   - The report matches these fields as needed

3. **Lot Number Consistency**:
   - Our data analysis shows that in most cases, `planned_lot` (Work Plan Item.lot_number) matches `actual_lot` (Moulding Production Entry.scan_lot_number)
   - This consistency enables accurate tracking and reporting

3. **Multiple-to-Multiple Relationships**:
   - One Work Planning can have multiple Moulding Production Entries
   - One Moulding Production Entry can match with multiple Stock Entries
   - This creates a complex many-to-many relationship that's resolved through aggregation

4. **Time Relationship**:
   - Work Planning happens before production
   - Moulding Production Entry happens during production
   - Stock Entry typically happens after production
   - These temporal relationships are important for understanding the workflow
