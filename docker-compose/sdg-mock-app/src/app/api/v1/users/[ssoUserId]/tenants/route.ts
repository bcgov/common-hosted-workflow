import { NextRequest, NextResponse } from 'next/server';
import mockData from '../../../mock-data.json';

/**
 * Mock CSTAR: GET /api/cstar/v1/users/{ssoUserId}/tenants
 *
 * Returns all tenants for the given user. In this mock, every user
 * gets the same set of tenants from mock-data.json.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ ssoUserId: string }> }) {
  const { ssoUserId } = await params;

  console.log(`[cstar-mock] GET /users/${ssoUserId}/tenants`);

  return NextResponse.json({
    data: {
      tenants: mockData.tenants,
    },
  });
}
