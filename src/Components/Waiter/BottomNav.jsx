import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Bell, HandPlatter, LayoutGrid } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { waiterAPI } from '../../utils/api';
import useSocketEvent from '../../hooks/useSocketEvent';
import { useAuth } from '../../Context/AuthContext';
import { getWaiterScope, inWaiterScope } from '../../utils/waiterScope';

const BottomNav = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const { user, hasPermission } = useAuth();
    const [pendingRequests, setPendingRequests] = useState(0);
    const [readyOrders, setReadyOrders] = useState(0);

    // CAP-010 — scope the badge counts to the waiter's assigned areas/
    // tables so a waiter pinned to one floor isn't counted for orders /
    // requests they can't see. Matches the Orders + Requests tab lists.
    const scope = useMemo(() => getWaiterScope(user), [user]);

    const refreshOrderCount = useCallback(async () => {
        try {
            const res = await waiterAPI.getLiveOrders();
            if (res.data?.success) {
                setReadyOrders((res.data.orders || []).filter(o => o.status === 'ready' && inWaiterScope(scope, o)).length);
            }
        } catch { /* keep last value on transient failure */ }
    }, [scope]);

    const refreshAllCounts = useCallback(async () => {
        try {
            const [reqRes, ordRes] = await Promise.all([
                waiterAPI.getRequests({ status: 'pending' }),
                waiterAPI.getLiveOrders(),
            ]);
            if (reqRes.data?.success) {
                setPendingRequests((reqRes.data.requests || []).filter(r => inWaiterScope(scope, r)).length);
            }
            if (ordRes.data?.success) {
                setReadyOrders((ordRes.data.orders || []).filter(o => o.status === 'ready' && inWaiterScope(scope, o)).length);
            }
        } catch { /* badges stay at last known value */ }
    }, [scope]);

    useEffect(() => {
        refreshAllCounts();
        // Fallback polling every 60s — Socket.io handles instant updates
        const interval = setInterval(refreshAllCounts, 60000);
        return () => clearInterval(interval);
    }, [refreshAllCounts]);

    // Real-time: re-fetch badge counts on order/request events. Every
    // status transition the chef or waiter triggers shifts these
    // counters, so the badges should be live — not waiting on the 60 s
    // poll. `order:appended` covers customer-added items to active
    // orders (auto-append flow), and `request:*` keeps the bell badge
    // live when a customer raises a water/waiter/bill request.
    useSocketEvent('order:new', refreshAllCounts);
    useSocketEvent('order:ready', refreshOrderCount);
    useSocketEvent('order:updated', refreshOrderCount);
    useSocketEvent('order:cancelled', refreshOrderCount);
    useSocketEvent('order:appended', refreshOrderCount);
    useSocketEvent('request:new', refreshAllCounts);
    useSocketEvent('request:updated', refreshAllCounts);

    const allTabs = [
        {
            id: 'tables',
            path: '/waiter/home',
            icon: <LayoutGrid size={26} />,
            label: 'Tables',
            badge: null,
            permission: 'tables'
        },
        {
            id: 'requests',
            path: '/waiter/requests',
            icon: <Bell size={26} />,
            label: 'Requests',
            badge: pendingRequests > 0 ? pendingRequests : null,
            permission: null  // always visible for staff
        },
        {
            id: 'orders',
            path: '/waiter/orders',
            icon: <HandPlatter size={26} />,
            label: 'Orders',
            badge: readyOrders > 0 ? readyOrders : null,
            permission: 'addOrders'
        },
    ];

    const tabs = allTabs.filter(tab => !tab.permission || hasPermission(tab.permission));

    const getActiveTab = () => {
        const path = location.pathname;
        if (path === '/waiter/home') return 'tables';
        if (path === '/waiter/requests') return 'requests';
        if (path === '/waiter/orders') return 'orders';
        return 'tables';
    };

    const activeTab = getActiveTab();

    return (
        <div className="fixed bottom-0 left-0 right-0 z-40">
            <nav className="bg-white shadow-[0_-4px_20px_rgba(0,0,0,0.03)] border border-gray-50/50 p-[8px]">
                <div className="flex justify-around items-center">
                    {tabs.map((tab) => {
                        const isActive = activeTab === tab.id;
                        return (
                            <button
                                key={tab.id}
                                onClick={() => navigate(tab.path)}
                                className={`relative flex items-center justify-center transition-all duration-400 ease-out ${isActive
                                    ? 'bg-[#FFF3E6] px-[24px] py-[7px] rounded-[16px] flex-1 translate-y-0'
                                    : 'px-[24px] py-[7px] flex-1 flex flex-col items-center'
                                    }`}
                            >
                                <div className="flex flex-col items-center gap-1">
                                    <div className="relative">
                                        <div className={`${isActive ? 'text-[#FF7A00]' : 'text-[#8E8E93]'}`}>
                                            {tab.icon}
                                        </div>

                                        {/* Badge */}
                                        {tab.badge && (
                                            <div className={`absolute -top-1.5 -right-3 w-5 h-5 ${isActive ? 'bg-[#FF3B30] text-white' : 'bg-[#DDDDDD] text-[#333333]'} text-[10px] font-black rounded-full flex items-center justify-center border-2 border-white`}>
                                                {tab.badge}
                                            </div>
                                        )}
                                    </div>

                                    <span className={`text-[11px] font-bold tracking-tight ${isActive ? 'text-[#FF7A00]' : 'text-[#8E8E93]'
                                        }`}>
                                        {tab.label}
                                    </span>
                                </div>
                            </button>
                        );
                    })}
                </div>
            </nav>
        </div>
    );
};

export default BottomNav;
