import React, { useEffect } from 'react'
import { X, AlertTriangle, Wrench, Boxes, ArrowRight } from 'lucide-react'

// Explains exactly what's wrong with a menu item's inventory link and gives
// the admin a one-click path to fix it. `issue` = { menuItemId, name, level, reasons[] }.
const LEVEL_META = {
    out: { label: 'Out of stock', cls: 'bg-rose-100 text-rose-700' },
    config: { label: 'Recipe issue', cls: 'bg-orange-100 text-orange-700' },
    low: { label: 'Low stock', cls: 'bg-amber-100 text-amber-700' },
}

const MenuIssueModal = ({ issue, onClose, onFixRecipe, onGoInventory }) => {
    useEffect(() => {
        if (!issue) return
        const onKey = (e) => { if (e.key === 'Escape') onClose() }
        document.addEventListener('keydown', onKey)
        return () => document.removeEventListener('keydown', onKey)
    }, [issue, onClose])

    if (!issue) return null
    const meta = LEVEL_META[issue.level] || LEVEL_META.low
    const isConfig = issue.level === 'config'
    const isStock = issue.level === 'out' || issue.level === 'low'

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 font-manrope">
            <div className="absolute inset-0 bg-black/40" onClick={onClose} />
            <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-[520px] overflow-hidden">
                {/* Header */}
                <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-gray-100">
                    <div className="flex items-center gap-2.5">
                        <span className="w-9 h-9 rounded-xl bg-rose-50 flex items-center justify-center">
                            <AlertTriangle size={18} className="text-rose-600" />
                        </span>
                        <div>
                            <h2 className="text-[16px] font-bold text-[#1A181B] leading-tight">{issue.name}</h2>
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold mt-0.5 ${meta.cls}`}>{meta.label}</span>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition">
                        <X size={20} />
                    </button>
                </div>

                {/* Body */}
                <div className="px-5 py-4 space-y-4">
                    {/* What's wrong */}
                    <div>
                        <p className="text-[12px] font-bold text-gray-500 uppercase tracking-wide mb-2">What's wrong</p>
                        <ul className="space-y-2">
                            {(issue.reasons || []).map((r, i) => (
                                <li key={i} className="flex items-start gap-2 text-[13px] text-[#374151]">
                                    <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-rose-400 shrink-0" />
                                    <span>{r}</span>
                                </li>
                            ))}
                        </ul>
                    </div>

                    {/* How to fix */}
                    <div className="rounded-xl bg-[#F8F9FA] border border-gray-100 p-3.5">
                        <p className="text-[12px] font-bold text-gray-700 mb-1.5 flex items-center gap-1.5">
                            <Wrench size={13} className="text-[#FE8301]" /> How to fix
                        </p>
                        {isConfig ? (
                            <div className="text-[13px] text-[#475467] space-y-1.5 leading-relaxed">
                                <p>This item's recipe uses a measurement that doesn't match the ingredient's stock unit (for example the recipe is in <b>mL/g</b> but the ingredient is stocked as <b>bottle/pcs</b>), or an ingredient was removed from inventory.</p>
                                <p>Open the recipe and either:</p>
                                <ul className="list-disc pl-5 space-y-0.5">
                                    <li>set the ingredient's unit to <b>match its inventory unit</b>, or</li>
                                    <li>change the <b>inventory item's unit</b> to a convertible one (kg↔g, L↔mL), or</li>
                                    <li>re-link / remove the missing ingredient.</li>
                                </ul>
                                <p className="text-[12px] text-gray-400">Until fixed, orders still go through but this ingredient is <b>not auto-deducted</b> from stock.</p>
                            </div>
                        ) : (
                            <div className="text-[13px] text-[#475467] space-y-1.5 leading-relaxed">
                                <p>An ingredient used by this item is {issue.level === 'out' ? 'out of' : 'running low on'} stock. Restock it (or raise its quantity) from the Inventory page so this dish keeps selling.</p>
                                <p className="text-[12px] text-gray-400">Out-of-stock ingredients can block new orders for this item.</p>
                            </div>
                        )}
                    </div>
                </div>

                {/* Actions */}
                <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-gray-100">
                    <button onClick={onClose} className="px-4 py-2 rounded-lg text-[13px] font-semibold text-gray-600 hover:bg-gray-100 transition">Close</button>
                    {isConfig && (
                        <button onClick={() => onFixRecipe?.(issue)} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#FE8301] text-white text-[13px] font-semibold hover:bg-orange-600 transition">
                            <Wrench size={15} /> Open Recipe Editor <ArrowRight size={14} />
                        </button>
                    )}
                    {isStock && (
                        <button onClick={() => onGoInventory?.(issue)} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#FE8301] text-white text-[13px] font-semibold hover:bg-orange-600 transition">
                            <Boxes size={15} /> Go to Inventory <ArrowRight size={14} />
                        </button>
                    )}
                </div>
            </div>
        </div>
    )
}

export default MenuIssueModal
