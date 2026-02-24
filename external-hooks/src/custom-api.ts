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
        const { UserRepository, ProjectRepository, GLOBAL_OWNER_ROLE, GLOBAL_ADMIN_ROLE } = require(N8N_DB_PATH);
        const { PublicApiKeyService } = require(N8N_API_KEY_SERVICE_PATH);

        const apiKeyService = Container.get(PublicApiKeyService);
        const userRepository = Container.get(UserRepository);
        const projectRepository = Container.get(ProjectRepository);

        const { app } = server;

        app.get('/rest/custom/users/:email/project', async (req, res) => {
          const { email } = req.params;
          const startTime = Date.now();

          try {
            const token = req.header(N8N_API_KEY);

            if (!token) {
              console.warn(`${LOG_PREFIX} [401] Unauthorized access attempt to user project: ${email}`);
              return res.status(401).json({ error: 'No API key provided' });
            }

            const caller: User = await apiKeyService.getUserForApiKey(token);
            const isGlobalAdmin = [GLOBAL_OWNER_ROLE, GLOBAL_ADMIN_ROLE].includes(caller.role.slug);
            if (!isGlobalAdmin) {
              console.warn(`${LOG_PREFIX} [403] Forbidden: User ${caller.email} attempted to access data for ${email}`);
              return res.status(403).json({ error: 'Global admin access required.' });
            }

            const user = await userRepository.findOneBy({ email });
            if (!user) {
              console.info(`${LOG_PREFIX} [404] Target user not found: ${email}`);
              return res.status(404).json({ error: 'Target user does not exist.' });
            }

            const personalProject = await projectRepository.getPersonalProjectForUserOrFail(user.id);

            const duration = Date.now() - startTime;
            console.info(`${LOG_PREFIX} [200] Success: ${caller.email} fetched project for ${email} (${duration}ms)`);

            res.json({ user, project: personalProject });
          } catch (error) {
            console.error(`${LOG_PREFIX} [500] Internal Error for ${email}:`, error.message);
            // Log the full stack trace only for 500 errors
            console.debug(error.stack);
            res.status(500).json({ error: 'Internal Server Error' });
          }
        });
      },
    ],
  },
};

export = hookConfig;
