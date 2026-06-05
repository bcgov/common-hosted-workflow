import type { UiAuthenticatedSession } from '../../helpers/ui-oidc';

export type ResolvedActorIds = {
  primary: string; // session.email
  fallback: string; // session.subject
};

export function resolveActorIds(session: UiAuthenticatedSession): ResolvedActorIds {
  // TODO: Role-based actor matching deferred for future implementation
  return {
    primary: session.email,
    fallback: session.subject,
  };
}
