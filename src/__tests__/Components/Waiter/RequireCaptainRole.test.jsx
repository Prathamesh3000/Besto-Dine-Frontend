import { describe, test, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'

const auth = vi.hoisted(() => ({ current: { user: null } }))
vi.mock('@/Context/AuthContext', () => ({ useAuth: () => auth.current, CAPTAIN_ROLES: ['captain', 'admin', 'manager'] }))

import RequireCaptainRole from '@/Components/Waiter/RequireCaptainRole'

function renderAt(path, role) {
  auth.current = { user: { role } }
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        {['/waiter/bill', '/waiter/payment', '/waiter/qr-payment'].map((p) => (
          <Route key={p} path={p} element={<RequireCaptainRole><div>screen{p}</div></RequireCaptainRole>} />
        ))}
        <Route path="/waiter/home" element={<div>waiter-home</div>} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('RequireCaptainRole (billing screens)', () => {
  test.each(['/waiter/bill', '/waiter/payment', '/waiter/qr-payment'])('waiter is redirected from %s to /waiter/home', (p) => {
    renderAt(p, 'waiter')
    expect(screen.getByText('waiter-home')).toBeInTheDocument()
    expect(screen.queryByText(/^screen/)).toBeNull()
  })

  test.each(['captain', 'admin', 'manager'])('%s can open the bill/payment screens', (role) => {
    renderAt('/waiter/payment', role)
    expect(screen.getByText('screen/waiter/payment')).toBeInTheDocument()
  })
})
