"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
async function loadConfig() {
    vitest_1.vi.resetModules();
    return Promise.resolve().then(() => __importStar(require('../src/config')));
}
(0, vitest_1.describe)('GoldDR detection from CLUSTER', () => {
    (0, vitest_1.afterEach)(() => {
        vitest_1.vi.unstubAllEnvs();
    });
    (0, vitest_1.it)('is GoldDR when CLUSTER=golddr, ignoring case and whitespace', async () => {
        vitest_1.vi.stubEnv('CLUSTER', '  GoldDR ');
        const config = await loadConfig();
        (0, vitest_1.expect)(config.CLUSTER).toBe('golddr');
        (0, vitest_1.expect)(config.READONLY_MODE).toBe(true);
    });
    vitest_1.it.each(['gold', '', 'golddr-test'])('is not GoldDR when CLUSTER is "%s"', async (value) => {
        vitest_1.vi.stubEnv('CLUSTER', value);
        const config = await loadConfig();
        (0, vitest_1.expect)(config.READONLY_MODE).toBe(false);
    });
    (0, vitest_1.it)('is not GoldDR when CLUSTER is unset', async () => {
        vitest_1.vi.stubEnv('CLUSTER', undefined);
        const config = await loadConfig();
        (0, vitest_1.expect)(config.CLUSTER).toBe('');
        (0, vitest_1.expect)(config.READONLY_MODE).toBe(false);
    });
});
