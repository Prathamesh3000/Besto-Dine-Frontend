import React from 'react';
import { ChevronLeft, CheckCircle2, ArrowRight } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import useBlockBackNav from '../../hooks/useBlockBackNav';

const QRPayment = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const { tableId, tableName, orderId, orderDisplayId, amount = 0, paymentSuccess, method } = location.state || {};

    // Once the captain has settled an order, back-nav must not return
    // to the PaymentOption screen where they could re-trigger Razorpay
    // against an already-paid order. Only guard the success state —
    // when paymentSuccess is false (the "awaiting payment" view) the
    // captain may genuinely want to back out and retry.
    useBlockBackNav(paymentSuccess ? '/waiter/home' : null);

    return (
        <div className="min-h-screen bg-white text-[#1A1A1A] flex flex-col">
            <div className="max-w-2xl mx-auto w-full flex-1 flex flex-col">
                {/* Header */}
                <header className="px-4 sm:px-6 pt-6 pb-4 flex items-center justify-between bg-white/95 backdrop-blur sticky top-0 z-10 border-b border-gray-100">
                    <div className="flex items-center gap-3 min-w-0">
                        <button
                            onClick={() => navigate('/waiter/home')}
                            aria-label="Back"
                            className="w-11 h-11 rounded-xl text-gray-600 hover:text-gray-900 hover:bg-gray-50 flex items-center justify-center transition shrink-0"
                        >
                            <ChevronLeft size={24} />
                        </button>
                        <h1 className="text-xl sm:text-2xl font-bold tracking-tight truncate">Payment Confirmation</h1>
                    </div>
                    <span className="text-sm font-semibold text-gray-500 shrink-0">Table {tableName || '—'}</span>
                </header>

                {/* Amount Banner */}
                <div className="bg-[#FFF8F1] px-4 sm:px-6 py-5 flex justify-between items-center">
                    <span className="text-base font-medium text-gray-700">Paid</span>
                    <span className="text-2xl font-extrabold tabular-nums">₹{typeof amount === 'number' ? amount.toFixed(2) : amount}</span>
                </div>

                {/* Success Content */}
                <main className="px-4 sm:px-6 flex-1 flex flex-col items-center justify-center py-10">
                {paymentSuccess ? (
                    <>
                        <div className="w-28 h-28 bg-green-50 rounded-full flex items-center justify-center mb-6">
                            <CheckCircle2 size={64} className="text-green-500" />
                        </div>
                        <h2 className="text-2xl font-bold text-gray-800 mb-2">Payment Successful!</h2>
                        <p className="text-gray-500 text-center mb-2">
                            Order {orderDisplayId || orderId} — Table {tableName || '—'}
                        </p>
                        <p className="text-gray-400 text-sm text-center mb-8">
                            {method === 'cash' ? 'Cash payment recorded' : 'Online payment verified'}
                        </p>

                        {/* Barcode for the order */}
                        <div className="flex flex-col items-center mb-8">
                            <img
                                src={`https://barcode.tec-it.com/barcode.ashx?data=${encodeURIComponent(orderDisplayId || orderId || 'ORDER')}&code=Code128`}
                                alt="barcode"
                                className="h-16"
                            />
                            <p className="text-xs mt-2 tracking-widest text-gray-600">
                                {orderDisplayId || orderId}
                            </p>
                        </div>

                        <div className="text-center">
                            <p className="text-xl font-bold text-gray-800">Thank you,</p>
                            <p className="text-xl font-bold text-gray-800">Please visit again</p>
                        </div>
                    </>
                ) : (
                    <>
                        <div className="w-28 h-28 bg-orange-50 rounded-full flex items-center justify-center mb-6">
                            <span className="text-4xl">⏳</span>
                        </div>
                        <h2 className="text-xl font-bold text-gray-800 mb-2">Awaiting Payment</h2>
                        <p className="text-gray-500 text-center">
                            No payment confirmation received yet. Please complete payment from the Payment Options page.
                        </p>
                    </>
                )}
                </main>

                {/* Footer Actions */}
                <div className="px-4 sm:px-6 pt-4 pb-8 bg-white space-y-3 border-t border-gray-100">
                    <button
                        onClick={() => navigate('/waiter/home')}
                        className="w-full min-h-14 bg-[#FF7A00] hover:bg-orange-600 text-white rounded-2xl px-4 flex items-center justify-center gap-3 text-base font-bold shadow-lg shadow-orange-200 active:scale-[0.98] transition-all"
                    >
                        <span>Back to Tables</span>
                        <ArrowRight size={20} />
                    </button>
                </div>
            </div>
        </div>
    );
};

export default QRPayment;
