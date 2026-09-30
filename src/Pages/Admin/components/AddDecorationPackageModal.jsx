import React, { useState, useEffect } from 'react'
import { X, Plus, Trash2, Upload, ChevronUp, ChevronDown } from 'lucide-react'
import api from '../../../utils/api'
import AddAddonModal from './AddAddonModal'

// Backend host — strip the trailing /api so /uploads paths resolve to
// the static-file mount instead of an undefined route. Reused by the
// add-on icon resolver below.
const BACKEND_URL = (import.meta.env.VITE_API_URL || '').replace(/\/api.*$/, '')

/**
 * Resolve an add-on icon to its display source.
 *   - empty / null         → null (caller renders fallback emoji)
 *   - http(s)://… URL      → returned as-is
 *   - /uploads/foo.png     → prefixed with backend host
 *   - /camera.svg etc.     → relative path (Vite serves /public at root)
 *   - 🎂 (emoji string)    → null (caller renders the emoji as text)
 *
 * Returns { src, isImage } so the caller can pick <img> vs <span>.
 */
function resolveAddonIcon(raw) {
    const v = String(raw || '').trim()
    if (!v) return { src: null, isImage: false }
    if (v.startsWith('http://') || v.startsWith('https://')) return { src: v, isImage: true }
    if (v.startsWith('/uploads/')) return { src: `${BACKEND_URL}${v}`, isImage: true }
    if (v.startsWith('/'))         return { src: v, isImage: true }
    // Anything else (emoji, sticker, plain word) — render as text.
    return { src: null, isImage: false, text: v }
}

// Tabs
const TABS = [
    { id: 'basic', label: 'Basic Info' },
    { id: 'items', label: 'Items & Materials' },
    { id: 'setup', label: 'Setup Details' },
    { id: 'pricing', label: 'Pricing' },
    { id: 'addons', label: 'Add-ons & Restrictions' },
    { id: 'media', label: 'Media & Vendor' },
]

