import React, { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'react-hot-toast'
import AccountsTabs from './components/AccountsTabs'
import { ledgerAPI, money, errMsg, todayYmd } from '../../utils/accountsApi'

const inputCls = 'w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-[14px] focus:outline-none focus:border-orange-500'
const labelCls = 'block text-[12px] font-semibold text-gray-600 mb-1'
const btnCls = 'px-4 py-2 rounded-lg text-[14px] font-semibold bg-orange-500 text-white hover:bg-orange-600 disabled:opacity-50'

const monthStart = () => `${todayYmd().slice(0, 8)}01`

function PnlRow({ label, value, bold, testId }) {
    return (
        <div className={`flex justify-between py-1.5 border-b border-gray-100 ${bold ? 'font-bold' : ''}`}>
            <span>{label}</span><span data-testid={testId}>{money(value)}</span>
        </div>
    )
}

export default function Ledger() {
    const qc = useQueryClient()
    const [range, setRange] = useState({ from: monthStart(), to: todayYmd() })
    const [openCode, setOpenCode] = useState(null)
    const [busy, setBusy] = useState(false)

    const tb = useQuery({
        queryKey: ['admin', 'ledger', 'tb', range],
        queryFn: async () => (await ledgerAPI.trialBalance(range)).data,
    })
    const pnl = useQuery({
        queryKey: ['admin', 'ledger', 'pnl', range],
        queryFn: async () => (await ledgerAPI.pnl(range)).data,
    })
    const acct = useQuery({
        queryKey: ['admin', 'ledger', 'account', openCode, range],
        queryFn: async () => (await ledgerAPI.accountLedger(openCode, range)).data,
        enabled: !!openCode,
    })

    const postRange = async () => {
        setBusy(true)
        try {
            const r = (await ledgerAPI.postDay(range)).data
            toast.success(`Posted ${r.inserted} new ledger lines`)
            qc.invalidateQueries({ queryKey: ['admin', 'ledger'] })
        } catch (err) { toast.error(errMsg(err, 'Could not post the period (max 31 days)')) } finally { setBusy(false) }
    }

    const p = pnl.data
    return (
        <div className="max-w-[1100px] mx-auto px-4 md:px-6 py-6 font-manrope">
            <h1 className="text-[22px] font-bold text-[#1A181B]">Accounts</h1>
            <p className="text-[13px] text-gray-500 mb-4">A simple ledger built from sales, refunds, expenses and supplier bills.</p>
            <AccountsTabs />

            <div className="flex flex-wrap items-end gap-3 mb-4">
                <div><label className={labelCls} htmlFor="lg-from">From</label>
                    <input id="lg-from" type="date" className={inputCls} value={range.from} max={range.to} onChange={e => setRange(r => ({ ...r, from: e.target.value }))} /></div>
                <div><label className={labelCls} htmlFor="lg-to">To</label>
                    <input id="lg-to" type="date" className={inputCls} value={range.to} min={range.from} max={todayYmd()} onChange={e => setRange(r => ({ ...r, to: e.target.value }))} /></div>
                <button className={btnCls} disabled={busy} onClick={postRange}>Post this period to ledger</button>
            </div>

            {p && (
                <div className="grid md:grid-cols-2 gap-6 mb-6">
                    <div className="bg-white border border-gray-200 rounded-xl p-4" data-testid="pnl">
                        <h2 className="text-[16px] font-bold mb-2">Profit and loss</h2>
                        {p.income.map(r => <PnlRow key={r.code} label={r.name} value={r.balance} />)}
                        <PnlRow label="Total income" value={p.totalIncome} bold testId="pnl-income" />
                        <PnlRow label="Purchases / COGS" value={p.cogs} testId="pnl-cogs" />
                        <PnlRow label="Gross profit" value={p.grossProfit} bold testId="pnl-gross" />
                        {p.expenses.map(r => <PnlRow key={r.code} label={r.name} value={r.balance} />)}
                        <PnlRow label="Net profit" value={p.netProfit} bold testId="pnl-net" />
                        <p className="text-[11px] text-gray-400 mt-2">{p.note}</p>
                    </div>
                    {tb.data && (
                        <div className="bg-white border border-gray-200 rounded-xl p-4">
                            <h2 className="text-[16px] font-bold mb-2">Trial balance {tb.data.balanced ? '' : '(OUT OF BALANCE)'}</h2>
                            <table className="w-full text-[13px]">
                                <thead><tr className="text-left text-gray-500 border-b"><th className="py-1">Account</th><th className="text-right">Debit</th><th className="text-right">Credit</th></tr></thead>
                                <tbody>
                                    {tb.data.rows.filter(r => r.debit || r.credit).map(r => (
                                        <tr key={r.code} className="border-b border-gray-100 cursor-pointer hover:bg-gray-50" data-testid="tb-row" onClick={() => setOpenCode(r.code === openCode ? null : r.code)}>
                                            <td className="py-1">{r.code} {r.name}</td><td className="text-right">{money(r.debit)}</td><td className="text-right">{money(r.credit)}</td>
                                        </tr>
                                    ))}
                                    <tr className="font-bold"><td className="py-1">Total</td><td className="text-right" data-testid="tb-debit">{money(tb.data.totals.debit)}</td><td className="text-right" data-testid="tb-credit">{money(tb.data.totals.credit)}</td></tr>
                                </tbody>
                            </table>
                            {tb.data.rows.every(r => !r.debit && !r.credit) && <p className="text-[12px] text-gray-400 mt-2">Nothing posted for this period yet. Use "Post this period to ledger".</p>}
                        </div>
                    )}
                </div>
            )}

            {openCode && acct.data && (
                <div className="bg-white border border-gray-200 rounded-xl p-4" data-testid="account-ledger">
                    <h2 className="text-[16px] font-bold mb-2">{acct.data.account.code} {acct.data.account.name}</h2>
                    <div className="text-[12px] text-gray-500 mb-2">Opening {money(acct.data.openingBalance)} - closing {money(acct.data.closingBalance)}</div>
                    <table className="w-full text-[13px]">
                        <thead><tr className="text-left text-gray-500 border-b"><th className="py-1">Date</th><th>Narration</th><th className="text-right">Debit</th><th className="text-right">Credit</th><th className="text-right">Balance</th></tr></thead>
                        <tbody>
                            {acct.data.entries.map(e => (
                                <tr key={e._id} className="border-b border-gray-100"><td className="py-1">{e.businessDate}</td><td>{e.narration}</td><td className="text-right">{e.debit ? money(e.debit) : ''}</td><td className="text-right">{e.credit ? money(e.credit) : ''}</td><td className="text-right">{money(e.balance)}</td></tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    )
}
