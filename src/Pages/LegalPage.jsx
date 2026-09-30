import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { getActiveTenantSlug } from '../utils/tenant';
import api from '../utils/api';

/**
 * Terms of Service / Privacy Policy.
 *
 * The registration form linked to both with `href="#"` and no routes
 * existed, so accepting the terms meant agreeing to something the
 * customer could not read. These pages close that loop.
 *
 * IMPORTANT — the copy below is a STRUCTURAL PLACEHOLDER, not legal
 * advice, and is marked as such on the page itself. It covers the
 * sections this product actually needs (what's collected, why, who it
 * is shared with, how long it's kept) so a lawyer has something
 * concrete to edit rather than a blank file. Replace the prose before
 * going live in any jurisdiction with data-protection rules — which is
 * all of them.
 *
 * Content resolution order:
 *   1. The tenant's own document, if the restaurant has uploaded one
 *      (site-config `legal.terms` / `legal.privacy`)
 *   2. The platform default below
 */

const PLACEHOLDER_NOTICE =
    'This is a template. Your restaurant should replace it with its own reviewed policy before launch.';

const DEFAULT_TERMS = [
    {
        heading: 'Using this service',
        body: `By creating an account or placing an order you agree to these terms. You must be old enough to form a binding contract where you live, and the details you give us — name, mobile number, email — must be your own and accurate, because we use them to reach you about your order.`,
    },
    {
        heading: 'Orders and payment',
        body: `An order is an offer to buy. It is accepted when the restaurant confirms it, not when you submit it. Prices, taxes and charges shown at checkout are the amounts you will be charged. If an item becomes unavailable after you order, the restaurant will contact you to substitute or refund it.`,
    },
    {
        heading: 'Cancellations and refunds',
        body: `You may cancel before preparation begins. Once cooking has started, cancellation is at the restaurant's discretion, because the food has already been made. Refunds are issued to the original payment method and typically settle within five to seven working days.`,
    },
    {
        heading: 'Table bookings',
        body: `A reservation holds a table for a limited grace period after the booked time. Repeated no-shows may lead to booking privileges being withdrawn. Where a deposit applies, the cancellation window is shown at the time of booking.`,
    },
    {
        heading: 'Acceptable use',
        body: `Do not use this service to place fraudulent orders, to interfere with its operation, or to access accounts that are not yours. We may suspend an account we reasonably believe is being used this way.`,
    },
    {
        heading: 'Liability',
        body: `We provide the ordering platform; the restaurant prepares and is responsible for the food. Tell staff about allergies directly as well as recording them in your profile — an allergy note in an app is not a substitute for speaking to the kitchen.`,
    },
    {
        heading: 'Changes to these terms',
        body: `We may update these terms. Material changes will be notified in the app before they take effect, and continuing to use the service afterwards means you accept them.`,
    },
];

const DEFAULT_PRIVACY = [
    {
        heading: 'What we collect',
        body: `Your name, mobile number and email address when you register. Your order history, table bookings and any allergy or dietary information you record. Payment records — but not your full card number, which stays with the payment provider. Basic technical data such as device type and approximate location when you scan a table QR code.`,
    },
    {
        heading: 'Why we collect it',
        body: `To take and deliver your order, to let the kitchen see your allergy information, to hold your table booking, to process payment and refunds, and to answer you when something goes wrong. We also use aggregate figures — how many orders, which dishes — to run the restaurant. Aggregate figures do not identify you.`,
    },
    {
        heading: 'Allergy information',
        body: `Allergy and dietary details count as sensitive information. We use them only to flag dishes to you and to tell the kitchen preparing your order. We do not use them for marketing or share them with anyone else.`,
    },
    {
        heading: 'Who else sees your data',
        body: `Staff at the restaurant you ordered from, limited to what their role requires. Our payment provider, to take payment. Our email and SMS providers, to send order updates and password resets. Nobody else — we do not sell your data.`,
    },
    {
        heading: 'How long we keep it',
        body: `Account details for as long as your account is open. Order and payment records for as long as tax and accounting rules require, typically several years, even after an account is closed. Table-session data — which table you scanned — is cleared when the visit ends.`,
    },
    {
        heading: 'Your choices',
        body: `You can view and correct your details in your profile, delete your account, ask for a copy of your data, and turn off marketing messages without affecting order notifications. Contact the restaurant to exercise any of these.`,
    },
    {
        heading: 'Security',
        body: `Passwords are stored hashed, never in readable form. Password-reset links are single-use and expire after thirty minutes. Payment card details never reach our servers.`,
    },
];

