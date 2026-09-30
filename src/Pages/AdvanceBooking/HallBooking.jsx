import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ChevronLeft, Users } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../../Context/AuthContext';
import HallDetailModal from './HallDetailModal';
import BookingProgressBar from './BookingProgressBar';
import api from '../../utils/api';

const HallBooking = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const { user } = useAuth();
    const [halls, setHalls] = useState([]);
    const [loading, setLoading] = useState(true);
    const [fetchError, setFetchError] = useState(null);
    const [selectedHallId, setSelectedHallId] = useState(location.state?.selectedHallId || null);
    const [activeHallForModal, setActiveHallForModal] = useState(null);

    // CUS-079 — capacity validation. Guest count comes in via location
    // state from BookTableDetails. Without the guard a customer can
    // book a 500-cap hall for 5 guests (charged a hall minimum on
    // arrival) or vice versa. Server validates too on /create, but we
    // surface the issue here before the customer wastes 4 more steps.
    const guestCount = Number(location.state?.guests) || 0;
    const hallFits = (hall) => {
        if (!hall) return true;
        const min = Number(hall.minPeople || 0);
        const max = Number(hall.maxPeople || 0);
        if (!guestCount) return true; // no guest count yet → don't pre-block
        if (min && guestCount < min) return false;
        if (max && guestCount > max) return false;
        return true;
    };
    const selectedHall = halls.find(h => (h.id || h._id) === selectedHallId);
    const capacityIssue = guestCount && selectedHall && !hallFits(selectedHall);
    const capacityMsg = (() => {
        if (!selectedHall) return '';
        const min = Number(selectedHall.minPeople || 0);
        const max = Number(selectedHall.maxPeople || 0);
        if (min && guestCount < min) {
            return `${selectedHall.title} needs a minimum of ${min} guests. Update guest count or pick a smaller hall.`;
        }
        if (max && guestCount > max) {
            return `${selectedHall.title} fits up to ${max} guests. Update guest count or pick a bigger hall.`;
        }
        return '';
    })();

    const fetchHalls = React.useCallback(async () => {
        setLoading(true);
        setFetchError(null);
        try {
            const res = await api.get('/halls');
            if (res.data.success) {
                setHalls(res.data.halls.filter(h => h.isActive || h.status === true));
            } else {
                setFetchError(res.data?.message || 'Could not load halls.');
            }
        } catch (err) {
            console.error('Failed to fetch halls:', err);
            // 403 FEATURE_LOCKED already produces a toast via the global
            // interceptor — surface a precise inline message too so the
            // empty state isn't ambiguous.
            const code = err.response?.data?.code;
            const msg = err.response?.data?.message;
            if (code === 'FEATURE_LOCKED') {
                setFetchError(msg || "This restaurant doesn't offer hall bookings.");
            } else {
                setFetchError(msg || 'Could not load halls. Please try again.');
            }
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchHalls();
    }, [fetchHalls]);

    const handleHallClick = (hall) => {
        const hallId = hall.id || hall._id;
        // CUS-079 — block selecting halls that don't fit the guest count.
        // Toast tells the user exactly what's wrong so they can either
        // change hall or back up to BookTableDetails to update guests.
        if (guestCount && !hallFits(hall)) {
            const min = Number(hall.minPeople || 0);
            const max = Number(hall.maxPeople || 0);
            const reason = (min && guestCount < min)
                ? `${hall.title} needs at least ${min} guests (you've entered ${guestCount}).`
                : `${hall.title} fits up to ${max} guests (you've entered ${guestCount}).`;
            toast.error(reason, { id: `hall-fit-${hallId}`, duration: 4500 });
            return;
        }
        setSelectedHallId(hallId);
        setActiveHallForModal({
            ...hall,
            id: hallId,
            capacityRange: `${hall.minPeople} - ${hall.maxPeople} guests`,
            amenities: hall.infrastructure || [],
            galleryImages: hall.images || []
        });
    };

    const handleConfirmBooking = (hallId) => {
        setSelectedHallId(hallId);
        setActiveHallForModal(null);
    };

    return (
        <div className="min-h-screen bg-[#FFFFFF] dark:bg-gray-900 flex flex-col relative transition-colors duration-200">
            <div className="w-full">
                <BookingProgressBar />
            </div>

            <div className="w-full max-w-[1240px] mx-auto px-5 lg:px-12 pb-24 lg:pb-12 flex-1">
                {/* Header */}
                <header className="lg:static sticky top-0 bg-[#FFFFFF] dark:bg-gray-900 z-10 w-full mb-4">
                    <div className="mx-auto w-full">
                        {/* Desktop Header */}
                        <div className="hidden md:block">

                            <div className="flex items-center justify-between mb-6 pt-4">
                                <h1 className="text-[28px] font-[800] text-[#1A181B] tracking-tight">Book Hall</h1>
                                <button
                                    onClick={() => navigate('/customer/package-selection', { state: location.state })}
                                    className="hidden lg:block bg-[#F8F9FB] border border-[#F2F4F7] px-5 py-2 text-[#645E66] text-[14px] font-[600] rounded-full hover:bg-gray-100 transition-all"
                                >
                                    Skip
                                </button>
                            </div>
                        </div>

                        {/* Mobile Header */}
                        <div className="flex items-center justify-between md:hidden">
                            <div className="flex items-center gap-3">
                                <button
                                    onClick={() => navigate(-1)}
                                    className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                                >
                                    <ChevronLeft size={24} className="text-[#666666] dark:text-white" />
                                </button>
                                <h1 className="text-[20px] font-bold nunito text-[#1A181B] py-2 dark:text-white leading-tight">Book hall</h1>
                            </div>

                            <div className="w-9 h-9 rounded-full overflow-hidden border border-gray-100 dark:border-gray-700 shadow-sm">
                                {/* Real avatar (User model auto-generates a
                                    ui-avatars.com URL on save) → fall back to
                                    a name-initial avatar for guests. The old
                                    code referenced user?.profileImage which
                                    doesn't exist on the user doc, so the
                                    Unsplash dummy photo always fired. */}
                                <img
                                    src={user?.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(user?.name || 'Guest')}&background=FE8301&color=fff`}
                                    alt={user?.name || 'Guest'}
                                    className="w-full h-full object-cover"
                                />
                            </div>
                        </div>
                    </div>
                </header>

                {/* Main Content */}
                <main className="flex-1 overflow-y-auto pb-8 items-center px-4 relative">
                    <div className="max-w-7xl mx-auto">
                        {/* CUS-079 — capacity context strip. Tells the user
                            upfront which halls will work for their party
                            size so they don't waste clicks on out-of-range
                            options. Hidden until guests is set. */}
                        {guestCount > 0 && (
                            <div className="mb-4 bg-[#FFF8EE] border border-[#FFE0B7] rounded-[12px] px-4 py-3 flex items-center gap-2.5">
                                <Users size={16} className="text-[#FE8301] shrink-0" />
                                <p className="text-[13px] font-varela text-[#645E66] leading-snug">
                                    Showing options for <span className="font-semibold text-[#1A181B]">{guestCount} guest{guestCount > 1 ? 's' : ''}</span>. Halls outside this range are dimmed.{' '}
                                    <button
                                        onClick={() => navigate('/customer/book-table-details', { state: location.state })}
                                        className="text-[#FE8301] font-semibold underline-offset-2 hover:underline"
                                    >
                                        Change count
                                    </button>
                                </p>
                            </div>
                        )}
                        {loading ? (
                            <div className="flex justify-center py-16">
                                <div className="w-8 h-8 border-4 border-[#FE8301] border-t-transparent rounded-full animate-spin" />
                            </div>
                        ) : fetchError ? (
                            <div className="flex flex-col items-center gap-3 py-16 text-center">
                                <span className="text-3xl">🏛️</span>
                                <p className="text-[14px] font-[600] text-[#FF3B30] max-w-md">{fetchError}</p>
                                <button onClick={fetchHalls} className="bg-[#FE8301] text-white px-5 py-2 rounded-[12px] text-[13px] font-[700]">Retry</button>
                            </div>
                        ) : halls.length === 0 ? (
                            <div className="flex flex-col items-center gap-2 py-16 text-center">
                                <span className="text-3xl">🏛️</span>
                                <p className="text-[14px] font-[600] text-[#1A181B]">No halls configured</p>
                                <p className="text-[12px] text-[#8D848F]">This restaurant hasn't listed any halls yet.</p>
                            </div>
                        ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                             {halls.map((hall) => {
                                const fits = hallFits(hall);
                                const min = Number(hall.minPeople || 0);
                                const max = Number(hall.maxPeople || 0);
                                const dimReason = guestCount && !fits
                                    ? (min && guestCount < min)
                                        ? `Needs ${min}+ guests`
                                        : `Fits up to ${max} guests`
                                    : null;
                                return (
                                <div
                                    key={hall.id || hall._id}
                                    onClick={() => handleHallClick(hall)}
                                    className={`
                                        group relative rounded-[16px] p-4 bg-[#FFFFFF] dark:bg-gray-800 border-[1px] shadow-[0px_4px_8.4px_0px_#D0C9F833]
                                        transition-all duration-200 flex flex-col h-full cursor-pointer
                                        ${selectedHallId === (hall.id || hall._id)
                                            ? 'border-orange-200 ring-1 ring-orange-200 shadow-md'
                                            : 'border-[#F6F6F6] hover:border-orange-100 hover:shadow-lg'
                                        }
                                        ${dimReason ? 'opacity-60 cursor-not-allowed' : ''}
                                    `}
                                >
                                    {/* Image */}
                                    <div className="w-full relative h-full mb-4 overflow-hidden rounded-[16px] bg-[#F6F6F6]">
                                        <img
                                            src={hall.image}
                                            alt={hall.title}
                                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                                        />
                                        {/* CUS-079 dim badge */}
                                        {dimReason && (
                                            <span className="absolute top-2 left-2 bg-red-600 text-white text-[11px] font-nunito font-semibold px-2 py-1 rounded-full shadow">
                                                {dimReason}
                                            </span>
                                        )}
                                    </div>


                                    {/* Content */}
                                    <div className="flex flex-col flex-1">
                                        <div className="flex justify-between items-start mb-1.5">
                                            <h3 className="text-[20px] lg:text-[24px] font-semibold font-nunito text-[#1A181B] dark:text-white leading-snug truncate">{hall.title}</h3>
                                            {/* <BookmarkButton
                                                itemId={hall.id}
                                                itemDetails={hall}
                                                className="p-1 text-gray-400"
                                            /> */}
                                        </div>

                                        <p className="text-[#8D848F] dark:text-gray-400 text-[14px] lg:text-[16px] font-medium font-varela-round mb-2.5 line-clamp-2">
                                            {hall.description}
                                        </p>

                                         {/* Tags */}
                                        <div className="flex flex-wrap gap-2 mb-1.5 lg:mb-6">
                                            {hall.tags?.map((tag, idx) => (
                                                <span key={idx} className="px-3 py-2 bg-[#FDF5FF] dark:bg-pink-900/20 text-[#645E66] font-varela-round dark:text-pink-300 text-[14px] rounded-[60px]">
                                                    {tag}
                                                </span>
                                            ))}
                                        </div>

                                        {/* Price & Action */}
                                        <div className="mt-auto flex items-center justify-between  border-t border-gray-50 dark:border-gray-700">
                                            <div className="flex items-baseline gap-1">
                                                <span className="text-[#1A181B] dark:text-white font-nunito text-[20px] font-semibold">{hall.price}</span>
                                                <span className="text-gray-500 dark:text-gray-400 text-[16px] font-semibold font-nunito">base price</span>
                                            </div>

                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleHallClick(hall);
                                                }}
                                                className="hidden md:block px-4 py-2 bg-[#F2F2F2] text-[16px] font-nunito hover:bg-gray-200 text-gray-700  font-semibold rounded-[16px] transition-colors"
                                            >
                                                View More
                                            </button>
                                        </div>

                                        {/* Extra hour charges note */}
                                        <p className="text-[14px] text-[#007AFF] mt-1.5 font-varela-round">Extra hour charges apply</p>
                                    </div>
                                </div>
                                );
                             })}
                        </div>
                        )}

                        {/* Note Section */}
                        <div className="mt-[32px] mb-[40px] bg-[#A6D0FF33] dark:bg-blue-900/20 rounded-[16px] p-4 border border-[#DAECFE] dark:border-blue-800/30">
                            <div className="flex items-center gap-3 mb-3">
                                <i className="fi fi-rr-file-edit text-[#0094FF] text-[26px]"></i>
                                <h3 className="font-semibold font-nunito text-[26px] text-[#1A181B] pb-1.5 dark:text-white">Note</h3>
                            </div>
                            <p className="text-[#8D848F] font-varela-round dark:text-gray-400 text-[16px] leading-relaxed">
                                All add-ons are subject to availability at the time of booking. Our team will carefully check and confirm the availability of the selected add-ons once your booking request has reviewed and approved. Final confirmation will be shared with you before proceeding further to ensure everything is arranged as requested.
                            </p>
                        </div>
                    </div>

                    {/* CUS-079 — inline warning when the selected hall
                        doesn't fit the guest count. Renders above the
                        footer so it's visible without scroll. */}
                    {capacityIssue && (
                        <div className="mb-4 bg-red-50 border border-red-200 rounded-[12px] px-4 py-3 text-[13px] font-varela text-red-700 leading-snug">
                            ⚠ {capacityMsg}
                        </div>
                    )}

                    {/* Footer Actions (Desktop & Mobile) */}
                    <div className="fixed bottom-0 left-0 right-0 bg-white p-4 flex gap-4 lg:hidden shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] z-50">
                        <button onClick={() => navigate(-1)} className="flex-1 bg-[#F2F2F2] text-[#645E66] font-nunito font-semibold text-[14px] py-3.5 rounded-[16px]">
                            Previous
                        </button>
                        <button
                          disabled={!selectedHallId || capacityIssue}
                          onClick={() => {
                            if (selectedHallId && !capacityIssue) {
                                const selectedHall = halls.find(h => h._id === selectedHallId);
                                navigate('/customer/package-selection', { state: { ...location.state, selectedHallId, selectedHall } });
                            }
                          }}
                          className={`flex-1 font-nunito font-semibold text-[14px] py-3.5 rounded-[16px] transition-all ${
                            selectedHallId && !capacityIssue ? 'bg-[#FE8301] text-white' : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                          }`}
                        >
                            Reserve Hall
                        </button>
                    </div>

                    <div className="hidden lg:flex justify-end gap-3 mt-8 pb-10">
                        <button
                          onClick={() => navigate(-1)}
                          className="bg-[#F2F2F2] text-[#645E66] font-nunito font-semibold text-[14px] py-3 px-8 rounded-[16px] w-[140px] text-center"
                        >
                            Previous
                        </button>
                        <button
                          disabled={!selectedHallId || capacityIssue}
                          onClick={() => {
                            if (selectedHallId && !capacityIssue) {
                                const selectedHall = halls.find(h => (h.id === selectedHallId || h._id === selectedHallId));
                                navigate('/customer/package-selection', { state: { ...location.state, selectedHallId, selectedHall } });
                            }
                          }}
                          className={`font-nunito font-semibold text-[14px] py-3 px-8 rounded-[16px] w-[160px] text-center transition-all ${
                            selectedHallId && !capacityIssue ? 'bg-[#FE8301] text-white' : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                          }`}
                        >
                            Reserve Hall
                        </button>
                    </div>
                </main>
            </div>

            {/* Hall Detail Modal */}
            <HallDetailModal
                isOpen={!!activeHallForModal}
                hall={activeHallForModal}
                onClose={() => setActiveHallForModal(null)}
                onConfirm={handleConfirmBooking}
            />

        </div>
    );
};

export default HallBooking;

