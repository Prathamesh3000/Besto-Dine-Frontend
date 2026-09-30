import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion as Motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { MapPin, Phone, X, Search } from 'lucide-react';

/**
 * Bottom sheet asking which branch the visitor is ordering from — the
 * same choice (and card layout) as BranchSelection's branch picker, shown
 * in place when a landing-page action needs a branch the URL didn't name.
 */
const BranchPickerSheet = ({ open, restaurantName = '', branches = [], onPick, onClose }) => {
    const { t } = useTranslation();
    const [selectedId, setSelectedId] = useState(null);
    const [query, setQuery] = useState('');

    useEffect(() => {
        if (!open) return undefined;
        const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [open, onClose]);

    const q = query.trim().toLowerCase();
    const filtered = q
        ? branches.filter(b => [b.name, b.city, b.addressLine1].some(v => String(v || '').toLowerCase().includes(q)))
        : branches;
    const selected = branches.find(b => b._id === selectedId);

    return (
        <AnimatePresence>
            {open && (
                <Motion.div
                    className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                >
                    <button type="button" aria-label={t('common.cancel', 'Cancel')} className="absolute inset-0 bg-black/40" onClick={onClose} />
                    <Motion.div
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="branch-picker-title"
                        className="relative w-full sm:max-w-md max-h-[85vh] flex flex-col bg-white rounded-t-[28px] sm:rounded-[28px] shadow-2xl"
                        initial={{ y: 40, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        exit={{ y: 40, opacity: 0 }}
                        transition={{ type: 'spring', stiffness: 380, damping: 34 }}
                    >
                        <div className="flex items-start justify-between gap-3 px-5 pt-5 pb-3">
                            <div>
                                <h2 id="branch-picker-title" className="text-[18px] font-bold text-[#101828] font-nunito">
                                    {t('restaurant_landing.choose_branch', 'Choose a branch')}
                                </h2>
                                <p className="text-[13px] text-[#667085] font-varela mt-0.5">
                                    {t('restaurant_landing.choose_branch_hint', '{{name}} has {{count}} locations — pick the one you\'re visiting.', { name: restaurantName, count: branches.length })}
                                </p>
                            </div>
                            <button type="button" onClick={onClose} aria-label={t('common.cancel', 'Cancel')} className="p-2 -mr-2 rounded-xl text-[#667085] hover:bg-[#F9FAFB]">
                                <X size={18} />
                            </button>
                        </div>

                        {branches.length >= 4 && (
                            <div className="px-5 pb-3"><div className="relative">
                                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#C4C4C4]" />
                                <input
                                    type="text"
                                    value={query}
                                    onChange={(e) => setQuery(e.target.value)}
                                    placeholder={t('restaurant_landing.search_branches', 'Search by name or area…')}
                                    className="w-full pl-9 pr-3 py-2.5 bg-[#F9FAFB] border border-[#F2F4F7] rounded-xl text-[14px] font-varela focus:outline-none focus:border-[var(--accent)]"
                                />
                            </div></div>
                        )}

                        <div className="flex-1 overflow-y-auto px-5 space-y-2.5 pb-3">
                            {filtered.map((b) => {
                                const active = b._id === selectedId;
                                const place = [b.addressLine1, b.addressLine2, b.city].map(p => String(p || '').trim()).filter(Boolean).join(', ');
                                return (
                                    <button
                                        key={b._id}
                                        type="button"
                                        onClick={() => setSelectedId(b._id)}
                                        aria-pressed={active}
                                        className={`w-full text-left p-3.5 rounded-2xl border-2 transition-colors flex items-start gap-3 ${active
                                            ? 'border-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_7%,white)]'
                                            : 'border-[#F2F4F7] bg-white hover:border-[color-mix(in_srgb,var(--accent)_30%,white)]'}`}
                                    >
                                        <span className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 font-bold font-nunito ${active
                                            ? 'bg-[var(--accent)] text-[var(--accent-fg)]'
                                            : 'bg-[color-mix(in_srgb,var(--accent)_12%,white)] text-[var(--accent)]'}`}>
                                            {b.name?.[0]?.toUpperCase() || 'B'}
                                        </span>
                                        <span className="flex-1 min-w-0">
                                            <span className="block text-[15px] font-bold text-[#101828] font-nunito break-words">{b.name}</span>
                                            {place && (
                                                <span className="flex items-start gap-1 mt-0.5 text-[12px] text-[#667085] font-varela">
                                                    <MapPin size={11} className="shrink-0 mt-[3px]" />
                                                    <span className="break-words">{place}</span>
                                                </span>
                                            )}
                                            {b.contactPhone && (
                                                <span className="flex items-center gap-1 mt-0.5 text-[11px] text-[#98A2B3] font-varela">
                                                    <Phone size={10} className="shrink-0" />
                                                    {b.contactPhone}
                                                </span>
                                            )}
                                        </span>
                                    </button>
                                );
                            })}
                            {filtered.length === 0 && (
                                <p className="py-8 text-center text-[14px] text-[#98A2B3] font-varela">
                                    {t('restaurant_landing.no_branch_match', 'No branches match your search')}
                                </p>
                            )}
                        </div>

                        <div className="px-5 pt-3 pb-5 border-t border-[#F2F4F7]">
                            <button
                                type="button"
                                disabled={!selected}
                                onClick={() => selected && onPick?.(selected)}
                                className="w-full py-3.5 rounded-2xl font-bold text-[15px] font-nunito bg-[var(--accent)] text-[var(--accent-fg)] disabled:opacity-40 active:scale-[0.98] transition-all"
                            >
                                {t('restaurant_landing.continue', 'Continue')}
                            </button>
                        </div>
                    </Motion.div>
                </Motion.div>
            )}
        </AnimatePresence>
    );
};

export default BranchPickerSheet;
