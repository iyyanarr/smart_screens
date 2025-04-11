import frappe
import barcode
from barcode.writer import ImageWriter
from io import BytesIO
import base64

def generate_barcode_image(batch_number):
    """
    Generate a barcode image for the given batch number using Code128 format.

    Args:
        batch_number (str): The batch number for which the barcode is to be generated.

    Returns:
        str: Base64-encoded string of the barcode image.
    """
    if not batch_number:
        frappe.throw("Batch Number is required to generate a barcode.")

    try:
        # Generate the barcode using the Code128 format
        barcode_class = barcode.get_barcode_class('code128')
        barcode_instance = barcode_class(batch_number, writer=ImageWriter())

        # Save the barcode image to a BytesIO object
        barcode_image = BytesIO()
        barcode_instance.write(barcode_image)

        # Encode the image to base64
        barcode_image.seek(0)
        base64_image = base64.b64encode(barcode_image.read()).decode('utf-8')

        return base64_image
    except Exception as e:
        frappe.throw(f"Failed to generate barcode: {str(e)}")