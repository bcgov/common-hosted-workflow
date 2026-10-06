import { AppError } from '../utils/errors';

/** n8n `User` entity with its global role loaded — n8n's scope checks read `user.role`. */
export type N8nUserEntity = { id: string; role: { slug: string } };

export type N8nCredentialEntity = {
  id: string;
  name: string;
  type: string;
  data: string;
  isManaged?: boolean;
  shared?: Array<{ projectId: string; role: string }>;
};

export type N8nCredentialPayload = { name: string; type: string; data: Record<string, unknown> };

/** Structural slice of n8n's `CredentialsService` (packages/cli/src/credentials/credentials.service.ts). */
export type BaseN8nCredentialsService = {
  createUnmanagedCredential(
    dto: N8nCredentialPayload & { projectId: string },
    user: N8nUserEntity,
  ): Promise<{ id: string; scopes: string[] }>;
  prepareUpdateData(
    user: N8nUserEntity,
    data: N8nCredentialPayload,
    existing: N8nCredentialEntity,
  ): Promise<N8nCredentialPayload>;
  createEncryptedData(credential: { id: string | null } & N8nCredentialPayload): Promise<Record<string, unknown>>;
  update(
    credentialId: string,
    newData: Record<string, unknown>,
    decrypted?: Record<string, unknown>,
  ): Promise<N8nCredentialEntity | null>;
  decrypt(credential: N8nCredentialEntity, includeRawData?: boolean): Promise<Record<string, unknown>>;
  getCredentialScopes(user: N8nUserEntity, credentialId: string): Promise<string[]>;
};

/** Structural slice of n8n's `CredentialsFinderService`. */
export type BaseN8nCredentialsFinderService = {
  findCredentialsForUser(user: N8nUserEntity, scopes: string[]): Promise<N8nCredentialEntity[]>;
  findCredentialForUser(
    credentialId: string,
    user: N8nUserEntity,
    scopes: string[],
  ): Promise<N8nCredentialEntity | null>;
};

/** Structural slice of n8n's `ProjectService`. */
export type BaseN8nProjectService = {
  getProjectWithScope(user: N8nUserEntity, projectId: string, scopes: string[]): Promise<{ id: string } | null>;
};

/** Structural slice of n8n's `EventService` (audit log / log streaming). */
export type BaseN8nEventService = { emit(eventName: string, payload: Record<string, unknown>): void };

/**
 * Manages credentials through n8n's own services, so n8n decides who may
 * read, create and update them, redacts secrets, validates the data and emits
 * the same audit events as the n8n editor. No SQL or crypto lives here.
 */
export class N8nCredentialsService {
  constructor(
    private readonly credentials: BaseN8nCredentialsService,
    private readonly finder: BaseN8nCredentialsFinderService,
    private readonly projects: BaseN8nProjectService,
    private readonly events: BaseN8nEventService,
    /** n8n's `CREDENTIAL_BLANKING_VALUE`: a redacted secret; on update it keeps the stored value. */
    readonly blankingValue: string,
  ) {}

  async listForUser(user: N8nUserEntity, scopes: string[]): Promise<N8nCredentialEntity[]> {
    return await callN8n(() => this.finder.findCredentialsForUser(user, scopes));
  }

  async findForUser(credentialId: string, user: N8nUserEntity, scopes: string[]): Promise<N8nCredentialEntity | null> {
    return await callN8n(() => this.finder.findCredentialForUser(credentialId, user, scopes));
  }

  async canInProject(user: N8nUserEntity, projectId: string, scope: string): Promise<boolean> {
    const project = await callN8n(() => this.projects.getProjectWithScope(user, projectId, [scope]));
    return project !== null;
  }

  async create(
    user: N8nUserEntity,
    dto: N8nCredentialPayload & { projectId: string },
  ): Promise<{ id: string; scopes: string[] }> {
    const created = await callN8n(() => this.credentials.createUnmanagedCredential(dto, user));
    this.events.emit('credentials-created', {
      user,
      credentialType: dto.type,
      credentialId: created.id,
      publicApi: false,
      projectId: dto.projectId,
      isDynamic: false,
      usesExternalSecrets: false,
    });
    return { id: created.id, scopes: created.scopes };
  }

  /** Mirrors n8n's `PATCH /credentials/:id`: unredact, re-encrypt, save, emit. */
  async update(user: N8nUserEntity, existing: N8nCredentialEntity, payload: N8nCredentialPayload): Promise<void> {
    const prepared = await callN8n(() => this.credentials.prepareUpdateData(user, payload, existing));
    const encrypted = await callN8n(() =>
      this.credentials.createEncryptedData({
        id: existing.id,
        name: prepared.name,
        type: prepared.type,
        data: prepared.data,
      }),
    );
    const updated = await callN8n(() => this.credentials.update(existing.id, encrypted, prepared.data));
    if (!updated) {
      throw new AppError(404, 'CHEFS credential not found');
    }
    this.events.emit('credentials-updated', {
      user,
      credentialType: existing.type,
      credentialId: existing.id,
      isDynamic: false,
      usesExternalSecrets: false,
    });
  }

  /** Decrypts with n8n's redaction: password fields come back as `blankingValue`. */
  async decryptRedacted(credential: N8nCredentialEntity): Promise<Record<string, unknown>> {
    return await callN8n(() => this.credentials.decrypt(credential));
  }

  async scopesFor(user: N8nUserEntity, credentialId: string): Promise<string[]> {
    return await callN8n(() => this.credentials.getCredentialScopes(user, credentialId));
  }
}

/** n8n throws `ResponseError`s carrying `httpStatusCode`; keep 4xx statuses and messages. */
async function callN8n<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    const status = (err as { httpStatusCode?: unknown }).httpStatusCode;
    if (typeof status === 'number' && status >= 400 && status < 500) {
      throw new AppError(status, (err as Error).message);
    }
    throw err;
  }
}
