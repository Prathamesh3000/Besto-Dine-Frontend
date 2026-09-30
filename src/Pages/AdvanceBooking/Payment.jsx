import React, { useState } from 'react';
import { ChevronLeft, Smartphone, CreditCard, Wallet, CheckCircle2 } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useCart } from '../../Context/CartContext';
import { useAuth } from '../../Context/AuthContext';
import BookingProgressBar from './BookingProgressBar';
import { advanceBookingAPI, razorpayAPI } from '../../utils/api';
import toast from 'react-hot-toast';

// Payment Method Option Component
const PaymentOption = ({ icon: Icon, title, subtitle, selected, onClick, disabled }) => (
  <button
    onClick={onClick}
    disabled={disabled}
    className={`relative group w-full flex items-center gap-5 p-5 rounded-[20px] border transition-all duration-300 ${
      disabled ? 'opacity-50 cursor-not-allowed' : ''
    } ${selected
      ? 'border-[#FE8301] bg-[#FFF9F2] shadow-sm'
      : 'border-[#F2F4F7] bg-white hover:border-gray-300'
      }`}
  >
    <div className={`w-14 h-14 rounded-full flex items-center justify-center transition-colors ${selected ? 'bg-[#FE8301] text-white' : 'bg-[#FAFAFA] text-[#645E66] group-hover:bg-[#F2F4F7]'
      }`}>
      <Icon size={24} />
    </div>
    <div className="flex-1 text-left">
      <h3 className="font-[700] text-[#1A181B] text-[17px] leading-tight mb-0.5">{title}</h3>
      <p className="text-[13px] font-[500] text-[#645E66]">{subtitle}</p>
    </div>
    <div className={`w-[20px] h-[20px] rounded-full border-2 transition-all flex items-center justify-center ${selected ? 'border-[#FE8301] bg-[#FE8301]' : 'border-[#D1D5DB]'
      }`}>
      {selected && <div className="w-2 h-2 bg-white rounded-full shadow-sm" />}
    </div>
  </button>
);

// Success Modal Component
const SuccessModal = ({ isOpen, message, onClose }) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center px-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
      <div className="bg-white rounded-[32px] p-8 max-w-[400px] w-full text-center shadow-2xl animate-in zoom-in-95 duration-300">
        <div className="w-20 h-20 bg-orange-50 rounded-full flex items-center justify-center mx-auto mb-6">
          <CheckCircle2 size={48} className="text-[#FE8301]" />
        </div>
        <h2 className="text-[24px] font-[800] text-[#1A181B] mb-3">Great News!</h2>
        <p className="text-[#645E66] text-[15px] font-[500] leading-relaxed mb-8">
          {message}
        </p>
        <button
          onClick={onClose}
          className="w-full bg-[#FE8301] text-white font-[800] py-4 rounded-[20px] shadow-lg shadow-orange-100 hover:bg-[#e07400] transition-all transform active:scale-[0.98]"
        >
          View Booking Summary
        </button>
      </div>
    </div>
  );
};

