import { Router, type Request, type Response, type NextFunction } from 'express';
import { GRAFANA_PROJECTS_SECRET } from '@config';
import { GrafanaOrgService } from '../services/grafana-org.service';
import { createLogger } from '../utils/logger';
import type { ApiRouteContext } from '../types/routes';

const log = createLogger('GrafanaProjects');

export function buildGrafanaProjectsRouter(routeContext: ApiRouteContext): Router {
  const { services, customRepositories, n8nRepositories } = routeContext;
  const router = Router();

  if (!GRAFANA_PROJECTS_SECRET) {
    router.use((_req: Request, res: Response) =>
      res.status(503).json({ error: 'GRAFANA_PROJECTS_SECRET not configured' }),
    );
    log.warn('Grafana projects endpoint disabled — GRAFANA_PROJECTS_SECRET not set');
    return router;
  }

  const grafanaOrgService = new GrafanaOrgService(
    services.cstar,
    customRepositories.tenantProjectRelation,
    n8nRepositories.project,
    n8nRepositories.user,
  );

  function validateSecret(req: Request, res: Response, next: NextFunction) {
    if (req.headers['x-grafana-secret'] !== GRAFANA_PROJECTS_SECRET) {
      log.warn('Grafana projects: invalid or missing secret', { path: req.path });
      return res.status(401).json({ error: 'Unauthorized' });
    }
    return next();
  }

  router.use(validateSecret);

  /**
   * GET /rest/custom/v1/obs/projects
   *
   * Returns the list of projects the authenticated user can access, resolved
   * from CSTAR tenants and n8n personal project. Used by the Grafana Infinity
   * datasource to populate the project_id dashboard variable.
   *
   * Response: { isAdmin: boolean, projects: Array<{ id: string, name: string }> }
   */
  router.get('/', async (req: Request, res: Response) => {
    try {
      const { isAdmin, projects } = await grafanaOrgService.resolveProjects(req.headers.authorization);
      return res.json({ isAdmin, projects });
    } catch (err: unknown) {
      if ((err as { status?: number }).status === 401) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      log.error('Grafana projects: failed to resolve projects', { error: String(err) });
      return res.status(503).json({ error: 'Project resolution unavailable — please retry' });
    }
  });

  /**
   * GET /rest/custom/v1/obs/projects/workflows
   *
   * Returns all workflows belonging to the user's accessible projects. Used by
   * the Grafana Infinity datasource to populate the workflow_id dashboard variable.
   * Admins receive all workflows across all projects.
   *
   * Response: Array<{ id: string, name: string, projectId: string }>
   */
  router.get('/workflows', async (req: Request, res: Response) => {
    try {
      const { isAdmin, projects } = await grafanaOrgService.resolveProjects(req.headers.authorization);
      const projectIds = projects.map((p) => p.id);

      // Optional project filter from the Grafana variable URL. Infinity's backend
      // parser doesn't support post-fetch filters, so filtering is done here instead.
      // The allValue ".*" means no filter; an empty string is also treated as no filter.
      const rawProjectId = typeof req.query.projectId === 'string' ? req.query.projectId : '';
      const selectedProjectId = rawProjectId && rawProjectId !== '.*' ? rawProjectId : null;

      let filterProjectIds: string[] | undefined;
      if (isAdmin) {
        filterProjectIds = selectedProjectId ? [selectedProjectId] : undefined;
      } else if (selectedProjectId) {
        if (!projectIds.includes(selectedProjectId)) {
          return res.json([{ id: '', name: '', projectId: '' }]);
        }
        filterProjectIds = [selectedProjectId];
      } else {
        filterProjectIds = projectIds;
      }

      const rows = await n8nRepositories.sharedWorkflow.findWorkflowRowsByProjectIds(filterProjectIds);

      const seen = new Set<string>();
      const items = rows
        .filter((r) => !seen.has(r.workflowId) && seen.add(r.workflowId))
        .map((r) => ({ id: r.workflowId, name: r.workflowName, projectId: r.projectId }));

      // Infinity's backend parser returns 0 fields for an empty JSON array, causing a
      // "at least one field expected for variable" error in the frontend plugin.
      // Return a placeholder row so the schema is always emitted; the workflow_id
      // variable's regex "^.+$" excludes it from the visible dropdown options.
      return res.json(items.length > 0 ? items : [{ id: '', name: '', projectId: '' }]);
    } catch (err: unknown) {
      if ((err as { status?: number }).status === 401) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      log.error('Grafana projects: failed to resolve workflows', { error: String(err) });
      return res.status(503).json({ error: 'Workflow resolution unavailable — please retry' });
    }
  });

  log.info('Grafana projects endpoint enabled');
  return router;
}
