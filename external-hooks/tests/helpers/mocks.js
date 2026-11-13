"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.VALID_TOPUP_ID = exports.VALID_TRIGGER_ID = exports.VALID_INTERNAL_TOKEN = exports.VALID_API_KEY = exports.VALID_ACTION_ID = exports.VALID_ACTOR_ID = exports.VALID_EXECUTION_ID = exports.VALID_WORKFLOW_ID = exports.VALID_PROJECT_ID = exports.VALID_TENANT_ID = void 0;
exports.createMockRequest = createMockRequest;
exports.createMockResponse = createMockResponse;
exports.createMockNext = createMockNext;
exports.makeCaller = makeCaller;
exports.makeAdminCaller = makeAdminCaller;
exports.makeMessageRow = makeMessageRow;
exports.makeActionRequestRow = makeActionRequestRow;
exports.makeWorkflowTriggerRow = makeWorkflowTriggerRow;
exports.createMockMessageRepository = createMockMessageRepository;
exports.createMockActionRequestRepository = createMockActionRequestRepository;
exports.createMockTenantProjectRelationRepository = createMockTenantProjectRelationRepository;
exports.createMockWorkflowTriggerRepository = createMockWorkflowTriggerRepository;
exports.createMockProjectRateLimitRepository = createMockProjectRateLimitRepository;
exports.createMockProjectRateLimitDefaultRepository = createMockProjectRateLimitDefaultRepository;
exports.makeProjectRateLimitDefaultRow = makeProjectRateLimitDefaultRow;
exports.createMockProjectExecutionUsageRepository = createMockProjectExecutionUsageRepository;
exports.createMockWorkflowExecutionUsageRepository = createMockWorkflowExecutionUsageRepository;
exports.makeProjectTopupRow = makeProjectTopupRow;
exports.createMockProjectTopupRepository = createMockProjectTopupRepository;
exports.createMockRateLimitNotificationRepository = createMockRateLimitNotificationRepository;
exports.createMockN8nRepositories = createMockN8nRepositories;
exports.createMockUserRepository = createMockUserRepository;
exports.createMockN8nRepositoryObject = createMockN8nRepositoryObject;
exports.createMockActionService = createMockActionService;
exports.createMockMessageService = createMockMessageService;
exports.createMockExecutionRepo = createMockExecutionRepo;
exports.createMockSharedWorkflowRepo = createMockSharedWorkflowRepo;
exports.createMockRouteContext = createMockRouteContext;
/**
 * Shared mock factories and fixtures for external-hooks unit tests.
 *
 * Provides lightweight Express req/res/next fakes, repository stubs,
 * and domain object builders so individual test files stay focused on
 * behaviour rather than boilerplate.
 */
