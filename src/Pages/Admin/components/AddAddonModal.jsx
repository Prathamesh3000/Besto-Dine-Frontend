import React, { useState, useEffect, useMemo } from 'react'
import { X, Save, Star, Flame, Sparkles, Info } from 'lucide-react'
import api from '../../../utils/api'

/**
 * AddAddonModal — create / edit a customer-facing add-on.
 *
 * Slug policy: free-text kebab-case so any restaurant can add their
 * own catalogue (e.g. "florist", "magician", "balloon-arch"). Six
 * "standard" slugs trigger rich customer-side configurators in
 * AddonDetailModal — those are surfaced as smart-suggestion pills
 * next to the slug input. Anything else falls through to the
 * customer generic configurator (description + quantity stepper),
 * so a restaurant can ship a fully custom add-on without any code.
 */

const STANDARD_RENDERERS = [
    { slug: 'photographer', label: 'Photography', desc: 'Single-select duration tiers' },
    { slug: 'dj',           label: 'Music & DJ',  desc: 'Single-select duration tiers' },
    { slug: 'photobooth',   label: 'Photo Booth', desc: 'Duration + multi-select themes' },
    { slug: 'live',         label: 'Live Food',   desc: 'Multi-select stations' },
    { slug: 'kids',         label: 'Kids Zone',   desc: 'Multi-select activities' },
    { slug: 'host',         label: 'Event Host',  desc: 'Single-select duration tiers' },
]

const CATEGORY_OPTIONS = ['Media', 'Entertainment', 'Catering', 'Service', 'Decor', 'Other']

// Cheap kebab-case slugifier for the auto-suggest from title.
function slugifyTitle(title) {
    return String(title || '')
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
}

