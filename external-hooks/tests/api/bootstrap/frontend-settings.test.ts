import { describe, expect, it } from 'vitest';
import { applyGoldDrFrontendSettings, type FrontendSettings } from '../../../src/api/bootstrap/frontend-settings';

describe('applyGoldDrFrontendSettings', () => {
  it('switches the editor autosave off on GoldDR', () => {
    const settings: FrontendSettings = { workflowsAutosaveDisabled: false };

    applyGoldDrFrontendSettings(settings, true);

    expect(settings.workflowsAutosaveDisabled).toBe(true);
  });

  it('leaves the settings alone on Gold', () => {
    const settings: FrontendSettings = { workflowsAutosaveDisabled: false };

    applyGoldDrFrontendSettings(settings, false);

    expect(settings.workflowsAutosaveDisabled).toBe(false);
  });
});
