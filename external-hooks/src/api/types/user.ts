export interface N8nScope {
  slug: string;
  displayName: string;
  description: string | null;
}

export interface N8nRole {
  updatedAt: string;
  createdAt: string;
  slug: string;
  displayName: string;
  description: string;
  systemRole: boolean;
  roleType: string;
  scopes: N8nScope[];
}

export interface N8nUser {
  updatedAt: string;
  createdAt: string;
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  personalizationAnswers: unknown;
  settings: {
    userActivated: boolean;
    easyAIWorkflowOnboarded: boolean;
  };
  disabled: boolean;
  mfaEnabled: boolean;
  lastActiveAt: string;
  role: N8nRole | null;
  isPending: boolean;
}
