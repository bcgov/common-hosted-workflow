export type WorkflowNode = {
  credentials?: Record<string, { id?: string | null } | null>;
};

export interface IWorkflowBase {
  id: string;
  name: string;
  description?: string | null;
  active: boolean;
  isArchived: boolean;
  createdAt: Date;
  startedAt?: Date;
  updatedAt: Date;
  nodes: any[];
  connections: any;
  settings?: any;
  staticData?: any;
  pinData?: any;
  versionId?: string;
  activeVersionId: string | null;
  activeVersion?: any | null;
  versionCounter?: number;
  meta?: any;
  /** Optional here because IWorkflowBase is used in contexts where node groups
   * are irrelevant (executions, telemetry, tests). The DB column is NOT NULL
   * with default `[]` and `WorkflowEntity` has this as required. */
  nodeGroups?: any[];
}

/**
 * Workflow execution context service n8n passes to lifecycle hooks (the
 * third workflow.preExecute argument). Mirrors n8n's WorkflowHookContextService
 * (n8n@2.36.2 packages/cli/src/workflow-hook-context.service.ts).
 */
export interface IWorkflowExecuteContext {
  getWorkflowTags(workflowId: string): Promise<string[]>;
  resolveIsTriggerNodeType(type: string, typeVersion?: number): boolean;
}

/**
 * n8n external hook `workflow.preExecute`: fired on workflowExecuteBefore
 * with (workflow, mode, workflowContext, source) in the main process
 * (regular and queue mode), in workers and for sub-executions
 * (n8n@2.36.2 packages/cli/src/execution-lifecycle/execution-lifecycle-hooks.ts,
 * hookFunctionsExternalHooks). When a hook throws, n8n aborts the run.
 *
 * `workflow` is the executing workflow; hooks here only rely on its id.
 * `mode` holds n8n's WorkflowExecuteMode values ('trigger', 'webhook',
 * 'manual', 'internal', 'evaluation', 'eval_manual', ...) — kept a plain
 * string so the hook keeps compiling as n8n adds modes.
 */
export type WorkflowPreExecuteHook = (
  workflow: Pick<IWorkflowBase, 'id'>,
  mode: string,
  workflowContext?: IWorkflowExecuteContext,
  source?: string,
) => Promise<void>;
