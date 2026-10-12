import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'

const toast = vi.hoisted(() => Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }))
vi.mock('react-hot-toast', () => ({ default: toast, toast }))

const menu = vi.hoisted(() => ({
  categories: [{ _id: 'c1', name: 'Breakfast' }],
  menuItems: [{ _id: 'mKhichadi', name: 'Khichadi', category: { _id: 'c1', name: 'Breakfast' }, basePrice: 40, vegType: 'veg', status: 'active' }],
  menuLoading: false,
  fetchCategories: vi.fn(),
  fetchMenuItems: vi.fn(),
  createCombo: vi.fn(),
  updateCombo: vi.fn(),
  uploadImage: vi.fn(),
}))
vi.mock('@/Context/MenuContext', () => ({ useMenu: () => menu }))

import AddComboMenu from '@/Pages/Admin/components/AddComboMenu'

// A combo as GET /combos returns it: component sub-docs have their own _id;
// the menu link is menuItemId (null for components not on the menu).
const savedCombo = {
  _id: 'combo1',
  name: 'Bhagar Amti Khichadi Wafers',
  description: 'Bhagar, amti, khichadi and wafers combo',
  images: ['https://img.test/c.jpg'],
  vegType: 'veg',
  serveUpto: '1-2 person',
  price: 180,
  originalPrice: 180,
  discount: 0,
  discountType: 'Percentage',
  availableDays: ['Mon'],
  startTime: '11:00',
  endTime: '14:00',
  categories: [{
    name: 'Includes',
    items: [
      { _id: 'sub1', menuItemId: null, name: 'Bhagar', price: 0, isVeg: true },
      { _id: 'sub2', menuItemId: 'mKhichadi', name: 'Khichadi', price: 40, isVeg: true },
    ],
  }],
}

const renderEditor = () => render(
  <MemoryRouter initialEntries={[{ pathname: '/admin/menu/add-combo', state: { editItem: savedCombo } }]}>
    <Routes>
      <Route path="/admin/menu/add-combo" element={<AddComboMenu />} />
      <Route path="/admin/menu" element={<div>MENU PAGE</div>} />
    </Routes>
  </MemoryRouter>,
)

beforeEach(() => {
  menu.createCombo.mockReset().mockResolvedValue({})
  menu.updateCombo.mockReset().mockResolvedValue({})
  toast.error.mockReset()
})

describe('AddComboMenu — editing a saved combo', () => {
  test('stays in edit mode across step changes and sends real menu item ids', async () => {
    renderEditor()
    expect(screen.getByText('Edit Combo Menu')).toBeInTheDocument()

    // Walk the steps — each change rewrites ?step= in the URL.
    fireEvent.click(screen.getByRole('button', { name: /Next/ }))
    fireEvent.click(screen.getByRole('button', { name: /Next/ }))
    expect(screen.getByText('Edit Combo Menu')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Save Combo/ }))
    await waitFor(() => expect(menu.updateCombo).toHaveBeenCalled())
    expect(menu.createCombo).not.toHaveBeenCalled()
    expect(toast.error).not.toHaveBeenCalled()

    const [id, payload] = menu.updateCombo.mock.calls[0]
    expect(id).toBe('combo1')
    expect(payload.price).toBe(180)
    expect(payload.categories).toEqual([{
      name: 'Includes',
      items: [
        { menuItemId: null, name: 'Bhagar', price: 0, isVeg: true },          // not the sub-doc id
        { menuItemId: 'mKhichadi', name: 'Khichadi', price: 40, isVeg: true },
      ],
    }])
  })
})
