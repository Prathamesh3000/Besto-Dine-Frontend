import React from 'react'
import { Clock, Users } from 'lucide-react'
import { backendOrigin } from '../../../utils/apiOrigin';

const roleStyles = {
    manager: 'bg-[#AD09D4]/10 text-[#AD09D4] border-[#AD09D4]/30',
    chef:    'bg-[#FE8301]/10 text-[#FE8301] border-[#FE8301]/30',
    waiter:  'bg-[#007AFF]/10 text-[#007AFF] border-[#007AFF]/30',
    captain: 'bg-[#007AFF]/10 text-[#007AFF] border-[#007AFF]/30',
    admin:   'bg-gray-100 text-gray-700 border-gray-300',
}

const StaffOnShiftWidget = ({ staff = [] }) => {
    if (staff.length === 0) {
        return (
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-[16px] font-semibold text-gray-900">Staff On Shift</h3>
                    <span className="text-[12px] text-gray-400">0 active</span>
                </div>
                <div className="flex flex-col items-center justify-center py-8 text-gray-400">
                    <Users size={32} strokeWidth={1.5} />
                    <p className="text-[13px] mt-2">No staff on shift right now</p>
                </div>
            </div>
        )
    }

    return (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
            <div className="flex items-center justify-between mb-4">
                <h3 className="text-[16px] font-semibold text-gray-900">Staff On Shift</h3>
                <span className="text-[12px] font-medium text-green-600 bg-green-50 px-2 py-0.5 rounded-full">
                    {staff.length} active
                </span>
            </div>
            <div className="space-y-3 max-h-[280px] overflow-y-auto custom-scrollbar">
                {staff.map((s) => {
                    const BACKEND_URL = backendOrigin()
                    const avatarUrl = s.avatar
                        ? (s.avatar.startsWith('/uploads/') ? `${BACKEND_URL}${s.avatar}` : s.avatar)
                        : `https://ui-avatars.com/api/?name=${encodeURIComponent(s.name || 'S')}&background=FE8301&color=fff&size=32`

                    return (
                        <div key={s._id} className="flex items-center gap-3 py-2 border-b border-gray-50 last:border-0">
                            <img
                                src={avatarUrl}
                                alt={s.name}
                                className="w-8 h-8 rounded-full object-cover flex-shrink-0"
                                onError={(e) => {
                                    e.target.onerror = null
                                    e.target.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(s.name || 'S')}&background=FE8301&color=fff&size=32`
                                }}
                            />
                            <div className="flex-1 min-w-0">
                                <p className="text-[13px] font-semibold text-gray-900 truncate">{s.name}</p>
                                <div className="flex items-center gap-1.5 mt-0.5">
                                    <span className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-[1px] rounded border ${roleStyles[s.role] || roleStyles.admin}`}>
                                        {s.role}
                                    </span>
                                    {s.staffId && (
                                        <span className="text-[10px] text-gray-400">{s.staffId}</span>
                                    )}
                                </div>
                            </div>
                            <div className="text-right flex-shrink-0">
                                <div className="flex items-center gap-1 text-[12px] text-gray-500">
                                    <Clock size={12} />
                                    <span>{s.hoursElapsed?.toFixed(1) || '0.0'}h</span>
                                </div>
                                {s.clockIn && (
                                    <p className="text-[10px] text-gray-400 mt-0.5">
                                        In: {new Date(s.clockIn).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                                    </p>
                                )}
                            </div>
                        </div>
                    )
                })}
            </div>
        </div>
    )
}

export default StaffOnShiftWidget
