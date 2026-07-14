import {
  NodeConnectionTypes,
  NodeApiError,
  NodeOperationError,
  type IExecuteFunctions,
  type INodeExecutionData,
  type IDataObject,
  type JsonObject,
  type INodeType,
  type INodeTypeDescription,
} from 'n8n-workflow';
import {
  fetchToken,
  resolveEndpoints,
  validateCredentials,
  decodeJwt,
  verifyJwt,
  type OidcCredentials,
  type DecodedJwt,
  type GrantType,
} from './shared/GenericFunctions';

type ProcessingMode = 'none' | 'decode' | 'verify';

export class OidcToken implements INodeType {
  description: INodeTypeDescription = {
    displayName: 'OIDC Token',
    name: 'oidcToken',
    description:
      'Fetch an OAuth2 access token (client_credentials or password grant) from an OIDC Identity Provider and optionally decode/verify the JWT',
    icon: { light: 'file:../../icons/shield-lock.svg', dark: 'file:../../icons/shield-lock.dark.svg' },
    group: ['input'],
    version: 1,
    subtitle: '={{$parameter["grantType"] + " / " + $parameter["processingMode"]}}',
    defaults: {
      name: 'OIDC Token',
    },
    usableAsTool: true,
    inputs: [NodeConnectionTypes.Main],
    outputs: [NodeConnectionTypes.Main],
    credentials: [
      {
        name: 'oidcToken',
        required: true,
      },
    ],
    properties: [
      {
        displayName: 'Grant Type',
        name: 'grantType',
        type: 'options',
        noDataExpression: true,
        options: [
          {
            name: 'Client Credentials',
            value: 'client_credentials',
            description: 'Machine-to-machine flow using the client id and secret (RFC 6749 §4.4)',
          },
          {
            name: 'Password',
            value: 'password',
            description: 'Resource Owner Password Credentials grant using a username and password (RFC 6749 §4.3)',
          },
        ],
        default: 'client_credentials',
        description: 'The OAuth2 grant type used to request an access token',
      },
      {
        displayName: 'Token Processing Mode',
        name: 'processingMode',
        type: 'options',
        noDataExpression: true,
        options: [
          {
            name: 'Decode',
            value: 'decode',
            description: 'Extract the JWT claims payload without checking the signature',
          },
          { name: 'None', value: 'none', description: 'Output the raw access token JSON response' },
          {
            name: 'Verify',
            value: 'verify',
            description: 'Verify the signature against JWKS and check expiry (also decodes)',
          },
        ],
        default: 'none',
        description: 'How to process the retrieved JWT access token',
      },
      {
        displayName: 'Scope',
        name: 'scope',
        type: 'string',
        default: '',
        required: false,
        placeholder: 'openid profile',
        description: 'Optional space-separated OAuth2 scope(s) to request from the token endpoint',
      },
      {
        displayName: 'Clock Tolerance (seconds)',
        name: 'clockTolerance',
        type: 'number',
        default: 0,
        typeOptions: { minValue: 0 },
        required: false,
        displayOptions: {
          show: {
            processingMode: ['verify'],
          },
        },
        description: 'Amount of leeway (in seconds) applied when validating the exp and iat claims',
      },
      {
        displayName: 'Expected Issuer',
        name: 'expectedIssuer',
        type: 'string',
        default: '',
        required: false,
        displayOptions: {
          show: {
            processingMode: ['verify'],
          },
        },
        description: 'When set, the JWT iss claim is validated against this value',
      },
      {
        displayName: 'Expected Audience',
        name: 'expectedAudience',
        type: 'string',
        default: '',
        required: false,
        displayOptions: {
          show: {
            processingMode: ['verify'],
          },
        },
        description: 'When set, the JWT aud claim is validated against this value',
      },
    ],
  };

  async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
    const items = this.getInputData();
    const returnData: INodeExecutionData[] = [];

    const credentials = (await this.getCredentials('oidcToken')) as unknown as OidcCredentials;

    const grantType = this.getNodeParameter('grantType', 0) as GrantType;
    const processingMode = this.getNodeParameter('processingMode', 0) as ProcessingMode;
    const scope = this.getNodeParameter('scope', 0, '') as string;

    validateCredentials(credentials, grantType);

    const { tokenEndpoint, jwksUri } = await resolveEndpoints(this, credentials);

    for (const [i] of items.entries()) {
      try {
        const tokenResponse = await fetchToken(this, tokenEndpoint, credentials, grantType, scope || undefined);

        const enriched: IDataObject = { ...(tokenResponse as IDataObject) };

        if (processingMode === 'decode' || processingMode === 'verify') {
          const accessToken = tokenResponse.access_token as string | undefined;
          if (!accessToken) {
            throw new Error('Token response did not contain an access_token to decode');
          }

          let decoded: DecodedJwt;
          if (processingMode === 'verify') {
            if (!jwksUri) {
              throw new Error(
                'Token Processing Mode is "Verify" but no JWKS URI could be resolved. Configure OIDC JWKS URI in the credentials or enable discovery.',
              );
            }
            const clockTolerance = this.getNodeParameter('clockTolerance', i, 0) as number;
            const expectedIssuer = this.getNodeParameter('expectedIssuer', i, '') as string;
            const expectedAudience = this.getNodeParameter('expectedAudience', i, '') as string;
            decoded = await verifyJwt(this, accessToken, {
              jwksUri,
              clockTolerance,
              expectedIssuer: expectedIssuer || undefined,
              expectedAudience: expectedAudience || undefined,
            });
          } else {
            decoded = decodeJwt(accessToken);
          }

          enriched.tokenClaims = decoded.payload as IDataObject;
          enriched.decodedToken = {
            header: decoded.header,
            payload: decoded.payload,
            signature: decoded.signature,
          } as IDataObject;
        }

        const executionData = this.helpers.constructExecutionMetaData(this.helpers.returnJsonArray(enriched), {
          itemData: { item: i },
        });
        returnData.push(...executionData);
      } catch (error) {
        if (this.continueOnFail()) {
          returnData.push({
            json: { error: (error as Error).message } as IDataObject,
            pairedItem: { item: i },
          });
          continue;
        }
        if ((error as Error & { response?: unknown }).response) {
          throw new NodeApiError(this.getNode(), error as unknown as JsonObject);
        }
        throw new NodeOperationError(this.getNode(), error as Error, { itemIndex: i });
      }
    }

    return [returnData];
  }
}
