import React, { useState, useEffect } from 'react'
import { X, Save, Upload, Plus, ChevronDown } from 'lucide-react'

// Tabs
const TABS = [
    { id: 'basic', label: 'Basic Info' },
    { id: 'pricing', label: 'Pricing & Capacity' },
    { id: 'amenities', label: 'Amenities & Infrastructure' },
    { id: 'policies', label: 'Policies & Availability' },
    { id: 'media', label: 'Media & Contact' },
]

const AddHallModal = ({ isOpen, onClose, onSave, hallData }) => {
    const [activeTab, setActiveTab] = useState('basic')
    // Per-field validation errors. Keys are short ids on the inputs.
    const [errors, setErrors] = useState({})
    const [showHallTypeDropdown, setShowHallTypeDropdown] = useState(false)
    const [showLayoutTypeDropdown, setShowLayoutTypeDropdown] = useState(false)
    const [showAlcoholDropdown, setShowAlcoholDropdown] = useState(false)
    const [showSmokingDropdown, setShowSmokingDropdown] = useState(false)
    const hallTypes = ['Banquet Hall', 'Auditorium', 'Conference Room']
    const layoutTypes = ['Standard', 'Custom']
    const alcoholOptions = ['Not Allowed', 'Allowed', 'With License']
    const smokingOptions = ['Not Allowed', 'Allowed', 'Designated Area']
    const [formData, setFormData] = useState({
        // Basic Info
        name: '',
        type: '',
        layoutType: '',
        floorArea: '',
        ceilingHeight: '',
        description: '',
        floorLevel: '2nd Floor',
        buildingWing: 'Main Building',
        fullAddress: '',
        googleMapsLink: '',
        landmark: '',
        isFeatured: false,

        // Pricing & Capacity
        basePrice: '',
        hourlyRate: '',
        weekendSurcharge: '',
        peakSeasonSurcharge: '',
        securityDeposit: '',
        cleaningCharges: '',
        minBookingHours: '',
        minCapacity: '',
        maxCapacity: '',
        optimalCapacity: '',
        seatingArrangements: {
            theater: false,
            classroom: false,
            banquet: false,
            boardroom: false,
            cocktail: false,
            hollowSquare: false,
            uShape: false,
            custom: false
        },

        // Amenities & Infrastructure
        // Audio/Visual
        soundSystem: false,
        projector: false,
        wifi: false,
        wifiSpeed: '02',
        ledScreen: false,
        screenSize: '',
        // Infrastructure
        airConditioning: false,
        heating: false,
        elevator: false,
        wheelchair: false,
        powerBackup: false,
        // Parking
        parkingHigh: false,
        valetParking: false,
        twoWheelerSlots: '00',
        fourWheelerSlots: '00',
        // Catering
        inHouseCatering: false,
        kitchenAvailable: false,
        barPermit: false,
        externalCatering: false,
        servingStaff: false,
        // Setup
        stage: false,
        stageDimensions: '',
        outdoorArea: false,
        outdoorAreaSize: '',
        greenRoom: false,
        decorationAllowed: false,
        djSetup: false,

        // Policies & Availability
        openingTime: '02',
        closingTime: '02',
        advanceBookingDays: '180',
        minimumNoticeDays: '7',
        availableDays: {
            monday: false,
            tuesday: false,
            wednesday: false,
            thursday: false,
            friday: false,
            saturday: false,
            sunday: false
        },
        cancellationPolicy: '',
        refundMore30: '100',
        refund15_30: '50',
        refund7_15: '25',
        refundLess7: '0',
        alcoholPolicy: '',
        smokingPolicy: '',
        musicCutoffTime: '',
        damagePolicy: '',
        noiseRestrictions: false,
        dressCode: false,
        outsideFood: false,
        ageRestrictions: false,
        petFriendly: false,

        // Media & Contact
        images: [],
        virtualTourLink: '',
        specialFeatures: [],
        bestFor: [],
        contactInfo: '',
        contactEmail: '',
        contactPhone: '',
        alternatePhone: '',
    })

    // Temp state for tag inputs
    const [currentSpecialFeature, setCurrentSpecialFeature] = useState('')
    const [currentBestFor, setCurrentBestFor] = useState('')

    useEffect(() => {
        if (isOpen) {
            if (hallData) {
                // Populate form fields based on hallData mapping
                setFormData(prev => ({
                    ...prev,
                    // Basic Info
                    name: hallData.name || '',
                    type: hallData.type || '',
                    description: hallData.description || '',
                    floorLevel: hallData.floorLevel || '2nd Floor',
                    buildingWing: hallData.buildingWing || 'Main Building',
                    isFeatured: hallData.badges?.includes('Featured') || false,

                    // Pricing & Capacity
                    basePrice: hallData.price ? hallData.price.replace(/[^0-9]/g, '') : '',
                    minCapacity: hallData.minPeople || '',
                    maxCapacity: hallData.maxPeople || '',

                    // Amenities
                    soundSystem: hallData.audioVisual?.some(item => item.toLowerCase().includes('sound system')) || false,
                    projector: hallData.audioVisual?.some(item => item.toLowerCase().includes('projector')) || false,
                    wifi: hallData.audioVisual?.some(item => item.toLowerCase().includes('wifi')) || false,
                    ledScreen: hallData.audioVisual?.some(item => item.toLowerCase().includes('led')) || false,

                    // Infrastructure
                    airConditioning: hallData.infrastructure?.some(item => item.toLowerCase().includes('air conditioning') || item.toLowerCase().includes('ac')) || false,
                    powerBackup: hallData.infrastructure?.some(item => item.toLowerCase().includes('power backup')) || false,
                    elevator: hallData.infrastructure?.some(item => item.toLowerCase().includes('elevator')) || false,
                    wheelchair: hallData.infrastructure?.some(item => item.toLowerCase().includes('wheelchair')) || false,

                    // Media & Contact
                    images: hallData.images || [],
                    specialFeatures: hallData.features || [],
                    bestFor: hallData.bestFor || [],
                    contactInfo: hallData.contact?.name || '',
                    contactPhone: hallData.contact?.phone || '',
                    contactEmail: hallData.contact?.email || '',
                }))
            } else {
                // Reset form when opening to add a new hall
                setFormData({
                    name: '',
                    type: '',
                    layoutType: '',
                    floorArea: '',
                    ceilingHeight: '',
                    description: '',
                    floorLevel: '2nd Floor',
                    buildingWing: 'Main Building',
                    fullAddress: '',
                    googleMapsLink: '',
                    landmark: '',
                    isFeatured: false,
                    basePrice: '',
                    hourlyRate: '',
                    weekendSurcharge: '',
                    peakSeasonSurcharge: '',
                    securityDeposit: '',
                    cleaningCharges: '',
                    minBookingHours: '',
                    minCapacity: '',
                    maxCapacity: '',
                    optimalCapacity: '',
                    seatingArrangements: {
                        theater: false, classroom: false, banquet: false, boardroom: false,
                        cocktail: false, hollowSquare: false, uShape: false, custom: false
                    },
                    soundSystem: false, projector: false, wifi: false, wifiSpeed: '02',
                    ledScreen: false, screenSize: '', airConditioning: false, heating: false,
                    elevator: false, wheelchair: false, powerBackup: false,
                    parkingHigh: false, valetParking: false, twoWheelerSlots: '00', fourWheelerSlots: '00',
                    inHouseCatering: false, kitchenAvailable: false, barPermit: false,
                    externalCatering: false, servingStaff: false, stage: false, stageDimensions: '',
                    outdoorArea: false, outdoorAreaSize: '', greenRoom: false, decorationAllowed: false, djSetup: false,
                    openingTime: '02', closingTime: '02', advanceBookingDays: '180', minimumNoticeDays: '7',
                    availableDays: { monday: false, tuesday: false, wednesday: false, thursday: false, friday: false, saturday: false, sunday: false },
                    cancellationPolicy: '', refundMore30: '100', refund15_30: '50', refund7_15: '25', refundLess7: '0',
                    alcoholPolicy: '', smokingPolicy: '', musicCutoffTime: '', damagePolicy: '', noiseRestrictions: false,
                    dressCode: false, outsideFood: false, ageRestrictions: false, petFriendly: false,
                    images: [], virtualTourLink: '', specialFeatures: [], bestFor: [], contactInfo: '', contactEmail: '', contactPhone: '', alternatePhone: ''
                })
                setActiveTab('basic')
            }
        }
    }, [isOpen, hallData])

    if (!isOpen) return null

    const handleSeatingChange = (key) => {
        setFormData(prev => ({
            ...prev,
            seatingArrangements: {
                ...prev.seatingArrangements,
                [key]: !prev.seatingArrangements[key]
            }
        }))
    }

    const handleAvailableDayChange = (key) => {
        setFormData(prev => ({
            ...prev,
            availableDays: {
                ...prev.availableDays,
                [key]: !prev.availableDays[key]
            }
        }))
    }

    const handleAddTag = (listName, value, setter) => {
        if (!value.trim()) return
        setFormData(prev => ({
            ...prev,
            [listName]: [...prev[listName], value.trim()]
        }))
        setter('')
    }

    const handleRemoveTag = (listName, index) => {
        setFormData(prev => ({
            ...prev,
            [listName]: prev[listName].filter((_, i) => i !== index)
        }))
    }

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center font-manrope p-4">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-black/40 backdrop-blur-sm"
                onClick={onClose}
            />

            {/* Modal Content */}
            <div className="relative w-full max-w-[1000px] h-[95vh] bg-[#F9FAFB] rounded-[24px] shadow-2xl flex flex-col animate-in zoom-in-95 duration-200 overflow-hidden">
                {/* Header */}
                <div className="px-8 py-4 bg-[#FFF7ED] border-b border-[#FED7AA] flex justify-between items-center shrink-0">
                    <h2 className="text-[20px] font-[700] text-[#1A181B]">
                        Add New Hall
                    </h2>
                    <button
                        onClick={onClose}
                        className="text-gray-400 hover:text-gray-600 transition-colors"
                    >
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

                {/* Scrollable Body */}
                <div className="flex-1 overflow-y-auto p-8 bg-white">
                    {/* Basic Info Tab */}
                    {activeTab === 'basic' && (
                        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-300">
                            {/* Basic Information Section */}
                            <div>
                                <h3 className="text-[16px] font-[700] text-[#1A181B] mb-4">Basic Information</h3>

                                {/* Row 1: Hall Name | Hall Type */}
                                <div className="grid grid-cols-2 gap-6 mb-4">
                                    <div>
                                        <label htmlFor="hall-name" className="block text-[13px] font-semibold text-[#1A181B] mb-2">
                                            Hall name <span className="text-red-500" aria-hidden="true">*</span>
                                        </label>
                                        <input
                                            id="hall-name"
                                            type="text"
                                            placeholder="e.g. Grand Ballroom, Sapphire Hall"
                                            aria-required="true"
                                            aria-invalid={errors.name ? 'true' : 'false'}
                                            aria-describedby={errors.name ? 'hall-name-err' : undefined}
                                            className={`w-full px-4 py-2.5 rounded-xl border focus:outline-none focus:ring-2 text-[14px] ${errors.name ? 'border-red-400 focus:ring-red-200' : 'border-gray-200 focus:ring-[#F97316]'}`}
                                            value={formData.name}
                                            onChange={e => {
                                                setFormData({ ...formData, name: e.target.value })
                                                if (errors.name) setErrors(prev => ({ ...prev, name: undefined }))
                                            }}
                                        />
                                        {errors.name && (
                                            <p id="hall-name-err" role="alert" className="text-xs text-red-600 mt-1 flex items-center gap-1">
                                                <span aria-hidden="true">⚠</span>{errors.name}
                                            </p>
                                        )}
                                    </div>
                                    <div>
                                        <label htmlFor="hall-type" className="block text-[13px] font-semibold text-[#1A181B] mb-2">
                                            Hall type <span className="text-red-500" aria-hidden="true">*</span>
                                        </label>
                                        <div className="relative">
                                            <button
                                                id="hall-type"
                                                type="button"
                                                aria-required="true"
                                                aria-haspopup="listbox"
                                                aria-expanded={showHallTypeDropdown}
                                                aria-invalid={errors.type ? 'true' : 'false'}
                                                aria-describedby={errors.type ? 'hall-type-err' : undefined}
                                                onClick={() => { setShowHallTypeDropdown(!showHallTypeDropdown); setShowLayoutTypeDropdown(false) }}
                                                className={`flex items-center justify-between w-full px-4 py-2.5 rounded-xl border bg-white text-[14px] outline-none transition-all ${showHallTypeDropdown ? 'ring-2 ring-orange-100 border-orange-300' : errors.type ? 'border-red-400' : 'border-gray-200'}`}
                                            >
                                                <span className={formData.type ? 'text-[#1A181B]' : 'text-gray-400'}>
                                                    {formData.type || 'Select'}
                                                </span>
                                                <ChevronDown className={`text-gray-400 transition-transform duration-200 ${showHallTypeDropdown ? 'rotate-180' : ''}`} size={18} />
                                            </button>
                                            {errors.type && (
                                                <p id="hall-type-err" role="alert" className="text-xs text-red-600 mt-1 flex items-center gap-1">
                                                    <span aria-hidden="true">⚠</span>{errors.type}
                                                </p>
                                            )}
                                            {showHallTypeDropdown && (
                                                <div className="absolute top-full left-0 mt-2 w-full bg-white rounded-2xl shadow-[0px_4px_20px_0px_rgba(0,0,0,0.08)] border border-gray-100 z-30 animate-in fade-in zoom-in-95 duration-200 overflow-hidden">
                                                    {hallTypes.map((type, index) => (
                                                        <div key={type}>
                                                            <button
                                                                type="button"
                                                                onClick={() => {
                                                                    setFormData({ ...formData, type })
                                                                    if (errors.type) setErrors(prev => ({ ...prev, type: undefined }))
                                                                    setShowHallTypeDropdown(false)
                                                                }}
                                                                className={`w-full text-left px-5 py-2.5 text-sm font-medium font-manrope transition-colors ${formData.type === type ? 'bg-[#FE8301] text-white!' : 'text-gray-600 hover:bg-[#FE8301] hover:text-white!'}`}
                                                            >
                                                                {type}
                                                            </button>
                                                            {index < hallTypes.length - 1 && <div className="h-[1px] bg-gray-100 mx-4 my-1" />}
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                {/* Row 2: Layout Type | Floor Area + Ceiling Height */}
                                <div className="grid grid-cols-2 gap-6 mb-4">
                                    <div>
                                        <label className="block text-[13px] font-[600] text-[#1A181B] mb-2">Layout Type</label>
                                        <div className="relative">
                                            <button
                                                type="button"
                                                onClick={() => { setShowLayoutTypeDropdown(!showLayoutTypeDropdown); setShowHallTypeDropdown(false) }}
                                                className={`flex items-center justify-between w-full px-4 py-2.5 rounded-xl border border-gray-200 bg-white text-[14px] outline-none transition-all ${showLayoutTypeDropdown ? 'ring-2 ring-orange-100 border-orange-300' : ''}`}
                                            >
                                                <span className={formData.layoutType ? 'text-[#1A181B]' : 'text-gray-400'}>
                                                    {formData.layoutType || 'Select'}
                                                </span>
                                                <ChevronDown className={`text-gray-400 transition-transform duration-200 ${showLayoutTypeDropdown ? 'rotate-180' : ''}`} size={18} />
                                            </button>
                                            {showLayoutTypeDropdown && (
                                                <div className="absolute top-full left-0 mt-2 w-full bg-white rounded-2xl shadow-[0px_4px_20px_0px_rgba(0,0,0,0.08)] border border-gray-100 z-30 animate-in fade-in zoom-in-95 duration-200 overflow-hidden">
                                                    {layoutTypes.map((type, index) => (
                                                        <div key={type}>
                                                            <button
                                                                type="button"
                                                                onClick={() => { setFormData({ ...formData, layoutType: type }); setShowLayoutTypeDropdown(false) }}
                                                                className={`w-full text-left px-5 py-2.5 text-sm font-medium font-manrope transition-colors ${formData.layoutType === type ? 'bg-[#FE8301] !text-white' : 'text-gray-600 hover:bg-[#FE8301] hover:!text-white'}`}
                                                            >
                                                                {type}
                                                            </button>
                                                            {index < layoutTypes.length - 1 && <div className="h-[1px] bg-gray-100 mx-4 my-1" />}
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-[13px] font-[600] text-[#1A181B] mb-2">Floor Area (sq ft)</label>
                                            <input
                                                type="number"
                                                placeholder="5000"
                                                className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#F97316] text-[14px]"
                                                value={formData.floorArea}
                                                onChange={e => setFormData({ ...formData, floorArea: e.target.value })}
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-[13px] font-[600] text-[#1A181B] mb-2">Ceiling Height (feet)</label>
                                            <input
                                                type="number"
                                                placeholder="18"
                                                className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#F97316] text-[14px]"
                                                value={formData.ceilingHeight}
                                                onChange={e => setFormData({ ...formData, ceilingHeight: e.target.value })}
                                            />
                                        </div>
                                    </div>
                                </div>

                                {/* Row 3: Description (left half only) */}
                                <div className="grid grid-cols-2 gap-6">
                                    <div>
                                        <label className="block text-[13px] font-[600] text-[#1A181B] mb-2">Description</label>
                                        <textarea
                                            rows={5}
                                            placeholder="text"
                                            className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#F97316] text-[14px] resize-none"
                                            value={formData.description}
                                            onChange={e => setFormData({ ...formData, description: e.target.value })}
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Location Details */}
                            <div>
                                <h3 className="text-[16px] font-[700] text-[#1A181B] mb-4">Location Details</h3>

                                {/* Row 1: Floor/Level | Building/Wing */}
                                <div className="grid grid-cols-2 gap-6 mb-4">
                                    <div>
                                        <label className="block text-[13px] font-[600] text-[#1A181B] mb-2">Floor/Level</label>
                                        <input
                                            type="text"
                                            placeholder="2nd Floor"
                                            className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#F97316] text-[14px]"
                                            value={formData.floorLevel}
                                            onChange={e => setFormData({ ...formData, floorLevel: e.target.value })}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-[13px] font-[600] text-[#1A181B] mb-2">Building/Wing</label>
                                        <input
                                            type="text"
                                            placeholder="Main Building"
                                            className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#F97316] text-[14px]"
                                            value={formData.buildingWing}
                                            onChange={e => setFormData({ ...formData, buildingWing: e.target.value })}
                                        />
                                    </div>
                                </div>

                                {/* Row 2: Full Address | Google Maps Link */}
                                <div className="grid grid-cols-2 gap-6 mb-4">
                                    <div>
                                        <label className="block text-[13px] font-[600] text-[#1A181B] mb-2">Full Address</label>
                                        <input
                                            type="text"
                                            placeholder="123 Hall Street, City Center"
                                            className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#F97316] text-[14px]"
                                            value={formData.fullAddress}
                                            onChange={e => setFormData({ ...formData, fullAddress: e.target.value })}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-[13px] font-[600] text-[#1A181B] mb-2">Google Maps Link</label>
                                        <input
                                            type="text"
                                            placeholder="http://maps.google.com/.."
                                            className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#F97316] text-[14px]"
                                            value={formData.googleMapsLink}
                                            onChange={e => setFormData({ ...formData, googleMapsLink: e.target.value })}
                                        />
                                    </div>
                                </div>

                                {/* Row 3: Landmark | Featured checkbox */}
                                <div className="grid grid-cols-2 gap-6">
                                    <div>
                                        <label className="block text-[13px] font-[600] text-[#1A181B] mb-2">Landmark</label>
                                        <input
                                            type="text"
                                            placeholder="Near Central Mall"
                                            className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#F97316] text-[14px]"
                                            value={formData.landmark}
                                            onChange={e => setFormData({ ...formData, landmark: e.target.value })}
                                        />
                                    </div>
                                    <div className="flex items-center pt-7">
                                        <label className="flex items-center gap-3 cursor-pointer">
                                            <input
                                                type="checkbox"
                                                className="w-5 h-5 rounded border-gray-300 text-[#F97316] focus:ring-[#F97316]"
                                                checked={formData.isFeatured}
                                                onChange={e => setFormData({ ...formData, isFeatured: e.target.checked })}
                                            />
                                            <span className="text-[14px] font-[500] text-gray-700">Featured (Show on homepage)</span>
                                        </label>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Pricing & Capacity Tab */}
                    {activeTab === 'pricing' && (
                        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-300">
                            {/* Pricing Configuration */}
                            <div>
                                <h3 className="text-[16px] font-[700] text-[#1A181B] mb-4">Pricing Configuration</h3>

                                {/* Row 1: Base Price | Hourly Rate (select) */}
                                <div className="grid grid-cols-2 gap-6 mb-4">
                                    <div>
                                        <label htmlFor="hall-basePrice" className="block text-[13px] font-semibold text-[#1A181B] mb-2">
                                            Base price (₹) <span className="text-red-500" aria-hidden="true">*</span>
                                        </label>
                                        <input
                                            id="hall-basePrice"
                                            type="number"
                                            inputMode="decimal"
                                            placeholder="5000"
                                            min="0"
                                            aria-required="true"
                                            aria-invalid={errors.basePrice ? 'true' : 'false'}
                                            aria-describedby={errors.basePrice ? 'hall-basePrice-err' : 'hall-basePrice-help'}
                                            className={`w-full px-4 py-2.5 rounded-xl border focus:outline-none focus:ring-2 text-[14px] ${errors.basePrice ? 'border-red-400 focus:ring-red-200' : 'border-gray-200 focus:ring-[#F97316]'}`}
                                            value={formData.basePrice}
                                            onChange={e => {
                                                setFormData({ ...formData, basePrice: e.target.value })
                                                if (errors.basePrice) setErrors(prev => ({ ...prev, basePrice: undefined }))
                                            }}
                                        />
                                        {errors.basePrice ? (
                                            <p id="hall-basePrice-err" role="alert" className="text-xs text-red-600 mt-1 flex items-center gap-1">
                                                <span aria-hidden="true">⚠</span>{errors.basePrice}
                                            </p>
                                        ) : (
                                            <p id="hall-basePrice-help" className="text-[11px] text-gray-500 mt-1">Standard pricing for weekdays</p>
                                        )}
                                    </div>
                                    <div>
                                        <label className="block text-[13px] font-[600] text-[#1A181B] mb-2">Hourly Rate (₹) (Optional)</label>
                                        <select
                                            className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#F97316] text-[14px] bg-white"
                                            value={formData.hourlyRate}
                                            onChange={e => setFormData({ ...formData, hourlyRate: e.target.value })}
                                        >
                                            <option value="">Select</option>
                                            <option value="1000">₹1,000/hr</option>
                                            <option value="2000">₹2,000/hr</option>
                                            <option value="3000">₹3,000/hr</option>
                                            <option value="5000">₹5,000/hr</option>
                                            <option value="10000">₹10,000/hr</option>
                                        </select>
                                        <p className="text-[11px] text-gray-500 mt-1">If charging by the hour</p>
                                    </div>
                                </div>

                                {/* Row 2: Weekend Surcharge | Peak Season Surcharge */}
                                <div className="grid grid-cols-2 gap-6 mb-4">
                                    <div>
                                        <label className="block text-[13px] font-[600] text-[#1A181B] mb-2">Weekend Surcharge (%)</label>
                                        <input
                                            type="number"
                                            placeholder="20"
                                            className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#F97316] text-[14px]"
                                            value={formData.weekendSurcharge}
                                            onChange={e => setFormData({ ...formData, weekendSurcharge: e.target.value })}
                                        />
                                        <p className="text-[11px] text-gray-500 mt-1">Additional charge for Fri-Sun</p>
                                    </div>
                                    <div>
                                        <label className="block text-[13px] font-[600] text-[#1A181B] mb-2">Peak Season Surcharge (%)</label>
                                        <input
                                            type="number"
                                            placeholder="30"
                                            className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#F97316] text-[14px]"
                                            value={formData.peakSeasonSurcharge}
                                            onChange={e => setFormData({ ...formData, peakSeasonSurcharge: e.target.value })}
                                        />
                                        <p className="text-[11px] text-gray-500 mt-1">For festival/holiday season</p>
                                    </div>
                                </div>

                                {/* Row 3: Security Deposit | Cleaning Charges */}
                                <div className="grid grid-cols-2 gap-6 mb-4">
                                    <div>
                                        <label className="block text-[13px] font-[600] text-[#1A181B] mb-2">Security Deposit (₹)</label>
                                        <input
                                            type="number"
                                            placeholder="5000"
                                            className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#F97316] text-[14px]"
                                            value={formData.securityDeposit}
                                            onChange={e => setFormData({ ...formData, securityDeposit: e.target.value })}
                                        />
                                        <p className="text-[11px] text-gray-500 mt-1">Refundable security deposit</p>
                                    </div>
                                    <div>
                                        <label className="block text-[13px] font-[600] text-[#1A181B] mb-2">Cleaning Charges (₹)</label>
                                        <input
                                            type="number"
                                            placeholder="5000"
                                            className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#F97316] text-[14px]"
                                            value={formData.cleaningCharges}
                                            onChange={e => setFormData({ ...formData, cleaningCharges: e.target.value })}
                                        />
                                        <p className="text-[11px] text-gray-500 mt-1">Post-event cleaning fee</p>
                                    </div>
                                </div>

                                {/* Row 4: Minimum Booking Hours (left half only) */}
                                <div className="grid grid-cols-2 gap-6">
                                    <div>
                                        <label className="block text-[13px] font-[600] text-[#1A181B] mb-2">Minimum Booking Hours</label>
                                        <input
                                            type="number"
                                            placeholder="4"
                                            className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#F97316] text-[14px]"
                                            value={formData.minBookingHours}
                                            onChange={e => setFormData({ ...formData, minBookingHours: e.target.value })}
                                        />
                                        <p className="text-[11px] text-gray-500 mt-1">Minimum hours to book</p>
                                    </div>
                                </div>
                            </div>

                            {/* Capacity Configuration */}
                            <div>
                                <h3 className="text-[16px] font-[700] text-[#1A181B] mb-4">Capacity Configuration</h3>

                                {/* 3-col: Min | Max | Optimal */}
                                <div className="grid grid-cols-3 gap-6 mb-4">
                                    <div>
                                        <label className="block text-[13px] font-[600] text-[#1A181B] mb-2">Minimum Capacity</label>
                                        <input
                                            type="number"
                                            placeholder="20"
                                            className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#F97316] text-[14px]"
                                            value={formData.minCapacity}
                                            onChange={e => setFormData({ ...formData, minCapacity: e.target.value })}
                                        />
                                    </div>
                                    <div>
                                        <label htmlFor="hall-maxCapacity" className="block text-[13px] font-semibold text-[#1A181B] mb-2">
                                            Maximum capacity <span className="text-red-500" aria-hidden="true">*</span>
                                        </label>
                                        <input
                                            id="hall-maxCapacity"
                                            type="number"
                                            inputMode="numeric"
                                            placeholder="200"
                                            min="1"
                                            aria-required="true"
                                            aria-invalid={errors.maxCapacity ? 'true' : 'false'}
                                            aria-describedby={errors.maxCapacity ? 'hall-maxCapacity-err' : undefined}
                                            className={`w-full px-4 py-2.5 rounded-xl border focus:outline-none focus:ring-2 text-[14px] ${errors.maxCapacity ? 'border-red-400 focus:ring-red-200' : 'border-gray-200 focus:ring-[#F97316]'}`}
                                            value={formData.maxCapacity}
                                            onChange={e => {
                                                setFormData({ ...formData, maxCapacity: e.target.value })
                                                if (errors.maxCapacity) setErrors(prev => ({ ...prev, maxCapacity: undefined }))
                                            }}
                                        />
                                        {errors.maxCapacity && (
                                            <p id="hall-maxCapacity-err" role="alert" className="text-xs text-red-600 mt-1 flex items-center gap-1">
                                                <span aria-hidden="true">⚠</span>{errors.maxCapacity}
                                            </p>
                                        )}
                                    </div>
                                    <div>
                                        <label className="block text-[13px] font-[600] text-[#1A181B] mb-2">Optimal Capacity</label>
                                        <input
                                            type="number"
                                            placeholder="150"
                                            className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#F97316] text-[14px]"
                                            value={formData.optimalCapacity}
                                            onChange={e => setFormData({ ...formData, optimalCapacity: e.target.value })}
                                        />
                                        <p className="text-[11px] text-gray-500 mt-1">Recommended capacity</p>
                                    </div>
                                </div>

                                {/* Landmark | Featured (as per Figma, appear in Capacity section) */}
                                <div className="grid grid-cols-2 gap-6 mb-4">
                                    <div>
                                        <label className="block text-[13px] font-[600] text-[#1A181B] mb-2">Landmark</label>
                                        <input
                                            type="text"
                                            placeholder="Near Central Mall"
                                            className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#F97316] text-[14px]"
                                            value={formData.landmark}
                                            onChange={e => setFormData({ ...formData, landmark: e.target.value })}
                                        />
                                    </div>
                                    <div className="flex items-center pt-7">
                                        <label className="flex items-center gap-3 cursor-pointer">
                                            <input
                                                type="checkbox"
                                                className="w-5 h-5 rounded border-gray-300 text-[#F97316] focus:ring-[#F97316]"
                                                checked={formData.isFeatured}
                                                onChange={e => setFormData({ ...formData, isFeatured: e.target.checked })}
                                            />
                                            <span className="text-[14px] font-[500] text-gray-700">Featured (Show on homepage)</span>
                                        </label>
                                    </div>
                                </div>

                                {/* Seating Arrangements - 4 col, order matches Figma */}
                                <div>
                                    <label className="block text-[13px] font-[600] text-[#1A181B] mb-3">Seating Arrangements (Select all that apply)</label>
                                    <div className="grid grid-cols-4 gap-3">
                                        {[
                                            { key: 'theater', label: 'Theater' },
                                            { key: 'banquet', label: 'Banquet' },
                                            { key: 'cocktail', label: 'Cocktail' },
                                            { key: 'uShape', label: 'U-Shape' },
                                            { key: 'classroom', label: 'Classroom' },
                                            { key: 'boardroom', label: 'Boardroom' },
                                            { key: 'hollowSquare', label: 'Hollow Square' },
                                            { key: 'custom', label: 'Custom' },
                                        ].map(item => (
                                            <label key={item.key} className="flex items-center gap-3 cursor-pointer p-3 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors">
                                                <input
                                                    type="checkbox"
                                                    className="w-5 h-5 rounded border-gray-300 text-[#F97316] focus:ring-[#F97316]"
                                                    checked={formData.seatingArrangements[item.key]}
                                                    onChange={() => handleSeatingChange(item.key)}
                                                />
                                                <span className="text-[14px] font-[500] text-gray-700">{item.label}</span>
                                            </label>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}



                    {/* Amenities & Infrastructure Tab */}
                    {activeTab === 'amenities' && (
                        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-300">

                            {/* Audio/Visual Equipment */}
                            <div>
                                <h3 className="text-[16px] font-[700] text-[#1A181B] mb-4">Audio/Visual Equipment</h3>
                                <div className="grid grid-cols-2 gap-4">
                                    {/* Left column */}
                                    <div className="space-y-3">
                                        <label className="flex items-center gap-3 p-3 border border-gray-200 rounded-xl cursor-pointer hover:bg-gray-50">
                                            <input type="checkbox" className="w-5 h-5" checked={formData.soundSystem} onChange={e => setFormData({ ...formData, soundSystem: e.target.checked })} />
                                            <span className="text-[14px]">Sound System Available</span>
                                        </label>
                                        <label className="flex items-center gap-3 p-3 border border-gray-200 rounded-xl cursor-pointer hover:bg-gray-50">
                                            <input type="checkbox" className="w-5 h-5" checked={formData.projector} onChange={e => setFormData({ ...formData, projector: e.target.checked })} />
                                            <span className="text-[14px]">Projector Available</span>
                                        </label>
                                    </div>
                                    {/* Right column: WiFi → WiFi Speed → LED Screen → Screen Size */}
                                    <div className="space-y-3">
                                        <label className="flex items-center gap-3 p-3 border border-gray-200 rounded-xl cursor-pointer hover:bg-gray-50">
                                            <input type="checkbox" className="w-5 h-5" checked={formData.wifi} onChange={e => setFormData({ ...formData, wifi: e.target.checked })} />
                                            <span className="text-[14px]">WiFi Available</span>
                                        </label>
                                        <div>
                                            <label className="block text-[13px] font-[600] text-[#1A181B] mb-2">WiFi Speed</label>
                                            <input type="number" placeholder="02" className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#F97316] text-[14px]" value={formData.wifiSpeed} onChange={e => setFormData({ ...formData, wifiSpeed: e.target.value })} />
                                        </div>
                                        <label className="flex items-center gap-3 p-3 border border-gray-200 rounded-xl cursor-pointer hover:bg-gray-50">
                                            <input type="checkbox" className="w-5 h-5" checked={formData.ledScreen} onChange={e => setFormData({ ...formData, ledScreen: e.target.checked })} />
                                            <span className="text-[14px]">LED Screen Available</span>
                                        </label>
                                        <div>
                                            <label className="block text-[13px] font-[600] text-[#1A181B] mb-2">Screen Size</label>
                                            <input type="text" placeholder="10x12 ft" className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#F97316] text-[14px]" value={formData.screenSize} onChange={e => setFormData({ ...formData, screenSize: e.target.value })} />
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Infrastructure & Facilities */}
                            <div>
                                <h3 className="text-[16px] font-[700] text-[#1A181B] mb-4">Infrastructure & Facilities</h3>
                                {/* Row 1: 3-col */}
                                <div className="grid grid-cols-3 gap-4 mb-3">
                                    <label className="flex items-center gap-3 p-3 border border-gray-200 rounded-xl cursor-pointer hover:bg-gray-50">
                                        <input type="checkbox" className="w-5 h-5" checked={formData.airConditioning} onChange={e => setFormData({ ...formData, airConditioning: e.target.checked })} />
                                        <span className="text-[14px]">Air Conditioning</span>
                                    </label>
                                    <label className="flex items-center gap-3 p-3 border border-gray-200 rounded-xl cursor-pointer hover:bg-gray-50">
                                        <input type="checkbox" className="w-5 h-5" checked={formData.elevator} onChange={e => setFormData({ ...formData, elevator: e.target.checked })} />
                                        <span className="text-[14px]">Elevator Available</span>
                                    </label>
                                    <label className="flex items-center gap-3 p-3 border border-gray-200 rounded-xl cursor-pointer hover:bg-gray-50">
                                        <input type="checkbox" className="w-5 h-5" checked={formData.powerBackup} onChange={e => setFormData({ ...formData, powerBackup: e.target.checked })} />
                                        <span className="text-[14px]">Power Backup</span>
                                    </label>
                                </div>
                                {/* Row 2: Heating | Wheelchair | Screen Size input */}
                                <div className="grid grid-cols-3 gap-4">
                                    <label className="flex items-center gap-3 p-3 border border-gray-200 rounded-xl cursor-pointer hover:bg-gray-50">
                                        <input type="checkbox" className="w-5 h-5" checked={formData.heating} onChange={e => setFormData({ ...formData, heating: e.target.checked })} />
                                        <span className="text-[14px]">Heating Available</span>
                                    </label>
                                    <label className="flex items-center gap-3 p-3 border border-gray-200 rounded-xl cursor-pointer hover:bg-gray-50">
                                        <input type="checkbox" className="w-5 h-5" checked={formData.wheelchair} onChange={e => setFormData({ ...formData, wheelchair: e.target.checked })} />
                                        <span className="text-[14px]">Wheelchair Accessible</span>
                                    </label>
                                    <div>
                                        <label className="block text-[13px] font-[600] text-[#1A181B] mb-2">Screen Size</label>
                                        <input type="text" placeholder="10x12 ft" className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#F97316] text-[14px]" value={formData.screenSize} onChange={e => setFormData({ ...formData, screenSize: e.target.value })} />
                                    </div>
                                </div>
                            </div>

                            {/* Parking Facilities */}
                            <div>
                                <h3 className="text-[16px] font-[700] text-[#1A181B] mb-4">Parking Facilities</h3>
                                {/* Row 1: Parking Available | Valet Parking */}
                                <div className="grid grid-cols-2 gap-4 mb-4">
                                    <label className="flex items-center gap-3 p-3 border border-gray-200 rounded-xl cursor-pointer hover:bg-gray-50">
                                        <input type="checkbox" className="w-5 h-5" checked={formData.parkingHigh} onChange={e => setFormData({ ...formData, parkingHigh: e.target.checked })} />
                                        <span className="text-[14px]">Parking Available</span>
                                    </label>
                                    <label className="flex items-center gap-3 p-3 border border-gray-200 rounded-xl cursor-pointer hover:bg-gray-50">
                                        <input type="checkbox" className="w-5 h-5" checked={formData.valetParking} onChange={e => setFormData({ ...formData, valetParking: e.target.checked })} />
                                        <span className="text-[14px]">Valet Parking Available</span>
                                    </label>
                                </div>
                                {/* Two-Wheeler (left half only) */}
                                <div className="grid grid-cols-2 gap-4 mb-4">
                                    <div>
                                        <label className="block text-[13px] font-[600] text-[#1A181B] mb-2">Two-Wheeler Parking Slots</label>
                                        <input type="number" placeholder="00" className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#F97316] text-[14px]" value={formData.twoWheelerSlots} onChange={e => setFormData({ ...formData, twoWheelerSlots: e.target.value })} />
                                    </div>
                                </div>
                                {/* Four-Wheeler (left half only) */}
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-[13px] font-[600] text-[#1A181B] mb-2">Four-Wheeler Parking Slots</label>
                                        <input type="number" placeholder="00" className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#F97316] text-[14px]" value={formData.fourWheelerSlots} onChange={e => setFormData({ ...formData, fourWheelerSlots: e.target.value })} />
                                    </div>
                                </div>
                            </div>

                            {/* Catering & Food */}
                            <div>
                                <h3 className="text-[16px] font-[700] text-[#1A181B] mb-4">Catering & Food</h3>
                                {/* Row 1: In-house | External */}
                                <div className="grid grid-cols-2 gap-4 mb-3">
                                    <label className="flex items-center gap-3 p-3 border border-gray-200 rounded-xl cursor-pointer hover:bg-gray-50">
                                        <input type="checkbox" className="w-5 h-5" checked={formData.inHouseCatering} onChange={e => setFormData({ ...formData, inHouseCatering: e.target.checked })} />
                                        <span className="text-[14px]">In-house Catering Mandatory</span>
                                    </label>
                                    <label className="flex items-center gap-3 p-3 border border-gray-200 rounded-xl cursor-pointer hover:bg-gray-50">
                                        <input type="checkbox" className="w-5 h-5" checked={formData.externalCatering} onChange={e => setFormData({ ...formData, externalCatering: e.target.checked })} />
                                        <span className="text-[14px]">External Catering Allowed</span>
                                    </label>
                                </div>
                                {/* Row 2: Kitchen | Serving Staff */}
                                <div className="grid grid-cols-2 gap-4 mb-3">
                                    <label className="flex items-center gap-3 p-3 border border-gray-200 rounded-xl cursor-pointer hover:bg-gray-50">
                                        <input type="checkbox" className="w-5 h-5" checked={formData.kitchenAvailable} onChange={e => setFormData({ ...formData, kitchenAvailable: e.target.checked })} />
                                        <span className="text-[14px]">Kitchen Available</span>
                                    </label>
                                    <label className="flex items-center gap-3 p-3 border border-gray-200 rounded-xl cursor-pointer hover:bg-gray-50">
                                        <input type="checkbox" className="w-5 h-5" checked={formData.servingStaff} onChange={e => setFormData({ ...formData, servingStaff: e.target.checked })} />
                                        <span className="text-[14px]">Serving Staff Provided</span>
                                    </label>
                                </div>
                                {/* Row 3: Bar Permit (left only) */}
                                <div className="grid grid-cols-2 gap-4">
                                    <label className="flex items-center gap-3 p-3 border border-gray-200 rounded-xl cursor-pointer hover:bg-gray-50">
                                        <input type="checkbox" className="w-5 h-5" checked={formData.barPermit} onChange={e => setFormData({ ...formData, barPermit: e.target.checked })} />
                                        <span className="text-[14px]">Bar Permit Available</span>
                                    </label>
                                </div>
                            </div>

                            {/* Setup & Decoration Options */}
                            <div>
                                <h3 className="text-[16px] font-[700] text-[#1A181B] mb-4">Setup & Decoration Options</h3>
                                {/* Row 1: Stage Available | Green Room Available */}
                                <div className="grid grid-cols-2 gap-4 mb-3">
                                    <label className="flex items-center gap-3 p-3 border border-gray-200 rounded-xl cursor-pointer hover:bg-gray-50">
                                        <input type="checkbox" className="w-5 h-5" checked={formData.stage} onChange={e => setFormData({ ...formData, stage: e.target.checked })} />
                                        <span className="text-[14px]">Stage Available</span>
                                    </label>
                                    <label className="flex items-center gap-3 p-3 border border-gray-200 rounded-xl cursor-pointer hover:bg-gray-50">
                                        <input type="checkbox" className="w-5 h-5" checked={formData.greenRoom} onChange={e => setFormData({ ...formData, greenRoom: e.target.checked })} />
                                        <span className="text-[14px]">Green Room Available</span>
                                    </label>
                                </div>
                                {/* Row 2: Stage Dimensions (left) | Decoration Allowed + DJ Setup (right stacked) */}
                                <div className="grid grid-cols-2 gap-4 mb-3">
                                    <div>
                                        <label className="block text-[13px] font-[600] text-[#1A181B] mb-2">Stage Dimensions</label>
                                        <input type="text" placeholder="20x15ft" className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#F97316] text-[14px]" value={formData.stageDimensions} onChange={e => setFormData({ ...formData, stageDimensions: e.target.value })} />
                                    </div>
                                    <div className="flex flex-col gap-3 justify-center">
                                        <label className="flex items-center gap-3 p-3 border border-gray-200 rounded-xl cursor-pointer hover:bg-gray-50">
                                            <input type="checkbox" className="w-5 h-5" checked={formData.decorationAllowed} onChange={e => setFormData({ ...formData, decorationAllowed: e.target.checked })} />
                                            <span className="text-[14px]">Decoration Allowed</span>
                                        </label>
                                        <label className="flex items-center gap-3 p-3 border border-gray-200 rounded-xl cursor-pointer hover:bg-gray-50">
                                            <input type="checkbox" className="w-5 h-5" checked={formData.djSetup} onChange={e => setFormData({ ...formData, djSetup: e.target.checked })} />
                                            <span className="text-[14px]">DJ Setup Allowed</span>
                                        </label>
                                    </div>
                                </div>
                                {/* Row 3: Outdoor Area Available (left only) */}
                                <div className="grid grid-cols-2 gap-4 mb-3">
                                    <label className="flex items-center gap-3 p-3 border border-gray-200 rounded-xl cursor-pointer hover:bg-gray-50">
                                        <input type="checkbox" className="w-5 h-5" checked={formData.outdoorArea} onChange={e => setFormData({ ...formData, outdoorArea: e.target.checked })} />
                                        <span className="text-[14px]">Outdoor Area Available</span>
                                    </label>
                                </div>
                                {/* Row 4: Outdoor Area Size (left half only) */}
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-[13px] font-[600] text-[#1A181B] mb-2">Outdoor Area Size</label>
                                        <input type="text" placeholder="2000 sq ft" className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#F97316] text-[14px]" value={formData.outdoorAreaSize} onChange={e => setFormData({ ...formData, outdoorAreaSize: e.target.value })} />
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Policies & Availability Tab */}
                    {activeTab === 'policies' && (
                        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-300">

                            {/* Availability & Timing */}
                            <div>
                                <h3 className="text-[16px] font-[700] text-[#1A181B] mb-4">Availability & Timing</h3>
                                {/* Row 1: Opening Time | Closing Time */}
                                <div className="grid grid-cols-2 gap-6 mb-4">
                                    <div>
                                        <label className="block text-[13px] font-[600] text-[#1A181B] mb-2">Opening Time</label>
                                        <input
                                            type="time"
                                            className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#F97316] text-[14px]"
                                            value={formData.openingTime}
                                            onChange={e => setFormData({ ...formData, openingTime: e.target.value })}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-[13px] font-[600] text-[#1A181B] mb-2">Closing Time</label>
                                        <input
                                            type="time"
                                            className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#F97316] text-[14px]"
                                            value={formData.closingTime}
                                            onChange={e => setFormData({ ...formData, closingTime: e.target.value })}
                                        />
                                    </div>
                                </div>
                                {/* Row 2: Advance Booking Days | Minimum Notice Days */}
                                <div className="grid grid-cols-2 gap-6 mb-4">
                                    <div>
                                        <label className="block text-[13px] font-[600] text-[#1A181B] mb-2">Advance Booking Days</label>
                                        <input
                                            type="number"
                                            placeholder="180"
                                            className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#F97316] text-[14px]"
                                            value={formData.advanceBookingDays}
                                            onChange={e => setFormData({ ...formData, advanceBookingDays: e.target.value })}
                                        />
                                        <p className="text-[11px] text-gray-500 mt-1">How far in advance can customers book</p>
                                    </div>
                                    <div>
                                        <label className="block text-[13px] font-[600] text-[#1A181B] mb-2">Minimum Notice Days</label>
                                        <input
                                            type="number"
                                            placeholder="7"
                                            className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#F97316] text-[14px]"
                                            value={formData.minimumNoticeDays}
                                            onChange={e => setFormData({ ...formData, minimumNoticeDays: e.target.value })}
                                        />
                                        <p className="text-[11px] text-gray-500 mt-1">Minimum days before event</p>
                                    </div>
                                </div>
                                {/* Available Days – 4-col grid (Mon-Thu row 1, Fri-Sun row 2) */}
                                <div>
                                    <label className="block text-[13px] font-[600] text-[#1A181B] mb-3">Available Days</label>
                                    <div className="grid grid-cols-4 gap-3 mb-3">
                                        {['monday', 'tuesday', 'wednesday', 'thursday'].map(day => (
                                            <label key={day} className="flex items-center gap-3 cursor-pointer p-3 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors">
                                                <input
                                                    type="checkbox"
                                                    className="w-5 h-5 rounded border-gray-300 text-[#F97316] focus:ring-[#F97316]"
                                                    checked={formData.availableDays[day]}
                                                    onChange={() => handleAvailableDayChange(day)}
                                                />
                                                <span className="text-[14px] font-[500] text-gray-700 capitalize">{day}</span>
                                            </label>
                                        ))}
                                    </div>
                                    <div className="grid grid-cols-4 gap-3">
                                        {['friday', 'saturday', 'sunday'].map(day => (
                                            <label key={day} className="flex items-center gap-3 cursor-pointer p-3 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors">
                                                <input
                                                    type="checkbox"
                                                    className="w-5 h-5 rounded border-gray-300 text-[#F97316] focus:ring-[#F97316]"
                                                    checked={formData.availableDays[day]}
                                                    onChange={() => handleAvailableDayChange(day)}
                                                />
                                                <span className="text-[14px] font-[500] text-gray-700 capitalize">{day}</span>
                                            </label>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            {/* Cancellation & Refund Policy */}
                            <div>
                                <h3 className="text-[16px] font-[700] text-[#1A181B] mb-4">Cancellation & Refund Policy</h3>
                                {/* Full-width textarea */}
                                <div className="mb-4">
                                    <label className="block text-[13px] font-[600] text-[#1A181B] mb-2">Cancellation Policy Description</label>
                                    <textarea
                                        rows={4}
                                        placeholder="Describe the cancellation terms and condition"
                                        className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#F97316] text-[14px] resize-none"
                                        value={formData.cancellationPolicy}
                                        onChange={e => setFormData({ ...formData, cancellationPolicy: e.target.value })}
                                    />
                                </div>
                                {/* Refund row 1 */}
                                <div className="grid grid-cols-2 gap-6 mb-4">
                                    <div>
                                        <label className="block text-[13px] font-[600] text-[#1A181B] mb-2">Refund % (More than 30 days)</label>
                                        <input
                                            type="number"
                                            placeholder="100"
                                            className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#F97316] text-[14px]"
                                            value={formData.refundMore30}
                                            onChange={e => setFormData({ ...formData, refundMore30: e.target.value })}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-[13px] font-[600] text-[#1A181B] mb-2">Refund % (15-30 days)</label>
                                        <input
                                            type="number"
                                            placeholder="50"
                                            className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#F97316] text-[14px]"
                                            value={formData.refund15_30}
                                            onChange={e => setFormData({ ...formData, refund15_30: e.target.value })}
                                        />
                                    </div>
                                </div>
                                {/* Refund row 2 */}
                                <div className="grid grid-cols-2 gap-6">
                                    <div>
                                        <label className="block text-[13px] font-[600] text-[#1A181B] mb-2">Refund % (7-15 days)</label>
                                        <input
                                            type="number"
                                            placeholder="25"
                                            className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#F97316] text-[14px]"
                                            value={formData.refund7_15}
                                            onChange={e => setFormData({ ...formData, refund7_15: e.target.value })}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-[13px] font-[600] text-[#1A181B] mb-2">Refund % (Less than 7 days)</label>
                                        <input
                                            type="number"
                                            placeholder="0"
                                            className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#F97316] text-[14px]"
                                            value={formData.refundLess7}
                                            onChange={e => setFormData({ ...formData, refundLess7: e.target.value })}
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Event Policies */}
                            <div>
                                <h3 className="text-[16px] font-[700] text-[#1A181B] mb-4">Event Policies</h3>
                                {/* Row 1: Alcohol Policy | Smoking Policy */}
                                <div className="grid grid-cols-2 gap-6 mb-4">
                                    <div>
                                        <label className="block text-[13px] font-[600] text-[#1A181B] mb-2">Alcohol Policy</label>
                                        <div className="relative">
                                            <button
                                                type="button"
                                                onClick={() => { setShowAlcoholDropdown(!showAlcoholDropdown); setShowSmokingDropdown(false) }}
                                                className={`flex items-center justify-between w-full px-4 py-2.5 rounded-xl border border-gray-200 bg-white text-[14px] outline-none transition-all ${showAlcoholDropdown ? 'ring-2 ring-orange-100 border-orange-300' : ''}`}
                                            >
                                                <span className={formData.alcoholPolicy ? 'text-[#1A181B]' : 'text-gray-400'}>
                                                    {formData.alcoholPolicy || 'Select'}
                                                </span>
                                                <ChevronDown className={`text-gray-400 transition-transform duration-200 ${showAlcoholDropdown ? 'rotate-180' : ''}`} size={18} />
                                            </button>
                                            {showAlcoholDropdown && (
                                                <div className="absolute top-full left-0 mt-2 w-full bg-white rounded-2xl shadow-[0px_4px_20px_0px_rgba(0,0,0,0.08)] border border-gray-100 z-30 animate-in fade-in zoom-in-95 duration-200 overflow-hidden">
                                                    {alcoholOptions.map((opt, index) => (
                                                        <div key={opt}>
                                                            <button
                                                                type="button"
                                                                onClick={() => { setFormData({ ...formData, alcoholPolicy: opt }); setShowAlcoholDropdown(false) }}
                                                                className={`w-full text-left px-5 py-2.5 text-sm font-medium font-manrope transition-colors ${formData.alcoholPolicy === opt ? 'bg-[#FE8301] !text-white' : 'text-gray-600 hover:bg-[#FE8301] hover:!text-white'}`}
                                                            >
                                                                {opt}
                                                            </button>
                                                            {index < alcoholOptions.length - 1 && <div className="h-[1px] bg-gray-100 mx-4 my-1" />}
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-[13px] font-[600] text-[#1A181B] mb-2">Smoking Policy</label>
                                        <div className="relative">
                                            <button
                                                type="button"
                                                onClick={() => { setShowSmokingDropdown(!showSmokingDropdown); setShowAlcoholDropdown(false) }}
                                                className={`flex items-center justify-between w-full px-4 py-2.5 rounded-xl border border-gray-200 bg-white text-[14px] outline-none transition-all ${showSmokingDropdown ? 'ring-2 ring-orange-100 border-orange-300' : ''}`}
                                            >
                                                <span className={formData.smokingPolicy ? 'text-[#1A181B]' : 'text-gray-400'}>
                                                    {formData.smokingPolicy || 'Select'}
                                                </span>
                                                <ChevronDown className={`text-gray-400 transition-transform duration-200 ${showSmokingDropdown ? 'rotate-180' : ''}`} size={18} />
                                            </button>
                                            {showSmokingDropdown && (
                                                <div className="absolute top-full left-0 mt-2 w-full bg-white rounded-2xl shadow-[0px_4px_20px_0px_rgba(0,0,0,0.08)] border border-gray-100 z-30 animate-in fade-in zoom-in-95 duration-200 overflow-hidden">
                                                    {smokingOptions.map((opt, index) => (
                                                        <div key={opt}>
                                                            <button
                                                                type="button"
                                                                onClick={() => { setFormData({ ...formData, smokingPolicy: opt }); setShowSmokingDropdown(false) }}
                                                                className={`w-full text-left px-5 py-2.5 text-sm font-medium font-manrope transition-colors ${formData.smokingPolicy === opt ? 'bg-[#FE8301] !text-white' : 'text-gray-600 hover:bg-[#FE8301] hover:!text-white'}`}
                                                            >
                                                                {opt}
                                                            </button>
                                                            {index < smokingOptions.length - 1 && <div className="h-[1px] bg-gray-100 mx-4 my-1" />}
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                                {/* Row 2: Music Cutoff Time | Damage Policy */}
                                <div className="grid grid-cols-2 gap-6">
                                    <div>
                                        <label className="block text-[13px] font-[600] text-[#1A181B] mb-2">Music Cutoff Time</label>
                                        <input
                                            type="time"
                                            placeholder="11:00 PM"
                                            className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#F97316] text-[14px]"
                                            value={formData.musicCutoffTime}
                                            onChange={e => setFormData({ ...formData, musicCutoffTime: e.target.value })}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-[13px] font-[600] text-[#1A181B] mb-2">Damage Policy</label>
                                        <input
                                            type="text"
                                            placeholder="Security deposite will cover damages"
                                            className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#F97316] text-[14px]"
                                            value={formData.damagePolicy}
                                            onChange={e => setFormData({ ...formData, damagePolicy: e.target.value })}
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Restrictions */}
                            <div>
                                <h3 className="text-[16px] font-[700] text-[#1A181B] mb-4">Restrictions</h3>
                                {/* Row 1: Noise | Age */}
                                <div className="grid grid-cols-2 gap-4 mb-3">
                                    <label className="flex items-center gap-3 p-3 border border-gray-200 rounded-xl cursor-pointer hover:bg-gray-50">
                                        <input type="checkbox" className="w-5 h-5" checked={formData.noiseRestrictions} onChange={e => setFormData({ ...formData, noiseRestrictions: e.target.checked })} />
                                        <span className="text-[14px]">Noise Restrictions Apply</span>
                                    </label>
                                    <label className="flex items-center gap-3 p-3 border border-gray-200 rounded-xl cursor-pointer hover:bg-gray-50">
                                        <input type="checkbox" className="w-5 h-5" checked={formData.ageRestrictions} onChange={e => setFormData({ ...formData, ageRestrictions: e.target.checked })} />
                                        <span className="text-[14px]">Age Restrictions Apply</span>
                                    </label>
                                </div>
                                {/* Row 2: Dress Code | Pet Friendly */}
                                <div className="grid grid-cols-2 gap-4 mb-3">
                                    <label className="flex items-center gap-3 p-3 border border-gray-200 rounded-xl cursor-pointer hover:bg-gray-50">
                                        <input type="checkbox" className="w-5 h-5" checked={formData.dressCode} onChange={e => setFormData({ ...formData, dressCode: e.target.checked })} />
                                        <span className="text-[14px]">Dress Code Required</span>
                                    </label>
                                    <label className="flex items-center gap-3 p-3 border border-gray-200 rounded-xl cursor-pointer hover:bg-gray-50">
                                        <input type="checkbox" className="w-5 h-5" checked={formData.petFriendly} onChange={e => setFormData({ ...formData, petFriendly: e.target.checked })} />
                                        <span className="text-[14px]">Pet Friendly</span>
                                    </label>
                                </div>
                                {/* Row 3: Outside Food Allowed (left only) */}
                                <div className="grid grid-cols-2 gap-4">
                                    <label className="flex items-center gap-3 p-3 border border-gray-200 rounded-xl cursor-pointer hover:bg-gray-50">
                                        <input type="checkbox" className="w-5 h-5" checked={formData.outsideFood} onChange={e => setFormData({ ...formData, outsideFood: e.target.checked })} />
                                        <span className="text-[14px]">Outside Food Allowed</span>
                                    </label>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Media & Contact Tab */}
                    {/* Media & Contact Tab */}
                    {activeTab === 'media' && (
                        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-300">

                            {/* Images */}
                            <div>
                                <h3 className="text-[16px] font-[700] text-[#1A181B] mb-4">Images</h3>
                                {/* Wrapping flex layout: upload box + thumbnails wrap naturally */}
                                <div className="flex flex-wrap gap-4">
                                    {/* Upload trigger */}
                                    <div className="w-[190px] h-[130px] border-2 border-dashed border-gray-300 rounded-xl flex flex-col items-center justify-center cursor-pointer hover:bg-gray-50 transition-colors">
                                        <Upload size={24} className="text-gray-400 mb-2" />
                                        <p className="text-[12px] text-gray-500 text-center px-3">Click to upload or drag and drop</p>
                                        <p className="text-[10px] text-gray-400 mt-1">PNG, JPG up to 5MB</p>
                                    </div>
                                    {/* Image thumbnails */}
                                    {[1, 2, 3, 4, 5, 6, 7].map(i => (
                                        <div key={i} className="w-[190px] h-[130px] bg-gray-200 rounded-xl relative group overflow-hidden">
                                            <img src="/placeholder-food.jpg" alt="Hall" className="w-full h-full object-cover" />
                                            <button className="absolute top-2 right-2 bg-white/90 p-0.5 rounded-full text-gray-600 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-white hover:text-red-500">
                                                <X size={14} />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                                {/* Virtual Tour Link */}
                                <div className="mt-4">
                                    <label className="block text-[13px] font-[600] text-[#1A181B] mb-2">Virtual Tour Link (Optional)</label>
                                    <input
                                        type="text"
                                        placeholder="https://virtualtour.com.."
                                        className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#F97316] text-[14px]"
                                        value={formData.virtualTourLink}
                                        onChange={e => setFormData({ ...formData, virtualTourLink: e.target.value })}
                                    />
                                </div>
                            </div>

                            {/* Special Features & Highlights */}
                            <div>
                                <h3 className="text-[16px] font-[700] text-[#1A181B] mb-4">Special Features & Highlights</h3>
                                {/* Special Features */}
                                <div className="mb-4">
                                    <label className="block text-[13px] font-[600] text-[#1A181B] mb-2">Special Features</label>
                                    <div className="flex gap-3 mb-2">
                                        <input
                                            type="text"
                                            placeholder="e.g. Crystal Chandelier, LED Dance Floor"
                                            className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#F97316] text-[14px]"
                                            value={currentSpecialFeature}
                                            onChange={e => setCurrentSpecialFeature(e.target.value)}
                                            onKeyDown={e => e.key === 'Enter' && handleAddTag('specialFeatures', currentSpecialFeature, setCurrentSpecialFeature)}
                                        />
                                        <button
                                            onClick={() => handleAddTag('specialFeatures', currentSpecialFeature, setCurrentSpecialFeature)}
                                            className="bg-[#F97316] text-white px-5 py-2.5 rounded-xl font-[600] flex items-center gap-2 hover:bg-[#EA580C] transition-colors text-[14px]"
                                        >
                                            <Plus size={18} /> Add
                                        </button>
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                        {formData.specialFeatures.map((tag, i) => (
                                            <span key={i} className="bg-[#FAE8FF] text-[#D946EF] px-3 py-1 rounded-full text-[12px] font-[600] flex items-center gap-2">
                                                {tag}
                                                <button onClick={() => handleRemoveTag('specialFeatures', i)} className="hover:text-red-500"><X size={12} /></button>
                                            </span>
                                        ))}
                                        {formData.specialFeatures.length === 0 && (
                                            <>
                                                <span className="bg-[#FAE8FF] text-[#D946EF] px-3 py-1 rounded-full text-[12px] font-[600] flex items-center gap-2">
                                                    Crystal Chandelier <button className="hover:text-red-500"><X size={12} /></button>
                                                </span>
                                                <span className="bg-[#FAE8FF] text-[#D946EF] px-3 py-1 rounded-full text-[12px] font-[600] flex items-center gap-2">
                                                    LED Floor <button className="hover:text-red-500"><X size={12} /></button>
                                                </span>
                                            </>
                                        )}
                                    </div>
                                </div>
                                {/* Best For */}
                                <div>
                                    <label className="block text-[13px] font-[600] text-[#1A181B] mb-2">Best For (Event Types)</label>
                                    <div className="flex gap-3 mb-2">
                                        <input
                                            type="text"
                                            placeholder="e.g. Wedding, Corporate event, Birthday Parties"
                                            className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#F97316] text-[14px]"
                                            value={currentBestFor}
                                            onChange={e => setCurrentBestFor(e.target.value)}
                                            onKeyDown={e => e.key === 'Enter' && handleAddTag('bestFor', currentBestFor, setCurrentBestFor)}
                                        />
                                        <button
                                            onClick={() => handleAddTag('bestFor', currentBestFor, setCurrentBestFor)}
                                            className="bg-[#F97316] text-white px-5 py-2.5 rounded-xl font-[600] flex items-center gap-2 hover:bg-[#EA580C] transition-colors text-[14px]"
                                        >
                                            <Plus size={18} /> Add
                                        </button>
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                        {formData.bestFor.map((tag, i) => (
                                            <span key={i} className="bg-[#E0F2FE] text-[#0284C7] px-3 py-1 rounded-full text-[12px] font-[600] flex items-center gap-2">
                                                {tag}
                                                <button onClick={() => handleRemoveTag('bestFor', i)} className="hover:text-red-500"><X size={12} /></button>
                                            </span>
                                        ))}
                                        {formData.bestFor.length === 0 && (
                                            <>
                                                <span className="bg-[#E0F2FE] text-[#0284C7] px-3 py-1 rounded-full text-[12px] font-[600] flex items-center gap-2">
                                                    Weddings <button className="hover:text-red-500"><X size={12} /></button>
                                                </span>
                                                <span className="bg-[#E0F2FE] text-[#0284C7] px-3 py-1 rounded-full text-[12px] font-[600] flex items-center gap-2">
                                                    Corporate Event <button className="hover:text-red-500"><X size={12} /></button>
                                                </span>
                                            </>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* Contact Information */}
                            <div>
                                <h3 className="text-[16px] font-[700] text-[#1A181B] mb-4">Contact Information</h3>
                                {/* Row 1: Contact Name | Contact Phone */}
                                <div className="grid grid-cols-2 gap-6 mb-4">
                                    <div>
                                        <label className="block text-[13px] font-[600] text-[#1A181B] mb-2">Contact Information</label>
                                        <input
                                            type="text"
                                            placeholder="John Manager"
                                            className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#F97316] text-[14px]"
                                            value={formData.contactInfo}
                                            onChange={e => setFormData({ ...formData, contactInfo: e.target.value })}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-[13px] font-[600] text-[#1A181B] mb-2">Contact Phone</label>
                                        <input
                                            type="tel"
                                            placeholder="9876543210"
                                            className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#F97316] text-[14px]"
                                            value={formData.contactPhone}
                                            onChange={e => setFormData({ ...formData, contactPhone: e.target.value })}
                                        />
                                    </div>
                                </div>
                                {/* Row 2: Contact Email | Alternate Phone */}
                                <div className="grid grid-cols-2 gap-6">
                                    <div>
                                        <label className="block text-[13px] font-[600] text-[#1A181B] mb-2">Contact Email</label>
                                        <input
                                            type="email"
                                            placeholder="abcd@mail.com"
                                            className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#F97316] text-[14px]"
                                            value={formData.contactEmail}
                                            onChange={e => setFormData({ ...formData, contactEmail: e.target.value })}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-[13px] font-[600] text-[#1A181B] mb-2">Alternate Phone (Optional)</label>
                                        <input
                                            type="tel"
                                            placeholder="9874561230"
                                            className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#F97316] text-[14px]"
                                            value={formData.alternatePhone}
                                            onChange={e => setFormData({ ...formData, alternatePhone: e.target.value })}
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div >



                {/* Footer */}
                < div className="p-6 border-t border-gray-100 flex justify-end gap-4 bg-white z-10" >
                    <button
                        onClick={onClose}
                        className="w-40 py-3.5 border border-[#F97316] text-[#F97316] rounded-xl font-[700] flex items-center justify-center gap-2 hover:bg-orange-50 transition-colors text-[16px]"
                    >
                        <X size={20} /> Cancel
                    </button>
                    <button
                        onClick={() => {
                            // Required-field gate. Validation is intentionally
                            // narrow — these four are the bare minimum to render
                            // the hall card on the customer side. The remaining
                            // tabs (amenities, policies, media) are all optional.
                            const errs = {}
                            if (!formData.name.trim())                                          errs.name = 'Hall name is required'
                            if (!formData.type)                                                 errs.type = 'Please select a hall type'
                            const price = Number(formData.basePrice)
                            if (formData.basePrice === '' || isNaN(price) || price < 0)         errs.basePrice = 'Base price must be zero or more'
                            const maxC = Number(formData.maxCapacity)
                            if (formData.maxCapacity === '' || isNaN(maxC) || maxC <= 0)        errs.maxCapacity = 'Maximum capacity is required'
                            setErrors(errs)
                            if (Object.keys(errs).length) {
                                // Most missing fields live in the Basic Info tab —
                                // switch back so the user can see the red borders.
                                if (errs.name || errs.type) setActiveTab('basic')
                                else if (errs.basePrice || errs.maxCapacity) setActiveTab('pricing')
                                const order = ['name', 'type', 'basePrice', 'maxCapacity']
                                const firstBad = order.find(k => errs[k])
                                if (firstBad) {
                                    setTimeout(() => {
                                        const el = document.getElementById(`hall-${firstBad}`)
                                        if (el) { try { el.focus() } catch { /* noop */ } el.scrollIntoView?.({ behavior: 'smooth', block: 'center' }) }
                                    }, 0)
                                }
                                return
                            }
                            if (onSave) {
                                const savedHall = {
                                    ...hallData,
                                    id: hallData ? hallData.id : Date.now(),
                                    name: formData.name,
                                    type: formData.type,
                                    description: formData.description,
                                    badges: hallData ? hallData.badges : [formData.type || 'New'].filter(Boolean),
                                    price: `₹${formData.basePrice}/event`,
                                    minPeople: formData.minCapacity,
                                    maxPeople: formData.maxCapacity,
                                    floorLevel: formData.floorLevel,
                                    buildingWing: formData.buildingWing,
                                    status: hallData && hallData.status !== undefined ? hallData.status : true,
                                    specialFeatures: formData.specialFeatures,
                                    bestFor: formData.bestFor,
                                }
                                onSave(savedHall)
                            } else {
                                onClose()
                            }
                        }}
                        className="w-40 py-3.5 bg-[#F97316] text-white rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-[#EA580C] transition-colors text-[16px] shadow-lg shadow-orange-100"
                    >
                        <Save size={20} /> {hallData ? 'Update hall' : 'Save hall'}
                    </button>
                </div >
            </div >
        </div >
    )
}

export default AddHallModal
