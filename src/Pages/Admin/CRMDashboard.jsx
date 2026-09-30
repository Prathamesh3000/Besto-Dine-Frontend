import React, { useState, useEffect, useRef, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Search, Eye, Download, ChevronLeft, ChevronRight, User, ChevronDown, Loader2 } from 'lucide-react'
import { toast } from 'react-hot-toast'
import CustomerDetailView from './components/CustomerDetailView'
import api from '../../utils/api'
import { SkeletonRows } from '../../Components/Common/Skeleton'
import { adminKeys } from '../../hooks/queries/queryKeys'

const tagStyles = {
    'VIP': 'bg-[#FFF3E6] text-[#FE8301] border-[#FE8301]',
    'Regular': 'bg-[#E8F4FF] text-[#007AFF] border-[#007AFF]',
    'New': 'bg-[#E8FFF0] text-[#34C759] border-[#34C759]',
}

const statusStyles = {
    'Active': 'bg-[#E8FFF0] text-[#34C759] border-[#34C759]',
    'Inactive': 'bg-[#FFF3E6] text-[#FE8301] border-[#FE8301]',
}

const CRMDashboard = () => {
    const [searchTerm, setSearchTerm] = useState('')
    const [selectedCategory, setSelectedCategory] = useState('Select Category')
    const [sortBy, setSortBy] = useState('Sort by')
    const [selectedCustomer, setSelectedCustomer] = useState(null)
    const [showSortDropdown, setShowSortDropdown] = useState(false)
    const [showCategoryDropdown, setShowCategoryDropdown] = useState(false)
    const [showRowsDropdown, setShowRowsDropdown] = useState(false)
    const sortDdRef = useRef(null)
    const categoryDdRef = useRef(null)

    useEffect(() => {
        const handler = (e) => {
            if (sortDdRef.current && !sortDdRef.current.contains(e.target)) setShowSortDropdown(false)
            if (categoryDdRef.current && !categoryDdRef.current.contains(e.target)) setShowCategoryDropdown(false)
        }
        document.addEventListener('mousedown', handler)
        return () => document.removeEventListener('mousedown', handler)
    }, [])

    // Customers + summary stats — single React Query, 1 minute stale.
    // The CRM list rarely needs sub-minute freshness; tab switches paint
    // from cache instantly with a quiet background revalidate.
    const { data: crmData, isLoading: loading } = useQuery({
        queryKey: [...adminKeys.crm, 'customers'],
        queryFn: async () => {
            const res = await api.get('/crm/customers')
            if (!res.data?.success) return { customers: [], stats: null }
            return { customers: res.data.customers || [], stats: res.data.stats || null }
        },
        staleTime: 60_000,
        onError: () => toast.error('Failed to load customer data'),
    })
    const allCustomers = useMemo(() => crmData?.customers ?? [], [crmData?.customers])
    const stats = crmData?.stats ?? { totalCustomers: 0, activeCustomers: 0, loggedIn: 0, guestUsers: 0, newCustomers: 0 }

    // Local state for pagination
    const [pagination, setPagination] = useState({
        page: 1,
        rowsPerPage: 10,
        total: 0
    })

    const updatePagination = (updates) => setPagination(prev => ({ ...prev, ...updates }))

    // Derive filtered and sorted customers
    const filteredCustomers = allCustomers.filter(customer => {
        const term = searchTerm.trim().toLowerCase()
        const matchSearch = !term ||
            customer.name.toLowerCase().includes(term) ||
            (customer.phone || '').replace(/\s+/g, '').includes(term.replace(/\s+/g, ''))

        const matchCategory = selectedCategory === 'Select Category' || customer.tagCategory === selectedCategory

        return matchSearch && matchCategory
    })

    // Simple sorting
    const sortedCustomers = [...filteredCustomers].sort((a, b) => {
        if (sortBy === 'Name') return a.name.localeCompare(b.name)
        if (sortBy === 'Spending') return b.spending - a.spending
        if (sortBy === 'Visits') return b.visitCount - a.visitCount
        if (sortBy === 'Recent') return new Date(b.lastVisit) - new Date(a.lastVisit)
        return 0
    })

    // Paginate
    const startIdx = (pagination.page - 1) * pagination.rowsPerPage
    const customers = sortedCustomers.slice(startIdx, startIdx + pagination.rowsPerPage)

    // Update total count for pagination display
    useEffect(() => {
        updatePagination({ total: sortedCustomers.length, page: 1 })
    }, [searchTerm, selectedCategory, sortBy, allCustomers])

    // Handle search (filtering is already reactive via searchTerm state)
    const handleSearch = () => {}

    // Handle key press for search
    const handleKeyPress = (e) => {
        if (e.key === 'Enter') {
            handleSearch()
        }
    }


    // Pagination helpers
    const totalPages = Math.ceil(pagination.total / pagination.rowsPerPage)
    const startRecord = (pagination.page - 1) * pagination.rowsPerPage + 1
    const endRecord = Math.min(pagination.page * pagination.rowsPerPage, pagination.total)

    const handlePageChange = (page) => {
        if (page >= 1 && page <= totalPages) {
            updatePagination({ page })
        }
    }

    // Format currency
    const formatCurrency = (amount) => {
        return new Intl.NumberFormat('en-IN', {
            style: 'currency',
            currency: 'INR',
            minimumFractionDigits: 2,
        }).format(amount)
    }

    // Get page numbers to display
    const getPageNumbers = () => {
        const pages = []
        if (totalPages <= 7) {
            for (let i = 1; i <= totalPages; i++) pages.push(i)
        } else {
            if (pagination.page <= 3) {
                pages.push(1, 2, 3, '...', totalPages - 1, totalPages)
            } else if (pagination.page >= totalPages - 2) {
                pages.push(1, 2, '...', totalPages - 2, totalPages - 1, totalPages)
            } else {
                pages.push(1, '...', pagination.page - 1, pagination.page, pagination.page + 1, '...', totalPages)
            }
        }
        return pages
    }

    // Handle view customer
    const handleViewCustomer = (customer) => {
        setSelectedCustomer(customer)
    }

    // ── Export — a structured, admin-readable workbook (same shape as the
    //   Payments report):
    //   • Sheet 1 "Summary"   — report meta, the filters that were applied,
    //                           headline KPIs, and breakdowns by category &
    //                           status.
    //   • Sheet 2 "Customers" — one tidy row per customer with visits,
    //                           spending, loyalty, wallet, allergies, etc.,
    //                           plus a TOTAL row.
    // Reflects the CURRENT search / category / sort so the file matches the
    // on-screen list. Money & counts stay numeric so Excel can sum/sort.
    const handleExport = async () => {
        const list = sortedCustomers
        if (!list.length) {
            toast.error('No customers to export for the current filters')
            return
        }

        const sum = (key) => list.reduce((s, c) => s + (Number(c[key]) || 0), 0)
        const totalSpending = sum('spending')
        const totalVisits = sum('visitCount')
        const totalPoints = sum('loyaltyPoints')
        const totalWallet = sum('walletBalance')
        const activeCount = list.filter(c => c.status === 'Active').length

        // Breakdown by category (VIP / Regular / New) & by status.
        const byCategory = {}
        const byStatus = {}
        list.forEach(c => {
            const cat = c.tagCategory || 'Uncategorised'
            byCategory[cat] = byCategory[cat] || { count: 0, spending: 0 }
            byCategory[cat].count += 1
            byCategory[cat].spending += Number(c.spending) || 0

            const st = c.status || 'Unknown'
            byStatus[st] = (byStatus[st] || 0) + 1
        })

        const now = new Date()
        const genStr = now.toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true })

        // ── Sheet 1: Summary ──
        const summaryAoA = [
            ['BestoDine — Customers (CRM) Report'],
            ['Generated on', genStr],
            [],
            ['Filters applied'],
            ['Search', searchTerm || '—'],
            ['Category', selectedCategory === 'Select Category' ? 'All' : selectedCategory],
            ['Sorted by', sortBy === 'Sort by' ? 'Default (none)' : sortBy],
            ['Customers in report', list.length],
            [],
            ['Headline metrics', 'Value'],
            ['Total customers', list.length],
            ['Active customers', activeCount],
            ['Inactive customers', list.length - activeCount],
            ['Total spending (₹)', totalSpending],
            ['Avg spending per customer (₹)', Math.round(totalSpending / list.length)],
            ['Total visits', totalVisits],
            ['Avg visits per customer', Math.round((totalVisits / list.length) * 10) / 10],
            ['Total loyalty points', totalPoints],
            ['Total wallet balance (₹)', totalWallet],
            [],
            ['By category', 'Count', 'Spending (₹)'],
            ...Object.entries(byCategory).map(([k, v]) => [k, v.count, v.spending]),
            [],
            ['By status', 'Count'],
            ...Object.entries(byStatus).map(([k, v]) => [k, v]),
        ]
        // xlsx (~400 KB) is fetched only when someone actually exports.
        let XLSX
        try {
            XLSX = await import('xlsx')
        } catch {
            toast.error('Could not load the Excel exporter. Check your connection and try again.')
            return
        }
        const wsSummary = XLSX.utils.aoa_to_sheet(summaryAoA)
        wsSummary['!cols'] = [{ wch: 32 }, { wch: 16 }, { wch: 14 }]

        // ── Sheet 2: Customers (one row each + TOTAL) ──
        const custAoA = [[
            'Sr.', 'Name', 'Email', 'Phone', 'Category', 'Status', 'Visits',
            'Total Spending (₹)', 'Avg / Visit (₹)', 'Loyalty Points',
            'Wallet Balance (₹)', 'Last Visit', 'Member Since', 'Allergies',
        ]]
        list.forEach((c, i) => {
            const visits = Number(c.visitCount) || 0
            const spend = Number(c.spending) || 0
            custAoA.push([
                i + 1,
                c.name || '',
                c.email || '',
                c.phone || '',
                c.tagCategory || '',
                c.status || '',
                visits,
                spend,
                visits > 0 ? Math.round(spend / visits) : 0,
                Number(c.loyaltyPoints) || 0,
                Number(c.walletBalance) || 0,
                c.lastVisit || '',
                c.memberSince || '',
                c.allergy || '',
            ])
        })
        custAoA.push([
            '', 'TOTAL', '', '', '', '', totalVisits, totalSpending, '', totalPoints, totalWallet, '', '', '',
        ])
        const wsCust = XLSX.utils.aoa_to_sheet(custAoA)
        wsCust['!cols'] = [
            { wch: 5 }, { wch: 20 }, { wch: 26 }, { wch: 14 }, { wch: 11 }, { wch: 10 },
            { wch: 8 }, { wch: 16 }, { wch: 13 }, { wch: 14 }, { wch: 16 }, { wch: 13 }, { wch: 14 }, { wch: 22 },
        ]

        const wb = XLSX.utils.book_new()
        XLSX.utils.book_append_sheet(wb, wsSummary, 'Summary')
        XLSX.utils.book_append_sheet(wb, wsCust, 'Customers')
        XLSX.writeFile(wb, `Customers_Report_${now.toISOString().split('T')[0]}.xlsx`)
        toast.success(`Exported ${list.length} customer${list.length === 1 ? '' : 's'}`)
    }

    // If customer is selected, show detail view
    if (selectedCustomer) {
        return (
            <CustomerDetailView
                customer={selectedCustomer}
                onBack={() => setSelectedCustomer(null)}
            />
        )
    }

    return (
        <div className="h-full flex flex-col">
            {/* Header Row */}
            <div className="flex items-start justify-between mb-6 mt-[10px]">
                <div>
                    <h1 className="font-manrope font-[700] text-[20px] leading-[26px] text-[#1A181B]">Customer Management</h1>
                    <p className="font-manrope font-[600] text-[16px] leading-[22px] text-[#645E66] mt-1">Manage customers, engagement, and loyalty</p>
                </div>
                <button
                    onClick={handleExport}
                    className="flex items-center gap-2 px-5 py-2.5 bg-[#FE8301] text-white rounded-[12px] text-[16px] font-manrope font-[600] hover:bg-orange-600 transition-colors shadow-sm"
                >
                    <Download size={20} />
                    Export
                </button>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-4 gap-4 mb-6">
                <div className="bg-white rounded-[16px] border border-[#DDDDDD] p-5">
                    <p className="text-[12px] font-manrope font-[600] text-[#6B7280] uppercase tracking-wide">Total Customers</p>
                    <p className="text-[28px] font-manrope font-[600] text-[#1A181B] mt-1">{(stats.totalCustomers || 0).toLocaleString()}</p>
                </div>
                <div className="bg-white rounded-[16px] border border-[#DDDDDD] p-5">
                    <p className="text-[12px] font-manrope font-[600] text-[#6B7280] uppercase tracking-wide">Active Customers</p>
                    <p className="text-[28px] font-manrope font-[600] text-[#1A181B] mt-1">
                        {stats.activeCustomers.toLocaleString()}
                        <span className="text-[14px] font-[400] text-[#6B7280] ml-1">({stats.loggedIn} logged-in)</span>
                    </p>
                </div>
                <div className="bg-white rounded-[16px] border border-[#DDDDDD] p-5">
                    <p className="text-[12px] font-manrope font-[600] text-[#6B7280] uppercase tracking-wide">Guest Users</p>
                    <p className="text-[28px] font-manrope font-[600] text-[#1A181B] mt-1">{stats.guestUsers.toLocaleString()}</p>
                </div>
                <div className="bg-white rounded-[16px] border border-[#DDDDDD] p-5">
                    <p className="text-[12px] font-manrope font-[600] text-[#6B7280] uppercase tracking-wide">New This Week</p>
                    <p className="text-[28px] font-manrope font-[600] text-[#1A181B] mt-1">{String(stats.newCustomers).padStart(2, '0')}</p>
                </div>
            </div>

            {/* Search & Filters Row */}
            <div className="flex flex-wrap items-center gap-3 mb-6 bg-white p-4 rounded-xl border border-gray-100 shadow-sm">
                <div className="flex-1 relative">
                    <Search size={20} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                        type="text"
                        placeholder="Search by name or mobile.."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        onKeyPress={handleKeyPress}
                        className="w-full pl-12 pr-4 py-3 bg-white border border-gray-200 rounded-xl focus:outline-none focus:border-orange-500 font-inter font-medium text-[14px] leading-[20px] focus:ring-2 focus:ring-orange-500/10 transition-all placeholder:text-gray-400"
                    />
                </div>
                <button
                    onClick={handleSearch}
                    className="w-10 h-10 flex items-center justify-center bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors"
                >
                    <Search size={24} />
                </button>

                {/* Sort By */}
                <div className="relative" ref={sortDdRef}>
                    <button
                        onClick={() => {
                            setShowSortDropdown(!showSortDropdown);
                            setShowCategoryDropdown(false);
                            setShowRowsDropdown(false);
                        }}
                        className={`flex items-center gap-2 px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm font-medium text-gray-600 font-manrope font-semibold hover:border-gray-300 hover:bg-gray-50 transition-all min-w-[130px] ${showSortDropdown ? 'ring-2 ring-orange-100 border-orange-200' : ''}`}
                    >
                        {sortBy}
                        <ChevronDown size={16} className={`text-gray-400 transition-transform duration-200 ml-auto ${showSortDropdown ? 'rotate-180' : ''}`} />
                    </button>

                    {/* Dropdown Menu */}
                    {showSortDropdown && (
                        <div className="absolute top-full right-0 mt-2 w-[180px] bg-white rounded-2xl shadow-[0px_4px_20px_0px_rgba(0,0,0,0.08)] border border-gray-100 z-20 animate-in fade-in zoom-in-95 duration-200 overflow-hidden">
                            {['Sort by', 'Name', 'Spending', 'Visits', 'Recent'].map((option, index) => (
                                <div key={option}>
                                    <button
                                        onClick={() => {
                                            setSortBy(option)
                                            setShowSortDropdown(false)
                                        }}
                                        className={`w-full text-left px-5 py-2.5 text-sm font-medium text-gray-600 font-manrope transition-colors ${sortBy === option ? 'bg-[#FE8301] !text-white' : 'text-gray-600 hover:bg-[#FE8301] hover:!text-white'}`}
                                    >
                                        {option}
                                    </button>
                                    {index === 0 && <div className="h-[1px] bg-gray-100 mx-4 my-1"></div>}
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Category Filter */}
                <div className="relative" ref={categoryDdRef}>
                    <button
                        onClick={() => {
                            setShowCategoryDropdown(!showCategoryDropdown);
                            setShowSortDropdown(false);
                            setShowRowsDropdown(false);
                        }}
                        className={`flex items-center gap-2 px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm font-medium text-gray-600 font-manrope font-semibold hover:border-gray-300 hover:bg-gray-50 transition-all min-w-[150px] ${showCategoryDropdown ? 'ring-2 ring-orange-100 border-orange-200' : ''}`}
                    >
                        {selectedCategory}
                        <ChevronDown size={16} className={`text-gray-400 transition-transform duration-200 ml-auto ${showCategoryDropdown ? 'rotate-180' : ''}`} />
                    </button>

                    {/* Dropdown Menu */}
                    {showCategoryDropdown && (
                        <div className="absolute top-full right-0 mt-2 w-[180px] bg-white rounded-2xl shadow-[0px_4px_20px_0px_rgba(0,0,0,0.08)] border border-gray-100 z-20 animate-in fade-in zoom-in-95 duration-200 overflow-hidden">
                            {['Select Category', 'VIP', 'Regular', 'New'].map((category, index) => (
                                <div key={category}>
                                    <button
                                        onClick={() => {
                                            setSelectedCategory(category)
                                            setShowCategoryDropdown(false)
                                        }}
                                        className={`w-full text-left px-5 py-2.5 text-sm font-medium text-gray-600 font-manrope transition-colors ${selectedCategory === category ? 'bg-[#FE8301] !text-white' : 'text-gray-600 hover:bg-[#FE8301] hover:!text-white'}`}
                                    >
                                        {category}
                                    </button>
                                    {index < 3 && <div className="h-[1px] bg-gray-100 mx-4 my-1"></div>}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* Customer Table */}
            <div className="flex-1 overflow-hidden">
                {loading ? (
                    <SkeletonRows count={8} className="px-4" />
                ) : customers.length === 0 ? (
                    <div className="text-center py-20 text-gray-400">
                        <User size={48} className="mx-auto mb-3 opacity-50" />
                        <p className="text-[16px] font-[600]">No customers found</p>
                    </div>
                ) : (
                <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                    <table className="w-full text-left border-collapse">
                        <thead className="bg-[#F8F9FA] text-[12px] uppercase text-gray-500 font-[600] border-b border-gray-200">
                            <tr>
                                <th className="px-4 py-4">Sr. No.</th>
                                <th className="px-4 py-4">Customer name</th>
                                <th className="px-4 py-4">Contact</th>
                                <th className="px-4 py-4">Activity</th>
                                <th className="px-4 py-4">Spending<span className="text-[10px] normal-case text-gray-400 ml-1">(Lifetime Total)</span></th>
                                <th className="px-4 py-4">Tags/ Category</th>
                                <th className="px-4 py-4">Status</th>
                                <th className="px-4 py-4 text-center">Action</th>
                            </tr>
                        </thead>
                        <tbody className="text-[14px] text-gray-700">
                            {customers.map((customer, index) => (
                                <tr key={customer.id + index} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                                    <td className="px-4 py-4 font-[600] text-gray-400">
                                        {String((pagination.page - 1) * pagination.rowsPerPage + index + 1).padStart(2, '0')}
                                    </td>
                                    <td className="px-4 py-4">
                                        <div className="flex items-center gap-3">
                                            {customer.avatar ? (
                                                <img
                                                    src={customer.avatar}
                                                    alt={customer.name}
                                                    className="w-10 h-10 rounded-full object-cover"
                                                />
                                            ) : (
                                                <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center">
                                                    <User size={20} className="text-gray-400" />
                                                </div>
                                            )}
                                            <span className="font-[600] text-[#1A181B]">{customer.name}</span>
                                        </div>
                                    </td>
                                    <td className="px-4 py-4">
                                        <div>
                                            <p className="font-[500] text-[#1A181B]">{customer.phone}</p>
                                            <p className="text-[12px] text-gray-400">{customer.email}</p>
                                        </div>
                                    </td>
                                    <td className="px-4 py-4">
                                        <div>
                                            <p className="font-[500] text-[#1A181B]">{customer.visitCount} visits</p>
                                            <p className="text-[12px] text-gray-400">Last: {customer.lastVisit}</p>
                                        </div>
                                    </td>
                                    <td className="px-4 py-4 font-[600] text-[#1A181B]">
                                        {formatCurrency(customer.spending)}
                                    </td>
                                    <td className="px-4 py-4">
                                        <span className={`px-3 py-1 rounded-full text-[12px] font-[600] border ${tagStyles[customer.tagCategory]}`}>
                                            {customer.tagCategory}
                                        </span>
                                    </td>
                                    <td className="px-4 py-4">
                                        <span className={`px-3 py-1 rounded-full text-[12px] font-[600] border ${statusStyles[customer.status]}`}>
                                            {customer.status}
                                        </span>
                                    </td>
                                    <td className="px-4 py-4">
                                        <div className="flex items-center justify-center">
                                            <button
                                                onClick={() => handleViewCustomer(customer)}
                                                className="p-2 text-gray-400 hover:text-orange-500 transition-colors rounded-lg hover:bg-orange-50"
                                                title="View Details"
                                            >
                                                <Eye size={24} />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                )}
            </div>

            {/* Pagination */}
            <div className="flex items-center justify-center gap-4 mt-6 py-4">
                {/* Page Navigation */}
                <div className="flex items-center gap-1">
                    <button
                        onClick={() => handlePageChange(pagination.page - 1)}
                        disabled={pagination.page === 1}
                        className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <ChevronLeft size={18} />
                    </button>

                    {getPageNumbers().map((page, idx) => (
                        <button
                            key={idx}
                            onClick={() => page !== '...' && handlePageChange(page)}
                            disabled={page === '...'}
                            className={`w-8 h-8 flex items-center justify-center rounded-lg text-[14px] font-[500] transition-colors ${page === pagination.page
                                ? 'bg-[#FE8301] text-white'
                                : page === '...'
                                    ? 'text-gray-400 cursor-default'
                                    : 'text-gray-600 hover:bg-gray-100'
                                }`}
                        >
                            {page}
                        </button>
                    ))}

                    <button
                        onClick={() => handlePageChange(pagination.page + 1)}
                        disabled={pagination.page === totalPages}
                        className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <ChevronRight size={18} />
                    </button>
                </div>

                {/* Rows per page */}
                <div className="flex items-center gap-2 text-[14px] text-gray-500 relative">
                    <span>Rows per page</span>
                    <button
                        onClick={() => {
                            setShowRowsDropdown(!showRowsDropdown);
                            setShowSortDropdown(false);
                            setShowCategoryDropdown(false);
                        }}
                        className={`flex items-center gap-2 px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-[14px] text-gray-700 focus:outline-none hover:border-gray-300 hover:bg-gray-50 transition-all font-[500] ${showRowsDropdown ? 'ring-2 ring-orange-100 border-orange-200' : ''}`}
                    >
                        {pagination.rowsPerPage}
                        <ChevronDown size={14} className={`text-gray-400 transition-transform duration-200 ${showRowsDropdown ? 'rotate-180' : ''}`} />
                    </button>

                    {/* Dropdown Menu */}
                    {showRowsDropdown && (
                        <div className="absolute bottom-full left-0 mb-2 w-[100px] bg-white rounded-2xl shadow-[0px_4px_20px_0px_rgba(0,0,0,0.08)] border border-gray-100 z-20 animate-in fade-in zoom-in-95 duration-200 overflow-hidden">
                            {[10, 25, 50].map((rows, index) => (
                                <div key={rows}>
                                    <button
                                        onClick={() => {
                                            updatePagination({ rowsPerPage: rows, page: 1 })
                                            setShowRowsDropdown(false)
                                        }}
                                        className={`w-full text-left px-5 py-2.5 text-sm font-medium text-gray-600 font-manrope transition-colors ${pagination.rowsPerPage === rows ? 'bg-[#FE8301] !text-white' : 'text-gray-600 hover:bg-[#FE8301] hover:!text-white'}`}
                                    >
                                        {rows}
                                    </button>
                                    {index < 2 && <div className="h-[1px] bg-gray-100 mx-4 my-1"></div>}
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Record count */}
                <span className="text-[14px] text-gray-500">
                    {startRecord}-{endRecord} of {pagination.total}
                </span>
            </div>
        </div>
    )
}

export default CRMDashboard

