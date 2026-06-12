import { useEffect, useState } from 'react';
import type { ScriptStatus } from './types';

const DEFAULT_BASE_URL = 'https://submit.digital.gov.bc.ca/app';

export function useChefsScript(baseUrl = DEFAULT_BASE_URL): ScriptStatus {
  const scriptUrl = `${baseUrl}/embed/chefs-form-viewer.min.js`;

  const [status, setStatus] = useState<ScriptStatus>(() => {
    if (typeof document === 'undefined') return 'idle';
    const existing = document.querySelector(`script[src="${scriptUrl}"]`) as HTMLScriptElement | null;
    if (!existing) return 'idle';
    return existing.dataset.status === 'ready' ? 'ready' : 'loading';
  });

  useEffect(() => {
    const existing = document.querySelector(`script[src="${scriptUrl}"]`) as HTMLScriptElement | null;

    if (existing?.dataset.status === 'ready') {
      // Script already loaded — state was set via initializer or prior render
      return;
    }

    const script =
      existing ??
      (() => {
        const el = document.createElement('script');
        el.src = scriptUrl;
        el.async = true;
        el.dataset.status = 'loading';
        document.head.appendChild(el);
        return el;
      })();

    const onLoad = () => {
      script.dataset.status = 'ready';
      setStatus('ready');
    };
    const onError = () => {
      script.dataset.status = 'error';
      setStatus('error');
    };

    script.addEventListener('load', onLoad);
    script.addEventListener('error', onError);

    return () => {
      script.removeEventListener('load', onLoad);
      script.removeEventListener('error', onError);
    };
  }, [scriptUrl]);

  return status;
}
