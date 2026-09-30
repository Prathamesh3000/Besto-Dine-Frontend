import React from 'react'
import { X } from 'lucide-react'

const StaffConfirmationModal = ({ type, staffName, onClose, onConfirm }) => {
    const isActivate = type === 'activate'
    const isDelete = type === 'delete'

    // Title + body copy + CTA color depend on which action is being confirmed.
    const config = isDelete
        ? {
            title: 'Delete Staff',
            body: `Permanently delete ${staffName ? `"${staffName}"` : 'this staff member'}? This removes their account, access, and history. This action cannot be undone — consider deactivating instead if you only want to revoke access.`,
            confirmLabel: 'Delete',
            confirmClass: 'bg-[#DC2626] hover:bg-red-700',
            iconStroke: '#DC2626',
        }
        : isActivate
            ? {
                title: 'Activate Staff',
                body: 'Once activated, this staff member can log in, clock in, and access their assigned work areas based on role permissions.',
                confirmLabel: 'Yes',
                confirmClass: 'bg-[#FE8301] hover:bg-orange-600',
                iconStroke: '#FFC107',
            }
            : {
                title: 'Deactivate Staff',
                body: 'This staff member will be removed from active duty and system access will be disabled.',
                confirmLabel: 'Yes',
                confirmClass: 'bg-[#FE8301] hover:bg-orange-600',
                iconStroke: '#FFC107',
            }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
            <div className="bg-white rounded-2xl w-full max-w-[360px] p-6 shadow-xl mx-4 text-center relative">
                {/* Close Button */}
                <button
                    onClick={onClose}
                    className="absolute top-4 right-4 p-1 text-gray-400 hover:text-gray-600 transition-colors"
                >
                    <X size={20} />
                </button>

                {/* Warning Icon */}
                <div className="flex justify-center mb-4">
                    <div className="w-12 h-12 flex items-center justify-center">
                        <svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M24 4L44 40H4L24 4Z" stroke={config.iconStroke} strokeWidth="2" strokeLinejoin="round" fill="none" />
                            <path d="M24 18V26" stroke={config.iconStroke} strokeWidth="2" strokeLinecap="round" />
                            <circle cx="24" cy="32" r="1.5" fill={config.iconStroke} />
                        </svg>
                    </div>
                </div>

                {/* Title */}
                <h2 className="text-[20px] font-[700] font-manrope text-[#1A181B] mb-2">
                    {config.title}
                </h2>

                {/* Description */}
                <p className="text-[14px] text-gray-500 leading-relaxed mb-6">
                    {config.body}
                </p>

                {/* Buttons */}
                <div className="flex gap-3">
                    <button
                        onClick={onClose}
                        className="flex-1 px-6 py-3 border border-gray-300 text-gray-700 rounded-xl text-[14px] font-[600] hover:bg-gray-50 transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={onConfirm}
                        className={`flex-1 px-6 py-3 text-white rounded-xl text-[14px] font-[600] transition-colors ${config.confirmClass}`}
                    >
                        {config.confirmLabel}
                    </button>
                </div>
            </div>
        </div>
    )
}

export default StaffConfirmationModal
