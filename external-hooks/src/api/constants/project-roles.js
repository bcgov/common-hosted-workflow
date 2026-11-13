"use strict";
/**
 * n8n project role slugs used for tenant-project synchronization.
 *
 * These match the CSTAR shared service role names exactly and correspond
 * to n8n's assignable team project roles.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.MANAGED_PROJECT_ROLES = exports.PROJECT_ROLE_PERSONAL_OWNER = exports.PROJECT_ROLE_ADMIN = exports.PROJECT_ROLE_VIEWER = exports.PROJECT_ROLE_EDITOR = void 0;
exports.isManagedProjectRole = isManagedProjectRole;
exports.PROJECT_ROLE_EDITOR = 'project:editor';
exports.PROJECT_ROLE_VIEWER = 'project:viewer';
exports.PROJECT_ROLE_ADMIN = 'project:admin';
/**
 * n8n's implicit role for a personal project's owner — never assigned by the
 * sync process, but stored on the project relation, so it can show up when
 * reading a viewer's membership.
 */
exports.PROJECT_ROLE_PERSONAL_OWNER = 'project:personalOwner';
/** Roles that can be assigned/managed by the tenant project sync process. */
exports.MANAGED_PROJECT_ROLES = [exports.PROJECT_ROLE_EDITOR, exports.PROJECT_ROLE_VIEWER];
function isManagedProjectRole(name) {
    return exports.MANAGED_PROJECT_ROLES.includes(name);
}
