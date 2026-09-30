import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import {
    Search, Plus, ChevronDown, ChevronLeft, ChevronRight, Package, AlertTriangle, XCircle, TrendingUp,
    Eye, Pencil, Trash2, ArrowUpDown, ChefHat,
    CalendarClock, Upload, ListFilter, TrendingDown,
    Building2, Truck, CookingPot, FileBarChart,
} from 'lucide-react'
import { toast } from 'react-hot-toast'
import { useLocation } from 'react-router-dom'
import api, { inventoryAPI } from '../../utils/api'
import { useInventoryList } from '../../hooks/queries/adminQueries'
import { SkeletonStatGrid, SkeletonRows } from '../../Components/Common/Skeleton'
import AddInventoryModal from './components/AddInventoryModal'
import StockAdjustmentModal from './components/StockAdjustmentModal'
import InventoryDetailDrawer from './components/InventoryDetailDrawer'
import ConfirmModal from './components/ConfirmModal'
import RecipeModal from './components/RecipeModal'
import BulkImportInventoryModal from './components/BulkImportInventoryModal'
import BulkImportRecipesModal from './components/BulkImportRecipesModal'
import SuppliersTab from './components/SuppliersTab'
import PurchasesTab from './components/PurchasesTab'
import ProductionTab from './components/ProductionTab'
import InventoryReports from './components/InventoryReports'

// ─── Constants ───────────────────────────────────────────────────────────────
const CATEGORIES = [
    'All', 'Raw Ingredients', 'Beverages', 'Dairy & Eggs', 'Spices & Seasonings',
    'Packaging', 'Cleaning Supplies', 'Kitchen Equipment', 'Bakery Items',
    'Fruits & Vegetables', 'Frozen Goods', 'Oils & Sauces', 'Other'
]

const STATUS_FILTERS = [
    { value: 'all', label: 'All Status' },
    { value: 'in-stock', label: 'In Stock' },
    { value: 'low-stock', label: 'Low Stock' },
    { value: 'out-of-stock', label: 'Out of Stock' },
    { value: 'expiring', label: 'Expiring Soon' },
]

const statusBadge = {
    'in-stock':     'bg-[#E8FFF0] text-[#34C759] border-[#34C759]',
    'low-stock':    'bg-[#FFF8E1] text-[#F59E0B] border-[#F59E0B]',
    'out-of-stock': 'bg-[#FFF0F0] text-[#EF4444] border-[#EF4444]',
}

const TABS = [
    { id: 'stock', label: 'Stock', icon: Package },
    { id: 'recipes', label: 'Recipes', icon: ChefHat },
    { id: 'suppliers', label: 'Suppliers', icon: Building2 },
    { id: 'purchases', label: 'Purchases', icon: Truck },
    { id: 'production', label: 'Production', icon: CookingPot },
    { id: 'reports', label: 'Reports', icon: FileBarChart },
]

