import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import useAutoRefresh from '../../hooks/useAutoRefresh';

function setVisibility(state) {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
  document.dispatchEvent(new Event('visibilitychange'));
}

describe('useAutoRefresh', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-19T10:00:00Z'));
    setVisibility('visible');
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('refreshes when the tab becomes visible after being hidden long enough', () => {
    const refresh = vi.fn();
    renderHook(() => useAutoRefresh(refresh));
    setVisibility('hidden');
    vi.advanceTimersByTime(20_000);
    setVisibility('visible');
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('does not refresh for a quick tab switch (hidden < minHiddenMs)', () => {
    const refresh = vi.fn();
    renderHook(() => useAutoRefresh(refresh));
    setVisibility('hidden');
    vi.advanceTimersByTime(3_000);
    setVisibility('visible');
    expect(refresh).not.toHaveBeenCalled();
  });

  it('refreshes when the browser comes back online', () => {
    const refresh = vi.fn();
    renderHook(() => useAutoRefresh(refresh));
    window.dispatchEvent(new Event('online'));
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('refreshes on window focus after being away, and throttles a burst to one call', () => {
    const refresh = vi.fn();
    renderHook(() => useAutoRefresh(refresh));
    window.dispatchEvent(new Event('blur'));
    vi.advanceTimersByTime(30_000);
    window.dispatchEvent(new Event('focus'));
    setVisibility('visible');
    window.dispatchEvent(new Event('online'));
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('polls on the interval while visible and pauses while hidden', () => {
    const refresh = vi.fn();
    renderHook(() => useAutoRefresh(refresh, { intervalMs: 10_000 }));
    vi.advanceTimersByTime(10_000);
    expect(refresh).toHaveBeenCalledTimes(1);
    setVisibility('hidden');
    vi.advanceTimersByTime(60_000);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('does nothing when disabled, and stops listening after unmount', () => {
    const off = vi.fn();
    renderHook(() => useAutoRefresh(off, { enabled: false }));
    window.dispatchEvent(new Event('online'));
    expect(off).not.toHaveBeenCalled();

    const refresh = vi.fn();
    const { unmount } = renderHook(() => useAutoRefresh(refresh, { intervalMs: 5_000 }));
    unmount();
    window.dispatchEvent(new Event('online'));
    vi.advanceTimersByTime(20_000);
    expect(refresh).not.toHaveBeenCalled();
  });

  it('always calls the latest callback without re-subscribing', () => {
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = renderHook(({ cb }) => useAutoRefresh(cb), { initialProps: { cb: first } });
    rerender({ cb: second });
    window.dispatchEvent(new Event('online'));
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });
});
