import { describe, test, expect } from 'vitest'
import {
  toppingSignature, cartLineKey, kioskLineKey, lineQuantity, lineUnitPrice, lineTotal,
  cartSubtotal, countDistinctLines, mergeLine, upsertLine, changeLineQty,
} from '@/utils/cart'

describe('toppingSignature', () => {
  test('is order-insensitive', () => {
    expect(toppingSignature([{ id: 'b' }, { id: 'a' }])).toBe(toppingSignature([{ id: 'a' }, { id: 'b' }]))
  })
  test.each([
    ['id preferred', [{ id: 'x', _id: 'y', name: 'z' }], 'x'],
    ['_id when no id', [{ _id: 'y', name: 'z' }], 'y'],
    ['name when no ids', [{ name: 'Cheese' }], 'Cheese'],
    ['kiosk qty > 1 included', [{ name: 'Cheese', qty: 2 }], 'Cheesex2'],
    ['qty 1 omitted', [{ name: 'Cheese', qty: 1 }], 'Cheese'],
    ['menu topping `quantity` ignored', [{ name: 'Cheese', quantity: 3 }], 'Cheese'],
    ['primitive entries stringified', ['olive', 3], '3,olive'],
    ['falsy entries dropped', [null, undefined, { id: 'a' }], 'a'],
    ['non-array → empty', 'nope', ''],
    ['undefined → empty', undefined, ''],
  ])('%s', (_n, toppings, expected) => {
    expect(toppingSignature(toppings)).toBe(expected)
  })
})

describe('cartLineKey / kioskLineKey', () => {
  test.each([
    ['default size when none', 'p1', {}, 'p1-default-'],
    ['string size', 'p1', { size: 'Large' }, 'p1-Large-'],
    ['size object by name', 'p1', { size: { name: 'Large', id: 's1' } }, 'p1-Large-'],
    ['size object by id when unnamed', 'p1', { size: { id: 's1' } }, 'p1-s1-'],
    ['toppings sorted', 'p1', { toppings: [{ id: 'b' }, { id: 'a' }] }, 'p1-default-a,b'],
  ])('%s', (_n, id, opts, expected) => {
    expect(cartLineKey(id, opts)).toBe(expected)
  })
  test('no options argument', () => {
    expect(cartLineKey('p1')).toBe('p1-default-')
  })
  test('kiosk line uses menuItemId/size/addons', () => {
    expect(kioskLineKey({ menuItemId: 'm', size: 'S', addons: [{ name: 'x', qty: 2 }] })).toBe('m-S-xx2')
  })
  test('kiosk line tolerates null', () => {
    expect(kioskLineKey(null)).toBe('undefined-default-')
  })
})

describe('line helpers', () => {
  test.each([
    [{ quantity: 3 }, 3], [{ qty: 2 }, 2], [{ quantity: 0, qty: 5 }, 0], [{}, 0], [null, 0],
  ])('lineQuantity(%j) → %s', (line, q) => expect(lineQuantity(line)).toBe(q))

  test.each([
    [{ unitPrice: 50, price: 40 }, 50], [{ price: 40 }, 40], [{ unitPrice: 0, price: 40 }, 40], [{}, 0], [{ price: 'x' }, 0],
  ])('lineUnitPrice(%j) → %s', (line, p) => expect(lineUnitPrice(line)).toBe(p))

  test('lineTotal rounds to paise', () => {
    expect(lineTotal({ unitPrice: 33.333, qty: 3 })).toBe(100)
  })

  test('cartSubtotal accepts arrays and keyed objects', () => {
    expect(cartSubtotal([{ price: 10, quantity: 2 }, { unitPrice: 5, qty: 1 }])).toBe(25)
    expect(cartSubtotal({ a: { price: 10, quantity: 2 }, b: { price: 0.1, quantity: 3 } })).toBe(20.3)
    expect(cartSubtotal(null)).toBe(0)
  })

  test('countDistinctLines counts lines with qty > 0, not units', () => {
    expect(countDistinctLines([{ qty: 2 }, { qty: 5 }, { qty: 0 }])).toBe(2)
    expect(countDistinctLines({ a: { quantity: 1 } })).toBe(1)
    expect(countDistinctLines(undefined)).toBe(0)
  })
})

describe('mergeLine', () => {
  test('adds delta and merges details', () => {
    expect(mergeLine({ id: 1, quantity: 2 }, { note: 'x' }, 3)).toEqual({ id: 1, note: 'x', quantity: 5 })
  })
  test('returns null at zero', () => {
    expect(mergeLine({ quantity: 1 }, {}, -1)).toBeNull()
  })
  test('clamps below zero to null', () => {
    expect(mergeLine({ qty: 1 }, {}, -5, 'qty')).toBeNull()
  })
  test('creates from nothing', () => {
    expect(mergeLine(null, { a: 1 }, 2)).toEqual({ a: 1, quantity: 2 })
  })
})

describe('upsertLine / changeLineQty (kiosk shape)', () => {
  const pizza = { menuItemId: 'p', unitPrice: 100, size: 'L', addons: [{ name: 'cheese' }, { name: 'olive' }] }
  const samePizzaReordered = { ...pizza, addons: [{ name: 'olive' }, { name: 'cheese' }] }

  test('adds a new line', () => {
    expect(upsertLine([], pizza, 2)).toEqual([{ ...pizza, qty: 2 }])
  })
  test('merges an identical selection regardless of add-on order', () => {
    const cart = upsertLine(upsertLine([], pizza, 1), samePizzaReordered, 2)
    expect(cart).toHaveLength(1)
    expect(cart[0].qty).toBe(3)
  })
  test('different size → separate line', () => {
    const cart = upsertLine(upsertLine([], pizza, 1), { ...pizza, size: 'M' }, 1)
    expect(cart).toHaveLength(2)
  })
  test('negative quantity removing the last unit drops the line', () => {
    expect(upsertLine([{ ...pizza, qty: 1 }], pizza, -1)).toEqual([])
  })
  test('is pure (does not mutate input)', () => {
    const input = [{ ...pizza, qty: 1 }]
    const snapshot = JSON.stringify(input)
    upsertLine(input, pizza, 1)
    expect(JSON.stringify(input)).toBe(snapshot)
  })
  test('non-array cart tolerated', () => {
    expect(upsertLine(null, pizza, 1)).toHaveLength(1)
  })
  test('changeLineQty adjusts only the matching line and drops at 0', () => {
    const other = { menuItemId: 'q', unitPrice: 5 }
    const cart = [{ ...pizza, qty: 2 }, { ...other, qty: 1 }]
    const key = kioskLineKey(pizza)
    expect(changeLineQty(cart, key, 1)[0].qty).toBe(3)
    expect(changeLineQty(cart, kioskLineKey(other), -1)).toEqual([{ ...pizza, qty: 2 }])
    expect(changeLineQty(null, key, 1)).toEqual([])
  })
  test('custom keyOf / qtyField (CartContext shape)', () => {
    const keyOf = (l) => l.id
    const cart = upsertLine([{ id: 'a', quantity: 1 }], { id: 'a' }, 2, { keyOf, qtyField: 'quantity' })
    expect(cart).toEqual([{ id: 'a', quantity: 3 }])
  })
})
