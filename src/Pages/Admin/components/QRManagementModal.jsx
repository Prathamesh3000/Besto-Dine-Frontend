import React, { useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { X, Download, Printer, CheckSquare, Square, Loader2, RefreshCw } from 'lucide-react';
import { QRCodeSVG, QRCodeCanvas } from 'qrcode.react';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import api from '../../../utils/api';
import toast from 'react-hot-toast';

/**
 * QRManagementModal Component
 * 
 * This modal handles QR code generation, display, download, and print functionality.
 * It supports two modes:
 * 1. Single Table Mode - Display QR for a specific table with download/print options
 * 2. Bulk Mode - Display all tables with bulk download as ZIP functionality
 * 
 * @param {Object} props
 * @param {Function} props.onClose - Callback to close the modal
 * @param {Object|null} props.table - Single table object for single mode (null for bulk mode)
 * @param {Array} props.allTables - Array of all tables for bulk mode
 * @param {string} props.baseUrl - Base URL for QR code generation (defaults to window.location.origin)
 * @param {Function} props.onTableUpdate - Callback to refresh parent data if token is regenerated
 */
const QRManagementModal = ({ onClose, table = null, allTables = [], baseUrl = window.location.origin, onTableUpdate }) => {
    // Determine if we're in single table mode or bulk mode
    const isBulkMode = !table;

    // State for bulk mode table selection
    const [selectedTables, setSelectedTables] = useState([]);
    // State for ZIP generation loading indicator
    const [isGeneratingZip, setIsGeneratingZip] = useState(false);

    // State for regenerating token
    const [isRegenerating, setIsRegenerating] = useState(false);
    const [showRegenerateConfirm, setShowRegenerateConfirm] = useState(false);

    /**
     * Generates the QR code URL for a given table
     * Format: {baseUrl}/scan/{qrToken}
     * @param {Object} tableInfo - The table object
     * @returns {string} The full URL to encode in the QR code
     */
    const getQRCodeUrl = (tableInfo) => {
        if (!tableInfo) return '';
        // Use qrToken from backend schema, fallback to ID for backward compatibility
        const identifier = tableInfo.qrToken || tableInfo._id || tableInfo.id;
        return `${baseUrl}/scan/${identifier}`;
    };

    /**
     * Toggles selection of a table in bulk mode
     * @param {string} tableId - The table ID to toggle
     */
    const toggleTableSelection = (tableId) => {
        setSelectedTables(prev =>
            prev.includes(tableId)
                ? prev.filter(id => id !== tableId)
                : [...prev, tableId]
        );
    };

    /**
     * Selects or deselects all tables in bulk mode
     */
    const toggleSelectAll = () => {
        if (selectedTables.length === allTables.length) {
            setSelectedTables([]);
        } else {
            setSelectedTables(allTables.map(t => t._id || t.id));
        }
    };

    /**
     * Generates a PNG blob from a QR code canvas
     * @param {string} tableId - The table ID
     * @param {string} qrUrl - The URL to encode
     * @returns {Promise<Blob>} The PNG blob
     */
    const generateQRPng = useCallback((tableId, qrUrl) => {
        return new Promise((resolve) => {
            // Create a temporary canvas for QR generation
            const canvas = document.createElement('canvas');
            const size = 300; // 300x300 pixels
            canvas.width = size;
            canvas.height = size + 50; // Extra space for table ID text
            const ctx = canvas.getContext('2d');

            // White background
            ctx.fillStyle = '#FFFFFF';
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            // Create QR code using a temporary QRCodeCanvas
            const tempContainer = document.createElement('div');
            tempContainer.style.position = 'absolute';
            tempContainer.style.left = '-9999px';
            document.body.appendChild(tempContainer);

            // Use React to render QRCodeCanvas
            import('react-dom/client').then(({ createRoot }) => {
                const root = createRoot(tempContainer);
                root.render(
                    <QRCodeCanvas
                        value={qrUrl}
                        size={280}
                        level="H"
                        includeMargin={true}
                        id={`temp-qr-${tableId}`}
                    />
                );

                // Wait for render and extract canvas
                setTimeout(() => {
                    const qrCanvas = tempContainer.querySelector('canvas');
                    if (qrCanvas) {
                        // Draw QR code on our canvas
                        ctx.drawImage(qrCanvas, 10, 10, 280, 280);

                        // Add table ID text
                        ctx.fillStyle = '#101828';
                        ctx.font = 'bold 16px Manrope, sans-serif';
                        ctx.textAlign = 'center';
                        ctx.fillText(`Table: ${tableId}`, size / 2, size + 30);

                        // Convert to blob
                        canvas.toBlob((blob) => {
                            resolve(blob);
                        }, 'image/png');
                    }

                    // Cleanup
                    root.unmount();
                    document.body.removeChild(tempContainer);
                }, 100);
            });
        });
    }, []);

    /**
     * Downloads QR code as PNG for a single table
     * Uses canvas-based approach for high-quality PNG output
     */
    const handleDownloadSingle = async () => {
        if (!table) return;

        const qrUrl = getQRCodeUrl(table);
        const tableName = table.name || table.id;
        const blob = await generateQRPng(tableName, qrUrl);
        saveAs(blob, `QR-${tableName}.png`);
    };

    /**
     * Opens print dialog for single table QR code
     * Creates a printable window with the QR code
     */
    const handlePrint = async () => {
        if (!table) return;

        const qrUrl = getQRCodeUrl(table);
        const tableName = table.name || table.id;
        // `table.area` is either a populated object ({ _id, name }) or an
        // unpopulated ObjectId. Falling back to the raw value printed a
        // 24-char hex string on the QR sheet — guard with typeof to drop
        // it cleanly to 'N/A' when only the ObjectId is available.
        const areaName = (table.area && typeof table.area === 'object' && table.area.name) || 'N/A';
        const capacity = table.capacity || 'N/A';

        // Generate the QR image blob first
        const blob = await generateQRPng(tableName, qrUrl);
        const qrImageDataUrl = await new Promise((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.readAsDataURL(blob);
        });

        // Create a hidden iframe for printing
        const iframe = document.createElement('iframe');
        iframe.style.position = 'fixed';
        iframe.style.right = '0';
        iframe.style.bottom = '0';
        iframe.style.width = '0';
        iframe.style.height = '0';
        iframe.style.border = '0';
        document.body.appendChild(iframe);

        const iframeDoc = iframe.contentWindow.document;
        iframeDoc.write(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>QR Code - Table ${tableName}</title>
                <style>
                    @page { margin: 0; }
                    body {
                        margin: 0;
                        padding: 0;
                        font-family: 'Manrope', sans-serif;
                        display: flex;
                        justify-content: center;
                        align-items: center;
                        min-height: 100vh;
                    }
                    .container {
                        text-align: center;
                        border: 2px dashed #EAECF0;
                        padding: 40px;
                        border-radius: 20px;
                        display: flex;
                        flex-direction: column;
                        align-items: center;
                    }
                    .title { font-size: 24px; font-weight: 700; color: #101828; margin: 20px 0 5px; }
                    .info { font-size: 14px; color: #667085; }
                    img { width: 350px; height: 350px; object-fit: contain; }
                </style>
            </head>
            <body>
                <div class="container">
                    <img src="${qrImageDataUrl}" alt="QR Code" />
                </div>
                <script>
                    window.onload = function() {
                        setTimeout(() => {
                            window.print();
                            setTimeout(() => {
                                window.parent.document.body.removeChild(window.frameElement);
                            }, 500);
                        }, 500);
                    };
                </script>
            </body>
            </html>
        `);
        iframeDoc.close();
    };

    /**
     * Downloads selected tables' QR codes as a ZIP file
     * Generates PNG for each selected table and bundles them
     */
    const handleBulkDownload = async () => {
        if (selectedTables.length === 0) return;

        setIsGeneratingZip(true);

        try {
            const zip = new JSZip();
            const qrFolder = zip.folder('QR-Codes');

            // Generate QR codes for each selected table
            for (const tableId of selectedTables) {
                const tableData = allTables.find(t => (t._id || t.id) === tableId);
                if (tableData) {
                    const qrUrl = getQRCodeUrl(tableData);
                    const tableName = tableData.name || tableData.id;
                    const blob = await generateQRPng(tableName, qrUrl);
                    qrFolder.file(`QR-${tableName}.png`, blob);
                }
            }

            // Generate and download ZIP
            const zipBlob = await zip.generateAsync({ type: 'blob' });
            saveAs(zipBlob, `QR-Codes-${new Date().toISOString().split('T')[0]}.zip`);
        } catch (error) {
            console.error('Error generating ZIP:', error);
            toast.error('Failed to generate ZIP file. Please try again.');
        } finally {
            setIsGeneratingZip(false);
        }
    };

    /**
     * Regenerates the QR Token for the current table
     */
    const handleRegenerateToken = async () => {
        if (!table || !table._id) {
            toast.error("Table context lost. Please try again.");
            return;
        }
        
        setIsRegenerating(true);
        try {
            await api.post(`/tables/${table._id}/qr-token`);
            toast.success('QR Token regenerated!');
            // Callback to parent to fetch fresh data
            if (onTableUpdate) {
                onTableUpdate();
            }
            setShowRegenerateConfirm(false);
            onClose(); // Close modal so user sees updated table upon reopening
        } catch (error) {
            console.error('Error regenerating token:', error);
            // Error is handled by global api interceptor toast
        } finally {
            setIsRegenerating(false);
        }
    };

    return createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="bg-white rounded-2xl w-full max-w-[800px] flex flex-col max-h-[90vh] shadow-2xl animate-in zoom-in-95 duration-200 font-manrope">

                {/* Header Section */}
                <div className="flex items-center justify-between p-6 pb-4 border-b border-[#F2F4F7] bg-[#FFF8F6] rounded-t-2xl">
                    <div>
                        <h2 className="text-[20px] leading-[28px] font-[700] text-[#1D2939] font-manrope">
                            {isBulkMode ? 'Download All QR Codes' : `QR Code - ${table?.name || table?.id}`}
                        </h2>
                        <p className="text-[14px] text-[#667085] mt-1">
                            {isBulkMode
                                ? 'Select tables to download their QR codes as a ZIP file'
                                : 'View, download, or print the QR code for this table'
                            }
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="p-2 hover:bg-white rounded-full text-[#98A2B3] hover:text-[#475467] transition-colors cursor-pointer"
                    >
                        <X size={24} />
                    </button>
                </div>

                {/* Content Area */}
                <div className="flex-1 overflow-y-auto p-6">
                    {isBulkMode ? (
                        /* Bulk Mode - Table Selection Grid */
                        <>
                            {/* Select All Header */}
                            <div className="flex items-center justify-between mb-4">
                                <button
                                    type="button"
                                    onClick={toggleSelectAll}
                                    className="flex items-center gap-2 text-[14px] font-[500] text-[#344054] hover:text-[#101828] transition-colors cursor-pointer"
                                >
                                    {selectedTables.length === allTables.length && allTables.length > 0 ? (
                                        <CheckSquare size={20} className="text-[#FE8301]" />
                                    ) : (
                                        <Square size={20} />
                                    )}
                                    {selectedTables.length === allTables.length && allTables.length > 0 ? 'Deselect All' : 'Select All'}
                                </button>
                                <span className="text-[14px] text-[#667085]">
                                    {selectedTables.length} of {allTables.length} selected
                                </span>
                            </div>

                            {/* Tables Grid */}
                            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                                {allTables.map((t) => {
                                    const tId = t._id || t.id;
                                    const isSelected = selectedTables.includes(tId);
                                    return (
                                        <div
                                            key={tId}
                                            onClick={() => toggleTableSelection(tId)}
                                            className={`relative p-4 rounded-[12px] border-2 cursor-pointer transition-all hover:shadow-md ${isSelected
                                                    ? 'border-[#FE8301] bg-[#FFF8F6]'
                                                    : 'border-[#EAECF0] bg-white hover:border-[#FE8301]/30'
                                                }`}
                                        >
                                            {/* Selection Indicator */}
                                            <div className="absolute top-3 right-3">
                                                {isSelected ? (
                                                    <CheckSquare size={18} className="text-[#FE8301]" />
                                                ) : (
                                                    <Square size={18} className="text-[#D0D5DD]" />
                                                )}
                                            </div>

                                            {/* Mini QR Preview */}
                                            <div className="flex justify-center mb-3">
                                                <QRCodeSVG
                                                    value={getQRCodeUrl(t)}
                                                    size={80}
                                                    level="M"
                                                    bgColor="#FFFFFF"
                                                    fgColor="#101828"
                                                />
                                            </div>

                                            {/* Table Info */}
                                            <p className="text-[14px] font-[600] text-[#101828] text-center font-manrope">
                                                {t.name || t.id}
                                            </p>
                                            <p className="text-[12px] text-[#667085] text-center font-manrope">
                                                {(t.area && typeof t.area === 'object' && t.area.name) || 'N/A'} • {t.capacity}
                                            </p>
                                        </div>
                                    );
                                })}
                            </div>
                        </>
                    ) : (
                        /* Single Mode - Large QR Display */
                        <div className="flex flex-col items-center">
                            {/* QR Code Display */}
                            <div className="bg-white p-8 rounded-[16px] border-2 border-dashed border-[#D0D5DD] mb-6">
                                <QRCodeSVG
                                    value={getQRCodeUrl(table)}
                                    size={250}
                                    level="H"
                                    bgColor="#FFFFFF"
                                    fgColor="#101828"
                                    includeMargin={true}
                                />
                            </div>

                            {/* Table Information */}
                            <div className="text-center mb-6">
                                <h3 className="text-[24px] font-[700] text-[#101828] font-manrope mb-2">
                                    Table {table?.name || table?.id}
                                </h3>
                                <div className="flex items-center justify-center gap-3 text-[14px] text-[#667085]">
                                    <span className="px-3 py-1 bg-[#F9FAFB] rounded-full">
                                        {(table?.area && typeof table.area === 'object' && table.area.name) || 'N/A'}
                                    </span>
                                    <span className="px-3 py-1 bg-[#F9FAFB] rounded-full">
                                        Capacity: {table?.capacity || 'N/A'}
                                    </span>
                                </div>
                            </div>

                            {/* QR URL Preview */}
                            <div className="w-full max-w-[400px] p-3 bg-[#F9FAFB] rounded-[10px] mb-4">
                                <p className="text-[12px] text-[#667085] mb-1 font-manrope">Secure Menu Scan link:</p>
                                <p className="text-[13px] text-[#101828] font-mono break-all">
                                    {getQRCodeUrl(table)}
                                </p>
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer Section */}
                <div className="p-6 border-t border-[#F2F4F7] bg-white rounded-b-2xl">
                    {isBulkMode ? (
                        /* Bulk Mode Actions */
                        <div className="flex gap-3">
                            <button
                                type="button"
                                onClick={onClose}
                                className="flex-1 py-3 text-[14px] font-[600] text-[#344054] bg-white border border-[#D0D5DD] rounded-[10px] hover:bg-[#F9FAFB] transition-all font-manrope cursor-pointer"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={handleBulkDownload}
                                disabled={selectedTables.length === 0 || isGeneratingZip}
                                className={`flex-1 py-3 text-[14px] font-[600] text-white rounded-[10px] transition-all font-manrope cursor-pointer flex items-center justify-center gap-2 ${selectedTables.length === 0 || isGeneratingZip
                                        ? 'bg-[#D0D5DD] cursor-not-allowed'
                                        : 'bg-[#FE8301] hover:bg-[#DC6803] shadow-lg shadow-orange-500/30'
                                    }`}
                            >
                                {isGeneratingZip ? (
                                    <>
                                        <Loader2 size={18} className="animate-spin" />
                                        Generating ZIP...
                                    </>
                                ) : (
                                    <>
                                        <Download size={18} />
                                        Download as ZIP ({selectedTables.length})
                                    </>
                                )}
                            </button>
                        </div>
                    ) : (
                        /* Single Mode Actions */
                        <div className="flex gap-3">
                            <button
                                type="button"
                                onClick={() => setShowRegenerateConfirm(true)}
                                disabled={isRegenerating}
                                className="flex-none p-3 text-[14px] font-[600] text-[#D92D20] bg-white border border-[#FEE4E2] rounded-[10px] hover:bg-[#FEF3F2] transition-all cursor-pointer flex items-center justify-center"
                                title="Regenerate Token (Invalidates old QR)"
                            >
                                <RefreshCw size={18} className={isRegenerating ? "animate-spin" : ""} />
                            </button>
                            <button
                                type="button"
                                onClick={onClose}
                                className="flex-1 py-3 text-[14px] font-[600] text-[#344054] bg-white border border-[#D0D5DD] rounded-[10px] hover:bg-[#F9FAFB] transition-all font-manrope cursor-pointer"
                            >
                                Close
                            </button>
                            <button
                                type="button"
                                onClick={handlePrint}
                                className="flex-1 py-3 text-[14px] font-[600] text-[#FE8301] bg-white border border-[#FE8301] rounded-[10px] hover:bg-orange-50 transition-all font-manrope cursor-pointer flex items-center justify-center gap-2"
                            >
                                <Printer size={18} />
                                Print
                            </button>
                            <button
                                type="button"
                                onClick={handleDownloadSingle}
                                className="flex-1 py-3 text-[14px] font-[600] text-white bg-[#FE8301] rounded-[10px] hover:bg-[#DC6803] shadow-lg shadow-orange-500/30 transition-all font-manrope cursor-pointer flex items-center justify-center gap-2"
                            >
                                <Download size={18} />
                                Download
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {/* Custom Confirmation Modal for Regeneration */}
            {showRegenerateConfirm && (
                <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/40 backdrop-blur-[2px] p-4 animation-in fade-in duration-200">
                    <div className="bg-white rounded-[16px] w-full max-w-[400px] overflow-hidden shadow-2xl transform transition-all animate-in zoom-in-95 duration-200">
                        {/* Modal Header */}
                        <div className="bg-[#FFF8F6] px-6 py-4 flex justify-between items-center border-b border-[#FFE8D6]">
                            <h3 className="text-[18px] font-[700] text-[#1D2939] font-manrope">Regenerate QR Code?</h3>
                            <button onClick={() => setShowRegenerateConfirm(false)} className="text-[#98A2B3] hover:text-[#475467] transition-colors">
                                <X size={20} />
                            </button>
                        </div>

                        {/* Modal Content */}
                        <div className="p-6">
                            <div className="w-12 h-12 bg-[#FEE4E2] rounded-full flex items-center justify-center mb-4 mx-auto">
                                <RefreshCw size={24} className="text-[#D92D20]" />
                            </div>
                            
                            <p className="text-[#645E66] text-[15px] font-[500] font-manrope mb-6 text-center leading-[22px]">
                                Are you sure? The current QR code will <span className="text-[#D92D20] font-[700]">stop working</span> immediately once you regenerate.
                            </p>

                            <div className="flex gap-3">
                                <button
                                    onClick={() => setShowRegenerateConfirm(false)}
                                    className="flex-1 w-full border border-[#D0D5DD] text-[#344054] py-2.5 rounded-[10px] font-[600] font-manrope hover:bg-gray-50 transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    disabled={isRegenerating}
                                    onClick={handleRegenerateToken}
                                    className={`flex-1 w-full bg-[#FE8301] text-white py-2.5 rounded-[10px] font-[600] font-manrope transition-colors flex justify-center items-center shadow-lg shadow-orange-500/20 ${
                                        isRegenerating ? 'opacity-70 cursor-not-allowed' : 'hover:bg-[#DC6803]'
                                    }`}
                                >
                                    {isRegenerating ? 'Working...' : 'Yes, Regenerate'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>,
        document.body
    );
};

export default QRManagementModal;
