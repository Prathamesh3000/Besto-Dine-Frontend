import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search, ChevronDown, Eye, Plus, Minus, Gift, MoreVertical, Phone, Mail, ArrowDown, ArrowUp, X } from 'lucide-react';
import { toast } from 'react-hot-toast';
import api, { walletAPI } from '../../utils/api';
import { SkeletonStatGrid, SkeletonRows } from '../../Components/Common/Skeleton';
import { useAdminBranch } from '../../Context/AdminBranchContext';

const statusBadgeStyles = {
    Active: { bg: 'bg-green-50', text: 'text-green-600', border: 'border-green-200' },
    Inactive: { bg: 'bg-yellow-50', text: 'text-yellow-600', border: 'border-yellow-200' },
    Blocked: { bg: 'bg-gray-100', text: 'text-gray-500', border: 'border-gray-200' },
}

const categoryBadgeStyles = {
    Order: { bg: 'bg-orange-50', text: 'text-[#FE8301]', border: 'border-orange-200' },
    Recharge: { bg: 'bg-green-50', text: 'text-green-600', border: 'border-green-200' },
    Discount: { bg: 'bg-orange-50', text: 'text-[#FE8301]', border: 'border-orange-200' },
    Refund: { bg: 'bg-red-50', text: 'text-red-500', border: 'border-red-200' },
    Bonus: { bg: 'bg-green-50', text: 'text-green-600', border: 'border-green-200' },
}

