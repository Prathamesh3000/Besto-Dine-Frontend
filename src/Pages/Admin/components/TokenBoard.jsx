import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { Ticket, Loader2, Eye, CheckCircle, RefreshCw, AlertTriangle } from 'lucide-react'
import api from '../../../utils/api'
import useSocketEvent from '../../../hooks/useSocketEvent'
import toast from 'react-hot-toast'
import OrderDetailsModal from './OrderDetailsModal'

/**
 * TokenBoard — the Tables dashboard's replacement when the branch runs
 * without tables (operations `tables.useTables:false`, §12.2 of
 * OPERATIONS_CONTROL_PANEL_DESIGN.md).
 *
 * Every open dine-in order placed in token mode carries `tokenNumber`
 * ("T-042") instead of a table. This board lists them from the same
 * live feed the Tables drawer reads (GET /orders/live) and offers the
 * cashier actions the Orders screen already has:
 *
 *   Mark paid (cash)  PATCH /orders/:id/status { paymentStatus:'Paid',
 *                     paymentMethod:'cash', amountPaid }  — releases a
 *                     held (awaiting-payment) order to the kitchen, or
 *                     settles a pay-after order at the counter.
 *   Complete          PATCH /orders/:id/status { status:'served' }
 *                     (admin) or PATCH /orders/:id/pickup (waiter app,
 *                     `serveVia="pickup"` — same route the Takeaway
 *                     sheet uses, so the tip attribution stays intact).
 *   View              OrderDetailsModal (admin) — off in the waiter app.
 *
 * Props
 *   canMarkPaid   show the cash button (default true)
 *   canComplete   show the Complete button (default true)
 *   serveVia      'status' | 'pickup' (default 'status')
 *   showDetails   render the View button + OrderDetailsModal (default true)
 *   onCountChange optional (count) => void, fires when the open-token
 *                 count changes so a parent can show it in a header.
 */

// eslint-disable-next-line react-refresh/only-export-components
export const TOKEN_OPEN_STATUSES = ['awaiting-payment', 'new', 'preparing', 'ready']

/** True for a live-feed row this board owns: a table-less dine-in order
 *  with a token that is still open. */
// eslint-disable-next-line react-refresh/only-export-components
export function isOpenTokenOrder(o) {
  if (!o || !o.tokenNumber) return false
  if (o.type === 'takeaway') return false
  return TOKEN_OPEN_STATUSES.includes(o.status)
}

/** 'held' (pay-first, waiting for cash) | 'paid' | 'unpaid'. */
// eslint-disable-next-line react-refresh/only-export-components
export function tokenPaymentState(o) {
  if (o?.status === 'awaiting-payment') return 'held'
  if (String(o?.paymentStatus || '').toLowerCase() === 'paid') return 'paid'
  return 'unpaid'
}

