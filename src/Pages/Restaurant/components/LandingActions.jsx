import React from 'react';
import { useTranslation } from 'react-i18next';
import { UtensilsCrossed, ShoppingBag, CalendarDays, QrCode, Loader2 } from 'lucide-react';

/**
 * Primary calls to action: View Menu (always, unless the API turns it
 * off), Order Takeaway and Book a Table (only when the restaurant offers
 * them), plus the dine-in hint — at the table, the QR code is the way in.
 */
const LandingActions = ({ actions = {}, busyAction = null, onAction }) => {
    const { t } = useTranslation();
    const showMenu = actions.menu !== false;
    const secondary = [
        actions.takeaway && { key: 'takeaway', icon: ShoppingBag, label: t('restaurant_landing.order_takeaway', 'Order Takeaway') },
        actions.booking && { key: 'booking', icon: CalendarDays, label: t('restaurant_landing.book_table', 'Book a Table') },
    ].filter(Boolean);

    const spinner = <Loader2 size={17} className="animate-spin" aria-hidden="true" />;

    return (
        <div className="space-y-2.5">
            {showMenu && (
                <button
                    type="button"
                    onClick={() => onAction('menu')}
                    disabled={Boolean(busyAction)}
                    className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl font-bold text-[15px] font-nunito bg-[var(--accent)] text-[var(--accent-fg)] shadow-lg shadow-[color-mix(in_srgb,var(--accent)_25%,transparent)] active:scale-[0.98] transition-all disabled:opacity-70"
                >
                    {busyAction === 'menu' ? spinner : <UtensilsCrossed size={17} strokeWidth={2.4} />}
                    {t('restaurant_landing.view_menu', 'View Menu')}
                </button>
            )}
            {secondary.length > 0 && (
                <div className={`grid gap-2.5 ${secondary.length > 1 ? 'grid-cols-2' : 'grid-cols-1'}`}>
                    {secondary.map(({ key, icon, label }) => { const Icon = icon; return (
                        <button
                            key={key}
                            type="button"
                            onClick={() => onAction(key)}
                            disabled={Boolean(busyAction)}
                            className="flex items-center justify-center gap-2 py-3 px-3 rounded-2xl font-semibold text-[14px] font-nunito border-2 border-[color-mix(in_srgb,var(--accent)_35%,white)] text-[var(--accent)] bg-white hover:bg-[color-mix(in_srgb,var(--accent)_6%,white)] active:scale-[0.98] transition-all disabled:opacity-70"
                        >
                            {busyAction === key ? spinner : <Icon size={16} strokeWidth={2.4} />}
                            <span className="truncate">{label}</span>
                        </button>
                    ); })}
                </div>
            )}
            <div className="flex items-center gap-3 px-3.5 py-3 rounded-2xl bg-[#F9FAFB] border border-[#F2F4F7]">
                <span className="w-9 h-9 rounded-xl bg-white border border-[#F2F4F7] flex items-center justify-center shrink-0 text-[#101828]">
                    <QrCode size={18} />
                </span>
                <p className="text-[13px] leading-[18px] text-[#475467] font-varela">
                    <span className="font-semibold text-[#101828] font-nunito">{t('restaurant_landing.dine_in_title', 'Dining in?')}</span>{' '}
                    {t('restaurant_landing.dine_in_hint', 'Scan the QR code on your table.')}
                </p>
            </div>
        </div>
    );
};

export default LandingActions;
