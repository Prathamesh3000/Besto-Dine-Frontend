import React from 'react'
import { Users } from 'lucide-react'

/**
 * QA #13 — seat reservations. Diner parties hold a seat from the moment
 * they scan the table QR; the backend exposes the count as `seatsTaken`.
 * Seats of a merge group live on the group leader and count against the
 * group's summed capacity, so sum both over the group.
 *
 * @param {object}   table  a table row ({ _id, capacity, seatsTaken, mergedWith })
 * @param {object[]} tables the list it came from (to find merge siblings)
 * @returns {{ taken: number, capacity: number }}
 */
// eslint-disable-next-line react-refresh/only-export-components
export function seatInfo(table, tables = []) {
  if (!table) return { taken: 0, capacity: 0 }
  const ids = Array.isArray(table.mergedWith) && table.mergedWith.length > 0
    ? [String(table._id), ...table.mergedWith.map((id) => String(id?._id || id))]
    : [String(table._id)]
  const group = ids.length > 1 ? tables.filter((t) => ids.includes(String(t._id))) : []
  const members = group.length > 1 ? group : [table]
  return {
    taken: members.reduce((sum, t) => sum + (Number(t.seatsTaken) || 0), 0),
    capacity: members.reduce((sum, t) => sum + (Number(t.capacity) || 0), 0),
  }
}

/** "Seated 3/4" with a people icon. Turns red when the table is full. */
export default function SeatedCount({ taken = 0, capacity = 0, size = 12, className = '' }) {
  const full = capacity > 0 && taken >= capacity
  return (
    <span
      className={`inline-flex items-center gap-1 ${full ? 'text-[#D92D20]' : ''} ${className}`}
      title={`${taken} of ${capacity} seat${capacity === 1 ? '' : 's'} taken by diners who scanned the table QR`}
    >
      <Users size={size} strokeWidth={2.4} />
      Seated {taken}/{capacity}
    </span>
  )
}
