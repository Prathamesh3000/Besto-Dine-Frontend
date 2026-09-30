import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import {
    Building2, User, CreditCard, Tag, ShieldCheck, ShieldAlert, StickyNote, Check, X,
    Mail, Phone, MessageCircle, Globe, ExternalLink, Save, CheckCircle2, AlertTriangle, ArrowUpRight,
} from 'lucide-react';
import api from '../../../utils/api';
import { useAuth } from '../../../Context/AuthContext';
import { restaurantLink } from '../../../utils/customerLinks';
import { Card, SectionCard, Badge, Button, ConfirmModal, PromptModal, inputClass } from '../components/ui';
import {
    PageShell, BackLink, DetailSkeleton, DetailError, CopyButton, StickyActionBar, ActivityTimeline, Row,
} from './shared';
import {
    fmtMoney, fmtDate, fmtDateTime, waitingLabel, waNumber, enabledFeatures, limitLabel, fmtLimit,
    errorState, LIST_PATH,
} from './approvalUtils';

/**
 * SignupApplicationDetail — full review page for one self-signup
 * (Pending Approvals → New Signups → row). Everything the operator needs
 * to decide: the application, the owner, the plan they asked for, where
 * they came from, automated duplicate / risk checks, an internal note
 * for other Super Admins and the audit trail.
 *
 * Reading is open to every Super Admin; Approve / Reject and the review
 * note need `superadminLevel === 'full'` (enforced server-side too).
 */

const STATUS_TONE = { pending: 'warning', approved: 'success', rejected: 'danger' };

