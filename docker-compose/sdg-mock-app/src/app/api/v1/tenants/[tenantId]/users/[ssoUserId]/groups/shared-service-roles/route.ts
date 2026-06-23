import { NextRequest, NextResponse } from 'next/server';
import mockData from '../../../../../../mock-data.json';

type RouteParams = {
  tenantId: string;
  ssoUserId: string;
};

/**
 * Mock CSTAR: GET /api/cstar/v1/tenants/{tenantId}/users/{ssoUserId}/groups/shared-service-roles
 *
 * Returns groups with shared service roles for a user in a tenant.
 * Groups are configured per-tenant in mock-data.json.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<RouteParams> }) {
  const { tenantId, ssoUserId } = await params;

  console.log(`[cstar-mock] GET /tenants/${tenantId}/users/${ssoUserId}/groups/shared-service-roles`);

  const groups = (mockData.groups as Record<string, unknown[]>)[tenantId] ?? [];

  return NextResponse.json({
    data: {
      groups,
    },
  });
}
