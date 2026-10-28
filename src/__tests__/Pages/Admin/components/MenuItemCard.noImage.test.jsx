/**
 * Admin/MenuItemCard — an item the admin never gave an image renders a
 * blank image box, not the Thumbnil placeholder (requested 2026-10-28).
 */
import { describe, test, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import MenuItemCard from '@/Pages/Admin/components/MenuItemCard'

const base = { _id: 'm1', name: 'Paneer Tikka', vegType: 'veg', status: 'active', basePrice: 220, category: { name: 'Starters' } }

describe('MenuItemCard without an image', () => {
  test.each(['grid', 'list'])('%s view: no <img> and no placeholder when images are empty', (viewMode) => {
    render(<MenuItemCard item={{ ...base, images: [], image: '' }} viewMode={viewMode} index={0} />)
    // (VegBadge is a role="img" div, so look for a real <img> tag)
    expect(document.querySelector('img')).toBeNull()
    expect(screen.getByTestId('menu-item-no-image')).toBeInTheDocument()
    expect(document.body.innerHTML).not.toContain('Thumbnil')
  })

  test.each(['grid', 'list'])('%s view: renders the uploaded image when there is one', (viewMode) => {
    render(<MenuItemCard item={{ ...base, images: ['/uploads/paneer.jpg'] }} viewMode={viewMode} index={0} />)
    const img = screen.getByRole('img', { name: 'Paneer Tikka' })
    expect(img).toHaveAttribute('src', expect.stringContaining('/uploads/paneer.jpg'))
    expect(screen.queryByTestId('menu-item-no-image')).toBeNull()
  })
})
