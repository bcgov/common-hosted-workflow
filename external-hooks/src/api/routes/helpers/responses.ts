import type { Response } from 'express';
import type { ZodTypeAny } from 'zod';
import { parseValidatedResponse } from '../../utils/validation';

export function sendValidatedJson<T extends ZodTypeAny>(
  res: Response,
  statusCode: number,
  schema: T,
  payload: unknown,
) {
  res.status(statusCode).json(parseValidatedResponse(schema, payload));
}
