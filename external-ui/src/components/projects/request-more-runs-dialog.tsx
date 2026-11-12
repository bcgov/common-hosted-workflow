import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import axios from 'axios';
import { IconInfoCircle, IconLoader2, IconX } from '@tabler/icons-react';
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
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/hooks/use-toasts';
import {
  formatCount,
  formatResetDate,
  formatWeekdayShortDate,
  formatWeeklyKeyRange,
  getEffectiveYearlyLimit,
  getEffectiveWeeklyLimit,
  getNextWeeklyReset,
  getNextYearlyReset,
  getUsageBarTone,
  getUsagePercent,
  getUsageRatio,
  listUpcomingWeeklyPeriodOptions,
  type UsageBarTone,
} from '@/lib/rate-limit';
import { USAGE_BAR_TONE_CLASSES, USAGE_BAR_TRACK_CLASS } from './project-badges';
import {
  createRunRequest,
  type CreateRunRequestBody,
  type ProjectItem,
  type RunRequestKind,
} from '../../services/backend/projects';

/** Reason copy cap — the counter reads "N / 500". */
const MAX_REASON_LENGTH = 500;
/** One-off top-up request bounds (mirrored by the service). */
const MIN_EXTRA_RUNS = 100;
const MAX_EXTRA_RUNS = 50_000;
/** Weekly horizon: the current week plus the coming 8. */
const RUN_REQUEST_HORIZON_WEEKS = 9;

const MODE_META: Record<RunRequestKind, { title: string; description: string; sentence: string }> = {
  extra_runs: {
    title: 'Extra runs for one week',
    description: 'A one-time top-up for a busy week. Your limit goes back to normal after.',
    sentence: 'extra runs',
  },
  limit_increase: {
    title: 'A higher limit',
    description: 'A lasting change to your weekly or annual limit, for steady growth.',
    sentence: 'a higher limit',
  },
};

type DialogFieldErrors = Partial<Record<'extraRuns' | 'weekly' | 'annual' | 'reason' | 'form', string>>;

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

function getSendErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error) && error.response) {
    const status = error.response.status;
    if (status === 409) return 'This project already has a request waiting for review.';
    if (status === 403) return 'Only project admins, editors and personal owners can request more runs.';
    if (status === 400) return 'Check the highlighted fields — the request was not valid.';
  }
  return 'Could not send the request. Try again.';
}

