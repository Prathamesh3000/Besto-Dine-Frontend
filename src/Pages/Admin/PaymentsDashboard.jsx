import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useLocation } from 'react-router-dom'
import { Search, Eye, Download, ChevronDown, Undo2, AlertCircle } from 'lucide-react'
import { toast } from 'react-hot-toast'
import PaymentDetailsModal from './components/PaymentDetailsModal'
import RefundModal from './components/RefundModal'
import RefundsDashboard from './RefundsDashboard'
import api, { razorpayAPI } from '../../utils/api'
import { SkeletonRows } from '../../Components/Common/Skeleton'
import { adminKeys } from '../../hooks/queries/queryKeys'

const statusStyles = {
    successful: 'text-[#34C759]',
    pending: 'text-[#FE8301]',
    failed: 'text-[#FF3B30]',
    refunded: 'text-[#FF3B30]',
}

const methodStyles = {
    'UPI': 'text-[#FE8301]',
    'Card': 'text-[#FE8301]',
    'Cash': 'text-[#34C759]',
    'Net Banking': 'text-[#007AFF]',
    // Added 2026-05-20 alongside the backend `normalizePaymentMethod`.
    // 'Online' is the umbrella label for orders that came through a
    // gateway without a specific instrument recorded; 'Wallet' is the
    // tenant's own loyalty wallet; 'Mixed' is split payment.
    'Online': 'text-[#007AFF]',
    'Wallet': 'text-[#FE8301]',
    'Mixed': 'text-[#702083]',
}

// ─── Pagination helper ────────────────────────────────────────────────────────
const getPaginationRange = (currentPage, totalPages) => {
    if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1)
    if (currentPage <= 3) return [1, 2, 3, 4, '...', totalPages]
    if (currentPage >= totalPages - 2) return [1, '...', totalPages - 3, totalPages - 2, totalPages - 1, totalPages]
    return [1, '...', currentPage - 1, currentPage, currentPage + 1, '...', totalPages]
}

// ─── Date filter helper ───────────────────────────────────────────────────────
const getDateCutoff = (label) => {
    const now = new Date()
    now.setHours(0, 0, 0, 0)
    switch (label) {
        case 'Today': return now
        case 'Yesterday': { const d = new Date(now); d.setDate(d.getDate() - 1); return d }
        case 'Last 7 Days': { const d = new Date(now); d.setDate(d.getDate() - 7); return d }
        case 'Last 30 Days': { const d = new Date(now); d.setDate(d.getDate() - 30); return d }
        default: return null
    }
}

