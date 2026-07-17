import { NodeOperationError, type INodeProperties } from 'n8n-workflow';
// Reuse the native Wait node's compiled class so description.properties, credentials,
// webhooks, icon, version, etc. stay synchronized with the installed n8n-nodes-base.
import { Wait } from 'n8n-nodes-base/dist/nodes/Wait/Wait.node';

/** Custom fields surfaced above the inherited Wait properties. */
const formIdProperty: INodeProperties = {
  displayName: 'Form ID',
  name: 'formId',
  type: 'string',
  default: '',
  required: true,
  description: 'The CHEFS form ID to resubmit against.',
};

const submissionIdProperty: INodeProperties = {
  displayName: 'Submission ID',
  name: 'submissionId',
  type: 'string',
  default: '',
  required: true,
  description: 'The CHEFS submission ID to resubmit.',
};

/**
 * Hidden field that locks the native Resume selector to "On Webhook Call".
 * Replaces the visible inherited `resume` property so the UI section is gone
 * while all inherited webhook-mode logic keeps working as if the user picked "webhook".
 */
const lockedResumeProperty: INodeProperties = {
  displayName: 'Resume',
  name: 'resume',
  type: 'hidden',
  default: 'webhook',
  noDataExpression: true,
};

// Derive the parent method signatures so the overrides use the same n8n-workflow
// types as Wait (which resolves to the copy pinned by n8n-nodes-base). This avoids
// the dual n8n-workflow version boundary at the type level.
type ExecuteContext = Parameters<Wait['execute']>[0];
type ExecuteReturnInner = Awaited<ReturnType<Wait['execute']>>;
type WebhookContext = Parameters<Wait['webhook']>[0];
type WebhookReturnInner = Awaited<ReturnType<Wait['webhook']>>;

/** Shape of the `workflowInteractionLayerApi` credential this node relies on for the base URL. */
interface WilApiCredentials {
  baseUrl: string;
}

/** Path of the external-hooks route that registers a pending CHEFS submission webhook. */
const REGISTER_PATH = '/rest/custom/v1/chefs/submissions/register';

/**
 * Registers a `chefs_submission_webhook` row with the external-hooks service so
 * that a later CHEFS callback can resume this execution.
 *
 * Uses the `workflowInteractionLayerApi` credential's `baseUrl` to locate the
 * n8n instance, and authenticates with the shared `INTERNAL_AUTH_TOKEN` env
 * var (mirroring the WIL node's internal-call convention). Throws a
 * NodeOperationError on any failure so the workflow fails fast before waiting.
 */
