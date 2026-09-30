import React, { useState, useEffect, useCallback } from 'react'
import { ArrowLeft, ChevronDown, Loader2 } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import api from '../../../utils/api'
import { toast } from 'react-hot-toast'

/* ─── Conversion Trends — smooth line chart (blue) ────────── */
const ConversionLineChart = ({ data }) => {
    const W = 440; const H = 180
    const padL = 40; const padR = 16; const padT = 16; const padB = 32
    const chartW = W - padL - padR
    const chartH = H - padT - padB

    const values = data.map(d => d.conversionRate)
    const maxVal = Math.max(...values, 1)
    // Round the ceiling up to a multiple of 4 so all five % ticks are whole
    // numbers. The old tiered ceilings (5/10/50) weren't divisible by 4, so
    // ticks rounded to 0,13,25,38,50 — fractional and uneven on the axis.
    const ceil = Math.max(4, Math.ceil(maxVal / 4) * 4)
    const yTicks = Array.from({ length: 5 }, (_, i) => (ceil / 4) * i)

    if (data.length === 0) return <p className="text-[13px] text-gray-400 text-center py-8">No data</p>

    const pts = values.map((v, i) => ({
        x: padL + (data.length === 1 ? chartW / 2 : (i / (data.length - 1)) * chartW),
        y: padT + chartH - (v / ceil) * chartH,
    }))

    const linePath = pts.reduce((acc, pt, i) => {
        if (i === 0) return `M ${pt.x},${pt.y}`
        const prev = pts[i - 1]
        const cpX = (prev.x + pt.x) / 2
        return `${acc} C ${cpX},${prev.y} ${cpX},${pt.y} ${pt.x},${pt.y}`
    }, '')

    const areaPath = `${linePath} L ${pts[pts.length - 1].x},${padT + chartH} L ${pts[0].x},${padT + chartH} Z`

    return (
        <svg width="100%" viewBox={`0 0 ${W} ${H}`} className="overflow-visible">
            <defs>
                <linearGradient id="blueGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#3B82F6" stopOpacity="0.15" />
                    <stop offset="100%" stopColor="#3B82F6" stopOpacity="0" />
                </linearGradient>
            </defs>

            {yTicks.map(t => {
                const y = padT + chartH - (t / ceil) * chartH
                return (
                    <g key={t}>
                        <line x1={padL} y1={y} x2={padL + chartW} y2={y}
                            stroke="#E5E7EB" strokeWidth="1" strokeDasharray="4 3" />
                        <text x={padL - 6} y={y + 4} textAnchor="end"
                            fontSize="10" fill="#9CA3AF" fontFamily="Manrope,sans-serif">
                            {t === 0 ? '0' : `${t}%`}
                        </text>
                    </g>
                )
            })}

            <path d={areaPath} fill="url(#blueGrad)" />
            <path d={linePath} fill="none" stroke="#3B82F6" strokeWidth="2.5"
                strokeLinecap="round" strokeLinejoin="round" />

            {/* Dots */}
            {pts.map((pt, i) => (
                <circle key={i} cx={pt.x} cy={pt.y} r="3" fill="#3B82F6" />
            ))}

            {/* Thin the x-axis labels so a 30-day month view doesn't render
                30 overlapping dates into an unreadable smear — show ~8 evenly
                spaced labels. A 7-day week (step 1) still shows every day. */}
            {data.map((d, i) => (
                i % Math.max(1, Math.ceil(data.length / 8)) === 0 ? (
                    <text key={d.date} x={pts[i].x}
                        y={H - 6} textAnchor="middle"
                        fontSize="10" fill="#9CA3AF" fontFamily="Manrope,sans-serif">
                        {d.label}
                    </text>
                ) : null
            ))}
        </svg>
    )
}

