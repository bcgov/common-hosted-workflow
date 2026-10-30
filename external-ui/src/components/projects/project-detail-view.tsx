import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router';
import axios from 'axios';
import { IconPencil, IconSearch } from '@tabler/icons-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from '@/hooks/use-toasts';
import {
  deleteProjectTenant,
  getAdminProject,
  getProjectWorkflowUsage,
  updateProjectTenant,
  type AdminProjectItem,
  type RateLimitStopBehavior,
} from '../../services/backend/projects';
import { EditRateLimitsDialog } from './edit-rate-limits-dialog';
import { ManageTopupsDialog } from './manage-topups-dialog';
import { ProjectTypeBadge, USAGE_BAR_TONE_CLASSES, USAGE_BAR_TRACK_CLASS } from './project-badges';
import {
  formatCount,
  formatResetDate,
  formatShortDate,
  getEffectiveWeeklyLimit,
  getHighestUsagePeriod,
  getNextWeeklyReset,
  getNextYearlyReset,
  getRateLimitStatus,
  getUsageBarTone,
  getUsagePercent,
  getUsageRatio,
  type UsageBarTone,
} from '@/lib/rate-limit';

const WORKFLOW_PAGE_SIZE = 10;
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function getTenantMutationErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error) && error.response) {
    const status = error.response.status;
    if (status === 400) return 'Invalid tenant ID format';
    if (status === 409) return 'Tenant ID already in use';
  }
  return 'Network error';
}

function isNotFoundError(error: unknown): boolean {
  return axios.isAxiosError(error) && error.response?.status === 404;
}

function getPeriodLabel(period: 'weekly' | 'yearly'): string {
  return period === 'weekly' ? 'weekly' : 'annual';
}

function getWhenReachedText(stopBehavior: RateLimitStopBehavior | null): string {
  return stopBehavior === 'soft_stop' ? 'When reached: keep running and alert admins' : 'When reached: pause new runs';
}

