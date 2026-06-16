import { useState } from 'react';
import axios from 'axios';
import DOMPurify from 'dompurify';
import { IconLoader2, IconCheck } from '@tabler/icons-react';
import { Button } from '@/components/ui/button';
import { postWilCallback } from '../../services/backend/wil';
import type { WilActionItem } from '../../services/backend/wil';

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

function extractErrorMessage(err: unknown, fallback: string): string {
  if (axios.isAxiosError(err)) {
    const serverMessage =
      (err.response?.data as { error?: { message?: string } } | undefined)?.error?.message ??
      (err.response?.data as { message?: string } | undefined)?.message;
    return serverMessage ?? fallback;
  }
  if (err instanceof Error) return err.message;
  return fallback;
}

export function GetApprovalHandler({ action, tenantId, onInteractionSuccess }: Readonly<GetApprovalHandlerProps>) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [clickedOption, setClickedOption] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const payload = action.payload as { html?: string; options?: string[] };
  const html = payload.html ?? '';
  const options = payload.options ?? [];

  async function handleOptionClick(option: string) {
    setIsSubmitting(true);
    setClickedOption(option);
    setErrorMessage(null);

    try {
      await postWilCallback({ tenantId, actionId: action.id, body: { option } });
      setIsSuccess(true);
      onInteractionSuccess?.();
    } catch (err: unknown) {
      const message = extractErrorMessage(err, 'An unexpected error occurred. Please try again.');
      setErrorMessage(message);
      setIsSubmitting(false);
      setClickedOption(null);
    }
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
        {isSuccess && (
          <div className="flex items-center gap-2 rounded-md bg-green-50 p-3 text-sm text-green-700">
            <IconCheck size={16} aria-hidden="true" />
            <span>Your response has been submitted.</span>
          </div>
        )}

        {errorMessage && (
          <p className="text-sm text-red-600" role="alert">
            {errorMessage}
          </p>
        )}
      </div>

      {!isSuccess && options.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {options.map((option) => (
            <Button key={option} variant="default" disabled={isSubmitting} onClick={() => handleOptionClick(option)}>
              {isSubmitting && clickedOption === option && (
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
