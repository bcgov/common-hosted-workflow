import axios from 'axios';
import { AppError } from '../utils/errors';
import { createLogger } from '../utils/logger';
import { buildPath } from '../utils/url';
import { CHEFS_BASE_URL, CHEFS_GATEWAY_URL } from '@config';

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
    this.gatewayUrl = CHEFS_GATEWAY_URL;
    this.baseUrl = CHEFS_BASE_URL ? `${CHEFS_BASE_URL}/app` : '';
  }

  async getFormToken(params: GetFormTokenParams): Promise<GetFormTokenResult> {
    const { formId, formApiKey } = params;
    const tokenUrl = `${this.gatewayUrl}/${buildPath('auth', 'token', 'forms', formId)}`;
    const credentials = Buffer.from(`${formId}:${formApiKey}`).toString('base64');

    log.debug('CHEFS token exchange request', { tokenUrl, formId, gatewayUrl: this.gatewayUrl });

    try {
      const response = await axios.post<{ token: string }>(tokenUrl, undefined, {
        headers: {
          Authorization: `Basic ${credentials}`,
          'Content-Type': 'application/json',
        },
      });

      return {
        authToken: response.data.token,
        formId,
        baseUrl: this.baseUrl,
      };
    } catch (err) {
      if (axios.isAxiosError(err) && err.response) {
        log.error('CHEFS token exchange returned non-OK status', {
          status: err.response.status,
          tokenUrl,
          responseData: JSON.stringify(err.response.data),
        });
      } else {
        log.error('CHEFS token exchange network error', {
          error: String(err),
          tokenUrl,
          gatewayUrl: this.gatewayUrl,
          baseUrl: this.baseUrl,
        });
      }
      throw new AppError(502, 'CHEFS token exchange failed');
    }
  }
}
