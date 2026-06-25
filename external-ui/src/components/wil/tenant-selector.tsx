import { useQuery } from '@tanstack/react-query';
import { getWilTenants, type WilTenantItem } from '../../services/backend/wil';

interface TenantSelectorProps {
  tenantId: string;
  onTenantChange: (tenant: WilTenantItem | null) => void;
}

export function TenantSelector({ tenantId, onTenantChange }: Readonly<TenantSelectorProps>) {
  const tenantsQuery = useQuery({
    queryKey: ['wil-tenants'],
    queryFn: ({ signal }) => getWilTenants(signal),
  });

  const tenants = tenantsQuery.data?.tenants ?? [];

  function handleChange(id: string) {
    const tenant = tenants.find((t) => t.id === id) ?? null;
    onTenantChange(tenant);
  }

  return (
    <div className="flex items-center gap-2">
      <label htmlFor="tenant-select" className="text-sm font-medium text-[var(--bc-text)] whitespace-nowrap">
        Tenant:
      </label>
      <select
        id="tenant-select"
        value={tenantId}
        onChange={(e) => handleChange(e.target.value)}
        disabled={tenantsQuery.isLoading}
        className="h-9 min-w-48 rounded-md border border-[var(--bc-border)] bg-white px-3 text-sm text-[var(--bc-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--bc-blue)]"
      >
        <option value="">{tenantsQuery.isLoading ? 'Loading tenants...' : 'Select a tenant'}</option>
        {tenants.map((tenant) => (
          <option key={tenant.id} value={tenant.id}>
            {tenant.name}
          </option>
        ))}
      </select>
    </div>
  );
}
