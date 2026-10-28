// Pure helpers that turn the reviewed "Scan my menu" rows into the CSV the
// existing POST /menu/import endpoint understands.
//
// Header (read by name, case-insensitive): name,description,category,basePrice,vegType,sizes
// `sizes` shorthand: "Half:120:1|Full:220:1" (name:price:qty joined by "|").

export const CSV_HEADER = ['name', 'description', 'category', 'basePrice', 'vegType', 'sizes']

// Strip characters a spreadsheet would treat as a formula start. We cannot
// prefix a quote (the importer would store it), so leading = + @ (and tab /
// CR, which some spreadsheets also honour) are removed. A leading "-" is only
// removed when it is not followed by a digit, so "-5 combo" style text that
// is really a number is left alone.
export function sanitizeCell(value) {
    let s = value == null ? '' : String(value)
    s = s.replace(/[\r\n\t]+/g, ' ').trim()
    for (;;) {
        const before = s
        s = s.replace(/^[=+@\s]+/, '')
        if (/^-(?!\d)/.test(s)) s = s.replace(/^-+\s*/, '')
        if (s === before) break
    }
    return s.trim()
}

// Sanitised + RFC-4180 quoted field (always quoted, inner quotes doubled).
export function csvSafe(value) {
    return `"${sanitizeCell(value).replace(/"/g, '""')}"`
}

const priceNumber = (v) => {
    if (v === null || v === undefined || v === '') return null
    const n = typeof v === 'number' ? v : Number(v)
    return Number.isFinite(n) ? n : null
}

export function sizesToShorthand(sizes) {
    if (!Array.isArray(sizes)) return ''
    return sizes
        .map((s) => {
            const name = String(s?.name ?? '').replace(/[:|]/g, ' ').trim()
            const price = priceNumber(s?.price)
            if (!name || price === null || price < 0) return null
            return `${sanitizeCell(name)}:${price}:1`
        })
        .filter(Boolean)
        .join('|')
}

// A row can be imported when it has a name, a category and a positive numeric price.
export function rowIsValid(row) {
    if (!row) return false
    if (!sanitizeCell(row.name)) return false
    if (!sanitizeCell(row.category)) return false
    const p = priceNumber(row.basePrice)
    return p !== null && p > 0
}

// Rows that will actually be written: kept (keep !== false) and valid.
export function exportableRows(rows) {
    return (rows || []).filter((r) => r && r.keep !== false && rowIsValid(r))
}

export function buildMenuCsv(rows) {
    const lines = [CSV_HEADER.join(',')]
    for (const r of exportableRows(rows)) {
        const name = sanitizeCell(r.name)
        const description = sanitizeCell(r.description) || name
        const vegType = r.vegType === 'non-veg' ? 'non-veg' : 'veg'
        lines.push([
            csvSafe(name),
            csvSafe(description),
            csvSafe(r.category),
            csvSafe(String(priceNumber(r.basePrice))),
            csvSafe(vegType),
            csvSafe(sizesToShorthand(r.sizes)),
        ].join(','))
    }
    return lines.join('\r\n') + '\r\n'
}
