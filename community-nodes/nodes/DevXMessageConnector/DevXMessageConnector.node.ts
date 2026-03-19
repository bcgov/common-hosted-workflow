import {
  IDataObject,
  IExecuteFunctions,
  INodeExecutionData,
  NodeConnectionTypes,
  type INodeType,
  type INodeTypeDescription,
} from 'n8n-workflow';
import {
  backupContainerTransform,
  githubTransform,
  rocketChatTransform,
  sysdigTransform,
  uptimeComTransform,
} from './sources';
import type { TextMessageContent } from './sources/Text/types';
import type { HtmlMessageContent } from './sources/Html/types';
import type { GenericMessageContent } from './sources/Generic/types';
import type { BackupContainerMessageContent } from './sources/BackupContainer/types';
import type { GitHubPullRequestMessageContent } from './sources/Github/types';
import type { SysdigMessageContent } from './sources/Sysdig/types';
import type { UptimeComMessageContent } from './sources/UptimeCom/types';

type MessageContent =
  | TextMessageContent
  | HtmlMessageContent
  | GenericMessageContent
  | BackupContainerMessageContent
  | GitHubPullRequestMessageContent
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
    credentials: [],
    properties: [
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
        ],
        default: 'rocket-chat',
      },
      {
        displayName: 'Message Payload',
        name: 'payload',
        type: 'string',
        default: '',
        required: true,
        displayOptions: {
          show: {
            source: ['rocket-chat', 'github', 'backup-container', 'sysdig', 'uptime-com', 'argo-cd'],
          },
        },
      },
    ],
  };

  async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
    const items = this.getInputData();
    const returnData: INodeExecutionData[] = [];

    for (let i = 0; i < items.length; i++) {
      const source = this.getNodeParameter('source', i) as string;
      let messageContent: MessageContent;

      if (source === 'rocket-chat') {
        messageContent = await rocketChatTransform.call(this, i);
      } else if (source === 'github') {
        messageContent = await githubTransform.call(this, i);
      } else if (source === 'backup-container') {
        messageContent = await backupContainerTransform.call(this, i);
      } else if (source === 'sysdig') {
        messageContent = await sysdigTransform.call(this, i);
      } else if (source === 'uptime-com') {
        messageContent = await uptimeComTransform.call(this, i);
      } else {
        throw new Error(`The source "${source}" is not known!`);
      }

      const response = await sendMessageToDevXConnector.call(this, messageContent);
      returnData.push({ json: response as unknown as IDataObject });
    }

    return [returnData];
  }
}

async function sendMessageToDevXConnector(this: IExecuteFunctions, content: MessageContent) {
  const API_KEY = process.env.CONNECTOR_API_KEY;
  const BASE_URL = process.env.CONNECTOR_API_URL;

  const options = {
    method: 'POST' as const,
    url: `${BASE_URL}/api/v1/messages`,
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      'X-User-Entra-Id': '',
      'Content-Type': 'application/json',
    },
    body: {
      target: {
        // TODO: add inputs for teamId and channelId
        teamId: '00000000-0000-0000-0000-000000000000',
        channelId: '19:abc123@thread.tacv2',
      },
      content,
    },
    json: true,
  };

  return await this.helpers.httpRequest(options);
}
