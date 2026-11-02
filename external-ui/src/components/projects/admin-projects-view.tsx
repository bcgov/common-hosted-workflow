import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { IconChevronLeft, IconChevronRight, IconSearch } from '@tabler/icons-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { fetchAllAdminProjects, type AdminProjectItem } from '../../services/backend/projects';
import {
  ProjectTypeBadge,
  RateLimitStatusBadge,
  USAGE_BAR_TONE_CLASSES,
  USAGE_BAR_TRACK_CLASS,
} from './project-badges';
import { DefaultLimitsDialog } from './default-limits-dialog';
import {
  formatCompactCount,
  formatCount,
  formatWeeklyPeriodLabel,
  getEffectiveWeeklyLimit,
  getRateLimitStatus,
  getUsageBarTone,
  getUsagePercent,
  getUsageRatio,
  type RateLimitStatus,
  type UsageBarTone,
} from '@/lib/rate-limit';

const PAGE_SIZE = 25;

type ProjectTab = 'tenants' | 'personal';
type StatusFilter = 'all' | RateLimitStatus;

const STATUS_FILTER_LABELS: Record<StatusFilter, string> = {
  all: 'All statuses',
  within_limit: 'Within limit',
  limit_reached: 'Limit reached',
  near_limit: 'Near limit',
  no_limit: 'No limit',
};

function getTabLabel(tab: ProjectTab, count: number): string {
  return tab === 'tenants' ? `Tenants (${count})` : `Personal accounts (${count})`;
}

function getTabType(tab: ProjectTab): 'team' | 'personal' {
  return tab === 'tenants' ? 'team' : 'personal';
}

function getTabSummaryNoun(tab: ProjectTab): string {
  return tab === 'tenants' ? 'tenants' : 'personal accounts';
}

export function AdminProjectsView() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [page, setPage] = useState(1);
  const [isDefaultLimitsOpen, setIsDefaultLimitsOpen] = useState(false);

  const projectsQuery = useQuery({
    queryKey: ['admin-projects', 'all'],
    queryFn: ({ signal }) => fetchAllAdminProjects(signal),
  });

  const projects = useMemo(() => projectsQuery.data ?? [], [projectsQuery.data]);

  const tab: ProjectTab = searchParams.get('tab') === 'personal' ? 'personal' : 'tenants';

  function selectTab(nextTab: ProjectTab) {
    setSearchParams({ tab: nextTab });
    setPage(1);
  }

  const teamCount = useMemo(() => projects.filter((p) => p.projectType === 'team').length, [projects]);
  const personalCount = useMemo(() => projects.filter((p) => p.projectType === 'personal').length, [projects]);

  const totalWeeklyRuns = useMemo(() => projects.reduce((sum, p) => sum + p.weeklyExecutionCount, 0), [projects]);

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
    const query = searchQuery.trim().toLowerCase();
    return projects
      .filter((p) => p.projectType === getTabType(tab))
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
            <Badge variant="secondary">Admin view</Badge>
          </div>
          <p className="max-w-4xl text-base leading-6 text-muted-foreground">
            Set weekly and annual run limits for tenants, personal accounts and their workflows.
          </p>
        </div>
        <Button type="button" onClick={() => setIsDefaultLimitsOpen(true)}>
          Default limits
        </Button>
      </div>

      {/* Stat cards */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Runs this week"
          value={formatCompactCount(totalWeeklyRuns)}
          caption={`${teamCount} tenants, ${personalCount} personal accounts`}
        />
        <StatCard label="Limit reached" value={statusCounts.limit_reached} caption="Workflows paused until reset" />
        <StatCard
          label="Near limit (80%+)"
          value={statusCounts.near_limit}
          caption="Close to a weekly or annual limit"
        />
        <StatCard label="No limit set" value={statusCounts.no_limit} caption="Runs are not capped" />
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
      </div>

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
                <ProjectRow key={project.projectId} project={project} />
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

      <DefaultLimitsDialog open={isDefaultLimitsOpen} onOpenChange={setIsDefaultLimitsOpen} />
    </div>
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

function ProjectRow({ project }: { project: AdminProjectItem }) {
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
        <UsageBarCell used={project.weeklyExecutionCount} limit={getEffectiveWeeklyLimit(project)} />
      </TableCell>
      <TableCell>
        <UsageBarCell used={project.yearlyExecutionCount} limit={project.yearlyRateLimit} />
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
          Manage
        </Link>
      </TableCell>
    </TableRow>
  );
}

function UsageBarCell({ used, limit }: { used: number; limit: number | null }) {
  const ratio = getUsageRatio(used, limit);
  const percent = getUsagePercent(used, limit);
  const tone: UsageBarTone | null = ratio === null ? null : getUsageBarTone(ratio);

  return (
    <div className="min-w-[9rem] space-y-1.5">
      <p className="text-sm text-foreground">
        {formatCount(used)} / {limit === null ? 'No limit' : formatCount(limit)}
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
