import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'react-hot-toast';
import { Workflow, Lock, AlertTriangle, CheckCircle2, ChevronDown, ChevronRight, RotateCcw, GitBranch } from 'lucide-react';
import api from '../../../utils/api';
import { resolveModule } from '../../../utils/moduleAccess';
import { SectionCard, Badge, Button, ConfirmModal, Skeleton } from './ui';

/**
 * OperationsPanel — HOW this restaurant runs (Super Admin → Restaurant →
 * Operations). See OPERATIONS_CONTROL_PANEL_DESIGN.md §0, §4 and §12.1.
 *
 *   1. pick a preset, or tick the operating modules the restaurant uses
 *   2. the order flow for that combination is drawn immediately
 *   3. answer the few questions the modules don't decide
 *   4. (advanced, collapsed) fine-tune individual steps
 *   5. preview what changes, confirm, save (audit-logged on the server)
 *
 * Per-branch overrides (§12.1): the selector at the top switches between
 * the tenant default (today's editor) and each active branch. A branch is
 * edited as its RESOLVED stored profile (tenant profile with the branch's
 * partial overrides merged over it); fields that differ from the tenant
 * default carry an "Overridden" tag, and saving sends only those
 * differences (`overrides`) plus the branch's `expectedUpdatedAt`.
 * "Reset to tenant default" deletes the override entry.
 *
 * Every rule is resolved by the backend (/operations/preview); this
 * component only edits the stored profile and draws what comes back.
 */

const ADVANCED_LABELS = {
    serviceModel: 'Service model',
    'orderFlow.customerSelfOrder': 'Customers order from the QR',
    'orderFlow.staffOrder': 'Staff can enter orders',
    'orderFlow.kitchenDisplay': 'Kitchen screen in use',
    'orderFlow.servedStep': 'Someone marks orders "served"',
    'orderFlow.customerTracking': 'Customers can track their order',
    'payment.takeaway': 'Takeaway payment',
    'payment.kiosk': 'Kiosk payment',
    'payment.delivery': 'Delivery payment',
    'payment.holdUntilPaid': 'Hold unpaid pay-first orders from the kitchen',
    'payment.holdExpiryMinutes': 'Cancel unpaid held orders after (minutes)',
    'customerApp.callWaiter': '"Call waiter" button',
    'customerApp.requestBill': '"Ask for bill" button',
    'customerApp.appendToOrder': 'Customers can add more items',
    'customerApp.tips': 'Tips',
    'tables.useTables': 'Table numbers in use (off = token numbers)',
    'tables.assignWaiters': 'Assign waiters to tables',
    'tables.mergeTables': 'Merge tables',
    'tables.maxTablesPerWaiter': 'Max tables per waiter (0 = no limit)',
};

/** Save failed because someone saved a newer version first (409). */
const STALE_PROFILE_NOTE = 'Someone else changed this profile — reloaded the latest version';

/** Selector value for the tenant-wide profile (vs a branch id). */
export const TENANT_SCOPE = 'tenant';

const ENUM_LABELS = {
    tableService: 'Table service',
    counterService: 'Counter / self-service',
    roomService: 'Room service',
    payFirst: 'Pay first',
    payAfter: 'Pay after',
    either: 'Customer chooses',
};

const getPath = (obj, path) => path.split('.').reduce((cur, k) => (cur == null ? undefined : cur[k]), obj);
const hasOwn = (obj, key) => !!obj && Object.prototype.hasOwnProperty.call(obj, key);
const same = (a, b) => (a ?? null) === (b ?? null);
const unionKeys = (a, b) => [...new Set([...Object.keys(a || {}), ...Object.keys(b || {})])];

/** The stored profile without its concurrency stamps. */
function stripStamps(profile) {
    if (!profile) return profile;
    // eslint-disable-next-line no-unused-vars
    const { updatedAt, updatedBy, ...rest } = profile;
    return rest;
}

/**
 * Stored-shape merge: a branch's PARTIAL profile (preset / modules /
 * answers / advanced) over the tenant profile — what the server resolves
 * for that branch (restaurant.js `operationsByBranch`). Pure.
 */
