import React, { useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import {
    Inbox,
    MessageCircle,
    Phone,
    Mail,
    Clock4,
    Search,
    StickyNote,
    Store,
    Trash2,
    CheckCircle2,
} from 'lucide-react';
import api from '../../utils/api';
import { useAuth } from '../../Context/AuthContext';
import CreateRestaurantModal from './components/CreateRestaurantModal';
import {
    PageHeader,
    SectionCard,
    Badge,
    Button,
    Skeleton,
    EmptyState,
    ConfirmModal,
    PromptModal,
    inputClass,
} from './components/ui';

/**
 * Leads — prospects captured by the standalone marketing site
 * (BestoDine-Marketing) via POST /api/v1/public/lead. This is the Super
 * Admin end of the single wire between the marketing site and the product:
 * a prospect fills the demo / contact form, it lands here, and the operator
 * follows up (WhatsApp / call), records progress, and finally converts the
 * lead into a real Restaurant via the existing create-restaurant flow.
 */

// The lead pipeline, in order. Each stage doubles as a filter card and
// explains in one line what it means — so any operator gets the funnel
// at a glance: New → Contacted → Demoed → Converted (or Lost).
const STAGES = [
    { key: 'all',       label: 'All leads', tone: 'slate',   help: 'Everything in the pipeline' },
    { key: 'new',       label: 'New',       tone: 'amber',   help: 'Need first contact' },
    { key: 'contacted', label: 'Contacted', tone: 'blue',    help: 'Reached out' },
    { key: 'demoed',    label: 'Demoed',    tone: 'indigo',  help: 'Saw a demo' },
    { key: 'converted', label: 'Converted', tone: 'emerald', help: 'Became a tenant' },
    { key: 'lost',      label: 'Lost',      tone: 'rose',    help: "Didn't proceed" },
];

const STAGE_DOT = {
    slate: 'bg-gray-400', amber: 'bg-amber-500', blue: 'bg-blue-500',
    indigo: 'bg-indigo-500', emerald: 'bg-emerald-500', rose: 'bg-rose-500',
};
const STAGE_ACTIVE_RING = {
    slate: 'border-gray-300 bg-gray-50/60', amber: 'border-amber-300 bg-amber-50/50',
    blue: 'border-blue-300 bg-blue-50/50', indigo: 'border-indigo-300 bg-indigo-50/50',
    emerald: 'border-emerald-300 bg-emerald-50/50', rose: 'border-rose-300 bg-rose-50/50',
};

const STATUS_TONE = {
    new:       'warning',
    contacted: 'info',
    demoed:    'indigo',
    converted: 'success',
    lost:      'slate',
};

// Next-status quick actions available from a row, by current status.
const NEXT_ACTIONS = {
    new:       [{ to: 'contacted', label: 'Mark Contacted' }, { to: 'lost', label: 'Lost' }],
    contacted: [{ to: 'demoed', label: 'Mark Demoed' }, { to: 'lost', label: 'Lost' }],
    demoed:    [{ to: 'lost', label: 'Lost' }],
    converted: [],
    lost:      [{ to: 'new', label: 'Reopen' }],
};

const fmtRelative = (iso) => {
    if (!iso) return '—';
    const ms = Date.now() - new Date(iso).getTime();
    const m = Math.floor(ms / 60000);
    if (m < 1) return 'just now';
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    const d = Math.floor(h / 24);
    if (d < 30) return `${d}d ago`;
    return new Date(iso).toLocaleDateString();
};

// Strip to digits + ensure a country code for wa.me / tel links.
const waNumber = (phone) => {
    const d = (phone || '').replace(/[^\d]/g, '');
    return d.length === 10 ? `91${d}` : d;
};

const Leads = () => {
    const { superadminLevel } = useAuth();
    const isFull = superadminLevel === 'full';

    const [leads, setLeads] = useState([]);
    const [counts, setCounts] = useState({ all: 0, new: 0, contacted: 0, demoed: 0, converted: 0, lost: 0 });
    const [loading, setLoading] = useState(true);
    const [status, setStatus] = useState('all');
    // ?search= prefill (linked from the signup review page's lead checks).
    const [searchParams] = useSearchParams();
    const [search, setSearch] = useState(() => searchParams.get('search') || '');
    const [busyId, setBusyId] = useState('');

    const [noteFor, setNoteFor] = useState(null);   // lead id awaiting a note
    const [deleteFor, setDeleteFor] = useState(null); // lead id awaiting delete confirm
    const [convertLead, setConvertLead] = useState(null); // lead object → create modal

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const params = {};
            if (status !== 'all') params.status = status;
            if (search.trim()) params.search = search.trim();
            const res = await api.get('/superadmin/leads', { params });
            setLeads(res.data?.data?.leads || []);
            setCounts(res.data?.data?.counts || {});
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to load leads');
        } finally {
            setLoading(false);
        }
    }, [status, search]);

    // Debounce search; status changes apply immediately.
    useEffect(() => {
        const t = setTimeout(load, search ? 350 : 0);
        return () => clearTimeout(t);
    }, [load, search]);

    const patchLead = async (id, body, successMsg) => {
        setBusyId(id);
        try {
            await api.patch(`/superadmin/leads/${id}`, body);
            if (successMsg) toast.success(successMsg);
            load();
        } catch (err) {
            toast.error(err.response?.data?.message || 'Update failed');
        } finally {
            setBusyId('');
        }
    };

    const handleDelete = async (id) => {
        setBusyId(id);
        try {
            await api.delete(`/superadmin/leads/${id}`);
            toast.success('Lead deleted');
            load();
        } catch (err) {
            toast.error(err.response?.data?.message || 'Delete failed');
        } finally {
            setBusyId('');
        }
    };

    // After a restaurant is created from a lead, link + mark converted.
    const handleConverted = async (created) => {
        const lead = convertLead;
        setConvertLead(null);
        const restaurantId = created?.restaurant?._id;
        if (lead?._id) {
            await patchLead(
                lead._id,
                { status: 'converted', ...(restaurantId ? { convertedToRestaurant: restaurantId } : {}) },
                'Lead converted to a restaurant',
            );
        }
    };

    const totalLeads = counts.all || 0;
    const convRate = totalLeads ? Math.round(((counts.converted || 0) / totalLeads) * 100) : 0;

    return (
        <div className="px-4 sm:px-6 lg:px-8 py-6 sm:py-8 max-w-360 mx-auto">
            <PageHeader
                eyebrow="Growth pipeline"
                title="Leads"
                description="Prospects captured by the marketing site's demo / contact forms. Follow up over WhatsApp or call, move them through the pipeline, and convert the winners into tenants."
                actions={
                    !loading && (counts.all || 0) > 0 ? (
                        <Badge tone={convRate >= 20 ? 'success' : convRate >= 10 ? 'warning' : 'slate'} dot>
                            {convRate}% converted
                        </Badge>
                    ) : null
                }
            />

            {/* ── Pipeline funnel — cards double as filters ────────────── */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-5">
                {STAGES.map(s => {
                    const active = status === s.key;
                    const n = counts[s.key] || 0;
                    return (
                        <button
                            key={s.key}
                            type="button"
                            onClick={() => setStatus(s.key)}
                            aria-pressed={active}
                            className={`text-left rounded-2xl border p-3.5 transition ${
                                active
                                    ? `${STAGE_ACTIVE_RING[s.tone]} shadow-sm`
                                    : 'border-gray-200/70 bg-white hover:border-gray-300 hover:bg-gray-50/60'
                            }`}
                        >
                            <div className="flex items-center gap-1.5">
                                <span className={`w-2 h-2 rounded-full ${STAGE_DOT[s.tone]}`} />
                                <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">{s.label}</span>
                            </div>
                            {loading
                                ? <Skeleton className="h-6 w-8 mt-1.5" />
                                : <div className="text-2xl font-bold text-gray-900 tabular-nums leading-tight mt-1">{n}</div>}
                            <div className="text-[10.5px] text-gray-400 mt-0.5 leading-tight">{s.help}</div>
                        </button>
                    );
                })}
            </div>

            {/* ── Search ───────────────────────────────────────────────── */}
            <div className="relative max-w-sm mb-5">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search name, restaurant, phone, email…"
                    className={`${inputClass} pl-9`}
                />
            </div>

            {/* ── List ─────────────────────────────────────────────────── */}
            <SectionCard title="Incoming leads" subtitle="Newest first." icon={Inbox}>
                {loading ? (
                    <ListSkeleton />
                ) : leads.length === 0 ? (
                    <EmptyState
                        icon={Inbox}
                        title="No leads here"
                        description="When a prospect submits the demo or contact form on the marketing site, they'll show up in this list."
                    />
                ) : (
                    <ul className="space-y-3">
                        {leads.map(lead => (
                            <LeadRow
                                key={lead._id}
                                lead={lead}
                                busy={busyId === lead._id}
                                isFull={isFull}
                                onStatus={(to) => patchLead(lead._id, { status: to }, `Marked ${to}`)}
                                onNote={() => setNoteFor(lead._id)}
                                onConvert={() => setConvertLead(lead)}
                                onDelete={() => setDeleteFor(lead._id)}
                            />
                        ))}
                    </ul>
                )}
            </SectionCard>

            {/* ── Add-note prompt ──────────────────────────────────────── */}
            <PromptModal
                open={!!noteFor}
                title="Add a note"
                description="Notes are timestamped and attributed to you — useful for tracking the conversation."
                placeholder="e.g. Called — wants a demo Friday 4pm; 18 tables, dine-in + takeaway"
                confirmLabel="Save note"
                required
                onClose={() => setNoteFor(null)}
                onConfirm={(text) => { const id = noteFor; setNoteFor(null); if (id) patchLead(id, { note: text }, 'Note added'); }}
            />

            {/* ── Delete confirm ───────────────────────────────────────── */}
            <ConfirmModal
                open={!!deleteFor}
                title="Delete this lead?"
                description="This permanently removes the lead. Use it for spam only."
                confirmLabel="Delete"
                danger
                onClose={() => setDeleteFor(null)}
                onConfirm={() => { const id = deleteFor; setDeleteFor(null); if (id) handleDelete(id); }}
            />

            {/* ── Convert → create restaurant (prefilled) ──────────────── */}
            {convertLead && (
                <CreateRestaurantModal
                    prefill={convertLead}
                    onClose={() => setConvertLead(null)}
                    onCreated={handleConverted}
                />
            )}
        </div>
    );
};

