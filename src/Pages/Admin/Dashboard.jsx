import React, { useState, useEffect, useRef } from 'react'
import { Eye, ChevronRight, Zap, AlertCircle, ChevronDown, Package, TrendingUp, UtensilsCrossed, Users, Clock } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import BookingDrawer from './components/BookingDrawer'
import DonutChart from './components/charts/DonutChart'
import LineChart from './components/charts/LineChart'
import { computeYTicks } from './components/charts/chartUtils'
import StaffOnShiftWidget from './components/StaffOnShiftWidget'
import BusinessReportModal from './components/BusinessReportModal'
import { useAuth } from '../../Context/AuthContext'

import { useTelemetry } from '../../hooks/queries/adminQueries'
import { useAdminBranch } from '../../Context/AdminBranchContext'
import { SkeletonStatGrid, SkeletonRows } from '../../Components/Common/Skeleton'

// Helper to map API stats to UI display
const formatStats = (apiStats) => {
  if (!apiStats) return []
  return [
    { label: "Today's Orders", value: apiStats.todayOrders?.toString() || '0', type: 'simple' },
    { label: "Active Offers", value: apiStats.activeOffers?.toString() || '0', type: 'simple' },
    {
      label: "Menu",
      value: apiStats.activeMenu?.toString() || '0',
      subValue: apiStats.inactiveMenu?.toString() || '0',
      subLabel: "(Inactive)",
      activeLabel: "(Active)",
      type: 'complex'
    },
    { label: "Today's Earnings", value: apiStats.todayEarnings || '₹0.00', type: 'simple' },
    { label: "Active Tables", value: `${apiStats.activeTables || 0} Active`, subValue: `/ ${apiStats.freeTables || 0} Free`, type: 'text-complex' },
  ]
}

// Helper for rush mode stats
const formatRushStats = (apiStats) => {
  if (!apiStats) return []
  return [
    { label: "Today's Orders", value: apiStats.todayOrders?.toString() || '0', type: 'simple' },
    { label: "Today's Reservation", value: apiStats.todayReservations?.toString() || '0', type: 'simple' },
    { label: "Active Tables", value: `${apiStats.activeTables || 0} Active`, subValue: `/ ${apiStats.freeTables || 0} Free`, type: 'text-complex' },
  ]
}

const EARNINGS_OPTIONS = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
]

// ─── Customer Request Card ───────────────────────────────────────────────────
// Single row in the Customer Requests panel on the admin Dashboard.
// Three visual states: pending-overdue (red, with "Assign to waiter"
// CTA), pending-on-time (amber "Waiting for response"), accepted
// (gray "Accepted by <waiter>"). The CTA navigates to the Tables
// dashboard with the matching table drawer pre-opened.
const RequestCard = ({ req, onAssign }) => {
    const isOverdue = !!req.isOverdue
    const accepted = req.status === 'accepted' && req.waiterName
    const cardCls = isOverdue
        ? 'bg-[#FFF2F2] border border-[#FF3B30]'
        : 'bg-white border border-[#EAECF0]'

    return (
        <div className={`p-3 rounded-xl flex items-center gap-3 ${cardCls}`}>
            {/* Table avatar */}
            <div className="w-12 h-12 rounded-lg bg-[#F4F3FF] flex items-center justify-center text-[14px] font-[700] text-[#1A181B] flex-shrink-0">
                {req.table}
            </div>

            {/* Type + location + status */}
            <div className="flex-1 min-w-0">
                <h3 className={`text-[14px] font-[700] truncate ${isOverdue ? 'text-[#FF3B30]' : 'text-[#1A181B]'}`}>
                    {req.typeLabel || req.type}
                </h3>
                <p className="text-[12px] text-[#6B7280] truncate leading-[16px]">{req.location || '—'}</p>
                {isOverdue ? (
                    <p className="text-[12px] font-[500] text-[#FF3B30] flex items-center gap-1 mt-0.5">
                        <AlertCircle size={12} /> Overdue
                    </p>
                ) : accepted ? (
                    <p className="text-[12px] font-[500] text-[#8D848F] truncate leading-[16px]">
                        Accepted by {req.waiterName}
                    </p>
                ) : req.status === 'pending' ? (
                    <p className="text-[12px] font-[500] text-[#F59E0B] leading-[16px]">
                        Waiting for response
                    </p>
                ) : null}
            </div>

            {/* Time + assign CTA */}
            <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                <span className="text-[11px] text-gray-400 whitespace-nowrap">{req.time}</span>
                {isOverdue && (
                    <button
                        onClick={() => onAssign?.(req)}
                        className="text-[11px] font-[600] text-[#FE8301] border border-[#FE8301] px-3 py-1.5 rounded-md hover:bg-[#FE8301]/5 transition-colors whitespace-nowrap"
                    >
                        Assign to waiter
                    </button>
                )}
            </div>
        </div>
    )
}

