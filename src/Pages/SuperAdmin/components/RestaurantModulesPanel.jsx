import React, { useEffect, useState } from 'react';
import { toast } from 'react-hot-toast';
import { Boxes, Plus, X } from 'lucide-react';
import api from '../../../utils/api';
import { FEATURE_LABELS, TIER_LABELS } from '../../../utils/featureLabels';
import { SectionCard, Badge, Button, Field, inputClass, ConfirmModal } from './ui';
import { MODULE_KEYS, resolveModule, isAddonActive } from '../../../utils/moduleAccess';

/**
 * RestaurantModulesPanel — what this restaurant can actually use.
 *
 * One row per module showing where access comes from:
 *   plan     — the restaurant's plan snapshot includes it
 *   add-on   — an active paid add-on switches it on
 *   override — the Super Admin forced it on / off for this restaurant
 *
 * Full super admins can change the override and sell / cancel add-ons.
 * Resolution mirrors Backend/utils/featureAccess.js (override → add-on →
 * plan).
 */

const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '');

export default function RestaurantModulesPanel({ restaurant, canEdit, onChanged }) {
    const [catalog, setCatalog] = useState([]);
    const [saving, setSaving] = useState(false);
    const [addOpen, setAddOpen] = useState(false);
    const [addForm, setAddForm] = useState({ key: '', price: '', endDate: '', note: '' });
    const [cancelTarget, setCancelTarget] = useState(null);

    useEffect(() => {
        if (!canEdit) return;
        api.get('/superadmin/addon-catalog')
            .then(res => setCatalog(res.data?.data || []))
            .catch(() => setCatalog([]));
    }, [canEdit]);

    const overrides = restaurant?.featureOverrides || {};
    const activeAddons = (restaurant?.addons || []).filter(a => isAddonActive(a));
    const analyticsPlan = restaurant?.subscription?.features?.revenueAnalytics || 'none';
    const analyticsOverride = overrides.revenueAnalytics;

    const saveOverrides = async (next) => {
        setSaving(true);
        try {
            await api.patch(`/superadmin/restaurants/${restaurant._id}`, { featureOverrides: next });
            toast.success('Module access updated');
            onChanged?.();
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to update module access');
        } finally {
            setSaving(false);
        }
    };

    const setOverride = (key, value) => {
        const next = { ...overrides };
        if (value === 'plan') delete next[key];
        else if (key === 'revenueAnalytics') next[key] = value;
        else next[key] = value === 'on';
        saveOverrides(next);
    };

    const openAdd = (key = '') => {
        const cat = catalog.find(c => c.key === key);
        setAddForm({ key, price: cat ? String(cat.monthlyPrice) : '', endDate: '', note: '' });
        setAddOpen(true);
    };

    const submitAdd = async () => {
        if (!addForm.key) { toast.error('Pick a module'); return; }
        setSaving(true);
        try {
            const body = { key: addForm.key, note: addForm.note };
            if (addForm.price !== '') body.price = Number(addForm.price);
            if (addForm.endDate) body.endDate = addForm.endDate;
            await api.post(`/superadmin/restaurants/${restaurant._id}/addons`, body);
            toast.success(`${FEATURE_LABELS[addForm.key] || addForm.key} add-on activated`);
            setAddOpen(false);
            onChanged?.();
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to add add-on');
        } finally {
            setSaving(false);
        }
    };

    const cancelAddon = async (addon) => {
        setSaving(true);
        try {
            await api.delete(`/superadmin/restaurants/${restaurant._id}/addons/${addon._id}`);
            toast.success(`${FEATURE_LABELS[addon.key] || addon.key} add-on cancelled`);
            onChanged?.();
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to cancel add-on');
        } finally {
            setSaving(false);
        }
    };

    // Modules worth offering as add-ons: anything the plan doesn't already
    // include and no add-on covers yet. Catalog items first.
    const addable = MODULE_KEYS.filter(k => !resolveModule(restaurant, k).inPlan && !activeAddons.some(a => a.key === k));
    const catalogKeys = new Set(catalog.map(c => c.key));
    const addableSorted = [...addable.filter(k => catalogKeys.has(k)), ...addable.filter(k => !catalogKeys.has(k))];

    return (
        <SectionCard
            title="Modules"
            subtitle="What this restaurant can use: its plan, plus any paid add-ons, plus your per-restaurant overrides (overrides win)."
            icon={Boxes}
            className="mb-5"
            actions={canEdit && addableSorted.length > 0 && (
                <Button variant="brand" size="sm" icon={Plus} disabled={saving} onClick={() => openAdd(addableSorted[0])}>
                    Add-on
                </Button>
            )}
        >
            {/* Active add-ons */}
            <div className="mb-5" data-testid="active-addons">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 mb-2">Paid add-ons</div>
                {activeAddons.length === 0 ? (
                    <p className="text-xs text-gray-400">No active add-ons.</p>
                ) : (
                    <ul className="flex flex-wrap gap-2">
                        {activeAddons.map(a => (
                            <li key={a._id} className="inline-flex items-center gap-2 rounded-xl border border-orange-100 bg-[#FAF5F0] px-3 py-1.5 text-xs">
                                <span className="font-semibold text-gray-800">{FEATURE_LABELS[a.key] || a.key}</span>
                                <span className="text-gray-500">₹{a.price || 0}/mo{a.endDate ? ` · until ${fmtDate(a.endDate)}` : ''}</span>
                                {canEdit && (
                                    <button
                                        type="button"
                                        disabled={saving}
                                        onClick={() => setCancelTarget(a)}
                                        className="text-gray-400 hover:text-rose-600 disabled:opacity-50"
                                        aria-label={`Cancel ${FEATURE_LABELS[a.key] || a.key} add-on`}
                                    >
                                        <X size={13} />
                                    </button>
                                )}
                            </li>
                        ))}
                    </ul>
                )}
            </div>

            {/* Per-module status */}
            <div className="overflow-x-auto">
                <table className="w-full text-xs" data-testid="modules-table">
                    <thead>
                        <tr className="text-left text-[10px] uppercase tracking-wider text-gray-500 border-b border-orange-100/70">
                            <th className="py-2 pr-3 font-semibold">Module</th>
                            <th className="py-2 pr-3 font-semibold">In plan</th>
                            <th className="py-2 pr-3 font-semibold">Access</th>
                            <th className="py-2 font-semibold">Override</th>
                        </tr>
                    </thead>
                    <tbody>
                        {MODULE_KEYS.map(key => {
                            const m = resolveModule(restaurant, key);
                            const overrideValue = m.override === true ? 'on' : m.override === false ? 'off' : 'plan';
                            return (
                                <tr key={key} className="border-b border-gray-50 last:border-0">
                                    <td className="py-2 pr-3 font-medium text-gray-800">{FEATURE_LABELS[key] || key}</td>
                                    <td className="py-2 pr-3 text-gray-500">{m.inPlan ? 'Yes' : '—'}</td>
                                    <td className="py-2 pr-3">
                                        {m.on
                                            ? <Badge tone="success">{m.source === 'addon' ? 'On · add-on' : m.source === 'override' ? 'On · override' : 'On'}</Badge>
                                            : <Badge tone={m.source === 'override' ? 'danger' : 'slate'}>{m.source === 'override' ? 'Off · override' : 'Off'}</Badge>}
                                    </td>
                                    <td className="py-2">
                                        {canEdit ? (
                                            <select
                                                value={overrideValue}
                                                disabled={saving}
                                                onChange={e => setOverride(key, e.target.value)}
                                                className="rounded-lg border border-gray-200 bg-white px-2 py-1 text-xs"
                                                aria-label={`Override for ${FEATURE_LABELS[key] || key}`}
                                            >
                                                <option value="plan">Follow plan</option>
                                                <option value="on">Force on</option>
                                                <option value="off">Force off</option>
                                            </select>
                                        ) : (
                                            <span className="text-gray-500">{overrideValue === 'plan' ? 'Follow plan' : overrideValue === 'on' ? 'Force on' : 'Force off'}</span>
                                        )}
                                    </td>
                                </tr>
                            );
                        })}
                        <tr>
                            <td className="py-2 pr-3 font-medium text-gray-800">{FEATURE_LABELS.revenueAnalytics}</td>
                            <td className="py-2 pr-3 text-gray-500">{TIER_LABELS[analyticsPlan] || analyticsPlan}</td>
                            <td className="py-2 pr-3">
                                <Badge tone={(analyticsOverride ?? analyticsPlan) === 'none' || analyticsOverride === false ? 'slate' : 'success'}>
                                    {analyticsOverride === true ? 'Advanced' : analyticsOverride === false ? 'Off' : (TIER_LABELS[analyticsOverride ?? analyticsPlan] || analyticsPlan)}
                                </Badge>
                            </td>
                            <td className="py-2">
                                {canEdit ? (
                                    <select
                                        value={typeof analyticsOverride === 'string' ? analyticsOverride : analyticsOverride === true ? 'advanced' : analyticsOverride === false ? 'none' : 'plan'}
                                        disabled={saving}
                                        onChange={e => setOverride('revenueAnalytics', e.target.value)}
                                        className="rounded-lg border border-gray-200 bg-white px-2 py-1 text-xs"
                                        aria-label="Override for Revenue Analytics"
                                    >
                                        <option value="plan">Follow plan</option>
                                        <option value="none">None</option>
                                        <option value="basic">Basic</option>
                                        <option value="standard">Standard</option>
                                        <option value="advanced">Advanced</option>
                                    </select>
                                ) : null}
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>

            {addOpen && (
                <div className="fixed inset-0 z-[120] flex items-end sm:items-center justify-center bg-gray-900/40 backdrop-blur-sm p-0 sm:p-4" role="dialog" aria-modal="true">
                    <div className="bg-white w-full max-w-md rounded-t-3xl sm:rounded-2xl shadow-2xl overflow-hidden">
                        <header className="px-5 sm:px-6 py-4 border-b border-orange-100/70">
                            <h2 className="text-base font-bold text-gray-900">Activate a paid add-on</h2>
                            <p className="text-sm text-gray-600 mt-1">Switches one module on for this restaurant without changing its plan. Record the agreed monthly price so it counts toward MRR.</p>
                        </header>
                        <div className="px-5 sm:px-6 py-4 space-y-3">
                            <Field label="Module">
                                <select
                                    value={addForm.key}
                                    onChange={e => {
                                        const cat = catalog.find(c => c.key === e.target.value);
                                        setAddForm(f => ({ ...f, key: e.target.value, price: cat ? String(cat.monthlyPrice) : f.price }));
                                    }}
                                    className={inputClass}
                                >
                                    {addableSorted.map(k => (
                                        <option key={k} value={k}>
                                            {FEATURE_LABELS[k] || k}{catalogKeys.has(k) ? ` — catalog ₹${catalog.find(c => c.key === k).monthlyPrice}/mo` : ''}
                                        </option>
                                    ))}
                                </select>
                            </Field>
                            <Field label="Price (₹ / month)" hint="Before GST">
                                <input type="number" min="0" value={addForm.price} onChange={e => setAddForm(f => ({ ...f, price: e.target.value }))} className={inputClass} />
                            </Field>
                            <Field label="Ends on" hint="Optional — leave empty to run until cancelled">
                                <input type="date" value={addForm.endDate} onChange={e => setAddForm(f => ({ ...f, endDate: e.target.value }))} className={inputClass} />
                            </Field>
                            <Field label="Note" hint="Optional">
                                <input type="text" maxLength={300} value={addForm.note} onChange={e => setAddForm(f => ({ ...f, note: e.target.value }))} placeholder="e.g. paid by UPI, ref 1234" className={inputClass} />
                            </Field>
                        </div>
                        <footer className="px-5 sm:px-6 py-4 flex items-center justify-end gap-3 bg-[#FAF5F0]/50">
                            <Button variant="ghost" onClick={() => setAddOpen(false)}>Cancel</Button>
                            <Button variant="brand" disabled={saving || !addForm.key} onClick={submitAdd}>Activate add-on</Button>
                        </footer>
                    </div>
                </div>
            )}

            <ConfirmModal
                open={!!cancelTarget}
                title={`Cancel the ${FEATURE_LABELS[cancelTarget?.key] || cancelTarget?.key} add-on?`}
                description="The module switches off for this restaurant immediately, unless its plan or an override includes it."
                confirmLabel="Cancel add-on"
                danger
                onClose={() => setCancelTarget(null)}
                onConfirm={() => { const a = cancelTarget; setCancelTarget(null); if (a) cancelAddon(a); }}
            />
        </SectionCard>
    );
}
