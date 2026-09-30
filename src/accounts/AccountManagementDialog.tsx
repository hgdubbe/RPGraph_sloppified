import { useEffect, useRef, useState, type FormEvent } from 'react'
import { PasswordField, ProtectionHelp } from './AccountFields'
import type { AccountAPI, PublicAccount } from './types'
import './accounts.css'

export function AccountManagementDialog({ api, account, onClose, onLocked, onAccountChanged }: {
  api: AccountAPI; account: PublicAccount; onClose: () => void; onLocked: () => void
  onAccountChanged: (account: PublicAccount) => void
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [mode, setMode] = useState<'overview' | 'rename' | 'protection' | 'backup' | 'remove'>('overview')
  const [alias, setAlias] = useState(account.alias)
  const [password, setPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [protect, setProtect] = useState(true)
  const [confirmed, setConfirmed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  useEffect(() => { const element = dialog.current; element?.showModal(); return () => element?.close() }, [])
  function clearSecrets() { setPassword(''); setNewPassword(''); setConfirmation('') }
  function chooseMode(next: typeof mode) { setMode(next); clearSecrets(); setConfirmed(false); setError(''); setNotice('') }
  async function run(operation: () => Promise<void>) {
    if (busy) return
    setBusy(true); setError(''); setNotice('')
    try { await operation() } catch {
      setError('The operation could not be completed. Check your password and try again.')
      try { if (!(await api.status()).account) onLocked() } catch { onLocked() }
    } finally { clearSecrets(); setBusy(false) }
  }
  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (mode === 'protection' && protect && newPassword !== confirmation) {
      setError('The new passwords do not match.'); clearSecrets(); return
    }
    await run(async () => {
      if (mode === 'rename') {
        onAccountChanged(await api.rename({ id: account.id, alias: alias.trim(), password: account.protected ? password : undefined }))
        setMode('overview'); setNotice('Public account name updated.')
      } else if (mode === 'protection') {
        if (!protect && !confirmed) return
        await api.changeProtection({ id: account.id, currentPassword: account.protected ? password : undefined, newPassword: protect ? newPassword : undefined })
        onLocked()
      } else if (mode === 'remove' && confirmed) {
        await api.remove({ id: account.id, password: account.protected ? password : undefined }); onLocked()
      }
    })
  }
  const pages = [
    { id: 'overview', label: 'Overview', description: 'Your local account and session', path: 'M4 20v-2a8 8 0 0 1 16 0v2M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z' },
    { id: 'rename', label: 'Profile', description: 'Public account name', path: 'm4 16 12-12 4 4-12 12H4v-4ZM13 7l4 4' },
    { id: 'protection', label: 'Security', description: 'Password and account encryption', path: 'M6 10h12v11H6V10ZM8 10V6a4 4 0 0 1 8 0v4M12 14v3' },
    { id: 'backup', label: 'Backup', description: 'Export all your account data', path: 'M4 14v6h16v-6M12 3v12m-4-4 4 4 4-4' },
    { id: 'remove', label: 'Delete account', description: 'Permanently remove local data', path: 'M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7' },
  ] as const
  const activePage = pages.find(page => page.id === mode)!
  return <dialog ref={dialog} className="account-dialog options-dialog account-settings-dialog" aria-labelledby="account-settings-heading" onCancel={event => { event.preventDefault(); if (!busy) onClose() }}>
    <div className="dialog-header"><div><h2 id="account-settings-heading">Account</h2><p>Local profile, protection and backups</p></div><button type="button" className="close-button" disabled={busy} onClick={onClose}>Close</button></div>
    <div className="options-layout">
      <aside className="options-sidebar" aria-label="Account sections">
        {pages.map(page => <button key={page.id} type="button" className={`options-tab-btn${mode === page.id ? ' active' : ''}`} aria-current={mode === page.id ? 'page' : undefined}
          disabled={busy || (account.shared && ['rename', 'protection', 'remove'].includes(page.id))} onClick={() => chooseMode(page.id)}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d={page.path} /></svg>
          <span className="options-tab-btn-text"><span className="options-tab-btn-label">{page.label}</span><span className="options-tab-btn-desc">{page.description}</span></span>
        </button>)}
      </aside>
      <div className="options-panel"><div className="options-tab-content">
        <div className="options-tab-header"><h3>{activePage.label}</h3><p>{activePage.description}</p></div>
        <div className="options-tab-body">
    <p className="account-current">{account.alias}</p>
    <p className="account-notice">{account.shared ? 'Shared default — password: default. Not private.' : account.protected ? 'Your account data and autosaves are encrypted.' : 'This account and its autosaves are not encrypted.'}</p>
    {mode === 'overview' ? <>
      <div className="account-management-actions" aria-busy={busy}>
        <button className="account-primary" disabled={busy} onClick={() => void run(async () => { await api.lock(); onLocked() })}>Lock / switch account</button>
      </div>
      {account.shared && <p className="account-caption">The shared default has fixed credentials. Lock the app and create a separate account for private content.</p>}
      <ProtectionHelp />
    </> : mode === 'backup' ? <>
      <p className="account-caption">Export settings, workflows, storybooks, roleplay saves, images and custom libraries in one RPGraph account ZIP.</p>
      <p className="account-caption">Exports also contain saved provider credentials. {account.protected ? 'They are encrypted with your account password.' : 'This account has no password. Store its unencrypted exports somewhere private.'}</p>
      <div className="account-management-actions"><button className="account-primary" disabled={busy} onClick={() => void run(async () => { if (await api.export()) setNotice('Account export saved.') })}>Export account{account.protected ? ' (encrypted)' : ' (unencrypted)'}</button></div>
      <p className="account-caption">Import an account from the login screen. Keep a verified backup before changing protection or deleting an account.</p>
    </> : <form onSubmit={event => void handleSubmit(event)} aria-busy={busy}>
      <fieldset disabled={busy}>
        {mode === 'rename' && <label className="account-field">Public account name<input value={alias} required maxLength={80} autoComplete="username" onChange={event => setAlias(event.target.value)} /></label>}
        {account.protected && <PasswordField label="Current password" value={password} onChange={setPassword} />}
        {mode === 'protection' && <>
          <label className="account-check"><input type="checkbox" checked={protect} onChange={event => { setProtect(event.target.checked); setNewPassword(''); setConfirmation(''); setConfirmed(false) }} />Protect with a password</label>
          {protect ? <><PasswordField label="New password" value={newPassword} onChange={setNewPassword} newPassword /><PasswordField label="Confirm new password" value={confirmation} onChange={setConfirmation} newPassword /><p className="account-caption">Existing exports keep their previous password. Forgotten passwords cannot be reset.</p></> : <label className="account-check"><input type="checkbox" required checked={confirmed} onChange={event => setConfirmed(event.target.checked)} />I understand that removing the password makes all account data accessible without login protection.</label>}
          <p className="account-caption">The application will return to the login screen after changing protection.</p>
        </>}
        {mode === 'remove' && <><p>Delete this account and all its local data? This cannot be undone. Exports and external copies will remain.</p><label className="account-check"><input type="checkbox" required checked={confirmed} onChange={event => setConfirmed(event.target.checked)} />I confirm deletion of this account.</label></>}
        <div className="account-actions"><button className={mode === 'remove' ? 'account-danger' : 'account-primary'} type="submit">{busy ? 'Please wait…' : mode === 'remove' ? 'Delete account permanently' : 'Save changes'}</button><button type="button" onClick={() => chooseMode('overview')}>Cancel</button></div>
      </fieldset>
    </form>}
    {error && <p role="alert" className="account-error">{error}</p>}{notice && <p role="status" className="account-notice">{notice}</p>}
        </div>
      </div></div>
    </div>
  </dialog>
}
