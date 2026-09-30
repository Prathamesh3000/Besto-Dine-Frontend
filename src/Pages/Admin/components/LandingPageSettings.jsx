import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Save, Upload, Trash2, ArrowLeft, ArrowRight, Search, X, Loader2, Lock, Instagram, Facebook, Globe, MessageCircle, MapPin } from 'lucide-react'
import { toast } from 'react-hot-toast'
import { useQuery } from '@tanstack/react-query'
import api, { menuSearchAPI } from '../../../utils/api'
import { resolveImageUrl, sizedImage } from '../../../utils/image'
import { restaurantLink } from '../../../utils/customerLinks'
import ToggleSwitch from '../../../Components/Common/ToggleSwitch'
import ShareLinkPanel from '../../../Components/Common/ShareLinkPanel'
import VegBadge from '../../../Components/Common/VegBadge'

/**
 * Admin → Settings → "Landing Page": customises the public restaurant
 * page at /<slug> (Pages/Restaurant/RestaurantLandingPage.jsx).
 * Saved through PATCH /settings/landingPage by the parent's onSave.
 */

const LANDING_LIMITS = { tagline: 120, about: 2000, coverImages: 6, featuredItems: 8 }
const DEFAULT_ACCENT = '#FE8301'
const ACCENT_PRESETS = ['#FE8301', '#E11D48', '#D97706', '#16A34A', '#0D9488', '#2563EB', '#7C3AED', '#702083', '#1F2937']
const HEX_RE = /^#[0-9a-fA-F]{6}$/

const SECTION_OPTIONS = [
    { key: 'featured', label: 'Featured dishes', hint: 'Horizontal strip of the dishes you pick below' },
    { key: 'about', label: 'About', hint: 'Your story, from the About text' },
    { key: 'hours', label: 'Opening hours', hint: 'From General → Operating Hours, today highlighted' },
    { key: 'location', label: 'Location & contact', hint: 'Address, Get directions and Call buttons' },
    { key: 'branches', label: 'Branches', hint: 'Links to each branch page (shown with 2+ branches)' },
    { key: 'gallery', label: 'Gallery', hint: 'Grid of your cover images (shown with 2+ images)' },
]

const SOCIAL_FIELDS = [
    { key: 'instagram', label: 'Instagram', icon: Instagram, placeholder: 'https://instagram.com/yourcafe or @yourcafe' },
    { key: 'facebook', label: 'Facebook', icon: Facebook, placeholder: 'https://facebook.com/yourcafe' },
    { key: 'whatsapp', label: 'WhatsApp', icon: MessageCircle, placeholder: 'Phone number or https://wa.me/…' },
    { key: 'website', label: 'Website', icon: Globe, placeholder: 'https://yourcafe.com' },
    { key: 'googleMapsUrl', label: 'Google Maps link', icon: MapPin, placeholder: 'https://maps.app.goo.gl/…' },
]

const idOf = (v) => (v && typeof v === 'object' ? String(v._id || v.id || '') : String(v || ''))

function normalizeInitial(lp = {}) {
    const sections = lp.sections || {}
    return {
        enabled: lp.enabled !== false,
        tagline: lp.tagline || '',
        about: lp.about || '',
        coverImages: Array.isArray(lp.coverImages) ? lp.coverImages.filter(Boolean).slice(0, LANDING_LIMITS.coverImages) : [],
        social: {
            instagram: lp.social?.instagram || '',
            facebook: lp.social?.facebook || '',
            website: lp.social?.website || '',
            whatsapp: lp.social?.whatsapp || '',
            googleMapsUrl: lp.social?.googleMapsUrl || '',
        },
        sections: Object.fromEntries(SECTION_OPTIONS.map(({ key }) => [key, sections[key] !== false])),
        accentColor: HEX_RE.test(lp.accentColor || '') ? lp.accentColor : DEFAULT_ACCENT,
    }
}

const cardCls = 'bg-white rounded-xl border border-gray-200 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)] p-4 md:p-6'
const inputCls = 'w-full px-3.5 py-2.5 border border-gray-200 rounded-[10px] text-[14px] text-[#1A181B] focus:outline-none focus:border-[#FE8301] focus:ring-2 focus:ring-[#FE8301]/10'

