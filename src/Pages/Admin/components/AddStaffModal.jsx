import React, { useState, useEffect, useRef } from 'react'
import { X, Upload, ArrowRight, ArrowLeft, Check, ChevronDown } from 'lucide-react'
import { useAuth } from '../../../Context/AuthContext'

// ── Reusable custom dropdown ──────────────────────────────────────────────────
const CustomDropdown = ({ value, options, onChange, placeholder = '-Select-' }) => {
    const [open, setOpen] = useState(false)
    const ref = useRef(null)

    useEffect(() => {
        const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
        document.addEventListener('mousedown', handler)
        return () => document.removeEventListener('mousedown', handler)
    }, [])

    return (
        <div className="relative" ref={ref}>
            <button
                type="button"
                onClick={() => setOpen(!open)}
                className={`w-full flex items-center justify-between px-4 py-[11px] bg-white border rounded-lg text-[14px] font-[400] font-manrope transition-all ${open ? 'border-orange-400' : 'border-gray-200'} ${value ? 'text-[#1A181B]' : 'text-gray-400'}`}
            >
                {value ? options.find(o => o.value === value)?.label : placeholder}
                <ChevronDown size={16} className={`text-gray-400 flex-shrink-0 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
            </button>

            {open && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-white rounded-xl shadow-[0px_4px_20px_0px_rgba(0,0,0,0.10)] border border-gray-100 z-30 overflow-hidden">
                    {options.map((opt, idx) => (
                        <div key={opt.value}>
                            <button
                                type="button"
                                onClick={() => { onChange(opt.value); setOpen(false) }}
                                className={`w-full text-left px-4 py-2.5 text-[14px] font-[500] font-manrope transition-colors ${value === opt.value
                                    ? 'bg-[#FE8301] text-white'
                                    : 'text-gray-600 hover:bg-[#FE8301] hover:text-white'
                                    }`}
                            >
                                {opt.label}
                            </button>
                            {idx < options.length - 1 && <div className="h-[1px] bg-gray-100 mx-4" />}
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}

// ── Static options ───────────────────────────────────────────────────────────
const ROLE_OPTIONS = [
    { value: 'Manager', label: 'Manager' },
    { value: 'Captain', label: 'Captain' },
    { value: 'Chef', label: 'Chef' },
    { value: 'Waiter', label: 'Waiter' },
]
const KITCHEN_OPTIONS = [{ value: 'veg', label: 'Veg' }, { value: 'nonveg', label: 'Non-Veg' }, { value: 'both', label: 'Both' }]

// ── Multi-select dropdown (checkbox-style with chip preview) ─────────────────
// Used for Areas + Tables in the Waiter / Captain flow. Empty selection
// signals "receive from all areas" downstream (no filter applied).
const MultiSelectDropdown = ({ values = [], options, onChange, placeholder = '-Select-', emptyHint = 'No options available', disabled = false }) => {
    const [open, setOpen] = useState(false)
    const ref = useRef(null)

    useEffect(() => {
        const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
        document.addEventListener('mousedown', handler)
        return () => document.removeEventListener('mousedown', handler)
    }, [])

    const toggle = (val) => {
        if (values.includes(val)) onChange(values.filter(v => v !== val))
        else onChange([...values, val])
    }

    const selectedLabels = options
        .filter(o => values.includes(o.value))
        .map(o => o.label)

    return (
        <div className="relative" ref={ref}>
            <button
                type="button"
                disabled={disabled}
                onClick={() => !disabled && setOpen(o => !o)}
                className={`w-full flex items-center justify-between px-4 py-[11px] bg-white border rounded-lg text-[14px] font-[400] font-manrope transition-all ${disabled ? 'bg-[#F5F5F5] text-gray-400 border-gray-200 cursor-not-allowed' : open ? 'border-orange-400' : 'border-gray-200'} ${selectedLabels.length ? 'text-[#1A181B]' : 'text-gray-400'}`}
            >
                <span className="truncate text-left">
                    {selectedLabels.length
                        ? `${selectedLabels.length} selected · ${selectedLabels.slice(0, 2).join(', ')}${selectedLabels.length > 2 ? '…' : ''}`
                        : placeholder}
                </span>
                <ChevronDown size={16} className={`text-gray-400 flex-shrink-0 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
            </button>

            {open && !disabled && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-white rounded-xl shadow-[0px_4px_20px_0px_rgba(0,0,0,0.10)] border border-gray-100 z-30 overflow-hidden max-h-[260px] overflow-y-auto">
                    {options.length === 0 ? (
                        <div className="px-4 py-3 text-[13px] text-gray-400 font-manrope">{emptyHint}</div>
                    ) : options.map((opt) => {
                        const checked = values.includes(opt.value)
                        return (
                            <button
                                key={opt.value}
                                type="button"
                                onClick={() => toggle(opt.value)}
                                className={`w-full flex items-center gap-3 px-4 py-2.5 text-[14px] font-[500] font-manrope transition-colors text-left ${checked ? 'bg-orange-50 text-[#1A181B]' : 'text-gray-700 hover:bg-gray-50'}`}
                            >
                                <span className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${checked ? 'bg-[#FE8301] border-[#FE8301]' : 'border-gray-300 bg-white'}`}>
                                    {checked && <Check size={12} className="text-white" />}
                                </span>
                                <span className="truncate">{opt.label}</span>
                            </button>
                        )
                    })}
                </div>
            )}

            {selectedLabels.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                    {options.filter(o => values.includes(o.value)).map(o => (
                        <span key={o.value} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-orange-50 border border-orange-200 text-[11px] font-[600] font-manrope text-[#FE8301]">
                            {o.label}
                            <button
                                type="button"
                                onClick={() => toggle(o.value)}
                                className="hover:text-orange-700"
                                aria-label={`Remove ${o.label}`}
                            >
                                <X size={11} />
                            </button>
                        </span>
                    ))}
                </div>
            )}
        </div>
    )
}

// ── Field label ───────────────────────────────────────────────────────────────
const Label = ({ children }) => (
    <p className="text-[14px] font-[500] font-manrope text-[#1A181B] mb-[6px]">{children}</p>
)

// ── Text input ────────────────────────────────────────────────────────────────
// `error` toggles a red border. When set, the input gets aria-invalid="true"
// and aria-describedby pointing at `${id}-err` so screen readers tie the
// error message back to the field.
const TextInput = ({
    placeholder, value, onChange, disabled, type = 'text',
    id, name, onBlur, error, required, autoComplete, inputMode, maxLength,
}) => (
    <input
        id={id}
        name={name}
        type={type}
        value={value}
        onChange={onChange}
        onBlur={onBlur}
        disabled={disabled}
        placeholder={placeholder}
        autoComplete={autoComplete}
        inputMode={inputMode}
        maxLength={maxLength}
        aria-required={required ? 'true' : undefined}
        aria-invalid={error ? 'true' : 'false'}
        aria-describedby={error && id ? `${id}-err` : undefined}
        className={`w-full px-4 py-[11px] border rounded-lg text-[14px] font-normal font-manrope placeholder:text-gray-400 focus:outline-none transition-all ${
            disabled
                ? 'bg-[#F5F5F5] text-gray-400 cursor-not-allowed border-gray-200'
                : error
                    ? 'bg-white border-red-400 focus:border-red-500'
                    : 'bg-white border-gray-200 focus:border-orange-400'
        }`}
    />
)

// ── Inline field error (paired with TextInput / CustomDropdown) ──────────────
const FieldError = ({ id, message }) =>
    message ? (
        <p id={id} role="alert" className="text-xs text-red-600 mt-1 flex items-center gap-1 font-manrope">
            <span aria-hidden="true">⚠</span>{message}
        </p>
    ) : null

// ── Step indicator ────────────────────────────────────────────────────────────
const Stepper = ({ currentStep }) => {
    const steps = [
        { number: 1, label: 'Basic Details' },
        { number: 2, label: 'Login & Security' },
        { number: 3, label: 'Permissions' },
    ]
    return (
        <div className="flex items-center w-full">
            {steps.map((step, idx) => {
                const done = currentStep > step.number
                const active = currentStep === step.number
                return (
                    <React.Fragment key={step.number}>
                        <div className="flex items-center gap-2 flex-shrink-0">
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-[13px] font-[700] flex-shrink-0 ${done ? 'bg-[#34C759] text-white' : active ? 'bg-[#3B82F6] text-white' : 'bg-gray-200 text-gray-500'}`}>
                                {done ? <Check size={15} /> : step.number}
                            </div>
                            <span className={`text-[13px] font-[600] font-manrope whitespace-nowrap ${active ? 'text-[#3B82F6]' : done ? 'text-[#34C759]' : 'text-gray-400'}`}>
                                {step.label}
                            </span>
                        </div>
                        {idx < steps.length - 1 && (
                            <div className={`flex-1 h-[1.5px] mx-3 ${done ? 'bg-[#34C759]' : 'bg-gray-200'}`} />
                        )}
                    </React.Fragment>
                )
            })}
        </div>
    )
}

// ── Main Modal ────────────────────────────────────────────────────────────────
import api from '../../../utils/api'
import { resolveImageUrl } from '../../../utils/image'
import { sanitizeMobileInput, isValidMobile, mobileError } from '../../../utils/mobile'

// ── Permission catalog ───────────────────────────────────────────────────────
// Single source of truth for the toggles shown on step 3 of the modal.
// Every key here is actually enforced somewhere — either by a backend
// `checkPermission(key)` middleware (see Backend/routes/*) or by a
// frontend `hasPermission(key)` gate (see WaiterHomePage / Sidebar).
// Keys that aren't enforced anywhere have been removed to stop the
// admin from toggling flags that did nothing.
//
// Each entry: { key, label, description, enforcedBy }
const PERMISSION_CATALOG = [
    // ── Floor & tables ────────────────────────────────────────────────
    { key: 'tables',              label: 'Table Management',        description: 'Merge or unmerge tables on the floor map', enforcedBy: 'backend' },
    { key: 'viewTableDetails',    label: 'View Table Details',      description: 'Open the table drawer to see orders / diners', enforcedBy: 'frontend' },
    { key: 'mergeTables',         label: 'Merge / Split Tables',    description: 'Show the "Merge Tables" action on the waiter floor', enforcedBy: 'frontend' },
    // ── Orders & kitchen ──────────────────────────────────────────────
    { key: 'viewOrders',          label: 'View Orders',             description: 'See the live orders list', enforcedBy: 'frontend' },
    { key: 'addOrders',           label: 'Place New Orders',        description: 'Show the "Add Order" CTAs on table detail / cart', enforcedBy: 'frontend' },
    { key: 'updateOrderStatus',   label: 'Update Order Status',     description: 'Mark orders as ready / served / cancelled', enforcedBy: 'backend' },
    { key: 'accessKitchen',       label: 'Kitchen Display (KDS)',   description: 'Access the chef KDS / kitchen ticket board', enforcedBy: 'backend' },
    // ── Service & guests ──────────────────────────────────────────────
    { key: 'viewCustomerRequests',label: 'Customer Service Requests', description: 'View and resolve water / bill / call-waiter requests', enforcedBy: 'backend' },
    { key: 'reservation',         label: 'Manage Reservations',     description: 'Create, update, and cancel reservations', enforcedBy: 'backend' },
    { key: 'crm',                 label: 'Customer CRM',            description: 'Open the CRM dashboard (customer history, segments)', enforcedBy: 'backend' },
    // ── Money ─────────────────────────────────────────────────────────
    { key: 'viewTips',            label: 'View Tips & Earnings',    description: 'Open the staff tip-history page', enforcedBy: 'frontend' },
    { key: 'viewPayments',        label: 'View Payments',           description: 'Open the payments / billing dashboard', enforcedBy: 'backend' },
    { key: 'refund',              label: 'Process Refunds',         description: 'Approve or issue refunds on completed orders', enforcedBy: 'frontend' },
    // ── Admin tools ───────────────────────────────────────────────────
    { key: 'editMenu',            label: 'Edit Menu',               description: 'Create / update / delete menu items, categories, combos', enforcedBy: 'backend' },
    { key: 'manageStaff',         label: 'Manage Staff',            description: 'Add, edit, deactivate other staff members', enforcedBy: 'backend' },
    { key: 'manageRecipe',        label: 'Manage Recipes',          description: 'View & build menu-item recipes (link ingredients, food cost). No item CRUD or stock control.', enforcedBy: 'backend' },
    { key: 'manageStock',         label: 'View Stock',               description: 'View inventory stock levels + low-stock alerts (read-only). Stock adjustments stay admin-only.', enforcedBy: 'backend' },
]

const PERMISSION_KEYS = PERMISSION_CATALOG.map(p => p.key)

// Build INITIAL_PERMISSIONS automatically so adding a key to the catalog
// above is a one-line change (no second list to keep in sync).
const INITIAL_PERMISSIONS = PERMISSION_KEYS.reduce((acc, k) => { acc[k] = false; return acc }, {})

// ── Role-based default permissions ───────────────────────────────────────────
// Auto-applied when the admin picks a role on step 1. The admin can
// still override any single toggle on step 3.
//
//   Manager → tenant-level supervisor; gets everything except KDS.
//   Captain → covers the floor; menu, refund, staff and CRM are off.
//   Chef    → KDS + order status + recipe building + read-only stock view. No floor / guest controls.
//   Waiter  → tables, requests, tips, take orders. Reads, not approves.
const DEFAULT_PERMISSIONS_BY_ROLE = {
    Manager: {
        tables: true, viewTableDetails: true, mergeTables: true,
        viewOrders: true, addOrders: true, updateOrderStatus: true, accessKitchen: false,
        viewCustomerRequests: true, reservation: true, crm: true,
        viewTips: true, viewPayments: true, refund: true,
        editMenu: true, manageStaff: true, manageRecipe: true, manageStock: true,
    },
    Captain: {
        tables: true, viewTableDetails: true, mergeTables: true,
        viewOrders: true, addOrders: true, updateOrderStatus: true, accessKitchen: false,
        viewCustomerRequests: true, reservation: true, crm: false,
        viewTips: true, viewPayments: true, refund: false,
        editMenu: false, manageStaff: false, manageRecipe: false, manageStock: false,
    },
    Chef: {
        tables: false, viewTableDetails: false, mergeTables: false,
        viewOrders: true, addOrders: false, updateOrderStatus: true, accessKitchen: true,
        viewCustomerRequests: false, reservation: false, crm: false,
        viewTips: false, viewPayments: false, refund: false,
        editMenu: false, manageStaff: false, manageRecipe: true, manageStock: true,
    },
    Waiter: {
        tables: true, viewTableDetails: true, mergeTables: true,
        viewOrders: true, addOrders: true, updateOrderStatus: false, accessKitchen: false,
        viewCustomerRequests: true, reservation: false, crm: false,
        viewTips: true, viewPayments: false, refund: false,
        editMenu: false, manageStaff: false, manageRecipe: false, manageStock: false,
    },
}

// Sentinel for the "Takeaway" entry in the Assigned Areas picker. It is NOT
// a real Area id — on submit it's split out into the `handlesTakeaway` flag,
// and on edit it's injected back when the staffer handles takeaway.
const TAKEAWAY_OPTION = '__takeaway__'

const AddStaffModal = ({ onClose, onSubmit, editData }) => {
    // Only an Admin may create / promote Managers (backend: ROLE_ADMIN_ONLY).
    // Non-admin callers (Managers with manageStaff) see floor roles only;
    // an existing Manager row keeps its option so the form can render it.
    const { user } = useAuth()
    const canAssignManager = user?.role === 'admin'
        || String(editData?.role || '').toLowerCase() === 'manager'
    const roleOptions = canAssignManager
        ? ROLE_OPTIONS
        : ROLE_OPTIONS.filter(o => o.value !== 'Manager')
    const [currentStep, setCurrentStep] = useState(1)
    const [formData, setFormData] = useState({
        employeeId: '',
        fullName: '', email: '', phone: '', role: '',
        // Area / table assignment is now multi-select. Empty arrays
        // signal "no filter" downstream — the staff receives every
        // event for their branch (legacy behaviour preserved).
        assignedAreas: [],
        assignedTables: [],
        shiftStart: '', shiftEnd: '',
        isFullTime: false, kitchenResponsibility: '',
        staffImage: null,
        avatarUrl: '',
        // Phase 6 step 4 — optional branch assignment. Empty string =
        // tenant-level (sees orders from every branch).
        branch: '',
    })
    const [permissions, setPermissions] = useState({ ...INITIAL_PERMISSIONS })
    const [areaOptions, setAreaOptions] = useState([])
    const [tableOptions, setTableOptions] = useState([])
    // Phase 6 step 4 — branch options. Empty for tenants without the
    // multiBranch feature, which hides the picker entirely.
    const [branchOptions, setBranchOptions] = useState([])
    // Per-field validation errors (step 1). Keys match input ids.
    // Step 2 has no editable fields, step 3 has toggles only — neither needs validation.
    const [errors, setErrors] = useState({})
    // Locks Next/Submit + Back + X while the parent's onSubmit handler
    // is in flight, preventing duplicate Create Member calls.
    const [submitting, setSubmitting] = useState(false)

    const set = (field, value) => {
        setFormData(prev => ({ ...prev, [field]: value }))
        // Clear the field's error the moment the user edits it.
        if (errors[field]) setErrors(prev => ({ ...prev, [field]: undefined }))
    }

    useEffect(() => {
        // Call setFormData directly (not via `set`) so this effect doesn't
        // need `set` in its dep list — `set` closes over `errors` and
        // would otherwise re-run this effect on every keystroke.
        //
        // EMP-XXX numbering is per (tenant, branch) — so we pass the
        // selected branch to the API and refetch whenever the admin
        // switches branch. Without this the preview shows the next ID
        // for the tenant-level (branch=null) bucket and can collide
        // with EMP-XXX already taken at the chosen branch.
        const fetchNextId = async () => {
           try {
             const params = formData.branch ? { branch: formData.branch } : undefined;
             const res = await api.get('/staff/next-id', { params });
             if (res.data.success) setFormData(prev => ({ ...prev, employeeId: res.data.nextId }));
           } catch (err) { console.error(err); }
        };
        if (!editData) fetchNextId();
    }, [editData, formData.branch]);

    // Phase 6 step 4 — fetch branches. _silent so FEATURE_LOCKED on
    // non-multiBranch plans doesn't flash a toast; we just get an
    // empty list and hide the picker.
    useEffect(() => {
        let cancelled = false
        ;(async () => {
            try {
                const res = await api.get('/branches', { _silent: true })
                if (!cancelled) setBranchOptions(res.data?.data || [])
            } catch {
                if (!cancelled) setBranchOptions([])
            }
        })()
        return () => { cancelled = true }
    }, [])

    // Fetch real areas & tables from backend. Tables carry their parent
    // area id so the table picker can be filtered when the user picks
    // specific areas. Table responses populate `area` as either a string
    // ObjectId or a populated `{ _id, name }` — handle both shapes.
    useEffect(() => {
        const fetchAreasAndTables = async () => {
            try {
                const [areaRes, tableRes] = await Promise.all([
                    api.get('/areas'),
                    api.get('/tables'),
                ]);
                if (areaRes.data?.success) {
                    setAreaOptions(areaRes.data.areas
                        .filter(a => a.isActive !== false)
                        .map(a => ({ value: a._id, label: a.name }))
                    );
                }
                if (tableRes.data?.success) {
                    setTableOptions(tableRes.data.tables.map(t => ({
                        value: t._id,
                        label: t.name,
                        areaId: (t.area && typeof t.area === 'object') ? t.area._id : t.area,
                        areaName: (t.area && typeof t.area === 'object') ? t.area.name : '',
                    })));
                }
            } catch (err) { console.error('Failed to fetch areas/tables', err); }
        };
        fetchAreasAndTables();
    }, []);

    // Hydrate the form ONCE from editData when the modal opens. Using
    // editData?._id (a stable string id) instead of the editData object
    // means re-renders that pass the same staff member with a new
    // reference (e.g. after fetchStaff refreshes the list) won't wipe
    // out the user's in-progress edits to permissions.
    useEffect(() => {
        if (editData) {
            // Backend may return populated docs ({ _id, name }) OR bare
            // ObjectIds depending on the endpoint. Normalize both shapes
            // to a flat string id array so the MultiSelect can match.
            const normalizeIds = (v) => {
                if (!Array.isArray(v)) return []
                return v.map(x => (x && typeof x === 'object' ? x._id : x)).filter(Boolean)
            }
            // Backend stores roles lowercase ('waiter', 'captain', …) but
            // ROLE_OPTIONS (and every role check below) use titlecase
            // ('Waiter', …). Without this normalization the role dropdown
            // can't match the value and renders the "-Select-" placeholder
            // on edit even though a role is set.
            const titleCaseRole = (r) => r ? String(r).charAt(0).toUpperCase() + String(r).slice(1).toLowerCase() : ''
            const editRole = titleCaseRole(editData.role)
            setFormData(prev => ({
                ...prev,
                employeeId: editData.id || editData.staffId,
                fullName: editData.name,
                email: editData.email,
                phone: editData.phone || editData.mobile,
                role: editRole,
                avatarUrl: editData.avatar,
                // Phase 6 step 4 — preselect the existing branch.
                // populate('branch') on the backend returns a nested
                // object; raw id is the fallback.
                branch: editData.branch?._id || editData.branch || '',
                // Inject the "Takeaway" pseudo-area when this staffer handles
                // takeaway, so it shows pre-selected in the Assigned Areas list.
                assignedAreas: [
                    ...normalizeIds(editData.assignedAreas),
                    ...(editData.handlesTakeaway ? [TAKEAWAY_OPTION] : []),
                ],
                assignedTables: normalizeIds(editData.assignedTables),
            }))
            // Hydrate permissions explicitly. If the staff has no stored
            // permissions object, fall back to the role's defaults so the
            // toggles start from the same state the admin first saw when
            // the staff was created — instead of all-off, which would
            // confuse them.
            if (editData.permissions && Object.keys(editData.permissions).length > 0) {
                // Merge with INITIAL_PERMISSIONS to guarantee every key
                // is a defined boolean (not undefined → toggle gets stuck)
                setPermissions({ ...INITIAL_PERMISSIONS, ...editData.permissions });
            } else {
                const fallback = DEFAULT_PERMISSIONS_BY_ROLE[editRole] || INITIAL_PERMISSIONS;
                setPermissions({ ...fallback });
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [editData?._id])

    const handleImageUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const formDataUpload = new FormData();
        formDataUpload.append('image', file);
        try {
            const res = await api.post('/upload', formDataUpload, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });
            if (res.data.success) {
                set('avatarUrl', res.data.url);
            }
        } catch (err) { console.error('Upload failed', err); }
    };

    // Auto-apply role-based default permissions when role changes (only for new staff)
    useEffect(() => {
        if (!editData && formData.role) {
            const defaults = DEFAULT_PERMISSIONS_BY_ROLE[formData.role] || INITIAL_PERMISSIONS
            setPermissions({ ...defaults })
        }
    }, [formData.role, editData])

    // Clean up area/table assignments when the role changes to one that
    // doesn't use them. Captain keeps areas but loses tables; Manager /
    // Chef lose both. Prevents stale selections from leaking into the
    // payload — backend would drop them anyway, but the UI should match
    // what will actually be saved.
    useEffect(() => {
        if (formData.role === 'Captain') {
            // Captain covers whole areas — drop any individual table pins
            if (formData.assignedTables.length > 0) {
                setFormData(prev => ({ ...prev, assignedTables: [] }))
            }
        } else if (formData.role === 'Manager' || formData.role === 'Chef') {
            if (formData.assignedAreas.length > 0 || formData.assignedTables.length > 0) {
                setFormData(prev => ({ ...prev, assignedAreas: [], assignedTables: [] }))
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [formData.role])

    const isWaiter = formData.role === 'Waiter'
    const isCaptain = formData.role === 'Captain'
    const isChef = formData.role === 'Chef'
    const isManager = formData.role === 'Manager'

    // Filter the table picker to only tables in the selected areas. If
    // no areas are picked yet, the table picker is disabled so the user
    // can't pin a table that conflicts with their (eventual) area filter.
    const filteredTableOptions = formData.assignedAreas.length > 0
        ? tableOptions
            .filter(t => formData.assignedAreas.includes(t.areaId))
            .map(t => ({ value: t.value, label: t.areaName ? `${t.label}  (${t.areaName})` : t.label }))
        : []

    // ── Step 1 validation ────────────────────────────────────────────────
    // Pulled out of the inline button onClick so it's readable + testable.
    // Returns a map of field → error string. Empty map means valid.
    const validateStep1 = () => {
        const e = {}
        if (!formData.fullName.trim()) e.fullName = 'Full name is required'
        if (!formData.email.trim())                                              e.email = 'Email is required'
        else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email))             e.email = 'Enter a valid email address'
        if (!formData.phone.trim())                                              e.phone = 'Mobile number is required'
        else if (!isValidMobile(formData.phone))                                 e.phone = mobileError(formData.phone)
        if (!formData.role)                                                     e.role = 'Please select a role'
        // Branch requirement matches the backend rule in
        // staffController.addStaff — every non-admin staff at a multi-
        // branch tenant must be pinned to one branch so the per-branch
        // Staff Management view groups them correctly instead of dropping
        // them into the "Unassigned" bucket. Admin role is exempt by
        // design (tenant owner keeps cross-branch access — see
        // utils/createMainBranch.js). Comparison is case-insensitive
        // because backend enum is lowercase ('admin') while the modal's
        // ROLE_OPTIONS use titlecase.
        if (
            branchOptions.length > 0 &&
            formData.role &&
            !['admin', 'manager'].includes(String(formData.role).toLowerCase()) &&
            !formData.branch
        ) {
            e.branch = 'Please select a branch'
        }
        return e
    }

    const handleNext = async () => {
        if (currentStep === 1) {
            const e = validateStep1()
            setErrors(e)
            if (Object.keys(e).length) {
                // Focus the first invalid field so the user lands on the
                // problem instead of scanning for what's red.
                const first = ['fullName', 'email', 'phone', 'role', 'branch'].find(k => e[k])
                if (first) {
                    setTimeout(() => {
                        const el = document.getElementById(first)
                        if (el) { try { el.focus() } catch { /* noop */ } el.scrollIntoView?.({ behavior: 'smooth', block: 'center' }) }
                    }, 0)
                }
                return
            }
        }
        if (currentStep < 3) {
            setCurrentStep(s => s + 1)
        } else {
            // Lock the button while the parent persists. Parent unmounts
            // this modal on success, so the lock lives only briefly.
            if (submitting) return
            setSubmitting(true)
            try {
                // Split the "Takeaway" pseudo-area out of assignedAreas into
                // the dedicated handlesTakeaway flag — backend expects real
                // Area ids in assignedAreas only.
                const rawAreas = formData.assignedAreas || []
                const handlesTakeaway = rawAreas.includes(TAKEAWAY_OPTION)
                const cleanAreas = rawAreas.filter(a => a !== TAKEAWAY_OPTION)
                await onSubmit?.({ ...formData, assignedAreas: cleanAreas, handlesTakeaway, permissions })
            } finally {
                // Parent usually unmounts on success — this only runs if
                // they kept the modal mounted (e.g. on a server error).
                setSubmitting(false)
            }
        }
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="bg-white rounded-2xl w-full max-w-[680px] max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">

                {/* ── Header ── title + close only */}
                <div className="px-7 pt-6 pb-5 bg-[#FFF5EE] shrink-0 flex items-center justify-between">
                    <h2 className="text-[22px] font-[700] font-manrope text-[#1A181B]">
                        {editData ? 'Edit Staff Member' : 'Add New Staff'}
                    </h2>
                    <button
                        onClick={onClose}
                        disabled={submitting}
                        aria-label="Close"
                        title={submitting ? 'Wait for save to finish' : 'Close'}
                        className="p-1 text-gray-400 hover:text-gray-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                        <X size={22} />
                    </button>
                </div>

                {/* ── Body ── stepper + form + button all inside scroll area */}
                <div className="px-7 py-6 overflow-y-auto flex-1 no-scrollbar">

                    {/* Stepper */}
                    <div className="mb-6">
                        <Stepper currentStep={currentStep} />
                    </div>

                    {/* ── Step 1: Basic Details ── */}
                    {currentStep === 1 && (
                        <div className="flex gap-6">
                            {/* Left column */}
                            <div className="flex-1 space-y-4 min-w-0">

                                {/* Employee ID */}
                                <div>
                                    <Label>Employee ID</Label>
                                    <TextInput
                                        value={formData.employeeId}
                                        disabled
                                        placeholder="EMP-001"
                                        onChange={() => { }}
                                    />
                                </div>

                                {/* Full Name */}
                                <div>
                                    <Label>Full name <span className="text-red-500" aria-hidden="true">*</span></Label>
                                    <TextInput
                                        id="fullName"
                                        name="fullName"
                                        required
                                        autoComplete="name"
                                        placeholder="e.g. Priya Sharma"
                                        value={formData.fullName}
                                        onChange={(e) => set('fullName', e.target.value)}
                                        error={errors.fullName}
                                    />
                                    <FieldError id="fullName-err" message={errors.fullName} />
                                </div>

                                {/* Email ID */}
                                <div>
                                    <Label>Email <span className="text-red-500" aria-hidden="true">*</span></Label>
                                    <TextInput
                                        id="email"
                                        name="email"
                                        type="email"
                                        required
                                        autoComplete="email"
                                        placeholder="staff@yourrestaurant.com"
                                        value={formData.email}
                                        onChange={(e) => set('email', e.target.value)}
                                        error={errors.email}
                                    />
                                    <FieldError id="email-err" message={errors.email} />
                                </div>

                                {/* Mobile Number */}
                                <div>
                                    <Label>Mobile number <span className="text-red-500" aria-hidden="true">*</span></Label>
                                    <TextInput
                                        id="phone"
                                        name="phone"
                                        type="tel"
                                        inputMode="numeric"
                                        pattern="[6-9][0-9]{9}"
                                        required
                                        autoComplete="tel-national"
                                        placeholder="10-digit mobile number"
                                        value={formData.phone}
                                        onChange={(e) => set('phone', sanitizeMobileInput(e.target.value))}
                                        error={errors.phone}
                                    />
                                    <FieldError id="phone-err" message={errors.phone} />
                                </div>

                                {/* Select Role */}
                                <div>
                                    <Label>Role <span className="text-red-500" aria-hidden="true">*</span></Label>
                                    <div className={errors.role ? 'rounded-lg ring-1 ring-red-400' : ''}>
                                        <CustomDropdown
                                            value={formData.role}
                                            options={roleOptions}
                                            onChange={(v) => set('role', v)}
                                            placeholder="-Select-"
                                        />
                                    </div>
                                    <FieldError id="role-err" message={errors.role} />
                                </div>

                                {/* Branch assignment — required when the
                                    tenant has any branches. Modal only
                                    creates non-admin roles (waiter / captain /
                                    chef), and every non-admin needs to be
                                    pinned to one location so the per-branch
                                    Staff Management view groups them
                                    correctly instead of dropping them into
                                    the "Unassigned" bucket. Hidden entirely
                                    for tenants without branches (single-
                                    location installs and plans without
                                    multiBranch). */}
                                {branchOptions.length > 0 && (
                                    <div>
                                        <Label>Assigned branch <span className="text-red-500" aria-hidden="true">*</span></Label>
                                        <div className={errors.branch ? 'rounded-lg ring-1 ring-red-400' : ''}>
                                            <CustomDropdown
                                                value={formData.branch}
                                                options={branchOptions.map(b => ({
                                                    value: b._id,
                                                    label: b.city ? `${b.name} · ${b.city}` : b.name,
                                                }))}
                                                onChange={(v) => set('branch', v)}
                                                placeholder="-Select branch-"
                                            />
                                        </div>
                                        <FieldError id="branch-err" message={errors.branch} />
                                        <p className="text-[12px] text-[#8D848F] mt-1 font-manrope">
                                            Staff are pinned to a single branch and only see that branch's orders.
                                        </p>
                                    </div>
                                )}

                                {/* Chef — Kitchen Responsibility */}
                                {isChef && (
                                    <div>
                                        <Label>Kitchen Responsibility</Label>
                                        <CustomDropdown
                                            value={formData.kitchenResponsibility}
                                            options={KITCHEN_OPTIONS}
                                            onChange={(v) => set('kitchenResponsibility', v)}
                                            placeholder="Veg, Non-Veg, Both"
                                        />
                                    </div>
                                )}

                                {/* Waiter / Captain — Area (+ Table for waiter) */}
                                {(isWaiter || isCaptain) && (
                                    <>
                                        <div>
                                            <Label>
                                                Assigned Areas
                                                <span className="ml-2 text-[11px] font-[400] text-gray-400 font-manrope">(leave empty to receive from all areas)</span>
                                            </Label>
                                            <MultiSelectDropdown
                                                values={formData.assignedAreas}
                                                options={isWaiter
                                                    ? [{ value: TAKEAWAY_OPTION, label: 'Takeaway (counter orders)' }, ...areaOptions]
                                                    : areaOptions}
                                                onChange={(vals) => {
                                                    // Wipe stale table picks that no longer belong
                                                    // to any selected area.
                                                    const stillValid = formData.assignedTables.filter(tid => {
                                                        const t = tableOptions.find(o => o.value === tid)
                                                        return t && vals.includes(t.areaId)
                                                    })
                                                    setFormData(prev => ({
                                                        ...prev,
                                                        assignedAreas: vals,
                                                        assignedTables: stillValid,
                                                    }))
                                                }}
                                                placeholder="-Select areas-"
                                                emptyHint="No areas configured yet"
                                            />
                                        </div>

                                        {/* Tables — waiter only. Captains cover whole areas. */}
                                        {isWaiter && (
                                            <div>
                                                <Label>
                                                    Assigned Tables
                                                    <span className="ml-2 text-[11px] font-[400] text-gray-400 font-manrope">
                                                        {formData.assignedAreas.length === 0
                                                            ? '(pick areas first)'
                                                            : '(leave empty to receive every table in the selected areas)'}
                                                    </span>
                                                </Label>
                                                <MultiSelectDropdown
                                                    values={formData.assignedTables}
                                                    options={filteredTableOptions}
                                                    onChange={(vals) => set('assignedTables', vals)}
                                                    placeholder={formData.assignedAreas.length === 0 ? 'Select areas first' : '-Select tables-'}
                                                    emptyHint="No tables in the selected areas"
                                                    disabled={formData.assignedAreas.length === 0}
                                                />
                                            </div>
                                        )}

                                        {/* Shift Timings */}
                                        <div>
                                            <Label>Shift Timings</Label>
                                            <div className="flex gap-3 items-end">
                                                <div className="flex-1">
                                                    <p className="text-[12px] font-[400] font-manrope text-gray-400 mb-1.5">Start Time</p>
                                                    <div className="relative">
                                                        <input
                                                            type="time"
                                                            value={formData.shiftStart}
                                                            onChange={(e) => set('shiftStart', e.target.value)}
                                                            className="w-full px-4 py-[11px] border border-gray-200 rounded-lg text-[14px] font-[400] font-manrope placeholder:text-gray-400 focus:outline-none focus:border-orange-400"
                                                        />
                                                    </div>
                                                </div>
                                                <div className="flex-1">
                                                    <p className="text-[12px] font-[400] font-manrope text-gray-400 mb-1.5">End Time</p>
                                                    <div className="relative">
                                                        <input
                                                            type="time"
                                                            value={formData.shiftEnd}
                                                            onChange={(e) => set('shiftEnd', e.target.value)}
                                                            className="w-full px-4 py-[11px] border border-gray-200 rounded-lg text-[14px] font-[400] font-manrope placeholder:text-gray-400 focus:outline-none focus:border-orange-400"
                                                        />
                                                    </div>
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={() => set('isFullTime', !formData.isFullTime)}
                                                    className={`px-4 py-[11px] rounded-lg text-[14px] font-[600] border transition-colors flex-shrink-0 ${formData.isFullTime ? 'bg-[#FE8301] text-white border-[#FE8301]' : 'bg-gray-100 text-gray-500 border-gray-200'}`}
                                                >
                                                    Full Time
                                                </button>
                                            </div>
                                        </div>
                                    </>
                                )}

                                {/* Manager — no extra fields beyond role + branch.
                                    Manager covers the whole tenant by default; per-
                                    area pinning doesn't make sense for them. The
                                    branch picker is optional — leave blank for a
                                    tenant-wide manager, or pick one to scope them
                                    to a single location. */}
                                {isManager && (
                                    <div className="bg-[#FFF5EE] border border-[#FFD8AC] rounded-xl p-3.5">
                                        <p className="text-[13px] font-[500] font-manrope text-[#7A4A0F]">
                                            Leave Branch empty for a tenant-wide Manager (oversees every branch), or pick a branch to scope them to one location. Use the Permissions step to fine-tune what they can do.
                                        </p>
                                    </div>
                                )}
                            </div>

                            {/* Right column — Staff Image */}
                            <div className="w-[195px] flex-shrink-0">
                                <Label>Staff Image</Label>
                                <label className="border-2 border-dashed border-gray-200 rounded-xl h-[210px] flex flex-col items-center justify-center gap-2 bg-white cursor-pointer hover:border-orange-400 transition-colors overflow-hidden">
                                    <input type="file" className="hidden" accept="image/*" onChange={handleImageUpload} />
                                    {formData.avatarUrl ? (
                                        <img src={resolveImageUrl(formData.avatarUrl) || formData.avatarUrl} alt="Avatar Preview" className="w-full h-full object-cover" />
                                    ) : (
                                        <div className="flex flex-col items-center gap-1">
                                            <Upload size={26} className="text-gray-400" />
                                            <p className="text-[12px] font-[400] font-manrope text-gray-400 text-center leading-5 mt-1 px-4">
                                                Click to upload or drag and drop
                                            </p>
                                            <p className="text-[11px] font-[400] font-manrope text-gray-400">
                                                PNG, JPG up to 5MB
                                            </p>
                                        </div>
                                    )}
                                </label>
                            </div>
                        </div>
                    )}

                    {/* ── Step 2: Login & Security ── */}
                    {currentStep === 2 && (
                        <div className="space-y-5">
                            <div>
                                <Label>Login Email</Label>
                                <TextInput
                                    value={formData.email}
                                    disabled
                                    placeholder="Email from Step 1"
                                    onChange={() => { }}
                                />
                                <p className="text-[12px] text-gray-400 font-manrope mt-1">Staff will use this email to log in</p>
                            </div>
                            <div>
                                <Label>Temporary Password</Label>
                                <TextInput
                                    value="Auto-generated on creation"
                                    disabled
                                    placeholder=""
                                    onChange={() => { }}
                                />
                                <p className="text-[12px] text-gray-400 font-manrope mt-1">A secure password will be generated automatically. You will see it once after creating the account.</p>
                            </div>
                            <div className="bg-[#F0F9FF] border border-[#BAE6FD] rounded-xl p-4">
                                <p className="text-[13px] font-[500] font-manrope text-[#0369A1]">
                                    The staff member will be required to change their password on first login.
                                </p>
                            </div>
                        </div>
                    )}

                    {/* ── Step 3: Permissions ── */}
                    {currentStep === 3 && (
                        <div>
                            <div className="mb-5 flex items-start justify-between gap-3 flex-wrap">
                                <div>
                                    <h3 className="text-[16px] font-[700] font-manrope text-[#1A181B]">Role Permissions</h3>
                                    <p className="text-[13px] text-gray-500 font-manrope mt-0.5">
                                        Defaults are auto-applied for <span className="font-[600] text-[#1A181B]">{formData.role || 'this role'}</span>.
                                        Toggle anything to override.
                                    </p>
                                </div>
                                {formData.role && DEFAULT_PERMISSIONS_BY_ROLE[formData.role] && (
                                    <button
                                        type="button"
                                        onClick={() => setPermissions({ ...INITIAL_PERMISSIONS, ...DEFAULT_PERMISSIONS_BY_ROLE[formData.role] })}
                                        className="text-[12px] font-[600] font-manrope text-[#FE8301] hover:underline whitespace-nowrap"
                                    >
                                        Reset to {formData.role} defaults
                                    </button>
                                )}
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                {PERMISSION_CATALOG.map(({ key, label, description }) => (
                                    <div key={key} className="flex items-start justify-between gap-3 px-4 py-3 bg-gray-50 rounded-xl border border-gray-100">
                                        <div className="min-w-0 flex-1">
                                            <p className="text-[13px] font-[600] font-manrope text-[#1A181B]">{label}</p>
                                            <p className="text-[11px] font-[400] font-manrope text-gray-500 mt-0.5 leading-snug">{description}</p>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => setPermissions(p => ({ ...p, [key]: !p[key] }))}
                                            className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 mt-0.5 ${permissions[key] ? 'bg-[#34C759]' : 'bg-gray-300'}`}
                                            aria-pressed={!!permissions[key]}
                                            aria-label={`${permissions[key] ? 'Disable' : 'Enable'} ${label}`}
                                        >
                                            <span className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-all ${permissions[key] ? 'left-[22px]' : 'left-[4px]'}`} />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* ── Action button ── inside body, bottom-right */}
                    <div className="flex items-center justify-end gap-3 mt-6">
                        {currentStep > 1 && (
                            <button
                                type="button"
                                onClick={() => setCurrentStep(s => s - 1)}
                                disabled={submitting}
                                className="flex items-center gap-2 px-6 py-2.5 border border-gray-300 rounded-lg text-[14px] font-semibold font-manrope text-gray-500 hover:border-gray-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                <ArrowLeft size={16} />
                                Back
                            </button>
                        )}

                        <button
                            type="button"
                            onClick={handleNext}
                            disabled={submitting}
                            aria-busy={submitting ? 'true' : 'false'}
                            className="flex items-center gap-2 px-7 py-2.5 bg-[#FE8301] text-white rounded-lg text-[14px] font-semibold font-manrope hover:bg-orange-600 transition-colors shadow-sm disabled:bg-orange-300 disabled:cursor-not-allowed"
                        >
                            {currentStep === 3 ? (
                                submitting
                                    ? <>Saving…</>
                                    : <><Check size={16} />{editData ? 'Update member' : 'Create member'}</>
                            ) : (
                                <>Next <ArrowRight size={16} /></>
                            )}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    )
}

export default AddStaffModal
