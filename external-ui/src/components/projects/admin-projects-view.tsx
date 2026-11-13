import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { IconChevronLeft, IconChevronRight, IconSearch, IconActivity } from '@tabler/icons-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  fetchAllProjects,
  listAdminRunRequests,
  type AdminRunRequestItem,
  type AdminRunRequestStatus,
  type AdminRunRequestStatusFilter,
  type ProjectItem,
} from '../../services/backend/projects';
import {
  ProjectTypeBadge,
  RateLimitStatusBadge,
  USAGE_BAR_TONE_CLASSES,
  USAGE_BAR_TRACK_CLASS,
} from './project-badges';
import { ReviewRunRequestDialog, formatSentStamp } from './review-run-request-dialog';
import { DefaultLimitsDialog } from './default-limits-dialog';
import {
  formatCompactCount,
  formatCount,
  formatShortDate,
  formatWeeklyPeriodLabel,
  formatWeeklyKeyRange,
  getEffectiveYearlyLimit,
  getEffectiveWeeklyLimit,
  getRateLimitStatus,
  getUsageBarTone,
  getUsagePercent,
  getUsageRatio,
  type RateLimitStatus,
  type UsageBarTone,
} from '@/lib/rate-limit';

const PAGE_SIZE = 25;
const REQUESTS_PAGE_SIZE = 25;

type ProjectTab = 'tenants' | 'personal' | 'requests';
type StatusFilter = 'all' | RateLimitStatus;

const STATUS_FILTER_LABELS: Record<StatusFilter, string> = {
  all: 'All statuses',
  within_limit: 'Within limit',
  limit_reached: 'Limit reached',
  near_limit: 'Near limit',
  no_limit: 'No limit',
};

/** Status chips on the Run requests tab; pending is the review queue default. */
const REQUEST_FILTERS: AdminRunRequestStatusFilter[] = ['pending', 'approved', 'denied', 'cancelled', 'all'];

const REQUEST_FILTER_LABELS: Record<AdminRunRequestStatusFilter, string> = {
  pending: 'Pending',
  approved: 'Approved',
  denied: 'Denied',
  cancelled: 'Cancelled',
  all: 'All',
};

const REQUEST_STATUS_BADGE_VARIANTS: Record<
  AdminRunRequestStatus,
  'warning' | 'success' | 'destructive' | 'secondary'
> = {
  pending: 'warning',
  approved: 'success',
  denied: 'destructive',
  cancelled: 'secondary',
};

const REQUEST_STATUS_BADGE_LABELS: Record<AdminRunRequestStatus, string> = {
  pending: 'Pending',
  approved: 'Approved',
  denied: 'Denied',
  cancelled: 'Cancelled',
};

function getTabLabel(tab: ProjectTab, count: number): string {
  if (tab === 'requests') {
    return `Run requests (${count})`;
  }
  return tab === 'tenants' ? `Tenants (${count})` : `Personal accounts (${count})`;
}

function getTabType(tab: Exclude<ProjectTab, 'requests'>): 'team' | 'personal' {
  return tab === 'tenants' ? 'team' : 'personal';
}

function getTabSummaryNoun(tab: Exclude<ProjectTab, 'requests'>): string {
  return tab === 'tenants' ? 'tenants' : 'personal accounts';
}

/** The bold "what they asked for" cell text, e.g. "+3,000 of 5,000" or "12,000 a week". */
function getRequestSummary(item: AdminRunRequestItem): { bold: string; sub: string } {
  if (item.requestKind === 'extra_runs') {
    const asked = item.extraRuns ?? 0;
    const bold =
      item.status === 'approved' && item.grantedRuns !== null && item.grantedRuns !== asked
        ? `+${formatCount(item.grantedRuns)} of ${formatCount(asked)}`
        : `+${formatCount(asked)} runs`;
    return {
      bold,
      sub: `Extra runs for ${item.periodKey ? formatWeeklyKeyRange(item.periodKey) : 'one week'}`,
    };
  }
  const boldParts: string[] = [];
  if (item.requestedWeeklyLimit !== null) {
    boldParts.push(`${formatCount(item.requestedWeeklyLimit)} a week`);
  }
  if (item.requestedAnnualLimit !== null) {
    boldParts.push(`${formatCount(item.requestedAnnualLimit)} a year`);
  }
  const sub =
    item.requestedWeeklyLimit !== null
      ? `Higher limit, now ${item.currentWeeklyLimit === null ? 'no limit' : formatCount(item.currentWeeklyLimit)}`
      : `Higher limit, now ${item.currentAnnualLimit === null ? 'no limit' : formatCount(item.currentAnnualLimit)} a year`;
  return { bold: boldParts.join(' · ') || 'Higher limit', sub };
}

