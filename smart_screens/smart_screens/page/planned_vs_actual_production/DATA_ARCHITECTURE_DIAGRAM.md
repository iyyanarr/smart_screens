# Updated Data Architecture Diagram: Planned vs Actual Production Report

## Data Flow Diagram

```
┌─────────────────────┐     ┌─────────────────────────┐
│   Work Planning     │     │  Add On Work Planning   │
│  (Draft & Submitted)│     │   (Draft & Submitted)   │
└──────────┬──────────┘     └───────────┬─────────────┘
           │                            │
           │                            │
           ▼                            ▼
    ┌─────────────────────────────────────┐
    │         PLANNED DATA                │
    │  ┌───────────────────────────────┐  │
    │  │ • production_date             │  │
    │  │ • item_code                   │  │
    │  │ • planned_qty_pieces          │  │
    │  │ • planning_sources            │  │
    │  └───────────────────────────────┘  │
    └──────────────────┬─────────────────┘
                       │
                       │ Only creates records
                       │ with planning data
                       ▼
┌────────────────────────────────────────────────────┐
│               COMBINED DATA                        │
│  ┌────────────────────────────────────────────┐    │
│  │ Key: production_date | item_code | lot_number │  │
│  └────────────────────────────────────────────┘    │
└────────────────────┬───────────────────────────────┘
                     │
         ┌───────────┴───────────┐
         │                       │
         ▼                       ▼
┌─────────────────────┐  ┌─────────────────────────┐
│ Moulding Production │  │      Stock Entry        │
│   (scan_lot_number) │  │   (Only references)     │
└─────────┬───────────┘  └────────────┬────────────┘
          │                           │
          │ Only updates              │ Only updates
          │ planned records           │ planned records
          ▼                           ▼
┌────────────────────────────────────────────────────┐
│               PROCESSED DATA                       │
│  ┌────────────────────────────────────────────┐    │
│  │ • planned_qty_pieces                       │    │
│  │ • actual_qty_pieces                        │    │
│  │ • variance_pieces                          │    │
│  │ • status (Target/Under/Over)               │    │
│  │ • entry_references                         │    │
│  └────────────────────────────────────────────┘    │
└────────────────────┬───────────────────────────────┘
                     │
                     ▼
┌────────────────────────────────────────────────────┐
│               UI DISPLAY                           │
│  ┌────────────────────────────────────────────┐    │
│  │ • Filters (Date, Item, Lot, Shift, etc.)   │    │
│  │ • Summary Cards                            │    │
│  │ • Data Table                               │    │
│  │ • Export Function                          │    │
│  └────────────────────────────────────────────┘    │
└────────────────────────────────────────────────────┘
```

## Database Schema Relationships

```
┌─────────────────────┐     ┌─────────────────────────┐
│   Work Planning     │     │  Add On Work Planning   │
├─────────────────────┤     ├─────────────────────────┤
│ name                │     │ name                    │
│ date                │     │ date                    │
│ shift_type          │     │ shift_type              │
│ docstatus (0,1)     │     │ docstatus (0,1)         │
└────────┬────────────┘     └────────┬────────────────┘
         │                           │
         │ 1:N                       │ 1:N
         ▼                           ▼
┌─────────────────────┐     ┌─────────────────────────┐
│  Work Plan Item     │     │ Add On Work Plan Item   │
├─────────────────────┤     ├─────────────────────────┤
│ parent              │     │ parent                  │
│ item                │     │ item                    │
│ mould               │     │ mould                   │
└─────────────────────┘     └─────────────────────────┘
         │                           │
         └───────────────────────────┘
                      │
                     JOIN
                      │
                      ▼
┌─────────────────────────────┐     ┌─────────────────────────┐
│ Moulding Production Entry   │     │     Stock Entry         │
├─────────────────────────────┤     ├─────────────────────────┤
│ name                        │     │ name                    │
│ moulding_date               │     │ posting_date            │
│ item_to_produce             │     │ purpose = "Manufacture" │
│ scan_lot_number  ◄──────────┼─────┼─► spp_batch_number      │
│ batch_no                    │     │ docstatus = 1           │
│ number_of_lifts             │     └────────┬────────────────┘
│ no_of_running_cavities      │              │
│ docstatus = 1               │              │ 1:N
└─────────────────────────────┘              ▼
                                    ┌─────────────────────────┐
                                    │   Stock Entry Detail    │
                                    ├─────────────────────────┤
                                    │ parent                  │
                                    │ item_code               │
                                    │ qty                     │
                                    └─────────────────────────┘
```

## Data Matching Logic

