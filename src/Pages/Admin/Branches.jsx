import React, { useState, useCallback, useRef, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, Navigate } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import { useAuth } from '../../Context/AuthContext';
import {
    Plus, Edit2, Power, X, Building2, UserPlus, Copy, Check, RefreshCw,
    UtensilsCrossed, Search, MapPin, Phone, Mail, AlertTriangle,
    Users, ChevronDown, Loader2, Globe, Hash, Eye, EyeOff, Crown, Trash2, Link2
} from 'lucide-react';
import api from '../../utils/api';
import { SkeletonRows } from '../../Components/Common/Skeleton';
import ConfirmActionModal from './components/ConfirmActionModal';
import ShareLinkPanel from '../../Components/Common/ShareLinkPanel';
import { restaurantLink } from '../../utils/customerLinks';

/**
 * Admin → Branches (Phase 6 step 1).
 *
 * Tenant admin manages the physical locations of their restaurant.
 * Gated by the `multiBranch` feature flag — if the plan doesn't
 * include it, the backend returns FEATURE_LOCKED 403 and the
 * global UpgradePrompt modal (Phase 5 step 1) fires automatically.
 */
const emptyForm = {
    name: '', slug: '', displayLabel: '',
    addressLine1: '', addressLine2: '', city: '', state: '',
    postalCode: '', country: 'India',
    // Map coordinates — origin for the home-delivery distance.
    latitude: '', longitude: '',
    contactPhone: '', contactEmail: '',
};

const emptySubAdminForm = { name: '', email: '', phone: '' };

/* ── Skeleton card ─────────────────────────────────────────────── */
const SkeletonCard = () => (
    <div className="bg-white rounded-[20px] border border-gray-100 p-5 shadow-sm animate-pulse">
        <div className="flex items-start justify-between gap-3 mb-4">
            <div className="flex items-center gap-3 flex-1 min-w-0">
                <div className="w-11 h-11 rounded-xl bg-gray-100 shrink-0" />
                <div className="flex-1 min-w-0">
                    <div className="h-4 bg-gray-100 rounded-lg w-3/4 mb-2" />
                    <div className="h-3 bg-gray-50 rounded w-1/2" />
                </div>
            </div>
            <div className="h-5 w-16 bg-gray-100 rounded-full" />
        </div>
        <div className="space-y-2 mb-4">
            <div className="h-3 bg-gray-50 rounded w-full" />
            <div className="h-3 bg-gray-50 rounded w-2/3" />
        </div>
        <div className="flex gap-2">
            <div className="flex-1 h-9 bg-gray-50 rounded-xl" />
            <div className="flex-1 h-9 bg-gray-50 rounded-xl" />
            <div className="flex-1 h-9 bg-gray-50 rounded-xl" />
        </div>
    </div>
);

