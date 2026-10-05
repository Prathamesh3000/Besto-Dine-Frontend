import React, { useState, useEffect, useCallback } from 'react';
import { Search, LogOut } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../Context/AuthContext';
import api from '../../utils/api';
import { activeRestaurantPath } from '../../utils/tenant';
import BottomNav from '../../Components/Loggedin/BottomNav';
import VoiceSearchButton from '../../Components/Loggedin/VoiceSearchButton';
import useSocketEvent from '../../hooks/useSocketEvent';
import { markDineInBillSettled } from '../../utils/dineInSession';
import useCustomerSession from '../../hooks/useCustomerSession';
import { getCustomerOrderSession, readRecoveryOrderIds, forgetOrderIds } from '../../utils/customerOrderIds';

function getTableName() {
  try {
    const dt = JSON.parse(localStorage.getItem('dineInTable') || '{}');
    return dt.name || localStorage.getItem('tableNumber') || null;
  } catch { return localStorage.getItem('tableNumber') || null; }
}

const AUTO_EXIT_MS = 5 * 60 * 1000; // 5 minutes

// Bill Card Component
const BillCard = ({ bill, onClick }) => {
  const itemNames = (bill.items || [])
    .map((i) => i.name || i.title)
    .filter(Boolean);
  const title =
    itemNames.length > 0
      ? itemNames.join(', ')
      : `Order (${bill.itemCount} items)`;
  const itemCountLabel =
    bill.itemCount === 1 ? '1 item' : `${bill.itemCount} items`;
  return (
    <div
      onClick={onClick}
      className="mb-3 flex items-center gap-3 cursor-pointer active:scale-[0.98] transition-transform"
    >
      {/* Status Icon */}
      <div
        className={`w-10 h-10 rounded-[10px] ${
          bill.status === 'Paid' ? 'bg-[#E5FFEB]' : 'bg-[#FFF3E6]'
        } flex items-center justify-center shrink-0`}
      >
        <i
          className={`${
            bill.status === 'Paid'
              ? 'fi fi-sr-check-circle text-[#00C22B]'
              : 'fi fi-sr-clock text-[#FE8301]'
          } text-[18px]`}
        />
      </div>

      {/* Bill Details */}
      <div className="flex-1 min-w-0">
        <h3 className="font-semibold text-[#101828] nunito text-base truncate">
          {title}
        </h3>
        <p className="text-xs text-[#6A7282] font-normal varela-rounded truncate">
          {itemCountLabel}
          {bill.time ? ` · ${bill.time}` : ''} · {bill.paymentMethod} ·{' '}
          <span
            className={
              bill.status === 'Paid' ? 'text-[#00C22B]' : 'text-[#FE8301]'
            }
          >
            {bill.status}
          </span>
        </p>
      </div>

      {/* Amount */}
      <div className="flex items-center gap-2 shrink-0">
        <span className="font-semibold nunito text-[#101828] text-base tabular-nums">
          ₹{Number(bill.amount || 0).toFixed(2)}
        </span>
      </div>
    </div>
  );
};

