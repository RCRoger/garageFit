import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from '@/app/App';
import { PreferencesProvider } from '@/contexts/PreferencesContext';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PreferencesProvider>
      <App />
    </PreferencesProvider>
  </StrictMode>,
);
