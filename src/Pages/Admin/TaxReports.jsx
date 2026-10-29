import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import api from '../../utils/api'
import { parseRecipients } from '../../utils/taxReports'
import { useAdminBranch } from '../../Context/AdminBranchContext'

// GST report viewer + download, Tally export and emailed report schedules.
// Export aids only: not a GST return and not a filing tool.

const DISCLAIMER = 'Export aid only. These are not GST returns and this is not a filing tool. Please have your CA check the numbers before filing. E-invoice (IRN) is not covered.'

const todayYmd = () => new Date().toISOString().slice(0, 10)
const monthStartYmd = () => `${todayYmd().slice(0, 7)}-01`
const money = (n) => Number(n || 0).toFixed(2)

const TYPE_LABELS = { 'daily-sales': 'Sales summary', 'gst-summary': 'GST summary' }
const FREQ_LABELS = { daily: 'Every day (yesterday)', weekly: 'Every Monday (last week)', monthly: 'On the 1st (last month)' }

async function downloadFile(path, params, filename) {
    const res = await api.get(path, { params, responseType: 'blob' })
    const url = URL.createObjectURL(res.data)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
}

const input = 'border border-gray-300 rounded-lg px-3 py-2 text-[13px] bg-white'
const btn = 'px-3 py-2 rounded-lg text-[13px] font-semibold border border-gray-300 bg-white hover:bg-gray-50 disabled:opacity-50'
const btnPrimary = 'px-3 py-2 rounded-lg text-[13px] font-semibold bg-[#1A181B] text-white disabled:opacity-50'

