import { describe, expect, it, vi } from 'vitest';
import { CDOGSOAuth2Api } from '../../credentials/CDOGSOAuth2Api.credentials';
import { CDOGSDocumentGenerator } from '../../nodes/CDOGSDocumentGenerator/CDOGSDocumentGenerator.node';
import { CDOGS_OAUTH2_CREDENTIAL } from '../../nodes/CDOGSDocumentGenerator/shared/constants';
import {
  cdogsApiBinaryResponse,
  cdogsApiRequest,
  cdogsApiUploadTemplate,
} from '../../nodes/CDOGSDocumentGenerator/shared/GenericFunctions';

function createRequestContext(response: unknown = {}) {
  const httpRequestWithAuthentication = vi.fn().mockResolvedValue(response);
  const requestOAuth2 = vi.fn().mockResolvedValue(response);
  const context = {
    getNodeParameter: vi.fn((name: string) => {
      if (name === 'baseUrl') return 'https://cdogs-dev.api.gov.bc.ca/api/v2/';
      return undefined;
    }),
    getNode: vi.fn(() => ({ name: 'CDOGS' })),
    helpers: { httpRequestWithAuthentication, requestOAuth2 },
  };

  return { context, httpRequestWithAuthentication, requestOAuth2 };
}

describe('CDOGS OAuth2 credential', () => {
  it('extends the n8n OAuth2 credential so authenticated requests use OAuth2 signing', () => {
    const credential = new CDOGSOAuth2Api();

    expect(credential.name).toBe(CDOGS_OAUTH2_CREDENTIAL);
    expect(credential.extends).toContain('oAuth2Api');
    expect(credential.properties).toContainEqual(
      expect.objectContaining({
        name: 'grantType',
        type: 'hidden',
        default: 'clientCredentials',
      }),
    );
    expect(credential.properties).toContainEqual(
      expect.objectContaining({
        name: 'scope',
        type: 'hidden',
        default: 'openid',
      }),
    );
    expect(credential.properties).toContainEqual(
      expect.objectContaining({
        name: 'authentication',
        type: 'hidden',
        default: 'header',
      }),
    );
  });

  it('requires the dedicated credential on the CDOGS node', () => {
    const node = new CDOGSDocumentGenerator();

    expect(node.description.credentials).toEqual([
      {
        name: CDOGS_OAUTH2_CREDENTIAL,
        required: true,
      },
    ]);
    expect(node.description.properties).toContainEqual(
      expect.objectContaining({
        name: 'baseUrl',
        default: 'https://cdogs-dev.api.gov.bc.ca/api/v2',
      }),
    );

    expect(node.description.properties).toContainEqual(
      expect.objectContaining({
        name: 'overwrite',
        default: true,
        displayOptions: { show: { operation: ['generateFromInline'] } },
      }),
    );
    expect(node.description.properties).toContainEqual(
      expect.objectContaining({
        name: 'formatters',
        displayOptions: {
          show: {
            operation: ['generateFromExisting', 'generateFromInline'],
            enableFormatters: [true],
          },
        },
      }),
    );
  });
});

