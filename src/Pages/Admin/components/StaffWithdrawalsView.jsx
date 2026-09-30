import React, { useState, useEffect, useCallback } from 'react';
import { Loader, Check, X, RefreshCw, Wallet, ArrowDownToLine } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../../utils/api';
import useSocketEvent from '../../../hooks/useSocketEvent';
import { resolveImageUrl } from '../../../utils/image';

// Admin-side dashboard for staff wallet withdrawal requests. Sister to
// TipSettlementView — that page records tips earned and pushes them
// into the waiter's wallet on "Settle"; this one is what the admin
// uses afterwards when the waiter taps "Withdraw" in their app.
//
// Status filter chips drive the GET /staff-wallet/withdrawals query.
// Pending requests get the loud orange CTA + Approve/Reject; paid /
// rejected entries are read-only history rows.
const StatusBadge = ({ status }) => {
    const map = {
        pending: 'bg-[#FFF3E0] text-[#FE8301]',
        paid: 'bg-[#E8F5E9] text-[#22C55E]',
        rejected: 'bg-[#FFEBEE] text-[#FF3B30]',
    };
    return (
        <span className={`text-[11px] font-[700] uppercase px-2.5 py-1 rounded-full ${map[status] || 'bg-gray-100 text-gray-500'}`}>
            {status}
        </span>
    );
};

const RejectModal = ({ withdrawal, onClose, onConfirm }) => {
    const [reason, setReason] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const handle = async () => {
        if (!reason.trim()) {
            toast.error('Please add a reason for rejection.');
            return;
        }
        setSubmitting(true);
        try {
            await onConfirm(reason.trim());
        } finally {
            setSubmitting(false);
        }
    };
    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/40" onClick={() => !submitting && onClose()} />
            <div className="bg-white rounded-2xl w-full max-w-[420px] relative z-10 p-5 shadow-2xl">
                <h2 className="text-[16px] font-[700] text-[#1A181B]">Reject withdrawal</h2>
                <p className="text-[13px] text-gray-500 mt-1">
                    Refunds ₹{withdrawal.amount.toFixed(0)} back to {withdrawal.user?.name || 'the staff'}'s wallet.
                </p>
                <textarea
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    rows={3}
                    placeholder="Reason (visible to the staff member)"
                    maxLength={300}
                    className="mt-3 w-full p-3 border border-gray-200 rounded-xl text-[14px] focus:outline-none focus:border-[#FE8301]"
                />
                <div className="flex gap-2 mt-4">
                    <button
                        onClick={onClose}
                        disabled={submitting}
                        className="flex-1 h-[42px] rounded-xl bg-gray-100 text-gray-700 font-[600] text-[13px]"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handle}
                        disabled={submitting}
                        className="flex-1 h-[42px] rounded-xl bg-[#FF3B30] text-white font-[600] text-[13px] disabled:opacity-60"
                    >
                        {submitting ? 'Rejecting…' : 'Reject & refund'}
                    </button>
                </div>
            </div>
        </div>
    );
};

