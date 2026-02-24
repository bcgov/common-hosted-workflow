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
  statusCakeTransform,
  sysdigTransform,
  uptimeComTransform,
} from './sources';

export class TeamsMessageTransformer implements INodeType {
  description: INodeTypeDescription = {
    displayName: 'Microsoft Teams Message Transformer',
    name: 'teamsMessageTransformer',
    description: 'Transforms external message payloads into Microsoft Teams-compatible format',
    icon: { light: 'file:../../icons/microsoft-teams.svg', dark: 'file:../../icons/microsoft-teams.svg' },
    group: ['input'],
    version: 1,
    subtitle: '',
    defaults: {
      name: 'Teams Message Transformer',
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
          { name: 'Status Cake', value: 'status-cake' },
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
            source: ['rocket-chat', 'github', 'backup-container', 'sysdig', 'uptime-com', 'status-cake'],
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
      } else if (source === 'status-cake') {
        responseData = await statusCakeTransform.call(this, i);
      } else {
        throw new Error(`The source "${source}" is not known!`);
      }

      returnData.push(responseData);
    }

    return [returnData];
  }
}
