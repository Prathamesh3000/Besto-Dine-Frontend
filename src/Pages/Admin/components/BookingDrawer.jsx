import React, { useState, useEffect, useCallback } from 'react'
import { X, Calendar, Clock, MapPin, Tag, Plus, Minus, ChevronDown, Loader2, Users } from 'lucide-react'
import api from '../../../utils/api'
import toast from 'react-hot-toast'
import { DEFAULT_PARKING_CONFIG, normalizeParkingDetails, describeParkingTime, titleCase } from '../../AdvanceBooking/parkingUtils'

const rupee = (n) => `₹${Math.abs(Number(n) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`

// ─── Small reusable sub-components (outside render, stable references) ───────
const Row = ({ label, value, valueColor, labelBold }) => (
    <div className="flex items-center justify-between">
        <span className={`text-[12px] ${labelBold ? 'font-[700] text-[#1A181B]' : 'text-[#8D848F]'}`}>{label}</span>
        <span className="text-[12px] font-[600]" style={{ color: valueColor || '#1A181B' }}>{value}</span>
    </div>
)

const Stepper = ({ value, onDecrement, onIncrement }) => (
    <div className="flex items-center gap-1">
        <button onClick={onDecrement} className="w-6 h-6 rounded flex items-center justify-center flex-shrink-0 transition-colors hover:bg-gray-100" style={{ border: '1px solid #DDDDDD' }}>
            <Minus size={10} className="text-[#645E66]" />
        </button>
        <span className="text-[13px] font-[600] text-[#1A181B] w-6 text-center">{String(value).padStart(2, '0')}</span>
        <button onClick={onIncrement} className="w-6 h-6 rounded flex items-center justify-center flex-shrink-0 transition-colors hover:bg-gray-100" style={{ border: '1px solid #DDDDDD' }}>
            <Plus size={10} className="text-[#645E66]" />
        </button>
    </div>
)

const InitialsAvatar = ({ name }) => {
    const initials = (name || 'G')
        .split(' ')
        .slice(0, 2)
        .map(w => w[0]?.toUpperCase() || '')
        .join('')
    return (
        <div className="w-[52px] h-[52px] rounded-full flex items-center justify-center flex-shrink-0 text-[18px] font-[700] text-[#065F46]" style={{ background: '#D1FAE5' }}>
            {initials}
        </div>
    )
}

const DrawerHeader = ({ tableName, isOngoing, bookingStatus, onClose }) => (
    <div className="flex items-center justify-between px-5 pt-4 pb-3 flex-shrink-0" style={{ background: '#F5F5F5', borderBottom: '1px solid #E5E7EB' }}>
        <div className="flex items-center gap-2">
            <span className="text-[24px] font-[800] text-[#FF8800] leading-none">{tableName}</span>
            <span className="text-[11px] font-[700] px-2.5 py-0.5 rounded-full"
                style={isOngoing
                    ? { color: '#22C55E', background: '#DCFCE7', border: '1px solid #22C55E' }
                    : { color: '#D97706', background: '#FEF3C7', border: '1px solid #D97706' }
                }>
                {bookingStatus}
            </span>
        </div>
        <button onClick={onClose} className="text-[#1A181B] hover:text-gray-600 transition-colors">
            <X size={20} />
        </button>
    </div>
)

