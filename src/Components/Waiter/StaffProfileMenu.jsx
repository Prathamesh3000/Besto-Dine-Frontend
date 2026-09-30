import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { UserCircle, LogOut } from 'lucide-react';
import { useAuth } from '../../Context/AuthContext';
import { resolveImageUrl } from '../../utils/image';

// Staff (waiter / captain) profile chip for page headers — mirrors the
// admin topbar avatar+dropdown (AdminLayout) so the floor app feels
// consistent with the admin panel. Drops into any waiter/captain header.
//
// Avatar: user.avatar if set, else a ui-avatars.com letter-avatar on the
// brand orange (same fallback the admin header uses). Dropdown shows
// name / email / role·branch, a "My Profile" link, and Logout.
const StaffProfileMenu = ({ onDark = false }) => {
    const navigate = useNavigate();
    const { user, logout } = useAuth();
    const [open, setOpen] = useState(false);
    const ref = useRef(null);

    const name = user?.name || 'Staff';
    const fallbackAvatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=FE8301&color=fff`;
    const avatar = resolveImageUrl(user?.avatar) || fallbackAvatar;
    const roleLabel = user?.role || 'Staff';
    const branchName = user?.branch?.name || '';

    // Close on outside click — same pattern as AdminLayout's profile menu.
    useEffect(() => {
        if (!open) return;
        const handler = (e) => {
            if (ref.current && !ref.current.contains(e.target)) setOpen(false);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [open]);

    const handleLogout = () => {
        logout();
        navigate('/staff-login');
    };

    return (
        <div className="relative shrink-0" ref={ref}>
            <button
                type="button"
                onClick={() => setOpen(o => !o)}
                aria-label="Profile menu"
                aria-expanded={open}
                className={`w-10 h-10 sm:w-11 sm:h-11 rounded-full overflow-hidden active:scale-95 transition-all ${onDark
                    ? 'ring-2 ring-white/70 hover:ring-white'
                    : 'border border-gray-200 hover:ring-2 hover:ring-[#FE8301]/30'}`}
            >
                <img
                    src={avatar}
                    alt={name}
                    className="w-full h-full object-cover"
                    onError={(e) => { e.target.onerror = null; e.target.src = fallbackAvatar; }}
                />
            </button>

            {open && (
                <div className="absolute right-0 top-[calc(100%+8px)] w-[220px] bg-white border border-gray-100 rounded-2xl shadow-xl py-2 z-50 animate-in fade-in slide-in-from-top-2 duration-150">
                    <div className="px-4 py-2.5 border-b border-gray-100">
                        <p className="text-sm font-bold text-[#1A181B] truncate capitalize">{name}</p>
                        {user?.email && <p className="text-xs text-gray-500 truncate">{user.email}</p>}
                        <p className="text-[11px] font-semibold text-[#FE8301] mt-0.5 capitalize truncate">
                            {roleLabel}{branchName ? ` · ${branchName}` : ''}
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={() => { setOpen(false); navigate('/waiter/profile'); }}
                        className="w-full text-left px-4 py-2.5 text-[13px] font-semibold text-[#1A181B] hover:bg-gray-50 transition-colors flex items-center gap-2.5"
                    >
                        <UserCircle size={16} strokeWidth={2} className="text-gray-500" />
                        My Profile
                    </button>
                    <button
                        type="button"
                        onClick={handleLogout}
                        className="w-full text-left px-4 py-2.5 text-[13px] font-semibold text-[#DC2626] hover:bg-red-50 transition-colors flex items-center gap-2.5"
                    >
                        <LogOut size={16} strokeWidth={2} />
                        Logout
                    </button>
                </div>
            )}
        </div>
    );
};

export default StaffProfileMenu;
