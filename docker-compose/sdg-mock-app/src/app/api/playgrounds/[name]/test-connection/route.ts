import { NextRequest, NextResponse } from 'next/server';
import { resolvePlaygroundConfig } from '@/lib/playground-resolve';
import type { ConnectionTestResult } from '@/types/playground';

type RouteContext = { params: Promise<{ name: string }> };

/** Timeout in milliseconds for the upstream connection test request. */
const CONNECTION_TIMEOUT_MS = 10_000;

/**
 * POST /api/playgrounds/[name]/test-connection
 *
 * Tests connectivity to the playground's configured n8n instance.
 * Looks up credentials from the database, attempts a GET to
 * `n8nTarget/rest/custom/v1` with the API key and tenant ID headers,
 * and returns a ConnectionTestResult indicating success or failure.
 *
 * Always returns HTTP 200 — the ConnectionTestResult itself indicates
 * whether the upstream connection succeeded or failed.
 */
export async function POST(_request: NextRequest, { params }: RouteContext) {
  const { name } = await params;

  let config;
  try {
    config = resolvePlaygroundConfig(name);
  } catch {
    console.error('Database error while resolving playground config');
    return NextResponse.json({ error: 'Database error' }, { status: 500 });
  }

  if (!config) {
    return NextResponse.json({ error: 'Playground not found' }, { status: 404 });
  }

  const startTime = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), CONNECTION_TIMEOUT_MS);

  try {
    const targetUrl = `${config.n8nTarget}/healthz`;
    const response = await fetch(targetUrl, {
      method: 'GET',
      signal: controller.signal,
    });

    const responseTimeMs = Date.now() - startTime;

    const result: ConnectionTestResult = {
      success: response.ok,
      status: response.status,
      message: response.ok ? 'Connected successfully' : `Upstream returned HTTP ${response.status}`,
      responseTimeMs,
    };

    return NextResponse.json(result);
  } catch (err: unknown) {
    const responseTimeMs = Date.now() - startTime;

    const message = getErrorMessage(err);

    const result: ConnectionTestResult = {
      success: false,
      message,
      responseTimeMs,
    };

    return NextResponse.json(result);
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Extract a human-readable error message from an unknown error.
 */
function getErrorMessage(err: unknown): string {
  if (err instanceof DOMException && err.name === 'AbortError') {
    return `Connection timed out after ${CONNECTION_TIMEOUT_MS}ms`;
  }

  if (err instanceof TypeError) {
    // fetch throws TypeError for network-level failures (DNS, connection refused, etc.)
    return `Connection failed: ${err.message}`;
  }

  if (err instanceof Error) {
    return `Connection failed: ${err.message}`;
  }

  return 'Connection failed: unknown error';
}
