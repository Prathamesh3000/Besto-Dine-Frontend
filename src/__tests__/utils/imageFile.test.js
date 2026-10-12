import { describe, test, expect } from 'vitest'
import { isImageFile, IMAGE_ACCEPT } from '@/utils/imageFile'

const f = (name, type) => ({ name, type })

describe('isImageFile', () => {
  test.each([
    ['a.jpg', 'image/jpeg'], ['a.png', 'image/png'], ['a.webp', 'image/webp'], ['a.gif', 'image/gif'],
    ['a.svg', 'image/svg+xml'], ['a.bmp', 'image/bmp'], ['a.avif', 'image/avif'], ['a.TIFF', 'image/tiff'],
    ['IMG_1.HEIC', 'image/heic'], ['IMG_2.heic', ''], ['IMG_3.heif', 'application/octet-stream'], ['f.ico', 'image/x-icon'],
  ])('accepts %s (%s)', (name, type) => expect(isImageFile(f(name, type))).toBe(true))

  test.each([
    ['menu.pdf', 'application/pdf'], ['a.html', 'text/html'], ['evil.exe', 'image/png'],
    ['noext', 'image/png'], ['a.png', 'text/html'],
  ])('rejects %s (%s)', (name, type) => expect(isImageFile(f(name, type))).toBe(false))

  test('null → false; picker accept lists HEIC/HEIF explicitly', () => {
    expect(isImageFile(null)).toBe(false)
    expect(IMAGE_ACCEPT).toBe('image/*,.heic,.heif')
  })
})
