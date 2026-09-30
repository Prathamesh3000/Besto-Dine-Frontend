import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import toast from 'react-hot-toast';
import api, { razorpayAPI, settingsAPI } from '../../utils/api';
import {
    KIOSK_KEYS,
    readCart,
    clearCart,
    writeLastOrder,
    readCustomerInfo,
    getOrCreateIdempotencyKey,
    clearIdempotencyKey,
    writeTrackingToken,
    kioskSubtotal,
} from './kioskState';
import { useKioskTaxConfig, computeKioskTotals } from './useKioskTaxConfig';

const IDLE_TIMEOUT_SECONDS = 90;

// ─── Razorpay SDK loader ────────────────────────────────────────────────
function loadRazorpayScript() {
    return new Promise((resolve) => {
        if (window.Razorpay) return resolve(true);
        const script = document.createElement('script');
        script.src = 'https://checkout.razorpay.com/v1/checkout.js';
        script.onload  = () => resolve(true);
        script.onerror = () => resolve(false);
        document.body.appendChild(script);
    });
}

// Build a human-readable "Size: Large; Extras: 2× Cheese Slice, Lettuce"
// note the kitchen can read off the KOT. Kiosk size + extras are UX-only;
// the backend does not accept synthetic toppings, so we surface them here.
function buildInstructionsLine(cartLine) {
    const bits = [];
    if (cartLine.size && cartLine.size !== 'Regular') bits.push(`Size: ${cartLine.size}`);
    if (Array.isArray(cartLine.addons) && cartLine.addons.length > 0) {
        const labels = cartLine.addons
            .map(a => a.qty > 1 ? `${a.qty}× ${a.name}` : a.name)
            .join(', ');
        bits.push(`Extras: ${labels}`);
    }
    return bits.join('; ');
}

// Transform kiosk cart lines → backend order payload items.
function toOrderItems(cart) {
    return cart.map(line => {
        const instructions = buildInstructionsLine(line);
        const item = {
            menuItem: line.menuItemId,
            name:     line.name,
            price:    line.unitPrice,
            quantity: line.qty,
            category: line.category || '',
            vegType:  line.isVeg ? 'veg' : 'non-veg',
        };
        if (instructions) item.instructions = instructions;
        return item;
    });
}

