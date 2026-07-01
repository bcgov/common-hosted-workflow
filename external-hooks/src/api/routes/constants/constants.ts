/** Timeout (ms) for outbound webhook / callback HTTP requests. */
export const CALLBACK_TIMEOUT_MS = 30_000;

/** Role required to create, edit, or delete triggers on a non-personal project. */
export const TRIGGER_MANAGE_ROLE = 'project:editor';

/** Generic user-facing message returned when a trigger's upstream webhook fails. */
export const TRIGGER_FAILED_MESSAGE = 'Unable to trigger the workflow. Please try again or contact your administrator.';
