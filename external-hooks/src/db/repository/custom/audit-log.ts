import { eq } from 'drizzle-orm';
import { auditLog } from '../../schema/workflow-interaction-layer';

export class AuditLogRepository {
  constructor(private readonly db: any) {}

  /** Deletes all audit log rows for a project. */
  async deleteByProjectId(projectId: string): Promise<void> {
    await this.db.delete(auditLog).where(eq(auditLog.projectId, projectId));
  }
}
