import type { NextFunction, Request, Response } from 'express';
import type { UserRepository } from '../../db/repository/n8n/user';

/** Express `next`; pass `AppError` (or any `err`) to invoke the centralized error handler. */
export type ExpressNext = NextFunction;

/** Request used by auth/tenant middleware (augmented via `types/express-context.d.ts`). */
export type AuthRequest = Request;

/** Response used by auth/tenant middleware (locals also augmented). */
export type AuthResponse = Response;

export interface AuthMiddlewareConfig {
  userRepository: UserRepository;
  globalOwnerRoleSlug: string;
  globalAdminRoleSlug: string;
}
