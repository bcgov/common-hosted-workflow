export const N8N_DI_PATH = '/usr/local/lib/node_modules/n8n/node_modules/@n8n/di';
export const N8N_DB_PATH = '/usr/local/lib/node_modules/n8n/node_modules/@n8n/db';
// The Cipher/Credentials classes live in the `n8n-core` package (npm name is
// `n8n-core`, not `@n8n/core` — the source lives under packages/core in the repo).
export const N8N_CORE_PATH = '/usr/local/lib/node_modules/n8n/node_modules/n8n-core';
export const N8N_JWT_SERVICE_PATH = '/usr/local/lib/node_modules/n8n/dist/services/jwt.service.js';
export const N8N_USER_SERVICE_PATH = '/usr/local/lib/node_modules/n8n/dist/services/user.service.js';
export const N8N_NODE_MAILER_PATH = '/usr/local/lib/node_modules/n8n/dist/user-management/email/node-mailer.js';
export const N8N_AUTH_SERVICE_PATH = '/usr/local/lib/node_modules/n8n/dist/auth/auth.service.js';
export const N8N_CREDENTIALS_SERVICE_PATH = '/usr/local/lib/node_modules/n8n/dist/credentials/credentials.service.js';
export const N8N_CREDENTIALS_FINDER_SERVICE_PATH =
  '/usr/local/lib/node_modules/n8n/dist/credentials/credentials-finder.service.js';
export const N8N_PROJECT_SERVICE_PATH = '/usr/local/lib/node_modules/n8n/dist/services/project.service.ee.js';
export const N8N_EVENT_SERVICE_PATH = '/usr/local/lib/node_modules/n8n/dist/events/event.service.js';
export const N8N_WORKFLOW_PATH = '/usr/local/lib/node_modules/n8n/node_modules/n8n-workflow';
// Config (`WorkflowsConfig`) and the execution classes used to start a published workflow in-process.
export const N8N_CONFIG_PATH = '/usr/local/lib/node_modules/n8n/node_modules/@n8n/config';
export const N8N_WORKFLOW_RUNNER_PATH = '/usr/local/lib/node_modules/n8n/dist/workflow-runner.js';
export const N8N_ACTIVE_EXECUTIONS_PATH = '/usr/local/lib/node_modules/n8n/dist/active-executions.js';
export const N8N_WORKFLOW_PUBLISHED_DATA_PATH =
  '/usr/local/lib/node_modules/n8n/dist/workflows/workflow-published-data.service.js';

/**
 * Contract with n8n's compiled runtime: every module this integration `require()`s at runtime,
 * and the named exports it reads from each. external-hooks has no npm dependency on n8n — these
 * are resolved from the n8n container's `node_modules`/`dist` at startup, so an n8n upgrade that
 * renames or moves any of them silently breaks the integration (credentials, or the WIL Trigger
 * runner, degrade to "unavailable").
 *
 * `scripts/verify-n8n-internals.ts` walks this manifest inside the n8n image and fails the build
 * when a module is missing or an expected export is gone, turning a runtime degradation into a
 * loud failure at provision time. Keep it exhaustive: every `require(N8N_*_PATH)` in `src/` MUST
 * have its exports listed here, and `n8n-paths.contract.test.ts` enforces that every `N8N_*_PATH`
 * constant appears as a key below.
 */
export const N8N_INTERNAL_MODULES: Record<string, readonly string[]> = {
  [N8N_DI_PATH]: ['Container'],
  [N8N_DB_PATH]: [
    'withTransaction',
    'UserRepository',
    'ProjectRepository',
    'ProjectRelationRepository',
    'WorkflowRepository',
    'SharedWorkflowRepository',
    'CredentialsRepository',
    'SharedCredentialsRepository',
    'ExecutionRepository',
    'GLOBAL_OWNER_ROLE',
    'GLOBAL_ADMIN_ROLE',
  ],
  [N8N_CORE_PATH]: ['Credentials'],
  [N8N_JWT_SERVICE_PATH]: ['JwtService'],
  [N8N_USER_SERVICE_PATH]: ['UserService'],
  [N8N_NODE_MAILER_PATH]: ['NodeMailer'],
  [N8N_AUTH_SERVICE_PATH]: ['AuthService'],
  [N8N_CREDENTIALS_SERVICE_PATH]: ['CredentialsService'],
  [N8N_CREDENTIALS_FINDER_SERVICE_PATH]: ['CredentialsFinderService'],
  [N8N_PROJECT_SERVICE_PATH]: ['ProjectService'],
  [N8N_EVENT_SERVICE_PATH]: ['EventService'],
  [N8N_WORKFLOW_PATH]: ['createRunExecutionData', 'CREDENTIAL_BLANKING_VALUE'],
  [N8N_CONFIG_PATH]: ['WorkflowsConfig'],
  [N8N_WORKFLOW_RUNNER_PATH]: ['WorkflowRunner'],
  [N8N_ACTIVE_EXECUTIONS_PATH]: ['ActiveExecutions'],
  [N8N_WORKFLOW_PUBLISHED_DATA_PATH]: ['WorkflowPublishedDataService'],
} as const;
