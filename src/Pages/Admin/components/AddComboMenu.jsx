import React, { useState, useEffect, useRef } from 'react'
import { useNavigate, useLocation, useSearchParams } from 'react-router-dom'
import { ArrowLeft, ArrowRight, Upload, ChevronDown, ChevronUp, X, Plus, Minus, Clock, Calendar, Check, Loader } from 'lucide-react'
import { useMenu } from '../../../Context/MenuContext'
import toast from 'react-hot-toast'

const SERVE_OPTIONS = ['1-2 person', '2-3 person', '3-4 person', '4-6 person', '6+ person']
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

const AddComboMenu = () => {
    const navigate = useNavigate()
    const location = useLocation()
    const editItem = location.state?.editItem || null
    const [searchParams, setSearchParams] = useSearchParams()
    
    const isEditMode = !!editItem
    const { categories, fetchCategories, menuItems, menuLoading, fetchMenuItems, createCombo, updateCombo, uploadImage } = useMenu()
    
    // Sync current step from URL or fallback to 1
    const stepFromUrl = parseInt(searchParams.get('step')) || 1
    const [currentStep, setCurrentStepState] = useState(stepFromUrl)

    // Wrapper to update step and URL simultaneously
    const setCurrentStep = (step) => {
        setCurrentStepState(step)
        setSearchParams({ step: step.toString() })
    }

    // Handle back/forward browser navigation
    useEffect(() => {
        const urlStep = parseInt(searchParams.get('step')) || 1
        if (urlStep !== currentStep) {
            setCurrentStepState(urlStep)
        }
    }, [searchParams])

    const [isSaving, setIsSaving] = useState(false)
    const [isUploading, setIsUploading] = useState(false)
    const imageInputRef = useRef(null)

    // ── Step 1: Basic Details ──────────────────────────────────────────────────
    const [comboName, setComboName] = useState(editItem?.name || '')
    const [serveUpto, setServeUpto] = useState(editItem?.serveUpto || '2-3 person')
    const [description, setDescription] = useState(editItem?.description || '')
    const [foodType, setFoodType] = useState(editItem?.vegType || 'veg')
    const [isSpecial, setIsSpecial] = useState(editItem?.isSpecial || false)
    const [comboImages, setComboImages] = useState(editItem?.images || [])

    // ── Step 2: Item Builder ───────────────────────────────────────────────────
    // selectedItems: { [categoryName]: [{_id, name, price, isVeg}] }
    const [selectedItems, setSelectedItems] = useState(() => {
        if (editItem?.categories) {
            return editItem.categories.reduce((acc, cat) => {
                acc[cat.name] = cat.items
                return acc
            }, {})
        }
        return {}
    })
    const [expandedCategories, setExpandedCategories] = useState({})
    const [categoryVegFilters, setCategoryVegFilters] = useState({})   // { categoryName: 'all'|'veg'|'nonveg' }
    const [categoryHealthyFilters, setCategoryHealthyFilters] = useState({}) // { categoryName: boolean }
    const [itemBuilderExpanded, setItemBuilderExpanded] = useState(true)

    // ── Step 3: Pricing & Rules ────────────────────────────────────────────────
    const [price, setPrice] = useState(editItem?.price || '')
    const [originalPrice, setOriginalPrice] = useState(editItem?.originalPrice || '')
    const [discount, setDiscount] = useState(editItem?.discount || '')
    const [discountType, setDiscountType] = useState(editItem?.discountType || 'Percentage')
    const [unlimitedQuantity, setUnlimitedQuantity] = useState(editItem?.unlimitedQuantity !== undefined ? editItem.unlimitedQuantity : true)
    const [taxApplicable, setTaxApplicable] = useState(editItem?.taxApplicable || false)
    const [serviceCharge, setServiceCharge] = useState(editItem?.serviceCharge || false)

    const [availableDays, setAvailableDays] = useState(editItem?.availableDays || [])
    const [startTime, setStartTime] = useState(editItem?.startTime || '')
    const [endTime, setEndTime] = useState(editItem?.endTime || '')
    const [isHealthy, setIsHealthy] = useState(editItem?.isHealthy || false)

    // Accordion state
    const [expandedSections, setExpandedSections] = useState({
        serveUptoDropdown: false,
        setPrice: true,
        availability: false,
        healthMode: false,
        preview: true,
    })

    const steps = [
        { number: 1, label: 'Basic Details' },
        { number: 2, label: 'Item Builder' },
        { number: 3, label: 'Pricing & Rules' },
    ]

    // Fetch real categories & menu items on mount
    useEffect(() => {
        fetchCategories()
        fetchMenuItems({ limit: 1000 })
    }, [fetchCategories, fetchMenuItems])

    // Auto-expand first category when loaded
    useEffect(() => {
        if (categories.length > 0) {
            setExpandedCategories({ [categories[0].name]: true })
        }
    }, [categories])

    // ── Helpers ────────────────────────────────────────────────────────────────
    // Group real menu items by their category
    // NOTE: menuController uses populate('category') so item.category is
    // an object {_id, name} not a plain string — handle both forms
    const getCatName = (item) =>
        typeof item.category === 'object' && item.category !== null
            ? (item.category.name || '')
            : (item.category || '')

    const categorisedItems = categories.map(cat => ({
        name: cat.name,
        items: menuItems.filter(item =>
            getCatName(item) === cat.name && item.status === 'active'
        )
    })).filter(c => c.items.length > 0)

    const toggleItem = (categoryName, item) => {
        setSelectedItems(prev => {
            const catItems = prev[categoryName] || []
            const exists = catItems.find(i => (i._id || i.id) === (item._id || item.id))
            if (exists) {
                const updated = catItems.filter(i => (i._id || i.id) !== (item._id || item.id))
                if (updated.length === 0) {
                    const { [categoryName]: _, ...rest } = prev
                    return rest
                }
                return { ...prev, [categoryName]: updated }
            }
            return { ...prev, [categoryName]: [...catItems, item] }
        })
    }

    const isItemSelected = (categoryName, itemId) =>
        (selectedItems[categoryName] || []).some(i => (i._id || i.id) === itemId)

    const getCategoryTotal = (categoryName) =>
        (selectedItems[categoryName] || []).reduce((sum, item) => sum + (item.basePrice || item.price || 0), 0)

    const getTotalItems = () =>
        Object.values(selectedItems).reduce((sum, items) => sum + items.length, 0)

    const getTotalPrice = () =>
        Object.values(selectedItems).reduce(
            (sum, items) => sum + items.reduce((s, i) => s + (i.basePrice || i.price || 0), 0), 0
        )

    const toggleCategory = catName =>
        setExpandedCategories(prev => ({ ...prev, [catName]: !prev[catName] }))

    const toggleDay = day =>
        setAvailableDays(prev =>
            prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]
        )

    const toggleSection = section =>
        setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }))

    // ── Image upload ───────────────────────────────────────────────────────────
    const handleImageUpload = async (e) => {
        const files = Array.from(e.target.files)
        if (comboImages.length + files.length > 5) {
            toast.error('Maximum 5 images allowed')
            return
        }
        setIsUploading(true)
        try {
            const urls = []
            for (const file of files) {
                const url = await uploadImage(file)
                urls.push(url)
            }
            setComboImages(prev => [...prev, ...urls])
            toast.success('Image(s) uploaded!')
        } catch (err) {
            toast.error('Image upload failed')
        } finally {
            setIsUploading(false)
        }
    }

    const removeImage = index =>
        setComboImages(prev => prev.filter((_, i) => i !== index))

    // ── Build payload for API ──────────────────────────────────────────────────
    const buildPayload = (status = 'active') => {
        const categoriesPayload = Object.entries(selectedItems).map(([catName, items]) => ({
            name: catName,
            items: items.map(item => ({
                menuItemId: item._id || null,
                name: item.name,
                price: item.basePrice || item.price || 0,
                isVeg: item.vegType === 'veg'
            }))
        }))

        const finalPriceCalculated = discountType === 'Percentage'
            ? Math.round(Number(originalPrice) - (Number(originalPrice) * Number(discount) / 100))
            : Math.round(Number(originalPrice) - Number(discount))

        const savingsCalculated = Number(originalPrice) - finalPriceCalculated

        return {
            name: comboName,
            serveUpto,
            description,
            images: comboImages,
            vegType: foodType,
            isSpecial,
            categories: categoriesPayload,
            price: finalPriceCalculated,
            originalPrice: Number(originalPrice) || 0,
            discount: Number(discount) || 0,
            discountType,
            unlimitedQuantity,
            taxApplicable,
            serviceCharge,
            savings: savingsCalculated,
            availableDays,
            startTime,
            endTime,
            isHealthy,
            status
        }
    }

    // ── Validation ─────────────────────────────────────────────────────────────
    const validate = () => {
        if (!comboName.trim()) { toast.error('Please enter a combo name'); return false }
        if (comboName.trim().length < 3) { toast.error('Combo name must be at least 3 characters'); return false }
        if (comboImages.length === 0) { toast.error('Please upload at least one image'); return false }
        if (!description.trim()) { toast.error('Please enter a description'); return false }
        if (getTotalItems() === 0) { toast.error('Please add at least one item to the combo'); return false }

        // Pricing validation
        const basePrice = Number(originalPrice);
        if (!originalPrice || isNaN(basePrice) || basePrice <= 0) {
            toast.error('Please enter a valid base price greater than 0');
            return false;
        }

        const discVal = Number(discount);
        if (discount && (isNaN(discVal) || discVal < 0)) {
            toast.error('Discount value must be a positive number');
            return false;
        }

        if (discountType === 'Percentage' && discVal > 100) {
            toast.error('Percentage discount cannot exceed 100%');
            return false;
        }

        if (discountType === 'Flat' && discVal >= basePrice) {
            toast.error('Flat discount cannot exceed or equal the base price');
            return false;
        }

        // Availability validation
        if (availableDays.length === 0) {
            toast.error('Please select at least one available day');
            return false;
        }

        if (!startTime || !endTime) {
            toast.error('Please set both start and end times');
            return false;
        }

        return true
    }

    // ── Save handlers ──────────────────────────────────────────────────────────
    const handleSave = async (status = 'active') => {
        if (!validate()) return
        setIsSaving(true)
        try {
            const payload = buildPayload(status)
            if (isEditMode && editItem._id) {
                await updateCombo(editItem._id, payload)
            } else {
                await createCombo(payload)
            }
            toast.success(`Combo ${isEditMode ? 'updated' : 'created'} successfully!`)
            navigate('/admin/menu')
        } catch (err) {
            toast.error(err.message || 'Failed to save combo')
        } finally {
            setIsSaving(false)
        }
    }

    // ══════════════════════════════════════════════════════════════════════════
    //  RENDER STEPS
    // ══════════════════════════════════════════════════════════════════════════

    const renderBasicDetails = () => (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-8 mt-6">
            <div className="grid grid-cols-[1fr_1fr_1.5fr] gap-8">
                {/* Combo Name */}
                <div>
                    <label className="block text-[14px] font-[500] leading-[18px] text-[#4C4C66] font-manrope mb-2">Combo Name</label>
                    <input
                        type="text"
                        value={comboName}
                        onChange={(e) => setComboName(e.target.value)}
                        placeholder="Enter combo name (e.g. Family Feast)"
                        className="w-full px-4 py-3 border border-[#CCCAC8] rounded-lg text-[16px] font-[500] leading-[22px] font-manrope text-[#1A181B] placeholder:text-[#645E66] focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/10"
                    />
                </div>

                {/* Serve Upto */}
                <div>
                    <label className="block text-[14px] font-[500] leading-[18px] text-[#4C4C66] font-manrope mb-2">Serve upto</label>
                    <div className={`relative ${expandedSections.serveUptoDropdown ? 'z-[100]' : 'z-10'}`}>
                        <button
                            type="button"
                            onClick={() => setExpandedSections(prev => ({ ...prev, serveUptoDropdown: !prev.serveUptoDropdown }))}
                            className={`w-full px-4 py-3 border border-[#CCCAC8] rounded-lg text-[16px] font-[500] font-manrope text-[#1A181B] bg-white cursor-pointer flex items-center justify-between transition-all ${expandedSections.serveUptoDropdown ? 'ring-2 ring-orange-100 border-orange-200' : ''}`}
                        >
                            <span>{serveUpto}</span>
                            <ChevronDown size={16} className={`text-gray-400 transition-transform duration-200 ${expandedSections.serveUptoDropdown ? 'rotate-180' : ''}`} />
                        </button>
                        {expandedSections.serveUptoDropdown && (
                            <div className="absolute top-full left-0 mt-2 w-full bg-white rounded-2xl shadow-[0px_4px_20px_0px_rgba(0,0,0,0.08)] border border-gray-100 min-w-[180px] z-30 animate-in fade-in zoom-in-95 duration-200 overflow-y-auto max-h-[200px] custom-scrollbar scroll-fade">
                                {SERVE_OPTIONS.map((option, index) => (
                                    <div key={option}>
                                        <button type="button" onClick={() => { setServeUpto(option); setExpandedSections(prev => ({ ...prev, serveUptoDropdown: false })) }}
                                            className={`w-full text-left px-5 py-2.5 text-[14px] font-[600] font-manrope transition-colors ${serveUpto === option ? 'bg-[#FE8301] text-white' : 'text-[#645E66] hover:bg-[#FE8301] hover:text-white'}`}>
                                            {option}
                                        </button>
                                        {index < SERVE_OPTIONS.length - 1 && <div className="h-[1px] bg-gray-100 mx-4 my-1" />}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                {/* Combo Image */}
                <div className="row-span-2">
                    <label className="block text-[14px] font-[500] leading-[18px] text-[#4C4C66] font-manrope mb-2">
                        Combo Image <span className="font-normal text-gray-400">(Max 5 images)</span>
                    </label>
                    <div className="flex gap-3">
                        <input type="file" multiple ref={imageInputRef} onChange={handleImageUpload} className="hidden" accept="image/*" />
                        <div
                            onClick={() => !isUploading && imageInputRef.current.click()}
                            className="w-[228px] h-[110px] border-2 border-dashed border-gray-200 rounded-xl flex flex-col items-center justify-center cursor-pointer hover:border-orange-300 hover:bg-orange-50/30 transition-all flex-shrink-0"
                        >
                            {isUploading
                                ? <Loader size={24} className="text-orange-400 animate-spin mb-2" />
                                : <Upload size={24} className="text-gray-400 mb-2" />}
                            <p className="text-[11px] text-gray-500 font-manrope text-center leading-tight">
                                {isUploading ? 'Uploading...' : 'Click to upload or drag and drop'}
                            </p>
                            <p className="text-[10px] text-gray-400 font-manrope mt-0.5">PNG, JPG up to 5MB</p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            {comboImages.map((img, i) => (
                                <div key={i} className="relative w-[80px] h-[80px] rounded-lg overflow-hidden group border border-gray-200">
                                    <img src={img} alt="" className="w-full h-full object-cover object-center" />
                                    <button onClick={() => removeImage(i)}
                                        className="absolute top-1 right-1 w-5 h-5 text-gray-700 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-sm"
                                        style={{ backdropFilter: 'blur(4px)', background: '#FFFFFFCC' }}>
                                        <X size={12} />
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Description */}
                <div className="col-span-1">
                    <label className="block text-[14px] font-[500] leading-[18px] text-[#4C4C66] font-manrope mb-2">Description</label>
                    <textarea
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        placeholder="Describe the combo..."
                        rows={4}
                        className="w-full px-4 py-3 border border-[#CCCAC8] rounded-lg text-[16px] font-[500] font-manrope text-[#1A181B] placeholder:text-[#645E66] focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/10 resize-none"
                    />
                </div>
            </div>

            {/* Bottom Row: Veg/Non-veg + Mark as Special */}
            <div className="flex items-center gap-8 mt-6 pt-4 border-t border-gray-100">
                {[{ val: 'veg', label: 'Veg', color: 'green' }, { val: 'nonveg', label: 'Non-veg', color: 'red' }].map(opt => (
                    <label key={opt.val} className="flex items-center gap-2 cursor-pointer">
                        <input type="radio" name="foodType" value={opt.val} checked={foodType === opt.val} onChange={() => setFoodType(opt.val)} className="sr-only peer" />
                        <div className="w-5 h-5 rounded-full border-2 border-gray-300 peer-checked:border-[#FE8301] flex items-center justify-center">
                            <div className={`w-2.5 h-2.5 rounded-full ${foodType === opt.val ? 'bg-[#FE8301]' : ''}`} />
                        </div>
                        <div className="flex items-center gap-1">
                            <div className={`w-4 h-4 border border-${opt.color}-500 rounded-[3px] flex items-center justify-center p-0.5`}>
                                <div className={`w-2 h-2 rounded-full bg-${opt.color}-500`} />
                            </div>
                            <span className="text-[13px] font-medium text-[#344054] font-manrope">{opt.label}</span>
                        </div>
                    </label>
                ))}
                <label className="flex items-center gap-2 cursor-pointer ml-[160px]">
                    <input type="checkbox" checked={isSpecial} onChange={(e) => setIsSpecial(e.target.checked)}
                        className="w-4 h-4 rounded border-gray-300 cursor-pointer accent-[#FE8301]" />
                    <span className="text-[16px] font-[500] font-manrope text-[#4C4C66]">Mark as Special/Featured Item</span>
                </label>
            </div>
        </div>
    )

    const renderItemBuilder = () => {
        const allHealthy = categorisedItems.length > 0 && categorisedItems.every(cat => categoryHealthyFilters[cat.name])

        return (
            <div className="bg-white rounded-[12px] border border-gray-100 shadow-sm overflow-hidden flex flex-col">
                {/* Panel header */}
                <div className="flex items-center justify-between px-6 py-[16px] bg-[#F9FAFB] border-b border-gray-100">
                    <div className="flex items-center gap-6">
                        <h3 className="text-[15px] font-[700] text-[#1A181B] font-manrope">Select Food Item to add</h3>
                        
                        {/* Global Healthy Mode Toggle */}
                        <div className="flex items-center gap-2 px-3 py-1.5 bg-white border border-gray-200 rounded-lg shadow-sm">
                            <span className="text-[11px] font-[700] text-[#667085] font-manrope uppercase tracking-wider">Healthy Mode All</span>
                            <label className="relative inline-flex items-center cursor-pointer">
                                <input
                                    type="checkbox"
                                    className="sr-only peer"
                                    checked={allHealthy}
                                    onChange={(e) => {
                                        const val = e.target.checked
                                        const newFilters = {}
                                        categorisedItems.forEach(cat => {
                                            newFilters[cat.name] = val
                                        })
                                        setCategoryHealthyFilters(newFilters)
                                    }}
                                />
                                <div className="w-8 h-4 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-4 peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-3 after:w-3 after:transition-all after:shadow-sm peer-checked:bg-[#22C55E]"></div>
                            </label>
                        </div>
                    </div>

                    <button
                        onClick={() => setItemBuilderExpanded(!itemBuilderExpanded)}
                        className="w-10 h-10 flex items-center justify-center rounded-xl bg-white border border-gray-100 text-gray-400 hover:text-gray-600 hover:bg-gray-50 transition-all shadow-sm"
                    >
                        {itemBuilderExpanded ? <Minus size={20} strokeWidth={2.5} /> : <Plus size={20} strokeWidth={2.5} />}
                    </button>
                </div>

            {itemBuilderExpanded && (
                <>
                    {/* Loading spinner while API call is in flight */}
                    {menuLoading && (
                        <div className="flex flex-col items-center justify-center py-14 gap-3">
                            <Loader size={28} className="text-orange-400 animate-spin" />
                            <p className="text-[13px] text-gray-400 font-manrope">Loading menu items…</p>
                        </div>
                    )}

                    {/* Empty state — data loaded but nothing matched */}
                    {!menuLoading && categorisedItems.length === 0 && (
                        <div className="flex flex-col items-center justify-center py-14 gap-2">
                            <p className="text-[14px] font-semibold text-gray-500 font-manrope">No active menu items found</p>
                            <p className="text-[12px] text-gray-400 font-manrope">
                                Add some menu items first, then build your combo here.
                            </p>
                        </div>
                    )}

                    {/* Category list */}
                    {!menuLoading && categorisedItems.length > 0 && (
                        categorisedItems.map((category) => {
                            const isExpanded = expandedCategories[category.name]
                            const catSelectedItems = selectedItems[category.name] || []
                            const catTotal = getCategoryTotal(category.name)
                            
                            // Category-specific filters
                            const vegFilter = categoryVegFilters[category.name] || 'all'
                            const healthyFilter = !!categoryHealthyFilters[category.name]
                            
                            // Apply veg/nonveg filter first, then healthy filter for this category
                            let displayItems = category.items
                            if (vegFilter === 'veg')    displayItems = displayItems.filter(i => i.vegType === 'veg')
                            if (vegFilter === 'nonveg') displayItems = displayItems.filter(i => i.vegType !== 'veg')
                            if (healthyFilter)          displayItems = displayItems.filter(i => i.isHealthy)

                            return (
                                <div key={category.name} className="border-b border-gray-100 last:border-b-0">

                                    {/* ── Category Header row ── */}
                                    <div 
                                        onClick={() => toggleCategory(category.name)}
                                        className={`flex items-center justify-between px-6 py-[12px] cursor-pointer transition-colors ${isExpanded ? 'bg-[#F9F5FF]' : 'bg-white hover:bg-gray-50'}`}
                                    >
                                        {/* Left: name + badges + healthy toggle */}
                                        <div className="flex items-center gap-4 flex-1 min-w-0">
                                            {/* Category name */}
                                            <span className="text-[14px] font-[700] text-[#1A181B] font-manrope whitespace-nowrap min-w-[80px]">
                                                {category.name}
                                            </span>

                                            {/* Veg Filter Button */}
                                            <button
                                                type="button"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setCategoryVegFilters(prev => ({ ...prev, [category.name]: (prev[category.name] === 'veg' ? 'all' : 'veg') }));
                                                }}
                                                className={`flex items-center gap-1.5 px-3 py-[4px] border rounded-[6px] text-[11px] font-[700] font-manrope flex-shrink-0 transition-all
                                                    ${vegFilter === 'veg'
                                                        ? 'border-green-500 bg-white text-[#344054]'
                                                        : 'border-gray-200 bg-white text-[#667085] hover:border-gray-300'}`}
                                            >
                                                <div className={`w-[14px] h-[14px] border ${vegFilter === 'veg' ? 'border-green-500' : 'border-gray-300'} rounded-[3px] flex items-center justify-center`}>
                                                    <div className={`w-[8px] h-[8px] rounded-full bg-green-500`} />
                                                </div>
                                                Veg
                                            </button>

                                            {/* Non-Veg Filter Button */}
                                            <button
                                                type="button"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setCategoryVegFilters(prev => ({ ...prev, [category.name]: (prev[category.name] === 'nonveg' ? 'all' : 'nonveg') }));
                                                }}
                                                className={`flex items-center gap-1.5 px-3 py-[4px] border rounded-[6px] text-[11px] font-[700] font-manrope flex-shrink-0 transition-all
                                                    ${vegFilter === 'nonveg'
                                                        ? 'border-red-500 bg-white text-[#344054]'
                                                        : 'border-gray-200 bg-white text-[#667085] hover:border-gray-300'}`}
                                            >
                                                <div className={`w-[14px] h-[14px] border ${vegFilter === 'nonveg' ? 'border-red-500' : 'border-gray-300'} rounded-[3px] flex items-center justify-center`}>
                                                    <div className="w-[8px] h-[8px] rounded-full bg-red-500" />
                                                </div>
                                                Non-Veg
                                            </button>

                                            {/* Healthy Label + Toggle */}
                                            <div className="flex items-center gap-2 ml-1" onClick={e => e.stopPropagation()}>
                                                <span className="text-[12px] font-[600] text-[#667085] font-manrope">Healthy</span>
                                                <label className="relative inline-flex items-center cursor-pointer">
                                                    <input
                                                        type="checkbox"
                                                        className="sr-only peer"
                                                        checked={healthyFilter}
                                                        onChange={() => setCategoryHealthyFilters(prev => ({ ...prev, [category.name]: !prev[category.name] }))}
                                                    />
                                                    <div className="w-[36px] h-[20px] bg-gray-200 rounded-full peer
                                                        after:content-[''] after:absolute after:top-[2px] after:left-[2px]
                                                        after:bg-white after:rounded-full after:h-[16px] after:w-[16px] after:transition-all
                                                        peer-checked:after:translate-x-[16px] peer-checked:bg-[#22C55E]" />
                                                </label>
                                            </div>

                                            {/* Collapsed summary info */}
                                            {!isExpanded && catSelectedItems.length > 0 && (
                                                <span className="text-[12px] text-[#667085] font-[500] font-manrope ml-2">
                                                    (Total {catSelectedItems.length} items added)
                                                </span>
                                            )}
                                            {!isExpanded && catTotal > 0 && (
                                                <span className="text-[14px] font-[700] text-[#1A181B] font-manrope ml-2">
                                                    ₹{catTotal.toFixed(2)}
                                                </span>
                                            )}
                                        </div>

                                        {/* Right: Chevron toggle */}
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                toggleCategory(category.name);
                                            }}
                                            className="ml-4 flex-shrink-0 text-gray-400 hover:text-gray-600 transition-colors"
                                        >
                                            {isExpanded
                                                ? <ChevronUp size={18} />
                                                : <ChevronDown size={18} />
                                            }
                                        </button>
                                    </div>

                                    {/* ── Expanded content ── */}
                                    {isExpanded && (
                                        <div className="pb-4">
                                            {/* Selected items strip (only when items are chosen) */}
                                            {catSelectedItems.length > 0 && (
                                                <div className="flex items-center justify-between px-6 py-[8px] bg-[#F0F9FF] border-b border-[#E0F2FE] mb-4">
                                                    {/* Tags */}
                                                    <div className="flex items-center flex-wrap gap-x-4 gap-y-1">
                                                        {catSelectedItems.map((item, idx) => (
                                                            <span
                                                                key={item._id || item.id}
                                                                className="inline-flex items-center px-2 py-0.5 rounded-md border border-[#B9E6FE] bg-white gap-1.5 text-[12px] font-[600] text-[#1A181B] font-manrope"
                                                            >
                                                                {idx + 1}. {item.name}
                                                                <button
                                                                    onClick={() => toggleItem(category.name, item)}
                                                                    className="text-gray-400 hover:text-red-500"
                                                                >
                                                                    <X size={12} strokeWidth={2.5} />
                                                                </button>
                                                            </span>
                                                        ))}
                                                    </div>
                                                    {/* Total for category */}
                                                    <span className="text-[13px] font-[600] text-[#667085] font-manrope whitespace-nowrap ml-6">
                                                        Total amount for this category&nbsp;&nbsp;
                                                        <span className="text-[14px] font-[700] text-[#1A181B]">₹{catTotal.toFixed(2)}</span>
                                                    </span>
                                                </div>
                                            )}

                                            {/* Items 4-column grid */}
                                            <div className="grid grid-cols-4 gap-x-4 gap-y-1 px-6">
                                                {displayItems.map((item) => {
                                                    const itemId = item._id || item.id
                                                    const selected = isItemSelected(category.name, itemId)
                                                    const isVeg = item.vegType === 'veg'
                                                    return (
                                                        <label
                                                            key={itemId}
                                                            className={`flex items-center gap-2 px-2 py-[7px] rounded-lg cursor-pointer transition-colors
                                                                ${selected ? 'bg-[#FFF8F0]' : 'hover:bg-gray-50'}`}
                                                        >
                                                            {/* Checkbox */}
                                                            <input
                                                                type="checkbox"
                                                                checked={selected}
                                                                onChange={() => toggleItem(category.name, item)}
                                                                className="w-[15px] h-[15px] flex-shrink-0 rounded border-gray-300 cursor-pointer accent-orange-500"
                                                            />
                                                            
                                                            {/* Name + Indicator together */}
                                                            <div className="flex items-center gap-1.5 flex-1 min-w-0">
                                                                <span className="text-[12px] font-[600] text-[#344054] font-manrope truncate">
                                                                    {item.name}
                                                                </span>
                                                                <div
                                                                    className={`w-[12px] h-[12px] border border-2 flex-shrink-0 rounded-[2px] flex items-center justify-center
                                                                        ${isVeg ? 'border-green-500' : 'border-red-500'}`}
                                                                >
                                                                    <div className={`w-[6px] h-[6px] rounded-full ${isVeg ? 'bg-green-500' : 'bg-red-500'}`} />
                                                                </div>
                                                            </div>
                                                        </label>
                                                    )
                                                })}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )
                        })
                    )}

                    {/* Footer totals */}
                    <div className="flex items-center justify-between px-6 py-[16px] bg-[#FFF4ED] border-t border-[#FFD9C3] mt-2">
                        <span className="text-[14px] font-[600] text-[#1A181B] font-manrope">
                            Total Items added&nbsp;
                            <span className="font-[700] text-[18px] ml-1">{getTotalItems().toString().padStart(2, '0')}</span>
                        </span>
                        <span className="text-[14px] font-[600] text-[#1A181B] font-manrope">
                            Total Price&nbsp;&nbsp;
                            <span className="font-[700] text-[18px] text-[#1A181B] ml-1">₹{getTotalPrice()}</span>
                        </span>
                    </div>
                </>
            )}
        </div>
    )
    }

    const renderPricingRules = () => (
        <div className="mt-6 space-y-4">
            {/* Set Price */}
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
                <button 
                    onClick={() => toggleSection('setPrice')} 
                    className="w-full flex items-center justify-between px-6 py-[14px] bg-[#F9FAFB] border-b border-gray-100 hover:bg-gray-50 transition-colors"
                >
                    <span className="text-[15px] font-[700] text-[#1A181B] font-manrope">Set Price</span>
                    {expandedSections.setPrice ? <Minus size={20} className="text-gray-400" /> : <Plus size={20} className="text-gray-400" />}
                </button>
                {expandedSections.setPrice && (
                    <div className="px-6 pb-6 pt-5 space-y-5">
                        {/* Row 1: Unlimited quantity */}
                        <label className="flex items-center gap-2 cursor-pointer w-fit">
                            <input 
                                type="checkbox" 
                                checked={unlimitedQuantity} 
                                onChange={(e) => setUnlimitedQuantity(e.target.checked)}
                                className="w-[18px] h-[18px] rounded border-gray-300 accent-[#FE8301]"
                            />
                            <span className="text-[14px] font-[500] text-[#645E66] font-manrope">Unlimited quantity available</span>
                        </label>

                        {/* Row 2: Main Price calculations */}
                        <div className="grid grid-cols-4 gap-4 items-start">
                            {/* Base Combo Price */}
                            <div className="space-y-2">
                                <label className="block text-[14px] font-[600] text-[#1A181B] font-manrope">Base Combo Price</label>
                                <div className="relative">
                                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[16px] font-[600] text-[#1A181B]">₹</span>
                                    <input 
                                        type="number" 
                                        value={originalPrice} 
                                        onChange={e => setOriginalPrice(e.target.value)} 
                                        placeholder="289"
                                        className="w-full pl-8 pr-4 py-[11px] border border-[#CCCAC8] rounded-xl text-[16px] font-[600] font-manrope text-[#1A181B] focus:outline-none focus:border-orange-500" 
                                    />
                                </div>
                            </div>

                            {/* Discount Type */}
                            <div className="space-y-2 text-[#475467]">
                                <label className="block text-[14px] font-[600] text-[#1A181B] font-manrope">Discount Type</label>
                                <select 
                                    value={discountType} 
                                    onChange={e => setDiscountType(e.target.value)}
                                    className="w-full px-4 py-[11px] border border-[#CCCAC8] rounded-xl text-[14px] font-[500] font-manrope text-[#475467] bg-white focus:outline-none"
                                >
                                    <option value="Percentage">Discount (%)</option>
                                    <option value="Flat">Flat Amount (₹)</option>
                                </select>
                            </div>

                            {/* Discount Value */}
                            <div className="space-y-2">
                                <label className="block text-[14px] font-[600] text-[#1A181B] font-manrope">Discount Value</label>
                                <input 
                                    type="number" 
                                    value={discount} 
                                    onChange={e => setDiscount(e.target.value)} 
                                    placeholder="Enter value"
                                    className="w-full px-4 py-[11px] border border-[#CCCAC8] rounded-xl text-[14px] font-[500] font-manrope text-[#475467] focus:outline-none focus:border-orange-500" 
                                />
                            </div>

                            {/* Final Price (Calculated) */}
                            <div className="space-y-2">
                                <label className="block text-[14px] font-[600] text-[#1A181B] font-manrope">Final Price (Auto-calculated)</label>
                                <div className="w-full px-4 py-[11px] bg-[#ECFDF3] border border-[#6CE9A6] rounded-xl flex items-center">
                                    <span className="text-[16px] font-[700] text-[#027A48]">₹</span>
                                    <span className="text-[16px] font-[700] text-[#027A48] ml-0.5">
                                        {discountType === 'Percentage' 
                                            ? Math.round(Number(originalPrice) - (Number(originalPrice) * Number(discount) / 100))
                                            : Math.round(Number(originalPrice) - Number(discount))}
                                    </span>
                                </div>
                                {originalPrice && discount && (
                                    <p className="text-[12px] text-[#22C55E] font-[600] font-manrope">
                                        Customer saves ₹{discountType === 'Percentage' 
                                            ? Math.round(Number(originalPrice) * Number(discount) / 100)
                                            : Number(discount)}
                                    </p>
                                )}
                            </div>
                        </div>

                        {/* Row 3: Tax and Service Charges */}
                        <div className="flex items-center gap-8 pt-2">
                            <label className="flex items-center gap-2 cursor-pointer">
                                <input 
                                    type="checkbox" 
                                    checked={taxApplicable} 
                                    onChange={(e) => setTaxApplicable(e.target.checked)}
                                    className="w-[18px] h-[18px] rounded border-gray-300 accent-[#FE8301]"
                                />
                                <span className="text-[14px] font-[500] text-[#645E66] font-manrope">Tax Applicable (GST)</span>
                            </label>
                            <label className="flex items-center gap-2 cursor-pointer">
                                <input 
                                    type="checkbox" 
                                    checked={serviceCharge} 
                                    onChange={(e) => setServiceCharge(e.target.checked)}
                                    className="w-[18px] h-[18px] rounded border-gray-300 accent-[#FE8301]"
                                />
                                <span className="text-[14px] font-[500] text-[#645E66] font-manrope">Service Charge Applicable</span>
                            </label>
                        </div>
                    </div>
                )}
            </div>

            {/* Availability & Schedule */}
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
                <button 
                    onClick={() => toggleSection('availability')} 
                    className="w-full flex items-center justify-between px-6 py-[14px] bg-[#F9FAFB] border-b border-gray-100 hover:bg-gray-50 transition-colors font-manrope"
                >
                    <span className="text-[15px] font-[700] text-[#1A181B]">Availability & Schedule</span>
                    {expandedSections.availability ? <Minus size={20} className="text-gray-400" /> : <Plus size={20} className="text-gray-400" />}
                </button>
                {expandedSections.availability && (
                    <div className="px-6 pb-6 pt-5 flex items-start gap-12">
                        {/* Days Selection */}
                        <div className="flex-1 max-w-[45%]">
                            <p className="text-[14px] font-[600] text-[#1A181B] font-manrope mb-3">Available Days</p>
                            <div className="flex items-center gap-2 flex-wrap">
                                {DAYS.map(day => {
                                    const active = availableDays.includes(day)
                                    return (
                                        <button 
                                            key={day} 
                                            type="button" 
                                            onClick={() => toggleDay(day)}
                                            className={`w-[48px] h-[36px] rounded-lg text-[13px] font-[700] font-manrope transition-all shadow-sm
                                                ${active 
                                                    ? 'bg-[#FE8301] text-white border-[#FE8301]' 
                                                    : 'bg-[#E5E5E9] text-[#666670] hover:bg-gray-300'}`}
                                        >
                                            {day}
                                        </button>
                                    )
                                })}
                            </div>
                        </div>

                        {/* Start Time */}
                        <div className="flex-1 space-y-2">
                            <label className="block text-[14px] font-[600] text-[#1A181B] font-manrope">Start Time</label>
                            <input 
                                type="time" 
                                value={startTime} 
                                onChange={e => setStartTime(e.target.value)}
                                placeholder="00:00 AM/ PM"
                                className="w-full px-4 py-[12px] border border-[#CCCAC8] rounded-xl text-[16px] font-[600] font-manrope text-[#1A181B] focus:outline-none focus:border-orange-500"
                            />
                        </div>

                        {/* End Time */}
                        <div className="flex-1 space-y-2">
                            <label className="block text-[14px] font-[600] text-[#1A181B] font-manrope">End Time</label>
                            <input 
                                type="time" 
                                value={endTime} 
                                onChange={e => setEndTime(e.target.value)}
                                placeholder="00:00 AM/ PM"
                                className="w-full px-4 py-[12px] border border-[#CCCAC8] rounded-xl text-[16px] font-[600] font-manrope text-[#1A181B] focus:outline-none focus:border-orange-500"
                            />
                        </div>
                    </div>
                )}
            </div>

            {/* Health Mode */}
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
                <button onClick={() => toggleSection('healthMode')} className="w-full flex items-center justify-between px-6 py-4 hover:bg-gray-50 transition-colors">
                    <span className="text-[15px] font-bold text-[#1A181B] font-manrope">Health Mode</span>
                    {expandedSections.healthMode ? <Minus size={20} className="text-gray-400" /> : <Plus size={20} className="text-gray-400" />}
                </button>
                {expandedSections.healthMode && (
                    <div className="px-6 pb-5 border-t border-gray-100 pt-4">
                        <label className="flex items-center gap-3 cursor-pointer">
                            <input type="checkbox" checked={isHealthy} onChange={e => setIsHealthy(e.target.checked)}
                                className="w-5 h-5 rounded border-gray-300 cursor-pointer accent-[#22C55E]" />
                            <span className="text-[14px] font-medium text-[#344054] font-manrope">Mark this combo as a Healthy Option</span>
                        </label>
                    </div>
                )}
            </div>

            {/* Preview */}
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
                <button onClick={() => toggleSection('preview')} className="w-full flex items-center justify-between px-6 py-4 hover:bg-gray-50 transition-colors">
                    <div className="flex items-center gap-2">
                        <span className="text-[15px] font-bold text-[#1A181B] font-manrope">Preview</span>
                        <span className="text-[12px] text-[#667085] font-manrope">ⓘ Review your combo before adding in the menu</span>
                    </div>
                    {expandedSections.preview ? <Minus size={20} className="text-gray-400" /> : <Plus size={20} className="text-gray-400" />}
                </button>
                {expandedSections.preview && (
                    <div className="px-6 pb-6 border-t border-gray-100 pt-4">
                        <div className="flex gap-8">
                            {/* Left: Info */}
                            <div className="flex-1">
                                <div className="flex items-center gap-2 mb-3">
                                    <div className={`w-4 h-4 border ${foodType === 'veg' ? 'border-green-500' : 'border-red-500'} rounded-[3px] flex items-center justify-center p-0.5`}>
                                        <div className={`w-2 h-2 rounded-full ${foodType === 'veg' ? 'bg-green-500' : 'bg-red-500'}`} />
                                    </div>
                                    <h4 className="text-[16px] font-bold text-[#1A181B] font-manrope">{comboName || 'Combo Name'}</h4>
                                </div>
                                <p className="text-[13px] text-[#667085] font-manrope leading-relaxed mb-4">
                                    {description || 'Your combo description will appear here…'}
                                </p>
                                <div className="flex items-center gap-4 mb-4">
                                    {availableDays.length > 0 && (
                                        <div className="flex items-center gap-2">
                                            <Calendar size={14} className="text-orange-500" />
                                            {availableDays.map(day => (
                                                <span key={day} className="text-[12px] font-medium text-orange-500 font-manrope">{day}</span>
                                            ))}
                                        </div>
                                    )}
                                    {(startTime || endTime) && (
                                        <div className="flex items-center gap-1">
                                            <Clock size={14} className="text-[#667085]" />
                                            <span className="text-[12px] font-medium text-[#344054] font-manrope">{startTime} - {endTime}</span>
                                        </div>
                                    )}
                                </div>
                                {/* Items list */}
                                <div>
                                    <p className="text-[13px] font-bold text-[#1A181B] font-manrope mb-2">
                                        Items list ({Object.keys(selectedItems).length} categories, {getTotalItems()} items)
                                    </p>
                                    {Object.entries(selectedItems).map(([catName, items]) => (
                                        <div key={catName} className="mb-3">
                                            <p className="text-[13px] font-bold text-[#1A181B] font-manrope">{catName} ({items.length})</p>
                                            <p className="text-[12px] text-[#667085] font-manrope">
                                                {items.map((item, idx) => `${idx + 1}. ${item.name}`).join('  ')}
                                            </p>
                                        </div>
                                    ))}
                                </div>
                            </div>
                            {/* Right: Image + Price */}
                            <div className="w-[300px] flex-shrink-0">
                                <div className="rounded-xl overflow-hidden mb-3">
                                    <img src={comboImages[0] || 'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=400&q=80'}
                                        alt="Combo preview" className="w-full h-[200px] object-cover" />
                                </div>
                                <div className="flex gap-2 mb-4">
                                    {comboImages.slice(0, 5).map((img, i) => (
                                        <div key={i} className="w-[52px] h-[48px] rounded-lg overflow-hidden border-2 border-orange-400">
                                            <img src={img} alt="" className="w-full h-full object-cover" />
                                        </div>
                                    ))}
                                </div>
                                <div className="flex items-baseline gap-2">
                                    <span className="text-[22px] font-bold text-[#1A181B] font-manrope">₹{price || '—'}</span>
                                    {originalPrice && <span className="text-[14px] text-[#98A2B3] line-through font-manrope">₹{originalPrice}</span>}
                                    {discount && <span className="text-[13px] text-[#22C55E] font-semibold font-manrope">{discount}% off</span>}
                                </div>
                                {originalPrice && price && (
                                    <p className="text-[12px] text-[#22C55E] font-semibold font-manrope">
                                        Saves ₹{(Number(originalPrice) - Number(price)).toFixed(2)}
                                    </p>
                                )}
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    )

    // ══════════════════════════════════════════════════════════════════════════
    return (
        <div className="h-full flex flex-col">
            {/* Back Button */}
            <button onClick={() => navigate('/admin/menu')}
                className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-[#CCCCCC] rounded-lg text-[14px] font-[500] text-[#645E66] font-manrope hover:bg-gray-50 transition-colors w-fit mb-6">
                <ArrowLeft size={16} />
                Back to Menu Management
            </button>

            {/* Page Title */}
            <div className="mb-6">
                <h1 className="text-[20px] font-bold text-[#1A181B] font-manrope">{isEditMode ? 'Edit Combo Menu' : 'Add New Combo Menu'}</h1>
                <p className="text-[16px] font-semibold text-[#645E66] font-manrope mt-1">
                    {isEditMode ? 'Update combo bundle details and save changes' : 'Create a combo bundle with multiple items at a special price'}
                </p>
            </div>

            {/* Step Indicator */}
            <div className="flex items-center gap-3 mb-2">
                {steps.map((step) => (
                    <button key={step.number} onClick={() => setCurrentStep(step.number)}
                        className={`flex items-center gap-2.5 px-5 py-2.5 rounded-[8px] text-[14px] font-[600] font-manrope transition-all ${currentStep === step.number
                            ? 'bg-[#FE8301] text-white border border-[#FE8301] shadow-sm'
                            : 'bg-white text-[#645E66] border border-[#CCCCCC]'}`}>
                        <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[14px] font-[600] font-manrope ${currentStep === step.number
                            ? 'bg-transparent border-2 border-white text-white'
                            : 'bg-transparent border border-[#CCCCCC] text-[#645E66]'}`}>
                            {currentStep > step.number ? <Check size={14} /> : step.number}
                        </span>
                        {step.label}
                    </button>
                ))}
            </div>

            {/* Step Content */}
            <div className="flex-1 overflow-y-auto no-scrollbar pb-6">
                {currentStep === 1 && renderBasicDetails()}
                {currentStep === 2 && renderItemBuilder()}
                {currentStep === 3 && renderPricingRules()}
            </div>

            {/* Bottom Navigation */}
            <div className="flex items-center justify-end gap-3 py-4 border-t border-gray-100 mt-auto">
                {currentStep > 1 && (
                    <button onClick={() => setCurrentStep(currentStep - 1)}
                        className="px-6 py-2.5 border border-orange-500 text-orange-500 font-semibold rounded-xl hover:bg-orange-50 transition-colors font-manrope text-[14px] flex items-center gap-2">
                        <ArrowLeft size={16} /> Previous
                    </button>
                )}
                {currentStep < 3 ? (
                    <button onClick={() => setCurrentStep(currentStep + 1)}
                        className="px-6 py-2.5 bg-[#FE8301] text-white font-semibold rounded-[12px] hover:bg-orange-600 shadow-sm transition-all font-manrope text-[14px] flex items-center gap-2">
                        Next <ArrowRight size={16} />
                    </button>
                ) : (
                    <div className="flex items-center gap-3">
                        <button onClick={() => handleSave('draft')} disabled={isSaving}
                            className="px-6 py-2.5 border border-orange-500 text-orange-500 font-semibold rounded-xl hover:bg-orange-50 transition-colors font-manrope text-[14px] flex items-center gap-2 disabled:opacity-50">
                            {isSaving ? <Loader size={16} className="animate-spin" /> : '📄'} Save as Draft
                        </button>
                        <button onClick={() => handleSave('active')} disabled={isSaving}
                            className="px-6 py-2.5 bg-[#FE8301] text-white font-semibold rounded-xl hover:bg-orange-600 shadow-sm transition-all font-manrope text-[14px] flex items-center gap-2 disabled:opacity-50">
                            {isSaving ? <Loader size={16} className="animate-spin" /> : '✅'} Save Combo
                        </button>
                    </div>
                )}
            </div>
        </div>
    )
}

export default AddComboMenu
