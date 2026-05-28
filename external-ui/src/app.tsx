import { Routes, Route } from 'react-router';
import { AppLayout } from './layouts/app-layout';
import { Home } from './pages/home';
import { Workflows } from './pages/workflows';

export function App() {
  return (
    <AppLayout>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/workflows" element={<Workflows />} />
      </Routes>
    </AppLayout>
  );
}
