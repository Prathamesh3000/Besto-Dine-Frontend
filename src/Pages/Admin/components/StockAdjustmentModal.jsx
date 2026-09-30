import React, { useState } from 'react'
import { X, ArrowUpCircle, ArrowDownCircle, AlertTriangle, RotateCcw, Undo2 } from 'lucide-react'

const ADJUSTMENT_TYPES = [
    { value: 'restock', label: 'Restock', icon: ArrowUpCircle, color: 'text-green-600', bg: 'bg-green-50 border-green-200', desc: 'Add new stock from supplier' },
    { value: 'usage', label: 'Usage', icon: ArrowDownCircle, color: 'text-blue-600', bg: 'bg-blue-50 border-blue-200', desc: 'Deduct stock used in operations' },
    { value: 'waste', label: 'Waste', icon: AlertTriangle, color: 'text-red-600', bg: 'bg-red-50 border-red-200', desc: 'Record spoiled or damaged stock' },
    { value: 'return', label: 'Return', icon: Undo2, color: 'text-amber-600', bg: 'bg-amber-50 border-amber-200', desc: 'Returned items back to stock' },
    { value: 'correction', label: 'Correction', icon: RotateCcw, color: 'text-purple-600', bg: 'bg-purple-50 border-purple-200', desc: 'Set stock to exact count (e.g., after audit)' },
]

// Spec 10.7 — structured wastage reasons. Picked from a dropdown instead
// of free text so wastage reports can group by cause.
const WASTE_REASONS = ['Expired', 'Spillage', 'Overcooked', 'Spoiled', 'Breakage', 'Contaminated', 'Pest / Damage', 'Other']

