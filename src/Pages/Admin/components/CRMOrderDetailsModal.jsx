import React from 'react'
import { X, Check, Utensils, Clock, User } from 'lucide-react'

const CRMOrderDetailsModal = ({ order, onClose }) => {
    if (!order) return null

    const formatCurrency = (amount) => {
        return new Intl.NumberFormat('en-IN', {
            style: 'currency',
            currency: 'INR',
            minimumFractionDigits: 2,
        }).format(amount)
    }

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="bg-white rounded-[24px] w-full max-w-[500px] max-h-[90vh] overflow-hidden flex flex-col shadow-2xl animate-in zoom-in-95 duration-200">
                {/* Header */}
                <div className="px-6 py-4 bg-[#FAF7F2] border-b border-gray-100 flex items-center justify-between">
                    <div>
                        <h2 className="text-[18px] font-[700] text-[#1A181B]">Order Details - {order.id}</h2>
                        <p className="text-[12px] text-gray-500">{order.date}</p>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-black/5 rounded-full transition-colors text-gray-400">
                        <X size={20} />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                    {/* Order Summary */}
                    <div className="bg-[#F9FAFB] rounded-xl p-4 border border-gray-100">
                        <div className="flex justify-between items-center mb-4">
                            <span className="text-[14px] font-[600] text-gray-500 uppercase tracking-wider">Status</span>
                            <span className={`px-3 py-1 rounded-full text-[12px] font-[600] bg-blue-50 text-blue-600 border border-blue-100 uppercase`}>
                                {order.type}
                            </span>
                        </div>
                        <div className="flex justify-between items-center pt-3 border-t border-gray-200">
                            <span className="text-[14px] font-[600] text-gray-900">Total Amount</span>
                            <span className="text-[18px] font-[700] text-[#FE8301]">{formatCurrency(order.total)}</span>
                        </div>
                    </div>

                    {/* Items List */}
                    <div>
                        <h3 className="text-[14px] font-[700] text-[#1A181B] mb-3 flex items-center gap-2">
                            <Utensils size={16} className="text-[#FE8301]" />
                            Items Ordered
                        </h3>
                        <div className="space-y-3">
                            {order.items.map((item, idx) => (
                                <div key={idx} className="flex justify-between items-center py-2 border-b border-gray-50 last:border-0">
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-lg bg-orange-50 flex items-center justify-center text-[#FE8301] font-[600] text-[12px]">
                                            x{item.qty}
                                        </div>
                                        <span className="text-[14px] font-[500] text-gray-700">{item.name}</span>
                                    </div>
                                    <span className="text-[14px] font-[600] text-gray-900">₹{item.price || '---'}</span>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Timeline (Simplified) */}
                    <div>
                        <h3 className="text-[14px] font-[700] text-[#1A181B] mb-4 flex items-center gap-2">
                            <Clock size={16} className="text-[#FE8301]" />
                            Order Timeline
                        </h3>
                        <div className="space-y-4 relative pl-3 border-l-2 border-dashed border-gray-100 ml-2">
                            <div className="relative">
                                <div className="absolute -left-[19px] top-1 w-3 h-3 rounded-full bg-[#FE8301] ring-4 ring-white"></div>
                                <p className="text-[13px] font-[600] text-gray-900">Order Placed</p>
                                <p className="text-[11px] text-gray-400">
                                    {order.createdAt ? new Date(order.createdAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }) : order.date}
                                </p>
                            </div>
                            {order.preparationStartedAt && (
                                <div className="relative">
                                    <div className="absolute -left-[19px] top-1 w-3 h-3 rounded-full bg-orange-400 ring-4 ring-white"></div>
                                    <p className="text-[13px] font-[600] text-gray-900">Preparation Started</p>
                                    <p className="text-[11px] text-gray-400">
                                        {new Date(order.preparationStartedAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })}
                                    </p>
                                </div>
                            )}
                            <div className="relative">
                                <div className={`absolute -left-[19px] top-1 w-3 h-3 rounded-full ring-4 ring-white ${order.status === 'served' || order.status === 'cancelled' ? 'bg-green-500' : 'bg-gray-200'}`}></div>
                                <p className={`text-[13px] font-[600] ${order.status === 'served' || order.status === 'cancelled' ? 'text-gray-900' : 'text-gray-400'}`}>
                                    {order.status === 'cancelled' ? 'Order Cancelled' : 'Order Served'}
                                </p>
                                <p className="text-[11px] text-gray-400">
                                    {order.updatedAt ? new Date(order.updatedAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }) : '—'}
                                </p>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="p-6 pt-0">
                    <button
                        onClick={onClose}
                        className="w-full py-3 bg-[#FE8301] text-white rounded-xl font-[600] text-[14px] hover:bg-orange-600 transition-colors shadow-sm"
                    >
                        Close
                    </button>
                </div>
            </div>
        </div>
    )
}

export default CRMOrderDetailsModal
