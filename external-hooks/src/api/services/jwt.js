'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.JwtService = void 0;
class JwtService {
  impl;
  constructor(impl) {
    this.impl = impl;
  }
  sign(purpose, payload, options) {
    return this.impl.sign(purpose, payload, options);
  }
}
exports.JwtService = JwtService;
