import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import { ArrowUpRight, Check, Wallet, Store, Receipt, Mail, Phone } from 'lucide-react';
import api from '../../../utils/api';
import { useAuth } from '../../../Context/AuthContext';
import { Card, SectionCard, Badge, Button, PromptModal } from '../components/ui';
import { PageShell, BackLink, DetailSkeleton, DetailError, StickyActionBar, ActivityTimeline, Row } from './shared';
import { fmtMoney, fmtPaise, fmtDate, fmtDateTime, errorState, LIST_PATH } from './approvalUtils';

/**
 * PaymentApprovalDetail — review page for a tenant whose paid plan is
 * locked behind an offline payment (Pending Approvals → Offline
 * Payments → row). Shows how much to collect, the tenant, the payment
 * note, recent subscription invoices and the audit trail, with the same
 * "Confirm payment & unlock" action as the list.
 */

const STATUS_TONES = { active: 'success', trial: 'warning', suspended: 'danger', past_due: 'warning', cancelled: 'slate' };
const PAYMENT_TONES = { pending: 'danger', received: 'success', na: 'slate' };
const INVOICE_TONE = { paid: 'success', refunded: 'slate', partially_refunded: 'warning' };

const PaymentApprovalDetail = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const { isFullSuperAdmin } = useAuth();
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [busy, setBusy] = useState(false);
    const [dlgConfirm, setDlgConfirm] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await api.get(`/superadmin/approvals/payments/${id}`);
            setData(res.data?.data || null);
        } catch (err) {
            setError(errorState(err, 'Failed to load payment details'));
        } finally {
            setLoading(false);
        }
    }, [id]);

    useEffect(() => { load(); }, [load]);

    const confirm = async (note) => {
        setBusy(true);
        try {
            await api.post(`/superadmin/restaurants/${id}/confirm-payment`, { note: note || '' });
            toast.success('Payment confirmed — tenant unlocked');
            navigate(`${LIST_PATH}?tab=payments`, { replace: true });
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to confirm payment');
            setBusy(false);
        }
    };

    if (loading) return <PageShell><DetailSkeleton /></PageShell>;
    if (error || !data) {
        return (
            <PageShell>
                <DetailError error={error} notFoundTitle="Restaurant not found" tab="payments" onRetry={load} />
            </PageShell>
        );
    }

    const { restaurant: r, plan, amountDue, invoices = [] } = data;
    const pending = r.paymentStatus === 'pending';
    const initials = (r.name || 'R').trim().slice(0, 2).toUpperCase();

    return (
        <PageShell>
            <BackLink tab="payments" />

            {/* ── Header ─────────────────────────────────────────────── */}
            <Card className="p-5 sm:p-6 mb-5">
                <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                    <div className="w-14 h-14 rounded-2xl bg-linear-to-br from-orange-100 to-orange-200/70 text-orange-700 font-bold text-lg flex items-center justify-center ring-1 ring-orange-200/60 shrink-0">
                        {initials}
                    </div>
                    <div className="flex-1 min-w-0">
                        <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#FE8301] mb-1">Offline payment</div>
                        <div className="flex items-center gap-2.5 flex-wrap">
                            <h1 className="text-xl sm:text-2xl font-bold text-gray-900 break-words">{r.name}</h1>
                            <Badge tone={PAYMENT_TONES[r.paymentStatus] || 'slate'} dot>
                                {pending ? 'payment pending' : r.paymentStatus === 'received' ? 'payment received' : 'no payment due'}
                            </Badge>
                            <Badge tone={STATUS_TONES[r.status] || 'slate'}>{r.status}</Badge>
                        </div>
                        <div className="flex items-center gap-x-4 gap-y-1 flex-wrap text-xs text-gray-500 mt-2">
                            <span className="font-mono text-[11px] bg-gray-100 px-1.5 py-0.5 rounded text-gray-600">{r.slug}</span>
                            <Link to={`/superadmin/restaurants/${r._id}`} className="inline-flex items-center gap-1 font-semibold text-[#FE8301] hover:underline">
                                Tenant record <ArrowUpRight size={12} />
                            </Link>
                        </div>
                    </div>
                    {/* Amount to collect — the single most useful fact here */}
                    <div className="rounded-2xl bg-emerald-50 border border-emerald-100 px-4 py-3 sm:text-right shrink-0">
                        <div className="text-[10px] font-semibold uppercase tracking-wider text-emerald-700/70">{pending ? 'Collect' : 'Plan price'}</div>
                        <div className="text-2xl font-bold text-emerald-700 tabular-nums">
                            {amountDue > 0 ? fmtMoney(amountDue, plan.currency) : '—'}
                        </div>
                        <div className="text-[11px] text-emerald-800/70">per {plan.billingCycle || 'month'}</div>
                    </div>
                </div>
            </Card>

            {!pending && (
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 text-emerald-900 p-4 mb-5 text-sm">
                    {r.paymentStatus === 'received'
                        ? <><span className="font-semibold">Payment already confirmed</span>{r.paymentConfirmedAt && <> on {fmtDateTime(r.paymentConfirmedAt)}</>}.</>
                        : <span className="font-semibold">This tenant has no offline payment waiting.</span>}
                </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-start">
                <div className="lg:col-span-2 space-y-5 min-w-0">
                    <SectionCard title="Plan & amount" subtitle="What the tenant owes for their plan." icon={Wallet}>
                        <Row label="Plan"><span className="capitalize font-semibold">{plan.name || '—'}</span></Row>
                        <Row label="Amount due">
                            <span className="font-semibold">{amountDue > 0 ? fmtMoney(amountDue, plan.currency) : '—'}</span>
                            <span className="text-gray-400"> / {plan.billingCycle}</span>
                        </Row>
                        {plan.agreedPrice !== null && plan.agreedPrice !== undefined && plan.price !== null && plan.agreedPrice !== plan.price && (
                            <Row label="Catalog price">
                                {fmtMoney(plan.price, plan.currency)} <span className="text-xs text-gray-500">(agreed price above applies)</span>
                            </Row>
                        )}
                        <Row label="Payment note">
                            {r.paymentNote ? <span className="italic text-gray-700">"{r.paymentNote}"</span> : <span className="text-gray-400">No note</span>}
                        </Row>
                        {r.paymentMethod && <Row label="Method"><span className="capitalize">{r.paymentMethod.replace('_', ' ')}</span></Row>}
                    </SectionCard>

                    <SectionCard
                        title="Recent invoices"
                        subtitle="Online (Razorpay) subscription charges for this tenant."
                        icon={Receipt}
                        actions={
                            <Link
                                to={`/superadmin/payments?search=${encodeURIComponent(r.name || '')}`}
                                className="text-xs font-semibold text-[#FE8301] hover:underline"
                            >
                                All payments
                            </Link>
                        }
                    >
                        {invoices.length === 0 ? (
                            <p className="text-sm text-gray-500">No subscription invoices yet.</p>
                        ) : (
                            <div className="overflow-x-auto -mx-1">
                                <table className="w-full text-sm min-w-[480px]">
                                    <thead>
                                        <tr className="text-[10.5px] uppercase tracking-widest text-gray-500">
                                            <th className="text-left font-semibold py-2 px-1">Invoice</th>
                                            <th className="text-left font-semibold py-2 px-1">Date</th>
                                            <th className="text-left font-semibold py-2 px-1">Method</th>
                                            <th className="text-right font-semibold py-2 px-1">Amount</th>
                                            <th className="text-right font-semibold py-2 px-1">Status</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {invoices.map((i) => (
                                            <tr key={i._id} className="border-t border-gray-100">
                                                <td className="py-2.5 px-1 font-mono text-xs text-gray-700">{i.number}</td>
                                                <td className="py-2.5 px-1 text-gray-600">{fmtDate(i.date)}</td>
                                                <td className="py-2.5 px-1 text-gray-600 capitalize">{i.method}</td>
                                                <td className="py-2.5 px-1 text-right tabular-nums font-semibold">{fmtPaise(i.amount, i.currency)}</td>
                                                <td className="py-2.5 px-1 text-right">
                                                    <Badge tone={INVOICE_TONE[i.status] || 'slate'}>{i.status.replace('_', ' ')}</Badge>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </SectionCard>
                </div>

                <div className="space-y-5 min-w-0">
                    <SectionCard title="Tenant" icon={Store}>
                        <Row label="Status"><span className="capitalize">{r.status}</span></Row>
                        {r.suspendedReason && <Row label="Locked because">{r.suspendedReason}</Row>}
                        <Row label="Subscription"><span className="capitalize">{r.subscriptionStatus || '—'}</span></Row>
                        {r.trialEndDate && <Row label="Trial ends">{fmtDate(r.trialEndDate)}</Row>}
                        <Row label="Email">
                            {r.contactEmail
                                ? <a href={`mailto:${r.contactEmail}`} className="inline-flex items-center gap-1.5 text-[#FE8301] hover:underline break-all"><Mail size={13} className="shrink-0" />{r.contactEmail}</a>
                                : '—'}
                        </Row>
                        <Row label="Phone">
                            {r.contactPhone
                                ? <a href={`tel:${r.contactPhone}`} className="inline-flex items-center gap-1.5 text-[#FE8301] hover:underline"><Phone size={13} />{r.contactPhone}</a>
                                : '—'}
                        </Row>
                        {r.city && <Row label="City">{r.city}</Row>}
                    </SectionCard>

                    <ActivityTimeline items={data.activity} />
                </div>
            </div>

            {pending && (
                <StickyActionBar
                    readOnly={!isFullSuperAdmin}
                    hint={isFullSuperAdmin
                        ? `Collect ${amountDue > 0 ? fmtMoney(amountDue, plan.currency) : 'the amount due'}, then confirm to unlock staff login.`
                        : 'Read-only access — a full Super Admin must confirm the payment.'}
                >
                    {isFullSuperAdmin && (
                        <Button variant="success" icon={Check} disabled={busy} onClick={() => setDlgConfirm(true)}>
                            Confirm payment &amp; unlock
                        </Button>
                    )}
                </StickyActionBar>
            )}

            <PromptModal
                open={dlgConfirm}
                title="Confirm payment received?"
                description="The tenant will be unlocked once you confirm. Add an optional note (payment method / reference number) so the audit log captures it."
                placeholder="e.g. UPI ref TXN12345 / Bank transfer 8 May"
                confirmLabel="Confirm payment"
                onClose={() => setDlgConfirm(false)}
                onConfirm={confirm}
            />
        </PageShell>
    );
};

export default PaymentApprovalDetail;