```
PLANNED DATA                    ACTUAL DATA                   STOCK ENTRY DATA
┌─────────────────┐             ┌─────────────────┐          ┌─────────────────┐
│ production_date │◄──Match────►│ moulding_date   │◄─Match──►│ posting_date    │
│ item_code       │◄──Match────►│ item_to_produce │◄─Match──►│ item_code       │
│ (no lot field)  │    │        │ scan_lot_number │◄─Match──►│ spp_batch_number│
└─────────────────┘    │        └─────────────────┘          └─────────────────┘
                       │                ▲
                       │                │
                       └────────────────┘
                     Merged by date+item
                   (lot number from actual)
```

## Key Data Transformations

```
┌─────────────────────────────────────────────────────────┐
│ PLANNED PRODUCTION CALCULATION                          │
├─────────────────────────────────────────────────────────┤
│ planned_qty_pieces = noof_cavities × target_qty         │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│ ACTUAL PRODUCTION CALCULATION                           │
├─────────────────────────────────────────────────────────┤
│ actual_qty_pieces = number_of_lifts × running_cavities  │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│ VARIANCE CALCULATIONS                                   │
├─────────────────────────────────────────────────────────┤
│ variance_pieces = actual_qty_pieces - planned_qty_pieces│
│                                                         │
│ variance_percentage = (variance_pieces / planned) × 100 │
└─────────────────────────────────────────────────────────┘
```

## Filtering Process

```
┌───────────────────────────────────────┐
│ USER INPUT FILTERS                    │
├───────────────────────────────────────┤
│ • From Date                           │
│ • To Date                             │
│ • Item Filter                         │
│ • Lot Filter (scan_lot_number)        │
│ • Shift Filter                        │
│ • Planning Filter (all/planned)       │
└──────────────────┬────────────────────┘
                   │
                   ▼
┌───────────────────────────────────────┐
│ SQL FILTERING                         │
├───────────────────────────────────────┤
│ • Date Range in SQL Queries           │
│ • Item LIKE in SQL Queries            │
│ • Lot LIKE in SQL Queries             │
│ • Shift = in SQL Queries              │
└──────────────────┬────────────────────┘
                   │
                   ▼
┌───────────────────────────────────────┐
│ JAVASCRIPT FILTERING                  │
├───────────────────────────────────────┤
│ • Further filtering on client side    │
│ • Planning filter applied             │
│ • Dynamic table updates               │
└───────────────────────────────────────┘
```

## Key Changes in Latest Update

```
┌───────────────────────────────────────────────────────────────────────────┐
│ 1. Removed "Produced After Rejection" Column                              │
├───────────────────────────────────────────────────────────────────────────┤
│ ┌─────────────────┐     ┌─────────────────┐                               │
│ │ BEFORE          │  →  │ AFTER           │                               │
│ ├─────────────────┤     ├─────────────────┤                               │
│ │ stock_qty_pieces│     │    REMOVED      │                               │
│ └─────────────────┘     └─────────────────┘                               │
└───────────────────────────────────────────────────────────────────────────┘

┌───────────────────────────────────────────────────────────────────────────┐
│ 2. Changed Lot Number Field                                               │
├───────────────────────────────────────────────────────────────────────────┤
│ ┌─────────────────┐     ┌─────────────────┐                               │
│ │ BEFORE          │  →  │ AFTER           │                               │
│ ├─────────────────┤     ├─────────────────┤                               │
│ │ spp_batch_number│     │ scan_lot_number │                               │
│ └─────────────────┘     └─────────────────┘                               │
└───────────────────────────────────────────────────────────────────────────┘

┌───────────────────────────────────────────────────────────────────────────┐
│ 3. Only Showing Planned Production                                        │
├───────────────────────────────────────────────────────────────────────────┤
│ ┌─────────────────┐     ┌─────────────────┐                               │
│ │ BEFORE          │  →  │ AFTER           │                               │
│ ├─────────────────┤     ├─────────────────┤                               │
│ │ All Production  │     │ Only Planned    │                               │
│ │ "No Planning"   │     │ No unplanned    │                               │
│ └─────────────────┘     └─────────────────┘                               │
└───────────────────────────────────────────────────────────────────────────┘

┌───────────────────────────────────────────────────────────────────────────┐
│ 4. Including Draft Planning Documents                                     │
├───────────────────────────────────────────────────────────────────────────┤
│ ┌─────────────────┐     ┌─────────────────┐                               │
│ │ BEFORE          │  →  │ AFTER           │                               │
│ ├─────────────────┤     ├─────────────────┤                               │
│ │ docstatus = 1   │     │ docstatus IN    │                               │
│ │ (Submitted)     │     │ (0, 1)          │                               │
│ └─────────────────┘     └─────────────────┘                               │
└───────────────────────────────────────────────────────────────────────────┘
```
