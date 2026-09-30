import React, { useState, useEffect, useCallback } from 'react'
import { Plus, X, Search, CookingPot, ChefHat } from 'lucide-react'
import { toast } from 'react-hot-toast'
import { productionAPI, inventoryAPI } from '../../../utils/api'

const inputCls = 'w-full px-3 py-2 bg-white border border-gray-200 rounded-lg focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500/10 text-[14px] text-gray-700 placeholder:text-gray-400'
const labelCls = 'block text-[12px] font-semibold text-gray-600 mb-1'
const money = (n) => `₹${(Number(n) || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`

const NewBatchModal = ({ recipes, inv, onClose, onSaved }) => {
    const [recipeId, setRecipeId] = useState('')
    const [batchQuantity, setBatchQuantity] = useState(1)
    const [outputItem, setOutputItem] = useState('')
    const [outputQty, setOutputQty] = useState('')
    const [notes, setNotes] = useState('')
    const [saving, setSaving] = useState(false)

    const recipe = recipes.find(r => r._id === recipeId)

    const submit = async () => {
        if (!recipeId) { toast.error('Select a recipe'); return }
        if (!(Number(batchQuantity) > 0)) { toast.error('Batch quantity must be greater than 0'); return }
        setSaving(true)
        try {
            const res = await productionAPI.create({
                recipeId, batchQuantity: Number(batchQuantity),
                outputItem: outputItem || undefined, outputQty: outputItem ? Number(outputQty) || 0 : 0, notes,
            })
            if (res.data.success) { toast.success(`Batch ${res.data.production.batchNumber} recorded`); onSaved?.(); onClose() }
        } catch (err) { toast.error(err.response?.data?.message || 'Failed to record production') }
        finally { setSaving(false) }
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-[2px] p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
                    <h2 className="font-bold text-[18px] text-[#1A181B]">Record Production Batch</h2>
                    <button onClick={onClose} className="p-2 text-gray-400 hover:bg-gray-100 rounded-lg"><X size={20} /></button>
                </div>
                <div className="px-6 py-5 space-y-4">
                    <div>
                        <label className={labelCls}>Recipe <span className="text-red-500">*</span></label>
                        <select value={recipeId} onChange={e => setRecipeId(e.target.value)} className={inputCls}>
                            <option value="">— Select a recipe —</option>
                            {recipes.map(r => <option key={r._id} value={r._id}>{r.menuItem?.name}{r.recipeType === 'semi-finished' ? ' (semi-finished)' : ''}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className={labelCls}>Batch quantity (number of recipe batches) <span className="text-red-500">*</span></label>
                        <input type="number" min="0.01" step="0.01" value={batchQuantity} onChange={e => setBatchQuantity(e.target.value)} className={inputCls} />
                    </div>

                    {recipe && (
                        <div className="bg-orange-50/50 border border-orange-100 rounded-xl p-3">
                            <p className="text-[12px] font-semibold text-gray-600 mb-1.5">Will consume (× {batchQuantity || 0}):</p>
                            <div className="space-y-1">
                                {(recipe.ingredients || []).map((ing, i) => (
                                    <div key={i} className="flex justify-between text-[12px] text-gray-600">
                                        <span>{ing.inventoryItem?.name || 'Ingredient'}</span>
                                        <span className="text-gray-500">{(ing.quantity * (Number(batchQuantity) || 0)).toLocaleString('en-IN', { maximumFractionDigits: 3 })} {ing.unit}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className={labelCls}>Output item (optional)</label>
                            <select value={outputItem} onChange={e => setOutputItem(e.target.value)} className={inputCls}>
                                <option value="">— None —</option>
                                {inv.map(i => <option key={i._id} value={i._id}>{i.name}</option>)}
                            </select>
                            <p className="text-[10px] text-gray-400 mt-1">The semi-finished good this batch produces.</p>
                        </div>
                        <div>
                            <label className={labelCls}>Output qty</label>
                            <input type="number" min="0" step="any" value={outputQty} onChange={e => setOutputQty(e.target.value)} disabled={!outputItem} className={`${inputCls} disabled:bg-gray-50`} />
                        </div>
                    </div>

                    <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="Notes (optional)" className={`${inputCls} resize-none`} />

                    <div className="flex items-center gap-3 pt-2 border-t border-gray-100">
                        <button onClick={onClose} className="flex-1 px-5 py-3 border border-gray-200 text-gray-600 rounded-xl text-[14px] font-semibold hover:bg-gray-50">Cancel</button>
                        <button onClick={submit} disabled={saving} className="flex-1 px-5 py-3 bg-[#FE8301] text-white rounded-xl text-[14px] font-semibold hover:bg-orange-600 disabled:opacity-60">{saving ? 'Recording…' : 'Record batch'}</button>
                    </div>
                </div>
            </div>
        </div>
    )
}

const ProductionTab = () => {
    const [entries, setEntries] = useState([])
    const [summary, setSummary] = useState(null)
    const [recipes, setRecipes] = useState([])
    const [inv, setInv] = useState([])
    const [loading, setLoading] = useState(true)
    const [show, setShow] = useState(false)

    const load = useCallback(async () => {
        setLoading(true)
        try {
            const [e, s] = await Promise.all([productionAPI.getAll(), productionAPI.getSummary()])
            if (e.data.success) setEntries(e.data.entries || [])
            if (s.data.success) setSummary(s.data.summary)
        } catch { toast.error('Failed to load production log') }
        finally { setLoading(false) }
    }, [])
    useEffect(() => { load() }, [load])
    useEffect(() => {
        inventoryAPI.getRecipes().then(r => { if (r.data.success) setRecipes((r.data.recipes || []).filter(x => x.menuItem)) }).catch(() => {})
        inventoryAPI.getAll({ limit: 500 }).then(r => { if (r.data.success) setInv(r.data.items || []) }).catch(() => {})
    }, [])

    const Card = ({ label, value, color }) => (
        <div className="bg-white rounded-xl border border-gray-100 px-4 py-3 shadow-sm">
            <p className="text-[11px] text-gray-400 font-medium">{label}</p>
            <p className={`text-lg font-bold ${color || 'text-[#1A181B]'}`}>{value}</p>
        </div>
    )

    return (
        <div>
            {summary && (
                <div className="grid grid-cols-3 gap-3 mb-4">
                    <Card label="Total Batches" value={summary.totalBatches} />
                    <Card label="Today's Batches" value={summary.todayBatches} color="text-[#702083]" />
                    <Card label="Today's Production Cost" value={money(summary.todayCost)} color="text-[#0EA5E9]" />
                </div>
            )}

            <div className="flex items-center justify-between mb-4">
                <p className="text-sm text-gray-500">Batch cooking — produce semi-finished goods ahead of service. Ingredients auto-deduct from stock.</p>
                <button onClick={() => setShow(true)} disabled={recipes.length === 0} title={recipes.length === 0 ? 'Create a recipe first' : ''} className="inline-flex items-center gap-2 px-4 py-2.5 bg-[#FE8301] text-white rounded-xl text-sm font-semibold hover:bg-orange-600 disabled:opacity-50 shrink-0"><Plus size={16} /> New Batch</button>
            </div>

            {loading ? (
                <div className="py-16 text-center text-gray-400 text-sm">Loading…</div>
            ) : entries.length === 0 ? (
                <div className="py-16 text-center text-gray-400">
                    <CookingPot size={36} className="mx-auto mb-2 text-gray-300" />
                    <p className="text-sm">No production batches yet.{recipes.length === 0 ? ' Create a recipe first.' : ''}</p>
                </div>
            ) : (
                <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                    <table className="w-full text-sm">
                        <thead className="bg-gray-50 text-[11px] uppercase text-gray-400 font-semibold">
                            <tr><th className="text-left px-4 py-3">Batch</th><th className="text-left px-4 py-3">Recipe</th><th className="text-right px-4 py-3">Qty</th><th className="text-left px-4 py-3">Output</th><th className="text-right px-4 py-3">Cost</th><th className="text-left px-4 py-3">Date · By</th></tr>
                        </thead>
                        <tbody>
                            {entries.map(e => (
                                <tr key={e._id} className="border-t border-gray-50 hover:bg-gray-50/50">
                                    <td className="px-4 py-3 font-semibold text-gray-800">{e.batchNumber}</td>
                                    <td className="px-4 py-3 text-gray-600"><ChefHat size={12} className="inline text-gray-300 mr-1" />{e.recipeName || '—'}</td>
                                    <td className="px-4 py-3 text-right text-gray-600">{e.batchQuantity}×</td>
                                    <td className="px-4 py-3 text-gray-600 text-[12px]">{e.outputItem ? `${e.outputQty} ${e.outputUnit} ${e.outputItem.name || ''}` : '—'}</td>
                                    <td className="px-4 py-3 text-right font-semibold text-gray-700">{money(e.totalCost)}</td>
                                    <td className="px-4 py-3 text-gray-500 text-[12px]">{new Date(e.productionDate).toLocaleDateString('en-IN')}{e.producedByName ? ` · ${e.producedByName}` : ''}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {show && <NewBatchModal recipes={recipes} inv={inv} onClose={() => setShow(false)} onSaved={load} />}
        </div>
    )
}

export default ProductionTab
