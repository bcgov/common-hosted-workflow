export type BaseJwtService = {
  sign: (payload: { id: string; hash: string; usedMfa: boolean }, options: { expiresIn: string }) => string;
};

export class JwtService {
  constructor(private readonly impl: BaseJwtService) {}

  sign(payload: { id: string; hash: string; usedMfa: boolean }, options: { expiresIn: string }): string {
    return this.impl.sign(payload, options);
  }
}