const AddAddonModal = ({ isOpen, onClose, onSave, addon }) => {
    const [title, setTitle] = useState('')
    const [slug, setSlug] = useState('')
    const [slugTouched, setSlugTouched] = useState(false) // stop auto-syncing once admin edits slug manually
    const [description, setDescription] = useState('')
    const [price, setPrice] = useState('')
    const [icon, setIcon] = useState('')
    const [category, setCategory] = useState('Media')
    const [isActive, setIsActive] = useState(true)
    const [isFeatured, setIsFeatured] = useState(false)
    const [isPopular, setIsPopular] = useState(false)
    const [standardSlugs, setStandardSlugs] = useState(STANDARD_RENDERERS.map(r => r.slug))
    const [saving, setSaving] = useState(false)
    const [slugError, setSlugError] = useState('')
    // Per-field errors populated when the user clicks Save on an
    // incomplete form. Cleared as soon as they edit that field.
    const [errors, setErrors] = useState({})

    // Refresh the standard-slug list once on open. Falls back to the
    // module constant if the API is unreachable.
    useEffect(() => {
        if (!isOpen) return
        let cancelled = false
        api.get('/booking-info/addons/slugs')
            .then((res) => { if (!cancelled && Array.isArray(res.data?.slugs)) setStandardSlugs(res.data.slugs) })
            .catch(() => { /* silent fall-through */ })
        return () => { cancelled = true }
    }, [isOpen])

    // Hydrate / reset on every open.
    useEffect(() => {
        if (!isOpen) return
        if (addon) {
            setTitle(addon.title || '')
            setSlug(addon.slug || '')
            setSlugTouched(true) // existing slug — don't overwrite
            setDescription(addon.description || '')
            setPrice(addon.price ?? '')
            setIcon(addon.icon || '')
            setCategory(addon.category || 'Media')
            setIsActive(addon.isActive !== false)
            setIsFeatured(!!addon.isFeatured)
            setIsPopular(!!addon.isPopular)
        } else {
            setTitle('')
            setSlug('')
            setSlugTouched(false)
            setDescription('')
            setPrice('')
            setIcon('')
            setCategory('Media')
            setIsActive(true)
            setIsFeatured(false)
            setIsPopular(false)
        }
        setSlugError('')
    }, [isOpen, addon])

    // Auto-derive slug from title until admin edits it manually.
    useEffect(() => {
        if (slugTouched) return
        setSlug(slugifyTitle(title))
    }, [title, slugTouched])

    const isEdit = !!addon
    const matchedRenderer = useMemo(
        () => STANDARD_RENDERERS.find(r => r.slug === slug),
        [slug]
    )
    const slugIsValidShape = !slug || /^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)

    const valid = title.trim() && slug && slugIsValidShape && price !== '' && Number(price) >= 0 && !slugError

    if (!isOpen) return null

    const handleSlugChange = (v) => {
        setSlugTouched(true)
        const cleaned = v.toLowerCase().replace(/[^a-z0-9-]/g, '')
        setSlug(cleaned)
        setSlugError(cleaned && !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(cleaned)
            ? 'Use lowercase letters, digits and single hyphens only (e.g. floral-arch).'
            : '')
    }

    const handleSave = async () => {
        if (saving) return
        // Populate inline errors so the user sees what's missing instead
        // of just a disabled button.
        const errs = {}
        if (!title.trim())                                 errs.title = 'Title is required'
        if (!slug)                                         errs.slug  = 'Slug is required'
        else if (!slugIsValidShape)                        errs.slug  = 'Use lowercase letters, digits and single hyphens only (e.g. floral-arch)'
        if (price === '' || Number(price) < 0 || isNaN(Number(price))) errs.price = 'Enter a price of zero or more'
        setErrors(errs)
        if (Object.keys(errs).length) {
            const firstBad = ['title', 'price', 'slug'].find(k => errs[k])
            if (firstBad) {
                setTimeout(() => {
                    const el = document.getElementById(firstBad)
                    if (el) { try { el.focus() } catch { /* noop */ } el.scrollIntoView?.({ behavior: 'smooth', block: 'center' }) }
                }, 0)
            }
            return
        }
        if (slugError) return // slug-shape error from live validation
        setSaving(true)
        try {
            await onSave?.({
                _id: addon?._id || addon?.id,
                title: title.trim(),
                slug,
                description: description.trim(),
                price: Number(price),
                icon: icon.trim(),
                category,
                isActive,
                isFeatured,
                isPopular,
            })
            onClose()
        } finally {
            setSaving(false)
        }
    }

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center font-manrope p-4">
            <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" onClick={saving ? undefined : onClose} />

            <div className="relative w-[760px] max-w-full max-h-[92vh] bg-white rounded-[24px] shadow-2xl flex flex-col overflow-hidden">
                {/* Header */}
                <div className="px-7 py-5 bg-[#FFF8F0] flex justify-between items-center shrink-0 border-b border-orange-100">
                    <div className="min-w-0">
                        <h2 className="text-[19px] font-[700] text-[#1A181B] truncate">
                            {isEdit ? 'Edit Add-on' : 'Add New Add-on'}
                        </h2>
                        <p className="text-[12px] text-[#645E66] mt-0.5">
                            Build any add-on you offer — six standard slugs unlock rich configurators, anything else uses the simple "quantity" picker.
                        </p>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                        <button
                            type="button"
                            onClick={() => setIsActive(!isActive)}
                            title={isActive ? 'Active' : 'Inactive'}
                            className={`relative w-[48px] h-[26px] rounded-full transition-colors ${isActive ? 'bg-[#34C759]' : 'bg-gray-300'}`}
                        >
                            <div className={`absolute top-[2px] left-[2px] bg-white w-[22px] h-[22px] rounded-full transition-transform shadow-sm ${isActive ? 'translate-x-[22px]' : ''}`} />
                        </button>
                        <button
                            onClick={onClose}
                            disabled={saving}
                            aria-label="Close"
                            title={saving ? 'Wait for save to finish' : 'Close'}
                            className="text-[#645E66] hover:text-[#1A181B] p-1 disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                            <X size={22} />
                        </button>
                    </div>
                </div>

                {/* Body */}
                <div className="p-7 overflow-y-auto space-y-5">
                    {/* Title + Price */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                        <div className="md:col-span-2">
                            <label htmlFor="title" className="block text-[13px] font-semibold text-[#1A181B] mb-2">
                                Title <span className="text-rose-500" aria-hidden="true">*</span>
                            </label>
                            <input
                                id="title"
                                type="text"
                                value={title}
                                onChange={(e) => {
                                    setTitle(e.target.value)
                                    if (errors.title) setErrors(prev => ({ ...prev, title: undefined }))
                                }}
                                placeholder="e.g. Floral Arch, Magician, Balloon Decor"
                                maxLength={80}
                                aria-required="true"
                                aria-invalid={errors.title ? 'true' : 'false'}
                                aria-describedby={errors.title ? 'title-err' : undefined}
                                className={`w-full h-[46px] px-4 rounded-[10px] border focus:outline-none text-[14px] placeholder:text-[#9CA3AF] ${errors.title ? 'border-red-400 focus:border-red-500' : 'border-gray-200 focus:border-[#FE8301]'}`}
                            />
                            <div className="flex items-center justify-between mt-0.5">
                                {errors.title ? (
                                    <p id="title-err" role="alert" className="text-xs text-red-600 flex items-center gap-1">
                                        <span aria-hidden="true">⚠</span>{errors.title}
                                    </p>
                                ) : <span />}
                                <div className="text-[10px] text-gray-400">{title.length}/80</div>
                            </div>
                        </div>
                        <div>
                            <label htmlFor="price" className="block text-[13px] font-semibold text-[#1A181B] mb-2">
                                Price (₹) <span className="text-rose-500" aria-hidden="true">*</span>
                            </label>
                            <input
                                id="price"
                                type="number"
                                value={price}
                                onChange={(e) => {
                                    setPrice(e.target.value)
                                    if (errors.price) setErrors(prev => ({ ...prev, price: undefined }))
                                }}
                                placeholder="5000"
                                min={0}
                                inputMode="decimal"
                                aria-required="true"
                                aria-invalid={errors.price ? 'true' : 'false'}
                                aria-describedby={errors.price ? 'price-err' : undefined}
                                className={`w-full h-[46px] px-4 rounded-[10px] border focus:outline-none text-[14px] ${errors.price ? 'border-red-400 focus:border-red-500' : 'border-gray-200 focus:border-[#FE8301]'}`}
                            />
                            {errors.price && (
                                <p id="price-err" role="alert" className="text-xs text-red-600 mt-1 flex items-center gap-1">
                                    <span aria-hidden="true">⚠</span>{errors.price}
                                </p>
                            )}
                        </div>
                    </div>

                    {/* Slug — free text + auto-from-title + smart suggestions */}
                    <div>
                        <label htmlFor="slug" className="block text-[13px] font-semibold text-[#1A181B] mb-2">
                            Slug <span className="text-rose-500" aria-hidden="true">*</span>
                            <span className="text-[11px] font-normal text-[#9CA3AF] ml-1.5">
                                — kebab-case, used in URLs and to detect rich configurators
                            </span>
                        </label>
                        <input
                            id="slug"
                            type="text"
                            value={slug}
                            onChange={(e) => {
                                handleSlugChange(e.target.value)
                                if (errors.slug) setErrors(prev => ({ ...prev, slug: undefined }))
                            }}
                            placeholder="auto-generated from title — edit to override"
                            disabled={isEdit}
                            aria-required="true"
                            aria-invalid={(errors.slug || slugError) ? 'true' : 'false'}
                            aria-describedby={(errors.slug || slugError) ? 'slug-err' : undefined}
                            className={`w-full h-[46px] px-4 rounded-[10px] border focus:outline-none text-[14px] font-mono placeholder:text-[#9CA3AF] disabled:bg-gray-50 disabled:text-gray-500 ${(errors.slug || slugError) ? 'border-red-400 focus:border-red-500' : 'border-gray-200 focus:border-[#FE8301]'}`}
                        />
                        {(slugError || errors.slug) && (
                            <p id="slug-err" role="alert" className="text-[11px] text-rose-600 mt-1 flex items-center gap-1">
                                <span aria-hidden="true">⚠</span>{errors.slug || slugError}
                            </p>
                        )}
                        {!slugError && slug && (
                            <div className={`mt-2 inline-flex items-center gap-1.5 text-[11px] font-[600] px-2.5 py-1 rounded-full border ${
                                matchedRenderer
                                    ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                                    : 'bg-blue-50 border-blue-200 text-blue-700'
                            }`}>
                                {matchedRenderer
                                    ? <><Sparkles size={12} /> Rich configurator: <strong className="font-[700]">{matchedRenderer.label}</strong></>
                                    : <><Info size={12} /> Generic configurator: customer sees description + quantity stepper</>
                                }
                            </div>
                        )}

                        {/* Standard-renderer suggestion pills — one click
                            wires the slug to a known rich UI on the
                            customer side. Hidden on edit because changing
                            an existing slug is locked above. */}
                        {!isEdit && (
                            <div className="mt-3">
                                <div className="text-[11px] text-[#9CA3AF] mb-1.5">Quick pick — standard rich configurators:</div>
                                <div className="flex flex-wrap gap-1.5">
                                    {standardSlugs.map((s) => {
                                        const r = STANDARD_RENDERERS.find(x => x.slug === s) || { slug: s, label: s }
                                        const active = slug === s
                                        return (
                                            <button
                                                key={s}
                                                type="button"
                                                onClick={() => { setSlugTouched(true); setSlug(s); setSlugError('') }}
                                                title={r.desc}
                                                className={`text-[11px] font-[600] px-2.5 py-1 rounded-full border transition ${
                                                    active
                                                        ? 'bg-[#FE8301] border-[#FE8301] text-white'
                                                        : 'bg-white border-gray-200 text-gray-600 hover:border-[#FE8301] hover:text-[#FE8301]'
                                                }`}
                                            >
                                                {r.label}
                                            </button>
                                        )
                                    })}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Category + Icon */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                        <div>
                            <label className="block text-[13px] font-[600] text-[#1A181B] mb-2">Category</label>
                            <select
                                value={category}
                                onChange={(e) => setCategory(e.target.value)}
                                className="w-full h-[46px] px-3 rounded-[10px] border border-gray-200 focus:outline-none focus:border-[#FE8301] text-[14px] bg-white"
                            >
                                {CATEGORY_OPTIONS.map((c) => <option key={c} value={c}>{c}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="block text-[13px] font-[600] text-[#1A181B] mb-2">
                                Icon <span className="text-[11px] font-[400] text-[#9CA3AF] ml-1">(emoji, /file.svg, or URL)</span>
                            </label>
                            <input
                                type="text"
                                value={icon}
                                onChange={(e) => setIcon(e.target.value)}
                                placeholder="🎉  or  /camera.svg  or  https://..."
                                className="w-full h-[46px] px-4 rounded-[10px] border border-gray-200 focus:outline-none focus:border-[#FE8301] text-[14px] font-mono placeholder:text-[#9CA3AF]"
                            />
                        </div>
                    </div>

                    {/* Description */}
                    <div>
                        <label className="block text-[13px] font-[600] text-[#1A181B] mb-2">
                            Description
                            <span className="text-[11px] font-[400] text-[#9CA3AF] ml-1.5">
                                — shown on the customer add-on card AND in the configurator modal
                            </span>
                        </label>
                        <textarea
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            placeholder="Short blurb explaining what's included…"
                            rows={3}
                            maxLength={400}
                            className="w-full px-4 py-3 rounded-[10px] border border-gray-200 focus:outline-none focus:border-[#FE8301] text-[14px] placeholder:text-[#9CA3AF] resize-none"
                        />
                        <div className="text-[10px] text-gray-400 text-right mt-0.5">{description.length}/400</div>
                    </div>

                    {/* Featured / Popular */}
                    <div className="grid grid-cols-2 gap-3">
                        <label className={`flex items-center gap-3 p-3 rounded-[12px] border cursor-pointer transition ${isFeatured ? 'border-amber-300 bg-amber-50' : 'border-gray-200 bg-white hover:border-amber-200'}`}>
                            <input type="checkbox" checked={isFeatured} onChange={(e) => setIsFeatured(e.target.checked)} className="w-4 h-4 accent-amber-500" />
                            <Star size={16} className={isFeatured ? 'text-amber-600' : 'text-gray-400'} />
                            <div className="flex-1 min-w-0">
                                <div className="text-[13px] font-[700] text-[#1A181B]">Featured</div>
                                <div className="text-[11px] text-[#9CA3AF]">Surfaced in featured rail</div>
                            </div>
                        </label>
                        <label className={`flex items-center gap-3 p-3 rounded-[12px] border cursor-pointer transition ${isPopular ? 'border-rose-300 bg-rose-50' : 'border-gray-200 bg-white hover:border-rose-200'}`}>
                            <input type="checkbox" checked={isPopular} onChange={(e) => setIsPopular(e.target.checked)} className="w-4 h-4 accent-rose-500" />
                            <Flame size={16} className={isPopular ? 'text-rose-600' : 'text-gray-400'} />
                            <div className="flex-1 min-w-0">
                                <div className="text-[13px] font-[700] text-[#1A181B]">Popular</div>
                                <div className="text-[11px] text-[#9CA3AF]">"Popular" badge on card</div>
                            </div>
                        </label>
                    </div>
                </div>

                {/* Footer */}
                <div className="px-7 py-5 border-t border-gray-100 flex gap-3 shrink-0 bg-white">
                    <button
                        onClick={onClose}
                        disabled={saving}
                        className="flex-1 h-[48px] border-2 border-[#FE8301] text-[#FE8301] rounded-[12px] font-[700] hover:bg-orange-50 transition disabled:opacity-50"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={!valid || saving}
                        className="flex-1 h-[48px] bg-[#FE8301] text-white rounded-[12px] font-[700] flex items-center justify-center gap-2 hover:bg-[#e07400] transition disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
                    >
                        <Save size={18} strokeWidth={2.2} />
                        {saving ? 'Saving…' : isEdit ? 'Update Add-on' : 'Create Add-on'}
                    </button>
                </div>
            </div>
        </div>
    )
}

export default AddAddonModal