/** One usage cell of the "right now" summary card (bar + used/limit + reset). */
function UsageCell({ label, used, limit, resetText }: { label: string; used: number; limit: number | null; resetText: string }) {
  const ratio = getUsageRatio(used, limit);
  const percent = getUsagePercent(used, limit);
  const tone: UsageBarTone | null = ratio === null ? null : getUsageBarTone(ratio);
  return (
    <div className="min-w-0">
      <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1.5 flex flex-wrap items-baseline gap-x-1.5">
        <span className="text-xl font-bold text-foreground">{formatCount(used)}</span>
        <span className="text-xs text-muted-foreground">of {limit === null ? '—' : formatCount(limit)} runs</span>
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

/** One selectable "What do you need?" radio card. */
function ModeCard({
  inputId,
  selected,
  title,
  description,
  onSelect,
  disabled,
}: {
  inputId: string;
  selected: boolean;
  title: string;
  description: string;
  onSelect: () => void;
  disabled: boolean;
}) {
  return (
    <label
      htmlFor={inputId}
      className={`flex cursor-pointer gap-3 rounded-card border p-4 ${
        selected ? 'border-[#1e5189] bg-[#f1f8fe]' : 'border-border bg-surface'
      }`}
    >
      <input
        id={inputId}
        type="radio"
        name="run-request-mode"
        className="mt-1 h-4 w-4 shrink-0 accent-[#1e5189]"
        checked={selected}
        onChange={onSelect}
        disabled={disabled}
      />
      <span className="space-y-1">
        <span className="block text-sm font-semibold text-foreground">{title}</span>
        <span className="block text-xs leading-4 text-muted-foreground">{description}</span>
      </span>
    </label>
  );
}

/** The "If approved" summary box under the form fields. */
function ApprovedBox({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-card border border-[#c1ddfc] bg-[#f1f8fe] p-4">
      <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <IconInfoCircle size={16} className="shrink-0 text-[#1e5189]" aria-hidden="true" />
        {title}
      </p>
      <p className="mt-1 text-sm leading-5 text-muted-foreground">{description}</p>
    </div>
  );
}

export interface RequestMoreRunsDialogProps {
  project: ProjectItem;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * The member "Request more runs" form: a one-week top-up request or a lasting
 * limit raise, with the project's current usage for context. Submissions land
 * as a pending request the member can cancel from the project page; the real
 * admin review flow arrives with the request & approval system.
 */
export function RequestMoreRunsDialog({ project, open, onOpenChange }: Readonly<RequestMoreRunsDialogProps>) {
  const queryClient = useQueryClient();
  const [requestMode, setRequestMode] = useState<RunRequestKind>('extra_runs');
  const [extraRunsInput, setExtraRunsInput] = useState('');
  const [periodKey, setPeriodKey] = useState('');
  const [weeklyLimitInput, setWeeklyLimitInput] = useState('');
  const [annualLimitInput, setAnnualLimitInput] = useState('');
  const [reason, setReason] = useState('');
  const [errors, setErrors] = useState<DialogFieldErrors>({});

  // Fresh form each time the dialog opens, seeded with the current week.
  useEffect(() => {
    if (open) {
      setRequestMode('extra_runs');
      setExtraRunsInput('');
      setPeriodKey(listUpcomingWeeklyPeriodOptions(RUN_REQUEST_HORIZON_WEEKS)[0].value);
      setWeeklyLimitInput('');
      setAnnualLimitInput('');
      setReason('');
      setErrors({});
    }
  }, [open]);

  function invalidateProjectQueries() {
    void queryClient.invalidateQueries({ queryKey: ['projects'] });
    void queryClient.invalidateQueries({ queryKey: ['project', project.projectId] });
  }

  const sendMutation = useMutation({
    mutationFn: (body: CreateRunRequestBody) => createRunRequest(project.projectId, body),
    onSuccess: () => {
      invalidateProjectQueries();
      onOpenChange(false);
      toast.success("Request sent. We'll email you when an admin decides.");
    },
    onError: (error) => setErrors((prev) => ({ ...prev, form: getSendErrorMessage(error) })),
  });

  const parsedExtraRuns = parseAmountInput(extraRunsInput);
  const parsedWeeklyLimit = parseAmountInput(weeklyLimitInput);
  const parsedAnnualLimit = parseAmountInput(annualLimitInput);
  const effectiveWeeklyLimit = getEffectiveWeeklyLimit(project);
  const effectiveYearlyLimit = getEffectiveYearlyLimit(project);
  const hasPendingRequest = project.pendingRunRequest != null;
  const isSending = sendMutation.isPending;

  function validate(): DialogFieldErrors {
    const nextErrors: DialogFieldErrors = {};
    if (requestMode === 'extra_runs') {
      if (parsedExtraRuns === undefined || parsedExtraRuns < MIN_EXTRA_RUNS || parsedExtraRuns > MAX_EXTRA_RUNS) {
        nextErrors.extraRuns = `Enter a whole number of runs between ${formatCount(MIN_EXTRA_RUNS)} and ${formatCount(MAX_EXTRA_RUNS)}`;
      }
    } else {
      if (parsedWeeklyLimit === undefined && parsedAnnualLimit === undefined) {
        nextErrors.weekly = 'Change one or both limits';
      }
      if (parsedWeeklyLimit !== undefined && parsedWeeklyLimit < 1) {
        nextErrors.weekly = 'Enter a whole number of runs of at least 1';
      }
      if (parsedAnnualLimit !== undefined && parsedAnnualLimit < 1) {
        nextErrors.annual = 'Enter a whole number of runs of at least 1';
      }
      if (parsedWeeklyLimit !== undefined && parsedAnnualLimit !== undefined && parsedAnnualLimit < parsedWeeklyLimit) {
        nextErrors.annual = 'The annual limit must be at least the weekly limit';
      }
    }
    if (reason.trim() === '') {
      nextErrors.reason = 'A reason is required';
    }
    return nextErrors;
  }

  function handleSend() {
    const nextErrors = validate();
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      return;
    }
    sendMutation.mutate({
      requestKind: requestMode,
      ...(requestMode === 'extra_runs'
        ? { extraRuns: parsedExtraRuns, periodKey }
        : {
            requestedWeeklyLimit: parsedWeeklyLimit ?? null,
            requestedAnnualLimit: parsedAnnualLimit ?? null,
          }),
      reason: reason.trim(),
    });
  }

  // "If approved" summary per mode (mock copy).
  let approvedTitle: string;
  let approvedDescription: string;
  let sendBlocked: string | null = null;
  if (requestMode === 'extra_runs') {
    if (effectiveWeeklyLimit === null) {
      approvedTitle = 'Your project has no weekly limit';
      approvedDescription = 'Extra runs add to a weekly limit, but this project has none. Ask for a higher limit instead.';
      sendBlocked = 'Extra runs need a weekly limit to add to.';
    } else if (parsedExtraRuns !== undefined && parsedExtraRuns >= MIN_EXTRA_RUNS && parsedExtraRuns <= MAX_EXTRA_RUNS) {
      approvedTitle = `If approved: up to ${formatCount(effectiveWeeklyLimit + parsedExtraRuns)} runs for ${formatWeeklyKeyRange(periodKey)}`;
      approvedDescription = `That is your ${formatCount(effectiveWeeklyLimit)} weekly limit plus the ${formatCount(parsedExtraRuns)} you asked for. Extra runs also count toward your annual limit.`;
    } else {
      approvedTitle = 'If approved: your weekly limit plus the extra runs';
      approvedDescription = 'Enter the number of extra runs to see the approved total here.';
    }
  } else if (parsedWeeklyLimit !== undefined && parsedAnnualLimit !== undefined) {
    approvedTitle = `If approved: ${formatCount(parsedWeeklyLimit)} runs a week and ${formatCount(parsedAnnualLimit)} a year`;
    approvedDescription =
      'New limits stay until a platform admin changes them. If you only need more runs for a busy week, ask for extra runs instead.';
  } else if (parsedWeeklyLimit !== undefined) {
    approvedTitle = `If approved: ${formatCount(parsedWeeklyLimit)} runs a week`;
    approvedDescription =
      'The annual limit stays as it is. New limits stay until a platform admin changes them. If you only need more runs for a busy week, ask for extra runs instead.';
  } else if (parsedAnnualLimit !== undefined) {
    approvedTitle = `If approved: ${formatCount(parsedAnnualLimit)} runs a year`;
    approvedDescription =
      'The weekly limit stays as it is. New limits stay until a platform admin changes them. If you only need more runs for a busy week, ask for extra runs instead.';
  } else {
    approvedTitle = 'If approved';
    approvedDescription = 'Enter one or both limits to see what approval would mean here.';
  }

  // (The current-limit labels live in the pending-request panel; the dialog
  // states the limits through the per-field "Now …" descriptions.)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90svh] max-w-2xl overflow-y-auto">
        <DialogClose asChild>
          <Button variant="ghost" size="icon" className="absolute top-3 right-3" aria-label="Close">
            <IconX size={16} aria-hidden="true" />
          </Button>
        </DialogClose>
        <DialogHeader>
          <DialogTitle>Request more runs for {project.projectName}</DialogTitle>
          <DialogDescription>A platform admin reviews every request. We'll email you when they decide.</DialogDescription>
        </DialogHeader>

        {hasPendingRequest && (
          <p role="status" className="rounded-card border border-[#c1ddfc] bg-[#f1f8fe] p-3 text-sm text-foreground">
            You already have a request waiting for review. Cancel it on this page before making another.
          </p>
        )}

        {/* Current usage summary */}
        <div className="rounded-card border border-border bg-surface-muted p-4">
          <div className="flex items-baseline justify-between gap-2">
            <p className="text-sm font-bold text-foreground">{project.projectName} right now</p>
            <p className="text-xs text-muted-foreground">Admins see these same numbers with your request</p>
          </div>
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            <UsageCell
              label="This week"
              used={project.weeklyExecutionCount}
              limit={effectiveWeeklyLimit}
              resetText={formatWeekdayShortDate(getNextWeeklyReset())}
            />
            <UsageCell
              label="This year"
              used={project.yearlyExecutionCount}
              limit={effectiveYearlyLimit}
              resetText={formatResetDate(getNextYearlyReset())}
            />
          </div>
        </div>

        {/* Mode selection */}
        <fieldset className="space-y-2" disabled={isSending}>
          <legend className="text-sm font-semibold text-foreground">What do you need?</legend>
          <div className="grid gap-3 sm:grid-cols-2">
            <ModeCard
              inputId="run-request-mode-extra"
              selected={requestMode === 'extra_runs'}
              title={MODE_META.extra_runs.title}
              description={MODE_META.extra_runs.description}
              onSelect={() => setRequestMode('extra_runs')}
              disabled={isSending}
            />
            <ModeCard
              inputId="run-request-mode-limit"
              selected={requestMode === 'limit_increase'}
              title={MODE_META.limit_increase.title}
              description={MODE_META.limit_increase.description}
              onSelect={() => setRequestMode('limit_increase')}
              disabled={isSending}
            />
          </div>
        </fieldset>

        {requestMode === 'extra_runs' ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="How many extra runs?"
              htmlFor="run-request-amount"
              description={`Between ${formatCount(MIN_EXTRA_RUNS)} and ${formatCount(MAX_EXTRA_RUNS)} runs.`}
              error={errors.extraRuns}
            >
              <Input
                id="run-request-amount"
                inputMode="numeric"
                autoComplete="off"
                placeholder="e.g. 5,000"
                value={extraRunsInput}
                onChange={(e) => {
                  setExtraRunsInput(e.target.value);
                  setErrors((prev) => ({ ...prev, extraRuns: undefined }));
                }}
                disabled={isSending}
              />
            </Field>
            <Field
              label="Which week?"
              htmlFor="run-request-week"
              description="This week or up to 8 weeks ahead. Weeks run Monday to Sunday."
            >
              <Select
                id="run-request-week"
                value={periodKey}
                onChange={(e) => setPeriodKey(e.target.value)}
                disabled={isSending}
              >
                {listUpcomingWeeklyPeriodOptions(RUN_REQUEST_HORIZON_WEEKS).map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="New weekly limit"
                htmlFor="run-request-weekly"
                description={
                  effectiveWeeklyLimit === null ? 'No weekly limit today.' : `Now ${formatCount(effectiveWeeklyLimit)} runs a week.`
                }
                error={errors.weekly}
              >
                <Input
                  id="run-request-weekly"
                  inputMode="numeric"
                  autoComplete="off"
                  placeholder="e.g. 12,000"
                  value={weeklyLimitInput}
                  onChange={(e) => {
                    setWeeklyLimitInput(e.target.value);
                    setErrors((prev) => ({ ...prev, weekly: undefined }));
                  }}
                  disabled={isSending}
                />
              </Field>
              <Field
                label="New annual limit"
                htmlFor="run-request-annual"
                description={
                  effectiveYearlyLimit === null ? 'No annual limit today.' : `Now ${formatCount(effectiveYearlyLimit)} runs a year.`
                }
                error={errors.annual}
              >
                <Input
                  id="run-request-annual"
                  inputMode="numeric"
                  autoComplete="off"
                  placeholder="e.g. 600,000"
                  value={annualLimitInput}
                  onChange={(e) => {
                    setAnnualLimitInput(e.target.value);
                    setErrors((prev) => ({ ...prev, annual: undefined }));
                  }}
                  disabled={isSending}
                />
              </Field>
            </div>
            <p className="text-xs text-muted-foreground">Change one or both. A limit you leave as it is stays the same.</p>
          </div>
        )}

        {/* Reason with char counter */}
        <div className="space-y-2">
          <div className="flex items-baseline justify-between gap-2">
            <Label htmlFor="run-request-reason">
              {requestMode === 'extra_runs' ? 'Why do you need them?' : 'Why do you need a higher limit?'}
              <span aria-hidden="true" className="ml-1 text-danger">
                *
              </span>
              <span className="sr-only"> (required)</span>
            </Label>
            <span className="text-xs text-muted-foreground" aria-hidden="true">
              {reason.length} / {MAX_REASON_LENGTH}
            </span>
          </div>
          <Textarea
            id="run-request-reason"
            value={reason}
            maxLength={MAX_REASON_LENGTH}
            onChange={(e) => {
              setReason(e.target.value);
              setErrors((prev) => ({ ...prev, reason: undefined }));
            }}
            placeholder={
              requestMode === 'extra_runs'
                ? 'e.g. Fall intake started early, so Invoice QR intake is running about twice its usual volume this week.'
                : 'e.g. We are adding three ministries to Trip plan approvals in January. That roughly doubles our weekly volume from then on.'
            }
            aria-invalid={errors.reason ? true : undefined}
            disabled={isSending}
          />
          <p className="text-xs text-muted-foreground">
            {requestMode === 'extra_runs'
              ? 'Required. Say what is driving the extra runs, so the admin can decide quickly.'
              : 'Required. Say what has changed and how long you expect it to last.'}
          </p>
          {errors.reason && (
            <p role="alert" className="text-xs font-bold leading-4 text-danger-foreground">
              {errors.reason}
            </p>
          )}
        </div>

        <ApprovedBox title={approvedTitle} description={approvedDescription} />

        {errors.form && (
          <p role="alert" className="text-sm font-bold text-danger-foreground">
            {errors.form}
          </p>
        )}

        {isSending ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <IconLoader2 size={16} className="animate-spin" aria-hidden="true" />
            Sending your request...
          </p>
        ) : null}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSending}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleSend}
            disabled={isSending || hasPendingRequest || sendBlocked !== null}
            title={sendBlocked ?? undefined}
          >
            {isSending ? 'Sending...' : 'Send request'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
