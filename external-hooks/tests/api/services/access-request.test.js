'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
const vitest_1 = require('vitest');
const access_request_1 = require('../../../src/api/services/access-request');
function createMockCssSsoService(overrides) {
  return {
    ensureRequiredRoles: overrides?.ensureRequiredRoles ?? vitest_1.vi.fn().mockResolvedValue(undefined),
    lookupAzureIdirUser:
      overrides?.lookupAzureIdirUser ?? vitest_1.vi.fn().mockResolvedValue({ username: 'user@idir' }),
    assignUserRole: overrides?.assignUserRole ?? vitest_1.vi.fn().mockResolvedValue(undefined),
  };
}
function createService(overrides) {
  const accessRequest = {
    getPendingByRequesterEmail: vitest_1.vi.fn(),
    getLatestByRequesterEmail: vitest_1.vi.fn(),
    create: vitest_1.vi.fn(),
    list: vitest_1.vi.fn(),
    count: vitest_1.vi.fn(),
    getById: vitest_1.vi.fn(),
    updateStatus: vitest_1.vi.fn(),
    ...overrides?.accessRequest,
  };
  const user = {
    findByEmail: vitest_1.vi.fn(),
    createUserWithProject: vitest_1.vi
      .fn()
      .mockResolvedValue({ user: { id: 'new-user-id', email: 'user@example.com' } }),
    setUserDisabled: vitest_1.vi.fn(),
    findAdminEmails: vitest_1.vi.fn(),
    ...overrides?.user,
  };
  const project = {
    getPersonalProjectForUser: vitest_1.vi.fn().mockResolvedValue({ id: 'personal-project-id' }),
    ...overrides?.project,
  };
  const tenantProjectRelation = {
    getTenantIdByProjectId: vitest_1.vi.fn().mockResolvedValue(null),
    insertIgnoreConflict: vitest_1.vi.fn().mockResolvedValue(undefined),
    ...overrides?.tenantProjectRelation,
  };
  const userRoleService = {
    changeUserRole: vitest_1.vi.fn(),
    ...overrides?.userRoleService,
  };
  const cssSsoService = overrides?.cssSsoService === undefined ? createMockCssSsoService() : overrides?.cssSsoService;
  const nodeMailerService =
    overrides?.nodeMailerService === undefined
      ? { sender: 'noreply@example.com', sendMail: vitest_1.vi.fn().mockResolvedValue(undefined) }
      : overrides?.nodeMailerService;
  return {
    accessRequest,
    user,
    project,
    tenantProjectRelation,
    userRoleService,
    cssSsoService,
    nodeMailerService,
    service: new access_request_1.AccessRequestService(
      { user, project },
      { accessRequest, tenantProjectRelation },
      userRoleService,
      cssSsoService,
      nodeMailerService,
    ),
  };
}
(0, vitest_1.describe)('AccessRequestService', () => {
  (0, vitest_1.it)('returns the latest request for the requester, even when reviewed', async () => {
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
        getLatestByRequesterEmail: vitest_1.vi.fn().mockResolvedValue(latestRequest),
      },
    });
    const result = await service.getMyAccessRequest('person@example.com');
    (0, vitest_1.expect)(accessRequest.getLatestByRequesterEmail).toHaveBeenCalledWith('person@example.com');
    (0, vitest_1.expect)(result?.status).toBe('denied');
    (0, vitest_1.expect)(result?.denyReason).toBe('Needs more detail.');
  });
  (0, vitest_1.it)('maps duplicate pending-request inserts to a conflict error', async () => {
    const { service } = createService({
      accessRequest: {
        getPendingByRequesterEmail: vitest_1.vi.fn().mockResolvedValue(null),
        create: vitest_1.vi.fn().mockRejectedValue({ code: '23505' }),
      },
    });
    await (0, vitest_1.expect)(
      service.createAccessRequest({
        requesterEmail: 'person@example.com',
        justification: 'Need access to manage workflows.',
      }),
    ).rejects.toMatchObject({
      statusCode: 409,
      message: 'You already have a pending access request.',
    });
  });
  (0, vitest_1.it)('re-enables an existing disabled user on approval', async () => {
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
      lookupAzureIdirUser: vitest_1.vi.fn().mockResolvedValue({ username: 'person@idir' }),
    });
    const { service, user, accessRequest, userRoleService } = createService({
      cssSsoService: mockCssSso,
      accessRequest: {
        getById: vitest_1.vi.fn().mockResolvedValue(existingRequest),
        updateStatus: vitest_1.vi.fn().mockResolvedValue(updatedRequest),
      },
      user: {
        findByEmail: vitest_1.vi.fn().mockResolvedValue({
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
    (0, vitest_1.expect)(user.setUserDisabled).toHaveBeenCalledWith('user-1', false);
    (0, vitest_1.expect)(userRoleService.changeUserRole).not.toHaveBeenCalled();
    (0, vitest_1.expect)(accessRequest.updateStatus).toHaveBeenCalledWith(
      vitest_1.expect.objectContaining({ accessRequestId: 'request-1', status: 'approved', currentStatus: 'pending' }),
    );
    (0, vitest_1.expect)(result.status).toBe('approved');
    (0, vitest_1.expect)(mockCssSso.ensureRequiredRoles).toHaveBeenCalled();
    (0, vitest_1.expect)(mockCssSso.lookupAzureIdirUser).toHaveBeenCalledWith('person@example.com');
    (0, vitest_1.expect)(mockCssSso.assignUserRole).toHaveBeenCalledWith('person@idir', 'global:member');
  });
  (0, vitest_1.it)('does not mutate user access when another review wins the race', async () => {
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
        getById: vitest_1.vi.fn().mockResolvedValue(existingRequest),
        updateStatus: vitest_1.vi.fn().mockResolvedValue(null),
      },
      user: {
        findByEmail: vitest_1.vi.fn().mockResolvedValue({
          id: 'user-1',
          email: 'person@example.com',
          disabled: true,
          role: null,
        }),
      },
    });
    await (0, vitest_1.expect)(
      service.reviewAccessRequest({
        accessRequestId: 'request-1',
        action: 'approve',
        reviewerEmail: 'admin@example.com',
        reviewerN8nUserId: 'admin-1',
      }),
    ).rejects.toMatchObject({
      statusCode: 409,
      message: 'Access request is no longer pending.',
    });
    (0, vitest_1.expect)(user.findByEmail).not.toHaveBeenCalled();
    (0, vitest_1.expect)(user.setUserDisabled).not.toHaveBeenCalled();
    (0, vitest_1.expect)(userRoleService.changeUserRole).not.toHaveBeenCalled();
    (0, vitest_1.expect)(mockCssSso.ensureRequiredRoles).not.toHaveBeenCalled();
  });
  (0, vitest_1.it)('returns a conflict when the request stops being pending during review', async () => {
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
        getById: vitest_1.vi.fn().mockResolvedValue(existingRequest),
        updateStatus: vitest_1.vi.fn().mockResolvedValue(null),
      },
      user: {
        findByEmail: vitest_1.vi.fn().mockResolvedValue({
          id: 'user-1',
          email: 'person@example.com',
          disabled: false,
          role: { slug: 'global:member' },
        }),
      },
    });
    await (0, vitest_1.expect)(
      service.reviewAccessRequest({
        accessRequestId: 'request-1',
        action: 'approve',
        reviewerEmail: 'admin@example.com',
        reviewerN8nUserId: 'admin-1',
      }),
    ).rejects.toMatchObject({
      statusCode: 409,
      message: 'Access request is no longer pending.',
    });
  });
  (0, vitest_1.it)('skips CSS SSO role assignment when service is null', async () => {
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
        getById: vitest_1.vi.fn().mockResolvedValue(existingRequest),
        updateStatus: vitest_1.vi.fn().mockResolvedValue(updatedRequest),
      },
      user: {
        findByEmail: vitest_1.vi.fn().mockResolvedValue({
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
    (0, vitest_1.expect)(result.status).toBe('approved');
  });
  (0, vitest_1.it)('throws when Azure IDIR user is not found', async () => {
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
      lookupAzureIdirUser: vitest_1.vi
        .fn()
        .mockRejectedValue(
          new Error('No Azure IDIR user found with email person@example.com (or user has no IDIR GUID)'),
        ),
    });
    const { service, user } = createService({
      cssSsoService: mockCssSso,
      accessRequest: {
        getById: vitest_1.vi.fn().mockResolvedValue(existingRequest),
        updateStatus: vitest_1.vi.fn().mockResolvedValue(updatedRequest),
      },
      user: {
        findByEmail: vitest_1.vi.fn().mockResolvedValue({
          id: 'user-1',
          email: 'person@example.com',
          disabled: false,
          role: { slug: 'global:member' },
        }),
      },
    });
    await (0, vitest_1.expect)(
      service.reviewAccessRequest({
        accessRequestId: 'request-1',
        action: 'approve',
        reviewerEmail: 'admin@example.com',
        reviewerN8nUserId: 'admin-1',
      }),
    ).rejects.toThrow('No Azure IDIR user found with email person@example.com (or user has no IDIR GUID)');
  });
  (0, vitest_1.it)('throws when ensureRequiredRoles fails', async () => {
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
      ensureRequiredRoles: vitest_1.vi
        .fn()
        .mockRejectedValue(new Error('CSS SSO token request failed (401): Unauthorized')),
    });
    const { service, user } = createService({
      cssSsoService: mockCssSso,
      accessRequest: {
        getById: vitest_1.vi.fn().mockResolvedValue(existingRequest),
        updateStatus: vitest_1.vi.fn().mockResolvedValue(updatedRequest),
      },
      user: {
        findByEmail: vitest_1.vi.fn().mockResolvedValue({
          id: 'user-1',
          email: 'person@example.com',
          disabled: false,
          role: { slug: 'global:member' },
        }),
      },
    });
    await (0, vitest_1.expect)(
      service.reviewAccessRequest({
        accessRequestId: 'request-1',
        action: 'approve',
        reviewerEmail: 'admin@example.com',
        reviewerN8nUserId: 'admin-1',
      }),
    ).rejects.toThrow('CSS SSO token request failed (401): Unauthorized');
  });
  (0, vitest_1.it)('throws when assignUserRole fails', async () => {
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
      lookupAzureIdirUser: vitest_1.vi.fn().mockResolvedValue({ username: 'person@idir' }),
      assignUserRole: vitest_1.vi
        .fn()
        .mockRejectedValue(new Error('CSS SSO POST /users/roles failed (403): Forbidden')),
    });
    const { service, user } = createService({
      cssSsoService: mockCssSso,
      accessRequest: {
        getById: vitest_1.vi.fn().mockResolvedValue(existingRequest),
        updateStatus: vitest_1.vi.fn().mockResolvedValue(updatedRequest),
      },
      user: {
        findByEmail: vitest_1.vi.fn().mockResolvedValue({
          id: 'user-1',
          email: 'person@example.com',
          disabled: false,
          role: { slug: 'global:member' },
        }),
      },
    });
    await (0, vitest_1.expect)(
      service.reviewAccessRequest({
        accessRequestId: 'request-1',
        action: 'approve',
        reviewerEmail: 'admin@example.com',
        reviewerN8nUserId: 'admin-1',
      }),
    ).rejects.toThrow('CSS SSO POST /users/roles failed (403): Forbidden');
  });
  (0, vitest_1.it)('creates new user and assigns CSS SSO role on approval', async () => {
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
      lookupAzureIdirUser: vitest_1.vi.fn().mockResolvedValue({ username: 'newuser@idir' }),
    });
    const { service, user, accessRequest } = createService({
      cssSsoService: mockCssSso,
      accessRequest: {
        getById: vitest_1.vi.fn().mockResolvedValue(existingRequest),
        updateStatus: vitest_1.vi.fn().mockResolvedValue(updatedRequest),
      },
      user: {
        findByEmail: vitest_1.vi.fn().mockResolvedValue(null),
      },
    });
    const result = await service.reviewAccessRequest({
      accessRequestId: 'request-1',
      action: 'approve',
      reviewerEmail: 'admin@example.com',
      reviewerN8nUserId: 'admin-1',
    });
    (0, vitest_1.expect)(result.status).toBe('approved');
    (0, vitest_1.expect)(user.createUserWithProject).toHaveBeenCalledWith(
      vitest_1.expect.objectContaining({ email: 'newuser@example.com', role: { slug: 'global:member' } }),
    );
    (0, vitest_1.expect)(mockCssSso.ensureRequiredRoles).toHaveBeenCalled();
    (0, vitest_1.expect)(mockCssSso.lookupAzureIdirUser).toHaveBeenCalledWith('newuser@example.com');
    (0, vitest_1.expect)(mockCssSso.assignUserRole).toHaveBeenCalledWith('newuser@idir', 'global:member');
  });
  (0, vitest_1.it)('notifies admins when access request is submitted', async () => {
    const mockSendMail = vitest_1.vi.fn().mockResolvedValue(undefined);
    const { service, accessRequest, user } = createService({
      nodeMailerService: { sender: 'noreply@example.com', sendMail: mockSendMail },
      user: {
        findAdminEmails: vitest_1.vi.fn().mockResolvedValue(['admin1@example.com', 'admin2@example.com']),
      },
      accessRequest: {
        getPendingByRequesterEmail: vitest_1.vi.fn().mockResolvedValue(null),
        create: vitest_1.vi.fn().mockResolvedValue({
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
    (0, vitest_1.expect)(mockSendMail).toHaveBeenCalledTimes(2);
    (0, vitest_1.expect)(mockSendMail).toHaveBeenCalledWith({
      to: 'admin1@example.com',
      subject: 'New Access Request Submitted',
      html: vitest_1.expect.stringContaining('person@example.com'),
    });
    (0, vitest_1.expect)(mockSendMail).toHaveBeenCalledWith({
      to: 'admin2@example.com',
      subject: 'New Access Request Submitted',
      html: vitest_1.expect.stringContaining('person@example.com'),
    });
  });
  (0, vitest_1.it)('notifies requester when access request is approved', async () => {
    const mockSendMail = vitest_1.vi.fn().mockResolvedValue(undefined);
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
        getById: vitest_1.vi.fn().mockResolvedValue(existingRequest),
        updateStatus: vitest_1.vi.fn().mockResolvedValue(updatedRequest),
      },
      user: {
        findByEmail: vitest_1.vi.fn().mockResolvedValue({
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
    (0, vitest_1.expect)(mockSendMail).toHaveBeenCalledTimes(1);
    (0, vitest_1.expect)(mockSendMail).toHaveBeenCalledWith({
      to: 'person@example.com',
      subject: 'Access Request Approved',
      html: vitest_1.expect.stringContaining('Approved'),
    });
  });
  (0, vitest_1.it)('notifies requester with deny reason when access request is denied', async () => {
    const mockSendMail = vitest_1.vi.fn().mockResolvedValue(undefined);
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
        getById: vitest_1.vi.fn().mockResolvedValue(existingRequest),
        updateStatus: vitest_1.vi.fn().mockResolvedValue(updatedRequest),
      },
    });
    await service.reviewAccessRequest({
      accessRequestId: 'request-1',
      action: 'deny',
      reviewerEmail: 'admin@example.com',
      reviewerN8nUserId: 'admin-1',
      denyReason: 'Insufficient justification.',
    });
    (0, vitest_1.expect)(mockSendMail).toHaveBeenCalledTimes(1);
    (0, vitest_1.expect)(mockSendMail).toHaveBeenCalledWith({
      to: 'person@example.com',
      subject: 'Access Request Denied',
      html: vitest_1.expect.stringContaining('Insufficient justification.'),
    });
  });
  (0, vitest_1.it)('does not throw when email notification fails', async () => {
    const mockSendMail = vitest_1.vi.fn().mockRejectedValue(new Error('SMTP error'));
    const { service } = createService({
      nodeMailerService: { sender: 'noreply@example.com', sendMail: mockSendMail },
      user: {
        findAdminEmails: vitest_1.vi.fn().mockResolvedValue(['admin@example.com']),
      },
      accessRequest: {
        getPendingByRequesterEmail: vitest_1.vi.fn().mockResolvedValue(null),
        create: vitest_1.vi.fn().mockResolvedValue({
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
    (0, vitest_1.expect)(result.status).toBe('pending');
  });
  (0, vitest_1.it)('skips email notification when nodeMailerService is null', async () => {
    const { service } = createService({
      nodeMailerService: null,
      user: {
        findAdminEmails: vitest_1.vi.fn().mockResolvedValue([]),
      },
      accessRequest: {
        getPendingByRequesterEmail: vitest_1.vi.fn().mockResolvedValue(null),
        create: vitest_1.vi.fn().mockResolvedValue({
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
    (0, vitest_1.expect)(result.status).toBe('pending');
  });
});
