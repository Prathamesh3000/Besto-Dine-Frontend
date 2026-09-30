import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import {
  ChevronLeft,
  Calendar,
  Clock,
  Users,
  MapPin,
  Receipt,
  CalendarX,
  Loader2,
  CreditCard,
  Ban,
  X,
} from "lucide-react";
import toast from "react-hot-toast";
import api, { advanceBookingAPI } from "../../utils/api";
import { useAuth } from "../../Context/AuthContext";
import BottomNav from "../../Components/Loggedin/BottomNav";

// Reuse the same lazy-loaded Razorpay script the booking Payment page uses.
function loadRazorpayScript() {
  return new Promise((resolve) => {
    if (window.Razorpay) { resolve(true); return; }
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

const STATUS_STYLES = {
  Pending: "bg-amber-50 text-amber-700 border-amber-200",
  Confirmed: "bg-blue-50 text-blue-700 border-blue-200",
  Completed: "bg-emerald-50 text-emerald-700 border-emerald-200",
  Cancelled: "bg-red-50 text-red-600 border-red-200",
};

const formatDate = (d) => {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return "—";
  }
};

const fmtPrice = (n) => `₹${(Number(n) || 0).toLocaleString("en-IN")}`;

function BookingHistory() {
  const navigate = useNavigate();
  const { search } = useLocation();
  const { user } = useAuth();

  // Track which booking is currently mid-payment so we can disable
  // its button and show a spinner without blocking the rest of the list.
  const [payingId, setPayingId] = useState(null);

  // CUS-075 — Cancel-booking modal state. `cancelTarget` holds the
  // booking + the refund preview fetched from the backend so the modal
  // can show "You'll be refunded ₹X" before the customer commits.
  const [cancelTarget, setCancelTarget] = useState(null); // { booking, preview }
  const [cancelLoading, setCancelLoading] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);

  const openCancelModal = async (booking) => {
    setPreviewLoading(true);
    setCancelTarget({ booking, preview: null });
    try {
      const res = await advanceBookingAPI.previewCancel(booking._id);
      if (res.data?.success) {
        setCancelTarget({ booking, preview: res.data.preview });
      } else {
        toast.error(res.data?.message || 'Could not load cancellation details');
        setCancelTarget(null);
      }
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Could not load cancellation details');
      setCancelTarget(null);
    } finally {
      setPreviewLoading(false);
    }
  };

  const confirmCancel = async () => {
    if (!cancelTarget?.booking?._id || cancelLoading) return;
    setCancelLoading(true);
    try {
      const res = await advanceBookingAPI.cancelBooking(cancelTarget.booking._id);
      if (res.data?.success) {
        toast.success(res.data.message || 'Booking cancelled');
        // Reflect locally so the row updates without a refetch.
        setBookings(prev => prev.map(b =>
          b._id === cancelTarget.booking._id
            ? { ...b, status: 'Cancelled', cancellation: res.data.booking?.cancellation || b.cancellation }
            : b
        ));
        setCancelTarget(null);
      } else {
        toast.error(res.data?.message || 'Could not cancel booking');
      }
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Could not cancel booking');
    } finally {
      setCancelLoading(false);
    }
  };

  // Locally apply the "fully paid" state after a successful verify so
  // the list updates without a network round-trip. Falls back to the
  // server response shape used by /my-bookings.
  const markBookingPaid = (bookingDocId, updated) => {
    setBookings((prev) => prev.map((b) => {
      if (b._id !== bookingDocId) return b;
      const total = updated?.payment?.totalAmount ?? b.payment?.totalAmount ?? 0;
      return {
        ...b,
        payment: {
          ...(b.payment || {}),
          totalAmount: total,
          advancePaid: total,
          status: "Paid",
          method: updated?.payment?.method || "online",
          fullyPaidAt: updated?.payment?.fullyPaidAt || new Date().toISOString(),
        },
      };
    }));
  };

  const handlePayRemaining = async (booking) => {
    if (!booking?._id || payingId) return;
    setPayingId(booking._id);

    try {
      const ok = await loadRazorpayScript();
      if (!ok) {
        toast.error("Payment gateway failed to load. Check your connection and retry.");
        setPayingId(null);
        return;
      }

      const { data } = await advanceBookingAPI.createRemainingPayment(booking._id);
      if (!data?.success) {
        toast.error(data?.message || "Could not start payment.");
        setPayingId(null);
        return;
      }

      const remaining = data.booking?.remainingAmount || 0;

      const options = {
        key: data.key,
        amount: data.razorpayOrder.amount,
        currency: data.razorpayOrder.currency,
        name: "BestoDine",
        description: `Balance for booking ${data.booking?.bookingId || ""}`.trim(),
        order_id: data.razorpayOrder.id,
        handler: async (response) => {
          try {
            const verifyRes = await advanceBookingAPI.verifyRemainingPayment(booking._id, {
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
            });
            if (verifyRes.data?.success) {
              markBookingPaid(booking._id, verifyRes.data.booking);
              toast.success(`₹${remaining} payment received. Booking is fully paid.`);
            } else {
              toast.error(verifyRes.data?.message || "Payment verification failed.");
            }
          } catch (err) {
            toast.error(err.response?.data?.message || "Payment verification failed.");
          } finally {
            setPayingId(null);
          }
        },
        modal: {
          // User dismissed the popup — re-enable the button so they
          // can retry without reloading the page.
          ondismiss: () => setPayingId(null),
        },
        prefill: {
          name: user?.name || "",
          email: user?.email || "",
          contact: user?.mobile || "",
        },
        theme: { color: "#FE8301" },
      };

      const rzp = new window.Razorpay(options);
      rzp.on("payment.failed", () => {
        toast.error("Payment failed. Please try again.");
        setPayingId(null);
      });
      rzp.open();
    } catch (err) {
      toast.error(err.response?.data?.message || "Could not start payment.");
      setPayingId(null);
    }
  };

  // Read ?type=table | ?type=hall from the URL — defaults to table.
  const initialType = useMemo(() => {
    const t = new URLSearchParams(search).get("type");
    return t === "hall" ? "hall" : "table";
  }, [search]);

  // Active tab — initialised from the URL but switchable in-page so the user
  // can flip between Advance and Event without going back to the Profile page.
  const [activeType, setActiveType] = useState(initialType);

  // Re-sync the tab if the URL changes (e.g. user uses browser back/forward).
  useEffect(() => {
    setActiveType(initialType);
  }, [initialType]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [bookings, setBookings] = useState([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError("");
      try {
        const res = await api.get("/advance-booking/my-bookings");
        if (cancelled) return;
        if (res.data?.success) {
          setBookings(Array.isArray(res.data.bookings) ? res.data.bookings : []);
        } else {
          setError(res.data?.message || "Failed to load bookings");
        }
      } catch (err) {
        if (cancelled) return;
        const status = err.response?.status;
        const msg = err.response?.data?.message || err.message || "Failed to load bookings";
        setError(status ? `${msg} (status ${status})` : msg);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Counts per type so we can show useful empty-state copy.
  const tableCount = useMemo(
    () => bookings.filter((b) => (b.bookingType || "table") === "table").length,
    [bookings],
  );
  const hallCount = useMemo(
    () => bookings.filter((b) => b.bookingType === "hall").length,
    [bookings],
  );

  const filtered = useMemo(
    () => bookings.filter((b) => (b.bookingType || "table") === activeType),
    [bookings, activeType],
  );

  return (
    <div className="min-h-screen bg-[#FBFBFF] pb-24 sm:pb-28 font-nunito">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-white border-b border-gray-100 px-4 py-4 flex items-center gap-3">
        <button
          onClick={() => navigate(-1)}
          className="p-1 -ml-1 rounded-full hover:bg-gray-100 active:scale-95 transition-transform"
          aria-label="Back"
        >
          <ChevronLeft size={24} className="text-[#1A181B]" />
        </button>
        <h1 className="text-[16px] font-semibold text-[#1A181B] leading-7">
          Booking History
        </h1>
      </header>

      <main className="px-4 pt-4 lg:max-w-3xl lg:mx-auto">
        {/* In-page tabs — keeps the user from having to bounce back to Profile */}
        <div className="bg-white border border-[#F2F1FA] rounded-2xl p-1 grid grid-cols-2 mb-4 shadow-[0px_4px_8.4px_0px_#D0C9F833]">
          <button
            onClick={() => setActiveType("table")}
            className={`rounded-xl py-2.5 text-[13px] font-semibold transition-colors ${
              activeType === "table"
                ? "bg-[#FE8301] text-white"
                : "text-[#645E66]"
            }`}
          >
            Advance Bookings
            {tableCount > 0 && (
              <span className="ml-1.5 opacity-80">({tableCount})</span>
            )}
          </button>
          <button
            onClick={() => setActiveType("hall")}
            className={`rounded-xl py-2.5 text-[13px] font-semibold transition-colors ${
              activeType === "hall"
                ? "bg-[#FE8301] text-white"
                : "text-[#645E66]"
            }`}
          >
            Event Bookings
            {hallCount > 0 && (
              <span className="ml-1.5 opacity-80">({hallCount})</span>
            )}
          </button>
        </div>

        {loading && (
          <div className="flex items-center justify-center py-20">
            <Loader2 size={28} className="text-[#FE8301] animate-spin" />
          </div>
        )}

        {!loading && error && (
          <div className="bg-red-50 border border-red-200 text-red-600 rounded-2xl px-4 py-3 text-sm">
            {error}
          </div>
        )}

        {!loading && !error && filtered.length === 0 && (
          <div className="bg-white border border-[#F2F1FA] rounded-2xl px-6 py-12 text-center mt-2">
            <div className="w-16 h-16 mx-auto rounded-full bg-[#FFF3E6] flex items-center justify-center mb-4">
              <CalendarX size={28} className="text-[#FE8301]" />
            </div>
            <p className="text-[15px] font-semibold text-[#101828]">
              {activeType === "hall"
                ? "No event bookings yet"
                : "No advance bookings yet"}
            </p>
            <p className="text-[13px] text-gray-500 mt-1 font-varela">
              {bookings.length > 0
                ? `You have ${bookings.length} booking${bookings.length === 1 ? "" : "s"} of a different type. Try the other tab.`
                : activeType === "hall"
                  ? "Bookings for halls and special events will show up here."
                  : "Your reserved-table bookings will show up here."}
            </p>
            <button
              onClick={() => navigate("/customer/booking-type")}
              className="mt-5 inline-flex items-center gap-2 bg-[#FE8301] text-white px-5 py-2.5 rounded-xl text-sm font-semibold active:scale-[0.98]"
            >
              Make a booking
            </button>
          </div>
        )}

        {!loading && !error && filtered.length > 0 && (
          <ul className="space-y-3">
            {filtered.map((b) => {
              const statusClass =
                STATUS_STYLES[b.status] ||
                "bg-gray-50 text-gray-600 border-gray-200";

              const venue =
                activeType === "hall"
                  ? b.hall?.name || "Hall"
                  : (b.tables || []).map((t) => t.name).filter(Boolean).join(", ") || "Tables";

              const total = b.payment?.totalAmount || 0;
              const paid = b.payment?.advancePaid || 0;
              const remaining = Math.max(total - paid, 0);

              return (
                <li
                  key={b._id}
                  className="bg-white border border-[#F2F1FA] rounded-2xl p-4 shadow-[0px_4px_8.4px_0px_#D0C9F833]"
                >
                  {/* Top row: title + status */}
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="min-w-0">
                      <p className="text-[15px] font-semibold text-[#101828] truncate">
                        {b.specialEvent && b.specialEvent !== "None"
                          ? b.specialEvent
                          : activeType === "hall"
                            ? "Hall Booking"
                            : "Table Booking"}
                      </p>
                      <p className="text-[12px] text-gray-500 font-varela mt-0.5">
                        {/* Friendly bookingId only — never the raw Mongo _id */}
                        {b.bookingId ? `${b.bookingId} · ` : ""}
                        Booked on {formatDate(b.createdAt)}
                      </p>
                    </div>
                    <span
                      className={`shrink-0 text-[11px] font-semibold px-2.5 py-1 rounded-full border ${statusClass}`}
                    >
                      {b.status || "Pending"}
                    </span>
                  </div>

                  {/* Details grid */}
                  <div className="grid grid-cols-2 gap-y-2 gap-x-3 text-[13px] font-varela text-[#3a3340]">
                    <div className="flex items-center gap-2 min-w-0">
                      <Calendar size={14} className="text-[#FE8301] shrink-0" />
                      <span className="truncate">{formatDate(b.bookingDate)}</span>
                    </div>
                    <div className="flex items-center gap-2 min-w-0">
                      <Clock size={14} className="text-[#FE8301] shrink-0" />
                      <span className="truncate">
                        {b.bookingTime || "—"}
                        {b.timeSlot ? ` (${b.timeSlot})` : ""}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 min-w-0">
                      <Users size={14} className="text-[#FE8301] shrink-0" />
                      <span className="truncate">
                        {b.guestCount || 0} guest{(b.guestCount || 0) === 1 ? "" : "s"}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 min-w-0">
                      <MapPin size={14} className="text-[#FE8301] shrink-0" />
                      <span className="truncate">{venue}</span>
                    </div>
                  </div>

                  {/* Payment summary */}
                  <div className="mt-3 pt-3 border-t border-gray-100 flex items-center justify-between text-[13px]">
                    <div className="flex items-center gap-2 text-gray-500 font-varela">
                      <Receipt size={14} className="text-gray-400" />
                      <span>Total</span>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-[#101828]">{fmtPrice(total)}</p>
                      {paid > 0 && remaining > 0 && (
                        <p className="text-[11px] text-gray-500 font-varela mt-0.5">
                          Paid {fmtPrice(paid)} · Due {fmtPrice(remaining)}
                        </p>
                      )}
                      {paid === 0 && total > 0 && b.status !== "Cancelled" && (
                        <p className="text-[11px] text-gray-500 font-varela mt-0.5">
                          Due {fmtPrice(total)}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Pay Remaining — only when there's a real outstanding
                      balance and the booking isn't cancelled. We skip
                      Pending bookings deliberately: admin hasn't accepted
                      yet, so charging the rest now would lock the customer
                      in before confirmation. */}
                  {remaining > 0 && b.status === "Confirmed" && (
                    <button
                      onClick={() => handlePayRemaining(b)}
                      disabled={payingId === b._id}
                      className={`mt-3 w-full inline-flex items-center justify-center gap-2 rounded-xl py-2.5 text-[13px] font-semibold transition-all ${
                        payingId === b._id
                          ? "bg-orange-200 text-white cursor-not-allowed"
                          : "bg-[#FE8301] text-white hover:bg-[#e07400] active:scale-[0.98]"
                      }`}
                    >
                      {payingId === b._id ? (
                        <>
                          <Loader2 size={14} className="animate-spin" />
                          <span>Opening payment…</span>
                        </>
                      ) : (
                        <>
                          <CreditCard size={14} />
                          <span>Pay Remaining {fmtPrice(remaining)}</span>
                        </>
                      )}
                    </button>
                  )}

                  {/* CUS-075 — Cancel button. Only for paid (advance or
                      full) bookings that haven't started yet and aren't
                      already cancelled/completed. Customers with a
                      Pending booking (advance paid but admin not yet
                      confirmed) can still cancel — we just charge them
                      according to the same time-window policy. */}
                  {paid > 0 && !['Cancelled', 'Completed'].includes(b.status) && (
                    <button
                      onClick={() => openCancelModal(b)}
                      className="mt-2 w-full inline-flex items-center justify-center gap-2 rounded-xl py-2 text-[12px] font-semibold text-red-600 border border-red-200 bg-red-50 hover:bg-red-100 active:scale-[0.98] transition-all"
                    >
                      <Ban size={14} />
                      Cancel booking
                    </button>
                  )}

                  {/* Cancellation summary — shown for cancelled rows so
                      the customer can see what refund was promised. */}
                  {b.status === 'Cancelled' && b.cancellation && (
                    <div className="mt-3 bg-red-50 border border-red-100 rounded-xl px-3 py-2 text-[11px] text-red-700 font-varela">
                      <p className="font-semibold">
                        Cancelled — {b.cancellation.refundTier || 'per policy'}
                      </p>
                      {b.cancellation.refundAmount > 0 && (
                        <p className="mt-0.5">Refund: ₹{Number(b.cancellation.refundAmount).toLocaleString('en-IN')}</p>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </main>

      {/* CUS-075 — Cancel confirmation modal with refund preview. */}
      {cancelTarget && (
        <div
          onClick={() => !cancelLoading && setCancelTarget(null)}
          className="fixed inset-x-0 top-0 h-[100dvh] z-[100] bg-black/60 flex items-end sm:items-center justify-center"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="relative w-full sm:max-w-[420px] bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl max-h-[88dvh] sm:max-h-[85dvh] overflow-hidden flex flex-col"
          >
            <div className="sm:hidden flex justify-center pt-2 pb-1 shrink-0">
              <span className="w-10 h-1 bg-gray-200 rounded-full" />
            </div>
            <div className="flex items-start justify-between px-5 pt-4 pb-3 shrink-0">
              <div>
                <h2 className="text-[18px] font-bold text-[#1A181B]">Cancel this booking?</h2>
                <p className="text-[12px] text-[#645E66] font-varela mt-0.5">
                  {cancelTarget.booking?.bookingId}
                </p>
              </div>
              <button
                onClick={() => !cancelLoading && setCancelTarget(null)}
                aria-label="Close"
                className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center"
              >
                <X size={16} className="text-gray-700" />
              </button>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto px-5 pb-4">
              {previewLoading || !cancelTarget.preview ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 size={24} className="text-[#FE8301] animate-spin" />
                </div>
              ) : (
                <>
                  <div className={`rounded-xl p-4 ${cancelTarget.preview.refundAmount > 0 ? 'bg-emerald-50 border border-emerald-100' : 'bg-red-50 border border-red-100'}`}>
                    <p className="text-[13px] font-varela text-[#645E66] mb-1">Refund estimate</p>
                    <p className={`text-[24px] font-bold ${cancelTarget.preview.refundAmount > 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                      ₹{Number(cancelTarget.preview.refundAmount).toLocaleString('en-IN')}
                    </p>
                    <p className="text-[12px] font-varela text-[#645E66] mt-1">
                      {cancelTarget.preview.refundTier} · {cancelTarget.preview.refundPct}% of ₹{Number(cancelTarget.preview.advancePaid).toLocaleString('en-IN')} advance paid
                    </p>
                  </div>

                  <div className="mt-4 space-y-2 text-[12px] font-varela text-[#645E66]">
                    <p className="font-semibold text-[#1A181B] text-[13px]">Refund policy</p>
                    <ul className="space-y-1.5 list-disc list-inside ml-1">
                      <li><span className="text-[#1A181B] font-semibold">≥ 48 hours</span> before event — full refund</li>
                      <li><span className="text-[#1A181B] font-semibold">24–48 hours</span> — 50% refund</li>
                      <li><span className="text-[#1A181B] font-semibold">&lt; 24 hours</span> — non-refundable</li>
                    </ul>
                    <p className="pt-1">Refund (when applicable) is queued for processing — admin reviews and triggers the payout. You'll see it in your wallet / source account within 5–7 business days.</p>
                  </div>
                </>
              )}
            </div>

            <div className="px-5 py-3 border-t border-gray-100 shrink-0 pb-[max(0.75rem,env(safe-area-inset-bottom))] flex flex-col gap-2">
              <button
                onClick={confirmCancel}
                disabled={cancelLoading || previewLoading || !cancelTarget.preview?.cancellable}
                className="w-full bg-red-600 hover:bg-red-700 text-white font-semibold py-3 rounded-xl text-[14px] transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {cancelLoading ? 'Cancelling…' : 'Yes, cancel booking'}
              </button>
              <button
                onClick={() => !cancelLoading && setCancelTarget(null)}
                disabled={cancelLoading}
                className="w-full bg-gray-100 hover:bg-gray-200 text-[#1A181B] font-semibold py-3 rounded-xl text-[14px] transition-colors"
              >
                Keep booking
              </button>
            </div>
          </div>
        </div>
      )}

      <BottomNav />
    </div>
  );
}

export default BookingHistory;
