import { AppError } from '../utils/errors';
import { createLogger } from '../utils/logger';

const log = createLogger('ChefsService');

export type GetFormTokenParams = {
  formId: string;
  formApiKey: string;
};

export type GetFormTokenResult = {
  authToken: string;
  formId: string;
  baseUrl: string;
};

export class ChefsService {
  private readonly gatewayUrl: string;
  private readonly baseUrl: string;

  constructor() {
    this.gatewayUrl = process.env.CHEFS_GATEWAY_URL || 'https://submit.digital.gov.bc.ca/app/gateway/v1';
    this.baseUrl = this.gatewayUrl.replace(/\/gateway\/v\d+\/?$/, '');
  }

  async getFormToken(params: GetFormTokenParams): Promise<GetFormTokenResult> {
    const { formId, formApiKey } = params;
    const tokenUrl = `${this.gatewayUrl}/auth/token/forms/${formId}`;
    const credentials = Buffer.from(`${formId}:${formApiKey}`).toString('base64');

    let tokenResponse: Response;
    try {
      tokenResponse = await fetch(tokenUrl, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${credentials}`,
          'Content-Type': 'application/json',
        },
      });
    } catch (err) {
      log.error('CHEFS token exchange network error', { error: String(err) });
      throw new AppError(502, 'CHEFS token exchange failed');
    }

    if (!tokenResponse.ok) {
      log.error('CHEFS token exchange returned non-OK status', { status: tokenResponse.status });
      throw new AppError(502, 'CHEFS token exchange failed');
    }

    const tokenData = (await tokenResponse.json()) as { token: string };

    return {
      authToken: tokenData.token,
      formId,
      baseUrl: this.baseUrl,
    };
  }
}
