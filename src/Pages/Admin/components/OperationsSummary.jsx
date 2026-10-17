import React, { useEffect, useState } from 'react'
import { Workflow, ChevronRight } from 'lucide-react'
import api from '../../../utils/api'
import { flowSteps } from '../../SuperAdmin/components/OperationsPanel'

/**
 * Admin → Settings → Operations: the restaurant's operating setup,
 * read-only. BestoDine sets it during onboarding (Super Admin →
 * Restaurant → Operations); the owner contacts support to change it.
 */

const MODULE_LABELS = {
    qrOrdering: 'QR ordering',
    waiter: 'Waiter',
    captain: 'Captain',
    chef: 'Chef (kitchen screen)',
    customerPayment: 'Customer payment',
}

const PAY_LABELS = { payFirst: 'Before the order goes to the kitchen', payAfter: 'After the meal', either: 'Customer chooses' }

export default function OperationsSummary() {
    const [data, setData] = useState(null)
    const [error, setError] = useState('')

    useEffect(() => {
        let alive = true
        api.get('/settings/operations')
            .then(res => { if (alive) setData(res.data?.data || null) })
            .catch(err => { if (alive) setError(err.response?.data?.message || 'Could not load the operations setup') })
        return () => { alive = false }
    }, [])

    if (error) return <p className="text-[14px] text-red-600">{error}</p>
    if (!data) return <p className="text-[14px] text-[#645E66]">Loading…</p>

    const r = data.resolved
    const steps = flowSteps(r)
    const methods = r.payment?.methods || {}

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
