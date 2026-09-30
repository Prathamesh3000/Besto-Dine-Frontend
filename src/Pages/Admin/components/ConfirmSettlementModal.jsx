import React, { useState } from 'react'
import { X } from 'lucide-react'

const ConfirmSettlementModal = ({ waiter, settling, onClose, onConfirm }) => {
    const [paymentMethod, setPaymentMethod] = useState('Cash')
    const [note, setNote] = useState('')

    const handleConfirm = () => {
        if (settling) return
        onConfirm?.({ paymentMethod, note })
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
            <div className="bg-white rounded-2xl w-full max-w-[440px] mx-4 shadow-2xl overflow-hidden">

                {/* Header */}
                <div className="flex items-center justify-between px-6 pt-6 pb-4">
                    <h2 className="text-[20px] font-[700] font-manrope text-[#1A181B]">
                        Confirm Settlement
                    </h2>
                    <button
                        onClick={onClose}
                        disabled={settling}
                        className="p-1 text-gray-400 hover:text-gray-600 transition-colors disabled:opacity-50"
                    >
                        <X size={22} />
                    </button>
                </div>

                {/* Body */}
                <div className="px-6 pb-6 space-y-5">

                    {/* Summary Card */}
                    <div className="bg-[#F3E8FF] border border-[#E9D5FF] rounded-2xl px-5 py-4 space-y-3">
                        <div className="flex items-center justify-between">
                            <span className="text-[14px] font-[500] font-manrope text-[#6B7280]">Tips to Settle:</span>
                            <span className="text-[14px] font-[700] font-manrope text-[#1A181B]">{waiter?.pendingCount || 0}</span>
                        </div>
                        <div className="flex items-center justify-between">
                            <span className="text-[14px] font-[500] font-manrope text-[#6B7280]">Waiter name:</span>
                            <span className="text-[14px] font-[700] font-manrope text-[#1A181B]">{waiter?.name}</span>
                        </div>
                        <div className="flex items-center justify-between">
                            <span className="text-[14px] font-[500] font-manrope text-[#6B7280]">Total Amount:</span>
                            <span className="text-[16px] font-[700] font-manrope text-[#702083]">₹{waiter?.settleAmount}</span>
                        </div>
                    </div>

                    {/* Payment Method */}
                    <div>
                        <p className="text-[14px] font-[600] font-manrope text-[#1A181B] mb-3">Payment Method</p>
                        <div className="border border-gray-200 rounded-2xl overflow-hidden">
                            {['Cash', 'Online'].map((method, idx) => (
                                <button
                                    key={method}
                                    type="button"
                                    onClick={() => setPaymentMethod(method)}
                                    className={`w-full flex items-center gap-3 px-4 py-3.5 transition-colors ${paymentMethod === method
                                        ? 'bg-orange-50'
                                        : 'bg-white hover:bg-gray-50'
                                    } ${idx === 0 ? 'border-b border-gray-100' : ''}`}
                                >
                                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors ${paymentMethod === method ? 'border-[#FE8301]' : 'border-gray-300'}`}>
                                        {paymentMethod === method && <div className="w-2.5 h-2.5 rounded-full bg-[#FE8301]" />}
                                    </div>
                                    <span className={`text-[14px] font-manrope ${paymentMethod === method ? 'text-[#FE8301] font-[600]' : 'text-[#1A181B] font-[500]'}`}>
                                        {method}
                                    </span>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Notes */}
                    <div>
                        <p className="text-[14px] font-[600] font-manrope text-[#1A181B] mb-2">Notes (Optional)</p>
                        <textarea
                            value={note}
                            onChange={(e) => setNote(e.target.value)}
                            placeholder="Add a note..."
                            rows={3}
                            className="w-full px-4 py-3 border border-gray-200 rounded-xl text-[14px] font-[500] font-manrope placeholder:text-gray-300 focus:outline-none focus:border-orange-400 resize-none"
                        />
                    </div>

                    {/* Footer Buttons */}
                    <div className="flex items-center gap-3 pt-1">
                        <button
                            onClick={onClose}
                            disabled={settling}
                            className="flex-1 py-3 rounded-xl border border-[#FE8301] text-[#FE8301] text-[14px] font-[600] font-manrope hover:bg-orange-50 transition-colors disabled:opacity-50"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleConfirm}
                            disabled={settling}
                            className="flex-1 py-3 rounded-xl bg-[#FE8301] text-white text-[14px] font-[600] font-manrope hover:bg-orange-600 transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {settling ? (
                                <span className="flex items-center justify-center gap-2">
                                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                    Settling...
                                </span>
                            ) : (
                                'Confirm Settlement'
                            )}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    )
}

export default ConfirmSettlementModal
