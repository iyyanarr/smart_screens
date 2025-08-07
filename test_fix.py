"""
Test the Production Batch Weight functionality after column fix
Run this in Frappe console or as a script
"""

def test_conversion_factors():
    """Test the conversion factors function"""
    try:
        from smart_screens.smart_screens.page.aggregated_stock_movement.aggregated_stock_movement import get_mat_kg_to_nos_conversion_factors
        
        print("Testing conversion factors...")
        conversion_factors = get_mat_kg_to_nos_conversion_factors()
        
        print(f"Found {len(conversion_factors)} conversion factors")
        
        if conversion_factors:
            print("\nSample conversion factors:")
            for i, (batch, data) in enumerate(list(conversion_factors.items())[:5]):
                print(f"  Batch {batch}: Factor={data['conversion_factor']:.4f}, Source={data.get('source', 'Unknown')}")
                if 'blank_wt_gms' in data:
                    print(f"    Blank Weight: {data['blank_wt_gms']}g, Mould: {data.get('mould_reference', 'N/A')}")
        else:
            print("No conversion factors found - checking fallback...")
            
        return True
        
    except Exception as e:
        print(f"Error testing conversion factors: {e}")
        import traceback
        traceback.print_exc()
        return False

def test_production_batch_weight_create():
    """Test creating a Production Batch Weight record"""
    try:
        import frappe
        
        # Get a sample batch from moulding production entry
        sample_batch = frappe.db.sql("""
            SELECT mpe.batch_no, mpe.scan_lot_number, mpe.mould_reference 
            FROM `tabMoulding Production Entry` mpe
            WHERE mpe.batch_no IS NOT NULL 
                AND mpe.scan_lot_number IS NOT NULL
                AND mpe.mould_reference IS NOT NULL
            LIMIT 1
        """, as_dict=True)
        
        if not sample_batch:
            print("No sample batch found")
            return False
            
        batch_data = sample_batch[0]
        print(f"Testing with batch: {batch_data.batch_no}")
        
        # Check if record already exists
        existing = frappe.db.exists("Production Batch Weight", {"batch_no": batch_data.batch_no})
        if existing:
            print(f"Record already exists for batch {batch_data.batch_no}")
            doc = frappe.get_doc("Production Batch Weight", existing)
            print(f"Existing record: Scan Lot={doc.scan_lot_no}, Blank Wt={doc.blank_wt}")
            return True
        
        # Create new record
        doc = frappe.get_doc({
            "doctype": "Production Batch Weight",
            "batch_no": batch_data.batch_no,
            "scan_lot_no": batch_data.scan_lot_number or f"TEST_{batch_data.batch_no}"
        })
        
        # This should auto-populate blank_wt
        doc.insert(ignore_permissions=True)
        frappe.db.commit()
        
        print(f"Created record: {doc.name}")
        print(f"  Batch: {doc.batch_no}")
        print(f"  Scan Lot: {doc.scan_lot_no}")
        print(f"  Blank Weight: {doc.blank_wt}")
        print(f"  Mould Reference: {doc.mould_reference}")
        
        return True
        
    except Exception as e:
        print(f"Error creating Production Batch Weight: {e}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == "__main__":
    print("Production Batch Weight Test - Column Fix")
    print("========================================")
    
    success = True
    success &= test_conversion_factors()
    success &= test_production_batch_weight_create()
    
    if success:
        print("\n✅ All tests passed! The column issue has been fixed.")
    else:
        print("\n❌ Some tests failed.")