const StockAdjustmentModal = ({ item, onClose, onSubmit }) => {
    const [type, setType] = useState('')
    const [quantity, setQuantity] = useState('')
    const [reason, setReason] = useState('')
    // Wastage-only structured fields (Spec 10.7).
    const [wasteReason, setWasteReason] = useState('')
    const [approvedBy, setApprovedBy] = useState('')
    const [submitting, setSubmitting] = useState(false)
    // Inline errors. Live preview (isInvalid / exceedsMax below) covers
    // the math errors; these two cover required-field violations the
    // user only learns about when they click Save.
    const [errors, setErrors] = useState({})

    const selectedType = ADJUSTMENT_TYPES.find(t => t.value === type)

    const getPreview = () => {
        if (!type || !quantity || Number(quantity) <= 0) return null
        const qty = Number(quantity)
        const current = item.currentStock
        if (type === 'correction') return qty
        if (type === 'restock' || type === 'return') return current + qty
        return current - qty
    }

    const preview = getPreview()
    const isInvalid = preview !== null && preview < 0
    const exceedsMax = preview !== null && item.maxStock > 0 && (type === 'restock' || type === 'return') && preview > item.maxStock

    const handleSubmit = async (e) => {
        e.preventDefault()
        const errs = {}
        if (!type)                                        errs.type = 'Select an adjustment type'
        if (!quantity || Number(quantity) <= 0)           errs.quantity = 'Enter a quantity greater than zero'
        if (type === 'waste' && !wasteReason)             errs.wasteReason = 'Select a wastage reason'
        setErrors(errs)
        if (Object.keys(errs).length || isInvalid || exceedsMax) {
            // Focus the first invalid field that has a focusable element.
            // (Type buttons aren't single-focus; quantity is.)
            if (errs.quantity || isInvalid || exceedsMax) {
                setTimeout(() => {
                    const el = document.getElementById('quantity')
                    if (el) { try { el.focus() } catch { /* noop */ } }
                }, 0)
            }
            return
        }
        // For wastage, fold the structured fields into the reason string
        // (kept in adjustmentHistory). adjustedBy is auto-stamped server-side.
        let finalReason = reason.trim()
        if (type === 'waste') {
            const parts = [wasteReason]
            if (approvedBy.trim()) parts.push(`Approved by: ${approvedBy.trim()}`)
            if (reason.trim()) parts.push(reason.trim())
            finalReason = parts.join(' · ').slice(0, 500)
        }

        setSubmitting(true)
        try {
            await onSubmit({ type, quantity: Number(quantity), reason: finalReason })
        } finally {
            setSubmitting(false)
        }
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-[2px]">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-[520px] mx-4">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
                    <div>
                        <h2 className="font-manrope font-[700] text-[18px] text-[#1A181B]">Adjust Stock</h2>
                        <p className="text-[13px] text-gray-400 mt-0.5">
                            {item.name} — Current: <span className="font-[600] text-gray-600">{item.currentStock} {item.unit}</span>
                        </p>
                    </div>
                    <button
                        onClick={onClose}
                        disabled={submitting}
                        aria-label="Close"
                        title={submitting ? 'Wait for save to finish' : 'Close'}
                        className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                        <X size={20} />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="px-6 py-5 space-y-5">
                    {/* Type Selection */}
                    <div
                        role="radiogroup"
                        aria-label="Adjustment type"
                        aria-invalid={errors.type ? 'true' : 'false'}
                        aria-describedby={errors.type ? 'type-err' : undefined}
                        className={`grid grid-cols-2 gap-2.5 sm:grid-cols-3 ${errors.type ? 'rounded-xl ring-1 ring-red-400 p-1' : ''}`}
                    >
                        {ADJUSTMENT_TYPES.map(t => {
                            const Icon = t.icon
                            const isSelected = type === t.value
                            return (
                                <button
                                    type="button"
                                    role="radio"
                                    aria-checked={isSelected}
                                    key={t.value}
                                    onClick={() => {
                                        setType(t.value)
                                        if (errors.type) setErrors(prev => ({ ...prev, type: undefined }))
                                    }}
                                    className={`flex flex-col items-center gap-1.5 px-3 py-3 rounded-xl border text-[12px] font-semibold transition-all ${isSelected ? `${t.bg} ring-2 ring-offset-1 ring-current ${t.color}` : 'border-gray-200 text-gray-500 hover:border-gray-300 hover:bg-gray-50'}`}
                                >
                                    <Icon size={20} />
                                    {t.label}
                                </button>
                            )
                        })}
                    </div>
                    {errors.type && (
                        <p id="type-err" role="alert" className="text-xs text-red-600 -mt-2 flex items-center gap-1">
                            <span aria-hidden="true">⚠</span>{errors.type}
                        </p>
                    )}

                    {selectedType && (
                        <p className="text-[12px] text-gray-400 -mt-2">{selectedType.desc}</p>
                    )}

                    {/* Quantity */}
                    <div>
                        <label htmlFor="quantity" className="block text-[13px] font-semibold text-gray-600 mb-1.5">
                            {type === 'correction' ? 'New stock level' : 'Quantity'} ({item.unit}) <span className="text-red-500" aria-hidden="true">*</span>
                        </label>
                        <input
                            id="quantity"
                            type="number"
                            min="0"
                            step="any"
                            inputMode="decimal"
                            value={quantity}
                            onChange={(e) => {
                                setQuantity(e.target.value)
                                if (errors.quantity) setErrors(prev => ({ ...prev, quantity: undefined }))
                            }}
                            placeholder={type === 'correction' ? 'Exact stock count after audit' : `Quantity in ${item.unit}`}
                            aria-required="true"
                            aria-invalid={errors.quantity ? 'true' : 'false'}
                            aria-describedby={errors.quantity ? 'quantity-err' : undefined}
                            className={`w-full px-4 py-3 bg-white border rounded-xl focus:outline-none focus:ring-2 transition-all text-[14px] font-medium text-gray-700 placeholder:text-gray-400 ${errors.quantity ? 'border-red-400 focus:border-red-500 focus:ring-red-200' : 'border-gray-200 focus:border-orange-500 focus:ring-orange-500/10'}`}
                        />
                        {errors.quantity && (
                            <p id="quantity-err" role="alert" className="text-xs text-red-600 mt-1 flex items-center gap-1">
                                <span aria-hidden="true">⚠</span>{errors.quantity}
                            </p>
                        )}
                    </div>

                    {/* Preview */}
                    {preview !== null && (
                        <div className={`flex items-center justify-between px-4 py-3 rounded-xl border ${isInvalid || exceedsMax ? 'bg-red-50 border-red-200' : 'bg-gray-50 border-gray-200'}`}>
                            <span className="text-[13px] text-gray-500">New Stock Level:</span>
                            <span className={`font-[700] text-[15px] ${isInvalid || exceedsMax ? 'text-red-600' : 'text-gray-800'}`}>
                                {preview} {item.unit}
                            </span>
                        </div>
                    )}
                    {isInvalid && (
                        <p className="text-[12px] text-red-500 -mt-3">Cannot deduct more than available stock</p>
                    )}
                    {exceedsMax && (
                        <p className="text-[12px] text-red-500 -mt-3">Exceeds max stock limit of {item.maxStock} {item.unit}</p>
                    )}

                    {/* Wastage-only structured fields (Spec 10.7) */}
                    {type === 'waste' && (
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label htmlFor="wasteReason" className="block text-[13px] font-semibold text-gray-600 mb-1.5">
                                    Wastage reason <span className="text-red-500" aria-hidden="true">*</span>
                                </label>
                                <select
                                    id="wasteReason"
                                    value={wasteReason}
                                    onChange={(e) => {
                                        setWasteReason(e.target.value)
                                        if (errors.wasteReason) setErrors(prev => ({ ...prev, wasteReason: undefined }))
                                    }}
                                    aria-required="true"
                                    aria-invalid={errors.wasteReason ? 'true' : 'false'}
                                    aria-describedby={errors.wasteReason ? 'wasteReason-err' : undefined}
                                    className={`w-full px-4 py-3 bg-white border rounded-xl focus:outline-none focus:ring-2 transition-all text-[14px] font-medium text-gray-700 ${errors.wasteReason ? 'border-red-400 focus:border-red-500 focus:ring-red-200' : 'border-gray-200 focus:border-orange-500 focus:ring-orange-500/10'}`}
                                >
                                    <option value="">— Select reason —</option>
                                    {WASTE_REASONS.map(r => <option key={r} value={r}>{r}</option>)}
                                </select>
                                {errors.wasteReason && (
                                    <p id="wasteReason-err" role="alert" className="text-xs text-red-600 mt-1 flex items-center gap-1">
                                        <span aria-hidden="true">⚠</span>{errors.wasteReason}
                                    </p>
                                )}
                            </div>
                            <div>
                                <label htmlFor="approvedBy" className="block text-[13px] font-semibold text-gray-600 mb-1.5">
                                    Approved by <span className="text-gray-400 font-normal">(optional)</span>
                                </label>
                                <input
                                    id="approvedBy"
                                    type="text"
                                    value={approvedBy}
                                    onChange={(e) => setApprovedBy(e.target.value)}
                                    placeholder="Manager / supervisor name"
                                    maxLength={80}
                                    className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/10 transition-all text-[14px] font-medium text-gray-700 placeholder:text-gray-400"
                                />
                            </div>
                        </div>
                    )}

                    {/* Reason / note */}
                    <div>
                        <label htmlFor="reason" className="block text-[13px] font-semibold text-gray-600 mb-1.5">
                            {type === 'waste' ? 'Additional note' : 'Reason'} <span className="text-gray-400 font-normal">(optional)</span>
                        </label>
                        <textarea
                            id="reason"
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                            placeholder="e.g. Weekly supplier delivery, Spoiled batch, Inventory audit on 15-May"
                            rows={2}
                            className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/10 transition-all text-[14px] font-medium text-gray-700 placeholder:text-gray-400 resize-none"
                        />
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-3 pt-2 border-t border-gray-100">
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex-1 px-5 py-3 border border-gray-200 text-gray-600 rounded-xl text-[14px] font-[600] hover:bg-gray-50 transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={submitting || isInvalid || exceedsMax}
                            aria-busy={submitting ? 'true' : 'false'}
                            className="flex-1 px-5 py-3 bg-[#FE8301] text-white rounded-xl text-[14px] font-semibold hover:bg-orange-600 transition-colors shadow-sm disabled:opacity-60 disabled:cursor-not-allowed"
                        >
                            {submitting ? 'Saving…' : 'Confirm adjustment'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    )
}

export default StockAdjustmentModal
