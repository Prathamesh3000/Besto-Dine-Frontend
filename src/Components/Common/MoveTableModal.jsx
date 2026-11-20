import React, { useEffect, useMemo, useRef, useState } from 'react';
import { X, ArrowRight, Loader2, Search } from 'lucide-react';
import toast from 'react-hot-toast';
import { tableAPI } from '../../utils/api';

/**
 * MoveTableModal — shared "Move table" flow (admin + captain).
 *   1. pick the SOURCE (occupied tables only)
 *   2. pick the DESTINATION (free tables only; the rest shown disabled with a reason)
 *   3. confirm (item count / orders / total come from the server preview)
 *
 * Props:
 *   tables               already-loaded tables ({_id,name,status,area,mergedWith,...})
 *   areas                optional [{_id,name}] used to label area groups
 *   onClose()
 *   onMoved(result)      called with the server `moved` payload after success
 *   onRefresh()          optional — called after a MOVE_CONFLICT so the host refetches
 *   preselectedSourceId  optional — start at step 2 with this table as source
 */
const rawStatus = (t) => t.underlyingStatus ?? t.status;
const isMerged = (t) => Boolean(t.merged || t.status === 'merged' || (Array.isArray(t.mergedWith) && t.mergedWith.length > 0));
const isSource = (t) => !isMerged(t) && ['occupied', 'alert'].includes(rawStatus(t));

const destReason = (t) => {
    if (isMerged(t)) return 'Merged - Unmerge tables first';
    const s = rawStatus(t);
    if (s === 'free') return null;
    if (s === 'occupied' || s === 'alert') return 'Occupied';
    if (s === 'reserved') return 'Reserved';
    if (s === 'disabled') return 'Disabled';
    return 'Unavailable';
};

const natural = (a, b) => String(a.name).localeCompare(String(b.name), undefined, { numeric: true, sensitivity: 'base' });
const rupee = (n) => `₹${Number(n || 0).toFixed(2)}`;

