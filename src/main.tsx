import { Profiler, StrictMode } from 'react';
import { profileUiRender } from './diagnostics/uiPerformance';
import { createRoot } from 'react-dom/client';
import './browserRpgraphStub';
import '@xyflow/react/dist/style.css';
import './styles.css';
import './styles/index.css';
import App from './App';
import { PanelNavigation } from './navigation/PanelNavigation';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PanelNavigation><Profiler id="App" onRender={profileUiRender}><App /></Profiler></PanelNavigation>
  </StrictMode>,
);
