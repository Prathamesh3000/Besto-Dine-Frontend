import React from 'react';
import { Link } from 'react-router-dom';
import { Lock, LogOut, UserX } from 'lucide-react';
import { useAuth } from '../Context/AuthContext';
import { FEATURE_LABELS } from '../utils/featureLabels';

/**
 * RequireFeature — page-level plan gate.
 *
 * The admin nav already shows locked modules with a "Pro" badge, but a
 * typed URL, a bookmark or a staff app opened on a plan that doesn't
 * include it would otherwise land on a page whose every API call 403s.
 * This renders a clear "not in your plan" screen instead.
 *
 * Props
 *   feature  — feature key (see utils/featureLabels.js)
 *   roles    — optional list of roles the gate applies to. Others pass
 *              straight through (e.g. the waiter-app gate applies to
 *              waiters and captains, not to an admin using /waiter/*).
 *
 * It also applies the restaurant's operations profile: a waiter, captain
 * or chef whose role the restaurant has switched off (e.g. a self-service
 * hotel with no waiters) sees "your restaurant doesn't use this app".
 *
 * The backend enforces the same rules (featureGate / staffAppGate), so
 * this is purely UX.
 */
const OPS_ROLES = new Set(['waiter', 'captain', 'chef']);

export default function RequireFeature({ feature, roles, children }) {
    const { hasFeature, user, operations } = useAuth();
    const role = user?.role;
    if (roles && !roles.includes(role)) return children;
    if (!hasFeature(feature)) return <FeatureLockedScreen feature={feature} />;
    if (OPS_ROLES.has(role) && operations?.roles?.[role] === false) return <RoleNotInUseScreen role={role} />;
    return children;
}

const ROLE_APP_LABELS = { waiter: 'the waiter app', captain: 'the captain app', chef: 'the kitchen screen' };

export function RoleNotInUseScreen({ role }) {
    const { logout } = useAuth();
    return (
        <div className="min-h-[60vh] flex items-center justify-center p-6" data-testid="role-not-in-use">
            <div className="max-w-md w-full bg-white rounded-2xl border border-slate-100 shadow-sm p-8 text-center">
                <div className="w-14 h-14 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-4">
                    <UserX size={24} className="text-slate-600" />
                </div>
                <h1 className="text-xl font-bold text-slate-800 mb-2">Not used at your restaurant</h1>
                <p className="text-sm text-slate-600 leading-relaxed mb-6">
                    Your restaurant is set up without {ROLE_APP_LABELS[role] || 'this app'}. Please ask your manager if this is a mistake.
                </p>
                <button
                    type="button"
                    onClick={() => logout()}
                    className="inline-flex items-center justify-center gap-2 w-full py-2.5 px-4 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-sm transition"
                >
                    <LogOut size={16} /> Sign out
                </button>
            </div>
        </div>
    );
}

export function FeatureLockedScreen({ feature }) {
    const { user, tenant, logout } = useAuth();
    const role = user?.role;
    const label = FEATURE_LABELS[feature] || feature;
    const planName = tenant?.planName || 'your current plan';
    const isOwnerSide = role === 'admin' || role === 'manager';
    const isStaffApp = role === 'waiter' || role === 'captain' || role === 'chef';

    return (
        <div className="min-h-[60vh] flex items-center justify-center p-6" data-testid="feature-locked">
            <div className="max-w-md w-full bg-white rounded-2xl border border-slate-100 shadow-sm p-8 text-center">
                <div className="w-14 h-14 rounded-full bg-amber-100 flex items-center justify-center mx-auto mb-4">
                    <Lock size={24} className="text-amber-600" />
                </div>
                <h1 className="text-xl font-bold text-slate-800 mb-2">{label} is not in your plan</h1>
                <p className="text-sm text-slate-600 leading-relaxed mb-6">
                    {isOwnerSide
                        ? <>Your restaurant is on <span className="font-semibold text-slate-800">{planName}</span>, which doesn&apos;t include {label}. Upgrade your plan or add it as an add-on to unlock it.</>
                        : <>Your restaurant&apos;s plan (<span className="font-semibold text-slate-800">{planName}</span>) doesn&apos;t include {label}. Please ask your restaurant owner to upgrade.</>}
                </p>
                {role === 'admin' && (
                    <Link
                        to="/admin/subscription"
                        className="inline-flex items-center justify-center w-full py-2.5 px-4 rounded-xl bg-orange-500 hover:bg-orange-600 text-white font-semibold text-sm transition"
                    >
                        View plans &amp; upgrade
                    </Link>
                )}
                {isStaffApp && (
                    <button
                        type="button"
                        onClick={() => logout()}
                        className="inline-flex items-center justify-center gap-2 w-full py-2.5 px-4 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-sm transition"
                    >
                        <LogOut size={16} /> Sign out
                    </button>
                )}
            </div>
        </div>
    );
}
