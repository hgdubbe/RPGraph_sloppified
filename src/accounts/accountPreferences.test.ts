import { describe, expect, it, vi } from 'vitest'
import { accountPreferences, flushAccountPreferences, initializeAccountPreferences } from './accountPreferences'

describe('account preferences', () => {
  it('initializes only from the account and keeps demo preferences in memory', async () => {
    await initializeAccountPreferences({ loadPreferences: async () => ({ theme: 'synthetic' }), savePreferences: async () => {} })
    expect(accountPreferences.getItem('theme')).toBe('synthetic')
    await initializeAccountPreferences()
    expect(accountPreferences.length).toBe(0)
    accountPreferences.setItem('demo', 'temporary')
    await flushAccountPreferences()
    await initializeAccountPreferences()
    expect(accountPreferences.getItem('demo')).toBeNull()
  })

  it('serializes saves and flushes a change made during an in-flight save', async () => {
    let release: () => void = () => {}
    const held = new Promise<void>(resolve => { release = resolve })
    const savePreferences = vi.fn(async (_values: Record<string, string>) => { if (savePreferences.mock.calls.length === 1) await held })
    await initializeAccountPreferences({ loadPreferences: async () => ({}), savePreferences })
    accountPreferences.setItem('draft', 'first')
    const pending = flushAccountPreferences()
    accountPreferences.setItem('draft', 'second')
    expect(savePreferences).toHaveBeenCalledTimes(1)
    release()
    await pending
    expect(savePreferences.mock.calls.map(call => call[0])).toEqual([{ draft: 'first' }, { draft: 'second' }])
  })

  it('retains dirty preferences after a failed save for explicit retry', async () => {
    const savePreferences = vi.fn<(_: Record<string, string>) => Promise<void>>().mockRejectedValueOnce(new Error('synthetic failure')).mockResolvedValue(undefined)
    await initializeAccountPreferences({ loadPreferences: async () => ({}), savePreferences })
    accountPreferences.setItem('draft', 'retained')
    await expect(flushAccountPreferences()).rejects.toThrow('synthetic failure')
    expect(accountPreferences.getItem('draft')).toBe('retained')
    await flushAccountPreferences()
    expect(savePreferences).toHaveBeenLastCalledWith({ draft: 'retained' })
  })
})
