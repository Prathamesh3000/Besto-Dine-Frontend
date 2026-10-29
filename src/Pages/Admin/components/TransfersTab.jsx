import React, { useState, useEffect, useCallback } from 'react'
import { toast } from 'react-hot-toast'
import { transferAPI } from '../../../utils/transferApi'

const STATUS_CLS = {
    draft: 'bg-gray-100 text-gray-600',
    in_transit: 'bg-amber-50 text-amber-700',
    received: 'bg-green-50 text-green-700',
    cancelled: 'bg-red-50 text-red-600',
}
const btn = 'px-3 py-2 rounded-lg text-[13px] font-semibold disabled:opacity-50'
const money = (n) => `₹${(Math.round((Number(n) || 0) * 100) / 100).toLocaleString('en-IN')}`
const fmt = (d) => (d ? new Date(d).toLocaleString('en-IN') : '')
const errMsg = (err, fallback) => err.response?.data?.message || fallback

// Transfers between branches (create draft, send, receive, cancel) plus a
// simple stock valuation table (stock on hand x weighted-average cost).
const TransfersTab = () => {
    const [view, setView] = useState('transfers')
    const [list, setList] = useState([])
    const [loading, setLoading] = useState(true)
    const [branches, setBranches] = useState([])
    const [busy, setBusy] = useState(false)
    const [current, setCurrent] = useState(null)       // open transfer
    const [received, setReceived] = useState({})        // lineId -> typed received qty
    const [creating, setCreating] = useState(false)
    const [form, setForm] = useState({ fromBranch: '', toBranch: '', note: '', lines: [] })
    const [items, setItems] = useState([])
    const [pick, setPick] = useState({ item: '', qty: '' })
    const [valuation, setValuation] = useState(null)

    const loadList = useCallback(async () => {
        setLoading(true)
        try {
            const [t, b] = await Promise.all([transferAPI.list(), transferAPI.branches()])
            setList(t.data.transfers || [])
            setBranches(b.data.data || [])
        } catch (err) { toast.error(errMsg(err, 'Failed to load transfers')) }
        finally { setLoading(false) }
    }, [])

    useEffect(() => { loadList() }, [loadList])

    useEffect(() => {
        if (view !== 'valuation') return
        transferAPI.valuation({ branch: 'all' })
            .then((res) => setValuation(res.data))
            .catch((err) => toast.error(errMsg(err, 'Failed to load valuation')))
    }, [view])

    useEffect(() => {
        if (!form.fromBranch) { setItems([]); return }
        transferAPI.items(form.fromBranch)
            .then((res) => setItems(res.data.items || []))
            .catch(() => setItems([]))
    }, [form.fromBranch])

    const bname = (id) => { const b = branches.find((x) => x._id === id); return b ? (b.displayLabel || b.name) : '' }

    const run = async (fn, okMsg) => {
        setBusy(true)
        try { await fn(); if (okMsg) toast.success(okMsg); loadList() }
        catch (err) {
            const shortages = err.response?.data?.shortages
            toast.error(shortages?.length
                ? `Not enough stock: ${shortages.map((s) => s.name).join(', ')}`
                : errMsg(err, 'Action failed'))
        } finally { setBusy(false) }
    }

    const addLine = () => {
        const it = items.find((i) => i._id === pick.item)
        const qty = Number(pick.qty)
        if (!it || !(qty > 0)) { toast.error('Choose an item and a quantity above zero'); return }
        if (form.lines.some((l) => l.item === it._id)) { toast.error('Item already added'); return }
        setForm((f) => ({ ...f, lines: [...f.lines, { item: it._id, name: it.name, unit: it.unit, qty }] }))
        setPick({ item: '', qty: '' })
    }

    const createDraft = () => run(async () => {
        const res = await transferAPI.create({
            fromBranch: form.fromBranch, toBranch: form.toBranch, note: form.note,
            lines: form.lines.map((l) => ({ item: l.item, qty: l.qty })),
        })
        setCreating(false)
        setForm({ fromBranch: '', toBranch: '', note: '', lines: [] })
        setCurrent(res.data.transfer)
    }, 'Draft created')

    const apply = (call, okMsg) => run(async () => {
        const res = await call()
        setCurrent(res.data.transfer)
    }, okMsg)

    const onReceive = () => apply(() => transferAPI.receive(current._id, {
        lines: current.lines
            .filter((l) => l.outAppliedAt && !l.inAppliedAt && !l.returnedAt)
            .map((l) => ({ lineId: l._id, receivedQty: received[l._id] === undefined || received[l._id] === '' ? l.qty : Number(received[l._id]) })),
    }), 'Transfer received')

    const tabBtn = (id, label) => (
        <button key={id} className={`${btn} ${view === id ? 'bg-[#FE8301] text-white' : 'bg-gray-100'}`} onClick={() => setView(id)}>{label}</button>
    )

    const header = (
        <div className="flex items-center gap-2 mb-3">
            {tabBtn('transfers', 'Transfers')}
            {tabBtn('valuation', 'Valuation')}
        </div>
    )

    if (view === 'valuation') {
        return (
            <div className="p-4" data-testid="valuation-view">
                {header}
                {!valuation ? <p className="text-gray-500 text-[13px]">Loading…</p> : (
                    <>
                        <p className="text-[14px] mb-2">
                            Stock value at average cost: <b data-testid="valuation-total">{money(valuation.totals.value)}</b>
                            {valuation.totals.unknownCostItems > 0 && (
                                <span className="text-amber-700 ml-2" data-testid="valuation-unknown">
                                    {valuation.totals.unknownCostItems} item(s) have no average cost yet (not counted; {money(valuation.totals.unknownCostListValue)} at list cost)
                                </span>
                            )}
                        </p>
                        <table className="w-full text-[13px] bg-white rounded-xl border border-gray-100 mb-4">
                            <thead><tr className="text-left text-gray-500 border-b border-gray-100">
                                <th className="p-2">Branch</th><th className="p-2">Items</th><th className="p-2">Value</th>
                            </tr></thead>
                            <tbody>{valuation.byBranch.map((b) => (
                                <tr key={b.key} className="border-b border-gray-50"><td className="p-2">{b.label}</td><td className="p-2">{b.items}</td><td className="p-2">{money(b.value)}</td></tr>
                            ))}</tbody>
                        </table>
                        <table className="w-full text-[13px] bg-white rounded-xl border border-gray-100">
                            <thead><tr className="text-left text-gray-500 border-b border-gray-100">
                                <th className="p-2">Item</th><th className="p-2">Category</th><th className="p-2">On hand</th><th className="p-2">Avg cost</th><th className="p-2">Value</th>
                            </tr></thead>
                            <tbody>{valuation.byItem.map((r) => (
                                <tr key={r._id} className="border-b border-gray-50">
                                    <td className="p-2">{r.name}</td>
                                    <td className="p-2 text-gray-500">{r.category}</td>
                                    <td className="p-2">{r.currentStock} {r.unit}</td>
                                    <td className="p-2">{r.unknownCost ? <span className="text-amber-700">unknown</span> : money(r.avgCost)}</td>
                                    <td className="p-2">{r.unknownCost ? '—' : money(r.value)}</td>
                                </tr>
                            ))}</tbody>
                        </table>
                    </>
                )}
            </div>
        )
    }

    if (creating) {
        const ok = form.fromBranch && form.toBranch && form.fromBranch !== form.toBranch && form.lines.length > 0
        return (
            <div className="p-4" data-testid="transfer-form">
                {header}
                <h2 className="font-bold text-[16px] mb-3">New transfer</h2>
                <div className="flex gap-3 mb-3">
                    <label className="text-[13px]">From
                        <select aria-label="From branch" className="block mt-1 px-2 py-1 border border-gray-200 rounded" value={form.fromBranch}
                            onChange={(e) => setForm({ ...form, fromBranch: e.target.value, lines: [] })}>
                            <option value="">Select…</option>
                            {branches.map((b) => <option key={b._id} value={b._id}>{b.displayLabel || b.name}</option>)}
                        </select>
                    </label>
                    <label className="text-[13px]">To
                        <select aria-label="To branch" className="block mt-1 px-2 py-1 border border-gray-200 rounded" value={form.toBranch}
                            onChange={(e) => setForm({ ...form, toBranch: e.target.value })}>
                            <option value="">Select…</option>
                            {branches.filter((b) => b._id !== form.fromBranch).map((b) => <option key={b._id} value={b._id}>{b.displayLabel || b.name}</option>)}
                        </select>
                    </label>
                </div>
                <div className="flex gap-2 mb-3 items-end">
                    <select aria-label="Item" className="px-2 py-1 border border-gray-200 rounded" value={pick.item} onChange={(e) => setPick({ ...pick, item: e.target.value })}>
                        <option value="">Item…</option>
                        {items.map((i) => <option key={i._id} value={i._id}>{i.name} ({i.currentStock} {i.unit})</option>)}
                    </select>
                    <input aria-label="Quantity" type="number" min="0" step="any" className="w-24 px-2 py-1 border border-gray-200 rounded" value={pick.qty} onChange={(e) => setPick({ ...pick, qty: e.target.value })} />
                    <button className={`${btn} bg-gray-100`} onClick={addLine}>Add</button>
                </div>
                <ul className="mb-3 text-[13px]">
                    {form.lines.map((l) => <li key={l.item}>{l.name}: {l.qty} {l.unit}</li>)}
                </ul>
                <input aria-label="Note" placeholder="Note (optional)" className="w-full max-w-md px-2 py-1 border border-gray-200 rounded mb-3" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
                <div className="flex gap-2">
                    <button className={`${btn} bg-gray-100`} onClick={() => setCreating(false)}>Back</button>
                    <button className={`${btn} bg-[#FE8301] text-white`} disabled={busy || !ok} onClick={createDraft}>Create draft</button>
                </div>
            </div>
        )
    }

    if (current) {
        const pending = current.lines.filter((l) => l.outAppliedAt && !l.inAppliedAt && !l.returnedAt)
        return (
            <div className="p-4" data-testid="transfer-detail">
                {header}
                <div className="flex items-center gap-3 mb-3">
                    <button className={`${btn} bg-gray-100`} onClick={() => { setCurrent(null); loadList() }}>Back</button>
                    <h2 className="font-bold text-[16px]">{current.number}</h2>
                    <span className="text-[13px] text-gray-600">{current.fromName || bname(current.fromBranch)} to {current.toName || bname(current.toBranch)}</span>
                    <span className={`px-2 py-0.5 rounded-full text-[12px] font-semibold ${STATUS_CLS[current.status]}`}>{current.status.replace('_', ' ')}</span>
                    <div className="ml-auto flex gap-2">
                        {current.status === 'draft' && <button className={`${btn} bg-[#FE8301] text-white`} disabled={busy} onClick={() => apply(() => transferAPI.send(current._id), 'Transfer sent')}>Send</button>}
                        {current.status === 'in_transit' && pending.length > 0 && <button className={`${btn} bg-green-600 text-white`} disabled={busy} onClick={onReceive}>Receive</button>}
                        {['draft', 'in_transit'].includes(current.status) && <button className={`${btn} bg-red-50 text-red-600`} disabled={busy} onClick={() => apply(() => transferAPI.cancel(current._id), 'Transfer cancelled')}>Cancel</button>}
                    </div>
                </div>
                <table className="w-full text-[13px] bg-white rounded-xl border border-gray-100">
                    <thead><tr className="text-left text-gray-500 border-b border-gray-100">
                        <th className="p-2">Item</th><th className="p-2">Sent</th><th className="p-2">Received</th><th className="p-2">Shortfall</th>
                    </tr></thead>
                    <tbody>{current.lines.map((l) => {
                        const canType = current.status === 'in_transit' && l.outAppliedAt && !l.inAppliedAt && !l.returnedAt
                        return (
                            <tr key={l._id} className="border-b border-gray-50">
                                <td className="p-2">{l.itemName}</td>
                                <td className="p-2">{l.qty} {l.unit}</td>
                                <td className="p-2">
                                    {canType ? (
                                        <input aria-label={`Received for ${l.itemName}`} type="number" min="0" max={l.qty} step="any" className="w-24 px-2 py-1 border border-gray-200 rounded"
                                            value={received[l._id] ?? String(l.qty)} onChange={(e) => setReceived((r) => ({ ...r, [l._id]: e.target.value }))} />
                                    ) : (l.receivedQty ?? '—')}
                                </td>
                                <td className="p-2 text-red-600" data-testid={`shortfall-${l._id}`}>{l.shortfallQty > 0 ? l.shortfallQty : ''}</td>
                            </tr>
                        )
                    })}</tbody>
                </table>
            </div>
        )
    }

    return (
        <div className="p-4" data-testid="transfer-list">
            {header}
            <div className="flex items-center mb-3">
                <h2 className="font-bold text-[16px]">Branch transfers</h2>
                <button className={`${btn} bg-[#FE8301] text-white ml-auto`} onClick={() => setCreating(true)}>New transfer</button>
            </div>
            {loading ? <p className="text-gray-500 text-[13px]">Loading…</p> : list.length === 0 ? (
                <p className="text-gray-500 text-[13px]">No transfers yet. Move stock between your branches with a transfer.</p>
            ) : (
                <div className="space-y-2">
                    {list.map((t) => (
                        <button key={t._id} onClick={() => setCurrent(t)} className="w-full text-left bg-white border border-gray-100 rounded-xl p-3 flex items-center gap-3 hover:bg-gray-50">
                            <span className="font-semibold text-[14px]">{t.number}</span>
                            <span className="text-[13px] text-gray-600">{t.fromName} to {t.toName}</span>
                            <span className={`px-2 py-0.5 rounded-full text-[12px] font-semibold ${STATUS_CLS[t.status]}`}>{t.status.replace('_', ' ')}</span>
                            <span className="text-[12px] text-gray-500">{t.lines.length} item(s)</span>
                            <span className="ml-auto text-[12px] text-gray-400">{fmt(t.createdAt)}</span>
                        </button>
                    ))}
                </div>
            )}
        </div>
    )
}

export default TransfersTab
