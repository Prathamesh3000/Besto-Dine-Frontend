import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react'
import { X, Upload, FileText, AlertTriangle, CheckCircle, Loader, Trash2, Plus, ArrowLeft } from 'lucide-react'
import api from '../../../utils/api'
import toast from 'react-hot-toast'
import { buildMenuCsv, exportableRows, rowIsValid } from '../../../utils/menuScanCsv'

// "Scan my menu" — upload photos / PDF of a menu card, review what the AI
// understood in an editable table, then feed the confirmed rows to the existing
// CSV importer (POST /menu/import). POST /menu/scan saves nothing.

const MAX_FILES = 6
const MAX_BYTES = 10 * 1024 * 1024
const SMALL_SIDE = 900
const ACCEPT = '.jpg,.jpeg,.png,.webp,.pdf,image/jpeg,image/png,image/webp,application/pdf'

const isPdf = (f) => f?.type === 'application/pdf' || /\.pdf$/i.test(f?.name || '')
const isAllowed = (f) => isPdf(f) || /^image\/(jpeg|png|webp)$/.test(f?.type || '') || /\.(jpe?g|png|webp)$/i.test(f?.name || '')

let manualSeq = 0

const confBadge = (c) => {
    const v = typeof c === 'number' ? c : 1
    if (v >= 0.85) return 'bg-emerald-100 text-emerald-700'
    if (v >= 0.7) return 'bg-amber-100 text-amber-700'
    return 'bg-red-100 text-red-700'
}

const toEditable = (r) => ({
    ...r,
    name: r.name || '',
    category: r.category || '',
    description: r.description || '',
    vegType: r.vegType === 'non-veg' ? 'non-veg' : 'veg',
    sizes: Array.isArray(r.sizes) ? r.sizes : [],
    issues: Array.isArray(r.issues) ? r.issues : [],
    priceStr: r.basePrice == null ? '' : String(r.basePrice),
    keep: true,
    needsCheck: !!r.needsCheck,
    wasFlagged: !!r.needsCheck,
    edited: false,
})