const WalletDashboard = () => {
    const [activeTab, setActiveTab] = useState('Customers')
    const [searchTerm, setSearchTerm] = useState('')
    const [selectedStatus, setSelectedStatus] = useState('All')
    const [showStatusDropdown, setShowStatusDropdown] = useState(false)
    const [currentPage, setCurrentPage] = useState(1)
    const [itemsPerPage, setItemsPerPage] = useState(8)
    const [showRowsDropdown, setShowRowsDropdown] = useState(false)
    const [showBalanceModal, setShowBalanceModal] = useState(false)
    const [balanceModalType, setBalanceModalType] = useState('add') // 'add' | 'deduct' | 'bonus'
    const [selectedCustomer, setSelectedCustomer] = useState(null)
    const [modalAmount, setModalAmount] = useState('')
    const [modalReason, setModalReason] = useState('')
    const [showDetailModal, setShowDetailModal] = useState(false)
    const [detailCustomer, setDetailCustomer] = useState(null)
    const [showPointsModal, setShowPointsModal] = useState(false)
    const [activeActionMenu, setActiveActionMenu] = useState(null)
    // ADM-057 — top-level Credit Wallet modal state (separate from the
    // per-row Add Balance modal so the customer picker UX doesn't leak
    // into the per-row flow).
    const [showCreditModal, setShowCreditModal] = useState(false)
    const [creditCustomerId, setCreditCustomerId] = useState('')
    const [creditAmount, setCreditAmount] = useState('')
    const [creditNote, setCreditNote] = useState('')
    const [creditSearch, setCreditSearch] = useState('')
    const [creditSubmitting, setCreditSubmitting] = useState(false)
    
    const statusDdRef = useRef(null);
    const rowsDdRef = useRef(null);
    const actionMenuRef = useRef(null);

    useEffect(() => {
        const handler = (e) => {
            if (statusDdRef.current && !statusDdRef.current.contains(e.target)) setShowStatusDropdown(false);
            if (rowsDdRef.current && !rowsDdRef.current.contains(e.target)) setShowRowsDropdown(false);
            if (actionMenuRef.current && !actionMenuRef.current.contains(e.target)) setActiveActionMenu(null);
        }
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    const [adjusting, setAdjusting] = useState(false);

    // Wallet admin stats — single React Query call. The `fetchAdminStats`
    // shim preserves existing imperative refetch sites (post-adjustment,
    // post-bonus-campaign).
    // Branch in the key so switching branch never paints the previous
    // branch's cached stats (the api interceptor scopes the request).
    const { selectedBranchId } = useAdminBranch();
    const { data: walletPayload, isLoading: loading, refetch: refetchWallet } = useQuery({
        queryKey: ['admin', 'wallet', 'stats', { branch: selectedBranchId || 'all' }],
        queryFn: async () => {
            const res = await walletAPI.getAdminStats();
            return res.data?.success ? res.data : null;
        },
        staleTime: 30_000,
        keepPreviousData: true,
        onError: () => toast.error('Failed to fetch wallet data'),
    });
    const data = walletPayload ?? { stats: {}, customers: [], recentTransactions: [] };
    const fetchAdminStats = useCallback(() => { refetchWallet() }, [refetchWallet]);

    const handleAdjustWallet = async (amount, reason, type) => {
        if (!selectedCustomer) {
            toast.error('Please select a customer first');
            return;
        }
        const numAmount = parseFloat(amount);
        if (isNaN(numAmount) || numAmount <= 0) {
            toast.error('Please enter a valid amount');
            return;
        }
        if (!reason?.trim()) {
            toast.error('Please enter a reason');
            return;
        }
        setAdjusting(true);
        try {
            const res = await walletAPI.adjustWallet({
                targetUserId: selectedCustomer.userId || selectedCustomer.id,
                amount: numAmount,
                type: 'balance',
                action: type === 'deduct' ? 'deduct' : 'add',
                description: reason.trim()
            });
            if (res.data.success) {
                fetchAdminStats();
                setShowBalanceModal(false);
                setModalAmount('');
                setModalReason('');
                toast.success('Wallet adjusted successfully');
            }
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to adjust wallet');
        } finally {
            setAdjusting(false);
        }
    };

    // ADM-057 — top-level Credit Wallet: pick any customer + amount + note.
    // Reuses the same POST /wallet/admin/adjust the per-row Add Balance
    // button uses, so the audit Transaction row is written identically.
    const submitCreditWallet = async () => {
        const customer = (data.customers || []).find(c => c.id === creditCustomerId);
        if (!customer) {
            toast.error('Please pick a customer');
            return;
        }
        const numAmount = parseFloat(creditAmount);
        if (isNaN(numAmount) || numAmount <= 0) {
            toast.error('Enter a valid amount');
            return;
        }
        setCreditSubmitting(true);
        try {
            const res = await walletAPI.adjustWallet({
                targetUserId: customer.userId || customer.id,
                amount: numAmount,
                type: 'balance',
                action: 'add',
                description: (creditNote || '').trim() || `Credit by admin`,
            });
            if (res.data.success) {
                fetchAdminStats();
                setShowCreditModal(false);
                setCreditCustomerId('');
                setCreditAmount('');
                setCreditNote('');
                setCreditSearch('');
                toast.success(`₹${numAmount.toFixed(0)} credited to ${customer.name}`);
            }
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to credit wallet');
        } finally {
            setCreditSubmitting(false);
        }
    };

    const handleAdjustPoints = async (amount, reason, action) => {
        if (!selectedCustomer) {
            toast.error('Please select a customer from the list first');
            return;
        }
        const numAmount = parseFloat(amount);
        if (isNaN(numAmount) || numAmount <= 0) {
            toast.error('Please enter a valid amount');
            return;
        }
        if (!reason?.trim()) {
            toast.error('Please enter a reason');
            return;
        }
        setAdjusting(true);
        try {
            const res = await walletAPI.adjustWallet({
                targetUserId: selectedCustomer.userId || selectedCustomer.id,
                amount: numAmount,
                type: 'points',
                action: action,
                description: reason.trim()
            });
            if (res.data.success) {
                fetchAdminStats();
                setShowPointsModal(false);
                toast.success('Points adjusted successfully');
            }
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to adjust points');
        } finally {
            setAdjusting(false);
        }
    };

    // Initial-load useEffect removed — useQuery auto-fetches on mount and
    // the `fetchAdminStats()` shim covers post-adjustment refreshes.

    const stats = data.stats;
    const allCustomers = data.customers || [];
    const allTransactions = data.recentTransactions || [];

    // Filtering logic for customers
    const customersForTable = allCustomers.filter(c => {
        const matchStatus = selectedStatus === 'All' || c.status === selectedStatus
        const matchSearch = !searchTerm ||
            c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            c.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
            c.phone.includes(searchTerm)
        return matchStatus && matchSearch
    })

    // Filtering logic for transactions
    const transactionsForTable = allTransactions.filter(t => {
        const matchSearch = !searchTerm ||
            t.customerName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            t.description?.toLowerCase().includes(searchTerm.toLowerCase())
        return matchSearch
    })

    const updateStatus = async (walletId, newStatus) => {
        // ADM-057 — map the UI labels to the schema enum the backend expects.
        // Before this fix, the action menu fired a zero-amount adjust call
        // with a bogus description and never actually persisted the status,
        // so the three-dots menu was effectively dead.
        const targetUserId = allCustomers.find(c => c.id === walletId)?.userId;
        if (!targetUserId) {
            toast.error('Customer not found');
            return;
        }
        const statusMap = { Active: 'active', Inactive: 'suspended', Blocked: 'blocked' };
        const backendStatus = statusMap[newStatus];
        if (!backendStatus) {
            toast.error('Unknown status');
            return;
        }
        try {
            await walletAPI.setWalletStatus({ targetUserId, status: backendStatus });
            refetchWallet();
            toast.success(`Customer status updated to ${newStatus}`);
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to update status');
        }
    }

    // Reset page when switching tabs
    useEffect(() => {
        setCurrentPage(1)
        setSearchTerm('')
        setSelectedStatus('All')
    }, [activeTab])

    // Determine active data based on tab
    const activeData = activeTab === 'Customers' ? customersForTable : activeTab === 'Transaction' ? transactionsForTable : []

    // Pagination
    const totalPages = Math.ceil(activeData.length / itemsPerPage)
    const startIndex = (currentPage - 1) * itemsPerPage
    const paginatedData = activeData.slice(startIndex, startIndex + itemsPerPage)

    const handlePageChange = (page) => {
        if (page >= 1 && page <= totalPages) {
            setCurrentPage(page)
        }
    }

    const getVisiblePages = () => {
        const pages = []
        const maxVisible = 5
        if (totalPages <= maxVisible) {
            for (let i = 1; i <= totalPages; i++) pages.push(i)
        } else {
            pages.push(1, 2, 3)
            if (totalPages > 4) pages.push('...')
            pages.push(totalPages - 1, totalPages)
        }
        return pages
    }

    const tabs = [
        { name: 'Customers', icon: 'fi fi-rs-users', count: String(allCustomers.length).padStart(2, '0') },
        { name: 'Transaction', icon: 'fi fi-sr-indian-rupee-sign', count: String(stats.totalTransactions || allTransactions.length).padStart(2, '0') },
        { name: 'Analytics', icon: 'fi fi-rr-chart-histogram', count: '00' },
    ]

    const statCards = [
        { label: 'Total Wallet Balance', value: `₹${stats.totalWalletBalance?.toLocaleString('en-IN') || 0}`, sub: 'Across all customers' },
        { label: 'Active Customers', value: String(stats.activeCustomers || 0).padStart(2, '0'), sub: `Of ${stats.totalCustomers || 0} total` },
        { label: 'Total Recharge', value: `₹${stats.totalRecharge?.toLocaleString('en-IN') || 0}`, sub: 'Lifetime value' },
        { label: 'Total Spent', value: `₹${stats.totalSpent?.toLocaleString('en-IN') || 0}`, sub: 'All transactions' },
        { label: 'Avg Balance', value: `₹${stats.avgBalance?.toLocaleString('en-IN') || 0}`, sub: 'Per customer' },
        { label: 'Total Transactions', value: String(stats.totalTransactions || 0), sub: 'All time' },
        { label: "Today's Transactions", value: String(stats.todaysTransactions || 0).padStart(2, '0'), sub: `₹${stats.todaysTransactionsValue?.toLocaleString('en-IN') || 0}` },
        { label: "Today's Volume", value: `₹${stats.todaysVolume?.toLocaleString('en-IN') || 0}`, sub: 'Transaction value' },
    ]

    const getStatusBadge = (status) => {
        const styles = statusBadgeStyles[status] || statusBadgeStyles['Active']
        return (
            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-[600] border ${styles.bg} ${styles.text} ${styles.border}`}>
                {status}
            </span>
        )
    }

    const getCategoryBadge = (category) => {
        const styles = categoryBadgeStyles[category] || categoryBadgeStyles['Order']
        return (
            <span className={`inline-flex items-center px-2.5 py-1 rounded-[25px] text-[12px] font-[600] ${styles.bg} ${styles.text}`}>
                {category}
            </span>
        )
    }

    // ---- Render Transaction Table ----
    const renderTransactionTable = () => (
        <div className="flex-1 overflow-hidden">
            <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
                <table className="w-full text-left border-collapse min-w-[1000px]">
                    <thead className="bg-[#F8F9FA] text-[12px] uppercase text-gray-500 font-[600] border-b border-gray-200">
                        <tr>
                            <th className="px-6 py-4">ID</th>
                            <th className="px-6 py-4">Customer Name</th>
                            <th className="px-6 py-4">Type</th>
                            <th className="px-6 py-4">Category</th>
                            <th className="px-6 py-4">Amount</th>
                            <th className="px-6 py-4">Balance</th>
                            <th className="px-6 py-4">Time</th>
                            <th className="px-6 py-4">Status</th>
                        </tr>
                    </thead>
                    <tbody className="text-[14px] text-gray-700">
                        {paginatedData.map((txn, index) => (
                            <tr key={index} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                                <td className="px-6 py-4 font-[600] text-[#1A181B]">{txn.id}</td>
                                <td className="px-6 py-4">
                                    <div className="flex flex-col">
                                        <span className="font-[700] text-[#1A181B]">{txn.customerName}</span>
                                        <span className="text-gray-400 text-[12px] mt-0.5">{txn.description}</span>
                                    </div>
                                </td>
                                <td className="px-6 py-4">
                                    <span className={`inline-flex items-center gap-1 font-[600] text-[13px] px-2.5 py-1 rounded-[25px] ${txn.type === 'Debit' ? 'text-red-500 bg-red-50' : 'text-green-600 bg-green-50'}`}>
                                        {txn.type === 'Debit' ? <ArrowDown size={14} /> : <ArrowUp size={14} />}
                                        {txn.type}
                                    </span>
                                </td>
                                <td className="px-6 py-4">
                                    {getCategoryBadge(txn.category)}
                                </td>
                                <td className="px-6 py-4">
                                    <span className={`font-[700] ${txn.amount < 0 ? 'text-red-500' : 'text-green-600'}`}>
                                        {txn.amount < 0 ? `-₹${Math.abs(txn.amount)}` : `+₹${txn.amount}`}
                                    </span>
                                </td>
                                <td className="px-6 py-4">
                                    <div className="flex flex-col">
                                        <span className="text-gray-400 text-[11px] font-medium">Before: ₹{(txn.balanceBefore || 0).toLocaleString('en-IN')}</span>
                                        <span className="font-[700] text-[#1A181B] text-[13px]">After: ₹{(txn.balanceAfter || 0).toLocaleString('en-IN')}</span>
                                    </div>
                                </td>
                                <td className="px-6 py-4 text-gray-500 font-[500] text-[13px]">{txn.time || 'N/A'}</td>
                                <td className="px-6 py-4">
                                    <span className={`font-[600] text-[13px] px-2.5 py-1 rounded-[25px] ${txn.status === 'Success' ? 'text-green-600 bg-green-50' : 'text-orange-500 bg-orange-50'}`}>
                                        {txn.status}
                                    </span>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    )

    // ---- Render Customer Cards ----
    const renderCustomerCards = () => (
        <div className="flex-1 flex flex-col gap-4">
            {paginatedData.map((customer) => (
                <div key={customer.id} className="bg-white rounded-xl border border-gray-100 p-4 hover:shadow-md transition-shadow">
                    {/* Top Row: Avatar + Info + Actions */}
                    <div className="flex items-start justify-between mb-4">
                        <div className="flex items-start gap-3">
                            <div className="w-[44px] h-[44px] rounded-full border border-gray-200 flex-shrink-0 flex items-center justify-center bg-[#FFF3E6] text-[#FE8301] text-[16px] font-[700]">
                                {(customer.name || 'G').split(' ').slice(0, 2).map(w => w[0]?.toUpperCase()).join('')}
                            </div>
                            <div>
                                <div className="flex items-center gap-2 mb-0.5">
                                    <span className="text-[14px] font-[600] text-[#1A181B] font-semibold font-manrope">{customer.name}</span>
                                    {getStatusBadge(customer.status)}
                                </div>
                                <div className="flex items-center gap-4 text-[13px] text-[#645E66] font-manrope">
                                    <span className="flex items-center gap-1 font-[500]">
                                        <Mail size={16} className="text-[#645E66]" />
                                        {customer.email}
                                    </span>
                                    <span className="flex items-center gap-1 font-[500]">
                                        <Phone size={16} className="text-[#645E66]" />
                                        {customer.phone}
                                    </span>
                                </div>
                                <p className="text-[12px] text-[#645E66] mt-0.5 font-manrope">Member since {customer.memberSince}</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="relative" ref={activeActionMenu === customer.id ? actionMenuRef : null}>
                                <button onClick={() => setActiveActionMenu(activeActionMenu === customer.id ? null : customer.id)} className="p-1.5 text-gray-400 hover:text-gray-600 transition-colors">
                                    <MoreVertical size={18} />
                                </button>
                                {activeActionMenu === customer.id && (
                                    <div className="absolute top-full right-0 mt-1 w-[160px] bg-white rounded-xl shadow-[0px_4px_20px_0px_rgba(0,0,0,0.1)] border border-gray-100 z-30 overflow-hidden font-manrope">
                                        {[
                                            { label: 'Active', status: 'Active', color: 'bg-green-500' },
                                            { label: 'Deactive', status: 'Inactive', color: 'bg-yellow-500' },
                                            { label: 'Block', status: 'Blocked', color: 'bg-red-500' },
                                        ].map((option, index) => (
                                            <div key={option.label}>
                                                <button
                                                    onClick={() => { updateStatus(customer.id, option.status); setActiveActionMenu(null) }}
                                                    className={`w-full text-left px-4 py-2.5 text-[13px] font-[500] transition-colors flex items-center gap-2.5 ${customer.status === option.status ? 'bg-[#FFF3E6] text-[#FE8301] font-[600]' : 'text-gray-700 hover:bg-[#FFF3E6] hover:text-[#FE8301]'}`}
                                                >
                                                    <span className={`w-2 h-2 rounded-full ${option.color}`}></span>
                                                    {option.label}
                                                </button>
                                                {index < 2 && <div className="h-[1px] bg-gray-100 mx-3"></div>}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                            <button onClick={() => { setDetailCustomer(customer); setShowDetailModal(true) }} className="flex items-center gap-1.5 px-4 py-2 border border-[#FE8301] text-[#FE8301] rounded-full text-[14px] font-[600] font-manrope hover:bg-orange-50 transition-colors">
                                <Eye size={14} />
                                View Details
                            </button>
                        </div>
                    </div>

                    {/* Stats Row */}
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-x-4 gap-y-6 mb-4 border-t border-gray-300 pt-4">
                        <div>
                            <p className="text-[12px] text-[#8D848F] font-[600] font-manrope mb-1">Current Balance</p>
                            <p className="text-[16px] xl:text-[18px] font-[700] leading-[22px] text-[#AD09D4] font-manrope whitespace-nowrap">₹{customer.currentBalance?.toLocaleString('en-IN', { minimumFractionDigits: 2 }) || '0.00'}</p>
                        </div>
                        <div>
                            <p className="text-[12px] text-[#8D848F] font-[600] font-manrope mb-1">Total Recharge</p>
                            <p className="text-[16px] xl:text-[18px] font-[700] leading-[22px] text-[#05A22C] font-manrope whitespace-nowrap">₹{customer.totalRecharge?.toLocaleString('en-IN', { minimumFractionDigits: 2 }) || '0.00'}</p>
                        </div>
                        <div>
                            <p className="text-[12px] text-[#8D848F] font-[600] font-manrope mb-1">Total Spent</p>
                            <p className="text-[16px] xl:text-[18px] font-[700] leading-[22px] text-[#FF3B30] font-manrope whitespace-nowrap">₹{customer.totalSpent?.toLocaleString('en-IN', { minimumFractionDigits: 2 }) || '0.00'}</p>
                        </div>
                        <div>
                            <p className="text-[12px] text-[#8D848F] font-[600] font-manrope mb-1">Transactions</p>
                            <p className="text-[16px] xl:text-[18px] font-[700] leading-[22px] text-[#007AFF] font-manrope">{customer.transactions}</p>
                        </div>
                        <div>
                            <p className="text-[12px] text-[#8D848F] font-[600] font-manrope mb-1">Loyalty Points</p>
                            <p className="text-[16px] xl:text-[18px] font-[700] leading-[22px] text-[#FE8301] font-manrope">{customer.loyaltyPoints}</p>
                        </div>
                        <div>
                            <p className="text-[12px] text-[#8D848F] font-[600] font-manrope mb-1">Last Transaction</p>
                            <p className="text-[13px] xl:text-[14px] font-[600] leading-[22px] text-[#1A181B] font-manrope line-clamp-1">{customer.lastTransaction}</p>
                        </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex items-center justify-end gap-3">
                        <button onClick={() => { setSelectedCustomer(customer); setBalanceModalType('add'); setModalAmount(''); setModalReason(''); setShowBalanceModal(true) }} className="w-[129px] h-[30px] flex items-center justify-center gap-2 border border-[#FE8301] text-[#FE8301] rounded-[8px] text-[14px] font-[600] leading-[14px] font-manrope hover:bg-orange-50 transition-colors">
                            <Plus size={14} />
                            Add Balance
                        </button>
                        <button onClick={() => { setSelectedCustomer(customer); setBalanceModalType('deduct'); setModalAmount(''); setModalReason(''); setShowBalanceModal(true) }} className="h-[30px] px-4 flex items-center justify-center gap-2 border border-red-400 text-red-500 rounded-[8px] text-[14px] font-[600] leading-[14px] font-manrope hover:bg-red-50 transition-colors">
                            <Minus size={14} />
                            Deduct Balance
                        </button>
                        <button onClick={() => { setSelectedCustomer(customer); setShowPointsModal(true) }} className="w-[129px] h-[30px] flex items-center justify-center gap-2 border border-[#FE8301] text-[#FE8301] rounded-[8px] text-[14px] font-[600] leading-[14px] font-manrope hover:bg-orange-50 transition-colors">
                            <Gift size={14} />
                            Add Bonus
                        </button>
                    </div>
                </div>
            ))}
        </div>
    )

    // Skeleton on cold first paint — paints the page shell instantly
    // while React Query resolves /wallet/admin/stats. Subsequent visits
    // hit the cache and skip this branch entirely.
    if (loading && !walletPayload) {
        return (
            <div className="space-y-6 py-6">
                <SkeletonStatGrid count={4} />
                <SkeletonRows count={6} />
            </div>
        )
    }

    return (
        <div className="h-full flex flex-col">
            {/* Header */}
            <div className="mb-2 flex items-start justify-between gap-4">
                <div>
                    <h1 className="font-manrope font-[700] text-[20px] leading-[26px] text-[#1A181B]">Wallet Management</h1>
                    <p className="font-manrope font-[600] text-[16px] leading-[22px] text-[#645E66] mt-1">Monitor and manage customer wallets</p>
                </div>
                {/* ADM-057 — top-level Credit Wallet entry point. The
                    per-row Add Balance button stays for in-context use; this
                    one's discoverable for the "I know who I'm crediting,
                    just let me do it" path. */}
                <button
                    onClick={() => setShowCreditModal(true)}
                    className="inline-flex items-center gap-2 px-4 py-2.5 bg-[#FE8301] text-white font-bold rounded-xl hover:bg-orange-600 shadow-sm transition-all font-manrope text-sm shrink-0"
                >
                    <Plus size={18} />
                    Credit Wallet
                </button>
            </div>

            {/* Stats Cards - Wrapped In Scroll on mobile if needed, but using responsive grid */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-x-[24px] gap-y-[12px] mb-4">
                {statCards.map((card, index) => (
                    <div key={index} className="bg-white rounded-xl border border-gray-300 p-[16px] min-w-0">
                        <p className="text-[13px] md:text-[14px] leading-[20px] font-[600] text-gray-500 mb-1 truncate">{card.label}</p>
                        <p className="text-[18px] md:text-[20px] leading-[30px] font-[700] text-[#1A181B] truncate">{card.value}</p>
                        <p className="text-[11px] md:text-[12px] text-[#645E66] font-[400] leading-[16px] mt-1 truncate">{card.sub}</p>
                    </div>
                ))}
            </div>

            {/* Tab Bar */}
            <div className="flex items-center bg-[#EEEEEE] border border-[#DFDCE0] rounded-[50px] p-[4px] mb-4">
                {tabs.map((tab) => (
                    <button
                        key={tab.name}
                        onClick={() => setActiveTab(tab.name)}
                        className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-[50px] text-[14px] font-[600] font-manrope transition-all ${activeTab === tab.name
                            ? 'bg-white text-[#FE8301] shadow-sm'
                            : 'text-gray-500 hover:text-gray-700'
                            }`}
                    >
                        <i className={`${tab.icon} text-[20px]`}></i>
                        {tab.name} ({tab.count})
                    </button>
                ))}
            </div>

            {/* Search + Filter Row */}
            <div className="flex items-center gap-3 mb-4">
                <div className="flex-1 relative rounded-[1px]">
                    <Search size={20} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 " />
                    <input
                        type="text"
                        placeholder="Search by name, email or phone"
                        value={searchTerm}
                        onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1) }}
                        className="w-full pl-12 pr-4 py-3 bg-white border border-[#CCCAC8] rounded-[12px] focus:outline-none focus:border-orange-500 font-manrope font-medium text-[14px] leading-[20px] focus:ring-2 focus:ring-orange-500/10 transition-all placeholder:text-[#645E66] font-[500]"
                    />
                </div>
                <button className="w-11 h-11 flex items-center justify-center bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors flex-shrink-0">
                    <Search size={20} />
                </button>

                {/* Status Dropdown */}
                <div className="relative" ref={statusDdRef}>
                    <button
                        onClick={() => setShowStatusDropdown(!showStatusDropdown)}
                        className={`flex items-center gap-2 px-4 py-2.5 bg-white border border-[#CCCAC8] rounded-[12px] text-sm font-medium text-gray-600 font-manrope font-semibold hover:border-gray-300 hover:bg-gray-50 transition-all min-w-[150px] ${showStatusDropdown ? 'ring-2 ring-orange-100 border-orange-200' : ''}`}
                    >
                        Select Status
                        <ChevronDown size={16} className={`text-[#7D7380] transition-transform duration-200 ml-auto ${showStatusDropdown ? 'rotate-180' : ''}`} />
                    </button>

                    {showStatusDropdown && (
                        <div className="absolute top-full right-0 mt-2 w-[180px] bg-white rounded-2xl shadow-[0px_4px_20px_0px_rgba(0,0,0,0.08)] border border-gray-100 z-20 animate-in fade-in zoom-in-95 duration-200 overflow-hidden">
                            {['All', 'Active', 'Inactive', 'Blocked'].map((status, index) => (
                                <div key={status}>
                                    <button
                                        onClick={() => {
                                            setSelectedStatus(status)
                                            setShowStatusDropdown(false)
                                            setCurrentPage(1)
                                        }}
                                        className={`w-full text-left px-5 py-2.5 text-sm font-medium text-gray-600 font-manrope transition-colors ${selectedStatus === status ? 'bg-[#FE8301] !text-white' : 'text-gray-600 hover:bg-[#FE8301] hover:!text-white'}`}
                                    >
                                        {status}
                                    </button>
                                    {index < 3 && <div className="h-[1px] bg-gray-100 mx-4 my-1"></div>}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* Tab Content */}
            {activeTab === 'Customers' && renderCustomerCards()}
            {activeTab === 'Transaction' && renderTransactionTable()}
            {
                activeTab === 'Analytics' && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-4">
                        {/* Status Distribution Card */}
                        <div className="bg-white rounded-[16px] border border-[#CCCAC8] pt-[16px] px-[16px]">
                            <h3 className="text-[16px] font-[600] text-[#1A181B] font-semibold font-manrope mb-4">Status Distribution</h3>
                            {(() => {
                                const total = allCustomers.length || 1
                                const statusCounts = {
                                    Active: allCustomers.filter(c => c.status === 'Active').length,
                                    Inactive: allCustomers.filter(c => c.status === 'Inactive').length,
                                    Blocked: allCustomers.filter(c => c.status === 'Blocked').length,
                                }
                                const statusBarColors = { Active: 'bg-green-500', Inactive: 'bg-red-500', Blocked: 'bg-gray-400' }
                                return Object.entries(statusCounts).map(([status, count]) => {
                                    const pct = Math.round((count / total) * 100)
                                    return (
                                        <div key={status} className="mb-4 last:mb-0">
                                            <div className="flex items-center justify-between mb-1.5">
                                                <span className="text-[13px] font-[500] text-gray-600 font-manrope">{status}</span>
                                                <span className="text-[13px] font-[600] text-gray-700 font-manrope">{count} ({pct}%)</span>
                                            </div>
                                            <div className="w-full h-[8px] bg-gray-100 rounded-full overflow-hidden">
                                                <div className={`h-full rounded-full ${statusBarColors[status]} transition-all duration-500`} style={{ width: `${pct}%` }}></div>
                                            </div>
                                        </div>
                                    )
                                })
                            })()}
                        </div>

                        {/* Transaction Categories Card */}
                        <div className="bg-white rounded-xl border border-gray-300 p-6">
                            <h3 className="text-[16px] font-[600] text-[#1A181B] font-semibold font-manrope mb-5">Transaction Categories</h3>
                            {(() => {
                                const total = allTransactions.length || 1
                                const catMap = {}
                                allTransactions.forEach(txn => {
                                    const label = txn.category === 'Order' ? 'Order payment' : txn.category
                                    catMap[label] = (catMap[label] || 0) + 1
                                })
                                const categories = ['Recharge', 'Order payment', 'Refund', 'Discount', 'Bonus']
                                return categories.map(cat => {
                                    const count = catMap[cat] || 0
                                    const pct = Math.round((count / total) * 100)
                                    return (
                                        <div key={cat} className="mb-4 last:mb-0">
                                            <div className="flex items-center justify-between mb-1.5">
                                                <span className="text-[13px] font-[500] text-gray-600 font-manrope">{cat}</span>
                                                <span className="text-[13px] font-[600] text-gray-700 font-manrope">{count} ({pct}%)</span>
                                            </div>
                                            <div className="w-full h-[8px] bg-gray-100 rounded-full overflow-hidden">
                                                <div className="h-full rounded-full bg-blue-500 transition-all duration-500" style={{ width: `${pct}%` }}></div>
                                            </div>
                                        </div>
                                    )
                                })
                            })()}
                        </div>
                    </div>
                )
            }

            {/* Pagination */}
            <div className="flex flex-col md:flex-row justify-center items-center py-4 border-t border-gray-100 gap-4 md:gap-6 font-manrope mt-4">
                <div className="flex items-center gap-2">
                    <button
                        disabled={currentPage === 1}
                        onClick={() => handlePageChange(currentPage - 1)}
                        className="w-8 h-8 flex items-center justify-center rounded-lg bg-[#EBEBEB] text-gray-500 hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                        <span className="mb-0.5">‹</span>
                    </button>

                    {getVisiblePages().map((page, idx) => (
                        page === '...' ? (
                            <span key={idx} className="w-8 h-8 flex items-center justify-center text-gray-400">...</span>
                        ) : (
                            <button
                                key={idx}
                                onClick={() => handlePageChange(page)}
                                className={`w-8 h-8 flex items-center justify-center rounded-lg text-sm font-[600] transition-colors ${currentPage === page
                                    ? 'bg-[#FFDBB1] text-[#1A181B]'
                                    : 'bg-white text-gray-500 hover:bg-gray-50'
                                    }`}
                            >
                                {page}
                            </button>
                        )
                    ))}

                    <button
                        disabled={currentPage === totalPages || totalPages === 0}
                        onClick={() => handlePageChange(currentPage + 1)}
                        className="w-8 h-8 flex items-center justify-center rounded-lg bg-[#EBEBEB] text-gray-500 hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                        <span className="mb-0.5">›</span>
                    </button>
                </div>

                <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2 text-sm text-gray-600 font-[500] relative" ref={rowsDdRef}>
                        <span>Rows per page</span>
                        <button
                            onClick={() => setShowRowsDropdown(!showRowsDropdown)}
                            className={`flex items-center gap-2 px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-[14px] text-gray-700 hover:border-gray-300 hover:bg-gray-50 transition-all font-[600] ${showRowsDropdown ? 'ring-2 ring-orange-100 border-orange-200' : ''}`}
                        >
                            {itemsPerPage}
                            <ChevronDown size={14} className={`text-gray-400 transition-transform duration-200 ${showRowsDropdown ? 'rotate-180' : ''}`} />
                        </button>

                        {showRowsDropdown && (
                            <div className="absolute bottom-full left-0 mb-2 w-[100px] bg-white rounded-2xl shadow-[0px_4px_20px_0px_rgba(0,0,0,0.08)] border border-gray-100 z-20 animate-in fade-in zoom-in-95 duration-200 overflow-hidden">
                                {[4, 8, 12, 16].map((rows, index) => (
                                    <div key={rows}>
                                        <button
                                            onClick={() => {
                                                setItemsPerPage(rows)
                                                setCurrentPage(1)
                                                setShowRowsDropdown(false)
                                            }}
                                            className={`w-full text-left px-5 py-2.5 text-sm font-medium text-gray-600 font-manrope transition-colors ${itemsPerPage === rows ? 'bg-[#FE8301] !text-white' : 'text-gray-600 hover:bg-[#FE8301] hover:!text-white'}`}
                                        >
                                            {rows}
                                        </button>
                                        {index < 2 && <div className="h-[1px] bg-gray-100 mx-4 my-1"></div>}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    <span className="text-sm text-gray-500 font-[500]">
                        {activeData.length > 0 ? `${startIndex + 1}-${Math.min(startIndex + itemsPerPage, activeData.length)} of ${activeData.length}` : '0-0 of 0'}
                    </span>
                </div>
            </div>

            {/* Balance Modal */}
            {
                showBalanceModal && (
                    <AdjustBalanceModal
                        type={balanceModalType}
                        onClose={() => setShowBalanceModal(false)}
                        onSubmit={handleAdjustWallet}
                        amount={modalAmount}
                        setAmount={setModalAmount}
                        reason={modalReason}
                        setReason={setModalReason}
                        selectedCustomer={selectedCustomer}
                        adjusting={adjusting}
                    />
                )
            }

            {/* View Details Modal */}
            {
                showDetailModal && detailCustomer && (
                    <ViewDetailsModal
                        customer={detailCustomer}
                        onClose={() => setShowDetailModal(false)}
                        statusBadgeStyles={statusBadgeStyles}
                    />
                )
            }

            {/* Add Points Modal */}
            {
                showPointsModal && (
                    <AddPointsModal
                        onClose={() => setShowPointsModal(false)}
                        onSubmit={handleAdjustPoints}
                        customers={allCustomers}
                        selectedCustomer={selectedCustomer}
                        adjusting={adjusting}
                    />
                )
            }

            {/* ADM-057 — Credit Wallet (top-level) */}
            {showCreditModal && (
                <CreditWalletModal
                    customers={allCustomers}
                    search={creditSearch}
                    setSearch={setCreditSearch}
                    customerId={creditCustomerId}
                    setCustomerId={setCreditCustomerId}
                    amount={creditAmount}
                    setAmount={setCreditAmount}
                    note={creditNote}
                    setNote={setCreditNote}
                    submitting={creditSubmitting}
                    onClose={() => setShowCreditModal(false)}
                    onSubmit={submitCreditWallet}
                />
            )}
        </div >
    )
}

// ---- Adjust Wallet Balance Modal ----
const AdjustBalanceModal = ({ type, onClose, onSubmit, amount, setAmount, reason, setReason, selectedCustomer, adjusting }) => {
    const titles = { add: 'Adjust Wallet Balance', deduct: 'Deduct Wallet Balance', bonus: 'Add Bonus' }
    const buttonLabels = { add: 'Add Balance', deduct: 'Deduct Balance', bonus: 'Add Bonus' }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black/40" onClick={onClose}></div>

            {/* Modal */}
            <div className="relative bg-white rounded-2xl w-[440px] max-w-[90vw] shadow-[0px_8px_32px_rgba(0,0,0,0.12)] overflow-hidden font-manrope animate-scaleIn">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 bg-green-50 border-b border-green-100">
                    <h2 className="text-[18px] font-[700] text-[#1A181B]">{titles[type]}</h2>
                    <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600 transition-colors">
                        <X size={20} />
                    </button>
                </div>

                {/* Body */}
                <div className="px-6 py-5">
                    {/* Selected Customer Info */}
                    <div className="mb-4 p-3 bg-blue-50 border border-blue-100 rounded-xl">
                        <p className="text-[12px] text-blue-500 font-[600]">Target Customer</p>
                        <p className="text-[14px] font-[700] text-[#1A181B]">{selectedCustomer?.name || 'No customer selected'}</p>
                    </div>

                    {/* Amount */}
                    <div className="mb-4">
                        <label className="block text-[14px] font-[600] text-[#1A181B] mb-2">Amount</label>
                        <input
                            type="number"
                            placeholder="Enter Amount"
                            value={amount}
                            onChange={(e) => setAmount(e.target.value)}
                            className="w-full px-4 py-3 border border-gray-200 rounded-xl text-[14px] font-[500] placeholder:text-gray-400 focus:outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100 transition-all"
                        />
                    </div>

                    {/* Reason */}
                    <div className="mb-6">
                        <label className="block text-[14px] font-[600] text-[#1A181B] mb-2">Reason</label>
                        <textarea
                            placeholder="Enter reason for adjustment"
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                            rows={3}
                            className="w-full px-4 py-3 border border-gray-200 rounded-xl text-[14px] font-[500] placeholder:text-gray-400 focus:outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100 transition-all resize-none"
                        />
                    </div>

                    {/* Buttons */}
                    <div className="flex items-center gap-3">
                        <button
                            onClick={onClose}
                            className="flex-1 py-3 border-2 border-[#FE8301] text-[#FE8301] rounded-[12px] text-[14px] font-[600] hover:bg-orange-50 transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={() => onSubmit(amount, reason, type)}
                            disabled={!amount || !reason?.trim() || parseFloat(amount) <= 0 || adjusting}
                            className="flex-1 py-3 bg-[#FE8301] text-white rounded-[12px] text-[14px] font-[600] hover:bg-orange-600 transition-colors shadow-sm disabled:opacity-50 flex items-center justify-center gap-2"
                        >
                            {adjusting ? 'Processing...' : buttonLabels[type]}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    )
}

// ---- View Details Modal ----
const ViewDetailsModal = ({ customer, onClose, statusBadgeStyles }) => {
    const statusStyle = statusBadgeStyles[customer.status] || statusBadgeStyles['Active']
    const recentTxns = customer.recentTransactions || []

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black/40" onClick={onClose}></div>

            {/* Modal */}
            <div className="relative bg-[#FFFFFF] rounded-2xl w-[620px] max-w-[92vw] max-h-[90vh] overflow-y-auto no-scrollbar shadow-[0px_2px_6px_0px_#0000001F] font-manrope">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 bg-[#FFF5EB] border-b border-orange-100 rounded-t-2xl sticky top-0 z-10 shadow-[0px_2px_6px_0px_#0000001F]">
                    <h2 className="text-[18px] font-[600] leading-[24px] text-[#1A181B] font-manrope">{customer.name} - Wallet Details</h2>
                    <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600 transition-colors">
                        <X size={20} />
                    </button>
                </div>

                <div className="px-6 py-4 space-y-5">
                    {/* Customer Information */}
                    <div className="bg-white rounded-xl border border-gray-300 p-3">
                        <h3 className="text-[15px] font-[700] text-[#1A181B] mb-3">Customer Information</h3>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-3">
                            <div>
                                <p className="text-[12px] text-gray-400 mb-0.5">Email</p>
                                <p className="text-[13px] font-[600] text-[#1A181B] break-all">{customer.email}</p>
                            </div>
                            <div>
                                <p className="text-[12px] text-gray-400 mb-0.5">Phone</p>
                                <p className="text-[13px] font-[600] text-[#1A181B]">{customer.phone}</p>
                            </div>
                            <div>
                                <p className="text-[12px] text-gray-400 mb-0.5">Loyalty Points</p>
                                <p className="text-[16px] font-[700] text-[#FE8301]">{customer.loyaltyPoints}</p>
                            </div>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                            <div>
                                <p className="text-[12px] text-gray-400 mb-1">Status</p>
                                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-[600] border ${statusStyle.bg} ${statusStyle.text} ${statusStyle.border}`}>
                                    {customer.status}
                                </span>
                            </div>
                            <div>
                                <p className="text-[12px] text-gray-400 mb-0.5">Member Since</p>
                                <p className="text-[13px] font-[600] text-[#1A181B]">{customer.memberSince}</p>
                            </div>
                        </div>
                    </div>

                    {/* Wallet Statistics */}
                    <div className="bg-white rounded-xl border border-gray-300 p-4">
                        <h3 className="text-[15px] font-[700] text-[#1A181B] mb-3">Wallet Statistics</h3>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                            <div>
                                <p className="text-[12px] text-gray-400 mb-1">Current Balance</p>
                                <p className="text-[14px] sm:text-[16px] font-[700] text-[#FE8301] whitespace-nowrap">₹{customer.currentBalance?.toLocaleString('en-IN', { minimumFractionDigits: 2 }) || '0.00'}</p>
                            </div>
                            <div>
                                <p className="text-[12px] text-gray-400 mb-1">Total Recharge</p>
                                <p className="text-[14px] sm:text-[16px] font-[700] text-green-600 whitespace-nowrap">₹{customer.totalRecharge?.toLocaleString('en-IN', { minimumFractionDigits: 2 }) || '0.00'}</p>
                            </div>
                            <div>
                                <p className="text-[12px] text-gray-400 mb-1">Total Spent</p>
                                <p className="text-[14px] sm:text-[16px] font-[700] text-red-500 whitespace-nowrap">₹{customer.totalSpent?.toLocaleString('en-IN', { minimumFractionDigits: 2 }) || '0.00'}</p>
                            </div>
                            <div>
                                <p className="text-[12px] text-gray-400 mb-1">Transactions</p>
                                <p className="text-[14px] sm:text-[16px] font-[700] text-blue-600">{customer.transactions}</p>
                            </div>
                        </div>
                    </div>

                    {/* Recent Transactions */}
                    <div className="bg-white rounded-xl border border-gray-300 p-4">
                        <h3 className="text-[15px] font-[700] text-[#1A181B] mb-3">Recent Transactions</h3>
                        <div className="space-y-3">
                            {recentTxns.length > 0 ? recentTxns.map((txn, index) => (
                                <div key={index} className="flex items-center justify-between p-4 border border-gray-300 rounded-xl">
                                    <div>
                                        <p className="text-[14px] font-[600] text-[#1A181B]">{txn.description}</p>
                                        <p className="text-[12px] text-gray-400 mt-0.5">{txn.date}</p>
                                    </div>
                                    <span className={`text-[14px] font-[700] ${txn.amount >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                                        {txn.amount >= 0 ? '+' : '-'}₹{Math.abs(txn.amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                    </span>
                                </div>
                            )) : (
                                <p className="text-[13px] text-gray-400 text-center py-4">No recent transactions</p>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}

// ---- Add Points Manually Modal ----
const AddPointsModal = ({ onClose, onSubmit, customers, selectedCustomer, adjusting }) => {
    const [pointsMode, setPointsMode] = useState('add') // 'deduct' | 'add'
    const [customerSearch, setCustomerSearch] = useState(selectedCustomer ? selectedCustomer.name : '')
    const [pointsAmount, setPointsAmount] = useState('')
    const [reason, setReason] = useState('')

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black/40" onClick={onClose}></div>

            {/* Modal */}
            <div className="relative bg-white rounded-2xl w-[460px] max-w-[92vw] shadow-[0px_8px_32px_rgba(0,0,0,0.12)] overflow-hidden font-manrope">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 bg-[#FFF2E8] border-b border-orange-100">
                    <h2 className="text-[18px] font-[700] text-[#1A181B]">Add Points Manually</h2>
                    <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600 transition-colors">
                        <X size={20} />
                    </button>
                </div>

                {/* Body */}
                <div className="px-6 py-5">
                    {/* Toggle Buttons */}
                    <div className="flex gap-3 mb-5">
                        <button
                            onClick={() => setPointsMode('deduct')}
                            className={`flex-1 flex flex-col items-center gap-1.5 py-4 rounded-xl border-2 text-[13px] font-[600] transition-all ${pointsMode === 'deduct'
                                ? 'border-red-400 bg-red-50 text-red-500'
                                : 'border-gray-200 bg-white text-gray-400 hover:border-gray-300'
                                }`}
                        >
                            <Minus size={18} />
                            Deduct Points
                        </button>
                        <button
                            onClick={() => setPointsMode('add')}
                            className={`flex-1 flex flex-col items-center gap-1.5 py-4 rounded-xl border-2 text-[13px] font-[600] transition-all ${pointsMode === 'add'
                                ? 'border-green-400 bg-green-50 text-green-600'
                                : 'border-gray-200 bg-white text-gray-400 hover:border-gray-300'
                                }`}
                        >
                            <Plus size={18} />
                            Add Points
                        </button>
                    </div>

                    {/* Select Customer */}
                    <div className="mb-4">
                        <label className="block text-[14px] font-[600] text-[#1A181B] mb-2">Select Customer</label>
                        <input
                            type="text"
                            placeholder="Search by name, email, phone"
                            value={customerSearch}
                            onChange={(e) => setCustomerSearch(e.target.value)}
                            className="w-full px-4 py-3 border border-gray-200 rounded-xl text-[14px] font-[500] placeholder:text-gray-400 focus:outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100 transition-all"
                        />
                    </div>

                    {/* Points Amount */}
                    <div className="mb-4">
                        <label className="block text-[14px] font-[600] text-[#1A181B] mb-2">Points Amount</label>
                        <input
                            type="number"
                            placeholder="Enter points"
                            value={pointsAmount}
                            onChange={(e) => setPointsAmount(e.target.value)}
                            className="w-full px-4 py-3 border border-gray-200 rounded-xl text-[14px] font-[500] placeholder:text-gray-400 focus:outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100 transition-all"
                        />
                    </div>

                    {/* Reason */}
                    <div className="mb-6">
                        <label className="block text-[14px] font-[600] text-[#1A181B] mb-2">Reason</label>
                        <textarea
                            placeholder="Enter reason for this action"
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                            rows={4}
                            className="w-full px-4 py-3 border border-gray-200 rounded-xl text-[14px] font-[500] placeholder:text-gray-400 focus:outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100 transition-all resize-none"
                        />
                    </div>

                    {/* Buttons */}
                    <div className="flex items-center gap-3">
                        <button
                            onClick={onClose}
                            className="flex-1 py-3 border-2 border-[#FE8301] text-[#FE8301] rounded-[12px] text-[14px] font-[600] hover:bg-orange-50 transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={() => onSubmit(pointsAmount, reason, pointsMode)}
                            disabled={!pointsAmount || !reason?.trim() || parseFloat(pointsAmount) <= 0 || adjusting}
                            className="flex-1 py-3 bg-[#FE8301] text-white rounded-[12px] text-[14px] font-[600] hover:bg-orange-600 transition-colors shadow-sm disabled:opacity-50 flex items-center justify-center gap-2"
                        >
                            {adjusting ? 'Processing...' : 'Confirm'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    )
}

// ---- Credit Wallet Modal (ADM-057) ----
// Top-level "I want to credit a customer's wallet" modal. The per-row
// AdjustBalanceModal preselects the customer for you; this one makes
// you pick. Wires through the same /wallet/admin/adjust endpoint so the
// Transaction audit row stays consistent.
const CreditWalletModal = ({
    customers, search, setSearch, customerId, setCustomerId,
    amount, setAmount, note, setNote, submitting, onClose, onSubmit,
}) => {
    const filtered = (customers || []).filter(c => {
        if (!search.trim()) return true
        const q = search.toLowerCase()
        return (c.name || '').toLowerCase().includes(q)
            || (c.phone || '').toLowerCase().includes(q)
            || (c.email || '').toLowerCase().includes(q)
    }).slice(0, 50)
    const picked = (customers || []).find(c => c.id === customerId)

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="absolute inset-0 bg-black/40" onClick={onClose}></div>
            <div className="relative bg-white rounded-2xl w-[480px] max-w-[92vw] max-h-[90vh] shadow-[0px_8px_32px_rgba(0,0,0,0.12)] overflow-hidden font-manrope animate-scaleIn flex flex-col">
                <div className="flex items-center justify-between px-6 py-4 bg-orange-50 border-b border-orange-100 shrink-0">
                    <h2 className="text-[18px] font-[700] text-[#1A181B]">Credit Wallet</h2>
                    <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600 transition-colors">
                        <X size={20} />
                    </button>
                </div>

                <div className="px-6 py-5 overflow-y-auto">
                    {/* Customer picker */}
                    <div className="mb-4">
                        <label className="block text-[14px] font-[600] text-[#1A181B] mb-2">Customer</label>
                        {picked ? (
                            <div className="flex items-center justify-between p-3 bg-blue-50 border border-blue-100 rounded-xl">
                                <div>
                                    <p className="text-[14px] font-[700] text-[#1A181B]">{picked.name}</p>
                                    <p className="text-[12px] text-gray-500">{picked.phone} · ₹{Number(picked.currentBalance || 0).toFixed(2)} current</p>
                                </div>
                                <button
                                    onClick={() => { setCustomerId(''); setSearch('') }}
                                    className="text-[12px] font-[600] text-[#FE8301] hover:underline"
                                >
                                    Change
                                </button>
                            </div>
                        ) : (
                            <>
                                <div className="relative">
                                    <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                                    <input
                                        type="text"
                                        placeholder="Search by name, email or phone"
                                        value={search}
                                        onChange={(e) => setSearch(e.target.value)}
                                        className="w-full pl-10 pr-3 py-2.5 border border-gray-200 rounded-xl text-[14px] focus:outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100"
                                    />
                                </div>
                                {filtered.length > 0 && (
                                    <div className="mt-2 border border-gray-200 rounded-xl max-h-[180px] overflow-y-auto">
                                        {filtered.map(c => (
                                            <button
                                                key={c.id}
                                                onClick={() => setCustomerId(c.id)}
                                                className="w-full text-left px-3 py-2.5 hover:bg-orange-50 border-b border-gray-100 last:border-b-0 transition-colors"
                                            >
                                                <p className="text-[13px] font-[600] text-[#1A181B]">{c.name}</p>
                                                <p className="text-[11px] text-gray-500">{c.phone || c.email} · ₹{Number(c.currentBalance || 0).toFixed(2)}</p>
                                            </button>
                                        ))}
                                    </div>
                                )}
                                {search.trim() && filtered.length === 0 && (
                                    <p className="text-[12px] text-gray-400 mt-2">No customers match "{search}"</p>
                                )}
                            </>
                        )}
                    </div>

                    {/* Amount */}
                    <div className="mb-4">
                        <label className="block text-[14px] font-[600] text-[#1A181B] mb-2">Amount (₹)</label>
                        <input
                            type="number"
                            min="1"
                            placeholder="Enter amount"
                            value={amount}
                            onChange={(e) => setAmount(e.target.value)}
                            className="w-full px-4 py-3 border border-gray-200 rounded-xl text-[14px] focus:outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100"
                        />
                    </div>

                    {/* Note */}
                    <div className="mb-6">
                        <label className="block text-[14px] font-[600] text-[#1A181B] mb-2">Note (optional)</label>
                        <textarea
                            placeholder="e.g. Goodwill credit, refund adjustment"
                            value={note}
                            onChange={(e) => setNote(e.target.value)}
                            rows={3}
                            className="w-full px-4 py-3 border border-gray-200 rounded-xl text-[14px] focus:outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100 resize-none"
                        />
                    </div>

                    <div className="flex items-center gap-3">
                        <button
                            onClick={onClose}
                            disabled={submitting}
                            className="flex-1 py-3 border-2 border-[#FE8301] text-[#FE8301] rounded-xl text-[14px] font-[600] hover:bg-orange-50 transition-colors disabled:opacity-50"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={onSubmit}
                            disabled={submitting || !customerId || !amount}
                            className="flex-1 py-3 bg-[#FE8301] text-white rounded-xl text-[14px] font-[700] hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                            {submitting ? 'Crediting...' : 'Credit Wallet'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    )
}

export default WalletDashboard
