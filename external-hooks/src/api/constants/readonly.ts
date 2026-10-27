/** Identifies read-only refusals so callers can distinguish them from other 503 responses. */
export const READONLY_MAINTENANCE_CODE = 'READONLY_MODE';

/** Message returned when writes to WIL or custom integrations are refused in read-only mode. */
export const READONLY_WRITE_MESSAGE = 'This service is in read-only mode. Please try again later.';

/** Message returned when workflow or credential changes are refused in read-only mode. */
export const READONLY_EDIT_MESSAGE =
  'Workflows and credentials cannot be changed while this service is in read-only mode.';
