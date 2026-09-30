import React, { useState, useEffect, useCallback } from 'react'
import { Plus, Search, Pencil, Trash2, X, Phone, Mail, Building2, Power, Download } from 'lucide-react'
import { toast } from 'react-hot-toast'
import { supplierAPI } from '../../../utils/api'
import { exportReportToExcel, reportStamp } from '../../../utils/exportReport'
import ConfirmModal from './ConfirmModal'

const inputCls = 'w-full px-4 py-3 bg-white border border-gray-200 rounded-xl focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/10 transition-all text-[14px] font-medium text-gray-700 placeholder:text-gray-400'
const labelCls = 'block text-[13px] font-semibold text-gray-600 mb-1.5'

// Same strict GSTIN format the backend enforces (supplierController.js).
// Mirrored client-side so the user sees a precise inline error instead of
// a generic toast when the format is wrong.
const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/

const SupplierModal = ({ editData, onClose, onSaved }) => {
    const [form, setForm] = useState({
        name: '', contactPerson: '', mobile: '', email: '', gstNumber: '', address: '', paymentTermsDays: '', notes: '',
    })
    const [code, setCode] = useState('')
    const [gstErr, setGstErr] = useState('')
    const [saving, setSaving] = useState(false)

    useEffect(() => {
        if (editData) {
            setForm({
                name: editData.name || '', contactPerson: editData.contactPerson || '', mobile: editData.mobile || '',
                email: editData.email || '', gstNumber: editData.gstNumber || '', address: editData.address || '',
                paymentTermsDays: editData.paymentTermsDays ?? '', notes: editData.notes || '',
            })
        } else {
            supplierAPI.nextCode().then(r => { if (r.data.success) setCode(r.data.code) }).catch(() => {})
        }
    }, [editData])

    const set = (k, v) => setForm(p => ({ ...p, [k]: v }))

    const submit = async (e) => {
        e.preventDefault()
        if (!form.name.trim()) { toast.error('Supplier name is required'); return }
        // GST is optional, but if entered it MUST be a valid 15-char GSTIN
        // (kept strict so invoices carry correct data). Show it inline.
        const gst = form.gstNumber.trim().toUpperCase()
        if (gst && !GSTIN_RE.test(gst)) {
            setGstErr('Enter a valid 15-character GSTIN, e.g. 27ABCDE1234F1Z5')
            toast.error('Invalid GST number format')
            return
        }
        setGstErr('')
        setSaving(true)
        try {
            const payload = { ...form, paymentTermsDays: Number(form.paymentTermsDays) || 0 }
            const res = editData ? await supplierAPI.update(editData._id, payload) : await supplierAPI.create(payload)
            if (res.data.success) { toast.success(editData ? 'Supplier updated' : 'Supplier added'); onSaved?.(); onClose() }
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to save supplier')
        } finally { setSaving(false) }
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-[2px] p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-[620px] max-h-[90vh] overflow-y-auto">
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
                    <div>
                        <h2 className="font-bold text-[18px] text-[#1A181B]">{editData ? 'Edit Supplier' : 'Add Supplier'}</h2>
                        {!editData && code && <p className="text-[12px] text-gray-400 mt-0.5">Code: {code}</p>}
                    </div>
                    <button onClick={onClose} className="p-2 text-gray-400 hover:bg-gray-100 rounded-lg"><X size={20} /></button>
                </div>
                <form onSubmit={submit} className="px-6 py-5 space-y-4">
                    <div>
                        <label className={labelCls}>Supplier name <span className="text-red-500">*</span></label>
                        <input value={form.name} onChange={e => set('name', e.target.value)} placeholder="e.g. Shree Fresh Traders" className={inputCls} maxLength={120} />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div><label className={labelCls}>Contact person</label><input value={form.contactPerson} onChange={e => set('contactPerson', e.target.value)} placeholder="Name" className={inputCls} /></div>
                        <div><label className={labelCls}>Mobile</label><input value={form.mobile} onChange={e => set('mobile', e.target.value)} placeholder="Phone number" className={inputCls} /></div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div><label className={labelCls}>Email</label><input value={form.email} onChange={e => set('email', e.target.value)} placeholder="vendor@example.com" className={inputCls} /></div>
                        <div>
                            <label className={labelCls}>GST number <span className="text-gray-400 font-normal">(optional)</span></label>
                            <input
                                value={form.gstNumber}
                                onChange={e => { set('gstNumber', e.target.value.toUpperCase()); if (gstErr) setGstErr('') }}
                                placeholder="27ABCDE1234F1Z5"
                                aria-invalid={gstErr ? 'true' : 'false'}
                                className={`${inputCls} ${gstErr ? 'border-red-400 focus:border-red-500 focus:ring-red-200' : ''}`}
                                maxLength={15}
                            />
                            {gstErr
                                ? <p role="alert" className="text-xs text-red-600 mt-1 flex items-center gap-1"><span aria-hidden="true">⚠</span>{gstErr}</p>
                                : <p className="text-[11px] text-gray-400 mt-1">Leave blank if not applicable · 15 chars</p>}
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div><label className={labelCls}>Payment terms (credit days)</label><input type="number" min="0" value={form.paymentTermsDays} onChange={e => set('paymentTermsDays', e.target.value)} placeholder="0 = cash" className={inputCls} /></div>
                    </div>
                    <div><label className={labelCls}>Address</label><textarea value={form.address} onChange={e => set('address', e.target.value)} rows={2} placeholder="Billing / pickup address" className={`${inputCls} resize-none`} maxLength={500} /></div>
                    <div><label className={labelCls}>Notes</label><textarea value={form.notes} onChange={e => set('notes', e.target.value)} rows={2} placeholder="Optional notes" className={`${inputCls} resize-none`} maxLength={1000} /></div>
                    <div className="flex items-center gap-3 pt-3 border-t border-gray-100">
                        <button type="button" onClick={onClose} className="flex-1 px-5 py-3 border border-gray-200 text-gray-600 rounded-xl text-[14px] font-semibold hover:bg-gray-50">Cancel</button>
                        <button type="submit" disabled={saving} className="flex-1 px-5 py-3 bg-[#FE8301] text-white rounded-xl text-[14px] font-semibold hover:bg-orange-600 disabled:opacity-60">{saving ? 'Saving…' : editData ? 'Update' : 'Add supplier'}</button>
                    </div>
                </form>
            </div>
        </div>
    )
}

