import { instance } from './axios';

export type AdminProjectItem = {
  projectId: string;
  projectName: string;
  projectType: string;
  tenantId: string | null;
};

export type AdminProjectsResponse = {
  data: AdminProjectItem[];
  pagination: {
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
  };
};

export type UserProjectTenantItem = {
  tenantId: string;
  tenantName: string;
  projectId: string | null;
};

export type UserProjectsResponse = {
  data: UserProjectTenantItem[];
};

export function getAdminProjects(params: { page: number; pageSize: number; signal?: AbortSignal }) {
  return instance
    .get<AdminProjectsResponse>('/ui-api/admin/projects', {
      params: { page: params.page, pageSize: params.pageSize },
      signal: params.signal,
    })
    .then((res) => res.data);
}

export function updateProjectTenant(projectId: string, tenantId: string) {
  return instance
    .put<void>(`/ui-api/admin/projects/${encodeURIComponent(projectId)}/tenant`, { tenantId })
    .then((res) => res.data);
}

export function deleteProjectTenant(projectId: string) {
  return instance
    .delete<void>(`/ui-api/admin/projects/${encodeURIComponent(projectId)}/tenant`)
    .then((res) => res.data);
}

export function getUserProjects(signal?: AbortSignal) {
  return instance.get<UserProjectsResponse>('/ui-api/projects', { signal }).then((res) => res.data);
}
