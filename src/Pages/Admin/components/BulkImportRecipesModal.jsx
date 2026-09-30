import React, { useState, useRef } from 'react'
import { X, Upload, Download, FileText, AlertTriangle, CheckCircle, Loader } from 'lucide-react'
import api from '../../../utils/api'
import toast from 'react-hot-toast'

// CSV bulk-import modal for /admin/inventory → Recipes tab. Mirrors
// BulkImportInventoryModal: download master template → pick file →
// upload → see per-row error report. The backend endpoint groups rows
// by menuItemName and UPSERTS by (menuItem, tenant, branch), so re-
// uploading the same CSV overwrites the existing recipe's ingredients
// list rather than rejecting the row.
const BulkImportRecipesModal = ({ onClose, onComplete }) => {
    const [file, setFile] = useState(null)
    const [busy, setBusy] = useState(false)
    const [result, setResult] = useState(null) // { created, updated, errorCount, errors }
    const fileInputRef = useRef(null)

    const handlePick = (e) => {
        const f = e.target.files?.[0]
        if (!f) return
        if (!f.name.toLowerCase().endsWith('.csv')) {
            toast.error('Please choose a .csv file')
            return
        }
        setFile(f)
        setResult(null)
    }

    const handleUpload = async () => {
        if (!file) return
        setBusy(true)
        setResult(null)
        try {
            const fd = new FormData()
            fd.append('file', file)
            // Same axios multipart workaround as the Inventory CSV modal —
            // clear the default JSON Content-Type so axios fills in the
            // multipart boundary header itself; otherwise multer can't
            // parse the upload.
            const res = await api.post('/inventory/recipes/import', fd, {
                headers: { 'Content-Type': undefined },
            })
            setResult(res.data)
            const total = (res.data?.created || 0) + (res.data?.updated || 0)
            if (total > 0) {
                toast.success(`${res.data.created} created, ${res.data.updated} updated`)
                onComplete?.()
            } else if (res.data?.errorCount > 0) {
                toast.error('No recipes imported — see error list')
            }
        } catch (err) {
            toast.error(err.response?.data?.message || 'Import failed')
        } finally {
            setBusy(false)
        }
    }

    const handleDownloadTemplate = async () => {
        try {
            const res = await api.get('/inventory/recipes/template', { responseType: 'blob' })
            const blob = new Blob([res.data], { type: 'text/csv;charset=utf-8' })
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            a.download = 'recipes-master-template.csv'
            document.body.appendChild(a)
            a.click()
            document.body.removeChild(a)
            URL.revokeObjectURL(url)
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to download template')
        }
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="bg-white rounded-2xl w-full max-w-[600px] max-h-[90vh] overflow-y-auto shadow-xl relative">
                <div className="flex items-center justify-between p-6 pb-4 border-b border-gray-100">
                    <div>
                        <h2 className="text-[20px] font-bold text-[#1A181B] font-manrope">Import Recipes from CSV</h2>
                        <p className="text-[13px] text-gray-500 font-manrope mt-1">
                            One row per ingredient. Rows sharing the same <span className="font-semibold">menuItemName</span> are
                            combined into one recipe.
                        </p>
                    </div>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors" aria-label="Close">
                        <X size={22} />
                    </button>
                </div>

                <div className="p-6 space-y-4">
                    <button
                        onClick={handleDownloadTemplate}
                        className="w-full flex items-center justify-between gap-3 px-4 py-3 border border-orange-200 bg-orange-50 rounded-xl hover:bg-orange-100 transition-colors"
                    >
                        <div className="flex items-center gap-3">
                            <Download size={18} className="text-orange-600" />
                            <div className="text-left">
                                <p className="text-[14px] font-bold text-[#1A181B] font-manrope">Download master template</p>
                                <p className="text-[12px] text-gray-600 font-manrope">
                                    110+ ready-made cafe recipes covering Indian, Chinese, Continental, breakfast, breads, beverages, desserts. Delete what you don't need and edit quantities.
                                </p>
                            </div>
                        </div>
                    </button>

                    <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-[12px] text-gray-600 font-manrope leading-relaxed">
                        <p className="font-semibold text-gray-700 mb-1">CSV columns</p>
                        <p>
                            <span className="font-semibold">Required:</span> menuItemName, inventoryItemName, quantity, unit
                            <br />
                            <span className="font-semibold">Optional:</span> yield (defaults to 1), notes
                        </p>
                        <p className="mt-2 text-gray-500">
                            menuItemName and inventoryItemName are matched case-insensitively against your existing
                            menu and inventory. Import inventory first if the items don't exist yet.
                        </p>
                    </div>

                    <div
                        onClick={() => fileInputRef.current?.click()}
                        className="border-2 border-dashed border-gray-300 rounded-xl p-6 text-center cursor-pointer hover:border-orange-400 hover:bg-orange-50/40 transition-colors"
                    >
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept=".csv,text/csv"
                            className="hidden"
                            onChange={handlePick}
                        />
                        {file ? (
                            <div className="flex items-center justify-center gap-2 text-[#1A181B]">
                                <FileText size={20} className="text-orange-500" />
                                <span className="font-manrope font-semibold text-[14px]">{file.name}</span>
                                <span className="text-gray-400 text-[12px]">({(file.size / 1024).toFixed(1)} KB)</span>
                            </div>
                        ) : (
                            <div className="flex flex-col items-center gap-2 text-gray-500">
                                <Upload size={28} className="text-gray-400" />
                                <p className="font-manrope font-semibold text-[14px]">Click to select a .csv file</p>
                                <p className="font-manrope text-[12px]">Max 2 MB</p>
                            </div>
                        )}
                    </div>

                    {result && (
                        <div className="rounded-xl border border-gray-200 overflow-hidden">
                            <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 flex items-center gap-2 flex-wrap">
                                <CheckCircle size={18} className="text-emerald-600" />
                                <span className="font-manrope font-bold text-[14px] text-[#1A181B]">
                                    {result.created} created
                                </span>
                                <span className="text-gray-300">·</span>
                                <span className="font-manrope font-bold text-[14px] text-[#1A181B]">
                                    {result.updated} updated
                                </span>
                                {result.errorCount > 0 && (
                                    <span className="ml-2 inline-flex items-center gap-1 text-[13px] text-red-600 font-manrope">
                                        <AlertTriangle size={14} />
                                        {result.errorCount} error{result.errorCount === 1 ? '' : 's'}
                                    </span>
                                )}
                            </div>
                            {Array.isArray(result.errors) && result.errors.length > 0 && (
                                <ul className="max-h-[240px] overflow-y-auto divide-y divide-gray-100">
                                    {result.errors.map((e, i) => (
                                        <li key={i} className="px-4 py-2.5 text-[13px] font-manrope">
                                            <span className="font-bold text-red-600">Row {e.row}:</span>{' '}
                                            <span className="text-[#1A181B]">{e.message}</span>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    )}
                </div>

                <div className="p-6 pt-2 flex gap-3">
                    <button
                        onClick={onClose}
                        disabled={busy}
                        className="flex-1 py-3 rounded-xl border border-[#FE8301] text-[#FE8301] font-bold text-[15px] hover:bg-orange-50 transition-colors font-manrope disabled:opacity-50"
                    >
                        {result ? 'Close' : 'Cancel'}
                    </button>
                    <button
                        onClick={handleUpload}
                        disabled={!file || busy}
                        className="flex-1 py-3 rounded-xl bg-[#FE8301] text-white font-bold text-[15px] hover:bg-orange-600 transition-colors font-manrope disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                        {busy && <Loader size={16} className="animate-spin" />}
                        {busy ? 'Importing...' : 'Import'}
                    </button>
                </div>
            </div>
        </div>
    )
}

export default BulkImportRecipesModal
