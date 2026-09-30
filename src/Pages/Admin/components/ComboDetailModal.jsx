import React, { useState, useEffect, useRef } from 'react'
import { X, Edit2, ChevronLeft, ChevronRight, ChevronDown, ChevronUp, Star, Clock, Users } from 'lucide-react'
import ToggleSwitch from '../../../Components/Common/ToggleSwitch'
import VegBadge from '../../../Components/Common/VegBadge'
import { FALLBACK_IMAGE } from '../../../utils/image'

const ComboDetailModal = ({ item, onClose, onEdit, onToggle }) => {
    const [currentImageIndex, setCurrentImageIndex] = useState(0)
    const [expandedCategories, setExpandedCategories] = useState({})
    const modalRef = useRef(null)

    // Focus trap: focus the modal on open
    useEffect(() => {
        modalRef.current?.focus()
    }, [])

    // Close on Escape key
    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.key === 'Escape') onClose()
        }
        document.addEventListener('keydown', handleKeyDown)
        return () => document.removeEventListener('keydown', handleKeyDown)
    }, [onClose])

    // Auto-expand first category
    useEffect(() => {
        if (item?.categories?.[0]?.name) {
            setExpandedCategories({ [item.categories[0].name]: true })
        }
    }, [item])

    // Normalised data from the real combo item
    const comboImages = (item?.images && item.images.length > 0)
        ? item.images
        : [item?.image || FALLBACK_IMAGE]

    const comboDescription = item?.description || 'No description available for this combo.'
    const comboPrice = item?.price || 0
    const comboOriginalPrice = item?.originalPrice || (comboPrice > 0 ? Math.round(comboPrice / 0.9) : 0)
    const comboSavings = item?.savings || (comboOriginalPrice - comboPrice)
    const comboDiscount = item?.discount || (comboOriginalPrice > 0 ? Math.round((comboSavings / comboOriginalPrice) * 100) : 0)

    const comboIngredients = (item?.categories && Array.isArray(item.categories)) ? item.categories : []
    const comboVegType = item?.vegType || (item?.isVeg ? 'veg' : 'non-veg')
    const isVeg = comboVegType === 'veg'
    const isFeatured = item?.isFeatured || false
    const prepTime = item?.prepTime || '10-15'
    const serves = item?.serves || '1-2'
    const rating = item?.rating
    const availableDays = (item?.availableDays && item.availableDays.length > 0) ? item.availableDays : ['Daily']
    const startTime = item?.startTime || '—'
    const endTime = item?.endTime || '—'

    const nextImage = () => {
        setCurrentImageIndex((prev) => (prev + 1) % comboImages.length)
    }

    const prevImage = () => {
        setCurrentImageIndex((prev) => (prev - 1 + comboImages.length) % comboImages.length)
    }

    const toggleCategory = (categoryName) => {
        setExpandedCategories(prev => ({ ...prev, [categoryName]: !prev[categoryName] }))
    }

    return (
        <div
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="combo-detail-title"
        >
            <div
                ref={modalRef}
                tabIndex={-1}
                className="bg-white rounded-2xl w-full max-w-[660px] max-h-[90vh] overflow-y-auto shadow-2xl no-scrollbar outline-none"
            >
                {/* Header */}
                <div className="sticky top-0 bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between z-10">
                    <div className="flex items-center gap-2">
                        <VegBadge isVeg={isVeg} />
                        <h2 id="combo-detail-title" className="text-[18px] font-bold text-[#1A181B] font-manrope">{item?.name || 'Combo'}</h2>
                    </div>
                    <button
                        onClick={onClose}
                        className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 transition-colors"
                        aria-label="Close"
                    >
                        <X size={20} className="text-gray-500" />
                    </button>
                </div>

                <div className="p-6">
                    {/* Special/Featured Badge */}
                    {isFeatured && (
                        <div className="flex items-center gap-2 mb-4 text-orange-500">
                            <Star size={18} fill="currentColor" />
                            <span className="text-[14px] font-bold font-manrope">Featured Item</span>
                        </div>
                    )}

                    {/* Image Gallery */}
                    <div className="relative rounded-xl overflow-hidden mb-4 bg-black">
                        <img
                            src={comboImages[currentImageIndex]}
                            alt={`${item?.name || 'Combo'} - image ${currentImageIndex + 1} of ${comboImages.length}`}
                            className="w-full h-[280px] object-contain bg-[#FFF8F6]"
                            onError={(e) => { e.target.onerror = null; e.target.src = FALLBACK_IMAGE; }}
                        />
                        {/* Navigation Arrows */}
                        {comboImages.length > 1 && (
                            <>
                                <button
                                    onClick={prevImage}
                                    className="absolute left-3 top-1/2 -translate-y-1/2 w-10 h-10 bg-white/90 rounded-full flex items-center justify-center hover:bg-white transition-colors shadow-lg"
                                    aria-label="Previous image"
                                >
                                    <ChevronLeft size={20} className="text-gray-700" />
                                </button>
                                <button
                                    onClick={nextImage}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 w-10 h-10 bg-white/90 rounded-full flex items-center justify-center hover:bg-white transition-colors shadow-lg"
                                    aria-label="Next image"
                                >
                                    <ChevronRight size={20} className="text-gray-700" />
                                </button>
                            </>
                        )}
                        {/* Image Indicators */}
                        {comboImages.length > 1 && (
                            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5">
                                {comboImages.map((_, idx) => (
                                    <button
                                        key={idx}
                                        onClick={() => setCurrentImageIndex(idx)}
                                        className={`w-2 h-2 rounded-full transition-colors ${idx === currentImageIndex ? 'bg-white' : 'bg-white/40'}`}
                                        aria-label={`Go to image ${idx + 1}`}
                                    />
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Description + Actions */}
                    <div className="flex items-start justify-between gap-4 mb-4">
                        <p className="text-[13px] text-[#667085] font-manrope leading-relaxed flex-1">
                            {comboDescription}
                        </p>
                        <div className="flex items-center gap-2 flex-shrink-0">
                            {onEdit && (
                                <button
                                    onClick={() => onEdit(item)}
                                    className="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-gray-100 transition-colors"
                                    aria-label={`Edit ${item?.name}`}
                                >
                                    <Edit2 size={18} className="text-gray-500" />
                                </button>
                            )}
                            {onToggle ? (
                                <ToggleSwitch
                                    checked={item?.status === 'active'}
                                    onChange={() => onToggle(item)}
                                    ariaLabel={`Toggle visibility for ${item?.name}`}
                                />
                            ) : (
                                <ToggleSwitch
                                    checked={item?.status === 'active'}
                                    onChange={() => {}}
                                    disabled
                                    ariaLabel={`${item?.name} is ${item?.status === 'active' ? 'active' : 'inactive'}`}
                                />
                            )}
                        </div>
                    </div>

                    {/* Pricing */}
                    <div className="flex items-baseline gap-2 mb-1">
                        <span className="text-[24px] font-bold text-[#1A181B] font-manrope">₹{comboPrice}</span>
                        {comboOriginalPrice > comboPrice && (
                            <>
                                <span className="text-[15px] text-[#98A2B3] line-through font-manrope">₹{comboOriginalPrice}</span>
                                <span className="px-2 py-0.5 bg-[#ECFDF3] text-[#027A48] text-[12px] font-semibold rounded-md">{comboDiscount}% off</span>
                            </>
                        )}
                    </div>
                    {comboSavings > 0 && <p className="text-[13px] text-[#22C55E] font-semibold font-manrope mb-4">Saves ₹{comboSavings}</p>}

                    {/* Info Row */}
                    <div className="flex items-center gap-4 mb-6">
                        <div className="flex items-center gap-1.5">
                            <Users size={14} className="text-gray-400" />
                            <span className="text-[13px] text-[#667085] font-manrope">Serves {serves}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                            <Clock size={14} className="text-gray-400" />
                            <span className="text-[13px] text-[#667085] font-manrope">Prep {prepTime} min</span>
                        </div>
                        {rating && (
                            <div className="flex items-center gap-1">
                                <Star size={14} className="text-[#FACC15] fill-[#FACC15]" />
                                <span className="text-[13px] font-semibold text-[#344054] font-manrope">{rating}</span>
                            </div>
                        )}
                    </div>

                    {/* Available Days */}
                    <div className="mb-6">
                        <h3 className="text-[14px] font-bold text-[#1A181B] font-manrope mb-3">Available Days</h3>
                        <div className="flex flex-wrap gap-2">
                            {availableDays.map(day => (
                                <span
                                    key={day}
                                    className="px-4 py-1.5 border border-[#FE8301] text-[#FE8301] bg-orange-50/50 rounded-lg text-[13px] font-bold font-manrope"
                                >
                                    {day}
                                </span>
                            ))}
                        </div>
                    </div>

                    {/* Start/End Time */}
                    <div className="grid grid-cols-2 gap-4 mb-6">
                        <div>
                            <h3 className="text-[14px] font-bold text-[#1A181B] font-manrope mb-2">Start Time</h3>
                            <p className="text-[13px] text-[#667085] font-manrope font-bold">{startTime}</p>
                        </div>
                        <div>
                            <h3 className="text-[14px] font-bold text-[#1A181B] font-manrope mb-2">End Time</h3>
                            <p className="text-[13px] text-[#667085] font-manrope font-bold">{endTime}</p>
                        </div>
                    </div>

                    {/* Nutrition */}
                    {item?.isHealthy && (
                        <div className="mb-6">
                            <h3 className="text-[14px] font-bold text-[#1A181B] font-manrope mb-3">Health & Nutrition</h3>
                            <div className="flex flex-wrap gap-2 mb-3">
                                <span className="px-3 py-1.5 bg-green-50 border border-green-200 rounded-lg text-[12px] font-bold text-green-700 font-manrope flex items-center gap-1">
                                    Healthy Option
                                </span>
                                <span className="px-3 py-1.5 bg-orange-50 border border-orange-200 rounded-lg text-[12px] font-bold text-orange-700 font-manrope flex items-center gap-1">
                                    Balanced Calories
                                </span>
                            </div>
                        </div>
                    )}

                    {/* Ingredients */}
                    <div className="mb-4">
                        <h3 className="text-[14px] font-bold text-[#1A181B] font-manrope mb-3">Included in this Combo</h3>
                        <div className="space-y-2">
                            {comboIngredients.length > 0 ? (
                                comboIngredients.map((category) => {
                                    const isExpanded = expandedCategories[category.name]
                                    const items = category.items || []
                                    const count = category.count || items.length
                                    return (
                                        <div key={category.name} className="border border-gray-100 rounded-xl overflow-hidden">
                                            <button
                                                onClick={() => toggleCategory(category.name)}
                                                className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors"
                                                aria-expanded={isExpanded}
                                            >
                                                <span className="text-[14px] font-bold text-[#1A181B] font-manrope">
                                                    {category.name} ({count})
                                                </span>
                                                {isExpanded ? <ChevronUp size={18} className="text-gray-400" /> : <ChevronDown size={18} className="text-gray-400" />}
                                            </button>
                                            {isExpanded && (
                                                <div className="px-4 pb-4 grid grid-cols-1 gap-y-1.5">
                                                    {items.map((itemObj, idx) => (
                                                        <div key={idx} className="flex items-center gap-2 text-[13px] text-[#667085] font-manrope">
                                                            <div className="w-1.5 h-1.5 rounded-full bg-orange-400" />
                                                            <span className="font-semibold text-[#344054]">{typeof itemObj === 'string' ? itemObj : itemObj.name}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    )
                                })
                            ) : (
                                <p className="text-[13px] text-[#667085] italic font-manrope">No items listed in this combo.</p>
                            )}
                        </div>
                    </div>

                    {/* Close Button */}
                    <div className="flex justify-end pt-4">
                        <button
                            onClick={onClose}
                            className="px-8 py-2.5 border-2 border-orange-500 text-orange-500 rounded-xl font-semibold text-[14px] font-manrope hover:bg-orange-50 transition-colors"
                        >
                            Close
                        </button>
                    </div>
                </div>
            </div>
        </div>
    )
}

export default ComboDetailModal
