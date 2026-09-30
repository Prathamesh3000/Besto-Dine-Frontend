import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import {
    ArrowRight, ArrowUpRight, Check, X, Plus, Minus, Clock, CalendarClock, AlertOctagon,
    Layers, Gauge, FileText, Store, TrendingUp, TrendingDown,
} from 'lucide-react';
import api from '../../../utils/api';
import { useAuth } from '../../../Context/AuthContext';
import { Card, SectionCard, Badge, Button, ConfirmModal, PromptModal } from '../components/ui';
import { PageShell, BackLink, DetailSkeleton, DetailError, StickyActionBar, ActivityTimeline, Row } from './shared';
import {
    fmtMoney, fmtDate, fmtDateTime, fmtRelative, featureLabel, limitLabel, fmtLimit, errorState, LIST_PATH,
} from './approvalUtils';

/**
 * PlanChangeDetail — review page for one PlanChangeRequest
 * (Pending Approvals → Plan Changes → row): current vs requested plan,
 * feature / limit diff, the tenant's live usage against the new limits
 * and when the change would take effect (immediately, or at cycle end
 * for tenant-requested downgrades — same rule as the approve endpoint).
 */

const STATUS_TONE = { pending: 'warning', approved: 'success', rejected: 'danger', cancelled: 'slate' };
const USAGE_ROWS = [
    { key: 'branches', limit: 'maxBranches' },
    { key: 'tables', limit: 'maxTables' },
    { key: 'staff', limit: 'maxStaff' },
    { key: 'menuItems', limit: 'maxMenuItems' },
];

