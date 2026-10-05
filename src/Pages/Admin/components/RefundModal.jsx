import React, { useState, useEffect } from 'react'
import { X, User, ChevronDown, Check, Loader2 } from 'lucide-react'

const RefundModal = ({ payment, onClose, onRefund, loading = false }) => {
    const [refundType, setRefundType] = useState('full')
    const [partialAmount, setPartialAmount] = useState('')
    const [refundReason, setRefundReason] = useState('Order cancelled')
    const [specifyReason, setSpecifyReason] = useState('')
    const [amountError, setAmountError] = useState('')
    // Inline error for the "Specify Reason" field — shown only after a
    // submit attempt while it's required-but-blank.
    const [reasonError, setReasonError] = useState('')

    // Escape key — only closes when idle, so a refund in flight isn't
    // abandoned by an accidental Esc keypress.
    useEffect(() => {
        const onKey = (e) => { if (e.key === 'Escape' && !loading) onClose() }
        document.addEventListener('keydown', onKey)
        return () => document.removeEventListener('keydown', onKey)
    }, [onClose, loading])

    // Body scroll lock
    useEffect(() => {
        document.body.style.overflow = 'hidden'
        return () => { document.body.style.overflow = '' }
    }, [])

    if (!payment) return null

    const refundReasons = [
        'Order cancelled',
        'Item unavailable',
        'Customer request',
        'Quality issue',
        'Wrong order',
        'Other'
    ]

    const maxRefundable = payment.refundableBalance ?? payment.total ?? 0
    // Nothing left to refund (e.g. already fully refunded) — a "full"
    // refund would be ₹0, which the server rejects.
    const nothingRefundable = !(Number(maxRefundable) > 0)
    const refundAmount = refundType === 'full' ? maxRefundable : (parseFloat(partialAmount) || 0)

    const validateAmount = (val) => {
        const num = parseFloat(val)
        if (!val || isNaN(num)) { setAmountError('Enter a valid amount'); return false }
        if (num <= 0) { setAmountError('Amount must be greater than 0'); return false }
        // Whole paise only — the gateway refunds round(amount × 100) paise,
        // so a sub-paisa amount would book a different figure than it pays.
        if ((String(val).split('.')[1] || '').length > 2) { setAmountError('Use at most 2 decimal places'); return false }
        if (num > maxRefundable) { setAmountError(`Cannot exceed ₹${maxRefundable.toFixed(2)}`); return false }
        setAmountError('')
        return true
    }

    const handleAmountChange = (e) => {
        const val = e.target.value.replace(/[^0-9.]/g, '')
        // Prevent multiple dots
        if (val.split('.').length > 2) return
        setPartialAmount(val)
        if (val) validateAmount(val)
        else setAmountError('')
    }

    const handleSubmit = () => {
        if (refundType === 'full' && nothingRefundable) return
        if (refundType === 'partial' && !validateAmount(partialAmount)) {
            setTimeout(() => document.getElementById('refund-amount')?.focus(), 0)
            return
        }
        if (refundReason === 'Other' && !specifyReason.trim()) {
            setReasonError('Please specify the reason')
            setTimeout(() => document.getElementById('refund-specifyReason')?.focus(), 0)
            return
        }
        setReasonError('')

        onRefund?.({
            type: refundType,
            amount: refundAmount,
            reason: refundReason,
            specifyReason: specifyReason.trim()
        })
    }

    const canSubmit = refundType === 'full'
        ? (!nothingRefundable && (refundReason !== 'Other' || specifyReason.trim()))
        : (partialAmount && !amountError && (refundReason !== 'Other' || specifyReason.trim()))

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40">
            <div className="bg-white rounded-2xl w-full max-w-[420px] max-h-[90vh] overflow-y-auto shadow-xl mx-4">
                {/* Header */}
                <div className="sticky top-0 bg-[#FFEBEB] px-6 pt-6 pb-4 rounded-t-2xl">
                    <div className="flex items-center justify-between">
                        <h2 className="text-[18px] leading-[24px] font-[600] font-manrope text-[#1A181B]">
                            Refund
                        </h2>
                        <button
                            onClick={onClose}
                            disabled={loading}
                            aria-label="Close"
                            title={loading ? 'Wait for refund to finish' : 'Close'}
                            className="p-1 text-gray-400 hover:text-gray-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                            <X size={20} />
                        </button>
                    </div>
                </div>

                {/* Content */}
                <div className="p-6 space-y-5">
                    {/* Customer Info Card */}
                    <div className="border border-gray-200 rounded-xl p-4">
                        <div className="flex items-center gap-2 text-[14px] text-gray-500 mb-2">
                            <User size={16} className="text-gray-400" />
                            <span>Customer: {payment.customer || '-'}</span>
                        </div>

                        <div className="flex justify-between">
                            <div>
                                <p className="text-[18px] font-[700] font-manrope text-[#1A181B]">{payment.table}</p>
                                <p className="text-[14px] text-gray-400 mt-0.5">{payment.id}</p>
                                <p className="text-[14px] text-gray-500 mt-1">
                                    Payment Mode:<br />
                                    <span className="font-[600] text-[#1A181B]">{payment.method}</span>
                                </p>
                            </div>
                            <div className="text-right">
                                <p className="text-[12px] text-gray-400">Original Total:</p>
                                <p className="text-[16px] font-[700] text-[#1A181B]">₹{(payment.total ?? 0).toFixed(2)}</p>
                                {(payment.refundedAmount || 0) > 0 && (
                                    <>
                                        <p className="text-[12px] text-[#FF3B30] mt-1">Already Refunded:</p>
                                        <p className="text-[14px] font-[600] text-[#FF3B30]">₹{payment.refundedAmount.toFixed(2)}</p>
                                    </>
                                )}
                                <p className="text-[12px] text-[#FE8301] mt-1">Refundable:</p>
                                <p className="text-[16px] font-[700] text-[#FE8301]">₹{maxRefundable.toFixed(2)}</p>
                            </div>
                        </div>
                    </div>

                    {/* Refund Type Toggle */}
                    <div className="flex bg-gray-100 rounded-xl p-1">
                        <button
                            onClick={() => { setRefundType('full'); setAmountError('') }}
                            disabled={nothingRefundable}
                            title={nothingRefundable ? 'Nothing left to refund' : undefined}
                            className={`flex-1 py-2.5 rounded-lg text-[14px] font-[600] transition-all disabled:opacity-50 disabled:cursor-not-allowed ${refundType === 'full' ? 'bg-white text-[#1A181B] shadow-sm' : 'text-gray-500'}`}
                        >
                            Full Refund
                        </button>
                        <button
                            onClick={() => setRefundType('partial')}
                            className={`flex-1 py-2.5 rounded-lg text-[14px] font-[600] transition-all ${refundType === 'partial' ? 'bg-white text-[#1A181B] shadow-sm' : 'text-gray-500'}`}
                        >
                            Partial Refund
                        </button>
                    </div>

                    {/* Partial Amount Input */}
                    {refundType === 'partial' && (
                        <div>
                            <label htmlFor="refund-amount" className="block text-[14px] font-semibold text-[#1A181B] mb-2">
                                Refund amount <span className="text-red-500" aria-hidden="true">*</span>
                            </label>
                            <div className="relative">
                                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[14px] text-gray-400 font-medium">₹</span>
                                <input
                                    id="refund-amount"
                                    type="text"
                                    inputMode="decimal"
                                    value={partialAmount}
                                    onChange={handleAmountChange}
                                    aria-required="true"
                                    aria-invalid={amountError ? 'true' : 'false'}
                                    aria-describedby={amountError ? 'refund-amount-err' : 'refund-amount-hint'}
                                    className={`w-full pl-8 pr-4 py-3 border rounded-xl text-[14px] focus:outline-none font-medium ${amountError ? 'border-red-400 focus:border-red-500' : 'border-gray-200 focus:border-orange-500'}`}
                                    placeholder="0.00"
                                />
                            </div>
                            {amountError && (
                                <p id="refund-amount-err" role="alert" className="text-[12px] text-red-500 mt-1 font-medium flex items-center gap-1">
                                    <span aria-hidden="true">⚠</span>{amountError}
                                </p>
                            )}
                            <p id="refund-amount-hint" className="text-[12px] text-gray-400 mt-1">
                                Max refundable: ₹{maxRefundable.toFixed(2)}
                            </p>
                        </div>
                    )}

                    {/* Refund Reason Dropdown */}
                    <div>
                        <label htmlFor="refund-reason" className="block text-[14px] font-semibold text-[#1A181B] mb-2">
                            Refund reason
                        </label>
                        <div className="relative">
                            <select
                                id="refund-reason"
                                value={refundReason}
                                onChange={(e) => { setRefundReason(e.target.value); setReasonError('') }}
                                className="w-full px-4 py-3 border border-gray-200 rounded-xl text-[14px] focus:outline-none focus:border-orange-500 appearance-none font-medium bg-white"
                            >
                                {refundReasons.map((reason) => (
                                    <option key={reason} value={reason}>{reason}</option>
                                ))}
                            </select>
                            <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none">
                                <ChevronDown size={18} className="text-gray-400" />
                            </div>
                        </div>
                    </div>

                    {/* Specify Reason — shows when "Other" is selected (any refund type) */}
                    {refundReason === 'Other' && (
                        <div>
                            <label htmlFor="refund-specifyReason" className="block text-[14px] font-semibold text-[#1A181B] mb-2">
                                Specify reason <span className="text-red-500" aria-hidden="true">*</span>
                            </label>
                            <input
                                id="refund-specifyReason"
                                type="text"
                                value={specifyReason}
                                onChange={(e) => { setSpecifyReason(e.target.value); if (reasonError) setReasonError('') }}
                                aria-required="true"
                                aria-invalid={reasonError ? 'true' : 'false'}
                                aria-describedby={reasonError ? 'refund-specifyReason-err' : undefined}
                                className={`w-full px-4 py-3 border rounded-xl text-[14px] focus:outline-none font-medium ${reasonError ? 'border-red-400 focus:border-red-500' : 'border-gray-200 focus:border-orange-500'}`}
                                placeholder="e.g. Customer reported food was cold on arrival"
                            />
                            {reasonError && (
                                <p id="refund-specifyReason-err" role="alert" className="text-[12px] text-red-500 mt-1 font-medium flex items-center gap-1">
                                    <span aria-hidden="true">⚠</span>{reasonError}
                                </p>
                            )}
                        </div>
                    )}

                    {/* Refund summary */}
                    <div className="bg-[#F9FAFB] rounded-xl p-4 border border-gray-100">
                        <div className="flex justify-between text-[14px] font-manrope">
                            <span className="text-gray-500 font-[500]">Refund Amount:</span>
                            <span className="text-[#1A181B] font-[700]">₹{refundAmount.toFixed(2)}</span>
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="sticky bottom-0 bg-white px-6 py-4 border-t border-gray-100 flex gap-3">
                    <button
                        onClick={onClose}
                        disabled={loading}
                        className="flex-1 px-6 py-3 border border-[#FE8301] text-[#FE8301] rounded-xl text-[14px] font-[600] hover:bg-orange-50 transition-colors disabled:opacity-50"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSubmit}
                        disabled={!canSubmit || loading}
                        className="flex-1 px-6 py-3 bg-[#FE8301] text-white rounded-xl text-[14px] font-[600] hover:bg-orange-600 transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {loading ? <Loader2 size={18} className="animate-spin" /> : <Check size={18} />}
                        {loading ? 'Processing...' : 'Confirm Refund'}
                    </button>
                </div>
            </div>
        </div>
    )
}

export default RefundModal
