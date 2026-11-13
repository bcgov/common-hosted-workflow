'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
const vitest_1 = require('vitest');
const ui_api_1 = require('../../../src/api/services/ui-api');
const mocks_1 = require('../../helpers/mocks');
(0, vitest_1.describe)('UiApiService', () => {
  (0, vitest_1.it)('returns the n8n user for whoami lookups', async () => {
    const n8nRepos = (0, mocks_1.createMockN8nRepositories)();
    n8nRepos.user.findOne.mockResolvedValue({
      id: 'user-123',
      email: 'person@example.com',
      role: { slug: 'global:member', displayName: 'Member' },
    });
    const service = new ui_api_1.UiApiService((0, mocks_1.createMockN8nRepositoryObject)(n8nRepos));
    const result = await service.getWhoami('person@example.com');
    (0, vitest_1.expect)(n8nRepos.user.findOne).toHaveBeenCalledWith({
      where: { email: 'person@example.com' },
      relations: ['role'],
    });
    (0, vitest_1.expect)(result).toEqual({
      id: 'user-123',
      email: 'person@example.com',
      role: { slug: 'global:member', displayName: 'Member' },
    });
  });
  (0, vitest_1.it)('returns all workflows for global owner users', async () => {
    const n8nRepos = (0, mocks_1.createMockN8nRepositories)();
    n8nRepos.user.findOne.mockResolvedValue({
      id: 'user-123',
      email: 'owner@example.com',
      role: { slug: 'global:owner', displayName: 'Owner' },
    });
    n8nRepos.project.getPersonalProjectForUser.mockResolvedValue({
      id: mocks_1.VALID_PROJECT_ID,
      name: 'Default project',
      type: 'personal',
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:00.000Z',
      icon: null,
      description: null,
      creatorId: 'user-123',
    });
    n8nRepos.projectRelation.findAllByUser.mockResolvedValue([{ projectId: mocks_1.VALID_PROJECT_ID }]);
    n8nRepos.sharedWorkflow.manager.query.mockResolvedValue([
      { workflowId: 'wf-1', workflowName: 'First workflow', projectId: mocks_1.VALID_PROJECT_ID },
      { workflowId: 'wf-2', workflowName: 'Second workflow', projectId: 'team-proj' },
    ]);
    n8nRepos.projectRelation.manager.query.mockResolvedValue([
      { projectId: mocks_1.VALID_PROJECT_ID, email: 'owner@example.com' },
      { projectId: 'team-proj', email: 'teammate@example.com' },
    ]);
    const service = new ui_api_1.UiApiService((0, mocks_1.createMockN8nRepositoryObject)(n8nRepos));
    const result = await service.getWorkflows('owner@example.com');
    (0, vitest_1.expect)(n8nRepos.sharedWorkflow.manager.query).toHaveBeenCalledTimes(1);
    (0, vitest_1.expect)(n8nRepos.sharedWorkflow.manager.query.mock.calls[0][1]).toBeUndefined();
    (0, vitest_1.expect)(result.projects).toEqual([
      {
        id: mocks_1.VALID_PROJECT_ID,
        name: 'Default project',
        type: 'personal',
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
        icon: null,
        description: null,
        creatorId: 'user-123',
      },
    ]);
    (0, vitest_1.expect)(result.workflows).toEqual([
      {
        workflowId: 'wf-1',
        workflowName: 'First workflow',
        projectIds: [mocks_1.VALID_PROJECT_ID],
        userEmails: ['owner@example.com'],
        projectShares: [{ projectId: mocks_1.VALID_PROJECT_ID, userEmails: ['owner@example.com'] }],
      },
      {
        workflowId: 'wf-2',
        workflowName: 'Second workflow',
        projectIds: ['team-proj'],
        userEmails: ['teammate@example.com'],
        projectShares: [{ projectId: 'team-proj', userEmails: ['teammate@example.com'] }],
      },
    ]);
  });
  (0, vitest_1.it)('returns all project shares for workflows visible to non-admin users', async () => {
    const n8nRepos = (0, mocks_1.createMockN8nRepositories)();
    n8nRepos.user.findOne.mockResolvedValue({
      id: 'user-123',
      email: 'member@example.com',
      role: { slug: 'global:member', displayName: 'Member' },
    });
    n8nRepos.project.getPersonalProjectForUser.mockResolvedValue({
      id: mocks_1.VALID_PROJECT_ID,
      name: 'Default project',
      type: 'personal',
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:00.000Z',
      icon: null,
      description: null,
      creatorId: 'user-123',
    });
    n8nRepos.projectRelation.findAllByUser.mockResolvedValue([{ projectId: mocks_1.VALID_PROJECT_ID }]);
    const visibleRows = [{ workflowId: 'wf-1', workflowName: 'First workflow', projectId: mocks_1.VALID_PROJECT_ID }];
    const allRows = [
      { workflowId: 'wf-1', workflowName: 'First workflow', projectId: mocks_1.VALID_PROJECT_ID },
      { workflowId: 'wf-1', workflowName: 'First workflow', projectId: 'team-proj' },
    ];
    n8nRepos.sharedWorkflow.manager.query.mockImplementation(async (_sql, params) => {
      if (Array.isArray(params?.[0]) && params[0][0] === mocks_1.VALID_PROJECT_ID) {
        return visibleRows;
      }
      if (Array.isArray(params?.[0]) && params[0][0] === 'wf-1') {
        return allRows;
      }
      return [];
    });
    n8nRepos.projectRelation.manager.query.mockResolvedValue([
      { projectId: mocks_1.VALID_PROJECT_ID, email: 'member@example.com' },
      { projectId: 'team-proj', email: 'owner@example.com' },
      { projectId: 'team-proj', email: 'teammate@example.com' },
    ]);
    const service = new ui_api_1.UiApiService((0, mocks_1.createMockN8nRepositoryObject)(n8nRepos));
    const result = await service.getWorkflows('member@example.com');
    (0, vitest_1.expect)(result.workflows).toEqual([
      {
        workflowId: 'wf-1',
        workflowName: 'First workflow',
        projectIds: [mocks_1.VALID_PROJECT_ID, 'team-proj'],
        userEmails: ['member@example.com', 'owner@example.com', 'teammate@example.com'],
        projectShares: [
          { projectId: mocks_1.VALID_PROJECT_ID, userEmails: ['member@example.com'] },
          { projectId: 'team-proj', userEmails: ['owner@example.com', 'teammate@example.com'] },
        ],
      },
    ]);
  });
  (0, vitest_1.it)(
    'returns no workflows or projects for a disabled admin and never queries administrator-wide',
    async () => {
      const n8nRepos = (0, mocks_1.createMockN8nRepositories)();
      n8nRepos.user.findOne.mockResolvedValue({
        id: 'user-123',
        email: 'owner@example.com',
        disabled: true,
        role: { slug: 'global:admin', displayName: 'Admin' },
      });
      const service = new ui_api_1.UiApiService((0, mocks_1.createMockN8nRepositoryObject)(n8nRepos));
      const result = await service.getWorkflows('owner@example.com');
      (0, vitest_1.expect)(result.n8nUser).toEqual({
        id: 'user-123',
        email: 'owner@example.com',
        disabled: true,
        role: { slug: 'global:admin', displayName: 'Admin' },
      });
      (0, vitest_1.expect)(result.accessibleProjectIds).toEqual([]);
      (0, vitest_1.expect)(result.projects).toEqual([]);
      (0, vitest_1.expect)(result.workflows).toEqual([]);
      (0, vitest_1.expect)(n8nRepos.sharedWorkflow.manager.query).not.toHaveBeenCalled();
      (0, vitest_1.expect)(n8nRepos.project.getPersonalProjectForUser).not.toHaveBeenCalled();
      (0, vitest_1.expect)(n8nRepos.projectRelation.findAllByUser).not.toHaveBeenCalled();
    },
  );
  (0, vitest_1.it)('returns context identity but no data for a disabled member', async () => {
    const n8nRepos = (0, mocks_1.createMockN8nRepositories)();
    n8nRepos.user.findOne.mockResolvedValue({
      id: 'user-123',
      email: 'member@example.com',
      disabled: true,
      role: { slug: 'global:member', displayName: 'Member' },
    });
    const service = new ui_api_1.UiApiService((0, mocks_1.createMockN8nRepositoryObject)(n8nRepos));
    const result = await service.loadUserContext('member@example.com');
    (0, vitest_1.expect)(result.n8nUser?.disabled).toBe(true);
    (0, vitest_1.expect)(result.workflows).toEqual([]);
    (0, vitest_1.expect)(n8nRepos.sharedWorkflow.manager.query).not.toHaveBeenCalled();
  });
  (0, vitest_1.it)('rejects sharing for a disabled admin retaining a stale role', async () => {
    const n8nRepos = (0, mocks_1.createMockN8nRepositories)();
    n8nRepos.user.findOne.mockResolvedValue({
      id: 'user-123',
      email: 'owner@example.com',
      disabled: true,
      role: { slug: 'global:admin', displayName: 'Admin' },
    });
    const service = new ui_api_1.UiApiService((0, mocks_1.createMockN8nRepositoryObject)(n8nRepos));
    await (0, vitest_1.expect)(
      service.shareWorkflow('owner@example.com', 'wf-1', 'new@example.com'),
    ).rejects.toMatchObject({
      statusCode: 403,
    });
    (0, vitest_1.expect)(n8nRepos.sharedWorkflow.save).not.toHaveBeenCalled();
  });
  (0, vitest_1.it)('rejects unsharing for a disabled admin retaining a stale role', async () => {
    const n8nRepos = (0, mocks_1.createMockN8nRepositories)();
    n8nRepos.user.findOne.mockResolvedValue({
      id: 'user-123',
      email: 'owner@example.com',
      disabled: true,
      role: { slug: 'global:admin', displayName: 'Admin' },
    });
    const service = new ui_api_1.UiApiService((0, mocks_1.createMockN8nRepositoryObject)(n8nRepos));
    await (0, vitest_1.expect)(service.unshareWorkflow('owner@example.com', 'wf-1', 'team-proj')).rejects.toMatchObject(
      {
        statusCode: 403,
      },
    );
  });
  (0, vitest_1.it)('returns an empty context for an unprovisioned identity', async () => {
    const n8nRepos = (0, mocks_1.createMockN8nRepositories)();
    n8nRepos.user.findOne.mockResolvedValue(null);
    const service = new ui_api_1.UiApiService((0, mocks_1.createMockN8nRepositoryObject)(n8nRepos));
    const result = await service.loadUserContext('nobody@example.com');
    (0, vitest_1.expect)(result).toEqual({ n8nUser: null, accessibleProjectIds: [], projects: [], workflows: [] });
    (0, vitest_1.expect)(n8nRepos.sharedWorkflow.manager.query).not.toHaveBeenCalled();
  });
  (0, vitest_1.it)('shares a workflow with a new email', async () => {
    const n8nRepos = (0, mocks_1.createMockN8nRepositories)();
    n8nRepos.user.findOne.mockImplementation(async ({ where: { email } }) => {
      if (email === 'owner@example.com') {
        return {
          id: 'user-123',
          email: 'owner@example.com',
          role: { slug: 'global:admin', displayName: 'Admin' },
        };
      }
      if (email === 'new@example.com') {
        return {
          id: 'user-456',
          email: 'new@example.com',
          role: { slug: 'global:member', displayName: 'Member' },
        };
      }
      return null;
    });
    n8nRepos.project.getPersonalProjectForUser.mockImplementation(async (userId) => {
      if (userId === 'user-123') return { id: mocks_1.VALID_PROJECT_ID, name: 'Default project' };
      if (userId === 'user-456') return { id: 'target-proj', name: 'Target project' };
      return null;
    });
    n8nRepos.projectRelation.findAllByUser.mockResolvedValue([
      { projectId: mocks_1.VALID_PROJECT_ID },
      { projectId: 'team-proj' },
    ]);
    const workflowRows = [
      { workflowId: 'wf-1', workflowName: 'First workflow', projectId: mocks_1.VALID_PROJECT_ID },
      { workflowId: 'wf-1', workflowName: 'First workflow', projectId: 'team-proj' },
    ];
    n8nRepos.sharedWorkflow.manager.query.mockImplementation(async (_sql, params) => {
      if (Array.isArray(params?.[0])) return workflowRows;
      if (params?.[0] === 'wf-1') return workflowRows;
      return [];
    });
    n8nRepos.projectRelation.manager.query.mockResolvedValue([
      { projectId: mocks_1.VALID_PROJECT_ID, email: 'owner@example.com' },
      { projectId: 'team-proj', email: 'teammate@example.com' },
    ]);
    n8nRepos.workflow.findOneBy.mockResolvedValue({ id: 'wf-1' });
    let txManager;
    n8nRepos.withTransaction.mockImplementation(async (_m, _c, handler) => {
      const em = { create: vitest_1.vi.fn((_e, p) => p), save: vitest_1.vi.fn(async (v) => v) };
      txManager = em;
      return await handler(em);
    });
    const service = new ui_api_1.UiApiService((0, mocks_1.createMockN8nRepositoryObject)(n8nRepos));
    const result = await service.shareWorkflow('owner@example.com', 'wf-1', 'new@example.com');
    (0, vitest_1.expect)(txManager.save).toHaveBeenCalled();
    (0, vitest_1.expect)(result).toEqual({ workflowId: 'wf-1', sharedWithEmail: 'new@example.com' });
  });
  (0, vitest_1.it)('rejects sharing an already associated email', async () => {
    const n8nRepos = (0, mocks_1.createMockN8nRepositories)();
    n8nRepos.user.findOne.mockImplementation(async ({ where: { email } }) => {
      if (email === 'owner@example.com') {
        return {
          id: 'user-123',
          email: 'owner@example.com',
          role: { slug: 'global:admin', displayName: 'Admin' },
        };
      }
      if (email === 'teammate@example.com') {
        return {
          id: 'user-456',
          email: 'teammate@example.com',
          role: { slug: 'global:member', displayName: 'Member' },
        };
      }
      return null;
    });
    n8nRepos.project.getPersonalProjectForUser.mockResolvedValue({
      id: mocks_1.VALID_PROJECT_ID,
      name: 'Default project',
    });
    n8nRepos.projectRelation.findAllByUser.mockResolvedValue([
      { projectId: mocks_1.VALID_PROJECT_ID },
      { projectId: 'team-proj' },
    ]);
    const workflowRows = [
      { workflowId: 'wf-1', workflowName: 'First workflow', projectId: mocks_1.VALID_PROJECT_ID },
      { workflowId: 'wf-1', workflowName: 'First workflow', projectId: 'team-proj' },
    ];
    n8nRepos.sharedWorkflow.manager.query.mockImplementation(async (_sql, params) => {
      if (Array.isArray(params?.[0])) return workflowRows;
      if (params?.[0] === 'wf-1') return workflowRows;
      return [];
    });
    n8nRepos.projectRelation.manager.query.mockResolvedValue([
      { projectId: mocks_1.VALID_PROJECT_ID, email: 'owner@example.com' },
      { projectId: 'team-proj', email: 'teammate@example.com' },
    ]);
    const service = new ui_api_1.UiApiService((0, mocks_1.createMockN8nRepositoryObject)(n8nRepos));
    await (0, vitest_1.expect)(
      service.shareWorkflow('owner@example.com', 'wf-1', 'teammate@example.com'),
    ).rejects.toMatchObject({
      message: 'Email is already associated with this workflow.',
    });
    (0, vitest_1.expect)(n8nRepos.sharedWorkflow.save).not.toHaveBeenCalled();
  });
  (0, vitest_1.it)('shares workflows with a single project', async () => {
    const n8nRepos = (0, mocks_1.createMockN8nRepositories)();
    n8nRepos.user.findOne.mockImplementation(async ({ where: { email } }) => {
      if (email === 'owner@example.com') {
        return {
          id: 'user-123',
          email: 'owner@example.com',
          role: { slug: 'global:admin', displayName: 'Admin' },
        };
      }
      if (email === 'new@example.com') {
        return {
          id: 'user-456',
          email: 'new@example.com',
          role: { slug: 'global:member', displayName: 'Member' },
        };
      }
      return null;
    });
    n8nRepos.project.getPersonalProjectForUser.mockResolvedValue({
      id: mocks_1.VALID_PROJECT_ID,
      name: 'Default project',
    });
    n8nRepos.project.getPersonalProjectForUser.mockImplementation(async (userId) => {
      if (userId === 'user-123') return { id: mocks_1.VALID_PROJECT_ID, name: 'Default project' };
      if (userId === 'user-456') return { id: 'target-proj', name: 'Target project' };
      return null;
    });
    n8nRepos.projectRelation.findAllByUser.mockResolvedValue([{ projectId: mocks_1.VALID_PROJECT_ID }]);
    const workflowRows = [{ workflowId: 'wf-1', workflowName: 'First workflow', projectId: mocks_1.VALID_PROJECT_ID }];
    n8nRepos.sharedWorkflow.manager.query.mockImplementation(async (_sql, params) => {
      if (Array.isArray(params?.[0])) return workflowRows;
      if (params?.[0] === 'wf-1') return workflowRows;
      return [];
    });
    n8nRepos.projectRelation.manager.query.mockResolvedValue([
      { projectId: mocks_1.VALID_PROJECT_ID, email: 'owner@example.com' },
    ]);
    n8nRepos.workflow.findOneBy.mockResolvedValue({ id: 'wf-1' });
    let txManager;
    n8nRepos.withTransaction.mockImplementation(async (_m, _c, handler) => {
      const em = { create: vitest_1.vi.fn((_e, p) => p), save: vitest_1.vi.fn(async (v) => v) };
      txManager = em;
      return await handler(em);
    });
    const service = new ui_api_1.UiApiService((0, mocks_1.createMockN8nRepositoryObject)(n8nRepos));
    const result = await service.shareWorkflow('owner@example.com', 'wf-1', 'new@example.com');
    (0, vitest_1.expect)(txManager.save).toHaveBeenCalled();
    (0, vitest_1.expect)(result).toEqual({ workflowId: 'wf-1', sharedWithEmail: 'new@example.com' });
  });
  (0, vitest_1.it)('shares credentials used by workflow nodes with target project', async () => {
    const n8nRepos = (0, mocks_1.createMockN8nRepositories)();
    n8nRepos.user.findOne.mockImplementation(async ({ where: { email } }) => {
      if (email === 'owner@example.com') {
        return {
          id: 'user-123',
          email: 'owner@example.com',
          role: { slug: 'global:admin', displayName: 'Admin' },
        };
      }
      if (email === 'new@example.com') {
        return {
          id: 'user-456',
          email: 'new@example.com',
          role: { slug: 'global:member', displayName: 'Member' },
        };
      }
      return null;
    });
    n8nRepos.project.getPersonalProjectForUser.mockImplementation(async (userId) => {
      if (userId === 'user-123') return { id: mocks_1.VALID_PROJECT_ID, name: 'Default project' };
      if (userId === 'user-456') return { id: 'target-proj', name: 'Target project' };
      return null;
    });
    n8nRepos.projectRelation.findAllByUser.mockResolvedValue([{ projectId: mocks_1.VALID_PROJECT_ID }]);
    n8nRepos.sharedWorkflow.manager.query.mockResolvedValue([
      { workflowId: 'wf-1', workflowName: 'First workflow', projectId: mocks_1.VALID_PROJECT_ID },
    ]);
    n8nRepos.projectRelation.manager.query.mockResolvedValue([
      { projectId: mocks_1.VALID_PROJECT_ID, email: 'owner@example.com' },
    ]);
    n8nRepos.workflow.findOneBy.mockResolvedValue({
      id: 'wf-1',
      nodes: [
        {
          credentials: {
            httpBasicAuth: { id: 'cred-1' },
            slackApi: { id: 'cred-2' },
          },
        },
        {
          credentials: {
            githubApi: { id: 'cred-3' },
          },
        },
      ],
    });
    n8nRepos.sharedCredential.manager.query.mockResolvedValue([]);
    let txManager;
    n8nRepos.withTransaction.mockImplementation(async (_m, _c, handler) => {
      const em = { create: vitest_1.vi.fn((_e, p) => p), save: vitest_1.vi.fn(async (v) => v) };
      txManager = em;
      return await handler(em);
    });
    const service = new ui_api_1.UiApiService((0, mocks_1.createMockN8nRepositoryObject)(n8nRepos));
    await service.shareWorkflow('owner@example.com', 'wf-1', 'new@example.com');
    (0, vitest_1.expect)(txManager.create).toHaveBeenCalledTimes(3); // 3 credentials only
    (0, vitest_1.expect)(txManager.create).toHaveBeenCalledWith('SharedCredentials', {
      credentialsId: 'cred-1',
      projectId: 'target-proj',
      role: 'credential:owner',
    });
    (0, vitest_1.expect)(txManager.create).toHaveBeenCalledWith('SharedCredentials', {
      credentialsId: 'cred-2',
      projectId: 'target-proj',
      role: 'credential:owner',
    });
    (0, vitest_1.expect)(txManager.create).toHaveBeenCalledWith('SharedCredentials', {
      credentialsId: 'cred-3',
      projectId: 'target-proj',
      role: 'credential:owner',
    });
    (0, vitest_1.expect)(txManager.save).toHaveBeenCalledTimes(4);
  });
  (0, vitest_1.it)('skips credentials already shared with target project', async () => {
    const n8nRepos = (0, mocks_1.createMockN8nRepositories)();
    n8nRepos.user.findOne.mockImplementation(async ({ where: { email } }) => {
      if (email === 'owner@example.com') {
        return {
          id: 'user-123',
          email: 'owner@example.com',
          role: { slug: 'global:admin', displayName: 'Admin' },
        };
      }
      if (email === 'new@example.com') {
        return {
          id: 'user-456',
          email: 'new@example.com',
          role: { slug: 'global:member', displayName: 'Member' },
        };
      }
      return null;
    });
    n8nRepos.project.getPersonalProjectForUser.mockImplementation(async (userId) => {
      if (userId === 'user-123') return { id: mocks_1.VALID_PROJECT_ID, name: 'Default project' };
      if (userId === 'user-456') return { id: 'target-proj', name: 'Target project' };
      return null;
    });
    n8nRepos.projectRelation.findAllByUser.mockResolvedValue([{ projectId: mocks_1.VALID_PROJECT_ID }]);
    n8nRepos.sharedWorkflow.manager.query.mockResolvedValue([
      { workflowId: 'wf-1', workflowName: 'First workflow', projectId: mocks_1.VALID_PROJECT_ID },
    ]);
    n8nRepos.projectRelation.manager.query.mockResolvedValue([
      { projectId: mocks_1.VALID_PROJECT_ID, email: 'owner@example.com' },
    ]);
    n8nRepos.workflow.findOneBy.mockResolvedValue({
      id: 'wf-1',
      nodes: [
        {
          credentials: {
            httpBasicAuth: { id: 'cred-1' },
            slackApi: { id: 'cred-2' },
          },
        },
      ],
    });
    n8nRepos.sharedCredential.manager.query.mockResolvedValue([{ credentialsId: 'cred-1' }]);
    let txManager;
    n8nRepos.withTransaction.mockImplementation(async (_m, _c, handler) => {
      const em = { create: vitest_1.vi.fn((_e, p) => p), save: vitest_1.vi.fn(async (v) => v) };
      txManager = em;
      return await handler(em);
    });
    const service = new ui_api_1.UiApiService((0, mocks_1.createMockN8nRepositoryObject)(n8nRepos));
    await service.shareWorkflow('owner@example.com', 'wf-1', 'new@example.com');
    (0, vitest_1.expect)(txManager.create).toHaveBeenCalledTimes(1); // 1 credential (cred-2) only
    (0, vitest_1.expect)(txManager.create).toHaveBeenCalledWith('SharedCredentials', {
      credentialsId: 'cred-2',
      projectId: 'target-proj',
      role: 'credential:owner',
    });
    (0, vitest_1.expect)(txManager.save).toHaveBeenCalledTimes(2);
  });
  (0, vitest_1.it)('skips credential sharing when workflow has no nodes', async () => {
    const n8nRepos = (0, mocks_1.createMockN8nRepositories)();
    n8nRepos.user.findOne.mockImplementation(async ({ where: { email } }) => {
      if (email === 'owner@example.com') {
        return {
          id: 'user-123',
          email: 'owner@example.com',
          role: { slug: 'global:admin', displayName: 'Admin' },
        };
      }
      if (email === 'new@example.com') {
        return {
          id: 'user-456',
          email: 'new@example.com',
          role: { slug: 'global:member', displayName: 'Member' },
        };
      }
      return null;
    });
    n8nRepos.project.getPersonalProjectForUser.mockImplementation(async (userId) => {
      if (userId === 'user-123') return { id: mocks_1.VALID_PROJECT_ID, name: 'Default project' };
      if (userId === 'user-456') return { id: 'target-proj', name: 'Target project' };
      return null;
    });
    n8nRepos.projectRelation.findAllByUser.mockResolvedValue([{ projectId: mocks_1.VALID_PROJECT_ID }]);
    // Initial loadWorkflowRows call - handles any SQL query
    n8nRepos.sharedWorkflow.manager.query.mockImplementation(async () => [
      { workflowId: 'wf-1', workflowName: 'First workflow', projectId: mocks_1.VALID_PROJECT_ID },
    ]);
    n8nRepos.projectRelation.manager.query.mockResolvedValue([
      { projectId: mocks_1.VALID_PROJECT_ID, email: 'owner@example.com' },
    ]);
    // findOneBy call inside shareWorkflow
    n8nRepos.workflow.findOneBy.mockResolvedValue({ id: 'wf-1', nodes: [] });
    let txManager;
    n8nRepos.withTransaction.mockImplementation(async (_m, _c, handler) => {
      const em = { create: vitest_1.vi.fn((_e, p) => p), save: vitest_1.vi.fn(async (v) => v) };
      txManager = em;
      return await handler(em);
    });
    const service = new ui_api_1.UiApiService((0, mocks_1.createMockN8nRepositoryObject)(n8nRepos));
    await service.shareWorkflow('owner@example.com', 'wf-1', 'new@example.com');
    (0, vitest_1.expect)(txManager.save).toHaveBeenCalledTimes(1); // only sharedWorkflow
  });
  (0, vitest_1.it)('allows sharing for project admins on their workflow project', async () => {
    const n8nRepos = (0, mocks_1.createMockN8nRepositories)();
    n8nRepos.user.findOne.mockResolvedValue({
      id: 'user-123',
      email: 'member@example.com',
      role: { slug: 'global:member', displayName: 'Member' },
    });
    n8nRepos.user.findOne.mockImplementation(async ({ where: { email } }) => {
      if (email === 'member@example.com') {
        return {
          id: 'user-123',
          email: 'member@example.com',
          role: { slug: 'global:member', displayName: 'Member' },
        };
      }
      if (email === 'new@example.com') {
        return {
          id: 'user-456',
          email: 'new@example.com',
          role: { slug: 'global:member', displayName: 'Member' },
        };
      }
      return null;
    });
    n8nRepos.project.getPersonalProjectForUser.mockImplementation(async (userId) => {
      if (userId === 'user-123') return { id: mocks_1.VALID_PROJECT_ID, name: 'Default project' };
      if (userId === 'user-456') return { id: 'target-proj', name: 'Target project' };
      return null;
    });
    n8nRepos.projectRelation.findAllByUser.mockResolvedValue([{ projectId: 'team-proj' }]);
    n8nRepos.sharedWorkflow.manager.query.mockResolvedValue([
      { workflowId: 'wf-1', workflowName: 'First workflow', projectId: 'team-proj' },
    ]);
    n8nRepos.projectRelation.manager.query.mockResolvedValue([{ projectId: 'team-proj', email: 'member@example.com' }]);
    n8nRepos.projectRelation.findProjectRole.mockResolvedValue({ slug: 'project:admin' });
    n8nRepos.workflow.findOneBy.mockResolvedValue({ id: 'wf-1', nodes: [] });
    let txManager;
    n8nRepos.withTransaction.mockImplementation(async (_m, _c, handler) => {
      const em = { create: vitest_1.vi.fn((_e, p) => p), save: vitest_1.vi.fn(async (v) => v) };
      txManager = em;
      return await handler(em);
    });
    const service = new ui_api_1.UiApiService((0, mocks_1.createMockN8nRepositoryObject)(n8nRepos));
    const result = await service.shareWorkflow('member@example.com', 'wf-1', 'new@example.com');
    (0, vitest_1.expect)(txManager.save).toHaveBeenCalled();
    (0, vitest_1.expect)(result).toEqual({ workflowId: 'wf-1', sharedWithEmail: 'new@example.com' });
  });
  (0, vitest_1.it)('rejects sharing when caller is not a workflow admin for the workflow project', async () => {
    const n8nRepos = (0, mocks_1.createMockN8nRepositories)();
    n8nRepos.user.findOne.mockResolvedValue({
      id: 'user-123',
      email: 'member@example.com',
      role: { slug: 'global:member', displayName: 'Member' },
    });
    n8nRepos.project.getPersonalProjectForUser.mockResolvedValue({
      id: mocks_1.VALID_PROJECT_ID,
      name: 'Default project',
    });
    n8nRepos.projectRelation.findAllByUser.mockResolvedValue([{ projectId: 'team-proj' }]);
    n8nRepos.sharedWorkflow.manager.query.mockResolvedValue([
      { workflowId: 'wf-1', workflowName: 'First workflow', projectId: 'team-proj' },
    ]);
    n8nRepos.projectRelation.manager.query.mockResolvedValue([{ projectId: 'team-proj', email: 'member@example.com' }]);
    n8nRepos.projectRelation.findProjectRole.mockResolvedValue({ slug: 'project:editor' });
    const service = new ui_api_1.UiApiService((0, mocks_1.createMockN8nRepositoryObject)(n8nRepos));
    await (0, vitest_1.expect)(
      service.shareWorkflow('member@example.com', 'wf-1', 'new@example.com'),
    ).rejects.toMatchObject({
      message: 'Sharing this workflow is restricted to workflow admins.',
    });
  });
  (0, vitest_1.it)('rejects unsharing for non-admin users', async () => {
    const n8nRepos = (0, mocks_1.createMockN8nRepositories)();
    n8nRepos.user.findOne.mockResolvedValue({
      id: 'user-123',
      email: 'member@example.com',
      role: { slug: 'global:member', displayName: 'Member' },
    });
    n8nRepos.projectRelation.findAllByUser.mockResolvedValue([{ projectId: 'team-proj' }]);
    const service = new ui_api_1.UiApiService((0, mocks_1.createMockN8nRepositoryObject)(n8nRepos));
    await (0, vitest_1.expect)(
      service.unshareWorkflow('member@example.com', 'wf-1', 'team-proj'),
    ).rejects.toMatchObject({
      message: 'Unsharing workflows is restricted to owner and admin users.',
    });
  });
  (0, vitest_1.it)('rejects sharing for unknown emails', async () => {
    const n8nRepos = (0, mocks_1.createMockN8nRepositories)();
    n8nRepos.user.findOne.mockImplementation(async ({ where: { email } }) => {
      if (email === 'owner@example.com') {
        return {
          id: 'user-123',
          email: 'owner@example.com',
          role: { slug: 'global:admin', displayName: 'Admin' },
        };
      }
      return null;
    });
    n8nRepos.project.getPersonalProjectForUser.mockResolvedValue({
      id: mocks_1.VALID_PROJECT_ID,
      name: 'Default project',
    });
    n8nRepos.projectRelation.findAllByUser.mockResolvedValue([
      { projectId: mocks_1.VALID_PROJECT_ID },
      { projectId: 'team-proj' },
    ]);
    n8nRepos.sharedWorkflow.manager.query.mockResolvedValue([
      { workflowId: 'wf-1', workflowName: 'First workflow', projectId: mocks_1.VALID_PROJECT_ID },
      { workflowId: 'wf-1', workflowName: 'First workflow', projectId: 'team-proj' },
    ]);
    const service = new ui_api_1.UiApiService((0, mocks_1.createMockN8nRepositoryObject)(n8nRepos));
    await (0, vitest_1.expect)(
      service.shareWorkflow('owner@example.com', 'wf-1', 'missing@example.com'),
    ).rejects.toMatchObject({
      message: 'Target user not found.',
    });
    (0, vitest_1.expect)(n8nRepos.sharedWorkflow.save).not.toHaveBeenCalled();
  });
  (0, vitest_1.it)('unshares a workflow project', async () => {
    const n8nRepos = (0, mocks_1.createMockN8nRepositories)();
    n8nRepos.user.findOne.mockResolvedValue({
      id: 'user-123',
      email: 'owner@example.com',
      role: { slug: 'global:admin', displayName: 'Admin' },
    });
    n8nRepos.project.getPersonalProjectForUser.mockResolvedValue({ id: mocks_1.VALID_PROJECT_ID });
    n8nRepos.projectRelation.findAllByUser.mockResolvedValue([
      { projectId: mocks_1.VALID_PROJECT_ID },
      { projectId: 'team-proj' },
    ]);
    // Initial loadWorkflowRows call (sharedWorkflow.manager.query)
    n8nRepos.sharedWorkflow.manager.query.mockResolvedValueOnce([
      { workflowId: 'wf-1', workflowName: 'First workflow', projectId: mocks_1.VALID_PROJECT_ID },
      { workflowId: 'wf-1', workflowName: 'First workflow', projectId: 'team-proj' },
    ]);
    // First call in unshareWorkflowCredentialsIfUnused: find wf-1
    n8nRepos.workflow.findOneBy.mockResolvedValueOnce({
      id: 'wf-1',
      nodes: [
        {
          credentials: {
            httpBasicAuth: { id: 'cred-1' },
          },
        },
      ],
    });
    // Second call: find other workflows in the project
    n8nRepos.sharedWorkflow.manager.query.mockResolvedValueOnce([
      { workflowId: 'wf-2', workflowName: 'Other workflow', projectId: mocks_1.VALID_PROJECT_ID },
      { workflowId: 'wf-2', workflowName: 'Other workflow', projectId: 'team-proj' },
    ]);
    // Third call: find wf-2
    n8nRepos.workflow.findOneBy.mockResolvedValueOnce({
      id: 'wf-2',
      nodes: [
        {
          credentials: {
            slackApi: { id: 'cred-2' },
          },
        },
      ],
    });
    let txManager;
    n8nRepos.withTransaction.mockImplementation(async (_m, _c, handler) => {
      const em = {
        create: vitest_1.vi.fn((_e, p) => p),
        save: vitest_1.vi.fn(async (v) => v),
        delete: vitest_1.vi.fn(async () => undefined),
      };
      txManager = em;
      return await handler(em);
    });
    n8nRepos.sharedCredential.manager.query = vitest_1.vi.fn().mockResolvedValue([]);
    const service = new ui_api_1.UiApiService((0, mocks_1.createMockN8nRepositoryObject)(n8nRepos));
    const result = await service.unshareWorkflow('owner@example.com', 'wf-1', 'team-proj');
    (0, vitest_1.expect)(txManager.delete).toHaveBeenCalledWith('SharedWorkflow', {
      workflow: { id: 'wf-1' },
      project: { id: 'team-proj' },
    });
    // cred-1 should be unshared since no other workflow in team-proj uses it
    // cred-2 should NOT be unshared since wf-2 in team-proj still uses it
    (0, vitest_1.expect)(n8nRepos.sharedCredential.manager.query).toHaveBeenCalledWith(
      vitest_1.expect.stringContaining('DELETE FROM shared_credentials'),
      vitest_1.expect.arrayContaining(['team-proj', 'cred-1']),
    );
    (0, vitest_1.expect)(result).toEqual({ workflowId: 'wf-1', projectId: 'team-proj' });
  });
});
