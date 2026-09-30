import React, { useState } from 'react'
import { X, Copy, Check, ShieldCheck } from 'lucide-react'

const StaffCredentialModal = ({ staffName, email, tempPassword, onClose }) => {
    const [copiedField, setCopiedField] = useState(null)

    const handleCopy = async (text, field) => {
        try {
            await navigator.clipboard.writeText(text)
            setCopiedField(field)
            setTimeout(() => setCopiedField(null), 2000)
        } catch {
            // Fallback for older browsers
            const textarea = document.createElement('textarea')
            textarea.value = text
            document.body.appendChild(textarea)
            textarea.select()
            document.execCommand('copy')
            document.body.removeChild(textarea)
            setCopiedField(field)
            setTimeout(() => setCopiedField(null), 2000)
        }
    }

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
            <div className="bg-white rounded-2xl w-full max-w-[480px] shadow-2xl overflow-hidden">
                {/* Header */}
                <div className="px-7 pt-7 pb-5 flex items-start justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-[#34C759]/10 flex items-center justify-center">
                            <ShieldCheck size={22} className="text-[#34C759]" />
                        </div>
                        <div>
                            <h2 className="text-[18px] font-[700] font-manrope text-[#1A181B]">
                                Staff Account Created
                            </h2>
                            <p className="text-[13px] text-gray-400 font-manrope mt-0.5">
                                Share these credentials with <span className="font-[600] text-[#1A181B]">{staffName}</span>
                            </p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600 transition-colors">
                        <X size={20} />
                    </button>
                </div>

                <div className="h-[1px] bg-gray-100" />

                {/* Credentials */}
                <div className="px-7 py-6 space-y-4">
                    {/* Warning */}
                    <div className="bg-[#FFF8E1] border border-[#FFE082] rounded-xl p-4">
                        <p className="text-[13px] font-[500] font-manrope text-[#F57C00]">
                            This is the only time the temporary password will be shown. Please copy and share it securely with the staff member. They will be required to change it on first login.
                        </p>
                    </div>

                    {/* Email */}
                    <div>
                        <p className="text-[12px] font-[500] font-manrope text-gray-400 mb-1.5">Login Email</p>
                        <div className="flex items-center gap-2 bg-[#F8F9FA] rounded-xl px-4 py-3 border border-gray-100">
                            <p className="flex-1 text-[14px] font-[600] font-manrope text-[#1A181B] break-all">{email}</p>
                            <button
                                onClick={() => handleCopy(email, 'email')}
                                className="p-1.5 rounded-lg hover:bg-gray-200 transition-colors flex-shrink-0"
                                title="Copy email"
                            >
                                {copiedField === 'email' ? <Check size={16} className="text-[#34C759]" /> : <Copy size={16} className="text-gray-400" />}
                            </button>
                        </div>
                    </div>

                    {/* Password */}
                    <div>
                        <p className="text-[12px] font-[500] font-manrope text-gray-400 mb-1.5">Temporary Password</p>
                        <div className="flex items-center gap-2 bg-[#F8F9FA] rounded-xl px-4 py-3 border border-gray-100">
                            <code className="flex-1 text-[14px] font-[700] font-mono text-[#1A181B] tracking-wide break-all">{tempPassword}</code>
                            <button
                                onClick={() => handleCopy(tempPassword, 'password')}
                                className="p-1.5 rounded-lg hover:bg-gray-200 transition-colors flex-shrink-0"
                                title="Copy password"
                            >
                                {copiedField === 'password' ? <Check size={16} className="text-[#34C759]" /> : <Copy size={16} className="text-gray-400" />}
                            </button>
                        </div>
                    </div>

                    {/* Copy All */}
                    <button
                        onClick={() => handleCopy(`Email: ${email}\nTemporary Password: ${tempPassword}`, 'all')}
                        className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-[#FE8301] text-white rounded-xl text-[14px] font-[600] font-manrope hover:bg-orange-600 transition-colors shadow-sm"
                    >
                        {copiedField === 'all' ? (
                            <><Check size={16} /> Copied All Credentials</>
                        ) : (
                            <><Copy size={16} /> Copy All Credentials</>
                        )}
                    </button>
                </div>

                <div className="h-[1px] bg-gray-100" />

                {/* Footer */}
                <div className="px-7 py-4 flex justify-end">
                    <button
                        onClick={onClose}
                        className="px-6 py-2.5 border border-gray-300 rounded-lg text-[14px] font-[600] font-manrope text-gray-500 hover:border-gray-400 transition-colors"
                    >
                        Done
                    </button>
                </div>
            </div>
        </div>
    )
}

export default StaffCredentialModal
