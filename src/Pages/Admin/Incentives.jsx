import React, { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import api from '../../utils/api'
import { useAuth } from '../../Context/AuthContext'
import { useAdminBranch } from '../../Context/AdminBranchContext'
import { FeatureLockedScreen } from '../../Components/RequireFeature'
import IncentiveCampaigns from './components/IncentiveCampaigns'
import IncentiveReport from './components/IncentiveReport'

const TABS = [
    { id: 'campaigns', label: 'Campaigns' },
    { id: 'report', label: 'Report' },
]

export default function Incentives() {
    const { hasPermission, hasFeature } = useAuth()
    const { branches = [] } = useAdminBranch()
    const [tab, setTab] = useState('campaigns')
    // Set when the API answers FEATURE_LOCKED / FEATURE_REVOKED (module switched
    // off after the page loaded, or the local plan snapshot is stale).
    const [locked, setLocked] = useState(false)

    const allowed = hasPermission('incentives')
    const featureOn = hasFeature('incentives')

    const { data: menuItems = [] } = useQuery({
        queryKey: ['admin', 'incentives', 'menu-items'],
        queryFn: async () => {
            const res = await api.get('/menu?limit=1000&status=active', { _silent: true, _skipAdminBranchParam: true })
            const list = res.data?.data || res.data || []
            return Array.isArray(list) ? list : []
        },
        enabled: allowed && featureOn,
        staleTime: 5 * 60 * 1000,
    })

    const { data: staff = [] } = useQuery({
        queryKey: ['admin', 'incentives', 'staff'],
        queryFn: async () => {
            const res = await api.get('/staff', { _silent: true, _skipAdminBranchParam: true })
            return (res.data?.staff || []).filter(s => ['captain', 'waiter'].includes(s.role))
        },
        enabled: allowed && featureOn,
        staleTime: 5 * 60 * 1000,
    })

    if (!featureOn || locked) return <FeatureLockedScreen feature="incentives" />

    if (!allowed) {
        return (
            <div className="p-8 text-center text-gray-600" data-testid="inc-no-permission">
                You do not have permission to view incentives. Ask an admin to grant the Staff Incentives permission.
            </div>
        )
    }

    return (
        <div className="max-w-[1400px] mx-auto px-4 md:px-6 py-6 font-manrope">
            <h1 className="text-[22px] font-bold text-[#1A181B]">Staff Incentives</h1>
            <p className="text-[13px] text-gray-500 mb-5">
                Reward captains and waiters for selling chosen items. An incentive is earned once the item is served and the order is paid.
            </p>

            <div className="flex gap-2 border-b border-gray-200 mb-5" role="tablist">
                {TABS.map(t => (
                    <button
                        key={t.id}
                        type="button"
                        role="tab"
                        aria-selected={tab === t.id}
                        onClick={() => setTab(t.id)}
                        className={`px-4 py-2 text-[14px] font-semibold border-b-2 -mb-px ${tab === t.id ? 'border-[#FE8301] text-[#FE8301]' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
                    >
                        {t.label}
                    </button>
                ))}
            </div>

            {tab === 'campaigns'
                ? <IncentiveCampaigns menuItems={menuItems} branches={branches} onLocked={() => setLocked(true)} />
                : <IncentiveReport menuItems={menuItems} branches={branches} staff={staff} onLocked={() => setLocked(true)} />}
        </div>
    )
}
