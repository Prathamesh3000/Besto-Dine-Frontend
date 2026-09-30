import React from 'react';
import { Clock } from 'lucide-react';

/**
 * ChefItemCard — single line item inside an order (admin-themed).
 *
 * Layout (one item, one horizontal row):
 *
 *   ┌──┬──────────────────────────────────────┬──────┐
 *   │×2│ Margherita Pizza               ●veg │  8m  │
 *   │  │ ↳ no olives, extra cheese            │      │
 *   └──┴──────────────────────────────────────┴──────┘
 *
 * The quantity is the leftmost anchor, the dish name is the dominant
 * text, the veg/non-veg marker sits on the right of the name, and
 * any special instructions or add-ons hang INDENTED underneath the
 * name so they're visually attached to the item they belong to.
 */

const getEstimatedTime = (item) => {
    // Backend ships the frozen per-item snapshot as prepTimeMinutes;
    // `prepTime` is the legacy name kept for older payloads.
    const mins = item.prepTimeMinutes ?? item.prepTime;
    if (typeof mins === 'number' && mins > 0) return `${mins}m`;
    const name = item.name?.toLowerCase() || '';
    if (name.includes('naan') || name.includes('roti') || name.includes('bread')) return '8m';
    if (name.includes('biryani') || name.includes('curry')) return '25m';
    return '15m';
};

const ChefItemCard = ({ item }) => {
    const estimatedTime = getEstimatedTime(item);
    const isVeg = item.vegType === 'veg';
    const hasInstructions = !!item.instructions;
    // Size + topping snapshot. Rendered so two lines of the same dish
    // with different customisations are distinguishable on the KDS.
    const sizeNames = (item.selectedSizes || []).map((s) => s?.name).filter(Boolean);
    const toppingNames = (item.selectedToppings || []).map((t) => t?.name).filter(Boolean);
    const variantLabel = item.variant || sizeNames.join(', ');
    const hasAddons = (item.addons && item.addons.length > 0) || toppingNames.length > 0;
    const addonsText = item.addons && item.addons.length > 0
        ? item.addons.map(a => `${a.name} ×${a.quantity}`).join(', ')
        : toppingNames.join(', ');
    const isCounterItem = item.prepStation === 'counter';
    const hasNotes = hasInstructions || hasAddons;

    return (
        <div className="flex items-start gap-3 sm:gap-4 py-3">
            {/* ── Quantity ─────────────────────────────────── */}
            <div className="shrink-0 w-10 h-10 sm:w-11 sm:h-11 rounded-lg bg-[#FAF5F0] ring-1 ring-gray-200 flex items-center justify-center">
                <span className="text-base sm:text-lg font-black text-gray-900 tabular-nums leading-none">
                    ×{item.quantity}
                </span>
            </div>

            {/* ── Name + meta ──────────────────────────────── */}
            <div className="flex-1 min-w-0">
                <div className="flex items-start gap-2">
                    <h4 className="flex-1 min-w-0 text-base sm:text-lg font-bold text-gray-900 leading-tight tracking-tight wrap-break-word">
                        {item.name}
                        {variantLabel && (
                            <span className="text-[#7D7380] font-semibold text-sm ml-1.5">
                                ({variantLabel})
                            </span>
                        )}
                        {/* Counter items (bottled drinks etc.) ride along on a
                            mixed order but aren't cooked — flag them so the
                            chef doesn't hunt for a recipe. */}
                        {isCounterItem && (
                            <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded-md bg-gray-100 text-[#7D7380] text-[10px] font-bold uppercase tracking-wide align-middle">
                                Counter
                            </span>
                        )}
                        {/* "+N added later" hint — set when the same item
                            appears in both the original round and a later
                            append. ChefOrderCard merges them so chef sees
                            one consolidated qty (×4) but still knows part
                            of it (+2) is a fresh addition. */}
                        {Number(item.addedLaterQty) > 0 && (
                            <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded-md bg-[#FFF1E2] text-[#B54708] text-[10px] font-bold uppercase tracking-wide align-middle">
                                +{item.addedLaterQty} added later
                            </span>
                        )}
                    </h4>

                    {/* Veg / non-veg dot — small but unmistakable */}
                    {item.vegType && (
                        <div
                            className={`mt-1.5 w-3.5 h-3.5 border-2 rounded-sm flex items-center justify-center shrink-0 ${
                                isVeg ? 'border-emerald-500' : 'border-red-500'
                            }`}
                            aria-label={isVeg ? 'Vegetarian' : 'Non-vegetarian'}
                            title={isVeg ? 'Vegetarian' : 'Non-vegetarian'}
                        >
                            <div
                                className={`w-1.5 h-1.5 rounded-full ${
                                    isVeg ? 'bg-emerald-500' : 'bg-red-500'
                                }`}
                            />
                        </div>
                    )}
                </div>

                {/* Indented sub-notes — visually attached to the item above */}
                {hasNotes && (
                    <div className="mt-2 space-y-1.5">
                        {hasInstructions && (
                            <div className="flex items-start gap-2">
                                <span className="text-amber-600 text-xs font-bold leading-5 shrink-0">↳</span>
                                <p className="text-xs sm:text-[13px] text-amber-800 font-semibold leading-snug wrap-break-word">
                                    {item.instructions}
                                </p>
                            </div>
                        )}
                        {hasAddons && (
                            <div className="flex items-start gap-2">
                                <span className="text-[#FE8301] text-xs font-bold leading-5 shrink-0">+</span>
                                <p className="text-xs sm:text-[13px] text-[#FE8301] font-semibold leading-snug wrap-break-word">
                                    {addonsText}
                                </p>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* ── Prep time — calm, right edge ─────────────── */}
            <div className="shrink-0 flex items-center gap-1 text-[#7D7380] mt-3">
                <Clock size={11} strokeWidth={2.25} />
                <span className="text-[11px] font-bold tabular-nums leading-none">{estimatedTime}</span>
            </div>
        </div>
    );
};

export default ChefItemCard;
