import React, { useEffect } from 'react'
import { X, Check } from 'lucide-react'

const ActivationSuccessModal = ({ isOpen, onClose }) => {
    // Auto-dismiss after 3 seconds
    useEffect(() => {
        if (!isOpen) return
        const timer = setTimeout(onClose, 3000)
        return () => clearTimeout(timer)
    }, [isOpen, onClose])

    if (!isOpen) return null

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200"
            role="dialog"
            aria-modal="true"
            aria-labelledby="activation-success-title"
        >
            <div className="bg-white rounded-[32px] w-full max-w-[400px] p-8 relative shadow-2xl animate-in zoom-in-95 duration-200 flex flex-col items-center text-center mx-4">
                <button
                    onClick={onClose}
                    className="absolute right-6 top-6 text-gray-400 hover:text-gray-600 transition-colors"
                    aria-label="Close"
                >
                    <X size={24} />
                </button>

                <div className="w-[72px] h-[72px] rounded-full bg-white border-4 border-[#22C55E] flex items-center justify-center mb-6 shadow-[0px_4px_12px_rgba(34,197,94,0.2)]">
                    <Check size={40} className="text-[#22C55E]" strokeWidth={3} />
                </div>

                <h2 id="activation-success-title" className="text-[24px] leading-8 font-bold text-[#1A181B] mb-2 font-manrope">
                    Menu item activated successfully
                </h2>
                <p className="text-[16px] text-gray-500 font-manrope">
                    This item is now visible to customers and available for ordering.
                </p>
            </div>
        </div>
    )
}

export default ActivationSuccessModal
