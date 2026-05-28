import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import { getAppBasePath } from './config/base-path';

async function bootstrap() {
  const [{ BrowserRouter }, { QueryClientProvider }, { AuthProvider }, { queryClient }, { App }] = await Promise.all([
    import('react-router'),
    import('@tanstack/react-query'),
    import('./auth/auth-context'),
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
          <AuthProvider>
            <App />
          </AuthProvider>
        </QueryClientProvider>
      </BrowserRouter>
    </StrictMode>,
  );
}

void bootstrap();
