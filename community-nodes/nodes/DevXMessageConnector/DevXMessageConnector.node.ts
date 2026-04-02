import {
  IDataObject,
  IExecuteFunctions,
  INodeExecutionData,
  NodeConnectionTypes,
  type INodeType,
  type INodeTypeDescription,
} from 'n8n-workflow';
import {
  textTransform,
  htmlTransform,
  genericTransform,
  backupContainerTransform,
  githubTransform,
  rocketChatTransform,
  sysdigTransform,
  uptimeComTransform,
} from './sources';
import { parseTeamsLink } from './helpers';
import type { TextMessageContent } from './sources/Text/types';
import type { HtmlMessageContent } from './sources/Html/types';
import type { GenericMessageContent } from './sources/Generic/types';
import type { BackupContainerMessageContent } from './sources/BackupContainer/types';
import type { GitHubPullRequestMessageContent, GitHubWorkflowRunMessageContent } from './sources/Github/types';
import type { SysdigMessageContent } from './sources/Sysdig/types';
import type { UptimeComMessageContent } from './sources/UptimeCom/types';

type MessageContent =
  | TextMessageContent
  | HtmlMessageContent
  | GenericMessageContent
  | BackupContainerMessageContent
  | GitHubPullRequestMessageContent
  | GitHubWorkflowRunMessageContent
  | SysdigMessageContent
  | UptimeComMessageContent;

export class DevXMessageConnector implements INodeType {
  description: INodeTypeDescription = {
    displayName: 'DevX Message Connector',
    name: 'devXMessageConnector',
    description: 'Transforms external message payloads into DevX Connector format',
    icon: { light: 'file:../../icons/bcgov.png', dark: 'file:../../icons/bcgov.png' },
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
            type: ['template', 'text', 'html'],
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
      const type = this.getNodeParameter('type', i) as string;
      const mode = this.getNodeParameter('mode', i) as string;
      let messageContent: MessageContent | null = null;

      if (type === 'text') {
        messageContent = textTransform.call(this, i);
      } else if (type === 'html') {
        messageContent = htmlTransform.call(this, i);
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

      const response = await sendMessageToDevXConnector.call(this, messageContent, groupId, channelId, mode);
      returnData.push({ json: response as unknown as IDataObject });
    }

    return [returnData];
  }
}

async function sendMessageToDevXConnector(
  this: IExecuteFunctions,
  content: MessageContent,
  teamId: string,
  channelId: string,
  mode: string,
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

  const body = {
    target: {
      teamId,
      channelId,
    },
    content,
  };

  const options = {
    method: 'POST' as const,
    url,
    headers,
    body,
    json: true,
  };

  return await this.helpers.httpRequest(options);
}
