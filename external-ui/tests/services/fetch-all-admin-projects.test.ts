import { beforeEach, describe, expect, it, vi } from 'vitest';

import { instance } from '@/services/backend/axios';
import { fetchAllAdminProjects, type AdminProjectItem } from '@/services/backend/projects';

vi.mock('@/services/backend/axios', () => ({
  instance: { get: vi.fn(), put: vi.fn(), post: vi.fn(), delete: vi.fn() },
}));

const getMock = vi.mocked(instance.get);

function makeProject(id: string): AdminProjectItem {
  return {
    projectId: id,
    projectName: `Project ${id}`,
    projectType: 'team',
    tenantId: null,
    weeklyRateLimit: null,
    yearlyRateLimit: null,
    stopBehavior: null,
    lastAdminComment: null,
    weeklyExecutionCount: 0,
    yearlyExecutionCount: 0,
    workflowCount: 0,
    updatedAt: null,
    updatedByName: null,
  };
}

function pageResponse(page: number, totalPages: number, ids: string[]) {
  return {
    data: {
      data: ids.map(makeProject),
      pagination: { page, pageSize: 100, totalItems: totalPages * 100, totalPages },
    },
  };
}

describe('fetchAllAdminProjects', () => {
  beforeEach(() => {
    getMock.mockReset();
  });

  it('stops after a single page when everything fits', async () => {
    getMock.mockResolvedValueOnce(pageResponse(1, 1, ['p1', 'p2']) as never);

    const projects = await fetchAllAdminProjects();

    expect(projects).toHaveLength(2);
    expect(projects.map((project) => project.projectId)).toEqual(['p1', 'p2']);
    expect(getMock).toHaveBeenCalledTimes(1);
  });

  it('pages through the list endpoint until the last page', async () => {
    getMock
      .mockResolvedValueOnce(pageResponse(1, 2, ['p1', 'p2']) as never)
      .mockResolvedValueOnce(pageResponse(2, 2, ['p3']) as never);

    const projects = await fetchAllAdminProjects();

    expect(projects).toHaveLength(3);
    expect(getMock).toHaveBeenCalledTimes(2);
    expect(getMock.mock.calls[0][0]).toBe('/ui-api/admin/projects');
    expect(getMock.mock.calls[0][1]?.params).toMatchObject({ page: 1, pageSize: 100 });
    expect(getMock.mock.calls[1][1]?.params).toMatchObject({ page: 2, pageSize: 100 });
  });

  it('gives up after a hard cap of pages even if the endpoint keeps paginating', async () => {
    getMock.mockImplementation((async () => pageResponse(1, 500, ['p1'])) as never);

    const projects = await fetchAllAdminProjects();

    expect(projects).toHaveLength(100);
    expect(getMock).toHaveBeenCalledTimes(100);
  });
});
