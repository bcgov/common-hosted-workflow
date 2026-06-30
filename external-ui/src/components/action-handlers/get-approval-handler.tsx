import { useEffect, useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import DOMPurify from 'dompurify';
import { IconLoader2, IconCheck } from '@tabler/icons-react';
import { Button } from '@/components/ui/button';
import { postWilCallback } from '../../services/backend/wil';
import type { WilActionItem } from '../../services/backend/wil';
import { extractErrorMessage } from '../shared/error-utils';

interface GetApprovalHandlerProps {
  action: WilActionItem;
  tenantId: string;
  onInteractionSuccess?: () => void;
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

function sanitizeHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    ALLOW_DATA_ATTR: false,
    FORBID_ATTR: ['onerror', 'onclick', 'onload', 'onmouseover', 'onfocus', 'onblur'],
  });
}

export function GetApprovalHandler({ action, tenantId, onInteractionSuccess }: Readonly<GetApprovalHandlerProps>) {
  const [clickedOption, setClickedOption] = useState<string | null>(null);
  const onInteractionSuccessRef = useRef(onInteractionSuccess);
  useEffect(() => {
    onInteractionSuccessRef.current = onInteractionSuccess;
  });

  const approvalMutation = useMutation({
    mutationFn: (option: string) => postWilCallback({ tenantId, actionId: action.id, body: { option } }),
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

  return (
    <div className="flex flex-col gap-4 p-6">
      {html && (
        <div
          className="prose prose-sm max-w-none text-[var(--bc-text)]"
          dangerouslySetInnerHTML={{ __html: sanitizeHtml(html) }}
        />
      )}

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