describe('CDOGS request helpers', () => {
  it('uses the dedicated OAuth2 credential for JSON API requests', async () => {
    const { context, httpRequestWithAuthentication } = createRequestContext({ status: 'ok' });

    await cdogsApiRequest.call(context as never, 'GET', '/health');

    expect(httpRequestWithAuthentication).toHaveBeenCalledWith(
      CDOGS_OAUTH2_CREDENTIAL,
      expect.objectContaining({
        method: 'GET',
        url: 'https://cdogs-dev.api.gov.bc.ca/api/v2/health',
        json: true,
      }),
    );
  });

  it('uses the dedicated OAuth2 credential for binary render requests', async () => {
    const response = { body: Buffer.from('document'), headers: { 'content-type': 'application/pdf' } };
    const { context, httpRequestWithAuthentication, requestOAuth2 } = createRequestContext(response);

    await cdogsApiBinaryResponse.call(context as never, 'POST', '/template/render', {
      data: { coors_file_no: '123456' },
    });

    expect(requestOAuth2).toHaveBeenCalledWith(
      CDOGS_OAUTH2_CREDENTIAL,
      expect.objectContaining({
        method: 'POST',
        url: 'https://cdogs-dev.api.gov.bc.ca/api/v2/template/render',
        body: JSON.stringify({ data: { coors_file_no: '123456' } }),
        encoding: null,
        resolveWithFullResponse: true,
        followAllRedirects: true,
      }),
      { tokenType: 'Bearer' },
    );
    expect(httpRequestWithAuthentication).not.toHaveBeenCalled();
  });

  it('uploads a template in the multipart field required by CDOGS', async () => {
    const buffer = Buffer.from('docx template');
    const { context, httpRequestWithAuthentication, requestOAuth2 } = createRequestContext({
      body: 'template-hash',
      headers: { 'x-template-hash': 'template-hash' },
    });

    const result = await cdogsApiUploadTemplate.call(
      context as never,
      buffer,
      'template.docx',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    );

    expect(requestOAuth2).toHaveBeenCalledWith(
      CDOGS_OAUTH2_CREDENTIAL,
      expect.objectContaining({
        method: 'POST',
        url: 'https://cdogs-dev.api.gov.bc.ca/api/v2/template',
        formData: {
          template: {
            value: buffer,
            options: {
              filename: 'template.docx',
              contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            },
          },
        },
        resolveWithFullResponse: true,
      }),
      { tokenType: 'Bearer' },
    );
    expect(httpRequestWithAuthentication).not.toHaveBeenCalled();
    expect(result).toEqual({ hash: 'template-hash', cached: false });
  });

  it('returns the existing hash when CDOGS reports that the template is already cached', async () => {
    const { context, requestOAuth2 } = createRequestContext();
    requestOAuth2.mockRejectedValue({
      statusCode: 405,
      response: {
        body: Buffer.from(JSON.stringify({ hash: 'cached-template-hash' })),
      },
    });

    const result = await cdogsApiUploadTemplate.call(
      context as never,
      Buffer.from('docx template'),
      'template.docx',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    );

    expect(result).toEqual({ hash: 'cached-template-hash', cached: true });
  });
});

describe('CDOGS inline rendering', () => {
  it('sends overwrite true so an identical inline template can be rendered again', async () => {
    const requestOAuth2 = vi.fn().mockResolvedValue({
      body: Buffer.from('rendered document'),
      headers: { 'content-type': 'application/pdf' },
    });
    const parameters: Record<string, unknown> = {
      operation: 'generateFromInline',
      baseUrl: 'https://cdogs-dev.api.gov.bc.ca/api/v2',
      templateSource: 'binary',
      templateBinaryPropertyName: 'template_file',
      data: '{"coorsFile":"123456"}',
      convertTo: 'pdf',
      reportName: 'demo',
      overwrite: true,
      enableFormatters: true,
      formatters: '{"myFormatter":"_function_myFormatter|function(data) { return data.slice(1); }"}',
      outputBinaryPropertyName: 'data',
    };
    const context = {
      getInputData: vi.fn(() => [{ json: {} }]),
      getNodeParameter: vi.fn((name: string) => parameters[name]),
      getNode: vi.fn(() => ({ name: 'CDOGS' })),
      continueOnFail: vi.fn(() => false),
      helpers: {
        assertBinaryData: vi.fn(() => ({
          fileName: 'template.docx',
          fileExtension: 'docx',
          mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        })),
        getBinaryDataBuffer: vi.fn().mockResolvedValue(Buffer.from('template content')),
        requestOAuth2,
        prepareBinaryData: vi.fn().mockResolvedValue({ data: 'binary-data' }),
        constructExecutionMetaData: vi.fn((items: unknown) => items),
      },
    };

    await new CDOGSDocumentGenerator().execute.call(context as never);

    const serializedBody = requestOAuth2.mock.calls[0]?.[1]?.body as string;
    expect(JSON.parse(serializedBody)).toEqual(
      expect.objectContaining({
        data: { coorsFile: '123456' },
        formatters: '{"myFormatter":"_function_myFormatter|function(data) { return data.slice(1); }"}',
        options: {
          convertTo: 'pdf',
          overwrite: true,
          reportName: 'demo',
        },
        template: expect.objectContaining({
          encodingType: 'base64',
          fileType: 'docx',
        }),
      }),
    );
  });

  it('preserves the DOCX extension when no output conversion is requested', async () => {
    const renderedDocument = Buffer.from('rendered docx');
    const expressionBinaryData = {
      data: 'filesystem-v2:workflows/test/executions/1/binary_data/template',
      fileName: 'template.docx',
      fileExtension: 'docx',
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    };
    const requestOAuth2 = vi.fn().mockResolvedValue({
      body: renderedDocument,
      headers: { 'content-type': 'application/octet-stream' },
    });
    const prepareBinaryData = vi.fn().mockResolvedValue({ data: 'binary-data' });
    const assertBinaryData = vi.fn(() => expressionBinaryData);
    const getBinaryDataBuffer = vi.fn().mockResolvedValue(Buffer.from('template content'));
    const parameters: Record<string, unknown> = {
      operation: 'generateFromInline',
      baseUrl: 'https://cdogs-dev.api.gov.bc.ca/api/v2',
      templateSource: 'binary',
      templateBinaryPropertyName: expressionBinaryData,
      data: '{}',
      convertTo: '',
      reportName: 'report',
      overwrite: true,
      enableFormatters: false,
      outputBinaryPropertyName: 'data',
    };
    const context = {
      getInputData: vi.fn(() => [{ json: {} }]),
      getNodeParameter: vi.fn((name: string) => parameters[name]),
      getNode: vi.fn(() => ({ name: 'CDOGS' })),
      continueOnFail: vi.fn(() => false),
      helpers: {
        assertBinaryData,
        getBinaryDataBuffer,
        requestOAuth2,
        prepareBinaryData,
        constructExecutionMetaData: vi.fn((items: unknown) => items),
      },
    };

    await new CDOGSDocumentGenerator().execute.call(context as never);

    const serializedBody = requestOAuth2.mock.calls[0]?.[1]?.body as string;
    expect(JSON.parse(serializedBody).options).toEqual({
      overwrite: true,
      reportName: 'report',
    });
    expect(assertBinaryData).toHaveBeenCalledWith(0, expressionBinaryData);
    expect(getBinaryDataBuffer).toHaveBeenCalledWith(0, expressionBinaryData);
    expect(prepareBinaryData).toHaveBeenCalledWith(renderedDocument, 'report.docx');
  });
});

