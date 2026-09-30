// Per-device customer favorites (local-only persistence).
//
// Storage key is kept as "customer_bookmarks" for back-compat with the
// data already saved on users' devices — the user-facing name is now
// "Favorites" but the key stays the same to avoid wiping their list.

import { useEffect, useState, useCallback } from "react";

const FAVORITES_KEY = "customer_bookmarks";
const EVENT_NAME = "favorites:change";

function readSet() {
  try {
    const raw = localStorage.getItem(FAVORITES_KEY);
    return new Set(raw ? JSON.parse(raw) : []);
  } catch {
    return new Set();
  }
}

function writeSet(set) {
  try {
    localStorage.setItem(FAVORITES_KEY, JSON.stringify([...set]));
  } catch {
    /* quota */
  }
  // Broadcast within the same tab — the native `storage` event only
  // fires across tabs, so without this each card on the same page
  // would render its own stale snapshot until remount.
  try {
    window.dispatchEvent(new Event(EVENT_NAME));
  } catch {
    /* SSR / no window */
  }
}

export function isFavorite(id) {
  return Boolean(id) && readSet().has(id);
}

export function toggleFavorite(id) {
  if (!id) return false;
  const next = readSet();
  const wasFav = next.has(id);
  if (wasFav) next.delete(id);
  else next.add(id);
  writeSet(next);
  return !wasFav;
}

export function removeFavorite(id) {
  if (!id) return;
  const next = readSet();
  if (next.delete(id)) writeSet(next);
}

// React hook — components rerender when the set changes from anywhere
// (this tab via toggleFavorite, or another tab via storage event).
export function useFavorites() {
  const [favs, setFavs] = useState(readSet);

  useEffect(() => {
    const sync = () => setFavs(readSet());
    const onStorage = (e) => {
      if (e.key === FAVORITES_KEY) sync();
    };
    window.addEventListener(EVENT_NAME, sync);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(EVENT_NAME, sync);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const has = useCallback((id) => Boolean(id) && favs.has(id), [favs]);
  const toggle = useCallback((id) => toggleFavorite(id), []);
  const remove = useCallback((id) => removeFavorite(id), []);

  return { favorites: favs, has, toggle, remove };
}
