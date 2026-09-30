import React, { useState, useEffect } from 'react'
import { X, ArrowUpCircle, ArrowDownCircle, AlertTriangle, RotateCcw, Undo2, Package, Pencil, Trash2 } from 'lucide-react'
import { inventoryAPI } from '../../../utils/api'

const typeConfig = {
    restock:    { icon: ArrowUpCircle, color: 'text-green-600', bg: 'bg-green-50', label: 'Restock', sign: '+' },
    usage:      { icon: ArrowDownCircle, color: 'text-blue-600', bg: 'bg-blue-50', label: 'Usage', sign: '-' },
    waste:      { icon: AlertTriangle, color: 'text-red-600', bg: 'bg-red-50', label: 'Waste', sign: '-' },
    return:     { icon: Undo2, color: 'text-amber-600', bg: 'bg-amber-50', label: 'Return', sign: '+' },
    correction: { icon: RotateCcw, color: 'text-purple-600', bg: 'bg-purple-50', label: 'Correction', sign: '=' },
}

const statusBadge = {
    'in-stock':     'bg-[#E8FFF0] text-[#34C759] border-[#34C759]',
    'low-stock':    'bg-[#FFF8E1] text-[#F59E0B] border-[#F59E0B]',
    'out-of-stock': 'bg-[#FFF0F0] text-[#EF4444] border-[#EF4444]',
}

