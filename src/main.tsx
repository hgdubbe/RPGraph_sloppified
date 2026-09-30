import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './browserRpgraphStub';
import '@xyflow/react/dist/style.css';
import './styles.css';
import { AccountBootstrap } from './accounts/AccountBootstrap';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AccountBootstrap />
  </StrictMode>,
);