/* ─── Redemption Volume — bar chart (purple) ──────────────── */
const RedemptionBarChart = ({ data }) => {
    const W = 460; const H = 200
    const padL = 36; const padR = 8; const padT = 20; const padB = 28
    const chartW = W - padL - padR
    const chartH = H - padT - padB

    const values = data.map(d => d.count)
    const rawMax = Math.max(...values, 1)
    // Redemption counts are whole numbers, so round the axis ceiling up to
    // a multiple of 4 — that guarantees all five ticks are integers. The old
    // tiered ceilings (5/25/50…) weren't divisible by 4, so quarter-ticks
    // rounded to 0,1,3,4,5 and the "2" went missing, making the axis look broken.
    const maxVal = Math.max(4, Math.ceil(rawMax / 4) * 4)
    const yTicks = Array.from({ length: 5 }, (_, i) => (maxVal / 4) * i)

    if (data.length === 0) return <p className="text-[13px] text-gray-400 text-center py-8">No data</p>

    const n = data.length
    const totalGap = chartW * 0.48
    const gap = n > 1 ? totalGap / (n - 1) : 0
    const barW = n > 1 ? (chartW - totalGap) / n : chartW * 0.15
    const baselineY = padT + chartH

    return (
        <svg width="100%" viewBox={`0 0 ${W} ${H}`} className="overflow-visible">
            {yTicks.map(t => {
                const y = padT + chartH - (t / maxVal) * chartH
                return (
                    <g key={t}>
                        <text x={padL - 6} y={t === maxVal ? y + 3 : y + 4} textAnchor="end"
                            fontSize="10" fill="#9CA3AF" fontFamily="Manrope,sans-serif">{t}</text>
                        {t === 0
                            ? <line x1={padL} y1={y} x2={padL + chartW} y2={y} stroke="#D1D5DB" strokeWidth="1" />
                            : <line x1={padL} y1={y} x2={padL + chartW} y2={y} stroke="#E5E7EB" strokeWidth="1" strokeDasharray="5 4" />
                        }
                    </g>
                )
            })}

            {values.map((v, i) => {
                const barH = (v / maxVal) * chartH
                const x = n === 1 ? padL + (chartW - barW) / 2 : padL + i * (barW + gap)
                return (
                    <rect key={i} x={x} y={baselineY - barH} width={barW} height={barH} rx="0" fill="#9333EA" />
                )
            })}

            {/* Thin x-axis labels (see ConversionLineChart) — same step so the
                two charts' date ticks stay vertically aligned. */}
            {data.map((d, i) => {
                if (i % Math.max(1, Math.ceil(n / 8)) !== 0) return null
                const x = n === 1 ? padL + chartW / 2 : padL + i * (barW + gap) + barW / 2
                return (
                    <text key={d.date} x={x} y={H - 6} textAnchor="middle"
                        fontSize="10" fill="#9CA3AF" fontFamily="Manrope,sans-serif">{d.label}</text>
                )
            })}
        </svg>
    )
}

