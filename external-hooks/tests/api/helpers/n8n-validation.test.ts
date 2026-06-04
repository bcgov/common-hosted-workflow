import { describe, expect, it, vi } from 'vitest';
import {
  requireChwfAllowedProjectIds,
  resolveProjectIdForCreate,
  requireExecutionInTenantScope,
  validateN8nExecutionMatchesWorkflow,
  validateN8nExecutionInTenantScope,
  verifyCallerHasN8nProjectAccess,
  resolveWorkflowProjectScope,
} from '../../../src/api/helpers/n8n-validation';
import { AppError } from '../../../src/api/utils/errors';
import { listProjectIdsAccessibleToUser } from '../../../src/api/services/project-access';
import {
  createMockResponse,
  createMockExecutionRepo,
  createMockSharedWorkflowRepo,
  VALID_PROJECT_ID,
  VALID_WORKFLOW_ID,
  VALID_EXECUTION_ID,
} from '../../helpers/mocks';
import { expectRejectsAppError } from '../../helpers/test-utils';

/* ------------------------------------------------------------------ */
/*  requireChwfAllowedProjectIds                                       */
/* ------------------------------------------------------------------ */

describe('requireChwfAllowedProjectIds', () => {
  it('returns the project IDs when present', () => {
    const res = createMockResponse({ chwfAllowedProjectIds: ['proj-1', 'proj-2'] });
    const result = requireChwfAllowedProjectIds(res as any, 'GET /test', 'messages');
    expect(result).toEqual(['proj-1', 'proj-2']);
  });

  it('throws AppError 403 when missing', () => {
    const res = createMockResponse({});
    expect(() => requireChwfAllowedProjectIds(res as any, 'GET /test', 'messages')).toThrow(AppError);
    try {
      requireChwfAllowedProjectIds(res as any, 'GET /test', 'messages');
    } catch (err) {
      expect((err as AppError).statusCode).toBe(403);
    }
  });

  it('throws AppError 403 when empty array', () => {
    const res = createMockResponse({ chwfAllowedProjectIds: [] });
    expect(() => requireChwfAllowedProjectIds(res as any, 'GET /test', 'actions')).toThrow(AppError);
  });
});

/* ------------------------------------------------------------------ */
/*  validateN8nExecutionMatchesWorkflow                                */
/* ------------------------------------------------------------------ */

describe('validateN8nExecutionMatchesWorkflow', () => {
  it('returns ok when execution matches workflowId', async () => {
    const result = await validateN8nExecutionMatchesWorkflow({
      executionRepository: createMockExecutionRepo(),
      workflowInstanceId: VALID_EXECUTION_ID,
      workflowId: VALID_WORKFLOW_ID,
    });
    expect(result).toEqual({ ok: true });
  });

  it('returns fail when execution not found', async () => {
    const result = await validateN8nExecutionMatchesWorkflow({
      executionRepository: createMockExecutionRepo({ findSingleExecution: vi.fn().mockResolvedValue(null) }),
      workflowInstanceId: 'missing',
      workflowId: VALID_WORKFLOW_ID,
    });
    expect(result).toEqual({ ok: false, status: 400, error: 'Invalid workflowInstanceId' });
  });

  it('returns fail when workflowId does not match', async () => {
    const result = await validateN8nExecutionMatchesWorkflow({
      executionRepository: createMockExecutionRepo({
        findSingleExecution: vi.fn().mockResolvedValue({ workflowId: 'other-wf' }),
      }),
      workflowInstanceId: VALID_EXECUTION_ID,
      workflowId: VALID_WORKFLOW_ID,
    });
    expect(result).toEqual({ ok: false, status: 400, error: 'workflowInstanceId does not match workflowId' });
  });

  it('returns fail when findSingleExecution throws', async () => {
    const result = await validateN8nExecutionMatchesWorkflow({
      executionRepository: createMockExecutionRepo({
        findSingleExecution: vi.fn().mockRejectedValue(new Error('DB error')),
      }),
      workflowInstanceId: 'bad-id',
      workflowId: VALID_WORKFLOW_ID,
    });
    expect(result).toEqual({ ok: false, status: 400, error: 'Invalid workflowInstanceId' });
  });
});

/* ------------------------------------------------------------------ */
/*  validateN8nExecutionInTenantScope                                  */
/* ------------------------------------------------------------------ */

