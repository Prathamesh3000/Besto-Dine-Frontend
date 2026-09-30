import React, { useEffect } from 'react';
import { X } from 'lucide-react';

const FilterPopup = ({
    isOpen,
    onClose,
    activeFilters = [],
    onToggleFilter,
    onClearAll,
    priceRange = [0, 1000],
    onPriceChange
}) => {
    // Lock body scroll while open so the page behind doesn't scroll
    // when the user drags inside the popup on mobile.
    useEffect(() => {
        if (!isOpen) return;
        const prev = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => { document.body.style.overflow = prev; };
    }, [isOpen]);

    if (!isOpen) return null;

    const isFilterActive = (filterName) => activeFilters.includes(filterName);

    const handleMinChange = (e) => {
        const value = Math.min(Number(e.target.value), priceRange[1] - 50);
        onPriceChange([value, priceRange[1]]);
    };

    const handleMaxChange = (e) => {
        const value = Math.max(Number(e.target.value), priceRange[0] + 50);
        onPriceChange([priceRange[0], value]);
    };

    return (
        // Backdrop — tap-to-close. inset-x-0 + top-0 + 100dvh so the
        // overlay isn't pushed behind the mobile URL bar.
        <div
            onClick={onClose}
            className="fixed inset-x-0 top-0 h-[100dvh] z-[100] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-[2px]"
        >
            {/* Popup Content — stop bubble so internal taps don't close */}
            <div
                onClick={(e) => e.stopPropagation()}
                className="w-full bg-white rounded-t-[32px] sm:rounded-[32px] p-6 sm:p-8 max-w-md mx-auto max-h-[88dvh] sm:max-h-[85dvh] overflow-y-auto no-scrollbar pb-[max(1rem,env(safe-area-inset-bottom))]"
            >
                {/* Mobile drag handle */}
                <div className="sm:hidden flex justify-center pb-3 -mt-2">
                    <span className="w-10 h-1 bg-gray-200 rounded-full" />
                </div>

                <div className="flex justify-between items-center mb-6 sm:mb-10">
                    <h2 className="text-[24px] font-bold text-[#1A181B]">Filter & Sort</h2>
                    <div className="flex items-center gap-3">
                        <button onClick={onClearAll} className="text-[#FFA601] text-[18px] font-semibold">Clear All</button>
                        <button
                            onClick={onClose}
                            aria-label="Close filter"
                            className="w-9 h-9 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center active:scale-95 transition-all"
                        >
                            <X size={20} className="text-gray-700" />
                        </button>
                    </div>
                </div>

                {/* Dish Price Section */}
                <div className="mb-10">
                    <h3 className="text-[18px] font-semibold text-[#1A181B] mb-6">Dish Price</h3>
                    <div className="bg-[#F8F9FA] rounded-[24px] p-6 pt-10 pb-8">
                        <div className="relative h-1 bg-[#DDDDDD] rounded-full mx-4 mb-4">
                            {/* Visual Range bar */}
                            <div
                                className="absolute h-full bg-[#FFA601] rounded-full"
                                style={{
                                    left: `${(priceRange[0] / 1000) * 100}%`,
                                    right: `${100 - (priceRange[1] / 1000) * 100}%`
                                }}
                            />

                            {/* Standard range inputs hidden but functional */}
                            <input
                                type="range"
                                min="0"
                                max="1000"
                                value={priceRange[0]}
                                onChange={handleMinChange}
                                className="absolute w-full h-1 appearance-none bg-transparent pointer-events-none z-20 [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:w-6 [&::-webkit-slider-thumb]:h-6 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-[#FFA601] [&::-webkit-slider-thumb]:appearance-none [&::-moz-range-thumb]:pointer-events-auto [&::-moz-range-thumb]:w-6 [&::-moz-range-thumb]:h-6 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-white [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-[#FFA601]"
                            />
                            <input
                                type="range"
                                min="0"
                                max="1000"
                                value={priceRange[1]}
                                onChange={handleMaxChange}
                                className="absolute w-full h-1 appearance-none bg-transparent pointer-events-none z-20 [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:w-6 [&::-webkit-slider-thumb]:h-6 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-[#FFA601] [&::-webkit-slider-thumb]:appearance-none [&::-moz-range-thumb]:pointer-events-auto [&::-moz-range-thumb]:w-6 [&::-moz-range-thumb]:h-6 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-white [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-[#FFA601]"
                            />

                            {/* Handles (for visual only, input thumb does the work) */}
                            {/* Tooltips */}
                            <div
                                className="absolute -top-10 -translate-x-1/2 bg-white px-3 py-1.5 rounded-xl shadow-sm border border-gray-50 text-[14px] font-bold text-[#645E66] z-10"
                                style={{ left: `${(priceRange[0] / 1000) * 100}%` }}
                            >
                                ₹{priceRange[0]}
                            </div>
                            <div
                                className="absolute -top-10 -translate-x-1/2 bg-white px-3 py-1.5 rounded-xl shadow-sm border border-gray-50 text-[14px] font-bold text-[#645E66] z-10"
                                style={{ left: `${(priceRange[1] / 1000) * 100}%` }}
                            >
                                ₹{priceRange[1]}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Food Preference Section */}
                <div className="mb-10">
                    <h3 className="text-[18px] font-semibold text-[#1A181B] mb-6">Food Preference</h3>
                    <div className="bg-[#F8F9FA] rounded-[24px] p-6 flex gap-4">
                        <button
                            onClick={() => onToggleFilter('Pure Veg')}
                            className={`flex flex-col items-center justify-center gap-2 rounded-2xl w-[80px] py-4 transition-all active:scale-95 ${isFilterActive('Pure Veg') ? 'bg-[#FFF5ED] border border-[#FFAC2F]/20 shadow-sm' : 'bg-white border border-gray-100'}`}
                        >
                            <div className="w-6 h-6 rounded-full border border-[#34C759] flex items-center justify-center">
                                <div className={`w-3 h-3 bg-[#34C759] rounded-full ${isFilterActive('Pure Veg') ? 'scale-100 opacity-100' : 'scale-0 opacity-0'} transition-all`} />
                            </div>
                            <span className={`text-[14px] font-bold text-center leading-tight ${isFilterActive('Pure Veg') ? 'text-[#1A181B]' : 'text-[#8D848F]'}`}>Pure<br />Veg</span>
                        </button>

                        <button
                            onClick={() => onToggleFilter('Non-veg')}
                            className={`flex flex-col items-center justify-center gap-2 rounded-2xl w-[80px] py-4 transition-all active:scale-95 ${isFilterActive('Non-veg') ? 'bg-[#FFF5ED] border border-[#FFAC2F]/20 shadow-sm' : 'bg-white border border-gray-100'}`}
                        >
                            <div className="w-6 h-6 rounded-full border border-[#FF3B30] flex items-center justify-center">
                                <div className={`w-3 h-3 bg-[#FF3B30] rounded-full ${isFilterActive('Non-veg') ? 'scale-100 opacity-100' : 'scale-0 opacity-0'} transition-all`} />
                            </div>
                            <span className={`text-[14px] font-bold text-center leading-tight ${isFilterActive('Non-veg') ? 'text-[#1A181B]' : 'text-[#8D848F]'}`}>Non-<br />veg</span>
                        </button>
                    </div>
                </div>

                {/* Offers Section */}
                <div className="mb-8 font-sans">
                    <h3 className="text-[18px] font-semibold text-[#1A181B] mb-6">Offers</h3>
                    <div className="bg-[#F8F9FA] rounded-[24px] p-6 flex flex-wrap gap-3">
                        {['Flat Discounts', 'Happy Hours', 'Buy 1 Get 1'].map((offer) => (
                            <button
                                key={offer}
                                onClick={() => onToggleFilter(offer)}
                                className={`px-5 py-3 rounded-xl text-[15px] font-semibold border transition-all active:scale-95 ${isFilterActive(offer) ? 'bg-[#FFF5ED] text-[#1A181B] border-[#FFAC2F]/20 shadow-sm' : 'bg-white text-[#8D848F] border-gray-50'}`}
                            >
                                {offer}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="h-10" />
            </div>
        </div>
    );
};

export default FilterPopup;