const Card = ({ title, description, children, right = null }) => (
    <div className={cardCls}>
        <div className="flex items-start justify-between gap-4 mb-4">
            <div>
                <h2 className="text-[16px] font-[600] text-[#1A181B]">{title}</h2>
                {description && <p className="text-[12px] text-[#9CA3AF] font-[500] mt-0.5">{description}</p>}
            </div>
            {right}
        </div>
        {children}
    </div>
)

const Counter = ({ value, max }) => (
    <span className={`text-[11px] font-[600] ${value.length > max ? 'text-red-600' : 'text-[#9CA3AF]'}`}>
        {value.length}/{max}
    </span>
)

const LandingPageSettings = ({ initial, slug, onSave, isSaving = false, readOnly = false }) => {
    const [form, setForm] = useState(() => normalizeInitial(initial))
    const [uploading, setUploading] = useState(false)
    const fileRef = useRef(null)

    // Featured dishes — chips hold {_id, name, vegType, image}.
    const initialFeatured = useMemo(() => (Array.isArray(initial?.featuredItems) ? initial.featuredItems : []), [initial])
    const [featured, setFeatured] = useState(() => initialFeatured
        .filter(v => v && typeof v === 'object' && v.name)
        .map(v => ({ _id: idOf(v), name: v.name, vegType: v.vegType, image: v.image })))
    const [menuQuery, setMenuQuery] = useState('')

    // GET /settings may return featuredItems as bare ids — resolve names once.
    useEffect(() => {
        const ids = initialFeatured.map(idOf).filter(Boolean)
        if (!ids.length || initialFeatured.every(v => v && typeof v === 'object' && v.name)) return undefined
        let cancelled = false
        menuSearchAPI.list({ ids: ids.join(','), limit: LANDING_LIMITS.featuredItems, status: 'All Status' })
            .then(res => {
                if (cancelled) return
                const byId = new Map((res.data?.data || []).map(m => [String(m._id), m]))
                // Keep the saved order; drop ids that no longer exist.
                setFeatured(ids.filter(id => byId.has(id)).map(id => {
                    const m = byId.get(id)
                    return { _id: id, name: m.name, vegType: m.vegType, image: m.image || m.images?.[0] }
                }))
            })
            .catch(() => { /* chips just stay empty; admin can re-pick */ })
        return () => { cancelled = true }
    }, [initialFeatured])

    // Debounced menu search for the picker.
    const [debouncedQuery, setDebouncedQuery] = useState('')
    useEffect(() => {
        const timer = setTimeout(() => setDebouncedQuery(menuQuery.trim()), 300)
        return () => clearTimeout(timer)
    }, [menuQuery])
    const { data: menuResults = [], isFetching: menuFetching } = useQuery({
        queryKey: ['landing-featured-search', debouncedQuery],
        queryFn: () => menuSearchAPI.list({ search: debouncedQuery, limit: 10 }).then(res => res.data?.data || []),
        enabled: Boolean(debouncedQuery),
        staleTime: 30 * 1000,
    })
    const menuLoading = menuQuery.trim() !== debouncedQuery || menuFetching

    const set = (key, value) => setForm(prev => ({ ...prev, [key]: value }))
    const setSocial = (key, value) => setForm(prev => ({ ...prev, social: { ...prev.social, [key]: value } }))
    const toggleSection = (key) => setForm(prev => ({ ...prev, sections: { ...prev.sections, [key]: !prev.sections[key] } }))

    // ── Cover images ────────────────────────────────────────────────────
    const handleUpload = async (e) => {
        const files = Array.from(e.target.files || [])
        e.target.value = ''
        if (!files.length) return
        const room = LANDING_LIMITS.coverImages - form.coverImages.length
        if (room <= 0) { toast.error(`You can add up to ${LANDING_LIMITS.coverImages} cover images`); return }
        if (files.length > room) toast(`Only the first ${room} image${room > 1 ? 's' : ''} will be added (max ${LANDING_LIMITS.coverImages}).`)
        setUploading(true)
        const added = []
        for (const file of files.slice(0, room)) {
            if (file.size > 5 * 1024 * 1024) { toast.error(`${file.name} is larger than 5MB`); continue }
            const fd = new FormData()
            fd.append('image', file)
            try {
                // Same endpoint as the General tab's logo / banner uploads.
                const res = await api.post('/upload', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
                const url = resolveImageUrl(res.data?.url) || res.data?.url
                if (url) added.push(url)
            } catch {
                toast.error(`Upload failed for ${file.name}`)
            }
        }
        if (added.length) {
            setForm(prev => ({ ...prev, coverImages: [...prev.coverImages, ...added].slice(0, LANDING_LIMITS.coverImages) }))
            toast.success(added.length > 1 ? `${added.length} images uploaded` : 'Image uploaded')
        }
        setUploading(false)
    }
    const moveImage = (index, delta) => setForm(prev => {
        const next = [...prev.coverImages]
        const target = index + delta
        if (target < 0 || target >= next.length) return prev
        ;[next[index], next[target]] = [next[target], next[index]]
        return { ...prev, coverImages: next }
    })
    const removeImage = (index) => setForm(prev => ({ ...prev, coverImages: prev.coverImages.filter((_, i) => i !== index) }))

    // ── Featured dishes ─────────────────────────────────────────────────
    const featuredIds = new Set(featured.map(f => f._id))
    const addFeatured = (item) => {
        const id = idOf(item)
        if (!id || featuredIds.has(id)) return
        if (featured.length >= LANDING_LIMITS.featuredItems) { toast.error(`Pick up to ${LANDING_LIMITS.featuredItems} dishes`); return }
        setFeatured(prev => [...prev, { _id: id, name: item.name, vegType: item.vegType, image: item.image || item.images?.[0] }])
    }
    const removeFeatured = (id) => setFeatured(prev => prev.filter(f => f._id !== id))

    // ── Save ────────────────────────────────────────────────────────────
    const handleSave = () => {
        if (readOnly) return
        const tagline = form.tagline.trim()
        const about = form.about.trim()
        if (tagline.length > LANDING_LIMITS.tagline) { toast.error(`Tagline must be ${LANDING_LIMITS.tagline} characters or fewer`); return }
        if (about.length > LANDING_LIMITS.about) { toast.error(`About must be ${LANDING_LIMITS.about} characters or fewer`); return }
        if (!HEX_RE.test(form.accentColor)) { toast.error('Accent colour must be a hex value like #FE8301'); return }
        onSave?.({
            enabled: form.enabled,
            tagline,
            about,
            coverImages: form.coverImages.slice(0, LANDING_LIMITS.coverImages),
            social: Object.fromEntries(Object.entries(form.social).map(([k, v]) => [k, String(v || '').trim()])),
            featuredItems: featured.map(f => f._id).slice(0, LANDING_LIMITS.featuredItems),
            sections: form.sections,
            accentColor: form.accentColor.toUpperCase(),
        })
    }

    const pageUrl = slug ? restaurantLink(slug) : ''

    return (
        <div className="space-y-4 pb-10">
            {readOnly ? (
                <div className="flex items-start gap-3 px-4 py-3 rounded-xl bg-[#F9FAFB] border border-gray-200">
                    <Lock size={16} className="text-[#6B7280] shrink-0 mt-0.5" />
                    <p className="text-[13px] text-[#374151]">
                        <span className="font-[600]">Managed by the main restaurant admin.</span>{' '}
                        The landing page is shared by all branches, so only the main admin can change it.
                    </p>
                </div>
            ) : (
            <div className="flex justify-end">
                <button
                    disabled={isSaving || uploading}
                    onClick={handleSave}
                    className="flex items-center gap-2 px-4 py-2 bg-[#FE8301] text-white rounded-[10px] text-[14px] font-[600] hover:bg-orange-600 transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    <Save size={18} strokeWidth={2.5} />
                    {isSaving ? 'Saving...' : 'Save Landing Page'}
                </button>
            </div>
            )}

            {/* Link + QR */}
            <Card
                title="Your page link"
                description="Share it on Instagram, WhatsApp or Google Maps, or print the QR code for flyers and your storefront."
            >
                {pageUrl ? (
                    <ShareLinkPanel
                        url={pageUrl}
                        qrFileName={`${slug}-landing-qr`}
                        note={form.enabled ? null : 'Your landing page is switched off, so visitors see a simple contact card with a View Menu button.'}
                    />
                ) : (
                    <p className="text-[13px] text-[#9CA3AF]">Your restaurant link will appear here once your account has a restaurant slug.</p>
                )}
            </Card>

            {/* Everything below is editable only by the main admin. */}
            <fieldset disabled={readOnly} className={`space-y-4 min-w-0 ${readOnly ? 'opacity-80' : ''}`}>
            {/* Enable + text */}
            <Card
                title="Landing page"
                description="A public page for your restaurant with your photos, dishes, hours and ways to order."
                right={<ToggleSwitch checked={form.enabled} onChange={(e) => set('enabled', e.target.checked)} ariaLabel="Enable landing page" />}
            >
                <div className={`space-y-4 ${form.enabled ? '' : 'opacity-60'}`}>
                    <div>
                        <div className="flex items-center justify-between mb-1.5">
                            <label htmlFor="lp-tagline" className="text-[13px] font-[600] text-[#374151]">Tagline</label>
                            <Counter value={form.tagline} max={LANDING_LIMITS.tagline} />
                        </div>
                        <input
                            id="lp-tagline"
                            type="text"
                            value={form.tagline}
                            maxLength={LANDING_LIMITS.tagline}
                            onChange={(e) => set('tagline', e.target.value)}
                            placeholder="Wood-fired pizzas & slow coffee since 2015"
                            className={inputCls}
                        />
                    </div>
                    <div>
                        <div className="flex items-center justify-between mb-1.5">
                            <label htmlFor="lp-about" className="text-[13px] font-[600] text-[#374151]">About</label>
                            <Counter value={form.about} max={LANDING_LIMITS.about} />
                        </div>
                        <textarea
                            id="lp-about"
                            rows={5}
                            value={form.about}
                            maxLength={LANDING_LIMITS.about}
                            onChange={(e) => set('about', e.target.value)}
                            placeholder="Tell guests what makes your place special — your story, cuisine, ambience."
                            className={`${inputCls} resize-y`}
                        />
                    </div>
                </div>
            </Card>

            {/* Cover images */}
            <Card
                title="Cover images"
                description={`Shown as a carousel at the top of your page — the first image leads. Up to ${LANDING_LIMITS.coverImages}; landscape photos work best.`}
                right={<span className="text-[12px] font-[600] text-[#9CA3AF] whitespace-nowrap">{form.coverImages.length}/{LANDING_LIMITS.coverImages}</span>}
            >
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {form.coverImages.map((src, i) => (
                        <div key={`${i}-${src}`} className="relative group rounded-xl overflow-hidden border border-gray-200 bg-gray-50 aspect-[16/10]">
                            <img src={sizedImage(resolveImageUrl(src) || src, { w: 240 })} alt={`Cover ${i + 1}`} loading="lazy" className="w-full h-full object-cover" />
                            {i === 0 && (
                                <span className="absolute top-2 left-2 px-2 py-0.5 rounded-full bg-black/60 text-white text-[10px] font-[600]">Main</span>
                            )}
                            <div className="absolute bottom-0 inset-x-0 p-1.5 flex justify-between gap-1 bg-gradient-to-t from-black/60 to-transparent">
                                <div className="flex gap-1">
                                    <button type="button" onClick={() => moveImage(i, -1)} disabled={i === 0} aria-label="Move earlier" className="p-1.5 rounded-lg bg-white/90 text-gray-700 disabled:opacity-40">
                                        <ArrowLeft size={14} />
                                    </button>
                                    <button type="button" onClick={() => moveImage(i, 1)} disabled={i === form.coverImages.length - 1} aria-label="Move later" className="p-1.5 rounded-lg bg-white/90 text-gray-700 disabled:opacity-40">
                                        <ArrowRight size={14} />
                                    </button>
                                </div>
                                <button type="button" onClick={() => removeImage(i)} aria-label="Remove image" className="p-1.5 rounded-lg bg-white/90 text-red-600">
                                    <Trash2 size={14} />
                                </button>
                            </div>
                        </div>
                    ))}
                    {form.coverImages.length < LANDING_LIMITS.coverImages && (
                        <button
                            type="button"
                            onClick={() => fileRef.current?.click()}
                            disabled={uploading}
                            className="aspect-[16/10] rounded-xl border border-dashed border-gray-300 flex flex-col items-center justify-center gap-2 text-[#6B7280] hover:border-[#FE8301] hover:text-[#FE8301] transition-colors disabled:opacity-60"
                        >
                            {uploading ? <Loader2 size={22} className="animate-spin" /> : <Upload size={22} strokeWidth={1.5} />}
                            <span className="text-[12px] text-center leading-snug px-2">
                                {uploading ? 'Uploading…' : <>Add images<br /><span className="text-[11px] text-[#9CA3AF]">PNG, JPG up to 5MB</span></>}
                            </span>
                        </button>
                    )}
                </div>
                <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={handleUpload} />
            </Card>

            {/* Featured dishes */}
            <Card
                title="Featured dishes"
                description={`Pick up to ${LANDING_LIMITS.featuredItems} dishes to show off. Prices and offers come from your menu.`}
                right={<span className="text-[12px] font-[600] text-[#9CA3AF] whitespace-nowrap">{featured.length}/{LANDING_LIMITS.featuredItems}</span>}
            >
                {featured.length > 0 && (
                    <div className="flex flex-wrap gap-2 mb-4">
                        {featured.map(f => (
                            <span key={f._id} className="inline-flex items-center gap-2 pl-1.5 pr-2 py-1 rounded-full bg-orange-50 border border-orange-100 text-[13px] font-[600] text-[#1A181B]">
                                {f.image ? (
                                    <img src={sizedImage(resolveImageUrl(f.image) || f.image, { w: 32 })} alt="" className="w-6 h-6 rounded-full object-cover" />
                                ) : (
                                    f.vegType && <VegBadge vegType={f.vegType} size="xs" />
                                )}
                                {f.name}
                                <button type="button" onClick={() => removeFeatured(f._id)} aria-label={`Remove ${f.name}`} className="p-0.5 rounded-full text-gray-500 hover:bg-orange-100 hover:text-red-600">
                                    <X size={13} />
                                </button>
                            </span>
                        ))}
                    </div>
                )}
                <div className="relative">
                    <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                        type="text"
                        value={menuQuery}
                        onChange={(e) => setMenuQuery(e.target.value)}
                        placeholder={featured.length >= LANDING_LIMITS.featuredItems ? 'Remove a dish to add another' : 'Search your menu…'}
                        disabled={featured.length >= LANDING_LIMITS.featuredItems}
                        className={`${inputCls} pl-9 disabled:bg-gray-50`}
                    />
                    {menuLoading && <Loader2 size={16} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-gray-400" />}
                </div>
                {menuQuery.trim() && !menuLoading && (
                    <ul className="mt-2 max-h-64 overflow-y-auto rounded-[10px] border border-gray-100 divide-y divide-gray-100">
                        {menuResults.length === 0 && (
                            <li className="px-3.5 py-3 text-[13px] text-[#9CA3AF]">No dishes match “{menuQuery.trim()}”</li>
                        )}
                        {menuResults.map(item => {
                            const picked = featuredIds.has(idOf(item))
                            const img = item.image || item.images?.[0]
                            return (
                                <li key={item._id}>
                                    <button
                                        type="button"
                                        onClick={() => (picked ? removeFeatured(idOf(item)) : addFeatured(item))}
                                        className={`w-full flex items-center gap-3 px-3.5 py-2.5 text-left hover:bg-gray-50 ${picked ? 'bg-orange-50/60' : ''}`}
                                    >
                                        {img ? (
                                            <img src={sizedImage(resolveImageUrl(img) || img, { w: 40 })} alt="" className="w-9 h-9 rounded-lg object-cover bg-gray-100" />
                                        ) : (
                                            <span className="w-9 h-9 rounded-lg bg-gray-100" />
                                        )}
                                        <span className="flex-1 min-w-0">
                                            <span className="flex items-center gap-1.5">
                                                {item.vegType && <VegBadge vegType={item.vegType} size="xs" />}
                                                <span className="text-[14px] font-[600] text-[#1A181B] truncate">{item.name}</span>
                                            </span>
                                            {item.category?.name && <span className="block text-[12px] text-[#9CA3AF] truncate">{item.category.name}</span>}
                                        </span>
                                        <span className={`text-[12px] font-[600] ${picked ? 'text-[#FE8301]' : 'text-[#6B7280]'}`}>{picked ? 'Added ✓' : 'Add'}</span>
                                    </button>
                                </li>
                            )
                        })}
                    </ul>
                )}
            </Card>

            {/* Sections */}
            <Card title="Sections" description="Choose which blocks appear on your page. Sections without content are hidden automatically.">
                <div className="divide-y divide-gray-100 -my-2">
                    {SECTION_OPTIONS.map(({ key, label, hint }) => (
                        <div key={key} className="py-3 flex items-center justify-between gap-4">
                            <div>
                                <p className="text-[14px] font-[600] text-[#1A181B]">{label}</p>
                                <p className="text-[12px] text-[#9CA3AF] font-[500]">{hint}</p>
                            </div>
                            <ToggleSwitch checked={form.sections[key]} onChange={() => toggleSection(key)} ariaLabel={`Show ${label}`} />
                        </div>
                    ))}
                </div>
            </Card>

            {/* Social links */}
            <Card title="Social links" description="Shown as buttons on your page. Leave blank to hide.">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {SOCIAL_FIELDS.map(({ key, label, placeholder, icon }) => {
                        const Icon = icon
                        return (
                            <div key={key}>
                                <label htmlFor={`lp-social-${key}`} className="flex items-center gap-1.5 text-[13px] font-[600] text-[#374151] mb-1.5">
                                    <Icon size={14} className="text-[#6B7280]" /> {label}
                                </label>
                                <input
                                    id={`lp-social-${key}`}
                                    type="text"
                                    value={form.social[key]}
                                    onChange={(e) => setSocial(key, e.target.value)}
                                    placeholder={placeholder}
                                    className={inputCls}
                                />
                            </div>
                        )
                    })}
                </div>
            </Card>

            {/* Accent colour */}
            <Card title="Accent colour" description="Used for buttons and highlights on your page.">
                <div className="flex flex-wrap items-center gap-2.5">
                    {ACCENT_PRESETS.map(c => {
                        const active = form.accentColor.toLowerCase() === c.toLowerCase()
                        return (
                            <button
                                key={c}
                                type="button"
                                onClick={() => set('accentColor', c)}
                                aria-label={`Use ${c}`}
                                aria-pressed={active}
                                className={`w-9 h-9 rounded-full border-2 transition-transform ${active ? 'border-[#1A181B] scale-110' : 'border-white shadow-[0_0_0_1px_#E5E7EB]'}`}
                                style={{ backgroundColor: c }}
                            />
                        )
                    })}
                    <label className="flex items-center gap-2 ml-1">
                        <input
                            type="color"
                            value={HEX_RE.test(form.accentColor) ? form.accentColor : DEFAULT_ACCENT}
                            onChange={(e) => set('accentColor', e.target.value.toUpperCase())}
                            className="w-9 h-9 rounded-lg border border-gray-200 cursor-pointer bg-white p-0.5"
                            aria-label="Custom colour"
                        />
                        <input
                            type="text"
                            value={form.accentColor}
                            onChange={(e) => set('accentColor', e.target.value.trim())}
                            maxLength={7}
                            className={`${inputCls} w-[110px] font-mono uppercase ${HEX_RE.test(form.accentColor) ? '' : 'border-red-300'}`}
                            aria-label="Accent colour hex"
                        />
                    </label>
                </div>
                <div className="mt-4 flex items-center gap-3">
                    <span
                        className="px-4 py-2 rounded-xl text-[13px] font-[700] text-white"
                        style={{ backgroundColor: HEX_RE.test(form.accentColor) ? form.accentColor : DEFAULT_ACCENT }}
                    >
                        View Menu
                    </span>
                    <span className="text-[12px] text-[#9CA3AF]">Preview</span>
                </div>
            </Card>
            </fieldset>
        </div>
    )
}

export default LandingPageSettings