/* ── Form section wrapper ──────────────────────────────────────── */
const FormSection = ({ icon: Icon, title, description, children, className = '', accent = 'slate' }) => {
    const accents = {
        slate: 'bg-slate-100 text-slate-500',
        orange: 'bg-orange-50 text-[#FE8301]',
        blue: 'bg-blue-50 text-blue-600',
    };
    return (
        <div className={`bg-white border border-slate-200 rounded-xl p-4 shadow-sm ${className}`}>
            <div className="flex items-center gap-2.5 mb-1">
                {Icon && (
                    <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${accents[accent]}`}>
                        <Icon size={14} />
                    </div>
                )}
                <span className="text-sm font-bold text-slate-700 font-manrope">{title}</span>
            </div>
            {description && (
                <p className="text-[11px] text-slate-400 mb-3 ml-[38px] font-manrope">{description}</p>
            )}
            <div className="space-y-3">{children}</div>
        </div>
    );
};

/* ── Form input wrapper ────────────────────────────────────────── */
// `htmlFor` ties the label to the input that follows. `error` renders
// a red inline message under the field (with role="alert" + an id the
// input's aria-describedby can point at).
const FormField = ({ label, required, hint, error, htmlFor, children }) => (
    <div>
        <label htmlFor={htmlFor} className="block text-xs font-semibold text-slate-600 mb-1">
            {label} {required && <span className="text-rose-400" aria-hidden="true">*</span>}
            {hint && <span className="text-slate-400 font-normal ml-1">({hint})</span>}
        </label>
        {children}
        {error && (
            <p id={htmlFor ? `${htmlFor}-err` : undefined} role="alert" className="text-xs text-rose-400 mt-1 flex items-center gap-1">
                <span aria-hidden="true">⚠</span>{error}
            </p>
        )}
    </div>
);

const inputClass = 'w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm bg-white focus:outline-none focus:border-[#FE8301] focus:ring-2 focus:ring-[#FE8301]/10 transition-all placeholder:text-slate-300';

// Catalog of inheritances exposed in the "Sync from Main" section.
// Each entry maps directly to an initializeBranchX helper on the
// backend's updateBranch handler; the `key` is what the API expects
// in `syncFromMain.<key>: true`. Order matters: tables depend on
// areas (table.area is a foreign key), so areas come before tables
// and the backend runs them in this order when both are checked.
// Canonical list of Indian states + UTs. Used by the State <select>
// in the branch address form so every saved branch ends up with the
// same casing/spelling (no more "maharashtra" / "Maharastra" / "MH"
// mixed in the DB), which keeps customer-side branch cards and KOT
// invoices consistent. Sorted alphabetically; UTs grouped at the
// bottom with an option-group separator.
const INDIAN_STATES = [
    'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh',
    'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jharkhand', 'Karnataka',
    'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram',
    'Nagaland', 'Odisha', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu',
    'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal',
];
const INDIAN_UTS = [
    'Andaman & Nicobar Islands', 'Chandigarh', 'Dadra & Nagar Haveli and Daman & Diu',
    'Delhi', 'Jammu & Kashmir', 'Ladakh', 'Lakshadweep', 'Puducherry',
];

// Country list — start with India (default for this product), then a
// short tail of likely neighbours/expansion markets. Free-form via the
// "Other" option so we never block a tenant in a country we forgot.
const COUNTRIES = [
    'India',
    'Bangladesh', 'Bhutan', 'Maldives', 'Nepal', 'Pakistan', 'Sri Lanka',
    'United Arab Emirates', 'Saudi Arabia', 'Singapore', 'Malaysia', 'Thailand',
    'United Kingdom', 'United States', 'Canada', 'Australia',
];

// Indian PIN code: exactly 6 digits, first digit 1-9.
const PIN_REGEX = /^[1-9][0-9]{5}$/;

const SYNCABLE = [
    {
        key: 'categories',
        label: 'Categories',
        hint: 'Copies every menu category from Main (Beverages, Starters, Main Course…) so menu items have somewhere to land. Tick this BEFORE Menu — items reference categories by id.',
    },
    {
        key: 'menu',
        label: 'Menu items',
        hint: 'Copies every shared/Main menu item into this branch with default pricing. Use the per-branch price editor later to override any item.',
    },
    {
        key: 'combos',
        label: 'Combos',
        hint: 'Copies every combo from Main with its pricing and embedded items. Combos with a duplicate name are skipped.',
    },
    {
        key: 'areas',
        label: 'Areas',
        hint: 'Copies every area on the Main branch (Indoor, Outdoor, AC…) into this branch. Names that already exist are left alone.',
    },
    {
        key: 'tables',
        label: 'Tables',
        hint: 'Copies every table layout (name + capacity + area) from Main with a fresh QR code. Tables whose area is missing on this branch are skipped — tick "Areas" first or together for full coverage.',
    },
    {
        key: 'coupons',
        label: 'Coupons',
        hint: 'Copies every coupon code from Main into this branch with redemption counters reset to zero. Codes that already exist on this branch are skipped.',
    },
    {
        key: 'promotions',
        label: 'Promotions',
        hint: 'Copies every active banner / popup / featured-item promotion from Main. Promotions with a duplicate title are left alone.',
    },
    {
        key: 'halls',
        label: 'Halls',
        hint: 'Copies every banquet/event hall from Main into this branch (name, capacity, base price, amenities). Halls with a duplicate name are skipped.',
    },
    {
        key: 'eventTypes',
        label: 'Event Types',
        hint: 'Copies every event type from Main (Wedding, Birthday, Corporate…) so advance bookings can offer the same list at this branch.',
    },
    {
        key: 'packages',
        label: 'Packages',
        hint: 'Copies every banquet package from Main with its menu items, capacity, and pricing. Packages with a duplicate name are skipped.',
    },
    {
        key: 'decorations',
        label: 'Decorations',
        hint: 'Copies every decoration package from Main (themes, materials, setup, pricing). Decorations with a duplicate name are skipped.',
    },
    {
        key: 'addons',
        label: 'Add-ons',
        hint: 'Copies every booking add-on from Main (photographer, DJ, photobooth, custom slugs…). Add-ons with a duplicate slug are skipped.',
    },
];

const BranchesInner = () => {
    const { refreshUser, tenant } = useAuth();
    // Status filter pill: 'All' | 'Active' | 'Disabled' — matches the
    // pill pattern used across other admin tabs (Offers, Staff, Tables).
    const [statusFilter, setStatusFilter] = useState('Active');
    const [modalOpen, setModalOpen] = useState(false);
    const [editing, setEditing] = useState(null);
    const [form, setForm] = useState(emptyForm);
    const [saving, setSaving] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');

    // Tab inside the Edit modal — splits the form into 3 focused
    // panels (Details / Sync from Main / Branch Admin) instead of one
    // long scroll. Resets to 'details' on every open.
    const [editTab, setEditTab] = useState('details');

    // "Sync from Main" toggles — only used when editing a sub-branch.
    // Off by default so saving the form never pushes Main's data
    // unintentionally; admin must explicitly opt in per save. Each
    // key maps to a controller-side helper in updateBranch.
    const [syncFromMain, setSyncFromMain] = useState({
        categories: false,
        menu: false,
        combos: false,
        areas: false,
        tables: false,
        coupons: false,
        promotions: false,
        halls: false,
        eventTypes: false,
        packages: false,
        decorations: false,
        addons: false,
    });

    // Branch Admin fields (mandatory in create mode)
    const [subAdminForm, setSubAdminForm] = useState(emptySubAdminForm);
    // Success state — shows temp password after branch+subadmin creation
    const [createdResult, setCreatedResult] = useState(null);
    const [copied, setCopied] = useState(false);
    // Disable confirmation state
    const [disableTarget, setDisableTarget] = useState(null);
    const [disableCheck, setDisableCheck] = useState(null);
    const [disableCheckLoading, setDisableCheckLoading] = useState(false);
    const [disabling, setDisabling] = useState(false);
    // Hard-delete (permanent) confirmation state — separate from disable
    // so the two flows can never get crossed. `deleteConfirmText` is what
    // the admin types to unlock the destructive action.
    const [deleteTarget, setDeleteTarget] = useState(null);
    const [deleteConfirmText, setDeleteConfirmText] = useState('');
    const [deleting, setDeleting] = useState(false);
    // Form step for create mode
    const [formStep, setFormStep] = useState(1); // 1 = branch details, 2 = sub admin

    // Edit-mode Branch Admin management (derived from `editing`)
    const [subAdminEdit, setSubAdminEdit] = useState({ name: '', mobile: '' });
    const [savingSubAdmin, setSavingSubAdmin] = useState(false);
    const [resettingPassword, setResettingPassword] = useState(false);
    const [resetResult, setResetResult] = useState(null); // { tempPassword, ... }
    const [resetCopied, setResetCopied] = useState(false);
    // Attach-Sub-Admin (in Edit-mode, when the branch has no Branch Admin yet).
    // Reuses the same shape as the create-branch wizard's subAdminForm,
    // but lives separately so the two flows don't bleed state.
    const [attachForm, setAttachForm] = useState({ name: '', email: '', phone: '' });
    const [attachingSubAdmin, setAttachingSubAdmin] = useState(false);

    const modalRef = useRef(null);
    const mouseDownOnBackdropRef = useRef(false);

    // Branch list — always fetches everything; visibility is controlled
    // client-side so disabling the last branch doesn't wipe the UI.
    // The `load` shim covers post-mutation refetch sites.
    const { data: branchesRaw, isLoading: loading, refetch: refetchBranches } = useQuery({
        queryKey: ['admin', 'branches', 'manage'],
        queryFn: async () => {
            try {
                const res = await api.get('/branches', {
                    params: { includeInactive: 'true' },
                    _silent: true,
                });
                return res.data?.data || [];
            } catch (err) {
                if (err.response?.data?.code !== 'FEATURE_LOCKED') {
                    toast.error(err.response?.data?.message || 'Failed to load branches');
                }
                return [];
            }
        },
        staleTime: 60_000,
    });
    const branches = useMemo(() => branchesRaw ?? [], [branchesRaw]);
    const load = useCallback(() => { refetchBranches() }, [refetchBranches]);

    // Brand label = tenant identity. Prefer auth snapshot; if missing,
    // derive from the Main branch's name (it mirrors tenant identity
    // by contract). Used for sub-branch card display so each location
    // is rendered as "<Brand> - <Location>" even when the admin only
    // typed the location into the branch name field.
    const resolvedBrand = (tenant?.name || branches.find(b => b.slug === 'main')?.name || '').trim();

    // Computed stats — always reflect the full dataset.
    const activeBranches = branches.filter(b => b.isActive);
    const inactiveBranches = branches.filter(b => !b.isActive);

    const hasAnyBranches = branches.length > 0;
    const hasInactive = inactiveBranches.length > 0;

    // Client-side filter: status pill first (Active/Disabled/All), then search.
    const filteredBranches = branches.filter(b => {
        if (statusFilter === 'Active' && !b.isActive) return false;
        if (statusFilter === 'Disabled' && b.isActive) return false;
        if (!searchTerm.trim()) return true;
        const q = searchTerm.toLowerCase();
        return (
            b.name?.toLowerCase().includes(q) ||
            b.slug?.toLowerCase().includes(q) ||
            b.city?.toLowerCase().includes(q) ||
            b.addressLine1?.toLowerCase().includes(q) ||
            b.contactEmail?.toLowerCase().includes(q)
        );
    });

    const hiddenDisabledCount = statusFilter === 'Active' ? inactiveBranches.length : 0;

    // Direct customer link for one branch — skips the customer branch picker.
    const copyBranchLink = async (b) => {
        try {
            await navigator.clipboard.writeText(restaurantLink(tenant.slug, b.slug));
            toast.success('Branch link copied');
        } catch {
            toast.error('Could not copy the link');
        }
    };

    const openCreate = () => {
        setEditing(null);
        setForm(emptyForm);
        setSubAdminForm(emptySubAdminForm);
        setCreatedResult(null);
        setCopied(false);
        setFormStep(1);
        setSyncFromMain({ categories: false, menu: false, combos: false, areas: false, tables: false, coupons: false, promotions: false, halls: false, eventTypes: false, packages: false, decorations: false, addons: false });
        setModalOpen(true);
    };

    const openEdit = (b) => {
        setEditing(b);
        setAttachForm({ name: '', email: '', phone: '' });
        setForm({
            name: b.name || '',
            slug: b.slug || '',
            displayLabel: b.displayLabel || '',
            addressLine1: b.addressLine1 || '',
            addressLine2: b.addressLine2 || '',
            city: b.city || '',
            state: b.state || '',
            postalCode: b.postalCode || '',
            country: b.country || 'India',
            latitude: b.latitude ?? '',
            longitude: b.longitude ?? '',
            contactPhone: b.contactPhone || '',
            contactEmail: b.contactEmail || '',
        });
        setSubAdminEdit({
            name: b.subAdmin?.name || '',
            mobile: b.subAdmin?.mobile || '',
        });
        setResetResult(null);
        setResetCopied(false);
        setFormStep(1);
        setSyncFromMain({ categories: false, menu: false, combos: false, areas: false, tables: false, coupons: false, promotions: false, halls: false, eventTypes: false, packages: false, decorations: false, addons: false });
        setEditTab('details');
        setModalOpen(true);
    };

    const closeModal = () => {
        setModalOpen(false);
        setCreatedResult(null);
        setResetResult(null);
        setResetCopied(false);
    };

    // ── Branch Admin (edit mode) handlers ───────────────────────────
    const handleSaveSubAdmin = async () => {
        if (!editing?.subAdmin?._id) return;
        const name = subAdminEdit.name.trim();
        const mobile = subAdminEdit.mobile.trim();
        if (!name) { toast.error('Branch Admin name is required'); return; }
        if (name.length > 80) { toast.error('Branch Admin name cannot exceed 80 characters'); return; }

        // No-op: nothing changed.
        if (name === (editing.subAdmin.name || '') && mobile === (editing.subAdmin.mobile || '')) {
            toast('No changes to save', { icon: 'ℹ️' });
            return;
        }

        setSavingSubAdmin(true);
        try {
            const res = await api.patch(`/branches/${editing._id}/subadmin`, { name, mobile });
            const updated = res.data?.subAdmin;
            if (updated) {
                setEditing(prev => prev ? { ...prev, subAdmin: { ...prev.subAdmin, ...updated } } : prev);
                // List is owned by useQuery — refetch instead of optimistic
                // local mutate so the cache stays consistent across tab
                // switches and remounts.
                refetchBranches();
            }
            // Rehydrate the AuthContext user so the header reflects the new
            // name. Covers two cases: (a) the Branch Admin being edited IS the
            // logged-in user, or (b) the backend mirrored the edit onto the
            // tenant owner and the logged-in user is that owner.
            refreshUser();
            toast.success('Branch Admin updated');
        } catch (err) {
            const code = err.response?.data?.code;
            if (code === 'NO_SUBADMIN') {
                toast.error('No Branch Admin is assigned to this branch.');
            } else {
                toast.error(err.response?.data?.message || 'Failed to update Branch Admin');
            }
        } finally {
            setSavingSubAdmin(false);
        }
    };

    // Two-phase reset: openResetPasswordConfirm() shows the branded
    // ConfirmActionModal, doResetSubAdminPassword() runs only after the
    // user clicks Confirm. Replaces the previous native window.confirm
    // which broke the design language of the rest of this page.
    const [resetPasswordConfirmOpen, setResetPasswordConfirmOpen] = useState(false);

    const openResetPasswordConfirm = () => {
        if (!editing?.subAdmin?._id) return;
        setResetPasswordConfirmOpen(true);
    };

    const doResetSubAdminPassword = async () => {
        if (!editing?.subAdmin?._id) return;
        setResettingPassword(true);
        try {
            const res = await api.post(`/branches/${editing._id}/subadmin/reset-password`);
            setResetResult(res.data);
            setResetCopied(false);
            // Force mustChangePassword flag locally so the UI reflects the new state.
            setEditing(prev => prev ? { ...prev, subAdmin: { ...prev.subAdmin, mustChangePassword: true } } : prev);
            refetchBranches();
            toast.success('Password reset — copy it below');
        } catch (err) {
            const code = err.response?.data?.code;
            if (code === 'NO_SUBADMIN') {
                toast.error('No Branch Admin is assigned to this branch.');
            } else {
                toast.error(err.response?.data?.message || 'Failed to reset password');
            }
        } finally {
            setResettingPassword(false);
        }
    };

    const handleCopyResetPassword = () => {
        if (resetResult?.tempPassword) {
            navigator.clipboard.writeText(resetResult.tempPassword);
            setResetCopied(true);
            toast.success('Password copied');
            setTimeout(() => setResetCopied(false), 2000);
        }
    };

    // Attach a Branch Admin to a branch that doesn't have one yet.
    // Posts to the new POST /branches/:id/subadmin endpoint and
    // surfaces the returned temp password through the same
    // resetResult block used by the password-reset flow.
    const handleAttachSubAdmin = async () => {
        if (!editing?._id) return;
        const name = attachForm.name.trim();
        const email = attachForm.email.trim();
        const phone = attachForm.phone.trim();
        if (!name) { toast.error('Branch Admin name is required'); return; }
        if (!email) { toast.error('Branch Admin email is required'); return; }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            toast.error('Please enter a valid email address');
            return;
        }
        if (phone && !/^[6-9]\d{9}$/.test(phone)) {
            toast.error('Phone must be a 10-digit number starting with 6, 7, 8, or 9');
            return;
        }
        setAttachingSubAdmin(true);
        try {
            const res = await api.post(`/branches/${editing._id}/subadmin`, { name, email, phone });
            const created = res.data?.subAdmin;
            const tempPassword = res.data?.tempPassword;
            if (created) {
                // Attach the new Branch Admin to the in-memory `editing`
                // so the tab body re-renders into edit mode immediately.
                setEditing(prev => prev ? { ...prev, subAdmin: created } : prev);
                setSubAdminEdit({ name: created.name || '', mobile: created.mobile || '' });
                setAttachForm({ name: '', email: '', phone: '' });
            }
            if (tempPassword) {
                setResetResult({ tempPassword, subAdmin: created });
                setResetCopied(false);
            }
            refetchBranches();
            toast.success('Branch Admin created — copy the temporary password below');
        } catch (err) {
            const code = err.response?.data?.code;
            if (code === 'SUBADMIN_EXISTS') {
                toast.error('This branch already has a Branch Admin.');
            } else if (code === 'STAFF_LIMIT_REACHED') {
                toast.error(err.response?.data?.message || 'Staff limit reached. Upgrade your plan.');
            } else {
                toast.error(err.response?.data?.message || 'Failed to create Branch Admin');
            }
        } finally {
            setAttachingSubAdmin(false);
        }
    };

    // Per-field validation errors for the 2-step create / edit modal.
    // Keys: branchName, contactEmail (step 1) and subAdminName,
    // subAdminEmail, subAdminPhone (step 2). Replaces the previous
    // toast-on-validation pattern.
    const [formErrors, setFormErrors] = useState({});
    const clearError = (key) => {
        if (formErrors[key]) setFormErrors(prev => ({ ...prev, [key]: undefined }));
    };

    // Step 1 validation (branch details). Returns true if valid; on
    // failure, populates formErrors and focuses the first bad field.
    const validateStep1 = () => {
        const errs = {};
        if (!form.name.trim())                                                                       errs.branchName = 'Branch name is required';
        else if (form.name.trim().length > 80)                                                       errs.branchName = 'Branch name cannot exceed 80 characters';
        if (form.contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.contactEmail.trim()))       errs.contactEmail = 'Enter a valid contact email';
        setFormErrors(prev => ({
            ...prev,
            branchName: errs.branchName,
            contactEmail: errs.contactEmail,
        }));
        if (Object.keys(errs).length) {
            const firstBad = ['branchName', 'contactEmail'].find(k => errs[k]);
            if (firstBad) {
                setTimeout(() => {
                    const el = document.getElementById(firstBad);
                    if (el) { try { el.focus(); } catch { /* noop */ } el.scrollIntoView?.({ behavior: 'smooth', block: 'center' }); }
                }, 0);
            }
            return false;
        }
        return true;
    };

    // Handle "Next" in create mode (step 1 → step 2)
    const handleNextStep = () => {
        if (validateStep1()) setFormStep(2);
    };

    const handleSave = async (e) => {
        e.preventDefault();
        if (!validateStep1()) return;

        // The form has no native submit button on step 1, so pressing
        // Enter inside any step-1 input fires this handler. Treat that
        // as a Next-button press instead of running step-2 validation
        // (which would toast "Branch Admin name is required" against an
        // empty field the user hasn't seen yet).
        if (!editing && formStep === 1) {
            setFormStep(2);
            return;
        }

        // Branch Admin fields are mandatory in create mode. Validation
        // errors land on the relevant field (inline below the input).
        if (!editing) {
            const errs = {};
            if (!subAdminForm.name.trim())                                              errs.subAdminName = 'Branch Admin name is required';
            if (!subAdminForm.email.trim())                                             errs.subAdminEmail = 'Branch Admin email is required';
            else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(subAdminForm.email.trim()))     errs.subAdminEmail = 'Enter a valid email address';
            const phone = subAdminForm.phone.trim();
            if (phone && !/^[6-9]\d{9}$/.test(phone))                                   errs.subAdminPhone = 'Use a 10-digit number starting with 6, 7, 8, or 9';
            if (Object.keys(errs).length) {
                setFormErrors(prev => ({ ...prev, ...errs }));
                const order = ['subAdminName', 'subAdminEmail', 'subAdminPhone'];
                const firstBad = order.find(k => errs[k]);
                if (firstBad) {
                    setTimeout(() => {
                        const el = document.getElementById(firstBad);
                        if (el) { try { el.focus(); } catch { /* noop */ } el.scrollIntoView?.({ behavior: 'smooth', block: 'center' }); }
                    }, 0);
                }
                return;
            }
        }
        setSaving(true);
        try {
            if (editing) {
                // Pass the inheritance toggles only when this is a
                // sub-branch — the backend rejects sync onto Main but
                // we don't want to send irrelevant fields anyway.
                const isSubBranch = editing.slug !== 'main';
                const payload = isSubBranch
                    ? { ...form, syncFromMain }
                    : form;
                const res = await api.put(`/branches/${editing._id}`, payload);
                const sync = res.data?.sync || {};
                const parts = [];
                const summarize = (key, label) => {
                    if (typeof sync[key] === 'number' && sync[key] > 0) {
                        parts.push(`${sync[key]} ${label}`);
                    }
                };
                summarize('categories', 'categor(y/ies)');
                summarize('menu',       'menu item(s)');
                summarize('combos',     'combo(s)');
                summarize('areas',      'area(s)');
                summarize('tables',     'table(s)');
                summarize('coupons',    'coupon(s)');
                summarize('promotions', 'promotion(s)');
                summarize('halls',      'hall(s)');
                summarize('eventTypes', 'event type(s)');
                summarize('packages',   'package(s)');
                summarize('decorations','decoration(s)');
                summarize('addons',     'add-on(s)');
                toast.success(parts.length
                    ? `Branch updated. Synced from Main: ${parts.join(' + ')}.`
                    : 'Branch updated');
                // Surface any per-key sync errors so the admin sees
                // which inheritance failed without losing the branch save.
                ['categories', 'menu', 'combos', 'areas', 'tables', 'coupons', 'promotions', 'halls', 'eventTypes', 'packages', 'decorations', 'addons'].forEach(k => {
                    if (sync[k]?.error) toast.error(`${k} sync failed: ${sync[k].error}`);
                });
                setModalOpen(false);
            } else {
                const payload = {
                    ...form,
                    managerName: subAdminForm.name.trim(),
                    managerEmail: subAdminForm.email.trim(),
                    // "Copy from Main" — pass the same syncFromMain
                    // shape the Edit form uses so the new branch can
                    // be seeded with Main's menu / areas / tables /
                    // coupons / promotions in the same request.
                    // Unchecked keys = clean start (the default).
                    syncFromMain,
                };
                if (subAdminForm.phone.trim()) payload.managerPhone = subAdminForm.phone.trim();

                const res = await api.post('/branches', payload);
                const data = res.data;

                // Summarize what got cloned so the admin sees confirmation
                // of the sync alongside the branch+admin creation.
                const sync = data.sync || {};
                const parts = [];
                const summarize = (key, label) => {
                    if (typeof sync[key] === 'number' && sync[key] > 0) parts.push(`${sync[key]} ${label}`);
                };
                summarize('categories', 'categor(y/ies)');
                summarize('menu',       'menu item(s)');
                summarize('combos',     'combo(s)');
                summarize('areas',      'area(s)');
                summarize('tables',     'table(s)');
                summarize('coupons',    'coupon(s)');
                summarize('promotions', 'promotion(s)');
                summarize('halls',      'hall(s)');
                summarize('eventTypes', 'event type(s)');
                summarize('packages',   'package(s)');
                summarize('decorations','decoration(s)');
                summarize('addons',     'add-on(s)');
                ['categories', 'menu', 'combos', 'areas', 'tables', 'coupons', 'promotions', 'halls', 'eventTypes', 'packages', 'decorations', 'addons'].forEach(k => {
                    if (sync[k]?.error) toast.error(`${k} sync failed: ${sync[k].error}`);
                });

                if (data.manager?.created) {
                    toast.success(parts.length
                        ? `Branch & Branch Admin created. Copied from Main: ${parts.join(' + ')}.`
                        : 'Branch & Branch Admin created');
                    setCreatedResult(data);
                } else {
                    toast.success(parts.length
                        ? `Branch created. Copied from Main: ${parts.join(' + ')}.`
                        : 'Branch created');
                    setModalOpen(false);
                }
            }
            await load();
        } catch (err) {
            const code = err.response?.data?.code;
            const msg = err.response?.data?.message;
            if (code === 'SLUG_TAKEN') {
                toast.error('That slug is already in use by another branch.');
            } else if (code === 'BRANCH_LIMIT_REACHED') {
                toast.error(msg || 'Branch limit reached. Upgrade your plan.');
            } else if (code === 'STAFF_LIMIT_REACHED') {
                toast.error(msg || 'Staff limit reached. Upgrade your plan.');
            } else if (code === 'FEATURE_LOCKED') {
                toast.error('Multi-branch feature is not available on your current plan.');
            } else {
                toast.error(msg || 'Save failed');
            }
        } finally {
            setSaving(false);
        }
    };

    const handleCopyPassword = () => {
        if (createdResult?.manager?.tempPassword) {
            navigator.clipboard.writeText(createdResult.manager.tempPassword);
            setCopied(true);
            toast.success('Password copied');
            setTimeout(() => setCopied(false), 2000);
        }
    };

    /* ── Disable flow with pre-check ─────────────────────────────── */
    const initiateDisable = async (branch) => {
        setDisableTarget(branch);
        setDisableCheckLoading(true);
        setDisableCheck(null);
        try {
            const res = await api.get(`/branches/${branch._id}/disable-check`);
            setDisableCheck(res.data);
        } catch {
            // If pre-check fails, still allow with a basic confirmation
            setDisableCheck({ canDisable: true, blockers: {}, warnings: {} });
        } finally {
            setDisableCheckLoading(false);
        }
    };

    const confirmDisable = async () => {
        if (!disableTarget) return;
        setDisabling(true);
        try {
            await api.delete(`/branches/${disableTarget._id}`);
            const staffCount = disableTarget.staffUnassigned || 0;
            toast.success(`Branch "${disableTarget.name}" disabled${staffCount > 0 ? ` (${staffCount} staff unassigned)` : ''}`);
            await load();
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to disable branch');
        } finally {
            setDisabling(false);
            setDisableTarget(null);
            setDisableCheck(null);
        }
    };

    const handleReactivate = async (branch) => {
        try {
            await api.patch(`/branches/${branch._id}/reactivate`);
            toast.success(`"${branch.name}" reactivated`);
            await load();
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to reactivate branch');
        }
    };

    /* ── Permanent delete flow ─────────────────────────────────────
     * Hard delete wipes the branch row + every branch-scoped catalogue
     * (Settings, Areas, Tables, Coupons, Promotions, Halls, Recipes,
     * Inventory, Categories, Notifications, Requests), removes the
     * Branch Admin user, unassigns other staff, and pulls the branch's
     * entries from MenuItem.branchPrices. Historical Orders /
     * Transactions / Reservations / AdvanceBookings are preserved
     * (dangling branch ref is acceptable for audit). The admin must
     * type the branch name to confirm — typo-proof guard against
     * misclicking the wrong card.
     */
    const initiateDelete = (branch) => {
        setDeleteTarget(branch);
        setDeleteConfirmText('');
    };

    const closeDeleteModal = () => {
        if (deleting) return;
        setDeleteTarget(null);
        setDeleteConfirmText('');
    };

    const confirmDelete = async () => {
        if (!deleteTarget) return;
        if (deleteConfirmText.trim() !== deleteTarget.name) return;
        setDeleting(true);
        try {
            await api.delete(`/branches/${deleteTarget._id}/permanent`);
            toast.success(`Branch "${deleteTarget.name}" permanently deleted`);
            await load();
            setDeleteTarget(null);
            setDeleteConfirmText('');
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to delete branch');
        } finally {
            setDeleting(false);
        }
    };

    // Build full address text for a branch (one continuous string —
    // still used for fallback / search / accessibility labels).
    const formatAddress = (b) => {
        const parts = [b.addressLine1, b.addressLine2, b.city, b.state, b.postalCode].filter(Boolean);
        return parts.join(', ');
    };

    // Split a branch address into two visual layers for the card body:
    //   • street: line1 + line2 (the part that names the building / road)
    //   • region: city · state · postalCode · country (locality info)
    // Dedupes case-insensitively so a record like {city:'Pune', state:'Pune'}
    // doesn't render "Pune · Pune" (legacy data quirk we've actually hit).
    const splitAddress = (b) => {
        const street = [b.addressLine1, b.addressLine2].filter(Boolean).join(', ');
        const seen = new Set();
        const region = [b.city, b.state, b.postalCode, b.country]
            .map(p => (p || '').trim())
            .filter(p => {
                if (!p) return false;
                const k = p.toLowerCase();
                if (seen.has(k)) return false;
                seen.add(k);
                return true;
            })
            .join(' · ');
        return { street, region };
    };

    return (
        <div className="h-full flex flex-col font-manrope">
            {/* ── Header — matches Offers / Staff / Tables ─────────────── */}
            <div className="flex items-center justify-between mb-6 gap-4 flex-wrap">
                <div>
                    <h1 className="font-manrope font-[700] text-[20px] leading-[26px] text-[#1A181B]">Branches</h1>
                    <p className="font-semibold text-[14px] leading-[20px] text-[#645E66] mt-1 font-manrope">
                        Manage your restaurant locations and their Branch Admins
                    </p>
                </div>
                <div className="flex items-center gap-2.5">
                    {/* "Sync All" button intentionally removed —
                        inheritance is now opt-in per-branch via the
                        Edit modal's "Sync from Main" toggles. */}
                    <button
                        type="button"
                        onClick={openCreate}
                        className="flex items-center gap-2 px-5 py-2.5 bg-[#FE8301] text-white rounded-xl text-[14px] font-semibold hover:bg-orange-600 transition-colors shadow-sm"
                    >
                        <Plus size={18} strokeWidth={2.5} />
                        Add Branch
                    </button>
                </div>
            </div>

            {/* ── Stats summary — Offers-style cards ───────────────────── */}
            {!loading && hasAnyBranches && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                    <div className="p-5 bg-white rounded-[16px] border border-gray-100 shadow-sm flex items-center justify-between">
                        <div>
                            <p className="text-[13px] font-medium text-gray-500 mb-2">Total Branches</p>
                            <span className="text-[22px] font-bold text-[#1A181B]">{branches.length}</span>
                        </div>
                        <div className="w-11 h-11 rounded-xl bg-orange-50 text-[#FE8301] flex items-center justify-center shrink-0">
                            <Building2 size={20} strokeWidth={2.2} />
                        </div>
                    </div>
                    <div className="p-5 bg-white rounded-[16px] border border-gray-100 shadow-sm flex items-center justify-between">
                        <div>
                            <p className="text-[13px] font-medium text-gray-500 mb-2">Active</p>
                            <span className="text-[22px] font-bold text-[#22C55E]">{activeBranches.length}</span>
                        </div>
                        <div className="w-11 h-11 rounded-xl bg-[#F0FDF4] text-[#22C55E] flex items-center justify-center shrink-0">
                            <Check size={20} strokeWidth={2.5} />
                        </div>
                    </div>
                    <div className="p-5 bg-white rounded-[16px] border border-gray-100 shadow-sm flex items-center justify-between">
                        <div>
                            <p className="text-[13px] font-medium text-gray-500 mb-2">Disabled</p>
                            <span className={`text-[22px] font-bold ${hasInactive ? 'text-[#1A181B]' : 'text-gray-300'}`}>
                                {inactiveBranches.length}
                            </span>
                        </div>
                        <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${
                            hasInactive ? 'bg-gray-100 text-gray-500' : 'bg-gray-50 text-gray-300'
                        }`}>
                            <Power size={20} strokeWidth={2.2} />
                        </div>
                    </div>
                    <div className="p-5 bg-white rounded-[16px] border border-gray-100 shadow-sm flex items-center justify-between">
                        <div>
                            <p className="text-[13px] font-medium text-gray-500 mb-2">Branch Admins</p>
                            <span className="text-[22px] font-bold text-[#1A181B]">
                                {activeBranches.filter(b => b.subAdmin && !b.subAdmin.isOwner).length}
                            </span>
                        </div>
                        <div className="w-11 h-11 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                            <UserPlus size={20} strokeWidth={2.2} />
                        </div>
                    </div>
                </div>
            )}

            {/* ── Customer link — restaurant-level entry + QR ───────── */}
            {!loading && tenant?.slug && (
                <div className="mb-6 bg-white rounded-[16px] border border-gray-100 shadow-sm p-5">
                    <div className="mb-4">
                        <h2 className="font-manrope font-[700] text-[16px] text-[#1A181B]">Customer ordering link</h2>
                        <p className="text-[13px] text-gray-500 mt-0.5 font-manrope">
                            Share it on WhatsApp, Instagram or Google Maps — customers open your restaurant directly
                            {activeBranches.length > 1 ? ' and pick a branch' : ''}. Use a branch card's Link button to send customers straight to that branch.
                        </p>
                    </div>
                    <ShareLinkPanel url={restaurantLink(tenant.slug)} qrFileName={`${tenant.slug}-qr`} />
                </div>
            )}

            {/* ── Filter pills — matches Tables / Offers / Staff pattern ── */}
            {!loading && hasAnyBranches && (
                <div className="flex items-center gap-1 mb-4 overflow-x-auto pb-1 no-scrollbar">
                    {[
                        { key: 'All',      label: 'All',      count: branches.length },
                        { key: 'Active',   label: 'Active',   count: activeBranches.length },
                        { key: 'Disabled', label: 'Disabled', count: inactiveBranches.length },
                    ].map(pill => {
                        const isActive = statusFilter === pill.key;
                        const isEmpty = pill.count === 0;
                        return (
                            <button
                                key={pill.key}
                                type="button"
                                onClick={() => setStatusFilter(pill.key)}
                                className={`h-[36px] px-4 py-2 rounded-[50px] text-[14px] leading-[20px] font-manrope font-[600] border-[1.5px] transition-all whitespace-nowrap inline-flex items-center gap-2 ${
                                    isActive
                                        ? 'bg-white text-[#702083] border-[#702083] shadow-[0px_2px_8px_0px_#00000029]'
                                        : isEmpty
                                            ? 'bg-[#F9FAFB] text-[#98A2B3] border-[#F2F4F7] hover:bg-[#F2F4F7]'
                                            : 'bg-white text-[#344054] border-[#D0D5DD] hover:bg-gray-50'
                                }`}
                            >
                                {pill.label}
                                <span className={`inline-flex items-center justify-center min-w-[22px] h-[20px] px-1.5 text-[11px] font-bold rounded-full ${
                                    isActive
                                        ? 'bg-[#702083] text-white'
                                        : 'bg-gray-100 text-gray-600'
                                }`}>
                                    {pill.count}
                                </span>
                            </button>
                        );
                    })}
                </div>
            )}

            {/* ── Search bar — matches Staff / Tables panel style ──────── */}
            {!loading && hasAnyBranches && (
                <div className="flex flex-wrap items-center gap-3 mb-6 bg-white p-4 rounded-xl border border-gray-100 shadow-sm">
                    <div className="flex-1 relative min-w-[220px]">
                        <Search size={20} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                        <input
                            type="text"
                            placeholder="Search by name, city, slug, or email…"
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                            className="w-full pl-12 pr-4 py-3 bg-white border border-gray-200 rounded-xl focus:outline-none focus:border-orange-500 font-inter font-medium text-[14px] leading-[20px] focus:ring-2 focus:ring-orange-500/10 transition-all placeholder:text-gray-400"
                        />
                    </div>
                    <button
                        type="button"
                        className="w-10 h-10 flex items-center justify-center bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors"
                    >
                        <Search size={20} />
                    </button>
                </div>
            )}

            {/* ── Banner: disabled branches hidden by filter ─────── */}
            {!loading && hiddenDisabledCount > 0 && filteredBranches.length > 0 && (
                <div className="flex items-start sm:items-center justify-between gap-3 mb-5 px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl flex-wrap sm:flex-nowrap">
                    <div className="flex items-start sm:items-center gap-2 text-[13px] text-amber-700 font-medium">
                        <EyeOff size={15} className="shrink-0 mt-0.5 sm:mt-0" />
                        <span>
                            <strong className="font-bold">{hiddenDisabledCount}</strong> disabled branch{hiddenDisabledCount === 1 ? '' : 'es'} hidden from view.
                        </span>
                    </div>
                    <button
                        type="button"
                        onClick={() => setStatusFilter('All')}
                        className="text-[13px] font-semibold text-amber-800 hover:text-amber-900 underline underline-offset-2 shrink-0"
                    >
                        Show them
                    </button>
                </div>
            )}

            {/* ── Content ──────────────────────────────────────────── */}
            {loading ? (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
                    {[1, 2, 3].map(i => <SkeletonCard key={i} />)}
                </div>
            ) : !hasAnyBranches ? (
                <div className="bg-white rounded-[20px] border border-gray-100 p-10 sm:p-14 text-center shadow-sm">
                    <div className="w-16 h-16 bg-orange-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
                        <Building2 size={32} className="text-[#FE8301]" />
                    </div>
                    <h3 className="text-[18px] font-bold text-[#1A181B] mb-1.5 font-manrope">No branches yet</h3>
                    <p className="text-[14px] text-gray-500 mb-6 max-w-sm mx-auto font-manrope">
                        Create your first branch to start managing multiple locations for your restaurant.
                    </p>
                    <button
                        type="button"
                        onClick={openCreate}
                        className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#FE8301] hover:bg-orange-600 text-white text-[14px] font-semibold rounded-xl transition shadow-sm"
                    >
                        <Plus size={18} strokeWidth={2.5} />
                        Add your first branch
                    </button>
                </div>
            ) : filteredBranches.length === 0 && searchTerm.trim() ? (
                <div className="bg-white rounded-[20px] border border-gray-100 p-12 text-center shadow-sm">
                    <Search size={36} className="text-gray-300 mx-auto mb-3" />
                    <p className="text-[14px] text-gray-500 font-manrope mb-3">
                        No branches match "<strong className="text-[#1A181B]">{searchTerm}</strong>"
                    </p>
                    <button
                        type="button"
                        onClick={() => setSearchTerm('')}
                        className="text-[13px] font-semibold text-[#FE8301] hover:text-orange-600"
                    >
                        Clear search
                    </button>
                </div>
            ) : filteredBranches.length === 0 && hiddenDisabledCount > 0 ? (
                <div className="bg-white rounded-[20px] border border-gray-100 p-10 sm:p-14 text-center shadow-sm">
                    <div className="w-16 h-16 bg-gray-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
                        <EyeOff size={28} className="text-gray-400" />
                    </div>
                    <h3 className="text-[18px] font-bold text-[#1A181B] mb-1.5 font-manrope">All branches are disabled</h3>
                    <p className="text-[14px] text-gray-500 mb-6 max-w-sm mx-auto font-manrope">
                        You have <strong className="text-[#1A181B]">{hiddenDisabledCount}</strong> disabled branch{hiddenDisabledCount === 1 ? '' : 'es'}. Show them to reactivate, or add a new one.
                    </p>
                    <div className="flex items-center justify-center gap-2.5 flex-wrap">
                        <button
                            type="button"
                            onClick={() => setStatusFilter('Disabled')}
                            className="inline-flex items-center gap-2 px-4 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 text-[14px] font-semibold rounded-xl transition"
                        >
                            <Eye size={16} />
                            Show disabled
                        </button>
                        <button
                            type="button"
                            onClick={openCreate}
                            className="inline-flex items-center gap-2 px-4 py-2.5 bg-[#FE8301] hover:bg-orange-600 text-white text-[14px] font-semibold rounded-xl transition shadow-sm"
                        >
                            <Plus size={16} strokeWidth={2.5} />
                            Add branch
                        </button>
                    </div>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
                    {filteredBranches.map(b => {
                        const isMain = b.slug === 'main';
                        return (
                        <div
                            key={b._id}
                            className={`group relative bg-white rounded-[20px] border p-5 shadow-sm transition-all duration-200 hover:shadow-md flex flex-col ${
                                !b.isActive
                                    ? 'border-dashed border-gray-300 bg-gray-50/40'
                                    : isMain
                                        ? 'border-amber-200 hover:border-amber-300 ring-1 ring-amber-100'
                                        : 'border-gray-100 hover:border-[#FE8301]/40'
                            }`}
                        >
                            {/* Diagonal "disabled" strip — subtle but unmistakable */}
                            {!b.isActive && (
                                <div className="absolute top-0 right-0 w-16 h-16 overflow-hidden rounded-tr-[20px] pointer-events-none">
                                    <div className="absolute top-3 right-[-28px] rotate-45 bg-gray-400 text-white text-[9px] font-bold px-8 py-0.5 tracking-wider uppercase shadow-sm">
                                        Off
                                    </div>
                                </div>
                            )}

                            {/* Card header */}
                            <div className="flex items-start justify-between gap-3 mb-4">
                                <div className="flex items-center gap-3 flex-1 min-w-0">
                                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 text-[17px] font-bold ${
                                        !b.isActive
                                            ? 'bg-gray-200 text-gray-500'
                                            : isMain
                                                ? 'bg-gradient-to-br from-amber-100 to-amber-200 text-amber-700'
                                                : 'bg-gradient-to-br from-orange-50 to-orange-100 text-[#FE8301]'
                                    }`}>
                                        {isMain
                                            ? <Crown size={20} />
                                            : (b.name?.[0]?.toUpperCase() || 'B')}
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            {/* Display name = "<Brand> - <Location>" for
                                                sub-branches. Main branch keeps its raw name
                                                (it IS the brand). If the admin already typed
                                                the brand inline (e.g. "Hotel Tip Top - FC
                                                Road"), use the name as-is to avoid duplicate
                                                "Hotel Tip Top - Hotel Tip Top - FC Road". */}
                                            <h3 className={`text-[16px] font-bold truncate font-manrope ${
                                                b.isActive ? 'text-[#1A181B]' : 'text-gray-500'
                                            }`}>{(() => {
                                                // Short location preference: explicit displayLabel,
                                                // then addressLine1, then city. Falls back to the
                                                // bare brand/name when none of those are set.
                                                const location = String(b.displayLabel || b.addressLine1 || b.city || '').trim();
                                                if (isMain) {
                                                    return location ? `${b.name} - ${location}` : b.name;
                                                }
                                                const name = String(b.name || '').trim();
                                                if (!resolvedBrand) return name;
                                                if (name.toLowerCase().startsWith(resolvedBrand.toLowerCase())) return name;
                                                return `${resolvedBrand} - ${name}`;
                                            })()}</h3>
                                            {isMain && (
                                                <span className="text-[10px] font-bold tracking-wider uppercase px-1.5 py-[2px] rounded bg-amber-100 text-amber-700 border border-amber-200 shrink-0">
                                                    Main
                                                </span>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-1 text-[12px] text-gray-400 font-mono mt-0.5">
                                            <Hash size={11} />
                                            {b.slug}
                                        </div>
                                    </div>
                                </div>
                                <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full shrink-0 inline-flex items-center gap-1.5 border ${
                                    b.isActive
                                        ? 'text-[#22C55E] bg-[#F0FDF4] border-[#22C55E]'
                                        : 'text-gray-500 bg-gray-50 border-gray-300'
                                }`}>
                                    <span className={`w-1.5 h-1.5 rounded-full ${
                                        b.isActive ? 'bg-[#22C55E]' : 'bg-gray-400'
                                    }`} />
                                    {b.isActive ? 'Active' : 'Disabled'}
                                </span>
                            </div>

                            {/* Branch Admin chip — surface who runs this branch.
                                On the Main branch with no pinned Branch Admin the
                                backend falls back to the tenant owner; we render
                                that as "Owner" in amber to match the Main crown
                                so it doesn't look like a regular Branch Admin. */}
                            {b.subAdmin && (
                                <div className={`flex items-center gap-2.5 px-3 py-2 mb-3 rounded-xl border ${
                                    b.subAdmin.isOwner
                                        ? 'bg-amber-50/60 border-amber-100'
                                        : 'bg-blue-50/60 border-blue-100'
                                }`}>
                                    <div className={`w-7 h-7 rounded-lg flex items-center justify-center font-bold text-[12px] shrink-0 ${
                                        b.subAdmin.isOwner
                                            ? 'bg-amber-100 text-amber-700'
                                            : 'bg-blue-100 text-blue-700'
                                    }`}>
                                        {b.subAdmin.isOwner
                                            ? <Crown size={13} />
                                            : (b.subAdmin.name?.[0]?.toUpperCase() || 'S')}
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <div className="text-[12px] font-semibold text-[#1A181B] truncate font-manrope">{b.subAdmin.name}</div>
                                        <div className="text-[11px] text-gray-500 truncate">{b.subAdmin.email}</div>
                                    </div>
                                    <span className={`text-[9px] font-bold tracking-wider uppercase px-1.5 py-[2px] rounded shrink-0 ${
                                        b.subAdmin.isOwner
                                            ? 'bg-amber-100 text-amber-700'
                                            : 'bg-blue-100 text-blue-700'
                                    }`}>
                                        {b.subAdmin.isOwner ? 'Owner' : 'Branch Admin'}
                                    </span>
                                </div>
                            )}

                            {/* Card body — structured into Address + Contact panels
                                instead of a flat icon-prefixed list. The panel
                                background (gray-50/40) visually nests the data
                                inside the card, giving each block clear edges
                                without heavy borders. */}
                            {(() => {
                                const { street, region } = splitAddress(b);
                                // De-dupe: if the branch's "contact" email matches
                                // the Branch Admin's email there's no value in
                                // showing it twice on a small card.
                                const showContactEmail = b.contactEmail
                                    && (!b.subAdmin || b.subAdmin.email?.toLowerCase() !== b.contactEmail.toLowerCase());
                                const hasContact = b.contactPhone || showContactEmail;
                                return (
                                    <div className="rounded-xl bg-gray-50/60 border border-gray-100 p-3 mb-4 space-y-3 min-h-[88px]">
                                        {/* ── Address block ── */}
                                        <div className="flex items-start gap-2.5">
                                            <div className="w-7 h-7 rounded-lg bg-white border border-gray-100 text-gray-400 flex items-center justify-center shrink-0">
                                                <MapPin size={13} />
                                            </div>
                                            <div className="min-w-0 flex-1">
                                                <div className="text-[10px] font-bold uppercase tracking-wider text-gray-400 font-manrope mb-0.5">
                                                    Address
                                                </div>
                                                {street || region ? (
                                                    <>
                                                        {street && (
                                                            <div className="text-[13px] font-semibold text-[#1A181B] leading-snug line-clamp-2">
                                                                {street}
                                                            </div>
                                                        )}
                                                        {region && (
                                                            <div className="text-[12px] text-gray-500 leading-snug mt-0.5">
                                                                {region}
                                                            </div>
                                                        )}
                                                    </>
                                                ) : (
                                                    <div className="text-[12px] text-gray-300 italic">No address added</div>
                                                )}
                                            </div>
                                        </div>

                                        {/* ── Contact row (phone + email side-by-side) ── */}
                                        {hasContact && (
                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-3 border-t border-gray-200/70">
                                                {b.contactPhone ? (
                                                    <a
                                                        href={`tel:${b.contactPhone}`}
                                                        className="inline-flex items-center gap-2 text-[12px] text-gray-700 hover:text-[#FE8301] transition-colors font-medium min-w-0"
                                                        title={`Call ${b.contactPhone}`}
                                                    >
                                                        <Phone size={12} className="text-gray-400 shrink-0" />
                                                        <span className="truncate">{b.contactPhone}</span>
                                                    </a>
                                                ) : <span />}
                                                {showContactEmail ? (
                                                    <a
                                                        href={`mailto:${b.contactEmail}`}
                                                        className="inline-flex items-center gap-2 text-[12px] text-gray-700 hover:text-[#FE8301] transition-colors font-medium min-w-0"
                                                        title={`Email ${b.contactEmail}`}
                                                    >
                                                        <Mail size={12} className="text-gray-400 shrink-0" />
                                                        <span className="truncate">{b.contactEmail}</span>
                                                    </a>
                                                ) : <span />}
                                            </div>
                                        )}
                                    </div>
                                );
                            })()}

                            {/* Card actions */}
                            <div className="flex gap-2 border-t border-gray-100 pt-3 mt-auto">
                                {b.isActive && tenant?.slug && (
                                    <button
                                        type="button"
                                        onClick={() => copyBranchLink(b)}
                                        className="flex-1 inline-flex items-center justify-center gap-1.5 py-2.5 bg-orange-50 hover:bg-orange-100 text-[#FE8301] text-[12px] font-semibold rounded-xl transition"
                                        title="Copy this branch's customer link"
                                    >
                                        <Link2 size={13} />
                                        <span className="hidden sm:inline">Link</span>
                                    </button>
                                )}
                                <button
                                    type="button"
                                    onClick={() => openEdit(b)}
                                    className="flex-1 inline-flex items-center justify-center gap-1.5 py-2.5 bg-gray-50 hover:bg-gray-100 text-gray-700 text-[12px] font-semibold rounded-xl transition"
                                    title="Edit branch details"
                                >
                                    <Edit2 size={13} />
                                    <span className="hidden sm:inline">Edit</span>
                                </button>
                                {isMain ? (
                                    <button
                                        type="button"
                                        disabled
                                        aria-disabled="true"
                                        className="flex-1 inline-flex items-center justify-center gap-1.5 py-2.5 text-[12px] font-semibold rounded-xl bg-gray-50 text-gray-400 cursor-not-allowed"
                                        title="Main branch cannot be disabled — it represents your primary location."
                                    >
                                        <Power size={13} />
                                        <span className="hidden sm:inline">Disable</span>
                                    </button>
                                ) : (
                                    <button
                                        type="button"
                                        onClick={() => b.isActive ? initiateDisable(b) : handleReactivate(b)}
                                        className={`flex-1 inline-flex items-center justify-center gap-1.5 py-2.5 text-[12px] font-semibold rounded-xl transition ${
                                            b.isActive
                                                ? 'bg-rose-50 hover:bg-rose-100 text-rose-600'
                                                : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-600'
                                        }`}
                                        title={b.isActive ? 'Disable this branch' : 'Reactivate this branch'}
                                    >
                                        <Power size={13} />
                                        <span className="hidden sm:inline">{b.isActive ? 'Disable' : 'Reactivate'}</span>
                                    </button>
                                )}
                                {/* Permanent delete — icon-only to keep the action
                                    row compact. Disabled on the Main branch
                                    (server-side guard is the source of truth, but
                                    we surface that constraint in the UI too). */}
                                {isMain ? (
                                    <button
                                        type="button"
                                        disabled
                                        aria-disabled="true"
                                        className="w-10 inline-flex items-center justify-center py-2.5 text-[12px] font-semibold rounded-xl bg-gray-50 text-gray-300 cursor-not-allowed"
                                        title="Main branch cannot be deleted."
                                    >
                                        <Trash2 size={14} />
                                    </button>
                                ) : (
                                    <button
                                        type="button"
                                        onClick={() => initiateDelete(b)}
                                        className="w-10 inline-flex items-center justify-center py-2.5 bg-red-50 hover:bg-red-600 text-red-600 hover:text-white text-[12px] font-semibold rounded-xl transition"
                                        title="Delete this branch permanently"
                                        aria-label={`Delete branch ${b.name} permanently`}
                                    >
                                        <Trash2 size={14} />
                                    </button>
                                )}
                            </div>
                        </div>
                        );
                    })}
                </div>
            )}

            {/* ── Disable confirmation modal ────────────────────────── */}
            {disableTarget && (
                <div
                    className="fixed inset-0 z-50 bg-black/30 backdrop-blur-sm flex items-center justify-center p-4 font-manrope"
                    onMouseDown={e => {
                        mouseDownOnBackdropRef.current = e.target === e.currentTarget;
                    }}
                    onMouseUp={e => {
                        const wasOnBackdrop = mouseDownOnBackdropRef.current;
                        mouseDownOnBackdropRef.current = false;
                        if (wasOnBackdrop && e.target === e.currentTarget && !disabling) {
                            setDisableTarget(null);
                            setDisableCheck(null);
                        }
                    }}
                >
                    <div
                        className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 flex flex-col items-center gap-4 relative"
                        onMouseDown={e => e.stopPropagation()}
                    >
                        <button
                            onClick={() => { setDisableTarget(null); setDisableCheck(null); }}
                            className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 transition"
                        >
                            <X size={18} />
                        </button>

                        {disableCheckLoading ? (
                            <div className="py-8 flex flex-col items-center gap-3">
                                <Loader2 size={24} className="text-[#FE8301] animate-spin" />
                                <p className="text-sm text-slate-400">Checking branch status…</p>
                            </div>
                        ) : (
                            <>
                                <div className={`w-14 h-14 rounded-full flex items-center justify-center ${
                                    disableCheck?.canDisable === false ? 'bg-rose-50' : 'bg-orange-50'
                                }`}>
                                    <AlertTriangle size={28} className={
                                        disableCheck?.canDisable === false ? 'text-rose-400' : 'text-orange-400'
                                    } strokeWidth={2} />
                                </div>

                                <div className="text-center px-2">
                                    <h3 className="text-lg font-bold text-slate-900 mb-1.5">
                                        {disableCheck?.canDisable === false ? 'Cannot Disable' : `Disable "${disableTarget.name}"?`}
                                    </h3>

                                    {/* Blockers */}
                                    {disableCheck?.blockers?.activeOrders > 0 && (
                                        <div className="bg-rose-50 border border-rose-200 rounded-xl p-3 text-left mb-3">
                                            <p className="text-xs font-semibold text-rose-700 mb-1">Blockers</p>
                                            <p className="text-xs text-rose-600">
                                                This branch has <strong>{disableCheck.blockers.activeOrders}</strong> active order(s).
                                                Complete or cancel them before disabling.
                                            </p>
                                        </div>
                                    )}

                                    {/* Warnings */}
                                    {disableCheck?.canDisable !== false && (
                                        <>
                                            {(disableCheck?.warnings?.assignedStaff > 0 || disableCheck?.warnings?.assignedTables > 0) && (
                                                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-left mb-3">
                                                    <p className="text-xs font-semibold text-amber-700 mb-1">Heads up</p>
                                                    <ul className="text-xs text-amber-600 space-y-0.5">
                                                        {disableCheck.warnings.assignedStaff > 0 && (
                                                            <li>• {disableCheck.warnings.assignedStaff} staff member(s) will be unassigned from this branch</li>
                                                        )}
                                                        {disableCheck.warnings.assignedTables > 0 && (
                                                            <li>• {disableCheck.warnings.assignedTables} table(s) are assigned to this branch</li>
                                                        )}
                                                    </ul>
                                                </div>
                                            )}
                                            <p className="text-sm text-slate-500 leading-relaxed">
                                                This branch will be hidden from customers and staff. You can reactivate it later.
                                            </p>
                                        </>
                                    )}
                                </div>

                                <div className="flex gap-3 w-full mt-1">
                                    <button
                                        onClick={() => { setDisableTarget(null); setDisableCheck(null); }}
                                        className="flex-1 h-11 rounded-xl border border-slate-200 text-slate-600 font-semibold text-sm hover:bg-slate-50 transition"
                                    >
                                        Cancel
                                    </button>
                                    {disableCheck?.canDisable !== false && (
                                        <button
                                            onClick={confirmDisable}
                                            disabled={disabling}
                                            className="flex-1 h-11 rounded-xl bg-rose-500 hover:bg-rose-600 disabled:opacity-60 text-white font-semibold text-sm transition shadow-sm flex items-center justify-center gap-2"
                                        >
                                            {disabling && <Loader2 size={14} className="animate-spin" />}
                                            {disabling ? 'Disabling…' : 'Disable'}
                                        </button>
                                    )}
                                </div>
                            </>
                        )}
                    </div>
                </div>
            )}

            {/* ── Permanent-delete confirmation modal ──────────────────
                Destructive action — requires the admin to type the
                exact branch name to unlock the button. Backend also
                blocks active orders and the Main branch, so this is a
                belt-and-braces UX guard, not the only safeguard. */}
            {deleteTarget && (
                <div
                    className="fixed inset-0 z-50 bg-black/30 backdrop-blur-sm flex items-center justify-center p-4 font-manrope"
                    onMouseDown={e => { mouseDownOnBackdropRef.current = e.target === e.currentTarget; }}
                    onMouseUp={e => {
                        const wasOnBackdrop = mouseDownOnBackdropRef.current;
                        mouseDownOnBackdropRef.current = false;
                        if (wasOnBackdrop && e.target === e.currentTarget) closeDeleteModal();
                    }}
                >
                    <div
                        className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 flex flex-col gap-4 relative"
                        onMouseDown={e => e.stopPropagation()}
                    >
                        <button
                            onClick={closeDeleteModal}
                            className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 transition"
                            aria-label="Close"
                        >
                            <X size={18} />
                        </button>

                        <div className="flex items-center gap-3">
                            <div className="w-12 h-12 rounded-full bg-rose-50 flex items-center justify-center shrink-0">
                                <Trash2 size={22} className="text-rose-500" strokeWidth={2} />
                            </div>
                            <div className="min-w-0">
                                <h3 className="text-base font-bold text-slate-900 truncate">Delete "{deleteTarget.name}"?</h3>
                                <p className="text-xs text-slate-500 mt-0.5">This action cannot be undone.</p>
                            </div>
                        </div>

                        <div className="bg-rose-50 border border-rose-200 rounded-xl p-3 text-left">
                            <p className="text-xs font-semibold text-rose-700 mb-1.5">What gets removed:</p>
                            <ul className="text-xs text-rose-600 space-y-0.5 list-disc pl-4">
                                <li>The branch row itself</li>
                                <li>Branch Admin account for this location</li>
                                <li>Areas, tables, settings, halls scoped to this branch</li>
                                <li>Coupons, promotions, categories, recipes, inventory for this branch</li>
                                <li>This branch's price overrides on menu items</li>
                            </ul>
                            <p className="text-[11px] text-rose-500 mt-2">
                                Past orders, transactions, reservations, and bookings are kept for records.
                                Other staff pinned here become tenant-level.
                            </p>
                        </div>

                        <div>
                            <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                                Type <span className="font-bold text-slate-800">{deleteTarget.name}</span> to confirm
                            </label>
                            <input
                                type="text"
                                value={deleteConfirmText}
                                onChange={e => setDeleteConfirmText(e.target.value)}
                                autoFocus
                                disabled={deleting}
                                placeholder={deleteTarget.name}
                                className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm bg-white focus:outline-none focus:border-rose-400 focus:ring-2 focus:ring-rose-400/10 transition-all placeholder:text-slate-300 disabled:opacity-60"
                            />
                        </div>

                        <div className="flex gap-3 w-full mt-1">
                            <button
                                onClick={closeDeleteModal}
                                disabled={deleting}
                                className="flex-1 h-11 rounded-xl border border-slate-200 text-slate-600 font-semibold text-sm hover:bg-slate-50 transition disabled:opacity-60"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={confirmDelete}
                                disabled={deleting || deleteConfirmText.trim() !== deleteTarget.name}
                                className="flex-1 h-11 rounded-xl bg-rose-600 hover:bg-rose-700 disabled:bg-rose-300 disabled:cursor-not-allowed text-white font-semibold text-sm transition shadow-sm flex items-center justify-center gap-2"
                            >
                                {deleting && <Loader2 size={14} className="animate-spin" />}
                                {deleting ? 'Deleting…' : 'Delete forever'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Create/edit modal ─────────────────────────────────── */}
            {modalOpen && (
                <div
                    className="fixed inset-0 z-50 bg-black/30 backdrop-blur-sm flex items-center justify-center p-4"
                    onMouseDown={e => {
                        mouseDownOnBackdropRef.current = e.target === e.currentTarget;
                    }}
                    onMouseUp={e => {
                        const wasOnBackdrop = mouseDownOnBackdropRef.current;
                        mouseDownOnBackdropRef.current = false;
                        if (wasOnBackdrop && e.target === e.currentTarget && !saving && !createdResult && !savingSubAdmin && !resettingPassword) {
                            closeModal();
                        }
                    }}
                >
                    <div
                        ref={modalRef}
                        // Edit mode is wider — the tabs split a fairly
                        // dense form (Details + Sync + Branch Admin) into
                        // panels that breathe on a roomy canvas. Create
                        // stays narrow because each step is single-
                        // column and a wider canvas would feel empty.
                        className={`bg-white rounded-2xl shadow-2xl w-full relative max-h-[92vh] overflow-hidden flex flex-col ${
                            createdResult ? 'max-w-lg' : 'max-w-3xl'
                        }`}
                        onMouseDown={e => e.stopPropagation()}
                    >
                        {/* Modal header */}
                        <div className="shrink-0 border-b border-slate-100">
                            <div className="flex items-start justify-between gap-3 px-5 sm:px-6 py-4">
                                <div className="flex items-start gap-3 flex-1 min-w-0">
                                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                                        createdResult?.manager?.created
                                            ? 'bg-emerald-50'
                                            : editing
                                                ? 'bg-blue-50'
                                                : 'bg-orange-50'
                                    }`}>
                                        {createdResult?.manager?.created ? (
                                            <Check size={20} className="text-emerald-600" />
                                        ) : editing ? (
                                            <Edit2 size={18} className="text-blue-600" />
                                        ) : (
                                            <Building2 size={20} className="text-[#FE8301]" />
                                        )}
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        {/* Brand context line — small uppercase eyebrow that
                                            anchors the user in the tenant hierarchy. Especially
                                            important on the edit modal where the title is the
                                            branch name; without this line you can lose track
                                            of which restaurant you're editing. */}
                                        {/* Use the already-computed `resolvedBrand` (line 222) so this
                                            eyebrow matches the brand shown on every card title. */}
                                        {resolvedBrand && (
                                            <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#FE8301] font-manrope mb-0.5 truncate">
                                                {resolvedBrand}
                                            </div>
                                        )}
                                        <h2 className="text-base sm:text-lg font-bold text-slate-800 font-manrope truncate">
                                            {createdResult?.manager?.created
                                                ? 'Branch created'
                                                : editing
                                                    ? <>Edit branch <span className="text-slate-400 font-semibold">·</span> <span className="text-slate-600">{editing.displayLabel || editing.name}</span></>
                                                    : 'Add new branch'
                                            }
                                        </h2>
                                        <p className="text-[11px] sm:text-xs text-slate-400 font-manrope mt-0.5 line-clamp-1">
                                            {createdResult?.manager?.created
                                                ? 'Copy and share the Branch Admin credentials below'
                                                : editing
                                                    ? editing.slug === 'main'
                                                        ? 'Your flagship location — primary address, contact, and identity'
                                                        : 'Update the address, contact, and Branch Admin for this location'
                                                    : formStep === 1
                                                        ? 'Step 1 of 2 — Tell us about the location'
                                                        : 'Step 2 of 2 — Set up the Branch Admin account'
                                            }
                                        </p>
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    onClick={closeModal}
                                    className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition shrink-0"
                                    aria-label="Close"
                                >
                                    <X size={18} />
                                </button>
                            </div>

                            {/* Progress stepper (create mode only) */}
                            {!createdResult && !editing && (
                                <div className="px-5 sm:px-6 pb-4">
                                    <div className="flex items-center gap-2">
                                        <div className="flex items-center gap-2 shrink-0">
                                            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold transition ${
                                                formStep >= 1 ? 'bg-[#FE8301] text-white shadow-sm shadow-orange-200' : 'bg-slate-200 text-slate-400'
                                            }`}>
                                                {formStep > 1 ? <Check size={12} strokeWidth={3} /> : '1'}
                                            </div>
                                            <span className={`text-[11px] font-semibold font-manrope ${formStep >= 1 ? 'text-slate-700' : 'text-slate-400'}`}>
                                                Location
                                            </span>
                                        </div>
                                        <div className="flex-1 h-[2px] rounded-full bg-slate-200 overflow-hidden">
                                            <div className={`h-full bg-[#FE8301] transition-all duration-300 ${formStep >= 2 ? 'w-full' : 'w-0'}`} />
                                        </div>
                                        <div className="flex items-center gap-2 shrink-0">
                                            <span className={`text-[11px] font-semibold font-manrope ${formStep >= 2 ? 'text-slate-700' : 'text-slate-400'}`}>
                                                Branch Admin
                                            </span>
                                            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold transition ${
                                                formStep >= 2 ? 'bg-[#FE8301] text-white shadow-sm shadow-orange-200' : 'bg-slate-200 text-slate-400'
                                            }`}>
                                                2
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Edit-mode context chip + tab nav */}
                            {editing && !createdResult && (
                                <>
                                    <div className="px-5 sm:px-6 pb-3 flex items-center gap-2 flex-wrap">
                                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide inline-flex items-center gap-1 ${
                                            editing.isActive
                                                ? 'text-emerald-700 bg-emerald-50 border border-emerald-200'
                                                : 'text-slate-600 bg-slate-100 border border-slate-200'
                                        }`}>
                                            <span className={`w-1.5 h-1.5 rounded-full ${editing.isActive ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                                            {editing.isActive ? 'Active' : 'Disabled'}
                                        </span>
                                        {editing.slug === 'main' && (
                                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide inline-flex items-center gap-1 text-amber-700 bg-amber-50 border border-amber-200">
                                                <Crown size={9} strokeWidth={2.5} />
                                                Flagship · Main
                                            </span>
                                        )}
                                        <span className="inline-flex items-center gap-1 text-[10px] text-slate-400 font-mono px-2 py-0.5 bg-slate-50 rounded-full border border-slate-100">
                                            <Hash size={9} />
                                            {editing.slug}
                                        </span>
                                    </div>
                                    {/* Tab nav — Details / Sync / Branch Admin.
                                        Sync tab is hidden for the Main branch
                                        (Main IS the source). Branch Admin tab is
                                        always visible in edit mode: it shows
                                        an edit form when one exists, or a
                                        create form when it doesn't. The Owner
                                        fallback on Main relabels it to "Owner". */}
                                    {(() => {
                                        const subadminLabel = editing.subAdmin
                                            ? (editing.subAdmin.isOwner ? 'Owner' : 'Branch Admin')
                                            : 'Add Branch Admin';
                                        const subadminIcon = editing.subAdmin?.isOwner ? Crown : UserPlus;
                                        const tabs = [
                                            { key: 'details',  label: 'Details',         icon: Building2 },
                                            ...(editing.slug !== 'main' ? [{ key: 'sync', label: 'Sync from Main', icon: RefreshCw }] : []),
                                            { key: 'subadmin', label: subadminLabel, icon: subadminIcon },
                                        ];
                                        return (
                                            <div className="px-5 sm:px-6 -mb-px flex items-center gap-1 border-b border-slate-100 overflow-x-auto">
                                                {tabs.map(t => {
                                                    const TabIcon = t.icon;
                                                    const active = editTab === t.key;
                                                    return (
                                                        <button
                                                            key={t.key}
                                                            type="button"
                                                            onClick={() => setEditTab(t.key)}
                                                            className={`group inline-flex items-center gap-1.5 px-3 py-2.5 text-[12px] font-semibold font-manrope border-b-2 transition shrink-0 ${
                                                                active
                                                                    ? 'border-[#FE8301] text-[#FE8301]'
                                                                    : 'border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300'
                                                            }`}
                                                        >
                                                            <TabIcon size={13} strokeWidth={2.2} className={active ? 'text-[#FE8301]' : 'text-slate-400 group-hover:text-slate-600'} />
                                                            {t.label}
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        );
                                    })()}
                                </>
                            )}
                        </div>

                        {/* Modal body — scrollable */}
                        <div className="flex-1 overflow-y-auto px-5 sm:px-6 py-5 bg-slate-50/30">
                            {/* ── Success screen ───────────────────────────── */}
                            {createdResult?.manager?.created ? (
                                <div className="py-1">
                                    <div className="text-center mb-5">
                                        <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-emerald-50 to-emerald-100 rounded-full mb-3 ring-4 ring-emerald-50/50">
                                            <Check size={32} className="text-emerald-600" strokeWidth={2.5} />
                                        </div>
                                        <h3 className="text-base font-bold text-slate-800 font-manrope mb-1">
                                            All set!
                                        </h3>
                                        <p className="text-sm text-slate-500 font-manrope">
                                            Branch Admin account for <strong className="text-slate-700">{createdResult.manager.user.name}</strong> is ready.
                                        </p>
                                        {createdResult.menuItemsSynced > 0 && (
                                            <div className="inline-flex items-center gap-1.5 bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-medium px-3 py-1.5 rounded-full mt-3">
                                                <UtensilsCrossed size={13} />
                                                {createdResult.menuItemsSynced} menu item{createdResult.menuItemsSynced !== 1 ? 's' : ''} synced
                                            </div>
                                        )}
                                    </div>

                                    <div className="bg-white border border-slate-200 rounded-xl p-4 text-left space-y-3.5 shadow-sm">
                                        <div className="flex items-center gap-2.5">
                                            <Mail size={14} className="text-slate-300 shrink-0" />
                                            <div className="min-w-0 flex-1">
                                                <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Email</div>
                                                <div className="text-sm font-medium text-slate-800 truncate">{createdResult.manager.user.email}</div>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2.5">
                                            <Hash size={14} className="text-slate-300 shrink-0" />
                                            <div className="min-w-0 flex-1">
                                                <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Staff ID</div>
                                                <div className="text-sm font-medium text-slate-800 font-mono">{createdResult.manager.user.staffId}</div>
                                            </div>
                                        </div>
                                        <div className="border-t border-slate-100 pt-3">
                                            <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1.5">Temporary Password</div>
                                            <div className="flex items-center gap-2">
                                                <code className="flex-1 text-sm font-mono bg-slate-50 border border-slate-200 rounded-lg px-3 py-2.5 text-slate-800 select-all tracking-wide break-all">
                                                    {createdResult.manager.tempPassword}
                                                </code>
                                                <button
                                                    type="button"
                                                    onClick={handleCopyPassword}
                                                    className={`p-2.5 rounded-lg border transition shrink-0 ${
                                                        copied
                                                            ? 'bg-emerald-50 border-emerald-200 text-emerald-600'
                                                            : 'bg-white border-slate-200 text-slate-400 hover:bg-slate-50 hover:text-slate-600'
                                                    }`}
                                                    title="Copy password"
                                                >
                                                    {copied ? <Check size={16} strokeWidth={2.5} /> : <Copy size={16} />}
                                                </button>
                                            </div>
                                            <p className="text-[11px] text-amber-700 mt-2.5 flex items-start gap-1.5 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5">
                                                <AlertTriangle size={11} className="mt-0.5 shrink-0" />
                                                <span>Shown only once. Copy it and share it securely with the Branch Admin.</span>
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            ) : (
                            /* ── Form ──────────────────────────────────────── */
                            <form onSubmit={handleSave} id="branch-form">
                                {/* Details tab (edit) / Step 1 (create) — Branch Info + Address + Contact */}
                                {((editing && editTab === 'details') || (!editing && formStep === 1)) && (
                                    <div className="space-y-4">
                                        <FormSection
                                            icon={Building2}
                                            title="Branch Info"
                                            description="Name and identifier for this location"
                                            accent="orange"
                                        >
                                            {/* Name + Slug share one row on both edit and
                                                add — same layout in both modes so the form
                                                feels like one component, not two. The Slug
                                                column is narrower (1/3) since handles tend
                                                to be short. */}
                                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                                <div className="sm:col-span-2">
                                                    <FormField
                                                        label="Branch name"
                                                        required
                                                        htmlFor="branchName"
                                                        error={formErrors.branchName}
                                                        hint={editing?.slug === 'main' ? 'Tied to your restaurant name — change it from the Restaurant settings.' : undefined}
                                                    >
                                                        <input
                                                            id="branchName"
                                                            type="text"
                                                            value={form.name}
                                                            onChange={e => { setForm(f => ({ ...f, name: e.target.value })); clearError('branchName'); }}
                                                            className={`${inputClass} ${formErrors.branchName ? 'border-rose-400! focus:border-rose-500! focus:ring-rose-200!' : ''}`}
                                                            placeholder="e.g. FC Road, Wakad, Hinjawadi"
                                                            maxLength={80}
                                                            disabled={editing?.slug === 'main'}
                                                            aria-required="true"
                                                            aria-invalid={formErrors.branchName ? 'true' : 'false'}
                                                            aria-describedby={formErrors.branchName ? 'branchName-err' : 'branchName-preview'}
                                                        />
                                                        {/* Live "Customers see" preview — answers the question
                                                            "what will this look like to the diner?" without making
                                                            them open the customer app. Falls back to a hint when
                                                            empty so first-time users understand the pattern. */}
                                                        {(() => {
                                                            // Mirror the card-title logic at line ~897:
                                                            // - Main branch: shows `${b.name}` as-is (it IS the brand).
                                                            // - Sub-branches: shows `${resolvedBrand} - ${name}`,
                                                            //   unless the typed name already starts with the brand.
                                                            const loc = form.name.trim();
                                                            const isMain = editing?.slug === 'main';
                                                            if (!resolvedBrand) return (
                                                                <div className="text-[10px] text-slate-300 text-right mt-0.5">{form.name.length}/80</div>
                                                            );
                                                            let previewText;
                                                            if (isMain) {
                                                                previewText = loc || resolvedBrand;
                                                            } else if (!loc) {
                                                                previewText = resolvedBrand;
                                                            } else if (loc.toLowerCase().startsWith(resolvedBrand.toLowerCase())) {
                                                                previewText = loc;
                                                            } else {
                                                                previewText = `${resolvedBrand} · ${loc}`;
                                                            }
                                                            return (
                                                                <div id="branchName-preview" className="mt-1.5 flex items-center justify-between gap-2">
                                                                    <span className="text-[11px] text-slate-500 font-manrope flex items-center gap-1.5 min-w-0">
                                                                        <span className="inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider text-slate-400 shrink-0">
                                                                            <Eye size={9} strokeWidth={2.5} />
                                                                            Customers see
                                                                        </span>
                                                                        <span className="font-semibold text-slate-700 truncate">{previewText}</span>
                                                                    </span>
                                                                    <span className="text-[10px] text-slate-300 shrink-0">{form.name.length}/80</span>
                                                                </div>
                                                            );
                                                        })()}
                                                    </FormField>
                                                </div>
                                                <FormField
                                                    label="Slug"
                                                    hint={editing?.slug === 'main' ? 'Locked' : 'auto if blank'}
                                                >
                                                    <input
                                                        type="text"
                                                        value={form.slug}
                                                        onChange={e => setForm(f => ({ ...f, slug: e.target.value }))}
                                                        placeholder="fc-road"
                                                        className={`${inputClass} font-mono`}
                                                        disabled={editing?.slug === 'main'}
                                                    />
                                                </FormField>
                                            </div>
                                            {editing?.slug === 'main' && (
                                                <FormField
                                                    label="Short location label"
                                                    hint="optional — shown in card title"
                                                >
                                                    <input
                                                        type="text"
                                                        value={form.displayLabel}
                                                        onChange={e => setForm(f => ({ ...f, displayLabel: e.target.value.slice(0, 60) }))}
                                                        className={inputClass}
                                                        placeholder="e.g. Wakad Road"
                                                        maxLength={60}
                                                    />
                                                    <div className="text-[10px] text-slate-300 text-right mt-0.5">{(form.displayLabel || '').length}/60</div>
                                                </FormField>
                                            )}
                                        </FormSection>

                                        <FormSection
                                            icon={MapPin}
                                            title="Address"
                                            description="Where this branch is located — used on invoices, KOT prints, and the customer's branch picker"
                                            accent="slate"
                                        >
                                            <FormField
                                                label="Street address"
                                                hint="Building / shop no., floor, road name"
                                            >
                                                <input
                                                    type="text"
                                                    value={form.addressLine1}
                                                    onChange={e => setForm(f => ({ ...f, addressLine1: e.target.value }))}
                                                    className={inputClass}
                                                    placeholder="Shop 5, Sky Vista Building, FC Road"
                                                    autoComplete="address-line1"
                                                    maxLength={200}
                                                />
                                            </FormField>
                                            <FormField
                                                label="Area / Landmark"
                                                hint="optional — helps the rider find you"
                                            >
                                                <input
                                                    type="text"
                                                    value={form.addressLine2}
                                                    onChange={e => setForm(f => ({ ...f, addressLine2: e.target.value }))}
                                                    className={inputClass}
                                                    placeholder="Shivajinagar, opposite Café Goodluck"
                                                    autoComplete="address-line2"
                                                    maxLength={200}
                                                />
                                            </FormField>
                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                                <FormField label="City">
                                                    <input
                                                        type="text"
                                                        value={form.city}
                                                        onChange={e => setForm(f => ({ ...f, city: e.target.value }))}
                                                        className={inputClass}
                                                        placeholder="Pune"
                                                        autoComplete="address-level2"
                                                        maxLength={80}
                                                    />
                                                </FormField>
                                                <FormField label="State">
                                                    {/* State dropdown forces a canonical value
                                                        ("Maharashtra" — not "maharashtra" / "MH" /
                                                        "Maha"). Mirrors the data normalisation
                                                        downstream invoices + reports depend on. */}
                                                    <div className="relative">
                                                        <select
                                                            value={form.state}
                                                            onChange={e => setForm(f => ({ ...f, state: e.target.value }))}
                                                            className={`${inputClass} pr-9 appearance-none bg-white cursor-pointer ${form.state ? 'text-slate-900' : 'text-slate-400'}`}
                                                        >
                                                            <option value="">— Select state —</option>
                                                            <optgroup label="States">
                                                                {INDIAN_STATES.map(s => (
                                                                    <option key={s} value={s}>{s}</option>
                                                                ))}
                                                            </optgroup>
                                                            <optgroup label="Union Territories">
                                                                {INDIAN_UTS.map(s => (
                                                                    <option key={s} value={s}>{s}</option>
                                                                ))}
                                                            </optgroup>
                                                        </select>
                                                        <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                                                    </div>
                                                </FormField>
                                            </div>
                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                                <FormField
                                                    label="PIN code"
                                                    hint="6 digits"
                                                    htmlFor="postalCode"
                                                    error={formErrors.postalCode}
                                                >
                                                    <input
                                                        id="postalCode"
                                                        type="text"
                                                        inputMode="numeric"
                                                        maxLength={6}
                                                        value={form.postalCode}
                                                        onChange={e => {
                                                            const digits = e.target.value.replace(/\D/g, '').slice(0, 6);
                                                            setForm(f => ({ ...f, postalCode: digits }));
                                                            // Validate live — clear on edit, set if
                                                            // user has typed enough that it could
                                                            // plausibly be a complete PIN.
                                                            if (formErrors.postalCode) clearError('postalCode');
                                                            if (digits.length === 6 && !PIN_REGEX.test(digits)) {
                                                                setFormErrors(prev => ({ ...prev, postalCode: 'PIN must start with 1-9 (e.g. 411004)' }));
                                                            }
                                                        }}
                                                        className={`${inputClass} ${formErrors.postalCode ? 'border-rose-400! focus:border-rose-500! focus:ring-rose-200!' : ''} tabular-nums`}
                                                        placeholder="411004"
                                                        autoComplete="postal-code"
                                                        aria-invalid={formErrors.postalCode ? 'true' : 'false'}
                                                    />
                                                </FormField>
                                                <FormField label="Country">
                                                    <div className="relative">
                                                        <select
                                                            value={COUNTRIES.includes(form.country) ? form.country : (form.country ? '__other' : 'India')}
                                                            onChange={e => {
                                                                const v = e.target.value;
                                                                if (v === '__other') {
                                                                    setForm(f => ({ ...f, country: '' }));
                                                                } else {
                                                                    setForm(f => ({ ...f, country: v }));
                                                                }
                                                            }}
                                                            className={`${inputClass} pr-9 appearance-none bg-white cursor-pointer`}
                                                        >
                                                            {COUNTRIES.map(c => (
                                                                <option key={c} value={c}>{c}</option>
                                                            ))}
                                                            <option value="__other">Other…</option>
                                                        </select>
                                                        <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                                                    </div>
                                                    {/* "Other" reveals a free-text input so we
                                                        never block tenants from countries the
                                                        canonical list missed. The value is held
                                                        in the same `form.country` field — the
                                                        dropdown above falls back to "Other…" when
                                                        the saved value isn't in the canonical list. */}
                                                    {!COUNTRIES.includes(form.country) && form.country !== '' && (
                                                        <input
                                                            type="text"
                                                            value={form.country}
                                                            onChange={e => setForm(f => ({ ...f, country: e.target.value }))}
                                                            className={`${inputClass} mt-2`}
                                                            placeholder="Enter country name"
                                                            maxLength={80}
                                                            autoFocus
                                                        />
                                                    )}
                                                </FormField>
                                            </div>

                                            {/* Branch coordinates — the home-delivery
                                                distance is measured from here. Blank
                                                falls back to the restaurant location in
                                                Settings → Delivery. */}
                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                                <FormField label="Latitude" hint="for delivery distance" htmlFor="branchLatitude">
                                                    <input
                                                        id="branchLatitude"
                                                        type="number"
                                                        step="any"
                                                        min="-90"
                                                        max="90"
                                                        value={form.latitude}
                                                        onChange={e => setForm(f => ({ ...f, latitude: e.target.value }))}
                                                        className={`${inputClass} tabular-nums`}
                                                        placeholder="18.5204"
                                                    />
                                                </FormField>
                                                <FormField label="Longitude" hint="for delivery distance" htmlFor="branchLongitude">
                                                    <input
                                                        id="branchLongitude"
                                                        type="number"
                                                        step="any"
                                                        min="-180"
                                                        max="180"
                                                        value={form.longitude}
                                                        onChange={e => setForm(f => ({ ...f, longitude: e.target.value }))}
                                                        className={`${inputClass} tabular-nums`}
                                                        placeholder="73.8567"
                                                    />
                                                </FormField>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    if (!navigator.geolocation) { toast.error('Location is not supported in this browser'); return; }
                                                    navigator.geolocation.getCurrentPosition(
                                                        (pos) => setForm(f => ({
                                                            ...f,
                                                            latitude: Number(pos.coords.latitude.toFixed(6)),
                                                            longitude: Number(pos.coords.longitude.toFixed(6)),
                                                        })),
                                                        () => toast.error('Could not get your location. Enter the coordinates manually.'),
                                                        { enableHighAccuracy: true, timeout: 15000 }
                                                    );
                                                }}
                                                className="self-start text-[13px] font-semibold text-[#FE8301] hover:underline"
                                            >
                                                Use my current location
                                            </button>

                                            {/* Live address preview — mirrors how the address
                                                renders on customer-facing branch cards + KOT
                                                prints. Lets the admin see formatting glitches
                                                (extra commas, mis-cased state, etc.) before saving. */}
                                            {(() => {
                                                const street = [form.addressLine1, form.addressLine2].filter(Boolean).join(', ');
                                                const seen = new Set();
                                                const region = [form.city, form.state, form.postalCode, form.country]
                                                    .map(p => (p || '').trim())
                                                    .filter(p => { if (!p) return false; const k = p.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; })
                                                    .join(' · ');
                                                if (!street && !region) return null;
                                                return (
                                                    <div className="mt-1 rounded-lg bg-slate-50 border border-slate-100 px-3 py-2 flex items-start gap-2">
                                                        <Eye size={11} className="text-slate-400 mt-1 shrink-0" />
                                                        <div className="min-w-0 flex-1">
                                                            <div className="text-[9px] font-bold uppercase tracking-wider text-slate-400 font-manrope">Preview on cards & invoices</div>
                                                            {street && <div className="text-[12px] font-semibold text-slate-800 leading-snug truncate font-manrope">{street}</div>}
                                                            {region && <div className="text-[11px] text-slate-500 leading-snug font-manrope">{region}</div>}
                                                        </div>
                                                    </div>
                                                );
                                            })()}
                                        </FormSection>

                                        <FormSection
                                            icon={Phone}
                                            title="Contact"
                                            description="How customers can reach this location"
                                            accent="slate"
                                        >
                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                                <FormField label="Phone">
                                                    <input
                                                        type="tel"
                                                        value={form.contactPhone}
                                                        onChange={e => setForm(f => ({ ...f, contactPhone: e.target.value }))}
                                                        className={inputClass}
                                                        placeholder="+91 98765 43210"
                                                    />
                                                </FormField>
                                                <FormField
                                                    label="Email"
                                                    htmlFor="contactEmail"
                                                    error={formErrors.contactEmail}
                                                >
                                                    <input
                                                        id="contactEmail"
                                                        type="email"
                                                        value={form.contactEmail}
                                                        onChange={e => { setForm(f => ({ ...f, contactEmail: e.target.value })); clearError('contactEmail'); }}
                                                        className={`${inputClass} ${formErrors.contactEmail ? 'border-rose-400! focus:border-rose-500! focus:ring-rose-200!' : ''}`}
                                                        placeholder="fcroad@yourdomain.com"
                                                        aria-invalid={formErrors.contactEmail ? 'true' : 'false'}
                                                        aria-describedby={formErrors.contactEmail ? 'contactEmail-err' : undefined}
                                                    />
                                                </FormField>
                                            </div>
                                        </FormSection>

                                        {/* Empty-state CTA when the branch has no Branch Admin yet.
                                            Designed as a proper empty-state card (icon block + headline
                                            + supporting copy + primary button) instead of a flat alert,
                                            so it reads as an inviting next-step rather than a warning.
                                            Hidden on the Main branch — its admin is the tenant owner. */}
                                        {editing && !editing.subAdmin && editing.slug !== 'main' && (
                                            <div className="rounded-2xl border border-dashed border-orange-200 bg-gradient-to-br from-orange-50/60 to-white p-5 flex flex-col sm:flex-row sm:items-center gap-4">
                                                <div className="w-12 h-12 rounded-2xl bg-white border border-orange-100 text-[#FE8301] flex items-center justify-center shrink-0 shadow-sm">
                                                    <UserPlus size={20} strokeWidth={2} />
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="text-[14px] font-bold text-slate-800 font-manrope">
                                                        Add a Branch Admin to manage this location
                                                    </div>
                                                    <p className="text-[12px] text-slate-500 mt-1 font-manrope leading-relaxed">
                                                        Branch Admins handle day-to-day operations — staff, menu, orders, and reports for{' '}
                                                        <span className="font-semibold text-slate-700">{editing.displayLabel || editing.name}</span>. You can always reassign later.
                                                    </p>
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={() => setEditTab('subadmin')}
                                                    className="shrink-0 inline-flex items-center gap-1.5 px-4 py-2 bg-[#FE8301] hover:bg-[#e57500] text-white text-[12px] font-semibold rounded-xl transition shadow-sm shadow-orange-200/60 font-manrope"
                                                >
                                                    <UserPlus size={13} strokeWidth={2.5} />
                                                    Add Branch Admin
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* Sync from Main tab (edit mode, sub-branch only) */}
                                {editing && editTab === 'sync' && editing.slug !== 'main' && (() => {
                                    // Each toggle here corresponds 1:1 with a helper in
                                    // updateBranch (initializeBranchX). To add a new
                                    // syncable entity: (1) add the helper + wire it into
                                    // updateBranch, (2) extend syncFromMain state default,
                                    // (3) add an entry to SYNCABLE.
                                    const selectedCount = SYNCABLE.filter(x => syncFromMain[x.key]).length;
                                    const allOn = selectedCount === SYNCABLE.length;
                                    return (
                                        <div className="space-y-4">
                                            {/* Section header — full-width band, not nested
                                                in a FormSection card, so the toggles below
                                                feel like a primary surface (not an aside). */}
                                            <div className="flex items-start justify-between gap-4 flex-wrap">
                                                <div className="flex items-start gap-3">
                                                    <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                                                        <RefreshCw size={16} />
                                                    </div>
                                                    <div className="min-w-0">
                                                        <h3 className="text-[15px] font-bold text-slate-800 font-manrope">Sync from Main</h3>
                                                        <p className="text-[12px] text-slate-500 font-manrope mt-0.5 max-w-xl">
                                                            Selected items will be copied from your Main branch on save. Existing data on this branch is never overwritten.
                                                        </p>
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-2 shrink-0">
                                                    <span className="text-[11px] font-semibold text-slate-400 font-manrope">
                                                        {selectedCount}/{SYNCABLE.length} selected
                                                    </span>
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            const next = !allOn;
                                                            setSyncFromMain(SYNCABLE.reduce((acc, x) => ({ ...acc, [x.key]: next }), {}));
                                                        }}
                                                        className="text-[11px] font-semibold px-2.5 py-1 rounded-lg border border-blue-200 text-blue-700 hover:bg-blue-50 transition"
                                                    >
                                                        {allOn ? 'Clear all' : 'Select all'}
                                                    </button>
                                                </div>
                                            </div>

                                            {/* Toggle grid — 2 columns on the wider edit
                                                modal. Each card flips its own border /
                                                background when checked so the selection
                                                state is obvious without reading the box. */}
                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                                {SYNCABLE.map(x => {
                                                    const checked = syncFromMain[x.key];
                                                    return (
                                                        <label
                                                            key={x.key}
                                                            className={`group flex items-start gap-3 p-3.5 rounded-xl border cursor-pointer transition select-none ${
                                                                checked
                                                                    ? 'bg-blue-50/70 border-blue-300 ring-1 ring-blue-200'
                                                                    : 'bg-white border-slate-200 hover:border-blue-200 hover:bg-blue-50/30'
                                                            }`}
                                                        >
                                                            <input
                                                                type="checkbox"
                                                                checked={checked}
                                                                onChange={e => setSyncFromMain(s => ({ ...s, [x.key]: e.target.checked }))}
                                                                className="sr-only"
                                                            />
                                                            <div className={`mt-0.5 w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition ${
                                                                checked
                                                                    ? 'bg-blue-600 border-blue-600'
                                                                    : 'bg-white border-slate-300 group-hover:border-blue-400'
                                                            }`}>
                                                                {checked && <Check size={11} strokeWidth={3} className="text-white" />}
                                                            </div>
                                                            <div className="flex-1 min-w-0">
                                                                <div className={`text-[13px] font-bold font-manrope ${checked ? 'text-blue-900' : 'text-slate-800'}`}>{x.label}</div>
                                                                <div className="text-[11px] text-slate-500 mt-1 leading-snug">{x.hint}</div>
                                                            </div>
                                                        </label>
                                                    );
                                                })}
                                            </div>

                                            {/* Helper banner — only shown when nothing is
                                                ticked, to nudge the admin toward the action
                                                without scolding them when they intentionally
                                                want to save other field changes only. */}
                                            {selectedCount === 0 && (
                                                <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-slate-50 border border-slate-200">
                                                    <AlertTriangle size={12} className="text-slate-400 mt-0.5 shrink-0" />
                                                    <p className="text-[11px] text-slate-500 font-manrope">
                                                        No items selected — saving will just update branch fields without copying anything from Main.
                                                    </p>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })()}

                                {/* Branch Admin tab — CREATE state. Shown when the
                                    branch has no Branch Admin yet. Posts to the
                                    new POST /branches/:id/subadmin endpoint
                                    and the success block (resetResult) below
                                    surfaces the temp password. */}
                                {editing && editTab === 'subadmin' && !editing.subAdmin && (() => {
                                    const branchEmail = (form.contactEmail || editing.contactEmail || '').trim();
                                    const branchPhone = (form.contactPhone || editing.contactPhone || '').trim();
                                    const branchHasContact = !!(branchEmail || branchPhone);
                                    const sameAsBranch = branchHasContact
                                        && attachForm.email.trim() === branchEmail
                                        && attachForm.phone.trim() === branchPhone;
                                    const toggleSameAsBranch = () => {
                                        if (sameAsBranch) {
                                            setAttachForm(f => ({ ...f, email: '', phone: '' }));
                                        } else {
                                            setAttachForm(f => ({ ...f, email: branchEmail, phone: branchPhone }));
                                        }
                                    };
                                    return (
                                    <div className="space-y-4">
                                        <FormSection
                                            icon={UserPlus}
                                            title="Add Branch Admin"
                                            description="Create the account that will manage this branch's day-to-day operations"
                                            accent="blue"
                                            className="border-blue-100 bg-gradient-to-br from-blue-50/50 to-white"
                                        >
                                            <FormField label="Full Name" required>
                                                <input
                                                    type="text"
                                                    value={attachForm.name}
                                                    onChange={e => setAttachForm(f => ({ ...f, name: e.target.value }))}
                                                    className={inputClass}
                                                    placeholder="Rahul Patil"
                                                    maxLength={80}
                                                />
                                            </FormField>

                                            {branchHasContact && (
                                                <label className="flex items-center gap-2 text-xs font-semibold text-slate-600 cursor-pointer select-none">
                                                    <input
                                                        type="checkbox"
                                                        checked={sameAsBranch}
                                                        onChange={toggleSameAsBranch}
                                                        className="rounded border-slate-300 text-[#FE8301] focus:ring-[#FE8301]/30"
                                                    />
                                                    Same as branch contact
                                                    <span className="text-slate-400 font-normal">
                                                        ({[branchEmail, branchPhone].filter(Boolean).join(' · ')})
                                                    </span>
                                                </label>
                                            )}

                                            <FormField label="Email" required>
                                                <input
                                                    type="email"
                                                    value={attachForm.email}
                                                    onChange={e => setAttachForm(f => ({ ...f, email: e.target.value }))}
                                                    className={inputClass}
                                                    placeholder="rahul@bestodine.com"
                                                />
                                            </FormField>
                                            <FormField label="Phone">
                                                <input
                                                    type="tel"
                                                    value={attachForm.phone}
                                                    onChange={e => setAttachForm(f => ({ ...f, phone: e.target.value }))}
                                                    className={inputClass}
                                                    placeholder="9876543210"
                                                />
                                            </FormField>

                                            {/* No inline button here — the footer "Create
                                                Branch Admin" button (visible because we're on
                                                this tab + no admin exists) is the single source
                                                of truth for this action. Avoids the previous
                                                bug where users filled the form, clicked the
                                                footer "Save changes" and only the branch saved. */}
                                            <p className="text-[11px] text-slate-400 italic pt-1 font-manrope">
                                                Use the <strong className="text-slate-600 not-italic">Create Branch Admin</strong> button at the bottom to save this account.
                                            </p>
                                        </FormSection>

                                        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-start gap-2">
                                            <AlertTriangle size={14} className="text-amber-500 mt-0.5 shrink-0" />
                                            <p className="text-xs text-amber-700 leading-relaxed">
                                                A temporary password will be generated. You'll see it once after creation — copy and share it securely.
                                            </p>
                                        </div>

                                        {/* Reuse the same temp-password reveal block
                                            used by the password-reset flow. */}
                                        {resetResult?.tempPassword && (
                                            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl">
                                                <div className="flex items-center gap-1.5 text-[11px] font-bold text-emerald-700 uppercase tracking-wide mb-1.5">
                                                    <Check size={12} strokeWidth={2.5} />
                                                    Temporary password
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <code className="flex-1 text-sm font-mono bg-white border border-emerald-200 rounded-lg px-3 py-2 text-slate-800 select-all tracking-wide break-all">
                                                        {resetResult.tempPassword}
                                                    </code>
                                                    <button
                                                        type="button"
                                                        onClick={handleCopyResetPassword}
                                                        className={`p-2.5 rounded-lg border transition shrink-0 ${
                                                            resetCopied
                                                                ? 'bg-emerald-100 border-emerald-300 text-emerald-700'
                                                                : 'bg-white border-emerald-200 text-emerald-600 hover:bg-emerald-100'
                                                        }`}
                                                        title="Copy password"
                                                    >
                                                        {resetCopied ? <Check size={14} strokeWidth={2.5} /> : <Copy size={14} />}
                                                    </button>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                    );
                                })()}

                                {/* Branch Admin tab — EDIT state. Shown when the branch already has a Branch Admin. */}
                                {editing && editTab === 'subadmin' && editing.subAdmin && (
                                    <div className="space-y-4">
                                        <FormSection
                                            icon={editing.subAdmin.isOwner ? Crown : UserPlus}
                                            title={editing.subAdmin.isOwner ? 'Branch Owner' : 'Branch Admin'}
                                            description={editing.subAdmin.isOwner
                                                ? 'The tenant owner runs the Main branch directly. Edit their profile from Staff or Profile.'
                                                : "The person who manages this branch's operations"}
                                            accent={editing.subAdmin.isOwner ? 'orange' : 'blue'}
                                            className={editing.subAdmin.isOwner
                                                ? 'border-amber-100 bg-gradient-to-br from-amber-50/50 to-white'
                                                : 'border-blue-100 bg-gradient-to-br from-blue-50/50 to-white'}
                                        >
                                                    {/* Read-only identity row */}
                                                    <div className="flex items-start gap-3 p-3 bg-white rounded-xl border border-slate-200">
                                                        <div className={`w-10 h-10 rounded-lg flex items-center justify-center font-bold text-sm shrink-0 ${
                                                            editing.subAdmin.isOwner ? 'bg-amber-50 text-amber-700' : 'bg-blue-50 text-blue-600'
                                                        }`}>
                                                            {editing.subAdmin.isOwner
                                                                ? <Crown size={16} />
                                                                : (editing.subAdmin.name?.[0]?.toUpperCase() || 'S')}
                                                        </div>
                                                        <div className="flex-1 min-w-0">
                                                            <div className="flex items-center gap-2 flex-wrap">
                                                                <div className="text-sm font-bold text-slate-800 truncate font-manrope">{editing.subAdmin.name}</div>
                                                                <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wide ${
                                                                    editing.subAdmin.status === 'active'
                                                                        ? 'text-emerald-700 bg-emerald-50 border border-emerald-200'
                                                                        : 'text-slate-500 bg-slate-100 border border-slate-200'
                                                                }`}>
                                                                    {editing.subAdmin.status}
                                                                </span>
                                                                {editing.subAdmin.isOwner && (
                                                                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wide text-amber-700 bg-amber-50 border border-amber-200 inline-flex items-center gap-1">
                                                                        <Crown size={9} strokeWidth={2.5} />
                                                                        Owner
                                                                    </span>
                                                                )}
                                                            </div>
                                                            <div className="flex items-center gap-1 text-[11px] text-slate-500 mt-0.5 truncate">
                                                                <Mail size={10} className="shrink-0" />
                                                                <span className="truncate">{editing.subAdmin.email}</span>
                                                            </div>
                                                            <div className="flex items-center gap-1 text-[11px] text-slate-400 font-mono mt-0.5">
                                                                <Hash size={10} />
                                                                {editing.subAdmin.staffId}
                                                                {editing.subAdmin.mustChangePassword && (
                                                                    <span className="ml-2 text-[10px] font-semibold text-amber-600 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5 font-sans">
                                                                        Must change password
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </div>

                                                    {/* Owner short-circuit: the surfaced "admin" on Main is
                                                        the tenant owner (no pinned admin record exists).
                                                        Save / Reset endpoints target a pinned sub-admin and
                                                        would 404 for the owner — show a guided link instead. */}
                                                    {editing.subAdmin.isOwner ? (
                                                        <div className="pt-1 space-y-3">
                                                            <p className="text-[12px] text-slate-600 font-manrope leading-relaxed">
                                                                The owner manages the Main branch directly. To rename, change phone, or reset password, use the owner profile.
                                                            </p>
                                                            <div className="flex flex-wrap gap-2">
                                                                <Link
                                                                    to="/admin/profile"
                                                                    onClick={closeModal}
                                                                    className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-[#FE8301] hover:bg-[#e57500] text-white text-xs font-semibold rounded-xl transition shadow-sm font-manrope"
                                                                >
                                                                    <Edit2 size={13} strokeWidth={2.5} />
                                                                    Edit owner profile
                                                                </Link>
                                                                <Link
                                                                    to="/admin/staff"
                                                                    onClick={closeModal}
                                                                    className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 text-xs font-semibold rounded-xl transition font-manrope"
                                                                >
                                                                    <UserPlus size={13} />
                                                                    Add a Branch Admin in Staff
                                                                </Link>
                                                            </div>
                                                        </div>
                                                    ) : (
                                                    <>
                                                    {/* Editable fields */}
                                                    <FormField label="Full Name" required>
                                                        <input
                                                            type="text"
                                                            value={subAdminEdit.name}
                                                            onChange={e => setSubAdminEdit(f => ({ ...f, name: e.target.value }))}
                                                            className={inputClass}
                                                            maxLength={80}
                                                            placeholder="Rahul Patil"
                                                        />
                                                    </FormField>
                                                    <FormField label="Phone">
                                                        <input
                                                            type="tel"
                                                            value={subAdminEdit.mobile}
                                                            onChange={e => setSubAdminEdit(f => ({ ...f, mobile: e.target.value }))}
                                                            className={inputClass}
                                                            placeholder="9876543210"
                                                        />
                                                    </FormField>
                                                    <p className="text-[11px] text-slate-400 font-manrope -mt-1">
                                                        Email and role are locked here.{' '}
                                                        <Link to="/admin/staff" onClick={closeModal} className="text-[#FE8301] hover:text-[#e57500] font-semibold underline underline-offset-2">
                                                            Manage in Staff →
                                                        </Link>
                                                    </p>

                                                    {/* Action buttons */}
                                                    <div className="flex flex-wrap gap-2 pt-1">
                                                        <button
                                                            type="button"
                                                            onClick={handleSaveSubAdmin}
                                                            disabled={savingSubAdmin || resettingPassword}
                                                            className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-xs font-semibold rounded-xl transition shadow-sm font-manrope"
                                                        >
                                                            {savingSubAdmin ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} strokeWidth={2.5} />}
                                                            {savingSubAdmin ? 'Saving…' : 'Save Branch Admin'}
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={openResetPasswordConfirm}
                                                            disabled={savingSubAdmin || resettingPassword}
                                                            className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-white hover:bg-amber-50 disabled:opacity-60 text-amber-700 border border-amber-200 text-xs font-semibold rounded-xl transition font-manrope"
                                                            title="Generate a new temporary password"
                                                        >
                                                            {resettingPassword ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
                                                            {resettingPassword ? 'Resetting…' : 'Reset password'}
                                                        </button>
                                                    </div>

                                                    {/* Inline reset result — shown once */}
                                                    {resetResult?.tempPassword && (
                                                        <div className="mt-2 p-3 bg-emerald-50 border border-emerald-200 rounded-xl">
                                                            <div className="flex items-center gap-1.5 text-[11px] font-bold text-emerald-700 uppercase tracking-wide mb-1.5">
                                                                <Check size={12} strokeWidth={2.5} />
                                                                New temporary password
                                                            </div>
                                                            <div className="flex items-center gap-2">
                                                                <code className="flex-1 text-sm font-mono bg-white border border-emerald-200 rounded-lg px-3 py-2 text-slate-800 select-all tracking-wide break-all">
                                                                    {resetResult.tempPassword}
                                                                </code>
                                                                <button
                                                                    type="button"
                                                                    onClick={handleCopyResetPassword}
                                                                    className={`p-2.5 rounded-lg border transition shrink-0 ${
                                                                        resetCopied
                                                                            ? 'bg-emerald-100 border-emerald-300 text-emerald-700'
                                                                            : 'bg-white border-emerald-200 text-emerald-600 hover:bg-emerald-50'
                                                                    }`}
                                                                    title="Copy password"
                                                                >
                                                                    {resetCopied ? <Check size={15} strokeWidth={2.5} /> : <Copy size={15} />}
                                                                </button>
                                                            </div>
                                                            <p className="text-[11px] text-amber-700 mt-2 flex items-start gap-1.5">
                                                                <AlertTriangle size={11} className="mt-0.5 shrink-0" />
                                                                <span>Shown only once. Share it securely — they'll be forced to change it on next login.</span>
                                                            </p>
                                                        </div>
                                                    )}
                                                    </>
                                                    )}
                                        </FormSection>
                                    </div>
                                )}

                                {/* Step 2: Branch Admin (create mode only) */}
                                {!editing && formStep === 2 && (() => {
                                    const branchEmail = (form.contactEmail || '').trim();
                                    const branchPhone = (form.contactPhone || '').trim();
                                    const branchHasContact = !!(branchEmail || branchPhone);
                                    const sameAsBranch = branchHasContact
                                        && subAdminForm.email.trim() === branchEmail
                                        && subAdminForm.phone.trim() === branchPhone;
                                    const toggleSameAsBranch = () => {
                                        if (sameAsBranch) {
                                            setSubAdminForm(f => ({ ...f, email: '', phone: '' }));
                                        } else {
                                            setSubAdminForm(f => ({ ...f, email: branchEmail, phone: branchPhone }));
                                        }
                                    };
                                    return (
                                    <div className="space-y-4">
                                        {/* ── Copy from Main (optional) ──────────────────
                                            Same syncFromMain shape as the Edit form. Off by
                                            default → clean start, which matches the user's
                                            intent ("if not selected, clean create should
                                            happen"). Selected items are cloned by the backend
                                            inside the same POST /branches request so the new
                                            branch lands fully seeded in one round-trip. */}
                                        {(() => {
                                            const selectedCount = SYNCABLE.filter(x => syncFromMain[x.key]).length;
                                            const allOn = selectedCount === SYNCABLE.length;
                                            return (
                                                <FormSection
                                                    icon={RefreshCw}
                                                    title="Copy from Main (optional)"
                                                    description="Pick what to inherit from your Main branch. Unticked items start fresh."
                                                    accent="blue"
                                                    className="border-blue-100 bg-gradient-to-br from-blue-50/40 to-white"
                                                >
                                                    <div className="flex items-center justify-end gap-2">
                                                        <span className="text-[11px] font-semibold text-slate-400 font-manrope">
                                                            {selectedCount}/{SYNCABLE.length} selected
                                                        </span>
                                                        <button
                                                            type="button"
                                                            onClick={() => {
                                                                const next = !allOn;
                                                                setSyncFromMain(SYNCABLE.reduce((acc, x) => ({ ...acc, [x.key]: next }), {}));
                                                            }}
                                                            className="text-[11px] font-semibold px-2.5 py-1 rounded-lg border border-blue-200 text-blue-700 hover:bg-blue-50 transition"
                                                        >
                                                            {allOn ? 'Clear all' : 'Select all'}
                                                        </button>
                                                    </div>
                                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                                        {SYNCABLE.map(x => {
                                                            const checked = syncFromMain[x.key];
                                                            return (
                                                                <label
                                                                    key={x.key}
                                                                    className={`group flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition select-none ${
                                                                        checked
                                                                            ? 'bg-blue-50/70 border-blue-300 ring-1 ring-blue-200'
                                                                            : 'bg-white border-slate-200 hover:border-blue-200 hover:bg-blue-50/30'
                                                                    }`}
                                                                >
                                                                    <input
                                                                        type="checkbox"
                                                                        checked={checked}
                                                                        onChange={e => setSyncFromMain(s => ({ ...s, [x.key]: e.target.checked }))}
                                                                        className="sr-only"
                                                                    />
                                                                    <div className={`mt-0.5 w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition ${
                                                                        checked ? 'bg-blue-600 border-blue-600' : 'bg-white border-slate-300 group-hover:border-blue-400'
                                                                    }`}>
                                                                        {checked && <Check size={11} strokeWidth={3} className="text-white" />}
                                                                    </div>
                                                                    <div className="flex-1 min-w-0">
                                                                        <div className={`text-[13px] font-bold font-manrope ${checked ? 'text-blue-900' : 'text-slate-800'}`}>{x.label}</div>
                                                                        <div className="text-[11px] text-slate-500 mt-1 leading-snug">{x.hint}</div>
                                                                    </div>
                                                                </label>
                                                            );
                                                        })}
                                                    </div>
                                                    {selectedCount === 0 && (
                                                        <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-slate-50 border border-slate-200">
                                                            <AlertTriangle size={12} className="text-slate-400 mt-0.5 shrink-0" />
                                                            <p className="text-[11px] text-slate-500 font-manrope">
                                                                Nothing selected — this branch will start with an empty menu, areas, tables, coupons, and promotions.
                                                            </p>
                                                        </div>
                                                    )}
                                                </FormSection>
                                            );
                                        })()}

                                        <FormSection
                                            icon={UserPlus}
                                            title="Branch Admin Account"
                                            description="Every branch requires a Branch Admin to manage its operations"
                                            accent="blue"
                                            className="border-blue-100 bg-gradient-to-br from-blue-50/50 to-white"
                                        >
                                            <FormField
                                                label="Full name"
                                                required
                                                htmlFor="subAdminName"
                                                error={formErrors.subAdminName}
                                            >
                                                <input
                                                    id="subAdminName"
                                                    type="text"
                                                    value={subAdminForm.name}
                                                    onChange={e => { setSubAdminForm(f => ({ ...f, name: e.target.value })); clearError('subAdminName'); }}
                                                    className={`${inputClass} ${formErrors.subAdminName ? 'border-rose-400! focus:border-rose-500! focus:ring-rose-200!' : ''}`}
                                                    placeholder="Full name as on documents"
                                                    autoComplete="name"
                                                    aria-required="true"
                                                    aria-invalid={formErrors.subAdminName ? 'true' : 'false'}
                                                    aria-describedby={formErrors.subAdminName ? 'subAdminName-err' : undefined}
                                                />
                                            </FormField>

                                            {branchHasContact && (
                                                <label className="flex items-center gap-2 text-xs font-semibold text-slate-600 cursor-pointer select-none">
                                                    <input
                                                        type="checkbox"
                                                        checked={sameAsBranch}
                                                        onChange={toggleSameAsBranch}
                                                        className="rounded border-slate-300 text-[#FE8301] focus:ring-[#FE8301]/30"
                                                    />
                                                    Same as branch contact
                                                    <span className="text-slate-400 font-normal">
                                                        ({[branchEmail, branchPhone].filter(Boolean).join(' · ')})
                                                    </span>
                                                </label>
                                            )}

                                            {/* Email + Phone in a 2-col grid to mirror the
                                                Step 1 Contact section. Keeps the form rhythm
                                                consistent across both steps of the wizard. */}
                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                                <FormField
                                                    label="Email"
                                                    required
                                                    htmlFor="subAdminEmail"
                                                    error={formErrors.subAdminEmail}
                                                >
                                                    <input
                                                        id="subAdminEmail"
                                                        type="email"
                                                        value={subAdminForm.email}
                                                        onChange={e => { setSubAdminForm(f => ({ ...f, email: e.target.value })); clearError('subAdminEmail'); }}
                                                        className={`${inputClass} ${formErrors.subAdminEmail ? 'border-rose-400! focus:border-rose-500! focus:ring-rose-200!' : ''}`}
                                                        placeholder="branchadmin@yourdomain.com"
                                                        autoComplete="email"
                                                        aria-required="true"
                                                        aria-invalid={formErrors.subAdminEmail ? 'true' : 'false'}
                                                        aria-describedby={formErrors.subAdminEmail ? 'subAdminEmail-err' : undefined}
                                                    />
                                                </FormField>
                                                <FormField
                                                    label="Phone"
                                                    htmlFor="subAdminPhone"
                                                    error={formErrors.subAdminPhone}
                                                >
                                                    <input
                                                        id="subAdminPhone"
                                                        type="tel"
                                                        inputMode="numeric"
                                                        maxLength={10}
                                                        value={subAdminForm.phone}
                                                        onChange={e => { setSubAdminForm(f => ({ ...f, phone: e.target.value.replace(/\D/g, '').slice(0, 10) })); clearError('subAdminPhone'); }}
                                                        className={`${inputClass} ${formErrors.subAdminPhone ? 'border-rose-400! focus:border-rose-500! focus:ring-rose-200!' : ''}`}
                                                        placeholder="10-digit mobile"
                                                        autoComplete="tel"
                                                        aria-invalid={formErrors.subAdminPhone ? 'true' : 'false'}
                                                        aria-describedby={formErrors.subAdminPhone ? 'subAdminPhone-err' : undefined}
                                                    />
                                                </FormField>
                                            </div>
                                        </FormSection>

                                        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-start gap-2">
                                            <AlertTriangle size={14} className="text-amber-500 mt-0.5 shrink-0" />
                                            <p className="text-xs text-amber-700 leading-relaxed">
                                                A temporary password will be generated for this Branch Admin. You'll see it after creation — make sure to copy and share it securely.
                                            </p>
                                        </div>
                                    </div>
                                    );
                                })()}
                            </form>
                            )}
                        </div>

                        {/* Modal footer */}
                        <div className="px-5 sm:px-6 py-4 border-t border-slate-100 shrink-0 bg-white">
                            {createdResult?.manager?.created ? (
                                <button
                                    type="button"
                                    onClick={closeModal}
                                    className="w-full py-2.5 bg-[#FE8301] hover:bg-[#e57500] text-white font-semibold text-sm rounded-xl transition shadow-sm shadow-orange-200/50 flex items-center justify-center gap-2 font-manrope"
                                >
                                    <Check size={15} strokeWidth={2.5} />
                                    Done
                                </button>
                            ) : (
                                <div className="flex items-center justify-between gap-2 sm:gap-3">
                                    {/* Left: step indicator (create mode) */}
                                    {!editing && (
                                        <span className="hidden sm:inline text-[11px] font-semibold text-slate-400 font-manrope">
                                            Step {formStep} of 2
                                        </span>
                                    )}

                                    {/* Right: action buttons */}
                                    <div className="flex gap-2 sm:gap-3 w-full sm:w-auto sm:ml-auto">
                                        {!editing && formStep === 2 && (
                                            <button
                                                type="button"
                                                onClick={() => setFormStep(1)}
                                                disabled={saving}
                                                className="flex-1 sm:flex-none px-4 py-2.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 font-semibold text-sm rounded-xl transition disabled:opacity-60 flex items-center justify-center gap-1.5 font-manrope"
                                            >
                                                <ChevronDown size={14} className="rotate-90" />
                                                Back
                                            </button>
                                        )}
                                        <button
                                            type="button"
                                            onClick={() => !saving && !savingSubAdmin && !resettingPassword && closeModal()}
                                            className="flex-1 sm:flex-none px-4 py-2.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 font-semibold text-sm rounded-xl transition font-manrope"
                                        >
                                            Cancel
                                        </button>
                                        {editing ? (
                                            // Context-aware primary action:
                                            //   • On the "Add Branch Admin" tab (no admin yet): create the admin.
                                            //     Users were filling in the inline create form, clicking the
                                            //     footer "Save changes", and walking away thinking the admin
                                            //     was created — but the footer only ran the branch update.
                                            //   • Otherwise: save the branch (Details / Sync tabs).
                                            (editTab === 'subadmin' && !editing.subAdmin) ? (
                                                <button
                                                    type="button"
                                                    onClick={handleAttachSubAdmin}
                                                    disabled={attachingSubAdmin}
                                                    className="flex-1 sm:flex-none px-5 py-2.5 bg-[#FE8301] hover:bg-[#e57500] disabled:opacity-60 disabled:cursor-not-allowed text-white font-semibold text-sm rounded-xl transition shadow-sm shadow-orange-200/50 flex items-center justify-center gap-2 font-manrope min-w-[170px]"
                                                >
                                                    {attachingSubAdmin ? (
                                                        <><Loader2 size={14} className="animate-spin" /> Creating…</>
                                                    ) : (
                                                        <><UserPlus size={14} strokeWidth={2.5} /> Create Branch Admin</>
                                                    )}
                                                </button>
                                            ) : (
                                                <button
                                                    type="submit"
                                                    form="branch-form"
                                                    disabled={saving}
                                                    className="flex-1 sm:flex-none px-5 py-2.5 bg-[#FE8301] hover:bg-[#e57500] disabled:opacity-60 disabled:cursor-not-allowed text-white font-semibold text-sm rounded-xl transition shadow-sm shadow-orange-200/50 flex items-center justify-center gap-2 font-manrope min-w-[130px]"
                                                >
                                                    {saving ? (
                                                        <><Loader2 size={14} className="animate-spin" /> Saving…</>
                                                    ) : (
                                                        <><Check size={14} strokeWidth={2.5} /> Save changes</>
                                                    )}
                                                </button>
                                            )
                                        ) : formStep === 1 ? (
                                            <button
                                                type="button"
                                                onClick={handleNextStep}
                                                className="flex-1 sm:flex-none px-5 py-2.5 bg-[#FE8301] hover:bg-[#e57500] text-white font-semibold text-sm rounded-xl transition shadow-sm shadow-orange-200/50 flex items-center justify-center gap-1.5 font-manrope min-w-[110px]"
                                            >
                                                Next
                                                <ChevronDown size={14} className="-rotate-90" />
                                            </button>
                                        ) : (
                                            <button
                                                type="submit"
                                                form="branch-form"
                                                disabled={saving}
                                                className="flex-1 sm:flex-none px-5 py-2.5 bg-[#FE8301] hover:bg-[#e57500] disabled:opacity-60 disabled:cursor-not-allowed text-white font-semibold text-sm rounded-xl transition shadow-sm shadow-orange-200/50 flex items-center justify-center gap-2 font-manrope min-w-[140px]"
                                            >
                                                {saving ? (
                                                    <><Loader2 size={14} className="animate-spin" /> Creating…</>
                                                ) : (
                                                    <><Plus size={14} strokeWidth={2.5} /> Create branch</>
                                                )}
                                            </button>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Confirmation for the "Reset password" action — replaces
                the previous native window.confirm, matching the rest of
                the page's design language. */}
            <ConfirmActionModal
                isOpen={resetPasswordConfirmOpen}
                onClose={() => setResetPasswordConfirmOpen(false)}
                onConfirm={doResetSubAdminPassword}
                title="Reset Branch Admin password?"
                description={editing?.subAdmin
                    ? `${editing.subAdmin.name} will need to use the new temporary password on next login. The old password will stop working immediately.`
                    : 'They will need to use the new temporary password on next login.'}
            />
        </div>
    );
};

/**
 * Owner-only wrapper. Branch-pinned Branch Admins are bounced to the
 * dashboard — they can't create or modify branches, and the backend
 * 403s most of the routes anyway. Keeping this at the export level
 * avoids a rules-of-hooks violation inside the inner component.
 */
const Branches = () => {
    const { user } = useAuth();
    if (user?.branch) return <Navigate to="/admin/dashboard" replace />;
    return <BranchesInner />;
};

export default Branches;
