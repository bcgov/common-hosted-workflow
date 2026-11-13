'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
const vitest_1 = require('vitest');
const frontend_settings_1 = require('../../../src/api/bootstrap/frontend-settings');
(0, vitest_1.describe)('applyReadOnlyFrontendSettings', () => {
  (0, vitest_1.it)('switches the editor autosave off in read-only mode', () => {
    const settings = { workflowsAutosaveDisabled: false };
    (0, frontend_settings_1.applyReadOnlyFrontendSettings)(settings, true);
    (0, vitest_1.expect)(settings.workflowsAutosaveDisabled).toBe(true);
  });
  (0, vitest_1.it)('leaves the settings alone on Gold', () => {
    const settings = { workflowsAutosaveDisabled: false };
    (0, frontend_settings_1.applyReadOnlyFrontendSettings)(settings, false);
    (0, vitest_1.expect)(settings.workflowsAutosaveDisabled).toBe(false);
  });
});