// ─── Bookings Table (shared between normal + rush) ───────────────────────────
const BookingsTable = ({ bookings, bookingFilter, onViewBooking, rushMode }) => {
    const filtered = bookings.filter(b => {
        if (bookingFilter === 'Table Reservation') return b.type === 'Table'
        if (bookingFilter === 'Event') return b.type === 'Event'
        return true
    })

    return (
        <div className={`overflow-x-auto ${rushMode ? 'p-[1px]' : ''}`}>
            <table className={`w-full min-w-[800px] ${rushMode ? 'border border-[#FFCC00]' : ''}`}>
                <thead className={`bg-[#EEEEEE] border-b ${rushMode ? 'border-[#DDDDDD]' : 'border-gray-100'}`}>
                    <tr>
                        <th className={`text-left py-3 px-4 text-[12px] font-[600] text-[#6B7280] ${rushMode ? 'border-r border-[#EEEEEE]' : ''}`}>Customer</th>
                        <th className={`text-left py-3 px-4 text-[12px] font-[600] text-[#6B7280] ${rushMode ? 'border-r border-[#EEEEEE]' : ''}`}>Table No./Hall name</th>
                        <th className={`text-left py-3 px-4 text-[12px] font-[600] text-[#6B7280] ${rushMode ? 'border-r border-[#EEEEEE]' : ''}`}>Type</th>
                        <th className={`text-left py-3 px-4 text-[12px] font-[600] text-[#6B7280] ${rushMode ? 'border-r border-[#EEEEEE]' : ''}`}>Status</th>
                        <th className={`text-center py-3 px-4 text-[12px] font-[600] text-[#6B7280] ${rushMode ? 'border-r border-[#EEEEEE]' : ''}`}>Guest Count</th>
                        <th className={`text-left py-3 px-4 text-[12px] font-[600] text-[#6B7280] ${rushMode ? 'border-r border-[#EEEEEE]' : ''}`}>Date & Time</th>
                        <th className="text-center py-3 px-4 text-[12px] font-[600] text-[#6B7280]">Action</th>
                    </tr>
                </thead>
                <tbody>
                    {filtered.length === 0 ? (
                        <tr>
                            <td colSpan={7} className="py-10 text-center text-[14px] text-gray-400 font-[500]">
                                No bookings found
                            </td>
                        </tr>
                    ) : filtered.map((booking) => (
                        <tr key={booking.id || booking._id} className={`border-b ${rushMode ? 'border-gray-50' : 'border-gray-200'} last:border-0 hover:bg-gray-50/50`}>
                            <td className="py-4 px-4 text-[14px] font-[600] text-[#1A181B]">{booking.customer}</td>
                            <td className="py-4 px-4 text-[14px] font-[500] text-[#1A181B]">{booking.table}</td>
                            <td className="py-4 px-4">
                                <span className={`px-3 py-1 rounded-lg text-[12px] font-[500] ${booking.type === 'Table' ? 'bg-[#EBF5FF] text-[#2F80ED]' : 'bg-[#FAF5FF] text-[#9333EA]'}`}>
                                    {booking.type}
                                </span>
                            </td>
                            <td className="py-4 px-4">
                                <span className={`px-3 py-1 rounded-lg text-[12px] font-[500] ${
                                    booking.status === 'Ongoing' || booking.status === 'Confirmed' ? 'bg-[#DCFCE7] text-[#22C55E]'
                                    : booking.status === 'Pending' ? 'bg-[#FEF3C7] text-[#D97706]'
                                    : 'bg-[#EBF5FF] text-[#2F80ED]'
                                }`}>
                                    {booking.status}
                                </span>
                            </td>
                            <td className="py-4 px-4 text-[14px] text-gray-600 text-center">{booking.guests}</td>
                            <td className="py-4 px-4">
                                <div className="text-[14px] text-[#1A181B]">{booking.date}</div>
                                <div className="text-[12px] text-gray-500">{booking.time || booking.timeSlot || '—'}</div>
                            </td>
                            <td className="py-4 px-4 text-center">
                                <button
                                    className="text-gray-400 hover:text-gray-600 transition-colors"
                                    onClick={() => onViewBooking(booking)}
                                >
                                    <Eye size={18} />
                                </button>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    )
}

// ─── Stats Card ──────────────────────────────────────────────────────────────
const StatCard = ({ stat, className = '', style }) => (
    <div className={`p-4 rounded-2xl shadow-sm flex flex-col justify-between ${className}`} style={style}>
        <p className="text-[14px] font-[600] font-manrope text-[#6B7280] mb-2">{stat.label}</p>
        <div className="flex items-baseline gap-2 flex-wrap">
            {stat.type === 'complex' ? (
                <>
                    <div className="flex items-baseline gap-1">
                        <span className="text-[20px] font-[700] text-[#22C55E]">{stat.value}</span>
                        {stat.activeLabel && <span className="text-[12px] font-[500] text-[#22C55E]">{stat.activeLabel}</span>}
                    </div>
                    <div className="flex items-baseline gap-1">
                        <span className="text-[20px] font-[700] text-[#EF4444]">{stat.subValue}</span>
                        {stat.subLabel && <span className="text-[12px] font-[500] text-[#EF4444]">{stat.subLabel}</span>}
                    </div>
                </>
            ) : (
                <>
                    <span className="text-[20px] font-[700] text-[#1A181B]">{stat.value}</span>
                    {stat.subValue && <span className="text-[12px] text-gray-400 font-[400]">{stat.subValue}</span>}
                </>
            )}
        </div>
    </div>
)

// ─── Main Dashboard ──────────────────────────────────────────────────────────
const Dashboard = () => {
    const navigate = useNavigate()
    const { user } = useAuth()
    const [rushMode, setRushMode] = useState(false)
    const [bookingFilter, setBookingFilter] = useState('All')
    const [timeFilter, setTimeFilter] = useState('Today')
    const [earningsPeriod, setEarningsPeriod] = useState('daily')
    // When true, the operator has explicitly picked a period from the
    // dropdown and the auto-switcher below stops overriding it. Resets
    // whenever the selected branch changes so a fresh branch gets
    // auto-picked on its own data.
    const [userPickedPeriod, setUserPickedPeriod] = useState(false)
    const [selectedBooking, setSelectedBooking] = useState(null)
    const [isDrawerOpen, setIsDrawerOpen] = useState(false)
    const [showEarningsDd, setShowEarningsDd] = useState(false)
    const earningsDdRef = useRef(null)
    // Detailed business report (date-range, patterns, trends, CSV export) —
    // opened on demand by clicking either bottom card, so the dashboard stays
    // a clean live snapshot and the deep analysis lives one click away.
    const [showReportModal, setShowReportModal] = useState(false)

    // Branch scope comes from the global AdminBranchContext switcher
    // (rendered once in AdminLayout's header). Dashboard no longer
    // hosts its own local picker — there used to be one but it
    // excluded Main from its list and showed an "Aggregated view"
    // option, which contradicted the new "tenant owner = Main admin,
    // exactly one branch always" rule. The header switcher already
    // persists to localStorage and the global axios interceptor
    // injects `?branch=<id>` automatically.
    const { selectedBranchId } = useAdminBranch()

    // Telemetry — refetches every 30s and on param change (period / branch /
    // time filter). React Query keeps the previous payload visible while a
    // new branch loads (no spinner flicker between branches).
    const {
        data: telemetry,
        isLoading,
        isError,
        refetch: fetchTelemetry,
    } = useTelemetry({
        earningsPeriod,
        timeFilter,
        // Tenant owner is always scoped to exactly one branch (Main by
        // default; sub-branch via the header switcher). Branch-pinned
        // admins ignore this and let their JWT pin drive the backend.
        branch: selectedBranchId,
    })

    const loading = isLoading
    const error = isError ? 'Failed to load dashboard data' : null

    // Close earnings dropdown on outside click
    useEffect(() => {
        const handler = (e) => {
            if (earningsDdRef.current && !earningsDdRef.current.contains(e.target)) setShowEarningsDd(false)
        }
        document.addEventListener('mousedown', handler)
        return () => document.removeEventListener('mousedown', handler)
    }, [])

    const handleViewBooking = (booking) => {
        setSelectedBooking(booking)
        setIsDrawerOpen(true)
    }

    const handleEarningsChange = (period) => {
        setEarningsPeriod(period)
        setUserPickedPeriod(true)
        setShowEarningsDd(false)
    }

    // Auto-switch the earnings chart based on whether the tenant/branch
    // has any orders today. Zero orders → Monthly (so a fresh tenant sees
    // something useful instead of an empty hourly chart). First order
    // placed → Daily (hourly) view. User dropdown selection wins.
    useEffect(() => {
        if (userPickedPeriod || !telemetry) return
        const todayOrders = telemetry?.stats?.todayOrders ?? 0
        if (todayOrders === 0 && earningsPeriod !== 'monthly') {
            setEarningsPeriod('monthly')
        } else if (todayOrders > 0 && earningsPeriod !== 'daily') {
            setEarningsPeriod('daily')
        }
    }, [telemetry, userPickedPeriod, earningsPeriod])

    // Branch switch resets the override so the new branch re-evaluates.
    useEffect(() => {
        setUserPickedPeriod(false)
    }, [selectedBranchId])

    const getStatusStyle = (status) => {
        switch (status) {
            case 'Preparing': return 'bg-[#FFEDD5] text-[#F97316] border border-[#F97316]/20'
            case 'Ready': return 'bg-[#DCFCE7] text-[#22C55E] border border-[#22C55E]/20'
            case 'New': return 'bg-[#EBF5FF] text-[#2F80ED] border border-[#2F80ED]/20'
            case 'Cancelled': return 'bg-[#FEE2E2] text-[#EF4444] border border-[#EF4444]/20'
            case 'Served': return 'bg-white text-[#6B7280] border border-[#E5E7EB]'
            case 'Overdue': return 'bg-[#FEE2E2] text-[#EF4444] border border-[#EF4444]/20'
            case 'Delayed': return 'bg-[#FEF3C7] text-[#D97706] border border-[#D97706]/20'
            default: return 'bg-gray-100 text-gray-500'
        }
    }

    const earningsYTicks = computeYTicks(
        (telemetry?.earningsData || []).map(d => d.value)
    )
    const earningsSummary = telemetry?.earningsSummary || null
    const earningsPeriodLabel = EARNINGS_OPTIONS.find(o => o.value === earningsPeriod)?.label || 'Daily'
    const formatRupee = (v) => `₹${Number(v || 0).toLocaleString('en-IN')}`

    const customerRequests = telemetry?.customerRequests || []

    // Rush mode golden dashed border style
    const rushBorderStyle = {
        border: '1px solid #DDDDDD',
        borderRadius: '16px',
    }

    // ── Loading State ────────────────────────────────────────────────────────
    // Skeleton paints the page shell (stat cards + booking list) instantly
    // so the admin sees layout structure within ~50ms instead of a centred
    // spinner. The real content swaps in when the query resolves.
    if (loading && !telemetry) {
        return (
            <div className="space-y-6 py-6">
                <SkeletonStatGrid count={5} />
                <SkeletonRows count={6} />
            </div>
        )
    }

    // ── Error State (only if we have no data at all) ─────────────────────────
    if (error && !telemetry) {
        return (
            <div className="h-full flex flex-col items-center justify-center gap-3 py-20">
                <AlertCircle size={36} className="text-[#EF4444]" />
                <p className="text-[14px] font-[600] text-[#1A181B] font-manrope">{error}</p>
                <button
                    onClick={() => fetchTelemetry()}
                    className="px-4 py-2 rounded-lg bg-[#FE8301] text-white text-[14px] font-[600] font-manrope"
                >
                    Retry
                </button>
            </div>
        )
    }

    // ── Rush Mode Toggle Button (shared) ─────────────────────────────────────
    const RushToggle = (
        <div className="flex items-center gap-3 bg-white px-4 py-2 rounded-[12px] border border-[#DDDDDD] shadow-sm">
            <span className="text-[14px] font-[600] font-manrope text-[#111827]">Rush Mode</span>
            <button
                onClick={() => setRushMode(!rushMode)}
                className={`relative w-11 h-6 rounded-full transition-all duration-300 ${rushMode ? 'bg-[#22C55E]' : 'bg-gray-200'}`}
            >
                <div className={`absolute top-1 left-1 bg-white w-4 h-4 rounded-full transition-transform duration-300 shadow-sm ${rushMode ? 'translate-x-5' : ''}`} />
            </button>
        </div>
    )

    // BranchPicker removed — the AdminLayout header now renders the
    // canonical BranchSwitcher. Single source of truth for "which
    // branch am I viewing" across every admin tab.

    // ── Live Orders List (shared renderer) ───────────────────────────────────
    const renderLiveOrders = (containerStyle = {}) => (
        <div className="bg-white rounded-2xl shadow-sm p-0 overflow-hidden flex flex-col" style={containerStyle}>
            <div className="flex justify-between items-center p-4 border-b border-gray-200">
                <h2 className="text-[16px] font-[600] font-manrope text-[#111827]">Live Orders</h2>
                <button onClick={() => navigate('/admin/orders')} className="flex items-center text-[14px] font-[600] font-manrope text-[#2F80ED] hover:underline">
                    View all <ChevronRight size={14} />
                </button>
            </div>
            <div className="flex-1 overflow-y-auto [&::-webkit-scrollbar]:hidden">
                {(telemetry?.liveOrders || []).length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-gray-400">
                        <Package size={32} className="mb-2" />
                        <p className="text-[14px] font-[500]">No live orders right now</p>
                    </div>
                ) : (telemetry?.liveOrders || []).map((order, i) => (
                    <div key={order.orderId || order._id || i} className="flex items-center justify-between p-4 border-b border-[#EEEEEE] last:border-0 hover:bg-gray-50 transition-colors">
                        <div className="flex gap-4 items-center">
                            <span className="text-[14px] font-[600] text-[#1A181B] w-6">{String(i + 1).padStart(2, '0')}</span>
                            <div className="min-w-0 flex-1">
                                <p className="text-[14px] font-[700] text-[#1A181B] truncate uppercase">{order.orderId}</p>
                                <p className="font-manrope text-[12px] font-[500] text-[#645E66] mt-0.5 leading-[20px] truncate">
                                    <span className="text-[#9CA3AF]">{order.table}</span>
                                    <span className="mx-1 text-gray-300">·</span>
                                    {order.items} items
                                    <span className="mx-1 text-gray-300">·</span>
                                    ₹{order.price}
                                </p>
                            </div>
                        </div>
                        <div className="flex items-center shrink-0">
                            <div className="w-[80px] flex justify-end">
                                {order.alertType && (
                                    <span className={`flex items-center gap-1 text-[12px] font-[500] ${order.status === 'Overdue' ? 'text-[#EF4444]' : 'text-[#D97706]'}`}>
                                        <AlertCircle size={14} />
                                        {order.alertType}
                                    </span>
                                )}
                            </div>
                            <div className="w-[80px] flex justify-center">
                                <span className={`px-3 py-1 rounded-full text-[10px] font-[600] border ${getStatusStyle(order.status)}`}>
                                    {order.status}
                                </span>
                            </div>
                            <div className="w-[60px] text-right">
                                <span className="text-[12px] font-[500] text-[#9CA3AF]">{order.time}</span>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    )

    // ── Customer Requests List (shared renderer) ─────────────────────────────
    const renderCustomerRequests = (containerStyle = {}) => (
        <div className="bg-white rounded-2xl shadow-sm p-0 flex flex-col overflow-hidden" style={containerStyle}>
            <div className="flex justify-between items-center p-4">
                <h2 className="text-[16px] font-[600] font-manrope text-[#111827]">Customer Requests</h2>
                {customerRequests.length > 0 && (
                    <span className="text-[12px] font-[600] text-gray-400">{customerRequests.length} active</span>
                )}
            </div>
            <div className="space-y-3 flex-1 overflow-y-auto p-4 pt-0 [&::-webkit-scrollbar]:hidden">
                {customerRequests.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-gray-400">
                        <AlertCircle size={28} className="mb-2" />
                        <p className="text-[14px] font-[500]">No active requests</p>
                    </div>
                ) : customerRequests.map((req) => (
                    <RequestCard
                        key={req.id || req._id}
                        req={req}
                        onAssign={(r) => navigate('/admin/tables', {
                            state: { highlightTable: r.tableId || r.table },
                        })}
                    />
                ))}
            </div>
        </div>
    )

    // ── Bookings Section (shared) ────────────────────────────────────────────
    const renderBookings = (showTimeFilter = true) => (
        <div className="bg-white rounded-2xl shadow-sm p-6 mb-[12px]" style={rushMode ? rushBorderStyle : { border: '1px solid #DDDDDD' }}>
            <div className="mb-6">
                <h2 className="text-[16px] font-[600] font-manrope text-[#111827] mb-4">Bookings Overview</h2>
                <div className="flex flex-col md:flex-row justify-between items-center gap-4">
                    <div className="flex bg-transparent gap-3 overflow-x-auto w-full md:w-auto">
                        {['All', 'Table Reservation', 'Event'].map(tab => (
                            <button
                                key={tab}
                                onClick={() => setBookingFilter(tab)}
                                className={`px-4 py-1.5 rounded-lg text-[12px] font-[600] whitespace-nowrap border transition-all ${bookingFilter === tab
                                    ? 'bg-[#7E22CE] text-white border-[#7E22CE] shadow-sm'
                                    : 'bg-white text-[#374151] border-gray-200 hover:bg-gray-50'
                                    }`}
                            >
                                {tab}
                            </button>
                        ))}
                    </div>
                    {showTimeFilter && (
                        <div className="flex bg-[#F3F4F6] p-1 rounded-lg ml-auto md:ml-0 overflow-x-auto">
                            {['Today', 'Upcoming'].map(time => (
                                <button
                                    key={time}
                                    onClick={() => setTimeFilter(time)}
                                    className={`px-4 py-1.5 rounded-md text-[12px] font-[600] whitespace-nowrap transition-all ${timeFilter === time
                                        ? 'bg-white text-[#111827] shadow-sm'
                                        : 'text-[#6B7280] hover:text-[#374151]'
                                        }`}
                                >
                                    {time}
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            <BookingsTable
                bookings={telemetry?.bookings || []}
                bookingFilter={bookingFilter}
                getStatusStyle={getStatusStyle}
                onViewBooking={handleViewBooking}
                rushMode={rushMode}
            />
        </div>
    )

    // ========== RUSH MODE LAYOUT ==========
    if (rushMode) {
        return (
            <div className="h-full flex flex-col px-6 py-[16px] overflow-y-auto font-manrope">
                {/* Header */}
                <div className="flex justify-between items-start mb-[12px]">
                    <div>
                        <div className="flex items-center gap-3">
                            <h1 className="font-manrope font-[700] text-[20px] leading-[26px] text-[#1A181B]">Dashboard</h1>
                            <div className="flex items-center gap-1.5 px-3 py-1 rounded-[8px]" style={{ backgroundColor: '#FEF3C7', border: '1px solid #806A00' }}>
                                <Zap size={14} className="text-[#806A00]" fill="#FFB200" />
                                <span className="text-[12px] font-[800] text-[#806A00]">Rush Mode Active</span>
                            </div>
                        </div>
                        <p className="font-manrope font-[600] text-[16px] leading-[22px] text-[#645E66] mt-1">Live overview of cafe operations and activity</p>
                    </div>
                    <div className="flex items-center gap-3">
                        {RushToggle}
                    </div>
                </div>

                {/* Rush Stats Cards Row — 4 columns */}
                <div className="grid grid-cols-4 gap-x-[24px] gap-y-[12px] mb-[12px]">
                    {formatRushStats(telemetry?.stats).map((stat) => (
                        <StatCard key={stat.label} stat={stat} className="bg-white" style={rushBorderStyle} />
                    ))}
                    <div className="p-4 rounded-2xl shadow-sm flex flex-col justify-between" style={{ ...rushBorderStyle, backgroundColor: '#FFF9D6', borderColor: '#FFCC00' }}>
                        <p className="text-[14px] font-[600] font-manrope text-[#92400E] mb-2">Pending Orders</p>
                        <span className="text-[20px] font-[700] text-[#1A181B]">{telemetry?.stats?.pendingOrders || '0'}</span>
                    </div>
                </div>

                {/* Main Content Grid — Live Orders + Customer Requests side by side */}
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-x-[24px] gap-y-[12px] mb-[12px]">
                    {renderLiveOrders({ ...rushBorderStyle, height: '480px', borderColor: '#FFCC00', boxShadow: '0px 0px 8px 0px #FFCC0033' })}
                    {renderCustomerRequests({ ...rushBorderStyle, height: '480px', border: '0.5px solid #FFCC00', boxShadow: '0px 0px 8px 0px #FFCC0033' })}
                </div>

                {renderBookings(false)}

                <BookingDrawer
                    isOpen={isDrawerOpen}
                    onClose={() => setIsDrawerOpen(false)}
                    booking={selectedBooking}
                />
            </div>
        )
    }

    // ========== NORMAL MODE LAYOUT ==========
    return (
        <div className="h-full flex flex-col px-6 py-[16px] overflow-y-auto font-manrope">
            {/* Header */}
            <div className="flex justify-between items-center mb-[12px]">
                <div>
                    <h1 className="font-manrope font-[700] text-[20px] leading-[26px] text-[#1A181B]">Dashboard</h1>
                    <p className="font-manrope font-[600] text-[16px] leading-[22px] text-[#645E66] mt-1">Live overview of cafe operations and activity</p>
                </div>
                <div className="flex items-center gap-3">
                    {RushToggle}
                </div>
            </div>

            {/* Stats Cards Row */}
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-x-[24px] gap-y-[12px] mb-[12px]">
                {formatStats(telemetry?.stats).map((stat) => (
                    <StatCard key={stat.label} stat={stat} className="bg-white border border-[#DDDDDD]" />
                ))}
                {/* Pending Orders Card (Highlighted) */}
                <div className="bg-[#E5F2FF] p-4 rounded-2xl border border-[#007AFF] shadow-sm flex flex-col justify-between">
                    <p className="text-[12px] font-[600] font-manrope text-[#007AFF] mb-2">Pending Orders</p>
                    <span className="text-[20px] font-[700] text-[#1A181B]">{telemetry?.stats?.pendingOrders || '0'}</span>
                </div>
            </div>

            {/* Main Content Grid */}
            <div className="grid grid-cols-1 xl:grid-cols-12 gap-x-[24px] gap-y-[12px] mb-[12px]">
                {/* Live Orders (Left Col) */}
                <div className="xl:col-span-6">
                    {renderLiveOrders({ border: '1px solid #DDDDDD', borderRadius: '16px', height: '520px' })}
                </div>

                {/* Customer Requests (Middle Col) */}
                <div className="xl:col-span-4">
                    {renderCustomerRequests({ border: '1px solid #DDDDDD', borderRadius: '16px', height: '520px' })}
                </div>

                {/* Charts (Right Col) */}
                <div className="xl:col-span-2 flex flex-row xl:flex-col gap-4 h-auto xl:h-[520px]">
                    {/* Tables Chart */}
                    <div className="bg-white rounded-2xl border border-[#DDDDDD] shadow-sm flex flex-col items-center justify-center flex-1 py-4">
                        <div className="w-full flex justify-center items-center mb-2">
                            <span className="font-manrope text-[16px] font-[600] text-[#645E66] leading-[20px] text-center">Tables</span>
                        </div>
                        <div className="flex items-center justify-center flex-1 w-full relative">
                            <DonutChart
                                data={[
                                    { label: 'Occupied', value: telemetry?.stats?.activeTables || 0, color: '#FE8301' },
                                    { label: 'Free', value: telemetry?.stats?.freeTables || 0, color: '#F3F4F6' }
                                ]}
                                size={140}
                                thickness={18}
                                centerLabel={
                                    (telemetry?.stats?.activeTables || 0) + (telemetry?.stats?.freeTables || 0) > 0
                                        ? `${Math.round(((telemetry?.stats?.activeTables || 0) / ((telemetry?.stats?.activeTables || 0) + (telemetry?.stats?.freeTables || 0))) * 100)}%`
                                        : '0%'
                                }
                                centerSubLabel={`${telemetry?.stats?.activeTables || 0} Occupied`}
                            />
                        </div>
                    </div>

                    {/* Pending Chart */}
                    <div className="bg-white rounded-2xl border border-[#DDDDDD] shadow-sm flex flex-col items-center justify-center flex-1 py-4 px-2">
                        <div className="w-full flex justify-center items-center mb-2">
                            <span className="text-[16px] font-[600] text-[#645E66]">Pending</span>
                        </div>
                        <div className="flex items-center justify-center mb-4 flex-1">
                            <DonutChart
                                data={telemetry?.pendingChartData || []}
                                size={140}
                                thickness={18}
                                showSegmentLabels={true}
                                startAngle={180}
                            />
                        </div>
                        <div className="w-full px-2 xl:px-4 grid grid-cols-2 gap-x-2 gap-y-2 pb-1">
                            <div className="flex items-center gap-2">
                                <span className="w-3 h-3 rounded-[4px] bg-[#007AFF]" />
                                <span className="text-[12px] font-[500] text-[#645E66]">New</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="w-3 h-3 rounded-[4px] bg-[#22C55E]" />
                                <span className="text-[12px] font-[500] text-[#645E66]">Ready</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="w-3 h-3 rounded-[4px] bg-[#FF8800]" />
                                <span className="text-[12px] font-[500] text-[#645E66]">Preparing</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Bookings Overview */}
            {renderBookings(true)}

            {/* Bottom Row */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-x-6 gap-y-4">
                {/* Most Selling Item (Left) — click opens the detailed
                    business report (any period + patterns/trends + CSV). */}
                <div
                    onClick={() => setShowReportModal(true)}
                    className="lg:col-span-6 bg-white rounded-2xl border border-[#DDDDDD] shadow-sm p-6 cursor-pointer hover:border-[#FE8301] hover:shadow-md transition-all group"
                >
                    <div className="flex items-baseline justify-between mb-6 gap-2">
                        <h2 className="text-[16px] font-[600] font-manrope text-[#111827]">Most Selling Item</h2>
                        <span className="text-[11px] font-[600] font-manrope text-[#FE8301] opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
                            View detailed report <ChevronRight size={12} />
                        </span>
                        {(telemetry?.topItems || []).length > 0 && (
                            <span className="text-[11px] font-[500] font-manrope text-gray-400">
                                {telemetry?.topItemsScope === 'monthToDate' ? 'This month'
                                    : telemetry?.topItemsScope === 'allTime' ? 'All time'
                                    : 'Today'}
                            </span>
                        )}
                    </div>
                    <div className="bg-[#FBF2FD] rounded-2xl p-6 space-y-5">
                        {(telemetry?.topItems || []).length === 0 ? (
                            <p className="text-[14px] text-gray-400 text-center py-4">No sales data yet</p>
                        ) : (telemetry?.topItems || []).map((item) => {
                            const maxCount = Math.max(...(telemetry?.topItems || []).map(t => t.count), 1)
                            return (
                                <div key={item.name} className="flex items-center gap-4">
                                    <span className="text-[14px] font-[600] font-manrope text-[#645E66] w-28 truncate" title={item.name}>{item.name}</span>
                                    <div className="flex-1 flex items-center">
                                        <div
                                            className="h-[24px] rounded-r-[6px] transition-all duration-500"
                                            style={{ width: `${Math.round((item.count / maxCount) * 100)}%`, backgroundColor: item.color || '#AD09D4' }}
                                        />
                                        <span className="ml-3 text-[14px] font-[600] text-[#374151]">{item.count}</span>
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                </div>

                {/* Earnings (Right) */}
                <div className="lg:col-span-6 bg-white rounded-2xl border border-[#DDDDDD] shadow-sm p-6">
                    <div className="flex justify-between items-start mb-4 gap-4">
                        <div className="min-w-0">
                            <div className="flex items-baseline gap-2">
                                <h2 className="text-[16px] font-[600] font-manrope text-[#111827]">Earnings</h2>
                                {/* Parenthesised label now follows the SELECTED filter
                                    so ( Daily / Weekly / Monthly ) always matches the
                                    dropdown — not the backend's chart-bucket hint
                                    (which reads "Hourly" for Daily and "Daily" for
                                    both Weekly and Monthly). */}
                                <span className="text-[12px] text-gray-400 font-[400]">({earningsPeriodLabel})</span>
                            </div>
                            <p className="text-[24px] font-[700] text-[#1A181B] mt-1">
                                {earningsSummary ? formatRupee(earningsSummary.total) : (telemetry?.stats?.todayEarnings || '₹0.00')}
                            </p>
                            {/* Sub-hint: how the chart below is bucketed. Makes the
                                relationship explicit — "Monthly filter, broken down
                                per day" — instead of confusingly showing Monthly at
                                the top and a Daily bucket label beside it. */}
                            {telemetry?.earningsLabel && (
                                <p className="text-[11px] text-gray-400 font-[400] mt-0.5">
                                    Broken down by {telemetry.earningsLabel.toLowerCase()}
                                </p>
                            )}
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                              onClick={() => setShowReportModal(true)}
                              className="flex items-center gap-1 px-3 py-2 rounded-lg text-[13px] font-[600] text-[#FE8301] border border-[#FE8301]/40 hover:bg-[#FE8301]/5 transition-colors whitespace-nowrap"
                          >
                              View report <ChevronRight size={14} />
                          </button>
                          <div className="relative" ref={earningsDdRef}>
                            <button
                                onClick={() => setShowEarningsDd(!showEarningsDd)}
                                className="flex w-[160px] items-center gap-2 px-4 py-2 bg-white border border-[#DDDDDD] rounded-lg text-[14px] font-[500] text-[#374151]"
                            >
                                {earningsPeriodLabel}
                                <ChevronDown size={16} className={`text-[#9CA3AF] ml-auto transition-transform ${showEarningsDd ? 'rotate-180' : ''}`} />
                            </button>
                            {showEarningsDd && (
                                <div className="absolute top-full right-0 mt-1 w-full bg-white border border-[#DDDDDD] rounded-lg shadow-lg z-10 overflow-hidden">
                                    {EARNINGS_OPTIONS.map(opt => (
                                        <button
                                            key={opt.value}
                                            onClick={() => handleEarningsChange(opt.value)}
                                            className={`w-full text-left px-4 py-2 text-[14px] transition-colors ${earningsPeriod === opt.value ? 'bg-[#FE8301] text-white' : 'hover:bg-gray-50'}`}
                                        >
                                            {opt.label}
                                        </button>
                                    ))}
                                </div>
                            )}
                          </div>
                        </div>
                    </div>

                    {earningsSummary && (
                        <div className="flex flex-wrap gap-2 mb-4">
                            {earningsSummary.peakLabel && earningsSummary.peakValue > 0 && (
                                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#EBF5FF] text-[#007AFF] text-[11px] font-[600]">
                                    <TrendingUp size={12} />
                                    <span>Peak · {earningsSummary.peakLabel}</span>
                                    <span className="text-[#1A181B]">{formatRupee(earningsSummary.peakValue)}</span>
                                </div>
                            )}
                            {earningsSummary.average > 0 && (
                                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#F3F4F6] text-[#6B7280] text-[11px] font-[600]">
                                    <span>Avg {earningsPeriod === 'daily' ? '/ active hr' : '/ active day'}</span>
                                    <span className="text-[#1A181B]">{formatRupee(earningsSummary.average)}</span>
                                </div>
                            )}
                        </div>
                    )}

                    <div className="h-[250px] w-full">
                        <LineChart
                            data={telemetry?.earningsData || []}
                            height={250}
                            color="#007AFF"
                            yTicks={earningsYTicks}
                            peakIndex={earningsSummary?.peakIndex}
                            currentIndex={earningsSummary?.currentIndex}
                        />
                    </div>
                </div>
            </div>

            <BookingDrawer
                isOpen={isDrawerOpen}
                onClose={() => setIsDrawerOpen(false)}
                booking={selectedBooking}
            />

            <BusinessReportModal
                isOpen={showReportModal}
                onClose={() => setShowReportModal(false)}
                branchId={selectedBranchId}
            />
        </div>
    )
}

export default Dashboard
