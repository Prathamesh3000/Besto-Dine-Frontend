// ─── Standalone localStorage helpers ─────────────────────────────────────────

export function getTableNumber() {
  try {
    const urlParams = new URLSearchParams(window.location.search);
    const table = urlParams.get("table");
    if (table) {
      localStorage.setItem("tableNumber", table);
      return table;
    }
    // Read from dineInTable (set by QR scan) first, then fall back to tableNumber
    const dineInTable = localStorage.getItem("dineInTable");
    if (dineInTable) {
      const parsed = JSON.parse(dineInTable);
      if (parsed.name) return parsed.name;
    }
    return localStorage.getItem("tableNumber") || null;
  } catch {
    return null;
  }
}

export function getHealthPrefs() {
  try {
    const saved = localStorage.getItem("healthPreferences");
    if (saved) {
      const prefs = JSON.parse(saved);
      return { healthMode: prefs.healthMode ?? false };
    }
  } catch { /* ignore */ }
  return { healthMode: false };
}