describe('CDOGS file type options', () => {
  function createLoadOptionsContext(templateSource: string) {
    const httpRequestWithAuthentication = vi.fn().mockResolvedValue({
      dictionary: {
        docx: ['docx', 'pdf'],
        html: ['html', 'pdf'],
        xlsx: ['pdf', 'xlsx'],
      },
    });
    return {
      context: {
        getNodeParameter: vi.fn(() => 'https://cdogs-dev.api.gov.bc.ca/api/v2/'),
        getCurrentNodeParameters: vi.fn(() => ({
          operation: 'generateFromInline',
          templateSource,
          contentFileType: 'html',
        })),
        getNode: vi.fn(() => ({ name: 'CDOGS' })),
        helpers: { httpRequestWithAuthentication },
      },
      httpRequestWithAuthentication,
    };
  }

  it('loads and filters conversions from CDOGS for a known text template type', async () => {
    const node = new CDOGSDocumentGenerator();
    const { context, httpRequestWithAuthentication } = createLoadOptionsContext('text');

    const options = await node.methods.loadOptions.getConvertToOptions.call(context as never);

    expect(httpRequestWithAuthentication).toHaveBeenCalledWith(
      CDOGS_OAUTH2_CREDENTIAL,
      expect.objectContaining({
        method: 'GET',
        url: 'https://cdogs-dev.api.gov.bc.ca/api/v2/fileTypes',
      }),
    );
    expect(options).toEqual([
      { name: 'None (Same Format)', value: '' },
      { name: 'HTML', value: 'html' },
      { name: 'PDF', value: 'pdf' },
    ]);
  });

  it('loads all unique API conversions when the binary input type is not available in the editor', async () => {
    const node = new CDOGSDocumentGenerator();
    const { context } = createLoadOptionsContext('binary');

    const options = await node.methods.loadOptions.getConvertToOptions.call(context as never);

    expect(options).toEqual([
      { name: 'None (Same Format)', value: '' },
      { name: 'DOCX', value: 'docx' },
      { name: 'HTML', value: 'html' },
      { name: 'PDF', value: 'pdf' },
      { name: 'XLSX', value: 'xlsx' },
    ]);
  });
});
