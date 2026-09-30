import { useEffect, useState, type ComponentType } from 'react';
import { AccountLogin } from './AccountLogin';
import { initializeAccountPreferences } from './accountPreferences';
import type { AccountAPI, PublicAccount } from './types';

type WorkspaceComponent = ComponentType<{ api?: AccountAPI; account: PublicAccount | null }>;
type BootstrapState = { mode: 'loading' | 'error' | 'demo' } | { mode: 'locked'; legacyAvailable?: boolean } | { mode: 'ready'; Workspace: WorkspaceComponent; account: PublicAccount | null };

export function AccountBootstrap() {
  const api = window.rpgraph?.accounts;
  const [state, setState] = useState<BootstrapState>({ mode: 'loading' });
  useEffect(() => {
    let alive = true;
    void (async () => {
      if (!api) { if (alive) setState({ mode: 'demo' }); return; }
      const { account, legacyAvailable } = await api.status();
      if (!alive) return;
      if (!account) { setState({ mode: 'locked', legacyAvailable }); return; }
      await initializeAccountPreferences(api, account);
      if (!alive) return;
      const { AccountWorkspace } = await import('./AccountWorkspace');
      if (alive) setState({ mode: 'ready', Workspace: AccountWorkspace, account });
    })().catch(() => { if (alive) setState({ mode: 'error' }); });
    return () => { alive = false; };
  }, [api]);
  async function enterDemo() {
    setState({ mode: 'loading' });
    try {
      await initializeAccountPreferences();
      const { AccountWorkspace } = await import('./AccountWorkspace');
      setState({ mode: 'ready', Workspace: AccountWorkspace, account: null });
    } catch { setState({ mode: 'error' }); }
  }
  if (state.mode === 'ready') return <state.Workspace api={api} account={state.account} />;
  if (state.mode === 'locked' && api) return <AccountLogin api={api} legacyAvailable={state.legacyAvailable} onUnlocked={() => { /* Host replaces this renderer with an authenticated session. */ }} />;
  if (state.mode === 'demo') return <main className="account-bootstrap"><h1>RPgraph Studio browser demo</h1><p>Changes are kept in memory and disappear when this page closes. Local accounts and encrypted storage require the desktop app.</p><button onClick={() => void enterDemo()}>Enter nonpersistent demo</button></main>;
  return <main className="account-bootstrap" role={state.mode === 'error' ? 'alert' : 'status'}>{state.mode === 'error' ? 'The application could not open this account. Restart RPgraph Studio and try again.' : 'Opening RPgraph Studio…'}</main>;
}
