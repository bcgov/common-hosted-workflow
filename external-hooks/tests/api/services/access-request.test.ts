import { describe, expect, it, vi, beforeEach } from 'vitest';
import { AccessRequestService } from '../../../src/api/services/access-request';
import { AppError } from '../../../src/api/utils/errors';

vi.mock('../../../src/api/helpers/css-sso-client', () => ({
  ensureRequiredRoles: vi.fn(),
  lookupAzureIdirUser: vi.fn(),
  assignUserRole: vi.fn(),
}));

import { ensureRequiredRoles, lookupAzureIdirUser, assignUserRole } from '../../../src/api/helpers/css-sso-client';

const mockEnsureRequiredRoles = vi.mocked(ensureRequiredRoles);
const mockLookupAzureIdirUser = vi.mocked(lookupAzureIdirUser);
const mockAssignUserRole = vi.mocked(assignUserRole);

function createService(overrides?: {
  accessRequest?: Record<string, unknown>;
  user?: Record<string, unknown>;
  userRoleService?: Record<string, unknown>;
  cssSsoConfig?: Record<string, unknown> | null;
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

  const cssSsoConfig =
    overrides?.cssSsoConfig === undefined
      ? {
          baseUrl: 'https://api.example.com',
          integrationId: '123',
          environment: 'dev',
          clientId: 'id',
          clientSecret: 'secret', // pragma: allowlist secret
          tokenEndpoint: 'https://token.example.com',
        }
      : overrides?.cssSsoConfig;

  return {
    accessRequest,
    user,
    userRoleService,
    cssSsoConfig,
    service: new AccessRequestService(
      { user } as any,
      { accessRequest } as any,
      userRoleService as any,
      cssSsoConfig as any,
    ),
  };
}

describe('AccessRequestService', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

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
    mockLookupAzureIdirUser.mockResolvedValue({ username: 'person@idir' });

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
    expect(mockEnsureRequiredRoles).toHaveBeenCalled();
    expect(mockLookupAzureIdirUser).toHaveBeenCalledWith(expect.anything(), 'person@example.com');
    expect(mockAssignUserRole).toHaveBeenCalledWith(expect.anything(), 'person@idir', 'global:member');
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
    expect(mockEnsureRequiredRoles).not.toHaveBeenCalled();
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

  it('skips CSS SSO role assignment when config is null', async () => {
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

    const { service, user, accessRequest } = createService({
      cssSsoConfig: null,
      accessRequest: {
        getById: vi.fn().mockResolvedValue(existingRequest),
        updateStatus: vi.fn().mockResolvedValue(updatedRequest),
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

    const result = await service.reviewAccessRequest({
      accessRequestId: 'request-1',
      action: 'approve',
      reviewerEmail: 'admin@example.com',
      reviewerN8nUserId: 'admin-1',
    });

    expect(result.status).toBe('approved');
    expect(mockEnsureRequiredRoles).not.toHaveBeenCalled();
    expect(mockLookupAzureIdirUser).not.toHaveBeenCalled();
    expect(mockAssignUserRole).not.toHaveBeenCalled();
  });

  it('throws when Azure IDIR user is not found', async () => {
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
    mockLookupAzureIdirUser.mockRejectedValue(
      new Error('No Azure IDIR user found with email person@example.com (or user has no IDIR GUID)'),
    );

    const { service, user } = createService({
      accessRequest: {
        getById: vi.fn().mockResolvedValue(existingRequest),
        updateStatus: vi.fn().mockResolvedValue(updatedRequest),
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
    ).rejects.toThrow('No Azure IDIR user found with email person@example.com (or user has no IDIR GUID)');
  });

  it('throws when ensureRequiredRoles fails', async () => {
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
    mockEnsureRequiredRoles.mockRejectedValue(new Error('CSS SSO token request failed (401): Unauthorized'));

    const { service, user } = createService({
      accessRequest: {
        getById: vi.fn().mockResolvedValue(existingRequest),
        updateStatus: vi.fn().mockResolvedValue(updatedRequest),
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
    ).rejects.toThrow('CSS SSO token request failed (401): Unauthorized');
  });

  it('throws when assignUserRole fails', async () => {
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
    mockLookupAzureIdirUser.mockResolvedValue({ username: 'person@idir' });
    mockAssignUserRole.mockRejectedValue(new Error('CSS SSO POST /users/roles failed (403): Forbidden'));

    const { service, user } = createService({
      accessRequest: {
        getById: vi.fn().mockResolvedValue(existingRequest),
        updateStatus: vi.fn().mockResolvedValue(updatedRequest),
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
    ).rejects.toThrow('CSS SSO POST /users/roles failed (403): Forbidden');
  });

  it('creates new user and assigns CSS SSO role on approval', async () => {
    const existingRequest = {
      id: 'request-1',
      requesterEmail: 'newuser@example.com',
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
    mockLookupAzureIdirUser.mockResolvedValue({ username: 'newuser@idir' });

    const { service, user, accessRequest } = createService({
      accessRequest: {
        getById: vi.fn().mockResolvedValue(existingRequest),
        updateStatus: vi.fn().mockResolvedValue(updatedRequest),
      },
      user: {
        findByEmail: vi.fn().mockResolvedValue(null),
      },
    });

    const result = await service.reviewAccessRequest({
      accessRequestId: 'request-1',
      action: 'approve',
      reviewerEmail: 'admin@example.com',
      reviewerN8nUserId: 'admin-1',
    });

    expect(result.status).toBe('approved');
    expect(user.createUserWithProject).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'newuser@example.com', role: { slug: 'global:member' } }),
    );
    expect(mockEnsureRequiredRoles).toHaveBeenCalled();
    expect(mockLookupAzureIdirUser).toHaveBeenCalledWith(expect.anything(), 'newuser@example.com');
    expect(mockAssignUserRole).toHaveBeenCalledWith(expect.anything(), 'newuser@idir', 'global:member');
  });
});
