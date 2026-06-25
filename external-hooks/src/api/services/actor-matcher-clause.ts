import { and, eq, inArray, or, SQL } from 'drizzle-orm';
import type { PgColumn } from 'drizzle-orm/pg-core';
import type { ActorMatchers } from '../types/actor-matchers';
import { AppError } from '../utils/errors';

type ActorColumns = {
  actorType: PgColumn;
  actorId: PgColumn;
};

/**
 * Builds an OR clause matching records by user email/subject, role names, or group names.
 * Shared by ActionService and MessageService.
 */
export function buildActorMatcherClause(table: ActorColumns, matchers: ActorMatchers): SQL {
  const orClauses: SQL[] = [];

  // Match actor_type = 'user' with email or fallback subject
  const userIds = [matchers.userId];
  if (matchers.userFallback !== matchers.userId) {
    userIds.push(matchers.userFallback);
  }
  orClauses.push(and(eq(table.actorType, 'user'), inArray(table.actorId, userIds))!);

  // Match actor_type = 'role' with any of the user's role names
  if (matchers.roleNames.length > 0) {
    orClauses.push(and(eq(table.actorType, 'role'), inArray(table.actorId, matchers.roleNames))!);
  }

  // Match actor_type = 'group' with any of the user's group names
  if (matchers.groupNames.length > 0) {
    orClauses.push(and(eq(table.actorType, 'group'), inArray(table.actorId, matchers.groupNames))!);
  }

  // Safety: orClauses always has at least the user clause, but guard defensively
  const result = or(...orClauses);
  if (!result) {
    throw new AppError(500, 'Actor matcher clause produced no conditions');
  }
  return result;
}
