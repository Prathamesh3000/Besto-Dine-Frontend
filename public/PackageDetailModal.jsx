import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import SilverMenu from "../../assets/images/silvermenu.png";
import { X, ChevronDown, ChevronUp, Clock, Users } from 'lucide-react';

const PackageDetailModal = ({ packageData, onClose, onConfirm }) => {
    const navigate = useNavigate();
    const [isMenuOpen, setIsMenuOpen] = useState(true);

    if (!packageData) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm p-0 sm:p-4 animate-fadeIn">

            {/* Modal Container */}
            <div className="bg-white w-full sm:max-w-4xl h-[90vh] sm:h-[85vh] sm:rounded-[24px] rounded-t-[24px] overflow-hidden flex flex-col relative shadow-2xl animate-slideUpFull">

                {/* Close Button */}
                <button
                    onClick={onClose}
                    className="absolute top-4 right-4 z-20 w-10 h-10 bg-white/80 backdrop-blur-md rounded-full flex items-center justify-center shadow-lg hover:bg-gray-100 transition-all"
                >
                    <X size={20} className="text-gray-600" />
                </button>

                {/* Scrollable Content */}
                <div className="overflow-y-auto flex-1 no-scrollbar pb-20 sm:pb-6">

                    {/* Header Image */}
                    <div className="relative h-[250px] sm:h-[300px] w-full p-4">
                        <img
                            src={SilverMenu}
                            alt={packageData.name}
                            className="w-full h-full object-cover rounded-[12px]"
                        />
                        {/* Veg Indicator Overlay if needed, or keep in title section */}
                    </div>

                    <div className="p-5 lg:px-4 lg:pt-0">
                        {/* Title & Veg Tag */}
                        <div className="flex justify-between items-start mb-2">
                            <h2 className="text-[22px] sm:text-[24px] font-semibold font-nunito text-[#1A181B] leading-tight">
                                {packageData.name}
                            </h2>
                            <div className="flex items-center gap-1.5 bg-[#F8FFEF] px-2.5 py-1 rounded-md border border-[#E9F7D9] shrink-0">
                                <div className="w-[14px] h-[14px] border border-[#34C759] flex items-center justify-center p-[2px]">
                                    <div className="w-full h-full bg-[#34C759] rounded-full"></div>
                                </div>
                                <span className="text-[11px]  lg:text-[16px] font-bold text-[#645E66] font-varela-round">Veg</span>
                            </div>
                        </div>

                        {/* Description & Offer */}
                        <p className="text-[#8D848F] text-[14px] lg:text-[16px] mb-4 font-varela-round">
                            Best for small gatherings
                        </p>
                        <p className="text-[#007AFF] text-[13px] sm:text-[16px] font-semibold mb-5 font-varela-round">
                            Flat 20% OFF on {packageData.name}
                        </p>

                        {/* Special Instructions */}
                        <h3 className="text-[#333333] lg:text-[20px] font-semibold mb-2 font-nunito text-[15px]">
                            Special Instructions
                        </h3>
                        <div className="bg-[#F1F0FC] rounded-[16px] p-4 mb-4 border-[#F1F0FC]">
                            <p className="text-[#645E66] lg:text-[16px] text-[13px] font-varela-round leading-snug">
                                Any special requests?
                                (e.g., no Garlic, no onion, allergies)
                            </p>
                        </div>

                        {/* Info Chips */}
                        <div className="flex gap-3 mb-4">
                            <div className="flex items-center px-3 py-2 gap-2 bg-[#FDF5FF] rounded-[60px]">
                                <i class="fi fi-rs-holding-hand-dinner"></i>
                                <span className="text-[12px] lg:text-[14px] text-[#645E66] font-semibold font-varela-round">
                                    10-15 min
                                </span>
                            </div>
                            <div className="flex items-center px-3 py-2 gap-2 bg-[#FDF5FF] rounded-[60px]">
                                <i className="fi fi-rr-restaurant" />

                                <span className="text-[12px] lg:text-[14px] text-[#645E66] font-semibold font-varela-round">
                                    Serves 2
                                </span>
                            </div>
                        </div>

                        {/* Includes Section */}
                        <div className="mb-4">
                            <h3 className="text-[#333333] lg:text-[20px] font-semibold text-[18px] mb-3 font-nunito">
                                Includes
                            </h3>

                            {/* Accordion / Content Area */}
                            <div className="border border-gray-100 rounded-[20px] overflow-hidden bg-[#FFF5FF]/30">
                                <button
                                    onClick={() => setIsMenuOpen(!isMenuOpen)}
                                    className="bg-[#FDF5FF] rounded-[8px] w-full px-4 py-3 flex items-center justify-between border-b mb-4 border-gray-100"
                                >
                                    <div className="flex items-center gap-2">
                                        <div className="w-6 h-6 rounded-full bg-orange-100 flex items-center justify-center text-orange-500">
                                            <i class="fi fi-rs-holding-hand-dinner"></i>
                                        </div>
                                        <span className="text-[#1A181B] text-[16px] font-bold font-nunito">
                                            Menu Items
                                        </span>
                                    </div>
                                    {isMenuOpen ? <ChevronUp size={20} className="text-gray-400" /> : <ChevronDown size={20} className="text-gray-400" />}
                                </button>

                                {isMenuOpen && (
                                    <div className="bg-white p-5">
                                        {/* Responsive Grid: 1 Col Mobile, 2 Cols Desktop */}
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
                                            {packageData.details.map((item, idx) => {
                                                const subItems = item.subItems || [];
                                                return (
                                                    <div key={idx} className="flex flex-col gap-2">
                                                        <div className="flex items-center gap-2.5">
                                                            <span className="text-[#FF9B0B] text-lg flex items-center">
                                                                {item.icon}
                                                            </span>
                                                            <span className="font-bold text-[16px] text-[#1A181B] font-nunito">
                                                                {item.text}
                                                            </span>
                                                        </div>
                                                        <div className="pl-8 flex flex-col gap-1">
                                                            {subItems.length > 0 ? (
                                                                subItems.map((sub, sIdx) => (
                                                                    <span key={sIdx} className="text-[#645E66] text-[14px] font-varela-round leading-relaxed">
                                                                        {sub}
                                                                    </span>
                                                                ))
                                                            ) : (
                                                                <span className="text-gray-400 text-[13px] italic">Details unavailable</span>
                                                            )}
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>

                    </div>
                </div>

                {/* Footer Buttons */}
                <div className="bg-white p-5 border-t border-gray-100 flex gap-4 z-20 md:rounded-b-[24px]">
                    <button
                        onClick={onClose}
                        className="flex-1 bg-[#F5F5F5] hover:bg-gray-200 text-[#645E66] font-bold font-nunito text-[15px] py-3.5 rounded-[16px] transition-colors"
                    >
                        Previous
                    </button>
                    <button
                        onClick={onConfirm}
                        className="flex-1 bg-[#FE8301]  text-white font-bold font-nunito text-[15px] py-3.5 rounded-[16px] shadow-lg shadow-orange-500/20 transition-all"
                    >
                        Continue
                    </button>
                </div>

            </div>
        </div>
    );
};

export default PackageDetailModal;
