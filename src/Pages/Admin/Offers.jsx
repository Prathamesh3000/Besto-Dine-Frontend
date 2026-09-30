import React, { useState, useEffect, useCallback } from 'react'
import {
    Plus, Edit2, Trash2, Calendar, X,
    ChevronDown, ChevronRight, CheckCircle2, AlertTriangle, Loader2, RefreshCw
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'react-hot-toast'
import api from '../../utils/api'
import CreateOfferModal from './components/CreateOfferModal'
import ConfirmModal from './components/ConfirmModal'
import { SkeletonRows } from '../../Components/Common/Skeleton'

/* ─────────────────────────────────────────────────────────────────────────────
   Helpers
───────────────────────────────────────────────────────────────────────────── */

/** Derive display status purely from dates (isActive controls the toggle, not the tab). */
const deriveStatus = (coupon) => {
    const now = new Date()
    if (new Date(coupon.endDate) < now) return 'Expired'
    if (new Date(coupon.startDate) > now) return 'Scheduled'
    return 'Active'
}

const getStatusStyle = (status) => {
    if (status === 'Active')    return 'border-[#22C55E] text-[#22C55E] bg-[#F0FDF4]'
    if (status === 'Scheduled') return 'border-[#3B82F6] text-[#3B82F6] bg-[#EFF6FF]'
    return 'border-gray-400 text-gray-500 bg-gray-50'
}

// ADM-064 — bidirectional mapping between the UI "Applicable On" dropdown
// and the backend `scope` enum. Without this, "Food Only" and "Beverages
// Only" were both collapsed onto the same generic flag and the backend
// had no way to filter the discount to a specific item type.
const SCOPE_TO_LABEL = { all: 'All Items', food: 'Food Only', beverages: 'Beverages Only' };
const LABEL_TO_SCOPE = { 'All Items': 'all', 'Food Only': 'food', 'Beverages Only': 'beverages' };

/** Map a Coupon document from the API into the edit-form shape. */
const toForm = (coupon) => ({
    title:        coupon.title || '',
    code:         coupon.code  || '',
    description:  coupon.description || '',
    discountType: coupon.discountType === 'percentage' ? 'Percentage' : 'Fixed Amount',
    discount:     String(coupon.discountValue    ?? ''),
    minOrder:     String(coupon.minOrderValue    ?? ''),
    maxDiscount:  String(coupon.maxDiscountAmount ?? ''),
    validFrom:    coupon.startDate ? new Date(coupon.startDate).toISOString().split('T')[0] : '',
    validTill:    coupon.endDate   ? new Date(coupon.endDate).toISOString().split('T')[0]   : '',
    startTime:    coupon.startTime || '',
    endTime:      coupon.endTime   || '',
    items:        SCOPE_TO_LABEL[coupon.scope || 'all'] || 'All Items',
    status:       deriveStatus(coupon),
})

/** Map the edit-form shape back into an API request body. */
const toApi = (form) => {
    const scope = LABEL_TO_SCOPE[form.items] || 'all';
    return {
        title:             form.title.trim(),
        code:              form.code.trim().toUpperCase(),
        description:       form.description.trim(),
        discountType:      form.discountType === 'Percentage' ? 'percentage' : 'fixed_amount',
        discountValue:     parseFloat(form.discount)    || 0,
        minOrderValue:     parseFloat(form.minOrder)    || 0,
        maxDiscountAmount: parseFloat(form.maxDiscount) || 0,
        startDate:         form.validFrom,
        endDate:           form.validTill,
        startTime:         form.startTime,
        endTime:           form.endTime,
        couponCategory:    scope === 'all' ? 'all' : 'specific_category',
        scope,
        isActive:          true,
    };
};

/* ─────────────────────────────────────────────────────────────────────────────
   EditOfferModal
───────────────────────────────────────────────────────────────────────────── */
const EditOfferModal = ({ coupon, onSave, onClose, saving }) => {
    const [form, setForm] = useState({})

    useEffect(() => {
        if (coupon) setForm(toForm(coupon))
    }, [coupon])

    if (!coupon) return null

    const set = (key) => (e) => setForm(prev => ({ ...prev, [key]: e.target.value }))

    const field = (label, key, placeholder, type = 'text') => (
        <div>
            <label className="block text-[13px] font-medium text-[#1A181B] mb-1.5">{label}</label>
            <input
                type={type}
                value={form[key] || ''}
                onChange={set(key)}
                placeholder={placeholder}
                className="w-full h-11 px-4 rounded-xl border border-gray-200 bg-white text-[13px] outline-none focus:border-[#FE8301] transition-colors"
            />
        </div>
    )

    const handleSave = () => {
        if (!form.title?.trim())  { toast.error('Offer name is required');     return }
        if (!form.code?.trim())   { toast.error('Promo code is required');     return }
        if (!form.validTill)      { toast.error('Valid Till date is required'); return }
        if (!form.discount)       { toast.error('Discount value is required'); return }
        const discountNum = parseFloat(form.discount)
        if (isNaN(discountNum) || discountNum <= 0) { toast.error('Discount must be a positive number'); return }
        if (form.discountType === 'Percentage' && discountNum > 100) { toast.error('Percentage cannot exceed 100'); return }
        if (form.validFrom && form.validTill && form.validFrom > form.validTill) { toast.error('Valid Till must be after Valid From'); return }
        if (parseFloat(form.minOrder) < 0) { toast.error('Min order value cannot be negative'); return }
        if (parseFloat(form.maxDiscount) < 0) { toast.error('Max discount cannot be negative'); return }
        onSave(form)
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />
            <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-[600px] max-h-[90vh] flex flex-col animate-in fade-in zoom-in duration-200">

                {/* Header */}
                <div className="flex justify-between items-center px-6 py-4 border-b border-gray-100">
                    <div>
                        <h2 className="text-[18px] font-bold text-[#1A181B]">Edit Offer</h2>
                        <p className="text-[12px] text-gray-400 font-normal">Update the offer details below</p>
                    </div>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
                        <X size={22} />
                    </button>
                </div>

                {/* Body */}
                <div className="p-6 overflow-y-auto flex-1 space-y-4">

                    {/* Basic */}
                    <div className="bg-[#FAF5FF] rounded-xl p-4 grid grid-cols-2 gap-4">
                        {field('Offer Name', 'title', 'e.g. Lunch Special')}
                        {field('Promo Code', 'code', 'e.g. LUNCH20')}
                        <div className="col-span-2">
                            <label className="block text-[13px] font-medium text-[#1A181B] mb-1.5">Description</label>
                            <textarea
                                value={form.description || ''}
                                onChange={set('description')}
                                placeholder="Short description..."
                                rows={2}
                                className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-white text-[13px] outline-none focus:border-[#FE8301] transition-colors resize-none"
                            />
                        </div>
                    </div>

                    {/* Discount */}
                    <div className="bg-[#FAF5FF] rounded-xl p-4 grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-[13px] font-medium text-[#1A181B] mb-1.5">Discount Type</label>
                            <div className="relative">
                                <select
                                    className="w-full h-11 px-4 rounded-xl border border-gray-200 bg-white text-[13px] outline-none focus:border-[#FE8301] appearance-none text-gray-700 transition-colors"
                                    value={form.discountType || 'Percentage'}
                                    onChange={set('discountType')}
                                >
                                    <option>Percentage</option>
                                    <option>Fixed Amount</option>
                                </select>
                                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" size={16} />
                            </div>
                        </div>
                        {field('Discount Value', 'discount', form.discountType === 'Percentage' ? 'e.g. 20' : 'e.g. 100', 'number')}
                        {field('Min. Order Value (₹)', 'minOrder', 'e.g. 500', 'number')}
                        {field('Max. Discount (₹)', 'maxDiscount', 'e.g. 200', 'number')}
                    </div>

                    {/* Validity */}
                    <div className="bg-[#FAF5FF] rounded-xl p-4 grid grid-cols-2 gap-4">
                        {field('Valid From', 'validFrom', '', 'date')}
                        {field('Valid Till', 'validTill', '', 'date')}
                        {field('Start Time (optional)', 'startTime', '', 'time')}
                        {field('End Time (optional)', 'endTime', '', 'time')}
                        <div>
                            <label className="block text-[13px] font-medium text-[#1A181B] mb-1.5">Applicable On</label>
                            <div className="relative">
                                <select
                                    className="w-full h-11 px-4 rounded-xl border border-gray-200 bg-white text-[13px] outline-none focus:border-[#FE8301] appearance-none text-gray-700 transition-colors"
                                    value={form.items || 'All Items'}
                                    onChange={set('items')}
                                >
                                    <option>All Items</option>
                                    <option>Food Only</option>
                                    <option>Beverages Only</option>
                                </select>
                                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" size={16} />
                            </div>
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="flex gap-3 px-6 py-4 border-t border-gray-100">
                    <button
                        onClick={onClose}
                        disabled={saving}
                        className="flex-1 h-11 rounded-xl border border-gray-200 text-gray-600 font-semibold text-[14px] hover:bg-gray-50 transition-colors disabled:opacity-50"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={saving}
                        className="flex-1 h-11 rounded-xl bg-[#FE8301] text-white font-semibold text-[14px] hover:bg-orange-600 transition-colors shadow-sm disabled:opacity-60 flex items-center justify-center gap-2"
                    >
                        {saving && <Loader2 size={15} className="animate-spin" />}
                        {saving ? 'Saving…' : 'Save Changes'}
                    </button>
                </div>
            </div>
        </div>
    )
}

/* ─────────────────────────────────────────────────────────────────────────────
   Main Offers Page
───────────────────────────────────────────────────────────────────────────── */
const Offers = () => {
    const navigate = useNavigate()

    const [coupons,            setCoupons]            = useState([])
    const [loading,            setLoading]            = useState(true)
    const [saving,             setSaving]             = useState(false)
    const [activeTab,          setActiveTab]          = useState('All')
    const [isCreateModalOpen,  setIsCreateModalOpen]  = useState(false)
    const [deleteTarget,       setDeleteTarget]       = useState(null)
    const [editTarget,         setEditTarget]         = useState(null)
    const [activationSuccess,  setActivationSuccess]  = useState(null)
    const [deactivationNotice, setDeactivationNotice] = useState(null)

    /* ── Fetch ──────────────────────────────────────────────────────────── */
    // Defensive: response.coupons must be an array. If the backend ever
    // returns a non-array (success:false body, response-shape drift,
    // feature-gate 403 caught up the chain), fall back to [] so reduce/map
    // can't crash mid-render — that crash used to leave stats half-computed
    // from stale state while the list rendered empty.
    const fetchCoupons = useCallback(async () => {
        try {
            setLoading(true)
            const res = await api.get('/promotions/coupons')
            if (res.data?.success && Array.isArray(res.data.coupons)) {
                setCoupons(res.data.coupons)
            } else {
                setCoupons([])
                toast.error(res.data?.message || 'Failed to load offers')
            }
        } catch (err) {
            setCoupons([])
            const msg = err?.response?.data?.message || err?.message || 'Failed to load offers'
            toast.error(msg)
            console.error('[Offers] fetchCoupons failed:', err)
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => { fetchCoupons() }, [fetchCoupons])

    /* ── Computed Stats ─────────────────────────────────────────────────── */
    const totalActive      = coupons.filter(c => deriveStatus(c) === 'Active' && c.isActive).length
    const totalRedemptions = coupons.reduce((sum, c) => sum + (c.usageCount || 0), 0)
    // Conversion Rate = average % of the usage cap each coupon has burned
    // through, computed ONLY over coupons that actually have a cap. The
    // old version summed every coupon's cap (default 1000) into one giant
    // denominator, so a single coupon with 12 redemptions on a 1000-cap
    // showed 1.2% / 0.0% depending on how many uncapped coupons existed.
    // Coupons with usageLimit=0 (unlimited) are excluded — there's no
    // meaningful "rate" for an uncapped coupon.
    const cappedCoupons = coupons.filter(c => (c.usageLimit || 0) > 0)
    const conversionRate = cappedCoupons.length > 0
        ? (cappedCoupons.reduce((sum, c) => sum + ((c.usageCount || 0) / c.usageLimit), 0) / cappedCoupons.length * 100).toFixed(1)
        : null

    const stats = [
        { label: 'Total Offers',      value: String(coupons.length),   clickable: false },
        { label: 'Active Offers',     value: String(totalActive),      clickable: false },
        { label: 'Total Redemptions', value: String(totalRedemptions), clickable: true, route: 'redemption' },
        { label: 'Conversion Rate',   value: conversionRate === null ? '—' : `${conversionRate}%`, clickable: true, route: 'performance' },
    ]

    /* ── Create ─────────────────────────────────────────────────────────── */
    const handleCreate = async (form, resetForm) => {
        if (!form.title?.trim() || !form.code?.trim() || !form.validTill || !form.discount) {
            toast.error('Name, promo code, discount value and Valid Till are required')
            return
        }
        const discountNum = parseFloat(form.discount)
        if (isNaN(discountNum) || discountNum <= 0) { toast.error('Discount must be a positive number'); return }
        if (form.discountType === 'Percentage' && discountNum > 100) { toast.error('Percentage cannot exceed 100'); return }
        if (form.validFrom && form.validTill && form.validFrom > form.validTill) { toast.error('Valid Till must be after Valid From'); return }
        try {
            setSaving(true)
            const res = await api.post('/promotions/coupons', toApi(form))
            if (res.data.success) {
                setCoupons(prev => [res.data.coupon, ...prev])
                setIsCreateModalOpen(false)
                resetForm?.()
                toast.success('Offer created successfully')
            }
        } finally {
            setSaving(false)
        }
    }

    /* ── Edit ───────────────────────────────────────────────────────────── */
    const handleEdit = async (form) => {
        try {
            setSaving(true)
            const res = await api.put(`/promotions/coupons/${editTarget._id}`, toApi(form))
            if (res.data.success) {
                setCoupons(prev => prev.map(c => c._id === editTarget._id ? res.data.coupon : c))
                setEditTarget(null)
                toast.success('Offer updated')
            }
        } finally {
            setSaving(false)
        }
    }

    /* ── Delete ─────────────────────────────────────────────────────────── */
    const handleDelete = async () => {
        try {
            const res = await api.delete(`/promotions/coupons/${deleteTarget._id}`)
            if (res.data.success) {
                setCoupons(prev => prev.filter(c => c._id !== deleteTarget._id))
                toast.success('Offer deleted')
            }
        } finally {
            setDeleteTarget(null)
        }
    }

    /* ── Toggle isActive ────────────────────────────────────────────────── */
    const handleToggle = async (coupon) => {
        const newActive = !coupon.isActive
        // Optimistic update
        setCoupons(prev => prev.map(c => c._id === coupon._id ? { ...c, isActive: newActive } : c))
        if (newActive) setActivationSuccess(coupon.title)
        else           setDeactivationNotice(coupon.title)
        try {
            await api.put(`/promotions/coupons/${coupon._id}`, { isActive: newActive })
        } catch {
            // Revert on API failure
            setCoupons(prev => prev.map(c => c._id === coupon._id ? { ...c, isActive: coupon.isActive } : c))
            toast.error('Failed to update offer status')
        }
    }

    /* ── Filter ─────────────────────────────────────────────────────────── */
    const filteredCoupons = activeTab === 'All'
        ? coupons
        : coupons.filter(c => deriveStatus(c) === activeTab)

    /* ── Render ─────────────────────────────────────────────────────────── */
    return (
        <div className="h-full flex flex-col p-6 overflow-y-auto font-manrope">

            {/* Header */}
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h1 className="font-bold text-[20px] leading-[26px] text-[#1A181B] font-manrope">Offers & Promotions</h1>
                    <p className="font-semibold text-[16px] leading-[22px] text-[#645E66] mt-1 font-manrope">Create and manage special offers and discounts</p>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={fetchCoupons}
                        disabled={loading}
                        title="Refresh offers"
                        className="flex items-center gap-2 px-4 py-2.5 bg-white text-gray-600 rounded-xl text-[14px] font-semibold border border-gray-200 hover:bg-gray-50 transition-colors shadow-sm disabled:opacity-50"
                    >
                        <RefreshCw size={16} className={loading ? 'animate-spin' : ''} strokeWidth={2.5} />
                        Refresh
                    </button>
                    <button
                        onClick={() => setIsCreateModalOpen(true)}
                        className="flex items-center gap-2 px-5 py-2.5 bg-[#FE8301] text-white rounded-xl text-[14px] font-semibold border border-[#FE8301] hover:bg-orange-600 transition-colors shadow-sm"
                    >
                        <Plus size={18} strokeWidth={2.5} />
                        Add Offer
                    </button>
                </div>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-4 gap-4 mb-6">
                {stats.map((stat) => (
                    <div
                        key={stat.label}
                        className={`p-5 bg-white rounded-[16px] border border-gray-100 shadow-sm transition-all flex items-center justify-between ${stat.clickable ? 'cursor-pointer hover:border-[#FE8301] hover:shadow-md' : ''}`}
                        onClick={() => stat.clickable && navigate(stat.route)}
                    >
                        <div>
                            <p className="text-[13px] font-medium text-gray-500 mb-2">{stat.label}</p>
                            <span className="text-[22px] font-bold text-[#1A181B]">{stat.value}</span>
                        </div>
                        {stat.clickable && <ChevronRight size={22} className="text-gray-400 shrink-0" strokeWidth={2.5} />}
                    </div>
                ))}
            </div>

            {/* Tabs */}
            <div className="flex gap-2.5 mb-6">
                {['All', 'Active', 'Scheduled', 'Expired'].map(tab => (
                    <button
                        key={tab}
                        onClick={() => setActiveTab(tab)}
                        className={`px-6 py-2 rounded-full text-[14px] transition-colors border ${activeTab === tab
                            ? 'bg-white text-[#9333EA] border-[#9333EA] font-semibold'
                            : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50 font-medium'
                        }`}
                    >
                        {tab}
                    </button>
                ))}
            </div>

            {/* Offers Grid */}
            {loading ? (
                <SkeletonRows count={6} className="px-4" />
            ) : filteredCoupons.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center text-gray-400 gap-3">
                    <p className="text-[16px] font-semibold">No offers found</p>
                    <p className="text-[13px] text-center max-w-105">
                        {activeTab !== 'All' && coupons.length > 0
                            ? `No ${activeTab.toLowerCase()} offers right now. Try the "All" tab to see all ${coupons.length} offer${coupons.length === 1 ? '' : 's'}.`
                            : coupons.length === 0
                                ? 'No offers in this branch yet. Click "Add Offer" to create your first, or "Refresh" if you just created one.'
                                : `No ${activeTab.toLowerCase()} offers right now`}
                    </p>
                    {coupons.length === 0 && (
                        <button
                            onClick={fetchCoupons}
                            className="flex items-center gap-2 px-4 py-2 bg-white text-[#FE8301] rounded-lg text-[13px] font-semibold border border-[#FE8301] hover:bg-orange-50 transition-colors mt-1"
                        >
                            <RefreshCw size={14} strokeWidth={2.5} />
                            Refresh
                        </button>
                    )}
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    {filteredCoupons.map((coupon) => {
                        const status = deriveStatus(coupon)

                        const discountDisplay = coupon.discountType === 'percentage'
                            ? `${coupon.discountValue}% off`
                            : `₹${coupon.discountValue} off`

                        const timings = coupon.startTime && coupon.endTime
                            ? `${coupon.startTime} – ${coupon.endTime}`
                            : 'All Day'

                        const fmtDate = (d) => new Date(d).toLocaleDateString('en-IN', {
                            day: 'numeric', month: 'short', year: 'numeric'
                        })
                        const validityDisplay = `${fmtDate(coupon.startDate)} – ${fmtDate(coupon.endDate)}`

                        const usagePercent = coupon.usageLimit > 0
                            ? Math.min((coupon.usageCount / coupon.usageLimit) * 100, 100)
                            : 0

                        return (
                            <div key={coupon._id} className="bg-white rounded-[20px] border border-gray-100 p-5 shadow-sm flex flex-col">

                                {/* Card Header */}
                                <div className="flex justify-between items-start mb-3">
                                    <div className="flex-1 min-w-0 mr-3">
                                        <div className="flex items-center gap-2.5 mb-1.5 flex-wrap">
                                            <h3 className="text-[18px] font-bold text-[#1A181B]">{coupon.title}</h3>
                                            <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${getStatusStyle(status)}`}>
                                                {status}
                                            </span>
                                        </div>
                                        <p className="text-[13px] font-medium text-gray-400 line-clamp-1">{coupon.description}</p>
                                    </div>
                                    <div className="flex items-center gap-3 shrink-0">
                                        <button
                                            onClick={() => setEditTarget(coupon)}
                                            className="text-gray-400 hover:text-[#FE8301] transition-colors"
                                            title="Edit offer"
                                        >
                                            <Edit2 size={18} strokeWidth={2} />
                                        </button>
                                        <button
                                            onClick={() => setDeleteTarget(coupon)}
                                            className="text-gray-400 hover:text-[#EF4444] transition-colors"
                                            title="Delete offer"
                                        >
                                            <Trash2 size={18} strokeWidth={2} />
                                        </button>
                                        {/* Toggle — an expired offer can't meaningfully be "on":
                                            its date window has closed, so the backend won't apply
                                            it regardless of isActive. We therefore render it OFF +
                                            disabled the moment it expires (re-derived from dates on
                                            every render, so it flips in real time without mutating
                                            isActive in the DB). To revive an expired offer, extend
                                            its Valid Till date via Edit — not this switch. */}
                                        {(() => {
                                            const isExpired = status === 'Expired'
                                            const on = coupon.isActive && !isExpired
                                            return (
                                                <button
                                                    onClick={() => { if (!isExpired) handleToggle(coupon) }}
                                                    disabled={isExpired}
                                                    className={`w-[36px] h-[20px] rounded-full relative transition-colors duration-300 ${on ? 'bg-[#22C55E]' : 'bg-gray-300'} ${isExpired ? 'opacity-50 cursor-not-allowed' : ''}`}
                                                    title={isExpired
                                                        ? 'Offer expired — extend the Valid Till date to re-enable'
                                                        : (coupon.isActive ? 'Disable offer' : 'Enable offer')}
                                                >
                                                    <div className={`absolute top-[2px] left-[2px] w-[16px] h-[16px] bg-white rounded-full transition-transform duration-300 shadow-sm ${on ? 'translate-x-[16px]' : 'translate-x-0'}`} />
                                                </button>
                                            )
                                        })()}
                                    </div>
                                </div>

                                {/* Promo Box */}
                                <div className="bg-[#FFFAEB] border border-[#FDE68A] rounded-xl p-3 mb-5 flex justify-between items-center">
                                    <div>
                                        <p className="text-[11px] text-[#D97706] font-semibold mb-0.5">Promo Code</p>
                                        <p className="text-[14px] font-bold text-[#1A181B] uppercase">{coupon.code}</p>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-[11px] text-[#D97706] font-semibold mb-0.5">Discount</p>
                                        <p className="text-[14px] font-bold text-[#1A181B]">{discountDisplay}</p>
                                    </div>
                                </div>

                                {/* Details — all labels and values are correctly matched */}
                                <div className="space-y-3.5 mb-6">
                                    <div className="flex justify-between items-center text-[13px]">
                                        <span className="text-gray-500 font-medium">Min. Order:</span>
                                        <span className="font-semibold text-[#1A181B]">₹{coupon.minOrderValue}</span>
                                    </div>
                                    <div className="flex justify-between items-center text-[13px]">
                                        <span className="text-gray-500 font-medium">Max. Discount:</span>
                                        <span className="font-semibold text-[#1A181B]">
                                            {coupon.maxDiscountAmount > 0 ? `₹${coupon.maxDiscountAmount}` : '—'}
                                        </span>
                                    </div>
                                    <div className="flex justify-between items-center text-[13px]">
                                        <span className="text-gray-500 font-medium">Applicable On:</span>
                                        <span className="font-semibold text-[#1A181B]">
                                            {coupon.couponCategory === 'all' ? 'All Items' : 'Specific Items'}
                                        </span>
                                    </div>
                                    <div className="flex justify-between items-center text-[13px]">
                                        <span className="text-gray-500 font-medium">Timings:</span>
                                        <span className="font-semibold text-[#1A181B]">{timings}</span>
                                    </div>
                                    <div className="flex items-center gap-2 text-[13px] text-gray-500 pt-0.5">
                                        <Calendar size={15} />
                                        <span className="font-medium">Valid: {validityDisplay}</span>
                                    </div>
                                </div>

                                {/* Usage Progress */}
                                <div className="mt-auto">
                                    <div className="flex justify-between items-center text-[12px] mb-2">
                                        <span className="text-gray-500 font-medium">Usage</span>
                                        <span className="text-gray-500 text-[11px] font-semibold">
                                            {coupon.usageCount} / {coupon.usageLimit}
                                        </span>
                                    </div>
                                    <div className="h-1.5 w-full bg-gray-100 rounded-full overflow-hidden">
                                        <div
                                            className="h-full bg-[#FE8301] rounded-full transition-all"
                                            style={{ width: `${usagePercent}%` }}
                                        />
                                    </div>
                                </div>
                            </div>
                        )
                    })}
                </div>
            )}

            {/* ── Modals & Popups ──────────────────────────────────────────────────── */}

            <CreateOfferModal
                isOpen={isCreateModalOpen}
                onClose={() => setIsCreateModalOpen(false)}
                onSave={handleCreate}
                saving={saving}
            />

            <ConfirmModal
                isOpen={!!deleteTarget}
                title="Delete Offer"
                message={deleteTarget ? `Are you sure you want to delete "${deleteTarget.title}"? This action cannot be undone.` : ''}
                confirmLabel="Delete"
                onConfirm={handleDelete}
                onClose={() => setDeleteTarget(null)}
            />

            <EditOfferModal
                coupon={editTarget}
                onSave={handleEdit}
                onClose={() => setEditTarget(null)}
                saving={saving}
            />

            {/* Deactivation Notice */}
            {deactivationNotice && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 font-manrope">
                    <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" onClick={() => setDeactivationNotice(null)} />
                    <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 flex flex-col items-center gap-3">
                        <button onClick={() => setDeactivationNotice(null)} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition-colors">
                            <X size={20} />
                        </button>
                        <div className="size-14 rounded-full bg-yellow-50 flex items-center justify-center">
                            <AlertTriangle size={28} className="text-yellow-500" strokeWidth={2} />
                        </div>
                        <div className="text-center px-2">
                            <h3 className="text-lg font-bold text-gray-900 mb-1.5">Offer Deactivated</h3>
                            <p className="text-sm text-gray-500 font-normal leading-relaxed">
                                "{deactivationNotice}" is now paused and hidden from customers until re-enabled.
                            </p>
                        </div>
                    </div>
                </div>
            )}

            {/* Activation Success */}
            {activationSuccess && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 font-manrope">
                    <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" onClick={() => setActivationSuccess(null)} />
                    <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 flex flex-col items-center gap-3">
                        <button onClick={() => setActivationSuccess(null)} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition-colors">
                            <X size={20} />
                        </button>
                        <div className="size-14 rounded-full bg-green-50 flex items-center justify-center">
                            <CheckCircle2 size={28} className="text-green-500" strokeWidth={2} />
                        </div>
                        <div className="text-center px-2">
                            <h3 className="text-lg font-bold text-gray-900 mb-1.5">Offer Activated</h3>
                            <p className="text-sm text-gray-500 font-normal leading-relaxed">
                                "{activationSuccess}" is now live and visible to customers immediately.
                            </p>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}

export default Offers
