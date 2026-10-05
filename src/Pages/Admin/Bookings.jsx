import React, { useState, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import {
    Calendar,
    Shapes,
    Package,
    LayoutGrid,
    Building2,
    Sparkles,
    Eye,
    CheckCircle2,
    XCircle,
    MoreHorizontal,
    Plus,
    Edit2,
    Trash2,
    Users,
    Cake,
    Archive,
    ChevronDown,
    ChevronUp,
    Star,
    Clock,
    Phone,
    CalendarX2,
    Zap,
    Upload
} from 'lucide-react'
import BookingDetailsModal from './components/BookingDetailsModal'
import AddEventTypeModal from './components/AddEventTypeModal'
import AddHallModal from './components/AddHallModal'

// ... (existing imports)

import AddPackageModal from './components/AddPackageModal'
import AddDecorationPackageModal from './components/AddDecorationPackageModal'
import BulkAddCsvModal from './components/BulkAddCsvModal'
import ConfirmActionModal from './components/ConfirmActionModal'

// Removed Hardcoded Stats and Mock Data

const navItems = [
    { name: 'Bookings', icon: Calendar, active: true },
    { name: 'Event Types', icon: Shapes, active: false },
    { name: 'Packages', icon: Package, active: false },
    { name: 'Halls', icon: Building2, active: false },
    { name: 'Decorations', icon: Sparkles, active: false },
]

import { useEffect } from 'react'
import { toast } from 'react-hot-toast'
import api from '../../utils/api'
import { backendOrigin } from '../../utils/apiOrigin';

const Bookings = () => {
    const [activeTab, setActiveTab] = useState('Bookings')
    const [filter, setFilter] = useState('All')
    const [selectedBooking, setSelectedBooking] = useState(null)
    const [isDrawerOpen, setIsDrawerOpen] = useState(false)
    const [isAddEventTypeModalOpen, setIsAddEventTypeModalOpen] = useState(false)
    const [isAddPackageModalOpen, setIsAddPackageModalOpen] = useState(false)
    const [isAddHallModalOpen, setIsAddHallModalOpen] = useState(false)
    const [isAddDecorationModalOpen, setIsAddDecorationModalOpen] = useState(false)
    // Bulk Add modals — one per section, all driven by the shared
    // BulkAddCsvModal component. Each section opens its own modal with
    // its own template / import endpoints + columns help text.
    const [isBulkAddEventTypeOpen, setIsBulkAddEventTypeOpen] = useState(false)
    const [isBulkAddPackageOpen, setIsBulkAddPackageOpen] = useState(false)
    const [isBulkAddHallOpen, setIsBulkAddHallOpen] = useState(false)
    const [isBulkAddDecorationOpen, setIsBulkAddDecorationOpen] = useState(false)
    const [bookingsTableData, setBookingsTableData] = useState([])
    const [loading, setLoading] = useState(true)

    // Data states (bookingsTableData is the single source of truth for bookings)
    const [allPackages, setAllPackages] = useState([])
    const [hallsData, setHallsData] = useState([])
    const [decorationsData, setDecorationsData] = useState([])
    const [eventTypesData, setEventTypesData] = useState([])

    useEffect(() => {
        const fetchData = async () => {
            setLoading(true);
            try {
                // Promise.allSettled (was Promise.all) — one slow endpoint
                // no longer kills the whole page; each section renders
                // whatever returned successfully.
                const results = await Promise.allSettled([
                    api.get('/advance-booking/all'),
                    api.get('/booking-info/packages'),
                    api.get('/halls'),
                    api.get('/decoration-packages'),
                    api.get('/booking-info/event-types'),
                ]);
                const [resBookings, resPackages, resHalls, resDecor, resEventTypes] = results;

                if (resBookings.status === 'fulfilled' && resBookings.value.data.success) {
                    const uniqueBookings = Array.from(new Map(resBookings.value.data.bookings.map(item => [item._id, item])).values());
                    const mapped = uniqueBookings.map(r => {
                        let displayType = 'General';
                        if (r.bookingType === 'hall') {
                            displayType = (r.hall && typeof r.hall === 'object' && r.hall.name) || 'Hall';
                        } else {
                            const areaName = (r.area && typeof r.area === 'object' && r.area.name) || null;
                            displayType = r.tables?.length > 0
                                ? r.tables.map(t => t.name).join(', ')
                                : (areaName || 'Table');
                        }
                        return {
                            id: `ADV-${r._id.toUpperCase().slice(-6)}`,
                            fullId: r._id,
                            name: r.user?.name || 'Unknown',
                            date: new Date(r.bookingDate).toLocaleDateString(),
                            time: r.bookingTime,
                            guests: `${r.guestCount} Guests`,
                            tags: [r.bookingType],
                            type: displayType,
                            price: r.payment?.totalAmount ? r.payment.totalAmount.toLocaleString() : '0',
                            amount: r.payment?.totalAmount ? `₹${r.payment.totalAmount.toLocaleString()}` : '0',
                            status: r.status || 'Pending',
                            original: r
                        };
                    });
                    setBookingsTableData(mapped);
                }
                if (resPackages.status === 'fulfilled' && resPackages.value.data.success) {
                    setAllPackages(resPackages.value.data.packages.map(p => ({ ...p, status: p.status ?? p.isActive })));
                }
                if (resHalls.status === 'fulfilled' && resHalls.value.data.success) {
                    setHallsData(resHalls.value.data.halls.map(h => ({ ...h, status: h.status ?? h.isActive })));
                }
                if (resDecor.status === 'fulfilled' && resDecor.value.data.success) {
                    setDecorationsData(resDecor.value.data.packages || resDecor.value.data.decorPackages);
                }
                if (resEventTypes.status === 'fulfilled' && resEventTypes.value.data.success) {
                    setEventTypesData(resEventTypes.value.data.eventTypes.map(e => ({
                        id: e._id,
                        title: e.title,
                        description: e.description,
                        guests: e.guests,
                        icon: e.icon,
                        color: e.color,
                        iconColor: e.iconColor,
                        services: e.services,
                        tags: e.tags,
                        status: e.isActive
                    })));
                }
            } catch {
                toast.error('Failed to load bookings data');
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, []);

    // ── Open-from-notification: admin clicks a Booking notification and the
    // modal navigates here with `{ openBookingId }`. Find the matching row
    // (by Mongo _id OR bookingId) and open its details drawer.
    const location = useLocation();
    const lastHandledKeyRef = useRef(null);
    useEffect(() => {
        const openBookingId = location.state?.openBookingId;
        if (!openBookingId) return;
        if (lastHandledKeyRef.current === location.key) return;
        if (loading || bookingsTableData.length === 0) return;

        const hit = bookingsTableData.find(b =>
            b.fullId === openBookingId || b.id === openBookingId || b.original?.bookingId === openBookingId
        );
        if (hit) {
            lastHandledKeyRef.current = location.key;
            setActiveTab('Bookings');
            setSelectedBooking(hit);
            setIsDrawerOpen(true);
        } else {
            lastHandledKeyRef.current = location.key;
            toast.error('Booking not found');
        }
    }, [location.key, location.state?.openBookingId, bookingsTableData, loading]);

    // Derived Data
    const stats = [
        { label: "Total Bookings", value: String(bookingsTableData.length).padStart(2, '0') },
        { label: "Pending Approval", value: String(bookingsTableData.filter(b => b.status === 'Pending').length).padStart(2, '0') },
        { label: "Confirmed Bookings", value: String(bookingsTableData.filter(b => b.status === 'Confirmed' || b.status === 'Paid').length).padStart(2, '0') },
        { 
            label: "Total Revenue", 
            value: `₹${(bookingsTableData.filter(b => b.status === 'Confirmed' || b.status === 'Paid').reduce((sum, b) => {
                const amount = parseFloat(String(b.amount).replace(/[^\d.]/g, '')) || 0;
                return sum + amount;
            }, 0) / 1000).toFixed(1)}K` 
        },
    ];

    const todayDate = new Date().toLocaleDateString();

    // Today's Bookings filter chip state
    const [todaysFilter, setTodaysFilter] = useState('All'); // 'All' | 'Pending' | 'Confirmed'

    // Parse "HH:MM" / "H:MM AM" into comparable minutes-of-day
    const parseTimeToMinutes = (t) => {
        if (!t) return 0;
        const s = String(t).trim();
        const ampm = /am|pm/i.test(s);
        if (ampm) {
            const m = s.match(/(\d+):(\d+)\s*(am|pm)/i);
            if (!m) return 0;
            let h = parseInt(m[1], 10) % 12;
            if (/pm/i.test(m[3])) h += 12;
            return h * 60 + parseInt(m[2], 10);
        }
        const m = s.match(/(\d+):(\d+)/);
        if (!m) return 0;
        return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
    };

    const todaysAll = bookingsTableData
        .filter(b => b.date === todayDate)
        .sort((a, b) => parseTimeToMinutes(a.time) - parseTimeToMinutes(b.time));

    const todaysCounts = {
        All: todaysAll.length,
        Pending: todaysAll.filter(b => b.status === 'Pending').length,
        Confirmed: todaysAll.filter(b => b.status === 'Confirmed' || b.status === 'Paid').length,
    };

    const todaysBookings = todaysAll.filter(b => {
        if (todaysFilter === 'All') return true;
        if (todaysFilter === 'Confirmed') return b.status === 'Confirmed' || b.status === 'Paid';
        return b.status === todaysFilter;
    });

    // Identify the next upcoming slot relative to now (today only, Confirmed/Pending)
    const nowMinutes = (() => {
        const n = new Date();
        return n.getHours() * 60 + n.getMinutes();
    })();
    const nextUpBooking = todaysAll.find(b =>
        parseTimeToMinutes(b.time) >= nowMinutes &&
        (b.status === 'Confirmed' || b.status === 'Paid' || b.status === 'Pending')
    );

    const upcomingEvents = bookingsTableData
        .filter(b => {
             const bDate = new Date(b.original?.bookingDate);
             return bDate > new Date() && b.status === 'Confirmed';
        })
        .slice(0, 3);

    // Confirmation Modal State
    const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false)
    const [confirmActionType, setConfirmActionType] = useState('Approve') // 'Approve' or 'Reject'
    const [bookingToConfirm, setBookingToConfirm] = useState(null)

    // Event Type Management State
    const [editingEventType, setEditingEventType] = useState(null)
    const [isTypeConfirmModalOpen, setIsTypeConfirmModalOpen] = useState(false)
    const [typeToConfirm, setTypeToConfirm] = useState(null)
    const [typeConfirmAction, setTypeConfirmAction] = useState('delete') // 'delete', 'activate', 'deactivate'

    // Packages Management State
    const [expandedPackageId, setExpandedPackageId] = useState(null)
    const [editingPackage, setEditingPackage] = useState(null)
    const [isPackageConfirmModalOpen, setIsPackageConfirmModalOpen] = useState(false)
    const [packageToConfirm, setPackageToConfirm] = useState(null)
    const [packageConfirmAction, setPackageConfirmAction] = useState('delete') // 'delete', 'activate', 'deactivate'
    
    // Halls Management State
    const [expandedHallId, setExpandedHallId] = useState(null)
    const [editingHall, setEditingHall] = useState(null)
    const [isHallConfirmModalOpen, setIsHallConfirmModalOpen] = useState(false)
    const [hallToConfirm, setHallToConfirm] = useState(null)
    const [hallConfirmAction, setHallConfirmAction] = useState('delete') // 'delete', 'activate', 'deactivate'

    // Decorations Management State
    const [expandedDecorationId, setExpandedDecorationId] = useState(null)
    const [editingDecoration, setEditingDecoration] = useState(null)
    const [isDecorationConfirmModalOpen, setIsDecorationConfirmModalOpen] = useState(false)
    const [decorationToConfirm, setDecorationToConfirm] = useState(null)
    const [decorationConfirmAction, setDecorationConfirmAction] = useState('delete') // 'delete', 'activate', 'deactivate'

    const handleOpenConfirm = (booking, type) => {
        setBookingToConfirm(booking)
        setConfirmActionType(type)
        setIsConfirmModalOpen(true)
    }
    const executeConfirmAction = async () => {
        if (!bookingToConfirm) return;

        try {
            if (confirmActionType === 'Delete') {
                const res = await api.delete(`/advance-booking/${bookingToConfirm.fullId || bookingToConfirm.id}`);
                if (res.data.success) {
                    setBookingsTableData(prev => prev.filter(b => (b.fullId || b.id) !== (bookingToConfirm.fullId || bookingToConfirm.id)));
                    setIsConfirmModalOpen(false);
                }
                return;
            }

            const status = confirmActionType === 'Approve' ? 'Confirmed' : 'Cancelled';
            const res = await api.patch(`/advance-booking/${bookingToConfirm.fullId || bookingToConfirm.id}/status`, { status });
            if (res.data.success) {
                setBookingsTableData(prev =>
                    prev.map(b =>
                        (b.fullId || b.id) === (bookingToConfirm.fullId || bookingToConfirm.id) ? { ...b, status } : b
                    )
                );
                if (selectedBooking && (selectedBooking.fullId || selectedBooking.id) === (bookingToConfirm.fullId || bookingToConfirm.id)) {
                    setSelectedBooking(prev => ({ ...prev, status }));
                }
            }
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to update booking status');
        }
    }

    const handleSaveEventType = async (eventTypeData) => {
        try {
            // Upload icon file to server if a new file was selected
            if (eventTypeData.iconFile) {
                const formData = new FormData();
                formData.append('image', eventTypeData.iconFile);
                const uploadRes = await api.post('/upload', formData, {
                    headers: { 'Content-Type': 'multipart/form-data' }
                });
                if (uploadRes.data?.success) {
                    eventTypeData.icon = `/uploads/${uploadRes.data.filename}`;
                }
            }
            // Remove the raw File object before sending to API
            delete eventTypeData.iconFile;

            let res;
            if (editingEventType) {
                res = await api.put(`/booking-info/event-types/${editingEventType.id}`, eventTypeData);
            } else {
                res = await api.post('/booking-info/event-types', eventTypeData);
            }
            if (res.data.success) {
                const refreshed = await api.get('/booking-info/event-types');
                if (refreshed.data.success) {
                    setEventTypesData(refreshed.data.eventTypes.map(e => ({
                        id: e._id,
                        title: e.title,
                        description: e.description,
                        guests: e.guests,
                        icon: e.icon,
                        color: e.color,
                        iconColor: e.iconColor,
                        services: e.services,
                        tags: e.tags,
                        status: e.isActive
                    })));
                }
                setIsAddEventTypeModalOpen(false);
                setEditingEventType(null);
            }
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to save event type');
        }
    }

    const executeTypeConfirmAction = async () => {
        if (!typeToConfirm) return;
        try {
            if (typeConfirmAction === 'delete') {
                const res = await api.delete(`/booking-info/event-types/${typeToConfirm.id}`);
                if (res.data.success) {
                    setEventTypesData(prev => prev.filter(t => t.id !== typeToConfirm.id))
                    message.success('Event type deleted successfully');
                }
            } else {
                const newStatus = typeConfirmAction === 'activate' ? true : false
                const res = await api.put(`/booking-info/event-types/${typeToConfirm.id}`, { isActive: newStatus });
                if (res.data.success) {
                    setEventTypesData(prev => prev.map(t => t.id === typeToConfirm.id ? { ...t, status: newStatus } : t))
                    message.success(`Event type ${newStatus ? 'activated' : 'deactivated'} successfully`);
                }
            }
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to update event type');
            message.error('Action failed. Please try again.');
        } finally {
            setIsTypeConfirmModalOpen(false)
            setTypeToConfirm(null)
        }
    }

    const handleSavePackage = async (packageData) => {
        try {
            let res;
            if (editingPackage) {
                res = await api.put(`/booking-info/packages/${editingPackage._id}`, packageData);
            } else {
                res = await api.post('/booking-info/packages', packageData);
            }
            if (res.data.success) {
                const refreshed = await api.get('/booking-info/packages');
                if (refreshed.data.success) setAllPackages(refreshed.data.packages);
                setIsAddPackageModalOpen(false);
                setEditingPackage(null);
            }
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to save package');
        }
    }

    const executePackageConfirmAction = async () => {
        if (!packageToConfirm) return;
        try {
            if (packageConfirmAction === 'delete') {
                const res = await api.delete(`/booking-info/packages/${packageToConfirm._id || packageToConfirm.id}`);
                if (res.data.success) {
                    setAllPackages(prev => prev.filter(p => (p._id || p.id) !== (packageToConfirm._id || packageToConfirm.id)))
                    message.success('Package deleted successfully');
                }
            } else {
                const newStatus = packageConfirmAction === 'activate' ? true : false
                const res = await api.put(`/booking-info/packages/${packageToConfirm._id || packageToConfirm.id}`, { isActive: newStatus });
                if (res.data.success) {
                    setAllPackages(prev => prev.map(p => (p._id || p.id) === (packageToConfirm._id || packageToConfirm.id) ? { ...p, status: newStatus } : p))
                    message.success(`Package ${newStatus ? 'activated' : 'deactivated'} successfully`);
                }
            }
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to update package');
            message.error('Action failed. Please try again.');
        } finally {
            setIsPackageConfirmModalOpen(false)
            setPackageToConfirm(null)
        }
    }

    const handleSaveHall = async (hallData) => {
        try {
            let res;
            if (editingHall) {
                res = await api.put(`/halls/${editingHall._id}`, hallData);
            } else {
                res = await api.post('/halls', hallData);
            }
            if (res.data.success) {
                const refreshed = await api.get('/halls');
                if (refreshed.data.success) setHallsData(refreshed.data.halls);
                setIsAddHallModalOpen(false);
                setEditingHall(null);
            }
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to save hall');
        }
    }

    const executeHallConfirmAction = async () => {
        if (!hallToConfirm) return;
        try {
            if (hallConfirmAction === 'delete') {
                const res = await api.delete(`/halls/${hallToConfirm._id || hallToConfirm.id}`);
                if (res.data.success) {
                    setHallsData(prev => prev.filter(h => (h._id || h.id) !== (hallToConfirm._id || hallToConfirm.id)))
                    message.success('Hall deleted successfully');
                }
            } else {
                const newStatus = hallConfirmAction === 'activate' ? true : false
                const res = await api.put(`/halls/${hallToConfirm._id || hallToConfirm.id}`, { status: newStatus });
                if (res.data.success) {
                    setHallsData(prev => prev.map(h => (h._id || h.id) === (hallToConfirm._id || hallToConfirm.id) ? { ...h, status: newStatus } : h))
                    message.success(`Hall ${newStatus ? 'activated' : 'deactivated'} successfully`);
                }
            }
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to update hall');
            message.error('Action failed. Please try again.');
        } finally {
            setIsHallConfirmModalOpen(false)
            setHallToConfirm(null)
        }
    }

    const handleSaveDecoration = async (decoData) => {
        try {
            let res;
            if (editingDecoration) {
                res = await api.put(`/decoration-packages/${editingDecoration._id || editingDecoration.id}`, decoData);
            } else {
                res = await api.post('/decoration-packages', decoData);
            }

            if (res.data.success) {
                const refreshed = await api.get('/decoration-packages');
                if (refreshed.data.success) setDecorationsData(refreshed.data.decorPackages);
                setIsAddDecorationModalOpen(false);
                setEditingDecoration(null);
            }
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to save decoration');
        }
    }

    const executeDecorationConfirmAction = async () => {
        if (!decorationToConfirm) return;
        try {
            if (decorationConfirmAction === 'delete') {
                const res = await api.delete(`/decoration-packages/${decorationToConfirm._id || decorationToConfirm.id}`);
                if (res.data.success) {
                    setDecorationsData(prev => prev.filter(d => (d._id || d.id) !== (decorationToConfirm._id || decorationToConfirm.id)));
                }
            } else {
                const res = await api.patch(`/decoration-packages/${decorationToConfirm._id || decorationToConfirm.id}/status`);
                if (res.data.success) {
                    setDecorationsData(prev => prev.map(d => 
                        (d._id || d.id) === (decorationToConfirm._id || decorationToConfirm.id) 
                        ? { ...d, isActive: !d.isActive } 
                        : d
                    ));
                }
            }
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to update decoration');
        } finally {
            setIsDecorationConfirmModalOpen(false);
            setDecorationToConfirm(null);
        }
    }

    const getTagStyle = (tag) => {
        switch (tag) {
            case 'table': return 'bg-[#F3E8FF] text-[#9333EA]'
            case 'hall': return 'bg-[#DCFCE7] text-[#16A34A]'
            default: return 'bg-gray-100 text-gray-600'
        }
    }

    const getStatusStyle = (status) => {
        switch (status) {
            case 'Confirmed': return 'bg-[#DCFCE7] text-[#16A34A]'
            case 'Pending': return 'bg-[#FEF9C3] text-[#CA8A04]'
            case 'Cancelled': return 'bg-[#FEE2E2] text-[#EF4444]'
            case 'Paid': return 'bg-[#DBEAFE] text-[#2563EB]'
            default: return 'bg-gray-100 text-gray-600'
        }
    }

    const getBadgeStyle = (badge) => {
        switch (badge) {
            case 'Active': return 'bg-[#DCFCE7] text-[#16A34A]'
            case 'Featured': return 'bg-[#DBEAFE] text-[#2563EB]'
            case 'AC Indoor': return 'bg-[#E0F2FE] text-[#0284C7]'
            default: return 'bg-gray-100 text-gray-600'
        }
    }

    return (
        <div className="h-full flex flex-col font-manrope overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
            {/* Header */}
            <div className="mb-6 flex justify-between items-end">
                <div>
                    <h1 className="font-manrope font-[700] text-[20px] leading-[26px] text-[#1A181B]">
                        Admin Booking Dashboard
                    </h1>
                    <p className="font-manrope font-[600] text-[16px] leading-[22px] text-[#645E66] mt-1">
                        Manage all bookings and settings
                    </p>
                </div>
            </div>

            {/* Bookings Dashboard Widgets - Only visible on Bookings tab */}

            <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 flex-shrink-0">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                    {stats.map((stat, index) => (
                        <div key={index} className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm">
                            <p className="text-[14px] font-[600] text-gray-500 mb-2">{stat.label}</p>
                            <p className="text-[24px] font-[700] text-[#1A181B]">{stat.value}</p>
                        </div>
                    ))}
                </div>

                <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 mb-4">
                    {/* Today's Bookings */}
                    <div className="bg-white p-5 rounded-[16px] border border-gray-200 flex flex-col">
                        <div className="mb-3 flex items-start justify-between gap-3">
                            <div>
                                <h2 className="text-[16px] font-[600] text-[#1A181B] mb-0.5">Today's Bookings</h2>
                                <p className="text-[13px] text-[#71717A]">
                                    {String(todaysAll.length).padStart(2, '0')} scheduled
                                    {todaysCounts.Pending > 0 && (
                                        <span className="text-[#B45309] font-[600]"> · {todaysCounts.Pending} pending</span>
                                    )}
                                </p>
                            </div>
                            {nextUpBooking && (
                                <div className="flex items-center gap-1.5 bg-[#EEF2FF] text-[#4338CA] px-2.5 py-1 rounded-full text-[11px] font-[600] whitespace-nowrap">
                                    <Zap size={12} strokeWidth={2.5} />
                                    <span>Up next · {nextUpBooking.time}</span>
                                </div>
                            )}
                        </div>

                        {/* Filter chips */}
                        {todaysAll.length > 0 && (
                            <div className="flex items-center gap-1.5 mb-3 p-1 bg-gray-50 rounded-lg w-fit">
                                {['All', 'Pending', 'Confirmed'].map(f => (
                                    <button
                                        key={f}
                                        onClick={() => setTodaysFilter(f)}
                                        className={`px-3 py-1 rounded-md text-[12px] font-[600] transition-colors ${
                                            todaysFilter === f
                                                ? 'bg-white text-[#1A181B] shadow-sm'
                                                : 'text-gray-500 hover:text-gray-700'
                                        }`}
                                    >
                                        {f} <span className="text-[11px] opacity-70">({todaysCounts[f]})</span>
                                    </button>
                                ))}
                            </div>
                        )}

                        {/* List / Empty state */}
                        {todaysAll.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-10 text-center border border-dashed border-gray-200 rounded-[12px]">
                                <CalendarX2 size={32} className="text-gray-300 mb-2" strokeWidth={1.5} />
                                <p className="text-[14px] font-[600] text-[#1A181B]">No bookings today</p>
                                <p className="text-[12px] text-[#71717A] mt-0.5">New reservations for today will appear here.</p>
                            </div>
                        ) : todaysBookings.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-8 text-center border border-dashed border-gray-200 rounded-[12px]">
                                <p className="text-[13px] text-[#71717A]">No {todaysFilter.toLowerCase()} bookings for today.</p>
                            </div>
                        ) : (
                            <div className="space-y-3 max-h-[420px] overflow-y-auto pr-1">
                                {todaysBookings.map((booking, i) => {
                                    const isNextUp = nextUpBooking && booking.fullId === nextUpBooking.fullId;
                                    const isPending = booking.status === 'Pending';
                                    return (
                                        <div
                                            key={booking.fullId || booking.id || i}
                                            className={`flex flex-col sm:flex-row justify-between p-4 border rounded-[12px] bg-white gap-3 sm:gap-0 transition-all ${
                                                isNextUp ? 'border-[#C7D2FE] ring-1 ring-[#C7D2FE] bg-[#F8FAFF]' : 'border-gray-200'
                                            }`}
                                        >
                                            {/* Left Container */}
                                            <div className="flex flex-col flex-1 min-w-0">
                                                <span className="text-[12px] font-[500] text-[#A1A1AA] mb-0.5">{booking.id}</span>
                                                <span className="text-[15px] font-[600] text-[#1A181B] mb-0.5 truncate">{booking.name}</span>
                                                <div className="text-[13px] text-[#71717A] mb-2 flex items-center gap-1.5 flex-wrap">
                                                    <span className="font-[600] text-[#1A181B] truncate max-w-[140px]">{booking.type}</span>
                                                    <span className="text-gray-300">&#8226;</span>
                                                    <span className="inline-flex items-center gap-1"><Users size={12} /> {booking.guests}</span>
                                                    <span className="text-gray-300">&#8226;</span>
                                                    <span className="inline-flex items-center gap-1"><Clock size={12} /> {booking.time}</span>
                                                </div>
                                                <div className="flex flex-wrap gap-2">
                                                    {booking.tags.map((tag, idx) => (
                                                        <span key={idx} className="bg-[#FDF4FF] text-[#C026D3] px-2.5 py-0.5 rounded-full text-[11px] font-[600] capitalize">
                                                            {tag}
                                                        </span>
                                                    ))}
                                                    {booking.original?.user?.mobile && (
                                                        <a
                                                            href={`tel:${booking.original.user.mobile}`}
                                                            className="inline-flex items-center gap-1 bg-gray-50 hover:bg-gray-100 text-gray-600 px-2.5 py-0.5 rounded-full text-[11px] font-[600] transition-colors"
                                                        >
                                                            <Phone size={10} /> Call
                                                        </a>
                                                    )}
                                                </div>
                                            </div>

                                            {/* Right Container */}
                                            <div className="flex sm:flex-col justify-between items-center sm:items-end sm:py-0.5 w-full sm:w-auto mt-2 sm:mt-0 gap-2">
                                                <span className={`${getStatusStyle(booking.status)} px-2.5 py-0.5 rounded-full text-[10px] font-[600]`}>
                                                    {booking.status}
                                                </span>
                                                <div className="flex items-center gap-1.5 sm:mt-auto">
                                                    <span className="text-[16px] font-[700] text-[#1A181B]">₹{booking.price}</span>
                                                    <button
                                                        onClick={() => {
                                                            setSelectedBooking(booking)
                                                            setIsDrawerOpen(true)
                                                        }}
                                                        className="text-gray-400 hover:text-gray-600 transition-colors ml-1"
                                                        title="View details"
                                                    >
                                                        <Eye size={18} strokeWidth={2} />
                                                    </button>
                                                </div>
                                                {isPending && (
                                                    <div className="flex items-center gap-1.5">
                                                        <button
                                                            onClick={() => handleOpenConfirm(booking, 'Approve')}
                                                            className="inline-flex items-center gap-1 bg-[#DCFCE7] hover:bg-[#BBF7D0] text-[#16A34A] px-2 py-1 rounded-md text-[11px] font-[600] transition-colors"
                                                            title="Approve"
                                                        >
                                                            <CheckCircle2 size={12} strokeWidth={2.5} /> Approve
                                                        </button>
                                                        <button
                                                            onClick={() => handleOpenConfirm(booking, 'Reject')}
                                                            className="inline-flex items-center gap-1 bg-[#FEE2E2] hover:bg-[#FECACA] text-[#DC2626] px-2 py-1 rounded-md text-[11px] font-[600] transition-colors"
                                                            title="Reject"
                                                        >
                                                            <XCircle size={12} strokeWidth={2.5} /> Reject
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    {/* Upcoming Events */}
                    <div className="bg-white p-5 rounded-[16px] border border-gray-200">
                        <div className="mb-4">
                            <h2 className="text-[16px] font-[600] text-[#1A181B] mb-0.5">Upcoming Events</h2>
                            <p className="text-[13px] text-[#71717A]">{String(upcomingEvents.length).padStart(2, '0')} confirmed upcoming bookings</p>
                        </div>
                        {upcomingEvents.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-10 text-center border border-dashed border-gray-200 rounded-[12px]">
                                <CalendarX2 size={32} className="text-gray-300 mb-2" strokeWidth={1.5} />
                                <p className="text-[14px] font-[600] text-[#1A181B]">No upcoming events</p>
                                <p className="text-[12px] text-[#71717A] mt-0.5">Confirmed bookings for the days ahead will show up here.</p>
                            </div>
                        ) : (
                        <div className="space-y-3">
                            {upcomingEvents.map((booking, i) => (
                                <div key={i} className="flex flex-col sm:flex-row justify-between p-4 border border-gray-200 rounded-[12px] bg-white gap-3 sm:gap-0">
                                    {/* Left Container */}
                                    <div className="flex flex-col">
                                        <span className="text-[12px] font-[500] text-[#A1A1AA] mb-0.5">{booking.id}</span>
                                        <span className="text-[15px] font-[600] text-[#1A181B] mb-0.5">{booking.name}</span>
                                        <div className="text-[13px] text-[#71717A] mb-2.5 flex items-center gap-1.5">
                                            <span className="font-[600] text-[#1A181B]">{booking.type}</span>
                                            <span className="text-gray-300">&#8226;</span>
                                            <span>{booking.guests}</span>
                                        </div>
                                        <div className="flex flex-wrap gap-2">
                                            {booking.tags.map((tag, idx) => (
                                                <span key={idx} className="bg-[#FDF4FF] text-[#C026D3] px-2.5 py-0.5 rounded-full text-[11px] font-[600]">
                                                    {tag}
                                                </span>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Right Container */}
                                    <div className="flex sm:flex-col justify-between items-center sm:items-end sm:py-0.5 w-full sm:w-auto mt-2 sm:mt-0">
                                        <div className="flex flex-col items-start sm:items-end gap-1 sm:gap-1.5">
                                            <span className="bg-[#DCFCE7] text-[#16A34A] px-2.5 py-0.5 rounded-full text-[10px] font-[600]">
                                                {booking.status}
                                            </span>
                                            <span className="text-[12px] text-[#71717A] font-[400] hidden sm:block">{booking.date} {booking.time}</span>
                                        </div>
                                        <span className="text-[12px] text-[#71717A] font-[400] sm:hidden">{booking.date} {booking.time}</span>
                                        <div className="flex items-center gap-1.5 sm:mt-auto sm:pb-0.5">
                                            <span className="text-[16px] font-[700] text-[#1A181B]">₹{booking.price}</span>
                                            <button
                                                onClick={() => {
                                                    setSelectedBooking(booking)
                                                    setIsDrawerOpen(true)
                                                }}
                                                className="text-gray-400 hover:text-gray-600 transition-colors ml-1"
                                            >
                                                <Eye size={18} strokeWidth={2} />
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                        )}
                    </div>
                </div>
            </div>


            {/* Navigation Bar */}
            <div className="bg-[#EAEAEA] p-1 rounded-full mb-4 flex overflow-x-auto no-scrollbar shrink-0">
                {navItems.map((item) => (
                    <button
                        key={item.name}
                        onClick={() => setActiveTab(item.name)}
                        className={`flex items-center gap-2 px-6 py-2.5 rounded-full text-[14px] font-[700] whitespace-nowrap transition-all flex-1 justify-center
                            ${activeTab === item.name
                                ? 'bg-white text-[#F97316] shadow-sm'
                                : 'text-gray-500 hover:bg-gray-200'
                            }`}
                    >
                        <item.icon size={18} />
                        {item.name}
                    </button>
                ))}
            </div>

            {/* Content Area */}
            {activeTab === 'Bookings' && (
                <div className="sticky top-0 z-10 animate-in fade-in duration-300" style={{ height: 'calc(100vh - 80px)' }}>
                    <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm h-full flex flex-col">
                        <div className="mb-3 flex-shrink-0 flex items-center justify-between">
                            <div>
                                <h2 className="text-[18px] font-[700] text-[#1A181B]">All Bookings</h2>
                                <p className="text-[13px] text-gray-500 font-[500]">Manage and approve booking requests</p>
                            </div>
                            <span className="text-[13px] text-gray-400 font-[500]">{bookingsTableData.filter(b => filter === 'All' || b.status === filter).length} orders</span>
                        </div>

                        <div className="flex gap-2 mb-3 flex-shrink-0">
                            {[
                                { label: 'All', count: bookingsTableData.length },
                                { label: 'Pending', count: bookingsTableData.filter(b => b.status === 'Pending').length },
                                { label: 'Confirmed', count: bookingsTableData.filter(b => b.status === 'Confirmed').length }
                            ].map((tab) => (
                                <button
                                    key={tab.label}
                                    onClick={() => setFilter(tab.label)}
                                    className={`px-5 py-2 rounded-full text-[14px] font-[700] border transition-all
                                        ${filter === tab.label
                                            ? 'border-[#702083] text-[#702083] bg-white'
                                            : 'border-gray-200 text-gray-500 bg-white hover:bg-gray-50'
                                        }`}
                                >
                                    {tab.label} ({String(tab.count).padStart(2, '0')})
                                </button>
                            ))}
                        </div>

                        {(() => {
                            const filteredBookings = bookingsTableData.filter(b => filter === 'All' || b.status === filter);
                            if (filteredBookings.length === 0) {
                                // Empty-state — render JUST the placeholder card,
                                // not the table headers / scroll container, so it
                                // doesn't claim the rest of the page height with
                                // a giant blank area below.
                                return (
                                    <div className="flex-shrink-0 flex flex-col items-center justify-center py-12 px-6 text-center border border-dashed border-gray-200 rounded-[12px]">
                                        <CalendarX2 size={32} className="text-gray-300 mb-2" strokeWidth={1.5} />
                                        <p className="text-[14px] font-[600] text-[#1A181B]">
                                            {bookingsTableData.length === 0
                                                ? 'No bookings yet'
                                                : `No ${filter.toLowerCase()} bookings`}
                                        </p>
                                        <p className="text-[12px] text-[#71717A] mt-0.5">
                                            {bookingsTableData.length === 0
                                                ? 'New booking requests from customers will appear here.'
                                                : `Bookings with status "${filter}" will show up here.`}
                                        </p>
                                    </div>
                                );
                            }
                            return (
                        <div className="rounded-xl border border-gray-200 shadow-sm flex-1 min-h-0 overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
                            <table className="w-full text-left border-collapse">
                                <thead className="bg-[#EAEAEA] border-b border-gray-100 sticky top-0 z-10">
                                    <tr>
                                        <th className="px-6 py-4 text-[12px] font-[700] text-[#4B5563] uppercase tracking-wider">ID</th>
                                        <th className="px-6 py-4 text-[12px] font-[700] text-[#4B5563] uppercase tracking-wider">Customer Name</th>
                                        <th className="px-6 py-4 text-[12px] font-[700] text-[#4B5563] uppercase tracking-wider">Date & Time</th>
                                        <th className="px-6 py-4 text-[12px] font-[700] text-[#4B5563] uppercase tracking-wider">Guests</th>
                                        <th className="px-6 py-4 text-[12px] font-[700] text-[#4B5563] uppercase tracking-wider">Type</th>
                                        <th className="px-6 py-4 text-[12px] font-[700] text-[#4B5563] uppercase tracking-wider">Amount</th>
                                        <th className="px-6 py-4 text-[12px] font-[700] text-[#4B5563] uppercase tracking-wider">Status</th>
                                        <th className="px-6 py-4 text-[12px] font-[700] text-[#4B5563] uppercase tracking-wider text-center">Action</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {filteredBookings
                                        .map((booking, index) => (
                                            <tr key={index} className="hover:bg-gray-50/50 transition-colors">
                                                <td className="px-6 py-4 text-[14px] font-[700] text-[#1A181B]">{booking.id}</td>
                                                <td className="px-6 py-4 text-[14px] font-[700] text-[#1A181B]">{booking.name}</td>
                                                <td className="px-6 py-4">
                                                    <div className="text-[14px] font-[700] text-[#1A181B]">{booking.date}</div>
                                                    <div className="text-[12px] text-gray-400">{booking.time}</div>
                                                </td>
                                                <td className="px-6 py-4 text-[14px] text-gray-600 font-[500]">{booking.guests}</td>
                                                <td className="px-6 py-4">
                                                    <div className="flex gap-2">
                                                        {booking.tags.map((tag, i) => (
                                                            <span key={i} className={`text-[10px] px-2 py-0.5 rounded-full font-[600] ${getTagStyle(tag)}`}>
                                                                {tag}
                                                            </span>
                                                        ))}
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4 text-[14px] font-[500] text-gray-600">₹{booking.amount}</td>
                                                <td className="px-6 py-4">
                                                    <span className={`text-[12px] px-3 py-1 rounded-full font-[700] ${getStatusStyle(booking.status)}`}>
                                                        {booking.status}
                                                    </span>
                                                </td>
                                                <td className="px-6 py-4 text-center">
                                                    <div className="flex items-center justify-center gap-3">
                                                        <button
                                                            onClick={() => {
                                                                setSelectedBooking(booking)
                                                                setIsDrawerOpen(true)
                                                            }}
                                                            className="text-gray-500 hover:text-gray-700 transition-colors"
                                                            title="View Details"
                                                        >
                                                            <Eye size={18} />
                                                        </button>
                                                        {booking.status === 'Pending' && (
                                                            <>
                                                                <button
                                                                    onClick={() => handleOpenConfirm(booking, 'Approve')}
                                                                    className="text-[#22C55E] hover:text-green-700 transition-colors"
                                                                    title="Approve"
                                                                >
                                                                    <CheckCircle2 size={18} strokeWidth={2.5} />
                                                                </button>
                                                                <button
                                                                    onClick={() => handleOpenConfirm(booking, 'Reject')}
                                                                    className="text-[#EF4444] hover:text-red-700 transition-colors"
                                                                    title="Reject"
                                                                >
                                                                    <XCircle size={18} strokeWidth={2.5} />
                                                                </button>
                                                            </>
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                </tbody>
                            </table>
                        </div>
                            );
                        })()}

                        {/* Footer — sticky at bottom */}
                        <div className="flex items-center justify-between pt-3 mt-2 border-t border-gray-100 flex-shrink-0">
                            <span className="text-[13px] text-gray-500 font-[500]">
                                Showing {bookingsTableData.filter(b => filter === 'All' || b.status === filter).length} of {bookingsTableData.length} bookings
                            </span>
                            <div className="flex items-center gap-4">
                                <span className="text-[13px] text-gray-400 font-[500]">
                                    {bookingsTableData.filter(b => b.status === 'Pending').length} pending · {bookingsTableData.filter(b => b.status === 'Confirmed').length} confirmed
                                </span>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {activeTab === 'Event Types' && (
                // Event Types Layout
                <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 mb-8">
                    {/* Event Types Container */}
                    <div className="bg-white rounded-2xl border border-gray-100 p-8 shadow-sm">
                        {/* Header with Title & Add Button */}
                        <div className="mb-0 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                            <div>
                                <h2 className="text-[20px] font-[700] text-[#1A181B] mb-1">Event Type Management</h2>
                                <p className="text-[14px] text-[#645E66] font-[500]">Create and manage different types of events your venue can host</p>
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => setIsBulkAddEventTypeOpen(true)}
                                    className="flex items-center gap-2 bg-white text-[#FE8301] border border-[#FE8301] px-5 py-3 rounded-[12px] font-[700] hover:bg-[#FFF3E6] transition-colors"
                                    title="Roster many event types in one upload"
                                >
                                    <Upload size={20} />
                                    Bulk Add
                                </button>
                                <button
                                    onClick={() => {
                                        setEditingEventType(null)
                                        setIsAddEventTypeModalOpen(true)
                                    }}
                                    className="flex items-center gap-2 bg-[#FE8301] text-white px-6 py-3 rounded-[12px] font-[700] hover:bg-[#e07400] transition-colors shadow-sm"
                                >
                                    <Plus size={22} strokeWidth={3} />
                                    Add Event Type
                                </button>
                            </div>
                        </div>

                        {/* Existing Event Types Sub-header */}
                        <h3 className="text-[16px] font-[700] text-[#1A181B] mt-10 mb-6">Existing Event Types ({eventTypesData.length})</h3>

                        {/* Event Type Cards */}
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                            {eventTypesData.map((event) => {
                                // icon can be:
                                //   - emoji string ('🎂') → render as text
                                //   - server upload path ('/uploads/foo.png') → <img> against backend
                                //   - external URL ('https://...') → <img> as-is
                                //   - empty / unknown → fall back to 🎂
                                const BACKEND_URL = backendOrigin();
                                const rawIcon = event.icon || '';
                                const isImagePath = rawIcon.startsWith('/') || rawIcon.startsWith('http');
                                const accent = event.color || '#A855F7';
                                return (
                                <div
                                    key={event.id}
                                    style={{ borderLeftColor: accent }}
                                    className={`bg-white border border-gray-100 rounded-[16px] p-4 border-l-[6px] shadow-sm hover:shadow-md transition-all flex items-center justify-between group ${!event.status ? 'opacity-60' : ''}`}
                                >
                                    <div className="flex items-center gap-4">
                                        <div className="w-[48px] h-[48px] bg-[#F8F9FA] rounded-[12px] flex items-center justify-center">
                                            {isImagePath ? (
                                                <img
                                                    src={rawIcon.startsWith('/uploads/') ? `${BACKEND_URL}${rawIcon}` : rawIcon}
                                                    alt={event.title}
                                                    className="w-8 h-8 object-contain"
                                                    onError={(e) => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'inline'; }}
                                                />
                                            ) : null}
                                            <span className="text-[22px]" style={{ display: isImagePath ? 'none' : 'inline' }}>
                                                {rawIcon && !isImagePath ? rawIcon : '🎂'}
                                            </span>
                                        </div>
                                        <h3 className="text-[15px] font-[700] text-[#1A181B] whitespace-nowrap overflow-hidden text-ellipsis max-w-[150px]">{event.title}</h3>
                                    </div>

                                    <div className="flex items-center gap-3">
                                        <button
                                            onClick={() => {
                                                setEditingEventType(event)
                                                setIsAddEventTypeModalOpen(true)
                                            }}
                                            className="p-1.5 text-gray-400 hover:text-gray-600 transition-colors">
                                            <Edit2 size={20} />
                                        </button>
                                        <button
                                            onClick={() => {
                                                setTypeToConfirm(event)
                                                setTypeConfirmAction('delete')
                                                setIsTypeConfirmModalOpen(true)
                                            }}
                                            className="p-1.5 text-gray-400 hover:text-red-500 transition-colors">
                                            <Trash2 size={20} />
                                        </button>
                                        
                                        {/* Toggle Switch */}
                                        <button
                                            onClick={() => {
                                                setTypeToConfirm(event)
                                                setTypeConfirmAction(event.status ? 'deactivate' : 'activate')
                                                setIsTypeConfirmModalOpen(true)
                                            }}
                                            className={`relative w-[44px] h-[24px] rounded-full transition-colors duration-200 focus:outline-none ml-1 ${event.status ? 'bg-[#34C759]' : 'bg-gray-200'}`}
                                        >
                                            <div className={`absolute top-[2px] left-[2px] bg-white w-[20px] h-[20px] rounded-full transition-transform duration-200 shadow-sm ${event.status ? 'translate-x-[20px]' : ''}`} />
                                        </button>
                                    </div>
                                </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            )}

            {activeTab === 'Packages' && (
                // Packages Layout
                <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 mb-8">
                    {/* Packages Container */}
                    <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
                        {/* Header with Title & Create Button */}
                        <div className="mb-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                            <div>
                                <h2 className="text-[20px] font-[700] text-[#1A181B]">Combo Package Management</h2>
                                <p className="text-[14px] text-gray-500 font-[500]">Create and manage combo packages for events</p>
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => setIsBulkAddPackageOpen(true)}
                                    className="flex items-center gap-2 bg-white text-[#F97316] border border-[#F97316] px-4 py-2.5 rounded-xl font-[600] hover:bg-[#FFF3E6] transition-colors"
                                    title="Add many packages in one upload"
                                >
                                    <Upload size={18} />
                                    Bulk Add
                                </button>
                                <button
                                    onClick={() => setIsAddPackageModalOpen(true)}
                                    className="flex items-center gap-2 bg-[#F97316] text-white px-5 py-2.5 rounded-xl font-[600] hover:bg-[#EA580C] transition-colors shadow-sm"
                                >
                                    <Plus size={20} />
                                    Create Package
                                </button>
                            </div>
                        </div>

                        {/* Existing Packages Sub-header */}
                        <h3 className="text-[16px] font-[700] text-[#1A181B] mb-4">Existing Packages ({allPackages.length})</h3>

                        {/* Package Cards */}
                        <div className="space-y-4">
                            {allPackages.map((pkg, index) => {
                                // Derive a unique emoji from the package name so each
                                // card has its own visual identity instead of the
                                // shared Archive icon. Falls back to Archive when
                                // none of the keywords match.
                                const lowerName = (pkg.name || '').toLowerCase();
                                let pkgEmoji = '';
                                if (lowerName.includes('birthday')) pkgEmoji = '🎂';
                                else if (lowerName.includes('wedding')) pkgEmoji = '👰';
                                else if (lowerName.includes('corporate') || lowerName.includes('business')) pkgEmoji = '💼';
                                else if (lowerName.includes('high tea') || lowerName.includes('kitty')) pkgEmoji = '🫖';
                                else if (lowerName.includes('royal') || lowerName.includes('elite')) pkgEmoji = '👑';
                                else if (lowerName.includes('platinum')) pkgEmoji = '💎';
                                else if (lowerName.includes('non-veg') || lowerName.includes('non veg')) pkgEmoji = '🍗';
                                else if (lowerName.includes('veg')) pkgEmoji = '🥗';
                                return (
                                <div key={pkg._id || pkg.id || index} className={`bg-white border border-gray-200 rounded-xl hover:shadow-md transition-shadow flex flex-col ${!pkg.status ? 'opacity-60' : ''}`}>
                                    {/* Card Header Section */}
                                    <div className="p-5 flex flex-col md:flex-row items-center justify-between gap-4">
                                        <div className="flex items-center gap-4 w-full md:w-auto">
                                            <div className="bg-gray-100 p-3 rounded-xl text-gray-500 w-[48px] h-[48px] flex items-center justify-center">
                                                {pkgEmoji ? (
                                                    <span className="text-[22px] leading-none">{pkgEmoji}</span>
                                                ) : (
                                                    <Archive size={24} />
                                                )}
                                            </div>
                                            <div>
                                                <div className="flex items-center gap-3 mb-1">
                                                    <h3 className="text-[16px] font-[700] text-[#1A181B]">{pkg.name}</h3>
                                                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${pkg.badgeColor}`}>
                                                        {pkg.badge}
                                                    </span>
                                                </div>
                                                <div className="flex items-center gap-4 text-[13px] text-gray-500">
                                                    <span className="font-semibold text-gray-600">{pkg.price}</span>
                                                    <span className="w-1 h-1 bg-gray-300 rounded-full"></span>
                                                    <span>Min: {pkg.minPeople} people</span>
                                                    <span className="w-1 h-1 bg-gray-300 rounded-full"></span>
                                                    <span>Max: {pkg.maxPeople} people</span>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-4 self-end md:self-center">
                                            <button
                                                onClick={() => setExpandedPackageId(expandedPackageId === pkg.id ? null : pkg.id)}
                                                className="text-gray-400 hover:text-gray-600 transition-colors">
                                                <ChevronDown size={20} className={`transition-transform duration-200 ${expandedPackageId === pkg.id ? 'rotate-180' : ''}`} />
                                            </button>
                                            <button
                                                onClick={() => {
                                                    setEditingPackage(pkg)
                                                    setIsAddPackageModalOpen(true)
                                                }}
                                                className="p-2 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-gray-600 transition-colors">
                                                <Edit2 size={18} />
                                            </button>
                                            <button
                                                onClick={() => {
                                                    setPackageToConfirm(pkg)
                                                    setPackageConfirmAction('delete')
                                                    setIsPackageConfirmModalOpen(true)
                                                }}
                                                className="p-2 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-red-500 transition-colors">
                                                <Trash2 size={18} />
                                            </button>
                                            <div
                                                onClick={() => {
                                                    setPackageToConfirm(pkg)
                                                    setPackageConfirmAction(pkg.status ? 'deactivate' : 'activate')
                                                    setIsPackageConfirmModalOpen(true)
                                                }}
                                                className={`w-12 h-6 bg-[#22C55E] rounded-full relative cursor-pointer transition-colors ${pkg.status ? 'bg-[#22C55E]' : 'bg-gray-300'}`}>
                                                <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow-sm transition-all ${pkg.status ? 'right-1' : 'left-1'}`}></div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Card Expanded Content */}
                                    {expandedPackageId === pkg.id && (
                                        <div className="px-5 pb-5 pt-2 border-t border-gray-100 animate-in slide-in-from-top-2 duration-200">
                                            <p className="text-[14px] text-gray-500 font-medium mb-6">{pkg.description}</p>

                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-6 mb-6">
                                                {/* Left Column */}
                                                <div>
                                                    <div className="mb-6">
                                                        <h4 className="text-[14px] font-[700] text-[#1A181B] mb-3">Starters ({pkg.starters?.length || 0})</h4>
                                                        <ul className="list-disc pl-5 space-y-1">
                                                            {pkg.starters?.map((item, i) => (
                                                                <li key={i} className="text-[13px] text-gray-500">{item.name}</li>
                                                            ))}
                                                        </ul>
                                                    </div>
                                                    <div>
                                                        <h4 className="text-[14px] font-[700] text-[#1A181B] mb-3">Desserts ({pkg.desserts?.length || 0})</h4>
                                                        <ul className="list-disc pl-5 space-y-1">
                                                            {pkg.desserts?.map((item, i) => (
                                                                <li key={i} className="text-[13px] text-gray-500">{item.name}</li>
                                                            ))}
                                                        </ul>
                                                    </div>
                                                </div>

                                                {/* Right Column */}
                                                <div>
                                                    <div className="mb-6">
                                                        <h4 className="text-[14px] font-[700] text-[#1A181B] mb-3">Main Course ({pkg.mainCourse?.length || 0})</h4>
                                                        <ul className="list-disc pl-5 space-y-1">
                                                            {pkg.mainCourse?.map((item, i) => (
                                                                <li key={i} className="text-[13px] text-gray-500">{item.name}</li>
                                                            ))}
                                                        </ul>
                                                    </div>
                                                    <div>
                                                        <h4 className="text-[14px] font-[700] text-[#1A181B] mb-3">Drinks ({pkg.drinks?.length || 0})</h4>
                                                        <ul className="list-disc pl-5 space-y-1">
                                                            {pkg.drinks?.map((item, i) => (
                                                                <li key={i} className="text-[13px] text-gray-500">{item.name}</li>
                                                            ))}
                                                        </ul>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Package Features Tags */}
                                            <div>
                                                <h4 className="text-[14px] font-[700] text-[#1A181B] mb-3">Package Features</h4>
                                                <div className="flex flex-wrap gap-2">
                                                    {pkg.features?.map((feature, i) => (
                                                        <span key={i} className="bg-[#E0F2FE] text-[#0284C7] px-3 py-1 rounded-full text-[12px] font-[600]">
                                                            {feature}
                                                        </span>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            )}

            {activeTab === 'Halls' && (
                // Halls Layout
                <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 mb-8">
                    {/* Halls Container */}
                    <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
                        {/* Header with Title & Add Button */}
                        <div className="mb-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                            <div>
                                <h2 className="text-[20px] font-[700] text-[#1A181B]">Hall Management</h2>
                                <p className="text-[14px] text-gray-500 font-[500]">Complete hall setup with all configurations</p>
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => setIsBulkAddHallOpen(true)}
                                    className="flex items-center gap-2 bg-white text-[#F97316] border border-[#F97316] px-4 py-2.5 rounded-xl font-[600] hover:bg-[#FFF3E6] transition-colors"
                                    title="Add many halls in one upload"
                                >
                                    <Upload size={18} />
                                    Bulk Add
                                </button>
                                <button
                                    onClick={() => {
                                        setEditingHall(null)
                                        setIsAddHallModalOpen(true)
                                    }}
                                    className="flex items-center gap-2 bg-[#F97316] text-white px-5 py-2.5 rounded-xl font-[600] hover:bg-[#EA580C] transition-colors shadow-sm"
                                >
                                    <Plus size={20} />
                                    Add New Hall
                                </button>
                            </div>
                        </div>

                        {/* Existing Halls Sub-header */}
                        <h3 className="text-[16px] font-[700] text-[#1A181B] mb-4">Existing Halls ({hallsData.length})</h3>

                        {/* Hall Cards */}
                        <div className="space-y-4">
                            {hallsData.map((hall, index) => (
                                <div key={hall._id || hall.id || index} className={`bg-white border border-gray-200 rounded-xl hover:shadow-md transition-shadow flex flex-col ${!hall.status ? 'opacity-60' : ''}`}>
                                    {/* Card Header */}
                                    <div className="p-5 flex flex-col items-start gap-4 w-full">
                                        <div className="w-full flex items-start justify-between gap-4">
                                            {/* Thumbnail — `image` is the single hero URL that getHalls
                                                derives from images[0]; falls back to a venue placeholder so
                                                a hall with no uploaded photo still renders cleanly. */}
                                            <img
                                                src={hall.image || hall.images?.[0] || 'https://images.unsplash.com/photo-1519167758481-83f550bb49b3?auto=format&fit=crop&q=80&w=400'}
                                                alt={hall.name}
                                                loading="lazy"
                                                onError={(e) => { e.currentTarget.src = 'https://images.unsplash.com/photo-1519167758481-83f550bb49b3?auto=format&fit=crop&q=80&w=400'; }}
                                                className="w-24 h-24 rounded-lg object-cover flex-shrink-0 bg-gray-100"
                                            />
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-3 mb-2 flex-wrap">
                                                    <h3 className="text-[16px] font-[700] text-[#1A181B]">{hall.name}</h3>
                                                    <div className="flex gap-2">
                                                        {hall.status && (
                                                            <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-[#DCFCE7] text-[#16A34A]">
                                                                Active
                                                            </span>
                                                        )}
                                                        {hall.badges && hall.badges.map((badge, i) => (
                                                            <span key={i} className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${getBadgeStyle(badge)}`}>
                                                                {badge}
                                                            </span>
                                                        ))}
                                                    </div>
                                                </div>
                                                <p className="text-[14px] text-gray-500 font-[500] mb-2">{hall.description}</p>
                                                <div className="flex items-center gap-4 text-[13px] text-gray-500">
                                                    <span className="font-semibold text-gray-600">{hall.price}</span>
                                                    <span>Min: {hall.minPeople} people</span>
                                                    <span>Max: {hall.maxPeople} people</span>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-4">
                                                <button
                                                    onClick={() => setExpandedHallId(expandedHallId === hall.id ? null : hall.id)}
                                                    className="p-2 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-gray-600 transition-colors">
                                                    <ChevronDown size={20} className={`transition-transform duration-200 ${expandedHallId === hall.id ? 'rotate-180' : ''}`} />
                                                </button>
                                                <button
                                                    onClick={() => {
                                                        setEditingHall(hall)
                                                        setIsAddHallModalOpen(true)
                                                    }}
                                                    className="p-2 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-gray-600 transition-colors">
                                                    <Edit2 size={18} />
                                                </button>
                                                <button
                                                    onClick={() => {
                                                        setHallToConfirm(hall)
                                                        setHallConfirmAction('delete')
                                                        setIsHallConfirmModalOpen(true)
                                                    }}
                                                    className="p-2 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-red-500 transition-colors">
                                                    <Trash2 size={18} />
                                                </button>
                                                <div
                                                    onClick={() => {
                                                        setHallToConfirm(hall)
                                                        setHallConfirmAction(hall.status ? 'deactivate' : 'activate')
                                                        setIsHallConfirmModalOpen(true)
                                                    }}
                                                    className={`w-12 h-6 rounded-full relative cursor-pointer transition-colors ${hall.status ? 'bg-[#22C55E]' : 'bg-gray-300'}`}>
                                                    <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow-sm transition-all ${hall.status ? 'right-1' : 'left-1'}`}></div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Expanded Details */}
                                    {expandedHallId === hall.id && (
                                        <div className="px-5 pb-5 pt-2 border-t border-gray-100 animate-in slide-in-from-top-2 duration-200">
                                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-12 gap-y-8 mt-4">
                                                {/* Left Column */}
                                                <div className="space-y-6">
                                                    {/* Features */}
                                                    <div>
                                                        <h4 className="text-[14px] font-[700] text-[#1A181B] mb-3">Features:</h4>
                                                        <div className="flex flex-wrap gap-2">
                                                            {hall.features?.map((f, i) => (
                                                                <span key={i} className="bg-[#FAE8FF] text-[#D946EF] text-[12px] font-[600] px-3 py-1 rounded-full">{f}</span>
                                                            ))}
                                                        </div>
                                                    </div>

                                                    {/* Audio/Visual */}
                                                    <div>
                                                        <h4 className="text-[14px] font-[700] text-[#1A181B] mb-3">Audio/Visual:</h4>
                                                        <ul className="list-disc pl-5 space-y-2">
                                                            {hall.audioVisual?.map((item, i) => (
                                                                <li key={i} className="text-[13px] text-gray-500 font-[500]">{item}</li>
                                                            ))}
                                                        </ul>
                                                    </div>

                                                    {/* Policies */}
                                                    <div>
                                                        <h4 className="text-[14px] font-[700] text-[#1A181B] mb-3">Policies:</h4>
                                                        <ul className="list-disc pl-5 space-y-2">
                                                            {hall.policies?.map((item, i) => (
                                                                <li key={i} className="text-[13px] text-gray-500 font-[500]">{item}</li>
                                                            ))}
                                                        </ul>
                                                    </div>
                                                </div>

                                                {/* Right Column */}
                                                <div className="space-y-6">
                                                    {/* Best For */}
                                                    <div>
                                                        <h4 className="text-[14px] font-[700] text-[#1A181B] mb-3">Best For:</h4>
                                                        <div className="flex flex-wrap gap-2">
                                                            {hall.bestFor?.map((b, i) => (
                                                                <span key={i} className="bg-orange-50 text-[#F97316] px-3 py-1 rounded-full text-[12px] font-[600]">{b}</span>
                                                            ))}
                                                        </div>
                                                    </div>

                                                    {/* Infrastructure */}
                                                    <div>
                                                        <h4 className="text-[14px] font-[700] text-[#1A181B] mb-3">Infrastructure:</h4>
                                                        <ul className="list-disc pl-5 space-y-2">
                                                            {hall.infrastructure?.map((item, i) => (
                                                                <li key={i} className="text-[13px] text-gray-500 font-[500]">{item}</li>
                                                            ))}
                                                        </ul>
                                                    </div>

                                                    {/* Contact */}
                                                    <div>
                                                        <h4 className="text-[14px] font-[700] text-[#1A181B] mb-3">Contact:</h4>
                                                        <div className="flex flex-col gap-1">
                                                            <span className="text-[13px] text-gray-500 font-[500]">{hall.contact?.name}</span>
                                                            <span className="text-[13px] text-gray-500 font-[500]">{hall.contact?.phone}</span>
                                                            <span className="text-[13px] text-gray-500 font-[500]">{hall.contact?.email}</span>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Images Area (Spans full width at bottom) */}
                                            <div className="mt-8">
                                                <h4 className="text-[14px] font-[700] text-[#1A181B] mb-3">Images (Max 5 images):</h4>
                                                <div className="flex flex-wrap gap-4">
                                                    {/* Upload Placeholder */}
                                                    <div className="w-[180px] h-[180px] border-2 border-dashed border-gray-200 rounded-xl flex flex-col items-center justify-center cursor-pointer hover:bg-gray-50 transition-colors">
                                                        <svg className="w-6 h-6 text-gray-400 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                                                        </svg>
                                                        <span className="text-[12px] font-[600] text-gray-500 text-center px-4">Click to upload or drag and drop</span>
                                                        <span className="text-[10px] text-gray-400 mt-1">PNG, JPG up to 5MB</span>
                                                    </div>

                                                    {/* Existing Images Thumbnails */}
                                                    {hall.images?.map((img, i) => (
                                                        <div key={i} className="w-[180px] h-[180px] rounded-xl relative group overflow-hidden">
                                                            <img src={img} alt={`Hall image ${i + 1}`} className="w-full h-full object-cover" />
                                                            <button className="absolute top-2 right-2 bg-white rounded-full p-1 text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity shadow-sm">
                                                                <XCircle size={16} />
                                                            </button>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {activeTab === 'Decorations' && (
                // Decorations Layout
                <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 mb-8">
                    {/* Decorations Container */}
                    <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
                        {/* Header with Title & Add Button */}
                        <div className="mb-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                            <div>
                                <h2 className="text-[20px] font-[700] text-[#1A181B]">Decoration Package Management</h2>
                                <p className="text-[14px] text-gray-500 font-[500]">Create and manage comprehensive decoration packages</p>
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => setIsBulkAddDecorationOpen(true)}
                                    className="flex items-center gap-2 bg-white text-[#F97316] border border-[#F97316] px-4 py-2.5 rounded-xl font-[600] hover:bg-[#FFF3E6] transition-colors"
                                    title="Add many decoration packages in one upload"
                                >
                                    <Upload size={18} />
                                    Bulk Add
                                </button>
                                <button
                                    onClick={() => {
                                        setEditingDecoration(null)
                                        setIsAddDecorationModalOpen(true)
                                    }}
                                    className="flex items-center gap-2 bg-[#F97316] text-white px-5 py-2.5 rounded-xl font-[600] hover:bg-[#EA580C] transition-colors shadow-sm"
                                >
                                    <Plus size={20} />
                                    Add Decoration Package
                                </button>
                            </div>
                        </div>

                        {/* Existing Decoration Packages Sub-header */}
                        <h3 className="text-[16px] font-[700] text-[#1A181B] mb-4">Existing Decoration Packages ({decorationsData.length})</h3>

                        {/* Decoration Cards */}
                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                            {decorationsData.map((deco, index) => (
                                <div key={deco._id || deco.id || index} className="bg-white border border-gray-200 rounded-xl overflow-hidden hover:shadow-md transition-shadow">
                                    {/* Image */}
                                    <div className="w-full h-[200px] overflow-hidden">
                                        <img
                                            src={deco.images?.[0] || deco.image || '/decoration-placeholder.png'}
                                            alt={deco.name}
                                            className="w-full h-full object-cover"
                                        />
                                    </div>

                                    {/* Card Content */}
                                    <div className="p-4">
                                        {/* Title Row with Actions */}
                                        <div className="flex items-center justify-between mb-2">
                                            <h3 className="text-[15px] font-[700] text-[#1A181B] truncate" title={deco.name}>{deco.name}</h3>
                                            <div className="flex items-center gap-2">
                                                {(deco.featured || deco.isFeatured) && (
                                                    <Star size={16} className="text-[#F59E0B] fill-[#F59E0B]" />
                                                )}
                                                <button
                                                    onClick={() => {
                                                        setEditingDecoration(deco)
                                                        setIsAddDecorationModalOpen(true)
                                                    }}
                                                    className="text-gray-400 hover:text-gray-600 transition-colors">
                                                    <Edit2 size={16} />
                                                </button>
                                                <button
                                                    onClick={() => {
                                                        setDecorationToConfirm(deco)
                                                        setDecorationConfirmAction('delete')
                                                        setIsDecorationConfirmModalOpen(true)
                                                    }}
                                                    className="text-gray-400 hover:text-red-500 transition-colors">
                                                    <Trash2 size={16} />
                                                </button>
                                                <div
                                                    onClick={() => {
                                                        setDecorationToConfirm(deco)
                                                        setDecorationConfirmAction(deco.isActive ? 'deactivate' : 'activate')
                                                        setIsDecorationConfirmModalOpen(true)
                                                    }}
                                                    className={`w-10 h-5 rounded-full relative cursor-pointer transition-colors ${deco.isActive ? 'bg-[#22C55E]' : 'bg-gray-300'}`}>
                                                    <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow-sm transition-all ${deco.isActive ? 'right-0.5' : 'left-0.5'}`}></div>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Tag */}
                                        <div className="mb-2">
                                            <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${deco.tagColor}`}>
                                                {deco.tag}
                                            </span>
                                        </div>

                                        {/* Description */}
                                        <p className="text-[12px] text-gray-400 mb-3 line-clamp-2">{deco.description}</p>

                                        {/* Setup & Team */}
                                        <div className="flex items-center gap-4 text-[12px] text-gray-500">
                                            <span>Setup: {deco.setupTime}</span>
                                            <span>Team: {deco.teamSize}</span>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            <BookingDetailsModal
                isOpen={isDrawerOpen}
                onClose={() => setIsDrawerOpen(false)}
                booking={selectedBooking}
                eventTypes={eventTypesData}
                onApprove={(booking) => {
                    setIsDrawerOpen(false); // Close details modal when opening confirm modal from it
                    handleOpenConfirm(booking, 'Approve');
                }}
                onReject={(booking) => {
                    setIsDrawerOpen(false);
                    handleOpenConfirm(booking, 'Reject');
                }}
            />
            <ConfirmActionModal
                isOpen={isConfirmModalOpen}
                onClose={() => setIsConfirmModalOpen(false)}
                onConfirm={executeConfirmAction}
                actionType={confirmActionType}
            />

            <ConfirmActionModal
                isOpen={isTypeConfirmModalOpen}
                onClose={() => setIsTypeConfirmModalOpen(false)}
                onConfirm={executeTypeConfirmAction}
                actionType="Generic"
                title={
                    typeConfirmAction === 'delete' ? 'Delete Event Type' :
                        typeConfirmAction === 'activate' ? 'Activate Event Type' : 'Deactivate Event Type'
                }
                description={
                    typeConfirmAction === 'delete' ? 'Are you sure you want to delete this event type? This action cannot be undone.' :
                        typeConfirmAction === 'activate' ? 'This event type will be available for customers to select.' : 'This event type will no longer be available for customers to select.'
                }
            />

            <ConfirmActionModal
                isOpen={isPackageConfirmModalOpen}
                onClose={() => setIsPackageConfirmModalOpen(false)}
                onConfirm={executePackageConfirmAction}
                actionType="Generic"
                title={
                    packageConfirmAction === 'delete' ? 'Delete Package' :
                        packageConfirmAction === 'activate' ? 'Activate Package' : 'Deactivate Package'
                }
                description={
                    packageConfirmAction === 'delete' ? 'Are you sure you want to delete this package? This action cannot be undone.' :
                        packageConfirmAction === 'activate' ? 'This package will be available for customers to select.' : 'This package will no longer be available for customers to select.'
                }
            />

            <ConfirmActionModal
                isOpen={isHallConfirmModalOpen}
                onClose={() => setIsHallConfirmModalOpen(false)}
                onConfirm={executeHallConfirmAction}
                actionType="Generic"
                title={
                    hallConfirmAction === 'delete' ? 'Delete Hall' :
                        hallConfirmAction === 'activate' ? 'Activate Hall' : 'Deactivate Hall'
                }
                description={
                    hallConfirmAction === 'delete' ? 'Are you sure you want to delete this hall? This action cannot be undone.' :
                        hallConfirmAction === 'activate' ? 'This hall will be visible and available for bookings.' : 'This hall will be hidden and no longer available for bookings.'
                }
            />

            <ConfirmActionModal
                isOpen={isDecorationConfirmModalOpen}
                onClose={() => setIsDecorationConfirmModalOpen(false)}
                onConfirm={executeDecorationConfirmAction}
                actionType="Generic"
                title={
                    decorationConfirmAction === 'delete' ? 'Delete Decoration Package' :
                        decorationConfirmAction === 'activate' ? 'Activate Decoration Package' : 'Deactivate Decoration Package'
                }
                description={
                    decorationConfirmAction === 'delete' ? 'Are you sure you want to delete this decoration package? This action cannot be undone.' :
                        decorationConfirmAction === 'activate' ? 'This decoration package will be visible and available for bookings.' : 'This decoration package will be hidden and no longer available for bookings.'
                }
            />

            {/* Add Event Type Modal */}
            <AddEventTypeModal
                isOpen={isAddEventTypeModalOpen}
                onClose={() => {
                    setIsAddEventTypeModalOpen(false)
                    setEditingEventType(null)
                }}
                onSave={handleSaveEventType}
                eventType={editingEventType}
            />
            {/* Add Package Modal */}
            <AddPackageModal
                isOpen={isAddPackageModalOpen}
                onClose={() => {
                    setIsAddPackageModalOpen(false)
                    setEditingPackage(null)
                }}
                onSave={handleSavePackage}
                packageData={editingPackage}
            />
            {/* Add Hall Modal */}
            <AddHallModal
                isOpen={isAddHallModalOpen}
                onClose={() => {
                    setIsAddHallModalOpen(false)
                    setEditingHall(null)
                }}
                onSave={handleSaveHall}
                hallData={editingHall}
            />
            {/* Add Decoration Package Modal */}
            <AddDecorationPackageModal
                isOpen={isAddDecorationModalOpen}
                onClose={() => {
                    setIsAddDecorationModalOpen(false)
                    setEditingDecoration(null)
                }}
                onSave={handleSaveDecoration}
                packageData={editingDecoration}
            />

            {/* ── Bulk Add modals — one per section ──────────────────────────
                All four use the shared BulkAddCsvModal driven by props. Each
                onSuccess re-fetches that section's list and rewrites local
                state with the same transform the initial useEffect uses,
                so the new rows appear immediately. */}
            {isBulkAddEventTypeOpen && (
                <BulkAddCsvModal
                    entityLabel={{ singular: 'event type', plural: 'event types' }}
                    templateEndpoint="/booking-info/event-types/template"
                    importEndpoint="/booking-info/event-types/import"
                    templateFilename="eventType-master-template.csv"
                    columnsHelp={
                        <>
                            Required: <span className="font-mono text-[#344054]">title</span>.
                            Optional: <span className="font-mono text-[#344054]">description, guests</span> (e.g. <span className="font-mono">10-200</span>).
                        </>
                    }
                    onClose={() => setIsBulkAddEventTypeOpen(false)}
                    onSuccess={async () => {
                        try {
                            const r = await api.get('/booking-info/event-types')
                            if (r.data.success) {
                                setEventTypesData(r.data.eventTypes.map(e => ({
                                    id: e._id,
                                    title: e.title,
                                    description: e.description,
                                    guests: e.guests,
                                    icon: e.icon,
                                    color: e.color,
                                    iconColor: e.iconColor,
                                    services: e.services,
                                    tags: e.tags,
                                    status: e.isActive,
                                })))
                            }
                        } catch { /* ignore — modal still shows results */ }
                    }}
                />
            )}

            {isBulkAddPackageOpen && (
                <BulkAddCsvModal
                    entityLabel={{ singular: 'package', plural: 'packages' }}
                    templateEndpoint="/booking-info/packages/template"
                    importEndpoint="/booking-info/packages/import"
                    templateFilename="package-master-template.csv"
                    columnsHelp={
                        <>
                            Required: <span className="font-mono text-[#344054]">name, price</span>.
                            Optional: <span className="font-mono text-[#344054]">category</span> (All / Classic / Royal / Gold / Elite), <span className="font-mono text-[#344054]">description, minPeople, maxPeople</span>.
                        </>
                    }
                    onClose={() => setIsBulkAddPackageOpen(false)}
                    onSuccess={async () => {
                        try {
                            const r = await api.get('/booking-info/packages')
                            if (r.data.success) {
                                setAllPackages(r.data.packages.map(p => ({ ...p, status: p.status ?? p.isActive })))
                            }
                        } catch { /* ignore */ }
                    }}
                />
            )}

            {isBulkAddHallOpen && (
                <BulkAddCsvModal
                    entityLabel={{ singular: 'hall', plural: 'halls' }}
                    templateEndpoint="/halls/template"
                    importEndpoint="/halls/import"
                    templateFilename="hall-master-template.csv"
                    columnsHelp={
                        <>
                            Required: <span className="font-mono text-[#344054]">name, type, maxCapacity, basePrice</span>.
                            <br />
                            <span className="font-mono text-[#344054]">type</span> must be one of: Banquet Hall / Auditorium / Conference Room / Outdoor Space.
                            <br />
                            Optional: <span className="font-mono text-[#344054]">minCapacity, description, floorLevel</span>.
                        </>
                    }
                    onClose={() => setIsBulkAddHallOpen(false)}
                    onSuccess={async () => {
                        try {
                            const r = await api.get('/halls')
                            if (r.data.success) {
                                setHallsData(r.data.halls.map(h => ({ ...h, status: h.status ?? h.isActive })))
                            }
                        } catch { /* ignore */ }
                    }}
                />
            )}

            {isBulkAddDecorationOpen && (
                <BulkAddCsvModal
                    entityLabel={{ singular: 'decoration package', plural: 'decoration packages' }}
                    templateEndpoint="/decoration-packages/template"
                    importEndpoint="/decoration-packages/import"
                    templateFilename="decorationPackage-master-template.csv"
                    columnsHelp={
                        <>
                            Required: <span className="font-mono text-[#344054]">name, category, basePrice</span>.
                            Optional: <span className="font-mono text-[#344054]">description, themeStyle, setupTime</span>.
                            <br />
                            Common categories: Wedding, Birthday, Anniversary, Corporate, Cocktail, Festival.
                        </>
                    }
                    onClose={() => setIsBulkAddDecorationOpen(false)}
                    onSuccess={async () => {
                        try {
                            const r = await api.get('/decoration-packages')
                            if (r.data.success) {
                                setDecorationsData(r.data.packages || r.data.decorPackages || [])
                            }
                        } catch { /* ignore */ }
                    }}
                />
            )}
        </div>
    )
}

export default Bookings
