// State + timers behind ProvisioningProgress (kept out of the component
// file so Fast Refresh sees a components-only module there).
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

/** Default step labels (i18n keys under platform.provisioning). */
export function useProvisioningSteps() {
    const { t } = useTranslation();
    return [
        t('platform.provisioning.step_restaurant', 'Creating your restaurant'),
        t('platform.provisioning.step_menu', 'Preparing your menu and tables'),
        t('platform.provisioning.step_signin', 'Signing you in'),
    ];
}

// Delay between ticks. Short on purpose: the account already exists when
// the screen appears; the list just gives the redirect a visible shape.
export const PROVISIONING_TICK_MS = 250;

/**
 * Drives ProvisioningProgress for a page: `start(name, stepCount, finish)`
 * shows the screen, ticks `done` every PROVISIONING_TICK_MS and calls
 * `finish()` (sign in + navigate) once every step is done. Timers are
 * cleared on unmount so a navigate-away never fires a stale callback.
 */
export function useProvisioning() {
    const [state, setState] = useState(null); // { name, done } | null
    const timers = useRef([]);
    useEffect(() => () => { timers.current.forEach(clearTimeout); timers.current = []; }, []);
    const start = useCallback((name, stepCount, finish) => {
        timers.current.forEach(clearTimeout);
        timers.current = [];
        setState({ name, done: 1 });
        for (let i = 2; i <= stepCount; i++) {
            timers.current.push(setTimeout(() => setState(s => (s ? { ...s, done: i } : s)), PROVISIONING_TICK_MS * (i - 1)));
        }
        timers.current.push(setTimeout(() => { finish?.(); }, PROVISIONING_TICK_MS * stepCount));
    }, []);
    const reset = useCallback(() => {
        timers.current.forEach(clearTimeout);
        timers.current = [];
        setState(null);
    }, []);
    return { provisioning: state, start, reset };
}
