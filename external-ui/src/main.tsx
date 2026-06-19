import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router';
import { SessionBootstrap } from './auth/session-bootstrap';
import { App } from './app';
import './index.css';
import { getAppBasePath } from './config/base-path';
import { queryClient } from './query-client';

const root = document.getElementById('root');
if (!root) {
  throw new Error('Root element not found');
}

createRoot(root).render(
  <StrictMode>
    <BrowserRouter basename={getAppBasePath() || undefined}>
      <QueryClientProvider client={queryClient}>
        <SessionBootstrap>
          <App />
        </SessionBootstrap>
      </QueryClientProvider>
    </BrowserRouter>
  </StrictMode>,
);
