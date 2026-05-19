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
      },
      {
        workflowId: 'wf-2',
        workflowName: 'Second workflow',
        projectIds: ['team-proj'],
        userEmails: ['teammate@example.com'],
      },
    ]);
  });
});
