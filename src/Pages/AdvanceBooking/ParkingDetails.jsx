import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ChevronLeft, Minus, Plus, Trash2, Loader2 } from 'lucide-react';
import { bookingInfoAPI } from '../../utils/api';
import BookingProgressBar from './BookingProgressBar';
import RequiredMark from '../../Components/Common/RequiredMark';
import { reportMissingFields } from '../../utils/requiredFields';
import {
  DEFAULT_PARKING_CONFIG,
  parkingRowsFromState,
  computeParkingCharge,
  describeParkingTime,
} from './parkingUtils';
import BikeImg from "/bike.svg";
import CarImg from "/car.svg";
import BusImg from "/bus.svg";

const VEHICLE_ICONS = { bike: BikeImg, car: CarImg, bus: BusImg };
const MAX_PER_TYPE = 500;
const fmt = (v) => `₹${(Number(v) || 0).toLocaleString('en-IN')}`;

// QA N10 / N11 — one event can park several vehicle types (3 cars +
// 5 bikes), for the whole event or a chosen start time + duration. The
// rows / mode / hours travel in location.state to BookingReview (which
// shows the same price) and on to POST /advance-booking/create, where
// the server re-prices them from Settings.reservation.parking.
const ParkingDetails = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const st = location.state || {};

  const [config, setConfig] = useState(DEFAULT_PARKING_CONFIG);
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState(() => {
    const restored = parkingRowsFromState(st);
    return restored.length ? restored : [{ vehicleType: '', count: 1 }];
  });
  const [mode, setMode] = useState(st.parkingMode === 'custom' || (st.parkingMode === undefined && st.selectedVehicle) ? 'custom' : 'event');
  const [startTime, setStartTime] = useState(st.parkingStartTime || st.selectedStartTime || '');
  const [duration, setDuration] = useState(Number(st.parkingDuration) || 2);
  const [errors, setErrors] = useState({});

  useEffect(() => {
    let alive = true;
    bookingInfoAPI.getParkingRates().then((res) => {
      if (!alive || !res.data?.success || !res.data.parking) return;
      const p = res.data.parking;
      setConfig({
        vehicles: Array.isArray(p.vehicles) && p.vehicles.length ? p.vehicles : DEFAULT_PARKING_CONFIG.vehicles,
        maxDuration: Number(p.maxDuration) || DEFAULT_PARKING_CONFIG.maxDuration,
        eventHours: Number(p.eventHours) || DEFAULT_PARKING_CONFIG.eventHours,
      });
    }).catch(() => { /* defaults stay */ }).finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  const rates = useMemo(() => Object.fromEntries(config.vehicles.map((v) => [v.id, Number(v.pricePerHour) || 0])), [config]);
  const labels = useMemo(() => Object.fromEntries(config.vehicles.map((v) => [v.id, v.label])), [config]);
  const durationOptions = useMemo(() => Array.from({ length: config.maxDuration }, (_, i) => i + 1), [config.maxDuration]);

  // A restored duration above a lowered admin maximum snaps into range.
  const effectiveDuration = Math.min(Math.max(1, duration || 1), config.maxDuration);
  const hours = mode === 'event' ? config.eventHours : effectiveDuration;
  const validRows = rows.filter((r) => r.vehicleType && r.count > 0);
  const total = computeParkingCharge(validRows, rates, hours);
  const usedTypes = new Set(rows.map((r) => r.vehicleType).filter(Boolean));
  const canAddRow = rows.length < config.vehicles.length;

  const updateRow = (idx, patch) => {
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
    setErrors((e) => ({ ...e, vehicles: undefined }));
  };
  const removeRow = (idx) => setRows((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== idx) : [{ vehicleType: '', count: 1 }]));
  const addRow = () => {
    const next = config.vehicles.find((v) => !usedTypes.has(v.id));
    setRows((prev) => [...prev, { vehicleType: next ? next.id : '', count: 1 }]);
  };

  const parkingState = () => ({
    parkingVehicles: validRows.map((r) => ({ vehicleType: r.vehicleType, count: r.count })),
    parkingMode: mode,
    parkingStartTime: mode === 'custom' ? startTime : (st.selectedStartTime || null),
    parkingDuration: mode === 'custom' ? effectiveDuration : undefined,
    parkingEventHours: config.eventHours,
    parkingRates: rates,
    parkingLabels: labels,
    // Superseded single-type fields — cleared so nothing downstream
    // mixes the two shapes.
    selectedVehicle: undefined,
    vehicleCount: undefined,
  });

  const handlePrevious = () => {
    navigate('/customer/add-ons', { state: { ...st, ...parkingState() } });
  };

  const handleContinue = () => {
    const missing = [];
    const nextErrors = {};
    if (validRows.length === 0 || rows.some((r) => !r.vehicleType)) {
      nextErrors.vehicles = 'Choose a vehicle type and how many vehicles for every row';
      missing.push({ label: 'Vehicle type & count', id: 'parking-vehicles' });
    }
    if (mode === 'custom' && !startTime) {
      nextErrors.startTime = 'Pick when parking should start';
      missing.push({ label: 'Parking start time', id: 'parking-start-time' });
    }
    if (mode === 'custom' && !(effectiveDuration >= 1)) {
      nextErrors.duration = 'Pick a parking duration';
      missing.push({ label: 'Parking duration', id: 'parking-duration' });
    }
    setErrors(nextErrors);
    if (reportMissingFields(missing)) return;

    navigate('/customer/booking-review', {
      state: { ...st, ...parkingState(), parkingSkipped: false },
    });
  };

  const handleSkip = () => {
    navigate('/customer/booking-review', { state: { ...st, parkingSkipped: true } });
  };

  return (
    <div className="min-h-screen bg-[#FDFDFD] font-manrope selection:bg-orange-100 overflow-x-hidden">
      <div className="w-full">
        <BookingProgressBar />
      </div>

      <div className="max-w-[1240px] mx-auto pb-28 lg:pb-12 px-5 lg:px-12">
        {/* Mobile Header */}
        <header className="flex lg:hidden items-center justify-between py-6 bg-white sticky top-0 z-40">
          <div className="flex items-center gap-3">
            <button onClick={handlePrevious} className="p-1 -ml-1" aria-label="Back">
              <ChevronLeft size={24} className="text-[#1A181B]" />
            </button>
            <h1 className="text-[18px] font-[700] text-[#1A181B]">Parking Details</h1>
          </div>
          <button onClick={handleSkip} className="text-[14px] font-[600] text-[#1A181B] bg-[#F8F9FB] px-4 py-1.5 border border-[#F2F4F7] rounded-full">
            Skip
          </button>
        </header>

        {/* Desktop Title & Skip */}
        <div className="flex justify-between items-center mb-6 pt-4">
          <h1 className="hidden lg:block text-[28px] font-[800] text-[#1A181B] tracking-tight">Parking Details</h1>
          <button onClick={handleSkip} className="hidden lg:block bg-[#F8F9FB] border border-[#F2F4F7] px-5 py-2 text-[#645E66] text-[14px] font-[600] rounded-full hover:bg-gray-100 transition-all">
            Skip
          </button>
        </div>

        <main className="mt-2 lg:mt-8 grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 flex flex-col gap-6">
            {/* Vehicles */}
            <section
              id="parking-vehicles"
              className={`bg-white border rounded-[24px] p-5 lg:p-8 shadow-[0px_2px_12px_rgba(0,0,0,0.02)] ${errors.vehicles ? 'border-red-300' : 'border-[#F2F4F7]'}`}
            >
              <div className="flex items-start justify-between gap-3 mb-1">
                <h2 className="text-[16px] lg:text-[18px] font-[700] text-[#1A181B]">
                  Vehicles<RequiredMark />
                </h2>
                {loading && <Loader2 size={18} className="animate-spin text-[#FE8301]" aria-label="Loading parking rates" />}
              </div>
              <p className="text-[13px] text-[#8D848F] mb-5">Add every vehicle type your guests will bring — e.g. 3 cars and 5 bikes.</p>

              <ul className="flex flex-col gap-3">
                {rows.map((row, idx) => {
                  const icon = VEHICLE_ICONS[row.vehicleType] || CarImg;
                  const rate = rates[row.vehicleType];
                  return (
                    <li key={idx} className="flex flex-wrap sm:flex-nowrap items-center gap-3 bg-[#FAFAFA] border border-[#F2F4F7] rounded-[16px] p-3">
                      <img src={icon} alt="" width="40" height="40" className="w-10 h-10 object-contain shrink-0" />
                      <div className="flex-1 min-w-[140px]">
                        <label htmlFor={`parking-type-${idx}`} className="sr-only">Vehicle type</label>
                        <select
                          id={`parking-type-${idx}`}
                          value={row.vehicleType}
                          onChange={(e) => updateRow(idx, { vehicleType: e.target.value })}
                          aria-required="true"
                          className={`w-full bg-white border rounded-[10px] px-3 py-2 text-[14px] font-[600] text-[#1A181B] outline-none focus:border-[#FE8301] ${!row.vehicleType && errors.vehicles ? 'border-red-400' : 'border-[#E5E7EB]'}`}
                        >
                          <option value="">Select vehicle type</option>
                          {config.vehicles.map((v) => (
                            <option key={v.id} value={v.id} disabled={usedTypes.has(v.id) && v.id !== row.vehicleType}>
                              {v.label} — {fmt(v.pricePerHour)}/hr
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="flex items-center bg-white rounded-[12px] p-1 border border-[#F2F4F7]">
                        <button
                          type="button"
                          onClick={() => updateRow(idx, { count: Math.max(1, row.count - 1) })}
                          disabled={row.count <= 1}
                          aria-label="Fewer vehicles"
                          className="w-9 h-9 flex items-center justify-center text-[#645E66] hover:text-[#1A181B] disabled:opacity-40"
                        >
                          <Minus size={18} />
                        </button>
                        <input
                          type="number"
                          inputMode="numeric"
                          min={1}
                          max={MAX_PER_TYPE}
                          value={row.count}
                          onChange={(e) => {
                            const n = parseInt(e.target.value, 10);
                            updateRow(idx, { count: Number.isFinite(n) ? Math.min(MAX_PER_TYPE, Math.max(0, n)) : 0 });
                          }}
                          onBlur={() => { if (!(row.count >= 1)) updateRow(idx, { count: 1 }); }}
                          aria-label="Number of vehicles"
                          className="w-12 text-center bg-transparent font-[700] text-[#1A181B] text-[16px] outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        />
                        <button
                          type="button"
                          onClick={() => updateRow(idx, { count: Math.min(MAX_PER_TYPE, row.count + 1) })}
                          aria-label="More vehicles"
                          className="w-9 h-9 flex items-center justify-center text-[#645E66] hover:text-[#1A181B]"
                        >
                          <Plus size={18} />
                        </button>
                      </div>
                      <span className="w-[88px] text-right text-[14px] font-[700] text-[#1A181B] shrink-0">
                        {row.vehicleType && rate !== undefined ? fmt(rate * row.count * hours) : '—'}
                      </span>
                      <button
                        type="button"
                        onClick={() => removeRow(idx)}
                        aria-label="Remove this vehicle type"
                        className="p-2 text-[#98A2B3] hover:text-red-500 shrink-0"
                      >
                        <Trash2 size={18} />
                      </button>
                    </li>
                  );
                })}
              </ul>

              {canAddRow && (
                <button
                  type="button"
                  onClick={addRow}
                  className="mt-4 inline-flex items-center gap-1.5 text-[14px] font-[700] text-[#FE8301] hover:underline"
                >
                  <Plus size={16} /> Add another vehicle type
                </button>
              )}
              {errors.vehicles && <p role="alert" className="mt-3 text-[12px] text-red-600">{errors.vehicles}</p>}
            </section>

            {/* Parking time */}
            <section className="bg-white border border-[#F2F4F7] rounded-[24px] p-5 lg:p-8 shadow-[0px_2px_12px_rgba(0,0,0,0.02)]">
              <h2 className="text-[16px] lg:text-[18px] font-[700] text-[#1A181B] mb-4">
                Parking time<RequiredMark />
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3" role="radiogroup" aria-label="Parking time">
                {[
                  { id: 'event', title: 'For the whole event', sub: `Billed as ${config.eventHours} ${config.eventHours === 1 ? 'hour' : 'hours'}` },
                  { id: 'custom', title: 'Choose a time', sub: `Start time + up to ${config.maxDuration} ${config.maxDuration === 1 ? 'hour' : 'hours'}` },
                ].map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    role="radio"
                    aria-checked={mode === opt.id}
                    onClick={() => { setMode(opt.id); setErrors((e) => ({ ...e, startTime: undefined, duration: undefined })); }}
                    className={`text-left p-4 rounded-[16px] border-2 transition-colors ${mode === opt.id ? 'border-[#FE8301] bg-[#FFF9F2]' : 'border-[#F2F4F7] bg-white hover:border-orange-100'}`}
                  >
                    <p className="text-[15px] font-[700] text-[#1A181B]">{opt.title}</p>
                    <p className="text-[12px] font-[500] text-[#645E66] mt-0.5">{opt.sub}</p>
                  </button>
                ))}
              </div>

              {mode === 'custom' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-5">
                  <div>
                    <label htmlFor="parking-start-time" className="block text-[13px] font-[600] text-[#1A181B] mb-1.5">
                      Start time<RequiredMark />
                    </label>
                    <input
                      id="parking-start-time"
                      type="time"
                      value={startTime}
                      onChange={(e) => { setStartTime(e.target.value); setErrors((er) => ({ ...er, startTime: undefined })); }}
                      aria-required="true"
                      aria-invalid={errors.startTime ? 'true' : 'false'}
                      className={`w-full bg-white border rounded-[10px] px-3 py-2.5 text-[14px] font-[600] text-[#1A181B] outline-none focus:border-[#FE8301] ${errors.startTime ? 'border-red-400' : 'border-[#E5E7EB]'}`}
                    />
                    {errors.startTime && <p role="alert" className="mt-1 text-[12px] text-red-600">{errors.startTime}</p>}
                  </div>
                  <div>
                    <label htmlFor="parking-duration" className="block text-[13px] font-[600] text-[#1A181B] mb-1.5">
                      Duration<RequiredMark />
                    </label>
                    <select
                      id="parking-duration"
                      value={effectiveDuration}
                      onChange={(e) => setDuration(Number(e.target.value))}
                      aria-required="true"
                      className="w-full bg-white border border-[#E5E7EB] rounded-[10px] px-3 py-2.5 text-[14px] font-[600] text-[#1A181B] outline-none focus:border-[#FE8301]"
                    >
                      {durationOptions.map((h) => (
                        <option key={h} value={h}>{h} {h === 1 ? 'hour' : 'hours'}</option>
                      ))}
                    </select>
                  </div>
                </div>
              )}
            </section>
          </div>

          {/* Summary */}
          <aside className="bg-white border border-[#F2F4F7] rounded-[24px] p-5 lg:p-6 shadow-[0px_2px_12px_rgba(0,0,0,0.02)] h-fit">
            <h2 className="text-[16px] lg:text-[18px] font-[700] text-[#1A181B] mb-4">Parking charges</h2>
            {validRows.length === 0 ? (
              <p className="text-[13px] text-[#8D848F]">Add a vehicle to see the charges.</p>
            ) : (
              <ul className="space-y-2 text-[14px]">
                {validRows.map((r) => (
                  <li key={r.vehicleType} className="flex justify-between gap-3">
                    <span className="text-[#645E66]">{r.count} × {labels[r.vehicleType] || r.vehicleType} <span className="text-[12px]">({fmt(rates[r.vehicleType])}/hr)</span></span>
                    <span className="font-[600] text-[#1A181B]">{fmt((rates[r.vehicleType] || 0) * r.count * hours)}</span>
                  </li>
                ))}
              </ul>
            )}
            <p className="text-[12px] text-[#8D848F] mt-3">
              {describeParkingTime({ mode, hours, startTime: mode === 'custom' ? startTime : st.selectedStartTime })}
            </p>
            <div className="border-t border-dashed border-[#F2F4F7] mt-4 pt-4 flex justify-between items-center">
              <span className="font-[700] text-[#1A181B]">Total</span>
              <span className="font-[800] text-[#FE8301] text-[18px]">{fmt(total)}</span>
            </div>
          </aside>
        </main>

        {/* Footer Actions — Mobile */}
        <div className="fixed bottom-0 left-0 right-0 bg-white p-4 flex gap-4 lg:hidden shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] z-50">
          <button onClick={handlePrevious} className="flex-1 bg-[#F2F2F2] text-[#645E66] font-nunito font-semibold text-[14px] py-3.5 rounded-[16px]">
            Previous
          </button>
          <button
            onClick={handleContinue}
            className={`flex-1 font-nunito font-semibold text-[14px] py-3.5 rounded-[16px] ${validRows.length ? 'bg-[#FE8301] text-white' : 'bg-[#FE8301]/60 text-white'}`}
          >
            Continue
          </button>
        </div>

        {/* Footer Actions — Desktop */}
        <div className="hidden lg:flex justify-end gap-3 mt-8 pb-10">
          <button onClick={handlePrevious} className="bg-[#F2F2F2] text-[#645E66] font-nunito font-semibold text-[14px] py-3 px-8 rounded-[16px] w-[140px] text-center">
            Previous
          </button>
          <button
            onClick={handleContinue}
            className={`font-nunito font-semibold text-[14px] py-3 px-8 rounded-[16px] w-[140px] text-center ${validRows.length ? 'bg-[#FE8301] text-white' : 'bg-[#FE8301]/60 text-white'}`}
          >
            Continue
          </button>
        </div>
      </div>
    </div>
  );
};

export default ParkingDetails;
