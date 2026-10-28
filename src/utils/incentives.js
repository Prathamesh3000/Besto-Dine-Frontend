// Pure helpers for the admin Incentives page (campaign form + report).

export const STAFF_ROLE_OPTIONS = [
    { value: 'captain', label: 'Captain' },
    { value: 'waiter', label: 'Waiter' },
];

export const ENTRY_STATES = ['pending', 'confirmed', 'reversed'];

export const isLockedError = (err) => {
    const d = err?.response?.data;
    return err?.response?.status === 403 && (d?.code === 'FEATURE_LOCKED' || d?.code === 'FEATURE_REVOKED');
};

export const pad2 = (n) => String(n).padStart(2, '0');
export const toYmd = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
export const daysAgoYmd = (n, from = new Date()) => {
    const d = new Date(from.getFullYear(), from.getMonth(), from.getDate() - n);
    return toYmd(d);
};

export function emptyCampaignForm(today = toYmd(new Date())) {
    return {
        name: '', items: [], ratePerItem: '', startDate: today, endDate: today,
        branch: '', staffRoles: ['captain', 'waiter'],
        maxPerStaffPerDay: '', budgetCap: '', stacking: 'stack', status: 'active',
    };
}

export function formFromCampaign(c) {
    return {
        name: c.name || '',
        items: (c.items || []).map(i => String(i && i._id ? i._id : i)),
        ratePerItem: c.rule?.ratePerItem != null ? String(c.rule.ratePerItem) : '',
        startDate: String(c.startDate || '').slice(0, 10),
        endDate: String(c.endDate || '').slice(0, 10),
        branch: c.branch ? String(c.branch._id || c.branch) : '',
        staffRoles: c.staffRoles && c.staffRoles.length ? [...c.staffRoles] : ['captain', 'waiter'],
        maxPerStaffPerDay: c.maxPerStaffPerDay ? String(c.maxPerStaffPerDay) : '',
        budgetCap: c.budgetCap ? String(c.budgetCap) : '',
        stacking: c.stacking || 'stack',
        status: c.status === 'paused' ? 'paused' : 'active',
    };
}

/** Returns { field: message } — empty object when valid. */
export function validateCampaignForm(f) {
    const e = {};
    const name = (f.name || '').trim();
    if (!name) e.name = 'Name is required';
    else if (name.length > 80) e.name = 'Name must be 80 characters or fewer';
    if (!f.items || f.items.length < 1) e.items = 'Pick at least one menu item';
    else if (f.items.length > 100) e.items = 'At most 100 items per campaign';
    const rate = Number(f.ratePerItem);
    if (f.ratePerItem === '' || !Number.isFinite(rate) || rate <= 0) e.ratePerItem = 'Enter a rate greater than 0';
    if (!f.startDate) e.startDate = 'Start date is required';
    if (!f.endDate) e.endDate = 'End date is required';
    else if (f.startDate && f.endDate < f.startDate) e.endDate = 'End date cannot be before the start date';
    if (!f.staffRoles || f.staffRoles.length < 1) e.staffRoles = 'Pick at least one staff role';
    if (f.maxPerStaffPerDay !== '' && !(Number.isInteger(Number(f.maxPerStaffPerDay)) && Number(f.maxPerStaffPerDay) >= 0)) {
        e.maxPerStaffPerDay = 'Enter a whole number (0 = no limit)';
    }
    if (f.budgetCap !== '' && !(Number.isFinite(Number(f.budgetCap)) && Number(f.budgetCap) >= 0)) {
        e.budgetCap = 'Enter an amount (0 = no cap)';
    }
    return e;
}

export function buildCampaignPayload(f) {
    return {
        name: f.name.trim(),
        items: f.items,
        rule: { type: 'per_item', ratePerItem: Number(f.ratePerItem) },
        startDate: f.startDate,
        endDate: f.endDate,
        branch: f.branch || null,
        staffRoles: f.staffRoles,
        maxPerStaffPerDay: f.maxPerStaffPerDay === '' ? 0 : Number(f.maxPerStaffPerDay),
        budgetCap: f.budgetCap === '' ? 0 : Number(f.budgetCap),
        stacking: f.stacking,
        status: f.status === 'paused' ? 'paused' : 'active',
    };
}

/** Drops empty filters so the query string stays clean. */
export function buildReportParams(filters, page = 1, limit = 25) {
    const p = {};
    for (const k of ['from', 'to', 'staff', 'campaign', 'item', 'state']) {
        if (filters[k]) p[k] = filters[k];
    }
    p.branch = filters.branch || 'all';
    p.page = page;
    p.limit = limit;
    return p;
}

export function apiMessage(err, fallback) {
    return err?.response?.data?.message || err?.message || fallback;
}

export function deleteErrorMessage(err) {
    if (err?.response?.data?.code === 'CAMPAIGN_HAS_ENTRIES' || err?.response?.status === 409) {
        return 'This campaign already has incentive entries, so it cannot be deleted. Pause it or set an end date instead.';
    }
    return apiMessage(err, 'Could not delete the campaign');
}

export const money = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

export const CAMPAIGN_STATUS_STYLE = {
    active: 'bg-green-50 text-green-700 border-green-200',
    upcoming: 'bg-blue-50 text-blue-700 border-blue-200',
    paused: 'bg-amber-50 text-amber-700 border-amber-200',
    ended: 'bg-gray-100 text-gray-500 border-gray-200',
};
export const ENTRY_STATE_STYLE = {
    pending: 'bg-amber-50 text-amber-700 border-amber-200',
    confirmed: 'bg-green-50 text-green-700 border-green-200',
    reversed: 'bg-red-50 text-red-700 border-red-200',
};