const ApproveModal = ({ withdrawal, onClose, onConfirm }) => {
    const [txnRef, setTxnRef] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const handle = async () => {
        setSubmitting(true);
        try {
            await onConfirm(txnRef.trim() || undefined);
        } finally {
            setSubmitting(false);
        }
    };
    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/40" onClick={() => !submitting && onClose()} />
            <div className="bg-white rounded-2xl w-full max-w-[420px] relative z-10 p-5 shadow-2xl">
                <h2 className="text-[16px] font-[700] text-[#1A181B]">Mark as paid</h2>
                <div className="mt-2 bg-[#FAFAFA] border border-gray-100 rounded-xl p-3 text-[13px] space-y-1">
                    <div className="flex justify-between"><span className="text-gray-500">Amount</span><span className="font-[700]">₹{withdrawal.amount.toFixed(2)}</span></div>
                    <div className="flex justify-between"><span className="text-gray-500">Method</span><span className="font-[600]">{withdrawal.method}</span></div>
                    {withdrawal.upiId && <div className="flex justify-between"><span className="text-gray-500">UPI ID</span><span className="font-[500] truncate ml-2">{withdrawal.upiId}</span></div>}
                    {withdrawal.accountNumber && <div className="flex justify-between"><span className="text-gray-500">Account</span><span className="font-mono text-[12px]">{withdrawal.accountNumber}</span></div>}
                    {withdrawal.ifsc && <div className="flex justify-between"><span className="text-gray-500">IFSC</span><span className="font-mono text-[12px]">{withdrawal.ifsc}</span></div>}
                </div>
                <p className="text-[12px] text-gray-500 mt-3">Confirm only after you've physically handed over the cash or completed the transfer.</p>
                <input
                    type="text"
                    value={txnRef}
                    onChange={(e) => setTxnRef(e.target.value)}
                    placeholder="Transaction reference (optional)"
                    maxLength={100}
                    className="mt-3 w-full h-[42px] px-3 border border-gray-200 rounded-xl text-[14px] focus:outline-none focus:border-[#FE8301]"
                />
                <div className="flex gap-2 mt-4">
                    <button
                        onClick={onClose}
                        disabled={submitting}
                        className="flex-1 h-[42px] rounded-xl bg-gray-100 text-gray-700 font-[600] text-[13px]"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handle}
                        disabled={submitting}
                        className="flex-1 h-[42px] rounded-xl bg-[#22C55E] text-white font-[600] text-[13px] disabled:opacity-60"
                    >
                        {submitting ? 'Saving…' : 'Confirm paid'}
                    </button>
                </div>
            </div>
        </div>
    );
};

