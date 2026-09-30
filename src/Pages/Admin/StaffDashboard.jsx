import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Search, Eye, Pencil, Plus, ChevronDown, Trash2, Building2, Users, Upload } from 'lucide-react'
import StaffProfileDrawer from './components/StaffProfileDrawer'
import AddStaffModal from './components/AddStaffModal'
import BulkAddStaffModal from './components/BulkAddStaffModal'
import ConfirmModal from './components/ConfirmModal'
import StaffConfirmationModal from './components/StaffConfirmationModal'
import StaffPerformanceModal from './components/StaffPerformanceModal'
import TipSettlementView from './components/TipSettlementView'
import StaffCredentialModal from './components/StaffCredentialModal'

// Import hooks and components
import { toast } from 'react-hot-toast'
import api from '../../utils/api'
import { useAdminBranch } from '../../Context/AdminBranchContext'
import { useAuth } from '../../Context/AuthContext'
import useSocketEvent from '../../hooks/useSocketEvent'

// Prefix relative /uploads/ paths with the backend origin
const BACKEND_URL = import.meta.env.VITE_API_URL?.replace(/\/api.*$/, '') || '';
const resolveAvatar = (url) => {
    if (!url) return null; // null = show initials instead
    if (url.startsWith('/uploads/')) return `${BACKEND_URL}${url}`;
    if (url.startsWith('http')) return url;
    return null;
};

const roleStyles = {
    'Branch Admin': 'bg-[#0E7C86]/10 text-[#0E7C86] border-[#0E7C86] border-[0.5px]',
    'Manager': 'bg-[#16A34A]/10 text-[#16A34A] border-[#16A34A] border-[0.5px]',
    'Chef': 'bg-[#FE8301]/10 text-[#FE8301] border-[#FE8301] border-[0.5px]',
    'Waiter': 'bg-[#007AFF]/10 text-[#007AFF] border-[#007AFF] border-[0.5px]',
    'Captain': 'bg-[#702083]/10 text-[#702083] border-[#702083] border-[0.5px]',
    'Admin': 'bg-gray-100 text-gray-800 border-gray-300 border-[0.5px]'
}

const shiftStyles = {
    'On Duty': 'px-3 py-1 rounded-[8px] bg-[#05A22C]/10 text-[#05A22C] inline-block',
    'Off Duty': 'px-3 py-1 rounded-[8px] bg-[#F5F5F5] text-[#645E66] inline-block',
}

const statusStyles = {
    'active': 'bg-[#E8FFF0] text-[#34C759] border-[#34C759]',
    'inactive': 'bg-[#FFF3E6] text-[#FE8301] border-[#FE8301]',
}

// Collapsible section header used by the "Group by Branch" view.
// Wraps a staff table under a clickable branch banner with a count chip.
const BranchGroupSection = ({ title, subtitle, avatarChar, accent = 'orange', count, collapsed, onToggle, children }) => {
    const accents = {
        orange: {
            wrapper: 'border-gray-200',
            header: 'bg-gradient-to-r from-orange-50 to-white hover:from-orange-100/70',
            avatar: 'bg-gradient-to-br from-orange-100 to-orange-200 text-[#FE8301]',
        },
        slate: {
            wrapper: 'border-dashed border-gray-300',
            header: 'bg-gray-50 hover:bg-gray-100',
            avatar: 'bg-gray-200 text-gray-500',
        },
    };
    const a = accents[accent] || accents.orange;
    return (
        <div className={`bg-white rounded-xl border overflow-hidden ${a.wrapper}`}>
            <button
                type="button"
                onClick={onToggle}
                className={`w-full px-4 py-3 flex items-center justify-between border-b border-gray-100 transition-colors ${a.header}`}
            >
                <div className="flex items-center gap-3 min-w-0">
                    <div className={`w-9 h-9 rounded-lg flex items-center justify-center font-bold text-sm shrink-0 ${a.avatar}`}>
                        {avatarChar || <Users size={16} />}
                    </div>
                    <div className="text-left min-w-0">
                        <p className="font-[700] text-[14px] text-[#1A181B] font-manrope truncate">{title}</p>
                        {subtitle && (
                            <p className="text-[11px] text-gray-500 font-mono truncate">{subtitle}</p>
                        )}
                    </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                    <span className="px-3 py-1 bg-white border border-gray-200 text-gray-600 text-[11px] font-[700] rounded-full inline-flex items-center gap-1.5">
                        <Users size={12} />
                        {count}
                    </span>
                    <ChevronDown size={18} className={`text-gray-400 transition-transform duration-200 ${collapsed ? '-rotate-90' : ''}`} />
                </div>
            </button>
            {!collapsed && children}
        </div>
    );
};

const ROLE_LOCK_MSG = 'Only an Admin can manage Manager or Admin accounts.'

