import { Routes, Route, Navigate } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { AppLayout } from './layouts/app-layout';
import { Home } from './pages/home';
import { Workflows } from './pages/workflows';
import { AccessRequest } from './pages/access-request';
import { AccessRequests } from './pages/access-requests';
import { WorkflowInteraction } from './pages/workflow-interaction';
import { useAuth } from './auth/auth-context';
import { getWhoami } from './services/backend/auth';
import { getMyAccessRequest } from './services/backend/access-requests';
import { getStoredAppToken } from './services/backend/axios';
import { isAdminRole } from './lib/roles';

function AccessRequestRoute() {
  const { user, isLoading: authLoading } = useAuth();
  const hasToken = Boolean(getStoredAppToken());
  const canQuery = !authLoading && (Boolean(user) || hasToken);

  const whoamiQuery = useQuery({
    queryKey: ['whoami', user?.email ?? ''],
    queryFn: ({ signal }) => getWhoami({ signal }),
    enabled: Boolean(user),
  });

  const myRequestQuery = useQuery({
    queryKey: ['access-requests', 'my', user?.email ?? ''],
    queryFn: ({ signal }) => getMyAccessRequest({ signal }),
    enabled: canQuery,
  });

  const isAdmin = isAdminRole(whoamiQuery.data?.n8nUser?.role?.slug);
  const hasPendingRequest = myRequestQuery.data?.accessRequest?.status === 'pending';

  if (authLoading || whoamiQuery.isLoading || myRequestQuery.isLoading) {
    return null;
  }

  if (isAdmin || !hasPendingRequest) {
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
      </Routes>
    </AppLayout>
  );
}
