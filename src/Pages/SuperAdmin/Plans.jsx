import React, { useEffect, useState, useCallback } from 'react';
import { toast } from 'react-hot-toast';
import {
    Plus,
    Pencil,
    Archive,
    ArchiveRestore,
    Trash2,
    GitBranch,
    Users,
    Utensils,
    Store,
    Sparkles,
    CheckCircle2,
    Receipt,
    Send,
} from 'lucide-react';
import api from '../../utils/api';
import { useAuth } from '../../Context/AuthContext';
import PlanFormModal from './components/PlanFormModal';
import {
    PageHeader,
    Card,
    Badge,
    Button,
    EmptyState,
    Skeleton,
    ConfirmModal,
} from './components/ui';

/**
 * Plans — list of subscription tiers with full CRUD.
 *
 * Mutating actions are gated by `isFullSuperAdmin`. Plan slugs are
 * deliberately immutable once created (they're embedded in tenant
 * snapshots), so the edit modal locks the slug field.
 */
const Plans = () => {
    const { isFullSuperAdmin } = useAuth();
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [editingPlan, setEditingPlan] = useState(null);
    const [deleteTarget, setDeleteTarget] = useState(null);
    // Push-to-restaurants confirm: { plan, impact } once the impact loaded.
    const [pushTarget, setPushTarget] = useState(null);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const res = await api.get('/superadmin/plans?includeArchived=true');
            setItems(res.data?.data || []);
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to load plans');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    const togglePlan = async (plan) => {
        try {
            if (plan.isActive) {
                await api.patch(`/superadmin/plans/${plan._id}/archive`);
                toast.success(`${plan.name} archived`);
            } else {
                await api.put(`/superadmin/plans/${plan._id}`, { isActive: true });
                toast.success(`${plan.name} restored`);
            }
            load();
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to update plan');
        }
    };

    const handleDelete = async (plan) => {
        try {
            await api.delete(`/superadmin/plans/${plan._id}`, { _silent: true });
            toast.success(`${plan.name} deleted`);
            load();
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to delete plan');
        }
    };

    const openCreate = () => { setEditingPlan(null);  setShowForm(true); };
    const openEdit   = (plan) => { setEditingPlan(plan); setShowForm(true); };

    // Editing a plan never changes restaurants already on it — they keep
    // the copy of modules/limits they signed up with. This loads how many
    // would change and asks before pushing. `quiet` = skip when nobody
    // would change (used right after a save).
    const askPush = async (plan, { quiet = false } = {}) => {
        try {
            const res = await api.get(`/superadmin/plans/${plan._id}/tenant-impact`);
            const impact = res.data?.data;
            if (!impact) return;
            if (impact.outOfSyncCount === 0 && impact.pendingUpgrades === 0 && impact.scheduledDowngrades === 0) {
                if (!quiet) toast.success(`All ${impact.assignedCount} restaurant(s) on ${plan.name} already have its current modules.`);
                return;
            }
            setPushTarget({ plan, impact });
        } catch (err) {
            if (!quiet) toast.error(err.response?.data?.message || 'Failed to check restaurants on this plan');
        }
    };

    const doPush = async (plan) => {
        try {
            const res = await api.post(`/superadmin/plans/${plan._id}/push`, { confirm: true });
            const d = res.data?.data || {};
            toast.success(`Updated ${d.updated ?? 0} restaurant(s) on ${plan.name}`);
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to push plan');
        }
    };

    const handleSaved = (saved) => {
        const wasEdit = !!editingPlan;
        setShowForm(false);
        setEditingPlan(null);
        load();
        if (wasEdit && saved?._id) askPush(saved, { quiet: true });
    };

    return (
        <div className="px-4 sm:px-6 lg:px-8 py-6 sm:py-8 max-w-360 mx-auto">
            <PageHeader
                eyebrow="Pricing"
                title="Subscription Plans"
                description="Defines which modules each plan unlocks. Editing a plan does not change restaurants already on it until you push the plan to them."
                actions={
                    isFullSuperAdmin && (
                        <Button variant="brand" icon={Plus} onClick={openCreate}>
                            New Plan
                        </Button>
                    )
                }
            />

            {loading ? (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
                    {Array.from({ length: 3 }).map((_, i) => (
                        <Card key={i} className="p-6 space-y-4">
                            <div className="flex items-start justify-between">
                                <div className="space-y-2">
                                    <Skeleton className="h-4 w-24" />
                                    <Skeleton className="h-2.5 w-16" />
                                </div>
                                <Skeleton className="h-7 w-20" />
                            </div>
                            <Skeleton className="h-3 w-full" />
                            <Skeleton className="h-3 w-2/3" />
                        </Card>
                    ))}
                </div>
            ) : items.length === 0 ? (
                <Card>
                    <EmptyState
                        icon={Receipt}
                        title="No plans yet"
                        description="Create your first subscription plan to start onboarding tenants."
                        action={
                            isFullSuperAdmin && (
                                <Button variant="brand" icon={Plus} onClick={openCreate}>
                                    Create your first plan
                                </Button>
                            )
                        }
                    />
                </Card>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
                    {items.map(p => (
                        <PlanCard
                            key={p._id}
                            plan={p}
                            isFullSuperAdmin={isFullSuperAdmin}
                            onEdit={() => openEdit(p)}
                            onToggle={() => togglePlan(p)}
                            onDelete={() => setDeleteTarget(p)}
                            onPush={() => askPush(p)}
                        />
                    ))}
                </div>
            )}

            {showForm && (
                <PlanFormModal
                    plan={editingPlan}
                    onClose={() => { setShowForm(false); setEditingPlan(null); }}
                    onSaved={handleSaved}
                />
            )}

            <ConfirmModal
                open={!!pushTarget}
                title={`Push "${pushTarget?.plan?.name}" to its restaurants?`}
                description={pushTarget ? (
                    `${pushTarget.impact.outOfSyncCount} of ${pushTarget.impact.assignedCount} restaurant(s) on this plan have an older copy of its modules and limits`
                    + (pushTarget.impact.pendingUpgrades || pushTarget.impact.scheduledDowngrades
                        ? ` (plus ${pushTarget.impact.pendingUpgrades + pushTarget.impact.scheduledDowngrades} pending plan change(s))` : '')
                    + '. They will get exactly what the plan includes now — modules removed from the plan stop working for them. Their agreed price, per-restaurant overrides and add-ons are not changed.'
                ) : ''}
                confirmLabel="Push to restaurants"
                onClose={() => setPushTarget(null)}
                onConfirm={() => { const t = pushTarget; setPushTarget(null); if (t) doPush(t.plan); }}
            />

            <ConfirmModal
                open={!!deleteTarget}
                title={`Delete "${deleteTarget?.name}" plan?`}
                description="This permanently removes the plan from the catalog. It can't be undone. If any restaurant is currently on this plan, the delete is blocked — Archive it instead. (Existing tenants keep their plan; only the catalog entry is removed.)"
                confirmLabel="Delete plan"
                danger
                onClose={() => setDeleteTarget(null)}
                onConfirm={() => { const p = deleteTarget; setDeleteTarget(null); if (p) handleDelete(p); }}
            />
        </div>
    );
};