describe('validateN8nExecutionInTenantScope', () => {
  it('returns ok when execution is in scope', async () => {
    const result = await validateN8nExecutionInTenantScope({
      executionRepository: createMockExecutionRepo(),
      workflowInstanceId: VALID_EXECUTION_ID,
      allowedProjectIds: [VALID_PROJECT_ID],
      sharedWorkflowRepository: createMockSharedWorkflowRepo(),
    });
    expect(result).toEqual({ ok: true });
  });

  it('returns fail when execution not found', async () => {
    const result = await validateN8nExecutionInTenantScope({
      executionRepository: createMockExecutionRepo({ findSingleExecution: vi.fn().mockResolvedValue(null) }),
      workflowInstanceId: 'missing',
      allowedProjectIds: [VALID_PROJECT_ID],
      sharedWorkflowRepository: createMockSharedWorkflowRepo(),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(400);
  });

  it('returns fail when scope intersection is empty', async () => {
    const result = await validateN8nExecutionInTenantScope({
      executionRepository: createMockExecutionRepo(),
      workflowInstanceId: VALID_EXECUTION_ID,
      allowedProjectIds: [VALID_PROJECT_ID],
      sharedWorkflowRepository: createMockSharedWorkflowRepo({
        findProjectIds: vi.fn().mockResolvedValue(['other-project']),
      }),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(403);
  });
});

/* ------------------------------------------------------------------ */
/*  requireExecutionInTenantScope                                      */
/* ------------------------------------------------------------------ */

describe('requireExecutionInTenantScope', () => {
  it('no-ops when workflowInstanceId is undefined', async () => {
    await expect(
      requireExecutionInTenantScope({
        executionRepository: createMockExecutionRepo(),
        workflowInstanceId: undefined,
        allowedProjectIds: [VALID_PROJECT_ID],
        sharedWorkflowRepository: createMockSharedWorkflowRepo(),
      }),
    ).resolves.toBeUndefined();
  });

  it('throws AppError 400 on invalid execution', async () => {
    await expectRejectsAppError(
      requireExecutionInTenantScope({
        executionRepository: createMockExecutionRepo({ findSingleExecution: vi.fn().mockResolvedValue(null) }),
        workflowInstanceId: 'bad-id',
        allowedProjectIds: [VALID_PROJECT_ID],
        sharedWorkflowRepository: createMockSharedWorkflowRepo(),
      }),
      400,
    );
  });

  it('throws AppError 403 on scope mismatch', async () => {
    await expectRejectsAppError(
      requireExecutionInTenantScope({
        executionRepository: createMockExecutionRepo(),
        workflowInstanceId: VALID_EXECUTION_ID,
        allowedProjectIds: [VALID_PROJECT_ID],
        sharedWorkflowRepository: createMockSharedWorkflowRepo({
          findProjectIds: vi.fn().mockResolvedValue(['unrelated-project']),
        }),
      }),
      403,
    );
  });
});

/* ------------------------------------------------------------------ */
/*  resolveProjectIdForCreate                                          */
/* ------------------------------------------------------------------ */

describe('resolveProjectIdForCreate', () => {
  it('returns the first scoped project ID on success', async () => {
    const result = await resolveProjectIdForCreate({
      executionRepository: createMockExecutionRepo(),
      sharedWorkflowRepository: createMockSharedWorkflowRepo(),
      workflowInstanceId: VALID_EXECUTION_ID,
      workflowId: VALID_WORKFLOW_ID,
      allowedProjectIds: [VALID_PROJECT_ID],
      logLabel: 'Test',
    });
    expect(result).toBe(VALID_PROJECT_ID);
  });

  it('throws AppError 400 on invalid execution', async () => {
    await expectRejectsAppError(
      resolveProjectIdForCreate({
        executionRepository: createMockExecutionRepo({ findSingleExecution: vi.fn().mockResolvedValue(null) }),
        sharedWorkflowRepository: createMockSharedWorkflowRepo(),
        workflowInstanceId: 'bad',
        workflowId: VALID_WORKFLOW_ID,
        allowedProjectIds: [VALID_PROJECT_ID],
        logLabel: 'Test',
      }),
      400,
    );
  });

  it('throws AppError 400 on workflowId mismatch', async () => {
    await expectRejectsAppError(
      resolveProjectIdForCreate({
        executionRepository: createMockExecutionRepo({
          findSingleExecution: vi.fn().mockResolvedValue({ workflowId: 'wrong-wf' }),
        }),
        sharedWorkflowRepository: createMockSharedWorkflowRepo(),
        workflowInstanceId: VALID_EXECUTION_ID,
        workflowId: VALID_WORKFLOW_ID,
        allowedProjectIds: [VALID_PROJECT_ID],
        logLabel: 'Test',
      }),
      400,
    );
  });

  it('throws AppError 403 when scope intersection is empty', async () => {
    await expectRejectsAppError(
      resolveProjectIdForCreate({
        executionRepository: createMockExecutionRepo(),
        sharedWorkflowRepository: createMockSharedWorkflowRepo({
          findProjectIds: vi.fn().mockResolvedValue(['other-project']),
        }),
        workflowInstanceId: VALID_EXECUTION_ID,
        workflowId: VALID_WORKFLOW_ID,
        allowedProjectIds: [VALID_PROJECT_ID],
        logLabel: 'Test',
      }),
      403,
    );
  });

  it('throws AppError 500 on unexpected error', async () => {
    const executionRepo = createMockExecutionRepo({
      findSingleExecution: vi.fn().mockRejectedValue(new TypeError('unexpected')),
    });
    try {
      await resolveProjectIdForCreate({
        executionRepository: executionRepo,
        sharedWorkflowRepository: createMockSharedWorkflowRepo(),
        workflowInstanceId: VALID_EXECUTION_ID,
        workflowId: VALID_WORKFLOW_ID,
        allowedProjectIds: [VALID_PROJECT_ID],
        logLabel: 'Test',
      });
      expect.unreachable('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
    }
  });
});

/* ------------------------------------------------------------------ */
/*  resolveWorkflowProjectScope                                        */
/* ------------------------------------------------------------------ */

describe('resolveWorkflowProjectScope', () => {
  it('returns intersection of workflow projects and allowed projects', async () => {
    const sharedWorkflowRepo = createMockSharedWorkflowRepo({
      findProjectIds: vi.fn().mockResolvedValue(['proj-1', 'proj-2', 'proj-3']),
    });
    const result = await resolveWorkflowProjectScope(VALID_WORKFLOW_ID, ['proj-2', 'proj-4'], sharedWorkflowRepo);
    expect(result).toEqual(['proj-2']);
  });

  it('returns empty array when no intersection', async () => {
    const sharedWorkflowRepo = createMockSharedWorkflowRepo({ findProjectIds: vi.fn().mockResolvedValue(['proj-1']) });
    const result = await resolveWorkflowProjectScope(VALID_WORKFLOW_ID, ['proj-99'], sharedWorkflowRepo);
    expect(result).toEqual([]);
  });
});

/* ------------------------------------------------------------------ */
/*  listProjectIdsAccessibleToUser                                     */
/* ------------------------------------------------------------------ */

describe('listProjectIdsAccessibleToUser', () => {
  it('merges personal project and relation projects', async () => {
    const projectRepo = { getPersonalProjectForUser: vi.fn().mockResolvedValue({ id: 'personal-proj' }) };
    const projectRelationRepo = {
      findAllByUser: vi.fn().mockResolvedValue([{ projectId: 'team-proj-1' }, { projectId: 'team-proj-2' }]),
    };
    const result = await listProjectIdsAccessibleToUser(projectRelationRepo as any, projectRepo as any, 'user-1');
    expect(result).toContain('personal-proj');
    expect(result).toContain('team-proj-1');
    expect(result).toContain('team-proj-2');
  });

  it('deduplicates when personal project is also in relations', async () => {
    const projectRepo = { getPersonalProjectForUser: vi.fn().mockResolvedValue({ id: 'proj-1' }) };
    const projectRelationRepo = { findAllByUser: vi.fn().mockResolvedValue([{ projectId: 'proj-1' }]) };
    const result = await listProjectIdsAccessibleToUser(projectRelationRepo as any, projectRepo as any, 'user-1');
    expect(result).toEqual(['proj-1']);
  });

  it('handles null personal project', async () => {
    const projectRepo = { getPersonalProjectForUser: vi.fn().mockResolvedValue(null) };
    const projectRelationRepo = { findAllByUser: vi.fn().mockResolvedValue([{ projectId: 'proj-1' }]) };
    const result = await listProjectIdsAccessibleToUser(projectRelationRepo as any, projectRepo as any, 'user-1');
    expect(result).toEqual(['proj-1']);
  });
});

/* ------------------------------------------------------------------ */
/*  verifyCallerHasN8nProjectAccess                                    */
/* ------------------------------------------------------------------ */

describe('verifyCallerHasN8nProjectAccess', () => {
  it('returns true when user has project relation role', async () => {
    const projectRepo = { getPersonalProjectForUser: vi.fn() };
    const projectRelationRepo = { findProjectRole: vi.fn().mockResolvedValue({ role: 'editor' }) };
    const result = await verifyCallerHasN8nProjectAccess(projectRepo, projectRelationRepo, 'user-1', 'proj-1');
    expect(result).toBe(true);
  });

  it('returns true when project is the personal project', async () => {
    const projectRepo = { getPersonalProjectForUser: vi.fn().mockResolvedValue({ id: 'proj-1' }) };
    const projectRelationRepo = { findProjectRole: vi.fn().mockResolvedValue(null) };
    const result = await verifyCallerHasN8nProjectAccess(projectRepo, projectRelationRepo, 'user-1', 'proj-1');
    expect(result).toBe(true);
  });

  it('returns false when no relation and not personal project', async () => {
    const projectRepo = { getPersonalProjectForUser: vi.fn().mockResolvedValue({ id: 'other-proj' }) };
    const projectRelationRepo = { findProjectRole: vi.fn().mockResolvedValue(null) };
    const result = await verifyCallerHasN8nProjectAccess(projectRepo, projectRelationRepo, 'user-1', 'proj-1');
    expect(result).toBe(false);
  });
});
