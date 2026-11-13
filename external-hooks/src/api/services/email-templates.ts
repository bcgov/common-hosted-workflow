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
  rateLimitReached: {
    projectName: string;
    /** 'weekly' or 'annual'. */
    periodLabel: string;
    used: string;
    limit: string;
    /** True when top-up runs are part of the effective limit (shows the note). */
    includesTopup: boolean;
    topupRuns: string;
    /** True when new runs are paused (hard stop); false for soft stop. */
    hardStop: boolean;
    /** When the limit resets, e.g. 'Monday, November 9, 2026'. */
    resetDate: string;
    projectUrl: string;
  };
  rateLimitNearLimit: {
    projectName: string;
    /** 'weekly' or 'annual'. */
    periodLabel: string;
    /** Usage percent that crossed the threshold, e.g. '82'. */
    percent: string;
    used: string;
    limit: string;
    projectUrl: string;
  };
  rateLimitTopupGranted: {
    projectName: string;
    amount: string;
    /** Human week description, e.g. 'November 2 to 8, 2026'. */
    weekDescription: string;
    projectUrl: string;
  };
  rateLimitLimitsChanged: {
    projectName: string;
    weeklyLimit: string;
    yearlyLimit: string;
    changedBy: string | null;
    projectUrl: string;
  };
  rateLimitRequestTopupApproved: {
    projectName: string;
    /** e.g. '3,000'. */
    amount: string;
    /** Human week description, e.g. 'November 2 to 8, 2026'. */
    weekDescription: string;
    /** The reviewing admin's note, when given. */
    adminNote?: string;
    decidedByName: string | null;
    projectUrl: string;
  };
  rateLimitRequestLimitsApproved: {
    projectName: string;
    /** Formatted limit, or 'unchanged' when that period was not part of the ask. */
    weeklyLimit: string;
    yearlyLimit: string;
    /** The reviewing admin's note, when given. */
    adminNote?: string;
    decidedByName: string | null;
    projectUrl: string;
  };
  rateLimitRequestDenied: {
    projectName: string;
    /** The admin's required deny reason, word for word. */
    reason: string;
    decidedByName: string | null;
    projectUrl: string;
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

  rateLimitReached: Handlebars.compile<EmailTemplateDataMap['rateLimitReached']>(
    `<h2>{{periodLabel}} limit reached for {{projectName}}</h2>
<p>{{projectName}} has used {{used}} of its {{periodLabel}} limit of {{limit}} runs{{#if includesTopup}} (includes {{topupRuns}} top-up runs){{/if}}.</p>
{{#if hardStop}}
<p><strong>New workflow runs are paused until the limit resets on {{resetDate}}.</strong></p>
{{else}}
<p>Runs continue in the meantime, and the platform team has been alerted.</p>
{{/if}}
<p><a href="{{projectUrl}}">View usage for {{projectName}}</a></p>`,
  ),

  rateLimitNearLimit: Handlebars.compile<EmailTemplateDataMap['rateLimitNearLimit']>(
    `<h2>{{projectName}} has used {{percent}}% of its {{periodLabel}} limit</h2>
<p>{{projectName}} has used {{used}} of {{limit}} runs for this {{periodLabel}} period.</p>
<p>Once the limit is reached, new runs may pause until it resets.</p>
<p><a href="{{projectUrl}}">View usage for {{projectName}}</a></p>`,
  ),

  rateLimitTopupGranted: Handlebars.compile<EmailTemplateDataMap['rateLimitTopupGranted']>(
    `<h2>Extra runs added for {{projectName}}</h2>
<p>A top-up of {{amount}} extra runs was added to {{projectName}}'s weekly limit for {{weekDescription}}.</p>
<p>Top-ups also raise the annual limit for the year the week falls in.</p>
<p><a href="{{projectUrl}}">View usage for {{projectName}}</a></p>`,
  ),

  rateLimitLimitsChanged: Handlebars.compile<EmailTemplateDataMap['rateLimitLimitsChanged']>(
    `<h2>Execution limits updated for {{projectName}}</h2>
<p>The execution limits for {{projectName}} were updated{{#if changedBy}} by {{changedBy}}{{/if}}.</p>
<p><strong>Weekly limit:</strong> {{weeklyLimit}}</p>
<p><strong>Annual limit:</strong> {{yearlyLimit}}</p>
<p><a href="{{projectUrl}}">View usage for {{projectName}}</a></p>`,
  ),

  rateLimitRequestTopupApproved: Handlebars.compile<EmailTemplateDataMap['rateLimitRequestTopupApproved']>(
    `<h2>Your extra-runs request for {{projectName}} was approved</h2>
<p>Your request for {{amount}} extra runs for {{projectName}} was approved{{#if decidedByName}} by {{decidedByName}}{{/if}}.</p>
<p>The runs are added to the weekly limit for {{weekDescription}}, and also raise the annual limit for the year that week falls in.</p>
{{#if adminNote}}<p><strong>Note from the reviewer:</strong> {{adminNote}}</p>{{/if}}
<p><a href="{{projectUrl}}">View usage for {{projectName}}</a></p>`,
  ),

  rateLimitRequestLimitsApproved: Handlebars.compile<EmailTemplateDataMap['rateLimitRequestLimitsApproved']>(
    `<h2>Your limit-raise request for {{projectName}} was approved</h2>
<p>Your request to raise the execution limits for {{projectName}} was approved{{#if decidedByName}} by {{decidedByName}}{{/if}}.</p>
<p><strong>Weekly limit:</strong> {{weeklyLimit}}</p>
<p><strong>Annual limit:</strong> {{yearlyLimit}}</p>
<p>The new limits start now and stay in effect until an admin changes them.</p>
{{#if adminNote}}<p><strong>Note from the reviewer:</strong> {{adminNote}}</p>{{/if}}
<p><a href="{{projectUrl}}">View usage for {{projectName}}</a></p>`,
  ),

  rateLimitRequestDenied: Handlebars.compile<EmailTemplateDataMap['rateLimitRequestDenied']>(
    `<h2>Your run request for {{projectName}} was denied</h2>
<p>Your request for more runs for {{projectName}} was denied{{#if decidedByName}} by {{decidedByName}}{{/if}}.</p>
<p><strong>Reason:</strong> {{reason}}</p>
<p>You can submit a new request from the project page at any time.</p>
<p><a href="{{projectUrl}}">View usage for {{projectName}}</a></p>`,
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
