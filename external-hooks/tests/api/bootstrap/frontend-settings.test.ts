import { describe, expect, it } from 'vitest';
import { applyReadOnlyFrontendSettings, type FrontendSettings } from '../../../src/api/bootstrap/frontend-settings';

describe('applyReadOnlyFrontendSettings', () => {
  it('switches the editor autosave off in read-only mode', () => {
    const settings: FrontendSettings = { workflowsAutosaveDisabled: false };

    applyReadOnlyFrontendSettings(settings, true);

    expect(settings.workflowsAutosaveDisabled).toBe(true);
  });

  it('leaves the settings alone on Gold', () => {
    const settings: FrontendSettings = { workflowsAutosaveDisabled: false };

    applyReadOnlyFrontendSettings(settings, false);

    expect(settings.workflowsAutosaveDisabled).toBe(false);
  });
});
