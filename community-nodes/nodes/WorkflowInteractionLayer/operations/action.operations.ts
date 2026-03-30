import type { IExecuteFunctions, IDataObject } from 'n8n-workflow';
import { wilApiRequest, wilApiRequestAllItems, safeParse } from '../shared/GenericFunctions';
import type { ActionCreatePayload, ActionResponse } from '../shared/GenericFunctions';

export async function createAction(ctx: IExecuteFunctions, i: number): Promise<ActionResponse> {
  const workflow = ctx.getWorkflow();
  const executionId = ctx.getExecutionId();

  const body: ActionCreatePayload = {
    workflowInstanceId: executionId as string,
    workflowId: workflow.id as string,
    actorId: ctx.getNodeParameter('actorId', i) as string,
    actorType: ctx.getNodeParameter('actorType', i) as ActionCreatePayload['actorType'],
    actionType: ctx.getNodeParameter('actionType', i) as string,
    callbackUrl: ctx.getNodeParameter('callbackUrl', i) as string,
    payload: {},
  };

  const parsedPayload = safeParse(ctx.getNodeParameter('payload', i, '{}'));
  if (parsedPayload) body.payload = parsedPayload as Record<string, unknown>;

  const callbackMethod = ctx.getNodeParameter('callbackMethod', i) as ActionCreatePayload['callbackMethod'];
  if (callbackMethod) body.callbackMethod = callbackMethod;

  const callbackPayloadSpec = safeParse(ctx.getNodeParameter('callbackPayloadSpec', i, '{}'));
  if (callbackPayloadSpec) body.callbackPayloadSpec = callbackPayloadSpec as Record<string, unknown>;

  const dueDate = ctx.getNodeParameter('dueDate', i, '') as string;
  if (dueDate) body.dueDate = dueDate;

  const priority = ctx.getNodeParameter('priority', i, 'normal') as ActionCreatePayload['priority'];
  if (priority) body.priority = priority;

  const checkIn = ctx.getNodeParameter('checkIn', i, '') as string;
  if (checkIn) body.checkIn = checkIn;

  const metadata = safeParse(ctx.getNodeParameter('metadata', i, '{}'));
  if (metadata) body.metadata = metadata as Record<string, unknown>;

  return wilApiRequest<ActionResponse>(ctx, 'POST', '/actions', body as unknown as IDataObject);
}

export async function getAction(ctx: IExecuteFunctions, i: number): Promise<ActionResponse> {
  const actionId = ctx.getNodeParameter('actionId', i) as string;
  return wilApiRequest<ActionResponse>(ctx, 'GET', `/actions/${actionId}`);
}

export async function getActionsByActor(ctx: IExecuteFunctions, i: number): Promise<ActionResponse[]> {
  const actorId = ctx.getNodeParameter('actorId', i) as string;
  const query: IDataObject = {};

  const since = ctx.getNodeParameter('since', i, '') as string;
  if (since) query.since = since;

  const limit = ctx.getNodeParameter('limit', i, 50) as number;
  if (limit) query.limit = limit;

  const workflowInstanceId = ctx.getNodeParameter('workflowInstanceId', i, '') as string;
  if (workflowInstanceId) query.workflowInstanceId = workflowInstanceId;

  return wilApiRequest<ActionResponse[]>(ctx, 'GET', `/actors/${actorId}/actions`, undefined, query);
}

export async function listActions(ctx: IExecuteFunctions, i: number): Promise<ActionResponse[]> {
  const query: IDataObject = {};

  const actorId = ctx.getNodeParameter('actorId', i, '') as string;
  if (actorId) query.actorId = actorId;

  const workflowInstanceId = ctx.getNodeParameter('workflowInstanceId', i, '') as string;
  if (workflowInstanceId) query.workflowInstanceId = workflowInstanceId;

  const since = ctx.getNodeParameter('since', i, '') as string;
  if (since) query.since = since;

  const returnAll = ctx.getNodeParameter('returnAll', i) as boolean;
  if (returnAll) {
    return wilApiRequestAllItems<ActionResponse>(ctx, '/actions', query);
  }

  query.limit = ctx.getNodeParameter('limit', i) as number;
  const page = await wilApiRequest<{ items: ActionResponse[]; nextCursor: string | null }>(
    ctx,
    'GET',
    '/actions',
    undefined,
    query,
  );
  return page.items;
}

export async function updateAction(ctx: IExecuteFunctions, i: number): Promise<ActionResponse> {
  const actionId = ctx.getNodeParameter('actionId', i) as string;
  const body: IDataObject = {
    status: ctx.getNodeParameter('status', i) as string,
  };
  return wilApiRequest<ActionResponse>(ctx, 'PATCH', `/actions/${actionId}`, body);
}