export function ProjectDetailView() {
  const { projectId = '' } = useParams();
  const queryClient = useQueryClient();
  const [isLimitsDialogOpen, setIsLimitsDialogOpen] = useState(false);
  const [isTopupsDialogOpen, setIsTopupsDialogOpen] = useState(false);
  const [isEditingTenant, setIsEditingTenant] = useState(false);
  const [tenantValue, setTenantValue] = useState('');
  const [tenantError, setTenantError] = useState<string | null>(null);
  const [isDeleteTenantConfirmOpen, setIsDeleteTenantConfirmOpen] = useState(false);
  const [workflowSearch, setWorkflowSearch] = useState('');
  const [workflowPage, setWorkflowPage] = useState(1);

  const projectQuery = useQuery({
    queryKey: ['admin-project', projectId],
    queryFn: ({ signal }) => getAdminProject(projectId, signal),
    enabled: projectId !== '',
  });
  const usageQuery = useQuery({
    queryKey: ['admin-project-workflow-usage', projectId],
    queryFn: ({ signal }) => getProjectWorkflowUsage(projectId, signal),
    enabled: projectId !== '',
  });

  function invalidateProjectQueries() {
    void queryClient.invalidateQueries({ queryKey: ['admin-projects'] });
    void queryClient.invalidateQueries({ queryKey: ['admin-project', projectId] });
    void queryClient.invalidateQueries({ queryKey: ['admin-project-workflow-usage', projectId] });
  }

  const updateTenantMutation = useMutation({
    mutationFn: (tenantId: string) => updateProjectTenant(projectId, tenantId),
    onSuccess: () => {
      setIsEditingTenant(false);
      setTenantValue('');
      setTenantError(null);
      invalidateProjectQueries();
      toast.success('Tenant ID updated');
    },
    onError: (error) => toast.error(getTenantMutationErrorMessage(error)),
  });
  const deleteTenantMutation = useMutation({
    mutationFn: () => deleteProjectTenant(projectId),
    onSuccess: () => {
      setIsEditingTenant(false);
      setTenantValue('');
      setTenantError(null);
      invalidateProjectQueries();
      toast.success('Tenant ID removed');
    },
    onError: (error) => toast.error(getTenantMutationErrorMessage(error)),
  });
  const isTenantSaving = updateTenantMutation.isPending || deleteTenantMutation.isPending;

  function startTenantEdit() {
    setTenantValue(projectQuery.data?.tenantId ?? '');
    setTenantError(null);
    setIsEditingTenant(true);
  }

  function exitTenantEdit() {
    setIsEditingTenant(false);
    setTenantValue('');
    setTenantError(null);
  }

  function saveTenant() {
    const currentTenantId = projectQuery.data?.tenantId ?? null;
    const trimmed = tenantValue.trim();
    if (trimmed === '') {
      if (currentTenantId !== null) {
        setIsDeleteTenantConfirmOpen(true);
      } else {
        exitTenantEdit();
      }
      return;
    }
    if (!UUID_REGEX.test(trimmed)) {
      setTenantError('Invalid UUID format');
      return;
    }
    if (trimmed === currentTenantId) {
      exitTenantEdit();
      return;
    }
    setTenantError(null);
    updateTenantMutation.mutate(trimmed);
  }

  function confirmDeleteTenant() {
    setIsDeleteTenantConfirmOpen(false);
    deleteTenantMutation.mutate();
  }

  const workflows = useMemo(() => usageQuery.data?.workflows ?? [], [usageQuery.data]);
  const filteredWorkflows = useMemo(() => {
    const query = workflowSearch.trim().toLowerCase();
    if (query === '') {
      return workflows;
    }
    return workflows.filter(
      (workflow) =>
        workflow.workflowName.toLowerCase().includes(query) || workflow.workflowId.toLowerCase().includes(query),
    );
  }, [workflows, workflowSearch]);

  const workflowTotalPages = Math.max(1, Math.ceil(filteredWorkflows.length / WORKFLOW_PAGE_SIZE));
  const currentWorkflowPage = Math.min(workflowPage, workflowTotalPages);
  const workflowPageItems = filteredWorkflows.slice(
    (currentWorkflowPage - 1) * WORKFLOW_PAGE_SIZE,
    currentWorkflowPage * WORKFLOW_PAGE_SIZE,
  );

  if (projectQuery.isPending) {
    return (
      <div className="min-h-[calc(100svh-var(--ds-header-height)-var(--ds-footer-height))] bg-surface-muted">
        <div className="mx-auto w-full max-w-[calc(var(--ds-content-max)+2*var(--ds-page-gutter))] px-[var(--ds-page-gutter)] py-8 sm:py-10">
          <p className="text-sm text-muted-foreground">Loading project...</p>
        </div>
      </div>
    );
  }

  if (projectQuery.isError) {
    if (isNotFoundError(projectQuery.error)) {
      return (
        <div className="min-h-[calc(100svh-var(--ds-header-height)-var(--ds-footer-height))] bg-surface-muted">
          <div className="mx-auto w-full max-w-[calc(var(--ds-content-max)+2*var(--ds-page-gutter))] px-[var(--ds-page-gutter)] py-8 sm:py-10">
            <div className="rounded-card border border-border bg-surface p-10 text-center shadow-card">
              <h1 className="text-2xl font-bold text-foreground">Project not found</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                This project may have been deleted, or the link is out of date.
              </p>
              <Button asChild variant="outline" className="mt-4">
                <Link to="/projects">Back to projects</Link>
              </Button>
            </div>
          </div>
        </div>
      );
    }
    const errorMessage =
      projectQuery.error instanceof Error ? projectQuery.error.message : 'Could not load the project';
    return (
      <div className="min-h-[calc(100svh-var(--ds-header-height)-var(--ds-footer-height))] bg-surface-muted">
        <div className="mx-auto w-full max-w-[calc(var(--ds-content-max)+2*var(--ds-page-gutter))] px-[var(--ds-page-gutter)] py-8 sm:py-10">
          <Alert variant="destructive">
            <AlertTitle>Error loading project</AlertTitle>
            <AlertDescription>{errorMessage}</AlertDescription>
          </Alert>
        </div>
      </div>
    );
  }

  const project: AdminProjectItem = projectQuery.data;
  const status = getRateLimitStatus(project);
  const bannerPeriod = getHighestUsagePeriod(project);
  const showBanner = status === 'near_limit' || status === 'limit_reached';
  const nextWeeklyReset = getNextWeeklyReset();
  const nextYearlyReset = getNextYearlyReset();

  let bannerText: string | null = null;
  if (showBanner && bannerPeriod !== null) {
    const used = bannerPeriod === 'weekly' ? project.weeklyExecutionCount : project.yearlyExecutionCount;
    const limit = bannerPeriod === 'weekly' ? getEffectiveWeeklyLimit(project) : project.yearlyRateLimit;
    const percent = getUsagePercent(used, limit) ?? 0;
    bannerText = `${project.projectName} has used ${percent}% of its ${getPeriodLabel(bannerPeriod)} limit`;
    if (status === 'limit_reached') {
      bannerText +=
        project.stopBehavior === 'soft_stop'
          ? ' Runs continue and admins are alerted.'
          : ' New runs pause until the limit resets.';
    }
  } else if (showBanner) {
    bannerText = `${project.projectName} has reached its run limit`;
    bannerText +=
      project.stopBehavior === 'soft_stop'
        ? ' Runs continue and admins are alerted.'
        : ' New runs pause until the limit resets.';
  }

  return (
    <div className="min-h-[calc(100svh-var(--ds-header-height)-var(--ds-footer-height))] bg-surface-muted">
      <div className="mx-auto w-full max-w-[calc(var(--ds-content-max)+2*var(--ds-page-gutter))] px-[var(--ds-page-gutter)] py-8 sm:py-10">
        <div className="space-y-5">
          {/* Breadcrumb */}
          <nav aria-label="Breadcrumb" className="text-sm text-muted-foreground">
            <ol className="flex flex-wrap items-center gap-1.5">
              <li>
                <Link
                  to="/projects"
                  className="text-link hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#255a90]"
                >
                  Projects
                </Link>
              </li>
              <li aria-hidden="true">/</li>
              <li aria-current="page" className="font-medium text-foreground">
                {project.projectName}
              </li>
            </ol>
          </nav>

          {/* Title row */}
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0 space-y-2">
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="text-[2rem] font-bold leading-10 text-foreground">{project.projectName}</h1>
                <ProjectTypeBadge projectType={project.projectType} />
              </div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
                {isEditingTenant ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <label htmlFor="tenant-id-input" className="text-sm text-muted-foreground">
                      Tenant ID
                    </label>
                    <Input
                      id="tenant-id-input"
                      type="text"
                      value={tenantValue}
                      onChange={(e) => {
                        setTenantValue(e.target.value);
                        if (tenantError) setTenantError(null);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          saveTenant();
                        } else if (e.key === 'Escape') {
                          e.preventDefault();
                          exitTenantEdit();
                        }
                      }}
                      aria-label="Tenant ID"
                      aria-invalid={!!tenantError}
                      className="h-8 w-72 font-mono text-xs"
                      autoFocus
                      disabled={isTenantSaving}
                    />
                    {tenantError && (
                      <span className="text-xs font-bold text-danger-foreground" role="alert">
                        {tenantError}
                      </span>
                    )}
                    <Button type="button" size="sm" onClick={saveTenant} disabled={isTenantSaving}>
                      Save
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={exitTenantEdit}
                      disabled={isTenantSaving}
                    >
                      Cancel
                    </Button>
                  </div>
                ) : (
                  <>
                    <span>
                      Tenant ID <span className="font-mono text-xs">{project.tenantId ?? '—'}</span>
                    </span>
                    <button
                      type="button"
                      onClick={startTenantEdit}
                      className="inline-flex items-center gap-1 font-medium text-link hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#255a90]"
                    >
                      <IconPencil size={14} aria-hidden="true" />
                      Edit
                    </button>
                    <span aria-hidden="true">·</span>
                    <span>{project.workflowCount} workflows</span>
                    <span aria-hidden="true">·</span>
                    <span>{project.membersCount} members</span>
                  </>
                )}
              </div>
            </div>
            <div className="flex shrink-0 flex-wrap gap-2">
              <Button type="button" variant="outline" onClick={() => setIsTopupsDialogOpen(true)}>
                Manage top-ups
              </Button>
              <Button type="button" onClick={() => setIsLimitsDialogOpen(true)}>
                Edit tenant limits
              </Button>
            </div>
          </div>

          {/* Usage banner */}
          {bannerText && (
            <Alert variant="warning">
              <AlertTitle>{bannerText}</AlertTitle>
              <AlertDescription>
                {project.weeklyTopupRuns > 0
                  ? `Top-up: +${formatCount(project.weeklyTopupRuns)} runs this week`
                  : 'Top-up: none this week'}
              </AlertDescription>
            </Alert>
          )}

          {/* Limit cards */}
          <div className="grid gap-4 lg:grid-cols-2">
            <LimitCard
              label="Weekly limit"
              used={project.weeklyExecutionCount}
              limit={getEffectiveWeeklyLimit(project)}
              topupRuns={project.weeklyTopupRuns}
              resetDate={nextWeeklyReset}
              changedAt={project.updatedAt}
              changedBy={project.updatedByName}
              stopBehavior={project.stopBehavior}
            />
            <LimitCard
              label="Annual limit"
              used={project.yearlyExecutionCount}
              limit={project.yearlyRateLimit}
              resetDate={nextYearlyReset}
              changedAt={project.updatedAt}
              changedBy={project.updatedByName}
              stopBehavior={project.stopBehavior}
            />
          </div>

          {/* Workflows */}
          <section className="space-y-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <h2 className="text-xl font-bold text-foreground">Workflows ({project.workflowCount})</h2>
              <div className="relative w-full sm:max-w-xs">
                <IconSearch
                  size={16}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                  aria-hidden="true"
                />
                <Input
                  type="text"
                  value={workflowSearch}
                  onChange={(e) => {
                    setWorkflowSearch(e.target.value);
                    setWorkflowPage(1);
                  }}
                  placeholder="Search workflows"
                  className="pl-9"
                  aria-label="Search workflows"
                />
              </div>
            </div>

            <div className="overflow-x-auto rounded-card border border-border bg-surface shadow-card">
              {usageQuery.isPending ? (
                <p className="px-5 py-8 text-center text-sm text-muted-foreground">Loading workflows...</p>
              ) : usageQuery.isError ? (
                <p className="px-5 py-8 text-center text-sm text-muted-foreground">Could not load workflow usage.</p>
              ) : workflows.length === 0 ? (
                <p className="px-5 py-8 text-center text-sm text-muted-foreground">This project has no workflows.</p>
              ) : filteredWorkflows.length === 0 ? (
                <p className="px-5 py-8 text-center text-sm text-muted-foreground">No workflows match your search.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-surface">
                      <TableHead className="uppercase">Workflow</TableHead>
                      <TableHead className="uppercase">Weekly runs</TableHead>
                      <TableHead className="uppercase">Annual runs</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {workflowPageItems.map((workflow) => (
                      <TableRow key={workflow.workflowId}>
                        <TableCell>
                          <div className="space-y-0.5">
                            <p className="font-semibold text-foreground">{workflow.workflowName}</p>
                            <p className="font-mono text-xs text-muted-foreground">ID {workflow.workflowId}</p>
                          </div>
                        </TableCell>
                        <TableCell className="text-sm">{formatCount(workflow.weeklyCount)}</TableCell>
                        <TableCell className="text-sm">{formatCount(workflow.yearlyCount)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-muted-foreground">
                Showing {workflowPageItems.length} of {filteredWorkflows.length} workflows
              </p>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setWorkflowPage(currentWorkflowPage - 1)}
                  disabled={currentWorkflowPage <= 1}
                >
                  Previous
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setWorkflowPage(currentWorkflowPage + 1)}
                  disabled={currentWorkflowPage >= workflowTotalPages}
                >
                  Next
                </Button>
              </div>
            </div>
          </section>
        </div>
      </div>

      {/* Tenant removal confirmation */}
      <ConfirmDialog
        open={isDeleteTenantConfirmOpen}
        title="Remove tenant mapping"
        description={`This removes the tenant ID mapped to ${project.projectName}. The project keeps running with its current limits.`}
        confirmLabel="Remove"
        confirmVariant="destructive"
        isConfirming={deleteTenantMutation.isPending}
        onConfirm={confirmDeleteTenant}
        onCancel={() => setIsDeleteTenantConfirmOpen(false)}
      />

      {/* Edit limits dialog */}
      <EditRateLimitsDialog project={project} open={isLimitsDialogOpen} onOpenChange={setIsLimitsDialogOpen} />

      {/* Manage top-ups dialog */}
      <ManageTopupsDialog project={project} open={isTopupsDialogOpen} onOpenChange={setIsTopupsDialogOpen} />
    </div>
  );
}

interface LimitCardProps {
  label: 'Weekly limit' | 'Annual limit';
  used: number;
  limit: number | null;
  /** Runs added by top-ups this week; shown on the weekly card only. */
  topupRuns?: number;
  resetDate: Date;
  changedAt: string | null;
  changedBy: string | null;
  stopBehavior: RateLimitStopBehavior | null;
}

function LimitCard({
  label,
  used,
  limit,
  topupRuns,
  resetDate,
  changedAt,
  changedBy,
  stopBehavior,
}: Readonly<LimitCardProps>) {
  const ratio = getUsageRatio(used, limit);
  const percent = getUsagePercent(used, limit);
  const tone: UsageBarTone | null = ratio === null ? null : getUsageBarTone(ratio);

  return (
    <div className="rounded-card border border-border bg-surface p-5 shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{label}</h3>
        {changedAt !== null && (
          <span className="inline-flex items-center rounded-full border border-border bg-surface-muted px-2.5 py-0.5 text-xs text-muted-foreground">
            Changed {formatShortDate(new Date(changedAt))}
            {changedBy ? ` by ${changedBy}` : ''}
          </span>
        )}
      </div>
      <p className="mt-3 flex flex-wrap items-baseline gap-x-1.5">
        <span className="text-3xl font-bold text-foreground">{formatCount(used)}</span>
        <span className="text-sm text-muted-foreground">of {limit === null ? '—' : formatCount(limit)} runs</span>
      </p>
      <div data-tone={tone} className={`mt-3 h-2 w-full overflow-hidden rounded-full ${USAGE_BAR_TRACK_CLASS}`}>
        {tone !== null && (
          <div
            className={`h-full rounded-full ${USAGE_BAR_TONE_CLASSES[tone]}`}
            style={{ width: `${Math.min(100, percent ?? 0)}%` }}
          />
        )}
      </div>
      {tone !== null && (
        <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
          <span>{percent}% used</span>
          <span>Resets {formatResetDate(resetDate)}</span>
        </div>
      )}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3 text-xs">
        <span className="text-muted-foreground">
          {limit === null ? 'No limit configured' : getWhenReachedText(stopBehavior)}
        </span>
        {topupRuns !== undefined && topupRuns > 0 && (
          <span className="text-muted-foreground">Includes +{formatCount(topupRuns)} top-up</span>
        )}
      </div>
    </div>
  );
}