const InventoryDetailDrawer = ({ itemId, onClose, onEdit, onDelete, onAdjust }) => {
    const [item, setItem] = useState(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState(null)

    useEffect(() => {
        if (!itemId) return
        setLoading(true)
        setError(null)
        inventoryAPI.getById(itemId)
            .then(res => { if (res.data.success) setItem(res.data.item) })
            .catch((err) => setError(err.response?.data?.message || 'Failed to load item details'))
            .finally(() => setLoading(false))
    }, [itemId])

    if (!itemId) return null

    return (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/30" onClick={onClose}>
            <div
                className="w-full max-w-[440px] bg-white h-full shadow-2xl overflow-y-auto animate-in slide-in-from-right duration-300"
                onClick={(e) => e.stopPropagation()}
            >
                {loading ? (
                    <div className="flex items-center justify-center h-64">
                        <div className="w-8 h-8 border-3 border-orange-500 border-t-transparent rounded-full animate-spin" />
                    </div>
                ) : error || !item ? (
                    <div className="flex flex-col items-center justify-center h-64 px-6 text-center">
                        <Package size={36} className="text-gray-300 mb-3" />
                        <p className="text-[15px] font-[600] text-gray-500 mb-1">{error || 'Item not found'}</p>
                        <button onClick={onClose} className="mt-3 px-4 py-2 text-[13px] font-[600] text-[#FE8301] border border-[#FE8301] rounded-lg hover:bg-orange-50 transition-colors">Close</button>
                    </div>
                ) : (
                    <>
                        {/* Header */}
                        <div className="sticky top-0 bg-white z-10 px-6 py-4 border-b border-gray-100 flex items-start justify-between">
                            <div className="flex items-center gap-3">
                                <div className="w-11 h-11 rounded-xl bg-orange-50 flex items-center justify-center">
                                    <Package size={22} className="text-[#FE8301]" />
                                </div>
                                <div>
                                    <h2 className="font-manrope font-[700] text-[17px] text-[#1A181B]">{item.name}</h2>
                                    <p className="text-[12px] text-gray-400">{item.itemId}</p>
                                </div>
                            </div>
                            <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
                                <X size={20} />
                            </button>
                        </div>

                        {/* Status + Actions */}
                        <div className="px-6 py-4 flex items-center gap-3">
                            <span className={`px-3 py-1 rounded-full text-[12px] font-[600] border ${statusBadge[item.status]}`}>
                                {item.status.replace('-', ' ').replace(/\b\w/g, c => c.toUpperCase())}
                            </span>
                            <div className="ml-auto flex gap-2">
                                <button onClick={() => onAdjust(item)} className="px-4 py-2 bg-[#FE8301] text-white rounded-lg text-[13px] font-[600] hover:bg-orange-600 transition-colors">
                                    Adjust Stock
                                </button>
                                <button onClick={() => onEdit(item)} className="p-2 text-gray-400 hover:text-orange-500 hover:bg-orange-50 rounded-lg transition-colors">
                                    <Pencil size={18} />
                                </button>
                                <button onClick={() => onDelete(item)} className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                                    <Trash2 size={18} />
                                </button>
                            </div>
                        </div>

                        {/* Details Grid */}
                        <div className="px-6 pb-4">
                            <div className="bg-gray-50 rounded-xl p-4 grid grid-cols-2 gap-y-4 gap-x-6">
                                <DetailCell label="Category" value={item.category} />
                                <DetailCell label="Unit" value={item.unit} />
                                <DetailCell label="Current Stock" value={`${item.currentStock} ${item.unit}`} highlight={item.status !== 'in-stock'} />
                                <DetailCell label="Min Stock" value={`${item.minStock} ${item.unit}`} />
                                <DetailCell label="Max Stock" value={item.maxStock > 0 ? `${item.maxStock} ${item.unit}` : 'No limit'} />
                                <DetailCell label="Cost/Unit" value={`₹${item.costPerUnit}`} />
                                <DetailCell label="Stock Value" value={`₹${(item.currentStock * item.costPerUnit).toFixed(2)}`} />
                                <DetailCell label="Last Restocked" value={item.lastRestocked ? new Date(item.lastRestocked).toLocaleDateString('en-IN') : 'Never'} />
                                {item.expiryDate && (
                                    <DetailCell label="Expiry Date" value={new Date(item.expiryDate).toLocaleDateString('en-IN')} highlight={new Date(item.expiryDate) < new Date()} />
                                )}
                                {item.supplier?.name && (
                                    <>
                                        <DetailCell label="Supplier" value={item.supplier.name} />
                                        {item.supplier.contact && <DetailCell label="Supplier Contact" value={item.supplier.contact} />}
                                    </>
                                )}
                            </div>
                        </div>

                        {/* Adjustment History */}
                        <div className="px-6 pb-6">
                            <h3 className="font-manrope font-[700] text-[15px] text-[#1A181B] mb-3">Stock History</h3>
                            {item.adjustmentHistory && item.adjustmentHistory.length > 0 ? (
                                <div className="space-y-2.5 max-h-[350px] overflow-y-auto">
                                    {[...item.adjustmentHistory].reverse().map((adj, i) => {
                                        const cfg = typeConfig[adj.type] || typeConfig.correction
                                        const Icon = cfg.icon
                                        return (
                                            <div key={i} className={`flex items-start gap-3 px-4 py-3 rounded-xl ${cfg.bg} border border-gray-100`}>
                                                <Icon size={18} className={`${cfg.color} mt-0.5 flex-shrink-0`} />
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center justify-between">
                                                        <span className={`text-[13px] font-[600] ${cfg.color}`}>{cfg.label}</span>
                                                        <span className="text-[13px] font-[700] text-gray-700">
                                                            {cfg.sign}{adj.quantity} {item.unit}
                                                        </span>
                                                    </div>
                                                    <div className="flex items-center justify-between mt-1">
                                                        <span className="text-[11px] text-gray-400">
                                                            {adj.previousStock} → {adj.newStock} {item.unit}
                                                        </span>
                                                        <span className="text-[11px] text-gray-400">
                                                            {new Date(adj.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                                                        </span>
                                                    </div>
                                                    {adj.reason && (
                                                        <p className="text-[11px] text-gray-500 mt-1 truncate">{adj.reason}</p>
                                                    )}
                                                    {adj.adjustedBy?.name && (
                                                        <p className="text-[11px] text-gray-400 mt-0.5">by {adj.adjustedBy.name}</p>
                                                    )}
                                                </div>
                                            </div>
                                        )
                                    })}
                                </div>
                            ) : (
                                <p className="text-[13px] text-gray-400 text-center py-6">No stock adjustments recorded yet</p>
                            )}
                        </div>
                    </>
                )}
            </div>
        </div>
    )
}

const DetailCell = ({ label, value, highlight }) => (
    <div>
        <p className="text-[11px] text-gray-400 font-[500]">{label}</p>
        <p className={`text-[14px] font-[600] mt-0.5 ${highlight ? 'text-red-500' : 'text-[#1A181B]'}`}>{value}</p>
    </div>
)

export default InventoryDetailDrawer
