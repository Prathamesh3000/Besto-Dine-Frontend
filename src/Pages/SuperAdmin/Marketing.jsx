import React, { useEffect, useState, useCallback, useRef } from 'react';
import { toast } from 'react-hot-toast';
import { Globe, Save, Phone, Mail, MessageCircle, MapPin, Share2, Image as ImageIcon, Video, Upload, Plus, Trash2, Monitor } from 'lucide-react';
import api from '../../utils/api';
import { useAuth } from '../../Context/AuthContext';
import {
    PageHeader,
    SectionCard,
    Button,
    Skeleton,
    Field,
    inputClass,
} from './components/ui';

/**
 * Marketing — edit the text/link content shown on the standalone marketing
 * site (BestoDine-Marketing). Saving here updates a platform-global
 * singleton that the marketing site reads via GET /public/site-config.
 *
 * Images on the marketing site are static assets and are intentionally NOT
 * editable here.
 */

const EMPTY = {
    brandName: '', tagline: '', logoUrl: '', demoVideoUrl: '',
    heroHeadline: '', heroSubtitle: '',
    platformShots: [],
    supportPhone: '', supportEmail: '', whatsappNumber: '', address: '',
    social: { instagram: '', facebook: '', linkedin: '', youtube: '', twitter: '' },
};

const MAX_SHOTS = 8;

