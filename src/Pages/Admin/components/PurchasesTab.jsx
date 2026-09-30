import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { Plus, Search, X, Trash2, PackageCheck, IndianRupee, Truck, FileText, Ban, ChevronRight, Download } from 'lucide-react'
import { toast } from 'react-hot-toast'
import { purchaseAPI, supplierAPI, inventoryAPI } from '../../../utils/api'
import { exportReportToExcel, reportStamp } from '../../../utils/exportReport'

const inputCls = 'w-full px-3 py-2 bg-white border border-gray-200 rounded-lg focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500/10 text-[14px] text-gray-700 placeholder:text-gray-400'
const labelCls = 'block text-[12px] font-semibold text-gray-600 mb-1'
const money = (n) => `₹${(Number(n) || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`

const STATUS_BADGE = {
    draft: 'bg-gray-100 text-gray-500 border-gray-200',
    ordered: 'bg-blue-50 text-blue-600 border-blue-200',
    'partially-received': 'bg-amber-50 text-amber-600 border-amber-200',
    received: 'bg-emerald-50 text-emerald-600 border-emerald-200',
    cancelled: 'bg-rose-50 text-rose-500 border-rose-200',
}
const PAY_BADGE = {
    unpaid: 'bg-rose-50 text-rose-600 border-rose-200',
    partial: 'bg-amber-50 text-amber-600 border-amber-200',
    paid: 'bg-emerald-50 text-emerald-600 border-emerald-200',
}

