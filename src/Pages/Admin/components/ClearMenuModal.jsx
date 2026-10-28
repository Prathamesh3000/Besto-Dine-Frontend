import React, { useEffect, useState } from 'react'
import { X, AlertTriangle, Loader, Trash2 } from 'lucide-react'
import api from '../../../utils/api'
import toast from 'react-hot-toast'

// Clear full menu (owner only). Step 1 asks the server how much would be
// removed (dry run), step 2 requires the owner to type the confirmation
// phrase. Nothing is deleted until the red button is pressed.
const ClearMenuModal = ({ onClose, onComplete }) => {
    const [counts, setCounts] = useState(null)
    const [loadError, setLoadError] = useState('')
    const [typed, setTyped] = useState('')
    const [includeCategories, setIncludeCategories] = useState(false)
    const [busy, setBusy] = useState(false)

    useEffect(() => {
        let alive = true
        api.post('/menu/clear', { dryRun: true })
            .then((res) => { if (alive) setCounts(res.data?.data || null) })
            .catch((err) => { if (alive) setLoadError(err.response?.data?.message || 'Could not check your menu.') })
        return () => { alive = false }
    }, [])

    const phrase = counts?.confirmPhrase || 'CLEAR MENU'
    const matches = typed.trim().toUpperCase() === phrase
    const empty = counts && counts.items === 0 && (!includeCategories || counts.categories === 0)

    const handleClear = async () => {
        if (!matches || busy) return
        setBusy(true)
        try {
            const res = await api.post('/menu/clear', { confirm: typed.trim(), includeCategories })
            const d = res.data?.data || {}
            toast.success(`Menu cleared: ${d.items || 0} dish${d.items === 1 ? '' : 'es'} removed`)
            onComplete?.()
            onClose()
        } catch (err) {
            toast.error(err.response?.data?.message || 'Could not clear the menu')
            setBusy(false)
        }
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="bg-white rounded-2xl w-full max-w-[480px] shadow-xl" role="dialog" aria-label="Clear full menu">
                <div className="flex items-start justify-between p-6 pb-4 border-b border-gray-100">
                    <div>
                        <h2 className="text-[20px] font-bold text-[#1A181B] font-manrope">Clear full menu</h2>
                        <p className="text-[13px] text-gray-500 font-manrope mt-1">Remove every dish so you can start fresh.</p>
                    </div>
                    <button onClick={onClose} disabled={busy} className="text-gray-400 hover:text-gray-600" aria-label="Close">
                        <X size={22} />
                    </button>
                </div>

                <div className="p-6 space-y-4">
                    {!counts && !loadError && (
                        <div className="flex items-center gap-2 text-gray-500 font-manrope text-[14px]" data-testid="clear-loading">
                            <Loader size={16} className="animate-spin" /> Checking your menu…
                        </div>
                    )}
                    {loadError && <p className="text-red-600 text-[14px] font-manrope" role="alert">{loadError}</p>}

                    {counts && (
                        <>
                            <div className="rounded-xl border border-red-200 bg-red-50 p-4 flex gap-3">
                                <AlertTriangle size={20} className="text-red-600 shrink-0 mt-0.5" />
                                <div className="text-[13px] text-[#1A181B] font-manrope space-y-1" data-testid="clear-summary">
                                    <p className="font-bold">This will permanently delete {counts.items} dish{counts.items === 1 ? '' : 'es'}.</p>
                                    {counts.recipes > 0 && <p>{counts.recipes} recipe{counts.recipes === 1 ? '' : 's'} linked to them will also be deleted.</p>}
                                    {counts.combos > 0 && <p>{counts.combos} combo{counts.combos === 1 ? '' : 's'} that use these dishes will be archived.</p>}
                                    <p>Past orders and bills are not affected. This cannot be undone.</p>
                                </div>
                            </div>

                            <label className="flex items-center gap-2 text-[14px] font-manrope text-[#1A181B] cursor-pointer">
                                <input type="checkbox" checked={includeCategories} onChange={(e) => setIncludeCategories(e.target.checked)} />
                                Also remove the {counts.categories} categor{counts.categories === 1 ? 'y' : 'ies'}
                            </label>

                            <div>
                                <label htmlFor="clear-confirm" className="block text-[13px] font-manrope text-gray-600 mb-1">
                                    Type <span className="font-bold text-[#1A181B]">{phrase}</span> to confirm
                                </label>
                                <input
                                    id="clear-confirm"
                                    value={typed}
                                    onChange={(e) => setTyped(e.target.value)}
                                    autoComplete="off"
                                    className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-[14px] font-manrope focus:outline-none focus:border-red-400"
                                />
                            </div>
                            {empty && <p className="text-[13px] text-gray-500 font-manrope">There is nothing to remove.</p>}
                        </>
                    )}
                </div>

                <div className="p-6 pt-2 flex gap-3">
                    <button onClick={onClose} disabled={busy} className="flex-1 py-3 rounded-xl border border-[#FE8301] text-[#FE8301] font-bold text-[15px] hover:bg-orange-50 font-manrope disabled:opacity-50">
                        Cancel
                    </button>
                    <button
                        onClick={handleClear}
                        disabled={!counts || !matches || busy || empty}
                        className="flex-1 py-3 rounded-xl bg-red-600 text-white font-bold text-[15px] hover:bg-red-700 font-manrope disabled:opacity-40 flex items-center justify-center gap-2"
                    >
                        {busy ? <Loader size={16} className="animate-spin" /> : <Trash2 size={16} />}
                        {busy ? 'Clearing…' : 'Clear menu'}
                    </button>
                </div>
            </div>
        </div>
    )
}

export default ClearMenuModal