export function AdminProjectsView({ readOnly = false }: { readOnly?: boolean }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [page, setPage] = useState(1);
  const [isDefaultLimitsOpen, setIsDefaultLimitsOpen] = useState(false);

  const projectsQuery = useQuery({
    queryKey: ['projects', 'all'],
    queryFn: ({ signal }) => fetchAllProjects(signal),
  });

  const projects = useMemo(() => projectsQuery.data ?? [], [projectsQuery.data]);

  const tab: ProjectTab =
    searchParams.get('tab') === 'personal'
      ? 'personal'
      : searchParams.get('tab') === 'requests'
        ? 'requests'
        : 'tenants';

  function selectTab(nextTab: ProjectTab) {
    setSearchParams({ tab: nextTab });
    setPage(1);
  }

  const teamCount = useMemo(() => projects.filter((p) => p.projectType === 'team').length, [projects]);
  const personalCount = useMemo(() => projects.filter((p) => p.projectType === 'personal').length, [projects]);

  const totalWeeklyRuns = useMemo(() => projects.reduce((sum, p) => sum + p.weeklyExecutionCount, 0), [projects]);

  // Pending run requests: drives the stat tile and the Run requests tab count.
  const pendingQuery = useQuery({
    queryKey: ['admin-run-requests', 'pending', '', 1],
    queryFn: ({ signal }) => listAdminRunRequests({ status: 'pending', page: 1, pageSize: 1, signal }),
    enabled: !readOnly && tab !== 'requests',
  });
  const pendingCount = pendingQuery.data?.pending.count ?? 0;
  const pendingOldestAt = pendingQuery.data?.pending.oldestCreatedAt ?? null;

  const statusCounts = useMemo(() => {
    const counts: Record<RateLimitStatus, number> = {
      within_limit: 0,
      limit_reached: 0,
      near_limit: 0,
      no_limit: 0,
    };
    for (const project of projects) {
      counts[getRateLimitStatus(project)] += 1;
    }
    return counts;
  }, [projects]);

  const filteredProjects = useMemo(() => {
    // The memo callback closes over `tab`, which TS cannot narrow to the
    // non-requests variants — narrow it up front instead.
    const projectTab: Exclude<ProjectTab, 'requests'> = tab === 'personal' ? 'personal' : 'tenants';
    const query = searchQuery.trim().toLowerCase();
    return projects
      .filter((p) => p.projectType === getTabType(projectTab))
      .filter((p) => {
        if (query) {
          const haystack = [p.projectName, p.tenantId ?? '', p.projectId].join(' ').toLowerCase();
          if (!haystack.includes(query)) {
            return false;
          }
        }
        if (statusFilter !== 'all' && getRateLimitStatus(p) !== statusFilter) {
          return false;
        }
        return true;
      });
  }, [projects, tab, searchQuery, statusFilter]);

  const filteredStatusCounts = useMemo(() => {
    const counts: Record<RateLimitStatus, number> = {
      within_limit: 0,
      limit_reached: 0,
      near_limit: 0,
      no_limit: 0,
    };
    for (const project of filteredProjects) {
      counts[getRateLimitStatus(project)] += 1;
    }
    return counts;
  }, [filteredProjects]);

  const totalPages = Math.max(1, Math.ceil(filteredProjects.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageProjects = filteredProjects.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const rangeStart = filteredProjects.length === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1;
  const rangeEnd = Math.min(currentPage * PAGE_SIZE, filteredProjects.length);

  const periodLabel = formatWeeklyPeriodLabel();

  if (projectsQuery.isPending) {
    return <p className="text-sm text-muted-foreground">Loading projects...</p>;
  }

  if (projectsQuery.isError) {
    const errorMessage = projectsQuery.error instanceof Error ? projectsQuery.error.message : 'Could not load projects';
    return (
      <Alert variant="destructive">
        <AlertTitle>Error loading projects</AlertTitle>
        <AlertDescription>{errorMessage}</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-5">
      {/* Title row */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-[2rem] font-bold leading-10 text-foreground">Projects</h1>
            <Badge variant="secondary">{readOnly ? 'Read-only' : 'Admin view'}</Badge>
          </div>
          <p className="max-w-4xl text-base leading-6 text-muted-foreground">
            {readOnly
              ? 'View weekly and annual run usage for your projects.'
              : 'Set weekly and annual run limits for tenants, personal accounts and their workflows.'}
          </p>
        </div>
        {!readOnly && (
          <Button type="button" onClick={() => setIsDefaultLimitsOpen(true)}>
            Default limits
          </Button>
        )}
      </div>

      {/* Stat cards */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Runs this week"
          value={formatCompactCount(totalWeeklyRuns)}
          caption={`${teamCount} tenants, ${personalCount} personal accounts`}
        />
        <StatCard label="Limit reached" value={statusCounts.limit_reached} caption="At a weekly or annual limit" />
        <StatCard
          label="Near limit (80%+)"
          value={statusCounts.near_limit}
          caption="Close to a weekly or annual limit"
        />
        {!readOnly && (
          <StatCard
            label="Run requests waiting"
            value={pendingCount}
            caption={pendingOldestAt ? `Oldest sent ${formatShortDate(new Date(pendingOldestAt))}` : 'Nothing waiting'}
          />
        )}
        {readOnly && <StatCard label="No limit set" value={statusCounts.no_limit} caption="Runs are not capped" />}
      </div>

      {/* Tabs */}
      <div
        className="inline-flex items-center gap-1 rounded-control bg-surface-muted p-1"
        role="tablist"
        aria-label="Project type"
      >
        <TabButton
          active={tab === 'tenants'}
          label={getTabLabel('tenants', teamCount)}
          onClick={() => selectTab('tenants')}
        />
        <TabButton
          active={tab === 'personal'}
          label={getTabLabel('personal', personalCount)}
          onClick={() => selectTab('personal')}
        />
        {!readOnly && (
          <TabButton
            active={tab === 'requests'}
            label={getTabLabel('requests', pendingCount)}
            onClick={() => selectTab('requests')}
          />
        )}
      </div>

      {tab === 'requests' ? (
        <RunRequestsTab />
      ) : (
        <>
          {/* Filter row */}
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <div className="relative min-w-0 flex-1">
              <IconSearch
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setPage(1);
                }}
                placeholder="Search by tenant name or tenant ID"
                className="pl-9"
                aria-label="Search projects"
              />
            </div>
            <Select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value as StatusFilter);
                setPage(1);
              }}
              aria-label="Filter by status"
              className="lg:w-44"
            >
              {(Object.keys(STATUS_FILTER_LABELS) as StatusFilter[]).map((value) => (
                <option key={value} value={value}>
                  {STATUS_FILTER_LABELS[value]}
                </option>
              ))}
            </Select>
            <Select value="current" onChange={() => undefined} aria-label="Period" className="lg:w-56">
              <option value="current">Period: {periodLabel}</option>
            </Select>
          </div>

          {/* Summary line for the active tab */}
          <p className="text-[0.8125rem] text-muted-foreground">
            {filteredProjects.length} {getTabSummaryNoun(tab)} · {filteredStatusCounts.limit_reached} at limit,{' '}
            {filteredStatusCounts.near_limit} near limit, {filteredStatusCounts.no_limit} with no limit
          </p>

          {/* Table */}
          <div className="overflow-x-auto rounded-card border border-border bg-surface shadow-card">
            {pageProjects.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-muted-foreground">
                {projects.length === 0 ? 'No projects found.' : 'No projects match your filters.'}
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-surface">
                    <TableHead className="uppercase">Account</TableHead>
                    <TableHead className="uppercase">Weekly runs</TableHead>
                    <TableHead className="uppercase">Annual runs</TableHead>
                    <TableHead className="uppercase">Workflows</TableHead>
                    <TableHead className="uppercase">Status</TableHead>
                    <TableHead className="uppercase">
                      <span className="sr-only">Actions</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pageProjects.map((project) => (
                    <ProjectRow key={project.projectId} project={project} readOnly={readOnly} />
                  ))}
                </TableBody>
              </Table>
            )}
          </div>

          {/* Pagination footer */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            <p className="text-sm text-muted-foreground">
              Showing {rangeStart}–{rangeEnd} of {filteredProjects.length} {getTabSummaryNoun(tab)}
            </p>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setPage(currentPage - 1)}
                disabled={currentPage <= 1}
              >
                <IconChevronLeft size={16} aria-hidden="true" />
                Previous
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setPage(currentPage + 1)}
                disabled={currentPage >= totalPages}
              >
                Next
                <IconChevronRight size={16} aria-hidden="true" />
              </Button>
            </div>
          </div>
        </>
      )}

      {!readOnly && <DefaultLimitsDialog open={isDefaultLimitsOpen} onOpenChange={setIsDefaultLimitsOpen} />}
    </div>
  );
}

