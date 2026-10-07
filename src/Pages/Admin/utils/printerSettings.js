// Pure helpers for Admin → Settings → Printers (components/PrinterSettings.jsx).
// Kept out of the component file so fast refresh keeps working and the
// payload shape can be unit-tested on its own.

export const MAX_PRINTERS = 10

export const STATIONS = [
    { value: 'kitchen', label: 'Kitchen (KOT)' },
    { value: 'bar', label: 'Bar (KOT)' },
    { value: 'counter', label: 'Counter (bills)' },
]

export const newPrinter = () => ({
    id: '', name: '', station: 'kitchen', interface: 'lan', host: '', port: 9100,
    devicePath: '', paperWidth: '80', characterSet: 'PC437_USA', copies: 1, enabled: true,
})

/** Form state from GET /settings `printers` (missing on older docs). */
export function normalizeInitial(initial) {
    const src = initial && typeof initial === 'object' ? initial : {}
    const ap = src.autoPrint || {}
    return {
        enabled: !!src.enabled,
        autoPrint: {
            kotOnCreate: ap.kotOnCreate !== false,
            kotOnAppend: ap.kotOnAppend !== false,
            billOnPaid: !!ap.billOnPaid,
        },
        list: (Array.isArray(src.list) ? src.list : []).map((p) => ({ ...newPrinter(), ...p })),
    }
}

/** Payload for PATCH /settings/printers — numbers coerced, agent block never sent. */
export function toPayload(form) {
    return {
        enabled: !!form.enabled,
        autoPrint: { ...form.autoPrint },
        list: form.list.map((p) => ({
            ...(p.id ? { id: p.id } : {}),
            name: String(p.name || '').trim(),
            station: p.station,
            interface: p.interface,
            host: p.interface === 'lan' ? String(p.host || '').trim() : '',
            port: Number(p.port) || 9100,
            devicePath: p.interface === 'usb' ? String(p.devicePath || '').trim() : '',
            paperWidth: p.paperWidth === '58' ? '58' : '80',
            characterSet: p.characterSet || 'PC437_USA',
            copies: Math.min(3, Math.max(1, Number(p.copies) || 1)),
            enabled: p.enabled !== false,
        })),
    }
}

/** First client-side problem with the form, or null. */
export function validatePrinters(form) {
    for (const [i, p] of form.list.entries()) {
        const n = `Printer ${i + 1}`
        if (!String(p.name || '').trim()) return `${n}: name is required`
        if (p.interface === 'lan' && !String(p.host || '').trim()) return `${n}: LAN printers need an IP address or hostname`
        if (p.interface === 'usb' && !String(p.devicePath || '').trim()) return `${n}: USB printers need a device path (e.g. \\\\localhost\\KOT)`
    }
    return null
}