// eslint-disable-next-line react-refresh/only-export-components
export function mergeStoredProfile(tenant, overrides) {
    const base = stripStamps(tenant) || { version: 1, preset: 'fullService', modules: {}, answers: {}, advanced: {} };
    const o = overrides || {};
    return {
        ...base,
        preset: o.preset ?? base.preset,
        modules: { ...(base.modules || {}), ...(o.modules || {}) },
        answers: { ...(base.answers || {}), ...(o.answers || {}) },
        advanced: { ...(base.advanced || {}), ...(o.advanced || {}) },
    };
}

/**
 * Which stored fields of `draft` differ from the tenant profile, as
 * 'modules.waiter' | 'answers.dineInPayment' | 'advanced.customerApp.tips'.
 * The preset label alone is not a setting and is not listed. Pure.
 */
// eslint-disable-next-line react-refresh/only-export-components
export function overrideKeys(tenant, draft) {
    if (!tenant || !draft) return [];
    const keys = [];
    for (const k of unionKeys(tenant.modules, draft.modules)) {
        if (!!tenant.modules?.[k] !== !!draft.modules?.[k]) keys.push(`modules.${k}`);
    }
    for (const k of unionKeys(tenant.answers, draft.answers)) {
        if (!same(tenant.answers?.[k], draft.answers?.[k])) keys.push(`answers.${k}`);
    }
    for (const k of unionKeys(tenant.advanced, draft.advanced)) {
        if (!same(tenant.advanced?.[k], draft.advanced?.[k])) keys.push(`advanced.${k}`);
    }
    return keys;
}

/**
 * The partial profile saved for a branch: only what differs from the
 * tenant default (so a stale override that now equals the tenant value
 * is dropped on the next save). Pure.
 */
// eslint-disable-next-line react-refresh/only-export-components
export function branchOverrides(tenant, draft) {
    const out = {};
    if (!tenant || !draft) return out;
    if (draft.preset && draft.preset !== tenant.preset) out.preset = draft.preset;
    for (const key of overrideKeys(tenant, draft)) {
        const dot = key.indexOf('.');
        const section = key.slice(0, dot);
        const field = key.slice(dot + 1);
        const value = draft[section]?.[field];
        if (value === undefined) continue;   // a key the branch lacks cannot be expressed by a merge
        out[section] = { ...(out[section] || {}), [field]: value };
    }
    return out;
}

const branchIdOf = (entry) => String(entry?.branch?._id ?? entry?.branch ?? '');
const findBranch = (loaded, id) => (loaded?.branches || []).find(b => branchIdOf(b) === String(id)) || null;
const activeBranches = (loaded) => (loaded?.branches || []).filter(b => b.branch && typeof b.branch === 'object' && b.branch.isActive !== false);
const hasStoredOverride = (entry) => !!entry && (!!entry.updatedAt || Object.keys(entry.overrides || {}).length > 0);

/** The editor's starting point for a scope: the tenant profile, or the branch's merged profile. */
function draftFor(loaded, scope) {
    if (!loaded?.profile) return null;
    if (scope === TENANT_SCOPE) return loaded.profile;
    const entry = findBranch(loaded, scope);
    return entry ? mergeStoredProfile(loaded.profile, entry.overrides) : loaded.profile;
}

/** Plain-language steps for a resolved profile (presentation only). */
// eslint-disable-next-line react-refresh/only-export-components
export function flowSteps(resolved) {
    if (!resolved) return [];
    const steps = [];
    const floor = resolved.roles?.waiter || resolved.roles?.captain;
    const pay = resolved.payment?.dineIn;
    const m = resolved.payment?.methods || {};
    const ways = [m.online && 'online', m.wallet && 'wallet', m.counterCash && 'cash at the counter'].filter(Boolean);

    if (resolved.orderFlow?.customerSelfOrder) {
        steps.push('Customer scans the table QR');
        steps.push('Adds items to the cart');
    } else {
        steps.push(floor ? 'Waiter takes the order' : 'Counter staff take the order');
    }
    if (pay === 'payFirst') {
        steps.push(`Customer pays first (${ways.join(', ') || 'no way to pay'})`);
        steps.push('Order is created only after payment');
    } else if (pay === 'either') {
        steps.push('Customer chooses: pay now or after the meal');
    } else {
        steps.push('Order is sent');
    }
    steps.push(resolved.orderFlow?.kitchenDisplay
        ? 'Kitchen screen — chef presses Preparing → Ready'
        : 'KOT prints at the counter (or shows on the admin screen)');
    steps.push(resolved.orderFlow?.customerTracking
        ? 'Customer tracks the order live'
        : 'Customer sees "Order confirmed — collect when your number is called" (no live tracking)');
    steps.push(floor ? 'Waiter serves the food' : 'Customer collects the food');
    if (pay === 'payAfter') steps.push('Customer pays after the meal');
    steps.push('Done');
    return steps;
}

