import {
  IDataObject,
  IExecuteFunctions,
  INodeExecutionData,
  NodeConnectionTypes,
  NodeApiError,
  NodeOperationError,
  type JsonObject,
  type INodeType,
  type INodeTypeDescription,
} from 'n8n-workflow';
import {
  textTransform,
  htmlTransform,
  cardTransform,
  genericTransform,
  backupContainerTransform,
  githubTransform,
  rocketChatTransform,
  statusCakeTransform,
  sysdigTransform,
  uptimeComTransform,
} from './sources';
import { parseTeamsLink } from './helpers';
import { toSerializableNodeJson } from './sources/shared/payload';
import type { TextMessageContent } from './sources/Text/types';
import type { HtmlMessageContent } from './sources/Html/types';
import type { CardMessageContent } from './sources/Card/types';
import type { GenericMessageContent } from './sources/Generic/types';
import type { BackupContainerMessageContent } from './sources/BackupContainer/types';
import type { GitHubPullRequestMessageContent, GitHubWorkflowRunMessageContent } from './sources/Github/types';
import type { SysdigMessageContent } from './sources/Sysdig/types';
import type { UptimeComMessageContent } from './sources/UptimeCom/types';
import type { StatusCakeMessageContent } from './sources/StatusCake/types';

type MessageContent =
  | TextMessageContent
  | HtmlMessageContent
  | CardMessageContent
  | GenericMessageContent
  | BackupContainerMessageContent
  | GitHubPullRequestMessageContent
  | GitHubWorkflowRunMessageContent
  | SysdigMessageContent
  | UptimeComMessageContent
  | StatusCakeMessageContent;

interface Target {
  teamId: string;
  channelId: string;
}

export interface MentionTarget {
  id: string;
  name: string;
}

interface MentionCollection {
  mention?: Array<{
    email: string;
    name: string;
  }>;
}

interface SendMessageRequest {
  target: Target;
  content: MessageContent;
  metadata?: Record<string, string>;
  mentions?: MentionTarget[];
}

export class DevXMessageConnector implements INodeType {
  description: INodeTypeDescription = {
    displayName: 'DevX Message Connector',
    name: 'devXMessageConnector',
    description: 'Transforms external message payloads into DevX Connector format',
    icon: { light: 'file:../../icons/message-2-code.svg', dark: 'file:../../icons/message-2-code.dark.svg' },
    group: ['input'],
    version: 0.1,
    subtitle: '',
    defaults: {
      name: 'DevX Message Connector',
    },
    usableAsTool: true,
    inputs: [NodeConnectionTypes.Main],
    outputs: [NodeConnectionTypes.Main],
    credentials: [
      {
        name: 'devXConnector',
        required: true,
      },
    ],
    properties: [
      {
        displayName: 'Type',
        name: 'type',
        type: 'options',
        noDataExpression: true,
        options: [
          { name: 'Template', value: 'template' },
          { name: 'Text', value: 'text' },
          { name: 'HTML', value: 'html' },
          { name: 'Adaptive Card', value: 'card' },
        ],
        default: 'template',
      },
      {
        displayName: 'Source',
        name: 'source',
        type: 'options',
        noDataExpression: true,
        options: [
          { name: 'Rocket.Chat', value: 'rocket-chat' },
          { name: 'GitHub', value: 'github' },
          { name: 'Backup Container', value: 'backup-container' },
          { name: 'Sysdig', value: 'sysdig' },
          { name: 'Status Cake', value: 'status-cake' },
          { name: 'Uptime.com', value: 'uptime-com' },
          { name: 'Generic', value: 'generic' },
        ],
        default: 'rocket-chat',
        displayOptions: {
          show: {
            type: ['template'],
          },
        },
      },
      {
        displayName: 'Payload',
        name: 'payload',
        type: 'string',
        default: '',
        required: true,
        displayOptions: {
          show: {
            type: ['template'],
          },
        },
      },
      {
        displayName: 'Text',
        name: 'payload',
        type: 'string',
        default: '',
        required: true,
        displayOptions: {
          show: {
            type: ['text'],
          },
        },
      },
      {
        displayName: 'Html',
        name: 'payload',
        type: 'string',
        default: '',
        required: true,
        displayOptions: {
          show: {
            type: ['html'],
          },
        },
      },
      {
        displayName: 'Payload',
        name: 'payload',
        type: 'string',
        default: '',
        required: true,
        displayOptions: {
          show: {
            type: ['card'],
          },
        },
      },
      {
        displayName: 'Mention Users',
        name: 'mentions',
        type: 'fixedCollection',
        typeOptions: { multipleValues: true },
        default: {},
        options: [
          {
            name: 'mention',
            displayName: 'Mention',
            values: [
              {
                displayName: 'Email',
                name: 'email',
                type: 'string',
                default: '',
                required: true,
                description: 'The email address of the user to mention in the message',
              },
              {
                displayName: 'Name',
                name: 'name',
                type: 'string',
                default: '',
                required: true,
                description: 'The name of the user to mention in the message.',
              },
            ],
          },
        ],
        description:
          'List of users to mention in the message. Each user is identified by their email address and name.',
      },
      {
        displayName: 'Mode',
        name: 'mode',
        type: 'options',
        noDataExpression: true,
        options: [
          { name: 'Send', value: 'send' },
          { name: 'Preview', value: 'preview' },
        ],
        default: 'send',
        displayOptions: {
          show: {
            type: ['template', 'text', 'html', 'card'],
          },
        },
      },
    ],
  };

