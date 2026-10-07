import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { CalendarPlus, Plus, QrCode, Edit2, Link, X, CheckCircle, ArrowLeft, Minus, ChevronDown, Download, Trash2, AlertTriangle, Loader2, UtensilsCrossed, Upload } from 'lucide-react'
import SeatedCount, { seatInfo } from '../../Components/Common/SeatedCount'
import AddReservationModal from './components/AddReservationModal'
import AddAreaModal from './components/AddAreaModal'
import AddTableModal from './components/AddTableModal'
import BulkAddTablesModal from './components/BulkAddTablesModal'
import MergeTables from './components/MergeTables'
import QRManagementModal from './components/QRManagementModal'
import LateArrivalBanner from './components/LateArrivalBanner'
import {
  statusColors, statusTextColors, hoverShadows, statusBadgeStyle,
  drawerHeaderBg, drawerTitleColor, statusLabel, LEGEND_ITEMS, InitialsAvatar
} from './utils/tableStyles.jsx'
import api, { printAPI } from '../../utils/api'
import useSocketEvent from '../../hooks/useSocketEvent'
import toast from 'react-hot-toast'
import { billFromOrders, orderAmountDue, settleAmountForOrders, toTaxConfig } from '../../utils/billing'
import { useAdminBootstrap } from '../../hooks/queries/useAdminBootstrap'
import { SkeletonTablesGrid, SkeletonStatGrid } from '../../Components/Common/Skeleton'

