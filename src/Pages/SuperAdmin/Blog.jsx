import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { toast } from 'react-hot-toast';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import {
    BookOpen,
    Plus,
    Search,
    Pencil,
    Trash2,
    ExternalLink,
    ImagePlus,
    Eye,
    Code2,
    Loader2,
    Clock,
    CalendarDays,
    FileText,
} from 'lucide-react';
import api from '../../utils/api';
import {
    PageHeader,
    StatCard,
    Badge,
    Button,
    Skeleton,
    EmptyState,
    ConfirmModal,
    ModalShell,
    Field,
    inputClass,
} from './components/ui';

marked.setOptions({ gfm: true, breaks: false });

const MARKETING_BASE = (import.meta.env.VITE_MARKETING_URL || 'https://bestodine.com').replace(/\/$/, '');

const slugify = (s = '') =>
    s.toLowerCase().trim()
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');

const EMPTY_FORM = {
    title: '', slug: '', description: '', content: '', tags: '',
    coverUrl: '', author: 'Team BestoDine', keyword: '', status: 'draft',
};

const fmtDate = (d) =>
    d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

const STATUS_TABS = [
    { value: '', label: 'All' },
    { value: 'published', label: 'Published' },
    { value: 'draft', label: 'Drafts' },
];

// Posts store site-relative cover paths (e.g. "/og-image.png") that belong to
// the marketing site, so resolve them against MARKETING_BASE here. Falls back
// to a branded placeholder if there's no cover or the image fails to load.
function CoverImg({ src, alt }) {
    const [err, setErr] = useState(false);
    const resolved = src
        ? (/^https?:\/\//i.test(src) ? src : `${MARKETING_BASE}${src.startsWith('/') ? '' : '/'}${src}`)
        : '';
    if (!resolved || err) {
        return (
            <div className="w-full h-full flex items-center justify-center text-orange-200">
                <FileText size={38} strokeWidth={1.5} />
            </div>
        );
    }
    return (
        <img
            src={resolved}
            alt={alt}
            loading="lazy"
            onError={() => setErr(true)}
            className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-500"
        />
    );
}

function Blog() {
    const [posts, setPosts] = useState([]);
    const [summary, setSummary] = useState({ total: 0, published: 0, draft: 0 });
    const [loading, setLoading] = useState(true);
    const [status, setStatus] = useState('');
    const [q, setQ] = useState('');

    const [editorOpen, setEditorOpen] = useState(false);
    const [editingId, setEditingId] = useState(null);
    const [form, setForm] = useState(EMPTY_FORM);
    const [slugTouched, setSlugTouched] = useState(false);
    const [saving, setSaving] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [preview, setPreview] = useState(false);

    const [deleteTarget, setDeleteTarget] = useState(null);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const params = { limit: 100 };
            if (status) params.status = status;
            if (q.trim()) params.q = q.trim();
            const res = await api.get('/superadmin/blog', { params });
            setPosts(res.data?.data || []);
            setSummary(res.data?.summary || { total: 0, published: 0, draft: 0 });
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to load blog posts');
        } finally {
            setLoading(false);
        }
    }, [status, q]);

    useEffect(() => {
        const t = setTimeout(load, q ? 300 : 0); // debounce search typing
        return () => clearTimeout(t);
    }, [load, q]);

    const openNew = () => {
        setEditingId(null);
        setForm(EMPTY_FORM);
        setSlugTouched(false);
        setPreview(false);
        setEditorOpen(true);
    };

    const openEdit = async (id) => {
        try {
            const res = await api.get(`/superadmin/blog/${id}`);
            const p = res.data?.data;
            if (!p) return;
            setEditingId(id);
            setForm({
                title: p.title || '', slug: p.slug || '', description: p.description || '',
                content: p.content || '', tags: (p.tags || []).join(', '),
                coverUrl: p.coverUrl || '', author: p.author || 'Team BestoDine',
                keyword: p.keyword || '', status: p.status || 'draft',
            });
            setSlugTouched(true);
            setPreview(false);
            setEditorOpen(true);
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to open post');
        }
    };

    const setField = (key) => (e) => {
        const value = e?.target ? e.target.value : e;
        setForm((f) => {
            const next = { ...f, [key]: value };
            if (key === 'title' && !slugTouched && !editingId) next.slug = slugify(value);
            return next;
        });
    };

    const onCoverPick = async (e) => {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (!file) return;
        if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return toast.error('Use a JPEG, PNG or WebP image');
        if (file.size > 5 * 1024 * 1024) return toast.error('Image must be under 5MB');
        setUploading(true);
        try {
            const fd = new FormData();
            fd.append('image', file);
            const res = await api.post('/superadmin/blog/cover', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
            if (res.data?.url) {
                setForm((f) => ({ ...f, coverUrl: res.data.url }));
                toast.success('Cover uploaded');
            }
        } catch (err) {
            toast.error(err.response?.data?.message || 'Cover upload failed');
        } finally {
            setUploading(false);
        }
    };

    const save = async () => {
        if (!form.title.trim()) return toast.error('Title is required');
        if (!form.description.trim()) return toast.error('Meta description is required');
        if (!form.content.trim()) return toast.error('Content is required');
        setSaving(true);
        try {
            const payload = {
                title: form.title, slug: form.slug, description: form.description,
                content: form.content, tags: form.tags, coverUrl: form.coverUrl,
                author: form.author, keyword: form.keyword, status: form.status,
            };
            if (editingId) {
                await api.patch(`/superadmin/blog/${editingId}`, payload);
                toast.success('Post updated');
            } else {
                await api.post('/superadmin/blog', payload);
                toast.success('Post created');
            }
            setEditorOpen(false);
            load();
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to save post');
        } finally {
            setSaving(false);
        }
    };

    const doDelete = async () => {
        if (!deleteTarget) return;
        try {
            await api.delete(`/superadmin/blog/${deleteTarget.id}`);
            toast.success('Post deleted');
            load();
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to delete post');
        }
    };

    const previewHtml = useMemo(
        // marked does NOT sanitize — raw <script>/<img onerror> in the
        // markdown would execute in the super-admin session. Always pass
        // its output through DOMPurify before dangerouslySetInnerHTML.
        () => (preview
            ? DOMPurify.sanitize(marked.parse(form.content || '_Nothing to preview yet._'), { USE_PROFILES: { html: true } })
            : ''),
        [preview, form.content]
    );

    const descLen = form.description.length;

    return (
        <div className="px-4 sm:px-6 lg:px-8 py-6 sm:py-8 max-w-360 mx-auto">
            <PageHeader
                eyebrow="Marketing"
                title="Blog"
                description="Write and publish articles for the marketing site. Publishing or deleting a post triggers a site rebuild so SEO stays prerendered."
                actions={<Button icon={Plus} onClick={openNew}>New post</Button>}
            />

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 mb-6">
                <StatCard label="Total" value={summary.total} icon={BookOpen} tone="brand" loading={loading} />
                <StatCard label="Published" value={summary.published} tone="success" loading={loading} />
                <StatCard label="Drafts" value={summary.draft} tone="warning" loading={loading} />
            </div>

            {/* Toolbar — search + segmented status filter */}
            <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-5">
                <div className="relative flex-1">
                    <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                        value={q}
                        onChange={(e) => setQ(e.target.value)}
                        placeholder="Search title, slug or keyword…"
                        className={`${inputClass} pl-9`}
                    />
                </div>
                <div className="inline-flex p-1 bg-[#FAF5F0] rounded-xl border border-orange-100/60 shrink-0 self-start sm:self-auto">
                    {STATUS_TABS.map((t) => {
                        const active = status === t.value;
                        return (
                            <button
                                key={t.value || 'all'}
                                type="button"
                                onClick={() => setStatus(t.value)}
                                className={`px-3.5 py-1.5 rounded-lg text-[13px] font-semibold transition-all ${
                                    active ? 'bg-white text-[#FE8301] shadow-[0_1px_3px_rgba(0,0,0,0.06)]' : 'text-gray-500 hover:text-gray-700'
                                }`}
                            >
                                {t.label}
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* List — visual card grid (cover-first, like a CMS) */}
            {loading ? (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
                    {[0, 1, 2, 3, 4, 5].map((i) => (
                        <div key={i} className="bg-white rounded-2xl border border-orange-100/60 overflow-hidden">
                            <Skeleton className="h-44 w-full rounded-none" />
                            <div className="p-5 space-y-3">
                                <Skeleton className="h-3 w-20 rounded-full" />
                                <Skeleton className="h-4 w-4/5" />
                                <Skeleton className="h-3 w-full" />
                                <Skeleton className="h-3 w-2/3" />
                            </div>
                        </div>
                    ))}
                </div>
            ) : posts.length === 0 ? (
                <EmptyState
                    icon={BookOpen}
                    title={q || status ? 'No matching posts' : 'No posts yet'}
                    description={q || status
                        ? 'Try a different search term or status filter.'
                        : "Create your first article. It won't appear on the live site until you publish it."}
                    action={!q && !status ? <Button icon={Plus} onClick={openNew}>New post</Button> : undefined}
                />
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
                    {posts.map((p) => (
                        <article
                            key={p.id}
                            className="group flex flex-col bg-white rounded-2xl border border-orange-100/60 shadow-[0_1px_2px_rgba(254,131,1,0.05)] hover:shadow-[0_12px_32px_rgba(254,131,1,0.13)] hover:border-orange-200/70 hover:-translate-y-0.5 transition-all overflow-hidden"
                        >
                            {/* Cover */}
                            <div className="relative aspect-[16/9] bg-gradient-to-br from-orange-50 to-amber-50/60 overflow-hidden">
                                <CoverImg src={p.coverUrl} alt={p.title} />
                                <span className="absolute top-3 left-3">
                                    <Badge tone={p.status === 'published' ? 'success' : 'warning'} dot className="bg-white/85 backdrop-blur-sm">
                                        {p.status}
                                    </Badge>
                                </span>
                                {p.readingTime ? (
                                    <span className="absolute bottom-3 right-3 inline-flex items-center gap-1 text-[11px] font-semibold text-gray-700 bg-white/85 backdrop-blur-sm px-2 py-1 rounded-full">
                                        <Clock size={11} strokeWidth={2.25} /> {p.readingTime} min
                                    </span>
                                ) : null}
                            </div>

                            {/* Body */}
                            <div className="flex flex-col flex-1 p-5">
                                {(p.tags || []).length > 0 && (
                                    <div className="flex flex-wrap gap-1.5 mb-2.5">
                                        {(p.tags || []).slice(0, 3).map((t) => (
                                            <span key={t} className="text-[10px] font-semibold uppercase tracking-wide text-[#FE8301] bg-orange-50 px-2 py-0.5 rounded-full">{t}</span>
                                        ))}
                                    </div>
                                )}

                                <h3 className="font-bold text-gray-900 text-[15px] leading-snug line-clamp-2">{p.title}</h3>
                                <p className="text-[11px] text-gray-400 mt-1 truncate font-mono">/blog/{p.slug}</p>

                                {p.description && (
                                    <p className="text-[13px] text-gray-500 leading-relaxed mt-2.5 line-clamp-2">{p.description}</p>
                                )}

                                {/* Footer */}
                                <div className="mt-auto pt-4 flex items-center justify-between gap-2">
                                    <div className="flex items-center gap-1.5 text-[11px] text-gray-400 min-w-0">
                                        <CalendarDays size={12} className="shrink-0" />
                                        <span className="truncate">{fmtDate(p.updatedAt)}</span>
                                    </div>
                                    <div className="flex items-center gap-1 shrink-0 -mr-1">
                                        {p.status === 'published' && (
                                            <a
                                                href={`${MARKETING_BASE}/blog/${p.slug}`}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:text-[#FE8301] hover:bg-orange-50 transition"
                                                title="View on site"
                                            >
                                                <ExternalLink size={15} />
                                            </a>
                                        )}
                                        <button
                                            onClick={() => openEdit(p.id)}
                                            className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:text-[#FE8301] hover:bg-orange-50 transition"
                                            title="Edit"
                                        >
                                            <Pencil size={15} />
                                        </button>
                                        <button
                                            onClick={() => setDeleteTarget(p)}
                                            className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:text-rose-600 hover:bg-rose-50 transition"
                                            title="Delete"
                                        >
                                            <Trash2 size={15} />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </article>
                    ))}
                </div>
            )}

            {/* Editor */}
            <ModalShell
                open={editorOpen}
                onClose={() => setEditorOpen(false)}
                title={editingId ? 'Edit post' : 'New post'}
                subtitle={editingId ? form.slug ? `/blog/${form.slug}` : '' : 'Drafts stay hidden until published'}
                icon={BookOpen}
                maxWidth="max-w-3xl"
                footer={
                    <>
                        <Button variant="ghost" onClick={() => setEditorOpen(false)} disabled={saving}>Cancel</Button>
                        <Button
                            onClick={save}
                            disabled={saving}
                            icon={saving ? Loader2 : undefined}
                            className={saving ? '[&_svg]:animate-spin' : ''}
                        >
                            {form.status === 'published' ? 'Save & publish' : 'Save draft'}
                        </Button>
                    </>
                }
            >
                <div className="p-5 sm:p-6 space-y-4">
                    <Field label="Title" required>
                        <input className={inputClass} value={form.title} onChange={setField('title')} placeholder="Best Restaurant Management Software in India (2026)" />
                    </Field>

                    <div className="grid sm:grid-cols-2 gap-4">
                        <Field label="Slug" hint="URL: /blog/<slug>">
                            <input
                                className={inputClass}
                                value={form.slug}
                                onChange={(e) => { setSlugTouched(true); setField('slug')(slugify(e.target.value)); }}
                                placeholder="best-restaurant-software"
                            />
                        </Field>
                        <Field label="Status">
                            <select className={inputClass} value={form.status} onChange={setField('status')}>
                                <option value="draft">Draft (hidden)</option>
                                <option value="published">Published (live)</option>
                            </select>
                        </Field>
                    </div>

                    <Field label="Meta description" required hint={`${descLen}/160 ideal`} error={descLen > 320 ? 'Too long (max 320)' : ''}>
                        <textarea className={`${inputClass} resize-none`} rows={2} value={form.description} onChange={setField('description')} placeholder="One-sentence summary written for the Google search snippet (~150-160 chars)." />
                    </Field>

                    {/* Cover */}
                    <Field label="Cover image" hint="JPEG/PNG/WebP, ≤5MB">
                        <div className="flex items-center gap-3">
                            <div className="w-24 h-16 rounded-xl border border-gray-200 bg-[#FAF5F0] overflow-hidden flex items-center justify-center shrink-0">
                                {form.coverUrl
                                    ? <img src={form.coverUrl} alt="cover" className="w-full h-full object-cover" />
                                    : <ImagePlus size={18} className="text-gray-300" />}
                            </div>
                            <label className="cursor-pointer">
                                <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={onCoverPick} />
                                <span className="inline-flex items-center gap-2 text-sm font-semibold px-4 py-2.5 rounded-xl bg-white text-gray-700 border border-gray-200 hover:border-[#FE8301]/40 hover:bg-orange-50 hover:text-[#FE8301] transition">
                                    {uploading ? <Loader2 size={16} className="animate-spin" /> : <ImagePlus size={16} />}
                                    {form.coverUrl ? 'Replace' : 'Upload'}
                                </span>
                            </label>
                            {form.coverUrl && (
                                <button type="button" onClick={() => setForm((f) => ({ ...f, coverUrl: '' }))} className="text-xs text-rose-600 font-semibold hover:underline">
                                    Remove
                                </button>
                            )}
                        </div>
                    </Field>

                    {/* Body — markdown with preview toggle */}
                    <div>
                        <div className="flex items-center justify-between mb-1.5">
                            <span className="text-xs font-semibold text-gray-700">Content <span className="text-rose-500">*</span> <span className="text-gray-400 font-normal">(Markdown)</span></span>
                            <button
                                type="button"
                                onClick={() => setPreview((v) => !v)}
                                className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-gray-500 hover:text-[#FE8301] transition"
                            >
                                {preview ? <Code2 size={13} /> : <Eye size={13} />}
                                {preview ? 'Write' : 'Preview'}
                            </button>
                        </div>
                        {preview ? (
                            <div
                                className="prose prose-sm max-w-none border border-gray-200 rounded-xl px-4 py-3 min-h-[260px] bg-[#FFFDFB] text-gray-700 [&_h2]:font-bold [&_h2]:text-gray-900 [&_h2]:mt-4 [&_h2]:mb-1 [&_h3]:font-semibold [&_h3]:text-gray-900 [&_a]:text-[#FE8301] [&_a]:underline [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:my-2 [&_strong]:text-gray-900"
                                dangerouslySetInnerHTML={{ __html: previewHtml }}
                            />
                        ) : (
                            <textarea
                                className={`${inputClass} font-mono text-[13px] leading-relaxed`}
                                rows={14}
                                value={form.content}
                                onChange={setField('content')}
                                placeholder={'## A heading\n\nWrite your article in **Markdown**.\n\n- Bullet points\n- [Internal link](/pricing)\n'}
                            />
                        )}
                    </div>

                    <div className="grid sm:grid-cols-2 gap-4">
                        <Field label="Tags" hint="comma-separated, max 8">
                            <input className={inputClass} value={form.tags} onChange={setField('tags')} placeholder="POS, QR Ordering, Guides" />
                        </Field>
                        <Field label="Author">
                            <input className={inputClass} value={form.author} onChange={setField('author')} placeholder="Team BestoDine" />
                        </Field>
                    </div>

                    <Field label="Target keyword" hint="editorial only — not shown on the page">
                        <input className={inputClass} value={form.keyword} onChange={setField('keyword')} placeholder="restaurant management software india" />
                    </Field>
                </div>
            </ModalShell>

            <ConfirmModal
                open={!!deleteTarget}
                onClose={() => setDeleteTarget(null)}
                onConfirm={doDelete}
                title="Delete this post?"
                description={deleteTarget ? `"${deleteTarget.title}" will be permanently removed${deleteTarget.status === 'published' ? ' and the site will rebuild' : ''}.` : ''}
                confirmLabel="Delete"
                danger
            />
        </div>
    );
}

export default Blog;
