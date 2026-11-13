'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.AuthService = void 0;
class AuthService {
  impl;
  constructor(impl) {
    this.impl = impl;
  }
  async invalidateToken(req) {
    return this.impl.invalidateToken(req);
  }
  clearCookie(res) {
    return this.impl.clearCookie(res);
  }
  async resolveJwt(token, req, res) {
    return this.impl.resolveJwt(token, req, res);
  }
}
exports.AuthService = AuthService;
