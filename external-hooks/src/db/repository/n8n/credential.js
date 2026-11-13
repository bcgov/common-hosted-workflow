"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CredentialRepository = void 0;
class CredentialRepository {
    credentialRepository;
    constructor(credentialRepository) {
        this.credentialRepository = credentialRepository;
    }
    get metadata() {
        return this.credentialRepository.metadata;
    }
    async findOneBy(where) {
        return await this.credentialRepository.findOneBy(where);
    }
}
exports.CredentialRepository = CredentialRepository;