const StaffDashboard = () => {
    const { selectedBranchId, branches, isLocked } = useAdminBranch();
    // Only an Admin may edit / toggle / delete / reset Manager or Admin
    // accounts (backend: ROLE_ADMIN_ONLY). Managers keep these actions
    // for floor staff (waiter / chef / captain).
    const { user: authUser } = useAuth();
    const canManageMember = useCallback((m) => (
        authUser?.role === 'admin'
        || ['waiter', 'chef', 'captain'].includes(String(m?.rawRole || m?.role || '').toLowerCase())
    ), [authUser?.role]);
    const [searchTerm, setSearchTerm] = useState('')
    const [selectedRole, setSelectedRole] = useState('Select Role')
    const [selectedStatus, setSelectedStatus] = useState('Select Status')
    const [showRoleDropdown, setShowRoleDropdown] = useState(false)
    const [showStatusDropdown, setShowStatusDropdown] = useState(false)

    // Phase 6 step 4 follow-up — branch-grouped view. When ON, the global
    // branch selector is ignored and staff are bucketed under each active
    // branch (plus an "Unassigned" tenant-level section). Only meaningful
    // for tenant admins with 2+ active branches.
    const [groupByBranch, setGroupByBranch] = useState(false)
    const [collapsedGroups, setCollapsedGroups] = useState({})
    const activeBranches = (branches || []).filter(b => b.isActive)
    const canGroup = !isLocked && activeBranches.length >= 2
    const subAdminVisible = !!selectedBranchId || groupByBranch

    const roleDdRef = useRef(null)
    const statusDdRef = useRef(null)

    useEffect(() => {
        const handler = (e) => {
            if (roleDdRef.current && !roleDdRef.current.contains(e.target)) setShowRoleDropdown(false)
            if (statusDdRef.current && !statusDdRef.current.contains(e.target)) setShowStatusDropdown(false)
        }
        document.addEventListener('mousedown', handler)
        return () => document.removeEventListener('mousedown', handler)
    }, [])
    const [roleFilter, setRoleFilter] = useState('All')
    const [showTipSettlement, setShowTipSettlement] = useState(false)

    // ── Staff list (React Query) ────────────────────────────────────────────
    // Grouped view ignores the global branch selector — we need every staff
    // member to bucket them under the right branch section. Specific-branch
    // mode hits with ?branch=<id>. The flat "All Branches" view also hides
    // Branch Admins; the grouped view keeps them so each branch section shows
    // its own admin at the top.
    //
    // The cache key encodes the params so flipping branches paints the
    // previously-loaded list instantly while React Query revalidates in
    // the background. `fetchStaff` is preserved as a refetch shim so the
    // existing imperative-refresh sites (post-add modal, status toggles)
    // continue to work.
    const staffQueryParams = useMemo(() => {
        const p = {}
        if (selectedBranchId && !groupByBranch) p.branch = selectedBranchId
        return p
    }, [selectedBranchId, groupByBranch])

    const { data: staffList = [], refetch: refetchStaffList } = useQuery({
        queryKey: ['admin', 'staff', 'dashboard', staffQueryParams, !!groupByBranch, { branch: selectedBranchId || 'all' }],
        queryFn: async () => {
            // In grouped mode we need every branch's staff to bucket them
            // correctly. The global axios interceptor (utils/api.js) would
            // otherwise inject `?branch=<adminActiveBranch>` and limit the
            // response to a single branch — which made every section
            // except Main appear empty (no Branch Admin / no staff at all
            // in sub-branches). `_skipAdminBranchParam` opts us out of
            // that auto-injection for this one request.
            const res = await api.get('/staff', {
                params: staffQueryParams,
                _skipAdminBranchParam: groupByBranch ? true : undefined,
            })
            if (!res.data?.success) return []
            let mapped = res.data.staff.map(m => {
                // Display role rules:
                //   admin + branch pin → "Branch Admin" (distinct tag colour)
                //   admin + no pin     → "Admin"        (tenant owner)
                //   manager (any)      → "Manager"      (always plain — user
                //                                        feedback 2026-05-20:
                //                                        "Branch Manager" was
                //                                        confusing because the
                //                                        responsibilities don't
                //                                        change based on whether
                //                                        a branch is pinned)
                //   everything else    → capitalised raw role
                let displayRole = m.role.charAt(0).toUpperCase() + m.role.slice(1)
                if (m.role === 'admin' && m.branch) displayRole = 'Branch Admin'
                return {
                    ...m,
                    id: m.staffId || '',
                    // Preserve the raw backend role on `rawRole` so the grouping
                    // logic below can still distinguish tenant admins (raw
                    // 'admin') from any other displayed value. Overwriting
                    // `role` with the capitalised display string broke the
                    // `m.role === 'admin'` checks in the grouped-by-branch
                    // view, which is why tenant admins were leaking into the
                    // "Unassigned" bucket instead of appearing under Main.
                    rawRole: m.role,
                    role: displayRole,
                    shift: m.isOnDuty ? 'On Duty' : 'Off Duty',
                    phone: m.mobile,
                }
            })
            if (!selectedBranchId && !groupByBranch) {
                mapped = mapped.filter(m => m.role !== 'Branch Admin')
            }
            return mapped
        },
        staleTime: 60_000,
        keepPreviousData: true,
        onError: () => toast.error('Failed to load staff data'),
    })
    const fetchStaff = useCallback(() => { refetchStaffList() }, [refetchStaffList])

    // WAI-029 — re-fetch the staff list whenever a clock-in / clock-out
    // / force-clock-out fires server-side. Without this the React Query
    // staleTime (60s) holds an outdated "Off Duty" badge for up to a
    // minute after the waiter starts their shift. Lightweight refetch
    // because the request is small (just the staff array).
    useSocketEvent('staff:duty-changed', fetchStaff)

    // Reset Branch Admin filter selections when it stops being available.
    useEffect(() => {
        if (!subAdminVisible && (roleFilter === 'Branch Admin' || selectedRole === 'Branch Admin')) {
            setRoleFilter('All');
            setSelectedRole('Select Role');
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [subAdminVisible]);

    // If grouping becomes unavailable (e.g. branches disabled down to 1),
    // automatically fall back to the flat view so the toggle never strands.
    useEffect(() => {
        if (!canGroup && groupByBranch) setGroupByBranch(false);
    }, [canGroup, groupByBranch]);

    // Role pills should only render for roles that actually exist in
    // the loaded staff list — otherwise the admin sees a "Captain" chip
    // they can never use because the tenant has no captains. Pulled from
    // the un-search-filtered staffList so typing doesn't make pills
    // vanish mid-search. The fixed pill order is preserved.
    const presentRoles = useMemo(() => {
        const s = new Set()
        for (const m of staffList) if (m.role) s.add(m.role)
        return s
    }, [staffList])
    const visiblePillRoles = useMemo(() => {
        const order = ['Branch Admin', 'Manager', 'Captain', 'Chef', 'Waiter']
        return order.filter(r => {
            if (r === 'Branch Admin' && !subAdminVisible) return false
            return presentRoles.has(r)
        })
    }, [presentRoles, subAdminVisible])

    // If the active filter drops out of the present set (e.g. last
    // chef was deleted), snap back to "All" so the table doesn't
    // silently look empty under a pill the user can no longer see.
    useEffect(() => {
        if (roleFilter !== 'All' && !visiblePillRoles.includes(roleFilter)) {
            setRoleFilter('All')
        }
        if (selectedRole !== 'Select Role' && !visiblePillRoles.includes(selectedRole)) {
            setSelectedRole('Select Role')
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [visiblePillRoles])

    // Derive displayed staff based on filters
    const staff = staffList.filter(member => {
        const matchSearch = !searchTerm ||
            member.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            (member.staffId || '').toLowerCase().includes(searchTerm.toLowerCase())

        const matchRole = roleFilter === 'All' || member.role === roleFilter
        const matchSelectedRole = selectedRole === 'Select Role' || member.role === selectedRole
        const matchStatus = selectedStatus === 'Select Status' || member.status.toLowerCase() === selectedStatus.toLowerCase()

        return matchSearch && matchRole && matchSelectedRole && matchStatus
    })

    const [selectedStaff, setSelectedStaff] = useState(null)
    const [editingStaff, setEditingStaff] = useState(null)
    const [showAddModal, setShowAddModal] = useState(false)
    const [showBulkAddModal, setShowBulkAddModal] = useState(false)
    const [confirmationModal, setConfirmationModal] = useState({ show: false, type: null, staffMember: null })
    const [credentialModal, setCredentialModal] = useState({ show: false, name: '', email: '', tempPassword: '' })

    const handleToggleClick = (member, currentState) => {
        if (!canManageMember(member)) { toast.error(ROLE_LOCK_MSG); return }
        const type = currentState ? 'deactivate' : 'activate'
        setConfirmationModal({ show: true, type, staffMember: member })
    }

    const handleConfirmToggle = async () => {
        const { staffMember, type } = confirmationModal
        try {
            if (type === 'delete') {
                const res = await api.delete(`/staff/${staffMember._id}`);
                if (res.data.success) {
                    // Re-pull from React Query so the cache mirrors the
                    // server. Local filter() shortcuts are gone now that
                    // the list is owned by useQuery — anything other
                    // than refetch would let stale rows linger after a
                    // tab switch / browser-back.
                    refetchStaffList();
                    toast.success('Staff member deleted successfully');
                }
            } else {
                const newStatus = type === 'activate' ? 'active' : 'inactive';
                const res = await api.patch(`/staff/${staffMember._id}/status`, { status: newStatus });
                if (res.data.success) {
                    refetchStaffList();
                    toast.success(`Staff ${type === 'activate' ? 'activated' : 'deactivated'} successfully`);
                }
            }
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to update staff member');
        } finally {
            setConfirmationModal({ show: false, type: null, staffMember: null })
            setSelectedStaff(null)
        }
    }

    // Open the confirmation modal in delete mode. The actual delete fires
    // from handleConfirmToggle when the user clicks "Delete" in the modal.
    const handleDeleteClick = (member) => {
        if (!canManageMember(member)) { toast.error(ROLE_LOCK_MSG); return }
        setConfirmationModal({ show: true, type: 'delete', staffMember: member })
    }

    const handleViewStaff = (member) => {
        setSelectedStaff(member)
    }

    const handleEditStaff = (member) => {
        if (!canManageMember(member)) { toast.error(ROLE_LOCK_MSG); return }
        // The list mapper above overwrites `member.role` with a DISPLAY
        // string ("Branch Admin", "Waiter", …) and stashes the raw
        // backend value on `rawRole`. The edit modal echoes the role
        // back on submit, so we MUST hand it the raw enum value here —
        // otherwise PUT /staff/:id sees "Branch Admin" and the backend
        // rejects with "Invalid staff role" because that string isn't
        // in the {admin|manager|chef|waiter|captain} enum.
        setEditingStaff({ ...member, role: member.rawRole || member.role })
        setSelectedStaff(null)
        setShowAddModal(true)
    }

    const handleAddSubmit = async (data) => {
        const payload = {
            name: data.fullName,
            email: data.email,
            mobile: data.phone,
            role: data.role.toLowerCase(),
            staffId: data.employeeId,
            avatar: data.avatarUrl,
            permissions: data.permissions,
            branch: data.branch || '',
            assignedAreas: Array.isArray(data.assignedAreas) ? data.assignedAreas : [],
            assignedTables: Array.isArray(data.assignedTables) ? data.assignedTables : [],
            handlesTakeaway: data.handlesTakeaway === true,
        };

        let res;
        try {
            res = editingStaff
                ? await api.put(`/staff/${editingStaff._id}`, payload)
                : await api.post('/staff', payload);
        } catch (err) {
            console.error('Submit staff error:', err);
            const body = err.response?.data;

            // No response at all — network down, CORS, server not running.
            if (!body) {
                toast.error('Could not reach the server. Check your connection and try again.');
                throw { toastOnly: true };
            }

            // Backend field names → the modal's step-1 error keys.
            const FIELD_MAP = { mobile: 'phone', email: 'email', branch: 'branch', role: 'role' };

            if (['VALIDATION_ERROR', 'DUPLICATE_KEY'].includes(body.code) && FIELD_MAP[body.field]) {
                throw { fieldErrors: { [FIELD_MAP[body.field]]: body.message } };
            }
            if (body.code === 'BRANCH_REQUIRED') {
                throw { fieldErrors: { branch: body.message } };
            }
            if (body.code === 'OWNER_ONLY_ROLE' || body.code === 'ROLE_ADMIN_ONLY') {
                toast.error(body.message);
                throw { fieldErrors: { role: body.message } };
            }
            if (body.code === 'PERMISSIONS_ADMIN_ONLY') {
                toast.error(body.message);
                throw { toastOnly: true };
            }
            if (body.code === 'STAFF_LIMIT_REACHED') {
                toast.error(body.message);
                throw { toastOnly: true };
            }

            // Older plain-message branches in the controller (no `code` yet)
            // — heuristically route to the right field so they still land
            // somewhere useful instead of a bare toast.
            const msg = body.message || 'Failed to save staff member';
            if (/email/i.test(msg)) throw { fieldErrors: { email: msg } };
            if (/branch/i.test(msg)) throw { fieldErrors: { branch: msg } };
            if (/role/i.test(msg)) throw { fieldErrors: { role: msg } };

            toast.error(msg);
            throw { toastOnly: true };
        }

        if (res?.data.success) {
            fetchStaff();
            setShowAddModal(false);

            if (!editingStaff && res.data.tempPassword) {
                setCredentialModal({
                    show: true,
                    name: data.fullName,
                    email: data.email,
                    tempPassword: res.data.tempPassword
                });
            } else {
                toast.success(editingStaff ? 'Staff updated successfully' : 'Staff added successfully');
            }
        }
    };

    // Renders the staff table for a given subset (full list, or one branch's
    // group). Empty subsets show a friendly placeholder row instead of an
    // empty <tbody>.
    const renderStaffTable = (rows, emptyMessage = 'No staff members match the current filters.') => (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-left border-collapse">
                <thead className="bg-[#F8F9FA] text-[12px] text-gray-500 font-[600] border-b border-gray-200">
                    <tr>
                        <th className="px-4 py-4">Sr. No.</th>
                        <th className="px-4 py-4">Staff Member</th>
                        <th className="px-4 py-4">Role</th>
                        <th className="px-4 py-4">Email ID</th>
                        <th className="px-4 py-4">Mobile Number</th>
                        <th className="px-4 py-4">Shift</th>
                        <th className="px-4 py-4">Status</th>
                        <th className="px-4 py-4 text-center">Action</th>
                    </tr>
                </thead>
                <tbody className="text-[14px] text-gray-700">
                    {rows.length === 0 ? (
                        <tr>
                            <td colSpan={8} className="px-4 py-10 text-center text-[13px] text-gray-400 font-medium">
                                {emptyMessage}
                            </td>
                        </tr>
                    ) : rows.map((member, index) => {
                        const isActive = member.status?.toLowerCase() === 'active';
                        const currentStatusDisplay = isActive ? 'Active' : 'Inactive';
                        const statusStyleClass = statusStyles[member.status] || (isActive ? 'text-[#34C759] border-[#34C759] bg-[#34C759]/10' : 'text-[#FF3B30] border-[#FF3B30] bg-[#FF3B30]/10');

                        return (
                            <tr key={member._id || index} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                                <td className="px-4 py-4 font-[600] text-gray-400">
                                    {String(index + 1).padStart(2, '0')}
                                </td>
                                <td className="px-4 py-4">
                                    <div className="flex items-center gap-3">
                                        {resolveAvatar(member.avatar) ? (
                                            <img
                                                src={resolveAvatar(member.avatar)}
                                                alt={member.name}
                                                onError={(e) => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'flex'; }}
                                                className="w-10 h-10 rounded-full object-cover"
                                            />
                                        ) : null}
                                        <div
                                            className="w-10 h-10 rounded-full flex items-center justify-center bg-[#FFF3E6] text-[#FE8301] text-[14px] font-[700] flex-shrink-0"
                                            style={resolveAvatar(member.avatar) ? { display: 'none' } : {}}
                                        >
                                            {(member.name || 'S').split(' ').slice(0, 2).map(w => w[0]?.toUpperCase()).join('')}
                                        </div>
                                        <div>
                                            <p className="font-[600] text-[#1A181B]">{member.name}</p>
                                            {member.staffId && <p className="text-[12px] text-gray-400">{member.staffId}</p>}
                                        </div>
                                    </div>
                                </td>
                                <td className="px-4 py-4">
                                    <span className={`px-3 py-1 rounded-full text-[12px] font-[600] border ${roleStyles[member.role]}`}>
                                        {member.role}
                                    </span>
                                </td>
                                <td className="px-4 py-4 text-gray-500 font-[500]">{member.email}</td>
                                <td className="px-4 py-4 text-gray-500 font-[500]">{member.phone}</td>
                                <td className="px-4 py-4">
                                    <div className="flex flex-col gap-1">
                                        <span className={`font-[600] ${shiftStyles[member.shift]}`}>
                                            {member.shift}
                                        </span>
                                        {/* WAI-029 — dangling-shift badge surfaces a forgotten
                                            clock-out so the admin can spot it without opening
                                            the drawer. Force-close action lives in the drawer. */}
                                        {member.activeShift?.isDangling && (
                                            <span
                                                title={`Active for ${Math.floor(member.activeShift.durationHours)}h — likely a forgotten clock-out`}
                                                className="px-2 py-0.5 rounded-md bg-red-50 text-red-600 border border-red-200 text-[10px] font-bold inline-flex items-center gap-1 self-start"
                                            >
                                                ⚠ Dangling {Math.floor(member.activeShift.durationHours)}h
                                            </span>
                                        )}
                                    </div>
                                </td>
                                <td className="px-4 py-4">
                                    <span className={`px-3 py-1 rounded-full text-[12px] font-[600] border ${statusStyleClass}`}>
                                        {currentStatusDisplay}
                                    </span>
                                </td>
                                <td className="px-4 py-4">
                                    <div className="flex items-center justify-center gap-2">
                                        <button
                                            onClick={() => handleToggleClick(member, isActive)}
                                            disabled={!canManageMember(member)}
                                            title={canManageMember(member) ? undefined : ROLE_LOCK_MSG}
                                            className={`relative w-10 h-6 rounded-full transition-colors ${isActive ? 'bg-[#34C759]' : 'bg-gray-300'} ${canManageMember(member) ? '' : 'opacity-50 cursor-not-allowed'}`}
                                        >
                                            <span
                                                className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${isActive ? 'left-5' : 'left-1'}`}
                                            />
                                        </button>
                                        <button
                                            onClick={() => handleEditStaff(member)}
                                            disabled={!canManageMember(member)}
                                            className={`p-2 rounded-lg transition-colors ${canManageMember(member) ? 'text-gray-400 hover:text-orange-500 hover:bg-orange-50' : 'text-gray-300 cursor-not-allowed'}`}
                                            title={canManageMember(member) ? 'Edit' : ROLE_LOCK_MSG}
                                        >
                                            <Pencil size={24} />
                                        </button>
                                        <button
                                            onClick={() => handleViewStaff(member)}
                                            className="p-2 text-gray-400 hover:text-orange-500 transition-colors rounded-lg hover:bg-orange-50"
                                            title="View Details"
                                        >
                                            <Eye size={24} />
                                        </button>
                                        {(() => {
                                            const isAdmin = (member.rawRole || member.role || '').toLowerCase() === 'admin';
                                            const locked = isAdmin || !canManageMember(member);
                                            return (
                                                <button
                                                    onClick={() => { if (!locked) handleDeleteClick(member); }}
                                                    disabled={locked}
                                                    className={`p-2 rounded-lg transition-colors ${locked
                                                        ? 'text-gray-300 cursor-not-allowed'
                                                        : 'text-gray-400 hover:text-red-600 hover:bg-red-50'
                                                        }`}
                                                    title={isAdmin ? 'Admin accounts cannot be deleted' : locked ? ROLE_LOCK_MSG : 'Delete Staff'}
                                                >
                                                    <Trash2 size={22} />
                                                </button>
                                            );
                                        })()}
                                    </div>
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );

    return (
        <>
            <div className="h-full flex flex-col">
                {/* Header Row */}
                <div className="flex items-center justify-between mb-3">
                    <h1 className="font-manrope font-[700] text-[20px] leading-[26px] text-[#1A181B]">Staff Management</h1>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => setShowBulkAddModal(true)}
                            title="Roster your team in one upload"
                            className="flex items-center gap-2 px-4 py-2.5 bg-white text-[#FE8301] border border-[#FE8301] rounded-xl text-[14px] font-[600] hover:bg-[#FFF3E6] transition-colors"
                        >
                            <Upload size={18} />
                            Bulk Add
                        </button>
                        <button
                            onClick={() => {
                                setEditingStaff(null)
                                setShowAddModal(true)
                            }}
                            className="flex items-center gap-2 px-5 py-2.5 bg-[#FE8301] text-white rounded-xl text-[14px] font-[600] hover:bg-orange-600 transition-colors shadow-sm"
                        >
                            <Plus size={18} />
                            Add Staff
                        </button>
                    </div>
                </div>

                {/* Role Filter Pills — All always shows; per-role pills
                    appear only when at least one staff member with that
                    role exists in the loaded list. */}
                <div className="flex items-center justify-between mb-5">
                    <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
                        {(['All', ...visiblePillRoles]).map((role) => (
                            <button
                                key={role}
                                onClick={() => setRoleFilter(role)}
                                className={`px-5 py-[7px] rounded-full border text-[14px] font-[600] font-manrope transition-all whitespace-nowrap ${roleFilter === role
                                    ? 'bg-white text-[#702083] border-[#702083] border-[1.5px] shadow-[0px_2px_8px_0px_#00000029]'
                                    : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'
                                    }`}
                            >
                                {role}
                            </button>
                        ))}
                    </div>
                    <div className="flex items-center gap-2 ml-4 flex-shrink-0">
                        {canGroup && !showTipSettlement && (
                            <button
                                onClick={() => setGroupByBranch(g => !g)}
                                title={groupByBranch ? 'Switch back to flat list' : 'Group staff by their assigned branch'}
                                className={`flex items-center gap-2 px-5 py-2.5 rounded-full text-[14px] font-[600] font-manrope transition-colors whitespace-nowrap border ${groupByBranch
                                    ? 'bg-[#702083] text-white border-[#702083] shadow-sm'
                                    : 'bg-white text-[#702083] border-[#702083] hover:bg-[#702083]/5'
                                    }`}
                            >
                                <Building2 size={16} />
                                {groupByBranch ? 'Grouped by Branch' : 'Group by Branch'}
                            </button>
                        )}
                        {(roleFilter === 'Waiter' || roleFilter === 'Captain') && (
                            <button
                                onClick={() => setShowTipSettlement(!showTipSettlement)}
                                className={`px-6 py-2.5 rounded-full text-[14px] font-[600] font-manrope transition-colors shadow-sm whitespace-nowrap ${showTipSettlement
                                    ? 'bg-white text-[#702083] border border-[#702083]'
                                    : 'bg-[#702083] text-white hover:bg-[#5a1868]'
                                    }`}
                            >
                                {showTipSettlement ? '← Back to Staff' : 'Tip Settlement'}
                            </button>
                        )}
                    </div>
                </div>
                {/* Tip Settlement View OR normal Search+Table */}
                {showTipSettlement && (roleFilter === 'Waiter' || roleFilter === 'Captain') ? (
                    <TipSettlementView
                        searchTerm={searchTerm}
                        setSearchTerm={setSearchTerm}
                        roleFilter={roleFilter}
                    />
                ) : (
                    <>

                        {/* Search & Filters Row */}
                        <div className="flex flex-wrap items-center gap-3 mb-6 bg-white p-4 rounded-xl border border-gray-100 shadow-sm">
                            <div className="flex-1 relative">
                                <Search size={20} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                                <input
                                    type="text"
                                    placeholder={roleFilter === 'Waiter' ? 'Search by waiter name' : roleFilter === 'Branch Admin' ? 'Search by branch admin name' : roleFilter === 'Manager' ? 'Search by manager name' : roleFilter === 'Chef' ? 'Search by chef name' : roleFilter === 'Captain' ? 'Search by captain name' : 'Search by staff name'}
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className="w-full pl-12 pr-4 py-3 bg-white border border-gray-200 rounded-xl focus:outline-none focus:border-orange-500 font-inter font-medium text-[14px] leading-[20px] focus:ring-2 focus:ring-orange-500/10 transition-all placeholder:text-gray-400"
                                />
                            </div>
                            <button className="w-10 h-10 flex items-center justify-center bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors">
                                <Search size={20} />
                            </button>

                            {/* Role & Status dropdowns — hidden when Waiter is selected */}
                            {roleFilter !== 'Waiter' && (
                                <>
                                    {/* Role Filter */}
                                    <div className="relative" ref={roleDdRef}>
                                        <button
                                            onClick={() => {
                                                setShowRoleDropdown(!showRoleDropdown);
                                                setShowStatusDropdown(false);
                                            }}
                                            className={`flex items-center gap-2 px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm font-medium text-gray-500 font-manrope transition-all min-w-[130px] ${showRoleDropdown ? 'ring-2 ring-orange-100 border-orange-200' : ''}`}
                                        >
                                            {selectedRole}
                                            <ChevronDown size={16} className={`text-gray-400 transition-transform duration-200 ml-auto ${showRoleDropdown ? 'rotate-180' : ''}`} />
                                        </button>
                                        {showRoleDropdown && (
                                            <div className="absolute top-full right-0 mt-2 w-[180px] bg-white rounded-2xl shadow-[0px_4px_20px_0px_rgba(0,0,0,0.08)] border border-gray-100 z-20 animate-in fade-in zoom-in-95 duration-200 overflow-hidden">
                                                {(['Select Role', ...visiblePillRoles]).map((role, index, arr) => (
                                                    <div key={role}>
                                                        <button
                                                            onClick={() => {
                                                                setSelectedRole(role)
                                                                setShowRoleDropdown(false)
                                                            }}
                                                            className={`w-full text-left px-5 py-2.5 text-sm font-medium text-gray-600 font-manrope transition-colors ${selectedRole === role ? 'bg-[#FE8301] !text-white' : 'text-gray-600 hover:bg-[#FE8301] hover:!text-white'}`}
                                                        >
                                                            {role}
                                                        </button>
                                                        {index < arr.length - 1 && <div className="h-[1px] bg-gray-100 mx-4 my-1"></div>}
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>

                                    {/* Status Filter */}
                                    <div className="relative" ref={statusDdRef}>
                                        <button
                                            onClick={() => {
                                                setShowStatusDropdown(!showStatusDropdown);
                                                setShowRoleDropdown(false);
                                            }}
                                            className={`flex items-center gap-2 px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm font-medium text-gray-500 font-manrope transition-all min-w-[130px] ${showStatusDropdown ? 'ring-2 ring-orange-100 border-orange-200' : ''}`}
                                        >
                                            {selectedStatus}
                                            <ChevronDown size={16} className={`text-gray-400 transition-transform duration-200 ml-auto ${showStatusDropdown ? 'rotate-180' : ''}`} />
                                        </button>
                                        {showStatusDropdown && (
                                            <div className="absolute top-full right-0 mt-2 w-[180px] bg-white rounded-2xl shadow-[0px_4px_20px_0px_rgba(0,0,0,0.08)] border border-gray-100 z-20 animate-in fade-in zoom-in-95 duration-200 overflow-hidden">
                                                {['Select Status', 'Active', 'Inactive'].map((status, index) => (
                                                    <div key={status}>
                                                        <button
                                                            onClick={() => {
                                                                setSelectedStatus(status)
                                                                setShowStatusDropdown(false)
                                                            }}
                                                            className={`w-full text-left px-5 py-2.5 text-sm font-medium text-gray-600 font-manrope transition-colors ${selectedStatus === status ? 'bg-[#FE8301] !text-white' : 'text-gray-600 hover:bg-[#FE8301] hover:!text-white'}`}
                                                        >
                                                            {status}
                                                        </button>
                                                        {index < 2 && <div className="h-[1px] bg-gray-100 mx-4 my-1"></div>}
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </>
                            )}
                        </div>

                        {/* Staff Table — flat list OR grouped-by-branch view */}
                        {groupByBranch ? (
                            <div className="flex-1 overflow-y-auto pr-1">
                                <div className="space-y-4 pb-4">
                                    {(() => {
                                        // Identify the "main" branch so the tenant owner admin
                                        // (who stays branch:null by design — see
                                        // utils/createMainBranch.js — so they retain cross-branch
                                        // access) still appears somewhere intuitive instead of
                                        // a bare "Unassigned" bucket. Prefer slug='main';
                                        // fall back to the first active branch.
                                        const mainBranch = activeBranches.find(b => b.slug === 'main') || activeBranches[0];
                                        return activeBranches.map(b => {
                                            const isMain = mainBranch && b._id === mainBranch._id;
                                            // Pinned staff for this branch.
                                            let branchStaff = staff.filter(m => m.branch?._id === b._id);
                                            // Surface tenant-level admins AND tenant-level
                                            // managers under the Main branch. Their DB row
                                            // keeps branch:null so every controller that uses
                                            // pinnedBranchId() still treats them as cross-
                                            // branch operators — this is a UI-only grouping
                                            // so the admin doesn't see the tenant owner /
                                            // tenant-wide manager fall into "Unassigned" when
                                            // they're actually the people running Main.
                                            if (isMain) {
                                                const tenantOperators = staff.filter(m =>
                                                    !m.branch && (m.rawRole === 'admin' || m.rawRole === 'manager')
                                                );
                                                branchStaff = [...branchStaff, ...tenantOperators];
                                            }
                                            const isCollapsed = !!collapsedGroups[b._id];
                                            return (
                                                <BranchGroupSection
                                                    key={b._id}
                                                    title={b.name}
                                                    subtitle={[b.city, b.slug].filter(Boolean).join(' · ')}
                                                    avatarChar={(b.name || 'B')[0].toUpperCase()}
                                                    accent="orange"
                                                    count={branchStaff.length}
                                                    collapsed={isCollapsed}
                                                    onToggle={() => setCollapsedGroups(prev => ({ ...prev, [b._id]: !prev[b._id] }))}
                                                >
                                                    {renderStaffTable(branchStaff, 'No staff assigned to this branch yet.')}
                                                </BranchGroupSection>
                                            );
                                        });
                                    })()}
                                    {(() => {
                                        // Unassigned bucket = unpinned waiter / captain / chef —
                                        // a bug state that addStaff validation prevents going
                                        // forward (those roles MUST be pinned). Tenant-level
                                        // admins and managers are intentionally unpinned and
                                        // now render under Main above, so exclude both from
                                        // this bucket to avoid double-counting.
                                        const unassigned = staff.filter(m =>
                                            !m.branch && m.rawRole !== 'admin' && m.rawRole !== 'manager'
                                        );
                                        if (unassigned.length === 0) return null;
                                        const isCollapsed = !!collapsedGroups['__unassigned'];
                                        return (
                                            <BranchGroupSection
                                                title="Unassigned"
                                                subtitle="Tenant-level staff · visible across every branch"
                                                accent="slate"
                                                count={unassigned.length}
                                                collapsed={isCollapsed}
                                                onToggle={() => setCollapsedGroups(prev => ({ ...prev, __unassigned: !prev.__unassigned }))}
                                            >
                                                {renderStaffTable(unassigned)}
                                            </BranchGroupSection>
                                        );
                                    })()}
                                </div>
                            </div>
                        ) : (
                            <div className="flex-1 overflow-hidden">
                                {renderStaffTable(staff)}
                            </div>
                        )}

                    </>
                )}

                {/* Staff Profile Drawer */}
                {selectedStaff && (
                    <StaffProfileDrawer
                        staff={selectedStaff}
                        isActive={selectedStaff.status?.toLowerCase() === 'active'}
                        onClose={() => setSelectedStaff(null)}
                        onEdit={() => handleEditStaff(selectedStaff)}
                        onToggleStatus={(type) => handleToggleClick(selectedStaff, type === 'deactivate')}
                        onDelete={() => handleDeleteClick(selectedStaff)}
                        canManage={canManageMember(selectedStaff)}
                    />
                )}

                {/* Add Staff Modal */}
                {showAddModal && (
                    <AddStaffModal
                        editData={editingStaff}
                        onClose={() => setShowAddModal(false)}
                        onSubmit={handleAddSubmit}
                    />
                )}

                {/* Bulk Add Staff Modal */}
                {showBulkAddModal && (
                    <BulkAddStaffModal
                        onClose={() => setShowBulkAddModal(false)}
                        onSuccess={fetchStaff}
                    />
                )}

                {/* Staff Confirmation Modal */}
                {confirmationModal.show && (
                    <StaffConfirmationModal
                        type={confirmationModal.type}
                        staffName={confirmationModal.staffMember?.name}
                        onClose={() => setConfirmationModal({ show: false, type: null, staffMember: null })}
                        onConfirm={handleConfirmToggle}
                    />
                )}

                {/* Staff Credential Modal — shown once after new staff creation */}
                {credentialModal.show && (
                    <StaffCredentialModal
                        staffName={credentialModal.name}
                        email={credentialModal.email}
                        tempPassword={credentialModal.tempPassword}
                        onClose={() => {
                            setCredentialModal({ show: false, name: '', email: '', tempPassword: '' });
                            toast.success('Staff added successfully');
                        }}
                    />
                )}
            </div>
        </>
    )
}

export default StaffDashboard