async function registerChefsSubmissionWebhook(
  context: ExecuteContext,
  params: { executionId: string; formId: string; submissionId: string; resumeUrl: string },
): Promise<void> {
  const { executionId, formId, submissionId, resumeUrl } = params;

  let baseUrl: unknown;
  try {
    const credentials = (await context.getCredentials('workflowInteractionLayerApi')) as WilApiCredentials;
    baseUrl = credentials?.baseUrl;
  } catch {
    // Fall back below; the baseUrl may be missing but the user will get a clear error message.
  }

  if (typeof baseUrl !== 'string' || baseUrl.trim() === '') {
    throw new NodeOperationError(context.getNode() as never, 'Missing Workflow Interaction Layer API base URL', {
      description:
        'Configure the "Workflow Interaction Layer API" credential with the n8n instance base URL (e.g. http://localhost:5678) and attach it to this node.',
    });
  }

  const normalizedBase = baseUrl.replace(/\/$/, '');
  const url = `${normalizedBase}${REGISTER_PATH}`;
  const internalToken = process.env.INTERNAL_AUTH_TOKEN;

  if (!internalToken) {
    throw new NodeOperationError(context.getNode() as never, 'INTERNAL_AUTH_TOKEN is not configured', {
      description:
        'The n8n runtime must expose INTERNAL_AUTH_TOKEN so the CHEFS Resubmit Wait node can authenticate to the external-hooks register route.',
    });
  }

  try {
    await context.helpers.httpRequest({
      method: 'POST',
      url,
      headers: {
        Authorization: `Bearer ${internalToken}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: {
        executionId,
        formId,
        submissionId,
        resumeUrl,
      },
      json: true,
    });
  } catch (error) {
    const detail = (error as Error)?.message ?? 'unknown error';
    throw new NodeOperationError(context.getNode() as never, `Failed to register CHEFS submission webhook: ${detail}`, {
      description: `POST ${url} failed. Ensure the external-hooks service is reachable and INTERNAL_AUTH_TOKEN matches.`,
    });
  }
}

/**
 * CHEFS Resubmit Wait
 *
 * Extends the native Wait node, inheriting its full UI properties array and
 * execution/webhook behavior. Overrides:
 *  - Resume is locked to "On Webhook Call" (hidden field).
 *  - Adds required CHEFS Form ID and Submission ID fields.
 *  - Pre-wait hook reads previous-node output + resumeUrl before delegating to Wait.
 *  - Post-resume webhook hook inspects the incoming webhook request before delegating
 *    to Wait, and throws if no webhook request data is present.
 *
 * Note on the cast: this package's n8n-workflow (2.16) and the copy pinned by
 * n8n-nodes-base (2.15) expose structurally near-identical types, but TypeScript
 * treats them as distinct. The `as unknown as` cast below bridges that boundary
 * at the type level only; at runtime a single object is reused and spread.
 */
export class CHEFSResubmitWait extends Wait {
  constructor() {
    super();

    const inheritedProperties = this.description.properties ? [...this.description.properties] : [];

    // Replace the visible inherited `resume` options field with the hidden locked one.
    const withLockedResume = inheritedProperties.map((p) => (p.name === 'resume' ? lockedResumeProperty : p));

    // Prepend CHEFS fields above the inherited Wait properties.
    const properties = [formIdProperty, submissionIdProperty, ...withLockedResume];

    this.description = {
      ...this.description,
      displayName: 'CHEFS Resubmit Wait',
      name: 'chefsResubmitWait',
      description: 'Wait for a CHEFS resubmit webhook before continuing execution',
      subtitle: '=Resubmit CHEFS submission',
      usableAsTool: true,
      credentials: [
        {
          name: 'workflowInteractionLayerApi',
          required: true,
        },
      ],
      defaults: {
        ...this.description.defaults,
        name: 'CHEFS Resubmit Wait',
      },
      properties,
    } as unknown as typeof this.description;
  }

  /**
   * Pre-wait hook.
   *
   * Runs before the execution is put to wait. Has access to previous-node output
   * items and to the generated resume URL. Registers a pending CHEFS submission
   * webhook row with the external-hooks service so that a later CHEFS callback can
   * locate and resume this execution. Delegates to the native Wait execute
   * afterwards so all resume/limit behavior stays intact.
   */
  async execute(context: ExecuteContext): Promise<ExecuteReturnInner> {
    // const inputItems = context.getInputData();
    const formId = context.getNodeParameter('formId', 0) as string;
    const submissionId = context.getNodeParameter('submissionId', 0) as string;
    const resumeUrl = context.evaluateExpression('{{ $execution.resumeUrl }}', 0) as string;
    const executionId = context.getExecutionId();

    await registerChefsSubmissionWebhook(context, {
      executionId,
      formId,
      submissionId,
      resumeUrl,
    });

    return await super.execute(context as never);
  }

  /**
   * Post-resume webhook hook.
   *
   * Runs when the resume webhook is called. Inspects the incoming request data and
   * throws if no webhook request data is present. Delegates to the native Wait
   * webhook handler afterwards so resume semantics stay intact.
   *
   * Note: IWebhookFunctions does not expose getInputData(), so previous-node items
   * are not available here. Only webhook request data (body/query/params/headers) is.
   */
  async webhook(context: WebhookContext): Promise<WebhookReturnInner> {
    const body = context.getBodyData();
    const query = context.getQueryData();
    const params = context.getParamsData();
    // const headers = context.getHeaderData();

    const isEmpty = (v: unknown): boolean =>
      v == null || typeof v !== 'object' || Object.keys(v as object).length === 0;

    if (isEmpty(body) && isEmpty(query) && isEmpty(params)) {
      throw new NodeOperationError(context.getNode() as never, 'CHEFS Resubmit Wait webhook received no request data', {
        description: 'The resume webhook call must include body, query, or params data.',
      });
    }

    return await super.webhook(context as never);
  }
}
