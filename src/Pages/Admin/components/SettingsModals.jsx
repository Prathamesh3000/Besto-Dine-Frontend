import React, { useEffect, useState } from 'react'
import { AlertTriangle, X } from 'lucide-react'
import { walletAPI } from '../../../utils/api'

export const SaveConfirmationModal = ({ isOpen, onClose, onConfirm }) => {
    if (!isOpen) return null

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm">
            <div className="bg-white rounded-[24px] p-6 pt-5 w-[360px] flex flex-col items-center shadow-xl relative animate-in fade-in zoom-in duration-200">
                <button
                    onClick={onClose}
                    className="absolute top-4 right-4 text-[#6B7280] hover:text-gray-900 transition-colors"
                >
                    <X size={20} />
                </button>

                <div className="mb-4 mt-2">
                    <AlertTriangle size={48} className="text-[#FFB800]" strokeWidth={1.5} />
                </div>

                <h2 className="text-[20px] font-[700] text-[#1A181B] mb-2 text-center">Apply Changes?</h2>
                <p className="text-[14px] text-[#4B5563] text-center mb-6 leading-normal font-[500]">
                    You're about to save the updated settings.
                </p>

                <div className="flex gap-4 w-full">
                    <button
                        onClick={onClose}
                        className="flex-1 py-2.5 px-4 rounded-[16px] border border-[#FE8301] text-[#FE8301] font-[600] text-[14px] hover:bg-orange-50 transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={onConfirm}
                        className="flex-1 py-2.5 px-4 rounded-[16px] bg-[#FE8301] text-white font-[600] text-[14px] hover:bg-orange-600 transition-colors"
                    >
                        Confirm
                    </button>
                </div>
            </div>
        </div>
    )
}

export const CloseDayModal = ({ isOpen, onClose, onConfirm }) => {
    const [note, setNote] = useState('')

    if (!isOpen) return null

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm">
            <div className="bg-white rounded-[24px] p-6 pt-5 w-[380px] flex flex-col items-center shadow-xl relative animate-in fade-in zoom-in duration-200">
                <button
                    onClick={onClose}
                    className="absolute top-4 right-4 text-[#6B7280] hover:text-gray-900 transition-colors"
                >
                    <X size={20} />
                </button>

                <div className="mb-4 mt-2">
                    <AlertTriangle size={48} className="text-[#FFB800]" strokeWidth={1.5} />
                </div>

                <h2 className="text-[20px] font-[700] text-[#1A181B] mb-2 text-center">Close This Day?</h2>
                <p className="text-[13px] text-[#4B5563] text-center mb-6 leading-normal font-[500] px-4">
                    This will mark the cafe as closed for the selected day. Customers will not be able to place orders.
                </p>

                <div className="w-full mb-6">
                    <label className="block text-[13px] font-[500] text-[#374151] mb-1.5 leading-none">
                        Add note <span className="text-[#9CA3AF] font-[400]">(give reason)</span>
                    </label>
                    <textarea
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        placeholder="text"
                        rows={3}
                        className="w-full px-4 py-3 bg-white border border-gray-200 rounded-[12px] text-[14px] text-[#1A181B] placeholder-gray-400 focus:outline-none focus:border-[#FE8301] resize-none shadow-sm"
                    />
                </div>

                <div className="flex gap-4 w-full">
                    <button
                        onClick={onClose}
                        className="flex-1 py-2.5 px-4 rounded-[16px] border border-[#FE8301] text-[#FE8301] font-[600] text-[14px] hover:bg-orange-50 transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={() => onConfirm(note)}
                        className="flex-1 py-2.5 px-4 rounded-[16px] bg-[#FE8301] text-white font-[600] text-[14px] hover:bg-orange-600 transition-colors"
                    >
                        Confirm
                    </button>
                </div>
            </div>
        </div>
    )
}

