import type { IExecuteFunctions, IDataObject } from 'n8n-workflow';
import { wilApiRequest, wilApiRequestAllItems, safeParse } from '../shared/GenericFunctions';
import type { MessageCreatePayload, MessageResponse } from '../shared/GenericFunctions';

export async function createMessage(ctx: IExecuteFunctions, i: number): Promise<MessageResponse> {
  const workflow = ctx.getWorkflow();
  const executionId = ctx.getExecutionId();

  const body: MessageCreatePayload = {
    workflowInstanceId: executionId as string,
    workflowId: workflow.id as string,
    actorId: ctx.getNodeParameter('actorId', i) as string,
    actorType: ctx.getNodeParameter('actorType', i) as MessageCreatePayload['actorType'],
    title: ctx.getNodeParameter('title', i) as string,
    body: ctx.getNodeParameter('body', i) as string,
  };

  const metadata = safeParse(ctx.getNodeParameter('metadata', i, '{}'));
  if (metadata) body.metadata = metadata as Record<string, unknown>;

  return wilApiRequest<MessageResponse>(ctx, 'POST', '/messages', body as unknown as IDataObject);
}

export async function listMessages(ctx: IExecuteFunctions, i: number): Promise<MessageResponse[]> {
  const query: IDataObject = {};

  const actorId = ctx.getNodeParameter('actorId', i, '') as string;
  if (actorId) query.actorId = actorId;

  const workflowInstanceId = ctx.getNodeParameter('workflowInstanceId', i, '') as string;
  if (workflowInstanceId) query.workflowInstanceId = workflowInstanceId;

  const since = ctx.getNodeParameter('since', i, '') as string;
  if (since) query.since = since;

  const returnAll = ctx.getNodeParameter('returnAll', i) as boolean;
  if (returnAll) {
    return wilApiRequestAllItems<MessageResponse>(ctx, '/messages', query);
  }

  query.limit = ctx.getNodeParameter('limit', i) as number;
  const page = await wilApiRequest<{ items: MessageResponse[]; nextCursor: string | null }>(
    ctx,
    'GET',
    '/messages',
    undefined,
    query,
  );
  return page.items;
}

export async function getMessagesByActor(ctx: IExecuteFunctions, i: number): Promise<MessageResponse[]> {
  const actorId = ctx.getNodeParameter('actorId', i) as string;
  const query: IDataObject = {};

  const since = ctx.getNodeParameter('since', i, '') as string;
  if (since) query.since = since;

  const limit = ctx.getNodeParameter('limit', i, 50) as number;
  if (limit) query.limit = limit;

  const workflowInstanceId = ctx.getNodeParameter('workflowInstanceId', i, '') as string;
  if (workflowInstanceId) query.workflowInstanceId = workflowInstanceId;

  return wilApiRequest<MessageResponse[]>(ctx, 'GET', `/actors/${actorId}/messages`, undefined, query);
}
