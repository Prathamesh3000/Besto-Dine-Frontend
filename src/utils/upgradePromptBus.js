/**
 * Tiny pub-sub bridge for the UpgradePrompt modal.
 *
 * Lives in utils/ (not Components/) because react-refresh breaks
 * hot-module reloading when a file exports both a React component
 * and a plain function — the two need to be in separate files.
 *
 * One subscriber at a time. The host component (UpgradePromptHost)
 * registers itself on mount and unregisters on unmount. Any module
 * (most importantly the axios interceptor in utils/api.js) can call
 * openUpgradePrompt({ feature, currentPlan, message }) to pop the
 * modal from anywhere in the app without prop drilling.
 */

let subscriber = null;

export function subscribeUpgradePrompt(fn) {
    subscriber = fn;
    return () => {
        if (subscriber === fn) subscriber = null;
    };
}

export function openUpgradePrompt(payload) {
    if (subscriber) subscriber(payload);
}
