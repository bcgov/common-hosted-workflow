import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import { getAppBasePath } from './config/base-path';

async function bootstrap() {
  const [{ BrowserRouter }, { QueryClientProvider }, { SessionBootstrap }, { queryClient }, { App }] =
    await Promise.all([
      import('react-router'),
      import('@tanstack/react-query'),
      import('./auth/session-bootstrap'),
      import('./query-client'),
      import('./app'),
    ]);

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
}

void bootstrap();
