import { NodeOperationError, type IExecuteFunctions, type IDataObject } from 'n8n-workflow';
import { wilApiRequest, wilApiRequestAllItems, safeParse } from '../shared/GenericFunctions';
import type { ActionCreatePayload, ActionResponse } from '../shared/GenericFunctions';

function getOptionalParameter(ctx: IExecuteFunctions, i: number, name: string): unknown {
  try {
    return ctx.getNodeParameter(name, i, undefined);
  } catch {
    return undefined;
  }
}

function firstStringParameter(ctx: IExecuteFunctions, i: number, names: string[]): string {
  for (const name of names) {
    const value = getOptionalParameter(ctx, i, name);
    if (typeof value === 'string' && value.length > 0) return value;
  }
  return '';
}

function collectOptionLabels(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((entry) => {
        if (typeof entry === 'string') return entry;
        if (entry && typeof entry === 'object') {
          const option = entry as Record<string, unknown>;
          if (typeof option.label === 'string') return option.label;
          if (typeof option.option === 'string') return option.option;
          if (typeof option.value === 'string') return option.value;
          if (typeof option.name === 'string') return option.name;
        }
        return '';
      })
      .filter((label): label is string => label.length > 0);
  }

  if (value && typeof value === 'object') {
    const collection = value as Record<string, unknown>;
    return collectOptionLabels(collection.option ?? collection.options ?? collection.values);
  }

  return [];
}

function buildActionPayload(ctx: IExecuteFunctions, i: number, actionType: string): Record<string, unknown> {
  if (actionType === 'showform') {
    const payload: Record<string, unknown> = {
      formName: ctx.getNodeParameter('formName', i) as string,
      formId: ctx.getNodeParameter('formId', i) as string,
      formApiKey: ctx.getNodeParameter('formApiKey', i) as string,
    };

    const submissionId = ctx.getNodeParameter('submissionId', i, '') as string;
    if (submissionId) payload.submissionId = submissionId;

    const formPreFillData = safeParse(ctx.getNodeParameter('formPreFillData', i, '{}'));
    if (formPreFillData) payload.formPreFillData = formPreFillData as Record<string, unknown>;

    return payload;
  }

  if (actionType === 'getapproval') {
    const rawPayload = safeParse(getOptionalParameter(ctx, i, 'payload'));
    let approvalOptions = collectOptionLabels(getOptionalParameter(ctx, i, 'approvalOptions'));
    if (approvalOptions.length === 0) approvalOptions = collectOptionLabels(getOptionalParameter(ctx, i, 'options'));
    if (approvalOptions.length === 0)
      approvalOptions = collectOptionLabels(getOptionalParameter(ctx, i, 'waitOptions'));
    const html = firstStringParameter(ctx, i, ['approvalHtml', 'html', 'waitHtml']);
    const options = approvalOptions.length > 0 ? approvalOptions : collectOptionLabels(rawPayload?.options);
    const resolvedHtml = html || (typeof rawPayload?.html === 'string' ? rawPayload.html : '');

    if (resolvedHtml.trim().length === 0) {
      throw new NodeOperationError(ctx.getNode(), new Error('HTML is required for getapproval actions'), {
        itemIndex: i,
      });
    }

    if (options.length === 0) {
      throw new NodeOperationError(
        ctx.getNode(),
        new Error('At least one approval option is required for getapproval actions'),
        { itemIndex: i },
      );
    }

    return {
      html: resolvedHtml,
      options,
    };
  }

  const parsedPayload = safeParse(ctx.getNodeParameter('payload', i, '{}'));
  return parsedPayload ? (parsedPayload as Record<string, unknown>) : {};
}

export async function createAction(ctx: IExecuteFunctions, i: number): Promise<ActionResponse> {
  const workflow = ctx.getWorkflow();
  const executionId = ctx.getExecutionId();
  const actionType = ctx.getNodeParameter('actionType', i) as string;

  const body: ActionCreatePayload = {
    workflowInstanceId: executionId as string,
    workflowId: workflow.id as string,
    actorId: ctx.getNodeParameter('actorId', i) as string,
    actorType: ctx.getNodeParameter('actorType', i) as ActionCreatePayload['actorType'],
    actionType,
    payload: buildActionPayload(ctx, i, actionType),
  };

  const actionTitle = ctx.getNodeParameter('actionTitle', i, '') as string;
  if (actionTitle) body.actionTitle = actionTitle;

  const callbackMethod = ctx.getNodeParameter('callbackMethod', i) as ActionCreatePayload['callbackMethod'];
  if (callbackMethod && callbackMethod !== 'none') {
    body.callbackMethod = callbackMethod;
    body.callbackUrl = ctx.getNodeParameter('callbackUrl', i) as string;

    const callbackPayloadSpec = safeParse(ctx.getNodeParameter('callbackPayloadSpec', i, '{}'));
    if (callbackPayloadSpec) body.callbackPayloadSpec = callbackPayloadSpec as Record<string, unknown>;
  } else {
    body.callbackMethod = 'none';
    body.callbackUrl = '';
  }

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
