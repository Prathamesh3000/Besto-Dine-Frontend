/**
 * Structured Excel (.xlsx) exporter for the Inventory reports.
 *
 * Produces a single-sheet workbook with:
 *   - a title row,
 *   - optional metadata rows (period, generated date, …),
 *   - a header row,
 *   - data rows (numbers stay numbers so Excel can sum/filter),
 *   - an optional TOTAL row.
 *
 * Money columns get an Indian-rupee number format applied at the cell
 * level so the figures render as ₹1,234.50 yet remain numeric.
 *
 * @param {Object}   opts
 * @param {string}   opts.filename   e.g. "stock-report.xlsx"
 * @param {string}   opts.sheetName  worksheet tab name
 * @param {string}   opts.title      bold title in row 1
 * @param {Array}    opts.meta       [{ label, value }] metadata lines
 * @param {Array}    opts.columns    [{ key, label, money?, numeric? }]
 * @param {Array}    opts.rows       array of row objects keyed by column.key
 * @param {Object?}  opts.totals     row object for the TOTAL line (optional)
 *
 * Async: the ~400 KB `xlsx` library is loaded on demand (first export)
 * instead of being bundled into every admin page. Callers should `await`
 * the returned promise so their success/error toast reflects the result.
 */
export async function exportReportToExcel({ filename, sheetName = 'Report', title, meta = [], columns, rows, totals = null }) {
    const XLSX = await import('xlsx')
    const MONEY_FMT = '"₹"#,##0.00'
    const aoa = []

    if (title) aoa.push([title])
    meta.forEach(m => aoa.push([m.label, m.value]))
    if (title || meta.length) aoa.push([])

    const headerRowIdx = aoa.length
    aoa.push(columns.map(c => c.label))

    const firstDataRow = aoa.length
    rows.forEach(r => aoa.push(columns.map(c => {
        const v = r[c.key]
        if (v === undefined || v === null || v === '') return (c.money || c.numeric) ? 0 : ''
        return v
    })))

    let totalRowIdx = -1
    if (totals) {
        aoa.push([])
        totalRowIdx = aoa.length
        aoa.push(columns.map((c, i) => {
            const v = totals[c.key]
            if (v !== undefined && v !== null) return v
            return i === 0 ? 'TOTAL' : ''
        }))
    }

    const ws = XLSX.utils.aoa_to_sheet(aoa)

    // Column widths — fit the longest of header / sample values.
    ws['!cols'] = columns.map(c => {
        let w = c.label.length + 2
        for (const r of rows) {
            const s = String(r[c.key] ?? '')
            if (s.length + 2 > w) w = s.length + 2
        }
        return { wch: Math.min(40, Math.max(10, w)) }
    })

    // Apply the rupee format to every money cell (data rows + total row).
    const lastBodyRow = firstDataRow + rows.length - 1
    columns.forEach((c, colIdx) => {
        if (!c.money) return
        const stampFmt = (rowIdx) => {
            const ref = XLSX.utils.encode_cell({ r: rowIdx, c: colIdx })
            if (ws[ref] && typeof ws[ref].v === 'number') ws[ref].z = MONEY_FMT
        }
        for (let r = firstDataRow; r <= lastBodyRow; r++) stampFmt(r)
        if (totalRowIdx >= 0) stampFmt(totalRowIdx)
    })

    // Bold the header row + title.
    const boldRefs = []
    columns.forEach((_, colIdx) => boldRefs.push(XLSX.utils.encode_cell({ r: headerRowIdx, c: colIdx })))
    if (title) boldRefs.push('A1')
    if (totalRowIdx >= 0) columns.forEach((_, colIdx) => boldRefs.push(XLSX.utils.encode_cell({ r: totalRowIdx, c: colIdx })))
    boldRefs.forEach(ref => { if (ws[ref]) ws[ref].s = { font: { bold: true } } })

    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31))
    XLSX.writeFile(wb, filename)
}

/** Convenience: today's date as yyyy-mm-dd for filenames / meta. */
export function reportStamp(now = new Date()) {
    const p = (n) => String(n).padStart(2, '0')
    return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`
}
