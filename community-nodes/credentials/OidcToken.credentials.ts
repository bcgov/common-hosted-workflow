import { Icon, type ICredentialType, type INodeProperties } from 'n8n-workflow';

export class OidcToken implements ICredentialType {
  name = 'oidcToken';
  icon: Icon = { light: 'file:../icons/shield-lock.svg', dark: 'file:../icons/shield-lock.dark.svg' };
  displayName = 'OIDC';
  documentationUrl = 'https://github.com/bcgov/common-hosted-workflow/tree/main/docs/community-nodes/oidc-token';
  properties: INodeProperties[] = [
    {
      displayName: 'OIDC Issuer',
      name: 'oidcIssuer',
      type: 'string',
      default: '',
      required: false,
      placeholder: 'https://login.example.com/realms/myrealm',
      description:
        'Base URL of the Identity Provider. Endpoints are auto-discovered via /.well-known/openid-configuration. Provide this OR the Token Endpoint below.',
    },
    {
      displayName: 'OIDC Token Endpoint',
      name: 'oidcTokenEndpoint',
      type: 'string',
      default: '',
      required: false,
      placeholder: 'https://login.example.com/realms/myrealm/protocol/openid-connect/token',
      description:
        'Direct token endpoint URL. Used when OIDC Issuer is not provided. Provide this OR the Issuer above.',
    },
    {
      displayName: 'OIDC JWKS URI',
      name: 'oidcJwksUri',
      type: 'string',
      default: '',
      required: false,
      placeholder: 'https://login.example.com/realms/myrealm/protocol/openid-connect/certs',
      description: 'URL of the JSON Web Key Set used to cryptographically verify token signatures.',
    },
    {
      displayName: 'Client ID',
      name: 'oidcClientId',
      type: 'string',
      default: '',
      required: true,
      description: 'The client ID registered with the Identity Provider.',
    },
    {
      displayName: 'Client Secret',
      name: 'oidcClientSecret',
      type: 'string',
      typeOptions: { password: true },
      default: '',
      required: false,
      description:
        'The client secret registered with the Identity Provider. Required for the Client Credentials grant and most Password grant deployments. Some IdPs accept public clients (no secret) on the Password grant — leave blank only in that case.',
    },
    {
      displayName: 'Username',
      name: 'oidcUsername',
      type: 'string',
      default: '',
      required: false,
      description:
        'The resource owner username. Only used when the node Grant Type is set to Password; ignored for Client Credentials.',
    },
    {
      displayName: 'Password',
      name: 'oidcPassword',
      type: 'string',
      typeOptions: { password: true },
      default: '',
      required: false,
      description:
        'The resource owner password. Required only when the node Grant Type is set to Password; ignored for Client Credentials.',
    },
  ];
}
