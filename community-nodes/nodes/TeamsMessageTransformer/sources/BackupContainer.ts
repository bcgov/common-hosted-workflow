import { IExecuteFunctions, INodeExecutionData } from 'n8n-workflow';

export interface BackupContainerPayload {
  projectFriendlyName: string;
  projectName: string;
  statusCode: string; // "INFO", "WARN", or "ERROR"
  message: string;
}

export async function backupContainerTransform(this: IExecuteFunctions, index: number): Promise<INodeExecutionData> {
  const rawPayload = this.getNodeParameter('payload', index);

  const payload =
    typeof rawPayload === 'string'
      ? (JSON.parse(rawPayload) as BackupContainerPayload)
      : (rawPayload as BackupContainerPayload);

  const statusConfig: Record<string, { color: string; icon: string }> = {
    INFO: { color: '#007bff', icon: 'ℹ️' },
    WARN: { color: '#ffc107', icon: '⚠️' },
    ERROR: { color: '#dc3545', icon: '🚨' },
  };

  const currentStatus = statusConfig[payload.statusCode.toUpperCase()] || { color: '#6c757d', icon: '📝' };

  const htmlContent = `
    <div style="border-left: 5px solid ${currentStatus.color}; padding: 12px; font-family: -apple-system, sans-serif; background-color: #fafafa; border-radius: 0 4px 4px 0;">
      <div style="margin-bottom: 4px;">
        <span style="font-size: 1.1em; font-weight: bold; color: #333;">
          ${currentStatus.icon} ${payload.projectFriendlyName}
        </span>
        <span style="font-size: 0.85em; color: #888; margin-left: 8px;">
          (${payload.projectName})
        </span>
      </div>

      <div style="font-weight: bold; font-size: 0.9em; color: ${currentStatus.color}; margin-bottom: 10px; text-transform: uppercase;">
        Status: ${payload.statusCode}
      </div>

      <div style="padding: 2px; background-color: #ffffff; border: 1px solid #e1e4e8; border-radius: 4px; white-space: pre-wrap; font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace; font-size: 0.9em; color: #24292e; line-height: 1.5;">
        ${payload.message}
      </div>
    </div>
  `.trim();

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
