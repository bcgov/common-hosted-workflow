import Handlebars from 'handlebars';

type EmailTemplateDataMap = {
  accessRequestSubmitted: {
    requesterEmail: string;
    justification: string;
    createdAt: string;
    reviewUrl: string;
  };
  accessRequestApproved: {
    reviewerEmail: string;
    homeUrl: string;
  };
  accessRequestDenied: {
    reviewerEmail: string;
    denyReason?: string;
    accessRequestUrl: string;
  };
};

const templates = {
  accessRequestSubmitted: Handlebars.compile<EmailTemplateDataMap['accessRequestSubmitted']>(
    `<h2>New Access Request</h2>
<p>A new access request has been submitted and requires your review.</p>
<p><strong>Requester:</strong> {{requesterEmail}}</p>
<p><strong>Justification:</strong> {{justification}}</p>
<p><strong>Submitted:</strong> {{createdAt}}</p>
<p><a href="{{reviewUrl}}">Review this request</a></p>`,
  ),

  accessRequestApproved: Handlebars.compile<EmailTemplateDataMap['accessRequestApproved']>(
    `<h2>Access Request Approved</h2>
<p>Your access request has been approved.</p>
<p><strong>Status:</strong> Approved</p>
<p><strong>Reviewed by:</strong> {{reviewerEmail}}</p>
<p>You can now access the system.</p>
<p><a href="{{homeUrl}}">Go to the application</a></p>`,
  ),

  accessRequestDenied: Handlebars.compile<EmailTemplateDataMap['accessRequestDenied']>(
    `<h2>Access Request Denied</h2>
<p>Your access request has been denied.</p>
<p><strong>Status:</strong> Denied</p>
<p><strong>Reviewed by:</strong> {{reviewerEmail}}</p>
{{#if denyReason}}<p><strong>Reason:</strong> {{denyReason}}</p>{{/if}}
<p><a href="{{accessRequestUrl}}">Submit a new request</a></p>`,
  ),
} satisfies {
  [K in keyof EmailTemplateDataMap]: ReturnType<typeof Handlebars.compile<EmailTemplateDataMap[K]>>;
};

export type EmailTemplateName = keyof EmailTemplateDataMap;

export function renderEmail<TName extends EmailTemplateName>(
  templateName: TName,
  data: EmailTemplateDataMap[TName],
): string {
  return templates[templateName](data);
}
