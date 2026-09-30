import { Profiler, useEffect, useMemo, useState } from 'react'
import App from '../App'
import { profileUiRender } from '../diagnostics/uiPerformance'
import { PanelNavigation } from '../navigation/PanelNavigation'
import { AccountManagementDialog } from './AccountManagementDialog'
import { flushAccountPreferences } from './accountPreferences'
import type { AccountAPI, PublicAccount } from './types'

/** Imported only after authorization and account preferences initialization. */
export function AccountWorkspace({ api, account: initialAccount }: { api?: AccountAPI; account: PublicAccount | null }) {
  const [account, setAccount] = useState(initialAccount)
  const [open, setOpen] = useState(false)
  const [locked, setLocked] = useState(false)
  const [saveError, setSaveError] = useState(false)
  const guardedApi = useMemo<AccountAPI | undefined>(() => api ? {
    ...api,
    lock: async () => { await flushAccountPreferences(); await api.lock() },
    changeProtection: async options => { await flushAccountPreferences(); return api.changeProtection(options) },
    remove: async options => { await flushAccountPreferences(); return api.remove(options) },
    export: async () => { await flushAccountPreferences(); return api.export() },
  } : undefined, [api])
  useEffect(() => {
    const failed = () => setSaveError(true)
    window.addEventListener('rpgraph-preferences-save-error', failed)
    return () => window.removeEventListener('rpgraph-preferences-save-error', failed)
  }, [])
  if (locked) return <main className="account-bootstrap" role="status">Returning to accounts…</main>
  return <>
    <PanelNavigation><Profiler id="App" onRender={profileUiRender}><App onOpenAccountManagement={guardedApi && account ? () => setOpen(true) : undefined} /></Profiler></PanelNavigation>
    {guardedApi && account ? <>
      {open && <AccountManagementDialog api={guardedApi} account={account} onClose={() => setOpen(false)}
        onLocked={() => setLocked(true)} onAccountChanged={setAccount} />}
    </> : <div className="account-demo-banner" role="status">Browser demo — changes are not saved. Account protection requires the desktop app.</div>}
    {saveError && <div className="account-save-error" role="alert">Account preferences could not be saved. <button onClick={() => void flushAccountPreferences().then(() => setSaveError(false)).catch(() => setSaveError(true))}>Retry</button></div>}
  </>
}
