import React, { useState } from 'react';
import { X, ChevronDown, ChevronUp } from 'lucide-react';
import { backendOrigin } from '../../utils/apiOrigin';

// LAN-aware (a phone on http://192.168.x.x must not call its own localhost).
const BACKEND_URL = backendOrigin();
const resolveImg = (src) => {
    if (!src) return '';
    if (src.startsWith('/uploads/')) return `${BACKEND_URL}${src}`;
    return src;
};

const PackageDetailModal = ({ packageData, onClose, onConfirm }) => {
    const [isMenuOpen, setIsMenuOpen] = useState(true);

    if (!packageData) return null;

    const image = resolveImg(packageData.image);

    return (
        <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm p-0 sm:p-4">
            <div className="bg-white w-full sm:max-w-2xl h-[90vh] sm:h-auto sm:max-h-[85vh] sm:rounded-[20px] rounded-t-[24px] overflow-hidden flex flex-col relative shadow-2xl">

                {/* Close Button */}
                <button
                    onClick={onClose}
                    className="absolute top-4 right-4 z-20 w-10 h-10 bg-white/90 rounded-full flex items-center justify-center shadow-sm hover:bg-gray-100"
                >
                    <X size={20} className="text-gray-600" />
                </button>

                {/* Scrollable Content */}
                <div className="overflow-y-auto flex-1 pb-20 sm:pb-0">

                    {/* Header Image */}
                    {image ? (
                        <div className="relative h-[220px] sm:h-[260px] w-full">
                            <img src={image} alt={packageData.name} className="w-full h-full object-cover" onError={(e) => { e.target.parentElement.style.display = 'none'; }} />
                        </div>
                    ) : (
                        <div className="h-[160px] bg-gradient-to-br from-[#FFF3E6] to-[#FDF5FF] flex items-center justify-center">
                            <span className="text-5xl">🍽️</span>
                        </div>
                    )}

                    <div className="p-5 lg:p-6">
                        {/* Title & Veg Tag */}
                        <div className="flex justify-between items-start mb-2">
                            <h2 className="text-[20px] sm:text-[22px] font-[800] text-[#1A181B] leading-tight flex-1 mr-3">
                                {packageData.name}
                            </h2>
                            <div className="flex items-center gap-1.5 bg-[#F8FFEF] px-2.5 py-1 rounded-md border border-[#E9F7D9] shrink-0">
                                <div className="w-3.5 h-3.5 border border-[#34C759] flex items-center justify-center p-[2px]">
                                    <div className="w-full h-full bg-[#34C759] rounded-full"></div>
                                </div>
                                <span className="text-[11px] font-[700] text-[#645E66]">Veg</span>
                            </div>
                        </div>

                        {/* Description from API */}
                        {packageData.description && (
                            <p className="text-[#8D848F] text-[14px] mb-4 leading-relaxed">{packageData.description}</p>
                        )}

                        {/* Info Chips */}
                        <div className="flex flex-wrap gap-2 mb-5">
                            <div className="flex items-center px-3 py-2 gap-2 bg-[#FDF5FF] rounded-full">
                                <i className="fi fi-rr-restaurant text-[14px] text-[#8D848F]"></i>
                                <span className="text-[12px] text-[#645E66] font-[600]">
                                    Serves {packageData.minPeople || '—'}–{packageData.maxPeople || '—'}
                                </span>
                            </div>
                            <div className="flex items-center px-3 py-2 gap-2 bg-[#FFF9F2] rounded-full">
                                <span className="text-[14px] font-[800] text-[#FE8301]">₹{(packageData.price || 0).toLocaleString('en-IN')}</span>
                                <span className="text-[12px] text-[#645E66] font-[500]">per person</span>
                            </div>
                        </div>

                        {/* Menu Items Accordion */}
                        <div className="border border-gray-100 rounded-[16px] overflow-hidden mb-4">
                            <button
                                onClick={() => setIsMenuOpen(!isMenuOpen)}
                                className="bg-[#FDF5FF] w-full px-4 py-3 flex items-center justify-between"
                            >
                                <div className="flex items-center gap-2">
                                    <div className="w-6 h-6 rounded-full bg-orange-100 flex items-center justify-center">
                                        <i className="fi fi-rr-restaurant text-[12px] text-orange-500"></i>
                                    </div>
                                    <span className="text-[#1A181B] text-[15px] font-[700]">Menu Items</span>
                                </div>
                                {isMenuOpen ? <ChevronUp size={20} className="text-gray-400" /> : <ChevronDown size={20} className="text-gray-400" />}
                            </button>

                            {isMenuOpen && (
                                <div className="bg-white p-5">
                                    {packageData.details?.length > 0 ? (
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-5">
                                            {packageData.details.map((item, idx) => (
                                                <div key={idx} className="flex flex-col gap-2">
                                                    <div className="flex items-center gap-2.5">
                                                        <span className="text-[#FE8301] text-lg flex items-center">{item.icon}</span>
                                                        <span className="font-[700] text-[15px] text-[#1A181B]">{item.text}</span>
                                                    </div>
                                                    <div className="pl-8 flex flex-col gap-1">
                                                        {item.subItems?.length > 0 ? (
                                                            item.subItems.map((sub, sIdx) => (
                                                                <span key={sIdx} className="text-[#645E66] text-[14px] leading-relaxed">{sub}</span>
                                                            ))
                                                        ) : (
                                                            <span className="text-gray-400 text-[13px] italic">Details unavailable</span>
                                                        )}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <p className="text-[#8D848F] text-[14px] text-center py-4">No menu details available</p>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Footer Buttons */}
                <div className="fixed bottom-0 left-0 right-0 sm:static bg-white p-4 border-t border-gray-100 flex gap-3 z-20 sm:rounded-b-[20px]">
                    <button
                        onClick={onClose}
                        className="flex-1 bg-[#F2F2F2] text-[#645E66] font-[700] text-[14px] py-3.5 rounded-[16px] hover:bg-gray-200 transition-colors"
                    >
                        Close
                    </button>
                    <button
                        onClick={onConfirm}
                        className="flex-1 bg-[#FE8301] text-white font-[700] text-[14px] py-3.5 rounded-[16px] active:scale-[0.98] transition-transform"
                    >
                        Select Package
                    </button>
                </div>
            </div>
        </div>
    );
};

export default PackageDetailModal;
