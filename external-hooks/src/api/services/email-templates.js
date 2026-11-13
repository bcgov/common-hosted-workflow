'use strict';
var __importDefault =
  (this && this.__importDefault) ||
  function (mod) {
    return mod && mod.__esModule ? mod : { default: mod };
  };
Object.defineProperty(exports, '__esModule', { value: true });
exports.renderEmail = renderEmail;
const handlebars_1 = __importDefault(require('handlebars'));
const templates = {
  accessRequestSubmitted: handlebars_1.default.compile(`<h2>New Access Request</h2>
<p>A new access request has been submitted and requires your review.</p>
<p><strong>Requester:</strong> {{requesterEmail}}</p>
<p><strong>Justification:</strong> {{justification}}</p>
<p><strong>Submitted:</strong> {{createdAt}}</p>
<p><a href="{{reviewUrl}}">Review this request</a></p>`),
  accessRequestApproved: handlebars_1.default.compile(`<h2>Access Request Approved</h2>
<p>Your access request has been approved.</p>
<p><strong>Status:</strong> Approved</p>
<p><strong>Reviewed by:</strong> {{reviewerEmail}}</p>
<p>You can now access the system.</p>
<p><a href="{{homeUrl}}">Go to the application</a></p>`),
  accessRequestDenied: handlebars_1.default.compile(`<h2>Access Request Denied</h2>
<p>Your access request has been denied.</p>
<p><strong>Status:</strong> Denied</p>
<p><strong>Reviewed by:</strong> {{reviewerEmail}}</p>
{{#if denyReason}}<p><strong>Reason:</strong> {{denyReason}}</p>{{/if}}
<p><a href="{{accessRequestUrl}}">Submit a new request</a></p>`),
  rateLimitReached: handlebars_1.default.compile(`<h2>{{periodLabel}} limit reached for {{projectName}}</h2>
<p>{{projectName}} has used {{used}} of its {{periodLabel}} limit of {{limit}} runs{{#if includesTopup}} (includes {{topupRuns}} top-up runs){{/if}}.</p>
{{#if hardStop}}
<p><strong>New workflow runs are paused until the limit resets on {{resetDate}}.</strong></p>
{{else}}
<p>Runs continue in the meantime, and the platform team has been alerted.</p>
{{/if}}
<p><a href="{{projectUrl}}">View usage for {{projectName}}</a></p>`),
  rateLimitNearLimit: handlebars_1.default
    .compile(`<h2>{{projectName}} has used {{percent}}% of its {{periodLabel}} limit</h2>
<p>{{projectName}} has used {{used}} of {{limit}} runs for this {{periodLabel}} period.</p>
<p>Once the limit is reached, new runs may pause until it resets.</p>
<p><a href="{{projectUrl}}">View usage for {{projectName}}</a></p>`),
  rateLimitTopupGranted: handlebars_1.default.compile(`<h2>Extra runs added for {{projectName}}</h2>
<p>A top-up of {{amount}} extra runs was added to {{projectName}}'s weekly limit for {{weekDescription}}.</p>
<p>Top-ups also raise the annual limit for the year the week falls in.</p>
<p><a href="{{projectUrl}}">View usage for {{projectName}}</a></p>`),
  rateLimitLimitsChanged: handlebars_1.default.compile(`<h2>Execution limits updated for {{projectName}}</h2>
<p>The execution limits for {{projectName}} were updated{{#if changedBy}} by {{changedBy}}{{/if}}.</p>
<p><strong>Weekly limit:</strong> {{weeklyLimit}}</p>
<p><strong>Annual limit:</strong> {{yearlyLimit}}</p>
<p><a href="{{projectUrl}}">View usage for {{projectName}}</a></p>`),
  rateLimitRequestTopupApproved: handlebars_1.default
    .compile(`<h2>Your extra-runs request for {{projectName}} was approved</h2>
<p>Your request for {{amount}} extra runs for {{projectName}} was approved{{#if decidedByName}} by {{decidedByName}}{{/if}}.</p>
<p>The runs are added to the weekly limit for {{weekDescription}}, and also raise the annual limit for the year that week falls in.</p>
{{#if adminNote}}<p><strong>Note from the reviewer:</strong> {{adminNote}}</p>{{/if}}
<p><a href="{{projectUrl}}">View usage for {{projectName}}</a></p>`),
  rateLimitRequestLimitsApproved: handlebars_1.default
    .compile(`<h2>Your limit-raise request for {{projectName}} was approved</h2>
<p>Your request to raise the execution limits for {{projectName}} was approved{{#if decidedByName}} by {{decidedByName}}{{/if}}.</p>
<p><strong>Weekly limit:</strong> {{weeklyLimit}}</p>
<p><strong>Annual limit:</strong> {{yearlyLimit}}</p>
<p>The new limits start now and stay in effect until an admin changes them.</p>
{{#if adminNote}}<p><strong>Note from the reviewer:</strong> {{adminNote}}</p>{{/if}}
<p><a href="{{projectUrl}}">View usage for {{projectName}}</a></p>`),
  rateLimitRequestDenied: handlebars_1.default.compile(`<h2>Your run request for {{projectName}} was denied</h2>
<p>Your request for more runs for {{projectName}} was denied{{#if decidedByName}} by {{decidedByName}}{{/if}}.</p>
<p><strong>Reason:</strong> {{reason}}</p>
<p>You can submit a new request from the project page at any time.</p>
<p><a href="{{projectUrl}}">View usage for {{projectName}}</a></p>`),
};
function renderEmail(templateName, data) {
  return templates[templateName](data);
}
