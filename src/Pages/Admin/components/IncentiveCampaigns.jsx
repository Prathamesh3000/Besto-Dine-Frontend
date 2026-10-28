import React, { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Plus, Pause, Play, Pencil, Trash2 } from 'lucide-react'
import { incentiveAPI } from '../../../utils/api'
import { apiMessage, deleteErrorMessage, isLockedError, money, CAMPAIGN_STATUS_STYLE } from '../../../utils/incentives'
import IncentiveCampaignModal from './IncentiveCampaignModal'

export default function IncentiveCampaigns({ menuItems = [], branches = [], onLocked }) {
    const qc = useQueryClient()
    const [modal, setModal] = useState(null) // null | 'new' | campaign
    const [deleteError, setDeleteError] = useState('')

    const { data: campaigns, isLoading, error, refetch } = useQuery({
        queryKey: ['admin', 'incentives', 'campaigns'],
        queryFn: async () => {
            try {
                const res = await incentiveAPI.getCampaigns()
                return res.data?.campaigns || []
            } catch (err) {
                if (isLockedError(err)) onLocked?.(err)
                throw err
            }
        },
        retry: false,
    })

    const refresh = () => qc.invalidateQueries({ queryKey: ['admin', 'incentives'] })

    const save = async (payload) => {
        const creating = modal === 'new'
        if (creating) await incentiveAPI.createCampaign(payload)
        else await incentiveAPI.updateCampaign(modal._id, payload)
        toast.success(creating ? 'Campaign created' : 'Campaign updated')
        setModal(null)
        refresh()
    }

    const togglePause = async (c) => {
        try {
            await incentiveAPI.updateCampaign(c._id, { status: c.status === 'paused' ? 'active' : 'paused' })
            toast.success(c.status === 'paused' ? 'Campaign resumed' : 'Campaign paused')
            refresh()
        } catch (err) {
            toast.error(apiMessage(err, 'Could not update the campaign'))
        }
    }

    const remove = async (c) => {
        setDeleteError('')
        if (typeof window !== 'undefined' && window.confirm && !window.confirm(`Delete "${c.name}"?`)) return
        try {
            await incentiveAPI.deleteCampaign(c._id)
            toast.success('Campaign deleted')
            refresh()
        } catch (err) {
            setDeleteError(deleteErrorMessage(err))
        }
    }

    const itemName = (id) => menuItems.find(m => String(m._id) === String(id?._id || id))?.name

    return (
        <div>
            <div className="flex items-center justify-between mb-4">
                <p className="text-[13px] text-gray-500">Earned when the item is served and the order is paid. Flat rate per item.</p>
                <button type="button" onClick={() => setModal('new')} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#FE8301] text-white text-[14px] font-semibold">
                    <Plus size={16} /> New campaign
                </button>
            </div>

            {deleteError && (
                <div className="mb-4 p-3 rounded-lg bg-amber-50 border border-amber-200 text-[13px] text-amber-800" role="alert" data-testid="inc-delete-error">{deleteError}</div>
            )}

            {isLoading && <p className="text-gray-500 text-[14px]" data-testid="inc-loading">Loading campaigns...</p>}
            {error && !isLockedError(error) && (
                <div className="p-4 rounded-lg bg-red-50 text-red-700 text-[14px]" role="alert">
                    {apiMessage(error, 'Could not load campaigns')}{' '}
                    <button type="button" className="underline font-semibold" onClick={() => refetch()}>Retry</button>
                </div>
            )}
            {!isLoading && !error && campaigns?.length === 0 && (
                <div className="p-8 text-center text-gray-500 bg-white rounded-xl border border-gray-100" data-testid="inc-empty">
                    No campaigns yet. Create one to start rewarding staff for pushing specific items.
                </div>
            )}

            {campaigns?.length > 0 && (
                <div className="bg-white rounded-xl border border-gray-100 overflow-x-auto">
                    <table className="w-full text-left text-[13px]">
                        <thead className="bg-gray-50 text-gray-500">
                            <tr>
                                <th className="p-3">Campaign</th><th className="p-3">Items</th><th className="p-3">Rate</th>
                                <th className="p-3">Dates</th><th className="p-3">Status</th><th className="p-3">Spent / budget</th>
                                <th className="p-3">Qty earned</th><th className="p-3 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {campaigns.map(c => (
                                <tr key={c._id} className="border-t border-gray-50" data-testid="inc-campaign-row">
                                    <td className="p-3 font-semibold">{c.name}</td>
                                    <td className="p-3 text-gray-600" title={(c.items || []).map(itemName).filter(Boolean).join(', ')}>
                                        {(c.items || []).length} item{(c.items || []).length === 1 ? '' : 's'}
                                    </td>
                                    <td className="p-3">{money(c.rule?.ratePerItem)}</td>
                                    <td className="p-3 whitespace-nowrap">{String(c.startDate).slice(0, 10)} to {String(c.endDate).slice(0, 10)}</td>
                                    <td className="p-3">
                                        <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border capitalize ${CAMPAIGN_STATUS_STYLE[c.status] || CAMPAIGN_STATUS_STYLE.ended}`}>{c.status}</span>
                                    </td>
                                    <td className="p-3">{money(c.spent)} / {c.budgetCap ? money(c.budgetCap) : 'no cap'}</td>
                                    <td className="p-3">{c.quantityEarned || 0}</td>
                                    <td className="p-3">
                                        <div className="flex justify-end gap-2">
                                            <button type="button" aria-label={`${c.status === 'paused' ? 'Resume' : 'Pause'} ${c.name}`} onClick={() => togglePause(c)} className="p-1.5 rounded hover:bg-gray-100">
                                                {c.status === 'paused' ? <Play size={15} /> : <Pause size={15} />}
                                            </button>
                                            <button type="button" aria-label={`Edit ${c.name}`} onClick={() => setModal(c)} className="p-1.5 rounded hover:bg-gray-100"><Pencil size={15} /></button>
                                            <button type="button" aria-label={`Delete ${c.name}`} onClick={() => remove(c)} className="p-1.5 rounded hover:bg-red-50 text-red-600"><Trash2 size={15} /></button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {modal && (
                <IncentiveCampaignModal
                    campaign={modal === 'new' ? null : modal}
                    menuItems={menuItems}
                    branches={branches}
                    onSave={save}
                    onClose={() => setModal(null)}
                />
            )}
        </div>
    )
}
