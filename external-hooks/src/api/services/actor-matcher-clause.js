'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.buildActorMatcherClause = buildActorMatcherClause;
const drizzle_orm_1 = require('drizzle-orm');
const errors_1 = require('../utils/errors');
/**
 * Builds an OR clause matching records by user email/subject, role names, or group names.
 * Shared by ActionService and MessageService.
 */
function buildActorMatcherClause(table, matchers) {
  const orClauses = [];
  // Match actor_type = 'user' with email or fallback subject
  const userIds = [matchers.userId];
  if (matchers.userFallback !== matchers.userId) {
    userIds.push(matchers.userFallback);
  }
  orClauses.push(
    (0, drizzle_orm_1.and)(
      (0, drizzle_orm_1.eq)(table.actorType, 'user'),
      (0, drizzle_orm_1.inArray)(table.actorId, userIds),
    ),
  );
  // Match actor_type = 'role' with any of the user's role names
  if (matchers.roleNames.length > 0) {
    orClauses.push(
      (0, drizzle_orm_1.and)(
        (0, drizzle_orm_1.eq)(table.actorType, 'role'),
        (0, drizzle_orm_1.inArray)(table.actorId, matchers.roleNames),
      ),
    );
  }
  // Match actor_type = 'group' with any of the user's group names
  if (matchers.groupNames.length > 0) {
    orClauses.push(
      (0, drizzle_orm_1.and)(
        (0, drizzle_orm_1.eq)(table.actorType, 'group'),
        (0, drizzle_orm_1.inArray)(table.actorId, matchers.groupNames),
      ),
    );
  }
  // Safety: orClauses always has at least the user clause, but guard defensively
  const result = (0, drizzle_orm_1.or)(...orClauses);
  if (!result) {
    throw new errors_1.AppError(500, 'Actor matcher clause produced no conditions');
  }
  return result;
}
