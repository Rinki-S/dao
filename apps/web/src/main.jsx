import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.jsx';
import { AnchoredToastProvider, ToastProvider } from '@/components/ui/toast.jsx';
import { applyAppearance, readAppearance } from '@/lib/appearance.js';

// Before first paint, so a stored preference never flashes the other appearance.
applyAppearance(readAppearance());

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ToastProvider>
      <AnchoredToastProvider>
        <App />
      </AnchoredToastProvider>
    </ToastProvider>
  </StrictMode>,
);
