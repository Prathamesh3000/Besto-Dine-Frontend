export const BOOKING_FLOWS = {
  table: [
    '/customer/booking-type',
    '/customer/book-table-details',
    '/customer/cake-details',
    '/customer/add-ons',
    '/customer/parking-details',
    '/customer/booking-review',
    '/customer/advance-payment'
  ],
  hall: [
    '/customer/book-table-details',
    '/customer/hall-booking',
    '/customer/package-selection',
    '/customer/cake-details',
    '/customer/decoration',
    '/customer/add-ons',
    '/customer/booking-review',
    '/customer/advance-payment'
  ]
};

export const getBookingFlow = (type) => BOOKING_FLOWS[type] || BOOKING_FLOWS.table;

export const getStepInfo = (path, bookingType) => {
  const flow = getBookingFlow(bookingType);
  const index = flow.findIndex(p => p === path);
  
  // Basic path matching (ignoring query params/state)
  if (index === -1) {
    // Try fuzzy match if exact fails
    const fuzzyIndex = flow.findIndex(p => path.startsWith(p));
    if (fuzzyIndex !== -1) {
      return {
        current: fuzzyIndex + 1,
        total: flow.length
      };
    }
    return { current: 0, total: flow.length };
  }
  
  return {
    current: index + 1,
    total: flow.length
  };
};