// ─── Main Component ─────────────────────────────────────────────────────────
const Inventory = () => {
    const [activeTab, setActiveTab] = useState('stock')

    // Stock tab state — items / summary / pagination are read off the
    // useInventoryList query below; only the filter inputs remain local.
    const [searchTerm, setSearchTerm] = useState('')
    const [debouncedSearch, setDebouncedSearch] = useState('')
    const [categoryFilter, setCategoryFilter] = useState('All')
    const [statusFilter, setStatusFilter] = useState('all')
    const [showStatusDropdown, setShowStatusDropdown] = useState(false)
    const [sortBy, setSortBy] = useState('createdAt')
    const [sortOrder, setSortOrder] = useState('desc')
    const [page, setPage] = useState(1)
    const [limit] = useState(8)

    // Modals
    const [showAddModal, setShowAddModal] = useState(false)
    const [showBulkImportModal, setShowBulkImportModal] = useState(false)
    const [showBulkImportRecipesModal, setShowBulkImportRecipesModal] = useState(false)
    const [editingItem, setEditingItem] = useState(null)
    const [adjustingItem, setAdjustingItem] = useState(null)
    const [viewingItemId, setViewingItemId] = useState(null)
    const [deleteConfirm, setDeleteConfirm] = useState(null)

    // Recipe tab state
    const [recipes, setRecipes] = useState([])
    const [recipesLoading, setRecipesLoading] = useState(false)
    // Recipes table pagination — render one page at a time, not the whole list.
    const [rcPage, setRcPage] = useState(1)
    const RC_PER_PAGE = 8
    const [recipeMenuItem, setRecipeMenuItem] = useState(null) // opens RecipeModal
    const location = useLocation()
    const wantRecipeRef = useRef(null) // menuItemId to auto-open from a deep link
    const [menuItems, setMenuItems] = useState([])
    const [menuSearch, setMenuSearch] = useState('')
    const [showMenuPicker, setShowMenuPicker] = useState(false)

    const statusDdRef = useRef(null)
    const menuPickerRef = useRef(null)

    // Close dropdowns on outside click
    useEffect(() => {
        const handler = (e) => {
            if (statusDdRef.current && !statusDdRef.current.contains(e.target)) setShowStatusDropdown(false)
            if (menuPickerRef.current && !menuPickerRef.current.contains(e.target)) { setShowMenuPicker(false); setMenuSearch('') }
        }
        document.addEventListener('mousedown', handler)
        return () => document.removeEventListener('mousedown', handler)
    }, [])

    // Debounce the search input — otherwise every keystroke hits /inventory.
    useEffect(() => {
        const t = setTimeout(() => setDebouncedSearch(searchTerm.trim()), 350)
        return () => clearTimeout(t)
    }, [searchTerm])

    // Reset to page 1 when any filter changes (otherwise the user lands on
    // an empty page when the narrowed result has fewer pages).
    useEffect(() => { setPage(1) }, [debouncedSearch, categoryFilter, statusFilter, sortBy, sortOrder])

    // ── Stock list + summary (single React Query) ───────────────────────────
    // Filter combos are part of the cache key, so flipping back to a
    // previously-loaded combo paints from cache instantly. `fetchItems`
    // is kept as a refetch shim so the existing post-mutation refresh
    // sites (modal closes, stock adjustments, etc.) still work.
    const {
        data: stockData,
        isLoading,
        isError,
        refetch: refetchStock,
    } = useInventoryList({
        page,
        limit,
        search: debouncedSearch,
        category: categoryFilter,
        status: statusFilter,
        sortBy,
        sortOrder,
    })
    const items = useMemo(() => stockData?.items ?? [], [stockData?.items])
    const summary = stockData?.summary ?? null
    const pagination = useMemo(
        () => stockData?.pagination ?? { total: 0, pages: 1 },
        [stockData?.pagination],
    )
    const loading = isLoading
    const fetchItems = useCallback(() => { refetchStock() }, [refetchStock])
    useEffect(() => {
        if (isError) toast.error('Failed to load inventory data')
    }, [isError])

    // ── Fetch recipes + menu items ───────────────────────────────────────────
    const fetchRecipes = useCallback(async () => {
        setRecipesLoading(true)
        try {
            const [recipesRes, menuRes] = await Promise.all([
                inventoryAPI.getRecipes(),
                api.get('/menu', { params: { limit: 200 } }),
            ])
            if (recipesRes.data.success) setRecipes(recipesRes.data.recipes || [])
            if (menuRes.data.success) setMenuItems(menuRes.data.data || [])
        } catch { toast.error('Failed to load recipes') }
        finally { setRecipesLoading(false) }
    }, [])

    // Load tab data on switch
    useEffect(() => {
        if (activeTab === 'recipes') fetchRecipes()
    }, [activeTab, fetchRecipes])

    // Deep-link support — the Menu page's "Fix" buttons link here with
    // ?tab=recipes&recipe=<menuItemId> (open that recipe) or
    // ?tab=stock&status=low-stock (pre-filter the stock list).
    useEffect(() => {
        const q = new URLSearchParams(location.search)
        const tab = q.get('tab')
        const status = q.get('status')
        if (tab && ['stock', 'recipes'].includes(tab)) setActiveTab(tab)
        if (status) setStatusFilter(status)
        wantRecipeRef.current = q.get('recipe') || null
    }, [location.search])

    // Once the recipes list has loaded, auto-open the requested recipe editor.
    useEffect(() => {
        if (!wantRecipeRef.current || activeTab !== 'recipes' || recipesLoading || recipes.length === 0) return
        const match = recipes.find(r => String(r.menuItem?._id || '') === wantRecipeRef.current)
        if (match) {
            setRecipeMenuItem(match.menuItem)
            wantRecipeRef.current = null
        }
    }, [recipes, recipesLoading, activeTab])

    // ── Handlers ─────────────────────────────────────────────────────────────
    const handleAddSubmit = async (payload) => {
        try {
            let res
            if (editingItem) res = await inventoryAPI.update(editingItem._id, payload)
            else res = await inventoryAPI.create(payload)
            if (res.data.success) {
                fetchItems()
                setShowAddModal(false)
                setEditingItem(null)
                toast.success(editingItem ? 'Item updated' : 'Item added')
            }
        } catch (err) { toast.error(err.response?.data?.message || 'Failed to save item') }
    }

    const handleAdjustSubmit = async (data) => {
        try {
            const res = await inventoryAPI.adjustStock(adjustingItem._id, data)
            if (res.data.success) {
                fetchItems()
                setAdjustingItem(null)
                toast.success('Stock adjusted')
            }
        } catch (err) { toast.error(err.response?.data?.message || 'Failed to adjust stock') }
    }

    const handleDelete = async () => {
        if (!deleteConfirm) return
        try {
            const res = await inventoryAPI.delete(deleteConfirm._id)
            if (res.data.success) {
                fetchItems()
                setDeleteConfirm(null)
                setViewingItemId(null)
                toast.success('Item deleted')
            }
        } catch (err) { toast.error(err.response?.data?.message || 'Failed to delete') }
    }

    const handleSort = (field) => {
        if (sortBy === field) setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')
        else { setSortBy(field); setSortOrder('asc') }
    }

    // Recipes table pagination (client-side over the fetched list).
    useEffect(() => { setRcPage(1) }, [recipes])
    const rcTotalPages = Math.max(1, Math.ceil(recipes.length / RC_PER_PAGE))
    const rcPageSafe = Math.min(rcPage, rcTotalPages)
    const pagedRecipes = recipes.slice((rcPageSafe - 1) * RC_PER_PAGE, rcPageSafe * RC_PER_PAGE)

    // ─── Render ──────────────────────────────────────────────────────────────
    return (
        <>
            <div className="h-full flex flex-col overflow-hidden">
                {/* Header */}
                <div className="flex items-center justify-between mb-3 shrink-0">
                    <h1 className="font-manrope font-bold text-xl text-[#1A181B]">Inventory Management</h1>
                    <div className="flex items-center gap-3">
                        {/* ADM-083 — bulk CSV import. Stock and Recipes tabs each
                            have their own master-template flow. */}
                        {activeTab === 'stock' && (
                            <button
                                onClick={() => setShowBulkImportModal(true)}
                                className="flex items-center gap-2 px-4 py-2.5 border border-[#FE8301] text-[#FE8301] rounded-xl text-sm font-semibold hover:bg-orange-50 transition"
                            >
                                <Upload size={18} />
                                Import CSV
                            </button>
                        )}
                        {activeTab === 'recipes' && (
                            <button
                                onClick={() => setShowBulkImportRecipesModal(true)}
                                className="flex items-center gap-2 px-4 py-2.5 border border-[#FE8301] text-[#FE8301] rounded-xl text-sm font-semibold hover:bg-orange-50 transition"
                            >
                                <Upload size={18} />
                                Import CSV
                            </button>
                        )}
                        {activeTab === 'stock' && (
                            <button
                                onClick={() => { setEditingItem(null); setShowAddModal(true) }}
                                className="flex items-center gap-2 px-5 py-2.5 bg-[#FE8301] text-white rounded-xl text-sm font-semibold hover:bg-orange-600 transition shadow-sm"
                            >
                                <Plus size={18} />
                                Add Item
                            </button>
                        )}
                    </div>
                </div>

                {/* Summary Cards — only on the Stock tab. The three status
                    cards (Low Stock / Out of Stock / Expiring Soon) are
                    clickable filters; Total Items & In Stock are plain stats. */}
                {summary && activeTab === 'stock' && (
                  <>
                    <div className="flex items-center gap-1.5 mb-2 text-[11px] font-medium text-gray-400">
                        <ListFilter size={12} className="text-[#FE8301]" />
                        Tip: click the Low&nbsp;Stock, Out&nbsp;of&nbsp;Stock or Expiring&nbsp;Soon card to filter the list
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-4 shrink-0">
                        <SummaryCard icon={Package} label="Total Items" value={summary.totalItems} color="text-[#702083]" bg="bg-[#702083]/10" />
                        <SummaryCard icon={TrendingUp} label="In Stock" value={summary.inStock} color="text-[#34C759]" bg="bg-[#34C759]/10" />
                        <SummaryCard icon={AlertTriangle} label="Low Stock" value={summary.lowStock} color="text-[#F59E0B]" bg="bg-[#F59E0B]/10"
                            active={statusFilter === 'low-stock'} onClick={() => setStatusFilter(s => s === 'low-stock' ? 'all' : 'low-stock')} />
                        <SummaryCard icon={XCircle} label="Out of Stock" value={summary.outOfStock} color="text-[#EF4444]" bg="bg-[#EF4444]/10"
                            active={statusFilter === 'out-of-stock'} onClick={() => setStatusFilter(s => s === 'out-of-stock' ? 'all' : 'out-of-stock')} />
                        <SummaryCard icon={CalendarClock} label="Expiring Soon" value={summary.expiringSoon || 0} color="text-[#F97316]" bg="bg-[#F97316]/10"
                            active={statusFilter === 'expiring'} onClick={() => setStatusFilter(s => s === 'expiring' ? 'all' : 'expiring')} />
                    </div>
                    {/* Today's activity — consumption (auto order-deductions +
                        manual usage) and wastage, valued at cost. Read from
                        the same summary payload (Spec 10.2). */}
                    <div className="grid grid-cols-2 gap-3 mb-4 shrink-0">
                        <SummaryCard
                            icon={TrendingDown}
                            label={`Today's Consumption${summary.todayConsumptionCount ? ` · ${summary.todayConsumptionCount} entries` : ''}`}
                            value={`₹${(summary.todayConsumption || 0).toLocaleString('en-IN')}`}
                            color="text-[#0EA5E9]" bg="bg-[#0EA5E9]/10" />
                        <SummaryCard
                            icon={Trash2}
                            label={`Wastage Today${summary.todayWastageCount ? ` · ${summary.todayWastageCount} entries` : ''}`}
                            value={`₹${(summary.todayWastage || 0).toLocaleString('en-IN')}`}
                            color="text-[#EF4444]" bg="bg-[#EF4444]/10" />
                    </div>
                  </>
                )}

                {/* Tabs */}
                <div className="flex items-center gap-1 bg-white rounded-xl border border-gray-100 p-1 mb-4 shrink-0 w-fit shadow-sm">
                    {TABS.map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold rounded-lg transition ${
                                activeTab === tab.id
                                    ? 'bg-[#FE8301] text-white shadow-sm'
                                    : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                            }`}
                        >
                            <tab.icon size={15} />
                            {tab.label}
                        </button>
                    ))}
                </div>

                {/* ═══ STOCK TAB ═══ */}
                {activeTab === 'stock' && (
                    <>
                        {/* Category pills — hidden when this branch has
                            zero inventory items. The chips are filter
                            controls; rendering them on an empty list
                            implied "data is here / hidden by filter"
                            (a branch admin who'd just created their
                            branch reported it as a leak signal). Keying
                            on summary.totalItems (server-side total,
                            ignores search + category filters) means the
                            chips reappear the moment the first item is
                            added. */}
                        {summary?.totalItems > 0 && (
                            <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar mb-4 shrink-0">
                                {CATEGORIES.map((cat) => (
                                    <button
                                        key={cat}
                                        onClick={() => setCategoryFilter(cat)}
                                        className={`px-4 py-1.75 rounded-full border text-[13px] font-semibold transition-all whitespace-nowrap ${categoryFilter === cat
                                            ? 'bg-white text-[#702083] border-[#702083] border-[1.5px] shadow-[0px_2px_8px_0px_#00000029]'
                                            : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'
                                        }`}
                                    >
                                        {cat}
                                    </button>
                                ))}
                            </div>
                        )}

                        {/* Search & filter bar */}
                        <div className="flex flex-wrap items-center gap-3 mb-4 bg-white p-4 rounded-xl border border-gray-100 shadow-sm shrink-0">
                            <div className="flex-1 relative">
                                <Search size={20} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                                <input
                                    type="text"
                                    placeholder="Search by item name, ID, or supplier..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className="w-full pl-12 pr-4 py-3 bg-white border border-gray-200 rounded-xl focus:outline-none focus:border-orange-500 text-sm font-medium focus:ring-2 focus:ring-orange-500/10 transition placeholder:text-gray-400"
                                />
                            </div>
                            <button onClick={fetchItems} className="w-10 h-10 flex items-center justify-center bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition">
                                <Search size={20} />
                            </button>

                            {/* Status dropdown */}
                            <div className="relative" ref={statusDdRef}>
                                <button
                                    onClick={() => setShowStatusDropdown(!showStatusDropdown)}
                                    className={`flex items-center gap-2 px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm font-medium text-gray-500 transition min-w-35 ${showStatusDropdown ? 'ring-2 ring-orange-100 border-orange-200' : ''}`}
                                >
                                    {STATUS_FILTERS.find(s => s.value === statusFilter)?.label}
                                    <ChevronDown size={16} className={`text-gray-400 ml-auto transition-transform ${showStatusDropdown ? 'rotate-180' : ''}`} />
                                </button>
                                {showStatusDropdown && (
                                    <div className="absolute top-full right-0 mt-2 w-45 bg-white rounded-2xl shadow-lg border border-gray-100 z-20 overflow-hidden">
                                        {STATUS_FILTERS.map((s, i) => (
                                            <div key={s.value}>
                                                <button
                                                    onClick={() => { setStatusFilter(s.value); setShowStatusDropdown(false) }}
                                                    className={`w-full text-left px-5 py-2.5 text-sm font-medium transition ${statusFilter === s.value ? 'bg-[#FE8301] text-white' : 'text-gray-600 hover:bg-[#FE8301] hover:text-white'}`}
                                                >
                                                    {s.label}
                                                </button>
                                                {i < STATUS_FILTERS.length - 1 && <div className="h-px bg-gray-100 mx-4" />}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Stock table */}
                        <div className="flex-1 min-h-0">
                            <div className="bg-white rounded-xl border border-gray-200 h-full flex flex-col">
                                <div className="flex-1 min-h-0 overflow-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
                                    <table className="w-full text-left border-collapse">
                                        <thead className="bg-[#F8F9FA] text-xs text-gray-500 font-semibold border-b border-gray-200 sticky top-0 z-10">
                                            <tr>
                                                <th className="px-4 py-4">Sr.</th>
                                                <th className="px-4 py-4"><SortHeader label="Item" field="name" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} /></th>
                                                <th className="px-4 py-4">Category</th>
                                                <th className="px-4 py-4"><SortHeader label="Stock" field="currentStock" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} /></th>
                                                <th className="px-4 py-4">Min Level</th>
                                                <th className="px-4 py-4"><SortHeader label="Cost/Unit" field="costPerUnit" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} /></th>
                                                <th className="px-4 py-4">Value</th>
                                                <th className="px-4 py-4">Status</th>
                                                <th className="px-4 py-4 text-center">Actions</th>
                                            </tr>
                                        </thead>
                                        <tbody className="text-sm text-gray-700">
                                            {loading ? (
                                                <tr><td colSpan={9} className="px-4 py-16 text-center"><div className="flex flex-col items-center gap-3"><div className="w-8 h-8 border-3 border-orange-500 border-t-transparent rounded-full animate-spin" /><span className="text-sm text-gray-400">Loading inventory...</span></div></td></tr>
                                            ) : items.length === 0 ? (
                                                <tr><td colSpan={9} className="px-4 py-16 text-center"><div className="flex flex-col items-center gap-2"><Package size={40} className="text-gray-300" /><p className="text-[15px] font-semibold text-gray-400">No inventory items found</p><p className="text-[13px] text-gray-400">Add your first item to get started</p></div></td></tr>
                                            ) : (
                                                items.map((item, index) => {
                                                    const stockPercent = item.minStock > 0 ? (item.currentStock / item.minStock) * 100 : 100
                                                    const stockBarColor = item.status === 'out-of-stock' ? 'bg-red-500' : item.status === 'low-stock' ? 'bg-amber-500' : 'bg-green-500'
                                                    const srNo = (page - 1) * limit + index + 1
                                                    return (
                                                        <tr key={item._id} className="border-b border-gray-100 hover:bg-gray-50 transition">
                                                            <td className="px-4 py-4 font-semibold text-gray-400">{String(srNo).padStart(2, '0')}</td>
                                                            <td className="px-4 py-4">
                                                                <p className="font-semibold text-[#1A181B]">{item.name}</p>
                                                                <p className="text-xs text-gray-400">{item.itemId}</p>
                                                            </td>
                                                            <td className="px-4 py-4"><span className="px-2.5 py-1 rounded-lg bg-gray-100 text-xs font-medium text-gray-600 whitespace-nowrap">{item.category}</span></td>
                                                            <td className="px-4 py-4">
                                                                <div className="min-w-25">
                                                                    <p className="font-semibold text-[#1A181B]">{item.currentStock} <span className="text-xs text-gray-400 font-normal">{item.unit}</span></p>
                                                                    <div className="w-full h-1.5 bg-gray-100 rounded-full mt-1.5 overflow-hidden">
                                                                        <div className={`h-full rounded-full transition-all ${stockBarColor}`} style={{ width: `${Math.min(stockPercent, 100)}%` }} />
                                                                    </div>
                                                                </div>
                                                            </td>
                                                            <td className="px-4 py-4 text-gray-500 font-medium">{item.minStock} {item.unit}</td>
                                                            <td className="px-4 py-4 text-gray-500 font-medium">₹{item.costPerUnit}</td>
                                                            <td className="px-4 py-4 font-semibold text-[#1A181B]">₹{(item.currentStock * item.costPerUnit).toFixed(2)}</td>
                                                            <td className="px-4 py-4">
                                                                <span className={`px-3 py-1 rounded-full text-xs font-semibold border whitespace-nowrap ${statusBadge[item.status]}`}>
                                                                    {item.status === 'in-stock' ? 'In Stock' : item.status === 'low-stock' ? 'Low Stock' : 'Out of Stock'}
                                                                </span>
                                                            </td>
                                                            <td className="px-4 py-4">
                                                                <div className="flex items-center justify-center gap-1">
                                                                    <button onClick={() => setAdjustingItem(item)} className="px-3 py-1.5 bg-[#FE8301]/10 text-[#FE8301] rounded-lg text-xs font-semibold hover:bg-[#FE8301]/20 transition whitespace-nowrap" title="Adjust Stock">Adjust</button>
                                                                    <button onClick={() => { setEditingItem(item); setShowAddModal(true) }} className="p-2 text-gray-400 hover:text-orange-500 rounded-lg hover:bg-orange-50 transition" title="Edit"><Pencil size={18} /></button>
                                                                    <button onClick={() => setViewingItemId(item._id)} className="p-2 text-gray-400 hover:text-orange-500 rounded-lg hover:bg-orange-50 transition" title="View Details"><Eye size={18} /></button>
                                                                    <button onClick={() => setDeleteConfirm(item)} className="p-2 text-gray-400 hover:text-red-500 rounded-lg hover:bg-red-50 transition" title="Delete"><Trash2 size={18} /></button>
                                                                </div>
                                                            </td>
                                                        </tr>
                                                    )
                                                })
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>

                        {(summary || pagination.total > 0) && (
                            <div className="mt-4 flex items-center justify-between bg-white rounded-xl border border-gray-200 px-5 py-3 shrink-0 gap-3 flex-wrap">
                                <div className="flex items-center gap-5">
                                    {summary && (
                                        <>
                                            <div className="flex items-center gap-2">
                                                <span className="text-xs font-medium text-gray-400 uppercase">Value</span>
                                                <span className="text-base font-bold text-[#1A181B]">₹{summary.totalValue?.toLocaleString('en-IN')}</span>
                                            </div>
                                            <span className="text-xs text-gray-300">·</span>
                                        </>
                                    )}
                                    <span className="text-xs font-medium text-gray-500">
                                        Showing {items.length === 0 ? 0 : (page - 1) * limit + 1}–{(page - 1) * limit + items.length} of {pagination.total}
                                    </span>
                                </div>
                                {pagination.pages > 1 && (
                                    <div className="flex items-center gap-1">
                                        <button
                                            onClick={() => setPage(p => Math.max(1, p - 1))}
                                            disabled={page === 1}
                                            className="p-2 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition"
                                            aria-label="Previous page"
                                        >
                                            <ChevronLeft size={16} />
                                        </button>
                                        {buildPageList(page, pagination.pages).map((p, i) => (
                                            p === '…' ? (
                                                <span key={`e${i}`} className="px-2 text-xs text-gray-400 select-none">…</span>
                                            ) : (
                                                <button
                                                    key={p}
                                                    onClick={() => setPage(p)}
                                                    className={`min-w-[32px] h-8 px-2 rounded-lg text-xs font-semibold transition ${
                                                        p === page ? 'bg-[#FE8301] text-white' : 'border border-gray-200 text-gray-600 hover:bg-gray-50'
                                                    }`}
                                                >
                                                    {p}
                                                </button>
                                            )
                                        ))}
                                        <button
                                            onClick={() => setPage(p => Math.min(pagination.pages, p + 1))}
                                            disabled={page >= pagination.pages}
                                            className="p-2 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition"
                                            aria-label="Next page"
                                        >
                                            <ChevronRight size={16} />
                                        </button>
                                    </div>
                                )}
                            </div>
                        )}
                    </>
                )}

                {/* ═══ RECIPES TAB ═══ */}
                {activeTab === 'recipes' && (
                    <div className="flex-1 min-h-0 overflow-auto">
                        {/* Header with Create Recipe button */}
                        <div className="flex items-center justify-between mb-4 shrink-0">
                            <p className="text-sm text-gray-500">
                                Link menu items to inventory ingredients for auto-deduction and food cost tracking.
                            </p>
                            <div className="relative" ref={menuPickerRef}>
                                <button
                                    onClick={() => setShowMenuPicker(!showMenuPicker)}
                                    className="flex items-center gap-2 px-4 py-2.5 bg-[#FE8301] text-white rounded-xl text-sm font-semibold hover:bg-orange-600 transition shadow-sm"
                                >
                                    <Plus size={16} />
                                    Create Recipe
                                </button>

                                {/* Menu item picker dropdown */}
                                {showMenuPicker && (
                                    <div className="absolute right-0 top-full mt-2 w-[360px] bg-white rounded-2xl shadow-xl border border-gray-100 z-30 overflow-hidden">
                                        <div className="px-4 pt-4 pb-2">
                                            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Select a Menu Item</p>
                                            <div className="relative">
                                                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                                                <input
                                                    type="text"
                                                    value={menuSearch}
                                                    onChange={e => setMenuSearch(e.target.value)}
                                                    placeholder="Search menu items..."
                                                    autoFocus
                                                    className="w-full pl-8 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-[#FE8301] placeholder:text-gray-300"
                                                />
                                            </div>
                                        </div>
                                        <div className="max-h-[280px] overflow-y-auto px-2 pb-2">
                                            {(() => {
                                                const recipeMenuIds = new Set(recipes.map(r => r.menuItem?._id))
                                                const filtered = menuItems
                                                    .filter(m => !recipeMenuIds.has(m._id))
                                                    .filter(m => !menuSearch.trim() || m.name.toLowerCase().includes(menuSearch.toLowerCase()))
                                                if (filtered.length === 0) {
                                                    return (
                                                        <p className="text-xs text-gray-400 text-center py-6">
                                                            {menuItems.length === 0 ? 'No menu items found' : 'All menu items already have recipes'}
                                                        </p>
                                                    )
                                                }
                                                return filtered.slice(0, 15).map(m => (
                                                    <button
                                                        key={m._id}
                                                        onClick={() => {
                                                            setRecipeMenuItem(m)
                                                            setShowMenuPicker(false)
                                                            setMenuSearch('')
                                                        }}
                                                        className="w-full text-left px-3 py-2.5 rounded-xl text-sm hover:bg-orange-50 transition flex items-center justify-between group"
                                                    >
                                                        <div className="flex items-center gap-3 min-w-0">
                                                            {m.images?.[0] ? (
                                                                <img src={m.images[0]} alt="" className="w-8 h-8 rounded-lg object-cover shrink-0" />
                                                            ) : (
                                                                <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center shrink-0">
                                                                    <ChefHat size={14} className="text-gray-400" />
                                                                </div>
                                                            )}
                                                            <div className="min-w-0">
                                                                <p className="font-medium text-gray-800 truncate">{m.name}</p>
                                                                <p className="text-[11px] text-gray-400">₹{m.finalPrice || m.basePrice}</p>
                                                            </div>
                                                        </div>
                                                        <Plus size={14} className="text-gray-300 group-hover:text-[#FE8301] transition shrink-0" />
                                                    </button>
                                                ))
                                            })()}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>

                        {recipesLoading ? (
                            <LoadingSpinner label="Loading recipes..." />
                        ) : recipes.length === 0 ? (
                            <div className="bg-white rounded-xl border border-gray-200 py-16 text-center">
                                <ChefHat size={40} className="mx-auto text-gray-300 mb-3" />
                                <p className="text-[15px] font-semibold text-gray-400">No recipes yet</p>
                                <p className="text-[13px] text-gray-400 mt-1 max-w-md mx-auto mb-4">
                                    Link menu items to inventory ingredients to enable auto-deduction and food cost tracking.
                                </p>
                                <button
                                    onClick={() => setShowMenuPicker(true)}
                                    className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#FE8301] text-white rounded-xl text-sm font-semibold hover:bg-orange-600 transition"
                                >
                                    <Plus size={16} />
                                    Create Your First Recipe
                                </button>
                            </div>
                        ) : (
                            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                                <table className="w-full text-left border-collapse">
                                    <thead className="bg-[#F8F9FA] text-xs text-gray-500 font-semibold border-b border-gray-200">
                                        <tr>
                                            <th className="px-5 py-3 w-12">Sr.</th>
                                            <th className="px-5 py-3">Menu Item</th>
                                            <th className="px-5 py-3">Ingredients</th>
                                            <th className="px-5 py-3">Yield</th>
                                            <th className="px-5 py-3 text-right">Selling Price</th>
                                            <th className="px-5 py-3 text-right">Food Cost</th>
                                            <th className="px-5 py-3 text-right">Margin</th>
                                            <th className="px-5 py-3 text-center">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody className="text-sm text-gray-700">
                                        {pagedRecipes.map((r, idx) => {
                                            const sp = r.menuItem?.finalPrice || r.menuItem?.basePrice || 0
                                            return (
                                                <tr key={r._id} className="border-b border-gray-100 hover:bg-gray-50 transition">
                                                    <td className="px-5 py-3.5 text-gray-400 font-medium">{(rcPageSafe - 1) * RC_PER_PAGE + idx + 1}</td>
                                                    <td className="px-5 py-3.5">
                                                        <p className="font-semibold text-gray-800">{r.menuItem?.name || '—'}</p>
                                                    </td>
                                                    <td className="px-5 py-3.5">
                                                        <div className="flex flex-wrap gap-1">
                                                            {r.ingredients.slice(0, 4).map((ing, i) => (
                                                                <span key={i} className="text-[11px] bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                                                                    {ing.inventoryItem?.name || '?'}
                                                                </span>
                                                            ))}
                                                            {r.ingredients.length > 4 && <span className="text-[11px] text-gray-400">+{r.ingredients.length - 4} more</span>}
                                                        </div>
                                                    </td>
                                                    <td className="px-5 py-3.5 text-gray-500">{r.yield}</td>
                                                    <td className="px-5 py-3.5 text-right font-medium">₹{sp}</td>
                                                    <td className="px-5 py-3.5 text-right font-semibold">₹{r.foodCost}</td>
                                                    <td className="px-5 py-3.5 text-right">
                                                        <span className={`text-sm font-bold ${r.margin > 65 ? 'text-emerald-600' : r.margin > 50 ? 'text-amber-600' : 'text-rose-600'}`}>
                                                            {r.margin}%
                                                        </span>
                                                    </td>
                                                    <td className="px-5 py-3.5 text-center">
                                                        <button
                                                            onClick={() => setRecipeMenuItem(r.menuItem)}
                                                            className="px-3 py-1.5 bg-[#FE8301]/10 text-[#FE8301] rounded-lg text-xs font-semibold hover:bg-[#FE8301]/20 transition"
                                                        >
                                                            Edit Recipe
                                                        </button>
                                                    </td>
                                                </tr>
                                            )
                                        })}
                                    </tbody>
                                </table>
                                <TablePager
                                    page={rcPageSafe}
                                    totalPages={rcTotalPages}
                                    totalItems={recipes.length}
                                    perPage={RC_PER_PAGE}
                                    onChange={setRcPage}
                                />
                            </div>
                        )}
                    </div>
                )}

                {/* ═══ PROCUREMENT + PRODUCTION + REPORTS (spec 10.3.2 / 10.4 / 10.6.2 / 10.8 / 10.9) ═══ */}
                {activeTab === 'suppliers' && (
                    <div className="flex-1 min-h-0 overflow-auto"><SuppliersTab /></div>
                )}
                {activeTab === 'purchases' && (
                    <div className="flex-1 min-h-0 overflow-auto"><PurchasesTab /></div>
                )}
                {activeTab === 'production' && (
                    <div className="flex-1 min-h-0 overflow-auto"><ProductionTab /></div>
                )}
                {activeTab === 'reports' && (
                    <div className="flex-1 min-h-0 overflow-auto"><InventoryReports /></div>
                )}
            </div>

            {/* ── Modals ─────────────────────────────────────────────────────────── */}
            {showAddModal && <AddInventoryModal editData={editingItem} onClose={() => { setShowAddModal(false); setEditingItem(null) }} onSubmit={handleAddSubmit} />}
            {showBulkImportModal && (
                <BulkImportInventoryModal
                    onClose={() => setShowBulkImportModal(false)}
                    onComplete={() => refetchStock()}
                />
            )}
            {showBulkImportRecipesModal && (
                <BulkImportRecipesModal
                    onClose={() => setShowBulkImportRecipesModal(false)}
                    onComplete={() => fetchRecipes()}
                />
            )}
            {adjustingItem && <StockAdjustmentModal item={adjustingItem} onClose={() => setAdjustingItem(null)} onSubmit={handleAdjustSubmit} />}
            {viewingItemId && <InventoryDetailDrawer itemId={viewingItemId} onClose={() => setViewingItemId(null)} onEdit={(item) => { setViewingItemId(null); setEditingItem(item); setShowAddModal(true) }} onDelete={(item) => { setViewingItemId(null); setDeleteConfirm(item) }} onAdjust={(item) => { setViewingItemId(null); setAdjustingItem(item) }} />}
            {deleteConfirm && <ConfirmModal isOpen={!!deleteConfirm} title="Delete Inventory Item" message={`Are you sure you want to delete "${deleteConfirm.name}"? This action cannot be undone.`} confirmLabel="Delete" onConfirm={handleDelete} onClose={() => setDeleteConfirm(null)} />}
            {recipeMenuItem && <RecipeModal menuItem={recipeMenuItem} onClose={() => setRecipeMenuItem(null)} onSaved={() => { fetchRecipes() }} />}
        </>
    )
}

// ─── Sub-components ──────────────────────────────────────────────────────────

// Clickable when `onClick` is passed — used to filter the stock list by the
// card's status. `active` highlights the currently-applied filter.
const SummaryCard = ({ icon: Icon, label, value, color, bg, onClick, active }) => {
    const clickable = typeof onClick === 'function'
    return (
        <div
            onClick={onClick}
            role={clickable ? 'button' : undefined}
            tabIndex={clickable ? 0 : undefined}
            title={clickable ? (active ? 'Filtering by this — click to clear' : `Click to filter by ${label}`) : undefined}
            onKeyDown={clickable ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick() } } : undefined}
            className={`bg-white rounded-xl border px-4 py-4 flex items-center justify-between gap-3 shadow-sm transition ${
                clickable ? 'cursor-pointer hover:border-[#FE8301] hover:shadow-md' : 'border-gray-200'
            } ${active ? 'border-[#FE8301] ring-2 ring-[#FE8301]/30' : 'border-gray-200'}`}
        >
            <div className="flex items-center gap-3 min-w-0">
                <div className={`w-10 h-10 rounded-xl ${bg} flex items-center justify-center shrink-0`}>
                    <Icon size={20} className={color} />
                </div>
                <div className="min-w-0">
                    <p className="text-xs text-gray-400 font-medium truncate">{label}</p>
                    <p className="text-xl font-bold text-[#1A181B] leading-tight">{value}</p>
                </div>
            </div>
            {/* Arrow (same affordance as the Offers cards) — only on the
                clickable cards; turns orange when its filter is active. */}
            {clickable && (
                <ChevronRight size={20} strokeWidth={2.5} className={`shrink-0 transition-colors ${active ? 'text-[#FE8301]' : 'text-gray-400'}`} />
            )}
        </div>
    )
}

const SortHeader = ({ label, field, sortBy, sortOrder, onSort, align = 'left' }) => (
    <button
        onClick={() => onSort(field)}
        className={`inline-flex items-center gap-1 hover:text-gray-700 transition ${align === 'right' ? 'justify-end w-full' : ''}`}
    >
        {label}
        <ArrowUpDown
            size={14}
            className={sortBy === field ? 'text-[#FE8301]' : 'text-gray-400'}
            style={sortBy === field ? { transform: sortOrder === 'desc' ? 'scaleY(-1)' : undefined } : undefined}
        />
    </button>
)

const LoadingSpinner = ({ label }) => (
    <div className="flex flex-col items-center justify-center py-16">
        <div className="w-8 h-8 border-3 border-orange-500 border-t-transparent rounded-full animate-spin" />
        <span className="text-sm text-gray-400 mt-3">{label}</span>
    </div>
)

// Build a compact page list with ellipses: 1 … 4 5 [6] 7 8 … 20
const buildPageList = (current, total) => {
    if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)
    if (current <= 4) return [1, 2, 3, 4, 5, '…', total]
    if (current >= total - 3) return [1, '…', total - 4, total - 3, total - 2, total - 1, total]
    return [1, '…', current - 1, current, current + 1, '…', total]
}

// Reusable numbered pager (Prev · 1 … 5 [6] 7 … 20 · Next) + a
// "Showing X–Y of Z" caption. Used by the Food Cost & Recipes tables.
const TablePager = ({ page, totalPages, totalItems, perPage, onChange }) => {
    if (totalItems === 0) return null
    const from = (page - 1) * perPage + 1
    const to = Math.min(totalItems, page * perPage)
    return (
        <div className="flex items-center justify-between gap-3 px-5 py-3 border-t border-gray-100 flex-wrap">
            <span className="text-xs font-medium text-gray-500">Showing {from}–{to} of {totalItems}</span>
            {totalPages > 1 && (
                <div className="flex items-center gap-1">
                    <button
                        onClick={() => onChange(Math.max(1, page - 1))}
                        disabled={page === 1}
                        className="p-2 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition"
                        aria-label="Previous page"
                    >
                        <ChevronLeft size={16} />
                    </button>
                    {buildPageList(page, totalPages).map((p, i) => (
                        p === '…' ? (
                            <span key={`e${i}`} className="px-2 text-xs text-gray-400 select-none">…</span>
                        ) : (
                            <button
                                key={p}
                                onClick={() => onChange(p)}
                                className={`min-w-[32px] h-8 px-2 rounded-lg text-xs font-semibold transition ${
                                    p === page ? 'bg-[#FE8301] text-white' : 'border border-gray-200 text-gray-600 hover:bg-gray-50'
                                }`}
                            >
                                {p}
                            </button>
                        )
                    ))}
                    <button
                        onClick={() => onChange(Math.min(totalPages, page + 1))}
                        disabled={page >= totalPages}
                        className="p-2 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition"
                        aria-label="Next page"
                    >
                        <ChevronRight size={16} />
                    </button>
                </div>
            )}
        </div>
    )
}

export default Inventory
