import React from 'react';
import { X, CheckCircle, Calendar, Clock, Users, Phone, Mail, User, MapPin, UtensilsCrossed, Cake, Sparkles, Car, StickyNote, CreditCard, Wallet, Tag } from 'lucide-react';

const formatCurrency = (amount) => {
    if (typeof amount !== 'number' || isNaN(amount)) return '₹0.00';
    return `₹${amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
};

// Detect raw MongoDB ObjectIds (24-char hex strings) from old bookings
const isObjectId = (val) => typeof val === 'string' && /^[a-f0-9]{24}$/i.test(val);
const safeDisplay = (val, fallback = 'N/A') => (!val || isObjectId(val)) ? fallback : val;

const InfoCard = ({ icon: Icon, label, value, iconColor = '#F97316' }) => (
    <div className="flex-1 min-w-[100px] bg-white rounded-[16px] px-4 py-3 shadow-sm border border-gray-100">
        <div className="flex items-center gap-1.5 mb-1">
            <Icon size={13} style={{ color: iconColor }} />
            <p className="text-[11px] text-gray-400 font-[500] uppercase tracking-wide">{label}</p>
        </div>
        <p className="text-[14px] font-[700] text-[#1A181B]">{value || 'N/A'}</p>
    </div>
);

const DetailRow = ({ label, value, valueClass = '' }) => (
    <div className="flex justify-between items-start text-[14px] py-1">
        <span className="text-gray-500 shrink-0">{label}</span>
        <span className={`font-[500] text-[#1A181B] text-right ${valueClass}`}>{value || 'N/A'}</span>
    </div>
);

const SectionCard = ({ title, icon: Icon, children, className = '' }) => (
    <div className={`bg-white p-5 rounded-[20px] border border-gray-200 ${className}`}>
        <div className="flex items-center gap-2 mb-4">
            {Icon && <Icon size={18} className="text-[#F97316]" />}
            <h3 className="text-[15px] font-[700] text-[#1A181B]">{title}</h3>
        </div>
        {children}
    </div>
);

const BookingDetailsModal = ({ isOpen, onClose, booking, eventTypes = [], onApprove, onReject }) => {
    if (!isOpen || !booking) return null;

    const orig = booking.original || {};
    const isPending = booking.status === 'Pending';
    const isConfirmed = booking.status === 'Confirmed';
    const isCancelled = booking.status === 'Cancelled';
    const isHall = orig.bookingType === 'hall';

    const payment = orig.payment || {};
    const totalAmount = payment.totalAmount || 0;
    const advancePaid = payment.advancePaid || 0;
    const balance = totalAmount - advancePaid;

    const guestCount = orig.guestCount || booking.guests?.replace?.(/\D/g, '') || '—';

    // Resolve event type: if it's an ObjectId, look it up from the eventTypes list
    const resolveEventType = (val) => {
        if (!val || val === 'None') return 'None';
        if (!isObjectId(val)) return val;
        const match = eventTypes.find(e => e.id === val || e._id === val);
        return match?.title || 'N/A';
    };

    // Clean notes: replace any ObjectIds in the text with the user's name
    const cleanNotes = (notes) => {
        if (!notes) return null;
        return notes.replace(/[a-f0-9]{24}/gi, (match) => {
            if (orig.user?.name) return orig.user.name;
            return booking.name || 'Customer';
        });
    };

    const statusStyles = {
        Confirmed: 'bg-[#DCFCE7] text-[#16A34A] border-[#BBF7D0]',
        Pending: 'bg-[#FEF9C3] text-[#CA8A04] border-[#FDE68A]',
        Cancelled: 'bg-[#FEE2E2] text-[#DC2626] border-[#FECACA]',
        Completed: 'bg-[#DBEAFE] text-[#2563EB] border-[#BFDBFE]',
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center font-manrope">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-black/50 backdrop-blur-sm transition-opacity"
                onClick={onClose}
            />

            {/* Modal */}
            <div className="relative w-full max-w-[520px] h-[90vh] md:h-auto max-h-[90vh] bg-[#FAFAFA] rounded-[24px] shadow-2xl flex flex-col animate-in zoom-in-95 duration-200 overflow-hidden">

                {/* Header */}
                <div className="px-6 py-4 bg-[#FFF5EB] flex items-center justify-between border-b border-[#FED7AA] shrink-0">
                    <div className="flex items-center gap-3 min-w-0">
                        <div className="min-w-0">
                            <h2 className="text-[17px] font-[700] text-[#1A181B] truncate">
                                {booking.name}
                            </h2>
                            <p className="text-[12px] text-gray-500 font-[500]">
                                {booking.id} • {isHall ? 'Hall Booking' : 'Table Booking'}
                            </p>
                        </div>
                        <span className={`px-3 py-1 rounded-full text-[11px] font-[600] border whitespace-nowrap ${statusStyles[booking.status] || 'bg-gray-100 text-gray-600 border-gray-300'}`}>
                            {booking.status}
                        </span>
                    </div>
                    <button
                        onClick={onClose}
                        className="text-gray-400 hover:text-gray-600 transition-colors ml-2 shrink-0"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Scrollable Body */}
                <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">

                    {/* Quick Info Cards */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        <InfoCard icon={Calendar} label="Date" value={booking.date} />
                        <InfoCard icon={Clock} label="Time" value={booking.time} />
                        <InfoCard icon={Users} label="Guests" value={guestCount} />
                        <InfoCard icon={UtensilsCrossed} label="Slot" value={orig.timeSlot || '—'} />
                    </div>

                    {/* Customer Info */}
                    {orig.user && (
                        <SectionCard title="Customer Info" icon={User}>
                            <div className="space-y-2">
                                <div className="flex items-center gap-2 text-[14px]">
                                    <User size={14} className="text-gray-400" />
                                    <span className="text-[#1A181B] font-[500]">{orig.user.name || booking.name}</span>
                                </div>
                                {orig.user.mobile && (
                                    <div className="flex items-center gap-2 text-[14px]">
                                        <Phone size={14} className="text-gray-400" />
                                        <span className="text-[#1A181B] font-[500]">{orig.user.mobile}</span>
                                    </div>
                                )}
                                {orig.user.email && (
                                    <div className="flex items-center gap-2 text-[14px]">
                                        <Mail size={14} className="text-gray-400" />
                                        <span className="text-[#1A181B] font-[500]">{orig.user.email}</span>
                                    </div>
                                )}
                            </div>
                        </SectionCard>
                    )}

                    {/* Hall Booking Details */}
                    {isHall ? (
                        <>
                            <SectionCard title="Event Details" icon={Sparkles}>
                                <div className="space-y-2">
                                    <DetailRow label="Hall" value={orig.hall?.name || 'N/A'} />
                                    {orig.hall?.maxCapacity && (
                                        <DetailRow label="Hall Capacity" value={`${orig.hall.maxCapacity} pax`} />
                                    )}
                                    <DetailRow label="Event Type" value={
                                        <span className="uppercase text-[13px] font-[600] text-[#F97316]">
                                            {resolveEventType(orig.specialEvent)}
                                        </span>
                                    } />
                                    {orig.package && (
                                        <DetailRow label="Package" value={
                                            <span>
                                                {orig.package.name}
                                                {orig.package.price != null && (
                                                    <span className="text-gray-400 text-[12px] ml-1">
                                                        ({formatCurrency(orig.package.price)})
                                                    </span>
                                                )}
                                            </span>
                                        } />
                                    )}
                                </div>
                            </SectionCard>

                            {/* Cake */}
                            {orig.cakeDetails && !orig.cakeDetails.isSkipped && orig.cakeDetails.flavor && !isObjectId(orig.cakeDetails.flavor) && (
                                <SectionCard title="Cake Selection" icon={Cake}>
                                    <div className="space-y-2">
                                        <DetailRow label="Flavor" value={safeDisplay(orig.cakeDetails.flavor)} />
                                        <DetailRow label="Weight" value={safeDisplay(orig.cakeDetails.size)} />
                                        {orig.cakeDetails.quantity > 0 && (
                                            <DetailRow label="Quantity" value={orig.cakeDetails.quantity} />
                                        )}
                                        <DetailRow label="Type" value={orig.cakeDetails.isVeg ? '🟢 Veg' : '🔴 Non-Veg'} />
                                        {orig.cakeDetails.specialMessage && (
                                            <div className="mt-2 p-3 bg-[#FFF5EB] rounded-xl text-[13px] italic text-gray-600">
                                                "{orig.cakeDetails.specialMessage}"
                                            </div>
                                        )}
                                    </div>
                                </SectionCard>
                            )}

                            {/* Decoration */}
                            {orig.addons?.decoration?.title && (
                                <SectionCard title="Decoration" icon={Sparkles}>
                                    <div className="flex items-center justify-between">
                                        <span className="text-[14px] font-[500] text-[#1A181B]">{orig.addons.decoration.title}</span>
                                        {orig.addons.decoration.price != null && (
                                            <span className="text-[13px] font-[600] text-[#F97316]">
                                                {formatCurrency(orig.addons.decoration.price)}
                                            </span>
                                        )}
                                    </div>
                                </SectionCard>
                            )}

                            {/* Other Add-ons */}
                            {orig.addons?.otherAddons?.length > 0 && (
                                <SectionCard title="Add-ons" icon={Tag}>
                                    <div className="space-y-2">
                                        {orig.addons.otherAddons.map((addon, i) => (
                                            <div key={i} className="flex items-center justify-between py-1">
                                                <span className="text-[13px] font-[500] text-[#1A181B]">{addon.title}</span>
                                                {addon.price != null && (
                                                    <span className="text-[12px] font-[600] text-[#F97316]">
                                                        {formatCurrency(addon.price)}
                                                    </span>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                </SectionCard>
                            )}
                        </>
                    ) : (
                        /* Table Booking Details */
                        <SectionCard title="Table Details" icon={MapPin}>
                            <div className="space-y-2">
                                <DetailRow label="Area" value={
                                    <span className="capitalize">
                                        {(orig.area && typeof orig.area === 'object' && orig.area.name) || '—'}
                                    </span>
                                } />
                                <DetailRow label="Tables" value={orig.tables?.map(t => t.name).join(', ')} />
                                <DetailRow label="Event Type" value={
                                    <span className="uppercase text-[13px] font-[600] text-[#F97316]">
                                        {resolveEventType(orig.specialEvent)}
                                    </span>
                                } />
                                {orig.package && (
                                    <DetailRow label="Package" value={
                                        <span>
                                            {orig.package.name}
                                            {orig.package.price != null && (
                                                <span className="text-gray-400 text-[12px] ml-1">
                                                    ({formatCurrency(orig.package.price)})
                                                </span>
                                            )}
                                        </span>
                                    } />
                                )}
                            </div>
                        </SectionCard>
                    )}

                    {/* Parking */}
                    {orig.parkingDetails && !orig.parkingDetails.isSkipped && orig.parkingDetails.count > 0 && (
                        <SectionCard title="Parking" icon={Car}>
                            <div className="space-y-2">
                                <DetailRow label="Vehicle Type" value={
                                    <span className="capitalize">{orig.parkingDetails.vehicleType}</span>
                                } />
                                <DetailRow label="Vehicles" value={orig.parkingDetails.count} />
                                <DetailRow label="Duration" value={orig.parkingDetails.timeDuration} />
                            </div>
                        </SectionCard>
                    )}

                    {/* Notes */}
                    {orig.notes && (
                        <SectionCard title="Special Notes" icon={StickyNote}>
                            <p className="text-[14px] text-gray-600 leading-relaxed">{cleanNotes(orig.notes)}</p>
                        </SectionCard>
                    )}

                    {/* Payment Summary */}
                    <div className="bg-[#FFF5EB] p-5 rounded-[20px] border border-[#FED7AA]">
                        <div className="flex items-center gap-2 mb-4">
                            <CreditCard size={18} className="text-[#F97316]" />
                            <h3 className="text-[15px] font-[700] text-[#1A181B]">Payment Summary</h3>
                        </div>
                        <div className="space-y-3">
                            <div className="flex justify-between items-center text-[14px]">
                                <span className="text-gray-500">Total Amount</span>
                                <span className="font-[600] text-[#1A181B]">{formatCurrency(totalAmount)}</span>
                            </div>
                            <div className="flex justify-between items-center text-[14px]">
                                <span className="text-gray-500">Advance Paid</span>
                                <span className="font-[600] text-[#22C55E]">{formatCurrency(advancePaid)}</span>
                            </div>
                            {payment.walletPointsUsed > 0 && (
                                <div className="flex justify-between items-center text-[14px]">
                                    <span className="text-gray-500 flex items-center gap-1">
                                        <Wallet size={13} /> Wallet Points
                                    </span>
                                    <span className="font-[500] text-[#7C3AED]">-{payment.walletPointsUsed} pts</span>
                                </div>
                            )}
                            {payment.couponCode && (
                                <div className="flex justify-between items-center text-[14px]">
                                    <span className="text-gray-500 flex items-center gap-1">
                                        <Tag size={13} /> Coupon
                                    </span>
                                    <span className="font-[500] text-[#7C3AED]">{payment.couponCode}</span>
                                </div>
                            )}
                            <div className="border-t border-dashed border-[#FED7AA] pt-3 flex justify-between items-center text-[14px]">
                                <span className="text-gray-500 font-[600]">Balance Due</span>
                                <span className={`font-[700] text-[16px] ${balance > 0 ? 'text-[#EF4444]' : 'text-[#22C55E]'}`}>
                                    {balance > 0 ? formatCurrency(balance) : 'Paid'}
                                </span>
                            </div>
                            <div className="flex justify-between items-center text-[13px] text-gray-400">
                                <span>Payment Method</span>
                                <span className="capitalize font-[500]">{payment.method || 'N/A'}</span>
                            </div>
                            <div className="flex justify-between items-center text-[13px] text-gray-400">
                                <span>Payment Status</span>
                                <span className={`font-[500] capitalize ${payment.status === 'Paid' ? 'text-[#22C55E]' : payment.status === 'Confirmed' ? 'text-[#2563EB]' : 'text-[#CA8A04]'}`}>
                                    {payment.status || 'Pending'}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Footer Actions */}
                {isPending && (
                    <div className="p-5 bg-white border-t border-gray-100 rounded-b-[24px] shrink-0">
                        <div className="flex gap-3">
                            <button
                                onClick={() => onReject(booking)}
                                className="flex-1 py-3 border-2 border-[#F97316] text-[#F97316] rounded-xl font-[700] flex items-center justify-center gap-2 hover:bg-orange-50 transition-colors text-[15px]"
                            >
                                <X size={18} />
                                Reject
                            </button>
                            <button
                                onClick={() => onApprove(booking)}
                                className="flex-1 py-3 bg-[#F97316] text-white rounded-xl font-[700] flex items-center justify-center gap-2 hover:bg-[#EA580C] transition-colors text-[15px]"
                            >
                                <CheckCircle size={18} />
                                Approve
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default BookingDetailsModal;