const MoveTableModal = ({ tables = [], areas = [], onClose, onMoved, onRefresh, preselectedSourceId = null }) => {
    const byId = useMemo(() => new Map(tables.map(t => [String(t._id), t])), [tables]);
    const startSource = preselectedSourceId && byId.get(String(preselectedSourceId)) && isSource(byId.get(String(preselectedSourceId)))
        ? String(preselectedSourceId) : null;
    const [sourceId, setSourceId] = useState(startSource);
    const [destId, setDestId] = useState(null);
    const [step, setStep] = useState(startSource ? 2 : 1);
    const [query, setQuery] = useState('');
    const [preview, setPreview] = useState(null);
    const [previewLoading, setPreviewLoading] = useState(false);
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);
    const busyRef = useRef(false);
    const dialogRef = useRef(null);

    useEffect(() => { dialogRef.current?.focus(); }, []);
    useEffect(() => {
        const onKey = (e) => { if (e.key === 'Escape' && !busyRef.current) onClose?.(); };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [onClose]);

    const areaName = (t) => {
        if (t.area && typeof t.area === 'object') return t.area.name || 'Other';
        const hit = areas.find(a => String(a._id) === String(t.area));
        return hit?.name || t.areaName || 'Other';
    };

    const source = sourceId ? byId.get(sourceId) : null;
    const dest = destId ? byId.get(destId) : null;

    const groups = useMemo(() => {
        const q = query.trim().toLowerCase();
        const list = tables
            .filter(t => (step === 1 ? isSource(t) : String(t._id) !== sourceId))
            .filter(t => !q || String(t.name).toLowerCase().includes(q));
        const m = new Map();
        list.forEach(t => {
            const k = areaName(t);
            if (!m.has(k)) m.set(k, []);
            m.get(k).push(t);
        });
        return [...m.entries()].map(([name, ts]) => ({ name, tables: ts.sort(natural) }));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [tables, areas, step, sourceId, query]);

    const loadPreview = async (from, to) => {
        setPreview(null);
        setError('');
        setPreviewLoading(true);
        try {
            const res = await tableAPI.moveTable({ fromTableId: from, toTableId: to, preview: true });
            setPreview(res.data?.preview || null);
        } catch (err) {
            const d = err?.response?.data;
            setError(d?.message || err?.message || 'Could not load the move summary');
            if (err?.response?.status === 409 || d?.code === 'MOVE_CONFLICT') onRefresh?.();
        } finally {
            setPreviewLoading(false);
        }
    };

    const pickSource = (t) => { setSourceId(String(t._id)); setDestId(null); setQuery(''); setError(''); setStep(2); };
    const pickDest = (t) => {
        setDestId(String(t._id));
        setQuery('');
        setStep(3);
        loadPreview(sourceId, String(t._id));
    };
    const back = () => {
        if (busyRef.current) return;
        setError('');
        setQuery('');
        if (step === 3) { setStep(2); setDestId(null); setPreview(null); }
        else if (step === 2) { setStep(1); setSourceId(null); }
    };

    const doMove = async () => {
        if (busyRef.current || !sourceId || !destId) return;
        busyRef.current = true;
        setBusy(true);
        setError('');
        try {
            const res = await tableAPI.moveTable({ fromTableId: sourceId, toTableId: destId });
            const moved = res.data?.moved || { fromTableId: sourceId, toTableId: destId };
            toast.success(`Moved ${moved.fromName || source?.name} -> ${moved.toName || dest?.name}`);
            onMoved?.(moved);
            onClose?.();
        } catch (err) {
            const d = err?.response?.data;
            setError(d?.message || err?.message || 'Could not move the table');
            if (err?.response?.status === 409 || d?.code === 'MOVE_CONFLICT') onRefresh?.();
        } finally {
            busyRef.current = false;
            setBusy(false);
        }
    };

    const title = step === 1 ? 'Move table: choose the table to move'
        : step === 2 ? `Move ${source?.name || ''}: choose a free table`
            : 'Confirm move';

    return (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/40 p-4" onClick={() => !busy && onClose?.()}>
            <div
                ref={dialogRef}
                tabIndex={-1}
                role="dialog"
                aria-modal="true"
                aria-labelledby="move-table-title"
                className="bg-white rounded-2xl w-full max-w-[480px] max-h-[85vh] flex flex-col shadow-2xl font-manrope outline-none"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-start justify-between gap-3 px-5 pt-5 pb-3">
                    <div>
                        <h3 id="move-table-title" className="text-[17px] font-[700] text-[#1D2939]">{title}</h3>
                        <p className="text-[12px] text-[#667085] mt-0.5">Step {step} of 3</p>
                    </div>
                    <button type="button" aria-label="Close" onClick={() => !busy && onClose?.()} className="p-2 text-gray-400 hover:text-gray-600">
                        <X size={18} />
                    </button>
                </div>

                {step !== 3 && (
                    <div className="px-5 pb-2">
                        <div className="relative">
                            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                            <input
                                type="search"
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                                placeholder="Search table"
                                aria-label="Search table"
                                className="w-full pl-8 pr-3 py-2 border border-gray-200 rounded-lg text-[14px]"
                            />
                        </div>
                    </div>
                )}

                <div className="flex-1 overflow-y-auto px-5 pb-3">
                    {step !== 3 && (groups.length === 0 ? (
                        <p className="py-8 text-center text-[14px] text-[#667085]">
                            {step === 1 ? 'No occupied tables to move.' : 'No tables found.'}
                        </p>
                    ) : groups.map(g => (
                        <div key={g.name} className="mb-3">
                            <p className="text-[11px] font-[700] uppercase tracking-wide text-[#98A2B3] mb-1.5">{g.name}</p>
                            <div className="grid grid-cols-2 gap-2">
                                {g.tables.map(t => {
                                    const reason = step === 2 ? destReason(t) : null;
                                    return (
                                        <button
                                            key={t._id}
                                            type="button"
                                            disabled={Boolean(reason)}
                                            onClick={() => (step === 1 ? pickSource(t) : pickDest(t))}
                                            aria-label={reason ? `${t.name}, ${reason}` : t.name}
                                            className={`text-left px-3 py-2.5 rounded-xl border text-[14px] font-[600] transition ${reason
                                                ? 'border-gray-100 bg-gray-50 text-gray-400 cursor-not-allowed'
                                                : 'border-gray-200 text-[#1D2939] hover:border-orange-400 hover:bg-[#FFF7ED]'}`}
                                        >
                                            <span className="block truncate">{t.name}</span>
                                            {reason && <span className="block text-[11px] font-[500] mt-0.5">{reason}</span>}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    )))}

                    {step === 3 && (
                        <div>
                            <div className="flex items-center justify-center gap-3 py-4 text-[20px] font-[800] text-[#1D2939]">
                                <span>{source?.name}</span>
                                <ArrowRight size={20} className="text-orange-500" />
                                <span>{dest?.name}</span>
                            </div>
                            {previewLoading ? (
                                <p className="flex items-center justify-center gap-2 py-4 text-[14px] text-[#667085]">
                                    <Loader2 size={16} className="animate-spin" /> Loading summary…
                                </p>
                            ) : preview ? (
                                <dl className="grid grid-cols-3 gap-2 text-center">
                                    <div className="bg-gray-50 rounded-xl py-3"><dt className="text-[11px] text-[#667085]">Items</dt><dd className="text-[18px] font-[700]">{preview.itemCount}</dd></div>
                                    <div className="bg-gray-50 rounded-xl py-3"><dt className="text-[11px] text-[#667085]">Orders</dt><dd className="text-[18px] font-[700]">{preview.orderCount}</dd></div>
                                    <div className="bg-gray-50 rounded-xl py-3"><dt className="text-[11px] text-[#667085]">Total</dt><dd className="text-[18px] font-[700]">{rupee(preview.total)}</dd></div>
                                </dl>
                            ) : null}
                            <p className="text-[12px] text-[#667085] mt-3 text-center">
                                All open orders move to the new table. The old table becomes free.
                            </p>
                        </div>
                    )}

                    {error && (
                        <p role="alert" className="mt-3 text-[13px] font-[600] text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
                    )}
                </div>

                <div className="flex gap-3 px-5 py-4 border-t border-gray-100">
                    {step > 1 && !(step === 2 && startSource) ? (
                        <button type="button" onClick={back} disabled={busy} className="flex-1 py-2.5 border border-gray-300 rounded-[10px] text-[14px] font-[600] text-[#344054] disabled:opacity-50">Back</button>
                    ) : (
                        <button type="button" onClick={() => onClose?.()} disabled={busy} className="flex-1 py-2.5 border border-gray-300 rounded-[10px] text-[14px] font-[600] text-[#344054] disabled:opacity-50">Cancel</button>
                    )}
                    {step === 3 && (
                        <button
                            type="button"
                            onClick={doMove}
                            disabled={busy || previewLoading || !preview}
                            className="flex-1 py-2.5 bg-[#FE8301] text-white rounded-[10px] text-[14px] font-[700] disabled:opacity-50 flex items-center justify-center gap-2"
                        >
                            {busy && <Loader2 size={14} className="animate-spin" />}
                            {busy ? 'Moving…' : 'Move'}
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};

export default MoveTableModal;