export default function LegalPage({ kind = 'terms' }) {
    const isTerms = kind === 'terms';
    const title = isTerms ? 'Terms of Service' : 'Privacy Policy';
    const fallback = isTerms ? DEFAULT_TERMS : DEFAULT_PRIVACY;

    const [sections, setSections] = useState(fallback);
    const [restaurantName, setRestaurantName] = useState('');
    const [isCustom, setIsCustom] = useState(false);
    const navigate = useNavigate();

    useEffect(() => {
        document.title = `${title} · BestoDine`;
    }, [title]);

    useEffect(() => {
        // A tenant may publish its own policy. Best-effort: the default
        // above is already rendered, so a failure here changes nothing
        // the customer can see.
        const slug = getActiveTenantSlug();
        if (!slug) return;
        api.get('/public/site-config', { _isBackground: true, _silent: true })
            .then((res) => {
                const cfg = res.data?.config || res.data;
                if (cfg?.name) setRestaurantName(cfg.name);
                const custom = isTerms ? cfg?.legal?.terms : cfg?.legal?.privacy;
                if (Array.isArray(custom) && custom.length) {
                    setSections(custom);
                    setIsCustom(true);
                }
            })
            .catch(() => { /* default copy stands */ });
    }, [isTerms]);

    return (
        <div className="min-h-screen bg-[#F6F6F7]">
            <header className="sticky top-0 z-10 bg-white border-b border-gray-100">
                <div className="max-w-[760px] mx-auto px-4 py-4 flex items-center gap-3">
                    <Link
                        to="/login"
                        aria-label="Back"
                        // Return to wherever the customer came from (menu
                        // footer, sign-up form…). A diner who opened this
                        // from the restaurant home was previously dumped
                        // on /login. Falls back to /login on a direct hit.
                        onClick={(e) => {
                            if ((window.history.state?.idx ?? 0) > 0) {
                                e.preventDefault();
                                navigate(-1);
                            }
                        }}
                        className="w-9 h-9 rounded-full bg-[#F6F6F7] flex items-center justify-center hover:bg-gray-200 transition-colors"
                    >
                        <ChevronLeft size={20} className="text-[#5A535F]" />
                    </Link>
                    <h1 className="text-[17px] font-bold text-[#1A181B]">{title}</h1>
                </div>
            </header>

            <main className="max-w-[760px] mx-auto px-4 py-6">
                <div className="bg-white rounded-[16px] p-6 sm:p-8">
                    <p className="text-[13px] text-[#8D848F] mb-6">
                        {restaurantName ? `${restaurantName} · ` : ''}
                        Last updated {new Date().toLocaleDateString(undefined, {
                            year: 'numeric', month: 'long', day: 'numeric',
                        })}
                    </p>

                    {/* Shown only for the built-in template. A tenant that
                        has published its own reviewed policy shouldn't
                        carry our disclaimer. */}
                    {!isCustom && (
                        <div
                            role="note"
                            className="mb-6 bg-amber-50 border border-amber-200 rounded-[12px] p-3"
                        >
                            <p className="text-[12px] text-amber-800 leading-relaxed">
                                <strong>Template copy.</strong> {PLACEHOLDER_NOTICE}
                            </p>
                        </div>
                    )}

                    <div className="space-y-6">
                        {sections.map((s) => (
                            <section key={s.heading}>
                                <h2 className="text-[15px] font-bold text-[#1A181B] mb-2">{s.heading}</h2>
                                <p className="text-[14px] leading-[1.7] text-[#645E66]">{s.body}</p>
                            </section>
                        ))}
                    </div>

                    <hr className="my-7 border-gray-100" />

                    <p className="text-[13px] text-[#8D848F]">
                        Questions about {isTerms ? 'these terms' : 'your data'}? Speak to staff at the
                        restaurant, or reply to any order confirmation email.
                    </p>

                    <p className="mt-4 text-[13px]">
                        <Link
                            to={isTerms ? '/privacy' : '/terms'}
                            className="text-[#FE8301] font-semibold hover:underline"
                        >
                            Read the {isTerms ? 'Privacy Policy' : 'Terms of Service'} →
                        </Link>
                    </p>
                </div>
            </main>
        </div>
    );
}
