import React, { useMemo, useState } from 'react'
import { X, Search } from 'lucide-react'
import {
    STAFF_ROLE_OPTIONS, emptyCampaignForm, formFromCampaign, validateCampaignForm,
    buildCampaignPayload, apiMessage,
} from '../../../utils/incentives'

const inputCls = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-[14px] font-manrope focus:outline-none focus:border-[#FE8301]'
const Err = ({ msg }) => (msg ? <p className="text-[12px] text-red-600 mt-1" role="alert">{msg}</p> : null)

/**
 * Create / edit an incentive campaign.
 * Props: campaign (null = create), menuItems [{_id,name,price}], branches [{_id,name}],
 *        onSave(payload) -> Promise (throws on failure), onClose()
 */
export default function IncentiveCampaignModal({ campaign, menuItems = [], branches = [], onSave, onClose }) {
    const [form, setForm] = useState(() => (campaign ? formFromCampaign(campaign) : emptyCampaignForm()))
    const [errors, setErrors] = useState({})
    const [serverError, setServerError] = useState('')
    const [saving, setSaving] = useState(false)
    const [search, setSearch] = useState('')

    const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
    const toggle = (k, v) => setForm(f => ({ ...f, [k]: f[k].includes(v) ? f[k].filter(x => x !== v) : [...f[k], v] }))

    const visibleItems = useMemo(() => {
        const q = search.trim().toLowerCase()
        return q ? menuItems.filter(m => (m.name || '').toLowerCase().includes(q)) : menuItems
    }, [menuItems, search])

    const submit = async (e) => {
        e.preventDefault()
        const v = validateCampaignForm(form)
        setErrors(v)
        setServerError('')
        if (Object.keys(v).length) return
        setSaving(true)
        try {
            await onSave(buildCampaignPayload(form))
        } catch (err) {
            setServerError(apiMessage(err, 'Could not save the campaign'))
        } finally {
            setSaving(false)
        }
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-label={campaign ? 'Edit campaign' : 'New campaign'}>
            <form onSubmit={submit} noValidate className="bg-white rounded-2xl w-full max-w-[640px] max-h-[92vh] overflow-y-auto p-6 font-manrope">
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-[18px] font-bold text-[#1A181B]">{campaign ? 'Edit campaign' : 'New incentive campaign'}</h2>
                    <button type="button" onClick={onClose} aria-label="Close" className="p-1 text-gray-400 hover:text-gray-600"><X size={20} /></button>
                </div>

                <div className="space-y-4">
                    <div>
                        <label htmlFor="inc-name" className="block text-[13px] font-semibold mb-1">Campaign name</label>
                        <input id="inc-name" className={inputCls} value={form.name} maxLength={80} onChange={e => set('name', e.target.value)} placeholder="e.g. Push the dessert menu" />
                        <Err msg={errors.name} />
                    </div>

                    <div>
                        <div className="flex items-center justify-between mb-1">
                            <span className="block text-[13px] font-semibold">Menu items ({form.items.length} selected)</span>
                            <div className="relative">
                                <Search size={14} className="absolute left-2 top-2.5 text-gray-400" />
                                <input aria-label="Search menu items" className="border border-gray-200 rounded-lg pl-7 pr-2 py-1.5 text-[13px]" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search" />
                            </div>
                        </div>
                        <div className="border border-gray-200 rounded-lg max-h-[180px] overflow-y-auto divide-y divide-gray-50" data-testid="inc-items">
                            {visibleItems.length === 0 && <p className="p-3 text-[13px] text-gray-500">No menu items found.</p>}
                            {visibleItems.map(m => (
                                <label key={m._id} className="flex items-center gap-2 px-3 py-1.5 text-[13px] cursor-pointer hover:bg-gray-50">
                                    <input type="checkbox" checked={form.items.includes(String(m._id))} onChange={() => toggle('items', String(m._id))} />
                                    <span className="flex-1">{m.name}</span>
                                    {m.price != null && <span className="text-gray-400">{'₹'}{m.price}</span>}
                                </label>
                            ))}
                        </div>
                        <Err msg={errors.items} />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                            <label htmlFor="inc-rate" className="block text-[13px] font-semibold mb-1">Rate per item served ({'₹'})</label>
                            <input id="inc-rate" type="number" min="0" step="0.5" className={inputCls} value={form.ratePerItem} onChange={e => set('ratePerItem', e.target.value)} />
                            <Err msg={errors.ratePerItem} />
                        </div>
                        <div>
                            <label htmlFor="inc-branch" className="block text-[13px] font-semibold mb-1">Branch</label>
                            <select id="inc-branch" className={inputCls} value={form.branch} onChange={e => set('branch', e.target.value)}>
                                <option value="">All branches</option>
                                {branches.map(b => <option key={b._id} value={b._id}>{b.name}</option>)}
                            </select>
                        </div>
                        <div>
                            <label htmlFor="inc-start" className="block text-[13px] font-semibold mb-1">Start date</label>
                            <input id="inc-start" type="date" className={inputCls} value={form.startDate} onChange={e => set('startDate', e.target.value)} />
                            <Err msg={errors.startDate} />
                        </div>
                        <div>
                            <label htmlFor="inc-end" className="block text-[13px] font-semibold mb-1">End date (inclusive)</label>
                            <input id="inc-end" type="date" className={inputCls} value={form.endDate} onChange={e => set('endDate', e.target.value)} />
                            <Err msg={errors.endDate} />
                        </div>
                        <div>
                            <label htmlFor="inc-max" className="block text-[13px] font-semibold mb-1">Max items per staff per day</label>
                            <input id="inc-max" type="number" min="0" step="1" className={inputCls} value={form.maxPerStaffPerDay} onChange={e => set('maxPerStaffPerDay', e.target.value)} placeholder="0 = no limit" />
                            <Err msg={errors.maxPerStaffPerDay} />
                        </div>
                        <div>
                            <label htmlFor="inc-budget" className="block text-[13px] font-semibold mb-1">Budget cap ({'₹'})</label>
                            <input id="inc-budget" type="number" min="0" step="1" className={inputCls} value={form.budgetCap} onChange={e => set('budgetCap', e.target.value)} placeholder="0 = no cap" />
                            <Err msg={errors.budgetCap} />
                        </div>
                    </div>

                    <fieldset>
                        <legend className="text-[13px] font-semibold mb-1">Eligible staff</legend>
                        <div className="flex gap-4">
                            {STAFF_ROLE_OPTIONS.map(r => (
                                <label key={r.value} className="flex items-center gap-2 text-[14px]">
                                    <input type="checkbox" checked={form.staffRoles.includes(r.value)} onChange={() => toggle('staffRoles', r.value)} />
                                    {r.label}
                                </label>
                            ))}
                        </div>
                        <Err msg={errors.staffRoles} />
                    </fieldset>

                    <div>
                        <label htmlFor="inc-stacking" className="block text-[13px] font-semibold mb-1">If another campaign covers the same item</label>
                        <select id="inc-stacking" className={inputCls} value={form.stacking} onChange={e => set('stacking', e.target.value)}>
                            <option value="stack">Stack (both pay)</option>
                            <option value="exclusive">Exclusive (only this one pays)</option>
                        </select>
                    </div>

                    <label className="flex items-center gap-2 text-[14px]">
                        <input type="checkbox" checked={form.status === 'paused'} onChange={e => set('status', e.target.checked ? 'paused' : 'active')} />
                        Paused (no new incentives accrue)
                    </label>

                    <p className="text-[12px] text-gray-500 bg-gray-50 rounded-lg p-3">
                        A flat rate is earned per item once it has been served and the order is paid. Until both happen it stays pending. Cancelling or refunding reverses it.
                    </p>
                </div>

                {serverError && <p className="mt-4 text-[13px] text-red-600" role="alert" data-testid="inc-server-error">{serverError}</p>}

                <div className="flex justify-end gap-3 mt-6">
                    <button type="button" onClick={onClose} className="px-5 py-2 rounded-lg border border-gray-300 text-[14px] font-semibold text-gray-600">Cancel</button>
                    <button type="submit" disabled={saving} className="px-6 py-2 rounded-lg bg-[#FE8301] text-white text-[14px] font-semibold disabled:opacity-50">
                        {saving ? 'Saving...' : (campaign ? 'Save changes' : 'Create campaign')}
                    </button>
                </div>
            </form>
        </div>
    )
}
