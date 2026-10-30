import { drizzle } from 'drizzle-orm/node-postgres';
import { ActionRequestRepository } from '../../db/repository/custom/action-request';
import { AccessRequestRepository } from '../../db/repository/custom/access-request';
import { AuditLogRepository } from '../../db/repository/custom/audit-log';
import { ChefsSubmissionWebhookRepository } from '../../db/repository/custom/chefs-submission-webhook';
import { MessageRepository } from '../../db/repository/custom/message';
import { MultiWebhookWaitRepository } from '../../db/repository/custom/multi-webhook-wait';
import { ProjectExecutionUsageRepository } from '../../db/repository/custom/project-execution-usage';
import { ProjectRateLimitRepository } from '../../db/repository/custom/project-rate-limit';
import { ProjectTopupRepository } from '../../db/repository/custom/project-topup';
import { TenantProjectRelationRepository } from '../../db/repository/custom/tenant-project-relation';
import { WorkflowExecutionUsageRepository } from '../../db/repository/custom/workflow-execution-usage';
import { WorkflowTriggerRepository } from '../../db/repository/custom/workflow-trigger';

export type CustomRepositories = {
  readonly tenantProjectRelation: TenantProjectRelationRepository;
  readonly message: MessageRepository;
  readonly actionRequest: ActionRequestRepository;
  readonly auditLog: AuditLogRepository;
  readonly accessRequest: AccessRequestRepository;
  readonly workflowTrigger: WorkflowTriggerRepository;
  readonly chefsSubmissionWebhook: ChefsSubmissionWebhookRepository;
  readonly multiWebhookWait: MultiWebhookWaitRepository;
  readonly projectRateLimit: ProjectRateLimitRepository;
  readonly projectExecutionUsage: ProjectExecutionUsageRepository;
  readonly workflowExecutionUsage: WorkflowExecutionUsageRepository;
  readonly projectTopup: ProjectTopupRepository;
};

export function buildCustomRepositories(databaseUrl: string): CustomRepositories {
  const db = drizzle(databaseUrl);

  return {
    tenantProjectRelation: new TenantProjectRelationRepository(db),
    message: new MessageRepository(db),
    actionRequest: new ActionRequestRepository(db),
    auditLog: new AuditLogRepository(db),
    accessRequest: new AccessRequestRepository(db),
    workflowTrigger: new WorkflowTriggerRepository(db),
    chefsSubmissionWebhook: new ChefsSubmissionWebhookRepository(db),
    multiWebhookWait: new MultiWebhookWaitRepository(db),
    projectRateLimit: new ProjectRateLimitRepository(db),
    projectExecutionUsage: new ProjectExecutionUsageRepository(db),
    workflowExecutionUsage: new WorkflowExecutionUsageRepository(db),
    projectTopup: new ProjectTopupRepository(db),
  };
}
