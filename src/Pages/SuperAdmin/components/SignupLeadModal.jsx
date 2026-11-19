import React, { useState } from 'react';
import { toast } from 'react-hot-toast';
import { UserPlus, Mail, Phone, MapPin, StickyNote, MailCheck, UtensilsCrossed, Users } from 'lucide-react';
import api from '../../../utils/api';
import { ModalShell, Badge, Button, Field, inputClass } from './ui';
import { SEGMENT_BADGE, STAGES, fmtDate, trialDaysLabel, isOverdue, stageOf, toInputDate, fromInputDate } from './signupLeadsUtils';

/**
 * One signup lead: contact links, pipeline controls that save on change
 * (PATCH), a note box (POST) with the human note history, and — kept
 * apart from the notes — the trial reminder emails the job has sent.
 */

const REMINDER_LABEL = {
    't-3': '3 days before trial end',
    't-1': '1 day before trial end',
    't+0': 'Trial ended',
    't+2': '2 days after trial end',
};

const fmtDateTime = (iso) => {
    if (!iso) return '—';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

const SignupLeadModal = ({ lead, canWrite, onClose, onUpdated }) => {
    const [saving, setSaving] = useState('');   // which control is saving
    const [note, setNote] = useState('');

    const seg = SEGMENT_BADGE[lead.segment] || { tone: 'slate', label: lead.segment || '—' };
    const stage = stageOf(lead);
    const stageLocked = lead.segment === 'paid' || stage === 'converted';
    const overdue = isOverdue(lead.nextFollowUpAt);

    const patch = async (field, body, successMsg) => {
        setSaving(field);
        try {
            const res = await api.patch(`/superadmin/signup-leads/${lead.slug}`, body);
            onUpdated?.(res.data?.data);
            toast.success(successMsg);
        } catch (err) {
            toast.error(err.response?.data?.message || 'Update failed');
        } finally {
            setSaving('');
        }
    };

    const addNote = async () => {
        const text = note.trim();
        if (!text) return;
        setSaving('note');
        try {
            const res = await api.post(`/superadmin/signup-leads/${lead.slug}/notes`, { text });
            onUpdated?.(res.data?.data);
            setNote('');
            toast.success('Note added');
        } catch (err) {
            toast.error(err.response?.data?.message || 'Could not add note');
        } finally {
            setSaving('');
        }
    };

    const disabled = !canWrite || !!saving;
    const notes = Array.isArray(lead.notes) ? lead.notes.filter(n => !n.kind || n.kind === 'human') : [];
    const reminders = Array.isArray(lead.reminders) ? lead.reminders : [];

    return (
        <ModalShell
            open
            onClose={onClose}
            icon={UserPlus}
            title={lead.name}
            maxWidth="max-w-2xl"
            subtitle={
                <span className="inline-flex items-center gap-2 flex-wrap">
                    <Badge tone={seg.tone} dot>{seg.label}</Badge>
                    {lead.plan?.name && <span>{lead.plan.name}{lead.plan.isFree ? ' (free)' : ''}</span>}
                    <span className="text-gray-400">·</span>
                    <span>{trialDaysLabel(lead) === '—' ? `Signed up ${fmtDate(lead.signedUpAt)}` : trialDaysLabel(lead)}</span>
                </span>
            }
            footer={<Button variant="ghost" onClick={onClose}>Close</Button>}
        >
            <div className="px-5 sm:px-6 py-5 space-y-6">
                {/* ── Contact ──────────────────────────────────────── */}
                <section>
                    <h3 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-gray-500 mb-2">Contact</h3>
                    <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-sm text-gray-700">
                        {lead.owner && <span className="font-semibold text-gray-900">{lead.owner}</span>}
                        {lead.email ? (
                            <a href={`mailto:${lead.email}`} className="inline-flex items-center gap-1.5 text-[#FE8301] hover:underline">
                                <Mail size={13} />{lead.email}
                            </a>
                        ) : null}
                        {lead.phone ? (
                            <a href={`tel:${lead.phone}`} className="inline-flex items-center gap-1.5 text-[#FE8301] hover:underline">
                                <Phone size={13} />{lead.phone}
                            </a>
                        ) : null}
                        {lead.city && <span className="inline-flex items-center gap-1.5 text-gray-500"><MapPin size={13} />{lead.city}</span>}
                    </div>
                    <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-gray-500 mt-2">
                        <span className="inline-flex items-center gap-1.5"><UtensilsCrossed size={12} />{lead.menuItemCount ?? 0} menu items</span>
                        <span className="inline-flex items-center gap-1.5"><Users size={12} />{lead.staffCount ?? 0} staff</span>
                        {lead.trialEndsAt && <span>Trial ends {fmtDate(lead.trialEndsAt)}</span>}
                        {lead.lockAt && <span>Locks {fmtDate(lead.lockAt)}</span>}
                        <span>Source: {lead.source === 'self_service_trial' ? 'trial signup' : 'self-service signup'}</span>
                    </div>
                </section>

                {/* ── Pipeline controls (save on change) ───────────── */}
                <section className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <Field label="Stage" hint={stageLocked ? 'Paid — converted' : undefined}>
                        <select
                            aria-label="Stage"
                            value={stage}
                            disabled={disabled || stageLocked}
                            onChange={(e) => patch('stage', { stage: e.target.value }, `Stage set to ${e.target.value}`)}
                            className={inputClass}
                        >
                            {STAGES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
                        </select>
                    </Field>
                    <Field label="Next follow-up" hint={overdue ? 'Overdue' : undefined}>
                        <input
                            type="date"
                            aria-label="Next follow-up"
                            value={toInputDate(lead.nextFollowUpAt)}
                            disabled={disabled}
                            onChange={(e) => patch('nextFollowUpAt', { nextFollowUpAt: fromInputDate(e.target.value) }, e.target.value ? 'Follow-up date saved' : 'Follow-up date cleared')}
                            className={`${inputClass} ${overdue ? 'border-rose-300 text-rose-600' : ''}`}
                        />
                    </Field>
                    <Field label="Last contacted">
                        <input
                            type="date"
                            aria-label="Last contacted"
                            value={toInputDate(lead.lastContactedAt)}
                            disabled={disabled}
                            onChange={(e) => patch('lastContactedAt', { lastContactedAt: fromInputDate(e.target.value) }, 'Last contacted saved')}
                            className={inputClass}
                        />
                    </Field>
                </section>
                {!canWrite && (
                    <p className="text-xs text-gray-500 -mt-3">Read-only access — a team member with manage access can change the stage, dates and notes.</p>
                )}

                {/* ── Notes ────────────────────────────────────────── */}
                <section>
                    <h3 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-gray-500 mb-2 inline-flex items-center gap-1.5">
                        <StickyNote size={12} /> Notes
                    </h3>
                    <textarea
                        aria-label="New note"
                        value={note}
                        disabled={disabled}
                        maxLength={1000}
                        rows={3}
                        onChange={(e) => setNote(e.target.value)}
                        placeholder="e.g. Called — wants help importing the menu; follow up Friday"
                        className={`${inputClass} resize-none`}
                    />
                    <div className="flex items-center justify-between mt-2">
                        <span className="text-[10px] text-gray-400 tabular-nums">{note.length}/1000</span>
                        <Button variant="brand" size="sm" icon={StickyNote} disabled={disabled || !note.trim()} onClick={addNote}>
                            {saving === 'note' ? 'Saving…' : 'Add note'}
                        </Button>
                    </div>
                    {notes.length === 0 ? (
                        <p className="text-xs text-gray-400 mt-3">No notes yet.</p>
                    ) : (
                        <ul className="mt-3 space-y-2">
                            {notes.map((n, i) => (
                                <li key={`${n.at || i}-${i}`} className="rounded-xl border border-gray-200/70 bg-gray-50/60 px-3.5 py-2.5">
                                    <p className="text-sm text-gray-800 whitespace-pre-wrap">{n.text}</p>
                                    <p className="text-[11px] text-gray-500 mt-1">{n.byName || 'Super admin'} · {fmtDateTime(n.at)}</p>
                                </li>
                            ))}
                        </ul>
                    )}
                </section>

                {/* ── Email reminders (sent by the trial reminder job) ── */}
                <section>
                    <h3 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-gray-500 mb-2 inline-flex items-center gap-1.5">
                        <MailCheck size={12} /> Email reminders
                    </h3>
                    {reminders.length === 0 ? (
                        <p className="text-xs text-gray-400">No reminder emails yet.</p>
                    ) : (
                        <ul className="divide-y divide-gray-100 rounded-xl border border-gray-200/70">
                            {reminders.map((r, i) => (
                                <li key={`${r.type}-${r.queuedAt || i}`} className="flex items-center justify-between gap-3 px-3.5 py-2 text-sm">
                                    <span className="text-gray-800">{REMINDER_LABEL[r.type] || r.type}</span>
                                    {r.sentAt
                                        ? <span className="text-xs text-gray-500 tabular-nums">Sent {fmtDateTime(r.sentAt)}</span>
                                        : <Badge tone="warning">queued</Badge>}
                                </li>
                            ))}
                        </ul>
                    )}
                </section>
            </div>
        </ModalShell>
    );
};

export default SignupLeadModal;
