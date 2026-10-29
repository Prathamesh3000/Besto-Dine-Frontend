// Small helpers for the Tax Reports page (Pages/Admin/TaxReports.jsx).
export function parseRecipients(text) {
    return String(text || '').split(/[\s,;]+/).map((s) => s.trim()).filter(Boolean)
}
