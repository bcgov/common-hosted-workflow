import { instance } from './axios';

export type CstarRolesResponse = {
  roles: string[];
};

export type CstarGroupsResponse = {
  groups: string[];
};

export type CstarUsersResponse = {
  users: string[];
};

/**
 * Fetches workflow service roles from the backend.
 */
export function getCstarRoles(params: { tenantId: string; signal?: AbortSignal }) {
  return instance
    .get<CstarRolesResponse>('/ui-api/wil/cstar/roles', {
      headers: { 'X-TENANT-ID': params.tenantId },
      signal: params.signal,
    })
    .then((res) => res.data.roles);
}

/**
 * Fetches tenant groups from the CSTAR API (proxied through the backend).
 */
export function getCstarGroups(params: { tenantId: string; signal?: AbortSignal }) {
  return instance
    .get<CstarGroupsResponse>('/ui-api/wil/cstar/groups', {
      headers: { 'X-TENANT-ID': params.tenantId },
      signal: params.signal,
    })
    .then((res) => res.data.groups);
}

/**
 * Fetches tenant users from the CSTAR API (proxied through the backend).
 */
export function getCstarUsers(params: { tenantId: string; signal?: AbortSignal }) {
  return instance
    .get<CstarUsersResponse>('/ui-api/wil/cstar/users', {
      headers: { 'X-TENANT-ID': params.tenantId },
      signal: params.signal,
    })
    .then((res) => res.data.users);
}
