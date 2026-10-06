import { NodeConnectionTypes, type INodeType, type INodeTypeDescription } from 'n8n-workflow';
import { includeNotifyAuth } from './shared/requestOptions';

export class Notify implements INodeType {
  description: INodeTypeDescription = {
    displayName: 'Notify',
    name: 'notify',
    description: 'Interact with the Notify API for delivery, status, templates, webhooks and health',
    icon: { light: 'file:../../icons/notify.svg', dark: 'file:../../icons/notify.dark.svg' },
    group: ['input'],
    version: 1,
    subtitle: '={{$parameter["operation"]}}',
    defaults: {
      name: 'Notify',
    },
    usableAsTool: true,
    inputs: [NodeConnectionTypes.Main],
    outputs: [NodeConnectionTypes.Main],
    credentials: [
      {
        name: 'notifyApi',
        required: true,
      },
    ],
    requestDefaults: {
      baseURL: '={{$credentials.notifyApi.baseUrl}}',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
    },
    properties: [
      {
        displayName: 'Resource',
        name: 'resource',
        type: 'options',
        noDataExpression: true,
        options: [
          { name: 'Send', value: 'send' },
          { name: 'Notification status', value: 'notificationStatus' },
          { name: 'Templates', value: 'templates' },
          { name: 'Webhooks', value: 'webhooks' },
          { name: 'Service', value: 'service' },
        ],
        default: 'send',
      },
      {
        displayName: 'Operation',
        name: 'operation',
        type: 'options',
        noDataExpression: true,
        displayOptions: {
          show: {
            resource: ['send'],
          },
        },
        options: [
          {
            name: 'Send Notification',
            value: 'sendNotification',
            action: 'Send a notification',
            description:
              'Submit a notification for delivery. Returns 202 Accepted with a notifyId when accepted; 202 means accepted, not delivered. Follow up via Notification status operations. SMS-disabled 403 and template/safelist 422 errors are pass-through upstream errors.',
            routing: {
              request: {
                method: 'POST',
                url: '=/api/v1/notifysimple{{$parameter.preview ? "?preview=true" : ""}}',
              },
              send: { preSend: [includeNotifyAuth] },
            },
          },
          {
            name: 'Send Email',
            value: 'sendEmail',
            action: 'Send an email',
            description:
              'Send an email via the email channel. Returns 202 Accepted with a notifyId when accepted; 202 means accepted, not delivered. Follow up via Notification status operations. Template/safelist 422 errors are pass-through upstream errors.',
            routing: {
              request: {
                method: 'POST',
                url: '=/api/v1/notifysimple/email{{$parameter.preview ? "?preview=true" : ""}}',
              },
              send: { preSend: [includeNotifyAuth] },
            },
          },
          {
            name: 'Send SMS',
            value: 'sendSms',
            action: 'Send an SMS',
            description:
              'Send an SMS. Returns 202 Accepted with a notifyId when accepted; 202 means accepted, not delivered. Follow up via Notification status operations. SMS-disabled 403 and template/safelist 422 errors are pass-through upstream errors.',
            routing: {
              request: {
                method: 'POST',
                url: '=/api/v1/notifysimple/sms{{$parameter.preview ? "?preview=true" : ""}}',
              },
              send: { preSend: [includeNotifyAuth] },
            },
          },
          {
            name: 'Cancel or Reschedule',
            value: 'cancelOrReschedule',
            action: 'Cancel or reschedule a notification',
            description:
              'Cancel or reschedule a scheduled notification. Cancel sends {"action":"cancel"}; reschedule sends {"scheduledTime":"..."} with a future time. 404/422 errors are pass-through upstream errors.',
            routing: {
              request: {
                method: 'PATCH',
                url: '=/api/v1/notifysimple/{{$parameter.notificationId}}',
              },
              send: { preSend: [includeNotifyAuth] },
            },
          },
        ],
        default: 'sendNotification',
      },
      {
        displayName: 'Payload',
        name: 'payload',
        type: 'json',
        default: '{}',
        required: true,
        description:
          'Full NotifySimpleRequest JSON body with at least one of email/sms/msgApp, e.g. {"email": {"recipients": {"to": [...]}, "content": {...}}, "params": {...}}. TemplateId XOR inline content per channel; channel params override top-level params. 202 returns notifyId; use ?preview=true to render without sending.',
        displayOptions: {
          show: {
            resource: ['send'],
            operation: ['sendNotification'],
          },
        },
      },
      {
        displayName: 'Email Payload',
        name: 'emailPayload',
        type: 'json',
        default: '{}',
        required: true,
        description:
          'Bare email channel JSON body WITHOUT an "email" wrapper, e.g. {"recipients": {"to": ["a@example.com"]}, "content": {"subject": "...", "body": "...", "renderer": "handlebars"}, "params": {...}}. Recipients.to/cc/bcc or recipients.mergeArray; templateId XOR inline content. A wrapped {"email": {...}} body belongs to Send / Send Notification. 202 returns notifyId; use ?preview=true to render without sending.',
        displayOptions: {
          show: {
            resource: ['send'],
            operation: ['sendEmail'],
          },
        },
      },
      {
        displayName: 'SMS Payload',
        name: 'smsPayload',
        type: 'json',
        default: '{}',
        required: true,
        description:
          'Full SMS request JSON body with an "sms" channel, e.g. {"sms": {"recipients": {"to": ["+12505550123"]}, "content": {"body": "..."}}, "params": {...}}. Numbers normalise to E.164; 403 when SMS is disabled for the tenant. 202 returns notifyId; use ?preview=true to render without sending.',
        displayOptions: {
          show: {
            resource: ['send'],
            operation: ['sendSms'],
          },
        },
      },
      {
        displayName: 'Preview',
        name: 'preview',
        type: 'boolean',
        default: false,
        description:
          'When enabled, adds ?preview=true: returns 200 with rendered content without sending. Attachments and mergeArray are not supported in preview.',
        displayOptions: {
          show: {
            resource: ['send'],
            operation: ['sendNotification', 'sendEmail', 'sendSms'],
          },
        },
      },
      {
        displayName: 'Notification ID',
        name: 'notificationId',
        type: 'string',
        default: '',
        required: true,
        placeholder: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
        description:
          'The notifyId returned when the notification was accepted (appears as id in Notification status). Non-blank string; UUID format documented, not grammar-enforced.',
        displayOptions: {
          show: {
            resource: ['send', 'notificationStatus'],
            operation: ['cancelOrReschedule', 'getDeliveryRecords'],
          },
        },
      },
      {
        displayName: 'Action',
        name: 'action',
        type: 'options',
        noDataExpression: true,
        options: [
          { name: 'Cancel', value: 'cancel' },
          { name: 'Reschedule', value: 'reschedule' },
        ],
        default: 'cancel',
        description: 'Cancel sends {"action":"cancel"}; reschedule sends {"scheduledTime":"..."}.',
        displayOptions: {
          show: {
            resource: ['send'],
            operation: ['cancelOrReschedule'],
          },
        },
      },
      {
        displayName: 'Scheduled Time',
        name: 'scheduledTime',
        type: 'string',
        default: '',
        required: true,
        placeholder: '2027-06-01T16:00:00Z',
        description:
          'New delivery time with timezone (Z suffix or numeric offset). Required when rescheduling; must be in the future.',
        displayOptions: {
          show: {
            resource: ['send'],
            operation: ['cancelOrReschedule'],
            action: ['reschedule'],
          },
        },
      },
      {
        displayName: 'Operation',
        name: 'operation',
        type: 'options',
        noDataExpression: true,
        displayOptions: {
          show: {
            resource: ['notificationStatus'],
          },
        },
        options: [
          {
            name: 'List Notification Requests',
            value: 'listNotificationRequests',
            action: 'List notification requests',
            description:
              'List notification requests with current status, newest first. The notifyId returned by a send appears here as id. Supports page/limit/sort and repeatable filter entries in field:operator:value format, e.g. status:eq:QUEUED.',
            routing: {
              request: {
                method: 'GET',
                url: '=/api/v1/notification_request',
              },
              send: { preSend: [includeNotifyAuth] },
            },
          },
          {
            name: 'List Delivery Records',
            value: 'listDeliveryRecords',
            action: 'List delivery records',
            description:
              'List delivery records across all notifications for the tenant. Each record is per recipient per channel with channelCode, status and errorReason. The send response notifyId appears here as notificationRequestId.',
            routing: {
              request: {
                method: 'GET',
                url: '=/api/v1/notification_request/request_details',
              },
              send: { preSend: [includeNotifyAuth] },
            },
          },
          {
            name: 'Get Delivery Records',
            value: 'getDeliveryRecords',
            action: 'Get delivery records for a notification',
            description:
              'Get per-recipient delivery records for one notification, including channelCode, status and errorReason. Use the notifyId from send as notificationId; it appears as id here.',
            routing: {
              request: {
                method: 'GET',
                url: '=/api/v1/notification_request/{{$parameter.notificationId}}/request_details',
              },
              send: { preSend: [includeNotifyAuth] },
            },
          },
        ],
        default: 'listNotificationRequests',
      },
      {
        displayName: 'Page',
        name: 'page',
        type: 'number',
        default: 1,
        typeOptions: { minValue: 1 },
        description: 'Page number (1-indexed).',
        displayOptions: {
          show: {
            resource: ['notificationStatus', 'templates'],
            operation: ['listNotificationRequests', 'listTemplates'],
          },
        },
      },
      {
        displayName: 'Limit',
        name: 'limit',
        type: 'number',
        default: 10,
        typeOptions: { minValue: 1, maxValue: 100 },
        description: 'Items per page (max 100).',
        displayOptions: {
          show: {
            resource: ['notificationStatus', 'templates'],
            operation: ['listNotificationRequests', 'listTemplates'],
          },
        },
      },
      {
        displayName: 'Sort',
        name: 'sort',
        type: 'string',
        default: '',
        placeholder: '-createdAt,status',
        description: 'Sort fields separated by commas. Prefix with - for DESC. Example: -createdAt,status.',
        displayOptions: {
          show: {
            resource: ['notificationStatus', 'templates'],
            operation: ['listNotificationRequests', 'listTemplates'],
          },
        },
      },
      {
        displayName: 'Filters',
        name: 'filters',
        type: 'fixedCollection',
        default: {},
        typeOptions: { multipleValues: true },
        placeholder: 'Add filter',
        description:
          'Repeatable filter entries in field:operator:value format, e.g. status:eq:QUEUED. Sent as repeated filter query params.',
        displayOptions: {
          show: {
            resource: ['notificationStatus', 'templates'],
            operation: ['listNotificationRequests', 'listTemplates'],
          },
        },
        options: [
          {
            name: 'filter',
            displayName: 'Filter',
            values: [
              {
                displayName: 'Filter',
                name: 'filter',
                type: 'string',
                default: '',
                placeholder: 'status:eq:QUEUED',
                description: 'Filter in field:operator:value format, e.g. status:eq:QUEUED.',
              },
            ],
          },
        ],
      },
      {
        displayName: 'Operation',
        name: 'operation',
        type: 'options',
        noDataExpression: true,
        displayOptions: {
          show: {
            resource: ['templates'],
          },
        },
        options: [
          {
            name: 'List Templates',
            value: 'listTemplates',
            action: 'List templates',
            description:
              'List templates with pagination, newest first by default. Supports page/limit/sort and repeatable filter entries in field:operator:value format, e.g. channelCode:eq:EMAIL. Use the templateId from results for get/update/delete/preview.',
            routing: {
              request: {
                method: 'GET',
                url: '=/api/v1/templates',
              },
              send: { preSend: [includeNotifyAuth] },
            },
          },
          {
            name: 'Create Template',
            value: 'createTemplate',
            action: 'Create a template',
            description:
              'Create a reusable template so a send can reference it by templateId instead of carrying its content. Requires the NOTIFY_TEMPLATE_EDITOR role on the API key (403 otherwise). Placeholders like {{firstName}} in subject/body are filled from send-time params using the selected engine. Subject is required for EMAIL (server validates). Engine defaults to handlebars server-side; bodyType markdown renders markdown to HTML.',
            routing: {
              request: {
                method: 'POST',
                url: '=/api/v1/templates',
              },
              send: { preSend: [includeNotifyAuth] },
            },
          },
          {
            name: 'Get Template',
            value: 'getTemplate',
            action: 'Get a template',
            description:
              'Get one template by ID, including its body, subject and expected params. Placeholders like {{firstName}} are filled from send-time params when the template is used.',
            routing: {
              request: {
                method: 'GET',
                url: '=/api/v1/templates/{{$parameter.templateId}}',
              },
              send: { preSend: [includeNotifyAuth] },
            },
          },
          {
            name: 'Update Template',
            value: 'updateTemplate',
            action: 'Update a template',
            description:
              'Update a template by ID with optional patch fields; stores the result as a new version while keeping history so already-scheduled notifications are unaffected. Requires the NOTIFY_TEMPLATE_EDITOR role (403 otherwise). Placeholders like {{firstName}} continue to be filled from send-time params.',
            routing: {
              request: {
                method: 'PATCH',
                url: '=/api/v1/templates/{{$parameter.templateId}}',
              },
              send: { preSend: [includeNotifyAuth] },
            },
          },
          {
            name: 'Delete Template',
            value: 'deleteTemplate',
            action: 'Delete a template',
            description:
              'Delete a template by ID (soft-delete, marks inactive so it cannot be used for new sends; history retained). Requires the NOTIFY_TEMPLATE_EDITOR role (403 otherwise). Returns 204 with no body.',
            routing: {
              request: {
                method: 'DELETE',
                url: '=/api/v1/templates/{{$parameter.templateId}}',
              },
              send: { preSend: [includeNotifyAuth] },
            },
          },
          {
            name: 'Preview Template',
            value: 'previewTemplate',
            action: 'Preview a template',
            description:
              'Render a template with sample params without sending or storing anything; returns rendered subject/body. Use it to check {{placeholders}} resolve before a real send. Send params as JSON, e.g. {"firstName":"Alice"}.',
            routing: {
              request: {
                method: 'POST',
                url: '=/api/v1/templates/{{$parameter.templateId}}/preview',
              },
              send: { preSend: [includeNotifyAuth] },
            },
          },
        ],
        default: 'listTemplates',
      },
      {
        displayName: 'Template ID',
        name: 'templateId',
        type: 'string',
        default: '',
        required: true,
        placeholder: '3f1a7c2e-9b45-4d10-8e21-6c0f5a9b7d33',
        description: 'Template ID. Non-blank UUID string; UUID format documented, not grammar-enforced.',
        displayOptions: {
          show: {
            resource: ['templates'],
            operation: ['getTemplate', 'updateTemplate', 'deleteTemplate', 'previewTemplate'],
          },
        },
      },
      {
        displayName: 'Name',
        name: 'name',
        type: 'string',
        default: '',
        placeholder: 'Permit approved',
        description:
          'Template name. Must be unique within the tenant. Required for create; optional patch field for update (omit to leave unchanged).',
        displayOptions: {
          show: {
            resource: ['templates'],
            operation: ['createTemplate', 'updateTemplate'],
          },
        },
      },
      {
        displayName: 'Channel',
        name: 'channelCode',
        type: 'options',
        noDataExpression: true,
        options: [
          { name: 'Email', value: 'EMAIL' },
          { name: 'SMS', value: 'SMS' },
        ],
        default: '',
        description:
          'Channel this template sends on. Required for create; optional patch field for update (leave empty to leave unchanged).',
        displayOptions: {
          show: {
            resource: ['templates'],
            operation: ['createTemplate', 'updateTemplate'],
          },
        },
      },
      {
        displayName: 'Subject',
        name: 'subject',
        type: 'string',
        default: '',
        placeholder: 'Permit {{permitNumber}} approved',
        description:
          'Email subject line with {{placeholders}}. Required for EMAIL channel (server validates); ignored for SMS. Kept locally optional; leave empty to omit on update.',
        displayOptions: {
          show: {
            resource: ['templates'],
            operation: ['createTemplate', 'updateTemplate'],
          },
        },
      },
      {
        displayName: 'Body',
        name: 'body',
        type: 'string',
        default: '',
        placeholder: 'Hello {{firstName}}, permit {{permitNumber}} has been approved.',
        typeOptions: { rows: 4 },
        description:
          'Template body with {{placeholders}} filled from send-time params. Placeholder syntax depends on engine: {{name}} for handlebars and mustache. Required for create; optional patch field for update.',
        displayOptions: {
          show: {
            resource: ['templates'],
            operation: ['createTemplate', 'updateTemplate'],
          },
        },
      },
      {
        displayName: 'Engine',
        name: 'engineCode',
        type: 'options',
        noDataExpression: true,
        options: [
          { name: 'Handlebars', value: 'handlebars' },
          { name: 'Mustache', value: 'mustache' },
        ],
        default: '',
        description:
          'Rendering engine for {{placeholders}}. Defaults to handlebars server-side when omitted. Optional patch field for update (leave empty to leave unchanged).',
        displayOptions: {
          show: {
            resource: ['templates'],
            operation: ['createTemplate', 'updateTemplate'],
          },
        },
      },
      {
        displayName: 'Body Type',
        name: 'bodyType',
        type: 'options',
        noDataExpression: true,
        options: [{ name: 'Markdown', value: 'markdown' }],
        default: '',
        description:
          'How the body is interpreted. Only markdown is accepted; MJML templates compile to HTML on their own and ignore this. Optional; leave empty to omit (update leaves unchanged).',
        displayOptions: {
          show: {
            resource: ['templates'],
            operation: ['createTemplate', 'updateTemplate'],
          },
        },
      },
      {
        displayName: 'Description',
        name: 'description',
        type: 'string',
        default: '',
        placeholder: 'Sent when a permit application is approved',
        description: 'What this template is for. Optional; omit to leave unchanged on update.',
        displayOptions: {
          show: {
            resource: ['templates'],
            operation: ['createTemplate', 'updateTemplate'],
          },
        },
      },
      {
        displayName: 'Preview Params',
        name: 'params',
        type: 'json',
        default: '{}',
        description:
          'Values for template {{placeholders}}, keyed by placeholder name, e.g. {"firstName":"Alice"}. Sent as { params }. Every placeholder the template uses must be supplied.',
        displayOptions: {
          show: {
            resource: ['templates'],
            operation: ['previewTemplate'],
          },
        },
      },
      {
        displayName: 'Operation',
        name: 'operation',
        type: 'options',
        noDataExpression: true,
        displayOptions: {
          show: {
            resource: ['webhooks'],
          },
        },
        options: [
          {
            name: 'Register Callback',
            value: 'registerCallback',
            action: 'Register a callback',
            description:
              'Register an https-only callback URL for delivery events. Returns 201 with callbackId. Deliveries retry with backoff; when secret is set each call carries HMAC X-Webhook-Signature for verification.',
            routing: {
              request: {
                method: 'POST',
                url: '=/api/v1/notify/registerCallback',
              },
              send: { preSend: [includeNotifyAuth] },
            },
          },
          {
            name: 'Update Callback',
            value: 'updateCallback',
            action: 'Update a callback',
            description:
              'Update a callback by callbackId with partial fields. URL must remain https-only. Deliveries retry with backoff; when secret is set each call carries HMAC X-Webhook-Signature for verification.',
            routing: {
              request: {
                method: 'PATCH',
                url: '=/api/v1/notify/registerCallback/{{$parameter.callbackId}}',
              },
              send: { preSend: [includeNotifyAuth] },
            },
          },
          {
            name: 'Delete Callback',
            value: 'deleteCallback',
            action: 'Delete a callback',
            description: 'Delete a callback by callbackId. Returns 204 with no body; notifications are unaffected.',
            routing: {
              request: {
                method: 'DELETE',
                url: '=/api/v1/notify/registerCallback/{{$parameter.callbackId}}',
              },
              send: { preSend: [includeNotifyAuth] },
            },
          },
        ],
        default: 'registerCallback',
      },
      {
        displayName: 'Callback ID',
        name: 'callbackId',
        type: 'string',
        default: '',
        required: true,
        placeholder: 'b7f4c9e1-2a35-4d68-9f10-5c8e3a2b7d64',
        description:
          'Identifier returned when the callback was registered. Non-blank string; UUID format documented, not grammar-enforced.',
        displayOptions: {
          show: {
            resource: ['webhooks'],
            operation: ['updateCallback', 'deleteCallback'],
          },
        },
      },
      {
        displayName: 'Callback URL',
        name: 'url',
        type: 'string',
        default: '',
        placeholder: 'https://example.gov.bc.ca/hooks/notify',
        description:
          'HTTPS endpoint Notify POSTs delivery events to. HTTPS-only; plain HTTP is rejected. Deliveries retry with backoff. When secret is set each call carries HMAC X-Webhook-Signature so you can verify it came from Notify.',
        displayOptions: {
          show: {
            resource: ['webhooks'],
            operation: ['registerCallback', 'updateCallback'],
          },
        },
      },
      {
        displayName: 'Secret',
        name: 'secret',
        type: 'string',
        default: '',
        typeOptions: { password: true },
        description:
          'Shared secret used to sign each delivery with HMAC X-Webhook-Signature so you can verify it came from Notify. Never included in error messages. Leave empty to omit.',
        displayOptions: {
          show: {
            resource: ['webhooks'],
            operation: ['registerCallback', 'updateCallback'],
          },
        },
      },
      {
        displayName: 'Headers',
        name: 'headers',
        type: 'json',
        default: '{}',
        description:
          'Extra headers sent with every delivery callback as a JSON object, e.g. {"X-Environment":"production"}. Leave empty to omit.',
        displayOptions: {
          show: {
            resource: ['webhooks'],
            operation: ['registerCallback', 'updateCallback'],
          },
        },
      },
      {
        displayName: 'Channel Types',
        name: 'channelType',
        type: 'multiOptions',
        options: [
          { name: 'Email', value: 'email' },
          { name: 'SMS', value: 'sms' },
          { name: 'MsgApp', value: 'msgApp' },
        ],
        default: [],
        description:
          'Channel types to filter on. At least one required for register; optional for update (leave empty to leave unchanged).',
        displayOptions: {
          show: {
            resource: ['webhooks'],
            operation: ['registerCallback', 'updateCallback'],
          },
        },
      },
      {
        displayName: 'Triggers',
        name: 'trigger',
        type: 'multiOptions',
        options: [
          { name: 'Success', value: 'success' },
          { name: 'Failure', value: 'failure' },
        ],
        default: [],
        description:
          'Status transitions that trigger delivery. At least one required for register; optional for update (leave empty to leave unchanged).',
        displayOptions: {
          show: {
            resource: ['webhooks'],
            operation: ['registerCallback', 'updateCallback'],
          },
        },
      },
      {
        displayName: 'Active',
        name: 'active',
        type: 'boolean',
        default: true,
        description:
          'Set false to stop deliveries without deleting the registration. Always sent, including on update — confirm the value reflects what you want when changing other fields.',
        displayOptions: {
          show: {
            resource: ['webhooks'],
            operation: ['registerCallback', 'updateCallback'],
          },
        },
      },
      {
        displayName: 'Webhook Type',
        name: 'webhookType',
        type: 'options',
        noDataExpression: true,
        options: [
          { name: 'Generic', value: 'generic' },
          { name: 'Teams', value: 'teams' },
        ],
        default: '',
        description:
          'Payload shape: generic posts raw JSON; teams posts a Teams MessageCard. Defaults to generic server-side when omitted; leave empty to leave unchanged on update.',
        displayOptions: {
          show: {
            resource: ['webhooks'],
            operation: ['registerCallback', 'updateCallback'],
          },
        },
      },
      {
        displayName: 'Operation',
        name: 'operation',
        type: 'options',
        noDataExpression: true,
        displayOptions: {
          show: {
            resource: ['service'],
          },
        },
        options: [
          {
            name: 'Check Health',
            value: 'checkHealth',
            action: 'Check service health',
            description:
              'Check service health. No authentication required; safe to use as an availability probe. Sends no X-API-KEY, but still uses the credential Base URL to build the request URL (<baseUrl>/api/health).',
            routing: {
              request: {
                method: 'GET',
                url: '=/api/health',
              },
              send: { preSend: [includeNotifyAuth] },
            },
          },
        ],
        default: 'checkHealth',
      },
    ],
  };
}
