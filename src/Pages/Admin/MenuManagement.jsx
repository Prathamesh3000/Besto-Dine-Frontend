import React, { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Plus, Search, ChevronDown, LayoutGrid, List, Loader, Upload, AlertTriangle, ChevronRight } from 'lucide-react'
import MenuItemCard from './components/MenuItemCard'
import MenuIssueModal from './components/MenuIssueModal'
import ComboCard from './components/ComboCard'
import AddMenuItemModal from './components/AddMenuItemModal'
import AddCategoryModal from './components/AddCategoryModal'
import MenuItemDetailModal from './components/MenuItemDetailModal'
import ComboDetailModal from './components/ComboDetailModal'
import InactivateMenuModal from './components/InactivateMenuModal'
import ActivationSuccessModal from './components/ActivationSuccessModal'
import ConfirmModal from './components/ConfirmModal'
import BulkImportMenuModal from './components/BulkImportMenuModal'
import BulkImportCombosModal from './components/BulkImportCombosModal'
import { useMenu } from '../../Context/MenuContext'
import api, { inventoryAPI } from '../../utils/api'
import toast from 'react-hot-toast'
import { SkeletonTablesGrid, SkeletonRows } from '../../Components/Common/Skeleton'


const MenuManagement = () => {
  const navigate = useNavigate()
  const {
    combos,
    comboLoading,
    fetchCombos,
    deleteCombo,
    toggleComboStatus,
    toggleMenuItemStatus,
    menuItems: contextMenuItems,
    menuLoading: contextMenuLoading,
    menuPagination,
    fetchMenuItems,
    fetchCategories,
    categories: contextCategories,
    comboPagination,
  } = useMenu()
  const [searchParams, setSearchParams] = useSearchParams()
  const [viewMode, setViewMode] = useState('grid') // 'grid' | 'list'
  
  // Initialize tab from URL or default to 'single'
  const tabFromUrl = searchParams.get('tab')
  const [activeTab, setActiveTabState] = useState(tabFromUrl === 'combos' ? 'combos' : 'single')

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1)
  const [itemsPerPage, setItemsPerPage] = useState(8)

  // Wrapper to update both state and URL
  const setActiveTab = (tab) => {
    setActiveTabState(tab)
    setSearchParams({ tab })
    setCurrentPage(1) // Reset pagination on tab change
  }

  // Sync tab if URL changes (e.g. back button)
  useEffect(() => {
    const currentTab = searchParams.get('tab')
    if (currentTab === 'combos' || currentTab === 'single') {
        setActiveTabState(currentTab)
    }
  }, [searchParams])

  // --- Dropdown States ---
  const [openDropdown, setOpenDropdown] = useState(null) // 'filter' | 'type' | 'category' | 'status' | null
  const dropdownRef = useRef(null)

  useEffect(() => {
    const handler = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) setOpenDropdown(null)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const [showAddModal, setShowAddModal] = useState(false)
  const [showCategoryModal, setShowCategoryModal] = useState(false)
  const [showBulkImportModal, setShowBulkImportModal] = useState(false)
  const [showBulkImportCombosModal, setShowBulkImportCombosModal] = useState(false)
  const [selectedCategory, setSelectedCategory] = useState('All Category')
  const [selectedFilter, setSelectedFilter] = useState('Filter by')
  const [selectedType, setSelectedType] = useState('Select Type')
  const [selectedStatus, setSelectedStatus] = useState('Select Status')

  const [showDetailModal, setShowDetailModal] = useState(false)
  const [selectedItem, setSelectedItem] = useState(null)
  const [showInactivateModal, setShowInactivateModal] = useState(false)
  const [itemToInactivate, setItemToInactivate] = useState(null)
  const [showSuccessModal, setShowSuccessModal] = useState(false)
  const [editItem, setEditItem] = useState(null)
  const [isHealthMode, setIsHealthMode] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState(null)
  
  // Real stats from telemetry API
  const [stats, setStats] = useState({
    todayOrders: 0,
    todayEarnings: '₹0.00',
    totalOrders: 0
  })

  // Inventory issues per menu item (out/low/config) → alert badges + a
  // "needs attention" banner. Map keyed by menuItemId; list is the full
  // tenant-wide set so nothing is hidden by pagination.
  const [menuIssues, setMenuIssues] = useState({ map: {}, list: [], counts: { total: 0 } })
  // Issue currently expanded in the detail/fix modal.
  const [issueDetail, setIssueDetail] = useState(null)

  // Open the issue detail modal for a menu item (from a banner chip or a card
  // alert). `entry` may be a full list item or just need the id/name.
  const openIssueDetail = (entry) => {
    const id = entry.menuItemId || entry._id || entry.id
    const detail = menuIssues.map[id]
    setIssueDetail({
      menuItemId: id,
      name: entry.name,
      level: entry.level || detail?.level,
      reasons: entry.reasons || detail?.reasons || [],
    })
  }

  // Fix actions — deep-link into the Inventory page at the right tab.
  const fixRecipe = (issue) => {
    setIssueDetail(null)
    navigate(`/admin/inventory?tab=recipes&recipe=${issue.menuItemId}`)
  }
  const goInventory = (issue) => {
    setIssueDetail(null)
    navigate(`/admin/inventory?tab=stock&status=${issue.level === 'out' ? 'out-of-stock' : 'low-stock'}`)
  }
  
  // Search State with Debounce
  const [searchQuery, setSearchQuery] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchQuery), 300)
    return () => clearTimeout(timer)
  }, [searchQuery])

  // Stable ref for categories to avoid infinite re-render loop
  const categoriesRef = useRef(contextCategories);
  categoriesRef.current = contextCategories;

  // Comma-joined ids of all items needing attention (value-stable across
  // re-fetches, so it won't loop the data effect). Used to make
  // "Needs Attention First" a real, paginated filter that surfaces ALL
  // flagged items — not just the ones on the current page.
  const issueIdsKey = menuIssues.list.map(i => i.menuItemId).join(',');

  const refreshData = useCallback(() => {
    let catId = undefined;
    if (selectedCategory !== 'All Category') {
      const cat = categoriesRef.current.find(c => c.name === selectedCategory);
      if (cat) catId = cat._id;
    }

    // ADM-036 — pass "All Status" through to the backend explicitly so
    // its admin-list branch runs (no status filter at all). When status
    // is `undefined` here, the backend silently defaults to active-only,
    // which hid every inactivated item from this page and left admins
    // with no way to reactivate them.
    // The user-facing label "Inactive" maps to the schema's 'archived'
    // status, so translate that before sending.
    const statusForApi = (() => {
      if (selectedStatus === 'Select Status' || selectedStatus === 'All Status') return 'All Status';
      if (selectedStatus === 'Inactive') return 'archived';
      return selectedStatus;
    })();
    const params = {
      page: currentPage,
      limit: itemsPerPage,
      search: debouncedSearch,
      category: catId,
      status: statusForApi,
      type: selectedType === 'Select Type' || selectedType === 'All Type' ? undefined : selectedType,
      // "Needs Attention First" isn't a server sort — it's a server-side
      // FILTER to the flagged item ids (so every flagged item shows, paged),
      // with a client severity re-order within each page. Don't send it as a
      // sort key.
      sort: (selectedFilter === 'Filter by' || selectedFilter === 'Needs Attention First') ? undefined : selectedFilter,
      ...(activeTab === 'single' && selectedFilter === 'Needs Attention First' && issueIdsKey
        ? { ids: issueIdsKey }
        : {}),
      isHealthy: isHealthMode || undefined
    };

    if (activeTab === 'single') {
      fetchMenuItems(params);
    } else {
      fetchCombos(params);
    }
  }, [currentPage, itemsPerPage, debouncedSearch, selectedCategory, selectedStatus, selectedType, selectedFilter, issueIdsKey, isHealthMode, activeTab, fetchMenuItems, fetchCombos]);

  // Any filter / search change should jump back to page 1 — otherwise
  // switching to a narrower result (e.g. "Needs Attention First") while on a
  // high page lands the user on an empty page.
  useEffect(() => {
    setCurrentPage(1)
  }, [selectedFilter, selectedCategory, selectedStatus, selectedType, debouncedSearch, isHealthMode])

  // Effect for fetching data when filters or pagination change
  useEffect(() => {
    refreshData();
  }, [refreshData]);

  // Inventory issues for the single-items view. Re-pulled whenever the menu
  // data refreshes (a toggle / edit may change availability) and on tab
  // switch. Silent-fails (e.g. tenant without the inventory feature → 403).
  useEffect(() => {
    if (activeTab !== 'single') return;
    let cancelled = false;
    inventoryAPI.getMenuIssues()
      .then(res => {
        if (cancelled || !res.data?.success) return;
        setMenuIssues({ map: res.data.issues || {}, list: res.data.list || [], counts: res.data.counts || { total: 0 } });
      })
      .catch(() => { if (!cancelled) setMenuIssues({ map: {}, list: [], counts: { total: 0 } }); });
    return () => { cancelled = true; };
  }, [activeTab, contextMenuItems]);

  // Fetch initial data (categories)
  useEffect(() => {
    fetchCategories();
    
    // Fetch telemetry stats
    const fetchStats = async () => {
      try {
        const res = await api.get('/telemetry/stats')
        if (res.data.success) {
          setStats({
            todayOrders: res.data.stats?.todayOrders || 0,
            todayEarnings: res.data.stats?.todayEarnings || '₹0.00',
            totalOrders: res.data.stats?.totalOrders || 0
          })
        }
      } catch (err) {
        console.error('Failed to fetch stats:', err)
      }
    }
    fetchStats()
  }, [fetchCategories]);

  // Handler for viewing item
  const handleViewItem = (item) => {
    setSelectedItem(item)
    setShowDetailModal(true)
  }

  // Handler for editing item
  const handleEditItem = (item) => {
    if (activeTab === 'combos') {
      navigate('/admin/menu/add-combo', { state: { editItem: item } })
    } else {
      setEditItem(item)
      setShowAddModal(true)
    }
  }

  // Handler for toggling item status
  const handleToggleStatus = async (item, newStatus) => {
    if (activeTab === 'combos') {
      try {
        await toggleComboStatus(item._id, item.status)
        toast.success(`Combo ${item.status === 'active' ? 'deactivated' : 'activated'}`)
      } catch {
        toast.error('Failed to update combo status')
      }
      return
    }

    if (!newStatus) {
      // Turning OFF -> Open Modal for confirmation/details
      setItemToInactivate(item)
      setShowInactivateModal(true)
    } else {
      // Turning ON (Enabling)
      try {
        await toggleMenuItemStatus(item._id, item.status) 
        setShowSuccessModal(true)
      } catch (err) {
        toast.error('Failed to enable item')
      }
    }
  }

  const handleConfirmInactivation = async (data) => {
    if (!itemToInactivate) return

    try {
      const response = await api.put(`/menu/${itemToInactivate._id}`, {
        status: 'archived',
        inactivationDuration: data?.duration,
        inactivationDateRange: data?.dateRange,
      })

      if (response.data.success) {
        toast.success(`"${itemToInactivate.name}" has been inactivated`)
        // The server auto-archives any combos that bundled this item so
        // they don't keep selling a now-unavailable component. Warn the
        // admin which bundles were pulled so it isn't a silent surprise.
        const disabledCombos = response.data.disabledCombos || []
        if (disabledCombos.length > 0) {
          toast(
            `${disabledCombos.length} combo${disabledCombos.length > 1 ? 's were' : ' was'} also disabled — they used this item: ${disabledCombos.map(c => c.name).join(', ')}`,
            { icon: '⚠️', duration: 8000 }
          )
        }
        setShowInactivateModal(false)
        setItemToInactivate(null)
        refreshData()
      }
    } catch (err) {
      toast.error('Failed to inactivate item')
    }
  }

  // Handler for deleting a combo — opens ConfirmModal
  const handleDeleteCombo = (item) => {
    setDeleteTarget(item)
  }

  const confirmDeleteCombo = async () => {
    if (!deleteTarget) return
    try {
      await deleteCombo(deleteTarget._id)
      toast.success('Combo deleted')
    } catch {
      toast.error('Failed to delete combo')
    } finally {
      setDeleteTarget(null)
    }
  }

  // ── Stats computed from live data ────────────────────────────────────────
  const pagination = activeTab === 'single' ? menuPagination : comboPagination;
  const totalItems = pagination.totalItems;
  const totalPages = pagination.totalPages;
  
  const comboStats = [
    { label: 'Total Items', value: totalItems.toString().padStart(2, '0'), sub: activeTab === 'single' ? 'Single Dishes' : 'Combos' },
    { label: "Today's Orders", value: stats.todayOrders.toString().padStart(2, '0'), sub: 'Across all items' },
    { label: "Today's Revenue", value: stats.todayEarnings, sub: "Today's Earning" },
    { label: 'Categories', value: contextCategories.length.toString().padStart(2, '0'), sub: 'In menu' },
  ]

  // Filter and Sort Logic
  // Reorder issue items to the front ONLY when the admin picks
  // "Needs Attention First" from the Filter by dropdown (out > config > low).
  // Otherwise the list keeps its natural order.
  const ISSUE_RANK = { out: 3, config: 2, low: 1 };
  const rawItems = activeTab === 'single' ? contextMenuItems : combos;
  const currentItems = (activeTab === 'single' && selectedFilter === 'Needs Attention First')
    ? [...rawItems].sort((a, b) => {
        const ra = ISSUE_RANK[menuIssues.map[a._id || a.id]?.level] || 0;
        const rb = ISSUE_RANK[menuIssues.map[b._id || b.id]?.level] || 0;
        return rb - ra;
      })
    : rawItems;
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = Math.min(startIndex + itemsPerPage, totalItems);


  return (
    <div className={`h-full flex flex-col transition-colors duration-500 overflow-visible ${isHealthMode ? 'bg-[#F0FAF1]' : ''}`}>
      {/* Tabs - Positioned at top */}
      <div className="mb-4">
        <div className="flex items-center gap-1 bg-white p-1 rounded-[12px] border border-gray-200 w-fit shadow-sm">
          <button
            onClick={() => setActiveTab('single')}
            className={`px-6 py-2 rounded-[12px] transition-all text-sm font-medium text-gray-600 font-manrope font-semibold ${activeTab === 'single' ? 'bg-[#FE8301] !text-white shadow-sm' : 'text-[#645E66] hover:bg-gray-50'}`}
          >
            Single Dish
          </button>
          <button
            onClick={() => setActiveTab('combos')}
            className={`px-6 py-2 rounded-[12px] transition-all text-sm font-medium text-gray-600 font-manrope font-semibold ${activeTab === 'combos' ? 'bg-[#FE8301] !text-white shadow-sm' : 'text-[#645E66] hover:bg-gray-50'}`}
          >
            Combos
          </button>
        </div>
      </div>

      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-4 gap-4">
        <div>
          <h1 className="font-manrope font-[700] text-[20px] leading-[26px] text-[#1A181B]">{activeTab === 'combos' ? 'Combo Menu Management' : 'Menu Management'}</h1>
          {activeTab === 'single' && (
            <p className="font-manrope font-[600] text-[16px] leading-[22px] text-[#645E66] mt-1">
              {totalItems} Items
            </p>
          )}
          {activeTab === 'combos' && (
            <p className="font-manrope font-[600] text-[16px] leading-[22px] text-[#645E66] mt-1">
              {totalItems} Combos
            </p>
          )}
        </div>

        <div className="flex items-center gap-3">
          {activeTab === 'single' && (
            <button
              onClick={() => setShowCategoryModal(true)}
              className="px-4 py-2.5 text-orange-500 font-bold border border-orange-500 rounded-xl hover:bg-orange-50 transition-colors font-manrope text-sm flex items-center gap-2"
            >
              <Plus size={18} />
              Add Category
            </button>
          )}

          {activeTab === 'single' && (
            <button
              onClick={() => setShowBulkImportModal(true)}
              className="px-4 py-2.5 text-orange-500 font-bold border border-orange-500 rounded-xl hover:bg-orange-50 transition-colors font-manrope text-sm flex items-center gap-2"
            >
              <Upload size={18} />
              Import CSV
            </button>
          )}

          {activeTab === 'combos' && (
            <button
              onClick={() => setShowBulkImportCombosModal(true)}
              className="px-4 py-2.5 text-orange-500 font-bold border border-orange-500 rounded-xl hover:bg-orange-50 transition-colors font-manrope text-sm flex items-center gap-2"
            >
              <Upload size={18} />
              Import CSV
            </button>
          )}

          <button
            onClick={() => {
              if (activeTab === 'combos') {
                navigate('/admin/menu/add-combo')
              } else {
                setEditItem(null)
                setShowAddModal(true)
              }
            }}
            className="px-5 py-2.5 bg-orange-500 text-white font-bold rounded-[12px] hover:bg-orange-600 shadow-sm transition-all font-manrope text-sm flex items-center gap-2 text-[16px] font-[700]"
          >
            <Plus size={20} />
            {activeTab === 'single' ? 'Add Item' : 'Add Combo'}
          </button>
        </div>
      </div>

      {/* Combo Stats Row */}
      {activeTab === 'combos' && (
        <div className="grid grid-cols-4 gap-4 mb-4">
          {comboStats.map((stat) => (
            <div key={stat.label} className="bg-white rounded-xl border border-[#DDDDDD] shadow-sm p-4">
              <p className="text-[14px] font-semibold text-[#645E66] font-manrope mb-1">{stat.label}</p>
              <p className="text-[20px] font-bold text-[#1A181B] font-manrope leading-tight">{stat.value}</p>
              <p className="text-[12px] text-[#645E66] font-manrope mt-2">{stat.sub}</p>
            </div>
          ))}
        </div>
      )}

      {/* Filters Toolbar */}
      <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm mb-4 flex flex-wrap items-center gap-4 relative z-[30]" ref={dropdownRef}>
        {/* Search */}
        <div className="flex-1 min-w-[240px] relative">
          <Search size={20} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={activeTab === 'combos' ? 'Search by combo name' : 'Search by item name'}
            className="w-full pl-11 pr-4 py-2.5 bg-white border border-gray-200 rounded-lg focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/10 transition-all font-manrope text-sm text-gray-700 placeholder:text-gray-400"
          />
        </div>

        {searchQuery && (
          <button
            onClick={() => setSearchQuery('')}
            className="p-2.5 bg-gray-200 text-gray-600 rounded-lg hover:bg-gray-300 transition-colors"
            aria-label="Clear search"
          >
            <span className="text-sm font-semibold font-manrope">Clear</span>
          </button>
        )}

        <div className="h-8 w-[1px] bg-gray-200 mx-1 hidden md:block"></div>

        {/* Console: Consolidated Dropdowns */}
        {[
          { id: 'filter', val: selectedFilter, opts: ['Filter by', ...(activeTab === 'single' ? ['Needs Attention First'] : []), 'Price: Low to High', 'Price: High to Low', 'Newest First', 'Oldest First', 'Featured First'], set: setSelectedFilter },
          { id: 'type', val: selectedType, opts: ['All Type', 'Veg', 'Non-veg'], set: setSelectedType, icons: true },
          { id: 'category', val: selectedCategory, opts: ['All Category', ...contextCategories.map(c => c.name)], set: setSelectedCategory, hide: activeTab !== 'single' },
          { id: 'status', val: selectedStatus, opts: ['All Status', 'Active', 'Inactive', 'Draft'], set: setSelectedStatus }
        ].filter(dd => !dd.hide).map((dd) => (
          <div key={dd.id} className={`relative ${openDropdown === dd.id ? 'z-[100]' : 'z-10'}`}>
            <button
              onClick={() => setOpenDropdown(openDropdown === dd.id ? null : dd.id)}
              className={`flex items-center gap-2 px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm font-[600] text-gray-600 font-manrope hover:border-gray-300 hover:bg-gray-50 transition-all ${openDropdown === dd.id ? 'ring-2 ring-orange-100 border-orange-200' : ''}`}
            >
              {dd.val === 'All Type' ? 'Select Type' : dd.val === 'All Status' ? 'Select Status' : dd.val}
              <ChevronDown size={16} className={`text-gray-400 transition-transform duration-200 ${openDropdown === dd.id ? 'rotate-180' : ''}`} />
            </button>

            {openDropdown === dd.id && (
              <div className={`absolute top-full mt-2 w-[180px] bg-white rounded-2xl shadow-[0px_4px_20px_0px_rgba(0,0,0,0.08)] border border-gray-100 z-30 animate-in fade-in zoom-in-95 duration-200 overflow-y-auto max-h-[280px] custom-scrollbar scroll-fade ${dd.id === 'status' ? 'right-0' : 'left-0'}`}>
                {dd.opts.map((opt, idx) => (
                  <div key={opt}>
                    <button
                      onClick={() => {
                        dd.set(opt === 'All Type' ? 'Select Type' : opt === 'All Status' ? 'Select Status' : opt)
                        setOpenDropdown(null)
                      }}
                      className={`w-full text-left px-5 py-2.5 text-sm font-medium font-manrope transition-colors flex items-center gap-2 ${dd.val === opt || (dd.val === 'Select Type' && opt === 'All Type') || (dd.val === 'Select Status' && opt === 'All Status') ? 'bg-[#FE8301] !text-white' : 'text-gray-600 hover:bg-[#FE8301] hover:!text-white'}`}
                    >
                      {/* Veg / Non-Veg badges — colour stays true to the
                          food-safety convention even when the row is the
                          current selection (orange background). Flipping
                          them white made the icon disappear and stripped
                          their meaning. */}
                      {dd.icons && opt === 'Veg' && (
                        <div className="w-4 h-4 border border-green-500 bg-white rounded-[3px] flex items-center justify-center p-0.5 shrink-0">
                          <div className="w-2 h-2 rounded-full bg-green-500"></div>
                        </div>
                      )}
                      {dd.icons && opt === 'Non-veg' && (
                        <div className="w-4 h-4 border border-red-500 bg-white rounded-[3px] flex items-center justify-center p-0.5 shrink-0">
                          <div className="w-2 h-2 rounded-full bg-red-500"></div>
                        </div>
                      )}
                      {opt}
                    </button>
                    {((dd.id === 'filter' && (idx === 0 || idx === 2 || idx === 4)) || (dd.id !== 'filter' && idx < dd.opts.length - 1)) && <div className="h-[1px] bg-gray-100 mx-4 my-1"></div>}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}

        <div className="h-8 w-[1px] bg-gray-200 mx-1 hidden md:block"></div>

        {/* Health Mode Toggle */}
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold text-gray-600 font-manrope">Health Mode</span>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              className="sr-only peer"
              checked={isHealthMode}
              onChange={(e) => setIsHealthMode(e.target.checked)}
            />
            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#22C55E]"></div>
          </label>
        </div>

        <div className="ml-auto flex bg-gray-100 p-1 rounded-lg">
          <button
            onClick={() => setViewMode('grid')}
            className={`w-9 h-9 flex items-center justify-center rounded-lg transition-all ${viewMode === 'grid' ? 'bg-orange-500 text-white shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}
          >
            <LayoutGrid size={20} />
          </button>
          <button
            onClick={() => setViewMode('list')}
            className={`w-9 h-9 flex items-center justify-center rounded-lg transition-all ${viewMode === 'list' ? 'bg-orange-500 text-white shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}
          >
            <List size={20} />
          </button>
        </div>
      </div>

      {/* Content Area - Scrollable */}
      <div className="flex-1 overflow-y-auto custom-scrollbar pr-1">
        {/* Skeleton loaders — paint the grid / list shape immediately so
            the page doesn't blank out while the menu fetch runs. Grid mode
            uses card-shaped placeholders, list mode uses row-shaped ones. */}
        {((activeTab === 'combos' && comboLoading) || (activeTab === 'single' && contextMenuLoading)) && (
          viewMode === 'grid'
            ? <SkeletonTablesGrid count={12} className="py-2" />
            : <SkeletonRows count={8} className="px-4" />
        )}

        {/* Empty state for combos */}
        {activeTab === 'combos' && !comboLoading && currentItems.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 gap-2">
            <p className="text-[15px] font-semibold text-gray-500 font-manrope">No combos found</p>
            <p className="text-[13px] text-gray-400 font-manrope">Click "Add Combo" to create your first combo menu.</p>
          </div>
        )}

        {/* Empty state for single items */}
        {activeTab === 'single' && !contextMenuLoading && currentItems.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 gap-2">
            <p className="text-[15px] font-semibold text-gray-500 font-manrope">No items found</p>
            <p className="text-[13px] text-gray-400 font-manrope">Try adjusting your search or filters.</p>
          </div>
        )}

        {/* Needs-attention banner — tenant-wide so issues aren't hidden by
            pagination. Click an item to jump to it (search by name). */}
        {activeTab === 'single' && menuIssues.counts.total > 0 && (
          <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50/60 p-4">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle size={16} className="text-rose-600" />
              <h3 className="text-sm font-bold text-rose-800">
                {menuIssues.counts.total} {menuIssues.counts.total === 1 ? 'item needs' : 'items need'} attention
              </h3>
              <span className="text-[11px] font-semibold text-rose-600">
                {menuIssues.counts.out > 0 && `${menuIssues.counts.out} out of stock`}
                {menuIssues.counts.out > 0 && (menuIssues.counts.config > 0 || menuIssues.counts.low > 0) && ' · '}
                {menuIssues.counts.config > 0 && `${menuIssues.counts.config} recipe issue${menuIssues.counts.config > 1 ? 's' : ''}`}
                {menuIssues.counts.config > 0 && menuIssues.counts.low > 0 && ' · '}
                {menuIssues.counts.low > 0 && `${menuIssues.counts.low} low stock`}
              </span>
            </div>
            <div className="flex gap-2 overflow-x-auto pb-1 [&::-webkit-scrollbar]:hidden">
              {menuIssues.list.map(it => {
                const tone = it.level === 'out' ? 'bg-rose-100 text-rose-700 border-rose-200'
                  : it.level === 'config' ? 'bg-orange-100 text-orange-700 border-orange-200'
                  : 'bg-amber-100 text-amber-700 border-amber-200'
                const lbl = it.level === 'out' ? 'Out of stock' : it.level === 'config' ? 'Recipe issue' : 'Low stock'
                return (
                  <button
                    key={it.menuItemId}
                    onClick={() => openIssueDetail(it)}
                    title="View issue & how to fix"
                    className={`shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[12px] font-semibold hover:brightness-95 transition ${tone}`}
                  >
                    {it.name}
                    <span className="text-[10px] font-bold opacity-80">· {lbl}</span>
                    <ChevronRight size={12} />
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {((!comboLoading && activeTab === 'combos') || (!contextMenuLoading && activeTab === 'single')) && currentItems.length > 0 && (
          viewMode === 'grid' ? (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(330px,1fr))] gap-x-6 gap-y-3 pb-6">
              {currentItems.map(item => (
                activeTab === 'combos' ? (
                  <ComboCard key={item._id || item.id} item={item} viewMode="grid" onView={handleViewItem} onToggle={handleToggleStatus} onEdit={handleEditItem} onDelete={handleDeleteCombo} />
                ) : (
                  <MenuItemCard key={item._id || item.id} item={item} viewMode="grid" isHealthMode={isHealthMode} issue={menuIssues.map[item._id || item.id]} onIssueClick={() => openIssueDetail({ menuItemId: item._id || item.id, name: item.name })} onView={handleViewItem} onToggle={handleToggleStatus} onEdit={handleEditItem} />
                )
              ))}
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden mb-6">
              {/* Table Header */}
              {activeTab === 'combos' ? (
                <div className="grid grid-cols-[60px_1fr_2fr_1.2fr_120px_150px] gap-4 px-4 py-4 bg-[#F2F4F7] border-b border-gray-200 text-xs font-semibold text-[#667085] uppercase tracking-wider font-manrope items-center">
                  <span>Sr. No.</span>
                  <span>Combo Name</span>
                  <span>Food Category</span>
                  <span>Size & Price</span>
                  <span className="text-center">Status</span>
                  <span className="text-right">Action</span>
                </div>
              ) : (
                <div className="grid grid-cols-[60px_4fr_1.5fr_3fr_1fr_120px] gap-4 px-6 py-4 bg-[#F2F4F7] border-b border-gray-200 text-xs font-semibold text-[#667085] uppercase tracking-wider font-manrope items-center">
                  <span>Sr. No.</span>
                  <span>Item Name</span>
                  <span className="pl-[53px]">Category</span>
                  <span>Size & Price</span>
                  <span className="text-center">Status</span>
                  <span className="text-right">Action</span>
                </div>
              )}

              {/* Table Body */}
              <div>
                {currentItems.map((item, index) => (
                  activeTab === 'combos' ? (
                    <ComboCard key={item._id || item.id} item={item} serialNumber={startIndex + index + 1} viewMode="list" onView={handleViewItem} onToggle={handleToggleStatus} onEdit={handleEditItem} onDelete={handleDeleteCombo} />
                  ) : (
                    <MenuItemCard key={item._id || item.id} item={item} index={startIndex + index} viewMode="list" isHealthMode={isHealthMode} issue={menuIssues.map[item._id || item.id]} onIssueClick={() => openIssueDetail({ menuItemId: item._id || item.id, name: item.name })} onView={handleViewItem} onToggle={handleToggleStatus} onEdit={handleEditItem} />
                  )
                ))}
              </div>
            </div>
          )
        )}
      </div>

      {/* Pagination */}
      {totalItems > 0 && (
        <div className="mt-auto flex flex-col md:flex-row justify-center items-center py-6 border-t border-gray-100 gap-6 font-manrope">
          <div className="flex items-center gap-2">
            <button 
              disabled={currentPage === 1}
              onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
              className={`w-8 h-8 flex items-center justify-center rounded-lg bg-[#EBEBEB] text-gray-500 hover:bg-gray-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              <span className="mb-0.5">‹</span>
            </button>
            
            {/* Page Numbers */}
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              let pageNum;
              if (totalPages <= 5) {
                pageNum = i + 1;
              } else if (currentPage <= 3) {
                pageNum = i + 1;
              } else if (currentPage >= totalPages - 2) {
                pageNum = totalPages - 4 + i;
              } else {
                pageNum = currentPage - 2 + i;
              }

              return (
                <button
                  key={pageNum}
                  onClick={() => setCurrentPage(pageNum)}
                  className={`w-8 h-8 flex items-center justify-center rounded-lg text-sm font-[600] transition-all ${currentPage === pageNum ? 'bg-[#FFDBB1] text-[#1A181B]' : 'bg-white text-gray-500 hover:bg-gray-50'}`}
                >
                  {pageNum}
                </button>
              );
            })}

            {totalPages > 5 && currentPage < totalPages - 2 && (
              <>
                <span className="text-gray-400 text-sm">...</span>
                <button 
                  onClick={() => setCurrentPage(totalPages)}
                  className={`w-8 h-8 flex items-center justify-center rounded-lg bg-white text-gray-500 hover:bg-gray-50 text-sm font-[600]`}
                >
                  {totalPages}
                </button>
              </>
            )}

            <button 
              disabled={currentPage === totalPages}
              onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
              className={`w-8 h-8 flex items-center justify-center rounded-lg bg-[#EBEBEB] text-gray-500 hover:bg-gray-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              <span className="mb-0.5">›</span>
            </button>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 text-sm text-gray-600 font-[500]">
              <span>Rows per page</span>
              <select 
                value={itemsPerPage}
                onChange={(e) => {
                  setItemsPerPage(Number(e.target.value))
                  setCurrentPage(1)
                }}
                className="border-none bg-transparent text-[#1A181B] font-[600] focus:outline-none cursor-pointer"
              >
                <option value={4}>4</option>
                <option value={8}>8</option>
                <option value={12}>12</option>
                <option value={16}>16</option>
              </select>
            </div>

            <span className="text-sm text-gray-500 font-[500]">{startIndex + 1}-{endIndex} of {totalItems}</span>
          </div>
        </div>
      )}

      {/* ── Modals (rendered at root level, not inside header flex) ── */}
      {showAddModal && <AddMenuItemModal onClose={() => setShowAddModal(false)} editItem={editItem} onRefresh={refreshData} />}
      {showCategoryModal && <AddCategoryModal onClose={() => setShowCategoryModal(false)} onRefresh={fetchCategories} />}
      {showBulkImportModal && (
        <BulkImportMenuModal
          onClose={() => setShowBulkImportModal(false)}
          onComplete={() => { refreshData(); fetchCategories(); }}
        />
      )}
      {showBulkImportCombosModal && (
        <BulkImportCombosModal
          onClose={() => setShowBulkImportCombosModal(false)}
          onComplete={() => { refreshData(); }}
        />
      )}
      {showDetailModal && (
        activeTab === 'combos' ? (
          <ComboDetailModal item={selectedItem} onClose={() => setShowDetailModal(false)} onEdit={handleEditItem} onToggle={handleToggleStatus} />
        ) : (
          <MenuItemDetailModal item={selectedItem} onClose={() => setShowDetailModal(false)} onEdit={handleEditItem} onToggle={handleToggleStatus} />
        )
      )}
      <InactivateMenuModal isOpen={showInactivateModal} onClose={() => setShowInactivateModal(false)} onConfirm={handleConfirmInactivation} itemName={itemToInactivate?.name} />
      <ActivationSuccessModal isOpen={showSuccessModal} onClose={() => setShowSuccessModal(false)} />
      <ConfirmModal isOpen={!!deleteTarget} title="Delete Combo" message={`Are you sure you want to delete "${deleteTarget?.name}"? This action cannot be undone.`} confirmLabel="Delete" onConfirm={confirmDeleteCombo} onClose={() => setDeleteTarget(null)} />
      <MenuIssueModal issue={issueDetail} onClose={() => setIssueDetail(null)} onFixRecipe={fixRecipe} onGoInventory={goInventory} />
    </div>
  )
}

export default MenuManagement
