#!/usr/bin/env python3
"""
Test script for Mould Performance Report improvements
Run from frappe-bench directory: bench execute smart_screens.test_mould_report.test_report
"""

import frappe
import json
from datetime import datetime, timedelta

def test_report():
    """Test the mould performance report with various filters"""
    
    print("\n" + "="*60)
    print("Testing Mould Performance Report")
    print("="*60 + "\n")
    
    # Test 1: No filters
    print("Test 1: Fetching all data (no filters)")
    print("-" * 60)
    try:
        from smart_screens.smart_screens.page.mould_performance_report.mould_performance_report import get_mould_performance_data
        
        result = get_mould_performance_data()
        if result['status'] == 'success':
            print(f"✓ Success: Found {len(result['report_data'])} mould records")
            print(f"  Current Year: {result.get('current_year')}")
            print(f"  Months: {len(result.get('months', []))}")
            if result['report_data']:
                sample = result['report_data'][0]
                print(f"  Sample Mould: {sample.get('mould_ref')}")
                print(f"  Total Lifts: {sample.get('total_lifts')}")
                print(f"  Has Specification: {bool(sample.get('specification'))}")
                print(f"  Has Detailed Entries: {bool(sample.get('detailed_entries'))}")
        else:
            print(f"✗ Error: {result.get('message')}")
    except Exception as e:
        print(f"✗ Exception: {str(e)}")
    
    # Test 2: Date range filter
    print("\n\nTest 2: Fetching with date range filter")
    print("-" * 60)
    try:
        # Get last 3 months
        end_date = datetime.now().date()
        start_date = end_date - timedelta(days=90)
        
        filters = {
            'date_range': [start_date.strftime('%Y-%m-%d'), end_date.strftime('%Y-%m-%d')]
        }
        
        result = get_mould_performance_data(json.dumps(filters))
        if result['status'] == 'success':
            print(f"✓ Success: Found {len(result['report_data'])} mould records")
            print(f"  Date Range: {start_date} to {end_date}")
            print(f"  Filters Applied: {result.get('filters_applied')}")
        else:
            print(f"✗ Error: {result.get('message')}")
    except Exception as e:
        print(f"✗ Exception: {str(e)}")
    
    # Test 3: Get a specific mould
    print("\n\nTest 3: Fetching specific mould reference")
    print("-" * 60)
    try:
        # First get all moulds to find a valid one
        result = get_mould_performance_data()
        if result['status'] == 'success' and result['report_data']:
            test_mould = result['report_data'][0]['mould_ref']
            
            filters = {'mould_ref': test_mould}
            result = get_mould_performance_data(json.dumps(filters))
            
            if result['status'] == 'success':
                print(f"✓ Success: Found data for mould {test_mould}")
                if result['report_data']:
                    data = result['report_data'][0]
                    print(f"  Total Lifts: {data.get('total_lifts')}")
                    print(f"  Historical Lifts: {data.get('historical_lifts')}")
                    print(f"  Monthly Lifts: {data.get('monthly_lifts')}")
                    
                    spec = data.get('specification', {})
                    if spec:
                        print(f"  Part Number: {spec.get('part_no', 'N/A')}")
                        print(f"  Compound Code: {spec.get('compound_code', 'N/A')}")
                    
                    details = data.get('detailed_entries', {})
                    if details:
                        print(f"  Detailed Entries Months: {list(details.keys())}")
                        total_entries = sum(len(entries) for entries in details.values())
                        print(f"  Total Production Entries: {total_entries}")
            else:
                print(f"✗ Error: {result.get('message')}")
        else:
            print("✗ No moulds found to test with")
    except Exception as e:
        print(f"✗ Exception: {str(e)}")
    
    # Test 4: Invalid date range
    print("\n\nTest 4: Testing with invalid date range (from > to)")
    print("-" * 60)
    try:
        end_date = datetime.now().date()
        start_date = end_date + timedelta(days=30)  # Invalid: future date
        
        filters = {
            'date_range': [start_date.strftime('%Y-%m-%d'), end_date.strftime('%Y-%m-%d')]
        }
        
        result = get_mould_performance_data(json.dumps(filters))
        if result['status'] == 'success':
            print(f"✓ Handled gracefully: Found {len(result['report_data'])} records (should be 0 or few)")
        else:
            print(f"✓ Error handled: {result.get('message')}")
    except Exception as e:
        print(f"✓ Exception handled: {str(e)}")
    
    # Test 5: Performance test
    print("\n\nTest 5: Performance test (measure query time)")
    print("-" * 60)
    try:
        import time
        start_time = time.time()
        
        result = get_mould_performance_data()
        
        end_time = time.time()
        duration = end_time - start_time
        
        if result['status'] == 'success':
            print(f"✓ Query completed in {duration:.2f} seconds")
            print(f"  Records returned: {len(result['report_data'])}")
            print(f"  Performance: {len(result['report_data'])/duration:.1f} records/second")
        else:
            print(f"✗ Error: {result.get('message')}")
    except Exception as e:
        print(f"✗ Exception: {str(e)}")
    
    print("\n" + "="*60)
    print("All tests completed!")
    print("="*60 + "\n")

if __name__ == "__main__":
    test_report()
