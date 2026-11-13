'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.buildN8nRuntimeContext = buildN8nRuntimeContext;
const n8n_paths_1 = require('../constants/n8n-paths');
const credential_1 = require('../../db/repository/n8n/credential');
const execution_1 = require('../../db/repository/n8n/execution');
const project_relation_1 = require('../../db/repository/n8n/project-relation');
const project_1 = require('../../db/repository/n8n/project');
const shared_credential_1 = require('../../db/repository/n8n/shared-credential');
const shared_workflow_1 = require('../../db/repository/n8n/shared-workflow');
const user_1 = require('../../db/repository/n8n/user');
const workflow_1 = require('../../db/repository/n8n/workflow');
function buildN8nRuntimeContext() {
  const { Container } = require(n8n_paths_1.N8N_DI_PATH);
  const {
    withTransaction,
    UserRepository: BaseUserRepository,
    ProjectRepository: BaseProjectRepository,
    ProjectRelationRepository: BaseProjectRelationRepository,
    WorkflowRepository: BaseWorkflowRepository,
    SharedWorkflowRepository: BaseSharedWorkflowRepository,
    CredentialsRepository: BaseCredentialsRepository,
    SharedCredentialsRepository: BaseSharedCredentialsRepository,
    ExecutionRepository: BaseExecutionRepository,
    GLOBAL_OWNER_ROLE,
    GLOBAL_ADMIN_ROLE,
  } = require(n8n_paths_1.N8N_DB_PATH);
  const raw = {
    user: Container.get(BaseUserRepository),
    project: Container.get(BaseProjectRepository),
    projectRelation: Container.get(BaseProjectRelationRepository),
    workflow: Container.get(BaseWorkflowRepository),
    sharedWorkflow: Container.get(BaseSharedWorkflowRepository),
    credential: Container.get(BaseCredentialsRepository),
    sharedCredential: Container.get(BaseSharedCredentialsRepository),
    execution: Container.get(BaseExecutionRepository),
    withTransaction,
  };
  const n8nRepositories = {
    user: new user_1.UserRepository(raw.user),
    project: new project_1.ProjectRepository(raw.project),
    projectRelation: new project_relation_1.ProjectRelationRepository(raw.projectRelation, raw.user.metadata),
    workflow: new workflow_1.WorkflowRepository(raw.workflow),
    sharedWorkflow: new shared_workflow_1.SharedWorkflowRepository(raw.sharedWorkflow, raw.workflow.metadata),
    credential: new credential_1.CredentialRepository(raw.credential),
    sharedCredential: new shared_credential_1.SharedCredentialRepository(raw.sharedCredential),
    execution: new execution_1.ExecutionRepository(raw.execution),
    withTransaction: raw.withTransaction,
    raw,
  };
  return {
    container: Container,
    n8nRepositories,
    globalOwnerRoleSlug: GLOBAL_OWNER_ROLE.slug,
    globalAdminRoleSlug: GLOBAL_ADMIN_ROLE.slug,
  };
}
