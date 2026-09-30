import React, { useState, useEffect, useCallback } from 'react'
import { ArrowLeft, ChevronDown, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import api from '../../../utils/api'
import { toast } from 'react-hot-toast'

const OfferRedemption = () => {
    const navigate = useNavigate()
    const [dateFilter, setDateFilter] = useState('')
    const [redemptions, setRedemptions] = useState([])
    const [loading, setLoading] = useState(true)
    const [page, setPage] = useState(1)
    const [totalPages, setTotalPages] = useState(1)
    const [total, setTotal] = useState(0)
    const rowsPerPage = 10

    const fetchRedemptions = useCallback(async () => {
        try {
            setLoading(true)
            const params = new URLSearchParams({ page, limit: rowsPerPage })
            if (dateFilter) params.append('filter', dateFilter)
            const res = await api.get(`/promotions/coupons/redemptions?${params}`)
            if (res.data.success) {
                setRedemptions(res.data.redemptions)
                setTotalPages(res.data.totalPages)
                setTotal(res.data.total)
            }
        } catch {
            toast.error('Failed to load redemptions')
        } finally {
            setLoading(false)
        }
    }, [page, dateFilter])

    useEffect(() => { fetchRedemptions() }, [fetchRedemptions])

    // Reset to page 1 when filter changes
    useEffect(() => { setPage(1) }, [dateFilter])

    const fmtDate = (d) => new Date(d).toLocaleDateString('en-IN', {
        day: 'numeric', month: 'short', year: 'numeric'
    })
    const fmtTime = (d) => new Date(d).toLocaleTimeString('en-IN', {
        hour: '2-digit', minute: '2-digit', hour12: true
    })

    // Build page numbers for pagination
    const getPageNumbers = () => {
        const pages = []
        if (totalPages <= 5) {
            for (let i = 1; i <= totalPages; i++) pages.push(i)
        } else {
            pages.push(1)
            if (page > 3) pages.push('...')
            for (let i = Math.max(2, page - 1); i <= Math.min(totalPages - 1, page + 1); i++) pages.push(i)
            if (page < totalPages - 2) pages.push('...')
            pages.push(totalPages)
        }
        return pages
    }

    return (
        <div className="h-full flex flex-col p-6 overflow-y-auto font-manrope">
            {/* Header */}
            <div>
                <button
                    onClick={() => navigate(-1)}
                    className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 mb-6 transition-colors"
                >
                    <ArrowLeft size={16} />
                    <span className="text-[14px] font-[500]">Back to Offers</span>
                </button>

                <div className="mb-6">
                    <h1 className="admin-page-title leading-[28px]">Redemption</h1>
                    <p className="admin-page-subtitle mt-1">Track how offers are used across orders and customers</p>
                </div>
            </div>

            {/* Filter */}
            <div className="mb-6">
                <label className="block text-[12px] font-[500] text-gray-700 mb-1.5">Filter by Date</label>
                <div className="relative w-[240px]">
                    <select
                        className="w-full appearance-none bg-white border border-gray-200 rounded-lg px-4 py-2.5 text-[14px] text-gray-500 focus:outline-none focus:border-[#FE8301]"
                        value={dateFilter}
                        onChange={(e) => setDateFilter(e.target.value)}
                    >
                        <option value="">All Time</option>
                        <option value="today">Today</option>
                        <option value="week">This Week</option>
                        <option value="month">This Month</option>
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" size={16} />
                </div>
            </div>

            {/* Table */}
            {loading ? (
                <div className="flex-1 flex items-center justify-center">
                    <Loader2 size={36} className="animate-spin text-[#FE8301]" />
                </div>
            ) : redemptions.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center text-gray-400 gap-2">
                    <p className="text-[16px] font-semibold">No redemptions found</p>
                    <p className="text-[13px]">
                        {dateFilter ? 'Try a different date range' : 'Coupon redemptions will appear here once customers use them'}
                    </p>
                </div>
            ) : (
                <>
                    <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden mb-6 shadow-sm">
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead className="bg-gray-100 border-b border-gray-200">
                                    <tr>
                                        <th className="text-left py-3 px-6 text-[12px] font-[600] text-gray-500">Customer</th>
                                        <th className="text-left py-3 px-6 text-[12px] font-[600] text-gray-500">Date & Time</th>
                                        <th className="text-left py-3 px-6 text-[12px] font-[600] text-gray-500">Offer Used</th>
                                        <th className="text-left py-3 px-6 text-[12px] font-[600] text-gray-500">Order Value</th>
                                        <th className="text-left py-3 px-6 text-[12px] font-[600] text-gray-500">Amount Saved</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {redemptions.map((item) => (
                                        <tr key={item._id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/50">
                                            <td className="py-4 px-6">
                                                <div className="text-[14px] font-[600] text-[#1A181B]">
                                                    {item.user?.name || 'Guest'}
                                                </div>
                                                <div className="text-[10px] text-gray-400">
                                                    {item.user?.email || (item.user ? '' : 'QR scan / no account')}
                                                </div>
                                            </td>
                                            <td className="py-4 px-6">
                                                <div className="text-[14px] text-[#1A181B]">{fmtDate(item.createdAt)}</div>
                                                <div className="text-[12px] text-gray-500">{fmtTime(item.createdAt)}</div>
                                            </td>
                                            <td className="py-4 px-6">
                                                <div className="text-[14px] text-gray-600">{item.couponTitle}</div>
                                                <div className="text-[10px] text-gray-400 uppercase">{item.couponCode}</div>
                                            </td>
                                            <td className="py-4 px-6 text-[14px] font-[600] text-[#1A181B]">
                                                ₹{item.orderValue.toLocaleString('en-IN')}
                                            </td>
                                            <td className="py-4 px-6 text-[14px] font-[600] text-[#16A34A]">
                                                -₹{item.discountAmount.toLocaleString('en-IN')}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* Pagination */}
                    <div className="flex justify-center items-center gap-2">
                        <button
                            onClick={() => setPage(p => Math.max(1, p - 1))}
                            disabled={page <= 1}
                            className="w-8 h-8 flex items-center justify-center rounded-lg bg-gray-100 text-gray-400 disabled:opacity-50"
                        >
                            <ChevronLeft size={16} />
                        </button>

                        {getPageNumbers().map((p, i) =>
                            p === '...' ? (
                                <div key={`dots-${i}`} className="w-8 h-8 flex items-center justify-center text-gray-400 text-[10px]">...</div>
                            ) : (
                                <button
                                    key={p}
                                    onClick={() => setPage(p)}
                                    className={`w-8 h-8 flex items-center justify-center rounded-lg text-[12px] font-[600] ${
                                        page === p
                                            ? 'bg-[#FFEDD5] text-[#FE8301]'
                                            : 'bg-white text-gray-600 border border-gray-100'
                                    }`}
                                >
                                    {p}
                                </button>
                            )
                        )}

                        <button
                            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                            disabled={page >= totalPages}
                            className="w-8 h-8 flex items-center justify-center rounded-lg bg-gray-200 text-gray-600 disabled:opacity-50"
                        >
                            <ChevronRight size={16} />
                        </button>

                        <div className="flex items-center gap-4 ml-4 text-[12px] text-gray-500">
                            <span>Rows per page <span className="font-[600] text-[#1A181B]">{rowsPerPage}</span></span>
                            <span>{(page - 1) * rowsPerPage + 1}-{Math.min(page * rowsPerPage, total)} of {total}</span>
                        </div>
                    </div>
                </>
            )}
        </div>
    )
}

export default OfferRedemption
