'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
const vitest_1 = require('vitest');
const project_access_1 = require('../../../src/api/services/project-access');
const errors_1 = require('../../../src/api/utils/errors');
const mocks_1 = require('../../helpers/mocks');
const test_utils_1 = require('../../helpers/test-utils');
/* ------------------------------------------------------------------ */
/*  requireChwfAllowedProjectIds                                       */
/* ------------------------------------------------------------------ */
(0, vitest_1.describe)('requireChwfAllowedProjectIds', () => {
  (0, vitest_1.it)('returns the project IDs when present', () => {
    const res = (0, mocks_1.createMockResponse)({ chwfAllowedProjectIds: ['proj-1', 'proj-2'] });
    const result = (0, project_access_1.requireChwfAllowedProjectIds)(res, 'GET /test', 'messages');
    (0, vitest_1.expect)(result).toEqual(['proj-1', 'proj-2']);
  });
  (0, vitest_1.it)('throws AppError 403 when missing', () => {
    const res = (0, mocks_1.createMockResponse)({});
    (0, vitest_1.expect)(() =>
      (0, project_access_1.requireChwfAllowedProjectIds)(res, 'GET /test', 'messages'),
    ).toThrow(errors_1.AppError);
    try {
      (0, project_access_1.requireChwfAllowedProjectIds)(res, 'GET /test', 'messages');
    } catch (err) {
      (0, vitest_1.expect)(err.statusCode).toBe(403);
    }
  });
  (0, vitest_1.it)('throws AppError 403 when empty array', () => {
    const res = (0, mocks_1.createMockResponse)({ chwfAllowedProjectIds: [] });
    (0, vitest_1.expect)(() => (0, project_access_1.requireChwfAllowedProjectIds)(res, 'GET /test', 'actions')).toThrow(
      errors_1.AppError,
    );
  });
});
/* ------------------------------------------------------------------ */
/*  validateN8nExecutionMatchesWorkflow                                */
/* ------------------------------------------------------------------ */
(0, vitest_1.describe)('validateN8nExecutionMatchesWorkflow', () => {
  (0, vitest_1.it)('returns ok when execution matches workflowId', async () => {
    const result = await (0, project_access_1.validateN8nExecutionMatchesWorkflow)({
      executionRepository: (0, mocks_1.createMockExecutionRepo)(),
      workflowInstanceId: mocks_1.VALID_EXECUTION_ID,
      workflowId: mocks_1.VALID_WORKFLOW_ID,
    });
    (0, vitest_1.expect)(result).toEqual({ ok: true });
  });
  (0, vitest_1.it)('returns fail when execution not found', async () => {
    const result = await (0, project_access_1.validateN8nExecutionMatchesWorkflow)({
      executionRepository: (0, mocks_1.createMockExecutionRepo)({
        findSingleExecution: vitest_1.vi.fn().mockResolvedValue(null),
      }),
      workflowInstanceId: 'missing',
      workflowId: mocks_1.VALID_WORKFLOW_ID,
    });
    (0, vitest_1.expect)(result).toEqual({ ok: false, status: 400, error: 'Invalid workflowInstanceId' });
  });
  (0, vitest_1.it)('returns fail when workflowId does not match', async () => {
    const result = await (0, project_access_1.validateN8nExecutionMatchesWorkflow)({
      executionRepository: (0, mocks_1.createMockExecutionRepo)({
        findSingleExecution: vitest_1.vi.fn().mockResolvedValue({ workflowId: 'other-wf' }),
      }),
      workflowInstanceId: mocks_1.VALID_EXECUTION_ID,
      workflowId: mocks_1.VALID_WORKFLOW_ID,
    });
    (0, vitest_1.expect)(result).toEqual({
      ok: false,
      status: 400,
      error: 'workflowInstanceId does not match workflowId',
    });
  });
  (0, vitest_1.it)('returns fail when findSingleExecution throws', async () => {
    const result = await (0, project_access_1.validateN8nExecutionMatchesWorkflow)({
      executionRepository: (0, mocks_1.createMockExecutionRepo)({
        findSingleExecution: vitest_1.vi.fn().mockRejectedValue(new Error('DB error')),
      }),
      workflowInstanceId: 'bad-id',
      workflowId: mocks_1.VALID_WORKFLOW_ID,
    });
    (0, vitest_1.expect)(result).toEqual({ ok: false, status: 400, error: 'Invalid workflowInstanceId' });
  });
});
/* ------------------------------------------------------------------ */
/*  validateN8nExecutionInTenantScope                                  */
/* ------------------------------------------------------------------ */
(0, vitest_1.describe)('validateN8nExecutionInTenantScope', () => {
  (0, vitest_1.it)('returns ok when execution is in scope', async () => {
    const result = await (0, project_access_1.validateN8nExecutionInTenantScope)({
      executionRepository: (0, mocks_1.createMockExecutionRepo)(),
      workflowInstanceId: mocks_1.VALID_EXECUTION_ID,
      allowedProjectIds: [mocks_1.VALID_PROJECT_ID],
      sharedWorkflowRepository: (0, mocks_1.createMockSharedWorkflowRepo)(),
    });
    (0, vitest_1.expect)(result).toEqual({ ok: true });
  });
  (0, vitest_1.it)('returns fail when execution not found', async () => {
    const result = await (0, project_access_1.validateN8nExecutionInTenantScope)({
      executionRepository: (0, mocks_1.createMockExecutionRepo)({
        findSingleExecution: vitest_1.vi.fn().mockResolvedValue(null),
      }),
      workflowInstanceId: 'missing',
      allowedProjectIds: [mocks_1.VALID_PROJECT_ID],
      sharedWorkflowRepository: (0, mocks_1.createMockSharedWorkflowRepo)(),
    });
    (0, vitest_1.expect)(result.ok).toBe(false);
    if (!result.ok) (0, vitest_1.expect)(result.status).toBe(400);
  });
  (0, vitest_1.it)('returns fail when scope intersection is empty', async () => {
    const result = await (0, project_access_1.validateN8nExecutionInTenantScope)({
      executionRepository: (0, mocks_1.createMockExecutionRepo)(),
      workflowInstanceId: mocks_1.VALID_EXECUTION_ID,
      allowedProjectIds: [mocks_1.VALID_PROJECT_ID],
      sharedWorkflowRepository: (0, mocks_1.createMockSharedWorkflowRepo)({
        findProjectIds: vitest_1.vi.fn().mockResolvedValue(['other-project']),
      }),
    });
    (0, vitest_1.expect)(result.ok).toBe(false);
    if (!result.ok) (0, vitest_1.expect)(result.status).toBe(403);
  });
});
/* ------------------------------------------------------------------ */
/*  requireExecutionInTenantScope                                      */
/* ------------------------------------------------------------------ */
(0, vitest_1.describe)('requireExecutionInTenantScope', () => {
  (0, vitest_1.it)('no-ops when workflowInstanceId is undefined', async () => {
    await (0, vitest_1.expect)(
      (0, project_access_1.requireExecutionInTenantScope)({
        executionRepository: (0, mocks_1.createMockExecutionRepo)(),
        workflowInstanceId: undefined,
        allowedProjectIds: [mocks_1.VALID_PROJECT_ID],
        sharedWorkflowRepository: (0, mocks_1.createMockSharedWorkflowRepo)(),
      }),
    ).resolves.toBeUndefined();
  });
  (0, vitest_1.it)('throws AppError 400 on invalid execution', async () => {
    await (0, test_utils_1.expectRejectsAppError)(
      (0, project_access_1.requireExecutionInTenantScope)({
        executionRepository: (0, mocks_1.createMockExecutionRepo)({
          findSingleExecution: vitest_1.vi.fn().mockResolvedValue(null),
        }),
        workflowInstanceId: 'bad-id',
        allowedProjectIds: [mocks_1.VALID_PROJECT_ID],
        sharedWorkflowRepository: (0, mocks_1.createMockSharedWorkflowRepo)(),
      }),
      400,
    );
  });
  (0, vitest_1.it)('throws AppError 403 on scope mismatch', async () => {
    await (0, test_utils_1.expectRejectsAppError)(
      (0, project_access_1.requireExecutionInTenantScope)({
        executionRepository: (0, mocks_1.createMockExecutionRepo)(),
        workflowInstanceId: mocks_1.VALID_EXECUTION_ID,
        allowedProjectIds: [mocks_1.VALID_PROJECT_ID],
        sharedWorkflowRepository: (0, mocks_1.createMockSharedWorkflowRepo)({
          findProjectIds: vitest_1.vi.fn().mockResolvedValue(['unrelated-project']),
        }),
      }),
      403,
    );
  });
});
/* ------------------------------------------------------------------ */
/*  resolveProjectIdForCreate                                          */
/* ------------------------------------------------------------------ */
(0, vitest_1.describe)('resolveProjectIdForCreate', () => {
  (0, vitest_1.it)('returns the first scoped project ID on success', async () => {
    const result = await (0, project_access_1.resolveProjectIdForCreate)({
      executionRepository: (0, mocks_1.createMockExecutionRepo)(),
      sharedWorkflowRepository: (0, mocks_1.createMockSharedWorkflowRepo)(),
      workflowInstanceId: mocks_1.VALID_EXECUTION_ID,
      workflowId: mocks_1.VALID_WORKFLOW_ID,
      allowedProjectIds: [mocks_1.VALID_PROJECT_ID],
      logLabel: 'Test',
    });
    (0, vitest_1.expect)(result).toBe(mocks_1.VALID_PROJECT_ID);
  });
  (0, vitest_1.it)('throws AppError 400 on invalid execution', async () => {
    await (0, test_utils_1.expectRejectsAppError)(
      (0, project_access_1.resolveProjectIdForCreate)({
        executionRepository: (0, mocks_1.createMockExecutionRepo)({
          findSingleExecution: vitest_1.vi.fn().mockResolvedValue(null),
        }),
        sharedWorkflowRepository: (0, mocks_1.createMockSharedWorkflowRepo)(),
        workflowInstanceId: 'bad',
        workflowId: mocks_1.VALID_WORKFLOW_ID,
        allowedProjectIds: [mocks_1.VALID_PROJECT_ID],
        logLabel: 'Test',
      }),
      400,
    );
  });
  (0, vitest_1.it)('throws AppError 400 on workflowId mismatch', async () => {
    await (0, test_utils_1.expectRejectsAppError)(
      (0, project_access_1.resolveProjectIdForCreate)({
        executionRepository: (0, mocks_1.createMockExecutionRepo)({
          findSingleExecution: vitest_1.vi.fn().mockResolvedValue({ workflowId: 'wrong-wf' }),
        }),
        sharedWorkflowRepository: (0, mocks_1.createMockSharedWorkflowRepo)(),
        workflowInstanceId: mocks_1.VALID_EXECUTION_ID,
        workflowId: mocks_1.VALID_WORKFLOW_ID,
        allowedProjectIds: [mocks_1.VALID_PROJECT_ID],
        logLabel: 'Test',
      }),
      400,
    );
  });
  (0, vitest_1.it)('throws AppError 403 when scope intersection is empty', async () => {
    await (0, test_utils_1.expectRejectsAppError)(
      (0, project_access_1.resolveProjectIdForCreate)({
        executionRepository: (0, mocks_1.createMockExecutionRepo)(),
        sharedWorkflowRepository: (0, mocks_1.createMockSharedWorkflowRepo)({
          findProjectIds: vitest_1.vi.fn().mockResolvedValue(['other-project']),
        }),
        workflowInstanceId: mocks_1.VALID_EXECUTION_ID,
        workflowId: mocks_1.VALID_WORKFLOW_ID,
        allowedProjectIds: [mocks_1.VALID_PROJECT_ID],
        logLabel: 'Test',
      }),
      403,
    );
  });
  (0, vitest_1.it)('throws AppError 500 on unexpected error', async () => {
    const executionRepo = (0, mocks_1.createMockExecutionRepo)({
      findSingleExecution: vitest_1.vi.fn().mockRejectedValue(new TypeError('unexpected')),
    });
    try {
      await (0, project_access_1.resolveProjectIdForCreate)({
        executionRepository: executionRepo,
        sharedWorkflowRepository: (0, mocks_1.createMockSharedWorkflowRepo)(),
        workflowInstanceId: mocks_1.VALID_EXECUTION_ID,
        workflowId: mocks_1.VALID_WORKFLOW_ID,
        allowedProjectIds: [mocks_1.VALID_PROJECT_ID],
        logLabel: 'Test',
      });
      vitest_1.expect.unreachable('should have thrown');
    } catch (err) {
      (0, vitest_1.expect)(err).toBeInstanceOf(errors_1.AppError);
    }
  });
});
/* ------------------------------------------------------------------ */
/*  resolveWorkflowProjectScope                                        */
/* ------------------------------------------------------------------ */
(0, vitest_1.describe)('resolveWorkflowProjectScope', () => {
  (0, vitest_1.it)('returns intersection of workflow projects and allowed projects', async () => {
    const sharedWorkflowRepo = (0, mocks_1.createMockSharedWorkflowRepo)({
      findProjectIds: vitest_1.vi.fn().mockResolvedValue(['proj-1', 'proj-2', 'proj-3']),
    });
    const result = await (0, project_access_1.resolveWorkflowProjectScope)(
      mocks_1.VALID_WORKFLOW_ID,
      ['proj-2', 'proj-4'],
      sharedWorkflowRepo,
    );
    (0, vitest_1.expect)(result).toEqual(['proj-2']);
  });
  (0, vitest_1.it)('returns empty array when no intersection', async () => {
    const sharedWorkflowRepo = (0, mocks_1.createMockSharedWorkflowRepo)({
      findProjectIds: vitest_1.vi.fn().mockResolvedValue(['proj-1']),
    });
    const result = await (0, project_access_1.resolveWorkflowProjectScope)(
      mocks_1.VALID_WORKFLOW_ID,
      ['proj-99'],
      sharedWorkflowRepo,
    );
    (0, vitest_1.expect)(result).toEqual([]);
  });
});
/* ------------------------------------------------------------------ */
/*  listProjectIdsAccessibleToUser                                     */
/* ------------------------------------------------------------------ */
(0, vitest_1.describe)('listProjectIdsAccessibleToUser', () => {
  (0, vitest_1.it)('merges personal project and relation projects', async () => {
    const projectRepo = { getPersonalProjectForUser: vitest_1.vi.fn().mockResolvedValue({ id: 'personal-proj' }) };
    const projectRelationRepo = {
      findAllByUser: vitest_1.vi.fn().mockResolvedValue([{ projectId: 'team-proj-1' }, { projectId: 'team-proj-2' }]),
    };
    const result = await (0, project_access_1.listProjectIdsAccessibleToUser)(
      projectRepo,
      projectRelationRepo,
      'user-1',
    );
    (0, vitest_1.expect)(result).toContain('personal-proj');
    (0, vitest_1.expect)(result).toContain('team-proj-1');
    (0, vitest_1.expect)(result).toContain('team-proj-2');
  });
  (0, vitest_1.it)('deduplicates when personal project is also in relations', async () => {
    const projectRepo = { getPersonalProjectForUser: vitest_1.vi.fn().mockResolvedValue({ id: 'proj-1' }) };
    const projectRelationRepo = { findAllByUser: vitest_1.vi.fn().mockResolvedValue([{ projectId: 'proj-1' }]) };
    const result = await (0, project_access_1.listProjectIdsAccessibleToUser)(
      projectRepo,
      projectRelationRepo,
      'user-1',
    );
    (0, vitest_1.expect)(result).toEqual(['proj-1']);
  });
  (0, vitest_1.it)('handles null personal project', async () => {
    const projectRepo = { getPersonalProjectForUser: vitest_1.vi.fn().mockResolvedValue(null) };
    const projectRelationRepo = { findAllByUser: vitest_1.vi.fn().mockResolvedValue([{ projectId: 'proj-1' }]) };
    const result = await (0, project_access_1.listProjectIdsAccessibleToUser)(
      projectRepo,
      projectRelationRepo,
      'user-1',
    );
    (0, vitest_1.expect)(result).toEqual(['proj-1']);
  });
});
/* ------------------------------------------------------------------ */
/*  verifyCallerHasN8nProjectAccess                                    */
/* ------------------------------------------------------------------ */
(0, vitest_1.describe)('verifyCallerHasN8nProjectAccess', () => {
  (0, vitest_1.it)('returns true when user has project relation role', async () => {
    const projectRepo = { getPersonalProjectForUser: vitest_1.vi.fn() };
    const projectRelationRepo = { findProjectRole: vitest_1.vi.fn().mockResolvedValue({ role: 'editor' }) };
    const result = await (0, project_access_1.verifyCallerHasN8nProjectAccess)(
      projectRepo,
      projectRelationRepo,
      'user-1',
      'proj-1',
    );
    (0, vitest_1.expect)(result).toBe(true);
  });
  (0, vitest_1.it)('returns true when project is the personal project', async () => {
    const projectRepo = { getPersonalProjectForUser: vitest_1.vi.fn().mockResolvedValue({ id: 'proj-1' }) };
    const projectRelationRepo = { findProjectRole: vitest_1.vi.fn().mockResolvedValue(null) };
    const result = await (0, project_access_1.verifyCallerHasN8nProjectAccess)(
      projectRepo,
      projectRelationRepo,
      'user-1',
      'proj-1',
    );
    (0, vitest_1.expect)(result).toBe(true);
  });
  (0, vitest_1.it)('returns false when no relation and not personal project', async () => {
    const projectRepo = { getPersonalProjectForUser: vitest_1.vi.fn().mockResolvedValue({ id: 'other-proj' }) };
    const projectRelationRepo = { findProjectRole: vitest_1.vi.fn().mockResolvedValue(null) };
    const result = await (0, project_access_1.verifyCallerHasN8nProjectAccess)(
      projectRepo,
      projectRelationRepo,
      'user-1',
      'proj-1',
    );
    (0, vitest_1.expect)(result).toBe(false);
  });
});
