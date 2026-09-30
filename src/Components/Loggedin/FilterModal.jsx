import React, { useState, useEffect } from "react";
import { X } from "lucide-react";

const FilterModal = ({ isOpen, onClose, onApplyFilters, activeFilters }) => {
  const [priceRange, setPriceRange] = useState([0, 1000]);
  const [activeThumb, setActiveThumb] = useState(null);

  const [selectedPrice, setSelectedPrice] = useState(null);
  const [selectedPreference, setSelectedPreference] = useState(null);
  const [selectedOffers, setSelectedOffers] = useState([]);
  const [healthyMode, setHealthyMode] = useState(false);

  // Sync internal state when modal opens
  React.useEffect(() => {
    if (isOpen && activeFilters) {
      setPriceRange([activeFilters.minPrice ?? 0, activeFilters.maxPrice ?? 1000]);
      setSelectedPreference(activeFilters.preference);
      setSelectedOffers(activeFilters.offers || []);
      setHealthyMode(activeFilters.healthyMode || false);
    }
  }, [isOpen, activeFilters]);

  const priceRanges = [
    { id: "under200", label: "Under\n₹200", icon: "₹" },
    { id: "200-400", label: "₹200-\n₹400", icon: "₹" },
    { id: "400-700", label: "₹400-\n₹700", icon: "₹" },
    { id: "above700", label: "Above\n₹700", icon: "₹" },
  ];

  const foodPreferences = [
    { id: "veg", label: "Pure\nVeg", color: "green" },
    { id: "nonveg", label: "Non-\nveg", color: "red" },
  ];

  const offers = [
    { id: "flat", label: "Flat Discounts" },
    { id: "happy", label: "Happy Hours" },
    { id: "buy1", label: "Buy 1 Get 1" },
  ];

  const handleClearAll = () => {
    const clearedFilters = {
      minPrice: 0,
      maxPrice: 1000,
      preference: null,
      offers: [],
      healthyMode: false,
    };
    setPriceRange([0, 1000]);
    setSelectedPrice(null);
    setSelectedPreference(null);
    setSelectedOffers([]);
    setHealthyMode(false);
    onApplyFilters(clearedFilters);
  };

  const handleApply = () => {
    // Filters are already applied immediately.
    // This button now just closes the modal.
    onClose();
  };

  const toggleOffer = (offerId) => {
    setSelectedOffers((prev) => {
      const newOffers = prev.includes(offerId)
        ? prev.filter((id) => id !== offerId)
        : [...prev, offerId];

      onApplyFilters({
        minPrice: priceRange[0],
        maxPrice: priceRange[1],
        preference: selectedPreference,
        offers: newOffers,
        healthyMode: healthyMode,
      });

      return newOffers;
    });
  };

  // Lock body scroll while the modal is open so the page behind
  // doesn't scroll when the user drags inside the modal on mobile.
  useEffect(() => {
    if (!isOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    // Backdrop — tap-to-close. h-[100dvh] uses the dynamic viewport
    // height so the modal isn't pushed behind the mobile URL bar.
    // z-[100] because BottomNav lives at z-50 and would otherwise sit
    // on top of the modal's Done button.
    <div
      onClick={onClose}
      className="fixed inset-x-0 top-0 h-[100dvh] z-[100] bg-black/60 flex items-end sm:items-center justify-center"
    >
      {/* Stop bubble — clicks inside the modal don't close it */}
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full sm:max-w-[450px] md:max-w-[500px]"
      >
        {/* Modal card — bottom sheet on mobile, centred card on sm+ */}
        <div className="relative bg-white w-full sm:rounded-2xl rounded-t-3xl shadow-2xl max-h-[88dvh] sm:max-h-[85dvh] overflow-hidden flex flex-col">
          {/* Mobile drag handle — visual cue this is a bottom sheet */}
          <div className="sm:hidden flex justify-center pt-2 pb-1 shrink-0">
            <span className="w-10 h-1 bg-gray-200 rounded-full" />
          </div>

          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 shrink-0">
            <h2
              className="text-[18px] font-semibold text-[#1A181B]"
              style={{ fontFamily: "Nunito, sans-serif", fontWeight: 600 }}
            >
              Filter & Sort
            </h2>
            <div className="flex items-center gap-3">
              <button
                onClick={handleClearAll}
                className="text-[#FF9B0B] hover:text-orange-600 varela-rounded font-regular text-[14px] transition-colors"
                style={{ fontWeight: 400 }}
              >
                Clear All
              </button>
              <button
                onClick={onClose}
                aria-label="Close filter"
                className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center active:scale-95 transition-all"
              >
                <X size={18} className="text-gray-700" />
              </button>
            </div>
          </div>

          {/* Content — min-h-0 is the load-bearing fix: flex items default
              to min-height:auto, which prevents overflow:auto from kicking
              in. Without it the modal grew past 88dvh and the inner
              section never scrolled on small screens. */}
          <div className="flex-1 min-h-0 overflow-y-auto px-5 space-y-6 pb-6">
            {/* Dish Price */}
            <div>
              <h3
                className="font-regular text-[14px] font-varela text-[#1A181B] mb-2"
                style={{ fontWeight: 400 }}
              >
                Dish Price
              </h3>
              <div className="bg-[#F7F7F7] rounded-[16px] p-8 relative">
                {/* Slider Container */}
                <div
                  className="relative h-2 bg-gray-300 rounded-full cursor-pointer"
                  onClick={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect();
                    const clickX = e.clientX - rect.left;
                    const percentage = clickX / rect.width;
                    const clickValue = Math.round(percentage * 1000);

                    // Determine which thumb is closer
                    const distToMin = Math.abs(clickValue - priceRange[0]);
                    const distToMax = Math.abs(clickValue - priceRange[1]);

                    let newRange;
                    if (distToMin < distToMax) {
                      // Move min thumb
                      const val = Math.min(clickValue, priceRange[1] - 10);
                      newRange = [Math.max(0, val), priceRange[1]];
                    } else {
                      // Move max thumb
                      const val = Math.max(clickValue, priceRange[0] + 10);
                      newRange = [priceRange[0], Math.min(1000, val)];
                    }

                    setPriceRange(newRange);
                    onApplyFilters({
                      minPrice: newRange[0],
                      maxPrice: newRange[1],
                      preference: selectedPreference,
                      offers: selectedOffers,
                      healthyMode: healthyMode,
                    });
                  }}
                >
                  {/* Active Track */}
                  <div
                    className="absolute h-2 bg-[#FF9B0B] rounded-full pointer-events-none"
                    style={{
                      left: `${(priceRange[0] / 1000) * 100}%`,
                      right: `${100 - (priceRange[1] / 1000) * 100}%`,
                    }}
                  />

                  {/* Invisible Inputs */}
                  <style>
                    {`
                      .range-slider-input::-webkit-slider-thumb {
                        pointer-events: auto;
                        width: 20px;
                        height: 20px;
                        -webkit-appearance: none;
                      }
                      .range-slider-input::-moz-range-thumb {
                        pointer-events: auto;
                        width: 20px;
                        height: 20px;
                        border: none;
                      }
                    `}
                  </style>

                  {/* Min slider */}
                  <input
                    type="range"
                    min="0"
                    max="1000"
                    value={priceRange[0]}
                    onMouseDown={() => setActiveThumb("min")}
                    onTouchStart={() => setActiveThumb("min")}
                    onChange={(e) => {
                      const val = Math.min(Number(e.target.value), priceRange[1] - 10);
                      const newRange = [val, priceRange[1]];
                      setPriceRange(newRange);
                      onApplyFilters({
                        minPrice: newRange[0],
                        maxPrice: newRange[1],
                        preference: selectedPreference,
                        offers: selectedOffers,
                        healthyMode: healthyMode,
                      });
                    }}
                    className="absolute w-full h-2 opacity-0 cursor-pointer pointer-events-none z-20 range-slider-input"
                  />

                  {/* Max slider */}
                  <input
                    type="range"
                    min="0"
                    max="1000"
                    value={priceRange[1]}
                    onMouseDown={() => setActiveThumb("max")}
                    onTouchStart={() => setActiveThumb("max")}
                    onChange={(e) => {
                      const val = Math.max(Number(e.target.value), priceRange[0] + 10);
                      const newRange = [priceRange[0], val];
                      setPriceRange(newRange);
                      onApplyFilters({
                        minPrice: newRange[0],
                        maxPrice: newRange[1],
                        preference: selectedPreference,
                        offers: selectedOffers,
                        healthyMode: healthyMode,
                      });
                    }}
                    className="absolute w-full h-2 opacity-0 cursor-pointer pointer-events-none z-20 range-slider-input"
                  />




                  {/* Min Thumb */}
                  <div
                    className="absolute top-1/2 w-5 h-5 bg-[#FF9B0B] border-2 border-[#FFFFFF] rounded-full -translate-y-1/2 shadow pointer-events-none"
                    style={{
                      left: `calc(${(priceRange[0] / 1000) * 100}% - 10px)`,
                    }}
                  >
                    {/* Price Label */}
                    <span className="absolute -top-6 left-1/2 rounded-[8px]  px-2 py-1 mb-1 bg-[#FFFFFF] -translate-x-1/2 text-[10px] varela-rounded font-normal text-[#645E66]">
                      ₹{priceRange[0]}
                    </span>
                  </div>

                  {/* Max Thumb */}
                  <div
                    className="absolute top-1/2 w-5 h-5 bg-[#FF9B0B] border-2 border-[#FFFFFF] rounded-full -translate-y-1/2 shadow pointer-events-none"
                    style={{
                      left: `calc(${(priceRange[1] / 1000) * 100}% - 10px)`,
                    }}
                  >
                    {/* Price Label */}
                    <span className="absolute -top-6 left-1/2 rounded-[8px]  px-2 py-1 mb-1 bg-[#FFFFFF] -translate-x-1/2 text-[10px] varela-rounded font-normal text-[#645E66]">
                      ₹{priceRange[1]}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Food Preference */}
            <div>
              <h3
                className="font-regular text-[14px] font-varela text-[#1A181B] mb-2"
                style={{ fontWeight: 400 }}
              >
                Food Preference
              </h3>
              <div className="bg-[#F7F7F7] rounded-[16px] p-2 flex gap-4">
                {foodPreferences.map((pref) => {
                  const isSelected = selectedPreference === pref.id;

                  return (
                    <button
                      key={pref.id}
                      onClick={() => {
                        const newPref = isSelected ? null : pref.id;
                        setSelectedPreference(newPref);
                        onApplyFilters({
                          minPrice: priceRange[0],
                          maxPrice: priceRange[1],
                          preference: newPref,
                          offers: selectedOffers,
                          healthyMode: healthyMode,
                        });
                      }}
                      className={`flex-1 py-4 rounded-[12px] transition-all ${isSelected ? "bg-[#FFF1E3]" : "bg-white"
                        }`}
                    >
                      <div className="flex flex-col items-center justify-center gap-2">
                        {/* Radio */}
                        <div
                          className={`w-6 h-6 rounded-[6px] border-2 flex items-center justify-center ${pref.color === "green"
                            ? "border-[#34C759]"
                            : "border-[#FF3B30]"
                            }`}
                        >
                          <div
                            className={`w-3 h-3 rounded-full ${pref.color === "green"
                              ? "bg-[#34C759]"
                              : "bg-[#FF3B30]"
                              }`}
                          />
                        </div>

                        {/* Label */}
                        <span
                          className={`text-[13px] font-varela font-regular text-center leading-[16px] ${isSelected ? "text-[#1A181B]" : "text-[#645E66]"
                            }`}
                          style={{ fontWeight: 400 }}
                        >
                          {pref.label}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Offers */}
            <div>
              <h3
                className="font-regular text-[14px] font-varela text-[#1A181B] mb-2"
                style={{ fontWeight: 400 }}
              >
                Offers
              </h3>

              {/* Outer container */}
              <div className="bg-[#F7F7F7] rounded-[16px] p-2">
                <div className="flex flex-wrap gap-3">
                  {offers.map((offer) => {
                    const isSelected = selectedOffers.includes(offer.id);

                    return (
                      <button
                        key={offer.id}
                        onClick={() => toggleOffer(offer.id)}
                        className={`px-1.5 py-1.5 rounded-[8px] font-regular text-[14px] font-varela transition-all ${isSelected
                          ? "bg-[#FFF4E8] text-[#1A181B]"
                          : "bg-white text-[#645E66]"
                          }`}
                        style={{
                          fontWeight: 400,
                        }}
                      >
                        {offer.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* Apply Button — sticky footer; safe-area padding so the
              button isn't tucked under the home indicator on iOS */}
          <div className="px-5 py-4 border-t border-gray-100 shrink-0 pb-[max(1rem,env(safe-area-inset-bottom))]">
            <button
              onClick={handleApply}
              className="w-full bg-[#FE8301] hover:bg-[#E67700] text-white font-semibold py-3 px-6 rounded-full transition-colors shadow-lg text-[16px]"
              style={{ fontFamily: "Nunito, sans-serif", fontWeight: 600 }}
            >
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default FilterModal;
