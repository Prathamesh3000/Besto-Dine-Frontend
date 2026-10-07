import React, { useState, useEffect, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Upload, Plus, Save, Clock, Trash2 } from 'lucide-react'
import { CloseDayModal, AddManualPointsModal, CreatePointsCampaignModal, ToggleCampaignModal } from './components/SettingsModals'
import ConfirmModal from './components/ConfirmModal'
import api, { settingsAPI, walletAPI, campaignAPI } from '../../utils/api'
import { resolveImageUrl } from '../../utils/image'
import { toast } from 'react-hot-toast'
import { SkeletonStatGrid, SkeletonRows } from '../../Components/Common/Skeleton'
import { useAuth } from '../../Context/AuthContext'
import LandingPageSettings from './components/LandingPageSettings'
import PrinterSettings from './components/PrinterSettings'
import ParkingSettingsCard from './components/ParkingSettingsCard'

// First human-readable message from a failed settings save. The API
// returns either { message, errors: { field: msg } } (mongoose validation)
// or { message, errors: [{ field, message }] } (request validation), or
// just { message } for other 400s.
const settingsSaveErrorMessage = (error) => {
    const data = error?.response?.data || {}
    const errs = data.errors
    let first = null
    if (Array.isArray(errs)) first = errs[0]?.message || errs[0]?.msg || null
    else if (errs && typeof errs === 'object') first = Object.values(errs)[0]
    if (first && typeof first === 'object') first = first.message || null
    return first || data.message || 'Failed to save settings'
}

