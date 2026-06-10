import { describe, expect, it, vi } from 'vitest';
import { AccessRequestService } from '../../../src/api/services/access-request';
import { AppError } from '../../../src/api/utils/errors';

function createService(overrides?: {
  accessRequest?: Record<string, unknown>;
  user?: Record<string, unknown>;
  userRoleService?: Record<string, unknown>;
}) {
  const accessRequest = {
    getPendingByRequesterEmail: vi.fn(),
    getLatestByRequesterEmail: vi.fn(),
    create: vi.fn(),
    list: vi.fn(),
    count: vi.fn(),
    getById: vi.fn(),
    updateStatus: vi.fn(),
    ...overrides?.accessRequest,
  };

  const user = {
    findByEmail: vi.fn(),
    createUserWithProject: vi.fn(),
    setUserDisabled: vi.fn(),
    ...overrides?.user,
  };

  const userRoleService = {
    changeUserRole: vi.fn(),
    ...overrides?.userRoleService,
  };

  return {
    accessRequest,
    user,
    userRoleService,
    service: new AccessRequestService({ user } as any, { accessRequest } as any, userRoleService as any),
  };
}

describe('AccessRequestService', () => {
  it('returns the latest request for the requester, even when reviewed', async () => {
    const latestRequest = {
      id: 'request-1',
      requesterEmail: 'person@example.com',
      justification: 'Need access to review runs.',
      status: 'denied',
      reviewerEmail: 'admin@example.com',
      reviewerN8nUserId: 'user-2',
      denyReason: 'Needs more detail.',
      createdAt: new Date('2024-01-01T00:00:00.000Z'),
      updatedAt: new Date('2024-01-02T00:00:00.000Z'),
    };
    const { service, accessRequest } = createService({
      accessRequest: {
        getLatestByRequesterEmail: vi.fn().mockResolvedValue(latestRequest),
      },
    });

    const result = await service.getMyAccessRequest('person@example.com');

    expect(accessRequest.getLatestByRequesterEmail).toHaveBeenCalledWith('person@example.com');
    expect(result?.status).toBe('denied');
    expect(result?.denyReason).toBe('Needs more detail.');
  });

  it('maps duplicate pending-request inserts to a conflict error', async () => {
    const { service } = createService({
      accessRequest: {
        getPendingByRequesterEmail: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockRejectedValue({ code: '23505' }),
      },
    });

    await expect(
      service.createAccessRequest({
        requesterEmail: 'person@example.com',
        justification: 'Need access to manage workflows.',
      }),
    ).rejects.toMatchObject<AppError>({
      statusCode: 409,
      message: 'You already have a pending access request.',
    });
  });

  it('re-enables an existing disabled user on approval', async () => {
    const existingRequest = {
      id: 'request-1',
      requesterEmail: 'person@example.com',
      justification: 'Need access to manage workflows.',
      status: 'pending',
      reviewerEmail: null,
      reviewerN8nUserId: null,
      denyReason: null,
      createdAt: new Date('2024-01-01T00:00:00.000Z'),
      updatedAt: new Date('2024-01-01T00:00:00.000Z'),
    };
    const updatedRequest = {
      ...existingRequest,
      status: 'approved',
      reviewerEmail: 'admin@example.com',
      reviewerN8nUserId: 'admin-1',
      updatedAt: new Date('2024-01-02T00:00:00.000Z'),
    };
    const { service, user, accessRequest, userRoleService } = createService({
      accessRequest: {
        getById: vi.fn().mockResolvedValue(existingRequest),
        updateStatus: vi.fn().mockResolvedValue(updatedRequest),
      },
      user: {
        findByEmail: vi.fn().mockResolvedValue({
          id: 'user-1',
          email: 'person@example.com',
          disabled: true,
          role: { slug: 'global:member' },
        }),
      },
    });

    const result = await service.reviewAccessRequest({
      accessRequestId: 'request-1',
      action: 'approve',
      reviewerEmail: 'admin@example.com',
      reviewerN8nUserId: 'admin-1',
    });

    expect(user.setUserDisabled).toHaveBeenCalledWith('user-1', false);
    expect(userRoleService.changeUserRole).not.toHaveBeenCalled();
    expect(accessRequest.updateStatus).toHaveBeenCalledWith(
      expect.objectContaining({ accessRequestId: 'request-1', status: 'approved', currentStatus: 'pending' }),
    );
    expect(result.status).toBe('approved');
  });

  it('does not mutate user access when another review wins the race', async () => {
    const existingRequest = {
      id: 'request-1',
      requesterEmail: 'person@example.com',
      justification: 'Need access to manage workflows.',
      status: 'pending',
      reviewerEmail: null,
      reviewerN8nUserId: null,
      denyReason: null,
      createdAt: new Date('2024-01-01T00:00:00.000Z'),
      updatedAt: new Date('2024-01-01T00:00:00.000Z'),
    };
    const { service, user, userRoleService } = createService({
      accessRequest: {
        getById: vi.fn().mockResolvedValue(existingRequest),
        updateStatus: vi.fn().mockResolvedValue(null),
      },
      user: {
        findByEmail: vi.fn().mockResolvedValue({
          id: 'user-1',
          email: 'person@example.com',
          disabled: true,
          role: null,
        }),
      },
    });

    await expect(
      service.reviewAccessRequest({
        accessRequestId: 'request-1',
        action: 'approve',
        reviewerEmail: 'admin@example.com',
        reviewerN8nUserId: 'admin-1',
      }),
    ).rejects.toMatchObject<AppError>({
      statusCode: 409,
      message: 'Access request is no longer pending.',
    });

    expect(user.findByEmail).not.toHaveBeenCalled();
    expect(user.setUserDisabled).not.toHaveBeenCalled();
    expect(userRoleService.changeUserRole).not.toHaveBeenCalled();
  });

  it('returns a conflict when the request stops being pending during review', async () => {
    const existingRequest = {
      id: 'request-1',
      requesterEmail: 'person@example.com',
      justification: 'Need access to manage workflows.',
      status: 'pending',
      reviewerEmail: null,
      reviewerN8nUserId: null,
      denyReason: null,
      createdAt: new Date('2024-01-01T00:00:00.000Z'),
      updatedAt: new Date('2024-01-01T00:00:00.000Z'),
    };
    const { service } = createService({
      accessRequest: {
        getById: vi.fn().mockResolvedValue(existingRequest),
        updateStatus: vi.fn().mockResolvedValue(null),
      },
      user: {
        findByEmail: vi.fn().mockResolvedValue({
          id: 'user-1',
          email: 'person@example.com',
          disabled: false,
          role: { slug: 'global:member' },
        }),
      },
    });

    await expect(
      service.reviewAccessRequest({
        accessRequestId: 'request-1',
        action: 'approve',
        reviewerEmail: 'admin@example.com',
        reviewerN8nUserId: 'admin-1',
      }),
    ).rejects.toMatchObject<AppError>({
      statusCode: 409,
      message: 'Access request is no longer pending.',
    });
  });
});
