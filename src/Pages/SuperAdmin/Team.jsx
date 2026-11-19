import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'react-hot-toast';
import {
    Users,
    UserPlus,
    Pencil,
    History,
    KeyRound,
    Copy,
    AlertTriangle,
    X,
    ChevronDown,
    ChevronRight,
    RefreshCw,
} from 'lucide-react';
import { platformStaffAPI } from '../../utils/platformStaffApi';
import {
    PageHeader,
    Card,
    Badge,
    Button,
    Skeleton,
    EmptyState,
    ModalShell,
    ConfirmModal,
    Field,
    TableShell,
    TH,
    TD,
    inputClass,
} from './components/ui';

/**
 * Team — the owner's UI for platform staff: delegated users who only see the
 * super-admin modules assigned to them. Create / edit access, reset password,
 * and read an activity log of everything they did. The module list always
 * comes from the catalog endpoint; nothing here hard-codes module keys.
 */

const errMsg = (err, fallback) => err?.response?.data?.message || fallback;

const fmtDateTime = (v) => {
    if (!v) return null;
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) return null;
    return `${d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}, ${d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}`;
};

const LEVEL_LABEL = { view: 'View', manage: 'Manage' };

// "superadmin.signup_lead_stage" -> "Superadmin signup lead stage"
const humanizeKey = (key = '') => {
    const s = String(key).replace(/[._-]+/g, ' ').trim();
    return s ? s.charAt(0).toUpperCase() + s.slice(1) : 'Unknown action';
};

// ─── Activity wording ────────────────────────────────────────────────
const ACTION_LABELS = {
    'platformstaff.login': 'Signed in',
    'platformstaff.view': 'Opened a module',
    'platformstaff.write': 'Changed data in a module',
    'platformstaff.denied': 'Blocked attempts',
    'superadmin.signup_lead_stage': 'Moved a trial signup stage',
    'lead.update': 'Updated a marketing lead',
    'restaurant.extend_trial': 'Extended a trial',
    'marketing.update': 'Updated marketing content',
};

const moduleName = (catalog, key) => catalog.find((m) => m.key === key)?.label || key || 'a module';

const describeRow = (row, catalog) => {
    const d = row.details || {};
    const target = row.targetName ? ` (${row.targetName})` : '';
    switch (row.action) {
        case 'platformstaff.login': return 'Signed in';
        case 'platformstaff.view': return `Opened ${moduleName(catalog, d.module)}`;
        case 'platformstaff.write': return `Changed data in ${moduleName(catalog, d.module)}`;
        case 'platformstaff.denied': return `Tried to open ${moduleName(catalog, d.module)} without access`;
        case 'superadmin.signup_lead_stage': return `Moved a trial signup to a new stage${target}`;
        case 'lead.update': return `Updated a marketing lead${target}`;
        case 'restaurant.extend_trial': return `Extended a free trial${target}`;
        case 'marketing.update': return 'Updated marketing content';
        default:
            if (String(row.action).startsWith('blog.')) return `Blog: ${humanizeKey(String(row.action).slice(5)).toLowerCase()}${target}`;
            return `${humanizeKey(row.action)}${target}`;
    }
};

const isDenied = (row) => row.action === 'platformstaff.denied';

// Action filter options: known actions with friendly names.
const ACTION_FILTERS = [
    ['', 'All actions'],
    ['platformstaff.login', 'Sign-ins'],
    ['platformstaff.view', 'Opened modules'],
    ['platformstaff.write', 'Changed data'],
    ['platformstaff.denied', 'Blocked attempts'],
    ['superadmin.signup_lead_stage', 'Trial signup stage changes'],
    ['lead.update', 'Marketing lead updates'],
    ['restaurant.extend_trial', 'Trial extensions'],
    ['marketing.update', 'Marketing updates'],
];

// ─── Module chips ────────────────────────────────────────────────────
const ModuleChips = ({ modules, catalog }) => {
    const entries = Object.entries(modules || {}).filter(([, lvl]) => lvl);
    if (!entries.length) return <span className="text-xs text-gray-400">No access</span>;
    return (
        <div className="flex flex-wrap gap-1.5">
            {entries.map(([key, lvl]) => (
                <span
                    key={key}
                    className={`inline-flex items-center text-[11px] font-semibold px-2 py-0.5 rounded-full ring-1 ${lvl === 'manage'
                        ? 'bg-orange-50 text-orange-700 ring-orange-200/70'
                        : 'bg-sky-50 text-sky-700 ring-sky-200/70'}`}
                >
                    {moduleName(catalog, key)} · {LEVEL_LABEL[lvl] || lvl}
                </span>
            ))}
        </div>
    );
};

