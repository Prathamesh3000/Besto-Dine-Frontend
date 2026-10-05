import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ChevronLeft, ChevronDown, Check, X, FileText, Calendar, Clock, MapPin, CircleDot, Tag, Gift, FileEdit } from 'lucide-react';
import { useAuth } from '../../Context/AuthContext';
import BookingProgressBar from './BookingProgressBar';
import PartyImg from "/party.svg";
import { walletAPI, promotionsAPI, settingsAPI } from '../../utils/api';
import { toast } from 'react-hot-toast';
import { Loader2 } from 'lucide-react';
import {
    parkingRowsFromState,
    parkingHoursFromState,
    parkingChargeFromState,
    describeParkingTime,
    titleCase,
} from './parkingUtils';

// QA N12 — the review step explains the chosen seating option. The
// admin's area description (Tables -> Add Area -> "Description for
// customers") wins; otherwise a sensible line is generated from the
// area name so the card is never just a bare label.
const SEATING_HINTS = [
    [/roof/i, 'Open-air seating on the rooftop.'],
    [/garden|lawn|patio|terrace/i, 'Open-air seating in the garden / patio area.'],
    [/outdoor|outside|open/i, 'Open-air seating outside the restaurant.'],
    [/window/i, 'Tables beside the windows with a view outside.'],
    [/private|cabin|booth|vip/i, 'A private, more secluded space for your group.'],
    [/family/i, 'Family seating area, comfortable for groups and kids.'],
    [/bar|lounge/i, 'Relaxed lounge-style seating near the bar.'],
    [/smok/i, 'Designated smoking-permitted seating.'],
    [/\bac\b|air.?con/i, 'Air-conditioned indoor seating.'],
    [/indoor|inside|main|hall|dining/i, 'Indoor seating inside the main dining area.'],
];
// Parse a price that may be a Number or a display string ("₹2,499.50")
// into a number, KEEPING the decimal point — stripping every non-digit
// turned 2499.5 into 24995. Missing / unparseable → 0.
function toPrice(value) {
    if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
    const n = parseFloat(String(value ?? '').replace(/[^\d.]/g, ''));
    return Number.isFinite(n) ? n : 0;
}

// Price of one selected add-on: the duration-adjusted selection price
// when the customer chose one (a legitimate 0 included), else its list price.
function addonUnitPrice(addon, selection) {
    const sel = selection?.price;
    return toPrice(sel !== undefined && sel !== null && sel !== '' ? sel : addon?.price);
}

function seatingDescription(area, fallbackName) {
    const custom = (area?.description || '').trim() || (area?.note || '').trim();
    if (custom) return custom;
    const name = area?.name || fallbackName || '';
    const hit = SEATING_HINTS.find(([re]) => re.test(name));
    return hit ? hit[1] : `Tables reserved for you in the ${name || 'selected'} area.`;
}