const CustomerSection = ({ customerName, contactNumber, bookingType, specialEvent, bookingDate, bookingTime, timeSlot, guestCount, tableName, bookingNotes }) => (
    <>
        <div className="flex items-center gap-3 px-5 pt-4 pb-3">
            <InitialsAvatar name={customerName} />
            <div className="flex-1">
                <p className="text-[15px] font-[700] text-[#1A181B] leading-tight">{customerName}</p>
                <p className="text-[11px] text-[#8D848F] mt-0.5">{contactNumber}</p>
                <div className="flex items-center gap-2 mt-1">
                    <span className="inline-block px-3 py-[2px] rounded-full text-[11px] font-[600]"
                        style={{ background: '#DCFCE7', color: '#16A34A', border: '1px solid #16A34A' }}>
                        {bookingType || 'Table'}
                    </span>
                    {specialEvent && (
                        <span className="inline-block px-3 py-[2px] rounded-full text-[11px] font-[600]"
                            style={{ background: '#FDF4FF', color: '#9333EA', border: '1px solid #9333EA' }}>
                            {specialEvent}
                        </span>
                    )}
                </div>
            </div>
        </div>

        {/* Booking Info */}
        <div className="px-5 pb-3">
            <p className="text-[13px] font-[700] text-[#1A181B] mb-2">Booking Details</p>
            <div className="space-y-2">
                <div className="flex items-center gap-2 text-[12px] text-[#645E66]">
                    <Calendar size={13} className="text-[#8D848F]" /><span>{bookingDate}</span>
                </div>
                <div className="flex items-center gap-2 text-[12px] text-[#645E66]">
                    <Clock size={13} className="text-[#8D848F]" /><span>{bookingTime} ({timeSlot || 'Lunch'})</span>
                </div>
                <div className="flex items-center gap-2 text-[12px] text-[#645E66]">
                    <Users size={13} className="text-[#8D848F]" /><span>{guestCount} Guests</span>
                </div>
                <div className="flex items-center gap-2 text-[12px] text-[#645E66]">
                    <MapPin size={13} className="text-[#8D848F]" /><span>{tableName}</span>
                </div>
            </div>
        </div>

        {/* Notes */}
        {bookingNotes && bookingNotes !== 'No notes added' && (
            <div className="mx-5 mb-3 rounded-[10px] px-3 py-2.5" style={{ background: '#FFFBEB', border: '1px solid #FDE68A' }}>
                <p className="text-[11px] font-[700] text-[#92400E] mb-1">Note</p>
                <p className="text-[11px] text-[#78350F] leading-[1.5]">{bookingNotes}</p>
            </div>
        )}
    </>
)

// ─── Main Drawer Component ───────────────────────────────────────────────────
let cakeIdCounter = 0
let addonIdCounter = 0