// ─── Row ─────────────────────────────────────────────────────────────

const initialsFor = (name) => (name || 'L').trim().slice(0, 2).toUpperCase();

const LeadRow = ({ lead, busy, isFull, onStatus, onNote, onConvert, onDelete }) => {
    const wa = waNumber(lead.phone);
    const lastNote = lead.notes?.length ? lead.notes[lead.notes.length - 1] : null;
    return (
        <li className="rounded-xl border border-gray-200/70 bg-white p-4 hover:border-gray-300 transition">
            <div className="flex flex-col sm:flex-row sm:items-start gap-4">
                <div className="w-11 h-11 rounded-xl bg-linear-to-br from-orange-100 to-orange-200/70 text-orange-700 font-bold flex items-center justify-center shrink-0 ring-1 ring-orange-200/60">
                    {initialsFor(lead.name)}
                </div>

                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-sm text-gray-900 truncate">{lead.restaurantName}</span>
                        <Badge tone={STATUS_TONE[lead.status] || 'slate'} dot>{lead.status}</Badge>
                        {lead.source && (
                            <span className="font-mono text-[11px] bg-gray-100 px-1.5 py-0.5 rounded text-gray-600">
                                {lead.source}
                            </span>
                        )}
                    </div>

                    <div className="flex items-center gap-x-4 gap-y-1 flex-wrap text-xs text-gray-500 mt-1.5">
                        <span className="inline-flex items-center gap-1.5 font-medium text-gray-700">{lead.name}</span>
                        <span className="inline-flex items-center gap-1.5"><Phone size={11} />{lead.phone}</span>
                        {lead.email && (
                            <span className="inline-flex items-center gap-1.5"><Mail size={11} />{lead.email}</span>
                        )}
                        {lead.meta?.tables && (
                            <span className="inline-flex items-center gap-1.5"><Store size={11} />{lead.meta.tables} tables</span>
                        )}
                        <span className="inline-flex items-center gap-1.5"><Clock4 size={11} />{fmtRelative(lead.createdAt)}</span>
                    </div>

                    {lead.message && (
                        <div className="text-xs text-gray-600 mt-2 bg-gray-50 border border-gray-200/70 rounded-lg px-3 py-2 italic">
                            "{lead.message}"
                        </div>
                    )}
                    {lastNote && (
                        <div className="text-[11px] text-gray-500 mt-1.5 inline-flex items-center gap-1.5">
                            <StickyNote size={11} /> Last note: {lastNote.text}
                        </div>
                    )}
                </div>

                {/* Actions */}
                <div className="flex flex-col gap-2 shrink-0 w-full sm:w-auto">
                    <div className="flex items-center gap-2">
                        <a
                            href={`https://wa.me/${wa}?text=${encodeURIComponent(`Hi ${lead.name}, this is BestoDine about your demo request for ${lead.restaurantName}.`)}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center justify-center gap-2 font-semibold text-xs px-3 py-1.5 rounded-lg bg-emerald-500 text-white hover:bg-emerald-600 transition"
                        >
                            <MessageCircle size={14} /> WhatsApp
                        </a>
                        <a
                            href={`tel:+${wa}`}
                            className="inline-flex items-center justify-center gap-2 font-semibold text-xs px-3 py-1.5 rounded-lg bg-white text-gray-700 border border-gray-200 hover:border-[#FE8301]/40 hover:bg-orange-50 hover:text-[#FE8301] transition"
                        >
                            <Phone size={14} /> Call
                        </a>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                        <Button variant="ghost" size="sm" icon={StickyNote} disabled={busy} onClick={onNote}>Note</Button>
                        {(NEXT_ACTIONS[lead.status] || []).map(a => (
                            <Button key={a.to} variant="ghost" size="sm" disabled={busy} onClick={() => onStatus(a.to)}>
                                {a.label}
                            </Button>
                        ))}
                        {lead.status !== 'converted' && (
                            <Button variant="success" size="sm" icon={CheckCircle2} disabled={busy} onClick={onConvert}>
                                Convert
                            </Button>
                        )}
                        {isFull && (
                            <Button variant="danger" size="sm" icon={Trash2} disabled={busy} onClick={onDelete}>
                                Delete
                            </Button>
                        )}
                    </div>
                </div>
            </div>
        </li>
    );
};

const ListSkeleton = () => (
    <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="rounded-xl border border-gray-200/70 bg-white p-4">
                <div className="flex items-start gap-3">
                    <Skeleton className="w-11 h-11 rounded-xl" />
                    <div className="flex-1 space-y-2">
                        <Skeleton className="h-3 w-2/5" />
                        <Skeleton className="h-2.5 w-3/5" />
                        <Skeleton className="h-2.5 w-1/3" />
                    </div>
                    <Skeleton className="h-8 w-24 rounded-lg" />
                </div>
            </div>
        ))}
    </div>
);

export default Leads;
