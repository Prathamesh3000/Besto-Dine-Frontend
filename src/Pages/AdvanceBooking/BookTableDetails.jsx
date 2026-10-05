import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ChevronLeft, Calendar, Minus, Plus } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../../Context/AuthContext';
import BookingProgressBar from './BookingProgressBar';
import { settingsAPI, advanceBookingAPI } from '../../utils/api';
import RequiredMark from '../../Components/Common/RequiredMark';
import { reportMissingFields } from '../../utils/requiredFields';
import { backendOrigin } from '../../utils/apiOrigin';

// Today's date in LOCAL time as YYYY-MM-DD — the format <input type="date">
// expects. Using `new Date().toISOString().split('T')[0]` returns UTC,
// which is the previous day for IST customers after 6:30pm — that would
// make today's date appear "in the past" to the server validator.
const localTodayYMD = () => {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

// Guest-count bounds. 200 matches the server-side cap enforced in
// reservationController.createReservation; halls follow the 2000 cap in
// advanceBookingController.createAdvanceBooking — keep them in step.
const MIN_GUESTS = 1;
const MAX_GUESTS_TABLE = 200;
const MAX_GUESTS_HALL = 2000;

// Slot length per booking type, in hours.
//
// Every booking type used to get 1-hour slots because generateTimeSlots
// hardcoded `nextH = h + 1`. A banquet hall is not booked by the hour —
// a reception runs an evening — so halls are sold as 5 or 6 hour blocks
// (the customer picks one). Table bookings keep the hourly grid. Keep
// HALL_DURATION_OPTIONS in step with advanceBookingController.
const HALL_DURATION_OPTIONS = [5, 6];
const TABLE_SLOT_HOURS = 1;

const BookTableDetails = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const { bookingType } = location.state || {};
  const dateInputRef = React.useRef(null);

  const MAX_GUESTS = bookingType === 'hall' ? MAX_GUESTS_HALL : MAX_GUESTS_TABLE;
  const clampGuests = (n) => Math.min(MAX_GUESTS, Math.max(MIN_GUESTS, Number(n) || MIN_GUESTS));
  const [guests, setGuestsState] = useState(location.state?.guests || 2);
  // Mirrors `guests` as a raw string so the input can be transiently
  // empty mid-edit without the numeric state snapping to the minimum.
  const [guestsInput, setGuestsInput] = useState(String(location.state?.guests || 2));
  // Stepper / programmatic updates must keep the typed field in sync,
  // otherwise +/- changed the count while the box still showed the old number.
  const setGuests = (n) => {
    setGuestsState(n);
    setGuestsInput(String(n));
  };
  const [hallDuration, setHallDuration] = useState(
    HALL_DURATION_OPTIONS.includes(Number(location.state?.durationHours))
      ? Number(location.state.durationHours)
      : HALL_DURATION_OPTIONS[0]
  );
  const slotSpan = bookingType === 'hall' ? hallDuration : TABLE_SLOT_HOURS;
  const [selectedTimeType, setSelectedTimeType] = useState(location.state?.selectedTimeType || 'Lunch');
  const [selectedSlot, setSelectedSlot] = useState(location.state?.selectedSlot !== undefined ? location.state.selectedSlot : null);
  // `today` is the minimum allowed booking date. Recomputed once per
  // mount — good enough since the user won't have the form open across
  // a midnight boundary in practice; if they do, the server validator
  // is the final guard.
  const today = React.useMemo(() => localTodayYMD(), []);
  const [selectedDate, setSelectedDate] = useState(() => {
    const incoming = location.state?.selectedDate;
    // Clamp a stale past date coming back via Previous → next-page nav
    // back into the picker. Otherwise the user could land here with
    // yesterday already chosen and never know it.
    if (incoming && incoming < today) return today;
    return incoming || today;
  });
  const [selectedEvent, setSelectedEvent] = useState(location.state?.selectedEvent || null);
  const [selectedTableIds, setSelectedTableIds] = useState(location.state?.selectedTableIds || []);
  
  const [tablesList, setTablesList] = useState([]);
  const [timeSlots, setTimeSlots] = useState([]);
  const [eventsList, setEventsList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(null);

  const areaId = location.state?.selectedTypes?.[0];

  // Each fetch is independent — a 403 on event types (e.g. tenant has
  // table booking but not the events catalog) must not blank the
  // tables / time-slots panels. Run them in parallel and surface a
  // single inline error only when the *page-critical* fetches fail.
  const fetchData = React.useCallback(async () => {
    setLoading(true);
    setFetchError(null);
    const errors = [];

    // Event types — non-critical: silently skip on failure (the events
    // section just shows an empty grid). Most common failure here is
    // FEATURE_LOCKED on tenants without the events catalog.
    try {
      const eventRes = await advanceBookingAPI.getEventTypes();
      if (eventRes.data?.success) {
        setEventsList(eventRes.data.eventTypes.map(e => ({
          id: e._id,
          label: e.title,
          icon: e.icon,
        })));
      }
    } catch (err) {
      // Don't surface — events section gracefully empty
      console.warn('Event types fetch skipped:', err.response?.data?.code || err.message);
      setEventsList([]);
    }

    // Tables — page-critical for the table-booking flow.
    if (areaId && bookingType !== 'hall') {
      try {
        // Customer-facing endpoint. The staff listing (waiterAPI
        // .getTablesByArea) is staffOnly and 403'd this whole step.
        const tableRes = await advanceBookingAPI.getBookableTables(areaId);
        if (tableRes.data?.success) {
          setTablesList(tableRes.data.tables || []);
        }
      } catch (err) {
        console.error('Tables fetch error:', err);
        errors.push(err.response?.data?.message || 'Could not load tables.');
      }
    }

    // Settings for operating hours — page-critical (no slots without).
    try {
      const settingsRes = await settingsAPI.getSettings();
      if (settingsRes.data) {
        const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        const today = days[new Date(selectedDate).getDay()];
        const hours = settingsRes.data.operatingHours?.find(h => h.day === today);
        if (hours && hours.isOpen) {
          generateTimeSlots(hours.start, hours.end);
        } else {
          setTimeSlots([]);
        }
      }
    } catch (err) {
      console.error('Settings fetch error:', err);
      errors.push(err.response?.data?.message || 'Could not load operating hours.');
    }

    if (errors.length) setFetchError(errors[0]);
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [areaId, selectedDate, bookingType, slotSpan]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const generateTimeSlots = (start, end) => {
    const slots = [];
    const [startH] = (start || "00:00").split(':').map(Number);
    let [endH] = (end || "23:59").split(':').map(Number);

    if (endH < startH) endH += 24; // Handle after midnight

    // Slot length depends on what's being booked — a hall gets the
    // chosen 5/6 hour block, a table gets an hour. Start times step
    // hourly so a long hall block can still begin at any hour (stepping
    // by the block length left the Dinner tab empty for halls).
    const span = slotSpan;

    for (let h = startH; h + span <= endH; h += 1) {
      const nextH = h + span;
      // Wrap past midnight before formatting: with multi-hour hall
      // slots, `nextH` can legitimately be 24+ (a 19:00 slot spanning
      // 5h ends at 24:00), which would otherwise render as "12 PM".
      const hWrapped = h % 24;
      const nextWrapped = nextH % 24;
      const ampm = hWrapped >= 12 ? 'PM' : 'AM';
      const nextAmpm = nextWrapped >= 12 ? 'PM' : 'AM';

      const h12 = hWrapped % 12 || 12;
      const nextH12 = nextWrapped % 12 || 12;

      const type = hWrapped < 17 ? 'Lunch' : 'Dinner';
      
      // Label like "9-10 AM" or "11 AM - 12 PM"
      const label = ampm === nextAmpm 
        ? `${h12}-${nextH12} ${ampm}`
        : `${h12} ${ampm} - ${nextH12} ${nextAmpm}`;

      slots.push({
        time: label,
        originalTime: `${hWrapped.toString().padStart(2, '0')}:00`,
        // Hall bookings need the block length downstream (pricing,
        // availability), not just the start time.
        durationHours: span,
        type: type,
        offer: 'No offer',
        hasOffer: false
      });
    }
    setTimeSlots(slots);
  };

  const filteredSlots = timeSlots.filter(s => s.type === selectedTimeType);
  const canContinue = selectedSlot !== null && (bookingType === 'hall' || selectedTableIds.length > 0);

  const formatDateLabel = (date) => {
    if (!date) return '';
    const [y, m, d] = date.split('-');
    return `${d}.${m}.${y}`;
  };

  const handlePrevious = () => {
    // Hall flow has no preceding in-flow step (book-table-details IS the
    // first hall step) — use browser history so the user returns to
    // wherever they came from (Profile, Home, Landing, etc.).
    // Table flow steps back to the booking-type seating selector.
    if (bookingType === 'hall') {
      navigate(-1);
    } else {
      const nextState = { ...location.state, guests, selectedTimeType, selectedSlot, selectedDate, selectedEvent, selectedTableIds, durationHours: hallDuration };
      navigate('/customer/booking-type', { state: nextState });
    }
  };

  const handleHallDurationChange = (hours) => {
    if (hours === hallDuration) return;
    setHallDuration(hours);
    // Slot labels encode the end time, so the old pick no longer exists.
    setSelectedSlot(null);
  };

  const handleContinue = () => {
    // Final past-date guard. The picker has `min={today}` and the
    // onChange snaps illegal values back, but stale `location.state`
    // arriving from a navigated-back booking could still carry a date
    // older than today — the user pays for that with a 400 from the
    // server validator three screens later. Catch it here instead.
    if (selectedDate < today) {
      toast.error('Booking date cannot be in the past. Please pick today or later.');
      setSelectedDate(today);
      return;
    }

    // QA N2 — name every missing required field and jump to the first
    // one instead of a silently disabled Continue button.
    const missing = [];
    if (!(guests >= MIN_GUESTS)) missing.push({ label: 'Number of guests', id: 'guest-count' });
    if (!selectedDate) missing.push({ label: 'Date', id: 'booking-date' });
    if (selectedSlot === null) missing.push({ label: 'Time slot', id: 'booking-time' });
    if (bookingType !== 'hall' && selectedTableIds.length === 0) missing.push({ label: 'Table(s)', id: 'booking-tables' });
    if (reportMissingFields(missing)) return;

    const chosenTables = tablesList.filter(t => selectedTableIds.includes(t._id));
    const selectedTableNames = chosenTables.map(t => t.name);
    const selectedEventObj = eventsList.find(e => e.id === selectedEvent);
    const selectedEventName = selectedEventObj ? selectedEventObj.label : null;

    const chosenSlot = timeSlots.find(s => s.time === selectedSlot) || filteredSlots[0] || null;
    const nextState = {
      ...location.state,
      selectedDate,
      selectedTimeType,
      selectedSlot,
      selectedTime: selectedSlot || (filteredSlots.length > 0 ? filteredSlots[0].time : '09:00'),
      // Machine-readable start + block length — the server uses these
      // for the hall overlap check instead of parsing the display label.
      selectedStartTime: chosenSlot?.originalTime || null,
      durationHours: bookingType === 'hall' ? hallDuration : TABLE_SLOT_HOURS,
      guests,
      selectedEvent,
      selectedEventName,
      selectedTableIds,
      selectedTableNames,
      // Seating capacity for the Review step's seating description (QA N12).
      selectedTablesInfo: chosenTables.map(t => ({ name: t.name, capacity: Number(t.capacity) || 0 }))
    };
    if (bookingType === 'hall') {
      navigate('/customer/hall-booking', { state: nextState });
    } else {
      navigate('/customer/cake-details', { state: nextState });
    }
  };

  return (
    <div className="min-h-screen bg-[#FDFDFD] font-manrope selection:bg-orange-100 overflow-x-hidden">
      <div className="w-full">
        <BookingProgressBar />
      </div>

      <div className="max-w-[1240px] mx-auto pb-24 lg:pb-12 px-5 lg:px-12">
        {/* Mobile Header */}
        <header className="flex lg:hidden items-center justify-between py-6 bg-white sticky top-0 z-50">
          <div className="flex items-center gap-3">
            <button onClick={handlePrevious} className="p-1 -ml-1">
              <ChevronLeft size={24} className="text-[#1A181B]" />
            </button>
            <h1 className="text-[18px] font-[700] text-[#1A181B]">{bookingType === 'hall' ? 'Book a hall' : 'Book a table'}</h1>
          </div>
          <div className="w-8 h-8 rounded-full overflow-hidden border border-gray-100">
            <img src={user?.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(user?.name || 'Guest')}&background=FE8301&color=fff`} alt={user?.name || 'Guest'} className="w-full h-full object-cover" />
          </div>
        </header>

        {/* Desktop Title */}
        <div className="hidden lg:block mt-6">
          <h1 className="text-[32px] font-[800] text-[#1A181B] tracking-tight">{bookingType === 'hall' ? 'Book a hall' : 'Book a table'}</h1>
        </div>

        <main className="mt-8 flex flex-col gap-6">
          {fetchError && (
            <div className="bg-red-50 border border-red-200 rounded-[16px] p-4 flex items-center justify-between gap-3">
              <p className="text-[14px] font-[600] text-[#FF3B30]">{fetchError}</p>
              <button onClick={fetchData} className="bg-[#FE8301] text-white px-4 py-1.5 rounded-[10px] text-[12px] font-[700] shrink-0">Retry</button>
            </div>
          )}
          {/* Guest Selector Card.
              The stepper alone was unusable for hall bookings — a 200-
              guest party meant 198 taps. The number is now directly
              editable; the steppers remain for small table bookings
              where they're the faster input. */}
          <div className="bg-white border border-[#F2F4F7] rounded-[24px] p-6 lg:px-8 lg:py-4 flex items-center justify-between gap-4 shadow-[0px_2px_12px_rgba(0,0,0,0.02)]">
            <label htmlFor="guest-count" className="text-[16px] lg:text-[18px] font-[700] text-[#1A181B]">
              Select number of guests<RequiredMark />
            </label>
            <div className="flex items-center bg-[#F8F9FB] rounded-[14px] p-1 border border-[#F2F4F7]">
              <button
                type="button"
                onClick={() => setGuests(clampGuests(guests - 1))}
                disabled={guests <= MIN_GUESTS}
                aria-label="Decrease guest count"
                className="w-10 h-10 flex items-center justify-center text-[#645E66] hover:text-[#1A181B] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <Minus size={20} />
              </button>
              <input
                id="guest-count"
                type="number"
                inputMode="numeric"
                min={MIN_GUESTS}
                max={MAX_GUESTS}
                value={guestsInput}
                onChange={(e) => {
                  // Keep the raw string in state while typing so the
                  // field can be briefly empty (clearing it to retype
                  // "150" shouldn't snap to 1 on the first keystroke).
                  const raw = e.target.value;
                  setGuestsInput(raw);
                  const n = parseInt(raw, 10);
                  if (Number.isFinite(n)) setGuestsState(clampGuests(n));
                }}
                onBlur={() => {
                  // Commit: an empty or out-of-range entry resolves to
                  // the clamped value so we never submit a bad count.
                  const n = parseInt(guestsInput, 10);
                  const safe = Number.isFinite(n) ? clampGuests(n) : MIN_GUESTS;
                  setGuests(safe);
                  setGuestsInput(String(safe));
                }}
                aria-label="Number of guests"
                className="w-16 text-center bg-transparent font-[700] text-[#1A181B] text-[18px] outline-none focus:ring-2 focus:ring-[#FE8301]/40 rounded-[8px] [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              />
              <button
                type="button"
                onClick={() => setGuests(clampGuests(guests + 1))}
                disabled={guests >= MAX_GUESTS}
                aria-label="Increase guest count"
                className="w-10 h-10 flex items-center justify-center text-[#645E66] hover:text-[#1A181B] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <Plus size={20} />
              </button>
            </div>
          </div>

          <div className={`grid grid-cols-1 ${bookingType === 'hall' ? 'lg:grid-cols-1 max-w-3xl mx-auto' : 'lg:grid-cols-2'} gap-6 items-stretch w-full`}>
            {/* Left Column: Date & Time */}
            <div className="flex flex-col gap-6">
              {/* Date Selector */}
              <div id="booking-date" className="bg-white border border-[#F2F4F7] rounded-[24px] p-6 lg:p-8 shadow-[0px_2px_12px_rgba(0,0,0,0.02)]">
                <h2 className="text-[16px] lg:text-[18px] font-[700] text-[#1A181B] mb-5">Select Date<RequiredMark /></h2>
                <div className="relative group">
                  <div 
                    onClick={() => {
                        try {
                            dateInputRef.current && dateInputRef.current.showPicker();
                        } catch {
                            dateInputRef.current && dateInputRef.current.click();
                        }
                    }}
                    className="w-full bg-[#FAFAFA] rounded-[18px] p-4 flex items-center justify-between border border-[#F2F4F7] group-hover:border-orange-200 transition-colors cursor-pointer"
                  >
                    <span className="text-[16px] font-[600] text-[#1A181B]">
                      {formatDateLabel(selectedDate)}
                    </span>
                    <Calendar size={20} className="text-[#645E66]" />
                  </div>
                  <input
                    ref={dateInputRef}
                    type="date"
                    value={selectedDate}
                    min={today}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (!v) return;
                      // Defence-in-depth: `min` on <input type="date">
                      // is honoured by every desktop browser and recent
                      // mobile pickers, but a few Android WebView builds
                      // and accessibility tools let the user type a past
                      // date directly. Snap back to today and surface a
                      // toast so the customer knows why their selection
                      // didn't stick.
                      if (v < today) {
                        toast.error('Please pick today or a future date.');
                        setSelectedDate(today);
                        return;
                      }
                      setSelectedDate(v);
                    }}
                    className="absolute inset-x-0 bottom-0 opacity-0 pointer-events-none h-0"
                  />
                </div>
              </div>

              {/* Time Selector */}
              <div id="booking-time" className="bg-white border border-[#F2F4F7] rounded-[24px] p-6 lg:p-8 shadow-[0px_2px_12px_rgba(0,0,0,0.02)]">
                {/* Time type toggle – stacks on mobile, row on sm+ */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
                  <h2 className="text-[16px] lg:text-[18px] font-[700] text-[#1A181B]">Select time<RequiredMark /></h2>
                  <div className="flex bg-[#F2F4F7] rounded-full p-1 border border-[#F2F4F7] self-start sm:self-auto">
                    <button
                      onClick={() => setSelectedTimeType('Lunch')}
                      className={`px-5 sm:px-6 py-2 rounded-full text-[13px] font-[700] transition-all duration-300 whitespace-nowrap ${selectedTimeType === 'Lunch' ? 'bg-[#FE8301] text-white shadow-sm' : 'text-[#645E66]'}`}
                    >
                      Lunch
                    </button>
                    <button
                      onClick={() => setSelectedTimeType('Dinner')}
                      className={`px-5 sm:px-6 py-2 rounded-full text-[13px] font-[700] transition-all duration-300 whitespace-nowrap ${selectedTimeType === 'Dinner' ? 'bg-[#FE8301] text-white shadow-sm' : 'text-[#645E66]'}`}
                    >
                      Dinner
                    </button>
                  </div>
                </div>

                {/* Hall block length — halls are booked for an event, not by the hour. */}
                {bookingType === 'hall' && (
                  <div className="mb-5">
                    <p className="text-[14px] font-[600] text-[#645E66] mb-3">Duration</p>
                    <div className="flex gap-3">
                      {HALL_DURATION_OPTIONS.map((hours) => (
                        <button
                          key={hours}
                          type="button"
                          onClick={() => handleHallDurationChange(hours)}
                          className={`px-5 py-2 rounded-full text-[13px] font-[700] border-2 transition-all duration-300 ${hallDuration === hours ? 'bg-[#FFF9F2] border-[#FE8301] text-[#1A181B]' : 'bg-white border-[#F2F4F7] text-[#645E66] hover:border-orange-100'}`}
                        >
                          {hours} hours
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Time slot grid – 2 cols mobile, 3 sm, context-aware on lg */}
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-2 xl:grid-cols-3 gap-3">
                  {filteredSlots.map((slot, idx) => {
                    const isSelected = selectedSlot === slot.time;
                    return (
                      <button
                        key={idx}
                        onClick={() => setSelectedSlot(slot.time)}
                        className={`p-3 rounded-[16px] border-2 flex flex-col items-center justify-center gap-1 transition-all duration-300 min-h-[64px] ${
                          isSelected
                            ? 'bg-[#FFF9F2] border-[#FE8301]'
                            : 'bg-white border-[#F2F4F7] hover:border-orange-100'
                        }`}
                      >
                        <span className="text-[13px] sm:text-[14px] font-[700] text-[#1A181B] text-center leading-tight break-words w-full">{slot.time}</span>
                        <span className={`text-[11px] font-[500] text-center ${slot.hasOffer ? 'text-[#007AFF]' : 'text-[#645E66]'}`}>{slot.offer}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Right Column: Table Layout */}
            {bookingType !== 'hall' && (
              <div id="booking-tables" className="bg-white border border-[#F2F4F7] rounded-[24px] p-6 lg:p-8 shadow-[0px_2px_12px_rgba(0,0,0,0.02)] flex flex-col h-full">
                <div className="flex flex-col mb-8">
                  <h2 className="text-[16px] lg:text-[18px] font-[700] text-[#1A181B] mb-6">Select Table(s)<RequiredMark /></h2>
                  <div className="flex items-center gap-10">
                    <div className="flex items-center gap-3">
                      <div className="w-4 h-4 rounded-full bg-[#EBEDF0]" />
                      <span className="text-[14px] font-[600] text-[#645E66]">Free</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="w-4 h-4 rounded-full bg-[#FFDCDA]" />
                      <span className="text-[14px] font-[600] text-[#645E66]">Occupied</span>
                    </div>
                  </div>
                </div>

                {/* Table grid – 2 cols mobile, 3 sm/lg/xl. Was xl:grid-cols-4
                    but the right column is already half-width on desktop, so
                    a 4-col grid only gave ~85px per card and truncated
                    typical "SMK-001" ids to "SMK-…". 3 cols is roomy
                    enough to show 7-8 char names on one line. */}
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-3 gap-3 overflow-y-auto max-h-[380px] pr-1 custom-scrollbar">
                  {loading ? (
                    <div className="col-span-full flex justify-center py-10">
                      <div className="w-8 h-8 border-4 border-[#FE8301] border-t-transparent rounded-full animate-spin" />
                    </div>
                  ) : tablesList.filter(t => t.isActive !== false && t.status !== 'disabled').length > 0 ? (
                    tablesList
                      .filter(t => t.isActive !== false && t.status !== 'disabled')
                      .map((table, idx) => {
                        // The customer endpoint exposes `isAvailable` (not the raw
                        // status). Current occupancy only matters for a same-day
                        // booking — a table busy now is free next week.
                        const isOccupied = selectedDate === today && (table.isAvailable === false || table.status === 'occupied');
                        const isSelected = selectedTableIds.includes(table._id);
                        return (
                          <button
                            key={table._id}
                            disabled={isOccupied}
                            onClick={() => {
                              if (isSelected) {
                                setSelectedTableIds(selectedTableIds.filter(id => id !== table._id));
                              } else {
                                setSelectedTableIds([...selectedTableIds, table._id]);
                              }
                            }}
                            className={`p-3 rounded-[12px] flex flex-col border-2 transition-all duration-300 text-left min-w-0 ${
                              isOccupied
                                ? 'bg-[#FFF0F0] border-transparent opacity-80 cursor-not-allowed'
                                : isSelected
                                  ? 'bg-[#FFF9F2] border-[#FE8301]'
                                  : 'bg-[#FAFAFA] border-[#F2F4F7] hover:border-gray-300'
                            }`}
                          >
                            <span className="text-[13px] font-[700] text-[#1A181B] w-full block break-words leading-tight" title={table.name}>
                              {table.name || `T-${idx + 1}`}
                            </span>
                            <span className="text-[10px] sm:text-[11px] font-[500] text-[#645E66] mt-0.5 leading-tight">
                              {table.capacity} Seater
                            </span>
                          </button>
                        );
                      })
                  ) : (
                    <div className="col-span-full text-center py-10 text-gray-400 text-[14px]">
                      No tables found for this area
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Any Special Event Section */}
          <div className="bg-white border border-[#F2F4F7] rounded-[24px] p-6 lg:p-8 shadow-[0px_2px_12px_rgba(0,0,0,0.02)]">
            <h2 className="text-[16px] lg:text-[18px] font-[700] text-[#1A181B] mb-1">Any Special Event</h2>
            <p className="text-[14px] font-[500] text-[#8D848F] mb-8">Plan a special surprise for your loved one</p>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-5">
              {eventsList.map((event) => {
                const isSelected = selectedEvent === event.id;
                // event.icon can be:
                //   - emoji string ('🎂') → render as text (no <img>)
                //   - server upload path ('/uploads/foo.png') → <img> against backend
                //   - external URL ('https://...') → <img> as-is
                //   - empty / unknown → fall back to 🎂
                const rawIcon = event.icon || '';
                const isImagePath = rawIcon.startsWith('/') || rawIcon.startsWith('http');
                return (
                  <button
                    key={event.id}
                    onClick={() => setSelectedEvent(selectedEvent === event.id ? null : event.id)}
                    className={`p-4 lg:p-5 rounded-[24px] flex flex-col items-center justify-start gap-3 border-2 transition-all duration-300 min-h-[140px] ${isSelected
                      ? 'bg-[#FFF9F2] border-[#FE8301]'
                      : 'bg-white border-[#F2F4F7] hover:border-orange-100'
                      }`}
                  >
                    <div className="w-12 h-12 flex items-center justify-center bg-white rounded-full shadow-[0px_2px_8px_rgba(0,0,0,0.04)] shrink-0">
                      {isImagePath ? (
                        <img
                          src={rawIcon.startsWith('/uploads/')
                            ? `${backendOrigin()}${rawIcon}`
                            : rawIcon}
                          alt={event.label}
                          className="w-7 h-7 object-contain"
                          onError={(e) => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'flex'; }}
                        />
                      ) : null}
                      <span
                        className="text-2xl"
                        style={{ display: isImagePath ? 'none' : 'flex', alignItems: 'center', justifyContent: 'center' }}
                      >
                        {rawIcon && !isImagePath ? rawIcon : '🎂'}
                      </span>
                    </div>
                    {/* `text-center` so multi-line labels are centered (was
                        ragged-left without it). `leading-tight` collapses
                        the wrap-gap so a 4-line label like "Pre-Wedding
                        (Mehendi / Sangeet / Haldi)" doesn't push the tile
                        twice as tall. `break-words` keeps anomalously long
                        compound words inside the tile instead of overflowing. */}
                    <span className="text-[13px] font-[600] text-[#645E66] text-center leading-tight break-words w-full">{event.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </main>

        {/* Footer Actions (Desktop & Mobile) */}
        {/* Mobile footer – fixed bar with safe-area support */}
        <div className="fixed bottom-0 left-0 right-0 bg-white px-4 pt-3 pb-[calc(1rem+env(safe-area-inset-bottom,0px))] flex gap-4 lg:hidden shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] z-50">
          <button onClick={handlePrevious} className="flex-1 bg-[#F2F2F2] text-[#645E66] font-nunito font-semibold text-[14px] py-3.5 rounded-[16px]">
            Previous
          </button>
          <button
            onClick={handleContinue}
            aria-disabled={!canContinue}
            className={`flex-1 font-nunito font-semibold text-[14px] py-3.5 rounded-[16px] transition-all ${!canContinue
              ? 'bg-[#FE8301]/60 text-white'
              : 'bg-[#FE8301] text-white'
              }`}
          >
            Continue
          </button>
        </div>

        <div className="hidden lg:flex justify-end gap-3 mt-8 pb-10">
          <button onClick={handlePrevious} className="bg-[#F2F2F2] text-[#645E66] font-nunito font-semibold text-[14px] py-3 px-8 rounded-[16px] w-[140px] text-center">
            Previous
          </button>
          <button
            onClick={handleContinue}
            aria-disabled={!canContinue}
            className={`font-nunito font-semibold text-[14px] py-3 px-8 rounded-[16px] w-[140px] text-center transition-all ${!canContinue
              ? 'bg-[#FE8301]/60 text-white'
              : 'bg-[#FE8301] text-white'
              }`}
          >
            Continue
          </button>
        </div>
      </div>
    </div>
  );
};

export default BookTableDetails;