function Table({ head, rows, testId }) {
    return (
        <div className="overflow-x-auto border border-gray-200 rounded-xl bg-white" data-testid={testId}>
            <table className="min-w-full text-[12px]">
                <thead className="bg-gray-50 text-left text-gray-600">
                    <tr>{head.map((h) => <th key={h} className="px-3 py-2 font-semibold whitespace-nowrap">{h}</th>)}</tr>
                </thead>
                <tbody>
                    {rows.length === 0 && <tr><td className="px-3 py-3 text-gray-400" colSpan={head.length}>No data</td></tr>}
                    {rows.map((r, i) => (
                        <tr key={i} className="border-t border-gray-100">
                            {r.map((c, j) => <td key={j} className="px-3 py-2 whitespace-nowrap tabular-nums">{c}</td>)}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    )
}

function GstSection({ from, to, branchParams }) {
    const params = { from, to, ...branchParams }
    const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
        queryKey: ['gst-summary', params],
        queryFn: async () => (await api.get('/reports/gst/summary', { params })).data.report,
        enabled: false,
    })
    const [busy, setBusy] = useState('')
    const get = async (format) => {
        setBusy(format)
        try {
            await downloadFile('/reports/gst/summary', { ...params, format }, `gst-summary-${from}_to_${to}.${format}`)
        } catch (e) {
            toast.error(e?.response?.data?.message || 'Download failed')
        } finally { setBusy('') }
    }
    const t = data?.totals
    return (
        <section className="mb-8" data-testid="gst-section">
            <h2 className="text-[16px] font-bold text-[#1A181B] mb-2">GST report</h2>
            <div className="flex flex-wrap gap-2 mb-3">
                <button type="button" className={btnPrimary} onClick={() => refetch()} disabled={isFetching}>
                    {isFetching ? 'Loading...' : 'View report'}
                </button>
                <button type="button" className={btn} onClick={() => get('csv')} disabled={!!busy}>Download CSV</button>
                <button type="button" className={btn} onClick={() => get('xlsx')} disabled={!!busy}>Download Excel</button>
            </div>
            {isLoading && <p>Loading...</p>}
            {isError && <p className="text-red-600 text-[13px]" role="alert">{error?.response?.data?.message || 'Could not load the report'}</p>}
            {data && (
                <div className="space-y-4">
                    <div className={`rounded-xl px-3 py-2 text-[13px] border ${data.selfCheck.ok ? 'bg-green-50 border-green-200 text-green-800' : 'bg-amber-50 border-amber-200 text-amber-900'}`} data-testid="gst-selfcheck">
                        <b>{data.selfCheck.ok ? 'Self-check OK.' : 'Please review.'}</b> {data.selfCheck.note}
                        {data.meta.truncated && ' The range had too many bills; only the first 50,000 are included.'}
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-[13px]">
                        {[['Bills', t.invoiceCount], ['Taxable value', money(t.taxable)], ['CGST', money(t.cgst)], ['SGST', money(t.sgst)], ['IGST', money(t.igst)], ['Total tax', money(t.tax)], ['Service/other charges', money(t.serviceCharge + t.otherCharges)], ['Invoice total', money(t.invoiceTotal)]].map(([k, v]) => (
                            <div key={k} className="bg-white border border-gray-200 rounded-xl px-3 py-2"><div className="text-gray-500 text-[11px]">{k}</div><div className="font-bold tabular-nums">{v}</div></div>
                        ))}
                    </div>
                    <h3 className="font-semibold text-[13px]">Tax by rate</h3>
                    <Table testId="gst-by-rate" head={['Rate %', 'Bills', 'Taxable value', 'CGST', 'SGST', 'IGST', 'Total tax']}
                        rows={data.byRate.map((r) => [r.rate, r.invoices, money(r.taxable), money(r.cgst), money(r.sgst), money(r.igst), money(r.tax)])} />
                    <h3 className="font-semibold text-[13px]">HSN summary (GSTR-1 table 12 layout)</h3>
                    <Table testId="gst-hsn" head={['HSN', 'Description', 'UQC', 'Quantity', 'Total value', 'Taxable value', 'IGST', 'CGST', 'SGST', 'Rate %']}
                        rows={data.hsn.map((h) => [h.hsn, h.description, h.uqc, h.qty, money(h.totalValue), money(h.taxable), money(h.igst), money(h.cgst), money(h.sgst), h.rate])} />
                    <h3 className="font-semibold text-[13px]">Invoice register</h3>
                    <Table testId="gst-invoices" head={['Bill no', 'Order', 'Date', 'Customer GSTIN', 'Taxable value', 'Tax', 'Total', 'Adds up']}
                        rows={data.invoices.slice(0, 200).map((i) => [i.billNo || '-', i.orderId, String(i.date || '').slice(0, 10), i.customerGstin || '-', money(i.taxable), money(i.tax), money(i.total), i.reconciled ? 'yes' : 'NO'])} />
                    {data.invoices.length > 200 && <p className="text-[12px] text-gray-500">Showing the first 200 bills. Download the CSV or Excel for the full register.</p>}
                    <h3 className="font-semibold text-[13px]">Cancelled and refunded (shown separately, not in the tables above)</h3>
                    <Table testId="gst-excluded" head={['Type', 'Bill no', 'Order', 'Total', 'Refunded']}
                        rows={[
                            ...data.cancelled.map((r) => ['Cancelled', r.billNo || '-', r.orderId, money(r.total), money(r.refunded)]),
                            ...data.refunded.map((r) => ['Fully refunded', r.billNo || '-', r.orderId, money(r.total), money(r.refunded)]),
                            ...data.partialRefunds.map((r) => ['Partly refunded (included)', r.billNo || '-', r.orderId, money(r.total), money(r.refunded)]),
                        ]} />
                </div>
            )}
        </section>
    )
}

function TallySection({ from, to, branchParams }) {
    const [busy, setBusy] = useState(false)
    const go = async () => {
        setBusy(true)
        try {
            await downloadFile('/reports/tally/export', { from, to, ...branchParams }, `tally-sales-${from}_to_${to}.xml`)
        } catch (e) {
            toast.error(e?.response?.data?.message || 'Download failed')
        } finally { setBusy(false) }
    }
    const qc = useQueryClient()
    const cfg = useQuery({ queryKey: ['tax-export-config'], queryFn: async () => (await api.get('/reports/gst/config')).data })
    const [form, setForm] = useState(null)
    const save = useMutation({
        mutationFn: async (body) => (await api.put('/reports/gst/config', body)).data,
        onSuccess: () => { toast.success('Saved'); qc.invalidateQueries({ queryKey: ['tax-export-config'] }) },
        onError: (e) => toast.error(e?.response?.data?.message || 'Could not save'),
    })
    const c = cfg.data?.config
    const defaults = cfg.data?.ledgerDefaults || {}
    const f = form || (c ? { defaultHsn: c.defaultHsn || '', partyMode: c.partyMode || 'cash', ledgers: c.ledgers || {} } : null)
    const LEDGER_FIELDS = [['sales', 'Sales'], ['outputCgst', 'Output CGST'], ['outputSgst', 'Output SGST'], ['serviceCharge', 'Service charge'], ['cash', 'Cash receipts'], ['upi', 'UPI receipts'], ['card', 'Card receipts']]
    return (
        <section className="mb-8" data-testid="tally-section">
            <h2 className="text-[16px] font-bold text-[#1A181B] mb-2">Tally export</h2>
            <p className="text-[13px] text-gray-500 mb-2">One Sales voucher per paid bill, as Tally Prime import XML. The ledgers below must exist in Tally.</p>
            <button type="button" className={btnPrimary} onClick={go} disabled={busy}>{busy ? 'Preparing...' : 'Download Tally XML'}</button>
            {f && (
                <div className="mt-4 bg-white border border-gray-200 rounded-xl p-3" data-testid="tax-config">
                    <h3 className="font-semibold text-[13px] mb-2">Tax export settings</h3>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-[13px]">
                        <label className="flex flex-col gap-1">Default HSN/SAC (restaurant service)
                            <input aria-label="Default HSN/SAC" className={input} value={f.defaultHsn} onChange={(e) => setForm({ ...f, defaultHsn: e.target.value })} placeholder="996331" />
                        </label>
                        <label className="flex flex-col gap-1">Party ledger
                            <select aria-label="Party ledger" className={input} value={f.partyMode} onChange={(e) => setForm({ ...f, partyMode: e.target.value })}>
                                <option value="cash">Cash</option>
                                <option value="debtors">Sundry Debtors</option>
                            </select>
                        </label>
                        {LEDGER_FIELDS.map(([k, label]) => (
                            <label key={k} className="flex flex-col gap-1">{label} ledger
                                <input aria-label={`${label} ledger`} className={input} value={f.ledgers[k] || ''} placeholder={defaults[k] || ''}
                                    onChange={(e) => setForm({ ...f, ledgers: { ...f.ledgers, [k]: e.target.value } })} />
                            </label>
                        ))}
                    </div>
                    <button type="button" className={`${btnPrimary} mt-3`} disabled={save.isPending}
                        onClick={() => save.mutate({ defaultHsn: f.defaultHsn, partyMode: f.partyMode, ledgers: f.ledgers })}>Save settings</button>
                </div>
            )}
        </section>
    )
}

function SchedulesSection() {
    const qc = useQueryClient()
    const { data, isLoading } = useQuery({ queryKey: ['report-schedules'], queryFn: async () => (await api.get('/reports/schedules')).data })
    const [form, setForm] = useState({ type: 'gst-summary', frequency: 'monthly', hour: 8, recipients: '' })
    const refresh = () => qc.invalidateQueries({ queryKey: ['report-schedules'] })
    const onError = (e) => toast.error(e?.response?.data?.message || 'Something went wrong')
    const create = useMutation({
        mutationFn: async () => (await api.post('/reports/schedules', { ...form, hour: Number(form.hour), recipients: parseRecipients(form.recipients) })).data,
        onSuccess: () => { toast.success('Schedule added'); setForm((f) => ({ ...f, recipients: '' })); refresh() },
        onError,
    })
    const toggle = useMutation({
        mutationFn: async (s) => (await api.patch(`/reports/schedules/${s._id}`, { enabled: !s.enabled })).data,
        onSuccess: refresh, onError,
    })
    const remove = useMutation({
        mutationFn: async (s) => (await api.delete(`/reports/schedules/${s._id}`)).data,
        onSuccess: refresh, onError,
    })
    const schedules = data?.schedules || []
    return (
        <section className="mb-8" data-testid="schedules-section">
            <h2 className="text-[16px] font-bold text-[#1A181B] mb-2">Emailed reports</h2>
            <p className="text-[13px] text-gray-500 mb-2">Get a CSV by email on a schedule (for example, GST summary to your CA each month). Each period is sent once.</p>
            <div className="bg-white border border-gray-200 rounded-xl p-3 mb-3 grid grid-cols-1 md:grid-cols-5 gap-3 text-[13px] items-end">
                <label className="flex flex-col gap-1">Report
                    <select aria-label="Report type" className={input} value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                        {Object.entries(TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                </label>
                <label className="flex flex-col gap-1">How often
                    <select aria-label="Frequency" className={input} value={form.frequency} onChange={(e) => setForm({ ...form, frequency: e.target.value })}>
                        {Object.entries(FREQ_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                </label>
                <label className="flex flex-col gap-1">After hour (0-23)
                    <input aria-label="Hour" type="number" min="0" max="23" className={input} value={form.hour} onChange={(e) => setForm({ ...form, hour: e.target.value })} />
                </label>
                <label className="flex flex-col gap-1 md:col-span-1">Send to (up to 5 emails)
                    <input aria-label="Recipients" className={input} value={form.recipients} onChange={(e) => setForm({ ...form, recipients: e.target.value })} placeholder="ca@firm.com, owner@cafe.com" />
                </label>
                <button type="button" className={btnPrimary} disabled={create.isPending} onClick={() => create.mutate()}>Add schedule</button>
            </div>
            {isLoading && <p>Loading...</p>}
            <div className="space-y-2" data-testid="schedule-list">
                {!isLoading && schedules.length === 0 && <p className="text-[13px] text-gray-400">No schedules yet.</p>}
                {schedules.map((s) => (
                    <div key={s._id} className="bg-white border border-gray-200 rounded-xl px-3 py-2 flex flex-wrap items-center gap-3 text-[13px]" data-testid="schedule-row">
                        <div className="flex-1 min-w-[200px]">
                            <div className="font-semibold">{TYPE_LABELS[s.type] || s.type} - {FREQ_LABELS[s.frequency] || s.frequency}, after {s.hour}:00</div>
                            <div className="text-gray-500">{s.recipients.join(', ')}</div>
                            {s.lastError && <div className="text-amber-700 text-[12px]">Last problem: {s.lastError}</div>}
                        </div>
                        <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${s.enabled ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'}`}>{s.enabled ? 'On' : 'Off'}</span>
                        <button type="button" className={btn} onClick={() => toggle.mutate(s)}>{s.enabled ? 'Disable' : 'Enable'}</button>
                        <button type="button" className={btn} onClick={() => remove.mutate(s)}>Delete</button>
                    </div>
                ))}
            </div>
        </section>
    )
}

export default function TaxReports() {
    const [from, setFrom] = useState(monthStartYmd())
    const [to, setTo] = useState(todayYmd())
    const { selectedBranchId } = useAdminBranch() || {}
    const branchParams = selectedBranchId ? { branch: selectedBranchId } : {}
    return (
        <div className="max-w-[1200px] mx-auto px-4 md:px-6 py-6 font-manrope" data-testid="tax-reports-page">
            <h1 className="text-[22px] font-bold text-[#1A181B]">GST and Tally reports</h1>
            <p className="text-[12px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 my-3" data-testid="tax-disclaimer">{DISCLAIMER}</p>
            <div className="flex flex-wrap gap-3 mb-5 text-[13px] items-end">
                <label className="flex flex-col gap-1">From
                    <input aria-label="From" type="date" className={input} value={from} onChange={(e) => setFrom(e.target.value)} />
                </label>
                <label className="flex flex-col gap-1">To
                    <input aria-label="To" type="date" className={input} value={to} onChange={(e) => setTo(e.target.value)} />
                </label>
            </div>
            <GstSection from={from} to={to} branchParams={branchParams} />
            <TallySection from={from} to={to} branchParams={branchParams} />
            <SchedulesSection />
        </div>
    )
}
