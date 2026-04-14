import { NextRequest, NextResponse } from 'next/server';
import chefsConfig from '../chefs-config.json';
import { wilGet } from '@/lib/wil-proxy';

const CHEFS_BASE_URL = process.env.CHEFS_BASE_URL || 'https://submit.digital.gov.bc.ca/app';

/**
 * GET /api/chefs/token?formId=abc-123[&actionId=xyz-456]
 *
 * Two modes:
 *
 * 1. Forms panel (no actionId):
 *    Looks up the form in chefs-config.json → uses the stored apiKey.
 *
 * 2. Action "showform" (with actionId):
 *    Fetches the action from the WIL API → extracts the apiKey from
 *    action.payload.FormAPIKey (set by the n8n workflow).
 *    The apiKey never reaches the frontend.
 *
 * In both cases, calls the CHEFS gateway token endpoint server-to-server
 * with Basic auth (formId:apiKey) and returns the short-lived JWT.
 *
 * @see https://developer.gov.bc.ca/docs/default/component/chefs-techdocs/Capabilities/Integrations/Embedding-Webcomponent/#getting-an-auth-token
 */
export async function GET(request: NextRequest) {
  const formId = request.nextUrl.searchParams.get('formId');
  const actionId = request.nextUrl.searchParams.get('actionId');

  if (!formId) {
    return NextResponse.json({ error: 'formId query parameter is required' }, { status: 400 });
  }

  let apiKey: string | undefined;
  let formName = '';

  if (actionId) {
    // ── Mode 2: Get apiKey from the action's payload ──
    try {
      const resp = await wilGet(`/actions/${encodeURIComponent(actionId)}`);
      if (!resp.ok) {
        const text = await resp.text();
        console.error(`[chefs-token] Failed to fetch action ${actionId}: ${resp.status} ${text}`);
        return NextResponse.json({ error: 'Failed to fetch action from WIL' }, { status: resp.status });
      }
      const action = await resp.json();
      // Support both casings: FormAPIKey / formApiKey
      apiKey = action.payload?.FormAPIKey ?? action.payload?.formApiKey ?? action.payload?.apiKey;
      formName = action.payload?.FormName ?? action.payload?.formName ?? '';
    } catch (err) {
      console.error('[chefs-token] Error fetching action:', err);
      return NextResponse.json({ error: 'Failed to reach WIL API' }, { status: 502 });
    }
  } else {
    // ── Mode 1: Get apiKey from chefs-config.json ──
    const entry = chefsConfig.forms.find((f) => f.formId === formId);
    if (!entry) {
      return NextResponse.json({ error: 'Form not found in configuration' }, { status: 404 });
    }
    apiKey = entry.apiKey;
    formName = entry.formName;
  }

  if (!apiKey) {
    return NextResponse.json({ error: 'No API key available for this form' }, { status: 400 });
  }

  // Call the CHEFS gateway token endpoint with Basic auth
  const basicAuth = Buffer.from(`${formId}:${apiKey}`).toString('base64');
  const tokenUrl = `${CHEFS_BASE_URL}/gateway/v1/auth/token/forms/${formId}`;

  try {
    const resp = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Basic ${basicAuth}`,
      },
      body: JSON.stringify({ formId }),
    });

    if (!resp.ok) {
      const text = await resp.text();
      console.error(`[chefs-token] CHEFS token endpoint failed: ${resp.status} ${text}`);
      return NextResponse.json(
        { error: 'Failed to obtain auth token from CHEFS', detail: text },
        { status: resp.status },
      );
    }

    const data = await resp.json();
    return NextResponse.json({ formId, formName, authToken: data.token });
  } catch (err) {
    console.error('[chefs-token] Error calling CHEFS token endpoint:', err);
    return NextResponse.json({ error: 'Failed to reach CHEFS server' }, { status: 502 });
  }
}
