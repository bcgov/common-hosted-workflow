import { toTrimmedString } from './middleware';
import { TenantProjectRelationRepository } from '../db/repository/workflow-interaction-layer/message';

const TENANT_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type Request = {
  params: Record<string, string | undefined>;
  body: Record<string, unknown>;
  caller?: { email: string; role: { slug: string } };
};

type Response = {
  status: (code: number) => { json: (payload: unknown) => unknown };
  json: (payload: unknown) => unknown;
};

export function registerAdminRoutes({
  app,
  adminAuthMiddleware,
  logPrefix,
  userRepository,
  projectRepository,
  workflowRepository,
  sharedWorkflowRepository,
  withTransaction,
  tenantProjectRelationRepository,
}: {
  app: any;
  adminAuthMiddleware: any;
  logPrefix: string;
  userRepository: any;
  projectRepository: any;
  workflowRepository: any;
  sharedWorkflowRepository: any;
  withTransaction: any;
  tenantProjectRelationRepository: TenantProjectRelationRepository;
}) {
  app.get('/rest/custom/admin/users/:email/project', adminAuthMiddleware, async (req: Request, res: Response) => {
    const { email } = req.params;
    try {
      const user = await userRepository.findOneBy({ email });
      if (!user) {
        console.warn(`${logPrefix} [404] Target user not found: ${email}`);
        return res.status(404).json({ error: 'Target user does not exist.' });
      }

      const personalProject = await projectRepository.getPersonalProjectForUserOrFail(user.id);

      return res.json({ user, project: personalProject });
    } catch (error) {
      console.error(`${logPrefix} [500] Internal Error for ${email}:`, (error as Error).message);
      console.debug((error as Error).stack);
      return res.status(500).json({ error: 'Internal Server Error' });
    }
  });

  app.post('/rest/custom/admin/associate-workflow', adminAuthMiddleware, async (req: Request, res: Response) => {
    const workflowId = toTrimmedString(req.body.workflowId);
    const projectId = toTrimmedString(req.body.projectId);
    const singleOwner = req.body.singleOwner === true;
    try {
      if (!workflowId || !projectId) {
        return res.status(400).json({ error: 'Missing workflowId or projectId in request body.' });
      }

      const [workflow, project] = await Promise.all([
        workflowRepository.findOneBy({ id: workflowId }),
        projectRepository.findOneBy({ id: projectId }),
      ]);

      if (!workflow) {
        console.warn(`${logPrefix} [404] Workflow move failed: Workflow ${workflowId} not found.`);
        return res.status(404).json({ error: 'Workflow not found.' });
      }

      if (!project) {
        console.warn(`${logPrefix} [404] Workflow move failed: Project ${projectId} not found.`);
        return res.status(404).json({ error: 'Project not found.' });
      }

      await withTransaction(sharedWorkflowRepository.manager, null, async (em: any) => {
        if (singleOwner) await em.delete('SharedWorkflow', { workflow });
        const newShare = em.create('SharedWorkflow', { project, workflow, role: 'workflow:owner' });
        await em.save(newShare);
      });

      return res.json({
        success: true,
        message: `Workflow '${workflowId}' successfully associated with project '${projectId}'`,
      });
    } catch (error) {
      console.error(`${logPrefix} [500] Association Error:`, (error as Error).message);
      console.debug((error as Error).stack);
      return res.status(500).json({ error: 'Internal Server Error' });
    }
  });

  app.post('/rest/custom/admin/tenant-project-relation', adminAuthMiddleware, async (req: Request, res: Response) => {
    const tenantId = toTrimmedString(req.body.tenantId ?? req.body.tenant_id);
    const projectId = toTrimmedString(req.body.projectId ?? req.body.project_id);

    try {
      if (!tenantId || !projectId) {
        return res.status(400).json({ error: 'Missing tenantId or projectId in request body.' });
      }
      if (!TENANT_UUID_RE.test(tenantId)) {
        return res.status(400).json({ error: 'Invalid tenantId (expected UUID).' });
      }

      const project = await projectRepository.findOneBy({ id: projectId });
      if (!project) {
        console.warn(`${logPrefix} [404] tenant_project_relation insert failed: Project ${projectId} not found.`);
        return res.status(404).json({ error: 'Project not found.' });
      }

      const result = await tenantProjectRelationRepository.insertTenantProjectRelation({ tenantId, projectId });
      if (result.created) {
        return res.status(201).json({
          success: true,
          message: `Inserted tenant/project relation tenantId=${tenantId} projectId=${projectId}`,
        });
      }

      if (result.conflictProjectId) {
        return res.status(409).json({
          error: 'tenant already has a project mapping',
          conflictProjectId: result.conflictProjectId,
        });
      }

      if (result.conflictTenantId) {
        return res.status(409).json({
          error: 'projectId is already mapped to a different tenant',
          conflictTenantId: result.conflictTenantId,
        });
      }

      return res.status(200).json({
        success: true,
        message: 'Relation already exists.',
      });
    } catch (error) {
      console.error(`${logPrefix} [500] tenant_project_relation insert error:`, (error as Error).message);
      console.debug((error as Error).stack);
      return res.status(500).json({ error: 'Internal Server Error' });
    }
  });
}
