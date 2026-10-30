import { beforeEach, describe, expect, it, vi } from 'vitest';

import { instance } from '@/services/backend/axios';
import {
  createProjectTopup,
  deleteProjectTopup,
  listProjectTopups,
  type ProjectTopupItem,
} from '@/services/backend/projects';

vi.mock('@/services/backend/axios', () => ({ instance: { get: vi.fn(), post: vi.fn(), delete: vi.fn() } }));

const getMock = vi.mocked(instance.get);
const postMock = vi.mocked(instance.post);
const deleteMock = vi.mocked(instance.delete);

const TOPUP: ProjectTopupItem = {
  id: '11111111-1111-4111-8111-111111111111',
  projectId: 'project/one',
  periodKey: '2026-W45',
  amount: 2_000,
  adminComment: 'Quarterly batch',
  createdBy: 'admin@example.com',
  createdAt: '2026-10-27T20:00:00Z',
};

describe('project top-up API helpers', () => {
  beforeEach(() => {
    getMock.mockReset();
    postMock.mockReset();
    deleteMock.mockReset();
  });

  it('lists top-ups with encoded project ID, paging and cancellation signal', async () => {
    const data = { data: [TOPUP], pagination: { page: 2, pageSize: 4, totalItems: 5, totalPages: 2 } };
    const signal = new AbortController().signal;
    getMock.mockResolvedValue({ data });

    const response = await listProjectTopups(TOPUP.projectId, 2, 4, signal);

    expect(getMock).toHaveBeenCalledWith('/ui-api/admin/projects/project%2Fone/topups', {
      params: { page: 2, pageSize: 4 },
      signal,
    });
    expect(response).toBe(data);
  });

  it('posts the create body and unwraps the success envelope', async () => {
    const body = { periodKey: TOPUP.periodKey, amount: TOPUP.amount, adminComment: TOPUP.adminComment };
    const data = { success: true, message: 'Top-up added', topup: TOPUP };
    postMock.mockResolvedValue({ data });

    const response = await createProjectTopup(TOPUP.projectId, body);

    expect(postMock).toHaveBeenCalledWith('/ui-api/admin/projects/project%2Fone/topups', body);
    expect(response).toBe(data);
  });

  it('deletes the specified top-up and accepts an empty response body', async () => {
    deleteMock.mockResolvedValue({ data: undefined });

    await expect(deleteProjectTopup(TOPUP.projectId, TOPUP.id)).resolves.toBeUndefined();

    expect(deleteMock).toHaveBeenCalledWith(`/ui-api/admin/projects/project%2Fone/topups/${TOPUP.id}`);
  });

  it('propagates server deletion errors to the caller', async () => {
    const error = new Error('Conflict');
    deleteMock.mockRejectedValue(error);

    await expect(deleteProjectTopup(TOPUP.projectId, TOPUP.id)).rejects.toBe(error);
  });
});
