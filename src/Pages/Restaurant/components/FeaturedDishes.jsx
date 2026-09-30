import React from 'react';
import { useTranslation } from 'react-i18next';
import VegBadge from '../../../Components/Common/VegBadge';
import { resolveImageUrl, sizedImage, handleImageError, FALLBACK_IMAGE } from '../../../utils/image';
import { formatPrice } from './landingUtils';

/** Horizontally scrolling featured-dish cards; tapping one opens it in the menu. */
const FeaturedDishes = ({ items = [], onSelect }) => {
    const { t } = useTranslation();
    if (!items.length) return null;

    return (
        <div className="-mx-5 px-5 flex gap-3 overflow-x-auto snap-x snap-mandatory scrollbar-hide no-scrollbar pb-1">
            {items.map((item) => {
                const base = Number(item.basePrice);
                const final = Number(item.finalPrice ?? item.basePrice);
                const hasOffer = Number.isFinite(base) && Number.isFinite(final) && final < base;
                const img = resolveImageUrl(item.image);
                return (
                    <button
                        key={item._id}
                        type="button"
                        onClick={() => onSelect?.(item)}
                        className="snap-start shrink-0 w-[172px] sm:w-[200px] text-left bg-white rounded-2xl border border-[#F2F4F7] shadow-[0_1px_2px_rgba(16,24,40,0.05)] overflow-hidden active:scale-[0.98] transition-transform"
                    >
                        <div className="relative aspect-[4/3] bg-[#F9FAFB]">
                            <img
                                src={img ? sizedImage(img, { w: 200 }) : FALLBACK_IMAGE}
                                alt={item.name}
                                loading="lazy"
                                decoding="async"
                                onError={handleImageError}
                                className="w-full h-full object-cover"
                            />
                            {item.vegType && (
                                <VegBadge vegType={item.vegType} size="sm" className="absolute top-2 left-2 shadow-sm" />
                            )}
                            {hasOffer && Number(item.offerPercentage) > 0 && (
                                <span className="absolute top-2 right-2 px-2 py-0.5 rounded-full text-[10px] font-bold font-nunito bg-[var(--accent)] text-[var(--accent-fg)]">
                                    {t('restaurant_landing.percent_off', '{{n}}% OFF', { n: Math.round(Number(item.offerPercentage)) })}
                                </span>
                            )}
                        </div>
                        <div className="p-3">
                            <h3 className="text-[14px] font-bold text-[#101828] font-nunito leading-[18px] line-clamp-1">{item.name}</h3>
                            {item.description && (
                                <p className="mt-0.5 text-[12px] leading-[16px] text-[#667085] font-varela line-clamp-2 min-h-[32px]">{item.description}</p>
                            )}
                            <div className="mt-2 flex items-baseline gap-1.5">
                                <span className="text-[14px] font-bold text-[#101828] font-nunito">{formatPrice(final)}</span>
                                {hasOffer && (
                                    <span className="text-[12px] text-[#98A2B3] line-through font-varela">{formatPrice(base)}</span>
                                )}
                            </div>
                        </div>
                    </button>
                );
            })}
        </div>
    );
};

export default FeaturedDishes;
