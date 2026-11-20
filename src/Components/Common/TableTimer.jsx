import React from 'react';
import useServerClock, { getTableTimerConfig } from '../../hooks/useServerClock';
import { elapsedMinutes, formatDuration, timerLevel } from '../../utils/tableTimer';

function spokenDuration(minutes) {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
    if (h === 0) return plural(m, 'minute');
    return m === 0 ? plural(h, 'hour') : `${plural(h, 'hour')} ${plural(m, 'minute')}`;
}

const LEVEL_CLASS = {
    ok: 'text-[#067647] bg-[#ECFDF3]',
    amber: 'text-[#B54708] bg-[#FFFAEB] ring-1 ring-[#FEC84B]',
    red: 'text-[#B42318] bg-[#FEF3F2] ring-1 ring-[#FDA29B] font-bold',
};
const LEVEL_NOTE = { ok: '', amber: ' - staying long', red: ' - overdue' };

/**
 * Elapsed occupancy time for a table. Renders nothing without a start time.
 * Time comes from the server-synced clock, so a wrong device clock does not
 * change it. `label` (e.g. "Occupied") prefixes the visible text.
 */
export default function TableTimer({ startedAt, amberMinutes, redMinutes, label, className = '' }) {
    const now = useServerClock();
    if (!startedAt) return null;
    const minutes = elapsedMinutes(startedAt, now);
    if (minutes === null) return null;

    const cfg = getTableTimerConfig();
    const amber = Number.isFinite(amberMinutes) ? amberMinutes : cfg.amberMinutes;
    const red = Number.isFinite(redMinutes) ? redMinutes : cfg.redMinutes;
    const level = timerLevel(minutes, amber, red);
    const text = formatDuration(minutes);

    return (
        <span
            role="timer"
            data-testid="table-timer"
            data-state={level}
            aria-label={`Occupied ${spokenDuration(minutes)}${LEVEL_NOTE[level]}`}
            className={`inline-flex items-center text-[11px] font-semibold px-1.5 py-0.5 rounded-md whitespace-nowrap ${LEVEL_CLASS[level]} ${className}`}
        >
            {label ? `${label} ${text}` : text}
        </span>
    );
}