// ── Create PO modal ────────────────────────────────────────────────────
const CreatePOModal = ({ suppliers, onClose, onSaved }) => {
    const [supplier, setSupplier] = useState('')
    const [expectedDate, setExpectedDate] = useState('')
    const [invoiceNumber, setInvoiceNumber] = useState('')
    const [notes, setNotes] = useState('')
    const [lines, setLines] = useState([])
    const [inv, setInv] = useState([])
    const [term, setTerm] = useState('')
    const [saving, setSaving] = useState(false)

    useEffect(() => { inventoryAPI.getAll({ limit: 500 }).then(r => { if (r.data.success) setInv(r.data.items || []) }).catch(() => {}) }, [])

    const filtered = term.trim() ? inv.filter(i => i.name.toLowerCase().includes(term.toLowerCase()) || i.itemId.toLowerCase().includes(term.toLowerCase())) : []

    const addLine = (it) => {
        if (lines.some(l => l.inventoryItem === it._id)) { toast.error('Item already added'); return }
        setLines(p => [...p, { inventoryItem: it._id, name: it.name, unit: it.unit, orderedQty: 1, rate: it.costPerUnit || 0, taxPercent: 0 }])
        setTerm('')
    }
    const upd = (i, k, v) => setLines(p => p.map((l, idx) => idx === i ? { ...l, [k]: v } : l))
    const rm = (i) => setLines(p => p.filter((_, idx) => idx !== i))

    const totals = useMemo(() => {
        let sub = 0, tax = 0
        for (const l of lines) { const b = (Number(l.orderedQty) || 0) * (Number(l.rate) || 0); sub += b; tax += b * (Number(l.taxPercent) || 0) / 100 }
        return { sub, tax, grand: sub + tax }
    }, [lines])

    const submit = async () => {
        if (!supplier) { toast.error('Select a supplier'); return }
        if (lines.length === 0) { toast.error('Add at least one item'); return }
        if (lines.some(l => !(Number(l.orderedQty) > 0))) { toast.error('All quantities must be greater than 0'); return }
        setSaving(true)
        try {
            const res = await purchaseAPI.create({
                supplier, expectedDate: expectedDate || undefined, invoiceNumber, notes,
                lines: lines.map(l => ({ inventoryItem: l.inventoryItem, orderedQty: Number(l.orderedQty), rate: Number(l.rate) || 0, taxPercent: Number(l.taxPercent) || 0 })),
            })
            if (res.data.success) { toast.success(`PO ${res.data.order.poNumber} created`); onSaved?.(); onClose() }
        } catch (err) { toast.error(err.response?.data?.message || 'Failed to create PO') }
        finally { setSaving(false) }
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-[2px] p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[92vh] flex flex-col overflow-hidden">
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
                    <h2 className="font-bold text-[18px] text-[#1A181B]">Create Purchase Order</h2>
                    <button onClick={onClose} className="p-2 text-gray-400 hover:bg-gray-100 rounded-lg"><X size={20} /></button>
                </div>
                <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
                    <div className="grid grid-cols-3 gap-4">
                        <div><label className={labelCls}>Supplier <span className="text-red-500">*</span></label>
                            <select value={supplier} onChange={e => setSupplier(e.target.value)} className={inputCls}>
                                <option value="">— Select —</option>
                                {suppliers.filter(s => s.isActive).map(s => <option key={s._id} value={s._id}>{s.name}</option>)}
                            </select>
                        </div>
                        <div><label className={labelCls}>Expected delivery</label><input type="date" value={expectedDate} onChange={e => setExpectedDate(e.target.value)} className={inputCls} /></div>
                        <div><label className={labelCls}>Invoice no. (optional)</label><input value={invoiceNumber} onChange={e => setInvoiceNumber(e.target.value)} placeholder="Supplier invoice" className={inputCls} /></div>
                    </div>

                    <div>
                        <label className={labelCls}>Add items</label>
                        <div className="relative">
                            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                            <input value={term} onChange={e => setTerm(e.target.value)} placeholder="Search inventory items…" className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-[#FE8301]" />
                            {filtered.length > 0 && (
                                <div className="absolute top-full left-0 right-0 mt-1 bg-white rounded-xl border border-gray-100 shadow-lg z-10 max-h-48 overflow-y-auto">
                                    {filtered.slice(0, 12).map(it => (
                                        <button key={it._id} onClick={() => addLine(it)} className="w-full text-left px-4 py-2 text-sm hover:bg-orange-50 flex items-center justify-between">
                                            <span className="font-medium text-gray-800">{it.name}</span>
                                            <span className="text-xs text-gray-400">{it.currentStock} {it.unit} · ₹{it.costPerUnit}/{it.unit}</span>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>

                    {lines.length > 0 && (
                        <div className="space-y-2">
                            <div className="grid grid-cols-[1fr_80px_90px_70px_90px_36px] gap-2 text-[10px] font-semibold text-gray-400 uppercase px-1">
                                <span>Item</span><span>Qty</span><span>Rate ₹</span><span>Tax %</span><span className="text-right">Amount</span><span></span>
                            </div>
                            {lines.map((l, i) => {
                                const base = (Number(l.orderedQty) || 0) * (Number(l.rate) || 0)
                                const amt = base + base * (Number(l.taxPercent) || 0) / 100
                                return (
                                    <div key={l.inventoryItem} className="grid grid-cols-[1fr_80px_90px_70px_90px_36px] gap-2 items-center bg-gray-50 rounded-lg px-3 py-2">
                                        <div><p className="text-[13px] font-medium text-gray-800 truncate">{l.name}</p><p className="text-[10px] text-gray-400">{l.unit}</p></div>
                                        <input type="number" min="0" step="any" value={l.orderedQty} onChange={e => upd(i, 'orderedQty', e.target.value)} className="px-2 py-1.5 border border-gray-200 rounded text-sm text-center" />
                                        <input type="number" min="0" step="any" value={l.rate} onChange={e => upd(i, 'rate', e.target.value)} className="px-2 py-1.5 border border-gray-200 rounded text-sm text-center" />
                                        <input type="number" min="0" max="100" step="any" value={l.taxPercent} onChange={e => upd(i, 'taxPercent', e.target.value)} className="px-2 py-1.5 border border-gray-200 rounded text-sm text-center" />
                                        <span className="text-[13px] font-semibold text-gray-700 text-right">{money(amt)}</span>
                                        <button onClick={() => rm(i)} className="p-1.5 text-gray-400 hover:text-red-500 rounded"><Trash2 size={14} /></button>
                                    </div>
                                )
                            })}
                        </div>
                    )}

                    <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="Notes (optional)" className={`${inputCls} resize-none`} />
                </div>
                <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100 bg-gray-50/50">
                    <div className="text-sm">
                        <span className="text-gray-400">Sub ₹{totals.sub.toFixed(2)} · Tax ₹{totals.tax.toFixed(2)} · </span>
                        <span className="font-bold text-gray-800">Total {money(totals.grand)}</span>
                    </div>
                    <div className="flex items-center gap-3">
                        <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-xl">Cancel</button>
                        <button onClick={submit} disabled={saving} className="px-5 py-2.5 bg-[#FE8301] text-white rounded-xl text-sm font-semibold hover:bg-orange-600 disabled:opacity-50">{saving ? 'Creating…' : 'Create PO'}</button>
                    </div>
                </div>
            </div>
        </div>
    )
}

// ── PO detail drawer (receive + pay) ───────────────────────────────────
const PODetailDrawer = ({ poId, onClose, onChanged }) => {
    const [po, setPo] = useState(null)
    const [mode, setMode] = useState('view') // view | receive | pay
    const [recv, setRecv] = useState({})     // inventoryItem -> {qty, batchNumber, expiryDate}
    const [pay, setPay] = useState({ amount: '', mode: 'cash', reference: '' })
    const [busy, setBusy] = useState(false)

    const load = useCallback(() => {
        purchaseAPI.getById(poId).then(r => { if (r.data.success) setPo(r.data.order) }).catch(() => toast.error('Failed to load PO'))
    }, [poId])
    useEffect(() => { load() }, [load])

    if (!po) return (
        <div className="fixed inset-0 z-50 bg-black/40 flex justify-end" onClick={onClose}>
            <div className="w-full max-w-lg bg-white h-full flex items-center justify-center" onClick={e => e.stopPropagation()}><div className="w-8 h-8 border-3 border-orange-500 border-t-transparent rounded-full animate-spin" /></div>
        </div>
    )

    const due = (po.grandTotal - po.amountPaid)
    const canReceive = po.status !== 'received' && po.status !== 'cancelled'
    const canPay = po.paymentStatus !== 'paid' && po.status !== 'cancelled'

    const doReceive = async () => {
        const rl = po.lines.map(l => {
            const r = recv[l.inventoryItem]; if (!r || !(Number(r.qty) > 0)) return null
            return { inventoryItem: l.inventoryItem, qty: Number(r.qty), batchNumber: r.batchNumber || '', expiryDate: r.expiryDate || undefined }
        }).filter(Boolean)
        if (rl.length === 0) { toast.error('Enter received quantity for at least one item'); return }
        setBusy(true)
        try { const res = await purchaseAPI.receive(po._id, { lines: rl }); if (res.data.success) { toast.success(`Received — ${res.data.grnNumber}`); setMode('view'); setRecv({}); load(); onChanged?.() } }
        catch (err) { toast.error(err.response?.data?.message || 'Failed to receive') } finally { setBusy(false) }
    }
    const doPay = async () => {
        if (!(Number(pay.amount) > 0)) { toast.error('Enter a valid amount'); return }
        setBusy(true)
        try { const res = await purchaseAPI.recordPayment(po._id, { amount: Number(pay.amount), mode: pay.mode, reference: pay.reference }); if (res.data.success) { toast.success('Payment recorded'); setMode('view'); setPay({ amount: '', mode: 'cash', reference: '' }); load(); onChanged?.() } }
        catch (err) { toast.error(err.response?.data?.message || 'Failed to record payment') } finally { setBusy(false) }
    }
    const doCancel = async () => {
        if (!window.confirm('Cancel this purchase order?')) return
        try { const res = await purchaseAPI.cancel(po._id); if (res.data.success) { toast.success('PO cancelled'); load(); onChanged?.() } }
        catch (err) { toast.error(err.response?.data?.message || 'Failed to cancel') }
    }

    return (
        <div className="fixed inset-0 z-50 bg-black/40 flex justify-end" onClick={onClose}>
            <div className="w-full max-w-lg bg-white h-full overflow-y-auto" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 sticky top-0 bg-white z-10">
                    <div>
                        <h2 className="font-bold text-[18px] text-[#1A181B]">{po.poNumber}</h2>
                        <p className="text-[12px] text-gray-400">{po.supplierName} · {new Date(po.orderDate).toLocaleDateString('en-IN')}</p>
                    </div>
                    <button onClick={onClose} className="p-2 text-gray-400 hover:bg-gray-100 rounded-lg"><X size={20} /></button>
                </div>

                <div className="px-6 py-4 space-y-4">
                    <div className="flex gap-2">
                        <span className={`px-2.5 py-1 rounded-full text-[11px] font-semibold border ${STATUS_BADGE[po.status]}`}>{po.status}</span>
                        <span className={`px-2.5 py-1 rounded-full text-[11px] font-semibold border ${PAY_BADGE[po.paymentStatus]}`}>{po.paymentStatus}</span>
                    </div>

                    {/* Lines */}
                    <div className="bg-gray-50 rounded-xl overflow-hidden">
                        <table className="w-full text-[13px]">
                            <thead className="text-[10px] uppercase text-gray-400"><tr><th className="text-left px-3 py-2">Item</th><th className="text-right px-3 py-2">Ordered</th><th className="text-right px-3 py-2">Received</th><th className="text-right px-3 py-2">Rate</th></tr></thead>
                            <tbody>
                                {po.lines.map(l => (
                                    <tr key={l._id || l.inventoryItem} className="border-t border-gray-100">
                                        <td className="px-3 py-2 text-gray-700">{l.name}</td>
                                        <td className="px-3 py-2 text-right">{l.orderedQty} {l.unit}</td>
                                        <td className={`px-3 py-2 text-right font-medium ${l.receivedQty >= l.orderedQty ? 'text-emerald-600' : l.receivedQty > 0 ? 'text-amber-600' : 'text-gray-400'}`}>{l.receivedQty} {l.unit}</td>
                                        <td className="px-3 py-2 text-right text-gray-500">₹{l.rate}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    <div className="flex justify-between text-sm px-1">
                        <span className="text-gray-400">Total</span>
                        <span className="font-bold text-gray-800">{money(po.grandTotal)} <span className="text-gray-400 font-normal">· Paid {money(po.amountPaid)} · Due {money(due)}</span></span>
                    </div>

                    {/* Action buttons */}
                    {mode === 'view' && (
                        <div className="flex flex-wrap gap-2">
                            {canReceive && <button onClick={() => setMode('receive')} className="inline-flex items-center gap-1.5 px-3 py-2 bg-[#FE8301] text-white rounded-lg text-[13px] font-semibold hover:bg-orange-600"><PackageCheck size={15} /> Receive goods</button>}
                            {canPay && <button onClick={() => { setMode('pay'); setPay(p => ({ ...p, amount: due > 0 ? String(Math.round(due * 100) / 100) : '' })) }} className="inline-flex items-center gap-1.5 px-3 py-2 border border-gray-200 text-gray-700 rounded-lg text-[13px] font-semibold hover:bg-gray-50"><IndianRupee size={15} /> Record payment</button>}
                            {po.receipts.length === 0 && po.amountPaid === 0 && po.status !== 'cancelled' && <button onClick={doCancel} className="inline-flex items-center gap-1.5 px-3 py-2 text-rose-500 rounded-lg text-[13px] font-semibold hover:bg-rose-50"><Ban size={15} /> Cancel</button>}
                        </div>
                    )}

                    {/* Receive form */}
                    {mode === 'receive' && (
                        <div className="border border-orange-200 bg-orange-50/40 rounded-xl p-3 space-y-2">
                            <p className="text-[13px] font-semibold text-gray-700">Goods Receipt (GRN)</p>
                            {po.lines.map(l => {
                                const rem = Math.max(0, l.orderedQty - l.receivedQty)
                                const r = recv[l.inventoryItem] || {}
                                return (
                                    <div key={l.inventoryItem} className="grid grid-cols-[1fr_70px_80px_110px] gap-2 items-center">
                                        <span className="text-[12px] text-gray-600 truncate">{l.name} <span className="text-gray-400">(rem {rem})</span></span>
                                        <input type="number" min="0" step="any" placeholder="Qty" value={r.qty || ''} onChange={e => setRecv(p => ({ ...p, [l.inventoryItem]: { ...p[l.inventoryItem], qty: e.target.value } }))} className="px-2 py-1.5 border border-gray-200 rounded text-sm text-center" />
                                        <input placeholder="Batch" value={r.batchNumber || ''} onChange={e => setRecv(p => ({ ...p, [l.inventoryItem]: { ...p[l.inventoryItem], batchNumber: e.target.value } }))} className="px-2 py-1.5 border border-gray-200 rounded text-sm" />
                                        <input type="date" value={r.expiryDate || ''} onChange={e => setRecv(p => ({ ...p, [l.inventoryItem]: { ...p[l.inventoryItem], expiryDate: e.target.value } }))} className="px-1 py-1.5 border border-gray-200 rounded text-[12px]" />
                                    </div>
                                )
                            })}
                            <div className="flex gap-2 pt-1">
                                <button onClick={() => { setMode('view'); setRecv({}) }} className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-[13px] font-medium">Cancel</button>
                                <button onClick={doReceive} disabled={busy} className="flex-1 px-3 py-2 bg-[#FE8301] text-white rounded-lg text-[13px] font-semibold disabled:opacity-50">{busy ? 'Saving…' : 'Confirm receipt'}</button>
                            </div>
                        </div>
                    )}

                    {/* Payment form */}
                    {mode === 'pay' && (
                        <div className="border border-orange-200 bg-orange-50/40 rounded-xl p-3 space-y-2">
                            <p className="text-[13px] font-semibold text-gray-700">Record payment (due {money(due)})</p>
                            <div className="grid grid-cols-2 gap-2">
                                <input type="number" min="0" step="any" placeholder="Amount" value={pay.amount} onChange={e => setPay(p => ({ ...p, amount: e.target.value }))} className={inputCls} />
                                <select value={pay.mode} onChange={e => setPay(p => ({ ...p, mode: e.target.value }))} className={inputCls}>
                                    {['cash', 'upi', 'bank-transfer', 'cheque', 'card', 'other'].map(m => <option key={m} value={m}>{m}</option>)}
                                </select>
                            </div>
                            <input placeholder="Reference / txn no (optional)" value={pay.reference} onChange={e => setPay(p => ({ ...p, reference: e.target.value }))} className={inputCls} />
                            <div className="flex gap-2 pt-1">
                                <button onClick={() => setMode('view')} className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-[13px] font-medium">Cancel</button>
                                <button onClick={doPay} disabled={busy} className="flex-1 px-3 py-2 bg-[#FE8301] text-white rounded-lg text-[13px] font-semibold disabled:opacity-50">{busy ? 'Saving…' : 'Record payment'}</button>
                            </div>
                        </div>
                    )}

                    {/* GRN history */}
                    {po.receipts.length > 0 && (
                        <div>
                            <p className="text-[12px] font-semibold text-gray-500 mb-1.5">Receipts</p>
                            {po.receipts.map(r => (
                                <div key={r._id || r.grnNumber} className="text-[12px] text-gray-600 bg-gray-50 rounded-lg px-3 py-2 mb-1">
                                    <span className="font-semibold">{r.grnNumber}</span> · {new Date(r.receivedAt).toLocaleDateString('en-IN')} · {r.lines.length} line(s)
                                </div>
                            ))}
                        </div>
                    )}
                    {po.payments.length > 0 && (
                        <div>
                            <p className="text-[12px] font-semibold text-gray-500 mb-1.5">Payments</p>
                            {po.payments.map(p => (
                                <div key={p._id} className="text-[12px] text-gray-600 bg-gray-50 rounded-lg px-3 py-2 mb-1 flex justify-between">
                                    <span>{money(p.amount)} · {p.mode}{p.reference ? ` · ${p.reference}` : ''}</span>
                                    <span className="text-gray-400">{new Date(p.paidAt).toLocaleDateString('en-IN')}</span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}

// ── Main tab ────────────────────────────────────────────────────────────
const PurchasesTab = () => {
    const [orders, setOrders] = useState([])
    const [summary, setSummary] = useState(null)
    const [suppliers, setSuppliers] = useState([])
    const [loading, setLoading] = useState(true)
    const [statusFilter, setStatusFilter] = useState('all')
    const [showCreate, setShowCreate] = useState(false)
    const [openId, setOpenId] = useState(null)

    const load = useCallback(async () => {
        setLoading(true)
        try {
            const [o, s] = await Promise.all([
                purchaseAPI.getAll(statusFilter !== 'all' ? { status: statusFilter } : {}),
                purchaseAPI.getSummary(),
            ])
            if (o.data.success) setOrders(o.data.orders || [])
            if (s.data.success) setSummary(s.data.summary)
        } catch { toast.error('Failed to load purchase orders') }
        finally { setLoading(false) }
    }, [statusFilter])
    useEffect(() => { load() }, [load])
    useEffect(() => { supplierAPI.getAll({ active: 'true' }).then(r => { if (r.data.success) setSuppliers(r.data.suppliers || []) }).catch(() => {}) }, [])

    const exportXlsx = async () => {
        if (!orders.length) { toast.error('No purchase orders to export'); return }
        try {
            await exportReportToExcel({
                filename: `purchase-orders-${reportStamp()}.xlsx`, sheetName: 'Purchase Orders', title: 'Purchase Orders',
                meta: [
                    { label: 'Status filter', value: statusFilter },
                    { label: 'Generated', value: new Date().toLocaleString('en-IN') },
                ],
                columns: [
                    { key: 'poNumber', label: 'PO No.' }, { key: 'supplierName', label: 'Supplier' },
                    { key: 'orderDate', label: 'Order Date' }, { key: 'invoiceNumber', label: 'Invoice' },
                    { key: 'grandTotal', label: 'Total', money: true }, { key: 'amountPaid', label: 'Paid', money: true },
                    { key: 'due', label: 'Due', money: true }, { key: 'status', label: 'Status' }, { key: 'paymentStatus', label: 'Payment' },
                ],
                rows: orders.map(o => ({
                    ...o,
                    orderDate: new Date(o.orderDate).toLocaleDateString('en-IN'),
                    due: Math.round((o.grandTotal - o.amountPaid) * 100) / 100,
                })),
            })
            toast.success('Purchase orders exported')
        } catch { toast.error('Export failed') }
    }

    const Card = ({ label, value, color }) => (
        <div className="bg-white rounded-xl border border-gray-100 px-4 py-3 shadow-sm">
            <p className="text-[11px] text-gray-400 font-medium">{label}</p>
            <p className={`text-lg font-bold ${color || 'text-[#1A181B]'}`}>{value}</p>
        </div>
    )

    return (
        <div>
            {summary && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                    <Card label="Total POs" value={summary.totalPOs} />
                    <Card label="Pending Receipt" value={summary.pendingReceipt} color="text-amber-600" />
                    <Card label="Outstanding" value={money(summary.outstanding)} color="text-rose-600" />
                    <Card label="This Month Spend" value={money(summary.monthSpend)} color="text-[#702083]" />
                </div>
            )}

            <div className="flex items-center justify-between gap-3 mb-4">
                <div className="flex items-center gap-1 bg-white rounded-xl border border-gray-100 p-1 w-fit">
                    {['all', 'ordered', 'partially-received', 'received', 'cancelled'].map(s => (
                        <button key={s} onClick={() => setStatusFilter(s)} className={`px-3 py-1.5 text-[12px] font-semibold rounded-lg capitalize ${statusFilter === s ? 'bg-[#FE8301] text-white' : 'text-gray-500 hover:bg-gray-50'}`}>{s.replace('-', ' ')}</button>
                    ))}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                    <button onClick={exportXlsx} disabled={!orders.length} className="inline-flex items-center gap-2 px-4 py-2.5 border border-gray-200 text-gray-700 rounded-xl text-sm font-semibold hover:bg-gray-50 hover:border-[#FE8301] disabled:opacity-50"><Download size={16} /> Export</button>
                    <button onClick={() => setShowCreate(true)} disabled={suppliers.length === 0} title={suppliers.length === 0 ? 'Add a supplier first' : ''} className="inline-flex items-center gap-2 px-4 py-2.5 bg-[#FE8301] text-white rounded-xl text-sm font-semibold hover:bg-orange-600 disabled:opacity-50"><Plus size={16} /> New PO</button>
                </div>
            </div>

            {loading ? (
                <div className="py-16 text-center text-gray-400 text-sm">Loading…</div>
            ) : orders.length === 0 ? (
                <div className="py-16 text-center text-gray-400">
                    <Truck size={36} className="mx-auto mb-2 text-gray-300" />
                    <p className="text-sm">No purchase orders yet.{suppliers.length === 0 ? ' Add a supplier first, then raise a PO.' : ' Create your first PO.'}</p>
                </div>
            ) : (
                <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                    <table className="w-full text-sm">
                        <thead className="bg-gray-50 text-[11px] uppercase text-gray-400 font-semibold">
                            <tr><th className="text-left px-4 py-3">PO</th><th className="text-left px-4 py-3">Supplier</th><th className="text-left px-4 py-3">Date</th><th className="text-right px-4 py-3">Total</th><th className="text-center px-4 py-3">Status</th><th className="text-center px-4 py-3">Payment</th><th className="px-4 py-3"></th></tr>
                        </thead>
                        <tbody>
                            {orders.map(o => (
                                <tr key={o._id} onClick={() => setOpenId(o._id)} className="border-t border-gray-50 hover:bg-orange-50/40 cursor-pointer">
                                    <td className="px-4 py-3 font-semibold text-gray-800">{o.poNumber}{o.invoiceNumber ? <span className="block text-[10px] text-gray-400 font-normal"><FileText size={9} className="inline" /> {o.invoiceNumber}</span> : null}</td>
                                    <td className="px-4 py-3 text-gray-600">{o.supplierName}</td>
                                    <td className="px-4 py-3 text-gray-500 text-[12px]">{new Date(o.orderDate).toLocaleDateString('en-IN')}</td>
                                    <td className="px-4 py-3 text-right font-semibold text-gray-800">{money(o.grandTotal)}</td>
                                    <td className="px-4 py-3 text-center"><span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold border capitalize ${STATUS_BADGE[o.status]}`}>{o.status.replace('-', ' ')}</span></td>
                                    <td className="px-4 py-3 text-center"><span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold border capitalize ${PAY_BADGE[o.paymentStatus]}`}>{o.paymentStatus}</span></td>
                                    <td className="px-4 py-3 text-right text-gray-300"><ChevronRight size={16} /></td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {showCreate && <CreatePOModal suppliers={suppliers} onClose={() => setShowCreate(false)} onSaved={load} />}
            {openId && <PODetailDrawer poId={openId} onClose={() => setOpenId(null)} onChanged={load} />}
        </div>
    )
}

export default PurchasesTab
