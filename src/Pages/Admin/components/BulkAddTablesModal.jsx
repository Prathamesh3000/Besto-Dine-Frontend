import React, { useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
    X, Download, Upload, FileText, CheckCircle, AlertCircle, Loader2, Info,
} from 'lucide-react';
import api from '../../../utils/api';
import toast from 'react-hot-toast';

// Bulk onboarding modal for the Tables tab. Owner flow:
//   1. Download starter template (pre-filled common areas/tables)
//   2. Open in Excel → delete rows that don't apply → save
//   3. Pick the saved file → upload
//   4. Backend auto-creates missing areas + tables (with qr tokens)
//
// Result panel below the upload button shows created counts and any row
// errors. Closing the modal after a successful import refreshes the
// parent dashboard via the onSuccess callback.
const BulkAddTablesModal = ({ onClose, onSuccess }) => {
    const [isDownloading, setIsDownloading] = useState(false);
    const [isUploading, setIsUploading] = useState(false);
    const [selectedFile, setSelectedFile] = useState(null);
    const [result, setResult] = useState(null); // { created, areasCreated, errorCount, errors }
    const [uploadError, setUploadError] = useState('');
    const fileInputRef = useRef(null);

    const handleDownload = async () => {
        if (isDownloading) return;
        setIsDownloading(true);
        try {
            const res = await api.get('/tables/template', { responseType: 'blob', _silent: true });
            const url = window.URL.createObjectURL(new Blob([res.data], { type: 'text/csv' }));
            const a = document.createElement('a');
            a.href = url;
            a.download = 'tables-master-template.csv';
            document.body.appendChild(a);
            a.click();
            a.remove();
            window.URL.revokeObjectURL(url);
            toast.success('Template downloaded — delete rows you don’t need, then upload');
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to download template');
        } finally {
            setIsDownloading(false);
        }
    };

    const handleFilePick = (e) => {
        const file = e.target.files?.[0];
        setUploadError('');
        setResult(null);
        if (!file) {
            setSelectedFile(null);
            return;
        }
        const isCsv = file.name.toLowerCase().endsWith('.csv');
        if (!isCsv) {
            setUploadError('Please pick a .csv file');
            setSelectedFile(null);
            e.target.value = '';
            return;
        }
        // 1 MB cap matches the backend multer limit. Catch it client-side
        // so the owner gets a clean error instead of an opaque 413.
        if (file.size > 1 * 1024 * 1024) {
            setUploadError('File is too large (max 1 MB)');
            setSelectedFile(null);
            e.target.value = '';
            return;
        }
        setSelectedFile(file);
    };

    const handleUpload = async () => {
        if (!selectedFile || isUploading) return;
        setIsUploading(true);
        setUploadError('');
        setResult(null);
        try {
            const formData = new FormData();
            formData.append('file', selectedFile);
            // The shared axios instance (utils/api.js) sets a default
            // `Content-Type: application/json` for every request. For a
            // multipart upload that default is poisonous — it prevents
            // axios from auto-detecting the FormData body and inserting
            // the boundary parameter, so multer parses zero fields and
            // the controller sees no file. Setting the header explicitly
            // to `undefined` removes the instance default for this one
            // call, letting axios fill in the correct
            // `multipart/form-data; boundary=...` header itself.
            const res = await api.post('/tables/import', formData, {
                headers: { 'Content-Type': undefined },
                _silent: true,
            });
            const data = res.data || {};
            setResult({
                created: data.created || 0,
                areasCreated: data.areasCreated || 0,
                areasExisting: data.areasExisting || 0,
                skippedCount: data.skippedCount || 0,
                skipped: data.skipped || [],
                errorCount: data.errorCount || 0,
                errors: data.errors || [],
            });
            if (data.created > 0) {
                toast.success(`Created ${data.created} table${data.created === 1 ? '' : 's'}`);
                // Refresh the parent dashboard immediately so the new rows
                // are visible even before the owner closes this modal.
                if (onSuccess) onSuccess();
            } else if ((data.errorCount || 0) > 0) {
                toast.error('No tables created — check errors below');
            } else if ((data.skippedCount || 0) > 0) {
                // Every row was already in the system — that's fine, just inform.
                toast('Everything in this file is already in your system', { icon: 'ℹ️' });
            } else {
                toast('No tables found in the file', { icon: 'ℹ️' });
            }
        } catch (err) {
            const msg = err.response?.data?.message || err.message || 'Upload failed';
            setUploadError(msg);
        } finally {
            setIsUploading(false);
        }
    };

    const handleClear = () => {
        setSelectedFile(null);
        setResult(null);
        setUploadError('');
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    return createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="bg-white rounded-[16px] w-full max-w-[560px] flex flex-col shadow-2xl animate-in zoom-in-95 duration-200 font-manrope max-h-[90vh]">

                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-[#FFE8D6] bg-[#FFF9F5] rounded-t-[16px]">
                    <div>
                        <h2 className="text-[18px] font-[700] text-[#1D2939] font-manrope">Bulk add tables</h2>
                        <p className="text-[12px] text-[#645E66] mt-0.5 font-manrope">
                            Download the starter sheet, keep the rows you want, then upload.
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={isUploading}
                        aria-label="Close"
                        className="p-1 hover:bg-white rounded-full text-[#98A2B3] hover:text-[#475467] transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Body */}
                <div className="p-6 space-y-5 overflow-y-auto">

                    {/* Step 1: Download */}
                    <div className="border border-[#EAECF0] rounded-[12px] p-4">
                        <div className="flex items-start gap-3">
                            <div className="w-7 h-7 rounded-full bg-[#FFF3E6] text-[#FE8301] flex items-center justify-center font-[700] text-[13px] shrink-0">1</div>
                            <div className="flex-1">
                                <p className="text-[14px] font-[600] text-[#1D2939]">Download the starter template</p>
                                <p className="text-[12px] text-[#645E66] mt-0.5">
                                    Pre-filled with standard hotel & restaurant areas — Indoor Dining,
                                    AC Hall, Family Section, Outdoor, Garden, Rooftop, Poolside, Bar &amp;
                                    Lounge, Private Dining Room, Banquet Hall, Coffee Shop, and more.
                                    Open in Excel, delete rows that don&rsquo;t apply to your property, then upload.
                                </p>
                                <button
                                    type="button"
                                    onClick={handleDownload}
                                    disabled={isDownloading}
                                    className="mt-3 inline-flex items-center gap-2 px-4 py-2 text-[13px] font-[600] text-[#FE8301] border border-[#FE8301] rounded-[8px] hover:bg-[#FFF3E6] transition-colors cursor-pointer disabled:opacity-50"
                                >
                                    {isDownloading ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
                                    {isDownloading ? 'Downloading…' : 'Download template CSV'}
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Step 2: Upload */}
                    <div className="border border-[#EAECF0] rounded-[12px] p-4">
                        <div className="flex items-start gap-3">
                            <div className="w-7 h-7 rounded-full bg-[#FFF3E6] text-[#FE8301] flex items-center justify-center font-[700] text-[13px] shrink-0">2</div>
                            <div className="flex-1">
                                <p className="text-[14px] font-[600] text-[#1D2939]">Upload your filled template</p>
                                <p className="text-[12px] text-[#645E66] mt-0.5">
                                    Required columns: <span className="font-mono text-[#344054]">area, name, capacity</span>.
                                    Missing areas are created automatically.
                                </p>

                                <div className="mt-3 flex items-center gap-3 flex-wrap">
                                    <label className="inline-flex items-center gap-2 px-4 py-2 text-[13px] font-[600] text-[#475467] bg-white border border-[#D0D5DD] rounded-[8px] hover:border-[#FE8301] hover:text-[#FE8301] transition-colors cursor-pointer">
                                        <Upload size={16} />
                                        {selectedFile ? 'Choose a different file' : 'Choose .csv file'}
                                        <input
                                            ref={fileInputRef}
                                            type="file"
                                            accept=".csv,text/csv"
                                            className="hidden"
                                            onChange={handleFilePick}
                                            disabled={isUploading}
                                        />
                                    </label>

                                    {selectedFile && (
                                        <span className="inline-flex items-center gap-1.5 text-[12px] text-[#475467] font-medium">
                                            <FileText size={14} className="text-[#98A2B3]" />
                                            {selectedFile.name}
                                            <button
                                                type="button"
                                                onClick={handleClear}
                                                disabled={isUploading}
                                                className="ml-1 text-[#98A2B3] hover:text-[#F04438] disabled:opacity-40"
                                                aria-label="Clear file"
                                            >
                                                <X size={13} />
                                            </button>
                                        </span>
                                    )}
                                </div>

                                {uploadError && (
                                    <div className="mt-3 bg-[#FEF3F2] text-[#B42318] p-3 rounded-[8px] text-[12px] font-[500] flex items-start gap-2 border border-[#FEE4E2]">
                                        <AlertCircle size={14} className="mt-0.5 shrink-0" />
                                        <span>{uploadError}</span>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Result panels — three independent sections so the owner
                        can scan the outcome at a glance: what landed (green),
                        what was already there (blue/info), and what truly
                        failed (red). */}
                    {result && (
                        <div className="space-y-3">

                            {/* Created — green success */}
                            {result.created > 0 && (
                                <div className="border border-[#A6F4C5] bg-[#ECFDF3] rounded-[12px] p-4">
                                    <div className="flex items-start gap-3">
                                        <CheckCircle size={20} className="text-[#12B76A] mt-0.5 shrink-0" />
                                        <div className="flex-1">
                                            <p className="text-[14px] font-[700] text-[#1D2939]">
                                                Created {result.created} table{result.created === 1 ? '' : 's'}
                                            </p>
                                            <p className="text-[12px] text-[#645E66] mt-0.5">
                                                {result.areasCreated > 0 && (
                                                    <>Auto-created {result.areasCreated} new area{result.areasCreated === 1 ? '' : 's'}. </>
                                                )}
                                                {result.areasExisting > 0 && (
                                                    <>Reused {result.areasExisting} existing area{result.areasExisting === 1 ? '' : 's'}.</>
                                                )}
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Skipped — informational blue. These are NOT errors;
                                they're rows that were already present in the DB or
                                duplicated within the upload. Owner usually expects
                                this on a partial re-import. */}
                            {result.skipped && result.skipped.length > 0 && (
                                <div className="border border-[#B9E6FE] bg-[#F0F9FF] rounded-[12px] p-4">
                                    <div className="flex items-start gap-3">
                                        <Info size={20} className="text-[#0BA5EC] mt-0.5 shrink-0" />
                                        <div className="flex-1">
                                            <p className="text-[14px] font-[700] text-[#1D2939]">
                                                Skipped {result.skipped.length} table{result.skipped.length === 1 ? '' : 's'} — already present
                                            </p>
                                            <p className="text-[12px] text-[#645E66] mt-0.5">
                                                These rows match tables that already exist in your system, so we left them alone.
                                            </p>
                                            <div className="mt-3 bg-white border border-[#B9E6FE] rounded-[8px] max-h-[180px] overflow-y-auto">
                                                <table className="w-full text-[12px] font-manrope">
                                                    <thead className="bg-[#F0F9FF] text-[#026AA2] sticky top-0">
                                                        <tr>
                                                            <th className="px-3 py-2 text-left font-[600] w-16">Row</th>
                                                            <th className="px-3 py-2 text-left font-[600]">Area</th>
                                                            <th className="px-3 py-2 text-left font-[600]">Table</th>
                                                            <th className="px-3 py-2 text-left font-[600]">Reason</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {result.skipped.map((s, i) => (
                                                            <tr key={i} className="border-t border-[#E0F2FE]">
                                                                <td className="px-3 py-1.5 text-[#475467] font-mono">{s.row ?? '—'}</td>
                                                                <td className="px-3 py-1.5 text-[#475467]">{s.area || '—'}</td>
                                                                <td className="px-3 py-1.5 text-[#1D2939] font-[500]">{s.name || '—'}</td>
                                                                <td className="px-3 py-1.5 text-[#026AA2]">{s.reason || 'already in your system'}</td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Errors — red, only for real problems (bad capacity,
                                missing field, schema-level write failure). */}
                            {result.errors && result.errors.length > 0 && (
                                <div className="border border-[#FEE4E2] bg-[#FEF3F2] rounded-[12px] p-4">
                                    <div className="flex items-start gap-3">
                                        <AlertCircle size={20} className="text-[#F04438] mt-0.5 shrink-0" />
                                        <div className="flex-1">
                                            <p className="text-[14px] font-[700] text-[#1D2939]">
                                                {result.errors.length} row{result.errors.length === 1 ? '' : 's'} had errors
                                            </p>
                                            <p className="text-[12px] text-[#645E66] mt-0.5">
                                                Fix these rows in your CSV and re-upload — the rest were processed.
                                            </p>
                                            <div className="mt-3 bg-white border border-[#FEE4E2] rounded-[8px] max-h-[180px] overflow-y-auto">
                                                <table className="w-full text-[12px] font-manrope">
                                                    <thead className="bg-[#FEF3F2] text-[#B42318] sticky top-0">
                                                        <tr>
                                                            <th className="px-3 py-2 text-left font-[600] w-16">Row</th>
                                                            <th className="px-3 py-2 text-left font-[600]">Reason</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {result.errors.map((e, i) => (
                                                            <tr key={i} className="border-t border-[#FEE4E2]">
                                                                <td className="px-3 py-1.5 text-[#475467] font-mono">{e.row ?? '—'}</td>
                                                                <td className="px-3 py-1.5 text-[#B42318]">{e.message}</td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* No-op outcome — neither created nor skipped nor errored.
                                Happens only when the CSV had a header but zero data rows
                                that parsed cleanly. Worth telling the owner so they don't
                                think we silently swallowed their upload. */}
                            {result.created === 0 && (!result.skipped || result.skipped.length === 0) && (!result.errors || result.errors.length === 0) && (
                                <div className="border border-[#EAECF0] bg-[#F9FAFB] rounded-[12px] p-4">
                                    <div className="flex items-start gap-3">
                                        <Info size={20} className="text-[#667085] mt-0.5 shrink-0" />
                                        <div>
                                            <p className="text-[14px] font-[700] text-[#1D2939]">No tables found in the file</p>
                                            <p className="text-[12px] text-[#645E66] mt-0.5">
                                                Make sure your CSV has data rows under the <span className="font-mono">area, name, capacity</span> header.
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            )}

                        </div>
                    )}

                </div>

                {/* Footer */}
                <div className="p-6 pt-2 flex gap-3 border-t border-[#F2F4F7]">
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={isUploading}
                        className="flex-1 py-2.5 text-[14px] font-[600] text-[#475467] bg-white border border-[#D0D5DD] rounded-[10px] hover:bg-[#F9FAFB] transition-all font-manrope cursor-pointer disabled:opacity-50"
                    >
                        {result?.created > 0 ? 'Done' : 'Cancel'}
                    </button>
                    <button
                        type="button"
                        onClick={handleUpload}
                        disabled={!selectedFile || isUploading}
                        className="flex-1 py-2.5 text-[14px] font-[600] text-white bg-[#FE8301] rounded-[10px] hover:bg-[#DC6803] shadow-lg shadow-orange-500/20 transition-all font-manrope cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                        {isUploading ? (
                            <>
                                <Loader2 size={16} className="animate-spin" />
                                Importing…
                            </>
                        ) : (
                            <>
                                <Upload size={16} />
                                Upload &amp; create
                            </>
                        )}
                    </button>
                </div>

            </div>
        </div>,
        document.body,
    );
};

export default BulkAddTablesModal;
