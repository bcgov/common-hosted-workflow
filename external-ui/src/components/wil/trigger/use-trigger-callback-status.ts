import { useState } from 'react';
import type { ButtonCallbackStatus } from './trigger-button-result';

/**
 * Tracks which trigger's callback is currently in flight (for the list's spinner)
 * and the pending/success/error result of a button trigger's callback (for the detail pane).
 */
export function useTriggerCallbackStatus() {
  const [callbackTriggerId, setCallbackTriggerId] = useState<string | null>(null);
  const [buttonCallbackStatus, setButtonCallbackStatus] = useState<ButtonCallbackStatus>('idle');
  const [buttonCallbackError, setButtonCallbackError] = useState<Error | null>(null);

  function reset() {
    setButtonCallbackStatus('idle');
    setButtonCallbackError(null);
  }

  function start(triggerId: string) {
    setCallbackTriggerId(triggerId);
    setButtonCallbackStatus('pending');
    setButtonCallbackError(null);
  }

  function succeed() {
    setButtonCallbackStatus('success');
  }

  function fail(err: Error) {
    setButtonCallbackStatus('error');
    setButtonCallbackError(err);
  }

  function settle() {
    setCallbackTriggerId(null);
  }

  return { callbackTriggerId, buttonCallbackStatus, buttonCallbackError, reset, start, succeed, fail, settle };
}
