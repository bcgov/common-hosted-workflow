import { ProjectDetailView } from '../components/projects/project-detail-view';
import { usePermissions } from '../state/session';

export function ProjectDetail() {
  const permissions = usePermissions();
  const isAdmin = permissions?.isAdmin ?? false;

  // Same page as admins; non-admins get a read-only view scoped to projects
  // they can access in n8n (enforced server-side on the shared endpoints).
  return <ProjectDetailView readOnly={!isAdmin} />;
}
