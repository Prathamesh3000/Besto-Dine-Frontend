import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { useAuth } from '../../Context/AuthContext'
import { FeatureLockedScreen } from '../../Components/RequireFeature'
import { payrollAPI, apiMessage } from '../../utils/payrollApi'

const input = 'border border-gray-300 rounded-lg px-3 py-2 text-[13px] bg-white'
const btn = 'px-3 py-2 rounded-lg text-[13px] font-semibold disabled:opacity-50'
const primary = `${btn} bg-[#FE8301] text-white`
const ghost = `${btn} border border-gray-300`
const money = (n) => (Number(n) || 0).toFixed(2)

function today() { return new Date().toISOString().slice(0, 10) }
function monthStart() { return `${today().slice(0, 8)}01` }

export function ProfilesTab() {
    const qc = useQueryClient()
    const { data, isLoading, isError, error } = useQuery({
        queryKey: ['admin', 'payroll', 'profiles'],
        queryFn: async () => (await payrollAPI.listProfiles()).data.staff || [],
    })
    const [edit, setEdit] = useState(null)   // { staffId, name, form }
    const save = useMutation({
        mutationFn: () => payrollAPI.saveProfile(edit.staffId, {
            payType: edit.form.payType,
            baseRate: Number(edit.form.baseRate),
            overtimeRate: edit.form.overtimeRate === '' ? null : Number(edit.form.overtimeRate),
            overtimeThresholdHours: Number(edit.form.overtimeThresholdHours) || 8,
            active: edit.form.active,
        }),
        onSuccess: () => { toast.success('Pay profile saved'); setEdit(null); qc.invalidateQueries({ queryKey: ['admin', 'payroll', 'profiles'] }) },
        onError: (e) => toast.error(apiMessage(e)),
    })

    const open = (row) => {
        const p = row.profile
        setEdit({
            staffId: row.staff._id, name: row.staff.name,
            form: {
                payType: p?.payType || 'monthly', baseRate: p?.baseRate ?? '', overtimeRate: p?.overtimeRate ?? '',
                overtimeThresholdHours: p?.overtimeThresholdHours ?? 8, active: p ? p.active : true,
            },
        })
    }
    const set = (k) => (e) => setEdit((s) => ({ ...s, form: { ...s.form, [k]: k === 'active' ? e.target.checked : e.target.value } }))

    if (isLoading) return <p className="text-[13px] text-gray-500">Loading pay profiles...</p>
    if (isError) return <p role="alert" className="text-[13px] text-red-700">{apiMessage(error, 'Failed to load pay profiles')}</p>

    return (
        <div>
            <table className="w-full text-[13px] bg-white rounded-lg border border-gray-200">
                <thead><tr className="text-left text-gray-500"><th className="p-2">Staff</th><th>Role</th><th>Pay type</th><th>Rate</th><th>Overtime</th><th></th></tr></thead>
                <tbody>
                    {data.length === 0 && <tr><td colSpan={6} className="p-3 text-gray-500">No staff found.</td></tr>}
                    {data.map((row) => (
                        <tr key={row.staff._id} className="border-t border-gray-100">
                            <td className="p-2">{row.staff.name}</td>
                            <td>{row.staff.role}</td>
                            <td>{row.profile ? `${row.profile.payType}${row.profile.active ? '' : ' (inactive)'}` : 'Not set'}</td>
                            <td>{row.profile ? money(row.profile.baseRate) : '-'}</td>
                            <td>{row.profile?.overtimeRate != null ? money(row.profile.overtimeRate) : '-'}</td>
                            <td><button type="button" className={ghost} onClick={() => open(row)} aria-label={`Edit pay for ${row.staff.name}`}>Edit</button></td>
                        </tr>
                    ))}
                </tbody>
            </table>

            {edit && (
                <div className="mt-4 p-4 bg-white border border-gray-200 rounded-lg flex flex-wrap items-end gap-3" role="form" aria-label="Pay profile form">
                    <strong className="w-full text-[14px]">Pay settings: {edit.name}</strong>
                    <label className="text-[12px] flex flex-col gap-1">Pay type
                        <select className={input} value={edit.form.payType} onChange={set('payType')} aria-label="Pay type">
                            <option value="monthly">Monthly salary</option>
                            <option value="daily">Daily wage</option>
                            <option value="hourly">Hourly</option>
                        </select>
                    </label>
                    <label className="text-[12px] flex flex-col gap-1">Base rate
                        <input className={input} type="number" min="0" value={edit.form.baseRate} onChange={set('baseRate')} aria-label="Base rate" />
                    </label>
                    <label className="text-[12px] flex flex-col gap-1">Overtime rate / hour (optional)
                        <input className={input} type="number" min="0" value={edit.form.overtimeRate} onChange={set('overtimeRate')} aria-label="Overtime rate" />
                    </label>
                    <label className="text-[12px] flex flex-col gap-1">Overtime after (hours/day)
                        <input className={input} type="number" min="1" max="24" value={edit.form.overtimeThresholdHours} onChange={set('overtimeThresholdHours')} aria-label="Overtime threshold" />
                    </label>
                    <label className="text-[12px] flex items-center gap-2">
                        <input type="checkbox" checked={edit.form.active} onChange={set('active')} aria-label="Active" /> Active
                    </label>
                    <button type="button" className={primary} disabled={save.isPending || edit.form.baseRate === ''} onClick={() => save.mutate()}>Save</button>
                    <button type="button" className={ghost} onClick={() => setEdit(null)}>Cancel</button>
                </div>
            )}
        </div>
    )
}

