import React from 'react';
import { useLocation } from 'react-router-dom';

// KIOSK-UI-02 — multi-step progress indicator at the top of the kiosk
// flow. Customers (often older / first-time users) get confused mid-
// flow about how many steps remain. A simple "Step 2 of 5" header with
// a filled dot row gives instant orientation without taking screen
// space away from the menu / cart cards.
//
// Steps are determined by route — no prop drilling needed; drop the
// component into any kiosk page and it self-orients. Routes outside
// the ordered flow render nothing so we don't clutter the landing /
// success / token screens (those have their own larger headers).
const STEPS = [
    { path: '/kiosk/order-type',   label: 'Type' },
    { path: '/kiosk/menu',         label: 'Menu' },
    { path: '/kiosk/cart',         label: 'Cart' },
    { path: '/kiosk/customer-info',label: 'Info' },
    { path: '/kiosk/pay',          label: 'Pay'  },
];

export default function StepProgress() {
    const { pathname } = useLocation();
    const idx = STEPS.findIndex(s => s.path === pathname);
    if (idx === -1) return null; // not on a numbered step — hide

    return (
        <div className="w-full px-6 pt-4 pb-2 flex items-center justify-center gap-2 sm:gap-3 select-none">
            {STEPS.map((s, i) => {
                const done = i < idx;
                const current = i === idx;
                return (
                    <React.Fragment key={s.path}>
                        <div className="flex flex-col items-center gap-1 min-w-[48px]">
                            <div
                                className={[
                                    'w-9 h-9 sm:w-10 sm:h-10 rounded-full flex items-center justify-center font-nunito font-bold text-[14px] transition-colors',
                                    current && 'bg-[#FE8301] text-white ring-4 ring-[#FE8301]/20',
                                    done    && 'bg-[#FE8301]/15 text-[#FE8301]',
                                    !current && !done && 'bg-gray-100 text-gray-400',
                                ].filter(Boolean).join(' ')}
                            >
                                {done ? '✓' : i + 1}
                            </div>
                            <span
                                className={[
                                    'text-[11px] sm:text-[12px] font-nunito',
                                    current ? 'text-[#FE8301] font-semibold' : 'text-gray-500',
                                ].join(' ')}
                            >
                                {s.label}
                            </span>
                        </div>
                        {i < STEPS.length - 1 && (
                            <div
                                className={[
                                    'h-0.5 flex-1 max-w-[40px] sm:max-w-[60px] mt-[-18px] transition-colors',
                                    i < idx ? 'bg-[#FE8301]' : 'bg-gray-200',
                                ].join(' ')}
                            />
                        )}
                    </React.Fragment>
                );
            })}
        </div>
    );
}
