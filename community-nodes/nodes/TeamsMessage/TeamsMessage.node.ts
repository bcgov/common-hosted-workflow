import {
  IExecuteFunctions,
  INodeExecutionData,
  NodeConnectionTypes,
  type INodeType,
  type INodeTypeDescription,
} from 'n8n-workflow';
import { rocketChatAction, githubAction } from './sources';

export class TeamsMessage implements INodeType {
  description: INodeTypeDescription = {
    displayName: 'Microsoft Teams Message Converter',
    name: 'teamsMessageConverter',
    description: 'Transforms external message payloads into Microsoft Teams-compatible format',
    icon: { light: 'file:../../icons/microsoft-teams.svg', dark: 'file:../../icons/microsoft-teams.svg' },
    group: ['input'],
    version: 1,
    subtitle: '',
    defaults: {
      name: 'Teams Message Converter',
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
        ],
        default: 'rocket-chat',
      },
    ],
  };

  async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
    const items = this.getInputData();
    const returnData: INodeExecutionData[] = [];

    console.log('items', JSON.stringify(items));

    for (let i = 0; i < items.length; i++) {
      const source = this.getNodeParameter('source', i) as string;
      let responseData: INodeExecutionData;

      if (source === 'rocket-chat') {
        responseData = await rocketChatAction.call(this, i);
      } else if (source === 'github') {
        responseData = await githubAction.call(this, i);
      } else {
        throw new Error(`The source "${source}" is not known!`);
      }

      returnData.push(responseData);
    }

    return [returnData];
  }
}
