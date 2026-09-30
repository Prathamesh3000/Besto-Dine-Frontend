import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check } from 'lucide-react';
import { readLastOrder } from './kioskState';
import useBlockBackNav from '../../hooks/useBlockBackNav';

export default function PaymentSuccess() {
    const navigate = useNavigate();
    const order = readLastOrder();

    // Kiosk is a shared terminal — after a paid order, back-nav must
    // not return to the PayOption screen with the previous customer's
    // cart still loaded. Redirect to the kiosk landing instead.
    useBlockBackNav('/kiosk');

    // Guard: if the customer deep-links here without a completed order,
    // bounce them back to the kiosk landing instead of showing a stale card.
    useEffect(() => {
        if (!order) navigate('/kiosk', { replace: true });
    }, [order, navigate]);

    if (!order) return null;

    return (
        <div className="min-h-screen font-['Outfit'] relative overflow-hidden flex items-center justify-center bg-white">

            {/* Logo Section */}
            <div className="absolute top-[50px] left-[50px] w-[60px] h-[60px] flex items-center justify-center">
                <img src="/kiosk/icons/logo.svg" alt="Logo" className="w-full h-full object-contain" />
            </div>

            {/* Success Card */}
            <div className="bg-white rounded-[24px] flex flex-col items-center justify-center py-[96px] mx-[185px] w-full border border-[#F3F3F3] shadow-[0px_8px_15.1px_0px_#3F396333]">

                {/* Success Message Section */}
                <div className="flex flex-col items-center w-full">
                    <div className="bg-[#34C759] rounded-full flex items-center justify-center mb-[37px] p-[50px]">
                        <Check size={100} color="white" strokeWidth={4} />
                    </div>

                    <h1 className="text-[40px] font-bold font-nunito text-[#101828] mb-4 text-center leading-[28px]">
                        Payment Successful!
                    </h1>

                    <p className="text-[24px] font-regular font-varela text-[#645E66] text-center mb-[10px] max-w-[400px] leading-[145%]">
                        Thank you! Your order has been placed successfully.
                    </p>

                    <p className="text-[20px] font-regular font-varela text-[#9CA3AF] text-center mb-[30px]">
                        Order ID: <span className="font-semibold text-[#1E2939]">{order.orderId}</span>
                    </p>
                </div>

                {/* Footer Action Section */}
                <div>
                    <button
                        onClick={() => navigate('/kiosk/order-token')}
                        className="w-full bg-[#FE8301] text-white py-[16px] px-[75px] rounded-[16px] text-[20px] leading-[16px] font-nunito font-semibold"
                    >
                        View Order Token
                    </button>
                </div>
            </div>
        </div>
    );
}
