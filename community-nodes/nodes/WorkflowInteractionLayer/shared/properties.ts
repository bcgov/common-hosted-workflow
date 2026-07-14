import type { INodeProperties } from 'n8n-workflow';

type DisplayOptions = INodeProperties['displayOptions'];

// ── Shared field factories ──

function actorIdField(displayOptions: DisplayOptions, options?: Partial<INodeProperties>): INodeProperties {
  return {
    displayName: 'Actor ID',
    name: 'actorId',
    type: 'string',
    default: '',
    required: true,
    description: 'Identifier for the target actor (max 50 characters)',
    displayOptions,
    ...options,
  };
}

function actorTypeField(displayOptions: DisplayOptions): INodeProperties {
  return {
    displayName: 'Actor Type',
    name: 'actorType',
    type: 'options',
    default: 'user',
    required: true,
    options: [
      { name: 'Group', value: 'group' },
      { name: 'Role', value: 'role' },
      { name: 'System', value: 'system' },
      { name: 'User', value: 'user' },
      { name: 'Other', value: 'other' },
    ],
    displayOptions,
  };
}

function sinceField(displayOptions: DisplayOptions, description: string): INodeProperties {
  return {
    displayName: 'Since',
    name: 'since',
    type: 'dateTime',
    default: '',
    description,
    displayOptions,
  };
}

function limitField(displayOptions: DisplayOptions): INodeProperties {
  return {
    displayName: 'Limit',
    name: 'limit',
    type: 'number',
    typeOptions: { minValue: 1, maxValue: 200 },
    default: 50,
    description: 'Max number of results to return',
    displayOptions,
  };
}

function workflowInstanceIdField(displayOptions: DisplayOptions): INodeProperties {
  return {
    displayName: 'Workflow Instance ID',
    name: 'workflowInstanceId',
    type: 'string',
    default: '',
    description: 'Filter by workflow instance ID',
    displayOptions,
  };
}

function metadataField(displayOptions: DisplayOptions): INodeProperties {
  return {
    displayName: 'Metadata',
    name: 'metadata',
    type: 'json',
    default: '{}',
    description: 'Optional JSON metadata object',
    displayOptions,
  };
}

function returnAllField(displayOptions: DisplayOptions): INodeProperties {
  return {
    displayName: 'Return All',
    name: 'returnAll',
    type: 'boolean',
    default: false,
    description: 'Whether to return all results or only up to a given limit',
    displayOptions,
  };
}

function autoFieldsNotice(name: string, displayOptions: DisplayOptions): INodeProperties {
  return {
    displayName:
      'Workflow ID and Workflow Instance ID are automatically set from the current workflow and execution context',
    name,
    type: 'notice',
    default: '',
    displayOptions,
  };
}

// ── Composed property groups ──

/** Fields shared by "getByActor" operations (message and action). */
function getByActorFields(resource: string): INodeProperties[] {
  const show = { resource: [resource], operation: ['getByActor'] };
  return [
    actorIdField({ show }, { description: `ID of the actor to retrieve ${resource}s for` }),
    sinceField({ show }, `Filter ${resource}s created after this RFC 3339 timestamp`),
    limitField({ show }),
    workflowInstanceIdField({ show }),
  ];
}

/** Fields shared by "list" operations (message and action). */
function listFields(resource: string): INodeProperties[] {
  const show = { resource: [resource], operation: ['list'] };
  const showWithLimit = { resource: [resource], operation: ['list'], returnAll: [false] };
  return [
    returnAllField({ show }),
    limitField({ show: showWithLimit }),
    actorIdField({ show }, { required: false, description: 'Filter by actor ID' }),
    workflowInstanceIdField({ show }),
    sinceField(
      { show },
      `Filter ${resource}s created after this RFC 3339 timestamp${resource === 'message' ? ' (cursor for pagination)' : ''}`,
    ),
  ];
}

// ── Exported property arrays ──

