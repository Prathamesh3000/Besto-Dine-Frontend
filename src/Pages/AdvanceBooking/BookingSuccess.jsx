import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ChevronLeft, Check, Calendar, Clock, MapPin, Download, Users, CreditCard, Receipt, CalendarPlus } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import toast from 'react-hot-toast';
import { useAuth } from '../../Context/AuthContext';
import { settingsAPI } from '../../utils/api';
import { activeRestaurantPath } from '../../utils/tenant';
import useBlockBackNav from '../../hooks/useBlockBackNav';
import {
    parkingRowsFromState,
    parkingHoursFromState,
    parkingChargeFromState,
    describeParkingTime,
    describeVehicles,
} from './parkingUtils';

// Normalise a free-form booking time like "8 PM", "8-9 PM", "20:00",
// "8:30 PM" into a 24-hour "HH:MM". Falls back to 19:00 if unparseable
// so calendar/receipt outputs never break on malformed input.
function to24h(raw) {
    if (!raw) return '19:00';
    const s = String(raw).trim();
    const hhmm = s.match(/^(\d{1,2}):(\d{2})/);
    if (hhmm) {
        const h = String(Math.min(23, parseInt(hhmm[1], 10))).padStart(2, '0');
        return `${h}:${hhmm[2]}`;
    }
    const range = s.match(/^(\d{1,2})\s*-\s*\d{1,2}\s*(AM|PM)/i);
    if (range) {
        let h = parseInt(range[1], 10);
        const isPm = /PM/i.test(range[2]);
        if (isPm && h < 12) h += 12;
        if (!isPm && h === 12) h = 0;
        return `${String(h).padStart(2, '0')}:00`;
    }
    const ampm = s.match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)/i);
    if (ampm) {
        let h = parseInt(ampm[1], 10);
        const m = ampm[2] || '00';
        const isPm = /PM/i.test(ampm[3]);
        if (isPm && h < 12) h += 12;
        if (!isPm && h === 12) h = 0;
        return `${String(h).padStart(2, '0')}:${m}`;
    }
    return '19:00';
}

// Build an RFC-5545 .ics calendar invite the user's OS can hand to its
// default calendar app (Apple Calendar on macOS/iOS, Mail/Calendar or
// Outlook on Windows, Calendar on Android, etc.). Times are emitted in
// local-floating format (no Z) so the calendar app interprets them in
// the restaurant's local time without DST/timezone math going sideways.
function buildIcsInvite({ bookingId, bookingDate, bookingTime, durationHours = 2, summary, description, location }) {
    if (!bookingDate) return null;
    const [y, m, d] = String(bookingDate).split('-');
    const [hh, mm] = to24h(bookingTime).split(':');
    const startLocal = `${y}${m}${d}T${hh}${mm}00`;
    const endHourRaw = parseInt(hh, 10) + Math.floor(durationHours);
    const endHour = String(Math.min(23, endHourRaw)).padStart(2, '0');
    const endLocal = `${y}${m}${d}T${endHour}${mm}00`;

    const now = new Date();
    const dtstamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');

    // RFC 5545 text-value escaping — commas, semicolons, newlines.
    const esc = (v) => String(v || '').replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');

    return [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//BestoDine//Advance Booking//EN',
        'CALSCALE:GREGORIAN',
        'METHOD:PUBLISH',
        'BEGIN:VEVENT',
        `UID:${bookingId || 'booking'}@bestodine.in`,
        `DTSTAMP:${dtstamp}`,
        `DTSTART:${startLocal}`,
        `DTEND:${endLocal}`,
        `SUMMARY:${esc(summary)}`,
        `DESCRIPTION:${esc(description)}`,
        `LOCATION:${esc(location)}`,
        'STATUS:CONFIRMED',
        'TRANSP:OPAQUE',
        'BEGIN:VALARM',
        'TRIGGER:-PT1H',
        'ACTION:DISPLAY',
        `DESCRIPTION:${esc(summary)} in 1 hour`,
        'END:VALARM',
        'END:VEVENT',
        'END:VCALENDAR',
    ].join('\r\n');
}

