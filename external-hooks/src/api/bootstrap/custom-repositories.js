'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.buildCustomRepositories = buildCustomRepositories;
const node_postgres_1 = require('drizzle-orm/node-postgres');
const action_request_1 = require('../../db/repository/custom/action-request');
const access_request_1 = require('../../db/repository/custom/access-request');
const audit_log_1 = require('../../db/repository/custom/audit-log');
const chefs_submission_webhook_1 = require('../../db/repository/custom/chefs-submission-webhook');
const message_1 = require('../../db/repository/custom/message');
const multi_webhook_wait_1 = require('../../db/repository/custom/multi-webhook-wait');
const project_execution_usage_1 = require('../../db/repository/custom/project-execution-usage');
const project_rate_limit_1 = require('../../db/repository/custom/project-rate-limit');
const project_rate_limit_default_1 = require('../../db/repository/custom/project-rate-limit-default');
const project_topup_1 = require('../../db/repository/custom/project-topup');
const rate_limit_notification_1 = require('../../db/repository/custom/rate-limit-notification');
const rate_limit_request_1 = require('../../db/repository/custom/rate-limit-request');
const tenant_project_relation_1 = require('../../db/repository/custom/tenant-project-relation');
const workflow_execution_usage_1 = require('../../db/repository/custom/workflow-execution-usage');
const workflow_trigger_1 = require('../../db/repository/custom/workflow-trigger');
function buildCustomRepositories(databaseUrl) {
  const db = (0, node_postgres_1.drizzle)(databaseUrl);
  return {
    tenantProjectRelation: new tenant_project_relation_1.TenantProjectRelationRepository(db),
    message: new message_1.MessageRepository(db),
    actionRequest: new action_request_1.ActionRequestRepository(db),
    auditLog: new audit_log_1.AuditLogRepository(db),
    accessRequest: new access_request_1.AccessRequestRepository(db),
    workflowTrigger: new workflow_trigger_1.WorkflowTriggerRepository(db),
    chefsSubmissionWebhook: new chefs_submission_webhook_1.ChefsSubmissionWebhookRepository(db),
    multiWebhookWait: new multi_webhook_wait_1.MultiWebhookWaitRepository(db),
    projectRateLimit: new project_rate_limit_1.ProjectRateLimitRepository(db),
    projectRateLimitDefault: new project_rate_limit_default_1.ProjectRateLimitDefaultRepository(db),
    projectExecutionUsage: new project_execution_usage_1.ProjectExecutionUsageRepository(db),
    workflowExecutionUsage: new workflow_execution_usage_1.WorkflowExecutionUsageRepository(db),
    projectTopup: new project_topup_1.ProjectTopupRepository(db),
    rateLimitNotification: new rate_limit_notification_1.RateLimitNotificationRepository(db),
    rateLimitRequest: new rate_limit_request_1.RateLimitRequestRepository(db),
  };
}
