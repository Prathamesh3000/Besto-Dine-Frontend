import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'react-hot-toast';
import { Workflow, Lock, AlertTriangle, CheckCircle2, ChevronDown, ChevronRight, RotateCcw } from 'lucide-react';
import api from '../../../utils/api';
import { resolveModule } from '../../../utils/moduleAccess';
import { SectionCard, Badge, Button, ConfirmModal, Skeleton } from './ui';

/**
 * OperationsPanel — HOW this restaurant runs (Super Admin → Restaurant →
 * Operations). See OPERATIONS_CONTROL_PANEL_DESIGN.md §0 and §4.
 *
 *   1. pick a preset, or tick the operating modules the restaurant uses
 *   2. the order flow for that combination is drawn immediately
 *   3. answer the few questions the modules don't decide
 *   4. (advanced, collapsed) fine-tune individual steps
 *   5. preview what changes, confirm, save (audit-logged on the server)
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
    'tables.useTables': 'Table numbers in use',
    'tables.assignWaiters': 'Assign waiters to tables',
    'tables.mergeTables': 'Merge tables',
};

// Offered by the catalogue but not implemented yet (design §5.4: token-
// number mode "needs its own design"). The server normalises
// tables.useTables:false back to true and reports it in `warnings`.
const TOKEN_MODE_NOTE = 'Token-number mode (no tables) is not available yet';
const UNAVAILABLE_QUESTIONS = { useTables: TOKEN_MODE_NOTE };
const UNAVAILABLE_ADVANCED = { 'tables.useTables': TOKEN_MODE_NOTE };

/** Save failed because someone saved a newer version first (409). */
const STALE_PROFILE_NOTE = 'Someone else changed this profile — reloaded the latest version';

const ENUM_LABELS = {
    tableService: 'Table service',
    counterService: 'Counter / self-service',
    roomService: 'Room service',
    payFirst: 'Pay first',
    payAfter: 'Pay after',
    either: 'Customer chooses',
};

const getPath = (obj, path) => path.split('.').reduce((cur, k) => (cur == null ? undefined : cur[k]), obj);

