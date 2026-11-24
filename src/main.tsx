import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/theme.css';
import './styles/hud.css';
import App from './App';
import { GlossaryProvider } from './components/GlossaryTerm';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <GlossaryProvider>
      <App />
    </GlossaryProvider>
  </StrictMode>
);
