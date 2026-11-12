import { describe, expect, it } from 'vitest';

import {
  PROJECT_ROLE_ADMIN,
  PROJECT_ROLE_EDITOR,
  PROJECT_ROLE_PERSONAL_OWNER,
  PROJECT_ROLE_VIEWER,
  getViewerRoleLabel,
} from '@/lib/roles';

describe('getViewerRoleLabel', () => {
  it('labels each known project role', () => {
    expect(getViewerRoleLabel(PROJECT_ROLE_ADMIN)).toBe('You are an admin');
    expect(getViewerRoleLabel(PROJECT_ROLE_EDITOR)).toBe('You are an editor');
    expect(getViewerRoleLabel(PROJECT_ROLE_VIEWER)).toBe('You are a viewer');
    expect(getViewerRoleLabel(PROJECT_ROLE_PERSONAL_OWNER)).toBe('You are the owner');
  });

  it('returns null for non-members and unknown slugs', () => {
    expect(getViewerRoleLabel(null)).toBeNull();
    expect(getViewerRoleLabel(undefined)).toBeNull();
    expect(getViewerRoleLabel('')).toBeNull();
    expect(getViewerRoleLabel('global:admin')).toBeNull();
  });
});
