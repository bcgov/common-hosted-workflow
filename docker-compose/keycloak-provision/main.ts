import waitOn from 'wait-on';
import KeycloakAdminClientFluent from '@egose/keycloak-fluent';
import {
  KEYCLOAK_URL,
  MASTER_ADMIN,
  MASTER_ADMIN_PASSWORD,
  AUTH_REALM_NAME,
  AUTH_CLIENT_ID,
  AUTH_CLIENT_SECRET,
} from './config.js';

async function main() {
  console.log('Starting Keycloak Provision...');

  // Wait for Keycloak to be ready
  await waitOn({
    resources: [`${KEYCLOAK_URL}/realms/master/.well-known/openid-configuration`],
    delay: 500,
    window: 5000,
  });

  const kc = new KeycloakAdminClientFluent({ baseUrl: KEYCLOAK_URL, realmName: 'master' });
  await kc.simpleAuth({
    username: MASTER_ADMIN,
    password: MASTER_ADMIN_PASSWORD,
    clientId: 'admin-cli',
  });

  console.log('Creating test realm...');
  const authRealmHandle = await kc.realm(AUTH_REALM_NAME).ensure({ displayName: AUTH_REALM_NAME });

  console.log('Creating test auth client...');
  const authClientHandle = await authRealmHandle.confidentialBrowserLoginClient(AUTH_CLIENT_ID).ensure({
    secret: AUTH_CLIENT_SECRET,
  });

  await authClientHandle.protocolMapper('client-roles').ensure({
    protocol: 'openid-connect',
    protocolMapper: 'oidc-usermodel-client-role-mapper',
    config: {
      'usermodel.clientRoleMapping.clientId': '',
      'usermodel.clientRoleMapping.rolePrefix': '',
      multivalued: 'true',
      'claim.name': 'client_roles',
      'jsonType.label': 'String',
      'id.token.claim': 'true',
      'access.token.claim': 'true',
      'lightweight.claim': 'false',
      'userinfo.token.claim': 'true',
      'introspection.token.claim': 'true',
    },
  });

  const globalAdminRoleHandle = await authClientHandle.role('global:admin').ensure({});
  const globalMemberRoleHandle = await authClientHandle.role('global:member').ensure({});

  console.log('Creating test users...');
  const users = [
    { firstName: 'Admin', lastName: 'User', roleHandle: globalAdminRoleHandle },
    { firstName: 'John', lastName: 'Doe', roleHandle: globalMemberRoleHandle },
    { firstName: 'Jane', lastName: 'Smith', roleHandle: globalMemberRoleHandle },
    { firstName: 'Michael', lastName: 'Brown', roleHandle: globalMemberRoleHandle },
    { firstName: 'Emily', lastName: 'Johnson', roleHandle: globalMemberRoleHandle },
    { firstName: 'Daniel', lastName: 'Wilson', roleHandle: globalMemberRoleHandle },
    { firstName: 'Olivia', lastName: 'Martinez', roleHandle: null },
    { firstName: 'David', lastName: 'Anderson', roleHandle: null },
    { firstName: 'Sophia', lastName: 'Taylor', roleHandle: null },
    { firstName: 'James', lastName: 'Thomas', roleHandle: null },
    { firstName: 'Isabella', lastName: 'Moore', roleHandle: null },
  ];

  for (const user of users) {
    const email = `${user.firstName.toLowerCase()}.${user.lastName.toLowerCase()}@testapp.com`;

    const userHandle = await authRealmHandle.user(email).ensure({
      email,
      password: email, // pragma: allowlist secret
      firstName: user.firstName,
      lastName: user.lastName,
    });

    if (user.roleHandle) {
      userHandle.assignClientRole(user.roleHandle);
    }
  }
  console.log('Provision complete!');
}

main().catch(console.error);
