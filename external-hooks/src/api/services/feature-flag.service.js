"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FeatureFlagService = void 0;
const feature_flag_1 = require("../constants/feature-flag");
class FeatureFlagService {
    flags;
    constructor(flagRegistry = feature_flag_1.FEATURE_FLAG_REGISTRY) {
        this.flags = { ...flagRegistry };
    }
    isFeatureEnabled(flagName) {
        return Object.prototype.hasOwnProperty.call(this.flags, flagName) ? this.flags[flagName] : false;
    }
    getAllFlags() {
        return { ...this.flags };
    }
}
exports.FeatureFlagService = FeatureFlagService;
