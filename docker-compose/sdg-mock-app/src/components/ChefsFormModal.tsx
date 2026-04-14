'use client';

import { useCallback, useEffect, useState } from 'react';
import { ChefsFormViewer } from '@/components/chefs';

interface ChefsFormModalProps {
  formId: string;
  formName?: string;
  token: string;
  onClose: () => void;
  onSubmitted: (detail: unknown) => void;
}

export default function ChefsFormModal({ formId, formName, token, onClose, onSubmitted }: ChefsFormModalProps) {
  const [submitStatus, setSubmitStatus] = useState<'idle' | 'sending' | 'success' | 'error'>('idle');

  // Close on Escape key
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  const handleSubmissionComplete = useCallback(
    (detail: unknown) => {
      setSubmitStatus('success');
      onSubmitted(detail);
    },
    [onSubmitted],
  );

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-start justify-center z-[1000] overflow-y-auto py-8"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-2xl w-full max-w-[960px] mx-4 relative"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <span className="font-semibold text-base text-gray-900">{formName || 'CHEFS Form'}</span>
            <span className="text-xs bg-blue-50 text-blue-600 px-2 py-0.5 rounded font-mono">{formId}</span>
          </div>
          <div className="flex items-center gap-2">
            {submitStatus === 'success' && <span className="text-sm text-green-600">✓ Submitted</span>}
            {submitStatus === 'error' && <span className="text-sm text-red-500">✗ Error</span>}
            <button
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-md border border-gray-300 bg-white text-gray-500 hover:bg-gray-100 cursor-pointer text-lg"
              aria-label="Close form"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Form body */}
        <div className="p-6">
          <ChefsFormViewer
            formId={formId}
            authToken={token}
            onSubmissionComplete={handleSubmissionComplete}
            onSubmissionError={(err) => {
              console.error('Form submission error:', err);
              setSubmitStatus('error');
            }}
            onFormReady={() => console.log('Form ready')}
          />
        </div>
      </div>
    </div>
  );
}
