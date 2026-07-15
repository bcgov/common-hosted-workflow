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

/**
 * CHEFS Resubmit
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
export class CHEFSResubmit extends Wait {
  constructor() {
    super();

    const inheritedProperties = this.description.properties ? [...this.description.properties] : [];

    // Replace the visible inherited `resume` options field with the hidden locked one.
    const withLockedResume = inheritedProperties.map((p) => (p.name === 'resume' ? lockedResumeProperty : p));

    // Prepend CHEFS fields above the inherited Wait properties.
    const properties = [formIdProperty, submissionIdProperty, ...withLockedResume];

    this.description = {
      ...this.description,
      displayName: 'CHEFS Resubmit',
      name: 'chefsResubmit',
      description: 'Wait for a CHEFS resubmit webhook before continuing execution',
      subtitle: '=Resubmit CHEFS submission',
      usableAsTool: true,
      defaults: {
        ...this.description.defaults,
        name: 'CHEFS Resubmit',
      },
      properties,
    } as unknown as typeof this.description;
  }

  /**
   * Pre-wait hook.
   *
   * Runs before the execution is put to wait. Has access to previous-node output
   * items and to the generated resume URL. Delegates to the native Wait execute
   * afterwards so all resume/limit behavior stays intact.
   */
  async execute(context: ExecuteContext): Promise<ExecuteReturnInner> {
    const inputItems = context.getInputData();
    const formId = context.getNodeParameter('formId', 0) as string;
    const submissionId = context.getNodeParameter('submissionId', 0) as string;
    const resumeUrl = context.evaluateExpression('{{ $execution.resumeUrl }}', 0) as string;

    // TODO: implement CHEFS pre-wait logic using inputItems, formId, submissionId, resumeUrl.
    void [inputItems, formId, submissionId, resumeUrl];

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
    const headers = context.getHeaderData();

    const isEmpty = (v: unknown): boolean =>
      v == null || typeof v !== 'object' || Object.keys(v as object).length === 0;

    if (isEmpty(body) && isEmpty(query) && isEmpty(params)) {
      throw new NodeOperationError(context.getNode() as never, 'CHEFS Resubmit webhook received no request data', {
        description: 'The resume webhook call must include body, query, or params data.',
      });
    }

    // TODO: implement CHEFS post-resume logic using body, query, params, headers.
    void headers;

    return await super.webhook(context as never);
  }
}
