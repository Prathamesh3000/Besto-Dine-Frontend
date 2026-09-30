import React, { useState } from 'react'
import { X, AlertTriangle, Calendar, Check, Loader } from 'lucide-react'

const InactivateMenuModal = ({ isOpen, onClose, onConfirm, itemName }) => {
    const [selectedDuration, setSelectedDuration] = useState('24h') // '24h' | '1w' | 'permanent' | 'custom'
    const [dateRange, setDateRange] = useState({ start: '', end: '' })
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [dateError, setDateError] = useState('')

    if (!isOpen) return null

    const validateCustomDates = () => {
        if (selectedDuration !== 'custom') return true
        if (!dateRange.start || !dateRange.end) {
            setDateError('Please select both start and end dates')
            return false
        }
        if (new Date(dateRange.start) >= new Date(dateRange.end)) {
            setDateError('End date must be after start date')
            return false
        }
        if (new Date(dateRange.start) < new Date(new Date().toDateString())) {
            setDateError('Start date cannot be in the past')
            return false
        }
        setDateError('')
        return true
    }

    const handleConfirm = async () => {
        if (!validateCustomDates()) return

        setIsSubmitting(true)
        try {
            await onConfirm({
                duration: selectedDuration,
                dateRange: selectedDuration === 'custom' ? dateRange : null,
            })
        } finally {
            setIsSubmitting(false)
        }
    }

    const durations = [
        { id: '24h', label: '24 Hours', desc: 'Temporarily hide this item for today' },
        { id: '1w', label: '1 Week', desc: 'Hide this item for the next 7 days' },
        { id: 'permanent', label: 'Permanent', desc: 'Remove this item until manually reactivated' },
        { id: 'custom', label: 'Custom Date Range', desc: 'Hide this item for a specific start and end date' },
    ]

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200"
            role="dialog"
            aria-modal="true"
            aria-labelledby="inactivate-title"
        >
            <div className="bg-white rounded-3xl w-full max-w-[500px] max-h-[90vh] overflow-y-auto custom-scrollbar shadow-xl relative animate-in zoom-in-95 duration-200">
                {/* Header */}
                <div className="p-6 pb-2 text-center relative">
                    <button
                        onClick={onClose}
                        className="absolute right-6 top-6 text-gray-400 hover:text-gray-600 transition-colors"
                        aria-label="Close"
                    >
                        <X size={24} />
                    </button>

                    <div className="flex flex-col items-center gap-3 mb-2">
                        <AlertTriangle size={48} className="text-[#FFDBB1] fill-white" />
                        <h2 id="inactivate-title" className="text-[24px] leading-[32px] font-bold text-[#1A181B] font-manrope">
                            Inactivate {itemName || 'Food name'}
                        </h2>
                        <p className="text-[16px] text-gray-500 font-manrope max-w-[80%] mx-auto">
                            Are you sure you want to inactivate this <span className="font-bold text-gray-700">{itemName || 'food name'}</span>?
                        </p>
                    </div>
                </div>

                {/* Content */}
                <div className="px-6 py-2 space-y-4">
                    <h3 className="text-[14px] font-bold text-[#1A181B] font-manrope">Inactivation Duration</h3>

                    {durations.map((opt) => (
                        <label
                            key={opt.id}
                            className={`block cursor-pointer border rounded-2xl p-4 transition-all ${selectedDuration === opt.id ? 'border-[#FE8301] ring-1 ring-[#FE8301]' : 'border-gray-200 hover:border-gray-300'}`}
                        >
                            <div className="flex items-start gap-4">
                                <div className="relative flex items-center justify-center mt-1">
                                    <input
                                        type="radio"
                                        name="duration"
                                        className="peer appearance-none w-5 h-5 rounded-full border border-gray-300 checked:border-[#FE8301] checked:bg-[#FE8301] transition-all"
                                        checked={selectedDuration === opt.id}
                                        onChange={() => { setSelectedDuration(opt.id); setDateError(''); }}
                                    />
                                    <div className="absolute inset-0 flex items-center justify-center opacity-0 peer-checked:opacity-100 pointer-events-none transition-opacity">
                                        <Check size={12} className="text-white" strokeWidth={3} />
                                    </div>
                                </div>
                                <div className="flex-1">
                                    <span className="block text-[16px] font-bold text-[#1A181B] font-manrope">{opt.label}</span>
                                    <span className="text-[14px] text-gray-500 font-manrope">{opt.desc}</span>

                                    {/* Custom Date Inputs */}
                                    {opt.id === 'custom' && selectedDuration === 'custom' && (
                                        <div className="mt-4">
                                            <p className="text-[14px] font-bold text-[#1A181B] mb-2 font-manrope">Select Date Range</p>
                                            <div className="flex items-center gap-3">
                                                <div className="relative flex-1">
                                                    <input
                                                        type="date"
                                                        className="w-full pl-4 pr-10 py-2.5 bg-white border border-gray-300 rounded-lg text-[14px] focus:outline-none focus:border-[#FE8301] font-manrope"
                                                        value={dateRange.start}
                                                        min={new Date().toISOString().split('T')[0]}
                                                        onChange={(e) => { setDateRange(prev => ({ ...prev, start: e.target.value })); setDateError(''); }}
                                                        aria-label="Start date"
                                                    />
                                                    <Calendar size={18} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                                                </div>
                                                <span className="text-gray-500 font-manrope">to</span>
                                                <div className="relative flex-1">
                                                    <input
                                                        type="date"
                                                        className="w-full pl-4 pr-10 py-2.5 bg-white border border-gray-300 rounded-lg text-[14px] focus:outline-none focus:border-[#FE8301] font-manrope"
                                                        value={dateRange.end}
                                                        min={dateRange.start || new Date().toISOString().split('T')[0]}
                                                        onChange={(e) => { setDateRange(prev => ({ ...prev, end: e.target.value })); setDateError(''); }}
                                                        aria-label="End date"
                                                    />
                                                    <Calendar size={18} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                                                </div>
                                            </div>
                                            {dateError && (
                                                <p className="text-red-500 text-[13px] mt-2 font-manrope">{dateError}</p>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </label>
                    ))}
                </div>

                {/* Footer */}
                <div className="p-6">
                    <p className="text-[13px] text-gray-500 text-center mb-6 font-manrope">
                        This item will no longer be visible or available for ordering during the selected period.
                    </p>
                    <div className="flex gap-4">
                        <button
                            onClick={onClose}
                            disabled={isSubmitting}
                            className="flex-1 py-3 px-6 rounded-xl border border-[#FE8301] text-[#FE8301] font-bold text-[16px] hover:bg-orange-50 transition-colors font-manrope disabled:opacity-50"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleConfirm}
                            disabled={isSubmitting}
                            className="flex-1 py-3 px-6 rounded-xl bg-[#FE8301] text-white font-bold text-[16px] hover:bg-orange-600 transition-colors shadow-lg shadow-orange-200 font-manrope disabled:opacity-70 flex items-center justify-center gap-2"
                        >
                            {isSubmitting && <Loader size={18} className="animate-spin" />}
                            {isSubmitting ? 'Processing...' : 'Confirm'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    )
}

export default InactivateMenuModal
