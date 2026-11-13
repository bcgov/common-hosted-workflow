'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.UserService = void 0;
class UserService {
  impl;
  constructor(impl) {
    this.impl = impl;
  }
  async changeUserRole(user, options) {
    return this.impl.changeUserRole(user, options);
  }
}
exports.UserService = UserService;
