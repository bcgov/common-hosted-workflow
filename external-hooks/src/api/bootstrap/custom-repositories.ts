import { drizzle } from 'drizzle-orm/node-postgres';
import { ActionRequestRepository } from '../../db/repository/custom/action-request';
import { AccessRequestRepository } from '../../db/repository/custom/access-request';
import { AuditLogRepository } from '../../db/repository/custom/audit-log';
import { ChefsSubmissionWebhookRepository } from '../../db/repository/custom/chefs-submission-webhook';
import { MessageRepository } from '../../db/repository/custom/message';
import { MultiWebhookWaitRepository } from '../../db/repository/custom/multi-webhook-wait';
import { TenantProjectRelationRepository } from '../../db/repository/custom/tenant-project-relation';
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
  };
}
