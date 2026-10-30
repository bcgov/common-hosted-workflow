// n8n's JwtService.sign signature changed in n8n 2.45.x (service moved to @n8n/backend-services):
// it now takes a leading `purpose` that it maps to the token's `aud` claim internally
// (TOKEN_PURPOSES[purpose]). Omitting it yields `aud: undefined`, which makes jsonwebtoken throw
// `"audience" must be a string or array`. The browser auth cookie uses the 'session' purpose.
type TokenPurpose = 'session';

type JwtPayload = { id: string; hash: string; usedMfa: boolean };

export type BaseJwtService = {
  sign: (purpose: TokenPurpose, payload: JwtPayload, options: { expiresIn: string }) => string;
};

export class JwtService {
  constructor(private readonly impl: BaseJwtService) {}

  sign(purpose: TokenPurpose, payload: JwtPayload, options: { expiresIn: string }): string {
    return this.impl.sign(purpose, payload, options);
  }
}
