import { afterEach, describe, expect, it, vi } from 'vitest'
import { getVoiceSupport } from '../../../Components/Loggedin/voiceSupport'

describe('getVoiceSupport inside the desktop shell', () => {
  afterEach(() => {
    delete window.bestodine
    delete window.webkitSpeechRecognition
    vi.unstubAllGlobals()
  })

  it('hides voice search when window.bestodine.isDesktop is true even if SpeechRecognition exists', () => {
    window.webkitSpeechRecognition = function Fake() {}
    window.bestodine = { isDesktop: true }
    const r = getVoiceSupport()
    expect(r.supported).toBe(false)
    expect(r.reason).toBe('unsupported')
    expect(r.reasonText).toMatch(/desktop app/i)
  })

  it('still supports voice search in a normal browser with SpeechRecognition', () => {
    window.webkitSpeechRecognition = function Fake() {}
    expect(getVoiceSupport().supported).toBe(true)
  })

  it('ignores a bridge that is not the desktop shell', () => {
    window.webkitSpeechRecognition = function Fake() {}
    window.bestodine = { isDesktop: false }
    expect(getVoiceSupport().supported).toBe(true)
  })
})
