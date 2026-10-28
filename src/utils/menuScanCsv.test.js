import { describe, test, expect } from 'vitest'
import { buildMenuCsv, csvSafe, sizesToShorthand, rowIsValid, sanitizeCell } from './menuScanCsv'

const row = (o = {}) => ({ name: 'Paneer Tikka', category: 'Starters', description: 'Grilled', basePrice: 220, vegType: 'veg', sizes: [], ...o })

describe('csvSafe', () => {
  test('always quotes and doubles inner quotes', () => {
    expect(csvSafe('plain')).toBe('"plain"')
    expect(csvSafe('The "Big" One')).toBe('"The ""Big"" One"')
  })
  test('keeps commas inside quotes and flattens newlines', () => {
    expect(csvSafe('Rice, Dal')).toBe('"Rice, Dal"')
    expect(csvSafe('Line1\nLine2')).toBe('"Line1 Line2"')
  })
  test('strips leading formula characters', () => {
    expect(sanitizeCell('=SUM(A1)')).toBe('SUM(A1)')
    expect(sanitizeCell('+91 combo')).toBe('91 combo')
    expect(sanitizeCell('@cmd')).toBe('cmd')
    expect(sanitizeCell('-dash')).toBe('dash')
    expect(sanitizeCell('-5 off')).toBe('-5 off')
  })
  test('null/undefined become empty', () => {
    expect(csvSafe(null)).toBe('""')
  })
})

describe('sizesToShorthand', () => {
  test('joins name:price:1 with |', () => {
    expect(sizesToShorthand([{ name: 'Half', price: 120 }, { name: 'Full', price: 220 }])).toBe('Half:120:1|Full:220:1')
  })
  test('drops invalid sizes and separators in names', () => {
    expect(sizesToShorthand([{ name: 'A:B|C', price: 10 }, { name: '', price: 5 }, { name: 'X', price: null }])).toBe('A B C:10:1')
    expect(sizesToShorthand(undefined)).toBe('')
  })
})

describe('rowIsValid', () => {
  test('needs name and positive price', () => {
    expect(rowIsValid(row())).toBe(true)
    expect(rowIsValid(row({ name: '  ' }))).toBe(false)
    expect(rowIsValid(row({ basePrice: null }))).toBe(false)
    expect(rowIsValid(row({ basePrice: 0 }))).toBe(false)
  })
})

describe('buildMenuCsv', () => {
  test('writes header and quoted rows', () => {
    const csv = buildMenuCsv([row({ sizes: [{ name: 'Half', price: 120 }] })])
    const lines = csv.trim().split('\r\n')
    expect(lines[0]).toBe('name,description,category,basePrice,vegType,sizes')
    expect(lines[1]).toBe('"Paneer Tikka","Grilled","Starters","220","veg","Half:120:1"')
  })
  test('description falls back to name', () => {
    const csv = buildMenuCsv([row({ description: '' })])
    expect(csv).toContain('"Paneer Tikka","Paneer Tikka"')
  })
  test('excludes null-price and unkept rows', () => {
    const csv = buildMenuCsv([row({ basePrice: null }), row({ name: 'Gone', keep: false }), row({ name: 'Kept' })])
    expect(csv).toContain('"Kept"')
    expect(csv).not.toContain('Gone')
    expect(csv.trim().split('\r\n')).toHaveLength(2)
  })
  test('non-veg preserved, injection stripped', () => {
    const csv = buildMenuCsv([row({ name: '=HYPERLINK("x")', vegType: 'non-veg' })])
    expect(csv).toContain('"HYPERLINK(""x"")"')
    expect(csv).toContain('"non-veg"')
  })
})
