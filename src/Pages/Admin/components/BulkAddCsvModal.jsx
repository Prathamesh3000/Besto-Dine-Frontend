import React, { useState, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
    X, Download, Upload, FileText, CheckCircle, AlertCircle, Loader2, Info, Building2,
} from 'lucide-react';
import api from '../../../utils/api';
import toast from 'react-hot-toast';
import { useAdminBranch } from '../../../Context/AdminBranchContext';

/**
 * Generic bulk-add modal driven entirely by props. Replaces the
 * copy-paste pattern that would otherwise produce one ~400-line modal
 * per entity (Event Types, Packages, Halls, Decoration Packages, …).
 *
 * Props:
 *   entityLabel        — singular/plural display label, e.g. { singular: 'event type', plural: 'event types' }
 *   templateEndpoint   — backend path, e.g. '/booking-info/event-types/template'
 *   importEndpoint     — backend path, e.g. '/booking-info/event-types/import'
 *   templateFilename   — file the browser saves as, e.g. 'eventType-master-template.csv'
 *   columnsHelp        — JSX describing required + optional columns shown under Step 2
 *   onClose            — closes the modal
 *   onSuccess          — called once with the result payload when at least one row was created
 *
 * Branch handling — exactly the same rules as BulkAddStaffModal:
 *   - Sub Admin (pinned) → forced server-side to their branch.
 *   - Tenant owner → currently-selected branch from AdminBranchContext is
 *     sent as the `branch` form field. Blank = tenant-level.
 *   - The header shows "All uploaded <plural> will be added to: <branch>"
 *     so there's never a surprise about where the rows landed.
 */
