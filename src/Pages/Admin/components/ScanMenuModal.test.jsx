import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

const api = vi.hoisted(() => ({ post: vi.fn() }))
vi.mock('../../../utils/api', () => ({ default: api }))
vi.mock('react-hot-toast', () => ({ default: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }))

import ScanMenuModal from './ScanMenuModal'

const SCAN = {
  data: {
    success: true,
    data: {
      rows: [
        { id: 'a', name: 'Dal Fry', category: 'Main', description: '', basePrice: 150, priceText: '150', vegType: 'veg', sizes: [], page: 1, box: { x: 0.1, y: 0.2, w: 0.3, h: 0.1 }, confidence: 0.95, needsCheck: false, issues: [] },
        { id: 'b', name: 'Chiken Tikka', category: 'Starters', description: 'spicy', basePrice: null, priceText: '2?0', vegType: 'non-veg', sizes: [{ name: 'Half', price: 120 }, { name: 'Full', price: 220 }], page: 1, box: null, confidence: 0.5, needsCheck: true, issues: ['Price unclear'] },
      ],
      categories: ['Main', 'Starters'],
      pages: [{ index: 1, name: 'menu.png', kind: 'image', quality: { ok: false, level: 'soft', sharpness: 10, warnings: ['Photo is a bit soft'] } }],
      needsCheckCount: 1,
    },
  },
}

const png = () => new File(['x'], 'menu.png', { type: 'image/png' })

async function toPreview(onComplete) {
  api.post.mockResolvedValueOnce(SCAN)
  const utils = render(<ScanMenuModal onClose={vi.fn()} onComplete={onComplete} />)
  fireEvent.change(screen.getByTestId('scan-file-input'), { target: { files: [png()] } })
  fireEvent.click(screen.getByText('Read my menu'))
  await screen.findByTestId('scan-summary')
  return utils
}

const createBtn = () => screen.getByRole('button', { name: /Create menu/ })

beforeEach(() => {
  api.post.mockReset()
  globalThis.URL.createObjectURL = vi.fn(() => 'blob:x')
  globalThis.URL.revokeObjectURL = vi.fn()
})

describe('ScanMenuModal', () => {
  test('upload posts FormData with field `files`', async () => {
    await toPreview()
    const [url, fd] = api.post.mock.calls[0]
    expect(url).toBe('/menu/scan')
    expect(fd).toBeInstanceOf(FormData)
    expect(fd.getAll('files')).toHaveLength(1)
    expect(fd.getAll('files')[0].name).toBe('menu.png')
  })

  test('preview shows rows with needs-check first and the quality banner', async () => {
    await toPreview()
    const rows = screen.getAllByTestId('scan-row')
    expect(rows).toHaveLength(2)
    expect(rows[0].dataset.needsCheck).toBe('true')
    expect(screen.getByDisplayValue('Chiken Tikka')).toBeInTheDocument()
    expect(screen.getByText(/Photo is a bit soft/)).toBeInTheDocument()
    expect(screen.getByTestId('scan-summary').textContent).toMatch(/We found 2 dishes in 2 categories\. 1 needs your check/)
  })

  test('create disabled until the missing price is filled', async () => {
    await toPreview()
    expect(createBtn()).toBeDisabled()
    expect(screen.getByText(/Fix 1 row/)).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Price for row 1'), { target: { value: '250' } })
    expect(createBtn()).not.toBeDisabled()
  })

  test('deleting a row removes it', async () => {
    await toPreview()
    fireEvent.click(screen.getByLabelText('Delete row 1'))
    expect(screen.getAllByTestId('scan-row')).toHaveLength(1)
    expect(screen.queryByDisplayValue('Chiken Tikka')).not.toBeInTheDocument()
    expect(createBtn()).not.toBeDisabled()
  })

  test('editing a flagged row clears its highlight', async () => {
    await toPreview()
    fireEvent.change(screen.getByLabelText('Name for row 1'), { target: { value: 'Chicken Tikka' } })
    expect(screen.getAllByTestId('scan-row')[0].dataset.needsCheck).toBe('false')
  })

  test('confirm sends menu-scan.csv with edited values to /menu/import', async () => {
    const onComplete = vi.fn()
    await toPreview(onComplete)
    fireEvent.change(screen.getByLabelText('Name for row 1'), { target: { value: 'Chicken Tikka' } })
    fireEvent.change(screen.getByLabelText('Price for row 1'), { target: { value: '250' } })
    api.post.mockResolvedValueOnce({ data: { created: 1, skippedCount: 0, errorCount: 1, errors: [{ row: 3, message: 'Bad thing' }] } })
    fireEvent.click(createBtn())
    await screen.findByText('1 created')
    const [url, fd] = api.post.mock.calls[1]
    expect(url).toBe('/menu/import')
    const file = fd.get('file')
    expect(file.name).toBe('menu-scan.csv')
    const text = await new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsText(file) })
    expect(text).toContain('"Chicken Tikka","spicy","Starters","250","non-veg","Half:120:1|Full:220:1"')
    expect(text).toContain('"Dal Fry","Dal Fry","Main","150","veg",""')
    expect(onComplete).toHaveBeenCalled()
    // importer row 3 = second exported dish (original order)
    expect(screen.getByText(/Row 3 \(Chicken Tikka\)/)).toBeInTheDocument()
  })

  test('shows the server message when scanning is not configured', async () => {
    api.post.mockRejectedValueOnce({ response: { data: { code: 'SCAN_NOT_CONFIGURED', message: 'Menu scanning is not set up yet' } } })
    render(<ScanMenuModal onClose={vi.fn()} />)
    fireEvent.change(screen.getByTestId('scan-file-input'), { target: { files: [png()] } })
    fireEvent.click(screen.getByText('Read my menu'))
    expect(await screen.findByRole('alert')).toHaveTextContent('Menu scanning is not set up yet')
  })
})

describe('ScanMenuModal unchecked prompt', () => {
  test('prompts when a kept flagged row has a price but was not edited', async () => {
    const flagged = JSON.parse(JSON.stringify(SCAN))
    flagged.data.data.rows[1].basePrice = 220
    flagged.data.data.rows[1].needsCheck = true
    api.post.mockResolvedValueOnce(flagged)
    render(<ScanMenuModal onClose={vi.fn()} />)
    fireEvent.change(screen.getByTestId('scan-file-input'), { target: { files: [png()] } })
    fireEvent.click(screen.getByText('Read my menu'))
    await screen.findByTestId('scan-summary')
    fireEvent.click(createBtn())
    expect(await screen.findByText(/1 row was never checked\. Create anyway\?/)).toBeInTheDocument()
    expect(api.post).toHaveBeenCalledTimes(1)
    api.post.mockResolvedValueOnce({ data: { created: 2, errors: [] } })
    fireEvent.click(screen.getByText('Create anyway'))
    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(2))
  })
})
