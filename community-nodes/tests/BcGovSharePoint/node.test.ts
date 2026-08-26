import { describe, expect, it, vi } from 'vitest';
import { BcGovSharePoint } from '../../nodes/BcGovSharePoint/BcGovSharePoint.node';

describe('BcGovSharePoint node', () => {
  const node = new BcGovSharePoint();

  it('has the expected identity', () => {
    expect(node.description.displayName).toBe('BC Gov SharePoint');
    expect(node.description.name).toBe('bcGovSharePoint');
    expect(node.description.version).toBe(1);
    expect(node.description.usableAsTool).toBe(true);
  });

  it('declares the bcGovSharePointOAuth2Api credential as required', () => {
    expect(node.description.credentials).toEqual([{ name: 'bcGovSharePointOAuth2Api', required: true }]);
  });

  it('exposes item and user resources', () => {
    const resourceProp = node.description.properties.find((p) => p.name === 'resource');
    const values = (resourceProp?.options as Array<{ value: string }>).map((o) => o.value);
    expect(values).toEqual(expect.arrayContaining(['item', 'user']));
  });

  it('exposes all six item operations', () => {
    const operationProp = node.description.properties.find((p) => p.name === 'itemOperation');
    const values = (operationProp?.options as Array<{ value: string }>).map((o) => o.value);
    expect(values).toEqual(expect.arrayContaining(['create', 'createOrUpdate', 'delete', 'get', 'getMany', 'update']));
  });
});

describe('BcGovSharePoint execute() — Item Create wiring', () => {
  it('resolves site/list/columns via the credential, coerces fields, and creates the item', async () => {
    const httpRequestWithAuthentication = vi
      .fn()
      // resolveSiteId
      .mockResolvedValueOnce({ id: 'bcgov.sharepoint.com,coll-1,web-1' })
      // resolveListId (filtered)
      .mockResolvedValueOnce({ value: [{ id: 'list-1', displayName: 'Section24Referrals' }] })
      // getColumnMap
      .mockResolvedValueOnce({ value: [{ name: 'Title', displayName: 'Title', text: {} }] })
      // createItem POST
      .mockResolvedValueOnce({ id: '99', fields: { Title: 'Referral A' } });

    const params: Record<string, unknown> = {
      resource: 'item',
      itemOperation: 'create',
      site: { mode: 'url', value: 'https://bcgov.sharepoint.com/sites/ENV-STB-TEST' },
      list: { mode: 'name', value: 'Section24Referrals' },
      fieldsJson: '{"Title":"Referral A"}',
    };

    const node = new BcGovSharePoint();
    const executeFunctions = {
      getInputData: () => [{ json: {} }],
      getNodeParameter: (name: string) => params[name],
      getCredentials: async () => ({
        tenantId: 'tenant-1',
        clientId: 'client-1',
        graphBaseUrl: 'https://graph.microsoft.com/v1.0',
        defaultSiteUrl: '',
        cacheTtlMinutes: 15,
        maxRetries: 3,
      }),
      getNode: () => ({ name: 'BC Gov SharePoint' }),
      continueOnFail: () => false,
      helpers: {
        httpRequestWithAuthentication,
        constructExecutionMetaData: (data: unknown, meta: unknown) =>
          (data as unknown[]).map((d) => ({ ...(d as object), pairedItem: (meta as { itemData: unknown }).itemData })),
        returnJsonArray: (data: unknown) => [{ json: data as object }],
      },
    };

    const result = await node.execute.call(executeFunctions as never);

    expect(result[0][0].json).toEqual({ id: '99', fields: { Title: 'Referral A' } });
    expect(httpRequestWithAuthentication).toHaveBeenCalledTimes(4);
    expect(httpRequestWithAuthentication.mock.calls[3][1]).toMatchObject({
      method: 'POST',
      url: 'https://graph.microsoft.com/v1.0/sites/bcgov.sharepoint.com,coll-1,web-1/lists/list-1/items',
      body: { fields: { Title: 'Referral A' } },
    });
  });
});

describe('BcGovSharePoint node — File + List resources', () => {
  it('exposes file and list resources with their operations', () => {
    const node = new BcGovSharePoint();
    const resourceProp = node.description.properties.find((p) => p.name === 'resource');
    const values = (resourceProp?.options as Array<{ value: string }>).map((o) => o.value);
    expect(values).toEqual(expect.arrayContaining(['item', 'user', 'file', 'list']));

    const fileOp = node.description.properties.find((p) => p.name === 'fileOperation');
    expect((fileOp?.options as Array<{ value: string }>).map((o) => o.value)).toEqual(
      expect.arrayContaining(['download', 'update', 'upload']),
    );

    const listOp = node.description.properties.find((p) => p.name === 'listOperation');
    expect((listOp?.options as Array<{ value: string }>).map((o) => o.value)).toEqual(
      expect.arrayContaining(['get', 'getMany']),
    );
  });
});

describe('BcGovSharePoint execute() — File Download wiring', () => {
  it('resolves site/drive via the credential and returns binary output', async () => {
    const httpRequestWithAuthentication = vi
      .fn()
      .mockResolvedValueOnce({ id: 'bcgov.sharepoint.com,coll-1,web-1' }) // resolveSiteId
      .mockResolvedValueOnce({ id: 'drive-default' }) // resolveDriveId (default)
      .mockResolvedValueOnce({ name: 'report.pdf', file: { mimeType: 'application/pdf' } }); // download metadata
    const requestOAuth2 = vi.fn().mockResolvedValue({ body: Buffer.from('%PDF'), headers: {} });

    const params: Record<string, unknown> = {
      resource: 'file',
      fileOperation: 'download',
      site: { mode: 'url', value: 'https://bcgov.sharepoint.com/sites/ENV-STB-TEST' },
      drive: { mode: 'default', value: '' },
      itemId: 'item-1',
      outputBinaryPropertyName: 'data',
      refreshCache: false,
    };

    const node = new BcGovSharePoint();
    const executeFunctions = {
      getInputData: () => [{ json: {} }],
      getNodeParameter: (name: string, _index: number, fallback?: unknown) =>
        name in params ? params[name] : fallback,
      getCredentials: async () => ({
        tenantId: 'tenant-file-download',
        clientId: 'client-file-download',
        graphBaseUrl: 'https://graph.microsoft.com/v1.0',
        defaultSiteUrl: '',
        cacheTtlMinutes: 15,
        maxRetries: 3,
      }),
      getNode: () => ({ name: 'BC Gov SharePoint' }),
      continueOnFail: () => false,
      helpers: {
        httpRequestWithAuthentication,
        requestOAuth2,
        prepareBinaryData: async (buffer: Buffer, fileName: string, mimeType: string) => ({
          data: buffer.toString('base64'),
          fileName,
          mimeType,
        }),
        constructExecutionMetaData: (data: unknown, meta: unknown) =>
          (data as unknown[]).map((d) => ({ ...(d as object), pairedItem: (meta as { itemData: unknown }).itemData })),
        returnJsonArray: (data: unknown) => [{ json: data as object }],
      },
    };

    const result = await node.execute.call(executeFunctions as never);

    expect(result[0][0].json).toEqual({ fileName: 'report.pdf', mimeType: 'application/pdf' });
    expect((result[0][0] as { binary?: { data?: { fileName: string } } }).binary?.data?.fileName).toBe('report.pdf');
    expect(httpRequestWithAuthentication).toHaveBeenCalledTimes(3);
    expect(requestOAuth2).toHaveBeenCalledOnce();
  });
});
