import React, { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'react-hot-toast'
import { useAuth } from '../../Context/AuthContext'
import AccountsTabs from './components/AccountsTabs'
import { cashClosingAPI, expenseAPI, money, errMsg, todayYmd, cashVariance } from '../../utils/accountsApi'

const inputCls = 'w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-[14px] focus:outline-none focus:border-orange-500'
const labelCls = 'block text-[12px] font-semibold text-gray-600 mb-1'
const btnCls = 'px-4 py-2 rounded-lg text-[14px] font-semibold bg-orange-500 text-white hover:bg-orange-600 disabled:opacity-50'

const varianceCls = (v) => (v === null || v === undefined ? 'text-gray-500' : v === 0 ? 'text-green-600' : 'text-red-600')

function Stat({ label, value, testId }) {
    return (
        <div className="bg-white border border-gray-200 rounded-xl p-3">
            <div className="text-[12px] text-gray-500">{label}</div>
            <div className="text-[18px] font-bold text-[#1A181B]" data-testid={testId}>{value}</div>
        </div>
    )
}

export default function CashClosing() {
    const { user } = useAuth()
    const qc = useQueryClient()
    const isAdmin = user?.role === 'admin'
    const [date, setDate] = useState(todayYmd())
    const [opening, setOpening] = useState('')
    const [counted, setCounted] = useState('')
    const [notes, setNotes] = useState('')
    const [busy, setBusy] = useState(false)
    const [amend, setAmend] = useState({ countedCash: '', reason: '' })
    const [exp, setExp] = useState({ amount: '', category: '', method: 'cash', note: '' })

    const preview = useQuery({
        queryKey: ['admin', 'cash-closing', 'preview', date],
        queryFn: async () => (await cashClosingAPI.preview({ businessDate: date })).data,
    })
    const history = useQuery({
        queryKey: ['admin', 'cash-closing', 'history'],
        queryFn: async () => (await cashClosingAPI.list({})).data.closings || [],
    })
    const expenses = useQuery({
        queryKey: ['admin', 'cash-closing', 'expenses', date],
        queryFn: async () => (await expenseAPI.list({ from: date, to: date })).data.expenses || [],
    })

    const p = preview.data
    // A closed day shows the stored snapshot, not today's live figures.
    const v = p ? (p.status === 'closed' ? p.closing : p) : null
    const refresh = () => qc.invalidateQueries({ queryKey: ['admin', 'cash-closing'] })
    const run = async (fn, okMsg) => {
        setBusy(true)
        try { await fn(); toast.success(okMsg); refresh() } catch (err) { toast.error(errMsg(err, 'Something went wrong')) } finally { setBusy(false) }
    }

    // Opening cash shown while the day is not yet saved comes from the typed value.
    const openingForPreview = p?.status === 'none' && opening !== '' ? Number(opening) : (p?.openingCash ?? 0)
    const expected = p ? Math.round((openingForPreview + p.cashSales - p.cashRefunds - p.cashPaidOuts) * 100) / 100 : 0
    const liveVariance = cashVariance(expected, counted)

    return (
        <div className="max-w-[1100px] mx-auto px-4 md:px-6 py-6 font-manrope">
            <h1 className="text-[22px] font-bold text-[#1A181B]">Accounts</h1>
            <p className="text-[13px] text-gray-500 mb-4">Daily cash drawer: what you should have, what you counted, and the difference.</p>
            <AccountsTabs />

            <div className="flex flex-wrap items-end gap-3 mb-4">
                <div>
                    <label className={labelCls} htmlFor="cc-date">Business date</label>
                    <input id="cc-date" type="date" className={inputCls} value={date} max={todayYmd()} onChange={e => setDate(e.target.value)} />
                </div>
                {p && <span className="px-3 py-1 rounded-full text-[12px] font-bold bg-gray-100 text-gray-700" data-testid="cc-status">{p.status === 'none' ? 'Not opened' : p.status}</span>}
            </div>

            {preview.isError && <div className="text-red-600 text-[13px] mb-3">Could not load the day.</div>}

            {p && (
                <>
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
                        <Stat label="Opening cash" value={money(v.openingCash !== undefined && p.status === 'closed' ? v.openingCash : openingForPreview)} testId="cc-opening" />
                        <Stat label="Cash sales" value={money(v.cashSales)} testId="cc-sales" />
                        <Stat label="Cash refunds" value={money(v.cashRefunds)} testId="cc-refunds" />
                        <Stat label="Pay-outs" value={money(v.cashPaidOuts)} testId="cc-payouts" />
                        <Stat label="Expected in drawer" value={money(p.status === 'closed' ? p.expectedCash : expected)} testId="cc-expected" />
                    </div>

                    {p.status === 'closed' ? (
                        <div className="bg-white border border-gray-200 rounded-xl p-4 mb-4">
                            <div className="text-[14px]">Counted <b>{money(p.closing.countedCash)}</b> - variance{' '}
                                <b className={varianceCls(p.closing.variance)} data-testid="cc-variance">{money(p.closing.variance)}</b>
                            </div>
                            {p.closing.notes && <div className="text-[13px] text-gray-500 mt-1">{p.closing.notes}</div>}
                            {isAdmin && (
                                <form className="mt-4 grid md:grid-cols-3 gap-3 items-end" onSubmit={e => {
                                    e.preventDefault()
                                    run(() => cashClosingAPI.amend(p.closing._id, { countedCash: Number(amend.countedCash), reason: amend.reason }), 'Closing amended')
                                }}>
                                    <div><label className={labelCls} htmlFor="cc-amend-count">Corrected count</label>
                                        <input id="cc-amend-count" type="number" min="0" step="0.01" className={inputCls} value={amend.countedCash} onChange={e => setAmend(a => ({ ...a, countedCash: e.target.value }))} required /></div>
                                    <div><label className={labelCls} htmlFor="cc-amend-reason">Reason (required)</label>
                                        <input id="cc-amend-reason" className={inputCls} value={amend.reason} onChange={e => setAmend(a => ({ ...a, reason: e.target.value }))} required /></div>
                                    <button className={btnCls} disabled={busy || !amend.reason.trim()}>Amend closed day</button>
                                </form>
                            )}
                        </div>
                    ) : (
                        <div className="bg-white border border-gray-200 rounded-xl p-4 mb-4 grid md:grid-cols-4 gap-3 items-end">
                            {p.status === 'none' && (
                                <div><label className={labelCls} htmlFor="cc-opening-in">Opening cash</label>
                                    <input id="cc-opening-in" type="number" min="0" step="0.01" className={inputCls} value={opening} onChange={e => setOpening(e.target.value)} placeholder="0" /></div>
                            )}
                            <div><label className={labelCls} htmlFor="cc-counted">Counted cash</label>
                                <input id="cc-counted" type="number" min="0" step="0.01" className={inputCls} value={counted} onChange={e => setCounted(e.target.value)} /></div>
                            <div><label className={labelCls} htmlFor="cc-notes">Notes</label>
                                <input id="cc-notes" className={inputCls} value={notes} onChange={e => setNotes(e.target.value)} maxLength={500} /></div>
                            <div className="flex gap-2">
                                {p.status === 'none' && (
                                    <button type="button" className={`${btnCls} !bg-gray-700`} disabled={busy}
                                        onClick={() => run(() => cashClosingAPI.open({ businessDate: date, ...(opening !== '' ? { openingCash: Number(opening) } : {}) }), 'Day opened')}>Open day</button>
                                )}
                                <button type="button" className={btnCls} disabled={busy || counted === ''}
                                    onClick={() => run(() => cashClosingAPI.close({ businessDate: date, countedCash: Number(counted), notes, ...(p.status === 'none' && opening !== '' ? { openingCash: Number(opening) } : {}) }), 'Day closed')}>Close day</button>
                            </div>
                            {liveVariance !== null && (
                                <div className="md:col-span-4 text-[13px]">Variance if closed now:{' '}
                                    <b className={varianceCls(liveVariance)} data-testid="cc-live-variance">{money(liveVariance)}</b>
                                    {liveVariance < 0 ? ' (short)' : liveVariance > 0 ? ' (over)' : ''}</div>
                            )}
                        </div>
                    )}
                </>
            )}

            <h2 className="text-[16px] font-bold mt-6 mb-2">Pay-outs and expenses for {date}</h2>
            <form className="grid md:grid-cols-5 gap-3 items-end mb-3" onSubmit={e => {
                e.preventDefault()
                run(async () => {
                    await expenseAPI.create({ ...exp, amount: Number(exp.amount), date: new Date(`${date}T12:00:00`).toISOString() })
                    setExp({ amount: '', category: '', method: 'cash', note: '' })
                }, 'Expense recorded')
            }}>
                <div><label className={labelCls} htmlFor="ex-amount">Amount</label>
                    <input id="ex-amount" type="number" min="0.01" step="0.01" className={inputCls} value={exp.amount} onChange={e => setExp(x => ({ ...x, amount: e.target.value }))} required /></div>
                <div><label className={labelCls} htmlFor="ex-cat">Category</label>
                    <input id="ex-cat" className={inputCls} value={exp.category} onChange={e => setExp(x => ({ ...x, category: e.target.value }))} placeholder="Gas, cleaning, tips..." /></div>
                <div><label className={labelCls} htmlFor="ex-method">Paid by</label>
                    <select id="ex-method" className={inputCls} value={exp.method} onChange={e => setExp(x => ({ ...x, method: e.target.value }))}>
                        <option value="cash">Cash (from drawer)</option><option value="upi">UPI</option><option value="bank-transfer">Bank transfer</option><option value="card">Card</option><option value="other">Other</option>
                    </select></div>
                <div><label className={labelCls} htmlFor="ex-note">Note</label>
                    <input id="ex-note" className={inputCls} value={exp.note} onChange={e => setExp(x => ({ ...x, note: e.target.value }))} /></div>
                <button className={btnCls} disabled={busy}>Add expense</button>
            </form>
            <ul className="text-[13px] mb-6">
                {(expenses.data || []).map(x => <li key={x._id} className="py-1 border-b border-gray-100">{x.category} - {money(x.amount)} ({x.method}){x.note ? ` - ${x.note}` : ''}</li>)}
                {expenses.data?.length === 0 && <li className="text-gray-400">No expenses recorded for this day.</li>}
            </ul>

            <h2 className="text-[16px] font-bold mb-2">History</h2>
            <div className="overflow-x-auto bg-white border border-gray-200 rounded-xl">
                <table className="w-full text-[13px]">
                    <thead><tr className="text-left text-gray-500 border-b"><th className="p-2">Date</th><th className="p-2">Status</th><th className="p-2 text-right">Expected</th><th className="p-2 text-right">Counted</th><th className="p-2 text-right">Variance</th><th className="p-2">Edits</th></tr></thead>
                    <tbody>
                        {(history.data || []).map(c => (
                            <tr key={c._id} className="border-b border-gray-100" data-testid="cc-history-row">
                                <td className="p-2">{c.businessDate}</td>
                                <td className="p-2">{c.status}</td>
                                <td className="p-2 text-right">{money(c.expectedCash)}</td>
                                <td className="p-2 text-right">{c.countedCash === null ? '-' : money(c.countedCash)}</td>
                                <td className={`p-2 text-right font-semibold ${varianceCls(c.variance)}`}>{c.variance === null ? '-' : money(c.variance)}</td>
                                <td className="p-2">{c.edits?.length ? `${c.edits.length} (last: ${c.edits[c.edits.length - 1].reason})` : ''}</td>
                            </tr>
                        ))}
                        {history.data?.length === 0 && <tr><td colSpan={6} className="p-4 text-center text-gray-400">No closings yet.</td></tr>}
                    </tbody>
                </table>
            </div>
        </div>
    )
}
