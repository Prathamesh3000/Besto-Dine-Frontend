import React from 'react'
import { Edit2, Eye, Star, Clock, Trash2 } from 'lucide-react'
import ToggleSwitch from '../../../Components/Common/ToggleSwitch'
import VegBadge from '../../../Components/Common/VegBadge'
import { FALLBACK_IMAGE } from '../../../utils/image'

const ComboCard = ({ item, onView, onToggle, onEdit, onDelete, viewMode = 'grid', serialNumber }) => {

    // ── Normalise real backend fields ────────────────────────────────────────
    const image      = item.images?.[0] || item.image || FALLBACK_IMAGE
    const isVeg      = item.vegType === 'veg'
    const isVisible  = item.status === 'active'
    const isDraft    = item.status === 'draft'
    const timeRange  = (item.startTime && item.endTime)
        ? `${item.startTime} - ${item.endTime}`
        : item.timeRange || '—'
    const normalCategories = (item.categories || []).map(cat => ({
        name:  cat.name,
        count: cat.count ?? cat.items?.length ?? 0,
    }))
    const savings = item.savings ?? (item.originalPrice ? item.originalPrice - item.price : 0)

    // List View
    if (viewMode === 'list') {
        return (
            <div className="grid grid-cols-[60px_1fr_2fr_1.2fr_120px_150px] gap-4 items-center py-3 px-4 border-b border-gray-100 hover:bg-gray-50/50 transition-colors font-manrope">
                {/* Sr No */}
                <div className="text-[14px] font-semibold text-[#1A181B]">
                    {String(serialNumber).padStart(2, '0')}
                </div>

                {/* Combo Name + Image + Time */}
                <div className="flex items-center gap-3">
                    <VegBadge isVeg={isVeg} size="sm" className="flex-shrink-0" />

                    <img
                        src={image}
                        alt={item.name}
                        loading="lazy"
                        className="w-12 h-12 rounded-lg object-cover object-center flex-shrink-0"
                        onError={(e) => { e.target.onerror = null; e.target.src = FALLBACK_IMAGE; }}
                    />
                    <div>
                        <h3 className="text-[14px] font-bold text-[#1A181B] line-clamp-1">{item.name}</h3>
                        <div className="flex items-center gap-1 mt-0.5">
                            <Clock size={12} className="text-[#667085]" />
                            <span className="text-[12px] text-[#667085]">{timeRange}</span>
                        </div>
                    </div>
                    {item.rating && (
                        <div className="flex items-center gap-0.5 ml-2">
                            <Star size={13} className="text-[#FACC15] fill-[#FACC15]" />
                            <span className="text-[13px] font-semibold text-[#344054]">{item.rating}</span>
                        </div>
                    )}
                </div>

                {/* Food Category */}
                <div className="flex flex-wrap gap-x-2 gap-y-1 text-[12px] text-[#667085]">
                    {normalCategories.map((cat, idx) => (
                        <span key={idx}>
                            • {cat.name} ({cat.count})
                        </span>
                    ))}
                </div>

                {/* Size & Price */}
                <div>
                    <p className="text-[15px] font-semibold text-[#1A181B]">₹{item.price}</p>
                    <p className="text-[11px] font-medium text-[#05A22C]">Saves ₹{savings}</p>
                </div>

                {/* Status */}
                <div className="flex items-center justify-center">
                    {isDraft ? (
                        <span className="px-3 py-1 bg-[#FEF3C7] text-[#B45309] text-[12px] font-semibold rounded-lg border border-[#FDE68A]">Draft</span>
                    ) : isVisible ? (
                        <span className="px-3 py-1 bg-[#ECFDF3] text-[#027A48] text-[12px] font-semibold rounded-lg border border-[#D1FADF]">Active</span>
                    ) : (
                        <span className="px-3 py-1 bg-[#FEF2F2] text-[#DC2626] text-[12px] font-semibold rounded-lg border border-[#FECACA]">Inactive</span>
                    )}
                </div>

                {/* Actions */}
                <div className="flex items-center justify-end gap-3">
                    <ToggleSwitch
                        checked={isVisible}
                        onChange={() => onToggle?.(item)}
                        ariaLabel={`Toggle visibility for ${item.name}`}
                    />
                    <button onClick={() => onEdit?.(item)} className="text-[#98A2B3] hover:text-[#475467] transition-colors" aria-label={`Edit ${item.name}`}>
                        <Edit2 size={18} />
                    </button>
                    <button onClick={() => onView?.(item)} className="text-[#98A2B3] hover:text-[#344054] transition-colors" aria-label={`View details for ${item.name}`}>
                        <Eye size={18} />
                    </button>
                    {onDelete && (
                        <button onClick={() => onDelete(item)} className="text-[#98A2B3] hover:text-red-500 transition-colors" aria-label={`Delete ${item.name}`}>
                            <Trash2 size={18} />
                        </button>
                    )}
                </div>
            </div>
        )
    }

    // Grid View
    return (
        <div className={`rounded-2xl border border-gray-100 overflow-hidden transition-all duration-300 flex flex-col font-manrope ${!isVisible ? 'bg-white opacity-70' : isDraft ? 'bg-[#FFFDF5]' : 'bg-white'} ${isVisible ? 'shadow-[0px_2px_8px_0px_#00000014] hover:-translate-y-1 hover:shadow-[0px_8px_16px_0px_#00000029]' : ''}`}>
            {/* Image Section */}
            <div className="relative h-[200px]">
                <div className="relative h-full rounded-2xl overflow-hidden">
                    <img
                        src={image}
                        alt={item.name}
                        loading="lazy"
                        className="w-full h-full object-cover object-center"
                        onError={(e) => { e.target.onerror = null; e.target.src = FALLBACK_IMAGE; }}
                    />
                    {/* Gradient overlay */}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent"></div>

                    {/* Veg/Non-veg indicator */}
                    <div className="absolute top-3 left-3 z-20">
                        <VegBadge isVeg={isVeg} className="backdrop-blur-sm bg-white/90" />
                    </div>

                    {/* Edit Button */}
                    <button
                        onClick={() => onEdit?.(item)}
                        className="absolute top-3 right-3 w-9 h-9 bg-gray-600/40 rounded-[4px] flex items-center justify-center hover:bg-orange-500 hover:text-white transition-colors p-2 z-20"
                        style={{ boxShadow: '0px 2px 8px 0px #00000014', backdropFilter: 'blur(20px)' }}
                        aria-label={`Edit ${item.name}`}
                    >
                        <Edit2 size={16} className="text-white" />
                    </button>

                    {/* Bottom overlay: Combo Name + Rating */}
                    <div
                        className="absolute bottom-0 left-0 right-0 flex items-center justify-between px-3 py-3 z-20 rounded-b-xl backdrop-blur-[4px]"
                        style={{ background: 'linear-gradient(0deg, rgba(0, 0, 0, 0.32) 0%, rgba(255, 255, 255, 0.16) 100%)' }}
                    >
                        <h3 className="text-white text-[15px] font-bold leading-tight line-clamp-1">{item.name}</h3>

                        {isDraft ? (
                            <span className="px-3 py-1 bg-[#FEF3C7] text-[#B45309] text-xs font-semibold rounded-lg border border-[#FDE68A] whitespace-nowrap">Draft</span>
                        ) : item.rating ? (
                            <div className="flex items-center gap-1 whitespace-nowrap">
                                <Star size={14} className="text-[#FACC15] fill-[#FACC15]" />
                                <span className="text-white text-[15px] font-semibold">{item.rating}</span>
                            </div>
                        ) : null}
                    </div>
                </div>
            </div>

            {/* Info Row: Time Range + Eye + Toggle */}
            <div className="px-4 pt-3 flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-[#667085]">
                    <Clock size={14} />
                    <span className="text-[12px] font-medium">{timeRange}</span>
                </div>
                <div className="flex items-center gap-3">
                    <button onClick={() => onView?.(item)} className="text-[#98A2B3] hover:text-[#344054] transition-colors" aria-label={`View details for ${item.name}`}>
                        <Eye size={20} />
                    </button>
                    <ToggleSwitch
                        checked={isVisible}
                        onChange={() => onToggle?.(item)}
                        ariaLabel={`Toggle visibility for ${item.name}`}
                    />
                    {onDelete && (
                        <button onClick={() => onDelete(item)} title="Delete combo" className="text-[#98A2B3] hover:text-red-500 transition-colors" aria-label={`Delete ${item.name}`}>
                            <Trash2 size={19} />
                        </button>
                    )}
                </div>
            </div>

            {/* Description */}
            <div className="px-4 pt-2">
                <p className="text-[12px] text-[#667085] font-medium leading-[18px] line-clamp-2">{item.description}</p>
            </div>

            {/* Food Categories */}
            <div className="px-4 pt-3 pb-3 bg-[#FBFAF9] mx-4 my-3 rounded-lg">
                <p className="text-[11px] text-[#98A2B3] font-medium mb-1.5">Includes {normalCategories.length} food categories:</p>
                <div className="flex flex-wrap gap-x-2 gap-y-1">
                    {normalCategories.slice(0, 5).map((cat, idx) => (
                        <span key={idx} className="text-[11px] text-[#344054] font-medium">
                            • {cat.name} ({cat.count})
                        </span>
                    ))}
                </div>
            </div>

            {/* Pricing */}
            <div className="px-4 pt-3 pb-4 mt-auto">
                <div className="flex items-baseline gap-2">
                    <span className="text-[20px] font-bold text-[#1A181B]">₹{item.price}</span>
                    {item.originalPrice > 0 && (
                        <span className="text-[13px] text-[#98A2B3] line-through">₹{item.originalPrice}</span>
                    )}
                </div>
                {savings > 0 && (
                    <p className="text-[12px] text-[#22C55E] font-semibold mt-0.5">Saves ₹{savings}</p>
                )}
            </div>
        </div>
    )
}

export default ComboCard
