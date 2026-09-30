import React, { useState, useEffect } from 'react'
import { X, Check, Pencil, Ban, KeyRound, Copy, Trash2, Clock, ChevronRight } from 'lucide-react'
import StaffPerformanceModal from './StaffPerformanceModal'
import { toast } from 'react-hot-toast'
import api from '../../../utils/api'

const BACKEND_URL = import.meta.env.VITE_API_URL.replace(/\/api.*$/, '');
const resolveAvatar = (url, name) => {
    if (!url) return `https://ui-avatars.com/api/?name=${encodeURIComponent(name || 'Staff')}&background=random`;
    if (url.startsWith('/uploads/')) return `${BACKEND_URL}${url}`;
    return url;
};

// `canManage` = false hides edit / status / reset-password / delete — a
// Manager viewing a Manager or Admin row (backend returns ROLE_ADMIN_ONLY).
const StaffProfileDrawer = ({ staff, isActive, onClose, onEdit, onToggleStatus, onDelete, canManage = true }) => {
    const [showPerformance, setShowPerformance] = useState(false)
    const [resettingPassword, setResettingPassword] = useState(false)
    const [resetResult, setResetResult] = useState(null) // { tempPassword }

    // ADM-070 — Shift history state. Lazily fetched when the section is
    // expanded so opening the drawer doesn't pay the round-trip every
    // time. `expanded` defaults to true on first open so admins land
    // on the rows the test case expects without an extra click.
    const [shiftsExpanded, setShiftsExpanded] = useState(true)
    const [shiftsLoading, setShiftsLoading] = useState(false)
    const [shiftRows, setShiftRows] = useState(null) // null = not loaded; [] = loaded but empty
    const [shiftStats, setShiftStats] = useState({ totalShifts: 0, totalHours: 0 })
    const [showAllShifts, setShowAllShifts] = useState(false)

    useEffect(() => {
        // Reset per-staff state when the drawer flips to a different member,
        // otherwise the history briefly shows the previous staff's rows.
        setShiftRows(null)
        setShiftStats({ totalShifts: 0, totalHours: 0 })
        setShowAllShifts(false)
        setShiftsExpanded(true)
    }, [staff?._id])

    useEffect(() => {
        if (!staff?._id || !shiftsExpanded || shiftRows !== null) return
        let cancelled = false
        setShiftsLoading(true)
        api.get(`/shifts/staff/${staff._id}`, { params: { limit: 30 } })
            .then((res) => {
                if (cancelled) return
                setShiftRows(res.data?.shifts || [])
                setShiftStats({
                    totalShifts: res.data?.stats?.totalShifts || 0,
                    totalHours: res.data?.stats?.totalHours || 0,
                })
            })
            .catch(() => { if (!cancelled) setShiftRows([]) })
            .finally(() => { if (!cancelled) setShiftsLoading(false) })
        return () => { cancelled = true }
    }, [staff?._id, shiftsExpanded, shiftRows])

    if (!staff) return null

    const roleStyles = {
        'Branch Admin': 'bg-[#0E7C86]/10 text-[#0E7C86] border-[#0E7C86] border-[0.5px]',
        'Chef': 'bg-[#FE8301]/10 text-[#FE8301] border-[#FE8301] border-[0.5px]',
        'Waiter': 'bg-[#007AFF]/10 text-[#007AFF] border-[#007AFF] border-[0.5px]',
        'Captain': 'bg-[#22C55E]/10 text-[#22C55E] border-[#22C55E] border-[0.5px]',
        'Admin': 'bg-gray-100 text-gray-800 border-gray-300 border-[0.5px]',
    }

    // Role comes pre-formatted from fetchStaff (e.g. "Manager", "Branch Admin")
    const roleKey = staff.role || 'Waiter'
    const staffPerms = staff.permissions || {}

    // Map display names → backend camelCase keys
    const permKeyMap = {
        'Tables': 'tables',
        'Add Orders': 'addOrders',
        'Update Order Status': 'updateOrderStatus',
        'View Payments': 'viewPayments',
        'Refund': 'refund',
        'Reservation': 'reservation',
        'Edit Menu': 'editMenu',
        'CRM': 'crm',
        'Access Kitchen': 'accessKitchen',
        'Manage Staff': 'manageStaff',
    }

    // Show the ACTUAL stored permission for each key. No fallback to
    // role defaults — that was the source of "I disabled it but it still
    // shows enabled". A missing key is rendered as disabled (false),
    // which matches what the backend's `checkPermission` middleware
    // actually enforces.
    //
    // Admins are a special case: the backend bypasses every permission
    // check for them, so it's accurate to display all permissions as
    // enabled regardless of what's stored.
    const isAdminRole = roleKey.toLowerCase() === 'admin'
    const permissionNames = Object.keys(permKeyMap)
    const permissions = permissionNames.map(name => {
        const key = permKeyMap[name]
        const enabled = isAdminRole ? true : (staffPerms[key] === true)
        return { name, enabled }
    })

    const leftPermissions = permissions.slice(0, 5)
    const rightPermissions = permissions.slice(5)

    const isWaiter = roleKey === 'Waiter'
    const isChef = roleKey === 'Chef'
    const isCaptain = roleKey === 'Captain'

    return (
        <>
            {/* Overlay */}
            <div className="fixed inset-0 bg-black/40 z-40" onClick={onClose} />

            {/* Drawer */}
            <div className="fixed right-0 top-0 h-full w-full max-w-[460px] bg-white shadow-xl z-50 flex flex-col overflow-y-auto animate-in slide-in-from-right duration-200">
                {/* Header */}
                <div className="sticky top-0 bg-[#FFF5F0] px-6 py-5 border-b border-gray-100 flex items-center justify-between z-10">
                    <h2 className="text-[20px] font-[700] font-manrope text-[#1A181B]">Staff Profile</h2>
                    <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600 transition-colors">
                        <X size={24} />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 p-6 space-y-6">
                    {/* Profile Card */}
                    <div className="flex items-start gap-4">
                        <div className="relative">
                            <img
                                src={resolveAvatar(staff.avatar, staff.name)}
                                alt={staff.name}
                                onError={(e) => { e.target.onerror = null; e.target.src = resolveAvatar(null, staff.name); }}
                                className="w-20 h-20 rounded-2xl object-cover"
                            />
                            <span className={`absolute bottom-0 right-0 w-4 h-4 rounded-full border-2 border-white ${isActive ? 'bg-[#34C759]' : 'bg-gray-400'}`} />
                        </div>
                        <div className="flex-1">
                            <h3 className="text-[18px] font-[700] font-manrope text-[#1A181B]">{staff.name}</h3>
                            <p className="text-[14px] text-gray-400 mt-0.5">{staff.id || staff.staffId}</p>

                            {isChef && staff.kitchenResponsibility && (
                                <p className="text-[14px] text-gray-500 mt-1">
                                    Kitchen: <span className="font-[600] text-[#1A181B]">{staff.kitchenResponsibility}</span>
                                </p>
                            )}

                            <span className={`inline-block mt-2 px-3 py-1 rounded-full text-[12px] font-[600] border ${roleStyles[roleKey] || roleStyles['Waiter']}`}>
                                {roleKey}
                            </span>
                        </div>
                    </div>

                    {/* Login ID & Contact */}
                    <div className="flex gap-4">
                        <div className="flex-1 bg-[#F8F9FA] rounded-xl p-4">
                            <p className="text-[12px] text-gray-400 mb-1">Login Email</p>
                            <p className="text-[14px] font-[600] text-[#1A181B] break-all">{staff.email || '—'}</p>
                        </div>
                        <div className="flex-1 bg-[#F8F9FA] rounded-xl p-4">
                            <p className="text-[12px] text-gray-400 mb-1">Contact Number</p>
                            <p className="text-[14px] font-[600] text-[#1A181B]">{staff.phone || staff.mobile || '—'}</p>
                        </div>
                    </div>

                    {/* Status */}
                    <div className="bg-[#F8F9FA] rounded-xl p-4 flex items-center justify-between">
                        <p className="text-[14px] font-[500] text-gray-600">Status</p>
                        <span className={`px-3 py-1 rounded-full text-[12px] font-[600] ${isActive ? 'bg-[#E8FFF0] text-[#34C759] border border-[#34C759]' : 'bg-[#FFF3E6] text-[#FE8301] border border-[#FE8301]'}`}>
                            {isActive ? 'Active' : 'Inactive'}
                        </span>
                    </div>

                    {/* Permissions Overview */}
                    <div>
                        <h4 className="text-[16px] font-[700] font-manrope text-[#1A181B] mb-4">Permissions Overview</h4>
                        <div className="border border-gray-200 rounded-xl p-4">
                            <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-3">
                                    {leftPermissions.map((perm, index) => (
                                        <div key={index} className={`flex items-center justify-between px-4 py-3 rounded-xl ${perm.enabled ? 'bg-[#EBFFEC]' : 'bg-[#F9FAFB]'}`}>
                                            <span className={`text-[14px] font-[500] ${perm.enabled ? 'text-[#1A181B]' : 'text-gray-500'}`}>{perm.name}</span>
                                            {perm.enabled ? <Check size={18} className="text-[#34C759]" /> : <X size={18} className="text-gray-400" />}
                                        </div>
                                    ))}
                                </div>
                                <div className="space-y-3">
                                    {rightPermissions.map((perm, index) => (
                                        <div key={index} className={`flex items-center justify-between px-4 py-3 rounded-xl ${perm.enabled ? 'bg-[#EBFFEC]' : 'bg-[#F9FAFB]'}`}>
                                            <span className={`text-[14px] font-[500] ${perm.enabled ? 'text-[#1A181B]' : 'text-gray-500'}`}>{perm.name}</span>
                                            {perm.enabled ? <Check size={18} className="text-[#34C759]" /> : <X size={18} className="text-gray-400" />}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* ADM-070 — Shift History */}
                    <div>
                        <button
                            type="button"
                            onClick={() => setShiftsExpanded(v => !v)}
                            className="w-full flex items-center justify-between mb-3"
                        >
                            <h4 className="text-[16px] font-[700] font-manrope text-[#1A181B]">Shift History</h4>
                            <span className="flex items-center gap-2 text-[12px] text-gray-500 font-manrope">
                                {shiftStats.totalShifts > 0 && (
                                    <span>{shiftStats.totalShifts} shifts · {shiftStats.totalHours.toFixed(1)}h</span>
                                )}
                                <ChevronRight size={16} className={`transition-transform ${shiftsExpanded ? 'rotate-90' : ''}`} />
                            </span>
                        </button>
                        {shiftsExpanded && (
                            <div className="border border-gray-200 rounded-xl overflow-hidden">
                                {shiftsLoading ? (
                                    <div className="py-8 text-center text-[13px] text-gray-400 font-manrope">Loading shift history…</div>
                                ) : !shiftRows || shiftRows.length === 0 ? (
                                    <div className="py-8 text-center text-[13px] text-gray-400 font-manrope flex flex-col items-center gap-2">
                                        <Clock size={20} className="text-gray-300" />
                                        No shifts recorded yet
                                    </div>
                                ) : (
                                    <>
                                        <div className="grid grid-cols-12 px-4 py-2 bg-[#F8F9FA] text-[11px] font-[600] text-gray-500 uppercase tracking-wide">
                                            <div className="col-span-4">Date</div>
                                            <div className="col-span-3">Clock In</div>
                                            <div className="col-span-3">Clock Out</div>
                                            <div className="col-span-2 text-right">Hours</div>
                                        </div>
                                        <div className="divide-y divide-gray-100">
                                            {(showAllShifts ? shiftRows : shiftRows.slice(0, 5)).map((s) => (
                                                <div key={s._id} className="grid grid-cols-12 px-4 py-3 text-[13px] font-manrope">
                                                    <div className="col-span-4 text-[#1A181B] font-[600]">{s.date}</div>
                                                    <div className="col-span-3 text-gray-700 tabular-nums">{s.inTime}</div>
                                                    <div className="col-span-3 text-gray-700 tabular-nums">
                                                        {s.outTime || (
                                                            <span className="inline-flex items-center gap-1 text-[11px] font-[600] text-[#34C759]">
                                                                <span className="w-1.5 h-1.5 rounded-full bg-[#34C759] animate-pulse" />
                                                                Active
                                                            </span>
                                                        )}
                                                    </div>
                                                    <div className="col-span-2 text-right text-[#1A181B] font-[600] tabular-nums">
                                                        {(Number(s.totalHours) || 0).toFixed(1)}h
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                        {shiftRows.length > 5 && (
                                            <button
                                                onClick={() => setShowAllShifts(v => !v)}
                                                className="w-full py-2.5 text-[12px] font-[600] text-[#FE8301] hover:bg-orange-50 border-t border-gray-100 transition-colors"
                                            >
                                                {showAllShifts ? 'Show fewer' : `Show all ${shiftRows.length} shifts`}
                                            </button>
                                        )}
                                    </>
                                )}
                            </div>
                        )}
                    </div>
                </div>

                {/* Footer Actions */}
                <div className="sticky bottom-0 bg-white p-6 border-t border-gray-100 space-y-3">
                    {!canManage && (
                        <p className="text-[13px] font-[500] text-gray-500 text-center">
                            Only an Admin can manage Manager or Admin accounts.
                        </p>
                    )}
                    {canManage && (<>
                    <div className="flex gap-3">
                        <button onClick={onEdit} className="flex-1 flex items-center justify-center gap-2 px-6 py-3 border border-[#FE8301] text-[#FE8301] rounded-xl text-[14px] font-[600] hover:bg-orange-50 transition-colors">
                            <Pencil size={18} /> Edit
                        </button>
                        <button onClick={() => onToggleStatus(isActive ? 'deactivate' : 'activate')} className="flex-1 flex items-center justify-center gap-2 px-6 py-3 border border-[#FE8301] text-[#FE8301] rounded-xl text-[14px] font-[600] hover:bg-orange-50 transition-colors">
                            {isActive ? <Ban size={18} /> : <Check size={18} />}
                            {isActive ? 'Deactivate' : 'Activate'}
                        </button>
                    </div>

                    {/* Reset Password */}
                    {resetResult ? (
                        <div className="bg-[#FFF8E1] border border-[#FFE082] rounded-xl p-4 space-y-2">
                            <p className="text-[12px] font-[500] font-manrope text-[#F57C00]">
                                New temporary password (shown once):
                            </p>
                            <div className="flex items-center gap-2 bg-white rounded-lg px-3 py-2 border border-gray-200">
                                <code className="flex-1 text-[14px] font-[700] font-mono text-[#1A181B] tracking-wide break-all">
                                    {resetResult.tempPassword}
                                </code>
                                <button
                                    onClick={async () => {
                                        await navigator.clipboard.writeText(resetResult.tempPassword)
                                        toast.success('Password copied')
                                    }}
                                    className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors flex-shrink-0"
                                >
                                    <Copy size={14} className="text-gray-400" />
                                </button>
                            </div>
                        </div>
                    ) : (
                        <button
                            onClick={async () => {
                                if (resettingPassword) return
                                setResettingPassword(true)
                                try {
                                    const res = await api.post(`/staff/${staff._id}/reset-password`)
                                    if (res.data.success) {
                                        setResetResult({ tempPassword: res.data.tempPassword })
                                        toast.success('Password reset successfully')
                                    }
                                } catch (err) {
                                    toast.error(err.response?.data?.message || 'Failed to reset password')
                                } finally {
                                    setResettingPassword(false)
                                }
                            }}
                            disabled={resettingPassword}
                            className="w-full flex items-center justify-center gap-2 px-6 py-3 border border-[#FE8301] text-[#FE8301] rounded-xl text-[14px] font-[600] hover:bg-orange-50 transition-colors disabled:opacity-50"
                        >
                            <KeyRound size={18} />
                            {resettingPassword ? 'Resetting...' : 'Reset Password'}
                        </button>
                    )}
                    </>)}

                    {(isWaiter || isChef || isCaptain) && (
                        <button onClick={() => setShowPerformance(true)} className="w-full flex items-center justify-center gap-2 px-6 py-3 border border-[#FE8301] text-[#FE8301] rounded-xl text-[14px] font-[600] hover:bg-orange-50 transition-colors">
                            View Performance
                        </button>
                    )}

                    {/* Delete — destructive action, kept at the bottom and
                         visually distinct so it can't be confused with the
                         deactivate button above. Hidden if the parent
                         didn't pass an onDelete handler. */}
                    {onDelete && canManage && (
                        <button
                            onClick={onDelete}
                            className="w-full flex items-center justify-center gap-2 px-6 py-3 border border-red-200 text-red-600 rounded-xl text-[14px] font-[600] hover:bg-red-50 transition-colors"
                        >
                            <Trash2 size={18} />
                            Delete Staff
                        </button>
                    )}
                </div>
            </div>

            {showPerformance && (
                <StaffPerformanceModal staff={staff} onClose={() => setShowPerformance(false)} />
            )}
        </>
    )
}

export default StaffProfileDrawer
