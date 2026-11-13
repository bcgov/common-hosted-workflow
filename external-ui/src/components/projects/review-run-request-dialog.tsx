import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import axios from 'axios';
import { Link } from 'react-router';
import { IconInfoCircle, IconLoader2, IconX } from '@tabler/icons-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/hooks/use-toasts';
import {
  formatCount,
  formatResetDate,
  formatWeekdayShortDate,
  formatWeeklyKeyRange,
  getNextWeeklyReset,
  getNextYearlyReset,
  getUsageBarTone,
  getUsagePercent,
  getUsageRatio,
  getWeeklyPeriodKey,
  type UsageBarTone,
} from '@/lib/rate-limit';
import { USAGE_BAR_TONE_CLASSES, USAGE_BAR_TRACK_CLASS, ProjectTypeBadge } from './project-badges';
import {
  approveRunRequest,
  denyRunRequest,
  type AdminRunRequestItem,
  type AdminRunRequestStatus,
} from '../../services/backend/projects';

/** Note/reason cap — the counter reads "N / 500". */
const MAX_REVIEW_TEXT_LENGTH = 500;
/** Deny reason floor (mirrored by the service). */
const MIN_REASON_LENGTH = 10;
/** One-off top-up grant floor (mirrored by the service). */
const MIN_EXTRA_RUNS = 100;

const REVIEW_TZ = 'America/Vancouver';

const reviewDateFormat = new Intl.DateTimeFormat('en-US', {
  timeZone: REVIEW_TZ,
  month: 'short',
  day: 'numeric',
});
const reviewTimeFormat = new Intl.DateTimeFormat('en-US', {
  timeZone: REVIEW_TZ,
  hour: 'numeric',
  minute: '2-digit',
});

/** "Nov 4 at 3:52 PM" — the from-line and the decision stamps. */
export function formatSentAt(iso: string): string {
  const date = new Date(iso);
  return `${reviewDateFormat.format(date)} at ${reviewTimeFormat.format(date)}`;
}

/** "Nov 5, 10:14 AM" — the usage snapshot caption and list "sent" stamps. */
export function formatSentStamp(iso: string): string {
  const date = new Date(iso);
  return `${reviewDateFormat.format(date)}, ${reviewTimeFormat.format(date)}`;
}

type DialogDecisionMode = 'approve' | 'deny';

type DialogFieldErrors = Partial<Record<'granted' | 'weekly' | 'annual' | 'reason' | 'form', string>>;

/** The first name of "Jordan Lee" → "Jordan"; falls back to the whole name/email. */
function getFirstName(name: string | null): string {
  if (!name) {
    return 'the requester';
  }
  const first = name.split(' ')[0];
  return first.length > 0 ? first : name;
}

/**
 * Parses an amount input: a whole number (commas/spaces tolerated) → the
 * number; empty or anything else → undefined (invalid).
 */
function parseAmountInput(raw: string): number | undefined {
  const normalized = raw.trim().replaceAll(',', '').replaceAll(' ', '');
  if (!/^\d+$/.test(normalized)) {
    return undefined;
  }
  const value = Number.parseInt(normalized, 10);
  return Number.isSafeInteger(value) ? value : undefined;
}

/** Resolves the reviewer-facing message from a failed decision call. */
function getDecisionErrorMessage(error: unknown, fallback: string): string {
  if (axios.isAxiosError(error) && error.response) {
    const data = error.response.data as { message?: string } | undefined;
    if (data?.message) {
      return data.message;
    }
  }
  return fallback;
}