export default function PayOption() {
    const navigate = useNavigate();
    const location = useLocation();

    const cart = useRef(readCart());
    // KIOSK-FIX — re-derive totals from the live tax config when the
    // user lands here via refresh / deep link (location.state is gone).
    // Previously the fallback hardcoded 3%/2% and silently undercharged
    // the customer compared to what Cart.jsx had quoted them.
    const taxConfig = useKioskTaxConfig();
    const subtotalNow = kioskSubtotal(cart.current);
    const totalsFromCart = computeKioskTotals(subtotalNow, taxConfig);
    const totals = location.state?.totalPayment
        ? {
            ...totalsFromCart,
            totalPayment: location.state.totalPayment,
            subtotal: location.state.subtotal,
            gst: location.state.gst,
            serviceCharge: location.state.serviceCharge,
            additionalChargesBreakdown: location.state.additionalChargesBreakdown || totalsFromCart.additionalChargesBreakdown,
        }
        : totalsFromCart;
    const totalPayment = Number(totals.totalPayment.toFixed(2));

    const [timeLeft, setTimeLeft]   = useState(IDLE_TIMEOUT_SECONDS);
    const [timerPaused, setTimerPaused] = useState(false);
    const [phase, setPhase]         = useState('idle'); // idle | preparing | checkout-open | retrying | paid-recovery
    const [errorMsg, setErrorMsg]   = useState('');
    const [merchantName, setMerchantName] = useState('BestoDine');
    // Holds the Razorpay payment id when the gateway succeeded but our
    // /orders POST or /verify call failed. Lets us show a recovery
    // screen with the payment id so the customer can show it at the
    // counter and the operator can manually reconcile.
    const [strandedPayment, setStrandedPayment] = useState(null);

    const hasStartedRef = useRef(false);

    // Fetch merchant name for the Razorpay checkout title.
    useEffect(() => {
        settingsAPI.getSettings()
            .then(res => {
                const name = res?.data?.data?.general?.cafeName;
                if (name) setMerchantName(name);
            })
            .catch(() => { /* non-fatal */ });
    }, []);

    // Idle timeout — abandons the kiosk if the customer walks away without
    // completing payment. Paused while the Razorpay modal is actually open
    // so a slow customer isn't kicked out mid-UPI-approval.
    useEffect(() => {
        if (timerPaused) return;
        if (timeLeft <= 0) {
            clearCart();
            try { localStorage.removeItem(KIOSK_KEYS.ORDER_TYPE); } catch { /* ignore */ }
            navigate('/kiosk', { replace: true });
            return;
        }
        const t = setInterval(() => setTimeLeft(prev => prev - 1), 1000);
        return () => clearInterval(t);
    }, [timeLeft, timerPaused, navigate]);

    const formatTime = (seconds) => {
        const m = Math.floor(seconds / 60);
        const s = seconds % 60;
        return `${m}:${s.toString().padStart(2, '0')}`;
    };

    // ─── Cafe order payload ─────────────────────────────────────────────
    const buildOrderPayload = () => {
        const orderType = localStorage.getItem(KIOSK_KEYS.ORDER_TYPE) || 'Eat Here';
        // Map kiosk intent → backend order type so the admin Orders
        // dashboard splits kiosk orders correctly across its Dine-in
        // and Takeaway tabs:
        //   "Eat Here" → dine-in (no table — backend's createOrder
        //                special-cases source='kiosk' to skip the
        //                table/scan-token requirement)
        //   "Take Away" → takeaway
        const isEatHere = orderType === 'Eat Here';
        const backendType = isEatHere ? 'dine-in' : 'takeaway';
        const pickupLabel = isEatHere
            ? 'Kiosk - Dine In Counter'
            : 'Kiosk - Takeaway Counter';
        // Optional customer info — only set if the operator actually
        // captured it on the previous step. Falls back to the original
        // anonymous "Kiosk Customer" label so the kitchen card still
        // renders something readable.
        const info = readCustomerInfo() || {};
        const cleanName = typeof info.name === 'string' ? info.name.trim() : '';
        const cleanPhone = typeof info.phone === 'string' ? info.phone.trim() : '';
        return {
            type:                  backendType,
            source:                'kiosk',
            clientIdempotencyKey:  getOrCreateIdempotencyKey(),
            items:                 toOrderItems(cart.current),
            total:                 totalPayment,
            paymentMethod:         'online',
            pickupLocation:        pickupLabel,
            pickupTime:            '',
            customerName:          cleanName || 'Kiosk Customer',
            phone:                 cleanPhone || undefined,
            note:                  `Placed via kiosk (${orderType})`,
        };
    };

    // ─── Razorpay checkout ──────────────────────────────────────────────
    const startPayment = async () => {
        if (hasStartedRef.current) return;
        hasStartedRef.current = true;

        setPhase('preparing');
        setErrorMsg('');

        if (cart.current.length === 0 || totalPayment <= 0) {
            setErrorMsg('Your cart is empty.');
            setPhase('retrying');
            hasStartedRef.current = false;
            return;
        }

        try {
            const scriptLoaded = await loadRazorpayScript();
            if (!scriptLoaded) throw new Error('Failed to load payment gateway');

            // Create the Razorpay order WITHOUT a cafeOrderId — we defer
            // the actual cafe order until payment succeeds, so a customer
            // who abandons at the modal never leaves an orphan order in
            // the kitchen queue (mirrors the takeaway flow in Payment.jsx).
            const { data: rzpRes } = await razorpayAPI.createOrder(totalPayment, null);
            if (!rzpRes?.success) throw new Error(rzpRes?.message || 'Failed to initiate payment');

            setTimerPaused(true);
            setPhase('checkout-open');

            const options = {
                key:       rzpRes.key,
                amount:    rzpRes.razorpayOrder.amount,
                currency:  rzpRes.razorpayOrder.currency,
                name:      merchantName,
                description: 'Kiosk Order',
                order_id:  rzpRes.razorpayOrder.id,
                theme:     { color: '#FE8301' },
                handler: async (response) => {
                    // Razorpay has confirmed payment — from this point
                    // ANY failure must surface as "paid-recovery", NOT
                    // "retrying". Retrying would charge the customer
                    // twice. The idempotency key we send below also
                    // protects the kitchen from a duplicate order if
                    // /orders POST eventually succeeds on a later attempt.
                    let cafeOrder = null;
                    let cafeTrackingToken = null;
                    try {
                        const { data: orderRes } = await api.post('/orders', buildOrderPayload());
                        if (!orderRes?.success) throw new Error('Order creation failed after payment');
                        cafeOrder = orderRes.order;
                        cafeTrackingToken = orderRes.trackingToken || null;
                    } catch (err) {
                        const msg = err?.response?.data?.message || err.message || 'Order could not be saved.';
                        setStrandedPayment({
                            paymentId: response.razorpay_payment_id,
                            stage:     'order-create',
                            message:   msg,
                        });
                        setPhase('paid-recovery');
                        setTimerPaused(false);
                        toast.error('Payment received — please show the screen at the counter.');
                        return;
                    }

                    try {
                        const { data: verifyRes } = await razorpayAPI.verifyPayment({
                            razorpay_order_id:   response.razorpay_order_id,
                            razorpay_payment_id: response.razorpay_payment_id,
                            razorpay_signature:  response.razorpay_signature,
                            cafeOrderId:         cafeOrder.orderId,
                        });
                        if (!verifyRes?.success) throw new Error('Payment verification failed');
                    } catch (err) {
                        // Order DID get created (we have cafeOrder.orderId)
                        // but signature verification failed — kitchen will
                        // see the order as unpaid until staff reconciles.
                        // Surface the order id + payment id so operator
                        // can join them up at the counter.
                        const msg = err?.response?.data?.message || err.message || 'Payment verification failed.';
                        setStrandedPayment({
                            paymentId: response.razorpay_payment_id,
                            orderId:   cafeOrder.orderId,
                            stage:     'verify',
                            message:   msg,
                        });
                        setPhase('paid-recovery');
                        setTimerPaused(false);
                        toast.error('Payment received — please show this screen at the counter.');
                        return;
                    }

                    writeLastOrder({
                        orderId:   cafeOrder.orderId,
                        _id:       cafeOrder._id,
                        total:     cafeOrder.total,
                        type:      cafeOrder.type,
                        status:    cafeOrder.status || 'new',
                        orderType: localStorage.getItem(KIOSK_KEYS.ORDER_TYPE) || 'Eat Here',
                        createdAt: cafeOrder.createdAt || new Date().toISOString(),
                    });
                    if (cafeTrackingToken) writeTrackingToken(cafeTrackingToken);
                    clearCart();
                    // Successful end-to-end — burn the idempotency key so
                    // the next customer's checkout starts fresh.
                    clearIdempotencyKey();
                    navigate('/kiosk/payment-success', { replace: true });
                },
                modal: {
                    ondismiss: () => {
                        // Customer closed the modal without paying — let
                        // them retry or walk away. The idle timer resumes.
                        setPhase('retrying');
                        setErrorMsg('Payment cancelled. Tap below to try again.');
                        setTimerPaused(false);
                        hasStartedRef.current = false;
                    },
                },
            };

            const rzp = new window.Razorpay(options);
            rzp.on('payment.failed', (resp) => {
                const msg = resp?.error?.description || 'Payment failed — please try again.';
                setErrorMsg(msg);
                setPhase('retrying');
                setTimerPaused(false);
                hasStartedRef.current = false;
                toast.error(msg);
            });
            rzp.open();
        } catch (err) {
            const msg = err?.response?.data?.message || err.message || 'Could not start payment.';
            setErrorMsg(msg);
            setPhase('retrying');
            setTimerPaused(false);
            hasStartedRef.current = false;
            toast.error(msg);
        }
    };

    // Auto-start the payment flow on mount.
    useEffect(() => {
        startPayment();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return (
        <div className="min-h-screen font-['Outfit'] relative overflow-hidden flex items-center justify-center">
            {/* Back Button */}
            <button
                onClick={() => navigate('/kiosk/cart')}
                className="absolute top-10 left-10 flex items-center gap-2 text-[#F48F1B] font-bold text-[24px] z-20"
            >
                <ArrowLeft size={32} />
                Back
            </button>

            {/* Main Outer Container */}
            <div
                className="bg-white rounded-[24px] flex flex-col items-center justify-center p-[24px] border-2 border-[#F6F6F6] h-fit w-full max-w-[calc(100%-304px)] mx-auto"
            >
                <div className="bg-[#F48F1B] rounded-full flex items-center justify-center mb-[10px] p-[16px]">
                    <img
                        src="https://img.icons8.com/ios-filled/100/ffffff/qr-code.png"
                        alt="QR Icon"
                        className="w-[58px]"
                    />
                </div>

                <h1 className="text-[48px] font-nunito font-[800] text-[#1E2939] mb-[2px]">
                    {phase === 'paid-recovery'
                        ? 'Payment received'
                        : phase === 'retrying' ? 'Payment not completed' : 'Complete Payment'}
                </h1>
                <p className="text-[20px] text-[#4A5565] mb-[12px] font-regular font-varela leading-[18px]">
                    {phase === 'paid-recovery'
                        ? 'Please show this screen at the counter — staff will hand over your order.'
                        : phase === 'retrying'
                            ? (errorMsg || 'Tap the button below to try again.')
                            : 'Use any UPI app or card via the secure checkout window.'}
                </p>

                <div className="text-[48px] text-[#F54900] mb-[16px] flex items-baseline leading-none font-nunito font-bold">
                    <span className="mt-2">₹</span>
                    {totalPayment.toFixed(2)}
                </div>

                {/* Timer (paused while checkout is open or after payment) */}
                {phase !== 'paid-recovery' && (
                    <div className="bg-[#FE8301] px-[31px] py-[16px] rounded-[16px] text-white text-[20px] font-semibold font-nunito mb-[46px] leading-[16px]">
                        {timerPaused ? 'Waiting for payment…' : `Time remaining ${formatTime(timeLeft)}`}
                    </div>
                )}

                {/* Central panel: spinner, retry button, or placeholder QR */}
                <div className="bg-[#F9F9F9] rounded-[24px] p-[24px] mx-[68px] flex flex-col items-center justify-between border border-[#F1F5F9] min-w-[400px]">
                    {phase === 'preparing' && (
                        <div className="w-full flex flex-col items-center py-16">
                            <div className="w-12 h-12 border-4 border-[#FE8301] border-t-transparent rounded-full animate-spin mb-6" />
                            <div className="text-[22px] font-nunito font-semibold text-[#4A5565]">
                                Preparing secure payment…
                            </div>
                        </div>
                    )}
                    {phase === 'checkout-open' && (
                        <div className="w-full flex flex-col items-center py-16">
                            <div className="text-[22px] font-nunito font-semibold text-[#4A5565] text-center">
                                Complete the payment in the checkout window.
                            </div>
                        </div>
                    )}
                    {phase === 'retrying' && (
                        <div className="w-full flex flex-col items-center py-6 gap-4">
                            <button
                                onClick={() => { hasStartedRef.current = false; startPayment(); }}
                                className="bg-[#FE8301] text-white py-[16px] px-[40px] rounded-[16px] text-[22px] font-nunito font-semibold active:scale-95 transition-all"
                            >
                                Retry Payment
                            </button>
                            <button
                                onClick={() => navigate('/kiosk/cart')}
                                className="text-[#645E66] py-[8px] px-[20px] text-[18px] font-nunito font-semibold"
                            >
                                Back to Cart
                            </button>
                        </div>
                    )}
                    {phase === 'paid-recovery' && strandedPayment && (
                        <div className="w-full flex flex-col items-center py-6 gap-4 text-center">
                            <div className="text-[20px] font-nunito font-semibold text-[#1E2939]">
                                Show this to the counter staff
                            </div>
                            <div className="w-full bg-white border border-[#E5E7EB] rounded-2xl p-4 text-left">
                                <div className="text-[14px] font-varela text-[#9CA3AF] uppercase tracking-wider">Payment ID</div>
                                <div className="text-[20px] font-nunito font-bold text-[#1E2939] break-all">{strandedPayment.paymentId}</div>
                                {strandedPayment.orderId && (
                                    <>
                                        <div className="text-[14px] font-varela text-[#9CA3AF] uppercase tracking-wider mt-3">Order ID</div>
                                        <div className="text-[20px] font-nunito font-bold text-[#1E2939] break-all">{strandedPayment.orderId}</div>
                                    </>
                                )}
                                <div className="text-[14px] font-varela text-[#9CA3AF] uppercase tracking-wider mt-3">Amount paid</div>
                                <div className="text-[20px] font-nunito font-bold text-[#1E2939]">₹{totalPayment.toFixed(2)}</div>
                            </div>
                            <button
                                onClick={() => {
                                    // The kiosk session is done — clearing the
                                    // idempotency key would let a refund-and-
                                    // retry create a real duplicate, so we
                                    // intentionally keep it. clearKioskSession
                                    // on landing handles cleanup.
                                    navigate('/kiosk', { replace: true });
                                }}
                                className="bg-[#FE8301] text-white py-[14px] px-[36px] rounded-2xl text-[20px] font-nunito font-semibold active:scale-95 transition-all"
                            >
                                Done
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
