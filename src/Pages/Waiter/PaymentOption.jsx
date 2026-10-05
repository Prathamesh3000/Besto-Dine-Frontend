import React, { useState } from 'react';
import { ChevronLeft, Smartphone, Zap, IndianRupee, Wallet } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import api, { razorpayAPI } from '../../utils/api';
import { useAuth } from '../../Context/AuthContext';
import toast from 'react-hot-toast';

const PaymentOption = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const { user } = useAuth();
    const { tableId, tableName, orderId, orderDisplayId, amount = 0 } = location.state || {};

    const [selectedMethod, setSelectedMethod] = useState('qr');
    const [isProcessing, setIsProcessing] = useState(false);

    // Wallet is intentionally NOT offered as a staff-side payment method.
    // POST /wallet/pay only ever debits the CALLER's own wallet (and only
    // for the caller's own order), so from this screen it would either be
    // rejected (ORDER_NOT_YOURS) or — for a guest order — debit the
    // waiter's personal wallet. Customers pay from their wallet in their
    // own app (Loggedin/Payment.jsx).

    // Load Razorpay script dynamically
    const loadRazorpayScript = () => {
        return new Promise((resolve) => {
            if (window.Razorpay) { resolve(true); return; }
            const script = document.createElement('script');
            script.src = 'https://checkout.razorpay.com/v1/checkout.js';
            script.onload = () => resolve(true);
            script.onerror = () => resolve(false);
            document.body.appendChild(script);
        });
    };

    const handleQRPayment = async () => {
        setIsProcessing(true);
        try {
            const scriptLoaded = await loadRazorpayScript();
            if (!scriptLoaded) {
                toast.error('Failed to load payment gateway.');
                setIsProcessing(false);
                return;
            }

            const { data } = await razorpayAPI.createOrder(amount, orderId);
            if (!data.success) {
                toast.error('Failed to initiate payment.');
                setIsProcessing(false);
                return;
            }

            const options = {
                key: data.key,
                amount: data.razorpayOrder.amount,
                currency: data.razorpayOrder.currency,
                name: 'BestoDine',
                description: `Order Payment - ${orderDisplayId || orderId}`,
                order_id: data.razorpayOrder.id,
                handler: async (response) => {
                    try {
                        const verifyRes = await razorpayAPI.verifyPayment({
                            razorpay_order_id: response.razorpay_order_id,
                            razorpay_payment_id: response.razorpay_payment_id,
                            razorpay_signature: response.razorpay_signature,
                            cafeOrderId: orderId,
                        });
                        if (verifyRes.data.success) {
                            // replace: true — block back-navigation from
                            // the confirmation screen back into this
                            // PaymentOption page; the order is already
                            // paid, returning here would let the captain
                            // re-trigger Razorpay against a paid order.
                            navigate('/waiter/qr-payment', {
                                state: { tableId, tableName, orderId, orderDisplayId, amount, paymentSuccess: true },
                                replace: true,
                            });
                        } else {
                            toast.error('Payment verification failed.');
                        }
                    } catch {
                        toast.error('Payment verification failed.');
                    }
                    setIsProcessing(false);
                },
                prefill: {
                    name: user?.name || '',
                    email: user?.email || '',
                    contact: user?.mobile || '',
                },
                theme: { color: '#FE8301' },
                modal: { ondismiss: () => setIsProcessing(false) },
            };

            const rzp = new window.Razorpay(options);
            rzp.on('payment.failed', (resp) => {
                toast.error(`Payment failed: ${resp.error.description}`);
                setIsProcessing(false);
            });
            rzp.open();
        } catch (err) {
            console.error('Payment error:', err);
            toast.error('Payment failed. Please try again.');
            setIsProcessing(false);
        }
    };

    const handleCashPayment = async () => {
        setIsProcessing(true);
        try {
            await api.patch(`/orders/${orderId}/status`, {
                paymentStatus: 'Paid',
                paymentMethod: 'Cash',
                amountPaid: amount,
            });
            toast.success('Cash payment recorded.');
            navigate('/waiter/qr-payment', {
                state: { tableId, tableName, orderId, orderDisplayId, amount, paymentSuccess: true, method: 'cash' },
                replace: true,
            });
        } catch (err) {
            console.error('Cash payment error:', err);
            // AMOUNT_TOO_LOW: marking Paid cannot reduce the bill — the
            // server says to use the Discount option; show its message.
            toast.error(err?.response?.data?.message || 'Failed to record payment.');
        } finally {
            setIsProcessing(false);
        }
    };

    const handleConfirm = () => {
        if (isProcessing) return;
        if (selectedMethod === 'qr') {
            handleQRPayment();
        } else {
            handleCashPayment();
        }
    };

    return (
        <div className="min-h-screen bg-white text-[#1A1A1A] flex flex-col">
            <div className="max-w-180 mx-auto w-full flex-1 flex flex-col">
                {/* Header — sticky so the back button stays reachable */}
                <header className="sticky top-0 z-10 bg-white/95 backdrop-blur px-4 sm:px-6 pt-6 pb-4 flex items-center justify-between border-b border-gray-100">
                    <div className="flex items-center gap-3 min-w-0">
                        <button
                            onClick={() => navigate('/waiter/bill', { state: { tableId, tableName } })}
                            aria-label="Back"
                            className="w-11 h-11 rounded-xl text-gray-600 hover:text-gray-900 hover:bg-gray-50 flex items-center justify-center transition shrink-0"
                        >
                            <ChevronLeft size={24} />
                        </button>
                        <h1 className="text-xl sm:text-2xl font-bold tracking-tight truncate">Payment Option</h1>
                    </div>
                    <span className="text-sm font-semibold text-gray-500 shrink-0">Table {tableName || '—'}</span>
                </header>

                {/* Amount Banner */}
                <div className="bg-[#FFF8F1] px-4 sm:px-6 py-5 flex justify-between items-center">
                    <span className="text-base font-medium text-[#1A181B]">To Pay</span>
                    <span className="text-2xl font-extrabold text-[#101828] tabular-nums">₹{amount.toFixed ? amount.toFixed(2) : amount}</span>
                </div>

                {/* Selection Area */}
                <main className="px-4 sm:px-6 py-6 flex-1">
                    <div className="bg-white border border-[#E8E8E8] rounded-2xl p-4 sm:p-5">
                    <h2 className="text-[18px] font-[600] text-[#101828] mb-[16px]">Select one</h2>

                    <div>
                        {/* QR Code / Online Option */}
                        <button
                            onClick={() => setSelectedMethod('qr')}
                            className={`w-full mb-[16px] flex items-center gap-4 p-4 rounded-2xl ${selectedMethod === 'qr'
                                ? 'bg-[#FFF1E3] border-b-[1px] border-[#FF9B0B] border-t-0 border-l-0 border-r-0'
                                : 'bg-white border-[1px] border-[#E6E8F0CC]'
                                }`}
                        >
                            <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${selectedMethod === 'qr' ? 'bg-white shadow-sm' : 'bg-gray-50'}`}>
                                <Smartphone size={24} className="text-[#FF7A00]" />
                            </div>
                            <div className="flex-1 text-left">
                                <p className="font-[600] text-[#101828] text-[16px]">Pay Online</p>
                                <p className="text-[14px] text-[#6A7282] font-400">UPI, Card, Net Banking via Razorpay</p>
                            </div>
                        </button>

                        {/* Cash Option */}
                        <button
                            onClick={() => setSelectedMethod('cash')}
                            className={`w-full mb-[16px] flex items-center gap-4 p-4 rounded-2xl ${selectedMethod === 'cash'
                                ? 'bg-[#FFF1E3] border-b-[1px] border-[#FF9B0B] border-t-0 border-l-0 border-r-0'
                                : 'bg-white border-[1px] border-[#E6E8F0CC]'
                                }`}
                        >
                            <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${selectedMethod === 'cash' ? 'bg-white shadow-sm' : 'bg-gray-50'}`}>
                                <Zap size={24} className="text-[#FF7A00]" />
                            </div>
                            <div className="flex-1 text-left">
                                <p className="font-[600] text-[#101828] text-[16px]">Pay at Counter (Cash)</p>
                                <p className="text-[14px] text-[#6A7282] font-400">Pay directly at the counter</p>
                            </div>
                        </button>

                        {/* Wallet Option — disabled for staff (see note at top) */}
                        <div
                            aria-disabled="true"
                            className="w-full flex items-center gap-4 p-4 rounded-2xl bg-gray-50 border-[1px] border-[#E6E8F0CC] opacity-70 cursor-not-allowed"
                        >
                            <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-white">
                                <Wallet size={24} className="text-gray-400" />
                            </div>
                            <div className="flex-1 text-left">
                                <p className="font-[600] text-[#6A7282] text-[16px]">Pay with Wallet</p>
                                <p className="text-[14px] text-[#6A7282] font-400">
                                    Not available here — the customer can pay from their wallet in their own BestoDine app.
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            </main>

                {/* Footer Action — sticky bottom, tablet-sized tap target */}
                <div className="sticky bottom-0 px-4 sm:px-6 pt-4 pb-6 bg-white/95 backdrop-blur border-t border-gray-100">
                    <button
                        onClick={handleConfirm}
                        disabled={isProcessing}
                        className={`w-full min-h-14 rounded-2xl px-4 flex items-center justify-center gap-3 text-base font-bold shadow-lg shadow-orange-200 active:scale-[0.98] transition-all ${
                            isProcessing ? 'bg-gray-300 cursor-not-allowed text-gray-500' : 'bg-[#FF7A00] text-white hover:bg-orange-600'
                        }`}
                    >
                        <IndianRupee size={20} />
                        <span>{isProcessing ? 'Processing…' : 'Pay Now'}</span>
                    </button>
                </div>
            </div>
        </div>
    );
};

export default PaymentOption;
