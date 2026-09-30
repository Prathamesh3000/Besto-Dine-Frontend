import React from 'react';
import { useTranslation } from 'react-i18next';
import { WEEK_ORDER, formatTime, todayName } from './landingUtils';

/** Weekly opening hours, Monday first, with today highlighted. */
const HoursCard = ({ operatingHours = [] }) => {
    const { t } = useTranslation();
    const today = todayName();
    const byDay = new Map(operatingHours.map(h => [String(h.day || ''), h]));
    const rows = WEEK_ORDER.filter(d => byDay.has(d)).map(d => byDay.get(d));
    // Fall back to the API's own order if the day names don't match ours.
    const list = rows.length ? rows : operatingHours;

    return (
        <ul className="divide-y divide-[#F2F4F7]">
            {list.map((h) => {
                const isToday = h.day === today;
                return (
                    <li
                        key={h.day}
                        className={`flex items-center justify-between gap-3 py-2.5 px-2 -mx-2 rounded-xl text-[14px] ${isToday ? 'bg-[color-mix(in_srgb,var(--accent)_9%,white)]' : ''}`}
                        aria-current={isToday ? 'date' : undefined}
                    >
                        <span className={`font-nunito ${isToday ? 'font-bold text-[var(--accent)]' : 'font-semibold text-[#344054]'}`}>
                            {t(`restaurant_landing.days.${String(h.day).toLowerCase()}`, h.day)}
                            {isToday && (
                                <span className="ml-2 text-[11px] font-semibold uppercase tracking-wide">{t('restaurant_landing.today', 'Today')}</span>
                            )}
                        </span>
                        <span className={`font-varela ${h.isOpen === false ? 'text-[#F04438]' : isToday ? 'text-[#101828]' : 'text-[#475467]'}`}>
                            {h.isOpen === false
                                ? t('restaurant_landing.closed', 'Closed')
                                : `${formatTime(h.start)} – ${formatTime(h.end)}`}
                        </span>
                    </li>
                );
            })}
        </ul>
    );
};

export default HoursCard;
