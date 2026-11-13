"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UiApiService = void 0;
const ui_workflow_query_1 = require("./ui-workflow-query");
const ui_workflow_sharing_1 = require("./ui-workflow-sharing");
class UiApiService {
    queryService;
    sharingService;
    constructor(n8nRepositories) {
        this.queryService = new ui_workflow_query_1.UiWorkflowQueryService(n8nRepositories);
        this.sharingService = new ui_workflow_sharing_1.UiWorkflowSharingService(this.queryService, n8nRepositories);
    }
    async getWhoami(email) {
        return await this.queryService.getWhoami(email);
    }
    async loadUserContext(email) {
        return await this.queryService.loadUserContext(email);
    }
    async getWorkflows(email) {
        return await this.queryService.getWorkflows(email);
    }
    async shareWorkflow(email, workflowId, targetEmail) {
        return await this.sharingService.shareWorkflow(email, workflowId, targetEmail);
    }
    async unshareWorkflow(email, workflowId, projectId) {
        return await this.sharingService.unshareWorkflow(email, workflowId, projectId);
    }
    async ensureCredentialsSharedWithProject(credentialIds, projectId) {
        return await this.sharingService.ensureCredentialsSharedWithProject(credentialIds, projectId);
    }
}
exports.UiApiService = UiApiService;