const BookingSuccess = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();

  // Guard against direct navigation. This page is intended only as the
  // landing after a successful Razorpay capture (Payment.jsx pushes the
  // full bookingData into location.state). If the customer reaches it
  // by hard-refreshing or pasting the URL, location.state is null and
  // every field renders as "Not set" / ₹0 / em-dash — which looks like
  // a broken receipt. Bounce them to booking history instead, where
  // they can find any real booking they want to review.
  React.useEffect(() => {
    const s = location.state || {};
    const hasRealBooking = s.orderId || s.selectedDate || s.bookingType;
    if (!hasRealBooking) {
      navigate('/customer/booking-history', { replace: true });
    }
  }, [location.state, navigate]);

  // Block back-button after payment. Customer landed here only after a
  // successful Razorpay capture; back-nav must redirect to /customer/home
  // instead of returning to the Payment / Review screens where they
  // could re-trigger a charge or edit a finalised booking.
  useBlockBackNav('/customer/home');

  const {
    orderId,
    total,
    bookingTotal,
    selectedDate,
    selectedTime,
    selectedTimeType,
    timeSlot,
    guests,
    bookingType,
    selectedHall,
    selectedPackage,
    selectedDecor,
    selectedEventName,
    selectedTableNames,
    selectedFlavorName,
    selectedSizeName,
    quantity,
    isVeg,
    specialMessage,
    selectedTypeNames,
    selectedAddonDetails,
    parkingSkipped,
    couponCode,
    couponDiscount,
    walletPointsUsed,
    walletRupeesUsed,
    pricesBreakdown,
    paymentType,
    paymentMethod,
    razorpayPaymentId,
  } = location.state || {};

  const formatDate = (dateStr) => {
    if (!dateStr) return 'Not set';
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  // Full restaurant profile for the receipt — name, contact, legal IDs,
  // and logo. Previously only `address` was fetched, which left the
  // printed receipt without any branding/identification. Defensive
  // empty-string defaults so a missing setting renders as blank rather
  // than `undefined`.
  const [cafeProfile, setCafeProfile] = useState({
    cafeName: '',
    contactNumber: '',
    email: '',
    address: '',
    logoUrl: '',
    legalBusinessName: '',
    fssaiLicense: '',
    gstin: '',
    pan: '',
  });
  useEffect(() => {
    settingsAPI.getSettings().then(res => {
      const g = res.data?.general || {};
      setCafeProfile({
        cafeName: g.cafeName || '',
        contactNumber: g.contactNumber || '',
        email: g.email || '',
        address: g.address || '',
        logoUrl: g.logoUrl || '',
        legalBusinessName: g.legal?.legalBusinessName || '',
        fssaiLicense: g.legal?.fssaiLicense || '',
        gstin: g.legal?.gstin || '',
        pan: g.legal?.pan || '',
      });
    }).catch(() => {});
  }, []);
  const cafeAddress = cafeProfile.address;

  // Amounts
  const fullAmount = bookingTotal || total || 0;
  const paidAmount = total || 0;
  const remainingAmount = paymentType === 'advance' ? fullAmount - paidAmount : 0;

  // Location
  const bookingLocation = selectedHall?.location || (() => {
    try { return JSON.parse(localStorage.getItem('selectedBranch') || '{}').addressLine1 || ''; } catch { return ''; }
  })() || cafeAddress || 'Location not specified';

  // Payment method label
  const paymentLabel = paymentMethod === 'cash' ? 'Cash (at counter)'
    : paymentMethod === 'upi' ? 'UPI'
    : paymentMethod === 'card' ? 'Card'
    : paymentMethod === 'wallet' ? 'Wallet'
    : paymentMethod || 'Not specified';

  const fmtPrice = (val) => `₹${(val || 0).toLocaleString('en-IN')}`;

  // Add to Calendar — generate a .ics invite and hand it to the OS so
  // the system's default calendar app handles it (Apple Calendar on
  // macOS/iOS, Mail+Calendar or Outlook on Windows, Calendar on
  // Android). Browsers can't *directly* launch a native app from a
  // click, but the .ics file association on every modern OS is the
  // standard route for "open in default calendar".
  //
  // UX note: on Chrome/Edge with "Ask where to save each file" the
  // user will see a Save As prompt before the OS opens the file —
  // that's a per-user browser setting, not something we control. The
  // toast tells them what to expect either way.
  const handleAddToCalendar = () => {
    const ics = buildIcsInvite({
      bookingId: orderId,
      bookingDate: selectedDate,
      bookingTime: selectedTime,
      durationHours: Number(location.state?.durationHours) || (bookingType === 'hall' ? 5 : 2),
      summary: `${bookingType === 'hall' ? 'Hall' : 'Table'} reservation at ${cafeProfile.cafeName || selectedHall?.title || 'BestoDine'}`,
      description: `Booking ID: ${orderId || ''}\nGuests: ${guests || '—'}\n${selectedEventName ? `Event: ${selectedEventName}\n` : ''}Show this confirmation at the venue.`,
      location: bookingLocation,
    });
    if (!ics) return;
    const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Booking_${orderId || 'reservation'}.ics`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      window.URL.revokeObjectURL(url);
      a.remove();
    }, 0);
    toast.success('Open the downloaded .ics file to add the event to your calendar.', { duration: 4000 });
  };

  // Download Receipt — opens a properly structured printable HTML
  // receipt in a new tab. Includes:
  //   - Restaurant header (logo, name, address, phone, email, GSTIN, FSSAI)
  //   - Customer block (name, email, mobile)
  //   - Reservation block (date, time, guests, type, tables, hall, event, location, message)
  //   - Charges block (line-item breakdown: hall/package/decoration/cake/each-addon/parking/coupon/wallet → subtotal → discounts → total)
  //   - Payment block (method, paid, due, status, razorpay id)
  //   - Terms footer (cancellation, contact for changes)
  // Renders as a clean A4 printable; user hits Ctrl/Cmd+P → Save as PDF.
  const handleDownloadBill = () => {
    const esc = (v) => String(v ?? '').replace(/[&<>"']/g, c => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
    const row = (label, value, opts = {}) => {
      const cls = opts.muted ? ' muted-row' : '';
      return `<tr class="${cls}"><td class="lbl">${esc(label)}</td><td class="val">${esc(value)}</td></tr>`;
    };

    // Per-section blocks — each booking domain (Cake / Add-Ons / Parking
    // / Hall) gets its own card with detail rows + a "Charges" total,
    // matching the layout of the Booking Review screen so the receipt
    // is visually consistent with what the customer saw.
    //
    // Robustness note: `pricesBreakdown` is the authoritative source
    // when present, but the receipt MUST also render when only the raw
    // state fields (selectedAddonDetails, selectedFlavorName, etc.) are
    // available — e.g. after a soft HMR reload or an older payment path
    // that pre-dates the breakdown field. So each section computes its
    // own total with a sensible fallback:
    //   - Add-ons: sum prices from selectedAddonDetails (always exact)
    //   - Parking: rate × count × duration, looked up from parkingRates
    //   - Cake: fall back to (full total − everything else) so the row
    //     still has a number even when the explicit cake price is lost
    //   - Hall / package / decoration: prefer pb, fall back to displayed
    //     values from the related selection objects
    const pb = pricesBreakdown || {};

    // Add-on total from the array itself — always reliable since the
    // array is populated by AddOns.jsx with the duration-adjusted price.
    const computedAddonTotal = Array.isArray(selectedAddonDetails)
      ? selectedAddonDetails.reduce((s, a) => s + (Number(a.price) || 0), 0)
      : 0;
    const addonTotal = pb.addon || computedAddonTotal;

    // Parking total — recompute from rate × count × hours if pb missing.
    const parkingRows = parkingSkipped ? [] : parkingRowsFromState(location.state || {});
    const computedParking = parkingSkipped ? 0 : parkingChargeFromState(location.state || {});
    const parkingTotal = pb.parking || computedParking;

    // Hall components.
    const hallTotal = pb.hall || 0;
    const packageTotal = pb.package || (selectedPackage?.price ? selectedPackage.price * (guests || 1) : 0);
    const decorationTotal = pb.decoration || parseInt(String(selectedDecor?.basePrice ?? selectedDecor?.price ?? '0').replace(/[^\d]/g, ''), 10) || 0;
    const hallSectionTotal = hallTotal + packageTotal + decorationTotal;

    // Cake total. If pb.cake is missing, derive it by subtracting every
    // other known component from `fullAmount` so the customer still
    // sees a number that matches what they paid.
    const otherTotalsSum = hallSectionTotal + addonTotal + parkingTotal;
    const derivedCake = Math.max(0, (fullAmount + Number(couponDiscount || pb.discount || 0) + Number(walletRupeesUsed || 0)) - otherTotalsSum);
    const cakeTotal = pb.cake || (selectedFlavorName ? derivedCake : 0);

    const subtotalBeforeDiscounts = hallSectionTotal + cakeTotal + addonTotal + parkingTotal;

    const chargesRow = (price) =>
      `<tr class="charges-row"><td class="lbl">Charges</td><td class="val">${esc(fmtPrice(price))}</td></tr>`;

    // Hall block (hall bookings).
    let hallSection = '';
    if (bookingType === 'hall' && (selectedHall || selectedPackage || selectedDecor)) {
      hallSection = `<div class="section">
        <p class="section-title">Hall Booking</p>
        <table>
          ${selectedHall?.title ? row('Hall', selectedHall.title) : ''}
          ${selectedPackage ? row('Package', `${selectedPackage.name || selectedPackage.title || 'Catering'} × ${guests || 1}`) : ''}
          ${selectedDecor ? row('Decoration', selectedDecor.name || selectedDecor.title || 'Decor') : ''}
          ${chargesRow(hallSectionTotal)}
        </table>
      </div>`;
    }

    // Cake block — renders whenever a flavour was chosen, regardless of
    // whether pricesBreakdown is in state. Was previously hidden when
    // pb.cake was missing.
    let cakeSection = '';
    if (selectedFlavorName || cakeTotal > 0) {
      cakeSection = `<div class="section">
        <p class="section-title">Cake Booking</p>
        <table>
          ${selectedFlavorName ? row('Flavour', selectedFlavorName) : ''}
          ${typeof isVeg === 'boolean' ? row('Type', isVeg ? 'Veg' : 'Non-Veg') : ''}
          ${selectedSizeName ? row('Size', selectedSizeName) : ''}
          ${quantity ? row('Quantity', quantity) : ''}
          ${chargesRow(cakeTotal)}
        </table>
      </div>`;
    }

    // Add-Ons block — renders whenever there's at least one addon in
    // the array. Was previously hidden when pb.addon was missing.
    let addonsSection = '';
    if (Array.isArray(selectedAddonDetails) && selectedAddonDetails.length > 0) {
      const addonRows = selectedAddonDetails.map(a => {
        const price = Number(a.price) || 0;
        const dur = a.durationLabel ? `<div class="addon-meta">Duration: ${esc(a.durationLabel)}</div>` : '';
        return `<tr class="addon-row">
          <td class="lbl"><div class="addon-title">${esc(a.title || 'Add-on')}</div>${dur}</td>
          <td class="val">${esc(fmtPrice(price))}</td>
        </tr>`;
      }).join('');
      addonsSection = `<div class="section">
        <p class="section-title">Add-Ons</p>
        <table>
          ${addonRows}
          ${chargesRow(addonTotal)}
        </table>
      </div>`;
    }

    // Parking block — renders whenever a vehicle was selected and the
    // customer didn't skip parking. Was previously hidden when
    // pb.parking was missing.
    let parkingSection = '';
    if (parkingRows.length > 0) {
      const parkingTime = describeParkingTime({
        mode: location.state?.parkingMode === 'event' ? 'event' : 'custom',
        hours: parkingHoursFromState(location.state || {}),
        startTime: location.state?.parkingStartTime,
      });
      parkingSection = `<div class="section">
        <p class="section-title">Parking Booking</p>
        <table>
          ${row('Vehicles', describeVehicles(parkingRows, location.state?.parkingLabels || {}))}
          ${row('Parking time', parkingTime)}
          ${chargesRow(parkingTotal)}
        </table>
      </div>`;
    }

    const hasLineItems = !!(hallSection || cakeSection || addonsSection || parkingSection);
    const discountVal = Number(couponDiscount || pb.discount || 0);
    const walletVal = Number(walletRupeesUsed || 0);
    const hasAdjustments = discountVal > 0 || walletVal > 0;

    const addressBlock = [
      cafeProfile.address || bookingLocation || '',
    ].filter(Boolean).join('<br/>');

    const legalParts = [
      cafeProfile.gstin && `GSTIN: ${cafeProfile.gstin}`,
      cafeProfile.fssaiLicense && `FSSAI: ${cafeProfile.fssaiLicense}`,
      cafeProfile.pan && `PAN: ${cafeProfile.pan}`,
    ].filter(Boolean).join('  ·  ');

    const contactParts = [
      cafeProfile.contactNumber && `📞 ${cafeProfile.contactNumber}`,
      cafeProfile.email && `✉ ${cafeProfile.email}`,
    ].filter(Boolean).join('  ·  ');

    const issuedAt = new Date().toLocaleString('en-IN', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit', hour12: true,
    });

    const paymentStatus = remainingAmount > 0 ? 'Partial — Advance paid' : 'Paid in full';

    const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Booking Receipt · ${esc(orderId || '')}</title>
<style>
  *, *::before, *::after { box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
    color: #1A181B; background: #f6f6f7; margin: 0; padding: 32px 16px;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }
  .receipt {
    max-width: 640px; margin: 0 auto; background: #fff;
    border: 1px solid #ECECEC; border-radius: 16px; overflow: hidden;
    box-shadow: 0 4px 18px rgba(0,0,0,0.04);
  }

  /* ── Restaurant header ────────────────────────────────────────── */
  .resto-head {
    padding: 22px 28px 18px;
    border-bottom: 1px solid #F2F2F2;
    display: flex; gap: 16px; align-items: flex-start;
  }
  .resto-logo {
    width: 56px; height: 56px; border-radius: 12px; object-fit: cover;
    background: #FFF3E0; flex-shrink: 0;
  }
  .resto-logo-fallback {
    width: 56px; height: 56px; border-radius: 12px; display: flex;
    align-items: center; justify-content: center; font-weight: 800;
    font-size: 24px; color: #FE8301; background: #FFF3E0; flex-shrink: 0;
  }
  .resto-info { flex: 1; min-width: 0; }
  .resto-name { font-size: 20px; font-weight: 800; color: #1A181B; letter-spacing: -0.2px; }
  .resto-legal-name { font-size: 12px; color: #645E66; margin-top: 2px; }
  .resto-meta { font-size: 12px; color: #645E66; margin-top: 6px; line-height: 1.5; }
  .resto-legal { font-size: 11px; color: #8D848F; margin-top: 6px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }

  /* ── Booking banner ───────────────────────────────────────────── */
  .banner {
    background: linear-gradient(135deg, #FE8301 0%, #FFA640 100%);
    color: #fff; padding: 18px 28px;
    display: flex; justify-content: space-between; align-items: center; gap: 12px;
  }
  .banner-title { font-size: 13px; font-weight: 700; letter-spacing: 1.2px; text-transform: uppercase; opacity: 0.95; }
  .banner-id { font-size: 18px; font-weight: 800; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; margin-top: 2px; }
  .banner-issued { font-size: 11px; opacity: 0.9; text-align: right; line-height: 1.4; }

  /* ── Body sections ────────────────────────────────────────────── */
  .body { padding: 22px 28px 8px; }
  .section { margin-bottom: 22px; }
  .section-title {
    font-size: 11px; font-weight: 700; color: #8D848F; letter-spacing: 1.5px;
    text-transform: uppercase; margin: 0 0 10px;
  }

  table { width: 100%; border-collapse: collapse; }
  td { padding: 6px 0; font-size: 13.5px; vertical-align: top; }
  td.lbl { color: #645E66; width: 45%; }
  td.val { color: #1A181B; font-weight: 600; text-align: right; }
  tr.muted-row td { color: #8D848F; font-weight: 500; }

  /* ── Per-section charges row (Cake / Add-Ons / Parking / Hall) ─── */
  .charges-row td { padding-top: 10px; border-top: 1px dashed #E4E4E4; font-weight: 700; }
  .charges-row td.val { color: #FE8301; }

  /* ── Add-on row layout (title + duration meta) ────────────────── */
  .addon-row td { padding: 6px 0; }
  .addon-title { font-weight: 600; color: #1A181B; }
  .addon-meta { font-size: 11.5px; color: #8D848F; margin-top: 2px; }

  /* ── Bill Summary block ───────────────────────────────────────── */
  .bill-tbl td { padding: 8px 0; }
  .subtotal-row td { font-weight: 700; }
  .discount-row td.val { color: #2E8B57; }
  .wallet-row td.val { color: #2E8B57; }
  .total-row td {
    border-top: 2px solid #1A181B; padding-top: 14px;
    font-size: 16px; font-weight: 800;
  }
  .total-row td.val { color: #FE8301; }

  /* ── Payment block colours ────────────────────────────────────── */
  .paid-row td.val { color: #2E8B57; }
  .due-row td.val { color: #C0392B; }
  .status-pill {
    display: inline-block; padding: 3px 10px; border-radius: 999px;
    font-size: 11px; font-weight: 700; letter-spacing: 0.4px;
  }
  .status-paid { background: #E5FFEB; color: #027A48; }
  .status-partial { background: #FFF3E0; color: #B05500; }

  /* ── Footer ───────────────────────────────────────────────────── */
  .footer {
    border-top: 1px solid #F2F2F2; padding: 16px 28px 22px;
    color: #645E66; font-size: 11.5px; line-height: 1.55;
  }
  .footer strong { color: #1A181B; }
  .terms { margin-top: 8px; padding-left: 16px; }
  .terms li { margin: 2px 0; }

  /* ── Print actions (hidden when printing) ─────────────────────── */
  .actions {
    max-width: 640px; margin: 16px auto 0; display: flex; gap: 12px; justify-content: center;
  }
  .actions button {
    padding: 10px 22px; border-radius: 12px; border: 0; font-weight: 600; cursor: pointer; font-size: 14px;
  }
  .actions .primary { background: #FE8301; color: #fff; }
  .actions .ghost { background: #F2F2F2; color: #1A181B; }

  @media print {
    body { background: #fff; padding: 0; }
    .receipt { box-shadow: none; border: 0; border-radius: 0; max-width: none; }
    .actions { display: none; }
  }
</style>
</head>
<body>
  <div class="receipt">

    <!-- Restaurant header -->
    <div class="resto-head">
      ${cafeProfile.logoUrl
        ? `<img class="resto-logo" src="${esc(cafeProfile.logoUrl)}" alt="${esc(cafeProfile.cafeName || 'Restaurant')}" />`
        : `<div class="resto-logo-fallback">${esc((cafeProfile.cafeName || 'B').charAt(0).toUpperCase())}</div>`}
      <div class="resto-info">
        <div class="resto-name">${esc(cafeProfile.cafeName || 'BestoDine')}</div>
        ${cafeProfile.legalBusinessName ? `<div class="resto-legal-name">${esc(cafeProfile.legalBusinessName)}</div>` : ''}
        ${addressBlock ? `<div class="resto-meta">${addressBlock}</div>` : ''}
        ${contactParts ? `<div class="resto-meta">${esc(contactParts).replace(/&middot;/g, '·')}</div>` : ''}
        ${legalParts ? `<div class="resto-legal">${esc(legalParts)}</div>` : ''}
      </div>
    </div>

    <!-- Booking banner -->
    <div class="banner">
      <div>
        <div class="banner-title">Booking Receipt</div>
        <div class="banner-id">${esc(orderId || '—')}</div>
      </div>
      <div class="banner-issued">
        Issued<br/>${esc(issuedAt)}
      </div>
    </div>

    <div class="body">

      <!-- Customer block -->
      ${user?.name ? `<div class="section">
        <p class="section-title">Customer</p>
        <table>
          ${row('Name', user?.name)}
          ${user?.email ? row('Email', user.email) : ''}
          ${user?.mobile ? row('Mobile', user.mobile) : ''}
        </table>
      </div>` : ''}

      <!-- Seating Option (for table bookings) -->
      ${bookingType !== 'hall' && Array.isArray(selectedTypeNames) && selectedTypeNames.length > 0 ? `<div class="section">
        <p class="section-title">Seating Option</p>
        <table>
          ${row('Selected type', selectedTypeNames.join(', '))}
        </table>
      </div>` : ''}

      <!-- Reservation / table-booking details -->
      <div class="section">
        <p class="section-title">${bookingType === 'hall' ? 'Hall Booking Details' : 'Table Booking Details'}</p>
        <table>
          ${row('Guests', guests || '—')}
          ${bookingType !== 'hall' && Array.isArray(selectedTableNames) && selectedTableNames.length > 0
            ? row('Selected table(s)', selectedTableNames.join(', ')) : ''}
          ${row('Date', formatDate(selectedDate))}
          ${row('Time', `${selectedTime || 'Not set'}${selectedTimeType || timeSlot ? ` (${selectedTimeType || timeSlot})` : ''}`)}
          ${selectedEventName ? row('Special event', selectedEventName) : ''}
          ${specialMessage ? row('Special message', specialMessage) : ''}
          ${row('Location', bookingLocation)}
        </table>
      </div>

      <!-- Hall booking (if applicable) -->
      ${hallSection}

      <!-- Cake booking (if cake selected) -->
      ${cakeSection}

      <!-- Add-Ons (if any) -->
      ${addonsSection}

      <!-- Parking (if any) -->
      ${parkingSection}

      <!-- Bill Summary — subtotal of all sections, discounts, final total -->
      <div class="section">
        <p class="section-title">Bill Summary</p>
        <table class="bill-tbl">
          ${hasLineItems ? `<tr class="subtotal-row"><td class="lbl">Subtotal</td><td class="val">${esc(fmtPrice(subtotalBeforeDiscounts))}</td></tr>` : ''}
          ${discountVal > 0 ? `<tr class="discount-row"><td class="lbl">Coupon discount${couponCode ? ` (${esc(couponCode)})` : ''}</td><td class="val">− ${esc(fmtPrice(discountVal))}</td></tr>` : ''}
          ${walletVal > 0 ? `<tr class="wallet-row"><td class="lbl">Wallet points used${walletPointsUsed ? ` (${esc(walletPointsUsed)} pts)` : ''}</td><td class="val">− ${esc(fmtPrice(walletVal))}</td></tr>` : ''}
          <tr class="total-row"><td class="lbl">Total amount</td><td class="val">${esc(fmtPrice(fullAmount))}</td></tr>
        </table>
      </div>

      <!-- Payment block -->
      <div class="section">
        <p class="section-title">Payment</p>
        <table>
          ${row('Method', paymentLabel)}
          ${razorpayPaymentId ? row('Transaction ID', razorpayPaymentId) : ''}
          <tr class="paid-row"><td class="lbl">Amount paid${paymentType === 'advance' ? ' (50% advance)' : ''}</td><td class="val">${esc(fmtPrice(paidAmount))}</td></tr>
          ${remainingAmount > 0 ? `<tr class="due-row"><td class="lbl">Due on event day</td><td class="val">${esc(fmtPrice(remainingAmount))}</td></tr>` : ''}
          <tr><td class="lbl">Status</td><td class="val"><span class="status-pill ${remainingAmount > 0 ? 'status-partial' : 'status-paid'}">${esc(paymentStatus)}</span></td></tr>
        </table>
      </div>

    </div>

    <!-- Footer / terms -->
    <div class="footer">
      <strong>Thank you for choosing ${esc(cafeProfile.cafeName || 'BestoDine')}.</strong> Please show this receipt at the venue.
      <ul class="terms">
        <li>Reservation is held for 15 minutes past the booked time.</li>
        ${remainingAmount > 0 ? `<li>Remaining ${esc(fmtPrice(remainingAmount))} is payable at the venue on the event day.</li>` : ''}
        <li>Cancellation and refund follow the restaurant's policy; contact the restaurant directly for changes.</li>
        ${cafeProfile.contactNumber ? `<li>For assistance, call <strong>${esc(cafeProfile.contactNumber)}</strong>${cafeProfile.email ? ` or email <strong>${esc(cafeProfile.email)}</strong>` : ''}.</li>` : ''}
      </ul>
      <p style="margin-top: 10px; text-align: center; color: #8D848F;">
        This is a computer-generated receipt and does not require a signature.
      </p>
    </div>
  </div>

  <div class="actions">
    <button class="primary" onclick="window.print()">Print / Save as PDF</button>
    <button class="ghost" id="closeBtn">Close</button>
  </div>
  <script>
    // Auto-open the print dialog so the user lands directly on
    // "Save as PDF" — matches what most booking sites do.
    window.addEventListener('load', () => setTimeout(() => window.print(), 250));
    // Smart close: window.close() only works on script-opened windows.
    // When the popup is blocked and the receipt opens in the current
    // tab via blob: URL, window.close() is a silent no-op (browser
    // security blocks closing user-opened tabs). Fall back to
    // navigating the user back to the page they came from so the
    // Close button never feels broken.
    document.getElementById('closeBtn').addEventListener('click', () => {
      const fallbackUrl = ${JSON.stringify(window.location.origin + '/customer/booking-history')};
      window.close();
      // If we're still here ~150ms later, close was a no-op — go back.
      setTimeout(() => {
        if (!window.closed) {
          if (window.history.length > 1) window.history.back();
          else window.location.href = fallbackUrl;
        }
      }, 150);
    });
  </script>
</body>
</html>`;

    const win = window.open('', '_blank', 'noopener,noreferrer,width=720,height=860');
    if (!win) {
      // Popup blocked — fall back to opening in current tab via blob URL.
      const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
      const url = window.URL.createObjectURL(blob);
      window.location.href = url;
      return;
    }
    win.document.open();
    win.document.write(html);
    win.document.close();
  };

  // Detail row component
  const DetailRow = ({ icon: Icon, label, value }) => (
    <div className="flex items-start gap-3">
      <Icon size={18} className="text-[#8D848F] shrink-0 mt-0.5" />
      <div className="flex-1 flex justify-between gap-3">
        <span className="text-[#8D848F] font-varela text-[14px]">{label}</span>
        <span className="text-[#1A181B] font-varela text-[14px] font-semibold text-right break-words min-w-0">{value}</span>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#FDFDFD] font-manrope flex flex-col">

      {/* Mobile Header */}
      <header className="lg:hidden px-5 py-4 flex items-center justify-between sticky top-0 bg-white z-40 border-b border-gray-50">
        <button onClick={() => navigate(activeRestaurantPath())} className="p-1 -ml-1">
          <ChevronLeft size={24} className="text-[#1A181B]" />
        </button>
        <h1 className="text-[16px] font-[700] text-[#1A181B]">
          Booking Confirmed
        </h1>
        <div className="w-8" />
      </header>

      {/* Main Content */}
      <main className="flex-1 w-full max-w-[600px] mx-auto px-5 pb-28 lg:pb-12">

        {/* Success Icon */}
        <div className="flex flex-col items-center pt-8 pb-6">
          <div className="w-16 h-16 bg-[#34C759] rounded-full flex items-center justify-center mb-4 shadow-lg shadow-green-500/20">
            <Check size={36} className="text-white" strokeWidth={3} />
          </div>
          <h2 className="text-[22px] font-[800] text-[#1A181B] mb-1">Booking Confirmed!</h2>
          {orderId && (
            <p className="text-[14px] text-[#8D848F] font-[500]">Order ID: {orderId}</p>
          )}
        </div>

        {/* CUS-073: Check-in QR — host scans this on arrival. Encodes a
            JSON blob with the booking id + date so a future scanner app
            can fetch and verify against the backend. Falls back to just
            the bookingId string if anything's missing. */}
        {orderId && (
          <div className="bg-white rounded-[20px] border border-[#F2F4F7] p-5 shadow-[0px_2px_12px_rgba(0,0,0,0.02)] mb-4">
            <div className="flex flex-col items-center text-center">
              <h3 className="text-[16px] font-[700] text-[#1A181B] mb-1">Your check-in QR</h3>
              <p className="text-[12px] text-[#8D848F] font-[500] mb-4">
                Show this at the venue. Our team scans it to mark you as arrived.
              </p>
              <div className="bg-white p-3 rounded-[16px] border border-[#F2F4F7] mb-3">
                <QRCodeSVG
                  value={JSON.stringify({ bookingId: orderId, date: selectedDate, time: selectedTime, type: bookingType || 'table' })}
                  size={172}
                  level="M"
                  includeMargin={false}
                  fgColor="#1A181B"
                  bgColor="#FFFFFF"
                />
              </div>
              <p className="text-[11px] text-[#8D848F] font-varela">
                Booking ID: <span className="font-semibold text-[#1A181B]">{orderId}</span>
              </p>
            </div>
          </div>
        )}

        {/* Payment Summary Card */}
        <div className="bg-white rounded-[20px] border border-[#F2F4F7] p-5 shadow-[0px_2px_12px_rgba(0,0,0,0.02)] mb-4">
          <div className="flex justify-between items-center mb-4">
            <span className="text-[15px] font-[600] text-[#645E66]">Total Booking Amount</span>
            <span className="text-[20px] font-[800] text-[#1A181B]">{fmtPrice(fullAmount)}</span>
          </div>

          <div className="border-t border-dashed border-[#F2F4F7] pt-4 space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-[14px] font-[500] text-[#645E66]">Amount Paid</span>
              <span className="text-[16px] font-[700] text-[#34C759]">{fmtPrice(paidAmount)}</span>
            </div>
            {remainingAmount > 0 && (
              <div className="flex justify-between items-center">
                <span className="text-[14px] font-[500] text-[#645E66]">Remaining (pay at venue)</span>
                <span className="text-[16px] font-[700] text-[#FE8301]">{fmtPrice(remainingAmount)}</span>
              </div>
            )}
            <div className="flex justify-between items-center">
              <span className="text-[14px] font-[500] text-[#645E66]">Payment Method</span>
              <span className="text-[14px] font-[600] text-[#1A181B] capitalize">{paymentLabel}</span>
            </div>
          </div>
        </div>

        {/* Booking Details Card */}
        <div className="bg-white rounded-[20px] border border-[#F2F4F7] p-5 shadow-[0px_2px_12px_rgba(0,0,0,0.02)] mb-4">
          <h3 className="text-[16px] font-[700] text-[#1A181B] mb-4">Booking Details</h3>
          <div className="space-y-4">
            <DetailRow icon={Calendar} label="Date" value={formatDate(selectedDate)} />
            <DetailRow icon={Clock} label="Time" value={selectedTime ? `${selectedTime} (${selectedTimeType || timeSlot || ''})`.trim() : 'Not set'} />
            <DetailRow icon={MapPin} label="Location" value={bookingLocation} />
            {guests && <DetailRow icon={Users} label="Guests" value={guests} />}
            {bookingType && (
              <DetailRow icon={Receipt} label="Booking Type" value={bookingType === 'hall' ? 'Hall Booking' : 'Table Booking'} />
            )}
            {selectedHall && (
              <DetailRow icon={Receipt} label="Hall" value={selectedHall.title || selectedHall.name || '—'} />
            )}
          </div>

          {/* Action row: Add to Calendar + Download Receipt (CUS-073) */}
          <div className="border-t border-dashed border-[#F2F4F7] mt-5 pt-4 grid grid-cols-2 gap-2">
            <button
              onClick={handleAddToCalendar}
              className="flex items-center justify-center gap-2 w-full text-[#FE8301] font-[600] text-[13px] py-2 hover:bg-orange-50 rounded-[12px] transition-colors"
            >
              <CalendarPlus size={18} />
              Add to Calendar
            </button>
            <button
              onClick={handleDownloadBill}
              className="flex items-center justify-center gap-2 w-full text-[#007AFF] font-[600] text-[13px] py-2 hover:bg-blue-50 rounded-[12px] transition-colors"
            >
              <Download size={18} />
              Download Receipt
            </button>
          </div>
        </div>

        {/* What's Next Card */}
        <div className="bg-white rounded-[20px] border border-[#F2F4F7] p-5 shadow-[0px_2px_12px_rgba(0,0,0,0.02)] mb-4">
          <h3 className="text-[16px] font-[700] text-[#1A181B] mb-5">What's Next?</h3>
          <div className="space-y-5">
            {[
              { title: 'Confirmation', desc: "You'll receive a WhatsApp and email confirmation within 1 hour" },
              { title: 'Admin Approval', desc: 'Our team will review and approve your booking within 24 hours' },
              { title: 'Event Coordination', desc: "We'll contact you 2 days before the event to finalize all details" },
            ].map((item, i) => (
              <div key={i} className="flex gap-4">
                <div className="w-8 h-8 rounded-full bg-[#FFF9F2] border border-[#FEE7CC] flex items-center justify-center shrink-0">
                  <span className="text-[13px] font-[700] text-[#FE8301]">{i + 1}</span>
                </div>
                <div>
                  <h4 className="text-[15px] font-[700] text-[#1A181B] mb-0.5">{item.title}</h4>
                  <p className="text-[13px] text-[#645E66] font-[500] leading-relaxed">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Thank You */}
        <div className="text-center py-4">
          <p className="text-[18px] font-[700] text-[#645E66]">Thank You!</p>
        </div>

        {/* Desktop Button */}
        <div className="hidden lg:flex justify-center mt-2 mb-8">
          <button
            onClick={() => navigate(activeRestaurantPath())}
            className="bg-[#FE8301] text-white font-[700] px-10 py-3.5 rounded-[16px] shadow-lg shadow-orange-100 hover:bg-[#e07400] transition-all"
          >
            Make Another Booking
          </button>
        </div>
      </main>

      {/* Mobile Bottom Button */}
      <div className="fixed bottom-0 left-0 right-0 bg-white p-4 z-50 lg:hidden shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">
        <button
          onClick={() => navigate(activeRestaurantPath())}
          className="w-full bg-[#FE8301] text-white font-[700] py-3.5 rounded-[16px] shadow-lg shadow-orange-100 active:scale-[0.98] transition-transform"
        >
          Make Another Booking
        </button>
      </div>
    </div>
  );
};

export default BookingSuccess;
