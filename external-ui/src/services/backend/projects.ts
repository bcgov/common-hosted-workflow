import { instance } from './axios';

export type RateLimitStopBehavior = 'hard_stop' | 'soft_stop';

export type AdminProjectItem = {
  projectId: string;
  projectName: string;
  projectType: string;
  tenantId: string | null;
  weeklyRateLimit: number | null;
  yearlyRateLimit: number | null;
  stopBehavior: RateLimitStopBehavior | null;
  lastAdminComment: string | null;
  weeklyExecutionCount: number;
  yearlyExecutionCount: number;
  /** Runs added by top-ups for the current week (0 when none). */
  weeklyTopupRuns: number;
  workflowCount: number;
  membersCount: number;
  updatedAt: string | null;
  updatedByName: string | null;
};

export type UpdateProjectRateLimitBody = {
  weeklyRateLimit: number | null;
  yearlyRateLimit: number | null;
  lastAdminComment: string | null;
  stopBehavior: RateLimitStopBehavior;
};

export type ProjectRateLimitRow = UpdateProjectRateLimitBody & {
  projectId: string;
  createdAt: string;
  updatedAt: string;
};

export type UpdateProjectRateLimitResponse = {
  success: true;
  message: string;
  rateLimit: ProjectRateLimitRow;
};

export type ProjectWorkflowUsageItem = {
  workflowId: string;
  workflowName: string;
  weeklyCount: number;
  yearlyCount: number;
};

export type ProjectWorkflowUsage = {
  projectId: string;
  weeklyPeriodKey: string;
  yearlyPeriodKey: string;
  workflows: ProjectWorkflowUsageItem[];
};

/** One weekly-limit top-up row. */
export type ProjectTopupItem = {
  id: string;
  projectId: string;
  periodKey: string;
  amount: number;
  adminComment: string;
  createdBy: string | null;
  createdAt: string;
};

export type ProjectTopupsResponse = {
  data: ProjectTopupItem[];
  pagination: {
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
  };
};

export type CreateProjectTopupBody = {
  periodKey: string;
  amount: number;
  adminComment: string;
};

export type CreateProjectTopupResponse = {
  success: true;
  message: string;
  topup: ProjectTopupItem;
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

export function getAdminProjects(params: {
  page: number;
  pageSize: number;
  search?: string;
  type?: string;
  signal?: AbortSignal;
}) {
  const { signal, search, type, ...rest } = params;
  return instance
    .get<AdminProjectsResponse>('/ui-api/admin/projects', {
      params: { ...rest, ...(search ? { search } : {}), ...(type && type !== 'all' ? { type } : {}) },
      signal,
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

export function updateProjectRateLimit(projectId: string, body: UpdateProjectRateLimitBody) {
  return instance
    .put<UpdateProjectRateLimitResponse>(`/ui-api/admin/projects/${encodeURIComponent(projectId)}/rate-limit`, body)
    .then((res) => res.data);
}

export function getAdminProject(projectId: string, signal?: AbortSignal) {
  return instance
    .get<AdminProjectItem>(`/ui-api/admin/projects/${encodeURIComponent(projectId)}`, { signal })
    .then((res) => res.data);
}

export function getProjectWorkflowUsage(projectId: string, signal?: AbortSignal) {
  return instance
    .get<ProjectWorkflowUsage>(`/ui-api/admin/projects/${encodeURIComponent(projectId)}/workflow-usage`, {
      signal,
    })
    .then((res) => res.data);
}

export function listProjectTopups(projectId: string, page: number, pageSize: number, signal?: AbortSignal) {
  return instance
    .get<ProjectTopupsResponse>(`/ui-api/admin/projects/${encodeURIComponent(projectId)}/topups`, {
      params: { page, pageSize },
      signal,
    })
    .then((res) => res.data);
}

export function createProjectTopup(projectId: string, body: CreateProjectTopupBody) {
  return instance
    .post<CreateProjectTopupResponse>(`/ui-api/admin/projects/${encodeURIComponent(projectId)}/topups`, body)
    .then((res) => res.data);
}

export function deleteProjectTopup(projectId: string, topupId: string) {
  return instance
    .delete<void>(`/ui-api/admin/projects/${encodeURIComponent(projectId)}/topups/${encodeURIComponent(topupId)}`)
    .then((res) => res.data);
}

const FETCH_ALL_PAGE_SIZE = 100;
const FETCH_ALL_MAX_PAGES = 100;

/**
 * Fetches every admin project by paging through the paginated list endpoint
 * (100 per page, capped at 100 pages) so client-side aggregates and filters
 * see the whole dataset.
 */
export async function fetchAllAdminProjects(signal?: AbortSignal): Promise<AdminProjectItem[]> {
  const all: AdminProjectItem[] = [];
  for (let page = 1; ; page += 1) {
    const response = await getAdminProjects({ page, pageSize: FETCH_ALL_PAGE_SIZE, signal });
    all.push(...response.data);
    if (page >= response.pagination.totalPages || page >= FETCH_ALL_MAX_PAGES) {
      break;
    }
  }
  return all;
}

export function getUserProjects(signal?: AbortSignal) {
  return instance.get<UserProjectsResponse>('/ui-api/projects', { signal }).then((res) => res.data);
}
