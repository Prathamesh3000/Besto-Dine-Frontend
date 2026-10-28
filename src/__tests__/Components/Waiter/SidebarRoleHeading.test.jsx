/**
 * Waiter Sidebar — Floor Overview link visibility and role heading.
 */
import { describe, test, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

let auth
vi.mock('@/Context/AuthContext', () => ({ useAuth: () => auth }))

import Sidebar from '@/Components/Waiter/Sidebar'

function renderAs(role, isCaptain = false) {
  auth = { user: { role, name: 'Sam' }, isCaptain, hasPermission: () => false, logout: vi.fn(), operations: null }
  return render(<MemoryRouter><Sidebar isOpen onClose={() => {}} /></MemoryRouter>)
}

const headingSpan = (text) => screen.getAllByText(text).find(el => el.tagName === 'SPAN' && /uppercase/.test(el.className))

describe('Waiter Sidebar - Floor Overview + heading', () => {
  test.each([
    ['waiter', false, false, 'Waiter'],
    ['captain', true, true, 'Captain'],
    ['manager', false, true, 'Manager'],
    ['admin', false, false, 'Admin'],
  ])('role %s (isCaptain=%s): floor link shown=%s, heading %s', (role, isCaptain, floor, heading) => {
    renderAs(role, isCaptain)
    expect(headingSpan(heading)).toBeTruthy()
    if (floor) expect(screen.getByText('Floor Overview')).toBeInTheDocument()
    else expect(screen.queryByText('Floor Overview')).not.toBeInTheDocument()
  })

  test('unknown role falls back to Waiter heading', () => {
    renderAs('chef')
    expect(headingSpan('Waiter')).toBeTruthy()
  })
})
