import React, { useState, useEffect, useCallback } from 'react'
import { toast } from 'react-hot-toast'
import { stocktakeAPI } from '../../../utils/api'

const STATUS_CLS = {
    draft: 'bg-gray-100 text-gray-600',
    submitted: 'bg-amber-50 text-amber-700',
    applied: 'bg-green-50 text-green-700',
}
const btn = 'px-3 py-2 rounded-lg text-[13px] font-semibold disabled:opacity-50'
const fmt = (d) => (d ? new Date(d).toLocaleString('en-IN') : '')

// Stocktake: start a count (snapshots expected quantities), enter counted
// quantities (variance shows live), submit, then apply as corrections.
const StocktakeTab = () => {
    const [list, setList] = useState([])
    const [loading, setLoading] = useState(true)
    const [current, setCurrent] = useState(null)   // open stocktake (full, with lines)
    const [drafts, setDrafts] = useState({})        // lineId -> typed count string
    const [busy, setBusy] = useState(false)

    const loadList = useCallback(async () => {
        setLoading(true)
        try {
            const res = await stocktakeAPI.list()
            setList(res.data.stocktakes || [])
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to load stocktakes')
        } finally { setLoading(false) }
    }, [])

    useEffect(() => { loadList() }, [loadList])

    const open = async (id) => {
        try {
            const res = await stocktakeAPI.get(id)
            setCurrent(res.data.stocktake)
            setDrafts({})
        } catch (err) { toast.error(err.response?.data?.message || 'Failed to open stocktake') }
    }

    const start = async () => {
        setBusy(true)
        try {
            const res = await stocktakeAPI.create({ name: `Stocktake ${new Date().toLocaleDateString('en-IN')}` })
            setCurrent(res.data.stocktake)
            setDrafts({})
            loadList()
        } catch (err) { toast.error(err.response?.data?.message || 'Failed to start stocktake') }
        finally { setBusy(false) }
    }

    const typed = (line) => {
        if (drafts[line._id] !== undefined) return drafts[line._id]
        return line.countedQty === null || line.countedQty === undefined ? '' : String(line.countedQty)
    }
    const varianceOf = (line) => {
        const v = typed(line)
        if (v === '' || Number.isNaN(Number(v))) return null
        return Math.round((Number(v) - line.expectedQty) * 1000) / 1000
    }

    const saveCounts = async () => {
        const counts = Object.entries(drafts).map(([line, v]) => ({ line, countedQty: v === '' ? null : Number(v) }))
        if (counts.length === 0) return current
        const res = await stocktakeAPI.setCounts(current._id, counts)
        setCurrent(res.data.stocktake)
        setDrafts({})
        return res.data.stocktake
    }

    const run = async (fn, okMsg) => {
        setBusy(true)
        try { await fn(); if (okMsg) toast.success(okMsg); loadList() }
        catch (err) { toast.error(err.response?.data?.message || 'Action failed') }
        finally { setBusy(false) }
    }

    const onSave = () => run(saveCounts, 'Counts saved')
    const onSubmit = () => run(async () => {
        await saveCounts()
        const res = await stocktakeAPI.submit(current._id)
        setCurrent(res.data.stocktake)
    }, 'Stocktake submitted')
    const onApply = () => run(async () => {
        const res = await stocktakeAPI.apply(current._id)
        setCurrent(res.data.stocktake)
        if (res.data.failed?.length) toast.error(`${res.data.failed.length} line(s) could not be applied`)
    }, 'Corrections applied')

    if (current) {
        const editable = current.status === 'draft'
        const withVariance = current.lines.filter((l) => l.variance).length
        return (
            <div className="p-4" data-testid="stocktake-detail">
                <div className="flex items-center gap-3 mb-3">
                    <button className={`${btn} bg-gray-100`} onClick={() => { setCurrent(null); loadList() }}>Back</button>
                    <h2 className="font-bold text-[16px]">{current.name || 'Stocktake'}</h2>
                    <span className={`px-2 py-0.5 rounded-full text-[12px] font-semibold ${STATUS_CLS[current.status]}`}>{current.status}</span>
                    <div className="ml-auto flex gap-2">
                        {editable && <button className={`${btn} bg-gray-100`} disabled={busy} onClick={onSave}>Save counts</button>}
                        {editable && <button className={`${btn} bg-[#FE8301] text-white`} disabled={busy} onClick={onSubmit}>Submit</button>}
                        {current.status === 'submitted' && (
                            <button className={`${btn} bg-green-600 text-white`} disabled={busy} onClick={onApply}>
                                Apply {withVariance} correction{withVariance === 1 ? '' : 's'}
                            </button>
                        )}
                    </div>
                </div>
                <table className="w-full text-[13px] bg-white rounded-xl border border-gray-100">
                    <thead>
                        <tr className="text-left text-gray-500 border-b border-gray-100">
                            <th className="p-2">Item</th><th className="p-2">Expected</th><th className="p-2">Counted</th><th className="p-2">Variance</th><th className="p-2">Applied</th>
                        </tr>
                    </thead>
                    <tbody>
                        {current.lines.map((l) => {
                            const v = varianceOf(l)
                            return (
                                <tr key={l._id} className="border-b border-gray-50">
                                    <td className="p-2">{l.itemName} <span className="text-gray-400">{l.itemCode}</span></td>
                                    <td className="p-2">{l.expectedQty} {l.unit}</td>
                                    <td className="p-2">
                                        {editable ? (
                                            <input
                                                aria-label={`Count for ${l.itemName}`}
                                                type="number" min="0" step="any"
                                                className="w-24 px-2 py-1 border border-gray-200 rounded"
                                                value={typed(l)}
                                                onChange={(e) => setDrafts((d) => ({ ...d, [l._id]: e.target.value }))}
                                            />
                                        ) : (l.countedQty ?? '—')}
                                    </td>
                                    <td className={`p-2 font-semibold ${v > 0 ? 'text-green-600' : v < 0 ? 'text-red-600' : 'text-gray-400'}`} data-testid={`variance-${l._id}`}>
                                        {v === null ? '—' : v > 0 ? `+${v}` : String(v)}
                                    </td>
                                    <td className="p-2 text-gray-500">{l.appliedAt ? 'Yes' : l.applyError ? `Failed: ${l.applyError}` : ''}</td>
                                </tr>
                            )
                        })}
                    </tbody>
                </table>
            </div>
        )
    }

    return (
        <div className="p-4" data-testid="stocktake-list">
            <div className="flex items-center mb-3">
                <h2 className="font-bold text-[16px]">Stocktakes</h2>
                <button className={`${btn} bg-[#FE8301] text-white ml-auto`} disabled={busy} onClick={start}>Start count</button>
            </div>
            {loading ? <p className="text-gray-500 text-[13px]">Loading…</p> : list.length === 0 ? (
                <p className="text-gray-500 text-[13px]">No stocktakes yet. Start a count to compare physical stock with the system.</p>
            ) : (
                <div className="space-y-2">
                    {list.map((s) => (
                        <button key={s._id} onClick={() => open(s._id)} className="w-full text-left bg-white border border-gray-100 rounded-xl p-3 flex items-center gap-3 hover:bg-gray-50">
                            <span className="font-semibold text-[14px]">{s.name || 'Stocktake'}</span>
                            <span className={`px-2 py-0.5 rounded-full text-[12px] font-semibold ${STATUS_CLS[s.status]}`}>{s.status}</span>
                            <span className="text-[12px] text-gray-500">{s.countedCount}/{s.lineCount} counted · {s.varianceCount} variance</span>
                            <span className="ml-auto text-[12px] text-gray-400">{fmt(s.createdAt)}</span>
                        </button>
                    ))}
                </div>
            )}
        </div>
    )
}

export default StocktakeTab
