import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Printer, CheckCircle2, ChefHat, Clock } from 'lucide-react';
import api from '../../utils/api';
import {
    readLastOrder,
    clearLastOrder,
    clearKioskSession,
    readTrackingToken,
    clearTrackingToken,
} from './kioskState';

const COLORS = ['#E53935', '#43A047', '#FFB300', '#1E88E5', '#9C27B0', '#00ACC1', '#F06292'];
// 90s gives a customer enough time to read their token, print, and walk
// away comfortably. Operator can also tap "Done" to clear immediately.
const RESET_COUNTDOWN_SECONDS = 90;
// Poll the kiosk-tracking endpoint every 5s until status flips to a
// terminal state (served / cancelled). Cheap enough — this screen
// shows ONE order at a time and the kiosk is a low-traffic device.
const STATUS_POLL_INTERVAL_MS = 5000;
const TERMINAL_STATUSES = new Set(['served', 'cancelled']);

function createPiece(originX, originY) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 4 + Math.random() * 8;
    const isRibbon = Math.random() > 0.35;
    return {
        x: originX,
        y: originY,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 3,
        gravity: 0.06 + Math.random() * 0.04,
        drag: 0.985,
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
        alpha: 1,
        fadeDelay: 180 + Math.random() * 60,
        frame: 0,
        isRibbon,
        length: isRibbon ? 30 + Math.random() * 60 : 0,
        width: isRibbon ? 2.5 + Math.random() * 2 : 6 + Math.random() * 6,
        height: isRibbon ? 0 : 4 + Math.random() * 5,
        rotation: Math.random() * Math.PI * 2,
        rotSpeed: (Math.random() - 0.5) * 0.08,
        waveAmp: 1 + Math.random() * 2.5,
        waveFreq: 0.04 + Math.random() * 0.03,
        wavePhase: Math.random() * Math.PI * 2,
        trail: [],
    };
}

// Derive a short customer-facing token from the backend orderId.
// Backend orderIds look like:
//   ORD-260424-A3X2K9 (dine-in), ORT-260424-A3X2K9 (takeaway),
//   KSK-260424-Z4Y8L2 (kiosk).
// The last segment is a 6-char short-UID, unique per day per prefix.
// We show the final 4 chars uppercased; the leading letter mirrors the
// order's origin so staff and customers can tell apart at a glance:
//   K… = kiosk     T… = takeaway / dine-in (existing default)
function tokenFromOrderId(orderId) {
    if (!orderId) return 'T000';
    const raw = String(orderId);
    const parts = raw.split('-');
    const tail = parts[parts.length - 1] || raw;
    const prefix = raw.startsWith('KSK') ? 'K' : 'T';
    return `${prefix}${tail.slice(-4).toUpperCase()}`;
}

// Map a backend order.status to a human-friendly progress card so the
// customer can see what's actually happening to their food without
// staring at a hardcoded "15-20 mins" estimate.
function statusToCard(status) {
    switch (status) {
        case 'preparing':
            return { label: 'In the kitchen',     hint: 'Your food is being prepared',  Icon: ChefHat,      tint: '#F48F1B' };
        case 'ready':
            return { label: 'Ready for pickup',   hint: 'Please collect at the counter', Icon: CheckCircle2, tint: '#34C759' };
        case 'served':
            return { label: 'Served — enjoy!',    hint: 'Thanks for visiting',          Icon: CheckCircle2, tint: '#34C759' };
        case 'cancelled':
            return { label: 'Order cancelled',    hint: 'Please speak to staff',        Icon: Clock,        tint: '#EF4444' };
        case 'new':
        default:
            return { label: 'Order received',     hint: 'Estimated 15–20 mins',          Icon: Clock,        tint: '#3B82F6' };
    }
}

