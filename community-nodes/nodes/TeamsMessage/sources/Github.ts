import { IExecuteFunctions, INodeExecutionData } from 'n8n-workflow';

export async function githubAction(this: IExecuteFunctions, index: number): Promise<INodeExecutionData> {
  const item = this.getInputData(index)[0];

  const payload = item.json.body;
  console.log('github', JSON.stringify(payload));

  // Specific GitHub transformation logic here
  const transformedJson = {
    text: `GitHub Alert: ${payload}`,
  };

  return { json: transformedJson };
}