const Marketing = () => {
    const { superadminLevel } = useAuth();
    const canEdit = superadminLevel === 'full';

    const [form, setForm] = useState(EMPTY);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [uploadingLogo, setUploadingLogo] = useState(false);
    const [uploadingShot, setUploadingShot] = useState(-1);
    const logoInputRef = useRef(null);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const res = await api.get('/superadmin/marketing');
            const d = res.data?.data || {};
            setForm({
                ...EMPTY,
                ...d,
                social: { ...EMPTY.social, ...(d.social || {}) },
                platformShots: Array.isArray(d.platformShots)
                    ? d.platformShots.map(s => ({ url: s.url || '', title: s.title || '', desc: s.desc || '' }))
                    : [],
            });
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to load marketing settings');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));
    const setSocial = (k) => (e) => setForm(f => ({ ...f, social: { ...f.social, [k]: e.target.value } }));

    const handleLogoUpload = async (e) => {
        const file = e.target.files?.[0];
        e.target.value = ''; // allow re-selecting the same file later
        if (!file) return;
        if (!/^image\/(jpeg|jpg|png|webp)$/.test(file.type)) {
            return toast.error('Please choose a JPG, PNG, or WebP image');
        }
        if (file.size > 5 * 1024 * 1024) {
            return toast.error('Image must be under 5MB');
        }
        setUploadingLogo(true);
        try {
            const data = new FormData();
            data.append('image', file);
            const res = await api.post('/superadmin/marketing/logo', data, {
                headers: { 'Content-Type': 'multipart/form-data' },
            });
            const url = res.data?.url;
            if (url) {
                setForm(f => ({ ...f, logoUrl: url }));
                toast.success('Logo uploaded — remember to Save changes');
            }
        } catch (err) {
            toast.error(err.response?.data?.message || 'Logo upload failed');
        } finally {
            setUploadingLogo(false);
        }
    };

    // ── Platform screenshots (CMS for the Features "A LOOK INSIDE" grid) ──
    const addShot = () =>
        setForm(f => f.platformShots.length >= MAX_SHOTS
            ? f
            : { ...f, platformShots: [...f.platformShots, { url: '', title: '', desc: '' }] });

    const removeShot = (i) =>
        setForm(f => ({ ...f, platformShots: f.platformShots.filter((_, idx) => idx !== i) }));

    const setShot = (i, k) => (e) =>
        setForm(f => ({
            ...f,
            platformShots: f.platformShots.map((s, idx) => idx === i ? { ...s, [k]: e.target.value } : s),
        }));

    const handleShotUpload = (i) => async (e) => {
        const file = e.target.files?.[0];
        e.target.value = ''; // allow re-selecting the same file later
        if (!file) return;
        if (!/^image\/(jpeg|jpg|png|webp)$/.test(file.type)) {
            return toast.error('Please choose a JPG, PNG, or WebP image');
        }
        if (file.size > 5 * 1024 * 1024) {
            return toast.error('Image must be under 5MB');
        }
        setUploadingShot(i);
        try {
            const data = new FormData();
            data.append('image', file);
            const res = await api.post('/superadmin/marketing/screenshot', data, {
                headers: { 'Content-Type': 'multipart/form-data' },
            });
            const url = res.data?.url;
            if (url) {
                setForm(f => ({
                    ...f,
                    platformShots: f.platformShots.map((s, idx) => idx === i ? { ...s, url } : s),
                }));
                toast.success('Screenshot uploaded — remember to Save changes');
            }
        } catch (err) {
            toast.error(err.response?.data?.message || 'Screenshot upload failed');
        } finally {
            setUploadingShot(-1);
        }
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            await api.put('/superadmin/marketing', form);
            toast.success('Marketing content updated');
            load();
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to save');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="px-4 sm:px-6 lg:px-8 py-6 sm:py-8 max-w-360 mx-auto">
            <PageHeader
                eyebrow="Marketing site"
                title="Marketing Content"
                description="Edit the brand name, logo, demo video, product screenshots, contact details and social links shown on the public marketing website. Changes go live within a minute."
                actions={
                    canEdit ? (
                        <Button variant="primary" icon={Save} disabled={saving || loading} onClick={handleSave}>
                            {saving ? 'Saving…' : 'Save changes'}
                        </Button>
                    ) : null
                }
            />

            {/* What this page controls — plain-language so any operator gets it */}
            <div className="mb-5 rounded-2xl border border-blue-200/70 bg-blue-50/50 px-4 py-3.5 flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-white border border-blue-200 text-blue-600 flex items-center justify-center shrink-0">
                    <Globe size={15} />
                </div>
                <div className="text-xs text-blue-900/90 leading-relaxed">
                    <span className="font-semibold">This edits the public marketing website</span> — the separate site prospects see before signing up, not the app your tenants log into. Changes go live within about a minute (the site caches this content). <span className="font-semibold">Leave any field blank</span> to keep the site's built-in default.
                </div>
            </div>

            {!canEdit && (
                <div className="mb-5 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-sm px-4 py-3">
                    You have read-only (support) access. Ask a full Super Admin to make changes.
                </div>
            )}

            {loading ? (
                <div className="space-y-4">
                    {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-40 rounded-2xl" />)}
                </div>
            ) : (
                <fieldset disabled={!canEdit || saving} className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
                    {/* Brand */}
                    <SectionCard title="Brand" subtitle="The site's name and tagline. See the live navbar preview below." icon={Globe}>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                            <Field label="Brand name">
                                <input className={inputClass} value={form.brandName} onChange={set('brandName')} placeholder="BestoDine" />
                            </Field>
                            <Field label="Tagline (optional)">
                                <input className={inputClass} value={form.tagline} onChange={set('tagline')} placeholder="Run your restaurant on autopilot" />
                            </Field>
                        </div>
                        {/* Live navbar preview — shows exactly how logo + name combine */}
                        <div className="mt-4 rounded-xl border border-gray-200 bg-gray-50/60 px-4 py-3">
                            <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-2">Navbar preview</div>
                            <div className="flex items-center gap-2.5">
                                {form.logoUrl && (
                                    <img src={form.logoUrl} alt="" className="h-7 w-auto max-w-24 object-contain" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                                )}
                                <span className="text-base font-bold tracking-tight text-gray-900">
                                    {form.brandName || 'BestoDine'}
                                </span>
                            </div>
                        </div>
                    </SectionCard>

                    {/* Media — logo + demo video */}
                    <SectionCard title="Media" subtitle="Navbar logo and the “See it in action” walkthrough video. Use full hosted URLs." icon={ImageIcon}>
                        <div className="space-y-5">
                            <Field label="Logo image (optional)" hint="upload from your device, or paste a URL — blank shows the brand name as text">
                                <div className="flex flex-col sm:flex-row gap-2">
                                    <div className="relative flex-1">
                                        <ImageIcon size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                                        <input className={`${inputClass} pl-9`} value={form.logoUrl} onChange={set('logoUrl')} placeholder="https://…/logo.png" />
                                    </div>
                                    <input
                                        ref={logoInputRef}
                                        type="file"
                                        accept="image/png,image/jpeg,image/webp"
                                        className="hidden"
                                        onChange={handleLogoUpload}
                                    />
                                    <Button
                                        variant="ghost"
                                        icon={Upload}
                                        type="button"
                                        disabled={uploadingLogo || !canEdit}
                                        onClick={() => logoInputRef.current?.click()}
                                    >
                                        {uploadingLogo ? 'Uploading…' : 'Upload'}
                                    </Button>
                                </div>
                                {form.logoUrl ? (
                                    <div className="mt-3 flex items-center gap-3">
                                        <div className="inline-flex items-center gap-2 rounded-lg bg-gray-50 border border-gray-200 px-3 py-2">
                                            <img src={form.logoUrl} alt="Logo preview" className="h-8 w-auto object-contain" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                                            <span className="text-xs text-gray-500">Preview</span>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => setForm(f => ({ ...f, logoUrl: '' }))}
                                            className="text-xs font-semibold text-rose-600 hover:underline"
                                        >
                                            Remove
                                        </button>
                                    </div>
                                ) : null}
                            </Field>
                            <Field label="Demo video URL (optional)" hint="YouTube/Vimeo embed link or a direct .mp4 file">
                                <div className="relative">
                                    <Video size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                                    <input className={`${inputClass} pl-9`} value={form.demoVideoUrl} onChange={set('demoVideoUrl')} placeholder="https://www.youtube.com/embed/… or https://…/demo.mp4" />
                                </div>
                            </Field>
                        </div>
                    </SectionCard>

                    {/* Hero copy */}
                    <SectionCard title="Hero copy (optional)" subtitle="Leave blank to keep the site's built-in headline and subtitle." icon={Globe} className="lg:col-span-2">
                        <div className="space-y-5">
                            <Field label="Hero headline">
                                <input className={inputClass} value={form.heroHeadline} onChange={set('heroHeadline')} placeholder="Run your entire restaurant on one smart platform" />
                            </Field>
                            <Field label="Hero subtitle">
                                <textarea className={`${inputClass} resize-none`} rows={2} value={form.heroSubtitle} onChange={set('heroSubtitle')} placeholder="From POS billing and QR ordering to event bookings…" />
                            </Field>
                        </div>
                    </SectionCard>

                    {/* Platform screenshots — the "A LOOK INSIDE THE PLATFORM" grid */}
                    <SectionCard
                        title="Platform screenshots"
                        subtitle={'The "A LOOK INSIDE THE PLATFORM" grid on the Features page. Leave empty to keep the site’s built-in shots.'}
                        icon={Monitor}
                        className="lg:col-span-2"
                    >
                        <div className="space-y-4">
                            {form.platformShots.length === 0 && (
                                <p className="text-sm text-gray-500">
                                    No custom screenshots yet — the marketing site is showing its built-in defaults. Add one below to take over the grid.
                                </p>
                            )}

                            {form.platformShots.map((shot, i) => (
                                <div key={i} className="rounded-xl border border-gray-200 bg-gray-50/50 p-4">
                                    <div className="flex flex-col sm:flex-row gap-4">
                                        {/* Preview + upload */}
                                        <div className="w-full sm:w-44 shrink-0">
                                            <div className="aspect-video rounded-lg overflow-hidden bg-gray-100 border border-gray-200 flex items-center justify-center">
                                                {shot.url ? (
                                                    <img src={shot.url} alt="" className="w-full h-full object-cover" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                                                ) : (
                                                    <ImageIcon size={22} className="text-gray-300" />
                                                )}
                                            </div>
                                            <label className="mt-2 inline-flex items-center gap-1.5 cursor-pointer rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50">
                                                <input
                                                    type="file"
                                                    accept="image/png,image/jpeg,image/webp"
                                                    className="hidden"
                                                    disabled={uploadingShot === i}
                                                    onChange={handleShotUpload(i)}
                                                />
                                                <Upload size={13} />
                                                {uploadingShot === i ? 'Uploading…' : 'Upload'}
                                            </label>
                                        </div>

                                        {/* Caption fields */}
                                        <div className="flex-1 space-y-3">
                                            <Field label="Image URL" hint="upload from your device, or paste a hosted URL">
                                                <div className="relative">
                                                    <ImageIcon size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                                                    <input className={`${inputClass} pl-9`} value={shot.url} onChange={setShot(i, 'url')} placeholder="https://…/screenshot.png" />
                                                </div>
                                            </Field>
                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                                <Field label="Title">
                                                    <input className={inputClass} value={shot.title} onChange={setShot(i, 'title')} placeholder="Admin dashboard & analytics" />
                                                </Field>
                                                <Field label="Caption">
                                                    <input className={inputClass} value={shot.desc} onChange={setShot(i, 'desc')} placeholder="Track sales, top items, branch performance…" />
                                                </Field>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => removeShot(i)}
                                                className="inline-flex items-center gap-1.5 text-xs font-semibold text-rose-600 hover:underline"
                                            >
                                                <Trash2 size={13} /> Remove
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ))}

                            {form.platformShots.length < MAX_SHOTS && (
                                <Button variant="ghost" icon={Plus} type="button" onClick={addShot}>
                                    Add screenshot
                                </Button>
                            )}
                            {form.platformShots.length >= MAX_SHOTS && (
                                <p className="text-xs text-gray-400">Maximum of {MAX_SHOTS} screenshots.</p>
                            )}
                        </div>
                    </SectionCard>

                    {/* Contact */}
                    <SectionCard title="Contact" subtitle="Used by the WhatsApp / call / email CTAs and the footer." icon={Phone}>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                            <Field label="WhatsApp number" hint="with country code">
                                <div className="relative">
                                    <MessageCircle size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                                    <input className={`${inputClass} pl-9`} value={form.whatsappNumber} onChange={set('whatsappNumber')} placeholder="+918459651600" />
                                </div>
                            </Field>
                            <Field label="Phone (display)">
                                <div className="relative">
                                    <Phone size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                                    <input className={`${inputClass} pl-9`} value={form.supportPhone} onChange={set('supportPhone')} placeholder="+91 84596 51600" />
                                </div>
                            </Field>
                            <Field label="Support email">
                                <div className="relative">
                                    <Mail size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                                    <input className={`${inputClass} pl-9`} value={form.supportEmail} onChange={set('supportEmail')} placeholder="support@bestodine.com" />
                                </div>
                            </Field>
                            <Field label="Address">
                                <div className="relative">
                                    <MapPin size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                                    <input className={`${inputClass} pl-9`} value={form.address} onChange={set('address')} placeholder="Pune, Maharashtra, India" />
                                </div>
                            </Field>
                        </div>
                    </SectionCard>

                    {/* Social */}
                    <SectionCard title="Social links" subtitle="Full URLs. Leave blank to hide an icon." icon={Share2}>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                            <Field label="Instagram"><input className={inputClass} value={form.social.instagram} onChange={setSocial('instagram')} placeholder="https://instagram.com/…" /></Field>
                            <Field label="Facebook"><input className={inputClass} value={form.social.facebook} onChange={setSocial('facebook')} placeholder="https://facebook.com/…" /></Field>
                            <Field label="LinkedIn"><input className={inputClass} value={form.social.linkedin} onChange={setSocial('linkedin')} placeholder="https://linkedin.com/company/…" /></Field>
                            <Field label="YouTube"><input className={inputClass} value={form.social.youtube} onChange={setSocial('youtube')} placeholder="https://youtube.com/@…" /></Field>
                        </div>
                    </SectionCard>

                </fieldset>
            )}
        </div>
    );
};

export default Marketing;