const BookingReview = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const { user } = useAuth();

    const [isTermsOpen, setIsTermsOpen] = useState(false);
    const [selectedPayment, setSelectedPayment] = useState('advance');
    const [couponCode, setCouponCode] = useState('');
    const [walletPointsInput, setWalletPointsInput] = useState('');
    // Inline validation errors for coupon + wallet micro-forms.
    const [couponError, setCouponError] = useState('');
    const [pointsError, setPointsError] = useState('');
    const [availablePoints, setAvailablePoints] = useState(0);
    const [availableCoupons, setAvailableCoupons] = useState([]);
    const [appliedCoupon, setAppliedCoupon] = useState(null);
    const [isApplyingCoupon, setIsApplyingCoupon] = useState(false);
    const [isFetchingData, setIsFetchingData] = useState(true);
    const [appliedPoints, setAppliedPoints] = useState(0);
    const [pointsToRupee, setPointsToRupee] = useState(0.1);

    const {
        bookingType,
        selectedTypes,
        selectedDate,
        selectedTime,
        guests,
        selectedHallId,
        selectedTableIds,
        selectedHall,
        selectedPackage,
        selectedFlavor,
        selectedSize,
        isVeg,
        parkingSkipped,
        selectedAddons,
        selectedAddonDetails,
        selectedEvent,
        addonSelections,
        selectedTimeType,
        selectedDecor,
        quantity,
        specialMessage,
        selectedTypeNames,
        selectedTableNames,
        selectedEventName,
        selectedFlavorName,
        selectedSizeName
    } = location.state || {};

    // Get branch location from localStorage (set during branch selection)
    const branchLocation = React.useMemo(() => {
        try {
            const branch = JSON.parse(localStorage.getItem('selectedBranch') || '{}');
            return branch.addressLine1
                ? `${branch.addressLine1} ${branch.addressLine2 || ''}`.trim()
                : null;
        } catch { return null; }
    }, []);

    // Guard: redirect to start if required data is missing
    React.useEffect(() => {
        if (!bookingType || !selectedDate) {
            navigate('/customer/booking-type', { replace: true });
        }
    }, [bookingType, selectedDate, navigate]);

    React.useEffect(() => {
        // Each fetch is independent — wallet (walletLoyalty), coupons
        // (couponPromotions) and settings each have their own feature
        // gate, and a 403 on one (e.g. tenant on a Basic plan without
        // walletLoyalty) must not blank the other two. Using Promise.all
        // here previously caused the "Available Coupons" list to stay
        // empty whenever ANY of the three calls returned a non-2xx.
        // The `_silent: true` flag suppresses the global error toast
        // since each empty section already self-explains in the UI.
        const fetchData = async () => {
            setIsFetchingData(true);

            const [walletRes, couponsRes, settingsRes] = await Promise.allSettled([
                walletAPI.getWallet({ _silent: true }),
                promotionsAPI.getActiveCoupons({ _silent: true }),
                settingsAPI.getSettings({ _silent: true }),
            ]);

            if (walletRes.status === 'fulfilled' && walletRes.value.data?.success) {
                setAvailablePoints(parseFloat((walletRes.value.data.loyaltyPoints || 0).toFixed(2)));
            } else if (walletRes.status === 'rejected') {
                console.warn('Wallet fetch skipped:', walletRes.reason?.response?.data?.code || walletRes.reason?.message);
            }

            if (couponsRes.status === 'fulfilled' && couponsRes.value.data?.success) {
                setAvailableCoupons(couponsRes.value.data.coupons || []);
            } else if (couponsRes.status === 'rejected') {
                console.warn('Coupons fetch skipped:', couponsRes.reason?.response?.data?.code || couponsRes.reason?.message);
            }

            if (settingsRes.status === 'fulfilled') {
                const walletConfig = settingsRes.value.data?.wallet;
                if (walletConfig?.pointsToRupee) {
                    setPointsToRupee(walletConfig.pointsToRupee);
                }
            }

            setIsFetchingData(false);
        };
        fetchData();
    }, []);

    const handleApplyCoupon = async () => {
        if (!couponCode.trim()) {
            setCouponError('Enter a coupon code to apply');
            setTimeout(() => document.getElementById('bookingCouponCode')?.focus(), 0);
            return;
        }
        if (appliedPoints > 0) {
            setCouponError('Remove applied points before applying a coupon');
            return;
        }
        setCouponError('');

        setIsApplyingCoupon(true);
        try {
            const prices = calculatePrices();
            const orderValue = prices.full + prices.discount + (appliedPoints * pointsToRupee);
            const res = await promotionsAPI.applyCoupon(couponCode, orderValue);
            if (res.data?.success) {
                setAppliedCoupon(res.data);
                toast.success(res.data.message || 'Coupon applied!');
            }
        } catch (err) {
            setAppliedCoupon(null);
            // Surface server message inline instead of letting it slip past.
            setCouponError(err?.response?.data?.message || 'Could not apply this coupon');
        } finally {
            setIsApplyingCoupon(false);
        }
    };

    const handleRedeemPoints = () => {
        if (appliedCoupon) {
            setPointsError('Remove applied coupon before redeeming points');
            return;
        }
        const pointsToUse = parseInt(walletPointsInput);
        if (isNaN(pointsToUse) || pointsToUse <= 0) {
            setPointsError('Enter a valid number of points greater than zero');
            setTimeout(() => document.getElementById('walletPointsInput')?.focus(), 0);
            return;
        }
        if (pointsToUse > availablePoints) {
            setPointsError(`You only have ${availablePoints} points available`);
            return;
        }
        setPointsError('');

        const currentPrices = calculatePrices();
        const amountAfterCoupon = currentPrices.full + appliedPoints * pointsToRupee;
        const maxRedeemablePoints = Math.floor(amountAfterCoupon / pointsToRupee);
        const actualPointsToUse = Math.min(pointsToUse, availablePoints, maxRedeemablePoints);

        setAppliedPoints(actualPointsToUse);
        setWalletPointsInput('');
        toast.success(`${actualPointsToUse} pts (₹${(actualPointsToUse * pointsToRupee).toFixed(2)}) redeemed!`);
    };

    const handleRemovePoints = () => {
        setAppliedPoints(0);
        toast.success('Points removed');
    };

    const formatDate = (dateStr) => {
        if (!dateStr) return 'Not selected';
        const [year, month, day] = dateStr.split('-');
        const date = new Date(year, month - 1, day);
        return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
    };

    const calculatePrices = () => {
        let total = 0;

        let hallPrice = 0;
        if (bookingType === 'hall' && selectedHall) {
            hallPrice = toPrice(selectedHall.basePrice ?? selectedHall.price);
            total += hallPrice;
        }

        let cakePrice = 0;
        if (selectedFlavor && selectedSize) {
            const cakeData = location.state?.selectedCakeData;
            if (cakeData?.price) {
                cakePrice = cakeData.price * (quantity || 1);
            }
            total += cakePrice;
        }

        let decorationPrice = 0;
        if (selectedDecor) {
            decorationPrice = toPrice(selectedDecor.basePrice ?? selectedDecor.price);
            total += decorationPrice;
        }

        // Sum of (rate x count) x hours over every vehicle type - mirrors
        // Backend/utils/parkingConfig (the server re-prices on create).
        let parkingPrice = 0;
        if (bookingType !== 'hall' && !parkingSkipped) {
            parkingPrice = parkingChargeFromState(location.state || {});
            total += parkingPrice;
        }

        let packagePrice = 0;
        if (bookingType === 'hall' && selectedPackage) {
            packagePrice = toPrice(selectedPackage.price) * (guests || 1);
            total += packagePrice;
        }

        let addonPrice = 0;
        if (selectedAddonDetails && selectedAddonDetails.length > 0) {
            addonPrice = selectedAddonDetails.reduce((sum, addon) => {
                // Use duration-adjusted price from addonSelections if available
                const sel = addonSelections?.[addon.id || addon._id];
                return sum + addonUnitPrice(addon, sel);
            }, 0);
            total += addonPrice;
        }

        let full = total;
        let discount = 0;
        if (appliedCoupon) {
            discount = appliedCoupon.discount || 0;
            full = Math.max(0, total - discount);
        }

        full = Math.max(0, full - (appliedPoints * pointsToRupee));
        return {
            full,
            advance: Math.round(full * 0.5),
            cake: cakePrice,
            parking: parkingPrice,
            package: packagePrice,
            addon: addonPrice,
            decoration: decorationPrice,
            hall: hallPrice,
            discount
        };
    };

    const prices = calculatePrices();

    const parkingRows = parkingRowsFromState(location.state || {});
    const parkingHours = parkingHoursFromState(location.state || {});
    const selectedArea = location.state?.selectedArea || null;
    const selectedTablesInfo = Array.isArray(location.state?.selectedTablesInfo) ? location.state.selectedTablesInfo : [];
    const seatingCapacity = selectedTablesInfo.reduce((sum, t) => sum + (Number(t.capacity) || 0), 0);
    const seatingName = selectedArea?.name || (selectedTypeNames?.length > 0 ? selectedTypeNames.join(', ') : '');

    // Helper: format price with ₹ and locale
    const fmtPrice = (val) => `₹${(val || 0).toLocaleString('en-IN')}`;

    // Shared row component for consistent layout
    const ReviewRow = ({ icon, label, value }) => (
        <div className="flex justify-between items-start gap-4 text-[14px]">
            <div className="flex items-center gap-3 text-[#645E66] shrink-0">
                {typeof icon === 'string'
                    ? <i className={`${icon} text-[18px]`}></i>
                    : icon}
                <span className="font-[500]">{label}</span>
            </div>
            <span className="text-[#645E66] font-[600] text-right break-words min-w-0">{value}</span>
        </div>
    );

    // Section card wrapper
    const ReviewCard = ({ title, children, footer }) => (
        <div className="bg-white border border-[#F2F4F7] rounded-[20px] p-5 lg:p-6 shadow-[0px_2px_12px_rgba(0,0,0,0.02)]">
            <h3 className="text-[16px] lg:text-[18px] font-[700] text-[#1A181B] mb-5">{title}</h3>
            <div className="space-y-4">{children}</div>
            {footer && (
                <div className="border-t border-dashed border-[#F2F4F7] mt-5 pt-4 flex justify-between items-center">
                    {footer}
                </div>
            )}
        </div>
    );

    const locationDisplay = branchLocation || 'Location not set';

    return (
        <div className="min-h-screen bg-[#FDFDFD] font-manrope overflow-x-hidden selection:bg-orange-100">
            <div className="w-full">
                <BookingProgressBar />
            </div>

            <div className="max-w-[1240px] mx-auto pb-40 lg:pb-12 px-5 lg:px-12">
                {/* Mobile Header */}
                <header className="flex lg:hidden items-center justify-between py-6 bg-[#FDFDFD] sticky top-0 z-50">
                    <div className="flex items-center gap-3">
                        <button onClick={() => navigate(-1)} className="p-1 -ml-1">
                            <ChevronLeft size={24} className="text-[#1A181B]" />
                        </button>
                        <h1 className="text-[18px] font-[700] text-[#1A181B]">Review Booking Details</h1>
                    </div>
                </header>

                {/* Desktop Title */}
                <div className="hidden lg:flex items-center justify-between mt-6 mb-8">
                    <h1 className="text-[32px] font-[800] text-[#1A181B] tracking-tight">Review Booking Details</h1>
                </div>

                <main className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-8">
                    {/* LEFT COLUMN — Booking Details */}
                    <div className="lg:col-span-2 space-y-4 lg:space-y-6">

                        {/* Seating Option (Table Flow) - QA N12: what the
                            chosen option means, its capacity and any charge. */}
                        {bookingType !== 'hall' && selectedTypes && selectedTypes.length > 0 && (
                            <ReviewCard title="Seating Option">
                                <ReviewRow
                                    icon="fi fi-rr-chair"
                                    label="Selected Type"
                                    value={seatingName || 'Not selected'}
                                />
                                <div className="bg-[#FAFAFA] rounded-[12px] px-4 py-3 text-[13px] text-[#645E66] leading-relaxed">
                                    {seatingDescription(selectedArea, seatingName)}
                                </div>
                                {seatingCapacity > 0 && (
                                    <ReviewRow
                                        icon="fi fi-rr-users-alt"
                                        label="Capacity"
                                        value={`Seats up to ${seatingCapacity} guest${seatingCapacity === 1 ? '' : 's'} at ${selectedTablesInfo.length} table${selectedTablesInfo.length === 1 ? '' : 's'}${guests ? ` · booked for ${guests}` : ''}`}
                                    />
                                )}
                                <ReviewRow
                                    icon="fi fi-rr-indian-rupee-sign"
                                    label="Extra Charge"
                                    value="None - seating is included"
                                />
                            </ReviewCard>
                        )}

                        {/* Table Booking Details (Table Flow) */}
                        {bookingType !== 'hall' && (
                            <ReviewCard
                                title="Table Booking Details"
                                footer={appliedCoupon && (
                                    <>
                                        <span className="text-[#007AFF] font-[600] text-[14px] flex items-center gap-2">
                                            <i className="fi fi-tr-badge-percent text-[16px]"></i>
                                            Special offer applied <img src={PartyImg} alt="" className="w-4 h-4" />
                                        </span>
                                        <span></span>
                                    </>
                                )}
                            >
                                <ReviewRow icon="fi fi-rr-users" label="Guests" value={guests || 'Not selected'} />
                                <ReviewRow
                                    icon="fi fi-rr-grid"
                                    label="Selected Table(s)"
                                    value={selectedTableNames?.length > 0 ? selectedTableNames.join(', ') : 'Not selected'}
                                />
                                <ReviewRow icon={<Calendar size={18} />} label="Date" value={formatDate(selectedDate)} />
                                <ReviewRow
                                    icon={<Clock size={18} />}
                                    label="Time"
                                    value={selectedTime ? `${selectedTime} (${selectedTimeType || ''})`.trim() : 'Not selected'}
                                />
                                {selectedEventName && (
                                    <ReviewRow icon="fi fi-rr-star" label="Special Event" value={selectedEventName} />
                                )}
                                <ReviewRow icon={<MapPin size={18} />} label="Location" value={locationDisplay} />
                            </ReviewCard>
                        )}

                        {/* Booking Details (Hall Flow) */}
                        {bookingType === 'hall' && (
                            <ReviewCard
                                title="Booking Details"
                                footer={appliedCoupon && (
                                    <>
                                        <span className="text-[#007AFF] font-[600] text-[14px] flex items-center gap-2">
                                            <i className="fi fi-tr-badge-percent text-[16px]"></i>
                                            Special offer applied <img src={PartyImg} alt="" className="w-4 h-4" />
                                        </span>
                                        <span></span>
                                    </>
                                )}
                            >
                                <ReviewRow icon={<Calendar size={18} />} label="Date" value={formatDate(selectedDate)} />
                                <ReviewRow
                                    icon={<Clock size={18} />}
                                    label="Time"
                                    value={selectedTime ? `${selectedTime} (${selectedTimeType || ''})`.trim() : 'Not selected'}
                                />
                                {selectedEventName && (
                                    <ReviewRow icon="fi fi-rr-star" label="Special Event" value={selectedEventName} />
                                )}
                                <ReviewRow icon={<MapPin size={18} />} label="Location" value={locationDisplay} />
                                <ReviewRow icon="fi fi-rr-users" label="Number of Guests" value={guests || 'Not selected'} />
                            </ReviewCard>
                        )}

                        {/* Hall Selection (Hall Flow) */}
                        {bookingType === 'hall' && selectedHall && (
                            <ReviewCard
                                title="Hall Selection"
                                footer={<>
                                    <span className="text-[#645E66] font-[500] text-[14px]">Base Price</span>
                                    <span className="text-[#007AFF] font-[700] text-[15px]">{fmtPrice(prices.hall)}</span>
                                </>}
                            >
                                <ReviewRow icon="fi fi-rr-building" label="Selected Hall" value={selectedHall?.title || selectedHall?.name || 'Not selected'} />
                            </ReviewCard>
                        )}

                        {/* Menu Package (Hall Flow) */}
                        {bookingType === 'hall' && selectedPackage && (
                            <ReviewCard
                                title="Menu Package"
                                footer={<>
                                    <div className="flex flex-col">
                                        <span className="text-[#645E66] font-[500] text-[14px]">Package Charges</span>
                                        <span className="text-[#8D848F] text-[12px]">{fmtPrice(selectedPackage.price)} x {guests || 1} Guests</span>
                                    </div>
                                    <span className="text-[#007AFF] font-[700] text-[15px]">{fmtPrice(prices.package)}</span>
                                </>}
                            >
                                <ReviewRow icon="fi fi-rs-holding-hand-dinner" label="Selected Package" value={selectedPackage?.name || 'Not selected'} />
                            </ReviewCard>
                        )}

                        {/* Cake Booking */}
                        {(selectedFlavor && selectedSize) && (
                            <ReviewCard
                                title="Cake Booking"
                                footer={<>
                                    <span className="text-[#007AFF] font-[600] text-[15px]">Charges</span>
                                    <span className="text-[#007AFF] font-[700] text-[15px]">{fmtPrice(prices.cake)}</span>
                                </>}
                            >
                                <ReviewRow icon="fi fi-rr-cake-birthday" label="Flavour" value={selectedFlavorName || 'Not selected'} />
                                <ReviewRow
                                    icon={<CircleDot size={18} className={isVeg === false ? "text-red-500 fill-red-50" : "text-green-500 fill-green-50"} />}
                                    label="Type"
                                    value={isVeg === false ? 'Non-Veg' : 'Veg'}
                                />
                                <ReviewRow icon="fi fi-rr-expand" label="Size" value={selectedSizeName || 'Not selected'} />
                                <ReviewRow icon="fi fi-rr-boxes" label="Quantity" value={quantity || 1} />
                                {specialMessage && (
                                    <div className="flex flex-col gap-1 text-[14px]">
                                        <div className="flex items-center gap-3 text-[#645E66]">
                                            <i className="fi fi-rr-comment-alt text-[18px]"></i>
                                            <span className="font-[500]">Message</span>
                                        </div>
                                        <p className="text-[#645E66] font-[600] italic ml-8 break-words">"{specialMessage}"</p>
                                    </div>
                                )}
                            </ReviewCard>
                        )}

                        {/* Decoration */}
                        {selectedDecor && (
                            <ReviewCard
                                title="Decoration"
                                footer={<>
                                    <span className="text-[#007AFF] font-[600] text-[15px]">Charges</span>
                                    <span className="text-[#007AFF] font-[700] text-[15px]">{fmtPrice(prices.decoration)}</span>
                                </>}
                            >
                                <ReviewRow icon="fi fi-rr-magic-wand" label="Selected Package" value={selectedDecor.title || selectedDecor.name} />
                                <ReviewRow icon="fi fi-rr-tags" label="Theme" value={selectedDecor.category} />
                            </ReviewCard>
                        )}

                        {/* Add-Ons */}
                        {(selectedAddonDetails && selectedAddonDetails.length > 0) && (
                            <ReviewCard
                                title="Add-Ons"
                                footer={<>
                                    <span className="text-[#007AFF] font-[600] text-[15px]">Charges</span>
                                    <span className="text-[#007AFF] font-[700] text-[15px]">{fmtPrice(prices.addon)}</span>
                                </>}
                            >
                                {selectedAddonDetails.map((addon, idx) => {
                                    const selection = addonSelections?.[addon.id || addon._id] || {};
                                    const options = selection.options || [];
                                    const addonPrice = addonUnitPrice(addon, selection);

                                    let detailsText = '';
                                    if (selection.duration) {
                                        detailsText = `Duration: ${selection.duration}`;
                                    } else if (options.length > 0) {
                                        detailsText = options.join(', ');
                                    }

                                    return (
                                        <div key={idx} className="flex justify-between items-start gap-4 text-[14px]">
                                            <div className="flex items-start gap-3 min-w-0">
                                                {addon.icon && <img src={addon.icon} alt="" className="w-5 h-5 opacity-60 shrink-0 mt-0.5" />}
                                                <div className="flex flex-col min-w-0">
                                                    <span className="text-[#645E66] font-[500]">{addon.title}</span>
                                                    {detailsText && <span className="text-[#8D848F] text-[12px] mt-0.5 break-words">{detailsText}</span>}
                                                </div>
                                            </div>
                                            <span className="text-[#645E66] font-[600] shrink-0">{fmtPrice(addonPrice)}</span>
                                        </div>
                                    );
                                })}
                            </ReviewCard>
                        )}

                        {/* Parking - every vehicle type + when it applies */}
                        {(bookingType !== 'hall' && !parkingSkipped && parkingRows.length > 0) && (
                            <ReviewCard
                                title="Parking Booking"
                                footer={<>
                                    <span className="text-[#007AFF] font-[600] text-[15px]">Charges</span>
                                    <span className="text-[#007AFF] font-[700] text-[15px]">{fmtPrice(prices.parking)}</span>
                                </>}
                            >
                                {parkingRows.map((r) => {
                                    const rate = Number(location.state?.parkingRates?.[r.vehicleType]) || 0;
                                    const label = location.state?.parkingLabels?.[r.vehicleType] || titleCase(r.vehicleType);
                                    return (
                                        <ReviewRow
                                            key={r.vehicleType}
                                            icon={<div className="w-[18px] h-[18px] rounded-full border border-[#645E66] flex items-center justify-center text-[10px] font-bold text-[#645E66]">P</div>}
                                            label={`${r.count} × ${label}`}
                                            value={`${fmtPrice(rate)}/hr · ${fmtPrice(rate * r.count * parkingHours)}`}
                                        />
                                    );
                                })}
                                <ReviewRow
                                    icon={<Clock size={18} />}
                                    label="Parking Time"
                                    value={describeParkingTime({
                                        mode: location.state?.parkingMode === 'event' ? 'event' : 'custom',
                                        hours: parkingHours,
                                        startTime: location.state?.parkingStartTime,
                                    })}
                                />
                            </ReviewCard>
                        )}

                    </div>

                    {/* RIGHT COLUMN — Summary & Actions */}
                    <div className="lg:col-span-1 space-y-4 lg:space-y-6">

                        {/* Bill Summary */}
                        <ReviewCard title="Bill Summary">
                            <div className="flex justify-between items-center text-[14px]">
                                <span className="text-[#645E66] font-[500]">Subtotal</span>
                                <span className="text-[#1A181B] font-[600]">{fmtPrice(prices.full + (prices.discount || 0) + (appliedPoints * pointsToRupee))}</span>
                            </div>
                            {prices.discount > 0 && (
                                <div className="flex justify-between items-center text-[14px]">
                                    <span className="text-[#34C759] font-[500]">Coupon Discount</span>
                                    <span className="text-[#34C759] font-[600]">-{fmtPrice(prices.discount)}</span>
                                </div>
                            )}
                            {appliedPoints > 0 && (
                                <div className="flex justify-between items-center text-[14px]">
                                    <span className="text-[#34C759] font-[500]">Wallet Points ({appliedPoints} pts)</span>
                                    <span className="text-[#34C759] font-[600]">-{fmtPrice(appliedPoints * pointsToRupee)}</span>
                                </div>
                            )}
                            <div className="border-t border-dashed border-[#F2F4F7] pt-4 flex justify-between items-center">
                                <span className="text-[#1A181B] font-[700] text-[16px]">Total Amount</span>
                                <span className="text-[#FE8301] font-[800] text-[18px]">{fmtPrice(prices.full)}</span>
                            </div>
                        </ReviewCard>

                        {/* Payment Option */}
                        <div className="bg-white border border-[#F2F4F7] rounded-[20px] p-5 lg:p-6 shadow-[0px_2px_12px_rgba(0,0,0,0.02)]">
                            <h3 className="text-[16px] lg:text-[18px] font-[700] text-[#1A181B] mb-4 lg:mb-5">Payment Option</h3>
                            <div className="flex flex-row lg:flex-col gap-3">
                                <button
                                    onClick={() => setSelectedPayment('advance')}
                                    className={`flex-1 p-3 lg:p-4 rounded-[12px] border transition-all text-left ${
                                        selectedPayment === 'advance'
                                        ? 'bg-[#FFF9F2] border-[#FE8301]'
                                        : 'bg-white border-[#F2F4F7] hover:border-gray-300'
                                    }`}
                                >
                                    <p className="text-[13px] lg:text-[14px] font-[600] text-[#1A181B] mb-1">Pay Advance (50%)</p>
                                    <p className="text-[14px] lg:text-[16px] font-[800] text-[#007AFF]">{fmtPrice(prices.advance)}</p>
                                </button>
                                <button
                                    onClick={() => setSelectedPayment('full')}
                                    className={`flex-1 p-3 lg:p-4 rounded-[12px] border transition-all text-left ${
                                        selectedPayment === 'full'
                                        ? 'bg-[#FFF9F2] border-[#FE8301]'
                                        : 'bg-white border-[#F2F4F7] hover:border-gray-300'
                                    }`}
                                >
                                    <p className="text-[13px] lg:text-[14px] font-[600] text-[#1A181B] mb-1">Pay Full Amount</p>
                                    <p className="text-[14px] lg:text-[16px] font-[800] text-[#007AFF]">{fmtPrice(prices.full)}</p>
                                </button>
                            </div>
                        </div>

                        {/* Apply Coupon */}
                        <div className="bg-white border border-[#F2F4F7] rounded-[20px] p-5 lg:p-6 shadow-[0px_2px_12px_rgba(0,0,0,0.02)]">
                            <div className="flex items-center gap-2 mb-4">
                                <Tag className="text-[#FE8301]" size={20} />
                                <h3 className="text-[16px] lg:text-[18px] font-[700] text-[#1A181B]">Apply Coupon</h3>
                            </div>
                             <div className="flex gap-2 mb-1">
                                <input
                                    id="bookingCouponCode"
                                    type="text"
                                    placeholder="e.g. FIRST20"
                                    value={couponCode}
                                    onChange={(e) => { setCouponCode(e.target.value.toUpperCase()); if (couponError) setCouponError('') }}
                                    aria-label="Coupon code"
                                    aria-invalid={couponError ? 'true' : 'false'}
                                    aria-describedby={couponError ? 'bookingCouponCode-err' : undefined}
                                    className={`flex-1 min-w-0 bg-white border rounded-[10px] px-4 py-2 text-[14px] font-semibold outline-none ${couponError ? 'border-red-400 focus:border-red-500' : 'border-[#F2F4F7] focus:border-[#FE8301]'}`}
                                />
                                <button
                                    onClick={handleApplyCoupon}
                                    disabled={isApplyingCoupon}
                                    aria-busy={isApplyingCoupon ? 'true' : 'false'}
                                    className="bg-[#FE8301] text-white px-5 py-2 rounded-[10px] text-[14px] font-bold hover:bg-[#e07400] transition-colors disabled:opacity-50 flex items-center gap-2 shrink-0"
                                >
                                    {isApplyingCoupon ? <Loader2 size={16} className="animate-spin" /> : 'Apply'}
                                </button>
                            </div>
                            {couponError && (
                                <p id="bookingCouponCode-err" role="alert" className="text-xs text-red-600 mb-4 flex items-center gap-1">
                                    <span aria-hidden="true">⚠</span>{couponError}
                                </p>
                            )}
                            <div className="space-y-3">
                                <p className="text-[14px] font-[600] text-[#1A181B] mb-2">Available Coupons:</p>
                                {availableCoupons.length > 0 ? (
                                    availableCoupons.map((coupon, idx) => (
                                        <div key={idx} className="bg-[#FAFAFA] rounded-[10px] p-3 text-[13px] border border-transparent hover:border-orange-100 cursor-pointer transition-all" onClick={() => setCouponCode(coupon.code)}>
                                            <span className="text-[#007AFF] font-[600]">{coupon.code}</span> - {coupon.title}
                                            {coupon.description && <p className="text-[#8D848F] text-[11px] mt-0.5">{coupon.description}</p>}
                                        </div>
                                    ))
                                ) : (
                                    <p className="text-[#8D848F] text-[13px]">No coupons available</p>
                                )}
                            </div>
                            {appliedCoupon && (
                                <div className="mt-4 p-3 bg-green-50 border border-green-100 rounded-[10px] flex justify-between items-center">
                                    <div className="flex items-center gap-2">
                                        <Check size={16} className="text-green-600" />
                                        <span className="text-[13px] font-[600] text-green-700">Coupon "{appliedCoupon.coupon?.code || appliedCoupon.code}" applied</span>
                                    </div>
                                    <button onClick={() => setAppliedCoupon(null)} className="text-green-700 hover:text-green-800">
                                        <X size={16} />
                                    </button>
                                </div>
                            )}
                        </div>

                        {/* Wallet */}
                        <div className="bg-white border border-[#F2F4F7] rounded-[20px] p-5 lg:p-6 shadow-[0px_2px_12px_rgba(0,0,0,0.02)]">
                            <div className="flex items-center gap-2 mb-4">
                                <Gift className="text-[#FE8301]" size={20} />
                                <h3 className="text-[16px] lg:text-[18px] font-[700] text-[#1A181B]">Wallet</h3>
                            </div>
                            <div className="flex gap-2 mb-1">
                                <input
                                    id="walletPointsInput"
                                    type="number"
                                    inputMode="numeric"
                                    min="1"
                                    placeholder="Points to redeem"
                                    value={walletPointsInput}
                                    onChange={(e) => { setWalletPointsInput(e.target.value); if (pointsError) setPointsError('') }}
                                    aria-label="Wallet points to redeem"
                                    aria-invalid={pointsError ? 'true' : 'false'}
                                    aria-describedby={pointsError ? 'walletPointsInput-err' : undefined}
                                    className={`flex-1 min-w-0 bg-white border rounded-[10px] px-4 py-2 text-[14px] font-semibold outline-none ${pointsError ? 'border-red-400 focus:border-red-500' : 'border-[#F2F4F7] focus:border-[#FE8301]'}`}
                                />
                                <button
                                    onClick={handleRedeemPoints}
                                    className="bg-[#FE8301] text-white px-5 py-2 rounded-[10px] text-[14px] font-bold hover:bg-[#e07400] transition-colors shrink-0"
                                >
                                    Redeem
                                </button>
                            </div>
                            {pointsError && (
                                <p id="walletPointsInput-err" role="alert" className="text-xs text-red-600 mb-3 flex items-center gap-1">
                                    <span aria-hidden="true">⚠</span>{pointsError}
                                </p>
                            )}
                            <div className="flex justify-between items-center text-[14px] mb-2">
                                <span className="font-[600] text-[#1A181B]">Available Points:</span>
                                <span className="font-[700] text-[#007AFF]">{availablePoints} pts (= {fmtPrice(availablePoints * pointsToRupee)})</span>
                            </div>
                            {appliedPoints > 0 && (
                                <div className="mt-4 p-3 bg-green-50 border border-green-100 rounded-[10px] flex justify-between items-center">
                                    <div className="flex items-center gap-2">
                                        <Check size={16} className="text-green-600" />
                                        <span className="text-[13px] font-[600] text-green-700">{appliedPoints} points applied (-{fmtPrice(appliedPoints * pointsToRupee)})</span>
                                    </div>
                                    <button onClick={handleRemovePoints} className="text-green-700 hover:text-green-800">
                                        <X size={16} />
                                    </button>
                                </div>
                            )}
                        </div>

                        {/* Terms & Conditions */}
                        <div className="bg-white border border-[#F2F4F7] rounded-[20px] p-5 lg:p-6 shadow-[0px_2px_12px_rgba(0,0,0,0.02)]">
                            <button
                                onClick={() => setIsTermsOpen(!isTermsOpen)}
                                className="w-full flex items-center justify-between outline-none"
                            >
                                <span className="text-[16px] font-[700] text-[#1A181B]">Terms & Conditions</span>
                                <ChevronDown size={20} className={`text-[#645E66] transition-transform duration-200 ${isTermsOpen ? 'rotate-180' : ''}`} />
                            </button>
                            {isTermsOpen && (
                                <ul className="space-y-3 mt-4 text-[13px] text-[#645E66] font-[500]">
                                    <li className="flex gap-2">
                                        <div className="w-1.5 h-1.5 rounded-full bg-gray-300 mt-1.5 shrink-0" />
                                        <span>Booking is subject to availability and confirmation.</span>
                                    </li>
                                    <li className="flex gap-2">
                                        <div className="w-1.5 h-1.5 rounded-full bg-gray-300 mt-1.5 shrink-0" />
                                        <span>Please arrive on time; delayed arrival may result in cancellation.</span>
                                    </li>
                                    <li className="flex gap-2">
                                        <div className="w-1.5 h-1.5 rounded-full bg-gray-300 mt-1.5 shrink-0" />
                                        <span>Advance payment is non-refundable within 24 hours of the booking date.</span>
                                    </li>
                                </ul>
                            )}
                        </div>

                        {/* Modification only — Cancellation card removed
                            from this pre-payment screen (CUS-075). A booking
                            doesn't exist yet, so there's nothing to cancel
                            and no refund flow can fire. Customers can edit
                            the inputs via Modification or just back out via
                            the browser back / Previous button.
                            The Cancel action remains available in
                            /customer/booking-history AFTER the booking is
                            created and paid for — that's the correct surface
                            for the refund-per-policy flow. */}
                        <div className="space-y-3">
                            <div
                                onClick={() => navigate(bookingType === 'hall' ? '/customer/book-table-details' : '/customer/booking-type', { state: location.state })}
                                className="bg-white border border-[#F2F4F7] rounded-[20px] p-4 lg:p-5 shadow-[0px_2px_12px_rgba(0,0,0,0.02)] cursor-pointer hover:border-blue-200 transition-colors"
                            >
                                <div className="flex items-center gap-2 mb-1">
                                    <FileEdit size={18} className="text-[#007AFF]" />
                                    <h4 className="font-[700] text-[15px] text-[#1A181B]">Modification</h4>
                                </div>
                                <p className="text-[13px] font-[500] text-[#645E66] ml-6">Edit booking details before arrival (as per the policy)</p>
                            </div>
                        </div>

                    </div>
                </main>

                {/* Footer Actions — Mobile */}
                <div className="fixed bottom-0 left-0 right-0 bg-white p-4 flex gap-4 lg:hidden shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] z-50">
                    <button
                        onClick={() => {
                            const finalAmount = selectedPayment === 'advance' ? prices.advance : prices.full;
                            navigate('/customer/advance-payment', {
                                state: {
                                    ...location.state,
                                    total: finalAmount,
                                    bookingTotal: prices.full,
                                    couponCode: appliedCoupon?.coupon?.code || appliedCoupon?.code || '',
                                    couponDiscount: prices.discount,
                                    walletPointsUsed: appliedPoints,
                                    walletRupeesUsed: Math.round(appliedPoints * pointsToRupee),
                                    paymentType: selectedPayment,
                                    pricesBreakdown: {
                                        hall: prices.hall || 0,
                                        package: prices.package || 0,
                                        decoration: prices.decoration || 0,
                                        cake: prices.cake || 0,
                                        addon: prices.addon || 0,
                                        parking: prices.parking || 0,
                                        discount: prices.discount || 0,
                                    },
                                }
                            });
                        }}
                        className="flex-1 bg-[#FE8301] text-white font-nunito font-semibold text-[14px] py-3.5 rounded-[16px] active:scale-[0.98] transition-transform"
                    >
                        Proceed to Pay
                    </button>
                </div>

                {/* Footer Actions — Desktop */}
                <div className="hidden lg:flex justify-end gap-3 mt-8 pb-10">
                    <button
                        onClick={() => {
                            const finalAmount = selectedPayment === 'advance' ? prices.advance : prices.full;
                            navigate('/customer/advance-payment', {
                                state: {
                                    ...location.state,
                                    total: finalAmount,
                                    bookingTotal: prices.full,
                                    couponCode: appliedCoupon?.coupon?.code || appliedCoupon?.code || '',
                                    couponDiscount: prices.discount,
                                    walletPointsUsed: appliedPoints,
                                    walletRupeesUsed: Math.round(appliedPoints * pointsToRupee),
                                    paymentType: selectedPayment,
                                    pricesBreakdown: {
                                        hall: prices.hall || 0,
                                        package: prices.package || 0,
                                        decoration: prices.decoration || 0,
                                        cake: prices.cake || 0,
                                        addon: prices.addon || 0,
                                        parking: prices.parking || 0,
                                        discount: prices.discount || 0,
                                    },
                                }
                            });
                        }}
                        className="bg-[#FE8301] text-white font-nunito font-semibold text-[14px] py-3 px-8 rounded-[16px] w-[180px] text-center"
                    >
                        Proceed to Pay
                    </button>
                </div>
            </div>

        </div>
    );
};

export default BookingReview;