const vitest_1 = require("vitest");
/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */
exports.VALID_TENANT_ID = 'a1b2c3d4-e5f6-1a2b-8c3d-4e5f6a7b8c9d';
exports.VALID_PROJECT_ID = 'proj-001';
exports.VALID_WORKFLOW_ID = 'wf-100';
exports.VALID_EXECUTION_ID = 'exec-200';
exports.VALID_ACTOR_ID = 'actor-42';
exports.VALID_ACTION_ID = 'act-99';
exports.VALID_API_KEY = 'test-api-key-value'; // pragma: allowlist secret
exports.VALID_INTERNAL_TOKEN = 'internal-bearer-token'; // pragma: allowlist secret
function createMockRequest(overrides = {}) {
    const req = {
        body: {},
        query: {},
        params: {},
        headers: {},
        header: vitest_1.vi.fn((name) => {
            const lower = name.toLowerCase();
            const headers = req.headers;
            for (const [k, v] of Object.entries(headers)) {
                if (k.toLowerCase() === lower)
                    return v;
            }
            return undefined;
        }),
        ...overrides,
    };
    return req;
}
function createMockResponse(localsOverrides = {}) {
    const res = {
        status: vitest_1.vi.fn().mockReturnThis(),
        json: vitest_1.vi.fn().mockReturnThis(),
        locals: { ...localsOverrides },
        header: vitest_1.vi.fn(),
        redirect: vitest_1.vi.fn(),
        end: vitest_1.vi.fn(),
    };
    return res;
}
function createMockNext() {
    return vitest_1.vi.fn();
}
/* ------------------------------------------------------------------ */
/*  Caller / User fixtures                                             */
/* ------------------------------------------------------------------ */
function makeCaller(overrides = {}) {
    return {
        id: 'user-1',
        email: 'test@example.com',
        firstName: 'Test',
        lastName: 'User',
        disabled: false,
        role: { slug: 'global:member', displayName: 'Member' },
        ...overrides,
    };
}
function makeAdminCaller(roleSlug = 'global:owner') {
    return makeCaller({ role: { slug: roleSlug, displayName: 'Owner' } });
}
/* ------------------------------------------------------------------ */
/*  Domain object builders                                             */
/* ------------------------------------------------------------------ */
const BASE_DATE = new Date('2025-06-01T12:00:00.000Z');
function makeMessageRow(overrides = {}) {
    return {
        id: 'msg-001',
        title: 'Test message',
        body: 'Hello world',
        actorId: exports.VALID_ACTOR_ID,
        actorType: 'user',
        workflowInstanceId: exports.VALID_EXECUTION_ID,
        workflowId: exports.VALID_WORKFLOW_ID,
        projectId: exports.VALID_PROJECT_ID,
        status: 'active',
        metadata: null,
        createdAt: BASE_DATE,
        updatedAt: BASE_DATE,
        ...overrides,
    };
}
function makeActionRequestRow(overrides = {}) {
    return {
        id: exports.VALID_ACTION_ID,
        actionType: 'approval',
        actionTitle: null,
        payload: { key: 'value' },
        callbackUrl: 'https://example.com/callback',
        callbackMethod: 'POST',
        callbackPayloadSpec: null,
        actorId: exports.VALID_ACTOR_ID,
        actorType: 'user',
        workflowInstanceId: exports.VALID_EXECUTION_ID,
        workflowId: exports.VALID_WORKFLOW_ID,
        projectId: exports.VALID_PROJECT_ID,
        status: 'pending',
        priority: 'normal',
        dueDate: null,
        checkIn: null,
        metadata: null,
        claimedBy: null,
        claimedAt: null,
        completedBy: null,
        completedAt: null,
        createdAt: BASE_DATE,
        updatedAt: BASE_DATE,
        ...overrides,
    };
}
exports.VALID_TRIGGER_ID = 'trigger-001';
function makeWorkflowTriggerRow(overrides = {}) {
    return {
        id: exports.VALID_TRIGGER_ID,
        projectId: exports.VALID_PROJECT_ID,
        triggerType: 'button',
        targetKind: 'n8n-node',
        targetWorkflowId: 'wf1',
        targetNodeId: 'node1',
        metadata: { buttonText: 'Run' },
        allowedActorsType: 'user',
        allowedActors: ['actor@example.com'],
        authEnabled: false,
        createdAt: BASE_DATE,
        updatedAt: BASE_DATE,
        createdBy: 'creator@example.com',
        updatedBy: null,
        ...overrides,
    };
}
/* ------------------------------------------------------------------ */
/*  Repository mocks                                                   */
/* ------------------------------------------------------------------ */
function createMockMessageRepository() {
    return {
        list: vitest_1.vi.fn().mockResolvedValue([]),
        create: vitest_1.vi.fn().mockResolvedValue(makeMessageRow()),
    };
}
function createMockActionRequestRepository() {
    return {
        list: vitest_1.vi.fn().mockResolvedValue([]),
        getById: vitest_1.vi.fn().mockResolvedValue(null),
        create: vitest_1.vi.fn().mockResolvedValue(makeActionRequestRow()),
        updateStatus: vitest_1.vi.fn().mockResolvedValue(makeActionRequestRow()),
        claim: vitest_1.vi.fn().mockResolvedValue(makeActionRequestRow()),
        unclaim: vitest_1.vi.fn().mockResolvedValue(makeActionRequestRow()),
        startAction: vitest_1.vi.fn().mockResolvedValue(makeActionRequestRow()),
        directUpdate: vitest_1.vi.fn().mockResolvedValue(makeActionRequestRow()),
    };
}
function createMockTenantProjectRelationRepository() {
    return {
        getProjectIdsByTenantId: vitest_1.vi.fn().mockResolvedValue([exports.VALID_PROJECT_ID]),
        getTenantIdByProjectId: vitest_1.vi.fn().mockResolvedValue(null),
        getRowByTenantId: vitest_1.vi
            .fn()
            .mockResolvedValue({ tenantId: exports.VALID_TENANT_ID, projectId: exports.VALID_PROJECT_ID, projectType: null }),
        insert: vitest_1.vi.fn().mockResolvedValue(undefined),
        insertIgnoreConflict: vitest_1.vi.fn().mockResolvedValue(undefined),
        listDistinctTenantIds: vitest_1.vi.fn().mockResolvedValue([exports.VALID_TENANT_ID]),
        deleteByProjectId: vitest_1.vi.fn().mockResolvedValue(undefined),
        upsertByProjectId: vitest_1.vi.fn().mockResolvedValue(undefined),
        listAll: vitest_1.vi.fn().mockResolvedValue(new Map([[exports.VALID_PROJECT_ID, exports.VALID_TENANT_ID]])),
    };
}
function createMockWorkflowTriggerRepository() {
    return {
        list: vitest_1.vi.fn().mockResolvedValue([]),
        getById: vitest_1.vi.fn().mockResolvedValue(null),
        create: vitest_1.vi.fn().mockResolvedValue(makeWorkflowTriggerRow()),
        update: vitest_1.vi.fn().mockResolvedValue(makeWorkflowTriggerRow()),
        deleteById: vitest_1.vi.fn().mockResolvedValue(null),
        listIdsByProjectIds: vitest_1.vi.fn().mockResolvedValue([]),
    };
}
function createMockProjectRateLimitRepository() {
    return {
        get: vitest_1.vi.fn().mockResolvedValue(null),
        upsert: vitest_1.vi.fn().mockResolvedValue(undefined),
        listByProjectIds: vitest_1.vi.fn().mockResolvedValue(new Map()),
    };
}
function createMockProjectRateLimitDefaultRepository() {
    return {
        get: vitest_1.vi.fn().mockResolvedValue(null),
        getAll: vitest_1.vi.fn().mockResolvedValue([]),
        upsertBoth: vitest_1.vi.fn().mockResolvedValue(undefined),
    };
}
function makeProjectRateLimitDefaultRow(overrides = {}) {
    return {
        projectKind: 'team',
        weeklyRateLimit: null,
        yearlyRateLimit: null,
        updatedBy: null,
        createdAt: BASE_DATE,
        updatedAt: BASE_DATE,
        ...overrides,
    };
}
function createMockProjectExecutionUsageRepository() {
    return {
        getCounts: vitest_1.vi.fn().mockResolvedValue({ weeklyCount: 0, yearlyCount: 0 }),
        increment: vitest_1.vi.fn().mockResolvedValue(undefined),
        listCountsByProjectIds: vitest_1.vi.fn().mockResolvedValue(new Map()),
    };
}
function createMockWorkflowExecutionUsageRepository() {
    return {
        increment: vitest_1.vi.fn().mockResolvedValue(undefined),
        listCountsByWorkflowIds: vitest_1.vi.fn().mockResolvedValue(new Map()),
    };
}
exports.VALID_TOPUP_ID = 'c2a9e7b4-3d51-4f8a-9b2c-7e6d5f4a3b21';
function makeProjectTopupRow(overrides = {}) {
    return {
        id: exports.VALID_TOPUP_ID,
        projectId: exports.VALID_PROJECT_ID,
        periodKey: '2026-W44',
        amount: 2000,
        adminComment: 'Extra runs for the quarterly batch',
        createdBy: 'test@example.com',
        createdAt: BASE_DATE,
        ...overrides,
    };
}
function createMockProjectTopupRepository() {
    return {
        list: vitest_1.vi.fn().mockResolvedValue({ rows: [], totalItems: 0 }),
        getById: vitest_1.vi.fn().mockResolvedValue(null),
        create: vitest_1.vi.fn().mockImplementation(async (params) => makeProjectTopupRow(params)),
        deleteById: vitest_1.vi.fn().mockResolvedValue(true),
        sumByProjectIds: vitest_1.vi.fn().mockResolvedValue(new Map()),
        sumByProjectIdsInWeeklyKeys: vitest_1.vi.fn().mockResolvedValue(new Map()),
    };
}
function createMockRateLimitNotificationRepository() {
    return {
        /** Default: every claim wins (no prior notification). */
        claim: vitest_1.vi.fn().mockResolvedValue(true),
        pruneOlderThan: vitest_1.vi.fn().mockResolvedValue(0),
    };
}
/* ------------------------------------------------------------------ */
/*  n8n repository mocks                                               */
/* ------------------------------------------------------------------ */
function createMockN8nRepositories() {
    const defaultProject = {
        id: exports.VALID_PROJECT_ID,
        name: 'Default project',
        type: 'personal',
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
        icon: null,
        description: null,
        creatorId: 'user-123',
    };
    const metadata = {
        SharedWorkflow: {
            tableName: 'shared_workflow',
            columns: [
                { propertyName: 'workflowId', databaseName: 'workflow_id' },
                { propertyName: 'projectId', databaseName: 'project_id' },
            ],
        },
        Workflow: {
            tableName: 'workflow_entity',
            columns: [
                { propertyName: 'id', databaseName: 'id' },
                { propertyName: 'name', databaseName: 'name' },
            ],
        },
        ProjectRelation: {
            tableName: 'project_relation',
            columns: [
                { propertyName: 'projectId', databaseName: 'project_id' },
                { propertyName: 'userId', databaseName: 'user_id' },
            ],
        },
        User: {
            tableName: 'user',
            columns: [
                { propertyName: 'id', databaseName: 'id' },
                { propertyName: 'email', databaseName: 'email' },
                { propertyName: 'firstName', databaseName: 'firstName' },
                { propertyName: 'lastName', databaseName: 'lastName' },
                { propertyName: 'disabled', databaseName: 'disabled' },
                { propertyName: 'roleSlug', databaseName: 'roleSlug' },
            ],
        },
    };
    const makeManager = () => ({
        query: vitest_1.vi.fn().mockResolvedValue([]),
        transaction: vitest_1.vi.fn(async (callback) => {
            const em = {
                create: vitest_1.vi.fn((_entityName, payload) => payload),
                save: vitest_1.vi.fn(async (value) => value),
            };
            return await callback(em);
        }),
        connection: {
            getMetadata: vitest_1.vi.fn((entityName) => metadata[entityName]),
        },
    });
    return {
        user: {
            findOne: vitest_1.vi.fn(),
            findOneBy: vitest_1.vi.fn(),
            metadata: metadata.User,
            manager: makeManager(),
        },
        project: {
            findOneBy: vitest_1.vi.fn().mockImplementation(async ({ id }) => (id === exports.VALID_PROJECT_ID ? defaultProject : null)),
            getPersonalProjectForUser: vitest_1.vi.fn().mockResolvedValue(defaultProject),
            getPersonalProjectForUserOrFail: vitest_1.vi.fn().mockResolvedValue(defaultProject),
        },
        projectRelation: (() => {
            const findProjectRoleMock = vitest_1.vi.fn().mockResolvedValue(null);
            return {
                findProjectRole: findProjectRoleMock,
                find: vitest_1.vi.fn().mockImplementation(async () => {
                    const role = await findProjectRoleMock();
                    return role ? [{ role }] : [];
                }),
                findAllByUser: vitest_1.vi.fn().mockResolvedValue([{ projectId: exports.VALID_PROJECT_ID }]),
                countMembersByProjectIds: vitest_1.vi.fn().mockResolvedValue(new Map()),
                listUserEmailsByProjectIds: vitest_1.vi.fn().mockResolvedValue([]),
                listMemberEmailsByProjectIdsAndRoles: vitest_1.vi.fn().mockResolvedValue(new Map()),
                metadata: metadata.ProjectRelation,
                manager: makeManager(),
            };
        })(),
        workflow: { findOneBy: vitest_1.vi.fn(), metadata: metadata.Workflow },
        credential: { findOneBy: vitest_1.vi.fn() },
        sharedWorkflow: {
            findProjectIds: vitest_1.vi.fn().mockResolvedValue([exports.VALID_PROJECT_ID]),
            countByProjectIds: vitest_1.vi.fn().mockResolvedValue(new Map()),
            findWorkflowRowsByProjectIds: vitest_1.vi.fn().mockResolvedValue([]),
            findRowsByWorkflowId: vitest_1.vi
                .fn()
                .mockResolvedValue([
                { workflowId: exports.VALID_WORKFLOW_ID, workflowName: 'Test workflow', projectId: exports.VALID_PROJECT_ID },
            ]),
            create: vitest_1.vi.fn((_value) => _value),
            save: vitest_1.vi.fn(async (value) => value),
            delete: vitest_1.vi.fn(async () => undefined),
            metadata: metadata.SharedWorkflow,
            manager: makeManager(),
        },
        sharedCredential: {
            create: vitest_1.vi.fn((_value) => _value),
            save: vitest_1.vi.fn(async (value) => value),
            manager: makeManager(),
        },
        withTransaction: vitest_1.vi.fn(async (_manager, _context, handler) => {
            const em = {
                create: vitest_1.vi.fn((_entityName, payload) => payload),
                save: vitest_1.vi.fn(async (value) => value),
                delete: vitest_1.vi.fn(async () => undefined),
                query: vitest_1.vi.fn().mockResolvedValue([]),
            };
            return await handler(em);
        }),
        execution: (() => {
            const findSingleExecution = vitest_1.vi.fn().mockResolvedValue({ workflowId: exports.VALID_WORKFLOW_ID });
            return {
                findSingleExecution,
                loadMetadataOrNull: vitest_1.vi.fn().mockImplementation(async (id) => {
                    try {
                        const execution = await findSingleExecution(id, {
                            includeData: false,
                            unflattenData: false,
                        });
                        return execution ?? null;
                    }
                    catch {
                        return null;
                    }
                }),
            };
        })(),
    };
}
function createMockUserRepository() {
    return {
        getUserForApiKey: vitest_1.vi.fn().mockResolvedValue(makeCaller()),
    };
}
/* ------------------------------------------------------------------ */
/*  Repository object mocks                                            */
/* ------------------------------------------------------------------ */
const user_1 = require("../../src/db/repository/n8n/user");
const project_1 = require("../../src/db/repository/n8n/project");
const project_relation_1 = require("../../src/db/repository/n8n/project-relation");
const shared_workflow_1 = require("../../src/db/repository/n8n/shared-workflow");
const workflow_1 = require("../../src/db/repository/n8n/workflow");
const credential_1 = require("../../src/db/repository/n8n/credential");
const shared_credential_1 = require("../../src/db/repository/n8n/shared-credential");
const execution_1 = require("../../src/db/repository/n8n/execution");
function createMockN8nRepositoryObject(n8nRepos) {
    return {
        user: new user_1.UserRepository(n8nRepos.user),
        project: new project_1.ProjectRepository(n8nRepos.project),
        projectRelation: new project_relation_1.ProjectRelationRepository(n8nRepos.projectRelation, n8nRepos.user.metadata),
        workflow: new workflow_1.WorkflowRepository(n8nRepos.workflow),
        sharedWorkflow: new shared_workflow_1.SharedWorkflowRepository(n8nRepos.sharedWorkflow, n8nRepos.workflow.metadata),
        credential: new credential_1.CredentialRepository(n8nRepos.credential),
        sharedCredential: new shared_credential_1.SharedCredentialRepository(n8nRepos.sharedCredential),
        execution: new execution_1.ExecutionRepository(n8nRepos.execution),
        withTransaction: n8nRepos.withTransaction,
        raw: n8nRepos,
    };
}
/* ------------------------------------------------------------------ */
/*  Service mocks (using real service classes with mocked repos)       */
/* ------------------------------------------------------------------ */
const action_service_1 = require("../../src/api/services/action.service");
const message_service_1 = require("../../src/api/services/message.service");
function createMockActionService(actionRequestRepo, n8nRepos) {
    return new action_service_1.ActionService({ execution: n8nRepos.execution, sharedWorkflow: n8nRepos.sharedWorkflow }, { actionRequest: actionRequestRepo });
}
function createMockMessageService(messageRepo, n8nRepos) {
    return new message_service_1.MessageService({ execution: n8nRepos.execution, sharedWorkflow: n8nRepos.sharedWorkflow }, { message: messageRepo });
}
/* ------------------------------------------------------------------ */
/*  Execution / shared-workflow repo factories                         */
/* ------------------------------------------------------------------ */
function createMockExecutionRepo(overrides = {}) {
    const repo = {
        findSingleExecution: vitest_1.vi.fn().mockResolvedValue({ workflowId: exports.VALID_WORKFLOW_ID }),
        loadMetadataOrNull: vitest_1.vi.fn().mockImplementation(async (id) => {
            try {
                const fn = repo.findSingleExecution;
                const execution = await fn(id, { includeData: false, unflattenData: false });
                return execution ?? null;
            }
            catch {
                return null;
            }
        }),
        metadata: { tableName: 'execution_entity', columns: [{ propertyName: 'id', databaseName: 'id' }] },
        manager: { query: vitest_1.vi.fn().mockResolvedValue([]) },
        ...overrides,
    };
    return repo;
}
function createMockSharedWorkflowRepo(overrides = {}) {
    return {
        findProjectIds: vitest_1.vi.fn().mockResolvedValue([exports.VALID_PROJECT_ID]),
        metadata: { tableName: 'shared_workflow', columns: [{ propertyName: 'id', databaseName: 'id' }] },
        manager: { query: vitest_1.vi.fn().mockResolvedValue([]) },
        ...overrides,
    };
}
function createMockRouteContext(overrides = {}) {
    return {
        apiKeyAuthMiddleware: (_req, _res, next) => next(),
        adminAuthMiddleware: (_req, _res, next) => next(),
        workflowInteractionTenantMiddleware: (_req, _res, next) => next(),
        n8nRepositories: {},
        customRepositories: {},
        services: {},
        ...overrides,
    };
}
