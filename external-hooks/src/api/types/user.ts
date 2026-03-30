export interface Scope {
  slug: string;
  displayName: string;
  description: string | null;
}

export interface Role {
  updatedAt: string;
  createdAt: string;
  slug: string;
  displayName: string;
  description: string;
  systemRole: boolean;
  roleType: string;
  scopes: Scope[];
}

export interface User {
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
  role: Role;
  isPending: boolean;
}
