import { describe, expect, it, vi, beforeEach } from 'vitest';
import { AccessRequestService } from '../../../src/api/services/access-request';
import { AppError } from '../../../src/api/utils/errors';

function createMockCssSsoService(overrides?: {
  ensureRequiredRoles?: ReturnType<typeof vi.fn>;
  lookupAzureIdirUser?: ReturnType<typeof vi.fn>;
  assignUserRole?: ReturnType<typeof vi.fn>;
}) {
  return {
    ensureRequiredRoles: overrides?.ensureRequiredRoles ?? vi.fn().mockResolvedValue(undefined),
    lookupAzureIdirUser: overrides?.lookupAzureIdirUser ?? vi.fn().mockResolvedValue({ username: 'user@idir' }),
    assignUserRole: overrides?.assignUserRole ?? vi.fn().mockResolvedValue(undefined),
  };
}

function createService(overrides?: {
  accessRequest?: Record<string, unknown>;
  user?: Record<string, unknown>;
  project?: Record<string, unknown>;
  tenantProjectRelation?: Record<string, unknown>;
  userRoleService?: Record<string, unknown>;
  cssSsoService?: ReturnType<typeof createMockCssSsoService> | null;
  nodeMailerService?: { sender: string; sendMail: ReturnType<typeof vi.fn> } | null;
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
    createUserWithProject: vi.fn().mockResolvedValue({ user: { id: 'new-user-id', email: 'user@example.com' } }),
    setUserDisabled: vi.fn(),
    findAdminEmails: vi.fn(),
    ...overrides?.user,
  };

  const project = {
    getPersonalProjectForUser: vi.fn().mockResolvedValue({ id: 'personal-project-id' }),
    ...overrides?.project,
  };

  const tenantProjectRelation = {
    getTenantIdByProjectId: vi.fn().mockResolvedValue(null),
    insertIgnoreConflict: vi.fn().mockResolvedValue(undefined),
    ...overrides?.tenantProjectRelation,
  };

  const userRoleService = {
    changeUserRole: vi.fn(),
    ...overrides?.userRoleService,
  };

  const cssSsoService = overrides?.cssSsoService === undefined ? createMockCssSsoService() : overrides?.cssSsoService;

  const nodeMailerService =
    overrides?.nodeMailerService === undefined
      ? { sender: 'noreply@example.com', sendMail: vi.fn().mockResolvedValue(undefined) }
      : overrides?.nodeMailerService;

  return {
    accessRequest,
    user,
    project,
    tenantProjectRelation,
    userRoleService,
    cssSsoService,
    nodeMailerService,
    service: new AccessRequestService(
      { user, project } as any,
      { accessRequest, tenantProjectRelation } as any,
      userRoleService as any,
      cssSsoService as any,
      nodeMailerService as any,
    ),
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
    const mockCssSso = createMockCssSsoService({
      lookupAzureIdirUser: vi.fn().mockResolvedValue({ username: 'person@idir' }),
    });

    const { service, user, accessRequest, userRoleService } = createService({
      cssSsoService: mockCssSso,
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
    expect(mockCssSso.ensureRequiredRoles).toHaveBeenCalled();
    expect(mockCssSso.lookupAzureIdirUser).toHaveBeenCalledWith('person@example.com');
    expect(mockCssSso.assignUserRole).toHaveBeenCalledWith('person@idir', 'global:member');
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
    const mockCssSso = createMockCssSsoService();

    const { service, user, userRoleService } = createService({
      cssSsoService: mockCssSso,
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
    expect(mockCssSso.ensureRequiredRoles).not.toHaveBeenCalled();
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

  it('skips CSS SSO role assignment when service is null', async () => {
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
      cssSsoService: null,
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
    const mockCssSso = createMockCssSsoService({
      lookupAzureIdirUser: vi
        .fn()
        .mockRejectedValue(
          new Error('No Azure IDIR user found with email person@example.com (or user has no IDIR GUID)'),
        ),
    });

    const { service, user } = createService({
      cssSsoService: mockCssSso,
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
    const mockCssSso = createMockCssSsoService({
      ensureRequiredRoles: vi.fn().mockRejectedValue(new Error('CSS SSO token request failed (401): Unauthorized')),
    });

    const { service, user } = createService({
      cssSsoService: mockCssSso,
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
    const mockCssSso = createMockCssSsoService({
      lookupAzureIdirUser: vi.fn().mockResolvedValue({ username: 'person@idir' }),
      assignUserRole: vi.fn().mockRejectedValue(new Error('CSS SSO POST /users/roles failed (403): Forbidden')),
    });

    const { service, user } = createService({
      cssSsoService: mockCssSso,
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
    const mockCssSso = createMockCssSsoService({
      lookupAzureIdirUser: vi.fn().mockResolvedValue({ username: 'newuser@idir' }),
    });

    const { service, user, accessRequest } = createService({
      cssSsoService: mockCssSso,
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
    expect(mockCssSso.ensureRequiredRoles).toHaveBeenCalled();
    expect(mockCssSso.lookupAzureIdirUser).toHaveBeenCalledWith('newuser@example.com');
    expect(mockCssSso.assignUserRole).toHaveBeenCalledWith('newuser@idir', 'global:member');
  });

  it('notifies admins when access request is submitted', async () => {
    const mockSendMail = vi.fn().mockResolvedValue(undefined);

    const { service, accessRequest, user } = createService({
      nodeMailerService: { sender: 'noreply@example.com', sendMail: mockSendMail },
      user: {
        findAdminEmails: vi.fn().mockResolvedValue(['admin1@example.com', 'admin2@example.com']),
      },
      accessRequest: {
        getPendingByRequesterEmail: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({
          id: 'request-1',
          requesterEmail: 'person@example.com',
          justification: 'Need access.',
          status: 'pending',
          reviewerEmail: null,
          reviewerN8nUserId: null,
          denyReason: null,
          createdAt: new Date('2024-01-01T00:00:00.000Z'),
          updatedAt: new Date('2024-01-01T00:00:00.000Z'),
        }),
      },
    });

    await service.createAccessRequest({
      requesterEmail: 'person@example.com',
      justification: 'Need access.',
    });

    expect(mockSendMail).toHaveBeenCalledTimes(2);
    expect(mockSendMail).toHaveBeenCalledWith({
      to: 'admin1@example.com',
      subject: 'New Access Request Submitted',
      html: expect.stringContaining('person@example.com'),
    });
    expect(mockSendMail).toHaveBeenCalledWith({
      to: 'admin2@example.com',
      subject: 'New Access Request Submitted',
      html: expect.stringContaining('person@example.com'),
    });
  });

  it('notifies requester when access request is approved', async () => {
    const mockSendMail = vi.fn().mockResolvedValue(undefined);
    const existingRequest = {
      id: 'request-1',
      requesterEmail: 'person@example.com',
      justification: 'Need access.',
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

    const { service, accessRequest, user } = createService({
      nodeMailerService: { sender: 'noreply@example.com', sendMail: mockSendMail },
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

    await service.reviewAccessRequest({
      accessRequestId: 'request-1',
      action: 'approve',
      reviewerEmail: 'admin@example.com',
      reviewerN8nUserId: 'admin-1',
    });

    expect(mockSendMail).toHaveBeenCalledTimes(1);
    expect(mockSendMail).toHaveBeenCalledWith({
      to: 'person@example.com',
      subject: 'Access Request Approved',
      html: expect.stringContaining('Approved'),
    });
  });

  it('notifies requester with deny reason when access request is denied', async () => {
    const mockSendMail = vi.fn().mockResolvedValue(undefined);
    const existingRequest = {
      id: 'request-1',
      requesterEmail: 'person@example.com',
      justification: 'Need access.',
      status: 'pending',
      reviewerEmail: null,
      reviewerN8nUserId: null,
      denyReason: null,
      createdAt: new Date('2024-01-01T00:00:00.000Z'),
      updatedAt: new Date('2024-01-01T00:00:00.000Z'),
    };
    const updatedRequest = {
      ...existingRequest,
      status: 'denied',
      reviewerEmail: 'admin@example.com',
      reviewerN8nUserId: 'admin-1',
      denyReason: 'Insufficient justification.',
      updatedAt: new Date('2024-01-02T00:00:00.000Z'),
    };

    const { service, accessRequest } = createService({
      nodeMailerService: { sender: 'noreply@example.com', sendMail: mockSendMail },
      accessRequest: {
        getById: vi.fn().mockResolvedValue(existingRequest),
        updateStatus: vi.fn().mockResolvedValue(updatedRequest),
      },
    });

    await service.reviewAccessRequest({
      accessRequestId: 'request-1',
      action: 'deny',
      reviewerEmail: 'admin@example.com',
      reviewerN8nUserId: 'admin-1',
      denyReason: 'Insufficient justification.',
    });

    expect(mockSendMail).toHaveBeenCalledTimes(1);
    expect(mockSendMail).toHaveBeenCalledWith({
      to: 'person@example.com',
      subject: 'Access Request Denied',
      html: expect.stringContaining('Insufficient justification.'),
    });
  });

  it('does not throw when email notification fails', async () => {
    const mockSendMail = vi.fn().mockRejectedValue(new Error('SMTP error'));

    const { service } = createService({
      nodeMailerService: { sender: 'noreply@example.com', sendMail: mockSendMail },
      user: {
        findAdminEmails: vi.fn().mockResolvedValue(['admin@example.com']),
      },
      accessRequest: {
        getPendingByRequesterEmail: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({
          id: 'request-1',
          requesterEmail: 'person@example.com',
          justification: 'Need access.',
          status: 'pending',
          reviewerEmail: null,
          reviewerN8nUserId: null,
          denyReason: null,
          createdAt: new Date('2024-01-01T00:00:00.000Z'),
          updatedAt: new Date('2024-01-01T00:00:00.000Z'),
        }),
      },
    });

    const result = await service.createAccessRequest({
      requesterEmail: 'person@example.com',
      justification: 'Need access.',
    });

    expect(result.status).toBe('pending');
  });

  it('skips email notification when nodeMailerService is null', async () => {
    const { service } = createService({
      nodeMailerService: null,
      user: {
        findAdminEmails: vi.fn().mockResolvedValue([]),
      },
      accessRequest: {
        getPendingByRequesterEmail: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({
          id: 'request-1',
          requesterEmail: 'person@example.com',
          justification: 'Need access.',
          status: 'pending',
          reviewerEmail: null,
          reviewerN8nUserId: null,
          denyReason: null,
          createdAt: new Date('2024-01-01T00:00:00.000Z'),
          updatedAt: new Date('2024-01-01T00:00:00.000Z'),
        }),
      },
    });

    const result = await service.createAccessRequest({
      requesterEmail: 'person@example.com',
      justification: 'Need access.',
    });

    expect(result.status).toBe('pending');
  });
});