const PAYMENT_PILL = {
  held:   { label: 'Held — awaiting payment', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  unpaid: { label: 'Unpaid',                  cls: 'bg-red-50 text-red-600 border-red-200' },
  paid:   { label: 'Paid',                    cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
}

const KITCHEN_PILL = {
  'awaiting-payment': { label: 'Not sent to kitchen', cls: 'bg-gray-100 text-gray-600 border-gray-200' },
  new:       { label: 'New',       cls: 'bg-blue-50 text-blue-700 border-blue-200' },
  preparing: { label: 'Preparing', cls: 'bg-orange-50 text-orange-700 border-orange-200' },
  ready:     { label: 'Ready',     cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
}

/** "3m" / "1h 05m" since createdAt. */
// eslint-disable-next-line react-refresh/only-export-components
export function tokenAge(createdAt, nowMs = Date.now()) {
  if (!createdAt) return '—'
  const diff = nowMs - new Date(createdAt).getTime()
  if (!Number.isFinite(diff) || diff < 0) return 'just now'
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m`
  const h = Math.floor(mins / 60)
  return `${h}h ${String(mins % 60).padStart(2, '0')}m`
}

const sortByAge = (a, b) => new Date(a.createdAt) - new Date(b.createdAt)

const TokenBoard = ({
  canMarkPaid = true,
  canComplete = true,
  serveVia = 'status',
  showDetails = true,
  onCountChange,
}) => {
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [busyId, setBusyId] = useState(null)
  const [viewing, setViewing] = useState(null)
  const [nowMs, setNowMs] = useState(() => Date.now())
  const mounted = useRef(true)

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    try {
      const { data } = await api.get('/orders/live')
      if (!mounted.current) return
      const list = (data?.orders || []).filter(isOpenTokenOrder).sort(sortByAge)
      setOrders(list)
      setError(null)
    } catch (err) {
      if (!mounted.current) return
      if (!silent) setError(err?.response?.data?.message || 'Failed to load token orders')
    } finally {
      if (mounted.current && !silent) setLoading(false)
    }
  }, [])

  useEffect(() => {
    mounted.current = true
    load()
    const poll = setInterval(() => load(true), 30_000)
    const tick = setInterval(() => setNowMs(Date.now()), 30_000)
    return () => { mounted.current = false; clearInterval(poll); clearInterval(tick) }
  }, [load])

  // Same events the Orders dashboard refreshes on.
  const refetchSilent = useCallback(() => { load(true) }, [load])
  useSocketEvent('order:new', refetchSilent)
  useSocketEvent('order:appended', refetchSilent)
  useSocketEvent('order:updated', refetchSilent)
  useSocketEvent('order:ready', refetchSilent)
  useSocketEvent('order:cancelled', refetchSilent)
  useSocketEvent('counter-payment:requested', refetchSilent)

  useEffect(() => { if (onCountChange) onCountChange(orders.length) }, [orders.length, onCountChange])

  const markPaid = async (o) => {
    if (busyId) return
    const id = o._id || o.id
    setBusyId(id)
    try {
      await api.patch(`/orders/${id}/status`, {
        paymentStatus: 'Paid',
        paymentMethod: 'cash',
        amountPaid: Math.max(0, Math.round(((Number(o.total) || 0) - (Number(o.manualDiscount) || 0)) * 100) / 100),
      })
      toast.success(`Token ${o.tokenNumber} paid${o.status === 'awaiting-payment' ? ' — sent to the kitchen' : ''}`)
      await load(true)
    } catch (err) {
      toast.error('Failed to mark paid: ' + (err.response?.data?.message || err.message))
    } finally {
      setBusyId(null)
    }
  }

  const complete = async (o) => {
    if (busyId) return
    if (o.status !== 'ready' && !window.confirm(`Token ${o.tokenNumber} is still ${o.status}. Mark it served anyway?`)) return
    const id = o._id || o.id
    setBusyId(id)
    try {
      if (serveVia === 'pickup') await api.patch(`/orders/${id}/pickup`)
      else await api.patch(`/orders/${id}/status`, { status: 'served' })
      toast.success(`Token ${o.tokenNumber} served`)
      setOrders(prev => prev.filter(x => (x._id || x.id) !== id))
      await load(true)
    } catch (err) {
      toast.error('Failed to complete: ' + (err.response?.data?.message || err.message))
    } finally {
      setBusyId(null)
    }
  }

  const counts = useMemo(() => ({
    held: orders.filter(o => tokenPaymentState(o) === 'held').length,
    ready: orders.filter(o => o.status === 'ready').length,
  }), [orders])

  if (loading && orders.length === 0) {
    return (
      <div className="flex items-center justify-center py-16 text-[#645E66] font-manrope text-[14px] gap-2" data-testid="token-board-loading">
        <Loader2 size={18} className="animate-spin" /> Loading token orders…
      </div>
    )
  }

  if (error && orders.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-16">
        <AlertTriangle size={32} className="text-[#EF4444]" />
        <p className="text-[14px] font-[600] text-[#1A181B] font-manrope">{error}</p>
        <button type="button" onClick={() => load()} className="px-4 py-2 rounded-lg bg-[#FE8301] text-white text-[14px] font-[600] font-manrope">Retry</button>
      </div>
    )
  }

  return (
    <div data-testid="token-board" className="font-manrope">
      {/* Summary strip */}
      <div className="flex flex-wrap items-center gap-2 mb-4 text-[13px] font-[600]">
        <span className="px-3 py-1 rounded-full bg-white border border-gray-200 text-[#1A181B]">{orders.length} open token{orders.length === 1 ? '' : 's'}</span>
        {counts.held > 0 && <span className="px-3 py-1 rounded-full bg-amber-50 border border-amber-200 text-amber-700">{counts.held} awaiting payment</span>}
        {counts.ready > 0 && <span className="px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700">{counts.ready} ready to hand over</span>}
        <button type="button" onClick={() => load(true)} aria-label="Refresh token orders" className="ml-auto w-9 h-9 rounded-lg flex items-center justify-center text-gray-400 hover:text-[#FE8301] hover:bg-orange-50 transition-colors">
          <RefreshCw size={16} />
        </button>
      </div>

      {orders.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
          <div className="w-12 h-12 rounded-full bg-[#FFF3E6] flex items-center justify-center text-[#FE8301]"><Ticket size={22} /></div>
          <p className="text-[15px] font-[700] text-[#1A181B]">No open token orders</p>
          <p className="text-[13px] text-[#645E66]">Counter orders appear here with their token the moment they are placed.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {orders.map((o) => {
            const id = o._id || o.id
            const pay = tokenPaymentState(o)
            const payPill = PAYMENT_PILL[pay]
            const kitchenPill = KITCHEN_PILL[o.status] || KITCHEN_PILL.new
            const itemCount = (o.items || []).reduce((n, it) => n + (Number(it.quantity) || 1), 0)
            const busy = busyId === id
            return (
              <article
                key={id}
                data-testid="token-card"
                className={`bg-white rounded-2xl border p-4 flex flex-col gap-3 shadow-[0px_2px_8px_0px_#00000014] ${pay === 'held' ? 'border-amber-200' : o.status === 'ready' ? 'border-emerald-200' : 'border-gray-200'}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-[11px] uppercase tracking-wider font-[700] text-[#98A2B3]">Token</p>
                    <h3 className="text-[28px] leading-[32px] font-[800] text-[#1A181B] tabular-nums">{o.tokenNumber}</h3>
                    <p className="text-[12px] text-[#645E66] font-[600] truncate">{o.id || o.orderId}{o.user ? ` · ${o.user}` : ''}</p>
                  </div>
                  <span className="text-[12px] font-[700] text-[#645E66] tabular-nums shrink-0" title={o.createdAt ? new Date(o.createdAt).toLocaleTimeString() : ''}>
                    {tokenAge(o.createdAt, nowMs)}
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-[700] border ${payPill.cls}`}>{payPill.label}</span>
                  <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-[700] border ${kitchenPill.cls}`}>{kitchenPill.label}</span>
                </div>

                <div className="flex items-center justify-between text-[14px]">
                  <span className="text-[#645E66] font-[600]">{itemCount} item{itemCount === 1 ? '' : 's'}</span>
                  <span className="text-[#1A181B] font-[800]">₹{Number(o.total || 0).toFixed(2)}</span>
                </div>

                <div className="flex items-center gap-2 pt-1 border-t border-gray-100">
                  {canMarkPaid && pay !== 'paid' && (
                    <button
                      type="button"
                      onClick={() => markPaid(o)}
                      disabled={!!busyId}
                      className="flex-1 px-3 py-2 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-[12px] font-[700] transition-colors disabled:opacity-60"
                    >
                      {busy ? <Loader2 size={14} className="animate-spin inline" /> : 'Mark paid (cash)'}
                    </button>
                  )}
                  {canComplete && pay !== 'held' && (
                    <button
                      type="button"
                      onClick={() => complete(o)}
                      disabled={!!busyId}
                      className={`flex-1 px-3 py-2 rounded-lg text-[12px] font-[700] transition-colors disabled:opacity-60 flex items-center justify-center gap-1 ${o.status === 'ready' ? 'bg-emerald-500 hover:bg-emerald-600 text-white' : 'border border-gray-200 text-[#344054] hover:bg-gray-50'}`}
                    >
                      <CheckCircle size={14} /> Complete
                    </button>
                  )}
                  {showDetails && (
                    <button
                      type="button"
                      onClick={() => setViewing(o)}
                      aria-label={`View token ${o.tokenNumber}`}
                      title="View order"
                      className="w-9 h-9 rounded-lg flex items-center justify-center text-gray-400 hover:text-[#FE8301] hover:bg-orange-50 transition-colors shrink-0"
                    >
                      <Eye size={18} />
                    </button>
                  )}
                </div>
              </article>
            )
          })}
        </div>
      )}

      {showDetails && viewing && (
        <OrderDetailsModal order={viewing} onClose={() => setViewing(null)} onRefresh={() => load(true)} />
      )}
    </div>
  )
}

export default TokenBoard
