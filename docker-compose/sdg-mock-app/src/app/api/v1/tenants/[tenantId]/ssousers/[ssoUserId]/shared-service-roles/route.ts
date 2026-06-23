import { NextRequest, NextResponse } from 'next/server';
import mockData from '../../../../../mock-data.json';

type RouteParams = {
  tenantId: string;
  ssoUserId: string;
};

/**
 * Mock CSTAR: GET /api/cstar/v1/tenants/{tenantId}/ssousers/{ssoUserId}/shared-service-roles
 *
 * Returns shared service roles for a user in a specific tenant.
 * Roles are configured per-tenant in mock-data.json.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<RouteParams> }) {
  const { tenantId, ssoUserId } = await params;

  console.log(`[cstar-mock] GET /tenants/${tenantId}/ssousers/${ssoUserId}/shared-service-roles`);

  const roles =
    (
      mockData.sharedServiceRoles as Record<
        string,
        (typeof mockData.sharedServiceRoles)[keyof typeof mockData.sharedServiceRoles]
      >
    )[tenantId] ?? [];

  return NextResponse.json({
    data: {
      sharedServiceRoles: roles,
    },
  });
}
