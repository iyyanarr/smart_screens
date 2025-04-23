/**
 * Label Printer Class
 * Handles generating and printing labels for the Sub Lot Process
 */
export class LabelPrinter {
    constructor() {
        // CSS styles for the label are stored here for reuse
        this.labelStyles = this.getLabelStyles();
    }

    /**
     * Print a label for a Sub Lot Process
     * @param {string} processId - The ID of the Sub Lot Process record
     */
    printLabel(processId) {
        if (!processId) {
            frappe.msgprint("Process ID is required to print label");
            return;
        }
        
        // Fetch the process details
        frappe.call({
            method: "smart_screens.smart_screens.api.sub_lot_process.get_sublot_process_details",
            args: { process_id: processId },
            callback: (response) => {
                if (response.message && response.message.status === "success") {
                    const processData = response.message.data;
                    
                    // Generate the label HTML
                    const labelHtml = this.generateLabelHtml(processData);
                    
                    // Open a new window for printing
                    const printWindow = window.open('', '_blank');
                    
                    // Write the label HTML to the new window
                    printWindow.document.write(`
                        <html>
                            <head>
                                <title>Sub Lot Label - ${processData.sub_lot_number || 'N/A'}</title>
                                <style>${this.labelStyles}</style>
                            </head>
                            <body>
                                ${labelHtml}
                                <script>
                                    // Print automatically when loaded
                                    window.onload = function() {
                                        window.print();
                                        // Close window after print dialog is closed (works in most browsers)
                                        setTimeout(function() {
                                            window.close();
                                        }, 500);
                                    };
                                </script>
                            </body>
                        </html>
                    `);
                    
                    // Close the document
                    printWindow.document.close();
                } else {
                    const errorMsg = response.message ? response.message.message : "Failed to get process details";
                    frappe.msgprint({
                        title: __("Print Error"),
                        indicator: "red",
                        message: __(errorMsg)
                    });
                }
            },
            error: (err) => {
                console.error("Error fetching process details:", err);
                frappe.msgprint({
                    title: __("Print Error"),
                    indicator: "red",
                    message: __("Failed to get process details. Please try again.")
                });
            }
        });
    }

    /**
     * Generate HTML for the label based on process data
     * @param {Object} data - The process data
     * @returns {string} HTML for the label
     */
    generateLabelHtml(data) {
        // Generate HTML for the label with the specified dimensions (170cm x 170cm)
        return `
            <div class="label-container">
                <div class="label-header">
                    <div class="company-logo">
                        <img src="/assets/smart_screens/images/logo.png" alt="Company Logo">
                    </div>
                    <div class="label-title">SUB LOT</div>
                </div>
                
                <!-- Raw Material Batch Information with Barcode -->
                <div class="label-section">
                    <div class="section-title">Raw Material</div>
                    <div class="label-barcode">
                        <img src="/api/method/frappe.utils.barcode.get_barcode?data=${encodeURIComponent(data.batch_no)}&type=code128&height=40&width=1" alt="Raw Material Barcode">
                        <div class="barcode-number">${data.batch_no || 'N/A'}</div>
                    </div>
                </div>
                
                <!-- Finished Goods Batch Information with Barcode -->
                <div class="label-section">
                    <div class="section-title">Finished Good</div>
                    <div class="label-barcode">
                        <img src="/api/method/frappe.utils.barcode.get_barcode?data=${encodeURIComponent(data.sub_lot_number)}&type=code128&height=40&width=1" alt="Finished Good Barcode">
                        <div class="barcode-number">${data.sub_lot_number || 'N/A'}</div>
                    </div>
                </div>
                
                <div class="label-details">
                    <table class="details-table">
                        <tr>
                            <td class="label-key">Item Code:</td>
                            <td class="label-value">${data.item_code || 'N/A'}</td>
                            <td class="label-key">Item Name:</td>
                            <td class="label-value">${data.item_name || 'N/A'}</td>
                        </tr>
                        <tr>
                            <td class="label-key">Quantity:</td>
                            <td class="label-value">${data.sublot_qty || 'N/A'} ${data.stock_uom || ''}</td>
                            <td class="label-key">Created On:</td>
                            <td class="label-value">${frappe.datetime.str_to_user(data.creation) || 'N/A'}</td>
                        </tr>
                        <tr>
                            <td class="label-key">Warehouse:</td>
                            <td class="label-value">${data.warehouse || 'N/A'}</td>
                            <td class="label-key">Stage:</td>
                            <td class="label-value">${data.stage || 'N/A'}</td>
                        </tr>
                        <tr>
                            <td class="label-key">Source WH:</td>
                            <td class="label-value">${data.source_warehouse || 'N/A'}</td>
                            <td class="label-key">Target WH:</td>
                            <td class="label-value">${data.target_warehouse || 'N/A'}</td>
                        </tr>
                    </table>
                </div>
                
                <!-- Manufacturing Information -->
                <div class="manufacturing-info">
                    <div class="section-title">Manufacturing Information</div>
                    <table class="details-table">
                        <tr>
                            <td class="label-key">Work Order:</td>
                            <td class="label-value">${data.work_order || 'N/A'}</td>
                            <td class="label-key">Operator:</td>
                            <td class="label-value">${frappe.session.user_fullname || 'N/A'}</td>
                        </tr>
                        <tr>
                            <td class="label-key">Inspector:</td>
                            <td class="label-value">${data.inspector_name || 'N/A'}</td>
                            <td class="label-key">Inspection Qty:</td>
                            <td class="label-value">${data.inspection_quantity || 'N/A'}</td>
                        </tr>
                    </table>
                </div>
                
                <div class="qr-code">
                    <img src="/api/method/frappe.utils.barcode.get_qr?data=${encodeURIComponent(JSON.stringify({
                        sub_lot_number: data.sub_lot_number,
                        batch_no: data.batch_no,
                        item_code: data.item_code,
                        quantity: data.sublot_qty,
                        warehouse: data.warehouse,
                        work_order: data.work_order,
                        creation: data.creation
                    }))}" alt="QR Code">
                </div>
                
                <div class="label-footer">
                    <div class="footer-note">Smart Screens Processing System</div>
                </div>
            </div>
        `;
    }