const SuppliersTab = () => {
    const [suppliers, setSuppliers] = useState([])
    const [loading, setLoading] = useState(true)
    const [search, setSearch] = useState('')
    const [debounced, setDebounced] = useState('')
    const [modal, setModal] = useState(null) // {} for add, supplier for edit
    const [del, setDel] = useState(null)

    useEffect(() => { const t = setTimeout(() => setDebounced(search.trim()), 350); return () => clearTimeout(t) }, [search])

    const load = useCallback(async () => {
        setLoading(true)
        try {
            const r = await supplierAPI.getAll(debounced ? { search: debounced } : {})
            if (r.data.success) setSuppliers(r.data.suppliers || [])
        } catch { toast.error('Failed to load suppliers') }
        finally { setLoading(false) }
    }, [debounced])
    useEffect(() => { load() }, [load])

    const remove = async () => {
        try { await supplierAPI.delete(del._id); toast.success('Supplier deleted'); setDel(null); load() }
        catch (err) { toast.error(err.response?.data?.message || 'Failed to delete'); setDel(null) }
    }

    const toggleActive = async (s) => {
        try { await supplierAPI.update(s._id, { isActive: !s.isActive }); load() }
        catch (err) { toast.error(err.response?.data?.message || 'Failed') }
    }

    const exportXlsx = async () => {
        if (!suppliers.length) { toast.error('No suppliers to export'); return }
        try {
            await exportReportToExcel({
                filename: `suppliers-${reportStamp()}.xlsx`, sheetName: 'Suppliers', title: 'Supplier / Vendor Master',
                meta: [{ label: 'Generated', value: new Date().toLocaleString('en-IN') }],
                columns: [
                    { key: 'code', label: 'Code' }, { key: 'name', label: 'Supplier' }, { key: 'contactPerson', label: 'Contact' },
                    { key: 'mobile', label: 'Mobile' }, { key: 'email', label: 'Email' }, { key: 'gstNumber', label: 'GST' },
                    { key: 'paymentTermsDays', label: 'Credit Days', numeric: true }, { key: 'poCount', label: 'POs', numeric: true },
                    { key: 'totalBilled', label: 'Total Billed', money: true }, { key: 'outstanding', label: 'Outstanding', money: true },
                    { key: 'status', label: 'Status' },
                ],
                rows: suppliers.map(s => ({ ...s, status: s.isActive ? 'Active' : 'Inactive' })),
            })
            toast.success('Suppliers exported')
        } catch { toast.error('Export failed') }
    }

    return (
        <div>
            <div className="flex items-center justify-between gap-3 mb-4">
                <div className="relative flex-1 max-w-md">
                    <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search suppliers by name, code, contact…" className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-[#FE8301]" />
                </div>
                <button onClick={exportXlsx} disabled={!suppliers.length} className="inline-flex items-center gap-2 px-4 py-2.5 border border-gray-200 text-gray-700 rounded-xl text-sm font-semibold hover:bg-gray-50 hover:border-[#FE8301] disabled:opacity-50 shrink-0"><Download size={16} /> Export</button>
                <button onClick={() => setModal({})} className="inline-flex items-center gap-2 px-4 py-2.5 bg-[#FE8301] text-white rounded-xl text-sm font-semibold hover:bg-orange-600 shrink-0"><Plus size={16} /> Add Supplier</button>
            </div>

            {loading ? (
                <div className="py-16 text-center text-gray-400 text-sm">Loading suppliers…</div>
            ) : suppliers.length === 0 ? (
                <div className="py-16 text-center text-gray-400">
                    <Building2 size={36} className="mx-auto mb-2 text-gray-300" />
                    <p className="text-sm">No suppliers yet. Add your first vendor to start raising purchase orders.</p>
                </div>
            ) : (
                <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                    <table className="w-full text-sm">
                        <thead className="bg-gray-50 text-[11px] uppercase text-gray-400 font-semibold">
                            <tr>
                                <th className="text-left px-4 py-3">Supplier</th>
                                <th className="text-left px-4 py-3">Contact</th>
                                <th className="text-left px-4 py-3">GST</th>
                                <th className="text-right px-4 py-3">Terms</th>
                                <th className="text-right px-4 py-3">Outstanding</th>
                                <th className="text-center px-4 py-3">Status</th>
                                <th className="text-right px-4 py-3">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {suppliers.map(s => (
                                <tr key={s._id} className="border-t border-gray-50 hover:bg-gray-50/50">
                                    <td className="px-4 py-3">
                                        <p className="font-semibold text-gray-800">{s.name}</p>
                                        <p className="text-[11px] text-gray-400">{s.code}{s.poCount ? ` · ${s.poCount} PO` : ''}</p>
                                    </td>
                                    <td className="px-4 py-3 text-gray-600">
                                        {s.contactPerson && <p className="text-[13px]">{s.contactPerson}</p>}
                                        <div className="flex flex-col gap-0.5 text-[11px] text-gray-400">
                                            {s.mobile && <span className="inline-flex items-center gap-1"><Phone size={10} />{s.mobile}</span>}
                                            {s.email && <span className="inline-flex items-center gap-1"><Mail size={10} />{s.email}</span>}
                                        </div>
                                    </td>
                                    <td className="px-4 py-3 text-gray-600 text-[12px]">{s.gstNumber || '—'}</td>
                                    <td className="px-4 py-3 text-right text-gray-600">{s.paymentTermsDays > 0 ? `${s.paymentTermsDays}d credit` : 'Cash'}</td>
                                    <td className="px-4 py-3 text-right font-semibold">{s.outstanding > 0 ? <span className="text-rose-600">₹{s.outstanding.toLocaleString('en-IN')}</span> : <span className="text-gray-400">₹0</span>}</td>
                                    <td className="px-4 py-3 text-center">
                                        <span className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold border ${s.isActive ? 'bg-emerald-50 text-emerald-600 border-emerald-200' : 'bg-gray-100 text-gray-400 border-gray-200'}`}>{s.isActive ? 'Active' : 'Inactive'}</span>
                                    </td>
                                    <td className="px-4 py-3">
                                        <div className="flex items-center justify-end gap-1">
                                            <button onClick={() => toggleActive(s)} title={s.isActive ? 'Deactivate' : 'Activate'} className="p-1.5 text-gray-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg"><Power size={15} /></button>
                                            <button onClick={() => setModal(s)} title="Edit" className="p-1.5 text-gray-400 hover:text-[#FE8301] hover:bg-orange-50 rounded-lg"><Pencil size={15} /></button>
                                            <button onClick={() => setDel(s)} title="Delete" className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg"><Trash2 size={15} /></button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {modal && <SupplierModal editData={modal._id ? modal : null} onClose={() => setModal(null)} onSaved={load} />}
            <ConfirmModal isOpen={!!del} title="Delete supplier?" message={`Delete "${del?.name}"? This cannot be undone.`} confirmLabel="Delete" onConfirm={remove} onClose={() => setDel(null)} />
        </div>
    )
}

export default SuppliersTab
