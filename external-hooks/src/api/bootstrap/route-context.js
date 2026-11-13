"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildRouteContext = buildRouteContext;
const middlewares_1 = require("../middlewares");
function buildRouteContext({ services, n8nRepositories, customRepositories, globalOwnerRoleSlug, globalAdminRoleSlug, }) {
    const { apiKeyAuthMiddleware, adminAuthMiddleware } = (0, middlewares_1.createAuthMiddleware)({
        userRepository: n8nRepositories.user,
        globalOwnerRoleSlug,
        globalAdminRoleSlug,
    });
    const workflowInteractionTenantMiddleware = (0, middlewares_1.createWorkflowInteractionTenantMiddleware)({
        n8nRepositories: {
            project: n8nRepositories.project,
            projectRelation: n8nRepositories.projectRelation,
        },
        customRepositories: {
            tenantProjectRelation: customRepositories.tenantProjectRelation,
        },
    });
    const internalBearerMiddleware = (0, middlewares_1.createInternalBearerMiddleware)();
    return {
        apiKeyAuthMiddleware,
        adminAuthMiddleware,
        internalBearerMiddleware,
        workflowInteractionTenantMiddleware,
        n8nRepositories,
        customRepositories,
        services,
    };
}
