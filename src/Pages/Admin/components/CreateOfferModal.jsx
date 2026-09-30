import React, { useState } from 'react'
import { X, ChevronDown, CheckCircle2, Loader2 } from 'lucide-react'

const EMPTY_FORM = {
    title: '',
    code: '',
    description: '',
    discountType: 'Percentage',
    discount: '',
    minOrder: '',
    maxDiscount: '',
    validFrom: '',
    validTill: '',
    startTime: '',
    endTime: '',
    status: 'Active',
    items: 'All Items',
}

const CreateOfferModal = ({ isOpen, onClose, onSave, saving }) => {
    const [form, setForm] = useState(EMPTY_FORM)
    // Per-field validation errors. Keys match input ids.
    const [errors, setErrors] = useState({})

    if (!isOpen) return null

    const set = (key) => (e) => {
        setForm(prev => ({ ...prev, [key]: e.target.value }))
        // Clear that field's error the moment the user edits it.
        if (errors[key]) setErrors(prev => ({ ...prev, [key]: undefined }))
    }

    // Reusable field renderer. `error` toggles a red border + wires
    // aria-invalid / aria-describedby pointing at the inline error <p>.
    const field = (label, key, placeholder, type = 'text', required = false) => (
        <div>
            <label htmlFor={key} className="block text-[13px] font-medium text-[#1A181B] mb-1.5 font-manrope">
                {label}{required && <span className="text-red-500 ml-0.5" aria-hidden="true">*</span>}
            </label>
            <input
                id={key}
                name={key}
                type={type}
                value={form[key] || ''}
                onChange={set(key)}
                placeholder={placeholder}
                aria-required={required ? 'true' : undefined}
                aria-invalid={errors[key] ? 'true' : 'false'}
                aria-describedby={errors[key] ? `${key}-err` : undefined}
                className={`w-full h-11 px-4 rounded-xl border bg-white text-[13px] outline-none transition-colors font-manrope ${
                    errors[key] ? 'border-red-400 focus:border-red-500' : 'border-gray-200 focus:border-[#FE8301]'
                }`}
            />
            {errors[key] && (
                <p id={`${key}-err`} role="alert" className="text-xs text-red-600 mt-1 flex items-center gap-1 font-manrope">
                    <span aria-hidden="true">⚠</span>{errors[key]}
                </p>
            )}
        </div>
    )

    const validate = () => {
        const e = {}
        if (!form.title.trim())                                             e.title = 'Offer name is required'
        if (!form.code.trim())                                              e.code = 'Promo code is required'
        else if (!/^[A-Z0-9_-]{2,20}$/i.test(form.code.trim()))             e.code = 'Use 2–20 letters, numbers, dashes or underscores'
        const disc = Number(form.discount)
        if (form.discount === '' || isNaN(disc) || disc <= 0)               e.discount = 'Discount must be greater than zero'
        else if (form.discountType === 'Percentage' && disc > 100)          e.discount = 'Percentage cannot exceed 100'
        if (!form.validFrom)                                                e.validFrom = 'Start date is required'
        if (!form.validTill)                                                e.validTill = 'End date is required'
        else if (form.validFrom && form.validTill < form.validFrom)         e.validTill = 'End date cannot be before start date'
        return e
    }

    const handleSubmit = () => {
        const errs = validate()
        setErrors(errs)
        if (Object.keys(errs).length) {
            // Focus the first invalid field so the user lands on the problem.
            const order = ['title', 'code', 'discount', 'validFrom', 'validTill']
            const firstBad = order.find(k => errs[k])
            if (firstBad) {
                setTimeout(() => {
                    const el = document.getElementById(firstBad)
                    if (el) { try { el.focus() } catch { /* noop */ } el.scrollIntoView?.({ behavior: 'smooth', block: 'center' }) }
                }, 0)
            }
            return
        }
        if (onSave) {
            onSave(form, () => { setForm(EMPTY_FORM); setErrors({}) })
        }
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop click closes the modal only when we're idle. While
                a publish is in flight, ignoring the click prevents leaving
                the user staring at a stale offers list with the new offer
                half-saved on the server. */}
            <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={saving ? undefined : onClose} />
            <div className="relative bg-white rounded-3xl shadow-2xl w-full max-w-175 max-h-[90vh] flex flex-col animate-in zoom-in-95 duration-200 overflow-hidden">

                {/* Header */}
                <div className="px-8 py-5 border-b border-gray-100 flex items-center justify-between bg-[#FCFBFA]">
                    <div>
                        <h2 className="text-[20px] font-bold text-[#1A181B] font-manrope leading-tight">Create new offer</h2>
                        <p className="text-[12px] font-normal text-gray-500 font-manrope mt-1">Configure your promotion details below</p>
                    </div>
                    <button
                        onClick={onClose}
                        disabled={saving}
                        aria-label="Close"
                        title={saving ? 'Wait for save to finish' : 'Close'}
                        className="p-2 hover:bg-gray-100 rounded-full transition-colors text-gray-400 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                        <X size={22} />
                    </button>
                </div>

                {/* Form Body */}
                <div className="flex-1 overflow-y-auto p-8 space-y-8">

                    {/* Basic Information */}
                    <div className="space-y-4">
                        <div className="flex items-center gap-2 mb-1">
                            <div className="w-1.5 h-4 bg-[#FE8301] rounded-full" />
                            <h3 className="text-[14px] font-bold text-[#1A181B] uppercase tracking-wider font-manrope">Basic information</h3>
                        </div>
                        <div className="grid grid-cols-2 gap-5">
                            {field('Offer name', 'title', 'e.g. Festival Special, Weekday Lunch 20%', 'text', true)}
                            {field('Promo code', 'code', 'e.g. FEST20', 'text', true)}
                            <div className="col-span-2">
                                <label htmlFor="description" className="block text-[13px] font-medium text-[#1A181B] mb-1.5 font-manrope">
                                    Description <span className="text-gray-400 font-normal">(optional)</span>
                                </label>
                                <textarea
                                    id="description"
                                    value={form.description}
                                    onChange={set('description')}
                                    placeholder="Short note shown to customers when they apply the code"
                                    rows={3}
                                    className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-white text-[13px] outline-none focus:border-[#FE8301] transition-colors resize-none font-manrope"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Discount Configuration */}
                    <div className="space-y-4">
                        <div className="flex items-center gap-2 mb-1">
                            <div className="w-1.5 h-4 bg-[#9333EA] rounded-full" />
                            <h3 className="text-[14px] font-bold text-[#1A181B] uppercase tracking-wider font-manrope">Discount & limits</h3>
                        </div>
                        <div className="grid grid-cols-2 gap-5 bg-[#FAF9FF] p-6 rounded-[20px] border border-[#F3F0FF]">
                            <div>
                                <label htmlFor="discountType" className="block text-[13px] font-medium text-[#1A181B] mb-1.5 font-manrope">Discount type</label>
                                <div className="relative">
                                    <select
                                        id="discountType"
                                        className="w-full h-11 px-4 rounded-xl border border-gray-200 bg-white text-[13px] outline-none focus:border-[#FE8301] appearance-none transition-colors font-manrope"
                                        value={form.discountType}
                                        onChange={set('discountType')}
                                    >
                                        <option>Percentage</option>
                                        <option>Fixed Amount</option>
                                    </select>
                                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" size={16} />
                                </div>
                            </div>
                            {field('Discount value', 'discount', form.discountType === 'Percentage' ? '20' : '100', 'number', true)}
                            {field('Min. order value (₹)', 'minOrder', '500', 'number')}
                            {field('Max. discount (₹)', 'maxDiscount', '200', 'number')}
                        </div>
                    </div>

                    {/* Validity & Scheduling */}
                    <div className="space-y-4">
                        <div className="flex items-center gap-2 mb-1">
                            <div className="w-1.5 h-4 bg-[#22C55E] rounded-full" />
                            <h3 className="text-[14px] font-bold text-[#1A181B] uppercase tracking-wider font-manrope">Validity & scheduling</h3>
                        </div>
                        <div className="grid grid-cols-2 gap-5">
                            {field('Valid from', 'validFrom', '', 'date', true)}
                            {field('Valid till', 'validTill', '', 'date', true)}
                            {field('Start time', 'startTime', '', 'time')}
                            {field('End time', 'endTime', '', 'time')}
                            <div>
                                <label htmlFor="items" className="block text-[13px] font-medium text-[#1A181B] mb-1.5 font-manrope">Applicable on</label>
                                <div className="relative">
                                    <select
                                        id="items"
                                        className="w-full h-11 px-4 rounded-xl border border-gray-200 bg-white text-[13px] outline-none focus:border-[#FE8301] appearance-none transition-colors font-manrope"
                                        value={form.items}
                                        onChange={set('items')}
                                    >
                                        <option>All Items</option>
                                        <option>Food Only</option>
                                        <option>Beverages Only</option>
                                    </select>
                                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" size={16} />
                                </div>
                            </div>
                            <div>
                                <label htmlFor="status" className="block text-[13px] font-medium text-[#1A181B] mb-1.5 font-manrope">Initial status</label>
                                <div className="relative">
                                    <select
                                        id="status"
                                        className="w-full h-11 px-4 rounded-xl border border-gray-200 bg-white text-[13px] outline-none focus:border-[#FE8301] appearance-none transition-colors font-manrope"
                                        value={form.status}
                                        onChange={set('status')}
                                    >
                                        <option>Active</option>
                                        <option>Scheduled</option>
                                    </select>
                                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" size={16} />
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="px-8 py-5 border-t border-gray-100 bg-[#FCFBFA] flex gap-4">
                    <button
                        onClick={onClose}
                        disabled={saving}
                        className="flex-1 h-12 rounded-xl border border-gray-200 text-[#1A181B] font-semibold text-[15px] hover:bg-white hover:border-gray-300 transition-all font-manrope disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        Discard
                    </button>
                    <button
                        onClick={handleSubmit}
                        disabled={saving}
                        aria-busy={saving ? 'true' : 'false'}
                        className="flex-2 h-12 rounded-xl bg-[#FE8301] text-white font-semibold text-[15px] hover:bg-orange-600 transition-all shadow-lg shadow-orange-500/20 font-manrope flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                        {saving ? <Loader2 size={18} className="animate-spin" /> : <CheckCircle2 size={18} />}
                        {saving ? 'Publishing…' : 'Publish offer'}
                    </button>
                </div>
            </div>
        </div>
    )
}

export default CreateOfferModal
