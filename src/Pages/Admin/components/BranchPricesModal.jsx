import React, { useEffect, useMemo, useState } from 'react'
import { X, Loader2, Store, Info } from 'lucide-react'
import api from '../../../utils/api'
import toast from 'react-hot-toast'

/**
 * BranchPricesModal — per-branch price override editor for a single
 * menu item. Reads from GET  /api/v1/menu/:id/branch-prices and writes
 * back via PUT /api/v1/menu/:id/branch-prices.
 *
 * A menu item has one "default" price (basePrice + offerPercentage).
 * Optionally, any number of branches can override that price — e.g.
 * a premium-location branch charges ₹350 instead of the default ₹300.
 *
 * Override OFF for a branch = customers at that branch pay the default.
 * Override ON                = customers at that branch pay the branch
 *                              entry's basePrice / offerPercentage.
 *
 * Props:
 *   item  — { _id, name }               required
 *   onClose() — close handler           required
 *   onSaved(updated)? — refresh hook    optional
 */
const BranchPricesModal = ({ item, onClose, onSaved }) => {
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [branches, setBranches] = useState([])
    const [defaultPrice, setDefaultPrice] = useState({ basePrice: 0, offerPercentage: 0, finalPrice: 0 })
    // rows: { branchId → { enabled, basePrice, offerPercentage, offerExpiryDate } }
    const [rows, setRows] = useState({})

    useEffect(() => {
        if (!item?._id) return
        let cancelled = false
        ;(async () => {
            try {
                setLoading(true)
                const [bRes, pRes] = await Promise.all([
                    api.get('/branches', { _silent: true }),
                    api.get(`/menu/${item._id}/branch-prices`),
                ])
                if (cancelled) return

                const branchList = Array.isArray(bRes.data?.data) ? bRes.data.data : []
                setBranches(branchList)

                const data = pRes.data?.data || {}
                setDefaultPrice(data.defaultPrice || { basePrice: 0, offerPercentage: 0, finalPrice: 0 })

                // Seed every branch with a disabled row; turn on only the ones that have an override.
                const seeded = {}
                for (const b of branchList) {
                    seeded[b._id] = {
                        enabled: false,
                        basePrice: data.defaultPrice?.basePrice ?? 0,
                        offerPercentage: 0,
                        offerExpiryDate: '',
                    }
                }
                for (const bp of (data.branchPrices || [])) {
                    const id = bp.branch?._id || bp.branch
                    if (!id || !seeded[id]) continue
                    seeded[id] = {
                        enabled: true,
                        basePrice: Number(bp.basePrice) || 0,
                        offerPercentage: Number(bp.offerPercentage) || 0,
                        offerExpiryDate: bp.offerExpiryDate ? String(bp.offerExpiryDate).slice(0, 10) : '',
                    }
                }
                setRows(seeded)
            } catch (err) {
                if (!cancelled) {
                    toast.error(err?.response?.data?.message || 'Failed to load branch prices')
                }
            } finally {
                if (!cancelled) setLoading(false)
            }
        })()
        return () => { cancelled = true }
    }, [item?._id])

    const updateRow = (branchId, patch) => {
        setRows(prev => ({ ...prev, [branchId]: { ...prev[branchId], ...patch } }))
    }

    const computeFinal = (basePrice, offerPercentage) => {
        const bp = Number(basePrice) || 0
        const op = Number(offerPercentage) || 0
        return Math.max(0, bp - (bp * op / 100))
    }

    const enabledCount = useMemo(
        () => Object.values(rows).filter(r => r.enabled).length,
        [rows]
    )

    const handleSave = async () => {
        // Build payload from enabled rows only; server ignores unknown branches.
        const payload = []
        for (const [branchId, r] of Object.entries(rows)) {
            if (!r.enabled) continue
            const basePrice = Number(r.basePrice)
            if (!Number.isFinite(basePrice) || basePrice < 0) {
                toast.error('Each branch price must be 0 or greater')
                return
            }
            const entry = {
                branch: branchId,
                basePrice,
                offerPercentage: Number(r.offerPercentage) || 0,
            }
            if (r.offerExpiryDate) entry.offerExpiryDate = r.offerExpiryDate
            payload.push(entry)
        }

        try {
            setSaving(true)
            const res = await api.put(`/menu/${item._id}/branch-prices`, { branchPrices: payload })
            toast.success(res.data?.message || 'Branch prices saved')
            onSaved?.(res.data?.data)
            onClose()
        } catch (err) {
            toast.error(err?.response?.data?.message || 'Failed to save branch prices')
        } finally {
            setSaving(false)
        }
    }

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 font-manrope">
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={saving ? undefined : onClose} />

            <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
                <div className="flex items-start justify-between gap-4 p-5 border-b border-gray-100">
                    <div>
                        <div className="flex items-center gap-2">
                            <Store size={20} className="text-orange-500" />
                            <h3 className="text-lg font-bold text-gray-900">Branch Pricing</h3>
                        </div>
                        <p className="text-sm text-gray-500 mt-0.5">
                            {item?.name}
                            <span className="text-gray-400"> · default ₹{Number(defaultPrice.basePrice || 0).toFixed(2)}</span>
                        </p>
                    </div>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600 mt-1" aria-label="Close">
                        <X size={20} />
                    </button>
                </div>

                <div className="px-5 py-3 bg-orange-50/60 border-b border-orange-100 text-[12px] text-orange-800 flex gap-2 items-start">
                    <Info size={14} className="mt-0.5 shrink-0" />
                    <p>
                        Turn on override for branches that should charge a different price. Branches
                        left off keep charging the default price ({defaultPrice.offerPercentage > 0
                            ? `₹${Number(defaultPrice.finalPrice || 0).toFixed(2)} after ${defaultPrice.offerPercentage}% off`
                            : `₹${Number(defaultPrice.basePrice || 0).toFixed(2)}`}).
                    </p>
                </div>

                <div className="flex-1 overflow-y-auto p-5">
                    {loading ? (
                        <div className="flex items-center justify-center py-12 text-gray-500">
                            <Loader2 size={22} className="animate-spin mr-2" /> Loading…
                        </div>
                    ) : branches.length === 0 ? (
                        <div className="text-center py-12 text-sm text-gray-500">
                            No branches yet. Create a branch first from the Branches page to set per-branch pricing.
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {branches.map(b => {
                                const r = rows[b._id] || {}
                                const finalPrice = computeFinal(r.basePrice, r.offerPercentage)
                                return (
                                    <div
                                        key={b._id}
                                        className={`border rounded-xl p-3.5 transition-colors ${r.enabled ? 'border-orange-300 bg-orange-50/30' : 'border-gray-200 bg-white'}`}
                                    >
                                        <div className="flex items-center justify-between gap-3">
                                            <div className="min-w-0">
                                                <div className="text-sm font-semibold text-gray-900 truncate">
                                                    {b.name}
                                                    {b.city ? <span className="text-gray-400 font-normal"> · {b.city}</span> : null}
                                                </div>
                                                <div className="text-[11px] text-gray-400 mt-0.5">{b.slug}</div>
                                            </div>
                                            <label className="inline-flex items-center gap-2 cursor-pointer shrink-0">
                                                <span className="text-xs text-gray-600">Override</span>
                                                <input
                                                    type="checkbox"
                                                    checked={!!r.enabled}
                                                    onChange={(e) => updateRow(b._id, { enabled: e.target.checked })}
                                                    className="h-4 w-4 accent-orange-500"
                                                />
                                            </label>
                                        </div>

                                        {r.enabled && (
                                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3">
                                                <div>
                                                    <label className="block text-[11px] text-gray-600 mb-1">Base Price</label>
                                                    <input
                                                        type="number"
                                                        min="0"
                                                        step="0.01"
                                                        value={r.basePrice}
                                                        onChange={(e) => updateRow(b._id, { basePrice: e.target.value })}
                                                        className="w-full h-9 px-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-orange-500"
                                                    />
                                                </div>
                                                <div>
                                                    <label className="block text-[11px] text-gray-600 mb-1">Offer %</label>
                                                    <input
                                                        type="number"
                                                        min="0"
                                                        max="100"
                                                        value={r.offerPercentage}
                                                        onChange={(e) => updateRow(b._id, { offerPercentage: e.target.value })}
                                                        className="w-full h-9 px-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-orange-500"
                                                    />
                                                </div>
                                                <div>
                                                    <label className="block text-[11px] text-gray-600 mb-1">Final Price</label>
                                                    <input
                                                        type="text"
                                                        value={`₹${finalPrice.toFixed(2)}`}
                                                        readOnly
                                                        className="w-full h-9 px-2.5 border border-gray-200 rounded-lg text-sm bg-gray-50 text-gray-700"
                                                    />
                                                </div>
                                                <div>
                                                    <label className="block text-[11px] text-gray-600 mb-1">Offer Expiry</label>
                                                    <input
                                                        type="date"
                                                        value={r.offerExpiryDate}
                                                        onChange={(e) => updateRow(b._id, { offerExpiryDate: e.target.value })}
                                                        min={new Date().toISOString().split('T')[0]}
                                                        className="w-full h-9 px-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-orange-500"
                                                    />
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )
                            })}
                        </div>
                    )}
                </div>

                <div className="flex items-center justify-between gap-3 p-4 border-t border-gray-100 bg-gray-50 rounded-b-2xl">
                    <span className="text-xs text-gray-500">
                        {enabledCount > 0
                            ? `${enabledCount} branch override${enabledCount === 1 ? '' : 's'} enabled`
                            : 'All branches use the default price'}
                    </span>
                    <div className="flex gap-2">
                        <button
                            onClick={onClose}
                            disabled={saving}
                            className="h-10 px-4 rounded-xl border border-gray-200 text-gray-700 font-medium text-sm hover:bg-gray-100 disabled:opacity-60"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleSave}
                            disabled={saving || loading || branches.length === 0}
                            className="h-10 px-4 rounded-xl bg-orange-500 hover:bg-orange-600 disabled:opacity-60 text-white font-semibold text-sm flex items-center gap-2"
                        >
                            {saving && <Loader2 size={14} className="animate-spin" />}
                            {saving ? 'Saving…' : 'Save Changes'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    )
}

export default BranchPricesModal
