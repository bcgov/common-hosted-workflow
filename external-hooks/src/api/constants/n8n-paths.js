"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.N8N_INTERNAL_MODULES = exports.N8N_WORKFLOW_PUBLISHED_DATA_PATH = exports.N8N_ACTIVE_EXECUTIONS_PATH = exports.N8N_WORKFLOW_RUNNER_PATH = exports.N8N_CONFIG_PATH = exports.N8N_WORKFLOW_PATH = exports.N8N_EVENT_SERVICE_PATH = exports.N8N_PROJECT_SERVICE_PATH = exports.N8N_CREDENTIALS_FINDER_SERVICE_PATH = exports.N8N_CREDENTIALS_SERVICE_PATH = exports.N8N_AUTH_SERVICE_PATH = exports.N8N_NODE_MAILER_PATH = exports.N8N_USER_SERVICE_PATH = exports.N8N_JWT_SERVICE_PATH = exports.N8N_CORE_PATH = exports.N8N_DB_PATH = exports.N8N_DI_PATH = void 0;
exports.N8N_DI_PATH = '/usr/local/lib/node_modules/n8n/node_modules/@n8n/di';
exports.N8N_DB_PATH = '/usr/local/lib/node_modules/n8n/node_modules/@n8n/db';
// The Cipher/Credentials classes live in the `n8n-core` package (npm name is
// `n8n-core`, not `@n8n/core` — the source lives under packages/core in the repo).
exports.N8N_CORE_PATH = '/usr/local/lib/node_modules/n8n/node_modules/n8n-core';
// As of n8n 2.45.x, several services that used to live in the CLI dist (`dist/...`) were moved
// into the `@n8n/backend-services` package. Paths below point into that package's compiled dist.
// Not a module path itself (so it is intentionally NOT named `*_PATH`, which the contract test
// treats as a required module). It is the dist root of `@n8n/backend-services`, prefixed below.
const N8N_BACKEND_SERVICES_DIST = '/usr/local/lib/node_modules/n8n/node_modules/@n8n/backend-services/dist';
exports.N8N_JWT_SERVICE_PATH = `${N8N_BACKEND_SERVICES_DIST}/services/jwt.service.js`;
exports.N8N_USER_SERVICE_PATH = '/usr/local/lib/node_modules/n8n/dist/services/user.service.js';
exports.N8N_NODE_MAILER_PATH = '/usr/local/lib/node_modules/n8n/dist/user-management/email/node-mailer.js';
exports.N8N_AUTH_SERVICE_PATH = '/usr/local/lib/node_modules/n8n/dist/auth/auth.service.js';
exports.N8N_CREDENTIALS_SERVICE_PATH = '/usr/local/lib/node_modules/n8n/dist/credentials/credentials.service.js';
exports.N8N_CREDENTIALS_FINDER_SERVICE_PATH = `${N8N_BACKEND_SERVICES_DIST}/credentials/credentials-finder.service.js`;
exports.N8N_PROJECT_SERVICE_PATH = '/usr/local/lib/node_modules/n8n/dist/services/project.service.ee.js';
exports.N8N_EVENT_SERVICE_PATH = `${N8N_BACKEND_SERVICES_DIST}/events/event.service.js`;
exports.N8N_WORKFLOW_PATH = '/usr/local/lib/node_modules/n8n/node_modules/n8n-workflow';
// Config (`WorkflowsConfig`) and the execution classes used to start a published workflow in-process.
exports.N8N_CONFIG_PATH = '/usr/local/lib/node_modules/n8n/node_modules/@n8n/config';
exports.N8N_WORKFLOW_RUNNER_PATH = '/usr/local/lib/node_modules/n8n/dist/workflow-runner.js';
exports.N8N_ACTIVE_EXECUTIONS_PATH = '/usr/local/lib/node_modules/n8n/dist/active-executions.js';
exports.N8N_WORKFLOW_PUBLISHED_DATA_PATH = `${N8N_BACKEND_SERVICES_DIST}/workflows/workflow-published-data.service.js`;
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
exports.N8N_INTERNAL_MODULES = {
    [exports.N8N_DI_PATH]: ['Container'],
    [exports.N8N_DB_PATH]: [
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
    [exports.N8N_CORE_PATH]: ['Credentials'],
    [exports.N8N_JWT_SERVICE_PATH]: ['JwtService'],
    [exports.N8N_USER_SERVICE_PATH]: ['UserService'],
    [exports.N8N_NODE_MAILER_PATH]: ['NodeMailer'],
    [exports.N8N_AUTH_SERVICE_PATH]: ['AuthService'],
    [exports.N8N_CREDENTIALS_SERVICE_PATH]: ['CredentialsService'],
    [exports.N8N_CREDENTIALS_FINDER_SERVICE_PATH]: ['CredentialsFinderService'],
    [exports.N8N_PROJECT_SERVICE_PATH]: ['ProjectService'],
    [exports.N8N_EVENT_SERVICE_PATH]: ['EventService'],
    [exports.N8N_WORKFLOW_PATH]: ['createRunExecutionData', 'CREDENTIAL_BLANKING_VALUE'],
    [exports.N8N_CONFIG_PATH]: ['WorkflowsConfig'],
    [exports.N8N_WORKFLOW_RUNNER_PATH]: ['WorkflowRunner'],
    [exports.N8N_ACTIVE_EXECUTIONS_PATH]: ['ActiveExecutions'],
    [exports.N8N_WORKFLOW_PUBLISHED_DATA_PATH]: ['WorkflowPublishedDataService'],
};
