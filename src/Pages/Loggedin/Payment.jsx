import React, { useState, useEffect, useRef } from 'react';
import {
  Smartphone, Wallet, Banknote, ChevronLeft, ShieldCheck, Lock, Check,
  AlertCircle,
} from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import api, { razorpayAPI, walletAPI, settingsAPI } from '../../utils/api';
import { useAuth } from '../../Context/AuthContext';
import { markDineInBillSettled } from '../../utils/dineInSession';
import { rememberOrderIds, getCustomerOrderSession } from '../../utils/customerOrderIds';
import toast from 'react-hot-toast';

// Payment Method Card — richer, accessible radio-card.
//
// Shows method-specific accent color (orange for online, blue for
// wallet, green for cash), an info chip (Recommended / Fastest /
// Insufficient), and a check tick when selected. Disabled cards keep
// their iconography but greyscale so the customer understands WHY
// it's unavailable instead of seeing it just vanish.
const PaymentOption = ({
  icon: Icon, title, subtitle, selected, onClick, disabled,
  accent = 'orange', badge, badgeTone = 'neutral',
}) => {
  const accentTokens = {
    orange: { bg: 'bg-[#FFF5E9]', icon: 'text-[#FE8301]', ring: 'border-[#FE8301]' },
    blue:   { bg: 'bg-[#EAF1FF]', icon: 'text-[#4D7CFF]', ring: 'border-[#4D7CFF]' },
    green:  { bg: 'bg-[#E5FFEB]', icon: 'text-[#34C759]', ring: 'border-[#34C759]' },
  }[accent] || { bg: 'bg-[#FFF5E9]', icon: 'text-[#FE8301]', ring: 'border-[#FE8301]' };
  const badgeTones = {
    success: 'text-[#027A48] bg-[#E5FFEB]',
    info:    'text-[#4D7CFF] bg-[#EAF1FF]',
    warning: 'text-[#B54708] bg-[#FFF5E9]',
    danger:  'text-[#EF4F5F] bg-[#FFE2E2]',
    neutral: 'text-[#645E66] bg-[#F7F7F7]',
  };
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`w-full flex items-center gap-3 p-4 border-2 rounded-2xl text-left transition-all ${
        disabled ? 'opacity-55 cursor-not-allowed bg-gray-50 border-gray-100' : ''
      } ${selected && !disabled
        ? `${accentTokens.ring} bg-white shadow-[0_2px_15px_-6px_rgba(254,131,1,0.25)]`
        : !disabled ? 'bg-white border-[#EFEFEF] hover:border-[#D0D5DD] active:scale-[0.99]' : ''
      }`}
    >
      <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${
        disabled ? 'bg-gray-100 text-gray-400' : `${accentTokens.bg} ${accentTokens.icon}`
      }`}>
        <Icon size={22} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <h3 className={`font-nunito font-semibold text-[15px] truncate ${
            disabled ? 'text-gray-400' : 'text-[#101828]'
          }`}>
            {title}
          </h3>
          {badge && (
            <span className={`shrink-0 text-[10px] font-nunito font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full ${badgeTones[badgeTone] || badgeTones.neutral}`}>
              {badge}
            </span>
          )}
        </div>
        <p className={`text-[12px] font-varela truncate ${
          disabled ? 'text-gray-400' : 'text-[#645E66]'
        }`}>
          {subtitle}
        </p>
      </div>
      <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 transition-all ${
        selected && !disabled
          ? 'bg-[#FE8301]'
          : 'border-2 border-[#D0D5DD]'
      }`}>
        {selected && !disabled && <Check size={14} className="text-white" strokeWidth={3} />}
      </div>
    </button>
  );
};

// One idempotency key per checkout attempt (duplicate-order guard).
function generateIdempotencyKey() {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return `web-${crypto.randomUUID()}`;
    }
    if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
      const bytes = crypto.getRandomValues(new Uint8Array(16));
      return `web-${Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('')}`;
    }
  } catch { /* fall through */ }
  return `web-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 14)}`;
}