export default function OrderToken() {
    const navigate = useNavigate();
    const canvasRef = useRef(null);
    const animRef = useRef(null);
    const piecesRef = useRef([]);
    const [countdown, setCountdown] = useState(RESET_COUNTDOWN_SECONDS);
    const [order, setOrder] = useState(() => readLastOrder());
    // Live status — seeded from the order blob written by PayOption,
    // refreshed by the polling effect below.
    const [liveStatus, setLiveStatus] = useState(() => readLastOrder()?.status || 'new');
    // Live total — same idea as liveStatus but for the paid amount. If
    // a previous order's stale blob is left in localStorage (or PayOption
    // wrote the cart's pre-tax subtotal as `total`), the on-screen
    // "Total Paid" would mismatch what was actually charged. The poll
    // below refreshes this from the server's authoritative figure.
    const [liveTotal, setLiveTotal] = useState(() => readLastOrder()?.total || 0);

    const handleDone = () => {
        clearLastOrder();
        clearTrackingToken();
        clearKioskSession();
        navigate('/kiosk', { replace: true });
    };

    // Guard against deep-linking / refresh after the blob was cleared.
    useEffect(() => {
        if (!order) navigate('/kiosk', { replace: true });
    }, [order, navigate]);

    // Poll backend for the real status. Stops on terminal status, on
    // unmount, or when the tracking token is missing (legacy orders
    // pre-this-change). 5s cadence keeps the kitchen badge fresh
    // without hammering the API.
    useEffect(() => {
        if (!order?.orderId) return;
        const token = readTrackingToken();
        if (!token) return;

        let cancelled = false;
        const poll = async () => {
            try {
                const { data } = await api.get(`/orders/track/${order.orderId}`, {
                    headers: { 'X-Kiosk-Token': token },
                });
                if (cancelled) return;
                if (data?.success && data.order?.status) {
                    setLiveStatus(data.order.status);
                    if (Number.isFinite(Number(data.order.total))) {
                        setLiveTotal(Number(data.order.total));
                    }
                    if (TERMINAL_STATUSES.has(data.order.status)) {
                        clearInterval(handle);
                    }
                }
            } catch {
                // Network blip — keep polling. The token has a 2h TTL so
                // even after long outages we eventually catch up.
            }
        };

        poll();
        const handle = setInterval(poll, STATUS_POLL_INTERVAL_MS);
        return () => { cancelled = true; clearInterval(handle); };
    }, [order]);

    // Confetti blast
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const resize = () => {
            canvas.width = canvas.offsetWidth;
            canvas.height = canvas.offsetHeight;
        };
        resize();
        window.addEventListener('resize', resize);
        const ox = canvas.width / 2;
        const oy = canvas.height * 0.35;
        piecesRef.current = Array.from({ length: 90 }, () => createPiece(ox, oy));

        const ctx = canvas.getContext('2d');
        const draw = () => {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            piecesRef.current = piecesRef.current.filter(p => p.alpha > 0.01);
            piecesRef.current.forEach(p => {
                p.frame++;
                p.vy += p.gravity;
                p.vx *= p.drag;
                p.vy *= p.drag;
                const wave = Math.sin(p.frame * p.waveFreq + p.wavePhase) * p.waveAmp;
                p.x += p.vx + wave;
                p.y += p.vy;
                p.rotation += p.rotSpeed;
                if (p.frame > p.fadeDelay) p.alpha -= 0.006;

                if (p.isRibbon) {
                    p.trail.push({ x: p.x, y: p.y });
                    if (p.trail.length > Math.floor(p.length / 2)) p.trail.shift();
                    if (p.trail.length > 1) {
                        ctx.save();
                        ctx.globalAlpha = p.alpha;
                        ctx.strokeStyle = p.color;
                        ctx.lineWidth = p.width;
                        ctx.lineCap = 'round';
                        ctx.lineJoin = 'round';
                        ctx.beginPath();
                        ctx.moveTo(p.trail[0].x, p.trail[0].y);
                        for (let i = 1; i < p.trail.length; i++) {
                            const mx = (p.trail[i - 1].x + p.trail[i].x) / 2;
                            const my = (p.trail[i - 1].y + p.trail[i].y) / 2;
                            ctx.quadraticCurveTo(p.trail[i - 1].x, p.trail[i - 1].y, mx, my);
                        }
                        ctx.stroke();
                        ctx.restore();
                    }
                } else {
                    ctx.save();
                    ctx.globalAlpha = p.alpha;
                    ctx.fillStyle = p.color;
                    ctx.translate(p.x, p.y);
                    ctx.rotate(p.rotation);
                    ctx.fillRect(-p.width / 2, -p.height / 2, p.width, p.height);
                    ctx.restore();
                }
            });
            animRef.current = requestAnimationFrame(draw);
        };
        animRef.current = requestAnimationFrame(draw);
        return () => {
            cancelAnimationFrame(animRef.current);
            window.removeEventListener('resize', resize);
        };
    }, []);

    // Auto-reset: after the countdown expires, clear kiosk session and
    // bounce back to the landing for the next customer. Pause whenever
    // the order is ready — the customer is actively walking up to the
    // counter and we don't want the screen to reset out from under them.
    useEffect(() => {
        if (liveStatus === 'ready') return;
        if (countdown <= 0) {
            handleDone();
            return;
        }
        const t = setInterval(() => setCountdown(c => c - 1), 1000);
        return () => clearInterval(t);
        // handleDone is stable enough — only liveStatus drives pausing.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [countdown, liveStatus]);

    const fmt = (s) => {
        const m = Math.floor(s / 60);
        const sec = s % 60;
        return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
    };

    if (!order) return null;

    const tokenNumber = tokenFromOrderId(order.orderId);
    const orderType = order.orderType || 'Takeaway';
    const statusCard = statusToCard(liveStatus);
    const StatusIcon = statusCard.Icon;

    return (
        <div className="min-h-screen bg-[#FFF4E3] flex flex-col items-center justify-center font-['Outfit'] px-[152px] py-[60px] gap-6 overflow-hidden relative">
            <div className="bg-white rounded-[32px] w-full shadow-2xl relative overflow-hidden">

                <canvas
                    ref={canvasRef}
                    className="absolute inset-0 w-full h-full pointer-events-none z-30"
                />

                <div className="relative w-full flex items-center justify-center" style={{ paddingTop: '140px' }}>
                    <div className="w-[100px] h-[100px] bg-white rounded-full z-10 shadow-xl flex items-center justify-center p-4">
                        <img src="/kiosk/icons/logo.svg" alt="Logo" className="w-full h-full object-contain" />
                    </div>
                </div>

                <div className="relative z-10 px-[40px] pb-[40px] flex flex-col items-center">
                    <h1 className="text-[44px] font-bold font-nunito text-[#101828] mt-6 mb-1">Order Confirmed!</h1>
                    <p className="text-[22px] font-regular font-varela text-[#6B7280] mb-8">Thank you for your order</p>

                    <div className="flex gap-4 w-full mb-4">
                        <div className="flex-1 bg-[#FFF8EC] rounded-[16px] flex flex-col items-center justify-center py-5 px-4">
                            <span className="text-[18px] font-regular font-varela text-[#F48F1B] mb-1">Order ID</span>
                            <span className="text-[28px] font-[800] font-nunito text-[#F48F1B] break-all text-center">{order.orderId}</span>
                        </div>
                        <div className="flex-1 bg-[#F48F1B] rounded-[16px] flex flex-col items-center justify-center py-5 px-4 shadow-lg shadow-orange-100">
                            <span className="text-[18px] font-regular font-varela text-white mb-1">Token Number</span>
                            <span className="text-[48px] font-[800] font-nunito text-white">{tokenNumber}</span>
                        </div>
                    </div>

                    <div className="flex gap-3 w-full mt-[30px] mb-6">
                        {[
                            { label: 'Order Type', value: orderType },
                            { label: 'Total Paid', value: `₹${Number(liveTotal || order.total || 0).toFixed(2)}` },
                        ].map((info) => (
                            <div key={info.label} className="flex-1 bg-[#F9F9F9] rounded-[14px] flex flex-col items-center justify-center py-4 border border-[#F1F5F9]">
                                <span className="text-[16px] leading-[16px] font-regular font-varela text-[#9CA3AF] mb-1">{info.label}</span>
                                <span className="text-[24px] leading-[32px] font-[800] font-nunito text-[#1E2939]">{info.value}</span>
                            </div>
                        ))}
                    </div>

                    {/* Live status card — driven by polling. Replaces the
                        static "15-20 mins" so customers see real progress. */}
                    <div
                        className="w-full rounded-2xl p-5 mb-[40px] flex items-center gap-4 border"
                        style={{ borderColor: `${statusCard.tint}33`, background: `${statusCard.tint}14` }}
                    >
                        <div
                            className="w-14 h-14 rounded-full flex items-center justify-center shrink-0"
                            style={{ background: statusCard.tint }}
                        >
                            <StatusIcon size={28} color="#fff" />
                        </div>
                        <div className="flex-1">
                            <div className="text-[22px] font-nunito font-bold text-[#1E2939]">{statusCard.label}</div>
                            <div className="text-[16px] font-varela text-[#6B7280]">{statusCard.hint}</div>
                        </div>
                    </div>

                    <div className="flex gap-3 w-full mb-2">
                        <button
                            onClick={() => window.print()}
                            className="flex-1 bg-[#34C759] text-white py-[16px] rounded-2xl text-[22px] font-semibold font-nunito flex items-center justify-center gap-3 hover:bg-[#2eb350] transition-colors active:scale-95"
                        >
                            <Printer size={24} />
                            Print Token
                        </button>
                        <button
                            onClick={handleDone}
                            className="flex-1 bg-[#1E2939] text-white py-[16px] rounded-2xl text-[22px] font-semibold font-nunito hover:bg-black transition-colors active:scale-95"
                        >
                            Done
                        </button>
                    </div>

                    <p className="text-[20px] font-regular font-varela text-[#6B7280] text-center leading-relaxed mt-6">
                        We'll call your token number when your order is ready!
                    </p>
                </div>
            </div>

            {/* Auto-reset countdown — hidden once the order is ready so
                the screen stays put while the customer collects. */}
            {liveStatus !== 'ready' ? (
                <p className="text-black text-[24px] font-[800] font-nunito tracking-widest">
                    Auto-reset in {fmt(countdown)}
                </p>
            ) : (
                <p className="text-[#34C759] text-[24px] font-[800] font-nunito tracking-widest">
                    Tap “Done” after collecting your order
                </p>
            )}
        </div>
    );
}
