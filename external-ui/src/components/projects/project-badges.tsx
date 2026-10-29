import { Badge } from '@/components/ui/badge';
import type { RateLimitStatus, UsageBarTone } from '@/lib/rate-limit';

/** Tailwind classes for the usage-bar fill, keyed by tone. */
export const USAGE_BAR_TONE_CLASSES: Record<UsageBarTone, string> = {
  blue: 'bg-information',
  amber: 'bg-warning',
  red: 'bg-danger',
};

/** Track (background) class for the usage bar. */
export const USAGE_BAR_TRACK_CLASS = 'bg-[#e8e8e8]';

const TYPE_BADGE_CLASSES: Record<'personal' | 'team', string> = {
  personal: 'bg-[#f1f8fe] text-[#1e5189] border border-[#c1ddfc]',
  team: 'bg-[#f3f2f1] text-[#605e5c] border border-[#e0dedc]',
};

/** Small "Team"/"Personal" pill shown next to project names. */
export function ProjectTypeBadge({ projectType }: { projectType: string }) {
  const isPersonal = projectType === 'personal';
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-md px-2.5 py-0.5 text-xs font-medium ${
        TYPE_BADGE_CLASSES[isPersonal ? 'personal' : 'team']
      }`}
    >
      {isPersonal ? 'Personal' : 'Team'}
    </span>
  );
}

const STATUS_BADGE_VARIANTS: Record<RateLimitStatus, 'success' | 'destructive' | 'warning' | 'secondary'> = {
  within_limit: 'success',
  limit_reached: 'destructive',
  near_limit: 'warning',
  no_limit: 'secondary',
};

const STATUS_BADGE_LABELS: Record<RateLimitStatus, string> = {
  within_limit: 'Within limit',
  limit_reached: 'Limit reached',
  near_limit: 'Near limit',
  no_limit: 'No limit',
};

/** Outlined pill summarizing a project's rate-limit status. */
export function RateLimitStatusBadge({ status }: { status: RateLimitStatus }) {
  return <Badge variant={STATUS_BADGE_VARIANTS[status]}>{STATUS_BADGE_LABELS[status]}</Badge>;
}
