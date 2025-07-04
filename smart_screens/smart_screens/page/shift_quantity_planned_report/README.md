# Shift Quantity Planned Report

## Quick Overview
A comprehensive production planning report that calculates expected production quantities based on target lifts and mould specifications.

## Business Formula
```
Expected Production Qty = Target No. Of Lifts × No. Of Cavities
```

## Key Features
- ✅ Date and shift filtering
- ✅ Regular and Add-on work plan aggregation
- ✅ Real-time calculation of expected production quantities
- ✅ Export to Excel functionality
- ✅ Responsive design for all devices
- ✅ Summary cards with key metrics

## Access
Navigate to: `http://your-site.local:8000/app/shift-quantity-planned-report`

## Data Sources
1. **Work Planning** - Regular production plans
2. **Add On Work Planning** - Additional production plans  
3. **Work Plan Item Target** - Target lift quantities per item/shift
4. **Mould Specification** - Number of cavities per mould
5. **Shift Type** - Shift configuration and timing

## Filter Options
- **Date**: Specific date or date range
- **Shift Type**: All shifts or specific shift type

## Output Columns
| Column | Description |
|--------|-------------|
| Item | Product/Item code |
| Press | Workstation/Press name |
| Mould | Mould reference |
| Date | Planning date |
| Shift Type | Shift type name |
| No. of Cavities | Cavities from mould specification |
| Target Qty (Lifts) | Target number of lifts |
| Expected Production Qty | Calculated production quantity |
| Plan Types | Regular/Add-on classification |

## Summary Metrics
- **Total Items**: Count of unique items
- **Total Presses**: Count of unique workstations  
- **Total Expected Qty**: Sum of expected production
- **Total Records**: Count of planning records

## Documentation Files
- `BUSINESS_LOGIC_DOCUMENTATION.md` - Detailed business logic and requirements
- `TECHNICAL_IMPLEMENTATION.md` - Technical implementation details

## Support
For technical issues or business questions, contact the development team.

---
**Version**: 1.0 | **Last Updated**: July 2025
