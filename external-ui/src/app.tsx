import { Routes, Route, Navigate } from 'react-router';
import { AppLayout } from './layouts/app-layout';
import { Home } from './pages/home';
import { Workflows } from './pages/workflows';
import { AccessRequest } from './pages/access-request';
import { AccessRequests } from './pages/access-requests';
import { WorkflowInteraction } from './pages/workflow-interaction';
import { Projects } from './pages/projects';
import { usePermissions, useSessionLoading } from './state/session';

function AccessRequestRoute() {
  const permissions = usePermissions();
  const isLoading = useSessionLoading();
  const canRequestAccess = permissions?.canRequestAccess ?? false;

  if (isLoading) {
    return null;
  }

  if (!canRequestAccess) {
    return <Navigate to="/" replace />;
  }

  return <AccessRequest />;
}

export function App() {
  return (
    <AppLayout>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/workflows" element={<Workflows />} />
        <Route path="/access-request" element={<AccessRequestRoute />} />
        <Route path="/access-requests" element={<AccessRequests />} />
        <Route path="/workflow-interaction" element={<WorkflowInteraction />} />
        <Route path="/projects" element={<Projects />} />
      </Routes>
    </AppLayout>
  );
}
