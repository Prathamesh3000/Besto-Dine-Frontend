import React, { useEffect, useState } from 'react'
import { Workflow, ChevronRight, GitBranch } from 'lucide-react'
import api from '../../../utils/api'
import { useAdminBranch } from '../../../Context/AdminBranchContext'
import { flowSteps } from '../../SuperAdmin/components/OperationsPanel'

/**
 * Admin → Settings → Operations: the restaurant's operating setup,
 * read-only. BestoDine sets it during onboarding (Super Admin →
 * Restaurant → Operations); the owner contacts support to change it.
 *
 * `GET /settings/operations` returns the profile RESOLVED for the caller's
 * branch (the api interceptor injects the branch picked in the admin
 * switcher), so the summary names that branch and, when the server says
 * so, how many settings it overrides from the tenant default.
 */

const MODULE_LABELS = {
    qrOrdering: 'QR ordering',
    waiter: 'Waiter',
    captain: 'Captain',
    chef: 'Chef (kitchen screen)',
    customerPayment: 'Customer payment',
}

const PAY_LABELS = { payFirst: 'Before the order goes to the kitchen', payAfter: 'After the meal', either: 'Customer chooses' }

const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)
const NOT_FETCHED = Symbol('not fetched')

/** Count the leaf values that differ between two resolved profiles. Pure. */
// eslint-disable-next-line react-refresh/only-export-components
export function countDifferences(a, b) {
    if (!isPlainObject(a) || !isPlainObject(b)) return a === b ? 0 : 1
    const keys = new Set([...Object.keys(a), ...Object.keys(b)])
    let n = 0
    for (const k of keys) {
        if (k === 'planBlocks' || k === 'channels') continue   // plan-derived, not settings
        const x = a[k]
        const y = b[k]
        if (isPlainObject(x) && isPlainObject(y)) n += countDifferences(x, y)
        else if (JSON.stringify(x ?? null) !== JSON.stringify(y ?? null)) n += 1
    }
    return n
}

/**
 * How many settings this branch overrides, or null when the payload does
 * not say: a server-provided `overridesCount` wins; otherwise the tenant
 * profile must be present (`tenantResolved` or `tenant.resolved`) to
 * compare against. Nothing is guessed from the resolved profile alone.
 */
// eslint-disable-next-line react-refresh/only-export-components
export function overridesCountOf(data) {
    if (!data) return null
    if (typeof data.overridesCount === 'number') return data.overridesCount
    const tenant = data.tenantResolved || data.tenant?.resolved || null
    if (isPlainObject(tenant) && isPlainObject(data.resolved)) return countDifferences(tenant, data.resolved)
    return null
}

