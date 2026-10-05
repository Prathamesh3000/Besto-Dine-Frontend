// Parking helpers shared by the customer booking flow (ParkingDetails,
// BookingReview, BookingSuccess) and the admin booking views.
//
// Pricing mirrors Backend/utils/parkingConfig.resolveParkingRequest +
// advanceBookingPricing: Σ (rate per hour × count) × hours, where hours =
// the admin's "whole event" hours or the customer's chosen duration.
// The server re-prices every booking; keep the two in step.

export const DEFAULT_PARKING_CONFIG = {
  vehicles: [
    { id: 'bike', label: 'Bike', pricePerHour: 20 },
    { id: 'car', label: 'Car', pricePerHour: 50 },
    { id: 'bus', label: 'Bus', pricePerHour: 100 },
  ],
  maxDuration: 6,
  eventHours: 3,
};

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

export const titleCase = (s) => {
  const str = String(s || '');
  return str ? str.charAt(0).toUpperCase() + str.slice(1) : '';
};

/** Booking-flow state → vehicle rows [{ vehicleType, count }] (new or legacy single-type shape). */
export function parkingRowsFromState(state = {}) {
  if (Array.isArray(state.parkingVehicles)) {
    return state.parkingVehicles
      .filter((r) => r && r.vehicleType && num(r.count) > 0)
      .map((r) => ({ vehicleType: r.vehicleType, count: Math.floor(num(r.count)) }));
  }
  if (state.selectedVehicle) {
    const count = state.vehicleCount === undefined ? 1 : Math.floor(num(state.vehicleCount));
    return count > 0 ? [{ vehicleType: state.selectedVehicle, count }] : [];
  }
  return [];
}

/** Hours that will be billed for the booking-flow state. */
export function parkingHoursFromState(state = {}) {
  if (state.parkingMode === 'event') return Math.max(1, Math.floor(num(state.parkingEventHours)) || DEFAULT_PARKING_CONFIG.eventHours);
  return Math.max(1, Math.floor(num(state.parkingDuration)) || 2);
}

/** Σ rate × count × hours. `rates` is { [vehicleType]: pricePerHour }. */
export function computeParkingCharge(rows, rates = {}, hours = 2) {
  const h = Math.max(1, num(hours) || 2);
  return (rows || []).reduce((s, r) => s + Math.max(0, num(rates[r.vehicleType])) * Math.max(0, Math.floor(num(r.count))), 0) * h;
}

/** Charge for a whole booking-flow state (0 when skipped / hall / nothing chosen). */
export function parkingChargeFromState(state = {}) {
  if (state.bookingType === 'hall' || state.parkingSkipped) return 0;
  const rows = parkingRowsFromState(state);
  if (!rows.length) return 0;
  return computeParkingCharge(rows, state.parkingRates || {}, parkingHoursFromState(state));
}

/**
 * Stored AdvanceBooking.parkingDetails → { vehicles, hours, mode, startTime, total, active }.
 * Old single-type bookings ({ vehicleType, count }) become a one-row list
 * (the server does the same on read; this also covers cached payloads).
 */
export function normalizeParkingDetails(pd) {
  if (!pd || typeof pd !== 'object') return { vehicles: [], hours: 0, mode: 'custom', startTime: null, total: 0, active: false };
  let vehicles = (Array.isArray(pd.vehicles) ? pd.vehicles : []).filter((v) => v && v.vehicleType && num(v.count) > 0);
  if (!vehicles.length && pd.vehicleType && num(pd.count) > 0) vehicles = [{ vehicleType: pd.vehicleType, count: num(pd.count) }];
  const hours = parseInt(pd.timeDuration, 10) || 0;
  const total = vehicles.reduce((s, v) => s + (v.amount != null ? num(v.amount) : 0), 0);
  return {
    vehicles,
    hours,
    mode: pd.mode || 'custom',
    startTime: pd.startTime || null,
    total,
    active: !pd.isSkipped && vehicles.length > 0,
  };
}

/** "3 Cars, 5 Bikes" */
export function describeVehicles(vehicles, labels = {}) {
  return (vehicles || [])
    .map((v) => `${v.count} ${v.label || labels[v.vehicleType] || titleCase(v.vehicleType)}`)
    .join(', ');
}

/** "19:30" → "7:30 PM" */
export function formatHHMM(hhmm) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || ''));
  if (!m) return '';
  const h = Number(m[1]);
  return `${h % 12 || 12}:${m[2]} ${h >= 12 ? 'PM' : 'AM'}`;
}

/** Human description of when the parking applies. */
export function describeParkingTime({ mode, hours, startTime }) {
  const hrs = `${hours} ${Number(hours) === 1 ? 'hr' : 'hrs'}`;
  if (mode === 'event') return `Whole event (${hrs}${startTime ? ` from ${formatHHMM(startTime)}` : ''})`;
  return startTime ? `${formatHHMM(startTime)} for ${hrs}` : hrs;
}
