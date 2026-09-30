import React, { useState, useMemo, useEffect } from 'react'
import { X, Plus, ChevronDown, ChevronUp, Search, Check, Save } from 'lucide-react'

// Mock Data for Food Items
const foodCategories = [
    {
        id: 'starter',
        title: 'Starter',
        items: [
            { id: 101, name: 'French Fries (Large)', type: 'veg', price: 149, healthy: false },
            { id: 102, name: 'Garlic Bread (Regular)', type: 'veg', price: 120, healthy: true },
            { id: 103, name: 'Chicken Wings (6pcs)', type: 'non-veg', price: 249, healthy: false },
            { id: 104, name: 'Paneer Tikka', type: 'veg', price: 220, healthy: true },
            { id: 105, name: 'Corn Cheese Balls', type: 'veg', price: 180, healthy: false },
            { id: 106, name: 'Chicken Nuggets', type: 'non-veg', price: 199, healthy: false },
            { id: 107, name: 'Veg Salad', type: 'veg', price: 150, healthy: true },
            { id: 108, name: 'Spring Rolls', type: 'veg', price: 160, healthy: false },
        ]
    },
    {
        id: 'main_course',
        title: 'Main Course',
        items: [
            { id: 201, name: 'Paneer Butter Masala', type: 'veg', price: 280, healthy: false },
            { id: 202, name: 'Butter Chicken', type: 'non-veg', price: 320, healthy: false },
            { id: 203, name: 'Dal Makhani', type: 'veg', price: 240, healthy: true },
            { id: 204, name: 'Veg Biryani', type: 'veg', price: 220, healthy: true },
            { id: 205, name: 'Chicken Biryani', type: 'non-veg', price: 290, healthy: false },
            { id: 206, name: 'Naan (Butter)', type: 'veg', price: 40, healthy: false },
            { id: 207, name: 'Roti', type: 'veg', price: 25, healthy: true },
            { id: 208, name: 'Jeera Rice', type: 'veg', price: 120, healthy: true },
        ]
    },
    {
        id: 'dessert',
        title: 'Dessert',
        items: [
            { id: 301, name: 'Vanilla Ice Cream', type: 'veg', price: 90, healthy: false },
            { id: 302, name: 'Gulab Jamun (2pcs)', type: 'veg', price: 80, healthy: false },
            { id: 303, name: 'Chocolate Brownie', type: 'veg', price: 120, healthy: false },
            { id: 304, name: 'Fruit Salad', type: 'veg', price: 150, healthy: true },
            { id: 305, name: 'Rasgulla', type: 'veg', price: 80, healthy: false },
            { id: 306, name: 'Moong Dal Halwa', type: 'veg', price: 110, healthy: false },
        ]
    },
    {
        id: 'live_counters',
        title: 'Live Counters (Optional)',
        items: [
            { id: 401, name: 'Dosa Counter', type: 'veg', price: 5000, healthy: true },
            { id: 402, name: 'Pasta Counter', type: 'veg', price: 6000, healthy: false },
            { id: 403, name: 'Chaat Counter', type: 'veg', price: 4500, healthy: false },
            { id: 404, name: 'Mocktail Bar', type: 'veg', price: 8000, healthy: true },
        ]
    }
]

const VegIcon = () => (
    <div className="w-4 h-4 border border-green-600 flex items-center justify-center p-0.5 rounded-sm">
        <div className="w-2 h-2 bg-green-600 rounded-full"></div>
    </div>
)

const NonVegIcon = () => (
    <div className="w-4 h-4 border border-red-600 flex items-center justify-center p-0.5 rounded-sm">
        <div className="w-2 h-2 bg-red-600 rounded-full"></div>
    </div>
)

class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error) {
        return { hasError: true, error };
    }

    componentDidCatch(error, errorInfo) {
        console.error("AddPackageModal Error:", error, errorInfo);
    }

    render() {
        if (this.state.hasError) {
            return (
                <div className="p-8 flex flex-col items-center justify-center h-full text-center">
                    <h3 className="text-red-600 font-bold mb-2">Something went wrong.</h3>
                    <p className="text-gray-600 text-sm">{this.state.error?.message}</p>
                </div>
            );
        }
        return this.props.children;
    }
}

