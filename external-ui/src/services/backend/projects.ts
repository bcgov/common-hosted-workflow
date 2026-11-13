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
  /**
   * The requesting user's n8n project role for this project, or null when they
   * are not a member (including platform admins without a relation). Only set
   * by the single-project detail endpoint, never by the list.
   */
  viewerRole?: string | null;
  /**
   * The project's pending "Request more runs" submission, or null when none
   * is open. Only set by the single-project detail endpoint, never by the
   * list — it drives the member-view review panel and banner note.
   */
  pendingRunRequest?: PendingRunRequest | null;
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

/** What the requester asks for: a one-week top-up or a lasting limit raise. */
export type RunRequestKind = 'extra_runs' | 'limit_increase';

/** The project's pending "Request more runs" submission (detail endpoint only). */
export type PendingRunRequest = {
  id: string;
  requestKind: RunRequestKind;
  extraRuns: number | null;
  /** Target week 'YYYY-Www' of the extra runs (extra_runs kind only). */
  periodKey: string | null;
  requestedWeeklyLimit: number | null;
  requestedAnnualLimit: number | null;
  reason: string;
  /** n8n user id of the requester; the UI renders "by you" on a match. */
  requestedBy: string;
  createdAt: string;
};

export type CreateRunRequestBody = {
  requestKind: RunRequestKind;
  extraRuns?: number | null;
  periodKey?: string | null;
  requestedWeeklyLimit?: number | null;
  requestedAnnualLimit?: number | null;
  reason: string;
};

export type CreateRunRequestResponse = {
  success: true;
  message: string;
  request: PendingRunRequest;
};

/** Status filter values for the admin run-requests list ('denied' = DB 'rejected'). */
export type AdminRunRequestStatusFilter = 'pending' | 'approved' | 'denied' | 'cancelled' | 'all';

/** UI-facing request status (DB 'rejected' surfaces as 'denied'). */
export type AdminRunRequestStatus = 'pending' | 'approved' | 'denied' | 'cancelled';

/** One admin review row: the request enriched with requester, usage and decision context. */
export type AdminRunRequestItem = {
  id: string;
  projectId: string;
  projectName: string;
  projectType: string;
  requestKind: RunRequestKind;
  status: AdminRunRequestStatus;
  extraRuns: number | null;
  periodKey: string | null;
  requestedWeeklyLimit: number | null;
  requestedAnnualLimit: number | null;
  reason: string;
  requestedBy: string;
  /** "Jordan Lee" (falls back to the requester's email). */
  requestedByName: string | null;
  requestedByEmail: string | null;
  /** Requester's project-role label, e.g. 'Editor'. */
  requestedByRoleLabel: string | null;
  createdAt: string;
  /** Usage in the week/year the request was sent (the list's "week used" column). */
  weeklyUsedWhenSent: number | null;
  yearlyUsedWhenSent: number | null;
  /** Usage in the current week/year (the review dialog's "now" figure). */
  weeklyUsedNow: number;
  yearlyUsedNow: number;
  /** Limits in force right now (defaults mode resolves the scope defaults). */
  currentWeeklyLimit: number | null;
  currentAnnualLimit: number | null;
  /** Most recent top-up before review, for context in the dialog. */
  lastTopup: { amount: number; periodKey: string; createdAt: string; createdByName: string | null } | null;
  /** Most recent limits change before review, for context in the dialog. */
  lastLimitChange: { at: string; byName: string | null } | null;
  grantedRuns: number | null;
  decidedWeeklyLimit: number | null;
  decidedAnnualLimit: number | null;
  /** The admin's note on approval, or the deny reason. */
  decisionNote: string | null;
  decidedBy: string | null;
  decidedByName: string | null;
  decidedAt: string | null;
};

export type AdminRunRequestsPage = {
  data: AdminRunRequestItem[];
  pagination: {
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
  };
  /** Drives the "Run requests waiting" stat tile and the Pending chip. */
  pending: { count: number; oldestCreatedAt: string | null };
};

export type ApproveRunRequestBody = {
  /** extra_runs: runs to grant (defaults to the asked amount; may be lowered, never raised). */
  grantedRuns?: number | null;
  /** limit_increase: the new limits (only the asked periods may change). */
  newWeeklyLimit?: number | null;
  newAnnualLimit?: number | null;
  /** Optional note shown to the requester in the email. */
  note?: string | null;
};

export type ApproveRunRequestResponse = {
  success: true;
  message: string;
  request: AdminRunRequestItem;
};

export type DenyRunRequestBody = {
  /** 10–500 characters, shown to the requester word for word. */
  reason: string;
};

export type DenyRunRequestResponse = {
  success: true;
  message: string;
  request: AdminRunRequestItem;
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

/** Files a member "Request more runs" submission for the project. */
export function createRunRequest(projectId: string, body: CreateRunRequestBody) {
  return instance
    .post<CreateRunRequestResponse>(`/ui-api/projects/${encodeURIComponent(projectId)}/run-requests`, body)
    .then((res) => res.data);
}

/** Cancels the current user's own pending run request for the project. */
export function cancelRunRequest(projectId: string, requestId: string) {
  return instance
    .delete<void>(`/ui-api/projects/${encodeURIComponent(projectId)}/run-requests/${encodeURIComponent(requestId)}`)
    .then((res) => res.data);
}

/** Lists run requests for the admin review tab (pending is oldest-first; the rest newest-first). */
export function listAdminRunRequests(params: {
  status: AdminRunRequestStatusFilter;
  search?: string;
  page: number;
  pageSize: number;
  signal?: AbortSignal;
}) {
  const { signal, search, ...rest } = params;
  return instance
    .get<AdminRunRequestsPage>('/ui-api/admin/projects/run-requests', {
      params: { ...rest, ...(search && search.trim() ? { search: search.trim() } : {}) },
      signal,
    })
    .then((res) => res.data);
}

/** Approves (and fulfills) a pending run request. */
export function approveRunRequest(requestId: string, body: ApproveRunRequestBody) {
  return instance
    .post<ApproveRunRequestResponse>(
      `/ui-api/admin/projects/run-requests/${encodeURIComponent(requestId)}/approve`,
      body,
    )
    .then((res) => res.data);
}

/** Denies a pending run request with a required reason. */
export function denyRunRequest(requestId: string, body: DenyRunRequestBody) {
  return instance
    .post<DenyRunRequestResponse>(`/ui-api/admin/projects/run-requests/${encodeURIComponent(requestId)}/deny`, body)
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