export function RunDetail({ runId, onBack }) {
    const qc = useQueryClient()
    const key = ['admin', 'payroll', 'run', runId]
    const { data: run, isLoading, isError, error } = useQuery({
        queryKey: key,
        queryFn: async () => (await payrollAPI.getRun(runId)).data.run,
    })
    const [adj, setAdj] = useState({})          // staffId -> { advances, deductions }
    const [method, setMethod] = useState('cash')
    const [slip, setSlip] = useState(null)
    const refresh = () => { qc.invalidateQueries({ queryKey: key }); qc.invalidateQueries({ queryKey: ['admin', 'payroll', 'runs'] }) }
    const fail = (e) => toast.error(apiMessage(e))

    const saveAdj = useMutation({
        mutationFn: () => payrollAPI.saveAdjustments(runId, Object.entries(adj).map(([staff, v]) => ({
            staff, advances: Number(v.advances) || 0, deductions: Number(v.deductions) || 0,
        }))),
        onSuccess: () => { toast.success('Adjustments saved'); setAdj({}); refresh() },
        onError: fail,
    })
    const finalize = useMutation({
        mutationFn: () => payrollAPI.finalize(runId),
        onSuccess: () => { toast.success('Run finalized'); refresh() },
        onError: fail,
    })
    const pay = useMutation({
        mutationFn: () => payrollAPI.pay(runId, { method }),
        onSuccess: (res) => { toast.success(res.data?.alreadyPaid ? 'Already paid' : 'Marked as paid'); refresh() },
        onError: fail,
    })

    const download = async () => {
        try {
            const res = await payrollAPI.exportCsv(runId)
            const url = URL.createObjectURL(res.data)
            const a = document.createElement('a')
            a.href = url; a.download = `payroll-${run.periodStart}-${run.periodEnd}.csv`
            document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url)
        } catch (e) { fail(e) }
    }
    const viewSlip = async (staffId) => {
        try { setSlip((await payrollAPI.getPayslip(runId, staffId)).data.payslip) } catch (e) { fail(e) }
    }

    if (isLoading) return <p className="text-[13px] text-gray-500">Loading run...</p>
    if (isError) return <p role="alert" className="text-[13px] text-red-700">{apiMessage(error, 'Failed to load run')}</p>

    const draft = run.status === 'draft'
    const cell = (l, f) => (adj[l.staff]?.[f] ?? l[f])
    const setCell = (l, f) => (e) => setAdj((a) => ({
        ...a, [l.staff]: { advances: l.advances, deductions: l.deductions, ...a[l.staff], [f]: e.target.value },
    }))

    return (
        <div data-testid="payroll-run-detail">
            <div className="flex flex-wrap items-center gap-3 mb-3">
                <button type="button" className={ghost} onClick={onBack}>Back</button>
                <h2 className="text-[16px] font-bold">{run.periodStart} to {run.periodEnd}</h2>
                <span className="text-[12px] px-2 py-1 rounded bg-gray-100" data-testid="run-status">{run.status}</span>
                <button type="button" className={`${ghost} ml-auto`} onClick={download}>Download CSV</button>
            </div>

            <table className="w-full text-[13px] bg-white rounded-lg border border-gray-200">
                <thead><tr className="text-left text-gray-500">
                    <th className="p-2">Staff</th><th>Days</th><th>Hours</th><th>OT hrs</th><th>Base</th><th>OT pay</th><th>Incentives</th>
                    <th>Tips paid (info)</th><th>Advances</th><th>Deductions</th><th>Net</th><th></th>
                </tr></thead>
                <tbody>
                    {run.lines.map((l) => (
                        <tr key={l.staff} className="border-t border-gray-100 align-top">
                            <td className="p-2">{l.staffName}
                                {(l.warnings || []).map((w) => <div key={w} className="text-[11px] text-amber-700">{w}</div>)}
                            </td>
                            <td>{l.daysPresent}</td><td>{l.hours}</td><td>{l.overtimeHours}</td>
                            <td>{money(l.basePay)}</td><td>{money(l.overtimePay)}</td><td>{money(l.incentives)}</td><td>{money(l.tipsPaidOut)}</td>
                            <td>{draft
                                ? <input className={`${input} w-24`} type="number" min="0" value={cell(l, 'advances')} onChange={setCell(l, 'advances')} aria-label={`Advances for ${l.staffName}`} />
                                : money(l.advances)}</td>
                            <td>{draft
                                ? <input className={`${input} w-24`} type="number" min="0" value={cell(l, 'deductions')} onChange={setCell(l, 'deductions')} aria-label={`Deductions for ${l.staffName}`} />
                                : money(l.deductions)}</td>
                            <td className="font-semibold">{money(l.netPay)}</td>
                            <td><button type="button" className={ghost} onClick={() => viewSlip(l.staff)} aria-label={`Payslip for ${l.staffName}`}>Payslip</button></td>
                        </tr>
                    ))}
                </tbody>
                <tfoot><tr className="border-t border-gray-300 font-semibold">
                    <td className="p-2">Total ({run.totals?.staffCount})</td><td></td><td></td><td></td>
                    <td>{money(run.totals?.basePay)}</td><td>{money(run.totals?.overtimePay)}</td><td>{money(run.totals?.incentives)}</td><td></td>
                    <td>{money(run.totals?.advances)}</td><td>{money(run.totals?.deductions)}</td><td data-testid="total-net">{money(run.totals?.netPay)}</td><td></td>
                </tr></tfoot>
            </table>
            <p className="text-[12px] text-gray-500 mt-2">Attendance and wallet payout only. No PF, ESI or TDS is calculated.</p>

            <div className="flex flex-wrap items-center gap-3 mt-4">
                {draft && (
                    <>
                        <button type="button" className={ghost} disabled={!Object.keys(adj).length || saveAdj.isPending} onClick={() => saveAdj.mutate()}>Save adjustments</button>
                        <button type="button" className={primary} disabled={finalize.isPending || Object.keys(adj).length > 0} onClick={() => finalize.mutate()}>Finalize</button>
                    </>
                )}
                {run.status === 'finalized' && (
                    <>
                        <label className="text-[12px] flex items-center gap-2">Pay via
                            <select className={input} value={method} onChange={(e) => setMethod(e.target.value)} aria-label="Payout method">
                                <option value="cash">Cash (record only)</option>
                                <option value="bank">Bank transfer (record only)</option>
                                <option value="wallet">Staff wallet (credits now)</option>
                            </select>
                        </label>
                        <button type="button" className={primary} disabled={pay.isPending} onClick={() => pay.mutate()}>Mark paid</button>
                    </>
                )}
                {run.status === 'paid' && <span className="text-[13px] text-green-700">Paid via {run.payoutMethod}</span>}
            </div>

            {slip && (
                <div className="mt-5 p-4 bg-white border border-gray-200 rounded-lg max-w-md" data-testid="payslip">
                    <div className="flex justify-between"><strong>Payslip: {slip.staff.name}</strong>
                        <button type="button" className="text-[12px] underline" onClick={() => setSlip(null)}>Close</button></div>
                    <p className="text-[12px] text-gray-500">{slip.periodStart} to {slip.periodEnd}</p>
                    <dl className="text-[13px] grid grid-cols-2 gap-1 mt-2">
                        <dt>Days present</dt><dd className="text-right">{slip.attendance.daysPresent}</dd>
                        <dt>Hours</dt><dd className="text-right">{slip.attendance.hours}</dd>
                        <dt>Base pay</dt><dd className="text-right">{money(slip.earnings.basePay)}</dd>
                        <dt>Overtime pay</dt><dd className="text-right">{money(slip.earnings.overtimePay)}</dd>
                        <dt>Incentives</dt><dd className="text-right">{money(slip.earnings.incentives)}</dd>
                        <dt>Advances</dt><dd className="text-right">{money(slip.deductions.advances)}</dd>
                        <dt>Deductions</dt><dd className="text-right">{money(slip.deductions.deductions)}</dd>
                        <dt className="font-bold">Net pay</dt><dd className="text-right font-bold">{money(slip.netPay)}</dd>
                    </dl>
                    <button type="button" className={`${ghost} mt-3`} onClick={() => window.print()}>Print</button>
                </div>
            )}
        </div>
    )
}

