import { describe, it, expect } from 'vitest'
import { ALL_ROLES, STAT, PRIS } from './constants'

describe('ALL_ROLES', () => {
  it('contains expected roles', () => {
    expect(ALL_ROLES).toContain('project_lead')
    expect(ALL_ROLES).toContain('backend_dev')
    expect(ALL_ROLES).toContain('frontend_dev')
    expect(ALL_ROLES).toContain('tester')
    expect(ALL_ROLES).toContain('member')
  })

  it('has no duplicates', () => {
    const unique = new Set(ALL_ROLES)
    expect(unique.size).toBe(ALL_ROLES.length)
  })

  it('has at least 5 roles', () => {
    expect(ALL_ROLES.length).toBeGreaterThanOrEqual(5)
  })
})

describe('STAT', () => {
  it('contains expected statuses', () => {
    expect(STAT).toContain('open')
    expect(STAT).toContain('in_progress')
    expect(STAT).toContain('resolved')
    expect(STAT).toContain('closed')
    expect(STAT).toContain('cancelled')
  })

  it('has no duplicates', () => {
    const unique = new Set(STAT)
    expect(unique.size).toBe(STAT.length)
  })
})

describe('PRIS', () => {
  it('contains expected priorities', () => {
    expect(PRIS).toContain('critical')
    expect(PRIS).toContain('high')
    expect(PRIS).toContain('medium')
    expect(PRIS).toContain('low')
  })

  it('has no duplicates', () => {
    const unique = new Set(PRIS)
    expect(unique.size).toBe(PRIS.length)
  })

  it('has correct priority order (most severe first)', () => {
    // First 4 should be in severity order
    expect(PRIS.slice(0, 4)).toEqual(['critical', 'high', 'medium', 'low'])
  })
})
