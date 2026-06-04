import type { Response } from 'express';
import { requireChwfAllowedProjectIds } from '../../services/project-access';

export function getTenantScopedProjectIds(
  res: Response,
  routeLabel: string,
  logDomain: 'messages' | 'actions',
): string[] {
  return requireChwfAllowedProjectIds(res, routeLabel, logDomain);
}
