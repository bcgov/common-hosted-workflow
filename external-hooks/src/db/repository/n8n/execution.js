"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ExecutionRepository = void 0;
class ExecutionRepository {
    executionRepository;
    constructor(executionRepository) {
        this.executionRepository = executionRepository;
    }
    get metadata() {
        return this.executionRepository.metadata;
    }
    async findSingleExecution(id, options) {
        return await this.executionRepository.findSingleExecution(id, options);
    }
    /** Loads an execution with its run data, or `null` if not found / unreadable. */
    async findWithData(id) {
        try {
            return (await this.findSingleExecution(id, { includeData: true, unflattenData: true })) ?? null;
        }
        catch {
            return null;
        }
    }
    /**
     * Loads execution metadata, or `null` if not found or if `findSingleExecution` throws
     * (e.g. Postgres `22P02` for malformed ids).
     */
    async loadMetadataOrNull(id) {
        try {
            const execution = await this.findSingleExecution(id, {
                includeData: false,
                unflattenData: false,
            });
            return execution ?? null;
        }
        catch {
            return null;
        }
    }
}
exports.ExecutionRepository = ExecutionRepository;
