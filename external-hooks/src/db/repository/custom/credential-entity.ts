import { and, desc, eq } from 'drizzle-orm';
import { credentialEntity, type CredentialEntityType } from '../../schema/credential-entity';

export type CredentialPayload =
  | { kind: 'chefs_api_key'; apiKey: string }
  | { kind: 'webhook_auth_header'; headerName: string; headerValue: string };

export class CredentialEntityRepository {
  constructor(private readonly db: any) {}

  /** List credential entities matching the provided where clauses. */
  async list(params: { where: any[]; limit: number }): Promise<Array<typeof credentialEntity.$inferSelect>> {
    return await this.db
      .select()
      .from(credentialEntity)
      .where(and(...params.where))
      .orderBy(desc(credentialEntity.createdAt), desc(credentialEntity.id))
      .limit(params.limit);
  }

  /** Returns one credential entity by id, optionally scoped by where clauses. */
  async getById(params: { credentialId: string; where?: any[] }): Promise<typeof credentialEntity.$inferSelect | null> {
    const clauses = [eq(credentialEntity.id, params.credentialId), ...(params.where ?? [])];
    const [row] = await this.db
      .select()
      .from(credentialEntity)
      .where(and(...clauses))
      .limit(1);
    return row ?? null;
  }

  /** Inserts a new row, or updates an existing row when id is provided. */
  async upsert(input: {
    id?: string;
    name: string;
    type: CredentialEntityType;
    data: string;
    keyVersion?: number;
  }): Promise<typeof credentialEntity.$inferSelect> {
    const now = new Date();
    const keyVersion = input.keyVersion ?? 1;

    if (input.id) {
      const [row] = await this.db
        .insert(credentialEntity)
        .values({
          id: input.id,
          name: input.name,
          type: input.type,
          data: input.data,
          keyVersion,
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: credentialEntity.id,
          set: {
            name: input.name,
            type: input.type,
            data: input.data,
            keyVersion,
            updatedAt: now,
          },
        })
        .returning();
      return row;
    }

    const [row] = await this.db
      .insert(credentialEntity)
      .values({
        name: input.name,
        type: input.type,
        data: input.data,
        keyVersion,
        createdAt: now,
        updatedAt: now,
      })
      .returning();
    return row;
  }

  /** Deletes one credential entity by id. Returns the deleted row or null. */
  async deleteById(params: {
    credentialId: string;
    where?: any[];
  }): Promise<typeof credentialEntity.$inferSelect | null> {
    const clauses = [eq(credentialEntity.id, params.credentialId), ...(params.where ?? [])];
    const [row] = await this.db
      .delete(credentialEntity)
      .where(and(...clauses))
      .returning();
    return row ?? null;
  }
}
