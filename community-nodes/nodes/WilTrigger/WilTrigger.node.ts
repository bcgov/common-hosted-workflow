import {
  NodeConnectionTypes,
  type IDataObject,
  type IExecuteFunctions,
  type INodeExecutionData,
  type INodeType,
  type INodeTypeDescription,
  type ITriggerFunctions,
  type ITriggerResponse,
} from 'n8n-workflow';
import { buildSampleItem, readInputSchema, shapeInput } from './helpers';

/**
 * WIL Trigger
 *
 * Marker trigger: it never listens for anything itself. When a WIL button or CHEFS form trigger fires,
 * the external-hooks service starts this workflow in-process at this node (found by its node id) and
 * supplies the item below. The node only normalises that item, so it behaves like Execute Sub-workflow Trigger.
 *
 * Output item: { source: 'wil', trigger: {id, type, name}, actor: {email, tenantId, roles, groups}, input, firedAt }
 *
 * Keep the parameter names/defaults in sync with external-hooks `helpers/wil-trigger-node.ts`:
 * n8n omits default-valued parameters from saved JSON, so the backend re-applies the same defaults.
 */
export class WilTrigger implements INodeType {
  description: INodeTypeDescription = {
    displayName: 'WIL Trigger',
    name: 'wilTrigger',
    icon: {
      light: 'file:../../icons/wil-trigger.svg',
      dark: 'file:../../icons/wil-trigger.dark.svg',
    },
    group: ['trigger'],
    version: 1,
    subtitle: '={{$parameter["displayLabel"] || "WIL Trigger"}}',
    description:
      'Starts this workflow when a user clicks a WIL button or submits a CHEFS form. Appears in the WIL trigger dropdown once published.',
    eventTriggerDescription: '',
    maxNodes: 1,
    defaults: {
      name: 'WIL Trigger',
      color: '#003366',
    },
    inputs: [],
    outputs: [NodeConnectionTypes.Main],
    properties: [
      {
        displayName:
          "Publish this workflow to make it selectable in the WIL trigger form. WIL starts it internally with the credentials of this workflow's owner (the triggering user is passed in as data, not impersonated); no webhook URL is involved.",
        name: 'notice',
        type: 'notice',
        default: '',
      },
      {
        displayName: 'Display Label',
        name: 'displayLabel',
        type: 'string',
        default: '',
        placeholder: 'e.g. Approve request',
        description: 'Name shown in the WIL trigger dropdown. Defaults to the node name.',
      },
      {
        displayName: 'Description',
        name: 'description',
        type: 'string',
        typeOptions: { rows: 2 },
        default: '',
        description: 'Short help text shown next to the workflow in WIL',
      },
      {
        displayName: 'Accepted Sources',
        name: 'acceptedSources',
        type: 'multiOptions',
        default: ['chefs-form', 'button'],
        options: [
          { name: 'Button', value: 'button' },
          { name: 'CHEFS Form', value: 'chefs-form' },
        ],
        description: 'Which WIL trigger types may select this workflow',
      },
      {
        displayName: 'Input Source',
        name: 'inputSource',
        type: 'options',
        default: 'passthrough',
        options: [
          { name: 'Accept Any Input', value: 'passthrough', description: 'Pass whatever WIL sends as `input`' },
          { name: 'Define Using Fields Below', value: 'workflowInputs', description: 'Declare named, typed fields' },
          {
            name: 'Define Using JSON Example',
            value: 'jsonExample',
            description: 'Infer fields from an example object',
          },
        ],
        description:
          'How the expected input is described. Declared fields are shown to the person configuring a button.',
      },
      {
        displayName: 'Workflow Input Fields',
        name: 'workflowInputs',
        type: 'fixedCollection',
        typeOptions: { multipleValues: true, sortable: true },
        default: {},
        placeholder: 'Add Field',
        displayOptions: { show: { inputSource: ['workflowInputs'] } },
        options: [
          {
            name: 'values',
            displayName: 'Values',
            values: [
              {
                displayName: 'Name',
                name: 'name',
                type: 'string',
                default: '',
                placeholder: 'e.g. requestId',
                required: true,
              },
              {
                displayName: 'Type',
                name: 'type',
                type: 'options',
                default: 'string',
                options: [
                  { name: 'Array', value: 'array' },
                  { name: 'Boolean', value: 'boolean' },
                  { name: 'Number', value: 'number' },
                  { name: 'Object', value: 'object' },
                  { name: 'String', value: 'string' },
                ],
              },
            ],
          },
        ],
      },
      {
        displayName: 'JSON Example',
        name: 'jsonExample',
        type: 'json',
        default: '{\n  "requestId": "abc-123",\n  "amount": 100\n}',
        displayOptions: { show: { inputSource: ['jsonExample'] } },
      },
      {
        displayName: 'Respond',
        name: 'respondMode',
        type: 'options',
        default: 'immediately',
        options: [
          { name: 'Immediately', value: 'immediately', description: 'Return as soon as the run is started' },
          {
            name: 'When Last Node Finishes',
            value: 'lastNode',
            description: 'Wait for the run and return the last node’s output to WIL',
          },
        ],
      },
      {
        displayName: 'Response Timeout (Seconds)',
        name: 'responseTimeoutSec',
        type: 'number',
        default: 30,
        typeOptions: { minValue: 1, maxValue: 120 },
        displayOptions: { show: { respondMode: ['lastNode'] } },
        description: 'How long WIL waits before answering "still running". The workflow keeps running regardless.',
      },
    ],
  };

  // Nothing to register: WIL starts the workflow itself. Required so n8n treats the workflow as triggerable.
  async trigger(this: ITriggerFunctions): Promise<ITriggerResponse> {
    return {};
  }

  async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
    const schema = readInputSchema(
      this.getNodeParameter('inputSource', 0, 'passthrough') as string,
      this.getNodeParameter('workflowInputs', 0, {}) as { values?: Array<{ name?: string; type?: string }> },
      this.getNodeParameter('jsonExample', 0, '') as string,
    );

    const items = this.getInputData();
    if (items.length === 0) {
      // Editor test run: no WIL call supplied data.
      const label = (this.getNodeParameter('displayLabel', 0, '') as string) || this.getNode().name;
      return [[buildSampleItem(schema, label)]];
    }

    return [
      items.map((item) => ({
        ...item,
        json: { ...item.json, input: shapeInput(schema, item.json.input) as IDataObject },
      })),
    ];
  }
}