export default function OperationsSummary() {
    const { branches, selectedBranchId, lockedBranchName } = useAdminBranch()
    // The answer for one branch: `forBranch` is the switcher value it was
    // fetched for, so a response for another branch reads as "loading".
    const [result, setResult] = useState({ forBranch: NOT_FETCHED, data: null, error: '' })

    // Refetch when the admin switches branch: the interceptor sends the
    // new `?branch=` and the server resolves that branch's profile.
    useEffect(() => {
        let alive = true
        api.get('/settings/operations')
            .then(res => { if (alive) setResult({ forBranch: selectedBranchId, data: res.data?.data || null, error: '' }) })
            .catch(err => { if (alive) setResult({ forBranch: selectedBranchId, data: null, error: err.response?.data?.message || 'Could not load the operations setup' }) })
        return () => { alive = false }
    }, [selectedBranchId])

    const current = result.forBranch === selectedBranchId ? result : null
    const data = current?.data || null
    const error = current?.error || ''

    if (error) return <p className="text-[14px] text-red-600">{error}</p>
    if (!data) return <p className="text-[14px] text-[#645E66]">Loading…</p>

    const r = data.resolved
    const steps = flowSteps(r)
    const methods = r.payment?.methods || {}

    // Which branch's profile this is: the server's word first, then the
    // switcher's pick, a pinned admin's branch, else Main (what the
    // server resolves for an unpinned owner with no branch selected).
    const serverBranchId = data.branchId || data.branch?._id || null
    const shownBranchId = serverBranchId || selectedBranchId || null
    const branchName = data.branch?.name
        || data.branchName
        || branches.find(b => String(b._id) === String(shownBranchId))?.name
        || lockedBranchName
        || (shownBranchId ? null : branches.find(b => b.slug === 'main')?.name)
        || null
    const overridesCount = overridesCountOf(data)
    // Without a count, the server's plain yes/no (`branchOverridden`) still
    // tells the admin this branch departs from the tenant default.
    const branchOverridden = overridesCount == null && data.branchOverridden === true

    return (
        <div className="space-y-4 pb-10" data-testid="operations-summary">
            <div className="bg-white rounded-[16px] border border-gray-100 p-5">
                <div className="flex items-center gap-2 mb-1">
                    <Workflow size={18} className="text-[#702083]" />
                    <h2 className="font-[700] text-[16px] text-[#1A181B]">How your restaurant runs</h2>
                </div>
                <p className="text-[13px] text-[#645E66]">
                    {data.isDefault
                        ? 'Standard full-service setup.'
                        : 'Set up by BestoDine during onboarding.'}{' '}
                    To change it, contact BestoDine support.
                </p>
                {branchName && (
                    <p className="mt-2 flex items-center gap-1.5 text-[13px] text-[#1A181B]" data-testid="operations-branch">
                        <GitBranch size={14} className="text-[#702083]" />
                        <span>Showing the setup for <span className="font-[600]">{branchName}</span>.</span>
                    </p>
                )}
                {overridesCount != null && (
                    <p className="mt-1 text-[13px] text-[#645E66]" data-testid="operations-overrides">
                        {overridesCount > 0
                            ? `This branch overrides ${overridesCount} setting${overridesCount === 1 ? '' : 's'} from the tenant default.`
                            : 'This branch follows the tenant default.'}
                    </p>
                )}
                {branchOverridden && (
                    <p className="mt-1 text-[13px] text-[#645E66]" data-testid="operations-overrides">
                        This branch overrides the tenant default.
                    </p>
                )}
            </div>

            <div className="bg-white rounded-[16px] border border-gray-100 p-5">
                <h3 className="font-[700] text-[14px] text-[#1A181B] mb-3">Modules in use</h3>
                <ul className="flex flex-wrap gap-2">
                    {Object.entries(MODULE_LABELS).map(([key, label]) => (
                        <li
                            key={key}
                            className={`px-3 py-1 rounded-full text-[13px] font-[600] border ${r.modules?.[key]
                                ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                                : 'border-gray-200 bg-gray-50 text-gray-400 line-through'}`}
                        >
                            {label}
                        </li>
                    ))}
                </ul>
            </div>

            <div className="bg-white rounded-[16px] border border-gray-100 p-5">
                <h3 className="font-[700] text-[14px] text-[#1A181B] mb-3">Order flow</h3>
                <ol className="flex flex-wrap items-center gap-x-1 gap-y-2 text-[13px]">
                    {steps.map((s, i) => (
                        <li key={s} className="flex items-center gap-1">
                            <span className="rounded-[8px] bg-[#FAF5F0] px-2 py-1 text-[#1A181B]">{s}</span>
                            {i < steps.length - 1 && <ChevronRight size={12} className="text-gray-400" />}
                        </li>
                    ))}
                </ol>
            </div>

            <div className="bg-white rounded-[16px] border border-gray-100 p-5 grid gap-3 md:grid-cols-2 text-[13px]">
                <div>
                    <div className="text-[#645E66]">Dine-in customers pay</div>
                    <div className="font-[600] text-[#1A181B]">{PAY_LABELS[r.payment?.dineIn] || r.payment?.dineIn}</div>
                </div>
                <div>
                    <div className="text-[#645E66]">Ways to pay first</div>
                    <div className="font-[600] text-[#1A181B]">
                        {[methods.online && 'Online', methods.wallet && 'Wallet', methods.counterCash && 'Cash at the counter']
                            .filter(Boolean).join(', ') || '—'}
                    </div>
                </div>
            </div>
        </div>
    )
}
