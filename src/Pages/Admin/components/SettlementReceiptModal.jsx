import React from 'react'
import { X } from 'lucide-react'

const SettlementReceiptModal = ({ tx, onClose }) => {
    const date = tx?.createdAt ? new Date(tx.createdAt) : null
    const formattedDate = date ? date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'
    const formattedTime = date ? date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true }) : '—'

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40">
            <div className="bg-white rounded-2xl w-full max-w-[420px] mx-4 shadow-2xl overflow-hidden">

                {/* Header */}
                <div className="flex items-center justify-between px-6 pt-5 pb-4 bg-[#FFF1F2]">
                    <h2 className="text-[18px] font-[700] font-manrope text-[#1A181B]">
                        Settlement Receipt
                    </h2>
                    <button
                        onClick={onClose}
                        className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Body */}
                <div className="px-6 py-5 space-y-5">

                    {/* Info grid */}
                    <div className="bg-gray-50 border border-gray-200 rounded-xl px-5 py-4">
                        <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                            <div>
                                <p className="text-[12px] font-[500] font-manrope text-gray-400 mb-0.5">Waiter Name</p>
                                <p className="text-[14px] font-[700] font-manrope text-[#1A181B]">
                                    {tx?.waiter?.name || '—'}
                                </p>
                            </div>

                            <div>
                                <p className="text-[12px] font-[500] font-manrope text-gray-400 mb-0.5">Total Amount Paid</p>
                                <p className="text-[14px] font-[700] font-manrope text-[#FE8301]">
                                    ₹{tx?.amount || 0}
                                </p>
                            </div>

                            <div>
                                <p className="text-[12px] font-[500] font-manrope text-gray-400 mb-0.5">Tips Settled</p>
                                <p className="text-[14px] font-[700] font-manrope text-[#1A181B]">
                                    {tx?.tipsSettledCount || 0} tips
                                </p>
                            </div>

                            <div>
                                <p className="text-[12px] font-[500] font-manrope text-gray-400 mb-0.5">Payment Method</p>
                                <p className="text-[14px] font-[700] font-manrope text-[#1A181B]">
                                    {tx?.paymentMethod || '—'}
                                </p>
                            </div>

                            <div>
                                <p className="text-[12px] font-[500] font-manrope text-gray-400 mb-0.5">Settled By</p>
                                <p className="text-[14px] font-[700] font-manrope text-[#1A181B]">
                                    {tx?.settledBy?.name || '—'}
                                </p>
                            </div>

                            <div>
                                <p className="text-[12px] font-[500] font-manrope text-gray-400 mb-0.5">Date & Time</p>
                                <p className="text-[14px] font-[700] font-manrope text-[#1A181B]">
                                    {formattedDate}, {formattedTime}
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Note if exists */}
                    {tx?.note && (
                        <div className="bg-[#EFF6FF] border border-[#BFDBFE] rounded-xl px-4 py-3">
                            <span className="text-[12px] font-[600] font-manrope text-[#1E40AF]">Note: </span>
                            <span className="text-[12px] font-[500] font-manrope text-[#3B82F6]">{tx.note}</span>
                        </div>
                    )}

                    {/* Close button */}
                    <button
                        onClick={onClose}
                        className="w-full py-3 rounded-xl border border-[#FE8301] text-[#FE8301] text-[14px] font-[600] font-manrope hover:bg-orange-50 transition-colors"
                    >
                        Close
                    </button>
                </div>
            </div>
        </div>
    )
}

export default SettlementReceiptModal
