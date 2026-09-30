import React, { useState, useMemo, useEffect } from 'react'
import { X, Download, TrendingUp, Sparkles, Lightbulb, AlertTriangle, Info } from 'lucide-react'
import LineChart from './charts/LineChart'
import { computeYTicks } from './charts/chartUtils'
import { useReports, useForecast } from '../../../hooks/queries/adminQueries'

// ── Date helpers (local calendar, no UTC drift). Ranges are sent as plain
// YYYY-MM-DD strings; the backend re-anchors them to the report timezone.
const ymd = (d) => {
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${y}-${m}-${day}`
}

const buildReportPresets = () => {
    const today = new Date()
    const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate())
    const mk = (fromDate, toDate = startOfToday) => ({ from: ymd(fromDate), to: ymd(toDate) })

    const yesterday = new Date(startOfToday); yesterday.setDate(yesterday.getDate() - 1)
    const weekStart = new Date(startOfToday); weekStart.setDate(weekStart.getDate() - 6)
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1)
    const lastMonthStart = new Date(today.getFullYear(), today.getMonth() - 1, 1)
    const lastMonthEnd = new Date(today.getFullYear(), today.getMonth(), 0)
    const yearStart = new Date(today.getFullYear(), 0, 1)

    return [
        { key: 'today', label: 'Today', range: mk(startOfToday) },
        { key: 'yesterday', label: 'Yesterday', range: mk(yesterday, yesterday) },
        { key: 'week', label: 'Last 7 days', range: mk(weekStart) },
        { key: 'month', label: 'This month', range: mk(monthStart) },
        { key: 'lastMonth', label: 'Last month', range: mk(lastMonthStart, lastMonthEnd) },
        { key: 'year', label: 'This year', range: mk(yearStart) },
    ]
}

const formatRupee = (v) => `₹${Number(v || 0).toLocaleString('en-IN')}`
const pctLabel = (v) => (v === null || v === undefined ? '—' : `${v > 0 ? '+' : ''}${v}%`)

// Turn the raw report + forecast numbers into plain-language, profit-focused
// advice the owner can act on without reading a single chart. Each rule is
// guarded so it only fires when the underlying signal actually exists.
const buildInsights = (report, forecast) => {
    const out = []
    const fc = forecast?.summary
    const t = report?.totals || {}
    const p = report?.patterns || {}
    const top = (report?.topItems || [])[0]
    const fmt = formatRupee

    // 1. Forecast headline → what to expect & do.
    if (fc) {
        if (fc.direction === 'up') {
            out.push({ tone: 'good', title: 'Momentum is on your side', text: `Sales are trending up. The next 7 days should bring about ${fmt(fc.next7)}, and this month is on track to close near ${fmt(fc.projectedMonthEnd)} if the pace holds. Keep popular items stocked so you don't lose this demand.` })
        } else if (fc.direction === 'down') {
            out.push({ tone: 'warn', title: 'Sales are cooling off', text: `The next 7 days are projected at only ${fmt(fc.next7)}. Launch a weekend combo or happy-hour deal, and message past customers to pull footfall back up.` })
        } else {
            out.push({ tone: 'info', title: 'Steady, but flat', text: `You're holding around ${fmt(fc.avgDailyForecast)}/day. A limited-time offer or a new bestseller-based combo could break the plateau.` })
        }
        if (fc.confidence === 'low') {
            out.push({ tone: 'warn', title: 'Forecast still warming up', text: `Prediction confidence is low because there isn't much sales history yet. The numbers will get sharper as more orders come in.` })
        }
    }

    // 2. Best vs worst weekday → where to run promos.
    const wk = (p.byWeekday || []).filter(d => d.earnings > 0)
    if (wk.length >= 2) {
        const best = wk.reduce((a, b) => (b.earnings > a.earnings ? b : a))
        const worst = wk.reduce((a, b) => (b.earnings < a.earnings ? b : a))
        if (best.label !== worst.label) {
            out.push({ tone: 'tip', title: 'Fix your slow day', text: `${best.label} is your strongest day (${fmt(best.earnings)}) while ${worst.label} is weakest (${fmt(worst.earnings)}). A ${worst.label}-only special can flatten that gap and add pure upside.` })
        }
    }

    // 3. Peak hours → staffing & stock.
    const hrs = (p.byHour || []).slice().sort((a, b) => b.earnings - a.earnings).slice(0, 2).filter(h => h.earnings > 0)
    if (hrs.length) {
        out.push({ tone: 'tip', title: 'Protect your rush hours', text: `Your busiest hours are ${hrs.map(h => h.label).join(' & ')}. Make sure the kitchen and floor are fully staffed then — slow service in the rush is lost money.` })
    }

    // 4. Bestseller → keep stocked, build combos.
    if (top) {
        out.push({ tone: 'good', title: 'Lean on your bestseller', text: `${top.name} is your top earner${top.revenueSharePct ? ` (${top.revenueSharePct}% of item revenue)` : ''}. Never run out of it, and pair it in a combo with a high-margin side or drink to lift the average bill.` })
    }

    // 5. Channel mix.
    const ch = (p.byChannel || []).filter(c => c.earnings > 0)
    if (ch.length) {
        const lead = ch.reduce((a, b) => (b.earnings > a.earnings ? b : a))
        out.push({ tone: 'info', title: 'Where your money comes from', text: `Most revenue is from ${lead.label} orders.${ch.length > 1 ? ' Nudging customers toward the smaller channels (e.g. takeaway/delivery) spreads your risk.' : ''}` })
    }

    // 6. Cancellations → recoverable profit.
    if (t.cancellationRate > 5) {
        out.push({ tone: 'warn', title: 'Plug the cancellation leak', text: `${t.cancellationRate}% of orders were cancelled. Each one you save is roughly ${fmt(t.avgOrderValue)} of direct profit — check for kitchen delays, stock-outs or unclear menu items.` })
    }

    // 7. Discount efficiency.
    if (t.discounts > 0 && t.earnings > 0) {
        const dp = Math.round((t.discounts / t.earnings) * 100)
        if (dp >= 10) {
            out.push({ tone: 'info', title: 'Watch your discount spend', text: `Discounts were ${dp}% of revenue (${fmt(t.discounts)}). Confirm they're bringing in enough extra orders — otherwise tighten the offers to protect margin.` })
        }
    }

    // 8. Ratings → repeat business.
    if (t.ratingCount > 0 && t.avgRating && t.avgRating < 4) {
        out.push({ tone: 'warn', title: 'Service is dragging on reviews', text: `Average rating is ${t.avgRating}★ across ${t.ratingCount} reviews. Lifting quality and speed drives repeat visits, which is the cheapest revenue you can get.` })
    }

    // 9. AOV slipping.
    if (report?.trend?.aovChangePct != null && report.trend.aovChangePct < 0) {
        out.push({ tone: 'tip', title: 'Raise the average bill', text: `Average order value fell ${Math.abs(report.trend.aovChangePct)}% vs the previous period. Train staff to upsell sides, drinks and desserts to bring it back up.` })
    }

    return out
}

