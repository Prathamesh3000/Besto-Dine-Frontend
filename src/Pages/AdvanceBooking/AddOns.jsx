import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { useAuth } from '../../Context/AuthContext';
import BookingProgressBar from './BookingProgressBar';
import AddonDetailModal from './AddonDetailModal';
import api from '../../utils/api';

const AddOns = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();

  const [addons, setAddons] = useState([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(null);
  const [selectedAddons, setSelectedAddons] = useState(location.state?.selectedAddons || []);
  const [addonSelections, setAddonSelections] = useState(location.state?.addonSelections || {}); // Maps addonId -> { options: [], duration: '', price: ''}
  const [activeModal, setActiveModal] = useState(null); // 'photographer', 'dj', 'lighting', 'live', 'kids' or null

  const fetchAddons = React.useCallback(async () => {
    setLoading(true);
    setFetchError(null);
    try {
      const res = await api.get('/booking-info/addons');
      if (res.data.success) {
        setAddons(res.data.addons.map(a => ({
          id: a._id,
          slug: a.slug,
          title: a.title,
          description: a.description || '',
          price: a.price ? `₹${a.price.toLocaleString()}` : 'Premium',
          rawPrice: a.price || 0,
          icon: a.icon || '',
          category: a.category || '',
          options: a.options || [],
          isFeatured: a.isFeatured,
          isPopular: a.isPopular,
        })));
      } else {
        setFetchError(res.data?.message || 'Could not load add-ons.');
      }
    } catch (err) {
      console.error('Fetch addons error:', err);
      const code = err.response?.data?.code;
      const msg = err.response?.data?.message;
      if (code === 'FEATURE_LOCKED') {
        setFetchError(msg || "This restaurant doesn't offer add-ons.");
      } else {
        setFetchError(msg || 'Could not load add-ons. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAddons();
  }, [fetchAddons]);

  const handlePrevious = () => {
    navigate(location.state?.bookingType === 'hall' ? '/customer/decoration' : '/customer/cake-details', { state: location.state });
  };

  const handleContinue = () => {
    const selectedAddonDetails = addons.filter(a => selectedAddons.includes(a.id)).map(addon => {
      const selection = addonSelections[addon.id] || {};
      let durationLabel = '';
      if (selection.duration === '2') durationLabel = '2 hrs';
      else if (selection.duration === '4') durationLabel = '4 hrs';
      else if (selection.duration === 'full') durationLabel = 'Full Event';

      return {
        ...addon,
        price: selection.price || addon.rawPrice || 0,
        durationLabel
      };
    });

    navigate(location.state?.bookingType === 'hall' ? '/customer/booking-review' : '/customer/parking-details', {
      state: { ...location.state, selectedAddons, selectedAddonDetails, addonSelections }
    });
  };

  // Pure toggle for the checkbox click. Selecting a complex addon
  // (photographer / dj / etc.) this way picks the base price + default
  // duration — the customer can refine options later by clicking the
  // card body or "View More". Deselecting always just removes.
  const toggleAddon = (addon) => {
    const { id } = addon;
    setSelectedAddons(prev => prev.includes(id)
      ? prev.filter(item => item !== id)
      : [...prev, id]
    );
  };

  // Open the detail modal. Used by the card body click and the
  // explicit "View More" button. Modal's onConfirm path handles the
  // actual selection + options write-through.
  const openAddonDetails = (addon) => {
    if (['photographer', 'dj', 'photobooth', 'live', 'kids', 'host'].includes(addon.slug)) {
      setActiveModal(addon);
    } else {
      // No detail modal exists for this slug — fall back to the
      // checkbox behaviour so the click still does something useful.
      toggleAddon(addon);
    }
  };

  const handleConfirm = (data) => {
    if (activeModal) {
      const { id, slug, rawPrice } = activeModal;
      if (!selectedAddons.includes(id)) {
        setSelectedAddons(prev => [...prev, id]);
      }

      const basePrice = rawPrice || 0;
      let duration = '';
      let price = basePrice;

      if (['photographer', 'dj', 'host', 'photobooth'].includes(slug)) {
        // Duration-based: 2hrs = 40% of base, 4hrs = 80%, full = 100%
        const durationData = slug === 'photobooth' ? data.duration : data[0];
        duration = durationData || 'full';
        price = duration === '2' ? Math.round(basePrice * 0.4)
              : duration === '4' ? Math.round(basePrice * 0.8)
              : basePrice;
        if (slug === 'photobooth') {
          data = data.themes;
        }
      } else {
        // Fixed price addons (live, kids, etc.)
        price = basePrice;
      }

      setAddonSelections(prev => ({
        ...prev,
        [id]: { options: data, duration, price }
      }));
    }
    setActiveModal(null);
  };

  const handleSkip = () => {
    const selectedAddonDetails = addons.filter(a => selectedAddons.includes(a.id)).map(addon => {
      const selection = addonSelections[addon.id] || {};
      return { ...addon, price: selection.price || addon.rawPrice || 0 };
    });
    navigate(location.state?.bookingType === 'hall' ? '/customer/booking-review' : '/customer/parking-details', { 
        state: { ...location.state, selectedAddons, selectedAddonDetails } 
    });
  };


  return (
    <>
      <div className="min-h-screen bg-[#FDFDFD] font-manrope selection:bg-orange-100 overflow-x-hidden">
        <div className="w-full">
          <BookingProgressBar />
        </div>

        <div className="max-w-[1240px] mx-auto pb-24 lg:pb-12 px-5 lg:px-12">
          {/* Mobile Header */}
          <header className="flex lg:hidden items-center justify-between py-6 bg-white sticky top-0 z-40">
            <div className="flex items-center gap-3">
              <button onClick={handlePrevious} className="p-1 -ml-1">
                <ChevronLeft size={24} className="text-[#1A181B]" />
              </button>
              <h1 className="text-[18px] font-[700] text-[#1A181B]">Add-ons</h1>
            </div>
            <button onClick={handleSkip} className="text-[14px] font-[600] text-[#1A181B] bg-[#F8F9FB] px-4 py-1.5 border border-[#F2F4F7] rounded-full">
              Skip
            </button>
          </header>

          {/* Desktop Title & Skip */}
          <div className="flex justify-between items-center mb-6 pt-4">
          <h1 className="hidden lg:block text-[28px] font-[800] text-[#1A181B] tracking-tight">Add-ons</h1>
          <button onClick={handleSkip} className="hidden lg:block bg-[#F8F9FB] border border-[#F2F4F7] px-5 py-2 text-[#645E66] text-[14px] font-[600] rounded-full hover:bg-gray-100 transition-all">
            Skip
          </button>
        </div>

          <main className="mt-8 flex flex-col gap-6">

            <div className="bg-white border border-[#F2F4F7] rounded-[24px] p-6 lg:p-8 shadow-[0px_2px_12px_rgba(0,0,0,0.02)]">

              {/* Loading skeleton */}
              {loading ? (
                <div className="grid grid-cols-2 lg:grid-cols-2 gap-4 lg:gap-6">
                  {[...Array(6)].map((_, i) => (
                    <div key={i} className="rounded-[20px] border-2 border-[#F2F4F7] p-4 py-6 lg:p-6 animate-pulse">
                      <div className="flex justify-between items-start mb-4">
                        <div className="w-[42px] h-[42px] bg-gray-100 rounded-xl" />
                        <div className="w-[22px] h-[22px] bg-gray-100 rounded-md" />
                      </div>
                      <div className="h-3 bg-gray-100 rounded w-3/4 mb-2" />
                      <div className="h-3 bg-gray-100 rounded w-1/2" />
                    </div>
                  ))}
                </div>
              ) : fetchError ? (
                <div className="flex flex-col items-center justify-center py-16 text-center gap-3">
                  <div className="text-[48px] mb-2">✨</div>
                  <p className="text-[14px] font-[600] text-[#FF3B30] max-w-md">{fetchError}</p>
                  <button onClick={fetchAddons} className="bg-[#FE8301] text-white px-5 py-2 rounded-[12px] text-[13px] font-[700]">Retry</button>
                </div>
              ) : addons.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <div className="text-[48px] mb-4">🎉</div>
                  <h3 className="text-[16px] font-[700] text-[#1A181B] mb-1">No Add-ons Available</h3>
                  <p className="text-[13px] text-[#645E66]">Add-ons will appear here once configured by the admin.</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 lg:grid-cols-2 gap-4 lg:gap-6">
                  {addons.map(addon => {
                    const isSelected = selectedAddons.includes(addon.id);

                    return (
                      <div
                        key={addon.id}
                        onClick={() => openAddonDetails(addon)}
                        className={`relative flex flex-col p-4 py-6 lg:p-6 rounded-[20px] transition-all cursor-pointer border-2 bg-white ${isSelected
                            ? 'bg-[#FFF9F2] border-[#FE8301]'
                            : 'border-[#F2F4F7] hover:border-orange-100'
                          }`}
                      >
                        {/* Badges (Featured / Popular) */}
                        {(addon.isFeatured || addon.isPopular) && (
                          <div className="absolute top-3 left-3 flex gap-1">
                            {addon.isFeatured && (
                              <span className="bg-[#FFF3E0] text-[#FE8301] text-[10px] font-[700] px-2 py-0.5 rounded-full">Featured</span>
                            )}
                            {addon.isPopular && (
                              <span className="bg-[#F0FFF4] text-[#22C55E] text-[10px] font-[700] px-2 py-0.5 rounded-full">Popular</span>
                            )}
                          </div>
                        )}

                        {/* Top Row: Icon & Selector */}
                        <div className="flex justify-between items-start mb-4">
                          <div className="w-[42px] h-[42px] lg:w-[48px] lg:h-[48px]">
                            {addon.icon ? (
                              <img src={addon.icon} alt={addon.title} className="w-full h-full object-contain" />
                            ) : (
                              <div className="w-full h-full bg-[#FFF3E0] rounded-xl flex items-center justify-center text-[20px]">✨</div>
                            )}
                          </div>
                          {/* Dedicated checkbox — pure select/deselect.
                              stopPropagation so clicking the box doesn't
                              also bubble to the card's openAddonDetails. */}
                          <button
                            type="button"
                            role="checkbox"
                            aria-checked={isSelected}
                            aria-label={isSelected ? `Remove ${addon.title}` : `Add ${addon.title}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleAddon(addon);
                            }}
                            className={`w-[26px] h-[26px] -m-1 p-1 rounded-md flex items-center justify-center transition-all hover:scale-110 active:scale-95 cursor-pointer`}
                          >
                            <span className={`w-full h-full rounded-md border-2 flex items-center justify-center transition-all ${isSelected
                                ? 'bg-[#FE8301] border-[#FE8301]'
                                : 'bg-white border-[#D9D9D9] hover:border-[#FE8301]'
                              }`}>
                              {isSelected && (
                                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
                                  <path d="M2.5 6L4.5 8L9.5 3.5" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                              )}
                            </span>
                          </button>
                        </div>

                        {/* Category badge */}
                        {addon.category && (
                          <span className="text-[10px] font-[600] text-[#645E66] bg-[#F8F9FB] border border-[#F2F4F7] px-2 py-0.5 rounded-full w-fit mb-2">{addon.category}</span>
                        )}

                        {/* Bottom Row: Text & View More */}
                        <div className="flex items-end justify-between mt-auto">
                          <div className="flex flex-col gap-0.5">
                            <h4 className="text-[15px] lg:text-[16px] font-[700] text-[#1A181B]">{addon.title}</h4>
                            {addon.description && (
                              <p className="text-[12px] text-[#645E66] font-[400] leading-tight line-clamp-1">{addon.description}</p>
                            )}
                            <p className="text-[#007AFF] text-[15px] font-[600] mt-0.5">{addon.price}</p>
                          </div>

                          <div className="hidden lg:block shrink-0 ml-2">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setActiveModal(addon);
                              }}
                              className="text-[#007AFF] text-[13px] font-[600] hover:underline"
                            >
                              View More
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Note Section */}
            <div className="bg-[#F0F7FF] border border-[#D5E8FA] rounded-[24px] p-6 shadow-[0px_2px_12px_rgba(0,0,0,0.02)]">
              <div className="flex items-start gap-3 mb-2">
                <i className="fi fi-rr-file-edit mt-1 text-[#007AFF] text-[20px]"></i>
                <div>
                  <h3 className="text-[16px] lg:text-[18px] font-[700] text-[#1A181B] mb-1">Note</h3>
                  <p className="text-[#645E66] text-[14px] lg:text-[15px] font-[500] leading-relaxed">
                    All add-ons are subject to availability. Our team will confirm availability upon booking approval.
                  </p>
                </div>
              </div>
            </div>


          </main>

          {/* Mobile Fixed Footer */}
          {/* Footer Actions (Desktop & Mobile) */}
        <div className="fixed bottom-0 left-0 right-0 bg-white p-4 flex gap-4 lg:hidden shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] z-50">
          <button onClick={() => navigate(-1)} className="flex-1 bg-[#F2F2F2] text-[#645E66] font-nunito font-semibold text-[14px] py-3.5 rounded-[16px]">
            Previous
          </button>
          <button onClick={handleContinue} className="flex-1 bg-[#FE8301] text-white font-nunito font-semibold text-[14px] py-3.5 rounded-[16px]">
            Continue
          </button>
        </div>

        <div className="hidden lg:flex justify-end gap-3 mt-8 pb-10">
          <button onClick={() => navigate(-1)} className="bg-[#F2F2F2] text-[#645E66] font-nunito font-semibold text-[14px] py-3 px-8 rounded-[16px] w-[140px] text-center">
            Previous
          </button>
          <button onClick={handleContinue} className="bg-[#FE8301] text-white font-nunito font-semibold text-[14px] py-3 px-8 rounded-[16px] w-[140px] text-center">
            Continue
          </button>
        </div>

        </div>

      </div>

      {/* Unified Modal — passes DB options as initial selections */}
      <AddonDetailModal
        isOpen={!!activeModal}
        type={activeModal?.slug}
        data={{ initialSelected: activeModal?.options || [], basePrice: activeModal?.rawPrice || 0 }}
        onClose={() => setActiveModal(null)}
        onConfirm={handleConfirm}
      />
    </>
  );
};

export default AddOns;