// ─── Add / Edit modal ────────────────────────────────────────────────
const MemberFormModal = ({ member, catalog, onClose, onSaved }) => {
    const editing = !!member;
    const [name, setName] = useState(member?.name || '');
    const [email, setEmail] = useState(member?.email || '');
    const [modules, setModules] = useState({ ...(member?.modules || {}) });
    const [active, setActive] = useState(member ? member.status !== 'inactive' : true);
    const [errors, setErrors] = useState({});
    const [formError, setFormError] = useState('');
    const [saving, setSaving] = useState(false);
    const [confirmDeactivate, setConfirmDeactivate] = useState(false);

    const setLevel = (key, level) => {
        setModules((prev) => {
            const next = { ...prev };
            if (level === 'none') delete next[key]; else next[key] = level;
            return next;
        });
        setErrors((e) => ({ ...e, modules: undefined }));
    };

    const validate = () => {
        const e = {};
        const n = name.trim();
        if (n.length < 2 || n.length > 80) e.name = 'Name must be 2 to 80 characters';
        if (!editing && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) e.email = 'Enter a valid email address';
        if (!Object.keys(modules).length) e.modules = 'Give access to at least one module';
        setErrors(e);
        return Object.keys(e).length === 0;
    };

    const save = async () => {
        if (!validate()) return;
        setSaving(true);
        setFormError('');
        try {
            if (editing) {
                const body = { name: name.trim(), modules };
                const nextStatus = active ? 'active' : 'inactive';
                if (nextStatus !== member.status) body.status = nextStatus;
                const res = await platformStaffAPI.update(member._id, body);
                toast.success('Team member updated');
                onSaved({ staff: res.data?.staff });
            } else {
                const res = await platformStaffAPI.create({ name: name.trim(), email: email.trim(), modules });
                onSaved({
                    staff: res.data?.staff,
                    credentials: { tempPassword: res.data?.tempPassword, emailed: !!res.data?.emailed, name: name.trim(), email: email.trim(), kind: 'created' },
                });
            }
        } catch (err) {
            setFormError(errMsg(err, 'Could not save. Please try again.'));
        } finally {
            setSaving(false);
        }
    };

    const onToggleActive = () => {
        if (active) setConfirmDeactivate(true); else setActive(true);
    };

    return (
        <>
            <ModalShell
                open
                onClose={onClose}
                icon={editing ? Pencil : UserPlus}
                title={editing ? 'Edit team member' : 'Add team member'}
                subtitle={editing ? 'Access changes apply on their next request.' : 'They will get a temporary password and must change it at first sign-in.'}
                maxWidth="max-w-2xl"
                footer={(
                    <>
                        <Button variant="ghost" onClick={onClose} disabled={saving}>Cancel</Button>
                        <Button onClick={save} disabled={saving}>{saving ? 'Saving…' : editing ? 'Save changes' : 'Create member'}</Button>
                    </>
                )}
            >
                <div className="p-5 sm:p-6 space-y-5">
                    {formError && (
                        <div role="alert" className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-3.5 py-2.5">{formError}</div>
                    )}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <Field label="Name" required error={errors.name}>
                            <input
                                className={inputClass}
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                maxLength={80}
                                aria-label="Name"
                            />
                        </Field>
                        <Field label="Email" required error={errors.email}>
                            <input
                                className={inputClass}
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                readOnly={editing}
                                disabled={editing}
                                aria-label="Email"
                            />
                        </Field>
                    </div>

                    {editing && (
                        <div className="flex items-center justify-between gap-3 rounded-xl border border-orange-100/70 bg-[#FAF5F0]/60 px-4 py-3">
                            <div>
                                <div className="text-sm font-semibold text-gray-800">{active ? 'Active' : 'Inactive'}</div>
                                <div className="text-xs text-gray-500">Inactive people are signed out immediately and cannot sign in.</div>
                            </div>
                            <button
                                type="button"
                                role="switch"
                                aria-checked={active}
                                aria-label="Active"
                                onClick={onToggleActive}
                                className={`relative w-11 h-6 rounded-full transition shrink-0 ${active ? 'bg-emerald-500' : 'bg-gray-300'}`}
                            >
                                <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${active ? 'translate-x-5' : ''}`} />
                            </button>
                        </div>
                    )}

                    <fieldset>
                        <legend className="text-xs font-semibold text-gray-700 mb-2">Module access</legend>
                        <div className="space-y-2">
                            {catalog.map((m) => {
                                const current = modules[m.key] || 'none';
                                const levels = ['none', ...(m.levels || ['view'])];
                                return (
                                    <div key={m.key} className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 rounded-xl border border-gray-100 px-3.5 py-3">
                                        <div className="min-w-0 flex-1">
                                            <div className="text-sm font-semibold text-gray-900">{m.label}</div>
                                            {m.description && <div className="text-xs text-gray-500 leading-relaxed">{m.description}</div>}
                                        </div>
                                        <div role="radiogroup" aria-label={`${m.label} access`} className="flex items-center gap-1 bg-[#FAF5F0] border border-orange-100/70 rounded-xl p-1 shrink-0">
                                            {levels.map((lvl) => (
                                                <button
                                                    key={lvl}
                                                    type="button"
                                                    role="radio"
                                                    aria-checked={current === lvl}
                                                    aria-label={`${m.label}: ${lvl === 'none' ? 'None' : LEVEL_LABEL[lvl]}`}
                                                    onClick={() => setLevel(m.key, lvl)}
                                                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${current === lvl ? 'bg-white text-[#FE8301] shadow-sm' : 'text-gray-500 hover:text-gray-800'}`}
                                                >
                                                    {lvl === 'none' ? 'None' : LEVEL_LABEL[lvl]}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                        {errors.modules && (
                            <p role="alert" className="mt-2 text-[11px] text-rose-600 font-semibold">{errors.modules}</p>
                        )}
                    </fieldset>
                </div>
            </ModalShell>
            <ConfirmModal
                open={confirmDeactivate}
                onClose={() => setConfirmDeactivate(false)}
                onConfirm={() => setActive(false)}
                title="Make this person inactive?"
                description="They will be signed out everywhere immediately and will not be able to sign in until you make them active again. Click Save changes to apply."
                confirmLabel="Mark inactive"
                danger
            />
        </>
    );
};

// ─── One-time password notice ────────────────────────────────────────
const PasswordNotice = ({ credentials, onClose }) => {
    const [copied, setCopied] = useState(false);
    const copy = async () => {
        try {
            await navigator.clipboard.writeText(credentials.tempPassword);
            setCopied(true);
        } catch {
            toast.error('Could not copy. Select the password and copy it manually.');
        }
    };
    return (
        <ModalShell
            open
            onClose={onClose}
            icon={KeyRound}
            title={credentials.kind === 'reset' ? 'Password reset' : 'Team member created'}
            subtitle={credentials.name ? `${credentials.name} · ${credentials.email}` : credentials.email}
            footer={<Button onClick={onClose}>I have saved it</Button>}
        >
            <div className="p-5 sm:p-6 space-y-4">
                <div role="alert" className="flex gap-2.5 text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3.5 py-3">
                    <AlertTriangle size={18} className="shrink-0 mt-0.5" />
                    <span>This temporary password is shown only once. It will not be shown again after you close this window.</span>
                </div>
                <div>
                    <div className="text-xs font-semibold text-gray-700 mb-1.5">Temporary password</div>
                    <div className="flex items-center gap-2">
                        <code data-testid="temp-password" className="flex-1 min-w-0 break-all font-mono text-base bg-[#FAF5F0] border border-orange-100 rounded-xl px-3.5 py-2.5 text-gray-900 select-all">
                            {credentials.tempPassword}
                        </code>
                        <Button variant="ghost" icon={Copy} onClick={copy}>{copied ? 'Copied' : 'Copy'}</Button>
                    </div>
                </div>
                <p className="text-sm text-gray-600">
                    {credentials.emailed
                        ? 'A welcome email with this password was sent to them.'
                        : 'The email could not be sent, so share this password with them yourself.'}
                    {' '}They must set a new password the first time they sign in.
                </p>
            </div>
        </ModalShell>
    );
};

// ─── Activity drawer ─────────────────────────────────────────────────
const PAGE_SIZE = 20;

const ActivityDrawer = ({ member, catalog, onClose }) => {
    const [rows, setRows] = useState([]);
    const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0 });
    const [page, setPage] = useState(1);
    const [action, setAction] = useState('');
    const [from, setFrom] = useState('');
    const [to, setTo] = useState('');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [open, setOpen] = useState({});
    const [retryKey, setRetryKey] = useState(0);

    const fetchPage = useCallback(async (isCancelled) => {
        setLoading(true);
        setError('');
        const params = { page, limit: PAGE_SIZE };
        if (action) params.action = action;
        if (from) params.from = from;
        if (to) params.to = to;
        try {
            const res = await platformStaffAPI.activity(member._id, params);
            if (isCancelled()) return;
            setRows(res.data?.data || []);
            setPagination(res.data?.pagination || { page, pages: 1, total: 0 });
        } catch (err) {
            if (!isCancelled()) setError(errMsg(err, 'Could not load activity.'));
        } finally {
            if (!isCancelled()) setLoading(false);
        }
    }, [member._id, page, action, from, to]);

    useEffect(() => {
        let cancelled = false;
        fetchPage(() => cancelled);
        return () => { cancelled = true; };
    }, [fetchPage, retryKey]);

    const refilter = (setter) => (e) => { setter(e.target.value); setPage(1); };
    return (
        <div className="fixed inset-0 z-50 flex justify-end bg-gray-900/40 backdrop-blur-sm animate-fadeIn">
            <aside role="dialog" aria-modal="true" aria-label={`Activity for ${member.name}`} className="bg-white w-full max-w-xl h-full shadow-2xl flex flex-col">
                <header className="px-5 py-4 border-b border-orange-100/70 flex items-start gap-3">
                    <div className="w-10 h-10 rounded-xl bg-orange-50 border border-orange-100 flex items-center justify-center text-[#FE8301] shrink-0">
                        <History size={18} />
                    </div>
                    <div className="flex-1 min-w-0">
                        <h2 className="text-base font-bold text-gray-900 truncate">Activity · {member.name}</h2>
                        <p className="text-xs text-gray-500 mt-0.5">{pagination.total.toLocaleString('en-IN')} entries · newest first</p>
                    </div>
                    <button type="button" onClick={onClose} aria-label="Close activity" className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:text-[#FE8301] hover:bg-orange-50 transition">
                        <X size={16} />
                    </button>
                </header>

                <div className="px-5 py-3 border-b border-orange-100/70 grid grid-cols-1 sm:grid-cols-3 gap-3 bg-[#FAF5F0]/50">
                    <label className="block text-[11px] font-semibold text-gray-600">
                        Action
                        <select className={`${inputClass} mt-1`} value={action} onChange={refilter(setAction)} aria-label="Action type">
                            {ACTION_FILTERS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                        </select>
                    </label>
                    <label className="block text-[11px] font-semibold text-gray-600">
                        From
                        <input type="date" className={`${inputClass} mt-1`} value={from} onChange={refilter(setFrom)} aria-label="From date" />
                    </label>
                    <label className="block text-[11px] font-semibold text-gray-600">
                        To
                        <input type="date" className={`${inputClass} mt-1`} value={to} onChange={refilter(setTo)} aria-label="To date" />
                    </label>
                </div>

                <div className="flex-1 overflow-y-auto">
                    {error ? (
                        <EmptyState
                            icon={AlertTriangle}
                            title="Could not load activity"
                            description={error}
                            action={<Button variant="ghost" icon={RefreshCw} onClick={() => setRetryKey((k) => k + 1)}>Retry</Button>}
                        />
                    ) : loading ? (
                        <div className="p-5 space-y-3">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
                    ) : rows.length === 0 ? (
                        <EmptyState icon={History} title="No activity found" description="Nothing matches these filters yet." />
                    ) : (
                        <ul className="divide-y divide-gray-100">
                            {rows.map((row) => {
                                const denied = isDenied(row);
                                const expanded = !!open[row._id];
                                return (
                                    <li key={row._id} data-denied={denied ? 'true' : undefined} className={denied ? 'bg-amber-50/70' : ''}>
                                        <button
                                            type="button"
                                            onClick={() => setOpen((o) => ({ ...o, [row._id]: !o[row._id] }))}
                                            aria-expanded={expanded}
                                            className="w-full text-left px-5 py-3 flex items-start gap-2.5 hover:bg-orange-50/40"
                                        >
                                            {expanded ? <ChevronDown size={14} className="mt-1 text-gray-400" /> : <ChevronRight size={14} className="mt-1 text-gray-400" />}
                                            <div className="min-w-0 flex-1">
                                                <div className={`text-sm font-semibold ${denied ? 'text-amber-800' : 'text-gray-900'}`}>
                                                    {denied && <AlertTriangle size={13} className="inline mr-1 -mt-0.5" />}
                                                    {describeRow(row, catalog)}
                                                </div>
                                                <div className="text-xs text-gray-500 mt-0.5">
                                                    {fmtDateTime(row.createdAt) || '—'}{row.ip ? ` · ${row.ip}` : ''}
                                                </div>
                                            </div>
                                        </button>
                                        {expanded && (
                                            <pre className="mx-5 mb-3 text-[11px] bg-gray-900 text-gray-100 rounded-xl p-3 overflow-x-auto">{JSON.stringify({ action: row.action, targetType: row.targetType, targetName: row.targetName, details: row.details, userAgent: row.userAgent }, null, 2)}</pre>
                                        )}
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </div>

                <footer className="px-5 py-3 border-t border-orange-100/70 flex items-center justify-between gap-3 bg-[#FAF5F0]/50">
                    <span className="text-xs text-gray-500">Page {pagination.page || page} of {pagination.pages || 1}</span>
                    <div className="flex gap-2">
                        <Button variant="ghost" size="sm" disabled={page <= 1 || loading} onClick={() => setPage((p) => p - 1)}>Previous</Button>
                        <Button variant="ghost" size="sm" disabled={page >= (pagination.pages || 1) || loading} onClick={() => setPage((p) => p + 1)}>Next</Button>
                    </div>
                </footer>
            </aside>
        </div>
    );
};

// ─── Page ────────────────────────────────────────────────────────────
const Team = () => {
    const [staff, setStaff] = useState([]);
    const [catalog, setCatalog] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [form, setForm] = useState(null);         // null | { member?: staff }
    const [activityFor, setActivityFor] = useState(null);
    const [credentials, setCredentials] = useState(null);
    const [resetTarget, setResetTarget] = useState(null);

    const load = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const [mods, list] = await Promise.all([platformStaffAPI.modules(), platformStaffAPI.list()]);
            setCatalog(mods.data?.modules || []);
            setStaff(list.data?.staff || []);
        } catch (err) {
            setError(errMsg(err, 'Could not load the team.'));
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    const onSaved = ({ credentials: creds }) => {
        setForm(null);
        if (creds) setCredentials(creds);
        load();
    };

    const doReset = async () => {
        const target = resetTarget;
        if (!target) return;
        try {
            const res = await platformStaffAPI.resetPassword(target._id);
            setCredentials({ tempPassword: res.data?.tempPassword, emailed: !!res.data?.emailed, name: target.name, email: target.email, kind: 'reset' });
            load();
        } catch (err) {
            toast.error(errMsg(err, 'Could not reset the password.'));
        }
    };

    const rows = useMemo(() => staff, [staff]);

    const rowActions = (m) => (
        <div className="flex flex-wrap gap-2">
            <Button variant="ghost" size="sm" icon={Pencil} onClick={() => setForm({ member: m })} aria-label={`Edit ${m.name}`}>Edit</Button>
            <Button variant="ghost" size="sm" icon={History} onClick={() => setActivityFor(m)} aria-label={`Activity for ${m.name}`}>Activity</Button>
            <Button variant="ghost" size="sm" icon={KeyRound} onClick={() => setResetTarget(m)} aria-label={`Reset password for ${m.name}`}>Reset password</Button>
        </div>
    );

    const statusBadge = (m) => (
        <Badge tone={m.status === 'inactive' ? 'slate' : 'success'} dot>{m.status === 'inactive' ? 'Inactive' : 'Active'}</Badge>
    );

    return (
        <div className="px-4 sm:px-6 lg:px-8 py-6 sm:py-8 max-w-360 mx-auto">
            <PageHeader
                eyebrow="Access control"
                title="Team"
                description="Create people who can use only the super-admin modules you choose, and review everything they do."
                actions={<Button icon={UserPlus} onClick={() => setForm({})} disabled={loading && !catalog.length}>Add team member</Button>}
            />

            {loading ? (
                <Card className="p-5 space-y-3" aria-busy="true">
                    {[0, 1, 2].map((i) => <Skeleton key={i} className="h-14 w-full" />)}
                </Card>
            ) : error ? (
                <Card>
                    <EmptyState
                        icon={AlertTriangle}
                        title="Could not load the team"
                        description={error}
                        action={<Button variant="ghost" icon={RefreshCw} onClick={load}>Retry</Button>}
                    />
                </Card>
            ) : rows.length === 0 ? (
                <Card>
                    <EmptyState
                        icon={Users}
                        title="No team members yet"
                        description="Add someone and choose which modules they can see or manage."
                        action={<Button icon={UserPlus} onClick={() => setForm({})}>Add team member</Button>}
                    />
                </Card>
            ) : (
                <>
                    <div className="hidden md:block">
                        <TableShell>
                            <thead>
                                <tr>
                                    <TH>Member</TH>
                                    <TH>Status</TH>
                                    <TH>Access</TH>
                                    <TH>Last sign-in</TH>
                                    <TH>Last activity</TH>
                                    <TH>Actions</TH>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {rows.map((m) => (
                                    <tr key={m._id} data-testid="team-row">
                                        <TD>
                                            <div className="font-semibold text-gray-900">{m.name}</div>
                                            <div className="text-xs text-gray-500">{m.email}</div>
                                        </TD>
                                        <TD>{statusBadge(m)}</TD>
                                        <TD className="max-w-xs"><ModuleChips modules={m.modules} catalog={catalog} /></TD>
                                        <TD className="text-xs text-gray-600 whitespace-nowrap">{fmtDateTime(m.lastLoginAt) || 'Never'}</TD>
                                        <TD className="text-xs text-gray-600 whitespace-nowrap">{fmtDateTime(m.lastActivityAt) || 'None yet'}</TD>
                                        <TD>{rowActions(m)}</TD>
                                    </tr>
                                ))}
                            </tbody>
                        </TableShell>
                    </div>
                    <div className="md:hidden space-y-3">
                        {rows.map((m) => (
                            <Card key={m._id} className="p-4 space-y-3" data-testid="team-card">
                                <div className="flex items-start justify-between gap-2">
                                    <div className="min-w-0">
                                        <div className="font-semibold text-gray-900 truncate">{m.name}</div>
                                        <div className="text-xs text-gray-500 truncate">{m.email}</div>
                                    </div>
                                    {statusBadge(m)}
                                </div>
                                <ModuleChips modules={m.modules} catalog={catalog} />
                                <div className="text-xs text-gray-500">
                                    Last sign-in: {fmtDateTime(m.lastLoginAt) || 'Never'} · Last activity: {fmtDateTime(m.lastActivityAt) || 'None yet'}
                                </div>
                                {rowActions(m)}
                            </Card>
                        ))}
                    </div>
                </>
            )}

            {form && (
                <MemberFormModal member={form.member} catalog={catalog} onClose={() => setForm(null)} onSaved={onSaved} />
            )}
            {activityFor && (
                <ActivityDrawer member={activityFor} catalog={catalog} onClose={() => setActivityFor(null)} />
            )}
            <ConfirmModal
                open={!!resetTarget}
                onClose={() => setResetTarget(null)}
                onConfirm={doReset}
                title={`Reset password for ${resetTarget?.name || ''}?`}
                description="They will be signed out everywhere and must set a new password at their next sign-in. You will see the new temporary password once."
                confirmLabel="Reset password"
                danger
            />
            {credentials && (
                <PasswordNotice credentials={credentials} onClose={() => setCredentials(null)} />
            )}
        </div>
    );
};

export default Team;
