import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { useSearchParams, useLocation } from 'react-router-dom'
import { Search, LayoutGrid, List, Eye, User, AlertCircle, Plus, ChevronLeft, ChevronRight } from 'lucide-react'
import OrderDetailsModal from './components/OrderDetailsModal'
import AddTakeawayOrderModal from './components/AddTakeawayOrderModal'
import api from '../../utils/api'
import { useQueryClient } from '@tanstack/react-query'
import useSocketEvent, { useSocketConnected, useSocketReconnect } from '../../hooks/useSocketEvent'
import { useAdminBranch } from '../../Context/AdminBranchContext'
import toast from 'react-hot-toast'
import {
  useAdminDineInArchive,
  usePastOrdersPage,
} from '../../hooks/queries/adminQueries'
import { SkeletonRows } from '../../Components/Common/Skeleton'

// Format createdAt into a readable time string (e.g. "2:35 PM")
const formatOrderTime = (order) => {
  if (!order.createdAt) return '—'
  return new Date(order.createdAt).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true })
}

// Format createdAt into a readable date string (e.g. "27 Mar 2026")
const formatOrderDate = (order) => {
  if (!order.createdAt) return '—'
  return new Date(order.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

// True if the given timestamp falls inside today (server's local TZ).
// The Dine In and Takeaway tabs scope strictly to today — anything older
// rolls over to the Past Orders tab.
const isToday = (date) => {
  if (!date) return false
  const d = new Date(date)
  if (Number.isNaN(d.getTime())) return false
  const start = new Date()
  start.setHours(0, 0, 0, 0)
  return d >= start
}

// "Belongs on Today's Live tab" — an order is in-scope when EITHER it
// was placed today, OR it transitioned to a closed status (served /
// cancelled) today. Without the second clause, orders placed yesterday
// that finished serving this morning vanish from Live the moment the
// clock rolls past midnight — but the "Completed Today" stat keeps
// counting them, so the card and the list disagree. This helper is
// the single source of truth both sides read from.
const belongsToToday = (order) => {
  if (!order) return false
  if (isToday(order.createdAt)) return true
  if (['served', 'cancelled'].includes(order.status)) {
    return isToday(order.updatedAt || order.createdAt)
  }
  return false
}

// ─── Past-tab filter option tables ─────────────────────────────────────────
// Labels are what the dropdown shows; `value` is what we send to the API
// (empty string = "no filter", which the backend interprets as "all
// statuses" / "any date"). Keeping them in one place avoids the
// label-vs-value drift we had before this refactor.
const PAST_STATUS_OPTIONS = [
  { label: 'Status', value: '' },
  { label: 'Served', value: 'served' },
  { label: 'Cancelled', value: 'cancelled' },
];

const PAST_DATE_OPTIONS = [
  { label: 'Select Date', value: '' },
  { label: 'Today', value: 'today' },
  { label: 'Yesterday', value: 'yesterday' },
  { label: 'Last 7 Days', value: 'last7' },
  { label: 'Last 30 Days', value: 'last30' },
]

// Stats and filters are derived from dbOrders (real API data)

// Dine In tab filter pills. Module-scoped so the snap-back useEffect
// keeps a stable dependency reference and React doesn't re-run the
// effect on every render.
const DINE_IN_FILTERS = ['All', 'New', 'Preparing', 'Ready', 'Served', 'Cancelled']

const statusStyles = {
  new: 'bg-blue-50 text-blue-600 border-blue-200',
  preparing: 'bg-orange-50 text-orange-600 border-orange-200',
  ready: 'bg-green-50 text-green-600 border-green-200',
  served: 'bg-gray-100 text-gray-600 border-gray-200',
  cancelled: 'bg-red-50 text-red-600 border-red-200',
}

const cardBorderStyles = {
  new: 'border-blue-200',
  preparing: 'border-orange-300',
  ready: 'border-green-200',
  served: 'border-gray-200',
  cancelled: 'border-red-200',
}

// ─── Takeaway-specific badge styles (outlined pills) ───────────────────────
const takeawayBadgeStyles = {
  new: 'bg-[#EBF4FF] text-[#1D72E8] border border-[#1D72E8]',
  preparing: 'bg-[#FFF4EB] text-[#FE8301] border border-[#FE8301]',
  ready: 'bg-[#EDFBF3] text-[#1DB954] border border-[#1DB954]',
  served: 'bg-[#F3F4F6] text-[#6B7280] border border-[#9CA3AF]',
  cancelled: 'bg-[#FFF0EF] text-[#FF3B30] border border-[#FF3B30]',
}

const getTakeawayLabel = (status) => {
  // Null guard — a stray order without `status` used to render the
  // label as `undefined.charAt(...)` and crash the row. Show a dash
  // instead so the rest of the card still paints.
  if (!status || typeof status !== 'string') return '—'
  if (status === 'served') return 'Delivered'
  return status.charAt(0).toUpperCase() + status.slice(1)
}

// ─── Ellipsis pagination helper ────────────────────────────────────────────
const getPaginationRange = (currentPage, totalPages) => {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1)
  }
  if (currentPage <= 3) return [1, 2, 3, 4, '...', totalPages]
  if (currentPage >= totalPages - 2) return [1, '...', totalPages - 3, totalPages - 2, totalPages - 1, totalPages]
  return [1, '...', currentPage - 1, currentPage, currentPage + 1, '...', totalPages]
}

// ─── Takeaway Card ──────────────────────────────────────────────────────────
const TakeawayCard = ({ order, onView }) => (
  <div className="bg-white rounded-2xl p-4 flex flex-col shadow-[0px_2px_8px_0px_#00000014]">
    {/* Source pill row removed 2026-05-20 — the QR Scan / STAFF / kiosk
        ribbon at the top of each card was noisy and overlapped the
        type badge below (Takeaway / Dine-In). The order detail drawer
        still shows the source for operators who actually need it.

        2026-05-26 — re-introducing a compact KIOSK badge inline with
        the order id (NOT a full ribbon row) at user request. Kept
        small + monochrome so it doesn't repeat the visual noise that
        got the source-pill removed. */}
    {/* Header */}
    <div className="flex items-start justify-between mb-3">
      <div>
        <p className="text-[16px] font-bold text-[#1A181B] font-manrope leading-[22px]">
          {order.user || 'Guest'}
          {order.isRegistered && <span className="inline-block ml-1 text-orange-400 text-[14px]">★</span>}
        </p>
        <p className="text-[12px] font-medium text-[#9CA3AF] font-manrope mt-[2px] flex items-center gap-1.5">
          <span>{order.id}</span>
          {order.source === 'kiosk' && (
            <span
              className="px-[6px] py-[1px] rounded-[4px] text-[9px] font-bold tracking-wider bg-[#FFF4E5] text-[#FE8301] border border-[#FFE0B8]"
              title="Placed at self-service kiosk"
            >
              KIOSK
            </span>
          )}
          {order.delivery?.requested && (
            <span
              className="px-[6px] py-[1px] rounded-[4px] text-[9px] font-bold tracking-wider bg-[#E7F8EC] text-[#16A34A] border border-[#BBF7D0]"
              title="Home delivery order"
            >
              🛵 DELIVERY
            </span>
          )}
        </p>
      </div>
      <div className="flex flex-col items-end gap-[3px]">
        <span className={`px-[10px] py-[3px] rounded-full text-[12px] font-semibold font-manrope ${takeawayBadgeStyles[order.status] || takeawayBadgeStyles.served}`}>
          {getTakeawayLabel(order.status)}
        </span>
        <span className="text-[11px] font-medium text-[#9CA3AF] font-manrope">
          {formatOrderTime(order)}
        </span>
        {order.pickupTime && (
          <span className="text-[11px] font-semibold text-[#FE8301] font-manrope">
            Pickup: {order.pickupTime}
          </span>
        )}
      </div>
    </div>

    {/* Items section */}
    <div className="bg-[#F8F9FA] rounded-xl px-4 py-3 flex-1 mb-3">
      <p className="text-[14px] font-bold text-[#1A181B] font-manrope mb-2">
        Total Items ({order.items.length.toString().padStart(2, '0')})
      </p>
      {order.items.slice(0, 2).map((item, idx) => (
        <div key={idx} className="flex items-center justify-between mb-[6px] last:mb-0">
          <span className="text-[13px] font-medium text-[#4B5563] font-manrope">{item.name} <span className="text-[#9CA3AF]">x{item.quantity || 1}</span></span>
          <span className="text-[13px] font-semibold text-[#1A181B] font-manrope">₹{(item.price * (item.quantity || 1)).toFixed(0)}</span>
        </div>
      ))}
      {order.items.length > 2 && (
        <button onClick={(e) => { e.stopPropagation(); onView(order) }} className="text-[#FE8301] text-[13px] font-semibold font-manrope mt-[6px]">
          +{order.items.length - 2} more item{order.items.length - 2 > 1 ? 's' : ''}
        </button>
      )}
    </div>

    {/* Footer */}
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-1">
        <span className="text-[14px] font-medium text-[#6B7280] font-manrope">Total</span>
        <span className="text-[15px] font-bold text-[#1A181B] font-manrope">₹{order.total}</span>
      </div>
      <button
        onClick={(e) => { e.stopPropagation(); onView(order) }}
        className="bg-[#F2F2F2] hover:bg-[#E5E5E5] text-[#5C5C5C] w-[32px] h-[32px] flex items-center justify-center rounded-[8px] transition-colors"
      >
        <Eye size={18} />
      </button>
    </div>
  </div>
)