export default function OperationsPanel({ restaurant, canEdit }) {
    const [catalog, setCatalog] = useState(null);
    const [loaded, setLoaded] = useState(null);       // GET payload (profile, resolved, branches[], …)
    const [scope, setScope] = useState(TENANT_SCOPE); // TENANT_SCOPE | branch id
    const [draft, setDraft] = useState(null);         // stored-shape profile being edited (merged, for a branch)
    const [preview, setPreview] = useState(null);
    const [previewError, setPreviewError] = useState('');
    const [saving, setSaving] = useState(false);
    const [confirm, setConfirm] = useState(null);     // null | 'save' | 'reset'
    const [advancedOpen, setAdvancedOpen] = useState(false);
    const reqId = useRef(0);
    const scopeRef = useRef(TENANT_SCOPE);
    scopeRef.current = scope;

    const rid = restaurant?._id;

    // Replace what is loaded and re-derive the editor for `wantedScope`
    // (falling back to the tenant default when that branch is gone).
    const applyLoaded = useCallback((payload, wantedScope) => {
        const next = wantedScope !== TENANT_SCOPE && findBranch(payload, wantedScope) ? wantedScope : TENANT_SCOPE;
        setLoaded(payload);
        setScope(next);
        setDraft(draftFor(payload, next));
        setPreview(null);
    }, []);

    const load = useCallback(async () => {
        if (!rid) return;
        try {
            const [cat, ops] = await Promise.all([
                api.get('/superadmin/operations/presets'),
                api.get(`/superadmin/restaurants/${rid}/operations`),
            ]);
            setCatalog(cat.data?.data || null);
            applyLoaded(ops.data?.data || null, scopeRef.current);
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to load operations');
        }
    }, [rid, applyLoaded]);

    useEffect(() => { load(); }, [load]);

    const tenantProfile = loaded?.profile || null;
    const entry = scope === TENANT_SCOPE ? null : findBranch(loaded, scope);
    const isBranch = !!entry;
    const branchName = entry?.branch?.name || 'this branch';
    const branches = useMemo(() => activeBranches(loaded), [loaded]);

    const baseDraft = useMemo(() => draftFor(loaded, isBranch ? scope : TENANT_SCOPE), [loaded, scope, isBranch]);
    const dirty = useMemo(
        () => !!draft && !!baseDraft && JSON.stringify(draft) !== JSON.stringify(baseDraft),
        [draft, baseDraft],
    );

    // Fields of the branch draft that differ from the tenant default.
    const overridden = useMemo(
        () => new Set(isBranch ? overrideKeys(tenantProfile, draft) : []),
        [isBranch, tenantProfile, draft],
    );
    const overrideCountOf = (b) => overrideKeys(tenantProfile, mergeStoredProfile(tenantProfile, b.overrides)).length;

    // Debounced preview whenever the draft changes. For a branch the
    // candidate is the MERGED profile; `branchId` (and the overrides it
    // came from) let the server diff against that branch's current flow.
    useEffect(() => {
        if (!draft || !rid || !canEdit) return undefined;
        const id = ++reqId.current;
        const t = setTimeout(async () => {
            try {
                const body = isBranch
                    ? { operations: draft, branchId: branchIdOf(entry), overrides: branchOverrides(tenantProfile, draft) }
                    : { operations: draft };
                const res = await api.post(`/superadmin/restaurants/${rid}/operations/preview`, body);
                if (id === reqId.current) { setPreview(res.data?.data || null); setPreviewError(''); }
            } catch (err) {
                if (id === reqId.current) {
                    setPreview(null);
                    setPreviewError(err.response?.data?.message || 'Preview failed');
                }
            }
        }, 300);
        return () => clearTimeout(t);
    }, [draft, rid, canEdit, isBranch, entry, tenantProfile]);

    const storedResolved = isBranch ? entry.resolved || loaded?.resolved : loaded?.resolved;
    const resolved = (canEdit ? preview?.resolved : null) || storedResolved || null;
    const errors = preview?.errors || [];
    // The tenant save response carries `warnings` at the top level (and in
    // `validation`); GET only has `validation.warnings`. A branch's stored
    // warnings ride on its own entry.
    const storedWarnings = isBranch
        ? (entry.validation?.warnings || entry.warnings || [])
        : (loaded?.warnings || loaded?.validation?.warnings || []);
    const warnings = preview?.warnings || storedWarnings;
    const impact = preview?.impact || [];

    const selectScope = (id) => {
        if (id === scope) return;
        setScope(id);
        setDraft(draftFor(loaded, id));
        setPreview(null);
        setPreviewError('');
    };

    const applyPreset = (key) => {
        const p = catalog?.presets?.find(x => x.key === key);
        if (!p) return;
        setDraft(d => ({ ...d, version: d?.version ?? 1, preset: key, modules: { ...p.modules }, answers: { ...p.answers }, advanced: {} }));
    };

    const toggleModule = (key) => setDraft(d => ({ ...d, preset: 'custom', modules: { ...d.modules, [key]: !d.modules[key] } }));

    const setAnswer = (key, raw) => {
        const value = raw === '' ? null : raw === 'true' ? true : raw === 'false' ? false : raw;
        setDraft(d => ({ ...d, preset: 'custom', answers: { ...d.answers, [key]: value } }));
    };

    const setAdvanced = (path, value) => setDraft(d => ({ ...d, preset: 'custom', advanced: { ...d.advanced, [path]: value } }));
    const clearAdvanced = (path) => setDraft(d => {
        const next = { ...d.advanced };
        delete next[path];
        return { ...d, advanced: next };
    });

    /** Branch editor: put one field back to the tenant default. */
    const revertField = (key) => {
        const dot = key.indexOf('.');
        const section = key.slice(0, dot);
        const field = key.slice(dot + 1);
        setDraft(d => {
            const next = { ...(d[section] || {}) };
            if (hasOwn(tenantProfile?.[section], field)) next[field] = tenantProfile[section][field];
            else delete next[field];
            const candidate = { ...d, [section]: next };
            const stillOverridden = overrideKeys(tenantProfile, candidate).length > 0;
            return { ...candidate, preset: stillOverridden ? d.preset : tenantProfile.preset };
        });
    };

    const handleStale = async (body) => {
        // Someone else saved first: drop the local edits and show the
        // latest version — the controller returns it as `data` (the GET
        // payload shape); else refetch it. The current branch stays
        // selected when it still exists.
        toast.error(STALE_PROFILE_NOTE);
        const current = body.data?.profile ? body.data : body.current?.profile ? body.current : null;
        if (current) applyLoaded(current, scopeRef.current);
        else await load();
    };

    const save = async () => {
        setSaving(true);
        try {
            if (isBranch) {
                // Only the differences from the tenant default are stored;
                // the stamp is the branch entry's own updatedAt (null for a
                // branch with no overrides yet).
                const expectedUpdatedAt = entry.updatedAt || null;
                const res = await api.put(`/superadmin/restaurants/${rid}/operations/branches/${branchIdOf(entry)}`, {
                    overrides: branchOverrides(tenantProfile, draft),
                    expectedUpdatedAt,
                });
                // Top-level `warnings` on this response belong to the branch
                // (its entry carries them too); keep the tenant view clean.
                const payload = res.data?.data ? { ...res.data.data, warnings: undefined } : res.data?.data;
                applyLoaded(payload, scope);
                toast.success(`Operations for ${branchName} updated — only this branch follows the new flow`);
                return;
            }
            // Optimistic concurrency: the stamp of the version this edit
            // started from (the stored profile's updatedAt; null when the
            // restaurant has no profile yet). The server answers 409
            // OPERATIONS_STALE when someone saved a newer one meanwhile.
            const expectedUpdatedAt = loaded?.profile?.updatedAt || null;
            const res = await api.put(`/superadmin/restaurants/${rid}/operations`, {
                operations: { ...draft, updatedAt: expectedUpdatedAt },
                expectedUpdatedAt,
            });
            const payload = res.data?.data;
            setLoaded(payload);
            setDraft(payload?.profile || draft);
            setPreview(null);   // show the saved version's warnings until the next preview
            toast.success('Operations updated — the restaurant\'s apps follow the new flow');
        } catch (err) {
            const body = err.response?.data;
            if (err.response?.status === 409 && body?.code === 'OPERATIONS_STALE') {
                await handleStale(body);
                return;
            }
            toast.error(body?.message || 'Failed to save operations');
        } finally {
            setSaving(false);
        }
    };

    const resetBranch = async () => {
        if (!entry) return;
        setSaving(true);
        try {
            const res = await api.delete(`/superadmin/restaurants/${rid}/operations/branches/${branchIdOf(entry)}`);
            applyLoaded(res.data?.data, scope);
            toast.success(`${branchName} now follows the tenant default`);
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to reset the branch');
        } finally {
            setSaving(false);
        }
    };

    if (!catalog || !draft) {
        return (
            <SectionCard title="Operations" icon={Workflow}>
                <Skeleton className="h-40" />
            </SectionCard>
        );
    }

    const steps = flowSteps(resolved);
    const liveOverrideCount = overridden.size;

    /** "Overridden" tag (+ revert) for a branch field that differs from the tenant default. */
    const overrideTag = (path) => (isBranch && overridden.has(path) ? (
        <span className="inline-flex items-center gap-1.5" data-testid={`ops-override-${path}`}>
            <Badge tone="info">Overridden</Badge>
            {canEdit && (
                <button
                    type="button"
                    className="text-[11px] text-gray-500 hover:text-[#FE8301]"
                    onClick={() => revertField(path)}
                    title="Use the tenant default for this field"
                >
                    Use tenant value
                </button>
            )}
        </span>
    ) : null);

    const scopeOptions = [
        { id: TENANT_SCOPE, label: 'Tenant default', count: 0 },
        ...branches.map(b => ({ id: branchIdOf(b), label: b.branch.name, count: overrideCountOf(b) })),
    ];

    return (
        <SectionCard
            title="Operations"
            subtitle="How this restaurant runs: which operating modules it uses, who serves, and when customers pay. The apps follow this flow. It can only switch off what the plan allows."
            icon={Workflow}
            className="mb-5"
            actions={canEdit && (
                <div className="flex items-center gap-2">
                    {isBranch && !dirty && hasStoredOverride(entry) && (
                        <Button variant="ghost" size="sm" icon={RotateCcw} disabled={saving} onClick={() => setConfirm('reset')}>
                            Reset to tenant default
                        </Button>
                    )}
                    {dirty && (
                        <Button variant="ghost" size="sm" icon={RotateCcw} disabled={saving} onClick={() => setDraft(baseDraft)}>
                            Discard
                        </Button>
                    )}
                    <Button
                        variant="brand"
                        size="sm"
                        disabled={!dirty || saving || errors.length > 0 || !!previewError}
                        onClick={() => setConfirm('save')}
                    >
                        Save
                    </Button>
                </div>
            )}
        >
            {/* 0. Which profile: tenant default or a branch */}
            {branches.length > 0 && (
                <div className="mb-4">
                    <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Profile for" data-testid="ops-scope">
                        <GitBranch size={14} className="text-gray-400" />
                        {scopeOptions.map(opt => {
                            const active = (isBranch ? scope : TENANT_SCOPE) === opt.id;
                            return (
                                <button
                                    key={opt.id}
                                    type="button"
                                    aria-pressed={active}
                                    disabled={dirty || saving}
                                    onClick={() => selectScope(opt.id)}
                                    className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 ${active
                                        ? 'border-[#FE8301] bg-orange-50 text-gray-900'
                                        : 'border-gray-200 bg-white text-gray-600 hover:border-[#FE8301]/40'}`}
                                >
                                    {opt.label}
                                    {opt.count > 0 && <Badge tone="info">{opt.count} override{opt.count === 1 ? '' : 's'}</Badge>}
                                </button>
                            );
                        })}
                        {dirty && <span className="text-[11px] text-gray-500">Save or discard your changes to switch</span>}
                    </div>
                    {isBranch && (
                        <p className="mt-2 text-xs text-gray-600" data-testid="ops-branch-note">
                            {liveOverrideCount > 0
                                ? `${branchName} overrides ${liveOverrideCount} setting${liveOverrideCount === 1 ? '' : 's'} from the tenant default. Other branches are not affected.`
                                : `${branchName} follows the tenant default — change any field below to override it for this branch only.`}
                        </p>
                    )}
                </div>
            )}

            {!isBranch && loaded?.isDefault && (
                <p className="mb-4 text-xs text-gray-500" data-testid="ops-default-note">
                    Not set up yet — this restaurant runs with the default full-service flow.
                </p>
            )}

            {/* 1. Presets */}
            <div className="mb-5">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 mb-2">Start from a preset</div>
                <div className="grid gap-2 sm:grid-cols-2">
                    {catalog.presets.map(p => (
                        <button
                            key={p.key}
                            type="button"
                            disabled={!canEdit}
                            onClick={() => applyPreset(p.key)}
                            className={`text-left rounded-xl border px-3 py-2 transition disabled:cursor-default ${draft.preset === p.key
                                ? 'border-[#FE8301] bg-orange-50'
                                : 'border-gray-200 bg-white hover:border-[#FE8301]/40'}`}
                            aria-pressed={draft.preset === p.key}
                        >
                            <div className="text-sm font-semibold text-gray-900">{p.label}</div>
                            <div className="text-xs text-gray-500 mt-0.5">{p.description}</div>
                        </button>
                    ))}
                </div>
            </div>

            {/* 2. Modules */}
            <div className="mb-5">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 mb-2">Operating modules in use</div>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3" data-testid="ops-modules">
                    {catalog.modules.map(mod => {
                        const inPlan = resolveModule(restaurant, mod.planFeature).on;
                        const on = !!draft.modules[mod.key];
                        const overriddenHere = isBranch && overridden.has(`modules.${mod.key}`);
                        return (
                            <div
                                key={mod.key}
                                data-testid={`ops-module-${mod.key}`}
                                className={`rounded-xl border px-3 py-2 ${overriddenHere ? 'border-sky-200 bg-sky-50/40' : on && inPlan ? 'border-emerald-200 bg-emerald-50/40' : 'border-gray-200 bg-white'}`}
                            >
                                <label className="flex gap-3">
                                    <input
                                        type="checkbox"
                                        className="mt-1 accent-[#FE8301]"
                                        checked={on}
                                        disabled={!canEdit}
                                        onChange={() => toggleModule(mod.key)}
                                        aria-label={mod.label}
                                    />
                                    <span>
                                        <span className="flex items-center gap-2 text-sm font-semibold text-gray-900">
                                            {mod.label}
                                            {!inPlan && <Badge tone="slate"><Lock size={10} /> Not in plan</Badge>}
                                        </span>
                                        <span className="block text-xs text-gray-500 mt-0.5">{mod.description}</span>
                                    </span>
                                </label>
                                {overriddenHere && <div className="mt-1 pl-7">{overrideTag(`modules.${mod.key}`)}</div>}
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* 3. The resulting flow */}
            <div className="mb-5 rounded-xl border border-orange-100 bg-[#FAF5F0] p-4" data-testid="ops-flow">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 mb-2">
                    {isBranch ? `The order flow at ${branchName}` : 'The order flow for this restaurant'}
                </div>
                <ol className="flex flex-wrap items-center gap-x-1 gap-y-2 text-xs">
                    {steps.map((s, i) => (
                        <li key={s} className="flex items-center gap-1">
                            <span className="rounded-lg bg-white px-2 py-1 ring-1 ring-orange-100 text-gray-800">{s}</span>
                            {i < steps.length - 1 && <ChevronRight size={12} className="text-gray-400" />}
                        </li>
                    ))}
                </ol>
            </div>

            {/* 4. Questions */}
            <div className="mb-5 grid gap-3 sm:grid-cols-3">
                {catalog.questions.map(q => (
                    <div key={q.key} className="text-xs">
                        <label className="block">
                            <span className="font-semibold text-gray-800">{q.label}</span>
                            {q.help && <span className="block text-gray-500 mt-0.5">{q.help}</span>}
                            <select
                                className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-xs disabled:bg-gray-50 disabled:text-gray-400 disabled:cursor-not-allowed"
                                value={draft.answers[q.key] == null ? '' : String(draft.answers[q.key])}
                                disabled={!canEdit}
                                onChange={e => setAnswer(q.key, e.target.value)}
                                aria-label={q.label}
                            >
                                {q.options.map(o => (
                                    <option key={String(o.value)} value={o.value == null ? '' : String(o.value)} disabled={!!o.disabled}>
                                        {o.label}{o.note ? ` — ${o.note}` : ''}
                                    </option>
                                ))}
                            </select>
                        </label>
                        {isBranch && overridden.has(`answers.${q.key}`) && <div className="mt-1">{overrideTag(`answers.${q.key}`)}</div>}
                    </div>
                ))}
            </div>

            {/* 5. Advanced fine-tune */}
            <div className="mb-5">
                <button
                    type="button"
                    className="flex items-center gap-1 text-xs font-semibold text-gray-600 hover:text-[#FE8301]"
                    onClick={() => setAdvancedOpen(o => !o)}
                    aria-expanded={advancedOpen}
                >
                    {advancedOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    Advanced — fine-tune individual steps
                    {Object.keys(draft.advanced || {}).length > 0 && (
                        <Badge tone="warning">{Object.keys(draft.advanced).length} changed</Badge>
                    )}
                </button>
                {advancedOpen && resolved && (
                    <table className="mt-3 w-full text-xs" data-testid="ops-advanced">
                        <tbody>
                            {Object.entries(catalog.advancedPaths || {}).map(([path, type]) => {
                                const setHere = hasOwn(draft.advanced, path);
                                const value = setHere ? draft.advanced[path] : getPath(resolved, path);
                                const overriddenHere = isBranch && overridden.has(`advanced.${path}`);
                                return (
                                    <tr key={path} className="border-b border-gray-50 last:border-0">
                                        <td className="py-1.5 pr-3 text-gray-800">
                                            {ADVANCED_LABELS[path] || path}
                                            {overriddenHere && <span className="ml-2" data-testid={`ops-override-advanced.${path}`}><Badge tone="info">Overridden</Badge></span>}
                                        </td>
                                        <td className="py-1.5 pr-3">
                                            {Array.isArray(type) ? (
                                                <select
                                                    className="rounded-lg border border-gray-200 bg-white px-2 py-1 text-xs"
                                                    value={value}
                                                    disabled={!canEdit}
                                                    onChange={e => setAdvanced(path, e.target.value)}
                                                    aria-label={ADVANCED_LABELS[path] || path}
                                                >
                                                    {type.map(v => <option key={v} value={v}>{ENUM_LABELS[v] || v}</option>)}
                                                </select>
                                            ) : type === 'number' ? (
                                                <input
                                                    type="number"
                                                    min={5}
                                                    max={240}
                                                    className="w-20 rounded-lg border border-gray-200 bg-white px-2 py-1 text-xs"
                                                    value={value ?? ''}
                                                    disabled={!canEdit}
                                                    onChange={e => setAdvanced(path, Number(e.target.value))}
                                                    aria-label={ADVANCED_LABELS[path] || path}
                                                />
                                            ) : type === 'count' ? (
                                                <input
                                                    type="number"
                                                    min={0}
                                                    max={1000}
                                                    step={1}
                                                    className="w-20 rounded-lg border border-gray-200 bg-white px-2 py-1 text-xs"
                                                    value={value ?? 0}
                                                    disabled={!canEdit}
                                                    onChange={e => {
                                                        const raw = e.target.value;
                                                        const n = raw === '' ? 0 : Number(raw);
                                                        // integers 0-1000 only; negatives / fractions are ignored
                                                        if (!Number.isInteger(n) || n < 0 || n > 1000) return;
                                                        setAdvanced(path, n);
                                                    }}
                                                    aria-label={ADVANCED_LABELS[path] || path}
                                                />
                                            ) : (
                                                <input
                                                    type="checkbox"
                                                    className="accent-[#FE8301]"
                                                    checked={!!value}
                                                    disabled={!canEdit}
                                                    onChange={e => setAdvanced(path, e.target.checked)}
                                                    aria-label={ADVANCED_LABELS[path] || path}
                                                />
                                            )}
                                        </td>
                                        <td className="py-1.5 text-right">
                                            {canEdit && isBranch && overriddenHere && (
                                                <button type="button" className="text-gray-400 hover:text-[#FE8301]" onClick={() => revertField(`advanced.${path}`)}>
                                                    Use tenant value
                                                </button>
                                            )}
                                            {canEdit && !isBranch && setHere && (
                                                <button type="button" className="text-gray-400 hover:text-[#FE8301]" onClick={() => clearAdvanced(path)}>
                                                    Use default
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                )}
            </div>

            {/* 6. Problems, warnings, plan blocks, impact */}
            {previewError && <p className="mb-2 text-xs text-rose-600">{previewError}</p>}
            {errors.length > 0 && (
                <ul className="mb-3 space-y-1" data-testid="ops-errors">
                    {errors.map(e => (
                        <li key={e} className="flex gap-2 text-xs text-rose-700"><AlertTriangle size={14} className="shrink-0" />{e}</li>
                    ))}
                </ul>
            )}
            {warnings.length > 0 && (
                <ul className="mb-3 space-y-1" data-testid="ops-warnings">
                    {warnings.map(w => (
                        <li key={w} className="flex gap-2 text-xs text-amber-700"><AlertTriangle size={14} className="shrink-0" />{w}</li>
                    ))}
                </ul>
            )}
            {(resolved?.planBlocks || []).length > 0 && (
                <p className="mb-3 text-xs text-gray-500">
                    Ticked but not in the plan (stays off until the plan or an add-on includes it):{' '}
                    {resolved.planBlocks.map(b => catalog.modules.find(m => m.key === b.module)?.label || b.module).join(', ')}
                </p>
            )}
            {dirty && impact.length > 0 && (
                <div className="rounded-xl border border-gray-200 p-3" data-testid="ops-impact">
                    <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 mb-2">
                        {isBranch ? `What changes at ${branchName} when you save` : 'What changes when you save'}
                    </div>
                    <ul className="space-y-1">
                        {impact.map(i => (
                            <li key={i.message} className={`flex gap-2 text-xs ${i.severity === 'warning' ? 'text-amber-700' : 'text-gray-700'}`}>
                                {i.severity === 'warning' ? <AlertTriangle size={14} className="shrink-0" /> : <CheckCircle2 size={14} className="shrink-0 text-emerald-600" />}
                                {i.message}
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            <ConfirmModal
                open={confirm === 'save'}
                onClose={() => setConfirm(null)}
                onConfirm={save}
                title={isBranch ? `Change how ${branchName} operates?` : 'Change how this restaurant operates?'}
                description={(isBranch ? `Only ${branchName} is affected — other branches keep the tenant default. ` : '')
                    + (impact.length
                        ? impact.map(i => i.message).join(' ')
                        : 'The restaurant\'s apps will follow the new flow for new orders.')}
                confirmLabel="Save changes"
            />
            <ConfirmModal
                open={confirm === 'reset'}
                onClose={() => setConfirm(null)}
                onConfirm={resetBranch}
                title={`Reset ${branchName} to the tenant default?`}
                description="Its overrides are deleted and the branch follows the tenant profile for new orders."
                confirmLabel="Reset"
                danger
            />
        </SectionCard>
    );
}
