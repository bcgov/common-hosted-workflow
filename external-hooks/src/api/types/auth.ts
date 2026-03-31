import type { NextFunction, Request, Response } from 'express';
import type { User } from './user';

/** Express `next`; pass `AppError` (or any `err`) to invoke the centralized error handler. */
export type ExpressNext = NextFunction;

/** Request used by auth/tenant middleware (augmented via `types/express-context.d.ts`). */
export type AuthRequest = Request;

/** Response used by auth/tenant middleware (locals also augmented). */
export type AuthResponse = Response;

export type ApiKeyService = {
  getUserForApiKey: (token: string) => Promise<User>;
};

export interface AuthMiddlewareConfig {
  apiKeyService: ApiKeyService;
  globalOwnerRoleSlug: string;
  globalAdminRoleSlug: string;
}
