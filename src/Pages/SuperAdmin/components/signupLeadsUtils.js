/**
 * Shared constants and pure helpers for the Signup Leads list and modal
 * (kept out of the components so neither file imports the other).
 */

export const SEGMENTS = [
    { key: 'all',          label: 'All' },
    { key: 'trial_active', label: 'On trial' },
    { key: 'trial_ended',  label: 'Trial ended' },
    { key: 'free',         label: 'Free plan' },
    { key: 'paid',         label: 'Converted' },
];

export const SEGMENT_BADGE = {
    trial_active: { tone: 'warning', label: 'On trial' },
    trial_ended:  { tone: 'danger',  label: 'Trial ended' },
    free:         { tone: 'slate',   label: 'Free plan' },
    paid:         { tone: 'success', label: 'Paid' },
};

export const STAGES = [
    { key: 'new',        label: 'New',        tone: 'warning' },
    { key: 'contacted',  label: 'Contacted',  tone: 'info' },
    { key: 'interested', label: 'Interested', tone: 'indigo' },
    { key: 'converted',  label: 'Converted',  tone: 'success' },
    { key: 'lost',       label: 'Lost',       tone: 'slate' },
];
export const STAGE_BY_KEY = Object.fromEntries(STAGES.map(s => [s.key, s]));

export const fmtDate = (iso) => {
    if (!iso) return '—';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** "N days left" / "ended N days ago" / "—" (free plans have no trial). */
export const trialDaysLabel = (lead) => {
    if (!lead) return '—';
    if (lead.segment === 'trial_active' && lead.daysLeft != null) return `${plural(lead.daysLeft, 'day')} left`;
    if (lead.segment === 'trial_ended' && lead.daysSinceTrialEnd != null) return `ended ${plural(lead.daysSinceTrialEnd, 'day')} ago`;
    return '—';
};

export const isOverdue = (iso, now = Date.now()) => !!iso && new Date(iso).getTime() < now;

/** Effective stage: a paid tenant is always shown as converted. */
export const stageOf = (lead) => (lead?.segment === 'paid' ? 'converted' : (lead?.stage || 'new'));

/** ISO → yyyy-mm-dd in local time for <input type="date">. */
export const toInputDate = (iso) => {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

/** yyyy-mm-dd → ISO at local midnight; empty → null (clears the date). */
export const fromInputDate = (value) => {
    if (!value) return null;
    const d = new Date(`${value}T00:00:00`);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
};
