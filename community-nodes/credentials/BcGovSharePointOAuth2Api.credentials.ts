import type { ICredentialType, ICredentialTestRequest, INodeProperties, Icon } from 'n8n-workflow';

/**
 * App-only (client-credentials) Graph API auth for BC Gov's Sites.Selected model.
 * Extends oAuth2Api so n8n's OAuth2 machinery handles token acquisition/caching/refresh;
 * the hidden fields below force the client-credentials flow — no delegated user context
 * is available under Sites.Selected (spec assumption A1).
 */
export class BcGovSharePointOAuth2Api implements ICredentialType {
  name = 'bcGovSharePointOAuth2Api';
  icon: Icon = { light: 'file:../icons/sharepoint.svg', dark: 'file:../icons/sharepoint.dark.svg' };
  displayName = 'BC Gov SharePoint OAuth2 API';
  documentationUrl = 'https://bcgov.github.io/common-hosted-workflow/community-nodes/bcgov-sharepoint/credentials';
  extends = ['oAuth2Api'];
  properties: INodeProperties[] = [
    {
      displayName: 'Tenant ID',
      name: 'tenantId',
      type: 'string',
      default: '',
      required: true,
      description: 'The Azure AD tenant GUID or domain (e.g. bcgov.onmicrosoft.com)',
    },
    {
      displayName: 'Client ID',
      name: 'clientId',
      type: 'string',
      default: '',
      required: true,
    },
    {
      displayName: 'Client Secret',
      name: 'clientSecret',
      type: 'string',
      typeOptions: { password: true },
      default: '',
      required: true,
    },
    {
      displayName: 'Graph Base URL',
      name: 'graphBaseUrl',
      type: 'string',
      default: 'https://graph.microsoft.com/v1.0',
      required: true,
      description: 'Overridable for GCC/beta Graph endpoints',
    },
    {
      displayName: 'Default Site URL',
      name: 'defaultSiteUrl',
      type: 'string',
      default: '',
      description:
        'Used as the credential test target and as the Site parameter default, e.g. https://bcgov.sharepoint.com/sites/ENV-STB-TEST',
    },
    {
      displayName: 'Metadata Cache TTL (Min)',
      name: 'cacheTtlMinutes',
      type: 'number',
      default: 15,
      description: 'How long resolved site/list/column metadata is cached; 0 disables caching',
    },
    {
      displayName: 'Max Retries',
      name: 'maxRetries',
      type: 'number',
      default: 3,
      description: 'Maximum retry attempts on Graph throttling (429/503) responses',
    },
    {
      displayName: 'Grant Type',
      name: 'grantType',
      type: 'hidden',
      default: 'clientCredentials',
    },
    {
      displayName: 'Authentication',
      name: 'authentication',
      type: 'hidden',
      default: 'body',
    },
    {
      displayName: 'Scope',
      name: 'scope',
      type: 'hidden',
      default: 'https://graph.microsoft.com/.default',
    },
    {
      displayName: 'Access Token URL',
      name: 'accessTokenUrl',
      type: 'hidden',
      default: '={{"https://login.microsoftonline.com/" + $self["tenantId"] + "/oauth2/v2.0/token"}}',
    },
  ];

  // Deliberately avoids `new URL()` — n8n's expression sandbox reliably supports
  // standard String.prototype methods; the URL global is not guaranteed there.
  // Does NOT test against /sites/root: under Sites.Selected that 403s even for a
  // valid credential (spec section 5), which would make every correctly configured
  // credential look broken.
  test: ICredentialTestRequest = {
    request: {
      baseURL: '={{$credentials.graphBaseUrl}}',
      url: '=/sites/{{$credentials.defaultSiteUrl.replace(/^https?:\\/\\//, "").split("/")[0]}}:/{{$credentials.defaultSiteUrl.replace(/^https?:\\/\\/[^/]+\\//, "")}}', // NOSONAR — n8n expression template requires escaped regex, String.raw is not applicable,
      method: 'GET',
    },
  };
}