/* ================================================================== */
/*  Run requests tab (admin review queue)                              */
/* ================================================================== */

/** One status chip ("Pending (3)") on the Run requests tab. */
function RequestStatusChip({
  filter,
  label,
  count,
  active,
  onSelect,
}: {
  filter: AdminRunRequestStatusFilter;
  label: string;
  count: number | null;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={active}
      data-filter={filter}
      className={`inline-flex shrink-0 items-center rounded-full border px-3.5 py-1.5 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#255a90] ${
        active
          ? 'border-transparent bg-[#013366] text-white'
          : 'border-border bg-surface text-foreground hover:bg-surface-muted'
      }`}
    >
      {label}
      {count !== null ? ` (${count})` : ''}
    </button>
  );
}

/**
 * The admin run-request review tab: status chips, search, the review table
 * and the review dialog. Pending lists oldest-first (the queue order);
 * every other filter lists newest-first.
 */
function RunRequestsTab() {
  const [statusFilter, setStatusFilter] = useState<AdminRunRequestStatusFilter>('pending');
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);
  const [reviewing, setReviewing] = useState<AdminRunRequestItem | null>(null);

  const listQuery = useQuery({
    queryKey: ['admin-run-requests', statusFilter, searchQuery.trim(), page],
    queryFn: ({ signal }) =>
      listAdminRunRequests({
        status: statusFilter,
        search: searchQuery.trim() || undefined,
        page,
        pageSize: REQUESTS_PAGE_SIZE,
        signal,
      }),
  });

  // Chip counts: one lightweight query per filter (totalItems at pageSize 1).
  const countsQuery = useQuery({
    queryKey: ['admin-run-requests', 'counts'],
    queryFn: async ({ signal }) => {
      const results = await Promise.all(
        REQUEST_FILTERS.map(async (filter) => {
          const result = await listAdminRunRequests({ status: filter, page: 1, pageSize: 1, signal });
          return [filter, result.pagination.totalItems] as const;
        }),
      );
      return Object.fromEntries(results) as Record<AdminRunRequestStatusFilter, number>;
    },
    placeholderData: (previous) => previous,
  });

  const data = listQuery.data;
  const items = data?.data ?? [];
  const pagination = data?.pagination;
  const totalPages = Math.max(1, pagination?.totalPages ?? 1);
  const currentPage = Math.min(page, totalPages);
  const rangeStart = pagination && pagination.totalItems > 0 ? (currentPage - 1) * pagination.pageSize + 1 : 0;
  const rangeEnd = pagination ? Math.min(currentPage * pagination.pageSize, pagination.totalItems) : 0;

  const searchTrimmed = searchQuery.trim();
  const hasSearch = searchTrimmed.length > 0;
  const showSkeleton = listQuery.isPending;
  const showEmpty = !showSkeleton && items.length === 0;

  return (
    <div className="space-y-4">
      {/* Status chips + search */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filter by request status">
          {REQUEST_FILTERS.map((filter) => (
            <RequestStatusChip
              key={filter}
              filter={filter}
              label={REQUEST_FILTER_LABELS[filter]}
              count={countsQuery.data ? countsQuery.data[filter] : null}
              active={statusFilter === filter}
              onSelect={() => {
                setStatusFilter(filter);
                setPage(1);
              }}
            />
          ))}
        </div>
        <div className="relative min-w-0 flex-1 lg:max-w-xs lg:ml-auto">
          <IconSearch
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            type="text"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setPage(1);
            }}
            placeholder="Search by project or person"
            className="pl-9"
            aria-label="Search run requests"
          />
        </div>
      </div>

      {/* Summary line */}
      <p className="text-[0.8125rem] text-muted-foreground">
        {statusFilter === 'pending'
          ? `${pagination?.totalItems ?? 0} requests waiting · oldest first`
          : `${pagination?.totalItems ?? 0} requests · newest first`}
      </p>

      {/* Table / empty / skeleton */}
      <div className="overflow-x-auto rounded-card border border-border bg-surface shadow-card">
        {showSkeleton ? (
          <div className="space-y-4 px-5 py-4" aria-hidden="true" data-testid="run-requests-skeleton">
            {[0, 1, 2].map((row) => (
              <div key={row} className="flex items-center gap-4">
                <div className="h-4 w-40 animate-pulse rounded bg-[#e8e8e8]" />
                <div className="h-4 w-36 animate-pulse rounded bg-[#e8e8e8]" />
                <div className="h-4 w-32 animate-pulse rounded bg-[#e8e8e8]" />
                <div className="ml-auto h-4 w-24 animate-pulse rounded bg-[#e8e8e8]" />
              </div>
            ))}
          </div>
        ) : showEmpty ? (
          <div className="flex flex-col items-center px-5 py-12 text-center">
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#f1f8fe] text-[#1e5189]">
              <IconActivity size={20} aria-hidden="true" />
            </span>
            {hasSearch ? (
              <>
                <p className="mt-3 text-lg font-bold text-foreground">No requests match “{searchTrimmed}”</p>
                <Button type="button" variant="outline" size="sm" className="mt-3" onClick={() => setSearchQuery('')}>
                  Clear search
                </Button>
              </>
            ) : statusFilter === 'pending' ? (
              <>
                <p className="mt-3 text-lg font-bold text-foreground">No requests waiting</p>
                <p className="mt-1 max-w-md text-sm leading-5 text-muted-foreground">
                  When a project admin or editor asks for more runs, the request shows up here and we email you. Decided
                  requests are under Approved, Denied and Cancelled.
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-4"
                  onClick={() => setStatusFilter('all')}
                >
                  See all requests
                </Button>
              </>
            ) : (
              <p className="mt-3 text-lg font-bold text-foreground">
                No {REQUEST_FILTER_LABELS[statusFilter].toLowerCase()} requests yet.
              </p>
            )}
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-surface">
                <TableHead className="uppercase">Project</TableHead>
                <TableHead className="uppercase">Requested by</TableHead>
                <TableHead className="uppercase">Request</TableHead>
                <TableHead className="uppercase">Reason</TableHead>
                <TableHead className="uppercase">Week used when sent</TableHead>
                <TableHead className="uppercase">Status</TableHead>
                <TableHead className="uppercase">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => (
                <RequestRow key={item.id} item={item} onReview={() => setReviewing(item)} />
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      {/* Pagination footer */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
        <p className="text-sm text-muted-foreground">
          Showing {rangeStart}–{rangeEnd} of {pagination?.totalItems ?? 0}{' '}
          {statusFilter === 'pending' ? 'pending requests' : 'requests'}
        </p>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setPage(currentPage - 1)}
            disabled={currentPage <= 1}
          >
            <IconChevronLeft size={16} aria-hidden="true" />
            Previous
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setPage(currentPage + 1)}
            disabled={currentPage >= totalPages}
          >
            Next
            <IconChevronRight size={16} aria-hidden="true" />
          </Button>
        </div>
      </div>

      {reviewing && (
        <ReviewRunRequestDialog request={reviewing} open onOpenChange={(open) => !open && setReviewing(null)} />
      )}
    </div>
  );
}