const AddPackageModal = ({ isOpen, onClose, onSave, packageData }) => {
    // Form State
    const [formData, setFormData] = useState({
        name: '',
        type: '',
        pricePerPerson: '',
        minPeople: '',
        maxPeople: '',
        description: '',
        isPureVeg: false
    })
    // Per-field validation errors. Keys match the input id attributes
    // (`pkg-name`, `pkg-type`, etc.) so we can focus the bad one on save.
    const [errors, setErrors] = useState({})

    // Update a single formData field + clear that field's error.
    const setField = (key, value) => {
        setFormData(prev => ({ ...prev, [key]: value }))
        if (errors[key]) setErrors(prev => ({ ...prev, [key]: undefined }))
    }

    // Package Type custom dropdown
    const [showTypeDropdown, setShowTypeDropdown] = useState(false)
    const packageTypes = ['Wedding', 'Birthday', 'Corporate']

    // Expanded Accordions State
    const [expandedCategories, setExpandedCategories] = useState({
        starter: true,
        main_course: false,
        dessert: false,
        live_counters: false
    })

    // Category Filters
    const [categoryFilters, setCategoryFilters] = useState({
        starter: { veg: true, nonVeg: true, healthy: false },
        main_course: { veg: true, nonVeg: true, healthy: false },
        dessert: { veg: true, nonVeg: true, healthy: false },
        live_counters: { veg: true, nonVeg: true, healthy: false }
    })

    // Selected Items (Set of IDs)
    const [selectedItems, setSelectedItems] = useState(new Set())

    // Package Features
    const totalStats = useMemo(() => {
        let count = 0
        let price = 0
        foodCategories.forEach(cat => {
            cat.items.forEach(item => {
                if (selectedItems.has(item.id)) {
                    count++
                    price += item.price
                }
            })
        })
        return { count, price }
    }, [selectedItems])

    // Features State
    const [features, setFeatures] = useState([])
    const [currentFeature, setCurrentFeature] = useState('')

    useEffect(() => {
        if (isOpen) {
            if (packageData) {
                setFormData({
                    name: packageData.name || '',
                    type: packageData.type || '',
                    pricePerPerson: packageData.price ? String(packageData.price).replace(/[^0-9.]/g, '') : '',
                    minPeople: packageData.minPeople || '',
                    maxPeople: packageData.maxPeople || '',
                    description: packageData.description || '',
                    isPureVeg: packageData.isPureVeg || false
                })
                setFeatures(packageData.features || [])

                // Set expanders open by default for edit mode
                setExpandedCategories({
                    starter: true,
                    main_course: true,
                    dessert: true,
                    live_counters: false
                })

                // Collect IDs of items to pre-select based on the package data names
                const newSelectedItems = new Set()
                const packageItemsLists = [
                    ...(packageData.starters || []),
                    ...(packageData.mainCourse || []),
                    ...(packageData.desserts || []),
                    ...(packageData.drinks || [])
                ].map(item => item.name.toLowerCase())

                foodCategories.forEach(cat => {
                    cat.items.forEach(item => {
                        if (packageItemsLists.includes(item.name.toLowerCase())) {
                            newSelectedItems.add(item.id)
                        }
                    })
                })
                setSelectedItems(newSelectedItems)

            } else {
                setFormData({
                    name: '',
                    type: '',
                    pricePerPerson: '',
                    minPeople: '',
                    maxPeople: '',
                    description: '',
                    isPureVeg: false
                })
                setFeatures([])
                setExpandedCategories({
                    starter: true,
                    main_course: false,
                    dessert: false,
                    live_counters: false
                })
                setSelectedItems(new Set())
            }
        }
    }, [isOpen, packageData])

    // ------------------- Handlers -------------------

    const toggleAccordion = (catId) => {
        setExpandedCategories(prev => {
            const isCurrentlyOpen = prev[catId]
            // Close all, then open the clicked one only if it was closed
            const allClosed = Object.keys(prev).reduce((acc, key) => {
                acc[key] = false
                return acc
            }, {})
            return { ...allClosed, [catId]: !isCurrentlyOpen }
        })
    }

    const toggleFilter = (catId, filterKey) => {
        setCategoryFilters(prev => ({
            ...prev,
            [catId]: {
                ...prev[catId],
                [filterKey]: !prev[catId][filterKey]
            }
        }))
    }

    const toggleItemSelection = (itemId) => {
        const newSet = new Set(selectedItems)
        if (newSet.has(itemId)) {
            newSet.delete(itemId)
        } else {
            newSet.add(itemId)
        }
        setSelectedItems(newSet)
    }

    const calculateCategoryTotal = (catId) => {
        const cat = foodCategories.find(c => c.id === catId)
        if (!cat) return 0
        let sum = 0
        cat.items.forEach(item => {
            if (selectedItems.has(item.id)) {
                sum += item.price
            }
        })
        return sum
    }

    const handleAddFeature = () => {
        if (!currentFeature.trim()) return
        setFeatures(prev => [...prev, currentFeature.trim()])
        setCurrentFeature('')
    }

    const removeFeature = (indexToRemove) => {
        setFeatures(prev => prev.filter((_, index) => index !== indexToRemove))
    }

    console.log("AddPackageModal render, isOpen:", isOpen)

    if (!isOpen) return null

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center font-manrope p-4">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-black/40 backdrop-blur-sm"
                onClick={onClose}
            />

            {/* Modal Content */}
            <div className="relative w-full max-w-[900px] h-[95vh] bg-[#F9FAFB] rounded-[24px] shadow-2xl flex flex-col animate-in zoom-in-95 duration-200 overflow-hidden">
                <ErrorBoundary>
                    {/* Header */}
                    <div className="px-8 py-4 bg-[#FFF7ED] border-b border-[#FED7AA] flex justify-between items-center shrink-0">
                        <h2 className="text-[20px] font-[700] text-[#1A181B]">
                            Create New Package
                        </h2>
                        <button
                            onClick={onClose}
                            className="text-gray-400 hover:text-gray-600 transition-colors"
                        >
                            <X size={24} />
                        </button>
                    </div>

                    {/* Scrollable Body */}
                    <div className="flex-1 overflow-y-auto p-8 space-y-6">
                        {/* Top Top Section (Forms) */}
                        <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm space-y-5">
                            <div className="grid grid-cols-2 gap-6">
                                <div>
                                    <label htmlFor="pkg-name" className="block text-[13px] font-semibold text-[#1A181B] mb-2">
                                        Package name <span className="text-red-500" aria-hidden="true">*</span>
                                    </label>
                                    <input
                                        id="pkg-name"
                                        type="text"
                                        placeholder="e.g. Silver Wedding Package, Corporate Lunch"
                                        aria-required="true"
                                        aria-invalid={errors.name ? 'true' : 'false'}
                                        aria-describedby={errors.name ? 'pkg-name-err' : undefined}
                                        className={`w-full px-4 py-2.5 rounded-xl border focus:outline-none focus:ring-2 text-[14px] ${errors.name ? 'border-red-400 focus:ring-red-200' : 'border-gray-200 focus:ring-[#F97316]'}`}
                                        value={formData.name}
                                        onChange={e => setField('name', e.target.value)}
                                    />
                                    {errors.name && (
                                        <p id="pkg-name-err" role="alert" className="text-xs text-red-600 mt-1 flex items-center gap-1">
                                            <span aria-hidden="true">⚠</span>{errors.name}
                                        </p>
                                    )}
                                </div>
                                <div>
                                    <label htmlFor="pkg-type" className="block text-[13px] font-semibold text-[#1A181B] mb-2">
                                        Package type <span className="text-red-500" aria-hidden="true">*</span>
                                    </label>
                                    <div className="relative">
                                        <button
                                            id="pkg-type"
                                            type="button"
                                            aria-required="true"
                                            aria-haspopup="listbox"
                                            aria-expanded={showTypeDropdown}
                                            aria-invalid={errors.type ? 'true' : 'false'}
                                            aria-describedby={errors.type ? 'pkg-type-err' : undefined}
                                            onClick={() => setShowTypeDropdown(!showTypeDropdown)}
                                            className={`flex items-center justify-between w-full px-4 py-2.5 rounded-xl border bg-white text-[14px] outline-none transition-all ${showTypeDropdown ? 'ring-2 ring-orange-100 border-orange-300' : errors.type ? 'border-red-400' : 'border-gray-200'}`}
                                        >
                                            <span className={formData.type ? 'text-[#1A181B]' : 'text-gray-400'}>
                                                {formData.type ? formData.type.charAt(0).toUpperCase() + formData.type.slice(1) : 'Select'}
                                            </span>
                                            <ChevronDown className={`text-gray-400 transition-transform duration-200 ${showTypeDropdown ? 'rotate-180' : ''}`} size={18} />
                                        </button>

                                        {showTypeDropdown && (
                                            <div className="absolute top-full left-0 mt-2 w-full bg-white rounded-2xl shadow-[0px_4px_20px_0px_rgba(0,0,0,0.08)] border border-gray-100 z-30 animate-in fade-in zoom-in-95 duration-200 overflow-hidden">
                                                {packageTypes.map((type, index) => (
                                                    <div key={type}>
                                                        <button
                                                            type="button"
                                                            onClick={() => {
                                                                setField('type', type.toLowerCase())
                                                                setShowTypeDropdown(false)
                                                            }}
                                                            className={`w-full text-left px-5 py-2.5 text-sm font-medium font-manrope transition-colors ${formData.type === type.toLowerCase() ? 'bg-[#FE8301] text-white!' : 'text-gray-600 hover:bg-[#FE8301] hover:text-white!'}`}
                                                        >
                                                            {type}
                                                        </button>
                                                        {index < packageTypes.length - 1 && <div className="h-[1px] bg-gray-100 mx-4 my-1" />}
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                    {errors.type && (
                                        <p id="pkg-type-err" role="alert" className="text-xs text-red-600 mt-1 flex items-center gap-1">
                                            <span aria-hidden="true">⚠</span>{errors.type}
                                        </p>
                                    )}
                                </div>
                            </div>

                            <div className="grid grid-cols-3 gap-6">
                                <div className="col-span-1">
                                    <label htmlFor="pkg-pricePerPerson" className="block text-[13px] font-semibold text-[#1A181B] mb-2">
                                        Price per person (₹) <span className="text-red-500" aria-hidden="true">*</span>
                                    </label>
                                    <input
                                        id="pkg-pricePerPerson"
                                        type="number"
                                        inputMode="decimal"
                                        placeholder="500"
                                        min="0"
                                        aria-required="true"
                                        aria-invalid={errors.pricePerPerson ? 'true' : 'false'}
                                        aria-describedby={errors.pricePerPerson ? 'pkg-pricePerPerson-err' : undefined}
                                        className={`w-full px-4 py-2.5 rounded-xl border focus:outline-none focus:ring-2 text-[14px] ${errors.pricePerPerson ? 'border-red-400 focus:ring-red-200' : 'border-gray-200 focus:ring-[#F97316]'}`}
                                        value={formData.pricePerPerson}
                                        onChange={e => setField('pricePerPerson', e.target.value)}
                                    />
                                    {errors.pricePerPerson && (
                                        <p id="pkg-pricePerPerson-err" role="alert" className="text-xs text-red-600 mt-1 flex items-center gap-1">
                                            <span aria-hidden="true">⚠</span>{errors.pricePerPerson}
                                        </p>
                                    )}
                                </div>
                                <div className="col-span-2 grid grid-cols-2 gap-4">
                                    <div>
                                        <label htmlFor="pkg-minPeople" className="block text-[13px] font-semibold text-gray-500 mb-2">
                                            Minimum people <span className="text-red-500" aria-hidden="true">*</span>
                                        </label>
                                        <input
                                            id="pkg-minPeople"
                                            type="number"
                                            inputMode="numeric"
                                            placeholder="e.g. 20"
                                            min="1"
                                            aria-required="true"
                                            aria-invalid={errors.minPeople ? 'true' : 'false'}
                                            aria-describedby={errors.minPeople ? 'pkg-minPeople-err' : undefined}
                                            className={`w-full px-4 py-2.5 rounded-xl border focus:outline-none focus:ring-2 text-[14px] ${errors.minPeople ? 'border-red-400 focus:ring-red-200' : 'border-gray-200 focus:ring-[#F97316]'}`}
                                            value={formData.minPeople}
                                            onChange={e => setField('minPeople', e.target.value)}
                                        />
                                        {errors.minPeople && (
                                            <p id="pkg-minPeople-err" role="alert" className="text-xs text-red-600 mt-1 flex items-center gap-1">
                                                <span aria-hidden="true">⚠</span>{errors.minPeople}
                                            </p>
                                        )}
                                    </div>
                                    <div>
                                        <label htmlFor="pkg-maxPeople" className="block text-[13px] font-semibold text-gray-500 mb-2">
                                            Maximum people <span className="text-gray-400 font-normal">(optional)</span>
                                        </label>
                                        <input
                                            id="pkg-maxPeople"
                                            type="number"
                                            inputMode="numeric"
                                            placeholder="e.g. 100"
                                            min="1"
                                            aria-invalid={errors.maxPeople ? 'true' : 'false'}
                                            aria-describedby={errors.maxPeople ? 'pkg-maxPeople-err' : undefined}
                                            className={`w-full px-4 py-2.5 rounded-xl border focus:outline-none focus:ring-2 text-[14px] ${errors.maxPeople ? 'border-red-400 focus:ring-red-200' : 'border-gray-200 focus:ring-[#F97316]'}`}
                                            value={formData.maxPeople}
                                            onChange={e => setField('maxPeople', e.target.value)}
                                        />
                                        {errors.maxPeople && (
                                            <p id="pkg-maxPeople-err" role="alert" className="text-xs text-red-600 mt-1 flex items-center gap-1">
                                                <span aria-hidden="true">⚠</span>{errors.maxPeople}
                                            </p>
                                        )}
                                    </div>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-6">
                                <div>
                                    <label htmlFor="pkg-description" className="block text-[13px] font-semibold text-[#1A181B] mb-2">
                                        Description <span className="text-red-500" aria-hidden="true">*</span>
                                    </label>
                                    <textarea
                                        id="pkg-description"
                                        rows={3}
                                        placeholder="What's included — courses, decor, service hours, etc."
                                        aria-required="true"
                                        aria-invalid={errors.description ? 'true' : 'false'}
                                        aria-describedby={errors.description ? 'pkg-description-err' : undefined}
                                        className={`w-full px-4 py-2.5 rounded-xl border focus:outline-none focus:ring-2 text-[14px] resize-none ${errors.description ? 'border-red-400 focus:ring-red-200' : 'border-gray-200 focus:ring-[#F97316]'}`}
                                        value={formData.description}
                                        onChange={e => setField('description', e.target.value)}
                                    />
                                    {errors.description && (
                                        <p id="pkg-description-err" role="alert" className="text-xs text-red-600 mt-1 flex items-center gap-1">
                                            <span aria-hidden="true">⚠</span>{errors.description}
                                        </p>
                                    )}
                                </div>
                                <div className="flex items-center pt-8">
                                    <label className="flex items-center gap-3 cursor-pointer">
                                        <div className={`w-10 h-5 rounded-full relative transition-colors ${formData.isPureVeg ? 'bg-[#22C55E]' : 'bg-gray-300'}`}>
                                            <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow-sm transition-all ${formData.isPureVeg ? 'right-0.5' : 'left-0.5'}`}></div>
                                        </div>
                                        <span className="text-[14px] font-[600] text-gray-700">Pure Vegetarian</span>
                                    </label>
                                </div>
                            </div>
                        </div>

                        {/* Food Selection Section */}
                        <div className="bg-[#F3F4F6] rounded-2xl p-4">
                            <div className="flex justify-between items-center mb-4 px-2">
                                <h3 className="text-[16px] font-[700] text-[#1A181B]">Select Food Item to add</h3>
                                <hr className="flex-1 ml-4 border-gray-300" />
                            </div>

                            <div className="space-y-3">
                                {foodCategories.map((category) => {
                                    const isExpanded = expandedCategories[category.id]
                                    const filters = categoryFilters[category.id] || {} // Safety check
                                    const catTotal = calculateCategoryTotal(category.id)

                                    // Filter items based on category filters
                                    const filteredItems = category.items.filter(item => {
                                        if (item.type === 'veg' && filters.veg === false) return false
                                        if (item.type === 'non-veg' && filters.nonVeg === false) return false
                                        if (filters.healthy && !item.healthy) return false
                                        return true
                                    })

                                    // Selected items in this category for the chips view
                                    const catSelectedItems = category.items.filter(item => selectedItems.has(item.id))

                                    return (
                                        <div key={category.id} className="bg-white rounded-xl overflow-hidden border border-gray-200 shadow-sm">
                                            {/* Accordion Header */}
                                            <div className="p-4 flex items-center justify-between bg-white">
                                                <div className="flex items-center gap-6">
                                                    <button
                                                        onClick={() => toggleAccordion(category.id)}
                                                        className="flex items-center gap-2 font-[700] text-[15px] text-[#1A181B] hover:text-[#F97316]"
                                                    >
                                                        {category.title}
                                                    </button>

                                                    {/* Filters */}
                                                    <div className="flex items-center gap-3">
                                                        <button
                                                            onClick={() => toggleFilter(category.id, 'veg')}
                                                            className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-[12px] font-[600] border transition-colors ${filters.veg ? 'bg-green-50 border-green-200 text-green-700' : 'bg-gray-50 border-gray-200 text-gray-500'}`}
                                                        >
                                                            <VegIcon /> Veg
                                                        </button>
                                                        <button
                                                            onClick={() => toggleFilter(category.id, 'nonVeg')}
                                                            className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-[12px] font-[600] border transition-colors ${filters.nonVeg ? 'bg-red-50 border-red-200 text-red-700' : 'bg-gray-50 border-gray-200 text-gray-500'}`}
                                                        >
                                                            <NonVegIcon /> Non-Veg
                                                        </button>
                                                        <div className="flex items-center gap-2 ml-2">
                                                            <span className="text-[12px] text-gray-500 font-[500]">Healthy</span>
                                                            <button
                                                                onClick={() => toggleFilter(category.id, 'healthy')}
                                                                className={`w-9 h-5 rounded-full relative transition-colors ${filters.healthy ? 'bg-green-500' : 'bg-gray-300'}`}
                                                            >
                                                                <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow-sm transition-all ${filters.healthy ? 'right-0.5' : 'left-0.5'}`}></div>
                                                            </button>
                                                        </div>
                                                    </div>
                                                </div>
                                                <button onClick={() => toggleAccordion(category.id)} className="text-gray-400">
                                                    {isExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                                                </button>
                                            </div>

                                            {/* Expanded Content */}
                                            {isExpanded && (
                                                <div className="px-4 pb-4 bg-[#F8F9FA]/50 border-t border-gray-100">
                                                    {/* Selected Chips Row */}
                                                    {catSelectedItems.length > 0 && (
                                                        <div className="py-3 flex flex-wrap gap-2 border-b border-gray-100 mb-3">
                                                            {catSelectedItems.map(item => (
                                                                <div key={item.id} className="bg-white border border-gray-200 rounded-full pl-3 pr-1 py-1 flex items-center gap-2 text-[12px] shadow-sm">
                                                                    <span className="font-[600] text-gray-700">{item.id}. {item.name}</span>
                                                                    <button
                                                                        onClick={() => toggleItemSelection(item.id)}
                                                                        className="w-5 h-5 rounded-full hover:bg-gray-100 flex items-center justify-center text-gray-400"
                                                                    >
                                                                        <X size={14} />
                                                                    </button>
                                                                </div>
                                                            ))}
                                                            <div className="ml-auto text-[13px] font-[700] text-[#1A181B]">
                                                                Total amount for this category <span className="text-[#1A181B]">₹{catTotal.toFixed(2)}</span>
                                                            </div>
                                                        </div>
                                                    )}

                                                    {/* Items Grid */}
                                                    <div className="grid grid-cols-4 gap-4 mt-2">
                                                        {filteredItems.map(item => {
                                                            const isSelected = selectedItems.has(item.id)
                                                            return (
                                                                <label key={item.id} className="flex items-center gap-3 cursor-pointer group p-2 hover:bg-white rounded-lg transition-colors">
                                                                    <div className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${isSelected ? 'bg-green-500 border-green-500' : 'border-gray-300 bg-white group-hover:border-green-400'}`}>
                                                                        {isSelected && <Check size={14} className="text-white" />}
                                                                    </div>
                                                                    <input
                                                                        type="checkbox"
                                                                        className="hidden"
                                                                        checked={isSelected}
                                                                        onChange={() => toggleItemSelection(item.id)}
                                                                    />
                                                                    <span className="text-[13px] text-gray-600 font-[500] truncate flex-1">{item.name}</span>
                                                                    <div className="shrink-0">
                                                                        {item.type === 'veg' ? <VegIcon /> : <NonVegIcon />}
                                                                    </div>
                                                                </label>
                                                            )
                                                        })}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    )
                                })}
                            </div>
                        </div>

                        {/* Summary Bar */}
                        <div className="bg-[#FFF7ED] rounded-xl px-6 py-4 flex justify-between items-center border border-[#FED7AA]">
                            <div className="flex items-center gap-2">
                                <span className="text-[14px] text-gray-600 font-[500]">Total Items added</span>
                                <span className="text-[16px] font-[700] text-[#1A181B]">{String(totalStats.count).padStart(2, '0')}</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="text-[14px] text-gray-600 font-[500]">Total Price</span>
                                <span className="text-[18px] font-[800] text-[#1A181B]">₹{totalStats.price.toFixed(2)}</span>
                            </div>
                        </div>

                        {/* Package Features */}
                        <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
                            <label className="block text-[13px] font-[600] text-[#1A181B] mb-2">Package Features</label>
                            <div className="flex gap-3 mb-3">
                                <input
                                    type="text"
                                    value={currentFeature}
                                    onChange={(e) => setCurrentFeature(e.target.value)}
                                    placeholder="e.g. Premium Decoration"
                                    className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#F97316] text-[14px]"
                                />
                                <button
                                    onClick={handleAddFeature}
                                    className="bg-[#F97316] text-white px-6 rounded-xl font-[600] flex items-center gap-2 hover:bg-[#EA580C] transition-colors"
                                >
                                    <Plus size={20} /> Add
                                </button>
                            </div>
                            <div className="flex flex-wrap gap-2">
                                {features.map((feature, i) => (
                                    <span key={i} className="bg-[#E0F2FE] text-[#0284C7] px-3 py-1 rounded-full text-[12px] font-[600] flex items-center gap-2">
                                        {feature}
                                        <button onClick={() => removeFeature(i)} className="hover:text-red-500"><X size={14} /></button>
                                    </span>
                                ))}
                                {/* Mock default features if empty */}
                                {features.length === 0 && (
                                    <>
                                        <span className="bg-[#E0F2FE] text-[#0284C7] px-3 py-1 rounded-full text-[12px] font-[600] flex items-center gap-2">
                                            Premium Decoration <button className="hover:text-red-500"><X size={14} /></button>
                                        </span>
                                        <span className="bg-[#E0F2FE] text-[#0284C7] px-3 py-1 rounded-full text-[12px] font-[600] flex items-center gap-2">
                                            Standard Service <button className="hover:text-red-500"><X size={14} /></button>
                                        </span>
                                    </>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Footer */}
                    <div className="p-6 border-t border-gray-100 flex gap-4 bg-white z-10 shrink-0">
                        <button
                            onClick={onClose}
                            className="flex-1 py-3.5 border border-[#F97316] text-[#F97316] rounded-xl font-[700] flex items-center justify-center gap-2 hover:bg-orange-50 transition-colors text-[16px]"
                        >
                            <X size={20} /> Cancel
                        </button>
                        <button
                            onClick={() => {
                                // Inline validation gate — populates `errors` so
                                // each missing field gets a red border + alert.
                                const errs = {}
                                if (!formData.name.trim())                                    errs.name = 'Package name is required'
                                if (!formData.type)                                           errs.type = 'Please select a package type'
                                const price = Number(formData.pricePerPerson)
                                if (formData.pricePerPerson === '' || isNaN(price) || price <= 0)
                                    errs.pricePerPerson = 'Price per person must be greater than zero'
                                const minP = Number(formData.minPeople)
                                if (formData.minPeople === '' || isNaN(minP) || minP <= 0)
                                    errs.minPeople = 'Minimum people is required'
                                const maxP = Number(formData.maxPeople)
                                if (formData.maxPeople !== '' && !isNaN(maxP) && maxP > 0 && maxP < minP)
                                    errs.maxPeople = `Maximum (${maxP}) cannot be less than minimum (${minP})`
                                if (!formData.description.trim())                             errs.description = 'Description is required'
                                setErrors(errs)
                                if (Object.keys(errs).length) {
                                    const order = ['name', 'type', 'pricePerPerson', 'minPeople', 'maxPeople', 'description']
                                    const firstBad = order.find(k => errs[k])
                                    if (firstBad) {
                                        setTimeout(() => {
                                            const el = document.getElementById(`pkg-${firstBad}`)
                                            if (el) { try { el.focus() } catch { /* noop */ } el.scrollIntoView?.({ behavior: 'smooth', block: 'center' }) }
                                        }, 0)
                                    }
                                    return
                                }
                                if (onSave) {
                                    const savedPackage = {
                                        ...packageData,
                                        id: packageData ? packageData.id : Date.now(),
                                        name: formData.name,
                                        // Package type (Wedding / Birthday / Corporate) — collected by
                                        // the required dropdown above. Was previously dropped on save
                                        // because it wasn't spread into this payload, so the modal
                                        // would let an admin pick a type and silently lose it.
                                        type: formData.type,
                                        isPureVeg: formData.isPureVeg,
                                        badge: packageData ? packageData.badge : 'Silver', // Defaulting badge logically
                                        badgeColor: packageData ? packageData.badgeColor : 'bg-gray-100 text-gray-500',
                                        price: `₹${formData.pricePerPerson}/person`,
                                        minPeople: formData.minPeople,
                                        maxPeople: formData.maxPeople,
                                        description: formData.description,
                                        status: packageData && packageData.status !== undefined ? packageData.status : true,
                                        features: features,
                                        // A fully exhaustive system would regenerate the starters/main/dessert lists mapped by item IDs,
                                        // keeping it simple for the UI implementation as requested.
                                        starters: packageData?.starters || [],
                                        mainCourse: packageData?.mainCourse || [],
                                        desserts: packageData?.desserts || [],
                                        drinks: packageData?.drinks || []
                                    }
                                    onSave(savedPackage)
                                } else {
                                    onClose()
                                }
                            }}
                            className="flex-1 py-3.5 bg-[#F97316] text-white rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-[#EA580C] transition-colors text-[16px] shadow-lg shadow-orange-100"
                        >
                            <Save size={20} /> {packageData ? 'Update package' : 'Save package'}
                        </button>
                    </div>
                </ErrorBoundary>
            </div>
        </div>
    )
}

export default AddPackageModal
