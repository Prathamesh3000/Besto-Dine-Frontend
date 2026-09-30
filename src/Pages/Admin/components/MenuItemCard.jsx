import React from 'react'
import { Edit2, Eye, Star, Leaf, AlertTriangle } from 'lucide-react'
import ToggleSwitch from '../../../Components/Common/ToggleSwitch'
import VegBadge from '../../../Components/Common/VegBadge'
import { FALLBACK_IMAGE, getItemImage, handleImageError } from '../../../utils/image'

// Visual style + label for an inventory issue on a menu item.
const ISSUE_META = {
  out: { label: 'Out of stock', pill: 'bg-rose-600 text-white', soft: 'bg-rose-50 text-rose-700 border-rose-200', ring: 'border-rose-300' },
  config: { label: 'Recipe issue', pill: 'bg-orange-600 text-white', soft: 'bg-orange-50 text-orange-700 border-orange-200', ring: 'border-orange-300' },
  low: { label: 'Low stock', pill: 'bg-amber-500 text-white', soft: 'bg-amber-50 text-amber-700 border-amber-200', ring: 'border-amber-300' },
}

const MenuItemCard = ({ item, viewMode = 'grid', index, isHealthMode = false, issue = null, onIssueClick, onView, onToggle, onEdit }) => {
  const isVeg = item.vegType === 'veg' || item.isVeg;
  const isVisible = item.status === 'active' || item.isVisible;
  const unitLabel = item.unit ? `/${item.unit}` : '';
  const isDraft = item.status === 'draft' || item.isDraft;
  const itemImage = getItemImage(item);

  // Inventory issue (out / low / config) — drives the card alert badge + ring.
  const issueMeta = issue ? (ISSUE_META[issue.level] || ISSUE_META.low) : null;
  const issueTitle = issue?.reasons?.length ? issue.reasons.join(' · ') : issueMeta?.label;

  // Health Mode surfaces nutrition + the healthLevel badge. We only
  // render the extras when the admin has the toggle on AND the item is
  // actually flagged isHealthy — non-healthy items get a passive
  // "Standard" pill so the admin can spot stragglers in the filtered
  // view at a glance.
  const showHealthInfo = isHealthMode && item.isHealthy;
  const calories = item?.nutritionalInfo?.calories;
  const protein = item?.nutritionalInfo?.protein;
  const healthLevel = item?.healthLevel;
  const healthLevelPillClass = healthLevel === 'High'
    ? 'bg-[#D1FADF] text-[#027A48] border-[#A6F4C5]'
    : healthLevel === 'Medium'
      ? 'bg-[#FEF0C7] text-[#B54708] border-[#FEDF89]'
      : 'bg-[#E0F2FE] text-[#0369A1] border-[#BAE6FD]';

  if (viewMode === 'list') {
    return (
      <div className={`grid grid-cols-[60px_4fr_1.5fr_3fr_1fr_120px] gap-4 px-6 py-3 border-b border-[#EEEEEE] transition-colors items-center font-manrope last:border-none ${issueMeta ? 'bg-rose-50/40 hover:bg-rose-50/70' : isDraft ? 'bg-[#FFFDF5]' : 'bg-white hover:bg-[#F9FAFB]'}`}>

        {/* Sr. No. */}
        <span className="text-sm font-medium text-[#101828] font-manrope">{(index + 1).toString().padStart(2, '0')}</span>

        {/* Item Name */}
        <div className="flex items-center gap-4">
          {/* Veg / Non-Veg badge — colour reflects item.vegType so the
              list view matches the food-safety convention (green = veg,
              red = non-veg). Acts as a row-selection control too. */}
          <label className="relative flex items-center justify-center cursor-pointer">
            <input
              type="checkbox"
              className={`peer appearance-none w-5 h-5 rounded border transition-all cursor-pointer checked:bg-white ${isVeg ? 'border-green-500 checked:border-green-500' : 'border-red-500 checked:border-red-500'}`}
              defaultChecked
              aria-label={`${isVeg ? 'Veg' : 'Non-Veg'} — ${item.name}`}
            />
            <div className={`absolute w-2.5 h-2.5 rounded-full opacity-0 peer-checked:opacity-100 transition-opacity pointer-events-none ${isVeg ? 'bg-green-500' : 'bg-red-500'}`}></div>
          </label>

           {/* Image */}
          <img
            src={itemImage}
            alt={item.name}
            loading="lazy"
            onError={handleImageError}
            className="w-10 h-10 rounded-lg object-cover object-center"
          />

          {/* Name */}
          <h3 className="text-sm font-bold text-[#101828] font-manrope truncate" title={item.name}>{item.name}</h3>

          {/* Inventory issue badge */}
          {issueMeta && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onIssueClick?.(issue) }}
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border whitespace-nowrap hover:brightness-95 transition ${issueMeta.soft}`}
              title={`${issueTitle} — click for details & fix`}
            >
              <AlertTriangle size={10} />
              {issueMeta.label}
            </button>
          )}

          {/* Healthy pill — only when Health Mode is on. Shows the
              healthLevel ("High"/"Medium"/"Low") so admins can sort
              the filtered list by how healthy each row is at a glance. */}
          {showHealthInfo && (
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${healthLevelPillClass}`}>
              <Leaf size={10} />
              {healthLevel || 'Healthy'}
            </span>
          )}
        </div>

        {/* Category & Rating */}
        <div className="flex items-center gap-2">
          <div className="w-[45px] flex-shrink-0">
            {item.rating && (
              <div className="flex items-center gap-1 text-xs font-semibold text-[#344054]">
                <Star size={14} className="text-yellow-400 fill-yellow-400" />
                {item.rating}
              </div>
            )}
          </div>
          <div className="flex flex-col">
            <span className="text-sm font-medium text-[#344054] font-manrope">{item.category?.name || item.category}</span>
            {showHealthInfo && (calories || protein) && (
              <span className="text-[10px] font-medium text-[#475467] font-manrope mt-0.5">
                {calories ? `${calories} kcal` : ''}
                {calories && protein ? ' · ' : ''}
                {protein ? `${protein}g protein` : ''}
              </span>
            )}
          </div>
        </div>

        {/* Size & Price */}
        <div className="flex gap-4">
          {item.sizes && item.sizes.length > 0 ? (
            item.sizes.slice(0, 3).map((size, idx) => (
              <div key={idx} className={`${idx < 2 ? 'border-r border-gray-200 pr-4' : ''}`}>
                <span className="block text-[10px] leading-[14px] font-medium text-[#667085] uppercase">{size.name.charAt(0)}</span>
                <span className="text-xs font-bold text-[#101828]">₹{size.price}{size.quantity ? `/${size.quantity}${item.unit || ''}` : unitLabel}</span>
              </div>
            ))
          ) : (
            <div className="flex flex-col">
              <span className="block text-[10px] leading-[14px] font-medium text-[#667085]">REG</span>
              <span className="text-xs font-bold text-[#101828]">₹{item.basePrice || item.price?.regular || '0'}</span>
            </div>
          )}
        </div>

        {/* Status */}
        <div className="flex justify-center">
          {isDraft ? (
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-[#FFFBEB] text-[#B54708] border border-[#FEDF89]">Draft</span>
          ) : item.status === 'archived' ? (
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600 border border-gray-200">Archived</span>
          ) : (
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-[#ECFDF3] text-[#027A48] border border-[#ABEFC6]">Active</span>
          )}
        </div>

        {/* Action */}
        <div className="flex items-center justify-end gap-3">
          <ToggleSwitch
            size="sm"
            checked={isVisible}
            onChange={(e) => onToggle?.(item, e.target.checked)}
            ariaLabel={`Toggle visibility for ${item.name}`}
          />

          <button
            onClick={() => onEdit?.(item)}
            className="text-[#98A2B3] hover:text-[#475467] transition-colors"
            aria-label={`Edit ${item.name}`}
          >
            <Edit2 size={18} />
          </button>
          <button
            onClick={() => onView?.(item)}
            className="text-[#98A2B3] hover:text-[#475467] transition-colors"
            aria-label={`View details for ${item.name}`}
          >
            <Eye size={18} />
          </button>
        </div>

      </div>
    )
  }

  const priceSizes = item.sizes && item.sizes.length > 0 ? item.sizes.slice(0, 3) : null;

  return (
    <div className={`rounded-2xl border overflow-hidden transition-all duration-300 flex flex-col font-manrope ${issueMeta ? `${issueMeta.ring} border-2` : 'border-gray-100'} ${!isVisible ? 'bg-white' : isDraft ? 'bg-[#FFFDF5]' : 'bg-white'} ${isVisible ? 'shadow-[0px_2px_8px_0px_#00000014] hover:-translate-y-1 hover:shadow-[0px_8px_16px_0px_#00000029]' : ''}`}>
      {/* Image Section */}
      <div className="relative h-45">
        {/* Inventory issue alert — top-center so it clears the veg badge
            (top-left) and rating chip (top-right). */}
        {issueMeta && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onIssueClick?.(issue) }}
            className={`absolute top-2 left-1/2 -translate-x-1/2 z-20 inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold shadow-md hover:brightness-110 transition ${issueMeta.pill}`}
            title={`${issueTitle} — click for details & fix`}
          >
            <AlertTriangle size={11} />
            {issueMeta.label}
          </button>
        )}
        <div className="relative w-full h-full overflow-hidden">
          <img
            src={itemImage}
            alt={item.name}
            loading="lazy"
            onError={handleImageError}
            className="w-full h-full object-cover object-center"
          />
          {/* Disabled Image Overlay */}
          {!isVisible && (
            <div className="absolute inset-0 bg-[#DDDDDDCC] z-10"></div>
          )}
        </div>

        {/* Veg/Non-Veg Indicator */}
        <div className="absolute top-3 left-3">
          <VegBadge vegType={item.vegType} isVeg={isVeg} />
        </div>

        {/* Rating Chip */}
        {item.rating && (
          <div
            className="absolute top-3 right-3 flex items-center gap-1 px-2 py-1 bg-white/95 rounded-md"
            style={{ boxShadow: '0px 2px 6px 0px #00000020', backdropFilter: 'blur(6px)' }}
          >
            <Star size={12} className="text-[#FACC15] fill-[#FACC15]" />
            <span className="text-[11px] font-bold text-[#1A181B] leading-none">{item.rating}</span>
          </div>
        )}

        {/* Edit Button */}
        <button
          onClick={() => onEdit?.(item)}
          className="absolute bottom-3 right-3 w-9 h-9 bg-gray-900/45 rounded-lg flex items-center justify-center hover:bg-orange-500 transition-colors"
          style={{ boxShadow: '0px 2px 8px 0px #00000014', backdropFilter: 'blur(20px)' }}
          aria-label={`Edit ${item.name}`}
        >
          <Edit2 size={16} className="text-white" />
        </button>

        {/* Draft Badge */}
        {isDraft && (
          <span className="absolute bottom-3 left-3 px-2.5 py-1 bg-[#FEF3C7] text-[#B45309] text-[11px] font-semibold rounded-md border border-[#FDE68A]">Draft</span>
        )}

        {/* Healthy Badge (Health Mode only) — sits at the image top-right
            beneath the Rating chip so it doesn't fight the bottom-left
            Draft badge or bottom-right Edit button. Shows the
            healthLevel ("High"/"Medium"/"Low") inline. */}
        {showHealthInfo && !isDraft && (
          <span
            className={`absolute bottom-3 left-3 inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-semibold border ${healthLevelPillClass}`}
            style={{ boxShadow: '0px 2px 6px 0px #00000020', backdropFilter: 'blur(6px)' }}
          >
            <Leaf size={11} />
            Healthy{healthLevel ? ` · ${healthLevel}` : ''}
          </span>
        )}
      </div>

      {/* Content Section */}
      <div className="px-4 pt-3 pb-3 flex-1 flex flex-col gap-3">
        {/* Title + Category */}
        <div className="flex flex-col gap-2 min-w-0">
          <h3 className="text-[15px] font-bold text-[#1A181B] font-manrope line-clamp-1" title={item.name}>
            {item.name}
          </h3>
          <span className="inline-block w-fit max-w-full text-[11px] font-semibold text-[#9A3E9C] font-manrope bg-[#FDF5FF] px-2.5 py-0.5 rounded-full truncate">
            {item.category?.name || item.category}
          </span>
        </div>

        {/* Pricing */}
        <div className="pt-2 border-t border-gray-100">
          <div className="flex items-stretch">
            {priceSizes ? (
              priceSizes.map((size, idx) => (
                <div
                  key={idx}
                  className={`flex flex-col flex-1 min-w-0 ${idx < priceSizes.length - 1 ? 'border-r border-gray-200 pr-2' : ''} ${idx > 0 ? 'pl-2' : ''}`}
                >
                  <span className="text-[10px] font-semibold text-[#667085] uppercase tracking-wider mb-0.5 truncate">{size.name}</span>
                  <span className="text-[13px] font-bold text-[#101828] truncate">₹{size.price}</span>
                </div>
              ))
            ) : (
              <div className="flex flex-col">
                <span className="text-[10px] font-semibold text-[#667085] uppercase tracking-wider mb-0.5">Regular</span>
                <span className="text-[13px] font-bold text-[#101828]">₹{item.basePrice || item.price?.regular || '0'}</span>
              </div>
            )}
          </div>
        </div>

        {/* Nutrition Snippet — only when Health Mode is on. Compact
            single-row of the two most-relevant numbers (calories + protein)
            plus up to two healthTags so the card communicates *why* this
            item earned its healthy badge without bloating the layout. */}
        {showHealthInfo && (calories || protein || (item.healthTags && item.healthTags.length > 0)) && (
          <div className="pt-2 border-t border-gray-100 flex flex-col gap-1.5">
            {(calories || protein) && (
              <div className="flex items-center gap-3 text-[11px] font-semibold text-[#475467]">
                {calories ? (
                  <span>
                    <span className="text-[#101828]">{calories}</span>
                    <span className="text-[#667085] font-medium"> kcal</span>
                  </span>
                ) : null}
                {protein ? (
                  <span>
                    <span className="text-[#101828]">{protein}g</span>
                    <span className="text-[#667085] font-medium"> protein</span>
                  </span>
                ) : null}
              </div>
            )}
            {item.healthTags && item.healthTags.length > 0 && (
              <div className="flex items-center gap-1 flex-wrap">
                {item.healthTags.slice(0, 2).map((tag, idx) => (
                  <span
                    key={idx}
                    className="inline-block px-2 py-0.5 rounded-full text-[10px] font-medium bg-[#ECFDF3] text-[#027A48] border border-[#ABEFC6] truncate max-w-[110px]"
                    title={tag}
                  >
                    {tag}
                  </span>
                ))}
                {item.healthTags.length > 2 && (
                  <span className="text-[10px] font-medium text-[#667085]">+{item.healthTags.length - 2}</span>
                )}
              </div>
            )}
          </div>
        )}

        {/* Actions Footer */}
        <div className="flex items-center justify-between mt-auto pt-2 border-t border-gray-100">
          <button
            onClick={() => onView?.(item)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-[#475467] hover:bg-gray-50 rounded-lg transition-colors text-[12px] font-semibold"
            aria-label={`View details for ${item.name}`}
          >
            <Eye size={16} />
            View
          </button>
          <div className="flex items-center gap-2">
            <span className={`text-[11px] font-semibold ${isVisible ? 'text-[#027A48]' : 'text-[#667085]'}`}>
              {isVisible ? 'Active' : 'Hidden'}
            </span>
            <ToggleSwitch
              size="sm"
              checked={isVisible}
              onChange={(e) => onToggle?.(item, e.target.checked)}
              ariaLabel={`Toggle visibility for ${item.name}`}
            />
          </div>
        </div>
      </div>
    </div>
  )
}

export default MenuItemCard
