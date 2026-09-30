import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { bootstrapKioskTenant, clearKioskSession } from './kioskState';
import { isFeatureEnabled, getActiveTenantSlug } from '../../utils/tenant';
import api from '../../utils/api';

const LandingPage = () => {
    const navigate = useNavigate();
    const [tenant, setTenant] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        // Clear any stale cart/orderType from the previous session so the
        // next customer starts fresh (kiosk is multi-user, one device).
        clearKioskSession();
        let alive = true;
        (async () => {
            const resolved = await bootstrapKioskTenant();
            if (!alive) return;
            setTenant(resolved);
            setLoading(false);

            // KIOSK-PERF — production warm-up:
            // Customers tap "Touch to Start" within 1-3 seconds of the
            // landing screen rendering. On production (Render + Atlas)
            // a cold backend means the /public/menu-bootstrap call from
            // Menu.jsx blocks the screen for 3-8 seconds. Pre-fire it
            // here so the response is already cached (browser HTTP +
            // React Query 60s window) by the time the customer reaches
            // /kiosk/menu. We use the slug we just resolved so we
            // don't race with setActiveTenant. Fire-and-forget; errors
            // are silently swallowed because Menu.jsx will retry.
            const slug = resolved?.slug || getActiveTenantSlug();
            if (slug) {
                api.get(`/public/menu-bootstrap?slug=${slug}`, { _isBackground: true })
                    .catch(() => {});
            }
        })();
        return () => { alive = false; };
    }, []);

    if (loading) {
        return (
            <div className="w-full min-h-screen flex items-center justify-center bg-[#0a1a0a]">
                <div className="w-10 h-10 border-4 border-[#EF7B00] border-t-transparent rounded-full animate-spin" />
            </div>
        );
    }

    // No tenant bootstrapped — show a clear admin-facing setup message.
    // Kiosks launch from a URL like: https://app.example.com/kiosk?slug=<restaurant>
    if (!tenant) {
        return (
            <div className="w-full min-h-screen flex items-center justify-center bg-[#0a1a0a] p-[50px] font-varela">
                <div className="max-w-[640px] text-center">
                    <h1 className="text-[48px] text-white font-pt-sans font-bold leading-tight mb-[20px]">
                        Kiosk not configured
                    </h1>
                    <p className="text-[24px] text-white/80 font-varela mb-[12px]">
                        This device has not been paired with a restaurant yet.
                    </p>
                    <p className="text-[18px] text-white/60 font-varela">
                        Launch the kiosk with <code className="bg-white/10 px-2 py-1 rounded">?slug=&lt;restaurant-slug&gt;</code> in the URL to pair it.
                    </p>
                </div>
            </div>
        );
    }

    // Feature gate — kiosk is a paid add-on. Tenants whose plan does
    // not include the `kiosk` feature see an upgrade prompt instead of
    // the live ordering UI. The admin-side gate is the source of truth;
    // backend `featureGate('kiosk')` would also block any kiosk-only
    // endpoint we ever add.
    if (!isFeatureEnabled('kiosk')) {
        return (
            <div className="w-full min-h-screen flex items-center justify-center bg-[#0a1a0a] p-[50px] font-varela">
                <div className="max-w-[640px] text-center">
                    <h1 className="text-[48px] text-white font-pt-sans font-bold leading-tight mb-[20px]">
                        Self-Order Kiosk not enabled
                    </h1>
                    <p className="text-[24px] text-white/80 font-varela mb-[12px]">
                        {tenant.name || 'This restaurant'} is not subscribed to the Kiosk add-on.
                    </p>
                    <p className="text-[18px] text-white/60 font-varela">
                        Ask your restaurant admin to upgrade the plan to enable kiosk ordering.
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div
            className="relative w-full min-h-screen overflow-hidden font-varela flex flex-col justify-between bg-[#0a1a0a] bg-cover bg-bottom bg-no-repeat p-[50px]"
            style={{
                backgroundImage: "linear-gradient(180deg, rgba(0,0,0,0) 51.76%, rgba(0,0,0,0.72) 68.25%), url('/kiosk/images/LandingImage.jpg')"
            }}
        >
            <div className='w-full'>
                <div className='flex justify-start'>
                    <img src="/kiosk/icons/logo.svg" alt="Logo" className="object-contain" />
                </div>
            </div>
            <div className='w-full'>
                <div className='w-full mb-[60px]'>
                    <p className='text-[96px] text-white font-pt-sans font-bold leading-[1] mb-[16px] leading-[108%]'>
                        Welcome! <br />
                        Ready to Order?
                    </p>
                    <p className='text-white text-[32px] font-varela font-regular'>
                        Customize your meal, skip the queue, <br />
                        and enjoy faster service.
                    </p>
                </div>
                <button
                    onClick={() => navigate('/kiosk/order-type')}
                    /* KIOSK-PERF — instant tap feedback. Without
                       active:scale + a fast transition the customer
                       taps the screen, sees nothing change for ~100ms
                       (React render + route resolve), and assumes the
                       button is broken. Now the press visibly bounces
                       the moment the finger lands. */
                    className='py-[22px] leading-[100%] rounded-[24px] text-[36px] font-varela font-regular text-[#ffffff] bg-[#EF7B00] w-full mb-[30px] active:scale-[0.98] transition-transform duration-75 shadow-lg shadow-orange-500/30'>
                    Touch to Start
                </button>
            </div>
        </div>
    );
};

export default LandingPage;
