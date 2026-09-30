import React from 'react';
import { UserRoundCog, LogOut } from 'lucide-react';
import { staffHomePath } from '../../utils/roleRouting';
import { loginPathForAudience } from '../../utils/authStorage';

// Blocking notice shown by AuthContext when ANOTHER tab signed a
// different account into this tab's audience (see utils/authStorage),
// or signed it out. This tab's UI still belongs to the previous account,
// so it must not carry on (api.js already refuses to send the new
// token). Both actions do a full page load so every in-memory cache
// (React Query, socket rooms, contexts) starts fresh for the new identity.
//
// Props: change = { kind: 'switched' | 'signedOut', audience, user? }

const ROLE_LABELS = {
    superadmin: 'Super Admin',
    admin: 'Admin',
    manager: 'Manager',
    captain: 'Captain',
    waiter: 'Waiter',
    chef: 'Chef',
    customer: 'Customer',
};

export default function SessionChangedOverlay({ change }) {
    const loginPath = loginPathForAudience(change.audience);
    const other = change.user;
    const name = other?.name || other?.email || 'another account';
    const role = ROLE_LABELS[other?.role] || other?.role || '';

    const continueAsOther = () => {
        const home = staffHomePath(other);
        if (home) window.location.assign(home);
        else window.location.reload();
    };
    // `switch=1` stops the login page from auto-forwarding the (other)
    // account that is now stored for this audience.
    const signInAgain = () => window.location.assign(`${loginPath}?switch=1`);
    const goToLogin = () => window.location.assign(loginPath);

    const switched = change.kind === 'switched';

    return (
        <div
            className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/55 backdrop-blur-[2px] p-4 font-manrope"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="session-changed-title"
            aria-describedby="session-changed-desc"
        >
            <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl border border-gray-100 p-6">
                <div className="w-11 h-11 rounded-xl bg-[#FFF3E6] flex items-center justify-center mb-4">
                    {switched
                        ? <UserRoundCog className="w-5 h-5 text-[#FE8301]" />
                        : <LogOut className="w-5 h-5 text-[#FE8301]" />}
                </div>
                <h2 id="session-changed-title" className="text-[18px] font-bold text-[#1A181B] leading-tight">
                    {switched ? 'Account changed in another tab' : 'Signed out'}
                </h2>
                <p id="session-changed-desc" className="text-[14px] text-[#5A535F] mt-2 leading-relaxed">
                    {switched
                        ? <>You signed in as <span className="font-semibold text-[#1A181B]">{name}</span>{role ? ` (${role})` : ''} in another tab.</>
                        : 'You were signed out in another tab.'}
                </p>
                <div className="mt-5 flex flex-col gap-2">
                    {switched ? (
                        <>
                            <button
                                type="button"
                                autoFocus
                                onClick={continueAsOther}
                                className="w-full bg-[#FE8301] hover:bg-[#E57501] text-white font-semibold py-2.5 px-4 rounded-xl text-[14px] transition-colors"
                            >
                                Continue as {name}
                            </button>
                            <button
                                type="button"
                                onClick={signInAgain}
                                className="w-full border border-gray-200 hover:bg-gray-50 text-[#1A181B] font-semibold py-2.5 px-4 rounded-xl text-[14px] transition-colors"
                            >
                                Sign in again
                            </button>
                        </>
                    ) : (
                        <button
                            type="button"
                            autoFocus
                            onClick={goToLogin}
                            className="w-full bg-[#FE8301] hover:bg-[#E57501] text-white font-semibold py-2.5 px-4 rounded-xl text-[14px] transition-colors"
                        >
                            Sign in
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}
