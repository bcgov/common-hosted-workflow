import { useEffect, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import DOMPurify from 'dompurify';
import { IconLoader2, IconCheck } from '@tabler/icons-react';
import { Button } from '@/components/ui/button';
import { postWilCallback } from '../../services/backend/wil';
import type { WilActionItem } from '../../services/backend/wil';
import { extractErrorMessage } from '../shared/error-utils';
import { useClaimVerification, verifyClaimBeforeSubmit } from './use-claim-verification';
import { ClaimErrorView } from './claim-error-view';

interface GetApprovalHandlerProps {
  action: WilActionItem;
  tenantId: string;
  onInteractionSuccess?: () => void;
  onRefresh?: () => void;
}

const ALLOWED_TAGS = [
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'p',
  'br',
  'hr',
  'ul',
  'ol',
  'li',
  'a',
  'strong',
  'em',
  'b',
  'i',
  'u',
  's',
  'code',
  'pre',
  'blockquote',
  'table',
  'thead',
  'tbody',
  'tr',
  'th',
  'td',
  'img',
  'span',
  'div',
];

const ALLOWED_ATTR = ['href', 'target', 'rel', 'alt', 'src', 'width', 'height', 'class', 'id', 'colspan', 'rowspan'];

const APPROVAL_HTML_CLASS = [
  'text-[0.95rem]',
  'leading-[1.55]',
  'text-[var(--bc-text)]',
  '[&_h1]:mb-[0.45rem]',
  '[&_h1]:mt-[0.9rem]',
  '[&_h1]:text-[1.35rem]',
  '[&_h1]:font-bold',
  '[&_h1]:leading-[1.25]',
  '[&_h1]:text-[var(--bc-text)]',
  '[&_h2]:mb-[0.45rem]',
  '[&_h2]:mt-[0.9rem]',
  '[&_h2]:text-[1.2rem]',
  '[&_h2]:font-bold',
  '[&_h2]:leading-[1.25]',
  '[&_h2]:text-[var(--bc-text)]',
  '[&_h3]:mb-[0.45rem]',
  '[&_h3]:mt-[0.9rem]',
  '[&_h3]:text-[1.05rem]',
  '[&_h3]:font-bold',
  '[&_h3]:leading-[1.25]',
  '[&_h3]:text-[var(--bc-text)]',
  '[&_h4]:mb-[0.45rem]',
  '[&_h4]:mt-[0.9rem]',
  '[&_h4]:text-[1.05rem]',
  '[&_h4]:font-bold',
  '[&_h4]:leading-[1.25]',
  '[&_h4]:text-[var(--bc-text)]',
  '[&_h5]:mb-[0.45rem]',
  '[&_h5]:mt-[0.9rem]',
  '[&_h5]:text-[1.05rem]',
  '[&_h5]:font-bold',
  '[&_h5]:leading-[1.25]',
  '[&_h5]:text-[var(--bc-text)]',
  '[&_h6]:mb-[0.45rem]',
  '[&_h6]:mt-[0.9rem]',
  '[&_h6]:text-[1.05rem]',
  '[&_h6]:font-bold',
  '[&_h6]:leading-[1.25]',
  '[&_h6]:text-[var(--bc-text)]',
  '[&_p]:my-2',
  '[&_ul]:my-2',
  '[&_ul]:list-disc',
  '[&_ul]:pl-6',
  '[&_ol]:my-2',
  '[&_ol]:list-decimal',
  '[&_ol]:pl-6',
  '[&_li]:my-1',
  '[&_blockquote]:my-3',
  '[&_blockquote]:border-l-4',
  '[&_blockquote]:border-[var(--bc-border)]',
  '[&_blockquote]:py-2',
  '[&_blockquote]:pl-4',
  '[&_blockquote]:text-[var(--bc-muted)]',
  '[&_code]:rounded',
  '[&_code]:bg-[var(--bc-surface)]',
  '[&_code]:px-1',
  '[&_code]:py-[0.1rem]',
  '[&_code]:font-mono',
  '[&_code]:text-[0.9em]',
  '[&_pre]:overflow-x-auto',
  '[&_pre]:rounded-md',
  '[&_pre]:bg-[var(--bc-surface)]',
  '[&_pre]:p-3',
  '[&_pre_code]:bg-transparent',
  '[&_pre_code]:p-0',
  '[&_a]:text-[var(--bc-link)]',
  '[&_a]:underline',
  '[&_a]:underline-offset-2',
  '[&_img]:h-auto',
  '[&_img]:max-w-full',
  '[&_table]:my-3',
  '[&_table]:w-full',
  '[&_table]:border-collapse',
  '[&_table]:border',
  '[&_table]:border-[var(--bc-border)]',
  '[&_th]:border',
  '[&_th]:border-[var(--bc-border)]',
  '[&_th]:bg-[var(--bc-surface)]',
  '[&_th]:p-3',
  '[&_th]:text-left',
  '[&_th]:align-top',
  '[&_th]:font-bold',
  '[&_td]:border',
  '[&_td]:border-[var(--bc-border)]',
  '[&_td]:p-3',
  '[&_td]:text-left',
  '[&_td]:align-top',
  '[&_hr]:my-4',
  '[&_hr]:border-0',
  '[&_hr]:border-t',
  '[&_hr]:border-[var(--bc-border)]',
].join(' ');

function sanitizeHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    ALLOW_DATA_ATTR: false,
    FORBID_ATTR: ['onerror', 'onclick', 'onload', 'onmouseover', 'onfocus', 'onblur'],
  });
}