function Bill() {
  const navigate = useNavigate();
  const { user, isLoggedIn, isGuest, exitGuestMode } = useAuth();
  // Table label is hidden once the visit is settled (bill paid).
  const { showTableChrome } = useCustomerSession();
  const [searchQuery, setSearchQuery] = useState('');
  const [bills, setBills] = useState([]);
  const [loading, setLoading] = useState(true);

  // Guest auto-exit: check if bill was paid and start countdown
  const guestBillPaidAt = isGuest ? localStorage.getItem('guest_bill_paid_at') : null;
  const isBillPaid = !!guestBillPaidAt;

  const [autoExitCountdown, setAutoExitCountdown] = useState(null);

  const handleExit = useCallback(() => {
    exitGuestMode();
    navigate(activeRestaurantPath(), { replace: true });
  }, [exitGuestMode, navigate]);

  // Auto-exit timer for guests after bill payment
  useEffect(() => {
    if (!isGuest || !guestBillPaidAt) return;

    const paidTime = parseInt(guestBillPaidAt, 10);
    const elapsed = Date.now() - paidTime;
    const remaining = AUTO_EXIT_MS - elapsed;

    // Already expired
    if (remaining <= 0) {
      handleExit();
      return;
    }

    // Update countdown every second
    const interval = setInterval(() => {
      const now = Date.now();
      const left = AUTO_EXIT_MS - (now - paidTime);
      if (left <= 0) {
        clearInterval(interval);
        handleExit();
      } else {
        setAutoExitCountdown(Math.ceil(left / 1000));
      }
    }, 1000);

    setAutoExitCountdown(Math.ceil(remaining / 1000));

    return () => clearInterval(interval);
  }, [isGuest, guestBillPaidAt, handleExit]);

  const formatDate = (dateStr) => {
    const date = new Date(dateStr);
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);

    if (date.toDateString() === today.toDateString()) return 'Today';
    if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
    return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  const formatTime = (dateStr) => {
    return new Date(dateStr).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true });
  };

  const fetchBills = async () => {
    setLoading(true);
    try {
      if (isLoggedIn) {
        const res = await api.get('/invoices/my-invoices');
        if (res.data?.success && res.data.invoices) {
          const mapped = res.data.invoices.map((inv) => ({
            id: inv._id,
            itemCount: inv.items?.length || 0,
            paymentMethod: inv.paymentMethod || 'Cash',
            status: inv.paymentStatus === 'paid' ? 'Paid' : 'Unpaid',
            amount: inv.total,
            date: formatDate(inv.createdAt || inv.date),
            time: formatTime(inv.createdAt || inv.date),
            items: inv.items || [],
          }));
          setBills(mapped);
          setLoading(false);
          return;
        }
      }
      // Guests (or invoice fetch failed): bills from the server via the
      // remembered order IDs.
      await loadLocalBills();
    } catch (err) {
      console.error('Failed to fetch bills:', err);
      await loadLocalBills();
    } finally {
      setLoading(false);
    }
  };

  // Guest bills (#22): the device keeps only order IDs; every order is
  // re-fetched through /orders/:id/detail, which enforces ownership
  // (scan session / owner), so a stale or foreign ID just 404s.
  const loadLocalBills = async () => {
    try {
      const session = getCustomerOrderSession(user, isLoggedIn);
      const ids = readRecoveryOrderIds(session);
      if (!ids.length) {
        setBills([]);
        return;
      }
      const results = await Promise.allSettled(
        ids.map((id) => api.get(`/orders/${encodeURIComponent(id)}/detail`, { _silent: true, _isBackground: true })),
      );
      const serverOrders = [];
      const dead = [];
      results.forEach((r, i) => {
        if (r.status === 'fulfilled' && r.value?.data?.success && r.value.data.order) {
          serverOrders.push(r.value.data.order);
        } else if (r.status === 'rejected' && r.reason?.response?.status === 404) {
          dead.push(ids[i]);
        }
      });
      forgetOrderIds(session, dead);
      const cancelledMap = JSON.parse(localStorage.getItem('cancelled_orders_v1') || '{}');
      const isCancelled = (o) => {
        const st = (o.status || '').toString().toLowerCase();
        if (st === 'cancelled' || st === 'canceled') return true;
        const key = o._id || o.orderId;
        return !!(key && (cancelledMap[key] || cancelledMap[o.orderId]));
      };
      // When the table bill has been settled (by staff at the counter or
      // the customer online), `guest_bill_paid_at` is stamped for the
      // session — treat the whole settled session as Paid so the Recent
      // rows don't lag behind a counter settle.
      const sessionBillPaid = !!localStorage.getItem('guest_bill_paid_at');
      const mapped = serverOrders
        .filter((order) => !isCancelled(order))
        .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
        .map((order) => {
          const when = order.createdAt || new Date().toISOString();
          const st = (order.status || '').toString().toLowerCase();
          return {
            id: order._id || order.orderId,
            itemCount: order.items?.length || 0,
            paymentMethod: order.paymentMethod || 'Cash',
            status: (order.paymentStatus === 'Paid' || sessionBillPaid) ? 'Paid' : (st === 'served' || st === 'delivered' ? 'Unpaid' : 'Pending'),
            amount: order.total || 0,
            date: formatDate(when),
            time: formatTime(when),
            items: order.items || [],
          };
        });
      setBills(mapped);
    } catch {
      setBills([]);
    }
  };

  useEffect(() => {
    fetchBills();
    const onSync = () => fetchBills();
    window.addEventListener('storage_sync', onSync);
    window.addEventListener('storage', onSync);
    return () => {
      window.removeEventListener('storage_sync', onSync);
      window.removeEventListener('storage', onSync);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Live sync — when staff (or the customer) settles the bill server-side,
  // the order's `paymentStatus` flips to Paid and an `order:updated` fires
  // to the table / order rooms the customer is in. Without this the
  // customer's Bill page kept showing the stale "Unpaid" rows from
  // localStorage. On a paid update we stamp the guest "bill paid" marker
  // (drives the completion banner + flips the Recent rows to Paid in
  // loadLocalBills) and refetch.
  const handlePaidSocket = (payload) => {
    if (isGuest && payload?.paymentStatus === 'Paid') {
      try {
        if (!localStorage.getItem('guest_bill_paid_at')) {
          localStorage.setItem('guest_bill_paid_at', Date.now().toString());
        }
      } catch { /* ignore */ }
      // Close the dine-in visit everywhere (service buttons, table
      // pill, cart) — the timestamp alone doesn't notify same-tab
      // subscribers.
      markDineInBillSettled();
    }
    fetchBills();
  };
  useSocketEvent('order:updated', handlePaidSocket);
  useSocketEvent('order:appended', () => fetchBills());
  useSocketEvent('order:new', () => fetchBills());

  const handleBillClick = (billId) => {
    navigate(`/bill/${billId}`);
  };

  // Search (typed or voice) — the box used to be decorative. Matches
  // item names, status, payment method, amount and date.
  const query = searchQuery.trim().toLowerCase();
  const visibleBills = query
    ? bills.filter((bill) => [
        ...(bill.items || []).map((i) => i.name || i.title),
        bill.status, bill.paymentMethod, bill.date, bill.time,
        bill.amount != null ? String(bill.amount) : '',
      ].some((v) => String(v || '').toLowerCase().includes(query)))
    : bills;

  // Group bills by date
  const groupedBills = visibleBills.reduce((acc, bill) => {
    if (!acc[bill.date]) {
      acc[bill.date] = [];
    }
    acc[bill.date].push(bill);
    return acc;
  }, {});

  // Format countdown for display
  const formatCountdown = (seconds) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="min-h-screen bg-[#FFFFFF]-900 pb-24 sm:pb-32 transition-colors duration-200">
      {/* Header */}
      <header className="bg-white sticky top-0 z-40 border-b border-gray-100 transition-colors">
        <div className="flex items-center justify-between px-4 py-2 ">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate(-1)}
              className="p-1 -ml-1 rounded-full hover:bg-gray-100  active:scale-95 transition-transform"
            >
              <i size={20} className="fi fi-br-angle-left text-[#666666]" />
            </button>
            <h1 className="text-base nunito font-medium text-[#1A181B]">Bill</h1>
          </div>
          {showTableChrome && getTableName() && (
            <span className="text-[#666666] varela-rounded font-normal text-sm">Table {getTableName()}</span>
          )}
        </div>


        {/* Search Bar */}
        <div className="px-4  pb-4">
          <div className=" flex items-center gap-4 sm:gap-4 h-[46px] sm:h-[50px] bg-[#FFFFFF] rounded-full px-4 border border-[#EEEEFF]  transition-colors">
            <i className="fi fi-br-search text-[#666666]  flex-shrink-0" size={20} />
            <input
              type="text"
              placeholder="Search...."
              aria-label="Search bills"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="flex-1 bg-transparent border-none outline-none text-gray-700 placeholder:text-gray-400 text-sm"
            />
            <div className="h-5 w-[1px] bg-gray-300-600"></div>
            <VoiceSearchButton size={20} onResult={(text) => setSearchQuery(text)} />
          </div>
        </div>
      </header>

      {/* Guest: Exit banner after bill paid */}
      {isGuest && isBillPaid && (
        <div className="mx-4 mt-4 bg-[#F0FDF4] border border-[#D1FAE5] rounded-[16px] p-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="text-[16px] font-[700] text-[#1A181B] font-nunito">Payment Complete!</h3>
              <p className="text-[13px] font-[500] text-[#645E66] mt-0.5">
                Thank you for dining with us.
              </p>
            </div>
            <div className="w-12 h-12 bg-[#E5FFEB] rounded-full flex items-center justify-center">
              <i className="fi fi-sr-check-circle text-[#00C22B] text-[22px]" />
            </div>
          </div>

          {autoExitCountdown !== null && (
            <p className="text-[12px] text-[#8D848F] font-[500] mb-3">
              Session ends automatically in <span className="text-[#FE8301] font-[700]">{formatCountdown(autoExitCountdown)}</span>
            </p>
          )}

          <button
            onClick={handleExit}
            className="w-full bg-[#FE8301] text-white font-nunito font-semibold text-[14px] py-3 rounded-[12px] active:scale-[0.98] transition-all flex items-center justify-center gap-2"
          >
            <LogOut size={18} />
            Exit
          </button>
        </div>
      )}

      {/* Bills List */}
      <main className="px-4  pt-4  ">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-8 h-8 border-3 border-gray-200 border-t-orange-500 rounded-full animate-spin"></div>
          </div>
        ) : Object.entries(groupedBills).length > 0 ? (
          Object.entries(groupedBills).map(([date, dateBills]) => (
          <div key={date} className="gap-1 space-y-2">
            <h2 className="nunito text-lg font-semibold   text-[#101828] ">
              {date === 'Today' ? 'Recent' : date}
            </h2>
            {dateBills.map((bill) => (
              <BillCard
                key={bill.id}
                bill={bill}
                onClick={() => handleBillClick(bill.id)}
              />
            ))}
          </div>
        ))
        ) : (
          <div className="flex flex-col items-center justify-center py-12 sm:py-16 text-center">
            <div className="w-24 h-24 sm:w-32 sm:h-32 bg-gray-100 rounded-full flex items-center justify-center mb-4">
              <Search size={36} className="sm:size-48 text-gray-300" />
            </div>
            <h2 className="text-lg sm:text-xl font-bold text-gray-900 mb-2">{query && bills.length > 0 ? 'No matching bills' : 'No bills yet'}</h2>
            <p className="text-gray-500 text-sm sm:text-base">
              {query && bills.length > 0 ? `Nothing matches "${searchQuery.trim()}".` : 'Your bill will appear here after you place an order'}
            </p>
          </div>
        )}
      </main>

      <BottomNav />
    </div>
  );
}

export default Bill;
