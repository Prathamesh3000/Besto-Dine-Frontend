import React, { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'react-hot-toast'
import AccountsTabs from './components/AccountsTabs'
import { supplierInvoiceAPI, money, errMsg, todayYmd } from '../../utils/accountsApi'

const inputCls = 'w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-[14px] focus:outline-none focus:border-orange-500'
const labelCls = 'block text-[12px] font-semibold text-gray-600 mb-1'
const btnCls = 'px-4 py-2 rounded-lg text-[14px] font-semibold bg-orange-500 text-white hover:bg-orange-600 disabled:opacity-50'
const TABS = [['invoices', 'Invoices'], ['outstanding', 'Outstanding'], ['match', '3-way match']]
const STATUS_CLS = { paid: 'bg-green-100 text-green-700', partial: 'bg-yellow-100 text-yellow-700', unpaid: 'bg-red-100 text-red-700' }
const MATCH_CLS = { matched: 'bg-green-100 text-green-700', mismatch: 'bg-red-100 text-red-700', 'no-invoice': 'bg-yellow-100 text-yellow-700', pending: 'bg-gray-100 text-gray-600' }
const EMPTY_INV = { supplier: '', invoiceNo: '', invoiceDate: todayYmd(), dueDate: '', subtotal: '', tax: '', notes: '' }

export default function SupplierInvoices() {
    const qc = useQueryClient()
    const [tab, setTab] = useState('invoices')
    const [status, setStatus] = useState('')
    const [showAdd, setShowAdd] = useState(false)
    const [form, setForm] = useState(EMPTY_INV)
    const [pay, setPay] = useState(null) // { invoice, amount, method, reference }
    const [busy, setBusy] = useState(false)

    const invoices = useQuery({
        queryKey: ['admin', 'supplier-invoices', 'list', status],
        queryFn: async () => (await supplierInvoiceAPI.list(status ? { status } : {})).data.invoices || [],
        enabled: tab === 'invoices',
    })
    const suppliers = useQuery({
        queryKey: ['admin', 'supplier-invoices', 'suppliers'],
        queryFn: async () => (await supplierInvoiceAPI.suppliers()).data.suppliers || [],
        enabled: showAdd,
    })
    const outstanding = useQuery({
        queryKey: ['admin', 'supplier-invoices', 'outstanding'],
        queryFn: async () => (await supplierInvoiceAPI.outstanding()).data,
        enabled: tab === 'outstanding',
    })
    const match = useQuery({
        queryKey: ['admin', 'supplier-invoices', 'match'],
        queryFn: async () => (await supplierInvoiceAPI.threeWay({})).data,
        enabled: tab === 'match',
    })

    const refresh = () => qc.invalidateQueries({ queryKey: ['admin', 'supplier-invoices'] })
    const run = async (fn, okMsg) => {
        setBusy(true)
        try { await fn(); toast.success(okMsg); refresh(); return true } catch (err) { toast.error(errMsg(err, 'Something went wrong')); return false } finally { setBusy(false) }
    }

    const submitInvoice = async (e) => {
        e.preventDefault()
        const ok = await run(() => supplierInvoiceAPI.create({
            supplier: form.supplier, invoiceNo: form.invoiceNo.trim(),
            invoiceDate: form.invoiceDate, ...(form.dueDate ? { dueDate: form.dueDate } : {}),
            subtotal: Number(form.subtotal), tax: Number(form.tax) || 0, notes: form.notes,
        }), 'Invoice added')
        if (ok) { setForm(EMPTY_INV); setShowAdd(false) }
    }

    const submitPayment = async (e) => {
        e.preventDefault()
        const ok = await run(() => supplierInvoiceAPI.pay(pay.invoice._id, {
            amount: Number(pay.amount), method: pay.method, reference: pay.reference,
        }), 'Payment recorded')
        if (ok) setPay(null)
    }

    return (
        <div className="max-w-[1200px] mx-auto px-4 md:px-6 py-6 font-manrope">
            <h1 className="text-[22px] font-bold text-[#1A181B]">Accounts</h1>
            <p className="text-[13px] text-gray-500 mb-4">Supplier invoices, payments and what you still owe.</p>
            <AccountsTabs />

            <div className="flex gap-2 mb-4">
                {TABS.map(([id, label]) => (
                    <button key={id} className={`px-3 py-1.5 rounded-full text-[13px] font-semibold ${tab === id ? 'bg-orange-500 text-white' : 'bg-gray-100 text-gray-700'}`} onClick={() => setTab(id)}>{label}</button>
                ))}
            </div>

            {tab === 'invoices' && (
                <>
                    <div className="flex flex-wrap items-end gap-3 mb-3">
                        <div>
                            <label className={labelCls} htmlFor="si-status">Status</label>
                            <select id="si-status" className={inputCls} value={status} onChange={e => setStatus(e.target.value)}>
                                <option value="">All</option><option value="unpaid">Unpaid</option><option value="partial">Partly paid</option><option value="paid">Paid</option>
                            </select>
                        </div>
                        <button className={btnCls} onClick={() => setShowAdd(s => !s)}>{showAdd ? 'Cancel' : 'Add invoice'}</button>
                    </div>

                    {showAdd && (
                        <form className="bg-white border border-gray-200 rounded-xl p-4 mb-4 grid md:grid-cols-4 gap-3 items-end" onSubmit={submitInvoice} aria-label="Add supplier invoice">
                            <div><label className={labelCls} htmlFor="si-supplier">Supplier</label>
                                <select id="si-supplier" className={inputCls} value={form.supplier} onChange={e => setForm(f => ({ ...f, supplier: e.target.value }))} required>
                                    <option value="">Select...</option>
                                    {(suppliers.data || []).map(s => <option key={s._id} value={s._id}>{s.name}</option>)}
                                </select></div>
                            <div><label className={labelCls} htmlFor="si-no">Invoice no.</label>
                                <input id="si-no" className={inputCls} value={form.invoiceNo} onChange={e => setForm(f => ({ ...f, invoiceNo: e.target.value }))} required /></div>
                            <div><label className={labelCls} htmlFor="si-date">Invoice date</label>
                                <input id="si-date" type="date" className={inputCls} value={form.invoiceDate} onChange={e => setForm(f => ({ ...f, invoiceDate: e.target.value }))} required /></div>
                            <div><label className={labelCls} htmlFor="si-due">Due date (optional)</label>
                                <input id="si-due" type="date" className={inputCls} value={form.dueDate} onChange={e => setForm(f => ({ ...f, dueDate: e.target.value }))} /></div>
                            <div><label className={labelCls} htmlFor="si-sub">Subtotal</label>
                                <input id="si-sub" type="number" min="0" step="0.01" className={inputCls} value={form.subtotal} onChange={e => setForm(f => ({ ...f, subtotal: e.target.value }))} required /></div>
                            <div><label className={labelCls} htmlFor="si-tax">Tax</label>
                                <input id="si-tax" type="number" min="0" step="0.01" className={inputCls} value={form.tax} onChange={e => setForm(f => ({ ...f, tax: e.target.value }))} /></div>
                            <div className="text-[13px] text-gray-600">Total: <b data-testid="si-total">{money((Number(form.subtotal) || 0) + (Number(form.tax) || 0))}</b></div>
                            <button className={btnCls} disabled={busy}>Save invoice</button>
                        </form>
                    )}

                    {pay && (
                        <form className="bg-orange-50 border border-orange-200 rounded-xl p-4 mb-4 grid md:grid-cols-5 gap-3 items-end" onSubmit={submitPayment} aria-label="Record supplier payment">
                            <div className="text-[13px]">Paying <b>{pay.invoice.invoiceNo}</b><br />Outstanding {money(pay.invoice.outstanding)}</div>
                            <div><label className={labelCls} htmlFor="sp-amount">Amount</label>
                                <input id="sp-amount" type="number" min="0.01" max={pay.invoice.outstanding} step="0.01" className={inputCls} value={pay.amount} onChange={e => setPay(p => ({ ...p, amount: e.target.value }))} required /></div>
                            <div><label className={labelCls} htmlFor="sp-method">Method</label>
                                <select id="sp-method" className={inputCls} value={pay.method} onChange={e => setPay(p => ({ ...p, method: e.target.value }))}>
                                    <option value="cash">Cash</option><option value="upi">UPI</option><option value="bank-transfer">Bank transfer</option><option value="cheque">Cheque</option><option value="card">Card</option><option value="other">Other</option>
                                </select></div>
                            <div><label className={labelCls} htmlFor="sp-ref">Reference</label>
                                <input id="sp-ref" className={inputCls} value={pay.reference} onChange={e => setPay(p => ({ ...p, reference: e.target.value }))} /></div>
                            <div className="flex gap-2"><button className={btnCls} disabled={busy || !(Number(pay.amount) > 0) || Number(pay.amount) > pay.invoice.outstanding + 0.005}>Record payment</button>
                                <button type="button" className="px-3 py-2 text-[14px] text-gray-600" onClick={() => setPay(null)}>Cancel</button></div>
                        </form>
                    )}

                    <div className="overflow-x-auto bg-white border border-gray-200 rounded-xl">
                        <table className="w-full text-[13px]">
                            <thead><tr className="text-left text-gray-500 border-b"><th className="p-2">Supplier</th><th className="p-2">Invoice</th><th className="p-2">Date</th><th className="p-2">Due</th><th className="p-2 text-right">Total</th><th className="p-2 text-right">Paid</th><th className="p-2 text-right">Outstanding</th><th className="p-2">Status</th><th className="p-2" /></tr></thead>
                            <tbody>
                                {(invoices.data || []).map(i => (
                                    <tr key={i._id} className="border-b border-gray-100" data-testid="si-row">
                                        <td className="p-2">{i.supplier?.name || ''}</td>
                                        <td className="p-2 font-semibold">{i.invoiceNo}</td>
                                        <td className="p-2">{i.businessDate}</td>
                                        <td className="p-2">{i.dueDate ? new Date(i.dueDate).toLocaleDateString('en-CA') : ''}</td>
                                        <td className="p-2 text-right">{money(i.total)}</td>
                                        <td className="p-2 text-right">{money(i.amountPaid)}</td>
                                        <td className="p-2 text-right font-semibold">{money(i.outstanding)}</td>
                                        <td className="p-2"><span className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${STATUS_CLS[i.status] || ''}`}>{i.status}</span></td>
                                        <td className="p-2">{i.outstanding > 0 && <button className="text-orange-600 font-semibold" onClick={() => setPay({ invoice: i, amount: String(i.outstanding), method: 'cash', reference: '' })}>Pay</button>}</td>
                                    </tr>
                                ))}
                                {invoices.data?.length === 0 && <tr><td colSpan={9} className="p-4 text-center text-gray-400" data-testid="si-empty">No invoices yet.</td></tr>}
                            </tbody>
                        </table>
                    </div>
                </>
            )}

            {tab === 'outstanding' && outstanding.data && (
                <div className="overflow-x-auto bg-white border border-gray-200 rounded-xl">
                    <table className="w-full text-[13px]">
                        <thead><tr className="text-left text-gray-500 border-b"><th className="p-2">Supplier</th><th className="p-2 text-right">Not due</th><th className="p-2 text-right">1-30 days</th><th className="p-2 text-right">31-60</th><th className="p-2 text-right">61-90</th><th className="p-2 text-right">90+</th><th className="p-2 text-right">Total</th></tr></thead>
                        <tbody>
                            {outstanding.data.rows.map(r => (
                                <tr key={r.supplier} className="border-b border-gray-100" data-testid="out-row">
                                    <td className="p-2 font-semibold">{r.supplierName}</td>
                                    <td className="p-2 text-right">{money(r.notDue)}</td><td className="p-2 text-right">{money(r.d1_30)}</td><td className="p-2 text-right">{money(r.d31_60)}</td>
                                    <td className="p-2 text-right">{money(r.d61_90)}</td><td className="p-2 text-right text-red-600">{money(r.over90)}</td><td className="p-2 text-right font-bold">{money(r.total)}</td>
                                </tr>
                            ))}
                            <tr className="font-bold bg-gray-50"><td className="p-2">All suppliers</td>
                                <td className="p-2 text-right">{money(outstanding.data.totals.notDue)}</td><td className="p-2 text-right">{money(outstanding.data.totals.d1_30)}</td><td className="p-2 text-right">{money(outstanding.data.totals.d31_60)}</td>
                                <td className="p-2 text-right">{money(outstanding.data.totals.d61_90)}</td><td className="p-2 text-right">{money(outstanding.data.totals.over90)}</td><td className="p-2 text-right" data-testid="out-total">{money(outstanding.data.totals.total)}</td></tr>
                        </tbody>
                    </table>
                </div>
            )}

            {tab === 'match' && match.data && (
                <div className="overflow-x-auto bg-white border border-gray-200 rounded-xl">
                    <table className="w-full text-[13px]">
                        <thead><tr className="text-left text-gray-500 border-b"><th className="p-2">PO</th><th className="p-2">Supplier</th><th className="p-2">Result</th><th className="p-2 text-right">PO value</th><th className="p-2 text-right">Received</th><th className="p-2 text-right">Invoiced</th><th className="p-2">Flags</th></tr></thead>
                        <tbody>
                            {match.data.results.map(r => (
                                <tr key={r.purchaseOrder} className="border-b border-gray-100" data-testid="match-row">
                                    <td className="p-2 font-semibold">{r.poNumber}</td><td className="p-2">{r.supplierName}</td>
                                    <td className="p-2"><span className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${MATCH_CLS[r.status] || ''}`}>{r.status}</span></td>
                                    <td className="p-2 text-right">{money(r.poValue)}</td><td className="p-2 text-right">{money(r.receivedValue)}</td><td className="p-2 text-right">{money(r.invoicedTotal)}</td>
                                    <td className="p-2 text-[12px] text-gray-600">{r.flags.join(', ')}</td>
                                </tr>
                            ))}
                            {match.data.results.length === 0 && <tr><td colSpan={7} className="p-4 text-center text-gray-400">No purchase orders to match.</td></tr>}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    )
}
