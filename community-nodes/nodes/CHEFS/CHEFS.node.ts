import {
  // IDataObject,
  // INodeExecutionData,
  NodeConnectionTypes,
  type INodeType,
  type INodeTypeDescription,
} from 'n8n-workflow';
import { includeAuthorizationHeader } from './shared/requestOptions';

export class CHEFS implements INodeType {
  description: INodeTypeDescription = {
    displayName: 'CHEFS',
    name: 'Common Hosted Form Service',
    icon: { light: 'file:../../icons/chefs.svg', dark: 'file:../../icons/chefs.dark.svg' },
    group: ['input'],
    version: 1,
    subtitle: '',
    description: 'CHEFS Node',
    defaults: {
      name: 'CHEFS',
    },
    usableAsTool: true,
    inputs: [NodeConnectionTypes.Main],
    outputs: [NodeConnectionTypes.Main],
    credentials: [
      {
        name: 'chefsApi',
        required: true,
      },
    ],
    requestDefaults: {
      baseURL: 'https://submit.digital.gov.bc.ca/app/api/v1',
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
          { name: 'Submission', value: 'submission' },
          { name: 'Status', value: 'status' },
        ],
        default: 'submission',
      },
      {
        displayName: 'Operation',
        name: 'operation',
        type: 'options',
        noDataExpression: true,
        displayOptions: {
          show: {
            resource: ['submission'],
          },
        },
        options: [
          {
            name: 'Get',
            value: 'get',
            action: 'Get a submission',
            routing: {
              request: {
                method: 'GET',
                url: '=/submissions/{{$parameter.submissionID}}',
              },
              send: { preSend: [includeAuthorizationHeader] },
              // output: {
              //   postReceive: [
              //     async function (items, response): Promise<INodeExecutionData[]> {
              //       return items.map((item) => {
              //         // Check if the property exists and is an object
              //         if (item.json.submission && typeof item.json.submission === 'object') {
              //           // Cast it to IDataObject so we can spread it
              //           const submissionData = item.json.submission as IDataObject;

              //           return {
              //             json: {
              //               ...submissionData,
              //               _processedAt: new Date().toISOString(),
              //             },
              //           };
              //         }
              //         return item;
              //       });
              //     },
              //   ],
              // },
            },
          },
        ],
        default: 'get',
      },
      {
        displayName: 'Operation',
        name: 'operation',
        type: 'options',
        noDataExpression: true,
        displayOptions: {
          show: {
            resource: ['status'],
          },
        },
        options: [
          {
            name: 'Get Form Statuses',
            value: 'getFormStatuses',
            action: 'Get a status list of a form',
            routing: {
              request: {
                method: 'GET',
                url: '=/forms/{{$parameter.formID}}/statusCodes',
              },
              send: { preSend: [includeAuthorizationHeader] },
            },
          },
          {
            name: 'Get Submission Statuses',
            value: 'includeAuthorizationHeaderStatuses',
            action: 'Get a status list of a submission',
            routing: {
              request: {
                method: 'GET',
                url: '=/submissions/{{$parameter.submissionID}}/status',
              },
              send: { preSend: [includeAuthorizationHeader] },
            },
          },
        ],
        default: 'get',
      },
      {
        displayName: 'Form ID',
        name: 'formID',
        type: 'string',
        default: '',
        required: true,
        displayOptions: {
          show: {
            resource: ['submission', 'status'],
          },
        },
      },
      {
        displayName: 'Authorization Token',
        name: 'authorizationToken',
        type: 'string',
        default: '',
        required: true,
        displayOptions: {
          show: {
            resource: ['submission', 'status'],
          },
        },
      },
      {
        displayName: 'Submission ID',
        name: 'submissionID',
        type: 'string',
        default: '',
        required: true,
        displayOptions: {
          show: {
            resource: ['submission', 'status'],
          },
        },
      },
    ],
  };
}
