import type { Response } from 'express';
import { requireChwfAllowedProjectIds } from '../../helpers/n8n-validation';

export function getTenantScopedProjectIds(
  res: Response,
  routeLabel: string,
  logDomain: 'messages' | 'actions',
): string[] {
  return requireChwfAllowedProjectIds(res, routeLabel, logDomain);
}
