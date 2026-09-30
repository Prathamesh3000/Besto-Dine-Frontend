import React from 'react';
import { AlertTriangle, X } from 'lucide-react';

const ConfirmActionModal = ({ isOpen, onClose, onConfirm, actionType, title: customTitle, description: customDescription }) => {
    if (!isOpen) return null;

    const isApprove = actionType === 'Approve';
    const defaultTitle = isApprove ? 'Approve Booking' : 'Reject Booking';
    const defaultDesc = isApprove
        ? 'This booking will be confirmed and visible to the customer.'
        : 'This booking will be declined and the customer will be notified.';

    const title = customTitle || defaultTitle;
    const description = customDescription || defaultDesc;

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center font-manrope">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-black/50 backdrop-blur-sm transition-opacity"
                onClick={onClose}
            />

            {/* Modal Content */}
            <div className="relative w-full max-w-[400px] bg-white rounded-3xl p-8 shadow-2xl flex flex-col items-center animate-in zoom-in-95 duration-200 mx-4">
                <button
                    onClick={onClose}
                    className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition-colors"
                >
                    <X size={20} />
                </button>

                <div className="mb-4 text-[#FACC15]">
                    <AlertTriangle size={48} strokeWidth={2} />
                </div>

                <h2 className="text-[22px] sm:text-[24px] font-[700] text-[#1A181B] mb-2 text-center whitespace-nowrap">{title}</h2>
                <p className="text-[14px] text-gray-500 text-center mb-8">
                    {description}
                </p>

                <div className="flex w-full gap-4">
                    <button
                        onClick={onClose}
                        className="flex-1 py-3 px-4 rounded-xl border border-[#F97316] text-[#F97316] font-[700] hover:bg-orange-50 transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={() => {
                            onConfirm();
                            onClose();
                        }}
                        className="flex-1 py-3 px-4 rounded-xl bg-[#F97316] text-white font-[700] hover:bg-[#EA580C] transition-colors"
                    >
                        Confirm
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ConfirmActionModal;