const AddDecorationPackageModal = ({ isOpen, onClose, onSave, packageData }) => {
    const [activeTab, setActiveTab] = useState('basic')
    const [showCategoryDropdown, setShowCategoryDropdown] = useState(false)
    const categoryOptions = ['Wedding', 'Birthday', 'Corporate']
    const [allAddons, setAllAddons] = useState([])
    // Per-field validation errors. Keys: name, category, basePrice.
    const [errors, setErrors] = useState({})
    const [formData, setFormData] = useState({
        // Basic Info
        name: '',
        category: '',
        description: '',
        themeStyle: '',
        primaryColor: '#FF6B6B',
        secondaryColor: '#4ECDC4',
        accentColor: '#FFD93D',
        suitableFor: {
            Indoor: false, Outdoor: false, Hall: false, Banquet: false,
            Garden: false, Terrace: false, Beach: false, Restaurant: false
        },
        minArea: '',
        maxArea: '',
        ceilingHeight: '',
        searchTags: [],
        isFeatured: false,
        isPopular: false,

        // Items & Materials
        categories: [], // { name: '', items: [{ name: '', quantity: '', unit: '' }] }
        materialsUsed: [],

        // Setup Details
        setupTime: '',
        advanceBookingDays: '',
        waterRequired: false,
        technicalSupport: false,
        onSiteSupervision: false,
        numberOfCaretakers: '',

        // Pricing
        basePrice: '',
        dismantlingCharges: '',
        setupCharges: '',
        transportCharges: '',
        isCustomizable: false,

        // Add-ons & Restrictions
        addons: [], // { name: '', price: '', description: '' }
        allowCustomization: false,
        additionalChargesPercent: '',
        restrictions: {
            indoorOnly: false, outdoorOnly: false, weatherDependent: false,
            fireHazard: false, specialPermission: false, notSuitableForKids: false
        },
        bestFor: [],
        notRecommendedFor: [],
        simultaneousBookings: '',
        seasonalAvailability: {
            spring: false, summer: false, fall: false, winter: false
        },
        clientNotes: '',
        isActive: true,

        // Media & Vendor
        images: [],
        vendorName: '',
        vendorEmail: '',
        vendorPhone: '',
        vendorRating: ''
    })

    const [currentTag, setCurrentTag] = useState('')
    const [currentMaterial, setCurrentMaterial] = useState('')
    const [currentBestFor, setCurrentBestFor] = useState('')
    const [currentNotRecommended, setCurrentNotRecommended] = useState('')
    const [newCategoryName, setNewCategoryName] = useState('')
    const [expandedCategories, setExpandedCategories] = useState({})
    const [newItemInputs, setNewItemInputs] = useState({})
    const [newAddon, setNewAddon] = useState({ name: '', price: '', description: '' })
    const [activeAddonId, setActiveAddonId] = useState(null)
    const [activeAddonMode, setActiveAddonMode] = useState(null) // 'edit' or 'view'

    // Inline AddAddonModal — lets the admin grow the global add-on
    // catalogue without leaving this decoration package form.
    const [isCreateAddonOpen, setIsCreateAddonOpen] = useState(false)
    const [editingAddon, setEditingAddon] = useState(null)

    const ADDON_DEFAULTS = {
        'Photography Coverage': { desc: 'Best for small gatherings', count: '3' },
        'Music & DJ': { desc: 'Music & DJ Services', count: '1' },
        'Live Food Stations': { desc: 'Freshly prepared, right in front of your guests.', count: '5' },
        'Kids Entertainment Zone': { desc: 'Safe fun for little guests.', count: '1' },
        'Photo booth': { desc: 'Capture the Moments That Matter', count: '1' },
        'Professional Event Host': { desc: 'Professional Event Host', count: '1' }
    };

    const handleAddonAction = (addonName, mode) => {
        if (mode === 'edit' || mode === 'view') {
            setFormData(prev => {
                if (!prev.addons.some(a => a.name === addonName)) {
                    const defaultData = {
                        name: addonName,
                        description: ADDON_DEFAULTS[addonName]?.desc || '',
                        basePrice: '1000',
                        hasFullEventPrice: true,
                        fullEventPrice: '5000',
                        extraHours: ['2 Hour', '4 Hour'],
                        extraHoursChargesApply: true,
                        count: ADDON_DEFAULTS[addonName]?.count || '1',
                        deliverables: addonName === 'Music & DJ' ? [
                            'Speakers & mixer',
                            'Wireless mic',
                            'Basic lighting'
                        ] : addonName === 'Live Food Stations' ? [
                            'Up to 80-120 guests per counter',
                            'Time Active 2-3hrs'
                        ] : addonName === 'Kids Entertainment Zone' ? [
                            'Sanitized equipment',
                            'Soft flooring',
                            'First-aid kit'
                        ] : addonName === 'Photo Booth' ? [
                            'Professional photo booth setup',
                            'High-quality camera',
                            'Ring light for perfect lighting',
                            'Instant digital photo sharing',
                            'QR download link',
                            'On-site support staff (optional)'
                        ] : addonName === 'Professional Event Host' ? [
                            'Guest engagement',
                            'Announcements',
                            'Games & activities',
                            'Schedule management'
                        ] : [
                            '150-300 edited photos',
                            '30 highlight shots same day',
                            '3-5 min highlight reel',
                            'Full ceremony recording',
                            'Soft cover - 30 pages'
                        ]
                    };
                    return { ...prev, addons: [...prev.addons, defaultData] };
                }
                return prev;
            });
        }

        if (activeAddonId === addonName && activeAddonMode === mode) {
            setActiveAddonId(null);
            setActiveAddonMode(null);
        } else {
            setActiveAddonId(addonName);
            setActiveAddonMode(mode);
        }
    };

    const toggleAddonSelection = (addonName) => {
        setFormData(prev => {
            const isSelected = prev.addons.some(a => a.name === addonName);
            if (isSelected) {
                if (activeAddonId === addonName) {
                    setActiveAddonId(null);
                    setActiveAddonMode(null);
                }
                return { ...prev, addons: prev.addons.filter(a => a.name !== addonName) };
            } else {
                const defaultData = {
                    name: addonName,
                    description: ADDON_DEFAULTS[addonName]?.desc || '',
                    basePrice: '1000',
                    hasFullEventPrice: true,
                    fullEventPrice: '5000',
                    extraHours: ['2 Hour', '4 Hour'],
                    extraHoursChargesApply: true,
                    count: ADDON_DEFAULTS[addonName]?.count || '1',
                    deliverables: addonName === 'Music & DJ' ? [
                        'Speakers & mixer',
                        'Wireless mic',
                        'Basic lighting'
                    ] : addonName === 'Live Food Stations' ? [
                        'Up to 80-120 guests per counter',
                        'Time Active 2-3hrs'
                    ] : addonName === 'Kids Entertainment Zone' ? [
                        'Sanitized equipment',
                        'Soft flooring',
                        'First-aid kit'
                    ] : addonName === 'Photo Booth' ? [
                        'Professional photo booth setup',
                        'High-quality camera',
                        'Ring light for perfect lighting',
                        'Instant digital photo sharing',
                        'QR download link',
                        'On-site support staff (optional)'
                    ] : addonName === 'Professional Event Host' ? [
                        'Guest engagement',
                        'Announcements',
                        'Games & activities',
                        'Schedule management'
                    ] : [
                        '150-300 edited photos',
                        '30 highlight shots same day',
                        '3-5 min highlight reel',
                        'Full ceremony recording',
                        'Soft cover - 30 pages'
                    ]
                };
                return { ...prev, addons: [...prev.addons, defaultData] };
            }
        });
    };

    const updateActiveAddon = (field, value) => {
        setFormData(prev => ({
            ...prev,
            addons: prev.addons.map(a => a.name === activeAddonId ? { ...a, [field]: value } : a)
        }));
    };

    const handleAddAddon = () => {
        if (!newAddon.name.trim() || !newAddon.price) return
        setFormData(prev => ({
            ...prev,
            addons: [...prev.addons, { ...newAddon }]
        }))
        setNewAddon({ name: '', price: '', description: '' })
    }

    const handleRemoveAddon = (index) => {
        setFormData(prev => ({
            ...prev,
            addons: prev.addons.filter((_, i) => i !== index)
        }))
    }

    const handleImageUpload = (e) => {
        const files = Array.from(e.target.files)
        if (files.length) {
            const newImages = files.map(file => URL.createObjectURL(file))
            setFormData(prev => ({ ...prev, images: [...prev.images, ...newImages] }))
        }
    }

    const handleRemoveImage = (index) => {
        setFormData(prev => ({
            ...prev,
            images: prev.images.filter((_, i) => i !== index)
        }))
    }

    const handleAddCategory = () => {
        if (!newCategoryName.trim()) return
        setFormData(prev => ({
            ...prev,
            categories: [...prev.categories, { name: newCategoryName.trim(), items: [] }]
        }))
        setExpandedCategories(prev => ({ ...prev, [formData.categories.length]: true }))
        setNewItemInputs(prev => ({ ...prev, [formData.categories.length]: { name: '', quantity: '', unit: 'Pieces' } }))
        setNewCategoryName('')
    }

    const handleRemoveCategory = (index) => {
        setFormData(prev => ({
            ...prev,
            categories: prev.categories.filter((_, i) => i !== index)
        }))
    }

    const handleAddItem = (categoryIndex) => {
        const inputData = newItemInputs[categoryIndex] || { name: '', quantity: '', unit: 'Pieces' }
        if (!inputData.name.trim()) return

        setFormData(prev => {
            const newCategories = [...prev.categories]
            newCategories[categoryIndex].items.push({ ...inputData })
            return { ...prev, categories: newCategories }
        })
        setNewItemInputs(prev => ({ ...prev, [categoryIndex]: { name: '', quantity: '', unit: 'Pieces' } }))
    }

    const handleRemoveItem = (categoryIndex, itemIndex) => {
        setFormData(prev => {
            const newCategories = [...prev.categories]
            newCategories[categoryIndex].items = newCategories[categoryIndex].items.filter((_, i) => i !== itemIndex)
            return { ...prev, categories: newCategories }
        })
    }

    const updateNewItemInput = (categoryIndex, field, value) => {
        setNewItemInputs(prev => ({
            ...prev,
            [categoryIndex]: {
                ...(prev[categoryIndex] || { name: '', quantity: '', unit: 'Pieces' }),
                [field]: value
            }
        }))
    }

    // Hoisted so the inline AddAddonModal save handler can refetch
    // and show the freshly-created add-on in the cards grid without
    // a page reload.
    const fetchAddons = React.useCallback(async () => {
        try {
            const res = await api.get('/booking-info/addons');
            if (res.data.success) {
                setAllAddons(res.data.addons.map(a => ({
                    name: a.title,
                    desc: a.description,
                    icon: a.icon || '✨',
                    basePrice: a.price,
                })));
            }
        } catch (err) {
            console.error('Fetch addons error:', err);
        }
    }, []);

    useEffect(() => {
        fetchAddons();
    }, [fetchAddons]);

    // POST/PUT handler for the inline AddAddonModal. Routes to the
    // admin endpoints we exposed earlier and refreshes the local
    // catalogue on success so the new card appears immediately.
    const handleSaveCustomAddon = async (addonData) => {
        const id = addonData._id;
        const payload = { ...addonData };
        delete payload._id;
        const res = id
            ? await api.put(`/booking-info/addons/${id}`, payload)
            : await api.post('/booking-info/addons', payload);
        if (res.data?.success) {
            await fetchAddons();
            setEditingAddon(null);
        }
    };

    useEffect(() => {
        if (isOpen) {
            if (packageData) {
                setFormData({
                    ...packageData,
                    // Ensure nested objects exist to avoid crashes
                    suitableFor: packageData.suitableFor || { Indoor: false, Outdoor: false, Hall: false, Banquet: false, Garden: false, Terrace: false, Beach: false, Restaurant: false },
                    restrictions: packageData.restrictions || { indoorOnly: false, outdoorOnly: false, weatherDependent: false, fireHazard: false, specialPermission: false, notSuitableForKids: false },
                    seasonalAvailability: packageData.seasonalAvailability || { spring: false, summer: false, fall: false, winter: false }
                })
            } else {
                setActiveTab('basic')
                setFormData({
                    name: '', category: '', description: '', themeStyle: '',
                    primaryColor: '#FF6B6B', secondaryColor: '#4ECDC4', accentColor: '#FFD93D',
                    suitableFor: { Indoor: false, Outdoor: false, Hall: false, Banquet: false, Garden: false, Terrace: false, Beach: false, Restaurant: false },
                    minArea: '', maxArea: '', ceilingHeight: '', searchTags: [], isFeatured: false, isPopular: false,
                    categories: [], materialsUsed: [], setupTime: '', advanceBookingDays: '',
                    waterRequired: false, technicalSupport: false, onSiteSupervision: false, numberOfCaretakers: '',
                    basePrice: '', dismantlingCharges: '', setupCharges: '', transportCharges: '', isCustomizable: false,
                    addons: [], allowCustomization: false, additionalChargesPercent: '',
                    restrictions: { indoorOnly: false, outdoorOnly: false, weatherDependent: false, fireHazard: false, specialPermission: false, notSuitableForKids: false },
                    bestFor: [], notRecommendedFor: [], simultaneousBookings: '',
                    seasonalAvailability: { spring: false, summer: false, fall: false, winter: false },
                    clientNotes: '', isActive: true, images: [], vendorName: '', vendorEmail: '', vendorPhone: '', vendorRating: ''
                })
            }
        }
    }, [isOpen, packageData])

    if (!isOpen) return null

    const handleSuitableForChange = (key) => {
        setFormData(prev => ({
            ...prev,
            suitableFor: {
                ...prev.suitableFor,
                [key]: !prev.suitableFor[key]
            }
        }))
    }

    const handleAddTag = (listName, currentVal, setVal) => {
        if (!currentVal.trim()) return
        setFormData(prev => ({
            ...prev,
            [listName]: [...prev[listName], currentVal.trim()]
        }))
        setVal('')
    }

    const handleRemoveTag = (listName, index) => {
        setFormData(prev => ({
            ...prev,
            [listName]: prev[listName].filter((_, i) => i !== index)
        }))
    }

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center font-manrope p-4">
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

            <div className="relative w-full max-w-[1000px] h-[95vh] bg-[#F9FAFB] rounded-[24px] shadow-2xl flex flex-col animate-in zoom-in-95 duration-200 overflow-hidden">
                {/* Header */}
                <div className="px-8 py-4 bg-[#FFF7ED] border-b border-[#FED7AA] flex justify-between items-center shrink-0">
                    <h2 className="text-[20px] font-[700] text-[#1A181B]">
                        Add Decoration Package
                    </h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
                        <X size={24} />
                    </button>
                </div>

                {/* Tabs */}
                <div className="px-8 pt-4 bg-white border-b border-gray-100 flex gap-8 overflow-x-auto no-scrollbar shrink-0">
                    {TABS.map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`pb-4 text-[14px] font-[600] border-b-2 transition-colors whitespace-nowrap ${activeTab === tab.id
                                ? 'text-[#F97316] border-[#F97316]'
                                : 'text-gray-500 border-transparent hover:text-gray-700'
                                }`}
                        >
                            {tab.label}
                        </button>
                    ))}
                </div>

                {/* scrollable body */}
                <div className="flex-1 overflow-y-auto p-8 bg-white">
                    {activeTab === 'basic' && (
                        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-300">
                            {/* Basic Information */}
                            <div>
                                <h3 className="text-[16px] font-[700] text-[#1A181B] mb-4">Basic Information</h3>
                                <div className="grid grid-cols-2 gap-x-6 gap-y-6 mb-8 items-start">
                                    <div className="w-full">
                                        <label htmlFor="deco-name" className="block text-[13px] font-semibold text-[#1A181B] mb-2">
                                            Package name <span className="text-red-500" aria-hidden="true">*</span>
                                        </label>
                                        <input
                                            id="deco-name"
                                            type="text"
                                            placeholder="e.g. Royal Wedding Package, Pastel Birthday Setup"
                                            aria-required="true"
                                            aria-invalid={errors.name ? 'true' : 'false'}
                                            aria-describedby={errors.name ? 'deco-name-err' : undefined}
                                            className={`w-full px-4 py-2.5 rounded-xl border focus:outline-none focus:ring-2 text-[14px] ${errors.name ? 'border-red-400 focus:ring-red-200' : 'border-gray-200 focus:ring-[#F97316]'}`}
                                            value={formData.name}
                                            onChange={e => {
                                                setFormData({ ...formData, name: e.target.value })
                                                if (errors.name) setErrors(prev => ({ ...prev, name: undefined }))
                                            }}
                                        />
                                        {errors.name && (
                                            <p id="deco-name-err" role="alert" className="text-xs text-red-600 mt-1 flex items-center gap-1">
                                                <span aria-hidden="true">⚠</span>{errors.name}
                                            </p>
                                        )}
                                    </div>
                                    <div className="w-full">
                                        <label className="block text-[13px] font-[600] text-[#1A181B] mb-2">Description</label>
                                        <textarea
                                            rows={4}
                                            placeholder="text"
                                            className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#F97316] text-[14px] resize-none h-[110px]"
                                            value={formData.description}
                                            onChange={e => setFormData({ ...formData, description: e.target.value })}
                                        />
                                    </div>
                                    <div className="w-full">
                                        <label htmlFor="deco-category" className="block text-[13px] font-semibold text-[#1A181B] mb-2">
                                            Category <span className="text-red-500" aria-hidden="true">*</span>
                                        </label>
                                        <div className="relative">
                                            <button
                                                id="deco-category"
                                                type="button"
                                                aria-required="true"
                                                aria-haspopup="listbox"
                                                aria-expanded={showCategoryDropdown}
                                                aria-invalid={errors.category ? 'true' : 'false'}
                                                aria-describedby={errors.category ? 'deco-category-err' : undefined}
                                                onClick={() => setShowCategoryDropdown(!showCategoryDropdown)}
                                                className={`flex items-center justify-between w-full px-4 py-2.5 rounded-xl border bg-white text-[14px] outline-none transition-all ${showCategoryDropdown ? 'ring-2 ring-orange-100 border-orange-300' : errors.category ? 'border-red-400' : 'border-gray-200'}`}
                                            >
                                                <span className={formData.category ? 'text-[#1A181B]' : 'text-gray-400'}>
                                                    {formData.category || 'Select'}
                                                </span>
                                                <ChevronDown className={`text-gray-400 transition-transform duration-200 ${showCategoryDropdown ? 'rotate-180' : ''}`} size={18} />
                                            </button>
                                            {showCategoryDropdown && (
                                                <div className="absolute top-full left-0 mt-2 w-full bg-white rounded-2xl shadow-[0px_4px_20px_0px_rgba(0,0,0,0.08)] border border-gray-100 z-30 animate-in fade-in zoom-in-95 duration-200 overflow-hidden">
                                                    {categoryOptions.map((opt, index) => (
                                                        <div key={opt}>
                                                            <button
                                                                type="button"
                                                                onClick={() => {
                                                                    setFormData({ ...formData, category: opt })
                                                                    if (errors.category) setErrors(prev => ({ ...prev, category: undefined }))
                                                                    setShowCategoryDropdown(false)
                                                                }}
                                                                className={`w-full text-left px-5 py-2.5 text-sm font-medium font-manrope transition-colors ${formData.category === opt ? 'bg-[#FE8301] text-white!' : 'text-gray-600 hover:bg-[#FE8301] hover:text-white!'}`}
                                                            >
                                                                {opt}
                                                            </button>
                                                            {index < categoryOptions.length - 1 && <div className="h-[1px] bg-gray-100 mx-4 my-1" />}
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                        {errors.category && (
                                            <p id="deco-category-err" role="alert" className="text-xs text-red-600 mt-1 flex items-center gap-1">
                                                <span aria-hidden="true">⚠</span>{errors.category}
                                            </p>
                                        )}
                                    </div>
                                    <div className="w-full">
                                        <label className="block text-[13px] font-[600] text-[#1A181B] mb-2">Theme/Style</label>
                                        <input
                                            type="text"
                                            placeholder="e.g. Royal, Minimalistic, Rustic"
                                            className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#F97316] text-[14px]"
                                            value={formData.themeStyle}
                                            onChange={e => setFormData({ ...formData, themeStyle: e.target.value })}
                                        />
                                    </div>
                                </div>

                            </div>

                            {/* Color Scheme */}
                            <div>
                                <h3 className="text-[16px] font-[700] text-[#1A181B] mb-4">Color Scheme</h3>
                                <div className="grid grid-cols-3 gap-6 mb-8">
                                    {/* Primary Color */}
                                    <div className="flex items-center gap-3">
                                        <div
                                            className="w-[60px] h-[60px] rounded-[8px] border border-gray-200 shrink-0"
                                            style={{ backgroundColor: formData.primaryColor }}
                                        />
                                        <div className="flex-1">
                                            <label className="block text-[13px] font-[600] text-[#1A181B] mb-2">Primary Color</label>
                                            <input
                                                type="text"
                                                className="w-full px-3 py-2.5 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#F97316] text-[13px]"
                                                value={formData.primaryColor}
                                                onChange={e => setFormData({ ...formData, primaryColor: e.target.value })}
                                            />
                                        </div>
                                    </div>
                                    {/* Secondary Color */}
                                    <div className="flex items-center gap-3">
                                        <div
                                            className="w-[60px] h-[60px] rounded-[8px] border border-gray-200 shrink-0"
                                            style={{ backgroundColor: formData.secondaryColor }}
                                        />
                                        <div className="flex-1">
                                            <label className="block text-[13px] font-[600] text-[#1A181B] mb-2">Secondary Color</label>
                                            <input
                                                type="text"
                                                className="w-full px-3 py-2.5 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#F97316] text-[13px]"
                                                value={formData.secondaryColor}
                                                onChange={e => setFormData({ ...formData, secondaryColor: e.target.value })}
                                            />
                                        </div>
                                    </div>
                                    {/* Accent Color */}
                                    <div className="flex items-center gap-3">
                                        <div
                                            className="w-[60px] h-[60px] rounded-[8px] border border-gray-200 shrink-0"
                                            style={{ backgroundColor: formData.accentColor }}
                                        />
                                        <div className="flex-1">
                                            <label className="block text-[13px] font-[600] text-[#1A181B] mb-2">Accent Color</label>
                                            <input
                                                type="text"
                                                className="w-full px-3 py-2.5 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#F97316] text-[13px]"
                                                value={formData.accentColor}
                                                onChange={e => setFormData({ ...formData, accentColor: e.target.value })}
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Venue Compatibility */}
                            <div>
                                <h3 className="text-[16px] font-[700] text-[#1A181B] mb-4">Venue Compatibility</h3>
                                <div className="flex gap-x-12 mb-8 items-start">
                                    <div className="flex-1">
                                        <label className="block text-[13px] font-[600] text-gray-500 mb-4">Suitable For (Select multiple)</label>
                                        <div className="grid grid-cols-2 gap-y-4 gap-x-6">
                                            {['Indoor', 'Outdoor', 'Hall', 'Banquet', 'Garden', 'Terrace', 'Beach', 'Restaurant'].map(item => (
                                                <label key={item} className="flex items-center gap-3 p-3.5 border border-gray-200 rounded-xl cursor-pointer hover:bg-gray-50 transition-colors">
                                                    <div className="relative flex items-center shrink-0">
                                                        <input
                                                            type="checkbox"
                                                            className="w-5 h-5 rounded-[6px] border border-gray-300 text-[#F97316] focus:ring-[#F97316] peer appearance-none checked:bg-[#F97316] checked:border-[#F97316]"
                                                            checked={formData.suitableFor[item]}
                                                            onChange={() => handleSuitableForChange(item)}
                                                        />
                                                        <svg className="absolute w-3 h-3 text-white left-1 pointer-events-none opacity-0 peer-checked:opacity-100" viewBox="0 0 14 10" fill="none">
                                                            <path d="M1 5L4.5 8.5L13 1" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                                        </svg>
                                                    </div>
                                                    <span className="text-[14px] text-gray-600 font-[500]">{item}</span>
                                                </label>
                                            ))}
                                        </div>
                                    </div>

                                    <div className="w-[320px] flex flex-col gap-5 pt-9">
                                        <div>
                                            <label className="block text-[13px] font-[600] text-[#1A181B] mb-2">Min Area Required (sq ft)</label>
                                            <input
                                                type="number"
                                                placeholder="1000"
                                                className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#F97316] text-[14px]"
                                                value={formData.minArea}
                                                onChange={e => setFormData({ ...formData, minArea: e.target.value })}
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-[13px] font-[600] text-[#1A181B] mb-2">Max Area Coverage (sq ft)</label>
                                            <input
                                                type="number"
                                                placeholder="5000"
                                                className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#F97316] text-[14px]"
                                                value={formData.maxArea}
                                                onChange={e => setFormData({ ...formData, maxArea: e.target.value })}
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-[13px] font-[600] text-[#1A181B] mb-2">Ceiling Height Required (ft)</label>
                                            <input
                                                type="number"
                                                placeholder="12"
                                                className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#F97316] text-[14px]"
                                                value={formData.ceilingHeight}
                                                onChange={e => setFormData({ ...formData, ceilingHeight: e.target.value })}
                                            />
                                        </div>
                                    </div>
                                </div>

                                {/* Search Tags */}
                                <div className="mt-6 mb-4">
                                    <label className="block text-[13px] font-[600] text-[#1A181B] mb-2">Search Tags</label>
                                    <div className="flex gap-2 mb-3">
                                        <input
                                            type="text"
                                            placeholder="e.g. Royal, Elegant, Luxury"
                                            className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#F97316] text-[14px]"
                                            value={currentTag}
                                            onChange={e => setCurrentTag(e.target.value)}
                                            onKeyPress={e => {
                                                if (e.key === 'Enter') {
                                                    e.preventDefault()
                                                    handleAddTag('searchTags', currentTag, setCurrentTag)
                                                }
                                            }}
                                        />
                                        <button
                                            onClick={() => handleAddTag('searchTags', currentTag, setCurrentTag)}
                                            className="px-6 py-2.5 bg-[#F97316] text-white rounded-xl font-[600] hover:bg-[#EA580C] transition-colors flex items-center justify-center gap-2 max-w-[120px]"
                                        >
                                            <Plus size={18} />
                                            Add
                                        </button>
                                    </div>
                                    <div className="flex flex-wrap gap-2 mb-6">
                                        {formData.searchTags.map((tag, i) => (
                                            <div key={i} className="flex items-center gap-1 bg-[#EFF6FF] text-[#3B82F6] px-3 py-1.5 rounded-full border border-blue-100">
                                                <span className="text-[12px] font-[600]">{tag}</span>
                                                <button onClick={() => handleRemoveTag('searchTags', i)} className="text-[#3B82F6] hover:text-[#2563EB] ml-1">
                                                    <X size={14} />
                                                </button>
                                            </div>
                                        ))}
                                    </div>

                                    {/* Action Toggles */}
                                    <div className="flex items-center gap-12 mt-6">
                                        <label className="flex items-center gap-3 cursor-pointer">
                                            <div className="relative flex items-center">
                                                <input
                                                    type="checkbox"
                                                    className="w-5 h-5 rounded-md border-gray-300 text-[#F97316] focus:ring-[#F97316] peer appearance-none checked:bg-[#F97316] checked:border-[#F97316] border"
                                                    checked={formData.featured}
                                                    onChange={e => setFormData({ ...formData, featured: e.target.checked })}
                                                />
                                                <svg className="absolute w-3 h-3 text-white left-1 pointer-events-none opacity-0 peer-checked:opacity-100" viewBox="0 0 14 10" fill="none">
                                                    <path d="M1 5L4.5 8.5L13 1" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                                </svg>
                                            </div>
                                            <span className="text-[14px] text-gray-600 font-[500]">Featured (Show on homepage)</span>
                                        </label>

                                        <label className="flex items-center gap-3 cursor-pointer">
                                            <div className="relative flex items-center">
                                                <input
                                                    type="checkbox"
                                                    className="w-5 h-5 rounded-md border-gray-300 text-[#F97316] focus:ring-[#F97316] peer appearance-none checked:bg-[#F97316] checked:border-[#F97316] border"
                                                    checked={formData.popular}
                                                    onChange={e => setFormData({ ...formData, popular: e.target.checked })}
                                                />
                                                <svg className="absolute w-3 h-3 text-white left-1 pointer-events-none opacity-0 peer-checked:opacity-100" viewBox="0 0 14 10" fill="none">
                                                    <path d="M1 5L4.5 8.5L13 1" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                                </svg>
                                            </div>
                                            <span className="text-[14px] text-gray-600 font-[500]">Mark as Popular</span>
                                        </label>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === 'items' && (
                        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-300">
                            {/* Included Items by Category */}
                            <div>
                                <h3 className="text-[16px] font-[700] text-[#1A181B] mb-1">Included Items by Category</h3>
                                <p className="text-[13px] text-gray-500 mb-6">Organize all items included in this decoration package by categories</p>

                                {/* Add Category Box */}
                                <div className="p-4 bg-[#FDF6FA] rounded-[12px] border border-[#F9A8D4] border-dashed mb-6">
                                    <label className="block text-[13px] font-[500] text-[#374151] mb-2">Add Category</label>
                                    <div className="flex gap-3">
                                        <input
                                            type="text"
                                            placeholder="e.g. Stage decoration, Lighting, Table Decor, Entrance"
                                            className="flex-1 px-4 py-2.5 bg-white rounded-[10px] border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#F97316] text-[14px]"
                                            value={newCategoryName}
                                            onChange={e => setNewCategoryName(e.target.value)}
                                            onKeyPress={e => e.key === 'Enter' && handleAddCategory()}
                                        />
                                        <button
                                            onClick={handleAddCategory}
                                            className="px-6 py-2.5 bg-[#F97316] text-white rounded-[10px] font-[600] hover:bg-[#EA580C] transition-colors flex items-center justify-center gap-2 min-w-[100px]"
                                        >
                                            <Plus size={18} />
                                            Add
                                        </button>
                                    </div>
                                </div>

                                {/* Categories List */}
                                <div className="space-y-4 mb-8">
                                    {formData.categories.map((category, catIndex) => (
                                        <div key={catIndex} className="bg-white rounded-[20px] border border-gray-200 overflow-hidden shadow-sm">
                                            {/* Category Header */}
                                            <div
                                                className="p-5 flex items-center justify-between cursor-pointer hover:bg-gray-50 transition-colors"
                                                onClick={() => setExpandedCategories(prev => ({ ...prev, [catIndex]: !prev[catIndex] }))}
                                            >
                                                <div>
                                                    <h4 className="text-[14px] font-[700] text-[#1A181B] mb-1">{category.name}</h4>
                                                    <p className="text-[12px] text-gray-500">{category.items.length} item{category.items.length !== 1 ? 's' : ''}</p>
                                                </div>
                                                <div className="flex items-center gap-4">
                                                    <button
                                                        className="text-gray-400 hover:text-gray-600 transition-colors"
                                                        onClick={(e) => { e.stopPropagation(); toggleCategory(catIndex); }}
                                                    >
                                                        {expandedCategories[catIndex] ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                                                    </button>
                                                    <button
                                                        className="text-gray-400 hover:text-red-500 transition-colors"
                                                        onClick={(e) => { e.stopPropagation(); handleRemoveCategory(catIndex); }}
                                                    >
                                                        <Trash2 size={18} />
                                                    </button>
                                                </div>
                                            </div>

                                            {/* Category Content (Expanded) */}
                                            {expandedCategories[catIndex] && (
                                                <div className="p-5 border-t border-gray-100 bg-[#FAF5FF] rounded-b-[12px]">
                                                    {/* Add Item Form */}
                                                    <div className="mb-6">
                                                        <label className="block text-[14px] font-[600] text-[#1A181B] mb-4">Add Item to this category</label>
                                                        <div className="flex flex-col gap-4">
                                                            <div className="flex flex-row items-start gap-4 w-full">
                                                                <div className="flex-[2]">
                                                                    <label className="block text-[13px] font-[500] text-[#374151] mb-2">Item Name</label>
                                                                    <input
                                                                        type="text"
                                                                        placeholder="e.g. LED Par Lights"
                                                                        className="w-full px-4 py-2.5 bg-white rounded-[10px] border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#F97316] text-[14px]"
                                                                        value={newItemInputs[catIndex]?.name || ''}
                                                                        onChange={e => updateNewItemInput(catIndex, 'name', e.target.value)}
                                                                    />
                                                                </div>
                                                                <div className="flex-1">
                                                                    <label className="block text-[13px] font-[500] text-[#374151] mb-2">Quantity</label>
                                                                    <input
                                                                        type="number"
                                                                        placeholder="10"
                                                                        className="w-full px-4 py-2.5 bg-white rounded-[10px] border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#F97316] text-[14px]"
                                                                        value={newItemInputs[catIndex]?.quantity || ''}
                                                                        onChange={e => updateNewItemInput(catIndex, 'quantity', e.target.value)}
                                                                    />
                                                                </div>
                                                                <div className="flex-1">
                                                                    <label className="block text-[13px] font-[500] text-[#374151] mb-2">Unit</label>
                                                                    <select
                                                                        className="w-full px-4 py-2.5 bg-white rounded-[10px] border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#F97316] text-[14px] text-gray-700"
                                                                        value={newItemInputs[catIndex]?.unit || 'Pieces'}
                                                                        onChange={e => updateNewItemInput(catIndex, 'unit', e.target.value)}
                                                                    >
                                                                        <option value="Pieces">Pieces</option>
                                                                        <option value="Sets">Sets</option>
                                                                        <option value="Pairs">Pairs</option>
                                                                        <option value="Meters">Meters</option>
                                                                        <option value="Sq Ft">Sq Ft</option>
                                                                        <option value="Units">Units</option>
                                                                    </select>
                                                                </div>
                                                            </div>
                                                            <button
                                                                onClick={() => handleAddItem(catIndex)}
                                                                className="mt-1 px-6 py-2.5 bg-[#F97316] text-white rounded-[10px] font-[600] hover:bg-[#EA580C] transition-colors inline-flex items-center justify-center gap-2 w-fit"
                                                            >
                                                                <Plus size={18} />
                                                                Add
                                                            </button>
                                                        </div>
                                                    </div>

                                                    {/* Added Items Grid */}
                                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                        {category.items.map((item, itemIndex) => (
                                                            <div key={itemIndex} className="bg-white p-4 rounded-[12px] border border-gray-200 flex justify-between items-center shadow-sm">
                                                                <div>
                                                                    <h5 className="text-[13px] font-[600] text-[#1A181B] mb-0.5">{item.name}</h5>
                                                                    <p className="text-[12px] text-gray-400">Quantity: {item.quantity} {item.unit.toLowerCase()}</p>
                                                                </div>
                                                                <div className="flex gap-2 text-gray-400">
                                                                    <button className="p-1 hover:text-gray-600 transition-colors">
                                                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path></svg>
                                                                    </button>
                                                                    <button
                                                                        className="p-1 hover:text-red-500 transition-colors"
                                                                        onClick={() => handleRemoveItem(catIndex, itemIndex)}
                                                                    >
                                                                        <Trash2 size={16} />
                                                                    </button>
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Materials Used */}
                            <div>
                                <h3 className="text-[16px] font-[700] text-[#1A181B] mb-1">Materials Used</h3>
                                <p className="text-[13px] text-gray-500 mb-4">Organize all items included in this decoration package by categories</p>

                                <div className="flex gap-4 mb-4">
                                    <input
                                        type="text"
                                        placeholder="e.g. Fresh flowers, Balloons, Fabric Damping, LED lights"
                                        className="flex-1 px-4 py-2.5 bg-white rounded-[10px] border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#F97316] text-[14px]"
                                        value={currentMaterial}
                                        onChange={e => setCurrentMaterial(e.target.value)}
                                        onKeyPress={e => {
                                            if (e.key === 'Enter') {
                                                e.preventDefault()
                                                handleAddTag('materialsUsed', currentMaterial, setCurrentMaterial)
                                            }
                                        }}
                                    />
                                    <button
                                        onClick={() => handleAddTag('materialsUsed', currentMaterial, setCurrentMaterial)}
                                        className="px-8 py-2.5 bg-[#F97316] text-white rounded-[10px] font-[600] hover:bg-[#EA580C] transition-colors flex items-center justify-center gap-2"
                                    >
                                        <Plus size={18} />
                                        Add
                                    </button>
                                </div>

                                <div className="flex flex-wrap gap-2">
                                    {formData.materialsUsed.map((material, i) => (
                                        <div key={i} className="flex items-center gap-1 bg-[#EFF6FF] text-[#3B82F6] px-3 py-1.5 rounded-full border border-blue-100">
                                            <span className="text-[12px] font-[600]">{material}</span>
                                            <button onClick={() => handleRemoveTag('materialsUsed', i)} className="text-[#3B82F6] hover:text-[#2563EB] ml-1">
                                                <X size={14} />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Package Summary */}
                            <div className="bg-[#F5F9FF] border border-[#E0F2FE] rounded-[16px] p-6 mt-8">
                                <h4 className="text-[14px] font-[700] text-[#1A181B] mb-4">Package Summary</h4>
                                <div className="grid grid-cols-4 gap-6">
                                    <div>
                                        <p className="text-[13px] font-[500] text-gray-500 mb-1">Total Categories</p>
                                        <p className="text-[16px] font-[700] text-[#0066FF]">{formData.categories.length}</p>
                                    </div>
                                    <div>
                                        <p className="text-[13px] font-[500] text-gray-500 mb-1">Total Items</p>
                                        <p className="text-[16px] font-[700] text-[#0066FF]">
                                            {formData.categories.reduce((acc, cat) => acc + cat.items.length, 0)}
                                        </p>
                                    </div>
                                    <div>
                                        <p className="text-[13px] font-[500] text-gray-500 mb-1">Materials</p>
                                        <p className="text-[16px] font-[700] text-[#0066FF]">{formData.materialsUsed.length}</p>
                                    </div>
                                    <div>
                                        <p className="text-[13px] font-[500] text-gray-500 mb-1">Customizable</p>
                                        <p className="text-[16px] font-[700] text-[#0066FF]">{formData.allowCustomization ? 'Yes' : '0 elements'}</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === 'setup' && (
                        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-300">
                            {/* Setup Information */}
                            <div>
                                <h3 className="text-[16px] font-[700] text-[#1A181B] mb-4">Setup Information</h3>
                                <div className="grid grid-cols-2 gap-6">
                                    <div>
                                        <label className="block text-[13px] font-[600] text-[#1A181B] mb-2">Setup Time (hours)</label>
                                        <input
                                            type="number"
                                            placeholder="4"
                                            className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#F97316] text-[14px]"
                                            value={formData.setupTime}
                                            onChange={e => setFormData({ ...formData, setupTime: e.target.value })}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-[13px] font-[600] text-[#1A181B] mb-2">Advance Booking Days</label>
                                        <input
                                            type="number"
                                            placeholder="15"
                                            className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#F97316] text-[14px]"
                                            value={formData.advanceBookingDays}
                                            onChange={e => setFormData({ ...formData, advanceBookingDays: e.target.value })}
                                        />
                                        <p className="text-[12px] text-gray-500 mt-1">Days in advance required</p>
                                    </div>
                                </div>
                            </div>

                            {/* Requirements */}
                            <div>
                                <h3 className="text-[16px] font-[700] text-[#1A181B] mb-4">Requirements</h3>
                                <div className="grid grid-cols-2 gap-6 mb-4">
                                    <label className="flex items-center gap-3 p-3.5 border border-gray-200 rounded-xl cursor-pointer hover:bg-gray-50 transition-colors">
                                        <input
                                            type="checkbox"
                                            className="w-5 h-5 rounded border-gray-300 text-[#F97316] focus:ring-[#F97316]"
                                            checked={formData.waterRequired}
                                            onChange={e => setFormData({ ...formData, waterRequired: e.target.checked })}
                                        />
                                        <span className="text-[14px] text-gray-600">Water Required</span>
                                    </label>
                                    <label className="flex items-center gap-3 p-3.5 border border-gray-200 rounded-xl cursor-pointer hover:bg-gray-50 transition-colors">
                                        <input
                                            type="checkbox"
                                            className="w-5 h-5 rounded border-gray-300 text-[#F97316] focus:ring-[#F97316]"
                                            checked={formData.onSiteSupervision}
                                            onChange={e => setFormData({ ...formData, onSiteSupervision: e.target.checked })}
                                        />
                                        <span className="text-[14px] text-gray-600">On-Site Supervision Provided (Caretaker for kids)</span>
                                    </label>
                                    <label className="flex items-center gap-3 p-3.5 border border-gray-200 rounded-xl cursor-pointer hover:bg-gray-50 transition-colors">
                                        <input
                                            type="checkbox"
                                            className="w-5 h-5 rounded border-gray-300 text-[#F97316] focus:ring-[#F97316]"
                                            checked={formData.technicalSupport}
                                            onChange={e => setFormData({ ...formData, technicalSupport: e.target.checked })}
                                        />
                                        <span className="text-[14px] text-gray-600">Technical Support Included</span>
                                    </label>
                                    <div>
                                        <label className="block text-[13px] font-[600] text-[#1A181B] mb-1">Number of Caretaker</label>
                                        <input
                                            type="number"
                                            placeholder="01"
                                            className="w-full px-4 py-[11px] rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#F97316] text-[14px]"
                                            value={formData.numberOfCaretakers}
                                            onChange={e => setFormData({ ...formData, numberOfCaretakers: e.target.value })}
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === 'pricing' && (
                        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-300">
                            {/* Pricing Details */}
                            <div>
                                <h3 className="text-[16px] font-[700] text-[#1A181B] mb-4">Pricing Details</h3>
                                <div className="grid grid-cols-2 gap-6 gap-y-6">
                                    <div>
                                        <label htmlFor="deco-basePrice" className="block text-[13px] font-semibold text-[#1A181B] mb-2">
                                            Base price (₹) <span className="text-red-500" aria-hidden="true">*</span>
                                        </label>
                                        <input
                                            id="deco-basePrice"
                                            type="number"
                                            inputMode="decimal"
                                            placeholder="5000"
                                            min="0"
                                            aria-required="true"
                                            aria-invalid={errors.basePrice ? 'true' : 'false'}
                                            aria-describedby={errors.basePrice ? 'deco-basePrice-err' : undefined}
                                            className={`w-full px-4 py-2.5 rounded-xl border focus:outline-none focus:ring-2 text-[14px] ${errors.basePrice ? 'border-red-400 focus:ring-red-200' : 'border-gray-200 focus:ring-[#F97316]'}`}
                                            value={formData.basePrice}
                                            onChange={e => {
                                                setFormData({ ...formData, basePrice: e.target.value })
                                                if (errors.basePrice) setErrors(prev => ({ ...prev, basePrice: undefined }))
                                            }}
                                        />
                                        {errors.basePrice ? (
                                            <p id="deco-basePrice-err" role="alert" className="text-xs text-red-600 mt-1 flex items-center gap-1">
                                                <span aria-hidden="true">⚠</span>{errors.basePrice}
                                            </p>
                                        ) : (
                                            <p className="text-[12px] text-gray-500 mt-1">Main decoration package price</p>
                                        )}
                                    </div>
                                    <div>
                                        <label className="block text-[13px] font-[600] text-[#1A181B] mb-2">Setup Charges (₹)</label>
                                        <input
                                            type="number"
                                            placeholder="10000"
                                            className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#F97316] text-[14px]"
                                            value={formData.setupCharges}
                                            onChange={e => setFormData({ ...formData, setupCharges: e.target.value })}
                                        />
                                        <p className="text-[12px] text-gray-500 mt-1">Labor and setup costs</p>
                                    </div>
                                    <div>
                                        <label className="block text-[13px] font-[600] text-[#1A181B] mb-2">Dismantling Charges (₹)</label>
                                        <input
                                            type="number"
                                            placeholder="5000"
                                            className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#F97316] text-[14px]"
                                            value={formData.dismantlingCharges}
                                            onChange={e => setFormData({ ...formData, dismantlingCharges: e.target.value })}
                                        />
                                        <p className="text-[12px] text-gray-500 mt-1">Post-event removal costs</p>
                                    </div>
                                    <div>
                                        <label className="block text-[13px] font-[600] text-[#1A181B] mb-2">Transport Charges (₹)</label>
                                        <input
                                            type="number"
                                            placeholder="3000"
                                            className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#F97316] text-[14px]"
                                            value={formData.transportCharges}
                                            onChange={e => setFormData({ ...formData, transportCharges: e.target.value })}
                                        />
                                        <p className="text-[12px] text-gray-500 mt-1">Delivery and logistics</p>
                                    </div>
                                </div>
                            </div>

                            {/* Customization Pricing */}
                            <div className="pt-2">
                                <h3 className="text-[16px] font-[700] text-[#1A181B] mb-4">Customization Pricing</h3>
                                <label className="flex items-center gap-3 cursor-pointer">
                                    <div className="relative flex items-center">
                                        <input
                                            type="checkbox"
                                            className="w-5 h-5 rounded border border-gray-300 text-[#F97316] focus:ring-[#F97316] peer appearance-none checked:bg-[#F97316] checked:border-[#F97316]"
                                            checked={formData.isCustomizable}
                                            onChange={e => setFormData({ ...formData, isCustomizable: e.target.checked })}
                                        />
                                        <svg className="absolute w-3 h-3 text-white left-1 pointer-events-none opacity-0 peer-checked:opacity-100" viewBox="0 0 14 10" fill="none">
                                            <path d="M1 5L4.5 8.5L13 1" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                        </svg>
                                    </div>
                                    <span className="text-[14px] text-gray-700 font-[500]">Package is Customizable</span>
                                </label>
                            </div>
                        </div>
                    )}

                    {activeTab === 'addons' && (
                        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-300">
                            {/* Available Add-ons */}
                            <div>
                                <h3 className="text-[16px] font-[700] text-[#1A181B] mb-1">Available Add-ons</h3>
                                <p className="text-[13px] text-gray-500 mb-6">Additional services customers can purchase with this decoration package</p>

                                <div className="p-4 bg-[#FDF6FA] rounded-[20px] border border-[#F9A8D4] border-dashed mb-6">
                                    <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
                                        <label className="block text-[13px] font-[500] text-[#374151]">Select Category</label>
                                        <button
                                            type="button"
                                            onClick={() => { setEditingAddon(null); setIsCreateAddonOpen(true) }}
                                            className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-white border border-[#AD09D4] text-[#AD09D4] rounded-[10px] text-[12px] font-[700] hover:bg-[#FDF4FF] transition-colors shadow-sm"
                                        >
                                            <Plus size={14} strokeWidth={2.5} />
                                            Create New Add-on
                                        </button>
                                    </div>
                                    <div className="flex flex-col gap-4 mb-6">
                                        {Array.from({ length: Math.ceil(allAddons.length / 2) }).map((_, rowIndex) => {
                                            const rowAddons = allAddons.slice(rowIndex * 2, rowIndex * 2 + 2);
                                            const rowHasActive = rowAddons.some(a => a.name === activeAddonId);

                                            return (
                                                <React.Fragment key={`row-${rowIndex}`}>
                                                    <div className="grid grid-cols-2 gap-4">
                                                        {rowAddons.map((addon) => {
                                                            const isSelected = formData.addons.some(a => a.name === addon.name);
                                                            const isEditing = activeAddonId === addon.name && activeAddonMode === 'edit';
                                                            const isViewing = activeAddonId === addon.name && activeAddonMode === 'view';
                                                            const isActive = isEditing || isViewing;

                                                            return (
                                                                <div
                                                                    key={addon.name}
                                                                    className={`p-4 rounded-[12px] border cursor-pointer flex items-center justify-between transition-colors ${isSelected ? 'border-[#AD09D4] bg-[#FDF4FF]' : isActive ? 'border-[#AD09D4] bg-[#FDF4FF]' : 'border-gray-200 bg-white hover:bg-gray-50'}`}
                                                                    onClick={() => handleAddonAction(addon.name, 'edit')}
                                                                >
                                                                    <div className="flex items-center gap-3">
                                                                        <div
                                                                            className={`w-5 h-5 rounded flex items-center justify-center border transition-colors cursor-pointer ${isSelected ? 'border-[#AD09D4] bg-[#AD09D4]' : 'border-gray-300 bg-white hover:border-[#AD09D4]'}`}
                                                                            onClick={(e) => { e.stopPropagation(); toggleAddonSelection(addon.name) }}
                                                                        >
                                                                            {isSelected && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>}
                                                                        </div>
                                                                        {(() => {
                                                                            // Render icons properly: <img> for paths/urls,
                                                                            // <span> for emoji or plain text. Earlier the
                                                                            // raw string was rendered as text, so cards
                                                                            // showed "/camera.svg" instead of the actual
                                                                            // SVG.
                                                                            const ico = resolveAddonIcon(addon.icon);
                                                                            if (ico.isImage) {
                                                                                return (
                                                                                    <img
                                                                                        src={ico.src}
                                                                                        alt={addon.name}
                                                                                        className="w-6 h-6 object-contain shrink-0"
                                                                                        onError={(e) => { e.currentTarget.outerHTML = '<span class="text-[20px]">✨</span>'; }}
                                                                                    />
                                                                                );
                                                                            }
                                                                            return <span className="text-[20px]">{ico.text || '✨'}</span>;
                                                                        })()}
                                                                        <div>
                                                                            <h4 className={`text-[14px] font-[600] ${isActive ? 'text-[#1A181B]' : 'text-gray-700'}`}>{addon.name}</h4>
                                                                            <p className="text-[12px] text-gray-500">{addon.desc}</p>
                                                                        </div>
                                                                    </div>
                                                                    <div className="flex gap-2 text-gray-400">
                                                                        <button
                                                                            className={`p-1 transition-colors ${isEditing ? 'text-[#AD09D4]' : 'hover:text-gray-600'}`}
                                                                            onClick={(e) => { e.stopPropagation(); handleAddonAction(addon.name, 'edit') }}
                                                                        >
                                                                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path></svg>
                                                                        </button>
                                                                        <button
                                                                            className={`p-1 transition-colors ${isViewing ? 'text-[#AD09D4]' : 'hover:text-gray-600'}`}
                                                                            onClick={(e) => { e.stopPropagation(); handleAddonAction(addon.name, 'view') }}
                                                                        >
                                                                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                                                                        </button>
                                                                    </div>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>

                                                    {rowHasActive && activeAddonId && (
                                                        (() => {
                                                            const activeAddonData = formData.addons.find(a => a.name === activeAddonId);
                                                            if (!activeAddonData) return null;

                                                            const icon = allAddons.find(a => a.name === activeAddonId)?.icon || '✨';

                                                            if (activeAddonMode === 'edit') {
                                                                return (
                                                                    <div className="bg-white rounded-[16px] p-5 shadow-sm space-y-5 border border-gray-100">
                                                                        <div className="flex flex-col gap-1 items-start">
                                                                            <div className="flex items-center gap-3">
                                                                                <div className="w-10 h-10 border border-t border-gray-200 flex items-center justify-center rounded-lg shadow-sm bg-white overflow-hidden">
                                                                                    {(() => {
                                                                                        const ico = resolveAddonIcon(icon);
                                                                                        return ico.isImage
                                                                                            ? <img src={ico.src} alt="" className="w-7 h-7 object-contain" onError={(e) => { e.currentTarget.outerHTML = "<span class='text-xl'>✨</span>"; }} />
                                                                                            : <span className="text-xl">{ico.text || icon || '✨'}</span>;
                                                                                    })()}
                                                                                </div>
                                                                                <button className="text-[13px] font-[500] text-[#F97316]">Upload Icon</button>
                                                                            </div>
                                                                        </div>

                                                                        <div className="grid grid-cols-2 gap-x-6 gap-y-6">
                                                                            <div className="flex flex-col">
                                                                                <label className="block text-[13px] font-[500] text-[#374151] mb-2">Category Name</label>
                                                                                <div className="relative">
                                                                                    <input type="text" value={activeAddonData.name} readOnly title="Category name matches the addon" className="w-full px-4 py-2.5 bg-white rounded-[10px] border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#F97316] text-[14px] text-gray-700" />
                                                                                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                                                                                </div>
                                                                            </div>
                                                                            <div className="flex flex-col">
                                                                                <label className="block text-[13px] font-[500] text-[#374151] mb-2">Description</label>
                                                                                <textarea
                                                                                    rows={3}
                                                                                    value={activeAddonData.description || ''}
                                                                                    onChange={(e) => updateActiveAddon('description', e.target.value)}
                                                                                    className="w-full px-4 py-2.5 bg-white rounded-[10px] border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#F97316] text-[14px] resize-none leading-relaxed"
                                                                                />
                                                                            </div>

                                                                            <div className="flex flex-col">
                                                                                <label className="block text-[13px] font-[500] text-[#374151] mb-2">Base Price</label>
                                                                                <div className="relative">
                                                                                    <input
                                                                                        type="number"
                                                                                        value={activeAddonData.basePrice || ''}
                                                                                        onChange={(e) => updateActiveAddon('basePrice', e.target.value)}
                                                                                        className="w-full px-4 py-2.5 bg-white rounded-[10px] border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#F97316] text-[14px]"
                                                                                    />
                                                                                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                                                                                </div>
                                                                                <p className="text-[11px] text-gray-400 mt-1">Charges pre hour</p>
                                                                            </div>
                                                                            <div className="flex flex-col">
                                                                                <div className="flex items-center gap-3 mb-2">
                                                                                    <label className="block text-[13px] font-[500] text-[#374151]">Full Event Price</label>
                                                                                    <div
                                                                                        className={`w-10 h-6 rounded-full relative cursor-pointer transition-colors ${activeAddonData.hasFullEventPrice ? 'bg-[#22C55E]' : 'bg-gray-300'}`}
                                                                                        onClick={() => updateActiveAddon('hasFullEventPrice', !activeAddonData.hasFullEventPrice)}
                                                                                    >
                                                                                        <div className={`w-5 h-5 bg-white rounded-full absolute top-[2px] shadow-sm transition-all ${activeAddonData.hasFullEventPrice ? 'right-[2px]' : 'left-[2px]'}`}></div>
                                                                                    </div>
                                                                                </div>
                                                                                <div className="relative">
                                                                                    <input
                                                                                        type="number"
                                                                                        value={activeAddonData.fullEventPrice || ''}
                                                                                        onChange={(e) => updateActiveAddon('fullEventPrice', e.target.value)}
                                                                                        disabled={!activeAddonData.hasFullEventPrice}
                                                                                        className={`w-full px-4 py-2.5 bg-white rounded-[10px] border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#F97316] text-[14px] ${!activeAddonData.hasFullEventPrice ? 'opacity-60 bg-gray-50' : ''}`}
                                                                                    />
                                                                                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                                                                                </div>
                                                                            </div>

                                                                            <div className="col-span-2">
                                                                                <label className="block text-[13px] font-[500] text-[#374151] mb-2">Add Hours</label>
                                                                                <input
                                                                                    type="text"
                                                                                    placeholder="e.g. 1, 2, 4, etc. (Press Enter to add)"
                                                                                    onKeyPress={(e) => {
                                                                                        if (e.key === 'Enter') {
                                                                                            e.preventDefault();
                                                                                            if (e.target.value.trim()) {
                                                                                                const newHours = [...(activeAddonData.extraHours || []), e.target.value.trim() + ' Hour'];
                                                                                                updateActiveAddon('extraHours', newHours);
                                                                                                e.target.value = '';
                                                                                            }
                                                                                        }
                                                                                    }}
                                                                                    className="w-full px-4 py-2.5 bg-white rounded-[10px] border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#F97316] text-[14px]"
                                                                                />
                                                                                <div className="flex gap-2 mt-2">
                                                                                    {(activeAddonData.extraHours || []).map((hr, idx) => (
                                                                                        <div key={idx} className="px-3 py-1 bg-[#FDF4FF] border border-[#FBCFE8] text-[#AD09D4] rounded-full text-[12px] font-[500] flex items-center gap-1.5">
                                                                                            {hr} <X size={12} className="cursor-pointer hover:text-red-500" onClick={() => updateActiveAddon('extraHours', activeAddonData.extraHours.filter((_, i) => i !== idx))} />
                                                                                        </div>
                                                                                    ))}
                                                                                </div>
                                                                                <label className="flex items-center gap-2 mt-3 cursor-pointer w-fit">
                                                                                    <input
                                                                                        type="checkbox"
                                                                                        checked={activeAddonData.extraHoursChargesApply ?? true}
                                                                                        onChange={(e) => updateActiveAddon('extraHoursChargesApply', e.target.checked)}
                                                                                        className="w-4 h-4 rounded border-gray-300 text-[#F97316] focus:ring-[#F97316]"
                                                                                    />
                                                                                    <span className="text-[13px] text-gray-600">Extra Hours Charges Apply</span>
                                                                                </label>
                                                                            </div>

                                                                            <div className="col-span-2">
                                                                                <label className="block text-[13px] font-[500] text-[#374151] mb-2">
                                                                                    {activeAddonData.name === 'Photography Coverage' ? 'Photographer Count' :
                                                                                        activeAddonData.name === 'Music & DJ' ? 'DJ Operator Count' :
                                                                                            activeAddonData.name === 'Live Food Stations' ? 'Chef Count' :
                                                                                                activeAddonData.name === 'Kids Entertainment Zone' ? 'Supervision' :
                                                                                                    activeAddonData.name === 'Professional Event Host' ? 'Host Count' : 'Count'}
                                                                                </label>
                                                                                <div className="relative">
                                                                                    <input
                                                                                        type="number"
                                                                                        value={activeAddonData.count || ''}
                                                                                        onChange={(e) => updateActiveAddon('count', e.target.value)}
                                                                                        className="w-full px-4 py-2.5 bg-white rounded-[10px] border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#F97316] text-[14px]"
                                                                                    />
                                                                                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                                                                                </div>
                                                                            </div>
                                                                        </div>

                                                                        <div className="pt-2">
                                                                            <div className="flex items-center justify-between mb-3">
                                                                                <h4 className="text-[13px] font-[600] text-[#1A181B]">
                                                                                    {activeAddonData.name === 'Photography Coverage' ? 'Photos Delivered' :
                                                                                        activeAddonData.name === 'Music & DJ' ? 'Equipment Included' :
                                                                                            activeAddonData.name === 'Live Food Stations' ? 'Servings Capacity' :
                                                                                                activeAddonData.name === 'Kids Entertainment Zone' ? 'Safety' :
                                                                                                    activeAddonData.name === 'Photo booth' ? 'What You Get' :
                                                                                                        activeAddonData.name === 'Professional Event Host' ? 'Role' : 'Included Deliverables'}
                                                                                </h4>
                                                                                <button
                                                                                    onClick={() => updateActiveAddon('deliverables', [...(activeAddonData.deliverables || []), ''])}
                                                                                    className="text-[#F97316] text-[13px] font-[600] flex items-center gap-1 hover:text-[#EA580C] transition-colors"
                                                                                >
                                                                                    <Plus size={14} /> Add
                                                                                </button>
                                                                            </div>
                                                                            <div className="space-y-3">
                                                                                {(activeAddonData.deliverables || []).map((deliverable, idx) => (
                                                                                    <div key={idx} className="flex items-center gap-3">
                                                                                        <div className="text-gray-400 cursor-move flex flex-col justify-center gap-[2px]">
                                                                                            <div className="w-4 h-[2px] bg-gray-400 rounded-full"></div>
                                                                                            <div className="w-4 h-[2px] bg-gray-400 rounded-full"></div>
                                                                                        </div>
                                                                                        <input
                                                                                            type="text"
                                                                                            value={deliverable}
                                                                                            onChange={(e) => {
                                                                                                const newDels = [...activeAddonData.deliverables];
                                                                                                newDels[idx] = e.target.value;
                                                                                                updateActiveAddon('deliverables', newDels);
                                                                                            }}
                                                                                            className="flex-1 px-4 py-2.5 bg-white rounded-[10px] border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#F97316] text-[14px]"
                                                                                        />
                                                                                        <button
                                                                                            onClick={() => {
                                                                                                const newDels = activeAddonData.deliverables.filter((_, i) => i !== idx);
                                                                                                updateActiveAddon('deliverables', newDels);
                                                                                            }}
                                                                                            className="text-gray-400 hover:text-red-500 transition-colors p-1"
                                                                                        >
                                                                                            <Trash2 size={18} strokeWidth={1.5} />
                                                                                        </button>
                                                                                    </div>
                                                                                ))}
                                                                            </div>
                                                                        </div>
                                                                    </div>
                                                                );
                                                            } else if (activeAddonMode === 'view') {
                                                                return (
                                                                    <div className="bg-white mb-2 font-manrope pt-2 px-6 pb-4">
                                                                        <div className="flex items-start justify-between mb-6">
                                                                            <div className="flex items-center gap-2.5">
                                                                                {(() => {
                                                                                    const ico = resolveAddonIcon(icon);
                                                                                    return ico.isImage
                                                                                        ? <img src={ico.src} alt="" className="w-7 h-7 object-contain" onError={(e) => { e.currentTarget.outerHTML = "<span class='text-[24px]'>✨</span>"; }} />
                                                                                        : <span className="text-[24px]">{ico.text || icon || '✨'}</span>;
                                                                                })()}
                                                                                <div className="flex flex-col gap-0.5">
                                                                                    <h3 className="text-[15px] font-[500] text-[#1A181B]">{activeAddonData.name}</h3>
                                                                                    <p className="text-[13px] text-gray-400 font-[400]">{activeAddonData.description}</p>
                                                                                </div>
                                                                            </div>
                                                                        </div>

                                                                        {activeAddonData.name === 'Live Food Stations' && (
                                                                            <div className="border border-gray-100 rounded-[12px] p-5 bg-white mb-6">
                                                                                <h4 className="text-[14px] font-[600] text-[#1A181B] mb-4 flex items-center gap-1.5 border-b border-gray-50 pb-3">Counter Types <span className="text-gray-400 font-[400] text-[12px]">(User Side Checkbox)</span></h4>
                                                                                <div className="space-y-3 pt-1">
                                                                                    {['Pasta', 'Chaat', 'Barbecue', 'Dosa', 'Mocktail bar'].map((type, i) => (
                                                                                        <div key={i} className="flex items-center gap-3">
                                                                                            <div className="w-3.5 h-3.5 rounded-sm border border-[#22C55E] flex items-center justify-center bg-white"><div className="w-1.5 h-1.5 rounded-full bg-[#22C55E]"></div></div>
                                                                                            <span className="text-[13px] text-[#1A181B] font-[500] leading-none">{type}</span>
                                                                                        </div>
                                                                                    ))}
                                                                                </div>
                                                                            </div>
                                                                        )}

                                                                        {activeAddonData.name === 'Kids Entertainment Zone' && (
                                                                            <div className="border border-gray-100 rounded-[12px] p-5 bg-white mb-6">
                                                                                <h4 className="text-[14px] font-[600] text-[#1A181B] mb-4 flex items-center gap-1.5 border-b border-gray-50 pb-3">Activities <span className="text-gray-400 font-[400] text-[12px]">(User Side Checkbox)</span></h4>
                                                                                <div className="space-y-3 pt-1">
                                                                                    {['Bouncy castle', 'Face painting', 'Mini games', 'Art & craft'].map((type, i) => (
                                                                                        <div key={i} className="flex items-center gap-3">
                                                                                            <div className="w-3.5 h-3.5 rounded-sm border border-[#22C55E] flex items-center justify-center bg-white"><div className="w-1.5 h-1.5 rounded-full bg-[#22C55E]"></div></div>
                                                                                            <span className="text-[13px] text-[#1A181B] font-[500] leading-none">{type}</span>
                                                                                        </div>
                                                                                    ))}
                                                                                </div>
                                                                            </div>
                                                                        )}

                                                                        {activeAddonData.name === 'Photo booth' && (
                                                                            <div className="border border-gray-100 rounded-[12px] p-5 bg-white mb-6">
                                                                                <h4 className="text-[14px] font-[600] text-[#1A181B] mb-4 flex items-center gap-1.5 border-b border-gray-50 pb-3">Theme Options <span className="text-gray-400 font-[400] text-[12px]">(User Side Checkbox)</span></h4>
                                                                                <div className="space-y-3 pt-1">
                                                                                    {['Birthday Theme', 'Anniversary Theme', 'Kids Party Theme', 'Floral / Elegant Theme'].map((type, i) => (
                                                                                        <div key={i} className="flex items-center gap-3">
                                                                                            <div className="w-3.5 h-3.5 rounded-sm border border-[#22C55E] flex items-center justify-center bg-white"><div className="w-1.5 h-1.5 rounded-full bg-[#22C55E]"></div></div>
                                                                                            <span className="text-[13px] text-[#1A181B] font-[500] leading-none">{type}</span>
                                                                                        </div>
                                                                                    ))}
                                                                                </div>
                                                                            </div>
                                                                        )}

                                                                        <div className="flex flex-wrap gap-x-8 gap-y-6 items-start mb-6">
                                                                            {!['Live Food Stations', 'Kids Entertainment Zone', 'Photo booth'].includes(activeAddonData.name) && (
                                                                                <div className="min-w-[200px]">
                                                                                    <h4 className="text-[13px] font-[500] text-[#1A181B] mb-2.5">Coverage Duration</h4>
                                                                                    <div className="flex gap-2.5">
                                                                                        {(activeAddonData.extraHours || []).map((hr, i) => (
                                                                                            <div key={i} className="px-3.5 py-1.5 rounded-[8px] border border-gray-200 text-[13px] font-[400] text-[#1A181B] bg-white">{hr.replace('Hour', 'hrs')}</div>
                                                                                        ))}
                                                                                        {activeAddonData.hasFullEventPrice && (
                                                                                            <div className="px-3.5 py-1.5 rounded-[8px] border border-gray-200 text-[13px] font-[500] text-[#1A181B] bg-white">Full Event</div>
                                                                                        )}
                                                                                    </div>
                                                                                </div>
                                                                            )}

                                                                            <div className="px-5 py-3.5 rounded-[12px] border border-gray-200 bg-white min-w-[240px]">
                                                                                <div className="flex items-baseline gap-1.5 mb-1">
                                                                                    <span className="text-[18px] font-[600] text-[#1A181B]">₹{activeAddonData.fullEventPrice || activeAddonData.basePrice || '0'}</span>
                                                                                    <span className="text-[12px] text-gray-500 font-[400]">base price</span>
                                                                                </div>
                                                                                {activeAddonData.extraHoursChargesApply && (
                                                                                    <div className="text-[11px] font-[500] text-[#3B82F6]">Extra hour charges apply</div>
                                                                                )}
                                                                            </div>

                                                                            {activeAddonData.name !== 'Photo booth' && (
                                                                                <div className="px-4 py-3.5 rounded-[12px] bg-[#FDF4FF] min-w-[240px]">
                                                                                    <h4 className="text-[13px] font-[500] text-[#1A181B] mb-1">
                                                                                        {activeAddonData.name === 'Photography Coverage' ? 'Photographer Count' :
                                                                                            activeAddonData.name === 'Music & DJ' ? 'DJ Operator Count' :
                                                                                                activeAddonData.name === 'Live Food Stations' ? 'Chef Count' :
                                                                                                    activeAddonData.name === 'Kids Entertainment Zone' ? 'Supervision' :
                                                                                                        activeAddonData.name === 'Professional Event Host' ? 'Host Count' : 'Count'}
                                                                                    </h4>
                                                                                    <div className="text-[13px] text-gray-500">
                                                                                        {activeAddonData.name === 'Kids Entertainment Zone'
                                                                                            ? '1 caretaker per 10 kids'
                                                                                            : `${activeAddonData.count || '0'} ${['Photography Coverage', 'Music & DJ', 'Live Food Stations', 'Professional Event Host'].includes(activeAddonData.name) ? 'professionals' : 'items'}`}
                                                                                    </div>
                                                                                </div>
                                                                            )}
                                                                        </div>

                                                                        <div>
                                                                            <h4 className="text-[14px] font-[600] text-[#1A181B] mb-3">
                                                                                {activeAddonData.name === 'Photography Coverage' ? 'Photos Delivered' :
                                                                                    activeAddonData.name === 'Music & DJ' ? 'Equipment Included' :
                                                                                        activeAddonData.name === 'Live Food Stations' ? 'Servings Capacity' :
                                                                                            activeAddonData.name === 'Kids Entertainment Zone' ? 'Safety' :
                                                                                                activeAddonData.name === 'Photo booth' ? 'What You Get' :
                                                                                                    activeAddonData.name === 'Professional Event Host' ? 'Role' : 'Included Deliverables'}
                                                                            </h4>
                                                                            <div className="space-y-1.5">
                                                                                {(activeAddonData.deliverables || []).map((del, i) => (
                                                                                    <div key={i} className="flex items-start gap-2">
                                                                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#22C55E" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="mt-[2px]"><polyline points="20 6 9 17 4 12"></polyline></svg>
                                                                                        <span className="text-[13px] text-gray-600 font-[400]">{del}</span>
                                                                                    </div>
                                                                                ))}
                                                                            </div>

                                                                            {activeAddonData.name === 'Music & DJ' && (
                                                                                <div className="mt-6">
                                                                                    <h4 className="text-[14px] font-[600] text-[#1A181B] mb-3">Add-Ons</h4>
                                                                                    <div className="space-y-1.5">
                                                                                        {['Dance floor lights', 'Fog machine', 'Live percussionist'].map((del, i) => (
                                                                                            <div key={i} className="flex items-start gap-2">
                                                                                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#22C55E" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="mt-[2px]"><polyline points="20 6 9 17 4 12"></polyline></svg>
                                                                                                <span className="text-[13px] text-gray-600 font-[400]">{del}</span>
                                                                                            </div>
                                                                                        ))}
                                                                                    </div>
                                                                                </div>
                                                                            )}
                                                                        </div>
                                                                    </div>
                                                                );
                                                            }
                                                            return null;
                                                        })()
                                                    )}
                                                </React.Fragment>
                                            );
                                        })}
                                    </div>

                                    {/* Selected add-ons chip rail — read-only summary
                                        of what the admin has ticked in the cards above.
                                        Click X to deselect; the orange "+ Add" button
                                        that used to live here was removed because it
                                        had no onClick handler — the proper way to add
                                        new add-ons is the "+ Create New Add-on" button
                                        at the top of this section. */}
                                    {formData.addons.length > 0 && (
                                        <div className="flex flex-wrap items-center gap-2 mt-6 pb-2">
                                            {formData.addons.map((addon, idx) => (
                                                <div key={idx} className="px-3 py-1.5 bg-[#FDF4FF] border border-[#FBCFE8] text-[#C026D3] rounded-full text-[12px] font-[500] flex items-center gap-1.5">
                                                    {addon.name}
                                                    <X size={12} className="cursor-pointer hover:text-purple-700" onClick={() => toggleAddonSelection(addon.name)} />
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Customization Settings */}
                            <div>
                                <h3 className="text-[16px] font-[700] text-[#1A181B] mb-4">Customization Settings</h3>
                                <div className="grid grid-cols-2 gap-6">
                                    <div className="p-4 border border-gray-200 rounded-[12px] flex items-start gap-3 cursor-pointer">
                                        <div className="relative flex items-start mt-0.5">
                                            <input
                                                type="checkbox"
                                                className="w-5 h-5 rounded border border-gray-300 text-[#F97316] focus:ring-[#F97316] peer appearance-none checked:bg-[#F97316] checked:border-[#F97316]"
                                                checked={formData.allowCustomization}
                                                onChange={e => setFormData({ ...formData, allowCustomization: e.target.checked })}
                                            />
                                            <svg className="absolute w-3 h-3 text-white left-1 top-1 pointer-events-none opacity-0 peer-checked:opacity-100" viewBox="0 0 14 10" fill="none">
                                                <path d="M1 5L4.5 8.5L13 1" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                            </svg>
                                        </div>
                                        <div>
                                            <span className="block text-[14px] font-[500] text-[#1A181B]">Allow Customization</span>
                                            <span className="block text-[12px] text-gray-500 mt-0.5">Customers can request changes to colors, flowers, etc.</span>
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-[13px] font-[500] text-[#374151] mb-2">Additional Charges for Customization (%)</label>
                                        <input
                                            type="number"
                                            placeholder="10"
                                            className="w-full px-4 py-2.5 rounded-[10px] border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#F97316] text-[14px]"
                                            value={formData.additionalChargesPercent}
                                            onChange={e => setFormData({ ...formData, additionalChargesPercent: e.target.value })}
                                        />
                                        <p className="text-[11px] text-gray-400 mt-1">Percentage of base price charged for customizations</p>
                                    </div>
                                </div>
                            </div>

                            {/* Restrictions & Requirements */}
                            <div>
                                <h3 className="text-[16px] font-[700] text-[#1A181B] mb-1">Restrictions & Requirements</h3>
                                <p className="text-[13px] text-gray-500 mb-4">Define any limitations or special requirements for this decoration package</p>
                                <div className="grid grid-cols-3 gap-4">
                                    {[
                                        { key: 'indoorOnly', label: 'Indoor Only', hint: 'Only suitable for indoor venues' },
                                        { key: 'weatherDependent', label: 'Weather Dependent', hint: 'Requires good weather conditions' },
                                        { key: 'specialPermission', label: 'Special Permission Required', hint: 'Needs venue/authority approval' },
                                        { key: 'outdoorOnly', label: 'Outdoor Only', hint: 'Only suitable for outdoor venues' },
                                        { key: 'fireHazard', label: 'Fire Hazard', hint: 'Requires extra safety measures' },
                                        { key: 'notSuitableForKids', label: 'Not Suitable for Kids', hint: 'Contains fragile/hazardous items' }
                                    ].map(restriction => (
                                        <div key={restriction.key} className="p-4 border border-gray-200 rounded-[12px] flex items-start gap-3 cursor-pointer hover:bg-gray-50 transition-colors">
                                            <div className="relative flex items-start mt-0.5">
                                                <input
                                                    type="checkbox"
                                                    className="w-5 h-5 rounded border border-gray-300 text-[#F97316] focus:ring-[#F97316] peer appearance-none checked:bg-[#F97316] checked:border-[#F97316]"
                                                    checked={formData.restrictions[restriction.key]}
                                                    onChange={e => setFormData({
                                                        ...formData,
                                                        restrictions: { ...formData.restrictions, [restriction.key]: e.target.checked }
                                                    })}
                                                />
                                                <svg className="absolute w-3 h-3 text-white left-1 top-1 pointer-events-none opacity-0 peer-checked:opacity-100" viewBox="0 0 14 10" fill="none">
                                                    <path d="M1 5L4.5 8.5L13 1" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                                </svg>
                                            </div>
                                            <div>
                                                <span className="block text-[14px] font-[500] text-[#1A181B] leading-snug">{restriction.label}</span>
                                                <span className="block text-[12px] text-gray-500 mt-0.5 leading-snug">{restriction.hint}</span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === 'media' && (
                        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
                            <div>
                                <h3 className="text-[16px] font-[700] text-[#1A181B] mb-1">Event Type Compatibility</h3>
                                <p className="text-[13px] text-gray-500 mb-4">Specify which event types this decoration is best suited for</p>

                                <div className="space-y-6">
                                    <div>
                                        <label className="block text-[13px] font-[500] text-[#374151] mb-2">Best For (Event Types)</label>
                                        <div className="flex gap-4">
                                            <input
                                                type="text"
                                                placeholder="e.g. Wedding, Birthday, Corporate"
                                                className="flex-1 px-4 py-2.5 bg-white rounded-[10px] border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#F97316] text-[14px]"
                                                value={currentBestFor}
                                                onChange={e => setCurrentBestFor(e.target.value)}
                                                onKeyPress={e => {
                                                    if (e.key === 'Enter') {
                                                        e.preventDefault()
                                                        handleAddTag('bestFor', currentBestFor, setCurrentBestFor)
                                                    }
                                                }}
                                            />
                                            <button
                                                onClick={() => handleAddTag('bestFor', currentBestFor, setCurrentBestFor)}
                                                className="px-8 py-2.5 bg-[#F97316] text-white rounded-[10px] font-[600] hover:bg-[#EA580C] transition-colors flex items-center justify-center gap-2"
                                            >
                                                <Plus size={18} />
                                                Add
                                            </button>
                                        </div>
                                        <div className="flex flex-wrap gap-2 mt-3">
                                            {formData.bestFor.map((item, i) => (
                                                <div key={i} className="flex items-center gap-1 bg-[#FDF4FF] text-[#C026D3] px-3 py-1.5 rounded-full text-[12px] font-[600] border border-[#FBCFE8]">
                                                    {item}
                                                    <button onClick={() => handleRemoveTag('bestFor', i)} className="hover:text-purple-700 ml-1">
                                                        <X size={14} />
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    <div>
                                        <label className="block text-[13px] font-[500] text-[#374151] mb-2">Not Recommended For</label>
                                        <div className="flex gap-4">
                                            <input
                                                type="text"
                                                placeholder="e.g. Kids Party, Casual Event"
                                                className="flex-1 px-4 py-2.5 bg-white rounded-[10px] border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#F97316] text-[14px]"
                                                value={currentNotRecommended}
                                                onChange={e => setCurrentNotRecommended(e.target.value)}
                                                onKeyPress={e => {
                                                    if (e.key === 'Enter') {
                                                        e.preventDefault()
                                                        handleAddTag('notRecommendedFor', currentNotRecommended, setCurrentNotRecommended)
                                                    }
                                                }}
                                            />
                                            <button
                                                onClick={() => handleAddTag('notRecommendedFor', currentNotRecommended, setCurrentNotRecommended)}
                                                className="px-8 py-2.5 bg-[#F97316] text-white rounded-[10px] font-[600] hover:bg-[#EA580C] transition-colors flex items-center justify-center gap-2"
                                            >
                                                <Plus size={18} />
                                                Add
                                            </button>
                                        </div>
                                        <div className="flex flex-wrap gap-2 mt-3">
                                            {formData.notRecommendedFor.map((item, i) => (
                                                <div key={i} className="flex items-center gap-1 bg-[#EFF6FF] text-[#0284C7] px-3 py-1.5 rounded-full text-[12px] font-[600] border border-[#BAE6FD]">
                                                    {item}
                                                    <button onClick={() => handleRemoveTag('notRecommendedFor', i)} className="hover:text-blue-700 ml-1">
                                                        <X size={14} />
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Availability & Booking Settings */}
                            <div>
                                <h3 className="text-[16px] font-[700] text-[#1A181B] mb-4">Availability & Booking Settings</h3>
                                <div className="grid grid-cols-2 gap-6">
                                    <div>
                                        <label className="block text-[13px] font-[500] text-[#374151] mb-2">Simultaneous Bookings Allowed</label>
                                        <input
                                            type="number"
                                            placeholder="1"
                                            className="w-full px-4 py-2.5 rounded-[10px] border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#F97316] text-[14px]"
                                            value={formData.simultaneousBookings}
                                            onChange={e => setFormData({ ...formData, simultaneousBookings: e.target.value })}
                                        />
                                        <p className="text-[11px] text-gray-400 mt-1">How many events can use this decoration at the same time</p>
                                    </div>
                                    <div>
                                        <label className="block text-[13px] font-[500] text-[#374151] mb-2">Seasonal Availability</label>
                                        <div className="grid grid-cols-2 gap-4">
                                            {['spring', 'summer', 'fall', 'winter'].map(season => (
                                                <label key={season} className="flex items-center gap-2 p-2.5 border border-gray-200 rounded-[10px] cursor-pointer hover:bg-gray-50">
                                                    <input
                                                        type="checkbox"
                                                        className="w-4 h-4 rounded border-gray-300 text-[#ea580c] focus:ring-[#ea580c]"
                                                        checked={formData.seasonalAvailability[season]}
                                                        onChange={e => setFormData({
                                                            ...formData,
                                                            seasonalAvailability: { ...formData.seasonalAvailability, [season]: e.target.checked }
                                                        })}
                                                    />
                                                    <span className="text-[14px] text-gray-700 capitalize">{season}</span>
                                                </label>
                                            ))}
                                        </div>
                                        <p className="text-[11px] text-gray-400 mt-1.5">Leave unchecked for year-round availability</p>
                                    </div>
                                </div>
                            </div>

                            {/* Special Instructions & Notes */}
                            <div>
                                <h3 className="text-[16px] font-[700] text-[#1A181B] mb-4">Special Instructions & Notes</h3>
                                <div>
                                    <label className="block text-[13px] font-[500] text-[#374151] mb-2">Client Notes</label>
                                    <textarea
                                        rows={3}
                                        placeholder="Special instructions for setup team(internal use only)"
                                        className="w-full px-4 py-2.5 rounded-[12px] border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#F97316] text-[14px] resize-none bg-white"
                                        value={formData.clientNotes}
                                        onChange={e => setFormData({ ...formData, clientNotes: e.target.value })}
                                    />
                                </div>
                            </div>

                            {/* Package Status */}
                            <div>
                                <h3 className="text-[16px] font-[700] text-[#1A181B] mb-4">Package Status</h3>
                                <div className="grid grid-cols-3 gap-4">
                                    {[
                                        { key: 'isActive', label: 'Active', hint: 'Available for booking' },
                                        { key: 'isFeatured', label: 'Featured', hint: 'Show prominently' },
                                        { key: 'isPopular', label: 'Popular', hint: 'Mark as popular choice' }
                                    ].map(status => (
                                        <div key={status.key} className="p-4 border border-gray-200 rounded-[12px] flex items-start gap-3 cursor-pointer hover:bg-gray-50 transition-colors">
                                            <div className="relative flex items-start mt-0.5">
                                                <input
                                                    type="checkbox"
                                                    className="w-5 h-5 rounded border border-gray-300 text-[#F97316] focus:ring-[#F97316] peer appearance-none checked:bg-[#F97316] checked:border-[#F97316]"
                                                    checked={formData[status.key]}
                                                    onChange={e => setFormData({ ...formData, [status.key]: e.target.checked })}
                                                />
                                                <svg className="absolute w-3 h-3 text-white left-1 top-1 pointer-events-none opacity-0 peer-checked:opacity-100" viewBox="0 0 14 10" fill="none">
                                                    <path d="M1 5L4.5 8.5L13 1" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                                </svg>
                                            </div>
                                            <div>
                                                <span className="block text-[14px] font-[500] text-[#1A181B] leading-snug">{status.label}</span>
                                                <span className="block text-[12px] text-gray-500 mt-0.5 leading-snug">{status.hint}</span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === 'media' && (
                        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-300">
                            {/* Media Section */}
                            <div>
                                <div className="mb-2">
                                    <h3 className="text-[14px] font-[600] text-[#1A181B] mb-4">Images</h3>
                                    <div className="flex flex-wrap gap-4">
                                        <label className="w-[200px] h-[120px] rounded-[10px] border border-dashed border-gray-300 flex flex-col items-center justify-center cursor-pointer hover:border-[#F97316] transition-colors bg-white">
                                            <div className="p-2 mb-1">
                                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#6B7280" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                                                    <polyline points="17 8 12 3 7 8" />
                                                    <line x1="12" y1="3" x2="12" y2="15" />
                                                </svg>
                                            </div>
                                            <span className="text-[11px] font-[500] text-gray-500 mb-1">Click to upload or drag and drop</span>
                                            <span className="text-[10px] text-gray-400">PNG, JPG up to 5MB</span>
                                            <input
                                                type="file"
                                                accept="image/*"
                                                multiple
                                                className="hidden"
                                                onChange={handleImageUpload}
                                            />
                                        </label>

                                        {formData.images.map((img, index) => (
                                            <div key={index} className="relative w-[120px] h-[120px] rounded-[10px] border border-gray-200 overflow-hidden group">
                                                <img src={img} alt={`Package ${index}`} className="w-full h-full object-cover" />
                                                <button
                                                    onClick={() => handleRemoveImage(index)}
                                                    className="absolute top-1 right-1 w-5 h-5 bg-white rounded-full flex items-center justify-center shadow-sm text-gray-500 hover:text-red-500 transition-colors z-10"
                                                >
                                                    <X size={12} />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {/* Vendor Information */}
                                <div className="pt-6">
                                    <h3 className="text-[16px] font-[600] text-[#1A181B] mb-4">Vendor Information</h3>
                                    <div className="grid grid-cols-2 gap-6">
                                        <div>
                                            <label className="block text-[13px] font-[500] text-[#374151] mb-2">Vendor Name</label>
                                            <input
                                                type="text"
                                                placeholder="Elite Decorators"
                                                className="w-full px-4 py-2.5 bg-white rounded-[10px] border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#F97316] text-[14px]"
                                                value={formData.vendorName}
                                                onChange={e => setFormData({ ...formData, vendorName: e.target.value })}
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-[13px] font-[500] text-[#374151] mb-2">Contact Number</label>
                                            <input
                                                type="tel"
                                                placeholder="9876543210"
                                                className="w-full px-4 py-2.5 bg-white rounded-[10px] border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#F97316] text-[14px]"
                                                value={formData.vendorPhone}
                                                onChange={e => setFormData({ ...formData, vendorPhone: e.target.value })}
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-[13px] font-[500] text-[#374151] mb-2">Email</label>
                                            <input
                                                type="email"
                                                placeholder="abcd@mail.com"
                                                className="w-full px-4 py-2.5 bg-white rounded-[10px] border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#F97316] text-[14px]"
                                                value={formData.vendorEmail}
                                                onChange={e => setFormData({ ...formData, vendorEmail: e.target.value })}
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-[13px] font-[500] text-[#374151] mb-2">Reliability Rating (1-5)</label>
                                            <input
                                                type="number"
                                                placeholder="5"
                                                min="1"
                                                max="5"
                                                className="w-full px-4 py-2.5 bg-white rounded-[10px] border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#F97316] text-[14px]"
                                                value={formData.vendorRating}
                                                onChange={e => setFormData({ ...formData, vendorRating: e.target.value })}
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="px-8 py-5 bg-white border-t border-gray-100 flex justify-end gap-4 shrink-0 mt-auto">
                    <button
                        onClick={onClose}
                        className="px-8 py-2.5 rounded-[10px] border border-[#F97316] text-[#F97316] text-[14px] font-[600] hover:bg-orange-50 transition-colors flex items-center justify-center gap-2"
                    >
                        <X size={18} />
                        Cancel
                    </button>
                    <button
                        onClick={() => {
                            // Minimum required: name, category, basePrice. The
                            // remaining tabs (items, setup, pricing extras,
                            // add-ons) are all optional.
                            const errs = {}
                            if (!formData.name.trim())                                        errs.name = 'Package name is required'
                            if (!formData.category)                                           errs.category = 'Please select a category'
                            const price = Number(formData.basePrice)
                            if (formData.basePrice === '' || isNaN(price) || price <= 0)      errs.basePrice = 'Base price must be greater than zero'
                            setErrors(errs)
                            if (Object.keys(errs).length) {
                                // Most missing fields live in the Basic Info tab —
                                // jump back so the user can see the red borders.
                                if (errs.name || errs.category) setActiveTab('basic')
                                else if (errs.basePrice) setActiveTab('pricing')
                                const order = ['name', 'category', 'basePrice']
                                const firstBad = order.find(k => errs[k])
                                if (firstBad) {
                                    setTimeout(() => {
                                        const el = document.getElementById(`deco-${firstBad}`)
                                        if (el) { try { el.focus() } catch { /* noop */ } el.scrollIntoView?.({ behavior: 'smooth', block: 'center' }) }
                                    }, 0)
                                }
                                return
                            }
                            onSave?.(formData)
                        }}
                        className="px-8 py-2.5 rounded-[10px] bg-[#F97316] text-white text-[14px] font-semibold border border-[#F97316] hover:bg-[#EA580C] transition-colors flex items-center justify-center gap-2"
                    >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path><polyline points="17 21 17 13 7 13 7 21"></polyline><polyline points="7 3 7 8 15 8"></polyline></svg>
                        Save package
                    </button>
                </div>
            </div >

            {/* Inline AddAddonModal — opened from the "Create New Add-on"
                button in the Add-ons & Restrictions tab. Lets the admin
                grow the global add-on catalogue without losing this
                Decoration Package draft. Higher z-index (handled inside
                AddAddonModal: z-[100]) so it lands above this modal. */}
            <AddAddonModal
                isOpen={isCreateAddonOpen}
                onClose={() => { setIsCreateAddonOpen(false); setEditingAddon(null) }}
                onSave={handleSaveCustomAddon}
                addon={editingAddon}
            />
        </div >
    )
}

export default AddDecorationPackageModal
