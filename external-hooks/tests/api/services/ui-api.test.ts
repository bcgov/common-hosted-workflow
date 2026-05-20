import { describe, expect, it, vi } from 'vitest';
import { UiApiService } from '../../../src/api/services/ui-api';
import { createMockN8nRepositories, VALID_PROJECT_ID } from '../../helpers/mocks';

describe('UiApiService', () => {
  it('returns the n8n user for whoami lookups', async () => {
    const n8nRepos = createMockN8nRepositories();
    n8nRepos.user.findOne.mockResolvedValue({
      id: 'user-123',
      email: 'person@example.com',
      role: { slug: 'global:member', displayName: 'Member' },
    });

    const service = new UiApiService(n8nRepos as any);
    const result = await service.getWhoami('person@example.com');

    expect(n8nRepos.user.findOne).toHaveBeenCalledWith({
      where: { email: 'person@example.com' },
      relations: ['role'],
    });
    expect(result).toEqual({
      id: 'user-123',
      email: 'person@example.com',
      role: { slug: 'global:member', displayName: 'Member' },
    });
  });

  it('returns all workflows for global owner users', async () => {
    const n8nRepos = createMockN8nRepositories();
    n8nRepos.user.findOne.mockResolvedValue({
      id: 'user-123',
      email: 'owner@example.com',
      role: { slug: 'global:owner', displayName: 'Owner' },
    });
    n8nRepos.project.getPersonalProjectForUser.mockResolvedValue({ id: VALID_PROJECT_ID });
    n8nRepos.projectRelation.findAllByUser.mockResolvedValue([{ projectId: VALID_PROJECT_ID }]);
    n8nRepos.sharedWorkflow.manager.query.mockResolvedValue([
      { workflowId: 'wf-1', workflowName: 'First workflow', projectId: VALID_PROJECT_ID },
      { workflowId: 'wf-2', workflowName: 'Second workflow', projectId: 'team-proj' },
    ]);
    n8nRepos.projectRelation.manager.query.mockResolvedValue([
      { projectId: VALID_PROJECT_ID, email: 'owner@example.com' },
      { projectId: 'team-proj', email: 'teammate@example.com' },
    ]);

    const service = new UiApiService(n8nRepos as any);
    const result = await service.getWorkflows('owner@example.com');

    expect(n8nRepos.sharedWorkflow.manager.query).toHaveBeenCalledTimes(1);
    expect(n8nRepos.sharedWorkflow.manager.query.mock.calls[0][1]).toBeUndefined();
    expect(result.workflows).toEqual([
      {
        workflowId: 'wf-1',
        workflowName: 'First workflow',
        projectIds: [VALID_PROJECT_ID],
        userEmails: ['owner@example.com'],
        projectShares: [{ projectId: VALID_PROJECT_ID, userEmails: ['owner@example.com'] }],
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

  it('shares a workflow with a new email', async () => {
    const n8nRepos = createMockN8nRepositories();
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
    n8nRepos.project.getPersonalProjectForUser.mockImplementation(async (userId: string) => {
      if (userId === 'user-123') return { id: VALID_PROJECT_ID };
      if (userId === 'user-456') return { id: 'target-proj' };
      return null;
    });
    n8nRepos.projectRelation.findAllByUser.mockResolvedValue([
      { projectId: VALID_PROJECT_ID },
      { projectId: 'team-proj' },
    ]);
    const workflowRows = [
      { workflowId: 'wf-1', workflowName: 'First workflow', projectId: VALID_PROJECT_ID },
      { workflowId: 'wf-1', workflowName: 'First workflow', projectId: 'team-proj' },
    ];
    n8nRepos.sharedWorkflow.manager.query.mockImplementation(async (_sql, params) => {
      if (Array.isArray(params?.[0])) return workflowRows;
      if (params?.[0] === 'wf-1') return workflowRows;
      return [];
    });
    n8nRepos.projectRelation.manager.query.mockResolvedValue([
      { projectId: VALID_PROJECT_ID, email: 'owner@example.com' },
      { projectId: 'team-proj', email: 'teammate@example.com' },
    ]);
    n8nRepos.workflow.findOneBy.mockResolvedValue({ id: 'wf-1' });

    const service = new UiApiService(n8nRepos as any);
    const result = await service.shareWorkflow('owner@example.com', 'wf-1', 'new@example.com');

    expect(n8nRepos.sharedWorkflow.save).toHaveBeenCalled();
    expect(result).toEqual({ workflowId: 'wf-1', sharedWithEmail: 'new@example.com' });
  });

  it('rejects sharing an already associated email', async () => {
    const n8nRepos = createMockN8nRepositories();
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
    n8nRepos.project.getPersonalProjectForUser.mockResolvedValue({ id: VALID_PROJECT_ID });
    n8nRepos.projectRelation.findAllByUser.mockResolvedValue([
      { projectId: VALID_PROJECT_ID },
      { projectId: 'team-proj' },
    ]);
    const workflowRows = [
      { workflowId: 'wf-1', workflowName: 'First workflow', projectId: VALID_PROJECT_ID },
      { workflowId: 'wf-1', workflowName: 'First workflow', projectId: 'team-proj' },
    ];
    n8nRepos.sharedWorkflow.manager.query.mockImplementation(async (_sql, params) => {
      if (Array.isArray(params?.[0])) return workflowRows;
      if (params?.[0] === 'wf-1') return workflowRows;
      return [];
    });
    n8nRepos.projectRelation.manager.query.mockResolvedValue([
      { projectId: VALID_PROJECT_ID, email: 'owner@example.com' },
      { projectId: 'team-proj', email: 'teammate@example.com' },
    ]);

    const service = new UiApiService(n8nRepos as any);
    await expect(service.shareWorkflow('owner@example.com', 'wf-1', 'teammate@example.com')).rejects.toMatchObject({
      message: 'Email is already associated with this workflow.',
    });
    expect(n8nRepos.sharedWorkflow.save).not.toHaveBeenCalled();
  });

  it('shares workflows with a single project', async () => {
    const n8nRepos = createMockN8nRepositories();
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
    n8nRepos.project.getPersonalProjectForUser.mockResolvedValue({ id: VALID_PROJECT_ID });
    n8nRepos.project.getPersonalProjectForUser.mockImplementation(async (userId: string) => {
      if (userId === 'user-123') return { id: VALID_PROJECT_ID };
      if (userId === 'user-456') return { id: 'target-proj' };
      return null;
    });
    n8nRepos.projectRelation.findAllByUser.mockResolvedValue([{ projectId: VALID_PROJECT_ID }]);
    const workflowRows = [{ workflowId: 'wf-1', workflowName: 'First workflow', projectId: VALID_PROJECT_ID }];
    n8nRepos.sharedWorkflow.manager.query.mockImplementation(async (_sql, params) => {
      if (Array.isArray(params?.[0])) return workflowRows;
      if (params?.[0] === 'wf-1') return workflowRows;
      return [];
    });
    n8nRepos.projectRelation.manager.query.mockResolvedValue([
      { projectId: VALID_PROJECT_ID, email: 'owner@example.com' },
    ]);
    n8nRepos.workflow.findOneBy.mockResolvedValue({ id: 'wf-1' });

    const service = new UiApiService(n8nRepos as any);
    const result = await service.shareWorkflow('owner@example.com', 'wf-1', 'new@example.com');

    expect(n8nRepos.sharedWorkflow.save).toHaveBeenCalled();
    expect(result).toEqual({ workflowId: 'wf-1', sharedWithEmail: 'new@example.com' });
  });

  it('rejects sharing for non-admin users', async () => {
    const n8nRepos = createMockN8nRepositories();
    n8nRepos.user.findOne.mockResolvedValue({
      id: 'user-123',
      email: 'member@example.com',
      role: { slug: 'global:member', displayName: 'Member' },
    });
    n8nRepos.project.getPersonalProjectForUser.mockResolvedValue({ id: VALID_PROJECT_ID });
    n8nRepos.projectRelation.findAllByUser.mockResolvedValue([
      { projectId: VALID_PROJECT_ID },
      { projectId: 'team-proj' },
    ]);

    const service = new UiApiService(n8nRepos as any);
    await expect(service.shareWorkflow('member@example.com', 'wf-1', 'new@example.com')).rejects.toMatchObject({
      message: 'Sharing workflows is restricted to owner and admin users.',
    });
    expect(n8nRepos.sharedWorkflow.save).not.toHaveBeenCalled();
  });

  it('rejects sharing for unknown emails', async () => {
    const n8nRepos = createMockN8nRepositories();
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
    n8nRepos.project.getPersonalProjectForUser.mockResolvedValue({ id: VALID_PROJECT_ID });
    n8nRepos.projectRelation.findAllByUser.mockResolvedValue([
      { projectId: VALID_PROJECT_ID },
      { projectId: 'team-proj' },
    ]);
    n8nRepos.sharedWorkflow.manager.query.mockResolvedValue([
      { workflowId: 'wf-1', workflowName: 'First workflow', projectId: VALID_PROJECT_ID },
      { workflowId: 'wf-1', workflowName: 'First workflow', projectId: 'team-proj' },
    ]);

    const service = new UiApiService(n8nRepos as any);
    await expect(service.shareWorkflow('owner@example.com', 'wf-1', 'missing@example.com')).rejects.toMatchObject({
      message: 'Target user not found.',
    });
    expect(n8nRepos.sharedWorkflow.save).not.toHaveBeenCalled();
  });

  it('unshares a workflow project', async () => {
    const n8nRepos = createMockN8nRepositories();
    n8nRepos.user.findOne.mockResolvedValue({
      id: 'user-123',
      email: 'owner@example.com',
      role: { slug: 'global:admin', displayName: 'Admin' },
    });
    n8nRepos.project.getPersonalProjectForUser.mockResolvedValue({ id: VALID_PROJECT_ID });
    n8nRepos.projectRelation.findAllByUser.mockResolvedValue([
      { projectId: VALID_PROJECT_ID },
      { projectId: 'team-proj' },
    ]);
    n8nRepos.sharedWorkflow.manager.query.mockResolvedValue([
      { workflowId: 'wf-1', workflowName: 'First workflow', projectId: VALID_PROJECT_ID },
      { workflowId: 'wf-1', workflowName: 'First workflow', projectId: 'team-proj' },
    ]);

    const service = new UiApiService(n8nRepos as any);
    const result = await service.unshareWorkflow('owner@example.com', 'wf-1', 'team-proj');

    expect(n8nRepos.sharedWorkflow.delete).toHaveBeenCalledWith({
      workflow: { id: 'wf-1' },
      project: { id: 'team-proj' },
    });
    expect(result).toEqual({ workflowId: 'wf-1', projectId: 'team-proj' });
  });
});
