export interface MessageCreatePayload {
  workflowInstanceId: string;
  actorId: string;
  actorType: 'user' | 'group' | 'role' | 'system' | 'other';
  title: string;
  body: string;
  workflowId: string;
  metadata?: Record<string, unknown>;
}

export interface MessageResponse {
  id: string;
  title: string;
  body: string;
  actorId: string;
  actorType: string;
  workflowInstanceId: string;
  workflowId: string | null;
  status: 'active' | 'read';
  createdAt: string;
  updatedAt: string;
  metadata: Record<string, unknown> | null;
}

export interface ActionCreatePayload {
  workflowInstanceId: string;
  actorId: string;
  actorType: 'user' | 'group' | 'role' | 'system' | 'other';
  actionType: string;
  payload: Record<string, unknown>;
  callbackUrl: string;
  callbackMethod?: 'POST' | 'PUT' | 'PATCH';
  callbackPayloadSpec?: Record<string, unknown>;
  workflowId: string;
  dueDate?: string;
  priority?: 'critical' | 'normal';
  checkIn?: string;
  metadata?: Record<string, unknown>;
}

export interface ActionResponse {
  id: string;
  actionType: string;
  payload: Record<string, unknown>;
  callbackUrl: string;
  callbackMethod: string;
  callbackPayloadSpec: Record<string, unknown> | null;
  actorId: string;
  actorType: string;
  workflowInstanceId: string;
  workflowId: string | null;
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled' | 'expired' | 'deleted';
  priority: 'critical' | 'normal';
  dueDate: string | null;
  checkIn: string | null;
  createdAt: string;
  updatedAt: string;
  metadata: Record<string, unknown> | null;
}
