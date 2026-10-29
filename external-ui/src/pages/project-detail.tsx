import { Navigate } from 'react-router';
import { ProjectDetailView } from '../components/projects/project-detail-view';
import { usePermissions } from '../state/session';

export function ProjectDetail() {
  const permissions = usePermissions();
  const isAdmin = permissions?.isAdmin ?? false;

  if (!isAdmin) {
    return <Navigate to="/projects" replace />;
  }

  return <ProjectDetailView />;
}
