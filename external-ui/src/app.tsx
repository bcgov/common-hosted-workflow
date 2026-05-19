import { Routes, Route } from 'react-router';
import { AppLayout } from './layouts/app-layout';
import { Home } from './pages/home';
import { Callback } from './pages/callback';
import { Workflows } from './pages/workflows';

export function App() {
  return (
    <AppLayout>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/workflows" element={<Workflows />} />
        <Route path="/auth/callback" element={<Callback />} />
      </Routes>
    </AppLayout>
  );
}
