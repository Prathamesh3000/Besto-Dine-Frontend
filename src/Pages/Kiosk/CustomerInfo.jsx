import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ArrowLeft, User, Phone } from 'lucide-react';
import { writeCustomerInfo, clearCustomerInfo } from './kioskState';
import { useKioskIdleReset } from './useKioskIdleReset';

// Backend's createOrder accepts 7–15 digits (after stripping format
// chars). Match that here so a typo gets caught before the customer
// sits through the Razorpay modal.
const PHONE_OK = /^\+?[\d\s()-]{7,20}$/;
// Allows letters (any script), digits, space, dot, apostrophe, hyphen.
// Mirrors the regex in orderController.js so what passes here passes
// the server-side validator too.
const NAME_OK = /^[\p{L}\p{M}0-9 .'-]+$/u;

export default function CustomerInfo() {
    const navigate = useNavigate();
    const location = useLocation();
    const [name, setName] = useState('');
    const [phone, setPhone] = useState('');
    const [error, setError] = useState('');

    useKioskIdleReset(120);

    const validate = () => {
        const n = name.trim();
        const p = phone.trim();
        if (n) {
            if (n.length > 80) return 'Name is too long.';
            if (!NAME_OK.test(n)) return 'Name contains invalid characters.';
        }
        if (p) {
            if (!PHONE_OK.test(p)) return 'Please enter a valid phone number.';
            const digits = p.replace(/[^\d+]/g, '').replace(/^\+/, '');
            if (digits.length < 7 || digits.length > 15) return 'Phone must be 7–15 digits.';
        }
        return '';
    };

    const proceed = (info) => {
        if (info) writeCustomerInfo(info);
        else clearCustomerInfo();
        navigate('/kiosk/pay', { replace: true, state: location.state });
    };

    const handleContinue = () => {
        const msg = validate();
        if (msg) {
            setError(msg);
            return;
        }
        const n = name.trim();
        const p = phone.trim();
        if (!n && !p) {
            // Treat empty-then-Continue as "skip".
            proceed(null);
            return;
        }
        proceed({ name: n || null, phone: p || null });
    };

    return (
        <div className="min-h-screen bg-[#FFF4E3] flex flex-col items-center font-['Outfit'] py-12 px-12">
            <button
                onClick={() => navigate('/kiosk/cart')}
                className="self-start flex items-center gap-2 text-[#F48F1B] font-bold text-[24px] mb-6"
            >
                <ArrowLeft size={28} />
                Back to Cart
            </button>

            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-[720px] p-12 mt-10">
                <h1 className="text-[40px] font-nunito font-extrabold text-[#1E2939] text-center mb-2">
                    Almost there
                </h1>
                <p className="text-[20px] font-varela text-[#6B7280] text-center mb-10">
                    Add your name and phone so we can call you when your order is ready.
                </p>

                <label className="block mb-6">
                    <span className="text-[18px] font-nunito font-semibold text-[#374151] mb-2 flex items-center gap-2">
                        <User size={20} /> Your name <span className="text-[14px] font-varela text-[#9CA3AF] ml-1">(optional)</span>
                    </span>
                    <input
                        type="text"
                        value={name}
                        onChange={(e) => { setName(e.target.value); setError(''); }}
                        placeholder="e.g. Priya"
                        autoComplete="off"
                        maxLength={80}
                        className="w-full bg-[#F9F9F9] border border-[#E5E7EB] rounded-2xl px-5 py-4 text-[22px] font-varela text-[#1E2939] focus:outline-none focus:border-[#FE8301]"
                    />
                </label>

                <label className="block mb-2">
                    <span className="text-[18px] font-nunito font-semibold text-[#374151] mb-2 flex items-center gap-2">
                        <Phone size={20} /> Phone number <span className="text-[14px] font-varela text-[#9CA3AF] ml-1">(optional)</span>
                    </span>
                    <input
                        type="tel"
                        value={phone}
                        onChange={(e) => { setPhone(e.target.value); setError(''); }}
                        placeholder="e.g. +91 98765 43210"
                        inputMode="tel"
                        autoComplete="off"
                        maxLength={20}
                        className="w-full bg-[#F9F9F9] border border-[#E5E7EB] rounded-2xl px-5 py-4 text-[22px] font-varela text-[#1E2939] focus:outline-none focus:border-[#FE8301]"
                    />
                </label>

                {error && (
                    <div className="text-[#DC2626] font-varela text-[16px] mb-2 mt-2">{error}</div>
                )}

                <div className="flex gap-4 mt-10">
                    <button
                        onClick={() => proceed(null)}
                        className="flex-1 bg-[#F3F4F6] text-[#1E2939] py-5 rounded-2xl text-[22px] font-nunito font-semibold active:scale-95 transition-all"
                    >
                        Skip
                    </button>
                    <button
                        onClick={handleContinue}
                        className="flex-1 bg-[#FE8301] text-white py-5 rounded-2xl text-[22px] font-nunito font-semibold active:scale-95 transition-all shadow-lg shadow-orange-200"
                    >
                        Continue to Pay
                    </button>
                </div>
            </div>
        </div>
    );
}
