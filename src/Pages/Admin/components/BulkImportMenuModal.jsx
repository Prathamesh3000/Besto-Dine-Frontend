import React, { useState, useRef } from 'react'
import { X, Upload, Download, FileText, AlertTriangle, CheckCircle, Loader } from 'lucide-react'
import api from '../../../utils/api'
import toast from 'react-hot-toast'

// ADM-041 — CSV bulk-import modal. Reads the CSV via FormData (multer
// memoryStorage on the backend), then renders a per-row error report
// from the controller's `{ created, errors }` response.
//
// Template is served by GET /menu/template — same master-template
// pattern Tables/Staff/Inventory/Recipes use. The server file ships
// 170+ menu items across 14 categories (Starters, Main Course, Pizza,
// Pasta, Chinese, Burgers, Sandwiches, Soups, Beverages, Desserts,
// Breads, South Indian, Rice and Biryani, Healthy Bowls) sorted
// category-wise so admins delete what they don't sell and upload.

const BulkImportMenuModal = ({ onClose, onComplete }) => {
    const [file, setFile] = useState(null)
    const [busy, setBusy] = useState(false)
    const [result, setResult] = useState(null) // { created, errorCount, errors }
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
            // Axios was created with a default `Content-Type: application/json`
            // header — left as-is, axios won't override it for FormData and
            // multer sees no multipart boundary → 400 "CSV file is required".
            // Setting it to `undefined` lets axios fill in
            // `multipart/form-data; boundary=...` itself. Same workaround
            // BulkImportInventoryModal / BulkImportRecipesModal use.
            const res = await api.post('/menu/import', fd, {
                headers: { 'Content-Type': undefined },
            })
            setResult(res.data)
            if (res.data?.created > 0) {
                toast.success(`${res.data.created} item${res.data.created === 1 ? '' : 's'} imported`)
                onComplete?.()
            } else if (res.data?.errorCount > 0) {
                toast.error('No items imported — see error list')
            }
        } catch (err) {
            toast.error(err.response?.data?.message || 'Import failed')
        } finally {
            setBusy(false)
        }
    }

    const handleDownloadTemplate = async () => {
        try {
            const res = await api.get('/menu/template', { responseType: 'blob' })
            const blob = new Blob([res.data], { type: 'text/csv;charset=utf-8' })
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            a.download = 'menuItem-master-template.csv'
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
            <div className="bg-white rounded-2xl w-full max-w-[560px] max-h-[90vh] overflow-y-auto shadow-xl relative">
                <div className="flex items-center justify-between p-6 pb-4 border-b border-gray-100">
                    <div>
                        <h2 className="text-[20px] font-bold text-[#1A181B] font-manrope">Import Menu from CSV</h2>
                        <p className="text-[13px] text-gray-500 font-manrope mt-1">Bulk-create menu items. Categories auto-created on first use.</p>
                    </div>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors" aria-label="Close">
                        <X size={22} />
                    </button>
                </div>

                <div className="p-6 space-y-4">
                    {/* Template download */}
                    <button
                        onClick={handleDownloadTemplate}
                        className="w-full flex items-center justify-between gap-3 px-4 py-3 border border-orange-200 bg-orange-50 rounded-xl hover:bg-orange-100 transition-colors"
                    >
                        <div className="flex items-center gap-3">
                            <Download size={18} className="text-orange-600" />
                            <div className="text-left">
                                <p className="text-[14px] font-bold text-[#1A181B] font-manrope">Download master template</p>
                                <p className="text-[12px] text-gray-600 font-manrope">170+ pre-filled menu items across 14 categories (Starters, Main Course, Pizza, Pasta, Chinese, Burgers, Sandwiches, Soups, Beverages, Desserts, Breads, South Indian, Rice & Biryani, Healthy Bowls). Delete what you don't sell and upload.</p>
                            </div>
                        </div>
                    </button>

                    {/* File picker */}
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

                    {/* Results */}
                    {result && (
                        <div className="rounded-xl border border-gray-200 overflow-hidden">
                            <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 flex items-center gap-2">
                                <CheckCircle size={18} className="text-emerald-600" />
                                <span className="font-manrope font-bold text-[14px] text-[#1A181B]">
                                    {result.created} created
                                </span>
                                {result.errorCount > 0 && (
                                    <span className="ml-2 inline-flex items-center gap-1 text-[13px] text-red-600 font-manrope">
                                        <AlertTriangle size={14} />
                                        {result.errorCount} error{result.errorCount === 1 ? '' : 's'}
                                    </span>
                                )}
                            </div>
                            {Array.isArray(result.errors) && result.errors.length > 0 && (
                                <ul className="max-h-[200px] overflow-y-auto divide-y divide-gray-100">
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

export default BulkImportMenuModal
