import { useEffect, useState } from 'react';
import type { ScriptStatus } from './types';

const SCRIPT_URL = 'https://chefs-dev.apps.silver.devops.gov.bc.ca/app/embed/chefs-form-viewer.min.js';

export function useChefsScript(): ScriptStatus {
  const [status, setStatus] = useState<ScriptStatus>(() => {
    if (typeof document === 'undefined') return 'idle';
    const existing = document.querySelector(`script[src="${SCRIPT_URL}"]`) as HTMLScriptElement | null;
    if (!existing) return 'idle';
    // Script tag exists — check if it already loaded
    return existing.dataset.status === 'ready' ? 'ready' : 'loading';
  });

  useEffect(() => {
    console.log('[useChefsScript] Hook running, current status:', status);
    let script = document.querySelector(`script[src="${SCRIPT_URL}"]`) as HTMLScriptElement | null;

    if (script?.dataset.status === 'ready') {
      console.log('[useChefsScript] Script already loaded');
      setStatus('ready');
      return;
    }

    if (!script) {
      console.log('[useChefsScript] Injecting script tag:', SCRIPT_URL);
      script = document.createElement('script');
      script.src = SCRIPT_URL;
      script.async = true;
      script.dataset.status = 'loading';
      document.head.appendChild(script);
    }

    setStatus('loading');

    const onLoad = () => {
      console.log('[useChefsScript] Script loaded successfully');
      script!.dataset.status = 'ready';
      setStatus('ready');
    };
    const onError = () => {
      console.error('[useChefsScript] Script failed to load');
      script!.dataset.status = 'error';
      setStatus('error');
    };

    script.addEventListener('load', onLoad);
    script.addEventListener('error', onError);

    return () => {
      script!.removeEventListener('load', onLoad);
      script!.removeEventListener('error', onError);
    };
  }, []);

  return status;
}