const TONE_STYLE = {
    good: { icon: TrendingUp, color: '#16A34A', bg: '#F0FDF4', border: '#BBF7D0' },
    warn: { icon: AlertTriangle, color: '#DC2626', bg: '#FEF2F2', border: '#FECACA' },
    tip: { icon: Lightbulb, color: '#7E22CE', bg: '#FAF5FF', border: '#E9D5FF' },
    info: { icon: Info, color: '#2563EB', bg: '#EFF6FF', border: '#BFDBFE' },
}

// Small labelled stat tile.
const Kpi = ({ label, value, sub }) => (
    <div className="bg-white rounded-xl border border-[#EAECF0] p-4">
        <p className="text-[12px] font-[600] text-[#6B7280] mb-1">{label}</p>
        <p className="text-[18px] font-[700] text-[#1A181B]">{value}</p>
        {sub && <p className="text-[11px] text-gray-400 mt-0.5">{sub}</p>}
    </div>
)

// Horizontal breakdown bar list (channel / source / payment / weekday / category).
const BreakdownList = ({ title, rows, valueKey = 'earnings', labelKey = 'label', money = true }) => {
    const max = Math.max(...rows.map(r => r[valueKey] || 0), 1)
    // Treat an all-zero series (e.g. weekday rows that are always 7-long but
    // empty for the period) the same as "no rows" — otherwise it reads as a
    // broken table of ₹0s instead of an honest "nothing happened here".
    const empty = rows.length === 0 || rows.every(r => !(r[valueKey]) && !(r.orders))
    return (
        <div className="bg-white rounded-xl border border-[#EAECF0] p-4">
            <h4 className="text-[13px] font-[700] text-[#111827] mb-3">{title}</h4>
            {empty ? (
                <p className="text-[12px] text-gray-400">No data for this period</p>
            ) : (
                <div className="space-y-2.5">
                    {rows.map((r, i) => (
                        <div key={i} className="flex items-center gap-3">
                            <span className="text-[12px] font-[600] text-[#645E66] w-24 truncate capitalize" title={String(r[labelKey])}>{r[labelKey] || '—'}</span>
                            <div className="flex-1 flex items-center">
                                <div
                                    className="h-[18px] rounded-r-[5px] bg-[#A855F7]/80 transition-all"
                                    style={{ width: `${Math.round(((r[valueKey] || 0) / max) * 100)}%`, minWidth: r[valueKey] > 0 ? 4 : 0 }}
                                />
                                <span className="ml-2 text-[12px] font-[600] text-[#374151] whitespace-nowrap">
                                    {money ? formatRupee(r[valueKey]) : (r[valueKey] || 0)}
                                    {r.orders !== undefined && <span className="text-[11px] text-gray-400 ml-1.5">· {r.orders} ord</span>}
                                </span>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}

const BusinessReportModal = ({ isOpen, onClose, branchId }) => {
    const presets = useMemo(() => buildReportPresets(), [])
    const [preset, setPreset] = useState('month')
    const [range, setRange] = useState(presets.find(p => p.key === 'month').range)
    const [showCustom, setShowCustom] = useState(false)

    // Only fetch while the modal is open (saves a query when it's closed).
    const { data: report, isFetching } = useReports(
        { from: range.from, to: range.to, branch: branchId },
        { enabled: isOpen }
    )

    // Forecast is branch-scoped but independent of the selected range — it
    // always learns from the most recent history, so it's fetched once per
    // open (not on every preset change).
    const { data: forecast } = useForecast({ branch: branchId }, { enabled: isOpen })

    // Close on Escape.
    useEffect(() => {
        if (!isOpen) return
        const onKey = (e) => { if (e.key === 'Escape') onClose() }
        document.addEventListener('keydown', onKey)
        return () => document.removeEventListener('keydown', onKey)
    }, [isOpen, onClose])

    if (!isOpen) return null

    const applyPreset = (p) => { setPreset(p.key); setRange(p.range); setShowCustom(false) }
    const onCustomDate = (field, value) => {
        if (!value) return
        setPreset('custom')
        setRange(prev => {
            const next = { ...prev, [field]: value }
            if (next.from > next.to) { if (field === 'from') next.to = value; else next.from = value }
            return next
        })
    }

    const topItems = report?.topItems || []
    const earnings = report?.earnings || { data: [], bucket: 'Daily', summary: null }
    const totals = report?.totals || {}
    const trend = report?.trend || null
    const patterns = report?.patterns || {}
    const summary = earnings.summary || null
    const yTicks = computeYTicks((earnings.data || []).map(d => d.value))
    const maxCount = Math.max(...topItems.map(t => t.count), 1)

    // Forecast derived values.
    const fc = forecast?.summary || null
    const fcChart = forecast?.chart || { data: [], boundaryIndex: -1 }
    const fcYTicks = computeYTicks((fcChart.data || []).map(d => d.value))
    const dirMeta = {
        up: { color: '#16A34A', bg: '#DCFCE7', label: 'Trending up' },
        down: { color: '#EF4444', bg: '#FEE2E2', label: 'Trending down' },
        flat: { color: '#6B7280', bg: '#F3F4F6', label: 'Holding steady' },
    }[fc?.direction || 'flat']
    const confBadge = { high: 'text-[#16A34A]', medium: 'text-[#D97706]', low: 'text-[#EF4444]' }[fc?.confidence || 'low']
    const insights = buildInsights(report, forecast)

    // Full multi-section CSV record for offline analysis (Excel / Sheets).
    const exportCsv = () => {
        const rows = []
        const blank = () => rows.push([])
        const section = (title) => { blank(); rows.push([`== ${title} ==`]) }
        const periodFrom = report?.range?.from || range.from
        const periodTo = report?.range?.to || range.to

        rows.push(['BestoDine — Business Report'])
        rows.push(['Period', `${periodFrom} to ${periodTo}`])
        rows.push(['Days in period', report?.range?.days ?? ''])
        rows.push(['Earnings bucket', earnings.bucket])

        section('Summary')
        rows.push(['Metric', 'Value'])
        rows.push(['Total Earnings (Paid)', totals.earnings ?? 0])
        rows.push(['Total Orders', totals.orders ?? 0])
        rows.push(['Paid Orders', totals.paidOrders ?? 0])
        rows.push(['Cancelled Orders', totals.cancelledOrders ?? 0])
        rows.push(['Cancellation Rate (%)', totals.cancellationRate ?? 0])
        rows.push(['Avg Order Value', totals.avgOrderValue ?? 0])
        rows.push(['Avg Daily Earnings', totals.avgDailyEarnings ?? 0])
        rows.push(['Items Sold', totals.itemsSold ?? 0])
        rows.push(['Tips Collected', totals.tips ?? 0])
        rows.push(['Discounts Given', totals.discounts ?? 0])
        rows.push(['Refunds', totals.refunds ?? 0])
        rows.push(['Avg Rating', totals.avgRating ?? 0])
        rows.push(['Ratings Received', totals.ratingCount ?? 0])

        if (trend) {
            section('Trend vs Previous Period')
            rows.push(['Previous period', `${trend.prev?.from} to ${trend.prev?.to}`])
            rows.push(['Metric', 'This period', 'Previous', 'Change %'])
            rows.push(['Earnings', totals.earnings ?? 0, trend.prev?.earnings ?? 0, pctLabel(trend.earningsChangePct)])
            rows.push(['Orders', totals.orders ?? 0, trend.prev?.orders ?? 0, pctLabel(trend.ordersChangePct)])
            rows.push(['Avg Order Value', totals.avgOrderValue ?? 0, trend.prev?.avgOrderValue ?? 0, pctLabel(trend.aovChangePct)])
        }

        section('Most Selling Items')
        rows.push(['Rank', 'Item', 'Category', 'Qty Sold', 'Revenue', 'Revenue Share %'])
        topItems.forEach((it, i) => rows.push([i + 1, it.name, it.category || '', it.count, it.revenue, it.revenueSharePct ?? '']))

        if (patterns.byCategory?.length) {
            section('Sales by Category')
            rows.push(['Category', 'Qty Sold', 'Revenue'])
            patterns.byCategory.forEach(c => rows.push([c.category, c.count, c.revenue]))
        }
        if (patterns.byVegType) {
            section('Veg vs Non-veg (items sold)')
            rows.push(['Type', 'Qty Sold'])
            rows.push(['Veg', patterns.byVegType.veg])
            rows.push(['Non-veg', patterns.byVegType.nonVeg])
            rows.push(['Unspecified', patterns.byVegType.unspecified])
        }

        section(`Earnings over time (${earnings.bucket})`)
        rows.push(['Bucket', 'Earnings'])
        ;(earnings.data || []).forEach(d => rows.push([d.label, d.value]))

        if (patterns.byWeekday?.length) {
            section('Pattern — Earnings by Day of Week')
            rows.push(['Weekday', 'Orders', 'Earnings'])
            patterns.byWeekday.forEach(d => rows.push([d.label, d.orders, d.earnings]))
        }
        if (patterns.byHour?.length) {
            section('Pattern — Earnings by Hour of Day')
            rows.push(['Hour', 'Orders', 'Earnings'])
            patterns.byHour.forEach(d => rows.push([d.label, d.orders, d.earnings]))
        }
        if (patterns.byChannel?.length) {
            section('Orders by Channel (Dine-in / Takeaway / Delivery)')
            rows.push(['Channel', 'Orders', 'Earnings'])
            patterns.byChannel.forEach(d => rows.push([d.label, d.orders, d.earnings]))
        }
        if (patterns.bySource?.length) {
            section('Orders by Source')
            rows.push(['Source', 'Orders', 'Earnings'])
            patterns.bySource.forEach(d => rows.push([d.label, d.orders, d.earnings]))
        }
        if (patterns.byPayment?.length) {
            section('Paid Orders by Payment Method')
            rows.push(['Payment Method', 'Orders', 'Earnings'])
            patterns.byPayment.forEach(d => rows.push([d.label, d.orders, d.earnings]))
        }
        if (patterns.bestDay || patterns.worstDay) {
            section('Best & Worst Day (by earnings)')
            rows.push(['', 'Date', 'Earnings', 'Orders'])
            if (patterns.bestDay) rows.push(['Best', patterns.bestDay.date, patterns.bestDay.earnings, patterns.bestDay.orders])
            if (patterns.worstDay) rows.push(['Lowest', patterns.worstDay.date, patterns.worstDay.earnings, patterns.worstDay.orders])
        }

        // — Forecast / prediction —
        if (forecast?.summary) {
            const f = forecast.summary
            section('Forecast (Prediction)')
            rows.push(['Model', forecast.model || 'weekday-deseasonalised linear trend (back-tested)'])
            rows.push(['Learned from (days)', f.lookbackDays])
            rows.push(['Back-tested accuracy %', f.accuracy ?? 'n/a (not enough history)'])
            rows.push(['Avg error (MAPE) %', f.mape ?? 'n/a'])
            rows.push(['Confidence', f.confidence])
            rows.push(['Trend', `${f.direction} (${f.trendPctPerWeek > 0 ? '+' : ''}${f.trendPctPerWeek}% / week)`])
            rows.push(['Projected next 7 days', f.next7])
            rows.push(['Projected next 15 days', f.next15])
            rows.push(['Projected next 30 days', f.next30])
            rows.push(['Avg projected daily', f.avgDailyForecast])
            rows.push(['Month-to-date (actual)', f.monthToDate])
            rows.push(['Remaining-month forecast', f.monthRemainingForecast])
            rows.push(['Projected month-end total', f.projectedMonthEnd])
            blank()
            rows.push(['Forecast — daily projection'])
            rows.push(['Date', 'Predicted Earnings'])
            ;(forecast.forecast || []).forEach(d => rows.push([d.date, d.value]))
        }

        const csv = rows
            .map(r => r.map(cell => {
                const s = String(cell ?? '')
                return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
            }).join(','))
            .join('\n')
        const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `business-report_${periodFrom}_to_${periodTo}.csv`
        a.click()
        URL.revokeObjectURL(url)
    }

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 font-manrope">
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black/40" onClick={onClose} />

            {/* Panel */}
            <div className="relative bg-[#FAF5F0] rounded-2xl shadow-2xl w-full max-w-[1100px] max-h-[92vh] flex flex-col overflow-hidden">
                {/* Header */}
                <div className="flex items-start justify-between gap-3 px-6 py-4 bg-white border-b border-[#EAECF0]">
                    <div>
                        <h2 className="text-[18px] font-[700] text-[#1A181B]">Performance &amp; Records</h2>
                        <p className="text-[13px] font-[500] text-[#645E66]">Earnings &amp; best-selling items for any past period — review &amp; export</p>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={exportCsv}
                            disabled={!topItems.length && !totals.orders}
                            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#FE8301] text-white text-[13px] font-[600] shadow-sm hover:bg-[#e57400] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            <Download size={15} /> Export CSV
                        </button>
                        <button onClick={onClose} className="p-2 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors">
                            <X size={20} />
                        </button>
                    </div>
                </div>

                {/* Range controls */}
                <div className="px-6 py-3 bg-white border-b border-[#EAECF0] flex flex-col xl:flex-row xl:items-center gap-3">
                    <div className="flex flex-wrap gap-2">
                        {presets.map(p => (
                            <button
                                key={p.key}
                                onClick={() => applyPreset(p)}
                                className={`px-3.5 py-1.5 rounded-lg text-[13px] font-[600] border transition-all whitespace-nowrap ${
                                    preset === p.key ? 'bg-[#7E22CE] text-white border-[#7E22CE] shadow-sm' : 'bg-white text-[#374151] border-gray-200 hover:bg-gray-50'
                                }`}
                            >
                                {p.label}
                            </button>
                        ))}
                        <button
                            onClick={() => setShowCustom(v => !v)}
                            className={`px-3.5 py-1.5 rounded-lg text-[13px] font-[600] border transition-all whitespace-nowrap ${
                                preset === 'custom' || showCustom ? 'bg-[#7E22CE] text-white border-[#7E22CE] shadow-sm' : 'bg-white text-[#374151] border-gray-200 hover:bg-gray-50'
                            }`}
                        >
                            Custom
                        </button>
                    </div>
                    {(showCustom || preset === 'custom') && (
                        <div className="flex items-center gap-2 xl:ml-2">
                            <input type="date" value={range.from} max={range.to} onChange={(e) => onCustomDate('from', e.target.value)}
                                className="px-3 py-1.5 border border-gray-200 rounded-lg text-[13px] text-[#374151] focus:outline-none focus:ring-2 focus:ring-[#FE8301]/30" />
                            <span className="text-gray-400 text-[13px]">to</span>
                            <input type="date" value={range.to} min={range.from} onChange={(e) => onCustomDate('to', e.target.value)}
                                className="px-3 py-1.5 border border-gray-200 rounded-lg text-[13px] text-[#374151] focus:outline-none focus:ring-2 focus:ring-[#FE8301]/30" />
                        </div>
                    )}
                    {isFetching && <span className="text-[12px] text-gray-400 xl:ml-auto">Updating…</span>}
                </div>

                {/* Scrollable body */}
                <div className="flex-1 overflow-y-auto p-6 space-y-5">
                    {/* KPIs */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        <Kpi label="Total Earnings" value={formatRupee(totals.earnings)} sub={trend ? `${pctLabel(trend.earningsChangePct)} vs prev` : null} />
                        <Kpi label="Total Orders" value={(totals.orders || 0).toLocaleString('en-IN')} sub={trend ? `${pctLabel(trend.ordersChangePct)} vs prev` : null} />
                        <Kpi label="Avg Order Value" value={formatRupee(totals.avgOrderValue)} sub={trend ? `${pctLabel(trend.aovChangePct)} vs prev` : null} />
                        <Kpi label="Items Sold" value={(totals.itemsSold || 0).toLocaleString('en-IN')} />
                        <Kpi label="Paid Orders" value={(totals.paidOrders || 0).toLocaleString('en-IN')} />
                        <Kpi label="Cancelled" value={`${totals.cancelledOrders || 0}`} sub={`${totals.cancellationRate || 0}% rate`} />
                        <Kpi label="Tips" value={formatRupee(totals.tips)} />
                        <Kpi label="Discounts" value={formatRupee(totals.discounts)} />
                    </div>

                    {/* Most Selling + Earnings chart */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                        <div className="bg-white rounded-2xl border border-[#EAECF0] p-5">
                            <div className="flex items-baseline justify-between mb-4">
                                <h3 className="text-[15px] font-[700] text-[#111827]">Most Selling Items</h3>
                                {report?.range && <span className="text-[11px] text-gray-400">{report.range.from} → {report.range.to}</span>}
                            </div>
                            <div className="bg-[#FBF2FD] rounded-xl p-4 space-y-4 max-h-[300px] overflow-y-auto">
                                {topItems.length === 0 ? (
                                    <p className="text-[13px] text-gray-400 text-center py-3">No sales in this period</p>
                                ) : topItems.map(item => (
                                    <div key={item.name} className="flex items-center gap-3">
                                        <span className="text-[13px] font-[600] text-[#645E66] w-24 truncate" title={item.name}>{item.name}</span>
                                        <div className="flex-1 flex items-center">
                                            <div className="h-[20px] rounded-r-[5px] transition-all" style={{ width: `${Math.round((item.count / maxCount) * 100)}%`, backgroundColor: item.color || '#AD09D4' }} />
                                            <span className="ml-2 text-[13px] font-[600] text-[#374151] whitespace-nowrap">
                                                {item.count}
                                                <span className="text-[11px] font-[500] text-gray-400 ml-1.5">{formatRupee(item.revenue)}</span>
                                            </span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="bg-white rounded-2xl border border-[#EAECF0] p-5">
                            <div className="flex justify-between items-start mb-3 gap-3">
                                <div>
                                    <h3 className="text-[15px] font-[700] text-[#111827]">Earnings</h3>
                                    <div className="flex items-center gap-2 mt-1">
                                        <p className="text-[22px] font-[700] text-[#1A181B]">{formatRupee(totals.earnings)}</p>
                                        {trend && trend.earningsChangePct !== null && trend.earningsChangePct !== undefined && (
                                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-[700] ${trend.earningsChangePct >= 0 ? 'bg-[#DCFCE7] text-[#16A34A]' : 'bg-[#FEE2E2] text-[#EF4444]'}`}>
                                                <TrendingUp size={11} className={trend.earningsChangePct < 0 ? 'rotate-180' : ''} />
                                                {pctLabel(trend.earningsChangePct)}
                                            </span>
                                        )}
                                    </div>
                                    <p className="text-[11px] text-gray-400 mt-0.5">Broken down by {earnings.bucket.toLowerCase()}</p>
                                </div>
                                {summary?.peakValue > 0 && summary?.peakLabel && (
                                    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#EBF5FF] text-[#007AFF] text-[11px] font-[600] shrink-0">
                                        <TrendingUp size={12} />
                                        <span>Peak · {summary.peakLabel}</span>
                                        <span className="text-[#1A181B]">{formatRupee(summary.peakValue)}</span>
                                    </div>
                                )}
                            </div>
                            <div className="h-[230px] w-full">
                                <LineChart data={earnings.data || []} height={230} color="#007AFF" yTicks={yTicks} peakIndex={summary?.peakIndex} />
                            </div>
                        </div>
                    </div>

                    {/* Pattern breakdowns */}
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                        <BreakdownList title="By Day of Week" rows={patterns.byWeekday || []} />
                        <BreakdownList title="By Channel" rows={patterns.byChannel || []} />
                        <BreakdownList title="By Payment Method" rows={patterns.byPayment || []} />
                        <BreakdownList title="By Source" rows={patterns.bySource || []} />
                        <BreakdownList
                            title="Top Categories"
                            rows={(patterns.byCategory || []).slice(0, 6).map(c => ({ label: c.category, earnings: c.revenue, orders: c.count }))}
                        />
                        <BreakdownList title="Busiest Hours" rows={(patterns.byHour || []).slice().sort((a, b) => b.earnings - a.earnings).slice(0, 6)} />
                    </div>

                    {/* Best / worst day */}
                    {(patterns.bestDay || patterns.worstDay) && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            {patterns.bestDay && (
                                <div className="bg-[#F0FDF4] border border-[#BBF7D0] rounded-xl p-4">
                                    <p className="text-[12px] font-[600] text-[#16A34A] mb-1">Best day</p>
                                    <p className="text-[15px] font-[700] text-[#1A181B]">{patterns.bestDay.date}</p>
                                    <p className="text-[13px] text-[#374151]">{formatRupee(patterns.bestDay.earnings)} · {patterns.bestDay.orders} orders</p>
                                </div>
                            )}
                            {patterns.worstDay && (
                                <div className="bg-[#FEF2F2] border border-[#FECACA] rounded-xl p-4">
                                    <p className="text-[12px] font-[600] text-[#EF4444] mb-1">Lowest day</p>
                                    <p className="text-[15px] font-[700] text-[#1A181B]">{patterns.worstDay.date}</p>
                                    <p className="text-[13px] text-[#374151]">{formatRupee(patterns.worstDay.earnings)} · {patterns.worstDay.orders} orders</p>
                                </div>
                            )}
                        </div>
                    )}

                    {/* ── Forecast / Prediction (sits BELOW the actuals/patterns
                        so the owner reads "what happened" first, then "what's
                        coming next"). Transparent model: weekday-deseasonalised
                        trend, with a back-tested accuracy figure. */}
                    {fc && (
                        <div className="bg-white rounded-2xl border border-[#EAECF0] p-5">
                            <div className="flex flex-wrap justify-between items-start gap-3 mb-4">
                                <div>
                                    <div className="flex items-center gap-2">
                                        <Sparkles size={16} className="text-[#7E22CE]" />
                                        <h3 className="text-[15px] font-[700] text-[#111827]">Business Forecast</h3>
                                        <span className="px-2 py-0.5 rounded-full text-[10px] font-[700]" style={{ backgroundColor: dirMeta.bg, color: dirMeta.color }}>
                                            {dirMeta.label}
                                        </span>
                                    </div>
                                    <p className="text-[11px] text-gray-400 mt-1">
                                        Predicted from last {fc.lookbackDays} days · weekly trend {fc.trendPctPerWeek > 0 ? '+' : ''}{fc.trendPctPerWeek}% ·
                                        <span className={`font-[700] ${confBadge}`}> {fc.confidence} confidence</span>
                                    </p>
                                </div>
                                {/* Backtested accuracy — measured by predicting a held-out
                                    slice of real history, so it's an honest figure, not a claim. */}
                                {fc.accuracy != null && (
                                    <div className="text-right">
                                        <p className="text-[22px] font-[800] leading-none" style={{ color: dirMeta.color }}>{fc.accuracy}%</p>
                                        <p className="text-[10px] text-gray-400 mt-1">model accuracy<br />(back-tested)</p>
                                    </div>
                                )}
                            </div>

                            {/* Forecast KPI cards — 7 / 15 / 30 day + month close */}
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-2">
                                <Kpi label="Next 7 days" value={formatRupee(fc.next7)} sub={`~${formatRupee(fc.avgDailyForecast)}/day`} />
                                <Kpi label="Next 15 days" value={formatRupee(fc.next15)} sub="projected earnings" />
                                <Kpi label="Next 30 days" value={formatRupee(fc.next30)} sub="projected earnings" />
                                <Kpi
                                    label="Projected month-end"
                                    value={formatRupee(fc.projectedMonthEnd)}
                                    sub={`${formatRupee(fc.monthToDate)} so far + ${fc.remainingDaysInMonth}d`}
                                />
                            </div>
                            {/* Plain-language 15 & 30 day read-out */}
                            <p className="text-[12px] text-[#645E66] mb-4">
                                Over the next <span className="font-[700] text-[#1A181B]">15 days</span> you can expect about <span className="font-[700]" style={{ color: dirMeta.color }}>{formatRupee(fc.next15)}</span>, and over <span className="font-[700] text-[#1A181B]">30 days</span> about <span className="font-[700]" style={{ color: dirMeta.color }}>{formatRupee(fc.next30)}</span> in earnings.
                            </p>

                            {/* Actual → forecast continuation chart. The dashed
                                guide (currentIndex = boundaryIndex) marks today;
                                everything to its right is predicted. */}
                            <div className="h-[230px] w-full">
                                <LineChart
                                    data={fcChart.data || []}
                                    height={230}
                                    color="#7E22CE"
                                    yTicks={fcYTicks}
                                    currentIndex={fcChart.boundaryIndex >= 0 ? fcChart.boundaryIndex : null}
                                />
                            </div>
                            <p className="text-[11px] text-gray-400 mt-2 flex items-center gap-1.5">
                                <span className="inline-block w-6 border-t border-dashed border-[#7E22CE]" />
                                Left of the dashed line = actual · right = forecast. Estimates only — accuracy improves with more order history.
                            </p>
                        </div>
                    )}

                    {/* ── Smart Insights — plain-language, profit-focused advice
                        derived from the numbers above. Sits at the bottom so the
                        owner can read "what to do" without decoding any chart. */}
                    {insights.length > 0 && (
                        <div className="bg-white rounded-2xl border border-[#EAECF0] p-5">
                            <div className="flex items-center gap-2 mb-1">
                                <Lightbulb size={16} className="text-[#FE8301]" />
                                <h3 className="text-[15px] font-[700] text-[#111827]">Smart Insights — how to grow profit</h3>
                            </div>
                            <p className="text-[12px] text-gray-400 mb-4">Actionable takeaways from this period&apos;s data and the forecast.</p>
                            <div className="space-y-3">
                                {insights.map((ins, i) => {
                                    const s = TONE_STYLE[ins.tone] || TONE_STYLE.info
                                    const Icon = s.icon
                                    return (
                                        <div key={i} className="flex items-start gap-3 rounded-xl p-3.5 border" style={{ backgroundColor: s.bg, borderColor: s.border }}>
                                            <span className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5" style={{ backgroundColor: '#FFFFFF', color: s.color }}>
                                                <Icon size={15} />
                                            </span>
                                            <div>
                                                <p className="text-[13px] font-[700] text-[#1A181B]">{ins.title}</p>
                                                <p className="text-[13px] text-[#374151] leading-[19px] mt-0.5">{ins.text}</p>
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}

export default BusinessReportModal
