import { IExecuteFunctions, INodeExecutionData } from 'n8n-workflow';

export interface RocketChatField {
  title: string;
  value: string;
  short: boolean;
}

export interface RocketChatAttachment {
  title: string;
  title_link?: string;
  text: string;
  color?: string;
  image_url?: string;
  thumb_url?: string;
  fields?: RocketChatField[];
}

export interface RocketChatPayload {
  text: string;
  attachments: RocketChatAttachment[];
}

export async function rocketChatTransform(this: IExecuteFunctions, index: number): Promise<INodeExecutionData> {
  const rawPayload = this.getNodeParameter('payload', index);

  const payload =
    typeof rawPayload === 'string' ? (JSON.parse(rawPayload) as RocketChatPayload) : (rawPayload as RocketChatPayload);

  let htmlContent = `<div><p>${payload.text}</p>`;

  if (payload.attachments && payload.attachments.length > 0) {
    payload.attachments.forEach((attachment) => {
      const borderStyle = attachment.color
        ? `border-left: 4px solid ${attachment.color}; padding-left: 10px;`
        : 'border-left: 4px solid #ccc; padding-left: 10px;';

      htmlContent += `<div style="${borderStyle} margin-bottom: 15px;">`;

      if (attachment.title_link) {
        htmlContent += `<h3><a href="${attachment.title_link}">${attachment.title}</a></h3>`;
      } else {
        htmlContent += `<h3>${attachment.title}</h3>`;
      }

      htmlContent += `<p>${attachment.text}</p>`;

      const img = attachment.image_url || attachment.thumb_url;
      if (img) {
        htmlContent += `<img src="${img}" alt="${attachment.title}" style="max-width: 300px; height: auto; display: block; margin: 10px 0;" />`;
      }

      if (attachment.fields && attachment.fields.length > 0) {
        htmlContent += '<ul style="list-style-type: none; padding: 0; margin-top: 10px;">';
        attachment.fields.forEach((field) => {
          htmlContent += `<li><b>${field.title}:</b> ${field.value}</li>`;
        });
        htmlContent += '</ul>';
      }

      htmlContent += `</div>`;
    });
  }

  htmlContent += `</div>`;

  // See https://learn.microsoft.com/en-us/graph/api/chatmessage-post?view=graph-rest-1.0&tabs=http#request-body
  return {
    json: {
      body: {
        contentType: 'html',
        content: htmlContent,
      },
      attachments: [],
    },
  };
}