const StaffWithdrawalsView = () => {
    const [statusFilter, setStatusFilter] = useState('pending');
    const [withdrawals, setWithdrawals] = useState([]);
    const [pendingCount, setPendingCount] = useState(0);
    const [loading, setLoading] = useState(true);
    const [approving, setApproving] = useState(null);
    const [rejecting, setRejecting] = useState(null);

    const fetch = useCallback(async () => {
        setLoading(true);
        try {
            const res = await api.get('/staff-wallet/withdrawals', {
                params: { status: statusFilter },
            });
            if (res.data?.success) {
                setWithdrawals(res.data.withdrawals || []);
                setPendingCount(res.data.pendingCount || 0);
            }
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to load withdrawals');
        } finally {
            setLoading(false);
        }
    }, [statusFilter]);

    useEffect(() => { fetch(); }, [fetch]);

    // Live refresh — waiter just requested or admin approved on another
    // tab. Cheaper than polling.
    useSocketEvent('staff-withdrawal:new', fetch);
    useSocketEvent('staff-withdrawal:updated', fetch);

    const handleApprove = async (txnRef) => {
        const w = approving;
        if (!w) return;
        try {
            const res = await api.post(`/staff-wallet/withdrawals/${w._id}/approve`, { txnRef });
            if (res.data?.success) {
                toast.success(`₹${w.amount.toFixed(0)} marked as paid to ${w.user?.name || 'staff'}.`);
                setApproving(null);
                fetch();
            } else {
                toast.error(res.data?.message || 'Failed to approve');
            }
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to approve');
        }
    };

    const handleReject = async (reason) => {
        const w = rejecting;
        if (!w) return;
        try {
            const res = await api.post(`/staff-wallet/withdrawals/${w._id}/reject`, { reason });
            if (res.data?.success) {
                toast.success(`Rejected. ₹${w.amount.toFixed(0)} refunded to wallet.`);
                setRejecting(null);
                fetch();
            } else {
                toast.error(res.data?.message || 'Failed to reject');
            }
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to reject');
        }
    };

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <div className="flex gap-2">
                    {[
                        { id: 'pending', label: `Pending${pendingCount ? ` (${pendingCount})` : ''}` },
                        { id: 'paid', label: 'Paid' },
                        { id: 'rejected', label: 'Rejected' },
                    ].map((t) => (
                        <button
                            key={t.id}
                            onClick={() => setStatusFilter(t.id)}
                            className={`px-4 py-[7px] rounded-full text-[13px] transition-all border ${
                                statusFilter === t.id
                                    ? 'bg-[#FE8301] text-white border-[#FE8301] font-[600]'
                                    : 'bg-white text-gray-500 border-gray-300'
                            }`}
                        >
                            {t.label}
                        </button>
                    ))}
                </div>
                <button
                    onClick={fetch}
                    disabled={loading}
                    className="flex items-center gap-1.5 px-3 py-[7px] rounded-full border border-gray-300 text-[12px] text-gray-600 hover:bg-gray-50 disabled:opacity-50"
                >
                    <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
                    Refresh
                </button>
            </div>

            {loading ? (
                <div className="flex items-center justify-center py-16">
                    <Loader className="w-7 h-7 animate-spin text-[#FE8301]" />
                </div>
            ) : withdrawals.length === 0 ? (
                <div className="bg-white border border-gray-200 rounded-xl py-16 text-center">
                    <Wallet size={36} className="mx-auto text-gray-300 mb-2" />
                    <p className="text-[14px] text-gray-500 font-[500]">
                        {statusFilter === 'pending' ? 'No pending withdrawal requests.' : `No ${statusFilter} withdrawals yet.`}
                    </p>
                </div>
            ) : (
                <div className="space-y-2">
                    {withdrawals.map((w) => (
                        <div key={w._id} className="bg-white border border-gray-200 rounded-2xl p-4 shadow-sm">
                            <div className="flex items-start gap-4">
                                <img
                                    src={resolveImageUrl(w.user?.avatar) || `https://ui-avatars.com/api/?name=${encodeURIComponent(w.user?.name || 'Staff')}&background=random`}
                                    alt={w.user?.name || 'Staff'}
                                    className="w-11 h-11 rounded-full object-cover shrink-0"
                                />
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center justify-between gap-2 mb-1">
                                        <div className="min-w-0">
                                            <p className="text-[14px] font-[700] text-[#1A181B] truncate">{w.user?.name || 'Unknown'}</p>
                                            <p className="text-[11px] text-gray-400 capitalize">{w.user?.role || ''}</p>
                                        </div>
                                        <StatusBadge status={w.status} />
                                    </div>
                                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-[12px] text-gray-600">
                                        <span><span className="text-gray-400">Amount</span> <strong className="text-[#FE8301] text-[14px]">₹{w.amount.toFixed(0)}</strong></span>
                                        <span><span className="text-gray-400">Method</span> <strong>{w.method}</strong></span>
                                        {w.upiId && <span><span className="text-gray-400">UPI</span> <strong>{w.upiId}</strong></span>}
                                        {w.accountNumber && <span><span className="text-gray-400">A/C</span> <strong>{w.accountNumber}</strong></span>}
                                        {w.ifsc && <span><span className="text-gray-400">IFSC</span> <strong>{w.ifsc}</strong></span>}
                                    </div>
                                    {w.note && <p className="text-[12px] text-gray-500 mt-2 italic">"{w.note}"</p>}
                                    {w.status === 'rejected' && w.rejectReason && (
                                        <p className="text-[12px] text-[#FF3B30] mt-2">Rejected: {w.rejectReason}</p>
                                    )}
                                    {w.status === 'paid' && w.txnRef && (
                                        <p className="text-[12px] text-gray-500 mt-2">Txn ref: <code className="font-mono">{w.txnRef}</code></p>
                                    )}
                                    <p className="text-[11px] text-gray-400 mt-2">
                                        Requested {new Date(w.createdAt).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                                        {w.handledAt && ` · Handled ${new Date(w.handledAt).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })} by ${w.handledBy?.name || ''}`}
                                    </p>

                                    {w.status === 'pending' && (
                                        <div className="flex gap-2 mt-3">
                                            <button
                                                onClick={() => setApproving(w)}
                                                className="flex items-center gap-1.5 px-4 h-[36px] rounded-xl bg-[#22C55E] text-white text-[13px] font-[600] active:scale-[0.97]"
                                            >
                                                <Check size={14} /> Mark Paid
                                            </button>
                                            <button
                                                onClick={() => setRejecting(w)}
                                                className="flex items-center gap-1.5 px-4 h-[36px] rounded-xl bg-white border border-[#FF3B30] text-[#FF3B30] text-[13px] font-[600] active:scale-[0.97]"
                                            >
                                                <X size={14} /> Reject
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {approving && <ApproveModal withdrawal={approving} onClose={() => setApproving(null)} onConfirm={handleApprove} />}
            {rejecting && <RejectModal withdrawal={rejecting} onClose={() => setRejecting(null)} onConfirm={handleReject} />}
        </div>
    );
};

export default StaffWithdrawalsView;
export const StaffWithdrawalsTabIcon = ArrowDownToLine;
