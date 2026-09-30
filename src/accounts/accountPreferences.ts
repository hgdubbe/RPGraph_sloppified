import type { AccountAPI, PublicAccount } from './types'

let values = new Map<string, string>()
let api: Pick<AccountAPI, 'savePreferences'> | undefined
let activeAccount: PublicAccount | null = null
let revision = 0
let savedRevision = 0
let pending: Promise<void> | undefined

export function getActiveAccount(): PublicAccount | null { return activeAccount }

/** Initialize before importing workspace modules. Never read legacy browser storage. */
export async function initializeAccountPreferences(bridge?: Pick<AccountAPI, 'loadPreferences' | 'savePreferences'>, account: PublicAccount | null = null) {
  if (pending) throw new Error('Account preferences are still saving.')
  const loaded = bridge ? await bridge.loadPreferences() : {}
  if (!loaded || typeof loaded !== 'object' || Array.isArray(loaded)
    || Object.values(loaded).some(value => typeof value !== 'string')) {
    throw new Error('Invalid account preferences.')
  }
  values = new Map(Object.entries(loaded))
  api = bridge
  activeAccount = account
  revision = 0
  savedRevision = 0
}

/** Serialized whole-map snapshots; failures remain dirty and are retried on explicit flush. */
export function flushAccountPreferences(): Promise<void> {
  if (pending) return pending
  if (!api || savedRevision === revision) return Promise.resolve()
  const bridge = api
  pending = (async () => {
    while (savedRevision !== revision) {
      const savingRevision = revision
      await bridge.savePreferences(Object.fromEntries(values))
      savedRevision = savingRevision
    }
  })().finally(() => { pending = undefined })
  return pending
}

function changed() {
  revision += 1
  queueMicrotask(() => {
    void flushAccountPreferences().catch(() => {
      if (typeof window !== 'undefined') window.dispatchEvent(new Event('rpgraph-preferences-save-error'))
    })
  })
}

export const accountPreferences: Storage = {
  get length() { return values.size },
  key(index) { return Array.from(values.keys())[index] ?? null },
  getItem(key) { return values.get(String(key)) ?? null },
  setItem(key, value) {
    const next = String(value)
    if (values.get(String(key)) === next) return
    values.set(String(key), next); changed()
  },
  removeItem(key) { if (values.delete(String(key))) changed() },
  clear() { if (values.size) { values.clear(); changed() } },
}
