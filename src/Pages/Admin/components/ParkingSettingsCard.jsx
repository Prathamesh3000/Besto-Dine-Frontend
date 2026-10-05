import React from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { DEFAULT_PARKING_CONFIG } from '../../AdvanceBooking/parkingUtils'

// Admin → Settings → Reservation → Parking (QA N10/N11).
// Stored as Settings.reservation.parking and saved with the rest of the
// Reservation section. Customers pick any mix of these vehicle types and
// either "whole event" (billed at `eventHours`) or a start time +
// 1..`maxDuration` hours; the server prices Σ rate × count × hours.
const ParkingSettingsCard = ({ value, onChange }) => {
    const cfg = value && typeof value === 'object' ? value : {}
    const vehicles = Array.isArray(cfg.vehicles) && cfg.vehicles.length ? cfg.vehicles : DEFAULT_PARKING_CONFIG.vehicles
    const maxDuration = Number(cfg.maxDuration) || DEFAULT_PARKING_CONFIG.maxDuration
    const eventHours = Number(cfg.eventHours) || DEFAULT_PARKING_CONFIG.eventHours

    const emit = (patch) => onChange({ vehicles, maxDuration, eventHours, ...patch })
    const setVehicle = (idx, patch) => emit({ vehicles: vehicles.map((v, i) => (i === idx ? { ...v, ...patch } : v)) })
    const removeVehicle = (idx) => emit({ vehicles: vehicles.filter((_, i) => i !== idx) })
    const addVehicle = () => emit({ vehicles: [...vehicles, { id: '', label: '', pricePerHour: 0 }] })

    const inputCls = 'w-full px-3 py-2 bg-white border border-gray-200 rounded-[10px] text-[14px] text-[#1A181B] focus:outline-none focus:border-[#FE8301] shadow-sm'

    return (
        <div className="bg-white rounded-xl border border-gray-200 p-4 md:p-6 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)]">
            <h2 className="text-[15px] font-[600] text-[#1A181B] mb-1">Parking for Table Bookings</h2>
            <p className="text-[12px] text-[#9CA3AF] mb-4">
                Customers can book several vehicle types for one booking. Charge = price per hour × vehicles × hours.
            </p>

            <div className="space-y-2 mb-3">
                <div className="hidden sm:grid grid-cols-[1fr_140px_40px] gap-3 text-[12px] font-[500] text-[#6B7280] px-1">
                    <span>Vehicle type <span className="text-red-500">*</span></span>
                    <span>Price per hour (₹) <span className="text-red-500">*</span></span>
                    <span />
                </div>
                {vehicles.map((v, idx) => (
                    <div key={idx} className="grid grid-cols-[1fr_110px_40px] sm:grid-cols-[1fr_140px_40px] gap-3 items-center">
                        <input
                            type="text"
                            value={v.label}
                            maxLength={40}
                            placeholder="e.g. Car"
                            aria-label="Vehicle type"
                            onChange={(e) => setVehicle(idx, { label: e.target.value })}
                            className={inputCls}
                        />
                        <input
                            type="number"
                            min="0"
                            value={v.pricePerHour}
                            aria-label={`Price per hour for ${v.label || 'this vehicle'}`}
                            onChange={(e) => setVehicle(idx, { pricePerHour: Math.max(0, parseFloat(e.target.value) || 0) })}
                            className={inputCls}
                        />
                        <button
                            type="button"
                            onClick={() => removeVehicle(idx)}
                            disabled={vehicles.length <= 1}
                            aria-label={`Remove ${v.label || 'vehicle type'}`}
                            className="p-2 text-[#9CA3AF] hover:text-red-500 disabled:opacity-30"
                        >
                            <Trash2 size={18} />
                        </button>
                    </div>
                ))}
            </div>
            {vehicles.length < 10 && (
                <button type="button" onClick={addVehicle} className="inline-flex items-center gap-1.5 text-[13px] font-[600] text-[#FE8301] hover:underline mb-5">
                    <Plus size={15} /> Add vehicle type
                </button>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                    <label htmlFor="parkingMaxDuration" className="block text-[13px] font-[500] text-[#1A181B] mb-1.5">Longest parking a customer can choose</label>
                    <select
                        id="parkingMaxDuration"
                        value={maxDuration}
                        onChange={(e) => emit({ maxDuration: Number(e.target.value) })}
                        className={`${inputCls} py-2.5 cursor-pointer`}
                    >
                        {Array.from({ length: 24 }, (_, i) => i + 1).map((h) => (
                            <option key={h} value={h}>{h} {h === 1 ? 'hour' : 'hours'}</option>
                        ))}
                    </select>
                    <p className="text-[11px] text-[#9CA3AF] mt-1.5">Customers choosing a custom time can book 1 hour up to this.</p>
                </div>
                <div>
                    <label htmlFor="parkingEventHours" className="block text-[13px] font-[500] text-[#1A181B] mb-1.5">Hours billed for &ldquo;whole event&rdquo; parking</label>
                    <select
                        id="parkingEventHours"
                        value={eventHours}
                        onChange={(e) => emit({ eventHours: Number(e.target.value) })}
                        className={`${inputCls} py-2.5 cursor-pointer`}
                    >
                        {Array.from({ length: 24 }, (_, i) => i + 1).map((h) => (
                            <option key={h} value={h}>{h} {h === 1 ? 'hour' : 'hours'}</option>
                        ))}
                    </select>
                    <p className="text-[11px] text-[#9CA3AF] mt-1.5">The default option — parking for the full booking.</p>
                </div>
            </div>
        </div>
    )
}

export default ParkingSettingsCard
