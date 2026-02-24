const LOG_PREFIX = '[Custom APIs]';

const N8N_API_KEY = 'X-N8N-API-KEY'; // pragma: allowlist secret
const N8N_DI_PATH = '/usr/local/lib/node_modules/n8n/node_modules/@n8n/di';
const N8N_DB_PATH = '/usr/local/lib/node_modules/n8n/node_modules/@n8n/db';
const N8N_API_KEY_SERVICE_PATH = '/usr/local/lib/node_modules/n8n/dist/services/public-api-key.service.js';

interface User {
  updatedAt: string; // ISO datetime
  createdAt: string; // ISO datetime
  id: string; // UUID
  email: string;
  firstName: string;
  lastName: string;
  personalizationAnswers: unknown | null;
  settings: UserSettings;
  disabled: boolean;
  mfaEnabled: boolean;
  lastActiveAt: string; // ISO date (YYYY-MM-DD)
  role: Role;
  isPending: boolean;
}

interface UserSettings {
  userActivated: boolean;
  easyAIWorkflowOnboarded: boolean;
}

interface Role {
  updatedAt: string; // ISO datetime
  createdAt: string; // ISO datetime
  slug: string;
  displayName: string;
  description: string;
  systemRole: boolean;
  roleType: string;
  scopes: Scope[];
}

interface Scope {
  slug: string;
  displayName: string;
  description: string | null;
}

const hookConfig = {
  n8n: {
    ready: [
      async function (server) {
        console.info(`${LOG_PREFIX} 🚀 Initializing Custom Endpoints...`);

        const { Container } = require(N8N_DI_PATH);
        const {
          withTransaction,
          UserRepository,
          ProjectRepository,
          WorkflowRepository,
          SharedWorkflowRepository,
          GLOBAL_OWNER_ROLE,
          GLOBAL_ADMIN_ROLE,
        } = require(N8N_DB_PATH);
        const { PublicApiKeyService } = require(N8N_API_KEY_SERVICE_PATH);

        const apiKeyService = Container.get(PublicApiKeyService);
        const userRepository = Container.get(UserRepository);
        const projectRepository = Container.get(ProjectRepository);
        const workflowRepository = Container.get(WorkflowRepository);
        const sharedWorkflowRepository = Container.get(SharedWorkflowRepository);

        const { app } = server;

        const adminAuthMiddleware = async (req, res, next) => {
          try {
            const token = req.header(N8N_API_KEY);

            if (!token) {
              console.warn(`${LOG_PREFIX} [401] Access denied: No API key provided.`);
              return res.status(401).json({ error: 'No API key provided' });
            }

            const caller: User = await apiKeyService.getUserForApiKey(token);
            const isGlobalAdmin = [GLOBAL_OWNER_ROLE.slug, GLOBAL_ADMIN_ROLE.slug].includes(caller.role.slug);

            if (!isGlobalAdmin) {
              console.warn(`${LOG_PREFIX} [403] Forbidden: ${caller.email} lacks Admin/Owner privileges.`);
              return res.status(403).json({ error: 'Global admin access required.' });
            }

            req.caller = caller;
            next();
          } catch (error) {
            console.error(`${LOG_PREFIX} [500] Auth Middleware Error:`, error.message);
            res.status(500).json({ error: 'Internal Server Error during authentication.' });
          }
        };

        app.get('/rest/custom/users/:email/project', adminAuthMiddleware, async (req, res) => {
          const { email } = req.params;
          const startTime = Date.now();

          try {
            const user = await userRepository.findOneBy({ email });
            if (!user) {
              console.info(`${LOG_PREFIX} [404] Target user not found: ${email}`);
              return res.status(404).json({ error: 'Target user does not exist.' });
            }

            const personalProject = await projectRepository.getPersonalProjectForUserOrFail(user.id);

            const duration = Date.now() - startTime;
            console.info(
              `${LOG_PREFIX} [200] Success: ${req.caller.email} fetched project for ${email} (${duration}ms)`,
            );

            res.json({ user, project: personalProject });
          } catch (error) {
            console.error(`${LOG_PREFIX} [500] Internal Error for ${email}:`, error.message);
            console.debug(error.stack);
            res.status(500).json({ error: 'Internal Server Error' });
          }
        });

        app.post('/rest/custom/associate-workflow', adminAuthMiddleware, async (req, res) => {
          const startTime = Date.now();
          const { workflowId, projectId } = req.body;

          try {
            if (!workflowId || !projectId) {
              return res.status(400).json({ error: 'Missing workflowId or projectId in request body.' });
            }

            const [workflow, project] = await Promise.all([
              workflowRepository.findOneBy({ id: workflowId }),
              projectRepository.findOneBy({ id: projectId }),
            ]);

            // 1. Verify workflow exists
            if (!workflow) {
              console.info(`${LOG_PREFIX} [404] Workflow move failed: Workflow ${workflowId} not found.`);
              return res.status(404).json({ error: 'Workflow not found.' });
            }

            // 2. Verify project exists
            if (!project) {
              console.info(`${LOG_PREFIX} [404] Workflow move failed: Project ${projectId} not found.`);
              return res.status(404).json({ error: 'Project not found.' });
            }

            await withTransaction(sharedWorkflowRepository.manager, null, async (em) => {
              await em.save(
                await sharedWorkflowRepository.create({
                  project,
                  workflow,
                  role: 'workflow:owner',
                }),
              );
            });

            const duration = Date.now() - startTime;
            console.info(
              `${LOG_PREFIX} [200] Success: 'Workflow' ${workflowId} shared to project '${projectId}' by ${req.caller.email} (${duration}ms)`,
            );

            res.json({
              success: true,
              message: `Workflow '${workflowId}' successfully associated with project '${projectId}'`,
            });
          } catch (error) {
            console.error(`${LOG_PREFIX} [500] Association Error:`, error.message);
            console.debug(error.stack);
            res.status(500).json({ error: 'Internal Server Error' });
          }
        });

        console.info(`${LOG_PREFIX} ✅ Custom Routes Active.`);
      },
    ],
  },
};

export = hookConfig;