const BulkAddCsvModal = ({
    entityLabel,
    templateEndpoint,
    importEndpoint,
    templateFilename,
    columnsHelp,
    onClose,
    onSuccess,
}) => {
    const [isDownloading, setIsDownloading] = useState(false);
    const [isUploading, setIsUploading] = useState(false);
    const [selectedFile, setSelectedFile] = useState(null);
    const [result, setResult] = useState(null);
    const [uploadError, setUploadError] = useState('');
    const fileInputRef = useRef(null);

    // Current branch context — same derivation as BulkAddStaffModal.
    // lockedBranchName fires for Sub Admins (pinned); selectedBranchId
    // for tenant owners.
    const { selectedBranchId, branches, lockedBranchName, mainBranchId } = useAdminBranch();
    const targetBranch = useMemo(() => {
        if (lockedBranchName) {
            return { id: null, name: lockedBranchName, locked: true };
        }
        if (selectedBranchId) {
            const match = (branches || []).find(b => String(b._id) === String(selectedBranchId));
            return { id: selectedBranchId, name: match?.name || 'Selected branch', locked: false };
        }
        return { id: null, name: '', locked: false };
    }, [selectedBranchId, branches, lockedBranchName]);
    const hasMultipleBranches = (branches || []).filter(b => b.isActive !== false).length > 1
        || !!mainBranchId;

    const handleDownload = async () => {
        if (isDownloading) return;
        setIsDownloading(true);
        try {
            const res = await api.get(templateEndpoint, { responseType: 'blob', _silent: true });
            const url = window.URL.createObjectURL(new Blob([res.data], { type: 'text/csv' }));
            const a = document.createElement('a');
            a.href = url;
            a.download = templateFilename;
            document.body.appendChild(a);
            a.click();
            a.remove();
            window.URL.revokeObjectURL(url);
            toast.success(`Template downloaded — edit, then upload`);
        } catch (err) {
            // Blob response wraps errors — read the body as text and parse
            // the JSON so the real backend message reaches the toast.
            // Without this, every 403/400 looks identical to the user.
            let serverMessage = '';
            const blob = err.response?.data;
            if (blob instanceof Blob) {
                try {
                    const text = await blob.text();
                    serverMessage = JSON.parse(text)?.message || '';
                } catch { /* not JSON */ }
            } else if (typeof blob === 'object' && blob?.message) {
                serverMessage = blob.message;
            }
            toast.error(serverMessage || err.message || `Failed to download ${entityLabel.singular} template`);
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
            // Pass the current branch context — backend pins the whole
            // batch to it. Sub Admin pin overrides server-side regardless.
            if (targetBranch.id) {
                formData.append('branch', targetBranch.id);
            }
            // Same axios multipart gotcha as the other Bulk Add modals —
            // clear the default JSON Content-Type so axios can fill in
            // the multipart boundary itself.
            const res = await api.post(importEndpoint, formData, {
                headers: { 'Content-Type': undefined },
                _silent: true,
            });
            const data = res.data || {};
            setResult({
                created:      data.created      || 0,
                skippedCount: data.skippedCount || 0,
                skipped:      data.skipped      || [],
                errorCount:   data.errorCount   || 0,
                errors:       data.errors       || [],
            });
            if (data.created > 0) {
                toast.success(`Created ${data.created} ${data.created === 1 ? entityLabel.singular : entityLabel.plural}`);
                if (onSuccess) onSuccess(data);
            } else if ((data.errorCount || 0) > 0) {
                toast.error(`No ${entityLabel.plural} created — check errors below`);
            } else if ((data.skippedCount || 0) > 0) {
                toast(`Everything in this file is already in your system`, { icon: 'ℹ️' });
            } else {
                toast(`No ${entityLabel.plural} found in the file`, { icon: 'ℹ️' });
            }
        } catch (err) {
            setUploadError(err.response?.data?.message || err.message || 'Upload failed');
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
            <div className="bg-white rounded-[16px] w-full max-w-[600px] flex flex-col shadow-2xl animate-in zoom-in-95 duration-200 font-manrope max-h-[90vh]">

                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-[#FFE8D6] bg-[#FFF9F5] rounded-t-[16px]">
                    <div>
                        <h2 className="text-[18px] font-[700] text-[#1D2939] font-manrope">Bulk add {entityLabel.plural}</h2>
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

                    {/* Target branch indicator */}
                    {(targetBranch.name || hasMultipleBranches) && (
                        <div className={`flex items-start gap-3 rounded-[12px] p-3 border ${
                            targetBranch.name
                                ? 'bg-[#FFF9F5] border-[#FFE8D6]'
                                : 'bg-[#FEF6EE] border-[#FED7AA]'
                        }`}>
                            <Building2 size={18} className="text-[#FE8301] mt-0.5 shrink-0" />
                            <div className="flex-1">
                                {targetBranch.name ? (
                                    <>
                                        <p className="text-[12px] font-[600] text-[#1D2939]">
                                            All uploaded {entityLabel.plural} will be added to:&nbsp;
                                            <span className="text-[#FE8301]">{targetBranch.name}</span>
                                            {targetBranch.locked && (
                                                <span className="ml-1 text-[10px] text-[#98A2B3]">(your assigned branch)</span>
                                            )}
                                        </p>
                                        <p className="text-[11px] text-[#645E66] mt-0.5">
                                            Switch the branch in the sidebar before uploading if you want a different one.
                                        </p>
                                    </>
                                ) : (
                                    <>
                                        <p className="text-[12px] font-[600] text-[#7A4A0F]">
                                            No branch selected — {entityLabel.plural} will be added at tenant level (shared).
                                        </p>
                                        <p className="text-[11px] text-[#7A4A0F] mt-0.5">
                                            Pick a branch in the sidebar to add these {entityLabel.plural} to a specific branch.
                                        </p>
                                    </>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Step 1: Download */}
                    <div className="border border-[#EAECF0] rounded-[12px] p-4">
                        <div className="flex items-start gap-3">
                            <div className="w-7 h-7 rounded-full bg-[#FFF3E6] text-[#FE8301] flex items-center justify-center font-[700] text-[13px] shrink-0">1</div>
                            <div className="flex-1">
                                <p className="text-[14px] font-[600] text-[#1D2939]">Download the starter template</p>
                                <p className="text-[12px] text-[#645E66] mt-0.5">
                                    Pre-filled with common {entityLabel.plural} based on global hotel &amp; restaurant practice.
                                    Open in Excel, delete rows that don&rsquo;t apply, then upload.
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
                                <div className="text-[12px] text-[#645E66] mt-0.5">{columnsHelp}</div>

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

                    {/* Result panels */}
                    {result && (
                        <div className="space-y-3">

                            {result.created > 0 && (
                                <div className="border border-[#A6F4C5] bg-[#ECFDF3] rounded-[12px] p-4">
                                    <div className="flex items-start gap-3">
                                        <CheckCircle size={20} className="text-[#12B76A] mt-0.5 shrink-0" />
                                        <div className="flex-1">
                                            <p className="text-[14px] font-[700] text-[#1D2939]">
                                                Created {result.created} {result.created === 1 ? entityLabel.singular : entityLabel.plural}
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {result.skipped && result.skipped.length > 0 && (
                                <div className="border border-[#B9E6FE] bg-[#F0F9FF] rounded-[12px] p-4">
                                    <div className="flex items-start gap-3">
                                        <Info size={20} className="text-[#0BA5EC] mt-0.5 shrink-0" />
                                        <div className="flex-1">
                                            <p className="text-[14px] font-[700] text-[#1D2939]">
                                                Skipped {result.skipped.length} row{result.skipped.length === 1 ? '' : 's'} — already present
                                            </p>
                                            <div className="mt-3 bg-white border border-[#B9E6FE] rounded-[8px] max-h-[180px] overflow-y-auto">
                                                <table className="w-full text-[12px] font-manrope">
                                                    <thead className="bg-[#F0F9FF] text-[#026AA2] sticky top-0">
                                                        <tr>
                                                            <th className="px-3 py-2 text-left font-[600] w-16">Row</th>
                                                            <th className="px-3 py-2 text-left font-[600]">Name</th>
                                                            <th className="px-3 py-2 text-left font-[600]">Reason</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {result.skipped.map((s, i) => (
                                                            <tr key={i} className="border-t border-[#E0F2FE]">
                                                                <td className="px-3 py-1.5 text-[#475467] font-mono">{s.row ?? '—'}</td>
                                                                <td className="px-3 py-1.5 text-[#1D2939] font-[500]">{s.name || s.title || '—'}</td>
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

                            {result.created === 0 && (!result.skipped || result.skipped.length === 0) && (!result.errors || result.errors.length === 0) && (
                                <div className="border border-[#EAECF0] bg-[#F9FAFB] rounded-[12px] p-4">
                                    <div className="flex items-start gap-3">
                                        <Info size={20} className="text-[#667085] mt-0.5 shrink-0" />
                                        <div>
                                            <p className="text-[14px] font-[700] text-[#1D2939]">No {entityLabel.plural} found in the file</p>
                                            <p className="text-[12px] text-[#645E66] mt-0.5">
                                                Make sure your CSV has data rows under the header.
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

export default BulkAddCsvModal;
