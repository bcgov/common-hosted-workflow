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