// Load Razorpay script dynamically
function loadRazorpayScript() {
  return new Promise((resolve) => {
    if (window.Razorpay) {
      resolve(true);
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

function Payment() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, isLoggedIn, isGuest } = useAuth();

  let tableData = {};
  try { tableData = JSON.parse(localStorage.getItem('dineInTable') || '{}'); } catch { /* corrupted localStorage */ }
  const tableNumber = tableData.name || location.state?.tableNumber || '';

  // Page-reload resilience: the cart hands this page the draft order via
  // location.state. A refresh or accidental back+forward drops that state and
  // the customer is stranded with no way to finish paying. Mirror the state
  // into sessionStorage so the next render can rebuild it.
  const DRAFT_KEY = 'payment_draft_v1';
  const rehydrated = React.useMemo(() => {
    if (location.state?.orderPayload || location.state?.orderId || location.state?.backendOrderId) {
      return null;
    }
    try {
      const raw = sessionStorage.getItem(DRAFT_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  }, [location.state]);

  const existingOrderId = location.state?.orderId || location.state?.backendOrderId || rehydrated?.orderId || null;

  const orderPayload = location.state?.orderPayload || rehydrated?.orderPayload || null;
  const cartItemsForStorage = location.state?.cartItemsForStorage || rehydrated?.cartItemsForStorage || null;
  const isTakeawayDeferred = !!orderPayload;

  const totalAmount = location.state?.total || orderPayload?.total || rehydrated?.total || 0;

  // Idempotency key for the deferred order create. Cart.jsx stamps one on
  // the payload; older drafts may not have it, so mint one once and keep
  // it (ref + the sessionStorage draft below) for every retry of this
  // checkout. It is dropped with the draft on successful payment.
  const idemKeyRef = useRef(
    orderPayload?.clientIdempotencyKey
      || rehydrated?.idempotencyKey
      || (orderPayload ? generateIdempotencyKey() : null)
  );

  // Persist the draft on entry so a refresh mid-payment doesn't lose state.
  // Cleared by the successful-payment navigation helper below.
  useEffect(() => {
    if (!location.state) return;
    try {
      sessionStorage.setItem(DRAFT_KEY, JSON.stringify({
        orderId: location.state.orderId || location.state.backendOrderId || null,
        orderPayload: location.state.orderPayload || null,
        cartItemsForStorage: location.state.cartItemsForStorage || null,
        total: location.state.total || null,
        tableNumber: location.state.tableNumber || null,
        idempotencyKey: idemKeyRef.current || null,
      }));
    } catch { /* sessionStorage unavailable — fall back to in-memory only */ }
  }, [location.state]);

  const [selectedMethod, setSelectedMethod] = useState(null);
  // Inline error for "method not chosen" — replaces the toast that
  // fired far away from the payment cards.
  const [methodError, setMethodError] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [walletBalance, setWalletBalance] = useState(0);
  const [merchantName, setMerchantName] = useState('BestoDine');
  // Counter-payment "Waiting for staff" overlay state. Flipped on
  // when the customer commits to Pay-at-Counter; flipped off on
  // admin's mark-paid socket event or customer cancel.
  const [waitingForCounter, setWaitingForCounter] = useState(false);

  // Fetch wallet balance and merchant name
  useEffect(() => {
    if (isLoggedIn) {
      walletAPI.getWallet()
        .then(({ data }) => setWalletBalance(data.balance || 0))
        .catch(() => toast.error('Could not load wallet balance'));
    }
    settingsAPI.getSettings()
      .then(res => {
        // GET /settings returns the settings object at the top level.
        const name = res?.data?.general?.cafeName;
        if (name) setMerchantName(name);
      })
      .catch(() => {});
  }, [isLoggedIn]);

  // While the counter-payment overlay is up, watch for the order to
  // flip to Paid. Two paths feed the same handler — primary socket
  // event + 5s fallback poll — so a dropped socket still resolves
  // the wait reliably without forcing the customer to refresh.
  useEffect(() => {
    if (!waitingForCounter || !existingOrderId) return;
    let cancelled = false;
    let socket = null;

    const onPaid = (paymentMethod = 'cash') => {
      if (cancelled) return;
      cancelled = true;
      setWaitingForCounter(false);
      // Mark dine-in session as billed-and-paid so the customer's
      // app locks the Add / Place-Order buttons until they re-scan
      // the QR. Goes through the shared utility so any other surface
      // that subscribes (banners, hook) re-renders.
      markDineInBillSettled();
      try { localStorage.setItem('guest_bill_paid_at', Date.now().toString()); } catch { /* ignore */ }
      toast.success('Payment received. Thank you!', { id: 'counter-paid', duration: 4000 });
      if (isTakeawayDeferred) {
        navigate('/customer/order-confirmed', {
          replace: true,
          state: {
            orderId: existingOrderId,
            items: cartItemsForStorage || [],
            total: totalAmount,
            isTakeaway: true,
            paymentMethod,
          },
        });
      } else if (isGuest) {
        navigate('/customer/bill', { replace: true });
      } else {
        navigate('/customer/orders', { replace: true });
      }
    };

    // ── Socket path ─────────────────────────────────────────────────
    let unsubSocket = () => {};
    (async () => {
      try {
        const { getSocket, joinRoom } = await import('../../utils/socket');
        socket = getSocket();
        joinRoom(`order:${existingOrderId}`);
        const handleOrderUpdated = (data) => {
          if (!data?.orderId || data.orderId !== existingOrderId) return;
          if (String(data.paymentStatus).toLowerCase() === 'paid') {
            onPaid(data.paymentMethod || 'cash');
          }
        };
        socket.on('order:updated', handleOrderUpdated);
        unsubSocket = () => socket.off('order:updated', handleOrderUpdated);
      } catch { /* socket may be unavailable — poll covers it */ }
    })();

    // ── Fallback poll (5s) ──────────────────────────────────────────
    const pollId = setInterval(async () => {
      if (cancelled) return;
      try {
        const res = await api.get(`/orders/${existingOrderId}/detail`, { _isBackground: true });
        const order = res.data?.order;
        if (order && String(order.paymentStatus).toLowerCase() === 'paid') {
          onPaid(order.paymentMethod || 'cash');
        }
      } catch { /* keep polling */ }
    }, 5000);

    return () => {
      cancelled = true;
      clearInterval(pollId);
      try { unsubSocket(); } catch { /* ignore */ }
    };
  }, [waitingForCounter, existingOrderId, isGuest, isTakeawayDeferred, navigate, totalAmount, cartItemsForStorage]);

  // Compute the wallet method's state once so the card can show a
  // helpful subtitle in every situation (logged out / insufficient
  // balance / good to go) and the disabled flag stays consistent
  // with the rendered copy.
  const walletInsufficient = isLoggedIn && walletBalance < totalAmount;
  const walletSubtitle = !isLoggedIn
    ? 'Login required to use wallet'
    : walletInsufficient
      ? `Only ₹${walletBalance.toFixed(2)} available · need ₹${(totalAmount - walletBalance).toFixed(2)} more`
      : `Balance ₹${walletBalance.toFixed(2)} · pays the full bill`;

  const paymentMethods = [
    {
      id: 'online',
      icon: Smartphone,
      title: 'Pay Online',
      subtitle: 'UPI, Card, Net Banking — secured by Razorpay',
      accent: 'orange',
      badge: 'Recommended',
      badgeTone: 'warning',
    },
    {
      id: 'wallet',
      icon: Wallet,
      title: 'Pay from Wallet',
      subtitle: walletSubtitle,
      disabled: !isLoggedIn || walletInsufficient,
      accent: 'blue',
      badge: !isLoggedIn ? 'Login' : walletInsufficient ? 'Low' : 'Instant',
      badgeTone: !isLoggedIn ? 'neutral' : walletInsufficient ? 'danger' : 'info',
    },
    {
      id: 'cash',
      icon: Banknote,
      title: 'Pay at Counter',
      subtitle: 'Pay with cash or card at the counter',
      accent: 'green',
    },
  ];

  // Create the cafe order on backend (for takeaway deferred flow).
  // `checkout` is the Razorpay checkout result of a pay-first order: it
  // is sent with the create so the server links the payment to the order
  // the moment the order exists (it can then no longer be orphan-refunded).
  const createCafeOrder = async (paymentMethod, checkout = null) => {
    const idemKey = idemKeyRef.current || generateIdempotencyKey();
    idemKeyRef.current = idemKey;
    const { data } = await api.post('/orders', {
      ...orderPayload,
      clientIdempotencyKey: idemKey,
      paymentMethod,
      ...(checkout ? {
        razorpayPayment: {
          razorpay_order_id: checkout.razorpay_order_id,
          razorpay_payment_id: checkout.razorpay_payment_id,
          razorpay_signature: checkout.razorpay_signature,
        },
      } : {}),
    }, { headers: { 'Idempotency-Key': idemKey } });
    if (!data.success) throw new Error('Failed to create order');

    // Remember only the order ID (#22) so the Orders / Bill screens can
    // re-fetch it from the server — no order objects on the device.
    rememberOrderIds(getCustomerOrderSession(user, isLoggedIn), [String(data.order.orderId)]);
    window.dispatchEvent(new Event('storage_sync'));

    return data.order;
  };

  // After successful payment, redirect to order confirmed page (takeaway) or orders
  const navigateAfterPayment = (finalOrderId) => {
    const oid = finalOrderId || existingOrderId;
    // Payment completed — drop the rehydration draft so a later visit to
    // /customer/payment (new order) doesn't pick up stale state.
    try { sessionStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ }
    // Dine-in lock — applies to wallet + online + cash takeaway paths
    // alike. Takeaway flow doesn't have the lock concept (each
    // takeaway is its own session), but flagging is harmless because
    // the hook also requires an active dine-in session in localStorage.
    if (!isTakeawayDeferred) {
      markDineInBillSettled();
    }
    if (isGuest) {
      // Mark bill as paid with timestamp for auto-exit timer
      localStorage.setItem('guest_bill_paid_at', Date.now().toString());
      // Payment status itself is read from the server (Orders / Bill).
    }

    // Takeaway → order confirmed page with summary
    if (isTakeawayDeferred) {
      navigate('/customer/order-confirmed', {
        replace: true,
        state: {
          orderId: oid,
          items: cartItemsForStorage || [],
          total: totalAmount,
          isTakeaway: true,
          selectedTime: orderPayload?.pickupTime,
          paymentMethod: selectedMethod,
        },
      });
    } else if (isGuest) {
      navigate('/customer/bill', { replace: true });
    } else {
      navigate('/customer/orders', { replace: true });
    }
  };

  const handleOnlinePayment = async () => {
    const scriptLoaded = await loadRazorpayScript();
    if (!scriptLoaded) {
      toast.error('Failed to load payment gateway. Please check your internet connection.', { id: 'pay-gateway-load' });
      setIsProcessing(false);
      return;
    }

    try {
      // Step 1: Create Razorpay order on backend (no cafeOrderId for deferred takeaway)
      const { data } = await razorpayAPI.createOrder(totalAmount, isTakeawayDeferred ? null : existingOrderId);
      if (!data.success) {
        toast.error('Failed to initiate payment. Please try again.', { id: 'pay-init' });
        setIsProcessing(false);
        return;
      }

      // Step 2: Open Razorpay checkout.
      //
      // DEV-ONLY: when the backend is running the mock gateway it sets
      // `mock: true`. Razorpay's hosted checkout would reject a
      // synthetic order_id, so skip it and hand the handler the same
      // shape a real successful payment produces. Everything after this
      // point — order creation, verification, the bill — runs its
      // normal path, which is the whole point: the mock replaces the
      // gateway, not the flow being tested.
      const options = {
        key: data.key,
        amount: data.razorpayOrder.amount,
        currency: data.razorpayOrder.currency,
        name: merchantName,
        description: `Order Payment${existingOrderId ? ` - ${existingOrderId}` : ''}`,
        order_id: data.razorpayOrder.id,
        handler: async (response) => {
          let cafeOrderId = existingOrderId;
          let createdOrderJustNow = false;
          try {
            // For takeaway: create the cafe order NOW (payment succeeded).
            // This is the step that can fail server-side on a stock check
            // or total-tamper check; the catch below auto-refunds.
            if (isTakeawayDeferred) {
              const createdOrder = await createCafeOrder('online', response);
              cafeOrderId = createdOrder.orderId;
              createdOrderJustNow = true;
            }

            // Step 3: Verify payment on backend & link to cafe order
            const verifyRes = await razorpayAPI.verifyPayment({
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
              cafeOrderId,
            });

            if (verifyRes.data.success) {
              toast.success('Payment successful! Thank you.', { id: 'pay-success', duration: 4000 });
              navigateAfterPayment(cafeOrderId);
            } else {
              toast.error('Payment verification failed. Please contact staff at the counter.', { id: 'pay-verify-err' });
            }
          } catch (err) {
            console.error('Post-payment flow failed:', err);
            // If the failure was during createCafeOrder (takeaway flow),
            // the customer is holding a Razorpay charge with NO order to
            // back it. Auto-refund the orphan payment immediately — the
            // server fires an admin alert with the underlying cause.
            if (createdOrderJustNow === false && isTakeawayDeferred) {
              const reason = err?.response?.data?.message
                || err?.response?.data?.code
                || err?.message
                || 'Order could not be saved.';
              try {
                razorpayAPI.orphanRefund({
                  razorpay_payment_id: response.razorpay_payment_id,
                  // Checkout signature proves this browser made the payment
                  // (required for guests without a login).
                  razorpay_order_id: response.razorpay_order_id,
                  razorpay_signature: response.razorpay_signature,
                  reason,
                }).catch((refundErr) => {
                  console.warn('Orphan-refund call failed:', refundErr);
                });
              } catch { /* fire-and-forget */ }
              toast.error(
                "We couldn't place this order. Your payment is being refunded automatically — it'll be back in your account in 5–7 business days.",
                { id: 'pay-verify-err', duration: 12000 }
              );
            } else {
              toast.error('Payment verification failed. Please contact staff at the counter.', { id: 'pay-verify-err' });
            }
          }
          setIsProcessing(false);
        },
        prefill: {
          name: user?.name || '',
          email: user?.email || '',
          contact: user?.mobile || '',
        },
        theme: {
          color: '#FE8301',
        },
        modal: {
          ondismiss: () => {
            setIsProcessing(false);
          },
        },
      };

      if (data.mock) {
        toast('Mock payment — no money will be charged', { icon: '🧪', duration: 4000 });
        await options.handler({
          razorpay_order_id: data.razorpayOrder.id,
          razorpay_payment_id: `pay_mock_${Date.now().toString(16)}`,
          razorpay_signature: 'mock_signature_not_verified',
        });
        return;
      }

      const rzp = new window.Razorpay(options);
      rzp.on('payment.failed', (response) => {
        toast.error(`Payment failed: ${response.error.description}`);
        setIsProcessing(false);
      });
      rzp.open();
    } catch (err) {
      console.error('Payment Error:', err);
      toast.error('Failed to initiate payment. Please try again.');
      setIsProcessing(false);
    }
  };

  const handleWalletPayment = async () => {
    try {
      let cafeOrderId = existingOrderId;

      // For takeaway: create the cafe order first
      if (isTakeawayDeferred) {
        const createdOrder = await createCafeOrder('wallet');
        cafeOrderId = createdOrder.orderId;
      }

      if (!cafeOrderId) throw new Error('No order to pay for.');

      // The wallet endpoint settles against the server-side order (by its
      // Mongo _id) and flips it to Paid itself — the amount is checked
      // against what the order actually owes, never taken on trust.
      const { data: detail } = await api.get(`/orders/${cafeOrderId}/detail`);
      const serverOrder = detail?.order;
      if (!serverOrder?._id) throw new Error('Could not load the order to pay.');
      const payable = Math.round((Number(serverOrder.total || 0) - Number(serverOrder.amountPaid || 0)) * 100) / 100;
      const walletAmount = payable > 0 ? payable : totalAmount;

      // Deduct from wallet. The backend returns the new balance; use that
      // directly so a refresh elsewhere in the app shows the right number
      // without a second round-trip. Fall back to a getWallet() fetch if
      // the shape changes.
      const payRes = await walletAPI.payWithWallet(walletAmount, serverOrder._id);
      const nextBalance = payRes?.data?.newBalance ?? payRes?.data?.balance;
      if (typeof nextBalance === 'number') {
        setWalletBalance(nextBalance);
      } else {
        try {
          const { data } = await walletAPI.getWallet();
          setWalletBalance(data.balance || 0);
        } catch { /* non-fatal — balance will refresh on next page visit */ }
      }

      // Finalize: the order is already Paid server-side; this runs the
      // post-payment bookkeeping (loyalty points, notifications, table
      // release). It no longer carries any amount — the server ignores it.
      // Best-effort: the money has moved, so a failure here must not show
      // the customer a payment error.
      try {
        await api.patch(`/orders/${cafeOrderId}/payment`, {
          paymentStatus: 'Paid',
          paymentMethod: 'wallet',
        }, { _silent: true });
      } catch (finalizeErr) {
        console.warn('Wallet payment finalize failed (non-fatal):', finalizeErr);
      }

      toast.success(`Paid ₹${Number(walletAmount).toFixed(2)} from wallet.`, { id: 'pay-wallet-success', duration: 4000 });
      navigateAfterPayment(cafeOrderId);
    } catch (err) {
      console.error('Wallet payment error:', err);
      toast.error(err.response?.data?.message || 'Wallet payment failed.', { id: 'pay-wallet-err' });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCashPayment = async () => {
    try {
      let cafeOrderId = existingOrderId;

      // For takeaway: create the cafe order. (The takeaway flow no
      // longer calls Payment.jsx for cash — it's online-only — but
      // keep this branch for the dine-in→Payment.jsx path that still
      // funnels every method through here.)
      if (isTakeawayDeferred) {
        const createdOrder = await createCafeOrder('cash');
        cafeOrderId = createdOrder.orderId;
        toast.success('Order confirmed — please pay at the counter.', { id: 'pay-cash-success', duration: 4000 });
        navigateAfterPayment(cafeOrderId);
        return;
      }

      // Dine-in path — flag the order for counter-payment so the admin
      // table drawer surfaces a red alert + "Mark Paid · Cash" button.
      // We do NOT settle anything here; admin / waiter does that
      // physically. The waiting overlay polls the order's payment
      // status (via socket + 5s fallback poll) and flips to the
      // success page the moment admin marks it paid.
      if (cafeOrderId) {
        await api.post(`/orders/${cafeOrderId}/request-counter-payment`);
      }
      // Open the waiting overlay; isProcessing flips off so the user
      // can tap Cancel and switch to another method if they change
      // their mind.
      setIsProcessing(false);
      setWaitingForCounter(true);
      return;
    } catch (err) {
      console.error('Cash payment error:', err);
      toast.error('Failed to update order. Please inform the staff.', { id: 'pay-cash-err' });
    } finally {
      setIsProcessing(false);
    }
  };

  const handlePayNow = async () => {
    if (!selectedMethod) {
      setMethodError('Please choose a payment method to continue');
      // Scroll the method picker into view so the user sees where the
      // error came from instead of a faraway toast.
      setTimeout(() => {
        document.getElementById('paymentMethods')?.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
      }, 0);
      return;
    }
    setMethodError('');

    setIsProcessing(true);

    switch (selectedMethod) {
      case 'online':
        await handleOnlinePayment();
        break;
      case 'wallet':
        await handleWalletPayment();
        break;
      case 'cash':
        await handleCashPayment();
        break;
      default:
        setIsProcessing(false);
    }
  };

  // CTA label adapts to the selected method so the customer knows
  // exactly what's about to happen ("Pay ₹500 from Wallet" vs
  // "Pay ₹500 via Razorpay") instead of a generic "Pay Now". The
  // cash option doesn't actually settle anything — it sends a
  // request to the counter — so its label is intentionally a
  // verb of intent ("Send …") rather than "Pay …".
  const ctaLabel = !selectedMethod
    ? 'Choose a payment method'
    : selectedMethod === 'online'
      ? `Pay ₹${Number(totalAmount).toFixed(2)} via Razorpay`
      : selectedMethod === 'wallet'
        ? `Pay ₹${Number(totalAmount).toFixed(2)} from Wallet`
        : `Send Request to Counter · ₹${Number(totalAmount).toFixed(2)}`;

  return (
    <div className="min-h-screen bg-[#FAFAFA] pb-32">
      {/* Header — clean, with a Dine-in pill matching the bill preview */}
      <header className="sticky top-0 z-40 bg-white border-b border-gray-100">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2 min-w-0">
            <button
              onClick={() => navigate(-1)}
              className="p-1 -ml-1 rounded-full hover:bg-gray-100 active:scale-95 transition-transform shrink-0"
              aria-label="Back"
            >
              <ChevronLeft size={24} className="text-[#666666]" />
            </button>
            <div className="min-w-0">
              <h1 className="text-[15px] font-nunito font-semibold text-[#1A181B] leading-tight">
                Payment
              </h1>
              {existingOrderId && (
                <p className="text-[11px] font-varela text-[#8D848F] leading-tight truncate">
                  #{String(existingOrderId).split('-').pop()?.slice(-6)}
                </p>
              )}
            </div>
          </div>
          {tableNumber && (
            <span className="shrink-0 text-[11px] font-nunito font-semibold uppercase tracking-wide text-[#4D7CFF] bg-[#EAF1FF] px-2.5 py-1 rounded-full">
              Dine-in · Table {tableNumber}
            </span>
          )}
        </div>
      </header>

      {/* Hero amount card — dominant total, secondary "secured by" line */}
      <section className="px-4 pt-4">
        <div className="rounded-3xl p-5 bg-gradient-to-br from-[#FE8301] via-[#FF9F37] to-[#FFB05E] shadow-[0_8px_30px_-8px_rgba(254,131,1,0.5)] text-white relative overflow-hidden">
          {/* Decorative blobs for depth without an extra image asset. */}
          <div className="absolute -top-8 -right-8 w-32 h-32 rounded-full bg-white/10 blur-2xl" aria-hidden />
          <div className="absolute -bottom-12 -left-6 w-32 h-32 rounded-full bg-white/10 blur-2xl" aria-hidden />
          <div className="relative z-10">
            <p className="text-white/85 text-[12px] font-varela uppercase tracking-wide">
              Amount to pay
            </p>
            <p className="text-white text-[40px] font-nunito font-bold leading-none mt-1 tabular-nums">
              ₹{Number(totalAmount).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
            <div className="flex items-center gap-1.5 mt-3 text-white/85 text-[12px] font-varela">
              <Lock size={12} />
              <span>Secured by Razorpay · 256-bit encrypted</span>
            </div>
          </div>
        </div>

        {/* Wallet hint — visible when wallet is short. Encourages the
            customer to top up rather than silently disabling the
            wallet card with no explanation. */}
        {isLoggedIn && walletInsufficient && walletBalance > 0 && (
          <div className="mt-3 flex items-start gap-2 bg-[#FFF8EB] border border-[#FCE7A4] rounded-xl px-3 py-2.5">
            <AlertCircle size={16} className="text-[#B54708] shrink-0 mt-0.5" />
            <p className="text-[12px] font-varela text-[#7A4504] leading-snug">
              You have <span className="font-semibold">₹{walletBalance.toFixed(2)}</span> in wallet — short by ₹{(totalAmount - walletBalance).toFixed(2)} for full payment. Pick another method below.
            </p>
          </div>
        )}
      </section>

      {/* Payment Methods */}
      <main className="px-4 mt-5">
        <h2 className="text-[14px] font-nunito font-semibold text-[#1A181B] mb-3 px-1">
          Choose how you'd like to pay
        </h2>

        <div
          id="paymentMethods"
          role="radiogroup"
          aria-label="Payment method"
          aria-invalid={methodError ? 'true' : 'false'}
          aria-describedby={methodError ? 'paymentMethods-err' : undefined}
          className={`space-y-2.5 ${methodError ? 'rounded-2xl ring-1 ring-red-400 p-1' : ''}`}
        >
          {paymentMethods.map((method) => (
            <PaymentOption
              key={method.id}
              icon={method.icon}
              title={method.title}
              subtitle={method.subtitle}
              accent={method.accent}
              badge={method.badge}
              badgeTone={method.badgeTone}
              selected={selectedMethod === method.id}
              disabled={method.disabled}
              onClick={() => {
                if (method.disabled) return;
                setSelectedMethod(method.id);
                if (methodError) setMethodError('');
              }}
            />
          ))}
        </div>
        {methodError && (
          <p id="paymentMethods-err" role="alert" className="text-xs text-red-600 mt-2 flex items-center gap-1">
            <span aria-hidden="true">⚠</span>{methodError}
          </p>
        )}

        {/* Trust strip — three subtle reassurances customers expect
            before tapping a payment CTA. Keeps the page calm without
            adding a dedicated "Why pay here" block. */}
        <div className="mt-5 flex items-center justify-around gap-2 bg-white border border-gray-100 rounded-2xl px-3 py-3">
          <div className="flex items-center gap-1.5 text-[11px] font-varela text-[#645E66]">
            <ShieldCheck size={14} className="text-[#34C759]" />
            <span>PCI-DSS</span>
          </div>
          <div className="w-px h-4 bg-gray-200" />
          <div className="flex items-center gap-1.5 text-[11px] font-varela text-[#645E66]">
            <Lock size={14} className="text-[#34C759]" />
            <span>Bank-grade</span>
          </div>
          <div className="w-px h-4 bg-gray-200" />
          <div className="flex items-center gap-1.5 text-[11px] font-varela text-[#645E66]">
            <Check size={14} className="text-[#34C759]" />
            <span>Refund safe</span>
          </div>
        </div>
      </main>

      {/* Sticky Pay button */}
      <div className="fixed bottom-0 left-0 right-0 xl:left-[300px] xl:right-[300px] p-4 bg-white border-t border-gray-100">
        <button
          onClick={handlePayNow}
          disabled={isProcessing || !selectedMethod}
          className={`w-full h-[52px] rounded-2xl font-nunito font-semibold text-[15px] shadow-lg flex items-center justify-center gap-2 transition-all ${
            isProcessing || !selectedMethod
              ? 'bg-gray-200 text-gray-500 cursor-not-allowed shadow-none'
              : 'bg-[#FE8301] text-white hover:bg-[#E37300] active:scale-[0.98] shadow-[0_8px_20px_-6px_rgba(254,131,1,0.55)]'
          }`}
        >
          {isProcessing ? (
            <>
              <div className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin" />
              <span>Processing…</span>
            </>
          ) : (
            <>
              <Lock size={16} />
              <span>{ctaLabel}</span>
            </>
          )}
        </button>
      </div>

      {/* Waiting-for-staff overlay — full-screen so the customer
          knows the next move is on the cafe side. Cancellable so a
          change-of-mind switches them back to the method picker. */}
      {waitingForCounter && (
        <div className="fixed inset-0 z-[110] bg-black/55 backdrop-blur-sm flex items-end md:items-center justify-center md:p-4">
          <div
            className="bg-white rounded-t-[28px] md:rounded-[28px] w-full max-w-[440px] relative px-6 pt-7 pb-6 animate-slideUp md:animate-scaleIn shadow-2xl"
            style={{ paddingBottom: 'calc(1.5rem + env(safe-area-inset-bottom, 0px))' }}
          >
            <div className="md:hidden w-10 h-1 bg-gray-200 rounded-full mx-auto mb-5" />

            <div className="flex flex-col items-center text-center">
              {/* Animated bouncing dots — cheaper than a full
                  illustration and reads as "still working". */}
              <div className="relative w-20 h-20 rounded-full bg-[#FFF5E9] flex items-center justify-center mb-4">
                <Banknote size={32} className="text-[#FE8301]" />
                <span className="absolute inset-0 rounded-full border-2 border-[#FE8301]/30 animate-ping" />
              </div>
              <h2 className="text-[20px] font-nunito font-bold text-[#1A181B] leading-tight">
                Waiting for staff…
              </h2>
              <p className="text-[13px] font-varela text-[#645E66] mt-1.5 max-w-[300px]">
                A waiter is on the way to <span className="font-semibold text-[#1A181B]">Table {tableNumber || '—'}</span> with your bill slip.
                Please pay <span className="font-semibold text-[#1A181B]">₹{Number(totalAmount).toFixed(2)}</span> in cash.
              </p>

              {/* Stepper — three steps, current step highlighted */}
              <div className="w-full mt-5 bg-[#FAFAFA] border border-gray-100 rounded-2xl p-4 space-y-3">
                <StepRow done label="Request sent to counter" />
                <StepRow active label="Waiter brings the bill slip" />
                <StepRow label="Payment marked Paid · You're done" />
              </div>

              <p className="text-[11px] font-varela text-[#8D848F] mt-3">
                You'll be redirected automatically once payment is confirmed.
              </p>

              {/* Cancel — resets the local UI; the order on the
                  backend stays in Pending state and admin can still
                  process it. Useful if the customer changes mind
                  and wants to pay online instead. */}
              <button
                onClick={() => setWaitingForCounter(false)}
                className="mt-5 w-full h-[44px] rounded-2xl border border-gray-200 text-[#645E66] font-nunito font-semibold text-[13px] active:scale-[0.98] transition-transform"
              >
                Change payment method
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Tiny helper for the waiting-stepper rows. Three states: done
// (green check), active (orange pulsing dot), pending (gray).
function StepRow({ done, active, label }) {
  return (
    <div className="flex items-center gap-3 text-left">
      {done ? (
        <div className="w-5 h-5 rounded-full bg-[#34C759] flex items-center justify-center shrink-0">
          <Check size={12} className="text-white" strokeWidth={3} />
        </div>
      ) : active ? (
        <div className="relative w-5 h-5 shrink-0">
          <span className="absolute inset-0 rounded-full bg-[#FE8301]/30 animate-ping" />
          <span className="absolute inset-0 m-1 rounded-full bg-[#FE8301]" />
        </div>
      ) : (
        <div className="w-5 h-5 rounded-full border-2 border-gray-200 bg-white shrink-0" />
      )}
      <span className={`text-[13px] font-varela ${
        done ? 'text-[#1A181B]' : active ? 'text-[#1A181B] font-semibold' : 'text-[#8D848F]'
      }`}>
        {label}
      </span>
    </div>
  );
}

export default Payment;