/** One usage cell of the "when they asked" snapshot card. */
function SnapshotUsageCell({
  label,
  used,
  limit,
  resetText,
}: {
  label: string;
  used: number | null;
  limit: number | null;
  resetText: string;
}) {
  const ratio = used === null ? null : getUsageRatio(used, limit);
  const percent = used === null ? null : getUsagePercent(used, limit);
  const tone: UsageBarTone | null = ratio === null ? null : getUsageBarTone(ratio);
  return (
    <div className="min-w-0">
      <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1.5 flex flex-wrap items-baseline gap-x-1.5">
        <span className="text-xl font-bold text-foreground">{used === null ? '—' : formatCount(used)}</span>
        <span className="text-xs text-muted-foreground">
          of {limit === null ? 'no limit' : `${formatCount(limit)} runs`}
        </span>
      </p>
      <div data-tone={tone} className={`mt-2 h-1.5 w-full overflow-hidden rounded-full ${USAGE_BAR_TRACK_CLASS}`}>
        {tone !== null && (
          <div
            className={`h-full rounded-full ${USAGE_BAR_TONE_CLASSES[tone]}`}
            style={{ width: `${Math.min(100, percent ?? 0)}%` }}
          />
        )}
      </div>
      <p className="mt-1.5 text-xs text-muted-foreground">
        {ratio === null ? 'No limit set' : `${percent}% used · resets ${resetText}`}
      </p>
    </div>
  );
}

/** One row of the "What they asked for" grid. */
function AskedRow({ term, children }: { term: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-1 sm:grid-cols-[9rem_1fr] sm:gap-4">
      <dt className="text-sm font-semibold text-foreground">{term}</dt>
      <dd className="min-w-0 text-sm leading-5 text-muted-foreground">{children}</dd>
    </div>
  );
}