const ScanMenuModal = ({ onClose, onComplete }) => {
    const [step, setStep] = useState(1)
    const [files, setFiles] = useState([]) // [{ id, file, url }]
    const [smallWarnings, setSmallWarnings] = useState({}) // id -> true
    const [dragOver, setDragOver] = useState(false)
    const [scanning, setScanning] = useState(false)
    const [scanError, setScanError] = useState('')
    const [scan, setScan] = useState(null) // { categories, pages }
    const [rows, setRows] = useState([])
    const [selectedId, setSelectedId] = useState(null)
    const [needsFirst, setNeedsFirst] = useState(true)
    const [confirming, setConfirming] = useState(false)
    const [importing, setImporting] = useState(false)
    const [result, setResult] = useState(null)
    const [importedNames, setImportedNames] = useState([])
    const inputRef = useRef(null)
    const filesRef = useRef([])
    filesRef.current = files

    // Revoke object URLs on unmount.
    useEffect(() => () => {
        filesRef.current.forEach((f) => { try { URL.revokeObjectURL(f.url) } catch { /* noop */ } })
    }, [])

    const addFiles = useCallback((list) => {
        const incoming = Array.from(list || [])
        if (!incoming.length) return
        const current = filesRef.current
        const accepted = []
        for (const f of incoming) {
            if (!isAllowed(f)) { toast.error(`${f.name}: only JPG, PNG, WEBP or PDF files`); continue }
            if (f.size > MAX_BYTES) { toast.error(`${f.name} is larger than 10 MB`); continue }
            if (current.length + accepted.length >= MAX_FILES) { toast.error(`You can upload up to ${MAX_FILES} files`); break }
            accepted.push({ id: `${f.name}-${f.size}-${Math.random().toString(36).slice(2, 8)}`, file: f, url: URL.createObjectURL(f) })
        }
        if (!accepted.length) return
        setFiles([...current, ...accepted])
        setScanError('')
        // Non-blocking resolution check.
        accepted.forEach((a) => {
            if (isPdf(a.file)) return
            const img = new Image()
            img.onload = () => {
                if (Math.max(img.naturalWidth, img.naturalHeight) < SMALL_SIDE) {
                    setSmallWarnings((w) => ({ ...w, [a.id]: true }))
                }
            }
            img.src = a.url
        })
    }, [])

    const removeFile = (id) => {
        const f = files.find((x) => x.id === id)
        if (f) { try { URL.revokeObjectURL(f.url) } catch { /* noop */ } }
        setFiles(files.filter((x) => x.id !== id))
        setSmallWarnings((w) => { const n = { ...w }; delete n[id]; return n })
    }

    const handleScan = async () => {
        if (!files.length || scanning) return
        setScanning(true)
        setScanError('')
        try {
            const fd = new FormData()
            files.forEach((f) => fd.append('files', f.file))
            const res = await api.post('/menu/scan', fd, {
                headers: { 'Content-Type': undefined },
                timeout: 120000,
            })
            const data = res.data?.data || {}
            const found = Array.isArray(data.rows) ? data.rows.map(toEditable) : []
            if (!found.length) {
                setScanError('We could not find any dishes in these photos.')
                return
            }
            setRows(found)
            setScan({ categories: data.categories || [], pages: data.pages || [] })
            setSelectedId(null)
            setConfirming(false)
            setStep(2)
        } catch (err) {
            const msg = err.response?.data?.message || 'Could not read the menu. Please try again.'
            setScanError(msg)
            toast.error(msg)
        } finally {
            setScanning(false)
        }
    }

    // ── Row editing ──
    const patchRow = (id, patch) => {
        setRows((rs) => rs.map((r) => {
            if (r.id !== id) return r
            const next = { ...r, ...patch }
            if (r.needsCheck) { next.needsCheck = false; next.edited = true }
            return next
        }))
    }
    const setPrice = (id, str) => {
        const n = str === '' ? null : Number(str)
        patchRow(id, { priceStr: str, basePrice: n !== null && Number.isFinite(n) ? n : null })
    }
    const deleteRow = (id) => setRows((rs) => rs.filter((r) => r.id !== id))
    const addRow = () => {
        const id = `manual-${++manualSeq}`
        setRows((rs) => [...rs, {
            id, name: '', category: '', description: '', basePrice: null, priceStr: '', priceText: '',
            vegType: 'veg', sizes: [], page: 1, box: null, confidence: 1, needsCheck: false,
            issues: [], keep: true, wasFlagged: false, edited: false,
        }])
        setSelectedId(id)
    }

    const displayRows = useMemo(() => {
        if (!needsFirst) return rows
        return [...rows.filter((r) => r.wasFlagged), ...rows.filter((r) => !r.wasFlagged)]
    }, [rows, needsFirst])

    const kept = rows.filter((r) => r.keep)
    const invalidKept = kept.filter((r) => !rowIsValid(r))
    const noPrice = invalidKept.length
    const toCreate = exportableRows(rows)
    const unchecked = kept.filter((r) => r.needsCheck).length
    const categoryCount = new Set(rows.map((r) => (r.category || '').trim().toLowerCase()).filter(Boolean)).size
    const flaggedCount = rows.filter((r) => r.needsCheck).length
    const selected = rows.find((r) => r.id === selectedId) || displayRows[0] || null
    const pageFile = selected ? files[(selected.page || 1) - 1] : null
    const warnPages = (scan?.pages || []).filter((p) => p?.quality?.warnings?.length)

    const handleCreate = async () => {
        setImporting(true)
        try {
            const csv = buildMenuCsv(rows)
            const file = new File([csv], 'menu-scan.csv', { type: 'text/csv' })
            const fd = new FormData()
            fd.append('file', file)
            const res = await api.post('/menu/import', fd, { headers: { 'Content-Type': undefined } })
            setImportedNames(toCreate.map((r) => r.name))
            setResult(res.data)
            setConfirming(false)
            setStep(3)
            if (res.data?.created > 0) {
                toast.success(`${res.data.created} item${res.data.created === 1 ? '' : 's'} imported`)
                onComplete?.()
            } else if (res.data?.errorCount > 0) {
                toast.error('No items imported — see error list')
            }
        } catch (err) {
            toast.error(err.response?.data?.message || 'Import failed')
        } finally {
            setImporting(false)
        }
    }

    const onCreateClick = () => {
        if (noPrice > 0 || toCreate.length === 0) return
        if (unchecked > 0) setConfirming(true)
        else handleCreate()
    }

    const rowName = (n) => importedNames[n - 2] || ''

    const inputCls = 'w-full px-2 py-1.5 border border-gray-200 rounded-lg text-[13px] font-manrope focus:outline-none focus:border-[#FE8301]'

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="bg-white rounded-2xl w-full max-w-[1100px] max-h-[92vh] overflow-y-auto shadow-xl relative" role="dialog" aria-label="Scan my menu">
                <div className="flex items-center justify-between p-6 pb-4 border-b border-gray-100 sticky top-0 bg-white z-10">
                    <div>
                        <h2 className="text-[20px] font-bold text-[#1A181B] font-manrope">Import from photo or PDF</h2>
                        <p className="text-[13px] text-gray-500 font-manrope mt-1">
                            {step === 1 && 'Step 1 of 3 — upload your menu card'}
                            {step === 2 && 'Step 2 of 3 — check what we understood and fix mistakes'}
                            {step === 3 && 'Step 3 of 3 — result'}
                        </p>
                    </div>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors" aria-label="Close">
                        <X size={22} />
                    </button>
                </div>

                {/* ───────── Step 1: upload ───────── */}
                {step === 1 && (
                    <>
                        <div className="p-6 space-y-4">
                            <div
                                onClick={() => inputRef.current?.click()}
                                onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
                                onDragLeave={() => setDragOver(false)}
                                onDrop={(e) => { e.preventDefault(); setDragOver(false); addFiles(e.dataTransfer?.files) }}
                                className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${dragOver ? 'border-orange-400 bg-orange-50/60' : 'border-gray-300 hover:border-orange-400 hover:bg-orange-50/40'}`}
                            >
                                <input
                                    ref={inputRef}
                                    type="file"
                                    multiple
                                    accept={ACCEPT}
                                    className="hidden"
                                    aria-label="Menu photos or PDF"
                                    data-testid="scan-file-input"
                                    onChange={(e) => { addFiles(e.target.files); e.target.value = '' }}
                                />
                                <div className="flex flex-col items-center gap-2 text-gray-500">
                                    <Upload size={28} className="text-gray-400" />
                                    <p className="font-manrope font-semibold text-[14px]">Drop photos or a PDF here, or click to choose</p>
                                    <p className="font-manrope text-[12px]">Up to {MAX_FILES} files · JPG, PNG, WEBP or PDF · 10 MB each</p>
                                </div>
                            </div>
                            <p className="text-[13px] text-gray-600 font-manrope">
                                Blurry? That's okay — we'll tell you what to check. Good light and a straight photo read best.
                            </p>

                            {files.length > 0 && (
                                <ul className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
                                    {files.map((f) => (
                                        <li key={f.id} className="relative border border-gray-200 rounded-xl overflow-hidden bg-gray-50">
                                            {isPdf(f.file) ? (
                                                <div className="h-28 flex flex-col items-center justify-center gap-1 text-gray-500">
                                                    <FileText size={28} className="text-orange-500" />
                                                    <span className="text-[11px] font-manrope px-2 truncate max-w-full">{f.file.name}</span>
                                                </div>
                                            ) : (
                                                <img src={f.url} alt={f.file.name} className="h-28 w-full object-cover" />
                                            )}
                                            {smallWarnings[f.id] && (
                                                <p className="text-[11px] text-amber-700 bg-amber-50 px-2 py-1 font-manrope">Small photo — text may be hard to read</p>
                                            )}
                                            <button
                                                onClick={() => removeFile(f.id)}
                                                className="absolute top-1 right-1 bg-white/90 rounded-full p-1 text-gray-600 hover:text-red-600 shadow"
                                                aria-label={`Remove ${f.file.name}`}
                                            >
                                                <X size={14} />
                                            </button>
                                        </li>
                                    ))}
                                </ul>
                            )}

                            {scanning && (
                                <p className="text-[13px] text-gray-600 font-manrope flex items-center gap-2" role="status">
                                    <Loader size={14} className="animate-spin text-orange-500" />
                                    Reading your menu… this can take up to a minute
                                </p>
                            )}
                            {scanError && !scanning && (
                                <p className="text-[13px] text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2 font-manrope" role="alert">{scanError}</p>
                            )}
                        </div>
                        <div className="p-6 pt-2 flex gap-3">
                            <button
                                onClick={onClose}
                                disabled={scanning}
                                className="flex-1 py-3 rounded-xl border border-[#FE8301] text-[#FE8301] font-bold text-[15px] hover:bg-orange-50 transition-colors font-manrope disabled:opacity-50"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleScan}
                                disabled={!files.length || scanning}
                                className="flex-1 py-3 rounded-xl bg-[#FE8301] text-white font-bold text-[15px] hover:bg-orange-600 transition-colors font-manrope disabled:opacity-50 flex items-center justify-center gap-2"
                            >
                                {scanning && <Loader size={16} className="animate-spin" />}
                                {scanning ? 'Reading…' : 'Read my menu'}
                            </button>
                        </div>
                    </>
                )}

                {/* ───────── Step 2: preview & fix ───────── */}
                {step === 2 && (
                    <>
                        <div className="p-6 space-y-4">
                            <p className="text-[15px] font-bold text-[#1A181B] font-manrope" data-testid="scan-summary">
                                We found {rows.length} dish{rows.length === 1 ? '' : 'es'} in {categoryCount} categor{categoryCount === 1 ? 'y' : 'ies'}.{' '}
                                <span className={flaggedCount ? 'text-amber-600' : 'text-emerald-600'}>
                                    {flaggedCount} need{flaggedCount === 1 ? 's' : ''} your check.
                                </span>
                            </p>

                            {warnPages.length > 0 && (
                                <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] text-amber-800 font-manrope flex items-start gap-3">
                                    <AlertTriangle size={18} className="mt-0.5 shrink-0" />
                                    <div className="flex-1">
                                        {warnPages.map((p) => (
                                            <div key={p.index}>
                                                <span className="font-bold">{p.name || `Page ${p.index}`}:</span> {p.quality.warnings.join(' ')}
                                            </div>
                                        ))}
                                    </div>
                                    <button
                                        onClick={() => setStep(1)}
                                        className="shrink-0 px-3 py-1.5 rounded-lg border border-amber-400 text-amber-800 font-bold hover:bg-amber-100"
                                    >
                                        Choose different photos
                                    </button>
                                </div>
                            )}

                            <div className="flex flex-wrap items-center justify-between gap-2">
                                <button
                                    onClick={() => setNeedsFirst((v) => !v)}
                                    className="text-[13px] font-manrope text-[#FE8301] font-semibold hover:underline"
                                >
                                    Sort: {needsFirst ? 'needs check first' : 'original order'}
                                </button>
                                <button
                                    onClick={addRow}
                                    className="px-3 py-1.5 text-orange-500 font-bold border border-orange-500 rounded-xl hover:bg-orange-50 transition-colors font-manrope text-[13px] flex items-center gap-1.5"
                                >
                                    <Plus size={14} /> Add a missing dish
                                </button>
                            </div>

                            <div className="flex flex-col lg:flex-row gap-4 items-start">
                                <div className="w-full lg:flex-1 min-w-0 overflow-x-auto border border-gray-200 rounded-xl">
                                    <datalist id="scan-categories">
                                        {(scan?.categories || []).map((c) => <option key={c} value={c} />)}
                                    </datalist>
                                    <table className="w-full text-left min-w-[640px]">
                                        <thead className="bg-gray-50 text-[12px] text-gray-500 font-manrope">
                                            <tr>
                                                <th className="px-2 py-2 w-8"><span className="sr-only">Keep</span></th>
                                                <th className="px-2 py-2">Name</th>
                                                <th className="px-2 py-2">Category</th>
                                                <th className="px-2 py-2 w-24">Price</th>
                                                <th className="px-2 py-2 w-28">Type</th>
                                                <th className="px-2 py-2">Sizes</th>
                                                <th className="px-2 py-2 w-14">Conf.</th>
                                                <th className="px-2 py-2 w-8"><span className="sr-only">Delete</span></th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {displayRows.map((r, i) => {
                                                const n = i + 1
                                                const missingPrice = r.keep && !rowIsValid(r)
                                                return (
                                                    <tr
                                                        key={r.id}
                                                        data-testid="scan-row"
                                                        data-needs-check={r.needsCheck ? 'true' : 'false'}
                                                        onClick={() => setSelectedId(r.id)}
                                                        onFocusCapture={() => setSelectedId(r.id)}
                                                        className={`border-t border-gray-100 align-top border-l-4 ${r.needsCheck ? 'border-l-amber-400 bg-amber-50/60' : 'border-l-transparent'} ${selected?.id === r.id ? 'ring-1 ring-inset ring-orange-300' : ''} ${r.keep ? '' : 'opacity-50'}`}
                                                    >
                                                        <td className="px-2 py-2">
                                                            <input
                                                                type="checkbox"
                                                                checked={r.keep}
                                                                onChange={(e) => setRows((rs) => rs.map((x) => (x.id === r.id ? { ...x, keep: e.target.checked } : x)))}
                                                                aria-label={`Keep row ${n}`}
                                                            />
                                                        </td>
                                                        <td className="px-2 py-2">
                                                            <input
                                                                className={inputCls}
                                                                value={r.name}
                                                                onChange={(e) => patchRow(r.id, { name: e.target.value })}
                                                                aria-label={`Name for row ${n}`}
                                                            />
                                                            {r.issues.length > 0 && (
                                                                <p className="text-[11px] text-amber-700 font-manrope mt-1" title={r.issues.join('\n')}>
                                                                    {r.issues.join(' · ')}
                                                                </p>
                                                            )}
                                                        </td>
                                                        <td className="px-2 py-2">
                                                            <input
                                                                className={inputCls}
                                                                list="scan-categories"
                                                                value={r.category}
                                                                onChange={(e) => patchRow(r.id, { category: e.target.value })}
                                                                aria-label={`Category for row ${n}`}
                                                            />
                                                        </td>
                                                        <td className="px-2 py-2">
                                                            <input
                                                                className={`${inputCls} ${missingPrice ? 'border-red-300 bg-red-50' : ''}`}
                                                                type="number"
                                                                min="0"
                                                                step="any"
                                                                required
                                                                value={r.priceStr}
                                                                onChange={(e) => setPrice(r.id, e.target.value)}
                                                                aria-label={`Price for row ${n}`}
                                                            />
                                                            {r.priceText && r.basePrice == null && (
                                                                <p className="text-[11px] text-gray-500 font-manrope mt-1">Read as “{r.priceText}”</p>
                                                            )}
                                                        </td>
                                                        <td className="px-2 py-2">
                                                            <select
                                                                className={inputCls}
                                                                value={r.vegType}
                                                                onChange={(e) => patchRow(r.id, { vegType: e.target.value })}
                                                                aria-label={`Veg or non-veg for row ${n}`}
                                                            >
                                                                <option value="veg">Veg</option>
                                                                <option value="non-veg">Non-veg</option>
                                                            </select>
                                                        </td>
                                                        <td className="px-2 py-2">
                                                            <div className="flex flex-wrap gap-1">
                                                                {r.sizes.map((s, si) => (
                                                                    <span key={si} className="px-2 py-0.5 rounded-full bg-gray-100 text-[11px] font-manrope text-gray-700">
                                                                        {s.name} {s.price}
                                                                    </span>
                                                                ))}
                                                            </div>
                                                        </td>
                                                        <td className="px-2 py-2">
                                                            <span className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-bold font-manrope ${confBadge(r.confidence)}`}>
                                                                {Math.round((r.confidence ?? 1) * 100)}%
                                                            </span>
                                                        </td>
                                                        <td className="px-2 py-2">
                                                            <button
                                                                onClick={(e) => { e.stopPropagation(); deleteRow(r.id) }}
                                                                className="text-gray-400 hover:text-red-600"
                                                                aria-label={`Delete row ${n}`}
                                                            >
                                                                <Trash2 size={16} />
                                                            </button>
                                                        </td>
                                                    </tr>
                                                )
                                            })}
                                            {displayRows.length === 0 && (
                                                <tr><td colSpan={8} className="px-4 py-6 text-center text-[13px] text-gray-500 font-manrope">No dishes left. Add a missing dish or go back.</td></tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>

                                {/* Original image panel */}
                                <div className="w-full lg:w-[340px] shrink-0 lg:sticky lg:top-24 border border-gray-200 rounded-xl p-3 bg-gray-50">
                                    <p className="text-[12px] font-bold text-gray-600 font-manrope mb-2">
                                        Original{selected ? ` — page ${selected.page || 1}` : ''}
                                    </p>
                                    {!selected || !pageFile ? (
                                        <p className="text-[12px] text-gray-500 font-manrope">Select a row to see where it was on your menu.</p>
                                    ) : isPdf(pageFile.file) ? (
                                        <p className="text-[12px] text-gray-500 font-manrope">PDF page preview not available</p>
                                    ) : (
                                        <div className="relative inline-block max-w-full">
                                            <img src={pageFile.url} alt={`Menu page ${selected.page || 1}`} className="block max-w-full max-h-[480px] rounded-lg" />
                                            {selected.box && (
                                                <div
                                                    data-testid="scan-box"
                                                    className="absolute border-2 border-[#FE8301] bg-orange-400/20 rounded-sm pointer-events-none"
                                                    style={{
                                                        left: `${selected.box.x * 100}%`,
                                                        top: `${selected.box.y * 100}%`,
                                                        width: `${selected.box.w * 100}%`,
                                                        height: `${selected.box.h * 100}%`,
                                                    }}
                                                />
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        <div className="p-6 pt-2 border-t border-gray-100">
                            {confirming ? (
                                <div className="flex flex-wrap items-center gap-3 justify-between" role="alertdialog" aria-label="Confirm create">
                                    <p className="text-[14px] font-manrope font-semibold text-amber-800">
                                        {unchecked} row{unchecked === 1 ? ' was' : 's were'} never checked. Create anyway?
                                    </p>
                                    <div className="flex gap-3">
                                        <button
                                            onClick={() => setConfirming(false)}
                                            disabled={importing}
                                            className="px-5 py-2.5 rounded-xl border border-[#FE8301] text-[#FE8301] font-bold text-[14px] hover:bg-orange-50 font-manrope disabled:opacity-50"
                                        >
                                            Cancel
                                        </button>
                                        <button
                                            onClick={handleCreate}
                                            disabled={importing}
                                            className="px-5 py-2.5 rounded-xl bg-[#FE8301] text-white font-bold text-[14px] hover:bg-orange-600 font-manrope disabled:opacity-50 flex items-center gap-2"
                                        >
                                            {importing && <Loader size={16} className="animate-spin" />}
                                            Create anyway
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <div className="flex flex-wrap items-center gap-3 justify-between">
                                    <div className="text-[13px] font-manrope">
                                        <p className="font-semibold text-[#1A181B]">{toCreate.length} dish{toCreate.length === 1 ? '' : 'es'} will be created</p>
                                        {noPrice > 0 && (
                                            <p className="text-red-600">Fix {noPrice} row{noPrice === 1 ? '' : 's'} without a price (or name)</p>
                                        )}
                                    </div>
                                    <div className="flex gap-3">
                                        <button
                                            onClick={() => setStep(1)}
                                            disabled={importing}
                                            className="px-5 py-2.5 rounded-xl border border-[#FE8301] text-[#FE8301] font-bold text-[14px] hover:bg-orange-50 font-manrope disabled:opacity-50 flex items-center gap-2"
                                        >
                                            <ArrowLeft size={16} /> Back
                                        </button>
                                        <button
                                            onClick={onCreateClick}
                                            disabled={noPrice > 0 || toCreate.length === 0 || importing}
                                            className="px-5 py-2.5 rounded-xl bg-[#FE8301] text-white font-bold text-[14px] hover:bg-orange-600 font-manrope disabled:opacity-50 flex items-center gap-2"
                                        >
                                            {importing && <Loader size={16} className="animate-spin" />}
                                            Create menu ({toCreate.length} dishes)
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    </>
                )}

                {/* ───────── Step 3: result ───────── */}
                {step === 3 && result && (
                    <>
                        <div className="p-6 space-y-4">
                            <div className="rounded-xl border border-gray-200 overflow-hidden">
                                <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 flex items-center gap-2">
                                    <CheckCircle size={18} className="text-emerald-600" />
                                    <span className="font-manrope font-bold text-[14px] text-[#1A181B]">{result.created} created</span>
                                    {result.skippedCount > 0 && (
                                        <span className="ml-2 text-[13px] text-[#6B7280] font-manrope" title="Rows whose dish already exists in that category">
                                            {result.skippedCount} skipped (already exist)
                                        </span>
                                    )}
                                    {result.errorCount > 0 && (
                                        <span className="ml-2 inline-flex items-center gap-1 text-[13px] text-red-600 font-manrope">
                                            <AlertTriangle size={14} />
                                            {result.errorCount} error{result.errorCount === 1 ? '' : 's'}
                                        </span>
                                    )}
                                </div>
                                {Array.isArray(result.errors) && result.errors.length > 0 && (
                                    <ul className="max-h-[260px] overflow-y-auto divide-y divide-gray-100">
                                        {result.errors.map((e, i) => (
                                            <li key={i} className="px-4 py-2.5 text-[13px] font-manrope">
                                                <span className="font-bold text-red-600">Row {e.row}{rowName(e.row) ? ` (${rowName(e.row)})` : ''}:</span>{' '}
                                                <span className="text-[#1A181B]">{e.message}</span>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </div>
                        </div>
                        <div className="p-6 pt-2 flex gap-3">
                            <button
                                onClick={onClose}
                                className="flex-1 py-3 rounded-xl bg-[#FE8301] text-white font-bold text-[15px] hover:bg-orange-600 transition-colors font-manrope"
                            >
                                Close
                            </button>
                        </div>
                    </>
                )}
            </div>
        </div>
    )
}

export default ScanMenuModal