const BookingDrawer = ({ isOpen, onClose, booking }) => {
    const [isEditMode, setIsEditMode] = useState(false)
    const [fullBooking, setFullBooking] = useState(null)
    const [loading, setLoading] = useState(false)
    const [saving, setSaving] = useState(false)

    // Edit state
    const [editCakes, setEditCakes] = useState([])
    const [editAddons, setEditAddons] = useState([])
    // Multi-vehicle parking edit (QA N10): { counts: { [vehicleType]: n }, hours }
    const [editParking, setEditParking] = useState({ counts: {}, hours: 0 })
    const [parkingTypes, setParkingTypes] = useState(DEFAULT_PARKING_CONFIG.vehicles)
    const [editDiscount, setEditDiscount] = useState(0)

    // New item inputs
    const [newCakeName, setNewCakeName] = useState('')
    const [newCakeQty, setNewCakeQty] = useState(1)
    const [newCakePrice, setNewCakePrice] = useState('')
    const [newAddonCategory, setNewAddonCategory] = useState('')
    const [newAddonPrice, setNewAddonPrice] = useState('')

    const resetEditState = useCallback(() => {
        setIsEditMode(false)
        setEditDiscount(0)
        setNewCakeName(''); setNewCakeQty(1); setNewCakePrice('')
        setNewAddonCategory(''); setNewAddonPrice('')
    }, [])

    const handleClose = useCallback(() => {
        onClose()
        resetEditState()
    }, [onClose, resetEditState])

    // Lock body scroll when drawer is open
    useEffect(() => {
        if (isOpen) {
            document.body.style.overflow = 'hidden'
            return () => { document.body.style.overflow = '' }
        }
    }, [isOpen])

    // Escape key handler
    useEffect(() => {
        if (!isOpen) return
        const onKey = (e) => { if (e.key === 'Escape') handleClose() }
        document.addEventListener('keydown', onKey)
        return () => document.removeEventListener('keydown', onKey)
    }, [isOpen, handleClose])

    // Fetch full booking details when drawer opens
    useEffect(() => {
        if (!isOpen || !booking?.id) {
            setFullBooking(null)
            return
        }
        setLoading(true)
        api.get(`/advance-booking/${booking.id}`)
            .then(res => {
                if (res.data.success) {
                    const b = res.data.booking
                    setFullBooking(b)
                    setEditCakes(
                        b.cakeDetails?.quantity > 0
                            ? [{ _key: `cake-${++cakeIdCounter}`, name: `${b.cakeDetails.flavor || 'Cake'} (${b.cakeDetails.size || '1 kg'})`, price: 0, qty: b.cakeDetails.quantity }]
                            : []
                    )
                    setEditAddons(
                        (b.addons?.otherAddons || []).map(a => ({ _key: `addon-${++addonIdCounter}`, name: a.title, price: a.price || 0 }))
                    )
                    const pk = normalizeParkingDetails(b.parkingDetails)
                    setEditParking({
                        counts: Object.fromEntries(pk.vehicles.map(v => [v.vehicleType, Number(v.count) || 0])),
                        hours: pk.hours,
                    })
                    setEditDiscount(0)
                }
            })
            .catch(() => toast.error('Failed to load booking details'))
            .finally(() => setLoading(false))
    }, [isOpen, booking?.id])

    // Vehicle types + rates the tenant offers (same source the server
    // re-prices from), so staff can add e.g. bikes to a cars-only booking.
    useEffect(() => {
        if (!isOpen) return
        api.get('/booking-info/parking', { _silent: true })
            .then(res => {
                const list = res.data?.parking?.vehicles
                if (Array.isArray(list) && list.length) setParkingTypes(list)
            })
            .catch(() => { /* defaults stay */ })
    }, [isOpen])

    if (!isOpen || !booking) return null

    // Derive display data from fullBooking (real) or booking (summary from telemetry)
    const b = fullBooking
    const customerName = b?.user?.name || booking.customer || 'Guest'
    const contactNumber = b?.user?.mobile || booking.contactNumber || 'N/A'
    const tableName = b?.tables?.map(t => t.name).join(', ') || b?.hall?.name || booking.table || '—'
    const bookingDate = b?.bookingDate ? new Date(b.bookingDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : booking.date
    const bookingTime = b?.bookingTime || booking.time || '—'
    const guestCount = b?.guestCount || booking.guests || 0
    const bookingNotes = b?.notes || booking.notes || 'No notes added'
    const bookingStatus = booking.status
    const isOngoing = bookingStatus === 'Ongoing' || bookingStatus === 'Confirmed'

    // Payment data
    const paymentTotal = b?.payment?.totalAmount || booking.payment?.total || 0
    const paymentAdvance = b?.payment?.advancePaid || booking.payment?.advance || 0
    const paymentBalance = paymentTotal - paymentAdvance

    // Cake details
    const cakeDetails = b?.cakeDetails
    const hasCake = cakeDetails && cakeDetails.quantity > 0 && !cakeDetails.isSkipped

    // Decoration
    const decoration = b?.addons?.decoration
    const hasDecoration = decoration && decoration.title && !b?.addons?.isSkipped

    // Add-ons
    const otherAddons = b?.addons?.otherAddons || []

    // Parking
    const parking = normalizeParkingDetails(b?.parkingDetails)
    const hasParking = parking.active
    const isHallBooking = b?.bookingType === 'hall'
    const parkingLabel = (type) => parkingTypes.find(v => v.id === type)?.label || titleCase(type)
    // Types offered now + any legacy type already on the booking.
    const editableParkingTypes = [
        ...parkingTypes.map(v => v.id),
        ...Object.keys(editParking.counts).filter(t => !parkingTypes.some(v => v.id === t)),
    ]

    // Package (hall booking)
    const hallPackage = b?.package

    // Special event
    const specialEvent = b?.specialEvent && b.specialEvent !== 'None' ? b.specialEvent : null

    // Shared customer section props
    const customerProps = { customerName, contactNumber, bookingType: booking.type, specialEvent, bookingDate, bookingTime, timeSlot: b?.timeSlot, guestCount, tableName, bookingNotes }

    // ── Edit handlers ────────────────────────────────────────────────────
    const handleAddCake = () => {
        if (!newCakeName || !newCakePrice) return
        setEditCakes(prev => [...prev, { _key: `cake-${++cakeIdCounter}`, name: newCakeName, price: Number(newCakePrice), qty: newCakeQty }])
        setNewCakeName(''); setNewCakeQty(1); setNewCakePrice('')
    }
    const handleRemoveCake = (key) => setEditCakes(prev => prev.filter(c => c._key !== key))

    const handleAddAddon = () => {
        if (!newAddonCategory || !newAddonPrice) return
        setEditAddons(prev => [...prev, { _key: `addon-${++addonIdCounter}`, name: newAddonCategory, price: Number(newAddonPrice) }])
        setNewAddonCategory(''); setNewAddonPrice('')
    }
    const handleRemoveAddon = (key) => setEditAddons(prev => prev.filter(a => a._key !== key))

    // ── Save edits ───────────────────────────────────────────────────────
    const handleSaveEdits = async () => {
        setSaving(true)
        try {
            const payload = {
                cakes: editCakes.map(c => ({ name: c.name, price: c.price, quantity: c.qty })),
                addons: editAddons.map(a => ({ title: a.name, price: a.price })),
                discount: Math.max(0, editDiscount),
            }
            if (!isHallBooking) {
                payload.parking = {
                    vehicles: Object.entries(editParking.counts)
                        .filter(([, n]) => n > 0)
                        .map(([vehicleType, count]) => ({ vehicleType, count })),
                    hours: editParking.hours,
                }
            }
            await api.patch(`/advance-booking/${booking.id}/details`, payload)
            toast.success('Booking updated successfully')
            // Re-fetch fresh data
            const res = await api.get(`/advance-booking/${booking.id}`)
            if (res.data.success) setFullBooking(res.data.booking)
            setIsEditMode(false)
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to save changes')
        } finally {
            setSaving(false)
        }
    }

    // ── Drawer Shell ─────────────────────────────────────────────────────
    const Overlay = <div className="fixed inset-0 bg-black/40 z-40" onClick={handleClose} />
    const headerProps = { tableName, isOngoing, bookingStatus, onClose: handleClose }

    // ── Loading State ────────────────────────────────────────────────────
    if (loading) {
        return (
            <>
                {Overlay}
                <div className="fixed right-0 top-0 h-full w-[390px] max-w-full bg-white shadow-2xl z-50 flex flex-col items-center justify-center font-manrope">
                    <Loader2 size={28} className="text-[#FE8301] animate-spin" />
                    <p className="text-[14px] text-gray-400 mt-3">Loading booking details...</p>
                </div>
            </>
        )
    }

    // ═══════════════════════════════════════════════════════════════════════
    //  VIEW MODE
    // ═══════════════════════════════════════════════════════════════════════
    if (!isEditMode) {
        return (
            <>
                {Overlay}
                <div className="fixed right-0 top-0 h-full w-[390px] max-w-full bg-white shadow-2xl z-50 flex flex-col font-manrope">
                    <DrawerHeader {...headerProps} />
                    <div className="flex-1 overflow-y-auto [&::-webkit-scrollbar]:hidden">
                        <CustomerSection {...customerProps} />
                        <div className="border-t border-[#EEEEEE] mx-5" />

                        {/* Hall Package */}
                        {hallPackage && (
                            <>
                                <div className="px-5 py-3">
                                    <p className="text-[11px] font-[600] text-[#8D848F] mb-2">Package</p>
                                    <Row label={hallPackage.name || 'Hall Package'} value={rupee(hallPackage.price || 0)} />
                                </div>
                                <div className="border-t border-[#EEEEEE] mx-5" />
                            </>
                        )}

                        {/* Cake */}
                        {hasCake && (
                            <>
                                <div className="px-5 py-3">
                                    <p className="text-[11px] font-[600] text-[#8D848F] mb-2">Cake Booking</p>
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <span className="w-5 h-5 rounded flex items-center justify-center" style={{ background: '#F3E8FF' }}>🎂</span>
                                            <span className="text-[12px] text-[#1A181B]">
                                                {cakeDetails.flavor || 'Cake'} ({cakeDetails.size || '1 kg'}) x{cakeDetails.quantity}
                                            </span>
                                        </div>
                                        <span className="text-[10px] text-[#667085]">{cakeDetails.isVeg ? 'Veg' : 'Non-veg'}</span>
                                    </div>
                                    {cakeDetails.specialMessage && (
                                        <p className="text-[11px] text-[#8D848F] mt-1 italic">"{cakeDetails.specialMessage}"</p>
                                    )}
                                </div>
                                <div className="border-t border-[#EEEEEE] mx-5" />
                            </>
                        )}

                        {/* Decoration */}
                        {hasDecoration && (
                            <>
                                <div className="px-5 py-3">
                                    <p className="text-[11px] font-[600] text-[#8D848F] mb-2">Decoration</p>
                                    <Row label={decoration.title} value={rupee(decoration.price || 0)} />
                                </div>
                                <div className="border-t border-[#EEEEEE] mx-5" />
                            </>
                        )}

                        {/* Add-Ons */}
                        {otherAddons.length > 0 && (
                            <>
                                <div className="px-5 py-3">
                                    <p className="text-[11px] font-[600] text-[#8D848F] mb-2">Add-Ons</p>
                                    <div className="space-y-1.5">
                                        {otherAddons.map((a, i) => <Row key={a._id || i} label={a.title} value={rupee(a.price || 0)} />)}
                                    </div>
                                </div>
                                <div className="border-t border-[#EEEEEE] mx-5" />
                            </>
                        )}

                        {/* Parking */}
                        {hasParking && (
                            <>
                                <div className="px-5 py-3">
                                    <p className="text-[11px] font-[600] text-[#8D848F] mb-2">Parking</p>
                                    <div className="space-y-1.5">
                                        {parking.vehicles.map(v => (
                                            <Row key={v.vehicleType} label={v.label || parkingLabel(v.vehicleType)} value={`${v.count} vehicle${Number(v.count) === 1 ? '' : 's'}`} />
                                        ))}
                                        <Row label="Parking Time" value={describeParkingTime(parking)} />
                                    </div>
                                </div>
                                <div className="border-t border-[#EEEEEE] mx-5" />
                            </>
                        )}

                        {/* Coupon / Wallet */}
                        {(b?.payment?.couponCode || b?.payment?.walletPointsUsed > 0) && (
                            <>
                                <div className="px-5 py-3">
                                    {b.payment.couponCode && (
                                        <div className="mb-2">
                                            <p className="text-[11px] font-[600] text-[#8D848F] mb-1">Coupon Applied</p>
                                            <p className="text-[12px] font-[600] text-[#007AFF] flex items-center gap-1">
                                                <Tag size={11} className="flex-shrink-0" />{b.payment.couponCode}
                                            </p>
                                        </div>
                                    )}
                                    {b.payment.walletPointsUsed > 0 && (
                                        <Row label="Wallet Points Used" value={String(b.payment.walletPointsUsed)} />
                                    )}
                                </div>
                                <div className="border-t border-[#EEEEEE] mx-5" />
                            </>
                        )}

                        {/* Payment Summary */}
                        <div className="px-5 py-3">
                            <p className="text-[12px] font-[700] text-[#1A181B] mb-2">Payment Details</p>
                            <div className="space-y-1.5">
                                <Row label="Total Amount" value={rupee(paymentTotal)} />
                                <Row label="Advance Paid" value={rupee(paymentAdvance)} valueColor="#22C55E" />
                                <Row label="Remaining Balance" value={rupee(paymentBalance)} valueColor={paymentBalance > 0 ? '#FF3B30' : '#22C55E'} />
                                <Row label="Payment Method" value={b?.payment?.method || '—'} />
                                <Row label="Payment Status" value={b?.payment?.status || '—'} />
                            </div>
                        </div>

                        <div className="h-2" />
                    </div>

                    {/* Footer */}
                    <div className="flex gap-3 px-5 py-4 flex-shrink-0 bg-white" style={{ borderTop: '1px solid #EEEEEE' }}>
                        <button
                            onClick={() => setIsEditMode(true)}
                            className="flex-1 py-[13px] rounded-[12px] text-[14px] font-[700] transition-colors"
                            style={{ border: '1.5px solid #FE8301', color: '#FE8301', background: 'white' }}
                        >
                            Edit Booking
                        </button>
                        <button
                            onClick={() => toast.success('Payment flow — coming soon')}
                            className="flex-1 py-[13px] rounded-[12px] text-[14px] font-[700] text-white"
                            style={{ background: '#FE8301' }}
                        >
                            Proceed to Pay
                        </button>
                    </div>
                </div>
            </>
        )
    }

    // ═══════════════════════════════════════════════════════════════════════
    //  EDIT MODE
    // ═══════════════════════════════════════════════════════════════════════
    return (
        <>
            {Overlay}
            <div className="fixed right-0 top-0 h-full w-[390px] max-w-full bg-white shadow-2xl z-50 flex flex-col font-manrope">
                <DrawerHeader {...headerProps} />
                <div className="flex-1 overflow-y-auto [&::-webkit-scrollbar]:hidden">
                    <CustomerSection {...customerProps} />
                    <div className="border-t border-[#EEEEEE] mx-5" />

                    {/* Parking — one stepper per vehicle type + hours (table bookings only) */}
                    {!isHallBooking && (
                        <>
                            <div className="px-5 py-3">
                                <p className="text-[11px] font-[600] text-[#8D848F] mb-2">Parking</p>
                                <div className="space-y-2">
                                    {editableParkingTypes.map(type => (
                                        <div key={type} className="flex items-center justify-between">
                                            <span className="text-[12px] text-[#8D848F]">{parkingLabel(type)}</span>
                                            <Stepper
                                                value={editParking.counts[type] || 0}
                                                onDecrement={() => setEditParking(p => ({ ...p, counts: { ...p.counts, [type]: Math.max(0, (p.counts[type] || 0) - 1) } }))}
                                                onIncrement={() => setEditParking(p => ({ ...p, hours: p.hours || 2, counts: { ...p.counts, [type]: Math.min(500, (p.counts[type] || 0) + 1) } }))}
                                            />
                                        </div>
                                    ))}
                                    <div className="flex items-center justify-between">
                                        <span className="text-[12px] text-[#8D848F]">Parking Hours</span>
                                        <Stepper
                                            value={editParking.hours}
                                            onDecrement={() => setEditParking(p => ({ ...p, hours: Math.max(0, p.hours - 1) }))}
                                            onIncrement={() => setEditParking(p => ({ ...p, hours: Math.min(24, p.hours + 1) }))}
                                        />
                                    </div>
                                </div>
                            </div>
                            <div className="border-t border-[#EEEEEE] mx-5" />
                        </>
                    )}

                    {/* Cake — editable */}
                    <div className="px-5 py-3">
                        <p className="text-[11px] font-[600] text-[#8D848F] mb-2">Cake Booking</p>
                        <div className="flex items-center gap-1.5 mb-2">
                            <input value={newCakeName} onChange={e => setNewCakeName(e.target.value)} placeholder="Name" className="flex-1 min-w-0 text-[11px] px-2 py-1.5 rounded-[8px] outline-none" style={{ border: '1px solid #DDDDDD' }} />
                            <div className="flex items-center gap-1 flex-shrink-0" style={{ border: '1px solid #DDDDDD', borderRadius: 8, padding: '4px 6px' }}>
                                <button onClick={() => setNewCakeQty(q => Math.max(1, q - 1))} className="text-[#8D848F]"><Minus size={9} /></button>
                                <span className="text-[11px] font-[600] w-4 text-center">{newCakeQty}</span>
                                <button onClick={() => setNewCakeQty(q => q + 1)} className="text-[#8D848F]"><Plus size={9} /></button>
                            </div>
                            <input value={newCakePrice} onChange={e => setNewCakePrice(e.target.value)} placeholder="Price" type="number" min="0" className="w-16 text-[11px] px-2 py-1.5 rounded-[8px] outline-none" style={{ border: '1px solid #DDDDDD' }} />
                            <button onClick={handleAddCake} className="w-7 h-7 rounded-[8px] flex items-center justify-center flex-shrink-0 text-white" style={{ background: '#FE8301' }}><Plus size={14} /></button>
                        </div>
                        <div className="space-y-1.5">
                            {editCakes.map(c => (
                                <div key={c._key} className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <span className="w-5 h-5 rounded flex items-center justify-center" style={{ background: '#F3E8FF' }}>🎂</span>
                                        <span className="text-[12px] text-[#1A181B]">{c.name}</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        {c.price > 0 && <span className="text-[12px] font-[600] text-[#1A181B]">{rupee(c.price)}</span>}
                                        <button onClick={() => handleRemoveCake(c._key)} className="w-[18px] h-[18px] rounded-full flex items-center justify-center flex-shrink-0" style={{ background: '#FFF0EE', border: '1px solid #FF3B30' }}>
                                            <Minus size={8} className="text-[#FF3B30]" />
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                    <div className="border-t border-[#EEEEEE] mx-5" />

                    {/* Add-Ons — editable */}
                    <div className="px-5 py-3">
                        <p className="text-[11px] font-[600] text-[#8D848F] mb-2">Add-Ons</p>
                        <div className="space-y-2 mb-2">
                            {editAddons.map(a => (
                                <div key={a._key} className="flex items-center justify-between">
                                    <span className="text-[12px] text-[#8D848F]">{a.name}</span>
                                    <div className="flex items-center gap-1.5">
                                        <button onClick={() => handleRemoveAddon(a._key)} className="w-[18px] h-[18px] rounded-full flex items-center justify-center flex-shrink-0" style={{ background: '#FFF0EE', border: '1px solid #FF3B30' }}>
                                            <Minus size={8} className="text-[#FF3B30]" />
                                        </button>
                                        <span className="text-[12px] font-[600] text-[#1A181B]">{rupee(a.price)}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                        <div className="flex items-center gap-1.5 mb-2">
                            <input value={newAddonCategory} onChange={e => setNewAddonCategory(e.target.value)} placeholder="Category" className="flex-1 min-w-0 text-[11px] px-2 py-1.5 rounded-[8px] outline-none" style={{ border: '1px solid #DDDDDD' }} />
                            <input value={newAddonPrice} onChange={e => setNewAddonPrice(e.target.value)} placeholder="Price" type="number" min="0" className="w-16 text-[11px] px-2 py-1.5 rounded-[8px] outline-none" style={{ border: '1px solid #DDDDDD' }} />
                            <button onClick={handleAddAddon} className="w-7 h-7 rounded-[8px] flex items-center justify-center flex-shrink-0 text-white" style={{ background: '#FE8301' }}><Plus size={14} /></button>
                        </div>
                    </div>
                    <div className="border-t border-[#EEEEEE] mx-5" />

                    {/* Payment Summary with editable discount */}
                    <div className="px-5 py-3 space-y-1.5">
                        <Row label="Total Amount" value={rupee(paymentTotal)} labelBold />
                        <Row label="Advance Paid" value={rupee(paymentAdvance)} valueColor="#22C55E" />
                        <Row label="Remaining Balance" value={rupee(paymentBalance)} valueColor="#FF3B30" />
                        <div className="flex items-center justify-between">
                            <span className="text-[12px] text-[#8D848F]">Discount</span>
                            <div className="flex items-center gap-1 rounded-[8px] px-2 py-1" style={{ border: '1px solid #DDDDDD', width: 90 }}>
                                <span className="text-[12px] text-[#FF3B30]">₹</span>
                                <input
                                    type="number"
                                    min="0"
                                    max={paymentBalance}
                                    value={editDiscount}
                                    onChange={e => setEditDiscount(Math.max(0, Number(e.target.value)))}
                                    className="flex-1 text-[12px] font-[600] text-[#FF3B30] outline-none bg-transparent w-full"
                                />
                            </div>
                        </div>
                        <div className="flex justify-between items-center pt-2" style={{ borderTop: '1px solid #EEEEEE' }}>
                            <span className="text-[14px] font-[800] text-[#1A181B]">Final Total</span>
                            <span className="text-[14px] font-[800] text-[#1A181B]">{rupee(Math.max(paymentBalance - editDiscount, 0))}</span>
                        </div>
                    </div>
                    <div className="h-2" />
                </div>

                {/* Footer */}
                <div className="flex gap-3 px-5 py-4 flex-shrink-0 bg-white" style={{ borderTop: '1px solid #EEEEEE' }}>
                    <button
                        onClick={() => setIsEditMode(false)}
                        className="flex-1 py-[13px] rounded-[12px] text-[14px] font-[700] transition-colors"
                        style={{ border: '1.5px solid #DDDDDD', color: '#645E66', background: 'white' }}
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSaveEdits}
                        disabled={saving}
                        className="flex-1 py-[13px] rounded-[12px] text-[14px] font-[700] text-white disabled:opacity-60 flex items-center justify-center gap-2"
                        style={{ background: '#FE8301' }}
                    >
                        {saving && <Loader2 size={16} className="animate-spin" />}
                        {saving ? 'Saving...' : 'Save Changes'}
                    </button>
                </div>
            </div>
        </>
    )
}

export default BookingDrawer