// ─── Main Component ─────────────────────────────────────────────────────────
const OrdersDashboard = () => {
  const location = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()
  const tabFromUrl = searchParams.get('tab') || 'live'
  const [activeTab, setActiveTabState] = useState(tabFromUrl)
  // Branch switcher selection — Branch Admins are locked to their branch,
  // tenant owner can pick or "All Branches" (selectedBranchId=null).
  const { selectedBranchId, branches: adminBranches, isLocked: isBranchLocked } = useAdminBranch()

  const setActiveTab = (tab) => {
    setActiveTabState(tab)
    setSearchParams({ tab })
  }

  useEffect(() => {
    const urlTab = searchParams.get('tab') || 'live'
    if (urlTab !== activeTab) {
        setActiveTabState(urlTab)
    }
  }, [searchParams])
  const [activeFilter, setActiveFilter] = useState('All')
  const [viewMode, setViewMode] = useState('grid')
  const [showAddTakeawayModal, setShowAddTakeawayModal] = useState(false)
  // Takeaway-tab filter state — declared up here so the consolidated
  // tab/view-mode effect below can read takeawayViewMode without hitting
  // the temporal dead zone.
  const [takeawaySearch, setTakeawaySearch] = useState('')
  const [takeawayStatus, setTakeawayStatus] = useState('Status')
  const [takeawayViewMode, setTakeawayViewMode] = useState('grid')
  // Past-tab filter state. Store the value the API expects ('', 'served',
  // 'today', …) — the dropdowns look up the display label from
  // PAST_STATUS_OPTIONS / PAST_DATE_OPTIONS when rendering.
  const [pastStatus, setPastStatus] = useState('')
  const [pastDate, setPastDate] = useState('')
  const [showPastStatusDd, setShowPastStatusDd] = useState(false)
  const [showPastDateDd, setShowPastDateDd] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)
  const [itemsPerPage, setItemsPerPage] = useState(8)
  const [searchTerm, setSearchTerm] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [selectedOrder, setSelectedOrder] = useState(null)

  const statusDdRef = useRef(null)
  const dateDdRef = useRef(null)

  useEffect(() => {
    const handler = (e) => {
      if (statusDdRef.current && !statusDdRef.current.contains(e.target)) setShowPastStatusDd(false)
      if (dateDdRef.current && !dateDdRef.current.contains(e.target)) setShowPastDateDd(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // ─── Live + today's archive (Dine In / Takeaway tabs) ───────────────────
  // React Query handles polling, dedup, branch-scoped caching, and a
  // background refresh on socket events (wired below). The `fetchOrders`
  // shim preserves the imperative-refetch sites scattered through the
  // file (modal close handlers, cleanup callbacks, etc.).
  //
  // IMPORTANT: this block must come BEFORE the derived-stats useMemos
  // below — they reference `dbOrders` / `pastSummary` and would hit a
  // const TDZ otherwise.
  // BUG #23 — while the socket is live, events drive freshness; keep only
  // a slow safety poll. Fall back to a faster poll when disconnected.
  const socketLive = useSocketConnected()
  const {
    data: dbOrders = [],
    isLoading: dineLoading,
    isError: dineIsError,
    refetch: refetchDine,
  } = useAdminDineInArchive(
    { branch: selectedBranchId || 'all' },
    { refetchInterval: socketLive ? 120_000 : 30_000 },
  )
  const loading = dineLoading
  const fetchError = dineIsError ? 'Failed to load orders' : null
  const fetchOrders = useCallback(() => { refetchDine() }, [refetchDine])

  // Debounce the search input so we're not firing a request on every
  // keystroke. 300ms is the sweet spot: fast enough to feel live, slow
  // enough that "downtown" types as one request, not eight.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchTerm.trim()), 300)
    return () => clearTimeout(t)
  }, [searchTerm])

  // ─── Past-tab paginated archive ──────────────────────────────────────────
  // Filter combos are part of the cache key, so flipping back to a
  // previously-loaded page is instant (no spinner). Only fetches while
  // the Past tab is active — `enabled` gates the network call.
  const {
    data: pastResp,
    isLoading: pastLoadingFlag,
    isError: pastIsError,
    refetch: refetchPast,
  } = usePastOrdersPage(
    {
      page: currentPage,
      limit: itemsPerPage,
      branch: selectedBranchId || 'all',
      status: pastStatus,
      dateRange: pastDate,
      search: debouncedSearch,
    },
    { enabled: activeTab === 'past' },
  )
  // Stable refs — useMemo prevents downstream useMemo/useEffect deps from
  // bouncing on every render while the query is loading (the `?? []`
  // fallbacks would otherwise return a new array each render).
  const pastOrders = useMemo(() => pastResp?.orders ?? [], [pastResp?.orders])
  const pastSummary = useMemo(
    () => pastResp?.summary ?? { total: 0, served: 0, cancelled: 0, revenue: 0 },
    [pastResp?.summary],
  )
  const pastPagination = useMemo(
    () => pastResp?.pagination ?? { page: 1, limit: itemsPerPage, total: 0, pages: 1 },
    [pastResp?.pagination, itemsPerPage],
  )
  const pastLoading = pastLoadingFlag
  const pastError = pastIsError ? 'Failed to load past orders' : null
  const fetchPastOrders = useCallback(() => { refetchPast() }, [refetchPast])

  // Reset to page 1 whenever a filter that changes the result set flips.
  // Without this, switching from "Last 7 Days" to "Today" on page 3 would
  // land on an empty page.
  useEffect(() => {
    setCurrentPage(1)
  }, [pastStatus, pastDate, debouncedSearch, selectedBranchId])

  // Socket rooms: the server auto-joins this admin into the tenant-scoped
  // admin room(s) (t:<restaurantId>:admin[:<branchId>]) on connect, so
  // there is nothing to join per branch here (BUG #6). The branch
  // switcher only changes which cache entry / API filter we read.

  // ─── DERIVED STATS (memoized — single pass over dbOrders) ───
  // Note on freshness: dbOrders holds every active order plus the
  // latest ~200 past orders. That's enough for Live's "Completed Today"
  // since the live endpoint already returns today's served rows; it is
  // NOT enough for full historical revenue, which is why the Past tab
  // runs its own server-side summary instead of deriving from this.
  const orderCounts = useMemo(() => {
    const counts = { dineIn: {}, takeaway: {}, all: {} }
    const statusList = ['new', 'preparing', 'ready', 'served', 'cancelled']
    statusList.forEach(s => { counts.dineIn[s] = 0; counts.takeaway[s] = 0; counts.all[s] = 0 })
    counts.dineIn.total = 0; counts.takeaway.total = 0; counts.takeaway.revenue = 0; counts.all.revenue = 0
    counts.dineIn.completedToday = 0; counts.takeaway.completedToday = 0
    counts.dineIn.revenueToday = 0; counts.takeaway.revenueToday = 0
    const startOfToday = new Date()
    startOfToday.setHours(0, 0, 0, 0)
    for (const o of dbOrders) {
      const bucket = o.type === 'takeaway' ? counts.takeaway : counts.dineIn
      // Today-scope uses the same belongsToToday helper as the list
      // filter, so the pill counts always match the rows beneath
      // them — an order served today is counted AND visible even if
      // it was originally placed last night.
      const onToday = belongsToToday(o)
      if (onToday && statusList.includes(o.status)) bucket[o.status]++
      if (onToday) bucket.total = (bucket.total || 0) + 1
      counts.all[o.status] = (counts.all[o.status] || 0) + 1
      if (o.type === 'takeaway' && onToday) counts.takeaway.revenue += (Number(o.total) || 0)
      if (['served', 'cancelled'].includes(o.status)) counts.all.revenue += (Number(o.total) || 0)
      // Served-today bucket — used for the Live tab "Completed Today"
      // and "Revenue Today" stat cards. `updatedAt` reflects the transition
      // to served, which is exactly what we want to count.
      if (o.status === 'served') {
        const updated = new Date(o.updatedAt || o.createdAt)
        if (!Number.isNaN(updated.getTime()) && updated >= startOfToday) {
          bucket.completedToday++
          bucket.revenueToday += (Number(o.total) || 0)
        }
      }
    }
    return counts
  }, [dbOrders])

  const currentStats = useMemo(() => {
    const pad = (n) => String(n).padStart(2, '0')
    if (activeTab === 'live') {
      const c = orderCounts.dineIn
      return [
        { label: 'Active Orders', value: pad(c.new + c.preparing + c.ready), color: 'text-[#007AFF]' },
        { label: 'In Kitchen', value: pad(c.preparing), color: 'text-[#FE8301]' },
        { label: 'Ready to Serve', value: pad(c.ready), color: 'text-[#34C759]' },
        // Completed Today — served dine-in orders whose updatedAt falls
        // inside today. Previously used c.served which accidentally
        // counted every historical served order in dbOrders.
        { label: 'Completed Today', value: pad(c.completedToday), color: 'text-[#645E66]' },
      ]
    }
    if (activeTab === 'takeaway') {
      const c = orderCounts.takeaway
      return [
        { label: 'Active Takeaways', value: pad(c.new + c.preparing + c.ready), color: 'text-[#007AFF]' },
        { label: 'In Kitchen', value: pad(c.preparing), color: 'text-[#FE8301]' },
        { label: 'Ready to Pickup', value: pad(c.ready), color: 'text-[#34C759]' },
        { label: 'Completed Today', value: pad(c.completedToday), color: 'text-[#645E66]' },
      ]
    }
    // Past tab — drive the stat cards from the server-side summary so
    // they reflect the current filter window, not whatever subset the
    // dbOrders cache happens to hold. Revenue covers both dine-in and
    // takeaway past orders since the unified Past tab shows both.
    return [
      { label: 'Total Orders', value: pad(pastSummary.total || 0), color: 'text-[#1F2937]' },
      { label: 'Completed Orders', value: pad(pastSummary.served || 0), color: 'text-[#1F2937]' },
      { label: 'Cancelled Orders', value: pad(pastSummary.cancelled || 0), color: 'text-[#1F2937]' },
      { label: 'Revenue', value: `₹${(pastSummary.revenue || 0).toLocaleString('en-IN')}`, color: 'text-[#1F2937]' },
    ]
  }, [activeTab, orderCounts, pastSummary])

  // Dine In tab filter pills — cover every status the tab now renders.
  // Today's served and cancelled orders stay on this tab so the floor
  // staff have full visibility of the day's activity in one place;
  // anything older has rolled over to the Past Orders tab.
  const filters = useMemo(() => {
    const c = orderCounts.dineIn
    const pad = (n) => String(n).padStart(2, '0')
    const total = (c.new || 0) + (c.preparing || 0) + (c.ready || 0) + (c.served || 0) + (c.cancelled || 0)
    // Only surface pills that have at least one matching order. "All"
    // is included only when there's something to filter; on a quiet
    // shift with zero dine-in activity the row collapses to nothing,
    // so operators don't see six "(00)" placeholders begging for
    // attention. The activeFilter snap-back effect below handles the
    // case where the currently-selected pill disappears.
    const pills = [{ name: 'All', count: pad(total), n: total }]
    if (c.new)        pills.push({ name: 'New',        count: pad(c.new),        n: c.new })
    if (c.preparing)  pills.push({ name: 'Preparing',  count: pad(c.preparing),  n: c.preparing })
    if (c.ready)      pills.push({ name: 'Ready',      count: pad(c.ready),      n: c.ready })
    if (c.served)     pills.push({ name: 'Served',     count: pad(c.served),     n: c.served })
    if (c.cancelled)  pills.push({ name: 'Cancelled',  count: pad(c.cancelled),  n: c.cancelled })
    return total > 0 ? pills : []
  }, [orderCounts])

  // Defensive snap-back: if the user is on a pill that no longer
  // shows up (e.g. they had "Cancelled" selected and the last
  // cancelled order ages out → pill disappears), drop them back to
  // "All" so the list still renders something instead of an
  // unreachable filter state.
  useEffect(() => {
    if (activeTab !== 'live') return
    const visible = filters.map(f => f.name)
    if (visible.length === 0) return            // no orders at all — leave activeFilter alone
    if (!visible.includes(activeFilter)) setActiveFilter('All')
  }, [activeTab, activeFilter, filters])

  // Takeaway tab pills — parallel of `filters` for Dine In. Same rule:
  // only surface a pill when its bucket has at least one order, so a
  // quiet shift doesn't show six "(00)" placeholders. Uses the
  // takeaway counts bucket aggregated from orders fetched on mount.
  // `Status` is the takeaway dropdown's "all" sentinel — kept as the
  // identifier so the existing matchStatus check stays valid.
  const takeawayFilters = useMemo(() => {
    const c = orderCounts.takeaway
    const pad = (n) => String(n).padStart(2, '0')
    const total = (c.new || 0) + (c.preparing || 0) + (c.ready || 0) + (c.served || 0) + (c.cancelled || 0)
    // `name` matches the existing matchStatus comparison
    // (`takeawayStatus.toLowerCase() === o.status`). 'Status' is the
    // sentinel for "show all" — kept verbatim so we don't have to
    // touch every consumer of takeawayStatus elsewhere.
    const pills = [{ name: 'Status', label: 'All', count: pad(total), n: total }]
    if (c.new)       pills.push({ name: 'New',        count: pad(c.new),        n: c.new })
    if (c.preparing) pills.push({ name: 'Preparing',  count: pad(c.preparing),  n: c.preparing })
    if (c.ready)     pills.push({ name: 'Ready',      count: pad(c.ready),      n: c.ready })
    if (c.served)    pills.push({ name: 'Served',     count: pad(c.served),     n: c.served })
    if (c.cancelled) pills.push({ name: 'Cancelled',  count: pad(c.cancelled),  n: c.cancelled })
    return total > 0 ? pills : []
  }, [orderCounts])

  // Snap-back for takeaway pills — mirror of the Dine In effect.
  useEffect(() => {
    if (activeTab !== 'takeaway') return
    const visible = takeawayFilters.map(f => f.name)
    if (visible.length === 0) return
    if (!visible.includes(takeawayStatus)) setTakeawayStatus('Status')
  }, [activeTab, takeawayStatus, takeawayFilters])


  // Auto-open order details when navigated from a notification.
  //
  // Resolution order:
  //   1. Live + today's-past cache (dbOrders) — covers the common case.
  //   2. Current Past-tab page (pastOrders) — if the user was already there.
  //   3. Server fallback — fetch by id / orderId directly so older past
  //      orders still open instead of silently failing.
  //
  // `location.key` is included in the dep list so clicking the SAME
  // notification twice (same openOrderId) re-fires the effect after the
  // modal has been closed. Without it, React skips the re-run because the
  // string value of openOrderId didn't change.
  const lastHandledKeyRef = useRef(null)
  useEffect(() => {
    const openOrderId = location.state?.openOrderId
    if (!openOrderId) return
    // Guard against running twice for the same navigation event.
    if (lastHandledKeyRef.current === location.key) return

    // Formatted orders from /live + /past expose the short id as `id` (see
    // orderController formatter: `id: o.orderId`). `_id` is the Mongo ObjectId.
    // Accept any of the three to tolerate whichever the notification carried.
    const matches = (o) =>
      o.id === openOrderId || o.orderId === openOrderId || o._id === openOrderId

    const fromLive = dbOrders.find(matches)
    if (fromLive) {
      lastHandledKeyRef.current = location.key
      setSelectedOrder(fromLive)
      return
    }

    const fromPast = pastOrders.find(matches)
    if (fromPast) {
      lastHandledKeyRef.current = location.key
      setActiveTabState('past')
      setSelectedOrder(fromPast)
      return
    }

    // Wait until the initial fetch has resolved before hitting the fallback —
    // otherwise we'd fire a redundant detail request every time the user lands
    // on the page from a notification.
    if (loading) return

    let cancelled = false
    lastHandledKeyRef.current = location.key
    ;(async () => {
      try {
        const { data } = await api.get(`/orders/${openOrderId}/detail`)
        if (cancelled) return
        if (data?.success && data.order) {
          setSelectedOrder(data.order)
        } else {
          toast.error('Order not found')
        }
      } catch (err) {
        if (!cancelled) {
          console.error('Failed to open order from notification:', err)
          toast.error('Unable to load this order')
        }
      }
    })()
    return () => { cancelled = true }
  }, [location.key, location.state?.openOrderId, dbOrders, pastOrders, loading])

  // ─── Real-time (BUG #23) ───
  // Previously every event refetched /orders/live + 200 past orders. Now:
  //   • order:updated / order:ready with a known order → patch the cached
  //     row in place from the payload (status / paymentStatus), then a
  //     coalesced background refetch;
  //   • bursts of events collapse into ONE refetch 300 ms after they stop.
  const queryClient = useQueryClient()
  const dineKey = useMemo(() => ['admin', 'orders', 'dine-archive', selectedBranchId || 'all'], [selectedBranchId])
  const refetchTimerRef = useRef(null)
  const pendingPastRef = useRef(false)
  const activeTabRef = useRef(activeTab)
  useEffect(() => { activeTabRef.current = activeTab }, [activeTab])
  const pendingDineRef = useRef(false)
  const scheduleRefetch = useCallback((alsoPast = false, dine = true) => {
    if (dine) pendingDineRef.current = true
    if (alsoPast) pendingPastRef.current = true
    if (refetchTimerRef.current) clearTimeout(refetchTimerRef.current)
    refetchTimerRef.current = setTimeout(() => {
      refetchTimerRef.current = null
      if (pendingDineRef.current) queryClient.invalidateQueries({ queryKey: dineKey })
      pendingDineRef.current = false
      if (pendingPastRef.current && activeTabRef.current === 'past') fetchPastOrders()
      pendingPastRef.current = false
    }, 300)
  }, [queryClient, dineKey, fetchPastOrders])
  useEffect(() => () => { if (refetchTimerRef.current) clearTimeout(refetchTimerRef.current) }, [])

  const patchOrderFromEvent = useCallback((data, forcedStatus) => {
    const oid = data?.orderId
    if (!oid) return false
    const patch = {}
    const status = forcedStatus || data.status
    if (status) patch.status = status
    if (data.paymentStatus) patch.paymentStatus = data.paymentStatus
    if (Object.keys(patch).length === 0) return false
    let found = false
    queryClient.setQueryData(dineKey, (old) => {
      if (!Array.isArray(old)) return old
      return old.map((o) => {
        if (o.id === oid || o.orderId === oid || o._id === oid) {
          found = true
          return { ...o, ...patch, updatedAt: new Date().toISOString() }
        }
        return o
      })
    })
    return found
  }, [queryClient, dineKey])

  useSocketEvent('order:new', () => scheduleRefetch())
  useSocketEvent('order:appended', () => scheduleRefetch())
  // A status-only update already patched into the cache needs no list refetch.
  useSocketEvent('order:updated', (data) => { const patched = patchOrderFromEvent(data); scheduleRefetch(true, !patched) })
  useSocketEvent('order:ready', (data) => { patchOrderFromEvent(data, 'ready'); scheduleRefetch() })
  useSocketEvent('order:cancelled', (data) => { patchOrderFromEvent(data, 'cancelled'); scheduleRefetch(true) })
  // BUG #12 — after a reconnect, resync anything missed while offline.
  useSocketReconnect(() => scheduleRefetch(true))

  // Client-side search+filter for Live / Takeaway tabs only.
  // Past tab short-circuits this path — its filtering happens server-side.
  const orders = dbOrders.filter(order => {
    // Normalize table to a display string: live orders return table as object + tableId string;
    // past orders return table as a plain string.
    const tableStr = typeof order.table === 'string' ? order.table : (order.tableId || order.table?.name || 'Takeaway');
    const matchSearch = !searchTerm ||
      (order.user || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (order.id || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      tableStr.toLowerCase().includes(searchTerm.toLowerCase())

    const matchFilter = activeFilter === 'All' || order.status.toLowerCase() === activeFilter.toLowerCase()

    return matchSearch && matchFilter
  })

  // Re-sync pagination whenever the active tab or the active tab's view
  // mode changes. itemsPerPage is shared across all three tabs (because
  // the backend past-tab fetch accepts it as `limit`), so it has to stay
  // aligned with whichever tab the user is looking at. Grid shows 8
  // cards (4x2), list shows 4 rows.
  useEffect(() => {
    const mode = activeTab === 'takeaway' ? takeawayViewMode : viewMode
    setItemsPerPage(mode === 'grid' ? 8 : 4)
    setCurrentPage(1)
  }, [activeTab, viewMode, takeawayViewMode])

  // Past tab uses server-paginated orders directly; Live/Takeaway apply
  // the client-side status filter over the merged dbOrders cache.
  const displayedOrders = activeTab === 'past'
    ? pastOrders
    : orders.filter(order => {
        // Dine In / Takeaway tabs show orders that "belong to today"
        // — placed today OR closed (served / cancelled) today. The
        // belongsToToday helper is shared with the stat-card and
        // pill-count logic above so the visible list and the headline
        // stats always agree. Without this, an order placed at 11pm
        // and served at 1am would disappear from Live the moment
        // midnight crossed but still count toward "Completed Today".
        if (activeTab === 'live') return order.type !== 'takeaway' && belongsToToday(order)
        if (activeTab === 'takeaway') return order.type === 'takeaway' && belongsToToday(order)
        return order.type !== 'takeaway' && ['served', 'cancelled'].includes(order.status)
      })

  // Past tab: pagination numbers come from the server (over the full
  // filtered set). Other tabs: compute from the client-side slice.
  const totalPages = activeTab === 'past'
    ? (pastPagination.pages || 1)
    : Math.ceil(displayedOrders.length / itemsPerPage)
  const startIndex = (currentPage - 1) * itemsPerPage
  const paginatedOrders = activeTab === 'past'
    ? pastOrders  // backend already returned just this page
    : displayedOrders.slice(startIndex, startIndex + itemsPerPage)
  const totalCount = activeTab === 'past' ? (pastPagination.total || 0) : displayedOrders.length

  const handlePageChange = (page) => {
    if (page >= 1 && page <= totalPages) setCurrentPage(page)
  }

  const paginationRange = getPaginationRange(currentPage, totalPages)

  // ─── TAKEAWAY TAB ──────────────────────────────────────────────────────────
  // (State is declared at the top of the component so the consolidated
  // tab/view-mode effect can read it.)

  // Reset to page 1 whenever a takeaway filter changes, otherwise
  // narrowing from "all statuses" to "Cancelled" on page 3 would land
  // on an empty page. The view-mode sync lives in the consolidated
  // tab/view-mode effect above.
  useEffect(() => {
    if (activeTab === 'takeaway') setCurrentPage(1)
  }, [activeTab, takeawaySearch, takeawayStatus])

  if (activeTab === 'takeaway') {
    // Apply all takeaway filters BEFORE pagination so the stat cards,
    // pagination count, and visible rows all agree. The old code did
    // this in reverse — status+search were applied to paginatedOrders
    // (already sliced to one page), which meant "Cancelled" on page 2
    // could silently render zero rows even though there were plenty in
    // the full set.
    // Takeaway tab shows TODAY's takeaway orders only — yesterday and
    // older roll over to the Past Orders tab regardless of status.
    const allTakeaway = dbOrders.filter(o => o.type === 'takeaway' && isToday(o.createdAt))
    const filteredAll = allTakeaway.filter(o => {
      const term = takeawaySearch.trim().toLowerCase()
      const matchSearch = !term ||
        (o.user || '').toLowerCase().includes(term) ||
        (o.id || '').toLowerCase().includes(term)
      const matchStatus = takeawayStatus === 'Status' || o.status === takeawayStatus.toLowerCase()
      return matchSearch && matchStatus
    })

    // Stats reflect the CURRENT filtered view, not the dbOrders cache.
    // Revenue counts completed orders only — cancelled orders haven't
    // earned money, so folding them in would inflate the number.
    const completed = filteredAll.filter(o => o.status === 'served').length
    const cancelled = filteredAll.filter(o => o.status === 'cancelled').length
    const revenue = filteredAll
      .filter(o => o.status === 'served')
      .reduce((sum, o) => sum + (Number(o.total) || 0), 0)

    const statCards = [
      { label: 'Total Orders', value: String(filteredAll.length).padStart(2, '0'), color: 'text-[#1A181B]' },
      { label: 'Completed Orders', value: String(completed).padStart(2, '0'), color: 'text-[#1A181B]' },
      { label: 'Cancelled Orders', value: String(cancelled).padStart(2, '0'), color: 'text-[#1A181B]' },
      { label: 'Revenue', value: `₹${revenue.toLocaleString('en-IN')}`, color: 'text-[#1A181B]' },
    ]

    // Paginate the filtered set for the rendered cards/rows.
    const takeawayTotalPages = Math.max(1, Math.ceil(filteredAll.length / itemsPerPage))
    const takeawayStartIndex = (currentPage - 1) * itemsPerPage
    const filteredTakeaway = filteredAll.slice(takeawayStartIndex, takeawayStartIndex + itemsPerPage)
    const takeawayPaginationRange = getPaginationRange(currentPage, takeawayTotalPages)
    const takeawayHandlePageChange = (page) => {
      if (page >= 1 && page <= takeawayTotalPages) setCurrentPage(page)
    }

    return (
      <div className="h-full flex flex-col">
        {/* Title */}
        <h1 className="font-manrope font-[700] text-[20px] leading-[26px] text-[#1A181B] mb-4">Order Management</h1>

        {/* Tab row + Add Order button */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-1 bg-white p-1 rounded-[12px] border border-gray-200 w-fit shadow-sm">
            <button
              onClick={() => setActiveTab('live')}
              className="px-6 py-2 rounded-[12px] text-[14px] font-manrope font-semibold text-[#645E66] hover:bg-gray-50 cursor-pointer"
            >
              Dine In
            </button>
            <button
              className="px-6 py-2 rounded-[12px] bg-[#FE8301] text-white text-[14px] font-manrope font-semibold shadow-sm cursor-pointer"
            >
              Takeaway
            </button>
            <button
              onClick={() => setActiveTab('past')}
              className="px-6 py-2 rounded-[12px] text-[14px] font-manrope font-semibold text-[#645E66] hover:bg-gray-50 cursor-pointer"
            >
              Past Orders
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowAddTakeawayModal(true)}
              className="flex items-center gap-2 bg-[#FE8301] hover:bg-[#e07400] text-white px-5 py-[9px] rounded-[12px] text-[14px] font-manrope font-semibold transition-colors shadow-sm"
            >
              <Plus size={18} strokeWidth={2.5} />
              Add Order
            </button>
          </div>
        </div>

        {/* ── Stat Cards ── (mb tightened to match Dine In) */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-3">
          {statCards.map((card) => (
            <div key={card.label} className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
              <p className="text-[14px] leading-[20px] font-[600] font-manrope text-gray-500 mb-1">{card.label}</p>
              <p className={`text-[20px] leading-[26px] font-[700] font-manrope ${card.color}`}>{card.value}</p>
            </div>
          ))}
        </div>

        {/* ── Status Pills (Takeaway) ──
            Mirrors the Dine In pill row. Built from takeawayFilters
            which already hides any status with zero matching orders,
            so a quiet shift collapses the row to nothing instead of
            showing six "(00)" placeholders. Replaces the old Status
            dropdown — the dropdown surface area was 1-click + 1-click
            for the same effect, plus it never communicated counts. */}
        {takeawayFilters.length > 0 && (
          <div className="flex items-center gap-2 mb-3 overflow-x-auto no-scrollbar">
            {takeawayFilters.map(filter => (
              <button
                key={filter.name}
                onClick={() => setTakeawayStatus(filter.name)}
                className={`px-4 py-2 rounded-full border transition-all text-[14px] leading-[20px] tracking-normal font-manrope font-[600] ${takeawayStatus === filter.name
                  ? 'bg-white text-[#702083] border-[#702083] border-[1.5px] shadow-[0px_2px_8px_0px_#00000029]'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                  }`}
              >
                {(filter.label || filter.name)} ({filter.count})
              </button>
            ))}
          </div>
        )}

        {/* ── Filter Bar ── */}
        <div className="flex items-center gap-3 mb-5">
          {/* Search */}
          <div className="flex-1 relative">
            <Search size={20} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search by customer name, table number"
              value={takeawaySearch}
              onChange={e => setTakeawaySearch(e.target.value)}
              className="w-full pl-12 pr-4 py-3 bg-white border border-gray-200 rounded-xl focus:outline-none focus:border-orange-500 font-manrope font-medium text-[14px] leading-[20px] focus:ring-2 focus:ring-orange-500/10 transition-all placeholder:text-gray-400"
            />
          </div>
          <button className="w-9 h-9 flex items-center justify-center bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors flex-shrink-0">
            <Search size={18} />
          </button>

          {/* Grid / List Toggle */}
          <div className="flex bg-white border border-gray-100 rounded-lg p-1 gap-1 flex-shrink-0">
            <button
              onClick={() => setTakeawayViewMode('grid')}
              className={`w-9 h-9 flex items-center justify-center rounded-lg transition-all ${takeawayViewMode === 'grid' ? 'bg-orange-500 text-white shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}
            >
              <LayoutGrid size={18} />
            </button>
            <button
              onClick={() => setTakeawayViewMode('list')}
              className={`w-9 h-9 flex items-center justify-center rounded-lg transition-all ${takeawayViewMode === 'list' ? 'bg-orange-500 text-white shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}
            >
              <List size={18} />
            </button>
          </div>
        </div>

        {/* Grid / List Content */}
        <div className="flex-1 overflow-y-auto pb-4">
          {loading && dbOrders.length === 0 ? (
            <SkeletonRows count={6} className="px-4" />
          ) : filteredTakeaway.length === 0 ? (
            <div className="flex items-center justify-center h-40 text-gray-400 font-manrope text-sm">No takeaway orders found.</div>
          ) : takeawayViewMode === 'grid' ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {filteredTakeaway.map((order) => (
                <TakeawayCard key={order._id || order.id || order.orderId} order={order} onView={setSelectedOrder} />
              ))}
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <table className="w-full text-left border-collapse">
                <thead className="bg-[#F8F9FA] text-xs uppercase text-gray-500 font-[600] border-b border-gray-200">
                  <tr>
                    <th className="px-6 py-4">Sr. No.</th>
                    <th className="px-6 py-4">Order ID</th>
                    <th className="px-6 py-4">Customer</th>
                    <th className="px-6 py-4">Status</th>
                    <th className="px-6 py-4">Time</th>
                    <th className="px-6 py-4">Date</th>
                    <th className="px-6 py-4 text-right">Amount</th>
                    <th className="px-6 py-4 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="text-sm text-gray-700">
                  {filteredTakeaway.map((order, index) => (
                    <tr key={order._id || order.id || order.orderId} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4 font-[600] text-gray-900">{(takeawayStartIndex + index + 1).toString().padStart(2, '0')}</td>
                      <td className="px-6 py-4 font-[600] text-gray-500 text-xs">
                        <span className="inline-flex items-center gap-1.5">
                          <span>{order.id}</span>
                          {order.source === 'kiosk' && (
                            <span className="px-[6px] py-[1px] rounded-[4px] text-[9px] font-bold tracking-wider bg-[#FFF4E5] text-[#FE8301] border border-[#FFE0B8]" title="Placed at self-service kiosk">KIOSK</span>
                          )}
                        </span>
                      </td>
                      <td className="px-6 py-4 font-[600] text-gray-800">{order.user || 'Guest'}{order.isRegistered && <span className="ml-1 text-orange-400">★</span>}</td>
                      <td className="px-6 py-4">
                        <span className={`px-2.5 py-1 rounded-full text-xs font-[600] border ${takeawayBadgeStyles[order.status] || takeawayBadgeStyles.served}`}>
                          {getTakeawayLabel(order.status)}
                        </span>
                      </td>
                      <td className="px-6 py-4 font-[600] text-gray-500">{formatOrderTime(order)}</td>
                      <td className="px-6 py-4 font-[600] text-gray-500">{formatOrderDate(order)}</td>
                      <td className="px-6 py-4 text-right font-[700] text-gray-900">₹{order.total}</td>
                      <td className="px-6 py-4 text-center">
                        <button
                          onClick={() => setSelectedOrder(order)}
                          className="text-gray-400 hover:text-orange-500 transition-colors p-1 rounded-md hover:bg-orange-50"
                        >
                          <Eye size={20} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Pagination — takeaway tab uses filteredAll so the numbers
            track the filtered set, not the full dbOrders cache. */}
        <div className="flex items-center justify-center gap-5 py-4 border-t border-gray-100 font-manrope flex-wrap">
          <div className="flex items-center gap-1">
            <button
              disabled={currentPage === 1}
              onClick={() => takeawayHandlePageChange(currentPage - 1)}
              className="w-8 h-8 flex items-center justify-center rounded-lg bg-[#F3F4F6] text-gray-500 hover:bg-gray-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft size={16} />
            </button>
            {takeawayPaginationRange.map((page, idx) =>
              page === '...' ? (
                <span key={`dot-${idx}`} className="w-8 h-8 flex items-center justify-center text-sm text-gray-400">...</span>
              ) : (
                <button
                  key={page}
                  onClick={() => takeawayHandlePageChange(page)}
                  className={`w-8 h-8 flex items-center justify-center rounded-lg text-sm font-semibold transition-colors ${currentPage === page ? 'bg-[#FFDBB1] text-[#1A181B]' : 'bg-white text-gray-500 hover:bg-gray-50'}`}
                >
                  {page}
                </button>
              )
            )}
            <button
              disabled={currentPage === takeawayTotalPages || takeawayTotalPages === 0}
              onClick={() => takeawayHandlePageChange(currentPage + 1)}
              className="w-8 h-8 flex items-center justify-center rounded-lg bg-[#F3F4F6] text-gray-500 hover:bg-gray-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronRight size={16} />
            </button>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5 text-sm text-[#6B7280] font-medium">
              <span>Rows per page</span>
              <select
                value={itemsPerPage}
                onChange={(e) => { setItemsPerPage(Number(e.target.value)); setCurrentPage(1) }}
                className="border-none bg-transparent text-[#1A181B] font-semibold focus:outline-none cursor-pointer"
              >
                <option value={4}>4</option>
                <option value={8}>8</option>
                <option value={12}>12</option>
                <option value={16}>16</option>
              </select>
            </div>
            <span className="text-sm text-[#9CA3AF] font-medium">
              {filteredAll.length > 0
                ? `${takeawayStartIndex + 1}-${Math.min(takeawayStartIndex + itemsPerPage, filteredAll.length)} of ${filteredAll.length}`
                : '0-0 of 0'}
            </span>
          </div>
        </div>

        {selectedOrder && (
          <OrderDetailsModal
            order={selectedOrder}
            onRefresh={fetchOrders}
            onClose={() => setSelectedOrder(null)}
          />
        )}
        {showAddTakeawayModal && (
          <AddTakeawayOrderModal
            onClose={() => setShowAddTakeawayModal(false)}
            adminBranches={adminBranches}
            activeBranchId={selectedBranchId}
            isBranchLocked={isBranchLocked}
            onPlaceOrder={async (orderPayload) => {
              try {
                await api.post('/orders', orderPayload)
                toast.success('Takeaway order placed successfully!')
                setShowAddTakeawayModal(false)
                fetchOrders()
              } catch (error) {
                console.error('API Error saving takeaway order:', error)
                toast.error(error.response?.data?.message || 'Failed to place takeaway order')
              }
            }}
          />
        )}
      </div>
    )
  }


  // ── LIVE ORDER / PAST ORDERS — UNCHANGED ORIGINAL ─────────────────────────
  return (
    <div className="h-full flex flex-col">
      {/* Title */}
      <h1 className="font-manrope font-[700] text-[20px] leading-[26px] text-[#1A181B] mb-4">Order Management</h1>

      {/* Tabs */}
      <div className="mb-4">
        <div className="flex items-center gap-1 bg-white p-1 rounded-[12px] border border-gray-200 w-fit shadow-sm">
          <button
            onClick={() => setActiveTab('live')}
            className={`px-6 py-2 rounded-[12px] transition-all text-[14px] leading-[20px] tracking-normal font-manrope font-[600] cursor-pointer ${activeTab === 'live' ? 'bg-[#FE8301] text-white shadow-sm' : 'text-[#645E66] hover:bg-gray-50'}`}
          >
            Dine In
          </button>
          <button
            onClick={() => setActiveTab('takeaway')}
            className="px-6 py-2 rounded-[12px] text-[14px] leading-[20px] tracking-normal font-manrope font-[600] cursor-pointer text-[#645E66] hover:bg-gray-50"
          >
            Takeaway
          </button>
          <button
            onClick={() => setActiveTab('past')}
            className={`px-6 py-2 rounded-[12px] transition-all text-[14px] leading-[20px] tracking-normal font-manrope font-[600] cursor-pointer ${activeTab === 'past' ? 'bg-[#FE8301] text-white shadow-sm' : 'text-[#645E66] hover:bg-gray-50'}`}
          >
            Past Orders
          </button>
        </div>
      </div>

      {/* Stats Cards — tightened bottom margin (mb-4 → mb-3) so the
          pill row and search bar sit closer to the cards. User request:
          "reduce space between cards and search bar". */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-3">
        {currentStats.map((stat) => (
          <div key={stat.label} className="bg-white rounded-xl border border-gray-100 p-4">
            <p className="text-[14px] leading-[20px] tracking-normal font-manrope font-[600] text-gray-500 mb-1">{stat.label}</p>
            <p className={`text-[20px] leading-[26px] tracking-normal font-manrope font-[600] ${stat.color}`}>{stat.value}</p>
          </div>
        ))}
      </div>

      {/* Filter Pills (Live only). Dropped the extra pb-2 — the pills
          have intrinsic height; the extra bottom-padding was doubling
          the gap to the search bar below. */}
      {activeTab === 'live' && (
        <div className="flex items-center gap-2 mb-3 overflow-x-auto no-scrollbar">
          {filters.map(filter => (
            <button
              key={filter.name}
              onClick={() => setActiveFilter(filter.name)}
              className={`px-4 py-2 rounded-full border transition-all text-[14px] leading-[20px] tracking-normal font-manrope font-[600] ${activeFilter === filter.name
                ? 'bg-white text-[#702083] border-[#702083] border-[1.5px] shadow-[0px_2px_8px_0px_#00000029]'
                : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                }`}
            >
              {filter.name} ({filter.count})
            </button>
          ))}
        </div>
      )}

      {/* Search & View Toggle */}
      <div className="flex items-center gap-3 mb-4">
        <div className="flex-1 relative">
          <Search size={20} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 font-[600]" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search by customer name, order ID"
            className="w-full pl-12 pr-4 py-3 bg-white border border-gray-200 rounded-xl focus:outline-none focus:border-orange-500 font-inter font-medium text-[14px] leading-[20px] tracking-normal focus:ring-2 focus:ring-orange-500/10 transition-all placeholder:text-gray-400"
          />
        </div>
        <button className="w-9 h-9 flex items-center justify-center bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors">
          <Search size={20} />
        </button>

        {activeTab === 'past' && (
          <>
            {/* Status custom dropdown */}
            <div className="relative" ref={statusDdRef}>
              <button
                onClick={() => { setShowPastStatusDd(!showPastStatusDd); setShowPastDateDd(false) }}
                className="flex items-center gap-2 px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-[14px] font-[600] font-manrope text-gray-600 min-w-[120px] hover:border-gray-300 transition-all"
              >
                {PAST_STATUS_OPTIONS.find(o => o.value === pastStatus)?.label || 'Status'}
                <svg className={`ml-auto w-3 h-3 text-gray-400 transition-transform ${showPastStatusDd ? 'rotate-180' : ''}`} viewBox="0 0 10 6" fill="none"><path d="M1 1L5 5L9 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </button>
              {showPastStatusDd && (
                <div className="absolute top-full right-0 mt-2 w-[160px] bg-white rounded-2xl shadow-[0px_4px_20px_0px_rgba(0,0,0,0.08)] border border-gray-100 z-20 overflow-hidden">
                  {PAST_STATUS_OPTIONS.map((opt, idx, arr) => (
                    <div key={opt.label}>
                      <button
                        onClick={() => { setPastStatus(opt.value); setShowPastStatusDd(false) }}
                        className={`w-full text-left px-5 py-2.5 text-[14px] font-[600] font-manrope transition-colors ${pastStatus === opt.value ? 'bg-[#FE8301] text-white' : 'text-gray-600 hover:bg-[#FE8301] hover:text-white'
                          }`}
                      >
                        {opt.label}
                      </button>
                      {idx < arr.length - 1 && <div className="h-[1px] bg-gray-100 mx-4" />}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Select Date custom dropdown */}
            <div className="relative" ref={dateDdRef}>
              <button
                onClick={() => { setShowPastDateDd(!showPastDateDd); setShowPastStatusDd(false) }}
                className="flex items-center gap-2 px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-[14px] font-[600] font-manrope text-gray-600 min-w-[140px] hover:border-gray-300 transition-all"
              >
                {PAST_DATE_OPTIONS.find(o => o.value === pastDate)?.label || 'Select Date'}
                <svg className={`ml-auto w-3 h-3 text-gray-400 transition-transform ${showPastDateDd ? 'rotate-180' : ''}`} viewBox="0 0 10 6" fill="none"><path d="M1 1L5 5L9 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </button>
              {showPastDateDd && (
                <div className="absolute top-full right-0 mt-2 w-[160px] bg-white rounded-2xl shadow-[0px_4px_20px_0px_rgba(0,0,0,0.08)] border border-gray-100 z-20 overflow-hidden">
                  {PAST_DATE_OPTIONS.map((opt, idx, arr) => (
                    <div key={opt.label}>
                      <button
                        onClick={() => { setPastDate(opt.value); setShowPastDateDd(false) }}
                        className={`w-full text-left px-5 py-2.5 text-[14px] font-[600] font-manrope transition-colors ${pastDate === opt.value ? 'bg-[#FE8301] text-white' : 'text-gray-600 hover:bg-[#FE8301] hover:text-white'
                          }`}
                      >
                        {opt.label}
                      </button>
                      {idx < arr.length - 1 && <div className="h-[1px] bg-gray-100 mx-4" />}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        <div className="flex bg-white border border-gray-100 rounded-lg p-1 gap-1">
          <button
            onClick={() => setViewMode('grid')}
            className={`w-9 h-9 flex items-center justify-center rounded-lg transition-all ${viewMode === 'grid' ? 'bg-orange-500 text-white shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}
          >
            <LayoutGrid size={20} />
          </button>
          <button
            onClick={() => setViewMode('list')}
            className={`w-9 h-9 flex items-center justify-center rounded-lg transition-all ${viewMode === 'list' ? 'bg-orange-500 text-white shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}
          >
            <List size={20} />
          </button>
        </div>
      </div>

      {/* Orders Content */}
      <div className="flex-1 overflow-y-auto pb-6">
        {(activeTab === 'past' ? pastLoading && pastOrders.length === 0 : loading && dbOrders.length === 0) ? (
          <SkeletonRows count={8} className="px-4" />
        ) : (activeTab === 'past' ? pastError && pastOrders.length === 0 : fetchError && dbOrders.length === 0) ? (
          <div className="flex flex-col items-center justify-center h-60 gap-3">
            <AlertCircle size={36} className="text-[#EF4444]" />
            <p className="text-[14px] font-[600] text-[#1A181B] font-manrope">
              {activeTab === 'past' ? pastError : fetchError}
            </p>
            <button
              onClick={activeTab === 'past' ? fetchPastOrders : fetchOrders}
              className="px-4 py-2 rounded-lg bg-[#FE8301] text-white text-[14px] font-[600] font-manrope"
            >
              Retry
            </button>
          </div>
        ) : paginatedOrders.length === 0 ? (
          <div className="flex items-center justify-center h-40 text-gray-400 font-manrope text-sm">
            {activeTab === 'past' ? 'No past orders match these filters.' : 'No orders found.'}
          </div>
        ) : viewMode === 'list' ? (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-left border-collapse">
              <thead className="bg-[#F8F9FA] text-xs uppercase text-gray-500 font-[600] border-b border-gray-200">
                <tr>
                  <th className="px-6 py-4">Sr. No.</th>
                  <th className="px-6 py-4">Table &amp; Order ID</th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4">Time</th>
                  <th className="px-6 py-4">Date</th>
                  <th className="px-6 py-4 text-right">Bill Amount</th>
                  <th className="px-6 py-4">Customer</th>
                  <th className="px-6 py-4 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="text-sm text-gray-700">
                {paginatedOrders.map((order, index) => (
                  <tr key={order._id || order.id || order.orderId} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4 font-[600] text-gray-900">{(startIndex + index + 1).toString().padStart(2, '0')}</td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col">
                        <span className="font-[600] text-gray-900 text-base flex items-center gap-1.5">
                          {(() => {
                            // Same honest-label rule as the grid card —
                            // no table = Takeaway single badge, real
                            // table = table name + Dine-In badge.
                            const tableLabel = typeof order.table === 'string'
                              ? order.table
                              : (order.tableId || order.table?.name || '');
                            const hasRealTable = tableLabel && tableLabel.toLowerCase() !== 'takeaway';
                            const isTakeaway = !hasRealTable || order.type === 'takeaway';
                            if (isTakeaway) {
                              return (
                                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-[700] uppercase tracking-wide border bg-[#FFF4EB] text-[#FE8301] border-[#FE8301]/40">
                                  Takeaway
                                </span>
                              );
                            }
                            return (
                              <>
                                {tableLabel.split('🌿').map((part, i, arr) => (
                                  <React.Fragment key={i}>
                                    {part.trim()}
                                    {i < arr.length - 1 && <i className="fi fi-rr-link-horizontal text-[#AD09D4] text-[14px]"></i>}
                                  </React.Fragment>
                                ))}
                                {activeTab === 'past' && (
                                  <span className="px-2 py-0.5 rounded-full text-[10px] font-[700] uppercase tracking-wide border bg-[#EFF6FF] text-[#1D72E8] border-[#1D72E8]/40">
                                    Dine-In
                                  </span>
                                )}
                              </>
                            );
                          })()}
                        </span>
                        <span className="text-gray-400 text-xs mt-0.5 inline-flex items-center gap-1.5">
                          <span>{order.id}</span>
                          {order.source === 'kiosk' && (
                            <span className="px-[6px] py-[1px] rounded-[4px] text-[9px] font-bold tracking-wider bg-[#FFF4E5] text-[#FE8301] border border-[#FFE0B8]" title="Placed at self-service kiosk">KIOSK</span>
                          )}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-3 py-1 rounded-full text-xs font-[600] border ${statusStyles[order.status]}`}>
                        {order.status.charAt(0).toUpperCase() + order.status.slice(1)}
                      </span>
                    </td>
                    <td className="px-6 py-4 font-[600] text-gray-500">{formatOrderTime(order)}</td>
                    <td className="px-6 py-4 font-[600] text-gray-500">
                      {formatOrderDate(order)}
                    </td>
                    <td className="px-6 py-4 text-right font-[600] text-gray-900">₹{order.total}.00</td>
                    <td className="px-6 py-4 text-gray-600 font-[600]">{order.user || 'Guest'}{order.isRegistered && <span className="ml-1 text-orange-400">★</span>}</td>
                    <td className="px-6 py-4 text-center">
                      <button
                        onClick={() => setSelectedOrder(order)}
                        className="text-gray-400 hover:text-orange-500 transition-colors p-1 rounded-md hover:bg-orange-50"
                      >
                        <Eye size={24} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {paginatedOrders.map((order) => (
              <div
                key={order._id || order.id || order.orderId}
                className={`bg-white rounded-xl p-4 flex flex-col transition-all shadow-[0px_2px_8px_0px_#00000014] border ${order.hasAlert ? 'border-[#FF3B30]' : 'border-white'}`}
              >
                {/* Source pill removed 2026-05-20 — see TakeawayCard
                    comment above for context. Drawer still surfaces
                    the source for power users. */}
                {/* Header */}
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <div className="flex items-center gap-2">
                      {/* Order placement: derive from BOTH `type` and
                          actual `table` so the label is honest about
                          what really happened. Earlier the card showed
                          "Takeaway" (table fallback text) AND a
                          "Dine-In" type badge side-by-side whenever an
                          order was tagged dine-in but had no table —
                          which happens for staff-created carts. Now:
                          - real table → show table name + Dine-In
                          - no table   → show single Takeaway badge */}
                      {(() => {
                        const tableLabel = typeof order.table === 'string'
                          ? order.table
                          : (order.tableId || order.table?.name || '');
                        const hasRealTable = tableLabel && tableLabel.toLowerCase() !== 'takeaway';
                        const isTakeaway = !hasRealTable || order.type === 'takeaway';
                        if (isTakeaway) {
                          return (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-[700] uppercase tracking-wide border bg-[#FFF4EB] text-[#FE8301] border-[#FE8301]/40">
                              Takeaway
                            </span>
                          );
                        }
                        return (
                          <>
                            <span className="text-base font-[600] text-[#4A4A4A] font-manrope flex items-center gap-1">
                              {tableLabel.split('🌿').map((part, i, arr) => (
                                <React.Fragment key={i}>
                                  {part.trim()}
                                  {i < arr.length - 1 && <i className="fi fi-rr-link-horizontal text-[#AD09D4] text-[16px]"></i>}
                                </React.Fragment>
                              ))}
                            </span>
                            {activeTab === 'past' && (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-[700] uppercase tracking-wide border bg-[#EFF6FF] text-[#1D72E8] border-[#1D72E8]/40">
                                Dine-In
                              </span>
                            )}
                          </>
                        );
                      })()}
                      {order.hasAlert && <AlertCircle size={16} className="text-[#FF3B30]" />}
                    </div>
                    <p className="text-xs font-[600] text-gray-400 inline-flex items-center gap-1.5">
                      <span>{order.id}</span>
                      {order.source === 'kiosk' && (
                        <span className="px-[6px] py-[1px] rounded-[4px] text-[9px] font-bold tracking-wider bg-[#FFF4E5] text-[#FE8301] border border-[#FFE0B8]" title="Placed at self-service kiosk">KIOSK</span>
                      )}
                    </p>
                    <div className="flex items-center gap-1 mt-1 text-xs font-[600] text-gray-500">
                      {order.isRegistered ? (
                        <>
                          <User size={14} className="text-[#F59E0B] fill-[#F59E0B]" />
                          {order.user}
                        </>
                      ) : (
                        <span className="text-gray-400">{order.user || 'Guest'}</span>
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    <span className={`px-2 py-1 text-xs font-[600] rounded-full border ${statusStyles[order.status]}`}>
                      {order.status.charAt(0).toUpperCase() + order.status.slice(1)}
                    </span>
                    <p className="text-xs font-[600] text-gray-400 mt-1">{formatOrderTime(order)}</p>
                  </div>
                </div>

                {/* Items */}
                <div className="flex-1 bg-[#F8F9FA] rounded-[12px] p-4 mb-3">
                  <p className="text-[16px] leading-[22px] font-[600] font-manrope text-[#1A181B] mb-3">Total Items ({order.items.length.toString().padStart(2, '0')})</p>
                  {order.items.slice(0, 2).map((item, idx) => (
                    <div key={idx} className="flex justify-between text-sm mb-2 last:mb-0">
                      <span className="text-gray-600 font-[600]">{item.name} <span className="text-gray-400 font-[500]">x{item.quantity || 1}</span></span>
                      <span className="text-gray-800 font-[600]">₹{(item.price * (item.quantity || 1)).toFixed(0)}</span>
                    </div>
                  ))}
                  {order.items.length > 2 && (
                    <button
                      onClick={(e) => { e.stopPropagation(); setSelectedOrder(order) }}
                      className="text-[#FE8301] text-sm font-[600] mt-2 font-manrope"
                    >
                      +{order.items.length - 2} more item{order.items.length - 2 > 1 ? 's' : ''}
                    </button>
                  )}
                </div>

                {/* Note */}
                {order.note && (
                  <>
                    <div className="bg-[#FEFCE8] border border-[#FFF085] rounded-lg px-3 py-2 mb-3 flex items-center gap-2">
                      <AlertCircle size={14} className="text-yellow-600" />
                      <span className="text-xs font-[500] text-yellow-700">Note: {order.note}</span>
                    </div>
                    <div className="w-full border-b-[0.5px] border-[#DDDDDD] mb-3"></div>
                  </>
                )}

                {/* Footer */}
                <div className="flex items-center justify-between mt-auto pt-2 border-t border-gray-100 border-none">
                  <div className="flex items-center gap-1">
                    <span className="text-[16px] font-[500] text-gray-500">Total</span>
                    <span className="text-[16px] font-[700] text-gray-900">₹{order.total}</span>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); setSelectedOrder(order) }}
                    className="bg-[#F2F2F2] hover:bg-[#E5E5E5] text-[#5C5C5C] w-[32px] h-[32px] flex items-center justify-center rounded-[8px] transition-colors"
                  >
                    <Eye size={24} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Pagination */}
      <div className="flex flex-col md:flex-row justify-center items-center py-4 border-t border-gray-100 gap-4 md:gap-6 font-manrope">
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
              <span key={`dot-${idx}`} className="w-8 h-8 flex items-center justify-center text-sm text-gray-400">...</span>
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
            {totalCount > 0 ? `${startIndex + 1}-${Math.min(startIndex + itemsPerPage, totalCount)} of ${totalCount}` : '0-0 of 0'}
          </span>
        </div>
      </div>

      {selectedOrder && (
        <OrderDetailsModal
          order={selectedOrder}
          // Refresh both feeds — changing status inside the modal can
          // move an order between Live and Past, so a single feed
          // refresh would leave the other view stale.
          onRefresh={() => { fetchOrders(); if (activeTab === 'past') fetchPastOrders() }}
          onClose={() => setSelectedOrder(null)}
        />
      )}
    </div>
  )
}

export default OrdersDashboard