export const messageCreateProperties: INodeProperties[] = [
  autoFieldsNotice('autoFieldsNoticeMessage', { show: { resource: ['message'], operation: ['create'] } }),
  actorIdField({ show: { resource: ['message'], operation: ['create'] } }),
  actorTypeField({ show: { resource: ['message'], operation: ['create'] } }),
  {
    displayName: 'Title',
    name: 'title',
    type: 'string',
    default: '',
    required: true,
    description: 'Message title (max 255 characters)',
    displayOptions: { show: { resource: ['message'], operation: ['create'] } },
  },
  {
    displayName: 'Body',
    name: 'body',
    type: 'string',
    typeOptions: { rows: 4 },
    default: '',
    required: true,
    description: 'Message body text',
    displayOptions: { show: { resource: ['message'], operation: ['create'] } },
  },
  metadataField({ show: { resource: ['message'], operation: ['create'] } }),
];

export const messageGetByActorProperties: INodeProperties[] = getByActorFields('message');

export const messageListProperties: INodeProperties[] = listFields('message');

export const actionCreateProperties: INodeProperties[] = [
  autoFieldsNotice('autoFieldsNoticeAction', { show: { resource: ['action'], operation: ['create'] } }),
  actorIdField({ show: { resource: ['action'], operation: ['create'] } }),
  actorTypeField({ show: { resource: ['action'], operation: ['create'] } }),
  {
    displayName: 'Action Type',
    name: 'actionType',
    type: 'options',
    default: 'getapproval',
    required: true,
    options: [
      { name: 'Get Approval', value: 'getapproval' },
      { name: 'Show Form', value: 'showform' },
      { name: 'Wait on Event', value: 'waitonevent' },
    ],
    description: 'The type of action to create',
    displayOptions: { show: { resource: ['action'], operation: ['create'] } },
  },
  {
    displayName: 'Action Title',
    name: 'actionTitle',
    type: 'string',
    default: '',
    description: 'Optional title shown for this action',
    displayOptions: { show: { resource: ['action'], operation: ['create'] } },
  },
  {
    displayName: 'HTML',
    name: 'approvalHtml',
    type: 'string',
    typeOptions: { rows: 4 },
    default: '',
    required: true,
    description: 'Required HTML content shown to the user before they choose an approval option',
    displayOptions: { show: { resource: ['action'], operation: ['create'], actionType: ['getapproval'] } },
  },
  {
    displayName: 'Options (Required)',
    name: 'approvalOptions',
    type: 'fixedCollection',
    typeOptions: { multipleValues: true },
    default: {},
    required: true,
    options: [
      {
        name: 'option',
        displayName: 'Option',
        values: [
          {
            displayName: 'Label',
            name: 'label',
            type: 'string',
            default: '',
            required: true,
            description: 'Approval option label sent back when selected',
          },
        ],
      },
    ],
    description: 'Required approval options the user can choose from. Add at least one option.',
    displayOptions: { show: { resource: ['action'], operation: ['create'], actionType: ['getapproval'] } },
  },
  {
    displayName: 'CHEFS Form Name',
    name: 'formName',
    type: 'string',
    default: '',
    required: true,
    description: 'CHEFS form name shown for the form action',
    displayOptions: { show: { resource: ['action'], operation: ['create'], actionType: ['showform'] } },
  },
  {
    displayName: 'CHEFS Form ID',
    name: 'formId',
    type: 'string',
    default: '',
    required: true,
    description: 'CHEFS form ID to render',
    displayOptions: { show: { resource: ['action'], operation: ['create'], actionType: ['showform'] } },
  },
  {
    displayName: 'CHEFS Form API Key',
    name: 'formApiKey',
    type: 'string',
    typeOptions: { password: true },
    default: '',
    required: true,
    description: 'CHEFS form API key used server-side to obtain a form token',
    displayOptions: { show: { resource: ['action'], operation: ['create'], actionType: ['showform'] } },
  },
  {
    displayName: 'CHEFS Form Submission ID',
    name: 'submissionId',
    type: 'string',
    default: '',
    description:
      'Optional existing CHEFS form submission ID to load. When provided, this takes priority over Form Pre-Fill Data.',
    displayOptions: { show: { resource: ['action'], operation: ['create'], actionType: ['showform'] } },
  },
  {
    displayName: 'Form Pre-Fill Data',
    name: 'formPreFillData',
    type: 'json',
    default: '{}',
    description:
      'Optional object of CHEFS field API names and values to prefill over rendered form data. Ignored when CHEFS Form Submission ID is provided.',
    displayOptions: { show: { resource: ['action'], operation: ['create'], actionType: ['showform'] } },
  },
  {
    displayName: 'Payload',
    name: 'payload',
    type: 'json',
    default: '{}',
    required: true,
    description: 'Free-form payload for wait on event actions, for example { "eventName": "clicked" }',
    displayOptions: { show: { resource: ['action'], operation: ['create'], actionType: ['waitonevent'] } },
  },
  {
    displayName: 'Callback Method',
    name: 'callbackMethod',
    type: 'options',
    default: 'POST',
    options: [
      { name: 'None', value: 'none' },
      { name: 'POST', value: 'POST' },
      { name: 'PUT', value: 'PUT' },
      { name: 'PATCH', value: 'PATCH' },
    ],
    description: 'HTTP method for the callback. Select "None" if no callback is needed.',
    displayOptions: { show: { resource: ['action'], operation: ['create'] } },
  },
  {
    displayName: 'Callback URL',
    name: 'callbackUrl',
    type: 'string',
    default: '',
    required: true,
    description: 'URL to call when the action is completed',
    displayOptions: {
      show: { resource: ['action'], operation: ['create'], callbackMethod: ['POST', 'PUT', 'PATCH'] },
    },
  },
  {
    displayName: 'Callback Payload Spec',
    name: 'callbackPayloadSpec',
    type: 'json',
    default: '{}',
    description: 'Optional template for expected callback body',
    displayOptions: {
      show: { resource: ['action'], operation: ['create'], callbackMethod: ['POST', 'PUT', 'PATCH'] },
    },
  },
  {
    displayName: 'Due Date',
    name: 'dueDate',
    type: 'dateTime',
    default: '',
    description: 'Optional due date in RFC 3339 format',
    displayOptions: { show: { resource: ['action'], operation: ['create'] } },
  },
  {
    displayName: 'Priority',
    name: 'priority',
    type: 'options',
    default: 'normal',
    options: [
      { name: 'Critical', value: 'critical' },
      { name: 'Normal', value: 'normal' },
    ],
    displayOptions: { show: { resource: ['action'], operation: ['create'] } },
  },
  {
    displayName: 'Check In',
    name: 'checkIn',
    type: 'dateTime',
    default: '',
    description: 'Optional reminder timestamp in RFC 3339 format',
    displayOptions: { show: { resource: ['action'], operation: ['create'] } },
  },
  metadataField({ show: { resource: ['action'], operation: ['create'] } }),
];

export const actionGetProperties: INodeProperties[] = [
  {
    displayName: 'Action ID',
    name: 'actionId',
    type: 'string',
    default: '',
    required: true,
    description: 'ID of the action to retrieve',
    displayOptions: { show: { resource: ['action'], operation: ['get'] } },
  },
];

export const actionGetByActorProperties: INodeProperties[] = getByActorFields('action');

export const actionListProperties: INodeProperties[] = listFields('action');

export const actionUpdateProperties: INodeProperties[] = [
  {
    displayName: 'Action ID',
    name: 'actionId',
    type: 'string',
    default: '',
    required: true,
    description: 'ID of the action to update',
    displayOptions: { show: { resource: ['action'], operation: ['update'] } },
  },
  {
    displayName: 'Status',
    name: 'status',
    type: 'options',
    default: 'pending',
    options: [
      { name: 'Cancelled', value: 'cancelled' },
      { name: 'Completed', value: 'completed' },
      { name: 'Deleted', value: 'deleted' },
      { name: 'Expired', value: 'expired' },
      { name: 'In Progress', value: 'in_progress' },
      { name: 'Pending', value: 'pending' },
    ],
    description: 'New status for the action',
    displayOptions: { show: { resource: ['action'], operation: ['update'] } },
  },
];
