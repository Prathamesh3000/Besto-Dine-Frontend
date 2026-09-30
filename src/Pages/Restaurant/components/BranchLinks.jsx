import React from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ChevronRight, MapPin } from 'lucide-react';

/** Links to each branch's own landing page (/:slug/:branchSlug). */
const BranchLinks = ({ restaurantSlug, branches = [], currentBranchSlug = null }) => {
    const { t } = useTranslation();
    return (
        <ul className="space-y-2">
            {branches.map((b) => {
                const current = currentBranchSlug && b.slug === currentBranchSlug;
                const place = [b.addressLine1, b.city].map(p => String(p || '').trim()).filter(Boolean).join(', ');
                return (
                    <li key={b.slug || b.name}>
                        <Link
                            to={`/${encodeURIComponent(restaurantSlug)}/${encodeURIComponent(b.slug)}`}
                            aria-current={current ? 'page' : undefined}
                            className={`flex items-center gap-3 p-3 rounded-xl border transition-colors ${current
                                ? 'border-[color-mix(in_srgb,var(--accent)_45%,white)] bg-[color-mix(in_srgb,var(--accent)_7%,white)]'
                                : 'border-[#F2F4F7] bg-white hover:border-[color-mix(in_srgb,var(--accent)_30%,white)]'}`}
                        >
                            <span className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 font-bold font-nunito bg-[color-mix(in_srgb,var(--accent)_12%,white)] text-[var(--accent)]">
                                {b.name?.[0]?.toUpperCase() || 'B'}
                            </span>
                            <span className="flex-1 min-w-0">
                                <span className="flex items-center gap-2">
                                    <span className="text-[14px] font-bold text-[#101828] font-nunito truncate">{b.name}</span>
                                    {current && (
                                        <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-[var(--accent)]">
                                            {t('restaurant_landing.this_branch', 'This branch')}
                                        </span>
                                    )}
                                </span>
                                {place && (
                                    <span className="flex items-center gap-1 mt-0.5 text-[12px] text-[#667085] font-varela">
                                        <MapPin size={11} className="shrink-0" />
                                        <span className="truncate">{place}</span>
                                    </span>
                                )}
                            </span>
                            <ChevronRight size={18} className="text-[#98A2B3] shrink-0" />
                        </Link>
                    </li>
                );
            })}
        </ul>
    );
};

export default BranchLinks;
