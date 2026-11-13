'use strict';
var __importDefault =
  (this && this.__importDefault) ||
  function (mod) {
    return mod && mod.__esModule ? mod : { default: mod };
  };
Object.defineProperty(exports, '__esModule', { value: true });
exports.AccessRequestService = void 0;
const node_crypto_1 = __importDefault(require('node:crypto'));
const drizzle_orm_1 = require('drizzle-orm');
const _config_1 = require('@config');
const email_templates_1 = require('./email-templates');
const access_request_1 = require('../../db/schema/access-request');
const errors_1 = require('../utils/errors');
const logger_1 = require('../utils/logger');
const personal_project_tenant_1 = require('./personal-project-tenant');
const log = (0, logger_1.createLogger)('AccessRequestService');
function buildStatusFilter(status) {
  if (!status || !['pending', 'approved', 'denied'].includes(status)) return [];
  return [(0, drizzle_orm_1.eq)(access_request_1.accessRequest.status, status)];
}
function buildSearchFilter(search) {
  if (!search) return [];
  const pattern = `%${search}%`;
  return [
    (0, drizzle_orm_1.or)(
      (0, drizzle_orm_1.ilike)(access_request_1.accessRequest.requesterEmail, pattern),
      (0, drizzle_orm_1.ilike)(access_request_1.accessRequest.justification, pattern),
    ),
  ];
}
function isUniqueViolation(error) {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === '23505';
}
class AccessRequestService {
  n8nRepositories;
  customRepositories;
  userRoleService;
  cssSsoService;
  nodeMailerService;
  constructor(n8nRepositories, customRepositories, userRoleService, cssSsoService, nodeMailerService) {
    this.n8nRepositories = n8nRepositories;
    this.customRepositories = customRepositories;
    this.userRoleService = userRoleService;
    this.cssSsoService = cssSsoService;
    this.nodeMailerService = nodeMailerService;
  }
  async createAccessRequest(input) {
    const existingPending = await this.customRepositories.accessRequest.getPendingByRequesterEmail(
      input.requesterEmail,
    );
    if (existingPending) {
      throw new errors_1.AppError(409, 'You already have a pending access request.');
    }
    let created;
    try {
      created = await this.customRepositories.accessRequest.create({
        requesterEmail: input.requesterEmail,
        justification: input.justification,
        status: 'pending',
        metadata: null,
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new errors_1.AppError(409, 'You already have a pending access request.');
      }
      throw error;
    }
    await this.notifyAdminsOfNewRequest(input.requesterEmail, input.justification, created.createdAt);
    return this.toListItem(created);
  }
  async listAccessRequests(params) {
    const { status, search, limit = 50, offset = 0 } = params;
    const where = [...buildStatusFilter(status), ...buildSearchFilter(search)];
    const [items, total] = await Promise.all([
      this.customRepositories.accessRequest.list({ where, limit, offset }),
      this.customRepositories.accessRequest.count(where),
    ]);
    return {
      items: items.map(this.toListItem),
      total,
    };
  }
  async reviewAccessRequest(input) {
    const { accessRequestId, action, reviewerEmail, reviewerN8nUserId, denyReason } = input;
    const existing = await this.customRepositories.accessRequest.getById(accessRequestId);
    if (!existing) {
      throw new errors_1.AppError(404, 'Access request not found.');
    }
    if (existing.status !== 'pending') {
      throw new errors_1.AppError(409, `Access request is already ${existing.status}.`);
    }
    const updated = await this.claimReviewedRequest({
      accessRequestId: existing.id,
      status: action === 'approve' ? 'approved' : 'denied',
      reviewerEmail,
      reviewerN8nUserId,
      denyReason,
    });
    if (!updated) {
      throw new errors_1.AppError(409, 'Access request is no longer pending.');
    }
    if (action === 'approve') {
      await this.applyApprovalSideEffects(existing.requesterEmail);
    }
    await this.notifyRequesterOfDecision(existing.requesterEmail, action, reviewerEmail, denyReason);
    return this.toListItem(updated);
  }
  async getMyAccessRequest(email) {
    const request = await this.customRepositories.accessRequest.getLatestByRequesterEmail(email);
    return request ? this.toListItem(request) : null;
  }
  async applyApprovalSideEffects(requesterEmail) {
    await this.assignGlobalMemberRole(requesterEmail);
    const { user, project } = this.n8nRepositories;
    let targetUser = await user.findByEmail(requesterEmail, ['role']);
    if (!targetUser) {
      const result = await user.createUserWithProject({
        email: requesterEmail,
        firstName: '',
        lastName: '',
        password: node_crypto_1.default.randomBytes(32).toString('hex'),
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
    await (0, personal_project_tenant_1.ensurePersonalProjectTenantMapping)({
      userId: targetUser.id,
      projectRepo: project,
      tenantProjectRelationRepository: this.customRepositories.tenantProjectRelation,
      reason: 'access-request-approval',
    });
  }
  async assignGlobalMemberRole(email) {
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
  async claimReviewedRequest(params) {
    return await this.customRepositories.accessRequest.updateStatus({
      accessRequestId: params.accessRequestId,
      status: params.status,
      currentStatus: 'pending',
      reviewerEmail: params.reviewerEmail,
      reviewerN8nUserId: params.reviewerN8nUserId,
      denyReason: params.denyReason,
    });
  }
  toListItem(row) {
    return {
      id: row.id,
      requesterEmail: row.requesterEmail,
      justification: row.justification,
      status: row.status,
      reviewerEmail: row.reviewerEmail,
      reviewerN8nUserId: row.reviewerN8nUserId,
      denyReason: row.denyReason,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
  async notifyAdminsOfNewRequest(requesterEmail, justification, createdAt) {
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
      const reviewUrl = `${_config_1.UI_APP_BASE_URL}/access-requests`;
      const html = (0, email_templates_1.renderEmail)('accessRequestSubmitted', {
        requesterEmail,
        justification,
        createdAt: createdAt.toISOString(),
        reviewUrl,
      });
      await Promise.all(
        adminEmails.map((email) =>
          this.nodeMailerService.sendMail({
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
  async notifyRequesterOfDecision(requesterEmail, action, reviewerEmail, denyReason) {
    if (!this.nodeMailerService) {
      log.warn('Node mailer service not available, skipping requester notification');
      return;
    }
    try {
      const html =
        action === 'approve'
          ? (0, email_templates_1.renderEmail)('accessRequestApproved', {
              reviewerEmail,
              homeUrl: `${_config_1.UI_APP_BASE_URL}/`,
            })
          : (0, email_templates_1.renderEmail)('accessRequestDenied', {
              reviewerEmail,
              denyReason,
              accessRequestUrl: `${_config_1.UI_APP_BASE_URL}/access-request`,
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
exports.AccessRequestService = AccessRequestService;
