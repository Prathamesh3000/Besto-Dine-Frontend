import { useState, useEffect, useMemo } from "react";

// Takeaway pickup time slots (moved verbatim from Cart.jsx).
export default function usePickupSlots({ selectedDay, setSelectedDay, selectedTime, setSelectedTime }) {
  // Tick every minute so time slots stay current
  const [nowTick, setNowTick] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNowTick(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  // Dynamic time slots generation — re-runs every minute via nowTick
  const amSlots = useMemo(() => {
    const now = new Date(nowTick);
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();
    const slots = [];
    for (let h = 9; h < 12; h++) {
      for (let m = 0; m < 60; m += 30) {
        if (currentHour < 12 && (h < currentHour || (h === currentHour && m <= currentMinute))) continue;
        const hour = h % 12 || 12;
        slots.push(`${hour}:${m === 0 ? "00" : m} AM`);
      }
    }
    return slots;
  }, [nowTick]);

  const pmSlots = useMemo(() => {
    const now = new Date(nowTick);
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();
    const slots = [];
    for (let h = 12; h < 23; h++) {
      for (let m = 0; m < 60; m += 30) {
        if (currentHour >= 12 && (h < currentHour || (h === currentHour && m <= currentMinute))) continue;
        const hour = h % 12 || 12;
        const ampm = "PM";
        slots.push(`${hour}:${m === 0 ? "00" : m} ${ampm}`);
      }
    }
    return slots;
  }, [nowTick]);

  // Use useMemo to prevent re-generation on every render but keep it updated based on selectedDay
  const currentTimeSlots = useMemo(() => {
    const allSlots = selectedDay === "AM" ? amSlots : pmSlots;
    // Chunk into 4-item rows for the grid
    const rows = [];
    for (let i = 0; i < allSlots.length; i += 4) {
      rows.push(allSlots.slice(i, i + 4));
    }
    return rows;
  }, [selectedDay, amSlots, pmSlots]);

  const timeOffers = useMemo(() => {
    return currentTimeSlots.map((row) =>
      row.map(() => ""),
    );
  }, [currentTimeSlots]);

  // Auto-switch to PM when no AM slots remain, clear expired selection
  useEffect(() => {
    if (selectedDay === "AM" && amSlots.length === 0 && pmSlots.length > 0) {
      setSelectedDay("PM");
    }
    const allSlots = selectedDay === "AM" ? amSlots : pmSlots;
    if (selectedTime && !allSlots.includes(selectedTime)) {
      setSelectedTime(null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- setters are stable state setters
  }, [amSlots, pmSlots, selectedDay, selectedTime]);
  return { currentTimeSlots, timeOffers };
}
