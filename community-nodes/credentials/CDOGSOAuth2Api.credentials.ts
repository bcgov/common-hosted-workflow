import { type ICredentialType, type INodeProperties, type Icon } from 'n8n-workflow';

/**
 * OAuth2 client-credentials authentication for the Common Document Generation Service.
 *
 * A dedicated credential type is required here. n8n's httpRequestWithAuthentication
 * helper detects OAuth2 credentials through their parent type, so using oAuth2Api
 * directly does not invoke the OAuth2 request-signing path.
 */
export class CDOGSOAuth2Api implements ICredentialType {
  name = 'cdogsOAuth2Api';
  icon: Icon = { light: 'file:../icons/document-generate.svg', dark: 'file:../icons/document-generate.dark.svg' };
  displayName = 'CDOGS OAuth2 API';
  documentationUrl =
    'https://github.com/bcgov/common-hosted-workflow/tree/main/docs/community-nodes/cdogs-document-generator';
  extends = ['oAuth2Api'];
  properties: INodeProperties[] = [
    {
      displayName: 'Grant Type',
      name: 'grantType',
      type: 'hidden',
      default: 'clientCredentials',
    },
    {
      displayName: 'Scope',
      name: 'scope',
      type: 'hidden',
      default: 'openid',
    },
    {
      displayName: 'Authentication',
      name: 'authentication',
      type: 'hidden',
      default: 'header',
    },
  ];
}