    /**
     * Get CSS styles for the label
     * @returns {string} CSS styles
     */
    getLabelStyles() {
        // CSS styles for the label
        return `
            .label-container {
                width: 170cm;
                height: 170cm;
                padding: 5cm;
                box-sizing: border-box;
                border: 1px solid #ccc;
                font-family: Arial, sans-serif;
                background-color: white;
                display: flex;
                flex-direction: column;
                position: relative;
            }
            
            .label-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 3cm;
            }
            
            .company-logo img {
                height: 15cm;
                max-width: 40cm;
            }
            
            .label-title {
                font-size: 14cm;
                font-weight: bold;
                color: #333;
                text-align: center;
                flex-grow: 1;
            }
            
            .label-section {
                margin: 2cm 0;
                border: 1px solid #ddd;
                border-radius: 1cm;
                padding: 2cm;
                background-color: #f9f9f9;
            }
            
            .section-title {
                font-size: 6cm;
                font-weight: bold;
                color: #333;
                text-align: center;
                margin-bottom: 2cm;
                border-bottom: 1px solid #ddd;
                padding-bottom: 1cm;
            }
            
            .label-barcode {
                text-align: center;
                margin: 2cm 0;
            }
            
            .label-barcode img {
                height: 15cm;
                width: 80%;
            }
            
            .barcode-number {
                font-size: 6cm;
                margin-top: 1cm;
                font-weight: bold;
            }
            
            .label-details {
                margin: 3cm 0;
                flex-grow: 1;
            }
            
            .manufacturing-info {
                margin: 3cm 0;
                border: 1px solid #ddd;
                border-radius: 1cm;
                padding: 2cm;
                background-color: #f9f9f9;
            }
            
            .details-table {
                width: 100%;
                border-collapse: collapse;
            }
            
            .details-table tr {
                height: 10cm;
            }
            
            .label-key {
                font-weight: bold;
                font-size: 5cm;
                width: 25%;
                text-align: right;
                padding-right: 2cm;
                color: #555;
            }
            
            .label-value {
                font-size: 5cm;
                width: 25%;
                padding-left: 1cm;
            }
            
            .qr-code {
                text-align: center;
                margin: 3cm 0;
            }
            
            .qr-code img {
                height: 25cm;
                width: 25cm;
            }
            
            .label-footer {
                margin-top: auto;
                text-align: center;
                font-size: 4cm;
                color: #777;
                border-top: 1px solid #eee;
                padding-top: 3cm;
            }
            
            .footer-note {
                margin-bottom: 2cm;
            }
            
            .print-date {
                font-style: italic;
            }
            
            @media print {
                @page {
                    size: landscape;
                    margin: 0;
                }
                
                body {
                    margin: 0;
                    padding: 0;
                }
                
                .label-container {
                    width: 100%;
                    height: 100%;
                    border: none;
                    padding: 1cm;
                }
            }
        `;
    }
}