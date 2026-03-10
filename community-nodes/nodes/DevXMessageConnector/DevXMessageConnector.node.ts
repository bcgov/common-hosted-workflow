import {
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
  argoCdTransform,
} from './sources';

export class DevXMessageConnector implements INodeType {
  description: INodeTypeDescription = {
    displayName: 'DevX Message Connector',
    name: 'devXMessageConnector',
    description: 'Transforms external message payloads into DevX Connector format',
    icon: { light: 'file:../../icons/bcgov.png', dark: 'file:../../icons/bcgov.png' },
    group: ['input'],
    version: 1,
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
          { name: 'Argo CD', value: 'argo-cd' },
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
      let responseData: INodeExecutionData;

      if (source === 'rocket-chat') {
        responseData = await rocketChatTransform.call(this, i);
      } else if (source === 'github') {
        responseData = await githubTransform.call(this, i);
      } else if (source === 'backup-container') {
        responseData = await backupContainerTransform.call(this, i);
      } else if (source === 'sysdig') {
        responseData = await sysdigTransform.call(this, i);
      } else if (source === 'uptime-com') {
        responseData = await uptimeComTransform.call(this, i);
      } else if (source === 'argo-cd') {
        responseData = await argoCdTransform.call(this, i);
      } else {
        throw new Error(`The source "${source}" is not known!`);
      }

      returnData.push(responseData);
    }

    return [returnData];
  }
}
