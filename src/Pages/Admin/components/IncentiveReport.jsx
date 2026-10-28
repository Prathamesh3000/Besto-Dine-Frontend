import React, { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Download } from 'lucide-react'
import { incentiveAPI } from '../../../utils/api'
import {
    ENTRY_STATES, ENTRY_STATE_STYLE, apiMessage, buildReportParams, daysAgoYmd, isLockedError, money, toYmd,
} from '../../../utils/incentives'

const inputCls = 'border border-gray-200 rounded-lg px-3 py-2 text-[13px] font-manrope bg-white'
const PAGE_SIZE = 25

const Kpi = ({ label, value, testid }) => (
    <div className="bg-white rounded-xl border border-gray-100 p-4" data-testid={testid}>
        <p className="text-[12px] text-gray-500">{label}</p>
        <p className="text-[20px] font-bold text-[#1A181B]">{value}</p>
    </div>
)

const StateChip = ({ state }) => (
    <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border capitalize ${ENTRY_STATE_STYLE[state] || ''}`}>{state}</span>
)

// Generic breakdown table. columns: [{ key, label, render? }]
function Breakdown({ title, rows, columns, testid }) {
    if (!rows || rows.length === 0) return null
    return (
        <div className="bg-white rounded-xl border border-gray-100 overflow-x-auto" data-testid={testid}>
            <h3 className="px-4 pt-3 text-[14px] font-bold text-[#1A181B]">{title}</h3>
            <table className="w-full text-left text-[13px] mt-2">
                <thead className="bg-gray-50 text-gray-500">
                    <tr>{columns.map(c => <th key={c.key} className="p-2.5">{c.label}</th>)}</tr>
                </thead>
                <tbody>
                    {rows.map((r, i) => (
                        <tr key={r._id ?? r.day ?? i} className="border-t border-gray-50">
                            {columns.map(c => <td key={c.key} className="p-2.5">{c.render ? c.render(r) : r[c.key]}</td>)}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    )
}

const amt = (k) => (r) => money(r[k])

export default function IncentiveReport({ menuItems = [], branches = [], staff = [], onLocked }) {
    const [filters, setFilters] = useState(() => ({
        from: daysAgoYmd(6), to: toYmd(new Date()), branch: 'all', staff: '', campaign: '', item: '', state: '',
    }))
    const [page, setPage] = useState(1)
    const [exporting, setExporting] = useState(false)

    const setFilter = (k, v) => { setFilters(f => ({ ...f, [k]: v })); setPage(1) }
    const params = buildReportParams(filters, page, PAGE_SIZE)

    const { data: campaigns = [] } = useQuery({
        queryKey: ['admin', 'incentives', 'campaigns'],
        queryFn: async () => (await incentiveAPI.getCampaigns()).data?.campaigns || [],
        retry: false,
    })

    const { data, isLoading, isFetching, error, refetch } = useQuery({
        queryKey: ['admin', 'incentives', 'report', params],
        queryFn: async () => {
            try {
                return (await incentiveAPI.getReport(params)).data
            } catch (err) {
                if (isLockedError(err)) onLocked?.(err)
                throw err
            }
        },
        retry: false,
        placeholderData: (prev) => prev,
    })

    const exportCsv = async () => {
        if (exporting) return
        setExporting(true)
        try {
            const { page: _p, limit: _l, ...csvParams } = params
            const res = await incentiveAPI.exportReportCsv(csvParams)
            const url = window.URL.createObjectURL(new Blob([res.data], { type: 'text/csv' }))
            const a = document.createElement('a')
            a.href = url
            a.download = `incentives-${filters.from || 'all'}-to-${filters.to || 'all'}.csv`
            document.body.appendChild(a)
            a.click()
            a.remove()
            window.URL.revokeObjectURL(url)
        } catch (err) {
            // Blob error bodies hide the JSON message; read it like BulkAddCsvModal does.
            let msg = ''
            const blob = err?.response?.data
            if (blob instanceof Blob) {
                try { msg = JSON.parse(await blob.text())?.message || '' } catch { /* not JSON */ }
            }
            toast.error(msg || apiMessage(err, 'Could not export the report'))
        } finally {
            setExporting(false)
        }
    }

    const totals = data?.totals || {}
    const rows = data?.rows || []
    const pages = data?.pages || 1

    return (
        <div className="space-y-5">
            <div className="flex flex-wrap items-end gap-3 bg-white rounded-xl border border-gray-100 p-4" data-testid="inc-filters">
                <label className="text-[12px] text-gray-500 flex flex-col gap-1">From
                    <input type="date" aria-label="From date" className={inputCls} value={filters.from} onChange={e => setFilter('from', e.target.value)} />
                </label>
                <label className="text-[12px] text-gray-500 flex flex-col gap-1">To
                    <input type="date" aria-label="To date" className={inputCls} value={filters.to} onChange={e => setFilter('to', e.target.value)} />
                </label>
                <label className="text-[12px] text-gray-500 flex flex-col gap-1">Branch
                    <select aria-label="Branch" className={inputCls} value={filters.branch} onChange={e => setFilter('branch', e.target.value)}>
                        <option value="all">All branches</option>
                        {branches.map(b => <option key={b._id} value={b._id}>{b.name}</option>)}
                        <option value="none">Tenant-level only</option>
                    </select>
                </label>
                <label className="text-[12px] text-gray-500 flex flex-col gap-1">Staff
                    <select aria-label="Staff" className={inputCls} value={filters.staff} onChange={e => setFilter('staff', e.target.value)}>
                        <option value="">All staff</option>
                        {staff.map(s => <option key={s._id} value={s._id}>{s.name}</option>)}
                    </select>
                </label>
                <label className="text-[12px] text-gray-500 flex flex-col gap-1">Campaign
                    <select aria-label="Campaign" className={inputCls} value={filters.campaign} onChange={e => setFilter('campaign', e.target.value)}>
                        <option value="">All campaigns</option>
                        {campaigns.map(c => <option key={c._id} value={c._id}>{c.name}</option>)}
                    </select>
                </label>
                <label className="text-[12px] text-gray-500 flex flex-col gap-1">Item
                    <select aria-label="Item" className={inputCls} value={filters.item} onChange={e => setFilter('item', e.target.value)}>
                        <option value="">All items</option>
                        {menuItems.map(m => <option key={m._id} value={m._id}>{m.name}</option>)}
                    </select>
                </label>
                <label className="text-[12px] text-gray-500 flex flex-col gap-1">State
                    <select aria-label="State" className={inputCls} value={filters.state} onChange={e => setFilter('state', e.target.value)}>
                        <option value="">All states</option>
                        {ENTRY_STATES.map(s => <option key={s} value={s} className="capitalize">{s}</option>)}
                    </select>
                </label>
                <button type="button" onClick={exportCsv} disabled={exporting} className="ml-auto inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-[#FE8301] text-[#FE8301] text-[13px] font-semibold disabled:opacity-50">
                    <Download size={15} /> {exporting ? 'Exporting...' : 'Export CSV'}
                </button>
            </div>

            {isLoading && <p className="text-gray-500 text-[14px]" data-testid="inc-report-loading">Loading report...</p>}
            {error && !isLockedError(error) && (
                <div className="p-4 rounded-lg bg-red-50 text-red-700 text-[14px]" role="alert">
                    {apiMessage(error, 'Could not load the report')}{' '}
                    <button type="button" className="underline font-semibold" onClick={() => refetch()}>Retry</button>
                </div>
            )}

            {data && (
                <>
                    <div className={`grid grid-cols-2 lg:grid-cols-5 gap-3 ${isFetching ? 'opacity-60' : ''}`}>
                        <Kpi testid="kpi-quantity" label="Items counted" value={totals.quantity || 0} />
                        <Kpi testid="kpi-estimated" label="Estimated" value={money(totals.estimated)} />
                        <Kpi testid="kpi-confirmed" label="Confirmed" value={money(totals.confirmed)} />
                        <Kpi testid="kpi-pending" label="Pending" value={money(totals.pending)} />
                        <Kpi testid="kpi-reversed" label="Reversed" value={money(totals.reversed)} />
                    </div>

                    {rows.length === 0 && (data.byDay || []).length === 0 ? (
                        <div className="p-8 text-center text-gray-500 bg-white rounded-xl border border-gray-100" data-testid="inc-report-empty">
                            No incentive entries for these filters.
                        </div>
                    ) : (
                        <>
                            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                                <Breakdown testid="by-day" title="By day" rows={data.byDay} columns={[
                                    { key: 'day', label: 'Day' }, { key: 'quantity', label: 'Qty' },
                                    { key: 'confirmed', label: 'Confirmed', render: amt('confirmed') },
                                    { key: 'pending', label: 'Pending', render: amt('pending') },
                                    { key: 'estimated', label: 'Estimated', render: amt('estimated') },
                                ]} />
                                <Breakdown testid="by-staff" title="By staff" rows={data.byStaff} columns={[
                                    { key: 'name', label: 'Staff', render: r => r.name || r.staffName || String(r._id) },
                                    { key: 'quantity', label: 'Qty' },
                                    { key: 'confirmed', label: 'Confirmed', render: amt('confirmed') },
                                    { key: 'pending', label: 'Pending', render: amt('pending') },
                                    { key: 'estimated', label: 'Estimated', render: amt('estimated') },
                                ]} />
                                <Breakdown testid="by-campaign" title="By campaign" rows={data.byCampaign} columns={[
                                    { key: 'name', label: 'Campaign', render: r => r.name || r.campaignName || String(r._id) },
                                    { key: 'quantity', label: 'Qty' },
                                    { key: 'confirmed', label: 'Confirmed', render: amt('confirmed') },
                                    { key: 'pending', label: 'Pending', render: amt('pending') },
                                    { key: 'estimated', label: 'Estimated', render: amt('estimated') },
                                ]} />
                                <Breakdown testid="by-item" title="By item" rows={data.byItem} columns={[
                                    { key: 'name', label: 'Item', render: r => r.name || r.itemName || String(r._id) },
                                    { key: 'quantity', label: 'Qty' },
                                    { key: 'confirmed', label: 'Confirmed', render: amt('confirmed') },
                                    { key: 'pending', label: 'Pending', render: amt('pending') },
                                    { key: 'estimated', label: 'Estimated', render: amt('estimated') },
                                ]} />
                            </div>

                            <div className="bg-white rounded-xl border border-gray-100 overflow-x-auto" data-testid="inc-rows">
                                <h3 className="px-4 pt-3 text-[14px] font-bold text-[#1A181B]">Entries ({data.total ?? rows.length})</h3>
                                <table className="w-full text-left text-[13px] mt-2">
                                    <thead className="bg-gray-50 text-gray-500">
                                        <tr>
                                            <th className="p-2.5">Day</th><th className="p-2.5">Order / bill</th><th className="p-2.5">Item</th>
                                            <th className="p-2.5">Qty</th><th className="p-2.5">Rate</th><th className="p-2.5">Amount</th>
                                            <th className="p-2.5">Staff</th><th className="p-2.5">Campaign</th><th className="p-2.5">Branch</th><th className="p-2.5">State</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {rows.map(r => (
                                            <tr key={r._id} className="border-t border-gray-50" data-testid="inc-row">
                                                <td className="p-2.5 whitespace-nowrap">{r.day}</td>
                                                <td className="p-2.5 whitespace-nowrap">{r.orderId || '-'}{r.billNo ? ` / ${r.billNo}` : ''}</td>
                                                <td className="p-2.5">{r.itemName}</td>
                                                <td className="p-2.5">{r.quantity}</td>
                                                <td className="p-2.5">{money(r.rate)}</td>
                                                <td className="p-2.5">{money(r.amount)}</td>
                                                <td className="p-2.5">{r.staffName || '-'}{r.staffRole ? ` (${r.staffRole})` : ''}</td>
                                                <td className="p-2.5">{r.campaignName || '-'}</td>
                                                <td className="p-2.5">{r.branchName || '-'}</td>
                                                <td className="p-2.5">
                                                    <StateChip state={r.state} />
                                                    {r.state === 'reversed' && r.reverseReason && <span className="block text-[11px] text-gray-400">{r.reverseReason}</span>}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                                <div className="flex items-center justify-between p-3 text-[13px] text-gray-500">
                                    <span>Page {data.page || page} of {pages}</span>
                                    <div className="flex gap-2">
                                        <button type="button" disabled={page <= 1} onClick={() => setPage(p => Math.max(1, p - 1))} className="px-3 py-1.5 rounded border border-gray-200 disabled:opacity-40">Previous</button>
                                        <button type="button" disabled={page >= pages} onClick={() => setPage(p => p + 1)} className="px-3 py-1.5 rounded border border-gray-200 disabled:opacity-40">Next</button>
                                    </div>
                                </div>
                            </div>
                        </>
                    )}
                </>
            )}
        </div>
    )
}
