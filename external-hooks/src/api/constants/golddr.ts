/** Identifies GoldDR refusals so callers can distinguish them from other 503 responses. */
export const GOLDDR_MAINTENANCE_CODE = 'GOLDDR_MAINTENANCE';

/** Message returned when writes to WIL or custom integrations are refused on GoldDR. */
export const GOLDDR_WRITE_MESSAGE =
  'This service is in maintenance mode while running on the DR site. Please try again later.';

/** Message returned when workflow or credential changes are refused on GoldDR. */
export const GOLDDR_EDIT_MESSAGE =
  'Workflows and credentials cannot be changed while this service runs on the DR site. Make changes on the primary site.';
