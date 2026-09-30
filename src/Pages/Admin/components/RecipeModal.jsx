import React, { useState, useEffect } from 'react'
import { X, Plus, Trash2, Search, ChefHat, Save, AlertTriangle } from 'lucide-react'
import { toast } from 'react-hot-toast'
import { inventoryAPI } from '../../../utils/api'

const UNITS = ['kg', 'g', 'L', 'mL', 'pcs', 'dozen', 'box', 'pack', 'bottle', 'can']

// Mirror of Backend/controllers/inventoryController.js UNIT_CONVERSIONS — keeps
// the in-modal food cost preview consistent with what the server will compute.
const UNIT_CONVERSIONS = { kg_g: 1000, g_kg: 0.001, L_mL: 1000, mL_L: 0.001 }
const convertUnits = (qty, from, to) => {
    if (from === to) return qty
    const mult = UNIT_CONVERSIONS[`${from}_${to}`]
    return mult ? qty * mult : null
}

const RecipeModal = ({ menuItem, onClose, onSaved }) => {
    const [ingredients, setIngredients] = useState([])
    const [recipeYield, setRecipeYield] = useState(1)
    const [recipeType, setRecipeType] = useState('finished')
    const [prepLossPercent, setPrepLossPercent] = useState(0)
    const [notes, setNotes] = useState('')
    const [inventoryItems, setInventoryItems] = useState([])
    const [searchTerm, setSearchTerm] = useState('')
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [foodCost, setFoodCost] = useState(0)
    const [unitMismatches, setUnitMismatches] = useState([])
    const [existing, setExisting] = useState(false)

    // Load inventory items and existing recipe
    useEffect(() => {
        const load = async () => {
            setLoading(true)
            try {
                const [invRes, recipeRes] = await Promise.allSettled([
                    inventoryAPI.getAll({ limit: 500 }),
                    inventoryAPI.getRecipe(menuItem._id),
                ])

                if (invRes.status === 'fulfilled' && invRes.value.data.success) {
                    setInventoryItems(invRes.value.data.items || [])
                }

                if (recipeRes.status === 'fulfilled' && recipeRes.value.data.success) {
                    const r = recipeRes.value.data.recipe
                    setExisting(true)
                    setRecipeYield(r.yield || 1)
                    setRecipeType(r.recipeType || 'finished')
                    setPrepLossPercent(r.prepLossPercent || 0)
                    setNotes(r.notes || '')
                    setIngredients(
                        (r.ingredients || []).map(ing => ({
                            inventoryItem: ing.inventoryItem?._id || ing.inventoryItem,
                            name: ing.inventoryItem?.name || '',
                            quantity: ing.quantity,
                            unit: ing.unit,
                            costPerUnit: ing.inventoryItem?.costPerUnit || 0,
                            currentStock: ing.inventoryItem?.currentStock || 0,
                            invUnit: ing.inventoryItem?.unit || ing.unit,
                        }))
                    )
                }
            } catch { /* ignore */ }
            finally { setLoading(false) }
        }
        load()
    }, [menuItem._id])

    // Recalc food cost whenever ingredients change. Convert recipe unit to
    // inventory unit before multiplying by costPerUnit so preview matches
    // what the backend computes.
    useEffect(() => {
        let cost = 0
        const mismatches = []
        for (const ing of ingredients) {
            if (!ing.quantity || !ing.costPerUnit) continue
            const converted = convertUnits(ing.quantity, ing.unit, ing.invUnit)
            if (converted === null) { mismatches.push(ing.name); continue }
            cost += converted * ing.costPerUnit
        }
        // Per serving, then inflated for prep loss so the preview matches
        // the backend food-cost computation (mirror of inventoryController).
        const lossFactor = 1 - Math.min(95, Math.max(0, Number(prepLossPercent) || 0)) / 100
        setFoodCost(Math.round((cost / (recipeYield || 1) / lossFactor) * 100) / 100)
        setUnitMismatches(mismatches)
    }, [ingredients, recipeYield, prepLossPercent])

    const addIngredient = (item) => {
        if (ingredients.some(i => i.inventoryItem === item._id)) {
            toast.error('This ingredient is already added')
            return
        }
        setIngredients(prev => [...prev, {
            inventoryItem: item._id,
            name: item.name,
            quantity: 0,
            unit: item.unit,
            costPerUnit: item.costPerUnit,
            currentStock: item.currentStock,
            invUnit: item.unit,
        }])
        setSearchTerm('')
    }

    const updateIngredient = (index, field, value) => {
        setIngredients(prev => prev.map((ing, i) => i === index ? { ...ing, [field]: value } : ing))
    }

    const removeIngredient = (index) => {
        setIngredients(prev => prev.filter((_, i) => i !== index))
    }

    const handleSave = async () => {
        if (ingredients.length === 0) {
            toast.error('Add at least one ingredient')
            return
        }
        const invalidQty = ingredients.find(i => !i.quantity || i.quantity <= 0)
        if (invalidQty) {
            toast.error(`Enter a valid quantity for ${invalidQty.name}`)
            return
        }
        if (unitMismatches.length > 0) {
            toast.error(`Unit mismatch for ${unitMismatches[0]}. Auto-deduction will fail — fix the unit before saving.`)
            return
        }

        setSaving(true)
        try {
            const res = await inventoryAPI.saveRecipe({
                menuItemId: menuItem._id,
                ingredients: ingredients.map(i => ({
                    inventoryItem: i.inventoryItem,
                    quantity: Number(i.quantity),
                    unit: i.unit,
                })),
                yield: Number(recipeYield) || 1,
                recipeType,
                prepLossPercent: Math.min(95, Math.max(0, Number(prepLossPercent) || 0)),
                notes,
            })
            if (res.data.success) {
                toast.success(existing ? 'Recipe updated' : 'Recipe created')
                onSaved?.()
                onClose()
            }
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to save recipe')
        } finally {
            setSaving(false)
        }
    }

    const handleDelete = async () => {
        if (!existing) return
        if (!window.confirm('Delete this recipe? Auto-deduction will stop for this menu item.')) return
        try {
            await inventoryAPI.deleteRecipe(menuItem._id)
            toast.success('Recipe deleted')
            onSaved?.()
            onClose()
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to delete')
        }
    }

    const sellingPrice = menuItem.finalPrice || menuItem.basePrice || 0
    const margin = sellingPrice > 0 ? ((sellingPrice - foodCost) / sellingPrice) * 100 : 0
    const costPct = sellingPrice > 0 ? (foodCost / sellingPrice) * 100 : 0

    const filteredInv = searchTerm.trim()
        ? inventoryItems.filter(i =>
            i.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            i.itemId.toLowerCase().includes(searchTerm.toLowerCase())
        )
        : []

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
            <div
                className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden"
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-orange-50 rounded-xl flex items-center justify-center">
                            <ChefHat size={20} className="text-[#FE8301]" />
                        </div>
                        <div>
                            <h2 className="text-lg font-bold text-gray-800">
                                {existing ? 'Edit' : 'Create'} Recipe
                            </h2>
                            <p className="text-xs text-gray-500">{menuItem.name} &middot; Sells at ₹{sellingPrice}</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg transition">
                        <X size={20} className="text-gray-400" />
                    </button>
                </div>

                {loading ? (
                    <div className="flex-1 flex items-center justify-center py-16">
                        <div className="w-8 h-8 border-3 border-orange-500 border-t-transparent rounded-full animate-spin" />
                    </div>
                ) : (
                    <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
                        {/* Cost summary bar */}
                        <div className="grid grid-cols-3 gap-3">
                            <div className="bg-slate-50 rounded-xl p-3 text-center">
                                <p className="text-[10px] text-gray-400 font-semibold uppercase">Food Cost</p>
                                <p className="text-lg font-bold text-gray-800">₹{foodCost}</p>
                            </div>
                            <div className={`rounded-xl p-3 text-center ${costPct > 35 ? 'bg-rose-50' : costPct > 28 ? 'bg-amber-50' : 'bg-emerald-50'}`}>
                                <p className="text-[10px] text-gray-400 font-semibold uppercase">Cost %</p>
                                <p className={`text-lg font-bold ${costPct > 35 ? 'text-rose-700' : costPct > 28 ? 'text-amber-700' : 'text-emerald-700'}`}>
                                    {Math.round(costPct)}%
                                </p>
                            </div>
                            <div className="bg-emerald-50 rounded-xl p-3 text-center">
                                <p className="text-[10px] text-gray-400 font-semibold uppercase">Margin</p>
                                <p className="text-lg font-bold text-emerald-700">{Math.round(margin)}%</p>
                            </div>
                        </div>

                        {/* Recipe type + Yield + Prep loss */}
                        <div className="grid grid-cols-3 gap-3">
                            <div>
                                <label className="text-xs font-semibold text-gray-600 block mb-1.5">Recipe type</label>
                                <select
                                    value={recipeType}
                                    onChange={e => setRecipeType(e.target.value)}
                                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:border-[#FE8301] focus:ring-1 focus:ring-[#FE8301]/20"
                                >
                                    <option value="finished">Finished</option>
                                    <option value="semi-finished">Semi-finished</option>
                                </select>
                            </div>
                            <div>
                                <label className="text-xs font-semibold text-gray-600 block mb-1.5">Servings / batch</label>
                                <input
                                    type="number"
                                    min="0.01"
                                    step="0.01"
                                    value={recipeYield}
                                    onChange={e => setRecipeYield(e.target.value)}
                                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-[#FE8301] focus:ring-1 focus:ring-[#FE8301]/20"
                                />
                            </div>
                            <div>
                                <label className="text-xs font-semibold text-gray-600 block mb-1.5">Prep loss %</label>
                                <input
                                    type="number"
                                    min="0"
                                    max="95"
                                    step="1"
                                    value={prepLossPercent}
                                    onChange={e => setPrepLossPercent(e.target.value)}
                                    placeholder="0"
                                    title="Expected yield loss during prep (trimming, evaporation). Raises the per-serving food cost."
                                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-[#FE8301] focus:ring-1 focus:ring-[#FE8301]/20"
                                />
                            </div>
                        </div>

                        {/* Search & Add ingredient */}
                        <div>
                            <label className="text-sm font-semibold text-gray-700 block mb-2">Add Ingredients</label>
                            <div className="relative">
                                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                                <input
                                    type="text"
                                    value={searchTerm}
                                    onChange={e => setSearchTerm(e.target.value)}
                                    placeholder="Search inventory items to add..."
                                    className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-[#FE8301] focus:ring-1 focus:ring-[#FE8301]/20 placeholder:text-gray-300"
                                />
                                {filteredInv.length > 0 && (
                                    <div className="absolute top-full left-0 right-0 mt-1 bg-white rounded-xl border border-gray-100 shadow-lg z-10 max-h-48 overflow-y-auto">
                                        {filteredInv.slice(0, 10).map(item => (
                                            <button
                                                key={item._id}
                                                onClick={() => addIngredient(item)}
                                                className="w-full text-left px-4 py-2.5 text-sm hover:bg-orange-50 transition flex items-center justify-between"
                                            >
                                                <div>
                                                    <span className="font-medium text-gray-800">{item.name}</span>
                                                    <span className="text-xs text-gray-400 ml-2">{item.category}</span>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <span className="text-xs text-gray-500">{item.currentStock} {item.unit}</span>
                                                    <Plus size={14} className="text-[#FE8301]" />
                                                </div>
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Ingredient list */}
                        {ingredients.length === 0 ? (
                            <div className="text-center py-8 text-gray-400 text-sm">
                                <ChefHat size={32} className="mx-auto mb-2 text-gray-300" />
                                Search and add inventory items to build this recipe
                            </div>
                        ) : (
                            <div className="space-y-2">
                                <div className="grid grid-cols-[1fr_100px_90px_40px] gap-2 text-[10px] font-semibold text-gray-400 uppercase px-1">
                                    <span>Ingredient</span>
                                    <span>Quantity</span>
                                    <span>Unit</span>
                                    <span></span>
                                </div>
                                {ingredients.map((ing, idx) => (
                                    <div key={ing.inventoryItem} className="grid grid-cols-[1fr_100px_90px_40px] gap-2 items-center bg-gray-50 rounded-xl px-3 py-2.5">
                                        <div>
                                            <p className="text-sm font-medium text-gray-800 truncate">{ing.name}</p>
                                            <p className="text-[11px] text-gray-400">
                                                Stock: {ing.currentStock} {ing.invUnit} &middot; ₹{ing.costPerUnit}/{ing.invUnit}
                                            </p>
                                        </div>
                                        <input
                                            type="number"
                                            min="0.001"
                                            step="0.001"
                                            value={ing.quantity || ''}
                                            onChange={e => updateIngredient(idx, 'quantity', parseFloat(e.target.value) || 0)}
                                            className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-sm text-center focus:outline-none focus:border-[#FE8301]"
                                            placeholder="0"
                                        />
                                        <select
                                            value={ing.unit}
                                            onChange={e => updateIngredient(idx, 'unit', e.target.value)}
                                            className="w-full px-1 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-[#FE8301] bg-white"
                                        >
                                            {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                                        </select>
                                        <button
                                            onClick={() => removeIngredient(idx)}
                                            className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition"
                                        >
                                            <Trash2 size={15} />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* Notes */}
                        <div>
                            <label className="text-sm font-semibold text-gray-700 block mb-1">Notes (optional)</label>
                            <textarea
                                value={notes}
                                onChange={e => setNotes(e.target.value)}
                                maxLength={500}
                                rows={2}
                                placeholder="Preparation notes, special instructions..."
                                className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-[#FE8301] focus:ring-1 focus:ring-[#FE8301]/20 resize-none placeholder:text-gray-300"
                            />
                        </div>

                        {unitMismatches.length > 0 && (
                            <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-xl">
                                <AlertTriangle size={16} className="text-amber-600 shrink-0 mt-0.5" />
                                <p className="text-xs text-amber-800">
                                    Unit mismatch on {unitMismatches.join(', ')}. Pick a recipe unit convertible to the inventory unit (kg↔g, L↔mL, or identical units) — otherwise auto-deduction will skip this ingredient.
                                </p>
                            </div>
                        )}

                        {costPct > 35 && (
                            <div className="flex items-start gap-2 p-3 bg-rose-50 border border-rose-200 rounded-xl">
                                <AlertTriangle size={16} className="text-rose-600 shrink-0 mt-0.5" />
                                <p className="text-xs text-rose-700">
                                    Food cost is {Math.round(costPct)}% of selling price. Industry standard is under 30-35%. Consider adjusting prices or portions.
                                </p>
                            </div>
                        )}
                    </div>
                )}

                {/* Footer */}
                <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100 bg-gray-50/50">
                    <div>
                        {existing && (
                            <button
                                onClick={handleDelete}
                                className="text-xs font-semibold text-red-500 hover:text-red-700 transition"
                            >
                                Delete Recipe
                            </button>
                        )}
                    </div>
                    <div className="flex items-center gap-3">
                        <button
                            onClick={onClose}
                            className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-xl transition"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleSave}
                            disabled={saving || ingredients.length === 0}
                            className="flex items-center gap-2 px-5 py-2.5 bg-[#FE8301] text-white rounded-xl text-sm font-semibold hover:bg-orange-600 transition disabled:opacity-50"
                        >
                            <Save size={15} />
                            {saving ? 'Saving...' : 'Save Recipe'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    )
}

export default RecipeModal
