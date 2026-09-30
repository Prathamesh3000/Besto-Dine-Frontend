import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell } from 'lucide-react';
import { useNotifications } from '../../Context/NotificationContext';

// Header notification bell for the waiter / captain flow. Shows the live
// unread count from NotificationContext and routes to the notifications
// screen. Sits in the header action cluster next to StaffProfileMenu so the
// floor staff get the same quick-glance unread badge the admin topbar has.
const NotificationBell = ({ onDark = false }) => {
    const navigate = useNavigate();
    const { unreadCount } = useNotifications();

    return (
        <button
            type="button"
            onClick={() => navigate('/waiter/notifications')}
            aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications'}
            className={`relative w-10 h-10 sm:w-11 sm:h-11 rounded-full active:scale-95 flex items-center justify-center transition shrink-0 ${onDark
                ? 'bg-white/15 hover:bg-white/25 text-white backdrop-blur-sm'
                : 'bg-gray-50 hover:bg-gray-100 text-gray-600 hover:text-gray-900'}`}
        >
            <Bell size={20} strokeWidth={2} />
            {unreadCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-[#FF3B30] text-white text-[10px] font-black tabular-nums border-2 border-white">
                    {unreadCount > 99 ? '99+' : unreadCount}
                </span>
            )}
        </button>
    );
};

export default NotificationBell;