/** Plain-language steps for a resolved profile (presentation only). */
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
    const [loaded, setLoaded] = useState(null);       // GET payload
    const [draft, setDraft] = useState(null);         // stored-shape profile being edited
    const [preview, setPreview] = useState(null);
    const [previewError, setPreviewError] = useState('');
    const [saving, setSaving] = useState(false);
    const [confirmOpen, setConfirmOpen] = useState(false);
    const [advancedOpen, setAdvancedOpen] = useState(false);
    const reqId = useRef(0);

    const rid = restaurant?._id;

    const load = useCallback(async () => {
        if (!rid) return;
        try {
            const [cat, ops] = await Promise.all([
                api.get('/superadmin/operations/presets'),
                api.get(`/superadmin/restaurants/${rid}/operations`),
            ]);
            setCatalog(cat.data?.data || null);
            const payload = ops.data?.data || null;
            setLoaded(payload);
            setDraft(payload?.profile || null);
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to load operations');
        }
    }, [rid]);

    useEffect(() => { load(); }, [load]);

    const dirty = useMemo(
        () => !!draft && !!loaded && JSON.stringify(draft) !== JSON.stringify(loaded.profile),
        [draft, loaded],
    );

    // Debounced preview whenever the draft changes.
    useEffect(() => {
        if (!draft || !rid || !canEdit) return undefined;
        const id = ++reqId.current;
        const t = setTimeout(async () => {
            try {
                const res = await api.post(`/superadmin/restaurants/${rid}/operations/preview`, { operations: draft });
                if (id === reqId.current) { setPreview(res.data?.data || null); setPreviewError(''); }
            } catch (err) {
                if (id === reqId.current) {
                    setPreview(null);
                    setPreviewError(err.response?.data?.message || 'Preview failed');
                }
            }
        }, 300);
        return () => clearTimeout(t);
    }, [draft, rid, canEdit]);

    const resolved = (canEdit ? preview?.resolved : null) || loaded?.resolved || null;
    const errors = preview?.errors || [];
    // The save response carries `warnings` at the top level (and in
    // `validation`); GET only has `validation.warnings`.
    const storedWarnings = loaded?.warnings || loaded?.validation?.warnings || [];
    const warnings = preview?.warnings || storedWarnings;
    const impact = preview?.impact || [];

    const applyPreset = (key) => {
        const p = catalog?.presets?.find(x => x.key === key);
        if (!p) return;
        setDraft({ version: 1, preset: key, modules: { ...p.modules }, answers: { ...p.answers }, advanced: {} });
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

    const save = async () => {
        setSaving(true);
        try {
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
                // Someone else saved first: drop the local edits and show
                // the latest version — the controller returns it as
                // `data` (the GET payload shape); else refetch it.
                toast.error(STALE_PROFILE_NOTE);
                const current = body.data?.profile ? body.data : body.current?.profile ? body.current : null;
                if (current) {
                    setLoaded(current);
                    setDraft(current.profile);
                    setPreview(null);
                } else {
                    await load();
                }
                return;
            }
            toast.error(body?.message || 'Failed to save operations');
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

    return (
        <SectionCard
            title="Operations"
            subtitle="How this restaurant runs: which operating modules it uses, who serves, and when customers pay. The apps follow this flow. It can only switch off what the plan allows."
            icon={Workflow}
            className="mb-5"
            actions={canEdit && (
                <div className="flex items-center gap-2">
                    {dirty && (
                        <Button variant="ghost" size="sm" icon={RotateCcw} disabled={saving} onClick={() => setDraft(loaded.profile)}>
                            Discard
                        </Button>
                    )}
                    <Button
                        variant="brand"
                        size="sm"
                        disabled={!dirty || saving || errors.length > 0 || !!previewError}
                        onClick={() => setConfirmOpen(true)}
                    >
                        Save
                    </Button>
                </div>
            )}
        >
            {loaded?.isDefault && (
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
                        return (
                            <label
                                key={mod.key}
                                className={`flex gap-3 rounded-xl border px-3 py-2 ${on && inPlan ? 'border-emerald-200 bg-emerald-50/40' : 'border-gray-200 bg-white'}`}
                            >
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
                        );
                    })}
                </div>
            </div>

            {/* 3. The resulting flow */}
            <div className="mb-5 rounded-xl border border-orange-100 bg-[#FAF5F0] p-4" data-testid="ops-flow">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 mb-2">The order flow for this restaurant</div>
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
                {catalog.questions.map(q => {
                    const unavailable = UNAVAILABLE_QUESTIONS[q.key];
                    return (
                        <label key={q.key} className={`block text-xs ${unavailable ? 'opacity-60' : ''}`}>
                            <span className="font-semibold text-gray-800">{q.label}</span>
                            {q.help && <span className="block text-gray-500 mt-0.5">{q.help}</span>}
                            <select
                                className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-xs disabled:bg-gray-50 disabled:text-gray-400 disabled:cursor-not-allowed"
                                value={draft.answers[q.key] == null ? '' : String(draft.answers[q.key])}
                                disabled={!canEdit || !!unavailable}
                                onChange={e => setAnswer(q.key, e.target.value)}
                                aria-label={q.label}
                            >
                                {q.options.map(o => (
                                    <option key={String(o.value)} value={o.value == null ? '' : String(o.value)} disabled={!!o.disabled}>
                                        {o.label}{o.note ? ` — ${o.note}` : ''}
                                    </option>
                                ))}
                            </select>
                            {unavailable && (
                                <span className="block text-gray-500 mt-0.5" data-testid={`ops-question-${q.key}-unavailable`}>{unavailable}</span>
                            )}
                        </label>
                    );
                })}
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
                                const overridden = Object.prototype.hasOwnProperty.call(draft.advanced || {}, path);
                                const value = overridden ? draft.advanced[path] : getPath(resolved, path);
                                const unavailable = UNAVAILABLE_ADVANCED[path];
                                const locked = !canEdit || !!unavailable;
                                return (
                                    <tr key={path} className={`border-b border-gray-50 last:border-0 ${unavailable ? 'opacity-60' : ''}`}>
                                        <td className="py-1.5 pr-3 text-gray-800">
                                            {ADVANCED_LABELS[path] || path}
                                            {unavailable && <span className="block text-[11px] text-gray-500">{unavailable}</span>}
                                        </td>
                                        <td className="py-1.5 pr-3">
                                            {Array.isArray(type) ? (
                                                <select
                                                    className="rounded-lg border border-gray-200 bg-white px-2 py-1 text-xs"
                                                    value={value}
                                                    disabled={locked}
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
                                                    disabled={locked}
                                                    onChange={e => setAdvanced(path, Number(e.target.value))}
                                                    aria-label={ADVANCED_LABELS[path] || path}
                                                />
                                            ) : (
                                                <input
                                                    type="checkbox"
                                                    className="accent-[#FE8301]"
                                                    checked={!!value}
                                                    disabled={locked}
                                                    onChange={e => setAdvanced(path, e.target.checked)}
                                                    aria-label={ADVANCED_LABELS[path] || path}
                                                />
                                            )}
                                        </td>
                                        <td className="py-1.5 text-right">
                                            {overridden && canEdit && (
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
                    <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 mb-2">What changes when you save</div>
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
                open={confirmOpen}
                onClose={() => setConfirmOpen(false)}
                onConfirm={save}
                title="Change how this restaurant operates?"
                description={impact.length
                    ? impact.map(i => i.message).join(' ')
                    : 'The restaurant\'s apps will follow the new flow for new orders.'}
                confirmLabel="Save changes"
            />
        </SectionCard>
    );
}
