import React, { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import api from '../../utils/api'
import { useAuth } from '../../Context/AuthContext'

export const AUDIT_ACTIONS = [
    'order.cancel', 'order.void', 'order.discount', 'order.price_edit', 'order.refund',
    'bill.edit', 'bill.finalize',
    'staff.create', 'staff.deactivate', 'staff.role_change', 'staff.permission_change',
    'settings.change', 'menu.price_change', 'other',
]

const EMPTY = { from: '', to: '', action: '', actorId: '', entityType: '', entityId: '' }

// Only non-empty filters go on the wire.
export function buildAuditParams(filters, page, limit) {
    const params = { page, limit }
    for (const [k, v] of Object.entries(filters)) {
        if (typeof v === 'string' && v.trim()) params[k] = v.trim()
    }
    return params
}

const fmt = (iso) => (iso ? new Date(iso).toLocaleString() : '')
const pretty = (v) => (v === null || v === undefined ? '-' : JSON.stringify(v, null, 2))

export default function AuditLog() {
    const { user } = useAuth()
    const isManager = user?.role === 'manager'
    const [filters, setFilters] = useState(EMPTY)
    const [applied, setApplied] = useState(EMPTY)
    const [page, setPage] = useState(1)
    const [selected, setSelected] = useState(null)
    const [exporting, setExporting] = useState(false)
    const limit = 25

    const { data, isLoading, isError, error } = useQuery({
        queryKey: ['admin', 'audit', applied, page],
        queryFn: async () => (await api.get('/audit', { params: buildAuditParams(applied, page, limit) })).data,
        keepPreviousData: true,
    })

    const rows = data?.rows || []
    const pages = data?.pages || 1

    const set = (k) => (e) => setFilters((f) => ({ ...f, [k]: e.target.value }))
    const apply = (e) => { e?.preventDefault(); setPage(1); setApplied(filters) }
    const reset = () => { setFilters(EMPTY); setApplied(EMPTY); setPage(1) }

    const downloadCsv = async () => {
        setExporting(true)
        try {
            const res = await api.get('/audit/export', { params: buildAuditParams(applied, 1, limit), responseType: 'blob' })
            const url = URL.createObjectURL(res.data)
            const a = document.createElement('a')
            a.href = url
            a.download = `audit-log-${new Date().toISOString().slice(0, 10)}.csv`
            document.body.appendChild(a)
            a.click()
            a.remove()
            URL.revokeObjectURL(url)
        } finally {
            setExporting(false)
        }
    }

    const input = 'border border-gray-300 rounded-lg px-3 py-2 text-[13px] bg-white'

    return (
        <div className="max-w-[1400px] mx-auto px-4 md:px-6 py-6 font-manrope" data-testid="audit-log-page">
            <h1 className="text-[22px] font-bold text-[#1A181B]">Audit Log</h1>
            <p className="text-[13px] text-gray-500 mb-5">
                {isManager
                    ? 'Sensitive actions you performed: cancellations, discounts, refunds, bill and menu price edits.'
                    : 'Sensitive actions by your team: cancellations, discounts, refunds, bill edits, staff, settings and menu prices.'}
            </p>

            <form onSubmit={apply} className="flex flex-wrap items-end gap-3 mb-4" aria-label="Audit filters">
                <label className="text-[12px] text-gray-600 flex flex-col gap-1">From
                    <input type="date" className={input} value={filters.from} onChange={set('from')} aria-label="From date" />
                </label>
                <label className="text-[12px] text-gray-600 flex flex-col gap-1">To
                    <input type="date" className={input} value={filters.to} onChange={set('to')} aria-label="To date" />
                </label>
                <label className="text-[12px] text-gray-600 flex flex-col gap-1">Action
                    <select className={input} value={filters.action} onChange={set('action')} aria-label="Action">
                        <option value="">All actions</option>
                        {AUDIT_ACTIONS.map((a) => <option key={a} value={a}>{a}</option>)}
                    </select>
                </label>
                {!isManager && (
                    <label className="text-[12px] text-gray-600 flex flex-col gap-1">Actor id
                        <input className={input} value={filters.actorId} onChange={set('actorId')} placeholder="User id" aria-label="Actor id" />
                    </label>
                )}
                <label className="text-[12px] text-gray-600 flex flex-col gap-1">Entity type
                    <input className={input} value={filters.entityType} onChange={set('entityType')} placeholder="order, staff..." aria-label="Entity type" />
                </label>
                <label className="text-[12px] text-gray-600 flex flex-col gap-1">Entity id
                    <input className={input} value={filters.entityId} onChange={set('entityId')} placeholder="Order id..." aria-label="Entity id" />
                </label>
                <button type="submit" className="px-4 py-2 rounded-lg bg-[#FE8301] text-white text-[13px] font-semibold">Apply</button>
                <button type="button" onClick={reset} className="px-4 py-2 rounded-lg border border-gray-300 text-[13px]">Reset</button>
                <button type="button" onClick={downloadCsv} disabled={exporting} className="px-4 py-2 rounded-lg border border-gray-300 text-[13px] ml-auto disabled:opacity-50">
                    {exporting ? 'Preparing...' : 'Download CSV'}
                </button>
            </form>

            {isError && (
                <div className="p-4 rounded-lg bg-red-50 text-red-700 text-[13px]" role="alert">
                    {error?.response?.data?.message || 'Could not load the audit log.'}
                </div>
            )}

            <div className="overflow-x-auto border border-gray-200 rounded-xl bg-white">
                <table className="w-full text-[13px]">
                    <thead className="bg-gray-50 text-left text-gray-600">
                        <tr>
                            <th className="px-3 py-2">When</th>
                            <th className="px-3 py-2">Action</th>
                            <th className="px-3 py-2">Who</th>
                            <th className="px-3 py-2">Entity</th>
                            <th className="px-3 py-2">Summary</th>
                        </tr>
                    </thead>
                    <tbody>
                        {isLoading && <tr><td colSpan={5} className="px-3 py-6 text-center text-gray-500">Loading...</td></tr>}
                        {!isLoading && !isError && rows.length === 0 && (
                            <tr><td colSpan={5} className="px-3 py-6 text-center text-gray-500" data-testid="audit-empty">No audit entries match.</td></tr>
                        )}
                        {rows.map((r) => (
                            <tr key={r._id} className="border-t border-gray-100 hover:bg-orange-50 cursor-pointer" onClick={() => setSelected(r)} data-testid="audit-row">
                                <td className="px-3 py-2 whitespace-nowrap">{fmt(r.createdAt)}</td>
                                <td className="px-3 py-2 font-semibold">{r.action}</td>
                                <td className="px-3 py-2">{r.actor?.name || '-'} <span className="text-gray-400">{r.actor?.role}</span></td>
                                <td className="px-3 py-2">{r.entityType}{r.entityId ? ` ${r.entityId}` : ''}</td>
                                <td className="px-3 py-2 max-w-[420px] truncate">{r.summary}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            <div className="flex items-center justify-between mt-3 text-[13px] text-gray-600">
                <span>{data ? `${data.total} entries` : ''}</span>
                <div className="flex items-center gap-2">
                    <button type="button" className="px-3 py-1 border rounded disabled:opacity-40" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</button>
                    <span>Page {page} of {pages}</span>
                    <button type="button" className="px-3 py-1 border rounded disabled:opacity-40" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>Next</button>
                </div>
            </div>

            {selected && (
                <div className="fixed inset-0 z-50 flex justify-end bg-black/30" onClick={() => setSelected(null)}>
                    <aside className="w-full max-w-[520px] h-full bg-white p-5 overflow-y-auto" role="dialog" aria-label="Audit entry detail" data-testid="audit-drawer" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-start justify-between mb-3">
                            <h2 className="text-[17px] font-bold">{selected.action}</h2>
                            <button type="button" aria-label="Close" className="text-[20px] leading-none" onClick={() => setSelected(null)}>x</button>
                        </div>
                        <p className="text-[13px] text-gray-700 mb-3">{selected.summary}</p>
                        <dl className="text-[12px] text-gray-600 grid grid-cols-[100px_1fr] gap-y-1 mb-4">
                            <dt>When</dt><dd>{fmt(selected.createdAt)}</dd>
                            <dt>Who</dt><dd>{selected.actor?.name || '-'} ({selected.actor?.role || '-'})</dd>
                            <dt>Entity</dt><dd>{selected.entityType} {selected.entityId}</dd>
                            <dt>IP</dt><dd>{selected.ip || '-'}</dd>
                        </dl>
                        <h3 className="text-[13px] font-semibold mb-1">Before</h3>
                        <pre className="bg-gray-50 rounded p-3 text-[12px] overflow-x-auto mb-3" data-testid="audit-before">{pretty(selected.before)}</pre>
                        <h3 className="text-[13px] font-semibold mb-1">After</h3>
                        <pre className="bg-gray-50 rounded p-3 text-[12px] overflow-x-auto" data-testid="audit-after">{pretty(selected.after)}</pre>
                    </aside>
                </div>
            )}
        </div>
    )
}