/** The info box spelling out what approval would do. */
function DecisionSummaryBox({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-card border border-[#c1ddfc] bg-[#f1f8fe] p-4">
      <p className="flex items-start gap-2 text-sm font-semibold text-foreground">
        <IconInfoCircle size={16} className="mt-0.5 shrink-0 text-[#1e5189]" aria-hidden="true" />
        <span>{title}</span>
      </p>
      <p className="mt-1 text-sm leading-5 text-muted-foreground">{description}</p>
    </div>
  );
}

const STATUS_BADGE_VARIANTS: Record<AdminRunRequestStatus, 'warning' | 'success' | 'destructive' | 'secondary'> = {
  pending: 'warning',
  approved: 'success',
  denied: 'destructive',
  cancelled: 'secondary',
};

const STATUS_BADGE_LABELS: Record<AdminRunRequestStatus, string> = {
  pending: 'Pending',
  approved: 'Approved',
  denied: 'Denied',
  cancelled: 'Cancelled',
};

export interface ReviewRunRequestDialogProps {
  request: AdminRunRequestItem;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * Member view: shows what was asked without the approve/deny decision
   * form — decisions stay with platform admins.
   */
  readOnly?: boolean;
}

/**
 * The admin "Review {project}'s request" dialog: what the member asked for,
 * the usage snapshot from when they asked, and the approve/deny decision
 * (runs to grant, new limits, optional note, required deny reason). Decided
 * requests open the same dialog read-only with the decision recorded, and
 * members always get it read-only.
 */
export function ReviewRunRequestDialog({
  request,
  open,
  onOpenChange,
  readOnly = false,
}: Readonly<ReviewRunRequestDialogProps>) {
  const queryClient = useQueryClient();
  const isDecided = request.status !== 'pending';

  const [decisionMode, setDecisionMode] = useState<DialogDecisionMode>('approve');
  const [grantedRunsInput, setGrantedRunsInput] = useState('');
  const [weeklyLimitInput, setWeeklyLimitInput] = useState('');
  const [annualLimitInput, setAnnualLimitInput] = useState('');
  const [note, setNote] = useState('');
  const [reason, setReason] = useState('');
  const [errors, setErrors] = useState<DialogFieldErrors>({});

  // Fresh form each time the dialog opens or a different request is opened.
  useEffect(() => {
    if (open) {
      setDecisionMode('approve');
      setGrantedRunsInput(request.extraRuns !== null ? formatCount(request.extraRuns) : '');
      setWeeklyLimitInput(request.requestedWeeklyLimit !== null ? formatCount(request.requestedWeeklyLimit) : '');
      setAnnualLimitInput(request.requestedAnnualLimit !== null ? formatCount(request.requestedAnnualLimit) : '');
      setNote('');
      setReason('');
      setErrors({});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-seed the form only when the dialog opens or the request changes
  }, [open, request.id]);

  function invalidateAfterDecision() {
    void queryClient.invalidateQueries({ queryKey: ['run-requests'] });
    void queryClient.invalidateQueries({ queryKey: ['projects', 'all'] });
    void queryClient.invalidateQueries({ queryKey: ['project', request.projectId] });
  }

  const approveMutation = useMutation({
    mutationFn: (body: { grantedRuns?: number; newWeeklyLimit?: number; newAnnualLimit?: number; note?: string }) =>
      approveRunRequest(request.id, body),
    onSuccess: (_result, variables) => {
      invalidateAfterDecision();
      onOpenChange(false);
      toast.success(getApprovedToastMessage(request, variables));
    },
    onError: (error) =>
      setErrors((prev) => ({
        ...prev,
        form: getDecisionErrorMessage(error, 'Could not approve the request. Try again.'),
      })),
  });

  const denyMutation = useMutation({
    mutationFn: (body: { reason: string }) => denyRunRequest(request.id, body),
    onSuccess: () => {
      invalidateAfterDecision();
      onOpenChange(false);
      toast.success(
        `Denied · ${getFirstName(request.requestedByName)} will see your reason on the project page and in the email.`,
      );
    },
    onError: (error) =>
      setErrors((prev) => ({
        ...prev,
        form: getDecisionErrorMessage(error, 'Could not deny the request. Try again.'),
      })),
  });

  const isSaving = approveMutation.isPending || denyMutation.isPending;

  const parsedGrantedRuns = parseAmountInput(grantedRunsInput);
  const parsedWeeklyLimit = parseAmountInput(weeklyLimitInput);
  const parsedAnnualLimit = parseAmountInput(annualLimitInput);
  const firstName = getFirstName(request.requestedByName);

  function validateApprove(): DialogFieldErrors {
    const nextErrors: DialogFieldErrors = {};
    if (request.requestKind === 'extra_runs') {
      if (parsedGrantedRuns === undefined || parsedGrantedRuns < MIN_EXTRA_RUNS) {
        nextErrors.granted = `Enter a whole number of at least ${formatCount(MIN_EXTRA_RUNS)} runs, or choose Deny`;
      } else if (parsedGrantedRuns > (request.extraRuns ?? 0)) {
        nextErrors.granted = `Runs to grant cannot be above the ${formatCount(request.extraRuns ?? 0)} asked for`;
      }
    } else {
      const weeklyAsked = request.requestedWeeklyLimit;
      const annualAsked = request.requestedAnnualLimit;
      let hasActualChange = false;
      if (weeklyAsked !== null) {
        if (parsedWeeklyLimit === undefined) {
          nextErrors.weekly = 'Enter a whole number of runs';
        } else if (request.currentWeeklyLimit !== null && parsedWeeklyLimit < request.currentWeeklyLimit) {
          nextErrors.weekly = `The new weekly limit cannot be lower than the current ${formatCount(request.currentWeeklyLimit)}`;
        } else if (parsedWeeklyLimit > weeklyAsked) {
          nextErrors.weekly = `The new weekly limit cannot be above the ${formatCount(weeklyAsked)} asked for`;
        } else if (request.currentWeeklyLimit === null || parsedWeeklyLimit > request.currentWeeklyLimit) {
          hasActualChange = true;
        }
      }
      if (annualAsked !== null) {
        if (parsedAnnualLimit === undefined) {
          nextErrors.annual = 'Enter a whole number of runs';
        } else if (request.currentAnnualLimit !== null && parsedAnnualLimit < request.currentAnnualLimit) {
          nextErrors.annual = `The new annual limit cannot be lower than the current ${formatCount(request.currentAnnualLimit)}`;
        } else if (parsedAnnualLimit > annualAsked) {
          nextErrors.annual = `The new annual limit cannot be above the ${formatCount(annualAsked)} asked for`;
        } else if (request.currentAnnualLimit === null || parsedAnnualLimit > request.currentAnnualLimit) {
          hasActualChange = true;
        }
      }
      if (parsedWeeklyLimit !== undefined && parsedAnnualLimit !== undefined && parsedAnnualLimit < parsedWeeklyLimit) {
        nextErrors.annual = 'The annual limit must be at least the weekly limit';
      }
      if (!nextErrors.weekly && !nextErrors.annual && !hasActualChange) {
        nextErrors.form = 'Grant at least one limit above the current values, or deny the request';
      }
    }
    return nextErrors;
  }

  function handleApprove() {
    const nextErrors = validateApprove();
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      return;
    }
    const trimmedNote = note.trim();
    if (request.requestKind === 'extra_runs') {
      approveMutation.mutate({ grantedRuns: parsedGrantedRuns ?? 0, note: trimmedNote || undefined });
    } else {
      approveMutation.mutate({
        newWeeklyLimit: request.requestedWeeklyLimit !== null ? (parsedWeeklyLimit ?? 0) : undefined,
        newAnnualLimit: request.requestedAnnualLimit !== null ? (parsedAnnualLimit ?? 0) : undefined,
        note: trimmedNote || undefined,
      });
    }
  }

  function handleDeny() {
    const trimmedReason = reason.trim();
    if (trimmedReason.length < MIN_REASON_LENGTH || trimmedReason.length > MAX_REVIEW_TEXT_LENGTH) {
      setErrors({
        reason: `Tell ${firstName} why, so they know what to change before asking again.`,
      });
      return;
    }
    setErrors({});
    denyMutation.mutate({ reason: trimmedReason });
  }

  const weeklyLimitForGrant =
    request.requestKind === 'extra_runs' && parsedGrantedRuns !== undefined
      ? (request.currentWeeklyLimit ?? 0) + parsedGrantedRuns
      : null;

  const isThisWeek = request.periodKey !== null && request.periodKey === getWeeklyPeriodKey();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90svh] max-w-2xl overflow-y-auto">
        <DialogClose asChild>
          <Button variant="ghost" size="icon" className="absolute top-3 right-3" aria-label="Close">
            <IconX size={16} aria-hidden="true" />
          </Button>
        </DialogClose>
        <DialogHeader>
          <DialogTitle>
            {readOnly ? `${request.projectName}'s request` : `Review ${request.projectName}'s request`}
          </DialogTitle>
          <DialogDescription>
            From {request.requestedByName} ({request.requestedByRoleLabel ?? 'member'}) · sent{' '}
            {formatSentAt(request.createdAt)}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-foreground">What they asked for</span>
            <ProjectTypeBadge projectType={request.projectType} />
          </div>
          <Link
            to={`/projects/${encodeURIComponent(request.projectId)}`}
            target="_blank"
            rel="noreferrer"
            className="text-sm font-medium text-link hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#255a90]"
          >
            Open {request.projectName} project page
          </Link>
        </div>

        <dl className="space-y-2 rounded-card border border-border bg-surface-muted p-4">
          {request.requestKind === 'extra_runs' ? (
            <>
              <AskedRow term="Request">Extra runs for one week</AskedRow>
              <AskedRow term="Amount">
                {request.extraRuns !== null ? `${formatCount(request.extraRuns)} runs` : '—'}
              </AskedRow>
              <AskedRow term="Week">
                {request.periodKey ? formatWeeklyKeyRange(request.periodKey) : '—'}
                {isThisWeek ? ' (this week)' : ''}
              </AskedRow>
            </>
          ) : (
            <>
              <AskedRow term="Request">A higher limit</AskedRow>
              <AskedRow term="Weekly limit">
                {request.requestedWeeklyLimit !== null
                  ? `${formatCount(request.requestedWeeklyLimit)} asked, now ${request.currentWeeklyLimit === null ? 'no limit' : formatCount(request.currentWeeklyLimit)}`
                  : `No change asked, now ${request.currentWeeklyLimit === null ? 'no limit' : formatCount(request.currentWeeklyLimit)}`}
              </AskedRow>
              <AskedRow term="Annual limit">
                {request.requestedAnnualLimit !== null
                  ? `${formatCount(request.requestedAnnualLimit)} asked, now ${request.currentAnnualLimit === null ? 'no limit' : formatCount(request.currentAnnualLimit)}`
                  : `No change asked, now ${request.currentAnnualLimit === null ? 'no limit' : formatCount(request.currentAnnualLimit)}`}
              </AskedRow>
            </>
          )}
          <AskedRow term="Why">{request.reason}</AskedRow>
          {request.requestKind === 'extra_runs' && request.lastTopup && (
            <AskedRow term="Last top-up">
              +{formatCount(request.lastTopup.amount)} for {formatWeeklyKeyRange(request.lastTopup.periodKey)}, approved{' '}
              {request.lastTopup.createdByName ? `by ${request.lastTopup.createdByName} ` : ''}
              on {formatSentStamp(request.lastTopup.createdAt)}
            </AskedRow>
          )}
          {request.requestKind === 'limit_increase' && request.lastLimitChange && (
            <AskedRow term="Last change">
              Limits set {formatSentStamp(request.lastLimitChange.at)}
              {request.lastLimitChange.byName ? ` by ${request.lastLimitChange.byName}` : ''}
            </AskedRow>
          )}
        </dl>

        {/* Usage snapshot: what the admin saw when the request landed, plus today's number. */}
        <div className="rounded-card border border-border bg-surface-muted p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-sm font-bold text-foreground">
              {request.projectName} when {firstName} asked
            </p>
            <p className="text-xs text-muted-foreground">
              {formatSentStamp(request.createdAt)}. Now {formatCount(request.weeklyUsedNow)} this week (
              {request.currentWeeklyLimit === null
                ? 'no limit'
                : `${getUsagePercent(request.weeklyUsedNow, request.currentWeeklyLimit)}%`}
              )
            </p>
          </div>
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            <SnapshotUsageCell
              label="This week"
              used={request.weeklyUsedWhenSent}
              limit={request.currentWeeklyLimit}
              resetText={formatWeekdayShortDate(getNextWeeklyReset())}
            />
            <SnapshotUsageCell
              label="This year"
              used={request.yearlyUsedWhenSent}
              limit={request.currentAnnualLimit}
              resetText={formatResetDate(getNextYearlyReset())}
            />
          </div>
        </div>

        {isDecided ? (
          <DecidedPanel request={request} firstName={firstName} onOpenChange={onOpenChange} />
        ) : readOnly ? (
          <MemberPendingPanel firstName={firstName} onOpenChange={onOpenChange} />
        ) : (
          <>
            {/* Decision radios */}
            <fieldset className="space-y-2" disabled={isSaving}>
              <legend className="text-sm font-semibold text-foreground">Your decision</legend>
              <div className="flex gap-6">
                <label htmlFor="run-request-decision-approve" className="flex cursor-pointer items-center gap-2">
                  <input
                    id="run-request-decision-approve"
                    type="radio"
                    name="run-request-decision"
                    className="h-4 w-4 shrink-0 accent-[#013366]"
                    checked={decisionMode === 'approve'}
                    onChange={() => setDecisionMode('approve')}
                    disabled={isSaving}
                  />
                  <span className="text-sm font-semibold text-foreground">Approve</span>
                </label>
                <label htmlFor="run-request-decision-deny" className="flex cursor-pointer items-center gap-2">
                  <input
                    id="run-request-decision-deny"
                    type="radio"
                    name="run-request-decision"
                    className="h-4 w-4 shrink-0 accent-[#013366]"
                    checked={decisionMode === 'deny'}
                    onChange={() => setDecisionMode('deny')}
                    disabled={isSaving}
                  />
                  <span className="text-sm font-semibold text-foreground">Deny</span>
                </label>
              </div>
            </fieldset>

            {decisionMode === 'approve' ? (
              <>
                {request.requestKind === 'extra_runs' ? (
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field
                      label="Runs to grant"
                      htmlFor="run-request-grant"
                      description={
                        request.extraRuns !== null
                          ? `They asked for ${formatCount(request.extraRuns)}. You can grant less.`
                          : undefined
                      }
                      error={errors.granted}
                    >
                      <Input
                        id="run-request-grant"
                        inputMode="numeric"
                        autoComplete="off"
                        value={grantedRunsInput}
                        onChange={(e) => {
                          setGrantedRunsInput(e.target.value);
                          setErrors((prev) => ({ ...prev, granted: undefined }));
                        }}
                        disabled={isSaving}
                      />
                    </Field>
                    <div className="space-y-3">
                      <Label htmlFor="run-request-weekly-total">
                        Weekly limit for {request.periodKey ? formatWeeklyKeyRange(request.periodKey) : 'that week'}
                      </Label>
                      <p className="text-xl font-bold text-foreground" id="run-request-weekly-total">
                        {weeklyLimitForGrant === null ? '—' : formatCount(weeklyLimitForGrant)}{' '}
                        <span className="text-sm font-normal text-muted-foreground">runs</span>
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {parsedGrantedRuns === undefined || parsedGrantedRuns === 0
                          ? `Enter at least ${formatCount(MIN_EXTRA_RUNS)} runs, or choose Deny.`
                          : `${request.currentWeeklyLimit === null ? 'No weekly limit today' : formatCount(request.currentWeeklyLimit) + ' limit'} + ${formatCount(parsedGrantedRuns)} extra`}
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="grid gap-4 sm:grid-cols-2">
                    {request.requestedWeeklyLimit !== null && (
                      <Field
                        label="New weekly limit"
                        htmlFor="run-request-decide-weekly"
                        description={`${formatCount(request.requestedWeeklyLimit)} asked, now ${request.currentWeeklyLimit === null ? 'no limit' : formatCount(request.currentWeeklyLimit)}.`}
                        error={errors.weekly}
                      >
                        <Input
                          id="run-request-decide-weekly"
                          inputMode="numeric"
                          autoComplete="off"
                          value={weeklyLimitInput}
                          onChange={(e) => {
                            setWeeklyLimitInput(e.target.value);
                            setErrors((prev) => ({ ...prev, weekly: undefined, form: undefined }));
                          }}
                          disabled={isSaving}
                        />
                      </Field>
                    )}
                    {request.requestedAnnualLimit !== null && (
                      <Field
                        label="New annual limit"
                        htmlFor="run-request-decide-annual"
                        description={`${formatCount(request.requestedAnnualLimit)} asked, now ${request.currentAnnualLimit === null ? 'no limit' : formatCount(request.currentAnnualLimit)}.`}
                        error={errors.annual}
                      >
                        <Input
                          id="run-request-decide-annual"
                          inputMode="numeric"
                          autoComplete="off"
                          value={annualLimitInput}
                          onChange={(e) => {
                            setAnnualLimitInput(e.target.value);
                            setErrors((prev) => ({ ...prev, annual: undefined, form: undefined }));
                          }}
                          disabled={isSaving}
                        />
                      </Field>
                    )}
                  </div>
                )}

                {/* Optional note */}
                <div className="space-y-2">
                  <div className="flex items-baseline justify-between gap-2">
                    <Label htmlFor="run-request-note">Note to {firstName} (optional)</Label>
                    <span className="text-xs text-muted-foreground" aria-hidden="true">
                      {note.length} / {MAX_REVIEW_TEXT_LENGTH}
                    </span>
                  </div>
                  <Textarea
                    id="run-request-note"
                    value={note}
                    maxLength={MAX_REVIEW_TEXT_LENGTH}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder={`e.g. Approved ${parsedGrantedRuns !== undefined ? formatCount(parsedGrantedRuns) : 'some'} for now. Send another request if it stays high.`}
                    disabled={isSaving}
                  />
                  <p className="text-xs text-muted-foreground">
                    Shown on {request.projectName}'s project page and in the email. Worth adding when you grant less
                    than asked.
                  </p>
                </div>

                <DecisionSummaryBox
                  title={getApprovedSummaryTitle(request, parsedGrantedRuns, parsedWeeklyLimit, parsedAnnualLimit)}
                  description={getApprovedSummaryDescription(request, firstName)}
                />
              </>
            ) : (
              <div className="space-y-2">
                <div className="flex items-baseline justify-between gap-2">
                  <Label htmlFor="run-request-deny-reason">Reason for denying</Label>
                  <span className="text-xs text-muted-foreground" aria-hidden="true">
                    {reason.length} / {MAX_REVIEW_TEXT_LENGTH}
                  </span>
                </div>
                <Textarea
                  id="run-request-deny-reason"
                  value={reason}
                  maxLength={MAX_REVIEW_TEXT_LENGTH}
                  onChange={(e) => {
                    setReason(e.target.value);
                    setErrors((prev) => ({ ...prev, reason: undefined }));
                  }}
                  placeholder="What would need to change for you to approve it?"
                  aria-invalid={errors.reason ? true : undefined}
                  disabled={isSaving}
                />
                {errors.reason ? (
                  <p role="alert" className="text-xs font-bold leading-4 text-danger-foreground">
                    {errors.reason}
                  </p>
                ) : null}
                <p className="text-xs text-muted-foreground">
                  {firstName} sees this word for word on the project page and in the email.
                </p>
              </div>
            )}

            {errors.form && (
              <p role="alert" className="text-sm font-bold text-danger-foreground">
                {errors.form}
              </p>
            )}

            {isSaving ? (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <IconLoader2 size={16} className="animate-spin" aria-hidden="true" />
                {decisionMode === 'approve' ? 'Approving...' : 'Denying...'}
              </p>
            ) : null}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>
                Cancel
              </Button>
              {decisionMode === 'approve' ? (
                <Button type="button" onClick={handleApprove} disabled={isSaving}>
                  {isSaving
                    ? 'Approving...'
                    : getApproveButtonLabel(request, parsedGrantedRuns, parsedWeeklyLimit, parsedAnnualLimit)}
                </Button>
              ) : (
                <Button type="button" variant="destructive" onClick={handleDeny} disabled={isSaving}>
                  {isSaving ? 'Denying...' : 'Deny request'}
                </Button>
              )}
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** The read-only view a member gets for their project's pending request. */
function MemberPendingPanel({ firstName, onOpenChange }: { firstName: string; onOpenChange: (open: boolean) => void }) {
  return (
    <div className="space-y-3">
      <p className="rounded-card border border-[#c1ddfc] bg-[#f1f8fe] p-3 text-sm text-foreground">
        A platform admin reviews this request. We'll email {firstName} when they decide.
      </p>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
          Close
        </Button>
      </DialogFooter>
    </div>
  );
}

/** The read-only decision record for a decided request. */
function DecidedPanel({
  request,
  firstName,
  onOpenChange,
}: {
  request: AdminRunRequestItem;
  firstName: string;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <div className="space-y-3">
      <dl className="space-y-2 rounded-card border border-border bg-surface-muted p-4">
        <div className="grid grid-cols-1 gap-1 sm:grid-cols-[9rem_1fr] sm:gap-4">
          <dt className="text-sm font-semibold text-foreground">Decision</dt>
          <dd className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <Badge variant={STATUS_BADGE_VARIANTS[request.status]}>{STATUS_BADGE_LABELS[request.status]}</Badge>
            {request.decidedAt && (
              <span>
                {formatSentAt(request.decidedAt)}
                {request.decidedByName ? ` by ${request.decidedByName}` : ''}
              </span>
            )}
          </dd>
        </div>
        {request.status === 'approved' && request.requestKind === 'extra_runs' && request.grantedRuns !== null && (
          <AskedRow term="Granted">
            {formatCount(request.grantedRuns)} extra runs
            {request.extraRuns !== null && request.grantedRuns !== request.extraRuns
              ? ` (of the ${formatCount(request.extraRuns)} asked for)`
              : ''}
          </AskedRow>
        )}
        {request.status === 'approved' &&
          request.requestKind === 'limit_increase' &&
          request.decidedWeeklyLimit !== null && (
            <AskedRow term="New weekly limit">{formatCount(request.decidedWeeklyLimit)} runs a week</AskedRow>
          )}
        {request.status === 'approved' &&
          request.requestKind === 'limit_increase' &&
          request.decidedAnnualLimit !== null && (
            <AskedRow term="New annual limit">{formatCount(request.decidedAnnualLimit)} runs a year</AskedRow>
          )}
        {request.decisionNote && (
          <AskedRow term={request.status === 'denied' ? 'Reason for denying' : 'Note'}>{request.decisionNote}</AskedRow>
        )}
      </dl>
      <p className="text-xs text-muted-foreground">{firstName} sees this on the project page and in the email.</p>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
          Close
        </Button>
      </DialogFooter>
    </div>
  );
}

/** Toast copy after an approval (R6): what changed and who was emailed. */
function getApprovedToastMessage(
  request: AdminRunRequestItem,
  body: { grantedRuns?: number; newWeeklyLimit?: number; newAnnualLimit?: number; note?: string },
): string {
  let what: string;
  if (request.requestKind === 'extra_runs') {
    what = `${request.projectName} gets ${formatCount(body.grantedRuns ?? request.extraRuns ?? 0)} extra runs for ${
      request.periodKey ? formatWeeklyKeyRange(request.periodKey) : 'that week'
    }`;
  } else {
    const changes: string[] = [];
    if (body.newWeeklyLimit !== undefined) {
      changes.push(`weekly limit goes to ${formatCount(body.newWeeklyLimit)}`);
    }
    if (body.newAnnualLimit !== undefined) {
      changes.push(`annual limit goes to ${formatCount(body.newAnnualLimit)}`);
    }
    what = `${request.projectName}'s ${changes.join(' and its ')}`;
  }
  return `Approved · ${what}. We emailed ${request.requestedByName ?? 'the requester'}.`;
}

/** The approve-button label (R2/R3): what will happen. */
function getApproveButtonLabel(
  request: AdminRunRequestItem,
  grantedRuns: number | undefined,
  weekly: number | undefined,
  annual: number | undefined,
): string {
  if (request.requestKind === 'extra_runs') {
    return grantedRuns !== undefined ? `Approve ${formatCount(grantedRuns)} runs` : 'Approve';
  }
  const changes: string[] = [];
  if (weekly !== undefined) {
    changes.push(`${formatCount(weekly)} a week`);
  }
  if (annual !== undefined) {
    changes.push(`${formatCount(annual)} a year`);
  }
  return changes.length > 0 ? `Approve ${changes.join(' and ')}` : 'Approve new limit';
}

/** The summary-box title for an approval. */
function getApprovedSummaryTitle(
  request: AdminRunRequestItem,
  grantedRuns: number | undefined,
  weekly: number | undefined,
  annual: number | undefined,
): string {
  if (request.requestKind === 'extra_runs') {
    const asked = request.extraRuns ?? 0;
    const amount = grantedRuns !== undefined ? grantedRuns : asked;
    return `${request.projectName} gets ${formatCount(amount)} extra runs for ${
      request.periodKey ? formatWeeklyKeyRange(request.periodKey) : 'that week'
    }`;
  }
  const changes: string[] = [];
  if (weekly !== undefined) {
    changes.push(`weekly limit goes to ${formatCount(weekly)}`);
  }
  if (annual !== undefined) {
    changes.push(`annual limit goes to ${formatCount(annual)}`);
  }
  return changes.length > 0
    ? `${request.projectName}'s ${changes.join(' and ')}`
    : `${request.projectName}'s limits stay as they are`;
}

/** The summary-box description for an approval. */
function getApprovedSummaryDescription(request: AdminRunRequestItem, firstName: string): string {
  if (request.requestKind === 'extra_runs') {
    return `That is added to ${request.projectName}'s top-up history, and ${firstName} gets an email with your note.`;
  }
  return 'It starts now and stays until an admin changes it, and is saved with your name and note, like Edit limits.';
}
