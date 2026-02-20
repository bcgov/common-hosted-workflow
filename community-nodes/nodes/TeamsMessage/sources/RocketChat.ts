import { IExecuteFunctions, INodeExecutionData } from 'n8n-workflow';

export async function rocketChatAction(this: IExecuteFunctions, index: number): Promise<INodeExecutionData> {
  const item = this.getInputData(index)[0];

  const payload = item.json.body;
  console.log('rocket', JSON.stringify(payload));

  // Specific Rocket.Chat transformation logic here
  const transformedJson = {
    text: `Message from Rocket.Chat: ${payload}`,
    color: '#ff0000',
  };

  return { json: transformedJson };
}
