import { useEffect, useState } from 'react';

/**
 * Returns `value` after it has stopped changing for `delay` ms. Used by
 * the platform restaurant search and the signup web-address check so a
 * request goes out once per pause in typing, not once per keystroke.
 */
export default function useDebouncedValue(value, delay = 350) {
    const [debounced, setDebounced] = useState(value);
    useEffect(() => {
        const t = setTimeout(() => setDebounced(value), delay);
        return () => clearTimeout(t);
    }, [value, delay]);
    return debounced;
}
