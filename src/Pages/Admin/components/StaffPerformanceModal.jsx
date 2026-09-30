import React, { useState, useEffect } from 'react'
import { X, Loader } from 'lucide-react'
import api from '../../../utils/api'

const StaffPerformanceModal = ({ staff, onClose }) => {
    const [performance, setPerformance] = useState(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')

    useEffect(() => {
        if (!staff?._id) return
        const fetchPerformance = async () => {
            try {
                setLoading(true)
                const res = await api.get(`/staff/${staff._id}/performance`)
                if (res.data.success) {
                    setPerformance(res.data.performance)
                }
            } catch (err) {
                setError('Failed to load performance data')
            } finally {
                setLoading(false)
            }
        }
        fetchPerformance()
    }, [staff?._id])

    if (!staff) return null

    const roleLower = staff.role?.toLowerCase() || ''
    const isChef = roleLower === 'chef'
    const isCaptain = roleLower === 'captain'
    const isWaiter = roleLower === 'waiter' || isCaptain
    const roleLabel = isChef ? 'Chef' : isCaptain ? 'Captain' : isWaiter ? 'Waiter' : (staff.role || 'Staff')
    const isOnDuty = !!staff.isOnDuty
    const fmtINR = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40">
            <div className="bg-white rounded-2xl w-full max-w-[400px] shadow-xl mx-4 overflow-hidden">

                {/* Header */}
                <div className="bg-[#FFF5EE] px-6 pt-5 pb-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="relative">
                            <img
                                src={staff.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(staff.name || 'Staff')}&background=random`}
                                alt={staff.name}
                                className="w-12 h-12 rounded-full object-cover"
                            />
                            <span
                                title={isOnDuty ? 'On Duty' : 'Off Duty'}
                                className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-white ${isOnDuty ? 'bg-[#34C759]' : 'bg-[#9CA3AF]'}`}
                            />
                        </div>
                        <div>
                            <h3 className="text-[16px] font-[700] font-manrope text-[#1A181B]">
                                {staff.name}
                            </h3>
                            <p className="text-[13px] text-[#FE8301] font-[500] font-manrope">
                                {roleLabel} Performance
                            </p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600 transition-colors">
                        <X size={20} />
                    </button>
                </div>

                {/* Content */}
                <div className="p-6">
                    {loading ? (
                        <div className="flex items-center justify-center py-10">
                            <Loader size={24} className="animate-spin text-[#FE8301]" />
                        </div>
                    ) : error ? (
                        <div className="text-center py-8">
                            <p className="text-[14px] text-red-500 font-manrope">{error}</p>
                        </div>
                    ) : isChef && performance ? (
                        <>
                            {/* Chef Stats */}
                            <div className="grid grid-cols-2 gap-3 mb-4">
                                <div className="bg-[#F0FDF4] rounded-xl p-4 border border-[#BBF7D0]">
                                    <p className="text-[12px] text-gray-500 font-manrope mb-1">KOT Completed</p>
                                    <p className="text-[28px] font-[700] text-[#1A181B] font-manrope">{performance.kotCompleted}</p>
                                </div>
                                <div className="bg-[#FEF2F2] rounded-xl p-4 border border-[#FECACA]">
                                    <p className="text-[12px] text-gray-500 font-manrope mb-1">Delayed Orders</p>
                                    <p className="text-[28px] font-[700] text-[#FF3B30] font-manrope">{performance.delayedOrders}</p>
                                </div>
                            </div>

                            {/* Detail rows */}
                            <div className="space-y-3">
                                <div className="flex items-center justify-between px-4 py-3 bg-gray-50 rounded-xl">
                                    <span className="text-[13px] font-[500] font-manrope text-gray-600">Today's KOT</span>
                                    <span className="text-[14px] font-[700] font-manrope text-[#1A181B]">{performance.todayKot}</span>
                                </div>
                                <div className="flex items-center justify-between px-4 py-3 bg-gray-50 rounded-xl">
                                    <span className="text-[13px] font-[500] font-manrope text-gray-600">This Week</span>
                                    <span className="text-[14px] font-[700] font-manrope text-[#1A181B]">{performance.weekKot}</span>
                                </div>
                                <div className="flex items-center justify-between px-4 py-3 bg-gray-50 rounded-xl">
                                    <span className="text-[13px] font-[500] font-manrope text-gray-600">Avg Prep Time</span>
                                    <span className="text-[14px] font-[700] font-manrope text-[#1A181B]">{performance.avgPrepTime} min</span>
                                </div>
                            </div>
                        </>
                    ) : isWaiter && performance ? (
                        <>
                            {/* Waiter / Captain Stats — split into Handled (all
                                non-cancelled orders this user took) vs Served
                                (completed handovers). Captains often hand off
                                to waiters for the actual serve, so handled-only
                                gives a fairer picture of activity. */}
                            <div className="grid grid-cols-2 gap-3 mb-3">
                                <div className="bg-[#F5F3FF] rounded-xl p-4 border border-[#DDD6FE]">
                                    <p className="text-[12px] text-gray-500 font-manrope mb-1">Orders Handled</p>
                                    <p className="text-[28px] font-[700] text-[#1A181B] font-manrope">{performance.ordersHandled ?? 0}</p>
                                    <p className="text-[10px] text-gray-400 font-manrope mt-0.5">all non-cancelled</p>
                                </div>
                                <div className="bg-[#F0FDF4] rounded-xl p-4 border border-[#BBF7D0]">
                                    <p className="text-[12px] text-gray-500 font-manrope mb-1">Orders Served</p>
                                    <p className="text-[28px] font-[700] text-[#1A181B] font-manrope">{performance.ordersServed ?? 0}</p>
                                    <p className="text-[10px] text-gray-400 font-manrope mt-0.5">completed</p>
                                </div>
                            </div>

                            <div className="bg-[#EFF6FF] rounded-xl p-4 border border-[#BFDBFE] mb-4">
                                <p className="text-[12px] text-gray-500 font-manrope mb-1">Lifetime Revenue (served)</p>
                                <p className="text-[22px] font-[700] text-[#1A181B] font-manrope">{fmtINR(performance.totalRevenue)}</p>
                            </div>

                            {/* Detail rows */}
                            <div className="space-y-3">
                                <div className="flex items-center justify-between px-4 py-3 bg-gray-50 rounded-xl">
                                    <span className="text-[13px] font-[500] font-manrope text-gray-600">Today</span>
                                    <span className="text-[13px] font-[700] font-manrope text-[#1A181B] text-right">
                                        {performance.todayHandled ?? 0} handled &middot; {performance.todayServed ?? 0} served
                                        <br />
                                        <span className="text-[12px] font-[600] text-[#22C55E]">{fmtINR(performance.todayRevenue)}</span>
                                    </span>
                                </div>
                                <div className="flex items-center justify-between px-4 py-3 bg-gray-50 rounded-xl">
                                    <span className="text-[13px] font-[500] font-manrope text-gray-600">This Week</span>
                                    <span className="text-[13px] font-[700] font-manrope text-[#1A181B] text-right">
                                        {performance.weekHandled ?? 0} handled &middot; {performance.weekServed ?? 0} served
                                        <br />
                                        <span className="text-[12px] font-[600] text-[#22C55E]">{fmtINR(performance.weekRevenue)}</span>
                                    </span>
                                </div>
                            </div>
                        </>
                    ) : (
                        <div className="text-center py-8">
                            <p className="text-[14px] text-gray-400 font-manrope">No performance data available yet</p>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="px-6 pb-6 flex justify-end">
                    <button
                        onClick={onClose}
                        className="px-6 py-3 bg-[#FE8301] text-white rounded-xl text-[14px] font-[600] font-manrope hover:bg-orange-600 transition-colors"
                    >
                        Close Report
                    </button>
                </div>
            </div>
        </div>
    )
}

export default StaffPerformanceModal