/* ─── Main Page ───────────────────────────────────────────── */
const OfferPerformance = () => {
    const navigate = useNavigate()
    const [dateFilter, setDateFilter] = useState('week')
    const [loading, setLoading] = useState(true)
    const [data, setData] = useState(null)

    const fetchPerformance = useCallback(async () => {
        try {
            setLoading(true)
            const res = await api.get(`/promotions/coupons/performance?filter=${dateFilter}`)
            if (res.data.success) setData(res.data)
        } catch {
            toast.error('Failed to load performance data')
        } finally {
            setLoading(false)
        }
    }, [dateFilter])

    useEffect(() => { fetchPerformance() }, [fetchPerformance])

    return (
        <div className="h-full flex flex-col p-6 overflow-y-auto font-manrope">

            {/* Back Button */}
            <button
                onClick={() => navigate(-1)}
                className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-lg text-[14px] font-[500] text-gray-600 hover:bg-gray-50 transition-colors w-fit mb-5"
            >
                <ArrowLeft size={16} />
                Back to Offers
            </button>

            {/* Title */}
            <div className="mb-5">
                <h1 className="admin-page-title leading-[28px]">Offer Performance</h1>
                <p className="admin-page-subtitle mt-1">
                    Measure how effectively offers convert into redemptions
                </p>
            </div>

            {/* Filter by Date */}
            <div className="mb-6">
                <label className="block text-[13px] font-[500] text-gray-700 mb-1.5">Filter by Date</label>
                <div className="relative w-[200px]">
                    <select
                        className="w-full appearance-none bg-white border border-gray-200 rounded-lg px-4 py-2.5 text-[14px] text-gray-500 focus:outline-none focus:border-[#FE8301] cursor-pointer"
                        value={dateFilter}
                        onChange={e => setDateFilter(e.target.value)}
                    >
                        <option value="today">Today</option>
                        <option value="week">This Week</option>
                        <option value="month">This Month</option>
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" size={16} />
                </div>
            </div>

            {loading ? (
                <div className="flex-1 flex items-center justify-center">
                    <Loader2 size={36} className="animate-spin text-[#FE8301]" />
                </div>
            ) : !data ? (
                <div className="flex-1 flex flex-col items-center justify-center text-gray-400 gap-2">
                    <p className="text-[16px] font-semibold">No data available</p>
                    <p className="text-[13px]">Performance metrics will appear once coupons are redeemed</p>
                </div>
            ) : (
                <>
                    {/* Summary Cards */}
                    <div className="grid grid-cols-4 gap-4 mb-6">
                        <div className="p-5 bg-white rounded-[16px] border border-gray-100 shadow-sm">
                            <p className="text-[13px] font-[500] text-gray-500 mb-2">Total Redemptions</p>
                            <span className="text-[22px] font-[700] text-[#1A181B]">{data.summary.totalRedemptions}</span>
                        </div>
                        <div className="p-5 bg-white rounded-[16px] border border-gray-100 shadow-sm">
                            <p className="text-[13px] font-[500] text-gray-500 mb-2">Total Savings</p>
                            <span className="text-[22px] font-[700] text-[#16A34A]">₹{data.summary.totalSavings.toLocaleString('en-IN')}</span>
                        </div>
                        <div className="p-5 bg-white rounded-[16px] border border-gray-100 shadow-sm">
                            <p className="text-[13px] font-[500] text-gray-500 mb-2">Conversion Rate</p>
                            <span className="text-[22px] font-[700] text-[#3B82F6]">{data.summary.conversionRate}%</span>
                        </div>
                        <div className="p-5 bg-white rounded-[16px] border border-gray-100 shadow-sm">
                            <p className="text-[13px] font-[500] text-gray-500 mb-2">Active Coupons</p>
                            <span className="text-[22px] font-[700] text-[#9333EA]">{data.summary.activeCoupons}</span>
                        </div>
                    </div>

                    {/* Charts */}
                    <div className="grid grid-cols-2 gap-5 mb-6">
                        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                            <h2 className="text-[16px] font-[700] text-[#1A181B] mb-4">Conversion Trends</h2>
                            <ConversionLineChart data={data.daily} />
                        </div>

                        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                            <h2 className="text-[16px] font-[700] text-[#1A181B] mb-4">Redemption Volume</h2>
                            <RedemptionBarChart data={data.daily} />
                        </div>
                    </div>

                    {/* Top Performing Coupons */}
                    {data.topCoupons.length > 0 && (
                        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                            <h2 className="text-[16px] font-[700] text-[#1A181B] mb-4">Top Performing Coupons</h2>
                            <div className="overflow-x-auto">
                                <table className="w-full">
                                    <thead className="bg-gray-50 border-b border-gray-200">
                                        <tr>
                                            <th className="text-left py-3 px-4 text-[12px] font-[600] text-gray-500">#</th>
                                            <th className="text-left py-3 px-4 text-[12px] font-[600] text-gray-500">Coupon</th>
                                            <th className="text-left py-3 px-4 text-[12px] font-[600] text-gray-500">Code</th>
                                            <th className="text-right py-3 px-4 text-[12px] font-[600] text-gray-500">Redemptions</th>
                                            <th className="text-right py-3 px-4 text-[12px] font-[600] text-gray-500">Total Savings</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {data.topCoupons.map((c, i) => (
                                            <tr key={c._id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/50">
                                                <td className="py-3 px-4 text-[13px] font-[600] text-gray-400">{i + 1}</td>
                                                <td className="py-3 px-4 text-[14px] font-[600] text-[#1A181B]">{c.title}</td>
                                                <td className="py-3 px-4 text-[13px] text-gray-500 uppercase">{c.code}</td>
                                                <td className="py-3 px-4 text-[14px] font-[600] text-[#1A181B] text-right">{c.count}</td>
                                                <td className="py-3 px-4 text-[14px] font-[600] text-[#16A34A] text-right">₹{c.savings.toLocaleString('en-IN')}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </>
            )}
        </div>
    )
}

export default OfferPerformance