export const AddManualPointsModal = ({ isOpen, onClose, onConfirm }) => {
    const [actionType, setActionType] = useState('add') // 'add' or 'deduct'
    // Free-text search box + the customer actually picked from the results.
    // Only the picked customer's _id is ever sent to /wallet/admin/adjust.
    const [search, setSearch] = useState('')
    const [selectedCustomer, setSelectedCustomer] = useState(null)
    const [results, setResults] = useState([])
    const [searching, setSearching] = useState(false)
    const [searchError, setSearchError] = useState('')
    const [points, setPoints] = useState('')
    const [reason, setReason] = useState('')

    // Debounced lookup against the tenant's customers.
    useEffect(() => {
        const q = search.trim()
        if (!isOpen || selectedCustomer || q.length < 2) return undefined
        let cancelled = false
        const t = setTimeout(async () => {
            setSearching(true)
            try {
                const res = await walletAPI.searchCustomers(q)
                if (!cancelled) {
                    setResults(res.data?.customers || [])
                    setSearchError('')
                }
            } catch (err) {
                if (!cancelled) {
                    setResults([])
                    setSearchError(err.response?.data?.message || 'Could not search customers')
                }
            } finally {
                if (!cancelled) setSearching(false)
            }
        }, 300)
        return () => { cancelled = true; clearTimeout(t) }
    }, [search, isOpen, selectedCustomer])

    if (!isOpen) return null

    const customerLabel = (c) => [c.name || 'Unnamed', c.mobile || c.email].filter(Boolean).join(' · ')

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
            <div className="bg-white rounded-[16px] w-[448px] overflow-hidden flex flex-col shadow-2xl relative animate-in fade-in zoom-in duration-200">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 bg-[#FAF7F2] border-b border-[#E5E7EB]">
                    <h2 className="text-[18px] font-[500] text-[#1A181B]">Add Points Manually</h2>
                    <button onClick={onClose} className="text-[#6B7280] hover:text-[#1A181B] transition-colors">
                        <X size={20} />
                    </button>
                </div>

                <div className="p-6">
                    {/* Action Type Toggle */}
                    <div className="flex gap-4 mb-6">
                        <button
                            onClick={() => setActionType('deduct')}
                            className={`flex-1 flex flex-col justify-center items-center py-4 rounded-[12px] border transition-colors h-[80px] ${actionType === 'deduct' ? 'border-[#EF4444] bg-[#FEF2F2]' : 'border-[#E5E7EB] bg-white'}`}
                        >
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className={`mb-1 ${actionType === 'deduct' ? 'text-[#EF4444]' : 'text-[#9CA3AF]'}`}>
                                <path d="M5 12h14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                            <span className={`text-[13px] font-[500] ${actionType === 'deduct' ? 'text-[#EF4444]' : 'text-[#6B7280]'}`}>Deduct Points</span>
                        </button>

                        <button
                            onClick={() => setActionType('add')}
                            className={`flex-1 flex flex-col justify-center items-center py-4 rounded-[12px] border transition-colors h-[80px] ${actionType === 'add' ? 'border-[#22C55E] bg-[#F0FDF4]' : 'border-[#E5E7EB] bg-white'}`}
                        >
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className={`mb-1 ${actionType === 'add' ? 'text-[#16A34A]' : 'text-[#9CA3AF]'}`}>
                                <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                            <span className={`text-[13px] font-[500] ${actionType === 'add' ? 'text-[#16A34A]' : 'text-[#6B7280]'}`}>Add Points</span>
                        </button>
                    </div>

                    {/* Form Fields */}
                    <div className="space-y-4">
                        <div>
                            <label className="block text-[13px] font-[500] text-[#1A181B] mb-1.5">Select Customer</label>
                            {selectedCustomer ? (
                                <div className="flex items-center justify-between px-4 py-2.5 bg-[#FFF7ED] border border-[#FE8301] rounded-[8px]">
                                    <div className="min-w-0">
                                        <p className="text-[14px] text-[#1A181B] truncate">{customerLabel(selectedCustomer)}</p>
                                        <p className="text-[12px] text-[#6B7280]">{selectedCustomer.loyaltyPoints || 0} points</p>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => { setSelectedCustomer(null); setSearch(''); setResults([]) }}
                                        className="text-[#6B7280] hover:text-[#1A181B] transition-colors"
                                        aria-label="Change customer"
                                    >
                                        <X size={16} />
                                    </button>
                                </div>
                            ) : (
                                <div className="relative">
                                    <input
                                        type="text"
                                        value={search}
                                        onChange={(e) => setSearch(e.target.value)}
                                        placeholder="Search by name, email, phone"
                                        className="w-full px-4 py-2.5 bg-white border border-[#E5E7EB] rounded-[8px] text-[14px] text-[#1A181B] placeholder-[#6B7280] focus:outline-none focus:border-[#FE8301] transition-colors"
                                    />
                                    {search.trim().length >= 2 && (
                                        <div className="absolute z-10 left-0 right-0 mt-1 max-h-[200px] overflow-y-auto bg-white border border-[#E5E7EB] rounded-[8px] shadow-lg">
                                            {searching ? (
                                                <p className="px-4 py-2.5 text-[13px] text-[#6B7280]">Searching…</p>
                                            ) : searchError ? (
                                                <p className="px-4 py-2.5 text-[13px] text-[#EF4444]">{searchError}</p>
                                            ) : results.length === 0 ? (
                                                <p className="px-4 py-2.5 text-[13px] text-[#6B7280]">No customers found</p>
                                            ) : results.map((c) => (
                                                <button
                                                    key={c._id}
                                                    type="button"
                                                    onClick={() => { setSelectedCustomer(c); setResults([]) }}
                                                    className="w-full text-left px-4 py-2 hover:bg-[#FAF7F2] transition-colors"
                                                >
                                                    <p className="text-[14px] text-[#1A181B] truncate">{customerLabel(c)}</p>
                                                    <p className="text-[12px] text-[#6B7280]">{c.loyaltyPoints || 0} points</p>
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                        <div>
                            <label className="block text-[13px] font-[500] text-[#1A181B] mb-1.5">Points Amount</label>
                            <input
                                type="number"
                                value={points}
                                onChange={(e) => setPoints(e.target.value)}
                                placeholder="Enter points"
                                className="w-full px-4 py-2.5 bg-white border border-[#E5E7EB] rounded-[8px] text-[14px] text-[#1A181B] placeholder-[#6B7280] focus:outline-none focus:border-[#FE8301] transition-colors"
                            />
                        </div>

                        <div className="mb-8">
                            <label className="block text-[13px] font-[500] text-[#1A181B] mb-1.5">Reason</label>
                            <textarea
                                value={reason}
                                onChange={(e) => setReason(e.target.value)}
                                placeholder="Enter reason for this action"
                                rows={4}
                                className="w-full px-4 py-2.5 bg-white border border-[#E5E7EB] rounded-[8px] text-[14px] text-[#1A181B] placeholder-[#6B7280] focus:outline-none focus:border-[#FE8301] resize-none transition-colors"
                            />
                        </div>
                    </div>

                    <div className="flex gap-4 w-full mt-6">
                        <button
                            onClick={onClose}
                            className="flex-1 py-2.5 px-4 rounded-[12px] border border-[#FE8301] text-[#FE8301] font-[600] text-[14px] hover:bg-orange-50 transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={() => onConfirm({ type: actionType, customer: selectedCustomer?._id || '', points, reason })}
                            className="flex-1 py-2.5 px-4 rounded-[12px] bg-[#FE8301] text-white font-[600] text-[14px] hover:bg-orange-600 transition-colors shadow-sm"
                        >
                            Confirm
                        </button>
                    </div>
                </div>
            </div>
        </div>
    )
}

export const CreatePointsCampaignModal = ({ isOpen, onClose, onConfirm }) => {
    const [campaignType, setCampaignType] = useState('birthday') // 'birthday' or 'custom'
    const [name, setName] = useState('')
    const [description, setDescription] = useState('')
    const [startDate, setStartDate] = useState('')
    const [endDate, setEndDate] = useState('')
    const [points, setPoints] = useState('')

    if (!isOpen) return null

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-4">
            <div className="bg-white rounded-[16px] w-full max-w-[460px] overflow-hidden flex flex-col shadow-2xl relative animate-in fade-in zoom-in duration-200">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 bg-[#FAF7F2] border-b border-[#E5E7EB]">
                    <h2 className="text-[18px] font-[500] text-[#1A181B]">Create Points Campaign</h2>
                    <button onClick={onClose} className="text-[#6B7280] hover:text-[#1A181B] transition-colors">
                        <X size={20} />
                    </button>
                </div>

                <div className="p-6">
                    {/* Action Type Toggle */}
                    <div className="mb-5">
                        <label className="block text-[13px] font-[500] text-[#1A181B] mb-2.5">Campaign Type</label>
                        <div className="flex gap-4">
                            <button
                                onClick={() => setCampaignType('birthday')}
                                className={`flex-1 flex flex-col justify-center items-center py-4 rounded-[12px] border transition-colors h-[80px] ${campaignType === 'birthday' ? 'border-[#FE8301] shadow-sm' : 'border-[#E5E7EB] bg-white'}`}
                            >
                                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className={`mb-1.5 ${campaignType === 'birthday' ? 'text-[#702083]' : 'text-[#9CA3AF]'}`}>
                                    <path d="M12 7v5M9 13h6M5 18h14M3 21h18M5 18v3M19 18v3M7 12h10c.8 0 1.5.7 1.5 1.5v4.5H5.5V13.5C5.5 12.7 6.2 12 7 12z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                                <span className={`text-[13px] font-[500] text-[#1A181B]`}>Birthday Bonus</span>
                            </button>

                            <button
                                onClick={() => setCampaignType('custom')}
                                className={`flex-1 flex flex-col justify-center items-center py-4 rounded-[12px] border transition-colors h-[80px] ${campaignType === 'custom' ? 'border-[#FE8301] shadow-sm' : 'border-[#E5E7EB] bg-white'}`}
                            >
                                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className={`mb-1.5 ${campaignType === 'custom' ? 'text-[#702083]' : 'text-[#9CA3AF]'}`}>
                                    <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.5" />
                                    <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="1.5" />
                                </svg>
                                <span className={`text-[13px] font-[500] text-[#1A181B]`}>Custom Bonus</span>
                            </button>
                        </div>
                    </div>

                    {/* Form Fields */}
                    <div className="space-y-4">
                        <div>
                            <label className="block text-[13px] font-[500] text-[#1A181B] mb-1.5">Campaign Name</label>
                            <input
                                type="text"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                placeholder="Enter name"
                                className="w-full px-4 py-2.5 bg-white border border-[#E5E7EB] rounded-[8px] text-[14px] text-[#1A181B] placeholder-[#9CA3AF] focus:outline-none focus:border-[#FE8301] transition-colors"
                            />
                        </div>

                        <div>
                            <label className="block text-[13px] font-[500] text-[#1A181B] mb-1.5">Description</label>
                            <textarea
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                                placeholder="Describe your campaign"
                                rows={4}
                                className="w-full px-4 py-2.5 bg-white border border-[#E5E7EB] rounded-[8px] text-[14px] text-[#1A181B] placeholder-[#9CA3AF] focus:outline-none focus:border-[#FE8301] resize-none transition-colors"
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-[13px] font-[500] text-[#1A181B] mb-1.5">Start Date</label>
                                <div className="relative">
                                    <input
                                        type="text"
                                        value={startDate}
                                        onChange={(e) => setStartDate(e.target.value)}
                                        placeholder="dd/mm/yyyy"
                                        className="w-full pl-4 pr-10 py-2.5 bg-white border border-[#E5E7EB] rounded-[8px] text-[14px] text-[#1A181B] placeholder-[#9CA3AF] focus:outline-none focus:border-[#FE8301] transition-colors"
                                    />
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" className="absolute right-3 top-[50%] -translate-y-[50%] text-[#6B7280]">
                                        <rect x="3" y="4" width="18" height="18" rx="2" ry="2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                                        <line x1="16" y1="2" x2="16" y2="6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                                        <line x1="8" y1="2" x2="8" y2="6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                                        <line x1="3" y1="10" x2="21" y2="10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                                    </svg>
                                </div>
                            </div>
                            <div>
                                <label className="block text-[13px] font-[500] text-[#1A181B] mb-1.5">End Date</label>
                                <div className="relative">
                                    <input
                                        type="text"
                                        value={endDate}
                                        onChange={(e) => setEndDate(e.target.value)}
                                        placeholder="dd/mm/yyyy"
                                        className="w-full pl-4 pr-10 py-2.5 bg-white border border-[#E5E7EB] rounded-[8px] text-[14px] text-[#1A181B] placeholder-[#9CA3AF] focus:outline-none focus:border-[#FE8301] transition-colors"
                                    />
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" className="absolute right-3 top-[50%] -translate-y-[50%] text-[#6B7280]">
                                        <rect x="3" y="4" width="18" height="18" rx="2" ry="2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                                        <line x1="16" y1="2" x2="16" y2="6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                                        <line x1="8" y1="2" x2="8" y2="6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                                        <line x1="3" y1="10" x2="21" y2="10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                                    </svg>
                                </div>
                            </div>
                        </div>

                        <div>
                            <label className="block text-[13px] font-[500] text-[#1A181B] mb-1.5">Bonus Points</label>
                            <div className="relative">
                                <input
                                    type="number"
                                    value={points}
                                    onChange={(e) => setPoints(e.target.value)}
                                    placeholder="100"
                                    className="w-full pl-4 pr-10 py-2.5 bg-white border border-[#E5E7EB] rounded-[8px] text-[14px] text-[#1A181B] placeholder-[#9CA3AF] focus:outline-none focus:border-[#FE8301] transition-colors"
                                />
                                <div className="absolute right-3 top-[50%] -translate-y-[50%] flex flex-col items-center justify-center text-[#9CA3AF] gap-0.5">
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M18 15l-6-6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="rotate-180"><path d="M18 15l-6-6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="flex gap-4 w-full mt-6">
                        <button
                            onClick={onClose}
                            className="flex-1 py-2.5 px-4 rounded-[12px] border border-[#FE8301] text-[#FE8301] font-[600] text-[14px] hover:bg-orange-50 transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={() => onConfirm({ type: campaignType, name, description, startDate, endDate, points })}
                            className="flex-1 py-2.5 px-4 rounded-[12px] bg-[#FE8301] text-white font-[600] text-[14px] hover:bg-orange-600 transition-colors shadow-sm"
                        >
                            Create Campaign
                        </button>
                    </div>
                </div>
            </div>
        </div>
    )
}

export const ToggleCampaignModal = ({ isOpen, onClose, onConfirm, isActivating }) => {
    if (!isOpen) return null

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-4">
            <div className="bg-white rounded-[24px] p-6 pt-6 w-full max-w-[340px] flex flex-col items-center shadow-xl relative animate-in fade-in zoom-in duration-200">
                <button
                    onClick={onClose}
                    className="absolute top-4 right-4 text-[#6B7280] hover:text-[#1A181B] transition-colors"
                >
                    <X size={20} />
                </button>

                <div className="mb-3 mt-1">
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" className="text-[#FBBF24]">
                        <path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                </div>

                <h2 className="text-[18px] font-[600] text-[#1A181B] mb-2 text-center">
                    {isActivating ? 'Activate Campaign?' : 'Deactivate Campaign?'}
                </h2>

                <p className="text-[13px] text-[#6B7280] text-center mb-6 leading-[1.6] font-[400]">
                    {isActivating
                        ? 'This campaign will start issuing rewards based on the configured rules. Customers will be eligible once activated.'
                        : 'This campaign will stop issuing rewards. You can activate it again anytime.'
                    }
                </p>

                <div className="flex gap-4 w-full">
                    <button
                        onClick={onClose}
                        className="flex-1 py-2.5 px-4 rounded-[12px] border border-[#FE8301] text-[#FE8301] font-[600] text-[14px] hover:bg-orange-50 transition-colors"
                    >
                        No
                    </button>
                    <button
                        onClick={onConfirm}
                        className="flex-1 py-2.5 px-4 rounded-[12px] bg-[#FE8301] text-white font-[600] text-[14px] hover:bg-orange-600 transition-colors shadow-sm"
                    >
                        Yes
                    </button>
                </div>
            </div>
        </div>
    )
}

