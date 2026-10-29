import React from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Minus,
  Plus,
  ChevronRight,
  CircleCheck,
  SlidersHorizontal,
  Heart,
  Trash2,
} from "lucide-react";
import { useFavorites } from "../../../utils/favorites";
import { formatPrice } from "../../../utils/pricing";
import { realImage, hideBrokenImage } from "../../../utils/image";
import { lineUnitPrice, lineTotal as cartLineTotal } from "../../../utils/cart";

export const HealthCartItem = ({
  item,
  quantity,
  onIncrease,
  onDecrease,
  onRemove,
  onCustomize,
  onViewDetails,
  onAddInstructions,
  onRemoveInstructions,
  isInstructionsExpanded,
  onToggleInstructions,
}) => {
  // Per-device favourites — same heart the Home cards / favourites use.
  const { has: hasFavorite, toggle: toggleFavorite } = useFavorites();
  const favId = item.id || item._id;
  const isFavorited = hasFavorite(favId);

  // Check if item has sizes or toppings (for showing Customize button)
  const hasSizesOrToppings =
    (item.selectedToppings && item.selectedToppings.length > 0) ||
    (item.selectedSizes && item.selectedSizes.length > 0);

  // Only offer "Customize" when the item actually has something to
  // customize. The cart-item shape differs by add-path, so check every
  // signal that means "this menu item exposes sizes/toppings":
  //   • hasCustomization — stamped at add time by the detail screens
  //   • raw sizes[] / toppings[] — carried from the menu blob (Home/quick-add)
  //   • already-selected sizes/toppings on this line
  // Plain items (Dal Tadka, a starter with no options) match none of
  // these, so the button stays hidden — no confusing dead button.
  const canCustomize =
    Boolean(item.hasCustomization) ||
    (Array.isArray(item.sizes) && item.sizes.length > 0) ||
    (Array.isArray(item.toppings) && item.toppings.length > 0) ||
    hasSizesOrToppings;

  // Per-unit price and the line total (unit × quantity) shown in cart.
  // Shared line maths (utils/cart) — same as the CartContext totals.
  const unitPrice = lineUnitPrice(item);
  const lineTotal = cartLineTotal({ unitPrice, quantity });

  // Selected customization chips. Prefer the canonical selectedSizes/
  // selectedToppings arrays; fall back to the legacy `size` string so a
  // line added before the canonical keys existed still shows its size.
  // "Regular" is the no-size default ProductDetails writes — drop it so it
  // doesn't read as a real choice on plain items.
  const sizeChips = (
    item.selectedSizes && item.selectedSizes.length > 0
      ? item.selectedSizes.map((s) => s.name)
      : (item.size ? [item.size] : [])
  ).filter((n) => n && String(n).toLowerCase() !== "regular");
  // A line is "customized via a detail screen" (so its `toppings` array
  // holds the SELECTED toppings) when it carries any of these markers.
  // A raw quick-add line has none of them — its `toppings` would be the
  // menu's AVAILABLE toppings, which we must NOT show as if chosen.
  const isCustomizedLine =
    typeof item.size === "string" ||
    Array.isArray(item.selectedSizes) ||
    Array.isArray(item.selectedToppings);
  const toppingChips =
    item.selectedToppings && item.selectedToppings.length > 0
      ? item.selectedToppings.map((t) => t.name)
      : (isCustomizedLine && Array.isArray(item.toppings)
          ? item.toppings.map((t) => t?.name).filter(Boolean)
          : []);
  const hasChips = sizeChips.length > 0 || toppingChips.length > 0;

  // Portion suffix (e.g. "· 500 ml") shown after the size name — but ONLY
  // for weight/volume units where the amount adds real info. For count
  // units (plate, pieces, bowl…) the size name already says it, so a
  // "Half Plate · 4plate" / "Medium · 1pieces" suffix is just confusing.
  const MEASUREMENT_UNITS = ["gm", "g", "kg", "ml", "liter", "litre"];
  const sizeUnit = String(item.unit || "").toLowerCase();
  const portionSuffix =
    item.sizeQuantity && MEASUREMENT_UNITS.includes(sizeUnit)
      ? ` · ${item.sizeQuantity} ${item.unit}`
      : "";

  const hasInstructions =
    item.instructions && item.instructions.trim() !== "";

  return (
    // Whole card opens the item's detail popup. Interactive controls inside
    // (customize, qty +/-, remove, instructions) stopPropagation so they act
    // on their own without also triggering the detail view.
    <div
      onClick={onViewDetails}
      role="button"
      className="bg-white rounded-[20px] p-3 sm:p-4 shadow-[0_2px_12px_rgba(0,0,0,0.04)] border border-[#F1F1F3] mb-3 transition-all duration-300 cursor-pointer active:scale-[0.99]"
    >
      <div className="flex flex-row gap-3.5 sm:gap-4">
        {/* Image - always on left */}
        <div className="relative w-[104px] h-[104px] sm:w-[120px] sm:h-[120px] shrink-0 rounded-[16px] overflow-hidden bg-gray-50">
          {realImage(item.image) ? (
            <img
              src={realImage(item.image)}
              alt={item.title}
              className="w-full h-full object-cover"
              onError={hideBrokenImage}
            />
          ) : (
            <div className="w-full h-full bg-gray-50" aria-hidden="true" />
          )}
          {item.isVeg !== undefined && (
            <div className="absolute top-2 left-2 z-10">
              <div
                className={`w-[18px] h-[18px] border-2 ${item.isVeg ? "border-[#00B050]" : "border-[#E31E24]"} rounded-[3px] bg-white flex items-center justify-center`}
              >
                <div
                  className={`w-[9px] h-[9px] ${item.isVeg ? "bg-[#00B050]" : "bg-[#E31E24]"} rounded-full`}
                />
              </div>
            </div>
          )}
        </div>

        {/* Content - fills remaining width */}
        <div className="flex-1 min-w-0 flex flex-col justify-between py-1">
          {/* Title + remove */}
          <div className="flex justify-between items-start gap-2">
            <h3 className="font-bold text-[#1A181B] font-nunito text-[16px] sm:text-[18px] leading-[1.25] tracking-[-0.01em] pr-2 line-clamp-2">
              {item.title}
            </h3>
            {/* Favourite (heart) in the title row's right slot — replaces the
                old ✕ remove. No remove button needed: dropping quantity to 0
                via the stepper auto-removes the line. stopPropagation so the
                tap toggles the favourite without opening the detail popup. */}
            {favId && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); toggleFavorite(favId); }}
                aria-label={isFavorited ? "Remove from favourites" : "Add to favourites"}
                aria-pressed={isFavorited}
                className="shrink-0 w-7 h-7 -mt-0.5 -mr-1 rounded-full hover:bg-[#FFF1F2] active:scale-90 flex items-center justify-center transition-all"
              >
                <Heart
                  size={18}
                  strokeWidth={2}
                  className={isFavorited ? "text-[#E11D48] fill-[#E11D48]" : "text-[#B6AEB8]"}
                />
              </button>
            )}
          </div>

          {/* Customize (text + chevron) & selected chips */}
          <div className="flex flex-col gap-2 mt-1.5">
            {canCustomize && (
              <button
                onClick={(e) => { e.stopPropagation(); onCustomize(); }}
                className="w-fit flex items-center gap-0.5 text-[#645E66] active:opacity-70 transition-opacity"
              >
                <span className="text-[14px] font-semibold font-varela">
                  Customize
                </span>
                <ChevronRight size={16} className="text-[#9A8FA0] mt-px" />
              </button>
            )}

            {hasChips && (
              <div className="flex gap-1.5 overflow-x-auto scrollbar-hide">
                {sizeChips.map((name, i) => (
                  <span
                    key={`size-${i}`}
                    className="text-[12px] px-3 py-1 rounded-full bg-[#F7F0FA] text-[#7D7380] whitespace-nowrap font-varela"
                  >
                    {name}{portionSuffix}
                  </span>
                ))}
                {toppingChips.map((name, i) => (
                  <span
                    key={`top-${i}`}
                    className="text-[12px] px-3 py-1 rounded-full bg-[#F7F0FA] text-[#7D7380] whitespace-nowrap font-varela"
                  >
                    {name}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Price + Qty — show the line total (unit × quantity); the
              per-unit breakdown sits underneath once qty > 1 so the
              number always matches what this line adds to the bill. */}
          <div className="flex items-center justify-between mt-2 gap-2">
            <div className="flex flex-col">
              <span className="text-[21px] sm:text-[22px] leading-[26px] font-nunito font-bold text-[#1A181B] tabular-nums">
                ₹{formatPrice(lineTotal)}
              </span>
              {quantity > 1 && (
                <span className="text-[11px] leading-[14px] font-varela text-[#8D848F] tabular-nums">
                  ₹{formatPrice(unitPrice)} × {quantity}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1 font-nunito font-semibold bg-[#FAFAFA] rounded-xl px-1.5 py-1.5 border border-[#EFEFEF]">
              <button
                onClick={(e) => { e.stopPropagation(); onDecrease(); }}
                className="w-7 h-7 flex items-center justify-center text-[#333333] rounded-lg active:scale-90 active:bg-gray-100 transition-all"
              >
                <Minus size={15} />
              </button>
              <span className="text-[#1A181B] min-w-[28px] text-center text-[15px] tabular-nums">
                {quantity}
              </span>
              <button
                onClick={(e) => { e.stopPropagation(); onIncrease(); }}
                className="w-7 h-7 flex items-center justify-center text-[#333333] rounded-lg active:scale-90 active:bg-gray-100 transition-all"
              >
                <Plus size={15} />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Special Instructions Section (Now Full Width) */}
      <div className="mt-3 pt-3 flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          {hasInstructions ? (
            <div className="flex items-center justify-between w-full">
              <div className="flex items-center gap-[6px]">
                <CircleCheck size={16} fill="#007AFF" stroke="white" strokeWidth={2.5} color='#007AFF' />
                <span className="text-[12px] font-[400] text-[#007AFF] font-nunito">Special Instructions Applied</span>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={(e) => { e.stopPropagation(); onToggleInstructions(); }}
                  className="text-[14px] font-semibold text-[#FF7A00] active:opacity-70 transition-opacity font-varela"
                >
                  {isInstructionsExpanded ? 'Hide Details' : 'View Details'}
                </button>
                {onRemoveInstructions && (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onRemoveInstructions(); }}
                    aria-label="Remove special instructions"
                    className="w-7 h-7 rounded-full flex items-center justify-center text-gray-400 hover:text-red-500 hover:bg-red-50 active:scale-90 transition-all"
                  >
                    <Trash2 size={15} strokeWidth={2} />
                  </button>
                )}
              </div>
            </div>
          ) : (
            <button
              onClick={(e) => { e.stopPropagation(); onAddInstructions(); }}
              className="flex items-center gap-2.5 text-[#4A4A4A] group w-full"
            >
              <div className="w-7 h-7 rounded-full bg-[#F4ECF8] flex items-center justify-center text-[#7C3AED] group-active:scale-90 transition-transform flex-shrink-0">
                <Plus size={15} strokeWidth={3} />
              </div>
              <span className="text-[15px] font-semibold font-nunito text-[#1A181B]">Add Special Instructions</span>
            </button>
          )}
        </div>

        {/* Expanded Instructions View */}
        <AnimatePresence>
          {hasInstructions && isInstructionsExpanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="bg-[#F8F9FF] rounded-[20px] p-4 flex items-center justify-between border border-[#E8EEFF]">
                <p className="text-[13px] text-[#4A4A4A] flex-1 pr-4 line-clamp-2 font-varela">
                  {item.instructions}
                </p>
                <button
                  onClick={(e) => { e.stopPropagation(); onAddInstructions(); }}
                  className="flex items-center gap-1 text-[#FF7A00] font-bold text-[14px] active:scale-95 transition-transform whitespace-nowrap font-nunito"
                >
                  <SlidersHorizontal size={14} strokeWidth={2.5} /> Edit
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

export default HealthCartItem;