export function GetApprovalHandler({
  action,
  tenantId,
  onInteractionSuccess,
  onRefresh,
}: Readonly<GetApprovalHandlerProps>) {
  const [clickedOption, setClickedOption] = useState<string | null>(null);
  const { claimError, setClaimError } = useClaimVerification({
    tenantId,
    actionId: action.id,
    actorType: action.actorType,
  });
  const queryClient = useQueryClient();
  const onInteractionSuccessRef = useRef(onInteractionSuccess);
  useEffect(() => {
    onInteractionSuccessRef.current = onInteractionSuccess;
  });

  const approvalMutation = useMutation({
    mutationFn: async (option: string) => {
      // Pre-submit claim verification for role/group actions
      const valid = await verifyClaimBeforeSubmit({
        tenantId,
        actionId: action.id,
        actorType: action.actorType,
        setClaimError,
      });
      if (!valid) throw new Error('Claim lost');
      return postWilCallback({ tenantId, actionId: action.id, body: { option } });
    },
    onSuccess: () => {
      onInteractionSuccessRef.current?.();
    },
    onError: () => {
      setClickedOption(null);
    },
  });

  const payload = action.payload as { html?: string; options?: string[] };
  const html = payload.html ?? '';
  const options = payload.options ?? [];

  function handleOptionClick(option: string) {
    setClickedOption(option);
    approvalMutation.mutate(option);
  }

  function handleRefresh() {
    queryClient.invalidateQueries({ queryKey: ['wil-actions'] });
    queryClient.invalidateQueries({ queryKey: ['wil-action-counts'] });
    onRefresh?.();
  }

  if (claimError) {
    return <ClaimErrorView message={claimError} onRefresh={handleRefresh} />;
  }

  return (
    <div className="flex flex-col gap-4 p-6">
      {html && <div className={APPROVAL_HTML_CLASS} dangerouslySetInnerHTML={{ __html: sanitizeHtml(html) }} />}

      <div aria-live="polite">
        {approvalMutation.isSuccess && (
          <div className="flex items-center gap-2 rounded-md bg-green-50 p-3 text-sm text-green-700">
            <IconCheck size={16} aria-hidden="true" />
            <span>Your response has been submitted.</span>
          </div>
        )}

        {approvalMutation.isError && (
          <p className="text-sm text-red-600" role="alert">
            {extractErrorMessage(approvalMutation.error, 'An unexpected error occurred. Please try again.')}
          </p>
        )}
      </div>

      {!approvalMutation.isSuccess && options.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {options.map((option) => (
            <Button
              key={option}
              variant="default"
              disabled={approvalMutation.isPending}
              onClick={() => handleOptionClick(option)}
            >
              {approvalMutation.isPending && clickedOption === option && (
                <IconLoader2 size={16} className="animate-spin" aria-hidden="true" />
              )}
              {option}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}