/** One row of the review table; the whole row opens the review dialog. */
function RequestRow({ item, onReview }: { item: AdminRunRequestItem; onReview: () => void }) {
  const request = getRequestSummary(item);
  const isPending = item.status === 'pending';
  return (
    <TableRow className="cursor-pointer" onClick={onReview}>
      <TableCell>
        <div className="space-y-0.5">
          <p className="font-semibold text-foreground">{item.projectName}</p>
          <ProjectTypeBadge projectType={item.projectType} />
        </div>
      </TableCell>
      <TableCell>
        <div className="space-y-0.5">
          <p className="text-sm font-semibold text-foreground">{item.requestedByName ?? item.requestedByEmail}</p>
          <p className="text-xs text-muted-foreground">
            {item.requestedByRoleLabel ?? 'Member'} · sent {formatSentStamp(item.createdAt)}
          </p>
        </div>
      </TableCell>
      <TableCell>
        <div className="space-y-0.5">
          <p className="text-sm font-bold text-foreground">{request.bold}</p>
          <p className="text-xs text-muted-foreground">{request.sub}</p>
        </div>
      </TableCell>
      <TableCell>
        <p className="max-w-[26ch] text-xs leading-4 text-muted-foreground" title={item.reason}>
          <span className="line-clamp-2">{item.reason}</span>
        </p>
      </TableCell>
      <TableCell>
        <UsageBarCell used={item.weeklyUsedWhenSent ?? 0} limit={item.currentWeeklyLimit} />
      </TableCell>
      <TableCell>
        <Badge variant={REQUEST_STATUS_BADGE_VARIANTS[item.status]}>{REQUEST_STATUS_BADGE_LABELS[item.status]}</Badge>
      </TableCell>
      <TableCell className="text-right">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onReview();
          }}
          className="text-sm font-medium text-link hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#255a90]"
        >
          {isPending ? 'Review' : 'View'}
        </button>
      </TableCell>
    </TableRow>
  );
}

