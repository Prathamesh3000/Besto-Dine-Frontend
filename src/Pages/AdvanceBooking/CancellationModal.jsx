import React from 'react';

const CancellationModal = ({ isOpen, onClose, onConfirm, bookingId = "#935017" }) => {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm px-4">
            <div className="bg-white w-full max-w-[340px] rounded-[24px] p-6 animate-scaleIn shadow-xl relative text-center">

                <h2 className="text-[20px] font-bold text-[#1A181B] font-nunito mb-2 leading-tight">
                    Cancel This Booking?
                </h2>

                <p className="text-[#645E66] text-[14px] font-varela-round mb-4 leading-relaxed">
                    Cancel this booking? Refund rules<br /> may apply.
                </p>

                <div className="flex justify-between items-center mb-4">
                    <span className="text-[#1A181B] font-semibold font-nunito text-[14px]">Booking ID:</span>
                    <span className="text-[#645E66] font-varela-round text-[14px]">{bookingId}</span>
                </div>

                {/* Refund Info Box */}
                <div className="bg-[#EFF6FF] rounded-[12px] p-3 mb-6 text-left">
                    <h3 className="text-[#1A181B] font-semibold font-nunito text-[14px] mb-1">
                        Refund Info
                    </h3>
                    <p className="text-[#645E66] text-[12px] font-varela-round leading-snug">
                        Refund will be processed as per the cancellation policy.
                    </p>
                </div>

                {/* Buttons */}
                <div className="space-y-3">
                    <button
                        onClick={onConfirm}
                        className="w-full bg-[#FE8301] hover:bg-orange-600 active:scale-[0.98] transition-all text-white font-nunito font-bold text-[16px] py-3 rounded-[12px] shadow-sm shadow-orange-200"
                    >
                        Yes, Cancel Booking
                    </button>

                    <button
                        onClick={onClose}
                        className="w-full bg-[#F5F5F5] hover:bg-gray-200 active:scale-[0.98] transition-all text-[#645E66] font-nunito font-semibold text-[16px] py-3 rounded-[12px]"
                    >
                        Keep Booking
                    </button>
                </div>

            </div>
        </div>
    );
};

export default CancellationModal;
