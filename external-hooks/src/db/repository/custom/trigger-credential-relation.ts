import { and, eq, inArray } from 'drizzle-orm';
import { credentialEntity, type CredentialEntityType } from '../../schema/credential-entity';
import { triggerCredentialRelation } from '../../schema/trigger-credential-relation';

export class TriggerCredentialRelationRepository {
  constructor(private readonly db: any) {}

  /** List trigger credential relations matching the provided where clauses. */
  async list(params: { where: any[]; limit?: number }): Promise<Array<typeof triggerCredentialRelation.$inferSelect>> {
    let query = this.db
      .select()
      .from(triggerCredentialRelation)
      .where(and(...params.where));

    if (params.limit !== undefined) {
      query = query.limit(params.limit);
    }

    return await query;
  }

  /** Returns one relation row for a trigger and credential pair, or null. */
  async getById(params: {
    triggerId: string;
    credentialId: string;
  }): Promise<typeof triggerCredentialRelation.$inferSelect | null> {
    const [row] = await this.db
      .select()
      .from(triggerCredentialRelation)
      .where(
        and(
          eq(triggerCredentialRelation.triggerId, params.triggerId),
          eq(triggerCredentialRelation.credentialId, params.credentialId),
        ),
      )
      .limit(1);
    return row ?? null;
  }

  /** Lists all credential relations for a trigger. */
  async listByTriggerId(triggerId: string): Promise<Array<typeof triggerCredentialRelation.$inferSelect>> {
    return await this.list({ where: [eq(triggerCredentialRelation.triggerId, triggerId)] });
  }

  /** Lists all trigger relations for a credential. */
  async listByCredentialId(credentialId: string): Promise<Array<typeof triggerCredentialRelation.$inferSelect>> {
    return await this.list({ where: [eq(triggerCredentialRelation.credentialId, credentialId)] });
  }

  /** Finds the credential linked to a trigger for a given type, or null. */
  async findLinkedCredentialByTriggerIdAndType(params: {
    triggerId: string;
    type: CredentialEntityType;
  }): Promise<typeof credentialEntity.$inferSelect | null> {
    const [row] = await this.db
      .select({ credential: credentialEntity })
      .from(triggerCredentialRelation)
      .innerJoin(credentialEntity, eq(triggerCredentialRelation.credentialId, credentialEntity.id))
      .where(and(eq(triggerCredentialRelation.triggerId, params.triggerId), eq(credentialEntity.type, params.type)))
      .limit(1);
    return row?.credential ?? null;
  }

  /** Inserts a relation row or returns the existing one for the trigger/credential pair. */
  async upsert(params: {
    triggerId: string;
    credentialId: string;
  }): Promise<typeof triggerCredentialRelation.$inferSelect> {
    const [inserted] = await this.db
      .insert(triggerCredentialRelation)
      .values(params)
      .onConflictDoNothing({
        target: [triggerCredentialRelation.triggerId, triggerCredentialRelation.credentialId],
      })
      .returning();

    if (inserted) {
      return inserted;
    }

    const existing = await this.getById(params);
    if (!existing) {
      throw new Error('Failed to upsert trigger credential relation');
    }
    return existing;
  }

  /** Deletes one relation row. Returns the deleted row or null. */
  async deleteById(params: {
    triggerId: string;
    credentialId: string;
  }): Promise<typeof triggerCredentialRelation.$inferSelect | null> {
    const [row] = await this.db
      .delete(triggerCredentialRelation)
      .where(
        and(
          eq(triggerCredentialRelation.triggerId, params.triggerId),
          eq(triggerCredentialRelation.credentialId, params.credentialId),
        ),
      )
      .returning();
    return row ?? null;
  }

  /**
   * Returns the set of trigger IDs (from the given list) that have at least one linked credential.
   * Used to determine which chefs-form triggers should show the API key placeholder in responses.
   */
  async listTriggerIdsWithCredentials(triggerIds: string[]): Promise<Set<string>> {
    if (triggerIds.length === 0) return new Set();
    const rows = await this.db
      .selectDistinct({ triggerId: triggerCredentialRelation.triggerId })
      .from(triggerCredentialRelation)
      .where(inArray(triggerCredentialRelation.triggerId, triggerIds));
    return new Set(rows.map((r: { triggerId: string }) => r.triggerId));
  }
}
