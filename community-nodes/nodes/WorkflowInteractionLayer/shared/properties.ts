import type { INodeProperties } from 'n8n-workflow';

type DisplayOptions = INodeProperties['displayOptions'];

/** Operations that create an action and share the same payload fields (`Create` and `Create Action and Get Data`). */
const ACTION_CREATE_OPERATIONS = ['create', 'createAndWait'];

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

/**
 * Builds the `displayOptions` for a `showform` create field, merging any extra
 * conditions (e.g. `skipChefsSubmission`, `callbackDataMode`) onto the shared base.
 * Centralizes the repeated show-condition object used by every showform field.
 */
function showformDisplay(extra?: Record<string, unknown[]>): DisplayOptions {
  return {
    show: { resource: ['action'], operation: ACTION_CREATE_OPERATIONS, actionType: ['showform'], ...extra },
  };
}

/**
 * `displayOptions` for a showform field that only applies when Skip CHEFS Submission is on
 * and Callback Data is "Selected Fields Only". Extra conditions (e.g. the field-mapping
 * mode) are merged on top.
 */
function selectedFieldsDisplay(extra?: Record<string, unknown[]>): DisplayOptions {
  return showformDisplay({ skipChefsSubmission: [true], callbackDataMode: ['selected'], ...extra });
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
  autoFieldsNotice('autoFieldsNoticeAction', { show: { resource: ['action'], operation: ACTION_CREATE_OPERATIONS } }),
  {
    displayName:
      'Callback URL and Callback Method are set automatically to resume this execution when the actor completes the action. Optionally limit how long to wait below.',
    name: 'autoCallbackNoticeAction',
    type: 'notice',
    default: '',
    displayOptions: { show: { resource: ['action'], operation: ['createAndWait'] } },
  },
  {
    displayName:
      'On timeout, this node’s output is NOT usable — n8n resumes with this node’s input data instead, not the action result. Instead, add a downstream Code node reading $execution.customData.get("wilActionId") and $execution.customData.get("wilActionStatus") into $json (plain {{ }} expressions on other nodes may not resolve customData reliably): status is "completed" if the actor responded, or still "waiting" if the wait timed out first (there is no "expired" value — that only happens when a downstream node updates the action status).',
    name: 'customDataNoticeAction',
    type: 'notice',
    default: '',
    displayOptions: { show: { resource: ['action'], operation: ['createAndWait'] } },
  },
  actorIdField({ show: { resource: ['action'], operation: ACTION_CREATE_OPERATIONS } }),
  actorTypeField({ show: { resource: ['action'], operation: ACTION_CREATE_OPERATIONS } }),
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
    displayOptions: { show: { resource: ['action'], operation: ACTION_CREATE_OPERATIONS } },
  },
  {
    displayName: 'Action Title',
    name: 'actionTitle',
    type: 'string',
    default: '',
    description: 'Optional title shown for this action',
    displayOptions: { show: { resource: ['action'], operation: ACTION_CREATE_OPERATIONS } },
  },
  {
    displayName: 'HTML',
    name: 'approvalHtml',
    type: 'string',
    typeOptions: { rows: 4 },
    default: '',
    required: true,
    description: 'Required HTML content shown to the user before they choose an approval option',
    displayOptions: {
      show: { resource: ['action'], operation: ACTION_CREATE_OPERATIONS, actionType: ['getapproval'] },
    },
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
    displayOptions: {
      show: { resource: ['action'], operation: ACTION_CREATE_OPERATIONS, actionType: ['getapproval'] },
    },
  },
  {
    displayName: 'CHEFS Form Name',
    name: 'formName',
    type: 'string',
    default: '',
    required: true,
    description: 'CHEFS form name shown for the form action',
    displayOptions: showformDisplay(),
  },
  {
    displayName: 'CHEFS Form ID',
    name: 'formId',
    type: 'string',
    default: '',
    required: true,
    description: 'CHEFS form ID to render',
    displayOptions: showformDisplay(),
  },
  {
    displayName: 'CHEFS Form API Key',
    name: 'formApiKey',
    type: 'string',
    typeOptions: { password: true },
    default: '',
    required: true,
    description: 'CHEFS form API key used server-side to obtain a form token',
    displayOptions: showformDisplay(),
  },
  {
    displayName: 'CHEFS Form Submission ID',
    name: 'submissionId',
    type: 'string',
    default: '',
    description:
      'Optional existing CHEFS form submission ID to load. When provided, this takes priority over Form Pre-Fill Data.',
    displayOptions: showformDisplay(),
  },
  {
    displayName: 'Form Pre-Fill Data',
    name: 'formPreFillData',
    type: 'json',
    default: '{}',
    description:
      'Optional object of CHEFS field API names and values to prefill over rendered form data. Ignored when CHEFS Form Submission ID is provided.',
    displayOptions: showformDisplay(),
  },
  {
    displayName: 'Send Form Data to Callback (Skip CHEFS Submission)',
    name: 'skipChefsSubmission',
    type: 'boolean',
    default: false,
    description:
      'When enabled, the form data is NOT submitted to CHEFS. Instead, the form data is sent directly to the callback URL so the workflow can process it. The form is still rendered and validated by CHEFS, but no submission record is created in CHEFS.',
    displayOptions: showformDisplay(),
  },
  {
    displayName: 'Callback Data',
    name: 'callbackDataMode',
    type: 'options',
    default: 'full',
    options: [
      { name: 'Full Form Data', value: 'full' },
      { name: 'Selected Fields Only', value: 'selected' },
    ],
    description:
      'Choose whether the entire form response or only specific fields are sent to the callback URL. Selecting only the fields you need keeps sensitive data in the browser and gives the workflow a smaller, predictable payload.',
    displayOptions: showformDisplay({ skipChefsSubmission: [true] }),
  },
  {
    displayName: 'Field Selection Mode',
    name: 'callbackFieldMappingMode',
    type: 'options',
    default: 'keyValue',
    options: [
      { name: 'UI Field Pairs', value: 'keyValue' },
      { name: 'JSON', value: 'json' },
    ],
    description: 'Choose how to define which form fields are sent to the callback',
    displayOptions: selectedFieldsDisplay(),
  },
  {
    displayName: 'Fields to Send',
    name: 'callbackFieldMappings',
    type: 'fixedCollection',
    typeOptions: { multipleValues: true },
    default: {},
    placeholder: 'Add Field',
    options: [
      {
        name: 'mapping',
        displayName: 'Field',
        values: [
          {
            displayName: 'Output Key',
            name: 'outputKey',
            type: 'string',
            default: '',
            description: 'The key name to use in the callback payload sent to the workflow',
          },
          {
            displayName: 'Source Path',
            name: 'sourcePath',
            type: 'string',
            default: '',
            description:
              'Dot-notation path into the submitted form data, e.g. firstName, address.city, or items.0.name',
          },
        ],
      },
    ],
    description:
      'Map each form field you want to send. Output Key is what the workflow receives; Source Path is where to read it from in the form data.',
    displayOptions: selectedFieldsDisplay({ callbackFieldMappingMode: ['keyValue'] }),
  },
  {
    displayName: 'Fields to Send (JSON)',
    name: 'callbackFieldMappingJson',
    type: 'json',
    default: '{}',
    description:
      'JSON object mapping output keys to dot-notation source paths, e.g. { "city": "address.city", "name": "firstName" }',
    displayOptions: selectedFieldsDisplay({ callbackFieldMappingMode: ['json'] }),
  },
  {
    displayName: 'Missing Field Behavior',
    name: 'callbackMissingPathBehavior',
    type: 'options',
    default: 'returnNull',
    options: [
      { name: 'Return Null', value: 'returnNull' },
      { name: 'Omit Field', value: 'omit' },
    ],
    description:
      'What to do when a Source Path is not present in the submitted form data. "Return Null" includes the Output Key with a null value; "Omit Field" leaves the key out of the callback payload entirely.',
    displayOptions: selectedFieldsDisplay(),
  },
  {
    displayName: 'Payload',
    name: 'payload',
    type: 'json',
    default: '{}',
    required: true,
    description: 'Free-form payload for wait on event actions, for example { "eventName": "clicked" }',
    displayOptions: {
      show: { resource: ['action'], operation: ACTION_CREATE_OPERATIONS, actionType: ['waitonevent'] },
    },
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
    displayOptions: { show: { resource: ['action'], operation: ACTION_CREATE_OPERATIONS } },
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
    displayOptions: { show: { resource: ['action'], operation: ACTION_CREATE_OPERATIONS } },
  },
  {
    displayName: 'Check In',
    name: 'checkIn',
    type: 'dateTime',
    default: '',
    description: 'Optional reminder timestamp in RFC 3339 format',
    displayOptions: { show: { resource: ['action'], operation: ACTION_CREATE_OPERATIONS } },
  },
  metadataField({ show: { resource: ['action'], operation: ACTION_CREATE_OPERATIONS } }),
  {
    displayName: 'Limit Wait Time',
    name: 'limitWaitTime',
    type: 'boolean',
    default: false,
    description:
      'Whether to set a maximum time to wait for the actor before resuming automatically with a timeout status',
    displayOptions: { show: { resource: ['action'], operation: ['createAndWait'] } },
  },
  {
    displayName: 'Limit Type',
    name: 'limitType',
    type: 'options',
    default: 'afterTimeInterval',
    description: 'Sets the condition for the execution to resume. Can be a specified date or after some time.',
    options: [
      { name: 'After Time Interval', value: 'afterTimeInterval', description: 'Waits for a certain amount of time' },
      {
        name: 'At Specified Time',
        value: 'atSpecifiedTime',
        description: 'Waits until the set date and time to continue',
      },
    ],
    displayOptions: { show: { resource: ['action'], operation: ['createAndWait'], limitWaitTime: [true] } },
  },
  {
    displayName: 'Amount',
    name: 'timeoutAmount',
    type: 'number',
    default: 1,
    typeOptions: { minValue: 0, numberPrecision: 2 },
    description: 'The time to wait before resuming',
    displayOptions: {
      show: {
        resource: ['action'],
        operation: ['createAndWait'],
        limitWaitTime: [true],
        limitType: ['afterTimeInterval'],
      },
    },
  },
  {
    displayName: 'Unit',
    name: 'timeoutUnit',
    type: 'options',
    default: 'hours',
    options: [
      { name: 'Days', value: 'days' },
      { name: 'Hours', value: 'hours' },
      { name: 'Minutes', value: 'minutes' },
      { name: 'Seconds', value: 'seconds' },
    ],
    description: 'The time unit of the wait amount',
    displayOptions: {
      show: {
        resource: ['action'],
        operation: ['createAndWait'],
        limitWaitTime: [true],
        limitType: ['afterTimeInterval'],
      },
    },
  },
  {
    displayName: 'Max Date and Time',
    name: 'maxDateAndTime',
    type: 'dateTime',
    default: '',
    description: 'Continue execution after this specified date and time',
    displayOptions: {
      show: {
        resource: ['action'],
        operation: ['createAndWait'],
        limitWaitTime: [true],
        limitType: ['atSpecifiedTime'],
      },
    },
  },
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
