import { useId, useState } from 'react'

export function PasswordField({ label = 'Password', value, onChange, newPassword = false, required = true }: {
  label?: string; value: string; onChange: (value: string) => void; newPassword?: boolean; required?: boolean
}) {
  const id = useId()
  const [visible, setVisible] = useState(false)
  return <div className="account-field">
    <label htmlFor={id}>{label}</label>
    <div className="account-password">
      <input id={id} type={visible ? 'text' : 'password'} value={value} required={required}
        autoComplete={newPassword ? 'new-password' : 'current-password'} spellCheck={false}
        onChange={event => onChange(event.target.value)} />
      <button type="button" aria-label={`${visible ? 'Hide' : 'Show'} ${label.toLowerCase()}`}
        aria-pressed={visible} onClick={() => setVisible(!visible)}>{visible ? 'Hide' : 'Show'}</button>
    </div>
  </div>
}

export function ProtectionHelp() {
  return <details className="account-help"><summary>About local account protection</summary>
    <p>Passwords protect stored account data while you are logged out. An unlocked app can display and send content to providers you use. Protection does not cover malware, administrator access, screenshots, or external copies.</p>
    <p>There is no password reset. Keep a backup and a safe copy of your password. Public account names remain visible on the login screen.</p>
  </details>
}
