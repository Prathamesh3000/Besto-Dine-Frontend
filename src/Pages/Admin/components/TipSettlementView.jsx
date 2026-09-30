import React, { useState, useEffect } from 'react'
import { Info, ChevronUp, ChevronDown, Search, Wallet, Receipt, RefreshCw, Loader } from 'lucide-react'
import SettlementReceiptModal from './SettlementReceiptModal'
import ConfirmSettlementModal from './ConfirmSettlementModal'
import StaffWithdrawalsView from './StaffWithdrawalsView'
import { toast } from 'react-hot-toast'
import api from '../../../utils/api'
import { resolveImageUrl } from '../../../utils/image'

// Map the Staff chip label ('Waiter' | 'Captain') to the backend role value
// (lowercase). Used to scope the Pending / History lists to the selected
// chip so captains aren't shown on the Waiter tab and vice versa.
const chipToRole = (chip) => (chip === 'Captain' ? 'captain' : 'waiter');

// ── Stat Card ─────────────────────────────────────────────────────────────────
const StatCard = ({ label, value, valueColor = 'text-[#FE8301]' }) => (
    <div className="flex-1 bg-white border border-gray-200 rounded-xl px-5 py-4 shadow-sm">
        <p className="text-[13px] font-[500] font-manrope text-gray-500 mb-1">{label}</p>
        <p className={`text-[22px] font-[700] font-manrope ${valueColor}`}>{value}</p>
    </div>
)

