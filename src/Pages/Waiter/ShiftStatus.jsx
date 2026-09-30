import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, Clock, LogIn, LogOut, Loader2, Timer, X } from 'lucide-react';
import { shiftAPI } from '../../utils/api';
import toast from 'react-hot-toast';

const ShiftStatus = () => {
    const navigate = useNavigate();
    const [loading, setLoading] = useState(true);
    const [processing, setProcessing] = useState(false);
    const [activeShift, setActiveShift] = useState(null);
    const [stats, setStats] = useState({ todayShifts: 0, todayHours: 0, weeklyHours: 0, totalShifts: 0 });
    const [shifts, setShifts] = useState([]);
    const [elapsed, setElapsed] = useState('00:00:00');
    const [noteModalOpen, setNoteModalOpen] = useState(false);
    const [clockOutNote, setClockOutNote] = useState('');

    useEffect(() => {
        fetchShifts();
    }, []);

    // Live elapsed timer for active shift
    useEffect(() => {
        if (!activeShift) { setElapsed('00:00:00'); return; }
        const tick = () => {
            const diff = Date.now() - new Date(activeShift.clockIn).getTime();
            const h = Math.floor(diff / 3600000);
            const m = Math.floor((diff % 3600000) / 60000);
            const s = Math.floor((diff % 60000) / 1000);
            setElapsed(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`);
        };
        tick();
        const interval = setInterval(tick, 1000);
        return () => clearInterval(interval);
    }, [activeShift]);

    const fetchShifts = async () => {
        try {
            const res = await shiftAPI.getMyShifts();
            if (res.data?.success) {
                setActiveShift(res.data.activeShift);
                setStats(res.data.stats);
                setShifts(res.data.shifts || []);
            }
        } catch (err) {
            console.error('Failed to fetch shifts:', err);
        } finally {
            setLoading(false);
        }
    };

    const handleClockIn = async () => {
        setProcessing(true);
        try {
            const res = await shiftAPI.clockIn();
            if (res.data?.success) {
                toast.success('Clocked in!');
                fetchShifts();
            }
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to clock in');
        } finally {
            setProcessing(false);
        }
    };

    const openClockOutDialog = () => {
        setClockOutNote('');
        setNoteModalOpen(true);
    };

    const confirmClockOut = async () => {
        setProcessing(true);
        try {
            const res = await shiftAPI.clockOut(clockOutNote.trim());
            if (res.data?.success) {
                toast.success('Clocked out!');
                setNoteModalOpen(false);
                setClockOutNote('');
                fetchShifts();
            }
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to clock out');
        } finally {
            setProcessing(false);
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-orange-500" />
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-[#FBFBFF] pb-10">
            <div className="max-w-3xl mx-auto">
                {/* Header */}
                <header className="px-4 sm:px-6 pt-6 pb-4 flex items-center gap-3 bg-white/95 backdrop-blur sticky top-0 z-10 shadow-sm">
                    <button
                        onClick={() => navigate(-1)}
                        aria-label="Back"
                        className="w-11 h-11 rounded-xl text-gray-600 hover:text-gray-900 hover:bg-gray-50 flex items-center justify-center transition shrink-0"
                    >
                        <ChevronLeft size={24} />
                    </button>
                    <h1 className="text-xl sm:text-2xl font-bold text-[#1A181B] tracking-tight">Shift Status</h1>
                </header>

                <main className="px-4 sm:px-6 py-5 space-y-4">
                    {/* Active Shift Card */}
                    <div className={`rounded-3xl p-6 sm:p-8 text-center shadow-sm ${activeShift ? 'bg-[#702083]' : 'bg-white border border-gray-200'}`}>
                        <div className={`text-sm font-medium mb-2 uppercase tracking-wider ${activeShift ? 'text-[#D4A5DF]' : 'text-gray-500'}`}>
                            {activeShift ? 'Currently On Shift' : 'Not On Shift'}
                        </div>
                        <div className={`text-5xl sm:text-6xl font-extrabold tracking-wider mb-3 tabular-nums ${activeShift ? 'text-white' : 'text-gray-300'}`}>
                            {elapsed}
                        </div>
                        {activeShift && (
                            <div className="text-xs text-[#D4A5DF]">
                                Started at {new Date(activeShift.clockIn).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                            </div>
                        )}

                        <button
                            onClick={activeShift ? openClockOutDialog : handleClockIn}
                            disabled={processing}
                            className={`mt-5 w-full min-h-14 rounded-2xl px-4 text-base font-bold flex items-center justify-center gap-2 transition-all active:scale-[0.98] ${
                                processing ? 'bg-gray-300 cursor-not-allowed text-gray-500'
                                : activeShift ? 'bg-white text-[#FF3B30] hover:bg-red-50'
                                : 'bg-[#FE8301] text-white hover:bg-orange-600'
                            }`}
                        >
                            {activeShift ? <LogOut size={18} /> : <LogIn size={18} />}
                            {processing ? 'Processing…' : activeShift ? 'Clock Out' : 'Clock In'}
                        </button>
                    </div>

                    {/* Stats Grid */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
                        <div className="bg-white px-3 py-4 rounded-2xl border border-gray-200 shadow-[0_1px_3px_rgba(0,0,0,0.03)]">
                            <span className="text-[11px] sm:text-xs font-bold text-gray-500 uppercase tracking-wider">Today's Shifts</span>
                            <p className="text-2xl font-extrabold text-[#702083] mt-2 tabular-nums">{stats.todayShifts}</p>
                        </div>
                        <div className="bg-white px-3 py-4 rounded-2xl border border-gray-200 shadow-[0_1px_3px_rgba(0,0,0,0.03)]">
                            <span className="text-[11px] sm:text-xs font-bold text-gray-500 uppercase tracking-wider">Today's Hours</span>
                            <p className="text-2xl font-extrabold text-[#702083] mt-2 tabular-nums">{stats.todayHours.toFixed(1)}h</p>
                        </div>
                        <div className="bg-white px-3 py-4 rounded-2xl border border-gray-200 shadow-[0_1px_3px_rgba(0,0,0,0.03)]">
                            <span className="text-[11px] sm:text-xs font-bold text-gray-500 uppercase tracking-wider">Weekly Hours</span>
                            <p className="text-2xl font-extrabold text-[#702083] mt-2 tabular-nums">{stats.weeklyHours.toFixed(1)}h</p>
                        </div>
                        <div className="bg-white px-3 py-4 rounded-2xl border border-gray-200 shadow-[0_1px_3px_rgba(0,0,0,0.03)]">
                            <span className="text-[11px] sm:text-xs font-bold text-gray-500 uppercase tracking-wider">Total Shifts</span>
                            <p className="text-2xl font-extrabold text-[#702083] mt-2 tabular-nums">{stats.totalShifts}</p>
                        </div>
                    </div>

                {/* Recent Shifts */}
                <div className="bg-white rounded-2xl border border-gray-100 p-4 sm:p-5 shadow-sm">
                    <h2 className="text-lg sm:text-xl font-bold text-[#1A181B] mb-3">Recent Shifts</h2>
                    {shifts.filter(s => s.status !== 'active').length === 0 ? (
                        <p className="text-gray-400 text-center py-8">No shift history yet</p>
                    ) : (
                        <div className="space-y-2">
                            {shifts.filter(s => s.status !== 'active').slice(0, 10).map((shift, idx) => (
                                <div key={shift._id || idx} className="py-[10px] border-b border-[#F5F5F5] last:border-0">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-3 min-w-0">
                                            <div className="p-[8px] bg-[#F3E8F9] rounded-[10px] shrink-0">
                                                <Timer size={18} className="text-[#702083]" />
                                            </div>
                                            <div className="min-w-0">
                                                <p className="text-[14px] font-[600] text-[#1A181B]">{shift.date}</p>
                                                <p className="text-[12px] text-[#8D848F]">{shift.inTime} — {shift.outTime || '—'}</p>
                                            </div>
                                        </div>
                                        <div className="text-right shrink-0">
                                            <p className="text-[14px] font-[700] text-[#702083]">{shift.totalHours}h</p>
                                            <span className={`text-[10px] font-bold px-[6px] py-[2px] rounded-[6px] ${
                                                shift.status === 'completed' ? 'bg-[#E8F5E9] text-[#22C55E]' : 'bg-[#FFEBEE] text-[#FF3B30]'
                                            }`}>
                                                {shift.status}
                                            </span>
                                        </div>
                                    </div>
                                    {shift.note && (
                                        <p className="mt-1.5 ml-[44px] text-[12px] text-[#645E66] italic line-clamp-2">
                                            “{shift.note}”
                                        </p>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
                </main>
            </div>

            {/* Clock-out note modal */}
            {noteModalOpen && (
                <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-4">
                    <div className="bg-white w-full max-w-md rounded-3xl p-5 shadow-xl">
                        <div className="flex items-center justify-between mb-3">
                            <h3 className="text-[18px] font-bold text-[#1A181B]">End Shift</h3>
                            <button
                                onClick={() => !processing && setNoteModalOpen(false)}
                                className="p-1 rounded-full hover:bg-gray-100"
                                aria-label="Close"
                            >
                                <X size={20} className="text-[#645E66]" />
                            </button>
                        </div>
                        <p className="text-[13px] text-[#645E66] mb-3">
                            Add an optional note (handover, issues, totals).
                        </p>
                        <textarea
                            value={clockOutNote}
                            onChange={(e) => setClockOutNote(e.target.value)}
                            maxLength={500}
                            rows={4}
                            placeholder="Optional note…"
                            className="w-full rounded-xl border border-[#CCCAC8] p-3 text-[14px] text-[#1A181B] focus:outline-none focus:ring-2 focus:ring-[#702083] resize-none"
                        />
                        <div className="text-right text-[11px] text-[#8D848F] mt-1 mb-3">
                            {clockOutNote.length}/500
                        </div>
                        <div className="flex gap-3">
                            <button
                                onClick={() => setNoteModalOpen(false)}
                                disabled={processing}
                                className="flex-1 rounded-xl py-3 text-[14px] font-semibold border border-[#CCCAC8] text-[#1A181B] active:scale-[0.98] disabled:opacity-50"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={confirmClockOut}
                                disabled={processing}
                                className="flex-1 rounded-xl py-3 text-[14px] font-semibold bg-[#FF3B30] text-white active:scale-[0.98] disabled:opacity-50"
                            >
                                {processing ? 'Ending…' : 'Confirm Clock Out'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ShiftStatus;
