import crypto from 'node:crypto';
import { eq } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import type { N8nRepositories } from '../bootstrap/n8n-repositories';
import type { CustomRepositories } from '../bootstrap/custom-repositories';
import type { UserService } from './user';
import type { CssSsoService } from './css-sso';
import type { NodeMailerService } from './node-mailer';
import { UI_APP_BASE_URL } from '@config';
import { renderEmail } from './email-templates';
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
    private readonly nodeMailerService: NodeMailerService | null,
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

    await this.notifyAdminsOfNewRequest(input.requesterEmail, input.justification, created.createdAt);

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

    await this.notifyRequesterOfDecision(existing.requesterEmail, action, reviewerEmail, denyReason);

    return this.toListItem(updated);
  }

  async getMyAccessRequest(email: string): Promise<AccessRequestListItem | null> {
    const request = await this.customRepositories.accessRequest.getLatestByRequesterEmail(email);
    return request ? this.toListItem(request) : null;
  }

  private async applyApprovalSideEffects(requesterEmail: string): Promise<void> {
    await this.assignGlobalMemberRole(requesterEmail);

    const { user, project } = this.n8nRepositories;
    let targetUser = await user.findByEmail(requesterEmail, ['role']);

    if (!targetUser) {
      const result = await user.createUserWithProject({
        email: requesterEmail,
        firstName: '',
        lastName: '',
        password: crypto.randomBytes(32).toString('hex'),
        role: { slug: 'global:member' },
      });
      targetUser = result.user;
    } else {
      if (!targetUser.role) {
        await this.userRoleService.changeUserRole(targetUser, { newRoleName: 'global:member' });
      }
      if (targetUser.disabled) {
        await user.setUserDisabled(targetUser.id, false);
      }
    }

    // Add Unique Generated Tenant Id to Personal Project
    await this.assignTenantToPersonalProject(targetUser.id, project);
  }

  /**
   * Assigns a unique generated tenant ID to the user's personal project.
   * Skips assignment if the project already has a tenant mapping (idempotent).
   * Uses insertIgnoreConflict to handle concurrent race conditions gracefully.
   */
  private async assignTenantToPersonalProject(userId: string, projectRepo: N8nRepositories['project']): Promise<void> {
    const personalProject = await projectRepo.getPersonalProjectForUser(userId);
    if (!personalProject) {
      log.warn('No personal project found for user after approval, skipping tenant assignment', { userId });
      return;
    }

    const existingTenantId = await this.customRepositories.tenantProjectRelation.getTenantIdByProjectId(
      personalProject.id,
    );
    if (existingTenantId) {
      log.info('Personal project already has a tenant mapping, skipping', { userId, tenantId: existingTenantId });
      return;
    }

    const tenantId = crypto.randomUUID();
    await this.customRepositories.tenantProjectRelation.insertIgnoreConflict({
      tenantId,
      projectId: personalProject.id,
    });

    log.info('Assigned tenant to personal project after access request approval', {
      userId,
      projectId: personalProject.id,
      tenantId,
    });
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

  private async notifyAdminsOfNewRequest(
    requesterEmail: string,
    justification: string,
    createdAt: Date,
  ): Promise<void> {
    if (!this.nodeMailerService) {
      log.warn('Node mailer service not available, skipping admin notification');
      return;
    }

    try {
      const adminEmails = await this.n8nRepositories.user.findAdminEmails();

      if (adminEmails.length === 0) {
        log.warn('No admin users found to notify');
        return;
      }

      const reviewUrl = `${UI_APP_BASE_URL}/access-requests`;
      const html = renderEmail('accessRequestSubmitted', {
        requesterEmail,
        justification,
        createdAt: createdAt.toISOString(),
        reviewUrl,
      });

      await Promise.all(
        adminEmails.map((email) =>
          this.nodeMailerService!.sendMail({
            to: email,
            subject: 'New Access Request Submitted',
            html,
          }),
        ),
      );

      log.info('Notified admins of new access request', { adminCount: adminEmails.length });
    } catch (error) {
      log.error('Failed to notify admins of new access request', { error });
    }
  }

  private async notifyRequesterOfDecision(
    requesterEmail: string,
    action: 'approve' | 'deny',
    reviewerEmail: string,
    denyReason?: string,
  ): Promise<void> {
    if (!this.nodeMailerService) {
      log.warn('Node mailer service not available, skipping requester notification');
      return;
    }

    try {
      const html =
        action === 'approve'
          ? renderEmail('accessRequestApproved', {
              reviewerEmail,
              homeUrl: `${UI_APP_BASE_URL}/`,
            })
          : renderEmail('accessRequestDenied', {
              reviewerEmail,
              denyReason,
              accessRequestUrl: `${UI_APP_BASE_URL}/access-request`,
            });

      await this.nodeMailerService.sendMail({
        to: requesterEmail,
        subject: `Access Request ${action === 'approve' ? 'Approved' : 'Denied'}`,
        html,
      });

      log.info('Notified requester of decision', { requesterEmail, action });
    } catch (error) {
      log.error('Failed to notify requester of decision', { error, requesterEmail, action });
    }
  }
}
