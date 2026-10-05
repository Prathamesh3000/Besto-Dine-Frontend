import React, { useState, useRef, useEffect } from 'react'
import { X, Search, Plus, Minus } from 'lucide-react'
import api, { settingsAPI } from '../../../utils/api'
import toast from 'react-hot-toast'
import { computeBill, toTaxConfig } from '../../../utils/billing'

// ─── Main Modal ─────────────────────────────────────────────────────────────
const AddTakeawayOrderModal = ({ onClose, onPlaceOrder, adminBranches, activeBranchId, isBranchLocked }) => {
    // Order type
    const [orderType, setOrderType] = useState('new-customer') // 'new-customer' | 'admin'

    // Customer fields
    const [customerName, setCustomerName] = useState('')
    const [customerMobile, setCustomerMobile] = useState('')

    // Item search
    const [itemSearch, setItemSearch] = useState('')
    const [showSuggest, setShowSuggest] = useState(false)
    const searchRef = useRef(null)

    // Cart: [{ menuItem, qty, note }]
    const [cartItems, setCartItems] = useState([])

    // Charges — initialized with defaults, overridden by settings API
    // Flattened Settings.taxes (see utils/billing toTaxConfig). The bill
    // itself is computed by computeBill with orderType 'takeaway', which
    // owns the dine-in-only service-charge rule.
    const [taxConfig, setTaxConfig] = useState(() => toTaxConfig(null))
    const [discountAmt, setDiscountAmt] = useState(0)

    const [menuItems, setMenuItems] = useState([])
    const [, setLoadingMenu] = useState(false)

    // Branch selection for takeaway. Prefer the authoritative branch list
    // from AdminBranchContext (Phase 6+ /branches collection) so this modal
    // doesn't fail "Please select a branch" when the legacy
    // settings.branches field is empty. Falls back to settings.branches
    // only if the caller didn't pass any.
    const injectedBranches = Array.isArray(adminBranches)
        ? adminBranches.filter(b => b.isActive !== false)
        : []
    const [branches, setBranches] = useState(injectedBranches)
    const [selectedBranchId, setSelectedBranchId] = useState(() => {
        if (activeBranchId) return activeBranchId
        if (injectedBranches.length === 1) return injectedBranches[0]._id || injectedBranches[0].name
        return ''
    })

    // ── fetch menu + tax settings + (fallback) branches ─────────────────
    useEffect(() => {
        const fetchMenu = async () => {
            try {
                setLoadingMenu(true)
                const res = await api.get('/menu?limit=1000&status=active')
                setMenuItems(res.data?.data || res.data || [])
            } catch {
                toast.error('Failed to load menu')
            } finally {
                setLoadingMenu(false)
            }
        }
        fetchMenu()

        // Always fetch settings for tax rates. Only adopt settings.branches
        // when the parent didn't inject a branch list.
        settingsAPI.getSettings().then(res => {
            if (res.data) {
                const taxes = res.data.taxesAndCharges || res.data.taxes;
                if (taxes) setTaxConfig(toTaxConfig(taxes))
                if (injectedBranches.length === 0) {
                    const activeBranches = (res.data.branches || []).filter(b => b.isActive !== false)
                    setBranches(activeBranches)
                    if (activeBranches.length === 1) {
                        setSelectedBranchId(activeBranches[0]._id || activeBranches[0].name)
                    }
                }
            }
        }).catch(() => {})
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    // ── search suggestions ────────────────────────────────────────────────────
    const suggestions = itemSearch.trim()
        ? menuItems.filter(
            m => m.status === 'active' &&
                m.name?.toLowerCase().includes(itemSearch.toLowerCase())
        )
        : []

    // close suggestions on outside click
    useEffect(() => {
        const handler = (e) => {
            if (searchRef.current && !searchRef.current.contains(e.target)) {
                setShowSuggest(false)
            }
        }
        document.addEventListener('mousedown', handler)
        return () => document.removeEventListener('mousedown', handler)
    }, [])

    // ── cart helpers ──────────────────────────────────────────────────────────
    const addItem = (menuItem) => {
        setCartItems(prev => {
            const existing = prev.find(c => c.menuItem._id === menuItem._id)
            if (existing) return prev.map(c => c.menuItem._id === menuItem._id ? { ...c, qty: c.qty + 1 } : c)
            return [...prev, { menuItem, qty: 1, note: '' }]
        })
        setItemSearch('')
        setShowSuggest(false)
    }

    const incrementQty = (id) =>
        setCartItems(prev => prev.map(c => c.menuItem._id === id ? { ...c, qty: c.qty + 1 } : c))

    const decrementQty = (id) =>
        setCartItems(prev => {
            const item = prev.find(c => c.menuItem._id === id)
            if (item.qty <= 1) return prev.filter(c => c.menuItem._id !== id)
            return prev.map(c => c.menuItem._id === id ? { ...c, qty: c.qty - 1 } : c)
        })

    const updateNote = (id, note) =>
        setCartItems(prev => prev.map(c => c.menuItem._id === id ? { ...c, note } : c))

    // ── bill calculation ──────────────────────────────────────────────────────
    // Same function (and rounding) the server uses to price the order.
    // The staff Discount here is a manual discount, not a coupon: it does
    // not reduce the GST base (GST is on subtotal − coupon). The order is
    // placed at the full server bill and the discount is sent with the
    // create call as order.manualDiscount (stamped at creation), so the
    // stamped GST, the stored total and the discount all reconcile.
    const bill = computeBill({
        subtotal: cartItems.reduce((s, c) => s + (c.menuItem.finalPrice || c.menuItem.basePrice) * c.qty, 0),
        taxConfig,
        orderType: 'takeaway',
    })
    const { subtotal, serviceCharge, gst: gstAmount, gstPct, serviceChargePct } = bill
    const manualDiscount = Math.min(Math.max(0, Number(discountAmt) || 0), bill.total)
    const total = Math.max(0, Math.round((bill.total - manualDiscount) * 100) / 100)

    // ── success state ─────────────────────────────────────────────────────────
    const [orderPlaced, setOrderPlaced] = useState(false)

    // auto-close success popup after 2.5 s
    useEffect(() => {
        if (!orderPlaced) return
        const t = setTimeout(onClose, 2500)
        return () => clearTimeout(t)
    }, [orderPlaced, onClose])

    // ── place order ───────────────────────────────────────────────────────────
    const selectedBranchObj = branches.find(b => (b._id || b.name) === selectedBranchId)
        || (branches.length === 1 ? branches[0] : null)
    const selectedBranchName = selectedBranchObj?.name || ''

    // Inline branch-required error — replaces the previous toast.
    const [branchError, setBranchError] = useState('')

    const handlePlaceOrder = () => {
        if (!cartItems.length) return
        if (!selectedBranchName) {
            setBranchError('Please select a pickup branch before placing the order')
            setTimeout(() => {
                const el = document.getElementById('pickupBranch')
                if (el) { try { el.focus() } catch { /* noop */ } el.scrollIntoView?.({ behavior: 'smooth', block: 'center' }) }
            }, 0)
            return
        }
        setBranchError('')
        // Phase 6 step 4 — the free-text pickup location goes to
        // order.pickupLocation. If the selected branch is a real
        // Phase 6 Branch doc (has _id), also send its id as
        // branchId so the order is properly linked on the per-
        // branch dashboard, not just labelled.
        const orderPayload = {
            type: 'takeaway',
            customerName: customerName || 'Guest',
            phone: customerMobile,
            pickupLocation: selectedBranchName,
            ...(selectedBranchObj?._id ? { branchId: selectedBranchObj._id } : {}),
            items: cartItems.map(c => ({
                menuItem: c.menuItem._id,
                name: c.menuItem.name,
                price: c.menuItem.finalPrice || c.menuItem.basePrice,
                quantity: c.qty,
                ...(c.note?.trim() ? { instructions: c.note.trim() } : {})
            })),
            total: bill.total > 0 ? bill.total : 0,
            // Staff discount, stamped on the order at creation (POST
            // /orders accepts manualDiscount from staff: ≥ 0, ≤ total,
            // paise). It stays outside order.total — no GST effect.
            ...(manualDiscount > 0 ? { manualDiscount: Math.round(manualDiscount * 100) / 100 } : {}),
            note: orderType === 'admin' ? 'Admin Order' : '',
        }
        onPlaceOrder?.(orderPayload)
        setOrderPlaced(true)
    }

    return (
        // Backdrop
        <div
            className="fixed inset-0 z-50 flex items-center justify-center px-4"
            style={{ backgroundColor: 'rgba(0,0,0,0.40)' }}
            onClick={onClose}
        >
            {/* ── SUCCESS POPUP ── */}
            {orderPlaced ? (
                <div
                    className="relative bg-white rounded-2xl shadow-2xl px-10 py-8 flex flex-col items-center text-center w-full max-w-[360px] animate-[fadeInScale_0.25s_ease]"
                    onClick={e => e.stopPropagation()}
                >
                    {/* X close */}
                    <button
                        onClick={onClose}
                        className="absolute top-4 right-4 w-7 h-7 flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                    >
                        <X size={16} />
                    </button>

                    {/* Green check circle */}
                    <div className="w-14 h-14 rounded-full border-2 border-[#22C55E] flex items-center justify-center mb-4">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                            <path d="M5 13L9 17L19 7" stroke="#22C55E" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                    </div>

                    {/* Title */}
                    <h2 className="text-[20px] font-[700] font-manrope text-[#1A181B] leading-[26px] mb-2">
                        Order Placed successfully
                    </h2>

                    {/* Subtitle */}
                    <p className="text-[14px] font-[400] font-manrope text-[#645E66] leading-[20px]">
                        Your order has been successfully placed.
                    </p>
                </div>
            ) : (
                <div
                    className="relative w-full max-w-[700px] max-h-[90vh] bg-white flex flex-col rounded-2xl shadow-2xl overflow-hidden"
                    onClick={e => e.stopPropagation()}
                >
                    {/* ── Header ── */}
                    <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
                        <div className="flex items-center gap-3">
                            <h2 className="text-[18px] font-[700] font-manrope text-[#1A181B]">Add New Order</h2>
                            <span className="px-3 py-1 bg-[#FFF3E6] text-[#FE8301] text-[12px] font-[600] font-manrope rounded-full border border-[#FE8301]">
                                Takeaway
                            </span>
                        </div>
                        <button
                            onClick={onClose}
                            className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                        >
                            <X size={18} />
                        </button>
                    </div>

                    {/* ── Scrollable body ── */}
                    <div className="flex-1 overflow-y-auto px-6 py-4 flex flex-col gap-4">

                        {/* Order Type */}
                        <div>
                            <p className="text-[13px] font-[600] font-manrope text-[#1A181B] mb-2">Select Order Type</p>
                            <div className="grid grid-cols-2 gap-3">
                                {[
                                    { value: 'new-customer', label: 'New Customer' },
                                    { value: 'admin', label: 'Admin' },
                                ].map(opt => (
                                    <button
                                        key={opt.value}
                                        onClick={() => setOrderType(opt.value)}
                                        className={`flex items-center gap-2 px-4 py-3 rounded-xl border-[1.5px] text-[14px] font-[600] font-manrope transition-all ${orderType === opt.value
                                            ? 'border-[#FE8301] bg-[#FFF3E6] text-[#FE8301]'
                                            : 'border-gray-200 bg-white text-[#344054] hover:border-gray-300'
                                            }`}
                                    >
                                        {/* Radio circle */}
                                        <span className={`w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${orderType === opt.value ? 'border-[#FE8301]' : 'border-gray-300'
                                            }`}>
                                            {orderType === opt.value && (
                                                <span className="w-2 h-2 rounded-full bg-[#FE8301]" />
                                            )}
                                        </span>
                                        {opt.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Customer Fields */}
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="block text-[13px] font-[600] font-manrope text-[#1A181B] mb-1.5">Customer Name</label>
                                <input
                                    type="text"
                                    placeholder="Enter name"
                                    value={customerName}
                                    onChange={e => setCustomerName(e.target.value)}
                                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-[14px] font-manrope text-[#1A181B] placeholder:text-gray-400 focus:outline-none focus:border-[#FE8301] focus:ring-2 focus:ring-[#FE8301]/10 transition-all"
                                />
                            </div>
                            <div>
                                <label className="block text-[13px] font-[600] font-manrope text-[#1A181B] mb-1.5">Customer Mobile number</label>
                                <input
                                    type="tel"
                                    placeholder="Enter number"
                                    value={customerMobile}
                                    onChange={e => setCustomerMobile(e.target.value)}
                                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-[14px] font-manrope text-[#1A181B] placeholder:text-gray-400 focus:outline-none focus:border-[#FE8301] focus:ring-2 focus:ring-[#FE8301]/10 transition-all"
                                />
                            </div>
                        </div>

                        {/* Branch Selector — locked for Branch Admins, picker
                            for tenant owners with multiple branches, read-only
                            display when there's only one branch. */}
                        {branches.length > 0 && (
                            <div>
                                <label htmlFor="pickupBranch" className="block text-[13px] font-semibold font-manrope text-[#1A181B] mb-1.5">
                                    Pickup branch <span className="text-red-500" aria-hidden="true">*</span>
                                </label>
                                {isBranchLocked || branches.length === 1 ? (
                                    <div className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-[14px] font-manrope text-[#1A181B] bg-gray-50">
                                        {selectedBranchName || 'No branch'}
                                    </div>
                                ) : (
                                    <select
                                        id="pickupBranch"
                                        value={selectedBranchId}
                                        onChange={e => { setSelectedBranchId(e.target.value); if (branchError) setBranchError('') }}
                                        aria-required="true"
                                        aria-invalid={branchError ? 'true' : 'false'}
                                        aria-describedby={branchError ? 'pickupBranch-err' : undefined}
                                        className={`w-full px-4 py-2.5 border rounded-xl text-[14px] font-manrope text-[#1A181B] focus:outline-none focus:ring-2 transition-all bg-white ${branchError ? 'border-red-400 focus:border-red-500 focus:ring-red-200' : 'border-gray-200 focus:border-[#FE8301] focus:ring-[#FE8301]/10'}`}
                                    >
                                        <option value="">— Select branch —</option>
                                        {branches.map(b => (
                                            <option key={b._id || b.name} value={b._id || b.name}>{b.name}</option>
                                        ))}
                                    </select>
                                )}
                                {branchError && (
                                    <p id="pickupBranch-err" role="alert" className="text-xs text-red-600 mt-1 flex items-center gap-1 font-manrope">
                                        <span aria-hidden="true">⚠</span>{branchError}
                                    </p>
                                )}
                            </div>
                        )}

                        {/* + Add link */}
                        <div className="flex justify-end -mt-2">
                            <button className="flex items-center gap-1 text-[#FE8301] text-[13px] font-[600] font-manrope hover:underline">
                                <Plus size={14} strokeWidth={2.5} />
                                Add
                            </button>
                        </div>

                        {/* Item Search */}
                        <div className="relative" ref={searchRef}>
                            <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                            <input
                                type="text"
                                placeholder="Search by item name"
                                value={itemSearch}
                                onChange={e => { setItemSearch(e.target.value); setShowSuggest(true) }}
                                onFocus={() => setShowSuggest(true)}
                                className="w-full pl-10 pr-4 py-3 border-2 border-[#702083] rounded-xl text-[14px] font-manrope placeholder:text-gray-400 focus:outline-none transition-all"
                            />
                                {/* Suggestion dropdown */}
                            {showSuggest && suggestions.length > 0 && (
                                <div className="absolute top-full left-0 right-0 mt-1 bg-white rounded-2xl shadow-[0px_4px_20px_rgba(0,0,0,0.1)] border border-gray-100 z-30 overflow-hidden max-h-[300px] overflow-y-auto">
                                    {suggestions.map((item, idx) => (
                                        <div key={item._id || item.id || idx}>
                                            <button
                                                onMouseDown={() => addItem(item)}
                                                className="w-full flex items-center justify-between px-4 py-3 hover:bg-[#FFF3E6] transition-colors text-left"
                                            >
                                                <div>
                                                    <p className="text-[14px] font-[600] font-manrope text-[#1A181B]">{item.name}</p>
                                                    <p className="text-[11px] font-[500] font-manrope text-gray-400">{item.category?.name || 'Item'}</p>
                                                </div>
                                                <span className="text-[13px] font-[700] font-manrope text-[#1A181B]">₹{item.finalPrice || item.basePrice}</span>
                                            </button>
                                            {idx < suggestions.length - 1 && <div className="h-[1px] bg-gray-100 mx-4" />}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Active Order */}
                        <div>
                            <p className="text-[13px] font-[600] font-manrope text-[#645E66] mb-2">Active Order</p>

                            {cartItems.length === 0 ? (
                                <div className="py-6 text-center text-gray-400 text-[13px] font-manrope">
                                    Search and add items to the order
                                </div>
                            ) : (
                                <div className="flex flex-col divide-y divide-gray-100 max-h-[250px] overflow-y-auto">
                                    {cartItems.map(({ menuItem, qty, note }) => (
                                        <div key={menuItem._id || menuItem.id} className="py-3 pr-2">
                                            <div className="flex items-start justify-between">
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-[14px] font-[600] font-manrope text-[#1A181B]">
                                                        {menuItem.name}
                                                        <span className="text-[#645E66] ml-1">{qty}x</span>
                                                    </p>
                                                    <p className="text-[12px] font-[400] font-manrope text-[#9CA3AF] mt-0.5">{menuItem.category?.name || ''}</p>
                                                </div>
                                                <div className="flex items-center gap-3 ml-3 flex-shrink-0">
                                                    <span className="text-[14px] font-[700] font-manrope text-[#1A181B]">
                                                        ₹{((menuItem.finalPrice || menuItem.basePrice) * qty).toFixed(2)}
                                                    </span>
                                                    <div className="flex items-center gap-1">
                                                        <button
                                                            onClick={() => decrementQty(menuItem._id)}
                                                            className="w-6 h-6 flex items-center justify-center rounded-full bg-gray-100 hover:bg-red-50 hover:text-red-500 text-gray-500 transition-colors cursor-pointer"
                                                        >
                                                            <Minus size={12} />
                                                        </button>
                                                        <span className="text-[13px] font-[600] font-manrope text-[#1A181B] min-w-[16px] text-center">{qty}</span>
                                                        <button
                                                            onClick={() => incrementQty(menuItem._id)}
                                                            className="w-6 h-6 flex items-center justify-center rounded-full bg-gray-100 hover:bg-orange-50 hover:text-orange-500 text-gray-500 transition-colors cursor-pointer"
                                                        >
                                                            <Plus size={12} />
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                            <input
                                                type="text"
                                                placeholder="Special instructions (optional)"
                                                value={note}
                                                onChange={e => updateNote(menuItem._id, e.target.value)}
                                                className="mt-1.5 w-full px-3 py-1.5 text-[12px] font-manrope border border-gray-200 rounded-lg placeholder:text-gray-300 focus:outline-none focus:border-[#FE8301] transition-all"
                                            />
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* ── Bill Summary ── */}
                            {cartItems.length > 0 && (
                                <div className="mt-2 pt-3 border-t border-gray-100 flex flex-col gap-2">
                                    {/* Subtotal */}
                                    <div className="flex items-center justify-between">
                                        <span className="text-[14px] font-[400] font-manrope text-[#1A181B]">Subtotal</span>
                                        <span className="text-[14px] font-[700] font-manrope text-[#1A181B]">₹{subtotal.toFixed(2)}</span>
                                    </div>

                                    {/* Service Charge */}
                                    {serviceChargePct > 0 && (
                                        <div className="flex items-center justify-between">
                                            <span className="text-[14px] font-[400] font-manrope text-[#1A181B]">
                                                Service Charge ({serviceChargePct}%)
                                            </span>
                                            <span className="text-[14px] font-[600] font-manrope text-[#1A181B]">+₹{serviceCharge.toFixed(2)}</span>
                                        </div>
                                    )}

                                    {/* GST */}
                                    <div className="flex items-center justify-between">
                                        <span className="text-[14px] font-[400] font-manrope text-[#1A181B]">
                                            GST ({gstPct}%)
                                        </span>
                                        <span className="text-[14px] font-[600] font-manrope text-[#1A181B]">+₹{gstAmount.toFixed(2)}</span>
                                    </div>

                                    {/* Additional charges (packaging etc.) */}
                                    {bill.additionalCharges.map((c, i) => (
                                        <div key={`${c.name}-${i}`} className="flex items-center justify-between">
                                            <span className="text-[14px] font-[400] font-manrope text-[#1A181B]">
                                                {c.name}{c.type === 'Percentage' ? ` (${c.value}%)` : ''}
                                            </span>
                                            <span className="text-[14px] font-[600] font-manrope text-[#1A181B]">+₹{c.amount.toFixed(2)}</span>
                                        </div>
                                    ))}

                                    {/* Discount */}
                                    <div className="flex items-center justify-between">
                                        <span className="text-[14px] font-[400] font-manrope text-[#1A181B]">Discount (%)</span>
                                        <div className="flex items-center gap-2">
                                            <div className="flex items-center border border-[#702083] rounded-lg px-3 py-1 gap-1 text-[13px] font-[600] font-manrope text-[#1A181B]">
                                                <span>₹{discountAmt.toFixed(2)}</span>
                                                <select
                                                    value={discountAmt}
                                                    onChange={e => setDiscountAmt(Number(e.target.value))}
                                                    className="bg-transparent border-none focus:outline-none cursor-pointer text-[#702083] text-[12px] font-[600]"
                                                >
                                                    {[0, 50, 100, 150, 200].map(v => <option key={v} value={v}>₹{v}</option>)}
                                                </select>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Total */}
                                    <div className="flex items-center justify-between pt-2 border-t border-gray-100 mt-1">
                                        <span className="text-[16px] font-[700] font-manrope text-[#1A181B]">Total</span>
                                        <span className="text-[18px] font-[700] font-manrope text-[#1A181B]">₹{total.toFixed(2)}</span>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* ── Footer Buttons ── */}
                    <div className="px-6 py-4 border-t border-gray-100 grid grid-cols-2 gap-3">
                        <button
                            onClick={onClose}
                            className="py-3 rounded-xl border-2 border-[#FE8301] text-[#FE8301] text-[14px] font-[600] font-manrope hover:bg-[#FFF3E6] transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handlePlaceOrder}
                            disabled={cartItems.length === 0}
                            className="py-3 rounded-xl bg-[#FE8301] hover:bg-[#e07400] disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed text-white text-[14px] font-[600] font-manrope transition-colors"
                        >
                            Place Order
                        </button>
                    </div>
                </div>
            )}
        </div>
    )
}

export default AddTakeawayOrderModal