const PlanChangeDetail = () => {
    const { requestId } = useParams();
    const navigate = useNavigate();
    const { isFullSuperAdmin } = useAuth();
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [busy, setBusy] = useState(false);
    const [dlgApprove, setDlgApprove] = useState(false);
    const [dlgReject, setDlgReject] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await api.get(`/superadmin/approvals/plan-changes/${requestId}`);
            setData(res.data?.data || null);
        } catch (err) {
            setError(errorState(err, 'Failed to load plan change request'));
        } finally {
            setLoading(false);
        }
    }, [requestId]);

    useEffect(() => { load(); }, [load]);

    const approve = async () => {
        setBusy(true);
        try {
            const res = await api.post(`/superadmin/plan-change-requests/${requestId}/approve`);
            const d = res.data?.data || {};
            toast.success(d.scheduled
                ? `Downgrade scheduled for ${fmtDate(d.effectiveAt)}`
                : 'Plan change approved');
            navigate(`${LIST_PATH}?tab=planChanges`, { replace: true });
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to approve');
            setBusy(false);
        }
    };

    const reject = async (reason) => {
        setBusy(true);
        try {
            await api.post(`/superadmin/plan-change-requests/${requestId}/reject`, { reason });
            toast.success('Plan change rejected');
            navigate(`${LIST_PATH}?tab=planChanges`, { replace: true });
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to reject');
            setBusy(false);
        }
    };

    if (loading) return <PageShell><DetailSkeleton /></PageShell>;
    if (error || !data) {
        return (
            <PageShell>
                <DetailError error={error} notFoundTitle="Plan change request not found" tab="planChanges" onRetry={load} />
            </PageShell>
        );
    }

    const { request, restaurant, currentPlan, requestedPlan, comparison = {}, usage = {}, limitViolations = [], warnings = [] } = data;
    const pending = request.status === 'pending';
    const scheduled = request.timing?.mode === 'cycle_end';
    const violationByKey = new Map(limitViolations.map((v) => [v.key, v]));
    const DirIcon = request.direction === 'downgrade' ? TrendingDown : TrendingUp;

    const approveDescription = [
        scheduled
            ? `The switch to ${requestedPlan.name} is scheduled for ${request.timing.effectiveAt ? fmtDate(request.timing.effectiveAt) : 'the end of the current billing cycle'}. No refund, no proration.`
            : `${restaurant?.name || 'The tenant'} will switch to ${requestedPlan.name} immediately.`,
        limitViolations.length
            ? `Warning: the tenant is over ${limitViolations.length} of the new plan's limits (${limitViolations.map((v) => v.label).join(', ')}).`
            : '',
    ].filter(Boolean).join(' ');

    return (
        <PageShell>
            <BackLink tab="planChanges" />

            {/* ── Header ─────────────────────────────────────────────── */}
            <Card className="p-5 sm:p-6 mb-5">
                <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#FE8301] mb-1">Plan change request</div>
                <div className="flex items-center gap-2.5 flex-wrap">
                    <h1 className="text-xl sm:text-2xl font-bold text-gray-900 break-words">
                        {restaurant?.name || '(deleted tenant)'}
                    </h1>
                    <Badge tone={STATUS_TONE[request.status] || 'slate'} dot>{request.status}</Badge>
                    {request.direction !== 'same' && (
                        <Badge tone={request.direction === 'downgrade' ? 'warning' : 'info'}>
                            <DirIcon size={12} /> {request.direction}
                        </Badge>
                    )}
                </div>
                <div className="flex items-center gap-2 flex-wrap mt-3 text-sm">
                    <span className="capitalize bg-gray-100 px-2.5 py-1 rounded-lg text-gray-700">{currentPlan?.name || 'unassigned'}</span>
                    <ArrowRight size={16} className="text-gray-400" />
                    <span className="capitalize bg-orange-100 text-orange-800 px-2.5 py-1 rounded-lg font-semibold">{requestedPlan.name}</span>
                </div>
                <div className="flex items-center gap-x-4 gap-y-1 flex-wrap text-xs text-gray-500 mt-3">
                    {restaurant?.slug && <span className="font-mono text-[11px] bg-gray-100 px-1.5 py-0.5 rounded text-gray-600">{restaurant.slug}</span>}
                    <span>Requested {fmtRelative(request.createdAt)}</span>
                    {restaurant && (
                        <Link to={`/superadmin/restaurants/${restaurant._id}`} className="inline-flex items-center gap-1 font-semibold text-[#FE8301] hover:underline">
                            Tenant record <ArrowUpRight size={12} />
                        </Link>
                    )}
                </div>
            </Card>

            {!pending && (
                <div className={`rounded-2xl border p-4 mb-5 text-sm ${request.status === 'approved' ? 'border-emerald-200 bg-emerald-50/70 text-emerald-900' : 'border-gray-200 bg-gray-50 text-gray-800'}`}>
                    <span className="font-semibold">This request was {request.status}</span>
                    {request.reviewedAt && <> on {fmtDateTime(request.reviewedAt)}</>}
                    {request.reviewedByEmail && <> by {request.reviewedByEmail}</>}.
                    {request.rejectedReason && <> Reason: <span className="italic">"{request.rejectedReason}"</span></>}
                </div>
            )}

            {warnings.map((w) => (
                <div key={w} className="rounded-2xl border border-rose-200 bg-rose-50/70 p-4 mb-5 text-sm text-rose-900 flex items-start gap-2.5">
                    <AlertOctagon size={18} className="shrink-0 mt-0.5" /> {w}
                </div>
            ))}

            {/* ── Timing ─────────────────────────────────────────────── */}
            <div className={`rounded-2xl border p-4 sm:p-5 mb-5 flex items-start gap-3 ${scheduled ? 'border-amber-200 bg-amber-50/70' : 'border-sky-200 bg-sky-50/70'}`}>
                <div className={`w-10 h-10 rounded-xl bg-white border flex items-center justify-center shrink-0 ${scheduled ? 'border-amber-200 text-amber-600' : 'border-sky-200 text-sky-600'}`}>
                    {scheduled ? <CalendarClock size={18} /> : <Clock size={18} />}
                </div>
                <div className="min-w-0">
                    <div className={`text-sm font-semibold ${scheduled ? 'text-amber-900' : 'text-sky-900'}`}>
                        {scheduled
                            ? `Takes effect at cycle end${request.timing.effectiveAt ? ` · ${fmtDate(request.timing.effectiveAt)}` : ''}`
                            : 'Takes effect immediately on approval'}
                    </div>
                    <p className={`text-xs mt-1 leading-relaxed ${scheduled ? 'text-amber-800/80' : 'text-sky-800/80'}`}>{request.timing?.explanation}</p>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-start">
                <div className="lg:col-span-2 space-y-5 min-w-0">
                    {/* ── Side-by-side comparison ─────────────────────── */}
                    <SectionCard title="Plan comparison" subtitle="What the tenant has today vs what they asked for." icon={Layers}>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <PlanColumn title="Current" plan={currentPlan} />
                            <PlanColumn title="Requested" plan={requestedPlan} highlight showTrial={!scheduled} />
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-5">
                            <div>
                                <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 mb-2">Features added</div>
                                {comparison.featuresAdded?.length ? (
                                    <ul className="space-y-1.5">
                                        {comparison.featuresAdded.map((k) => (
                                            <li key={k} className="text-xs text-emerald-800 flex items-center gap-1.5"><Plus size={13} className="text-emerald-500" />{featureLabel(k)}</li>
                                        ))}
                                    </ul>
                                ) : <p className="text-xs text-gray-400">None</p>}
                            </div>
                            <div>
                                <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 mb-2">Features removed</div>
                                {comparison.featuresRemoved?.length ? (
                                    <ul className="space-y-1.5">
                                        {comparison.featuresRemoved.map((k) => (
                                            <li key={k} className="text-xs text-rose-700 flex items-center gap-1.5"><Minus size={13} className="text-rose-500" />{featureLabel(k)}</li>
                                        ))}
                                    </ul>
                                ) : <p className="text-xs text-gray-400">None</p>}
                            </div>
                        </div>
                        {comparison.featureChanges?.length > 0 && (
                            <ul className="mt-4 space-y-1.5">
                                {comparison.featureChanges.map((c) => (
                                    <li key={c.key} className="text-xs text-gray-700">
                                        {featureLabel(c.key)}: <span className="capitalize">{c.from}</span> → <span className="capitalize font-semibold">{c.to}</span>
                                    </li>
                                ))}
                            </ul>
                        )}

                        {comparison.limitChanges?.length > 0 && (
                            <div className="mt-5 overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="text-[10.5px] uppercase tracking-widest text-gray-500">
                                            <th className="text-left font-semibold py-2 pr-3">Limit</th>
                                            <th className="text-right font-semibold py-2 px-3">Current</th>
                                            <th className="text-right font-semibold py-2 pl-3">Requested</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {comparison.limitChanges.map((l) => (
                                            <tr key={l.key} className="border-t border-gray-100">
                                                <td className="py-2 pr-3 text-gray-700">{limitLabel(l.key)}</td>
                                                <td className="py-2 px-3 text-right tabular-nums text-gray-600">{fmtLimit(l.from)}</td>
                                                <td className={`py-2 pl-3 text-right tabular-nums font-semibold ${l.change === 'decrease' ? 'text-rose-600' : l.change === 'increase' ? 'text-emerald-600' : 'text-gray-900'}`}>
                                                    {fmtLimit(l.to)}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </SectionCard>

                    {/* ── Usage vs new limits ─────────────────────────── */}
                    <SectionCard
                        title="Usage vs new limits"
                        subtitle="What the tenant uses today, against the requested plan."
                        icon={Gauge}
                        actions={limitViolations.length
                            ? <Badge tone="danger" dot>{limitViolations.length} over limit</Badge>
                            : <Badge tone="success" dot>Within limits</Badge>}
                    >
                        {limitViolations.length > 0 && (
                            <ul className="rounded-xl border border-rose-200 bg-rose-50/70 px-4 py-3 mb-4 space-y-1">
                                {limitViolations.map((v) => (
                                    <li key={v.key} className="text-xs font-semibold text-rose-800 flex items-center gap-1.5">
                                        <AlertOctagon size={13} className="shrink-0" />{v.message}
                                    </li>
                                ))}
                            </ul>
                        )}
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                            {USAGE_ROWS.map((u) => {
                                const limit = requestedPlan.limits?.[u.limit];
                                const over = violationByKey.has(u.limit);
                                return (
                                    <div key={u.key} className={`rounded-xl px-3 py-3 border ${over ? 'border-rose-200 bg-rose-50' : 'border-gray-100 bg-[#FAF5F0]'}`}>
                                        <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">{limitLabel(u.limit)}</div>
                                        <div className={`text-lg font-bold tabular-nums mt-0.5 ${over ? 'text-rose-700' : 'text-gray-900'}`}>
                                            {usage[u.key] ?? 0}
                                            <span className="text-xs font-semibold text-gray-400"> / {fmtLimit(limit)}</span>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </SectionCard>
                </div>

                <div className="space-y-5 min-w-0">
                    <SectionCard title="Request" icon={FileText}>
                        <Row label="Source"><span className="capitalize">{request.requestSource === 'tenant' ? 'Tenant (self-service)' : 'Operator'}</span></Row>
                        <Row label="Requested by">{request.requestedByEmail || '—'}</Row>
                        <Row label="Requested at">{fmtDateTime(request.createdAt)}</Row>
                        <Row label="Note">
                            {request.note ? <span className="italic text-gray-700">"{request.note}"</span> : <span className="text-gray-400">No note</span>}
                        </Row>
                    </SectionCard>

                    {restaurant && (
                        <SectionCard title="Tenant" icon={Store}>
                            <Row label="Status"><span className="capitalize">{restaurant.status}</span></Row>
                            <Row label="Subscription"><span className="capitalize">{restaurant.subscriptionStatus || '—'}</span></Row>
                            <Row label="Paid until">{fmtDate(restaurant.currentPeriodEnd)}</Row>
                            <Row label="Email">
                                {restaurant.contactEmail
                                    ? <a href={`mailto:${restaurant.contactEmail}`} className="text-[#FE8301] hover:underline break-all">{restaurant.contactEmail}</a>
                                    : '—'}
                            </Row>
                        </SectionCard>
                    )}

                    <ActivityTimeline items={data.activity} />
                </div>
            </div>

            {pending && (
                <StickyActionBar
                    readOnly={!isFullSuperAdmin}
                    hint={isFullSuperAdmin
                        ? (scheduled ? 'Approving schedules the downgrade for cycle end.' : 'Approving switches the plan immediately.')
                        : 'Read-only access — a full Super Admin must approve or reject.'}
                >
                    {isFullSuperAdmin && (
                        <>
                            <Button variant="danger" icon={X} disabled={busy} onClick={() => setDlgReject(true)}>Reject</Button>
                            <Button variant="success" icon={Check} disabled={busy} onClick={() => setDlgApprove(true)}>
                                {scheduled ? 'Approve & schedule' : 'Approve'}
                            </Button>
                        </>
                    )}
                </StickyActionBar>
            )}

            <ConfirmModal
                open={dlgApprove}
                title={scheduled ? 'Approve scheduled downgrade?' : 'Approve this plan change?'}
                description={approveDescription}
                confirmLabel="Approve"
                onClose={() => setDlgApprove(false)}
                onConfirm={approve}
            />
            <PromptModal
                open={dlgReject}
                title="Reject this plan change?"
                description="The reason is recorded in the audit log."
                placeholder="e.g. Payment not received, plan no longer offered"
                confirmLabel="Reject change"
                danger
                required
                maxLength={500}
                onClose={() => setDlgReject(false)}
                onConfirm={reject}
            />
        </PageShell>
    );
};

const PlanColumn = ({ title, plan, highlight, showTrial = false }) => (
    <div className={`rounded-xl border p-4 ${highlight ? 'border-orange-200 bg-orange-50/40' : 'border-gray-200 bg-white'}`}>
        <div className={`text-[10.5px] font-semibold uppercase tracking-widest ${highlight ? 'text-[#FE8301]' : 'text-gray-500'}`}>{title}</div>
        {plan ? (
            <>
                <div className="text-base font-bold text-gray-900 capitalize mt-1">{plan.name || '—'}</div>
                <div className="text-sm text-gray-600 mt-0.5">
                    {plan.price === null || plan.price === undefined
                        ? '—'
                        : plan.price > 0 ? <>{fmtMoney(plan.price, plan.currency)} <span className="text-gray-400">/ {plan.billingCycle || 'month'}</span></> : 'Free'}
                </div>
                {showTrial && plan.trialDays > 0 && <div className="text-[11px] text-sky-700 mt-1">{plan.trialDays}-day trial on approval</div>}
            </>
        ) : (
            <div className="text-sm text-gray-500 mt-1">No plan assigned</div>
        )}
    </div>
);

export default PlanChangeDetail;
