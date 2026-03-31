import { NextFunction, Request, Response } from 'express';
import { z, ZodError, ZodTypeAny } from 'zod';
import { AppError } from './errors';

/** Returns Express middleware that validates `body`, `query`, and `params` against a Zod schema. */
export const createRequestSchemaValidator =
  <T extends ZodTypeAny>(schema: T) =>
  (req: Request, _res: Response, next: NextFunction) => {
    try {
      schema.parse({
        body: req.body,
        query: req.query,
        params: req.params,
      });
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const message = error.issues.map((i) => `${i.path.join('.')} is ${i.message}`).join(', ');
        return next(new AppError(400, message));
      }
      return next(error);
    }
  };

export const parseValidatedRequest = <T extends ZodTypeAny>(schema: T, req: Request): z.infer<T> =>
  schema.parse({
    body: req.body,
    query: req.query,
    params: req.params,
  });

/** Ensures handler output matches a Zod schema before sending (fails fast on contract drift). */
export const parseValidatedResponse = <T extends ZodTypeAny>(schema: T, payload: unknown): z.infer<T> => {
  try {
    return schema.parse(payload);
  } catch (error) {
    if (error instanceof ZodError) {
      const message = error.issues.map((i) => `${i.path.join('.')} is ${i.message}`).join(', ');
      throw new AppError(500, `Response validation failed: ${message}`);
    }
    throw error;
  }
};
