import type { Response } from 'express';
import { N8nUser } from '../types/user';

export type AuthRequest = {
  cookies?: Record<string, string | undefined>;
};

export type BaseAuthService = {
  invalidateToken(req: AuthRequest): Promise<void>;
  clearCookie(res: Response): void;
  resolveJwt(token: string, req: AuthRequest, res: Response): Promise<[N8nUser]>;
};

export class AuthService {
  constructor(private readonly impl: BaseAuthService) {}

  async invalidateToken(req: AuthRequest): Promise<void> {
    return this.impl.invalidateToken(req);
  }

  clearCookie(res: Response): void {
    return this.impl.clearCookie(res);
  }

  async resolveJwt(token: string, req: AuthRequest, res: Response) {
    return this.impl.resolveJwt(token, req, res);
  }
}
