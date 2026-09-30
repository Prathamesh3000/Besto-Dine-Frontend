import React, { useEffect, useState } from 'react';
import { X, Lock, Mail } from 'lucide-react';
import { subscribeUpgradePrompt } from '../../utils/upgradePromptBus';
import { FEATURE_LABELS } from '../../utils/featureLabels';

/**
 * UpgradePrompt — modal shown when a staff user hits a FEATURE_LOCKED
 * 403 from the backend. Phase 5 step 1 replaces the raw "Your current
 * plan does not include X" toast with this friendly variant that:
 *
 *   - Names the feature in human-readable terms (via FEATURE_LABELS)
 *   - Shows the tenant's current plan
 *   - Gives the owner a clear contact path to upgrade
 *
 * Invocation: the api.js response interceptor calls
 * `openUpgradePrompt({ feature, currentPlan, message })` from
 * utils/upgradePromptBus.js when it detects
 * `response.data.code === 'FEATURE_LOCKED'`. The host component
 * (<UpgradePromptHost />) mounts once at app root and subscribes to
 * the pub-sub so the prompt can fire from anywhere without prop
 * drilling.
 *
 * The pub-sub lives in utils/ (not this file) so react-refresh
 * doesn't choke on mixing component and non-component exports.
 *
 * Only staff users see this modal — customers hit a different
 * FEATURE_LOCKED message and are better served by the
 * BranchSelection redirect (Phase 3 step 6), since they can't
 * actually upgrade anyway.
 */

// Human-readable feature labels live in utils/featureLabels.js (shared
// with the platform pricing cards).

// ─── Host component — mount ONCE at app root ────────────────────────

export function UpgradePromptHost() {
    const [state, setState] = useState(null);

    useEffect(() => subscribeUpgradePrompt((payload) => setState(payload)), []);

    // Close on Escape key
    useEffect(() => {
        if (!state) return;
        const onKey = (e) => { if (e.key === 'Escape') setState(null); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [state]);

    if (!state) return null;

    const featureLabel = FEATURE_LABELS[state.feature] || state.feature || 'this feature';
    const currentPlan  = state.currentPlan || 'your current plan';
    const supportEmail = 'upgrade@bestodine.com';
    const mailtoHref =
        `mailto:${supportEmail}` +
        `?subject=${encodeURIComponent(`Plan upgrade request — ${featureLabel}`)}` +
        `&body=${encodeURIComponent(
            `Hi BestoDine team,\n\n` +
            `We'd like to upgrade our subscription to unlock "${featureLabel}".\n\n` +
            `Current plan: ${currentPlan}\n\n` +
            `Please let us know the next steps.\n\nThanks`
        )}`;

    const close = () => setState(null);

    return (
        <div
            className="fixed inset-0 z-9999 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={close}
        >
            <div
                className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 relative"
                onClick={(e) => e.stopPropagation()}
            >
                <button
                    type="button"
                    onClick={close}
                    className="absolute top-3 right-3 p-1 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition"
                    aria-label="Close"
                >
                    <X size={20} />
                </button>

                <div className="w-12 h-12 rounded-full bg-amber-100 flex items-center justify-center mb-4">
                    <Lock size={22} className="text-amber-600" />
                </div>

                <h2 className="text-xl font-bold text-slate-800 mb-2">
                    {featureLabel} is locked
                </h2>
                <p className="text-sm text-slate-600 leading-relaxed mb-5">
                    This feature isn't included in <span className="font-semibold text-slate-800">{currentPlan}</span>.
                    Upgrade your subscription to unlock it for your restaurant.
                </p>

                <div className="bg-slate-50 border border-slate-100 rounded-xl p-4 mb-5">
                    <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                        Want to upgrade?
                    </div>
                    <p className="text-sm text-slate-600">
                        Contact our team and we'll help you pick the right plan for your restaurant.
                    </p>
                </div>

                <div className="flex gap-3">
                    <button
                        type="button"
                        onClick={close}
                        className="flex-1 py-2.5 px-4 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-sm transition"
                    >
                        Not now
                    </button>
                    <a
                        href={mailtoHref}
                        onClick={close}
                        className="flex-1 py-2.5 px-4 rounded-xl bg-orange-500 hover:bg-orange-600 text-white font-semibold text-sm transition inline-flex items-center justify-center gap-2"
                    >
                        <Mail size={16} />
                        Request upgrade
                    </a>
                </div>
            </div>
        </div>
    );
}

export default UpgradePromptHost;
