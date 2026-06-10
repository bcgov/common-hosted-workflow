import { Routes, Route } from 'react-router';
import { AppLayout } from './layouts/app-layout';
import { Home } from './pages/home';
import { Workflows } from './pages/workflows';
import { AccessRequest } from './pages/access-request';
import { AccessRequests } from './pages/access-requests';

export function App() {
  return (
    <AppLayout>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/workflows" element={<Workflows />} />
        <Route path="/access-request" element={<AccessRequest />} />
        <Route path="/access-requests" element={<AccessRequests />} />
      </Routes>
    </AppLayout>
  );
}