const SignupApplicationDetail = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const { isFullSuperAdmin } = useAuth();
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [busy, setBusy] = useState(false);
    const [dlgApprove, setDlgApprove] = useState(false);
    const [dlgReject, setDlgReject] = useState(false);
    const [note, setNote] = useState('');
    const [savingNote, setSavingNote] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await api.get(`/superadmin/approvals/signups/${id}`);
            const d = res.data?.data || null;
            setData(d);
            setNote(d?.reviewNote?.text || '');
        } catch (err) {
            setError(errorState(err, 'Failed to load signup application'));
        } finally {
            setLoading(false);
        }
    }, [id]);

    useEffect(() => { load(); }, [load]);

    const approve = async () => {
        setBusy(true);
        try {
            await api.post(`/superadmin/restaurants/${id}/approve-signup`);
            toast.success('Signup approved — welcome email sent');
            navigate(LIST_PATH, { replace: true });
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to approve');
            setBusy(false);
        }
    };

    const reject = async (reason) => {
        setBusy(true);
        try {
            await api.post(`/superadmin/restaurants/${id}/reject-signup`, { reason });
            toast.success('Signup rejected');
            navigate(LIST_PATH, { replace: true });
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to reject');
            setBusy(false);
        }
    };

    const saveNote = async () => {
        setSavingNote(true);
        try {
            const res = await api.patch(`/superadmin/approvals/signups/${id}/note`, { reviewNote: note });
            const saved = res.data?.data || {};
            setData((prev) => prev ? { ...prev, reviewNote: saved } : prev);
            setNote(saved.text || '');
            toast.success('Review note saved');
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to save note');
        } finally {
            setSavingNote(false);
        }
    };

    if (loading) return <PageShell><DetailSkeleton /></PageShell>;
    if (error || !data) {
        return (
            <PageShell>
                <DetailError error={error} notFoundTitle="Signup application not found" tab="signups" onRetry={load} />
            </PageShell>
        );
    }

    const app = data.application;
    const owner = data.owner;
    const plan = data.requestedPlan;
    const meta = data.signupMeta || {};
    const pending = app.signupStatus === 'pending';
    const pageUrl = app.slug ? restaurantLink(app.slug) : app.pageUrl;
    const noteDirty = note !== (data.reviewNote?.text || '');
    const addressLine = [app.address?.line1, app.address?.line2, app.address?.state, app.address?.pincode]
        .filter(Boolean).join(', ');
    const initials = (app.name || 'R').trim().slice(0, 2).toUpperCase();

    return (
        <PageShell>
            <BackLink tab="signups" />

            {/* ── Header ─────────────────────────────────────────────── */}
            <Card className="p-5 sm:p-6 mb-5">
                <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                    <div className="w-14 h-14 rounded-2xl bg-linear-to-br from-orange-100 to-orange-200/70 text-orange-700 font-bold text-lg flex items-center justify-center ring-1 ring-orange-200/60 shrink-0">
                        {initials}
                    </div>
                    <div className="flex-1 min-w-0">
                        <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#FE8301] mb-1">Signup application</div>
                        <div className="flex items-center gap-2.5 flex-wrap">
                            <h1 className="text-xl sm:text-2xl font-bold text-gray-900 break-words">{app.name}</h1>
                            {pending ? (
                                <Badge tone="warning" dot>Pending · {waitingLabel(app.waitingSince)}</Badge>
                            ) : (
                                <Badge tone={STATUS_TONE[app.signupStatus] || 'slate'} dot>{app.signupStatus}</Badge>
                            )}
                        </div>
                        <div className="flex items-center gap-x-4 gap-y-1 flex-wrap text-xs text-gray-500 mt-2">
                            <span className="font-mono text-[11px] bg-gray-100 px-1.5 py-0.5 rounded text-gray-600">{app.slug}</span>
                            {app.city && <span>{app.city}</span>}
                            <span>Submitted {fmtDateTime(app.createdAt)}</span>
                            <Link to={`/superadmin/restaurants/${app._id}`} className="inline-flex items-center gap-1 font-semibold text-[#FE8301] hover:underline">
                                Tenant record <ArrowUpRight size={12} />
                            </Link>
                        </div>
                    </div>
                </div>
            </Card>

            {!pending && (
                <div className={`rounded-2xl border p-4 mb-5 text-sm ${app.signupStatus === 'approved' ? 'border-emerald-200 bg-emerald-50/70 text-emerald-900' : 'border-rose-200 bg-rose-50/70 text-rose-900'}`}>
                    <span className="font-semibold">This application was {app.signupStatus}</span>
                    {app.signupReviewedAt && <> on {fmtDateTime(app.signupReviewedAt)}</>}.
                    {app.signupRejectedReason && <> Reason: <span className="italic">"{app.signupRejectedReason}"</span></>}
                </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-start">
                {/* ── Left column ─────────────────────────────────────── */}
                <div className="lg:col-span-2 space-y-5 min-w-0">
                    <SectionCard title="Application" subtitle="What the hotel submitted on the signup form." icon={Building2}>
                        <Row label="Hotel name">{app.name}</Row>
                        <Row label="Web address">
                            {pageUrl ? (
                                <div>
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <a href={pageUrl} target="_blank" rel="noopener noreferrer" className="font-mono text-[13px] text-[#FE8301] hover:underline break-all inline-flex items-center gap-1">
                                            <Globe size={13} className="shrink-0" />
                                            {pageUrl.replace(/^https?:\/\//, '')}
                                        </a>
                                        <CopyButton value={pageUrl} />
                                    </div>
                                    {pending && (
                                        <p className="text-[11px] text-gray-500 mt-1">The page goes live after approval.</p>
                                    )}
                                </div>
                            ) : '—'}
                        </Row>
                        <Row label="City">{app.city || '—'}</Row>
                        {addressLine && <Row label="Address">{addressLine}</Row>}
                        <Row label="Contact email">{app.contactEmail || '—'}</Row>
                        <Row label="Contact phone">{app.contactPhone || '—'}</Row>
                        <Row label="Signup note">
                            {app.signupNote
                                ? <span className="italic text-gray-700">"{app.signupNote}"</span>
                                : <span className="text-gray-400">No note left</span>}
                        </Row>
                    </SectionCard>

                    <SectionCard title="Owner" subtitle="The account that will manage this hotel." icon={User}>
                        {owner ? (
                            <>
                                <Row label="Name">{owner.name || '—'}</Row>
                                <Row label="Email">
                                    {owner.email ? (
                                        <a href={`mailto:${owner.email}`} className="inline-flex items-center gap-1.5 text-[#FE8301] hover:underline break-all">
                                            <Mail size={13} className="shrink-0" />{owner.email}
                                        </a>
                                    ) : '—'}
                                </Row>
                                <Row label="Phone">
                                    {owner.mobile ? (
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <a href={`tel:${owner.mobile}`} className="inline-flex items-center gap-1.5 text-[#FE8301] hover:underline">
                                                <Phone size={13} />{owner.mobile}
                                            </a>
                                            <a
                                                href={`https://wa.me/${waNumber(owner.mobile)}?text=${encodeURIComponent(`Hi ${owner.name || ''}, this is BestoDine about your signup for ${app.name}.`)}`}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-lg border border-emerald-200 text-emerald-700 bg-emerald-50 hover:bg-emerald-100 transition"
                                            >
                                                <MessageCircle size={12} /> WhatsApp
                                            </a>
                                        </div>
                                    ) : '—'}
                                </Row>
                                <Row label="Account created">{fmtDateTime(owner.createdAt)}</Row>
                                {owner.lastLoginAt && <Row label="Last login">{fmtDateTime(owner.lastLoginAt)}</Row>}
                            </>
                        ) : (
                            <p className="text-sm text-gray-500">No owner account is linked to this application.</p>
                        )}
                    </SectionCard>

                    <SectionCard
                        title="Requested plan"
                        subtitle="Informational — billing isn't activated by approval. Assign the real plan from the tenant record."
                        icon={CreditCard}
                    >
                        {plan ? (
                            <PlanSummary plan={plan} />
                        ) : (
                            <p className="text-sm text-gray-500">No plan chosen on the signup form.</p>
                        )}
                        {data.subscriptionPlan?.planName && (
                            <p className="text-xs text-gray-500 mt-4">
                                Current placeholder plan: <span className="font-semibold capitalize text-gray-700">{data.subscriptionPlan.planName}</span>
                            </p>
                        )}
                    </SectionCard>

                    <SectionCard title="Source" subtitle="Where this signup came from." icon={Tag}>
                        <Row label="Source">{meta.source || '—'}</Row>
                        {(meta.utmSource || meta.utmMedium || meta.utmCampaign || meta.utmTerm || meta.utmContent) && (
                            <Row label="UTM">
                                <div className="flex flex-wrap gap-1.5">
                                    {[['source', meta.utmSource], ['medium', meta.utmMedium], ['campaign', meta.utmCampaign], ['term', meta.utmTerm], ['content', meta.utmContent]]
                                        .filter(([, v]) => v)
                                        .map(([k, v]) => (
                                            <span key={k} className="text-[11px] bg-gray-100 text-gray-700 rounded px-1.5 py-0.5">
                                                <span className="text-gray-400">{k}:</span> {v}
                                            </span>
                                        ))}
                                </div>
                            </Row>
                        )}
                        <Row label="Terms accepted">{fmtDateTime(meta.termsAcceptedAt)}</Row>
                        <Row label="IP address"><span className="font-mono text-xs">{meta.ip || '—'}</span></Row>
                        <Row label="Submitted">{fmtDateTime(app.createdAt)}</Row>
                    </SectionCard>
                </div>

                {/* ── Right column ────────────────────────────────────── */}
                <div className="space-y-5 min-w-0">
                    <ChecksCard checks={data.checks || {}} />

                    <SectionCard title="Internal review note" subtitle="Only visible to Super Admins." icon={StickyNote}>
                        <textarea
                            value={note}
                            onChange={(e) => setNote(e.target.value)}
                            rows={4}
                            maxLength={1000}
                            disabled={!isFullSuperAdmin || savingNote}
                            placeholder={isFullSuperAdmin ? 'e.g. Called the owner, FSSAI verified…' : 'Read-only access'}
                            className={`${inputClass} resize-y`}
                        />
                        <div className="flex items-center justify-between gap-3 mt-2">
                            <span className="text-[11px] text-gray-400 min-w-0 truncate">
                                {data.reviewNote?.updatedAt
                                    ? `Updated ${fmtDateTime(data.reviewNote.updatedAt)}${data.reviewNote.updatedByName ? ` by ${data.reviewNote.updatedByName}` : ''}`
                                    : `${note.length}/1000`}
                            </span>
                            {isFullSuperAdmin && (
                                <Button size="sm" icon={Save} disabled={!noteDirty || savingNote} onClick={saveNote}>
                                    {savingNote ? 'Saving…' : 'Save note'}
                                </Button>
                            )}
                        </div>
                    </SectionCard>

                    <ActivityTimeline items={data.activity} />
                </div>
            </div>

            {pending && (
                <StickyActionBar
                    readOnly={!isFullSuperAdmin}
                    hint={isFullSuperAdmin
                        ? 'Approving emails the owner and unlocks staff login. Rejecting emails them your reason.'
                        : 'Read-only access — a full Super Admin must approve or reject.'}
                >
                    {isFullSuperAdmin && (
                        <>
                            <Button variant="danger" icon={X} disabled={busy} onClick={() => setDlgReject(true)}>Reject</Button>
                            <Button variant="success" icon={Check} disabled={busy} onClick={() => setDlgApprove(true)}>Approve</Button>
                        </>
                    )}
                </StickyActionBar>
            )}

            <ConfirmModal
                open={dlgApprove}
                title="Approve this signup?"
                description={`${app.name} will get a welcome email, the trial starts today and ${pageUrl ? 'their page goes live' : 'staff can log in'}.`}
                confirmLabel="Approve signup"
                onClose={() => setDlgApprove(false)}
                onConfirm={approve}
            />
            <PromptModal
                open={dlgReject}
                title="Reject this signup?"
                description="The reason is recorded in the audit log and emailed to the applicant."
                placeholder="e.g. Suspicious application details, duplicate of existing tenant"
                confirmLabel="Reject signup"
                danger
                required
                maxLength={500}
                onClose={() => setDlgReject(false)}
                onConfirm={reject}
            />
        </PageShell>
    );
};

const PlanSummary = ({ plan }) => {
    const features = enabledFeatures(plan.features);
    const limits = Object.entries(plan.limits || {}).filter(([k]) => k !== '_id');
    return (
        <div>
            <div className="flex items-end gap-3 flex-wrap">
                <div className="text-lg font-bold text-gray-900 capitalize">{plan.name}</div>
                <div className="text-sm text-gray-600">
                    {plan.price === null || plan.price === undefined
                        ? 'Price unavailable'
                        : plan.price > 0 ? <>{fmtMoney(plan.price, plan.currency)} <span className="text-gray-400">/ {plan.billingCycle || 'month'}</span></> : 'Free'}
                </div>
                {plan.trialDays > 0 && <Badge tone="info">{plan.trialDays}-day trial</Badge>}
                {plan.isActive === false && <Badge tone="danger">No longer offered</Badge>}
            </div>
            {limits.length > 0 && (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-4">
                    {limits.map(([k, v]) => (
                        <div key={k} className="rounded-xl bg-[#FAF5F0] px-3 py-2">
                            <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">{limitLabel(k)}</div>
                            <div className="text-sm font-bold text-gray-900 tabular-nums">{fmtLimit(v)}</div>
                        </div>
                    ))}
                </div>
            )}
            {features.length > 0 && (
                <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5 mt-4">
                    {features.map((f) => (
                        <li key={f.key} className="text-xs text-gray-700 flex items-center gap-1.5">
                            <Check size={13} className="text-emerald-500 shrink-0" />
                            {f.label}{f.tier && <span className="text-gray-400 capitalize">({f.tier})</span>}
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
};

const CHECK_GROUPS = [
    { key: 'duplicateEmail', title: 'Same email', kind: 'restaurant' },
    { key: 'duplicatePhone', title: 'Same phone', kind: 'restaurant' },
    { key: 'sameNameCity', title: 'Same name in the same city', kind: 'restaurant' },
    { key: 'previousRejections', title: 'Previously rejected', kind: 'rejection' },
    { key: 'matchingLeads', title: 'Matching marketing leads', kind: 'lead' },
];

const ChecksCard = ({ checks }) => {
    const issues = CHECK_GROUPS.reduce((n, g) => n + (checks[g.key]?.length || 0), 0);
    return (
        <SectionCard
            title="Checks"
            subtitle="Automatic duplicate and history checks."
            icon={issues ? ShieldAlert : ShieldCheck}
        >
            {issues === 0 ? (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 px-4 py-3 flex items-center gap-2.5 text-sm font-semibold text-emerald-800">
                    <CheckCircle2 size={18} className="shrink-0" /> No issues found
                </div>
            ) : (
                <div className="space-y-3">
                    {CHECK_GROUPS.map((g) => {
                        const list = checks[g.key] || [];
                        if (!list.length) {
                            return (
                                <div key={g.key} className="flex items-center gap-2 text-xs text-gray-500">
                                    <CheckCircle2 size={14} className="text-emerald-500 shrink-0" /> {g.title}: none
                                </div>
                            );
                        }
                        return (
                            <div key={g.key} className="rounded-xl border border-amber-200 bg-amber-50/70 px-3.5 py-3">
                                <div className="flex items-center gap-2 text-xs font-semibold text-amber-900">
                                    <AlertTriangle size={14} className="shrink-0" /> {g.title} ({list.length})
                                </div>
                                <ul className="mt-2 space-y-1.5">
                                    {list.map((item) => <CheckItem key={`${g.key}-${item._id}`} kind={g.kind} item={item} />)}
                                </ul>
                            </div>
                        );
                    })}
                </div>
            )}
        </SectionCard>
    );
};

const CheckItem = ({ kind, item }) => {
    if (kind === 'lead') {
        return (
            <li className="text-xs text-amber-900/90">
                <Link to={`/superadmin/leads?search=${encodeURIComponent(item.restaurantName || item.name || '')}`} className="font-semibold hover:underline inline-flex items-center gap-1">
                    {item.name} — {item.restaurantName} <ExternalLink size={11} />
                </Link>
                <span className="text-amber-800/70"> · {item.status} · {fmtDate(item.createdAt)}</span>
            </li>
        );
    }
    return (
        <li className="text-xs text-amber-900/90">
            <Link to={`/superadmin/restaurants/${item._id}`} className="font-semibold hover:underline inline-flex items-center gap-1">
                {item.name} <ExternalLink size={11} />
            </Link>
            <span className="text-amber-800/70">
                {' · '}<span className="font-mono">{item.slug}</span>
                {kind === 'rejection'
                    ? <> · rejected {fmtDate(item.rejectedAt)}{item.reason && <> — "{item.reason}"</>}</>
                    : <> · {item.signupStatus === 'rejected' ? 'rejected signup' : item.status}{item.city ? ` · ${item.city}` : ''}</>}
            </span>
        </li>
    );
};

export default SignupApplicationDetail;
