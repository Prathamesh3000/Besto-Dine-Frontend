import React, { useState, useMemo, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Loader2, RefreshCw, Search, Filter, Calendar, AlertCircle, CheckCircle2, Clock, Check, X } from 'lucide-react'
import toast from 'react-hot-toast'
import { waiterAPI, razorpayAPI, refundRequestAPI } from '../../utils/api'
import RefundModal from './components/RefundModal'
import { SkeletonRows } from '../../Components/Common/Skeleton'
import { useAdminBranch } from '../../Context/AdminBranchContext'

// ─── Tiny presentational helpers ─────────────────────────────────────────────

const StatusPill = ({ order }) => {
    const paid = Number(order.amountPaid || 0)
    const back = Number(order.refundedAmount || 0)

    let label, tone, icon
    if (order.paymentStatus === 'Refunded' || (back > 0 && back >= paid)) {
        label = 'Refunded'
        tone  = 'bg-[#E5FFEB] text-[#2E7D32] border-[#BBF2C2]'
        icon  = <CheckCircle2 size={12} />
    } else if (back > 0) {
        label = 'Partial'
        tone  = 'bg-[#FFF3E6] text-[#B45309] border-[#FFE3BE]'
        icon  = <AlertCircle size={12} />
    } else if (order.status === 'cancelled' && paid > 0) {
        label = 'Pending Manual'
        tone  = 'bg-[#FFF8E1] text-[#92400E] border-[#FDE68A]'
        icon  = <Clock size={12} />
    } else {
        label = '—'
        tone  = 'bg-gray-100 text-gray-500 border-gray-200'
        icon  = null
    }

    return (
        <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full border ${tone}`}>
            {icon}{label}
        </span>
    )
}

const ModeBadge = ({ method, hasRazorpayId }) => {
    const m = (method || '').toLowerCase()
    if (m === 'online' && hasRazorpayId) {
        return <span className="text-[11px] text-[#1F78FF]">Razorpay</span>
    }
    if (m === 'wallet') return <span className="text-[11px] text-[#7C3AED]">Wallet</span>
    if (m === 'cash')   return <span className="text-[11px] text-[#B45309]">Counter (cash)</span>
    return <span className="text-[11px] text-[#8D848F]">{method || '—'}</span>
}

const StatCard = ({ label, amount, count, accent = 'text-[#1A181B]' }) => (
    <div className="bg-white rounded-2xl border border-[#F0F0F0] px-4 py-3 shadow-sm">
        <p className="text-[12px] text-[#645E66] font-varela">{label}</p>
        <p className={`text-[22px] font-nunito font-bold tabular-nums ${accent}`}>
            ₹{Number(amount || 0).toFixed(0)}
        </p>
        {count != null && (
            <p className="text-[11px] text-[#8D848F] mt-0.5">{count} refund{count === 1 ? '' : 's'}</p>
        )}
    </div>
)

// ─── Main page ───────────────────────────────────────────────────────────────

// `embedded` skips the outer page padding + "Refunds" title so this
// component can be rendered as a sub-section inside the Payments page
// (where the parent already owns the page-level header and toggle).
const RefundsDashboard = ({ embedded = false } = {}) => {
    // ADM-049 — tab between the legacy Refund Activity view and the new
    // Pending Requests queue. The Pending tab is the surface that
    // satisfies test case ADM-049 — customer cancellations now land here
    // for admin approval before money moves.
    const [view, setView] = useState('requests')          // 'requests' | 'activity'

    // Filters (activity tab)
    const [status, setStatus] = useState('all')           // all | refunded | partial | pending-manual
    const [method, setMethod] = useState('')              // '' | online | Wallet | cash
    const [dateFrom, setDateFrom] = useState('')
    const [dateTo, setDateTo] = useState('')
    const [search, setSearch] = useState('')

    const [page, setPage] = useState(1)

    // Manual-refund modal
    const [modalPayment, setModalPayment] = useState(null)
    const [modalLoading, setModalLoading] = useState(false)

    // ── Pending refund-request data ────────────────────────────────────────
    const [requestStatus, setRequestStatus] = useState('all') // all | pending | approved | rejected
    // Active branch in every key so a branch switch never shows the
    // previous branch's cached rows (the api interceptor scopes requests).
    const { selectedBranchId } = useAdminBranch()
    const branchKey = selectedBranchId || 'all'
    const {
        data: requestsData,
        isLoading: requestsLoading,
        refetch: refetchRequests,
    } = useQuery({
        queryKey: ['admin', 'refund-requests', { status: requestStatus, branch: branchKey }],
        queryFn: () => refundRequestAPI.list({ status: requestStatus, limit: 50 }).then(r => r.data),
        staleTime: 30_000,
        keepPreviousData: true,
        onError: (err) => toast.error(err?.response?.data?.message || 'Failed to load refund requests'),
    })
    const refundRequests = requestsData?.data ?? []
    const [decidingId, setDecidingId] = useState(null)

    const decideRequest = useCallback(async (req, decision) => {
        const note = decision === 'reject'
            ? (window.prompt('Reason for rejecting this refund request?') || '')
            : ''
        if (decision === 'reject' && !note.trim()) {
            // Rejection without a note is fine but make sure the admin
            // didn't just hit Cancel on the prompt expecting nothing
            // to happen. The empty string from a true Cancel is null.
            if (note === null) return
        }
        setDecidingId(req._id)
        try {
            if (decision === 'approve') {
                await refundRequestAPI.approve(req._id)
                toast.success(`Refund of ₹${Number(req.amount).toFixed(0)} approved`)
            } else {
                await refundRequestAPI.reject(req._id, { note })
                toast.success('Refund request rejected')
            }
            refetchRequests()
        } catch (err) {
            toast.error(err.response?.data?.message || `Failed to ${decision} request`)
        } finally {
            setDecidingId(null)
        }
    }, [refetchRequests])

    // ── Refunds list (React Query) ─────────────────────────────────────────
    // Filter combos cache independently — flipping back to "Refunded" after
    // looking at "Pending Manual" paints from cache. `fetchData` shim
    // preserves the imperative refetch sites (RefreshCw button, post-modal
    // refresh).
    const refundParams = useMemo(() => {
        const p = { status, page, limit: 20 }
        if (method) p.method = method
        if (dateFrom) p.from = dateFrom
        if (dateTo)   p.to   = dateTo
        return p
    }, [status, method, dateFrom, dateTo, page])

    const { data: refundsData, isLoading: loading, refetch } = useQuery({
        queryKey: ['admin', 'refunds', refundParams, { branch: branchKey }],
        queryFn: () => waiterAPI.getRefunds(refundParams).then(r => r.data),
        staleTime: 30_000,
        keepPreviousData: true,
        onError: (err) => toast.error(err?.response?.data?.message || 'Failed to load refunds'),
    })
    const rows = useMemo(() => refundsData?.orders ?? [], [refundsData?.orders])
    const summary = refundsData?.summary ?? null
    const pages = refundsData?.pagination?.pages ?? 1
    const total = refundsData?.pagination?.total ?? 0
    const fetchData = useCallback(() => { refetch() }, [refetch])

    // Search is a cheap client-side filter on the already-fetched page
    // (don't re-hit the API on every keystroke).
    const visibleRows = useMemo(() => {
        if (!search.trim()) return rows
        const q = search.trim().toLowerCase()
        return rows.filter(o => {
            return (
                (o.orderId || '').toLowerCase().includes(q) ||
                (o.user?.name || o.customerName || '').toLowerCase().includes(q) ||
                (o.user?.mobile || o.phone || '').toLowerCase().includes(q) ||
                (o.razorpayPaymentId || '').toLowerCase().includes(q)
            )
        })
    }, [rows, search])

    const handleManualRefund = (row) => {
        const refundable = Math.max(0, Number(row.amountPaid || 0) - Number(row.refundedAmount || 0))
        setModalPayment({
            id: row._id,
            _orderId: row._id,
            orderId: row.orderId,
            total: refundable,
            refundableBalance: refundable,
            paymentMethod: row.paymentMethod,
            customerName: row.user?.name || row.customerName,
            amountPaid: row.amountPaid,
            refundedAmount: row.refundedAmount,
        })
    }

    const submitRefund = async (refundData) => {
        if (!modalPayment) return
        setModalLoading(true)
        try {
            const { data } = await razorpayAPI.refund({
                orderId: modalPayment._orderId || modalPayment.id,
                amount: refundData.amount,
                reason: refundData.reason === 'Other' ? refundData.specifyReason : refundData.reason,
            })
            if (data.success) {
                toast.success(data.message || 'Refund processed')
                setModalPayment(null)
                fetchData()
            }
        } catch (err) {
            toast.error(err.response?.data?.message || 'Refund failed')
        } finally {
            setModalLoading(false)
        }
    }

    const clearFilters = () => {
        setStatus('all'); setMethod(''); setDateFrom(''); setDateTo(''); setSearch(''); setPage(1)
    }

    return (
        <div className={embedded ? '' : 'p-4 md:p-6 min-h-screen'}>
            {/* Header — hidden when embedded (parent Payments page owns
                the outer title and the Payments/Refunds section toggle). */}
            {!embedded && (
                <div className="flex items-center justify-between mb-4">
                    <div>
                        <h1 className="text-[22px] md:text-[26px] font-bold font-nunito text-[#1A181B]">Refunds</h1>
                        <p className="text-[13px] text-[#645E66] font-varela mt-0.5">
                            Review pending refund requests and track all refund activity.
                        </p>
                    </div>
                    <button
                        onClick={() => (view === 'requests' ? refetchRequests() : fetchData())}
                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-[#E5E5EA] bg-white text-[13px] font-semibold font-nunito hover:bg-gray-50 active:scale-95 transition-all"
                    >
                        <RefreshCw size={14} className={(view === 'requests' ? requestsLoading : loading) ? 'animate-spin' : ''} />
                        Refresh
                    </button>
                </div>
            )}

            {/* Tab toggle */}
            <div className="mb-5 flex items-center gap-1 bg-white p-1 rounded-[12px] border border-gray-200 w-fit shadow-sm">
                <button
                    onClick={() => setView('requests')}
                    className={`px-5 py-2 rounded-[10px] text-[13px] font-nunito font-bold transition-colors ${view === 'requests' ? 'bg-[#FE8301] text-white shadow-sm' : 'text-[#645E66] hover:bg-gray-50'}`}
                >
                    Pending Requests
                    {refundRequests.filter(r => r.status === 'pending').length > 0 && view !== 'requests' && (
                        <span className="ml-2 inline-flex items-center justify-center w-5 h-5 text-[10px] font-bold rounded-full bg-[#FE8301] text-white">
                            {refundRequests.filter(r => r.status === 'pending').length}
                        </span>
                    )}
                </button>
                <button
                    onClick={() => setView('activity')}
                    className={`px-5 py-2 rounded-[10px] text-[13px] font-nunito font-bold transition-colors ${view === 'activity' ? 'bg-[#FE8301] text-white shadow-sm' : 'text-[#645E66] hover:bg-gray-50'}`}
                >
                    Refund Activity
                </button>
            </div>

            {/* ── PENDING REQUESTS TAB ─────────────────────────────────────── */}
            {view === 'requests' && (
                <div className="bg-white rounded-2xl border border-[#F0F0F0] shadow-sm overflow-hidden">
                    <div className="px-4 py-3 border-b border-[#F5F5F5] flex items-center gap-3">
                        <p className="text-[13px] font-bold font-nunito text-[#1A181B]">Customer refund requests</p>
                        <select
                            value={requestStatus}
                            onChange={(e) => setRequestStatus(e.target.value)}
                            className="ml-auto px-3 py-1.5 rounded-xl border border-[#E5E5EA] text-[12px] font-varela bg-white focus:border-[#FE8301] outline-none"
                        >
                            <option value="all">All</option>
                            <option value="pending">Pending</option>
                            <option value="approved">Approved</option>
                            <option value="rejected">Rejected</option>
                        </select>
                    </div>
                    {requestsLoading ? (
                        <SkeletonRows count={5} className="px-4" />
                    ) : refundRequests.length === 0 ? (
                        <div className="py-16 text-center text-[#8D848F]">
                            <CheckCircle2 size={22} className="mx-auto mb-2 opacity-50" />
                            <p className="text-[13px] font-varela">No {requestStatus !== 'all' ? requestStatus : ''} refund requests.</p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-[13px]">
                                <thead className="bg-[#FAFAFA] text-[#645E66] font-nunito">
                                    <tr>
                                        <th className="text-left px-4 py-3 font-semibold">Order ID</th>
                                        <th className="text-left px-4 py-3 font-semibold">Customer</th>
                                        <th className="text-right px-4 py-3 font-semibold">Amount</th>
                                        <th className="text-left px-4 py-3 font-semibold">Reason</th>
                                        <th className="text-left px-4 py-3 font-semibold">Source</th>
                                        <th className="text-left px-4 py-3 font-semibold">Requested</th>
                                        <th className="text-left px-4 py-3 font-semibold">Status</th>
                                        <th className="text-right px-4 py-3 font-semibold">Action</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {refundRequests.map((rr) => (
                                        <tr key={rr._id} className="border-t border-[#F5F5F5] hover:bg-[#FAFAFA]">
                                            <td className="px-4 py-3 font-semibold text-[#1A181B] font-nunito">{rr.orderIdRef || '—'}</td>
                                            <td className="px-4 py-3 text-[#1A181B] font-varela">
                                                <div>{rr.customerName || 'Guest'}</div>
                                                <div className="text-[11px] text-[#8D848F]">{rr.customerPhone || ''}</div>
                                            </td>
                                            <td className="px-4 py-3 text-right tabular-nums font-varela font-bold">₹{Number(rr.amount || 0).toFixed(0)}</td>
                                            <td className="px-4 py-3 text-[#1A181B] font-varela max-w-[260px]">
                                                <span className="line-clamp-2" title={rr.reason}>{rr.reason || '—'}</span>
                                            </td>
                                            <td className="px-4 py-3 text-[11px] text-[#645E66] font-varela">
                                                {rr.source === 'customer-cancel' ? 'Cancelled' : rr.source === 'customer-request' ? 'Requested' : 'Admin'}
                                            </td>
                                            <td className="px-4 py-3 text-[#645E66] font-varela whitespace-nowrap">
                                                {new Date(rr.createdAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
                                            </td>
                                            <td className="px-4 py-3">
                                                {rr.status === 'pending' ? (
                                                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full border bg-[#FFF8E1] text-[#92400E] border-[#FDE68A]">
                                                        <Clock size={12} /> Pending
                                                    </span>
                                                ) : rr.status === 'approved' ? (
                                                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full border bg-[#E5FFEB] text-[#2E7D32] border-[#BBF2C2]">
                                                        <CheckCircle2 size={12} /> Approved
                                                    </span>
                                                ) : (
                                                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full border bg-[#FFE4E4] text-[#B42318] border-[#FDA4A4]">
                                                        <X size={12} /> Rejected
                                                    </span>
                                                )}
                                            </td>
                                            <td className="px-4 py-3 text-right whitespace-nowrap">
                                                {rr.status === 'pending' ? (
                                                    <div className="inline-flex items-center gap-2">
                                                        <button
                                                            disabled={decidingId === rr._id}
                                                            onClick={() => decideRequest(rr, 'approve')}
                                                            className="inline-flex items-center gap-1 text-[12px] font-semibold text-white bg-[#2E7D32] hover:bg-[#1E5A22] disabled:opacity-50 px-3 py-1.5 rounded-lg active:scale-95 transition-transform"
                                                        >
                                                            {decidingId === rr._id ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                                                            Approve
                                                        </button>
                                                        <button
                                                            disabled={decidingId === rr._id}
                                                            onClick={() => decideRequest(rr, 'reject')}
                                                            className="inline-flex items-center gap-1 text-[12px] font-semibold text-[#B42318] border border-[#FDA4A4] hover:bg-[#FFE4E4] disabled:opacity-50 px-3 py-1.5 rounded-lg active:scale-95 transition-transform"
                                                        >
                                                            <X size={12} />
                                                            Reject
                                                        </button>
                                                    </div>
                                                ) : rr.decidedAt ? (
                                                    <span className="text-[11px] text-[#8D848F]">
                                                        {new Date(rr.decidedAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
                                                    </span>
                                                ) : (
                                                    <span className="text-[12px] text-[#8D848F]">—</span>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}

            {/* ── ACTIVITY TAB (legacy refund-history view) ───────────────── */}
            {view === 'activity' && (<>
            {/* Summary stats */}
            {summary && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
                    <StatCard label="Today" amount={summary.today?.amount} count={summary.today?.count} accent="text-[#1F78FF]" />
                    <StatCard label="This Week" amount={summary.week?.amount} count={summary.week?.count} />
                    <StatCard label="This Month" amount={summary.month?.amount} count={summary.month?.count} />
                    <div className="bg-white rounded-2xl border border-[#F0F0F0] px-4 py-3 shadow-sm">
                        <p className="text-[12px] text-[#645E66] font-varela">Pending Manual</p>
                        <p className={`text-[22px] font-nunito font-bold tabular-nums ${summary.pendingManualCount > 0 ? 'text-[#B45309]' : 'text-[#1A181B]'}`}>
                            {summary.pendingManualCount || 0}
                        </p>
                        <p className="text-[11px] text-[#8D848F] mt-0.5">need action</p>
                    </div>
                </div>
            )}

            {/* Filters row */}
            <div className="bg-white rounded-2xl border border-[#F0F0F0] p-3 mb-4 flex flex-wrap items-center gap-2 shadow-sm">
                <div className="relative flex-1 min-w-[200px]">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8D848F]" />
                    <input
                        type="text"
                        placeholder="Search order ID, customer, phone, refund id…"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="w-full pl-9 pr-3 py-2 rounded-xl border border-[#E5E5EA] text-[13px] font-varela outline-none focus:border-[#FE8301]"
                    />
                </div>

                <select
                    value={status}
                    onChange={(e) => { setPage(1); setStatus(e.target.value) }}
                    className="px-3 py-2 rounded-xl border border-[#E5E5EA] text-[13px] font-varela bg-white focus:border-[#FE8301] outline-none"
                >
                    <option value="all">All statuses</option>
                    <option value="refunded">Refunded</option>
                    <option value="partial">Partial</option>
                    <option value="pending-manual">Pending Manual</option>
                </select>

                <select
                    value={method}
                    onChange={(e) => { setPage(1); setMethod(e.target.value) }}
                    className="px-3 py-2 rounded-xl border border-[#E5E5EA] text-[13px] font-varela bg-white focus:border-[#FE8301] outline-none"
                >
                    <option value="">All methods</option>
                    <option value="online">Online / Razorpay</option>
                    <option value="Wallet">Wallet</option>
                    <option value="cash">Cash</option>
                </select>

                <div className="flex items-center gap-1">
                    <Calendar size={14} className="text-[#8D848F]" />
                    <input
                        type="date"
                        value={dateFrom}
                        onChange={(e) => { setPage(1); setDateFrom(e.target.value) }}
                        className="px-2 py-2 rounded-xl border border-[#E5E5EA] text-[12px] font-varela focus:border-[#FE8301] outline-none"
                    />
                    <span className="text-[#8D848F] text-[12px]">to</span>
                    <input
                        type="date"
                        value={dateTo}
                        onChange={(e) => { setPage(1); setDateTo(e.target.value) }}
                        className="px-2 py-2 rounded-xl border border-[#E5E5EA] text-[12px] font-varela focus:border-[#FE8301] outline-none"
                    />
                </div>

                {(status !== 'all' || method || dateFrom || dateTo || search) && (
                    <button
                        onClick={clearFilters}
                        className="text-[12px] font-semibold text-[#FE8301] hover:underline"
                    >
                        Clear
                    </button>
                )}
            </div>

            {/* Table */}
            <div className="bg-white rounded-2xl border border-[#F0F0F0] shadow-sm overflow-hidden">
                {loading ? (
                    <SkeletonRows count={6} className="px-4" />
                ) : visibleRows.length === 0 ? (
                    <div className="py-16 text-center text-[#8D848F]">
                        <Filter size={22} className="mx-auto mb-2 opacity-50" />
                        <p className="text-[13px] font-varela">
                            {search ? 'No refunds match your search.' : 'No refund activity yet.'}
                        </p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-[13px]">
                            <thead className="bg-[#FAFAFA] text-[#645E66] font-nunito">
                                <tr>
                                    <th className="text-left px-4 py-3 font-semibold">Order ID</th>
                                    <th className="text-left px-4 py-3 font-semibold">Customer</th>
                                    <th className="text-left px-4 py-3 font-semibold">Method</th>
                                    <th className="text-right px-4 py-3 font-semibold">Paid</th>
                                    <th className="text-right px-4 py-3 font-semibold">Refunded</th>
                                    <th className="text-left px-4 py-3 font-semibold">Status</th>
                                    <th className="text-left px-4 py-3 font-semibold">Updated</th>
                                    <th className="text-right px-4 py-3 font-semibold">Action</th>
                                </tr>
                            </thead>
                            <tbody>
                                {visibleRows.map((row) => {
                                    const paid = Number(row.amountPaid || 0)
                                    const back = Number(row.refundedAmount || 0)
                                    const pendingManual = row.status === 'cancelled' && row.paymentStatus === 'Paid' && back === 0
                                    return (
                                        <tr key={row._id} className="border-t border-[#F5F5F5] hover:bg-[#FAFAFA]">
                                            <td className="px-4 py-3 font-semibold text-[#1A181B] font-nunito">{row.orderId || '—'}</td>
                                            <td className="px-4 py-3 text-[#1A181B] font-varela">
                                                <div>{row.user?.name || row.customerName || 'Guest'}</div>
                                                <div className="text-[11px] text-[#8D848F]">{row.user?.mobile || row.phone || ''}</div>
                                            </td>
                                            <td className="px-4 py-3">
                                                <ModeBadge method={row.paymentMethod} hasRazorpayId={!!row.razorpayPaymentId} />
                                                {row.razorpayPaymentId && (
                                                    <div className="text-[10px] text-[#8D848F] truncate max-w-[160px]" title={row.razorpayPaymentId}>
                                                        {row.razorpayPaymentId}
                                                    </div>
                                                )}
                                            </td>
                                            <td className="px-4 py-3 text-right tabular-nums font-varela">₹{paid.toFixed(0)}</td>
                                            <td className="px-4 py-3 text-right tabular-nums font-varela">
                                                {back > 0 ? <span className="text-[#2E7D32] font-semibold">₹{back.toFixed(0)}</span> : <span className="text-[#8D848F]">—</span>}
                                            </td>
                                            <td className="px-4 py-3">
                                                <StatusPill order={row} />
                                            </td>
                                            <td className="px-4 py-3 text-[#645E66] font-varela whitespace-nowrap">
                                                {new Date(row.updatedAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
                                            </td>
                                            <td className="px-4 py-3 text-right">
                                                {pendingManual ? (
                                                    <button
                                                        onClick={() => handleManualRefund(row)}
                                                        className="text-[12px] font-semibold text-white bg-[#FE8301] hover:bg-[#E67700] px-3 py-1.5 rounded-lg active:scale-95 transition-transform"
                                                    >
                                                        Refund now
                                                    </button>
                                                ) : row.paymentStatus === 'Paid' && back < paid && back > 0 ? (
                                                    <button
                                                        onClick={() => handleManualRefund(row)}
                                                        className="text-[12px] font-semibold text-[#FE8301] hover:text-[#E67700]"
                                                    >
                                                        Partial refund
                                                    </button>
                                                ) : (
                                                    <span className="text-[12px] text-[#8D848F]">—</span>
                                                )}
                                            </td>
                                        </tr>
                                    )
                                })}
                            </tbody>
                        </table>
                    </div>
                )}

                {/* Pagination */}
                {pages > 1 && (
                    <div className="flex items-center justify-between px-4 py-3 border-t border-[#F5F5F5] bg-[#FAFAFA]">
                        <span className="text-[12px] text-[#645E66] font-varela">
                            Page {page} of {pages} · {total} total
                        </span>
                        <div className="flex gap-2">
                            <button
                                onClick={() => setPage((p) => Math.max(1, p - 1))}
                                disabled={page <= 1}
                                className="px-3 py-1.5 rounded-lg border border-[#E5E5EA] text-[12px] font-semibold disabled:opacity-40 hover:bg-white"
                            >
                                Prev
                            </button>
                            <button
                                onClick={() => setPage((p) => Math.min(pages, p + 1))}
                                disabled={page >= pages}
                                className="px-3 py-1.5 rounded-lg border border-[#E5E5EA] text-[12px] font-semibold disabled:opacity-40 hover:bg-white"
                            >
                                Next
                            </button>
                        </div>
                    </div>
                )}
            </div>

            </>)}

            {modalPayment && (
                <RefundModal
                    payment={modalPayment}
                    onClose={() => setModalPayment(null)}
                    onRefund={submitRefund}
                    loading={modalLoading}
                />
            )}
        </div>
    )
}

export default RefundsDashboard