const Settings = () => {
    // Branch-pinned admins shouldn't see the Business Licenses & Tax
    // section — those identifiers (legal name, FSSAI, GSTIN, PAN) are
    // tenant-wide registrations owned by the brand, not the branch.
    // Backend already strips these from sub-branch updates; this just
    // makes the UI honest about that.
    const { user, tenant } = useAuth()
    const isBranchPinned = !!user?.branch
    const isTenantOwner = !isBranchPinned
    const [searchParams, setSearchParams] = useSearchParams()
    const tabFromUrl = searchParams.get('tab') || 'General'
    const subTabFromUrl = searchParams.get('subtab') || 'Wallet & Loyalty'
    
    const [activeTab, setActiveTabState] = useState(tabFromUrl)

    const setActiveTab = (tab) => {
        setActiveTabState(tab)
        const params = { tab }
        if (tab === 'Wallet') params.subtab = walletSubTab
        setSearchParams(params)
    }
    // Landing Page is tenant-level (one public page per restaurant at
    // /<slug>); branch-pinned admins see it read-only (the backend
    // refuses their saves with INHERITED_FROM_MAIN).
    const tabs = ['General', 'Taxes & Charges', 'Delivery', 'Notification', 'Reservation', 'Wallet', 'Landing Page', 'Printers']

    // Loading state
    const [loading, setLoading] = useState(true)

    // Form State
    const [formData, setFormData] = useState({
        cafeName: 'The Coffee House',
        contactNumber: '',
        email: '',
        address: '',
        addressDetails: {
            line1: '',
            line2: '',
            city: '',
            state: '',
            pincode: '',
            country: 'India',
        },
        legal: {
            legalBusinessName: '',
            fssaiLicense: '',
            gstin: '',
            pan: '',
        },
        timezone: 'Asia/Kolkata',
        logoUrl: '',
        banners: []
    })

    // Operating Hours State
    const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
    const [operatingHours, setOperatingHours] = useState(
        days.map(day => ({
            day,
            start: '09:00',
            end: '23:00',
            isOpen: true
        }))
    )

    // Taxes & Charges State
    const [taxConfig, setTaxConfig] = useState({
        serviceCharge: { enabled: true, value: 5 },
        gst: { enabled: true, value: 10 }
    })

    const [additionalCharges, setAdditionalCharges] = useState([])

    // Home Delivery State — distance-slab based charging.
    const [deliveryConfig, setDeliveryConfig] = useState({
        enabled: false,
        slabs: [],
        minOrderValue: 0,
        // Restaurant coordinates — the customer's delivery distance is
        // measured from here (a branch's own lat/lng overrides it).
        originLat: '',
        originLng: '',
    })
    const [isLocatingOrigin, setIsLocatingOrigin] = useState(false)
    // Draft row for adding a new delivery range.
    const [newSlab, setNewSlab] = useState({ fromKm: '', toKm: '', charge: '' })

    // Notification State
    const [notifications, setNotifications] = useState({
        newOrder: true,
        orderReady: true,
        repeatQR: true,
        earlyCancellation: true,
        waiterCall: true,
        tableMerge: true
    })

    // Reservation State
    const [reservationConfig, setReservationConfig] = useState({
        enableLateArrival: true,
        gracePeriod: '10 min',
        deductionType: 'flat',
        priceDeduction: 0
    })

    // Landing Page tab — the saved `landingPage` section, handed to
    // LandingPageSettings as its initial value.
    const [landingPage, setLandingPage] = useState({})
    // Thermal printers for this branch (Settings.printers) — see
    // components/PrinterSettings.jsx; saved via PATCH /settings/printers.
    const [printers, setPrinters] = useState({})

    const [walletConfig, setWalletConfig] = useState({
        enableWallet: true,
        enableLoyalty: false,
        pointsPerRupee: 1,
        minBillToEarn: 100,
        maxRedeemPercent: 50,
        pointsToRupee: 0.1,
        pointsExpiryDays: 365,
        // Decision 1 (2026-10): refunds go back to the original payment
        // method by default (matches the backend default).
        refundMode: 'original',
        allowNegativeBalance: false,
        multiBranchMode: false,
        branchRefundMode: 'global',
        branchSpecificPoints: false,
        customDateFrom: '',
        customDateTo: ''
    })

    // Additional Charges form state
    const [newCharge, setNewCharge] = useState({ name: '', value: '', type: 'Flat' })
    // Per-field validation errors for the additional-charges row.
    const [chargeErrors, setChargeErrors] = useState({})

    // Wallet sub-tab state
    const [walletSubTab, setWalletSubTab] = useState(subTabFromUrl)

    // Wallet Reports state
    const [activeWalletReport, setActiveWalletReport] = useState('Wallet Balance Summary')
    const [walletReportFilter, setWalletReportFilter] = useState('Today')
    const [isWalletReportDropdownOpen, setIsWalletReportDropdownOpen] = useState(false)

    // Saving state
    const [isSaving, setIsSaving] = useState(false)

    // Ref for wallet report dropdown click-outside
    const walletReportDropdownRef = useRef(null)

    useEffect(() => {
        const handleClickOutside = (e) => {
            if (walletReportDropdownRef.current && !walletReportDropdownRef.current.contains(e.target)) {
                setIsWalletReportDropdownOpen(false)
            }
        }
        if (isWalletReportDropdownOpen) {
            document.addEventListener('mousedown', handleClickOutside)
        }
        return () => document.removeEventListener('mousedown', handleClickOutside)
    }, [isWalletReportDropdownOpen])

    // Fetch settings from API
    const fetchSettings = async () => {
        try {
            setLoading(true)
            const response = await settingsAPI.getSettings()
            const s = response.data

            if (s.general) {
                // Older Settings docs lack addressDetails / legal / timezone.
                // Merge with our defaults so controlled inputs never receive
                // undefined and flip to uncontrolled.
                setFormData(prev => ({
                    ...prev,
                    ...s.general,
                    addressDetails: { ...prev.addressDetails, ...(s.general.addressDetails || {}) },
                    legal:          { ...prev.legal,          ...(s.general.legal          || {}) },
                    timezone:       s.general.timezone || prev.timezone,
                }))
            }
            if (s.operatingHours && s.operatingHours.length > 0) setOperatingHours(s.operatingHours)
            if (s.taxes) {
                setTaxConfig({
                    serviceCharge: s.taxes.serviceCharge || { enabled: true, value: 5 },
                    gst: s.taxes.gst || { enabled: true, value: 10 }
                })
                setAdditionalCharges(s.taxes.additionalCharges || [])
            }
            if (s.delivery) {
                setDeliveryConfig({
                    enabled: !!s.delivery.enabled,
                    slabs: Array.isArray(s.delivery.slabs) ? s.delivery.slabs : [],
                    minOrderValue: s.delivery.minOrderValue || 0,
                    originLat: s.delivery.origin?.lat ?? '',
                    originLng: s.delivery.origin?.lng ?? '',
                })
            }
            if (s.notifications) setNotifications(s.notifications)
            if (s.reservation) setReservationConfig(s.reservation)
            if (s.wallet) setWalletConfig(prev => ({ ...prev, ...s.wallet }))
            setLandingPage(s.landingPage || {})
            setPrinters(s.printers || {})
        } catch (error) {
            console.error('Settings fetch error:', error)
        } finally {
            setLoading(false)
        }
    }

    // Validation helpers
    const validateTaxConfig = () => {
        const sc = parseFloat(taxConfig.serviceCharge.value)
        const gst = parseFloat(taxConfig.gst.value)
        if (isNaN(sc) || sc < 0 || sc > 100) {
            toast.error('Service charge must be between 0 and 100%')
            return false
        }
        if (isNaN(gst) || gst < 0 || gst > 100) {
            toast.error('GST must be between 0 and 100%')
            return false
        }
        return true
    }

    const validateOperatingHours = () => {
        for (const h of operatingHours) {
            if (!h.isOpen) continue
            if (h.start && h.end) {
                const [sH, sM] = h.start.split(':').map(Number)
                const [eH, eM] = h.end.split(':').map(Number)
                if (sH * 60 + sM >= eH * 60 + eM) {
                    toast.error(`${h.day}: closing time must be after opening time`)
                    return false
                }
            }
        }
        return true
    }

    const validateWalletConfig = () => {
        if (walletConfig.pointsPerRupee < 0) { toast.error('Points per rupee cannot be negative'); return false }
        if (walletConfig.minBillToEarn < 0) { toast.error('Minimum bill cannot be negative'); return false }
        if (walletConfig.maxRedeemPercent < 0 || walletConfig.maxRedeemPercent > 100) { toast.error('Max redeem must be 0-100%'); return false }
        if (walletConfig.pointsToRupee < 0) { toast.error('Points to rupee cannot be negative'); return false }
        if (walletConfig.pointsExpiryDays < 0) { toast.error('Expiry days cannot be negative'); return false }
        if (walletConfig.customDateFrom && walletConfig.customDateTo && walletConfig.customDateFrom > walletConfig.customDateTo) {
            toast.error('Custom date range: start date must be before end date'); return false
        }
        return true
    }

    const saveSettings = async (sectionData) => {
        setIsSaving(true)
        const loadToast = toast.loading('Saving changes...')
        try {
            const response = await settingsAPI.updateSettings(sectionData)
            if (response.data) {
                toast.success('Settings updated successfully', { id: loadToast })
                fetchSettings()
            } else {
                toast.dismiss(loadToast)
            }
        } catch (error) {
            // Replace the loading toast with the failure message.
            if (error.response?.status !== 400) console.error('Settings save error:', error)
            toast.error(settingsSaveErrorMessage(error), { id: loadToast })
        } finally {
            setIsSaving(false)
        }
    }

    const saveSectionSettings = async (section, data) => {
        setIsSaving(true)
        const loadToast = toast.loading('Saving changes...')
        try {
            const response = await settingsAPI.updateSection(section, data)
            if (response.data) {
                toast.success('Settings updated successfully', { id: loadToast })
                fetchSettings()
            } else {
                toast.dismiss(loadToast)
            }
        } catch (error) {
            // Replace the loading toast with the failure message.
            if (error.response?.status !== 400) console.error('Settings save error:', error)
            toast.error(settingsSaveErrorMessage(error), { id: loadToast })
        } finally {
            setIsSaving(false)
        }
    }

    useEffect(() => {
        fetchSettings()
    }, [])

    // Fetch bonus data when switching to Bonus Points sub-tab
    useEffect(() => {
        if (activeTab === 'Wallet' && walletSubTab === 'Bonus Points') {
            fetchBonusData()
        }
    }, [activeTab, walletSubTab])

    // Fetch report data when switching to Wallet Reports or changing report/filter
    useEffect(() => {
        if (activeTab === 'Wallet' && walletSubTab === 'Wallet Reports') {
            fetchWalletReport()
        }
    }, [activeTab, walletSubTab, activeWalletReport, walletReportFilter])

    // Bonus Points State
    const [campaigns, setCampaigns] = useState([])
    const [campaignStats, setCampaignStats] = useState({ activeCampaigns: 0, totalPointsIssued: 0, totalCustomersImpacted: 0 })
    const [manualActions, setManualActions] = useState([])
    const [bonusLoading, setBonusLoading] = useState(false)

    const [isAddManualPointsOpen, setIsAddManualPointsOpen] = useState(false)
    const [isCreateCampaignOpen, setIsCreateCampaignOpen] = useState(false)
    const [campaignToToggle, setCampaignToToggle] = useState(null)

    // Wallet Reports State
    const [reportData, setReportData] = useState(null)
    const [reportLoading, setReportLoading] = useState(false)

    // Fetch campaigns and manual history
    const fetchBonusData = async () => {
        try {
            setBonusLoading(true)
            const [campaignsRes, statsRes, historyRes] = await Promise.all([
                campaignAPI.getAll(),
                campaignAPI.getStats(),
                walletAPI.getManualHistory({ limit: 20 })
            ])
            if (campaignsRes.data?.campaigns) setCampaigns(campaignsRes.data.campaigns)
            if (statsRes.data?.stats) setCampaignStats(statsRes.data.stats)
            if (historyRes.data?.actions) setManualActions(historyRes.data.actions)
        } catch (error) {
            console.error('Bonus data fetch error:', error)
        } finally {
            setBonusLoading(false)
        }
    }

    // Fetch wallet report data
    const fetchWalletReport = async (reportName, filterVal, customFrom, customTo) => {
        try {
            setReportLoading(true)
            const res = await walletAPI.getReports({
                report: reportName || activeWalletReport,
                filter: filterVal || walletReportFilter,
                customFrom,
                customTo
            })
            if (res.data?.data) setReportData(res.data.data)
        } catch (error) {
            console.error('Report fetch error:', error)
            setReportData(null)
        } finally {
            setReportLoading(false)
        }
    }

    // Modal State
    const [showSaveModal, setShowSaveModal] = useState(false)
    const [closeDayModal, setCloseDayModal] = useState({ isOpen: false, day: null })

    const handleInputChange = (e) => {
        const { name, value } = e.target
        setFormData(prev => ({ ...prev, [name]: value }))
    }

    const handleAddressChange = (field, value) => {
        setFormData(prev => ({
            ...prev,
            addressDetails: { ...prev.addressDetails, [field]: value },
        }))
    }

    const handleLegalChange = (field, value) => {
        const cleaned = (field === 'gstin' || field === 'pan')
            ? value.toUpperCase()
            : value
        setFormData(prev => ({
            ...prev,
            legal: { ...prev.legal, [field]: cleaned },
        }))
    }

    const handleTimeChange = (day, type, value) => {
        setOperatingHours(prev => prev.map(h => 
            h.day === day ? { ...h, [type]: value } : h
        ))
    }

    const toggleDay = (dayName) => {
        const target = operatingHours.find(h => h.day === dayName)
        if (target?.isOpen) {
            setCloseDayModal({ isOpen: true, day: dayName })
        } else {
            setOperatingHours(prev => prev.map(h => 
                h.day === dayName ? { ...h, isOpen: true } : h
            ))
        }
    }

    const handleConfirmCloseDay = (note) => {
        const dayName = closeDayModal.day
        if (dayName) {
            setOperatingHours(prev => prev.map(h => 
                h.day === dayName ? { ...h, isOpen: false } : h
            ))
        }
        setCloseDayModal({ isOpen: false, day: null })
    }

    // Tax Handlers
    const handleTaxToggle = (field) => {
        setTaxConfig(prev => ({
            ...prev,
            [field]: { ...prev[field], enabled: !prev[field].enabled }
        }))
    }

    const handleTaxValueChange = (field, value) => {
        setTaxConfig(prev => ({
            ...prev,
            [field]: { ...prev[field], value }
        }))
    }

    // Additional Charges Handlers
    const handleAddCharge = () => {
        // Build all errors at once so the user sees the full picture
        // instead of one-toast-at-a-time. Each error renders inline
        // below the relevant input.
        const errs = {}
        if (!newCharge.name?.trim())                  errs.name = 'Charge name is required'
        if (!newCharge.value)                         errs.value = 'Enter an amount'
        else if (parseFloat(newCharge.value) < 0)     errs.value = 'Amount cannot be negative'
        if (!newCharge.type)                          errs.type = 'Select a type'
        setChargeErrors(errs)
        if (Object.keys(errs).length) {
            const firstBad = ['name', 'value', 'type'].find(k => errs[k])
            if (firstBad) {
                setTimeout(() => {
                    const el = document.getElementById(`charge-${firstBad}`)
                    if (el) { try { el.focus() } catch { /* noop */ } }
                }, 0)
            }
            return
        }
        setAdditionalCharges(prev => [
            ...prev,
            { ...newCharge, value: parseFloat(newCharge.value), id: Date.now(), enabled: true }
        ])
        setNewCharge({ name: '', value: '', type: 'Flat' })
        setChargeErrors({})
    }

    const getChargeId = (charge) => charge._id || charge.id

    const handleChargeToggle = (id) => {
        setAdditionalCharges(prev => prev.map(charge =>
            getChargeId(charge) === id ? { ...charge, enabled: !charge.enabled } : charge
        ))
    }

    const handleDeleteCharge = (id) => {
        setAdditionalCharges(prev => prev.filter(charge => getChargeId(charge) !== id))
    }

    // ── Home Delivery handlers ───────────────────────────────────────
    const handleAddSlab = () => {
        const fromKm = parseFloat(newSlab.fromKm)
        const toKm = parseFloat(newSlab.toKm)
        const charge = parseFloat(newSlab.charge)
        if ([fromKm, toKm, charge].some(v => isNaN(v))) {
            toast.error('Enter a valid from-km, to-km and charge')
            return
        }
        if (fromKm < 0 || toKm < 0 || charge < 0) {
            toast.error('Range values and charge cannot be negative')
            return
        }
        if (fromKm >= toKm) {
            toast.error('From-km must be less than to-km')
            return
        }
        // Reject overlap with an existing range.
        const overlaps = (deliveryConfig.slabs || []).some(s =>
            fromKm < Number(s.toKm) && toKm > Number(s.fromKm)
        )
        if (overlaps) {
            toast.error('This range overlaps an existing one')
            return
        }
        const next = [...(deliveryConfig.slabs || []), { fromKm, toKm, charge }]
            .sort((a, b) => a.fromKm - b.fromKm)
        setDeliveryConfig(prev => ({ ...prev, slabs: next }))
        setNewSlab({ fromKm: '', toKm: '', charge: '' })
    }

    const handleDeleteSlab = (idx) => {
        setDeliveryConfig(prev => ({
            ...prev,
            slabs: (prev.slabs || []).filter((_, i) => i !== idx),
        }))
    }

    // Restaurant coordinates for the delivery-distance calculation.
    // Both blank → null (customers then pick their distance manually).
    const buildDeliveryOrigin = () => {
        const latRaw = String(deliveryConfig.originLat ?? '').trim()
        const lngRaw = String(deliveryConfig.originLng ?? '').trim()
        if (!latRaw && !lngRaw) return { lat: null, lng: null }
        return { lat: Number(latRaw), lng: Number(lngRaw) }
    }

    const handleUseCurrentLocationForOrigin = () => {
        if (!navigator.geolocation) {
            toast.error('Location is not supported in this browser')
            return
        }
        setIsLocatingOrigin(true)
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                setDeliveryConfig(prev => ({
                    ...prev,
                    originLat: Number(pos.coords.latitude.toFixed(6)),
                    originLng: Number(pos.coords.longitude.toFixed(6)),
                }))
                setIsLocatingOrigin(false)
                toast.success('Location captured — remember to save')
            },
            () => {
                setIsLocatingOrigin(false)
                toast.error('Could not get your location. Enter latitude/longitude manually.')
            },
            { enableHighAccuracy: true, timeout: 15000 }
        )
    }

    const saveDeliveryConfig = () => {
        if (deliveryConfig.enabled && (deliveryConfig.slabs || []).length === 0) {
            toast.error('Add at least one delivery range before enabling delivery')
            return
        }
        const origin = buildDeliveryOrigin()
        if (origin.lat !== null && (!Number.isFinite(origin.lat) || !Number.isFinite(origin.lng)
            || origin.lat < -90 || origin.lat > 90 || origin.lng < -180 || origin.lng > 180)) {
            toast.error('Enter a valid latitude (-90 to 90) and longitude (-180 to 180), or leave both blank')
            return
        }
        saveSectionSettings('delivery', {
            enabled: deliveryConfig.enabled,
            slabs: (deliveryConfig.slabs || []).map(s => ({
                fromKm: Number(s.fromKm),
                toKm: Number(s.toKm),
                charge: Number(s.charge),
            })),
            minOrderValue: Number(deliveryConfig.minOrderValue) || 0,
            origin,
        })
    }

    // Notification Handler
    const handleNotificationToggle = (field) => {
        setNotifications(prev => ({ ...prev, [field]: !prev[field] }))
    }

    // Reservation Handler
    const handleReservationChange = (field, value) => {
        setReservationConfig(prev => ({ ...prev, [field]: value }))
    }

    // Wallet Handler
    const handleWalletChange = (field, value) => {
        setWalletConfig(prev => ({ ...prev, [field]: value }))
    }

    if (loading) {
        // Skeleton paints the page shell (tab strip + form rows) instantly
        // so the admin sees structure within ~50ms, instead of staring at a
        // centred spinner. The form is large + form-state-heavy, so a full
        // React Query migration is deferred — the skeleton alone takes
        // perceived load from "blank-then-pop" to "instant shell + content".
        return (
            <div className="space-y-6 py-6 px-4 md:px-6">
                <SkeletonStatGrid count={4} />
                <SkeletonRows count={8} />
            </div>
        )
    }

    return (
        <div className="h-full flex flex-col px-4 md:px-6 py-5 overflow-y-auto">
            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
                <div>
                    <h1 className="font-manrope font-[700] text-[20px] leading-[26px] text-[#1A181B] mb-1">Settings</h1>
                    <p className="font-manrope font-[600] text-[16px] leading-[22px] text-[#645E66]">Manage your cafe/Hotel configuration and preferences</p>
                </div>
                {/* The Landing Page tab saves on its own (PATCH /settings/landingPage);
                    "Save All" doesn't include it, so hide it there. */}
                {activeTab !== 'Landing Page' && activeTab !== 'Printers' && (
                <button
                    disabled={isSaving}
                    onClick={() => {
                        if (!validateTaxConfig() || !validateOperatingHours() || !validateWalletConfig()) return
                        const { customDateFrom, customDateTo, ...walletData } = walletConfig
                        saveSettings({
                            general: formData,
                            operatingHours,
                            taxes: { ...taxConfig, additionalCharges },
                            delivery: {
                                enabled: deliveryConfig.enabled,
                                slabs: (deliveryConfig.slabs || []).map(s => ({ fromKm: Number(s.fromKm), toKm: Number(s.toKm), charge: Number(s.charge) })),
                                minOrderValue: Number(deliveryConfig.minOrderValue) || 0,
                                origin: buildDeliveryOrigin(),
                            },
                            notifications,
                            reservation: reservationConfig,
                            wallet: walletData
                        })
                    }}
                    className="w-full md:w-auto flex items-center justify-center gap-2 px-5 py-2.5 bg-[#FE8301] text-white rounded-[10px] text-[14px] font-[600] hover:bg-orange-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    <Save size={18} strokeWidth={2.5} />
                    {isSaving ? 'Saving...' : 'Save All Changes'}
                </button>
                )}
            </div>

            {/* Tabs */}
            <div className="flex gap-3 mb-6 overflow-x-auto pb-2 md:pb-0 no-scrollbar shrink-0">
                {tabs.map((tab) => (
                    <button
                        key={tab}
                        onClick={() => setActiveTab(tab)}
                        className={`px-5 py-2 rounded-full text-[14px] font-[600] whitespace-nowrap transition-all ${activeTab === tab
                            ? 'border border-[#702083] text-[#702083] bg-white'
                            : 'bg-white text-[#4B5563] border border-gray-200 hover:bg-gray-50'
                            }`}
                    >
                        {tab}
                    </button>
                ))}
            </div>

            {/* Content - General Tab */}
            {activeTab === 'General' && (
                <div className="space-y-6 pb-10">
                    {/* Cafe/Hotel Information Section */}
                    <div>
                        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-4">
                            <h2 className="text-[16px] font-[600] text-[#1A181B]">Cafe/ Hotel Information</h2>
                            <button
                                disabled={isSaving}
                                onClick={() => saveSectionSettings('general', formData)}
                                className="w-full md:w-auto flex items-center justify-center gap-2 px-5 py-2.5 bg-[#FE8301] text-white rounded-[10px] text-[14px] font-[600] hover:bg-orange-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                <Save size={18} strokeWidth={2.5} />
                                {isSaving ? 'Saving...' : 'Save General Info'}
                            </button>
                        </div>

                        <div className="flex flex-col lg:flex-row gap-6 lg:gap-8">
                            {/* Form Inputs */}
                            <div className="flex-1 space-y-5">
                                <div>
                                    <label className="block text-[13px] font-[500] text-[#374151] mb-1.5">Cafe Name</label>
                                    <input
                                        type="text"
                                        name="cafeName"
                                        value={formData.cafeName}
                                        onChange={handleInputChange}
                                        placeholder="The Coffee House"
                                        className="w-full px-4 py-2.5 bg-white border border-gray-200 rounded-[10px] text-[14px] text-[#1A181B] focus:outline-none focus:border-[#FE8301] shadow-sm"
                                    />
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                                    <div>
                                        <label className="block text-[13px] font-[500] text-[#374151] mb-1.5">Contact number</label>
                                        <input
                                            type="text"
                                            name="contactNumber"
                                            value={formData.contactNumber}
                                            onChange={handleInputChange}
                                            placeholder="+91 98765 43210"
                                            className="w-full px-4 py-2.5 bg-white border border-gray-200 rounded-[10px] text-[14px] text-[#1A181B] focus:outline-none focus:border-[#FE8301] shadow-sm"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-[13px] font-[500] text-[#374151] mb-1.5">Email</label>
                                        <input
                                            type="email"
                                            name="email"
                                            value={formData.email}
                                            onChange={handleInputChange}
                                            placeholder="admin@thecafe.com"
                                            className="w-full px-4 py-2.5 bg-white border border-gray-200 rounded-[10px] text-[14px] text-[#1A181B] focus:outline-none focus:border-[#FE8301] shadow-sm"
                                        />
                                    </div>
                                </div>
                                <div className="space-y-4">
                                    <div>
                                        <label className="block text-[13px] font-[500] text-[#374151] mb-1.5">
                                            Address line 1 <span className="text-rose-500">*</span>
                                        </label>
                                        <input
                                            type="text"
                                            value={formData.addressDetails?.line1 || ''}
                                            onChange={(e) => handleAddressChange('line1', e.target.value)}
                                            placeholder="Shop / building / street"
                                            className="w-full px-4 py-2.5 bg-white border border-gray-200 rounded-[10px] text-[14px] text-[#1A181B] focus:outline-none focus:border-[#FE8301] shadow-sm"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-[13px] font-[500] text-[#374151] mb-1.5">Address line 2</label>
                                        <input
                                            type="text"
                                            value={formData.addressDetails?.line2 || ''}
                                            onChange={(e) => handleAddressChange('line2', e.target.value)}
                                            placeholder="Landmark, floor, area (optional)"
                                            className="w-full px-4 py-2.5 bg-white border border-gray-200 rounded-[10px] text-[14px] text-[#1A181B] focus:outline-none focus:border-[#FE8301] shadow-sm"
                                        />
                                    </div>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                                        <div>
                                            <label className="block text-[13px] font-[500] text-[#374151] mb-1.5">
                                                City <span className="text-rose-500">*</span>
                                            </label>
                                            <input
                                                type="text"
                                                value={formData.addressDetails?.city || ''}
                                                onChange={(e) => handleAddressChange('city', e.target.value)}
                                                placeholder="Mumbai"
                                                className="w-full px-4 py-2.5 bg-white border border-gray-200 rounded-[10px] text-[14px] text-[#1A181B] focus:outline-none focus:border-[#FE8301] shadow-sm"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-[13px] font-[500] text-[#374151] mb-1.5">
                                                State <span className="text-rose-500">*</span>
                                            </label>
                                            <input
                                                type="text"
                                                value={formData.addressDetails?.state || ''}
                                                onChange={(e) => handleAddressChange('state', e.target.value)}
                                                placeholder="Maharashtra"
                                                className="w-full px-4 py-2.5 bg-white border border-gray-200 rounded-[10px] text-[14px] text-[#1A181B] focus:outline-none focus:border-[#FE8301] shadow-sm"
                                            />
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                                        <div>
                                            <label className="block text-[13px] font-[500] text-[#374151] mb-1.5">
                                                Pincode <span className="text-rose-500">*</span>
                                            </label>
                                            <input
                                                type="text"
                                                value={formData.addressDetails?.pincode || ''}
                                                onChange={(e) => handleAddressChange('pincode', e.target.value.replace(/\D/g, '').slice(0, 6))}
                                                placeholder="400050"
                                                inputMode="numeric"
                                                maxLength={6}
                                                className="w-full px-4 py-2.5 bg-white border border-gray-200 rounded-[10px] text-[14px] text-[#1A181B] focus:outline-none focus:border-[#FE8301] shadow-sm"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-[13px] font-[500] text-[#374151] mb-1.5">Country</label>
                                            <input
                                                type="text"
                                                value={formData.addressDetails?.country || ''}
                                                onChange={(e) => handleAddressChange('country', e.target.value)}
                                                placeholder="India"
                                                className="w-full px-4 py-2.5 bg-white border border-gray-200 rounded-[10px] text-[14px] text-[#1A181B] focus:outline-none focus:border-[#FE8301] shadow-sm"
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Upload Logo w-[300px] or something */}
                            <div className="w-full lg:w-[320px]">
                                <label className="block text-[13px] font-[500] text-[#374151] mb-1.5">Upload Logo</label>
                                <div 
                                    className="h-[210px] lg:h-[268px] bg-white border border-dashed border-gray-200 rounded-[10px] flex flex-col items-center justify-center cursor-pointer hover:border-[#FE8301] transition-colors shadow-sm overflow-hidden"
                                    onClick={() => document.getElementById('logo-upload').click()}
                                >
                                    {formData.logoUrl ? (
                                        <img src={resolveImageUrl(formData.logoUrl) || formData.logoUrl} alt="Logo" className="w-full h-full object-contain" />
                                    ) : (
                                        <>
                                            <Upload size={24} className="text-[#6B7280] mb-3" strokeWidth={1.5} />
                                            <p className="text-[12px] text-[#374151] text-center px-4 leading-relaxed">
                                                Click to upload or drag and drop<br />
                                                <span className="text-[11px] text-[#6B7280]">PNG, JPG up to 5MB</span>
                                            </p>
                                        </>
                                    )}
                                    <input 
                                        type="file" 
                                        id="logo-upload" 
                                        className="hidden" 
                                        accept="image/*"
                                        onChange={async (e) => {
                                            const file = e.target.files[0]
                                            if (!file) return
                                            const fd = new FormData()
                                            fd.append('image', file)
                                            try {
                                                const res = await api.post('/upload', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
                                                // Store the backend-returned RELATIVE path (/uploads/...).
                                                // The earlier `.replace('/api', '')` only stripped
                                                // "/api" from VITE_API_URL (leaving "/v1"), producing
                                                // a 404 image URL that never previewed and silently
                                                // persisted a broken string to the DB — every consumer
                                                // (header, receipt, landing) then rendered a broken img.
                                                // resolveImageUrl is the single source of truth for
                                                // turning /uploads/... into a full URL at render time.
                                                setFormData(prev => ({ ...prev, logoUrl: res.data.url }))
                                                toast.success('Logo uploaded!')
                                            } catch (err) { toast.error('Upload failed') }
                                        }}
                                    />
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Business Licenses & Tax Section — tenant-owner only.
                        Branch admins don't get an entry point because legal
                        registrations (legal name, FSSAI, GSTIN, PAN) are
                        owned by the brand/tenant, not the branch. The
                        backend already rejects sub-branch updates to these
                        keys; this hides the surface so the UI matches. */}
                    {isTenantOwner && (
                    <div>
                        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-4">
                            <div>
                                <h2 className="text-[16px] font-[600] text-[#1A181B]">Business licenses & tax</h2>
                                <p className="text-[12px] text-[#6B7280] mt-1">
                                    Appears on invoices &amp; customer receipts. FSSAI is mandatory for food businesses in India.
                                </p>
                            </div>
                        </div>

                        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 md:p-6 space-y-5">
                            <div>
                                <label className="block text-[13px] font-[500] text-[#374151] mb-1.5">
                                    Legal business name
                                </label>
                                <input
                                    type="text"
                                    value={formData.legal?.legalBusinessName || ''}
                                    onChange={(e) => handleLegalChange('legalBusinessName', e.target.value)}
                                    placeholder="e.g. The Coffee House Hospitality Pvt Ltd"
                                    className="w-full px-4 py-2.5 bg-white border border-gray-200 rounded-[10px] text-[14px] text-[#1A181B] focus:outline-none focus:border-[#FE8301] shadow-sm"
                                />
                                <p className="text-[11px] text-[#6B7280] mt-1">
                                    Shown on invoices. May differ from your brand name above.
                                </p>
                            </div>

                            <div>
                                <label className="block text-[13px] font-[500] text-[#374151] mb-1.5">
                                    FSSAI license
                                </label>
                                <input
                                    type="text"
                                    value={formData.legal?.fssaiLicense || ''}
                                    onChange={(e) => handleLegalChange('fssaiLicense', e.target.value.replace(/\D/g, '').slice(0, 14))}
                                    placeholder="14-digit number"
                                    inputMode="numeric"
                                    maxLength={14}
                                    className="w-full px-4 py-2.5 bg-white border border-gray-200 rounded-[10px] text-[14px] text-[#1A181B] focus:outline-none focus:border-[#FE8301] shadow-sm font-mono"
                                />
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                                <div>
                                    <label className="block text-[13px] font-[500] text-[#374151] mb-1.5">
                                        GSTIN
                                    </label>
                                    <input
                                        type="text"
                                        value={formData.legal?.gstin || ''}
                                        onChange={(e) => handleLegalChange('gstin', e.target.value.slice(0, 15))}
                                        placeholder="27AAAAA0000A1Z5"
                                        maxLength={15}
                                        className="w-full px-4 py-2.5 bg-white border border-gray-200 rounded-[10px] text-[14px] text-[#1A181B] focus:outline-none focus:border-[#FE8301] shadow-sm font-mono uppercase"
                                    />
                                    <p className="text-[11px] text-[#6B7280] mt-1">
                                        Required if you issue GST invoices.
                                    </p>
                                </div>
                                <div>
                                    <label className="block text-[13px] font-[500] text-[#374151] mb-1.5">
                                        PAN
                                    </label>
                                    <input
                                        type="text"
                                        value={formData.legal?.pan || ''}
                                        onChange={(e) => handleLegalChange('pan', e.target.value.slice(0, 10))}
                                        placeholder="AAAAA0000A"
                                        maxLength={10}
                                        className="w-full px-4 py-2.5 bg-white border border-gray-200 rounded-[10px] text-[14px] text-[#1A181B] focus:outline-none focus:border-[#FE8301] shadow-sm font-mono uppercase"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-[13px] font-[500] text-[#374151] mb-1.5">
                                    Timezone
                                </label>
                                <input
                                    type="text"
                                    value={formData.timezone || ''}
                                    onChange={(e) => setFormData(prev => ({ ...prev, timezone: e.target.value }))}
                                    placeholder="Asia/Kolkata"
                                    className="w-full px-4 py-2.5 bg-white border border-gray-200 rounded-[10px] text-[14px] text-[#1A181B] focus:outline-none focus:border-[#FE8301] shadow-sm font-mono"
                                />
                                <p className="text-[11px] text-[#6B7280] mt-1">
                                    IANA format — used for daily reports and order cutoffs. Default is Asia/Kolkata.
                                </p>
                            </div>

                            <div className="flex justify-end pt-1">
                                <button
                                    disabled={isSaving}
                                    onClick={() => saveSectionSettings('general', formData)}
                                    className="flex items-center gap-2 px-5 py-2.5 bg-[#FE8301] text-white rounded-[10px] text-[14px] font-[600] hover:bg-orange-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    <Save size={18} strokeWidth={2.5} />
                                    {isSaving ? 'Saving...' : 'Save licenses'}
                                </button>
                            </div>
                        </div>
                    </div>
                    )}

                    {/* Operating Hours Section */}
                    <div>
                        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                            <div className="p-4 md:px-6 pt-5 pb-2 flex justify-between items-center">
                                <h2 className="text-[16px] font-[600] text-[#1A181B]">Operating Hours</h2>
                                <button
                                    disabled={isSaving}
                                    onClick={() => {
                                        if (!validateOperatingHours()) return
                                        saveSectionSettings('operatingHours', operatingHours)
                                    }}
                                    className="flex items-center gap-2 px-4 py-1.5 bg-[#FE8301] text-white rounded-[8px] text-[12px] font-[600] disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {isSaving ? 'Saving...' : 'Save Hours'}
                                </button>
                            </div>
                            {operatingHours.map((h, index) => (
                                <div
                                    key={h.day}
                                    className={`flex flex-col md:flex-row md:items-center justify-between p-4 md:px-6 gap-4 md:gap-0 ${index !== operatingHours.length - 1 ? 'border-b border-gray-100' : ''
                                        }`}
                                >
                                    <div className="flex items-center gap-6 flex-1">
                                        <span className="w-28 text-[14px] font-[500] text-[#1A181B]">{h.day}</span>
                                        <div className="flex items-center gap-3 w-[280px]">
                                            <div className="relative flex-1">
                                                <input
                                                    type="time"
                                                    value={h.start}
                                                    onChange={(e) => handleTimeChange(h.day, 'start', e.target.value)}
                                                    className="w-full px-4 py-[9px] bg-white border border-gray-200 rounded-[8px] text-[13px] font-[500] text-[#1A181B] focus:outline-none focus:border-[#FE8301] disabled:opacity-50 disabled:bg-gray-50"
                                                    disabled={!h.isOpen}
                                                />
                                            </div>
                                            <span className="text-[13px] text-gray-500 font-[400]">to</span>
                                            <div className="relative flex-1">
                                                <input
                                                    type="time"
                                                    value={h.end}
                                                    onChange={(e) => handleTimeChange(h.day, 'end', e.target.value)}
                                                    className="w-full px-4 py-[9px] bg-white border border-gray-200 rounded-[8px] text-[13px] font-[500] text-[#1A181B] focus:outline-none focus:border-[#FE8301] disabled:opacity-50 disabled:bg-gray-50"
                                                    disabled={!h.isOpen}
                                                />
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-3 justify-end shrink-0 mt-2 md:mt-0">
                                        <button
                                            onClick={() => toggleDay(h.day)}
                                            className={`relative w-[44px] h-[24px] rounded-full transition-colors ${h.isOpen ? 'bg-[#34C759]' : 'bg-[#E5E5EA]'}`}
                                        >
                                            <div className={`absolute top-[2px] left-[2px] bg-white w-[20px] h-[20px] rounded-full transition-transform shadow-sm ${h.isOpen ? 'translate-x-[20px]' : ''}`} />
                                        </button>
                                        <span className={`text-[12px] font-[600] w-12 text-right ${h.isOpen ? 'text-[#1A181B]' : 'text-[#1A181B]'}`}>
                                            {h.isOpen ? 'Open' : 'Closed'}
                                        </span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Banner Section */}
                    <div>
                        <h2 className="text-[16px] font-[600] text-[#1A181B] mb-1">Banner Section</h2>
                        <p className="text-[14px] font-[500] text-[#1A181B] mb-4">{formData.banners?.length || 0} banner{(formData.banners?.length || 0) !== 1 ? 's' : ''}</p>

                        <div className="flex flex-wrap items-center gap-6">
                            {/* Uploaded Banners */}
                            {(formData.banners || []).map((bannerUrl, idx) => (
                                <div key={idx} className="w-[340px] h-[191px] rounded-[16px] overflow-hidden relative group shrink-0 border border-gray-200 shadow-sm bg-black">
                                    <img
                                        src={bannerUrl}
                                        alt={`Banner ${idx + 1}`}
                                        className="w-full h-full object-cover"
                                    />
                                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                                        <button
                                            onClick={() => setFormData(prev => ({ ...prev, banners: prev.banners.filter((_, i) => i !== idx) }))}
                                            className="p-2 bg-white rounded-lg text-red-500 shadow-sm"
                                        >
                                            <Trash2 size={18} />
                                        </button>
                                    </div>
                                </div>
                            ))}

                            {/* Add Banner Button */}
                            <div
                                className="w-[340px] h-[191px] bg-white border border-dashed border-gray-200 rounded-[16px] flex flex-col items-center justify-center cursor-pointer hover:border-[#FE8301] transition-colors shrink-0 shadow-sm"
                                onClick={() => document.getElementById('banner-upload').click()}
                            >
                                <Upload size={22} className="text-[#6B7280] mb-3" strokeWidth={1.5} />
                                <p className="text-[12px] text-[#374151] text-center leading-relaxed">
                                    Click to upload or drag and drop<br />
                                    <span className="text-[11px] text-[#6B7280]">PNG, JPG up to 5MB</span>
                                </p>
                                <input
                                    type="file"
                                    id="banner-upload"
                                    className="hidden"
                                    accept="image/*"
                                    onChange={async (e) => {
                                        const file = e.target.files[0]
                                        if (!file) return
                                        const fd = new FormData()
                                        fd.append('image', file)
                                        try {
                                            const res = await api.post('/upload', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
                                            // /upload returns an absolute Cloudinary URL — resolve (not blindly prepend the host).
                                            const fullUrl = resolveImageUrl(res.data.url) || res.data.url
                                            setFormData(prev => ({ ...prev, banners: [...(prev.banners || []), fullUrl] }))
                                            toast.success('Banner uploaded!')
                                        } catch (err) { toast.error('Banner upload failed') }
                                        e.target.value = ''
                                    }}
                                />
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Content - Landing Page Tab */}
            {activeTab === 'Landing Page' && (
                <LandingPageSettings
                    initial={landingPage}
                    slug={tenant?.slug || ''}
                    readOnly={isBranchPinned}
                    isSaving={isSaving}
                    onSave={(data) => saveSectionSettings('landingPage', data)}
                />
            )}

            {/* Content - Printers Tab (per branch; saves on its own via
                PATCH /settings/printers, so "Save All" skips it too) */}
            {activeTab === 'Printers' && (
                <PrinterSettings
                    initial={printers}
                    isSaving={isSaving}
                    onSave={(data) => saveSectionSettings('printers', data)}
                />
            )}

            {/* Content - Taxes & Charges Tab */}
            {activeTab === 'Taxes & Charges' && (
                <div className="space-y-4">
                    <div className="flex justify-end">
                        <button
                            disabled={isSaving}
                            onClick={() => {
                                if (!validateTaxConfig()) return
                                saveSectionSettings('taxes', { ...taxConfig, additionalCharges })
                            }}
                            className="flex items-center gap-2 px-4 py-2 bg-[#FE8301] text-white rounded-[10px] text-[14px] font-[600] hover:bg-orange-600 transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            <Save size={18} strokeWidth={2.5} />
                            {isSaving ? 'Saving...' : 'Save Tax Configuration'}
                        </button>
                    </div>

                    {/* Tax Configuration */}
                    <div>
                        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                            <div className="p-4 md:px-8 pt-5 pb-0">
                                <h2 className="text-[16px] font-[600] text-[#1A181B]">Tax Configuration</h2>
                            </div>
                            {/* Service Charge */}
                            <div className="p-4 md:px-8 md:py-4 flex flex-col md:flex-row items-center justify-between gap-6 border-b border-gray-100">
                                <div className="w-full md:w-1/3">
                                    <h3 className="text-[16px] font-[600] text-[#1A181B] mb-1">Apply Service Charge</h3>
                                    <p className="text-[12px] text-[#9CA3AF] font-[500]">Add service charge to all orders</p>
                                </div>
                                <div className="flex-1 w-full max-w-[320px]">
                                    <label className="block text-[13px] font-[600] text-[#1A181B] mb-1.5 ml-1">Service Charge (%)</label>
                                    <input
                                        type="text"
                                        value={taxConfig.serviceCharge.value}
                                        onChange={(e) => handleTaxValueChange('serviceCharge', e.target.value)}
                                        className="w-full px-4 py-2.5 bg-white border border-gray-200 rounded-[10px] text-[14px] text-[#1A181B] focus:outline-none focus:border-[#FE8301] shadow-sm"
                                    />
                                </div>
                                <div className="w-12 flex justify-end">
                                    <button
                                        onClick={() => handleTaxToggle('serviceCharge')}
                                        className={`relative w-[44px] h-[24px] rounded-full transition-colors ${taxConfig.serviceCharge.enabled ? 'bg-[#34C759]' : 'bg-[#E5E5EA]'}`}
                                    >
                                        <div className={`absolute top-[2px] left-[2px] bg-white w-[20px] h-[20px] rounded-full transition-transform shadow-sm ${taxConfig.serviceCharge.enabled ? 'translate-x-[20px]' : ''}`} />
                                    </button>
                                </div>
                            </div>

                            {/* GST */}
                            <div className="p-4 md:px-8 md:py-4 flex flex-col md:flex-row items-center justify-between gap-6">
                                <div className="w-full md:w-1/3">
                                    <h3 className="text-[16px] font-[600] text-[#1A181B] mb-1">Apply GST</h3>
                                    <p className="text-[12px] text-[#9CA3AF] font-[500]">Add GST to all orders</p>
                                </div>
                                <div className="flex-1 w-full max-w-[320px]">
                                    <label className="block text-[13px] font-[600] text-[#1A181B] mb-1.5 ml-1">GST (%)</label>
                                    <input
                                        type="text"
                                        value={taxConfig.gst.value}
                                        onChange={(e) => handleTaxValueChange('gst', e.target.value)}
                                        className="w-full px-4 py-2.5 bg-white border border-gray-200 rounded-[10px] text-[14px] text-[#1A181B] focus:outline-none focus:border-[#FE8301] shadow-sm"
                                    />
                                </div>
                                <div className="w-12 flex justify-end">
                                    <button
                                        onClick={() => handleTaxToggle('gst')}
                                        className={`relative w-[44px] h-[24px] rounded-full transition-colors ${taxConfig.gst.enabled ? 'bg-[#34C759]' : 'bg-[#E5E5EA]'}`}
                                    >
                                        <div className={`absolute top-[2px] left-[2px] bg-white w-[20px] h-[20px] rounded-full transition-transform shadow-sm ${taxConfig.gst.enabled ? 'translate-x-[20px]' : ''}`} />
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Additional Charges */}
                    <div>
                        <div className="bg-white rounded-xl border border-gray-200 p-4 md:p-6 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)]">
                            <div className="mb-4">
                                <h2 className="text-[16px] font-[600] text-[#1A181B]">Additional Charges</h2>
                            </div>
                            {/* Add New Charge Form */}
                            <div className="flex flex-col md:flex-row gap-5 items-end mb-4">
                                <div className="flex-1 w-full">
                                    <label htmlFor="charge-name" className="block text-[13px] font-medium text-[#1A181B] mb-1.5">
                                        Charge name <span className="text-red-500" aria-hidden="true">*</span>
                                    </label>
                                    <input
                                        id="charge-name"
                                        type="text"
                                        placeholder="e.g. Service charge, Packaging fee"
                                        value={newCharge.name}
                                        onChange={(e) => { setNewCharge(prev => ({ ...prev, name: e.target.value })); if (chargeErrors.name) setChargeErrors(prev => ({ ...prev, name: undefined })) }}
                                        aria-required="true"
                                        aria-invalid={chargeErrors.name ? 'true' : 'false'}
                                        aria-describedby={chargeErrors.name ? 'charge-name-err' : undefined}
                                        className={`w-full px-4 py-2.5 bg-white border rounded-[10px] text-[14px] text-[#1A181B] focus:outline-none shadow-sm ${chargeErrors.name ? 'border-red-400 focus:border-red-500' : 'border-gray-200 focus:border-[#FE8301]'}`}
                                    />
                                    {chargeErrors.name && (
                                        <p id="charge-name-err" role="alert" className="text-xs text-red-600 mt-1 flex items-center gap-1">
                                            <span aria-hidden="true">⚠</span>{chargeErrors.name}
                                        </p>
                                    )}
                                </div>
                                <div className="w-full md:w-[220px]">
                                    <label htmlFor="charge-value" className="block text-[13px] font-medium text-[#1A181B] mb-1.5">
                                        Amount <span className="text-red-500" aria-hidden="true">*</span>
                                    </label>
                                    <div className="relative">
                                        <input
                                            id="charge-value"
                                            type="number"
                                            inputMode="decimal"
                                            placeholder="0.00"
                                            min="0"
                                            value={newCharge.value}
                                            onChange={(e) => { setNewCharge(prev => ({ ...prev, value: e.target.value })); if (chargeErrors.value) setChargeErrors(prev => ({ ...prev, value: undefined })) }}
                                            aria-required="true"
                                            aria-invalid={chargeErrors.value ? 'true' : 'false'}
                                            aria-describedby={chargeErrors.value ? 'charge-value-err' : undefined}
                                            className={`w-full px-4 py-2.5 bg-white border rounded-[10px] text-[14px] text-[#1A181B] focus:outline-none shadow-sm appearance-none ${chargeErrors.value ? 'border-red-400 focus:border-red-500' : 'border-gray-200 focus:border-[#FE8301]'}`}
                                        />
                                        <div className="absolute right-3 top-1/2 -translate-y-1/2 flex flex-col pointer-events-none">
                                            <svg width="10" height="6" viewBox="0 0 10 6" fill="none" className="rotate-180 mb-0.5">
                                                <path d="M1 1L5 5L9 1" stroke="#6B7280" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                                            </svg>
                                            <svg width="10" height="6" viewBox="0 0 10 6" fill="none">
                                                <path d="M1 1L5 5L9 1" stroke="#6B7280" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                                            </svg>
                                        </div>
                                    </div>
                                    {chargeErrors.value && (
                                        <p id="charge-value-err" role="alert" className="text-xs text-red-600 mt-1 flex items-center gap-1">
                                            <span aria-hidden="true">⚠</span>{chargeErrors.value}
                                        </p>
                                    )}
                                </div>
                                <div className="w-full md:w-[220px]">
                                    <label htmlFor="charge-type" className="block text-[13px] font-medium text-[#1A181B] mb-1.5">
                                        Type <span className="text-red-500" aria-hidden="true">*</span>
                                    </label>
                                    <div className="relative">
                                        <select
                                            id="charge-type"
                                            value={newCharge.type}
                                            onChange={(e) => { setNewCharge(prev => ({ ...prev, type: e.target.value })); if (chargeErrors.type) setChargeErrors(prev => ({ ...prev, type: undefined })) }}
                                            aria-required="true"
                                            aria-invalid={chargeErrors.type ? 'true' : 'false'}
                                            aria-describedby={chargeErrors.type ? 'charge-type-err' : undefined}
                                            className={`w-full px-4 py-2.5 bg-white border rounded-[10px] text-[14px] text-[#1A181B] focus:outline-none appearance-none shadow-sm cursor-pointer ${chargeErrors.type ? 'border-red-400 focus:border-red-500' : 'border-gray-200 focus:border-[#FE8301]'}`}
                                        >
                                            <option value="" disabled>Flat/Percentage</option>
                                            <option value="Flat">Flat</option>
                                            <option value="Percentage">Percentage</option>
                                        </select>
                                        {chargeErrors.type && (
                                            <p id="charge-type-err" role="alert" className="text-xs text-red-600 mt-1 flex items-center gap-1">
                                                <span aria-hidden="true">⚠</span>{chargeErrors.type}
                                            </p>
                                        )}
                                        <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none">
                                            <svg width="10" height="6" viewBox="0 0 10 6" fill="none">
                                                <path d="M1 1L5 5L9 1" stroke="#667085" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                                            </svg>
                                        </div>
                                    </div>
                                </div>
                                <button
                                    onClick={handleAddCharge}
                                    className="w-full md:w-auto px-6 py-2.5 bg-[#FE8301] text-white rounded-[10px] text-[14px] font-[600] hover:bg-orange-600 transition-colors flex items-center justify-center gap-2 shadow-sm"
                                >
                                    <Plus size={18} strokeWidth={2.5} />
                                    Add
                                </button>
                            </div>

                            {/* Charges List */}
                            <div className="space-y-3">
                                {additionalCharges.map((charge) => (
                                    <div key={getChargeId(charge)} className="flex items-center justify-between p-4 bg-white border border-gray-100 rounded-[12px] shadow-sm">
                                        <div>
                                            <p className="text-[12px] font-[500] text-[#1A181B] mb-0.5">{charge.name}</p>
                                            <p className="text-[15px] text-[#1A181B] font-[700]">{charge.type === 'Percentage' ? `${charge.value}%` : `₹${charge.value}`}</p>
                                        </div>
                                        <div className="flex items-center gap-4">
                                            <button
                                                onClick={() => handleChargeToggle(getChargeId(charge))}
                                                className={`relative w-[44px] h-[24px] rounded-full transition-colors ${charge.enabled ? 'bg-[#34C759]' : 'bg-[#E5E5EA]'}`}
                                            >
                                                <div className={`absolute top-[2px] left-[2px] bg-white w-[20px] h-[20px] rounded-full transition-transform shadow-sm ${charge.enabled ? 'translate-x-[20px]' : ''}`} />
                                            </button>
                                            <button
                                                onClick={() => handleDeleteCharge(getChargeId(charge))}
                                                className="p-2 text-gray-400 hover:text-red-500 transition-colors"
                                            >
                                                <Trash2 size={20} strokeWidth={1.5} />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Content - Delivery Tab */}
            {activeTab === 'Delivery' && (
                <div className="space-y-4 pb-10">
                    <div className="flex justify-end">
                        <button
                            disabled={isSaving}
                            onClick={saveDeliveryConfig}
                            className="flex items-center gap-2 px-4 py-2 bg-[#FE8301] text-white rounded-[10px] text-[14px] font-[600] hover:bg-orange-600 transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            <Save size={18} strokeWidth={2.5} />
                            {isSaving ? 'Saving...' : 'Save Delivery Settings'}
                        </button>
                    </div>

                    {/* Enable toggle */}
                    <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
                        <div className="p-4 md:px-8 md:py-5 flex flex-col md:flex-row items-center justify-between gap-6">
                            <div className="w-full md:w-2/3">
                                <h3 className="text-[16px] font-[600] text-[#1A181B] mb-1">Home Delivery</h3>
                                <p className="text-[12px] text-[#9CA3AF] font-[500]">
                                    Let takeaway customers get their order delivered to their address. The charge is picked from the distance ranges below.
                                </p>
                            </div>
                            <div className="w-12 flex justify-end">
                                <button
                                    onClick={() => setDeliveryConfig(prev => ({ ...prev, enabled: !prev.enabled }))}
                                    className={`relative w-[44px] h-[24px] rounded-full transition-colors ${deliveryConfig.enabled ? 'bg-[#34C759]' : 'bg-[#E5E5EA]'}`}
                                >
                                    <div className={`absolute top-[2px] left-[2px] bg-white w-[20px] h-[20px] rounded-full transition-transform shadow-sm ${deliveryConfig.enabled ? 'translate-x-[20px]' : ''}`} />
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Distance ranges */}
                    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                        <div className="p-4 md:px-8 pt-5 pb-2">
                            <h2 className="text-[16px] font-[600] text-[#1A181B]">Distance Ranges &amp; Charges</h2>
                            <p className="text-[12px] text-[#9CA3AF] font-[500] mt-1">
                                e.g. 0–5 km → ₹40, 5–10 km → ₹70. Ranges must not overlap.
                            </p>
                        </div>

                        {/* Existing slabs */}
                        <div className="px-4 md:px-8">
                            {(deliveryConfig.slabs || []).length === 0 ? (
                                <p className="text-[13px] text-[#9CA3AF] py-4">No ranges added yet.</p>
                            ) : (
                                (deliveryConfig.slabs || []).map((slab, idx) => (
                                    <div key={idx} className="flex items-center justify-between py-3 border-b border-gray-100 last:border-0">
                                        <div className="flex items-center gap-2 text-[14px] font-[500] text-[#1A181B]">
                                            <span className="px-3 py-1 rounded-full bg-orange-50 text-[#FE8301] text-[13px] font-[600]">
                                                {slab.fromKm}–{slab.toKm} km
                                            </span>
                                            <span className="text-[#645E66]">→</span>
                                            <span className="font-[600]">₹{Number(slab.charge).toFixed(2)}</span>
                                        </div>
                                        <button
                                            onClick={() => handleDeleteSlab(idx)}
                                            className="p-2 text-gray-400 hover:text-red-500 transition-colors"
                                        >
                                            <Trash2 size={18} strokeWidth={1.5} />
                                        </button>
                                    </div>
                                ))
                            )}
                        </div>

                        {/* Add new slab row */}
                        <div className="p-4 md:px-8 md:py-5 bg-gray-50 border-t border-gray-100 flex flex-col md:flex-row items-end gap-3">
                            <div className="flex-1 w-full">
                                <label className="block text-[12px] font-[600] text-[#374151] mb-1.5">From (km)</label>
                                <input
                                    type="number" min="0" step="0.5"
                                    value={newSlab.fromKm}
                                    onChange={(e) => setNewSlab(prev => ({ ...prev, fromKm: e.target.value }))}
                                    placeholder="0"
                                    className="w-full px-4 py-2.5 bg-white border border-gray-200 rounded-[10px] text-[14px] focus:outline-none focus:border-[#FE8301] shadow-sm"
                                />
                            </div>
                            <div className="flex-1 w-full">
                                <label className="block text-[12px] font-[600] text-[#374151] mb-1.5">To (km)</label>
                                <input
                                    type="number" min="0" step="0.5"
                                    value={newSlab.toKm}
                                    onChange={(e) => setNewSlab(prev => ({ ...prev, toKm: e.target.value }))}
                                    placeholder="5"
                                    className="w-full px-4 py-2.5 bg-white border border-gray-200 rounded-[10px] text-[14px] focus:outline-none focus:border-[#FE8301] shadow-sm"
                                />
                            </div>
                            <div className="flex-1 w-full">
                                <label className="block text-[12px] font-[600] text-[#374151] mb-1.5">Charge (₹)</label>
                                <input
                                    type="number" min="0" step="1"
                                    value={newSlab.charge}
                                    onChange={(e) => setNewSlab(prev => ({ ...prev, charge: e.target.value }))}
                                    placeholder="40"
                                    className="w-full px-4 py-2.5 bg-white border border-gray-200 rounded-[10px] text-[14px] focus:outline-none focus:border-[#FE8301] shadow-sm"
                                />
                            </div>
                            <button
                                onClick={handleAddSlab}
                                className="w-full md:w-auto flex items-center justify-center gap-2 px-5 py-2.5 bg-[#702083] text-white rounded-[10px] text-[14px] font-[600] hover:bg-purple-800 transition-colors shrink-0"
                            >
                                <Plus size={18} strokeWidth={2.5} /> Add Range
                            </button>
                        </div>
                    </div>

                    {/* Minimum order value */}
                    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 md:px-8 md:py-5">
                        <label className="block text-[14px] font-[600] text-[#1A181B] mb-1.5">Minimum order value for delivery (₹)</label>
                        <p className="text-[12px] text-[#9CA3AF] font-[500] mb-3">Cart items must total at least this much before delivery is offered. Set 0 for no minimum.</p>
                        <input
                            type="number" min="0" step="1"
                            value={deliveryConfig.minOrderValue}
                            onChange={(e) => setDeliveryConfig(prev => ({ ...prev, minOrderValue: e.target.value }))}
                            placeholder="0"
                            className="w-full max-w-[320px] px-4 py-2.5 bg-white border border-gray-200 rounded-[10px] text-[14px] focus:outline-none focus:border-[#FE8301] shadow-sm"
                        />
                    </div>

                    {/* Restaurant location — origin of the delivery distance */}
                    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 md:px-8 md:py-5">
                        <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
                            <label className="block text-[14px] font-[600] text-[#1A181B]">Restaurant location (for delivery distance)</label>
                            <button
                                type="button"
                                onClick={handleUseCurrentLocationForOrigin}
                                disabled={isLocatingOrigin}
                                className="text-[13px] font-[600] text-[#FE8301] hover:underline disabled:opacity-50"
                            >
                                {isLocatingOrigin ? 'Locating...' : 'Use my current location'}
                            </button>
                        </div>
                        <p className="text-[12px] text-[#9CA3AF] font-[500] mb-3">
                            The customer's distance is measured from these coordinates and the matching range's charge is applied automatically.
                            A branch with its own latitude/longitude (Branches page) uses that instead. Leave blank to let customers pick their distance.
                        </p>
                        <div className="flex flex-wrap gap-3">
                            <input
                                type="number" step="any" min="-90" max="90"
                                value={deliveryConfig.originLat}
                                onChange={(e) => setDeliveryConfig(prev => ({ ...prev, originLat: e.target.value }))}
                                placeholder="Latitude e.g. 18.5204"
                                className="w-full max-w-[200px] px-4 py-2.5 bg-white border border-gray-200 rounded-[10px] text-[14px] focus:outline-none focus:border-[#FE8301] shadow-sm"
                            />
                            <input
                                type="number" step="any" min="-180" max="180"
                                value={deliveryConfig.originLng}
                                onChange={(e) => setDeliveryConfig(prev => ({ ...prev, originLng: e.target.value }))}
                                placeholder="Longitude e.g. 73.8567"
                                className="w-full max-w-[200px] px-4 py-2.5 bg-white border border-gray-200 rounded-[10px] text-[14px] focus:outline-none focus:border-[#FE8301] shadow-sm"
                            />
                        </div>
                    </div>
                </div>
            )}

            {/* Content - Notification Tab */}
            {activeTab === 'Notification' && (
                <div className="space-y-4">
                    <div className="flex justify-end">
                        <button
                            disabled={isSaving}
                            onClick={() => saveSectionSettings('notifications', notifications)}
                            className="flex items-center gap-2 px-4 py-2 bg-[#FE8301] text-white rounded-[10px] text-[14px] font-[600] hover:bg-orange-600 transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            <Save size={18} strokeWidth={2.5} />
                            {isSaving ? 'Saving...' : 'Save Notifications'}
                        </button>
                    </div>

                    {/* Order Notifications */}
                    <div>
                        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)]">
                            <div className="p-4 md:px-8 pt-5 pb-0">
                                <h2 className="text-[16px] font-[600] text-[#1A181B]">Order Notifications</h2>
                            </div>
                            <div className="divide-y divide-gray-100 mt-2">
                                {/* New Order Alert */}
                                <div className="p-4 md:px-8 md:py-4 flex items-center justify-between">
                                    <div>
                                        <p className="text-[15px] font-[600] text-[#1A181B] mb-0.5">New Order Alert</p>
                                        <p className="text-[12px] text-[#9CA3AF] font-[500]">Notify when new order is placed</p>
                                    </div>
                                    <button
                                        onClick={() => handleNotificationToggle('newOrder')}
                                        className={`relative w-[44px] h-[24px] rounded-full transition-colors ${notifications.newOrder ? 'bg-[#34C759]' : 'bg-[#E5E5EA]'}`}
                                    >
                                        <div className={`absolute top-[2px] left-[2px] bg-white w-[20px] h-[20px] rounded-full transition-transform shadow-sm ${notifications.newOrder ? 'translate-x-[20px]' : ''}`} />
                                    </button>
                                </div>

                                {/* Order Ready Alert */}
                                <div className="p-4 md:px-8 md:py-4 flex items-center justify-between">
                                    <div>
                                        <p className="text-[15px] font-[600] text-[#1A181B] mb-0.5">Order Ready Alert</p>
                                        <p className="text-[12px] text-[#9CA3AF] font-[500]">Notify when order is ready</p>
                                    </div>
                                    <button
                                        onClick={() => handleNotificationToggle('orderReady')}
                                        className={`relative w-[44px] h-[24px] rounded-full transition-colors ${notifications.orderReady ? 'bg-[#34C759]' : 'bg-[#E5E5EA]'}`}
                                    >
                                        <div className={`absolute top-[2px] left-[2px] bg-white w-[20px] h-[20px] rounded-full transition-transform shadow-sm ${notifications.orderReady ? 'translate-x-[20px]' : ''}`} />
                                    </button>
                                </div>

                                {/* Repeat QR Code Scan Alert */}
                                <div className="p-4 md:px-8 md:py-4 flex items-center justify-between">
                                    <div>
                                        <p className="text-[15px] font-[600] text-[#1A181B] mb-0.5">Repeat QR Code Scan Alert</p>
                                        <p className="text-[12px] text-[#9CA3AF] font-[500]">This appears to be a repeat scan. The table has already completed its order and payment.</p>
                                    </div>
                                    <button
                                        onClick={() => handleNotificationToggle('repeatQR')}
                                        className={`relative w-[44px] h-[24px] rounded-full transition-colors ${notifications.repeatQR ? 'bg-[#34C759]' : 'bg-[#E5E5EA]'}`}
                                    >
                                        <div className={`absolute top-[2px] left-[2px] bg-white w-[20px] h-[20px] rounded-full transition-transform shadow-sm ${notifications.repeatQR ? 'translate-x-[20px]' : ''}`} />
                                    </button>
                                </div>

                                {/* Early Order Cancellation */}
                                <div className="p-4 md:px-8 md:py-4 flex items-center justify-between">
                                    <div>
                                        <p className="text-[15px] font-[600] text-[#1A181B] mb-0.5">Allow Early Order Cancellation(User side)</p>
                                        <p className="text-[12px] text-[#9CA3AF] font-[500]">Orders can be cancelled until the kitchen begins preparation.</p>
                                    </div>
                                    <button
                                        onClick={() => handleNotificationToggle('earlyCancellation')}
                                        className={`relative w-[44px] h-[24px] rounded-full transition-colors ${notifications.earlyCancellation ? 'bg-[#34C759]' : 'bg-[#E5E5EA]'}`}
                                    >
                                        <div className={`absolute top-[2px] left-[2px] bg-white w-[20px] h-[20px] rounded-full transition-transform shadow-sm ${notifications.earlyCancellation ? 'translate-x-[20px]' : ''}`} />
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Staff Notifications */}
                    <div>
                        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)] mt-4">
                            <div className="p-4 md:px-8 pt-5 pb-0">
                                <h2 className="text-[16px] font-[600] text-[#1A181B]">Staff Notifications</h2>
                            </div>
                            <div className="divide-y divide-gray-100 mt-2">
                                {/* Waiter Call */}
                                <div className="p-4 md:px-8 md:py-4 flex items-center justify-between">
                                    <div>
                                        <p className="text-[15px] font-[600] text-[#1A181B] mb-0.5">Waiter Call</p>
                                        <p className="text-[12px] text-[#9CA3AF] font-[500]">Notify when customer calls waiter</p>
                                    </div>
                                    <button
                                        onClick={() => handleNotificationToggle('waiterCall')}
                                        className={`relative w-[44px] h-[24px] rounded-full transition-colors ${notifications.waiterCall ? 'bg-[#34C759]' : 'bg-[#E5E5EA]'}`}
                                    >
                                        <div className={`absolute top-[2px] left-[2px] bg-white w-[20px] h-[20px] rounded-full transition-transform shadow-sm ${notifications.waiterCall ? 'translate-x-[20px]' : ''}`} />
                                    </button>
                                </div>

                                {/* Table Merge Request */}
                                <div className="p-4 md:px-8 md:py-4 flex items-center justify-between">
                                    <div>
                                        <p className="text-[15px] font-[600] text-[#1A181B] mb-0.5">Table Merge Request</p>
                                        <p className="text-[12px] text-[#9CA3AF] font-[500]">Notify when table merge is requested</p>
                                    </div>
                                    <button
                                        onClick={() => handleNotificationToggle('tableMerge')}
                                        className={`relative w-[44px] h-[24px] rounded-full transition-colors ${notifications.tableMerge ? 'bg-[#34C759]' : 'bg-[#E5E5EA]'}`}
                                    >
                                        <div className={`absolute top-[2px] left-[2px] bg-white w-[20px] h-[20px] rounded-full transition-transform shadow-sm ${notifications.tableMerge ? 'translate-x-[20px]' : ''}`} />
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Content - Reservation Tab */}
            {activeTab === 'Reservation' && (
                <div className="space-y-4">
                    <div className="flex justify-end">
                        <button
                            disabled={isSaving}
                            onClick={() => saveSectionSettings('reservation', reservationConfig)}
                            className="flex items-center gap-2 px-4 py-2 bg-[#FE8301] text-white rounded-[10px] text-[14px] font-[600] hover:bg-orange-600 transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            <Save size={18} strokeWidth={2.5} />
                            {isSaving ? 'Saving...' : 'Save Reservation'}
                        </button>
                    </div>

                    {/* Enable Late Arrival Rules */}
                    <div className="bg-white rounded-xl border border-gray-200 p-4 md:px-8 md:py-4 flex items-center justify-between shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)]">
                        <div>
                            <p className="text-[15px] font-[600] text-[#1A181B] mb-0.5">Enable Late Arrival Rules</p>
                            <p className="text-[12px] text-[#9CA3AF] font-[500]">Automatically monitor reservation arrival times.</p>
                        </div>
                        <button
                            onClick={() => handleReservationChange('enableLateArrival', !reservationConfig.enableLateArrival)}
                            className={`relative w-[44px] h-[24px] rounded-full transition-colors ${reservationConfig.enableLateArrival ? 'bg-[#34C759]' : 'bg-[#E5E5EA]'}`}
                        >
                            <div className={`absolute top-[2px] left-[2px] bg-white w-[20px] h-[20px] rounded-full transition-transform shadow-sm ${reservationConfig.enableLateArrival ? 'translate-x-[20px]' : ''}`} />
                        </button>
                    </div>

                    {/* Grace Period Settings */}
                    <div className="bg-white rounded-xl border border-gray-200 p-4 md:p-6 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)]">
                        <h2 className="text-[15px] font-[600] text-[#1A181B] mb-4">Grace Period Settings</h2>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="w-full">
                                <label className="block text-[13px] font-[500] text-[#1A181B] mb-1.5">Grace Period Before Late</label>
                                <div className="relative">
                                    <select
                                        value={reservationConfig.gracePeriod}
                                        onChange={(e) => handleReservationChange('gracePeriod', e.target.value)}
                                        className="w-full px-4 py-2.5 bg-white border border-gray-200 rounded-[10px] text-[14px] text-[#1A181B] focus:outline-none focus:border-[#FE8301] appearance-none cursor-pointer shadow-sm"
                                    >
                                        <option value="5 min">5 min</option>
                                        <option value="10 min">10 min</option>
                                        <option value="15 min">15 min</option>
                                        <option value="30 min">30 min</option>
                                        <option value="60 min">60 min</option>
                                    </select>
                                    <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none">
                                        <svg width="10" height="6" viewBox="0 0 10 6" fill="none">
                                            <path d="M1 1L5 5L9 1" stroke="#667085" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                                        </svg>
                                    </div>
                                </div>
                                <p className="text-[11px] text-[#9CA3AF] mt-1.5 font-[400]">Reservation will be marked as "Late" after this duration past the reserved time.</p>
                            </div>
                            <div className="w-full space-y-4">
                                {/* Deduction Type Toggle */}
                                <div>
                                    <label className="block text-[13px] font-[500] text-[#1A181B] mb-1.5">Deduction Type</label>
                                    <div className="flex bg-[#F3F4F6] p-1 rounded-[10px]">
                                        {[{ value: 'flat', label: 'Flat (₹)' }, { value: 'percentage', label: 'Percentage (%)' }].map(opt => (
                                            <button
                                                key={opt.value}
                                                type="button"
                                                onClick={() => handleReservationChange('deductionType', opt.value)}
                                                className={`flex-1 py-2 rounded-[8px] text-[13px] font-[600] transition-all ${reservationConfig.deductionType === opt.value
                                                    ? 'bg-white text-[#1A181B] shadow-sm'
                                                    : 'text-[#6B7280] hover:text-[#374151]'
                                                }`}
                                            >
                                                {opt.label}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                                {/* Deduction Value */}
                                <div>
                                    <label className="block text-[13px] font-[500] text-[#1A181B] mb-1.5">
                                        {reservationConfig.deductionType === 'percentage' ? 'Deduction Percentage' : 'Deduction Amount'}
                                    </label>
                                    <div className="relative">
                                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[14px] text-[#9CA3AF]">
                                            {reservationConfig.deductionType === 'percentage' ? '%' : '₹'}
                                        </span>
                                        <input
                                            type="number"
                                            placeholder={reservationConfig.deductionType === 'percentage' ? 'e.g. 10' : 'e.g. 250'}
                                            min="0"
                                            max={reservationConfig.deductionType === 'percentage' ? 100 : undefined}
                                            value={reservationConfig.priceDeduction}
                                            onChange={(e) => handleReservationChange('priceDeduction', parseFloat(e.target.value) || 0)}
                                            className="w-full pl-9 pr-4 py-2.5 bg-white border border-gray-200 rounded-[10px] text-[14px] text-[#1A181B] focus:outline-none focus:border-[#FE8301] shadow-sm"
                                        />
                                    </div>
                                    <p className="text-[11px] text-[#9CA3AF] mt-1.5 font-[400]">
                                        {reservationConfig.deductionType === 'percentage'
                                            ? 'Percentage of the advance deposit to deduct on late arrival.'
                                            : 'Fixed amount to deduct from the advance deposit on late arrival.'
                                        }
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Parking (QA N10/N11) — vehicle types, hourly prices, durations */}
                    <ParkingSettingsCard
                        value={reservationConfig.parking}
                        onChange={(parking) => handleReservationChange('parking', parking)}
                    />

                    {/* Info Note */}
                    <div className="bg-[#FFFBEB] border border-[#FDE68A] rounded-xl px-4 py-3 flex items-start gap-2.5">
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="mt-0.5 flex-shrink-0">
                            <circle cx="8" cy="8" r="7" stroke="#D97706" strokeWidth="1.5" />
                            <path d="M8 5V8.5" stroke="#D97706" strokeWidth="1.5" strokeLinecap="round" />
                            <circle cx="8" cy="11" r="0.75" fill="#D97706" />
                        </svg>
                        <p className="text-[12px] text-[#92400E] font-[400] leading-[18px]">
                            Late arrival rules only apply to <span className="font-[600]">table reservations</span>. Hall bookings are excluded.
                            The countdown starts at the reserved time and deductions are applied automatically when the grace period expires.
                        </p>
                    </div>
                </div>
            )}

            {/* Content - Wallet Tab */}
            {activeTab === 'Wallet' && (
                <div className="space-y-4 pb-10">

                    {/* Wallet Sub Tabs */}
                    <div className="bg-[#E5E5EA] rounded-full p-1 flex gap-1">
                        {['Wallet & Loyalty', 'Bonus Points', 'Wallet Reports'].map(tab => (
                            <button
                                key={tab}
                                onClick={() => {
                                    setWalletSubTab(tab)
                                    setSearchParams({ tab: 'Wallet', subtab: tab })
                                }}
                                className={`flex-1 py-2 rounded-full text-[13px] font-[600] transition-all ${walletSubTab === tab
                                    ? 'bg-white text-[#FE8301] shadow-sm'
                                    : 'text-[#8E8E93] hover:text-[#6B7280]'
                                    }`}
                            >
                                {tab}
                            </button>
                        ))}
                    </div>

                    {walletSubTab === 'Wallet & Loyalty' && (
                        <div className="space-y-4">
                            {/* Header */}
                            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
                                <div>
                                    <h2 className="text-[16px] font-[600] text-[#1A181B]">Wallet & Loyalty Configuration</h2>
                                    <p className="text-[12px] text-[#9CA3AF] mt-0.5">Manage wallet and loyalty point settings for The Coffee House</p>
                                </div>
                                <button
                                    onClick={() => setShowSaveModal(true)}
                                    className="flex items-center gap-2 px-5 py-2.5 bg-[#FE8301] text-white rounded-[10px] text-[14px] font-[600] hover:bg-orange-600 transition-colors shadow-sm"
                                >
                                    <Save size={18} strokeWidth={2.5} />
                                    Save Changes
                                </button>
                            </div>

                            {/* Enable Wallet System */}
                            <div className="bg-white rounded-xl border border-gray-200 p-4 md:px-6 md:py-4 flex items-center justify-between shadow-sm">
                                <div>
                                    <div className="flex items-center gap-2 mb-0.5">
                                        <p className="text-[15px] font-[600] text-[#1A181B]">Enable Wallet System</p>
                                        <span className={`px-2 py-0.5 text-[10px] font-[600] rounded-full ${walletConfig.enableWallet ? 'bg-[#DCFCE7] text-[#16A34A]' : 'bg-[#FEE2E2] text-[#DC2626]'}`}>{walletConfig.enableWallet ? 'Active' : 'Inactive'}</span>
                                    </div>
                                    <p className="text-[12px] text-[#9CA3AF]">Allow customers to use wallet for payments</p>
                                </div>
                                <button
                                    onClick={() => handleWalletChange('enableWallet', !walletConfig.enableWallet)}
                                    className={`relative w-[44px] h-[24px] rounded-full transition-colors ${walletConfig.enableWallet ? 'bg-[#34C759]' : 'bg-[#E5E5EA]'}`}
                                >
                                    <div className={`absolute top-[2px] left-[2px] bg-white w-[20px] h-[20px] rounded-full transition-transform shadow-sm ${walletConfig.enableWallet ? 'translate-x-[20px]' : ''}`} />
                                </button>
                            </div>

                            {/* Enable Loyalty Points */}
                            <div className="bg-white rounded-xl border border-gray-200 p-4 md:px-6 md:py-4 flex items-center justify-between shadow-sm">
                                <div>
                                    <div className="flex items-center gap-2 mb-0.5">
                                        <p className="text-[15px] font-[600] text-[#1A181B]">Enable Loyalty Points</p>
                                        <span className={`px-2 py-0.5 text-[10px] font-[600] rounded-full ${walletConfig.enableLoyalty ? 'bg-[#DCFCE7] text-[#16A34A]' : 'bg-[#FEE2E2] text-[#DC2626]'}`}>{walletConfig.enableLoyalty ? 'Active' : 'Inactive'}</span>
                                    </div>
                                    <p className="text-[12px] text-[#9CA3AF]">Award points on customer purchases</p>
                                </div>
                                <button
                                    onClick={() => handleWalletChange('enableLoyalty', !walletConfig.enableLoyalty)}
                                    className={`relative w-[44px] h-[24px] rounded-full transition-colors ${walletConfig.enableLoyalty ? 'bg-[#34C759]' : 'bg-[#E5E5EA]'}`}
                                >
                                    <div className={`absolute top-[2px] left-[2px] bg-white w-[20px] h-[20px] rounded-full transition-transform shadow-sm ${walletConfig.enableLoyalty ? 'translate-x-[20px]' : ''}`} />
                                </button>
                            </div>

                            {/* Loyalty Points Rules */}
                            <div className="bg-white rounded-xl border border-gray-200 p-4 md:p-6 shadow-sm">
                                <h3 className="text-[15px] font-[600] text-[#1A181B] mb-4">Loyalty Points Rules</h3>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                                    {/* Points per ₹ spent */}
                                    <div>
                                        <label className="block text-[12px] font-[500] text-[#374151] mb-1.5">Points per ₹ spent (points/₹)</label>
                                        <div className="relative">
                                            <input
                                                type="number"
                                                value={walletConfig.pointsPerRupee}
                                                onChange={e => handleWalletChange('pointsPerRupee', e.target.value)}
                                                className="w-full px-4 py-2.5 bg-white border border-gray-200 rounded-[10px] text-[14px] text-[#1A181B] focus:outline-none focus:border-[#FE8301] shadow-sm appearance-none"
                                            />
                                        </div>
                                        <p className="text-[11px] text-[#9CA3AF] mt-1">Example: ₹100 bill - 100 points</p>
                                    </div>
                                    {/* Minimum bill */}
                                    <div>
                                        <label className="block text-[12px] font-[500] text-[#374151] mb-1.5">Minimum bill to earn points</label>
                                        <div className="relative">
                                            <input
                                                type="text"
                                                value={'₹' + walletConfig.minBillToEarn}
                                                onChange={e => handleWalletChange('minBillToEarn', e.target.value.replace('₹', ''))}
                                                className="w-full px-4 py-2.5 bg-white border border-gray-200 rounded-[10px] text-[14px] text-[#1A181B] focus:outline-none focus:border-[#FE8301] shadow-sm"
                                            />
                                        </div>
                                        <p className="text-[11px] text-[#9CA3AF] mt-1">Bills below this amount won't earn points</p>
                                    </div>
                                    {/* Max redeemable */}
                                    <div>
                                        <label className="block text-[12px] font-[500] text-[#374151] mb-1.5">Max redeemable % of bill</label>
                                        <div className="relative">
                                            <input
                                                type="text"
                                                value={walletConfig.maxRedeemPercent + '%'}
                                                onChange={e => handleWalletChange('maxRedeemPercent', e.target.value.replace('%', ''))}
                                                className="w-full px-4 py-2.5 bg-white border border-gray-200 rounded-[10px] text-[14px] text-[#1A181B] focus:outline-none focus:border-[#FE8301] shadow-sm"
                                            />
                                        </div>
                                        <p className="text-[11px] text-[#9CA3AF] mt-1">Max points usable: 50% of bill amount</p>
                                    </div>
                                    {/* Points to ₹ conversion */}
                                    <div>
                                        <label className="block text-[12px] font-[500] text-[#374151] mb-1.5">Points to ₹ conversion (₹/point)</label>
                                        <div className="relative">
                                            <input
                                                type="number"
                                                value={walletConfig.pointsToRupee}
                                                onChange={e => handleWalletChange('pointsToRupee', e.target.value)}
                                                className="w-full px-4 py-2.5 bg-white border border-gray-200 rounded-[10px] text-[14px] text-[#1A181B] focus:outline-none focus:border-[#FE8301] shadow-sm appearance-none"
                                            />
                                        </div>
                                        <p className="text-[11px] text-[#9CA3AF] mt-1">100 points = ₹10.00</p>
                                    </div>
                                    {/* Points expiry */}
                                    <div>
                                        <label className="block text-[12px] font-[500] text-[#374151] mb-1.5">Points expiry (days)</label>
                                        <div className="relative">
                                            <input
                                                type="number"
                                                min="0"
                                                max="3650"
                                                value={walletConfig.pointsExpiryDays}
                                                onChange={e => handleWalletChange('pointsExpiryDays', Math.max(0, parseInt(e.target.value) || 0))}
                                                className="w-full px-4 py-2.5 bg-white border border-gray-200 rounded-[10px] text-[14px] text-[#1A181B] focus:outline-none focus:border-[#FE8301] shadow-sm appearance-none"
                                            />
                                        </div>
                                        <p className="text-[11px] text-[#9CA3AF] mt-1">0 = Never expire</p>
                                    </div>
                                    {/* Custom Date Range */}
                                    <div>
                                        <label className="block text-[12px] font-[500] text-[#374151] mb-1.5">Custom Date Range</label>
                                        <div className="flex gap-2">
                                            <input
                                                type="date"
                                                value={walletConfig.customDateFrom}
                                                onChange={e => handleWalletChange('customDateFrom', e.target.value)}
                                                placeholder="dd/mm/yyyy"
                                                className="flex-1 px-3 py-2.5 bg-white border border-gray-200 rounded-[10px] text-[13px] text-[#1A181B] focus:outline-none focus:border-[#FE8301] shadow-sm"
                                            />
                                            <input
                                                type="date"
                                                value={walletConfig.customDateTo}
                                                onChange={e => handleWalletChange('customDateTo', e.target.value)}
                                                placeholder="dd/mm/yyyy"
                                                className="flex-1 px-3 py-2.5 bg-white border border-gray-200 rounded-[10px] text-[13px] text-[#1A181B] focus:outline-none focus:border-[#FE8301] shadow-sm"
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Refund & Payment Settings */}
                            <div className="bg-white rounded-xl border border-gray-200 p-4 md:p-6 shadow-sm">
                                <h3 className="text-[15px] font-[600] text-[#1A181B] mb-1">Refund &amp; Payment Settings</h3>
                                <p className="text-[12px] font-[400] text-[#6B7280] mb-3">Refund Mode</p>
                                {/* Decision 1 (2026-10): original payment method is the default. */}
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
                                    {/* Original Payment option (default) */}
                                    <label className="flex items-center justify-between gap-3 p-4 rounded-[10px] border border-gray-200 bg-white cursor-pointer transition-all hover:border-gray-300">
                                        <input
                                            type="radio"
                                            name="refundMode"
                                            value="original"
                                            checked={walletConfig.refundMode === 'original'}
                                            onChange={() => handleWalletChange('refundMode', 'original')}
                                            className="sr-only"
                                        />
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <p className="text-[14px] font-[600] text-[#1A181B]">Original payment method</p>
                                                <span className="px-2 py-0.5 bg-[#DCFCE7] text-[#15803D] text-[10px] font-[600] rounded-full">Recommended</span>
                                            </div>
                                            <p className="text-[11px] text-[#6B7280]">Default. Money goes back the way the customer paid — online payments are refunded to their card / UPI / bank (usually 5–7 working days).</p>
                                        </div>
                                        {/* Custom radio dot */}
                                        <div className={`w-[20px] h-[20px] rounded-full border-2 flex items-center justify-center shrink-0 transition-all ${walletConfig.refundMode === 'original' ? 'border-[#FE8301]' : 'border-gray-300'}`}>
                                            {walletConfig.refundMode === 'original' && (
                                                <div className="w-[10px] h-[10px] rounded-full bg-[#FE8301]" />
                                            )}
                                        </div>
                                    </label>
                                    {/* Wallet option */}
                                    <label className="flex items-center justify-between gap-3 p-4 rounded-[10px] border border-gray-200 bg-white cursor-pointer transition-all hover:border-gray-300">
                                        <input
                                            type="radio"
                                            name="refundMode"
                                            value="wallet"
                                            checked={walletConfig.refundMode === 'wallet'}
                                            onChange={() => handleWalletChange('refundMode', 'wallet')}
                                            className="sr-only"
                                        />
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <p className="text-[14px] font-[600] text-[#1A181B]">Customer wallet</p>
                                            </div>
                                            <p className="text-[11px] text-[#6B7280]">Money is added to the customer's BestoDine wallet instantly. They can spend it only at your restaurant — it does not go back to their bank.</p>
                                        </div>
                                        {/* Custom radio dot */}
                                        <div className={`w-[20px] h-[20px] rounded-full border-2 flex items-center justify-center shrink-0 transition-all ${walletConfig.refundMode === 'wallet' ? 'border-[#FE8301]' : 'border-gray-300'}`}>
                                            {walletConfig.refundMode === 'wallet' && (
                                                <div className="w-[10px] h-[10px] rounded-full bg-[#FE8301]" />
                                            )}
                                        </div>
                                    </label>
                                </div>
                                {/* Allow Negative Wallet Balance */}
                                <div className="flex items-center justify-between p-4 rounded-[10px] border border-gray-200 bg-white">
                                    <div>
                                        <div className="flex items-center gap-2 mb-0.5">
                                            <p className="text-[14px] font-[600] text-[#1A181B]">Allow Negative Wallet Balance</p>
                                            {walletConfig.allowNegativeBalance && (
                                                <span className="px-2 py-0.5 bg-[#FEF3C7] text-[#D97706] text-[10px] font-[600] rounded-full flex items-center gap-1">
                                                    <svg width="10" height="10" viewBox="0 0 16 16" fill="none">
                                                        <path d="M8 1L15 14H1L8 1Z" stroke="#D97706" strokeWidth="1.5" strokeLinejoin="round" />
                                                        <path d="M8 6V9" stroke="#D97706" strokeWidth="1.5" strokeLinecap="round" />
                                                        <circle cx="8" cy="11.5" r="0.75" fill="#D97706" />
                                                    </svg>
                                                    Enabled
                                                </span>
                                            )}
                                        </div>
                                        <p className="text-[11px] text-[#9CA3AF]">Allow customers to have negative balance (credit line)</p>
                                    </div>
                                    <button
                                        onClick={() => handleWalletChange('allowNegativeBalance', !walletConfig.allowNegativeBalance)}
                                        className={`relative w-[44px] h-[24px] rounded-full transition-colors shrink-0 ml-4 ${walletConfig.allowNegativeBalance ? 'bg-[#34C759]' : 'bg-[#E5E5EA]'}`}
                                    >
                                        <div className={`absolute top-[2px] left-[2px] bg-white w-[20px] h-[20px] rounded-full transition-transform shadow-sm ${walletConfig.allowNegativeBalance ? 'translate-x-[20px]' : ''}`} />
                                    </button>
                                </div>
                            </div>

                            {/* Multi-Branch / Franchise Settings */}
                            <div className="bg-white rounded-xl border border-gray-200 p-4 md:p-6 shadow-sm">
                                <h3 className="text-[15px] font-[600] text-[#1A181B] mb-1">Multi-Branch / Franchise Settings</h3>
                                <p className="text-[12px] font-[400] text-[#6B7280] mb-3">Configure wallet behavior across multiple branches</p>

                                {/* Multi-Branch Mode row */}
                                <div className="flex items-center justify-between p-4 rounded-[10px] border border-gray-200 bg-white mb-3">
                                    <div>
                                        <div className="flex items-center gap-2 mb-0.5">
                                            <p className="text-[14px] font-[600] text-[#1A181B]">Multi-Branch Mode</p>
                                            <span className={`px-2 py-0.5 border text-[10px] font-[600] rounded-full bg-white ${walletConfig.multiBranchMode ? 'border-[#16A34A] text-[#16A34A]' : 'border-[#DC2626] text-[#DC2626]'}`}>{walletConfig.multiBranchMode ? 'Active' : 'Inactive'}</span>
                                        </div>
                                        <p className="text-[11px] text-[#9CA3AF]">Enable franchise/multi-branch features</p>
                                    </div>
                                    <button
                                        onClick={() => handleWalletChange('multiBranchMode', !walletConfig.multiBranchMode)}
                                        className={`relative w-[44px] h-[24px] rounded-full transition-colors shrink-0 ml-4 ${walletConfig.multiBranchMode ? 'bg-[#34C759]' : 'bg-[#E5E5EA]'}`}
                                    >
                                        <div className={`absolute top-[2px] left-[2px] bg-white w-[20px] h-[20px] rounded-full transition-transform shadow-sm ${walletConfig.multiBranchMode ? 'translate-x-[20px]' : ''}`} />
                                    </button>
                                </div>

                                {walletConfig.multiBranchMode && (
                                    <>
                                        {/* Wallet Mode label */}
                                        <p className="text-[12px] font-[400] text-[#6B7280] mb-3">Wallet Mode</p>

                                        {/* Radio options */}
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
                                            {/* Global Wallet */}
                                            <label className="flex items-center justify-between p-4 rounded-[10px] border border-gray-200 bg-white cursor-pointer hover:border-gray-300 transition-all">
                                                <input
                                                    type="radio"
                                                    name="branchRefundMode"
                                                    value="global"
                                                    checked={walletConfig.branchRefundMode === 'global'}
                                                    onChange={() => handleWalletChange('branchRefundMode', 'global')}
                                                    className="sr-only"
                                                />
                                                <div>
                                                    <p className="text-[14px] font-[600] text-[#1A181B]">Global Wallet</p>
                                                    <p className="text-[11px] text-[#9CA3AF]">Usable across all branches</p>
                                                </div>
                                                <div className={`w-[20px] h-[20px] rounded-full border-2 flex items-center justify-center shrink-0 transition-all ${walletConfig.branchRefundMode === 'global' ? 'border-[#FE8301]' : 'border-gray-300'}`}>
                                                    {walletConfig.branchRefundMode === 'global' && (
                                                        <div className="w-[10px] h-[10px] rounded-full bg-[#FE8301]" />
                                                    )}
                                                </div>
                                            </label>
                                            {/* Per-Branch wallet */}
                                            <label className="flex items-center justify-between p-4 rounded-[10px] border border-gray-200 bg-white cursor-pointer hover:border-gray-300 transition-all">
                                                <input
                                                    type="radio"
                                                    name="branchRefundMode"
                                                    value="per_branch"
                                                    checked={walletConfig.branchRefundMode === 'per_branch'}
                                                    onChange={() => handleWalletChange('branchRefundMode', 'per_branch')}
                                                    className="sr-only"
                                                />
                                                <div>
                                                    <p className="text-[14px] font-[600] text-[#1A181B]">Per-Branch Wallet</p>
                                                    <p className="text-[11px] text-[#9CA3AF]">Separate wallet per branch</p>
                                                </div>
                                                <div className={`w-[20px] h-[20px] rounded-full border-2 flex items-center justify-center shrink-0 transition-all ${walletConfig.branchRefundMode === 'per_branch' ? 'border-[#FE8301]' : 'border-gray-300'}`}>
                                                    {walletConfig.branchRefundMode === 'per_branch' && (
                                                        <div className="w-[10px] h-[10px] rounded-full bg-[#FE8301]" />
                                                    )}
                                                </div>
                                            </label>
                                        </div>

                                        {/* Branch-Specific Points Rules */}
                                        <div className="flex items-center justify-between p-4 rounded-[10px] border border-gray-200 bg-white">
                                            <div>
                                                <p className="text-[14px] font-[600] text-[#1A181B] mb-0.5">Branch-Specific Points Rules</p>
                                                <p className="text-[11px] text-[#9CA3AF]">Each branch can have different points earning rules</p>
                                            </div>
                                            <button
                                                onClick={() => handleWalletChange('branchSpecificPoints', !walletConfig.branchSpecificPoints)}
                                                className={`relative w-[44px] h-[24px] rounded-full transition-colors shrink-0 ml-4 ${walletConfig.branchSpecificPoints ? 'bg-[#34C759]' : 'bg-[#E5E5EA]'}`}
                                            >
                                                <div className={`absolute top-[2px] left-[2px] bg-white w-[20px] h-[20px] rounded-full transition-transform shadow-sm ${walletConfig.branchSpecificPoints ? 'translate-x-[20px]' : ''}`} />
                                            </button>
                                        </div>

                                        {/* Info banner when per_branch is selected */}
                                        {walletConfig.branchRefundMode === 'per_branch' && (
                                            <div className="mt-3 bg-[#FFF7ED] border border-[#FFEDD5] rounded-[10px] p-4">
                                                <div className="flex items-start gap-2">
                                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="shrink-0 mt-0.5" stroke="#EA580C" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                        <circle cx="12" cy="12" r="10"></circle>
                                                        <line x1="12" y1="16" x2="12" y2="12"></line>
                                                        <line x1="12" y1="8" x2="12.01" y2="8"></line>
                                                    </svg>
                                                    <p className="text-[12px] text-[#9A3412] leading-relaxed">
                                                        Per-branch wallets are isolated. Customers will have separate balances at each branch. Points earned at one branch cannot be redeemed at another.
                                                    </p>
                                                </div>
                                            </div>
                                        )}
                                    </>
                                )}
                            </div>

                            {/* Wallet Notifications */}
                            <div className="bg-white rounded-xl border border-gray-200 p-4 md:p-6 shadow-sm">
                                <h3 className="text-[15px] font-[600] text-[#1A181B] mb-4">Wallet Notifications</h3>
                                <div className="bg-[#EFF6FF] border border-[#BFDBFE] rounded-[10px] p-4">
                                    <p className="text-[13px] font-[600] text-[#1D4ED8] mb-2">Customers automatically receive notifications for:</p>
                                    <ul className="space-y-1">
                                        {[
                                            'Points Earned on purchases',
                                            'Points Redeemed during payment',
                                            'Points Expiring Soon (7 days before)',
                                            'Points Expired',
                                            'Refund Credited to wallet',
                                            'Bonus Points Added',
                                            'Wallet Balance Low (< ₹100)',
                                        ].map(item => (
                                            <li key={item} className="flex items-center gap-2 text-[12px] text-[#1E40AF]">
                                                <span className="w-1.5 h-1.5 rounded-full bg-[#3B82F6] shrink-0" />
                                                {item}
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            </div>

                            {/* Configuration Summary */}
                            <div className="bg-[#F0F4FF] rounded-xl border border-[#E0E7FF] p-4 md:p-5">
                                <h3 className="text-[14px] font-[600] text-[#1A181B] mb-3">Configuration Summary</h3>
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                    {/* Wallet Status */}
                                    <div className="bg-white rounded-[10px] border border-[#E5E7EB] p-3">
                                        <p className="text-[11px] text-[#9CA3AF] mb-1.5">Wallet Status</p>
                                        <p className={`text-[14px] font-[600] flex items-center gap-1 ${walletConfig.enableWallet ? 'text-[#16A34A]' : 'text-[#DC2626]'}`}>
                                            {walletConfig.enableWallet ? (
                                                <><svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M2.5 7L5.5 10L11.5 4" stroke="#16A34A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>Enabled</>
                                            ) : (
                                                <><svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M3 3L11 11M11 3L3 11" stroke="#DC2626" strokeWidth="2" strokeLinecap="round" /></svg>Disabled</>
                                            )}
                                        </p>
                                    </div>
                                    {/* Loyalty Status */}
                                    <div className="bg-white rounded-[10px] border border-[#E5E7EB] p-3">
                                        <p className="text-[11px] text-[#9CA3AF] mb-1.5">Loyalty Status</p>
                                        <p className={`text-[14px] font-[600] flex items-center gap-1 ${walletConfig.enableLoyalty ? 'text-[#16A34A]' : 'text-[#DC2626]'}`}>
                                            {walletConfig.enableLoyalty ? (
                                                <><svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M2.5 7L5.5 10L11.5 4" stroke="#16A34A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>Enabled</>
                                            ) : (
                                                <><svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M3 3L11 11M11 3L3 11" stroke="#DC2626" strokeWidth="2" strokeLinecap="round" /></svg>Disabled</>
                                            )}
                                        </p>
                                    </div>
                                    {/* Points Rate */}
                                    <div className="bg-white rounded-[10px] border border-[#E5E7EB] p-3">
                                        <p className="text-[11px] text-[#9CA3AF] mb-1.5">Points Rate</p>
                                        <p className="text-[14px] font-[600] text-[#1A181B]">{walletConfig.pointsPerRupee} pts/₹</p>
                                    </div>
                                    {/* Conversion */}
                                    <div className="bg-white rounded-[10px] border border-[#E5E7EB] p-3">
                                        <p className="text-[11px] text-[#9CA3AF] mb-1.5">Conversion</p>
                                        <p className="text-[14px] font-[600] text-[#1A181B]">₹{walletConfig.pointsToRupee}/pt</p>
                                    </div>
                                    {/* Min Bill */}
                                    <div className="bg-white rounded-[10px] border border-[#E5E7EB] p-3">
                                        <p className="text-[11px] text-[#9CA3AF] mb-1.5">Min Bill</p>
                                        <p className="text-[14px] font-[600] text-[#1A181B]">₹{walletConfig.minBillToEarn}</p>
                                    </div>
                                    {/* Max Redeem */}
                                    <div className="bg-white rounded-[10px] border border-[#E5E7EB] p-3">
                                        <p className="text-[11px] text-[#9CA3AF] mb-1.5">Max Redeem</p>
                                        <p className="text-[14px] font-[600] text-[#1A181B]">{walletConfig.maxRedeemPercent}%</p>
                                    </div>
                                    {/* Expiry */}
                                    <div className="bg-white rounded-[10px] border border-[#E5E7EB] p-3">
                                        <p className="text-[11px] text-[#9CA3AF] mb-1.5">Expiry</p>
                                        <p className="text-[14px] font-[600] text-[#1A181B]">{walletConfig.pointsExpiryDays}d</p>
                                    </div>
                                    {/* Refund Mode */}
                                    <div className="bg-white rounded-[10px] border border-[#E5E7EB] p-3">
                                        <p className="text-[11px] text-[#9CA3AF] mb-1.5">Refund Mode</p>
                                        <p className="text-[14px] font-[600] text-[#1A181B]">{walletConfig.refundMode === 'wallet' ? 'Customer wallet' : 'Original payment'}</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {walletSubTab === 'Bonus Points' && (
                        <div className="space-y-4">
                            {/* Header: Title + Action Buttons */}
                            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
                                <div>
                                    <h2 className="text-[18px] font-[700] text-[#1A181B]">Bonus Points Management</h2>
                                    <p className="text-[12px] text-[#9CA3AF] mt-0.5">Manage manual points and campaigns</p>
                                </div>
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={() => setIsAddManualPointsOpen(true)}
                                        className="flex items-center gap-2 px-4 py-2.5 bg-white border border-[#FE8301] text-[#FE8301] rounded-[10px] text-[13px] font-[600] hover:bg-orange-50 transition-colors"
                                    >
                                        <Plus size={16} strokeWidth={2.5} />
                                        Add Manual Points
                                    </button>
                                    <button
                                        onClick={() => setIsCreateCampaignOpen(true)}
                                        className="flex items-center gap-2 px-4 py-2.5 bg-[#FE8301] text-white rounded-[10px] text-[13px] font-[600] hover:bg-orange-600 transition-colors"
                                    >
                                        <Plus size={16} strokeWidth={2.5} />
                                        Create Campaign
                                    </button>
                                </div>
                            </div>

                            {bonusLoading ? (
                                <div className="flex items-center justify-center py-12">
                                    <div className="flex flex-col items-center gap-3">
                                        <div className="w-8 h-8 border-3 border-[#FE8301] border-t-transparent rounded-full animate-spin" />
                                        <p className="text-[14px] text-[#6B7280] font-[500]">Loading bonus data...</p>
                                    </div>
                                </div>
                            ) : (
                                <>
                                    {/* Stats Row */}
                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                                        {[
                                            { label: 'Active Campaigns', value: campaignStats.activeCampaigns.toLocaleString() },
                                            { label: 'Total Points Issued', value: campaignStats.totalPointsIssued.toLocaleString() },
                                            { label: 'Manual Actions', value: manualActions.length.toLocaleString() },
                                            { label: 'Customers Impacted', value: campaignStats.totalCustomersImpacted.toLocaleString() },
                                        ].map(stat => (
                                            <div key={stat.label} className="bg-white rounded-[10px] p-4 shadow-sm">
                                                <p className="text-[12px] text-[#6B7280] mb-1">{stat.label}</p>
                                                <p className="text-[22px] font-[700] text-[#1A181B]">{stat.value}</p>
                                            </div>
                                        ))}
                                    </div>

                                    {/* Active Campaigns */}
                                    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
                                        <div className="px-5 pt-4 pb-3">
                                            <h3 className="text-[14px] font-[600] text-[#1A181B]">Campaigns</h3>
                                        </div>
                                        <div className="px-5 pb-5 space-y-4">
                                            {campaigns.length === 0 && (
                                                <p className="text-[13px] text-[#9CA3AF] text-center py-6">No campaigns yet. Create one to get started.</p>
                                            )}
                                            {campaigns.map((campaign, idx) => {
                                                const dateRange = campaign.startDate && campaign.endDate
                                                    ? `${new Date(campaign.startDate).toLocaleDateString('en-GB')} - ${new Date(campaign.endDate).toLocaleDateString('en-GB')}`
                                                    : 'Ongoing'
                                                return (
                                                    <div key={campaign._id || campaign.id} className="border border-gray-300 rounded-[10px] overflow-hidden shadow-sm">
                                                        <div className="px-5 py-4 bg-white">
                                                            <div className="flex items-start justify-between gap-4">
                                                                <div className="flex items-start gap-4">
                                                                    <div className="w-[48px] h-[48px] rounded-[10px] bg-[#FAF5FF] flex items-center justify-center shrink-0">
                                                                        {campaign.type === 'birthday' ? (
                                                                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                                                                                <path d="M12 2v6M9 8h6M5 14h14M3 20h18M5 14v6M19 14v6" stroke="#702083" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                                                                            </svg>
                                                                        ) : (
                                                                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                                                                                <circle cx="12" cy="12" r="8" stroke="#702083" strokeWidth="1.5" />
                                                                                <circle cx="12" cy="12" r="4" stroke="#702083" strokeWidth="1.5" />
                                                                            </svg>
                                                                        )}
                                                                    </div>
                                                                    <div>
                                                                        <div className="flex items-center gap-2 mb-0.5 mt-0.5">
                                                                            <p className="text-[14px] font-[600] text-[#1A181B]">{campaign.name}</p>
                                                                            <span className={`px-2 py-0.5 border text-[10px] font-[500] rounded-full ${campaign.enabled
                                                                                ? 'border-[#16A34A] text-[#16A34A]'
                                                                                : 'border-[#DC2626] text-[#DC2626]'
                                                                                }`}>{campaign.enabled ? 'Active' : 'Inactive'}</span>
                                                                        </div>
                                                                        <p className="text-[13px] text-[#6B7280] mb-2">{campaign.description}</p>
                                                                        <div className="flex items-center gap-4">
                                                                            <div className="flex items-center gap-1.5 text-[12px] text-[#9CA3AF]">
                                                                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><rect x="3" y="4" width="18" height="18" rx="2" stroke="#9CA3AF" strokeWidth="1.5" /><path d="M16 2v4M8 2v4M3 10h18" stroke="#9CA3AF" strokeWidth="1.5" strokeLinecap="round" /></svg>
                                                                                {dateRange}
                                                                            </div>
                                                                            <div className="flex items-center gap-1.5 text-[12px] text-[#9CA3AF]">
                                                                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" stroke="#9CA3AF" strokeWidth="1.5" strokeLinejoin="round" /></svg>
                                                                                +{campaign.points} points
                                                                            </div>
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                                <div className="flex items-center gap-4 shrink-0 mt-0.5">
                                                                    <button
                                                                        onClick={() => setCampaignToToggle(campaign)}
                                                                        className={`relative w-[44px] h-[24px] rounded-full transition-colors shrink-0 ${campaign.enabled ? 'bg-[#34C759]' : 'bg-[#E5E5EA]'}`}
                                                                    >
                                                                        <div className={`absolute top-[2px] left-[2px] w-[20px] h-[20px] rounded-full transition-transform shadow-sm bg-white ${campaign.enabled ? 'translate-x-[20px]' : ''}`} />
                                                                    </button>
                                                                </div>
                                                            </div>
                                                        </div>
                                                        <div className="grid grid-cols-2 px-5 py-3.5 bg-white border-t border-gray-100">
                                                            <div>
                                                                <p className="text-[11px] text-[#9CA3AF] mb-0.5">Total Points Issued</p>
                                                                <p className="text-[15px] font-[700] text-[#FE8301]">{(campaign.totalPointsIssued || 0).toLocaleString()}</p>
                                                            </div>
                                                            <div>
                                                                <p className="text-[11px] text-[#9CA3AF] mb-0.5">Customers Affected</p>
                                                                <p className="text-[15px] font-[700] text-[#702083]">{(campaign.customersAffected || 0).toLocaleString()}</p>
                                                            </div>
                                                        </div>
                                                    </div>
                                                )
                                            })}
                                        </div>
                                    </div>

                                    {/* Recent Manual Actions */}
                                    <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
                                        <h3 className="text-[15px] font-[600] text-[#1A181B] mb-4">Recent Manual Actions</h3>

                                        {manualActions.length === 0 ? (
                                            <p className="text-[13px] text-[#9CA3AF] text-center py-6">No manual point adjustments yet.</p>
                                        ) : (
                                            <div className="border border-gray-200 rounded-[10px] overflow-hidden">
                                                <div className="overflow-x-auto">
                                                    <table className="w-full">
                                                        <thead>
                                                            <tr className="bg-[#F3F4F6]">
                                                                {['ID', 'Customer Name', 'Action', 'Points', 'Reason', 'By', 'Time'].map(col => (
                                                                    <th key={col} className="px-5 py-3.5 text-left text-[12px] font-[500] text-[#6B7280] whitespace-nowrap">{col}</th>
                                                                ))}
                                                            </tr>
                                                        </thead>
                                                        <tbody className="divide-y divide-gray-100 bg-white">
                                                            {manualActions.map((row, i) => (
                                                                <tr key={i} className="hover:bg-gray-50 transition-colors">
                                                                    <td className="px-5 py-4 text-[13px] font-[600] text-[#1A181B]">{row.id}</td>
                                                                    <td className="px-5 py-4 text-[13px] font-[600] text-[#1A181B] whitespace-nowrap">{row.customer}</td>
                                                                    <td className="px-5 py-4">
                                                                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[12px] font-[600] ${row.action === 'Add'
                                                                            ? 'bg-[#DCFCE7] text-[#16A34A]'
                                                                            : 'bg-[#FEE2E2] text-[#DC2626]'
                                                                            }`}>
                                                                            {row.action === 'Add' ? '+' : '−'} {row.action}
                                                                        </span>
                                                                    </td>
                                                                    <td className={`px-5 py-4 text-[13px] font-[600] ${row.action === 'Add' ? 'text-[#16A34A]' : 'text-[#DC2626]'
                                                                        }`}>{row.points}</td>
                                                                    <td className="px-5 py-4 text-[13px] text-[#6B7280]">{row.reason}</td>
                                                                    <td className="px-5 py-4 text-[13px] text-[#6B7280]">{row.by}</td>
                                                                    <td className="px-5 py-4 text-[13px] text-[#6B7280] whitespace-nowrap">{row.time}</td>
                                                                </tr>
                                                            ))}
                                                        </tbody>
                                                    </table>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </>
                            )}
                        </div>
                    )}

                    {walletSubTab === 'Wallet Reports' && (
                        <div className="space-y-6">
                            {/* Header Row */}
                            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                                <div>
                                    <h2 className="text-[18px] font-[700] text-[#1A181B]">Wallet Reports</h2>
                                    <p className="text-[13px] text-[#6B7280] mt-0.5">Comprehensive wallet and loyalty analytics</p>
                                </div>
                                <div className="flex items-center gap-3">
                                    {/* Export Button */}
                                    <button
                                        onClick={() => {
                                            if (!reportData) return
                                            const jsonStr = JSON.stringify(reportData, null, 2)
                                            const blob = new Blob([jsonStr], { type: 'application/json' })
                                            const url = URL.createObjectURL(blob)
                                            const a = document.createElement('a')
                                            a.href = url
                                            a.download = `${activeWalletReport.replace(/\s+/g, '_')}_${walletReportFilter}.json`
                                            a.click()
                                            URL.revokeObjectURL(url)
                                            toast.success('Report exported')
                                        }}
                                        disabled={!reportData || reportLoading}
                                        className="flex items-center gap-2 px-4 py-2.5 bg-white border border-[#FE8301] text-[#FE8301] rounded-[10px] text-[13px] font-[600] hover:bg-orange-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                                        Export
                                    </button>
                                    <div className="relative" ref={walletReportDropdownRef}>
                                        <button
                                            onClick={() => setIsWalletReportDropdownOpen(!isWalletReportDropdownOpen)}
                                            className={`w-[200px] flex items-center justify-between bg-white border ${isWalletReportDropdownOpen ? 'border-[#FE8301] shadow-sm ring-1 ring-[#FE8301]/10' : 'border-[#E5E7EB]'} rounded-[8px] pl-4 pr-3 py-2.5 text-[14px] font-[500] text-[#1A181B] transition-all`}
                                        >
                                            {walletReportFilter}
                                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className={`transition-transform duration-200 ${isWalletReportDropdownOpen ? 'rotate-180 text-[#FE8301]' : 'text-gray-400'}`}>
                                                <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                            </svg>
                                        </button>

                                        {isWalletReportDropdownOpen && (
                                            <div className="absolute top-[calc(100%+4px)] right-0 w-[200px] bg-white border border-gray-100 rounded-[10px] shadow-lg py-1.5 z-10 overflow-hidden">
                                                {['Today', 'Yesterday', 'This Week', 'This Month', 'This Year'].map((option) => (
                                                    <button
                                                        key={option}
                                                        onClick={() => {
                                                            setWalletReportFilter(option)
                                                            setIsWalletReportDropdownOpen(false)
                                                        }}
                                                        className={`w-full text-left px-4 py-2.5 text-[13px] hover:bg-orange-50/80 transition-colors flex items-center justify-between group ${walletReportFilter === option ? 'text-[#FE8301] font-[600] bg-orange-50/50' : 'text-[#4B5563] font-[500]'}`}
                                                    >
                                                        {option}
                                                        {walletReportFilter === option && (
                                                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="text-[#FE8301]">
                                                                <path d="M20 6L9 17l-5-5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                                                            </svg>
                                                        )}
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* Top 6 Reports Grid */}
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                {[
                                    { title: 'Wallet Balance Summary', desc: 'Overview of all customer wallet balances' },
                                    { title: 'Points Issued vs Redeemed', desc: 'Track loyalty points lifecycle' },
                                    { title: 'Expired Points Report', desc: 'Points that expired without redemption' },
                                    { title: 'Refunds to Wallet Report', desc: 'All refunds credited to customer wallets' },
                                    { title: 'Top Wallet Users', desc: 'Customers with highest wallet activity' },
                                    { title: 'Wallet Liability Report', desc: 'Total liability and risk analysis' },
                                ].map((report, idx) => {
                                    const isActive = activeWalletReport === report.title;
                                    return (
                                        <div
                                            key={idx}
                                            onClick={() => setActiveWalletReport(report.title)}
                                            className={`bg-white rounded-[12px] p-5 shadow-sm transition-all cursor-pointer ${isActive
                                                ? 'border-2 border-[#FE8301]'
                                                : 'border border-[#E5E7EB] hover:border-gray-300'
                                                }`}
                                        >
                                            <h3 className="text-[15px] font-[600] text-[#1A181B] mb-1">{report.title}</h3>
                                            <p className="text-[12px] text-[#9CA3AF] mb-5">{report.desc}</p>

                                            <div className="flex items-center gap-2">
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation()
                                                        if (!reportData || activeWalletReport !== report.title) return
                                                        const jsonStr = JSON.stringify(reportData, null, 2)
                                                        const blob = new Blob([jsonStr], { type: 'application/json' })
                                                        const url = URL.createObjectURL(blob)
                                                        const a = document.createElement('a')
                                                        a.href = url
                                                        a.download = `${report.title.replace(/\s+/g, '_')}_${walletReportFilter}.json`
                                                        a.click()
                                                        URL.revokeObjectURL(url)
                                                        toast.success('Report exported')
                                                    }}
                                                    className="flex-shrink-0 w-10 h-10 flex items-center justify-center rounded-[8px] border border-[#FE8301] text-[#FE8301] hover:bg-orange-50 transition-colors"
                                                >
                                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                                                </button>
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); setActiveWalletReport(report.title) }}
                                                    className="flex-1 h-10 rounded-[8px] border border-[#FE8301] text-[#FE8301] text-[13px] font-[600] hover:bg-orange-50 transition-colors"
                                                >
                                                    View Report
                                                </button>
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>

                            {/* Detailed View Section */}
                            <div className="bg-white rounded-[16px] border border-[#E5E7EB] p-6 shadow-sm">
                                {reportLoading ? (
                                    <div className="flex items-center justify-center py-12">
                                        <div className="flex flex-col items-center gap-3">
                                            <div className="w-8 h-8 border-3 border-[#FE8301] border-t-transparent rounded-full animate-spin" />
                                            <p className="text-[14px] text-[#6B7280] font-[500]">Loading report...</p>
                                        </div>
                                    </div>
                                ) : !reportData ? (
                                    <p className="text-[13px] text-[#9CA3AF] text-center py-8">Select a report and filter to view data.</p>
                                ) : (
                                    <>
                                        {activeWalletReport === 'Wallet Balance Summary' && (
                                            <>
                                                <h3 className="text-[16px] font-[600] text-[#1A181B] mb-5">Wallet Balance Summary - {walletReportFilter.toLowerCase()}</h3>
                                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                                                    <div className="bg-[#FAF5FF] rounded-[10px] p-4">
                                                        <p className="text-[12px] font-[500] text-[#C026D3] mb-1">Total Balance</p>
                                                        <p className="text-[20px] font-[700] text-[#C026D3]">₹{(reportData.totalBalance || 0).toLocaleString()}</p>
                                                    </div>
                                                    <div className="bg-[#F0FDF4] rounded-[10px] p-4">
                                                        <p className="text-[12px] font-[500] text-[#16A34A] mb-1">Active Wallets</p>
                                                        <p className="text-[20px] font-[700] text-[#16A34A]">{reportData.activeWallets || 0}</p>
                                                    </div>
                                                    <div className="bg-[#F0F9FF] rounded-[10px] p-4">
                                                        <p className="text-[12px] font-[500] text-[#0284C7] mb-1">Average Balance</p>
                                                        <p className="text-[20px] font-[700] text-[#0284C7]">₹{(reportData.avgBalance || 0).toLocaleString()}</p>
                                                    </div>
                                                    <div className="bg-[#FFF7ED] rounded-[10px] p-4">
                                                        <p className="text-[12px] font-[500] text-[#EA580C] mb-1">Highest Balance</p>
                                                        <p className="text-[20px] font-[700] text-[#EA580C]">₹{(reportData.highest || 0).toLocaleString()}</p>
                                                    </div>
                                                </div>
                                                <div className="h-px bg-gray-100 my-6"></div>
                                                <div>
                                                    <h4 className="text-[14px] font-[600] text-[#1A181B] mb-5">Balance Distribution</h4>
                                                    <div className="space-y-4">
                                                        {(reportData.distribution || []).map((bar, idx) => (
                                                            <div key={idx} className="flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-4 relative">
                                                                <div className="w-[100px] shrink-0 text-[12px] font-[500] text-[#4B5563]">{bar.label}</div>
                                                                <div className="flex-1 w-full h-2.5 bg-[#F3F4F6] rounded-full overflow-hidden">
                                                                    <div className="h-full bg-[#16A34A] rounded-full transition-all duration-500" style={{ width: `${Math.min(bar.percent, 100)}%` }}></div>
                                                                </div>
                                                                <div className="w-auto sm:w-[120px] text-right text-[11px] font-[500] text-[#6B7280]">
                                                                    {bar.count} customers <span className="text-[#9CA3AF]">({bar.percent}%)</span>
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            </>
                                        )}

                                        {activeWalletReport === 'Points Issued vs Redeemed' && (
                                            <>
                                                <h3 className="text-[16px] font-[600] text-[#1A181B] mb-5">Points Issued vs Redeemed - {walletReportFilter.toLowerCase()}</h3>
                                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
                                                    <div className="bg-[#F0FDF4] rounded-[10px] p-4 text-[#16A34A]">
                                                        <p className="text-[12px] font-[500] mb-1">Total Issued</p>
                                                        <div className="mb-0.5"><span className="text-[22px] font-[700]">{(reportData.totalIssued || 0).toLocaleString()}</span></div>
                                                    </div>
                                                    <div className="bg-[#FEF2F2] rounded-[10px] p-4 text-[#EF4444]">
                                                        <p className="text-[12px] font-[500] mb-1">Total Redeemed</p>
                                                        <div className="mb-0.5"><span className="text-[22px] font-[700]">{(reportData.totalRedeemed || 0).toLocaleString()}</span></div>
                                                    </div>
                                                    <div className="bg-[#EFF6FF] rounded-[10px] p-4 text-[#3B82F6]">
                                                        <p className="text-[12px] font-[500] mb-1">Net Outstanding</p>
                                                        <div className="mb-0.5"><span className="text-[22px] font-[700]">{(reportData.netOutstanding || 0).toLocaleString()}</span></div>
                                                    </div>
                                                </div>
                                                <div className="h-px bg-gray-100 my-6"></div>
                                                <div>
                                                    <h4 className="text-[15px] font-[600] text-[#1A181B] mb-5">Top Redeemers</h4>
                                                    <div className="space-y-3">
                                                        {(reportData.topRedeemers || []).length === 0 && (
                                                            <p className="text-[13px] text-[#9CA3AF] text-center py-4">No redemptions in this period.</p>
                                                        )}
                                                        {(reportData.topRedeemers || []).map((user) => (
                                                            <div key={user.rank} className="flex items-center justify-between p-4 bg-white border border-[#E5E7EB] rounded-[10px]">
                                                                <div className="flex items-center gap-3">
                                                                    <span className="text-[14px] font-[600] text-[#9CA3AF] min-w-[20px]">#{user.rank}</span>
                                                                    <span className="text-[14px] font-[600] text-[#1A181B]">{user.name}</span>
                                                                </div>
                                                                <span className="text-[13px] font-[600] text-[#4B5563]">{user.pts} pts</span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            </>
                                        )}

                                        {activeWalletReport === 'Expired Points Report' && (
                                            <>
                                                <h3 className="text-[16px] font-[600] text-[#1A181B] mb-5">Expired Points Report - {walletReportFilter.toLowerCase()}</h3>
                                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                                                    <div className="bg-[#FEF2F2] rounded-[10px] p-4 text-[#DC2626]">
                                                        <p className="text-[12px] font-[500] mb-1">Total Expired</p>
                                                        <div className="mb-0.5"><span className="text-[20px] font-[700]">{(reportData.totalExpired || 0).toLocaleString()}</span></div>
                                                    </div>
                                                    <div className="bg-[#FFF7ED] rounded-[10px] p-4 text-[#EA580C]">
                                                        <p className="text-[12px] font-[500] mb-1">Monthly Expiry</p>
                                                        <div className="mb-0.5"><span className="text-[20px] font-[700]">{(reportData.monthlyExpiry || 0).toLocaleString()}</span></div>
                                                    </div>
                                                    <div className="bg-[#FAF5FF] rounded-[10px] p-4 text-[#C026D3]">
                                                        <p className="text-[12px] font-[500] mb-1">Affected Users</p>
                                                        <div className="mb-0.5"><span className="text-[20px] font-[700]">{reportData.affectedUsers || 0}</span></div>
                                                    </div>
                                                    <div className="bg-[#F3F4F6] rounded-[10px] p-4 text-[#4B5563]">
                                                        <p className="text-[12px] font-[500] mb-1">Value Lost</p>
                                                        <div className="mb-0.5"><span className="text-[20px] font-[700]">₹{(reportData.valueLost || 0).toLocaleString()}</span></div>
                                                    </div>
                                                </div>
                                                <div className="h-px bg-gray-100 my-6"></div>
                                                <div>
                                                    <h4 className="text-[15px] font-[600] text-[#1A181B] mb-5">Expiry Breakdown</h4>
                                                    <div className="space-y-3">
                                                        {(reportData.breakdown || []).length === 0 && (
                                                            <p className="text-[13px] text-[#9CA3AF] text-center py-4">No expired points data available.</p>
                                                        )}
                                                        {(reportData.breakdown || []).map((row, i) => (
                                                            <div key={i} className="flex items-center justify-between p-4 bg-[#FAFAFA] border border-[#E5E7EB] rounded-[10px]">
                                                                <span className="text-[14px] font-[500] text-[#1A181B]">{row.month}</span>
                                                                <span className="text-[13px] font-[600] text-[#4B5563]">{(row.points || 0).toLocaleString()} points</span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            </>
                                        )}

                                        {activeWalletReport === 'Refunds to Wallet Report' && (
                                            <>
                                                <h3 className="text-[16px] font-[600] text-[#1A181B] mb-5">Refunds to Wallet Report - {walletReportFilter.toLowerCase()}</h3>
                                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
                                                    <div className="bg-[#EFF6FF] rounded-[10px] p-4 text-[#3B82F6]">
                                                        <p className="text-[12px] font-[500] mb-1">Total Refunds</p>
                                                        <div className="mb-0.5"><span className="text-[20px] font-[700]">{reportData.totalRefunds || 0}</span></div>
                                                    </div>
                                                    <div className="bg-[#F0FDF4] rounded-[10px] p-4 text-[#16A34A]">
                                                        <p className="text-[12px] font-[500] mb-1">Total Amount</p>
                                                        <div className="mb-0.5"><span className="text-[20px] font-[700]">₹{(reportData.totalAmount || 0).toLocaleString()}</span></div>
                                                    </div>
                                                    <div className="bg-[#FAF5FF] rounded-[10px] p-4 text-[#C026D3]">
                                                        <p className="text-[12px] font-[500] mb-1">Avg Refund</p>
                                                        <div className="mb-0.5"><span className="text-[20px] font-[700]">₹{(reportData.avgRefund || 0).toLocaleString()}</span></div>
                                                    </div>
                                                </div>
                                                <div className="h-px bg-gray-100 my-6"></div>
                                                <div>
                                                    <h4 className="text-[15px] font-[600] text-[#1A181B] mb-5">Refund Breakdown</h4>
                                                    <div className="space-y-3">
                                                        {(reportData.breakdown || []).length === 0 && (
                                                            <p className="text-[13px] text-[#9CA3AF] text-center py-4">No refunds in this period.</p>
                                                        )}
                                                        {(reportData.breakdown || []).map((row, i) => (
                                                            <div key={i} className="flex items-center justify-between p-4 bg-[#FAFAFA] border border-[#E5E7EB] rounded-[10px]">
                                                                <div>
                                                                    <p className="text-[14px] font-[500] text-[#1A181B]">{row.reason}</p>
                                                                    <p className="text-[12px] text-[#6B7280] mt-0.5">{row.count} refunds</p>
                                                                </div>
                                                                <span className="text-[14px] font-[600] text-[#16A34A]">₹{(row.amount || 0).toLocaleString()}</span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            </>
                                        )}

                                        {activeWalletReport === 'Top Wallet Users' && (
                                            <>
                                                <h3 className="text-[16px] font-[600] text-[#1A181B] mb-5">Top Wallet Users - {walletReportFilter.toLowerCase()}</h3>
                                                <div className="space-y-4">
                                                    {(reportData.users || []).length === 0 && (
                                                        <p className="text-[13px] text-[#9CA3AF] text-center py-4">No wallet users found.</p>
                                                    )}
                                                    {(reportData.users || []).map((user) => (
                                                        <div key={user.rank} className="border border-[#E5E7EB] rounded-[10px] bg-white overflow-hidden shadow-sm">
                                                            <div className="flex items-center justify-between p-4 border-b border-[#E5E7EB]">
                                                                <div className="flex items-center gap-3">
                                                                    <span className="text-[14px] font-[600] text-[#9CA3AF]">#{user.rank}</span>
                                                                    <span className="text-[14px] font-[600] text-[#1A181B]">{user.name}</span>
                                                                </div>
                                                                <span className="px-2.5 py-1 text-[11px] font-[600] text-[#C026D3] bg-[#FAF5FF] rounded-md">
                                                                    {user.transactions} transactions
                                                                </span>
                                                            </div>
                                                            <div className="grid grid-cols-3 p-4">
                                                                <div>
                                                                    <p className="text-[12px] font-[500] text-[#9CA3AF] mb-1">Balance</p>
                                                                    <p className="text-[16px] font-[700] text-[#C026D3]">₹{(user.balance || 0).toLocaleString()}</p>
                                                                </div>
                                                                <div>
                                                                    <p className="text-[12px] font-[500] text-[#9CA3AF] mb-1">Total Recharge</p>
                                                                    <p className="text-[16px] font-[700] text-[#16A34A]">₹{(user.recharge || 0).toLocaleString()}</p>
                                                                </div>
                                                                <div>
                                                                    <p className="text-[12px] font-[500] text-[#9CA3AF] mb-1">Total Spent</p>
                                                                    <p className="text-[16px] font-[700] text-[#DC2626]">₹{(user.spent || 0).toLocaleString()}</p>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </>
                                        )}

                                        {activeWalletReport === 'Wallet Liability Report' && (
                                            <>
                                                <h3 className="text-[16px] font-[600] text-[#1A181B] mb-5">Wallet Liability Report - {walletReportFilter.toLowerCase()}</h3>
                                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
                                                    <div className="bg-[#FEF2F2] rounded-[10px] p-4 text-[#DC2626]">
                                                        <p className="text-[12px] font-[500] mb-1">Total Liability</p>
                                                        <div className="mb-0.5"><span className="text-[22px] font-[700]">₹{(reportData.totalLiability || 0).toLocaleString()}</span></div>
                                                    </div>
                                                    <div className="bg-[#FFF7ED] rounded-[10px] p-4 text-[#EA580C]">
                                                        <p className="text-[12px] font-[500] mb-1">Monthly Growth</p>
                                                        <div className="mb-0.5"><span className="text-[22px] font-[700]">₹{(reportData.monthlyGrowth || 0).toLocaleString()}</span></div>
                                                        <p className="text-[11px] font-[500] opacity-80">{reportData.growthPercent >= 0 ? '+' : ''}{reportData.growthPercent || 0}%</p>
                                                    </div>
                                                    <div className="bg-[#FAF5FF] rounded-[10px] p-4 text-[#C026D3]">
                                                        <p className="text-[12px] font-[500] mb-1">Projected (Next Month)</p>
                                                        <div className="mb-0.5"><span className="text-[22px] font-[700]">₹{(reportData.projected || 0).toLocaleString()}</span></div>
                                                    </div>
                                                </div>
                                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
                                                    <div className="bg-[#EFF6FF] rounded-[10px] p-4 text-[#3B82F6]">
                                                        <p className="text-[12px] font-[500] mb-1">Utilization Rate</p>
                                                        <div className="mb-0.5"><span className="text-[22px] font-[700]">{reportData.utilizationRate || 0}%</span></div>
                                                    </div>
                                                    <div className="sm:col-span-2 bg-[#F3F4F6] rounded-[10px] p-4">
                                                        <p className="text-[12px] font-[500] text-[#6B7280] mb-1">Risk Level</p>
                                                        <div className="mt-1">
                                                            <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-[600] ${
                                                                reportData.riskLevel === 'Low Risk' ? 'bg-[#DCFCE7] text-[#16A34A]' :
                                                                reportData.riskLevel === 'Medium Risk' ? 'bg-[#FEF3C7] text-[#D97706]' :
                                                                'bg-[#FEE2E2] text-[#DC2626]'
                                                            }`}>
                                                                {reportData.riskLevel || 'N/A'}
                                                            </span>
                                                        </div>
                                                    </div>
                                                </div>
                                                <div className="bg-[#FEFCE8] border border-[#FEF08A] rounded-[10px] p-4">
                                                    <div className="flex items-center gap-2 mb-1.5 text-[#A16207]">
                                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                            <circle cx="12" cy="12" r="10"></circle>
                                                            <line x1="12" y1="16" x2="12" y2="12"></line>
                                                            <line x1="12" y1="8" x2="12.01" y2="8"></line>
                                                        </svg>
                                                        <h4 className="text-[13px] font-[600]">Liability Analysis</h4>
                                                    </div>
                                                    <p className="text-[12px] text-[#A16207] opacity-90 leading-relaxed ml-[24px]">
                                                        Current wallet liability is ₹{(reportData.totalLiability || 0).toLocaleString()}.
                                                        {reportData.growthPercent !== undefined && ` Monthly growth is ${reportData.growthPercent >= 0 ? '+' : ''}${reportData.growthPercent}%.`}
                                                        {reportData.utilizationRate !== undefined && ` Utilization rate is ${reportData.utilizationRate}%, indicating ${reportData.utilizationRate > 60 ? 'good' : 'moderate'} customer engagement.`}
                                                    </p>
                                                </div>
                                            </>
                                        )}
                                    </>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Modals */}
            {/* Save Confirmation */}
            <ConfirmModal
                isOpen={showSaveModal}
                variant="warning"
                title="Apply Changes?"
                message="You're about to save the updated settings. This will update your cafe configuration."
                confirmLabel="Confirm"
                cancelLabel="Cancel"
                onConfirm={() => {
                    setShowSaveModal(false)
                    if (!validateWalletConfig()) return
                    const { customDateFrom, customDateTo, ...walletData } = walletConfig
                    saveSectionSettings('wallet', walletData)
                }}
                onClose={() => setShowSaveModal(false)}
            />

            <CloseDayModal
                isOpen={closeDayModal.isOpen}
                onClose={() => setCloseDayModal({ isOpen: false, day: null })}
                onConfirm={handleConfirmCloseDay}
            />

            <AddManualPointsModal
                isOpen={isAddManualPointsOpen}
                onClose={() => setIsAddManualPointsOpen(false)}
                onConfirm={async (data) => {
                    if (!data.customer) {
                        toast.error('Please search and select a customer')
                        return
                    }
                    if (!data.points || !data.reason) {
                        toast.error('Please fill all fields')
                        return
                    }
                    const pts = parseInt(data.points)
                    if (isNaN(pts) || pts <= 0) {
                        toast.error('Points must be a positive number')
                        return
                    }
                    const loadToast = toast.loading(`${data.type === 'add' ? 'Adding' : 'Deducting'} points...`)
                    try {
                        await walletAPI.adjustWallet({
                            targetUserId: data.customer,
                            amount: pts,
                            type: 'points',
                            action: data.type,
                            description: data.reason
                        })
                        toast.success(`Points ${data.type === 'add' ? 'added' : 'deducted'} successfully`, { id: loadToast })
                        setIsAddManualPointsOpen(false)
                        fetchBonusData()
                    } catch (err) {
                        const msg = err.response?.data?.message || 'Failed to update points'
                        toast.error(msg, { id: loadToast })
                    }
                }}
            />

            <CreatePointsCampaignModal
                isOpen={isCreateCampaignOpen}
                onClose={() => setIsCreateCampaignOpen(false)}
                onConfirm={async (data) => {
                    if (!data.name || !data.points) {
                        toast.error('Please fill campaign name and points')
                        return
                    }
                    if (data.type === 'custom' && (!data.startDate || !data.endDate)) {
                        toast.error('Please fill start and end dates for custom campaigns')
                        return
                    }
                    const pts = parseInt(data.points)
                    if (isNaN(pts) || pts <= 0) {
                        toast.error('Points must be a positive number')
                        return
                    }
                    try {
                        const loadToast = toast.loading('Creating campaign...')
                        await campaignAPI.create({
                            name: data.name,
                            description: data.description || '',
                            type: data.type || 'custom',
                            points: pts,
                            startDate: data.startDate || undefined,
                            endDate: data.endDate || undefined
                        })
                        toast.success('Campaign created successfully', { id: loadToast })
                        setIsCreateCampaignOpen(false)
                        fetchBonusData()
                    } catch (err) {
                        const msg = err.response?.data?.message || 'Failed to create campaign'
                        toast.error(msg)
                    }
                }}
            />

            <ToggleCampaignModal
                isOpen={!!campaignToToggle}
                isActivating={campaignToToggle && !campaignToToggle.enabled}
                onClose={() => setCampaignToToggle(null)}
                onConfirm={async () => {
                    const id = campaignToToggle?._id || campaignToToggle?.id
                    if (!id) return
                    try {
                        const loadToast = toast.loading('Updating campaign...')
                        await campaignAPI.toggle(id)
                        toast.success('Campaign updated', { id: loadToast })
                        setCampaignToToggle(null)
                        fetchBonusData()
                    } catch (err) {
                        const msg = err.response?.data?.message || 'Failed to toggle campaign'
                        toast.error(msg)
                        setCampaignToToggle(null)
                    }
                }}
            />
        </div>
    )
}

export default Settings