// ── Waiter Card (Pending) ─────────────────────────────────────────────────────
const WaiterCard = ({ waiter, onSettle, settling }) => {
    const [expanded, setExpanded] = useState(false)

    return (
        <div className={`bg-white border rounded-2xl overflow-hidden transition-all ${expanded ? 'border-[#702083]/30 shadow-[0_0_0_1.5px_#70208333]' : 'border-gray-200'}`}>
            <div className="flex items-center gap-4 px-5 py-4">
                <img
                    src={resolveImageUrl(waiter.avatar) || `https://ui-avatars.com/api/?name=${encodeURIComponent(waiter.name)}&background=random`}
                    alt={waiter.name}
                    className="w-10 h-10 rounded-full object-cover flex-shrink-0"
                />
                <div className="min-w-[110px]">
                    <p className="text-[14px] font-[700] font-manrope text-[#1A181B]">{waiter.name}</p>
                    {waiter.pendingCount > 0 && (
                        <span className="flex items-center gap-1 mt-0.5">
                            <Info size={12} className="text-[#FE8301]" />
                            <span className="text-[11px] font-[600] font-manrope text-[#FE8301]">{waiter.pendingCount} Pending</span>
                        </span>
                    )}
                </div>
                <div className="flex flex-1 gap-6">
                    <div>
                        <p className="text-[11px] font-[500] font-manrope text-gray-400">Pending Tips</p>
                        <p className="text-[15px] font-[700] font-manrope text-[#FE8301]">₹{waiter.pendingAmount}</p>
                        <p className="text-[11px] font-[500] font-manrope text-gray-400">{waiter.pendingCount} tips</p>
                    </div>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                    <button
                        onClick={() => onSettle(waiter)}
                        disabled={settling}
                        className="flex items-center gap-2 px-4 py-2.5 bg-[#FE8301] text-white rounded-xl text-[13px] font-[600] font-manrope hover:bg-orange-600 transition-colors shadow-sm whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed">
                        <Wallet size={15} />
                        Settle All Tips (₹{waiter.settleAmount})
                    </button>
                    <button onClick={() => setExpanded(!expanded)} className="p-1.5 text-gray-400 hover:text-gray-700 transition-colors">
                        {expanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                    </button>
                </div>
            </div>

            {expanded && waiter.pendingTips && waiter.pendingTips.length > 0 && (
                <div className="border-t border-gray-100 bg-[#FAFAFA] px-5 py-4">
                    <div className="flex items-center gap-2 mb-3">
                        <Info size={15} className="text-[#3B82F6]" />
                        <span className="text-[13px] font-[600] font-manrope text-[#1A181B]">
                            Pending Tips to Settle ({waiter.pendingTips.length})
                        </span>
                    </div>
                    <div className="grid grid-cols-3 gap-3 mb-4">
                        {waiter.pendingTips.map((tip) => (
                            <div key={tip._id} className="bg-white border border-gray-200 rounded-xl p-3 shadow-sm">
                                <div className="flex items-center justify-between mb-2">
                                    <span className="text-[14px] font-[700] font-manrope text-[#FE8301]">₹{tip.amount}</span>
                                    {tip.orderId && tip.orderId !== '—' && (
                                        <span className="text-[11px] font-[500] font-manrope text-gray-400">{tip.orderId}</span>
                                    )}
                                </div>
                                <div className="text-[12px] font-manrope">
                                    <span className="text-gray-400">Date: </span>
                                    <span className="font-[600] text-[#1A181B]">{new Date(tip.createdAt).toLocaleDateString()}</span>
                                    <span className="text-gray-400 ml-2">{new Date(tip.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                    <div className="flex items-center justify-between bg-white border border-green-200 rounded-xl px-4 py-3">
                        <div>
                            <p className="text-[11px] font-[500] font-manrope text-green-600">Ready to settle all {waiter.pendingTips.length} tips</p>
                            <p className="text-[15px] font-[700] font-manrope text-[#1A181B]">
                                Total Amount: <span className="text-green-600">₹{waiter.settleAmount}</span>
                            </p>
                        </div>
                        <button
                            onClick={() => onSettle(waiter)}
                            disabled={settling}
                            className="flex items-center gap-2 px-4 py-2.5 bg-[#FE8301] text-white rounded-xl text-[13px] font-[600] font-manrope hover:bg-orange-600 transition-colors shadow-sm disabled:opacity-50">
                            <Wallet size={14} />
                            Proceed to settle
                        </button>
                    </div>
                </div>
            )}
        </div>
    )
}

// ── History Transaction Card ──────────────────────────────────────────────────
const HistoryCard = ({ tx, onViewReceipt }) => (
    <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
        <div className="flex items-center gap-4 px-5 py-4">
            <div className="flex items-center gap-3 min-w-[160px]">
                <img
                    src={resolveImageUrl(tx.waiter?.avatar) || `https://ui-avatars.com/api/?name=${encodeURIComponent(tx.waiter?.name || 'W')}&background=random`}
                    alt=""
                    className="w-10 h-10 rounded-full object-cover flex-shrink-0"
                />
                <div>
                    <p className="text-[14px] font-[700] font-manrope text-[#1A181B]">{tx.waiter?.name}</p>
                    <span className="px-2 py-0.5 bg-green-50 border border-green-200 rounded-full text-[11px] font-[600] font-manrope text-green-600">
                        Settled
                    </span>
                </div>
            </div>

            <div className="flex-1">
                <p className="text-[11px] font-[500] font-manrope text-gray-400 mb-0.5">Amount Paid</p>
                <p className="text-[16px] font-[700] font-manrope text-[#FE8301]">₹{tx.amount}</p>
            </div>

            <div className="flex-1">
                <p className="text-[11px] font-[500] font-manrope text-gray-400 mb-0.5">Tips Settled</p>
                <p className="text-[16px] font-[700] font-manrope text-[#1A181B]">{tx.tipsSettledCount} tips</p>
            </div>

            <div className="flex-1">
                <p className="text-[11px] font-[500] font-manrope text-gray-400 mb-0.5">Payment Method</p>
                <span className={`px-3 py-1 rounded-full text-[12px] font-[600] font-manrope border ${tx.paymentMethod === 'Cash'
                    ? 'bg-orange-50 border-orange-200 text-orange-600'
                    : 'bg-blue-50 border-blue-200 text-blue-600'
                    }`}>
                    {tx.paymentMethod}
                </span>
            </div>

            <div className="flex-1">
                <p className="text-[11px] font-[500] font-manrope text-gray-400 mb-0.5">Date & Time</p>
                <p className="text-[14px] font-[700] font-manrope text-[#1A181B]">{new Date(tx.createdAt).toLocaleDateString()}</p>
                <p className="text-[11px] font-[500] font-manrope text-gray-400">{new Date(tx.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
            </div>

            <button
                onClick={() => onViewReceipt(tx)}
                className="flex items-center gap-2 px-4 py-2.5 border border-[#FE8301] text-[#FE8301] rounded-xl text-[13px] font-[600] font-manrope hover:bg-orange-50 transition-colors whitespace-nowrap flex-shrink-0">
                <Receipt size={15} />
                View Receipt
            </button>
        </div>
        {tx.note && (
           <div className="mx-5 mb-2 px-4 py-2.5 bg-[#EFF6FF] border border-[#BFDBFE] rounded-xl">
               <span className="text-[12px] font-[600] font-manrope text-[#1E40AF]">Note: </span>
               <span className="text-[12px] font-[500] font-manrope text-[#3B82F6]">{tx.note}</span>
           </div>
        )}
        <div className="flex items-center gap-1.5 px-5 pb-3">
            <RefreshCw size={12} className="text-gray-400" />
            <span className="text-[12px] font-[500] font-manrope text-gray-400">
                Settled by {tx.settledBy?.name}
            </span>
        </div>
    </div>
)

// ── Settlements History Tab Content ──────────────────────────────────────────
const SettlementsHistory = ({ roleFilter }) => {
    const [history, setHistory] = useState([])
    const [loading, setLoading] = useState(true)
    const [selectedReceipt, setSelectedReceipt] = useState(null)

    useEffect(() => {
        const fetchHistory = async () => {
            try {
                const res = await api.get('/tips/history');
                if (res.data.success) setHistory(res.data.history);
            } catch (err) {
                toast.error('Failed to load settlement history');
            } finally {
                setLoading(false);
            }
        };
        fetchHistory();
    }, []);

    // Scope the history list to the chip (Waiter | Captain). Older
    // settlement rows whose populated user has no role field (backfill
    // edge case) fall through as 'waiter' so they still render.
    const wantRole = chipToRole(roleFilter);
    const scopedHistory = history.filter(h => (h.waiter?.role || 'waiter') === wantRole);
    const totalAmount = scopedHistory.reduce((sum, h) => sum + h.amount, 0);

    if (loading) {
        return (
            <div className="flex items-center justify-center py-16">
                <Loader size={24} className="animate-spin text-[#FE8301]" />
            </div>
        )
    }

    return (
        <div className="space-y-4">
            <div className="bg-green-50 border border-green-200 rounded-xl px-5 py-3">
                <div className="flex items-center gap-2 mb-0.5">
                    <RefreshCw size={14} className="text-green-600" />
                    <span className="text-[13px] font-[700] font-manrope text-green-700">Settlement History & Records</span>
                </div>
                <p className="text-[12px] font-[500] font-manrope text-green-600">
                    View all past tip settlements. Click on any transaction to view full details.
                </p>
            </div>

            <div className="flex gap-4">
                <StatCard label="Total Settlements" value={scopedHistory.length} valueColor="text-[#1A181B]" />
                <StatCard label="Total Amount Settled" value={`₹${totalAmount}`} valueColor="text-[#702083]" />
            </div>

            <p className="text-[14px] font-[700] font-manrope text-[#1A181B]">
                All Transactions ({String(scopedHistory.length).padStart(2, '0')})
            </p>

            {scopedHistory.length === 0 ? (
                <div className="text-center py-10">
                    <p className="text-[14px] text-gray-400 font-manrope">
                        No {roleFilter === 'Captain' ? 'captain' : 'waiter'} settlements yet
                    </p>
                </div>
            ) : (
                <div className="space-y-3">
                    {scopedHistory.map(tx => (
                        <HistoryCard
                            key={tx._id}
                            tx={tx}
                            onViewReceipt={(t) => setSelectedReceipt(t)}
                        />
                    ))}
                </div>
            )}

            {selectedReceipt && (
                <SettlementReceiptModal
                    tx={selectedReceipt}
                    onClose={() => setSelectedReceipt(null)}
                />
            )}
        </div>
    )
}

// ── Main View ─────────────────────────────────────────────────────────────────
const TipSettlementView = ({ searchTerm, setSearchTerm, roleFilter = 'Waiter' }) => {
    const [activeTab, setActiveTab] = useState('pending')
    const [howItWorksOpen, setHowItWorksOpen] = useState(false)
    const [selectedWaiter, setSelectedWaiter] = useState(null)
    const [waiters, setWaiters] = useState([])
    const [loading, setLoading] = useState(true)
    const [settling, setSettling] = useState(false)

    // Labels switch with the selected chip. The backend treats both the
    // same (Tip.waiter is just a User ref), so only the UI copy changes.
    const isCaptain = roleFilter === 'Captain'
    const roleSingular = isCaptain ? 'captain' : 'waiter'
    const rolePluralCap = isCaptain ? 'Captains' : 'Waiters'

    const fetchPending = async () => {
        try {
            setLoading(true);
            const res = await api.get('/tips/pending');
            if (res.data.success) setWaiters(res.data.waiters);
        } catch (err) {
            toast.error('Failed to load pending tips');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (activeTab === 'pending') fetchPending();
    }, [activeTab]);

    const handleSettleConfirm = async (data) => {
        if (settling) return; // prevent double-click
        setSettling(true);
        try {
            const res = await api.post('/tips/settle', {
                waiterId: selectedWaiter._id,
                paymentMethod: data.paymentMethod,
                note: data.note
            });
            if (res.data.success) {
                setSelectedWaiter(null);
                fetchPending();
                toast.success(`₹${res.data.settlement.amount} settled for ${res.data.settlement.waiter?.name || 'waiter'}`);
            }
        } catch (err) {
            toast.error(err.response?.data?.message || 'Settlement failed. Please try again.');
        } finally {
            setSettling(false);
        }
    };

    // Scope the aggregated list to the selected chip. Old tip rows
    // whose user has no role field fall through as 'waiter' so they
    // still show up on the Waiter tab instead of disappearing.
    const wantRole = chipToRole(roleFilter)
    const scoped = waiters.filter(w => (w.role || 'waiter') === wantRole)

    const filtered = scoped.filter(w =>
        w.name.toLowerCase().includes((searchTerm || '').toLowerCase())
    )

    const totalPending = scoped.reduce((sum, w) => sum + w.pendingAmount, 0);

    return (
        <div className="space-y-4">
            <div className="flex gap-4">
                <StatCard label="Total Pending Settlement" value={`₹${totalPending}`} valueColor="text-[#FE8301]" />
                <StatCard label={`${rolePluralCap} Pending`} value={scoped.length} valueColor="text-green-600" />
            </div>

            <div className="flex items-center gap-2">
                <button
                    onClick={() => setActiveTab('pending')}
                    className={`px-5 py-[7px] rounded-full text-[13px] transition-all border ${activeTab === 'pending' ? 'bg-[#FE8301] text-white border-[#FE8301] font-[600]' : 'bg-white text-gray-500 border-gray-300'}`}
                >
                    Pending Settlements ({scoped.length})
                </button>
                <button
                    onClick={() => setActiveTab('history')}
                    className={`px-5 py-[7px] rounded-full text-[13px] transition-all border ${activeTab === 'history' ? 'bg-[#FE8301] text-white border-[#FE8301] font-[600]' : 'bg-white text-gray-500 border-gray-300'}`}
                >
                    Settlements History
                </button>
                <button
                    onClick={() => setActiveTab('withdrawals')}
                    className={`px-5 py-[7px] rounded-full text-[13px] transition-all border ${activeTab === 'withdrawals' ? 'bg-[#FE8301] text-white border-[#FE8301] font-[600]' : 'bg-white text-gray-500 border-gray-300'}`}
                >
                    Withdrawals
                </button>
            </div>

            {activeTab === 'history' && <SettlementsHistory roleFilter={roleFilter} />}
            {activeTab === 'withdrawals' && <StaffWithdrawalsView />}

            {activeTab === 'pending' && (
                <>
                    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                        <button onClick={() => setHowItWorksOpen(!howItWorksOpen)} className="w-full flex items-center justify-between px-5 py-3.5">
                            <div className="flex items-center gap-2.5">
                                <Info size={13} className="text-[#3B82F6]" />
                                <span className="text-[14px] font-[600]">How Tip Settlement Works</span>
                            </div>
                            {howItWorksOpen ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                        </button>
                        {howItWorksOpen && (
                            <div className="px-5 pb-4 text-[13px] text-gray-500 border-t pt-3 space-y-1">
                                <p>1. Customers add tips when paying their bill.</p>
                                <p>2. Tips are held as "pending" until an admin settles them.</p>
                                <p>3. Click "Settle All Tips" to pay a {roleSingular} their pending tips.</p>
                                <p>4. Choose payment method (Cash or Online) and confirm.</p>
                                <p>5. All settled tips are recorded with a receipt for audit.</p>
                            </div>
                        )}
                    </div>

                    <div className="flex items-center gap-3 bg-white border rounded-xl px-4 py-3">
                        <Search size={18} className="text-gray-400" />
                        <input
                            type="text"
                            placeholder={`Search by ${roleSingular} name`}
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="flex-1 text-[14px] focus:outline-none"
                        />
                    </div>

                    <p className="text-[14px] font-[700]">All {rolePluralCap} ({filtered.length})</p>

                    {loading ? (
                        <div className="flex items-center justify-center py-16">
                            <Loader size={24} className="animate-spin text-[#FE8301]" />
                        </div>
                    ) : filtered.length === 0 ? (
                        <div className="text-center py-10">
                            <p className="text-[14px] text-gray-400 font-manrope">
                                {scoped.length === 0 ? `No pending tips to settle for ${roleSingular}s` : `No ${roleSingular}s match your search`}
                            </p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {filtered.map(waiter => (
                                <WaiterCard
                                    key={waiter._id}
                                    waiter={waiter}
                                    settling={settling}
                                    onSettle={(w) => setSelectedWaiter(w)}
                                />
                            ))}
                        </div>
                    )}
                </>
            )}

            {selectedWaiter && (
                <ConfirmSettlementModal
                    waiter={selectedWaiter}
                    settling={settling}
                    onClose={() => { if (!settling) setSelectedWaiter(null) }}
                    onConfirm={handleSettleConfirm}
                />
            )}
        </div>
    )
}

export default TipSettlementView
