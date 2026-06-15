import crypto from 'node:crypto';
import { eq } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import type { N8nRepositories } from '../bootstrap/n8n-repositories';
import type { CustomRepositories } from '../bootstrap/custom-repositories';
import type { UserService } from './user';
import type { CssSsoService } from './css-sso';
import { accessRequest, type AccessRequest } from '../../db/schema/access-request';
import { AppError } from '../utils/errors';
import { createLogger } from '../utils/logger';

const log = createLogger('AccessRequestService');

export type AccessRequestStatus = 'pending' | 'approved' | 'denied';

export interface CreateAccessRequestInput {
  requesterEmail: string;
  justification: string;
}

export interface AccessRequestListItem {
  id: string;
  requesterEmail: string;
  justification: string;
  status: AccessRequestStatus;
  reviewerEmail: string | null;
  reviewerN8nUserId: string | null;
  denyReason: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AccessRequestListResult {
  items: AccessRequestListItem[];
  total: number;
}

export interface ReviewAccessRequestInput {
  accessRequestId: string;
  action: 'approve' | 'deny';
  reviewerEmail: string;
  reviewerN8nUserId: string;
  denyReason?: string;
}

type ReviewStatusUpdateInput = {
  accessRequestId: string;
  status: AccessRequestStatus;
  reviewerEmail: string;
  reviewerN8nUserId: string;
  denyReason?: string;
};

function buildStatusFilter(status?: string): SQL[] {
  if (!status || !['pending', 'approved', 'denied'].includes(status)) return [];
  return [eq(accessRequest.status, status)];
}

function isUniqueViolation(error: unknown): error is { code: string } {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === '23505';
}

export class AccessRequestService {
  constructor(
    private readonly n8nRepositories: N8nRepositories,
    private readonly customRepositories: CustomRepositories,
    private readonly userRoleService: UserService,
    private readonly cssSsoService: CssSsoService | null,
  ) {}

  async createAccessRequest(input: CreateAccessRequestInput): Promise<AccessRequestListItem> {
    const existingPending = await this.customRepositories.accessRequest.getPendingByRequesterEmail(
      input.requesterEmail,
    );
    if (existingPending) {
      throw new AppError(409, 'You already have a pending access request.');
    }

    let created: AccessRequest;

    try {
      created = await this.customRepositories.accessRequest.create({
        requesterEmail: input.requesterEmail,
        justification: input.justification,
        status: 'pending',
        metadata: null,
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new AppError(409, 'You already have a pending access request.');
      }
      throw error;
    }

    return this.toListItem(created);
  }

  async listAccessRequests(params: {
    status?: string;
    limit?: number;
    offset?: number;
  }): Promise<AccessRequestListResult> {
    const { status, limit = 50, offset = 0 } = params;
    const where = buildStatusFilter(status);

    const [items, total] = await Promise.all([
      this.customRepositories.accessRequest.list({ where, limit, offset }),
      this.customRepositories.accessRequest.count(where),
    ]);

    return {
      items: items.map(this.toListItem),
      total,
    };
  }

  async reviewAccessRequest(input: ReviewAccessRequestInput): Promise<AccessRequestListItem> {
    const { accessRequestId, action, reviewerEmail, reviewerN8nUserId, denyReason } = input;

    const existing = await this.customRepositories.accessRequest.getById(accessRequestId);
    if (!existing) {
      throw new AppError(404, 'Access request not found.');
    }

    if (existing.status !== 'pending') {
      throw new AppError(409, `Access request is already ${existing.status}.`);
    }

    const updated = await this.claimReviewedRequest({
      accessRequestId: existing.id,
      status: action === 'approve' ? 'approved' : 'denied',
      reviewerEmail,
      reviewerN8nUserId,
      denyReason,
    });

    if (!updated) {
      throw new AppError(409, 'Access request is no longer pending.');
    }

    if (action === 'approve') {
      await this.applyApprovalSideEffects(existing.requesterEmail);
    }

    return this.toListItem(updated);
  }

  async getMyAccessRequest(email: string): Promise<AccessRequestListItem | null> {
    const request = await this.customRepositories.accessRequest.getLatestByRequesterEmail(email);
    return request ? this.toListItem(request) : null;
  }

  private async applyApprovalSideEffects(requesterEmail: string): Promise<void> {
    await this.assignGlobalMemberRole(requesterEmail);

    const { user } = this.n8nRepositories;
    const targetUser = await user.findByEmail(requesterEmail, ['role']);

    if (!targetUser) {
      await user.createUserWithProject({
        email: requesterEmail,
        firstName: '',
        lastName: '',
        password: crypto.randomBytes(32).toString('hex'),
        role: { slug: 'global:member' },
      });
    } else {
      if (!targetUser.role) {
        await this.userRoleService.changeUserRole(targetUser, { newRoleName: 'global:member' });
      }
      if (targetUser.disabled) {
        await user.setUserDisabled(targetUser.id, false);
      }
    }
  }

  private async assignGlobalMemberRole(email: string): Promise<void> {
    if (!this.cssSsoService) {
      log.warn('CSS SSO service not available, skipping role assignment', { email });
      return;
    }

    log.info('Ensuring required CSS SSO roles exist');
    await this.cssSsoService.ensureRequiredRoles();

    log.info('Looking up Azure IDIR user', { email });
    const { username } = await this.cssSsoService.lookupAzureIdirUser(email);

    log.info('Assigning global:member role to user', { username });
    await this.cssSsoService.assignUserRole(username, 'global:member');
  }

  private async claimReviewedRequest(params: ReviewStatusUpdateInput) {
    return await this.customRepositories.accessRequest.updateStatus({
      accessRequestId: params.accessRequestId,
      status: params.status,
      currentStatus: 'pending',
      reviewerEmail: params.reviewerEmail,
      reviewerN8nUserId: params.reviewerN8nUserId,
      denyReason: params.denyReason,
    });
  }

  private toListItem(row: {
    id: string;
    requesterEmail: string;
    justification: string;
    status: string;
    reviewerEmail: string | null;
    reviewerN8nUserId: string | null;
    denyReason: string | null;
    createdAt: Date;
    updatedAt: Date;
  }): AccessRequestListItem {
    return {
      id: row.id,
      requesterEmail: row.requesterEmail,
      justification: row.justification,
      status: row.status as AccessRequestStatus,
      reviewerEmail: row.reviewerEmail,
      reviewerN8nUserId: row.reviewerN8nUserId,
      denyReason: row.denyReason,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