const FEATURE_LABELS = {
    dineIn: 'Dine-in QR',
    takeaway: 'Takeaway',
    kitchenDisplay: 'Kitchen display',
    waiterDashboard: 'Waiter dashboard',
    advanceBookingTable: 'Table booking',
    advanceBookingHall: 'Hall booking',
    walletLoyalty: 'Wallet & loyalty',
    couponPromotions: 'Coupons',
    inventory: 'Inventory',
    crm: 'CRM',
    tipManagement: 'Tips',
    multiBranch: 'Multi-branch',
    staffPerformance: 'Staff metrics',
    paymentGateway: 'Razorpay',
    dataExport: 'Data export',
    webhooks: 'Webhooks',
    kiosk: 'Self-order kiosk',
    campaigns: 'Campaigns',
    accountingExport: 'Tally export',
    aggregatorOrders: 'Zomato / Swiggy',
    eInvoice: 'e-Invoice',
    whiteLabelBranding: 'Own branding',
};

const PlanCard = ({ plan: p, isFullSuperAdmin, onEdit, onToggle, onDelete, onPush }) => {
    const enabledFeatures = Object.entries(p.features || {})
        .filter(([k, v]) => v === true && FEATURE_LABELS[k]);
    const visibleFeatures = enabledFeatures.slice(0, 5);
    const hiddenCount = Math.max(0, enabledFeatures.length - visibleFeatures.length);

    return (
        <article
            className={`relative bg-white rounded-2xl border p-6 shadow-[0_1px_2px_rgba(254,131,1,0.05)] hover:shadow-[0_8px_24px_rgba(254,131,1,0.10)] hover:border-orange-200/70 transition-all flex flex-col ${
                p.isActive ? 'border-orange-100/60' : 'border-dashed border-gray-300 opacity-75'
            }`}
        >
            {!p.isActive && (
                <div className="absolute top-4 right-4">
                    <Badge tone="slate">Archived</Badge>
                </div>
            )}

            {/* Identity */}
            <div className="mb-4">
                <div className="flex items-center gap-2 flex-wrap pr-20">
                    <h3 className="text-lg font-bold text-gray-900">{p.name}</h3>
                    {p.isPublic === false && <Badge tone="indigo" dot>Private</Badge>}
                </div>
                <div className="text-xs text-gray-500 capitalize mt-0.5">
                    <span className="font-mono text-gray-600">{p.slug}</span> · {p.billingCycle}
                </div>
            </div>

            {/* Price — a ₹0 plan is a custom/quoted tier, not "free". */}
            <div className="flex items-baseline gap-1 mb-1">
                {p.price > 0 ? (
                    <>
                        <span className="text-3xl font-bold text-gray-900 tabular-nums">₹{p.price}</span>
                        <span className="text-xs text-gray-500">/{p.billingCycle?.replace('ly', '')}</span>
                    </>
                ) : (
                    <span className="text-3xl font-bold text-gray-900">Custom</span>
                )}
            </div>
            {p.trialDays > 0 ? (
                <div className="inline-flex items-center gap-1.5 text-[11px] text-emerald-700 font-semibold mb-4">
                    <Sparkles size={11} />
                    {p.trialDays}-day free trial
                </div>
            ) : (
                <div className="text-[11px] text-gray-400 font-semibold mb-4">No trial</div>
            )}

            {p.description && (
                <p className="text-xs text-gray-500 leading-relaxed mb-4">{p.description}</p>
            )}

            {/* Limits */}
            <div className="grid grid-cols-2 gap-2 mb-5">
                <LimitTile icon={GitBranch} label="Branches" value={p.limits?.maxBranches} />
                <LimitTile icon={Users} label="Staff" value={p.limits?.maxStaff} />
                <LimitTile icon={Utensils} label="Menu" value={p.limits?.maxMenuItems} />
                <LimitTile icon={Store} label="Tables" value={p.limits?.maxTables} />
            </div>

            {/* Features */}
            {visibleFeatures.length > 0 && (
                <div className="mb-5">
                    <ul className="space-y-1.5">
                        {visibleFeatures.map(([k]) => (
                            <li key={k} className="flex items-center gap-2 text-xs text-gray-700">
                                <CheckCircle2 size={13} className="text-emerald-500 shrink-0" />
                                <span>{FEATURE_LABELS[k]}</span>
                            </li>
                        ))}
                        {hiddenCount > 0 && (
                            <li className="text-[11px] text-gray-400 pl-5">
                                + {hiddenCount} more
                            </li>
                        )}
                    </ul>
                </div>
            )}

            {/* Actions */}
            {isFullSuperAdmin && (
                <div className="flex items-center gap-2 mt-auto pt-4 border-t border-orange-100/70">
                    <Button variant="primary" size="sm" icon={Pencil} onClick={onEdit} className="flex-1">
                        Edit
                    </Button>
                    <Button
                        variant={p.isActive ? 'ghost' : 'success'}
                        size="sm"
                        icon={p.isActive ? Archive : ArchiveRestore}
                        onClick={onToggle}
                        className="flex-1"
                    >
                        {p.isActive ? 'Archive' : 'Restore'}
                    </Button>
                    <Button
                        variant="ghost"
                        size="sm"
                        icon={Send}
                        onClick={onPush}
                        aria-label={`Push ${p.name} to its restaurants`}
                        title="Push this plan's current modules & limits to restaurants on it"
                    />
                    <Button
                        variant="danger"
                        size="sm"
                        icon={Trash2}
                        onClick={onDelete}
                        aria-label={`Delete ${p.name} plan`}
                        title="Delete plan"
                    />
                </div>
            )}
        </article>
    );
};

const LimitTile = ({ icon, label, value }) => {
    const Icon = icon;
    return (
        <div className="rounded-xl bg-[#FAF5F0]/70 border border-orange-100/60 px-3 py-2.5">
            <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                <Icon size={11} />
                {label}
            </div>
            <div className="text-sm font-bold text-gray-900 tabular-nums mt-0.5">
                {value ?? '—'}
            </div>
        </div>
    );
};

export default Plans;
