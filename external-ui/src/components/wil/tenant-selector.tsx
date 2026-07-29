import { useQuery } from '@tanstack/react-query';
import { getWilTenants, type WilTenantItem } from '../../services/backend/wil';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';

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
    <div className="flex min-w-0 flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-2">
      <Label htmlFor="tenant-select" className="whitespace-nowrap">
        Tenant
      </Label>
      <Select
        id="tenant-select"
        value={tenantId}
        onChange={(e) => handleChange(e.target.value)}
        disabled={tenantsQuery.isLoading}
        className="min-w-48"
      >
        <option value="">{tenantsQuery.isLoading ? 'Loading tenants...' : 'Select a tenant'}</option>
        {tenants.map((tenant) => (
          <option key={tenant.id} value={tenant.id}>
            {tenant.name}
          </option>
        ))}
      </Select>
    </div>
  );
}
