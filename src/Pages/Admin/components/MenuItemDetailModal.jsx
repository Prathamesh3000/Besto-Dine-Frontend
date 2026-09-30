import React, { useState, useEffect, useRef } from 'react'
import { X, Star, Clock, ChevronLeft, ChevronRight, Edit2, ChevronDown, ChevronUp } from 'lucide-react'
import ToggleSwitch from '../../../Components/Common/ToggleSwitch'
import VegBadge from '../../../Components/Common/VegBadge'
import { FALLBACK_IMAGE, handleImageError } from '../../../utils/image'

const MenuItemDetailModal = ({ item, onClose, onEdit, onToggle }) => {
    const [currentImageIndex, setCurrentImageIndex] = useState(0)
    const [showIngredients, setShowIngredients] = useState(true)
    const [showHealthyIngredients, setShowHealthyIngredients] = useState(true)
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

    if (!item) return null

    const isVeg = item.vegType === 'veg'
    const isVisible = item.status === 'active' || item.isVisible

    const itemImages = (item.images && item.images.length > 0)
        ? item.images
        : [(item.image || FALLBACK_IMAGE)];

    const nextImage = () => {
        setCurrentImageIndex((prev) => (prev + 1) % itemImages.length)
    }

    const prevImage = () => {
        setCurrentImageIndex((prev) => (prev - 1 + itemImages.length) % itemImages.length)
    }

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200"
            role="dialog"
            aria-modal="true"
            aria-labelledby="menu-detail-title"
        >
            <div
                ref={modalRef}
                tabIndex={-1}
                className="bg-white rounded-2xl w-full max-w-3xl shadow-xl overflow-hidden animate-in zoom-in-95 duration-200 max-h-[90vh] flex flex-col font-manrope outline-none"
            >

                {/* Header */}
                <div className="flex items-start justify-between p-6 pb-4 border-b border-[#FEE4E2] bg-[#FFF8F6]">
                    <div>
                        <div className="flex items-center gap-2 mb-1">
                            <VegBadge isVeg={isVeg} />
                            <h2 id="menu-detail-title" className="text-xl font-bold text-[#101828] font-manrope">{item.name}</h2>
                        </div>
                        {item.isFeatured && (
                            <div className="flex items-center gap-1.5 text-orange-500 font-semibold text-sm font-manrope">
                                <Star size={16} fill="currentColor" />
                                <span>Featured Item</span>
                            </div>
                        )}
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-white rounded-full text-[#98A2B3] hover:text-[#475467] transition-colors" aria-label="Close">
                        <X size={24} />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto no-scrollbar">
                    {/* Image Carousel */}
                    <div className="p-6 pb-0">
                        <div className="relative h-[300px] w-full rounded-2xl overflow-hidden group">
                            <img
                                src={itemImages[currentImageIndex]}
                                alt={`${item.name} - image ${currentImageIndex + 1} of ${itemImages.length}`}
                                className="w-full h-full object-cover"
                                onError={handleImageError}
                            />

                            {/* Navigation Arrows */}
                            {itemImages.length > 1 && (
                                <>
                                    <button
                                        onClick={prevImage}
                                        className="absolute left-4 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-white/20 backdrop-blur-md flex items-center justify-center text-white hover:bg-white/40 transition-colors"
                                        aria-label="Previous image"
                                    >
                                        <ChevronLeft size={20} />
                                    </button>
                                    <button
                                        onClick={nextImage}
                                        className="absolute right-4 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-white/20 backdrop-blur-md flex items-center justify-center text-white hover:bg-white/40 transition-colors"
                                        aria-label="Next image"
                                    >
                                        <ChevronRight size={20} />
                                    </button>
                                </>
                            )}

                            {/* Pagination Dots */}
                            {itemImages.length > 1 && (
                                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-1.5">
                                    {itemImages.map((_, idx) => (
                                        <button
                                            key={idx}
                                            onClick={() => setCurrentImageIndex(idx)}
                                            className={`h-1.5 rounded-full transition-all ${idx === currentImageIndex ? 'bg-white w-3' : 'bg-white/50 w-1.5'}`}
                                            aria-label={`Go to image ${idx + 1}`}
                                        />
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="p-6 space-y-6">
                        {/* Title & Actions */}
                        <div className="flex items-start justify-between">
                            <div className="flex-1 pr-4">
                                <h2 className="text-[#667085] text-sm font-medium leading-relaxed mb-4 font-manrope">
                                    {item.description || "No description available."}
                                </h2>

                                <div className="flex items-center gap-3 mb-2">
                                    <span className="text-2xl font-bold text-[#101828]">₹{item.basePrice || item.price || (typeof item.price === 'object' ? item.price?.regular : '0')}</span>
                                    {item.offerPercentage > 0 && (
                                        <>
                                            <span className="text-lg font-medium text-[#98A2B3] line-through">
                                                ₹{item.originalPrice || Math.round((item.basePrice || 0) * 100 / Math.max(1, 100 - (item.offerPercentage || 0)))}
                                            </span>
                                            <span className="bg-green-50 text-green-700 text-xs font-bold px-2 py-0.5 rounded">{item.offerPercentage}% off</span>
                                        </>
                                    )}
                                </div>
                                {item.offerPercentage > 0 && <p className="text-green-700 text-xs font-bold">Great savings!</p>}
                            </div>

                            <div className="flex items-center gap-3">
                                {onEdit && (
                                    <button
                                        onClick={() => onEdit(item)}
                                        className="text-[#98A2B3] hover:text-[#475467] transition-colors"
                                        aria-label={`Edit ${item.name}`}
                                    >
                                        <Edit2 size={24} />
                                    </button>
                                )}
                                {onToggle ? (
                                    <ToggleSwitch
                                        checked={isVisible}
                                        onChange={(e) => onToggle(item, e.target.checked)}
                                        ariaLabel={`Toggle visibility for ${item.name}`}
                                    />
                                ) : (
                                    <ToggleSwitch
                                        checked={isVisible}
                                        onChange={() => {}}
                                        disabled
                                        ariaLabel={`${item.name} is ${isVisible ? 'active' : 'inactive'}`}
                                    />
                                )}
                            </div>
                        </div>

                        {/* Meta Info */}
                        <div className="flex items-center gap-6 text-sm text-[#344054] font-semibold">
                            <div className="flex items-center justify-center gap-[4px] bg-[#FDF5FF] text-[#645E66] font-manrope font-medium text-[11px] leading-[14px] min-w-[71px] h-[22px] px-[6px] py-[4px] rounded-[20px]">
                                <span className="text-lg">🍴</span> Serves {item.serveUpto || item.servesUpto || '1'}
                            </div>
                            <div className="flex items-center justify-center gap-[4px] bg-[#FDF5FF] text-[#645E66] font-manrope font-medium text-[11px] leading-[14px] min-w-[71px] h-[22px] px-[6px] py-[4px] rounded-[20px]">
                                <Clock size={14} className="text-[#645E66]" /> {(() => {
                                    // cookingTime is a free-text field (e.g. "15-22 min", "1 hr",
                                    // "8 minutes") — only append " min" if the saved value is a
                                    // bare number/range, otherwise it'll render "15-22 min min".
                                    const t = item.cookingTime || item.preparationTime || '10-15'
                                    return /[a-zA-Z]/.test(t) ? t : `${t} min`
                                })()}
                            </div>
                            {item.rating && (
                                <div className="flex items-center justify-center gap-[4px] text-[#645E66] font-manrope font-medium text-[11px] leading-[14px] min-w-[71px] h-[22px] px-[6px] py-[4px] rounded-[20px]">
                                    <Star size={14} className="text-yellow-400 fill-yellow-400" />
                                    {item.rating}
                                </div>
                            )}
                        </div>

                        {/* Available Sizes */}
                        <div>
                            <div className="flex items-center gap-2 mb-3">
                                <h4 className="text-base font-bold text-[#101828]">Available Sizes</h4>
                                {item.unit && (
                                    <span className="text-xs font-medium text-[#667085] bg-[#F8F7FA] px-2 py-0.5 rounded-full">
                                        Unit: {item.unit.charAt(0).toUpperCase() + item.unit.slice(1)}
                                    </span>
                                )}
                            </div>
                            <div className="grid grid-cols-3 gap-4">
                                {item.sizes && item.sizes.length > 0 ? (
                                    item.sizes.map((size, idx) => (
                                        <div key={idx} className="border border-[#EAECF0] rounded-xl p-3 text-center">
                                            <p className="text-sm font-semibold text-[#344054] mb-1">{size.name}</p>
                                            {size.quantity && (
                                                <p className="text-xs text-[#667085] mb-1">{size.quantity} {item.unit || ''}</p>
                                            )}
                                            <p className="text-lg font-bold text-[#101828]">₹{size.price}</p>
                                        </div>
                                    ))
                                ) : (
                                    <div className="border border-[#EAECF0] rounded-xl p-3 text-center col-span-3">
                                        <p className="text-sm font-semibold text-[#344054] mb-1">Regular</p>
                                        <p className="text-lg font-bold text-[#101828]">₹{(item.basePrice || item.price || 0)}/{item.unit || 'pieces'}</p>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Available Days & Time */}
                        <div>
                            <h4 className="text-base font-bold text-[#101828] mb-3 font-manrope">Available Days</h4>
                            <div className="flex items-center justify-between">
                                <div className="flex gap-2 flex-wrap">
                                    {(item.availableDays && item.availableDays.length > 0 ? item.availableDays : ['Daily']).map(day => (
                                        <div key={day} className="px-4 py-1.5 border border-[#FE8301] bg-white rounded-lg text-sm font-bold text-[#344054] shadow-sm font-manrope">
                                            {day}
                                        </div>
                                    ))}
                                </div>
                                <div className="flex gap-8 text-sm">
                                    <div>
                                        <p className="text-[#667085] font-medium mb-1">Start Time</p>
                                        <p className="font-bold text-[#101828]">{item.startTime || '—'}</p>
                                    </div>
                                    <div>
                                        <p className="text-[#667085] font-medium mb-1">End Time</p>
                                        <p className="font-bold text-[#101828]">{item.endTime || '—'}</p>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Available Toppings */}
                        <div>
                            <h4 className="text-base font-bold text-[#101828] mb-3 font-manrope">Available Toppings</h4>
                            <div className="space-y-0 text-sm">
                                {item.toppings && item.toppings.length > 0 ? (
                                    item.toppings.map((topping, idx) => (
                                        <div key={idx} className="flex justify-between py-3 border-b border-gray-100 items-center">
                                            <span className="text-[#344054] font-bold font-manrope">{topping.name}</span>
                                            <span className="font-bold text-[#101828] font-manrope">+₹{topping.price}</span>
                                        </div>
                                    ))
                                ) : (
                                    <p className="text-[#667085] text-sm py-2">No toppings available.</p>
                                )}
                            </div>
                        </div>

                        {/* Nutrition */}
                        <div>
                            <h4 className="text-base font-bold text-[#101828] mb-3 font-manrope">Nutrition</h4>
                            <div className="flex gap-2 mb-4 flex-wrap">
                                {item.nutritionalInfo?.protein > 10 && (
                                    <span className="px-2 py-1 bg-orange-50 text-orange-600 text-xs font-semibold rounded-full border border-orange-100">High Protein</span>
                                )}
                                {item.nutritionalInfo?.fat < 15 && (
                                    <span className="px-2 py-1 bg-green-50 text-green-600 text-xs font-semibold rounded-full border border-green-100">Low Fat</span>
                                )}
                                {item.nutritionalInfo?.calories < 400 && (
                                    <span className="px-2 py-1 bg-blue-50 text-blue-600 text-xs font-semibold rounded-full border border-blue-100">Light Meal</span>
                                )}
                            </div>
                            <div className="flex gap-3 flex-wrap">
                                {[
                                    { label: 'Calories', value: item.nutritionalInfo?.calories, unit: 'kcal' },
                                    { label: 'Protein', value: item.nutritionalInfo?.protein, unit: 'gm' },
                                    { label: 'Fat', value: item.nutritionalInfo?.fat, unit: 'gm' },
                                    { label: 'Carbs', value: item.nutritionalInfo?.carbs, unit: 'gm' },
                                    { label: 'Fiber', value: item.nutritionalInfo?.fibre, unit: 'gm' },
                                    { label: 'Iron', value: item.nutritionalInfo?.iron, unit: 'mg' },
                                ].map((n) => (
                                    <div key={n.label} className="px-3 py-2 bg-[#F9FAFB] rounded-lg text-center">
                                        <p className="text-xs font-bold text-[#101828]">{n.value || 0} {n.unit}</p>
                                        <p className="text-[10px] text-[#667085] font-semibold">{n.label}</p>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Ingredients Accordion */}
                        <div className="space-y-2">
                            <h4 className="text-base font-bold text-[#101828] font-manrope">Ingredients</h4>

                            {/* Basic Ingredients */}
                            <div className="bg-[#F9FAFB] rounded-lg overflow-hidden">
                                <button
                                    onClick={() => setShowIngredients(!showIngredients)}
                                    className="w-full flex items-center justify-between p-3 text-sm font-semibold text-[#101828] hover:bg-gray-100 transition-colors"
                                    aria-expanded={showIngredients}
                                >
                                    Basic Ingredients
                                    {showIngredients ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                                </button>
                                {showIngredients && (
                                    <div className="p-3 pt-0 text-sm text-[#667085] leading-relaxed">
                                        {item.ingredients && item.ingredients.length > 0
                                            ? item.ingredients.join(', ')
                                            : "No ingredients listed."}
                                    </div>
                                )}
                            </div>

                            {/* Healthy Ingredients */}
                            <div className="bg-[#F9FAFB] rounded-lg overflow-hidden">
                                <button
                                    onClick={() => setShowHealthyIngredients(!showHealthyIngredients)}
                                    className="w-full flex items-center justify-between p-3 text-sm font-semibold text-[#101828] hover:bg-gray-100 transition-colors"
                                    aria-expanded={showHealthyIngredients}
                                >
                                    Healthy Ingredients
                                    {showHealthyIngredients ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                                </button>
                                {showHealthyIngredients && (
                                    <div className="p-3 pt-0 text-sm text-[#667085] leading-relaxed">
                                        {item.healthyIngredients && item.healthyIngredients.length > 0
                                            ? item.healthyIngredients.join(', ')
                                            : "No healthy ingredients listed."}
                                    </div>
                                )}
                            </div>
                        </div>

                    </div>
                </div>

                {/* Footer */}
                <div className="p-4 border-t border-gray-100 flex justify-end">
                    <button
                        onClick={onClose}
                        className="px-6 py-2.5 bg-white border border-orange-500 text-orange-500 font-bold rounded-xl hover:bg-orange-50 transition-colors"
                    >
                        Close
                    </button>
                </div>

            </div>
        </div>
    )
}

export default MenuItemDetailModal