function StatCard({ label, value, caption }: { label: string; value: number | string; caption: string }) {
  return (
    <div className="rounded-card border border-border bg-surface p-5 shadow-card">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 text-3xl font-bold text-foreground">{value}</p>
      <p className="mt-1 text-sm text-muted-foreground">{caption}</p>
    </div>
  );
}

function TabButton({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`rounded-[8px] px-4 py-2 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#255a90] ${
        active
          ? 'border border-border bg-surface text-foreground shadow-sm'
          : 'border border-transparent text-muted-foreground hover:text-foreground'
      }`}
    >
      {label}
    </button>
  );
}

function ProjectRow({ project, readOnly }: { project: ProjectItem; readOnly?: boolean }) {
  const detailPath = `/projects/${encodeURIComponent(project.projectId)}`;
  return (
    <TableRow>
      <TableCell>
        <div className="space-y-0.5">
          <div className="flex flex-wrap items-center gap-2">
            <Link
              to={detailPath}
              className="font-semibold text-link hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#255a90]"
            >
              {project.projectName}
            </Link>
            <ProjectTypeBadge projectType={project.projectType} />
          </div>
          <p className="max-w-[24ch] truncate font-mono text-xs text-muted-foreground">
            {project.tenantId ?? project.projectId}
          </p>
        </div>
      </TableCell>
      <TableCell>
        <UsageBarCell
          used={project.weeklyExecutionCount}
          limit={getEffectiveWeeklyLimit(project)}
          usesDefaultLimits={project.usesDefaultLimits}
        />
      </TableCell>
      <TableCell>
        <UsageBarCell
          used={project.yearlyExecutionCount}
          limit={getEffectiveYearlyLimit(project)}
          usesDefaultLimits={project.usesDefaultLimits}
        />
      </TableCell>
      <TableCell className="text-sm">{project.workflowCount}</TableCell>
      <TableCell>
        <RateLimitStatusBadge status={getRateLimitStatus(project)} />
      </TableCell>
      <TableCell className="text-right">
        <Link
          to={detailPath}
          className="text-sm font-medium text-link hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#255a90]"
        >
          {readOnly ? 'View' : 'Manage'}
        </Link>
      </TableCell>
    </TableRow>
  );
}

