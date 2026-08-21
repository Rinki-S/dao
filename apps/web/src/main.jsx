import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.jsx';
import { AnchoredToastProvider, ToastProvider } from '@/components/ui/toast.jsx';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ToastProvider>
      <AnchoredToastProvider>
        <App />
      </AnchoredToastProvider>
    </ToastProvider>
  </StrictMode>,
);
