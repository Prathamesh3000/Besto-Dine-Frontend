import React, { useState } from 'react';
import { X } from 'lucide-react';

export default function FilterPopup({ isOpen, onClose, filters, setFilters }) {
    if (!isOpen) return null;

    // Local state to hold changes before applying
    const [localFilters, setLocalFilters] = useState(filters);

    const updateLocalFilter = (key, value) => {
        setLocalFilters(prev => ({ ...prev, [key]: value }));
    };

    const handleApply = () => {
        setFilters(localFilters);
        onClose();
    };

    const handleClearAll = () => {
        setLocalFilters({
            priceRange: [0, 1000],
            foodPreference: 'all',
            selectedOffer: 'none'
        });
    };

    const { priceRange, foodPreference, selectedOffer } = localFilters;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/30 backdrop-blur-[4px] font-varela">
            <style>
                {`
                    .dual-range-slider {
                        position: relative;
                        width: 100%;
                        height: 8px;
                        background: #EAEAEA;
                        border-radius: 4px;
                    }
                    .dual-range-slider input[type="range"] {
                        position: absolute;
                        width: 100%;
                        height: 8px;
                        appearance: none;
                        background: none;
                        pointer-events: none;
                        margin: 0;
                    }
                    .dual-range-slider input[type="range"]::-webkit-slider-thumb {
                        height: 24px;
                        width: 24px;
                        border-radius: 50%;
                        background: #fff;
                        border: 3px solid #FE8301;
                        cursor: pointer;
                        appearance: none;
                        pointer-events: auto;
                        box-shadow: 0 1px 3px rgba(0,0,0,0.2);
                        transition: scale 0.1s;
                    }
                    .dual-range-slider input[type="range"]::-webkit-slider-thumb:active {
                        scale: 1.1;
                    }
                `}
            </style>
            {/*
              KIOSK-UI-03 — was a fixed 500px modal which felt cramped
              on large 1920px kiosk displays (lots of empty whitespace
              around it). w-[min(90vw,640px)] keeps it readable on
              smaller tablets while letting it breathe on big screens.
            */}
            <div className="relative w-[min(90vw,640px)] bg-white rounded-[32px] p-8 shadow-2xl animate-in fade-in zoom-in duration-200">
                {/* Close Button */}
                <button
                    onClick={onClose}
                    className="absolute -top-4 -right-4 w-[48px] h-[48px] bg-white text-[#645E66] flex items-center justify-center rounded-full shadow-lg border border-[#F2F2F2] active:scale-95 transition-transform"
                >
                    <X size={24} />
                </button>

                {/* Header */}
                <div className="flex justify-between items-center mb-8">
                    <h2 className="text-[28px] font-nunito font-bold text-[#1A181B]">Filter & Sort</h2>
                    <button onClick={handleClearAll} className="text-[#FE8301] text-[18px] font-nunito font-semibold">Clear All</button>
                </div>

                {/* Dish Price Section */}
                <div className="mb-10">
                    <h3 className="text-[20px] font-nunito font-bold text-[#1A181B] mb-6">Dish Price</h3>
                    <div className="bg-[#F8F9FA] rounded-[24px] p-10 pt-16">
                        <div
                            className="dual-range-slider cursor-pointer"
                            onClick={(e) => {
                                const rect = e.currentTarget.getBoundingClientRect();
                                const percent = (e.clientX - rect.left) / rect.width;
                                const val = Math.round(percent * 1000);
                                const currentMin = priceRange[0];
                                const currentMax = priceRange[1];

                                if (Math.abs(val - currentMin) < Math.abs(val - currentMax)) {
                                    const newVal = Math.min(val, currentMax - 50);
                                    updateLocalFilter('priceRange', [Math.max(0, newVal), currentMax]);
                                } else {
                                    const newVal = Math.max(val, currentMin + 50);
                                    updateLocalFilter('priceRange', [currentMin, Math.min(1000, newVal)]);
                                }
                            }}
                        >
                            {/* Dynamic Price Tags */}
                            <div
                                className="absolute -top-12 -translate-x-1/2 flex flex-col items-center z-20 pointer-events-none"
                                style={{ left: `${(priceRange[0] / 1000) * 100}%` }}
                            >
                                <div className="bg-white px-3 py-1 rounded-[8px] border border-[#FE8301] shadow-sm">
                                    <span className="text-[15px] font-bold text-[#FE8301]">₹{priceRange[0]}</span>
                                </div>
                                <div className="w-[1.5px] h-3 bg-[#FE8301] mt-0.5"></div>
                            </div>

                            <div
                                className="absolute -top-12 -translate-x-1/2 flex flex-col items-center z-20 pointer-events-none"
                                style={{ left: `${(priceRange[1] / 1000) * 100}%` }}
                            >
                                <div className="bg-white px-3 py-1 rounded-[8px] border border-[#FE8301] shadow-sm">
                                    <span className="text-[15px] font-bold text-[#FE8301]">₹{priceRange[1]}</span>
                                </div>
                                <div className="w-[1.5px] h-3 bg-[#FE8301] mt-0.5"></div>
                            </div>

                            <div
                                className="absolute h-full bg-[#FE8301] rounded-full"
                                style={{
                                    left: `${(priceRange[0] / 1000) * 100}%`,
                                    right: `${100 - (priceRange[1] / 1000) * 100}%`
                                }}
                            ></div>
                            <input
                                type="range"
                                min="0"
                                max="1000"
                                value={priceRange[0]}
                                onClick={(e) => e.stopPropagation()}
                                onChange={(e) => {
                                    const val = Math.min(parseInt(e.target.value), priceRange[1] - 50);
                                    updateLocalFilter('priceRange', [val, priceRange[1]]);
                                }}
                            />
                            <input
                                type="range"
                                min="0"
                                max="1000"
                                value={priceRange[1]}
                                onClick={(e) => e.stopPropagation()}
                                onChange={(e) => {
                                    const val = Math.max(parseInt(e.target.value), priceRange[0] + 50);
                                    updateLocalFilter('priceRange', [priceRange[0], val]);
                                }}
                            />
                        </div>
                        <div className="flex justify-between mt-6 px-1 text-[#8492A6] text-[15px] font-medium">
                            <span>₹0</span>
                            <span>₹1000</span>
                        </div>
                    </div>
                </div>

                {/* Food Preference Section */}
                <div className="mb-8">
                    <h3 className="text-[20px] font-nunito font-bold text-[#1A181B] mb-5">Food Preference</h3>
                    <div className="bg-[#F8F9FA] rounded-[24px] p-2 flex gap-2">
                        <button
                            onClick={() => updateLocalFilter('foodPreference', 'veg')}
                            className={`flex-1 flex items-center justify-center gap-3 py-4 rounded-[18px] transition-all ${foodPreference === 'veg' ? 'bg-[#FFF5EB] text-[#1A181B] border border-[#FFE7CC]' : 'bg-white text-[#64748B] border border-[#F2F2F2] shadow-sm'}`}
                        >
                            <div className="w-[18px] h-[18px] border-[2px] border-[#22C55E] flex items-center justify-center rounded-[3px]">
                                <div className="w-[8px] h-[8px] bg-[#22C55E] rounded-full"></div>
                            </div>
                            <span className="text-[18px] font-bold">Pure Veg</span>
                        </button>
                        <button
                            onClick={() => updateLocalFilter('foodPreference', 'nonveg')}
                            className={`flex-1 flex items-center justify-center gap-3 py-4 rounded-[18px] transition-all ${foodPreference === 'nonveg' ? 'bg-[#FFF5EB] text-[#1A181B] border border-[#FFE7CC]' : 'bg-white text-[#64748B] border border-[#F2F2F2] shadow-sm'}`}
                        >
                            <div className="w-[18px] h-[18px] border-[2px] border-[#EF4444] flex items-center justify-center rounded-[3px]">
                                <div className="w-[8px] h-[8px] bg-[#EF4444] rounded-full"></div>
                            </div>
                            <span className="text-[18px] font-bold">Non-veg</span>
                        </button>
                    </div>
                </div>

                {/* Offers Section */}
                <div className="mb-10">
                    <h3 className="text-[20px] font-nunito font-bold text-[#1A181B] mb-5">Offers</h3>
                    <div className="bg-[#F8F9FA] rounded-[24px] p-4 flex flex-wrap gap-4">
                        {['flat', 'happy', 'buy1'].map((offer) => (
                            <button
                                key={offer}
                                onClick={() => updateLocalFilter('selectedOffer', offer)}
                                className={`px-6 py-3 rounded-[16px] text-[18px] font-bold transition-all ${selectedOffer === offer ? 'bg-[#FFF5EB] text-[#1A181B] border border-[#FFE7CC]' : 'bg-white text-[#64748B] border border-[#F2F2F2] shadow-sm'}`}
                            >
                                {offer === 'flat' ? 'Flat Discounts' : offer === 'happy' ? 'Happy Hours' : 'Buy 1 Get 1'}
                            </button>
                        ))}
                    </div>
                </div>

                <button
                    onClick={handleApply}
                    className="w-full bg-[#FE8301] text-white py-[18px] rounded-[16px] font-nunito font-bold text-[22px] shadow-sm active:scale-95 transition-all outline-none"
                >
                    Apply Filters
                </button>
            </div>
        </div>
    );
}
