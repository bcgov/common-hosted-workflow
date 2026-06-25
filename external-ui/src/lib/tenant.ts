import type { WilTenantItem } from '../services/backend/wil';

export const TENANT_SOURCE = {
  Personal: 'personal',
  Cstar: 'cstar',
} as const;

export type TenantSource = (typeof TENANT_SOURCE)[keyof typeof TENANT_SOURCE];

export function isPersonalTenant(tenant: WilTenantItem | null | undefined): boolean {
  return tenant?.source === TENANT_SOURCE.Personal;
}
