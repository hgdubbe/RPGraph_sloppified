import { useEffect, useRef, useState, type FormEvent } from 'react'
import appIcon from '../assets/app-icon-transparent.png'
import loginArtwork from '../assets/account-login-artwork.png'
import { PasswordField, ProtectionHelp } from './AccountFields'
import type { AccountAPI, PublicAccount } from './types'
import './accounts.css'

export function AccountLogin({ api, onUnlocked, legacyAvailable = false }: { api: AccountAPI; onUnlocked: (account: PublicAccount) => void; legacyAvailable?: boolean }) {
  const [accounts, setAccounts] = useState<PublicAccount[]>([])
  const [hasLegacyData, setHasLegacyData] = useState(legacyAvailable)
  const [selected, setSelected] = useState('')
  const [mode, setMode] = useState<'login' | 'create' | 'import' | 'migrate'>('login')
  const [alias, setAlias] = useState('')
  const [protectedAccount, setProtectedAccount] = useState(true)
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [archivePassword, setArchivePassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const errorRef = useRef<HTMLParagraphElement>(null)
  const active = accounts.find(account => account.id === selected)
  useEffect(() => {
    let alive = true
    void api.list().then(items => {
      if (alive) { setAccounts(items); setSelected(items[0]?.id ?? '') }
    }).catch(() => { if (alive) setError('Accounts could not be loaded. Restart the application and try again.') })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [api])
  useEffect(() => { if (error) errorRef.current?.focus() }, [error])

  function clearSecrets() { setPassword(''); setConfirmation(''); setArchivePassword('') }
  function chooseMode(next: typeof mode) { clearSecrets(); setMode(next); setError(''); setNotice('') }
  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (busy) return
    setError(''); setNotice('')
    if (mode !== 'login' && protectedAccount && password !== confirmation) {
      setError('The new passwords do not match.'); clearSecrets(); return
    }
    setBusy(true)
    try {
      if (mode === 'login') {
        if (!active) return
        if (active.protectionChangePending) {
          await api.recover({ id: active.id, password })
          setAccounts(await api.list())
          setNotice('Protection recovery completed. Enter your password to continue.')
        } else {
          const account = await api.unlock({ id: active.id, password: active.protected ? password : undefined })
          clearSecrets()
          onUnlocked(account)
        }
      } else {
        const options = { alias: alias.trim(), password: protectedAccount ? password : undefined }
        const created = mode === 'create' ? await api.create(options) : mode === 'migrate' ? await api.migrate(options) : await api.import({
          ...options, protection: protectedAccount ? 'password' : 'open', archivePassword: archivePassword || undefined,
        })
        if (created) {
          if (mode === 'migrate') {
            try { setHasLegacyData((await api.status()).legacyAvailable ?? false) }
            catch { /* Import succeeded; preserve the conservative notice if discovery fails. */ }
          }
          setAccounts(await api.list()); setSelected(created.id); setMode('login'); setAlias('')
          setNotice('Account ready. Choose Enter to continue.')
        }
      }
    } catch {
      setError(mode === 'login'
        ? 'The account could not be opened. Check your password and try again. If the problem continues, restore a valid account backup.'
        : mode === 'migrate' ? 'Existing data could not be imported. Your originals remain unchanged. Try again later with a new account name.'
          : mode === 'import' ? 'Import failed. Check the archive password and use a supported RPGraph account export.'
          : 'The account could not be created. Choose another public name and try again.')
    } finally { clearSecrets(); setBusy(false) }
  }

  return <main className="account-login">
    <div className="account-titlebar"><span>RPgraph Studio</span><div>
      <button type="button" aria-label="Minimize window" onClick={() => void window.rpgraph.minimizeWindow().catch(() => {})}>−</button>
      <button type="button" aria-label="Close window" onClick={() => void window.rpgraph.closeWindow().catch(() => {})}>×</button>
    </div></div>
    <section className="account-entry" aria-labelledby="account-heading">
      <div className="account-brand"><img src={appIcon} alt="" /><span className="brand-name"><span className="brand-name-rp">RP</span>graph Studio</span></div>
      <div><p className="account-eyebrow">LOCAL ACCOUNTS</p><h1 id="account-heading">{mode === 'login' ? 'Your stories, your space.' : mode === 'create' ? 'Make a space of your own.' : 'Bring your stories home.'}</h1>
        <p className="account-muted">{mode === 'login' ? 'Choose a local account to continue.' : mode === 'create' ? 'One account. All your worlds, settings and saves.' : mode === 'migrate' ? 'Copy existing local data into a new account. Originals are kept unless you explicitly choose deletion after import. After login, content is restored only when you choose to restore it.' : 'Import an RPGraph account export into a new account.'}</p></div>
      <form onSubmit={event => void handleSubmit(event)} aria-busy={busy || loading}>
        <fieldset disabled={busy || loading}>
          {mode === 'login' ? <>
            <label className="account-field">Account<select value={selected} onChange={event => { setSelected(event.target.value); clearSecrets(); setError(''); setNotice('') }} autoComplete="username">
              {loading && <option>Loading accounts…</option>}
              {accounts.map(account => <option key={account.id} value={account.id}>{account.alias} — {account.shared ? 'Shared default' : account.protected ? 'Password protected' : 'No password'}</option>)}
            </select></label>
            {active?.shared && <p className="account-notice">Shared default — password: <strong>default</strong>. Not private.</p>}
            {active?.protectionChangePending && <p className="account-notice">A protection change was interrupted. Enter the account password to finish recovery.</p>}
            {active?.protected || active?.protectionChangePending ? <PasswordField value={password} onChange={setPassword} /> : active && <p className="account-notice">This account is not encrypted.</p>}
            {hasLegacyData && <div className="account-notice"><p>Existing local data found</p><button type="button" onClick={() => chooseMode('migrate')}>Import existing data</button></div>}
          </> : <>
            <label className="account-field">Public account name<input value={alias} onChange={event => setAlias(event.target.value)} required maxLength={80} autoComplete="username" aria-describedby="account-alias-help" /></label>
            <p id="account-alias-help" className="account-caption">Visible before login. Choose a neutral name if you prefer.</p>
            {mode === 'import' && <PasswordField label="Archive password (if encrypted)" value={archivePassword} onChange={setArchivePassword} required={false} />}
            <label className="account-check"><input type="checkbox" checked={protectedAccount} onChange={event => { setProtectedAccount(event.target.checked); clearSecrets() }} />Protect this account with a password</label>
            {protectedAccount ? <><PasswordField label="New account password" value={password} onChange={setPassword} newPassword /><PasswordField label="Confirm password" value={confirmation} onChange={setConfirmation} newPassword />
              <p className="account-caption">Use a strong passphrase. Forgotten passwords cannot be reset.</p></> : <p className="account-notice">Anyone using this computer can open this account. Its data and exports will not be encrypted.</p>}
          </>}
          <button className="account-primary" type="submit" disabled={mode === 'login' && !active}>{busy ? 'Please wait…' : mode === 'create' ? 'Create account' : mode === 'migrate' ? 'Import into new account' : mode === 'import' ? 'Choose archive & import' : active?.protectionChangePending ? 'Recover protection' : active?.protected ? 'Unlock & enter' : 'Enter account'}</button>
          <div className="account-actions">{mode === 'login' ? <><button type="button" onClick={() => chooseMode('create')}>Create account</button><button type="button" onClick={() => chooseMode('import')}>Import account</button></> : <button type="button" onClick={() => chooseMode('login')}>Back to accounts</button>}</div>
        </fieldset>
        {error && <p className="account-error" role="alert" tabIndex={-1} ref={errorRef}>{error}</p>}
        {notice && <p role="status" className="account-notice">{notice}</p>}
      </form>
      <footer><p className="account-caption">Accounts stay on this computer.</p><ProtectionHelp /></footer>
    </section>
    <aside className="account-art" aria-hidden="true"><img src={loginArtwork} alt="" className="account-illustration" draggable={false} /><div className="account-art-copy"><p>EVERY CHOICE CONNECTS.</p><span>Build a world.<br />Follow a different thread.</span></div></aside>
  </main>
}
