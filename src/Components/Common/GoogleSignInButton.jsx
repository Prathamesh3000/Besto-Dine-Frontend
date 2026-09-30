import React, { useEffect, useRef, useState } from 'react';

/**
 * "Continue with Google" — Google Identity Services button.
 *
 * Renders Google's own button rather than a lookalike. That isn't
 * deference to their brand guidelines alone: the real button is what
 * users have been trained to recognise, and a custom one that opens a
 * Google-branded popup is the exact shape of a credential-phishing
 * screen. Using theirs keeps the trust signal honest.
 *
 * The component renders NOTHING when VITE_GOOGLE_CLIENT_ID is unset, so
 * a deployment without Google configured shows no dead button. The
 * backend refuses the endpoint independently (503), so the two can't
 * disagree in a way that strands a user mid-sign-in.
 *
 * The client id is public by design — it ships in every page that uses
 * Google Sign-In. There is no client SECRET anywhere in this
 * integration; see Backend/utils/googleAuth.js for why the ID-token
 * flow needs none.
 */

const GIS_SRC = 'https://accounts.google.com/gsi/client';

/** Load the GIS script once per page, no matter how many buttons mount. */
let gisPromise = null;
function loadGis() {
    if (gisPromise) return gisPromise;

    gisPromise = new Promise((resolve, reject) => {
        // Another bundle (or a hot reload) may already have added it.
        if (window.google?.accounts?.id) {
            resolve();
            return;
        }
        const existing = document.querySelector(`script[src="${GIS_SRC}"]`);
        if (existing) {
            existing.addEventListener('load', () => resolve());
            existing.addEventListener('error', () => reject(new Error('Google script failed to load')));
            return;
        }
        const script = document.createElement('script');
        script.src = GIS_SRC;
        script.async = true;
        script.defer = true;
        script.onload = () => resolve();
        script.onerror = () => reject(new Error('Google script failed to load'));
        document.head.appendChild(script);
    }).catch((err) => {
        // Let a later mount retry — a failed load is usually a blocked
        // network or an ad blocker, both of which can change.
        gisPromise = null;
        throw err;
    });

    return gisPromise;
}

export default function GoogleSignInButton({
    onCredential,
    disabled = false,
    text = 'continue_with',
    width = 320,
}) {
    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
    const containerRef = useRef(null);
    // 'loading' → 'ready' | 'script-error' | 'render-error'
    //
    // 'render-error' is the case that used to be invisible: the GIS
    // script loads fine, renderButton() is called without throwing, and
    // Google then declines to draw anything — which is exactly what
    // happens on an origin mismatch, a consent screen still in Testing,
    // or a browser blocking the button's iframe. The old code only
    // caught script-load failures, so all of those showed the user an
    // "or" divider above empty space with no explanation anywhere.
    const [status, setStatus] = useState('loading');

    // Keep the latest callback in a ref. GIS captures the callback once,
    // at initialize() time, so a re-render that produces a new function
    // identity would otherwise leave Google holding a stale closure.
    const callbackRef = useRef(onCredential);
    useEffect(() => { callbackRef.current = onCredential; }, [onCredential]);

    useEffect(() => {
        if (!clientId) return undefined;

        let cancelled = false;
        let probe;

        loadGis()
            .then(() => {
                if (cancelled || !containerRef.current) return;

                window.google.accounts.id.initialize({
                    client_id: clientId,
                    callback: (response) => {
                        if (response?.credential) callbackRef.current?.(response.credential);
                    },
                    // FedCM is Google's replacement for third-party
                    // cookies here. Without it this breaks in browsers
                    // that have already switched them off.
                    use_fedcm_for_prompt: true,
                    cancel_on_tap_outside: true,
                });

                window.google.accounts.id.renderButton(containerRef.current, {
                    theme: 'outline',
                    size: 'large',
                    shape: 'pill',
                    text,
                    logo_alignment: 'center',
                    width,
                });

                // renderButton is asynchronous and never rejects — it
                // injects an iframe when Google is happy and does
                // nothing at all when it isn't. Checking whether the
                // container actually gained a child is the only way to
                // tell those apart from here.
                probe = setTimeout(() => {
                    if (cancelled || !containerRef.current) return;
                    if (containerRef.current.childElementCount > 0) {
                        setStatus('ready');
                    } else {
                        setStatus('render-error');
                        // Google logs its own reason to the console, but
                        // it's easy to miss among app noise. Name the
                        // three things that actually cause this.
                        console.warn(
                            [
                                '[GoogleSignInButton] Google returned no button. Usual causes:',
                                `  1. This origin (${window.location.origin}) is not listed in the OAuth`,
                                "     client's Authorised JavaScript origins.",
                                '  2. The OAuth consent screen is still in "Testing" and this Google',
                                '     account is not listed as a test user.',
                                '  3. A browser extension or tracking protection blocked the iframe.',
                                `  client_id in use: ${clientId}`,
                            ].join('\n'),
                        );
                    }
                }, 1500);
            })
            .catch(() => {
                if (!cancelled) setStatus('script-error');
            });

        return () => {
            cancelled = true;
            clearTimeout(probe);
        };
    }, [clientId, text, width]);

    // Not configured for this deployment — render nothing at all rather
    // than a button that cannot work.
    if (!clientId) return null;

    if (status === 'script-error' || status === 'render-error') {
        return (
            <p className="text-[12px] text-[#8D848F] text-center leading-relaxed">
                Google Sign-In isn't available right now — use your email and password below.
                <br />
                <span className="text-[11px] text-[#A8A2AB]">
                    (Developers: see the console for the reason.)
                </span>
            </p>
        );
    }

    return (
        <div
            className={`flex justify-center transition-opacity ${disabled ? 'opacity-50 pointer-events-none' : ''}`}
        >
            {/* Google renders its own iframe button into this node. */}
            <div ref={containerRef} />
        </div>
    );
}