// Load Razorpay script dynamically
function loadRazorpayScript() {
  return new Promise((resolve) => {
    if (window.Razorpay) { resolve(true); return; }
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
  const { user } = useAuth();

  // Pricing comes from the review screen. BookingReview already decided
  // whether the customer is paying 50% advance or full and passes:
  //   - bookingTotal : the real booking value (₹7,050)
  //   - total        : the amount to charge NOW (₹3,525 for advance, ₹7,050 for full)
  //   - paymentType  : 'advance' | 'full'
  // Older callers that only pass `total` are tolerated via the fallback
  // (treat `total` as the full value and compute the advance locally).
  const bookingData = location.state || {};
  const paymentType = bookingData.paymentType || 'advance';
  const bookingTotal = Number(bookingData.bookingTotal || bookingData.total || 0);
  // Was: `Math.ceil(totalAmount * 0.5)` against an already-halved value,
  // which displayed ₹1,763 instead of ₹3,525 and silently charged the
  // customer the wrong amount via Razorpay. Now we trust the review
  // screen's decision and only fall back to halving for legacy callers
  // that didn't pass `paymentType`.
  const amountDueNow = Number(
    bookingData.paymentType
      ? (bookingData.total || 0)
      : Math.ceil(bookingTotal * 0.5)
  );
  const remainingAfter = Math.max(0, bookingTotal - amountDueNow);

  // Guard: redirect if no booking data present (user navigated directly)
  React.useEffect(() => {
    if (!bookingData.bookingType || !bookingTotal) {
      navigate('/customer/booking-type', { replace: true });
    }
  }, [bookingData.bookingType, bookingTotal, navigate]);

  const [selectedMethod, setSelectedMethod] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [modalMsg, setModalMsg] = useState('');
  const [savedOrderId, setSavedOrderId] = useState(null);

  const { clearCart } = useCart();

  const paymentMethods = [
    { id: 'upi', icon: Smartphone, title: 'UPI', subtitle: 'Google Pay, PhonePe, Paytm' },
    { id: 'card', icon: CreditCard, title: 'Card', subtitle: 'Credit or Debit card' },
    { id: 'wallet', icon: Wallet, title: 'Wallet', subtitle: 'Digital wallets' },
  ];

  const handlePayNow = async () => {
    if (!selectedMethod || isProcessing) return;

    setIsProcessing(true);
    await handleRazorpayPayment();
  };

  const createBooking = async (paymentMethod, rzpResponse) => {
    try {
      const response = await advanceBookingAPI.createBooking({
        ...bookingData,
        paymentMethod,
        // Send the REAL booking total so the backend's
        // `payment.totalAmount` is the full value (₹7,050), not the
        // advance slice. Backend computes 50% advance server-side
        // from this; sending the already-halved value made
        // totalAmount = ₹3,525 and advancePaid = ₹1,763 in the DB.
        total: bookingTotal,
        // The server re-verifies the payment (signature + gateway fetch)
        // and recomputes the price; it never trusts a client 'Paid'.
        razorpayPaymentId: rzpResponse?.razorpay_payment_id || undefined,
        razorpay_order_id: rzpResponse?.razorpay_order_id || undefined,
        razorpay_signature: rzpResponse?.razorpay_signature || undefined,
      });

      if (response.data.success) {
        clearCart();
        const orderId = response.data.booking.bookingId || response.data.booking._id;
        setSavedOrderId(orderId);

        setModalMsg('Payment successful! Your reservation has been confirmed.');
        setShowModal(true);
      }
    } catch (err) {
      console.error('Booking creation error:', err);
      // Surface the server's reason (e.g. hall slot already taken,
      // capacity mismatch) instead of a generic failure.
      toast.error(err.response?.data?.message || 'Failed to create booking. Please try again.');
      // Money was taken but no booking exists — start the automatic
      // refund (server refuses if the payment is linked to anything).
      if (rzpResponse?.razorpay_payment_id && err.response?.data?.code !== 'PAYMENT_ALREADY_USED') {
        razorpayAPI.orphanRefund({
          razorpay_payment_id: rzpResponse.razorpay_payment_id,
          razorpay_order_id: rzpResponse.razorpay_order_id,
          razorpay_signature: rzpResponse.razorpay_signature,
          reason: err.response?.data?.message || 'Booking could not be saved',
        }).then(() => {
          toast('Your payment is being refunded automatically.', { id: 'booking-refund', duration: 8000 });
        }).catch(() => { /* staff can reconcile manually */ });
      }
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRazorpayPayment = async () => {
    const scriptLoaded = await loadRazorpayScript();
    if (!scriptLoaded) {
      toast.error('Failed to load payment gateway. Please check your internet connection.');
      setIsProcessing(false);
      return;
    }

    try {
      // Create Razorpay order for 50% advance amount only
      const { data } = await razorpayAPI.createOrder(amountDueNow);
      if (!data.success) {
        toast.error('Failed to initiate payment. Please try again.');
        setIsProcessing(false);
        return;
      }

      const options = {
        key: data.key,
        amount: data.razorpayOrder.amount,
        currency: data.razorpayOrder.currency,
        name: 'BestoDine',
        description: `Advance Booking Payment`,
        order_id: data.razorpayOrder.id,
        handler: async (response) => {
          // Verify payment on backend
          try {
            const verifyRes = await razorpayAPI.verifyPayment({
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
            });

            if (verifyRes.data.success) {
              // Payment verified — now create the booking
              await createBooking(selectedMethod, response);
            } else {
              toast.error('Payment verification failed. Please contact support.');
              setIsProcessing(false);
            }
          } catch {
            toast.error('Payment verification failed. Please contact support.');
            setIsProcessing(false);
          }
        },
        prefill: {
          name: user?.name || '',
          email: user?.email || '',
          contact: user?.mobile || '',
        },
        theme: { color: '#FE8301' },
        modal: {
          ondismiss: () => {
            setIsProcessing(false);
          },
        },
      };

      const rzp = new window.Razorpay(options);
      rzp.on('payment.failed', (resp) => {
        toast.error(`Payment failed: ${resp.error.description}`);
        setIsProcessing(false);
      });
      rzp.open();
    } catch (err) {
      console.error('Razorpay error:', err);
      toast.error('Payment failed. Please try again.');
      setIsProcessing(false);
    }
  };

  const handleModalClose = () => {
    setShowModal(false);
    // `replace: true` so the back button doesn't return to this Payment
    // screen — the booking is paid for, going back would let the user
    // re-trigger Razorpay against the same (or a now-stale) state and
    // potentially double-charge.
    navigate('/customer/booking-success', {
      state: { ...bookingData, orderId: savedOrderId, paymentMethod: selectedMethod },
      replace: true,
    });
  };

  return (
    <div className="min-h-screen bg-[#FDFDFD] font-manrope selection:bg-orange-100 pb-24 lg:pb-12">
      <SuccessModal
        isOpen={showModal}
        message={modalMsg}
        onClose={handleModalClose}
      />

      <div className="w-full">
        <BookingProgressBar />
      </div>

      <div className="max-w-[1240px] mx-auto px-5 lg:px-12 mt-8 flex-1">
        {/* Desktop Header */}
        <div className="hidden lg:flex items-center justify-between mb-8">
          <h1 className="text-[32px] font-[800] text-[#1A181B] tracking-tight">Payment Option</h1>
        </div>

        {/* Mobile Header */}
        <header className="flex lg:hidden items-center justify-between py-6 bg-white sticky top-0 z-40">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate(-1)} className="p-1 -ml-1">
              <ChevronLeft size={24} className="text-[#1A181B]" />
            </button>
            <h1 className="text-[18px] font-[700] text-[#1A181B]">Payment option</h1>
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
          <div className="lg:col-span-2 space-y-6">
            <div className="flex flex-col gap-4">
              <div className="bg-[#FFF9F2] px-6 py-4 rounded-[20px] border border-orange-100 flex-shrink-0">
                <div className="flex items-center justify-between">
                  <span className="text-[#645E66] font-[600] text-[15px]">
                    {paymentType === 'full' ? 'Pay full amount' : 'Advance to pay now (50%)'}
                  </span>
                  <span className="text-[20px] lg:text-[24px] font-[800] text-[#FE8301]">₹{amountDueNow.toLocaleString()}</span>
                </div>
                {remainingAfter > 0 && (
                  <p className="text-[12px] text-[#9CA3AF] mt-1">Remaining ₹{remainingAfter.toLocaleString()} due on event day</p>
                )}
              </div>

              <div className="bg-white border border-[#F2F4F7] rounded-[24px] p-6 lg:p-8 shadow-[0px_2px_12px_rgba(0,0,0,0.02)]">
                <h2 className="text-[16px] lg:text-[18px] font-[700] text-[#1A181B] mb-6">Select payment method</h2>
                <div className="space-y-4">
                  {paymentMethods.map((method) => (
                    <PaymentOption
                      key={method.id}
                      icon={method.icon}
                      title={method.title}
                      subtitle={method.subtitle}
                      selected={selectedMethod === method.id}
                      onClick={() => setSelectedMethod(method.id)}
                      disabled={method.disabled}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="hidden lg:block lg:col-span-1">
             <div className="bg-[#F8F9FB] rounded-[24px] p-6 border border-[#F2F4F7]">
                <h3 className="font-bold text-[16px] text-[#1A181B] mb-3">Secure Payment</h3>
                <p className="text-[13px] text-[#8D848F] leading-relaxed">
                  Your payment information is processed securely via Razorpay. We do not store any sensitive card details on our servers.
                </p>
             </div>
          </div>
        </div>
      </div>

      {/* Footer Actions (Desktop & Mobile) */}
      <div className="fixed bottom-0 left-0 right-0 bg-white p-4 flex gap-4 lg:hidden shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] z-50">
        <button onClick={() => navigate(-1)} className="flex-1 bg-[#F2F2F2] text-[#645E66] font-bold py-4 rounded-[16px]">
          Previous
        </button>
        <button
          onClick={handlePayNow}
          disabled={isProcessing || !selectedMethod}
          className={`flex-1 font-bold py-4 rounded-[16px] transition-all shadow-lg ${
            isProcessing || !selectedMethod ? 'bg-gray-300 cursor-not-allowed' : 'bg-[#FE8301] text-white shadow-orange-200'
          }`}
        >
          {isProcessing ? 'Processing...' : 'Pay Now'}
        </button>
      </div>

      <div className="hidden lg:flex justify-end gap-3 max-w-[1240px] mx-auto px-5 lg:px-12 mt-8">
        <button onClick={() => navigate(-1)} className="bg-[#F2F2F2] text-[#645E66] font-bold text-[14px] py-3.5 px-10 rounded-[16px] w-[160px] text-center">
          Previous
        </button>
        <button
          onClick={handlePayNow}
          disabled={isProcessing || !selectedMethod}
          className={`font-bold text-[14px] py-3.5 px-10 rounded-[16px] w-[160px] text-center transition-all shadow-lg ${
            isProcessing || !selectedMethod ? 'bg-gray-300 cursor-not-allowed' : 'bg-[#FE8301] text-white shadow-orange-200'
          }`}
        >
          {isProcessing ? 'Processing' : 'Pay Now'}
        </button>
      </div>
    </div>
  );
}

export default Payment;
