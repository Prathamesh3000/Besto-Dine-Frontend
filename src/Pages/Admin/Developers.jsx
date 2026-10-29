import React, { useState } from 'react'
import { useAuth } from '../../Context/AuthContext'
import { FeatureLockedScreen } from '../../Components/RequireFeature'
import DeveloperApiKeys from './components/DeveloperApiKeys'
import DeveloperWebhooks from './components/DeveloperWebhooks'

const TABS = [
    { id: 'keys', label: 'API keys' },
    { id: 'webhooks', label: 'Webhooks' },
]

// Owner-only page for integrations: read-only API keys and signed webhooks
// (module `publicApi`, Gold and above or add-on). Docs: Backend/docs/public-api.md
// and Backend/docs/webhooks.md.
export default function Developers() {
    const { hasFeature, user } = useAuth()
    const [tab, setTab] = useState('keys')
    const [locked, setLocked] = useState(false)

    if (!hasFeature('publicApi') || locked) return <FeatureLockedScreen feature="publicApi" />

    // Owner = admin not pinned to a branch (same rule as AdminLayout.isTenantOwner).
    if (user && !(user.role === 'admin' && !user.branch)) {
        return (
            <div className="p-8 text-center text-gray-600" data-testid="dev-owner-only">
                Only the restaurant owner can manage API keys and webhooks.
            </div>
        )
    }

    return (
        <div className="max-w-[1100px] mx-auto px-4 md:px-6 py-6 font-manrope">
            <h1 className="text-[22px] font-bold text-[#1A181B]">Developers</h1>
            <p className="text-[13px] text-gray-500 mb-5">
                Connect your own tools. API keys give read-only access to your orders, menu, sales, low-stock items and bookings.
                Webhooks send a signed event to your server when something happens.
            </p>

            <div className="flex gap-2 border-b border-gray-200 mb-5" role="tablist">
                {TABS.map((t) => (
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

            {tab === 'keys'
                ? <DeveloperApiKeys onLocked={() => setLocked(true)} />
                : <DeveloperWebhooks onLocked={() => setLocked(true)} />}
        </div>
    )
}
