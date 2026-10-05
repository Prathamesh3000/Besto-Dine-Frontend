/**
 * AddCategoryModal — Decision 6 (2026-10): the admin picks Food / Drink per
 * category. The choice is sent as `kind` ('food' | 'beverages', the same
 * values as a coupon's scope), defaults to Food, is pre-filled when editing
 * and shown on each existing category.
 */
import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('react-hot-toast', () => {
  const toast = Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() })
  return { default: toast, toast }
})
vi.mock('@/utils/api', () => ({
  default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
}))
const fetchCategories = vi.fn()
vi.mock('@/Context/MenuContext', () => ({
  useMenu: () => ({ categories: [], fetchCategories }),
}))

import api from '@/utils/api'
import AddCategoryModal from '@admin/components/AddCategoryModal'

const EXISTING = [
  { _id: 'c1', name: 'Mains', image: 'https://img/m.png', status: 'active', itemCount: 4, kind: 'food' },
  { _id: 'c2', name: 'Cold Drinks', image: 'https://img/d.png', status: 'active', itemCount: 2, kind: 'beverages' },
  { _id: 'c3', name: 'Legacy', image: 'https://img/l.png', status: 'active', itemCount: 1 },
]

beforeEach(() => {
  vi.clearAllMocks()
  api.get.mockResolvedValue({ data: { success: true, data: EXISTING } })
  api.post.mockResolvedValue({ data: { success: true, data: {} } })
  api.put.mockResolvedValue({ data: { success: true, data: {} } })
})

function setup() {
  const user = userEvent.setup()
  render(<AddCategoryModal onClose={vi.fn()} onRefresh={vi.fn()} />)
  return { user }
}

describe('AddCategoryModal — Food / Drink (category kind)', () => {
  test('defaults to Food', async () => {
    setup()
    expect(screen.getByRole('radio', { name: 'Food' })).toBeChecked()
    expect(screen.getByRole('radio', { name: 'Drink' })).not.toBeChecked()
    await screen.findByText(/Cold Drinks/)
  })

  test('shows each existing category as Food or Drink (missing kind = Food)', async () => {
    setup()
    await screen.findByText(/Cold Drinks/)
    expect(screen.getByTestId('category-kind-c1')).toHaveTextContent('Food')
    expect(screen.getByTestId('category-kind-c2')).toHaveTextContent('Drink')
    expect(screen.getByTestId('category-kind-c3')).toHaveTextContent('Food')
  })

  test('create sends kind "beverages" when Drink is chosen', async () => {
    const { user } = setup()
    await screen.findByText(/Cold Drinks/)
    await user.type(screen.getByLabelText(/category name/i), 'Shakes')
    await user.click(screen.getByRole('radio', { name: 'Drink' }))
    // The image is required — upload a fake file (POST /upload is mocked).
    api.post.mockResolvedValueOnce({ data: { success: true, url: 'https://img/new.png' } })
    const file = new File(['x'], 'shake.png', { type: 'image/png' })
    await user.upload(document.querySelector('input[type="file"]'), file)
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/upload', expect.any(FormData), expect.anything()))

    await user.click(screen.getByRole('button', { name: /save category/i }))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/categories', expect.objectContaining({ name: 'Shakes', kind: 'beverages' })))
    // form resets to the Food default after a successful create
    await waitFor(() => expect(screen.getByRole('radio', { name: 'Food' })).toBeChecked())
  })

  test('create sends kind "food" by default', async () => {
    const { user } = setup()
    await screen.findByText(/Cold Drinks/)
    await user.type(screen.getByLabelText(/category name/i), 'Desserts')
    api.post.mockResolvedValueOnce({ data: { success: true, url: 'https://img/new.png' } })
    await user.upload(document.querySelector('input[type="file"]'), new File(['x'], 'd.png', { type: 'image/png' }))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/upload', expect.any(FormData), expect.anything()))
    await user.click(screen.getByRole('button', { name: /save category/i }))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/categories', expect.objectContaining({ name: 'Desserts', kind: 'food' })))
  })

  test('editing pre-selects the category kind and update sends the new kind', async () => {
    const { user } = setup()
    await screen.findByText(/Cold Drinks/)
    await user.click(screen.getByRole('button', { name: 'Edit Cold Drinks' }))
    expect(screen.getByRole('radio', { name: 'Drink' })).toBeChecked()

    await user.click(screen.getByRole('button', { name: 'Edit Mains' }))
    expect(screen.getByRole('radio', { name: 'Food' })).toBeChecked()
    await user.click(screen.getByRole('radio', { name: 'Drink' }))
    await user.click(screen.getByRole('button', { name: /update category/i }))
    await waitFor(() => expect(api.put).toHaveBeenCalledWith('/categories/c1', expect.objectContaining({ name: 'Mains', kind: 'beverages' })))
    expect(screen.getByTestId('category-kind-c1')).toHaveTextContent('Drink')
  })
})
