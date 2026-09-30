import React, { useState, useEffect, useMemo } from 'react';
import { Menu, Bell, Check, CircleCheck, Clock3, GlassWater, BellRing, Loader2, Receipt, HelpCircle } from 'lucide-react';
import Sidebar from '../../Components/Waiter/Sidebar';
import BottomNav from '../../Components/Waiter/BottomNav';
import WaiterEmptyState from '../../Components/Waiter/WaiterEmptyState';
import StaffProfileMenu from '../../Components/Waiter/StaffProfileMenu';
import NotificationBell from '../../Components/Waiter/NotificationBell';
import { waiterAPI, settingsAPI } from '../../utils/api';
import { useAuth } from '../../Context/AuthContext';
import useSocketEvent from '../../hooks/useSocketEvent';
import { resolveImageUrl } from '../../utils/image';
import { getWaiterScope, inWaiterScope } from '../../utils/waiterScope';
import toast from 'react-hot-toast';
import { useLocation } from 'react-router-dom';

/**
 * Presentation for each Request.type.
 *
 * The model's enum has been ['water', 'waiter', 'bill', 'other'] all
 * along, but this screen only ever special-cased 'water' — every other
 * type rendered the same generic bell and printed the raw enum value
 * as its label. A customer asking to settle up therefore arrived
 * looking identical to a customer waving for attention, even though
 * one needs a bill brought to the table and the other doesn't.
 */
const REQUEST_META = {
    water:  { label: 'Water requested',      tone: 'bg-[#EFF6FF] text-[#2563EB]' },
    waiter: { label: 'Waiter called',        tone: 'bg-[#FDF5FF] text-[#9333EA]' },
    // Amber: this one costs money if it's missed.
    bill:   { label: 'Bill requested',       tone: 'bg-[#FFF7ED] text-[#EA580C]' },
    other:  { label: 'Assistance requested', tone: 'bg-[#FDF5FF] text-[#9333EA]' },
};

const PRIORITY_TONE = {
    low:    'bg-[#F3F4F6] text-[#6B7280]',
    medium: 'bg-[#FFF7ED] text-[#EA580C]',
    high:   'bg-[#FFF1F1] text-[#FF4D4D]',
    urgent: 'bg-[#FF3B30] text-white',
};

function renderRequestIcon(type) {
    if (type === 'water') return <GlassWater size={24} />;
    if (type === 'bill') return <Receipt size={24} />;
    if (type === 'other') return <HelpCircle size={24} />;
    return <BellRing size={24} />;
}