  async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
    const items = this.getInputData();
    const credentials = await this.getCredentials('devXConnector');
    const { channelId, groupId } = parseTeamsLink(credentials.channelLink as string);

    if (!channelId || !groupId) {
      throw new Error('Invalid Microsoft Teams channel link provided');
    }

    const returnData: INodeExecutionData[] = [];

    for (let i = 0; i < items.length; i++) {
      try {
        const type = this.getNodeParameter('type', i) as string;
        const mode = this.getNodeParameter('mode', i) as string;
        let messageContent: MessageContent | null = null;

        if (type === 'text') {
          messageContent = textTransform.call(this, i);
        } else if (type === 'html') {
          messageContent = htmlTransform.call(this, i);
        } else if (type === 'card') {
          messageContent = cardTransform.call(this, i);
        } else if (type === 'template') {
          const source = this.getNodeParameter('source', i) as string;
          if (source === 'generic') {
            messageContent = genericTransform.call(this, i);
          } else if (source === 'rocket-chat') {
            messageContent = rocketChatTransform.call(this, i);
          } else if (source === 'github') {
            messageContent = githubTransform.call(this, i);
          } else if (source === 'backup-container') {
            messageContent = backupContainerTransform.call(this, i);
          } else if (source === 'sysdig') {
            messageContent = sysdigTransform.call(this, i);
          } else if (source === 'status-cake') {
            messageContent = statusCakeTransform.call(this, i);
          } else if (source === 'uptime-com') {
            messageContent = uptimeComTransform.call(this, i);
          } else {
            throw new Error(`The source "${source}" is not known!`);
          }
        } else {
          throw new Error(`The type "${type}" is not known!`);
        }

        if (!messageContent) {
          throw new Error('Failed to generate message content');
        }

        const mentions = resolveMentionTargets(this, i);
        const response = await sendMessageToDevXConnector.call(
          this,
          messageContent,
          groupId,
          channelId,
          mode,
          mentions,
        );
        returnData.push({ json: toSerializableNodeJson(response) as IDataObject });
      } catch (error) {
        if ((error as Error & { response?: unknown }).response) {
          throw new NodeApiError(this.getNode(), error as JsonObject);
        }

        throw new NodeOperationError(this.getNode(), error as Error, { itemIndex: i });
      }
    }

    return [returnData];
  }
}

function resolveMentionTargets(context: IExecuteFunctions, itemIndex: number): MentionTarget[] {
  const collection = context.getNodeParameter('mentions', itemIndex, {}) as MentionCollection;

  return (collection.mention ?? [])
    .filter(({ email, name }) => email.trim() !== '' || name.trim() !== '')
    .map(({ email, name }) => ({
      id: email,
      name,
    }));
}

async function sendMessageToDevXConnector(
  this: IExecuteFunctions,
  content: MessageContent,
  teamId: string,
  channelId: string,
  mode: string,
  mentions: MentionTarget[],
) {
  const apiKey = process.env.DEVX_CONNECTOR_API_KEY;
  const baseUrl = process.env.DEVX_CONNECTOR_API_URL;

  if (!apiKey || !baseUrl) {
    throw new Error('Missing DevX Connector configuration (API_KEY or BASE_URL)');
  }

  const normalizedUrl = baseUrl.replace(/\/$/, '');
  const url = `${normalizedUrl}/api/v1/messages${mode === 'preview' ? '/preview' : ''}`;

  const headers = {
    Authorization: `Bearer ${apiKey}`,
    'X-User-Entra-Id': '',
    'Content-Type': 'application/json',
  };

  const body: SendMessageRequest = {
    target: {
      teamId,
      channelId,
    },
    content,
    mentions,
  };

  const options = {
    method: 'POST' as const,
    url,
    headers,
    body,
    json: true,
    returnFullResponse: false,
  };

  try {
    return await this.helpers.httpRequest(options);
  } catch (error) {
    const requestError = error as Error & {
      code?: string;
      response?: {
        status?: number;
        statusText?: string;
        data?: unknown;
      };
    };

    console.error('DevX Connector request failed', {
      url,
      mode,
      status: requestError.response?.status,
      statusText: requestError.response?.statusText,
      code: requestError.code,
      responseBody: toSerializableNodeJson(requestError.response?.data),
    });

    throw error;
  }
}
