import { UserManager, WebStorageStateStore } from 'oidc-client-ts';
import { getOidcRuntimeConfig } from '../services/backend/oidc';

const { issuer: authority, clientId, redirectUri, postLogoutRedirectUri, scopes } = getOidcRuntimeConfig();

export const userManager = new UserManager({
  authority,
  client_id: clientId,
  redirect_uri: redirectUri,
  post_logout_redirect_uri: postLogoutRedirectUri,
  response_type: 'code',
  scope: scopes,
  userStore: new WebStorageStateStore({ store: window.sessionStorage }),
  automaticSilentRenew: true,
  monitorSession: true,
});
