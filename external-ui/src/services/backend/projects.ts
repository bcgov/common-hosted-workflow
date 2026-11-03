import { instance } from './axios';

export type RateLimitStopBehavior = 'hard_stop' | 'soft_stop';

export type ProjectItem = {
  projectId: string;
  projectName: string;
  projectType: string;
  tenantId: string | null;
  /** True when the project follows its scope's saved defaults instead of custom limits. */
  usesDefaultLimits: boolean;
  /**
   * Effective enforced limits (scope defaults in default mode; custom values,
   * falling back to scope defaults per unset period, otherwise).
   */
  weeklyRateLimit: number | null;
  yearlyRateLimit: number | null;
  stopBehavior: RateLimitStopBehavior | null;
  lastAdminComment: string | null;
  weeklyExecutionCount: number;
  yearlyExecutionCount: number;
  /** Runs added by top-ups for the current week (0 when none). */
  weeklyTopupRuns: number;
  /** Runs added by weekly top-ups whose weeks overlap the current year (0 when none). */
  yearlyTopupRuns: number;
  workflowCount: number;
  membersCount: number;
  updatedAt: string | null;
  updatedByName: string | null;
};

export type UpdateProjectRateLimitBody = {
  /** True = follow the scope's saved defaults; stored limits are normalized to nulls. */
  usesDefaultLimits: boolean;
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

/** Default rate limits for one project scope; null = no default (uncapped). */
export type RateLimitScopeDefaults = {
  weeklyRateLimit: number | null;
  yearlyRateLimit: number | null;
};

/** Saved per-scope defaults for team and personal projects. */
export type ProjectRateLimitDefaults = {
  team: RateLimitScopeDefaults;
  personal: RateLimitScopeDefaults;
};

export type UpdateRateLimitDefaultsResponse = {
  success: true;
  message: string;
  defaults: ProjectRateLimitDefaults;
};

export type ProjectsResponse = {
  data: ProjectItem[];
  pagination: {
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
  };
};

/**
 * Lists projects from the shared read endpoint: admins get every n8n project,
 * members get only the projects they can access in n8n.
 */
export function getProjects(params: {
  page: number;
  pageSize: number;
  search?: string;
  type?: string;
  signal?: AbortSignal;
}) {
  const { signal, search, type, ...rest } = params;
  return instance
    .get<ProjectsResponse>('/ui-api/projects', {
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

export function getProject(projectId: string, signal?: AbortSignal) {
  return instance
    .get<ProjectItem>(`/ui-api/projects/${encodeURIComponent(projectId)}`, { signal })
    .then((res) => res.data);
}

export function getProjectWorkflowUsage(projectId: string, signal?: AbortSignal) {
  return instance
    .get<ProjectWorkflowUsage>(`/ui-api/projects/${encodeURIComponent(projectId)}/workflow-usage`, {
      signal,
    })
    .then((res) => res.data);
}

export function listProjectTopups(projectId: string, page: number, pageSize: number, signal?: AbortSignal) {
  return instance
    .get<ProjectTopupsResponse>(`/ui-api/projects/${encodeURIComponent(projectId)}/topups`, {
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

export function getRateLimitDefaults(signal?: AbortSignal) {
  return instance
    .get<ProjectRateLimitDefaults>('/ui-api/admin/projects/rate-limit-defaults', { signal })
    .then((res) => res.data);
}

export function updateRateLimitDefaults(body: ProjectRateLimitDefaults) {
  return instance
    .put<UpdateRateLimitDefaultsResponse>('/ui-api/admin/projects/rate-limit-defaults', body)
    .then((res) => res.data);
}

const FETCH_ALL_PAGE_SIZE = 100;
const FETCH_ALL_MAX_PAGES = 100;

/**
 * Fetches every visible project by paging through the shared paginated list
 * endpoint (100 per page, capped at 100 pages) so client-side aggregates and
 * filters see the whole dataset. Admins get all projects; members get theirs.
 */
export async function fetchAllProjects(signal?: AbortSignal): Promise<ProjectItem[]> {
  const all: ProjectItem[] = [];
  for (let page = 1; ; page += 1) {
    const response = await getProjects({ page, pageSize: FETCH_ALL_PAGE_SIZE, signal });
    all.push(...response.data);
    if (page >= response.pagination.totalPages || page >= FETCH_ALL_MAX_PAGES) {
      break;
    }
  }
  return all;
}
