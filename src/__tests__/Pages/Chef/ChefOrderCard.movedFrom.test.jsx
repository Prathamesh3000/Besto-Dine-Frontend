import { describe, test, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import ChefOrderCard from '@/Pages/Chef/components/ChefOrderCard'

const NOW = Date.now()
const base = {
  _id: 'o1', id: 'ORD-0042', status: 'new', type: 'dine-in', tableId: '6', table: { name: 'T6' },
  createdAt: new Date(NOW - 60_000).toISOString(), items: [{ _id: 'i1', name: 'Dosa', quantity: 1 }],
}

describe('ChefOrderCard — moved from badge', () => {
  test('shown when movedFrom is set', () => {
    render(<ChefOrderCard order={{ ...base, movedFrom: { tableId: 't5', tableName: 'T5', at: new Date().toISOString() } }} nowMs={NOW} onAction={() => {}} />)
    expect(screen.getByText('Moved from T5')).toBeInTheDocument()
  })
  test('absent when movedFrom is null or missing', () => {
    const { rerender } = render(<ChefOrderCard order={{ ...base, movedFrom: null }} nowMs={NOW} onAction={() => {}} />)
    expect(screen.queryByText(/Moved from/)).not.toBeInTheDocument()
    rerender(<ChefOrderCard order={base} nowMs={NOW} onAction={() => {}} />)
    expect(screen.queryByText(/Moved from/)).not.toBeInTheDocument()
  })
})
