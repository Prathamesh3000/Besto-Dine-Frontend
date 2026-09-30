import React from 'react'
import { X, TriangleAlert } from 'lucide-react'

const BookingConfirmationModal = ({ isOpen, onClose, onConfirm, type }) => {
    if (!isOpen) return null

    const isApprove = type === 'approve'

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-black/40 backdrop-blur-sm"
                onClick={onClose}
            />

            {/* Modal Content */}
            <div className="relative bg-white rounded-[32px] w-full max-w-[400px] p-8 shadow-xl mx-4 text-center animate-in zoom-in-95 duration-200">
                {/* Close Button */}
                <button
                    onClick={onClose}
                    className="absolute top-6 right-6 text-gray-400 hover:text-gray-600 transition-colors"
                >
                    <X size={24} />
                </button>

                {/* Warning Icon */}
                <div className="flex justify-center mb-6">
                    <div className="w-16 h-16 flex items-center justify-center">
                        <TriangleAlert size={56} className="text-[#FFC107] fill-transparent" strokeWidth={1.5} />
                    </div>
                </div>

                {/* Title */}
                <h2 className="text-[24px] font-[700] font-manrope text-[#1A181B] mb-3">
                    {isApprove ? 'Approve Booking' : 'Reject Booking'}
                </h2>

                {/* Description */}
                <p className="text-[15px] text-gray-500 leading-relaxed mb-8 font-[500]">
                    {isApprove
                        ? 'This booking will be confirmed and visible to the customer.'
                        : 'This booking will be declined and the customer will be notified.'
                    }
                </p>

                {/* Buttons */}
                <div className="flex gap-4">
                    <button
                        onClick={onClose}
                        className="flex-1 py-3 border border-[#FE8301] text-[#FE8301] rounded-xl text-[16px] font-[700] hover:bg-orange-50 transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={onConfirm}
                        className="flex-1 py-3 bg-[#FE8301] text-white rounded-xl text-[16px] font-[700] hover:bg-orange-600 transition-colors shadow-sm"
                    >
                        Confirm
                    </button>
                </div>
            </div>
        </div>
    )
}

export default BookingConfirmationModal
