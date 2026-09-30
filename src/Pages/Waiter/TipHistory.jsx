import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, Clock3, Check, Loader2, Wallet, ArrowDownToLine, X } from 'lucide-react';
import api from '../../utils/api';
import useSocketEvent from '../../hooks/useSocketEvent';
import toast from 'react-hot-toast';

const TipHistory = () => {
    const navigate = useNavigate();
    const [activeTab, setActiveTab] = useState('all');
    const [loading, setLoading] = useState(true);
    const [stats, setStats] = useState({
        todayTotal: 0, todayCount: 0,
        pendingTotal: 0, pendingCount: 0,
        settledTotal: 0, settledCount: 0,
        totalEarned: 0, totalCount: 0,
    });
    const [tips, setTips] = useState([]);
    const [weeklyTips, setWeeklyTips] = useState([]);

    // Wallet state — settled tips land here as a credit balance the
    // waiter can later withdraw via cash/UPI/bank.
    const [wallet, setWallet] = useState({ balance: 0, pendingWithdrawalAmount: 0, status: 'active' });
    const [withdrawals, setWithdrawals] = useState([]);
    const [showWithdrawModal, setShowWithdrawModal] = useState(false);

    const fetchTips = useCallback(async () => {
        try {
            const res = await api.get('/tips/my');
            if (res.data?.success) {
                setStats(res.data.stats);
                setTips(res.data.tips || []);
                setWeeklyTips(res.data.weeklyTips || []);
            }
        } catch (err) {
            console.error('Failed to fetch tips:', err);
        }
    }, []);

    const fetchWallet = useCallback(async () => {
        try {
            const res = await api.get('/staff-wallet/me');
            if (res.data?.success) {
                setWallet(res.data.wallet);
                setWithdrawals(res.data.withdrawals || []);
            }
        } catch (err) {
            // 403 is expected for staff roles outside waiter/captain — degrade silently.
            if (err.response?.status !== 403) console.error('Failed to fetch wallet:', err);
        }
    }, []);

    useEffect(() => {
        let mounted = true;
        (async () => {
            await Promise.all([fetchTips(), fetchWallet()]);
            if (mounted) setLoading(false);
        })();
        return () => { mounted = false; };
    }, [fetchTips, fetchWallet]);

    // Live refresh — admin approves/rejects a withdrawal OR settles new
    // tips, the page should reflect that without the waiter pulling to
    // refresh. Backend fires `staff-withdrawal:updated` to the staff
    // user's room and `notification:new` on tip settlement.
    useSocketEvent('staff-withdrawal:updated', () => { fetchWallet(); });
    useSocketEvent('notification:new', () => { fetchWallet(); fetchTips(); });

    const statCards = [
        { label: "Today's Total", value: String(stats.todayTotal), detail: `${stats.todayCount} Tips` },
        { label: "Pending Tips", value: String(stats.pendingTotal), detail: "Awaiting Settlement" },
        { label: "Settled Tips", value: String(stats.settledTotal), detail: "Received" },
        { label: "Total Tips Earned", value: String(stats.totalEarned), detail: `${stats.totalCount} Tips` },
    ];

    const tabs = [
        { id: 'all', label: `All Tips (${String(tips.length).padStart(2, '0')})` },
        { id: 'pending', label: `Pending (${String(tips.filter(t => t.status === 'Pending').length).padStart(2, '0')})` },
        { id: 'settled', label: 'Settled' },
    ];

    const filteredTips = activeTab === 'pending'
        ? tips.filter(t => t.status === 'Pending')
        : activeTab === 'settled'
            ? tips.filter(t => t.status === 'Settled')
            : tips;

    const sectionTitle = activeTab === 'settled'
        ? `Settled Amount (₹${stats.settledTotal})`
        : activeTab === 'pending'
            ? `Pending Amount (₹${stats.pendingTotal})`
            : 'Recent Tips';

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-orange-500" />
            </div>
        );
    }

    const canWithdraw = wallet.status === 'active' && wallet.balance > 0;

    return (
        <div className="min-h-screen bg-[#FBFBFF] pb-10">
            <div className="max-w-3xl mx-auto">
                {/* Header */}
                <header className="px-4 sm:px-6 pt-6 pb-4 flex items-center gap-3 bg-white/95 backdrop-blur sticky top-0 z-10 shadow-sm">
                    <button
                        onClick={() => navigate(-1)}
                        aria-label="Back"
                        className="w-11 h-11 rounded-xl text-gray-600 hover:text-gray-900 hover:bg-gray-50 flex items-center justify-center transition shrink-0"
                    >
                        <ChevronLeft size={24} />
                    </button>
                    <h1 className="text-xl sm:text-2xl font-bold text-[#1A181B] tracking-tight">Tip History</h1>
                </header>

                <main className="px-4 sm:px-6 py-5 space-y-4">
                    {/* Wallet Card */}
                    <div className="rounded-3xl p-5 sm:p-6 text-white shadow-lg bg-linear-to-br from-[#702083] to-[#A93BCB]">
                        <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-2">
                                <Wallet size={18} className="opacity-90" />
                                <span className="text-sm font-medium opacity-90">Wallet Balance</span>
                            </div>
                            {wallet.pendingWithdrawalAmount > 0 && (
                                <span className="text-xs bg-white/20 backdrop-blur-sm px-2.5 py-1 rounded-full font-medium">
                                    ₹{wallet.pendingWithdrawalAmount.toFixed(0)} pending
                                </span>
                            )}
                        </div>
                        <p className="text-4xl sm:text-5xl font-extrabold tabular-nums leading-none">
                            ₹{Number(wallet.balance || 0).toFixed(2)}
                        </p>
                        <p className="text-xs opacity-80 mt-2">Available to withdraw</p>
                        <button
                            onClick={() => setShowWithdrawModal(true)}
                            disabled={!canWithdraw}
                            className={`mt-4 w-full min-h-12 rounded-2xl px-4 font-bold text-base flex items-center justify-center gap-2 transition-all ${
                                canWithdraw
                                    ? 'bg-white text-[#702083] active:scale-[0.98] hover:bg-white/95'
                                    : 'bg-white/30 text-white/70 cursor-not-allowed'
                            }`}
                        >
                            <ArrowDownToLine size={18} />
                            {canWithdraw ? 'Withdraw' : (wallet.status !== 'active' ? 'Wallet Frozen' : 'Nothing to Withdraw')}
                        </button>
                    </div>

                    {/* Stats Grid */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
                        {statCards.map((stat, idx) => (
                            <div key={idx} className="bg-white px-3 py-4 rounded-2xl border border-gray-200 shadow-[0_1px_3px_rgba(0,0,0,0.03)]">
                                <span className="text-[11px] sm:text-xs font-bold text-gray-500 uppercase tracking-wider">{stat.label}</span>
                                <p className="text-2xl font-extrabold text-[#702083] mt-2 tabular-nums"><span className='text-gray-400 font-bold'>₹</span>{stat.value}</p>
                                <span className="text-xs text-gray-500 mt-1 font-medium block">{stat.detail}</span>
                            </div>
                        ))}
                    </div>

                    {/* Tab Switcher */}
                    <div className="bg-[#ECECF0] p-1 rounded-full flex gap-1">
                        {tabs.map((tab) => (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id)}
                                className={`flex-1 min-h-11 px-4 rounded-full text-sm font-semibold transition-all ${activeTab === tab.id
                                    ? 'bg-[#8B26A5] text-white shadow-sm'
                                    : 'text-gray-700 hover:text-gray-900'
                                    }`}
                            >
                                {tab.label}
                            </button>
                        ))}
                    </div>

                    {/* Tips List */}
                    <div className='bg-white rounded-2xl border border-gray-100 p-4 sm:p-5 overflow-hidden shadow-sm'>
                        <h2 className="text-lg sm:text-xl font-bold text-[#1A181B] mb-2">{sectionTitle}</h2>

                    {filteredTips.length === 0 ? (
                        <p className="text-gray-400 text-center py-8">No tips found</p>
                    ) : (
                        <div className="w-full divide-y divide-gray-100">
                            {filteredTips.map((tip, idx) => {
                                // Backend returns `table: '—'` for tips with no
                                // dine-in table (takeaway / orphan). Detect that
                                // so the avatar + label render cleanly instead
                                // of "T—" wrapping in the small square and
                                // "Table —" reading like a typo.
                                const tableRaw = String(tip.table || '').trim();
                                const hasTable = tableRaw && tableRaw !== '—';
                                const tableLabel = hasTable ? `Table ${tableRaw}` : 'Takeaway / No table';
                                // Avatar text — keep it short so it fits the
                                // 44×44 tile. Strip a leading "T" if the table
                                // name already starts with one (avoid "TT05").
                                const avatarRaw = hasTable
                                    ? tableRaw.replace(/^T(?=\d|-|$)/i, '')
                                    : '';
                                const avatarText = hasTable
                                    ? (avatarRaw.length <= 4 ? avatarRaw : avatarRaw.slice(0, 4))
                                    : 'TA';
                                return (
                                    <div key={tip.id || idx} className="py-3 w-full flex items-center gap-3">
                                        <div className={`w-11 h-11 rounded-xl flex items-center justify-center font-bold text-sm shrink-0 ${
                                            hasTable
                                                ? 'bg-[#702083] text-white'
                                                : 'bg-[#FFF1E3] text-[#FE8301] ring-1 ring-[#FE8301]/20'
                                        }`}>
                                            {avatarText}
                                        </div>
                                        <div className='flex-1 min-w-0'>
                                            <div className='flex justify-between items-center gap-2'>
                                                <div className="text-sm sm:text-base font-bold text-[#1A181B] truncate">{tableLabel}</div>
                                                <span className="text-sm sm:text-base font-bold text-[#22C55E] tabular-nums shrink-0">₹{tip.amount}</span>
                                            </div>
                                            <div className="flex justify-between items-center gap-2 mt-0.5">
                                                <div className="text-xs text-gray-500 font-medium truncate">{tip.date}  ·  {tip.time}</div>
                                                <span className={`text-[10px] font-bold px-2 py-1 rounded-md flex items-center gap-1 shrink-0 ${tip.status === 'Settled'
                                                    ? 'bg-[#E8F5E9] text-[#22C55E]'
                                                    : 'bg-[#FFF3E0] text-[#FE8301]'
                                                    }`}>
                                                    {tip.status === 'Pending' ? <Clock3 size={12} /> : <Check size={12} />}
                                                    {tip.status}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* Withdrawals History */}
                {withdrawals.length > 0 && (
                    <div className="bg-white rounded-[24px] border border-[#EBEBEB] p-[12px] shadow-sm mb-[16px]">
                        <h2 className="text-[18px] font-bold text-[#1A181B] mb-2">Withdrawal History</h2>
                        <div className="w-full">
                            {withdrawals.map((w, idx) => (
                                <div key={w._id || idx} className={`py-[12px] w-full flex items-center justify-between gap-3 ${idx !== withdrawals.length - 1 ? 'border-b border-[#F5F5F5]' : ''}`}>
                                    <div className="min-w-0">
                                        <div className="flex items-center gap-2">
                                            <span className="text-[15px] font-[700] text-[#1A181B]">₹{Number(w.amount).toFixed(0)}</span>
                                            <span className="text-[11px] font-[500] text-[#645E66] bg-[#F5F5F5] px-2 py-0.5 rounded-full">{w.method}</span>
                                        </div>
                                        <div className="text-[12px] text-[#8D848F] mt-0.5">
                                            {new Date(w.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })} · {new Date(w.createdAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                                        </div>
                                        {w.status === 'rejected' && w.rejectReason && (
                                            <div className="text-[11px] text-[#FF3B30] mt-0.5 truncate">Reason: {w.rejectReason}</div>
                                        )}
                                    </div>
                                    <span className={`text-[10px] font-bold px-[8px] py-[4px] rounded-[8px] whitespace-nowrap shrink-0 ${
                                        w.status === 'paid'
                                            ? 'bg-[#E8F5E9] text-[#22C55E]'
                                            : w.status === 'rejected'
                                                ? 'bg-[#FFEBEE] text-[#FF3B30]'
                                                : 'bg-[#FFF3E0] text-[#FE8301]'
                                    }`}>
                                        {w.status === 'paid' ? 'Paid' : w.status === 'rejected' ? 'Rejected' : 'Pending'}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Weekly Tips Section */}
                {activeTab === 'all' && weeklyTips.length > 0 && (
                    <div className="bg-white rounded-[24px] border border-[#EBEBEB] p-[12px] shadow-sm">
                        <h2 className="text-[18px] font-[600] text-[#1A181B] mb-[12px]">This Week's Tips</h2>
                        <div className="space-y-[12px]">
                            {weeklyTips.map((item, idx) => (
                                <div key={idx} className="flex justify-between items-center text-[14px] font-medium">
                                    <span className="text-[#8D848F] text-[16px] font-[700]">{item.day}</span>
                                    <span className="text-[#666666] text-[16px] font-[700]">₹{item.amount}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
                </main>
            </div>

            {showWithdrawModal && (
                <WithdrawModal
                    maxAmount={wallet.balance}
                    onClose={() => setShowWithdrawModal(false)}
                    onSuccess={async () => {
                        setShowWithdrawModal(false);
                        await fetchWallet();
                        toast.success('Withdrawal request sent — admin will process shortly.', { id: 'withdraw-ok' });
                    }}
                />
            )}
        </div>
    );
};

// ─── Withdrawal Modal ────────────────────────────────────────────────────────
const WithdrawModal = ({ maxAmount, onClose, onSuccess }) => {
    const [amount, setAmount] = useState('');
    const [method, setMethod] = useState('Cash');
    const [upiId, setUpiId] = useState('');
    const [accountHolder, setAccountHolder] = useState('');
    const [accountNumber, setAccountNumber] = useState('');
    const [ifsc, setIfsc] = useState('');
    const [bankName, setBankName] = useState('');
    const [note, setNote] = useState('');
    const [submitting, setSubmitting] = useState(false);

    const numericAmount = Number(amount);
    const amountValid = Number.isFinite(numericAmount) && numericAmount > 0 && numericAmount <= maxAmount;
    const upiValid = method !== 'UPI' || /^[\w.\-]{2,}@[\w]{2,}$/.test(upiId.trim());
    const bankValid = method !== 'Bank' || (accountHolder.trim() && accountNumber.trim() && ifsc.trim());
    const canSubmit = amountValid && upiValid && bankValid && !submitting;

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!canSubmit) return;
        setSubmitting(true);
        try {
            const body = { amount: numericAmount, method, note: note.trim() || undefined };
            if (method === 'UPI') body.upiId = upiId.trim();
            if (method === 'Bank') {
                body.accountHolder = accountHolder.trim();
                body.accountNumber = accountNumber.trim();
                body.ifsc = ifsc.trim().toUpperCase();
                if (bankName.trim()) body.bankName = bankName.trim();
            }
            const res = await api.post('/staff-wallet/withdraw', body);
            if (res.data?.success) {
                onSuccess();
            } else {
                toast.error(res.data?.message || 'Withdrawal failed.', { id: 'withdraw-err' });
            }
        } catch (err) {
            const msg = err.response?.data?.message || 'Withdrawal failed.';
            toast.error(msg, { id: 'withdraw-err' });
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-end md:items-center justify-center md:p-4">
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => !submitting && onClose()} />
            <div
                className="bg-white rounded-t-[28px] md:rounded-[28px] w-full max-w-[420px] relative z-10 px-5 sm:px-6 pt-5 animate-slideUp md:animate-scaleIn shadow-2xl max-h-[92vh] overflow-y-auto"
                style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))' }}
            >
                <div className="flex justify-between items-start mb-3 gap-3">
                    <div className="min-w-0">
                        <h2 className="text-[18px] font-bold text-[#1A181B]">Withdraw money</h2>
                        <p className="text-[12px] text-[#8D848F] mt-0.5">Available balance: ₹{Number(maxAmount).toFixed(2)}</p>
                    </div>
                    <button
                        onClick={onClose}
                        disabled={submitting}
                        className="p-2 bg-gray-100 rounded-full hover:bg-gray-200 transition-colors shrink-0"
                        aria-label="Close"
                    >
                        <X size={20} />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="space-y-3">
                    <div>
                        <label className="text-[12px] font-[600] text-[#645E66] block mb-1">Amount (₹)</label>
                        <input
                            type="number"
                            inputMode="decimal"
                            min={1}
                            max={maxAmount}
                            step="0.01"
                            value={amount}
                            onChange={(e) => setAmount(e.target.value)}
                            placeholder="0"
                            className="w-full h-[44px] px-3 rounded-[12px] border border-[#E5E5EA] focus:border-[#702083] focus:outline-none text-[15px] tabular-nums"
                            required
                        />
                        {amount && !amountValid && (
                            <p className="text-[11px] text-[#FF3B30] mt-1">
                                {numericAmount <= 0 ? 'Enter a positive amount.' : `Cannot exceed ₹${maxAmount.toFixed(2)}.`}
                            </p>
                        )}
                    </div>

                    <div>
                        <label className="text-[12px] font-[600] text-[#645E66] block mb-1">Method</label>
                        <div className="grid grid-cols-3 gap-2">
                            {['Cash', 'UPI', 'Bank'].map((m) => (
                                <button
                                    type="button"
                                    key={m}
                                    onClick={() => setMethod(m)}
                                    className={`h-[42px] rounded-[10px] text-[13px] font-[600] transition-all border ${
                                        method === m
                                            ? 'bg-[#702083] text-white border-[#702083]'
                                            : 'bg-white text-[#645E66] border-[#E5E5EA]'
                                    }`}
                                >
                                    {m}
                                </button>
                            ))}
                        </div>
                    </div>

                    {method === 'UPI' && (
                        <div>
                            <label className="text-[12px] font-[600] text-[#645E66] block mb-1">UPI ID</label>
                            <input
                                type="text"
                                value={upiId}
                                onChange={(e) => setUpiId(e.target.value)}
                                placeholder="yourname@upi"
                                className="w-full h-[44px] px-3 rounded-[12px] border border-[#E5E5EA] focus:border-[#702083] focus:outline-none text-[14px]"
                                required
                            />
                            {upiId && !upiValid && (
                                <p className="text-[11px] text-[#FF3B30] mt-1">Enter a valid UPI ID like name@upi.</p>
                            )}
                        </div>
                    )}

                    {method === 'Bank' && (
                        <div className="space-y-2">
                            <input
                                type="text"
                                value={accountHolder}
                                onChange={(e) => setAccountHolder(e.target.value)}
                                placeholder="Account holder name"
                                className="w-full h-[44px] px-3 rounded-[12px] border border-[#E5E5EA] focus:border-[#702083] focus:outline-none text-[14px]"
                                required
                            />
                            <input
                                type="text"
                                value={accountNumber}
                                onChange={(e) => setAccountNumber(e.target.value.replace(/[^0-9]/g, ''))}
                                placeholder="Account number"
                                inputMode="numeric"
                                className="w-full h-[44px] px-3 rounded-[12px] border border-[#E5E5EA] focus:border-[#702083] focus:outline-none text-[14px] tabular-nums"
                                required
                            />
                            <input
                                type="text"
                                value={ifsc}
                                onChange={(e) => setIfsc(e.target.value.toUpperCase())}
                                placeholder="IFSC code"
                                className="w-full h-[44px] px-3 rounded-[12px] border border-[#E5E5EA] focus:border-[#702083] focus:outline-none text-[14px] uppercase tracking-wider"
                                required
                            />
                            <input
                                type="text"
                                value={bankName}
                                onChange={(e) => setBankName(e.target.value)}
                                placeholder="Bank name (optional)"
                                className="w-full h-[44px] px-3 rounded-[12px] border border-[#E5E5EA] focus:border-[#702083] focus:outline-none text-[14px]"
                            />
                        </div>
                    )}

                    <div>
                        <label className="text-[12px] font-[600] text-[#645E66] block mb-1">Note (optional)</label>
                        <input
                            type="text"
                            maxLength={300}
                            value={note}
                            onChange={(e) => setNote(e.target.value)}
                            placeholder="Anything for the admin"
                            className="w-full h-[44px] px-3 rounded-[12px] border border-[#E5E5EA] focus:border-[#702083] focus:outline-none text-[14px]"
                        />
                    </div>

                    <button
                        type="submit"
                        disabled={!canSubmit}
                        className={`w-full h-[48px] rounded-[14px] font-[700] text-[15px] transition-all ${
                            canSubmit
                                ? 'bg-[#702083] text-white active:scale-[0.98]'
                                : 'bg-[#F5F5F5] text-[#B6AEB8] cursor-not-allowed'
                        }`}
                    >
                        {submitting ? 'Submitting…' : 'Request Withdrawal'}
                    </button>
                </form>
            </div>
        </div>
    );
};

export default TipHistory;