const CustomerRequests = () => {
    const { user } = useAuth();
    const currentWaiterId = user?._id || user?.id;
    // Deep-link from a notification: `{ area: 'Outdoor' | <areaId> }`
    // in router state opens this screen on that section instead of the
    // default/busiest floor.
    const location = useLocation();
    const navArea = location.state?.area || null;

    // CAP-010 — waiter scope. Narrows the floor pills and the request list
    // to the waiter's assigned areas/tables, matching the Home tab. Empty
    // assignment = catch-all waiter (whole branch). See utils/waiterScope.
    const scope = useMemo(() => getWaiterScope(user), [user]);
    const matchesAssignment = (r) => inWaiterScope(scope, r);

    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const [activeRequestTab, setActiveRequestTab] = useState('pending');
    const [activeFloor, setActiveFloor] = useState(null);
    const [areas, setAreas] = useState([]);
    const [requestsData, setRequestsData] = useState([]);
    const [pendingAll, setPendingAll] = useState([]);
    const [loading, setLoading] = useState(true);
    // Initial name is empty so we don't flash the literal "Cafe Name"
    // placeholder for the first ~500ms while /settings is in flight.
    // Once settings lands we keep the same "Cafe Name" fallback that
    // every other waiter page uses for tenants who haven't set one.
    const [cafeConfig, setCafeConfig] = useState({ name: '', logo: '' });

    const fetchData = async () => {
        try {
            setLoading(true);
            // Fetch settings
            const settingsRes = await settingsAPI.getSettings();
            if (settingsRes.data) {
                setCafeConfig({
                    name: settingsRes.data.general?.cafeName || 'Cafe Name',
                    logo: settingsRes.data.general?.logoUrl || ''
                });
            }
            const areaRes = await waiterAPI.getAreas();
            const allAreas = areaRes.data.success ? areaRes.data.areas : [];
            // CAP-010 — narrow the floor pills to the waiter's assigned areas.
            const areasList = scope.hasAreaScope
                ? allAreas.filter(a => scope.assignedAreaIds.has(String(a._id)))
                : allAreas;
            if (areasList.length > 0) setAreas(areasList);

            // Fetch in parallel: the tab-filtered list (for display) and
            // the all-floors pending list (for per-floor pill badges so
            // a waiter can see a new request land on another floor).
            const [reqRes, pendingAllRes] = await Promise.all([
                waiterAPI.getRequests({
                    status: activeRequestTab,
                    floor: activeFloor,
                    waiterId: currentWaiterId,
                }),
                waiterAPI.getRequests({
                    status: 'pending',
                    waiterId: currentWaiterId,
                }),
            ]);
            if (reqRes.data.success) {
                setRequestsData(reqRes.data.requests.filter(matchesAssignment));
            }
            const pendingList = (pendingAllRes.data?.success ? pendingAllRes.data.requests : [])
                .filter(matchesAssignment);
            setPendingAll(pendingList);

            // Smart default-floor pick (WAI-009/WAI-010 UX fix). The old
            // code dropped the waiter onto the first alphabetical area
            // on every cold load, so the most common landing screen was
            // an empty list with the pending requests hidden one floor
            // away. Two testers in a row reported "Accept option not
            // there" because they didn't read the "X pending on other
            // floors" hint. Now: if the waiter has no floor selected
            // yet, jump straight to the floor with the most pending
            // requests (or alphabetical first if everything's quiet).
            if (!activeFloor && areasList.length > 0) {
                const linked = navArea
                    ? areasList.find(a => String(a._id) === String(navArea) || a.name === navArea)
                    : null;
                if (linked) {
                    setActiveFloor(linked._id);
                    return;
                }
                const countsByArea = pendingList.reduce((acc, r) => {
                    const id = typeof r.table?.area === 'object'
                        ? r.table?.area?._id
                        : r.table?.area;
                    const key = id ? String(id) : '';
                    if (key) acc[key] = (acc[key] || 0) + 1;
                    return acc;
                }, {});
                const busiest = Object.entries(countsByArea)
                    .sort((a, b) => b[1] - a[1])[0]?.[0];
                setActiveFloor(busiest || areasList[0]._id);
            }
        } catch (err) {
            console.error('Failed to fetch requests', err);
        } finally {
            setLoading(false);
        }
    };

    // Per-area pending counts for the floor pills. Mirrors the
    // readyCountByArea pattern in WaiterOrders so a waiter can see at a
    // glance which floor has a new request waiting.
    const pendingByArea = pendingAll.reduce((acc, r) => {
        const areaId = typeof r.table?.area === 'object' ? r.table?.area?._id : r.table?.area;
        const key = String(areaId || '');
        if (!key) return acc;
        acc[key] = (acc[key] || 0) + 1;
        return acc;
    }, {});
    const totalPendingCount = pendingAll.length;
    const activeFloorName = (areas.find(a => String(a._id) === String(activeFloor))?.name) || '';

    useEffect(() => {
        fetchData();
    }, [activeRequestTab, activeFloor]);

    // Fallback polling every 60s — Socket.io handles instant updates
    useEffect(() => {
        const interval = setInterval(fetchData, 60000);
        return () => clearInterval(interval);
    }, [activeRequestTab, activeFloor]);

    // Real-time: re-fetch on request and order events
    useSocketEvent('request:new', fetchData);
    useSocketEvent('request:updated', fetchData);
    useSocketEvent('order:new', fetchData);
    useSocketEvent('order:updated', fetchData);

    const handleUpdateStatus = async (requestId, status) => {
        try {
            const res = await waiterAPI.updateRequestStatus(requestId, status, currentWaiterId);
            if (res.data.success) {
                toast.success(`Request ${status === 'accepted' ? 'Accepted' : 'Completed'}`);
                fetchData();
            }
        } catch (err) {
            console.error('Failed to update request', err);
            toast.error('Failed to update request');
        }
    };

    return (
        <div className="min-h-screen bg-white text-[#1A1A1A] pb-32 font-sans overflow-x-hidden pt-env(safe-area-inset-top)">
            <Sidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />

            <div className="max-w-7xl mx-auto">
                {/* Top Header — sticky so the area chips stay reachable */}
                <header className="sticky top-0 z-20 bg-white/95 backdrop-blur px-4 sm:px-6 pt-6 pb-4 border-b border-gray-100">
                    <div className="flex items-center gap-3 mb-5">
                        {resolveImageUrl(cafeConfig.logo) && (
                            <img
                                src={resolveImageUrl(cafeConfig.logo)}
                                alt="Logo"
                                className="h-11 sm:h-12 w-auto max-w-[150px] object-contain shrink-0 mix-blend-multiply"
                                onError={(e) => { e.target.onerror = null; e.target.style.display = 'none'; }}
                            />
                        )}
                        <h1 className="text-xl sm:text-2xl font-bold text-gray-900 tracking-tight truncate">{cafeConfig.name}</h1>
                        <div className="ml-auto flex items-center gap-2">
                            <NotificationBell />
                            <StaffProfileMenu />
                        </div>
                    </div>
                    <div className="flex items-center gap-3 sm:gap-4">
                        <button
                            onClick={() => setIsSidebarOpen(true)}
                            aria-label="Open menu"
                            className="w-11 h-11 sm:w-12 sm:h-12 rounded-xl text-gray-600 hover:text-gray-900 hover:bg-gray-50 flex items-center justify-center transition shrink-0"
                        >
                            <Menu size={28} strokeWidth={1.75} />
                        </button>

                        <div className="flex-1 flex gap-2 text-[13px] font-bold overflow-x-auto no-scrollbar py-1">
                            {areas.map((area) => {
                                const pendingHere = pendingByArea[String(area._id)] || 0;
                                const isActive = activeFloor === area._id;
                                return (
                                    <button
                                        key={area._id}
                                        onClick={() => setActiveFloor(area._id)}
                                        className={`min-h-11 px-4 rounded-xl border transition-all duration-200 min-w-[max-content] flex items-center gap-2 ${isActive
                                            ? 'border-[#7C3AED] text-[#7C3AED] bg-[#F9F1FB]'
                                            : 'border-gray-200 text-gray-500 bg-white hover:border-gray-300'
                                            }`}
                                    >
                                        <span>{area.name}</span>
                                        {pendingHere > 0 && (
                                            <span className={`inline-flex items-center justify-center min-w-5 h-5 px-1.5 rounded-full text-[11px] font-black tabular-nums ${
                                                isActive ? 'bg-[#7C3AED] text-white' : 'bg-red-100 text-red-600'
                                            }`}>
                                                {pendingHere}
                                            </span>
                                        )}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                </header>

                {/* Request Tabs */}
                <div className="px-4 sm:px-6 mt-4 mb-5">
                    <div className="bg-[#F0F0F3] p-1 rounded-full flex gap-1">
                        <button
                            onClick={() => setActiveRequestTab('pending')}
                            className={`flex-1 min-h-11 px-4 rounded-full text-sm font-semibold transition-all ${activeRequestTab === 'pending' ? 'bg-[#8B26A5] text-white shadow-sm' : 'text-gray-700 hover:text-gray-900'}`}
                        >
                            Pending ({String(pendingByArea[String(activeFloor)] || 0).padStart(2, '0')})
                        </button>
                        <button
                            onClick={() => setActiveRequestTab('accepted')}
                            className={`flex-1 min-h-11 px-4 rounded-full text-sm font-semibold transition-all ${activeRequestTab === 'accepted' ? 'bg-[#8B26A5] text-white shadow-sm' : 'text-gray-700 hover:text-gray-900'}`}
                        >
                            Accepted
                        </button>
                        <button
                            onClick={() => setActiveRequestTab('completed')}
                            className={`flex-1 min-h-11 px-4 rounded-full text-sm font-semibold transition-all ${activeRequestTab === 'completed' ? 'bg-[#8B26A5] text-white shadow-sm' : 'text-gray-700 hover:text-gray-900'}`}
                        >
                            Completed
                        </button>
                    </div>
                </div>

                {/* Title */}
                <div className="px-4 sm:px-6 mb-4">
                <h2 className="text-[18px] font-bold text-[#1A181B]">
                    {activeRequestTab === 'pending' && 'Customers Requests'}
                    {activeRequestTab === 'accepted' && 'Accepted Requests'}
                    {activeRequestTab === 'completed' && 'Completed Requests'}
                </h2>
            </div>

                {/* Requests List */}
                <main className="px-4 sm:px-6 grid grid-cols-1 md:grid-cols-2 gap-4">
                    {loading && <div className="md:col-span-2 flex justify-center p-10"><Loader2 className="animate-spin text-[#8B26A5]" /></div>}
                    {!loading && requestsData.length === 0 && (
                        <div className="md:col-span-2">
                            <WaiterEmptyState
                                icon={Bell}
                                title={`No ${activeRequestTab} requests${activeFloorName ? ` for ${activeFloorName}` : ''}`}
                                hint={activeRequestTab === 'pending' && totalPendingCount > 0
                                    ? `${totalPendingCount} pending on other floor${totalPendingCount > 1 ? 's' : ''} — tap a pill with a red badge.`
                                    : 'New customer service calls will appear here.'}
                            />
                        </div>
                    )}
                {requestsData.map((request) => (
                    <div
                        key={request._id}
                        className={`bg-white border rounded-[24px] p-6 shadow-sm ${activeRequestTab === 'completed' ? 'border-[#34C759] py-3' : 'border-[#E8E8E8]'}`}
                    >
                        <div className={`flex justify-between items-center ${activeRequestTab === 'completed' ? '' : 'mb-6'}`}>
                            <div className="flex items-center gap-4 relative">
                                <div className={`w-12 h-12 bg-[#702083] rounded-[12px] flex items-center justify-center text-white text-[18px] font-bold`}>
                                    {request.table?.name || '??'}
                                </div>
                                <div className="relative">
                                    <span className={`text-[16px] font-[600] ${activeRequestTab === 'completed' ? 'text-[#8D848F]' : 'text-[#1A181B]'}`}>
                                        Table {request.table?.name?.replace('T', '') || '??'}
                                    </span>
                                    {request.waiter?.name && (
                                        <p className="text-[11px] text-[#8B26A5] font-[600]">{request.waiter.name}</p>
                                    )}
                                    {activeRequestTab === 'completed' && <div className="absolute top-1/2 left-0 w-full h-[1.5px] bg-[#1A181B] -translate-y-1/2 opacity-60" />}
                                </div>
                            </div>
                            <div className="flex items-center gap-3">
                                <div className="relative">
                                    {/* Priority colour by level — every chip used to be
                                        red, so "low" looked as alarming as "urgent". */}
                                    <div className={`${PRIORITY_TONE[request.priority] || PRIORITY_TONE.medium} ${activeRequestTab === 'completed' ? 'opacity-50' : ''} px-3 py-1 rounded-lg text-[12px] font-bold capitalize`}>
                                        {request.priority}
                                    </div>
                                    {activeRequestTab === 'completed' && <div className="absolute top-1/2 left-0 w-full h-[1.5px] bg-[#FF4D4D] -translate-y-1/2 opacity-60" />}
                                </div>
                                <div className="relative">
                                    <div className={`flex items-center gap-1 text-[12px] font-bold ${activeRequestTab === 'completed' ? 'text-[#8D848F]' : 'text-[#645E66] opacity-70'}`}>
                                        <Clock3 size={16} />
                                        {new Date(request.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true })}
                                    </div>
                                    {activeRequestTab === 'completed' && <div className="absolute top-1/2 left-0 w-full h-[1.5px] bg-[#1A181B] -translate-y-1/2 opacity-60" />}
                                </div>
                            </div>
                        </div>

                        {activeRequestTab !== 'completed' && (
                            <>
                                <div className="space-y-4 mb-6">
                                    {request.items?.length > 0 ? (
                                        <div className="flex flex-col gap-4 pb-2 border-b border-[#F3EBF5]">
                                            <div className="flex items-center gap-4">
                                                <div className={`w-10 h-10 rounded-xl flex items-center justify-center mt-0.5 shrink-0 ${REQUEST_META[request.type]?.tone || REQUEST_META.other.tone}`}>
                                                    {renderRequestIcon(request.type)}
                                                </div>
                                                <div className="flex flex-col">
                                                    <p className="font-semibold text-[#1A181B] leading-tight">
                                                        {REQUEST_META[request.type]?.label || REQUEST_META.other.label}
                                                    </p>
                                                    {request.items.map((item, idx) => (
                                                        <p key={idx} className="text-[13px] text-[#645E66]">{item.label} {item.qty ? `(x${item.qty})` : ''}</p>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="flex items-center gap-4 pb-2 border-b border-[#F3EBF5]">
                                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center mt-0.5 shrink-0 ${REQUEST_META[request.type]?.tone || REQUEST_META.other.tone}`}>
                                                {renderRequestIcon(request.type)}
                                            </div>
                                            <div className="flex flex-col">
                                                <p className="font-semibold text-[#1A181B] leading-tight">
                                                    {REQUEST_META[request.type]?.label || REQUEST_META.other.label}
                                                </p>
                                                {/* A bill request is a money event, not a ping.
                                                    Say what it actually needs so the waiter
                                                    doesn't just tap Accept and walk away. */}
                                                {request.type === 'bill' && (
                                                    <p className="text-[12px] text-[#B35C00]">
                                                        Guest is ready to pay — take the bill to the table.
                                                    </p>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                </div>

                                <div className="">
                                    {activeRequestTab === 'pending' ? (
                                        <div className="grid grid-cols-2 gap-4">
                                            <button 
                                                onClick={() => handleUpdateStatus(request._id, 'accepted')}
                                                className="flex items-center justify-center gap-2 bg-[#FF7A00] text-white rounded-[8px] py-[8px] pl-[12px] pr-[16px] text-[14px] font-bold shadow-md shadow-orange-100 active:scale-95 transition-all"
                                            >
                                                <CircleCheck size={16} strokeWidth={3} />
                                                <span>Accept</span>
                                            </button>
                                            <button 
                                                onClick={() => handleUpdateStatus(request._id, 'completed')}
                                                className="flex items-center justify-center gap-2 bg-white border border-[#34C759] text-[#34C759] rounded-[8px] py-[8px] pl-[12px] pr-[16px] text-[14px] font-bold active:scale-95 transition-all"
                                            >
                                                <Check size={16} strokeWidth={3} />
                                                <span>Complete</span>
                                            </button>
                                        </div>
                                    ) : (
                                        <button
                                            onClick={() => handleUpdateStatus(request._id, 'completed')}
                                            className="w-full flex items-center justify-center gap-2 border border-[#34C759] text-[#34C759] rounded-[16px] py-3.5 text-[14px] font-bold active:scale-95 transition-all"
                                        >
                                            <Check size={16} strokeWidth={3} />
                                            <span>Complete</span>
                                        </button>
                                    )}
                                </div>
                            </>
                        )}
                    </div>
                ))}
                </main>
            </div>

            <BottomNav />
        </div>
    );
};

export default CustomerRequests;