// ─── Component ───────────────────────────────────────────────────────────────
const TablesDashboard = () => {
  const [activeTab, setActiveTab] = useState(() => sessionStorage.getItem('admin_tables_tab') || 'live-feed')
  const [activeFilter, setActiveFilter] = useState(() => sessionStorage.getItem('admin_tables_filter') || 'All')
  const [managementAreaFilter, setManagementAreaFilter] = useState(() => sessionStorage.getItem('admin_tables_mgmt_filter') || 'All')

  useEffect(() => {
    sessionStorage.setItem('admin_tables_tab', activeTab)
    sessionStorage.setItem('admin_tables_filter', activeFilter)
    sessionStorage.setItem('admin_tables_mgmt_filter', managementAreaFilter)
  }, [activeTab, activeFilter, managementAreaFilter])

  // ── Admin first-paint bundle ─────────────────────────────────────────────
  // Single round trip via /admin/bootstrap replaces the legacy 5-parallel
  // Promise.all that bailed on first failure. React Query gives us
  // stale-while-revalidate caching (instant tab-switches), automatic retry,
  // and granular socket invalidation — see hooks/queries/useAdminBootstrap.js
  const {
    data: bootstrap,
    isLoading,
    isError,
    refetch: fetchDashboardData,
  } = useAdminBootstrap()

  // Memoize each derived slice so a useMemo/useEffect downstream that
  // depends on `tablesData` doesn't re-run on every render — without
  // these, the `bootstrap?.tables ?? []` expression returns a fresh `[]`
  // each render when the query is loading, which would burn cycles in
  // every memoized derivation below (processedTablesData, dynamicFilters,
  // tablesGrid, ...).
  const tablesData         = useMemo(() => bootstrap?.tables       ?? [],   [bootstrap?.tables])
  const areasData          = useMemo(() => bootstrap?.areas        ?? [],   [bootstrap?.areas])
  const reservationsData   = useMemo(() => bootstrap?.reservations ?? [],   [bootstrap?.reservations])
  const staffData          = useMemo(() => bootstrap?.staff        ?? [],   [bootstrap?.staff])
  const settingsDoc        = bootstrap?.settings ?? null
  const reservationSettings = settingsDoc?.reservation ?? null

  // Tax config — derived from the cached settings doc. Defaults stay zero
  // until settings lands so the drawer doesn't render ghost tax lines.
  // Reads `taxes` (NOT `taxesAndCharges` — that key doesn't exist on the
  // settings model and would silently fall through to hardcoded 18% GST /
  // 5% service, breaking parity with the customer/waiter bill previews).
  const taxConfig = useMemo(() => toTaxConfig(settingsDoc?.taxes), [settingsDoc])

  // Backward-compat shim: render code below already keys off `loading`
  // and `fetchError`. Keeping the names avoids a 30+ site rewrite.
  const loading = isLoading
  const fetchError = isError ? 'Failed to load tables data' : null

  // ── Modals & Drawers ────────────────────────────────────────────────────
  const [showAddReservationModal, setShowAddReservationModal] = useState(false)
  const [showAddAreaModal, setShowAddAreaModal] = useState(false)
  const [showAddTableModal, setShowAddTableModal] = useState(false)
  const [showBulkAddTablesModal, setShowBulkAddTablesModal] = useState(false)
  const [tableToEdit, setTableToEdit] = useState(null)
  const [tableToDelete, setTableToDelete] = useState(null)
  const [showMergeTables, setShowMergeTables] = useState(false)
  // Track only the ID of the open drawer's table — the live table
  // object is derived from processedTablesData below. Storing the
  // full object snapshot was the bug behind "alert drawer doesn't
  // flip back to occupied when waiter accepts" / "occupied drawer
  // doesn't flip to alert when customer presses Call Waiter": the
  // open drawer kept rendering the click-time snapshot regardless
  // of bootstrap refetches.
  const [selectedTableId, setSelectedTableId] = useState(null)
  const [isEditingBill, setIsEditingBill] = useState(false)
  const [isPaymentView, setIsPaymentView] = useState(false)
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState(null)
  const [isPaymentSuccess, setIsPaymentSuccess] = useState(false)
  const [isSettlingPayment, setIsSettlingPayment] = useState(false)
  const [showUnmergeModal, setShowUnmergeModal] = useState(false)
  const [showCancelReservationModal, setShowCancelReservationModal] = useState(false)
  const [showQRModal, setShowQRModal] = useState(false)
  const [selectedQRTable, setSelectedQRTable] = useState(null)

  // ── Order state ─────────────────────────────────────────────────────────
  const [orderItems, setOrderItems] = useState([])
  const [loadingOrders, setLoadingOrders] = useState(false)
  // Customer actually sitting at this table, derived from the active order.
  // A stale pending reservation on the same table would otherwise mis-label
  // the current occupant — e.g. a QR-scan guest showed as "D Company" just
  // because D Company had a pending reservation on that table.
  const [activeOrderCustomer, setActiveOrderCustomer] = useState(null)
  // Full order metadata for the drawer — id (needed for /append), tipAmount,
  // couponCode/Discount, pointsRedeemed. Without capturing these the admin
  // bill silently dropped the discount + tip lines the customer saw.
  const [activeOrderMeta, setActiveOrderMeta] = useState(null)
  // Bumped by socket events to force the drawer-level useEffect to
  // re-run its fetch when another actor modifies THIS order (coupon,
  // append, payment). Separate from fetchDashboardData so we don't have
  // to refetch every table on every mutation.
  const [drawerRefreshKey, setDrawerRefreshKey] = useState(0)
  // "Add Item" dialog state — menu picker shown over the Edit Bill view so
  // staff can add a late / missed / parcel item to an already-placed order.
  const [isAddItemOpen, setIsAddItemOpen] = useState(false)
  const [menuForPicker, setMenuForPicker] = useState([])
  const [menuLoadingPicker, setMenuLoadingPicker] = useState(false)
  const [menuSearchPicker, setMenuSearchPicker] = useState('')
  const [appendingItems, setAppendingItems] = useState(false)
  const [discount, setDiscount] = useState(0)
  // Reflect the order's persisted manual discount in the local control
  // whenever the drawer (re)loads a table, so reopening shows the
  // discount the admin already applied (and the customer is seeing).
  useEffect(() => {
    setDiscount(Number(activeOrderMeta?.manualDiscount) || 0)
  }, [activeOrderMeta?._id, activeOrderMeta?.manualDiscount])

  // Fallback polling every 15s for the live-feed tab — Socket.io handles
  // instant updates, but the polling guards against a dropped socket event
  // (reconnect window, network blip). Socket-driven invalidation is wired
  // inside useAdminBootstrap, so we only need the timer here.
  useEffect(() => {
    if (activeTab !== 'live-feed') return
    const interval = setInterval(fetchDashboardData, 15000)
    return () => clearInterval(interval)
  }, [activeTab, fetchDashboardData])

  // Belt-and-suspenders: also refetch directly on request lifecycle
  // events. useAdminBootstrap already listens to `table:updated` (which
  // we emit alongside the alert push/pull), but if that single event
  // is ever dropped — slow socket, room mismatch, etc — the drawer
  // would stay stale until the 15s poll. Listening to `request:new`
  // and `request:updated` here closes that gap.
  useSocketEvent('request:new', fetchDashboardData)
  useSocketEvent('request:updated', fetchDashboardData)

  // ── Processed data (memoized) ───────────────────────────────────────────
  const sortedAreas = useMemo(() =>
    [...areasData].sort((a, b) => {
      if (a.isActive === b.isActive) return 0
      return a.isActive ? -1 : 1
    }),
    [areasData]
  )

  const dynamicFilters = useMemo(() => [{ name: 'All', isActive: true }, ...sortedAreas], [sortedAreas])

  const processedTablesData = useMemo(() => tablesData.map(table => {
    const tableArea = areasData.find(a => a._id === (table.area?._id || table.area) || a.name === table.area?.name)
    const isAreaActive = table.area?.isActive !== undefined
      ? table.area.isActive
      : (tableArea ? tableArea.isActive : true)

    const isTableSpecificallyDisabled = table.status === 'disabled' || table.isActive === false

    // Customer-side service requests (call waiter / ask for water / bill)
    // populate table.alerts on the backend. Surface that as the visual
    // "alert" status on the grid so admins can spot the table at a glance,
    // even if the underlying status is still "free" or "occupied".
    const hasActiveAlerts = Array.isArray(table.alerts) && table.alerts.length > 0

    // Find reservation on this table — or on any table in a merged group
    // Use String() to safely compare ObjectIds vs strings from different API responses
    const mergedGroup = table.mergedWith?.length > 0
      ? [String(table._id), ...table.mergedWith.map(id => String(id))]
      : [String(table._id)]
    // Skip reservations whose scheduled date has already passed. A Pending
    // reservation from weeks ago that was never marked Completed/Cancelled
    // would otherwise keep "owning" the table — e.g. merging two free tables
    // today would surface an old D Company reservation from last month,
    // leaking its name / phone / date into the merged-tables drawer.
    // Seated reservations are kept regardless (party is physically present).
    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)
    const activeReservation = Array.isArray(reservationsData) ? reservationsData.find(r => {
      const rTableId = String(r.table?._id || r.table || '')
      if (!mergedGroup.includes(rTableId)) return false
      if (!['pending', 'confirmed', 'seated', 'Pending', 'Approved', 'Seated'].includes(r.status)) return false
      const isSeated = r.status === 'Seated' || r.status === 'seated'
      if (!isSeated && r.date && new Date(r.date) < todayStart) return false
      return true
    }) : null

    const baseStatus = (!isAreaActive || isTableSpecificallyDisabled)
      ? 'disabled'
      : (table.status || 'free')

    return {
      ...table,
      isAreaActive,
      status: hasActiveAlerts && baseStatus !== 'disabled' ? 'alert' : baseStatus,
      underlyingStatus: baseStatus,
      activeReservation
    }
  }), [tablesData, areasData, reservationsData])

  const tablesGrid = useMemo(() => processedTablesData.filter(t => activeFilter === 'All' || t.area?.name === activeFilter), [processedTablesData, activeFilter])
  const tablesList = useMemo(() => processedTablesData.filter(t => managementAreaFilter === 'All' || t.area?.name === managementAreaFilter), [processedTablesData, managementAreaFilter])

  // Live drawer table — re-derived from the latest bootstrap on every
  // render. When a customer presses "Call Waiter", the bootstrap
  // refetch brings new alerts into processedTablesData and this memo
  // surfaces them in the open drawer immediately. Same for the reverse
  // (waiter accepts → alerts cleared → drawer flips back to occupied).
  const selectedTable = useMemo(() => {
    if (!selectedTableId) return null
    return processedTablesData.find(t => String(t._id) === String(selectedTableId)) || null
  }, [selectedTableId, processedTablesData])

  // Adapter so the rest of the component keeps calling
  // setSelectedTable(tableObj) / setSelectedTable(null) — internally
  // we just extract the id.
  const setSelectedTable = useCallback((tableOrNull) => {
    setSelectedTableId(tableOrNull?._id || null)
  }, [])

  // ── Table actions ───────────────────────────────────────────────────────
  const changeTableStatus = async (id, status) => {
    try {
      await api.put(`/tables/${id}`, { status })
      toast.success(`Table is now ${status}`)
      fetchDashboardData()
    } catch (error) {
      console.error(`Failed to change table status:`, error)
      toast.error('Failed to change table status')
    }
  }

  const toggleTableStatus = async (table) => {
    if (!table.isAreaActive) return
    try {
      const isDisabled = table.status === 'disabled' || table.isActive === false
      const payload = isDisabled ? { status: 'free', isActive: true } : { status: 'disabled', isActive: false }
      await api.put(`/tables/${table._id || table.id}`, payload)
      toast.success(`Table is now ${isDisabled ? 'Active' : 'Disabled'}`)
      fetchDashboardData()
    } catch (error) {
      toast.error('Failed to toggle active status')
    }
  }

  // ── Order data fetch when selecting occupied table ──────────────────────
  // Track the last table ID we fetched for so we can tell an ID *change*
  // (new drawer) apart from a socket-triggered refresh on the same drawer.
  // Without this, opening Table B right after closing Table A's drawer
  // would keep flashing A's customer name until the new fetch returned.
  const lastDrawerTableIdRef = useRef(null)
  useEffect(() => {
    const currentId = selectedTable?._id || selectedTable?.id || null
    if (lastDrawerTableIdRef.current !== currentId) {
      setOrderItems([])
      setActiveOrderCustomer(null)
      setActiveOrderMeta(null)
      lastDrawerTableIdRef.current = currentId
    }
    const fetchTableOrderData = async () => {
      const isOccupiedOrMerged = selectedTable?.status === 'occupied' || selectedTable?.status === 'merged'
      if (isOccupiedOrMerged) {
        try {
          setLoadingOrders(true)
          const tableId = selectedTable._id || selectedTable.id
          const isMergedGroup = selectedTable.mergedWith?.length > 0

          if (isMergedGroup) {
            // Fetch orders for all tables in the merged group
            const mergedIds = [tableId, ...(selectedTable.mergedWith || [])]
            const orderPromises = mergedIds.map(id =>
              api.get(`/orders/active/table/${id}`).catch(() => ({ data: { success: false } }))
            )
            const results = await Promise.all(orderPromises)
            const allItems = []
            const mergedOrders = []
            let primaryOrder = null
            results.forEach((res, idx) => {
              if (res.data.success && res.data.order) {
                if (!primaryOrder) primaryOrder = res.data.order
                mergedOrders.push(res.data.order)
                const tableName = processedTablesData.find(t => String(t._id) === String(mergedIds[idx]))?.name || `Table ${idx + 1}`
                res.data.order.items.forEach(item => {
                  allItems.push({
                    id: item._id,
                    name: item.name,
                    quantity: item.quantity,
                    price: item.price,
                    addon: null,
                    addonPrice: 0,
                    tableName
                  })
                })
              }
            })
            setOrderItems(allItems)
            setActiveOrderCustomer(primaryOrder ? {
              name: primaryOrder.customerName || 'Guest',
              phone: primaryOrder.phone || '',
              isRegistered: !!primaryOrder.user,
            } : null)
            setActiveOrderMeta(primaryOrder ? {
              _id: primaryOrder._id,
              orderId: primaryOrder.orderId,
              tipAmount: primaryOrder.tipAmount || 0,
              couponCode: primaryOrder.couponCode || '',
              couponDiscount: primaryOrder.couponDiscount || 0,
              pointsRedeemed: primaryOrder.pointsRedeemed || 0,
              manualDiscount: primaryOrder.manualDiscount || 0,
              savedTotal: primaryOrder.total || 0,
              paymentStatus: primaryOrder.paymentStatus || 'Pending',
              paymentMethod: primaryOrder.paymentMethod || '',
              // Customer-initiated counter-payment request flag —
              // drives the red alert banner at the top of the drawer.
              counterPaymentRequestedAt: primaryOrder.counterPaymentRequestedAt || null,
              // Full order docs — the bill and the settle amount are
              // read from their STORED totals (utils/billing).
              orders: mergedOrders,
            } : null)
          } else {
            // Independent-orders model — pull EVERY unpaid order on
            // this table, not just the latest. Multiple Place Order
            // taps now produce multiple Order docs and the admin
            // drawer needs to show them all so the bill aggregation,
            // counter-payment alert, and "mark paid" all settle the
            // entire table at once.
            const { data } = await api.get(`/orders/active-list/table/${tableId}`)
            const list = data?.success && Array.isArray(data.orders) ? data.orders : []
            if (list.length > 0) {
              // Combine items from every order into a flat list, but
              // tag each line with its source orderId so the drawer
              // can render "from #ABC123" pills.
              const combinedItems = []
              for (const o of list) {
                for (const it of (o.items || [])) {
                  combinedItems.push({
                    id: it._id,
                    name: it.name,
                    quantity: it.quantity,
                    price: it.price,
                    addon: null,
                    addonPrice: 0,
                    sourceOrderId: o.orderId,
                  })
                }
              }
              setOrderItems(combinedItems)
              const primary = list[list.length - 1] // most recent for customer info
              setActiveOrderCustomer({
                name: primary.customerName || 'Guest',
                phone: primary.phone || '',
                isRegistered: !!primary.user,
              })

              // Aggregate totals across EVERY round. Tip / coupon /
              // points must SUM across all orders on the table — a tip the
              // customer added on the first round was previously dropped
              // because we only read the latest order's value, so the admin
              // drawer showed no tip line.
              const sumTotal = list.reduce((s, o) => s + (Number(o.total) || 0), 0)
              const sumTip = list.reduce((s, o) => s + (Number(o.tipAmount) || 0), 0)
              const sumCoupon = list.reduce((s, o) => s + (Number(o.couponDiscount) || 0), 0)
              const sumPoints = list.reduce((s, o) => s + (Number(o.pointsRedeemed) || 0), 0)
              const sumManualDiscount = list.reduce((s, o) => s + (Number(o.manualDiscount) || 0), 0)
              const anyCounterRequest = list.find(o => o.counterPaymentRequestedAt)
              setActiveOrderMeta({
                _id: primary._id,
                orderId: primary.orderId,
                tipAmount: sumTip,
                couponCode: primary.couponCode || '',
                couponDiscount: sumCoupon,
                pointsRedeemed: sumPoints,
                manualDiscount: sumManualDiscount,
                savedTotal: Math.round(sumTotal * 100) / 100,
                paymentStatus: primary.paymentStatus || 'Pending',
                paymentMethod: primary.paymentMethod || '',
                counterPaymentRequestedAt: anyCounterRequest?.counterPaymentRequestedAt || null,
                // Independent-orders extras for the new aggregated UI.
                allOrderIds: list.map(o => o._id),
                orderCount: list.length,
                allOrders: list.map(o => ({
                  _id: o._id,
                  orderId: o.orderId,
                  total: o.total,
                  itemCount: (o.items || []).length,
                  status: o.status,
                  paymentStatus: o.paymentStatus,
                  createdAt: o.createdAt,
                })),
                // Full order docs — the bill and the settle amount are
                // read from their STORED totals (utils/billing).
                orders: list,
              })
            } else {
              setOrderItems([])
              setActiveOrderCustomer(null)
              setActiveOrderMeta(null)
            }
          }
        } catch (error) {
          console.error('Failed to fetch table active order:', error)
          setOrderItems([])
          setActiveOrderCustomer(null)
          setActiveOrderMeta(null)
        } finally {
          setLoadingOrders(false)
        }
      } else {
        setOrderItems([])
        setActiveOrderCustomer(null)
        setActiveOrderMeta(null)
      }
    }
    fetchTableOrderData()
  }, [selectedTable?._id, selectedTable?.id, selectedTable?.status, drawerRefreshKey])

  // The open drawer's table was freed by someone else (customer paid
  // online / from the wallet, a waiter settled it, the last order was
  // cancelled). The drawer content already follows the live status, but
  // the Edit Bill / payment views take precedence over it — leave them so
  // the admin isn't left settling a bill that no longer exists. Our own
  // settle shows the success screen instead (isPaymentSuccess).
  const lastDrawerStatusRef = useRef({ id: null, status: null })
  useEffect(() => {
    const id = selectedTable?._id ? String(selectedTable._id) : null
    const status = selectedTable?.underlyingStatus || selectedTable?.status || null
    const prev = lastDrawerStatusRef.current
    lastDrawerStatusRef.current = { id, status }
    if (!id || prev.id !== id) return
    const wasSeated = prev.status === 'occupied' || prev.status === 'merged'
    if (!wasSeated || status !== 'free') return
    if (isPaymentSuccess || isSettlingPayment) return
    if (isPaymentView || isEditingBill) {
      setIsPaymentView(false)
      setIsEditingBill(false)
      setSelectedPaymentMethod(null)
      toast.success('Bill settled — table is now free')
    }
  }, [selectedTable, isPaymentSuccess, isSettlingPayment, isPaymentView, isEditingBill])

  // Live-sync the drawer when an `order:updated` fires for THIS table's
  // active order — covers coupons applied from the waiter bill, items
  // appended by another staff, payments landing via Razorpay webhooks,
  // etc. Without this, the drawer would hold stale activeOrderMeta
  // (couponDiscount, tipAmount, items) until the admin manually closes
  // and re-opens it.
  useSocketEvent('order:updated', (payload) => {
    if (!payload?.orderId || !activeOrderMeta?.orderId) return
    if (String(payload.orderId) !== String(activeOrderMeta.orderId)) return
    setDrawerRefreshKey(k => k + 1)
  })
  useSocketEvent('order:appended', (payload) => {
    if (!payload?.orderId || !activeOrderMeta?.orderId) return
    if (String(payload.orderId) !== String(activeOrderMeta.orderId)) return
    setDrawerRefreshKey(k => k + 1)
  })

  // ── Bill calculations ───────────────────────────────────────────────────
  // The drawer shows — and settles — the orders' STORED bill
  // (utils/billing.billFromOrder): the breakdown and order.total the
  // server stamped at placement / append / coupon. It is never re-priced
  // from the current tax settings: marking Paid cannot change
  // order.total and the server rejects an amountPaid below what is due
  // (total − manualDiscount − amountPaid, AMOUNT_TOO_LOW), so a live
  // re-price breaks settlement the moment an admin edits a rate.
  // taxConfig is only the fallback for legacy orders with no stored bill.
  // The staff manual discount is NOT a coupon and sits outside
  // order.total, so it comes off the final figure.
  const activeOrders = activeOrderMeta?.orders || []
  const bill = billFromOrders(activeOrders, taxConfig)
  const { subtotal, serviceCharge, gst } = bill
  const serviceChargePercent = bill.serviceChargePct
  const gstPercent = bill.gstPct
  const pctLabel = (p) => (p ? ` (${p}%)` : '')
  // Bill total after the drawer's discount.
  const billTotal = Math.max(0, Math.round((bill.total - (Number(discount) || 0)) * 100) / 100)
  // Already collected across the table's orders (e.g. a wallet portion).
  const alreadyPaid = bill.amountPaid
  // What "Done" sends as amountPaid: sum of (stored total − amountPaid)
  // less the drawer's discount (which replaces the stored manual discounts).
  const payableTotal = settleAmountForOrders(activeOrders, taxConfig, { manualDiscount: Number(discount) || 0 })
  // Counter-request "Mark Paid" sends no discount, so the server uses the
  // stored manualDiscount of each order.
  const counterSettleTotal = settleAmountForOrders(activeOrders, taxConfig)
  // Edit Bill quantity changes are local only (never saved), so they do
  // not change the bill — flag it rather than show a figure we won't charge.
  const localItemsSubtotal = Math.round(orderItems.reduce((acc, item) => acc + (item.price * item.quantity) + ((item.addonPrice || 0) * item.quantity), 0) * 100) / 100
  const hasUnsavedItemEdits = activeOrders.length > 0 && Math.abs(localItemsSubtotal - subtotal) > 0.01

  const removeOrderItem = (itemId) => setOrderItems(prev => prev.filter(item => item.id !== itemId))
  const incrementQuantity = (itemId) => setOrderItems(prev => prev.map(item => item.id === itemId ? { ...item, quantity: item.quantity + 1 } : item))
  const decrementQuantity = (itemId) => setOrderItems(prev => prev.map(item => {
    if (item.id === itemId) {
      return item.quantity > 1 ? { ...item, quantity: item.quantity - 1 } : null
    }
    return item
  }).filter(Boolean))

  // Add Item — fetches the menu once, lets the admin pick a dish, and
  // appends it to the active order via the existing /orders/:id/append
  // endpoint so the new KOT reaches the kitchen.
  const openAddItemPicker = async () => {
    setIsAddItemOpen(true)
    if (menuForPicker.length > 0) return
    try {
      setMenuLoadingPicker(true)
      const { data } = await api.get('/menu?limit=500&status=active')
      if (data?.success) setMenuForPicker(data.data || [])
    } catch (err) {
      console.error('Failed to load menu for picker:', err)
      toast.error('Could not load menu items.')
    } finally {
      setMenuLoadingPicker(false)
    }
  }

  const appendMenuItemToOrder = async (menuItem) => {
    if (!activeOrderMeta?._id || appendingItems) return
    try {
      setAppendingItems(true)
      const payload = {
        menuItem: menuItem._id,
        name: menuItem.name,
        price: menuItem.finalPrice || menuItem.basePrice || menuItem.price || 0,
        quantity: 1,
        category: menuItem.category?.name || menuItem.category || '',
        vegType: menuItem.vegType || '',
      }
      await api.post(`/orders/${activeOrderMeta._id}/append`, { items: [payload] })
      // Refresh the drawer's order view to show the newly appended item.
      const tableId = selectedTable._id || selectedTable.id
      const { data } = await api.get(`/orders/active/table/${tableId}`)
      if (data?.success && data.order) {
        setOrderItems(data.order.items.map(item => ({
          id: item._id, name: item.name, quantity: item.quantity, price: item.price, addon: null, addonPrice: 0,
        })))
        setActiveOrderMeta(m => m ? {
          ...m,
          savedTotal: data.order.total || m.savedTotal,
          // Swap in the re-priced order so the stored bill includes the item.
          orders: (m.orders || []).some(o => String(o._id) === String(data.order._id))
            ? m.orders.map(o => (String(o._id) === String(data.order._id) ? data.order : o))
            : [...(m.orders || []), data.order],
        } : m)
      }
      toast.success(`${menuItem.name} added to order`)
    } catch (err) {
      console.error('Append item failed:', err)
      toast.error(err.response?.data?.message || 'Failed to add item')
    } finally {
      setAppendingItems(false)
    }
  }

  // KOT — re-fire the kitchen ticket for the currently-open drawer's order.
  // Calls POST /orders/:id/reprint-kot which re-emits the `order:kot-reprint`
  // socket event so the chef dashboard re-highlights the card, then opens a
  // print-ready HTML window for anyone running a paper kitchen printer.
  const [kotSubmitting, setKotSubmitting] = useState(false)

  // ── Free Table — manual path out of the "occupied but empty" state ──
  // Hits POST /tables/:id/free which cancels the attached empty order
  // (if any) and clears table.status + activeOrder in one transaction.
  // The server refuses with 409 if the order actually has items or
  // payment, so this can never accidentally discard real money.
  const [freeingTable, setFreeingTable] = useState(false)
  // Kept in sync with the backend sweeper default — see
  // Backend/utils/emptyOrderSweeper.js (GRACE_MINUTES_DEFAULT).
  const emptyCartGraceMinutes = 30
  // Shared POST so the initial free and the force-close retry hit the
  // same endpoint with an optional `{ force: true }` body.
  const postFreeTable = (force = false) =>
    api.post(`/tables/${selectedTable._id}/free`, force ? { force: true } : {})

  const handleFreeTableNow = async () => {
    if (!selectedTable?._id || freeingTable) return
    if (!window.confirm(`Free ${selectedTable.name}? This will cancel any empty order on the table.`)) return
    setFreeingTable(true)
    try {
      const res = await postFreeTable(false)
      if (res.data?.success) {
        toast.success(`${selectedTable.name} freed`)
        setSelectedTable(null)
        fetchDashboardData()
      } else {
        toast.error(res.data?.message || 'Could not free table')
      }
    } catch (err) {
      const data = err.response?.data
      if (data?.code === 'ORDER_NOT_EMPTY') {
        // Cascade preview — the previous occupant left an open bill. Let
        // the operator write it off and reset the table for the next diner.
        const count = data.orderCount || 1
        const amount = data.totalAmount != null ? `₹${data.totalAmount}` : 'an unpaid amount'
        const ok = window.confirm(
          `${selectedTable.name} has ${count} open order(s) totalling ${amount} from the previous guest.\n\n` +
          `Force-close will WRITE OFF these orders (marked as walkout) and free the table for the next diner. Continue?`
        )
        if (!ok) { setFreeingTable(false); return }
        try {
          const res2 = await postFreeTable(true)
          if (res2.data?.success) {
            toast.success(res2.data.message || `${selectedTable.name} freed`)
            setSelectedTable(null)
            fetchDashboardData()
          } else {
            toast.error(res2.data?.message || 'Could not free table')
          }
        } catch (err2) {
          toast.error(err2.response?.data?.message || 'Could not force-close table')
        }
      } else {
        toast.error(data?.message || 'Could not free table')
      }
    } finally {
      setFreeingTable(false)
    }
  }

  // One-click bill on the branch's counter thermal printer (Settings →
  // Printers). The browser print path (bill receipt page) stays as the
  // fallback for branches without a printer / agent.
  const [billPrinting, setBillPrinting] = useState(false)
  const handlePrintBill = async () => {
    if (!activeOrderMeta?._id || billPrinting) return
    setBillPrinting(true)
    try {
      const res = await printAPI.printBill(activeOrderMeta._id)
      toast.success(res.data?.message || 'Bill sent to the counter printer')
    } catch (err) {
      const code = err.response?.data?.code
      if (code === 'NO_COUNTER_PRINTER' || code === 'PRINTING_DISABLED') {
        toast.error(`${err.response.data.message} Add one under Settings → Printers.`)
      } else {
        toast.error(err.response?.data?.message || 'Could not print the bill')
      }
    } finally {
      setBillPrinting(false)
    }
  }

  const handleReprintKOT = async () => {
    if (!activeOrderMeta?._id || kotSubmitting) return
    setKotSubmitting(true)
    try {
      const res = await api.post(`/orders/${activeOrderMeta._id}/reprint-kot`)
      if (!res.data?.success) {
        toast.error(res.data?.message || 'Could not reprint KOT')
        return
      }
      const order = res.data.order || {}
      const items = Array.isArray(order.items) ? order.items : []
      const tableName = selectedTable?.name || order.table || '—'
      const orderIdDisplay = order.orderId || activeOrderMeta.orderId || '—'
      const customerName = activeOrderCustomer?.name || order.customerName || 'Guest'
      const createdAtDisplay = new Date(order.createdAt || Date.now()).toLocaleString('en-IN', {
        day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
      })
      const reprintedAtDisplay = new Date().toLocaleString('en-IN', {
        day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit'
      })

      // Build a self-contained print document. Inline CSS so no external
      // stylesheet is required and the window auto-prints on load.
      const rowsHtml = items.map(it => {
        const veg = it.vegType === 'veg' ? '🟢'
                  : it.vegType === 'non-veg' ? '🔴'
                  : '';
        const inst = it.instructions ? `<div class="inst">↳ ${String(it.instructions).replace(/</g, '&lt;')}</div>` : '';
        return `
          <tr>
            <td class="qty">${it.quantity}×</td>
            <td class="name">${veg} ${String(it.name || '').replace(/</g, '&lt;')}${inst}</td>
          </tr>
        `;
      }).join('')

      const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>KOT — ${orderIdDisplay}</title>
  <style>
    @page { size: 80mm auto; margin: 4mm; }
    body { font-family: 'Courier New', ui-monospace, monospace; color: #000; margin: 0; padding: 8px; font-size: 13px; }
    .ticket { width: 72mm; margin: 0 auto; }
    h1 { text-align: center; font-size: 18px; margin: 0 0 4px; letter-spacing: 2px; }
    .sub { text-align: center; font-size: 11px; margin-bottom: 8px; }
    .meta { display: flex; justify-content: space-between; font-size: 12px; margin-bottom: 4px; }
    .sep { border-top: 1px dashed #000; margin: 6px 0; }
    table { width: 100%; border-collapse: collapse; }
    td { vertical-align: top; padding: 3px 0; }
    td.qty { width: 32px; font-weight: bold; }
    td.name { font-size: 14px; }
    .inst { font-size: 11px; font-style: italic; margin-top: 2px; padding-left: 6px; }
    .footer { text-align: center; font-size: 11px; margin-top: 8px; }
    .reprint-banner { text-align: center; font-weight: bold; border: 1px solid #000; padding: 3px; margin-bottom: 6px; }
    @media print { .no-print { display: none; } }
    .actions { text-align: center; margin-top: 12px; }
    .actions button { padding: 6px 14px; margin: 0 4px; cursor: pointer; }
  </style>
</head>
<body>
  <div class="ticket">
    <div class="reprint-banner">** KOT REPRINT **</div>
    <h1>KOT</h1>
    <div class="sub">Order ${orderIdDisplay}</div>
    <div class="sep"></div>
    <div class="meta"><span>Table:</span><span><strong>${String(tableName).replace(/</g, '&lt;')}</strong></span></div>
    <div class="meta"><span>Type:</span><span>${String(order.type || 'dine-in').replace(/</g, '&lt;')}</span></div>
    <div class="meta"><span>Guest:</span><span>${String(customerName).replace(/</g, '&lt;')}</span></div>
    <div class="meta"><span>Placed:</span><span>${createdAtDisplay}</span></div>
    <div class="meta"><span>Reprinted:</span><span>${reprintedAtDisplay}</span></div>
    <div class="sep"></div>
    <table>${rowsHtml || '<tr><td colspan="2">No items</td></tr>'}</table>
    <div class="sep"></div>
    <div class="footer">Items: ${items.reduce((n, it) => n + (Number(it.quantity) || 0), 0)}</div>
  </div>
  <div class="no-print actions">
    <button onclick="window.print()">Print</button>
    <button onclick="window.close()">Close</button>
  </div>
  <script>window.addEventListener('load', () => setTimeout(() => window.print(), 150));</script>
</body>
</html>`

      const w = window.open('', '_blank', 'width=420,height=680')
      if (w) {
        w.document.open()
        w.document.write(html)
        w.document.close()
      } else {
        // Popup blocker — kitchen ping still succeeded, just tell the admin.
        toast('KOT sent to kitchen. Enable popups to open the printable ticket.', { icon: '🧾' })
      }
      toast.success('KOT re-sent to kitchen')
    } catch (err) {
      console.error('Reprint KOT failed:', err)
      toast.error(err.response?.data?.message || 'Failed to reprint KOT')
    } finally {
      setKotSubmitting(false)
    }
  }

  // Settle a dine-in bill from the admin drawer.
  //
  // Before this wiring, the "Done" button only flipped a local flag —
  // the server never saw the payment, the order stayed Pending, and a
  // merged group stayed merged forever. Now we PATCH
  // /orders/:id/status with paymentStatus: 'Paid', which on the backend:
  //   1. promotes a preparing/ready order to 'served' (a 'new' order
  //      stays on the KDS until cooked),
  //   2. frees the table at once once every order on it is paid
  //      (kitchen status doesn't matter), and
  //   3. unmerges the group (see freeTableOrUnmergeGroup in
  //      Backend/utils/tableMerge.js) so every sibling goes back to 'free'.
  // Frontend then just refetches the grid and shows the success screen.
  const settleBillPayment = async ({ amount, method }) => {
    if (!activeOrderMeta?._id) {
      toast.error('No active order to settle.')
      return false
    }
    if (!method) {
      toast.error('Pick a payment method.')
      return false
    }
    if (!(Number.isFinite(amount) && amount >= 0)) {
      toast.error('Bill amount looks invalid — please refresh.')
      return false
    }
    setIsSettlingPayment(true)
    try {
      // Marking Paid never changes order.total on the server (it 400s
      // with AMOUNT_TOO_LOW if the amount is below what is due), so the
      // discount is sent explicitly as manualDiscount rather than being
      // folded into amountPaid. (Multi-round tables: the Discount select
      // already persisted it on the primary round; the drawer's figure is
      // the sum across rounds, so it is not re-sent here.)
      const singleRound = (activeOrderMeta.orderCount || 1) <= 1
      await api.patch(`/orders/${activeOrderMeta._id}/status`, {
        paymentStatus: 'Paid',
        paymentMethod: method,
        amountPaid: Math.round(amount * 100) / 100,
        ...(singleRound ? { manualDiscount: Number(discount) || 0 } : {}),
      })
      setActiveOrderMeta(m => m ? { ...m, paymentStatus: 'Paid', paymentMethod: method } : m)
      setIsPaymentSuccess(true)
      fetchDashboardData()
      return true
    } catch (err) {
      console.error('Payment settle failed:', err)
      toast.error(err.response?.data?.message || 'Failed to record payment')
      return false
    } finally {
      setIsSettlingPayment(false)
    }
  }

  const closeDrawer = useCallback(() => {
    setSelectedTable(null)
    setIsEditingBill(false)
    setIsPaymentView(false)
    setIsPaymentSuccess(false)
    setSelectedPaymentMethod(null)
    setOrderItems([])
    setActiveOrderCustomer(null)
    setActiveOrderMeta(null)
  }, [])

  // Lock body scroll when drawer is open
  useEffect(() => {
    if (selectedTable) {
      document.body.style.overflow = 'hidden'
      return () => { document.body.style.overflow = '' }
    }
  }, [selectedTable])

  // Tick every 30s while an alert drawer is open so the "X min ago"
  // delay re-renders live and the severity colour escalates as the
  // alert ages — without a tick the badge would stay frozen at the
  // value it had when the drawer first opened.
  const [, setAlertClockTick] = useState(0)
  useEffect(() => {
    if (!selectedTable?.alerts?.length) return
    const id = setInterval(() => setAlertClockTick(t => t + 1), 30000)
    return () => clearInterval(id)
  }, [selectedTable])

  // Escape key closes drawer
  useEffect(() => {
    if (!selectedTable) return
    const onKey = (e) => { if (e.key === 'Escape') closeDrawer() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [selectedTable, closeDrawer])

  // ── Open-from-notification: admin clicks a Service (table request) notif.
  // The modal navigates here with `{ highlightTable: '<tableName>' }`.
  // Open the matching table's drawer so the waiter/admin can act on it.
  const location = useLocation()
  const lastHandledKeyRef = useRef(null)
  useEffect(() => {
    const highlight = location.state?.highlightTable
    if (!highlight) return
    if (lastHandledKeyRef.current === location.key) return
    if (loading || tablesData.length === 0) return

    const hit = tablesData.find(t => t.name === highlight || t._id === highlight || t.id === highlight)
    if (hit) {
      lastHandledKeyRef.current = location.key
      setActiveTab('live-feed')
      setSelectedTable(hit)
    } else {
      lastHandledKeyRef.current = location.key
      toast.error(`Table "${highlight}" not found`)
    }
  }, [location.key, location.state?.highlightTable, tablesData, loading])

  // ── Merge Tables view ──────────────────────────────────────────────────
  if (showMergeTables) {
    return (
      <MergeTables
        onCancel={() => setShowMergeTables(false)}
        onComplete={() => {
          setShowMergeTables(false)
          fetchDashboardData()
        }}
      />
    )
  }

  // ── Loading state ──────────────────────────────────────────────────────
  // Skeleton UI is preferred over a full-screen spinner: the page shell
  // paints in <100ms so admins perceive the dashboard as snappy even on
  // slow first paint, instead of staring at a centred spinner.
  if (loading && !tablesData.length) {
    return (
      <div className="space-y-6 py-6">
        <SkeletonStatGrid count={4} />
        <SkeletonTablesGrid count={12} />
      </div>
    )
  }

  // ── Error state ───────────────────────────────────────────────────────
  // Only the hard-fail case (zero data + error). React Query auto-retries
  // twice; if data was previously cached we keep showing it on a transient
  // failure instead of yanking the admin back to a blocking error screen.
  if (fetchError && !tablesData.length) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-3 py-20">
        <AlertTriangle size={36} className="text-[#EF4444]" />
        <p className="text-[14px] font-[600] text-[#1A181B] font-manrope">{fetchError}</p>
        <button onClick={() => fetchDashboardData()} className="px-4 py-2 rounded-lg bg-[#FE8301] text-white text-[14px] font-[600] font-manrope">
          Retry
        </button>
      </div>
    )
  }

  // ═══════════════════════════════════════════════════════════════════════
  // LIVE FEED TAB
  // ═══════════════════════════════════════════════════════════════════════
  const renderLiveFeed = () => (
    <>
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
        <div>
          <h1 className="font-manrope font-[700] text-[20px] leading-[26px] text-[#1A181B]">Live Feed</h1>
          <p className="font-manrope font-[600] text-[16px] leading-[22px] text-[#645E66] mt-1">Monitor tables, orders, and alerts in real time</p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => setShowAddReservationModal(true)} className="flex items-center gap-2 px-4 py-2.5 text-orange-500 font-[600] border border-orange-500 rounded-[10px] hover:bg-[#FFF3E6] active:bg-[#FFE6CC] transition-colors font-manrope text-[14px]">
            <CalendarPlus size={18} />
            Add Reservation
          </button>
          <button onClick={() => setShowMergeTables(true)} className="flex items-center gap-2 px-5 py-2.5 text-orange-500 font-[600] border border-orange-500 rounded-[10px] hover:bg-[#FFF3E6] active:bg-[#FFE6CC] transition-colors font-manrope text-[14px]">
            <Link size={18} className="rotate-45" />
            Merge Table
          </button>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-1 mb-4 overflow-x-auto pb-2 no-scrollbar">
        {dynamicFilters.map(filter => (
          <button
            key={filter._id || filter.name}
            onClick={() => setActiveFilter(filter.name)}
            className={`h-[36px] px-4 py-2 rounded-[50px] text-[14px] leading-[20px] font-manrope font-[600] border-[1.5px] transition-all whitespace-nowrap
            ${activeFilter === filter.name
              ? 'bg-white text-[#702083] border-[#702083] shadow-[0px_2px_8px_0px_#00000029]'
              : !(filter.isActive ?? true)
                ? 'bg-[#F9FAFB] text-[#98A2B3] border-[#F2F4F7] hover:bg-[#F2F4F7]'
                : 'bg-white text-[#344054] border-[#D0D5DD] hover:bg-gray-50'
            }`}
          >
            {filter.name}
          </button>
        ))}
      </div>

      <div className="bg-white p-6 rounded-[20px]">
        {/* Legend */}
        <div className="flex items-center gap-6 mb-4 text-sm flex-wrap">
          {LEGEND_ITEMS.map(l => (
            <div key={l.label} className="flex items-center gap-2">
              <div className={`w-4 h-4 ${l.bg} border ${l.border} rounded shadow-sm ${l.opacity ? 'opacity-50' : ''} flex items-center justify-center`}>
                {l.icon && <AlertTriangle size={10} className="text-[#F5CD00]" />}
              </div>
              <span className="text-gray-600">{l.label}</span>
            </div>
          ))}
        </div>

        {/* Tables Grid */}
        <div className="flex flex-wrap gap-4 overflow-y-auto pb-4">
          {tablesGrid.length === 0 ? (
            <div className="w-full py-12 text-center text-gray-400">
              <p className="text-[15px] font-[600]">No tables found</p>
              <p className="text-[13px] mt-1">{activeFilter !== 'All' ? 'Try selecting a different area' : 'Add tables in the Management tab'}</p>
            </div>
          ) : tablesGrid.map((table) => (
            <div
              key={table._id}
              onClick={() => setSelectedTable(table)}
              className={`w-[110px] p-4 rounded-[12px] border shadow-sm transition-all cursor-pointer ${hoverShadows[table.status] || ''} ${statusColors[table.status]}`}
            >
              <div className="flex items-start justify-between mb-2">
                <span className={`text-[18px] leading-[24px] font-[700] font-manrope ${statusTextColors[table.status]}`}>{table.name}</span>
                {table.status === 'alert' && <AlertTriangle size={16} className="text-[#FF3B30]" />}
              </div>
              <p className={`text-[12px] leading-[18px] font-[600] font-manrope ${table.status === 'disabled' ? 'text-gray-400' : 'text-[#667085]'}`}>
                Capacity: {table.capacity}
              </p>
              {table.status !== 'disabled' && (() => {
                const seats = seatInfo(table, processedTablesData)
                return (
                  <SeatedCount
                    taken={seats.taken}
                    capacity={seats.capacity}
                    size={11}
                    className="mt-0.5 text-[11px] leading-[16px] font-[600] font-manrope text-[#667085]"
                  />
                )
              })()}
            </div>
          ))}
        </div>
      </div>
    </>
  )

  // ═══════════════════════════════════════════════════════════════════════
  // MANAGEMENT TAB
  // ═══════════════════════════════════════════════════════════════════════
  const renderManagement = () => (
    <>
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
        <div>
          <h1 className="font-manrope font-[700] text-[20px] leading-[26px] text-[#1A181B]">Tables & QR Management</h1>
          <p className="font-manrope font-[600] text-[16px] leading-[22px] text-[#645E66] mt-1">Manage table setup and QR access</p>
        </div>
        <div className="flex items-center gap-3">
          <button type="button" onClick={() => { setSelectedQRTable(null); setShowQRModal(true) }} className="flex items-center gap-2 px-4 py-2.5 text-[#FE8301] font-[600] border border-[#FE8301] rounded-[10px] hover:bg-orange-50 transition-colors font-manrope text-[14px]">
            <Download size={18} />
            Download All QR
          </button>
          <button type="button" onClick={() => setShowAddAreaModal(true)} className="flex items-center gap-2 px-4 py-2.5 text-[#FE8301] font-[600] border border-[#FE8301] rounded-[10px] hover:bg-orange-50 transition-colors font-manrope text-[14px]">
            <Plus size={18} />
            Add Area
          </button>
          <button type="button" onClick={() => setShowBulkAddTablesModal(true)} className="flex items-center gap-2 px-4 py-2.5 text-[#FE8301] font-[600] border border-[#FE8301] rounded-[10px] hover:bg-orange-50 transition-colors font-manrope text-[14px]" title="Download starter template, fill it, upload to create many tables at once">
            <Upload size={18} />
            Bulk Add
          </button>
          <button type="button" onClick={() => setShowAddTableModal(true)} className="flex items-center gap-2 px-5 py-2.5 bg-[#FE8301] text-white font-[600] rounded-[10px] hover:bg-[#DC6803] shadow-md shadow-orange-500/20 transition-all font-manrope text-[14px]">
            <Plus size={18} />
            Add Table
          </button>
        </div>
      </div>

      {/* Area Filter */}
      <div className="flex items-center gap-1 mb-4 overflow-x-auto pb-2 no-scrollbar">
        {dynamicFilters.map(filter => (
          <button
            key={filter._id || filter.name}
            onClick={() => setManagementAreaFilter(filter.name)}
            className={`h-[36px] px-4 py-2 rounded-[50px] text-[14px] leading-[20px] font-manrope font-[600] border-[1.5px] transition-all whitespace-nowrap
            ${managementAreaFilter === filter.name
              ? 'bg-white text-[#702083] border-[#702083] shadow-[0px_2px_8px_0px_#00000029]'
              : !(filter.isActive ?? true)
                ? 'bg-[#F9FAFB] text-[#98A2B3] border-[#F2F4F7] hover:bg-[#F2F4F7]'
                : 'bg-white text-[#344054] border-[#D0D5DD] hover:bg-gray-50'
            }`}
          >
            {filter.name}
          </button>
        ))}
      </div>

      {/* Table List */}
      <div className="bg-white rounded-[12px] border border-[#EAECF0] overflow-hidden overflow-x-auto shadow-sm">
        <div className="min-w-[800px]">
          <div className="grid grid-cols-[1fr_1fr_1fr_1fr_1.5fr] gap-4 px-6 py-3 bg-[#F9FAFB] border-b border-[#EAECF0] text-[12px] leading-[18px] font-[600] text-[#667085] font-manrope">
            <span>Table No.</span>
            <span>Area</span>
            <span>Table Capacity</span>
            <span>Status</span>
            <span className="text-right">Action</span>
          </div>

          {tablesList.length === 0 ? (
            <div className="px-6 py-12 text-center text-gray-400 text-[14px] font-[500]">No tables found</div>
          ) : tablesList.map((table) => (
            <div
              key={table._id}
              className={`grid grid-cols-[1fr_1fr_1fr_1fr_1.5fr] gap-4 px-6 py-4 border-b border-[#EAECF0] items-center transition-colors last:border-none ${table.status === 'disabled' ? 'bg-[#F9FAFB]' : 'hover:bg-[#F9FAFB]'}`}
            >
              <span className={`text-[14px] leading-[20px] font-[600] font-manrope ${table.status === 'disabled' ? 'text-[#98A2B3]' : 'text-[#101828]'}`}>{table.name}</span>
              <span className={`text-[14px] leading-[20px] font-[600] font-manrope ${table.status === 'disabled' ? 'text-[#98A2B3]' : 'text-[#101828]'}`}>{table.area?.name || '—'}</span>
              <span className={`text-[14px] leading-[20px] font-[600] font-manrope ${table.status === 'disabled' ? 'text-[#98A2B3]' : 'text-[#101828]'}`}>{table.capacity} Person</span>
              <span className={`text-[12px] leading-[18px] font-[500] px-2.5 py-0.5 rounded-full w-fit font-manrope ${statusBadgeStyle(table.status)}`}>
                {statusLabel(table.status)}
              </span>
              <div className="flex items-center justify-end gap-4">
                <button onClick={(e) => { e.stopPropagation(); setSelectedQRTable(table); setShowQRModal(true) }} className={`transition-colors ${table.status === 'disabled' ? 'text-[#D0D5DD]' : 'text-gray-400 hover:text-[#FE8301]'}`} title={`QR: ${table.name}`} disabled={!table.isAreaActive}>
                  <QrCode size={20} />
                </button>
                <button onClick={() => { setTableToEdit(table); setShowAddTableModal(true) }} className={`transition-colors ${table.status === 'disabled' ? 'text-[#D0D5DD]' : 'text-gray-400 hover:text-[#FE8301]'}`} disabled={!table.isAreaActive}>
                  <Edit2 size={20} />
                </button>
                <button onClick={() => setTableToDelete(table)} className={`transition-colors ${table.status === 'disabled' ? 'text-[#D0D5DD]' : 'text-gray-400 hover:text-red-500'}`}>
                  <Trash2 size={20} />
                </button>
                <button onClick={() => toggleTableStatus(table)} disabled={!table.isAreaActive} className={`relative inline-flex items-center ${!table.isAreaActive ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}>
                  <input type="checkbox" className="sr-only peer" checked={table.status !== 'disabled'} readOnly />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#12B76A]"></div>
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  )

  // ═══════════════════════════════════════════════════════════════════════
  // BILL SUMMARY (shared between views)
  // ═══════════════════════════════════════════════════════════════════════
  const renderBillSummary = ({ editable = false }) => (
    <div className="border border-gray-200 rounded-[12px] overflow-hidden">
      <div className="divide-y divide-gray-100">
        {loadingOrders ? (
          <div className="px-4 py-8 text-center text-[14px] text-[#667085] font-manrope">Loading active order...</div>
        ) : orderItems.length > 0 ? (
          orderItems.map((item) => (
            <div key={item.id} className="px-4 py-3">
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  {item.tableName && (
                    <span className="px-2 py-0.5 bg-[#F9F5FF] text-[#9E77ED] text-[10px] font-[500] rounded font-manrope mr-2">{item.tableName}</span>
                  )}
                  <p className="text-[14px] font-[500] text-[#101828] font-manrope inline">
                    {item.name}  {item.quantity}x
                  </p>
                  {item.addon && (
                    <p className="text-[12px] font-[400] text-[#667085] font-manrope">{item.addon}</p>
                  )}
                </div>
                <div className="text-right">
                  <p className="text-[14px] font-[600] text-[#101828] font-manrope">₹{(item.price * item.quantity).toFixed(2)}</p>
                  {item.addonPrice > 0 && (
                    <p className="text-[12px] font-[400] text-[#667085] font-manrope">₹{(item.addonPrice * item.quantity).toFixed(2)}</p>
                  )}
                </div>
              </div>
              {editable && (
                <div className="flex items-center justify-between mt-2">
                  <p className="text-[12px] font-[400] text-[#667085] font-manrope">₹{item.price} each</p>
                  <div className="flex items-center gap-2">
                    <button onClick={() => decrementQuantity(item.id)} className="w-7 h-7 rounded-full border border-[#D0D5DD] flex items-center justify-center text-[#667085] hover:border-[#FE8301] hover:text-[#FE8301] transition-colors"><Minus size={14} /></button>
                    <span className="w-8 text-center text-[14px] font-[600] text-[#101828] font-manrope">{item.quantity}</span>
                    <button onClick={() => incrementQuantity(item.id)} className="w-7 h-7 rounded-full border border-[#D0D5DD] flex items-center justify-center text-[#667085] hover:border-[#FE8301] hover:text-[#FE8301] transition-colors"><Plus size={14} /></button>
                    <button onClick={() => removeOrderItem(item.id)} className="w-7 h-7 rounded-full bg-[#FEF3F2] flex items-center justify-center text-[#F04438] hover:bg-[#FEE4E2] transition-colors ml-2"><X size={14} /></button>
                  </div>
                </div>
              )}
            </div>
          ))
        ) : (
          <div className="px-4 py-8 text-center text-[14px] text-[#667085] font-manrope">No active items in this order.</div>
        )}
      </div>

      {/* Totals */}
      <div className="border-t border-gray-200 bg-[#FAFAFA]">
        <div className="px-4 py-2 flex justify-between items-center">
          <p className="text-[14px] font-[500] text-[#101828] font-manrope">Subtotal</p>
          <p className="text-[14px] font-[600] text-[#101828] font-manrope">₹{subtotal.toFixed(2)}</p>
        </div>
        <div className="px-4 py-2 flex justify-between items-center">
          <p className="text-[14px] font-[400] text-[#667085] font-manrope">Service Charge{pctLabel(serviceChargePercent)}</p>
          <p className="text-[14px] font-[400] text-[#667085] font-manrope">+₹{serviceCharge.toFixed(2)}</p>
        </div>
        <div className="px-4 py-2 flex justify-between items-center">
          <p className="text-[14px] font-[400] text-[#667085] font-manrope">GST{pctLabel(gstPercent)}</p>
          <p className="text-[14px] font-[400] text-[#667085] font-manrope">+₹{gst.toFixed(2)}</p>
        </div>
        {bill.additionalCharges.map((charge, idx) => (
          <div key={`addl-${idx}`} className="px-4 py-2 flex justify-between items-center">
            <p className="text-[14px] font-[400] text-[#667085] font-manrope">
              {charge.name}{charge.type === 'Percentage' ? ` (${charge.value}%)` : ''}
            </p>
            <p className="text-[14px] font-[400] text-[#667085] font-manrope">+₹{charge.amount.toFixed(2)}</p>
          </div>
        ))}
        {activeOrderMeta?.couponDiscount > 0 && (
          <div className="px-4 py-2 flex justify-between items-center">
            <p className="text-[14px] font-[400] text-[#027A48] font-manrope">
              Coupon{activeOrderMeta.couponCode ? ` (${activeOrderMeta.couponCode})` : ''}
            </p>
            <p className="text-[14px] font-[500] text-[#027A48] font-manrope">-₹{activeOrderMeta.couponDiscount.toFixed(2)}</p>
          </div>
        )}
        {activeOrderMeta?.pointsRedeemed > 0 && (
          <div className="px-4 py-2 flex justify-between items-center">
            <p className="text-[14px] font-[400] text-[#027A48] font-manrope">Wallet Points</p>
            <p className="text-[14px] font-[500] text-[#027A48] font-manrope">-₹{activeOrderMeta.pointsRedeemed.toFixed(2)}</p>
          </div>
        )}
        {activeOrderMeta?.tipAmount > 0 && (
          <div className="px-4 py-2 flex justify-between items-center">
            <p className="text-[14px] font-[400] text-[#667085] font-manrope">Tip</p>
            <p className="text-[14px] font-[500] text-[#101828] font-manrope">+₹{activeOrderMeta.tipAmount.toFixed(2)}</p>
          </div>
        )}
        <div className="px-4 py-2 flex justify-between items-center">
          <p className="text-[14px] font-[400] text-[#667085] font-manrope">Manual Discount</p>
          {editable ? (
            <div className="flex items-center gap-1">
              <select value={discount} onChange={async (e) => {
                const v = Number(e.target.value);
                setDiscount(v);
                // Persist to the order so the CUSTOMER's bill-preview shows
                // the discount immediately (order:updated → bill refetch),
                // not just at settlement. Best-effort — the local value
                // still applies at settle even if the save blips.
                if (activeOrderMeta?._id) {
                  try { await api.patch(`/orders/${activeOrderMeta._id}/status`, { manualDiscount: v }); }
                  catch { /* settle still applies it locally */ }
                }
              }} className="appearance-none bg-transparent border border-[#D0D5DD] rounded-[6px] px-2 py-1 text-[14px] font-[400] text-[#667085] font-manrope focus:outline-none focus:border-[#FE8301]">
                <option value={0}>₹0.00</option>
                <option value={50}>-₹50.00</option>
                <option value={100}>-₹100.00</option>
                <option value={200}>-₹200.00</option>
              </select>
              <ChevronDown size={14} className="text-[#667085] -ml-5 pointer-events-none" />
            </div>
          ) : (
            <p className="text-[14px] font-[400] text-[#667085] font-manrope">-₹{discount.toFixed(2)}</p>
          )}
        </div>
        <div className="px-4 py-3 flex justify-between items-center border-t border-gray-200">
          <p className="text-[14px] font-[600] text-[#101828] font-manrope">Total</p>
          <p className="text-[16px] font-[700] text-[#101828] font-manrope">
            ₹{billTotal.toFixed(2)}
          </p>
        </div>
        {alreadyPaid > 0 && activeOrderMeta?.paymentStatus !== 'Paid' && (
          <>
            <div className="px-4 py-2 flex justify-between items-center">
              <p className="text-[14px] font-[400] text-[#027A48] font-manrope">Already Paid</p>
              <p className="text-[14px] font-[500] text-[#027A48] font-manrope">-₹{alreadyPaid.toFixed(2)}</p>
            </div>
            <div className="px-4 py-3 flex justify-between items-center border-t border-gray-200">
              <p className="text-[14px] font-[600] text-[#101828] font-manrope">Amount Due</p>
              <p className="text-[16px] font-[700] text-[#101828] font-manrope">₹{payableTotal.toFixed(2)}</p>
            </div>
          </>
        )}
        {hasUnsavedItemEdits && (
          <p className="px-4 pb-3 text-[12px] text-[#B54708] font-manrope">
            Item edits here are not saved to the order — the bill above is the placed order. Use Add Item to change it.
          </p>
        )}
      </div>
    </div>
  )

  // ═══════════════════════════════════════════════════════════════════════
  // DRAWER CONTENT RENDERERS
  // ═══════════════════════════════════════════════════════════════════════

  // Inline "Bill Paid" confirmation card. Rendered below the bill summary
  // in the occupied / merged drawers when the order is already paid (e.g.
  // customer paid from their device, Razorpay webhook flipped status,
  // waiter settled, etc.) so the admin sees the same confirmation as the
  // post-pay drawer instead of a misleading Pay button.
  const renderBillPaidCard = (method) => (
    <div className="px-6 pt-3 pb-1">
      <div className="bg-[#ECFDF3] border border-[#12B76A] rounded-[16px] p-6 w-full flex flex-col items-center">
        <div className="w-12 h-12 rounded-full border-2 border-[#12B76A] flex items-center justify-center mb-3">
          <CheckCircle size={24} className="text-[#12B76A]" />
        </div>
        <p className="text-[16px] font-[700] text-[#101828] font-manrope mb-1">
          Bill Paid via {(method && method !== 'Not selected' ? method : 'CASH').toUpperCase()}
        </p>
        <p className="text-[13px] font-[400] text-[#12B76A] font-manrope">Transaction completed successfully</p>
      </div>
    </div>
  )

  const renderPaymentSuccess = () => (
    <>
      <div className="flex-1 flex flex-col items-center justify-center px-6">
        <div className="bg-[#ECFDF3] border border-[#12B76A] rounded-[16px] p-8 w-full flex flex-col items-center">
          <div className="w-16 h-16 rounded-full border-2 border-[#12B76A] flex items-center justify-center mb-4">
            <CheckCircle size={32} className="text-[#12B76A]" />
          </div>
          <p className="text-[18px] font-[700] text-[#101828] font-manrope mb-1">Bill Paid via {selectedPaymentMethod?.toUpperCase()}</p>
          <p className="text-[14px] font-[400] text-[#12B76A] font-manrope">Transaction completed successfully</p>
        </div>
      </div>
      <div className="px-6 py-4 flex-shrink-0">
        <button
          onClick={() => {
            // Backend already freed the table (and unmerged the group if
            // merged) when we PATCHed paymentStatus: 'Paid'. Frontend
            // just clears local UI state and closes the drawer.
            setOrderItems([])
            setDiscount(0)
            closeDrawer()
          }}
          className="w-full py-3 bg-white border border-[#FE8301] text-[#FE8301] rounded-[10px] font-[600] text-[14px] font-manrope hover:bg-[#FFF3E6] transition-colors"
        >
          Back to Tables
        </button>
      </div>
    </>
  )

  const renderPaymentMethodSelection = () => (
    <>
      <div className="px-6 py-3 border-b border-gray-100 flex-shrink-0 bg-[#FFF9F5]">
        <button onClick={() => setIsPaymentView(false)} className="flex items-center gap-2 text-[14px] font-[500] text-[#667085] font-manrope hover:text-[#101828] transition-colors">
          <ArrowLeft size={16} /> Back to Active Order
        </button>
      </div>
      <div className="px-6 py-3">
        <p className="text-[12px] font-[500] text-[#98A2B3] font-manrope">Bill Summary</p>
      </div>
      <div className="flex-1 overflow-y-auto px-6">
        {renderBillSummary({ editable: false })}
      </div>
      <div className="px-6 py-4 flex-shrink-0">
        <p className="text-[14px] font-[600] text-[#101828] font-manrope mb-3">Select Payment Method</p>
        <div className="space-y-3">
          {['Cash', 'UPI', 'Card', 'Net Banking'].map((method) => (
            <label key={method} onClick={() => setSelectedPaymentMethod(method)} className="flex items-center gap-3 cursor-pointer">
              <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${selectedPaymentMethod === method ? 'border-[#FE8301]' : 'border-[#D0D5DD]'}`}>
                {selectedPaymentMethod === method && <div className="w-2.5 h-2.5 rounded-full bg-[#FE8301]" />}
              </div>
              <span className="text-[14px] font-[400] text-[#101828] font-manrope">{method}</span>
            </label>
          ))}
        </div>
      </div>
      <div className="px-6 py-4 flex-shrink-0">
        <button
          onClick={() => {
            settleBillPayment({ amount: payableTotal, method: selectedPaymentMethod })
          }}
          disabled={!selectedPaymentMethod || isSettlingPayment || !activeOrderMeta?._id}
          className={`w-full py-3 rounded-[10px] font-[600] text-[14px] font-manrope transition-colors flex items-center justify-center gap-2 ${selectedPaymentMethod && !isSettlingPayment && activeOrderMeta?._id ? 'bg-[#FE8301] text-white hover:bg-[#DC6803]' : 'bg-[#DFDCE0] text-[#B6AEB8] cursor-not-allowed'}`}
        >
          {isSettlingPayment ? <Loader2 size={18} className="animate-spin" /> : <CheckCircle size={18} />}
          {isSettlingPayment ? 'Recording…' : 'Done'}
        </button>
      </div>
    </>
  )

  const renderEditBill = () => (
    <>
      <div className="px-6 py-3 border-b border-gray-100 flex-shrink-0 bg-[#FFF9F5]">
        <button onClick={() => setIsEditingBill(false)} className="flex items-center gap-2 text-[14px] font-[500] text-[#667085] font-manrope hover:text-[#101828] transition-colors">
          <ArrowLeft size={16} /> Back to Active Order
        </button>
      </div>
      <div className="px-6 py-2 flex items-center justify-between">
        <p className="text-[12px] font-[500] text-[#98A2B3] font-manrope">Active Order</p>
        <button
          onClick={openAddItemPicker}
          disabled={!activeOrderMeta?._id}
          className="flex items-center gap-1 px-3 py-1.5 border border-[#FE8301] text-[#FE8301] rounded-[8px] text-[12px] font-[600] font-manrope hover:bg-[#FFF3E6] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          title={activeOrderMeta?._id ? 'Add a missed / late-parcel item' : 'No active order'}
        >
          <Plus size={14} /> Add Item
        </button>
      </div>
      <div className="flex-1 overflow-y-auto px-6">
        {renderBillSummary({ editable: true })}
      </div>
      <div className="px-6 py-4 flex-shrink-0">
        <button onClick={() => { setIsEditingBill(false); setIsPaymentView(true) }} className="w-full py-3 bg-[#FE8301] text-white rounded-[10px] font-[600] text-[14px] font-manrope hover:bg-[#DC6803] transition-colors">
          Proceed to Pay
        </button>
      </div>
    </>
  )

  const renderOccupiedDrawer = () => {
    // Prefer the actual active order's customer over a matching reservation.
    // A pending reservation for a different diner can easily linger on the
    // same table; showing THAT person instead of the real occupant (a
    // QR-scan guest, say) leaks unrelated PII into the admin panel.
    //
    // `currentDiner` is the snapshot written by /tables/:id/claim when a
    // logged-in customer arrives via the QR-scan flow but hasn't placed
    // their first order yet. Without it the drawer would render
    // "Walk-in Guest" for a known, registered customer who's just
    // browsing the menu — see Backend/models/table.js currentDiner.
    const orderCustomer = activeOrderCustomer
    const resCustomer = selectedTable?.activeReservation
    const claimedDiner = selectedTable?.currentDiner?.user || selectedTable?.currentDiner?.name
      ? selectedTable.currentDiner
      : null
    const displayName = orderCustomer?.name
      || claimedDiner?.user?.name
      || claimedDiner?.name
      || resCustomer?.guestName
      || 'Walk-in Guest'
    const displayPhone = orderCustomer?.phone
      || claimedDiner?.user?.mobile
      || claimedDiner?.phone
      || resCustomer?.contactNo
      || 'N/A'
    const isGuestCheckout = orderCustomer
      ? !orderCustomer.isRegistered
      : claimedDiner
        ? !claimedDiner.isRegistered
        : !resCustomer
    return (
    <>
      <div className="px-6 py-4 border-b border-gray-100 flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="relative">
            <InitialsAvatar name={displayName} size={48} />
            <div className="absolute bottom-0 right-0 w-3 h-3 bg-[#12B76A] rounded-full border-2 border-white" />
          </div>
          <div>
            <p className="text-[14px] font-[600] text-[#101828] font-manrope">{displayName}</p>
            <p className="text-[12px] font-[400] text-[#667085] font-manrope">{displayPhone}</p>
            {isGuestCheckout ? (
              <span className="inline-block mt-1 px-2 py-0.5 bg-[#E0F2FE] text-[#0369A1] text-[10px] font-[500] rounded-full font-manrope">Guest</span>
            ) : (
              <span className="inline-block mt-1 px-2 py-0.5 bg-[#ECFDF3] text-[#027A48] text-[10px] font-[500] rounded-full font-manrope">Registered</span>
            )}
          </div>
          <SeatedCount
            {...seatInfo(selectedTable, processedTablesData)}
            size={14}
            className="ml-auto self-start text-[12px] font-[600] text-[#344054] font-manrope"
          />
        </div>
      </div>
      {/* Empty-cart state — shown when the table is occupied (customer
          has sat down / scanned QR) but no items are on the order yet.
          Hides the full tax breakdown + Proceed to Pay so an empty bill
          never shows misleading flat charges. A background sweeper
          auto-frees tables stuck in this state past the grace window
          (see Backend/utils/emptyOrderSweeper.js). */}
      {orderItems.length === 0 ? (
        <>
          <div className="flex-1 overflow-y-auto flex items-center justify-center px-6 py-10">
            <div className="w-full max-w-[280px] text-center">
              <div className="mx-auto w-14 h-14 rounded-full bg-[#FFF3E6] flex items-center justify-center mb-4">
                <UtensilsCrossed size={24} className="text-[#FE8301]" strokeWidth={1.75} />
              </div>
              <p className="text-[18px] font-[600] text-[#101828] font-manrope">No Items added yet</p>
              <p className="text-[13px] font-[400] text-[#667085] font-manrope mt-1.5">
                Start adding items to generate bill.
              </p>
              <p className="text-[11px] font-[400] text-[#98A2B3] font-manrope mt-4">
                Table freed automatically after {emptyCartGraceMinutes} min of inactivity.
              </p>
            </div>
          </div>
          <div className="px-6 py-4 border-t border-gray-100 flex-shrink-0 space-y-2.5">
            <button
              onClick={openAddItemPicker}
              className="w-full py-3 bg-[#FE8301] text-white rounded-[10px] font-[600] text-[15px] font-manrope hover:bg-[#DC6803] transition-colors flex items-center justify-center gap-2"
            >
              <Plus size={18} strokeWidth={2.5} />
              Add Item
            </button>
            <button
              onClick={handleFreeTableNow}
              disabled={freeingTable}
              className="w-full py-2.5 border border-gray-300 text-[#667085] rounded-[10px] font-[600] text-[13px] font-manrope hover:bg-gray-50 hover:text-[#101828] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {freeingTable ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={14} />}
              {freeingTable ? 'Freeing…' : 'Free Table'}
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="flex-1 overflow-y-auto">
            <div className="px-6 py-3">
              <p className="text-[12px] font-[500] text-[#98A2B3] font-manrope">Active Order</p>
            </div>
            <div className="px-6">{renderBillSummary({ editable: false })}</div>
            {/* Once the order is paid (via Razorpay webhook, customer bill,
                waiter payment, or this drawer), the socket refresh flips
                activeOrderMeta and we render the success card right under
                the bill summary — and hide Edit/Pay below — so a second
                payment attempt can't double-charge. */}
            {activeOrderMeta?.paymentStatus === 'Paid' && (
              renderBillPaidCard(activeOrderMeta?.paymentMethod)
            )}
          </div>
          <div className="px-6 py-4 border-t border-gray-100 flex-shrink-0 space-y-3">
            {activeOrderMeta?.paymentStatus !== 'Paid' && (
              <div className="flex gap-3">
                <button onClick={() => setIsEditingBill(true)} className="flex-1 py-2.5 border border-[#FE8301] text-[#FE8301] rounded-[10px] font-[600] text-[14px] font-manrope hover:bg-[#FFF3E6] transition-colors">Edit Bill</button>
                <button onClick={() => setIsPaymentView(true)} className="flex-1 py-2.5 bg-[#FE8301] text-white rounded-[10px] font-[600] text-[14px] font-manrope hover:bg-[#DC6803] transition-colors">Proceed to Pay</button>
              </div>
            )}
            <button
              onClick={handleReprintKOT}
              disabled={!activeOrderMeta?._id || kotSubmitting}
              title={activeOrderMeta?._id ? 'Re-send the kitchen order ticket and open a printable copy' : 'No active order on this table'}
              className="w-full py-2.5 border border-[#FE8301] text-[#FE8301] rounded-[10px] font-[600] text-[14px] font-manrope hover:bg-[#FFF3E6] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {kotSubmitting && <Loader2 size={16} className="animate-spin" />}
              {kotSubmitting ? 'Sending…' : 'KOT'}
            </button>
            <button
              onClick={handlePrintBill}
              disabled={!activeOrderMeta?._id || billPrinting}
              title={activeOrderMeta?._id ? 'Print the bill on the counter thermal printer' : 'No active order on this table'}
              className="w-full py-2.5 border border-[#702083] text-[#702083] rounded-[10px] font-[600] text-[14px] font-manrope hover:bg-[#F7EEF9] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {billPrinting && <Loader2 size={16} className="animate-spin" />}
              {billPrinting ? 'Printing…' : 'Print bill'}
            </button>
            {/* Close bill & free — for the abandoned-table case: the
                previous guest left without settling. Writes off the open
                bill (with a cascade-preview confirm) and frees the table
                for the next diner. Hidden once paid (table frees itself). */}
            {activeOrderMeta?.paymentStatus !== 'Paid' && (
              <button
                onClick={handleFreeTableNow}
                disabled={freeingTable}
                title="Write off the open bill and free this table for the next diner"
                className="w-full py-2.5 border border-red-300 text-red-600 rounded-[10px] font-[600] text-[13px] font-manrope hover:bg-red-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {freeingTable ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={14} />}
                {freeingTable ? 'Freeing…' : 'Close bill & free table'}
              </button>
            )}
          </div>
        </>
      )}
    </>
    )
  }

  const renderMergedDrawer = () => {
    const mergedIds = [selectedTable._id, ...(selectedTable.mergedWith || [])].map(String)
    const groupTables = processedTablesData.filter(t => mergedIds.includes(String(t._id)))
    const totalCapacity = groupTables.reduce((sum, t) => sum + (t.capacity || 0), 0)
    const res = selectedTable?.activeReservation
    // Same logic as renderOccupiedDrawer — active order wins over a
    // stale pending reservation on the same table group. `currentDiner`
    // (set by /tables/:id/claim) sits between them so a registered
    // customer who's claimed the leader table but hasn't ordered yet
    // still shows up by name instead of "Walk-in Guest".
    const claimedDiner = selectedTable?.currentDiner?.user || selectedTable?.currentDiner?.name
      ? selectedTable.currentDiner
      : null
    const mergedDisplayName = activeOrderCustomer?.name
      || claimedDiner?.user?.name
      || claimedDiner?.name
      || res?.guestName
      || 'Walk-in Guest'
    const mergedDisplayPhone = activeOrderCustomer?.phone
      || claimedDiner?.user?.mobile
      || claimedDiner?.phone
      || res?.contactNo
      || 'N/A'

    return (
      <>
        {/* Merged tables info */}
        <div className="px-6 py-4 border-b border-gray-100 flex-shrink-0">
          <p className="text-[12px] font-[500] text-[#98A2B3] font-manrope mb-2">Merged Tables ({groupTables.length})</p>
          <div className="flex items-center gap-2 flex-wrap">
            {groupTables.map(t => (
              <span key={t._id} className="px-2.5 py-1 bg-[#F9F5FF] text-[#9E77ED] text-[12px] font-[600] rounded-lg font-manrope">{t.name}</span>
            ))}
            <span className="text-[12px] text-[#667085] ml-2">Total Capacity: {totalCapacity}</span>
            <SeatedCount
              taken={seatInfo(selectedTable, processedTablesData).taken}
              capacity={totalCapacity}
              className="text-[12px] font-[600] text-[#344054] font-manrope ml-2"
            />
          </div>
        </div>

        {/* Customer info */}
        <div className="px-6 py-4 border-b border-gray-100 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="relative">
              <InitialsAvatar name={mergedDisplayName} size={48} />
              <div className="absolute bottom-0 right-0 w-3 h-3 bg-[#12B76A] rounded-full border-2 border-white" />
            </div>
            <div className="flex-1">
              <p className="text-[14px] font-[600] text-[#101828] font-manrope">{mergedDisplayName}</p>
              <p className="text-[12px] font-[400] text-[#667085] font-manrope">{mergedDisplayPhone}</p>
            </div>
            {!activeOrderCustomer && res?.guestCount && (
              <div className="text-right">
                <p className="text-[16px] font-[700] text-[#101828] font-manrope">{res.guestCount}</p>
                <p className="text-[10px] font-[500] text-[#667085] font-manrope">guests</p>
              </div>
            )}
          </div>
          {(res?.date || res?.time) && (
            <div className="flex items-center gap-4 mt-3 pt-3 border-t border-gray-100">
              {res?.date && (
                <div>
                  <p className="text-[11px] font-[400] text-[#98A2B3] font-manrope">Date</p>
                  <p className="text-[13px] font-[600] text-[#101828] font-manrope">{new Date(res.date).toLocaleDateString()}</p>
                </div>
              )}
              {res?.time && (
                <div>
                  <p className="text-[11px] font-[400] text-[#98A2B3] font-manrope">Time</p>
                  <p className="text-[13px] font-[600] text-[#101828] font-manrope">{res.time}</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Combined Group Order */}
        <div className="flex-1 overflow-y-auto">
          <div className="px-6 py-3">
            <p className="text-[12px] font-[500] text-[#98A2B3] font-manrope">Combined Group Order</p>
          </div>
          <div className="px-6">{renderBillSummary({ editable: false })}</div>
          {activeOrderMeta?.paymentStatus === 'Paid' && (
            renderBillPaidCard(activeOrderMeta?.paymentMethod)
          )}
        </div>
        {activeOrderMeta?.paymentStatus !== 'Paid' && (
          <div className="px-6 py-4 border-t border-gray-100 flex-shrink-0 space-y-3">
            <div className="flex gap-3">
              <button onClick={() => setIsEditingBill(true)} className="flex-1 py-2.5 border border-[#FE8301] text-[#FE8301] rounded-[10px] font-[600] text-[14px] font-manrope hover:bg-[#FFF3E6] transition-colors">Edit Bill</button>
              <button onClick={() => setIsPaymentView(true)} className="flex-1 py-2.5 bg-[#FE8301] text-white rounded-[10px] font-[600] text-[14px] font-manrope hover:bg-[#DC6803] transition-colors">Proceed to Pay</button>
            </div>
            {/* Close bill & free — abandoned-table reset (see main drawer). */}
            <button
              onClick={handleFreeTableNow}
              disabled={freeingTable}
              title="Write off the open bill and free this table for the next diner"
              className="w-full py-2.5 border border-red-300 text-red-600 rounded-[10px] font-[600] text-[13px] font-manrope hover:bg-red-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {freeingTable ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={14} />}
              {freeingTable ? 'Freeing…' : 'Close bill & free table'}
            </button>
          </div>
        )}
      </>
    )
  }

  const renderReservedDrawer = () => {
    const isMergedReservation = selectedTable.mergedWith?.length > 0
    const mergedIds = isMergedReservation ? [selectedTable._id, ...(selectedTable.mergedWith || [])].map(String) : []
    const groupTables = isMergedReservation ? processedTablesData.filter(t => mergedIds.includes(String(t._id))) : []
    const totalMergedCapacity = groupTables.reduce((sum, t) => sum + (t.capacity || 0), 0)
    const res = selectedTable?.activeReservation

    return (
      <>
        <div className="px-6 py-3 border-b border-gray-100 flex-shrink-0">
          <p className="text-[12px] font-[500] text-[#98A2B3] font-manrope">Reservation Summary</p>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {/* Merged tables badge strip */}
          {isMergedReservation && (
            <div className="bg-[#F9F5FF] border border-[#E9D5FF] rounded-[12px] px-4 py-3">
              <p className="text-[11px] font-[600] text-[#6941C6] font-manrope mb-2 flex items-center gap-1.5">
                <Link size={13} className="rotate-45" /> Merged Reservation ({groupTables.length} tables)
              </p>
              <div className="flex items-center gap-2 flex-wrap">
                {groupTables.map(t => (
                  <span key={t._id} className="px-2.5 py-1 bg-white text-[#9E77ED] text-[12px] font-[600] rounded-lg font-manrope border border-[#E9D5FF]">{t.name}</span>
                ))}
                <span className="text-[12px] text-[#667085] ml-1 font-manrope">Total: {totalMergedCapacity} seats</span>
              </div>
            </div>
          )}

          {/* Late Arrival Banner */}
          {res && reservationSettings && (
            <LateArrivalBanner
              reservation={res}
              settings={reservationSettings}
              onDeducted={fetchDashboardData}
            />
          )}

          {/* Guest Info Card */}
          <div className="border border-gray-200 rounded-[12px] p-4">
            <div className="flex items-center gap-3 mb-4">
              <div className="relative">
                <InitialsAvatar name={res?.guestName || 'Guest'} size={56} />
                <div className="absolute bottom-0 right-0 w-3.5 h-3.5 bg-[#12B76A] rounded-full border-2 border-white" />
              </div>
              <div className="flex-1">
                <p className="text-[16px] font-[600] text-[#101828] font-manrope">{res?.guestName || 'Walk-in Guest'}</p>
                <p className="text-[12px] font-[400] text-[#667085] font-manrope">Status: {res?.status || 'Active'}</p>
                <span className="inline-block mt-1 px-2 py-0.5 border border-[#12B76A] text-[#12B76A] text-[10px] font-[500] rounded-full font-manrope">Guest</span>
              </div>
            </div>
            <div className="mb-3">
              <p className="text-[12px] font-[400] text-[#667085] font-manrope mb-0.5">Contact Number</p>
              <p className="text-[14px] font-[600] text-[#101828] font-manrope">{res?.contactNo || 'N/A'}</p>
            </div>
            <div className="mb-3">
              <p className="text-[12px] font-[400] text-[#667085] font-manrope mb-0.5">Guest Count</p>
              <p className="text-[14px] font-[600] text-[#101828] font-manrope">{res?.guestCount || 0} guests</p>
            </div>
            <div className="flex gap-8 mb-3">
              <div>
                <p className="text-[12px] font-[400] text-[#667085] font-manrope mb-0.5">Date</p>
                <p className="text-[14px] font-[600] text-[#101828] font-manrope">{res?.date ? new Date(res.date).toLocaleDateString() : 'Today'}</p>
              </div>
              <div>
                <p className="text-[12px] font-[400] text-[#667085] font-manrope mb-0.5">Time</p>
                <p className="text-[14px] font-[600] text-[#101828] font-manrope">{res?.time || 'N/A'}</p>
              </div>
            </div>
            {isMergedReservation && (
              <div className="mb-3">
                <p className="text-[12px] font-[400] text-[#667085] font-manrope mb-0.5">Tables</p>
                <p className="text-[14px] font-[600] text-[#101828] font-manrope">{groupTables.map(t => t.name).join(' + ')}</p>
              </div>
            )}
            <div>
              <p className="text-[12px] font-[400] text-[#667085] font-manrope mb-0.5">Notes</p>
              <p className="text-[14px] font-[400] text-[#101828] font-manrope">{res?.notes || 'No notes added'}</p>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="px-6 py-4 border-t border-gray-100 flex-shrink-0 space-y-3">
          <button
            onClick={async () => {
              if (!selectedTable?._id) return
              // Seat all tables in the group
              if (isMergedReservation) {
                try {
                  await Promise.all(mergedIds.map(id => api.put(`/tables/${id}`, { status: 'occupied' })))
                  toast.success('All merged tables seated')
                  fetchDashboardData()
                  setSelectedTable(null)
                } catch (e) { toast.error('Failed to seat guests') }
              } else {
                await changeTableStatus(selectedTable._id, 'occupied')
                setSelectedTable(null)
              }
            }}
            className="w-full py-3 bg-[#FE8301] text-white rounded-[10px] font-[600] text-[14px] font-manrope hover:bg-[#DC6803] transition-colors flex items-center justify-center gap-2"
          >
            Seat Guests
          </button>
          <div className="flex gap-3">
            <button className="flex-1 py-2.5 border border-[#FE8301] text-[#FE8301] rounded-[10px] font-[600] text-[14px] font-manrope hover:bg-[#FFF3E6] transition-colors flex items-center justify-center gap-2">
              <Edit2 size={14} /> Edit
            </button>
            <button onClick={() => setShowCancelReservationModal(true)} className="flex-1 py-2.5 border border-[#FE8301] text-[#FE8301] rounded-[10px] font-[600] text-[14px] font-manrope hover:bg-[#FFF3E6] transition-colors flex items-center justify-center gap-2">
              <X size={16} /> Cancel
            </button>
          </div>
        </div>
      </>
    )
  }

  const renderAlertDrawer = () => {
    // Severity tiers based on how long the customer has been waiting.
    // Yellow (<2 min) → orange (2–5 min) → red (>5 min). Matches the
    // screenshot at 15 min: full red border + pink tint + red label.
    const severityFor = (mins) => {
      if (mins >= 5) return {
        cardBg: 'bg-[#FEF3F2]', cardBorder: 'border-[#FDA29B]',
        label: 'text-[#B42318]', headerBg: 'bg-[#FEF3F2]',
        headerText: 'text-[#B42318]', icon: 'text-[#D92D20]',
        pillBg: 'bg-[#FEE4E2]', pillText: 'text-[#B42318]',
      }
      if (mins >= 2) return {
        cardBg: 'bg-[#FFFAEB]', cardBorder: 'border-[#FEC84B]',
        label: 'text-[#DC6803]', headerBg: 'bg-[#FFFAF0]',
        headerText: 'text-[#B54708]', icon: 'text-[#F79009]',
        pillBg: 'bg-[#FEF3C7]', pillText: 'text-[#B54708]',
      }
      return {
        cardBg: 'bg-[#FFFAEB]', cardBorder: 'border-[#FEDF89]',
        label: 'text-[#DC6803]', headerBg: 'bg-[#FFF7ED]',
        headerText: 'text-[#DC6803]', icon: 'text-[#F79009]',
        pillBg: 'bg-[#FEF3C7]', pillText: 'text-[#DC6803]',
      }
    }

    const formatDelay = (mins) => {
      if (mins < 1) return 'Just now'
      if (mins < 60) return `${mins} min delay`
      const h = Math.floor(mins / 60)
      const m = mins % 60
      return m === 0 ? `${h} hr delay` : `${h} hr ${m} min delay`
    }

    const alerts = (selectedTable.alerts || []).map(a => {
      const ts = a.timestamp ? new Date(a.timestamp) : new Date()
      const mins = Math.max(0, Math.floor((Date.now() - ts.getTime()) / 60000))
      return { ...a, mins, delayText: formatDelay(mins), sev: severityFor(mins) }
    })

    // Drawer-level theme follows the most-urgent active alert so the
    // header colour matches the worst card inside.
    const peak = alerts.reduce((acc, a) => a.mins > acc.mins ? a : acc, alerts[0] || { mins: 0, sev: severityFor(0) })
    const headerSev = peak.sev

    return (
      <>
        <div className={`px-6 py-4 border-b border-gray-100 flex-shrink-0 ${headerSev.headerBg}`}>
          <div className="flex items-center gap-2">
            <AlertTriangle size={18} className={headerSev.icon} />
            <p className={`text-[16px] font-[600] font-manrope ${headerSev.headerText}`}>Attention Required</p>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          <div className="px-6 py-4">
            <p className="text-[12px] font-[500] text-[#98A2B3] font-manrope mb-3">Active Alerts</p>
            <div className="space-y-3">
              {alerts.length === 0 ? (
                <div className="bg-[#F9FAFB] border border-[#EAECF0] rounded-[12px] p-4 text-[13px] text-[#667085] font-manrope">
                  No active alerts on this table.
                </div>
              ) : alerts.map((alert, index) => (
                <div key={alert.requestId || index} className={`${alert.sev.cardBg} border ${alert.sev.cardBorder} rounded-[12px] p-4`}>
                  <p className={`text-[11px] font-[500] font-manrope mb-1 ${alert.sev.label}`}>Alert Reason</p>
                  <p className="text-[15px] font-[700] text-[#101828] font-manrope leading-tight">{alert.reason}</p>
                  <p className={`text-[12px] font-[500] font-manrope mt-1 ${alert.sev.label}`}>{alert.delayText}</p>
                </div>
              ))}
            </div>
          </div>
          <div className="px-6 py-4 border-t border-gray-100">
            <p className="text-[12px] font-[500] text-[#98A2B3] font-manrope mb-3">Table Info</p>
            <div className="bg-[#F9FAFB] rounded-[10px] px-4 py-3 flex items-center justify-between">
              <span className="text-[14px] font-[500] text-[#344054] font-manrope">Seating Capacity</span>
              <span className="text-[14px] font-[600] text-[#101828] font-manrope">{selectedTable.capacity} Guests</span>
            </div>
            <div className="mt-2 bg-[#F9FAFB] rounded-[10px] px-4 py-3 flex items-center justify-between">
              <span className="text-[14px] font-[500] text-[#344054] font-manrope">Diners seated</span>
              <SeatedCount {...seatInfo(selectedTable, processedTablesData)} size={14} className="text-[14px] font-[600] text-[#101828] font-manrope" />
            </div>
          </div>
        </div>
      <div className="px-6 py-4 border-t border-gray-100 flex-shrink-0">
        {selectedTable.assignedWaiter ? (
          <div className="bg-[#FFF9F5] rounded-[10px] p-3 border border-[#FFE4CC] flex items-center justify-between">
            <div>
              <p className="text-[12px] font-[500] text-[#98A2B3] font-manrope">Assigned Waiter</p>
              <p className="text-[14px] font-[600] text-[#101828] font-manrope">{staffData.find(s => s._id === (selectedTable.assignedWaiter?._id || selectedTable.assignedWaiter))?.name || 'Assigned'}</p>
            </div>
            <button
              onClick={async () => {
                // Reset assignment so the dropdown shows again
                try {
                  await api.put(`/tables/${selectedTable._id}/assign`, { waiterId: null })
                  toast.success('Waiter unassigned')
                  fetchDashboardData()
                  setSelectedTable(null)
                } catch (e) { toast.error('Failed to update waiter') }
              }}
              className="text-[12px] font-[600] text-[#FE8301] font-manrope hover:underline"
            >
              Change
            </button>
          </div>
        ) : (
          <select
            className="w-full py-2.5 px-3 border border-[#D0D5DD] rounded-[10px] text-[14px] font-manrope focus:outline-none focus:border-[#FE8301]"
            defaultValue=""
            onChange={async (e) => {
              const waiterId = e.target.value
              if (!waiterId) return
              try {
                await api.put(`/tables/${selectedTable._id}/assign`, { waiterId })
                toast.success('Waiter assigned successfully!')
                fetchDashboardData()
                setSelectedTable(null)
              } catch (error) {
                toast.error('Failed to assign waiter')
              }
            }}
          >
            <option value="">Select Waiter to Assign</option>
            {staffData.filter(s => ['waiter', 'captain'].includes(s.role) && s.status === 'active').map(s => (
              <option key={s._id} value={s._id}>{s.name} ({s.staffId})</option>
            ))}
          </select>
        )}
      </div>
    </>
    )
  }

  const renderDisabledDrawer = () => (
    <div className="flex-1 flex flex-col items-center justify-center px-6">
      <div className="w-20 h-20 rounded-full bg-[#F2F4F7] flex items-center justify-center mb-6">
        <svg width="40" height="40" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle cx="20" cy="20" r="14" stroke="#98A2B3" strokeWidth="2" />
          <path d="M12 28L28 12" stroke="#98A2B3" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </div>
      <h3 className="text-[20px] font-[600] text-[#344054] font-manrope mb-3 text-center">This table is currently disabled</h3>
      <p className="text-[14px] font-[400] text-[#667085] font-manrope text-center max-w-[280px] leading-[22px]">
        Disabled tables cannot be seated or reserved. Enable this unit in Management to restore access.
      </p>
    </div>
  )

  const renderFreeDrawer = () => (
    <>
      <div className="px-6 py-4">
        <p className="text-[12px] font-[500] text-[#98A2B3] font-manrope mb-3">Table Info</p>
        <div className="bg-[#F9FAFB] rounded-[10px] px-4 py-3 flex items-center justify-between">
          <span className="text-[14px] font-[500] text-[#344054] font-manrope">Seating Capacity</span>
          <span className="text-[14px] font-[600] text-[#101828] font-manrope">{selectedTable.capacity} Guests</span>
        </div>
        <div className="mt-2 bg-[#F9FAFB] rounded-[10px] px-4 py-3 flex items-center justify-between">
          <span className="text-[14px] font-[500] text-[#344054] font-manrope">Diners seated</span>
          <SeatedCount {...seatInfo(selectedTable, processedTablesData)} size={14} className="text-[14px] font-[600] text-[#101828] font-manrope" />
        </div>
      </div>
      <div className="flex-1 flex flex-col items-center justify-center px-6">
        <div className="w-16 h-16 rounded-full border-2 border-[#12B76A] flex items-center justify-center mb-4">
          <CheckCircle size={32} className="text-[#12B76A]" />
        </div>
        <h3 className="text-[20px] font-[600] text-[#101828] font-manrope mb-1">Table Available</h3>
        <p className="text-[14px] font-[400] text-[#667085] font-manrope">Ready for seating</p>
      </div>
    </>
  )

  const renderDrawerContent = () => {
    if (!selectedTable) return null
    // Admin-driven flows (edit bill, payment, payment success) take
    // precedence over background status flips. Otherwise a customer
    // pressing "Call Waiter" mid-checkout would yank the admin out
    // of the payment view.
    if (isPaymentSuccess) return renderPaymentSuccess()
    if (isPaymentView) return renderPaymentMethodSelection()
    if (isEditingBill) return renderEditBill()

    const st = selectedTable.status
    const isMergedGroup = selectedTable.mergedWith?.length > 0

    if (st === 'alert') return renderAlertDrawer()
    if (st === 'reserved') return renderReservedDrawer()
    if (st === 'disabled') return renderDisabledDrawer()
    if (st === 'occupied' || st === 'merged') {
      return isMergedGroup ? renderMergedDrawer() : renderOccupiedDrawer()
    }
    return renderFreeDrawer()
  }

  // ═══════════════════════════════════════════════════════════════════════
  // MAIN RENDER
  // ═══════════════════════════════════════════════════════════════════════
  return (
    <div className="h-full flex flex-col">
      {/* Tabs */}
      <div className="mb-4">
        <div className="flex items-center gap-1 bg-white p-1 rounded-[12px] border border-gray-200 w-fit shadow-sm">
          {[{ key: 'live-feed', label: 'Live Feed' }, { key: 'management', label: 'Tables & QR Management' }].map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-6 py-2 rounded-[12px] transition-all text-[14px] leading-[20px] tracking-normal font-manrope font-[600] ${activeTab === tab.key ? 'bg-[#FE8301] text-white shadow-sm' : 'text-[#645E66] hover:bg-gray-50'}`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {activeTab === 'live-feed' ? renderLiveFeed() : renderManagement()}

      {/* ── Modals ──────────────────────────────────────────────────────── */}
      {showAddReservationModal && (
        <AddReservationModal onClose={() => setShowAddReservationModal(false)} onSubmit={() => { setShowAddReservationModal(false); fetchDashboardData() }} />
      )}
      {showAddAreaModal && (
        <AddAreaModal onClose={() => { setShowAddAreaModal(false); fetchDashboardData() }} onSubmit={() => { setShowAddAreaModal(false); fetchDashboardData() }} />
      )}
      {showAddTableModal && (
        <AddTableModal tableToEdit={tableToEdit} onClose={() => { setShowAddTableModal(false); setTableToEdit(null) }} onSubmit={() => { setShowAddTableModal(false); setTableToEdit(null); fetchDashboardData() }} />
      )}
      {showBulkAddTablesModal && (
        <BulkAddTablesModal
          onClose={() => setShowBulkAddTablesModal(false)}
          onSuccess={fetchDashboardData}
        />
      )}
      {showQRModal && (
        <QRManagementModal onClose={() => { setShowQRModal(false); setSelectedQRTable(null) }} table={selectedQRTable} allTables={tablesList} onTableUpdate={fetchDashboardData} />
      )}


      {/* ── Table Details Drawer ────────────────────────────────────────── */}
      {selectedTable && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/20" onClick={closeDrawer} />
          <div className="relative w-full max-w-[472px] bg-white h-full shadow-xl flex flex-col animate-in slide-in-from-right duration-200 overflow-hidden">
            {/* Drawer Header */}
            <div className={`px-6 py-5 border-b border-gray-100 flex-shrink-0 ${drawerHeaderBg(selectedTable.status)}`}>
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  {selectedTable.mergedWith?.length > 0 ? (() => {
                    const mergedIds = [selectedTable._id, ...(selectedTable.mergedWith || [])].map(String)
                    const groupTables = processedTablesData.filter(t => mergedIds.includes(String(t._id)))
                    const mergedLabel = groupTables.length > 0 ? groupTables.map(t => t.name).join(' + ') : selectedTable.name
                    return <>
                      <div className="flex items-center gap-3 mb-1">
                        <h2 className={`text-[28px] font-[700] font-manrope ${selectedTable.status === 'reserved' ? 'text-[#007AFF]' : 'text-[#9E77ED]'}`}>
                          {mergedLabel}
                        </h2>
                      </div>
                      <p className={`text-[14px] font-[500] font-manrope capitalize ${selectedTable.status === 'reserved' ? 'text-[#007AFF]' : 'text-[#9E77ED]'}`}>{selectedTable.status}</p>
                    </>})() : (
                    <>
                      <h2 className={`text-[28px] font-[700] font-manrope ${drawerTitleColor(selectedTable.status)}`}>{selectedTable.name}</h2>
                      <p className={`text-[14px] font-[500] font-manrope capitalize ${drawerTitleColor(selectedTable.status)}`}>{selectedTable.status}</p>
                    </>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {selectedTable.mergedWith?.length > 0 && (() => {
                    // Block unmerge while the group has a live order —
                    // the order lives on the leader's tableId and would
                    // be orphaned if siblings flipped to 'free'. The
                    // backend rejects this too; we just surface it
                    // before the click so admins know why.
                    const groupHasActiveOrder = (() => {
                      const mergedIds = [selectedTable._id, ...(selectedTable.mergedWith || [])].map(String)
                      return processedTablesData.some(t => mergedIds.includes(String(t._id)) && t.activeOrder)
                    })()
                    return (
                      <button
                        onClick={() => { if (!groupHasActiveOrder) setShowUnmergeModal(true) }}
                        disabled={groupHasActiveOrder}
                        title={groupHasActiveOrder ? 'Settle or void the active order before unmerging' : 'Unmerge this table group'}
                        className={`px-3 py-1.5 rounded-[8px] text-[12px] font-[500] font-manrope transition-colors ${groupHasActiveOrder ? 'bg-[#DFDCE0] text-[#B6AEB8] cursor-not-allowed' : 'bg-[#702083] text-white hover:bg-[#5A1A6A]'}`}
                      >
                        Unmerge Table
                      </button>
                    )
                  })()}
                  <button onClick={closeDrawer} className="p-1 text-gray-400 hover:text-gray-600 transition-colors">
                    <X size={20} />
                  </button>
                </div>
              </div>
            </div>

            {/* Counter-payment alert — fires when the customer tapped
                "Pay at Counter" on the bill preview. One-tap settle:
                marks the order Paid · cash, frees the table (via the
                existing PATCH /:id/payment side-effects), and the
                customer's waiting screen flips to success the same
                second via the order:updated socket. */}
            {activeOrderMeta?.counterPaymentRequestedAt && activeOrderMeta?.paymentStatus !== 'Paid' && (
              <div className="px-6 pt-4">
                <div className="bg-[#FFF5F5] border border-[#FCC4C4] rounded-2xl p-4">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-full bg-[#EF4F5F] flex items-center justify-center shrink-0">
                      <AlertTriangle size={18} className="text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[14px] font-manrope font-[700] text-[#B42318] leading-tight">
                        Counter-payment requested
                      </p>
                      <p className="text-[12px] font-manrope text-[#7A1F1F] mt-0.5">
                        Customer wants to settle ₹{counterSettleTotal.toFixed(2)} in cash.
                        Send a waiter with the bill slip, collect cash, then mark paid below.
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={async () => {
                      // Independent-orders model — there can be
                      // multiple unpaid orders on the same table.
                      // Settle each one through the staff /status
                      // endpoint with its own captured amount; the
                      // bill total is the sum of every order. The
                      // customer-facing /payment endpoint rejects
                      // cash by design (anti-fraud), so admins MUST
                      // use /status. Run sequentially so a partial
                      // failure halts at the right place rather than
                      // leaving half-paid orders in flight.
                      const ids = activeOrderMeta?.allOrderIds?.length
                        ? activeOrderMeta.allOrderIds
                        : (activeOrderMeta?._id ? [activeOrderMeta._id] : [])
                      if (ids.length === 0) return
                      try {
                        for (const oid of ids) {
                          // Each order's own total — looked up from
                          // the allOrders metadata we cached on
                          // fetch. Falls back to the aggregated
                          // savedTotal divided evenly only as a
                          // safety net, which won't actually be hit
                          // in practice.
                          // Settle with the order's STORED due
                          // (total − manualDiscount − amountPaid).
                          const full = activeOrderMeta?.orders?.find(o => String(o._id) === String(oid))
                          const meta = activeOrderMeta?.allOrders?.find(o => String(o._id) === String(oid))
                          const amt = full ? orderAmountDue(full, taxConfig) : (Number(meta?.total) || 0)
                          await api.patch(`/orders/${oid}/status`, {
                            paymentStatus: 'Paid',
                            paymentMethod: 'cash',
                            amountPaid: amt,
                          })
                        }
                        setDrawerRefreshKey(k => k + 1)
                      } catch (err) {
                        console.error('Mark paid failed:', err)
                        alert(err?.response?.data?.message || 'Failed to mark as paid')
                      }
                    }}
                    className="mt-3 w-full h-[40px] rounded-xl bg-[#EF4F5F] hover:bg-[#D9354F] active:scale-[0.98] transition-all text-white font-manrope font-[600] text-[13px] flex items-center justify-center gap-2"
                  >
                    <CheckCircle size={16} />
                    {(activeOrderMeta?.orderCount || 1) > 1
                      ? `Mark ${activeOrderMeta.orderCount} orders Paid · Cash · ₹${counterSettleTotal.toFixed(2)}`
                      : `Mark Paid · Cash · ₹${counterSettleTotal.toFixed(2)}`}
                  </button>
                </div>
              </div>
            )}

            {renderDrawerContent()}
          </div>
        </div>
      )}

      {/* ── Unmerge Modal ───────────────────────────────────────────────── */}
      {showUnmergeModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/20" onClick={() => setShowUnmergeModal(false)} />
          <div className="relative bg-white rounded-[16px] shadow-xl w-[320px] p-6 animate-in zoom-in-95 duration-200">
            <button onClick={() => setShowUnmergeModal(false)} className="absolute top-4 right-4 p-1 text-gray-400 hover:text-gray-600 transition-colors"><X size={16} /></button>
            <div className="flex justify-center mb-4">
              <svg width="48" height="48" viewBox="0 0 48 48" fill="none"><circle cx="18" cy="24" r="10" stroke="#9E77ED" strokeWidth="2" fill="none" /><circle cx="30" cy="24" r="10" stroke="#FE8301" strokeWidth="2" fill="none" /></svg>
            </div>
            <h3 className="text-[18px] font-[600] text-[#101828] font-manrope text-center mb-2">Unmerge Tables?</h3>
            <p className="text-[14px] font-[400] text-[#667085] font-manrope text-center mb-6">This will split the merged tables. Orders will be restored to their respective tables.</p>
            <div className="flex gap-3">
              <button onClick={() => setShowUnmergeModal(false)} className="flex-1 py-2.5 border border-[#D0D5DD] text-[#344054] rounded-[10px] font-[600] text-[14px] font-manrope hover:bg-gray-50 transition-colors">Cancel</button>
              <button
                onClick={async () => {
                  try {
                    await api.post('/tables/unmerge', { tableId: selectedTable._id })
                    toast.success('Tables unmerged successfully!')
                    fetchDashboardData()
                    setShowUnmergeModal(false)
                    setSelectedTable(null)
                  } catch (error) {
                    toast.error(error.response?.data?.message || 'Failed to unmerge tables')
                  }
                }}
                className="flex-1 py-2.5 bg-[#FF9B0B] text-white rounded-[10px] font-[600] text-[14px] font-manrope hover:opacity-90 transition-opacity"
              >Confirm Unmerge</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Cancel Reservation Modal ────────────────────────────────────── */}
      {showCancelReservationModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/20" onClick={() => setShowCancelReservationModal(false)} />
          <div className="relative bg-white rounded-[16px] shadow-xl w-[320px] p-6 animate-in zoom-in-95 duration-200">
            <button onClick={() => setShowCancelReservationModal(false)} className="absolute top-4 right-4 p-1 text-gray-400 hover:text-gray-600 transition-colors"><X size={16} /></button>
            <h3 className="text-[18px] font-[600] text-[#101828] font-manrope text-center mb-2">Cancel Reservation?</h3>
            <p className="text-[14px] font-[400] text-[#667085] font-manrope text-center mb-4">Are you sure you want to cancel this reservation? This action cannot be undone.</p>
            <div className="flex gap-3 mt-4">
              <button onClick={() => setShowCancelReservationModal(false)} className="flex-1 py-2.5 border border-[#D0D5DD] text-[#344054] rounded-[10px] font-[600] text-[14px] font-manrope hover:bg-gray-50 transition-colors">No</button>
              <button
                onClick={async () => {
                  try {
                    const resId = selectedTable.activeReservation?._id
                    if (!resId) return
                    await api.put(`/reservations/${resId}/cancel`)
                    // If tables were merged for this reservation, unmerge them too
                    if (selectedTable.mergedWith?.length > 0) {
                      try {
                        await api.post('/tables/unmerge', { tableId: selectedTable._id })
                      } catch (e) { /* unmerge is best-effort */ }
                    }
                    toast.success('Reservation cancelled')
                    fetchDashboardData()
                    setShowCancelReservationModal(false)
                    setSelectedTable(null)
                  } catch (error) {
                    toast.error(error.response?.data?.message || 'Failed to cancel reservation')
                  }
                }}
                className="flex-1 py-2.5 bg-[#FF9B0B] text-white rounded-[10px] font-[600] text-[14px] font-manrope hover:opacity-90 transition-opacity"
              >Yes</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete Table Modal ──────────────────────────────────────────── */}
      {tableToDelete && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-[16px] w-full max-w-[400px] p-6 shadow-2xl animate-in zoom-in-95 duration-200 font-manrope">
            <div className="flex items-center gap-4 mb-4">
              <div className="w-10 h-10 rounded-full bg-[#FFF3E6] flex items-center justify-center flex-shrink-0">
                <Trash2 size={24} className="text-[#FF9B0B]" />
              </div>
              <h3 className="text-[18px] font-[700] text-[#1D2939]">Delete Table</h3>
            </div>
            <p className="text-[#475467] text-[14px] leading-relaxed mb-6">Are you sure you want to delete table "{tableToDelete.name}"? This action cannot be undone.</p>
            <div className="flex gap-3">
              <button onClick={() => setTableToDelete(null)} className="flex-1 py-2.5 border border-[#D0D5DD] text-[#344054] rounded-[10px] font-[600] text-[14px] hover:bg-gray-50 transition-colors">Cancel</button>
              <button
                onClick={async () => {
                  try {
                    await api.delete(`/tables/${tableToDelete._id}`)
                    toast.success('Table deleted successfully!')
                    fetchDashboardData()
                    setTableToDelete(null)
                  } catch (error) {
                    setTableToDelete(null)
                    toast.error(error.response?.data?.message || 'Failed to delete table')
                  }
                }}
                className="flex-1 py-2.5 bg-[#FF9B0B] text-white rounded-[10px] font-[600] text-[14px] hover:opacity-90 transition-opacity"
              >Delete</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Add Item Picker (Edit Bill) ─────────────────────────────────── */}
      {isAddItemOpen && (
        <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-black/40" onClick={() => setIsAddItemOpen(false)}>
          <div className="bg-white w-full sm:max-w-lg sm:rounded-[20px] rounded-t-[20px] max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <div>
                <h3 className="text-[16px] font-[700] text-[#101828] font-manrope">Add Item to Order</h3>
                {activeOrderMeta?.orderId && (
                  <p className="text-[12px] font-[400] text-[#667085] font-manrope">#{activeOrderMeta.orderId}</p>
                )}
              </div>
              <button onClick={() => setIsAddItemOpen(false)} className="p-1 text-[#667085] hover:text-[#101828]"><X size={18} /></button>
            </div>
            <div className="px-5 py-3 border-b border-gray-100">
              <input
                type="text"
                value={menuSearchPicker}
                onChange={(e) => setMenuSearchPicker(e.target.value)}
                placeholder="Search menu items…"
                className="w-full px-3 py-2 border border-[#D0D5DD] rounded-[10px] text-[14px] font-manrope outline-none focus:border-[#FE8301]"
              />
            </div>
            <div className="flex-1 overflow-y-auto px-2 py-2">
              {menuLoadingPicker ? (
                <div className="px-4 py-8 text-center text-[14px] text-[#667085]">Loading menu…</div>
              ) : (
                (() => {
                  const q = menuSearchPicker.trim().toLowerCase()
                  const filtered = q
                    ? menuForPicker.filter(m => (m.name || '').toLowerCase().includes(q))
                    : menuForPicker
                  if (filtered.length === 0) {
                    return <div className="px-4 py-8 text-center text-[14px] text-[#667085]">No items match.</div>
                  }
                  return filtered.map(m => {
                    const price = m.finalPrice || m.basePrice || m.price || 0
                    return (
                      <button
                        key={m._id}
                        onClick={() => appendMenuItemToOrder(m)}
                        disabled={appendingItems}
                        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-[10px] hover:bg-[#FFF9F5] active:scale-[0.99] transition-all text-left disabled:opacity-50"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-[14px] font-[600] text-[#101828] font-manrope truncate">{m.name}</p>
                          {m.category?.name && (
                            <p className="text-[11px] font-[400] text-[#667085] font-manrope">{m.category.name}</p>
                          )}
                        </div>
                        <p className="text-[14px] font-[600] text-[#FE8301] font-manrope shrink-0">₹{price}</p>
                        <Plus size={16} className="text-[#FE8301] shrink-0" />
                      </button>
                    )
                  })
                })()
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default TablesDashboard
