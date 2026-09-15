import {
  NodeConnectionTypes,
  NodeOperationError,
  type IDataObject,
  type IExecuteFunctions,
  type INodeExecutionData,
  type INodeType,
  type INodeTypeDescription,
} from 'n8n-workflow';
import { normalizePairs, toObject } from './shared/pairs';

type OutputFormat = 'both' | 'object' | 'array';

export class KeyValueStore implements INodeType {
  description: INodeTypeDescription = {
    displayName: 'Key Value Store',
    name: 'keyValueStore',
    description:
      'Read key-value pairs from a Key Value Store credential and output them as an object for downstream nodes',
    icon: {
      light: 'file:../../icons/shield-lock.svg',
      dark: 'file:../../icons/shield-lock.dark.svg',
    },
    group: ['transform'],
    version: 1,
    subtitle: '={{$parameter["outputFormat"]}}',
    defaults: { name: 'Key Value Store' },
    usableAsTool: true,
    inputs: [NodeConnectionTypes.Main],
    outputs: [NodeConnectionTypes.Main],
    credentials: [
      {
        name: 'keyValueStore',
        required: true,
      },
    ],
    sensitiveOutputFields: ['pairs[*].value', 'values'],
    properties: [
      {
        displayName: 'Output Format',
        name: 'outputFormat',
        type: 'options',
        noDataExpression: true,
        options: [
          {
            name: 'Both',
            value: 'both',
            description: 'Output the values object and the pairs array',
          },
          {
            name: 'Object Only',
            value: 'object',
            description: 'Output only the values object',
          },
          {
            name: 'Pairs Array Only',
            value: 'array',
            description: 'Output only the pairs array',
          },
        ],
        default: 'both',
        description: 'Which fields to include in the output item',
      },
    ],
  };

  async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
    const items = this.getInputData();
    const credentials = await this.getCredentials('keyValueStore');
    const pairs = normalizePairs(credentials);

    let values: Record<string, string>;
    try {
      values = toObject(pairs);
    } catch (error) {
      throw new NodeOperationError(this.getNode(), error as Error);
    }

    const outputFormat = this.getNodeParameter('outputFormat', 0, 'both') as OutputFormat;
    const returnData: INodeExecutionData[] = [];

    for (const [index] of items.entries()) {
      const json: IDataObject = {};
      if (outputFormat === 'both' || outputFormat === 'object') {
        json.values = { ...values } as IDataObject;
      }
      if (outputFormat === 'both' || outputFormat === 'array') {
        json.pairs = pairs.map((pair) => ({ ...pair })) as unknown as IDataObject[];
      }
      const executionData = this.helpers.constructExecutionMetaData(this.helpers.returnJsonArray(json), {
        itemData: { item: index },
      });
      returnData.push(...executionData);
    }

    return [returnData];
  }
}
