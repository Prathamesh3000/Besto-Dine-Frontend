/**
 * Chef/components/ChefOrderCard — token-number mode: a table-less dine-in
 * order shows "Token T-042" where the table name goes (never "Takeaway",
 * even though the live payload ships tableId 'TA' for it).
 */
import { describe, test, expect } from 'vitest'
import { render, screen } from '@testing-library/react'

import ChefOrderCard from '@/Pages/Chef/components/ChefOrderCard'

const NOW = Date.now()
const base = {
  _id: 'o1', id: 'ORD-0042', status: 'new', createdAt: new Date(NOW - 60_000).toISOString(),
  items: [{ _id: 'i1', name: 'Dosa', quantity: 1 }],
}

describe('ChefOrderCard — token label', () => {
  test('token order → "Token T-042"', () => {
    render(<ChefOrderCard order={{ ...base, type: 'dine-in', tableId: 'TA', table: null, tokenNumber: 'T-042' }} nowMs={NOW} onAction={() => {}} />)
    expect(screen.getByText('Token T-042')).toBeInTheDocument()
    expect(screen.queryByText('Takeaway')).not.toBeInTheDocument()
  })

  test('table order unchanged → "Table 5 · Garden"', () => {
    render(<ChefOrderCard order={{ ...base, type: 'dine-in', tableId: '5', table: { name: '5', area: { name: 'Garden' } } }} nowMs={NOW} onAction={() => {}} />)
    expect(screen.getByText('Table 5 · Garden')).toBeInTheDocument()
  })

  test('takeaway unchanged → "Takeaway"', () => {
    render(<ChefOrderCard order={{ ...base, type: 'takeaway', tableId: 'TA', table: null }} nowMs={NOW} onAction={() => {}} />)
    expect(screen.getByText('Takeaway')).toBeInTheDocument()
  })
})