const PaymentsDashboard = () => {
    // Top-level section switch — admin Refunds tab was merged here on
    // 2026-05-20. The Refunds page no longer exists as its own nav item;
    // operators flip this toggle to switch between transaction history
    // and refund handling. Deep-links to /admin/refunds redirect into
    // this section.
    const location = useLocation()
    const [activeSection, setActiveSection] = useState(
        // Honour ?section=refunds (set by the legacy-route redirect) and
        // ?openRefund=1 (notification deep-link) so the page lands on
        // the right surface.
        () => {
            const q = new URLSearchParams(location.search)
            if (q.get('section') === 'refunds' || q.get('openRefund')) return 'refunds'
            if (location.state?.section === 'refunds') return 'refunds'
            return 'payments'
        }
    )

    const [activeFilter, setActiveFilter] = useState('All')
    const [searchTerm, setSearchTerm] = useState('')
    const [selectedMethod, setSelectedMethod] = useState('Method')
    const [selectedDate, setSelectedDate] = useState('Filter by Date')
    const [currentPage, setCurrentPage] = useState(1)
    const [itemsPerPage, setItemsPerPage] = useState(8)
    const [selectedPayment, setSelectedPayment] = useState(null)
    const [showMethodDropdown, setShowMethodDropdown] = useState(false)
    const [showDateDropdown, setShowDateDropdown] = useState(false)
    const [refundPayment, setRefundPayment] = useState(null)
    const [refundLoading, setRefundLoading] = useState(false)

    const methodRef = useRef(null)
    const dateRef = useRef(null)

    // Close dropdowns on outside click
    useEffect(() => {
        const handler = (e) => {
            if (methodRef.current && !methodRef.current.contains(e.target)) setShowMethodDropdown(false)
            if (dateRef.current && !dateRef.current.contains(e.target)) setShowDateDropdown(false)
        }
        document.addEventListener('mousedown', handler)
        return () => document.removeEventListener('mousedown', handler)
    }, [])

    // Payments + admin summary stats — single React Query call.
    // The `fetchPayments` shim preserves existing imperative refetch
    // sites (post-refund refresh, post-modal close).
    const { data: paymentsData, isLoading: loading, isError, refetch } = useQuery({
        queryKey: adminKeys.payments,
        queryFn: async () => {
            const { data } = await api.get('/payments/admin/all')
            if (!data?.success) return { payments: [], stats: null, filters: [] }
            return {
                payments: data.payments || [],
                stats: data.stats || { todayRevenue: 0, successful: 0, pending: 0, failed: 0 },
                filters: data.filters || [],
            }
        },
        staleTime: 30_000,
        keepPreviousData: true,
    })
    const allPayments = useMemo(() => paymentsData?.payments ?? [], [paymentsData?.payments])
    const stats = paymentsData?.stats ?? { todayRevenue: 0, successful: 0, pending: 0, failed: 0 }
    const filters = useMemo(() => paymentsData?.filters ?? [], [paymentsData?.filters])
    const fetchError = isError && !allPayments.length ? 'Failed to load payments' : null
    const fetchPayments = useCallback(() => { refetch() }, [refetch])

    const handleRefund = async (refundData) => {
        if (!refundPayment) return
        try {
            setRefundLoading(true)
            const { data } = await razorpayAPI.refund({
                orderId: refundPayment._orderId || refundPayment.id,
                amount: refundData.amount,
                reason: refundData.reason === 'Other' ? refundData.specifyReason : refundData.reason,
            })
            if (data.success) {
                toast.success(data.message || 'Refund processed successfully')
                fetchPayments()
            }
        } catch (error) {
            toast.error(error.response?.data?.message || 'Refund failed. Please try again.')
        } finally {
            setRefundLoading(false)
            setRefundPayment(null)
        }
    }

    // useEffect to fire fetchPayments() removed — useQuery auto-fetches on
    // mount and the imperative `fetchPayments()` shim covers post-refund
    // and notification-driven refreshes.

    // ── Open-from-notification: admin clicks a Payment notification and the
    // NotificationModal navigates here with `{ openOrderId, fromNotification }`
    // in location state. Find the matching payment and open its details modal.
    // Keyed on location.key so clicking the same notification twice re-fires
    // the effect after the modal has been closed.
    const lastHandledKeyRef = useRef(null)
    useEffect(() => {
        const openOrderId = location.state?.openOrderId
        if (!openOrderId) return
        if (lastHandledKeyRef.current === location.key) return

        const match = (p) => p.orderId === openOrderId || p._id === openOrderId || p.id === openOrderId
        const hit = allPayments.find(match)
        if (hit) {
            lastHandledKeyRef.current = location.key
            setSelectedPayment(hit)
            setActiveFilter('All')
        } else if (!loading) {
            // Payments already finished loading and we couldn't find it —
            // gracefully no-op rather than firing a stale ?q= request.
            lastHandledKeyRef.current = location.key
            toast.error(`Payment for order ${openOrderId} not found`)
        }
    }, [location.key, location.state?.openOrderId, allPayments, loading])

    // ── Client-side filtering ─────────────────────────────────────────────────
    const payments = allPayments.slice().sort((a, b) => {
        const ta = new Date(a.createdAt || 0).getTime();
        const tb = new Date(b.createdAt || 0).getTime();
        return tb - ta;
    }).filter(payment => {
        const matchStatus = activeFilter === 'All' || payment.status.toLowerCase() === activeFilter.toLowerCase()
        const matchMethod = selectedMethod === 'Method' || payment.method === selectedMethod
        const matchSearch = !searchTerm ||
            payment.customer.toLowerCase().includes(searchTerm.toLowerCase()) ||
            payment.table.toLowerCase().includes(searchTerm.toLowerCase()) ||
            payment.id.toLowerCase().includes(searchTerm.toLowerCase())

        // Date filter
        let matchDate = true
        const dateCutoff = getDateCutoff(selectedDate)
        if (dateCutoff) {
            // Parse the display date back (e.g. "27 Mar 2026")
            const paymentDate = new Date(payment.date)
            if (selectedDate === 'Yesterday') {
                const nextDay = new Date(dateCutoff)
                nextDay.setDate(nextDay.getDate() + 1)
                matchDate = paymentDate >= dateCutoff && paymentDate < nextDay
            } else {
                matchDate = paymentDate >= dateCutoff
            }
        }

        return matchStatus && matchMethod && matchSearch && matchDate
    })

    // Reset page when filters change
    useEffect(() => { setCurrentPage(1) }, [activeFilter, selectedMethod, selectedDate, searchTerm])

    // Snap-back: if the user is on a pill that no longer shows up
    // (e.g. "Failed" had 1 row, an admin reconciled it, count dropped
    // to 0 → pill disappears from the row above), fall back to "All"
    // so the page doesn't render an empty filter the user can't
    // unstick.
    useEffect(() => {
        if (!filters.length) return
        const visibleNames = new Set(filters.filter(f => Number(f.count) > 0).map(f => f.name))
        if (visibleNames.size === 0) return
        if (!visibleNames.has(activeFilter)) setActiveFilter('All')
    }, [filters, activeFilter])

    // Pagination
    const totalPages = Math.ceil(payments.length / itemsPerPage)
    const startIndex = (currentPage - 1) * itemsPerPage
    const paginatedPayments = payments.slice(startIndex, startIndex + itemsPerPage)
    const paginationRange = getPaginationRange(currentPage, totalPages)

    const handlePageChange = (page) => {
        if (page >= 1 && page <= totalPages) setCurrentPage(page)
    }

    // ── Export — a structured, admin-readable workbook (not a flat dump).
    //   • Sheet 1 "Summary"  — report meta, the filters that were applied,
    //                          headline totals, and breakdowns by status &
    //                          payment method.
    //   • Sheet 2 "Transactions" — one tidy row per payment with the full
    //                          money breakdown (subtotal → taxes → tip →
    //                          discount → total → paid → refunded → net).
    //   • Sheet 3 "Refunds"  — only when refunds exist; one row per refund
    //                          event for reconciliation.
    // Everything reflects the CURRENT on-screen filters so the file matches
    // exactly what the admin is looking at. Money stays numeric so Excel can
    // sum/sort it.
    const handleExport = async () => {
        if (!payments.length) {
            toast.error('Nothing to export for the current filters')
            return
        }

        const cap = (s) => (s ? String(s).charAt(0).toUpperCase() + String(s).slice(1) : '')
        const sum = (key) => payments.reduce((s, p) => s + (Number(p[key]) || 0), 0)

        const totalBill = sum('total')
        const totalCollected = sum('amountPaid')
        const totalRefunded = sum('refundedAmount')
        const totalTips = sum('tipAmount')
        const totalDiscount = payments.reduce((s, p) => s + (Number(p.couponDiscount) || 0) + (Number(p.discount) || 0) + (Number(p.pointsRedeemed) || 0), 0)
        const totalTax = sum('taxesAndCharges')
        const netRevenue = totalCollected - totalRefunded

        // Breakdown by status & by method (within the filtered set).
        const byStatus = {}
        const byMethod = {}
        payments.forEach(p => {
            const st = cap(p.status) || 'Unknown'
            byStatus[st] = byStatus[st] || { count: 0, amount: 0 }
            byStatus[st].count += 1
            byStatus[st].amount += Number(p.amountPaid) || Number(p.total) || 0

            const m = p.method || 'Unknown'
            byMethod[m] = byMethod[m] || { count: 0, amount: 0 }
            byMethod[m].count += 1
            byMethod[m].amount += Number(p.amountPaid) || Number(p.total) || 0
        })

        const now = new Date()
        const genStr = now.toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true })

        // ── Sheet 1: Summary (array-of-arrays for full layout control) ──
        const summaryAoA = [
            ['BestoDine — Payments Report'],
            ['Generated on', genStr],
            [],
            ['Filters applied'],
            ['Status', activeFilter],
            ['Payment method', selectedMethod === 'Method' ? 'All' : selectedMethod],
            ['Date range', selectedDate === 'Filter by Date' ? 'All time' : selectedDate],
            ['Search', searchTerm || '—'],
            ['Transactions in report', payments.length],
            [],
            ['Money summary (₹)', 'Amount'],
            ['Total bill value', totalBill],
            ['Taxes & charges', totalTax],
            ['Tips collected', totalTips],
            ['Discounts given', totalDiscount],
            ['Amount collected (paid)', totalCollected],
            ['Refunded', totalRefunded],
            ['Net revenue (collected − refunded)', netRevenue],
            [],
            ['By status', 'Count', 'Amount (₹)'],
            ...Object.entries(byStatus).map(([k, v]) => [k, v.count, v.amount]),
            [],
            ['By payment method', 'Count', 'Amount (₹)'],
            ...Object.entries(byMethod).map(([k, v]) => [k, v.count, v.amount]),
        ]
        // xlsx (~400 KB) is fetched only when someone actually exports.
        let XLSX
        try {
            XLSX = await import('xlsx')
        } catch {
            toast.error('Could not load the Excel exporter. Check your connection and try again.')
            return
        }
        const wsSummary = XLSX.utils.aoa_to_sheet(summaryAoA)
        wsSummary['!cols'] = [{ wch: 34 }, { wch: 16 }, { wch: 14 }]

        // ── Sheet 2: Transactions (one row per payment) ──
        const txAoA = [[
            'Sr.', 'Order ID', 'Date', 'Time', 'Customer', 'Phone', 'Table / Type',
            'Method', 'Status', 'Subtotal (₹)', 'Taxes & Charges (₹)', 'Tip (₹)',
            'Coupon', 'Discount (₹)', 'Total Bill (₹)', 'Amount Paid (₹)',
            'Refunded (₹)', 'Net (₹)', 'Razorpay Payment ID',
        ]]
        payments.forEach((p, i) => {
            const discount = (Number(p.couponDiscount) || 0) + (Number(p.discount) || 0) + (Number(p.pointsRedeemed) || 0)
            txAoA.push([
                i + 1,
                p.id,
                p.date,
                p.time,
                p.customer,
                p.phone || '',
                p.table,
                p.method,
                cap(p.status),
                Number(p.subtotal) || 0,
                Number(p.taxesAndCharges) || 0,
                Number(p.tipAmount) || 0,
                p.couponCode || '',
                discount,
                Number(p.total) || 0,
                Number(p.amountPaid) || 0,
                Number(p.refundedAmount) || 0,
                (Number(p.amountPaid) || 0) - (Number(p.refundedAmount) || 0),
                p.razorpayPaymentId || '',
            ])
        })
        // Totals row at the bottom so the admin sees the column sums at a glance.
        txAoA.push([
            '', '', '', '', '', '', '', '', 'TOTAL',
            payments.reduce((s, p) => s + (Number(p.subtotal) || 0), 0),
            totalTax, totalTips, '',
            totalDiscount, totalBill, totalCollected, totalRefunded, netRevenue, '',
        ])
        const wsTx = XLSX.utils.aoa_to_sheet(txAoA)
        wsTx['!cols'] = [
            { wch: 5 }, { wch: 14 }, { wch: 12 }, { wch: 10 }, { wch: 18 }, { wch: 14 },
            { wch: 14 }, { wch: 11 }, { wch: 12 }, { wch: 12 }, { wch: 16 }, { wch: 9 },
            { wch: 12 }, { wch: 12 }, { wch: 13 }, { wch: 14 }, { wch: 12 }, { wch: 12 }, { wch: 22 },
        ]

        const wb = XLSX.utils.book_new()
        XLSX.utils.book_append_sheet(wb, wsSummary, 'Summary')
        XLSX.utils.book_append_sheet(wb, wsTx, 'Transactions')

        // ── Sheet 3: Refunds (only if any) ──
        const refundRows = []
        payments.forEach(p => {
            (p.refunds || []).forEach(r => {
                refundRows.push([
                    p.id, p.customer,
                    r.createdAt ? new Date(r.createdAt).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true }) : '',
                    Number(r.amount) || 0, r.reason || '', cap(r.source), r.actorName || '', r.razorpayRefundId || '',
                ])
            })
        })
        if (refundRows.length) {
            const wsRefunds = XLSX.utils.aoa_to_sheet([
                ['Order ID', 'Customer', 'Refunded On', 'Amount (₹)', 'Reason', 'Source', 'By', 'Razorpay Refund ID'],
                ...refundRows,
            ])
            wsRefunds['!cols'] = [{ wch: 14 }, { wch: 18 }, { wch: 22 }, { wch: 12 }, { wch: 24 }, { wch: 10 }, { wch: 16 }, { wch: 22 }]
            XLSX.utils.book_append_sheet(wb, wsRefunds, 'Refunds')
        }

        XLSX.writeFile(wb, `Payments_Report_${now.toISOString().split('T')[0]}.xlsx`)
        toast.success(`Exported ${payments.length} transaction${payments.length === 1 ? '' : 's'}`)
    }

    return (
        <div className="h-full flex flex-col">
            {/* Header Row — title + section switch. Export button only
                makes sense on the Payments view (refund rows have their
                own download UX inside the embedded RefundsDashboard if
                we add it later). */}
            <div className="flex items-center justify-between mb-4">
                <h1 className="font-manrope font-[700] text-[20px] leading-[26px] text-[#1A181B]">Payments & Refunds</h1>
                {activeSection === 'payments' && (
                    <button
                        onClick={handleExport}
                        className="flex items-center gap-2 px-5 py-2.5 bg-[#FE8301] text-white rounded-xl text-[14px] font-[600] hover:bg-orange-600 transition-colors shadow-sm"
                    >
                        <Download size={18} />
                        Export Report
                    </button>
                )}
            </div>

            {/* Section toggle — Payments | Refunds */}
            <div className="mb-5 flex items-center gap-1 bg-white p-1 rounded-[12px] border border-gray-200 w-fit shadow-sm">
                <button
                    onClick={() => setActiveSection('payments')}
                    className={`px-5 py-2 rounded-[10px] text-[13px] font-manrope font-bold transition-colors ${activeSection === 'payments' ? 'bg-[#FE8301] text-white shadow-sm' : 'text-[#645E66] hover:bg-gray-50'}`}
                >
                    Payments
                </button>
                <button
                    onClick={() => setActiveSection('refunds')}
                    className={`px-5 py-2 rounded-[10px] text-[13px] font-manrope font-bold transition-colors ${activeSection === 'refunds' ? 'bg-[#FE8301] text-white shadow-sm' : 'text-[#645E66] hover:bg-gray-50'}`}
                >
                    Refunds
                </button>
            </div>

            {activeSection === 'refunds' ? (
                <RefundsDashboard embedded />
            ) : (<>

            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                <div className="bg-white rounded-xl border border-gray-100 p-4">
                    <p className="text-[14px] leading-[20px] font-[600] text-gray-500 mb-1">Today's Revenue</p>
                    <p className="text-[24px] leading-[30px] font-[700] text-[#1A181B]">₹{stats.todayRevenue.toLocaleString('en-IN')}</p>
                </div>
                <div className="bg-white rounded-xl border border-gray-100 p-4">
                    <p className="text-[14px] leading-[20px] font-[600] text-gray-500 mb-1">Successful</p>
                    <p className="text-[24px] leading-[30px] font-[700] text-[#1A181B]">{String(stats.successful).padStart(2, '0')}</p>
                </div>
                <div className="bg-white rounded-xl border border-gray-100 p-4">
                    <p className="text-[14px] leading-[20px] font-[600] text-gray-500 mb-1">Pending</p>
                    <p className="text-[24px] leading-[30px] font-[700] text-[#1A181B]">{String(stats.pending).padStart(2, '0')}</p>
                </div>
                <div className="bg-white rounded-xl border border-gray-100 p-4">
                    <p className="text-[14px] leading-[20px] font-[600] text-gray-500 mb-1">Failed</p>
                    <p className="text-[24px] leading-[30px] font-[700] text-[#1A181B]">{String(stats.failed).padStart(2, '0')}</p>
                </div>
            </div>

            {/* Filter Pills — same rule as the Orders tab: only render
                a pill when it has at least one matching row. "All" is
                always shown (so the user can clear a manual filter)
                provided the table itself isn't empty. Zero-count
                pills like "Failed (00)" no longer occupy header space
                when there's nothing to filter for. */}
            {(() => {
                const padded = (n) => String(n).padStart(2, '0');
                const visible = filters.filter(f => {
                    if (f.name === 'All') return Number(f.count) > 0;
                    return Number(f.count) > 0;
                });
                if (visible.length === 0) return null;
                return (
                    <div className="flex items-center gap-2 mb-3 overflow-x-auto no-scrollbar">
                        {visible.map(filter => (
                            <button
                                key={filter.name}
                                onClick={() => { setActiveFilter(filter.name); setCurrentPage(1) }}
                                className={`px-4 py-2 rounded-full border transition-all text-[14px] leading-[20px] font-[600] whitespace-nowrap ${activeFilter === filter.name
                                    ? 'bg-white text-[#702083] border-[#702083] border-[1.5px] shadow-[0px_2px_8px_0px_#00000029]'
                                    : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                                    }`}
                            >
                                {filter.name} ({padded(filter.count)})
                            </button>
                        ))}
                    </div>
                );
            })()}

            {/* Search & Filters Row */}
            <div className="flex flex-wrap items-center gap-3 mb-6 bg-white p-4 rounded-xl border border-gray-100 shadow-sm">
                <div className="flex-1 relative">
                    <Search size={20} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                        type="text"
                        placeholder="Search by customer name, table number"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full pl-12 pr-4 py-3 bg-white border border-gray-200 rounded-xl focus:outline-none focus:border-orange-500 font-manrope font-[500] text-[14px] leading-[20px] focus:ring-2 focus:ring-orange-500/10 transition-all placeholder:text-gray-400"
                    />
                </div>

                {/* Method Filter */}
                <div className="relative" ref={methodRef}>
                    <button
                        onClick={() => { setShowMethodDropdown(!showMethodDropdown); setShowDateDropdown(false) }}
                        className={`flex items-center gap-2 px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-[14px] font-[600] text-gray-600 font-manrope hover:border-gray-300 transition-all min-w-[120px] ${showMethodDropdown ? 'ring-2 ring-orange-100 border-orange-200' : ''}`}
                    >
                        {selectedMethod}
                        <ChevronDown size={16} className={`text-gray-400 transition-transform duration-200 ml-auto ${showMethodDropdown ? 'rotate-180' : ''}`} />
                    </button>
                    {showMethodDropdown && (
                        <div className="absolute top-full right-0 mt-2 w-[180px] bg-white rounded-2xl shadow-[0px_4px_20px_0px_rgba(0,0,0,0.08)] border border-gray-100 z-20 overflow-hidden">
                            {['Method', 'Online', 'UPI', 'Card', 'Cash', 'Net Banking', 'Wallet', 'Mixed'].map((method, index, arr) => (
                                <div key={method}>
                                    <button
                                        onClick={() => { setSelectedMethod(method); setShowMethodDropdown(false) }}
                                        className={`w-full text-left px-5 py-2.5 text-[14px] font-[500] font-manrope transition-colors ${selectedMethod === method ? 'bg-[#FE8301] text-white' : 'text-gray-600 hover:bg-[#FE8301] hover:text-white'}`}
                                    >
                                        {method}
                                    </button>
                                    {index < arr.length - 1 && <div className="h-[1px] bg-gray-100 mx-4" />}
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Date Filter */}
                <div className="relative" ref={dateRef}>
                    <button
                        onClick={() => { setShowDateDropdown(!showDateDropdown); setShowMethodDropdown(false) }}
                        className={`flex items-center gap-2 px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-[14px] font-[600] text-gray-600 font-manrope hover:border-gray-300 transition-all min-w-[140px] ${showDateDropdown ? 'ring-2 ring-orange-100 border-orange-200' : ''}`}
                    >
                        {selectedDate}
                        <ChevronDown size={16} className={`text-gray-400 transition-transform duration-200 ml-auto ${showDateDropdown ? 'rotate-180' : ''}`} />
                    </button>
                    {showDateDropdown && (
                        <div className="absolute top-full right-0 mt-2 w-[180px] bg-white rounded-2xl shadow-[0px_4px_20px_0px_rgba(0,0,0,0.08)] border border-gray-100 z-20 overflow-hidden">
                            {['Filter by Date', 'Today', 'Yesterday', 'Last 7 Days', 'Last 30 Days'].map((date, index, arr) => (
                                <div key={date}>
                                    <button
                                        onClick={() => { setSelectedDate(date); setShowDateDropdown(false) }}
                                        className={`w-full text-left px-5 py-2.5 text-[14px] font-[500] font-manrope transition-colors ${selectedDate === date ? 'bg-[#FE8301] text-white' : 'text-gray-600 hover:bg-[#FE8301] hover:text-white'}`}
                                    >
                                        {date}
                                    </button>
                                    {index < arr.length - 1 && <div className="h-[1px] bg-gray-100 mx-4" />}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* Payments Table */}
            <div className="flex-1 overflow-hidden">
                <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                    <table className="w-full text-left border-collapse">
                        <thead className="bg-[#F8F9FA] text-[12px] uppercase text-gray-500 font-[600] border-b border-gray-200">
                            <tr>
                                <th className="px-6 py-4">Table & Order ID</th>
                                <th className="px-6 py-4">Customer</th>
                                <th className="px-6 py-4">Method</th>
                                <th className="px-6 py-4">Bill Amount</th>
                                <th className="px-6 py-4">Status</th>
                                <th className="px-6 py-4">Date & Time</th>
                                <th className="px-6 py-4 text-center">Action</th>
                            </tr>
                        </thead>
                        <tbody className="text-[14px] text-gray-700">
                            {loading && allPayments.length === 0 ? (
                                <tr>
                                    <td colSpan="7" className="p-0">
                                        <SkeletonRows count={6} className="px-4" />
                                    </td>
                                </tr>
                            ) : fetchError && allPayments.length === 0 ? (
                                <tr>
                                    <td colSpan="7" className="px-6 py-16 text-center">
                                        <div className="flex flex-col items-center justify-center gap-3">
                                            <AlertCircle size={32} className="text-[#EF4444]" />
                                            <span className="text-[14px] font-[600] text-[#1A181B]">{fetchError}</span>
                                            <button onClick={fetchPayments} className="px-4 py-2 rounded-lg bg-[#FE8301] text-white text-[14px] font-[600]">Retry</button>
                                        </div>
                                    </td>
                                </tr>
                            ) : paginatedPayments.length === 0 ? (
                                <tr>
                                    <td colSpan="7" className="px-6 py-16 text-center text-gray-400 text-sm font-[500]">
                                        No payments found.
                                    </td>
                                </tr>
                            ) : paginatedPayments.map((payment) => (
                                <tr key={payment.id || payment._orderId} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                                    <td className="px-6 py-4">
                                        <div className="flex flex-col">
                                            <span className="font-[700] text-[#1A181B] text-[16px]">{payment.table}</span>
                                            <span className="text-gray-400 text-[12px] mt-0.5">{payment.id}</span>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 text-gray-600 font-[500]">{payment.customer}</td>
                                    <td className="px-6 py-4">
                                        <span className={`font-[600] ${methodStyles[payment.method] || 'text-gray-600'}`}>
                                            {payment.method}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 font-[700] text-[#1A181B]">₹{payment.billAmount.toFixed(2)}</td>
                                    <td className="px-6 py-4">
                                        <span className={`font-[600] ${statusStyles[payment.status]}`}>
                                            {payment.status.charAt(0).toUpperCase() + payment.status.slice(1)}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="flex flex-col text-gray-500">
                                            <span className="font-[500]">{payment.date}</span>
                                            <span className="text-[12px] mt-0.5">{payment.time}</span>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="flex items-center justify-center w-[72px] mx-auto">
                                            <div className="w-[34px] flex items-center justify-center">
                                                {payment.status === 'successful' && (
                                                    <button
                                                        onClick={() => setRefundPayment(payment)}
                                                        className="p-2 text-gray-400 hover:text-red-500 transition-colors rounded-lg hover:bg-red-50"
                                                        title="Refund"
                                                    >
                                                        <Undo2 size={18} />
                                                    </button>
                                                )}
                                            </div>
                                            <div className="w-[34px] flex items-center justify-center">
                                                <button
                                                    onClick={() => setSelectedPayment(payment)}
                                                    className="p-2 text-gray-400 hover:text-orange-500 transition-colors rounded-lg hover:bg-orange-50"
                                                    title="View Details"
                                                >
                                                    <Eye size={20} />
                                                </button>
                                            </div>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Pagination */}
            <div className="flex flex-col md:flex-row justify-center items-center py-4 border-t border-gray-100 gap-4 md:gap-6 font-manrope mt-4">
                <div className="flex items-center gap-2">
                    <button
                        disabled={currentPage === 1}
                        onClick={() => handlePageChange(currentPage - 1)}
                        className="w-8 h-8 flex items-center justify-center rounded-lg bg-[#EBEBEB] text-gray-500 hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                        <span className="mb-0.5">‹</span>
                    </button>

                    {paginationRange.map((page, idx) =>
                        page === '...' ? (
                            <span key={`dot-${idx}`} className="w-8 h-8 flex items-center justify-center text-gray-400">...</span>
                        ) : (
                            <button
                                key={page}
                                onClick={() => handlePageChange(page)}
                                className={`w-8 h-8 flex items-center justify-center rounded-lg text-sm font-[600] transition-colors ${currentPage === page ? 'bg-[#FFDBB1] text-[#1A181B]' : 'bg-white text-gray-500 hover:bg-gray-50'}`}
                            >
                                {page}
                            </button>
                        )
                    )}

                    <button
                        disabled={currentPage === totalPages || totalPages === 0}
                        onClick={() => handlePageChange(currentPage + 1)}
                        className="w-8 h-8 flex items-center justify-center rounded-lg bg-[#EBEBEB] text-gray-500 hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                        <span className="mb-0.5">›</span>
                    </button>
                </div>

                <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2 text-sm text-gray-600 font-[500]">
                        <span>Rows per page</span>
                        <select
                            value={itemsPerPage}
                            onChange={(e) => { setItemsPerPage(Number(e.target.value)); setCurrentPage(1) }}
                            className="border-none bg-transparent text-[#1A181B] font-[600] focus:outline-none cursor-pointer"
                        >
                            <option value={4}>4</option>
                            <option value={8}>8</option>
                            <option value={12}>12</option>
                            <option value={16}>16</option>
                        </select>
                    </div>

                    <span className="text-sm text-gray-500 font-[500]">
                        {payments.length > 0 ? `${startIndex + 1}-${Math.min(startIndex + itemsPerPage, payments.length)} of ${payments.length}` : '0-0 of 0'}
                    </span>
                </div>
            </div>

            </>)}

            {/* Payment Details Modal */}
            {selectedPayment && (
                <PaymentDetailsModal
                    payment={selectedPayment}
                    onClose={() => setSelectedPayment(null)}
                    onRefundComplete={fetchPayments}
                />
            )}

            {/* Refund Modal (from table action button) */}
            {refundPayment && (
                <RefundModal
                    payment={refundPayment}
                    onClose={() => setRefundPayment(null)}
                    onRefund={handleRefund}
                    loading={refundLoading}
                />
            )}
        </div>
    )
}

export default PaymentsDashboard
