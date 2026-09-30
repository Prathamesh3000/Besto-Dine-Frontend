import React, { useState, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
    X, Download, Upload, FileText, CheckCircle, AlertCircle, Loader2, Info, Copy, Check, Building2,
} from 'lucide-react';
import api from '../../../utils/api';
import toast from 'react-hot-toast';
import { useAdminBranch } from '../../../Context/AdminBranchContext';

// Bulk onboarding modal for the Staff tab. Mirrors BulkAddTablesModal but
// adds a critical extra panel: the auto-generated temp passwords for every
// newly-created staff member. The DB only stores bcrypt hashes, so this is
// the ONE moment the admin can grab the plaintext to share with their team.
//
// Owner flow:
//   1. Download starter CSV (sample rows for Manager / Captain / Waiter / Chef / Sub Admin)
//   2. Edit in Excel — replace samples with real names/emails/branches, delete unused rows
//   3. Pick the saved file → upload
//   4. Backend creates user accounts + generates temp passwords for each
//   5. Modal shows the password list with a copy-all button
const BulkAddStaffModal = ({ onClose, onSuccess }) => {
    const [isDownloading, setIsDownloading] = useState(false);
    const [isUploading, setIsUploading] = useState(false);
    const [selectedFile, setSelectedFile] = useState(null);
    const [result, setResult] = useState(null);
    // null = none yet, 'all' = copied bundle, '<email>' = copied that one row
    const [copied, setCopied] = useState(null);
    const [uploadError, setUploadError] = useState('');
    const fileInputRef = useRef(null);

    // Bulk upload follows the admin's current branch context — whichever
    // branch they're viewing in the sidebar switcher is where the whole
    // batch lands. Sub Admins are force-pinned by the backend regardless,
    // but tenant owners benefit from the explicit "Will be added to: X"
    // indicator below so there's no surprise about where these accounts
    // end up. lockedBranchName is set when the caller is branch-pinned;
    // selectedBranchId carries the switcher value otherwise.
    const { selectedBranchId, branches, lockedBranchName, mainBranchId } = useAdminBranch();
    const targetBranch = useMemo(() => {
        if (lockedBranchName) {
            // Sub Admin — pin is authoritative. Backend will ignore any
            // branch we send and use the user's own branch, but we still
            // surface the name here so the admin sees where staff will land.
            return { id: null, name: lockedBranchName, locked: true };
        }
        if (selectedBranchId) {
            const match = (branches || []).find(b => String(b._id) === String(selectedBranchId));
            return { id: selectedBranchId, name: match?.name || 'Selected branch', locked: false };
        }
        // No specific branch picked. For a single-location tenant this is
        // the normal state and floor staff will be tenant-level. For a
        // multi-branch tenant, floor-staff rows will be rejected with a
        // clear message asking the admin to pick a branch first.
        return { id: null, name: '', locked: false };
    }, [selectedBranchId, branches, lockedBranchName]);
    const hasMultipleBranches = (branches || []).filter(b => b.isActive !== false).length > 1
        || !!mainBranchId;

    const handleDownload = async () => {
        if (isDownloading) return;
        setIsDownloading(true);
        try {
            const res = await api.get('/staff/template', { responseType: 'blob', _silent: true });
            const url = window.URL.createObjectURL(new Blob([res.data], { type: 'text/csv' }));
            const a = document.createElement('a');
            a.href = url;
            a.download = 'staff-master-template.csv';
            document.body.appendChild(a);
            a.click();
            a.remove();
            window.URL.revokeObjectURL(url);
            toast.success('Template downloaded — replace sample rows with real staff, then upload');
        } catch (err) {
            // We asked axios for `responseType: 'blob'`, so even an error
            // payload comes back as a Blob — `err.response?.data?.message`
            // is undefined and we used to surface the generic fallback
            // message ("Failed to download template"). Read the blob as
            // text and parse the JSON body so the admin actually sees the
            // server's reason (e.g. "Access denied. Restaurant owner only.").
            let serverMessage = '';
            const blob = err.response?.data;
            if (blob instanceof Blob) {
                try {
                    const text = await blob.text();
                    serverMessage = JSON.parse(text)?.message || '';
                } catch { /* not JSON — leave blank, fall back below */ }
            } else if (typeof blob === 'object' && blob?.message) {
                serverMessage = blob.message;
            }
            toast.error(serverMessage || err.message || 'Failed to download template');
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
            // Pass the current branch context as a form field so the
            // backend pins every uploaded staff to it. Sub Admins are
            // force-pinned server-side regardless — we still send the
            // value, the controller just ignores it for pinned callers.
            if (targetBranch.id) {
                formData.append('branch', targetBranch.id);
            }
            // Same multipart gotcha as BulkAddTablesModal — axios's default
            // application/json header has to be cleared so axios fills in
            // the multipart boundary itself. Without this, multer parses
            // zero fields and the controller sees no file.
            const res = await api.post('/staff/import', formData, {
                headers: { 'Content-Type': undefined },
                _silent: true,
            });
            const data = res.data || {};
            setResult({
                created:       data.created       || 0,
                skippedCount:  data.skippedCount  || 0,
                skipped:       data.skipped       || [],
                errorCount:    data.errorCount    || 0,
                errors:        data.errors        || [],
                tempPasswords: data.tempPasswords || [],
            });
            if (data.created > 0) {
                toast.success(`Created ${data.created} staff member${data.created === 1 ? '' : 's'}`);
                if (onSuccess) onSuccess();
            } else if ((data.errorCount || 0) > 0) {
                toast.error('No staff created — check errors below');
            } else if ((data.skippedCount || 0) > 0) {
                toast('Everyone in this file is already in your system', { icon: 'ℹ️' });
            } else {
                toast('No staff found in the file', { icon: 'ℹ️' });
            }
        } catch (err) {
            const data = err.response?.data;
            // Plan-cap rejection has a specific code so the admin gets a
            // clear message instead of a generic upload failure.
            if (data?.code === 'STAFF_LIMIT_REACHED') {
                setUploadError(data.message || 'This CSV would exceed your plan’s staff limit.');
            } else {
                setUploadError(data?.message || err.message || 'Upload failed');
            }
        } finally {
            setIsUploading(false);
        }
    };

    const handleClear = () => {
        setSelectedFile(null);
        setResult(null);
        setUploadError('');
        setCopied(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    // Build a single block of "Name <email>: password" lines so the admin
    // can paste straight into WhatsApp/Slack/whatever they use to share
    // credentials. One per line is friendlier than CSV here.
    const copyAllPasswords = async () => {
        if (!result?.tempPasswords?.length) return;
        const text = result.tempPasswords
            .map(tp => `${tp.name} <${tp.email}>: ${tp.tempPassword}`)
            .join('\n');
        try {
            await navigator.clipboard.writeText(text);
            setCopied('all');
            toast.success('All temp passwords copied');
            setTimeout(() => setCopied(null), 1800);
        } catch {
            toast.error('Couldn’t copy — your browser blocked clipboard access');
        }
    };

    const copyOnePassword = async (tp) => {
        try {
            await navigator.clipboard.writeText(tp.tempPassword);
            setCopied(tp.email);
            setTimeout(() => setCopied(null), 1500);
        } catch {
            toast.error('Couldn’t copy — your browser blocked clipboard access');
        }
    };

    return createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="bg-white rounded-[16px] w-full max-w-[640px] flex flex-col shadow-2xl animate-in zoom-in-95 duration-200 font-manrope max-h-[90vh]">

                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-[#FFE8D6] bg-[#FFF9F5] rounded-t-[16px]">
                    <div>
                        <h2 className="text-[18px] font-[700] text-[#1D2939] font-manrope">Bulk add staff</h2>
                        <p className="text-[12px] text-[#645E66] mt-0.5 font-manrope">
                            Roster your team in one upload. Temp passwords are shown ONCE after creation.
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

                    {/* Target branch indicator — shown above Step 1 so the
                        admin sees exactly where the upload will land before
                        they download the template. Mirrors how the AdminBranch
                        switcher reads in the sidebar. */}
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
                                            All uploaded staff will be added to:&nbsp;
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
                                            No branch selected — only Admin / Manager rows will be created.
                                        </p>
                                        <p className="text-[11px] text-[#7A4A0F] mt-0.5">
                                            Waiter / Captain / Chef rows will be rejected. Pick a branch in the sidebar switcher first to bulk-add floor staff.
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
                                    Pre-filled with one sample row per role — Manager, Captain, Waiter, Chef,
                                    Sub Admin. Replace the samples with your real staff and delete any rows you don&rsquo;t need.
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
                                    Required columns: <span className="font-mono text-[#344054]">name, email, role</span>.
                                    Optional: <span className="font-mono text-[#344054]">mobile</span>.
                                    Roles: <span className="font-mono text-[#344054]">admin / manager / captain / chef / waiter</span>.
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

                    {/* Result panels */}
                    {result && (
                        <div className="space-y-3">

                            {/* Created — green success. THIS is the panel the
                                admin should screenshot or copy from — the temp
                                passwords below it disappear after the modal
                                closes. */}
                            {result.created > 0 && (
                                <div className="border border-[#A6F4C5] bg-[#ECFDF3] rounded-[12px] p-4">
                                    <div className="flex items-start gap-3">
                                        <CheckCircle size={20} className="text-[#12B76A] mt-0.5 shrink-0" />
                                        <div className="flex-1">
                                            <p className="text-[14px] font-[700] text-[#1D2939]">
                                                Created {result.created} staff member{result.created === 1 ? '' : 's'}
                                            </p>
                                            <p className="text-[12px] text-[#645E66] mt-0.5">
                                                Each new staff must change their password on first login.
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Temp passwords — orange "share these now" panel.
                                Backend only returns plaintext once; if the admin
                                closes the modal these are GONE (have to use the
                                per-row Reset Password action to issue a new one). */}
                            {result.tempPasswords && result.tempPasswords.length > 0 && (
                                <div className="border border-[#FFE8D6] bg-[#FFF9F5] rounded-[12px] p-4">
                                    <div className="flex items-start gap-3">
                                        <Info size={20} className="text-[#FE8301] mt-0.5 shrink-0" />
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center justify-between gap-3 flex-wrap">
                                                <div>
                                                    <p className="text-[14px] font-[700] text-[#1D2939]">
                                                        Temp passwords — share now
                                                    </p>
                                                    <p className="text-[12px] text-[#645E66] mt-0.5">
                                                        These won&rsquo;t be visible again. If you miss one, use the staff row&rsquo;s &ldquo;Reset password&rdquo; action.
                                                    </p>
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={copyAllPasswords}
                                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-[600] text-[#FE8301] bg-white border border-[#FE8301] rounded-[8px] hover:bg-[#FFF3E6] transition-colors cursor-pointer"
                                                >
                                                    {copied === 'all' ? <Check size={14} /> : <Copy size={14} />}
                                                    {copied === 'all' ? 'Copied' : 'Copy all'}
                                                </button>
                                            </div>
                                            <div className="mt-3 bg-white border border-[#FFE8D6] rounded-[8px] max-h-[220px] overflow-y-auto">
                                                <table className="w-full text-[12px] font-manrope">
                                                    <thead className="bg-[#FFF3E6] text-[#7A4A0F] sticky top-0">
                                                        <tr>
                                                            <th className="px-3 py-2 text-left font-[600]">Name</th>
                                                            <th className="px-3 py-2 text-left font-[600]">Email</th>
                                                            <th className="px-3 py-2 text-left font-[600]">Temp password</th>
                                                            <th className="px-3 py-2 w-12"></th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {result.tempPasswords.map((tp) => (
                                                            <tr key={tp.email} className="border-t border-[#FFE8D6]">
                                                                <td className="px-3 py-1.5 text-[#1D2939] font-[500]">{tp.name}</td>
                                                                <td className="px-3 py-1.5 text-[#475467]">{tp.email}</td>
                                                                <td className="px-3 py-1.5 text-[#7A4A0F] font-mono select-all">{tp.tempPassword}</td>
                                                                <td className="px-3 py-1.5">
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => copyOnePassword(tp)}
                                                                        title="Copy this password"
                                                                        className="text-[#98A2B3] hover:text-[#FE8301] transition-colors cursor-pointer"
                                                                    >
                                                                        {copied === tp.email ? <Check size={14} className="text-[#12B76A]" /> : <Copy size={14} />}
                                                                    </button>
                                                                </td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Skipped — already-in-system rows */}
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
                                                            <th className="px-3 py-2 text-left font-[600]">Email</th>
                                                            <th className="px-3 py-2 text-left font-[600]">Reason</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {result.skipped.map((s, i) => (
                                                            <tr key={i} className="border-t border-[#E0F2FE]">
                                                                <td className="px-3 py-1.5 text-[#475467] font-mono">{s.row ?? '—'}</td>
                                                                <td className="px-3 py-1.5 text-[#475467]">{s.name || '—'}</td>
                                                                <td className="px-3 py-1.5 text-[#1D2939] font-[500]">{s.email || '—'}</td>
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

                            {/* Errors — red, only for real problems */}
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

                            {/* No-op outcome — header present, zero data rows that
                                parsed cleanly. Worth saying so the admin doesn't
                                think the upload was silently swallowed. */}
                            {result.created === 0 && (!result.skipped || result.skipped.length === 0) && (!result.errors || result.errors.length === 0) && (
                                <div className="border border-[#EAECF0] bg-[#F9FAFB] rounded-[12px] p-4">
                                    <div className="flex items-start gap-3">
                                        <Info size={20} className="text-[#667085] mt-0.5 shrink-0" />
                                        <div>
                                            <p className="text-[14px] font-[700] text-[#1D2939]">No staff found in the file</p>
                                            <p className="text-[12px] text-[#645E66] mt-0.5">
                                                Make sure your CSV has data rows under the <span className="font-mono">name, email, role</span> header.
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

export default BulkAddStaffModal;
