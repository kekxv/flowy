import { describe, it, expect, vi, afterEach } from 'vitest'
import { timeAgo } from './time'

describe('timeAgo', () => {
  const now = Date.now()

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns "just now" for recent timestamps', () => {
    vi.setSystemTime(now)
    expect(timeAgo(new Date(now).toISOString())).toBe('just now')
  })

  it('returns seconds ago', () => {
    vi.setSystemTime(now)
    const past = now - 30 * 1000 // 30 seconds ago
    expect(timeAgo(new Date(past).toISOString())).toBe('just now')
  })

  it('returns minutes ago', () => {
    vi.setSystemTime(now)
    const past = now - 5 * 60 * 1000 // 5 minutes ago
    expect(timeAgo(new Date(past).toISOString())).toBe('5 minutes ago')
  })

  it('returns 1 minute ago (singular)', () => {
    vi.setSystemTime(now)
    const past = now - 60 * 1000 // exactly 1 minute ago
    expect(timeAgo(new Date(past).toISOString())).toBe('1 minute ago')
  })

  it('returns hours ago', () => {
    vi.setSystemTime(now)
    const past = now - 3 * 3600 * 1000 // 3 hours ago
    expect(timeAgo(new Date(past).toISOString())).toBe('3 hours ago')
  })

  it('returns 1 hour ago (singular)', () => {
    vi.setSystemTime(now)
    const past = now - 3600 * 1000 // exactly 1 hour ago
    expect(timeAgo(new Date(past).toISOString())).toBe('1 hour ago')
  })

  it('returns weeks ago (7 days)', () => {
    vi.setSystemTime(now)
    const past = now - 7 * 86400 * 1000 // 7 days ago = 1 week
    expect(timeAgo(new Date(past).toISOString())).toBe('1 week ago')
  })

  it('returns weeks ago', () => {
    vi.setSystemTime(now)
    const past = now - 3 * 7 * 86400 * 1000 // 3 weeks ago
    expect(timeAgo(new Date(past).toISOString())).toBe('3 weeks ago')
  })

  it('returns months ago', () => {
    vi.setSystemTime(now)
    const past = now - 60 * 86400 * 1000 // ~2 months ago
    expect(timeAgo(new Date(past).toISOString())).toBe('2 months ago')
  })

  it('returns years ago', () => {
    vi.setSystemTime(now)
    const past = now - 2 * 365 * 86400 * 1000 // 2 years ago
    expect(timeAgo(new Date(past).toISOString())).toBe('2 years ago')
  })
})
