import React, { useState, useEffect } from 'react'
import { X } from 'lucide-react'
import { inventoryAPI } from '../../../utils/api'

const CATEGORIES = [
    'Raw Ingredients', 'Beverages', 'Dairy & Eggs', 'Spices & Seasonings',
    'Packaging', 'Cleaning Supplies', 'Kitchen Equipment', 'Bakery Items',
    'Fruits & Vegetables', 'Frozen Goods', 'Oils & Sauces', 'Other'
]

const UNITS = ['kg', 'g', 'L', 'mL', 'pcs', 'dozen', 'box', 'pack', 'bottle', 'can']

const AddInventoryModal = ({ editData, onClose, onSubmit }) => {
    const [form, setForm] = useState({
        name: '',
        category: '',
        unit: 'kg',
        currentStock: '',
        minStock: '',
        maxStock: '',
        costPerUnit: '',
        supplierName: '',
        supplierContact: '',
        expiryTracking: false,
        shelfLifeDays: '',
        expiryDate: ''
    })
    const [nextId, setNextId] = useState('')
    const [submitting, setSubmitting] = useState(false)

    useEffect(() => {
        if (editData) {
            setForm({
                name: editData.name || '',
                category: editData.category || '',
                unit: editData.unit || 'kg',
                currentStock: editData.currentStock ?? '',
                minStock: editData.minStock ?? '',
                maxStock: editData.maxStock ?? '',
                costPerUnit: editData.costPerUnit ?? '',
                supplierName: editData.supplier?.name || '',
                supplierContact: editData.supplier?.contact || '',
                expiryTracking: editData.expiryTracking ?? (!!editData.expiryDate || !!editData.shelfLifeDays),
                shelfLifeDays: editData.shelfLifeDays ? String(editData.shelfLifeDays) : '',
                expiryDate: editData.expiryDate ? editData.expiryDate.split('T')[0] : ''
            })
        } else {
            inventoryAPI.getNextId().then(res => {
                if (res.data.success) setNextId(res.data.nextId)
            }).catch(() => {})
        }
    }, [editData])

    // Per-field validation errors. Keys match input ids.
    const [errors, setErrors] = useState({})

    const handleChange = (field, value) => {
        setForm(prev => ({ ...prev, [field]: value }))
        // Clear the field's error the moment the user edits it.
        if (errors[field]) setErrors(prev => ({ ...prev, [field]: undefined }))
    }

    const validate = () => {
        const e = {}
        if (!form.name.trim())                                            e.name = 'Item name is required'
        else if (form.name.trim().length > 100)                           e.name = 'Item name must be under 100 characters'
        if (!form.category)                                               e.category = 'Please select a category'
        if (form.minStock === '' || Number(form.minStock) < 0)            e.minStock = 'Min stock must be 0 or greater'
        if (form.costPerUnit === '' || Number(form.costPerUnit) < 0)      e.costPerUnit = 'Cost per unit must be 0 or greater'
        const max = Number(form.maxStock) || 0
        const min = Number(form.minStock)
        if (max > 0 && min > max)                                         e.maxStock = `Min (${min}) cannot exceed max (${max})`
        if (!editData) {
            const stock = Number(form.currentStock) || 0
            if (max > 0 && stock > max)                                   e.currentStock = `Initial stock (${stock}) cannot exceed max (${max})`
        }
        if (form.expiryTracking && form.expiryDate) {
            const today = new Date().toISOString().split('T')[0]
            if (form.expiryDate < today)                                  e.expiryDate = 'Expiry date cannot be in the past'
        }
        return e
    }

    const handleSubmit = async (e) => {
        e.preventDefault()
        const errs = validate()
        setErrors(errs)
        if (Object.keys(errs).length) {
            // Focus the first invalid input — sorted in display order so
            // we land on the topmost problem instead of jumping around.
            const order = ['name', 'category', 'currentStock', 'minStock', 'maxStock', 'costPerUnit', 'expiryDate']
            const firstBad = order.find(k => errs[k])
            if (firstBad) {
                setTimeout(() => {
                    const el = document.getElementById(firstBad)
                    if (el) { try { el.focus() } catch { /* noop */ } el.scrollIntoView?.({ behavior: 'smooth', block: 'center' }) }
                }, 0)
            }
            return
        }
        setSubmitting(true)
        try {
            const payload = {
                name: form.name.trim(),
                category: form.category,
                unit: form.unit,
                currentStock: Number(form.currentStock) || 0,
                minStock: Number(form.minStock),
                maxStock: Number(form.maxStock) || 0,
                costPerUnit: Number(form.costPerUnit),
                supplier: {
                    name: form.supplierName.trim(),
                    contact: form.supplierContact.trim()
                },
                expiryTracking: form.expiryTracking,
                // Shelf life / expiry only meaningful when tracking is on.
                shelfLifeDays: form.expiryTracking ? (Number(form.shelfLifeDays) || 0) : 0,
                expiryDate: form.expiryTracking ? (form.expiryDate || undefined) : undefined
            }
            await onSubmit(payload)
        } finally {
            setSubmitting(false)
        }
    }

    // Inline error helper, paired with each input.
    const FieldError = ({ name }) =>
        errors[name] ? (
            <p id={`${name}-err`} role="alert" className="text-xs text-red-600 mt-1 flex items-center gap-1">
                <span aria-hidden="true">⚠</span>{errors[name]}
            </p>
        ) : null
    const errBorder = (name) =>
        errors[name] ? 'border-red-400! focus:border-red-500! focus:ring-red-200!' : ''

    const inputClass = 'w-full px-4 py-3 bg-white border border-gray-200 rounded-xl focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/10 transition-all text-[14px] font-medium text-gray-700 placeholder:text-gray-400'
    const labelClass = 'block text-[13px] font-[600] text-gray-600 mb-1.5'

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-[2px]">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-[620px] max-h-[90vh] overflow-y-auto mx-4">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
                    <div>
                        <h2 className="font-manrope font-[700] text-[18px] text-[#1A181B]">
                            {editData ? 'Edit Inventory Item' : 'Add Inventory Item'}
                        </h2>
                        {!editData && nextId && (
                            <p className="text-[12px] text-gray-400 mt-0.5">ID: {nextId}</p>
                        )}
                    </div>
                    <button
                        onClick={onClose}
                        disabled={submitting}
                        aria-label="Close"
                        title={submitting ? 'Wait for save to finish' : 'Close'}
                        className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Form */}
                <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4" noValidate>
                    {/* Name */}
                    <div>
                        <label htmlFor="name" className={labelClass}>
                            Item name <span className="text-red-500" aria-hidden="true">*</span>
                        </label>
                        <input
                            id="name"
                            type="text"
                            value={form.name}
                            onChange={(e) => handleChange('name', e.target.value)}
                            placeholder="e.g. Olive Oil, Fresh Milk, Basmati Rice"
                            aria-required="true"
                            aria-invalid={errors.name ? 'true' : 'false'}
                            aria-describedby={errors.name ? 'name-err' : undefined}
                            maxLength={100}
                            className={`${inputClass} ${errBorder('name')}`}
                        />
                        <FieldError name="name" />
                    </div>

                    {/* Category + Unit */}
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label htmlFor="category" className={labelClass}>
                                Category <span className="text-red-500" aria-hidden="true">*</span>
                            </label>
                            <select
                                id="category"
                                value={form.category}
                                onChange={(e) => handleChange('category', e.target.value)}
                                aria-required="true"
                                aria-invalid={errors.category ? 'true' : 'false'}
                                aria-describedby={errors.category ? 'category-err' : undefined}
                                className={`${inputClass} ${errBorder('category')}`}
                            >
                                <option value="">— Select category —</option>
                                {CATEGORIES.map(cat => (
                                    <option key={cat} value={cat}>{cat}</option>
                                ))}
                            </select>
                            <FieldError name="category" />
                        </div>
                        <div>
                            <label htmlFor="unit" className={labelClass}>Unit</label>
                            <select
                                id="unit"
                                value={form.unit}
                                onChange={(e) => handleChange('unit', e.target.value)}
                                className={inputClass}
                            >
                                {UNITS.map(u => (
                                    <option key={u} value={u}>{u}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    {/* Stock levels */}
                    <div className="grid grid-cols-3 gap-4">
                        {!editData && (
                            <div>
                                <label htmlFor="currentStock" className={labelClass}>Initial stock</label>
                                <input
                                    id="currentStock"
                                    type="number"
                                    min="0"
                                    step="any"
                                    inputMode="decimal"
                                    value={form.currentStock}
                                    onChange={(e) => handleChange('currentStock', e.target.value)}
                                    placeholder="0"
                                    aria-invalid={errors.currentStock ? 'true' : 'false'}
                                    aria-describedby={errors.currentStock ? 'currentStock-err' : undefined}
                                    className={`${inputClass} ${errBorder('currentStock')}`}
                                />
                                <FieldError name="currentStock" />
                            </div>
                        )}
                        <div>
                            <label htmlFor="minStock" className={labelClass}>
                                Min stock <span className="text-red-500" aria-hidden="true">*</span>
                            </label>
                            <input
                                id="minStock"
                                type="number"
                                min="0"
                                step="any"
                                inputMode="decimal"
                                value={form.minStock}
                                onChange={(e) => handleChange('minStock', e.target.value)}
                                placeholder="Reorder level"
                                aria-required="true"
                                aria-invalid={errors.minStock ? 'true' : 'false'}
                                aria-describedby={errors.minStock ? 'minStock-err' : undefined}
                                className={`${inputClass} ${errBorder('minStock')}`}
                            />
                            <FieldError name="minStock" />
                        </div>
                        <div>
                            <label htmlFor="maxStock" className={labelClass}>Max stock</label>
                            <input
                                id="maxStock"
                                type="number"
                                min="0"
                                step="any"
                                inputMode="decimal"
                                value={form.maxStock}
                                onChange={(e) => handleChange('maxStock', e.target.value)}
                                placeholder="0 = no limit"
                                aria-invalid={errors.maxStock ? 'true' : 'false'}
                                aria-describedby={errors.maxStock ? 'maxStock-err' : undefined}
                                className={`${inputClass} ${errBorder('maxStock')}`}
                            />
                            <FieldError name="maxStock" />
                        </div>
                    </div>

                    {/* Cost + Expiry tracking toggle */}
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label htmlFor="costPerUnit" className={labelClass}>
                                Cost per unit (₹) <span className="text-red-500" aria-hidden="true">*</span>
                            </label>
                            <input
                                id="costPerUnit"
                                type="number"
                                min="0"
                                step="0.01"
                                inputMode="decimal"
                                value={form.costPerUnit}
                                onChange={(e) => handleChange('costPerUnit', e.target.value)}
                                placeholder="0.00"
                                aria-required="true"
                                aria-invalid={errors.costPerUnit ? 'true' : 'false'}
                                aria-describedby={errors.costPerUnit ? 'costPerUnit-err' : undefined}
                                className={`${inputClass} ${errBorder('costPerUnit')}`}
                            />
                            <FieldError name="costPerUnit" />
                        </div>
                        <div>
                            <label className={labelClass}>Expiry tracking</label>
                            <button
                                type="button"
                                role="switch"
                                aria-checked={form.expiryTracking}
                                onClick={() => handleChange('expiryTracking', !form.expiryTracking)}
                                className={`w-full flex items-center gap-2.5 px-4 py-3 rounded-xl border transition-all text-[14px] font-medium ${form.expiryTracking ? 'bg-orange-50 border-orange-300 text-orange-700' : 'bg-white border-gray-200 text-gray-500'}`}
                            >
                                <span className={`w-9 h-5 rounded-full relative shrink-0 transition-colors ${form.expiryTracking ? 'bg-[#FE8301]' : 'bg-gray-300'}`}>
                                    <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all ${form.expiryTracking ? 'left-[18px]' : 'left-0.5'}`} />
                                </span>
                                {form.expiryTracking ? 'Yes — perishable' : 'No — non-perishable'}
                            </button>
                        </div>
                    </div>

                    {/* Shelf life + Expiry date — only when expiry tracking is on */}
                    {form.expiryTracking && (
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label htmlFor="shelfLifeDays" className={labelClass}>Shelf life (days)</label>
                                <input
                                    id="shelfLifeDays"
                                    type="number"
                                    min="0"
                                    step="1"
                                    inputMode="numeric"
                                    value={form.shelfLifeDays}
                                    onChange={(e) => handleChange('shelfLifeDays', e.target.value)}
                                    placeholder="e.g. 7"
                                    className={inputClass}
                                />
                            </div>
                            <div>
                                <label htmlFor="expiryDate" className={labelClass}>Expiry date</label>
                                <input
                                    id="expiryDate"
                                    type="date"
                                    value={form.expiryDate}
                                    min={new Date().toISOString().split('T')[0]}
                                    onChange={(e) => handleChange('expiryDate', e.target.value)}
                                    aria-invalid={errors.expiryDate ? 'true' : 'false'}
                                    aria-describedby={errors.expiryDate ? 'expiryDate-err' : undefined}
                                    className={`${inputClass} ${errBorder('expiryDate')}`}
                                />
                                <FieldError name="expiryDate" />
                            </div>
                        </div>
                    )}

                    {/* Supplier */}
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label htmlFor="supplierName" className={labelClass}>Supplier name</label>
                            <input
                                id="supplierName"
                                type="text"
                                value={form.supplierName}
                                onChange={(e) => handleChange('supplierName', e.target.value)}
                                placeholder="Supplier name"
                                className={inputClass}
                            />
                        </div>
                        <div>
                            <label htmlFor="supplierContact" className={labelClass}>Supplier contact</label>
                            <input
                                id="supplierContact"
                                type="text"
                                value={form.supplierContact}
                                onChange={(e) => handleChange('supplierContact', e.target.value)}
                                placeholder="Phone or email"
                                className={inputClass}
                            />
                        </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-3 pt-3 border-t border-gray-100">
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex-1 px-5 py-3 border border-gray-200 text-gray-600 rounded-xl text-[14px] font-[600] hover:bg-gray-50 transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={submitting}
                            aria-busy={submitting ? 'true' : 'false'}
                            className="flex-1 px-5 py-3 bg-[#FE8301] text-white rounded-xl text-[14px] font-semibold hover:bg-orange-600 transition-colors shadow-sm disabled:opacity-60 disabled:cursor-not-allowed"
                        >
                            {submitting ? 'Saving…' : editData ? 'Update item' : 'Add item'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    )
}

export default AddInventoryModal