export function RunsTab() {
    const qc = useQueryClient()
    const [openId, setOpenId] = useState(null)
    const [form, setForm] = useState({ periodStart: monthStart(), periodEnd: today() })
    const { data: runs = [], isLoading, isError, error } = useQuery({
        queryKey: ['admin', 'payroll', 'runs'],
        queryFn: async () => (await payrollAPI.listRuns()).data.runs || [],
    })
    const create = useMutation({
        mutationFn: () => payrollAPI.createRun(form),
        onSuccess: (res) => {
            const skipped = res.data?.skipped || []
            toast.success(skipped.length ? `Draft created (${skipped.length} staff skipped)` : 'Draft created')
            qc.invalidateQueries({ queryKey: ['admin', 'payroll', 'runs'] })
            setOpenId(res.data.run._id)
        },
        onError: (e) => toast.error(apiMessage(e)),
    })

    if (openId) return <RunDetail runId={openId} onBack={() => setOpenId(null)} />

    return (
        <div>
            <div className="flex flex-wrap items-end gap-3 mb-4">
                <label className="text-[12px] flex flex-col gap-1">Period start
                    <input type="date" className={input} value={form.periodStart} onChange={(e) => setForm((f) => ({ ...f, periodStart: e.target.value }))} aria-label="Period start" />
                </label>
                <label className="text-[12px] flex flex-col gap-1">Period end
                    <input type="date" className={input} value={form.periodEnd} onChange={(e) => setForm((f) => ({ ...f, periodEnd: e.target.value }))} aria-label="Period end" />
                </label>
                <button type="button" className={primary} disabled={create.isPending} onClick={() => create.mutate()}>Create draft run</button>
            </div>
            {isLoading && <p className="text-[13px] text-gray-500">Loading runs...</p>}
            {isError && <p role="alert" className="text-[13px] text-red-700">{apiMessage(error, 'Failed to load runs')}</p>}
            {!isLoading && !isError && (
                <table className="w-full text-[13px] bg-white rounded-lg border border-gray-200">
                    <thead><tr className="text-left text-gray-500"><th className="p-2">Period</th><th>Status</th><th>Staff</th><th>Net pay</th><th></th></tr></thead>
                    <tbody>
                        {runs.length === 0 && <tr><td colSpan={5} className="p-3 text-gray-500">No payroll runs yet.</td></tr>}
                        {runs.map((r) => (
                            <tr key={r._id} className="border-t border-gray-100">
                                <td className="p-2">{r.periodStart} to {r.periodEnd}</td>
                                <td>{r.status}</td>
                                <td>{r.totals?.staffCount ?? 0}</td>
                                <td>{money(r.totals?.netPay)}</td>
                                <td><button type="button" className={ghost} onClick={() => setOpenId(r._id)}>Open</button></td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}
        </div>
    )
}

export default function Payroll() {
    const { hasFeature, user } = useAuth()
    const [tab, setTab] = useState('runs')

    if (!hasFeature('tipManagement')) return <FeatureLockedScreen feature="tipManagement" />
    if (user?.role !== 'admin') {
        return <div className="p-8 text-center text-gray-600" data-testid="payroll-no-access">Payroll is available to the restaurant admin only.</div>
    }

    return (
        <div className="max-w-[1400px] mx-auto px-4 md:px-6 py-6 font-manrope" data-testid="payroll-page">
            <h1 className="text-[22px] font-bold text-[#1A181B]">Payroll</h1>
            <p className="text-[13px] text-gray-500 mb-5">
                Simple payroll from attendance: pay profiles, draft runs, adjustments, payout to the staff wallet or cash/bank.
                This is not statutory payroll (no PF, ESI or TDS).
            </p>
            <div className="flex gap-2 border-b border-gray-200 mb-5" role="tablist">
                {[['runs', 'Payroll runs'], ['profiles', 'Pay profiles']].map(([id, label]) => (
                    <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)}
                        className={`px-4 py-2 text-[14px] font-semibold border-b-2 -mb-px ${tab === id ? 'border-[#FE8301] text-[#FE8301]' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
                        {label}
                    </button>
                ))}
            </div>
            {tab === 'runs' ? <RunsTab /> : <ProfilesTab />}
        </div>
    )
}