function UsageBarCell({
  used,
  limit,
  usesDefaultLimits,
}: {
  used: number;
  limit: number | null;
  usesDefaultLimits?: boolean;
}) {
  const ratio = getUsageRatio(used, limit);
  const percent = getUsagePercent(used, limit);
  const tone: UsageBarTone | null = ratio === null ? null : getUsageBarTone(ratio);

  return (
    <div className="min-w-[9rem] space-y-1.5">
      <p className="flex flex-wrap items-center gap-1.5 text-sm text-foreground">
        <span>
          {formatCount(used)} / {limit === null ? 'No limit' : formatCount(limit)}
        </span>
        {usesDefaultLimits === true && limit !== null && (
          <span className="rounded-full border border-border bg-surface-muted px-1.5 text-[0.6875rem] leading-4 text-muted-foreground">
            Default
          </span>
        )}
      </p>
      <div
        data-tone={tone}
        role="img"
        aria-label={
          limit === null
            ? `${formatCount(used)} runs, no limit set`
            : `${formatCount(used)} of ${formatCount(limit)} runs used`
        }
        className={`h-1 w-full overflow-hidden rounded-full ${USAGE_BAR_TRACK_CLASS}`}
      >
        {tone !== null && (
          <div
            className={`h-full rounded-full ${USAGE_BAR_TONE_CLASSES[tone]}`}
            style={{ width: `${Math.min(100, percent ?? 0)}%` }}
          />
        )}
      </div>
    </div>
  );
}
