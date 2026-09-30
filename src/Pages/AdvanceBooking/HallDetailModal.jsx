import React from 'react';
import IndoorHall1 from "/Indoorhall1.svg";
import BanquetHall1 from "/Banquethall.png";
import IndoorHall2 from "/Indoorhall2.svg";
import HallIndoor1 from "/HallIndoor1.svg";
import HallIndoor2 from "/HallIndoor2.svg";
import Correct from "/correct.svg";


import { X, Check, ArrowLeft, Bookmark, ChevronLeft } from 'lucide-react';
// import BookmarkButton from '../../components/common/BookmarkButton/BookmarkButton';

const HallDetailModal = ({ isOpen, onClose, hall, onConfirm }) => {
    if (!isOpen || !hall) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-fadeIn">
            
            {/* Modal Container */}
            <div className="relative bg-white w-full max-w-4xl max-h-[90vh] flex flex-col rounded-[24px] shadow-2xl overflow-hidden">
                
                {/* Close Button - Outside/Edge Top Right */}
                <button 
                    onClick={onClose}
                    className="absolute top-4 right-4 z-50 w-10 h-10 bg-[#F2F2F2] rounded-full flex items-center justify-center hover:bg-gray-200 transition-colors"
                >
                    <X size={20} className="text-[#645E66]" />
                </button>

                <div className="overflow-y-auto no-scrollbar">
                    {/* Header Image */}
                    <div className="p-4 pb-0">
                        <img 
                            src={hall.image} 
                            alt={hall.title} 
                            className="w-full h-[300px] object-cover rounded-[20px]"
                        />
                    </div>

                    <div className="p-6 pt-4">
                        {/* Title & Bookmark */}
                        <div className="flex justify-between items-start mb-1">
                            <div>
                                <h2 className="text-[28px] font-bold text-[#1A181B] font-nunito">{hall.title}</h2>
                                <p className="text-[#8D848F] text-[16px] font-varela-round mb-4">{hall.description}</p>
                            </div>
                            <button className="text-gray-400 hover:text-gray-600 mt-2">
                                <Bookmark size={24} />
                            </button>
                        </div>

                        {/* Quick Tags */}
                        <div className="flex flex-wrap gap-2 mb-6">
                            <span className="px-4 py-2 bg-[#F9F5FF] text-[#645E66] text-[14px] font-varela-round rounded-full">{hall.capacityRange || '50-100 guests'}</span>
                            <span className="px-4 py-2 bg-[#F9F5FF] text-[#645E66] text-[14px] font-varela-round rounded-full">AC Hall</span>
                            <span className="px-4 py-2 bg-[#F9F5FF] text-[#645E66] text-[14px] font-varela-round rounded-full">All-Weather</span>
                        </div>

                        {/* Price Row */}
                        <div className="flex items-center justify-between mb-6">
                            <div>
                                <div className="flex items-baseline gap-1">
                                    <span className="text-[24px] font-bold text-[#1A181B]">{hall.price}</span>
                                    <span className="text-[#1A181B] text-[16px]">base price</span>
                                </div>
                                <button className="text-[#007AFF] text-[14px] font-medium hover:underline">
                                    Extra hour charges apply
                                </button>
                            </div>
                            <button 
                                onClick={onClose}
                                className="px-8 py-3 bg-[#F2F2F2] text-[#645E66] font-bold rounded-[16px] hover:bg-gray-200"
                            >
                                View less
                            </button>
                        </div>

                        {/* Guest Capacity Section */}
                        <div className="bg-[#F9F5FF] rounded-[16px] p-4 mb-8">
                            <h3 className="text-[14px] font-medium text-[#1A181B] mb-1">Guest Capacity</h3>
                            <p className="text-[#8D848F] text-[14px]">{hall.capacityRange || '50 - 250 guests'}</p>
                        </div>

                        {/* Amenities */}
                        <div className="mb-8">
                            <h3 className="text-[24px] font-bold text-[#1A181B] mb-4 font-nunito">Amenities</h3>
                            <div className="grid grid-cols-2 gap-y-3">
                                {['Air-conditioning', 'Adjustable lighting', 'Stage & podium', 'Wi-Fi', 'Projector & screen', 'Wheelchair accessible', 'Sound system', 'Power backup'].map((item, idx) => (
                                    <div key={idx} className="flex items-center gap-2">
                                        <Check size={18} className="text-green-500" strokeWidth={3} />
                                        <span className="text-[#645E66] text-[16px] font-varela-round">{item}</span>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Gallery Section */}
                        <div className="mb-4">
                            <h3 className="text-[20px] font-bold text-[#1A181B] mb-4 font-nunito">Experience Our Space</h3>
                            <div className="flex gap-3 overflow-x-auto no-scrollbar">
                                {(hall.galleryImages?.length ? hall.galleryImages : [hall.image, hall.image, hall.image, hall.image]).map((img, idx) => (
                                    <div key={idx} className="min-w-[200px] h-[140px] rounded-[16px] overflow-hidden">
                                        <img src={img} className="w-full h-full object-cover" alt={`Gallery ${idx}`} />
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Confirm Action Button (Sticky/Fixed) */}
                <div className="p-6 pt-0 border-t border-gray-100 bg-white">
                    <button 
                        onClick={() => onConfirm(hall._id)}
                        className="w-full bg-[#FE8301] text-white font-bold py-4 rounded-[16px] shadow-lg shadow-orange-200"
                    >
                        Reserve Hall
                    </button>
                </div>
            </div>
        </div>
    );
};

export default HallDetailModal;
